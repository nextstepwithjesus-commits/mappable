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
 *  Я9  штрих — иное происхождение, точки — только толкование, бледная сплошная — родовая черта народа; Я10 цвет связей без выбранного лица;
 *  Я11 пересечения линий союзов между собой и со следами;    Я12 подписи на чужих звёздах, на линиях, наложения, строка;
 *  Я13 обрывков нет (этап 15, решение 176: связь целиком); Я14 наведение по линии называет её концы, не постороннего;
 *  Я15 доля двусмысленных связей.
 * Этап 13 (решения 93–95, X3 § 3): сцены показов «ключевые лица», «все колена», «Колено Иудино», «Дом Давидов», род
 * Давида, Халев, Саул, Ашхур, набор с пропусками, созвездие «Родословие Иисуса Христа»; проверки
 *  Ч1  путь ленты с ключом шага начинается у родителя шага по data/lines (иначе это «цепочка» span);
 *  Ч2  концы ломаных выбранной связи — только звезда конца, узел своего союза, призрак или кромка (все ключи кадра);
 *  Ч3  у связи со скрытым концом есть призрак этого конца;
 *  Ч4  разреженная нить ленты — только у шага по толкованию; каждый пропуск показа — «+N» с верным числом;
 *      Я9 на лентах: штрих — только «по закону» и Нирий → Салафиил по Луке;
 *  Ч5  лицо линии не дальше строки от своей нити (показ «линии Мессии»);
 *  Ч6  оба супруга на небе → союз связан с обоими (путь союза с его концом, узел на его следе или имя у ромба);
 *  Ч7  точечный путь связи — только толкование.
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
import type { LinkKey } from '../src/engine/linkkey.ts';
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
const ribbonsR = await import('../src/render/ribbons.ts');
const lk = await import('../src/engine/linkkey.ts');
const reveal = await import('../src/ui/reveal.ts');
type Sky = InstanceType<typeof skyMod.Sky>;

/** y следа звезды в x (links.ts, trailYAt; на сборке до этапа 15 — строка звезды): перепись меряет и «до». */
const trailY = (st: LinkStar, x: number): number => (links as { trailYAt?: (s: LinkStar, x: number) => number }).trailYAt?.(st, x) ?? st.y;
const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const M = () => atlas.models[0];
const nameOf = (id: string) => atlas.byId.get(id)?.name ?? id;

// ---------- записывающий холст ----------

// ---------- ширины текста: таблица шрифтов неба (этап 14, контракт 5 S2 → S1; tools/font-widths.json) ----------

interface FontRow {
  family: string;
  weight: number;
  italic: boolean;
  size: number;
  spacing: number;
  em: Record<string, number>;
}
const FONT_TABLE: FontRow[] = await (async () => {
  try {
    const { readFileSync } = await import('node:fs');
    const t = JSON.parse(readFileSync(new URL('./font-widths.json', import.meta.url), 'utf8')) as { fonts: Record<string, FontRow> };
    return Object.values(t.fonts);
  } catch {
    return [];
  }
})();
const fontMemo = new Map<string, FontRow | null>();
/** Строка таблицы для ctx.font: то же семейство и начертание, ближайшие насыщенность и кегль. */
function fontRow(font: string): FontRow | null {
  const was = fontMemo.get(font);
  if (was !== undefined) return was;
  const italic = /\bitalic\b/.test(font);
  const weight = Number(/\b(\d{3})\b/.exec(font)?.[1] ?? 400);
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13);
  const family = /Jost|sans/i.test(font) && !/Literata/i.test(font) ? 'sans' : 'serif';
  let best: FontRow | null = null;
  let bd = Infinity;
  for (const r of FONT_TABLE) {
    if (r.family !== family || r.italic !== italic || r.spacing) continue;
    const d = Math.abs(r.weight - weight) / 100 + Math.abs(r.size - size) / 4;
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  fontMemo.set(font, best);
  return best;
}
/** Ширина строки шрифтом font, px: по таблице (доли кегля на знак), без неё — 0,56 кегля на знак (оценка K4). */
export function textWidth(text: string, font: string, letterSpacing = 0): number {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13);
  const r = fontRow(font);
  if (!r) return text.length * size * 0.56 + letterSpacing * text.length;
  const avg = r.em['о'] ?? 0.55;
  let w = 0;
  for (const ch of text) w += r.em[ch] ?? avg;
  return w * size + letterSpacing * [...text].length;
}

/** Холст без рисования: ширина текста — по таблице шрифтов неба (tools/font-widths.json; прежде — 0,56 кегля на знак). */
function blankCanvas(): HTMLCanvasElement {
  let font = '13px serif';
  let spacing = 0;
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13);
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (s: string) => ({ width: textWidth(s, font, spacing), actualBoundingBoxAscent: px() * 0.72, actualBoundingBoxDescent: px() * 0.22 });
      if (k === 'canvas') return canvas;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'font') font = String(v);
      if (k === 'letterSpacing') spacing = parseFloat(String(v)) || 0;
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
  /** общая раскладка показа на масштабе чтения «всех лиц» (большой холст на весь показ, как у сцены all) */
  reading?: boolean;
}

const TRIBES = ['reuben', 'simeon', 'levi', 'judah', 'dan', 'naphtali', 'gad', 'asher', 'issachar', 'zebulun', 'joseph', 'benjamin'];

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
  // этап 13 (X3 § 3): показы с пропусками и созвездия
  key: { id: 'key', title: '«Ключевые лица»', show: { kind: 'key' }, select: null, family: false, reading: true },
  keyMary: { id: 'keyMary', title: '«Ключевые лица», выбрана Мария', show: { kind: 'key' }, select: 'mariya', family: false, reading: true },
  tribes: { id: 'tribes', title: 'Все колена', show: { kind: 'groups', groups: TRIBES, links: 'stubs' }, select: null, family: false, reading: true },
  judahT: { id: 'judahT', title: '«Колено Иудино»', show: { kind: 'groups', groups: ['judah'], links: 'stubs' }, select: 'iuda', family: true },
  davidic: { id: 'davidic', title: '«Дом Давидов»', show: { kind: 'groups', groups: ['davidic'], links: 'stubs' }, select: 'david', family: true },
  davidBoth: { id: 'davidBoth', title: 'Род Давида, оба направления, 2 поколения', show: { kind: 'lineage', id: 'david', dir: 'both', gen: 2, by: 'father' }, select: 'david', family: true },
  halev: { id: 'halev', title: 'Халев, сын Есрома: дети', show: { kind: 'lineage', id: 'khalev-syn-esroma', dir: 'down', gen: 1, by: 'father' }, select: 'khalev-syn-esroma', family: true },
  saul: { id: 'saul', title: 'Саул: дети', show: { kind: 'lineage', id: 'saul', dir: 'down', gen: 1, by: 'father' }, select: 'saul', family: true },
  ashhur: { id: 'ashhur', title: 'Ашхур: дети', show: { kind: 'lineage', id: 'ashkhur', dir: 'down', gen: 1, by: 'father' }, select: 'ashkhur', family: true },
  setGap: { id: 'setGap', title: 'Набор с пропусками поколений', show: { kind: 'set' }, select: 'noy', family: true, set: ['adam', 'sif', 'noy', 'sim', 'avraam', 'david', 'mariya', 'iisus'] },
  messiah: { id: 'messiah', title: 'Созвездие «Родословие Иисуса Христа»', show: { kind: 'groups', groups: ['messiah'], links: 'stubs' }, select: null, family: true },
};
/** Сцены этапа 11 (§ 12) — прогон по умолчанию и прежние тесты. */
export const STAGE11_SCENES = ['all', 'adam', 'noy', 'avraam', 'iakov', 'david', 'nahor', 'judah', 'benjamin', 'lines'];

/** Сцена на небе: показ, набор и выбор — через модель показа (src/ui/show.ts), как у атласа. */
function applyScene(sc: Scene) {
  if (sc.set) work.workSet.value = new Map(sc.set.filter((id) => atlas.byId.has(id)).map((id) => [id, { via: 'self', of: id }]));
  state.selected.value = sc.select;
  work.setShowState(sc.show, { anchor: sc.select, history: 'replace' });
  return show.skyShow.value;
}

/** Правило окна (trails.ts, windowRule; решение 136): на сборке до этапа 14 его нет. */
function windowRule(on: boolean) {
  const w = (trails as unknown as { windowRule?: { on: boolean } }).windowRule;
  if (w) w.on = on;
}

/**
 * Окно кадра связей (links.ts, linkWindow; С1): в приложении связи строятся по звёздам окна и ширины окна с каждой
 * стороны; перепись меряет кадр по всему небу (пороги — на всё, что построено), поэтому окно выключено. Тест сверяет,
 * что в окне связи те же (tests/census.test.ts).
 */
export function linkWindowRule(on: boolean) {
  const w = (links as unknown as { linkWindow?: { on: boolean } }).linkWindow;
  if (w) w.on = on;
}
linkWindowRule(false);

/** Пути кадра в видимой части неба: «вид|когда|ключ|x,y,…» (px холста) — для сверки окна кадра связей. */
export function pathsInView(f: Frame): string[] {
  const vp = f.s.cam.vp;
  const d = f.d;
  const out: string[] = [];
  for (const q of f.paths) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k + 1 < q.pts.length; k += 2) {
      x0 = Math.min(x0, q.pts[k] + d.dx);
      x1 = Math.max(x1, q.pts[k] + d.dx);
      y0 = Math.min(y0, q.pts[k + 1] + d.dy);
      y1 = Math.max(y1, q.pts[k + 1] + d.dy);
    }
    if (x1 >= vp.l && x0 <= vp.r && y1 >= vp.t && y0 <= vp.b) out.push(`${q.kind}|${q.when}|${q.ks}|${q.pts.map((v, k) => Math.round(v + (k % 2 ? d.dy : d.dx))).join(',')}`);
  }
  return out.sort();
}

function newSky(w: number, h: number, sc: Scene): Sky {
  windowRule(true);
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
  /** живые следы: узел, лицо, строка, от и до (px); у лица с переходом — горизонтали его пребываний (решение 173) */
  trails: { i: number; id: string; y: number; x0: number; x1: number }[];
  /** участки переходов следов (решение 173): отрезки S-кривых, px */
  glides: { i: number; id: string; g: [number, number, number, number] }[];
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
export function captureAt(id: string, at: string, years: number, o: { width?: number; height?: number; select?: string | null; extra?: Record<string, unknown> } = {}): Frame {
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
  return frameOf(sc, s, 1, width, o.extra);
}

/** Окно неба адреса «~y…~w…~l…» (src/ui/address.ts, cameraFor): год середины, лет на ширину видимой части, полоса середины. */
export interface ViewAt {
  year: number;
  width: number;
  lane: number;
}

/**
 * Кадр «всего неба» в окне адреса (этап 14, GRAPH STRESS, отчёт G § 6): окно view или окно лица person (как перелёт к
 * лицу: viewForPerson), выбор select, выбранная связь link, ширина неба width (940 — с открытой карточкой справа).
 */
export function captureView(id: string, at: ViewAt | { person: string }, o: { width?: number; height?: number; select?: string | null; link?: LinkKey | null; extra?: Record<string, unknown> } = {}): Frame {
  const sc = { ...SCENES[id], select: o.select === undefined ? SCENES[id].select : o.select };
  const width = o.width ?? 1440;
  const s = newSky(width, o.height ?? (width < 600 ? 700 : 776), sc);
  const vp = s.cam.vp;
  const [, cy] = s.cam.vpCenter();
  if ('person' in at) {
    const n = s.node(at.person);
    if (!n) throw new Error(`[${id}] нет лица ${at.person}`);
    const c = M().chrono.get(at.person);
    const life = c ? Math.max(40, (c.d ?? c.dEst) - c.b) : 80;
    const span = Math.max(120, Math.min(900, life * 2.6));
    const x0 = s.xOf(n.t0 - span * 0.35);
    const x1 = s.xOf(n.t0 + span * 0.65);
    const kx = (vp.r - vp.l) / Math.max(1e-6, x1 - x0);
    s.cam.set({ x0: x0 - vp.l / kx, kx, laneTop: s.rowOf(n.lane) + cy / s.cam.kyFor(kx) });
  } else {
    const xc = s.xOf(at.year < 0 ? at.year + 1 : at.year);
    const half = (vp.r - vp.l) / 2;
    const span = (kx: number) => s.tOf(xc + half / kx) - s.tOf(xc - half / kx);
    let lo = Math.log(1e-6);
    let hi = Math.log(1e4);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (span(Math.exp(mid)) > at.width) lo = mid;
      else hi = mid;
    }
    const kx = Math.exp((lo + hi) / 2);
    const [cx] = s.cam.vpCenter();
    s.cam.set({ x0: xc - cx / kx, kx, laneTop: s.rowOf(at.lane) + cy / s.cam.kyFor(kx) });
  }
  return frameOf(sc, s, 1, width, { ...(o.link ? { link: o.link } : {}), ...(o.extra ?? {}) });
}

/** Нарисовать сцену и снять геометрию кадра. scale — ×1 или ×2; width — ширина окна (1440 или 390). */
export function capture(id: string, scale = 1, width = 1440): Frame {
  const sc = SCENES[id];
  const height = width < 600 ? 700 : 776;
  let s: Sky;
  // холст во всё небо: окно читателя — всё небо, и правило окна (решение 136) раскрыло бы все длинные связи; перепись
  // «всего неба» считает обрывки, окна читателя — сцены GRAPH STRESS (captureView)
  windowRule(!(sc.reading || (!sc.family && sc.show.kind === 'all')));
  if (sc.reading || (!sc.family && sc.show.kind === 'all')) {
    // «все лица» целиком: большой холст на всё небо при масштабе «лицо и поколения вокруг»; показы общей раскладки
    // («ключевые лица», все колена) — на том же масштабе чтения и тем же холстом (X3 § 3)
    const ref = newSky(width, height, SCENES.all);
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
  windowRule(!(sc.reading || (!sc.family && sc.show.kind === 'all')));
  return frameOf(sc, s, scale, width);
}

/** Путь нарисован (trails.ts, linkOn; на сборке до этапа 14 — прежнее правило): перепись работает и на базе для чисел «до». */
const T = trails as unknown as { unionOn?: (d: NonNullable<ReturnType<Sky['linkFrame']>>, u: string, owner: string, from: string) => boolean; linkOn?: (q: LinkPath, d: NonNullable<ReturnType<Sky['linkFrame']>>) => boolean; stubPathOf?: (f: LinkFrame, st: LinkFrame['stubs'][number]) => LinkPath | null };
const on = (q: LinkPath, d: NonNullable<ReturnType<Sky['linkFrame']>>) => (T.linkOn ? T.linkOn(q, d) : trails.linkShown(q, d) && (d.alpha > 0.01 || d.lit(q)));

/** Кадр готового неба: рисует его дважды (места подписей устоялись) и снимает геометрию. */
export function frameOf(sc: Scene, s: Sky, scale: number, width: number, extra: Record<string, unknown> = {}): Frame {
  const st = { ...drawState(sc), ...extra } as Parameters<Sky['draw']>[0];
  s.draw(st);
  s.draw(st);
  const d = s.linkFrame();
  if (!d) throw new Error(`[${sc.id}] связей в кадре нет`);
  // нарисованные в кадре пути: по правилу длинных связей и видимые при этой подробности (или выделенные)
  const shown = d.frame.paths.filter((q) => on(q, d));
  const lt = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 } as import('../src/render/trails.ts').LifeTrail;
  const tr: Frame['trails'] = [];
  const glides: Frame['glides'] = [];
  const pathOf = new Map<number, readonly number[]>();
  for (const q of s.linkStarsNow()) if (!q.ghost && q.path && q.path.length >= 4) pathOf.set(q.i, q.path);
  for (let i = 0; i < s.nodes.length; i++) {
    if (!s.drawn(i)) continue;
    const lp = pathOf.get(i);
    if (lp) {
      // след с переходом (решение 173): горизонтали пребываний — строками, S-кривые — отрезками
      for (let k = 0; k + 3 < lp.length; k += 2) {
        const [x0, y0, x1, y1] = [lp[k], lp[k + 1], lp[k + 2], lp[k + 3]];
        if (x1 - x0 < 0.01) continue;
        if (Math.abs(y1 - y0) < 0.01) tr.push({ i, id: s.nodes[i].person, y: y0, x0, x1 });
        else glides.push({ i, id: s.nodes[i].person, g: [x0, y0, x1, y1] });
      }
      continue;
    }
    if (trails.trailOf(s, i, lt) && lt.x1 > lt.x0 + 1) tr.push({ i, id: s.nodes[i].person, y: lt.y, x0: lt.x0, x1: lt.x1 });
  }
  const ls = s.labelStats();
  return {
    sc, scale, width, s, d,
    paths: shown.filter((q) => q.kind !== 'ribbon'),
    // ленты — по маршрутам только на масштабе семьи; на обзоре нарисован сплайн (ribbons.ts), и маршрут не считается
    ribbons: s.routeFactor >= 0.5 ? shown.filter((q) => q.kind === 'ribbon') : [],
    // узлы — те, что нарисованы: на «всех лицах» теснее поколения в 18 px ромбов нет (plates.ts, genRoom), видимость — по
    // ярусу линий союза (решение 135)
    nodes: d.frame.layout === 'map' && s.genRoom < 0.5 ? [] : d.frame.nodes.filter((n) => (T.unionOn ? T.unionOn(d, n.union, n.owner, n.from) : d.alpha > 0.01 || d.lit({ ends: [n.owner, n.from] } as unknown as LinkPath)) && !(d.frame.ribbonOnly?.has(n.union) && s.routeFactor < 0.5)),
    stars: s.linkStarsNow(), trails: tr, glides,
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
  /** Я11: пересечений линий союзов между собой без разрыва / со следами; y11of — всех пересечений связь × связь */
  y11: number;
  y11of: number;
  y11trails: number;
  /** Я12: подписи на чужих звёздах / на чужих линиях / всего подписей / наложения / высота строки */
  y12stars: number;
  y12lines: number;
  y12of: number;
  y12overlaps: number;
  rowPx: number;
  /** Я13: обрывков (этап 15, решение 176: должно быть 0) */
  y13: number;
  /** Я14: точек / названы оба конца / названо постороннее лицо */
  y14of: number;
  y14ends: number;
  y14foreign: number;
  /** Я15: двусмысленных связей */
  y15: number;
  /** этап 13: Ч1 шагов лент от не-родителя; Ч2 выбранных связей от чужой звезды; Ч3 скрытых концов без призрака */
  ch1: number;
  ch2: number;
  ch3: number;
  /** Ч3: связей кадра со скрытым концом (из них с призраком — ch3of − ch3) */
  ch3of: number;
  /** Ч4: разреженная нить не по толкованию, штрих не по закону (Я9 на лентах), «+N» с неверным числом */
  ch4: number;
  /** Ч4: разрывов лент «+N» в кадре */
  ch4gaps: number;
  ch5: number;
  ch6: number;
  ch7: number;
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
  // родовая черта (Г12) и её обрывки — горизонтальные обрывки союза (этап 13: сплошные или бледные, не точки)
  const clanStub = (q: LinkPath) => q.kind === 'stub' && q.key.kind === 'union' && !q.pts.some((v, k) => k % 2 === 1 && v !== q.pts[1]);
  const clanOf = new Set(drawn.filter((q) => q.kind === 'clan' || clanStub(q)).map((q) => q.union));
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
        // узел, ушедший со следа с ленты по своему стволу (решение 166), стоит на столбце следа: след — на y − off
        const onTrail = !!o && (o.x1 ?? o.x) >= n.x - 1.5 && Math.abs(trailY(o, n.x) - (n.y - ((n as { off?: number }).off ?? 0))) < 0.75;
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
      // переходы следов (решение 173): вертикаль режет S-кривую там, где она проходит x
      for (const gl of f.glides) {
        const [ax, ay, bx, by] = gl.g;
        if (q.ends.includes(gl.id) || g[0] <= ax + 0.5 || g[0] >= bx - 0.5) continue;
        const y = ay + ((by - ay) * (g[0] - ax)) / (bx - ax);
        if (y > lo && y < hi) crossing.push({ q, t: { i: gl.i, id: gl.id, y, x0: ax, x1: bx }, x: g[0] });
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

  // Я9: штрих — иное происхождение, точки — только толкование (этап 13, решение 94), бледная сплошная — родовая черта
  // народа (Г12)
  let y9 = 0;
  const peopleOwner = (q: LinkPath) => {
    const o = atlas.byId.get(q.ends[0]);
    return o?.kind === 'people' || o?.kind === 'clan';
  };
  for (const q of [...drawn]) {
    if (q.style === 'solid') continue;
    const uu = q.union ? words.linkUnion(q.key.kind === 'step' ? q.key : q.key) : null;
    const ok =
      q.style === 'dash'
        ? !!uu?.claim && STYLE_DASH.has(uu.claim) && uu.id.includes('~')
        : q.style === 'faint'
          ? (q.kind === 'clan' || (q.kind === 'stub' && q.key.kind === 'union' && !q.pts.some((v, k) => k % 2 === 1 && v !== q.pts[1]))) && peopleOwner(q)
          : q.kind !== 'clan' && uu?.kidsCert === 'interpretation';
    if (!ok) {
      y9++;
      mark(q.ks, 'Я9');
      add('Я9', q.ks, `${q.kind} ${q.style}`, q.pts[0], q.pts[1]);
    }
  }

  // Я11: пересечения линий союзов между собой без разрыва (этап 14, решение 134: пересечение связей разных союзов —
  // разрывом нижней по ярусу, как след под вертикалью; links.ts, linkCrossings) и со следами (в семейных сценах);
  // y11of — всех пересечений связь × связь
  let y11 = 0;
  let y11of = 0;
  const pathIdx = new Map(f.d.frame.paths.map((q, i) => [q, i] as const));
  const hasCut = (a: LinkPath, b: LinkPath) => {
    const j = pathIdx.get(b);
    const xc = a.xcuts ?? [];
    for (let k = 3; k < xc.length; k += 4) if (xc[k] === j) return true;
    return false;
  };
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
      y11of++;
      if (hasCut(a.q, b.q) || hasCut(b.q, a.q)) continue;
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
    // знак «+N» в разрыве ленты (этап 13, К4) стоит на своей ленте: её «цепочки» (обеих линий) — его линии
    const gapPair = b.kind === 'mark' && own.startsWith('gap:') ? own.slice(4).split('>') : null;
    // (две «цепочки» от одного лица — Давид … Иисус по Мф и Давид … Мария по Лк — идут вместе по его следу: знак любой
    // из них стоит на общей дороге)
    const mine = (s: { ends: string[]; ks: string }) => !!gapPair && s.ks.startsWith('g.') && s.ends[0] === gapPair[0];
    const on = pathSegs.find((s) => !s.ends.includes(own) && s.union !== own && s.ks !== own && !mine(s) && segInRect(s.g, { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }));
    if (on) {
      y12lines++;
      add('Я12', own, `подпись «${b.text}» (${b.kind}) на линии ${on.ks}`, b.x, b.y);
    }
  }

  // Я13 (этап 15, решение 176: связь целиком): обрывков нет — ни путей вида 'stub', ни путей, нарисованных только свёрнутыми
  // (прежде — «длинные связи на всех лицах — обрывками»)
  let y13 = 0;
  for (const q of drawn)
    if (q.kind === 'stub' || q.when === 'short') {
      y13++;
      mark(q.ks, 'Я13');
      add('Я13', q.ks, `обрывок ${q.ks}`, q.pts[0], q.pts[1]);
    }

  // Я14: наведение по линии (точки через 6 px, без 14 px у концов) — что назовёт атлас (как src/ui/sky/input.ts, underPointer)
  let y14of = 0;
  let y14ends = 0;
  let y14foreign = 0;
  const s = f.s;
  const sameUnion = (k: import('../src/engine/linkkey.ts').LinkKey, q: LinkPath) =>
    k.kind === 'step'
      ? q.key.kind === 'step' && q.key.child === k.child
      : k.kind === 'span'
        ? lk.linkKeyString(k) === q.ks
        : 'union' in k && k.union === q.union && (q.key.kind !== 'child' || (k.kind === 'child' && k.child === q.key.child) || k.kind === 'union');
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
  const ch = chChecks(f, add);
  return {
    scene: f.sc.id, scale: f.scale, width: f.width, stars: f.stars.length, kids: kidKeys.size,
    y1, y2, y3, y4, y5, y6, y6of: teeth.length, y7, y8, y8of, y8nodes, y9, y11, y11of, y11trails,
    y12stars, y12lines, y12of: f.boxes.filter((b) => !(b.kind === 'plate' && !b.text)).length, y12overlaps: f.overlaps, rowPx, y13, y14of, y14ends, y14foreign, y15,
    ...ch, issues,
  };
}

// ---------- этап 13: правило концов, словарь начертаний, союз с обоими супругами (X3 § 3) ----------

const lineSeq = { joseph: atlas.lines.joseph.persons.map((q) => q.id), mary: atlas.lines.mary.persons.map((q) => q.id) };
const lineStep = { joseph: new Map(atlas.lines.joseph.persons.map((q) => [q.id, q])), mary: new Map(atlas.lines.mary.persons.map((q) => [q.id, q])) };

/** Проверки Ч1–Ч7 кадра (заголовок модуля). add — запись замечания. */
function chChecks(f: Frame, add: (check: string, ks: string, text: string, x: number, y: number) => void) {
  const { s, d } = f;
  const vp = s.cam.vp;
  const onSky = (id: string) => {
    const i = s.indexOf(id);
    return i !== undefined && s.drawn(i) && !s.hides(id);
  };
  const inWindow = (id: string) => {
    const i = s.indexOf(id);
    if (i === undefined) return false;
    const x = s.cam.sx(s.X0[i]);
    const y = s.cam.sy(s.nodes[i].lane);
    return x >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b;
  };
  // Ч1: шаг ленты (ключ step) начинается у родителя шага по data/lines
  let ch1 = 0;
  for (const q of d.frame.paths)
    if (q.kind === 'ribbon' && q.key.kind === 'step') {
      const par = words.stepParent(q.key.line, q.key.child);
      if (par !== q.ends[0]) {
        ch1++;
        add('Ч1', q.ks, `${q.key.line === 'joseph' ? 'Мф' : 'Лк'}: ${nameOf(q.ends[0])} → ${nameOf(q.key.child)} (родитель шага — ${par ? nameOf(par) : '—'})`, q.pts[0], q.pts[1]);
      }
    }
  // ключи кадра: все пути, дети союзов на небе и шаги лент к лицам на небе (шаг, чей родитель скрыт, — r.m.mariya)
  const keys = new Map<string, LinkKey>();
  for (const q of d.frame.paths) if (q.ks) keys.set(q.ks, q.key);
  for (const q of d.frame.paths)
    if (q.key.kind === 'union')
      for (const kid of words.linkUnion(q.key)?.kids ?? []) {
        const kk: LinkKey = { kind: 'child', union: q.key.union, child: kid };
        const ks = lk.linkKeyString(kk);
        if (ks && onSky(kid)) keys.set(ks, kk);
      }
  for (const ln of ['joseph', 'mary'] as const)
    for (const id of lineSeq[ln]) {
      if (!onSky(id) || !inWindow(id)) continue;
      const kk: LinkKey = { kind: 'step', line: ln, child: id };
      const ks = lk.linkKeyString(kk);
      if (ks && words.stepParent(ln, id)) keys.set(ks, kk);
    }
  // Ч2: концы ломаных выбранной связи — только у своих концов (звезда, узел, призрак, кромка); Ч3: у скрытого конца —
  // призрак (если на небе есть другой конец связи)
  let ch2 = 0;
  let ch3 = 0;
  let ch3of = 0;
  for (const [ks, key] of keys) {
    const ends = words.linkRoles(key).map((e) => e.id);
    const un = words.linkUnion(key);
    const legit = new Set([...ends, ...(un ? [un.a, un.b, ...un.kids].filter((x): x is string => !!x) : [])]);
    const r = marks.selectedRoutes(s, d, key);
    const hidden = ends.filter((e) => !onSky(e));
    if (hidden.length && ends.some((e) => onSky(e) && inWindow(e))) {
      ch3of++;
      const miss = hidden.filter((e) => !r.ghosts.some((g) => g.id === e));
      if (miss.length) {
        ch3++;
        add('Ч3', ks, `${words.linkTitle(key)}: нет призрака — ${miss.map(nameOf).join(', ')}`, 0, 0);
      }
    }
    const at = new Set<string>();
    for (const pts of r.all)
      for (const [x, y] of [[pts[0], pts[1]], [pts[pts.length - 2], pts[pts.length - 1]]]) {
        if (x < vp.l - 2 || x > vp.r + 2 || y < vp.t - 2 || y > vp.b + 2) continue;
        if (r.ghosts.some((g) => Math.hypot(g.x - x, g.y - y) < 1)) continue;
        const st = s.hitStar(x, y, 3);
        if (st && !legit.has(st.id)) at.add(st.id);
      }
    if (at.size) {
      ch2++;
      add('Ч2', ks, `${words.linkTitle(key)}: путь от ${[...at].map(nameOf).join(', ')}`, 0, 0);
    }
  }
  // Ч4 и Я9 на лентах: нити кадра против данных линий — разреженная нить только у толкования, штрих — «по закону»
  // и Нирий → Салафиил по Луке; у каждого пропуска показа — число скрытых
  let ch4 = 0;
  let ch4gaps = 0;
  const rc = ribbonsR.ribbonStrands(s, { lineFlip: false, onlyLines: f.sc.show.kind === 'lines', guide: s.plan.mode === 'work' } as never, { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons });
  for (const st of rc.strands) {
    const ln = st.line;
    for (let k = 1; k < st.ids.length; k++) {
      const id = st.ids[k];
      const step = lineStep[ln].get(id);
      let weak = false;
      let legal = false;
      for (const q of st.points)
        if (q.u > k - 1 + 0.02 && q.u <= k + 1e-9) {
          weak ||= q.weak;
          legal ||= !!q.legal;
        }
      const interp = step?.flag === 'interpretation';
      const other = step?.flag === 'legal' || (ln === 'mary' && id === 'salafiil');
      const i0 = lineSeq[ln].indexOf(st.ids[k - 1]);
      const i1 = lineSeq[ln].indexOf(id);
      const hid = i0 >= 0 && i1 > i0 ? lineSeq[ln].slice(i0 + 1, i1).filter((x) => !onSky(x)).length : 0;
      const gap = st.gaps?.[k] ?? 0;
      if (weak && !interp) {
        ch4++;
        add('Ч4', `${ln}>${id}`, `точки не по толкованию: ${nameOf(st.ids[k - 1])} → ${nameOf(id)}`, 0, 0);
      }
      if (legal && !other) {
        ch4++;
        add('Ч4', `${ln}>${id}`, `штрих не по закону: ${nameOf(st.ids[k - 1])} → ${nameOf(id)}`, 0, 0);
      }
      if (hid !== gap) {
        ch4++;
        add('Ч4', `${ln}>${id}`, `пропуск ${nameOf(st.ids[k - 1])} → ${nameOf(id)}: скрыто ${hid}, «+${gap}»`, 0, 0);
      }
      if (gap) ch4gaps++;
    }
  }
  for (const g of ribbonsR.ribbonGapHits(s)) {
    const seq = lineSeq[g.lines[0]];
    const hid = seq.slice(seq.indexOf(g.from) + 1, seq.indexOf(g.to)).filter((x) => !onSky(x)).length;
    if (hid !== g.n) {
      ch4++;
      add('Ч4', `${g.from}>${g.to}`, `«+${g.n}» при скрытых ${hid}`, g.cx, g.cy);
    }
  }
  // Ч5: лицо линии не дальше полустроки и амплитуды косы от своей нити — в показе «линии Мессии»
  let ch5 = 0;
  if (f.sc.show.kind === 'lines') {
    const tol = s.cam.ky * 0.5 + 3 + 3;
    for (const strand of rc.strands) {
      const pts = strand.points;
      for (const pid of strand.ids) {
        const i = s.indexOf(pid);
        if (i === undefined || !onSky(pid) || !inWindow(pid)) continue;
        const x = s.cam.sx(s.X0[i]);
        const y = s.cam.sy(s.nodes[i].lane);
        let best = Infinity;
        for (let q = 0; q + 1 < pts.length; q++) {
          const a = pts[q];
          const b = pts[q + 1];
          if (Math.max(a.x, b.x) + rc.dx < x - 40 || Math.min(a.x, b.x) + rc.dx > x + 40) continue;
          const dd = links.distSeg(x, y, a.x + rc.dx, a.y + rc.dy, b.x + rc.dx, b.y + rc.dy);
          if (dd < best) best = dd;
        }
        if (best > tol) {
          ch5++;
          add('Ч5', pid, `${nameOf(pid)} (${strand.line === 'joseph' ? 'золото' : 'лазурь'}): ${best === Infinity ? 'нити нет' : `${Math.round(best)} px`} от нити`, x, y);
        }
      }
    }
  }
  // Ч6: оба супруга на небе → союз связан с обоими (путь союза с его концом, узел на его следе, имя у ромба)
  let ch6 = 0;
  {
    const tied = new Set<string>();
    for (const q of [...f.paths, ...f.ribbons]) if (q.union) for (const e of q.ends) tied.add(`${q.union}|${e}`);
    for (const n of f.nodes) {
      tied.add(`${n.union}|${n.owner}`);
      if (n.mother) tied.add(`${n.union}|${n.mother}`);
    }
    for (const u of reveal.unions.byId.values()) {
      if (!u.a || !u.b || u.claim) continue;
      if (!onSky(u.a) || !onSky(u.b) || !(inWindow(u.a) || inWindow(u.b))) continue;
      const ta = tied.has(`${u.id}|${u.a}`);
      const tb = tied.has(`${u.id}|${u.b}`);
      if (!ta || !tb) {
        ch6++;
        add('Ч6', u.id, `${nameOf(u.a)} и ${nameOf(u.b)}${u.kids.length ? '' : ' (бездетный)'}: ${!tb ? 'жена' : 'муж'} не связан(а)`, 0, 0);
      }
    }
  }
  // Ч7: точечный путь связи — только толкование
  let ch7 = 0;
  for (const q of f.paths) {
    if (q.style !== 'dots') continue;
    const un = q.union ? words.linkUnion({ kind: 'union', union: q.union }) : null;
    if (un?.kidsCert === 'interpretation' && q.kind !== 'clan') continue;
    ch7++;
    add('Ч7', q.ks, `точки не по толкованию: ${q.kind} ${words.linkTitle(q.key).slice(0, 60)}`, q.pts[0], q.pts[1]);
  }
  return { ch1, ch2, ch3, ch3of, ch4, ch4gaps, ch5, ch6, ch7 };
}


// ---------- этап 14: GRAPH STRESS (решение 158; отчёт G § 6) ----------

/** Сцена GRAPH STRESS: окно «всего неба», выбор и выбранная связь (отчёт G § 6). */
export interface GraphScene {
  id: string;
  title: string;
  at: ViewAt | { person: string };
  select: string | null;
  link?: string;
}
export const GRAPH_SCENES: GraphScene[] = [
  { id: 'esrom', title: 'Есром, Халев, Ашхур', at: { year: -1839, width: 172, lane: -5.4 }, select: null },
  { id: 'halev', title: 'Халев выбран, 60 лет', at: { year: -1800, width: 60, lane: -2 }, select: 'khalev-syn-esroma' },
  { id: 'david', title: 'Давид', at: { person: 'david' }, select: 'david' },
  { id: 'iakov', title: 'Иаков', at: { person: 'iakov' }, select: 'iakov' },
  { id: 'iakovDan', title: 'Иаков, связь «Иаков и Валла — Дан»', at: { person: 'iakov' }, select: 'iakov', link: 'k.iakov.valla._.dan' },
  { id: 'halevLink', title: 'Халев, связь «Халев и Мааха — Шева»', at: { year: -1800, width: 60, lane: -2 }, select: 'khalev-syn-esroma', link: 'k.khalev-syn-esroma.maakha-nalozhnitsa-khaleva._.sheva-syn-khaleva' },
  { id: 'iuda', title: 'Иуда', at: { year: -1900, width: 70, lane: 0 }, select: 'iuda' },
  { id: 'ashhur', title: 'Ашхур', at: { person: 'ashkhur' }, select: 'ashkhur' },
  { id: 'saul', title: 'Саул', at: { person: 'saul' }, select: 'saul' },
  { id: 'kettura', title: 'Хеттура', at: { year: -1968, width: 172, lane: -16.6 }, select: null },
  { id: 'benjamin', title: 'Вениамин, 1 Пар 7–8', at: { year: -1839, width: 172, lane: -39 }, select: null },
  { id: 'edom', title: 'Едом', at: { year: -1968, width: 172, lane: 17.1 }, select: null },
  { id: 'nations', title: 'Таблица народов', at: { year: -2451, width: 180, lane: -5.4 }, select: null },
  { id: 'efraim', title: 'Ефрем', at: { year: -1796, width: 172, lane: 28.3 }, select: null },
  { id: 'return', title: 'Списки возвращения', at: { year: -595, width: 172, lane: 28.3 }, select: null },
  { id: 'far900', title: 'Дальний масштаб, 900 лет', at: { year: -1500, width: 900, lane: 0 }, select: null },
  { id: 'far1300', title: 'Дальний масштаб, 1300 лет', at: { year: -1500, width: 1300, lane: 0 }, select: null },
  { id: 'far2000', title: 'Дальний масштаб, 2000 лет', at: { year: -1500, width: 2000, lane: 0 }, select: null },
  { id: 'iisus', title: 'Иисус', at: { year: -10, width: 90, lane: 0 }, select: 'iisus' },
];

/** Числа GRAPH STRESS кадра (решение 158; пороги — STAGE14 § 4, Г1–Г7). */
export interface GraphCensus {
  scene: string;
  width: number;
  /** Г1: разрывы следа родителя союза его же линиями («свой след разрезан») */
  ownCut: number;
  /** Г2: узлов (◆, •) на чужом пути (ближе r + 1 к оси, у черты брака — к её линии); совпадающих вертикалей (|Δx| < 2, > 12 px) */
  nodeOnPath: number;
  sameVert: number;
  /** Г3: Я1 (путь у чужой звезды); y1full — из них на дальних ходах длинных связей, раскрытых выбором или окном (G8) */
  y1: number;
  y1full: number;
  /** Г4: имён матерей у ромбов выбранного — поставлено / положено (в окне) */
  mothers: number;
  mothersOf: number;
  /** Г5: второй родитель союза выбранного с детьми — погашен (нет в выделении) */
  dimmed: number;
  /** Г6: путей связей на экране; подписей обрывков без линий */
  onScreen: number;
  bareStubText: number;
  /** Г7: координатных подписей при втором конце в окне; повтор координаты одного лица */
  coordBoth: number;
  coordRepeat: number;
  /** пересечений связь × связь без разрыва */
  xNoCut: number;
  issues: Issue[];
}

const BAR_HALF = 1.6;

/** Проверки GRAPH STRESS по нарисованному кадру. */
export function graphCensus(f: Frame, scene = f.sc.id): GraphCensus {
  const { s, d } = f;
  const issues: Issue[] = [];
  const add = (check: string, ks: string, text: string, x: number, y: number) => issues.push({ check, ks, text, x, y });
  const vp = s.cam.vp;
  const inVp = (x: number, y: number) => x >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b;
  const segIn = (g: Seg) => Math.max(g[0], g[2]) >= vp.l && Math.min(g[0], g[2]) <= vp.r && Math.max(g[1], g[3]) >= vp.t && Math.min(g[1], g[3]) <= vp.b;
  const sh = (g: Seg): Seg => [g[0] + d.dx, g[1] + d.dy, g[2] + d.dx, g[3] + d.dy];
  const paths = f.paths;
  const idOf = (i: number) => s.nodes[i]?.person;
  // Г1: свой след разрезан — путь союза режет след одного из родителей этого союза
  let ownCut = 0;
  for (const q of paths) {
    if (!q.union) continue;
    const u = reveal.unions.byId.get(q.union);
    if (!u) continue;
    for (let k = 0; k + 2 < q.cuts.length; k += 3) {
      const who = idOf(q.cuts[k]);
      if (who && (who === u.a || who === u.b) && inVp(q.cuts[k + 1] + d.dx, s.cam.sy(s.nodes[q.cuts[k]].lane))) {
        ownCut++;
        add('Г1', q.ks, `${q.kind} режет след ${nameOf(who)}`, q.cuts[k + 1], 0);
      }
    }
  }
  // Г2: узел на чужом пути; совпадающие вертикали разных союзов
  let nodeOnPath = 0;
  const R = (f.d.frame.layout === 'family' ? links.NODE_R_FAMILY : links.NODE_R_MAP) + 1;
  for (const n of f.nodes) {
    const nx = n.x + d.dx;
    const ny = n.y + d.dy;
    if (!inVp(nx, ny)) continue;
    for (const q of paths) {
      if (q.union === n.union) continue;
      let hit = false;
      for (const g of segs(q)) {
        const atEnd = Math.hypot(n.x - g[0], n.y - g[1]) < 1 || Math.hypot(n.x - g[2], n.y - g[3]) < 1;
        if (atEnd) continue;
        if (links.distSeg(n.x, n.y, g[0], g[1], g[2], g[3]) - (q.kind === 'bar' ? BAR_HALF : 0) < R) hit = true;
      }
      if (hit) {
        nodeOnPath++;
        add('Г2', n.union, `узел ${n.union} на ${q.kind} ${q.ks}`, nx, ny);
        break;
      }
    }
  }
  let sameVert = 0;
  const vs = paths.flatMap((q) => segs(q).filter((g) => isV(g) && segIn(sh(g))).map((g) => ({ x: g[0], y0: Math.min(g[1], g[3]), y1: Math.max(g[1], g[3]), q })));
  vs.sort((a, b) => a.x - b.x);
  const seenSame = new Set<string>();
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length && vs[j].x - vs[i].x < 2; j++) {
      if (vs[i].q.union === vs[j].q.union) continue;
      const ov = Math.min(vs[i].y1, vs[j].y1) - Math.max(vs[i].y0, vs[j].y0);
      const pk = [vs[i].q.ks, vs[j].q.ks].sort().join('|');
      if (ov > 12 && !seenSame.has(pk)) {
        seenSame.add(pk);
        sameVert++;
        add('Г2', pk, `совпадающие вертикали ${Math.round(ov)} px`, vs[i].x + d.dx, vs[i].y0 + d.dy);
      }
    }
  // Г3: Я1 — через census()
  const y1s = links.checkLinks({ ...d.frame, paths: [...paths, ...f.ribbons] }, f.stars, ['always', 'short', 'full']).filter((c) => c.check === 'star');
  const y1 = y1s.length;
  const fullKs = new Set(paths.filter((q) => q.when === 'full').map((q) => q.ks));
  const y1full = links.checkLinks({ ...d.frame, paths: paths.filter((q) => q.when === 'full') }, f.stars, ['full']).filter((c) => c.check === 'star' && fullKs.has(c.ks)).length;
  // Г4: имена матерей у ромбов выбранного — поставленные (по замеру подписей), а не назначенные
  const sel = f.sc.select;
  let mothers = 0;
  let mothersOf = 0;
  const boxes = s.labelStats().boxes;
  if (sel) {
    const mine = new Set((reveal.unions.of.get(sel) ?? []).map((u) => u.id));
    for (const n of d.frame.nodes) {
      if (n.kind !== 'union' || !n.mother || !mine.has(n.union)) continue;
      const nx = n.x + d.dx;
      const ny = n.y + d.dy;
      if (!inVp(nx, ny) || ny < s.openTop) continue;
      // решение 160: имя у ромба не ставится, если её собственная звезда видна ближе 120 px (имя ставит ярус семьи)
      const mi = s.indexOf(n.mother);
      const near = (trails as unknown as { OWN_NAME_NEAR?: number }).OWN_NAME_NEAR;
      if (near && mi !== undefined && s.drawn(mi)) {
        const mx = s.cam.sx(s.X0[mi]);
        const my = s.cam.sy(s.nodes[mi].lane);
        if (mx >= s.letterW && mx <= s.cam.w && my >= s.openTop && my <= s.cam.vp.b && Math.hypot(mx - nx, my - ny) < near) continue;
      }
      mothersOf++;
      const name = nameOf(n.mother);
      if (boxes.some((b) => b.kind === 'plate' && b.id === n.union && b.text === name)) mothers++;
      else add('Г4', n.union, `у ромба нет имени «${name}»`, nx, ny);
    }
  }
  // Г5: второй родитель союза выбранного с детьми — в выделении
  let dimmed = 0;
  if (sel) {
    const hl = marks.familyHighlight(sel).hl;
    for (const u of reveal.unions.of.get(sel) ?? []) {
      if (!u.kids.length || u.id.includes('~')) continue;
      for (const o of [u.a, u.b]) {
        if (!o || o === sel) continue;
        const i = s.indexOf(o);
        if (i === undefined || !s.drawn(i)) continue;
        if (!hl.has(o)) {
          dimmed++;
          add('Г5', u.id, `${nameOf(o)} погашен(а)`, 0, 0);
        }
      }
    }
  }
  // Г6: путей связей на экране; подписи обрывков без линий
  let onScreen = 0;
  for (const q of paths) if (segs(q).some((g) => segIn(sh(g)))) onScreen++;
  const texts = ((s.canvas as unknown as { dataset: Record<string, string> }).dataset.linkTexts ?? '').split('|').filter(Boolean);
  const stubAt = new Map<string, LinkFrame['stubs'][number]>();
  for (const st of d.frame.stubs) stubAt.set(`${Math.round(st.x + d.dx)},${Math.round(st.y + d.dy)}`, st);
  const nodeAt = new Set(d.frame.nodes.map((n) => `${Math.round(n.x + d.dx)},${Math.round(n.y + d.dy)}`));
  let bareStubText = 0;
  let coordBoth = 0;
  let coordRepeat = 0;
  const parentsNamed = new Map<string, number>();
  const inWin = (id: string) => {
    const i = s.indexOf(id);
    if (i === undefined || !s.drawn(i)) return false;
    return inVp(s.cam.sx(s.X0[i]), s.cam.sy(s.nodes[i].lane)) && s.cam.sy(s.nodes[i].lane) >= s.openTop;
  };
  for (const t of texts) {
    const at = t.slice(t.lastIndexOf('@') + 1);
    if (nodeAt.has(at)) continue;
    const st = stubAt.get(at);
    if (!st) continue;
    const sp = T.stubPathOf ? T.stubPathOf(d.frame, st) : (d.frame.paths.find((q) => q.ks === st.ks && q.kind === 'stub' && q.pts.some((v, k) => k % 2 === 0 && Math.abs(v - st.x) < 0.6 && Math.abs(q.pts[k + 1] - st.y) < 0.6)) ?? null);
    if (sp && !on(sp, d)) {
      bareStubText++;
      add('Г6', st.ks, `подпись «${t}» без линии`, st.x + d.dx, st.y + d.dy);
    }
    if (st.kind === 'kid' || d.frame.layout !== 'map') continue;
    // координата в подписи — «Давид, 32 П»
    const coord = /, \d+ [А-ЯЁ]/.test(t.slice(0, t.lastIndexOf('@')));
    if (st.side === 'child') {
      const par = st.targets[0];
      if (inWin(par) && coord) {
        coordBoth++;
        add('Г7', st.ks, `«${t}» при ${nameOf(par)} в окне`, st.x + d.dx, st.y + d.dy);
      }
      parentsNamed.set(par, (parentsNamed.get(par) ?? 0) + 1);
    } else if (coord && st.targets.every(inWin)) {
      coordBoth++;
      add('Г7', st.ks, `«${t}» при детях в окне`, st.x + d.dx, st.y + d.dy);
    }
  }
  for (const [par, n] of parentsNamed)
    if (n > 1) {
      coordRepeat += n - 1;
      add('Г7', par, `координата ${nameOf(par)} ×${n}`, 0, 0);
    }
  // пересечения связь × связь без разрыва
  const c = census(f);
  return { scene, width: f.width, ownCut, nodeOnPath, sameVert, y1, y1full, mothers, mothersOf, dimmed, onScreen, bareStubText, coordBoth, coordRepeat, xNoCut: c.y11, issues: [...issues, ...c.issues.filter((q) => q.check === 'Я11')] };
}

/** Кадр сцены GRAPH STRESS на ширине неба width (1440, а с открытой карточкой — 940). */
export function captureGraph(g: GraphScene, width = 1440, select: string | null = g.select): Frame {
  const link = g.link ? lk.parseLinkKey(g.link) : null;
  return captureView('all', g.at, { width, select, link });
}

export const GRAPH_HEAD = '| сцена | ширина | выбор | Г1 свой след | Г2 узел на чужом / вертикали | Я1 (на дальних ходах) | Г4 матери | Г5 погашен | Г6 путей / подписи без линий | Г7 при обоих / повтор | связь×связь без разрыва |\n|---|---|---|---|---|---|---|---|---|---|---|';
export const graphRow = (c: GraphCensus, sel: string | null) =>
  `| ${c.scene} | ${c.width} | ${sel ? nameOf(sel) : '—'} | ${c.ownCut} | ${c.nodeOnPath} / ${c.sameVert} | ${c.y1} (${c.y1full}) | ${c.mothersOf ? `${c.mothers}/${c.mothersOf}` : '—'} | ${c.dimmed} | ${c.onScreen} / ${c.bareStubText} | ${c.coordBoth} / ${c.coordRepeat} | ${c.xNoCut} |`;

// ---------- этап 15: «Отчий дом» (решения 173–181; STAGE15 § 4, Ф1–Ф5) ----------

/**
 * Сцена корпуса этапа 15 (конкурс, D2: tools/_d2-scenes.ts): окно «всего неба» 2000 × 1000 — обзор, как на снимках
 * владельца (113 лет на окно), масштаб семьи, выбранное лицо. По вертикали окно идёт за домом главы семьи fam: полоса
 * середины окна — полоса его жизни и сдвиг dl (у выпуска 14 — ровно окно D2).
 */
export interface HouseScene {
  id: string;
  fam: string;
  year: number;
  width: number;
  dl: number;
  sel?: string;
}
export const HOUSE_SCENES: HouseScene[] = [
  { id: 'jacob-o', fam: 'iakov', year: -1951, width: 113, dl: -8 },
  { id: 'jacob-f', fam: 'iakov', year: -1925, width: 48, dl: -4 },
  { id: 'jacob-sel', fam: 'iakov', year: -1951, width: 113, dl: -8, sel: 'iakov' },
  { id: 'abraham-o', fam: 'avraam', year: -2080, width: 200, dl: -4 },
  { id: 'abraham-f', fam: 'avraam', year: -2070, width: 110, dl: -1 },
  { id: 'david-o', fam: 'david', year: -1005, width: 113, dl: 0 },
  { id: 'david-f', fam: 'david', year: -1003, width: 45, dl: 0 },
  { id: 'david-sel', fam: 'david', year: -1005, width: 113, dl: 0, sel: 'david' },
  { id: 'caleb-o', fam: 'khalev-syn-esroma', year: -1790, width: 113, dl: 8 },
  { id: 'caleb-f', fam: 'khalev-syn-esroma', year: -1788, width: 60, dl: 8 },
  { id: 'esau-o', fam: 'isav', year: -1960, width: 113, dl: -3 },
  { id: 'esau-f', fam: 'isav', year: -1950, width: 60, dl: -3 },
  { id: 'rovoam-o', fam: 'rovoam', year: -955, width: 113, dl: -2 },
  { id: 'rovoam-f', fam: 'rovoam', year: -950, width: 45, dl: -2 },
  { id: 'iuda-o', fam: 'iuda', year: -1897, width: 113, dl: -3 },
  { id: 'nahor-o', fam: 'nakhor-syn-farry', year: -2116, width: 113, dl: 8 },
  { id: 'shegaraim-o', fam: 'shegaraim', year: -1310, width: 113, dl: 10 },
  { id: 'saul-o', fam: 'saul', year: -1057, width: 113, dl: -4 },
  { id: 'lot-o', fam: 'lot', year: -2079, width: 113, dl: -2 },
  { id: 'ashkhur-o', fam: 'ashkhur', year: -1788, width: 113, dl: -4 },
  { id: 'mered-o', fam: 'mered', year: -988, width: 113, dl: -4 },
  { id: 'esrom-o', fam: 'esrom', year: -1819, width: 113, dl: -4 },
  { id: 'vooz-o', fam: 'vooz', year: -1100, width: 113, dl: -1 },
  { id: 'irodiada-o', fam: 'irodiada', year: 15, width: 113, dl: -9 },
];

/** Кадр сцены корпуса: окно 2000 × 1000, полоса середины — полоса жизни главы семьи и сдвиг сцены. */
export function captureHouse(h: HouseScene, select: string | null = h.sel ?? null): Frame {
  const lane = (M().nodeByPerson.get(h.fam)?.lane ?? 0) + h.dl;
  return captureView('all', { year: h.year, width: h.width, lane }, { width: 2000, height: 1000, select });
}

/** Числа «Отчего дома» кадра (STAGE15 § 4). */
export interface HouseCensus {
  scene: string;
  /** Ф1: обрывков в окне — немых и подписанных (пути вида 'stub' и нарисованные только свёрнутыми, 'short') */
  f1: number;
  /** Ф2: детей в окне, чья мать названа и на небе, а связь их союза нарисована: не связанных со следом матери / всего */
  f2: number;
  f2of: number;
  /** Ф3: союзов в окне с обоими супругами на небе: без черты брака к ней / всего */
  f3: number;
  f3of: number;
  /** Ф4: пересечений «связь × чужой след» в окне (путь связи — не лента; след — не концов пути) */
  f4: number;
  /** Ф5: неоднозначных ромбов в окне (не на следе жены, на чужом следе или линии, под лентой) / ромбов в окне */
  f5: number;
  f5of: number;
  issues: Issue[];
}

/** Проверки Ф1–Ф5 по нарисованному кадру. */
export function houseCensus(f: Frame, scene = f.sc.id): HouseCensus {
  const { s, d } = f;
  const issues: Issue[] = [];
  const add = (check: string, ks: string, text: string, x: number, y: number) => issues.push({ check, ks, text, x, y });
  const vp = s.cam.vp;
  const L = Math.max(vp.l, s.letterW);
  const T = Math.max(vp.t, s.openTop);
  // всё — в px кадра связей; окно — со сдвигом неба (у переписи он нулевой)
  const inVp = (x: number, y: number) => x + d.dx >= L && x + d.dx <= vp.r && y + d.dy >= T && y + d.dy <= vp.b;
  const segIn = (g: Seg) => Math.max(g[0], g[2]) + d.dx >= L && Math.min(g[0], g[2]) + d.dx <= vp.r && Math.max(g[1], g[3]) + d.dy >= T && Math.min(g[1], g[3]) + d.dy <= vp.b;
  const U = reveal.unions;
  const imgs = new Map<string, LinkStar[]>();
  for (const st of f.stars) (imgs.get(st.id) ?? imgs.set(st.id, []).get(st.id)!).push(st);
  const mainOf = (id: string) => imgs.get(id)?.find((q) => !q.ghost) ?? null;
  const polyOf = (st: LinkStar): readonly number[] | null => (st.path && st.path.length >= 4 ? st.path : st.x1 !== null && st.x1 > st.x + 0.5 ? [st.x, st.y, st.x1, st.y] : null);
  // родовые черты союзов (Г12): продолжение следа лица до узла
  const clans = f.paths.filter((q) => q.kind === 'clan');
  /** точка на следе лица id (любом его изображении: след, призрак, родовая черта до узла) */
  const onTrailOf = (id: string, x: number, y: number, tol = 1.2): boolean => {
    for (const st of imgs.get(id) ?? []) {
      const p = polyOf(st);
      if (p) {
        for (let k = 0; k + 3 < p.length; k += 2) if (links.distSeg(x, y, p[k], p[k + 1], p[k + 2], p[k + 3]) < tol) return true;
      } else if (Math.hypot(st.x - x, st.y - y) < st.r + 2) return true;
      if (st.ghost && Math.hypot(st.x - x, st.y - y) < st.r + 14 && Math.abs(st.y - y) < tol) return true;
    }
    for (const q of clans) if (q.ends[0] === id) for (const g of segs(q)) if (links.distSeg(x, y, g[0], g[1], g[2], g[3]) < tol) return true;
    return false;
  };
  const drawn = f.paths;
  const byUnion = new Map<string, LinkPath[]>();
  for (const q of drawn) if (q.union) (byUnion.get(q.union) ?? byUnion.set(q.union, []).get(q.union)!).push(q);
  const nodesOf = new Map<string, LinkFrame['nodes']>();
  for (const n of f.nodes) (nodesOf.get(n.union) ?? nodesOf.set(n.union, []).get(n.union)!).push(n);

  // Ф1: обрывки в окне
  let f1 = 0;
  for (const q of drawn)
    if ((q.kind === 'stub' || q.when === 'short') && segs(q).some(segIn)) {
      f1++;
      add('Ф1', q.ks, `обрывок ${q.ks}`, q.pts[0] + d.dx, q.pts[1] + d.dy);
    }

  // Ф2: дети в окне с матерью на небе — путь союза от ребёнка доходит до следа матери (или черта брака и ромб на её следе
  // у ребёнка линии Мессии)
  let f2 = 0;
  let f2of = 0;
  const ribTo = new Set(d.frame.paths.filter((q) => q.kind === 'ribbon').map((q) => `${q.union ?? ''}>${q.ends[1]}`));
  for (const st of f.stars) {
    if (st.ghost || !inVp(st.x, st.y)) continue;
    const u = links.mainUnion(U, st.id);
    if (!u || !u.b || !u.a || !mainOf(u.b)) continue;
    const own = byUnion.get(u.id) ?? [];
    const rib = ribTo.has(`${u.id}>${st.id}`);
    const toKid = own.filter((q) => q.ends.includes(st.id) && q.ends[q.ends.length - 1] === st.id);
    if (!toKid.length && !rib) continue;
    f2of++;
    let ok = false;
    if (toKid.length) {
      // заливка по путям союза: отрезки соединены, если конец одного лежит на другом
      const all = own.flatMap((q) => segs(q).map((g) => ({ g, q })));
      const seen = new Set<number>();
      const queue: number[] = [];
      all.forEach((e, i) => {
        if (toKid.includes(e.q)) {
          seen.add(i);
          queue.push(i);
        }
      });
      const touch = (a: Seg, b: Seg) =>
        [[a[0], a[1]], [a[2], a[3]]].some(([x, y]) => links.distSeg(x, y, b[0], b[1], b[2], b[3]) < 1) ||
        [[b[0], b[1]], [b[2], b[3]]].some(([x, y]) => links.distSeg(x, y, a[0], a[1], a[2], a[3]) < 1);
      while (queue.length && !ok) {
        const i = queue.shift()!;
        const g = all[i].g;
        if (onTrailOf(u.b, g[0], g[1]) || onTrailOf(u.b, g[2], g[3])) ok = true;
        for (const n of nodesOf.get(u.id) ?? []) if (n.owner === u.b && links.distSeg(n.x, n.y, g[0], g[1], g[2], g[3]) < 1) ok = true;
        all.forEach((e, j) => {
          if (!seen.has(j) && touch(g, e.g)) {
            seen.add(j);
            queue.push(j);
          }
        });
      }
    } else {
      ok = (nodesOf.get(u.id) ?? []).some((n) => n.kind === 'union' && onTrailOf(u.b!, n.x, n.y)) || own.some((q) => q.kind === 'bar' && segs(q).some((g) => onTrailOf(u.b!, g[0], g[1]) || onTrailOf(u.b!, g[2], g[3])));
    }
    if (!ok) {
      f2++;
      add('Ф2', u.id, `${nameOf(st.id)}: не связан(а) со следом матери ${nameOf(u.b)}`, st.x + d.dx, st.y + d.dy);
    }
  }

  // Ф3: союз в окне, оба супруга на небе — черта брака от его следа к её следу (или к её призраку)
  let f3 = 0;
  let f3of = 0;
  for (const [uid, qs] of [...byUnion, ...[...nodesOf.keys()].filter((k) => !byUnion.has(k)).map((k) => [k, [] as LinkPath[]] as const)]) {
    const u = U.byId.get(uid);
    if (!u || !u.a || !u.b || u.claim || !mainOf(u.a) || !imgs.get(u.b)?.length) continue;
    const seen = qs.some((q) => segs(q).some(segIn)) || (nodesOf.get(uid) ?? []).some((n) => inVp(n.x, n.y));
    if (!seen) continue;
    f3of++;
    const ok = qs.some((q) => q.kind === 'bar' && segs(q).some((g) => (onTrailOf(u.b!, g[0], g[1]) && onTrailOf(u.a!, g[2], g[3])) || (onTrailOf(u.a!, g[0], g[1]) && onTrailOf(u.b!, g[2], g[3]))));
    if (!ok) {
      f3++;
      add('Ф3', uid, `${nameOf(u.a)} и ${nameOf(u.b)}: черты брака нет`, 0, 0);
    }
  }

  // Ф4: связь × чужой след в окне
  let f4 = 0;
  const tsegs: { g: Seg; id: string }[] = [...f.trails.map((t) => ({ g: [t.x0, t.y, t.x1, t.y] as Seg, id: t.id })), ...f.glides.map((t) => ({ g: t.g as Seg, id: t.id }))];
  for (const q of drawn)
    for (const g0 of segs(q)) {
      const g: Seg = [g0[0] + d.dx, g0[1] + d.dy, g0[2] + d.dx, g0[3] + d.dy];
      if (!segIn(g0)) continue;
      for (const t of tsegs) {
        if (q.ends.includes(t.id)) continue;
        if (Math.max(g[0], g[2]) < Math.min(t.g[0], t.g[2]) || Math.min(g[0], g[2]) > Math.max(t.g[0], t.g[2])) continue;
        const p = crossAt(g, t.g);
        if (p && p[0] >= L && p[0] <= vp.r && p[1] >= T && p[1] <= vp.b) f4++;
      }
    }

  // Ф5: ромбы в окне — на следе жены (если она на небе), не на чужом следе, не на чужой линии, не под лентой
  let f5 = 0;
  let f5of = 0;
  const R = d.frame.layout === 'family' ? links.NODE_R_FAMILY : links.NODE_R_MAP;
  const stations = new Set([...d.frame.via.values()].map((v) => v.union));
  const rc = ribbonsR.ribbonStrands(s, { lineFlip: false, onlyLines: f.sc.show.kind === 'lines', guide: s.plan.mode === 'work' } as never, { joseph: atlas.lines.joseph.persons, mary: atlas.lines.mary.persons });
  for (const n of f.nodes) {
    if (n.kind !== 'union' || !inVp(n.x, n.y)) continue;
    f5of++;
    const u = U.byId.get(n.union);
    const members = new Set(u ? [u.a, u.b, ...u.kids].filter((x): x is string => !!x) : []);
    const why: string[] = [];
    const y0 = n.y - ((n as { off?: number }).off ?? 0);
    if (u?.a && u.b && imgs.get(u.b)?.length && !onTrailOf(u.b, n.x, y0)) why.push(`не на следе ${nameOf(u.b)}`);
    for (const t of tsegs)
      if (!members.has(t.id) && links.distSeg(n.x + d.dx, n.y + d.dy, t.g[0], t.g[1], t.g[2], t.g[3]) < R) {
        why.push(`на следе ${nameOf(t.id)}`);
        break;
      }
    for (const q of drawn)
      if (q.union !== n.union && segs(q).some((g) => links.distSeg(n.x, n.y, g[0], g[1], g[2], g[3]) < R + 1)) {
        why.push(`на линии ${q.ks}`);
        break;
      }
    // лента: по маршруту (масштаб семьи) или нитью обзора; станция своего шага на следе родителя — не «под лентой»
    const own = (par: string) => stations.has(n.union) && n.owner === par;
    for (const q of f.ribbons)
      if (!own(q.ends[0]) && segs(q).some((g) => links.distSeg(n.x, n.y, g[0], g[1], g[2], g[3]) < R + 1)) {
        why.push(`под лентой ${q.ks}`);
        break;
      }
    if (!f.ribbons.length && s.routeFactor < 0.5)
      for (const strand of rc.strands) {
        if (strand.ids.includes(n.owner) && stations.has(n.union)) continue;
        const pts = strand.points;
        let hit = false;
        for (let k = 0; k + 1 < pts.length && !hit; k++) {
          const a = pts[k];
          const b = pts[k + 1];
          if (Math.max(a.x, b.x) + rc.dx < n.x + d.dx - 12 || Math.min(a.x, b.x) + rc.dx > n.x + d.dx + 12) continue;
          if (links.distSeg(n.x + d.dx, n.y + d.dy, a.x + rc.dx, a.y + rc.dy, b.x + rc.dx, b.y + rc.dy) < R + 1) hit = true;
        }
        if (hit) {
          why.push(`под лентой ${strand.line}`);
          break;
        }
      }
    if (why.length) {
      f5++;
      add('Ф5', n.union, `ромб ${n.union}: ${why.join('; ')}`, n.x + d.dx, n.y + d.dy);
    }
  }
  return { scene, f1, f2, f2of, f3, f3of, f4, f5, f5of, issues };
}

export const HOUSE_HEAD = '| сцена | выбор | Ф1 обрывки | Ф2 дети не у матери | Ф3 союз без черты | Ф4 связь × след | Ф5 ромбы |\n|---|---|---|---|---|---|---|';
export const houseRow = (c: HouseCensus, sel: string | null) => `| ${c.scene} | ${sel ? nameOf(sel) : '—'} | ${c.f1} | ${c.f2}/${c.f2of} | ${c.f3}/${c.f3of} | ${c.f4} | ${c.f5}/${c.f5of} |`;

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
  // этап 13 (П1–П5): правило концов и словарь начертаний — везде ноль
  need(c.ch1 === 0, `Ч1: ${c.ch1}`);
  need(c.ch2 === 0, `Ч2: ${c.ch2}`);
  need(c.ch3 === 0, `Ч3: ${c.ch3}/${c.ch3of}`);
  need(c.ch4 === 0, `Ч4: ${c.ch4}`);
  need(c.ch5 === 0, `Ч5: ${c.ch5}`);
  need(c.ch6 === 0, `Ч6: ${c.ch6}`);
  need(c.ch7 === 0, `Ч7: ${c.ch7}`);
  return out;
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '—');

/** Строка таблицы переписи. */
export function row(c: Census): string {
  return `| ${c.scene} | ${c.scale} | ${c.width} | ${c.rowPx.toFixed(1)} | ${c.stars} | ${c.kids} | ${c.y1} | ${c.y2} | ${c.y3} | ${c.y4} | ${c.y5} | ${c.y6}/${c.y6of} | ${c.y7} | ${c.y8}/${c.y8of} (${c.y8nodes}) | ${c.y9} | ${c.y11}/${c.y11of} / ${c.y11trails} | ${c.y12stars} / ${c.y12lines} / ${c.y12overlaps} | ${c.y13} | ${pct(c.y14ends, c.y14of)} / ${c.y14foreign} | ${c.y15} (${pct(c.y15, c.kids)}) | ${c.ch1} | ${c.ch2} | ${c.ch3}/${c.ch3of} | ${c.ch4} (+N ${c.ch4gaps}) | ${c.ch5} | ${c.ch6} | ${c.ch7} |`;
}
export const HEAD =
  '| сцена | × | ширина | px/строка | звёзд | связей к детям | Я1 | Я2 | Я3 | Я4 | Я5 | Я6 | Я7 | Я8 (узлов) | Я9 | Я11 линии / следы | Я12 звёзды / линии / наложения | Я13 | Я14 концы / чужие | Я15 | Ч1 | Ч2 | Ч3 | Ч4 | Ч5 | Ч6 | Ч7 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';

// ---------- прогон ----------

if (process.env.CENSUS_MAIN === '1' && process.argv.includes('--house')) {
  // «Отчий дом» (этап 15, STAGE15 § 4): npx tsx tools/census.ts --house [--scene jacob-o,david-f] [--json out.json]
  const argv = process.argv.slice(2);
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
  };
  const pick = arg('scene', '').split(',').filter(Boolean);
  const out: HouseCensus[] = [];
  console.log(HOUSE_HEAD);
  for (const h of HOUSE_SCENES) {
    if (pick.length && !pick.includes(h.id)) continue;
    const c = houseCensus(captureHouse(h), h.id);
    out.push(c);
    console.log(houseRow(c, h.sel ?? null));
    for (const q of c.issues.slice(0, Number(arg('top', '4')))) console.log(`    ${q.check}: ${q.text}`);
  }
  const sum = (k: 'f1' | 'f2' | 'f2of' | 'f3' | 'f3of' | 'f4' | 'f5' | 'f5of') => out.reduce((a, c) => a + c[k], 0);
  console.log(`| всего | — | ${sum('f1')} | ${sum('f2')}/${sum('f2of')} | ${sum('f3')}/${sum('f3of')} | ${sum('f4')} | ${sum('f5')}/${sum('f5of')} |`);
  const json = arg('json', '');
  if (json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(json, JSON.stringify(out, null, 1));
  }
} else if (process.env.CENSUS_MAIN === '1' && process.argv.includes('--graph')) {
  // GRAPH STRESS (этап 14, решение 158): npx tsx tools/census.ts --graph [--scene esrom,david] [--width 1440,940] [--json out.json]
  const argv = process.argv.slice(2);
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
  };
  const pick = arg('scene', '').split(',').filter(Boolean);
  const widths = arg('width', '1440,940').split(',').map(Number);
  const out: GraphCensus[] = [];
  console.log(GRAPH_HEAD);
  for (const g of GRAPH_SCENES) {
    if (pick.length && !pick.includes(g.id)) continue;
    for (const w of widths)
      for (const sel of g.select ? [null, g.select] : [null]) {
        if (w !== 1440 && !sel) continue;
        const c = graphCensus(captureGraph(g, w, sel), g.id);
        out.push(c);
        console.log(graphRow(c, sel));
        for (const q of c.issues.slice(0, Number(arg('top', '4')))) console.log(`    ${q.check}: ${q.text}`);
      }
  }
  const json = arg('json', '');
  if (json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(json, JSON.stringify(out, null, 1));
  }
} else if (process.env.CENSUS_MAIN === '1') {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
  };
  const scenes = arg('scene', STAGE11_SCENES.join(',')).split(',').filter(Boolean);
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
