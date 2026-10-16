import { Spinner } from './Spinner'

export function PageLoading() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-canvas">
      <span className="flex flex-col items-center gap-3 text-sm text-muted">
        <Spinner />
        Opening the fitting room…
      </span>
    </div>
  )
}
