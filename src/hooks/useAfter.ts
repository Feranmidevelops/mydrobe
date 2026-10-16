import { useEffect, useState } from 'react'

/** True once `ms` milliseconds have passed since the component appeared. */
export function useAfter(ms: number): boolean {
  const [passed, setPassed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setPassed(true), ms)
    return () => clearTimeout(timer)
  }, [ms])
  return passed
}
