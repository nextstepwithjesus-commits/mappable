/// <reference lib="webworker" />
/**
 * Рабочий поток пробы: загрузка индекса, лес, замер подписей measureText в OffscreenCanvas
 * тем же шрифтом, раскладка, сетка (09 § 3.3). Главный поток получает готовую геометрию.
 */
import { buildForest, type Forest } from '../core/forest.ts';
import { layoutForest } from '../core/layout.ts';
import { buildGrid } from '../core/grid.ts';
import { synthIndex } from '../core/synth.ts';
import type { IndexPackage } from '../core/types.ts';
import { labelTexts, measureAll } from './measure.ts';
import literataCyr from '@fontsource-variable/literata/files/literata-cyrillic-wght-normal.woff2?url';
import literataLat from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url';
import golos from '../../../inputs/fonts/GolosText[wght].ttf?url';

export interface LayoutRequest { indexUrl: string; dataset: 'real' | 'synth'; textScale: number; widths?: Float64Array }

const cache: { pkg?: IndexPackage; forest?: Record<string, Forest>; fonts?: boolean } = {};
const fontsOk = async () => {
  if (cache.fonts !== undefined) return cache.fonts;
  const set = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!set || typeof FontFace === 'undefined' || typeof OffscreenCanvas === 'undefined') return (cache.fonts = false);
  const faces = [
    new FontFace('PT1 Literata', `url(${new URL(literataCyr, self.location.href)})`, { weight: '200 900', unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' }),
    new FontFace('PT1 Literata', `url(${new URL(literataLat, self.location.href)})`, { weight: '200 900', unicodeRange: 'U+0000-00FF, U+2000-206F' }),
    new FontFace('PT1 Golos', `url(${new URL(golos, self.location.href)})`, { weight: '400 900' }),
  ];
  try {
    await Promise.all(faces.map((f) => f.load()));
    faces.forEach((f) => set.add(f));
    return (cache.fonts = true);
  } catch {
    return (cache.fonts = false);
  }
};

self.onmessage = async (e: MessageEvent<LayoutRequest & { widthsFromMain?: ReturnType<typeof measureAll> }>) => {
  const req = e.data;
  const t: Record<string, number> = {};
  let a = performance.now();
  if (!cache.pkg) {
    cache.pkg = (await (await fetch(req.indexUrl)).json()) as IndexPackage;
    t.fetch = performance.now() - a;
    a = performance.now();
  }
  cache.forest ??= {};
  if (!cache.forest[req.dataset]) {
    const pkg = req.dataset === 'synth' ? synthIndex(cache.pkg, 10_000) : cache.pkg;
    cache.forest[req.dataset] = buildForest(pkg);
    t.forest = performance.now() - a;
    a = performance.now();
  }
  const forest = cache.forest[req.dataset];
  let w = req.widthsFromMain;
  if (!w) {
    if (!(await fontsOk())) {
      (self as unknown as Worker).postMessage({ needWidths: true, texts: labelTexts(forest) });
      return;
    }
    t.fonts = performance.now() - a;
    a = performance.now();
    const ctx = new OffscreenCanvas(8, 8).getContext('2d')!;
    w = measureAll(ctx, labelTexts(forest), req.textScale);
    t.measure = performance.now() - a;
    a = performance.now();
  }
  const ww = w;
  const geom = layoutForest(forest, { personText: (p) => ww.person[p], refText: (k) => ww.ref[k], shelfText: (s) => ww.shelf[s], textScale: req.textScale });
  t.layout = performance.now() - a;
  a = performance.now();
  const grid = buildGrid(geom);
  t.grid = performance.now() - a;
  (self as unknown as Worker).postMessage({ forest, geom, grid, timings: t, measuredIn: req.widthsFromMain ? 'main' : 'worker', banner: cache.pkg.banner, admit: cache.pkg.admit });
};
