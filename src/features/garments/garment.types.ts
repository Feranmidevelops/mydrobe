export const GARMENT_CATEGORIES = [
  'shirt',
  'trousers',
  'outerwear',
  'shoes',
  'accessory',
  'other',
] as const

export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number]

export const GARMENT_CATEGORY_LABELS: Record<GarmentCategory, { one: string; many: string }> = {
  shirt: { one: 'Shirt', many: 'Shirts' },
  trousers: { one: 'Trousers', many: 'Trousers' },
  outerwear: { one: 'Outerwear', many: 'Outerwear' },
  shoes: { one: 'Shoes', many: 'Shoes' },
  accessory: { one: 'Accessory', many: 'Accessories' },
  other: { one: 'Other', many: 'Other' },
}

export type GarmentTemplateId = 'shirt-long-sleeve' | 'shirt-short-sleeve' | 'trousers-straight'

/**
 * A procedurally drawn fabric. Sizes are millimetres of real fabric so the
 * same pattern can be drawn at thumbnail scale or as a 3D texture without
 * stripes changing width between the two.
 */
export type FabricPattern =
  | { kind: 'solid'; color: string; finish: 'plain' | 'slub' | 'wool' }
  | { kind: 'stripes'; base: string; stripe: string; stripeMm: number; periodMm: number }
  | { kind: 'check'; base: string; line: string; periodMm: number }
  | { kind: 'denim'; color: string }
  | { kind: 'twill'; color: string }

/**
 * Where a garment's imagery comes from. Built-in demo garments draw a fabric
 * pattern; uploaded photos will add an `upload` variant backed by IndexedDB.
 */
export type GarmentSource = { kind: 'demo'; fabric: FabricPattern }

export interface Garment {
  id: string
  name: string
  category: GarmentCategory
  /** Supported 3D template, or null when the garment can only be shown in 2D. */
  templateId: GarmentTemplateId | null
  source: GarmentSource
  tags: string[]
  createdAt: number
  updatedAt: number
}
