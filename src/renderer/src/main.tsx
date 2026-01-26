import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/theme-provider'
import { StartupLoading } from './components/StartupLoading'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider storageKey="vite-ui-theme">
      <StartupLoading>
        <App />
      </StartupLoading>
    </ThemeProvider>
  </StrictMode>
)
