import { DoubleSide } from 'three'

/**
 * What every garment's material shares, whether it shows the fabric or plain
 * colour. ShaderWarmup compiles shaders from these same settings, so keep
 * anything a shader depends on (sides drawn, maps, transparency) in here.
 */
export const GARMENT_MATERIAL = { roughness: 0.88, side: DoubleSide } as const
