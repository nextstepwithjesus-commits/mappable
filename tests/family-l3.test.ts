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
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  sky = await import('../src/render/sky.ts');
  trails = await import('../src/render/trails.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
  eribbons = await import('../src/engine/ribbons.ts');
  work = await import('../src/ui/work.ts');
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
  it('на небе помета — только у семьи выбранного лица; без выбора её нет нигде (MAP-73: было 7–8 на экран)', () => {
    for (const [y, w, l] of [[-1700, 300, 0], [-2070, 250, 21], [-1915, 70, -2]] as const) {
      const { s } = drawSky(window(y, w, l));
      expect(notesOf(s).filter((b) => /^годы — по порядку/.test(nb(b.text))), `${y}`).toEqual([]);
    }
    const { s } = drawSky(window(-1915, 70, -2), { selected: 'iakov' });
    const own = notesOf(s).map((b) => nb(b.text)).filter((t) => t.startsWith('годы — по порядку'));
    expect(own).toEqual(['годы — по порядку Быт 29:32–30:24; 35:16–18, выв.']);
    expect(s.labelStats().overlaps).toBe(0);
    // выбран сын — помета у его братьев и сестёр
    const son = drawSky(window(-1915, 70, -2), { selected: 'ruvim' });
    expect(notesOf(son.s).some((b) => nb(b.text).startsWith('годы — по порядку Быт 29:32'))).toBe(true);
  });
});

// ---------- MAP-74, MAP-80: гребёнки матерей ----------

describe('гребёнки матерей (MAP-74)', () => {
  it('у детей Давида от семи матерей — одно сплошное начертание стволов; помета матери у её ребёнка, не у следа Давида', () => {
    const { s, calls } = drawSky(window(-1010, 50, 0));
    // ни одного штриха у связей без выделения (штрих — только «потомок выбранного» и «по толкованию»)
    const dashes = new Set(calls.filter((c) => c[0] === 'setLineDash').map((c) => JSON.stringify(c[1])));
    for (const d of ['[3,2]', '[1,2]', '[5,2,1,2]']) expect(dashes.has(d), d).toBe(false);
    const yDavid = s.cam.sy(s.node('david')!.lane);
    const moms = notesOf(s).filter((b) => /^от [А-ЯЁ]/.test(b.text));
    expect(moms.length).toBeGreaterThanOrEqual(5);
    expect(moms.map((b) => b.text)).toContain('от Вирсавии');
    for (const b of moms) {
      const mother = atlas.persons.find((q) => trails.motherNote(q.id) === b.text)!;
      // на строке одного из её детей, у которых отец — Давид (или рядом с его стволом), и не на строке Давида
      const kids = atlas.persons.filter((q) => q.mother === mother.id && q.father === 'david' && s.node(q.id));
      const rows = kids.map((q) => s.cam.sy(s.node(q.id)!.lane));
      const cy = b.y + b.h / 2;
      expect(Math.abs(cy - yDavid), b.text).toBeGreaterThan(4);
      expect(rows.some((y) => Math.abs(y - cy) < 16) || kids.length === 0, `${b.text}: ${cy} vs ${rows.join(',')}`).toBe(true);
    }
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('гребёнки разных матерей одного отца не сливаются: стволы — не ближе 3 px, у каждой матери свои дети', () => {
    expect(trails.COMB_SHIFT).toBe(3);
    for (const span of [50, 300, 700]) {
      const { s } = drawSky(window(-1010, span, 0));
      const combs = trails.familyCombs(s).filter((c) => c.parent === 'david');
      expect(combs.length, `${span}`).toBeGreaterThan(3);
      for (const a of combs)
        for (const b of combs) {
          if (a === b || a.mother === b.mother || !(a.lo < b.hi && b.lo < a.hi)) continue;
          expect(Math.abs(a.x - b.x), `${span}: ${a.mother} / ${b.mother}`).toBeGreaterThanOrEqual(trails.COMB_SHIFT - 0.5);
        }
      // у гребёнки — дети одной матери
      for (const c of combs) for (const k of c.kids) expect(atlas.byId.get(k)!.mother ?? null, k).toBe(c.mother);
    }
  });
  it('наведение на гребёнку: familyAt находит гребёнку и помету; гребёнка матери ярче и толще, появляется помета порядка', () => {
    const f = drawSky(window(-1010, 50, 0));
    const { s } = f;
    // помета матери ловится указателем
    const note = notesOf(s).find((b) => b.text === 'от Вирсавии')!;
    const byNote = trails.familyAt(s, note.x + note.w / 2, note.y + note.h / 2)!;
    expect(byNote.kind).toBe('mother');
    expect(byNote.parent).toBe('david');
    expect(byNote.mother).toBe('virsaviya');
    // ствол гребёнки — тоже: у ребёнка Вирсавии, над его звездой
    const kid = atlas.persons.find((q) => q.mother === 'virsaviya' && q.father === 'david' && s.node(q.id) && s.indexOf(q.id) !== undefined && q.id !== 'solomon' && q.id !== 'nafan-syn-davida')!;
    const x = Math.round(s.cam.sx(s.X0[s.indexOf(kid.id)!])) + 0.5;
    const y = s.cam.sy(s.node(kid.id)!.lane);
    const yD = s.cam.sy(s.node('david')!.lane);
    const byStem = trails.familyAt(s, x, (y + yD) / 2);
    expect(byStem?.parent).toBe('david');
    // без наведения помета порядка у детей Давида не стоит; с наведением — стоит, и гребёнка рисуется толщиной 1,5 px
    expect(notesOf(s).some((b) => nb(b.text).startsWith('годы — по порядку'))).toBe(false);
    expect(trails.setFamilyHover(s, byNote)).toBe(true);
    expect(trails.setFamilyHover(s, byNote)).toBe(false);
    f.redraw();
    expect(notesOf(s).some((b) => nb(b.text).startsWith('годы — по порядку 1 Пар 3:'))).toBe(true);
    expect(f.calls.some((c) => c[0] === '=lineWidth' && c[1] === 1.5)).toBe(true);
    expect(s.labelStats().overlaps).toBe(0);
    trails.setFamilyHover(s, null);
  });
  it('режим «набор» (MAP-80): помета матери — у её ребёнка, а не у ленты под «Соломон»', () => {
    const ids = new Set(work.scopeIds('david', { kind: 'family' }).map((x) => x.id));
    const { s } = drawSky(() => {}, {}, { view: { mode: 'work', set: ids, foldDesc: [], foldGroups: [] }, before: (q) => q.fitAll() });
    const yDavid = s.cam.sy(s.node('david')!.lane);
    const moms = notesOf(s).filter((b) => /^от [А-ЯЁ]/.test(b.text));
    expect(moms.length).toBeGreaterThanOrEqual(3);
    const sol = s.labelStats().boxes.find((b) => b.kind === 'star' && b.id === 'solomon');
    for (const b of moms) {
      expect(Math.abs(b.y + b.h / 2 - yDavid), b.text).toBeGreaterThan(4);
      // не под подписью Соломона (у ленты): помета Ахиноамы — у Амнона
      if (sol && b.text === 'от Ахиноамы') expect(Math.abs(b.y - (sol.y + sol.h)) < 6 && Math.abs(b.x - sol.x) < 40).toBe(false);
    }
    expect(s.labelStats().overlaps).toBe(0);
  });
});

// ---------- MAP-76: знак брака ----------

describe('знак брака в проверке наложений (MAP-76)', () => {
  it('знак «‖» — в замере подписей: ни одного наложения на подписи; у Моисея и Сепфоры он есть', () => {
    const { s } = drawSky(window(-1480, 280, 0), { selected: 'moisey' }, { before: (q) => { const n = q.node('moisey')!; q.cam.laneTop = n.lane + 380 / q.cam.ky; } });
    const st = s.labelStats();
    const marks = st.boxes.filter((b) => b.kind === 'mark' && b.text === '‖');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((b) => b.id === 'sepfora')).toBe(true);
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
