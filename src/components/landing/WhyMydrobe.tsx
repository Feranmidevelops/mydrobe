import { FigureIcon, LockIcon, RotateIcon, SparkleIcon } from '../ui/icons'

const REASONS = [
  {
    icon: RotateIcon,
    title: '360° view',
    text: 'Turn the mannequin all the way round and check every angle.',
  },
  {
    icon: FigureIcon,
    title: 'Three body shapes',
    text: 'Switch between Small, Medium and Large without losing your outfit.',
  },
  {
    icon: LockIcon,
    title: 'Private by design',
    text: 'No account and no server. Everything stays in your browser.',
  },
  {
    icon: SparkleIcon,
    title: 'Free to use',
    text: 'No subscriptions and no paid AI. Just you and your wardrobe.',
  },
]

export function WhyMydrobe() {
  return (
    <section id="why" aria-labelledby="why-heading" className="scroll-mt-20 bg-sand px-4 py-14 sm:px-6">
      <h2 id="why-heading" className="sr-only">
        Why Mydrobe
      </h2>
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {REASONS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="text-center">
            <Icon className="mx-auto size-8 text-tan" />
            <h3 className="mt-3 text-base font-semibold text-espresso">{title}</h3>
            <p className="mx-auto mt-2 max-w-[15rem] text-sm text-taupe">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
