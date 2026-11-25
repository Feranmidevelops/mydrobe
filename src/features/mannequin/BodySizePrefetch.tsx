import { useEffect } from 'react'
import { whenIdle } from '../../lib/idle'
import { mark, PERF_MARKS } from '../../lib/perf'
import type { GarmentTemplateId } from '../garments/garment.types'
import { unbuiltBodySizes } from './body-geometry'
import { useFirstFrameDrawn } from './useFirstFrameDrawn'

/** Below this much idle time left, the next step waits for another idle moment. */
const STEP_BUDGET_MS = 10

/**
 * Builds every body size of the mannequin and of the pieces worn while the
 * page stands idle, a geometry at a time, so switching size finds the new one
 * ready instead of working it out while you wait.
 */
export function BodySizePrefetch({ templateIds }: { templateIds: readonly GarmentTemplateId[] }) {
  const drawn = useFirstFrameDrawn()
  const worn = templateIds.join()

  useEffect(() => {
    if (!drawn) return
    const templates = worn ? (worn.split(',') as GarmentTemplateId[]) : []
    const steps = unbuiltBodySizes(templates)
    let cancel = () => {}
    const next = (deadline?: IdleDeadline) => {
      do steps.shift()?.()
      while (steps.length > 0 && (deadline?.timeRemaining() ?? 0) > STEP_BUDGET_MS)
      if (steps.length > 0) cancel = whenIdle(next)
      else mark(PERF_MARKS.bodySizesReady, { templates })
    }
    cancel = whenIdle(next)
    return () => cancel()
  }, [drawn, worn])

  return null
}
