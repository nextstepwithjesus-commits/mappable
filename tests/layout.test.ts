/**
 * Компоновка и камера (этап 3: C1, C2, D2, D3, D15). Без браузера: сетка экрана — чистая функция, камера и небо —
 * на настоящих данных с холстом-заглушкой. Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gridFor, cardWidth, panelKind, panelWidth, PHONE_MAX, SPINE_W } from '../src/ui/layout.ts';
import { Camera, KX_MAX } from '../src/render/camera.ts';
import type { Panel } from '../src/state.ts';

const WIDTHS = [721, 768, 800, 900, 1000, 1024, 1100, 1199, 1200, 1280, 1359, 1360, 1440, 1600, 1920, 2560];
const PANELS: Panel[] = ['epochs', 'index', 'kinship', 'synopsis', 'legend', 'about', 'section', 'chapter'];

describe('сетка [панель][небо][карточка] (C1; решение 7)', () => {
  it('колонки в сумме дают ширину окна; небо не уже 40 % ни в одном сочетании «панель + карточка»', () => {
    for (const W of WIDTHS)
      for (const p of [null, ...PANELS] as Panel[])
        for (const card of [false, true]) {
          const g = gridFor(W, panelKind(p), card);
          expect(g.sheet + g.sky + g.folio, `${W} ${p} ${card}`).toBe(W);
          expect(g.sky, `${W} ${p} ${card}: небо ${g.sky}`).toBeGreaterThanOrEqual(W * 0.4);
        }
  });
  it('небо не уже 480 px, если это возможно: карточка сворачивается в корешок раньше, чем небо сжимается до 40 %', () => {
    for (const W of [1024, 1280, 1440, 1600, 1920])
      for (const p of PANELS) {
        const g = gridFor(W, panelKind(p), true);
        expect(g.sky, `${W} ${p}`).toBeGreaterThanOrEqual(Math.min(480, W - SPINE_W - (panelKind(p) === 'wide' ? 560 : 360)));
      }
  });
  it('широкие панели (синопсис, указатель) — не шире 60 % окна; обычные — 360…520 px', () => {
    for (const W of WIDTHS) {
      for (const p of ['synopsis', 'index'] as Panel[]) expect(gridFor(W, panelKind(p), false).sheet).toBeLessThanOrEqual(W * 0.6);
      const g = gridFor(W, 'regular', true);
      expect(g.sheet).toBeGreaterThanOrEqual(Math.min(360, W - g.folio - W * 0.4));
      expect(g.sheet).toBeLessThanOrEqual(520);
    }
  });
  it('U6 на 1024: карточка, затем «Указатель», затем «Синопсис» — небо не уже 40 %, карточка — корешок 56 px', () => {
    const card = gridFor(1024, 'none', true);
    expect(card).toMatchObject({ folio: 400, spine: false, sky: 624 });
    const idx = gridFor(1024, panelKind('index'), true);
    expect(idx.spine).toBe(true);
    expect(idx.folio).toBe(SPINE_W);
    expect(idx.sky).toBeGreaterThanOrEqual(410);
    const syn = gridFor(1024, panelKind('synopsis'), true);
    expect(syn.sky).toBeGreaterThanOrEqual(410);
    expect(syn.sheet).toBeLessThanOrEqual(1024 * 0.6);
  });
  it('на 1440 обычная панель помещается рядом с карточкой целиком; широкая сворачивает карточку', () => {
    expect(gridFor(1440, 'regular', true)).toMatchObject({ spine: false, folio: 500 });
    expect(gridFor(1440, 'wide', true)).toMatchObject({ spine: true, folio: SPINE_W });
  });
  it('телефон (≤ 720): панель и карточка — листы поверх, не колонки', () => {
    expect(gridFor(PHONE_MAX, 'wide', true)).toMatchObject({ phone: true, sheet: 0, folio: 0 });
    expect(gridFor(390, 'regular', true)).toMatchObject({ phone: true, sky: 390 });
  });
  it('«Разворот» и лист «Вид» — не колонки сетки', () => {
    expect(panelKind('spread')).toBe('none');
    expect(panelKind('view')).toBe('none');
    expect(panelKind(null)).toBe('none');
  });
});

describe('ширина карточки по экрану (C2; решение 14)', () => {
  it('500 при ≥ 1360, 460 — 1200–1359, 400 — 1024–1199', () => {
    expect([1920, 1360, 1359, 1200, 1199, 1024, 1023].map(cardWidth)).toEqual([500, 500, 460, 460, 400, 400, 380]);
  });
  it('tokens.css задаёт те же ширины (--folio-w) при тех же порогах', () => {
    const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const base = /:root\s*\{[^}]*--folio-w:\s*(\d+)px/.exec(css);
    expect(Number(base?.[1])).toBe(cardWidth(1920));
    const media = [...css.matchAll(/@media \(max-width: (\d+)px\)\s*\{\s*:root\s*\{\s*--folio-w:\s*(\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(media.length).toBe(3);
    for (const [max, w] of media) {
      expect(cardWidth(max), `до ${max}`).toBe(w);
      expect(cardWidth(max + 1), `после ${max}`).not.toBe(w);
    }
  });
  it('обычная панель — по VIS-19: 400, 440, 520', () => {
    expect([1024, 1280, 1600].map((W) => panelWidth(W, false))).toEqual([400, 440, 520]);
    expect(panelWidth(1440, true)).toBe(820);
    expect(panelWidth(1024, true)).toBe(614);
  });
});

describe('камера: «всё небо», пределы, упор (D2)', () => {
  const frame = { x0: 0, x1: 100_000, lane0: -256.5, lane1: 232.5 };
  const fit = { ...frame, x1: 92_000 };
  const cam = () => {
    const c = new Camera();
    c.w = 1440;
    c.h = 776;
    c.laneSpan = 488;
    c.setViewport({ l: 18, t: 44, r: 1440, b: 776 }, frame, fit);
    c.kxMaxAt = () => 1422 / 800; // 20 лет ≈ 800 мировых единиц
    return c;
  };
  it('«всё небо» вписывает обе оси: все полосы и вся ширина рамки в видимой части', () => {
    const c = cam();
    c.set(c.fitView(fit));
    const vp = c.vp;
    expect(c.sx(fit.x0)).toBeGreaterThanOrEqual(vp.l);
    expect(c.sx(fit.x1)).toBeLessThanOrEqual(vp.r + 0.5);
    expect(c.sy(fit.lane1)).toBeGreaterThanOrEqual(vp.t - 0.5);
    expect(c.sy(fit.lane0)).toBeLessThanOrEqual(vp.b + 0.5);
    // и почти заполняет её по обеим осям
    expect(c.sx(fit.x1) - c.sx(fit.x0)).toBeGreaterThan((vp.r - vp.l) * 0.95);
    expect(c.sy(fit.lane0) - c.sy(fit.lane1)).toBeGreaterThan((vp.b - vp.t) * 0.95);
  });
  it('высота полосы растёт с приближением монотонно и за два удвоения догоняет обычную', () => {
    const c = cam();
    const k0 = c.fitK!.kx;
    let prev = 0;
    for (let f = 1; f <= 64; f *= 1.1) {
      const ky = c.kyFor(k0 * f);
      expect(ky).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = ky;
    }
    expect(c.kyFor(k0)).toBeCloseTo(c.fitK!.ky, 6);
    const plain = new Camera();
    plain.h = 776;
    plain.laneSpan = 488;
    expect(c.kyFor(k0 * 8)).toBeCloseTo(plain.kyFor(k0 * 8), 6);
  });
  it('отдаление — не дальше «всего неба»; приближение — не больше ~20 лет на ширину', () => {
    const c = cam();
    c.set(c.fitView(fit));
    for (let i = 0; i < 20; i++) c.zoomAt(700, 400, 0.5);
    expect(c.kx).toBeCloseTo(c.fitK!.kx, 9);
    for (let i = 0; i < 40; i++) c.zoomAt(700, 400, 2);
    expect(c.kx).toBeLessThanOrEqual(1422 / 800 + 1e-9);
    expect(c.kx).toBeLessThan(KX_MAX);
  });
  it('сдвиг за край данных — упругий: не дальше 80 px за предел, затем возврат в пределы', async () => {
    const c = cam();
    c.set(c.fitView(fit));
    c.zoomAt(720, 400, 8);
    const b = c.bounds(c.kx)!;
    c.x0 = b.x[0];
    for (let i = 0; i < 50; i++) c.pan(200, 0); // тянуть вправо — к началу времён
    const over = (b.x[0] - c.x0) * c.kx;
    expect(over).toBeGreaterThan(0);
    expect(over).toBeLessThan(80);
    c.settle(true);
    expect(c.x0).toBeCloseTo(b.x[0], 6);
  });
  it('на «всём небе» за край данных не уйти дальше 16 px; в окне всегда остаётся не меньше четверти данных', () => {
    const c = cam();
    for (const [dx, dy] of [[-300, -300], [300, 300]]) {
      c.set(c.fitView(fit));
      for (let i = 0; i < 30; i++) c.pan(dx, dy);
      c.settle(true);
      expect(c.wx(c.vp.l)).toBeGreaterThanOrEqual(frame.x0 - 16 / c.kx - 1e-6);
      expect(c.wx(c.vp.r)).toBeLessThanOrEqual(frame.x1 + 16 / c.kx + 1e-6);
      expect(c.wLane(c.vp.t)).toBeLessThanOrEqual(frame.lane1 + 16 / c.ky + 10);
      expect(c.wLane(c.vp.b)).toBeGreaterThanOrEqual(frame.lane0 - 16 / c.ky - 10);
    }
    c.zoomAt(720, 400, 16);
    for (let i = 0; i < 60; i++) c.pan(-400, 0);
    c.settle(true);
    const vw = (c.vp.r - c.vp.l) / c.kx;
    const left = c.wx(c.vp.l);
    expect(frame.x1 - left).toBeGreaterThanOrEqual(0.25 * vw - 1e-6);
  });
  it('перелёт при prefers-reduced-motion — сразу в цель; прежняя форма flyTo(x, lane, w) ставит точку в середину видимой части', () => {
    const c = cam();
    c.set(c.fitView(fit));
    const to = c.constrain({ x0: 40_000, kx: 0.2, laneTop: 50 });
    let frames = 0;
    c.flyTo(to, () => frames++, true);
    expect(c.state()).toEqual(to);
    expect(frames).toBe(1);
    c.flyTo(50_000, 0, 2000, () => {}, true);
    const [cx, cy] = c.vpCenter();
    expect(c.wx(cx)).toBeCloseTo(50_000, 6);
    expect(c.wLane(cy)).toBeCloseTo(0, 6);
  });
  it('смена видимой части (панель, ярусы) держит середину по вертикали', () => {
    const c = cam();
    c.set(c.fitView(fit));
    c.zoomAt(720, 400, 3);
    const [, cy] = c.vpCenter();
    const mid = c.wLane(cy);
    c.setViewport({ l: 18, t: 200, r: 1000, b: 776 }, frame, fit);
    const [, cy2] = c.vpCenter();
    // середина прежней видимой части по-прежнему в середине новой по высоте полосы (с точностью до смены ky)
    expect(Math.abs(c.wLane(cy2) - mid)).toBeLessThan(40);
  });
});

describe('небо на настоящих данных: «Всё небо» показывает Адама, Иисуса Христа и все полосы (D2; U7)', () => {
  let Sky: typeof import('../src/render/sky.ts').Sky;
  let models: typeof import('../src/data/atlas.ts').models;
  beforeAll(async () => {
    // холст-заглушка: небо мерит подписи и читает палитру, но в этих проверках ничего не рисует
    const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 7 }) } as Record<string, unknown>, {
      get: (o, k) => (k in o ? o[k as string] : () => {}),
      set: () => true,
    });
    Object.assign(globalThis, {
      document: { documentElement: {} },
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
    });
    ({ Sky } = await import('../src/render/sky.ts'));
    ({ models } = await import('../src/data/atlas.ts'));
    (globalThis as Record<string, unknown>).__ctx = ctx;
  });
  const make = (w: number, h: number, ins: { top?: number; bottom?: number; left?: number; right?: number } = {}) => {
    const canvas = { getContext: () => (globalThis as Record<string, unknown>).__ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const sky = new Sky(canvas);
    sky.resize(w, h, 1);
    sky.setModel(models[0], 1);
    sky.setInsets(ins);
    sky.fitAll();
    return sky;
  };
  for (const [w, h, ins] of [
    [1440, 776, {}],
    [1024, 644, {}],
    [390, 684, { right: 52 }],
    [390, 684, { right: 52, bottom: 400 }],
    [1440, 776, { top: 250 }],
  ] as const) {
    it(`${w} × ${h} ${JSON.stringify(ins)}`, () => {
      const sky = make(w, h, ins);
      const vp = sky.viewport();
      const m = models[0];
      const inVp = (id: string) => {
        const n = sky.node(id)!;
        const x = sky.cam.sx(sky.nodeX(id)!);
        const y = sky.cam.sy(n.lane);
        return x >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b;
      };
      expect(inVp('adam')).toBe(true);
      expect(inVp('iisus')).toBe(true);
      expect(sky.cam.sy(m.laneMax)).toBeGreaterThanOrEqual(vp.t - 0.5);
      expect(sky.cam.sy(m.laneMin)).toBeLessThanOrEqual(vp.b + 0.5);
      expect(sky.atFit()).toBe(true);
      // отдаление дальше «всего неба» невозможно
      sky.cam.zoomAt(w / 2, h / 2, 0.25);
      expect(sky.atFit()).toBe(true);
    });
  }
  it('приближение — не больше ~20 лет на ширину видимой части (в любом месте шкалы)', () => {
    const sky = make(1440, 776);
    for (const t of [-4000, -2000, -1000, -500, 0]) {
      sky.cam.x0 = sky.xOf(t) - 700 / sky.cam.kx;
      for (let i = 0; i < 30; i++) sky.cam.zoomAt(700, 400, 2);
      const vp = sky.viewport();
      const years = sky.tOf(sky.cam.wx(vp.r)) - sky.tOf(sky.cam.wx(vp.l));
      expect(years, `у ${t}`).toBeGreaterThan(14);
      expect(years, `у ${t}`).toBeLessThan(30);
      sky.fitAll();
    }
  });
  /** Холст, который записывает надписи: текст, место, кегль по строке font. */
  const recording = () => {
    const texts: { t: string; x: number; y: number; base: string }[] = [];
    let base = 'alphabetic';
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_o, k) => {
        if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
        if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y, base });
        return () => ({ addColorStop: () => {} });
      },
      set: (_o, k, v) => {
        if (k === 'textBaseline') base = v as string;
        return true;
      },
    });
    return { ctx, texts };
  };
  const drawWith = (w: number, h: number, id: string | null, reserve: { x: number; y: number; w: number; h: number }[], move?: (sky: InstanceType<typeof Sky>) => void) => {
    const rec = recording();
    const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const sky = new Sky(canvas);
    sky.resize(w, h, 1);
    sky.setModel(models[0], 1);
    sky.fitAll();
    move?.(sky);
    sky.draw({
      model: models[0], lambda: 1, selected: id, second: null, hovered: null, focus: null, highlight: null,
      layers: { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true },
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve,
    });
    return { sky, texts: rec.texts };
  };
  const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it('рамка (C4): годы, «видно…», масштаб, «завершение канона» — только в верхнем поле; подписи линейки не левее кромки', async () => {
    const { FRAME_H } = await import('../src/render/sky.ts');
    for (const [w, move] of [[1440, (s: InstanceType<typeof Sky>) => s.cam.zoomAt(700, 400, 6)], [1440, undefined], [390, undefined]] as const) {
      const { sky, texts } = drawWith(w, 700, null, [], move);
      const service = texts.filter((q) => /^видно |см\b|≈|завершение канона|^сегодня$|до\u00a0Р\.|по\u00a0Р\./.test(q.t));
      expect(service.length).toBeGreaterThan(0);
      for (const q of service) expect(q.y, q.t).toBeLessThan(FRAME_H);
      const ruler = texts.filter((q) => q.base === 'middle' && q.y < 26);
      for (const q of ruler) expect(q.x, q.t).toBeGreaterThanOrEqual(sky.letterW + 4);
      // «После завершения канона…» — не на данных: правее 100 г. по Р. Х.
      for (const q of texts.filter((z) => /После завершения канона/.test(z.t))) expect(q.x).toBeGreaterThan(sky.cam.sx(sky.xOf(100)));
    }
  });
  it('резерв органов неба (C6): подписи звёзд и указатель у края под блоком не рисуются', () => {
    const zoom = (s: InstanceType<typeof Sky>) => s.cam.zoomAt(900, 400, 4);
    const { texts: before } = drawWith(1440, 700, null, [], zoom);
    const labels = (t: typeof before) => t.filter((q) => q.base === 'alphabetic' && !/^[↑↓←→]/.test(q.t) && q.y > 60);
    // блок — там, где без резерва стоят подписи: проверка имеет смысл
    const at = labels(before).find((q) => q.x > 700 && q.y > 300)!;
    expect(at).toBeTruthy();
    const block = { x: at.x - 40, y: at.y - 40, w: 430, h: 110 };
    const under = (texts: typeof before) => labels(texts).filter((q) => cross({ x: q.x, y: q.y - 14, w: q.t.length * 7, h: 17 }, block));
    expect(under(before).length).toBeGreaterThan(0);
    const { texts } = drawWith(1440, 700, null, [block], zoom);
    expect(under(texts)).toEqual([]);
    // указатель на выбранного за правым краем, на высоте блока, уходит из-под блока
    const { sky, texts: t2 } = drawWith(1440, 700, 'david', [block], (s) => {
      s.cam.zoomAt(700, 350, 8);
      const n = s.node('david')!;
      s.cam.x0 = s.nodeX('david')! - 1700 / s.cam.kx;
      s.cam.laneTop = n.lane + 610 / s.cam.ky;
    });
    const arrows = t2.filter((q) => /^[↑↓←→]/.test(q.t));
    expect(arrows.length).toBe(1);
    expect(sky.edgeHits.length).toBe(1);
    expect(cross(sky.edgeHits[0], block)).toBe(false);
  });
  it('масштаб времени (D15): смена λ при том же x0 сдвигает лицо, привязка возвращает его на место', () => {
    const sky = make(1440, 776);
    sky.cam.zoomAt(700, 400, 6);
    const id = 'avraam';
    sky.cam.x0 = sky.nodeX(id)! - 500 / sky.cam.kx;
    const before = sky.cam.sx(sky.nodeX(id)!);
    sky.setModel(models[0], 0);
    const drift = Math.abs(sky.cam.sx(sky.nodeX(id)!) - before);
    sky.cam.x0 = sky.nodeX(id)! - before / sky.cam.kx; // то, что делает SkyView (holdAnchor)
    expect(drift).toBeGreaterThan(5);
    expect(sky.cam.sx(sky.nodeX(id)!)).toBeCloseTo(before, 6);
  });
});
