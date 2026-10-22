import { useEffect, useMemo } from 'react'
import type { BodyShape } from './body-shape'
import { buildMannequinGeometry } from './geometry/mannequin-geometry'
import { MANNEQUIN_COLOR } from './light-rig'

export function Mannequin({ shape }: { shape: BodyShape }) {
  const geometry = useMemo(() => buildMannequinGeometry(shape), [shape])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={MANNEQUIN_COLOR} roughness={0.42} metalness={0} envMapIntensity={0.9} />
    </mesh>
  )
}
