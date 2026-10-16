import {
  GARMENT_CATEGORY_LABELS,
  type Garment,
  type GarmentCategory,
  type GarmentTemplateId,
} from './garment.types'

export interface GarmentTemplate {
  id: GarmentTemplateId
  label: string
  category: GarmentCategory
}

/**
 * Garment meshes the viewer knows how to build. Each template defines the
 * texture contract: the front panel takes a front-facing image, and the back
 * and sleeves use a fabric swatch rather than an invented back view.
 */
export const GARMENT_TEMPLATES: Record<GarmentTemplateId, GarmentTemplate> = {
  'shirt-long-sleeve': { id: 'shirt-long-sleeve', label: 'Long-sleeve shirt', category: 'shirt' },
  'shirt-short-sleeve': { id: 'shirt-short-sleeve', label: 'Short-sleeve tee', category: 'shirt' },
  'trousers-straight': { id: 'trousers-straight', label: 'Straight trousers', category: 'trousers' },
}

export function templatesForCategory(category: GarmentCategory): GarmentTemplate[] {
  return Object.values(GARMENT_TEMPLATES).filter((template) => template.category === category)
}

export type Renderability =
  | { renderable: true; template: GarmentTemplate }
  | { renderable: false; reason: string }

/** Decides whether a garment can be drawn on the mannequin, and why not if it can't. */
export function getRenderability(garment: Pick<Garment, 'category' | 'templateId'>): Renderability {
  const categoryLabel = GARMENT_CATEGORY_LABELS[garment.category].one.toLowerCase()

  if (garment.templateId === null) {
    return templatesForCategory(garment.category).length === 0
      ? { renderable: false, reason: `There's no 3D template for ${categoryLabel} yet.` }
      : { renderable: false, reason: 'No 3D template has been chosen for this item.' }
  }

  const template = GARMENT_TEMPLATES[garment.templateId]
  if (template.category !== garment.category) {
    return {
      renderable: false,
      reason: `The ${template.label.toLowerCase()} template doesn't fit a ${categoryLabel} item.`,
    }
  }

  return { renderable: true, template }
}
