import type { Rect, Rgb, RgbaImage } from './photo-mapping'

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Hue in degrees, saturation and lightness from 0 to 1. */
function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [0, 0, lightness]
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue =
    max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return [hue, saturation, lightness]
}

/** An everyday name for a garment colour, as someone might describe it. */
export function colorName(rgb: Rgb): string {
  const [hue, saturation, lightness] = rgbToHsl(rgb)
  if (lightness < 0.13) return 'black'
  if (saturation < 0.12 || (lightness > 0.85 && saturation < 0.25)) {
    if (lightness > 0.8) return 'white'
    if (lightness > 0.65) return 'light grey'
    if (lightness > 0.35) return 'grey'
    return 'charcoal'
  }
  if (hue >= 20 && hue < 55 && lightness > 0.55 && saturation < 0.5) return 'beige'
  if (hue >= 10 && hue < 45 && lightness < 0.45) return 'brown'
  if (hue >= 45 && hue < 75 && lightness < 0.4) return 'olive'
  if (hue < 12 || hue >= 345) return lightness < 0.3 ? 'burgundy' : lightness > 0.72 ? 'pink' : 'red'
  if (hue < 45) return 'orange'
  if (hue < 70) return 'yellow'
  if (hue < 160) return lightness < 0.3 ? 'dark green' : saturation < 0.35 ? 'sage' : 'green'
  if (hue < 195) return 'teal'
  if (hue < 250) return lightness < 0.3 ? 'navy' : lightness > 0.7 ? 'light blue' : 'blue'
  if (hue < 290) return 'purple'
  return 'pink'
}

/**
 * The garment's main colours, most common first: a small k-means over a sample
 * of its pixels. Colours covering less than 8% of the garment are left out.
 */
export function extractPalette(image: RgbaImage, mask: Uint8Array, rect: Rect, count = 3): Rgb[] {
  const samples: Rgb[] = []
  const stride = Math.max(1, Math.round(Math.sqrt((rect.width * rect.height) / 3000)))
  for (let y = rect.y; y < rect.y + rect.height; y += stride) {
    for (let x = rect.x; x < rect.x + rect.width; x += stride) {
      if (!mask[y * image.width + x]) continue
      const i = (y * image.width + x) * 4
      samples.push([image.data[i], image.data[i + 1], image.data[i + 2]])
    }
  }
  if (samples.length === 0) return []

  // Start from spread-out samples (each the farthest from those already picked)
  // so the result is the same every time.
  const distance = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const centres: Rgb[] = [samples[0]]
  while (centres.length < Math.min(count, samples.length)) {
    let farthest = samples[0]
    let farthestDistance = -1
    for (const sample of samples) {
      const nearest = Math.min(...centres.map((centre) => distance(sample, centre)))
      if (nearest > farthestDistance) {
        farthestDistance = nearest
        farthest = sample
      }
    }
    if (farthestDistance === 0) break
    centres.push(farthest)
  }

  const assignments = new Int32Array(samples.length)
  for (let round = 0; round < 8; round++) {
    samples.forEach((sample, i) => {
      let best = 0
      centres.forEach((centre, c) => {
        if (distance(sample, centre) < distance(sample, centres[best])) best = c
      })
      assignments[i] = best
    })
    centres.forEach((_, c) => {
      const members = samples.filter((__, i) => assignments[i] === c)
      if (members.length === 0) return
      centres[c] = [0, 1, 2].map((channel) =>
        Math.round(members.reduce((sum, member) => sum + member[channel], 0) / members.length),
      ) as Rgb
    })
  }

  return centres
    .map((centre, c) => ({ centre, share: assignments.filter((a) => a === c).length / samples.length }))
    .filter(({ share }) => share >= 0.08)
    .sort((a, b) => b.share - a.share)
    .map(({ centre }) => centre)
}
