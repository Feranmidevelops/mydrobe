import type { Plugin } from 'vite'

/**
 * The site's address for this build: SITE_URL if it's set, or on Netlify the
 * address Netlify gives every build (its own subdomain, or your domain once
 * it's connected). Cloudflare Pages has no such address, so set SITE_URL there.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.SITE_URL || (env.NETLIFY === 'true' ? env.URL : undefined)
}

/**
 * Makes the share image's address absolute and adds the page's own address,
 * as Facebook, LinkedIn and X need for a link preview. Without a site
 * address the page is left as it is, with the image as a path from the root.
 */
export function withSiteUrl(html: string, site: string | undefined): string {
  if (!site) return html
  const origin = new URL(site).origin
  return html
    .replace(/(<meta property="og:image" content=")\//, `$1${origin}/`)
    .replace(/(\s*)(<meta property="og:type")/, `$1<meta property="og:url" content="${origin}/" />$1$2`)
}

export function shareLinks(site = siteUrl()): Plugin {
  return {
    name: 'mydrobe:share-links',
    transformIndexHtml: (html) => withSiteUrl(html, site),
  }
}
