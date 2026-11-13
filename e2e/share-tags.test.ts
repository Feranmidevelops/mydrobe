import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { siteUrl, withSiteUrl } from '../vite.share-links.ts'

// Vitest runs from the project root.
const page = readFileSync('index.html', 'utf8')
const meta = (property: string) => page.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`))?.[1]

/** A JPEG's size, from its first start-of-frame marker. */
function jpegSize(bytes: Buffer) {
  for (let at = 2; at < bytes.length; at += 2 + bytes.readUInt16BE(at + 2)) {
    if (bytes[at] === 0xff && bytes[at + 1] >= 0xc0 && bytes[at + 1] <= 0xc2) {
      return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) }
    }
  }
  return null
}

describe('the share and icon tags', () => {
  it('give a link preview a title, description and a full-size picture', () => {
    expect(meta('og:title')).toBe('Mydrobe · Virtual wardrobe')
    expect(meta('og:description')).toBe(meta('description'))
    expect(meta('twitter:card')).toBe('summary_large_image')
    expect(meta('og:image')).toBe('/share.jpg')
    const size = jpegSize(readFileSync('public/share.jpg'))
    expect(size).toEqual({ width: Number(meta('og:image:width')), height: Number(meta('og:image:height')) })
    expect(size).toEqual({ width: 1200, height: 630 })
  })

  it('give iPhones an icon for the home screen, and the host a cache rule for each picture', () => {
    expect(page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    const png = readFileSync('public/apple-touch-icon.png')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180])
    const headers = readFileSync('public/_headers', 'utf8')
    for (const file of ['/apple-touch-icon.png', '/share.jpg']) expect(headers).toMatch(new RegExp(`^${file}\\r?\\n\\s+Cache-Control: `, 'm'))
  })
})

describe('withSiteUrl', () => {
  it("makes the picture's address absolute and adds the page's own, once the site has one", () => {
    const built = withSiteUrl(page, 'https://mydrobe.example/some/path')
    expect(built).toContain('<meta property="og:image" content="https://mydrobe.example/share.jpg" />')
    expect(built).toContain('<meta property="og:url" content="https://mydrobe.example/" />')
  })

  it('leaves the page alone without a site address', () => {
    expect(withSiteUrl(page, undefined)).toBe(page)
  })
})

describe('siteUrl', () => {
  it("takes SITE_URL, or Netlify's address on Netlify, and nothing else", () => {
    expect(siteUrl({ SITE_URL: 'https://a.example' })).toBe('https://a.example')
    expect(siteUrl({ NETLIFY: 'true', URL: 'https://b.netlify.app' })).toBe('https://b.netlify.app')
    expect(siteUrl({ URL: 'https://not-netlify.example' })).toBeUndefined()
    expect(siteUrl({})).toBeUndefined()
  })
})
