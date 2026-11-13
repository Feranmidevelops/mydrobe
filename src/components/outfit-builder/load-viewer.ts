import { lazy } from 'react'
import { retryableImport } from '../../lib/retryable-import'

/**
 * Three.js is the heaviest part of the app, so the 3D view loads after the
 * shell. Vite names the built file after the module, which is how a retry
 * finds it in Safari.
 */
const loadViewer = retryableImport(() => import('../../features/mannequin/FittingRoom'), {
  file: /\/FittingRoom-[\w-]+\.js$/,
})

/** Shared by every fitting room, so the 3D view downloads once however often it renders. */
let viewer = lazy(loadViewer)

/** The 3D view, as a lazy component. */
export const currentViewer = () => viewer

/**
 * A new lazy component for the 3D view, to try again after its download
 * failed. React keeps a lazy component's first outcome for good, so only a
 * new one fetches again.
 */
export function reloadViewer() {
  viewer = lazy(loadViewer)
  return viewer
}
