import { getRenderability } from '../../features/garments/garment.templates'
import { GARMENT_CATEGORY_LABELS, type Garment } from '../../features/garments/garment.types'
import { CheckIcon } from '../ui/icons'
import { GarmentThumbnail } from './GarmentThumbnail'

interface GarmentCardProps {
  garment: Garment
  selected: boolean
  onToggle: (garment: Garment) => void
}

/** Tops hang from a hanger, like the product cards on the landing page. */
function hangsOnHanger(garment: Garment) {
  return garment.category === 'shirt' || garment.category === 'outerwear'
}

export function GarmentCard({ garment, selected, onToggle }: GarmentCardProps) {
  const renderability = getRenderability(garment)
  const kind = renderability.renderable
    ? renderability.template.label
    : GARMENT_CATEGORY_LABELS[garment.category].one

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(garment)}
      className="group flex w-full flex-col rounded-xl text-left"
    >
      <span
        className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-mist transition ${
          selected ? 'ring-2 ring-ink' : 'group-hover:ring-1 group-hover:ring-ink/20'
        }`}
      >
        <span className="w-[82%] transition duration-300 group-hover:scale-[1.04]">
          <GarmentThumbnail garment={garment} size={160} hanger={hangsOnHanger(garment)} fluid />
        </span>
        {selected && (
          <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-ink text-cream">
            <CheckIcon className="size-3.5" />
          </span>
        )}
        {!renderability.renderable && (
          <span className="absolute bottom-2 left-2 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
            2D only
          </span>
        )}
      </span>
      <span className="mt-2.5 text-sm leading-snug font-semibold text-ink">{garment.name}</span>
      <span className="text-xs text-muted">{kind}</span>
    </button>
  )
}
