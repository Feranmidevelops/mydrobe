import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * A photo-studio "cove": the floor sweeps up into the back wall in one curve,
 * so the image has no hard horizon line behind the figures.
 */
function buildCove({ width = 30, depth = 12, wallZ = -3, radius = 1.6, height = 10 } = {}) {
  const profile: [number, number][] = [[depth, 0]]
  const curveStartZ = wallZ + radius
  for (let i = 0; i <= 16; i++) {
    const angle = (i / 16) * (Math.PI / 2)
    profile.push([curveStartZ - Math.sin(angle) * radius, radius - Math.cos(angle) * radius])
  }
  profile.push([wallZ, height])

  const positions: number[] = []
  const indices: number[] = []
  profile.forEach(([z, y], i) => {
    positions.push(-width / 2, y, z, width / 2, y, z)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function StudioBackdrop({ color }: { color: string }) {
  const geometry = useMemo(() => buildCove(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Sits a hair below y = 0 so the contact shadow above it never z-fights.
  return (
    <mesh geometry={geometry} position-y={-0.004}>
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}
