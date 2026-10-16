import { useEffect, useMemo, useState } from 'react'
import type { Garment, GarmentTemplateId } from '../garments/garment.types'
import type { BodyShape } from './body-shape'
import { createDemoGarmentTextures, type GarmentTextures } from './garment-textures'
import type { FrontPanel } from './geometry/garment-geometry'
import { createPhotoGarmentTextures } from './photo-textures'

function disposeTextures(textures: GarmentTextures) {
  textures.front.dispose()
  textures.swatch.dispose()
}

/**
 * Textures for a garment on the current template and body. Demo fabrics are
 * drawn straight away; photos load in the background, so this returns null
 * until a photo is ready (or if it can't be mapped).
 */
export function useGarmentTextures(
  garment: Garment,
  templateId: GarmentTemplateId,
  panel: FrontPanel,
  shape: BodyShape,
): GarmentTextures | null {
  const { source } = garment

  const demo = useMemo(
    () =>
      source.kind === 'demo' ? createDemoGarmentTextures(source.fabric, templateId, panel, shape) : null,
    [source, templateId, panel, shape],
  )
  useEffect(
    () => () => {
      if (demo) disposeTextures(demo)
    },
    [demo],
  )

  const request = useMemo(
    () => (source.kind === 'photo' ? { url: source.url, templateId, panel } : null),
    [source, templateId, panel],
  )
  const [loaded, setLoaded] = useState<{ request: object; textures: GarmentTextures } | null>(null)

  useEffect(() => {
    if (!request) return
    let cancelled = false
    let created: GarmentTextures | null = null
    createPhotoGarmentTextures(request.url, request.templateId, request.panel)
      .then(({ textures }) => {
        if (cancelled) {
          disposeTextures(textures)
          return
        }
        created = textures
        setLoaded({ request, textures })
      })
      .catch((error: unknown) => console.warn('Could not map the garment photo', error))
    return () => {
      cancelled = true
      if (created) disposeTextures(created)
    }
  }, [request])

  return demo ?? (loaded?.request === request ? loaded.textures : null)
}
