import '@fontsource-variable/inter/opsz.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/index.css'
import { TrialPage } from './TrialPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrialPage />
  </StrictMode>,
)
