/*
 * Browsers remember a module whose download failed and won't fetch it again
 * (the module map in the HTML spec), so retrying a dynamic import as written
 * fails at once, even after the connection is back. Asking for the same file
 * under a fresh address gets round that. WebKit (Safari) goes further: it
 * remembers the failure for the rest of the tab's life, even across a reload.
 */

/** The file a failed dynamic import was fetching, as Chromium and Firefox name it in their error. */
export function failedModuleUrl(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return /dynamically imported module: (\S+)$/.exec(error.message)?.[1] ?? null
}

/** Whether a dynamic import failed for want of its file, as Safari words it, naming no file. */
function unnamedDownloadFailure(error: unknown) {
  return error instanceof TypeError && error.message === 'Importing a module script failed.'
}

/**
 * The address of a file Vite asked the browser to preload, found by its name
 * (`file`, matched against the path) among the page's preload links. Vite adds
 * one for an imported file just before importing it, so it's there even when
 * the browser's error doesn't say which file failed.
 */
export function preloadedFile(file: RegExp): string | null {
  if (typeof document === 'undefined') return null
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"], link[rel="preload"][as="script"]')) {
    if (file.test(new URL(link.href).pathname)) return link.href
  }
  return null
}

let attempts = 0

/**
 * `url` under an address never asked for before, not even before a reload:
 * WebKit would remember an earlier one failing too.
 */
function withRetry(url: string): string | null {
  try {
    const fresh = new URL(url)
    fresh.searchParams.set('retry', `${Date.now().toString(36)}${(++attempts).toString(36)}`)
    return fresh.href
  } catch {
    return null
  }
}

interface RetryOptions<T> {
  /**
   * The imported file's name as built, to find it among Vite's preload links
   * when the browser's error doesn't name it (Safari).
   */
  file?: RegExp
  importUrl?: (url: string) => Promise<T>
}

/**
 * Wraps a dynamic import so it can be tried again after its download fails:
 * each later call asks for the same file under a fresh address. The file is
 * the one the browser's error names (Chromium, Firefox), or else the preloaded
 * one matching `file` (Safari). In Safari it asks again under a fresh address
 * straight away, too: the first try after a reload fails without asking the
 * network, as WebKit remembers the earlier failure. Without either, later
 * calls import as written.
 */
export function retryableImport<T>(
  load: () => Promise<T>,
  { file, importUrl = (url) => import(/* @vite-ignore */ url) as Promise<T> }: RetryOptions<T> = {},
): () => Promise<T> {
  let failedUrl: string | null = null
  const again = () => {
    const fresh = failedUrl && withRetry(failedUrl)
    return fresh ? importUrl(fresh) : null
  }
  return () =>
    (again() ?? load()).catch((error: unknown) => {
      if (failedUrl) throw error
      failedUrl = failedModuleUrl(error)
      if (failedUrl || !unnamedDownloadFailure(error) || !file) throw error
      failedUrl = preloadedFile(file)
      const retry = again()
      if (!retry) throw error
      return retry
    })
}
