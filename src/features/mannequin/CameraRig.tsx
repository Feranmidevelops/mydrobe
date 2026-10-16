import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { HOME_POLAR, homePose, nearestAngle, VIEW_AZIMUTH } from './camera-views'

const { ACTION } = CameraControlsImpl

/** Orbit-style controls: drag to rotate a full 360°, scroll or pinch to zoom, no panning. */
export function CameraRig() {
  const controlsRef = useRef<CameraControlsImpl>(null)
  const viewRequest = useWardrobeStore((state) => state.viewRequest)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)

  // Re-frame whenever the stage changes size, e.g. rotating a phone.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || width === 0 || height === 0) return
    const { position, target } = homePose(width, height)
    void controls.setLookAt(...position, ...target, false)
    controls.saveState()
  }, [width, height])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !viewRequest) return
    if (viewRequest.view === 'reset') {
      void controls.reset(true)
      return
    }
    const azimuth = nearestAngle(controls.azimuthAngle, VIEW_AZIMUTH[viewRequest.view])
    void controls.rotateTo(azimuth, HOME_POLAR, true)
  }, [viewRequest])

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={1.4}
      maxDistance={7}
      minPolarAngle={Math.PI * 0.18}
      maxPolarAngle={Math.PI * 0.56}
      smoothTime={0.25}
      draggingSmoothTime={0.08}
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.DOLLY,
        right: ACTION.NONE,
        wheel: ACTION.DOLLY,
      }}
      touches={{ one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_DOLLY, three: ACTION.NONE }}
    />
  )
}
