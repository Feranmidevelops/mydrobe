import { getRenderability, type Renderability } from '../garments/garment.templates'
import {
  GARMENT_CATEGORIES,
  type Garment,
  type GarmentCategory,
} from '../garments/garment.types'

/** The outfit being assembled: at most one garment per category. */
export type GarmentSelection = Partial<Record<GarmentCategory, string>>

/**
 * Selecting a garment replaces whatever was in its category; selecting the
 * garment that is already worn takes it off.
 */
export function toggleInSelection(
  selection: GarmentSelection,
  garment: Pick<Garment, 'id' | 'category'>,
): GarmentSelection {
  if (selection[garment.category] === garment.id) {
    return removeFromSelection(selection, garment.category)
  }
  return { ...selection, [garment.category]: garment.id }
}

export function removeFromSelection(
  selection: GarmentSelection,
  category: GarmentCategory,
): GarmentSelection {
  const next = { ...selection }
  delete next[category]
  return next
}

export function isSelected(selection: GarmentSelection, garment: Pick<Garment, 'id' | 'category'>) {
  return selection[garment.category] === garment.id
}

export interface WornGarment {
  garment: Garment
  renderability: Renderability
}

/**
 * Resolves the selection against the wardrobe in category order. Ids that no
 * longer match a garment are dropped rather than rendered as broken slots.
 */
export function resolveSelection(selection: GarmentSelection, garments: Garment[]): WornGarment[] {
  const byId = new Map(garments.map((garment) => [garment.id, garment]))
  return GARMENT_CATEGORIES.flatMap((category) => {
    const id = selection[category]
    const garment = id === undefined ? undefined : byId.get(id)
    if (!garment || garment.category !== category) return []
    return [{ garment, renderability: getRenderability(garment) }]
  })
}
