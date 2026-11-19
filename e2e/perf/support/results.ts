import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { test } from '@playwright/test'

/*
 * Results go to perf-results/<project>-latest.json one section at a time, so
 * a failure later in the run (which restarts Playwright's worker) can't lose
 * what was already measured. The run ends with a dated copy.
 */

const DIR = new URL('../../../perf-results/', import.meta.url)
const latest = () => new URL(`${test.info().project.name}-latest.json`, DIR)

const read = (): Record<string, unknown> => (existsSync(latest()) ? JSON.parse(readFileSync(latest(), 'utf8')) : {})

/** Starts a fresh results file for this project. */
export function startRun() {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(latest(), '{}\n')
}

/** Saves one section of results straight away. */
export function record(section: string, data: unknown) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(latest(), `${JSON.stringify({ ...read(), [section]: data }, null, 2)}\n`)
}

/**
 * Keeps a dated copy of the run's results and says where they are. A failed
 * test restarts the worker, so this can run more than once in a run: the copy
 * is named after when the run started, so a later call just brings it up to date.
 */
export function finishRun() {
  if (!existsSync(latest())) return
  const started = (read().environment as { measuredAt?: string } | undefined)?.measuredAt ?? new Date().toISOString()
  const stamp = started.replace(/[:.]/g, '-')
  const dated = new URL(`${test.info().project.name}-${stamp}.json`, DIR)
  copyFileSync(latest(), dated)
  console.log(`Performance results: ${decodeURIComponent(dated.pathname).replace(/^\/([A-Za-z]:)/, '$1')}`)
}
