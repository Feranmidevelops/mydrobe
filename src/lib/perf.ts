/**
 * Named moments in the app's life, as User Timing marks. They cost microseconds,
 * carry no personal data and show up in DevTools' performance panel, so they're
 * always on. The browser tests and the performance suite wait on them.
 */
export const PERF_MARKS = {
  /** The fitting room page is on screen, before the saved wardrobe or the 3D view. */
  fittingRoomShown: 'mydrobe:fitting-room-shown',
  /** The saved wardrobe has been read (or saving turned out to be unavailable). */
  wardrobeReady: 'mydrobe:wardrobe-ready',
  canvasCreated: 'mydrobe:canvas-created',
  /** The 3D view has drawn its first frame. */
  firstFrame: 'mydrobe:first-frame',
  /** A photo garment started being fitted onto the mannequin, and finished or failed. */
  fitStart: 'mydrobe:fit-start',
  garmentFitted: 'mydrobe:garment-fitted',
  fitFailed: 'mydrobe:fit-failed',
  /** How long one photo analysis took, as a measure. */
  photoAnalysis: 'mydrobe:photo-analysis',
} as const

/**
 * True when the page was opened with ?perf. The performance suite uses it to
 * load a probe that records every frame; normal visits never download it.
 */
export const PERF_PROBE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf')

/** One frame the 3D view drew: when it started, and the CPU time spent updating and drawing it. */
export interface FrameSample {
  start: number
  cpu: number
}

export interface RendererSnapshot {
  geometries: number
  textures: number
  programs: number
  /** Draw calls and triangles in the last frame drawn. */
  calls: number
  triangles: number
  frames: number
  pixelRatio: number
  drawingBuffer: { width: number; height: number; samples: number; estimatedBytes: number }
  gpu: string
}

/** The textures the scene uses, sorted by kind, with a rough size in GPU memory. */
export interface TextureEstimate {
  count: number
  canvas: number
  renderTargets: number
  other: number
  estimatedBytes: number
}

/** What the ?perf probe exposes on window.__MYDROBE_PERF__. */
export interface MydrobePerfProbe {
  frames(): FrameSample[]
  clearFrames(): void
  renderer(): RendererSnapshot
  textures(): TextureEstimate
  geometryBytes(): number
  /** When the body preset last changed, as a performance.now() reading. */
  lastPresetChange(): number | null
}

declare global {
  interface Window {
    __MYDROBE_PERF__?: MydrobePerfProbe
  }
}

export function mark(name: string, detail?: unknown) {
  try {
    performance.mark(name, { detail })
  } catch {
    // No User Timing here: an old browser or a test environment.
  }
}

/** Records the time from `start` (a performance.now() reading) until now. */
export function measure(name: string, start: number, detail?: unknown) {
  try {
    performance.measure(name, { start, end: performance.now(), detail })
  } catch {
    // As above.
  }
}
