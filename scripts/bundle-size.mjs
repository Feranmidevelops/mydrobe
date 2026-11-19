// How much the built app weighs: every file in dist/assets raw, gzipped (level 6)
// and brotli-compressed (quality 11), and the scripts and stylesheets each route
// downloads. Fonts and images are listed per file, not in the routes. Budgets
// only warn. Run after a build:
//   npm run build && npm run size              (a table)
//   npm run size -- --json | --markdown        (for scripts or docs)
import { readdirSync, readFileSync } from 'node:fs'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const DIST = new URL('../dist/', import.meta.url)
const ASSETS = new URL('assets/', DIST)

/**
 * Warn-only budgets in gzip kB, about 10% above the sizes when they were set
 * on 12 November 2026: 84.5, 150.0 and 425.4 kB.
 */
const BUDGETS = { landing: 93, fittingRoom: 165, fittingRoom3d: 468 }

const kb = (bytes) => Math.round(bytes / 102.4) / 10

function kindOf(file) {
  if (/\.worker-[\w-]+\.js$/.test(file)) return 'worker'
  if (/^PerfProbe-[\w-]+\.js$/.test(file)) return 'probe'
  if (file.endsWith('.js')) return 'js'
  if (file.endsWith('.css')) return 'css'
  if (/\.(woff2?|ttf|otf)$/.test(file)) return 'font'
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico)$/.test(file)) return 'image'
  return 'other'
}

const files = readdirSync(ASSETS).map((file) => {
  const bytes = readFileSync(new URL(file, ASSETS))
  const kind = kindOf(file)
  // Fonts and images are already compressed, so they're counted as they are.
  const compressible = !['font', 'image'].includes(kind)
  return {
    file,
    kind,
    raw: bytes.length,
    gzip: compressible ? gzipSync(bytes, { level: 6 }).length : bytes.length,
    brotli: compressible
      ? brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
      : bytes.length,
    source: kind === 'js' || kind === 'probe' ? bytes.toString('utf8') : '',
  }
})
const byName = new Map(files.map((file) => [file.file, file]))

/** Chunks a chunk imports statically ("import … from './x.js'"), so they load with it. Dynamic imports load later. */
const STATIC_IMPORT = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[\w$*{},\s]+?\s*from\s*)?["']\.\/([\w.-]+\.js)["']/g
/** Stylesheets Vite loads alongside a chunk are named in its preload list. */
const STYLESHEET = /assets\/([\w.-]+\.css)/g

function withDependencies(start) {
  const found = new Set()
  const visit = (name) => {
    const file = byName.get(name)
    if (!file || found.has(name)) return
    found.add(name)
    for (const [, imported] of file.source.matchAll(STATIC_IMPORT)) visit(imported)
  }
  for (const name of start) visit(name)
  // Stylesheets named in the preload lists of chunks that load.
  for (const name of [...found]) for (const [, css] of byName.get(name).source.matchAll(STYLESHEET)) found.add(css)
  return found
}

// The landing page is whatever index.html loads: its module script, preloads and stylesheets.
const html = readFileSync(new URL('index.html', DIST), 'utf8')
const fromHtml = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(([, file]) => file).filter((file) => byName.has(file))
const firstWith = (prefix) => files.find((file) => file.kind === 'js' && file.file.startsWith(prefix))?.file

const landing = withDependencies(fromHtml)
const pageChunk = firstWith('FittingRoomPage-')
const viewerChunk = firstWith('FittingRoom-')
const fittingRoom = new Set([...landing, ...withDependencies(pageChunk ? [pageChunk] : [])])
const fittingRoom3d = new Set([...fittingRoom, ...withDependencies(viewerChunk ? [viewerChunk] : [])])

const total = (names) =>
  [...names].reduce(
    (sum, name) => {
      const file = byName.get(name)
      return { raw: sum.raw + file.raw, gzip: sum.gzip + file.gzip, brotli: sum.brotli + file.brotli }
    },
    { raw: 0, gzip: 0, brotli: 0 },
  )

const routes = [
  { route: 'Landing page', files: landing, budget: BUDGETS.landing },
  { route: 'Fitting room, before the 3D view', files: fittingRoom, budget: BUDGETS.fittingRoom },
  { route: 'Fitting room with the 3D view', files: fittingRoom3d, budget: BUDGETS.fittingRoom3d },
].map(({ route, files, budget }) => ({ route, ...total(files), budgetGzip: budget * 1024, files: [...files].sort() }))

const warnings = []
if (!pageChunk || !viewerChunk) warnings.push('The FittingRoomPage or FittingRoom chunk is missing: has a file been renamed?')
for (const file of files) {
  // A script no route accounts for is code that some page loads in a way this script doesn't know.
  if (file.kind === 'js' && !fittingRoom3d.has(file.file)) warnings.push(`${file.file} isn't part of any route`)
}
for (const route of routes) {
  if (route.gzip > route.budgetGzip) {
    warnings.push(`${route.route}: ${kb(route.gzip)} kB gzip is over its ${kb(route.budgetGzip)} kB budget`)
  }
}

const report = {
  routes: routes.map(({ route, raw, gzip, brotli, budgetGzip, files }) => ({ route, raw, gzip, brotli, budgetGzip, files })),
  files: files.map(({ file, kind, raw, gzip, brotli }) => ({ file, kind, raw, gzip, brotli })).sort((a, b) => b.raw - a.raw),
  warnings,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else if (process.argv.includes('--markdown')) {
  console.log('| Route | Raw kB | Gzip kB | Brotli kB | Gzip budget kB |')
  console.log('|---|---|---|---|---|')
  for (const route of report.routes) {
    console.log(`| ${route.route} | ${kb(route.raw)} | ${kb(route.gzip)} | ${kb(route.brotli)} | ${kb(route.budgetGzip)} |`)
  }
  console.log('')
  console.log('| File | Kind | Raw kB | Gzip kB | Brotli kB |')
  console.log('|---|---|---|---|---|')
  for (const file of report.files) {
    console.log(`| ${file.file} | ${file.kind} | ${kb(file.raw)} | ${kb(file.gzip)} | ${kb(file.brotli)} |`)
  }
} else {
  console.table(
    Object.fromEntries(
      report.routes.map((route) => [
        route.route,
        { 'raw kB': kb(route.raw), 'gzip kB': kb(route.gzip), 'brotli kB': kb(route.brotli), 'gzip budget kB': kb(route.budgetGzip) },
      ]),
    ),
  )
  console.table(
    Object.fromEntries(
      report.files.map((file) => [file.file, { kind: file.kind, 'raw kB': kb(file.raw), 'gzip kB': kb(file.gzip), 'brotli kB': kb(file.brotli) }]),
    ),
  )
}
for (const warning of warnings) console.warn(`Warning: ${warning}`)
