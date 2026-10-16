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
 * Where a garment's imagery comes from: a procedurally drawn demo fabric, or
 * a front-facing photo. Uploads will point `url` at an image kept in IndexedDB.
 */
export type GarmentSource =
  | { kind: 'demo'; fabric: FabricPattern }
  | {
      kind: 'photo'
      url: string
      /** A cut-out of just the garment, for wardrobe cards. */
      thumbnailUrl?: string
      /** How different from the background a pixel must be to count as garment. */
      backgroundTolerance?: number
    }

export interface Garment {
  id: string
  name: string
  category: GarmentCategory
  /** Supported 3D template, or null when the garment can only be shown in 2D. */
  templateId: GarmentTemplateId | null
  source: GarmentSource
  tags: string[]
  /** Main colours as CSS hex, most common first; known for uploaded photos. */
  palette?: string[]
  createdAt: number
  updatedAt: number
}
