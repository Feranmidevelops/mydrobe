import { GARMENT_CATEGORY_LABELS, type Garment } from '../../features/garments/garment.types'
import { resolveSelection } from '../../features/outfits/outfit.selection'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { CloseIcon } from '../ui/icons'
import { GarmentThumbnail } from './GarmentThumbnail'

export function OutfitSummary({ garments }: { garments: Garment[] }) {
  const selection = useWardrobeStore((state) => state.selection)
  const takeOff = useWardrobeStore((state) => state.takeOff)
  const clearOutfit = useWardrobeStore((state) => state.clearOutfit)
  const worn = resolveSelection(selection, garments)

  return (
    <section aria-labelledby="outfit-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="outfit-heading" className="font-display text-xl">
          Current outfit
        </h2>
        {worn.length > 0 && (
          <button
            type="button"
            onClick={clearOutfit}
            className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {worn.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Pick a shirt and trousers from your wardrobe to dress the mannequin.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {worn.map(({ garment, renderability }) => (
            <li key={garment.id} className="rounded-xl border border-line bg-white p-2">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-canvas">
                  <GarmentThumbnail garment={garment} size={40} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{garment.name}</span>
                  <span className="block text-xs text-muted">
                    {GARMENT_CATEGORY_LABELS[garment.category].one}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => takeOff(garment.category)}
                  aria-label={`Take off ${garment.name}`}
                  className="grid size-8 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
                >
                  <CloseIcon className="size-4" />
                </button>
              </div>
              {!renderability.renderable && (
                <p role="note" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                  Not shown on the mannequin. {renderability.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
