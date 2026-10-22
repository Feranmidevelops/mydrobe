import { CustomToneMapping, ShaderChunk } from 'three'

/*
 * How lit colours become screen colours. A garment should come out the colour
 * of its photo, so every level up to the shoulder is passed through unchanged
 * and only brighter highlights roll off towards white, never clipping.
 *
 * This is Khronos PBR Neutral's shoulder without its toe. Neutral subtracts up
 * to 0.04 from every pixel, expecting each surface to reflect a bright, even
 * environment at about 4%; this studio's environment is mostly dark, so the
 * toe only darkens dark fabrics (black trousers came out at sRGB 14 instead of
 * 33). React Three Fiber's default, ACES Filmic, reshapes the whole range,
 * darkening darks and greying whites.
 */

export const STUDIO_TONE_MAPPING = CustomToneMapping
/** The rig in light-rig.ts is calibrated for an exposure of 1. */
export const STUDIO_EXPOSURE = 1

/** Linear levels up to this come out exactly as lit; it is sRGB 231. */
export const SHOULDER_START = 0.8
/** How far the brightest highlights are washed towards white as they roll off. */
const DESATURATION = 0.15

export type LinearRgb = [number, number, number]

/** The studio curve on the CPU, the same as the GLSL below: linear RGB in, linear RGB out. */
export function studioToneMap(color: LinearRgb, exposure = STUDIO_EXPOSURE): LinearRgb {
  const exposed = color.map((channel) => channel * exposure) as LinearRgb
  const peak = Math.max(...exposed)
  if (peak < SHOULDER_START) return exposed
  const d = 1 - SHOULDER_START
  const newPeak = 1 - (d * d) / (peak + d - SHOULDER_START)
  const g = 1 - 1 / (DESATURATION * (peak - newPeak) + 1)
  return exposed.map((channel) => (channel * newPeak) / peak + (newPeak - (channel * newPeak) / peak) * g) as LinearRgb
}

/** three.js's stand-in for a custom curve, which it leaves for apps to replace. */
const PLACEHOLDER = 'vec3 CustomToneMapping( vec3 color ) { return color; }'

const GLSL = `vec3 CustomToneMapping( vec3 color ) {
	const float StartCompression = ${SHOULDER_START.toFixed(4)};
	const float Desaturation = ${DESATURATION.toFixed(4)};
	color *= toneMappingExposure;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}`

/**
 * Puts the studio curve in place of three.js's custom tone mapping, for every
 * shader compiled from now on. Safe to call more than once. Returns whether the
 * curve is in place: false means three.js changed its placeholder, and
 * CustomToneMapping would pass colours through untouched.
 */
export function installStudioToneMapping(): boolean {
  ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(PLACEHOLDER, GLSL)
  return ShaderChunk.tonemapping_pars_fragment.includes(GLSL)
}
