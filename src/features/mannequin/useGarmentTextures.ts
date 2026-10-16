import { useEffect, useMemo, useState } from 'react'
import { useWardrobeStore } from '../../store/wardrobe.store'
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
 * until a photo is ready (or if it can't be mapped). How a photo is getting
 * on goes in the store, so the page around the 3D view can say so.
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
    () =>
      source.kind === 'photo'
        ? { url: source.url, tolerance: source.backgroundTolerance, templateId, panel }
        : null,
    [source, templateId, panel],
  )
  const [loaded, setLoaded] = useState<{ request: object; textures: GarmentTextures } | null>(null)
  const setFitting = useWardrobeStore((state) => state.setFitting)
  const garmentId = garment.id

  useEffect(() => {
    if (!request) return
    let cancelled = false
    let created: GarmentTextures | null = null
    setFitting(garmentId, 'loading')
    createPhotoGarmentTextures(request.url, request.templateId, request.panel, request.tolerance)
      .then(({ textures }) => {
        if (cancelled) {
          disposeTextures(textures)
          return
        }
        created = textures
        setLoaded({ request, textures })
        setFitting(garmentId, null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.warn('Could not map the garment photo', error)
        setFitting(garmentId, 'failed')
      })
    return () => {
      cancelled = true
      if (created) disposeTextures(created)
      setFitting(garmentId, null)
    }
  }, [request, garmentId, setFitting])

  return demo ?? (loaded?.request === request ? loaded.textures : null)
}
