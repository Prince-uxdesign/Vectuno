import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found — check index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
