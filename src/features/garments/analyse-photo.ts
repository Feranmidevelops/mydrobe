import { measure, PERF_MARKS } from '../../lib/perf'
import type { GarmentTemplateId } from './garment.types'
import { analyseGarmentPhoto, PhotoMappingError, type PhotoAnalysis } from './photo-analysis'
import { DEFAULT_BACKGROUND_TOLERANCE, type RgbaImage } from './photo-mapping'

export interface AnalysisRequest {
  id: number
  image: RgbaImage
  templateId: GarmentTemplateId
  tolerance: number
}

export type AnalysisResponse =
  | { id: number; analysis: PhotoAnalysis }
  | { id: number; error: string; mapping: boolean }

type Pending = { resolve: (analysis: PhotoAnalysis) => void; reject: (error: Error) => void }

const pending = new Map<number, Pending>()
let nextId = 1
let worker: Worker | null | undefined

function rejectAll(error: Error) {
  for (const { reject } of pending.values()) reject(error)
  pending.clear()
}

/** The shared analysis worker, or null where workers aren't available (tests, old browsers). */
function analysisWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined') return (worker = null)
  try {
    worker = new Worker(new URL('./photo-analysis.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return (worker = null)
  }
  worker.onmessage = ({ data }: MessageEvent<AnalysisResponse>) => {
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    if ('analysis' in data) entry.resolve(data.analysis)
    else entry.reject(data.mapping ? new PhotoMappingError(data.error) : new Error(data.error))
  }
  worker.onerror = () => {
    // Fall back to the main thread from now on, and fail what was in flight.
    worker?.terminate()
    worker = null
    rejectAll(new Error('The photo analysis stopped unexpectedly. Please try again.'))
  }
  return worker
}

/**
 * Recent analyses, keyed by photo, template and tolerance. Switching body
 * shape rebuilds a garment's textures but never needs a fresh analysis.
 */
const MAX_REMEMBERED = 8
const remembered = new Map<string, Promise<PhotoAnalysis>>()

/** Loads and analyses the photo at `url`, reusing a recent result when there is one. */
export function analysePhotoAt(
  url: string,
  load: (url: string) => Promise<RgbaImage>,
  templateId: GarmentTemplateId,
  tolerance: number = DEFAULT_BACKGROUND_TOLERANCE,
): Promise<PhotoAnalysis> {
  const key = `${templateId}|${tolerance}|${url}`
  const existing = remembered.get(key)
  if (existing) {
    // Refresh its place so the most recently used analyses are kept longest.
    remembered.delete(key)
    remembered.set(key, existing)
    return existing
  }
  const started = performance.now()
  const analysis = load(url).then((image) => analysePhoto(image, templateId, tolerance))
  analysis.then(
    () => measure(PERF_MARKS.photoAnalysis, started, { templateId }),
    () => remembered.delete(key),
  )
  remembered.set(key, analysis)
  while (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!)
  return analysis
}

/** Drops remembered analyses of a photo, e.g. once it's removed from the wardrobe. */
export function forgetPhoto(url: string) {
  for (const key of [...remembered.keys()]) if (key.endsWith(`|${url}`)) remembered.delete(key)
}

/**
 * Runs the photo mapping off the main thread when possible, so the page stays
 * responsive on slower phones. The image's pixel buffer is handed to the
 * worker, so callers mustn't use `image` afterwards; the analysis returns it.
 */
export function analysePhoto(
  image: RgbaImage,
  templateId: GarmentTemplateId,
  tolerance: number = DEFAULT_BACKGROUND_TOLERANCE,
): Promise<PhotoAnalysis> {
  const target = analysisWorker()
  if (!target) return Promise.resolve().then(() => analyseGarmentPhoto(image, templateId, tolerance))

  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const request: AnalysisRequest = { id, image, templateId, tolerance }
    target.postMessage(request, [image.data.buffer])
  })
}
