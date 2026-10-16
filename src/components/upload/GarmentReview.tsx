import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { analysePhotoAt } from '../../features/garments/analyse-photo'
import { suggestGarmentName } from '../../features/garments/garment.colors'
import type { GarmentDetails, PreparedPhoto } from '../../features/garments/garment.service'
import { getRenderability } from '../../features/garments/garment.templates'
import {
  GARMENT_CATEGORIES,
  GARMENT_CATEGORY_LABELS,
  type GarmentCategory,
} from '../../features/garments/garment.types'
import { PhotoMappingError, type PhotoAnalysis } from '../../features/garments/photo-analysis'
import {
  analysisTemplateFor,
  reviewWarnings,
  SEPARATION_RANGE,
  templateFor,
  type Sleeves,
} from '../../features/garments/upload-review'
import { loadPhotoPixels } from '../../lib/image-processing'
import { SeparationPreview } from './SeparationPreview'

/** How long the slider must rest before the photo is analysed again. */
const SETTLE_MS = 300

type AnalysisResult =
  | { key: string; analysis: PhotoAnalysis }
  | { key: string; error: string; noGarment: boolean }

const CATEGORY_OPTIONS = GARMENT_CATEGORIES.map((category) => ({
  value: category,
  label: GARMENT_CATEGORY_LABELS[category].one,
}))

const SLEEVE_OPTIONS: { value: Sleeves; label: string }[] = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]

function ChoiceChips<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-full bg-mist px-3.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-line has-checked:bg-ink has-checked:text-cream has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface GarmentReviewProps {
  photo: Pick<PreparedPhoto, 'url'>
  onChooseAnother: () => void
  onAdd: (details: GarmentDetails, analysis: PhotoAnalysis) => Promise<void>
}

/**
 * The second upload step: shows how the garment separated from its
 * background, and asks what it is and what to call it.
 */
export function GarmentReview({ photo, onChooseAnother, onAdd }: GarmentReviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const nameId = useId()
  const sliderId = useId()
  const sliderHintId = useId()
  const [category, setCategory] = useState<GarmentCategory>('shirt')
  const [sleeves, setSleeves] = useState<Sleeves>('long')
  const [tolerance, setTolerance] = useState(SEPARATION_RANGE.initial)
  const [settledTolerance, setSettledTolerance] = useState(tolerance)
  /** Null until the person edits the name; until then it follows the suggestion. */
  const [name, setName] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const templateId = templateFor(category, sleeves)
  const analysisTemplate = analysisTemplateFor(templateId)
  const key = `${analysisTemplate}|${settledTolerance}|${photo.url}`

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Analyse again once the slider comes to rest, not at every step it passes.
  useEffect(() => {
    if (tolerance === settledTolerance) return
    const timer = setTimeout(() => setSettledTolerance(tolerance), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [tolerance, settledTolerance])

  useEffect(() => {
    let cancelled = false
    analysePhotoAt(photo.url, loadPhotoPixels, analysisTemplate, settledTolerance)
      .then((analysis) => {
        if (!cancelled) setResult({ key, analysis })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult({
          key,
          error: error instanceof Error ? error.message : 'Something went wrong while reading the photo.',
          noGarment: error instanceof PhotoMappingError,
        })
      })
    return () => {
      cancelled = true
    }
  }, [key, photo.url, analysisTemplate, settledTolerance])

  const current = result?.key === key ? result : null
  const analysis = current && 'analysis' in current ? current.analysis : null
  const failure = current && 'error' in current ? current : null
  // While a fresh analysis runs, keep showing the last one rather than an empty frame.
  const shown = result && 'analysis' in result ? result.analysis : null
  const pending = !current || tolerance !== settledTolerance
  const suggestion = suggestGarmentName(shown?.palette[0], category, templateId)
  const renderability = getRenderability({ category, templateId })
  const warnings = analysis && !pending ? reviewWarnings(analysis, templateId) : []

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!analysis || pending || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await onAdd(
        {
          name: (name ?? suggestion).trim() || suggestion,
          category,
          templateId,
          backgroundTolerance: settledTolerance,
        },
        analysis,
      )
    } catch {
      setSaving(false)
      setSaveError("Couldn't add this piece. Please try again.")
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby={headingId} className="flex min-h-full flex-col">
      <div className="flex-1 p-5 sm:p-6">
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">
          Check how it came out
        </h3>
        <p className="mt-0.5 text-xs text-muted">The faded parts of the photo count as background.</p>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <figure className="self-start">
            <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-xl bg-mist">
              {shown ? (
                <SeparationPreview
                  analysis={shown}
                  showMapping={templateId !== null}
                  className={`h-full w-full object-contain transition ${pending ? 'opacity-60' : ''}`}
                />
              ) : (
                <img src={photo.url} alt="" className="h-full w-full object-contain opacity-60" />
              )}
              {pending && (
                <span
                  role="status"
                  className="absolute inset-x-0 bottom-3 mx-auto flex w-max items-center gap-2 rounded-full bg-surface/90 px-3 py-1.5 text-xs text-ink-soft shadow-sm ring-1 ring-line"
                >
                  <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" />
                  Finding the garment…
                </span>
              )}
            </div>
            {templateId && shown && (
              <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border-2 border-dashed border-tan" />
                  Front of the mannequin
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border-2 border-espresso" />
                  {templateId === 'trousers-straight' ? 'Fabric for the back' : 'Fabric for the back and sleeves'}
                </span>
              </figcaption>
            )}
          </figure>

          <div className="flex flex-col gap-5">
            <div>
              <label htmlFor={nameId} className="text-sm font-semibold">
                Name
              </label>
              <input
                id={nameId}
                value={name ?? suggestion}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                autoComplete="off"
                className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </div>

            <ChoiceChips legend="What is it?" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
            {category === 'shirt' && (
              <ChoiceChips legend="Sleeves" options={SLEEVE_OPTIONS} value={sleeves} onChange={setSleeves} />
            )}
            {!renderability.renderable && (
              <p role="note" className="rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
                {renderability.reason} It goes in your wardrobe but won't show on the mannequin.
              </p>
            )}

            <div>
              <label htmlFor={sliderId} className="text-sm font-semibold">
                Background removal
              </label>
              <input
                id={sliderId}
                type="range"
                min={SEPARATION_RANGE.min}
                max={SEPARATION_RANGE.max}
                step={SEPARATION_RANGE.step}
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
                aria-describedby={sliderHintId}
                className="mt-3 w-full accent-ink"
              />
              <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-muted">
                <span>Keep more</span>
                <span>Remove more</span>
              </div>
              <p id={sliderHintId} className="mt-2 text-xs leading-relaxed text-muted">
                Background showing around the garment? Slide right. Parts of the garment missing? Slide left.
              </p>
            </div>

            {failure && (
              <div role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
                <p className="font-medium">{failure.error}</p>
                {failure.noGarment && (
                  <p className="mt-1">Try sliding towards "Keep more", or choose a photo with a plainer background.</p>
                )}
              </div>
            )}
            <div aria-live="polite" className="space-y-2">
              {warnings.map((warning) => (
                <p key={warning} className="rounded-lg bg-sand px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  {warning}
                </p>
              ))}
            </div>
            {saveError && (
              <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                {saveError}
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={onChooseAnother}
          disabled={saving}
          aria-label="Choose another photo"
          className="rounded-full px-3 py-2.5 text-sm font-medium whitespace-nowrap text-ink-soft transition hover:bg-sand hover:text-ink disabled:opacity-50 sm:px-4"
        >
          {/* A shorter label keeps both buttons on one line on narrow phones. */}
          <span className="sm:hidden">Another photo</span>
          <span className="hidden sm:inline">Choose another photo</span>
        </button>
        <button
          type="submit"
          disabled={!analysis || pending || saving}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-cream transition hover:bg-cocoa disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add to wardrobe'}
        </button>
      </footer>
    </form>
  )
}
