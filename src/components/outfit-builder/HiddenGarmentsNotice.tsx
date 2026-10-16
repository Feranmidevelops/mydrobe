import type { Garment } from '../../features/garments/garment.types'
import { resolveSelection } from '../../features/outfits/outfit.selection'
import { useWardrobeStore } from '../../store/wardrobe.store'

/** Tells the viewer which selected items are missing from the mannequin. */
export function HiddenGarmentsNotice({ garments }: { garments: Garment[] }) {
  const selection = useWardrobeStore((state) => state.selection)
  const hidden = resolveSelection(selection, garments).filter((worn) => !worn.renderability.renderable)
  if (hidden.length === 0) return null

  const names = hidden.map((worn) => worn.garment.name).join(', ')
  return (
    <p
      role="status"
      className="max-w-xs rounded-full bg-warn-soft/95 px-3 py-1 text-center text-[11px] text-warn ring-1 ring-warn/15"
    >
      {names} {hidden.length === 1 ? "isn't" : "aren't"} shown in 3D yet
    </p>
  )
}
