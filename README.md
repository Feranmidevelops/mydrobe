# Mydrobe: a virtual wardrobe

Style your own clothes on an interactive 3D mannequin, right in the browser. Mydrobe is local-first: no account, no backend and no paid AI. Everything runs on the device.

> **Status: Milestones 1 to 4 of the seven-day MVP plan are done.** The 3D fitting room, body presets and garment templates work with a built-in demo wardrobe. You can add your own clothes from a photo, save outfits, and find both again after a reload, all kept in this browser. The photo trial showed which photos look convincing ([write-up](docs/milestone-2-photo-trial.md)), and the upload screen teaches those rules. Responsive polish, end-to-end tests and deployment come next (see [Roadmap](#roadmap)).

## What works today

- A **landing page** at `/` in a warm, shop-style look: hero, featured looks, why Mydrobe and body shapes. Every section leads into the fitting room at `/fitting-room`. *Try the look* opens it already wearing that outfit.
- A genuine 3D mannequin (WebGL, not a rotating image). Drag to rotate a full 360°, scroll or pinch to zoom, and use the Front / Side / Back / Reset buttons.
- **Small, Medium and Large** body presets. These are visual silhouettes, not size advice. Switching presets keeps the outfit on and refits the garments.
- **Your own clothes from a photo.** *Add clothes* opens a two-step dialog:
  - choose or drop a JPEG, PNG or WebP photo (up to 15 MB), with the four photo rules alongside
  - check how it came out: the background is faded so you can see what counts as garment, and you choose a name (suggested from the main colour), what it is, the sleeve length and how much background to remove
  - add it, and it appears under *Your clothes* with a cut-out thumbnail and goes straight onto the mannequin. It can be removed again.
- A demo wardrobe of 8 pieces next to your own, with category filters across both. Pick one item per category to dress the mannequin.
- **Saved outfits.** *Save outfit* names what's on the mannequin and remembers its body shape. The *Outfits* tab lists them to wear again, rename or delete. If a piece in an outfit is later removed, the outfit says which one is gone instead of breaking.
- **Everything is kept in this browser** with IndexedDB: your clothes, their photos and your outfits survive a reload. Nothing is uploaded anywhere. If the browser won't allow saving (some private modes), the app says so and still works for that visit.
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

React 19, TypeScript and Vite, styled with Tailwind CSS v4. Type is set in Helvetica Neue on Apple devices and in the bundled Inter everywhere else. The 3D view uses Three.js with React Three Fiber and Drei. Zustand holds the state that the wardrobe panel and the viewer share, and Dexie keeps clothes and outfits in IndexedDB. Vitest and Testing Library run the tests, against an in-memory IndexedDB (fake-indexeddb) rather than mocks.

```
src/
├── app/                  Pages (landing, fitting room) and the tiny router
├── assets/landing/       Rendered images for the landing page
├── capture/              Dev-only page that renders those images
├── components/
│   ├── landing/          Landing page sections
│   ├── layout/           Fitting room header
│   ├── outfit-builder/   Viewer stage, view controls, body presets, notices
│   ├── outfits/          Save outfit form, saved outfits list and cards
│   ├── upload/           Upload dialog: photo picker, review step, preview
│   ├── wardrobe/         Wardrobe panel and tabs, shelves, garment cards, thumbnails
│   └── ui/               Icons, notices, error boundary
├── features/
│   ├── garments/         Garment types, templates, demo wardrobe, upload checks, photo analysis, storage
│   ├── outfits/          Outfit rules, storage and service; selection rules; featured looks
│   ├── storage/          Restoring the saved wardrobe on start, save-failure messages
│   └── mannequin/        Body presets, geometry, fitting room, camera, textures
├── hooks/                useWardrobeGarments: your uploads, then the demo pieces
├── lib/                  The on-device database (Dexie), fabric drawing, image loading and processing
└── store/                Shared UI state
```

A few decisions worth knowing:

- **Two pages, no routing library.** A small router in `src/app/router.ts` keeps the path in the address bar. Static hosting needs the usual single-page-app fallback (serve `index.html` for unknown paths).
- **The 3D viewer is lazy-loaded.** The landing page ships in the main bundle, about 77 kB gzipped. The fitting room and the Three.js chunk (about 280 kB gzipped) only load when someone heads in, and start downloading when a fitting room link is hovered.
- **Rendering is on demand.** The canvas only redraws while the camera moves or the scene changes. Camera movement never goes through React state, so rotating doesn't re-render the UI.
- **Single draw calls.** The mannequin is merged into one mesh. Each garment is two meshes: front panel and fabric.

### Garment rendering contract

A photo of a shirt can't become a true 3D shirt by itself. Mydrobe maps images onto prepared template meshes:

- **Front panel:** the garment's front-facing image is projected straight onto the front of the template, the same way the photo was taken. Uploaded photos use this path.
- **Back, sleeves and collar:** a seamless fabric swatch tiled at real-world scale. The app doesn't make up a back view that a single front photo can't show.
- Templates are generated from the same body cross-sections as the mannequin, plus some ease. That's how they refit every preset, and why untucked shirts always hang outside the trousers.

### Adding clothes from a photo

"Upload" here means into the browser: photos never leave the device. Each photo goes through these steps:

1. **Checked** (`garment.validation.ts`): the format is read from the file's first bytes, not its name. iPhone HEIC photos get advice on sharing them as JPEG. There are limits on file size and image dimensions, and each refusal has a friendly message.
2. **Prepared** (`garment.service.ts`): decoded the right way up and scaled to at most 1600 px as WebP.
3. **Analysed** (`photo-analysis.ts`, in a web worker): finds the background from the edges inward, keeps the largest garment shape, and picks the front crop, a fabric sample and the main colours. Results are cached, so the 3D view reuses the review step's analysis.
4. **Reviewed** (`components/upload/`): the person sees the separation, names the piece and says what it is. Gentle notes flag a garment cut off at the edge, a tiny one, or background likely to show on the mannequin.
5. **Added**: a cut-out thumbnail is made, and the piece joins the wardrobe store and goes onto the mannequin. Photos that aren't added, or are removed later, are freed.

### Saving on this device

Persistence uses IndexedDB through Dexie (`src/lib/db.ts`), keeping UI state (Zustand) separate from what's stored:

| Table | Holds |
| ----- | ----- |
| `garments` | Each upload's details: name, category, template, colours, background setting, and the checked MIME type and size of the original file. It points at its images by key. |
| `images` | The prepared photo and cut-out thumbnail as bytes plus their type. Bytes rather than Blobs, because stored Blobs have been known to turn unreadable in some Safari versions. |
| `outfits` | Name, body preset, one garment id per slot, and slots whose garment has since been removed. Outfits never copy photos. |

- A garment and its images are saved and deleted together in one transaction. Deleting a garment also marks its slot as missing in any saved outfit, in the same transaction, so no outfit points at something that isn't there.
- New uploads are saved first and only then added to the wardrobe, so a failed save (a full device, say) gets a clear message and can simply be tried again.
- The saved wardrobe is read once when the fitting room opens. Photos get object URLs, which are released when a piece is removed.
- Data stays in this browser on this device. Clearing browsing data deletes it, and the app says so.

## Landing page images

The landing page photos are renders of our own mannequin and garment templates, so there are no stock-photo licences to track. To refresh them, for example after the mannequin changes:

1. `npm run dev`
2. Open `http://localhost:5173/capture.html?shot=hero-lineup` (other shots: `body-small`, `body-medium`, `body-large`).
3. Wait for the figures to appear, press **Download**, and save the file over the one in `src/assets/landing/`.

Shots are defined in `src/capture/shots.ts`. The capture page isn't part of the production build.

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
| Landing page renders | Rendered from this repo's scene | Same as the project |
| Inter typeface | [rsms/inter](https://github.com/rsms/inter) via `@fontsource-variable/inter` | SIL Open Font License 1.1 |

## Known limitations

- Saved clothes and outfits live in this browser only: they don't sync between devices or browsers, and clearing browsing data deletes them. Two open tabs don't see each other's changes until reloaded.
- What's on the mannequin isn't remembered between visits; save it as an outfit to keep it.
- Only shirts and trousers can be worn on the mannequin. Other uploads (outerwear, shoes, accessories) are kept in the wardrobe in 2D.
- Photos that break the [photo rules](docs/milestone-2-photo-trial.md#the-input-contract-for-uploads) (worn, folded, busy backgrounds) separate poorly. The review step shows this before anything is added. A hanger can show at the collar, and background can peek through a neck opening.
- The mannequin is a stylised placeholder, not a realistic body scan. Garments are fitted shells with no cloth simulation, folds or drape.
- The presets are visual only. They don't predict fit or recommend sizes.

## Roadmap

From the implementation blueprint's seven-day plan:

1. **3D fitting room, body presets, garment templates** ✅
2. **Photo-to-template mapping trial** ✅: template texturing works for photos that follow the [input contract](docs/milestone-2-photo-trial.md#the-input-contract-for-uploads)
3. **Upload validation, thumbnails and the user's own wardrobe** ✅: the photo rules are shown at upload, then a review step to check the separation before adding
4. **IndexedDB persistence (Dexie) and outfit save, rename, reopen and delete** ✅: clothes and outfits survive reloads, and deleted pieces show as missing in outfits
5. Responsive polish across every empty, error and loading state
6. End-to-end tests (Playwright) and performance tuning
7. Docs, deployment and smoke tests
