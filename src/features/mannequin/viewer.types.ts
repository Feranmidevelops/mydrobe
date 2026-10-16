export const BODY_PRESETS = ['small', 'medium', 'large'] as const

export type BodyPreset = (typeof BODY_PRESETS)[number]

export const BODY_PRESET_LABELS: Record<BodyPreset, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}
