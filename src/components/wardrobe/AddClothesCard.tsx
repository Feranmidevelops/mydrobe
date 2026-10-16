import type { Ref } from 'react'
import { PlusIcon } from '../ui/icons'

interface AddClothesCardProps {
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}

/** The first tile under "Your clothes"; shaped like a garment card so the grid stays even. */
export function AddClothesCard({ onClick, ref }: AddClothesCardProps) {
  return (
    <button ref={ref} type="button" onClick={onClick} className="group flex w-full flex-col rounded-xl text-left">
      <span className="grid aspect-square place-items-center rounded-xl border border-dashed border-ink/25 bg-surface transition group-hover:border-ink/50 group-hover:bg-sand/60">
        <span className="grid size-11 place-items-center rounded-full bg-ink text-cream transition duration-300 motion-safe:group-hover:scale-105">
          <PlusIcon className="size-5" />
        </span>
      </span>
      <span className="mt-2.5 text-sm leading-snug font-semibold text-ink">Add clothes</span>
      <span className="text-xs text-muted">From a photo</span>
    </button>
  )
}
