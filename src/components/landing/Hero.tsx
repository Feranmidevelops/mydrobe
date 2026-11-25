import { prefetchFittingRoomPage } from '../../app/pages'
import { ROUTES } from '../../app/router'
import heroLineup from '../../assets/landing/hero-lineup.webp'
import { Link } from '../ui/Link'

/**
 * The promise first, then the lineup of dressed figures below it, each on its
 * own ground: words laid over the figures would sit on the very clothes they sell.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="px-4 pt-8 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-3xl text-center">
        <h1
          id="hero-heading"
          className="text-3xl leading-tight font-bold tracking-tight text-balance text-ink uppercase sm:text-5xl"
        >
          See it on before you wear it
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-pretty text-ink-soft sm:text-base">
          Put outfits together on a 3D mannequin you can turn all the way around. Free, private
          and no account needed.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to={ROUTES.fittingRoom}
            onPointerEnter={prefetchFittingRoomPage}
            onFocus={prefetchFittingRoomPage}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-cream transition hover:bg-cocoa"
          >
            Enter the fitting room
          </Link>
          <a
            href="#pieces"
            className="rounded-full border border-ink/25 px-6 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/50 hover:bg-sand"
          >
            Explore the wardrobe
          </a>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-2xl bg-sand">
        {/*
         * Phones show the middle two figures whole. Wider screens show all four, and
         * the widest trim a little empty backdrop above and below so the feet stay
         * in a laptop's first screen.
         */}
        <img
          src={heroLineup}
          alt="Four mannequins in the Small, Medium and Large body shapes, each wearing a different outfit"
          width={2400}
          height={1050}
          fetchPriority="high"
          className="h-[300px] w-full object-cover sm:aspect-[2400/1050] sm:h-auto lg:aspect-[2400/900] lg:object-[50%_60%]"
        />
      </div>
    </section>
  )
}
