import { useEffect, useState } from 'react'
import { AppHeader } from '../components/layout/AppHeader'
import { BodyPresetControl } from '../components/outfit-builder/BodyPresetControl'
import { HiddenGarmentsNotice } from '../components/outfit-builder/HiddenGarmentsNotice'
import { ViewControls } from '../components/outfit-builder/ViewControls'
import { ViewerStage } from '../components/outfit-builder/ViewerStage'
import { NoticeToast } from '../components/ui/NoticeToast'
import { UploadDialog } from '../components/upload/UploadDialog'
import { WardrobePanel } from '../components/wardrobe/WardrobePanel'
import { MANNEQUIN_ASSET } from '../features/mannequin/mannequin-asset'
import { restoreSavedWardrobe } from '../features/storage/storage.service'
import { useWardrobeGarments } from '../hooks/useWardrobeGarments'

/** The fitting room: the 3D stage with its controls, next to the wardrobe. */
export default function FittingRoomPage() {
  const garments = useWardrobeGarments()
  const [addingClothes, setAddingClothes] = useState(false)

  useEffect(() => {
    void restoreSavedWardrobe()
  }, [])

  return (
    <div className="flex min-h-dvh flex-col split:h-dvh split:flex-row">
      <section
        aria-label="Fitting room"
        className="relative h-[62dvh] min-h-[420px] shrink-0 overflow-hidden bg-stage bg-[radial-gradient(ellipse_at_50%_36%,#f7f0e8_0%,#e4d6c7_72%)] split:h-auto split:min-h-0 split:flex-1"
      >
        <div className="absolute inset-0">
          <ViewerStage />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-6">
          <div>
            <AppHeader />
            {MANNEQUIN_ASSET.kind === 'procedural' && (
              <p
                className="pointer-events-auto mt-2 inline-block rounded-full whitespace-nowrap bg-surface/80 px-2 py-0.5 text-[10px] sm:mt-3 sm:px-2.5 sm:py-1 sm:text-[11px] text-muted ring-1 ring-line backdrop-blur"
                title={MANNEQUIN_ASSET.note}
              >
                <span className="sm:hidden">{MANNEQUIN_ASSET.shortLabel}</span>
                <span className="hidden sm:inline">{MANNEQUIN_ASSET.label}</span>
              </p>
            )}
          </div>
          <div className="pointer-events-auto">
            <ViewControls />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4 sm:bottom-6">
          <HiddenGarmentsNotice garments={garments} />
          <BodyPresetControl />
        </div>
      </section>

      <aside
        aria-label="Wardrobe"
        className="flex-1 border-t border-line bg-cream split:w-[min(420px,50vw)] split:flex-none split:overflow-y-auto split:border-t-0 split:border-l"
      >
        <WardrobePanel garments={garments} onAddClothes={() => setAddingClothes(true)} />
      </aside>

      {addingClothes && <UploadDialog onClose={() => setAddingClothes(false)} />}
      <NoticeToast />
    </div>
  )
}
