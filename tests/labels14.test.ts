/**
 * Подписи и слои, этап 14 (docs/ui-review/STAGE14.md, решения 139–144; S2): истинные границы знаков и зазор от колец,
 * правило принадлежности и одной строки, выноска не длиннее 40 px, линии — препятствия для середины строки чужого имени,
 * скопления семьи на обзоре, весь текст — последним проходом, скрытые подписи и подпись под точкой (контракт 2).
 * В браузере те же пороги меряет tools/collide.ts (COLLISION STRESS) по настоящей отрисовке.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { starLaneOf } from '../src/engine/stays.ts';

type Op = { k: string; t?: string; x?: number; y?: number; r?: number };
/**
 * Холст-запись: методы — свои свойства цели (их можно подменить, как подменяет небо fillText на время подписей), каждый
 * вызов пишется в журнал; ширина текста — 7 px на знак.
 */
function recording() {
  const ops: Op[] = [];
  const st: Record<string, unknown> = { font: '', globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: 'miter', textAlign: 'start', textBaseline: 'alphabetic', letterSpacing: '0px' };
  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: (t: string, x: number, y: number) => ops.push({ k: 'fillText', t, x, y }),
    strokeText: (t: string, x: number, y: number) => ops.push({ k: 'strokeText', t, x, y }),
    arc: (x: number, y: number, r: number) => ops.push({ k: 'arc', x, y, r }),
    stroke: () => ops.push({ k: 'stroke' }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform: () => {},
  };
  const ctx = new Proxy(target, {
    get: (o, k) => {
      if (typeof k === 'string' && k in st) return st[k];
      if (k in o) return o[k as string];
      return () => ({ addColorStop: () => {} });
    },
    set: (o, k, v) => {
      if (typeof k === 'string' && k in st) st[k] = v;
      else o[k as string] = v;
      return true;
    },
    defineProperty: (o, k, d) => Reflect.defineProperty(o, k, d),
    deleteProperty: (o, k) => Reflect.deleteProperty(o, k),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, target };
}

let sky: typeof import('../src/render/sky.ts');
let labels: typeof import('../src/render/labels.ts');
let glyphs: typeof import('../src/render/glyphs.ts');
let atlas: typeof import('../src/data/atlas.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  labels = await import('../src/render/labels.ts');
  glyphs = await import('../src/render/glyphs.ts');
  atlas = await import('../src/data/atlas.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };

function lineage(id: string) {
  const g = atlas.graph;
  const m = new Map<string, import('../src/render/sky.ts').Emphasis>([[id, 'self']]);
  const up = [id];
  while (up.length) for (const e of g.parentsOf.get(up.pop()!) ?? []) if (!m.has(e.parent)) (m.set(e.parent, 'anc'), up.push(e.parent));
  const down = [id];
  while (down.length) for (const e of g.childrenOf.get(down.pop()!) ?? []) if (!m.has(e.child)) (m.set(e.child, 'desc'), down.push(e.child));
  for (const s of g.spousesOf.get(id) ?? []) m.set(s.a === id ? s.b : s.a, 'path');
  return m;
}

function drawSky(o: { w?: number; h?: number; move?: (s: Sky) => void; state?: Record<string, unknown> } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  o.move?.(s);
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    ...(o.state ?? {}),
  } as Parameters<Sky['draw']>[0]);
  return { sky: s, ...rec, canvas: canvas as unknown as { dataset: Record<string, string> } };
}

const around = (id: string, years: number) => (s: Sky) => {
  const x = s.nodeX(id)!;
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
  // окно — у звезды лица: в полосе рождения (этап 15, решение 173)
  s.cam.set({ x0: x - (vp.l + vw / 2) / kx, kx, laneTop: starLaneOf(s.node(id)!) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};

/** Знаки кадра: центр и истинные границы (glyphs.ts, glyphExtent) у звёзд, которые можно навести. */
function glyphBoxes(s: Sky) {
  const out: { id: string; x: number; y: number; b: { x: number; y: number; w: number; h: number } }[] = [];
  const scale = Math.max(0.7, Math.min(1.25, s.cam.ky / 18));
  for (let i = 0; i < s.nodes.length; i++) {
    const n = s.nodes[i];
    // нарисованные знаки: прореженный (решение 142) в списке неба, но не нарисован
    if (n.ghost || !s.reachable(i) || s.thinned(i)) continue;
    const q = atlas.byId.get(n.person)!;
    const e = glyphs.glyphExtent({ sex: q.sex, kind: q.kind, magnitude: q.magnitude, king: q.roles.includes('king') || q.roles.includes('queen'), messiah: q.id === 'iisus', scale });
    const x = s.cam.sx(s.X0[i]);
    // знак лица — в полосе рождения (решение 173)
    const y = s.cam.sy(starLaneOf(n));
    out.push({ id: n.person, x, y, b: { x: x - e.l, y: y - e.t, w: e.l + e.r, h: e.t + e.b } });
  }
  return out;
}
const crossR = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('истинные границы знаков и зазор подписи (решение 140; C2, C5, C9)', () => {
  it('кольцо женщины, точки народа, звезда Мессии, черта царя и «†» — в границах знака', () => {
    const r = glyphs.starRadius(3);
    const man = glyphs.glyphExtent({ sex: 'm', kind: 'person', magnitude: 3 });
    expect(man).toEqual({ l: r, r, t: r, b: r });
    const woman = glyphs.glyphExtent({ sex: 'f', kind: 'person', magnitude: 3 });
    expect(woman.l).toBeCloseTo(r + 2.65, 5);
    const people = glyphs.glyphExtent({ sex: 'm', kind: 'people', magnitude: 5 });
    expect(people.l).toBeGreaterThan(glyphs.starRadius(5) + 2);
    expect(glyphs.glyphExtent({ sex: 'm', kind: 'person', magnitude: 0, messiah: true }).t).toBeCloseTo(glyphs.starRadius(0) * 2.4, 5);
    const king = glyphs.glyphExtent({ sex: 'm', kind: 'person', magnitude: 1, king: true });
    expect(king.t).toBeCloseTo(glyphs.starRadius(1) + 3 + glyphs.KING_BAR_W / 2, 5);
    expect(king.r).toBeCloseTo(glyphs.starRadius(1) + 2, 5);
    const infant = glyphs.glyphExtent({ sex: 'm', kind: 'person', magnitude: 5, infant: true });
    expect(infant.l).toBeGreaterThan(glyphs.starRadius(5) + 4);
  });
  it('зазор имени — наружный край наибольшего кольца + 3 px; у царя сбоку — не ближе r + 7', () => {
    const r = 4;
    const ring = { l: r + 6, r: r + 6, t: r + 6, b: r + 6 };
    const right = labels.spot('r', 100, 100, r, 40, 13, false, ring);
    expect(right.tx - 100).toBeCloseTo(r + 6 + labels.LABEL_GAP, 5);
    const left = labels.spot('l', 100, 100, r, 40, 13, false, ring);
    expect(100 - (left.tx + 40)).toBeCloseTo(r + 6 + labels.LABEL_GAP, 5);
    // без колец — прежний отступ r + 5; у царя — r + 7
    expect(labels.spot('r', 100, 100, r, 40, 13).tx - 100).toBeCloseTo(r + 5, 5);
    expect(labels.spot('r', 100, 100, r, 40, 13, true).tx - 100).toBeCloseTo(r + labels.KING_SIDE, 5);
    // над знаком: низ букв (без выносных — базовая линия) — в 3 px над кольцом
    const top = labels.spot('t', 100, 100, r, 40, 13, false, ring, { asc: 9, desc: 0 });
    expect(100 - top.ty).toBeCloseTo(r + 6 + labels.LABEL_GAP, 5);
  });
});

describe('принадлежность и строка (решение 140; C3)', () => {
  it('подпись не ложится на чужой знак; чужой знак не ближе своего и не стоит в строке у имени', () => {
    const P = new labels.Placer();
    const e = { l: 3, r: 3, t: 3, b: 3 };
    const own = { x: 100, y: 100, e, id: 'a', a: 1, m: 3 };
    P.addGlyph(own);
    P.addGlyph({ x: 160, y: 100, e, id: 'b', a: 1, m: 3 });
    const box = labels.textBox(108, 104, 30, 13);
    expect(P.owns(box, own, 'a', 13)).toBe(true);
    // имя шире — легло бы на «b»
    expect(P.owns(labels.textBox(108, 104, 55, 13), own, 'a', 13)).toBe(false);
    // чужой знак в строке ближе 0,6 кегля к концу имени
    expect(P.owns(labels.textBox(108, 104, 45, 13), own, 'a', 13)).toBe(false);
    // чужой знак ближе своего
    P.addGlyph({ x: 125, y: 113, e, id: 'c', a: 1, m: 3 });
    expect(P.owns(box, own, 'a', 13)).toBe(false);
    // погашенный до 25 % не спорит о принадлежности, но под имя не ложится
    const Q = new labels.Placer();
    Q.addGlyph(own);
    Q.addGlyph({ x: 125, y: 113, e, id: 'c', a: 0.25, m: 3 });
    expect(Q.owns(box, own, 'a', 13)).toBe(true);
    Q.addGlyph({ x: 120, y: 100, e, id: 'd', a: 0.25, m: 3 });
    expect(Q.owns(box, own, 'a', 13)).toBe(false);
  });
  it('подписи на одной строке — не ближе 0,5 кегля; на соседней строке — можно вплотную', () => {
    const P = new labels.Placer();
    P.addLabel(labels.textBox(100, 100, 50, 14), 14);
    expect(P.rowClash(labels.textBox(155, 100, 30, 14), 14)).toBe(true);
    expect(P.rowClash(labels.textBox(162, 100, 30, 14), 14)).toBe(false);
    expect(P.rowClash(labels.textBox(152, 117, 30, 14), 14)).toBe(false);
  });
  it('выноска не пересекает выноски (решение 140)', () => {
    const P = new labels.Placer();
    P.leaders.push([0, 0, 30, 30]);
    expect(P.crossesLeader(0, 30, 30, 0)).toBe(true);
    expect(P.crossesLeader(40, 0, 70, 30)).toBe(false);
  });
});

describe('подписи неба по правилам решений 139–144', () => {
  for (const [name, move, sel] of [
    ['Давид, семья', around('david', 50), 'david'],
    ['Давид, поколения', around('david', 180), 'david'],
    ['Иаков, семья', around('iakov', 120), 'iakov'],
    ['Давид, поколения, без выбора', around('david', 180), null],
  ] as const)
    it(`${name}: ни одно имя не лежит на чужом знаке, подписи на строке не слиты, наложений нет`, () => {
      const { sky: s } = drawSky({ move, state: sel ? { selected: sel, highlight: lineage(sel) } : {} });
      const st = s.labelStats();
      expect(st.overlaps).toBe(0);
      const stars = st.boxes.filter((b) => b.kind === 'star');
      expect(stars.length).toBeGreaterThan(10);
      const gl = glyphBoxes(s);
      const bad: string[] = [];
      for (const b of stars) {
        // выбранное лицо (явное раскрытие) в последнем проходе может лечь поверх — здесь места хватает
        for (const g of gl) if (g.id !== b.id && crossR({ x: b.x + 1.5, y: b.y + 1.5, w: b.w - 3, h: b.h - 3 }, g.b)) bad.push(`${b.text} на ${g.id}`);
      }
      expect(bad).toEqual([]);
      // слитые в строку: две подписи звёзд на одной строке ближе 0,45 кегля (замер C, класс 3а)
      const glued: string[] = [];
      for (const a of stars)
        for (const b of stars) {
          if (a === b || Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) > 3) continue;
          const gap = b.x - (a.x + a.w) + 3;
          if (gap >= -0.75 && gap < 0.45 * ((a.h - 3) / 1.04)) glued.push(`${a.text} + ${b.text}`);
        }
      expect(glued).toEqual([]);
    });

  it('скрытые подписи (контракт 2): видимые звёзды без подписи — в списке скрытых, подписанные — нет; подпись под точкой', () => {
    const { sky: s, canvas } = drawSky({ move: around('david', 180), state: { selected: 'david', highlight: lineage('david') } });
    const named = new Set(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => b.id));
    const hidden = s.hiddenLabels();
    expect(hidden.length).toBeGreaterThan(0);
    for (const id of hidden) expect(named.has(id), id).toBe(false);
    expect(canvas.dataset.hidden).toBe(hidden.slice(0, 200).join(' '));
    // подпись под точкой: середина рамки имени Давида и точка в 10 px над рамкой (поле касания не меньше 24 px)
    const b = s.labelStats().boxes.find((q) => q.kind === 'star' && q.id === 'david')!;
    expect(s.labelAt(b.x + b.w / 2, b.y + b.h / 2)).toBe('david');
    expect(s.labelAt(b.x + b.w / 2, b.y + b.h / 2 - 11)).toBe('david');
    expect(s.labelAt(b.x + b.w / 2, b.y - 30)).not.toBe('david');
    expect(labels.labelAt([{ kind: 'star', text: 'А', id: 'a', x: 0, y: 0, w: 20, h: 10 }], 10, -6)).toBe('a');
    expect(labels.labelAt([{ kind: 'star', text: 'А', id: 'a', x: 0, y: 0, w: 20, h: 10 }], 10, -6, 10)).toBe(null);
  });

  it('родня выбранного (П1, решение 146): каждый в кадре подписан или в списке скрытых — только в кадре и без подписи', () => {
    const { sky: s } = drawSky({ w: 1024 - 400, h: 700, move: around('david', 170), state: { selected: 'david', highlight: lineage('david') } });
    const named = new Set(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => b.id));
    const hidden = new Set(s.hiddenLabels());
    const vp = s.cam.vp;
    let inFrame = 0;
    for (const id of labels.familyOf('david')) {
      const i = s.indexOf(id);
      if (i === undefined || !s.reachable(i)) continue;
      const x = s.cam.sx(s.X0[i]);
      const y = s.starY(i);
      const inside = x >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b;
      if (inside) inFrame++;
      if (inside) expect(named.has(id) !== hidden.has(id), `${id}: подписан или скрыт — одно из двух`).toBe(true);
      else expect(hidden.has(id), `${id} вне кадра — не в списке скрытых`).toBe(false);
    }
    expect(inFrame).toBeGreaterThan(10);
    // больше половины родни подписано и в тесном окне 624 px (П1: подписано ≥ 70 % — на 1024 с карточкой, браузерный замер)
    const fam = new Set(labels.familyOf('david'));
    expect([...named].filter((id) => !!id && fam.has(id)).length / inFrame).toBeGreaterThan(0.5);
  }, 20000);

  it('весь текст — последним проходом: имена звёзд пишутся после колец выбора и после выбранной связи (решения 139, 143)', async () => {
    const { unions } = await import('../src/ui/reveal.ts');
    const u = (unions.origin.get('amnon') ?? [])[0];
    const link = u ? { kind: 'child' as const, union: u.id, child: 'amnon' } : null;
    const { sky: s, ops } = drawSky({ move: around('david', 50), state: { selected: 'david', highlight: lineage('david'), link } });
    const names = new Set(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => b.text));
    const i = s.indexOf('david')!;
    const x = s.cam.sx(s.X0[i]);
    const y = s.starY(i);
    // кольцо выбранного — дуга с центром в его звезде шире самого знака
    const r0 = glyphs.starRadius(0, Math.max(0.7, Math.min(1.25, s.cam.ky / 18)));
    const ring = ops.findLastIndex((o) => o.k === 'arc' && Math.abs(o.x! - x) < 0.6 && Math.abs(o.y! - y) < 0.6 && o.r! > r0 + 3);
    expect(ring).toBeGreaterThan(0);
    const first = ops.findIndex((o) => o.k === 'fillText' && names.has(o.t!));
    expect(first).toBeGreaterThan(ring);
  });

  it('скопление семьи на обзоре (решение 142): яркие знаки семьи не ложатся друг на друга — у старшего «+N»', () => {
    const { sky: s, canvas } = drawSky({ move: around('iakov', 2500), state: { selected: 'iakov', highlight: lineage('iakov') } });
    const piles = s.pilesNow();
    expect(piles.length).toBeGreaterThan(0);
    expect(canvas.dataset.piles).toMatch(/:\+\d+:/);
    // собранные в скопление не ловят указатель и не подписаны
    const named = new Set(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => b.id));
    for (const p of piles)
      for (const m of p.members) {
        expect(s.reachable(m), m).toBe(false);
        expect(named.has(m), m).toBe(false);
      }
    // яркие (род выбранного) видимые знаки попарно не пересекаются
    const hl = lineage('iakov');
    const gl = glyphBoxes(s).filter((g) => hl.has(g.id));
    const pairs: string[] = [];
    for (let a = 0; a < gl.length; a++)
      for (let b = a + 1; b < gl.length; b++) {
        const A = gl[a];
        const B = gl[b];
        const ra = Math.max(A.b.w, A.b.h) / 2;
        const rb = Math.max(B.b.w, B.b.h) / 2;
        if (Math.hypot(A.x - B.x, A.y - B.y) < ra + rb - 0.6) pairs.push(`${A.id} × ${B.id}`);
      }
    expect(pairs).toEqual([]);
    // на масштабе семьи скоплений нет
    expect(drawSky({ move: around('iakov', 120), state: { selected: 'iakov', highlight: lineage('iakov') } }).sky.pilesNow()).toEqual([]);
  });
});

describe('прореживание знаков без выбранного (решение 142 на любом масштабе; инвариант 13, К1 = 0)', () => {
  /** Нарисованные знаки кадра: центр и наибольший вынос настоящей фигуры (без черты царя, как у К1). */
  function drawnGlyphs(s: Sky) {
    const scale = Math.max(0.7, Math.min(1.25, s.cam.ky / 18));
    return glyphBoxes(s).map((g) => {
      const q = atlas.byId.get(g.id)!;
      const e = glyphs.glyphExtent({ sex: q.sex, kind: q.kind, magnitude: q.magnitude, messiah: q.id === 'iisus', scale });
      return { id: g.id, x: g.x, y: g.y, R: Math.max(e.l, e.r, e.t, e.b) };
    });
  }
  const touching = (gl: ReturnType<typeof drawnGlyphs>) => {
    const out: string[] = [];
    for (let a = 0; a < gl.length; a++)
      for (let b = a + 1; b < gl.length; b++) if (Math.hypot(gl[a].x - gl[b].x, gl[a].y - gl[b].y) < gl[a].R + gl[b].R + 1 - 1e-6) out.push(`${gl[a].id} × ${gl[b].id}`);
    return out;
  };
  for (const [w, h] of [[390, 700], [1440, 776]] as const)
    it(`обзор ${w} px: знаки не ложатся друг на друга, опорные лица нарисованы, прореженные — в списке неба и в скрытых`, () => {
      const { sky: s, canvas } = drawSky({ w, h });
      expect(touching(drawnGlyphs(s))).toEqual([]);
      for (const id of ['noy', 'avraam', 'david', 'iisus']) expect(s.thinned(id), id).toBe(false);
      const thin = canvas.dataset.thin.split(';').filter(Boolean).map((g) => g.split(':'));
      if (w === 390) expect(thin.length).toBeGreaterThan(0);
      const named = new Set(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => b.id));
      const hidden = new Set(s.hiddenLabels());
      for (const [host, members] of thin) {
        expect(s.thinned(host), host).toBe(false);
        expect(s.thinMembers(host).sort()).toEqual(members.split(',').sort());
        for (const m of members.split(',')) {
          expect(named.has(m), m).toBe(false);
          // в окне и в полную силу — в списке неба (reachable) и среди скрытых подписей
          if (s.reachable(m)) expect(hidden.has(m), m).toBe(true);
        }
      }
    });
  it('приближение разводит собранные знаки; при выбранном лице прореживания нет', () => {
    // на обзоре в знак Давида собраны его потомки-цари; на 600 годах вокруг него они нарисованы отдельно
    const far = drawSky({ w: 390, h: 700 }).sky;
    const kids = far.thinMembers('david');
    expect(kids.length).toBeGreaterThan(0);
    const near = drawSky({ w: 390, h: 700, move: around('david', 600) }).sky;
    expect(touching(drawnGlyphs(near))).toEqual([]);
    for (const id of kids) expect(near.thinned(id), id).toBe(false);
    expect(kids.filter((id) => near.reachable(id)).length).toBeGreaterThan(0);
    const sel = drawSky({ w: 390, h: 700, state: { selected: 'david', highlight: lineage('david') } }).sky;
    expect(sel.nodes.some((_, i) => sel.thinned(i))).toBe(false);
  });
});
