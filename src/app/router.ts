import { useSyncExternalStore } from 'react'

/*
 * A deliberately tiny router: two pages don't justify a routing library.
 * It keeps the path in the address bar, so links can be shared and the back
 * button works; hosting needs the usual single-page-app fallback to index.html.
 */

export const ROUTES = {
  home: '/',
  fittingRoom: '/fitting-room',
} as const

export type Route = (typeof ROUTES)[keyof typeof ROUTES]

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

/** Maps any path to a known page; unknown paths land on the home page. */
export function matchRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === ROUTES.fittingRoom ? ROUTES.fittingRoom : ROUTES.home
}

export function navigate(to: Route) {
  if (window.location.pathname !== to) window.history.pushState(null, '', to)
  window.scrollTo(0, 0)
  listeners.forEach((listener) => listener())
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => ROUTES.home,
  )
  return matchRoute(pathname)
}
