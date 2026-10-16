import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import type { Garment, GarmentTemplateId } from '../garments/garment.types'
import { fabricBaseColor } from '../../lib/fabric'
import type { BodyShape } from './body-shape'
import { buildGarmentGeometry } from './geometry/garment-geometry'
import { createDemoGarmentTextures } from './garment-textures'

interface GarmentMeshProps {
  garment: Garment
  templateId: GarmentTemplateId
  shape: BodyShape
}

/** A garment template fitted to the current body preset and dressed in the garment's fabric. */
export function GarmentMesh({ garment, templateId, shape }: GarmentMeshProps) {
  const geometry = useMemo(() => buildGarmentGeometry(templateId, shape), [templateId, shape])
  const textures = useMemo(
    () => createDemoGarmentTextures(garment, templateId, geometry.panel, shape),
    [garment, templateId, geometry.panel, shape],
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

  // Without a 2D canvas there are no textures; fall back to the fabric's base colour.
  const fallbackColor = textures ? undefined : fabricBaseColor(garment.source.fabric)

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
