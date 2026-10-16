import { CAMERA_VIEW_LABELS, CAMERA_VIEWS } from '../../features/mannequin/camera-views'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { ResetIcon } from '../ui/icons'

export function ViewControls() {
  const requestView = useWardrobeStore((state) => state.requestView)

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        role="group"
        aria-label="Camera angle"
        className="inline-flex flex-col items-stretch rounded-2xl bg-surface/90 p-1 shadow-sm ring-1 ring-line backdrop-blur sm:flex-row sm:items-center sm:rounded-full"
      >
        {CAMERA_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => requestView(view)}
            className="rounded-full px-3 py-1 text-xs font-medium text-ink-soft transition hover:bg-canvas hover:text-ink"
          >
            {CAMERA_VIEW_LABELS[view]}
          </button>
        ))}
        <span aria-hidden="true" className="mx-auto my-0.5 h-px w-4 bg-line sm:mx-0.5 sm:my-0 sm:h-4 sm:w-px" />
        <button
          type="button"
          onClick={() => requestView('reset')}
          aria-label="Reset camera"
          title="Reset camera"
          className="grid h-7 w-full place-items-center rounded-full sm:w-7 text-ink-soft transition hover:bg-canvas hover:text-ink"
        >
          <ResetIcon className="size-3.5" />
        </button>
      </div>
      <p className="hidden text-[11px] text-muted sm:block">
        <span className="pointer-coarse:hidden">Drag to rotate · scroll to zoom</span>
        <span className="hidden pointer-coarse:inline">Drag to rotate · pinch to zoom</span>
      </p>
    </div>
  )
}
