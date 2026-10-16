import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { PageLoadError } from '../components/ui/PageLoadError'
import { PageLoading } from '../components/ui/PageLoading'
import LandingPage from './LandingPage'
import { loadFittingRoomPage } from './pages'
import { ROUTES, useRoute, type Route } from './router'

const FittingRoomPage = lazy(loadFittingRoomPage)

const PAGE_TITLES: Record<Route, string> = {
  [ROUTES.home]: 'Mydrobe · Virtual wardrobe',
  [ROUTES.fittingRoom]: 'Fitting room · Mydrobe',
}

export default function App() {
  const route = useRoute()

  useEffect(() => {
    document.title = PAGE_TITLES[route]
  }, [route])

  if (route === ROUTES.fittingRoom) {
    return (
      <ErrorBoundary label="Fitting room" fallback={<PageLoadError />}>
        <Suspense fallback={<PageLoading />}>
          <FittingRoomPage />
        </Suspense>
      </ErrorBoundary>
    )
  }

  return <LandingPage />
}
