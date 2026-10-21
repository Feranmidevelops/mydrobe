import { Color, ShaderChunk } from 'three'
import { describe, expect, it } from 'vitest'
import { ENVIRONMENT_FACE_ON_SHARE, faceOnShare } from './light-rig'
import { installStudioToneMapping, SHOULDER_START, STUDIO_EXPOSURE, studioToneMap, type LinearRgb } from './studio-tone-mapping'

/** A colour as three.js works with it: linear RGB from an sRGB hex. */
const linear = (hex: string): LinearRgb => {
  const { r, g, b } = new Color(hex)
  return [r, g, b]
}
/** What a linear level shows as on screen, 0–1. */
const toScreen = (level: number) => (level <= 0.0031308 ? 12.92 * level : 1.055 * level ** (1 / 2.4) - 0.055)

describe('installStudioToneMapping', () => {
  it("replaces three.js's custom tone mapping placeholder with the studio curve, once", () => {
    expect(installStudioToneMapping()).toBe(true)
    expect(installStudioToneMapping()).toBe(true)
    const chunk = ShaderChunk.tonemapping_pars_fragment
    expect(chunk.match(/vec3 CustomToneMapping\(/g)).toHaveLength(1)
    expect(chunk).toContain(`StartCompression = ${SHOULDER_START.toFixed(4)}`)
  })
})

describe('studioToneMap', () => {
  it.each([
    ['black tailored trousers', '#232325'],
    ['charcoal crew tee', '#3b3b3d'],
    ['indigo denim', '#2f4a73'],
    ['stone chinos', '#c8b593'],
  ])('passes the colour of %s straight through', (_, hex) => {
    const colour = linear(hex)
    studioToneMap(colour).forEach((channel, i) => expect(channel).toBeCloseTo(colour[i], 6))
  })

  it('rolls highlights off towards white without ever clipping', () => {
    let previous = 0
    for (let level = 0; level <= 20; level += 0.05) {
      const [out] = studioToneMap([level, level, level])
      expect(out).toBeGreaterThanOrEqual(previous)
      expect(out).toBeLessThan(1)
      previous = out
    }
    expect(studioToneMap([1.5, 1.5, 1.5])[0]).toBeGreaterThan(0.9)
  })

  it('keeps a bright colour in its hue as it rolls off', () => {
    const [r, g, b] = studioToneMap([1.6, 0.9, 0.3])
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })
})

describe('the studio calibration', () => {
  const gain = faceOnShare() + ENVIRONMENT_FACE_ON_SHARE

  it('lights cloth facing the camera to about its own colour', () => {
    expect(gain * STUDIO_EXPOSURE).toBeGreaterThan(0.9)
    expect(gain * STUDIO_EXPOSURE).toBeLessThan(1.15)
  })

  it('shows white cloth facing the camera as white', () => {
    const [level] = studioToneMap([gain, gain, gain])
    expect(toScreen(level)).toBeGreaterThanOrEqual(0.9)
  })

  it('shows mid-grey cloth facing the camera within a few levels of its colour', () => {
    const grey = linear('#808080')
    const [level] = studioToneMap(grey.map((channel) => channel * gain) as LinearRgb)
    expect(Math.abs(toScreen(level) * 255 - 128)).toBeLessThan(12)
  })
})
