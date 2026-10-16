import { useEffect, useId, useRef, useState } from 'react'
import {
  addUploadedGarment,
  createUploadedGarment,
  discardPhoto,
  makeThumbnail,
  preparePhoto,
  UploadError,
  type GarmentDetails,
  type PreparedPhoto,
} from '../../features/garments/garment.service'
import type { PhotoAnalysis } from '../../features/garments/photo-analysis'
import { CloseIcon } from '../ui/icons'
import { GarmentReview } from './GarmentReview'
import { PhotoPicker } from './PhotoPicker'

type Step =
  | { kind: 'choose'; error?: string; refocus?: boolean }
  | { kind: 'preparing' }
  | { kind: 'review'; photo: PreparedPhoto }

/**
 * Adding clothes: choose a photo, check how it separated from its background,
 * then name it and add it. Render it to open it; it calls `onClose` once it
 * has closed, whether a piece was added or not.
 */
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [adding, setAdding] = useState(false)
  /** The prepared photo that isn't in the wardrobe yet, let go of if the person backs out. */
  const draftUrl = useRef<string | null>(null)
  /** Bumped whenever a photo still being prepared stops being wanted. */
  const attempt = useRef(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(
    () => () => {
      attempt.current += 1
      discardPhoto(draftUrl.current ?? undefined)
      draftUrl.current = null
    },
    [],
  )

  // Tells the page straight away instead of waiting for the dialog's close
  // event, which some browsers hold back while their window isn't focused.
  const close = () => {
    dialogRef.current?.close()
    onClose()
  }

  const choosePhoto = async (file: File) => {
    const id = ++attempt.current
    setStep({ kind: 'preparing' })
    try {
      const photo = await preparePhoto(file)
      if (id !== attempt.current) return discardPhoto(photo.url)
      draftUrl.current = photo.url
      setStep({ kind: 'review', photo })
    } catch (error) {
      if (id !== attempt.current) return
      setStep({
        kind: 'choose',
        refocus: true,
        error: error instanceof UploadError ? error.message : "That photo couldn't be opened. Try another one.",
      })
    }
  }

  const chooseAnother = () => {
    attempt.current += 1
    discardPhoto(draftUrl.current ?? undefined)
    draftUrl.current = null
    setStep({ kind: 'choose', refocus: true })
  }

  const add = async (details: GarmentDetails, analysis: PhotoAnalysis) => {
    if (step.kind !== 'review') return
    const { photo } = step
    setAdding(true)
    try {
      const thumbnail = await makeThumbnail(analysis)
      // Closed while the thumbnail was drawn: the photo has been let go already.
      if (draftUrl.current !== photo.url) return
      const thumbnailUrl = thumbnail ? URL.createObjectURL(thumbnail) : undefined
      const garment = createUploadedGarment(photo, thumbnailUrl, analysis.palette, details)
      // The wardrobe owns the photo from here, unless saving it fails.
      draftUrl.current = null
      try {
        await addUploadedGarment(garment, {
          photo: photo.blob,
          thumbnail,
          mimeType: `image/${photo.format}`,
          fileSize: photo.fileSize,
        })
      } catch (error) {
        draftUrl.current = photo.url
        discardPhoto(thumbnailUrl)
        throw error
      }
      close()
    } finally {
      setAdding(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      // Any other way the browser closes it still reaches the page.
      onClose={onClose}
      onCancel={(event) => {
        // Esc closes through the same path as the Close button, but not mid-add.
        event.preventDefault()
        if (!adding) close()
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself. Only close that
        // way before a photo is chosen, so a stray click can't lose one.
        if (event.target === event.currentTarget && step.kind === 'choose') close()
      }}
      className="m-auto h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink backdrop:bg-espresso/45 backdrop:backdrop-blur-[2px] open:flex open:flex-col sm:h-auto sm:max-h-[min(88dvh,780px)] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:rounded-2xl sm:shadow-2xl"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 id={headingId} className="text-lg font-bold tracking-tight">
            Add clothes
          </h2>
          <p className="text-xs text-muted">
            {step.kind === 'review' ? 'Step 2 of 2 · Check and name it' : 'Step 1 of 2 · Choose a photo'}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={adding}
          aria-label="Close"
          className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sand hover:text-ink disabled:opacity-40"
        >
          <CloseIcon className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step.kind === 'review' ? (
          <GarmentReview key={step.photo.url} photo={step.photo} onChooseAnother={chooseAnother} onAdd={add} />
        ) : (
          <PhotoPicker
            onPhoto={choosePhoto}
            busy={step.kind === 'preparing'}
            error={step.kind === 'choose' ? step.error : undefined}
            autoFocus={step.kind === 'choose' && step.refocus}
          />
        )}
      </div>
    </dialog>
  )
}
