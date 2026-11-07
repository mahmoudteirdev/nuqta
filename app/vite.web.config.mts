// تشغيل الواجهة في متصفح عادي للمعاينة والمقارنة مع الصور، بدون Electron.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: { alias: { '@': resolve('src/renderer/src'), '@shared': resolve('src/shared') } },
  plugins: [react()],
  server: { port: 5180, strictPort: true }
})
