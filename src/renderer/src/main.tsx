import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './components/theme-provider'
import { ModeToggle } from './components/mode-toggle'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider storageKey="vite-ui-theme">
      <App />
    </ThemeProvider>
  </StrictMode>
)
