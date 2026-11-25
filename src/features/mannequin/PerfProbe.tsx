import { addAfterEffect, addEffect, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  FloatType,
  HalfFloatType,
  Vector2,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'
import type { FrameSample, RendererSnapshot, TextureEstimate } from '../../lib/perf'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { geometryBuilds } from './body-geometry'

/** Well over a minute of frames at 60 FPS. */
const MAX_FRAMES = 5000

function rendererSnapshot(gl: WebGLRenderer): RendererSnapshot {
  const context = gl.getContext()
  const size = gl.getDrawingBufferSize(new Vector2())
  const samples = Number(context.getParameter(context.SAMPLES)) || 0
  // Colour plus depth and stencil, 4 bytes each per sample, and a resolved colour buffer when multisampled.
  const pixels = size.x * size.y
  const estimatedBytes = pixels * 8 * Math.max(1, samples) + (samples > 0 ? pixels * 4 : 0)
  const debug = context.getExtension('WEBGL_debug_renderer_info')
  return {
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    programs: gl.info.programs?.length ?? 0,
    calls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    frames: gl.info.render.frame,
    pixelRatio: gl.getPixelRatio(),
    drawingBuffer: { width: size.x, height: size.y, samples, estimatedBytes },
    gpu: String(context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER)),
  }
}

const texturesOf = (material: Material) =>
  Object.values(material).filter((value): value is Texture => Boolean((value as Texture | null)?.isTexture))

function textureEstimate(scene: Scene): TextureEstimate {
  const seen = new Set<Texture>()
  scene.traverse((object) => {
    const material = (object as Mesh).material as Material | Material[] | undefined
    if (!material) return
    for (const each of Array.isArray(material) ? material : [material]) for (const texture of texturesOf(each)) seen.add(texture)
  })
  if (scene.environment) seen.add(scene.environment)

  const estimate: TextureEstimate = { count: seen.size, canvas: 0, renderTargets: 0, other: 0, estimatedBytes: 0 }
  for (const texture of seen) {
    // Constructor names are minified, so tell the kinds apart by three.js's flags.
    const flags = texture as Texture & { isCanvasTexture?: boolean; isRenderTargetTexture?: boolean; isCubeTexture?: boolean }
    if (flags.isCanvasTexture) estimate.canvas++
    else if (flags.isRenderTargetTexture) estimate.renderTargets++
    else estimate.other++
    const image = (Array.isArray(texture.image) ? texture.image[0] : texture.image) as { width?: number; height?: number } | null
    const faces = flags.isCubeTexture ? 6 : 1
    const bytesPerPixel = texture.type === FloatType ? 16 : texture.type === HalfFloatType ? 8 : 4
    const mipmaps = texture.generateMipmaps ? 4 / 3 : 1
    estimate.estimatedBytes += (image?.width ?? 0) * (image?.height ?? 0) * bytesPerPixel * faces * mipmaps
  }
  estimate.estimatedBytes = Math.round(estimate.estimatedBytes)
  return estimate
}

function geometryBytes(scene: Object3D) {
  const seen = new Set<BufferGeometry>()
  scene.traverse((object) => {
    const geometry = (object as Mesh).geometry as BufferGeometry | undefined
    if (geometry?.isBufferGeometry) seen.add(geometry)
  })
  let bytes = 0
  for (const geometry of seen) {
    for (const attribute of Object.values(geometry.attributes)) {
      bytes += 'isInterleavedBufferAttribute' in attribute ? attribute.data.array.byteLength : attribute.array.byteLength
    }
    bytes += geometry.index?.array.byteLength ?? 0
  }
  return bytes
}

/**
 * Only with ?perf (see PERF_PROBE): records every frame the 3D view draws and
 * exposes what the renderer holds as window.__MYDROBE_PERF__, for the
 * performance suite. It's a chunk of its own, so normal visits never download it.
 */
export default function PerfProbe() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const frames: FrameSample[] = []
    let frameStart = 0
    const stopBefore = addEffect(() => {
      frameStart = performance.now()
    })
    const stopAfter = addAfterEffect(() => {
      frames.push({ start: frameStart, cpu: performance.now() - frameStart })
      if (frames.length > MAX_FRAMES) frames.shift()
    })
    let lastPresetChange: number | null = null
    const unsubscribe = useWardrobeStore.subscribe((state, previous) => {
      if (state.bodyPreset !== previous.bodyPreset) lastPresetChange = performance.now()
    })

    window.__MYDROBE_PERF__ = {
      frames: () => frames.slice(),
      clearFrames: () => {
        frames.length = 0
      },
      renderer: () => rendererSnapshot(gl),
      textures: () => textureEstimate(scene),
      geometryBytes: () => geometryBytes(scene),
      lastPresetChange: () => lastPresetChange,
      geometryBuilds,
    }
    return () => {
      stopBefore()
      stopAfter()
      unsubscribe()
      delete window.__MYDROBE_PERF__
    }
  }, [gl, scene])

  return null
}
