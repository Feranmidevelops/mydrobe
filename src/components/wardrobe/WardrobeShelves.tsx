import { useId, useState, type ReactNode } from 'react'
import { isUpload, removeUploadedGarment } from '../../features/garments/garment.service'
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

type Filter = GarmentCategory | 'all'

function confirmAndRemove(garment: Garment) {
  const usedIn = useWardrobeStore
    .getState()
    .outfits.filter((outfit) => outfit.garmentIds[garment.category] === garment.id).length
  const outfitNote =
    usedIn === 0
      ? ''
      : ` It's in ${usedIn === 1 ? 'a saved outfit' : `${usedIn} saved outfits`}, which will show it as missing.`
  if (window.confirm(`Remove ${garment.name} from your wardrobe? You'd need to upload the photo again.${outfitNote}`)) {
    void removeUploadedGarment(garment)
  }
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

interface WardrobeShelvesProps {
  garments: Garment[]
  /** Opens the upload dialog; without it there's no way to add clothes. */
  onAddClothes?: () => void
}

/** The wardrobe itself: category filters, the person's own clothes, then the demo pieces. */
export function WardrobeShelves({ garments, onAddClothes }: WardrobeShelvesProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const selection = useWardrobeStore((state) => state.selection)
  const toggleGarment = useWardrobeStore((state) => state.toggleGarment)
  const storage = useWardrobeStore((state) => state.storage)

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
        onRemove={isUpload(garment) ? confirmAndRemove : undefined}
      />
    </li>
  )

  if (garments.length === 0 && !onAddClothes) {
    return <p className="mt-4 text-sm text-muted">Your wardrobe is empty.</p>
  }

  return (
    <>
      {categories.length > 0 && (
        <div role="group" aria-label="Filter by category" className="mt-4 flex flex-wrap gap-2">
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={activeFilter === value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                activeFilter === value ? 'bg-ink text-cream' : 'bg-mist text-ink-soft hover:bg-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {storage === 'unavailable' && (
        <p role="note" className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          This browser isn't letting Mydrobe save, so anything you add will be gone when you leave. Private
          browsing can cause this.
        </p>
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
      {onAddClothes &&
        uploads.length === 0 &&
        (storage === 'loading' ? (
          <p role="status" className="mt-3 text-xs text-muted">
            Loading your saved clothes…
          </p>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Photograph a shirt or trousers laid flat on a plain background, then try it on.
          </p>
        ))}

      {demosShown.length > 0 && <Shelf title="Demo pieces">{demosShown.map(card)}</Shelf>}
    </>
  )
}
