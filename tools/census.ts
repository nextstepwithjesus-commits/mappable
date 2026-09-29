/**
 * Перепись двусмысленностей неба (этап 11, § 12; основа — перепись критика K4, stage11/k4/census.ts): считает по геометрии
 * кадра, а не по пикселям, — по журналу связей src/render/links.ts (пути, узлы, разрывы), звёздам и следам кадра и подписям.
 *
 *   npx tsx tools/census.ts                                   # все сцены, ×1 и ×2, ширина 1440
 *   npx tsx tools/census.ts --scene noy,iakov --scale 1 --width 390 --json out.json --top 10
 *
 * Сцены (§ 12): all — «все лица» целиком (большой холст на всё небо при масштабе «лицо и поколения вокруг», как у K4);
 * adam — Адам с Каином (набор, снимок 12); noy, avraam, iakov, david — лицо и его дети (род лица, 1 поколение, по отцам);
 * nahor — «Дом Нахора»; judah — род Иуды по отцам; benjamin — колено Вениамина; lines — «линии Мессии».
 * Семейные сцены рисуются в окне ширины --width (1440 или 390) «вписать показ»; ×2 — вдвое крупнее по времени.
 *
 * Небо (src/render/sky.ts) рисуется в node на записывающий холст, как в тестах. Проверки — пороги Я1–Я15 (STAGE11.md § 12):
 *  Я1  путь связи ближе r + 5 px к чужой звезде;             Я2  стволы разных семей на одной вертикали (|Δx| < 8 px);
 *  Я3  близкие параллели разных связей (< 12°, < 6 px, > 24 px); Я4 одна связь двумя путями;
 *  Я5  косые отрезки связей;                                  Я6  ствол перед детьми, зубец 5–40 px, x не убывает;
 *  Я7  у ствола есть узел; висячих стволов нет;               Я8  пересечение с чужим следом — разрыв ≥ 2 px с каждой стороны;
 *  Я9  штрих — иное происхождение, точки — толкование и нить народа; Я10 цвет связей без выбранного лица;
 *  Я11 пересечения линий союзов между собой и со следами;    Я12 подписи на чужих звёздах, на линиях, наложения, строка;
 *  Я13 длинные связи на «всех лицах» — обрывками;             Я14 наведение по линии называет её концы, не постороннего;
 *  Я15 доля двусмысленных связей.
 * Тест — tests/census.test.ts (пороги падают тестом).
 */

// ---------- запуск: модули атласа читают данные через import.meta.glob — нужен модульный загрузчик Vite ----------

const underVite = !!(import.meta as { env?: unknown }).env;
if (!underVite && typeof process !== 'undefined' && process.argv[1]?.endsWith('census.ts')) {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: 'vite.config.ts', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  process.env.CENSUS_MAIN = '1';
  try {
    await server.ssrLoadModule('/tools/census.ts');
  } finally {
    await server.close();
  }
  process.exit(0);
}

import type { LinkFrame, LinkPath, LinkStar } from '../src/render/links.ts';
import type { Show } from '../src/ui/work.ts';

// ---------- модули атласа в node ----------

Object.assign(globalThis, { document: (globalThis as { document?: unknown }).document ?? { documentElement: { dataset: {} } }, getComputedStyle: (globalThis as { getComputedStyle?: unknown }).getComputedStyle ?? (() => ({ getPropertyValue: () => '' })) });
const skyMod = await import('../src/render/sky.ts');
const trails = await import('../src/render/trails.ts');
const links = await import('../src/render/links.ts');
const labels = await import('../src/render/labels.ts');
const glyphs = await import('../src/render/glyphs.ts');
const marks = await import('../src/render/marks.ts');
const atlas = await import('../src/data/atlas.ts');
const work = await import('../src/ui/work.ts');
const show = await import('../src/ui/show.ts');
const state = await import('../src/state.ts');
const words = await import('../src/ui/linkwords.ts');
type Sky = InstanceType<typeof skyMod.Sky>;

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const M = () => atlas.models[0];
const nameOf = (id: string) => atlas.byId.get(id)?.name ?? id;

// ---------- записывающий холст ----------

/** Холст без рисования: ширина текста — 0,56 кегля на знак (как у переписи K4). */
function blankCanvas(): HTMLCanvasElement {
  let font = '13px serif';
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13);
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (s: string) => ({ width: s.length * px() * 0.56, actualBoundingBoxAscent: px() * 0.72, actualBoundingBoxDescent: px() * 0.22 });
      if (k === 'canvas') return canvas;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'font') font = String(v);
      return true;
    },
  });
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  return canvas;
}

// ---------- сцены ----------

export interface Scene {
  id: string;
  title: string;
  show: Show;
  /** лицо фокуса: выбрано, его семья — в полную силу */
  select: string | null;
  /** набор (показ «набор») */
  set?: string[];
  /** семейная сцена (пороги Я1, Я3, Я11 — нулевые) */
  family: boolean;
}

export const SCENES: Record<string, Scene> = {
  all: { id: 'all', title: '«Все лица» целиком', show: { kind: 'all' }, select: null, family: false },
  adam: {
    id: 'adam', title: 'Адам с Каином (набор, снимок 12)', show: { kind: 'set' }, select: 'adam', family: true,
    set: ['adam', 'eva', 'kain', 'avel', 'sif', 'enos', 'kainan', 'enokh-syn-kaina', 'irad', 'mekhiael'],
  },
  noy: { id: 'noy', title: 'Ной и сыновья', show: { kind: 'lineage', id: 'noy', dir: 'down', gen: 1, by: 'father' }, select: 'noy', family: true },
  avraam: { id: 'avraam', title: 'Авраам и дети', show: { kind: 'lineage', id: 'avraam', dir: 'down', gen: 1, by: 'father' }, select: 'avraam', family: true },
  iakov: { id: 'iakov', title: 'Иаков: четыре союза', show: { kind: 'lineage', id: 'iakov', dir: 'down', gen: 1, by: 'father' }, select: 'iakov', family: true },
  david: { id: 'david', title: 'Давид: лестница союзов', show: { kind: 'lineage', id: 'david', dir: 'down', gen: 1, by: 'father' }, select: 'david', family: true },
  nahor: { id: 'nahor', title: '«Дом Нахора»', show: { kind: 'groups', groups: ['nahorites'], links: 'stubs' }, select: 'nakhor-syn-farry', family: true },
  judah: { id: 'judah', title: 'Род Иуды по отцам', show: { kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' }, select: 'iuda', family: true },
  benjamin: { id: 'benjamin', title: 'Колено Вениамина', show: { kind: 'groups', groups: ['benjamin'], links: 'stubs' }, select: 'veniamin', family: true },
  lines: { id: 'lines', title: '«Линии Мессии»', show: { kind: 'lines' }, select: null, family: true },
};

/** Сцена на небе: показ, набор и выбор — через модель показа (src/ui/show.ts), как у атласа. */
function applyScene(sc: Scene) {
  if (sc.set) work.workSet.value = new Map(sc.set.filter((id) => atlas.byId.has(id)).map((id) => [id, { via: 'self', of: id }]));
  state.selected.value = sc.select;
  work.setShowState(sc.show, { anchor: sc.select, history: 'replace' });
  return show.skyShow.value;
}

function newSky(w: number, h: number, sc: Scene): Sky {
  const s = new skyMod.Sky(blankCanvas());
  s.animate = false;
  s.resize(w, h, 1);
  s.setModel(M(), 1);
  s.fitAll();
  const sh = applyScene(sc);
  s.setView({ mode: sc.show.kind === 'all' ? 'all' : 'work', set: new Set(work.shownIds.value), foldDesc: [], foldGroups: [], show: sh });
  s.fitAll();
  return s;
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
/** Масштаб «всех лиц»: медиана вида «лицо и несколько поколений» (view.ts, viewForPerson), как у K4. */
function allKx(ref: Sky, w: number): number {
  const vp = ref.cam.vp;
  const ks: number[] = [];
  for (const p of atlas.persons) {
    const n = ref.node(p.id);
    const c = M().chrono.get(p.id);
    if (!n || n.ghost) continue;
    const life = c ? Math.max(40, (c.d ?? c.dEst) - c.b) : 80;
    const span = Math.max(120, Math.min(900, life * 2.6));
    ks.push(((vp.r - vp.l) * (w / 1440)) / Math.max(1e-6, ref.xOf(n.t0 + span * 0.65) - ref.xOf(n.t0 - span * 0.35)));
  }
  return median(ks);
}

// ---------- кадр ----------

export interface Frame {
  sc: Scene;
  scale: number;
  width: number;
  s: Sky;
  /** связи кадра и что из них нарисовано */
  d: NonNullable<ReturnType<Sky['linkFrame']>>;
  /** нарисованные пути (без лент — они в ribbons) */
  paths: LinkPath[];
  ribbons: LinkPath[];
  /** нарисованные узлы (◆ и •) */
  nodes: LinkFrame['nodes'];
  stars: readonly LinkStar[];
  /** живые следы: узел, лицо, строка, от и до (px) */
  trails: { i: number; id: string; y: number; x0: number; x1: number }[];
  boxes: ReturnType<Sky['labelStats']>['boxes'];
  overlaps: number;
  ky: number;
}

function drawState(sc: Scene) {
  const hl = sc.select ? marks.familyHighlight(sc.select) : null;
  return {
    model: M(), lambda: 1, selected: sc.select, second: null, hovered: null, focus: null, highlight: hl?.hl ?? null, depth: hl?.depth ?? null,
    layers: LAYERS, onlyLines: sc.show.kind === 'lines', meridian: null, tensionPersons: new Set<string>(), flow: 0, reduced: true, intro: 1,
    lineFlip: false, pins: new Set<string>(), reserve: [], plates: null, plateMarks: {}, reveal: null, guestWhere: show.whereOf,
  } as unknown as Parameters<Sky['draw']>[0] & { s?: Sky };
}

/**
 * Кадр сцены id вокруг лица at: окно years лет с ним посередине (для «всех лиц» — окно читателя, а не весь холст).
 * select — выбранное лицо (его семья — в полную силу); null — без выбора.
 */
export function captureAt(id: string, at: string, years: number, o: { width?: number; height?: number; select?: string | null } = {}): Frame {
  const sc = { ...SCENES[id], select: o.select === undefined ? SCENES[id].select : o.select };
  const width = o.width ?? 1440;
  const s = newSky(width, o.height ?? (width < 600 ? 700 : 776), sc);
  const i = s.indexOf(at);
  if (i === undefined) throw new Error(`[${id}] нет лица ${at}`);
  const x = s.X0[i];
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l) / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
  s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(s.nodes[i].lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
  return frameOf(sc, s, 1, width);
}

/** Нарисовать сцену и снять геометрию кадра. scale — ×1 или ×2; width — ширина окна (1440 или 390). */
export function capture(id: string, scale = 1, width = 1440): Frame {
  const sc = SCENES[id];
  const height = width < 600 ? 700 : 776;
  let s: Sky;
  if (!sc.family && sc.show.kind === 'all') {
    // «все лица» целиком: большой холст на всё небо при масштабе «лицо и поколения вокруг»
    const ref = newSky(width, height, sc);
    const kx = allKx(ref, width) * scale;
    const ky = ref.cam.kyFor(kx);
    const m = M();
    const x0 = ref.xOf(ref.scale.knots[0]);
    const x1 = ref.xOf(100);
    const W = Math.ceil((x1 - x0) * kx) + 400;
    const H = Math.ceil((m.laneMax - m.laneMin + 4) * ky) + 300;
    s = newSky(W, H, sc);
    (s.cam as unknown as { kyAuto: (k: number) => number }).kyAuto = () => ky;
    s.cam.set({ x0: x0 - 220 / kx, kx, laneTop: m.laneMax + 2 + 150 / ky });
  } else {
    s = newSky(width, height, sc);
    if (scale !== 1) {
      const cam = s.cam;
      const [cx, cy] = cam.vpCenter();
      cam.zoomAt(cx, cy, scale);
    }
  }
  return frameOf(sc, s, scale, width);
}

/** Кадр готового неба: рисует его дважды (места подписей устоялись) и снимает геометрию. */
export function frameOf(sc: Scene, s: Sky, scale: number, width: number, extra: Record<string, unknown> = {}): Frame {
  const st = { ...drawState(sc), ...extra } as Parameters<Sky['draw']>[0];
  s.draw(st);
  s.draw(st);
  const d = s.linkFrame();
  if (!d) throw new Error(`[${sc.id}] связей в кадре нет`);
  // нарисованные в кадре пути: по правилу длинных связей и видимые при этой подробности (или выделенные)
  const shown = d.frame.paths.filter((q) => trails.linkShown(q, d) && (d.alpha > 0.01 || d.lit(q)));
  const lt = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 } as import('../src/render/trails.ts').LifeTrail;
  const tr: Frame['trails'] = [];
  for (let i = 0; i < s.nodes.length; i++) {
    if (!s.drawn(i)) continue;
    if (trails.trailOf(s, i, lt) && lt.x1 > lt.x0 + 1) tr.push({ i, id: s.nodes[i].person, y: lt.y, x0: lt.x0, x1: lt.x1 });
  }
  const ls = s.labelStats();
  return {
    sc, scale, width, s, d,
    paths: shown.filter((q) => q.kind !== 'ribbon'),
    // ленты — по маршрутам только на масштабе семьи; на обзоре нарисован сплайн (ribbons.ts), и маршрут не считается
    ribbons: s.routeFactor >= 0.5 ? shown.filter((q) => q.kind === 'ribbon') : [],
    nodes: d.frame.nodes.filter((n) => (d.alpha > 0.01 || d.lit({ ends: [n.owner, n.from] } as unknown as LinkPath)) && !(d.frame.ribbonOnly?.has(n.union) && s.routeFactor < 0.5)),
    stars: s.linkStarsNow(), trails: tr,
    boxes: ls.boxes.filter((b) => b.kind !== 'frame' && b.kind !== 'edge'), overlaps: ls.overlaps, ky: s.cam.ky,
  };
}

// ---------- геометрия ----------

type Seg = [number, number, number, number];
const segs = (q: Pick<LinkPath, 'pts'>): Seg[] => links.segmentsOf(q);
const isV = (g: Seg) => Math.abs(g[0] - g[2]) < 0.5 && Math.abs(g[1] - g[3]) > 0.5;
const isH = (g: Seg) => Math.abs(g[1] - g[3]) < 0.5 && Math.abs(g[0] - g[2]) > 0.5;

/** Точка пересечения отрезков внутри (у концов — допуск tol px); null — не пересекаются. */
function crossAt(a: Seg, b: Seg, tol = 2): [number, number] | null {
  const [ax0, ay0, ax1, ay1] = a;
  const [bx0, by0, bx1, by1] = b;
  const d = (by1 - by0) * (ax1 - ax0) - (bx1 - bx0) * (ay1 - ay0);
  if (Math.abs(d) < 1e-9) return null;
  const ua = ((bx1 - bx0) * (ay0 - by0) - (by1 - by0) * (ax0 - bx0)) / d;
  const ub = ((ax1 - ax0) * (ay0 - by0) - (ay1 - ay0) * (ax0 - bx0)) / d;
  const ea = tol / Math.max(Math.hypot(ax1 - ax0, ay1 - ay0), 1e-9);
  const eb = tol / Math.max(Math.hypot(bx1 - bx0, by1 - by0), 1e-9);
  if (ua <= ea || ua >= 1 - ea || ub <= eb || ub >= 1 - eb) return null;
  return [ax0 + ua * (ax1 - ax0), ay0 + ua * (ay1 - ay0)];
}

/** Общая длина близкого параллельного хода: угол < angle°, расстояние < dist px; мера — вдоль a. */
function parallelLen(a: Seg, b: Seg, angle: number, dist: number): number {
  const ax = a[2] - a[0];
  const ay = a[3] - a[1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(b[2] - b[0], b[3] - b[1]);
  if (la < 1 || lb < 1) return 0;
  const ux = ax / la;
  const uy = ay / la;
  const cos = Math.abs(ux * (b[2] - b[0]) + uy * (b[3] - b[1])) / lb;
  if (cos < Math.cos((angle * Math.PI) / 180)) return 0;
  const t0 = (b[0] - a[0]) * ux + (b[1] - a[1]) * uy;
  const t1 = (b[2] - a[0]) * ux + (b[3] - a[1]) * uy;
  const d0 = (b[0] - a[0]) * -uy + (b[1] - a[1]) * ux;
  const d1 = (b[2] - a[0]) * -uy + (b[3] - a[1]) * ux;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(la, Math.max(t0, t1));
  if (hi - lo <= 0) return 0;
  const dAt = (t: number) => (t1 === t0 ? d0 : d0 + ((d1 - d0) * (t - t0)) / (t1 - t0));
  let len = 0;
  for (let k = 0; k < 16; k++) {
    const ta = lo + ((hi - lo) * k) / 16;
    const tb = lo + ((hi - lo) * (k + 1)) / 16;
    if (Math.abs(dAt((ta + tb) / 2)) < dist) len += tb - ta;
  }
  return len;
}

/** Прямоугольник пересекает отрезок. */
function segInRect(g: Seg, r: { x: number; y: number; w: number; h: number }): boolean {
  const [x0, y0, x1, y1] = g;
  if (Math.max(x0, x1) < r.x || Math.min(x0, x1) > r.x + r.w || Math.max(y0, y1) < r.y || Math.min(y0, y1) > r.y + r.h) return false;
  if (isV(g) || isH(g)) return true;
  const inside = (x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inside(x0, y0) || inside(x1, y1)) return true;
  const e: Seg[] = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x, r.y + r.h, r.x + r.w, r.y + r.h], [r.x, r.y, r.x, r.y + r.h]];
  return e.some((q) => crossAt(g, q, 0) !== null);
}

// ---------- проверки ----------

/** Случай: проверка, ключ связи, пояснение и место (px холста). */
export interface Issue {
  check: string;
  ks: string;
  text: string;
  x: number;
  y: number;
}

export interface Census {
  scene: string;
  scale: number;
  width: number;
  stars: number;
  /** связей «союз → ребёнок» в кадре (зубцы, обрывки к детям, шаги лент) */
  kids: number;
  /** Я1 путь у чужой звезды */
  y1: number;
  y2: number;
  y3: number;
  y4: number;
  y5: number;
  /** Я6: связей не по времени / всего зубцов */
  y6: number;
  y6of: number;
  /** Я7: стволов без узла / висячих */
  y7: number;
  /** Я8: пересечений без разрыва / всего пересечений; узлов на пересечениях */
  y8: number;
  y8of: number;
  y8nodes: number;
  y9: number;
  /** Я11: пересечений линий союзов между собой / со следами */
  y11: number;
  y11trails: number;
  /** Я12: подписи на чужих звёздах / на чужих линиях / всего подписей / наложения / высота строки */
  y12stars: number;
  y12lines: number;
  y12of: number;
  y12overlaps: number;
  rowPx: number;
  /** Я13: длинных связей целиком (должны быть обрывками) */
  y13: number;
  /** Я14: точек / названы оба конца / названо постороннее лицо */
  y14of: number;
  y14ends: number;
  y14foreign: number;
  /** Я15: двусмысленных связей */
  y15: number;
  issues: Issue[];
}

const STYLE_DASH = new Set(['by-luke', 'adoptive', 'alternative', 'levirate', 'legal']);

export function census(f: Frame): Census {
  const issues: Issue[] = [];
  const add = (check: string, ks: string, text: string, x: number, y: number) => issues.push({ check, ks, text, x, y });
  const starById = new Map<string, LinkStar>();
  for (const st of f.stars) if (!st.ghost) starById.set(st.id, st);
  const drawn = f.paths;
  const bad = new Map<string, Set<string>>();
  const mark = (ks: string, check: string) => {
    const b = bad.get(ks);
    if (b) b.add(check);
    else bad.set(ks, new Set([check]));
  };
  // связи «союз → ребёнок» в кадре: по ключу (зубец, обрывок) и шаги лент
  const kidKeys = new Set<string>();
  for (const q of drawn) if (q.key.kind === 'child') kidKeys.add(q.ks);
  for (const q of f.ribbons) kidKeys.add(q.ks);

  // Я1, Я5, Я6 (зубец): проверки грамматики links.ts по нарисованным путям
  const frameOf: LinkFrame = { ...f.d.frame, paths: [...drawn, ...f.ribbons] };
  const chk = links.checkLinks(frameOf, f.stars, ['always', 'short', 'full']);
  let y1 = 0;
  let y5 = 0;
  let y6 = 0;
  for (const c of chk) {
    if (c.check === 'star') {
      y1++;
      mark(c.ks, 'Я1');
      add('Я1', c.ks, c.text, 0, 0);
    } else if (c.check === 'oblique') {
      y5++;
      mark(c.ks, 'Я5');
      add('Я5', c.ks, c.text, 0, 0);
    } else if (c.check === 'tooth') {
      y6++;
      mark(c.ks, 'Я6');
      add('Я6', c.ks, c.text, 0, 0);
    }
  }
  // Я6: ствол в [рождение − 32; рождение − 5] у первого ребёнка на нём; x не убывает по пути
  const teeth = drawn.filter((q) => q.kind === 'tooth' && q.key.kind === 'child');
  const byTrunk = new Map<string, { x: number; kids: LinkStar[]; ks: string }>();
  for (const t of teeth) {
    const kid = starById.get(t.ends[t.ends.length - 1]);
    if (!kid) continue;
    const k = `${t.union}@${t.pts[0].toFixed(1)}`;
    const g = byTrunk.get(k);
    if (g) g.kids.push(kid);
    else byTrunk.set(k, { x: t.pts[0], kids: [kid], ks: t.ks });
  }
  for (const g of byTrunk.values()) {
    const first = Math.min(...g.kids.map((k) => k.x));
    const lead = first - g.x;
    if (lead < links.TRUNK_MIN - 0.6 || lead > links.TRUNK_MAX + 0.6) {
      y6++;
      mark(g.ks, 'Я6');
      add('Я6', g.ks, `ствол за ${lead.toFixed(1)} px до первого ребёнка`, g.x, 0);
    }
  }
  for (const q of drawn)
    for (let k = 2; k < q.pts.length; k += 2)
      if (q.pts[k] < q.pts[k - 2] - 0.5) {
        y6++;
        mark(q.ks, 'Я6');
        add('Я6', q.ks, `${q.kind}: справа налево`, q.pts[k], q.pts[k + 1]);
        break;
      }

  // Я2: вертикали разных союзов ближе 8 px с перекрытием по высоте
  // семья — родитель-владелец союзов (как у K4: отводы одного родителя — одна семья); стволы союзов одного отца на одной
  // вертикали — это шина с узлами каждого союза на ней (Г6), а не стволы разных семей
  type V = { x: number; y0: number; y1: number; u: string; ks: string };
  const famOf = (q: LinkPath) => {
    const u = q.union ? words.linkUnion({ kind: 'union', union: q.union }) : null;
    return u ? (u.a ?? u.b ?? q.union!) : (q.union ?? q.ks);
  };
  const vs: V[] = [];
  for (const q of drawn) for (const g of segs(q)) if (isV(g)) vs.push({ x: g[0], y0: Math.min(g[1], g[3]), y1: Math.max(g[1], g[3]), u: famOf(q), ks: q.ks });
  vs.sort((a, b) => a.x - b.x);
  let y2 = 0;
  const seen2 = new Set<string>();
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length && vs[j].x - vs[i].x < 8; j++) {
      const a = vs[i];
      const b = vs[j];
      if (a.u === b.u) continue;
      if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.5) continue;
      const pk = [a.u, b.u].sort().join('|');
      if (seen2.has(pk)) continue;
      seen2.add(pk);
      y2++;
      mark(a.ks, 'Я2');
      mark(b.ks, 'Я2');
      add('Я2', `${a.ks} ${b.ks}`, `вертикали ${Math.abs(b.x - a.x).toFixed(1)} px`, a.x, a.y0);
    }

  // Я3: близкие параллели разных связей (связь × связь, связь × чужой след, лента × связь)
  type S = { g: Seg; key: string; u: string; kind: string; ends: string[] };
  const all: S[] = [];
  for (const q of drawn) for (const g of segs(q)) all.push({ g, key: q.ks, u: q.union ?? q.ks, kind: q.kind, ends: q.ends });
  for (const q of f.ribbons) for (const g of segs(q)) all.push({ g, key: q.ks, u: `rib:${q.ends.join('>')}`, kind: 'ribbon', ends: q.ends });
  for (const t of f.trails) all.push({ g: [t.x0, t.y, t.x1, t.y], key: `life:${t.id}`, u: `life:${t.id}`, kind: 'trail', ends: [t.id] });
  const grid = new Map<number, number[]>();
  const cell = 48;
  const cellKey = (cx: number, cy: number) => cx * 100003 + cy;
  all.forEach((s, i) => {
    const [x0, y0, x1, y1] = s.g;
    for (let cx = Math.floor(Math.min(x0, x1) / cell); cx <= Math.floor(Math.max(x0, x1) / cell); cx++)
      for (let cy = Math.floor(Math.min(y0, y1) / cell); cy <= Math.floor(Math.max(y0, y1) / cell); cy++) {
        const k = cellKey(cx, cy);
        const a = grid.get(k);
        if (a) a.push(i);
        else grid.set(k, [i]);
      }
  });
  const near = (g: Seg, pad: number) => {
    const out = new Set<number>();
    for (let cx = Math.floor((Math.min(g[0], g[2]) - pad) / cell); cx <= Math.floor((Math.max(g[0], g[2]) + pad) / cell); cx++)
      for (let cy = Math.floor((Math.min(g[1], g[3]) - pad) / cell); cy <= Math.floor((Math.max(g[1], g[3]) + pad) / cell); cy++) for (const j of grid.get(cellKey(cx, cy)) ?? []) out.add(j);
    return out;
  };
  const agg = new Map<string, { len: number; a: S; b: S }>();
  all.forEach((a, i) => {
    if (a.kind === 'trail') return;
    for (const j of near(a.g, 6)) {
      if (j === i) continue;
      const b = all[j];
      if (b.kind !== 'trail' && j < i) continue;
      if (a.u === b.u) continue;
      // лента вдоль следа родителя своего шага и связь вдоль следа своего конца — одна дорога
      if (b.kind === 'trail' && a.ends.includes(b.ends[0])) continue;
      if (a.kind === 'ribbon' && b.kind === 'ribbon') continue;
      // лента и путь своего союза (ствол к ребёнку линии идёт той же дорогой до узла)
      if ((a.kind === 'ribbon' || b.kind === 'ribbon') && a.ends.some((e) => b.ends.includes(e))) continue;
      const len = parallelLen(a.g, b.g, 12, 6);
      if (len <= 0) continue;
      const pk = [a.key, b.key].sort().join(' ‖ ');
      const w = agg.get(pk);
      if (w) w.len += len;
      else agg.set(pk, { len, a, b });
    }
  });
  let y3 = 0;
  for (const [pk, w] of agg) {
    if (w.len <= 24) continue;
    y3++;
    if (w.a.kind !== 'trail') mark(w.a.key, 'Я3');
    if (w.b.kind !== 'trail') mark(w.b.key, 'Я3');
    add('Я3', pk, `${w.a.kind} × ${w.b.kind}: ${w.len.toFixed(0)} px рядом`, w.a.g[0], w.a.g[1]);
  }

  // Я4: одна связь двумя путями — зубец к ребёнку, чей шаг рисует лента; два зубца одного ключа
  let y4 = 0;
  const ribKids = new Set(f.ribbons.map((q) => `${q.ends[0]}>${q.ends[1]}`));
  const toothCount = new Map<string, number>();
  for (const t of teeth) {
    toothCount.set(t.ks, (toothCount.get(t.ks) ?? 0) + 1);
    const kid = t.ends[t.ends.length - 1];
    if (t.ends.slice(0, -1).some((p) => ribKids.has(`${p}>${kid}`))) {
      y4++;
      mark(t.ks, 'Я4');
      add('Я4', t.ks, `к ${nameOf(kid)} — и зубец, и лента`, t.pts[2], t.pts[3]);
    }
  }
  for (const [ks, n] of toothCount)
    if (n > 1) {
      y4++;
      mark(ks, 'Я4');
      add('Я4', ks, `${n} зубца одной связи`, 0, 0);
    }

  // Я7: у ствола есть узел своего союза на его вертикали (◆, • или нить народа); узел — на следе владельца или у нити
  let y7 = 0;
  const nodesOf = new Map<string, typeof f.d.frame.nodes>();
  for (const n of f.nodes) {
    const a = nodesOf.get(n.union);
    if (a) a.push(n);
    else nodesOf.set(n.union, [n]);
  }
  const clanOf = new Set(drawn.filter((q) => q.kind === 'clan' || (q.kind === 'stub' && q.style === 'dots')).map((q) => q.union));
  const trunkXs = new Map<string, Set<number>>();
  for (const q of drawn) {
    if (q.kind !== 'trunk' || !q.union) continue;
    const xs = trunkXs.get(q.union) ?? new Set<number>();
    xs.add(Math.round(q.pts[0] * 2) / 2);
    trunkXs.set(q.union, xs);
  }
  const jogX = new Map<string, Set<number>>();
  for (const q of drawn)
    if (q.kind === 'jog' && q.union) {
      const xs = jogX.get(q.union) ?? new Set<number>();
      xs.add(Math.round(q.pts[q.pts.length - 2] * 2) / 2);
      jogX.set(q.union, xs);
    }
  for (const [u, xs] of trunkXs)
    for (const x of xs) {
      const ns = (nodesOf.get(u) ?? []).filter((n) => Math.abs(n.x - x) <= 1);
      const viaJog = jogX.get(u)?.has(x);
      if (!ns.length && !viaJog) {
        y7++;
        mark(`u:${u}`, 'Я7');
        add('Я7', u, `ствол без узла у x ${x}`, x, 0);
        continue;
      }
      for (const n of ns) {
        // узел • следующего гнезда семейной укладки стоит на главном стволе, а не на следе
        if (n.kind === 'join' && f.d.frame.layout === 'family') continue;
        const o = starById.get(n.owner);
        const onTrail = !!o && (o.x1 ?? o.x) >= n.x - 1.5 && Math.abs(o.y - n.y) < 0.75;
        if (!onTrail && !clanOf.has(u) && !viaJog) {
          y7++;
          add('Я7', u, `узел ${u} не на следе ${nameOf(n.owner)}`, n.x, n.y);
        }
      }
    }

  // Я8: пересечение вертикали связи с живым чужим следом — разрыв ≥ 2 px с каждой стороны; узлов на пересечениях нет
  let y8 = 0;
  let y8of = 0;
  let y8nodes = 0;
  const cutAt = new Map<number, number[]>();
  for (const q of [...drawn, ...f.ribbons]) for (let k = 0; k + 2 < q.cuts.length; k += 3) (cutAt.get(q.cuts[k]) ?? cutAt.set(q.cuts[k], []).get(q.cuts[k])!).push(q.cuts[k + 1], q.cuts[k + 2]);
  const trailRows = [...f.trails].sort((a, b) => a.y - b.y);
  const crossing: { q: LinkPath; t: (typeof f.trails)[number]; x: number }[] = [];
  for (const q of drawn)
    for (const g of segs(q)) {
      if (!isV(g)) continue;
      const lo = Math.min(g[1], g[3]) + 0.75;
      const hi = Math.max(g[1], g[3]) - 0.75;
      for (const t of trailRows) {
        if (t.y <= lo || t.y >= hi || q.ends.includes(t.id)) continue;
        if (g[0] <= t.x0 + 0.5 || g[0] >= t.x1 - 0.5) continue;
        crossing.push({ q, t, x: g[0] });
      }
    }
  for (const c of crossing) {
    y8of++;
    const cs = cutAt.get(c.t.i) ?? [];
    let ok = false;
    for (let k = 0; k + 1 < cs.length; k += 2) if (Math.abs(cs[k] - c.x) < 0.75 && cs[k + 1] >= 2) ok = true;
    if (!ok) {
      y8++;
      mark(c.q.ks, 'Я8');
      add('Я8', c.q.ks, `след ${nameOf(c.t.id)} без разрыва`, c.x, c.t.y);
    }
  }
  for (const n of f.nodes)
    for (const t of trailRows) {
      if (t.id === n.owner || Math.abs(t.y - n.y) > 0.75 || n.x <= t.x0 || n.x >= t.x1) continue;
      y8nodes++;
      add('Я8', n.union, `узел ${n.union} на чужом следе ${nameOf(t.id)}`, n.x, n.y);
    }

  // Я9: штрих — иное происхождение, точки — толкование и нить народа
  let y9 = 0;
  for (const q of [...drawn]) {
    if (q.style === 'solid') continue;
    const uu = q.union ? words.linkUnion(q.key.kind === 'step' ? q.key : q.key) : null;
    const ok =
      q.style === 'dash' ? !!uu?.claim && STYLE_DASH.has(uu.claim) && uu.id.includes('~') : q.kind === 'clan' || (q.kind === 'stub' && q.key.kind === 'union' && !q.pts.some((v, k) => k % 2 === 1 && v !== q.pts[1])) || uu?.kidsCert === 'interpretation';
    if (!ok) {
      y9++;
      mark(q.ks, 'Я9');
      add('Я9', q.ks, `${q.kind} ${q.style}`, q.pts[0], q.pts[1]);
    }
  }

  // Я11: пересечения линий союзов между собой и со следами (в семейных сценах)
  let y11 = 0;
  const lineSegs: { g: Seg; q: LinkPath }[] = [];
  for (const q of drawn) for (const g of segs(q)) lineSegs.push({ g, q });
  for (let i = 0; i < lineSegs.length; i++)
    for (let j = i + 1; j < lineSegs.length; j++) {
      const a = lineSegs[i];
      const b = lineSegs[j];
      if (a.q.union === b.q.union) continue;
      if (Math.max(a.g[0], a.g[2]) < Math.min(b.g[0], b.g[2]) || Math.max(b.g[0], b.g[2]) < Math.min(a.g[0], a.g[2])) continue;
      if (Math.max(a.g[1], a.g[3]) < Math.min(b.g[1], b.g[3]) || Math.max(b.g[1], b.g[3]) < Math.min(a.g[1], a.g[3])) continue;
      const p = crossAt(a.g, b.g);
      if (!p) continue;
      y11++;
      mark(a.q.ks, 'Я11');
      mark(b.q.ks, 'Я11');
      add('Я11', `${a.q.ks} × ${b.q.ks}`, 'пересечение линий союзов', p[0], p[1]);
    }
  const y11trails = crossing.length;

  // Я12: подписи на чужих звёздах, на чужих линиях, наложения, высота строки
  let y12stars = 0;
  let y12lines = 0;
  const pathSegs: { g: Seg; ends: string[]; ks: string; union: string | null }[] = [];
  for (const q of [...drawn, ...f.ribbons]) for (const g of segs(q)) pathSegs.push({ g, ends: q.ends, ks: q.ks, union: q.union });
  for (const b of f.boxes) {
    // знак узла союза (◆ и «+N»: kind 'plate' без текста) — не подпись: он стоит на своей линии; в замере он для наложений
    if (b.kind === 'plate' && !b.text) continue;
    const own = b.id ?? '';
    for (const st of f.stars) {
      if (st.id === own || st.ghost) continue;
      const cx = Math.max(b.x, Math.min(st.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(st.y, b.y + b.h));
      if (Math.hypot(cx - st.x, cy - st.y) < st.r - 0.5) {
        y12stars++;
        add('Я12', own, `подпись «${b.text}» на звезде ${nameOf(st.id)}`, b.x, b.y);
        break;
      }
    }
    // своя линия подписи: у подписи звезды — линии лица, у подписи связи — линии её союза (id подписи — союз)
    const on = pathSegs.find((s) => !s.ends.includes(own) && s.union !== own && s.ks !== own && segInRect(s.g, { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }));
    if (on) {
      y12lines++;
      add('Я12', own, `подпись «${b.text}» (${b.kind}) на линии ${on.ks}`, b.x, b.y);
    }
  }

  // Я13: длинные связи на «всех лицах»: ствол длиннее 8 строк через живые чужие следы — только обрывками
  let y13 = 0;
  if (f.d.frame.layout === 'map')
    for (const q of drawn) {
      if (q.kind !== 'trunk' || q.when !== 'always') continue;
      const [x, a, , b] = q.pts;
      if (Math.abs(b - a) <= links.LONG_ROWS * f.ky) continue;
      if (crossing.some((c) => c.q === q)) {
        y13++;
        mark(q.ks, 'Я13');
        add('Я13', q.ks, `ствол ${Math.abs(b - a).toFixed(0)} px целиком`, x, a);
      }
    }

  // Я14: наведение по линии (точки через 6 px, без 14 px у концов) — что назовёт атлас (как src/ui/sky/input.ts, underPointer)
  let y14of = 0;
  let y14ends = 0;
  let y14foreign = 0;
  const s = f.s;
  const sameUnion = (k: import('../src/engine/linkkey.ts').LinkKey, q: LinkPath) =>
    k.kind === 'step' ? q.key.kind === 'step' && q.key.child === k.child : 'union' in k && k.union === q.union && (q.key.kind !== 'child' || (k.kind === 'child' && k.child === q.key.child) || k.kind === 'union');
  for (const q of [...drawn, ...f.ribbons]) {
    const sg = segs(q);
    const total = sg.reduce((a, g) => a + Math.hypot(g[2] - g[0], g[3] - g[1]), 0);
    let at = 0;
    for (const g of sg) {
      const len = Math.hypot(g[2] - g[0], g[3] - g[1]);
      for (let t = 6 - (at % 6); t < len; t += 6) {
        const pos = at + t;
        if (pos < 14 || total - pos < 14) continue;
        const x = g[0] + ((g[2] - g[0]) * t) / len;
        const y = g[1] + ((g[3] - g[1]) * t) / len;
        if (x < 0 || y < 0 || x > s.cam.w || y > s.cam.h) continue;
        // общий участок двух шагов лент (коса по следу родителя) — одна дорога двух связей: наведение называет одну из них
        if (q.kind === 'ribbon' && f.ribbons.some((o) => o.ks !== q.ks && segs(o).some((h) => links.distSeg(x, y, h[0], h[1], h[2], h[3]) < 1))) continue;
        y14of++;
        const star = s.hitStar(x, y, 12);
        const line = s.linkAt(x, y, 6, q.kind === 'ribbon');
        const r = star ? glyphs.starRadius(atlas.byId.get(star.id)?.magnitude ?? 6, labels.zoomScaleFor(s.cam.ky)) + (atlas.byId.get(star.id)?.sex === 'f' ? 2.2 : 0) : 0;
        if (star && !(line && line.d <= 2 && star.d > r + 5)) {
          if (!q.ends.includes(star.id)) y14foreign++;
          continue;
        }
        if (line && sameUnion(line.key, q)) y14ends++;
      }
      at += len;
    }
  }

  const rowPx = f.ky;
  const y15 = [...kidKeys].filter((k) => bad.has(k)).length;
  return {
    scene: f.sc.id, scale: f.scale, width: f.width, stars: f.stars.length, kids: kidKeys.size,
    y1, y2, y3, y4, y5, y6, y6of: teeth.length, y7, y8, y8of, y8nodes, y9, y11, y11trails,
    y12stars, y12lines, y12of: f.boxes.filter((b) => !(b.kind === 'plate' && !b.text)).length, y12overlaps: f.overlaps, rowPx, y13, y14of, y14ends, y14foreign, y15, issues,
  };
}

// ---------- пороги § 12 ----------

/** Нарушенные пороги Я1–Я15 для переписи сцены: пусто — все пороги соблюдены. */
export function violations(c: Census): string[] {
  const out: string[] = [];
  const fam = SCENES[c.scene]?.family ?? false;
  const need = (ok: boolean, text: string) => ok || out.push(text);
  need(fam ? c.y1 === 0 : c.y1 <= 4, `Я1: ${c.y1}`);
  need(c.y2 === 0, `Я2: ${c.y2}`);
  need(fam ? c.y3 === 0 : c.y3 <= 20, `Я3: ${c.y3}`);
  need(c.y4 === 0, `Я4: ${c.y4}`);
  need(c.y5 === 0, `Я5: ${c.y5}`);
  need(c.y6 === 0, `Я6: ${c.y6}`);
  need(c.y7 === 0, `Я7: ${c.y7}`);
  need(c.y8 === 0 && c.y8nodes === 0, `Я8: ${c.y8}/${c.y8of}, узлов ${c.y8nodes}`);
  need(c.y9 === 0, `Я9: ${c.y9}`);
  need(c.y11 === 0, `Я11: ${c.y11}`);
  if (fam) need(c.scene === 'judah' ? c.y11trails <= 10 : c.y11trails === 0, `Я11 (следы): ${c.y11trails}`);
  need(c.y12stars === 0, `Я12 (звёзды): ${c.y12stars}`);
  need(c.y12lines <= Math.max(1, 0.01 * c.y12of), `Я12 (линии): ${c.y12lines}/${c.y12of}`);
  need(c.y12overlaps === 0, `Я12 (наложения): ${c.y12overlaps}`);
  if (fam && c.scale === 1) need(c.rowPx >= (c.width < 600 ? 32 : 24) - 0.5, `Я12 (строка): ${c.rowPx.toFixed(1)} px`);
  need(c.y13 === 0, `Я13: ${c.y13}`);
  need(!c.y14of || c.y14ends / c.y14of >= 0.95, `Я14: концы ${pct(c.y14ends, c.y14of)}`);
  need(c.y14foreign === 0, `Я14: постороннее лицо ${c.y14foreign}`);
  need(!c.kids || c.y15 / c.kids <= 0.02, `Я15: ${c.y15}/${c.kids}`);
  return out;
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '—');

/** Строка таблицы переписи. */
export function row(c: Census): string {
  return `| ${c.scene} | ${c.scale} | ${c.width} | ${c.rowPx.toFixed(1)} | ${c.stars} | ${c.kids} | ${c.y1} | ${c.y2} | ${c.y3} | ${c.y4} | ${c.y5} | ${c.y6}/${c.y6of} | ${c.y7} | ${c.y8}/${c.y8of} (${c.y8nodes}) | ${c.y9} | ${c.y11} / ${c.y11trails} | ${c.y12stars} / ${c.y12lines} / ${c.y12overlaps} | ${c.y13} | ${pct(c.y14ends, c.y14of)} / ${c.y14foreign} | ${c.y15} (${pct(c.y15, c.kids)}) |`;
}
export const HEAD =
  '| сцена | × | ширина | px/строка | звёзд | связей к детям | Я1 | Я2 | Я3 | Я4 | Я5 | Я6 | Я7 | Я8 (узлов) | Я9 | Я11 линии / следы | Я12 звёзды / линии / наложения | Я13 | Я14 концы / чужие | Я15 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';

// ---------- прогон ----------

if (process.env.CENSUS_MAIN === '1') {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
  };
  const scenes = arg('scene', Object.keys(SCENES).join(',')).split(',').filter(Boolean);
  const scales = arg('scale', '1,2').split(',').map(Number);
  const widths = arg('width', '1440').split(',').map(Number);
  const top = Number(arg('top', '8'));
  const out: Census[] = [];
  console.log(HEAD);
  for (const id of scenes)
    for (const w of widths)
      for (const k of scales) {
        const t0 = performance.now();
        const c = census(capture(id, k, w));
        out.push(c);
        console.log(`${row(c)} ${Math.round(performance.now() - t0)} мс`);
      }
  for (const c of out) {
    const v = violations(c);
    if (v.length) console.log(`\n${c.scene} ×${c.scale} ${c.width}: нарушено ${v.join('; ')}`);
    const byCheck = new Map<string, Issue[]>();
    for (const q of c.issues) (byCheck.get(q.check) ?? byCheck.set(q.check, []).get(q.check)!).push(q);
    for (const [k, qs] of byCheck) console.log(`  ${k}: ${qs.slice(0, top).map((q) => q.text).join('; ')}${qs.length > top ? `; ещё ${qs.length - top}` : ''}`);
  }
  const json = arg('json', '');
  if (json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(json, JSON.stringify(out.map((c) => ({ ...c, issues: c.issues.slice(0, 200) })), null, 1));
  }
}
