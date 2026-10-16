import { useAfter } from '../../hooks/useAfter'
import { Spinner } from '../ui/Spinner'

/** After this long, loading gets a word of reassurance about slow connections. */
const SLOW_MS = 6000

/** Shown while the 3D viewer, the biggest download in the app, is on its way. */
export function ViewerLoading() {
  const slow = useAfter(SLOW_MS)
  return (
    <div role="status" className="grid h-full place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner />
        <span className="text-sm">Setting up the fitting room…</span>
        {slow && <span className="max-w-60 text-xs">This can take a little longer on a slow connection.</span>}
      </div>
    </div>
  )
}
