/**
 * Небо: ввод и органы (этап 7, K4) без браузера: инерция протяжки, «нажатие только останавливает», пределы отдаления
 * режимов, окно шире данных, вписывание групп сжатием строк, смена модели держит лицо, колонка органов, строки у кромки.
 * Поведение в браузере — сценарии 250–269 (tools/accept/skyin.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Camera, easeOut, type Frame } from '../src/render/camera.ts';
import { inertia, INERTIA_MAX, INERTIA_MS, AXIS_SLOP, edgeAxis } from '../src/ui/sky/input.ts';
import { TIP_DELAY, TIP_MORE } from '../src/ui/sky/tip.ts';

const frame: Frame = { x0: 0, x1: 10_000, lane0: -100, lane1: 100 };
function cam() {
  const c = new Camera();
  c.w = 1440;
  c.h = 800;
  c.laneSpan = 200;
  c.setViewport({ l: 18, t: 44, r: 1440, b: 784 }, frame, frame);
  c.set(c.fitView(frame));
  return c;
}

describe('инерция протяжки (решение 37; IX-05)', () => {
  const drag = (v: number, ms = 100) => Array.from({ length: 11 }, (_, i) => ({ t: 1000 + (i * ms) / 10, x: 100 + v * ((i * ms) / 10), y: 300 }));
  it('бросок 2 px/мс — ещё ≈ 217 px за 325 мс: путь easeOut — скорость × T / 3', () => {
    const g = inertia(drag(2), 1100);
    expect(INERTIA_MS).toBe(325);
    expect(g.dx).toBeCloseTo((2 * INERTIA_MS) / 3, 3);
    expect(g.dy).toBe(0);
    // кривая замедления начинается втрое быстрее средней скорости — с той скорости, с какой отпустили
    expect((easeOut(0.001) - easeOut(0)) / 0.001).toBeCloseTo(3, 1);
  });
  it('медленное отпускание и остановка руки перед отпусканием — без инерции', () => {
    expect(inertia(drag(0.1), 1100)).toEqual({ dx: 0, dy: 0 });
    expect(inertia(drag(2), 1100 + 120)).toEqual({ dx: 0, dy: 0 });
    expect(inertia(drag(2).slice(0, 1), 1100)).toEqual({ dx: 0, dy: 0 });
  });
  it(`не дальше ${INERTIA_MAX} px`, () => {
    const g = inertia(drag(20), 1100);
    expect(Math.hypot(g.dx, g.dy)).toBeCloseTo(INERTIA_MAX, 3);
  });
  it('камера скользит в пределах; при ослабленном движении — нет', () => {
    const c = cam();
    c.zoomAt(720, 400, 8);
    const x0 = c.x0;
    expect(c.glide(200, 0, INERTIA_MS, () => {}, true)).toBe(false);
    expect(c.x0).toBe(x0);
    expect(c.moving).toBe(false);
  });
});

describe('нажатие во время перелёта только останавливает (IX-54)', () => {
  it('перелёт и инерция — «долгие» движения (flying), шаг масштаба и возврат от упора — нет', () => {
    const g = globalThis as unknown as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
    const raf = g.requestAnimationFrame;
    const caf = g.cancelAnimationFrame;
    g.requestAnimationFrame = () => 1;
    g.cancelAnimationFrame = () => {};
    try {
      const c = cam();
      c.zoomStep(720, 400, 2, 250, () => {});
      expect(c.moving).toBe(true);
      expect(c.flying).toBe(false);
      c.flyTo(c.constrain({ x0: 4000, kx: c.kx * 4, laneTop: 20 }), () => {});
      expect(c.flying).toBe(true);
      c.stop();
      expect(c.flying).toBe(false);
      c.zoomAt(720, 400, 8);
      expect(c.glide(-300, 0, INERTIA_MS, () => {})).toBe(true);
      expect(c.flying).toBe(true);
      c.stop();
    } finally {
      g.requestAnimationFrame = raf;
      g.cancelAnimationFrame = caf;
    }
  });
});

describe('пределы отдаления режимов (IX-64, MAP-59) и окно шире данных', () => {
  it('zoomFloor — предел отдаления вместо «всего неба»', () => {
    const c = cam();
    const all = c.kxLo();
    c.zoomFloor = all * 3;
    expect(c.kxLo()).toBe(all * 3);
    expect(c.clampKx(all, 5000)).toBe(all * 3);
    expect(c.canStretch('time', -1)).toBe(true);
    c.set(c.constrain({ x0: c.x0, kx: all * 3, laneTop: c.laneTop }));
    expect(c.canStretch('time', -1)).toBe(false);
    c.zoomFloor = null;
    expect(c.kxLo()).toBe(all);
  });
  it('окно шире данных: данные — где угодно внутри окна с полями не меньше 16 px (Адам — в 24 px от края, MAP-59)', () => {
    const c = cam();
    c.zoomFloor = c.kxLo() * 0.8;
    const kx = c.kxLo();
    const want = { x0: frame.x0 - (c.vp.l + 24) / kx, kx, laneTop: c.laneTop };
    const got = c.constrain(want);
    expect((frame.x0 - got.x0) * got.kx).toBeCloseTo(c.vp.l + 24, 6);
    // за край — не дальше: данные остаются в окне с полем 16 px
    const far = c.constrain({ x0: frame.x0 - (c.vp.l + 400) / kx, kx, laneTop: c.laneTop });
    expect((frame.x1 - far.x0) * kx).toBeLessThanOrEqual(c.vp.r - 16 + 1e-6);
  });
});

describe('протяжка по осям (UX-53, MOB-57)', () => {
  it('ось тянется за 8 px, линейка и буквы — зоны кромок', () => {
    expect(AXIS_SLOP).toBe(8);
    expect(edgeAxis(8, 300, 18, 700)).toBe('lanes');
    expect(edgeAxis(300, 10, 18, 700)).toBe('time');
  });
});

describe('подсказка звезды (IX-58)', () => {
  it('две строки через 120 мс, место и клавиши — через 700 мс', () => {
    expect(TIP_DELAY).toBe(120);
    expect(TIP_MORE).toBe(700);
  });
});

// ---------- на данных атласа ----------

let sky: typeof import('../src/render/sky.ts');
let atlas: typeof import('../src/data/atlas.ts');
let view: typeof import('../src/ui/sky/view.ts');
let common: typeof import('../src/ui/common.tsx');
let state: typeof import('../src/state.ts');
let overlays: typeof import('../src/ui/sky/Overlays.tsx');
let controls: typeof import('../src/ui/sky/Controls.tsx');
let tip: typeof import('../src/ui/sky/Tip.tsx');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  atlas = await import('../src/data/atlas.ts');
  view = await import('../src/ui/sky/view.ts');
  common = await import('../src/ui/common.tsx');
  state = await import('../src/state.ts');
  overlays = await import('../src/ui/sky/Overlays.tsx');
  controls = await import('../src/ui/sky/Controls.tsx');
  tip = await import('../src/ui/sky/Tip.tsx');
});

type SkyT = InstanceType<typeof import('../src/render/sky.ts').Sky>;
function makeSky(w = 1440, h = 776): SkyT {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => (k === 'measureText' ? (t: string) => ({ width: t.length * 7 }) : () => ({ addColorStop: () => {} })),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s: SkyT = new sky.Sky(canvas);
  s.resize(w, h, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  common.skyRef.current = s;
  return s;
}
const at = (s: SkyT, id: string) => ({ x: s.cam.sx(s.nodeX(id)!), y: s.cam.sy(s.node(id)!.lane) });

describe('смена модели хронологии держит выбранное лицо (IX-48; решение 35)', () => {
  it('при любой смене модели выбранное лицо сдвигается не больше чем на 1 px — по обеим осям', async () => {
    for (const m of atlas.modelInfo) await atlas.loadModel(m.id);
    const s = makeSky();
    expect(atlas.models.length).toBe(atlas.modelInfo.length);
    expect(atlas.models.length).toBeGreaterThan(1);
    for (const id of ['moisey', 'iosif', 'avraam', 'david', 'iov']) {
      if (!s.node(id)) continue;
      for (const from of atlas.models)
        for (const to of atlas.models) {
          if (from === to) continue;
          s.setModel(from, 1);
          const n = s.node(id)!;
          s.cam.set({ x0: s.nodeX(id)! - 340 / 0.09, kx: 0.09, laneTop: s.rowOf(n.lane) + 400 / s.cam.kyFor(0.09) });
          state.selected.value = id;
          const a = view.anchorNow()!;
          expect(a.id).toBe(id);
          s.setModel(to, 1);
          view.holdAnchor(a, true);
          const q = at(s, id);
          expect(Math.abs(q.x - a.sx), `${id}: ${from.id} → ${to.id}, x`).toBeLessThanOrEqual(1);
          expect(Math.abs(q.y - a.sy), `${id}: ${from.id} → ${to.id}, y`).toBeLessThanOrEqual(1);
        }
    }
    state.selected.value = null;
    s.setModel(atlas.models[0], 1);
  });
});

describe('вписывание групп сжатием строк (IX-53)', () => {
  const marys = () => [...atlas.byId.values()].filter((p) => p.name === 'Мария').map((p) => p.id);
  it('одноимённые Марии: окно — годы группы, не уже 60 лет, а не тысячелетия; строки ниже, все Марии на экране', () => {
    const s = makeSky();
    const ids = marys().filter((id) => s.node(id));
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const g = view.viewForIds(ids)!;
    s.cam.lanes = g.lanes;
    s.cam.set(s.cam.constrain(g, g.lanes));
    const vp = s.cam.vp;
    const years = s.tOf(s.cam.wx(vp.r)) - s.tOf(s.cam.wx(vp.l));
    expect(years).toBeGreaterThanOrEqual(60);
    expect(years).toBeLessThan(400);
    for (const id of ids) {
      const q = at(s, id);
      expect(q.x, id).toBeGreaterThan(vp.l);
      expect(q.x, id).toBeLessThan(vp.r);
      expect(q.y, id).toBeGreaterThan(vp.t);
      expect(q.y, id).toBeLessThan(vp.b);
    }
    s.cam.lanes = 1;
  });
  it('маленькая группа, которая и так помещается, пропорцию строк не трогает', () => {
    const s = makeSky();
    s.cam.lanes = 1;
    const g = view.viewForIds(['david', 'iessey'])!;
    expect(g.lanes).toBe(1);
  });
});

describe('органы неба колонкой (IX-56, VIS-51, MOB-26, MOB-46)', () => {
  it('колонка: небо уже 760 px, сетка телефона, низкое окно; блок — на широком небе', () => {
    expect(controls.COLUMN_BELOW).toBe(760);
    expect(controls.useColumn(624, false, 768)).toBe(true);
    expect(controls.useColumn(759, false, 900)).toBe(true);
    expect(controls.useColumn(900, false, 900)).toBe(false);
    expect(controls.useColumn(700, true, 900)).toBe(true);
    expect(controls.useColumn(844, false, 390)).toBe(true);
    expect(controls.useColumn(0, false, 900)).toBe(false);
  });
});

describe('строки у кромки неба (VIS-46, UX-62, MOB-54, UX-53, CARD-71)', () => {
  it('режим «набор»: сколько лиц на небе; вне набора — имя в начале строки; пустой — как собрать', () => {
    expect(overlays.workLineText(12, null)).toBe('На небе — только рабочий набор, 12 лиц');
    expect(overlays.workLineText(1, null)).toBe('На небе — только рабочий набор, 1 лицо');
    expect(overlays.workLineText(22, null)).toMatch(/22 лица \(ссылкой передаётся только режим\)$/);
    expect(overlays.workLineText(3, 'Вооз')).toBe('Вооз не в наборе');
    expect(overlays.workLineText(0, null)).toMatch(/^Рабочий набор пуст/);
  });
  it('группа главы: «Отмечены лица главы Мф 1» — без двойного «снять»', () => {
    expect(overlays.groupBarText({ kind: 'chapter', label: 'Лица главы Мф 1' })).toBe('Отмечены лица главы Мф 1');
    expect(overlays.groupBarText({ kind: 'segment', label: 'Каинан — только у Луки' })).toBe('Участок линий: Каинан — только у Луки');
  });
  it('пропорция строк: «строки ×3,6», метка — пока пропорция не 1', () => {
    expect(overlays.lanesText(3.56)).toBe('строки ×3,6');
    expect(overlays.lanesText(0.5)).toBe('строки ×0,5');
    expect(overlays.lanesText(13.2)).toBe('строки ×13');
    expect(overlays.lanesChanged(1)).toBe(false);
    expect(overlays.lanesChanged(1.02)).toBe(false);
    expect(overlays.lanesChanged(0.9)).toBe(true);
  });
  it('быстрые входы вступления — с Руфью (UX-56, решение 37)', () => {
    expect(overlays.ENTRIES).toEqual(['adam', 'noy', 'avraam', 'moisey', 'ruf', 'david', 'iisus']);
    for (const id of overlays.ENTRIES) expect(atlas.byId.has(id), id).toBe(true);
  });
});

describe('выбор второго лица «Родства»: предпросмотр пути (IX-22)', () => {
  it('Давид выбран, указатель над Иоавом: «Иоав — племянник Давида», путь от Давида к Иоаву', () => {
    state.selected.value = 'david';
    state.pickMode.value = 'kinship';
    const p = tip.kinPreview('ioav');
    expect(p).not.toBeNull();
    expect(p!.sentence).toMatch(/^Иоав — племянник Давида/);
    expect(p!.path[0]).toBe('david');
    expect(p!.path[p!.path.length - 1]).toBe('ioav');
    expect(tip.kinPreview('david')).toBeNull();
    state.pickMode.value = null;
    expect(tip.kinPreview('ioav')).toBeNull();
    state.selected.value = null;
  });
});
