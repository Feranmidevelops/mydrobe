import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CapturePage } from './CapturePage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CapturePage />
  </StrictMode>,
)
