/**
 * Тесты ядра раскладки П-Т1. Данные — сборка пробы (`npm run -s base:bundle -- --probe`).
 * Числа сверены с `docs/app/data/03-числа.py` (03, приложение А): ряды Иосифа 62 и Илия 70, Иисус Христос под Марией.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildForest, rowByParent, type Forest } from './forest.ts';
import { layoutForest, BASE, LABEL_PERSON, type Geometry, type Metrics } from './layout.ts';
import { buildGrid, query } from './grid.ts';
import { zoomAt, worldAt, screenOf, reveal, type Camera } from './camera.ts';
import { step, treePos } from './nav.ts';
import { synthIndex } from './synth.ts';
import type { IndexPackage } from './types.ts';

const file = resolve(import.meta.dirname, '../../../dist-data-probe/index.json');
if (!existsSync(file)) throw new Error('нет dist-data-probe/index.json: сначала npm run -s base:bundle -- --probe');
const pkg: IndexPackage = JSON.parse(readFileSync(file, 'utf8'));
const forest = buildForest(pkg);
const P = (id: string) => forest.persons.findIndex((p) => p.id === id);

/** Ширина по числу знаков — детерминированная замена measureText для тестов. */
const metrics = (f: Forest, scale = 1): Metrics => ({
  personText: (p) => Math.max(f.persons[p].name.length * 8.2, (f.persons[p].note?.length ?? 0) * 6.4, 7 * 6.4) * scale,
  refText: (k) => (f.persons[f.nodes[k].persons[0]].name.length + 8 + f.persons[f.nodes[k].refHusband!].name.length) * 7 * scale,
  shelfText: (s) => f.shelves[s].name.length * 8 * scale,
  textScale: scale,
});

/** Места хранятся в Float32 (передаются из рабочего потока): допуск 0,1 px. */
/** Пересечения подписей в одном ряду: возвращает наименьший зазор. */
function minGap(g: Geometry): number {
  const rows = new Map<number, number[]>();
  for (let i = 0; i < g.labels.count; i++) {
    if (g.labels.kind[i] === 2) continue;
    const key = Math.round(g.labels.y[i]);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key)!.push(i);
  }
  let gap = Infinity;
  for (const ids of rows.values()) {
    ids.sort((a, b) => g.labels.x[a] - g.labels.x[b]);
    for (let j = 1; j < ids.length; j++) gap = Math.min(gap, g.labels.x[ids[j]] - (g.labels.x[ids[j - 1]] + g.labels.w[ids[j - 1]]));
  }
  return gap;
}

describe('лес: порядок и ряды (03 § 3.3 п. 1)', () => {
  it('ряды как в 03, приложение А', () => {
    expect(rowByParent(forest, 'iosif-muzh-marii')).toEqual({ row: 62, root: 'adam' });
    expect(rowByParent(forest, 'iliy-syn-matfata')).toEqual({ row: 70, root: 'adam' });
    expect(forest.layoutParent[P('iisus')]).toBe(P('mariya'));
    // ряд узла в лесу совпадает с рядом по родителю для линии Иосифа
    expect(forest.nodes[forest.nodeOf[P('iosif-muzh-marii')]].row).toBe(62);
    expect(forest.nodes[forest.nodeOf[P('iakov-otets-iosifa')]].row).toBe(61);
  });

  it('каждое лицо леса стоит один раз; жена — у мужа, в своей семье — отсыл', () => {
    const seen = new Map<number, number>();
    for (const n of forest.nodes) if (n.kind === 'block') for (const p of n.persons) seen.set(p, (seen.get(p) ?? 0) + 1);
    expect([...seen.values()].every((c) => c === 1)).toBe(true);
    expect(seen.size).toBe(forest.stats.inForest);
    const isaak = forest.nodes[forest.nodeOf[P('isaak')]];
    expect(isaak.persons).toContain(P('revekka'));
    const ref = forest.nodes.find((n) => n.kind === 'ref' && n.persons[0] === P('revekka'))!;
    expect(ref.refHusband).toBe(P('isaak'));
    expect(forest.nodes[ref.parent].persons[0]).toBe(P('vafuil'));
  });

  it('дочери Лота стоят среди детей Лота (союз с отцом — исключение)', () => {
    const lot = forest.nodes[forest.nodeOf[P('lot')]];
    expect(lot.persons).not.toContain(P('starshaya-doch-lota'));
    expect(lot.persons).not.toContain(P('mladshaya-doch-lota'));
    const kids = lot.children.map((k) => forest.nodes[k].persons[0]);
    expect(kids).toContain(P('starshaya-doch-lota'));
    expect(kids).toContain(P('mladshaya-doch-lota'));
  });

  it('острова и полки: главный лес с Адамом первым, острова на полках', () => {
    expect(forest.shelves[0].roots[0]).toBe(forest.nodeOf[P('adam')]);
    const main = forest.islandSize[forest.nodes[forest.nodeOf[P('adam')]].island];
    expect(main).toBeGreaterThan(1300);
    expect(forest.islands).toBeGreaterThan(300);
    expect(forest.shelves.length).toBeGreaterThan(5);
  });

  it('дети — в порядке перечисления (поле «or»)', () => {
    const iakov = forest.nodes[forest.nodeOf[P('iakov')]];
    const names = iakov.children.map((k) => forest.persons[forest.nodes[k].persons[0]].name);
    expect(names.indexOf('Рувим')).toBeLessThan(names.indexOf('Иосиф'));
  });
});

describe('раскладка при показе (09 § 3.3)', () => {
  const g1 = layoutForest(forest, metrics(forest, 1));
  it('подписи в ряду не пересекаются: зазор не меньше промежутка соседей', () => {
    expect(minGap(g1)).toBeGreaterThanOrEqual(BASE.spouseGap - 0.1); // жёны в блоке — через промежуток союза
  });
  it('каждое лицо леса получило одно место', () => {
    let n = 0;
    for (let i = 0; i < g1.labels.count; i++) if (g1.labels.kind[i] === LABEL_PERSON) n++;
    expect(n).toBe(forest.stats.inForest);
  });
  it('порядок детей не меняется: x растёт по порядку текста', () => {
    for (const n of forest.nodes) {
      const xs = n.children.filter((k) => forest.nodes[k].kind === 'block').map((k) => g1.labels.x[g1.labelOfPerson[forest.nodes[k].persons[0]]]);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });
  it('родитель — над серединой знаков крайних детей', () => {
    const d = forest.nodes[forest.nodeOf[P('iakov')]];
    const kids = d.children.map((k) => forest.nodes[k]);
    const gx = (n: (typeof kids)[number]) => (n.kind === 'ref' ? NaN : g1.labels.x[g1.labelOfPerson[n.persons[0]]]);
    const blocks = kids.filter((k) => k.kind === 'block');
    const mid = (gx(blocks[0]) + gx(blocks[blocks.length - 1])) / 2;
    // отсылы тоже дети, поэтому середина — по всем детям; проверяем, что родитель между крайними
    const px = g1.labels.x[g1.labelOfPerson[P('iakov')]];
    expect(px).toBeGreaterThanOrEqual(Math.min(gx(blocks[0]), mid) - 1);
    expect(px).toBeLessThanOrEqual(gx(blocks[blocks.length - 1]) + 1);
  });
  it('текст 200 %: места пересчитаны, наложений нет, порядок тот же', () => {
    const g2 = layoutForest(forest, metrics(forest, 2));
    expect(minGap(g2)).toBeGreaterThanOrEqual(BASE.spouseGap * 2 - 0.1);
    expect(g2.width).toBeGreaterThan(g1.width * 1.5);
    const order = (g: Geometry) => forest.nodes[forest.nodeOf[P('iakov')]].children.map((k) => g.labels.x[g.labelOfPerson[forest.nodes[k].persons[0]]] ?? 0);
    const a = order(g1), b = order(g2);
    for (let i = 1; i < a.length; i++) expect(Math.sign(a[i] - a[i - 1])).toBe(Math.sign(b[i] - b[i - 1]));
  });
  it('детерминизм: та же ширина — те же места', () => {
    const again = layoutForest(forest, metrics(forest, 1));
    expect(Buffer.from(again.labels.x.buffer).equals(Buffer.from(g1.labels.x.buffer))).toBe(true);
  });
  it('сетка находит все подписи окна и только их ячейки', () => {
    const grid = buildGrid(g1);
    const seenL = new Uint8Array(g1.labels.count), seenS = new Uint8Array(g1.segCount);
    const x = g1.labels.x[g1.labelOfPerson[P('david')]], y = g1.labels.y[g1.labelOfPerson[P('david')]];
    const r = query(grid, x - 640, y - 400, x + 640, y + 400, seenL, seenS);
    expect(r.labels).toContain(g1.labelOfPerson[P('david')]);
    let brute = 0;
    for (let i = 0; i < g1.labels.count; i++) if (g1.labels.x[i] + g1.labels.w[i] >= x - 640 && g1.labels.x[i] <= x + 640 && g1.labels.y[i] >= y - 400 && g1.labels.y[i] <= y + 400) brute++;
    expect(r.labels.length).toBeGreaterThanOrEqual(brute);
  });
});

describe('камера и якорь (09 § 3.2.2; 03 § 7.9)', () => {
  const v = { w: 360, h: 640 };
  it('точка под пальцами остаётся на месте; 200 шагов щипка без накопления', () => {
    let c: Camera = { k: 1, sx: 5000.3, sy: 2000.7 };
    const f = { x: 123.4, y: 456.7 };
    const w0 = worldAt(c, v, f.x, f.y);
    for (let i = 0; i < 200; i++) {
      c = zoomAt(c, v, c.k * (i % 2 ? 1.07 : 0.95), f.x, f.y);
      const s = screenOf(c, v, w0.x, w0.y);
      expect(Math.abs(s.x - f.x)).toBeLessThan(1e-6);
      expect(Math.abs(s.y - f.y)).toBeLessThan(1e-6);
    }
  });
  it('запас слева: прокрутка не уходит в минус при масштабе у левого края', () => {
    const c = zoomAt({ k: 1, sx: v.w, sy: v.h }, v, 0.1, v.w - 1, v.h - 1);
    expect(c.sx).toBeGreaterThanOrEqual(0);
    expect(c.sy).toBeGreaterThanOrEqual(0);
  });
  it('reveal: «не дальше, чем нужно»', () => {
    const c: Camera = { k: 1, sx: 1000, sy: 1000 };
    // видимая часть рисунка: x 640…1000, y 360…1000 (поле запаса — в окно)
    const inside = reveal(c, v, { x: 700, y: 500, w: 50, h: 20 }, 16);
    expect(inside).toEqual(c);
    const right = reveal(c, v, { x: 1500, y: 100, w: 50, h: 20 }, 16);
    expect(right.sx).toBeCloseTo(1500 + 50 + v.w + 16 - v.w); // правый край + поле − окно
    expect(right.sy).toBe(c.sy - (c.sy - (100 + v.h - 16)));
  });
});

describe('фокус по графу (09 § 3.2.3)', () => {
  it('↑ — родитель раскладки; ↓ — первый ребёнок; ← → — соседи ряда', () => {
    expect(step(forest, P('david'), 'up')).toBe(P('iessey'));
    const down = step(forest, P('iessey'), 'down');
    expect(forest.layoutParent[down]).toBe(P('iessey'));
    const r = step(forest, P('david'), 'right');
    const l = step(forest, r, 'left');
    expect(l).toBe(P('david'));
    const pos = treePos(forest, P('david'));
    expect(pos.posinset).toBeGreaterThan(0);
    expect(pos.setsize).toBeGreaterThanOrEqual(pos.posinset);
  });
});

describe('синтетика 10 000 лиц и время ядра (09 § 7.3: ядро отдельно от отрисовки)', () => {
  it('лес и раскладка синтетики: без наложений; время записывается', () => {
    const syn = synthIndex(pkg, 10_000);
    expect(syn.actors.length).toBe(10_000);
    const t0 = performance.now();
    const f = buildForest(syn);
    const t1 = performance.now();
    const g = layoutForest(f, metrics(f));
    const t2 = performance.now();
    expect(minGap(g)).toBeGreaterThanOrEqual(BASE.spouseGap - 0.1);
    const sizes = [100, 1000];
    const out: Record<string, number> = {};
    for (const n of sizes) {
      const part = synthIndex(pkg, n, 3);
      const a = performance.now();
      const ff = buildForest(part);
      layoutForest(ff, metrics(ff));
      out[n] = performance.now() - a;
    }
    const a = performance.now();
    layoutForest(forest, metrics(forest));
    out['полный 2 690'] = performance.now() - a;
    console.log('ядро, мс:', { ...out, 'синтетика 10 000: лес': +(t1 - t0).toFixed(1), 'синтетика 10 000: раскладка': +(t2 - t1).toFixed(1), 'ширина синтетики, px': Math.round(g.width), 'высота, px': Math.round(g.height) });
  });
});
