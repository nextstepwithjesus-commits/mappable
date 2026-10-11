import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Техническая проба П-Т5 (09 § 10.2): модель «Назад». Имена лиц — сборка пробы dist-data-probe/ (плашка «Данные не проверены: проба»).
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');

export default defineConfig({
  root: here,
  base: '/',
  publicDir: resolve(repo, 'dist-data-probe'),
  server: { fs: { allow: [repo] }, port: 5185, strictPort: true },
  preview: { port: 5186, strictPort: true },
  appType: 'spa',
  build: { outDir: resolve(here, 'dist'), target: 'es2022', emptyOutDir: true },
  test: { include: ['core/**/*.test.ts', 'tests/**/*.test.ts'], root: here, testTimeout: 60000, hookTimeout: 120000, fileParallelism: false },
});
