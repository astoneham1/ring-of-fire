import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'

// Invite links are served with a personalised title for link previews; the app itself is just "Ring of Fire".
document.title = 'Ring of Fire'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
