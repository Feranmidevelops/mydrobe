import { useEffect } from 'react'
import { useWardrobeStore, type Notice } from '../../store/wardrobe.store'
import { AlertIcon, CheckIcon, CloseIcon } from './icons'

/** Problems stay up longer than confirmations, so there's time to read them. */
const SHOW_MS: Record<Notice['kind'], number> = { success: 4000, error: 8000 }

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const Icon = notice.kind === 'success' ? CheckIcon : AlertIcon
  return (
    <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl bg-ink py-2.5 pr-2 pl-4 text-sm text-cream shadow-lg">
      <Icon className={`mt-0.5 size-4 shrink-0 ${notice.kind === 'error' ? 'text-[#f4c9a8]' : ''}`} />
      <p className="flex-1 leading-snug">{notice.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-my-0.5 grid size-7 shrink-0 place-items-center rounded-full transition hover:bg-cream/15"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  )
}

/**
 * Shows the latest notice at the bottom of the screen for a few seconds. The
 * live regions are always there, so screen readers announce what appears in them.
 */
export function NoticeToast() {
  const notice = useWardrobeStore((state) => state.notice)
  const dismissNotice = useWardrobeStore((state) => state.dismissNotice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => dismissNotice(notice.id), SHOW_MS[notice.kind])
    return () => clearTimeout(timer)
  }, [notice, dismissNotice])

  const dismiss = () => notice && dismissNotice(notice.id)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div role="status">{notice?.kind === 'success' && <Toast notice={notice} onDismiss={dismiss} />}</div>
      <div role="alert">{notice?.kind === 'error' && <Toast notice={notice} onDismiss={dismiss} />}</div>
    </div>
  )
}
