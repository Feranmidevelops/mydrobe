/** The same garment on three mannequins, so one glance shows front, side and back. */
export const TRIAL_VIEWS = [
  { label: 'Front', x: -0.95, turn: 0 },
  { label: 'Side', x: 0, turn: -Math.PI / 2 },
  { label: 'Back', x: 0.95, turn: Math.PI },
] as const
