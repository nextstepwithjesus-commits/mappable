/**
 * Связи кадра (этап 11, решения 78, 79; STAGE11.md § 2–4, § 8) — одна грамматика родства для всего неба.
 *
 * Модуль чистый: по местам звёзд и следов кадра (px), союзам (src/engine/unions.ts) и укладке он строит геометрию
 * связей, ничего не рисуя. Рисуют её trails.ts (стволы, зубцы, черты брака, родовые черты, обрывки, разрывы следов),
 * plates.ts (узлы ◆ и •, «+N»), ribbons.ts (ленты по маршрутам через узлы) и marks.ts (выбранная связь).
 *
 * Грамматика (Г1–Г12):
 *  — одна связь — одна линия: к ребёнку линии Мессии ведёт лента, ствола и зубца к нему нет;
 *  — горизонталь — время, вертикаль — поколение: от следа родителя (или от узла союза) — вертикальный ствол, от ствола —
 *    горизонтальные зубцы к звёздам детей; косых отрезков нет;
 *  — ствол стоит на 8–10 px левее звезды первого ребёнка своего гнезда (сдвиг влево — до 24 px, не левее узла союза);
 *    зубец — 5–40 px; дети одного союза дальше 40 px друг от друга — отдельные гнёзда, у каждого свой ствол и узел •;
 *  — узел союза ◆ — на следе матери, если она стоит рядом с мужем и не дальше двух строк от детей; иначе на следе отца
 *    (мать не названа, стоит далеко): у ромба тогда её имя, если у отца союзов с детьми два и больше;
 *  — от мужа к ромбу на следе жены идёт черта брака «‖» (а к ромбу на следе мужа — от жены, если она рядом);
 *  — линия не проходит через чужую звезду (зазор r + 5 px), вертикали разных союзов — не ближе 8 px (12 px, если одна
 *    из них — черта брака или лента);
 *  — пересечение с чужим следом — разрыв следа по 3 px с каждой стороны (у ленты — 7 px), соединение — только в узле;
 *  — на «всех лицах» длинная связь (больше 8 строк через живые чужие следы) — двумя обрывками с подписью цели;
 *  — у родителя без следа до узла (народ; след кончился раньше) — родовая черта точками, длиннее 160 px — обрывками.
 *
 * Две укладки:
 *  — 'map' («все лица», «все колена», ключевые лица): строки общей раскладки, союзы — по гнёздам детей (перечень
 *    правок K3 § 2.10 и K4 П1–П2: стволы левее детей, реестр стволов кадра, разрывы, обрывки, родовая черта);
 *  — 'family' (набор, род лица, созвездия, линии Мессии): семейная укладка «Г» (src/engine/family.ts), у каждого
 *    родителя по сторонам — одна «лестница союзов» (K3 § 2.1): ствол от следа родителя проходит группы союзов в порядке
 *    удаления, между группами делает ступеньку вправо; узел союза — на следе матери, зубцы — к её детям.
 *
 * Всё — в px кадра, для которого строилось (ribbons.ts так же кэширует нити): при сдвиге неба геометрия та же, небо
 * рисует её со сдвигом. Ключи связей — src/engine/linkkey.ts; ими пользуются попадание, подсказка, выбор и адрес «~c».
 */
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
import type { Union, Unions } from '../engine/unions.ts';
import { byId, models, type ModelData } from '../data/atlas.ts';
import { unions as ALL_UNIONS } from '../ui/reveal.ts';
import { listingOf, orderListing, type OrderListing } from './trails.ts';

// ---------- правила в числах ----------

/** Ствол — на столько px левее звезды первого ребёнка гнезда (Г3: 8–10). */
export const TRUNK_LEAD = 9;
/** Отступ ствола от середины звезды ребёнка: 9 px, у крупной звезды — край знака и ещё 3 px видимого зубца. */
export const leadOf = (s: { r: number }) => Math.max(TRUNK_LEAD, s.r + 4.5);
/** Наименьший шаг между узлами разных союзов на одном следе: ромб с подложкой цвета неба (r + 1,8) не задевает соседний. */
const nodeGapOf = (inp: Pick<LinkInput, 'nodeR' | 'layout'>) => 2 * (inp.nodeR ?? (inp.layout === 'family' ? NODE_R_FAMILY : NODE_R_MAP)) + 2;
/** Ствол — не дальше стольких px левее первого ребёнка (Я6: рождение − 32) и не ближе (рождение − 5). */
export const TRUNK_MAX = 32;
export const TRUNK_MIN = 5;
/** Зубец — не длиннее (Г3, Я6). */
export const TOOTH_MAX = 40;
/** Вертикали разных союзов — не ближе (Г6); если одна из них черта брака или лента — не ближе WIDE_GAP. */
export const TRUNK_GAP = 8;
export const WIDE_GAP = 12;
/** Зазор линии до чужой звезды сверх её радиуса (Г5). */
export const STAR_CLEAR = 5;
/** Разрыв следа на пересечении, px с каждой стороны (Г7); у ленты — RIBBON_CUT. */
export const TRAIL_CUT = 3;
export const RIBBON_CUT = 7;
/** Длинная связь на «всех лицах» (Г11): больше стольких строк — и через живые чужие следы. */
export const LONG_ROWS = 8;
/** Обрывок длинной связи, px. */
export const STUB_PX = 16;
/** Родовая черта длиннее стольких px — обрывками (Г12). */
export const CLAN_MAX = 160;
/** Мать — узлом своего союза, если она не дальше стольких строк от ближайшего ребёнка (Г8). */
export const MOTHER_ROWS = 2;
/** Жена стоит «у мужа» на общей раскладке — не дальше стольких строк (спутница — соседняя строка). */
export const SPOUSE_ROWS = 3.5;
/** Семейная укладка: дочь, стоящая у мужа, дальше стольких строк от родной семьи — обрывком (§ 4.2 п. 1). */
export const FAR_KID_ROWS = 4;
/** Ромб союза: 9 px в раскрытом небе, 7 px на «всех лицах» (§ 2, «Знаки»): полуразмеры. */
export const NODE_R_FAMILY = 4.5;
export const NODE_R_MAP = 3.5;
/** Узел • следующего гнезда — 4 px. */
export const JOIN_R = 2;

// ---------- вход ----------

export type LinkLayout = 'map' | 'family';

/** Звезда кадра для связей, px кадра. */
export interface LinkStar {
  /** номер узла неба */
  i: number;
  id: string;
  x: number;
  y: number;
  /** радиус знака (у женщины — с кольцом), px */
  r: number;
  /** конец нарисованного следа, px; null — следа нет (народ, род, младенец, призрак, лицо списка, «время не установлено») */
  x1: number | null;
  ghost: boolean;
  /** жена-спутница мужа на общей раскладке: её родная семья связана с её призраком */
  sat: string | null;
}

/** Союз набора (src/ui/reveal.ts, plates): раскрыт ли, сколько его лиц не на небе, от кого показан. */
export interface LinkPlate {
  open: boolean;
  hidden: number;
  from: string;
  dir: 'up' | 'down';
}

export interface LinkInput {
  layout: LinkLayout;
  stars: readonly LinkStar[];
  unions: Unions;
  /** высота строки, px */
  ky: number;
  /** лица линий Мессии на небе по порядку (после «Лк 3 как второе родословие Иосифа»); null — лент нет */
  lines: { joseph: readonly string[]; mary: readonly string[]; styles?: ReadonlyMap<string, PathStyle> } | null;
  /** союзы набора (показ «набор»): у свёрнутого — полый ромб с «+N» */
  plates?: ReadonlyMap<string, LinkPlate> | null;
  /** x рождения лица, px кадра, — и у лица не на небе (ромб свёрнутого союза встаёт в год первого ребёнка) */
  xOf?: (id: string) => number | null;
  /** длинные связи — обрывками (Г11): «все лица» */
  long?: boolean;
  /** полуразмер ромба, px */
  nodeR?: number;
  /** какие союзы брать: по умолчанию — союзы происхождения детей на небе */
  claims?: boolean;
  /**
   * семейная укладка (src/engine/family.ts, FamilyUnit; план неба Q2, SkyPlan.units): единицы союзов по родителю — кто
   * у чьего следа стоит (жена у мужа, дети у родителя). Грамматика берёт дом лица отсюда, чтобы стволы шли по укладке.
   */
  units?: ReadonlyMap<string, readonly { union: { id: string }; parent: string; wife: string | null; kids: readonly string[] }[]> | null;
}

// ---------- выход ----------

export type PathKind = 'trunk' | 'tooth' | 'bar' | 'jog' | 'clan' | 'stub' | 'ribbon';
export type PathStyle = 'solid' | 'dash' | 'dots';
/** Когда путь рисуется: всегда; только раскрытым (длинная связь целиком); только свёрнутым (обрывки длинной связи). */
export type PathWhen = 'always' | 'full' | 'short';

/** Путь связи: ломаная из горизонтальных и вертикальных отрезков, px кадра. */
export interface LinkPath {
  key: LinkKey;
  /** запись ключа (linkKeyString) */
  ks: string;
  kind: PathKind;
  style: PathStyle;
  /** точки: x0, y0, x1, y1, … */
  pts: number[];
  /** лица на концах: яркость пути — по ним */
  ends: string[];
  /** союз, к которому путь относится (у ленты — союз шага) */
  union: string | null;
  when: PathWhen;
  /** разрывы чужих следов, которые даёт путь: тройки «номер узла, x, полуширина» */
  cuts: number[];
  /** линия шага ленты (у kind 'ribbon') */
  line?: 'joseph' | 'mary';
}

/** Узел союза: ◆ (union) — на следе у ствола первого гнезда, • (join) — у стволов следующих гнёзд. */
export interface LinkNode {
  kind: 'union' | 'join';
  union: string;
  key: LinkKey;
  x: number;
  y: number;
  /** залит: дети союза на небе; полый с «+N» — свёрнут */
  open: boolean;
  count: string | null;
  /** подпись у ромба: имя матери, стоящей далеко (Г8) */
  mother: string | null;
  /** лицо, на чьём следе узел */
  owner: string;
  /** лицо, от которого союз показан (карточка союза, раскрытие) */
  from: string;
}

/** Подпись обрывка: где кончается отрезок, куда он смотрит, чья связь и кого он называет. */
export interface StubMark {
  key: LinkKey;
  ks: string;
  union: string | null;
  /** конец обрывка, px кадра */
  x: number;
  y: number;
  /** куда ведёт обрывок: −1 — вверх, 1 — вниз, 0 — вправо (родовая черта) */
  dir: -1 | 0 | 1;
  /** кого называет подпись: цели обрывка по порядку */
  targets: string[];
  /** чья это сторона: родителя (перечень детей) или ребёнка (имя родителя) */
  side: 'parent' | 'child';
  /** вид обрывка: длинная связь, родовая черта, дочь у мужа в семейной укладке */
  kind: 'long' | 'clan' | 'kid';
}

export interface LinkFrame {
  layout: LinkLayout;
  paths: LinkPath[];
  nodes: LinkNode[];
  stubs: StubMark[];
  /** ленты: «родитель>ребёнок» → x ступеньки шага и высота узла союза, через который идёт лента */
  via: Map<string, { x: number; y: number; union: string }>;
  /** замечания построителя: правила, которые в кадре выполнить не удалось (для переписи и отчёта) */
  issues: string[];
  /** союзы, чьи связи рисуют только ленты: их узел — «станция» маршрута лент, на обзоре (сплайн) его нет */
  ribbonOnly?: Set<string>;
}

const EMPTY: LinkFrame = { layout: 'map', paths: [], nodes: [], stubs: [], via: new Map(), issues: [] };

// ---------- общее ----------

/** Союз происхождения лица, который рисует небо: кровные отец и мать (у законного отца — тот же союз с пометой). */
export function mainUnion(U: Unions, id: string): Union | null {
  const u = U.origin.get(id)?.[0];
  return u && !u.id.includes('~') ? u : null;
}

/** Союз иного рода, который рисуется штрихом (Г10): по Луке, усыновление, по другому месту Писания. */
const DASHED = new Set(['by-luke', 'adoptive', 'alternative', 'levirate', 'legal']);
/** Начертание связи союза с ребёнком: штрих — иное происхождение, точки — толкование. */
export function kidStyle(u: Union): PathStyle {
  if (u.kidsCert === 'interpretation') return 'dots';
  if (u.claim && DASHED.has(u.claim) && u.id.includes('~')) return 'dash';
  return 'solid';
}

const key = (k: LinkKey) => linkKeyString(k) ?? '';
const unionKey = (u: string): LinkKey => ({ kind: 'union', union: u });
const childKey = (u: string, child: string): LinkKey => ({ kind: 'child', union: u, child });
const spouseKey = (u: string, person: string): LinkKey => ({ kind: 'spouse', union: u, person });

/** Шаги лент: «родитель>ребёнок» → линии (у общего шага — обе). */
function stepPairs(lines: LinkInput['lines']): Map<string, ('joseph' | 'mary')[]> {
  const out = new Map<string, ('joseph' | 'mary')[]>();
  if (!lines) return out;
  for (const ln of ['joseph', 'mary'] as const) {
    const seq = lines[ln];
    for (let k = 1; k < seq.length; k++) {
      const pk = `${seq[k - 1]}>${seq[k]}`;
      const a = out.get(pk);
      if (a) a.push(ln);
      else out.set(pk, [ln]);
    }
  }
  return out;
}

/** Сетка точек и прямоугольников: быстрый поиск звёзд у линии. */
class Grid<T> {
  private cells = new Map<number, T[]>();
  constructor(private readonly size: number) {}
  private k(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  add(x0: number, y0: number, x1: number, y1: number, v: T) {
    const s = this.size;
    for (let cx = Math.floor(Math.min(x0, x1) / s); cx <= Math.floor(Math.max(x0, x1) / s); cx++)
      for (let cy = Math.floor(Math.min(y0, y1) / s); cy <= Math.floor(Math.max(y0, y1) / s); cy++) {
        const kk = this.k(cx, cy);
        const a = this.cells.get(kk);
        if (a) a.push(v);
        else this.cells.set(kk, [v]);
      }
  }
  query(x0: number, y0: number, x1: number, y1: number, out: Set<T> = new Set()): Set<T> {
    const s = this.size;
    for (let cx = Math.floor(Math.min(x0, x1) / s); cx <= Math.floor(Math.max(x0, x1) / s); cx++)
      for (let cy = Math.floor(Math.min(y0, y1) / s); cy <= Math.floor(Math.max(y0, y1) / s); cy++) for (const v of this.cells.get(this.k(cx, cy)) ?? []) out.add(v);
    return out;
  }
}

/** Следы кадра по строкам: какие живые следы пересекает вертикаль (разрывы, длинные связи). */
class Trails {
  private rows: { y: number; x0: number; x1: number; i: number; id: string }[] = [];
  constructor(stars: readonly LinkStar[]) {
    for (const s of stars) if (s.x1 !== null && s.x1 > s.x + s.r + 1) this.rows.push({ y: s.y, x0: s.x + s.r, x1: s.x1, i: s.i, id: s.id });
    this.rows.sort((a, b) => a.y - b.y);
  }
  /** Живые следы, которые вертикаль x (y0…y1, без концов) пересекает, кроме следов лиц skip. */
  crossing(x: number, y0: number, y1: number, skip: ReadonlySet<string>): { i: number; id: string; y: number }[] {
    const lo = Math.min(y0, y1) + 0.75;
    const hi = Math.max(y0, y1) - 0.75;
    const out: { i: number; id: string; y: number }[] = [];
    if (hi <= lo) return out;
    let a = 0;
    let b = this.rows.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (this.rows[m].y < lo) a = m + 1;
      else b = m;
    }
    for (let k = a; k < this.rows.length && this.rows[k].y <= hi; k++) {
      const t = this.rows[k];
      if (x > t.x0 + 0.5 && x < t.x1 - 0.5 && !skip.has(t.id)) out.push({ i: t.i, id: t.id, y: t.y });
    }
    return out;
  }
}

/** Отрезки путей кадра — ломаная пути по отрезкам (x0, y0, x1, y1). */
export function segmentsOf(p: Pick<LinkPath, 'pts'>): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let k = 0; k + 3 < p.pts.length; k += 2) out.push([p.pts[k], p.pts[k + 1], p.pts[k + 2], p.pts[k + 3]]);
  return out;
}

/** Разрывы следов, которые даёт вертикаль пути (Г7). */
function addCuts(path: LinkPath, trails: Trails, skip: ReadonlySet<string>, half: number) {
  for (const [x0, y0, x1, y1] of segmentsOf(path)) {
    if (Math.abs(x1 - x0) > 0.5) continue;
    for (const t of trails.crossing(x0, y0, y1, skip)) path.cuts.push(t.i, x0, half);
  }
}

// ---------- построение ----------

/** Связи кадра по укладке. */
export function buildLinks(inp: LinkInput): LinkFrame {
  if (!inp.stars.length) return { ...EMPTY, layout: inp.layout, via: new Map() };
  const f = inp.layout === 'family' ? familyLinks(inp) : mapLinks(inp);
  // узлы-«станции» лент: союз шага ленты, у которого своих линий в кадре нет
  const drawn = new Set(f.paths.filter((p) => p.kind !== 'ribbon' && p.union).map((p) => p.union!));
  const rib = new Set([...f.via.values()].map((v) => v.union));
  f.ribbonOnly = new Set(f.nodes.filter((n) => rib.has(n.union) && !drawn.has(n.union)).map((n) => n.union));
  return f;
}

// ---------- общая раскладка («все лица») ----------

interface Nest {
  u: Union;
  /** родитель, чей след несёт узел, если мать не узлом */
  p: LinkStar;
  /** второй родитель на небе (мать или отец) */
  o: LinkStar | null;
  kids: LinkStar[];
  /** дети ленты: связь с ними рисует лента */
  rib: Set<string>;
  /** первое гнездо союза */
  first: boolean;
  /** узел — на следе второго родителя (матери) */
  motherNode: boolean;
  /** второй родитель связан чертой брака */
  linked: boolean;
  x: number;
  far: Set<string>;
  sameUnion: number;
  /** желаемый x ствола: у рождения первого ребёнка, а у нескольких союзов одного следа — с шагом узлов (Г7) */
  pref?: number;
}

function mapLinks(inp: LinkInput): LinkFrame {
  const { ky } = inp;
  const U = inp.unions;
  const main = new Map<string, LinkStar>();
  const ghost = new Map<string, LinkStar>();
  for (const s of inp.stars) (s.ghost ? ghost : main).set(s.id, s);
  const steps = stepPairs(inp.lines);
  const issues: string[] = [];
  // дети по союзам: у жены-спутницы родная семья — у её призрака
  const byUnion = new Map<string, { u: Union; kids: LinkStar[] }>();
  for (const s of inp.stars) {
    if (!s.ghost && s.sat && ghost.has(s.id)) continue;
    if (!s.ghost && s.sat) continue;
    const u = mainUnion(U, s.id);
    if (!u) continue;
    const g = byUnion.get(u.id);
    if (g) g.kids.push(s);
    else byUnion.set(u.id, { u, kids: [s] });
  }
  // союзы с детьми на каждого родителя (подпись матери у ромба — только при двух и больше, Г8)
  const unionsOf = new Map<string, number>();
  for (const { u } of byUnion.values()) for (const p of [u.a, u.b]) if (p) unionsOf.set(p, (unionsOf.get(p) ?? 0) + 1);

  const nests: Nest[] = [];
  for (const { u, kids } of byUnion.values()) {
    const pa = u.a ? main.get(u.a) : undefined;
    const pb = u.b ? main.get(u.b) : undefined;
    const p = pa ?? pb;
    if (!p) continue;
    const o = pa && pb ? pb : null;
    kids.sort((a, b) => a.x - b.x || a.y - b.y);
    const rib = new Set(kids.filter((k) => (u.a && steps.has(`${u.a}>${k.id}`)) || (u.b && steps.has(`${u.b}>${k.id}`))).map((k) => k.id));
    // гнёзда: дети одного союза ближе TOOTH_MAX от ствола первого — на одном стволе (Г3)
    const groups: LinkStar[][] = [];
    for (const k of kids) {
      const g = groups[groups.length - 1];
      if (g && k.x - (g[0].x - leadOf(g[0])) <= TOOTH_MAX) g.push(k);
      else groups.push([k]);
    }
    groups.forEach((g, n) => nests.push({ u, p, o, kids: g, rib, first: n === 0, motherNode: false, linked: false, x: g[0].x - leadOf(g[0]), far: new Set(), sameUnion: n }));
  }

  // узел союза: на следе матери, если она у мужа и не дальше двух строк от детей (Г4, Г8). Решает первое гнездо союза;
  // черта брака — только у него (одна связь — одна линия), следующие гнёзда висят на том же следе узлами •
  const byU = new Map<string, Nest[]>();
  for (const n of nests) {
    const a = byU.get(n.u.id);
    if (a) a.push(n);
    else byU.set(n.u.id, [n]);
  }
  for (const ns of byU.values()) {
    const n = ns[0];
    if (!n.o) continue;
    const plain = n.kids.filter((k) => !n.rib.has(k.id));
    const ks = plain.length ? plain : n.kids;
    const o = n.o;
    const dOP = Math.abs(o.y - n.p.y);
    const near = ks.reduce((b, k) => (Math.abs(k.y - o.y) < Math.abs(b.y - o.y) ? k : b), ks[0]);
    const side = Math.sign(near.y - n.p.y);
    const xs = n.kids[0].x - leadOf(n.kids[0]);
    const reaches = (s: LinkStar, x: number) => s.x1 !== null && s.x1 >= x - 1 && s.x + s.r + 2 < x;
    const qualifies = dOP <= SPOUSE_ROWS * ky && Math.abs(near.y - o.y) <= MOTHER_ROWS * ky + 1 && Math.sign(o.y - n.p.y) === side && reaches(o, xs);
    // черта брака: от мужа к ромбу на следе жены — или от жены к ромбу на следе мужа, если она стоит рядом
    const linked = qualifies ? reaches(n.p, xs) : dOP <= SPOUSE_ROWS * ky && reaches(o, xs);
    for (const m of ns) {
      m.motherNode = qualifies && (m === n || reaches(o, m.kids[0].x - leadOf(m.kids[0])));
      m.linked = linked && m === n;
    }
  }

  // звёзды: сетка для зазора Г5
  const stars = new Grid<LinkStar>(32);
  let maxR = 0;
  for (const s of inp.stars) {
    stars.add(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, s);
    maxR = Math.max(maxR, s.r);
  }
  const trails = new Trails(inp.stars);
  // реестр вертикалей кадра (Г6): x, y0…y1, союз, широкая (черта брака или лента)
  type Vert = { x: number; y0: number; y1: number; u: string; wide: boolean };
  const verts = new Grid<Vert>(24);
  // реестр зубцов кадра: горизонтали x0…x1 на высоте y, союз
  type Tooth = { x0: number; x1: number; y: number; u: string };
  const teeth = new Grid<Tooth>(24);
  // реестр узлов кадра: два ромба разных союзов на одном следе ближе ширины знака с подложкой — один знак на вид (Г7)
  type NodeAt = { x: number; y: number; u: string };
  const nodeAt = new Grid<NodeAt>(24);
  const nodeGap = nodeGapOf(inp);

  // порядок: сначала гнёзда лент (коридор), затем по времени
  const order = [...nests].sort((a, b) => {
    const ra = a.kids.some((k) => a.rib.has(k.id)) ? 0 : 1;
    const rb = b.kids.some((k) => b.rib.has(k.id)) ? 0 : 1;
    return ra - rb || a.kids[0].x - b.kids[0].x || a.kids[0].y - b.kids[0].y;
  });

  const owner = (n: Nest) => (n.motherNode ? n.o! : n.p);
  /** Строки, которые проходит вертикаль гнезда: узел, связанный второй родитель, дети без лент и с лентами. */
  const spanOf = (n: Nest, kids: readonly LinkStar[]) => {
    const own = owner(n);
    const ys = [own.y, ...kids.map((k) => k.y)];
    if (n.linked) ys.push((n.motherNode ? n.p : n.o!).y);
    return [Math.min(...ys), Math.max(...ys)] as const;
  };
  const members = (n: Nest) => new Set([n.p.id, ...(n.o ? [n.o.id] : []), ...n.kids.map((k) => k.id)]);
  /** Пределы ствола гнезда: не левее узла на следе (звезда владельца и второго родителя), не правее рождения − 5. */
  const boundsOf = (n: Nest): [number, number] => {
    const own = owner(n);
    const other = n.linked ? (n.motherNode ? n.p : n.o) : null;
    const firstX = n.kids[0].x;
    let lo = Math.max(firstX - TRUNK_MAX, own.x + own.r + 3);
    if (other) lo = Math.max(lo, other.x + other.r + 3);
    const maxTooth = Math.max(...n.kids.filter((k) => !n.rib.has(k.id)).map((k) => k.x), firstX);
    return [Math.max(lo, maxTooth - TOOTH_MAX), firstX - TRUNK_MIN];
  };
  // узлы нескольких гнёзд на одном следе — с шагом nodeGap заранее: справа налево от желаемых мест (слева простора больше),
  // затем слева направо до нижних пределов. Жадный разбор по одному гнезду ставил бы первый узел туда, где второму уже
  // некуда встать (Халев: три союза в 18 px следа)
  {
    const byOwner = new Map<string, Nest[]>();
    for (const n of nests) {
      const k = owner(n).id;
      const a = byOwner.get(k);
      if (a) a.push(n);
      else byOwner.set(k, [n]);
    }
    for (const ns of byOwner.values()) {
      if (ns.length < 2) continue;
      const rows = ns.map((n) => {
        const [lo, hi] = boundsOf(n);
        const want = Math.round(Math.max(lo, Math.min(hi, n.kids[0].x - leadOf(n.kids[0])))) + 0.5;
        return { n, lo, hi, want, p: want };
      });
      rows.sort((a, b) => a.want - b.want);
      for (let i = rows.length - 2; i >= 0; i--) rows[i].p = Math.min(rows[i].p, rows[i + 1].p - nodeGap);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.p < r.lo) r.p = Math.ceil(r.lo - 0.5) + 0.5;
        if (i && r.p < rows[i - 1].p + nodeGap) r.p = rows[i - 1].p + nodeGap;
        if (r.p > r.hi) r.p = Math.floor(r.hi - 0.5) + 0.5;
      }
      for (const r of rows) r.n.pref = r.p;
    }
  }

  for (const n of order) {
    const own = owner(n);
    const other = n.linked ? (n.motherNode ? n.p : n.o) : null;
    const plain = n.kids.filter((k) => !n.rib.has(k.id));
    const firstX = n.kids[0].x;
    const skip = members(n);
    // соединённые с вертикалью лица: владелец узла, второй родитель с чертой брака и дети; следы остальных она пересекает
    // с разрывом, а звёзды остальных (мать без черты, дети лент) обходит (Г5, Г7)
    const tied = new Set([own.id, ...(other ? [other.id] : []), ...plain.map((k) => k.id)]);
    // длинные связи (Г11): ребёнок дальше 8 строк от узла, и вертикаль к нему пересекает живые чужие следы
    if (inp.long) {
      const x0 = firstX - leadOf(n.kids[0]);
      for (const k of plain) if (Math.abs(k.y - own.y) > LONG_ROWS * ky && trails.crossing(x0, own.y, k.y, tied).length) n.far.add(k.id);
    }
    const near = n.kids.filter((k) => !n.far.has(k.id));
    const [y0, y1] = spanOf(n, near);
    const wide = n.linked || near.some((k) => n.rib.has(k.id));
    // пределы ствола: не левее узла на следе (звезда владельца и второго родителя), не правее рождения − 5
    let lo = Math.max(firstX - TRUNK_MAX, own.x + own.r + 3);
    if (other) lo = Math.max(lo, other.x + other.r + 3);
    const hi = firstX - TRUNK_MIN;
    const maxTooth = Math.max(...plain.map((k) => k.x), firstX);
    lo = Math.max(lo, maxTooth - TOOTH_MAX);
    const cost = (x: number): number => {
      let c = 0;
      // вертикали других союзов
      for (const v of verts.query(x - WIDE_GAP, y0, x + WIDE_GAP, y1)) {
        if (v.u === n.u.id) continue;
        if (Math.min(v.y1, y1) - Math.max(v.y0, y0) <= 0) continue;
        if (Math.abs(v.x - x) < (v.wide || wide ? WIDE_GAP : TRUNK_GAP)) c += 100;
      }
      // чужие звёзды у вертикали (свои дети с зубцами стоят дальше r + 5 сами)
      for (const s of stars.query(x - maxR - STAR_CLEAR, y0 - maxR, x + maxR + STAR_CLEAR, y1 + maxR)) {
        if (s.id === own.id || (other && s.id === other.id) || s.y < y0 - s.r || s.y > y1 + s.r) continue;
        if (Math.abs(s.x - x) < s.r + STAR_CLEAR) c += 1000;
      }
      // звёзды у обрывков длинных связей: у узла и у каждого дальнего ребёнка (Г11)
      if (n.far.size) {
        const edgeUp = Math.min(own.y, ...near.map((k) => k.y));
        const edgeDn = Math.max(own.y, ...near.map((k) => k.y));
        const bits: [number, number][] = [];
        for (const k of plain)
          if (n.far.has(k.id)) {
            const dir = Math.sign(own.y - k.y);
            bits.push([k.y, k.y + dir * STUB_PX]);
            bits.push(k.y < own.y ? [edgeUp, edgeUp - STUB_PX] : [edgeDn, edgeDn + STUB_PX]);
          }
        for (const [a, b] of bits)
          for (const s of stars.query(x - maxR - STAR_CLEAR, Math.min(a, b) - maxR, x + maxR + STAR_CLEAR, Math.max(a, b) + maxR)) {
            if (tied.has(s.id) || s.y < Math.min(a, b) - s.r || s.y > Math.max(a, b) + s.r) continue;
            if (Math.abs(s.x - x) < s.r + STAR_CLEAR) c += 1000;
          }
      }
      // узел другого союза на том же следе рядом: ромбы слились бы в один (Г7) — хуже близкой вертикали, лучше звезды; если
      // места нет (очень тесная семья на мелком масштабе), лучше ромбы вплотную, чем один поверх другого
      for (const v of nodeAt.query(x - nodeGap, own.y - 1, x + nodeGap, own.y + 1))
        if (v.u !== n.u.id && Math.abs(v.y - own.y) < 1 && Math.abs(v.x - x) < nodeGap) c += 200 + (400 * (nodeGap - Math.abs(v.x - x))) / nodeGap;
      // вертикаль пересекает зубцы других союзов; свои зубцы пересекают вертикали других союзов (Я11)
      for (const t of teeth.query(x, y0, x, y1)) if (t.u !== n.u.id && t.y > y0 + 0.5 && t.y < y1 - 0.5 && x > t.x0 + 0.5 && x < t.x1 - 0.5) c += 100;
      for (const k of plain) {
        if (n.far.has(k.id)) continue;
        for (const v of verts.query(x, k.y, k.x, k.y)) if (v.u !== n.u.id && v.x > x + 0.5 && v.x < k.x - k.r - 2 && k.y > v.y0 + 0.5 && k.y < v.y1 - 0.5) c += 100;
      }
      // чужие звёзды на зубцах
      for (const k of plain) {
        if (n.far.has(k.id)) continue;
        for (const s of stars.query(x, k.y - maxR - STAR_CLEAR, k.x, k.y + maxR + STAR_CLEAR)) {
          if (skip.has(s.id) || s.x <= x || s.x >= k.x) continue;
          if (Math.abs(s.y - k.y) < s.r + STAR_CLEAR) c += 1000;
        }
      }
      return c;
    };
    const lead = leadOf(n.kids[0]);
    let best = Math.max(lo, Math.min(hi, firstX - lead));
    if (lo > hi) {
      best = lo;
      issues.push(`тесно:${n.u.id}`);
    } else {
      let bc = Infinity;
      // кандидаты — сразу в серединах пикселей: округление после выбора не съедает зазор до звезды
      const pref = n.pref ?? Math.round(firstX - lead) + 0.5;
      const cands: number[] = [];
      for (let d = 0; d <= TRUNK_MAX; d++) {
        if (pref - d >= lo && pref - d <= hi) cands.push(pref - d);
        if (d && pref + d >= lo && pref + d <= hi) cands.push(pref + d);
      }
      for (const x of cands) {
        const c = cost(x) + Math.abs(x - pref) * (x > pref ? 2 : 1);
        if (c < bc) {
          bc = c;
          best = x;
          if (c < 1) break;
        }
      }
      if (bc >= 100) issues.push(`${bc >= 1000 ? 'звезда' : 'рядом'}:${n.u.id}`);
    }
    n.x = Math.floor(best) + 0.5;
    // длинные связи — по окончательному x ствола: он мог уйти от пробного и пересечь живые следы (Г11)
    if (inp.long)
      for (const k of plain)
        if (!n.far.has(k.id) && Math.abs(k.y - own.y) > LONG_ROWS * ky && trails.crossing(n.x, own.y, k.y, tied).length) n.far.add(k.id);
    const [fy0, fy1] = spanOf(n, n.kids.filter((k) => !n.far.has(k.id)));
    verts.add(n.x, fy0, n.x, fy1, { x: n.x, y0: fy0, y1: fy1, u: n.u.id, wide });
    nodeAt.add(n.x, own.y, n.x, own.y, { x: n.x, y: own.y, u: n.u.id });
    // зубцы гнезда — в реестр: вертикали других союзов их не пересекают (Я11)
    for (const k of plain) if (!n.far.has(k.id)) teeth.add(n.x, k.y, k.x, k.y, { x0: n.x, x1: k.x - k.r - 1.5, y: k.y, u: n.u.id });
  }

  // пути
  const paths: LinkPath[] = [];
  const nodes: LinkNode[] = [];
  const stubs: StubMark[] = [];
  const via = new Map<string, { x: number; y: number; union: string }>();
  // разрыв — у каждого следа, который путь пересекает, кроме следов его концов: соединение бывает только в узле (Г7)
  const push = (p: Omit<LinkPath, 'ks' | 'cuts'>, _cut: ReadonlySet<string>, half = TRAIL_CUT) => {
    const path: LinkPath = { ...p, ks: key(p.key), cuts: [] };
    addCuts(path, trails, new Set(p.ends), half);
    paths.push(path);
    return path;
  };
  for (const n of nests) {
    const u = n.u;
    const own = owner(n);
    const other = n.linked ? (n.motherNode ? n.p : n.o) : null;
    const x = n.x;
    const skip = members(n);
    const style = kidStyle(u);
    const near = n.kids.filter((k) => !n.far.has(k.id));
    const plainNear = near.filter((k) => !n.rib.has(k.id));
    // вертикаль гнезда по остановкам: узел, второй родитель, дети; черта брака — от второго родителя до узла
    const stops = [own.y, ...near.map((k) => k.y), ...(other ? [other.y] : [])].sort((a, b) => a - b);
    const lo = stops[0];
    const hi = stops[stops.length - 1];
    const kidYs = plainNear.map((k) => k.y);
    const ribYs = near.filter((k) => n.rib.has(k.id)).map((k) => k.y);
    // отрезки вертикали между соседними остановками
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = stops[k];
      const b = stops[k + 1];
      if (b - a < 0.5) continue;
      const mid = (a + b) / 2;
      // черта брака: между вторым родителем и узлом, без детей между
      const isBar = !!other && ((mid - own.y) * (mid - other.y) < 0) && !kidYs.some((y) => (y - a) * (y - b) < 0) && !ribYs.some((y) => (y - a) * (y - b) < 0);
      // отрезок, который проходит только лента (к ребёнку линии за узлом и дальше нет других детей)
      const beyondPlain = !kidYs.some((y) => (y >= b && own.y <= a) || (y <= a && own.y >= b));
      const ribOnly = !isBar && beyondPlain && ribYs.some((y) => (y >= b && own.y <= a) || (y <= a && own.y >= b));
      if (ribOnly) continue;
      if (isBar) push({ key: spouseKey(u.id, other!.id), kind: 'bar', style: 'solid', pts: [x, a, x, b], ends: [other!.id, own.id], union: u.id, when: 'always' }, skip);
      else push({ key: unionKey(u.id), kind: 'trunk', style, pts: [x, a, x, b], ends: [own.id, ...(other ? [other.id] : []), ...near.map((q) => q.id)], union: u.id, when: 'always' }, skip);
    }
    void lo;
    void hi;
    // зубцы
    for (const k of plainNear) {
      const e = k.x - k.r - 1.5;
      if (e - x > 0.5) push({ key: childKey(u.id, k.id), kind: 'tooth', style, pts: [x, k.y, e, k.y], ends: [own.id, ...(other ? [other.id] : []), k.id], union: u.id, when: 'always' }, skip);
    }
    // ленты: через узел своего шага
    for (const k of near)
      for (const par of [u.a, u.b])
        if (par && n.rib.has(k.id) && steps.has(`${par}>${k.id}`)) via.set(`${par}>${k.id}`, { x, y: own.y, union: u.id });
    // длинные связи (Г11): целиком — только раскрытыми; свёрнутыми — обрывки у узла и у каждого дальнего ребёнка
    const far = n.kids.filter((k) => n.far.has(k.id));
    if (far.length) {
      for (const dir of [-1, 1] as const) {
        const fs = far.filter((k) => Math.sign(k.y - own.y) === dir);
        if (!fs.length) continue;
        const reach = Math.max(...fs.map((k) => Math.abs(k.y - own.y)));
        const edge = dir < 0 ? Math.min(own.y, ...near.map((k) => k.y), ...(other ? [other.y] : [])) : Math.max(own.y, ...near.map((k) => k.y), ...(other ? [other.y] : []));
        // целиком: от края ближней части до самого дальнего ребёнка
        push({ key: unionKey(u.id), kind: 'trunk', style, pts: [x, edge, x, own.y + dir * reach], ends: [own.id, ...fs.map((k) => k.id)], union: u.id, when: 'full' }, skip);
        // обрывок у узла
        const sy = edge + dir * STUB_PX;
        push({ key: unionKey(u.id), kind: 'stub', style, pts: [x, edge, x, sy], ends: [own.id, ...fs.map((k) => k.id)], union: u.id, when: 'short' }, skip);
        stubs.push({ key: unionKey(u.id), ks: key(unionKey(u.id)), union: u.id, x, y: sy, dir, targets: fs.map((k) => k.id), side: 'parent', kind: 'long' });
      }
      for (const k of far) {
        const e = k.x - k.r - 1.5;
        const dir = Math.sign(own.y - k.y) as -1 | 1;
        const ck = childKey(u.id, k.id);
        if (e - x > 0.5) push({ key: ck, kind: 'tooth', style, pts: [x, k.y, e, k.y], ends: [own.id, k.id], union: u.id, when: 'always' }, skip);
        push({ key: ck, kind: 'stub', style, pts: [x, k.y + dir * STUB_PX, x, k.y], ends: [own.id, k.id], union: u.id, when: 'short' }, skip);
        stubs.push({ key: ck, ks: key(ck), union: u.id, x, y: k.y + dir * STUB_PX, dir, targets: [own.id], side: 'child', kind: 'long' });
      }
    }
    // родовая черта (Г12): у владельца узла нет следа до узла — точками от знака или от конца следа. Гнездо, всех детей
    // которого ведут ленты, черты не получает: к ним идёт сама лента (Г1)
    const tail = own.x1 === null ? own.x + own.r + 1.5 : own.x1;
    if (tail < x - 1 && plainNear.length + n.far.size > 0) {
      const len = x - tail;
      const ck = unionKey(u.id);
      if (len <= CLAN_MAX) push({ key: ck, kind: 'clan', style: 'dots', pts: [tail, own.y, x, own.y], ends: [own.id], union: u.id, when: 'always' }, skip);
      else {
        push({ key: ck, kind: 'clan', style: 'dots', pts: [tail, own.y, x, own.y], ends: [own.id], union: u.id, when: 'full' }, skip);
        push({ key: ck, kind: 'stub', style: 'dots', pts: [tail, own.y, tail + STUB_PX, own.y], ends: [own.id], union: u.id, when: 'short' }, skip);
        push({ key: ck, kind: 'stub', style: 'dots', pts: [x - STUB_PX, own.y, x, own.y], ends: [own.id], union: u.id, when: 'short' }, skip);
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: tail + STUB_PX, y: own.y, dir: 0, targets: n.kids.map((k) => k.id), side: 'parent', kind: 'clan' });
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: x - STUB_PX, y: own.y, dir: 0, targets: [own.id], side: 'child', kind: 'clan' });
      }
    }
    // узел: ◆ у первого гнезда союза, • у следующих
    const count = unionsOf.get(n.p.id) ?? 0;
    // имя матери у ромба на следе отца — если у отца союзов с детьми два и больше (Г8); мать не названа — пустая строка:
    // у ромба тогда название союза «Давид (мать не названа)» (решение 75; trails.ts, drawLinkLabels)
    const farMother =
      !n.motherNode && n.o && !n.linked && count >= 2 ? n.o.id : !n.motherNode && !n.o && u.b && u.b !== n.p.id && count >= 2 ? u.b : !n.motherNode && !u.b && count >= 2 ? '' : null;
    nodes.push({
      kind: n.first ? 'union' : 'join',
      union: u.id,
      key: unionKey(u.id),
      x,
      y: own.y,
      open: true,
      count: null,
      mother: n.first ? farMother : null,
      owner: own.id,
      from: n.p.id,
    });
  }

  // бездетные браки жён-спутниц: ромб на следе жены у её звезды, черта брака от мужа (Г4)
  const withKids = new Set(nests.map((n) => n.u.id));
  for (const s of inp.stars) {
    if (s.ghost || !s.sat) continue;
    const h = main.get(s.sat);
    if (!h) continue;
    const u = (U.of.get(s.id) ?? []).find((q) => (q.a === h.id && q.b === s.id) || (q.b === h.id && q.a === s.id));
    if (!u || withKids.has(u.id) || s.x1 === null) continue;
    if (Math.abs(h.y - s.y) > SPOUSE_ROWS * ky || h.x1 === null) continue;
    const x = Math.round(Math.min(s.x1 - 2, Math.max(s.x + s.r, h.x + h.r) + 12)) + 0.5;
    if (x <= s.x + s.r + 1 || x >= h.x1) continue;
    const skip = new Set([s.id, h.id]);
    const path: LinkPath = { key: spouseKey(u.id, h.id), ks: '', kind: 'bar', style: 'solid', pts: [x, h.y, x, s.y], ends: [h.id, s.id], union: u.id, when: 'always', cuts: [] };
    path.ks = key(path.key);
    addCuts(path, trails, skip, TRAIL_CUT);
    paths.push(path);
    nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x, y: s.y, open: true, count: null, mother: null, owner: s.id, from: h.id });
  }

  // шаги лент без своего гнезда (союз иного рода: Нирий → Салафиил по Луке, Лк 3:27): узел на следе родителя шага
  for (const pk of steps.keys()) {
    if (via.has(pk)) continue;
    const [pa, ka] = pk.split('>');
    const P = main.get(pa);
    const K = main.get(ka);
    if (!P || !K) continue;
    const u = (U.origin.get(ka) ?? []).find((q) => q.a === pa || q.b === pa);
    if (!u) continue;
    const x = Math.round(Math.max(P.x + P.r + 3, K.x - TRUNK_LEAD)) + 0.5;
    via.set(pk, { x, y: P.y, union: u.id });
    if (!nodes.some((q) => q.union === u.id)) nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x, y: P.y, open: true, count: null, mother: null, owner: P.id, from: P.id });
  }
  clearVia(inp, main, via, paths, nodes);
  ribbonPaths(inp, main, via, trails, paths);
  return { layout: 'map', paths, nodes, stubs, via, issues };
}

// ---------- семейная укладка («Г»): лестница союзов (K3 § 2.1) ----------

/** Союзы семейного неба: с ребёнком на небе или оба супруга на небе; утверждения иного рода — кроме «предка». */
function familyUnions(U: Unions, S: ReadonlySet<string>): Union[] {
  const out: Union[] = [];
  for (const u of U.byId.values()) {
    if (u.claim === 'ancestor') continue;
    const par = (!!u.a && S.has(u.a)) || (!!u.b && S.has(u.b));
    if (!par) continue;
    if (u.kids.some((k) => S.has(k)) || (u.a && u.b && S.has(u.a) && S.has(u.b))) out.push(u);
  }
  return out;
}

/**
 * Где стоит лицо семейного неба (K3 § 2.2 п. 1): жена — у мужа, если у них есть дети на небе или её родителей на небе
 * нет; остальные — у союза своих родителей (у отца, а без него — у матери); лица линий Мессии — в коридоре (null).
 */
export function familyHome(U: Unions, S: ReadonlySet<string>, spine: ReadonlySet<string>): Map<string, string | null> {
  const shown = familyUnions(U, S);
  const wifeOf = new Map<string, string>();
  for (const u of shown) {
    if (u.id.includes('~') || !u.a || !u.b || !S.has(u.a) || !S.has(u.b) || spine.has(u.b)) continue;
    const hasKids = u.kids.some((k) => S.has(k));
    const natal = U.origin.get(u.b)?.find((o) => !o.id.includes('~') && ((o.a && S.has(o.a)) || (o.b && S.has(o.b))));
    const prev = wifeOf.get(u.b);
    if ((hasKids || !natal) && (!prev || hasKids)) wifeOf.set(u.b, u.a);
  }
  const home = new Map<string, string | null>();
  for (const id of S) {
    if (spine.has(id)) home.set(id, null);
    else if (wifeOf.has(id)) home.set(id, wifeOf.get(id)!);
    else {
      const o = U.origin.get(id)?.find((x) => !x.id.includes('~') && ((x.a && S.has(x.a)) || (x.b && S.has(x.b))));
      home.set(id, o ? (o.a && S.has(o.a) ? o.a : o.b) : null);
    }
  }
  return home;
}

function familyLinks(inp: LinkInput): LinkFrame {
  const { ky } = inp;
  const U = inp.unions;
  const gap = TRUNK_LEAD;
  const main = new Map<string, LinkStar>();
  for (const s of inp.stars) if (!s.ghost) main.set(s.id, s);
  const S = new Set(main.keys());
  const spine = new Set([...(inp.lines?.joseph ?? []), ...(inp.lines?.mary ?? [])].filter((id) => S.has(id)));
  const home = familyHome(U, S, spine);
  // дом лица по укладке (стык 2): жена — у мужа, дети — у родителя своей единицы
  if (inp.units)
    for (const [parent, us] of inp.units)
      for (const u of us) {
        if (!S.has(parent)) continue;
        if (u.wife && S.has(u.wife) && !spine.has(u.wife)) home.set(u.wife, parent);
        for (const k of u.kids) if (S.has(k) && !spine.has(k)) home.set(k, parent);
      }
  const steps = stepPairs(inp.lines);
  const trails = new Trails(inp.stars);
  const issues: string[] = [];
  const paths: LinkPath[] = [];
  const nodes: LinkNode[] = [];
  const stubs: StubMark[] = [];
  const via = new Map<string, { x: number; y: number; union: string }>();
  const push = (p: Omit<LinkPath, 'ks' | 'cuts'>, skip: ReadonlySet<string>) => {
    const path: LinkPath = { ...p, ks: key(p.key), cuts: [] };
    addCuts(path, trails, skip, TRAIL_CUT);
    paths.push(path);
    return path;
  };
  const Y = (id: string) => main.get(id)!.y;
  const X = (id: string) => main.get(id)!.x;
  const R = (id: string) => main.get(id)!.r;
  const ribbon = (u: Union, k: string) => (!!u.a && steps.has(`${u.a}>${k}`)) || (!!u.b && steps.has(`${u.b}>${k}`));
  type Group = { u: Union; side: number; members: string[]; kids: string[]; mother: string | null; nearR: number; fb: number; bus: number; style: PathStyle };
  const byP = new Map<string, Group[]>();
  const lineOnly: { u: Union; p: string; fb: number }[] = [];
  const plates = inp.plates ?? null;
  const shown = familyUnions(U, S);
  const shownIds = new Set(shown.map((u) => u.id));
  // союзы набора, которых на небе нет целиком (свёрнутые): узел с «+N»
  const collapsed: { u: Union; plate: LinkPlate }[] = [];
  if (plates)
    for (const [uid, pl] of plates) {
      const u = U.byId.get(uid);
      if (!u) continue;
      if (!pl.open && pl.hidden > 0 && !shownIds.has(uid)) collapsed.push({ u, plate: pl });
    }

  for (const u of shown) {
    const p = u.a && S.has(u.a) ? u.a : u.b && S.has(u.b) ? u.b : null;
    if (!p) continue;
    const kids = u.kids.filter((k) => S.has(k));
    const o0 = [u.a, u.b].find((x) => !!x && x !== p && S.has(x) && !u.kids.includes(x)) ?? null;
    const other = o0 && home.get(o0) === p ? o0 : null;
    const isNear = (k: string) => Math.abs(Y(k) - Y(p)) <= FAR_KID_ROWS * ky + 0.5;
    const plain = kids.filter((k) => !ribbon(u, k) && (home.get(k) === p || isNear(k)));
    const style = kidStyle(u);
    // дальние дети (дочь, ставшая женой лица из показа, § 4.2 п. 1) — обрывками у своего ствола и у самой дочери
    for (const k of kids)
      if (!ribbon(u, k) && home.get(k) !== p && !isNear(k)) {
        const ck = childKey(u.id, k);
        const x = Math.max(X(p) + R(p) + 4, Math.min(...kids.map(X)) - gap);
        const dir = Math.sign(Y(k) - Y(p)) as -1 | 1;
        push({ key: ck, kind: 'stub', style: kidStyle(u), pts: [x, Y(p), x, Y(p) + dir * STUB_PX], ends: [p, k], union: u.id, when: 'always' }, new Set([p, k]));
        stubs.push({ key: ck, ks: key(ck), union: u.id, x, y: Y(p) + dir * STUB_PX, dir, targets: [k], side: 'parent', kind: 'kid' });
        const kx = X(k) - R(k) - 1.5;
        push({ key: ck, kind: 'stub', style: kidStyle(u), pts: [kx - STUB_PX, Y(k), kx, Y(k)], ends: [p, k], union: u.id, when: 'always' }, new Set([p, k]));
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: kx - STUB_PX, y: Y(k), dir: 0, targets: [p], side: 'child', kind: 'kid' });
      }
    const fb = kids.length ? Math.min(...kids.map(X)) : Math.max(X(p) + R(p), other ? X(other) + R(other) : X(p)) + 3 * gap;
    const pr = Y(p);
    const bySide = new Map<number, string[]>();
    for (const m of [...(other ? [other] : []), ...plain]) {
      const s = Math.sign(Y(m) - pr) || 1;
      const a = bySide.get(s);
      if (a) a.push(m);
      else bySide.set(s, [m]);
    }
    if (!bySide.size) {
      lineOnly.push({ u, p, fb });
      continue;
    }
    for (const [side, ms] of bySide) {
      const d = ms.map((m) => Math.abs(Y(m) - pr));
      const a = byP.get(p);
      const g: Group = { u, side, members: ms, kids: ms.filter((m) => m !== other), mother: other && ms.includes(other) ? other : null, nearR: Math.min(...d), fb, bus: 0, style };
      if (a) a.push(g);
      else byP.set(p, [g]);
    }
  }

  // звёзды кадра, мимо которых идут стволы (Г5)
  const clear = inp.stars.filter((st) => !st.ghost);
  for (const [p, gs] of byP) {
    const py = Y(p);
    for (const side of [1, -1]) {
      const a = gs.filter((q) => q.side === side).sort((q1, q2) => q1.nearR - q2.nearR);
      if (!a.length) continue;
      // ствол группы i — не правее первого рождения этой и всех внешних групп: он проходит строки только своей группы;
      // чужая звезда на его пути (ребёнок коридора, лицо другой семьи) — ствол левее неё на r + 5 (Г5)
      for (let i = a.length - 1; i >= 0; i--) {
        const q = a[i];
        const own = q.kids.length ? Math.min(...q.kids.map((k) => X(k) - leadOf(main.get(k)!))) : q.fb - gap;
        const outer = i + 1 < a.length ? a[i + 1].bus : Infinity;
        let b = Math.min(own, outer);
        const ys = [py, ...q.members.map(Y)];
        const lo = Math.min(...ys);
        const hi = Math.max(...ys);
        const mine = new Set([p, ...q.members]);
        for (let pass = 0; pass < 3; pass++)
          for (const st of clear) {
            if (mine.has(st.id) || st.y < lo - 0.5 || st.y > hi + 0.5) continue;
            if (st.x > b - 0.5 && st.x - (st.r + STAR_CLEAR) < b) b = st.x - st.r - STAR_CLEAR - 1;
          }
        b = Math.max(b, X(p) + R(p) + 4);
        if (q.mother) b = Math.max(b, X(q.mother) + R(q.mother) + 4);
        // к середине пикселя — влево: зазор до звезды справа не съедается округлением
        q.bus = Math.floor(b) + 0.5;
      }
      // лестница идёт только вправо: внутренний ствол, сдвинутый вправо звездой матери, тянет за собой внешние
      for (let i = 1; i < a.length; i++) a[i].bus = Math.max(a[i].bus, a[i - 1].bus);
      const farOf = (q: Group) => q.members.reduce((f, m) => (Math.abs(Y(m) - py) > Math.abs(f - py) ? Y(m) : f), py);
      const nearOf = (q: Group) => q.members.reduce((f, m) => (Math.abs(Y(m) - py) < Math.abs(f - py) ? Y(m) : f), farOf(q));
      let yStart = py;
      for (let i = 0; i < a.length; i++) {
        const q = a[i];
        const far = farOf(q);
        const skip = new Set([p, ...q.members]);
        const node = q.mother ? Y(q.mother) : yStart;
        // гнёзда (Г3): дети группы сверху вниз — по году; ствол гнезда — не дальше 32 px левее первого ребёнка, зубцы —
        // не длиннее 40 px; следующее гнездо — ступенькой вправо от главного ствола между строками, узел • в развилке
        const kids = [...q.kids].sort((k1, k2) => Y(k1) - Y(k2) || X(k1) - X(k2));
        const nests: { x: number; kids: string[] }[] = [{ x: q.bus, kids: [] }];
        for (const k of kids) {
          const cur = nests[nests.length - 1];
          const lead = X(k) - cur.x;
          if (cur.kids.length ? lead > TOOTH_MAX : lead > TRUNK_MAX) nests.push({ x: Math.max(cur.x, Math.floor(X(k) - leadOf(main.get(k)!)) + 0.5), kids: [k] });
          else cur.kids.push(k);
        }
        const first = nests[0].kids;
        // главный ствол: от начала (след родителя или ступенька лестницы) через мать и первое гнездо до дальнего лица группы;
        // черта брака — от начала до ромба матери, если между ними нет детей первого гнезда
        const firstYs = first.map(Y);
        const barFree = !!q.mother && !firstYs.some((y) => (y - yStart) * (y - node) < 0);
        const stops = [...new Set([yStart, far, ...(q.mother ? [node] : []), ...firstYs])].sort((m, n) => m - n);
        for (let k = 0; k + 1 < stops.length; k++) {
          const s0 = stops[k];
          const s1 = stops[k + 1];
          if (s1 - s0 < 0.5) continue;
          const mid = (s0 + s1) / 2;
          const isBar = barFree && (mid - yStart) * (mid - node) < 0;
          if (isBar) push({ key: spouseKey(q.u.id, p), kind: 'bar', style: 'solid', pts: [q.bus, s0, q.bus, s1], ends: [p, q.mother!], union: q.u.id, when: 'always' }, skip);
          else push({ key: unionKey(q.u.id), kind: 'trunk', style: q.style, pts: [q.bus, s0, q.bus, s1], ends: [p, ...q.members], union: q.u.id, when: 'always' }, skip);
        }
        const tooth = (x: number, k: string) => {
          const kx = X(k) - R(k) - 1.5;
          const len = X(k) - x;
          if (len > TOOTH_MAX + 0.5 || len < TRUNK_MIN - 0.5) issues.push(`зубец:${q.u.id}>${k}:${Math.round(len)}`);
          if (kx - x > 0.5) push({ key: childKey(q.u.id, k), kind: 'tooth', style: q.style, pts: [x, Y(k), kx, Y(k)], ends: [p, ...(q.mother ? [q.mother] : []), k], union: q.u.id, when: 'always' }, skip);
        };
        for (const k of first) tooth(q.bus, k);
        // следующие гнёзда: ступенька от главного ствола между строками и свой ствол через своих детей
        let prevY = first.length ? Math.max(...firstYs.map((y) => y)) : q.mother ? node : yStart;
        if (first.length && Y(q.kids[0]) < node) prevY = Math.max(...firstYs);
        for (let n = 1; n < nests.length; n++) {
          const ns = nests[n];
          const y0 = Y(ns.kids[0]);
          const y1 = Y(ns.kids[ns.kids.length - 1]);
          const jy = (prevY + y0) / 2;
          push({ key: unionKey(q.u.id), kind: 'jog', style: q.style, pts: [q.bus, jy, ns.x, jy], ends: [p, ...(q.mother ? [q.mother] : []), ...ns.kids], union: q.u.id, when: 'always' }, skip);
          push({ key: unionKey(q.u.id), kind: 'trunk', style: q.style, pts: [ns.x, jy, ns.x, y1], ends: [p, ...(q.mother ? [q.mother] : []), ...ns.kids], union: q.u.id, when: 'always' }, skip);
          nodes.push({ kind: 'join', union: q.u.id, key: unionKey(q.u.id), x: q.bus, y: jy, open: true, count: null, mother: null, owner: q.mother ?? p, from: p });
          for (const k of ns.kids) tooth(ns.x, k);
          prevY = y1;
        }
        if (i + 1 < a.length) {
          const nxt = a[i + 1];
          const jy = (far + nearOf(nxt)) / 2;
          const nk = nxt.mother ? spouseKey(nxt.u.id, p) : unionKey(nxt.u.id);
          // хвост ствола к ступеньке и сама ступенька — путь родителя к следующему союзу
          push({ key: nk, kind: 'jog', style: 'solid', pts: [q.bus, far, q.bus, jy, nxt.bus, jy], ends: [p, ...q.members], union: nxt.u.id, when: 'always' }, new Set([p, ...q.members]));
          yStart = jy;
        }
        // родовая черта (Г12): след родителя (у первой группы стороны) или матери кончился раньше ствола — точками до него
        const clan = (who: string, y: number) => {
          const st = main.get(who)!;
          const tail = st.x1 === null ? st.x + st.r + 1.5 : st.x1;
          if (tail >= q.bus - 1) return;
          const ck = unionKey(q.u.id);
          // длинная черта или чужой след на той же строке (строку занимают после чужого следа) — обрывками с подписями
          const busy = inp.stars.some((o) => o.id !== who && Math.abs(o.y - y) < 0.5 && o.x < q.bus && (o.x1 ?? o.x + o.r) > tail);
          if (q.bus - tail <= CLAN_MAX && !busy) {
            push({ key: ck, kind: 'clan', style: 'dots', pts: [tail, y, q.bus, y], ends: [who], union: q.u.id, when: 'always' }, new Set([who]));
            return;
          }
          const stub = Math.min(STUB_PX, (q.bus - tail) / 3);
          push({ key: ck, kind: 'stub', style: 'dots', pts: [tail, y, tail + stub, y], ends: [who], union: q.u.id, when: 'always' }, new Set([who]));
          push({ key: ck, kind: 'stub', style: 'dots', pts: [q.bus - stub, y, q.bus, y], ends: [who], union: q.u.id, when: 'always' }, new Set([who]));
          stubs.push({ key: ck, ks: key(ck), union: q.u.id, x: tail + stub, y, dir: 0, targets: q.kids.length ? q.kids : q.members, side: 'parent', kind: 'clan' });
          stubs.push({ key: ck, ks: key(ck), union: q.u.id, x: q.bus - stub, y, dir: 0, targets: [who], side: 'child', kind: 'clan' });
        };
        if (i === 0) clan(p, py);
        if (q.mother) clan(q.mother, node);
        const pl = plates?.get(q.u.id);
        const was = nodes.find((n) => n.union === q.u.id && n.kind === 'union');
        if (!was)
          nodes.push({ kind: 'union', union: q.u.id, key: unionKey(q.u.id), x: q.bus, y: node, open: !pl || pl.open || pl.hidden === 0, count: pl && !pl.open && pl.hidden > 0 ? `+${pl.hidden}` : null, mother: null, owner: q.mother ?? p, from: pl?.from ?? p });
        else if (q.mother) {
          was.x = q.bus;
          was.y = node;
          was.owner = q.mother;
        }
      }
    }
  }
  for (const l of lineOnly) {
    if (nodes.some((n) => n.union === l.u.id)) continue;
    const pl = plates?.get(l.u.id);
    nodes.push({
      kind: 'union', union: l.u.id, key: unionKey(l.u.id), x: Math.round(Math.max(l.fb - gap, X(l.p) + R(l.p) + 4)) + 0.5, y: Y(l.p),
      open: !pl || pl.open || pl.hidden === 0, count: pl && !pl.open && pl.hidden > 0 ? `+${pl.hidden}` : null, mother: null, owner: l.p, from: pl?.from ?? l.p,
    });
  }
  // свёрнутые союзы набора: полый ромб с «+N» — у следа родителя (к детям) или у строки ребёнка (к родителям). Поле ромба
  // и «+N» на одной строке — около 48 px (24 × 24 у ромба и у числа): соседний ромб той же строки — не ближе, правее
  const SHUT_W = 48;
  const shutX = (x0: number, y: number) => {
    let x = x0;
    for (let k = 0; k < 8; k++) {
      const hit = nodes.find((q) => Math.abs(q.y - y) < 1 && Math.abs(q.x - x) < SHUT_W);
      if (!hit) break;
      x = hit.x + SHUT_W;
    }
    return x;
  };
  const order = collapsed
    .map((c) => ({ ...c, at: Math.min(...c.u.kids.map((k) => inp.xOf?.(k) ?? Infinity)) }))
    .sort((a, b) => a.at - b.at);
  for (const { u, plate } of order) {
    const par = [u.a, u.b].find((x) => !!x && S.has(x) && !u.kids.includes(x)) ?? null;
    const kid = u.kids.find((k) => S.has(k)) ?? null;
    if (par && (plate.dir === 'down' || !kid)) {
      const xs = u.kids.map((k) => inp.xOf?.(k) ?? null).filter((v): v is number => v !== null);
      const x = shutX(Math.max(X(par) + R(par) + 6, xs.length ? Math.min(...xs) - gap : X(par) + R(par) + 3 * gap), Y(par));
      nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x: Math.round(x) + 0.5, y: Y(par), open: false, count: `+${plate.hidden}`, mother: null, owner: par, from: plate.from });
    } else if (kid) {
      const x = X(kid) - R(kid) - 1.5 - 2 * gap;
      nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x: Math.round(x) + 0.5, y: Y(kid), open: false, count: `+${plate.hidden}`, mother: null, owner: kid, from: plate.from });
      push({ key: childKey(u.id, kid), kind: 'tooth', style: kidStyle(u), pts: [Math.round(x) + 0.5, Y(kid), X(kid) - R(kid) - 1.5, Y(kid)], ends: [kid], union: u.id, when: 'always' }, new Set([kid]));
    }
  }
  // ленты: через узел своего союза (тройник) — лента выходит из следа родителя у ствола его союза
  for (const u of shown) {
    const n = nodes.find((q) => q.union === u.id);
    if (!n) continue;
    for (const k of u.kids)
      if (S.has(k) && ribbon(u, k))
        for (const par of [u.a, u.b]) {
          if (!par || !steps.has(`${par}>${k}`) || !S.has(par)) continue;
          const pr = Y(par);
          const mr = n.owner !== par && main.has(n.owner) ? Y(n.owner) : pr;
          const adjacent = Math.abs(mr - pr) <= ky + 0.5 && Math.sign(mr - pr) === Math.sign(Y(k) - pr);
          via.set(`${par}>${k}`, { x: n.x, y: adjacent ? n.y : pr, union: u.id });
        }
  }
  clearVia(inp, main, via, paths);
  ribbonPaths(inp, main, via, trails, paths);
  return { layout: 'family', paths, nodes, stubs, via, issues };
}

// ---------- ленты по маршрутам (решение 79; § 3) ----------

/**
 * Маршрут шага ленты «родитель → ребёнок» на масштабе семьи: по следу родителя до ступеньки узла союза, по вертикали
 * к строке ребёнка, горизонтально к его звезде. Точки — x0, y0, … Скругления рисует лента сама.
 */
export function stepRoute(p: { x: number; y: number; r: number }, k: { x: number; y: number; r: number }, x: number): number[] {
  const sx = Math.max(p.x, Math.min(x, k.x - k.r - 1));
  if (Math.abs(k.y - p.y) < 0.5) return [p.x, p.y, k.x, k.y];
  return [p.x, p.y, sx, p.y, sx, k.y, k.x, k.y];
}

/**
 * Ступенька шага ленты не проходит сквозь чужую звезду (Г5): вертикаль маршрута «родитель → ребёнок» в x ступеньки
 * сдвигается в ближайшее свободное место между звёздами концов (сначала влево, к родителю).
 */
function clearVia(inp: LinkInput, main: ReadonlyMap<string, LinkStar>, via: Map<string, { x: number; y: number; union: string }>, paths: readonly LinkPath[] = [], nodes: LinkNode[] = []) {
  if (!inp.lines) return;
  // поиск — в полосе ±REACH от пробного x ступеньки: сетки звёзд, вертикалей и узлов (кадр «всех лиц» — тысячи звёзд)
  const REACH = 48;
  const stars = new Grid<LinkStar>(32);
  let maxR = 0;
  for (const s of inp.stars)
    if (!s.ghost) {
      stars.add(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, s);
      maxR = Math.max(maxR, s.r);
    }
  // союзы со своими линиями: их узел стоит у ствола; узел союза без своих линий — станция ленты, он идёт за её ступенькой
  const drawnU = new Set(paths.filter((p) => p.kind !== 'ribbon' && p.union).map((p) => p.union!));
  const gap = nodeGapOf(inp);
  // вертикали других союзов: лента не идёт по ним ближе 12 px (Г6) — иначе наведение на общий отрезок называло бы не тот шаг
  type V = { x: number; y0: number; y1: number; u: string | null };
  const verts = new Grid<V>(32);
  for (const p of paths)
    if (p.kind !== 'ribbon')
      for (const [x0, y0, x1, y1] of segmentsOf(p))
        if (Math.abs(x1 - x0) < 0.5 && Math.abs(y1 - y0) > 0.5) verts.add(x0, Math.min(y0, y1), x0, Math.max(y0, y1), { x: x0, y0: Math.min(y0, y1), y1: Math.max(y0, y1), u: p.union });
  const nodeGrid = new Grid<LinkNode>(32);
  for (const n of nodes) nodeGrid.add(n.x, n.y, n.x, n.y, n);
  const done = new Set<string>();
  for (const line of ['joseph', 'mary'] as const) {
    const seq = inp.lines[line];
    for (let k = 1; k < seq.length; k++) {
      const pk = `${seq[k - 1]}>${seq[k]}`;
      if (done.has(pk)) continue;
      done.add(pk);
      const P = main.get(seq[k - 1]);
      const K = main.get(seq[k]);
      if (!P || !K || Math.abs(K.y - P.y) < 0.5) continue;
      const v = via.get(pk);
      const x0 = v ? v.x : K.x - K.r - TRUNK_LEAD;
      const lo = Math.min(P.y, K.y);
      const hi = Math.max(P.y, K.y);
      const qx0 = x0 - REACH - maxR - STAR_CLEAR - WIDE_GAP;
      const qx1 = x0 + REACH + maxR + STAR_CLEAR + WIDE_GAP;
      const block = [...stars.query(qx0, lo, qx1, hi)].filter((s) => s.id !== P.id && s.id !== K.id && s.y > lo + 0.5 && s.y < hi - 0.5);
      const own = v?.union ?? null;
      const lanes = [...verts.query(qx0, lo, qx1, hi)].filter((q) => q.u !== own && Math.min(q.y1, hi) - Math.max(q.y0, lo) > 0.5);
      // станция ленты (узел союза без своих линий) не встаёт на узел другого союза того же следа (Г7)
      const sy = v ? v.y : P.y;
      const near = [...nodeGrid.query(qx0, sy - 1, qx1, sy + 1)];
      const station = own && !drawnU.has(own) ? near.find((q) => q.union === own && Math.abs(q.x - x0) < 0.5 && Math.abs(q.y - sy) < 0.5) : undefined;
      const others = station ? near.filter((q) => q !== station && Math.abs(q.y - station.y) < 1) : [];
      const ok = (x: number) =>
        block.every((s) => Math.abs(s.x - x) >= s.r + STAR_CLEAR) && lanes.every((q) => Math.abs(q.x - x) >= WIDE_GAP) && others.every((q) => Math.abs(q.x - x) >= gap);
      if (ok(x0)) continue;
      const left = P.x;
      const right = K.x - K.r - 1;
      let best: number | null = null;
      for (let d = 1; d <= REACH && best === null; d++)
        for (const x of [x0 - d, x0 + d])
          if (x >= left && x <= right && ok(x)) {
            best = x;
            break;
          }
      if (best === null) continue;
      via.set(pk, { x: Math.floor(best) + 0.5, y: sy, union: v?.union ?? '' });
      if (station) station.x = Math.floor(best) + 0.5;
    }
  }
}

/** Пути шагов лент (для попадания, разрывов и переписи): по маршрутам через узлы. */
function ribbonPaths(inp: LinkInput, main: ReadonlyMap<string, LinkStar>, via: ReadonlyMap<string, { x: number; y: number; union: string }>, trails: Trails, paths: LinkPath[]) {
  if (!inp.lines) return;
  const done = new Map<string, LinkPath>();
  for (const line of ['joseph', 'mary'] as const) {
    const seq = inp.lines[line];
    for (let k = 1; k < seq.length; k++) {
      const a = main.get(seq[k - 1]);
      const b = main.get(seq[k]);
      if (!a || !b) continue;
      const pk = `${a.id}>${b.id}`;
      const was = done.get(pk);
      if (was) continue;
      const v = via.get(pk);
      const pts = stepRoute(a, b, v ? v.x : b.x - b.r - TRUNK_LEAD);
      const kk: LinkKey = { kind: 'step', line, child: b.id };
      // начертание шага (Г10): толкование и «только у Луки» — точки (разреженная нить), иное происхождение — штрих
      const style = inp.lines.styles?.get(`${line}>${b.id}`) ?? 'solid';
      const path: LinkPath = { key: kk, ks: key(kk), kind: 'ribbon', style, pts, ends: [a.id, b.id], union: v?.union ?? null, when: 'always', cuts: [], line };
      addCuts(path, trails, new Set([a.id, b.id]), RIBBON_CUT);
      paths.push(path);
      done.set(pk, path);
    }
  }
}

// ---------- проверки грамматики (перепись, тесты) ----------

/** Нарушение правила в кадре: код проверки, ключ связи и пояснение. */
export interface LinkIssue {
  check: 'star' | 'gap' | 'oblique' | 'tooth' | 'trunk' | 'dup';
  ks: string;
  text: string;
}

/**
 * Проверки грамматики по геометрии кадра (Я1, Я2, Я5, Я6): путь ближе r + 5 к чужой звезде; вертикали разных союзов
 * ближе 8 px (12 у черты брака и ленты) при перекрытии по высоте; косые отрезки; зубец вне 5–40 px. Пути — те, что
 * рисуются при when (обычно — 'always' и 'short').
 */
export function checkLinks(f: LinkFrame, stars: readonly LinkStar[], when: readonly PathWhen[] = ['always', 'short']): LinkIssue[] {
  const out: LinkIssue[] = [];
  const grid = new Grid<LinkStar>(32);
  let maxR = 0;
  for (const s of stars) {
    grid.add(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, s);
    maxR = Math.max(maxR, s.r);
  }
  const drawn = f.paths.filter((p) => when.includes(p.when));
  for (const p of drawn) {
    const ends = new Set(p.ends);
    const seen = new Set<string>();
    for (const [x0, y0, x1, y1] of segmentsOf(p)) {
      if (Math.abs(x1 - x0) > 0.5 && Math.abs(y1 - y0) > 0.5 && p.kind !== 'ribbon') out.push({ check: 'oblique', ks: p.ks, text: `${p.kind} ${Math.round(x0)},${Math.round(y0)}–${Math.round(x1)},${Math.round(y1)}` });
      for (const s of grid.query(Math.min(x0, x1) - maxR - STAR_CLEAR, Math.min(y0, y1) - maxR - STAR_CLEAR, Math.max(x0, x1) + maxR + STAR_CLEAR, Math.max(y0, y1) + maxR + STAR_CLEAR)) {
        if (ends.has(s.id) || seen.has(s.id)) continue;
        // лента — только «сквозь» звезду (как у переписи K4): коса лент идёт вплотную к бусинам своей линии
        if (distSeg(s.x, s.y, x0, y0, x1, y1) < s.r + (p.kind === 'ribbon' ? 1 : STAR_CLEAR) - 0.01) {
          seen.add(s.id);
          out.push({ check: 'star', ks: p.ks, text: `${p.kind} у звезды ${s.id}` });
        }
      }
    }
    if (p.kind === 'tooth') {
      const len = Math.abs(p.pts[2] - p.pts[0]);
      // зубец — от ствола до края звезды: длина до её середины — ещё радиус и 1,5 px
      const star = stars.find((s) => s.id === p.ends[p.ends.length - 1] && Math.abs(s.y - p.pts[1]) < 0.5);
      const full = len + (star ? star.r + 1.5 : 0);
      if (full > TOOTH_MAX + 0.6 || full < TRUNK_MIN - 0.6) out.push({ check: 'tooth', ks: p.ks, text: `зубец ${full.toFixed(1)} px` });
    }
  }
  // вертикали разных союзов
  type V = { x: number; y0: number; y1: number; u: string | null; wide: boolean; ks: string };
  const vs: V[] = [];
  for (const p of drawn)
    for (const [x0, y0, x1, y1] of segmentsOf(p))
      if (Math.abs(x1 - x0) < 0.5 && Math.abs(y1 - y0) > 2) vs.push({ x: x0, y0: Math.min(y0, y1), y1: Math.max(y0, y1), u: p.union, wide: p.kind === 'bar' || p.kind === 'ribbon', ks: p.ks });
  vs.sort((a, b) => a.x - b.x);
  const pairs = new Set<string>();
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length && vs[j].x - vs[i].x < WIDE_GAP; j++) {
      const a = vs[i];
      const b = vs[j];
      if (a.u && a.u === b.u) continue;
      if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 0.5) continue;
      const need = a.wide || b.wide ? WIDE_GAP : TRUNK_GAP;
      if (b.x - a.x >= need - 0.01) continue;
      // лента со стволом своего союза — одна дорога (лента идёт по нему к ребёнку линии)
      if (a.u === b.u) continue;
      const pk = [a.u ?? a.ks, b.u ?? b.ks].sort().join('|');
      if (pairs.has(pk)) continue;
      pairs.add(pk);
      out.push({ check: 'gap', ks: `${a.ks} ${b.ks}`, text: `вертикали ${Math.abs(b.x - a.x).toFixed(1)} px` });
    }
  return out;
}

/** Отрезок пересекает прямоугольник (Лянг — Барски). */
function segRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Расстояние от точки до отрезка. */
export function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ---------- попадание по линиям (§ 8) ----------

/** Вид под указателем по старшинству (§ 8): звезда > ◆ > «+N» > зубец > ствол > «‖» > лента > след. */
export const HIT_RANK: Record<PathKind | 'node' | 'count', number> = { node: 1, count: 2, tooth: 3, stub: 3, trunk: 4, clan: 4, jog: 5, bar: 5, ribbon: 6 };

export interface LinkHit {
  key: LinkKey;
  ks: string;
  kind: PathKind | 'node' | 'count';
  /** расстояние от указателя, px */
  d: number;
  /** точка на пути, ближайшая к указателю (px холста) */
  x: number;
  y: number;
  union: string | null;
}

/**
 * Сетка попадания кадра: отрезки путей и узлы в px кадра, для которого строились связи. Строится один раз на кэш
 * связей; запрос — O(клеток у точки) (§ 8: не больше 1 мс на движение указателя). dx, dy запроса — сдвиг неба после
 * построения; shown — какие пути сейчас нарисованы (длинная связь: целиком или обрывками).
 */
export class LinkHits {
  private grid = new Grid<{ p: LinkPath | null; n: LinkNode | null; seg: number }>(24);
  private count = 0;
  constructor(paths: readonly LinkPath[], nodes: readonly LinkNode[]) {
    for (const p of paths)
      segmentsOf(p).forEach(([x0, y0, x1, y1], k) => {
        this.count++;
        this.grid.add(x0 - 2, y0 - 2, x1 + 2, y1 + 2, { p, n: null, seg: k });
      });
    for (const n of nodes) {
      this.count++;
      this.grid.add(n.x - 6, n.y - 6, n.x + 6, n.y + 6, { p: null, n, seg: -1 });
    }
  }
  get size(): number {
    return this.count;
  }
  /**
   * Связи у точки (x, y — px холста) в радиусе r — по одной на ключ, ближайшие первыми (при равных — по старшинству
   * вида). dx, dy — сдвиг неба с построения связей.
   */
  at(x: number, y: number, r: number, dx = 0, dy = 0, shown: (p: LinkPath) => boolean = () => true): LinkHit[] {
    const got = new Map<string, LinkHit>();
    const qx = x - dx;
    const qy = y - dy;
    for (const v of this.grid.query(qx - r - 2, qy - r - 2, qx + r + 2, qy + r + 2)) {
      let h: LinkHit | null = null;
      if (v.n) {
        const d = Math.max(0, Math.hypot(v.n.x - qx, v.n.y - qy) - 3);
        if (d <= r) h = { key: v.n.key, ks: key(v.n.key), kind: 'node', d, x: v.n.x + dx, y: v.n.y + dy, union: v.n.union };
      } else if (v.p) {
        const p = v.p;
        if (!shown(p)) continue;
        const ax = p.pts[v.seg * 2];
        const ay = p.pts[v.seg * 2 + 1];
        const bx = p.pts[v.seg * 2 + 2];
        const by = p.pts[v.seg * 2 + 3];
        const d = distSeg(qx, qy, ax, ay, bx, by);
        if (d <= r) {
          const ex = bx - ax;
          const ey = by - ay;
          const l2 = ex * ex + ey * ey;
          const t = l2 ? Math.max(0, Math.min(1, ((qx - ax) * ex + (qy - ay) * ey) / l2)) : 0;
          h = { key: p.key, ks: p.ks, kind: p.kind, d, x: ax + t * ex + dx, y: ay + t * ey + dy, union: p.union };
        }
      }
      if (!h) continue;
      const was = got.get(h.ks);
      if (!was || h.d < was.d || (h.d === was.d && HIT_RANK[h.kind] < HIT_RANK[was.kind])) got.set(h.ks, h);
    }
    return [...got.values()].sort((a, b) => a.d - b.d || HIT_RANK[a.kind] - HIT_RANK[b.kind]);
  }
  /**
   * Прямоугольник r (px холста) ложится на путь, для которого shown — истина (подписи обходят линии, Я12). dx, dy — сдвиг
   * неба с построения связей.
   */
  crosses(r: { x: number; y: number; w: number; h: number }, dx: number, dy: number, shown: (p: LinkPath) => boolean): boolean {
    const x0 = r.x - dx;
    const y0 = r.y - dy;
    const x1 = x0 + r.w;
    const y1 = y0 + r.h;
    for (const v of this.grid.query(x0, y0, x1, y1)) {
      const p = v.p;
      if (!p || !shown(p)) continue;
      const ax = p.pts[v.seg * 2];
      const ay = p.pts[v.seg * 2 + 1];
      const bx = p.pts[v.seg * 2 + 2];
      const by = p.pts[v.seg * 2 + 3];
      if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
      // отрезки связей — горизонтали и вертикали: пересечение рамок и есть пересечение
      if (Math.abs(ax - bx) < 0.5 || Math.abs(ay - by) < 0.5) return true;
      // косой отрезок (лента на обзоре): по отсечению
      if (segRect(ax, ay, bx, by, x0, y0, x1, y1)) return true;
    }
    return false;
  }
  /** Лучшая связь у точки: узел — раньше линий, если указатель на нём; дальше — по расстоянию и старшинству. */
  best(x: number, y: number, r: number, dx = 0, dy = 0, shown?: (p: LinkPath) => boolean): LinkHit | null {
    const all = this.at(x, y, r, dx, dy, shown);
    if (!all.length) return null;
    const node = all.find((h) => h.kind === 'node' && h.d <= 2);
    if (node) return node;
    const d0 = all[0].d;
    const close = all.filter((h) => h.d <= d0 + 1.5);
    close.sort((a, b) => HIT_RANK[a.kind] - HIT_RANK[b.kind] || a.d - b.d);
    return close[0];
  }
}

// ---------- журнал кадра (canvas[data-links]) ----------

/**
 * Журнал связей кадра для проверок приёмки: пути в окне (вид, начертание, ключ, точки px холста) и узлы. Не больше max
 * путей — самые близкие к середине окна.
 */
export function linkLog(paths: readonly LinkPath[], nodes: readonly LinkNode[], view: { l: number; t: number; r: number; b: number }, dx: number, dy: number, max = 600): string {
  const inView = (xs: number[]) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < xs.length; k += 2) {
      x0 = Math.min(x0, xs[k] + dx);
      x1 = Math.max(x1, xs[k] + dx);
      y0 = Math.min(y0, xs[k + 1] + dy);
      y1 = Math.max(y1, xs[k + 1] + dy);
    }
    return x1 >= view.l && x0 <= view.r && y1 >= view.t && y0 <= view.b;
  };
  const out: string[] = [];
  for (const p of paths) {
    if (!inView(p.pts) || out.length >= max) continue;
    out.push(`${p.kind}|${p.style}|${p.ks}|${p.pts.map((v, k) => Math.round(v + (k % 2 ? dy : dx))).join(',')}`);
  }
  for (const n of nodes) {
    if (!inView([n.x, n.y]) || out.length >= max + 200) continue;
    out.push(`${n.kind === 'union' ? 'node' : 'join'}|${n.open ? 'open' : 'shut'}|${key(n.key)}|${Math.round(n.x + dx)},${Math.round(n.y + dy)}${n.count ? `|${n.count}` : ''}`);
  }
  return out.join(';');
}

/** Разбор журнала data-links (для сценариев приёмки): пути и узлы. */
export function parseLinkLog(s: string): { kind: string; style: string; ks: string; pts: number[] }[] {
  return (s || '')
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [kind, style, ks, pts] = q.split('|');
      return { kind, style, ks, pts: (pts ?? '').split(',').map(Number) };
    });
}

// ---------- помета порядка рождения (Г9; DG 2.3.6) ----------

/**
 * Место, где Писание называет детей союза по порядку (Г9; DG 2.3.6): стихи, где названы дети именно этого союза (а не все
 * дети отца и не первая ссылка ребёнка), и дети, которых это место называет и чей год оценён по порядку перечисления.
 * null — у союза нет детей с годом «по порядку» или места нет.
 */
export function familyOrderListing(unionId: string, m: ModelData = models[0]): (OrderListing & { byOrder: string[] }) | null {
  const u = ALL_UNIONS.byId.get(unionId);
  if (!u) return null;
  const birth = (k: string) => m.chrono.get(k)?.b ?? Infinity;
  const kids = u.kids
    .filter((k) => {
      const q = byId.get(k);
      return !!q && q.kind !== 'people' && q.kind !== 'clan';
    })
    .sort((a, b) => birth(a) - birth(b) || (byId.get(a)?.order ?? 999) - (byId.get(b)?.order ?? 999));
  const byOrder = kids.filter((k) => m.chrono.get(k)?.byOrder);
  if (!byOrder.length) return null;
  const got = listingOf(kids) ?? listingOf(byOrder);
  if (!got) return null;
  const ids = got.ids.filter((k) => byOrder.includes(k));
  return ids.length ? { ...got, byOrder: ids } : null;
}

/**
 * Текст пометы порядка для карточки союза и строки «Год» (стык 5): «по порядку перечисления, Быт 4:19–22, выв.».
 * Первое слово — со строчной: карточка ставит перед ним своё («Годы детей — …»). null — пометы нет.
 */
export function familyOrderNote(unionId: string, m: ModelData = models[0]): string | null {
  const l = familyOrderListing(unionId, m);
  return l ? `по порядку перечисления, ${l.text}, выв.` : null;
}

/**
 * Помета порядка у лица (строка «Год» карточки у звезды): место, где он назван по порядку среди детей своего союза.
 * null — год лица оценён не по порядку.
 */
export function personOrderNote(id: string, m: ModelData = models[0]): string | null {
  const u = mainUnion(ALL_UNIONS, id);
  const l = u ? familyOrderListing(u.id, m) : null;
  if (l) return l.byOrder.includes(id) ? `по порядку перечисления, ${l.text}, выв.` : null;
  // в союзе перечня нет (Амнон — единственный сын Ахиноамы): порядок — среди всех детей отца, 1 Пар 3:1–9 (orderListing);
  // перечень союза есть, но лица не называет (младенец Давида и Вирсавии) — пометы нет (DG 2.3.6)
  const o = m.chrono.get(id)?.byOrder ? orderListing(id, m) : null;
  return o ? `по порядку перечисления, ${o.text}, выв.` : null;
}
