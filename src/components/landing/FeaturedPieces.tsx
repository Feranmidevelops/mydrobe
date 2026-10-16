import { ROUTES } from '../../app/router'
import type { Garment } from '../../features/garments/garment.types'
import { FEATURED_LOOKS } from '../../features/outfits/featured-looks'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { ChevronRightIcon } from '../ui/icons'
import { Link } from '../ui/Link'
import { GarmentThumbnail } from '../wardrobe/GarmentThumbnail'

export function FeaturedPieces({ garments }: { garments: Garment[] }) {
  const wear = useWardrobeStore((state) => state.wear)
  const byId = new Map(garments.map((garment) => [garment.id, garment]))
  const looks = FEATURED_LOOKS.flatMap(({ pieceId, partnerId }) => {
    const piece = byId.get(pieceId)
    const partner = byId.get(partnerId)
    return piece && partner ? [{ piece, partner }] : []
  })

  return (
    <section id="pieces" aria-labelledby="pieces-heading" className="scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 id="pieces-heading" className="text-2xl font-bold tracking-tight text-espresso sm:text-3xl">
          Fresh in the wardrobe
        </h2>

        {/* A swipeable row on phones, a three-column grid from tablets up. */}
        <ul className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0">
          {looks.map(({ piece, partner }) => (
            <li key={piece.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
              <div className="grid aspect-[4/5] place-items-center rounded-xl bg-mist">
                <GarmentThumbnail garment={piece} size={210} hanger />
              </div>
              <h3 className="mt-4 text-base font-semibold text-espresso">{piece.name}</h3>
              <p className="mt-1 text-taupe">Styled with {partner.name.toLowerCase()}</p>
              <Link
                to={ROUTES.fittingRoom}
                onClick={() => wear([piece, partner])}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-tan underline underline-offset-4 transition hover:text-espresso"
              >
                Try the look
                <span className="sr-only">
                  : {piece.name} with {partner.name.toLowerCase()}
                </span>
                <ChevronRightIcon className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
