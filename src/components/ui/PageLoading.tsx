import { useAfter } from '../../hooks/useAfter'
import { Spinner } from './Spinner'

/** After this long, loading gets a word of reassurance about slow connections. */
const SLOW_MS = 6000

export function PageLoading() {
  const slow = useAfter(SLOW_MS)
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
      <span className="flex flex-col items-center gap-3 text-sm text-muted">
        <Spinner />
        Opening the fitting room…
        {slow && <span className="max-w-60 text-xs">This can take a little longer on a slow connection.</span>}
      </span>
    </div>
  )
}
