import type { BufferGeometry } from 'three'
import type { GarmentTemplateId } from '../garments/garment.types'
import { createBodyShape, type BodyShape } from './body-shape'
import { buildGarmentGeometry, type GarmentGeometry } from './geometry/garment-geometry'
import { buildMannequinGeometry } from './geometry/mannequin-geometry'
import { BODY_PRESETS, type BodyPreset } from './viewer.types'

/*
 * Each body size's shape, mannequin and garment geometry, built once and kept,
 * so switching size doesn't work them all out again on the main thread. Only
 * the arrays are kept: a mesh still frees its graphics buffers when it moves on
 * to another size (geometry.dispose()), and three.js uploads them again if the
 * size comes back, so the graphics memory held is the same as before.
 */

const shapes = new Map<BodyPreset, BodyShape>()
const mannequins = new WeakMap<BodyShape, BufferGeometry>()
const garments = new WeakMap<BodyShape, Map<GarmentTemplateId, GarmentGeometry>>()
let builds = 0

/** The one shape for each body size, so geometry kept for it can be found again. */
export function bodyShapeFor(preset: BodyPreset): BodyShape {
  let shape = shapes.get(preset)
  if (!shape) shapes.set(preset, (shape = createBodyShape(preset)))
  return shape
}

export function mannequinGeometryFor(shape: BodyShape): BufferGeometry {
  let geometry = mannequins.get(shape)
  if (!geometry) {
    mannequins.set(shape, (geometry = buildMannequinGeometry(shape)))
    builds++
  }
  return geometry
}

export function garmentGeometryFor(templateId: GarmentTemplateId, shape: BodyShape): GarmentGeometry {
  let kept = garments.get(shape)
  if (!kept) garments.set(shape, (kept = new Map()))
  let geometry = kept.get(templateId)
  if (!geometry) {
    kept.set(templateId, (geometry = buildGarmentGeometry(templateId, shape)))
    builds++
  }
  return geometry
}

/** How many geometries have been built so far; the performance probe reports it. */
export const geometryBuilds = () => builds

/**
 * What switching to any body size would still have to build for the mannequin
 * and these templates, as one step per geometry: each small enough for a
 * moment of idle time.
 */
export function unbuiltBodySizes(templateIds: readonly GarmentTemplateId[]): (() => void)[] {
  const steps: (() => void)[] = []
  for (const preset of BODY_PRESETS) {
    const shape = bodyShapeFor(preset)
    if (!mannequins.has(shape)) steps.push(() => mannequinGeometryFor(shape))
    for (const templateId of templateIds) {
      if (!garments.get(shape)?.has(templateId)) steps.push(() => garmentGeometryFor(templateId, shape))
    }
  }
  return steps
}
