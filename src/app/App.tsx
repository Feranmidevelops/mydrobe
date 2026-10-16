import { AppHeader } from '../components/layout/AppHeader'

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <section
        aria-label="Fitting room"
        className="relative h-[62dvh] shrink-0 overflow-hidden bg-stage lg:h-auto lg:flex-1"
      >
        <AppHeader />
      </section>

      <aside
        aria-label="Wardrobe"
        className="flex-1 border-t border-line bg-surface lg:w-[420px] lg:flex-none lg:overflow-y-auto lg:border-t-0 lg:border-l"
      />
    </div>
  )
}
