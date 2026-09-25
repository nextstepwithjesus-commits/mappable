import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Режимы сборки: обычный сайт (dist), один файл (dist-single) и страница для встраивания (dist-artifact):
// у встраиваемой шрифты вложены в CSS, потому что рамка просмотра пропускает шрифты только из data: URI.
const OUT: Record<string, string> = { single: 'dist-single', artifact: 'dist-artifact' };

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [preact(), viteSingleFile()] : [preact()],
  json: { stringify: true },
  build: {
    outDir: OUT[mode] ?? 'dist',
    target: 'es2022',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : mode === 'artifact' ? (file: string) => (/\.(woff2?|ttf)$/.test(file) ? true : undefined) : 4096,
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
