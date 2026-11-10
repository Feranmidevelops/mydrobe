import { estimateBackground, garmentMask } from '../features/garments/photo-mapping'
import { flatLay, type FlatLay } from './flat-lay'

/**
 * Draws `lay` and cuts the trousers out at each of `tolerances`, returning a
 * line for each cut that takes any fabric or, at any of `opensAt`, leaves any
 * of the sliver at the top of the gap between the legs.
 */
export function crotchFailures(label: string, lay: FlatLay, tolerances: number[], opensAt: number[] = []) {
  const { image, inFabric, sliver } = flatLay(lay)
  const background = estimateBackground(image)
  const found: string[] = []
  for (const tolerance of tolerances) {
    const mask = garmentMask(image, background, tolerance)
    let cut = 0
    let left = 0
    for (let i = 0; i < mask.length; i++) {
      if (inFabric[i] && !mask[i]) cut++
      if (sliver[i] && mask[i]) left++
    }
    if (cut > 0 || (opensAt.includes(tolerance) && left > 0)) found.push(`${label} at ${tolerance}: ${cut} fabric cut, ${left} sliver left`)
  }
  return found
}
