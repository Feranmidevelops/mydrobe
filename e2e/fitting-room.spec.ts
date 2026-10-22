import { STUDIO_EXPOSURE, STUDIO_TONE_MAPPING } from '../src/features/mannequin/studio-tone-mapping.ts'
import { cameraButton, openFittingRoom, preset, resetCamera, stageCanvas, wardrobe } from './support/fitting-room.ts'
import { expect, test } from './support/test.ts'

test('the fitting room opens with a real 3D mannequin and its controls', async ({ page }) => {
  await openFittingRoom(page)

  await expect(page).toHaveTitle('Fitting room · Mydrobe')
  await expect(wardrobe(page)).toBeVisible()
  await expect(stageCanvas(page)).toHaveAttribute('data-engine', /^three\.js r\d+/)
  for (const view of ['Front', 'Side', 'Back'] as const) await expect(cameraButton(page, view)).toBeVisible()
  await expect(resetCamera(page)).toBeVisible()
  for (const name of ['Small', 'Medium', 'Large'] as const) await expect(preset(page, name)).toBeVisible()
  await expect(preset(page, 'Medium')).toBeChecked()

  // Drawn with the studio's tone mapping, which the lights are calibrated for.
  const drawnWith = await page.evaluate(
    () => (performance.getEntriesByName('mydrobe:first-frame')[0] as PerformanceMark).detail as { toneMapping: number; exposure: number },
  )
  expect(drawnWith).toMatchObject({ toneMapping: STUDIO_TONE_MAPPING, exposure: STUDIO_EXPOSURE })

  // Note which renderer drew it, so a report shows whether this was SwiftShader or a real GPU.
  const renderer = await stageCanvas(page).evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')
    if (!gl) return 'no WebGL 2 context'
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
  })
  test.info().annotations.push({ type: 'WebGL renderer', description: renderer })
})
