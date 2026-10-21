import { Euler, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { homePose, VIEW_AZIMUTH } from './camera-views'
import { cameraAzimuth, KEY_LIGHT, lightPosition, RIM_LIGHT, shareFacing, UNDER_LIGHT } from './light-rig'

/** Where the camera sits at an azimuth round the mannequin, at the home view's distance and height. */
function cameraAt(azimuth: number) {
  const [, y, distance] = homePose(1100, 860).position
  return new Vector3(distance * Math.sin(azimuth), y, distance * Math.cos(azimuth))
}

const AZIMUTHS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

describe('cameraAzimuth', () => {
  it.each(Object.entries(VIEW_AZIMUTH))('reads the %s view back from where its camera sits', (_, azimuth) => {
    expect(cameraAzimuth(cameraAt(azimuth))).toBeCloseTo(azimuth)
  })
})

describe('lightPosition', () => {
  /** The light's angle from the camera, and which side of the view it is on (+1 the viewer's right). */
  function asSeenFromCamera(position: Vector3, camera: Vector3) {
    const toCamera = new Vector3(camera.x, 0, camera.z).normalize()
    const toLight = position.clone().normalize()
    const side = Math.sign(new Vector3().crossVectors(toCamera, toLight).y)
    return { angle: toCamera.angleTo(new Vector3(toLight.x, 0, toLight.z).normalize()), height: toLight.y, side }
  }

  it.each([
    ['key', KEY_LIGHT],
    ['rim', RIM_LIGHT],
  ])('keeps the %s light in the same place relative to the camera all the way round', (_, light) => {
    const front = asSeenFromCamera(new Vector3(...lightPosition(light, 0)), cameraAt(0))
    for (const azimuth of AZIMUTHS) {
      const seen = asSeenFromCamera(new Vector3(...lightPosition(light, azimuth)), cameraAt(azimuth))
      expect(seen.angle).toBeCloseTo(front.angle)
      expect(seen.height).toBeCloseTo(front.height)
      expect(seen.side).toBe(front.side)
    }
  })

  it('puts the key light in front of the mannequin, high and to the left, from every side', () => {
    for (const azimuth of AZIMUTHS) {
      const seen = asSeenFromCamera(new Vector3(...lightPosition(KEY_LIGHT, azimuth)), cameraAt(azimuth))
      expect(seen.angle).toBeLessThan(Math.PI / 2)
      expect(seen.height).toBeGreaterThan(0.5)
      expect(seen.side).toBe(-1)
    }
  })

  it('keeps the low fill in front of the mannequin and below it, from every side', () => {
    for (const azimuth of AZIMUTHS) {
      const seen = asSeenFromCamera(new Vector3(...lightPosition(UNDER_LIGHT, azimuth)), cameraAt(azimuth))
      expect(seen.angle).toBeLessThan(Math.PI / 4)
      expect(seen.height).toBeLessThan(0)
    }
  })

  it('turns a light the way scene.environmentRotation turns the environment', () => {
    for (const azimuth of AZIMUTHS) {
      const turned = new Vector3(...lightPosition(KEY_LIGHT, 0)).applyEuler(new Euler(0, azimuth, 0))
      const [x, y, z] = lightPosition(KEY_LIGHT, azimuth)
      expect(turned.x).toBeCloseTo(x)
      expect(turned.y).toBeCloseTo(y)
      expect(turned.z).toBeCloseTo(z)
    }
  })
})

describe('shareFacing', () => {
  it('keeps cloth facing down under the bust or a fuller belly at least half as bright as cloth facing the camera', () => {
    expect(shareFacing(-45) / shareFacing(0)).toBeGreaterThan(0.45)
  })

  it('still lights cloth facing up more than cloth facing down, so the body reads as round', () => {
    expect(shareFacing(30)).toBeGreaterThan(1.3 * shareFacing(-30))
  })
})
