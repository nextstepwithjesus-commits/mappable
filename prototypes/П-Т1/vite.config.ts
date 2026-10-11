import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Техническая проба П-Т1 (09 § 10.2). Данные — сборка пробы `dist-data-probe/` (плашка «Данные не проверены: проба»).
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');

export default defineConfig({
  root: here,
  base: './',
  plugins: [preact()],
  publicDir: resolve(repo, 'dist-data-probe'),
  server: { fs: { allow: [repo] }, port: 5181, strictPort: true },
  preview: { port: 5182, strictPort: true },
  worker: { format: 'es' },
  build: { outDir: resolve(here, 'dist'), target: 'es2022', emptyOutDir: true },
  test: { include: ['core/**/*.test.ts'], root: here },
});
