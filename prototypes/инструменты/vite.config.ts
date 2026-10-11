import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Рабочий прототип пакета 1 «Истории и Время» (10 § 4.2.2). Основа адресов — путь сборки в репозитории: так страницы
// открывает и задание CI «прототипы» (свой сервер на localhost от корня проекта, tools/ci/prototypes.ts).
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');
export const BASE = '/prototypes/инструменты/dist/';

export default defineConfig({
  root: here,
  base: BASE,
  plugins: [preact()],
  server: { fs: { allow: [repo] }, port: 5190, strictPort: true },
  preview: { port: 5191, strictPort: true },
  appType: 'spa',
  build: { outDir: resolve(here, 'dist'), target: 'es2022', emptyOutDir: true, assetsInlineLimit: 0 },
  test: { include: ['тесты/**/*.test.ts'], root: here, testTimeout: 120000, hookTimeout: 180000, fileParallelism: false },
});
