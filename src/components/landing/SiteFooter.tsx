import { ROUTES } from '../../app/router'
import { Link } from '../ui/Link'

export function SiteFooter() {
  return (
    <footer className="border-t border-espresso/10 px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold tracking-[0.24em] text-espresso uppercase">Mydrobe</p>
          <p className="mt-1 text-sm text-taupe">A virtual wardrobe you can try on.</p>
        </div>
        <div className="flex items-center gap-6 text-sm text-taupe">
          <Link to={ROUTES.fittingRoom} className="transition hover:text-espresso">
            Fitting room
          </Link>
          <span>© {new Date().getFullYear()} Mydrobe</span>
        </div>
      </div>
    </footer>
  )
}
