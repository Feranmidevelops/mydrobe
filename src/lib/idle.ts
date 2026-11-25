/**
 * Runs `task` once the page has nothing else to do, or shortly after where the
 * browser can't say (Safari has no requestIdleCallback). The task gets the idle
 * deadline when there is one. Returns a cancel.
 */
export function whenIdle(task: (deadline?: IdleDeadline) => void) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(task, { timeout: 2000 })
    return () => cancelIdleCallback(id)
  }
  const id = setTimeout(task, 200)
  return () => clearTimeout(id)
}
