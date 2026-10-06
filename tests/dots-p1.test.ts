/**
 * Союз на небе «набор» — точка с линиями (решение владельца 76; задача P1): год и место точки, цвет и начертание линий
 * к детям, без прежних отводов и знаков брака у детей и супругов с точкой, подсветка ветвей выбранного, поле попадания,
 * образец условных знаков, небо «все лица» — без перемен.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Холст, который записывает вызовы (имя и округлённые числа); ширина текста — 6 px на знак. */
function recording() {
  const calls: string[] = [];
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      return (...args: unknown[]) => {
        calls.push(`${String(k)}(${args.map((a) => (typeof a === 'number' ? Math.round(a * 10) / 10 : typeof a === 'string' ? a : '')).join(',')})`);
        if (k === 'fillText') texts.push(args[0] as string);
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      calls.push(`${String(k)}=${typeof v === 'number' ? Math.round(v * 100) / 100 : String(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

let sky: typeof import('../src/render/sky.ts');
let plates: typeof import('../src/render/plates.ts');
let atlas: typeof import('../src/data/atlas.ts');
let reveal: typeof import('../src/ui/reveal.ts');
let work: typeof import('../src/ui/work.ts');
let marks: typeof import('../src/render/marks.ts');
let trails: typeof import('../src/render/trails.ts');
let branches: typeof import('../src/render/branches.ts');
let links: typeof import('../src/render/links.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
type PlateIn = import('../src/render/plates.ts').PlateIn;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  plates = await import('../src/render/plates.ts');
  atlas = await import('../src/data/atlas.ts');
  reveal = await import('../src/ui/reveal.ts');
  work = await import('../src/ui/work.ts');
  marks = await import('../src/render/marks.ts');
  trails = await import('../src/render/trails.ts');
  branches = await import('../src/render/branches.ts');
  links = await import('../src/render/links.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const U = (id: string) => reveal.unions.byId.get(id)!;
const M = () => atlas.models[0];

/** Кадр неба: режим, набор, союзы, окно years лет вокруг лица at, выбранное лицо с выделением рода. */
function frame(o: { mode?: 'work' | 'all'; ids?: string[]; plates?: readonly PlateIn[] | null; at?: string; years?: number; selected?: string; w?: number; h?: number; revealUp?: string[] }) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  const m = M();
  s.setModel(m, 1);
  s.fitAll();
  s.setView({ mode: o.mode ?? 'work', set: new Set(o.ids ?? []), foldDesc: [], foldGroups: [], plates: o.plates ?? [] });
  s.fitAll();
  if (o.at) {
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
    reserve: [], plates: o.plates ?? null, plateMarks: {}, reveal: null, revealUp: o.revealUp ? new Set(o.revealUp) : null,
  } as Parameters<Sky['draw']>[0];
  s.draw(state);
  rec.calls.length = 0;
  rec.texts.length = 0;
  s.draw(state);
  return { s, calls: rec.calls, texts: rec.texts, data: (canvas as unknown as { dataset: Record<string, string> }).dataset };
}
const kidLines = (d: Record<string, string>) =>
  new Map(
    (d.unionLines ?? '')
      .split(';')
      .filter((l) => l.includes('>'))
      .map((l) => [l.split('>')[1].split(':')[0], l.split(':').pop()!] as const),
  );

describe('год и место точки союза (решение 76)', () => {
  it('через четверть пути от рождения младшего супруга до рождения первого ребёнка', () => {
    const m = M();
    const u = U('u:adam+eva');
    const young = Math.max(m.nodeByPerson.get('adam')!.t0, m.nodeByPerson.get('eva')!.t0);
    const first = plates.firstBirth(m, u)!;
    expect(plates.dotTime(m, u)).toBeCloseTo(young + plates.DOT_AT * (first - young), 6);
    expect(plates.DOT_AT).toBe(0.25);
    // Авраам и Агарь: Агарь моложе Авраама — от её рождения до рождения Измаила
    const h = U('u:avraam+agar');
    const hy = Math.max(m.nodeByPerson.get('avraam')!.t0, m.nodeByPerson.get('agar')!.t0);
    expect(plates.dotTime(m, h)).toBeCloseTo(hy + 0.25 * (m.nodeByPerson.get('izmail')!.t0 - hy), 6);
  });
  it('брак без детей (Давид и Мелхола) — правее рождения младшего супруга, в пределах шестидесяти лет', () => {
    const m = M();
    const u = U('u:david+melkhola');
    expect(u.kids.length).toBe(0);
    const young = Math.max(m.nodeByPerson.get('david')!.t0, m.nodeByPerson.get('melkhola')!.t0);
    const t = plates.dotTime(m, u)!;
    expect(t).toBeGreaterThan(young);
    expect(t).toBeLessThanOrEqual(young + 15);
  });
  // этап 21, решение 197: нераскрытого ромба союза родителей у лица больше нет (прежде — полый ромб левее звезды на строке
  // ребёнка, решение 78, Г2–Г4). Шаг назад — рукоятка «+» в кольце слева от звезды, на её строке или строкой выше или ниже
  // (лента линий Мессии входит в звезду слева); раскрытый союз родителей — ромбом, как прежде
  it('союз родителей лица, которых нет на небе: ромба нет, слева от звезды — рукоятка шага назад', () => {
    reveal.startWith('jesus');
    expect(reveal.plates.value.some((q) => q.dir === 'up')).toBe(false);
    const f = frame({ ids: ['iisus'], plates: reveal.plates.value, at: 'iisus', years: 160, revealUp: ['iisus'] });
    expect((f.data.dots ?? '').split(';').filter(Boolean)).toEqual([]);
    const h = (f.data.handles ?? '').split(';').filter(Boolean);
    expect(h.length).toBe(1);
    const [id, dir, xy] = h[0].split(':');
    expect(id).toBe('iisus');
    expect(dir).toBe('back');
    const [x, y] = xy.split(',').map(Number);
    const i = f.s.indexOf('iisus')!;
    const jx = f.s.cam.sx(f.s.X0[i]);
    const jy = f.s.starY(i);
    expect(x).toBeLessThan(jx);
    expect(jx - x).toBeLessThan(40);
    expect(Math.abs(jy - y)).toBeLessThanOrEqual(20);
    // линия к Иисусу Христу от раскрытого союза — штрихом: Иосиф — отец по закону (Мф 1:16)
    expect(plates.kidDash(U('u:iosif-muzh-marii+mariya')).length).toBeGreaterThan(0);
  });
});

describe('линии к детям: цвет ветви, начертание (решения 69, 76)', () => {
  it('у отца с одним союзом — цвет по детям: у Адама три сына — три цвета', () => {
    const u = U('u:adam+eva');
    const cs = u.kids.map((k) => plates.kidColor(u, k, 'night'));
    expect(new Set(cs).size).toBe(u.kids.length);
    for (const c of cs) expect(branches.BRANCH_COLORS.night).toContain(c);
  });
  it('у отца с несколькими союзами — цвет по союзам, как ветви у выбранного Иакова: дети Лии — одного цвета, дети Рахили — другого', () => {
    const leah = U('u:iakov+liya');
    const rachel = U('u:iakov+rakhil');
    const l = new Set(leah.kids.map((k) => plates.kidBranch(leah, k)));
    const r = new Set(rachel.kids.map((k) => plates.kidBranch(rachel, k)));
    expect(l.size).toBe(1);
    expect(r.size).toBe(1);
    expect([...l][0]).not.toBe([...r][0]);
  });
  it('происхождение иного рода — штрихом, обычное — сплошной; по толкованию — редкими точками', () => {
    expect(plates.kidDash(U('u:iakov+liya'))).toEqual([]);
    expect(plates.kidDash(U('u:iakov+~adoptive')).length).toBe(2);
    const interp = [...reveal.unions.byId.values()].find((u) => u.kidsCert === 'interpretation');
    if (interp) expect(plates.kidDash(interp)[0]).toBeLessThan(2);
  });
  // этап 11 (решение 84, § 9): цвет ветви — только у рода выбранного лица; у невыбранных союзов цвета нет. К Сифу и Еносу
  // ведёт лента (Г1: одна связь — одна линия), зубцы — к Каину и Авелю
  it('выбрано лицо — зубцы к его потомкам цветом его ветвей; без выбора зубцы — тоном текста', () => {
    reveal.startWith('adam');
    const ids = ['adam', 'eva', 'kain', 'avel', 'sif', 'enos'];
    const pls: PlateIn[] = [
      { union: U('u:adam+eva'), from: 'adam', dir: 'down', open: true },
      { union: U('u:sif+'), from: 'sif', dir: 'down', open: true },
    ];
    const none = kidLines(frame({ ids, plates: pls, at: 'adam', years: 500 }).data);
    const sel = kidLines(frame({ ids, plates: pls, at: 'adam', years: 500, selected: 'adam' }).data);
    for (const k of ['kain', 'avel']) {
      expect(none.get(k), k).toBe('');
      expect(sel.get(k), k).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // у Каина и Авеля — разные ветви Адама (решение 69)
    expect(sel.get('kain')).not.toBe(sel.get('avel'));
    // к Сифу и Еносу — только лента
    expect(none.has('sif')).toBe(false);
    expect(none.has('enos')).toBe(false);
  });
});

describe('связь не дублируется (решение 76)', () => {
  beforeEach(() => reveal.startWith('adam'));
  // этап 11 (решение 78): связь «союз → ребёнок» рисует один путь — зубец от ствола союза (src/render/links.ts), есть ли
  // карточка союза в состоянии или нет; прежних отводов и гребёнок нет нигде
  it('у детей союза — по одному зубцу от ствола союза; прежних отводов и гребёнок нет', () => {
    const ids = ['adam', 'eva', 'kain', 'avel', 'sif'];
    const pl: PlateIn = { union: U('u:adam+eva'), from: 'adam', dir: 'down', open: true };
    for (const plates0 of [[pl], []]) {
      const f = frame({ ids, plates: plates0, at: 'adam', years: 400 });
      expect(trails.familyCombs(f.s).filter((c) => c.parent === 'adam')).toEqual([]);
      const lines = (f.data.unionLines ?? '').split(';');
      for (const k of ['kain', 'avel']) expect(lines.filter((l) => l.startsWith(`u:adam+eva>${k}:`)).length, k).toBe(1);
    }
  });
  // этап 11 (Г4): от мужа к ромбу на следе жены — черта брака «‖» (путь связи «супруг → союз»), прежнего знака «‖»
  // в замере подписей и скобок к точке нет
  it('у супругов — черта брака от мужа к ромбу на следе жены; прежнего знака «‖» и скобок нет', () => {
    const ids = ['iakov', 'liya', 'ruvim', 'simeon', 'leviy', 'iuda', 'issakhar', 'zavulon', 'dina'];
    const pl: PlateIn = { union: U('u:iakov+liya'), from: 'iakov', dir: 'down', open: true };
    const bars = (f: ReturnType<typeof frame>) => f.s.ledger.boxes.filter((b) => b.kind === 'mark' && b.text === '‖').map((b) => b.id);
    for (const plates0 of [[pl], []]) {
      const f = frame({ ids, plates: plates0, at: 'iakov', years: 200 });
      expect(bars(f)).toEqual([]);
      const lines = (f.data.unionLines ?? '').split(';');
      expect(lines.some((l) => l.startsWith('u:iakov+liya>'))).toBe(true);
      expect(lines).not.toContain('u:iakov+liya=liya');
    }
  });
});

describe('точка в кадре: поле попадания, состояние, подписи (решение 76)', () => {
  beforeEach(() => reveal.startWith('adam'));
  // этап 11 (Я31): поле ромба — не меньше 24 × 24 (было 18 × 18)
  it('поле попадания — вокруг ромба, не меньше 24 × 24; центр ромба — внутри', () => {
    const f = frame({ ids: ['adam'], plates: reveal.plates.value, at: 'adam', years: 400 });
    const h = f.s.plateHits[0];
    expect(h.uid).toBe('u:adam+eva');
    expect(h.from).toBe('adam');
    expect(h.w).toBeGreaterThanOrEqual(24);
    expect(h.h).toBeGreaterThanOrEqual(24);
    expect(h.cx).toBeGreaterThan(h.x);
    expect(h.cx).toBeLessThan(h.x + h.w);
    expect(h.cy).toBeGreaterThan(h.y);
    expect(h.cy).toBeLessThan(h.y + h.h);
    expect([h.ax, h.ay]).toEqual([h.cx, h.cy]);
    // ромб раскрытого неба — 9 px (§ 2, «Знаки»)
    expect(h.r).toBe(links.NODE_R_FAMILY);
  });
  it('выбранный Адам: подпись Адама встаёт и не ложится на точку; наложений нет', () => {
    const f = frame({ ids: ['adam'], plates: reveal.plates.value, at: 'adam', years: 400, selected: 'adam' });
    const lab = f.s.ledger.boxes.find((b) => b.kind === 'star' && b.id === 'adam');
    const dot = f.s.ledger.boxes.find((b) => b.kind === 'plate' && b.id === 'u:adam+eva');
    expect(lab).toBeTruthy();
    expect(dot).toBeTruthy();
    expect(f.s.labelStats().overlaps).toBe(0);
  });
  it('ромб: раскрытый залит, свёрнутый — контур; наведённый — ярче', () => {
    const rec = recording();
    plates.paintDot(rec.ctx, 50, 50, 4.5, { open: true, color: 'rgba(1,2,3,1)', halo: '#000' });
    expect(rec.calls.filter((c) => c.startsWith('fill(')).length).toBe(2);
    expect(rec.calls.some((c) => c.startsWith('stroke('))).toBe(false);
    const rec2 = recording();
    plates.paintDot(rec2.ctx, 50, 50, 4.5, { open: false, color: 'rgba(1,2,3,1)', halo: '#000' });
    expect(rec2.calls.filter((c) => c.startsWith('fill(')).length).toBe(1);
    expect(rec2.calls.some((c) => c.startsWith('stroke('))).toBe(true);
    expect(plates.DOT_TONE).toBeLessThan(1);
  });
});

describe('образец условных знаков и небо «все лица»', () => {
  it('образец: раскрытый ромб со скобками и тремя линиями цветов ветвей, свёрнутый правее — с «+4»', () => {
    const rec = recording();
    const pal = { glow: true, sky: '#0d1b34', ink: '#e8eef7', ink2: '#a9b8cf' };
    const at = plates.drawUnionSample(rec.ctx, pal, 460, 64);
    expect(at.closed.x).toBeGreaterThan(at.open.x + 100);
    for (const k of [0, 1, 2]) expect(rec.calls).toContain(`strokeStyle=${branches.branchColor(k, 'night')}`);
    expect(rec.texts).toContain('+4');
    expect(rec.calls.filter((c) => c.startsWith('bezierCurveTo(')).length).toBeGreaterThanOrEqual(3);
  });
  it('небо «все лица» рисуется точно так же, есть союзы в состоянии или нет', () => {
    reveal.startWith('adam');
    reveal.expandUnion('u:adam+eva', 'adam');
    const pls = reveal.plates.value;
    expect(pls.length).toBeGreaterThan(0);
    const a = frame({ mode: 'all', ids: [...work.workSet.value.keys()], plates: pls, at: 'adam', years: 400, selected: 'adam' });
    const b = frame({ mode: 'all', ids: [...work.workSet.value.keys()], plates: null, at: 'adam', years: 400, selected: 'adam' });
    expect(a.calls.length).toBeGreaterThan(1000);
    expect(a.calls).toEqual(b.calls);
    // этап 11 (решение 78): ромбы союзов — часть грамматики и на «всех лицах» (7 px), те же с союзами в состоянии и без
    expect(a.s.plateHits).toEqual(b.s.plateHits);
    expect(a.s.plateHits.every((h) => h.r === links.NODE_R_MAP)).toBe(true);
  });
});
