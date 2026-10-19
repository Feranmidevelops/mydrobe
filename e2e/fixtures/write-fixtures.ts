// Writes the generated photos to e2e/fixtures/out/, for trying uploads by hand
// (on a real phone, say). Run with: npm run e2e:fixtures
import { mkdirSync, writeFileSync } from 'node:fs'
import { encodePng } from '../support/png.ts'
import { EXPECTED, shirtPhoto, trousersPhoto } from './garment-photos.ts'

const out = new URL('./out/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL(EXPECTED.shirt.file, out), encodePng(shirtPhoto()))
writeFileSync(new URL(EXPECTED.trousers.file, out), encodePng(trousersPhoto()))
console.log(`Wrote ${EXPECTED.shirt.file} and ${EXPECTED.trousers.file} to e2e/fixtures/out/`)
