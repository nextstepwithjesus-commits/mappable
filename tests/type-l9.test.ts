/**
 * Кегль холста следует размеру шрифта браузера (решение 57; MOB-42, WCAG 1.4.4): ступень × корневой кегль / 16, не больше
 * ×1,5; сменился коэффициент — небо заново замеряет имена и отбирает подписи, без наложений.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAME_SIZE, T_MAP_S, T_MAP_TOUCH, TEXT_SCALE_MAX, mapSize, nameFont, setTextScale, textScale, textScaleFor, watchTextScale } from '../src/render/type.ts';

const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const night = (() => {
  const i = css.indexOf(":root[data-map='night']");
  const out: Record<string, string> = {};
  for (const m of css.slice(i, css.indexOf('}', i)).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
})();
const sizeOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 14);

describe('коэффициент кегля холста (решение 57)', () => {
  afterAll(() => setTextScale(1));
  it('корневой кегль / 16: 16 px — 1, 20 px — 1,25, 24 px и крупнее — 1,5; мельче 16 и неизвестный — 1', () => {
    expect(textScaleFor(16)).toBe(1);
    expect(textScaleFor(20)).toBe(1.25);
    expect(textScaleFor(24)).toBe(TEXT_SCALE_MAX);
    expect(textScaleFor(32)).toBe(1.5);
    expect(textScaleFor(12)).toBe(1);
    expect(textScaleFor(NaN)).toBe(1);
  });
  it('вне браузера — 1: кегли холста — ступени шкалы', () => {
    expect(textScale()).toBe(1);
    expect(nameFont(0, false)).toContain(' 16px ');
  });
  it('ступень × коэффициент; нижняя граница экрана остаётся', () => {
    setTextScale(1.5);
    expect(mapSize(16, false)).toBe(24);
    expect(mapSize(T_MAP_S, false)).toBeCloseTo(17.25);
    expect(mapSize(T_MAP_S, true)).toBeGreaterThanOrEqual(T_MAP_TOUCH);
    for (let m = 0; m <= 6; m++) expect(sizeOf(nameFont(m, false))).toBeCloseTo(NAME_SIZE[m] * 1.5);
    setTextScale(1);
    expect(mapSize(16, false)).toBe(16);
  });
  it('смена коэффициента — подписчикам; прежний коэффициент — без оповещения; больше ×1,5 не бывает', () => {
    const seen: number[] = [];
    const off = watchTextScale((k) => seen.push(k));
    setTextScale(1.25);
    setTextScale(1.25);
    setTextScale(3);
    setTextScale(1);
    off();
    setTextScale(1.5);
    setTextScale(1);
    expect(seen).toEqual([1.25, 1.5, 1]);
  });
});

// ---------- небо: подписи пересчитываются ----------

let Sky: typeof import('../src/render/sky.ts').Sky;
let models: typeof import('../src/data/atlas.ts').models;
const fonts = new EventTarget();

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} }, fonts },
    getComputedStyle: () => ({ getPropertyValue: (n: string) => night[n] ?? '' }),
  });
  ({ Sky } = await import('../src/render/sky.ts'));
  ({ models } = await import('../src/data/atlas.ts'));
});

type Text = { t: string; x: number; y: number; font: string; base: string };
/** Холст, у которого ширина строки зависит от кегля текущего шрифта: как у настоящего. */
function recording() {
  const texts: Text[] = [];
  const st = { font: '10px serif', base: 'alphabetic' };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * sizeOf(st.font) * 0.5 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y, font: st.font, base: st.base });
      if (k === 'font') return st.font;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'font') st.font = v as string;
      if (k === 'textBaseline') st.base = v as string;
      return true;
    },
  });
  return { ctx, texts };
}
const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const STATE = {
  lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS, onlyLines: false, meridian: null,
  tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
};
/** Подписи звёзд: имена кеглем величин (серифом, по базовой линии), без рамки и сокращений ролей. */
const names = (texts: Text[]) => texts.filter((q) => q.base === 'alphabetic' && /Literata/.test(q.font) && !/italic/.test(q.font) && q.y > 60 && q.t.length > 1);

describe('подписи неба при смене кегля браузера (MOB-42)', () => {
  afterAll(() => setTextScale(1));
  it('имена — ×1,5 после смены коэффициента; отбор подписей пересчитан: подписей не больше, наложений нет', () => {
    const rec = recording();
    const s = new Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement);
    s.resize(1440, 776, 1);
    s.setModel(models[0], 1);
    s.fitAll();
    // масштаб семьи у Давида: подписей много, им тесно
    s.cam.zoomAt(720, 400, 24);
    s.cam.x0 = s.xOf(-1030) - 720 / s.cam.kx;
    const draw = () => {
      rec.texts.length = 0;
      s.draw({ model: models[0], ...STATE } as Parameters<InstanceType<typeof Sky>['draw']>[0]);
      return names(rec.texts).map((q) => ({ ...q }));
    };
    const before = draw();
    expect(before.length).toBeGreaterThan(10);
    setTextScale(1.5);
    const after = draw();
    const big = Math.max(...after.map((q) => sizeOf(q.font)));
    expect(big).toBeCloseTo(Math.max(...before.map((q) => sizeOf(q.font))) * 1.5);
    expect(after.length).toBeLessThanOrEqual(before.length);
    // прямоугольники подписей (ширина — как у холста выше) не пересекаются
    const box = (q: Text) => {
      const z = sizeOf(q.font);
      return { x: q.x, y: q.y - 0.8 * z, w: q.t.length * z * 0.5, h: 1.04 * z };
    };
    const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
    const bad: string[] = [];
    for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) if (hit(box(after[i]), box(after[j]))) bad.push(`${after[i].t} / ${after[j].t}`);
    expect(bad).toEqual([]);
    // вернули обычный кегль — отбор тот же, что вначале
    setTextScale(1);
    expect(draw().map((q) => q.t).sort()).toEqual(before.map((q) => q.t).sort());
  });
});
