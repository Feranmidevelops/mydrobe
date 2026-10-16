import { useState } from 'react'
import {
  GARMENT_CATEGORIES,
  GARMENT_CATEGORY_LABELS,
  type Garment,
  type GarmentCategory,
} from '../../features/garments/garment.types'
import { isSelected } from '../../features/outfits/outfit.selection'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { GarmentCard } from './GarmentCard'
import { OutfitSummary } from './OutfitSummary'

type Filter = GarmentCategory | 'all'

export function WardrobePanel({ garments }: { garments: Garment[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const selection = useWardrobeStore((state) => state.selection)
  const toggleGarment = useWardrobeStore((state) => state.toggleGarment)

  const categories = GARMENT_CATEGORIES.filter((category) =>
    garments.some((garment) => garment.category === category),
  )
  const visible = filter === 'all' ? garments : garments.filter((g) => g.category === filter)
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...categories.map((category) => ({
      value: category,
      label: GARMENT_CATEGORY_LABELS[category].many,
    })),
  ]

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6">
      <OutfitSummary garments={garments} />

      <section aria-labelledby="wardrobe-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="wardrobe-heading" className="font-display text-xl">
            Wardrobe
          </h2>
          <span className="text-xs text-muted">
            {garments.length} {garments.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {garments.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Your wardrobe is empty.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">Demo pieces. Your own uploads are coming next.</p>
            <div
              role="group"
              aria-label="Filter by category"
              className="mt-4 flex flex-wrap gap-2"
            >
              {filters.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                    filter === value
                      ? 'bg-ink text-surface'
                      : 'bg-canvas text-ink-soft hover:bg-line'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul
              aria-label="Wardrobe items"
              className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2"
            >
              {visible.map((garment) => (
                <li key={garment.id}>
                  <GarmentCard
                    garment={garment}
                    selected={isSelected(selection, garment)}
                    onToggle={toggleGarment}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
