import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  clean: true,
  sourcemap: false,
  minify: false,
  dts: false,
})
