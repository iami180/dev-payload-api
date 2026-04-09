import { defineConfig } from 'vitest/config'

/**
 * Real HTTP checks against the deployed API (Render / production).
 * Cold start can be slow — generous timeout.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['live/**/*.test.ts'],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
})
