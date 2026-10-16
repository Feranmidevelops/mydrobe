import { useId, useState, type FormEvent } from 'react'
import type { Garment } from '../../features/garments/garment.types'
import {
  isWearingOutfit,
  OUTFIT_NAME_MAX_LENGTH,
  suggestOutfitName,
} from '../../features/outfits/outfit.operations'
import { OutfitError, saveCurrentOutfit } from '../../features/outfits/outfit.service'
import { StorageError } from '../../features/storage/storage-error'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { CheckIcon } from '../ui/icons'

/**
 * Saves what's on the mannequin as a named outfit: a button that opens a
 * small name form, or a note when this exact look is already saved.
 */
export function SaveOutfit({ garments }: { garments: Garment[] }) {
  const inputId = useId()
  const errorId = useId()
  const selection = useWardrobeStore((state) => state.selection)
  const bodyPreset = useWardrobeStore((state) => state.bodyPreset)
  const outfits = useWardrobeStore((state) => state.outfits)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savedAs = outfits.find((outfit) => isWearingOutfit(outfit, selection, bodyPreset, garments))

  const startNaming = () => {
    setName(suggestOutfitName(outfits))
    setError(null)
    setNaming(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await saveCurrentOutfit(name)
      setNaming(false)
    } catch (problem) {
      setError(
        problem instanceof OutfitError || problem instanceof StorageError
          ? problem.message
          : "Couldn't save the outfit. Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (naming) {
    return (
      <form onSubmit={submit} className="mt-3">
        <label htmlFor={inputId} className="text-xs font-semibold">
          Name this outfit
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={inputId}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setNaming(false)
              }
            }}
            maxLength={OUTFIT_NAME_MAX_LENGTH}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm text-ink"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream transition hover:bg-cocoa disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            className="rounded-full px-3 py-2 text-sm text-ink-soft transition hover:bg-sand hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-xs text-warn">
            {error}
          </p>
        )}
      </form>
    )
  }

  if (savedAs) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <CheckIcon className="size-3.5 text-ink" />
        Saved as “{savedAs.name}”
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={startNaming}
      className="mt-3 w-full rounded-full border border-ink/20 py-2.5 text-sm font-semibold text-ink transition hover:border-ink hover:bg-surface"
    >
      Save outfit
    </button>
  )
}
