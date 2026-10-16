import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import type { Garment, GarmentTemplateId } from '../garments/garment.types'
import { fabricBaseColor } from '../../lib/fabric'
import type { BodyShape } from './body-shape'
import { buildGarmentGeometry } from './geometry/garment-geometry'
import { useGarmentTextures } from './useGarmentTextures'

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
  const textures = useGarmentTextures(garment, templateId, geometry.panel, shape)
  const invalidate = useThree((state) => state.invalidate)

  // The view only redraws on demand, and a photo's textures can arrive after
  // the last frame, so ask for a new one whenever they change.
  useEffect(() => {
    invalidate()
  }, [textures, invalidate])

  useEffect(
    () => () => {
      geometry.front.dispose()
      geometry.rest.dispose()
    },
    [geometry],
  )

  // Until textures exist (no 2D canvas, or a photo still loading), show a flat colour.
  const fallbackColor = textures
    ? undefined
    : source.kind === 'demo'
      ? fabricBaseColor(source.fabric)
      : PHOTO_PLACEHOLDER_COLOR

  // three.js only compiles texture support into a material when it first has
  // a map, so remount the materials once a photo's textures arrive.
  const materialKey = textures ? 'textured' : 'flat'

  return (
    <group>
      <mesh geometry={geometry.front}>
        <meshStandardMaterial
          key={materialKey}
          map={textures?.front ?? null}
          color={fallbackColor}
          roughness={0.88}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={geometry.rest}>
        <meshStandardMaterial
          key={materialKey}
          map={textures?.swatch ?? null}
          color={fallbackColor}
          roughness={0.88}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
}
