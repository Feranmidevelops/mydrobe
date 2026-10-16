import { ROUTES } from '../../app/router'
import { Link } from '../ui/Link'

export function AppHeader() {
  return (
    <header>
      <Link to={ROUTES.home} aria-label="Mydrobe home" className="pointer-events-auto inline-block">
        <span className="block text-lg leading-none font-bold tracking-[0.24em] text-ink uppercase">
          Mydrobe
        </span>
        <span className="mt-1.5 block text-[10px] tracking-[0.22em] whitespace-nowrap text-muted uppercase">
          Virtual wardrobe
        </span>
      </Link>
    </header>
  )
}
