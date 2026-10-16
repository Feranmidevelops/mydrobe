/**
 * Which mannequin the viewer draws. No licensed GLB mannequin has been
 * verified yet, so the figure is generated in code and labelled as such in
 * the UI. See "Replacing the procedural mannequin" in the README.
 */
export const MANNEQUIN_ASSET = {
  kind: 'procedural',
  label: 'Procedural mannequin · placeholder',
  note: 'Generated in code until a licensed 3D mannequin model is added.',
} as const
