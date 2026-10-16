import type { Garment } from '../../features/garments/garment.types'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { HangerIcon } from '../ui/icons'
import { OutfitCard } from './OutfitCard'

interface SavedOutfitsProps {
  garments: Garment[]
  /** Called once an outfit is deleted, so focus can move on from its card. */
  onOutfitDeleted?: () => void
}

/** The outfits saved on this device, newest first. */
export function SavedOutfits({ garments, onOutfitDeleted }: SavedOutfitsProps) {
  const outfits = useWardrobeStore((state) => state.outfits)
  const storage = useWardrobeStore((state) => state.storage)

  if (outfits.length === 0) {
    if (storage === 'loading') {
      return (
        <p role="status" className="mt-4 text-sm text-muted">
          Loading your saved outfits…
        </p>
      )
    }
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-ink/20 px-6 py-10 text-center">
        <HangerIcon className="mx-auto size-8 text-tan" />
        <p className="mt-3 text-sm font-semibold">No saved outfits yet</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Dress the mannequin, then press Save outfit under Current outfit.
        </p>
      </div>
    )
  }

  return (
    <ul aria-label="Saved outfits" className="mt-4 space-y-3">
      {outfits.map((outfit) => (
        <li key={outfit.id}>
          <OutfitCard outfit={outfit} garments={garments} onDeleted={onOutfitDeleted} />
        </li>
      ))}
    </ul>
  )
}
