import { loadFittingRoomPage } from '../../app/pages'
import { ROUTES } from '../../app/router'
import { HangerIcon } from '../ui/icons'
import { Link } from '../ui/Link'

const NAV_LINKS = [
  { href: '#top', label: 'Home' },
  { href: '#pieces', label: 'Wardrobe' },
  { href: '#why', label: 'Why Mydrobe' },
  { href: '#bodies', label: 'Body shapes' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-espresso/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <a href="#top" className="text-base font-bold tracking-[0.24em] text-espresso uppercase">
          Mydrobe
        </a>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm text-taupe">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="transition hover:text-espresso">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          to={ROUTES.fittingRoom}
          onPointerEnter={loadFittingRoomPage}
          onFocus={loadFittingRoomPage}
          className="inline-flex items-center gap-2 rounded-full bg-espresso px-4 py-2 text-sm font-medium text-cream transition hover:bg-cocoa"
        >
          <HangerIcon className="size-4" />
          Fitting room
        </Link>
      </div>
    </header>
  )
}
