import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/components.css'
import './styles/app.css'
import { App } from './App'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './shell/Toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>
  </StrictMode>
)
