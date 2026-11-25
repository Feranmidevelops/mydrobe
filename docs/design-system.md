# Mydrobe design system

What the app already uses, pulled from the code on 25 November 2026. The tokens live in `src/styles/index.css` (Tailwind 4's `@theme`), and the components are Tailwind classes in `src/components`. This note records what is there; the last section lists where the code drifts from it.

## Colour

Two layers, as in the theme: a warm brown and cream **palette**, and **roles** that components should use.

| Palette | Hex | Mostly for |
|---|---|---|
| `espresso` | `#4a2d1f` | Darkest brown: text, primary buttons |
| `cocoa` | `#5b3a28` | Hover on dark buttons |
| `tan` | `#835d3e` | Accent: focus rings |
| `taupe` | `#6f6257` | Quiet text |
| `cream` | `#f6f1ec` | Page background, text on dark |
| `sand` | `#eee6dd` | Hover fills, landing tiles |
| `mist` | `#e8e3dd` | Image wells, chips, tab tracks |

| Role | Value | Use |
|---|---|---|
| `ink` | espresso | Main text, primary button fill |
| `ink-soft` | `#6a4b3a` | Secondary text, quiet buttons |
| `muted` | taupe | Captions, hints, labels |
| `canvas` | cream | Page background |
| `surface` | `#fbf8f4` | Raised panels, cards, floating controls |
| `stage` | `#e9ddd0` | The 3D stage (drawn as a radial gradient, `#f7f0e8` to `#e4d6c7`) |
| `line` | `#e5d9cc` | Borders and dividers |
| `accent` | tan | Focus outline |
| `warn` / `warn-soft` | `#7a4f0e` / `#f9eed6` | Warning text on its pale fill |

Text contrast: `ink` on `canvas` is 11:1, `muted` on `canvas` 5.3:1 and on `mist` 4.6:1, and `warn` on `warn-soft` 6.2:1.

## Type

- **Family:** `'Helvetica Neue', 'Inter Variable', Helvetica, Arial, sans-serif`. Helvetica Neue where the device has it (Apple), the bundled Inter elsewhere.
- **Weights:** semibold for UI and most headings, bold for display and the wordmark, medium for chips and secondary buttons.

| Size | Role | Example |
|---|---|---|
| 48 px (`5xl`), 30 px on phones | Display, uppercase, tight | Landing hero |
| 24–30 px (`2xl`/`3xl`) | Section heading, tight | "Made for every body", privacy title |
| 18–20 px (`lg`/`xl`) | Title | Dialog and stage messages, outfit summary |
| 14–18 px | Wordmark: bold, uppercase, tracked 0.24em | MYDROBE in the headers and footer |
| 16 px (`base`) | Long-form body | Landing and privacy copy |
| **14 px (`sm`)** | **Body and buttons: the workhorse** (48 uses) | Almost everything |
| 12 px (`xs`) | Meta, chips, small buttons | Filters, counts |
| 11 px (`[11px]`) | Micro: notices, hints, badges, shelf titles (tracked 0.18em, uppercase) | "Visual body shapes, not size advice" |

## Shape, depth and motion

- **Radius:** `full` for every control (buttons, chips, pills, inputs, tab tracks), `xl` for cards and image wells, `2xl` for panels (dialog, toast, outfit cards, drop zones, the floating view controls).
- **Shadow:** `sm` for anything floating over the stage and the selected tab, `lg` for the toast, `2xl` for the dialog on desktop, and a 1 px `line` shadow under the stage pinned on phones.
- **Floating over the 3D stage:** `bg-surface/90`, `ring-1 ring-line`, `shadow-sm`, `backdrop-blur`.
- **Focus:** a 2 px `accent` outline with a 2 px offset on every focusable element (global `:focus-visible`).
- **Motion:** colour transitions on hover (Tailwind's 150 ms), and a 3–4% scale on card hover, motion-safe only. `animate-appear` fades in after 400 ms over 200 ms, so quick statuses never flash. Smooth scrolling only without reduced motion.

## Components

| Component | Recipe | Where |
|---|---|---|
| Primary button | `rounded-full bg-ink text-cream font-semibold hover:bg-cocoa`, at md `px-5 py-2.5 text-sm`, sm `px-4 py-2 text-sm`, xs `px-3 py-1 text-xs` | Save, Add to wardrobe, Try again |
| Quiet button | `rounded-full text-ink-soft hover:bg-sand hover:text-ink`, hovering to `canvas` inside floating tracks | Camera views, Reset camera, Take off, Remove, Close |
| On-photo buttons | White fill with `text-espresso`, or a `white/80` outline | Landing hero only |
| Choice chip | `rounded-full bg-mist text-xs font-medium text-ink-soft`, checked `bg-ink text-cream` | Wardrobe filters, upload choices |
| Floating track | The floating recipe above with `p-1`. It holds radio segments (the selected one dark) or quiet buttons | Body size, camera views |
| Tabs | `rounded-full bg-mist p-1` track, selected tab `bg-surface shadow-sm` | Wardrobe / Outfits |
| Status pill | The floating recipe above, 11–12 px `ink-soft`, `animate-appear` | Fitting status, analysis progress |
| Warning | `bg-warn-soft text-warn`, as a pill (`ring-warn/15`) or a note | Fit warnings, private-mode note |
| Garment card | `rounded-xl bg-mist` well with a canvas thumbnail, 14 px name, "2D only" badge | Wardrobe shelves |
| Drop zone and add card | Dashed `border-ink/25` on `surface`, darker border and `sand` on hover | Add clothes, upload, empty outfits |
| Outfit card | `rounded-2xl border border-line bg-surface p-3`, `border-ink` when worn | Saved outfits |
| Text field | `rounded-full border border-line bg-white px-4 py-2 text-sm` | Outfit name |
| Toast | `rounded-2xl bg-ink text-cream shadow-lg` with a dismiss button | Added, saved, errors |
| Dialog | Native `<dialog>`, `rounded-2xl`, full screen on phones, blurred backdrop | Add clothes |

## Drift to tidy

1. **Palette names where a role exists:** `text-espresso` (18 uses, the same colour as `ink`), `text-taupe` (8, the same as `muted`), and `bg-espresso` on two buttons. These are mostly the landing and privacy pages. Retheming the roles would miss them.
2. **Roles the code reaches around:** hover (`cocoa`), wells and chips (`mist`, `sand`), text on dark (`cream`) and a white field (`bg-white`, 4 uses). The toast's error icon uses a raw `#f4c9a8`.
3. **Off-scale values:**
   - 11 px is a real size (11 uses in 9 files) and 10 px appears once; they could be one `text-2xs` token.
   - The tracked uppercase labels use 0.18, 0.22 and 0.24em for one role.
   - Headings at one level mix bold and semibold: the landing's are bold, the privacy title semibold, and dialog titles bold where stage messages are semibold.
4. **The primary button is written out 9 times**, with `ink` or `espresso`, `semibold` or `medium`, and `py-2` or `py-2.5`. That's well past three uses, so it's ready to be one `<Button size>` component.
5. **Colours outside the theme:** the stage gradient's hexes in `FittingRoomPage.tsx`, and `SeparationPreview.tsx`'s canvas colours, which repeat `tan` and `espresso`.
6. **Contrast:**
   - `line` is 1.24:1 on `canvas`, too faint to outline the text field (WCAG asks 3:1 for a control's edge).
   - `muted` text on the stage gradient drops to about 4.4:1, under 4.5:1 for small text.
