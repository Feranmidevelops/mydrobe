import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { DEMO_GARMENTS } from '../features/garments/demo-garments'
import { getRenderability } from '../features/garments/garment.templates'
import { createBodyShape } from '../features/mannequin/body-shape'
import { GarmentMesh } from '../features/mannequin/GarmentMesh'
import { Mannequin } from '../features/mannequin/Mannequin'
import { StudioLighting } from '../features/mannequin/StudioLighting'
import type { CaptureFigure, CaptureShot } from './shots'
import { StudioBackdrop } from './StudioBackdrop'

function Figure({ figure }: { figure: CaptureFigure }) {
  const shape = useMemo(() => createBodyShape(figure.preset), [figure.preset])
  const worn = DEMO_GARMENTS.flatMap((garment) => {
    const renderability = getRenderability(garment)
    return figure.wearing.includes(garment.id) && renderability.renderable
      ? [{ garment, templateId: renderability.template.id }]
      : []
  })

  return (
    <group position={[figure.position[0], 0, figure.position[1]]} rotation-y={figure.turn}>
      <group scale={shape.scale}>
        <Mannequin shape={shape} />
        {worn.map(({ garment, templateId }) => (
          <GarmentMesh key={garment.id} garment={garment} templateId={templateId} shape={shape} />
        ))}
      </group>
    </group>
  )
}

function AimCamera({ target }: { target: [number, number, number] }) {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    camera.lookAt(...target)
    camera.updateMatrixWorld()
  }, [camera, target])
  return null
}

/** Renders a few frames so lighting and shadows settle, then flags the image as ready. */
function ReadySignal() {
  const frames = useRef(0)
  const invalidate = useThree((state) => state.invalidate)
  useFrame(() => {
    frames.current += 1
    if (frames.current < 6) invalidate()
    else document.body.dataset.captureReady = 'true'
  })
  return null
}

export function CaptureScene({ shot }: { shot: CaptureShot }) {
  return (
    <div style={{ width: shot.width, height: shot.height }}>
      <Canvas
        frameloop="demand"
        dpr={1}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: shot.camera.position, fov: shot.camera.fov, near: 0.1, far: 50 }}
      >
        <StudioLighting />
        <StudioBackdrop color={shot.backdrop} />
        {shot.figures.map((figure, index) => (
          <Figure key={index} figure={figure} />
        ))}
        <ContactShadows
          position={[0, -0.001, 0]}
          scale={shot.shadowScale}
          resolution={1024}
          blur={2.6}
          far={1.2}
          opacity={0.6}
          color="#3a2a1e"
        />
        <AimCamera target={shot.camera.target} />
        <ReadySignal />
      </Canvas>
    </div>
  )
}
