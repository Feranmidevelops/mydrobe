import { useId, useState, type FormEvent } from 'react'
import type { Garment } from '../../features/garments/garment.types'
import { BODY_PRESET_LABELS } from '../../features/mannequin/viewer.types'
import {
  describeSlots,
  isWearingOutfit,
  OUTFIT_NAME_MAX_LENGTH,
  resolveOutfit,
} from '../../features/outfits/outfit.operations'
import { deleteOutfit, OutfitError, renameOutfit, wearOutfit } from '../../features/outfits/outfit.service'
import type { Outfit } from '../../features/outfits/outfit.types'
import { StorageError } from '../../features/storage/storage-error'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { CheckIcon, HangerIcon, PencilIcon, TrashIcon } from '../ui/icons'
import { GarmentThumbnail } from '../wardrobe/GarmentThumbnail'

const iconButton =
  'grid size-8 place-items-center rounded-full text-muted transition hover:bg-sand hover:text-ink'

/** A saved outfit: its pieces at a glance, with ways to wear, rename or delete it. */
export function OutfitCard({ outfit, garments }: { outfit: Outfit; garments: Garment[] }) {
  const nameId = useId()
  const inputId = useId()
  const errorId = useId()
  const selection = useWardrobeStore((state) => state.selection)
  const bodyPreset = useWardrobeStore((state) => state.bodyPreset)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(outfit.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { garments: pieces, missing } = resolveOutfit(outfit, garments)
  const wearing = isWearingOutfit(outfit, selection, bodyPreset, garments)
  const missingNote = describeSlots(missing)

  const startRenaming = () => {
    setDraft(outfit.name)
    setError(null)
    setRenaming(true)
  }

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await renameOutfit(outfit, draft)
      setRenaming(false)
    } catch (problem) {
      setError(
        problem instanceof OutfitError || problem instanceof StorageError
          ? problem.message
          : "Couldn't rename it. Please try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = () => {
    if (window.confirm(`Delete “${outfit.name}”? Its clothes stay in your wardrobe.`)) void deleteOutfit(outfit)
  }

  return (
    <article
      aria-labelledby={nameId}
      className={`rounded-2xl border bg-surface p-3 transition ${wearing ? 'border-ink' : 'border-line'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex shrink-0" aria-hidden="true">
          {pieces.length > 0 ? (
            pieces.slice(0, 3).map((piece, index) => (
              <span
                key={piece.id}
                className={`grid size-12 place-items-center overflow-hidden rounded-xl bg-mist ring-2 ring-surface ${index > 0 ? '-ml-3' : ''}`}
              >
                <GarmentThumbnail garment={piece} size={44} />
              </span>
            ))
          ) : (
            <span className="grid size-12 place-items-center rounded-xl bg-mist text-muted">
              <HangerIcon className="size-6" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 id={nameId} className={renaming ? 'sr-only' : 'truncate text-sm font-semibold'}>
            {outfit.name}
          </h3>
          {renaming && (
            <form onSubmit={submitRename}>
              <label htmlFor={inputId} className="sr-only">
                New name for {outfit.name}
              </label>
              <input
                id={inputId}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={(event) => event.target.select()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setRenaming(false)
                  }
                }}
                maxLength={OUTFIT_NAME_MAX_LENGTH}
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full rounded-lg border border-line bg-white px-2.5 py-1 text-sm text-ink"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-cream transition hover:bg-cocoa disabled:opacity-50"
                >
                  Save name
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="rounded-full px-3 py-1 text-xs text-ink-soft transition hover:bg-sand hover:text-ink"
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
          )}
          <p className="mt-0.5 truncate text-xs text-muted">
            {pieces.length > 0 ? pieces.map((piece) => piece.name).join(' · ') : 'No pieces left'} ·{' '}
            {BODY_PRESET_LABELS[outfit.bodyPreset]}
          </p>
          {missing.length > 0 && (
            <p className="mt-1 text-xs text-warn">
              {missingNote[0].toUpperCase() + missingNote.slice(1)} removed from your wardrobe
            </p>
          )}
        </div>
      </div>

      {!renaming && (
        <div className="mt-3 flex items-center gap-1">
          <button
            type="button"
            onClick={() => wearOutfit(outfit)}
            disabled={wearing || pieces.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-cream transition hover:bg-cocoa disabled:cursor-default disabled:bg-sand disabled:text-ink-soft"
          >
            {wearing && <CheckIcon className="size-3.5" />}
            {wearing ? 'Wearing' : 'Wear'}
          </button>
          <span className="flex-1" />
          <button type="button" onClick={startRenaming} aria-label={`Rename ${outfit.name}`} className={iconButton}>
            <PencilIcon className="size-4" />
          </button>
          <button type="button" onClick={confirmDelete} aria-label={`Delete ${outfit.name}`} className={iconButton}>
            <TrashIcon className="size-4" />
          </button>
        </div>
      )}
    </article>
  )
}
