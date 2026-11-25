import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture } from 'three'
import { mark, PERF_MARKS } from '../../lib/perf'
import { GARMENT_MATERIAL } from './garment-material'

/** Runs `task` once the page has nothing else to do, or shortly after where it can't say. Returns a cancel. */
function whenIdle(task: () => void) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(task, { timeout: 2000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(task, 200)
  return () => clearTimeout(id)
}

/**
 * Compiles the shaders garments are drawn with while the fitting room stands
 * idle, before anyone puts a piece on. Compiled on the spot, they held up the
 * first piece worn by about a tenth of a second. Here the graphics driver
 * compiles them on its own threads where it can (KHR_parallel_shader_compile),
 * for this scene's lights and environment, so they're the very shaders the
 * garments then ask for. The stand-in materials stay alive with the view, so
 * three.js keeps the shaders even while nothing is worn.
 */
export function ShaderWarmup() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  // Only after the first frame, so this never holds it up.
  const [drawn, setDrawn] = useState(false)
  useFrame(() => {
    if (!drawn) setDrawn(true)
  })

  useEffect(() => {
    if (!drawn) return
    const geometry = new PlaneGeometry()
    const map = new Texture()
    map.colorSpace = SRGBColorSpace
    // A garment in its fabric, and in plain colour while its photo is fitted (see GarmentMesh).
    const materials = [new MeshStandardMaterial({ ...GARMENT_MATERIAL, map }), new MeshStandardMaterial(GARMENT_MATERIAL)]
    const standIns = new Group()
    for (const material of materials) standIns.add(new Mesh(geometry, material))

    let cancelled = false
    const cancelIdle = whenIdle(() => {
      void gl.compileAsync(standIns, camera, scene).then(() => {
        if (!cancelled) mark(PERF_MARKS.shadersReady)
      })
    })
    return () => {
      cancelled = true
      cancelIdle()
      for (const material of materials) material.dispose()
      map.dispose()
      geometry.dispose()
    }
  }, [drawn, gl, scene, camera])

  return null
}
