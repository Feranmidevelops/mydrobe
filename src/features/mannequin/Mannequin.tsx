import { useEffect } from 'react'
import { mannequinGeometryFor } from './body-geometry'
import type { BodyShape } from './body-shape'
import { MANNEQUIN_COLOR } from './light-rig'

export function Mannequin({ shape }: { shape: BodyShape }) {
  const geometry = mannequinGeometryFor(shape)
  // Frees its graphics buffers when the body changes; the geometry itself is kept (see body-geometry).
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={MANNEQUIN_COLOR} roughness={0.42} metalness={0} envMapIntensity={0.9} />
    </mesh>
  )
}
