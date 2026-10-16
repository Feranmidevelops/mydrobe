import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Garment, GarmentTemplateId } from '../features/garments/garment.types'
import { createBodyShape } from '../features/mannequin/body-shape'
import { GarmentMesh } from '../features/mannequin/GarmentMesh'
import { Mannequin } from '../features/mannequin/Mannequin'
import { StudioLighting } from '../features/mannequin/StudioLighting'
import type { BodyPreset } from '../features/mannequin/viewer.types'
import { TRIAL_VIEWS } from './trial-views'

interface TrialSceneProps {
  garment: Garment
  templateId: GarmentTemplateId
  preset: BodyPreset
}

export function TrialScene({ garment, templateId, preset }: TrialSceneProps) {
  const shape = useMemo(() => createBodyShape(preset), [preset])

  return (
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 1, 4.4], fov: 30, near: 0.1, far: 40 }}>
      <StudioLighting />
      {TRIAL_VIEWS.map((view) => (
        <group key={view.label} position={[view.x, 0, 0]} rotation-y={view.turn}>
          <group scale={shape.scale}>
            <Mannequin shape={shape} />
            <GarmentMesh garment={garment} templateId={templateId} shape={shape} />
          </group>
        </group>
      ))}
      <ContactShadows position={[0, -0.001, 0]} scale={4} blur={2.4} far={1.2} opacity={0.5} color="#3a2a1e" />
      <OrbitControls target={[0, 0.9, 0]} enablePan={false} makeDefault />
    </Canvas>
  )
}
