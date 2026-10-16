import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { createBodyShape } from './body-shape'
import { CameraRig } from './CameraRig'
import { CAMERA_FOV } from './camera-views'
import { Mannequin } from './Mannequin'

/** Soft studio light baked into a small environment map; no HDR download needed. */
function StudioLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#d8d0c3', 0.55]} />
      <directionalLight position={[-2.5, 4, 3]} intensity={1.5} />
      <directionalLight position={[3, 2.5, -3]} intensity={0.7} color="#fff6ea" />
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 1]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 1.5, 2]} rotation-y={Math.PI / 2.5} scale={[3, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 1.5, -2]} rotation-y={-Math.PI / 1.6} scale={[3, 4, 1]} />
      </Environment>
    </>
  )
}

function Plinth() {
  return (
    <mesh position={[0, -0.015, 0]}>
      <cylinderGeometry args={[0.62, 0.64, 0.03, 96]} />
      <meshStandardMaterial color="#e2dacd" roughness={0.85} />
    </mesh>
  )
}

export default function FittingRoom() {
  const preset = useWardrobeStore((state) => state.bodyPreset)
  const shape = useMemo(() => createBodyShape(preset), [preset])

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 1.2, 4.5], fov: CAMERA_FOV, near: 0.1, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-label="3D mannequin. Drag to rotate, scroll or pinch to zoom."
    >
      <StudioLighting />
      <group scale={shape.scale}>
        <Mannequin shape={shape} />
      </group>
      <Plinth />
      <ContactShadows
        key={preset}
        frames={1}
        position={[0, 0.001, 0]}
        scale={1.6}
        resolution={512}
        blur={2.2}
        far={1.2}
        opacity={0.55}
        color="#3a332a"
      />
      <CameraRig />
    </Canvas>
  )
}
