/**
 * The fitting room is loaded on demand. Sharing the import lets links start
 * fetching it on hover, so the page is usually ready by the time of the click.
 */
export const loadFittingRoomPage = () => import('./FittingRoomPage')

/**
 * Starts fetching the fitting room early, on hover or focus. If that fails, it
 * fails quietly: opening the fitting room loads it again, and PageLoadError
 * explains if that fails too.
 */
export function prefetchFittingRoomPage() {
  loadFittingRoomPage().catch(() => {})
}
