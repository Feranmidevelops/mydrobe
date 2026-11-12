/** True when the browser can create the WebGL 2 context the 3D viewer needs (three.js has no WebGL 1 renderer). */
export function supportsWebGL(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    if (!context) return false
    // Release the probe context so it doesn't count against the browser's limit.
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
