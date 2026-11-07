import { defineConfig } from 'tsup';

// Bundle the workspace packages and all dependencies into one self-contained file so the
// VPS (or a container) only needs `node dist/index.js` - no node_modules at runtime.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/.*/],
  // Optional native addon of `pg`; never installed here and never loaded.
  external: ['pg-native'],
});
