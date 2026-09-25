import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    isolate: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
