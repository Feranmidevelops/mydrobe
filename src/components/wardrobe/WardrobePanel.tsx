import { useId, useState, type ReactNode } from 'react'
import { isUpload } from '../../features/garments/garment.service'
import {
  GARMENT_CATEGORIES,
  GARMENT_CATEGORY_LABELS,
  type Garment,
  type GarmentCategory,
} from '../../features/garments/garment.types'
import { isSelected } from '../../features/outfits/outfit.selection'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { AddClothesCard } from './AddClothesCard'
import { GarmentCard } from './GarmentCard'
import { OutfitSummary } from './OutfitSummary'

type Filter = GarmentCategory | 'all'

interface WardrobePanelProps {
  garments: Garment[]
  /** Opens the upload dialog; without it the panel has no way to add clothes. */
  onAddClothes?: () => void
}

function Shelf({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <div className="mt-6">
      <h3 id={headingId} className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
        {title}
      </h3>
      <ul aria-labelledby={headingId} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
        {children}
      </ul>
    </div>
  )
}

export function WardrobePanel({ garments, onAddClothes }: WardrobePanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const selection = useWardrobeStore((state) => state.selection)
  const toggleGarment = useWardrobeStore((state) => state.toggleGarment)

  const categories = GARMENT_CATEGORIES.filter((category) =>
    garments.some((garment) => garment.category === category),
  )
  // Removing the last upload in a category takes its filter away too.
  const activeFilter = filter !== 'all' && categories.includes(filter) ? filter : 'all'
  const shown = (garment: Garment) => activeFilter === 'all' || garment.category === activeFilter
  const uploads = garments.filter(isUpload)
  const ownShown = uploads.filter(shown)
  const demosShown = garments.filter((garment) => !isUpload(garment) && shown(garment))
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...categories.map((category) => ({
      value: category,
      label: GARMENT_CATEGORY_LABELS[category].many,
    })),
  ]

  const card = (garment: Garment) => (
    <li key={garment.id}>
      <GarmentCard
        garment={garment}
        selected={isSelected(selection, garment)}
        onToggle={toggleGarment}
      />
    </li>
  )

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6">
      <OutfitSummary garments={garments} />

      <section aria-labelledby="wardrobe-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="wardrobe-heading" className="text-xl font-bold tracking-tight">
            Wardrobe
          </h2>
          <span className="text-xs text-muted">
            {garments.length} {garments.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {garments.length === 0 && !onAddClothes ? (
          <p className="mt-2 text-sm text-muted">Your wardrobe is empty.</p>
        ) : (
          <>
            {categories.length > 0 && (
              <div
                role="group"
                aria-label="Filter by category"
                className="mt-4 flex flex-wrap gap-2"
              >
                {filters.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={activeFilter === value}
                    onClick={() => setFilter(value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      activeFilter === value
                        ? 'bg-ink text-cream'
                        : 'bg-mist text-ink-soft hover:bg-line'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {(onAddClothes || ownShown.length > 0) && (
              <Shelf title="Your clothes">
                {onAddClothes && (
                  <li>
                    <AddClothesCard onClick={onAddClothes} />
                  </li>
                )}
                {ownShown.map(card)}
              </Shelf>
            )}
            {onAddClothes && uploads.length === 0 && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Photograph a shirt or trousers laid flat on a plain background, then try it on.
              </p>
            )}

            {demosShown.length > 0 && <Shelf title="Demo pieces">{demosShown.map(card)}</Shelf>}
          </>
        )}
      </section>
    </div>
  )
}
