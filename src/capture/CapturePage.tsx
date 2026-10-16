import { CaptureScene } from './CaptureScene'
import { CAPTURE_SHOTS, type CaptureShotName } from './shots'

/*
 * Development-only page that renders the landing page's images.
 * Run `npm run dev`, open /capture.html?shot=hero-lineup, wait for the
 * figures to appear and press "Download". Save the file to src/assets/landing/.
 */

function isShotName(name: string | null): name is CaptureShotName {
  return name !== null && name in CAPTURE_SHOTS
}

function download(name: string) {
  const canvas = document.querySelector('canvas')
  canvas?.toBlob(
    (blob) => {
      if (!blob) return
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${name}.webp`
      link.click()
      URL.revokeObjectURL(link.href)
    },
    'image/webp',
    0.9,
  )
}

export function CapturePage() {
  const requested = new URLSearchParams(window.location.search).get('shot')
  const name: CaptureShotName = isShotName(requested) ? requested : 'hero-lineup'

  return (
    <>
      <nav style={{ display: 'flex', gap: 12, padding: 12, font: '14px sans-serif' }}>
        {Object.keys(CAPTURE_SHOTS).map((shot) => (
          <a key={shot} href={`?shot=${shot}`} style={{ fontWeight: shot === name ? 700 : 400 }}>
            {shot}
          </a>
        ))}
        <button type="button" onClick={() => download(name)}>
          Download {name}.webp
        </button>
      </nav>
      <CaptureScene shot={CAPTURE_SHOTS[name]} />
    </>
  )
}
