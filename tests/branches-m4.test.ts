/**
 * Подсветка ветвей выбранного лица (решение 69; выбор владельца «по ветвям»):
 *  — палитра (src/render/branches.ts): шесть цветов в каждой теме, первые — зелёный, фиолетовый, коралловый; контраст
 *    к небу ≥ 3 : 1; различимы между собой, с лентами и текстом, в том числе при дейтеранопии и протанопии;
 *  — больше шести ветвей — по кругу, соседние разного цвета, второй круг — оттенок и штрих;
 *  — яркость по поколениям: 1, 0,75, 0,55, дальше до 0,25, но не ниже различимого;
 *  — ветви лица с кэшем (marks.ts, branchMapOf) и кадр (branchFrame): только при выделении рода выбранного;
 *  — на небе (trails.ts): следы и отводы потомков — цветом ветви (штрих отводов остаётся), свечение — одним путём на цвет;
 *    метка ветви — под подписью первого ребёнка.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { contrast, linearRgb } from '../src/ui/contrast.ts';
import { over } from '../src/render/dim.ts';
import {
  BRANCH_COLORS, BRANCH_CONTRAST, BRANCH_DASH, BRANCH_DE, BRANCH_FADE, BRANCH_FAR_CONTRAST, BRANCH_SHADES, branchColor, branchDash, branchFade, branchFloor,
  branchTickAt, drawBranchSample, GlowBatch, glowLayers, type MapTheme,
} from '../src/render/branches.ts';

// ---------- цвета темы из tokens.css ----------

const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, css.indexOf('}', i)).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const TOK: Record<MapTheme, Record<string, string>> = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };

// моделирование цветового зрения (Machado 2009, тяжесть 1.0) и ΔE CIE76 — как в tools/contrast.ts
const CVD: Record<string, number[][] | undefined> = {
  normal: undefined,
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
const lab = (h: string, m?: number[][]) => {
  const l = linearRgb(h);
  const [r, g, b] = m ? m.map((row) => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))) : l;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a: string, b: string, m?: number[][]) => {
  const A = lab(a, m);
  const B = lab(b, m);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe('палитра ветвей (решение 69)', () => {
  it('шесть цветов в каждой теме; первые — зелёный, фиолетовый, коралловый (как назвал владелец)', () => {
    for (const t of ['night', 'day'] as const) {
      const c = BRANCH_COLORS[t].map(rgb);
      expect(c.length).toBe(6);
      // зелёный: G — наибольший; фиолетовый: B > R > G; коралловый: R наибольший, G > B или близко
      expect(c[0][1]).toBeGreaterThan(Math.max(c[0][0], c[0][2]));
      expect(c[1][2]).toBeGreaterThan(c[1][0]);
      expect(c[1][0]).toBeGreaterThan(c[1][1]);
      expect(c[2][0]).toBeGreaterThan(Math.max(c[2][1], c[2][2]));
    }
  });
  for (const t of ['night', 'day'] as const)
    it(`${t}: контраст к небу и полосе эпохи ≥ 3 : 1 у всех цветов обоих кругов; дальнее поколение — не ниже ${BRANCH_FAR_CONTRAST} : 1`, () => {
      const grounds = [TOK[t]['--sky'], TOK[t]['--sky-band']];
      for (const c of [...BRANCH_COLORS[t], ...BRANCH_SHADES[t]]) for (const g of grounds) expect(contrast(c, g), `${c} на ${g}`).toBeGreaterThanOrEqual(BRANCH_CONTRAST);
      for (const c of BRANCH_COLORS[t]) {
        const a = branchFade(20, branchFloor(c, grounds));
        for (const g of grounds) expect(contrast(over(c, g, a), g), `${c} (альфа ${a}) на ${g}`).toBeGreaterThanOrEqual(BRANCH_FAR_CONTRAST);
      }
    });
  for (const t of ['night', 'day'] as const)
    it(`${t}: цвета различимы между собой, с лентами и текстом — при обычном зрении, дейтеранопии и протанопии`, () => {
      const c = BRANCH_COLORS[t];
      const others = ['--gold-1', '--gold-2', '--azure-1', '--azure-2', '--ink'].map((k) => TOK[t][k]);
      for (const [k, m] of Object.entries(CVD)) {
        const min = m ? BRANCH_DE.cvd : BRANCH_DE.normal;
        for (let i = 0; i < c.length; i++) {
          for (let j = i + 1; j < c.length; j++) expect(dE(c[i], c[j], m), `${k}: ${c[i]} и ${c[j]}`).toBeGreaterThanOrEqual(min);
          for (const o of others) expect(dE(c[i], o, m), `${k}: ${c[i]} и ${o}`).toBeGreaterThanOrEqual(min);
        }
      }
    });
  it('больше шести ветвей: по кругу, соседние всегда разного цвета; второй круг — оттенок первого и штрих', () => {
    for (const t of ['night', 'day'] as const) {
      for (let i = 0; i < 30; i++) expect(branchColor(i, t), `${i}`).not.toBe(branchColor(i + 1, t));
      for (let i = 0; i < 6; i++) {
        expect(branchColor(i, t)).toBe(BRANCH_COLORS[t][i]);
        expect(branchColor(i + 6, t)).toBe(BRANCH_SHADES[t][i]);
        expect(branchColor(i + 6, t)).not.toBe(branchColor(i, t));
        expect(branchDash(i)).toEqual([]);
        expect(branchDash(i + 6)).toEqual(BRANCH_DASH);
      }
      // у Давида восемь союзов: восемь разных цветов
      expect(new Set(Array.from({ length: 8 }, (_, i) => branchColor(i, t))).size).toBe(8);
    }
  });
  it('яркость по поколениям: 1, 0,75, 0,55, дальше убывает до 0,25 и не ниже различимого', () => {
    expect([1, 2, 3].map((g) => branchFade(g))).toEqual([1, 0.75, 0.55]);
    for (let g = 1; g < 10; g++) expect(branchFade(g + 1)).toBeLessThanOrEqual(branchFade(g));
    expect(branchFade(12)).toBe(0.25);
    expect(branchFade(12, 0.4)).toBe(0.4);
    expect(BRANCH_FADE[BRANCH_FADE.length - 1]).toBe(0.25);
  });
});

describe('свечение (GlowBatch): один путь на цвет и силу, ночью — lighter', () => {
  type Call = [string, ...unknown[]];
  const rec = () => {
    const calls: Call[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_o, k) => (...a: unknown[]) => void calls.push([String(k), ...a]),
      set: (_o, k, v) => (calls.push([`=${String(k)}`, v]), true),
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  it('тысяча отрезков двух цветов — два пути на слой; ночью — два слоя в режиме lighter, днём — один тон', () => {
    for (const night of [true, false]) {
      const r = rec();
      const g = new GlowBatch(glowLayers('branch', night ? 'night' : 'day'));
      for (let k = 0; k < 1000; k++) g.add(k % 2 ? '#48fd8b' : '#9a75c8', 1, k, 0, k, 10);
      expect(g.size).toBe(2);
      g.flush(r.ctx, night);
      const strokes = r.calls.filter((c) => c[0] === 'stroke').length;
      expect(strokes).toBe(2 * (night ? 2 : 1));
      expect(r.calls.some((c) => c[0] === '=globalCompositeOperation' && c[1] === 'lighter')).toBe(night);
      expect(g.size).toBe(0);
    }
  });
  it('на обзоре — только узкий слой', () => {
    expect(glowLayers('branch', 'night', true)).toEqual(glowLayers('branch', 'night').slice(-1));
    expect(glowLayers('ancestor', 'day', true).length).toBe(1);
  });
  it('образец для «Условных знаков» рисует три цвета ветвей и свечение', () => {
    const r = rec();
    drawBranchSample(r.ctx, { glow: true, sky: TOK.night['--sky'], band: TOK.night['--sky-band'], ink: TOK.night['--ink'], ink2: TOK.night['--ink-2'] }, 240, 64);
    const styles = r.calls.filter((c) => c[0] === '=strokeStyle').map((c) => String(c[1]));
    for (const c of BRANCH_COLORS.night.slice(0, 3)) {
      const [R, G, B] = rgb(c);
      expect(styles.some((s) => s.startsWith(`rgba(${R},${G},${B},`)), c).toBe(true);
    }
    expect(r.calls.some((c) => c[0] === '=globalCompositeOperation' && c[1] === 'lighter')).toBe(true);
  });
});

// ---------- ветви лица и небо ----------

let sky: typeof import('../src/render/sky.ts');
let trails: typeof import('../src/render/trails.ts');
let marks: typeof import('../src/render/marks.ts');
let atlas: typeof import('../src/data/atlas.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  trails = await import('../src/render/trails.ts');
  marks = await import('../src/render/marks.ts');
  atlas = await import('../src/data/atlas.ts');
});

describe('ветви лица (marks.ts, branchMapOf) — с кэшем', () => {
  it('Авраам: три ветви по союзам — Сарра (Исаак, Иаков), Агарь (Измаил), Хеттура (Зимран); первые дети ветвей', () => {
    const m = marks.branchMapOf('avraam', atlas.models[0].id);
    expect(m.keys).toEqual(['u:avraam+sarra', 'u:avraam+agar', 'u:avraam+khettura']);
    expect(m.desc.get('isaak')).toMatchObject({ branch: 0, gen: 1 });
    expect(m.desc.get('iakov')).toMatchObject({ branch: 0, gen: 2 });
    expect(m.desc.get('izmail')).toMatchObject({ branch: 1, gen: 1 });
    expect(m.desc.get('zimran')?.branch).toBe(2);
    expect(m.heads[0]).toEqual(['isaak']);
    expect(m.heads[2][0]).toBe('zimran');
  });
  it('Ной: союз один — ветви по детям; Давид — восемь ветвей', () => {
    expect(marks.branchMapOf('noy').keys).toEqual(['sim', 'kham', 'iafet']);
    expect(marks.branchMapOf('david').keys.length).toBe(8);
  });
  it('Адам: цвет тянется по всей ветви — Давид (дальше 30 поколений) в ветви Сифа', () => {
    const m = marks.branchMapOf('adam');
    const d = m.desc.get('david');
    expect(d?.branch).toBe(m.keys.indexOf('sif'));
    expect(d!.gen).toBeGreaterThan(30);
  });
  it('кэш: повторный вызов по тому же лицу и модели — тот же объект; другая модель — свой', () => {
    const a = marks.branchMapOf('adam', 'm1');
    expect(marks.branchMapOf('adam', 'm1')).toBe(a);
    expect(marks.branchMapOf('adam', 'm2')).not.toBe(a);
  });
});

describe('кадр ветвей (branchFrame): только при выделении рода выбранного', () => {
  const pal = { glow: true, sky: '#0d1b34', band: '#11223f' } as import('../src/render/sky.ts').Palette;
  const frameOf = (selected: string | null, highlight: Map<string, import('../src/render/sky.ts').Emphasis> | null) =>
    marks.branchFrame({ pal, model: atlas.models[0] }, { s: { selected, highlight } as import('../src/render/sky.ts').SkyState, placer: {} as never });
  it('Авраам: Исаак — зелёный полный, Иаков — 0,75; Фарра — предок (свечение), не ветвь', () => {
    const f = frameOf('avraam', marks.familyHighlight('avraam').hl);
    expect(f.theme).toBe('night');
    expect(f.paint('isaak')).toMatchObject({ color: BRANCH_COLORS.night[0], a: 1, branch: 0, gen: 1 });
    expect(f.paint('iakov')?.a).toBe(0.75);
    expect(f.paint('izmail')?.color).toBe(BRANCH_COLORS.night[1]);
    expect(f.paint('farra')).toBe(null);
    expect(f.ancestor('farra')).toBe(true);
    expect(f.ancestor('isaak')).toBe(false);
  });
  it('путь родства, группа панели, отметки поиска, нет выбранного — цвета ветвей нет', () => {
    for (const f of [
      frameOf('avraam', marks.highlightFor('avraam', ['avraam', 'isaak', 'iakov'])!.hl),
      frameOf('avraam', marks.highlightFor('avraam', null, ['isaak', 'izmail'])!.hl),
      frameOf('avraam', new Map([['avraam', 'self'], ['isaak', 'self']])),
      frameOf(null, null),
    ]) {
      expect(f.paint('isaak')).toBe(null);
      expect(f.paint('izmail')).toBe(null);
    }
  });
});

describe('на небе (trails.ts): следы и отводы потомков — цветом ветви, штрих отводов остаётся', () => {
  type Call = [string, ...unknown[]];
  function recording() {
    const calls: Call[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_o, k) => {
        if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
        if (k === 'canvas') return undefined;
        return (...a: unknown[]) => {
          calls.push([String(k), ...a]);
          return { addColorStop: () => {} };
        };
      },
      set: (_o, k, v) => (calls.push([`=${String(k)}`, v]), true),
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }
  const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
  function makeSky() {
    const rec = recording();
    const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const s = new sky.Sky(canvas);
    s.resize(1440, 776, 1);
    s.setModel(atlas.models[0], 1);
    s.fitAll();
    s.pal = { ...s.pal, glow: true, sky: TOK.night['--sky'], band: TOK.night['--sky-band'], ink: TOK.night['--ink'], ink2: TOK.night['--ink-2'], ink3: TOK.night['--ink-3'], halo: TOK.night['--sky'] };
    return { s, rec };
  }
  const rgba = (hex: string) => {
    const [r, g, b] = rgb(hex);
    return `rgba(${r},${g},${b},`;
  };
  it('Авраам выбран: след Измаила — фиолетовым, отводы к потомкам — цветом ветви и штрихом [4, 3]; свечение — lighter', () => {
    const { s, rec } = makeSky();
    s.cam.zoomAt(720, 400, 40);
    s.cam.x0 = s.nodeX('izmail')! - 600 / s.cam.kx;
    s.cam.laneTop = s.node('izmail')!.lane + 380 / s.cam.ky;
    const h = marks.familyHighlight('avraam');
    const vis: number[] = [];
    for (let i = 0; i < s.nodes.length; i++) vis.push(i);
    const p = {
      s: { layers: LAYERS, highlight: h.hl, depth: h.depth, selected: 'avraam', intro: 1, tensionPersons: new Set() },
      vis, emph: marks.emphasis(h.hl, h.depth), zoomScale: 1, placer: {},
    } as unknown as Parameters<typeof trails.drawTrails>[1];
    rec.calls.length = 0;
    trails.drawTrails(s, p);
    const styles = rec.calls.filter((c) => c[0] === '=strokeStyle').map((c) => String(c[1]));
    expect(styles.some((x) => x === `${rgba(BRANCH_COLORS.night[1])}1)`)).toBe(true);
    expect(rec.calls.some((c) => c[0] === '=globalCompositeOperation' && c[1] === 'lighter')).toBe(true);
    rec.calls.length = 0;
    trails.drawDescents(s, p);
    // отвод к сыну Измаила: цвет ветви во втором поколении (0,75) и штрих потомка
    const idx = rec.calls.findIndex((c) => c[0] === '=strokeStyle' && c[1] === `${rgba(BRANCH_COLORS.night[1])}0.75)`);
    expect(idx).toBeGreaterThan(-1);
    expect(rec.calls.slice(idx).find((c) => c[0] === 'setLineDash')?.[1]).toEqual(trails.LINK_STYLE.desc.dash);
    // ветвь Сарры в кадре тоже есть — зелёная; лица нарисованы цветом
    expect(marks.branchFrame(s, p).shown.has('izmail')).toBe(true);
  });
  it('без выбранного лица — ни цвета ветвей, ни свечения', () => {
    const { s, rec } = makeSky();
    const vis: number[] = [];
    for (let i = 0; i < s.nodes.length; i++) vis.push(i);
    const p = { s: { layers: LAYERS, highlight: null, selected: null, intro: 1, tensionPersons: new Set() }, vis, emph: () => 1, zoomScale: 1, placer: {} } as unknown as Parameters<typeof trails.drawTrails>[1];
    trails.drawTrails(s, p);
    trails.drawDescents(s, p);
    const styles = rec.calls.filter((c) => c[0] === '=strokeStyle').map((c) => String(c[1]));
    for (const c of BRANCH_COLORS.night) expect(styles.some((x) => x.startsWith(rgba(c)))).toBe(false);
    expect(rec.calls.some((c) => c[0] === '=globalCompositeOperation')).toBe(false);
  });
  it('след второго круга (седьмая ветвь и дальше) — штрих на сплошной части', () => {
    const r = recording();
    trails.drawLifeTrail(r.ctx, { x0: 10, x1: 200, y: 50.5, cls: 'exact', known: true, solidTo: 200, color: '#fff', width: 1.5, dash: BRANCH_DASH });
    expect(r.calls.filter((c) => ['setLineDash', 'moveTo', 'lineTo', 'stroke'].includes(c[0]))).toEqual([
      ['setLineDash', BRANCH_DASH], ['moveTo', 10, 50.5], ['lineTo', 200, 50.5], ['stroke'], ['setLineDash', []],
    ]);
  });
  it('метка ветви — под началом подписи первого ребёнка, в её прямоугольнике', () => {
    const box = { x: 100, y: 40, w: 60, h: 15 };
    const t = branchTickAt(box);
    expect(t.x).toBeGreaterThanOrEqual(box.x);
    expect(t.y + t.h).toBeLessThanOrEqual(box.y + box.h);
    expect(t.y).toBeGreaterThan(box.y + box.h / 2);
    expect(t.w).toBeLessThanOrEqual(box.w);
  });
  it('метки у двух ветвей и больше: у Авраама — под подписями Исаака и Измаила', () => {
    const { s, rec } = makeSky();
    const h = marks.familyHighlight('avraam');
    const p = { s: { layers: LAYERS, highlight: h.hl, selected: 'avraam', intro: 1 }, placer: {} } as unknown as Parameters<typeof trails.drawBranchTicks>[1];
    s.ledger.reset();
    s.ledger.add('star', 'Исаак', { x: 100, y: 40, w: 50, h: 15 }, 'isaak');
    s.ledger.add('star', 'Измаил', { x: 300, y: 80, w: 56, h: 15 }, 'izmail');
    rec.calls.length = 0;
    trails.drawBranchTicks(s, p);
    const fills = rec.calls.filter((c) => c[0] === 'fillRect');
    expect(fills).toEqual([
      ['fillRect', ...Object.values(branchTickAt({ x: 100, y: 40, w: 50, h: 15 }))],
      ['fillRect', ...Object.values(branchTickAt({ x: 300, y: 80, w: 56, h: 15 }))],
    ]);
    // у Сифа союз один и ребёнок один — ветвь одна, метки нет
    const one = { s: { layers: LAYERS, highlight: marks.familyHighlight('sif').hl, selected: 'sif', intro: 1 }, placer: {} } as unknown as Parameters<typeof trails.drawBranchTicks>[1];
    s.ledger.reset();
    s.ledger.add('star', 'Енос', { x: 100, y: 40, w: 40, h: 15 }, 'enos');
    rec.calls.length = 0;
    trails.drawBranchTicks(s, one);
    expect(rec.calls.filter((c) => c[0] === 'fillRect')).toEqual([]);
  });
});
