import type { Vector3Tuple } from 'three'

/*
 * The studio's lights are placed relative to the camera, not the room, like a
 * turntable studio: whichever side of the mannequin faces the viewer is lit
 * the way the front is. Angles are measured from the camera, so the numbers
 * below read as if the camera were at the front (+z) looking at the mannequin.
 */

/** A directional light, placed by where it sits as seen from the mannequin. */
export interface RigLight {
  /** Degrees round from the camera; positive is to the viewer's right. */
  azimuth: number
  /** Degrees up from level; negative is from below. */
  elevation: number
  intensity: number
  color: string
}

/** The main light: high, and off to the viewer's left. */
export const KEY_LIGHT: RigLight = { azimuth: -40, elevation: 46, intensity: 1.5, color: '#ffffff' }
/** A warm light from behind, on the viewer's right, picking out that edge. */
export const FILL_LIGHT: RigLight = { azimuth: 135, elevation: 30, intensity: 0.7, color: '#fff6ea' }

/** How far from the mannequin a directional light is placed; only its direction matters. */
const LIGHT_DISTANCE = 5

const DEGREE = Math.PI / 180

/**
 * The camera's azimuth round the mannequin's vertical axis, 0 at the front
 * (+z) and π/2 from the mannequin's left (+x), as camera-views.ts measures it.
 */
export function cameraAzimuth(position: { x: number; z: number }): number {
  return Math.atan2(position.x, position.z)
}

/**
 * Where a light sits in the world when the camera is at the given azimuth.
 * Turning the camera turns the light by the same angle round the vertical
 * axis, which is how three.js turns the environment by
 * scene.environmentRotation.y, so the lights and the environment stay together.
 */
export function lightPosition(light: RigLight, azimuth: number, distance = LIGHT_DISTANCE): Vector3Tuple {
  const around = azimuth + light.azimuth * DEGREE
  const up = light.elevation * DEGREE
  return [
    distance * Math.cos(up) * Math.sin(around),
    distance * Math.sin(up),
    distance * Math.cos(up) * Math.cos(around),
  ]
}
