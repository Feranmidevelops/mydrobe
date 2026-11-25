import type { CDPSession, Page } from '@playwright/test'

export interface Profile {
  label: string
  /** Round-trip latency in ms. */
  latency: number
  /** Bytes per second; -1 means no limit. */
  download: number
  upload: number
  /** CPU slow-down factor; 1 is the machine's own speed. */
  cpu: number
  source: string
}

const mbps = (megabits: number) => Math.round((megabits * 1_000_000) / 8)

/** Network and CPU conditions to load and use the app under, with where each comes from. */
export const PROFILES = {
  local: {
    label: 'Local',
    latency: 0,
    download: -1,
    upload: -1,
    cpu: 1,
    source: 'No throttling: the preview server on this machine',
  },
  broadband: {
    label: 'Broadband',
    latency: 40,
    download: mbps(10.24),
    upload: mbps(5.12),
    cpu: 1,
    source: 'A steady home line: 40 ms, 10.24 Mbps down, 5.12 Mbps up, full CPU',
  },
  fast4g: {
    label: 'Fast 4G',
    latency: 165,
    download: mbps(8.1),
    upload: mbps(1.35),
    cpu: 4,
    source: 'Chrome DevTools "Fast 4G" (165 ms, 8.1 Mbps down, 1.35 Mbps up) with the 4x CPU slow-down of a mid-range phone',
  },
  slow4g: {
    label: 'Slow 4G',
    latency: 562.5,
    download: mbps(1.44),
    upload: mbps(0.675),
    cpu: 4,
    source: 'Chrome DevTools "Slow 4G" (562.5 ms, 1.44 Mbps down, 675 kbps up) with a 4x CPU slow-down',
  },
} satisfies Record<string, Profile>

/** Applies a profile to a page before it loads, with the browser cache off. Returns the session it used. */
export async function throttle(page: Page, profile: Profile): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (profile.latency > 0 || profile.download > 0) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.download,
      uploadThroughput: profile.upload,
    })
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  return cdp
}
