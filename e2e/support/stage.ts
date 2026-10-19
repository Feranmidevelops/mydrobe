import type { Page } from '@playwright/test'
import { CAMERA_FOV, homePose } from '../../src/features/mannequin/camera-views.ts'
import { stageCanvas } from './fitting-room.ts'
import { nextFrames } from './marks.ts'
import { decodePng, type Pixels } from './png.ts'

/*
 * Reading the 3D view from screenshots. The canvas renders on demand and
 * doesn't keep its drawing buffer, so screenshots are the reliable way to see
 * what's on it. Shapes are checked with generous colour measures, never exact
 * pixels: SwiftShader, real GPUs and different pixel ratios all shade a little
 * differently.
 */

export interface StageShot extends Pixels {
  cssWidth: number
  cssHeight: number
  /** Device pixels per CSS pixel. */
  scale: number
}
export interface Region {
  x: number
  y: number
  width: number
  height: number
}
/** A box on the mannequin's centre plane, in metres (floor at y = 0, facing the camera). */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

export const TORSO: Box = { left: -0.09, right: 0.09, top: 1.35, bottom: 1.0 }
export const LEGS: Box = { left: -0.17, right: 0.17, top: 0.7, bottom: 0.3 }
/** The whole figure, stopping above the overlays along the bottom of the stage. */
export const FIGURE: Box = { left: -0.45, right: 0.45, top: 1.8, bottom: 0.15 }
/** Hues of the generated photos: red shirt, green pocket, blue trousers. */
export const HUE = { red: 0, green: 134, blue: 226 } as const

/** A screenshot of the canvas once it has stopped changing: two identical shots in a row. */
export async function settledStageShot(page: Page, { intervalMs = 250, timeout = 20_000 } = {}): Promise<StageShot> {
  const canvas = stageCanvas(page)
  await nextFrames(page)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The 3D canvas is not on screen')
  const deadline = Date.now() + timeout
  // animations: 'disabled' keeps spinners in the overlays from changing pixels forever.
  let previous = await canvas.screenshot({ animations: 'disabled' })
  for (;;) {
    await page.waitForTimeout(intervalMs) // a sampling interval, not a wait for some state
    const next = await canvas.screenshot({ animations: 'disabled' })
    if (next.equals(previous)) {
      const pixels = decodePng(next)
      return { ...pixels, cssWidth: box.width, cssHeight: box.height, scale: pixels.width / box.width }
    }
    if (Date.now() > deadline) throw new Error('The 3D view kept changing')
    previous = next
  }
}

/** Where a point on the mannequin's centre plane lands in the home view, in CSS px from the canvas's top left. */
export function homeProject(x: number, y: number, width: number, height: number): [number, number] {
  const {
    position: [, cameraY, cameraZ],
    target: [, targetY],
  } = homePose(width, height)
  const length = Math.hypot(targetY - cameraY, cameraZ)
  // The camera sits on +z looking at (0, targetY, 0).
  const [forwardY, forwardZ] = [(targetY - cameraY) / length, -cameraZ / length]
  const [toY, toZ] = [y - cameraY, -cameraZ]
  const depth = forwardY * toY + forwardZ * toZ
  const up = -forwardZ * toY + forwardY * toZ
  const pixelsPerMetre = height / (2 * depth * Math.tan((CAMERA_FOV * Math.PI) / 360))
  return [width / 2 + x * pixelsPerMetre, height / 2 - up * pixelsPerMetre]
}

/** The device-pixel rectangle a box on the mannequin covers in the home view. */
export function homeRegion(shot: StageShot, box: Box): Region {
  const [x0, y0] = homeProject(box.left, box.top, shot.cssWidth, shot.cssHeight)
  const [x1, y1] = homeProject(box.right, box.bottom, shot.cssWidth, shot.cssHeight)
  const toPixels = (value: number, max: number) => Math.min(Math.max(Math.round(value * shot.scale), 0), max)
  const x = toPixels(x0, shot.width)
  const y = toPixels(y0, shot.height)
  return { x, y, width: toPixels(x1, shot.width) - x, height: toPixels(y1, shot.height) - y }
}

/** Garment pixels only: the mannequin, plinth, stage, shadow and overlays are all close to grey. */
function isHue(r: number, g: number, b: number, hue: number) {
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  if (chroma < 50) return false
  const h = 60 * (max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4)
  return Math.abs(((((h - hue) % 360) + 540) % 360) - 180) <= 30
}

function scan(shot: StageShot, region: Region, hit: (i: number) => boolean) {
  let hits = 0
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) if (hit((y * shot.width + x) * 4)) hits++
  }
  return { hits, total: Math.max(1, region.width * region.height) }
}

const ofHue = (shot: StageShot, hue: number) => (i: number) => isHue(shot.data[i], shot.data[i + 1], shot.data[i + 2], hue)

/** The share of a region in a hue. */
export function hueShare(shot: StageShot, region: Region, hue: number) {
  const { hits, total } = scan(shot, region, ofHue(shot, hue))
  return hits / total
}

/** The area of a region in a hue, in CSS px², so limits hold at any pixel ratio. */
export const hueCount = (shot: StageShot, region: Region, hue: number) =>
  scan(shot, region, ofHue(shot, hue)).hits / shot.scale ** 2

/** The share of a region that changed noticeably between two shots of the same size. */
export function changedShare(a: StageShot, b: StageShot, region: Region, threshold = 40) {
  const { hits, total } = scan(a, region, (i) => {
    const difference = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])
    return difference > threshold
  })
  return hits / total
}

/** How wide a hue runs across the view at height y on the mannequin (CSS px, median of three rows). */
export function garmentWidth(shot: StageShot, y: number, hue: number) {
  const widths = [-0.02, 0, 0.02].map((offset) => {
    const row = Math.round(homeProject(0, y + offset, shot.cssWidth, shot.cssHeight)[1] * shot.scale)
    let left = Infinity
    let right = -Infinity
    for (let x = 0; x < shot.width; x++) {
      const i = (row * shot.width + x) * 4
      if (isHue(shot.data[i], shot.data[i + 1], shot.data[i + 2], hue)) {
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
    return right >= left ? (right - left + 1) / shot.scale : 0
  })
  return widths.sort((a, b) => a - b)[1]
}

/**
 * Drags across the canvas centre with the mouse. The camera applies at most one
 * move per drawn frame, so a frame passes between moves; a drag of the canvas's
 * height turns the mannequin a full circle.
 */
export async function dragStage(page: Page, dx: number, dy = 0, steps = 24) {
  const box = await stageCanvas(page).boundingBox()
  if (!box) throw new Error('The 3D canvas is not on screen')
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps)
    await nextFrames(page)
  }
  await page.mouse.up()
}
