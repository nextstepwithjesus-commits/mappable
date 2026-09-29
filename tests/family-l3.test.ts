/**
 * Семьи на небе и коса — этап 7, круг 3, группа L3 (MAP-73 и решение 41, MAP-74, MAP-75 и решение 40, MAP-76, MAP-80;
 * UX-73):
 *  — помета «годы — по порядку …, выв.» — только у семьи выбранного лица и у наведённой гребёнки; её ссылка — место,
 *    где Писание называет детей по порядку; у сыновей Иакова — рассказ о рождениях Быт 29:32–30:24; 35:16–18, и порядок
 *    в данных совпадает с этим рассказом (сверка с Синодальным текстом);
 *  — orderSource(id) — ссылка для подсказки ребёнка («год оценён по порядку перечисления (ссылка), выв.»);
 *  — у каждой матери своя гребёнка: одно сплошное начертание, сдвиг 3 px, помета матери у корня — у ребёнка, а не
 *    у следа отца (и в режиме «набор», MAP-80); наведение на гребёнку (familyAt, setFamilyHover) высвечивает её;
 *  — знак брака «‖» занимает место в проверке наложений и сдвигается вдоль выноски (MAP-76);
 *  — коса на данных линий: одно перекрестье на поколение, между Салафиилом и Зоровавелем — ни одного лишнего.
 * Этап 11 (решение 78, STAGE11 § 2) заменил гребёнки грамматикой связей src/render/links.ts: помет порядка на небе нет
 * (Г9), помет матерей «от …» нет — мать видна по положению или по имени у ромба (Г8), у каждого союза свой ромб, наведение
 * ловит связь (Sky.linkAt), а не гребёнку, черта брака «‖» — линия связи. Тесты этих мест переписаны под новое поведение;
 * порядок перечисления и его ссылки (orderSource, orderListing) и коса — прежние.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

type Call = [string, ...unknown[]];
function recording() {
  const calls: Call[] = [];
  const texts: { t: string; x: number; y: number }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        if (k === 'fillText') texts.push({ t: a[0] as string, x: a[1] as number, y: a[2] as number });
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

let sky: typeof import('../src/render/sky.ts');
let trails: typeof import('../src/render/trails.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
let eribbons: typeof import('../src/engine/ribbons.ts');
let work: typeof import('../src/ui/work.ts');
let links: typeof import('../src/render/links.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  sky = await import('../src/render/sky.ts');
  trails = await import('../src/render/trails.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
  eribbons = await import('../src/engine/ribbons.ts');
  work = await import('../src/ui/work.ts');
  links = await import('../src/render/links.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const nb = (t: string) => t.replace(/ /g, ' ');
type View = import('../src/render/rows.ts').SkyView;

function drawSky(move: (s: Sky) => void, state: Record<string, unknown> = {}, o: { view?: View; before?: (s: Sky) => void } = {}) {
  const rec = recording();
  const s = new sky.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
  s.resize(1440, 776, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  if (o.view) s.setView(o.view);
  move(s);
  o.before?.(s);
  const st = {
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], ...state,
  } as Parameters<Sky['draw']>[0];
  s.draw(st);
  return { s, ...rec, redraw: () => { rec.calls.length = 0; rec.texts.length = 0; s.draw(st); } };
}
const window = (year: number, span: number, lane = 0) => (s: Sky) => {
  const t = years.toAstro(year);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + vw / 2) / kx, kx, laneTop: lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};
const notesOf = (s: Sky) => s.labelStats().boxes.filter((b) => b.kind === 'note');
/** Пути связей последнего кадра, нарисованные в нём (px холста: со сдвигом кадра связей). */
function drawnLinks(s: Sky) {
  const d = s.linkFrame()!;
  const paths = d.frame.paths.filter((q) => trails.linkShown(q, d) && (d.alpha > 0.01 || d.lit(q))).map((q) => ({ ...q, pts: q.pts.map((v, k) => v + (k % 2 ? d.dy : d.dx)) }));
  const nodes = d.frame.nodes.map((n) => ({ ...n, x: n.x + d.dx, y: n.y + d.dy }));
  return { d, paths, nodes };
}
/** Мать союза «u:отец+мать» (null — не названа). */
const motherOfUnion = (u: string): string | null => /^u:[a-z0-9-]*\+([a-z0-9-]*)/.exec(u)?.[1] || null;

// ---------- MAP-73, решение 41: помета порядка и её ссылка ----------

describe('порядок перечисления: ссылка — место, где Писание называет детей по порядку (решение 41)', () => {
  const JACOB = ['ruvim', 'simeon', 'leviy', 'iuda', 'dan', 'neffalim', 'gad', 'asir', 'issakhar', 'zavulon', 'dina', 'iosif', 'veniamin'];
  it('сыновья Иакова: порядок в данных — порядок рассказа о рождениях Быт 29:32–30:24; 35:16–18 (Синодальный текст)', () => {
    // порядок в данных
    const kids = JACOB.map((id) => atlas.byId.get(id)!);
    expect(kids.map((k) => k.order)).toEqual(JACOB.map((_, i) => i + 1));
    // тот же порядок — в самом тексте: первое упоминание имени в рассказе о рождениях
    const tsv = readFileSync(join(__dirname, '../tools/bible/synodal.tsv'), 'utf8').split('\n');
    const inRange = (ref: string) => {
      const m = /^Быт\t(\d+)\t(\d+)\t/.exec(ref);
      if (!m) return false;
      const c = Number(m[1]);
      const v = Number(m[2]);
      return (c === 29 && v >= 32) || c === 30 && v <= 24 || (c === 35 && v >= 16 && v <= 18);
    };
    const text = tsv.filter(inRange).map((l) => l.split('\t').slice(3).join(' ')).join(' ').replace(/\[[^\]]*\]/g, '');
    const at = kids.map((k) => text.search(new RegExp(`(^|[^А-Яа-яЁё])${k.name}`)));
    for (const [i, a] of at.entries()) expect(a, kids[i].name).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < at.length; i++) expect(at[i], `${kids[i - 1].name} → ${kids[i].name}`).toBeGreaterThan(at[i - 1]);
  });
  it('orderSource: у сыновей Иакова — рассказ о рождениях, а не перечень 1 Пар 2:1–2; у детей Давида — 1 Пар 3:1–9', () => {
    const m = atlas.models[0];
    const jacobs = JACOB.filter((id) => m.chrono.get(id)?.byOrder);
    expect(jacobs.length).toBeGreaterThan(5);
    for (const id of jacobs) expect(nb(trails.orderSource(id, m)!), id).toBe('Быт 29:32–30:24; 35:16–18');
    expect(trails.orderListing('ruvim', m)!.refs).toEqual(['Быт 29:32-30:24', 'Быт 35:16-18']);
    expect(nb(trails.orderSource('amnon', m)!)).toBe('1 Пар 3:1–9');
    // год не по порядку — ссылки нет: подсказка пишет строку только о тех, чей год оценён по порядку
    const exact = [...m.chrono].find(([, c]) => !c.byOrder && c.cls === 'exact')![0];
    expect(trails.orderSource(exact, m)).toBe(null);
  });
  it('место перечисления — книга, где дети названы в своём порядке: сыновья Хама — 1 Пар 1:8 (в Быт Ханаан назван раньше, 9:18)', () => {
    const m = atlas.models[0];
    if (m.chrono.get('mitsraim')?.byOrder) expect(nb(trails.orderSource('mitsraim', m)!)).toBe('1 Пар 1:8');
    const l = trails.listingOf(['ir-syn-iudy', 'onan', 'shela-syn-iudy', 'fares'].filter((id) => atlas.byId.has(id)));
    expect(l && nb(l.text)).toMatch(/^Быт 38:/);
  });
  it('помет порядка на небе нет — ни без выбора, ни у семьи выбранного (этап 11, Г9; прежде MAP-73 — у семьи выбранного); текст — в подсказке и карточке союза', () => {
    // этап 11 (STAGE11 § 2, Г9): порядок рождения виден по положению; помета «годы — по порядку …» ушла с неба в подсказку и
    // карточку союза (familyOrderNote, диапазон — по стихам, где названы дети этого союза)
    const order = (s: Sky) => notesOf(s).filter((b) => /по порядку/.test(nb(b.text)));
    for (const [y, w, l] of [[-1700, 300, 0], [-2070, 250, 21], [-1915, 70, -2]] as const) {
      const { s } = drawSky(window(y, w, l));
      expect(order(s), `${y}`).toEqual([]);
    }
    for (const selected of ['iakov', 'ruvim']) {
      const { s } = drawSky(window(-1915, 70, -2), { selected });
      expect(order(s), selected).toEqual([]);
      expect(s.labelStats().overlaps, selected).toBe(0);
    }
    expect(nb(links.familyOrderNote('u:iakov+liya')!)).toMatch(/^по порядку перечисления, Быт 29:32/);
    expect(nb(links.familyOrderNote('u:iakov+liya')!)).toMatch(/, выв\.$/);
  });
});

// ---------- MAP-74, MAP-80: гребёнки матерей ----------

describe('союзы матерей: у каждого свой ромб и свои зубцы (MAP-74; этап 11, Г4, Г6, Г8)', () => {
  it('у детей Давида от семи матерей — сплошные линии без штриха; помет «от …» нет, у ромба на следе Давида — имя матери', () => {
    const { s, calls } = drawSky(window(-1010, 50, 0));
    // ни одного прежнего штриха (штрих [5, 3] — только иное происхождение, точки [1, 3] — толкование и нить народа, Г10)
    const dashes = new Set(calls.filter((c) => c[0] === 'setLineDash').map((c) => JSON.stringify(c[1])));
    for (const d of ['[3,2]', '[1,2]', '[5,2,1,2]']) expect(dashes.has(d), d).toBe(false);
    // этап 11, Г8: мать видна по положению или по имени у ромба; пометы «от Вирсавии» у ребёнка ушли с неба
    expect(notesOf(s).filter((b) => /^от [А-ЯЁ]/.test(b.text))).toEqual([]);
    const yDavid = s.cam.sy(s.node('david')!.lane);
    const { nodes } = drawnLinks(s);
    const own = nodes.filter((n) => n.kind === 'union' && n.union.startsWith('u:david+') && n.owner === 'david');
    // у каждого союза Давида с детьми на небе — свой ромб на следе Давида, у названной матери — её имя у ромба
    expect(own.length).toBeGreaterThanOrEqual(5);
    for (const n of own) {
      expect(Math.abs(n.y - yDavid), n.union).toBeLessThan(1);
      expect(n.mother ?? '', n.union).toBe(motherOfUnion(n.union) ?? '');
    }
    const names = s.labelStats().boxes.filter((b) => b.kind === 'plate' && b.text).map((b) => b.text);
    expect(names).toContain('Вирсавия');
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('союзы разных матерей одного отца не сливаются: ромбы не ближе 2r + 1, вертикали не ближе 8 px, у зубца — ребёнок своего союза', () => {
    // этап 11 (Г4, Г6, Г7): прежние гребёнки со сдвигом 3 px заменены стволами союзов; разные союзы — не ближе 8 px (или общая
    // шина с узлами каждого союза), ромбы одного следа — раздельно. Масштабы: окно 50 лет, «лицо и поколения вокруг», 300 лет
    for (const span of [50, 170, 300]) {
      const { s } = drawSky(window(-1010, span, 0));
      const { paths, nodes } = drawnLinks(s);
      const dav = paths.filter((q) => q.union?.startsWith('u:david+'));
      expect(dav.filter((q) => q.kind === 'tooth').length, `${span}`).toBeGreaterThan(5);
      // у зубца — ребёнок своего союза (отец и мать ребёнка — супруги союза)
      for (const q of dav.filter((p) => p.kind === 'tooth' && p.key.kind === 'child')) {
        const kid = atlas.byId.get((q.key as { child: string }).child)!;
        expect(kid.father, q.ks).toBe('david');
        expect(kid.mother ?? null, q.ks).toBe(motherOfUnion(q.union!));
      }
      // вертикали разных союзов с перекрытием по высоте: на одной шине или не ближе 8 px
      const vs: { x: number; y0: number; y1: number; u: string }[] = [];
      for (const q of dav)
        for (const [x0, y0, x1, y1] of links.segmentsOf(q)) if (Math.abs(x0 - x1) < 0.5 && Math.abs(y0 - y1) > 0.5) vs.push({ x: x0, y0: Math.min(y0, y1), y1: Math.max(y0, y1), u: q.union! });
      for (const a of vs)
        for (const b of vs) {
          if (a.u >= b.u || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.5) continue;
          const dx = Math.abs(a.x - b.x);
          expect(dx < 0.5 || dx >= links.TRUNK_GAP - 0.5, `${span}: ${a.u} / ${b.u}: ${dx}`).toBe(true);
        }
      // ромбы союзов на следе Давида — раздельно
      const on = nodes.filter((n) => n.owner === 'david').sort((a, b) => a.x - b.x);
      for (let k = 1; k < on.length; k++) expect(on[k].x - on[k - 1].x, `${span}: ${on[k - 1].union} / ${on[k].union}`).toBeGreaterThanOrEqual(2 * links.NODE_R_MAP + 1 - 0.01);
      expect(s.labelStats().overlaps, `${span}`).toBe(0);
    }
  });
  it('наведение: ромб — союз, зубец — связь с ребёнком (Sky.linkAt); гребёнок нет (familyAt пуст); наведённый союз толще, помета порядка — в подсказке', () => {
    const f = drawSky(window(-1010, 50, 0));
    const { s } = f;
    const { nodes, paths } = drawnLinks(s);
    // этап 11, § 8: под указателем — связь; прежний familyAt гребёнок и помет матерей больше ничего не находит
    const n = nodes.find((q) => q.union === 'u:david+virsaviya' && q.kind === 'union')!;
    const atNode = s.linkAt(n.x, n.y, 4)!;
    expect(atNode.kind).toBe('node');
    expect(atNode.key).toEqual({ kind: 'union', union: 'u:david+virsaviya' });
    const t = paths.find((q) => q.kind === 'tooth' && q.union === 'u:david+virsaviya')!;
    const mx = (t.pts[0] + t.pts[2]) / 2;
    const my = t.pts[1];
    const atTooth = s.linkAt(mx, my, 4)!;
    expect(atTooth.key).toEqual(t.key);
    expect(trails.familyAt(s, mx, my)).toBe(null);
    expect(trails.familyCombs(s)).toEqual([]);
    // наведённый союз рисуется толщиной 2 px (без наведения — 1 px)
    const wide = (c: typeof f.calls) => c.filter((q) => q[0] === '=lineWidth' && q[1] === 2).length;
    const before = wide(f.calls);
    const hov = drawSky(window(-1010, 50, 0), { linkHover: { kind: 'union', union: 'u:david+virsaviya' } });
    expect(wide(hov.calls)).toBeGreaterThan(before);
    expect(notesOf(hov.s).some((b) => /по порядку/.test(nb(b.text)))).toBe(false);
    expect(nb(links.familyOrderNote('u:david+virsaviya')!)).toMatch(/^по порядку перечисления, 2 Цар 5:14/);
  });
  it('набор (MAP-80; этап 11 — семейная укладка): помет «от …» нет, ромб каждого союза — на следе матери', () => {
    const ids = new Set(work.scopeIds('david', { kind: 'family' }).map((x) => x.id));
    const { s } = drawSky(() => {}, {}, { view: { mode: 'work', set: ids, foldDesc: [], foldGroups: [] }, before: (q) => q.fitAll() });
    expect(notesOf(s).filter((b) => /^от [А-ЯЁ]/.test(b.text))).toEqual([]);
    const { d, nodes } = drawnLinks(s);
    expect(d.frame.layout).toBe('family');
    const named = nodes.filter((n) => n.kind === 'union' && n.union.startsWith('u:david+') && motherOfUnion(n.union) && s.node(motherOfUnion(n.union)!));
    expect(named.length).toBeGreaterThanOrEqual(3);
    for (const n of named) expect(n.owner, n.union).toBe(motherOfUnion(n.union));
    expect(s.labelStats().overlaps).toBe(0);
  });
});

// ---------- MAP-76: знак брака ----------

describe('знак брака в проверке наложений (MAP-76)', () => {
  it('черта брака «‖» у Моисея и Сепфоры — линия связи (ключ супруга); подписи на ней не лежат, наложений нет', () => {
    // этап 11 (Г4): черта брака — путь связи kind 'bar' от мужа к ромбу союза (links.ts), а не знак в замере подписей;
    // подписи обходят линии связей (Я12), знак ромба на конце черты — свой
    const { s } = drawSky(window(-1480, 280, 0), { selected: 'moisey' }, { before: (q) => { const n = q.node('moisey')!; q.cam.laneTop = n.lane + 380 / q.cam.ky; } });
    const { paths } = drawnLinks(s);
    const bars = paths.filter((q) => q.kind === 'bar' && q.union === 'u:moisey+sepfora');
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0].key.kind).toBe('spouse');
    const st = s.labelStats();
    for (const q of bars)
      for (const [x0, y0, x1, y1] of links.segmentsOf(q)) {
        const on = st.boxes.filter((b) => !(b.kind === 'plate' && !b.text) && b.kind !== 'frame' && Math.max(x0, x1) > b.x && Math.min(x0, x1) < b.x + b.w && Math.max(y0, y1) > b.y && Math.min(y0, y1) < b.y + b.h);
        expect(on.map((b) => b.text), q.ks).toEqual([]);
      }
    expect(st.overlaps).toBe(0);
  });
  it('знак 8 px сдвигается вдоль выноски; выноска не рисуется под подписью', () => {
    const r = recording();
    trails.drawMarriage(r.ctx, { x: 50, yH: 100, yW: 200, color: '#fff', near: 40, from: 132, skip: [[150, 164]] });
    const lines = r.calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo');
    // знак — от 132 до 140
    expect(lines).toContainEqual(['moveTo', 48.5, 132]);
    expect(lines).toContainEqual(['lineTo', 48.5, 140]);
    // выноска: от следа мужа до знака, от знака до жены с разрывом под подписью 150–164
    expect(lines).toContainEqual(['moveTo', 50, 100]);
    expect(lines).toContainEqual(['lineTo', 50, 132]);
    expect(lines).toContainEqual(['lineTo', 50, 150]);
    expect(lines).toContainEqual(['moveTo', 50, 164]);
    expect(lines).toContainEqual(['lineTo', 50, 200]);
  });
});

// ---------- MAP-75, решение 40: коса на данных линий ----------

describe('коса считает поколения (MAP-75; решение 40)', () => {
  const m = () => atlas.models[0];
  const build = (pxPerYear: number) => {
    const node = (id: string) => m().nodeByPerson.get(id);
    const project = (id: string) => {
      const n = node(id);
      return n ? { x: n.t0 * pxPerYear, y: n.lane * 14 } : null;
    };
    const steps = (ln: 'joseph' | 'mary') => atlas.lines[ln].persons.filter((q) => node(q.id)).map((q) => ({ id: q.id, weak: false }));
    return eribbons.buildRibbons({ joseph: steps('joseph'), mary: steps('mary'), project, amplitude: eribbons.BRAID_PX, meander: eribbons.BRAID_PX * 0.5 });
  };
  it('от Салмона до Давида — одно перекрестье на каждое поколение; между Салафиилом и Зоровавелем лишнего перекрестья нет', () => {
    const strands = build(12);
    const j = strands.find((q) => q.line === 'joseph')!;
    const mm = strands.find((q) => q.line === 'mary')!;
    const at = (st: typeof j, id: string) => st.points.findIndex((p) => Math.abs(p.u - st.ids.indexOf(id)) < 1e-9);
    const flips = (a: string, b: string) => {
      const [ja, jb] = [at(j, a), at(j, b)];
      const [ma, mb] = [at(mm, a), at(mm, b)];
      expect(jb - ja).toBe(mb - ma);
      let n = 0;
      for (let k = 1; k <= jb - ja; k++) {
        const d0 = j.points[ja + k - 1].y - mm.points[ma + k - 1].y;
        const d1 = j.points[ja + k].y - mm.points[ma + k].y;
        if (d0 !== 0 && Math.sign(d0) !== Math.sign(d1)) n++;
      }
      return n;
    };
    const J = atlas.lines.joseph.persons.map((q) => q.id);
    const run = J.slice(J.indexOf('salmon'), J.indexOf('david') + 1);
    for (let k = 0; k + 1 < run.length; k++) expect(flips(run[k], run[k + 1]), `${run[k]} → ${run[k + 1]}`).toBe(1);
    expect(flips('salafiil', 'zorovavel')).toBe(0);
    // Иосиф — сверху у расхождения после Давида и у схождения в Салафииле
    const up = (st: typeof j, id: string) => st.points[at(st, id)].y;
    expect(up(j, 'david')).toBeLessThan(up(mm, 'david'));
    expect(up(j, 'zorovavel')).toBeLessThan(up(mm, 'zorovavel'));
  });
  it('плетение поочерёдное и в данных: участки «поверх» — только перекрестья, у Марии и Иосифа по очереди', () => {
    const [mary, joseph] = build(12);
    const xs = [...mary.over.map(([a, b]) => [mary.points[a].x, mary.points[b].x, 'm'] as const), ...joseph.over.map(([a, b]) => [joseph.points[a].x, joseph.points[b].x, 'j'] as const)].sort((p, q) => p[0] - q[0]);
    expect(xs.length).toBeGreaterThan(10);
    for (const [a, b] of xs) expect(b - a).toBeLessThanOrEqual(eribbons.CROSS_LEN * eribbons.BRAID_PX + 0.5);
  });
});
