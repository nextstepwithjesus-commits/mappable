/**
 * Раскрытие на небе и союзы на небе (решения владельца 67, 70, 72, 76; задачи M1 и P1): текст союза (подсказка,
 * объявление, карточка), место под точки союзов в строках неба «набор», точки на холсте — между супругами, правее их
 * звёзд и левее детей, без наложений на подписи и звёзды; линии к супругам и детям; «+» у лица с нераскрытыми союзами;
 * какой союз раскрыли или свернули. Прямоугольных картушей больше нет (решение 76).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Холст, который записывает вызовы; ширина текста — 6 px на знак. */
function recording() {
  const texts: { t: string; x: number; y: number }[] = [];
  const rects: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      return (...args: unknown[]) => {
        if (k === 'fillText') texts.push({ t: args[0] as string, x: args[1] as number, y: args[2] as number });
        if (k === 'strokeRect') rects.push(args.map((a) => Math.round(a as number)).join(','));
        return { addColorStop: () => {} };
      };
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, rects };
}

let sky: typeof import('../src/render/sky.ts');
let rows: typeof import('../src/render/rows.ts');
let plates: typeof import('../src/render/plates.ts');
let atlas: typeof import('../src/data/atlas.ts');
let reveal: typeof import('../src/ui/reveal.ts');
let work: typeof import('../src/ui/work.ts');
let text: typeof import('../src/ui/sky/text.ts');
let view: typeof import('../src/ui/sky/view.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  rows = await import('../src/render/rows.ts');
  plates = await import('../src/render/plates.ts');
  atlas = await import('../src/data/atlas.ts');
  reveal = await import('../src/ui/reveal.ts');
  work = await import('../src/ui/work.ts');
  text = await import('../src/ui/sky/text.ts');
  view = await import('../src/ui/sky/view.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const U = (id: string) => reveal.unions.byId.get(id)!;
/** Строка без неразрывных пробелов и соединителей типографики (typo). */
const plain = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\u2060/g, '');

/** Небо «набор» с набором ids и союзами на небе: окно years лет вокруг лица at. */
function frame(ids: string[], o: { plates?: readonly import('../src/render/plates.ts').PlateIn[]; reveal?: Set<string>; at?: string; years?: number; w?: number; h?: number } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  const m = atlas.models[0];
  s.setModel(m, 1);
  s.fitAll();
  s.setView({ mode: 'work', set: new Set(ids), foldDesc: [], foldGroups: [], plates: o.plates ?? [] });
  s.fitAll();
  if (o.at) {
    const x = s.nodeX(o.at)!;
    const t = s.tOf(x);
    const vp = s.cam.vp;
    const years = o.years ?? 300;
    const kx = (vp.r - vp.l) / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
    s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(s.node(o.at)!.lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
  }
  const state = {
    model: m, lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    plates: o.plates ?? [], plateMarks: {}, reveal: o.reveal ?? null,
  } as Parameters<Sky['draw']>[0];
  s.draw(state);
  rec.texts.length = 0;
  rec.rects.length = 0;
  s.draw(state);
  return { s, texts: rec.texts, rects: rec.rects, data: (canvas as unknown as { dataset: Record<string, string> }).dataset };
}

const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('текст союза — подсказка, объявление, карточка (решения 67, 70, 75)', () => {
  it('имена супругов и вид связи словами данных, дети со склонением', () => {
    expect(plates.plateNames(U('u:avraam+agar'))).toBe('Авраам и Агарь');
    expect(plates.plateSub(U('u:avraam+khettura'))).toBe('наложница; 6 сыновей');
    expect(plates.plateSub(U('u:avraam+sarra'))).toBe('жена; сын');
    expect(plates.plateSub(U('u:iakov+liya'))).toBe('жена; 6 сыновей и дочь');
    expect(plates.plateSub(U('u:david+melkhola'))).toBe('жена; детей не названо');
  });
  it('второе лицо не названо — так и сказано; ничего не выдумано', () => {
    expect(plates.plateNames(U('u:sif+'))).toBe('Сиф и его жена');
    expect(plates.plateNames(U('u:noy+'))).toBe('Ной и его жена');
  });
  it('происхождение иного рода — словами данных, уровень достоверности — пометой', () => {
    expect(plates.plateSub(U('u:iosif-muzh-marii+mariya'))).toBe('жена; по закону; сын');
    expect(plates.plateSub(U('u:iakov+~adoptive'))).toBe('усыновление; 2 сына');
    expect(plates.plateSub(U('u:kainan-syn-arfaksada+~by-luke'))).toBe('по Луке; сын');
    expect(plates.plateSub(U('u:david+maakha-doch-falmaya'))).toBe('жена, выв.; сын');
    // Илий — отец Марии по толкованию (Лк 3:23): помета «толк.»
    const heli = reveal.originOf('mariya')[0];
    if (heli && heli.kidsCert === 'interpretation') expect(plates.plateSub(heli)).toMatch(/толк\./);
  });
  it('подсказка: союз в родительном падеже, дети со стихом; без склонения — именительный', () => {
    expect(plain(text.plateTipText(U('u:avraam+agar'), false))).toMatch(/^Союз Авраама и Агари: сын Измаил \(Быт\s16:15/);
    expect(plain(text.plateTipText(U('u:avraam+agar'), false))).toMatch(/— щёлкните, чтобы раскрыть$/);
    expect(plain(text.plateTipText(U('u:avraam+agar'), true))).toMatch(/чтобы свернуть$/);
    expect(plain(text.plateTipText(U('u:+doch-faraona-mat-moiseya~adoptive'), false))).toMatch(/^Союз: Дочь фараонова; сын Моисей/);
    expect(plain(text.plateTipText(U('u:avraam+khettura'), false))).toMatch(/6 сыновей: Зимран, Иокшан, Медан и ещё 3/);
    expect(plain(text.plateTipText(U('u:sif+'), false))).toMatch(/мать не названа в Писании/);
  });
  it('объявление живой области: «Раскрыт союз Авраама и Агари: 1 лицо», «Свёрнут союз …: скрыто 4 лица»', () => {
    expect(plain(text.plateSayText(U('u:avraam+agar'), true, 1))).toBe('Раскрыт союз Авраама и Агари: 1 лицо');
    expect(plain(text.plateSayText(U('u:adam+eva'), false, 4))).toBe('Свёрнут союз Адама и Евы: скрыто 4 лица');
    expect(plain(text.plateSayText(U('u:adam+eva'), true, 0))).toBe('Раскрыт союз Адама и Евы: все лица уже на небе');
  });
});

describe('место под точки союзов в строках неба «набор» (решения 70, 76)', () => {
  const data = () => {
    const m = atlas.models[0];
    return {
      graph: atlas.graph, nodes: m.nodes, laneMin: m.laneMin, laneMax: m.laneMax, t0: (i: number) => m.nodes[i].t0, groupOf: (id: string) => atlas.byId.get(id)?.group,
      parentGroup: (g: string) => atlas.groupById.get(g)?.parent, cluster: (b: number) => !!m.blocks[b]?.cluster,
    };
  };
  const lane = (id: string) => atlas.models[0].nodeByPerson.get(id)!.lane;
  it('между родителем и соседней полосой ребёнка — PLATE_ROWS строки, звёзды на середине своих строк; место меньше прежнего', () => {
    // точке не нужна строка под картуш: прибавка — полстроки, не полторы
    expect(rows.PLATE_ROWS).toBeLessThanOrEqual(0.5);
    expect(rows.PLATE_ROWS).toBeGreaterThan(0);
    const set = new Set(['adam', 'kain', 'avel', 'sif', 'eva']);
    const base = rows.planSky(data(), { mode: 'work', set, foldDesc: [], foldGroups: [] });
    const gaps = [{ lane: lane('adam'), dir: -1 as const }];
    const p = rows.planSky(data(), { mode: 'work', set, foldDesc: [], foldGroups: [], gaps });
    const r = p.rows;
    const d0 = base.rows.row(lane('adam')) - base.rows.row(lane('avel'));
    const d1 = r.row(lane('adam')) - r.row(lane('avel'));
    expect(d1 - d0).toBeCloseTo(rows.PLATE_ROWS, 6);
    // выше Адама (Сиф) — без прибавки
    expect(r.row(lane('sif')) - r.row(lane('adam'))).toBeCloseTo(base.rows.row(lane('sif')) - base.rows.row(lane('adam')), 6);
    // отображение монотонно и обратимо
    for (let l = lane('eva') - 1; l <= lane('sif') + 1; l += 0.25) {
      expect(r.row(l + 0.25)).toBeGreaterThanOrEqual(r.row(l));
      if (Math.abs(r.row(r.lane(r.row(l))) - r.row(l)) > 1e-6) throw new Error(`lane(row(${l}))`);
    }
  });
  it('без союзов — прежнее отображение; в небе «все лица» места нет', () => {
    const set = new Set(['david', 'solomon']);
    const a = rows.planSky(data(), { mode: 'work', set, foldDesc: [], foldGroups: [] });
    const b = rows.planSky(data(), { mode: 'work', set, foldDesc: [], foldGroups: [], gaps: [] });
    expect(b.rows.key).toBe(a.rows.key);
    const all = rows.planSky(data(), { mode: 'all', set, foldDesc: [], foldGroups: [], gaps: [{ lane: lane('david'), dir: 1 }] });
    expect(all.rows.identity).toBe(true);
  });
  it('plateGaps: у строки одного супруга — со стороны детей; у строки ребёнка — со стороны родителей; между двумя супругами — места не нужно', () => {
    const shown = (s: Set<string>) => (id: string) => s.has(id);
    const laneOf = (id: string) => atlas.models[0].nodeByPerson.get(id)?.lane;
    const adam: import('../src/render/plates.ts').PlateIn = { union: U('u:adam+eva'), from: 'adam', dir: 'down', open: false };
    const side = plates.hangSide(U('u:adam+eva'), lane('adam'), laneOf);
    expect(plates.plateGaps([adam], laneOf, shown(new Set(['adam'])))).toEqual([{ lane: lane('adam'), dir: side }]);
    // раскрыт: Адам и Ева на небе — точка между их строками, места не просит
    expect(plates.plateGaps([{ ...adam, open: true }], laneOf, shown(new Set(['adam', 'eva', 'kain', 'avel', 'sif'])))).toEqual([]);
    // союз родителей Иисуса Христа, родителей нет на небе: у строки Иисуса — со стороны родителей
    const up: import('../src/render/plates.ts').PlateIn = { union: U('u:iosif-muzh-marii+mariya'), from: 'iisus', dir: 'up', open: false };
    const pside = plates.parentSide(U('u:iosif-muzh-marii+mariya'), lane('iisus'), laneOf);
    expect(plates.plateGaps([up], laneOf, shown(new Set(['iisus'])))).toEqual([{ lane: lane('iisus'), dir: pside }]);
    // три союза Авраама с детьми, на небе он один: места — только со стороны детей каждого союза
    const three = reveal.unionsOf('avraam').filter((u) => u.kids.length).map((u) => ({ union: u, from: 'avraam', dir: 'down' as const, open: false }));
    const g = plates.plateGaps(three, laneOf, shown(new Set(['avraam'])));
    const want = [...new Set(three.map((pl) => plates.hangSide(pl.union, lane('avraam'), laneOf)))].sort();
    expect(g.filter((x) => x.lane === lane('avraam')).map((x) => x.dir).sort()).toEqual(want);
    expect(g.every((x) => x.lane === lane('avraam'))).toBe(true);
  });
});

describe('точки союзов на холсте (решение 76)', () => {
  beforeEach(() => reveal.startWith('adam'));
  /** Поле попадания: «союз:раскрыт (1/0):x,y,w,h». */
  const parse = (d: string) =>
    d
      .split(';')
      .filter(Boolean)
      .map((q) => {
        const m = /^(u:.*):([01]):(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(q)!;
        return { uid: m[1], open: m[2] === '1', x: +m[3], y: +m[4], w: +m[5], h: +m[6] };
      });
  /** Центры ромбов: «союз:раскрыт:cx,cy:скрыто». */
  const dots = (d: string) =>
    d
      .split(';')
      .filter(Boolean)
      .map((q) => {
        const m = /^(u:.*):([01]):(-?\d+),(-?\d+):(\d+)$/.exec(q)!;
        return { uid: m[1], open: m[2] === '1', x: +m[3], y: +m[4], hidden: +m[5] };
      });
  const at = (f: ReturnType<typeof frame>, id: string) => {
    const i = f.s.indexOf(id)!;
    return { x: f.s.cam.sx(f.s.X0[i]), y: f.s.cam.sy(f.s.nodes[i].lane) };
  };

  it('С Адама: полая точка союза «Адам и Ева» у строки Адама со стороны детей, правее его звезды, «+4»; картуша с рамкой и надписью нет', () => {
    const f = frame(['adam'], { plates: reveal.plates.value, at: 'adam', years: 400 });
    const ds = dots(f.data.dots ?? '');
    expect(ds.map((q) => q.uid)).toEqual(['u:adam+eva']);
    const q = ds[0];
    expect(q.open).toBe(false);
    // Ева и трое сыновей не на небе
    expect(q.hidden).toBe(4);
    const a = at(f, 'adam');
    const laneOf = (id: string) => atlas.models[0].nodeByPerson.get(id)?.lane;
    const side = plates.hangSide(U('u:adam+eva'), laneOf('adam')!, laneOf);
    // у строки Адама со стороны детей: не на строке его подписи, но не дальше строки
    expect(Math.sign(a.y - q.y)).toBe(side);
    expect(Math.abs(q.y - a.y)).toBeGreaterThanOrEqual(plates.DOT_HANG.min - 0.5);
    expect(Math.abs(q.y - a.y)).toBeLessThanOrEqual(plates.DOT_HANG.max + 7);
    expect(q.x).toBeGreaterThan(a.x + 5);
    // поле попадания — вокруг ромба и «+4»
    const hit = parse(f.data.plates ?? '')[0];
    expect(q.x).toBeGreaterThan(hit.x);
    expect(q.x).toBeLessThan(hit.x + hit.w);
    expect(q.y).toBeGreaterThan(hit.y);
    expect(q.y).toBeLessThan(hit.y + hit.h);
    expect(f.texts.some((t) => t.t === '+4')).toBe(true);
    // у точки нет подписи: имена союза — в подсказке и карточке у точки
    expect(f.texts.some((t) => t.t === 'Адам и Ева')).toBe(false);
    expect(f.texts.some((t) => /жена; 3 сына/.test(t.t))).toBe(false);
    // скобка от Адама к точке есть, линий к детям нет — детей нет на небе
    expect((f.data.unionLines ?? '').split(';')).toEqual(['u:adam+eva=adam']);
  });

  it('раскрытый союз: залитая точка между строками Адама и Евы, правее их звёзд и левее первого ребёнка; линии к Адаму, Еве и каждому сыну — своим цветом', () => {
    reveal.expandUnion('u:adam+eva', 'adam');
    const ids = [...work.workSet.value.keys()];
    expect(ids.sort()).toEqual(['adam', 'avel', 'eva', 'kain', 'sif']);
    const f = frame(ids, { plates: reveal.plates.value, at: 'adam', years: 400 });
    const q = dots(f.data.dots ?? '').find((x) => x.uid === 'u:adam+eva')!;
    expect(q.open).toBe(true);
    expect(q.hidden).toBe(0);
    const a = at(f, 'adam');
    const e = at(f, 'eva');
    // по высоте — между строками мужа и жены
    expect(q.y).toBeGreaterThan(Math.min(a.y, e.y) + 4);
    expect(q.y).toBeLessThan(Math.max(a.y, e.y) - 4);
    // по времени — правее звёзд супругов и левее звезды первого ребёнка
    const kids = ['kain', 'avel', 'sif'].map((id) => at(f, id));
    expect(q.x).toBeGreaterThan(Math.max(a.x, e.x) + plates.DOT_CLEAR - 1);
    expect(q.x).toBeLessThan(Math.min(...kids.map((k) => k.x)) - plates.DOT_CLEAR + 1);
    // линии: скобки от обоих супругов, к каждому сыну — своя, у каждого свой цвет (ветвь у отца)
    const lines = (f.data.unionLines ?? '').split(';');
    expect(lines).toContain('u:adam+eva=adam');
    expect(lines).toContain('u:adam+eva=eva');
    const kidLines = lines.filter((l) => l.includes('>'));
    expect(kidLines.map((l) => l.split('>')[1].split(':')[0]).sort()).toEqual(['avel', 'kain', 'sif']);
    const colors = kidLines.map((l) => l.split(':').pop());
    expect(new Set(colors).size).toBe(3);
    for (const l of kidLines) {
      const kid = l.split('>')[1].split(':')[0];
      expect(l.split(':').pop()).toBe(plates.kidColor(U('u:adam+eva'), kid, 'day'));
    }
    // подписи и точки не накладываются; все лица набора подписаны; звёзды — не под полем точки
    expect(f.s.labelStats().overlaps).toBe(0);
    expect(f.data.unnamed).toBe('');
    const hit = parse(f.data.plates ?? '').find((x) => x.uid === 'u:adam+eva')!;
    for (const id of ids) {
      const s = at(f, id);
      expect(cross({ x: s.x - 2, y: s.y - 2, w: 4, h: 4 }, hit), id).toBe(false);
    }
  });

  it('Авраам: три союза с детьми — три точки, поля не накладываются друг на друга и на подписи', () => {
    reveal.openPerson('avraam');
    const set = ['avraam', 'sarra', 'isaak', 'agar', 'izmail', 'farra'];
    work.workSet.value = new Map(set.map((id) => [id, { via: 'self', of: id }]));
    reveal.opened.value = ['avraam'];
    const f = frame(set, { plates: reveal.plates.value, at: 'avraam', years: 260 });
    const ps = parse(f.data.plates ?? '');
    for (const uid of ['u:avraam+sarra', 'u:avraam+agar', 'u:avraam+khettura']) expect(ps.map((q) => q.uid)).toContain(uid);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(cross(ps[i], ps[j])).toBe(false);
    expect(f.s.labelStats().overlaps).toBe(0);
    // Сарра и Агарь на небе: их союзы с Авраамом — точки между строками, со скобками от обоих
    const lines = (f.data.unionLines ?? '').split(';');
    for (const l of ['u:avraam+sarra=avraam', 'u:avraam+sarra=sarra', 'u:avraam+agar=agar', 'u:avraam+sarra>isaak', 'u:avraam+agar>izmail'])
      expect(lines.some((x) => x.startsWith(l))).toBe(true);
  });

  it('«+» после подписи лица с нераскрытыми союзами — знак reveal, щелчок показывает союзы', () => {
    const f = frame(['avraam', 'isaak'], { reveal: new Set(['isaak']), at: 'isaak', years: 260 });
    expect(f.s.foldHits.some((h) => h.kind === 'reveal' && h.id === 'isaak')).toBe(true);
    expect(f.s.foldHits.some((h) => h.kind === 'reveal' && h.id === 'avraam')).toBe(false);
  });

  it('в небе «все лица» точек и линий союзов нет', () => {
    const rec = recording();
    const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
    const s = new sky.Sky(canvas);
    s.resize(1440, 776, 1);
    s.setModel(atlas.models[0], 1);
    s.fitAll();
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS, onlyLines: false, meridian: null,
      tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], plates: reveal.plates.value,
    } as Parameters<Sky['draw']>[0]);
    expect(s.plateHits).toEqual([]);
    const d = (canvas as unknown as { dataset: Record<string, string> }).dataset;
    expect(d.dots ?? '').toBe('');
    expect(d.unionLines ?? '').toBe('');
  });
});

describe('какой союз раскрыли или свернули (камера держит картуш, решение 70)', () => {
  it('раскрыт — добавленный; свёрнут — убранный, чьё лицо осталось в наборе', () => {
    expect(view.unionFlip({}, { 'u:adam+eva': 'adam' }, new Set(['adam']))).toEqual({ uid: 'u:adam+eva', from: 'adam', open: true });
    // свёртка союза Адама и Евы убрала и союз Сифа (раскрыт от Сифа, Сифа больше нет в наборе)
    expect(view.unionFlip({ 'u:adam+eva': 'adam', 'u:sif+': 'sif' }, {}, new Set(['adam']))).toEqual({ uid: 'u:adam+eva', from: 'adam', open: false });
    expect(view.unionFlip({ a: 'x' }, { a: 'x' }, new Set(['x']))).toBeNull();
  });
});
