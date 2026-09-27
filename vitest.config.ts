import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // The `@/*` alias comes from tsconfig.json, so there is one source of truth.
  resolve: { tsconfigPaths: true },
  test: {
    // jsdom for everything: components, and the browser-only auth code (BroadcastChannel, Web Locks, cookies).
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
