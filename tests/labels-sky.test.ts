/**
 * Подписи неба (этап 4, E1, E2, E3; MAP-05…11, 21; UX-33; MOB-01, 02): одна проверка наложений на всё, что пишется
 * на небе, — в каждом кадре, на обзоре и трёх масштабах (эпоха, поколения, семья), на 1440 и 390, с выбранным лицом
 * и без; на масштабе семьи подписано не меньше 90 % видимых звёзд; семья выбранного подписана; подписи не срезаются
 * кромкой; звёзды за краем не подписываются; «липкие» имена следов; обзор — только звёзды величины 0–2; скопления.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Text = { t: string; x: number; y: number };
/** Холст, который записывает надписи; ширина текста — 6 px на знак (кегли 11,5–14 px). */
function recording() {
  const texts: Text[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y });
      return () => ({ addColorStop: () => {} });
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

import { starRadius } from '../src/render/glyphs.ts';

let sky: typeof import('../src/render/sky.ts');
let labels: typeof import('../src/render/labels.ts');
let models: typeof import('../src/data/atlas.ts').models;
let byId: typeof import('../src/data/atlas.ts').byId;
let graph: typeof import('../src/data/atlas.ts').graph;
let spine: Set<string>;
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  labels = await import('../src/render/labels.ts');
  const atlas = await import('../src/data/atlas.ts');
  ({ models, byId, graph } = atlas);
  spine = new Set([...atlas.lines.joseph.persons, ...atlas.lines.mary.persons].map((x) => x.id));
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };

/** Выделение, как у SkyView: выбранное лицо, предки, потомки, супруги. */
function lineage(id: string) {
  const m = new Map<string, import('../src/render/sky.ts').Emphasis>([[id, 'self']]);
  const up = [id];
  while (up.length) for (const e of graph.parentsOf.get(up.pop()!) ?? []) if (!m.has(e.parent)) (m.set(e.parent, 'anc'), up.push(e.parent));
  const down = [id];
  while (down.length) for (const e of graph.childrenOf.get(down.pop()!) ?? []) if (!m.has(e.child)) (m.set(e.child, 'desc'), down.push(e.child));
  for (const s of graph.spousesOf.get(id) ?? []) m.set(s.a === id ? s.b : s.a, 'path');
  return m;
}

function drawSky(o: { w?: number; h?: number; move?: (s: Sky) => void; state?: Record<string, unknown>; times?: number } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(models[0], 1);
  s.fitAll();
  o.move?.(s);
  for (let k = 0; k < (o.times ?? 1); k++)
    s.draw({
      model: models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
      ...(o.state ?? {}),
    } as Parameters<Sky['draw']>[0]);
  return { sky: s, texts: rec.texts, canvas };
}

/** Окно в `years` лет вокруг лица id, лицо — в середине видимой части. */
const around = (id: string, years: number) => (s: Sky) => {
  const x = s.nodeX(id)!;
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
  s.cam.set({ x0: x - (vp.l + vw / 2) / kx, kx, laneTop: s.node(id)!.lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};

const SCALES: [string, ((s: Sky) => void) | undefined][] = [
  ['обзор', undefined],
  ['эпоха', around('david', 700)],
  ['поколения', around('david', 180)],
  ['семья', around('david', 50)],
];

describe('подписи без наложений (E1)', () => {
  for (const w of [1440, 390])
    for (const sel of [null, 'david'])
      for (const [name, move] of SCALES)
        it(`${w}, ${name}${sel ? ', выбран Давид' : ''}: 0 наложений; каждая подпись неба — в открытом небе`, () => {
          const { sky: s } = drawSky({ w, h: w < 600 ? 700 : 776, move, state: sel ? { selected: sel, highlight: lineage(sel) } : {}, times: 2 });
          const st = s.labelStats();
          expect(st.boxes.length).toBeGreaterThan(5);
          expect(st.overlaps, st.pairs.map(([a, b]) => `${st.boxes[a].text} / ${st.boxes[b].text}`).join('; ')).toBe(0);
          const vp = s.cam.vp;
          for (const b of st.boxes) {
            if (b.kind === 'frame' || b.kind === 'edge') continue;
            // не срезается кромкой: целиком в открытом небе
            expect(b.x, b.text).toBeGreaterThan(s.letterW);
            expect(b.x + b.w, b.text).toBeLessThan(s.cam.w);
            expect(b.y, b.text).toBeGreaterThanOrEqual(s.openTop);
            expect(b.y + b.h, b.text).toBeLessThanOrEqual(vp.b);
          }
        });

  for (const w of [1440, 390])
    for (const sel of [null, 'david'])
      it(`${w}, масштаб семьи${sel ? ', выбран Давид' : ''}: подписано не меньше 90 % видимых звёзд`, () => {
        const { sky: s, canvas } = drawSky({ w, h: w < 600 ? 700 : 776, move: around('david', 50), state: sel ? { selected: sel, highlight: lineage(sel) } : {} });
        expect(s.cam.ky).toBeGreaterThanOrEqual(labels.FAMILY_KY);
        const st = s.labelStats();
        expect(st.stars).toBeGreaterThan(5);
        // замер — и на холсте, для проверок приёмки
        expect((canvas as unknown as { dataset: Record<string, string> }).dataset.named).toBe(`${st.named}/${st.stars}`);
        if (!(sel && w < labels.NARROW_SKY)) {
          expect(st.named / st.stars, `${st.named}/${st.stars}`).toBeGreaterThanOrEqual(0.9);
          return;
        }
        // узкое небо при выбранном лице (решение 144; M2): подписи только у рода выбранного и лиц лент — место семье;
        // прочие погашенные звёзды не подписаны вовсе. Из рода в окне подписано не меньше 90 %, остальные — в списке скрытых
        const hl = lineage(sel);
        const fam = new Set(labels.familyOf(sel));
        const named = new Set(st.boxes.filter((b) => b.kind === 'star').map((b) => b.id!));
        const rod: string[] = [];
        for (let i = 0; i < s.nodes.length; i++) {
          const n = s.nodes[i];
          if (n.ghost || !s.reachable(i)) continue;
          const x = s.cam.sx(s.X0[i]);
          if (x < s.letterW || x > s.cam.w) continue;
          if (hl.has(n.person) || fam.has(n.person)) rod.push(n.person);
          else expect(named.has(n.person) && !spine.has(n.person), `${n.person} вне рода подписан`).toBe(false);
        }
        const miss = rod.filter((id) => !named.has(id));
        expect(miss.length / rod.length, `без подписи: ${miss.join(', ')}`).toBeLessThanOrEqual(0.1);
        for (const id of miss) expect(s.hiddenLabels(), id).toContain(id);
      });

  it('у выбранного лица подписаны родители, супруги, дети, братья и сёстры, чьи звёзды в окне (MAP-21, UX-33)', () => {
    const { sky: s } = drawSky({ move: around('david', 180), state: { selected: 'david', highlight: lineage('david') } });
    const named = new Set(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => b.id));
    const fam = labels.familyOf('david');
    expect(fam).toEqual(expect.arrayContaining(['iessey', 'solomon', 'nafan-syn-davida', 'virsaviya']));
    const inView = fam.filter((id) => s.reachable(id));
    expect(inView.length).toBeGreaterThan(10);
    const missing = inView.filter((id) => !named.has(id));
    expect(missing.length / inView.length, missing.join(', ')).toBeLessThanOrEqual(0.1);
    for (const id of ['iessey', 'solomon', 'nafan-syn-davida', 'virsaviya']) if (s.reachable(id)) expect(named.has(id), id).toBe(true);
  });

  it('звёзды за краем окна не подписываются (MOB-01)', () => {
    for (const [, move] of SCALES) {
      const { sky: s } = drawSky({ w: 390, h: 700, move });
      for (const b of s.labelStats().boxes.filter((q) => q.kind === 'star')) {
        const i = s.indexOf(b.id!)!;
        const x = s.cam.sx(s.X0[i]);
        const y = s.cam.sy(s.nodes[i].lane);
        expect(x >= s.letterW && x <= s.cam.w && y >= s.openTop && y <= s.cam.vp.b, b.text).toBe(true);
      }
    }
  }, 60_000);

  it('«липкие» имена: у следа, звезда которого за левым краем, имя стоит у края над следом (MAP-10)', () => {
    const { sky: s, texts } = drawSky({ move: around('solomon', 50) });
    const sticky = s.labelStats().boxes.filter((b) => b.kind === 'sticky');
    expect(sticky.length).toBeGreaterThan(0);
    for (const b of sticky) {
      const i = s.indexOf(b.id!)!;
      expect(s.cam.sx(s.X0[i])).toBeLessThan(s.cam.vp.l);
      expect(s.cam.sx(s.X1[i])).toBeGreaterThan(b.x + b.w);
      expect(texts.some((q) => q.t === `‹ ${b.text}` && Math.abs(q.x - (s.cam.vp.l + 4)) < 0.5)).toBe(true);
    }
  });

  it('подпись справа — не ближе r + 5 от центра звезды: черта царя не сливается с именем (MAP-11, VIS-40)', () => {
    // цари Израиля — не на линиях Мессии: их подписи стоят справа (у лиц линий — вне лент, сверху или снизу, MAP-56)
    let kings = 0;
    for (const id of ['david', 'akhav', 'ieroboam']) {
    const { sky: s } = drawSky({ move: around(id, 50) });
    for (const b of s.labelStats().boxes.filter((q) => q.kind === 'star')) {
      const q = byId.get(b.id!)!;
      if (!q.roles.includes('king')) continue;
      const i = s.indexOf(q.id)!;
      const x = s.cam.sx(s.X0[i]);
      const r = starRadius(q.magnitude, labels.zoomScaleFor(s.cam.ky));
      // только подписи справа: строка по середине звезды (сверху, снизу, слева и выноски — другие положения)
      const y = s.cam.sy(s.nodes[i].lane);
      if (b.x < x || Math.abs(b.y + b.h / 2 - y) > 3) continue;
      kings++;
      // начало строки (без ореола 1,5 px) — правее черты царя (она выступает за диск на 1,5–2 px) с зазором
      expect(b.x + 1.5 - x, q.name).toBeGreaterThanOrEqual(r + 5 - 0.01);
    }
    }
    expect(kings).toBeGreaterThan(0);
  }, 60_000);

  it('четыре положения: у звезды у правого края подпись слева, сверху или снизу', () => {
    const r = 4;
    const w = 50;
    const at = (sd: import('../src/render/labels.ts').Side) => labels.spot(sd, 100, 100, r, w, 14).box;
    expect(at('r').x).toBeGreaterThan(100 + r);
    expect(at('l').x + at('l').w).toBeLessThan(100 - r);
    expect(at('t').y + at('t').h).toBeLessThan(100 - r);
    expect(at('b').y).toBeGreaterThan(100 + r);
    // справа и слева — по середине звезды
    expect(Math.abs(at('r').y + at('r').h / 2 - 100)).toBeLessThan(3);
  });
});

describe('обзор и семантическое увеличение (E3; MAP-03, 04)', () => {
  it('подробность — плавная ступень в полосе ×1,5 масштаба', () => {
    expect(sky.detailFor(sky.DETAIL_KY0)).toBe(0);
    expect(sky.detailFor(sky.DETAIL_KY1)).toBe(1);
    let prev = 0;
    for (let ky = 3; ky <= 7; ky += 0.1) {
      const d = sky.detailFor(ky);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    // ×1,5 по времени: от 4 до 6 px полосы вне «всего неба» (camera.kyFor)
    const { sky: s } = drawSky();
    const kxAt = (ky: number) => {
      let lo = 1e-4;
      let hi = 1;
      for (let k = 0; k < 60; k++) {
        const m = Math.sqrt(lo * hi);
        if (s.cam.kyFor(m) < ky) lo = m;
        else hi = m;
      }
      return lo;
    };
    const ratio = kxAt(sky.DETAIL_KY1) / kxAt(sky.DETAIL_KY0);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it('на обзоре подписаны и ловят указатель только звёзды величины 0–2 и выделенные; мелкие не нарисованы', () => {
    const { sky: s } = drawSky();
    expect(s.cam.ky).toBeLessThan(sky.DETAIL_KY0);
    for (const b of s.labelStats().boxes.filter((q) => q.kind === 'star')) expect(byId.get(b.id!)!.magnitude, b.text).toBeLessThanOrEqual(2);
    let small = 0;
    for (let i = 0; i < s.nodes.length; i++) {
      const q = byId.get(s.nodes[i].person)!;
      if (q.magnitude <= 2) continue;
      if (s.reachable(i)) small++;
    }
    expect(small).toBe(0);
    // выбранное лицо малой величины на обзоре видно и ловит указатель
    const tiny = s.nodes.find((n) => !n.ghost && n.trail === 'life' && byId.get(n.person)!.magnitude >= 5)!;
    const { sky: s2 } = drawSky({ state: { selected: tiny.person, highlight: lineage(tiny.person) } });
    const i = s2.indexOf(tiny.person)!;
    const x = s2.cam.sx(s2.X0[i]);
    const y = s2.cam.sy(s2.nodes[i].lane);
    if (x > s2.letterW && x < s2.cam.w && y > s2.openTop && y < s2.cam.vp.b) expect(s2.reachable(tiny.person)).toBe(true);
  });

  it('скопления: на обзоре — знак с подписью «…; N имён», лица не рисуются; на масштабе семьи — сетка имён и скобка', () => {
    const heroes = models[0].blocks.find((b) => b.cluster?.list === 'heroes-david')!;
    expect(heroes).toBeTruthy();
    const { sky: s } = drawSky();
    const cl = s.labelStats().boxes.filter((b) => b.kind === 'cluster');
    expect(cl.length).toBeGreaterThan(0);
    // «Храбрые Давида, 2 Цар 23:8–39; 54 имени», короче — «Храбрые Давида; 54 имени», у слитого знака — «… и ещё 2 списка»
    for (const b of cl) expect(b.text).toMatch(/^[А-Я][^;]+(; [^;]+)*; \d+\u00a0(имя|имени|имён)( и ещё \d+ (список|списка|списков))?$/);
    for (const id of heroes.cluster!.members) expect(s.reachable(id), id).toBe(false);
    // семья: сетка раскрыта, имена подписаны, скобка «время не установлено»
    const mid = heroes.cluster!.members[Math.floor(heroes.cluster!.members.length / 2)];
    const { sky: s2 } = drawSky({ move: around(mid, 40) });
    const named = s2.labelStats().boxes.filter((b) => b.kind === 'star' && heroes.cluster!.members.includes(b.id!));
    expect(named.length).toBeGreaterThan(5);
    expect(s2.labelStats().boxes.some((b) => b.kind === 'cluster' && /время не установлено/.test(b.text))).toBe(true);
  });

  it('названия созвездий: одно и то же — не чаще, чем через ~1 200 px (ТЗ § 3.1; MAP-58), не на лентах линий Мессии', () => {
    for (const [, move] of SCALES) {
      const { sky: s } = drawSky({ move });
      const g = s.labelStats().boxes.filter((b) => b.kind === 'group');
      for (const a of g) for (const b of g) if (a !== b && a.text === b.text) expect(Math.abs(a.x - b.x), a.text).toBeGreaterThanOrEqual(labels.GROUP_REPEAT_PX - 1);
    }
    const { sky: s } = drawSky();
    expect(s.labelStats().boxes.filter((b) => b.kind === 'group').length).toBeGreaterThan(5);
  }, 60_000);
});

describe('помощники подписей', () => {
  it('число имён согласовано с числом', () => {
    expect(labels.namesCount(21)).toBe('21 имя');
    expect(labels.namesCount(44)).toBe('44 имени');
    expect(labels.namesCount(37)).toBe('37 имён');
    expect(labels.namesCount(12)).toBe('12 имён');
    expect(labels.clusterText({ name: 'Храбрые Давида', refs: ['2Цар 23:8-39'], count: 44 })).toBe('Храбрые Давида, 2 Цар 23:8–39; 44 имени');
  });
  it('занятые места: жёсткое всегда, звёзды — если не намного тусклее подписи', () => {
    const pl = new labels.Placer();
    pl.add({ x: 0, y: 0, w: 10, h: 10 });
    pl.add({ x: 100, y: 0, w: 10, h: 10 }, true, 5);
    expect(pl.clash({ x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(pl.clash({ x: 10, y: 0, w: 10, h: 10 })).toBe(false); // касание — не пересечение
    expect(pl.clash({ x: 105, y: 5, w: 10, h: 10 })).toBe(true);
    expect(pl.clash({ x: 105, y: 5, w: 10, h: 10 }, false)).toBe(false);
    expect(pl.clash({ x: 105, y: 5, w: 10, h: 10 }, true, 3)).toBe(false); // имя величины 1 может закрыть звезду величины 5
  });
});
