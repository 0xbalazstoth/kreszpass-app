import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { setGraphicsSetting } from './components/scene3d/quality'
import { getSettings } from './db'
import './styles.css'

registerSW({ immediate: true })
// A 3D minőség beállítása induláskor (a nézetek addig az eszköz szerinti alapértéket használják)
void getSettings().then((s) => setGraphicsSetting(s.graphics))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
