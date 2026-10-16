import { useRef, type KeyboardEvent } from 'react'
import { BODY_PRESET_LABELS, BODY_PRESETS } from '../../features/mannequin/viewer.types'
import { useWardrobeStore } from '../../store/wardrobe.store'

export function BodyPresetControl() {
  const preset = useWardrobeStore((state) => state.bodyPreset)
  const setBodyPreset = useWardrobeStore((state) => state.setBodyPreset)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (step === undefined) return
    event.preventDefault()
    const index = BODY_PRESETS.indexOf(preset)
    const next = (index + step + BODY_PRESETS.length) % BODY_PRESETS.length
    setBodyPreset(BODY_PRESETS[next])
    buttons.current[next]?.focus()
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        role="radiogroup"
        aria-label="Body preset"
        onKeyDown={onKeyDown}
        className="inline-flex rounded-full bg-surface/90 p-1 shadow-sm ring-1 ring-line backdrop-blur"
      >
        {BODY_PRESETS.map((value, index) => (
          <button
            key={value}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={preset === value}
            tabIndex={preset === value ? 0 : -1}
            onClick={() => setBodyPreset(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition sm:px-5 ${
              preset === value ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {BODY_PRESET_LABELS[value]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">Visual body shapes, not size advice</p>
    </div>
  )
}
