export function PageLoading() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-canvas">
      <span className="flex flex-col items-center gap-3 text-sm text-muted">
        <span className="size-8 animate-spin rounded-full border-2 border-line border-t-ink" />
        Opening the fitting room…
      </span>
    </div>
  )
}
