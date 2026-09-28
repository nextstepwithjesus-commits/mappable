/**
 * Небо по рабочему набору и свёртка на холсте (J4, J5): в режиме «Всё небо» без свёрнутого кадр тот же до вызова
 * (небо не меняется ни на пиксель); в режиме «В работе» нарисованы и подписаны только лица набора, без наложений;
 * знак «+N» у свёрнутых потомков; попадание указателем и «Всё небо» — по сжатым строкам.
 */
import { beforeAll, describe, expect, it } from 'vitest';

/** Холст, который записывает каждый вызов и каждое присваивание по порядку; ширина текста — 6 px на знак. */
function recording() {
  const log: string[] = [];
  const texts: { t: string; x: number; y: number }[] = [];
  const fmt = (a: unknown) => (typeof a === 'number' ? a.toFixed(3) : typeof a === 'object' ? '[obj]' : String(a));
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      return (...args: unknown[]) => {
        log.push(`${String(k)}(${args.map(fmt).join(',')})`);
        if (k === 'fillText') texts.push({ t: args[0] as string, x: args[1] as number, y: args[2] as number });
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      log.push(`${String(k)}=${fmt(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, texts };
}

let sky: typeof import('../src/render/sky.ts');
let models: typeof import('../src/data/atlas.ts').models;
let work: typeof import('../src/ui/work.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  ({ models } = await import('../src/data/atlas.ts'));
  work = await import('../src/ui/work.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
type View = import('../src/render/rows.ts').SkyView;

function frame(o: { view?: View; fit?: boolean; move?: (s: Sky) => void; w?: number; h?: number; state?: Record<string, unknown> } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(models[0], 1);
  s.fitAll();
  if (o.view) s.setView(o.view);
  if (o.fit) s.fitAll();
  o.move?.(s);
  const state = {
    model: models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    ...(o.state ?? {}),
  } as Parameters<Sky['draw']>[0];
  s.draw(state);
  rec.log.length = 0;
  rec.texts.length = 0;
  s.draw(state);
  return { s, log: rec.log, texts: rec.texts, data: (canvas as unknown as { dataset: Record<string, string> }).dataset };
}

/** Окно в years лет вокруг лица, лицо — в середине видимой части. */
const around = (id: string, years: number) => (s: Sky) => {
  const x = s.nodeX(id)!;
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l) / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
  s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(s.node(id)!.lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};

describe('«Всё небо» без свёрнутого — тот же кадр (J4, J5)', () => {
  for (const [name, move] of [['всё небо', undefined], ['Давид, 180 лет', around('david', 180)]] as const)
    it(`${name}: набор в режиме «все лица» не меняет ни одного вызова холста`, () => {
      const a = frame({ move });
      const b = frame({ move, view: { mode: 'all', set: new Set(['david', 'ruf', 'adam']), foldDesc: [], foldGroups: [] } });
      expect(b.s.cam.rows.identity).toBe(true);
      expect(b.log.length).toBe(a.log.length);
      expect(b.log).toEqual(a.log);
    });
});

describe('небо «В работе» (J4)', () => {
  const set = () => new Set(work.scopeIds('david', { kind: 'family' }).map((x) => x.id).concat(work.scopeIds('david', { kind: 'anc', gen: 3 }).map((x) => x.id)));
  it('рисуются и подписаны только лица набора; наложений подписей нет; «Всё небо» вписывает набор', () => {
    const ids = set();
    const { s, data } = frame({ view: { mode: 'work', set: ids, foldDesc: [], foldGroups: [] }, fit: true });
    expect(data.mode).toBe('work');
    const st = s.labelStats();
    expect(st.overlaps, st.pairs.map(([a, b]) => `${st.boxes[a].text} / ${st.boxes[b].text}`).join('; ')).toBe(0);
    const named = st.boxes.filter((b) => b.kind === 'star').map((b) => b.id!);
    expect(named.every((id) => ids.has(id))).toBe(true);
    // все лица набора подписаны
    expect(data.named).toBe(`${ids.size}/${ids.size}`);
    // строк — не больше, чем лиц набора (с зазорами), и все они в видимой части
    const rows = s.cam.rows.max - s.cam.rows.min;
    expect(rows).toBeLessThan(ids.size * 1.7);
    const vp = s.cam.vp;
    for (const id of ids) {
      const i = s.indexOf(id)!;
      const y = s.cam.sy(s.nodes[i].lane);
      const x = s.cam.sx(s.X0[i]);
      expect(y, id).toBeGreaterThanOrEqual(vp.t);
      expect(y, id).toBeLessThanOrEqual(vp.b);
      expect(x, id).toBeGreaterThanOrEqual(vp.l);
      expect(x, id).toBeLessThanOrEqual(vp.r);
    }
    expect(s.atFit()).toBe(true);
  });
  it('лица вне набора не ловят указатель; лица набора ловятся по сжатым строкам', () => {
    const ids = set();
    const { s } = frame({ view: { mode: 'work', set: ids, foldDesc: [], foldGroups: [] }, fit: true });
    const i = s.indexOf('solomon')!;
    expect(s.hit(s.cam.sx(s.X0[i]), s.cam.sy(s.nodes[i].lane))).toBe('solomon');
    expect(s.reachable('rovoam')).toBe(false);
    expect(s.hides('rovoam')).toBe(true);
    // звезда вне набора, но в тех же годах — нигде на небе не ловится
    let caught = false;
    for (let y = s.cam.vp.t; y < s.cam.vp.b; y += 9)
      for (let x = s.cam.vp.l; x < s.cam.vp.r; x += 24) {
        const h = s.hit(x, y);
        if (h && !ids.has(h)) caught = true;
      }
    expect(caught).toBe(false);
  });
});

describe('свёртка на небе (J5)', () => {
  it('знак «+N» — сразу после подписи Давида, а не у конца следа (UX-60, MAP-63); потомки не рисуются и не ловятся', () => {
    const { s, texts, data } = frame({ view: { mode: 'all', set: new Set(), foldDesc: ['david'], foldGroups: [] }, move: around('david', 180) });
    const mark = s.plan.marks.find((m) => m.id === 'david')!;
    expect(texts.some((t) => t.t === `+${mark.count}`)).toBe(true);
    expect(data.folds).toContain(`desc:david:${mark.count}`);
    const hit = s.foldHits.find((h) => h.id === 'david' && h.kind === 'desc' && h.y > sky.FRAME_H)!;
    expect(hit).toBeTruthy();
    // знак — в прямоугольнике подписи Давида, у её правого края
    const label = s.labelStats().boxes.find((b) => b.kind === 'star' && b.id === 'david')!;
    expect(label).toBeTruthy();
    expect(hit.x).toBeGreaterThan(label.x);
    expect(hit.x + hit.w).toBeLessThanOrEqual(label.x + label.w + 3);
    expect(Math.abs(hit.y + hit.h / 2 - (label.y + label.h / 2))).toBeLessThan(2);
    // и не дальше 200 px от звезды (прежде «+62» стоял у конца следа, в ≈ 750 px)
    const i = s.indexOf('david')!;
    expect(Math.abs(hit.x - s.cam.sx(s.X0[i]))).toBeLessThan(200);
    // служебная строка рамки: «Свёрнуто: потомки Давида (62) — развернуть»
    expect(texts.some((t) => t.t === `потомки Давида (${mark.count})`)).toBe(true);
    expect(s.foldHits.some((h) => h.kind === 'all' && h.y < sky.FRAME_H)).toBe(true);
    expect(s.reachable('avessalom')).toBe(false);
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('у названий созвездий на небе — их созвездие: по нему открывается меню «Свернуть созвездие»', () => {
    const { s } = frame({ move: around('isav', 700) });
    expect(s.groupHits.length).toBeGreaterThan(0);
    const names = s.labelStats().boxes.filter((b) => b.kind === 'group');
    for (const h of s.groupHits) expect(names.some((b) => b.x === h.x && b.y === h.y && b.text === sky.groupName(h.group))).toBe(true);
  });
  it('свёрнутое созвездие — строка-подпись «НАЗВАНИЕ +N»', () => {
    const { s, texts } = frame({ view: { mode: 'all', set: new Set(), foldDesc: [], foldGroups: ['edomites'] }, move: around('isav', 400) });
    const mark = s.plan.marks.find((m) => m.id === 'edomites')!;
    expect(texts.some((t) => t.t === `+${mark.count}`)).toBe(true);
    expect(texts.some((t) => /ЕДОМ/.test(t.t))).toBe(true);
    expect(s.reachable('elifaz')).toBe(false);
  });
});
