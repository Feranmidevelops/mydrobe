import { lazy, Suspense, useState } from 'react'
import { supportsWebGL } from '../../features/mannequin/webgl'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { ViewerLoading } from './ViewerLoading'

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
      label="3D viewer"
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
