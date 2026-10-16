import { useId, useState, type KeyboardEvent } from 'react'
import type { Garment } from '../../features/garments/garment.types'
import { useWardrobeStore } from '../../store/wardrobe.store'
import { SavedOutfits } from '../outfits/SavedOutfits'
import { LockIcon } from '../ui/icons'
import { OutfitSummary } from './OutfitSummary'
import { WardrobeShelves } from './WardrobeShelves'

type Tab = 'wardrobe' | 'outfits'

const TABS: Tab[] = ['wardrobe', 'outfits']
const TAB_LABELS: Record<Tab, string> = { wardrobe: 'Wardrobe', outfits: 'Outfits' }

interface WardrobePanelProps {
  garments: Garment[]
  /** Opens the upload dialog; without it the panel has no way to add clothes. */
  onAddClothes?: () => void
}

/** The side panel: what's on the mannequin, then the wardrobe and the saved outfits as tabs. */
export function WardrobePanel({ garments, onAddClothes }: WardrobePanelProps) {
  const baseId = useId()
  const [tab, setTab] = useState<Tab>('wardrobe')
  const outfitCount = useWardrobeStore((state) => state.outfits.length)
  const storage = useWardrobeStore((state) => state.storage)
  const counts: Record<Tab, number> = { wardrobe: garments.length, outfits: outfitCount }
  const tabId = (value: Tab) => `${baseId}-${value}-tab`
  const panelId = (value: Tab) => `${baseId}-${value}-panel`

  // Arrow keys move between tabs, as they do in any tab list.
  const moveBetweenTabs = (event: KeyboardEvent) => {
    const index = TABS.indexOf(tab)
    const next = {
      ArrowRight: TABS[(index + 1) % TABS.length],
      ArrowLeft: TABS[(index - 1 + TABS.length) % TABS.length],
      Home: TABS[0],
      End: TABS[TABS.length - 1],
    }[event.key]
    if (!next) return
    event.preventDefault()
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6">
      <OutfitSummary garments={garments} />

      <div>
        <div
          role="tablist"
          aria-label="Your wardrobe and saved outfits"
          onKeyDown={moveBetweenTabs}
          className="flex rounded-full bg-mist p-1"
        >
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={tabId(value)}
              aria-controls={panelId(value)}
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {TAB_LABELS[value]}{' '}
              <span className="ml-0.5 text-xs font-medium text-muted tabular-nums">{counts[value]}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" id={panelId('wardrobe')} aria-labelledby={tabId('wardrobe')} hidden={tab !== 'wardrobe'}>
          <WardrobeShelves garments={garments} onAddClothes={onAddClothes} />
        </div>
        <div role="tabpanel" id={panelId('outfits')} aria-labelledby={tabId('outfits')} hidden={tab !== 'outfits'}>
          <SavedOutfits garments={garments} />
        </div>
      </div>

      {storage === 'ready' && (
        <p className="-mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
          <LockIcon className="size-3.5 shrink-0" />
          Everything you add is saved in this browser, on this device only. Clearing your browsing data
          deletes it.
        </p>
      )}
    </div>
  )
}
