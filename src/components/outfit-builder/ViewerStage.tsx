import { lazy, Suspense, useState } from 'react'
import { supportsWebGL } from '../../features/mannequin/webgl'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { Spinner } from '../ui/Spinner'

// Three.js is the heaviest part of the app, so it loads after the shell.
const FittingRoom = lazy(() => import('../../features/mannequin/FittingRoom'))

function ViewerMessage({ title, children }: { title: string; children: string }) {
  return (
    <div role="status" className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-semibold tracking-tight text-ink">{title}</p>
        <p className="mt-2 text-sm text-muted">{children}</p>
      </div>
    </div>
  )
}

function ViewerLoading() {
  return (
    <div role="status" className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner />
        <span className="text-sm">Setting up the fitting room…</span>
      </div>
    </div>
  )
}

export function ViewerStage() {
  const [webgl] = useState(supportsWebGL)

  if (!webgl) {
    return (
      <ViewerMessage title="3D preview unavailable">
        This browser or device can't run WebGL, so the mannequin can't be shown. You can still
        browse your wardrobe and put outfits together.
      </ViewerMessage>
    )
  }

  return (
    <ErrorBoundary
      fallback={
        <ViewerMessage title="The 3D viewer stopped">
          Something went wrong while drawing the mannequin. Reload the page to try again; your
          outfit selection is unaffected.
        </ViewerMessage>
      }
    >
      <Suspense fallback={<ViewerLoading />}>
        <FittingRoom />
      </Suspense>
    </ErrorBoundary>
  )
}
