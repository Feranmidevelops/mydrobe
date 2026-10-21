import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { DirectionalLight } from 'three'
import { cameraAzimuth, ENVIRONMENT_INTENSITY, HEMISPHERE, lightPosition, RIG_LIGHTS } from './light-rig'
import { installStudioToneMapping, STUDIO_EXPOSURE, STUDIO_TONE_MAPPING } from './studio-tone-mapping'

/**
 * Soft studio light baked into a small environment map; no HDR download needed.
 * The lights and the environment turn with the camera, so the back of a
 * garment is lit the way its front is.
 */
export function StudioLighting() {
  const lights = useRef<(DirectionalLight | null)[]>([])

  // After the camera controls (priority -1) have moved the camera for this frame.
  // With frameloop="demand" every camera move already asks for a frame, so the
  // lights keep up with no extra frames of their own.
  useFrame(({ camera, gl, scene }) => {
    // The rig is calibrated for the studio's tone mapping. Frames run before
    // they draw, so this is in place before the first shader compiles.
    if (gl.toneMapping !== STUDIO_TONE_MAPPING) {
      installStudioToneMapping()
      gl.toneMapping = STUDIO_TONE_MAPPING
    }
    gl.toneMappingExposure = STUDIO_EXPOSURE

    const azimuth = cameraAzimuth(camera.position)
    RIG_LIGHTS.forEach((light, index) => lights.current[index]?.position.set(...lightPosition(light, azimuth)))
    scene.environmentRotation.y = azimuth
  })

  return (
    <>
      <hemisphereLight args={[HEMISPHERE.sky, HEMISPHERE.ground, HEMISPHERE.intensity]} />
      {RIG_LIGHTS.map((light, index) => (
        // The default target stays at the origin, so each light shines along its
        // position's direction: towards the mannequin, whatever its height.
        <directionalLight
          key={index}
          ref={(node) => {
            lights.current[index] = node
          }}
          position={lightPosition(light, 0)}
          intensity={light.intensity}
          color={light.color}
        />
      ))}
      <Environment frames={1} resolution={128} environmentIntensity={ENVIRONMENT_INTENSITY}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 1]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-4, 1.5, 2]} rotation-y={Math.PI / 2.5} scale={[3, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[4, 1.5, -2]} rotation-y={-Math.PI / 1.6} scale={[3, 4, 1]} />
      </Environment>
    </>
  )
}
