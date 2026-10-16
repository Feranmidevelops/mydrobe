import type { Garment } from './garment.types'

const CREATED = Date.UTC(2026, 9, 16)

function demo(garment: Omit<Garment, 'tags' | 'createdAt' | 'updatedAt'>): Garment {
  return { ...garment, tags: ['demo'], createdAt: CREATED, updatedAt: CREATED }
}

/**
 * Built-in wardrobe used until uploads land. The overcoat deliberately has no
 * template so the "shown in wardrobe, not on the mannequin" path stays exercised.
 */
export const DEMO_GARMENTS: Garment[] = [
  demo({
    id: 'demo-oxford-stripe',
    name: 'Oxford stripe shirt',
    category: 'shirt',
    templateId: 'shirt-long-sleeve',
    source: {
      kind: 'demo',
      fabric: { kind: 'stripes', base: '#f7f6f2', stripe: '#6f8fb8', stripeMm: 2.5, periodMm: 7 },
    },
  }),
  demo({
    id: 'demo-gingham',
    name: 'Navy gingham shirt',
    category: 'shirt',
    templateId: 'shirt-long-sleeve',
    source: { kind: 'demo', fabric: { kind: 'check', base: '#f5f4f0', line: '#24375e', periodMm: 9 } },
  }),
  demo({
    id: 'demo-linen-tee',
    name: 'Sage linen tee',
    category: 'shirt',
    templateId: 'shirt-short-sleeve',
    source: { kind: 'demo', fabric: { kind: 'solid', color: '#9caf94', finish: 'slub' } },
  }),
  demo({
    id: 'demo-charcoal-tee',
    name: 'Charcoal crew tee',
    category: 'shirt',
    templateId: 'shirt-short-sleeve',
    source: { kind: 'demo', fabric: { kind: 'solid', color: '#3b3b3d', finish: 'plain' } },
  }),
  demo({
    id: 'demo-indigo-denim',
    name: 'Indigo denim',
    category: 'trousers',
    templateId: 'trousers-straight',
    source: { kind: 'demo', fabric: { kind: 'denim', color: '#2f4a73' } },
  }),
  demo({
    id: 'demo-stone-chinos',
    name: 'Stone chinos',
    category: 'trousers',
    templateId: 'trousers-straight',
    source: { kind: 'demo', fabric: { kind: 'twill', color: '#c8b593' } },
  }),
  demo({
    id: 'demo-black-trousers',
    name: 'Black tailored trousers',
    category: 'trousers',
    templateId: 'trousers-straight',
    source: { kind: 'demo', fabric: { kind: 'twill', color: '#232325' } },
  }),
  demo({
    id: 'demo-camel-overcoat',
    name: 'Camel wool overcoat',
    category: 'outerwear',
    templateId: null,
    source: { kind: 'demo', fabric: { kind: 'solid', color: '#b98a5e', finish: 'wool' } },
  }),
]
