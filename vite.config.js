import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { reportRuntimeAssets } from './scripts/report-runtime-assets.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), reportRuntimeAssets()],
  base: './',
  worker: { format: 'es' },
  envPrefix: ['VITE_'],
})
