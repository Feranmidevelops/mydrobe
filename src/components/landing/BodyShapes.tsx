import { ROUTES } from '../../app/router'
import bodyLarge from '../../assets/landing/body-large.webp'
import bodyMedium from '../../assets/landing/body-medium.webp'
import bodySmall from '../../assets/landing/body-small.webp'
import { BODY_PRESET_LABELS, type BodyPreset } from '../../features/mannequin/viewer.types'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { ChevronRightIcon } from '../ui/icons'
import { Link } from '../ui/Link'

const BODIES: { preset: BodyPreset; image: string; outfit: string }[] = [
  { preset: 'small', image: bodySmall, outfit: 'Sage linen tee, indigo denim' },
  { preset: 'medium', image: bodyMedium, outfit: 'Oxford stripe shirt, stone chinos' },
  { preset: 'large', image: bodyLarge, outfit: 'Navy gingham shirt, stone chinos' },
]

export function BodyShapes() {
  const setBodyPreset = useWardrobeStore((state) => state.setBodyPreset)

  return (
    <section id="bodies" aria-labelledby="bodies-heading" className="scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 id="bodies-heading" className="text-2xl font-bold tracking-tight text-espresso sm:text-3xl">
            Made for every body
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-taupe">
            Small, Medium and Large are visual shapes to help you picture a look, not size advice.
          </p>
        </div>

        <ul className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0">
          {BODIES.map(({ preset, image, outfit }) => (
            <li key={preset} className="w-[70%] shrink-0 snap-start sm:w-auto">
              <Link
                to={ROUTES.fittingRoom}
                onClick={() => setBodyPreset(preset)}
                className="group relative block overflow-hidden rounded-xl bg-sand"
              >
                <img
                  src={image}
                  alt=""
                  width={800}
                  height={1066}
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-espresso/75 to-transparent p-4 pt-20 text-left text-white">
                  <span>
                    <span className="block text-lg font-semibold">{BODY_PRESET_LABELS[preset]}</span>
                    <span className="block text-xs text-white/85">{outfit}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                    Try it
                    <ChevronRightIcon className="size-3" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
