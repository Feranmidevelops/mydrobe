import { useEffect } from 'react'
import FittingRoomPage from './FittingRoomPage'
import { ROUTES, useRoute, type Route } from './router'

const PAGE_TITLES: Record<Route, string> = {
  [ROUTES.home]: 'Mydrobe · Virtual wardrobe',
  [ROUTES.fittingRoom]: 'Fitting room · Mydrobe',
}

export default function App() {
  const route = useRoute()

  useEffect(() => {
    document.title = PAGE_TITLES[route]
  }, [route])

  // Both routes show the fitting room until the landing page takes over "/".
  return <FittingRoomPage />
}
