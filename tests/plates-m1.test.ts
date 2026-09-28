/**
 * Раскрытие на небе и карточки союзов на небе (решения владельца 67, 70, 72; задача M1): текст картуша, место под картуши
 * в строках неба «набор», картуши на холсте — у корня гребёнки детей, без наложений на подписи и звёзды; «+» у лица
 * с нераскрытыми союзами; какой союз раскрыли или свернули; подсказка и объявление со склонением.
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

/** Небо «набор» с набором ids и картушами союзов: окно years лет вокруг лица at. */
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

describe('текст картуша (решения 67, 70)', () => {
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

describe('место под картуши в строках неба «набор» (решение 70)', () => {
  const data = () => {
    const m = atlas.models[0];
    return {
      graph: atlas.graph, nodes: m.nodes, laneMin: m.laneMin, laneMax: m.laneMax, t0: (i: number) => m.nodes[i].t0, groupOf: (id: string) => atlas.byId.get(id)?.group,
      parentGroup: (g: string) => atlas.groupById.get(g)?.parent, cluster: (b: number) => !!m.blocks[b]?.cluster,
    };
  };
  const lane = (id: string) => atlas.models[0].nodeByPerson.get(id)!.lane;
  it('между родителем и соседней полосой ребёнка — PLATE_ROWS строки, звёзды на середине своих строк', () => {
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
  it('без картушей — прежнее отображение; в небе «все лица» места нет', () => {
    const set = new Set(['david', 'solomon']);
    const a = rows.planSky(data(), { mode: 'work', set, foldDesc: [], foldGroups: [] });
    const b = rows.planSky(data(), { mode: 'work', set, foldDesc: [], foldGroups: [], gaps: [] });
    expect(b.rows.key).toBe(a.rows.key);
    const all = rows.planSky(data(), { mode: 'all', set, foldDesc: [], foldGroups: [], gaps: [{ lane: lane('david'), dir: 1 }] });
    expect(all.rows.identity).toBe(true);
  });
  it('plateGaps: со стороны детей; у лица без родителей на небе — над ним; у лица с тремя союзами — с обеих сторон', () => {
    const shown = (s: Set<string>) => (id: string) => s.has(id);
    const laneOf = (id: string) => atlas.models[0].nodeByPerson.get(id)?.lane;
    const adam: import('../src/render/plates.ts').PlateIn = { union: U('u:adam+eva'), from: 'adam', dir: 'down', open: false };
    const side = plates.hangSide(U('u:adam+eva'), lane('adam'), laneOf);
    expect(plates.plateGaps([adam], laneOf, shown(new Set(['adam'])))).toEqual([{ lane: lane('adam'), dir: side }]);
    const up: import('../src/render/plates.ts').PlateIn = { union: U('u:iosif-muzh-marii+mariya'), from: 'iisus', dir: 'up', open: false };
    expect(plates.plateGaps([up], laneOf, shown(new Set(['iisus'])))).toEqual([{ lane: lane('iisus'), dir: 1 }]);
    // раскрыт вверх: родители на небе — картуш у следа отца
    expect(plates.plateAnchor({ ...up, open: true }, shown(new Set(['iisus', 'iosif-muzh-marii', 'mariya'])))).toEqual({ at: 'iosif-muzh-marii', kind: 'trail' });
    const three = reveal.unionsOf('avraam').filter((u) => u.kids.length).map((u) => ({ union: u, from: 'avraam', dir: 'down' as const, open: false }));
    const g = plates.plateGaps(three, laneOf, shown(new Set(['avraam'])));
    expect(g.filter((x) => x.lane === lane('avraam')).map((x) => x.dir).sort()).toEqual([-1, 1]);
  });
});

describe('картуши на холсте (решение 70)', () => {
  beforeEach(() => reveal.startWith('adam'));
  const parse = (d: string) =>
    d
      .split(';')
      .filter(Boolean)
      .map((q) => {
        const m = /^(u:.*):([01]):(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(q)!;
        return { uid: m[1], open: m[2] === '1', x: +m[3], y: +m[4], w: +m[5], h: +m[6] };
      });

  it('С Адама: картуш «Адам и Ева» на следе Адама в год рождения первого ребёнка, с «+»; рамка без скругления', () => {
    const f = frame(['adam'], { plates: reveal.plates.value, at: 'adam', years: 400 });
    const ps = parse(f.data.plates ?? '');
    expect(ps.map((q) => q.uid)).toEqual(['u:adam+eva']);
    const q = ps[0];
    const ax = f.s.cam.sx(f.s.xOf(plates.firstBirth(atlas.models[0], U('u:adam+eva'))!));
    const ay = f.s.cam.sy(atlas.models[0].nodeByPerson.get('adam')!.lane);
    // у отвода или со сдвигом вдоль следа
    expect(Math.abs(q.x + plates.PLATE_PAD.lead - ax) % (q.w + 8)).toBeLessThan(2);
    expect(Math.min(Math.abs(q.y - ay), Math.abs(q.y + q.h - ay))).toBeLessThanOrEqual(plates.PLATE_PAD.gap + 1);
    expect(f.texts.some((t) => t.t === '+')).toBe(true);
    expect(f.texts.some((t) => t.t === 'Адам и Ева')).toBe(true);
    expect(f.texts.some((t) => t.t === 'жена; 3 сына, выв.')).toBe(true);
    // рамка — прямоугольник (strokeRect), скругления нет
    expect(f.rects.length).toBeGreaterThan(0);
  });

  it('раскрытый союз: знак «−», картуш у корня гребёнки детей; подписи и звёзды не закрыты', () => {
    reveal.expandUnion('u:adam+eva', 'adam');
    const ids = [...work.workSet.value.keys()];
    expect(ids.sort()).toEqual(['adam', 'avel', 'eva', 'kain', 'sif']);
    const f = frame(ids, { plates: reveal.plates.value, at: 'adam', years: 400 });
    const q = parse(f.data.plates ?? '').find((x) => x.uid === 'u:adam+eva')!;
    expect(q.open).toBe(true);
    expect(f.texts.some((t) => t.t === '−')).toBe(true);
    const st = f.s.labelStats();
    expect(st.overlaps).toBe(0);
    // звёзды набора — не под картушем
    for (const id of ids) {
      const i = f.s.indexOf(id)!;
      const x = f.s.cam.sx(f.s.X0[i]);
      const y = f.s.cam.sy(f.s.nodes[i].lane);
      expect(cross({ x: x - 2, y: y - 2, w: 4, h: 4 }, q), id).toBe(false);
    }
    // все лица набора подписаны: картуши ложатся после подписей
    expect(f.data.unnamed).toBe('');
  });

  it('Авраам: три союза с детьми — три картуша, без наложений', () => {
    reveal.openPerson('avraam');
    const set = ['avraam', 'sarra', 'isaak', 'agar', 'izmail', 'farra'];
    work.workSet.value = new Map(set.map((id) => [id, { via: 'self', of: id }]));
    reveal.opened.value = ['avraam'];
    const f = frame(set, { plates: reveal.plates.value, at: 'avraam', years: 260 });
    const ps = parse(f.data.plates ?? '');
    for (const uid of ['u:avraam+sarra', 'u:avraam+agar', 'u:avraam+khettura']) expect(ps.map((q) => q.uid)).toContain(uid);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(cross(ps[i], ps[j])).toBe(false);
    expect(f.s.labelStats().overlaps).toBe(0);
  });

  it('«+» после подписи лица с нераскрытыми союзами — знак reveal, щелчок показывает союзы', () => {
    const f = frame(['avraam', 'isaak'], { reveal: new Set(['isaak']), at: 'isaak', years: 260 });
    expect(f.s.foldHits.some((h) => h.kind === 'reveal' && h.id === 'isaak')).toBe(true);
    expect(f.s.foldHits.some((h) => h.kind === 'reveal' && h.id === 'avraam')).toBe(false);
  });

  it('в небе «все лица» картушей нет', () => {
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
