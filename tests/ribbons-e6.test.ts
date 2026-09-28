/**
 * Линии Мессии на небе (E6; U2; ТЗ § 3.2, § 11.2 п. 2; MAP-23, 26, 27, 28, 29; UX-16).
 *  — пять точек сравнения выводятся из самих линий: Каинан; Давид — Соломон/Нафан; Салафиил и Зоровавель;
 *    Авиуд/Рисай; Иисус Христос — со стихами Синодального текста;
 *  — ленты: у точек сравнения расходятся и сходятся (п. 2), нить Иосифа при расхождении — сверху;
 *  — коса считает поколения: одно перекрестье на поколение, на длинном — параллельные нити и перекрестье посередине
 *    (MAP-75; решение 40), без «глаз» (MAP-27); одиночная нить без ряби;
 *  — нить без излома на стыке общего и раздельного участков;
 *  — в режиме «только линии» выноски стоят на небе, проходят замер наложений и ловят щелчок.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildRibbons, braidPhase, CROSS_LEN, MEANDER_MAX, runSpans, type Pt, type Strand } from '../src/engine/ribbons.ts';

let ribbons: typeof import('../src/render/ribbons.ts');
let sky: typeof import('../src/render/sky.ts');
let atlas: typeof import('../src/data/atlas.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  ribbons = await import('../src/render/ribbons.ts');
  sky = await import('../src/render/sky.ts');
  atlas = await import('../src/data/atlas.ts');
});

const A = 8;
const build = (j: string[], m: string[], pos: Map<string, Pt>, weak: string[] = []) =>
  buildRibbons({
    joseph: j.map((id) => ({ id, weak: weak.includes(id) })),
    mary: m.map((id) => ({ id, weak: weak.includes(id) })),
    project: (id) => pos.get(id) ?? null,
    amplitude: A,
    meander: A * 0.5,
  });
const byLine = (s: Strand[]) => ({ mary: s.find((x) => x.line === 'mary')!, joseph: s.find((x) => x.line === 'joseph')! });

describe('точки сравнения Мф 1 и Лк 3 (U2)', () => {
  it('пять точек со стихами: Каинан; Соломон и Нафан; Салафиил и Зоровавель; Авиуд и Рисай; Иисус Христос', () => {
    const cps = ribbons.comparePoints(atlas.lines.joseph.persons, atlas.lines.mary.persons);
    expect(cps.map((c) => [c.at, c.kind])).toEqual([
      ['kainan-syn-arfaksada', 'only'],
      ['david', 'split'],
      ['salafiil', 'join'],
      ['zorovavel', 'split'],
      ['iisus', 'join'],
    ]);
    const nb = (s: string) => s.replace(/ /g, ' ');
    expect(nb(cps[0].full)).toBe('Каинан — только у Луки (Лк 3:36)');
    expect(nb(cps[1].full)).toBe('Расходятся: Соломон (Мф 1:6) и Нафан (Лк 3:31)');
    expect(nb(cps[2].full)).toBe('Сходятся: Салафиил и Зоровавель (Мф 1:12; Лк 3:27)');
    expect(nb(cps[3].full)).toBe('Расходятся: Авиуд (Мф 1:13) и Рисай (Лк 3:27)');
    expect(nb(cps[4].full)).toBe('Сходятся: Иисус Христос (Мф 1:16; Лк 3:23)');
    // у развилки Давида — Вирсавия, мать Соломона и Нафана (1 Пар 3:5)
    expect(cps[1].mother?.id).toBe('virsaviya');
    expect(nb(cps[1].mother!.text)).toBe('Вирсавия — мать Соломона и Нафана (1 Пар 3:5)');
    expect(cps[3].mother).toBeUndefined();
  });
  it('каждая точка — место синопсиса (synopsisAt): те же лица, что ждёт панель', () => {
    const cps = ribbons.comparePoints(atlas.lines.joseph.persons, atlas.lines.mary.persons);
    for (const c of cps) expect(['kainan-syn-arfaksada', 'david', 'salafiil', 'zorovavel', 'iisus']).toContain(c.at);
  });
  it('ТЗ § 11.2 п. 2: общий участок до Арфаксада, расхождение на Каинане, общий до Давида, расхождение, схождение у Салафиила и Зоровавеля, расхождение, схождение в Иисусе', () => {
    const j = atlas.lines.joseph.persons.map((s) => s.id);
    const m = atlas.lines.mary.persons.map((s) => s.id);
    const spans = runSpans(j, m).map((r) => (r.kind === 'shared' ? `=${j[r.j[0]]}…${j[r.j[1]]}` : `/${j[r.j[0]]}→${j[r.j[1]]}`));
    expect(spans).toEqual(['=adam…arfaksad', '/arfaksad→sala', '=sala…david', '/david→salafiil', '=salafiil…zorovavel', '/zorovavel→iisus', '=iisus…iisus']);
  });
});

describe('геометрия лент', () => {
  it('коса считает поколения: одно перекрестье на поколение; на длинном — параллельные нити, перекрестье посередине (MAP-75; решение 40)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const pos = new Map<string, Pt>([['a', { x: 0, y: 0 }], ['b', { x: 60, y: 0 }], ['c', { x: 560, y: 0 }], ['d', { x: 620, y: 0 }]]);
    const { mary, joseph } = byLine(build(ids, ids, pos));
    const xs: number[] = [];
    for (let k = 1; k < joseph.points.length; k++) {
      const d0 = joseph.points[k - 1].y - mary.points[k - 1].y;
      const d1 = joseph.points[k].y - mary.points[k].y;
      if (d0 !== 0 && Math.sign(d0) !== Math.sign(d1)) xs.push(joseph.points[k].x);
    }
    // по одному перекрестью на каждое поколение, и на длинном тоже
    for (const [x0, x1] of [[0, 60], [60, 560], [560, 620]]) expect(xs.filter((x) => x > x0 && x < x1).length, `${x0}–${x1}`).toBe(1);
    // на длинном поколении перекрестье — посередине, вне его (CROSS_LEN·A px) нити параллельны на 2A: без «глаза» (MAP-27)
    const mid = xs.find((x) => x > 60 && x < 560)!;
    expect(Math.abs(mid - 310)).toBeLessThan(4);
    let parallel = 0;
    for (let k = 0; k < joseph.points.length; k++) {
      const x = joseph.points[k].x;
      if (x < 80 || x > 540 || Math.abs(x - 310) < (CROSS_LEN * A) / 2 + 2) continue;
      expect(Math.abs(joseph.points[k].y - mary.points[k].y)).toBeCloseTo(2 * A, 1);
      parallel++;
    }
    expect(parallel).toBeGreaterThan(20);
    // в лицах нити по-прежнему по разные стороны
    for (const x of [60, 560]) {
      const kj = joseph.points.findIndex((p) => Math.abs(p.x - x) < 1e-6);
      expect(Math.sign(joseph.points[kj].y)).toBe(-Math.sign(mary.points[kj].y));
    }
  });
  it('плетение поочерёдное: участок «поверх» — только перекрестье, сверху по очереди Мария и Иосиф (MAP-75)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const pos = new Map<string, Pt>(ids.map((id, i) => [id, { x: i * 200, y: 0 }]));
    const { mary, joseph } = byLine(build(ids, ids, pos));
    const spans = [...mary.over.map(([a, b]) => [mary.points[a].x, mary.points[b].x, 'm'] as const), ...joseph.over.map(([a, b]) => [joseph.points[a].x, joseph.points[b].x, 'j'] as const)].sort((p, q) => p[0] - q[0]);
    expect(spans.length).toBe(4);
    spans.forEach(([x0, x1, who], k) => {
      // перекрестье — посередине поколения, длиной CROSS_LEN·A
      expect((x0 + x1) / 2).toBeCloseTo(100 + 200 * k, 0);
      expect(x1 - x0).toBeCloseTo(CROSS_LEN * A, 0);
      if (k) expect(who).not.toBe(spans[k - 1][2]);
    });
  });
  it('фаза косы: у обоих концов участка между расхождениями нить Иосифа сверху (φ ≡ 0), в лицах φ кратна π', () => {
    const { phi, turns } = braidPhase([60, 60, 60], 'both');
    expect(phi[0] % (2 * Math.PI)).toBeCloseTo(0, 9);
    expect(phi[phi.length - 1] % (2 * Math.PI)).toBeCloseTo(0, 9);
    expect(turns.reduce((s, x) => s + x, 0) % 2).toBe(0);
    // одно перекрестье на поколение; при нечётном числе поколений между расхождениями на самом коротком его нет
    // (Салафиил — Зоровавель: одно поколение, нити параллельны), лишнего перекрестья нет нигде
    expect(braidPhase([300, 40, 300], 'both').turns).toEqual([1, 0, 1]);
    expect(braidPhase([500], 'both').turns).toEqual([0]);
    expect(braidPhase([500, 500, 500], 'end').turns).toEqual([1, 1, 1]);
    expect(braidPhase([500, 60], 'both').turns).toEqual([1, 1]);
  });
  it('одиночная нить на плотном участке без ряби: волна не больше 0,25·A и гаснет при шаге меньше 60 px (MAP-26)', () => {
    // у Луки на раздельном участке лица чередуются по двум полосам с шагом 20 px
    const mids = Array.from({ length: 12 }, (_, i) => `m${i}`);
    const pos = new Map<string, Pt>([['s', { x: 0, y: 0 }], ['e', { x: 260, y: 0 }], ['j1', { x: 130, y: -40 }]]);
    mids.forEach((id, i) => pos.set(id, { x: 20 * (i + 1), y: 30 + (i % 2) * 14 }));
    const { mary } = byLine(build(['s', 'j1', 'e'], ['s', ...mids, 'e'], pos));
    // середина участка: нить почти прямая — размах по y меньше половины шага полос
    const mid = mary.points.filter((p) => p.x > 60 && p.x < 200);
    const ys = mid.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(7);
    expect(MEANDER_MAX).toBeLessThanOrEqual(0.25);
  });
  it('нить без излома на стыке общего и раздельного участков: касательная на стыке одна (находка образца)', () => {
    const pos = new Map<string, Pt>([
      ['a', { x: 0, y: 0 }], ['b', { x: 80, y: 0 }], ['c', { x: 160, y: 0 }],
      ['j1', { x: 240, y: -50 }], ['m1', { x: 240, y: 50 }], ['e', { x: 320, y: 0 }], ['f', { x: 400, y: 0 }],
    ]);
    const J = ['a', 'b', 'c', 'j1', 'e', 'f'];
    const M = ['a', 'b', 'c', 'm1', 'e', 'f'];
    // без смещения нити — сама средняя линия: на стыках (c, e) направление не прыгает
    const center = buildRibbons({ joseph: J.map((id) => ({ id, weak: false })), mary: M.map((id) => ({ id, weak: false })), project: (id) => pos.get(id) ?? null, amplitude: 0, meander: 0 });
    for (const st of center)
      for (const u of [2, 4]) {
        const k = st.points.findIndex((p) => Math.abs(p.u - u) < 1e-9);
        const [p0, p1, p2] = [st.points[k - 1], st.points[k], st.points[k + 1]];
        const turn = Math.abs(Math.atan2(p2.y - p1.y, p2.x - p1.x) - Math.atan2(p1.y - p0.y, p1.x - p0.x));
        expect(turn, `${st.line} u=${u}`).toBeLessThan(0.12);
      }
    // общий участок у двух линий — одна средняя линия: нити косы симметричны
    const { joseph, mary } = byLine(build(J, M, pos));
    for (let k = 0; k < joseph.points.length && joseph.points[k].u <= 2; k++) expect(joseph.points[k].y + mary.points[k].y).toBeCloseTo(0, 6);
  });
  it('участок ленты между лицами группы и слайс нити сохраняют цвет и плетение', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const pos = new Map<string, Pt>(ids.map((id, i) => [id, { x: i * 60, y: 0 }]));
    const { joseph } = byLine(build(ids, ids, pos));
    const r = ribbons.litRanges(joseph, (id) => id === 'b' || id === 'c' || id === 'd');
    expect(r.length).toBe(1);
    const [a, b] = r[0];
    expect(joseph.points[a].x).toBeCloseTo(60, 6);
    expect(joseph.points[b].x).toBeGreaterThanOrEqual(180 - 1e-6);
    const part = ribbons.sliceStrand(joseph, a, b);
    expect(part.points[0]).toBe(joseph.points[a]);
    for (const [x, y] of part.over) expect(y).toBeLessThanOrEqual(part.points.length - 1), expect(x).toBeGreaterThanOrEqual(0);
  });
});

// ---------- на небе ----------

type Call = [string, ...unknown[]];
function recording() {
  const calls: Call[] = [];
  const texts: { t: string; x: number; y: number }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => void texts.push({ t, x, y });
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: () => {} };
      };
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}
const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
type SkyT = InstanceType<typeof import('../src/render/sky.ts').Sky>;
function linesSky(w: number, h: number) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s: SkyT = new sky.Sky(canvas);
  s.resize(w, h, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  // «только линии»: коридор на 60 % высоты, от Адама до Иисуса Христа (как src/ui/sky/view.ts, fitLines)
  let x0 = Infinity;
  let x1 = -Infinity;
  let l0 = Infinity;
  let l1 = -Infinity;
  s.nodes.forEach((n, i) => {
    if (!n.spine) return;
    x0 = Math.min(x0, s.X0[i]);
    x1 = Math.max(x1, s.X0[i]);
    l0 = Math.min(l0, n.lane);
    l1 = Math.max(l1, n.lane);
  });
  s.cam.focusLanes = Math.max(27, l1 - l0 + 1);
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l - 24 - 126) / (x1 - x0);
  const [, cy] = s.cam.vpCenter();
  s.cam.set(s.cam.constrain({ x0: x0 - (vp.l + 24) / kx, kx, laneTop: (l0 + l1) / 2 + cy / s.cam.kyFor(kx) }));
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: true, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
  } as Parameters<SkyT['draw']>[0]);
  return { s, rec };
}

describe('«только линии» на небе (U2; MAP-23)', () => {
  it('коридор вписан: полосы линий — на 60 % высоты, полоса выше, чем на «всём небе»', () => {
    const { s } = linesSky(1440, 776);
    const fit = s.cam.fitK!.ky;
    expect(s.cam.ky).toBeGreaterThan(fit * 3);
    const lanes = s.nodes.filter((n) => n.spine).map((n) => s.cam.sy(n.lane));
    expect(Math.min(...lanes)).toBeGreaterThan(s.cam.vp.t);
    expect(Math.max(...lanes)).toBeLessThan(s.cam.vp.b);
  });
  for (const [w, h] of [[1440, 776], [1024, 644]] as const)
    it(`${w}: видны пять выносок точек сравнения; наложений подписей нет; выноски ловят щелчок`, () => {
      const { s } = linesSky(w, h);
      const st = s.labelStats();
      const notes = st.boxes.filter((b) => b.kind === 'note').map((b) => b.text.replace(/ /g, ' '));
      const hits = ribbons.lineNoteHits(s).filter((q) => q.kind === 'synopsis');
      expect(hits.map((q) => q.id).sort()).toEqual(['david', 'iisus', 'kainan-syn-arfaksada', 'salafiil', 'zorovavel']);
      expect(notes.filter((t) => /^(Каинан|Расходятся|Сходятся)/.test(t)).length).toBe(5);
      expect(st.overlaps).toBe(0);
    });
  it('подписи лиц линий: золотые (только Мф) — над звездой, лазурные (только Лк) — под ней (UX-16)', async () => {
    const { s } = linesSky(1440, 776);
    // окно — от Давида на ~250 лет вперёд, как у студентки, приблизившей развилку
    const xd = s.nodeX('david')!;
    const kx = (s.cam.vp.r - s.cam.vp.l) / (s.xOf(s.tOf(xd) + 250) - xd);
    const [, cy] = s.cam.vpCenter();
    s.cam.set({ x0: xd - (s.cam.vp.l + 60) / kx, kx, laneTop: s.node('david')!.lane + cy / s.cam.kyFor(kx) });
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: true, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<SkyT['draw']>[0]);
    const st = s.labelStats();
    expect(st.overlaps).toBe(0);
    const j = new Set(atlas.lines.joseph.persons.map((x) => x.id));
    const m = new Set(atlas.lines.mary.persons.map((x) => x.id));
    let own = 0;
    let one = 0;
    const wrong: string[] = [];
    for (const b of st.boxes) {
      const id = b.id;
      if (b.kind !== 'star' || !id || (j.has(id) && m.has(id)) || (!j.has(id) && !m.has(id))) continue;
      one++;
      const y = s.cam.sy(s.node(id)!.lane);
      if (j.has(id) && b.y + b.h <= y) own++;
      if (m.has(id) && b.y >= y) own++;
      // по другую сторону ленты — никогда: имя читалось бы как лицо другой линии
      if ((j.has(id) && b.y >= y) || (m.has(id) && b.y + b.h <= y)) wrong.push(id);
    }
    expect(one).toBeGreaterThan(8);
    expect(wrong).toEqual([]);
    // сверху и снизу — большинство; остальные, кому не хватило места над или под звездой, — сбоку
    expect(own / one).toBeGreaterThanOrEqual(0.8);
    // у развилки — Вирсавия, мать Соломона и Нафана
    const notes = st.boxes.filter((b) => b.kind === 'note').map((b) => b.text.replace(/\u00a0/g, ' '));
    expect(notes.some((t) => t.startsWith('Вирсавия — мать Соломона и Нафана'))).toBe(true);
    // подписи лент у начала ветвей — последними, на свободном от имён месте: на пустом небе они стоят
    const labels = await import('../src/render/labels.ts');
    s.ledger.reset();
    const q = { s: { onlyLines: true, layers: LAYERS, lineFlip: false }, placer: new labels.Placer(), reserve: [], labeled: new Set() } as unknown as Parameters<typeof ribbons.drawBranchLabels>[1];
    ribbons.drawBranchLabels(s, q, { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons });
    const branch = s.ledger.boxes.map((b) => b.text.replace(/\u00a0/g, ' ')).filter((t) => t.startsWith('через '));
    expect(branch.length).toBeGreaterThan(0);
    for (const t of branch) expect(['через Соломона (Мф 1)', 'через Нафана (Лк 3)', 'через Авиуда (Мф 1)', 'через Рисая (Лк 3)']).toContain(t);
  });
  it('наведение на ленту: шаг «Иосия → Иехония (Мф 1:11)»', () => {
    const t = ribbons.ribbonStepText({ line: 'joseph', from: 'iosiya', to: 'iekhoniya', x: 0, y: 0 }, atlas.lines.joseph.persons.length ? { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons } : { joseph: [], mary: [] });
    expect(t.replace(/ /g, ' ')).toBe('Иосия → Иехония (Мф 1:11)');
    const { s } = linesSky(1440, 776);
    // точка на нити линии Иосифа между Давидом и Соломоном ловится как шаг этой линии
    const i = s.indexOf('solomon')!;
    const x = s.cam.sx(s.X0[i]);
    const y = s.cam.sy(s.nodes[i].lane);
    let hit = null;
    for (let dy = -14; dy <= 14 && !hit; dy++) {
      const h = ribbons.ribbonAt(s, x - 3, y + dy, 3);
      if (h?.line === 'joseph') hit = h;
    }
    expect(hit).toBeTruthy();
    expect(['david', 'solomon']).toContain(hit!.from);
    // шаг объясняет подсказка (Tip.tsx; решение 54): на холсте подписи шага нет, лента наведена
    ribbons.setRibbonHover(s, hit);
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: true, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<SkyT['draw']>[0]);
    const step = ribbons.ribbonStepText(hit!, { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons });
    expect(s.labelStats().boxes.some((b) => b.text === step)).toBe(false);
    expect(ribbons.ribbonHover(s)).toBe(hit);
    ribbons.setRibbonHover(s, null);
  });
});
