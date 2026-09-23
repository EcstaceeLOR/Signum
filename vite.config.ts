import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@chain/casino-sdk/guest': fileURLToPath(
        new URL('./vendor/chain-casino-sdk/src/guest.ts', import.meta.url),
      ),
    },
  },
  server: { cors: true },
  preview: { cors: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: [...configDefaults.exclude, 'vendor/**'],
    pool: 'vmThreads',
    maxWorkers: 1,
  },
})
