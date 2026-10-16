/**
 * The fitting room is loaded on demand. Sharing the import lets links start
 * fetching it on hover, so the page is usually ready by the time of the click.
 */
export const loadFittingRoomPage = () => import('./FittingRoomPage')
