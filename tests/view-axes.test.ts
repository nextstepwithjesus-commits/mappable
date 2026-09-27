/**
 * Масштаб по двум осям (J1) и размер областей (J2) без браузера: камера с пропорцией полос, ось щипка и кромок,
 * адрес с пропорцией, сетка с ширинами читателя и «Небо во весь экран».
 * Поведение в браузере — сценарии 190–199 в tools/accept/work.ts (блок view).
 */
import { describe, it, expect } from 'vitest';
import { Camera, KY_HI, KY_LO, LANES_MAX } from '../src/render/camera.ts';
import { edgeAxis, pinchAxis, PINCH_AXIS_DEG } from '../src/ui/sky/input.ts';
import { formatAddress, parseAddress } from '../src/ui/address.ts';
import {
  FOLIO_MAX, FOLIO_MIN, FOLIO_SHORT, SHEET_MIN, SPINE_W, cardWidth, folioDefault, folioRange, gridFor, panelKind, readWidths, sheetRange, splitRange,
  type Widths,
} from '../src/ui/layout.ts';
import type { Panel } from '../src/state.ts';
import { FRAME_H, RULER_H } from '../src/render/frame.ts';

const frame = { x0: 0, x1: 100_000, lane0: -256.5, lane1: 232.5 };
const fit = { ...frame, x1: 92_000 };
const cam = () => {
  const c = new Camera();
  c.w = 1440;
  c.h = 776;
  c.laneSpan = 488;
  c.setViewport({ l: 18, t: 44, r: 1440, b: 776 }, frame, fit);
  c.kxMaxAt = () => 1422 / 800;
  c.set(c.fitView(fit));
  return c;
};
/** Камера на масштабе семьи: полоса 20–26 px. */
const family = () => {
  const c = cam();
  c.zoomAt(720, 400, 40);
  return c;
};

describe('пропорция полос (J1): камера', () => {
  it('по умолчанию высота полосы прежняя: пропорция 1 ничего не меняет', () => {
    const c = cam();
    for (let f = 1; f < 200; f *= 1.7) expect(c.kyFor(c.kx * f)).toBe(c.kyAuto(c.kx * f));
  });
  it('«полосы»: высота полосы растёт в заданное число раз, масштаб времени и полоса под точкой — на месте', () => {
    const c = family();
    const kx = c.kx;
    const ky = c.ky;
    const lane = c.wLane(300);
    const t = c.wx(500);
    c.stretchAt('lanes', 500, 300, 1.5);
    expect(c.kx).toBe(kx);
    expect(c.ky).toBeCloseTo(Math.min(KY_HI, ky * 1.5), 6);
    expect(c.sy(lane)).toBeCloseTo(300, 6);
    expect(c.wx(500)).toBeCloseTo(t, 6);
  });
  it('«время»: масштаб времени растёт, высота полосы остаётся; год под точкой — на месте', () => {
    const c = family();
    c.zoomAt(720, 400, 0.25);
    const ky = c.ky;
    const kx = c.kx;
    const x = c.wx(600);
    c.stretchAt('time', 600, 400, 2);
    expect(c.kx).toBeCloseTo(kx * 2, 9);
    expect(c.ky).toBeCloseTo(ky, 6);
    expect(c.sx(x)).toBeCloseTo(600, 6);
    c.stretchAt('time', 600, 400, 1 / 4);
    expect(c.ky).toBeCloseTo(ky, 6);
  });
  it('обычный масштаб держит пропорцию: полоса растёт с масштабом, но в заданное число раз выше', () => {
    const c = family();
    c.zoomAt(720, 400, 1 / 8);
    c.stretchAt('lanes', 720, 400, 1.5);
    const m = c.ky / c.kyAuto(c.kx);
    c.zoomAt(720, 400, 2);
    expect(c.ky / c.kyAuto(c.kx)).toBeCloseTo(m, 6);
  });
  it('пределы полосы — от 4 до 60 px; на обзоре (обычная полоса ниже 4 px) сузить нельзя', () => {
    const c = family();
    for (let i = 0; i < 30; i++) c.stretchAt('lanes', 720, 400, 1.5);
    expect(c.ky).toBeCloseTo(KY_HI, 6);
    expect(c.canStretch('lanes', 1)).toBe(false);
    expect(c.canStretch('lanes', -1)).toBe(true);
    for (let i = 0; i < 60; i++) c.stretchAt('lanes', 720, 400, 1 / 1.5);
    expect(c.ky).toBeCloseTo(KY_LO, 6);
    expect(c.canStretch('lanes', -1)).toBe(false);
    const o = cam();
    expect(o.kyAuto(o.kx)).toBeLessThan(KY_LO);
    expect(o.canStretch('lanes', -1)).toBe(false);
    const ky = o.ky;
    o.stretchAt('lanes', 720, 400, 1 / 2);
    expect(o.ky).toBeCloseTo(ky, 9);
    o.stretchAt('lanes', 720, 400, 3);
    expect(o.ky).toBeCloseTo(ky * 3, 6);
  });
  it('шаг от края: пропорция из адреса за пределами не «съедает» первый шаг', () => {
    const c = family();
    c.setLanes(LANES_MAX);
    expect(c.ky).toBeCloseTo(KY_HI, 6);
    c.stretchAt('lanes', 720, 400, 1 / 1.5);
    expect(c.ky).toBeCloseTo(KY_HI / 1.5, 6);
  });
  it('время: не мельче «всего неба» и не крупнее ~20 лет на ширину', () => {
    const c = cam();
    expect(c.canStretch('time', -1)).toBe(false);
    for (let i = 0; i < 40; i++) c.stretchAt('time', 720, 400, 2);
    expect(c.kx).toBeLessThanOrEqual(1422 / 800 + 1e-9);
    expect(c.canStretch('time', 1)).toBe(false);
  });
  it('пропорции по умолчанию: высота полосы снова обычная, время прежнее', () => {
    const c = family();
    c.stretchAt('lanes', 720, 400, 1.5);
    c.stretchAt('time', 720, 400, 0.5);
    const kx = c.kx;
    c.resetLanes(720, 400, 250, () => {}, true);
    expect(c.kx).toBe(kx);
    expect(c.ky).toBeCloseTo(c.kyAuto(kx), 6);
  });
  it('шаг с анимацией при prefers-reduced-motion — сразу в цель', () => {
    const c = family();
    const ky = c.ky;
    let frames = 0;
    expect(c.stretchStep('lanes', 720, 400, 1.5, 250, () => frames++, true)).toBe(true);
    expect(frames).toBe(1);
    expect(c.ky).toBeCloseTo(Math.min(KY_HI, ky * 1.5), 6);
  });
  it('«всё небо» учитывает пропорцию: всё время в видимой части, полоса — в заданное число раз выше «всего неба»', () => {
    const c = cam();
    const base = c.ky;
    c.stretchAt('lanes', 720, 400, 3);
    c.set(c.fitView(fit));
    expect(c.sx(fit.x0)).toBeGreaterThanOrEqual(c.vp.l);
    expect(c.sx(fit.x1)).toBeLessThanOrEqual(c.vp.r + 0.5);
    expect(c.ky).toBeCloseTo(base * 3, 6);
    // по умолчанию — снова все полосы
    c.setLanes(1);
    c.set(c.fitView(fit));
    expect(c.sy(fit.lane1)).toBeGreaterThanOrEqual(c.vp.t - 0.5);
    expect(c.sy(fit.lane0)).toBeLessThanOrEqual(c.vp.b + 0.5);
  });
  it('пределы сдвига по вертикали следуют за высотой полосы: высокие полосы можно пройти до края', () => {
    const c = cam();
    c.stretchAt('lanes', 720, 400, 6);
    const b = c.bounds(c.kx)!;
    expect(b.lane[1] - b.lane[0]).toBeGreaterThan(100);
  });
});

describe('ось щипка и кромки неба (J1)', () => {
  it(`по горизонтали (ближе ${PINCH_AXIS_DEG}° к оси) — время, по вертикали — полосы, наискосок — обе`, () => {
    expect(pinchAxis(200, 10)).toBe('time');
    expect(pinchAxis(-200, 30)).toBe('time');
    expect(pinchAxis(10, -200)).toBe('lanes');
    expect(pinchAxis(100, 100)).toBe(null);
    const at = (deg: number) => pinchAxis(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
    expect(at(29)).toBe('time');
    expect(at(31)).toBe(null);
    expect(at(59)).toBe(null);
    expect(at(61)).toBe('lanes');
  });
  it('линейка лет — время, буквы полос — полосы, угол и небо — ничего', () => {
    expect(edgeAxis(300, RULER_H - 4, 18, 700)).toBe('time');
    expect(edgeAxis(8, 300, 18, 700)).toBe('lanes');
    expect(edgeAxis(8, 10, 18, 700)).toBe(null);
    expect(edgeAxis(300, FRAME_H + 20, 18, 700)).toBe(null);
    expect(edgeAxis(8, 720, 18, 700)).toBe(null);
  });
});

describe('адрес хранит пропорцию полос (J1; D8)', () => {
  const has = () => true;
  it('h — множитель высоты полосы; по умолчанию поля нет', () => {
    const view = { year: -1010, width: 240, lane: 2.5 };
    expect(formatAddress({ id: 'david', view, lanes: 1.5 })).toBe('#/david~y-1010~w240~l2.5~h1.5');
    expect(formatAddress({ id: 'david', view, lanes: 1 })).toBe('#/david~y-1010~w240~l2.5');
    expect(formatAddress({ id: 'david', view, lanes: 0.6667 })).toBe('#/david~y-1010~w240~l2.5~h0.67');
    expect(parseAddress('#/david~y-1010~w240~l2.5~h1.5', has).lanes).toBe(1.5);
    expect(parseAddress('#/david~y-1010~w240~l2.5', has).lanes).toBeUndefined();
  });
  it('испорченное и крайнее — пропускается или ставится в пределы; знаки — только простые', () => {
    expect(parseAddress('#/david~hx', has).lanes).toBeUndefined();
    expect(parseAddress('#/david~h-2', has).lanes).toBeUndefined();
    expect(parseAddress('#/david~h0', has).lanes).toBeUndefined();
    expect(parseAddress('#/david~h9999', has).lanes).toBe(LANES_MAX);
    const a = formatAddress({ id: 'david', view: { year: 30, width: 50, lane: 0 }, lanes: 13.333 });
    expect(a).toMatch(/^#\/[a-z0-9._~-]+$/);
    expect(parseAddress(a, has).lanes).toBe(13.33);
  });
});

const WIDTHS = [721, 768, 900, 1024, 1100, 1280, 1440, 1600, 1920, 2560];
const PANELS: Panel[] = ['epochs', 'index', 'kinship', 'synopsis', 'legend', 'section'];
const USER: Widths[] = [{}, { folio: 640 }, { folio: 360 }, { regular: 900, wide: 1400, folio: 640 }, { regular: 320, wide: 320 }, { regular: 100, folio: 9000 }];

describe('размер областей (J2): сетка с ширинами читателя', () => {
  it('колонки в сумме — ширина окна; небо не уже 40 % и, где помещается, не уже 480 px при любых ширинах читателя', () => {
    for (const W of WIDTHS)
      for (const p of [null, ...PANELS] as Panel[])
        for (const card of [false, true])
          for (const widths of USER) {
            const g = gridFor(W, panelKind(p), card, { widths, h: 900 });
            const tag = `${W} ${p} ${card} ${JSON.stringify(widths)}`;
            expect(g.sheet + g.sky + g.folio, tag).toBe(W);
            expect(g.sky, tag).toBeGreaterThanOrEqual(W * 0.4);
            // ширина читателя не сужает небо меньше, чем ширины по умолчанию
            const def = gridFor(W, panelKind(p), card, { h: 900 });
            expect(g.sky, tag).toBeGreaterThanOrEqual(Math.min(def.sky, Math.max(480, Math.ceil(W * 0.4))));
          }
  });
  it('карточка — от 360 до 640 px, панель — от 320 px до 60 % окна', () => {
    for (const W of [1280, 1440, 1920, 2560]) {
      expect(gridFor(W, 'none', true, { widths: { folio: 9000 } }).folio).toBeLessThanOrEqual(FOLIO_MAX);
      expect(gridFor(W, 'none', true, { widths: { folio: 10 } }).folio).toBeGreaterThanOrEqual(FOLIO_MIN);
      expect(gridFor(W, 'regular', false, { widths: { regular: 10 } }).sheet).toBe(SHEET_MIN);
      expect(gridFor(W, 'regular', false, { widths: { regular: 9000 } }).sheet).toBeLessThanOrEqual(Math.floor(W * 0.6));
      expect(gridFor(W, 'wide', false, { widths: { wide: 9000 } }).sheet).toBeLessThanOrEqual(Math.floor(W * 0.6));
    }
    expect(gridFor(1920, 'none', true, { widths: { folio: 600 } })).toMatchObject({ folio: 600, sky: 1320 });
    expect(gridFor(1440, 'regular', false, { widths: { regular: 700 } })).toMatchObject({ sheet: 700, sky: 740 });
  });
  it('широкая карточка читателя уступает панели до своей ширины по умолчанию, а не сворачивается в корешок', () => {
    const g = gridFor(1440, 'regular', true, { widths: { folio: 640 } });
    expect(g.spine).toBe(false);
    expect(g.folio).toBeLessThan(640);
    expect(g.folio).toBeGreaterThanOrEqual(cardWidth(1440));
    expect(g.sky).toBeGreaterThanOrEqual(576);
  });
  it('пределы ручки: нынешняя ширина в пределах; сосед не сдвигается и не сворачивается, небу — не меньше max(480, 40 %)', () => {
    for (const W of WIDTHS)
      for (const p of [null, ...PANELS] as Panel[])
        for (const widths of USER) {
          const g = gridFor(W, panelKind(p), true, { widths });
          if (g.phone) continue;
          for (const side of ['sheet', 'folio'] as const) {
            const now = side === 'folio' ? g.folio : g.sheet;
            if (!now || (side === 'folio' && g.spine)) continue;
            const [lo, hi] = splitRange(W, panelKind(p), side, g);
            expect(now, `${W} ${p} ${side} ${JSON.stringify(widths)}`).toBeGreaterThanOrEqual(lo);
            expect(now, `${W} ${p} ${side} ${JSON.stringify(widths)}`).toBeLessThanOrEqual(hi);
          }
        }
    for (const W of [1024, 1280, 1440, 1920]) {
      const g = gridFor(W, 'regular', true);
      if (g.spine) continue;
      const [, fHi] = splitRange(W, 'regular', 'folio', g);
      const wide = gridFor(W, 'regular', true, { widths: { folio: fHi } });
      expect(wide.spine, `${W}`).toBe(false);
      expect(wide.folio, `${W}`).toBe(fHi);
      expect(wide.sky, `${W}`).toBeGreaterThanOrEqual(Math.max(480, Math.ceil(W * 0.4)));
      const [, pHi] = splitRange(W, 'regular', 'sheet', g);
      const big = gridFor(W, 'regular', true, { widths: { regular: pHi } });
      expect(big.spine, `${W}`).toBe(false);
      expect(big.sky, `${W}`).toBeGreaterThanOrEqual(Math.max(480, Math.ceil(W * 0.4)));
    }
    expect(folioRange(1440)).toEqual([FOLIO_MIN, FOLIO_MAX]);
    expect(sheetRange(1440, false)).toEqual([SHEET_MIN, 864]);
  });
  it('«Небо во весь экран»: панель и карточка — корешки 56 px; сворачивать нечего — сетка прежняя', () => {
    expect(gridFor(1440, 'regular', true, { full: true })).toMatchObject({ sheet: SPINE_W, folio: SPINE_W, spine: true, sheetSpine: true, sky: 1440 - 2 * SPINE_W });
    expect(gridFor(1440, 'none', true, { full: true })).toMatchObject({ sheet: 0, folio: SPINE_W, spine: true, sky: 1440 - SPINE_W });
    expect(gridFor(1440, 'wide', false, { full: true })).toMatchObject({ sheet: SPINE_W, folio: 0, sheetSpine: true });
    expect(gridFor(1440, 'none', false, { full: true })).toMatchObject({ sheet: 0, folio: 0, sky: 1440 });
    expect(gridFor(390, 'regular', true, { full: true }).phone).toBe(true);
  });
  it('низкий экран (≤ 520 px, H6): карточка 340 px — как в phone.css', async () => {
    expect(folioDefault(1024, 480)).toBe(FOLIO_SHORT);
    expect(folioDefault(1024, 768)).toBe(400);
    expect(folioDefault(700, 400)).toBe(380);
    expect(gridFor(900, 'none', true, { h: 420 }).folio).toBe(FOLIO_SHORT);
    const css = (await import('node:fs')).readFileSync(new URL('../src/styles/phone.css', import.meta.url), 'utf8');
    expect(css).toMatch(new RegExp(`@media \\(max-height: 520px\\) and \\(min-width: 721px\\)\\s*\\{\\s*:root\\s*\\{\\s*--folio-w:\\s*${FOLIO_SHORT}px`));
  });
  it('ширины из памяти браузера: только числа в разумных пределах', () => {
    expect(readWidths('{"regular":500,"wide":"x","folio":1e9,"other":3}')).toEqual({ regular: 500 });
    expect(readWidths('не JSON')).toEqual({});
    expect(readWidths(null)).toEqual({});
  });
});
