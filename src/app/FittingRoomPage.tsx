import { useEffect, useState } from 'react'
import { AppHeader } from '../components/layout/AppHeader'
import { BodyPresetControl } from '../components/outfit-builder/BodyPresetControl'
import { FittingStatus } from '../components/outfit-builder/FittingStatus'
import { HiddenGarmentsNotice } from '../components/outfit-builder/HiddenGarmentsNotice'
import { ViewControls } from '../components/outfit-builder/ViewControls'
import { ViewerStage } from '../components/outfit-builder/ViewerStage'
import { NoticeToast } from '../components/ui/NoticeToast'
import { UploadDialog } from '../components/upload/UploadDialog'
import { WardrobePanel } from '../components/wardrobe/WardrobePanel'
import { MANNEQUIN_ASSET } from '../features/mannequin/mannequin-asset'
import { restoreSavedWardrobe } from '../features/storage/storage.service'
import { mark, PERF_MARKS } from '../lib/perf'
import { useWardrobeGarments } from '../hooks/useWardrobeGarments'

/** The fitting room: the 3D stage with its controls, next to the wardrobe. */
export default function FittingRoomPage() {
  const garments = useWardrobeGarments()
  const [addingClothes, setAddingClothes] = useState(false)
  // A fresh dialog each time, so one that closed without telling the page can't block the next.
  const [uploadCount, setUploadCount] = useState(0)
  const openUpload = () => {
    setUploadCount((count) => count + 1)
    setAddingClothes(true)
  }

  useEffect(() => {
    // The first usable, non-3D part of the fitting room is on screen.
    mark(PERF_MARKS.fittingRoomShown)
    void restoreSavedWardrobe()
  }, [])

  return (
    <div className="flex min-h-dvh flex-col split:h-dvh split:flex-row">
      <section
        aria-label="Fitting room"
        data-pinned-stage=""
        className="sticky top-0 z-20 h-[50svh] min-h-[280px] shrink-0 overflow-hidden bg-stage bg-[radial-gradient(ellipse_at_50%_36%,#f7f0e8_0%,#e4d6c7_72%)] shadow-[0_1px_0_var(--color-line)] split:relative split:h-auto split:min-h-0 split:flex-1 split:shadow-none"
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
          <FittingStatus garments={garments} />
          <BodyPresetControl />
        </div>
      </section>

      <aside
        aria-label="Wardrobe"
        className="flex-1 bg-cream split:w-[min(420px,50vw)] split:flex-none split:overflow-y-auto split:border-l split:border-line"
      >
        <WardrobePanel garments={garments} onAddClothes={openUpload} />
      </aside>

      {addingClothes && <UploadDialog key={uploadCount} onClose={() => setAddingClothes(false)} />}
      <NoticeToast />
    </div>
  )
}
