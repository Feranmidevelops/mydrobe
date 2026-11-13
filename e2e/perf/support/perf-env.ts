import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import { test, type Browser, type Page } from '@playwright/test'

/** Runs a read-only command, or gives null if it can't. */
function run(command: string, args: string[]) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/** The power plan and whether the machine runs on battery (Windows only), since both change the numbers. */
function power() {
  if (process.platform !== 'win32') return null
  const plan = run('powercfg', ['/getactivescheme'])?.match(/\(([^)]+)\)\s*$/)?.[1] ?? null
  // Win32_Battery BatteryStatus 1 means discharging. No battery at all means mains power.
  const status = run('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-CimInstance Win32_Battery | Select-Object -First 1).BatteryStatus',
  ])
  return { plan, batteryStatus: status || null, onBattery: status === '1' }
}

const version = (packageJson: URL) => {
  try {
    return (JSON.parse(readFileSync(packageJson, 'utf8')) as { version: string }).version
  } catch {
    return null
  }
}

/** What these numbers were measured on: the code, the machine, the browser and the display. */
export async function recordEnvironment(page: Page, browser: Browser) {
  const session = await browser.newBrowserCDPSession()
  const system = (await session.send('SystemInfo.getInfo')) as {
    gpu: { devices: { vendorString: string; deviceString: string; driverVersion: string }[] }
  }
  await session.detach()

  const inPage = await page.evaluate(async () => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    const renderer = gl ? String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'no WebGL 2'
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    // The display's refresh rate, from the gaps between 60 animation frames.
    const times: number[] = []
    await new Promise<void>((done) => {
      const step = (time: number) => {
        times.push(time)
        if (times.length > 60) done()
        else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    const gaps = times
      .slice(1)
      .map((time, i) => time - times[i])
      .sort((a, b) => a - b)
    return {
      renderer,
      refreshHz: Math.round(1000 / gaps[Math.floor(gaps.length / 2)]),
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })

  const cpus = os.cpus()
  return {
    measuredAt: new Date().toISOString(),
    commit: run('git', ['rev-parse', '--short', 'HEAD']),
    // Changed tracked files only: the numbers belong to the commit only when this is false.
    uncommittedChanges: Boolean(run('git', ['status', '--porcelain', '--untracked-files=no'])),
    cpu: cpus[0]?.model.trim() ?? null,
    logicalCores: cpus.length,
    ramGb: Math.round(os.totalmem() / 2 ** 30),
    os: `${os.type()} ${os.release()}`,
    power: power(),
    node: process.version,
    playwright: version(new URL('../../../node_modules/@playwright/test/package.json', import.meta.url)),
    browser: {
      name: browser.browserType().name(),
      version: browser.version(),
      channel: (test.info().project.use as { channel?: string }).channel ?? 'headless shell',
      headless: test.info().project.use.headless !== false,
    },
    gpuDevices: system.gpu.devices.map((device) => `${device.vendorString} ${device.deviceString} (${device.driverVersion})`),
    ...inPage,
    softwareRendering: /swiftshader|llvmpipe|software/i.test(inPage.renderer),
  }
}
