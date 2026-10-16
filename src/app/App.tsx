import { AppHeader } from '../components/layout/AppHeader'
import { BodyPresetControl } from '../components/outfit-builder/BodyPresetControl'
import { WardrobePanel } from '../components/wardrobe/WardrobePanel'
import { useWardrobeGarments } from '../hooks/useWardrobeGarments'

export default function App() {
  const garments = useWardrobeGarments()

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <section
        aria-label="Fitting room"
        className="relative h-[62dvh] shrink-0 overflow-hidden bg-stage lg:h-auto lg:flex-1"
      >
        <AppHeader />
        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4 sm:bottom-6">
          <BodyPresetControl />
        </div>
      </section>

      <aside
        aria-label="Wardrobe"
        className="flex-1 border-t border-line bg-surface lg:w-[420px] lg:flex-none lg:overflow-y-auto lg:border-t-0 lg:border-l"
      >
        <WardrobePanel garments={garments} />
      </aside>
    </div>
  )
}
