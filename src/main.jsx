import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ImageViewerWindow from './components/ImageViewerWindow.jsx'

const isImageViewer = new URLSearchParams(window.location.search).get('view') === 'image-viewer';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isImageViewer ? <ImageViewerWindow /> : <App />}
  </StrictMode>,
)
