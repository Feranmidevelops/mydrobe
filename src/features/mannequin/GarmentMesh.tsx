import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import type { Garment, GarmentTemplateId } from '../garments/garment.types'
import { fabricBaseColor } from '../../lib/fabric'
import type { BodyShape } from './body-shape'
import { buildGarmentGeometry } from './geometry/garment-geometry'
import { createDemoGarmentTextures } from './garment-textures'

const PHOTO_PLACEHOLDER_COLOR = '#cdbfb1'

interface GarmentMeshProps {
  garment: Garment
  templateId: GarmentTemplateId
  shape: BodyShape
}

/** A garment template fitted to the current body preset and dressed in the garment's fabric. */
export function GarmentMesh({ garment, templateId, shape }: GarmentMeshProps) {
  const geometry = useMemo(() => buildGarmentGeometry(templateId, shape), [templateId, shape])
  const { source } = garment
  const textures = useMemo(
    () =>
      source.kind === 'demo'
        ? createDemoGarmentTextures(source.fabric, templateId, geometry.panel, shape)
        : null,
    [source, templateId, geometry.panel, shape],
  )

  useEffect(
    () => () => {
      geometry.front.dispose()
      geometry.rest.dispose()
    },
    [geometry],
  )
  useEffect(
    () => () => {
      textures?.front.dispose()
      textures?.swatch.dispose()
    },
    [textures],
  )

  // Until textures exist (no 2D canvas, or a photo still loading), show a flat colour.
  const fallbackColor = textures
    ? undefined
    : source.kind === 'demo'
      ? fabricBaseColor(source.fabric)
      : PHOTO_PLACEHOLDER_COLOR

  return (
    <group>
      <mesh geometry={geometry.front}>
        <meshStandardMaterial
          map={textures?.front ?? null}
          color={fallbackColor}
          roughness={0.88}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={geometry.rest}>
        <meshStandardMaterial
          map={textures?.swatch ?? null}
          color={fallbackColor}
          roughness={0.88}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}
