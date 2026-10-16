import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { PhotoIcon } from '../ui/icons'

/** The photo contract from the Milestone 2 trial: photos like this map onto the mannequin well. */
const PHOTO_RULES = [
  { title: 'One garment, facing forward', detail: 'The whole piece in frame, front side up.' },
  { title: 'Laid flat or on a hanger', detail: 'Not folded, bunched up or worn.' },
  { title: 'A plain background', detail: 'A wall, sheet or floor in a colour that stands apart from the garment.' },
  { title: 'Nothing else in the shot', detail: 'No hands, bags or other clothes.' },
]

/** iPhones hand over HEIC photos as JPEG when the picker doesn't ask for HEIC. */
const ACCEPT = 'image/jpeg,image/png,image/webp'

interface PhotoPickerProps {
  onPhoto: (file: File) => void
  /** True while a chosen photo is being checked. */
  busy: boolean
  error?: string
  /** Move focus to "Choose a photo", e.g. when coming back from a later step. */
  autoFocus?: boolean
}

/** The first upload step: how to take a photo that works, and a place to drop or choose one. */
export function PhotoPicker({ onPhoto, busy, error, autoFocus = false }: PhotoPickerProps) {
  const rulesId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (autoFocus && !busy) inputRef.current?.focus()
  }, [autoFocus, busy])

  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !busy) onPhoto(file)
  }

  return (
    <div className="grid gap-6 p-5 sm:grid-cols-[1fr_1.15fr] sm:p-6">
      <section aria-labelledby={rulesId}>
        <h3 id={rulesId} className="text-sm font-semibold">
          For the best fit on the mannequin
        </h3>
        <ol className="mt-4 space-y-4">
          {PHOTO_RULES.map((rule, index) => (
            <li key={rule.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-sand text-xs font-semibold text-ink"
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{rule.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{rule.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div
        role="group"
        aria-label="Add a photo"
        onDragOver={(event) => {
          event.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={drop}
        className={`flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging ? 'border-ink bg-sand' : 'border-line bg-cream'
        }`}
      >
        {busy ? (
          <p role="status" className="flex flex-col items-center gap-3 text-sm text-muted">
            <span className="size-8 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" />
            Checking your photo…
          </p>
        ) : (
          <>
            <PhotoIcon className="size-10 text-tan" />
            <p className="mt-3 hidden text-sm font-semibold sm:block">Drop a photo here</p>
            <p className="hidden text-xs text-muted sm:block">or</p>
            <label className="mt-3 cursor-pointer rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-cocoa has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink">
              Choose a photo
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  // Clearing the input lets the same file be chosen again after a problem.
                  event.target.value = ''
                  if (file) onPhoto(file)
                }}
              />
            </label>
            <p className="mt-3 text-[11px] text-muted">JPEG, PNG or WebP, up to 15 MB</p>
          </>
        )}
        {error && !busy && (
          <p role="alert" className="mt-5 rounded-lg bg-warn-soft px-3 py-2 text-left text-xs leading-relaxed text-warn">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
