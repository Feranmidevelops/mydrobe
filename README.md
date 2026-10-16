# Mydrobe: a virtual wardrobe

Style your own clothes on an interactive 3D mannequin, right in the browser. Mydrobe is local-first: no account, no backend and no paid AI. Everything runs on the device.

> **Status: Milestone 1 of the seven-day MVP plan.** The 3D fitting room, body presets and garment templates work using a built-in demo wardrobe. Photo uploads, IndexedDB persistence and saved outfits come in later milestones (see [Roadmap](#roadmap)).

## What works today

- A genuine 3D mannequin (WebGL, not a rotating image). Drag to rotate a full 360°, scroll or pinch to zoom, and use the Front / Side / Back / Reset buttons.
- **Small, Medium and Large** body presets. These are visual silhouettes, not size advice. Switching presets keeps the outfit on and refits the garments.
- A demo wardrobe of 8 pieces with category filters. Pick one item per category to dress the mannequin.
- Three garment templates: long-sleeve shirt, short-sleeve tee and straight trousers.
- Items with no 3D template, such as the demo overcoat, stay selectable. The app says why they aren't on the mannequin instead of drawing something wrong.
- Loading, empty, WebGL-unsupported and viewer-crash states.
- A responsive layout: the fitting room sits beside the wardrobe on desktop and above it on phones.

## Getting started

Requires Node 20.19+ or 22.12+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload       |
| `npm test`          | Vitest unit and component tests       |
| `npm run typecheck` | TypeScript project build, no emit     |
| `npm run lint`      | ESLint                                |
| `npm run build`     | Type-check, then a production build   |
| `npm run preview`   | Serve the production build locally    |

No environment variables or secrets are needed.

## How it's built

React 19, TypeScript and Vite, styled with Tailwind CSS v4. The 3D view uses Three.js with React Three Fiber and Drei. Zustand holds the state that the wardrobe panel and the viewer share. Vitest and Testing Library run the tests.

```
src/
├── app/                  App layout
├── components/
│   ├── layout/           Header
│   ├── outfit-builder/   Viewer stage, view controls, body presets, notices
│   ├── wardrobe/         Wardrobe panel, garment cards, thumbnails
│   └── ui/               Icons, error boundary
├── features/
│   ├── garments/         Garment types, 3D template registry, demo wardrobe
│   ├── outfits/          Outfit selection rules
│   └── mannequin/        Body presets, geometry, fitting room, camera, textures
├── hooks/                useWardrobeGarments (where uploads will plug in)
├── lib/                  Procedural fabric drawing
└── store/                Shared UI state
```

A few decisions worth knowing:

- **The 3D viewer is lazy-loaded.** The app shell is about 76 kB gzipped and becomes usable first. The Three.js chunk (about 280 kB gzipped) loads after it.
- **Rendering is on demand.** The canvas only redraws while the camera moves or the scene changes. Camera movement never goes through React state, so rotating doesn't re-render the UI.
- **Single draw calls.** The mannequin is merged into one mesh. Each garment is two meshes: front panel and fabric.

### Garment rendering contract

A photo of a shirt can't become a true 3D shirt by itself. Mydrobe maps images onto prepared template meshes:

- **Front panel:** the garment's front-facing image is projected straight onto the front of the template, the same way the photo was taken. Uploaded photos will use this path.
- **Back, sleeves and collar:** a seamless fabric swatch tiled at real-world scale. The app doesn't make up a back view that a single front photo can't show.
- Templates are generated from the same body cross-sections as the mannequin, plus some ease. That's how they refit every preset, and why untucked shirts always hang outside the trousers.

## Mannequin asset

**No licensed GLB/GLTF mannequin has been verified yet.** The figure is generated in code (`src/features/mannequin/body-shape.ts`) and labelled "Procedural mannequin · placeholder" in the UI (`mannequin-asset.ts`).

### Replacing the procedural mannequin

1. Source one GLB per preset (or one rigged GLB with shape keys). Confirm the licence allows commercial redistribution, and record the source, author and licence below.
2. Add the files under `public/models/`. The planned names are `mannequin-small.glb`, `mannequin-medium.glb` and `mannequin-large.glb`.
3. Load them in `Mannequin.tsx` with Drei's `useGLTF`, and switch `MANNEQUIN_ASSET` away from `procedural` so the placeholder label disappears.
4. Keep garments fitting: templates currently follow the procedural body's cross-sections. A new body needs matching cross-sections measured from the model, or garment meshes authored against it.

| Asset | Source | Licence |
| ----- | ------ | ------- |
| Procedural mannequin | Generated in this repo | Same as the project |

## Known limitations

- The demo wardrobe is built in. Uploading your own photos isn't available yet.
- Nothing is saved yet. Outfits reset when the page reloads.
- The mannequin is a stylised placeholder, not a realistic body scan. Garments are fitted shells with no cloth simulation, folds or drape.
- The presets are visual only. They don't predict fit or recommend sizes.

## Roadmap

From the implementation blueprint's seven-day plan:

1. **3D fitting room, body presets, garment templates** ✅
2. Photo-to-template mapping trial with real shirts and trousers (the highest-risk assumption)
3. Upload validation, thumbnails and the user's own wardrobe
4. IndexedDB persistence (Dexie) and outfit save, rename, reopen and delete
5. Responsive polish across every empty, error and loading state
6. End-to-end tests (Playwright) and performance tuning
7. Docs, deployment and smoke tests
