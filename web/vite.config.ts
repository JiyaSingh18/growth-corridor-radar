import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves this app from /growth-corridor-radar/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/growth-corridor-radar/',
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 4000 },
})
