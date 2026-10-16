import type { Garment } from '../../features/garments/garment.types'
import { resolveSelection } from '../../features/outfits/outfit.selection'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { Spinner } from '../ui/Spinner'

function names(garments: Garment[]) {
  return garments.map((garment) => garment.name).join(', ')
}

/**
 * Says when a photo garment is still being fitted onto the mannequin, which
 * can take a few seconds after a reload, and when one couldn't be. The live
 * region is always there so screen readers announce what appears in it.
 */
export function FittingStatus({ garments }: { garments: Garment[] }) {
  const selection = useWardrobeStore((state) => state.selection)
  const fitting = useWardrobeStore((state) => state.fitting)
  const worn = resolveSelection(selection, garments).map(({ garment }) => garment)
  const loading = worn.filter((garment) => fitting[garment.id] === 'loading')
  const failed = worn.filter((garment) => fitting[garment.id] === 'failed')

  return (
    <>
      <div role="status">
        {loading.length > 0 && (
          // Quick refits, like switching body shape, finish before this fades in.
          <p className="flex animate-appear items-center gap-2 rounded-full bg-surface/90 px-3 py-1 text-[11px] text-ink-soft shadow-sm ring-1 ring-line backdrop-blur">
            <Spinner className="size-3" />
            Fitting {names(loading)}…
          </p>
        )}
      </div>
      {failed.length > 0 && (
        <p
          role="note"
          className="max-w-xs rounded-2xl bg-warn-soft/95 px-3 py-1 text-center text-[11px] text-warn ring-1 ring-warn/15"
        >
          {names(failed)} couldn't be fitted from {failed.length === 1 ? 'its photo' : 'their photos'}, so{' '}
          {failed.length === 1 ? 'it shows' : 'they show'} in plain colour.
        </p>
      )}
    </>
  )
}
