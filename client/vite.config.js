import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    chunkSizeWarningLimit: 12000,
    rollupOptions: {
      output: {
        manualChunks: {
          'data-part1': ['./src/data/companies-part1.json'],
          'data-part2': ['./src/data/companies-part2.json'],
        }
      }
    }
  }
})
