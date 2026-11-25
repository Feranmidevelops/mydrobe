import { useFrame } from '@react-three/fiber'
import { useState } from 'react'

/** True once the 3D view has started drawing, for work that mustn't hold up its first frame. */
export function useFirstFrameDrawn() {
  const [drawn, setDrawn] = useState(false)
  useFrame(() => {
    if (!drawn) setDrawn(true)
  })
  return drawn
}
