import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node',
  },
  clean: true,
  sourcemap: false,
  minify: false,
  dts: false,
  noExternal: [/.*/],
})
