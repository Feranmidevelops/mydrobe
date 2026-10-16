import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

export function ResetIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.77" />
      <path d="M2.5 2.5v3h3" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

/* Larger outline icons for feature highlights, drawn on a 24-unit grid. */
const outline = { ...base, viewBox: '0 0 24 24', strokeWidth: 1.4 } as const

export function RotateIcon(props: IconProps) {
  return (
    <svg {...outline} {...props}>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" />
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="M17.5 7.5l2.5 1.5-1 2.6" />
    </svg>
  )
}

export function FigureIcon(props: IconProps) {
  return (
    <svg {...outline} {...props}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8.5 8.5h7l-1 6h-1.5L12.5 21h-1L11 14.5H9.5z" />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...outline} {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      <path d="M12 14.5v2.5" />
    </svg>
  )
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...outline} {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

export function HangerIcon(props: IconProps) {
  return (
    <svg {...outline} {...props}>
      <path d="M12 9.5V8.2a2 2 0 1 0-2-2" />
      <path d="M12 9.5l-8.4 5.6a1 1 0 0 0 .55 1.83h15.7a1 1 0 0 0 .55-1.83z" />
    </svg>
  )
}
