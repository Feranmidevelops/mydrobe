import type { Garment } from '../../features/garments/garment.types'

/** Flat-lay outlines drawn in a 100 × 100 box for demo garment thumbnails. */
interface Silhouette {
  outline: string
  details: string
  buttons: [number, number][]
}

const SILHOUETTES = {
  shirtLong: {
    outline:
      'M39 10 C44 16 56 16 61 10 L78 15 L93 68 L84 71 L73 34 L74 92 Q50 95 26 92 L27 34 L16 71 L7 68 L22 15 Z',
    details: 'M39 10 L46 20 L50 15 L54 20 L61 10 M50 16 L50 92 M84 71 L86 64 M16 71 L14 64',
    buttons: [26, 40, 54, 68, 82].map((y) => [52, y] as [number, number]),
  },
  shirtShort: {
    outline:
      'M39 12 C44 18 56 18 61 12 L79 18 L92 40 L80 46 L73 36 L74 90 Q50 93 26 90 L27 36 L20 46 L8 40 L21 18 Z',
    details: 'M40 13 C45 21 55 21 60 13',
    buttons: [],
  },
  trousers: {
    outline: 'M28 7 L72 7 L74 14 L80 93 L59 93 L50 33 L41 93 L20 93 L26 14 Z',
    details: 'M26 14 L74 14 M50 14 L50 30 M31 14 C34 20 34 22 30 25 M69 14 C66 20 66 22 70 25',
    buttons: [[50, 10.5]],
  },
  coat: {
    outline:
      'M38 6 C44 12 56 12 62 6 L79 11 L94 74 L85 77 L74 30 L76 96 L24 96 L26 30 L15 77 L6 74 L21 11 Z',
    details: 'M38 6 L45 22 L50 44 L55 22 L62 6 M50 44 L50 96 M30 62 L40 62 M60 62 L70 62',
    buttons: [
      [54, 52],
      [54, 66],
    ],
  },
  generic: {
    outline: 'M24 18 Q24 12 30 12 L70 12 Q76 12 76 18 L76 82 Q76 88 70 88 L30 88 Q24 88 24 82 Z',
    details: '',
    buttons: [],
  },
} satisfies Record<string, Silhouette>

export function silhouetteFor(garment: Pick<Garment, 'category' | 'templateId'>): Silhouette {
  if (garment.templateId === 'shirt-short-sleeve') return SILHOUETTES.shirtShort
  switch (garment.category) {
    case 'shirt':
      return SILHOUETTES.shirtLong
    case 'trousers':
      return SILHOUETTES.trousers
    case 'outerwear':
      return SILHOUETTES.coat
    default:
      return SILHOUETTES.generic
  }
}
