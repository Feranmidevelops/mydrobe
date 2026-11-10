import { describe, expect, it } from 'vitest'
import { crotchFailures } from '../../test/crotch-failures'
import { crotchCases, type Crotch } from '../../test/flat-lay'

/*
 * The shaded top of the gap between trouser legs is opened only as far up as
 * both legs' edges can be seen. Where the gap curves open from the crotch (half
 * its width growing as the square root of the depth), the legs' edges lower
 * down, carried on up as straight lines, would meet well above it, over fabric;
 * where it flares, they'd meet inside it. None of the fabric may go, whatever
 * the trousers' colour, a sheen down the inside of the legs or a patch over the
 * crotch, at the working size, as a JPEG or a WebP, turned a little either way
 * (see src/test/flat-lay.ts).
 */

describe('the shaded top of the gap between trouser legs, where the gap curves or flares open', () => {
  it('keeps every bit of the fabric round a gap that curves or flares open from the crotch', () => {
    const crotches: Crotch[] = [
      ...[1, 2, 3].map((a): Crotch => ({ kind: 'curved', a, k: 0.06 })),
      ...[1e-4, 3e-4].map((q): Crotch => ({ kind: 'flared', q, k: 0.05 })),
    ]
    expect(crotchCases(crotches).flatMap(({ label, lay, tolerances }) => crotchFailures(label, lay, tolerances))).toEqual([])
  }, 900_000)
})
