import { getRenderability } from '../../features/garments/garment.templates'
import { GARMENT_CATEGORY_LABELS, type Garment } from '../../features/garments/garment.types'
import { CheckIcon, TrashIcon } from '../ui/icons'
import { GarmentThumbnail } from './GarmentThumbnail'

interface GarmentCardProps {
  garment: Garment
  selected: boolean
  onToggle: (garment: Garment) => void
  /** Offered for the person's own clothes; demo pieces can't be removed. */
  onRemove?: (garment: Garment) => void
}

/** Tops hang from a hanger, like the product cards on the landing page. */
function hangsOnHanger(garment: Garment) {
  return garment.category === 'shirt' || garment.category === 'outerwear'
}

export function GarmentCard({ garment, selected, onToggle, onRemove }: GarmentCardProps) {
  const renderability = getRenderability(garment)
  const kind = renderability.renderable
    ? renderability.template.label
    : GARMENT_CATEGORY_LABELS[garment.category].one
  // Leaves room beside the name for the remove button.
  const textRoom = onRemove ? 'pr-9' : ''

  return (
    <div className="relative">
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
          <span className="w-[82%] transition duration-300 motion-safe:group-hover:scale-[1.04]">
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
        <span className={`mt-2.5 text-sm leading-snug font-semibold text-ink ${textRoom}`}>
          {garment.name}
        </span>
        <span className={`text-xs text-muted ${textRoom}`}>{kind}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(garment)}
          aria-label={`Remove ${garment.name} from your wardrobe`}
          title="Remove from wardrobe"
          className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full text-muted transition hover:bg-sand hover:text-ink"
        >
          <TrashIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
