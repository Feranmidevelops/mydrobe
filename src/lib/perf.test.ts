import { afterEach, describe, expect, it, vi } from 'vitest'
import { mark, measure, PERF_MARKS } from './perf'

describe('performance marks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    performance.clearMarks()
    performance.clearMeasures()
  })

  it('records named moments with their details', () => {
    mark(PERF_MARKS.garmentFitted, { garmentId: 'navy-shirt' })
    const [entry] = performance.getEntriesByName(PERF_MARKS.garmentFitted)
    expect((entry as PerformanceMark).detail).toEqual({ garmentId: 'navy-shirt' })
  })

  it('records how long something took', () => {
    measure(PERF_MARKS.photoAnalysis, performance.now() - 5)
    expect(performance.getEntriesByName(PERF_MARKS.photoAnalysis)).toHaveLength(1)
  })

  it('never lets a missing or broken timing API break the app', () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new Error('not supported')
    })
    expect(() => mark(PERF_MARKS.firstFrame)).not.toThrow()
  })
})
