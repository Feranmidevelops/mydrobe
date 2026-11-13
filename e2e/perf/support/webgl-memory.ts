import type { Page } from '@playwright/test'

export interface WebGLMemory {
  textures: { count: number; bytes: number }
  buffers: { count: number; bytes: number }
  renderbuffers: { count: number; bytes: number }
  totalBytes: number
}

/**
 * Counts what the page allocates on the GPU by watching WebGL 2 calls: texture
 * storage, buffers and renderbuffers, minus whatever is deleted. Sizes are
 * estimates from the formats asked for. It wraps every allocation call, so use
 * it only in the memory test, never while timing frames.
 */
export function trackWebGLMemory(page: Page) {
  return page.addInitScript(() => {
    const GL = WebGL2RenderingContext
    const bytesPerPixel = (format: number) =>
      ({
        [GL.R8]: 1,
        [GL.RG8]: 2,
        [GL.RGB8]: 3,
        [GL.RGBA8]: 4,
        [GL.SRGB8_ALPHA8]: 4,
        [GL.R16F]: 2,
        [GL.RG16F]: 4,
        [GL.RGBA16F]: 8,
        [GL.R32F]: 4,
        [GL.RGBA32F]: 16,
        [GL.DEPTH_COMPONENT16]: 2,
        [GL.DEPTH_COMPONENT24]: 4,
        [GL.DEPTH_COMPONENT32F]: 4,
        [GL.DEPTH24_STENCIL8]: 4,
        [GL.DEPTH32F_STENCIL8]: 8,
      })[format] ?? 4
    const faces = (target: number) => (target === GL.TEXTURE_CUBE_MAP ? 6 : 1)

    const textures = new Map<WebGLTexture, number>()
    const buffers = new Map<WebGLBuffer, number>()
    const renderbuffers = new Map<WebGLRenderbuffer, number>()
    const bound = new WeakMap<WebGL2RenderingContext, Map<string, WebGLTexture | WebGLBuffer | WebGLRenderbuffer | null>>()
    const unit = new WeakMap<WebGL2RenderingContext, number>()
    const bindings = (gl: WebGL2RenderingContext) => {
      let map = bound.get(gl)
      if (!map) bound.set(gl, (map = new Map()))
      return map
    }
    const textureKey = (gl: WebGL2RenderingContext, target: number) =>
      `texture:${unit.get(gl) ?? GL.TEXTURE0}:${target === GL.TEXTURE_CUBE_MAP || (target >= GL.TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL.TEXTURE_CUBE_MAP_NEGATIVE_Z) ? GL.TEXTURE_CUBE_MAP : target}`

    const proto = GL.prototype
    const wrap = <K extends keyof WebGL2RenderingContext>(
      name: K,
      after: (gl: WebGL2RenderingContext, args: unknown[]) => void,
    ) => {
      const original = proto[name] as (...args: unknown[]) => unknown
      ;(proto as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        const result = original.apply(this, args)
        after(this, args)
        return result
      }
    }

    wrap('activeTexture', (gl, [texture]) => unit.set(gl, texture as number))
    wrap('bindTexture', (gl, [target, texture]) => bindings(gl).set(textureKey(gl, target as number), texture as WebGLTexture | null))
    wrap('bindBuffer', (gl, [target, buffer]) => bindings(gl).set(`buffer:${target as number}`, buffer as WebGLBuffer | null))
    wrap('bindRenderbuffer', (gl, [, renderbuffer]) => bindings(gl).set('renderbuffer', renderbuffer as WebGLRenderbuffer | null))

    wrap('texStorage2D', (gl, [target, levels, format, width, height]) => {
      const texture = bindings(gl).get(textureKey(gl, target as number))
      if (!texture) return
      let bytes = 0
      for (let level = 0; level < (levels as number); level++) {
        bytes += Math.max(1, (width as number) >> level) * Math.max(1, (height as number) >> level) * bytesPerPixel(format as number)
      }
      textures.set(texture, bytes * faces(target as number))
    })
    wrap('texStorage3D', (gl, [target, levels, format, width, height, depth]) => {
      const texture = bindings(gl).get(textureKey(gl, target as number))
      if (!texture) return
      let bytes = 0
      for (let level = 0; level < (levels as number); level++) {
        bytes += Math.max(1, (width as number) >> level) * Math.max(1, (height as number) >> level) * bytesPerPixel(format as number)
      }
      textures.set(texture, bytes * (depth as number))
    })
    // Older paths upload level 0 with texImage2D; count it unless texStorage already sized the texture.
    wrap('texImage2D', (gl, args) => {
      const [target, level, format] = args as number[]
      if (level !== 0) return
      const texture = bindings(gl).get(textureKey(gl, target))
      if (!texture) return
      const source = args[args.length - 1] as { width?: number; height?: number } | null
      const width = typeof args[3] === 'number' && args.length >= 9 ? (args[3] as number) : (source?.width ?? 0)
      const height = typeof args[4] === 'number' && args.length >= 9 ? (args[4] as number) : (source?.height ?? 0)
      const cube = target >= GL.TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL.TEXTURE_CUBE_MAP_NEGATIVE_Z
      const bytes = width * height * bytesPerPixel(format)
      textures.set(texture, cube ? (textures.get(texture) ?? 0) + bytes : bytes)
    })
    wrap('bufferData', (gl, [target, sizeOrData]) => {
      const buffer = bindings(gl).get(`buffer:${target as number}`)
      if (!buffer) return
      const size = typeof sizeOrData === 'number' ? sizeOrData : ((sizeOrData as ArrayBufferView | null)?.byteLength ?? 0)
      buffers.set(buffer, size)
    })
    wrap('renderbufferStorage', (gl, [, format, width, height]) => {
      const renderbuffer = bindings(gl).get('renderbuffer')
      if (renderbuffer) renderbuffers.set(renderbuffer, (width as number) * (height as number) * bytesPerPixel(format as number))
    })
    wrap('renderbufferStorageMultisample', (gl, [, samples, format, width, height]) => {
      const renderbuffer = bindings(gl).get('renderbuffer')
      if (renderbuffer) {
        renderbuffers.set(
          renderbuffer,
          (width as number) * (height as number) * bytesPerPixel(format as number) * Math.max(1, samples as number),
        )
      }
    })
    wrap('deleteTexture', (_gl, [texture]) => textures.delete(texture as WebGLTexture))
    wrap('deleteBuffer', (_gl, [buffer]) => buffers.delete(buffer as WebGLBuffer))
    wrap('deleteRenderbuffer', (_gl, [renderbuffer]) => renderbuffers.delete(renderbuffer as WebGLRenderbuffer))

    const sum = (map: Map<unknown, number>) => ({ count: map.size, bytes: [...map.values()].reduce((a, b) => a + b, 0) })
    ;(window as Window & { __webglMemory?: () => unknown }).__webglMemory = () => {
      const memory = { textures: sum(textures), buffers: sum(buffers), renderbuffers: sum(renderbuffers) }
      return { ...memory, totalBytes: memory.textures.bytes + memory.buffers.bytes + memory.renderbuffers.bytes }
    }
  })
}

export const webglMemory = (page: Page) =>
  page.evaluate(() => (window as Window & { __webglMemory?: () => WebGLMemory }).__webglMemory!())
