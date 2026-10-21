import { Color, type Vector3Tuple } from 'three'

/*
 * The studio's lights are placed relative to the camera, not the room, like a
 * turntable studio: whichever side of the mannequin faces the viewer is lit
 * the way the front is. Angles are measured from the camera, so the numbers
 * below read as if the camera were at the front (+z) looking at the mannequin.
 *
 * The intensities are calibrated so that cloth facing the camera comes out the
 * colour of its photo, for the tone mapping and exposure in
 * studio-tone-mapping.ts: the lights add up to about the light of an even white
 * sky (an irradiance of π), with the key doing most of it so the body still
 * reads as round.
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

/** The main light: a classic three-quarter key, high and off to the viewer's left. */
export const KEY_LIGHT: RigLight = { azimuth: -35, elevation: 35, intensity: 2.2, color: '#ffffff' }
/** A warm light from behind, on the viewer's right, picking out that edge. */
export const RIM_LIGHT: RigLight = { azimuth: 135, elevation: 30, intensity: 0.8, color: '#fff6ea' }
/**
 * A weak light from low in front, like a reflector on the floor, so cloth that
 * faces down under the bust or a fuller belly isn't left in a dark band.
 */
export const UNDER_LIGHT: RigLight = { azimuth: 0, elevation: -30, intensity: 0.6, color: '#ffffff' }

/** Soft light from everywhere: white from above, the warm floor's colour from below. */
export const HEMISPHERE = { sky: '#ffffff', ground: '#d8d0c3', intensity: 1 }

/**
 * The baked soft boxes (Lightformers in StudioLighting.tsx), as scene.environmentIntensity.
 * Rendered on their own they light cloth facing the camera to about 13% of its colour.
 */
export const ENVIRONMENT_INTENSITY = 1
export const ENVIRONMENT_FACE_ON_SHARE = 0.13 * ENVIRONMENT_INTENSITY

export const RIG_LIGHTS: readonly RigLight[] = [KEY_LIGHT, RIM_LIGHT, UNDER_LIGHT]

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

const luminance = (hex: string) => {
  const { r, g, b } = new Color(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The share of its own colour that matt cloth reflects from the hemisphere and
 * directional lights, before tone mapping, when it faces `tilt` degrees up from
 * straight at the camera (negative faces down): Lambert's cosine law, with the
 * hemisphere blending from ground to sky as three.js does.
 */
export function shareFacing(tilt: number, lights: readonly RigLight[] = RIG_LIGHTS, hemisphere = HEMISPHERE): number {
  const normal = lightPosition({ azimuth: 0, elevation: tilt, intensity: 0, color: '' }, 0, 1)
  const skyward = 0.5 * normal[1] + 0.5
  const ambient =
    hemisphere.intensity * (luminance(hemisphere.ground) * (1 - skyward) + luminance(hemisphere.sky) * skyward)
  const direct = lights.reduce((sum, light) => {
    const [x, y, z] = lightPosition(light, 0, 1)
    const facing = Math.max(0, x * normal[0] + y * normal[1] + z * normal[2])
    return sum + light.intensity * luminance(light.color) * facing
  }, 0)
  return (ambient + direct) / Math.PI
}

/**
 * The same for upright cloth facing the camera. Add ENVIRONMENT_FACE_ON_SHARE
 * for the whole rig.
 */
export const faceOnShare = (lights: readonly RigLight[] = RIG_LIGHTS, hemisphere = HEMISPHERE) =>
  shareFacing(0, lights, hemisphere)
