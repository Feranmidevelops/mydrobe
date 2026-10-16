import { lazy, Suspense, useCallback, useState } from 'react'
import { supportsWebGL } from '../../features/mannequin/webgl'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { ViewerLoading } from './ViewerLoading'

// Three.js is the heaviest part of the app, so it loads after the shell.
const FittingRoom = lazy(() => import('../../features/mannequin/FittingRoom'))

interface ViewerMessageProps {
  title: string
  children: string
  /** "alert" for something that went wrong, "status" for how things are. */
  role?: 'alert' | 'status'
  action?: { label: string; onClick: () => void }
}

function ViewerMessage({ title, children, role = 'status', action }: ViewerMessageProps) {
  return (
    <div role={role} className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-semibold tracking-tight text-ink">{title}</p>
        <p className="mt-2 text-sm text-muted">{children}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream transition hover:bg-cocoa"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

export function ViewerStage() {
  const [webgl] = useState(supportsWebGL)
  /** Bumped to start the 3D view again from scratch, with a fresh WebGL context. */
  const [attempt, setAttempt] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const handleContextLost = useCallback(() => setContextLost(true), [])

  if (!webgl) {
    return (
      <ViewerMessage title="3D preview unavailable">
        This browser or device can't run WebGL, so the mannequin can't be shown. You can still
        browse your wardrobe and put outfits together.
      </ViewerMessage>
    )
  }

  if (contextLost) {
    return (
      <ViewerMessage
        role="alert"
        title="The 3D view was interrupted"
        action={{
          label: 'Restart the 3D view',
          onClick: () => {
            setContextLost(false)
            setAttempt((count) => count + 1)
          },
        }}
      >
        This can happen when the device runs short of memory. Your outfit is unaffected.
      </ViewerMessage>
    )
  }

  return (
    <ErrorBoundary
      label="3D viewer"
      fallback={(retry) => (
        <ViewerMessage role="alert" title="The 3D viewer stopped" action={{ label: 'Try again', onClick: retry }}>
          Something went wrong while drawing the mannequin. Your outfit is unaffected. If it keeps
          happening, reload the page.
        </ViewerMessage>
      )}
    >
      <Suspense fallback={<ViewerLoading />}>
        <FittingRoom key={attempt} onContextLost={handleContextLost} />
      </Suspense>
    </ErrorBoundary>
  )
}
