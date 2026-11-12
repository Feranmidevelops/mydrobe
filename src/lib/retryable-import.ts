/*
 * Browsers remember a module whose download failed and won't fetch it again
 * (the module map in the HTML spec), so retrying a dynamic import as written
 * fails at once, even after the connection is back. Asking for the same file
 * under a fresh address gets round that.
 */

/** The file a failed dynamic import was fetching, as Chromium and Firefox name it in their error. */
export function failedModuleUrl(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return /dynamically imported module: (\S+)$/.exec(error.message)?.[1] ?? null
}

function withRetry(url: string, retry: number): string | null {
  try {
    const fresh = new URL(url)
    fresh.searchParams.set('retry', String(retry))
    return fresh.href
  } catch {
    return null
  }
}

/**
 * Wraps a dynamic import so it can be tried again after its download fails:
 * each later call asks for the same file under a fresh address. Where the
 * browser doesn't say which file failed (Safari), later calls import as written.
 */
export function retryableImport<T>(
  load: () => Promise<T>,
  importUrl: (url: string) => Promise<T> = (url) => import(/* @vite-ignore */ url) as Promise<T>,
): () => Promise<T> {
  let failedUrl: string | null = null
  let retries = 0
  return () => {
    const fresh = failedUrl ? withRetry(failedUrl, ++retries) : null
    return (fresh ? importUrl(fresh) : load()).catch((error: unknown) => {
      failedUrl ??= failedModuleUrl(error)
      throw error
    })
  }
}
