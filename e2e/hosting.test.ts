import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ROUTES } from '../src/app/router.ts'

/*
 * The host's rules in public/_redirects and public/_headers ship with the
 * build. These checks keep them in step with the app: a page added to the
 * router but not to _redirects only fails once someone opens it directly on
 * the live site.
 */

// Vitest runs from the project root.
const read = (name: string) => readFileSync(`public/${name}`, 'utf8')

/** The lines of a rules file that aren't blank or comments. */
const rules = (text: string) => text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'))

/** Each path in _headers, with the headers indented under it (names in lower case). */
function headerRules(text: string) {
  const paths = new Map<string, Map<string, string>>()
  let current = new Map<string, string>()
  for (const line of rules(text)) {
    if (!/^\s/.test(line)) {
      current = new Map()
      paths.set(line.trim(), current)
      continue
    }
    const colon = line.indexOf(':')
    current.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
  }
  return paths
}

describe('the hosting rules', () => {
  const redirects = rules(read('_redirects')).map((line) => line.trim().split(/\s+/))
  const headers = headerRules(read('_headers'))

  it('serve the app, never cached, for every page opened directly', () => {
    for (const route of Object.values(ROUTES)) {
      if (route !== ROUTES.home) expect(redirects).toContainEqual([route, '/index.html', '200'])
      expect(headers.get(route)?.get('cache-control')).toBe('no-cache')
    }
  })

  it('answer nothing else with the page, so a script missing after a deploy is a 404', () => {
    for (const [from] of redirects) expect(from).not.toContain('*')
  })

  it('keep the hashed build files for a year', () => {
    expect(headers.get('/assets/*')?.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it("let only the site's own scripts run, and photos show from blob: URLs", () => {
    const policy = headers.get('/*')?.get('content-security-policy') ?? ''
    const directive = (name: string) => policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
    expect(directive('script-src')).toBe("script-src 'self'")
    expect(directive('img-src')).toContain('blob:')
    expect(policy).not.toContain('unsafe-eval')
  })
})
