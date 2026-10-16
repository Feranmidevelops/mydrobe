import {
  GARMENT_CATEGORIES,
  type Garment,
  type GarmentCategory,
} from '../garments/garment.types'
import { BODY_PRESETS, type BodyPreset } from '../mannequin/viewer.types'
import type { GarmentSelection } from './outfit.selection'
import type { Outfit } from './outfit.types'

/*
 * Rules for saved outfits. Pure: no storage and no store, so they're easy to
 * test and safe to use from both.
 */

export const OUTFIT_NAME_MAX_LENGTH = 60

/** A starting name for a new outfit: the first "Look n" that isn't taken. */
export function suggestOutfitName(outfits: Pick<Outfit, 'name'>[]): string {
  const taken = new Set(outfits.map((outfit) => outfit.name.toLowerCase()))
  let number = 1
  while (taken.has(`look ${number}`)) number++
  return `Look ${number}`
}

/** A tidied outfit name, or null when nothing is left once the spaces are gone. */
export function cleanOutfitName(name: string): string | null {
  const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, OUTFIT_NAME_MAX_LENGTH).trim()
  return cleaned || null
}

export type OutfitCheck = { ok: true; garmentIds: GarmentSelection } | { ok: false; problem: string }

/**
 * Checks what's on the mannequin before it's saved: the body preset must be a
 * real one, and every slot must hold a garment of that category that's still
 * in the wardrobe. Slots that don't are left out.
 */
export function checkOutfit(selection: GarmentSelection, bodyPreset: BodyPreset, garments: Garment[]): OutfitCheck {
  if (!BODY_PRESETS.includes(bodyPreset)) return { ok: false, problem: "That body shape isn't one Mydrobe knows." }
  const byId = new Map(garments.map((garment) => [garment.id, garment]))
  const garmentIds: GarmentSelection = {}
  for (const category of GARMENT_CATEGORIES) {
    const id = selection[category]
    if (id !== undefined && byId.get(id)?.category === category) garmentIds[category] = id
  }
  if (Object.keys(garmentIds).length === 0) return { ok: false, problem: 'Put something on the mannequin first.' }
  return { ok: true, garmentIds }
}

function newOutfitId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `outfit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createOutfit(
  name: string,
  garmentIds: GarmentSelection,
  bodyPreset: BodyPreset,
  now = Date.now(),
): Outfit {
  return { id: newOutfitId(), name, bodyPreset, garmentIds, missingSlots: [], createdAt: now, updatedAt: now }
}

export interface ResolvedOutfit {
  /** The pieces still in the wardrobe, in category order. */
  garments: Garment[]
  /** Slots whose garment has gone, whether it was removed or can't be found. */
  missing: GarmentCategory[]
}

/** Matches a saved outfit's references against the wardrobe as it is now. */
export function resolveOutfit(outfit: Outfit, garments: Garment[]): ResolvedOutfit {
  const byId = new Map(garments.map((garment) => [garment.id, garment]))
  const found: Garment[] = []
  const missing: GarmentCategory[] = []
  for (const category of GARMENT_CATEGORIES) {
    const id = outfit.garmentIds[category]
    const garment = id === undefined ? undefined : byId.get(id)
    if (garment?.category === category) found.push(garment)
    else if (id !== undefined || outfit.missingSlots.includes(category)) missing.push(category)
  }
  return { garments: found, missing }
}

/**
 * The outfit once a garment has left the wardrobe: its slot is marked as
 * missing rather than silently emptied, so the outfit can say what's gone.
 */
export function withoutGarment(outfit: Outfit, garment: Pick<Garment, 'id' | 'category'>, now = Date.now()): Outfit {
  if (outfit.garmentIds[garment.category] !== garment.id) return outfit
  const garmentIds = { ...outfit.garmentIds }
  delete garmentIds[garment.category]
  const missingSlots = outfit.missingSlots.includes(garment.category)
    ? outfit.missingSlots
    : [...outfit.missingSlots, garment.category]
  return { ...outfit, garmentIds, missingSlots, updatedAt: now }
}

/** True when the mannequin is wearing exactly this outfit's available pieces, on its body shape. */
export function isWearingOutfit(
  outfit: Outfit,
  selection: GarmentSelection,
  bodyPreset: BodyPreset,
  garments: Garment[],
): boolean {
  const worn = resolveOutfit(outfit, garments).garments
  if (worn.length === 0 || bodyPreset !== outfit.bodyPreset) return false
  const selected = GARMENT_CATEGORIES.filter((category) => selection[category] !== undefined)
  return selected.length === worn.length && worn.every((garment) => selection[garment.category] === garment.id)
}
