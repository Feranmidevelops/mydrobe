import { ROUTES } from '../../app/router'
import { Link } from './Link'

/**
 * Shown when the fitting room can't open, usually because part of the app
 * didn't download. Reloading fetches it afresh.
 */
export function PageLoadError() {
  return (
    <div role="alert" className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-semibold tracking-tight text-ink">The fitting room couldn't open</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Something went wrong while opening it, often a dropped connection. Check you're online, then try
          again. Your saved clothes and outfits are safe on this device.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-cocoa"
          >
            Try again
          </button>
          <Link
            to={ROUTES.home}
            className="text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            Back to the home page
          </Link>
        </div>
      </div>
    </div>
  )
}
