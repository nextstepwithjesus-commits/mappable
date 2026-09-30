/**
 * Этап 11, B1 «ошибки отрисовки» (снимок владельца 14): в небе «набор» с «только линиями Мессии» имена лиц линий, которых
 * нет в наборе (Каинан, Сала … Наассон), висели на пустом небе без звёзд, лент и следов; у Фареса — знак Фамари, у
 * Арфаксада — выноска «Каинан — только у Луки». Причина: подписи режима «только линии» (ribbons.ts: имена и номера лиц
 * линий, выноски точек сравнения, женщины Мф 1) брали лиц линий без проверки набора, а звёзды и ленты — с ней.
 * Теперь одна проверка «звезда нарисована в этом кадре» (Pass.starShown) — у звёзд и у подписей лиц, а шаги линий на
 * небе (skySteps) пропускают лиц, скрытых набором, как нити лент (strandSteps).
 */
import { beforeAll, describe, expect, it } from 'vitest';

/** Холст, который ничего не рисует; ширина текста — 6 px на знак. */
function recording() {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      return () => ({ addColorStop: () => {} });
    },
    set: () => true,
  });
  return ctx as unknown as CanvasRenderingContext2D;
}

let sky: typeof import('../src/render/sky.ts');
let ribbons: typeof import('../src/render/ribbons.ts');
let atlas: typeof import('../src/data/atlas.ts');
let reveal: typeof import('../src/ui/reveal.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
type PlateIn = import('../src/render/plates.ts').PlateIn;
type State = Parameters<Sky['draw']>[0];

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  ribbons = await import('../src/render/ribbons.ts');
  atlas = await import('../src/data/atlas.ts');
  reveal = await import('../src/ui/reveal.ts');
  // женщины Мф 1 (Фамарь у Фареса) — из главы Мф 1: без неё их знаков на небе нет вовсе
  await ribbons.loadMt1();
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const LINE = ['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy', 'sim', 'arfaksad'];

/** Раскрытие «С Адама» вниз по линии до Арфаксада (как щелчками по точкам союзов): набор и раскрытые союзы. */
function chain() {
  const set = new Set<string>(['adam']);
  const plates: PlateIn[] = [];
  for (let k = 0; k + 1 < LINE.length; k++) {
    const u = reveal.unionsOf(LINE[k]).find((x) => x.kids.includes(LINE[k + 1]))!;
    for (const x of [u.a, u.b, ...u.kids]) if (x) set.add(x);
    plates.push({ union: u, from: LINE[k], dir: 'down', open: true });
  }
  return { set, plates };
}

/** Кадр неба 1440 × 776: режим, набор, союзы, «только линии»; окно years лет вокруг лица at; выбранное лицо; зажигание. */
function frame(o: { mode?: 'work' | 'all'; set?: Set<string>; plates?: PlateIn[]; only?: boolean; at: string; years: number; selected?: string | null; intro?: number; reveal?: Set<string> | null }) {
  const canvas = { getContext: () => recording(), style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(1440, 776, 1);
  const m = atlas.models[0];
  s.setModel(m, 1);
  s.fitAll();
  s.setView({ mode: o.mode ?? 'work', set: o.set ?? new Set(), foldDesc: [], foldGroups: [], plates: o.plates ?? [] });
  const x = s.nodeX(o.at)!;
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l) / (s.xOf(t + o.years / 2) - s.xOf(t - o.years / 2));
  s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(s.node(o.at)!.lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
  const state = {
    model: m, lambda: 1, selected: o.selected ?? null, second: null, hovered: null, focus: null, highlight: null, depth: null,
    layers: LAYERS, onlyLines: !!o.only, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: o.intro ?? 1, lineFlip: false,
    pins: new Set(), reserve: [], plates: o.plates ?? null, plateMarks: {}, reveal: o.reveal ?? null,
  } as State;
  s.draw(state);
  s.draw(state);
  return { s, data: (canvas as unknown as { dataset: Record<string, string> }).dataset, state };
}

/** Лица подписей-имён и номеров у бусин кадра. */
const labeled = (s: Sky) => [...new Set(s.ledger.boxes.filter((b) => (b.kind === 'star' || b.kind === 'mark') && b.id).map((b) => b.id!))];

describe('снимок 14: небо «набор» от Адама до Арфаксада и «только линии Мессии»', () => {
  it('подписаны только лица набора — ни одного имени или номера у лица, скрытого набором; у каждой подписи — звезда (data-bare пуст)', () => {
    const { set, plates } = chain();
    // окно — от Ламеха до Наассона, как на снимке: здесь стояли имена Каинана, Салы … Наассона без звёзд
    for (const [at, years] of [['arfaksad', 1400], ['avraam', 1200], ['noy', 900]] as const) {
      const { s, data } = frame({ set, plates, only: true, at, years, selected: 'arfaksad' });
      const ids = labeled(s);
      const stray = ids.filter((id) => !set.has(id));
      expect(stray, `${at}: подписи лиц вне набора`).toEqual([]);
      expect(data.bare, `${at}: подписи без звезды`).toBe('');
    }
  });
  it('нет выноски «Каинан — только у Луки» (Каинана нет в наборе), знака Фамари у Фареса и выносок развилки Давида', () => {
    const { set, plates } = chain();
    const { s } = frame({ set, plates, only: true, at: 'avraam', years: 2600, selected: 'arfaksad' });
    const text = s.ledger.boxes.map((b) => b.text).join('|');
    expect(text).not.toMatch(/только у Луки/);
    expect(text).not.toMatch(/Фамарь/);
    expect(text).not.toMatch(/Расходятся|Сходятся|Вирсавия/);
  });
  it('лица набора на линиях подписаны, звёзды нарисованы; «+» нераскрытых союзов в «только линиях» нет — точек союзов там нет', () => {
    const { set, plates } = chain();
    const { s, data } = frame({ set, plates, only: true, at: 'sim', years: 1400, selected: 'arfaksad', reveal: new Set(['arfaksad', 'noy', 'sim']) });
    const ids = labeled(s);
    for (const id of ['noy', 'sim', 'arfaksad']) expect(ids, id).toContain(id);
    expect(data.bare).toBe('');
    expect(s.foldHits.filter((h) => h.kind === 'reveal')).toEqual([]);
    // без «только линий» «+» по-прежнему есть (решение 70)
    const b = frame({ set, plates, at: 'sim', years: 1400, selected: 'arfaksad', reveal: new Set(['arfaksad', 'noy', 'sim']) });
    expect(b.s.foldHits.some((h) => h.kind === 'reveal')).toBe(true);
  });
  it('набор с Фаресом: знак Фамари стоит у его звезды, как прежде', () => {
    const set = new Set([...chain().set, 'iuda', 'fares', 'famar', 'avraam', 'isaak', 'iakov']);
    const { s, data } = frame({ set, only: true, at: 'fares', years: 400, selected: 'fares' });
    expect(s.ledger.boxes.some((b) => b.kind === 'note' && b.text.startsWith('Фамарь'))).toBe(true);
    expect(data.bare).toBe('');
  });
});

describe('одна проверка «звезда нарисована» у звёзд и подписей (Pass.starShown)', () => {
  it('небо «все лица» с «только линиями» и без них: у каждой подписи лица нарисована звезда', () => {
    for (const only of [false, true])
      for (const [at, years] of [['avraam', 600], ['david', 300], ['zorovavel', 500], ['iisus', 200], ['adam', 3000]] as const) {
        const { data } = frame({ mode: 'all', only, at, years, selected: at });
        expect(data.bare, `${at}, только линии: ${only}`).toBe('');
      }
  }, 60_000);
  it('зажигание звёзд при загрузке (ТЗ § 5.5): имя выбранного лица не опережает его звезду', () => {
    // Мелхиседек — звезда величины > 0: при intro = 0,05 она ещё не зажглась, подписи у неё нет; после зажигания — есть
    const q = atlas.byId.get('melkhisedek')!;
    expect(q.magnitude).toBeGreaterThan(0.5);
    const dark = frame({ mode: 'all', at: 'melkhisedek', years: 200, selected: 'melkhisedek', intro: 0.05 });
    expect(labeled(dark.s)).not.toContain('melkhisedek');
    expect(dark.data.bare).toBe('');
    const lit = frame({ mode: 'all', at: 'melkhisedek', years: 200, selected: 'melkhisedek', intro: 1 });
    expect(labeled(lit.s)).toContain('melkhisedek');
  });
  it('bareLabels: имя или номер у бусины без нарисованной звезды — в счёт; пометы, знак брака, указатели и «липкие» имена — нет', () => {
    const idx = new Map([['a', 0], ['b', 1], ['c', 2]]);
    const boxes = [
      { kind: 'star', id: 'a', text: 'А' },
      { kind: 'mark', id: 'b', text: 'Мф\u00a017' },
      { kind: 'mark', id: 'c', text: '‖' },
      { kind: 'note', id: 'c', text: 'Фамарь — мать Фареса' },
      { kind: 'sticky', id: 'c', text: 'В' },
      { kind: 'edge', id: 'c', text: '↑ В' },
      { kind: 'star', id: 'zz', text: 'Я' },
    ];
    expect(sky.bareLabels(boxes, (id) => idx.get(id), new Set([0]))).toEqual(['b', 'zz']);
    expect(sky.bareLabels(boxes, (id) => idx.get(id), new Set([0, 1]))).toEqual(['zz']);
  });
});

describe('шаги линий на небе и нити лент — по одному набору', () => {
  it('skySteps пропускает лиц, скрытых набором: выноски точек сравнения — только по лицам на небе', () => {
    const { set, plates } = chain();
    const { s, state } = frame({ set, plates, only: true, at: 'noy', years: 900 });
    const st = ribbons.skySteps(s, state, { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons });
    expect(st.joseph.map((x) => x.id)).toEqual(LINE);
    expect(st.mary.map((x) => x.id)).toEqual(LINE);
    expect(ribbons.comparePoints(st.joseph, st.mary)).toEqual([]);
  });
  it('нить ленты строится заново, когда меняется, кто из лиц линий на небе, даже если строки те же (кэш нитей)', () => {
    const { set, plates } = chain();
    const { s, state } = frame({ set, plates, at: 'noy', years: 900 });
    const steps = { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons };
    const g = { ...state, guide: true };
    const before = ribbons.ribbonStrands(s, g, steps).strands.find((x) => x.line === 'joseph')!.ids;
    expect(before).toContain('enos');
    // то же небо (тот же ключ строк), но Енос теперь скрыт: нить не проходит через его пустое место
    const hides = s.hides.bind(s);
    Object.assign(s, { hides: (id: string) => id === 'enos' || hides(id) });
    const after = ribbons.ribbonStrands(s, g, steps).strands.find((x) => x.line === 'joseph')!.ids;
    expect(after).not.toContain('enos');
    expect(after).toContain('sif');
    expect(after).toContain('kainan');
  });
});

describe('лента не обрывается между видимыми лицами линии и идёт у их звёзд (canvas[data-ribbon-gaps])', () => {
  it('небо «все лица», «только линии», «набор»: в окнах от Адама до Иисуса Христа замечаний нет', () => {
    const bad: string[] = [];
    const { set, plates } = chain();
    const cases: { mode: 'all' | 'work'; only: boolean; set?: Set<string>; plates?: PlateIn[] }[] = [
      { mode: 'all', only: false },
      { mode: 'all', only: true },
      { mode: 'work', only: false, set, plates },
      { mode: 'work', only: true, set, plates },
      { mode: 'work', only: false, set: new Set(reveal.LINE_IDS) },
      { mode: 'work', only: true, set: new Set(reveal.LINE_IDS) },
    ];
    for (const c of cases)
      for (const [at, years] of [['enos', 400], ['noy', 900], ['avraam', 500], ['david', 250], ['zorovavel', 400], ['iisus', 150], ['avraam', 5000]] as const) {
        if (c.set && !c.set.has(at)) continue;
        const { data } = frame({ mode: c.mode, only: c.only, set: c.set, plates: c.plates, at, years });
        if (data.ribbonGaps) bad.push(`${c.mode}${c.only ? '+линии' : ''} ${at}/${years}: ${data.ribbonGaps}`);
      }
    expect(bad).toEqual([]);
    // 40 кадров неба: под нагрузкой машины — дольше 5 с по умолчанию
  }, 60_000);
});

describe('проверка лент ловит ленту не на месте', () => {
  it('нить, сдвинутая на пять строк от звёзд (как устаревший кэш), — замечание «линия:лицо@N»', () => {
    const { s, data, state } = frame({ mode: 'all', at: 'vooz', years: 250 });
    expect(data.ribbonGaps).toBe('');
    const steps = { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons };
    const c = ribbons.ribbonStrands(s, state, steps);
    c.laneTop += 5;
    s.draw(state);
    const gaps = (s.canvas as unknown as { dataset: Record<string, string> }).dataset.ribbonGaps;
    expect(gaps).toMatch(/joseph:(vooz|ovid|iessey|salmon)@\d+/);
  });
});

describe('путь родства в режиме «только линии» — только между нарисованными звёздами', () => {
  it('«Руфь — Давид»: шага Руфь → Овид нет (звезды Руфи в «только линиях» нет — был отрезок в пустоту), шаги Овид → Иессей → Давид есть', async () => {
    const marks = await import('../src/render/marks.ts');
    const step = (from: string, to: string) => ({ from, to, kind: 'down' as const, term: 'сын', cert: 'scripture' as const, claim: 'natural', refs: [], gap: false, interpretive: false });
    const steps = [step('ruf', 'ovid'), step('ovid', 'iessey'), step('iessey', 'david')];
    const lines = frame({ mode: 'all', only: true, at: 'ovid', years: 300, selected: 'ruf' });
    expect(marks.kinRoutes(lines.s, steps).map((r) => `${r.st.from}>${r.st.to}`)).toEqual(['ovid>iessey', 'iessey>david']);
    // без «только линий» звезда Руфи на небе — шаг к ней есть
    const all = frame({ mode: 'all', at: 'ovid', years: 300, selected: 'ruf' });
    expect(marks.kinRoutes(all.s, steps).map((r) => `${r.st.from}>${r.st.to}`)).toEqual(['ruf>ovid', 'ovid>iessey', 'iessey>david']);
  });
});

describe('формула столбца выбранного лица в ярусах эпох — не за краем холста (хаос: day-390, зерно 1, шаг 20)', () => {
  it('небо 360 px, выбран Иаков: строки формулы переносятся по словам, её место — внутри холста', async () => {
    const tiers = await import('../src/render/tiers.ts');
    for (const w of [360, 390, 700, 1440]) {
      const canvas = { getContext: () => recording(), style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
      const s = new sky.Sky(canvas);
      s.resize(w, 700, 1);
      const m = atlas.models[0];
      s.setModel(m, 1);
      s.fitAll();
      const x = s.nodeX('iakov')!;
      const t = s.tOf(x);
      const vp = s.cam.vp;
      const kx = (vp.r - vp.l) / (s.xOf(t + 150) - s.xOf(t - 150));
      s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(s.node('iakov')!.lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
      tiers.replanTiers(s, m);
      s.setInsets({ top: tiers.tiersBottom(s, m) });
      const state = {
        model: m, lambda: 1, selected: 'iakov', second: null, hovered: null, focus: null, highlight: null, depth: null, layers: LAYERS, onlyLines: false, meridian: null,
        tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], plates: null, plateMarks: {}, reveal: null,
      } as State;
      s.draw(state, () => tiers.drawTiers(s, state));
      const f = JSON.parse((canvas as unknown as { dataset: Record<string, string> }).dataset.tiers ?? '{}').formula as { text: string[]; rect: { x: number; y: number; w: number; h: number } } | null;
      expect(f, `${w}`).toBeTruthy();
      expect(f!.text.join(' '), `${w}`).toMatch(/Иаков родился после рождения/);
      expect(f!.rect.x, `${w}`).toBeGreaterThanOrEqual(0);
      expect(f!.rect.x + f!.rect.w, `${w}`).toBeLessThanOrEqual(w);
    }
  });
});
