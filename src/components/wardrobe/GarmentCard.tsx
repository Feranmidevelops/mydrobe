import { getRenderability } from '../../features/garments/garment.templates'
import { GARMENT_CATEGORY_LABELS, type Garment } from '../../features/garments/garment.types'
import { CheckIcon } from '../ui/icons'
import { GarmentThumbnail } from './GarmentThumbnail'

interface GarmentCardProps {
  garment: Garment
  selected: boolean
  onToggle: (garment: Garment) => void
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
      className={`group flex w-full flex-col rounded-2xl border bg-white p-2 text-left transition ${
        selected
          ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]'
          : 'border-line hover:border-ink-soft/40 hover:shadow-sm'
      }`}
    >
      <span className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-canvas">
        <GarmentThumbnail
          garment={garment}
          size={120}
          className="transition duration-300 group-hover:scale-[1.04]"
        />
        {selected && (
          <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-ink text-surface">
            <CheckIcon className="size-3.5" />
          </span>
        )}
        {!renderability.renderable && (
          <span className="absolute bottom-2 left-2 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
            2D only
          </span>
        )}
      </span>
      <span className="mt-2.5 px-1 text-sm leading-snug font-medium text-ink">{garment.name}</span>
      <span className="px-1 pb-1 text-xs text-muted">{kind}</span>
    </button>
  )
}
