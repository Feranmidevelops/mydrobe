import { useMemo, useState } from 'react'
import { GARMENT_TEMPLATES } from '../features/garments/garment.templates'
import type { Garment, GarmentTemplateId } from '../features/garments/garment.types'
import { DEFAULT_BACKGROUND_TOLERANCE } from '../features/garments/photo-mapping'
import { BODY_PRESET_LABELS, BODY_PRESETS, type BodyPreset } from '../features/mannequin/viewer.types'
import { baselineSamples, photoSamples, type TrialSample } from './samples'
import { TrialScene } from './TrialScene'
import { TRIAL_VIEWS } from './trial-views'

/*
 * Development-only page for Milestone 2's photo-to-template trial.
 * Run `npm run dev` and open /trial.html. Put photos in trial-photos/ to try
 * them; ?sample=<id> opens a given sample directly.
 */

const TEMPLATE_IDS = Object.keys(GARMENT_TEMPLATES) as GarmentTemplateId[]

function trialGarment(sample: TrialSample, templateId: GarmentTemplateId, tolerance: number): Garment {
  return {
    id: sample.id,
    name: sample.name,
    category: GARMENT_TEMPLATES[templateId].category,
    templateId,
    source: { kind: 'photo', url: sample.url, backgroundTolerance: tolerance },
    tags: ['trial'],
    createdAt: 0,
    updatedAt: 0,
  }
}

function SampleList({
  title,
  samples,
  selectedId,
  onSelect,
  empty,
}: {
  title: string
  samples: TrialSample[]
  selectedId: string
  onSelect: (id: string) => void
  empty?: string
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">{title}</h2>
      {samples.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {samples.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                aria-pressed={sample.id === selectedId}
                onClick={() => onSelect(sample.id)}
                className={`flex w-full items-center gap-3 rounded-lg p-1.5 text-left text-sm transition ${
                  sample.id === selectedId ? 'bg-ink text-cream' : 'hover:bg-mist'
                }`}
              >
                <img src={sample.url} alt="" className="size-10 shrink-0 rounded-md bg-white object-contain" />
                <span className="truncate">{sample.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function TrialPage() {
  const baseline = useMemo(() => baselineSamples(), [])
  const photos = useMemo(() => photoSamples(), [])
  const samples = useMemo(() => [...baseline, ...photos], [baseline, photos])

  const [selectedId, setSelectedId] = useState(
    () => new URLSearchParams(window.location.search).get('sample') ?? photos[0]?.id ?? baseline[0]?.id,
  )
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, GarmentTemplateId>>({})
  const [tolerance, setTolerance] = useState(DEFAULT_BACKGROUND_TOLERANCE)
  const [preset, setPreset] = useState<BodyPreset>('medium')

  const sample = samples.find((candidate) => candidate.id === selectedId) ?? samples[0]
  const templateId = sample ? (templateOverrides[sample.id] ?? sample.templateId) : null
  const garment = useMemo(
    () => (sample && templateId ? trialGarment(sample, templateId, tolerance) : null),
    [sample, templateId, tolerance],
  )

  function select(id: string) {
    setSelectedId(id)
    const url = new URL(window.location.href)
    url.searchParams.set('sample', id)
    window.history.replaceState(null, '', url)
  }

  return (
    <div className="flex h-dvh bg-cream text-ink">
      <aside className="w-72 shrink-0 space-y-6 overflow-y-auto border-r border-line p-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Photo mapping trial</h1>
          <p className="mt-1 text-xs text-muted">
            Milestone 2: do garment photos look convincing on the clothing templates?
          </p>
        </div>
        <SampleList
          title="Your photos"
          samples={photos}
          selectedId={selectedId ?? ''}
          onSelect={select}
          empty="Drop photos into trial-photos/ at the project root and reload."
        />
        <SampleList title="Baseline: generated flat-lays" samples={baseline} selectedId={selectedId ?? ''} onSelect={select} />
      </aside>

      {sample && templateId && garment ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-end gap-6 border-b border-line p-4">
            <label className="text-xs text-muted">
              Template
              <select
                value={templateId}
                onChange={(event) =>
                  setTemplateOverrides((overrides) => ({
                    ...overrides,
                    [sample.id]: event.target.value as GarmentTemplateId,
                  }))
                }
                className="mt-1 block rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
              >
                {TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {GARMENT_TEMPLATES[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Background tolerance: {tolerance}
              <input
                type="range"
                min={20}
                max={180}
                step={5}
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
                className="mt-2 block w-48 accent-[var(--color-espresso)]"
              />
            </label>
            <div className="flex gap-1" role="group" aria-label="Body preset">
              {BODY_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preset === value}
                  onClick={() => setPreset(value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    preset === value ? 'bg-ink text-cream' : 'bg-mist text-ink-soft'
                  }`}
                >
                  {BODY_PRESET_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 bg-[radial-gradient(ellipse_at_50%_36%,#f7f0e8_0%,#e4d6c7_72%)]">
            <TrialScene garment={garment} templateId={templateId} preset={preset} />
            <ul className="pointer-events-none absolute inset-x-0 bottom-3 grid grid-cols-3 text-center text-xs font-medium tracking-[0.14em] text-muted uppercase">
              {TRIAL_VIEWS.map((view) => (
                <li key={view.label}>{view.label}</li>
              ))}
            </ul>
          </div>
        </main>
      ) : (
        <p className="m-auto text-sm text-muted">No samples to show.</p>
      )}
    </div>
  )
}
