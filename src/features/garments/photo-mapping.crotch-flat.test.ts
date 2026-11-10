import { describe, expect, it } from 'vitest'
import { crotchFailures } from '../../test/crotch-failures'
import { crotchCases, type Crotch } from '../../test/flat-lay'

/*
 * The shaded top of the gap between trouser legs is opened only between the
 * legs' edges where they can be seen. Where the gap's top is flat, the legs'
 * straight edges, carried on up, would meet above it, over fabric: none of that
 * may go, whatever the trousers' colour, a sheen down the inside of the legs or
 * a patch over the crotch, at the working size, as a JPEG or a WebP, turned a
 * little either way (see src/test/flat-lay.ts).
 */

describe('the shaded top of the gap between trouser legs, at a flat-topped crotch', () => {
  it('keeps every bit of the fabric round a gap whose top is flat and 3 to 12 px across', () => {
    const crotches = [1.5, 3, 6].map((half): Crotch => ({ kind: 'flat', half, k: 0.1 }))
    expect(crotchCases(crotches).flatMap(({ label, lay, tolerances }) => crotchFailures(label, lay, tolerances))).toEqual([])
  }, 900_000)
})
