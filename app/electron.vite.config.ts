import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { resolve: { alias: shared } },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src'), ...shared } },
    plugins: [react()],
    // صفحتين: البرنامج، وصفحة الطباعة اللي بتنفتح بنافذة مخفية.
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), print: resolve('src/renderer/print.html') } } }
  }
})
