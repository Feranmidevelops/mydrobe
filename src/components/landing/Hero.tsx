import { loadFittingRoomPage } from '../../app/pages'
import { ROUTES } from '../../app/router'
import heroLineup from '../../assets/landing/hero-lineup.webp'
import { Link } from '../ui/Link'

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="px-4 pt-6 sm:px-6 sm:pt-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-sand">
        <img
          src={heroLineup}
          alt="Four mannequins in the Small, Medium and Large body shapes, each wearing a different outfit"
          width={2400}
          height={1050}
          fetchPriority="high"
          className="h-[460px] w-full object-cover sm:h-[500px] lg:aspect-[2400/1050] lg:h-auto"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(38,22,12,0.62)_0%,rgba(38,22,12,0.32)_55%,rgba(38,22,12,0.18)_100%)]"
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
          <h1
            id="hero-heading"
            className="max-w-3xl text-3xl leading-tight font-bold tracking-tight uppercase sm:text-5xl"
          >
            See it on before you wear it
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/90 sm:text-base">
            Put outfits together on a 3D mannequin you can turn all the way around. Free, private
            and no account needed.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to={ROUTES.fittingRoom}
              onPointerEnter={loadFittingRoomPage}
              onFocus={loadFittingRoomPage}
              className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-espresso transition hover:bg-cream"
            >
              Enter the fitting room
            </Link>
            <a
              href="#pieces"
              className="rounded-full border border-white/80 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Explore the wardrobe
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
