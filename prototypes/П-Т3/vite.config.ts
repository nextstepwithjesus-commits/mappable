import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Техническая проба П-Т3 (09 § 10.2): поиск. Данные — public-data/ (сборка build/build.mts из synodal.tsv и dist-data-probe/).
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');

export default defineConfig({
  root: here,
  base: './',
  publicDir: resolve(here, 'public-data'),
  server: { fs: { allow: [repo] }, port: 5183, strictPort: true },
  preview: { port: 5184, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: resolve(here, 'dist'), target: 'es2022', emptyOutDir: true },
  test: { include: ['core/**/*.test.ts'], root: here, testTimeout: 30000 },
});
