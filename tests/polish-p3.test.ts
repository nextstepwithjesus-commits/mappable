/**
 * Доводка неба «набор» после решения 76 (задача P3, polish): «Всё небо» вписывает раскрытое, точка союза между супругами
 * ближе к детям и в стороне от других точек, меньший зазор между родами при союзах, помета порядка — не на линиях к
 * детям, справка — о точке союза, а не о картуше. Небо «все лица» — без перемен.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToString } from 'preact-render-to-string';
import { h } from 'preact';

/** Холст, который ничего не рисует; ширина текста — 6 px на знак. */
function recording() {
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      return (...args: unknown[]) => {
        if (k === 'fillText') texts.push(args[0] as string);
        return { addColorStop: () => {} };
      };
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

let sky: typeof import('../src/render/sky.ts');
let plates: typeof import('../src/render/plates.ts');
let rows: typeof import('../src/render/rows.ts');
let atlas: typeof import('../src/data/atlas.ts');
let reveal: typeof import('../src/ui/reveal.ts');
let marks: typeof import('../src/render/marks.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
type PlateIn = import('../src/render/plates.ts').PlateIn;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  plates = await import('../src/render/plates.ts');
  rows = await import('../src/render/rows.ts');
  atlas = await import('../src/data/atlas.ts');
  reveal = await import('../src/ui/reveal.ts');
  marks = await import('../src/render/marks.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const U = (id: string) => reveal.unions.byId.get(id)!;
const M = () => atlas.models[0];
const open = (uid: string, from: string): PlateIn => ({ union: U(uid), from, dir: 'down', open: true });

const ADAM_KIDS = ['adam', 'eva', 'kain', 'avel', 'sif'];
const JACOB = ['iakov', 'liya', 'ruvim', 'simeon', 'leviy', 'iuda', 'issakhar', 'zavulon', 'dina', 'rakhil', 'iosif', 'veniamin', 'valla', 'dan', 'neffalim', 'zelfa', 'gad', 'asir'];
const JACOB_UNIONS = ['u:iakov+liya', 'u:iakov+rakhil', 'u:iakov+valla', 'u:iakov+zelfa'];

/** Кадр неба 1440 × 776: режим, набор, союзы; fit — «Всё небо», иначе окно years лет вокруг лица at; выбранное лицо. */
function frame(o: { mode?: 'work' | 'all'; ids: string[]; plates?: readonly PlateIn[] | null; fit?: boolean; at?: string; years?: number; selected?: string; w?: number }) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, 776, 1);
  const m = M();
  s.setModel(m, 1);
  s.fitAll();
  s.setView({ mode: o.mode ?? 'work', set: new Set(o.ids), foldDesc: [], foldGroups: [], plates: o.plates ?? [] });
  s.fitAll();
  if (!o.fit && o.at) {
    const x = s.nodeX(o.at)!;
    const t = s.tOf(x);
    const vp = s.cam.vp;
    const years = o.years ?? 300;
    const kx = (vp.r - vp.l) / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
    s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(s.node(o.at)!.lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
  }
  const hl = o.selected ? marks.familyHighlight(o.selected) : null;
  const state = {
    model: m, lambda: 1, selected: o.selected ?? null, second: null, hovered: null, focus: null, highlight: hl?.hl ?? null, depth: hl?.depth ?? null,
    layers: LAYERS, onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(),
    reserve: [], plates: o.plates ?? null, plateMarks: {}, reveal: null,
  } as Parameters<Sky['draw']>[0];
  s.draw(state);
  s.draw(state);
  return { s, data: (canvas as unknown as { dataset: Record<string, string> }).dataset };
}
/** Звезда лица на холсте. */
const star = (s: Sky, id: string) => {
  const i = s.indexOf(id)!;
  return { x: s.cam.sx(s.X0[i]), y: s.cam.sy(s.nodes[i].lane), end: s.cam.sx(s.X1[i]) };
};
/** Точки союзов кадра: «союз:раскрыт:x,y:скрыто» (canvas[data-dots]). */
const dots = (d: Record<string, string>) =>
  new Map(
    (d.dots ?? '')
      .split(';')
      .filter(Boolean)
      .map((q) => {
        const m = /^(u:.*):([01]):(-?\d+),(-?\d+):(\d+)$/.exec(q)!;
        return [m[1], { x: +m[3], y: +m[4] }] as const;
      }),
  );

describe('«Всё небо» в небе «набор» вписывает раскрытое (задача P3, п. 3)', () => {
  it('семья Адама: звёзды, точка и дети — на всю ширину неба, а не у левого края; долгий след Адама уходит за правый край', () => {
    const { s, data } = frame({ ids: ADAM_KIDS, plates: [open('u:adam+eva', 'adam')], fit: true });
    const vp = s.cam.vp;
    const W = vp.r - vp.l;
    for (const id of ADAM_KIDS) {
      const q = star(s, id);
      expect(q.x, id).toBeGreaterThanOrEqual(vp.l);
      expect(q.x, id).toBeLessThanOrEqual(vp.r);
      expect(q.y, id).toBeGreaterThanOrEqual(vp.t);
      expect(q.y, id).toBeLessThanOrEqual(vp.b);
    }
    // от звезды Адама до звезды Сифа (130 лет) — больше половины ширины неба; прежде след в 930 лет сжимал семью в пятую часть
    expect(star(s, 'sif').x - star(s, 'adam').x).toBeGreaterThan(0.5 * W);
    expect(star(s, 'adam').end).toBeGreaterThan(vp.r);
    // точка союза — в видимой части
    const q = dots(data).get('u:adam+eva')!;
    expect(q.x).toBeGreaterThan(vp.l);
    expect(q.x).toBeLessThan(vp.r);
    expect(s.atFit()).toBe(true);
  });
  it('короткие следы, которые удлиняют окно не больше чем на FIT_TRAIL, входят в окно целиком', () => {
    // Иисус Христос и Его родители: следы Иосифа и Марии коротки — окно доходит до их конца
    const ids = ['iisus', 'iosif-muzh-marii', 'mariya'];
    const { s } = frame({ ids, plates: [open('u:iosif-muzh-marii+mariya', 'iisus')], fit: true });
    const vp = s.cam.vp;
    for (const id of ids) {
      const q = star(s, id);
      expect(q.x, id).toBeGreaterThanOrEqual(vp.l);
      expect(q.x, id).toBeLessThanOrEqual(vp.r);
    }
    expect(sky.FIT_TRAIL).toBeGreaterThan(0);
    expect(sky.FIT_TRAIL).toBeLessThan(1);
  });
  it('предел отдаления — по набору со всеми следами (fitWideState): отдалить можно до целого следа Адама', () => {
    const { s } = frame({ ids: ADAM_KIDS, plates: [open('u:adam+eva', 'adam')], fit: true });
    const tight = s.fitState();
    const wide = s.fitWideState();
    expect(wide.kx).toBeLessThan(tight.kx);
    // в окне «со следами» конец следа Адама — не правее видимой части
    s.cam.set(wide);
    expect(star(s, 'adam').end).toBeLessThanOrEqual(s.cam.vp.r + 1);
  });
  it('небо «все лица»: «Всё небо» — прежнее, одно и то же для обоих вписываний', () => {
    const { s } = frame({ mode: 'all', ids: ADAM_KIDS, plates: [open('u:adam+eva', 'adam')], fit: true });
    expect(s.fitWideState()).toEqual(s.fitState());
    expect(s.atFit()).toBe(true);
  });
});

describe('точка союза между супругами — ближе к детям (задача P3, п. 2)', () => {
  it('betweenBand: полоса между строками супругов с отступами; строки ближе двух отступов — середина', () => {
    const [a, b] = plates.betweenBand(100, 300, 26);
    expect(a).toBeCloseTo(100 + Math.max(plates.DOT_FIELD + 6, 26 * plates.DOT_BAND));
    expect(b).toBeCloseTo(300 - Math.max(plates.DOT_FIELD + 6, 26 * plates.DOT_BAND));
    expect(plates.betweenBand(300, 100, 26)).toEqual([a, b]);
    expect(plates.betweenBand(100, 120, 26)).toEqual([110, 110]);
  });
  it('betweenY: медиана строк детей в пределах полосы; детей нет — середина', () => {
    expect(plates.betweenY([120, 280], [])).toBe(200);
    // Адам и Ева: сыновья между ними — точка у их середины
    expect(plates.betweenY([120, 280], [150, 190, 230])).toBe(190);
    // Иаков и Лия: сыновья выше строки Иакова — точка у строки Иакова, не посередине
    expect(plates.betweenY([120, 280], [-200, -100, 10, 40, 60])).toBe(120);
    expect(plates.betweenY([120, 280], [400, 500])).toBe(280);
    // чётное число детей — середина двух средних
    expect(plates.betweenY([0, 1000], [100, 200, 300, 400])).toBe(250);
  });
  it('Иаков и четыре жены: каждая точка — между строками своих супругов, у Лии — ближе к строке Иакова (её сыновья выше); точки не теснятся', () => {
    const pls = JACOB_UNIONS.map((u) => open(u, 'iakov'));
    const { s, data } = frame({ ids: JACOB, plates: pls, at: 'iakov', years: 200 });
    const ds = dots(data);
    const j = star(s, 'iakov');
    for (const uid of JACOB_UNIONS) {
      const q = ds.get(uid);
      expect(q, uid).toBeTruthy();
      const w = star(s, uid.split('+')[1]);
      expect(q!.y, uid).toBeGreaterThan(Math.min(j.y, w.y));
      expect(q!.y, uid).toBeLessThan(Math.max(j.y, w.y));
    }
    const leah = ds.get('u:iakov+liya')!;
    const l = star(s, 'liya');
    expect(Math.abs(leah.y - j.y)).toBeLessThan(Math.abs(l.y - j.y) / 2);
    // точки разных союзов — не вплотную: пучки линий начинаются из разных мест
    const all = [...ds.entries()].filter(([u]) => JACOB_UNIONS.includes(u)).map(([, q]) => q);
    for (let a = 0; a < all.length; a++)
      for (let b = a + 1; b < all.length; b++) expect(Math.hypot(all[a].x - all[b].x, all[a].y - all[b].y)).toBeGreaterThanOrEqual(16);
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('crowdCost: штраф только ближе DOT_APART, тем больше, чем ближе', () => {
    expect(plates.crowdCost(0, 0, [{ x: plates.DOT_APART + 1, y: 0 }])).toBe(0);
    expect(plates.crowdCost(0, 0, [{ x: 10, y: 0 }])).toBeGreaterThan(plates.crowdCost(0, 0, [{ x: 20, y: 0 }]));
  });
});

describe('строки неба «набор» с союзами — зазор между родами меньше (задача P3, п. 2)', () => {
  it('REVEAL_GAP меньше ROW_GAP; семья Иакова с точками союзов ниже, чем тот же набор без них', () => {
    expect(rows.REVEAL_GAP).toBeLessThan(rows.ROW_GAP);
    expect(rows.REVEAL_GAP).toBeGreaterThan(0);
    const pls = JACOB_UNIONS.map((u) => open(u, 'iakov'));
    const a = frame({ ids: JACOB, plates: pls, at: 'iakov', years: 200 }).s;
    const b = frame({ ids: JACOB, plates: [], at: 'iakov', years: 200 }).s;
    const span = (s: Sky) => {
      const rs = JACOB.map((id) => s.rowOf(s.node(id)!.lane));
      return Math.max(...rs) - Math.min(...rs);
    };
    expect(span(a)).toBeLessThan(span(b) - 1.5);
    // порядок строк прежний
    const order = (s: Sky) => [...JACOB].sort((p, q) => s.rowOf(s.node(p)!.lane) - s.rowOf(s.node(q)!.lane)).join();
    expect(order(a)).toBe(order(b));
  });
});

/** Пересекает ли отрезок (x0, y0)–(x1, y1) прямоугольник r (с полем pad). */
function crosses(r: { x: number; y: number; w: number; h: number }, x0: number, y0: number, x1: number, y1: number, pad = 0) {
  const n = 64;
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    const y = y0 + ((y1 - y0) * k) / n;
    if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true;
  }
  return false;
}

describe('помета «годы — по порядку …» в небе «набор» — не на линиях к детям (задача P3, п. 1)', () => {
  it('Адам выбран: при любом окне и ширине неба помета не ложится на линии от точки союза к сыновьям и на саму точку; места нет — пометы нет', () => {
    let shown = 0;
    const where: string[] = [];
    for (const w of [940, 1100, 1440])
      for (const years of [200, 300, 400, 500, 700, 900]) {
        const { s, data } = frame({ ids: ADAM_KIDS, plates: [open('u:adam+eva', 'adam')], selected: 'adam', at: 'adam', years, w });
        expect(s.labelStats().overlaps, `${w}/${years}`).toBe(0);
        const note = s.ledger.boxes.find((b) => b.kind === 'note' && b.text.startsWith('годы — по порядку'));
        if (!note) continue;
        shown++;
        const d = dots(data).get('u:adam+eva')!;
        for (const k of ['kain', 'avel', 'sif']) {
          const q = star(s, k);
          if (crosses(note, d.x, d.y, q.x, q.y)) where.push(`${w}/${years}: на линии к ${k}`);
        }
        if (crosses(note, d.x - 6, d.y, d.x + 6, d.y, 2)) where.push(`${w}/${years}: на точке`);
      }
    expect(where).toEqual([]);
    // помета не пропала: она встаёт под подписью нижнего сына или над подписью верхнего
    expect(shown).toBeGreaterThanOrEqual(12);
  });
  it('«Всё небо» семьи Адама: помета на месте и не на линиях', () => {
    const { s, data } = frame({ ids: ADAM_KIDS, plates: [open('u:adam+eva', 'adam')], selected: 'adam', fit: true });
    const note = s.ledger.boxes.find((b) => b.kind === 'note' && b.text.startsWith('годы — по порядку'));
    expect(note).toBeTruthy();
    const d = dots(data).get('u:adam+eva')!;
    for (const k of ['kain', 'avel', 'sif']) expect(crosses(note!, d.x, d.y, star(s, k).x, star(s, k).y), k).toBe(false);
  });
});

const flat = (x: string) => x.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
const src = (f: string) => flat(readFileSync(join(__dirname, '..', f), 'utf8'));

describe('справка о точке союза (задача P3, пп. 6, 7)', () => {
  it('«Как читать карту» в «Условных знаках» — о ромбе союза и линиях цвета ветви, как на образце drawUnionSample', async () => {
    const { ReadingGuide } = await import('../src/ui/sky/Overlays.tsx');
    const t = flat(renderToString(h(ReadingGuide, { both: true })));
    expect(t).toContain('В небе «набор» союз — малый ромб между строками мужа и жены');
    expect(t).toContain('своя линия цвета его ветви');
    expect(t).toContain('Залитый ромб — союз раскрыт, полый с числом — свёрнут');
    expect(t).not.toMatch(/картуш/);
  });
  it('«Условные знаки»: точка — ближе к строкам детей, скобки от супругов, прямые линии к детям; «Информация» и «Подробнее»', () => {
    const t = src('src/ui/panels/Legend.tsx');
    expect(t).toContain('малый ромб между строками мужа и жены, ближе к строкам детей');
    expect(t).toContain('к нему сходятся плавные линии от мужа и жены, от него к каждому ребёнку идёт прямая линия цвета его ветви');
    expect(t).toContain('«Информация» — подробная карточка справа');
    expect(t).toContain('«Подробнее» — карточка союза справа');
    expect(t).not.toMatch(/щелчок по картушу|на картуше/);
  });
  it('слово «картуш» о союзе на небе больше не встречается в интерфейсе неба и «Клавишах»', () => {
    for (const f of ['src/ui/top/Keys.tsx', 'src/ui/sky/Controls.tsx', 'src/ui/panels/Work.tsx', 'src/ui/sky/view.ts', 'src/ui/sky/DotCard.tsx'])
      expect(src(f), f).not.toMatch(/картуш/);
    // меню звезды: показать точки союзов снова — «Продолжить ветвь» в карточке у звезды
    expect(src('src/ui/panels/Work.tsx')).toContain('Показать снова — «Продолжить ветвь» в карточке у звезды');
  });
});
