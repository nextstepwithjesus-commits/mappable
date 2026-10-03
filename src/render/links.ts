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
import { byId, graph, models, type ModelData } from '../data/atlas.ts';
import type { MarriageKind } from '../engine/stays.ts';
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
/**
 * Чужая звезда у дальнего хода длинной связи (рисуется раскрытым — при выборе, наведении и когда оба конца в окне; G8):
 * штраф выбора x ствола — меньше, чем у звезды на ближней части (1000), остальное обходит ступенька дальнего хода.
 */
export const FULL_STAR = 300;
/**
 * Масштаб в движении (перелёт, колесо, щипок; С1): кадр связей не строится заново, а пересчитывается из точной сборки,
 * пока масштаб не дальше стольких раз от неё; дальше маршруты в px растянулись бы (ствол «за 9 px до ребёнка» — за
 * 200 px), и связи не рисуются, пока масштаб не постоит (тогда кадр строится заново).
 */
export const LINK_MOTION_SPAN = 2;
export const linkMotionNear = (kx: number, ky: number, kx0: number, ky0: number) =>
  kx / kx0 < LINK_MOTION_SPAN && kx0 / kx < LINK_MOTION_SPAN && ky / ky0 < LINK_MOTION_SPAN && ky0 / ky < LINK_MOTION_SPAN;
/**
 * Окно кадра связей (С1): связи строятся по звёздам видимой части неба и ещё по ширине окна с каждой стороны (а не по
 * всему небу: на масштабе лица в окне ±1 — около 5 % звёзд). Ствол и зубцы связи — у рождения детей, обрывки длинных
 * связей — по вертикали той же поры, поэтому всё, что видно в окне, строится по звёздам этой полосы.
 */
export const LINK_MARGIN = 1;
/** Окно кадра связей включено; перепись (tools/census.ts) меряет кадр по всему небу и его выключает. */
export const linkWindow = { on: true };
/** Полоса времени кадра связей в координатах неба (x мира): окно и LINK_MARGIN окна с каждой стороны; null — всё небо. */
export function linkSpan(cam: { x0: number; kx: number; w: number }): { x0: number; x1: number } | null {
  if (!linkWindow.on) return null;
  const w = cam.w / cam.kx;
  return { x0: cam.x0 - LINK_MARGIN * w, x1: cam.x0 + (1 + LINK_MARGIN) * w };
}
/**
 * Кадр связей, собранный по полосе span, ещё годен для окна cam: до края полосы с обеих сторон — не меньше половины
 * запаса (иначе при сдвиге неба кадр строится заново).
 */
export function linkSpanOk(span: { x0: number; x1: number }, cam: { x0: number; kx: number; w: number }, view: { w: number } = cam): boolean {
  const w = cam.w / cam.kx;
  // запас — от ширины окна неба (view): у камеры кэша сдвига (sky.ts, renderPan) холст шире окна
  const slack = (LINK_MARGIN / 2) * (view.w / cam.kx);
  return cam.x0 - slack >= span.x0 - 1e-6 && cam.x0 + w + slack <= span.x1 + 1e-6;
}
/**
 * Лица вне полосы кадра, без которых связи лиц полосы не построить: родители (у потомков «рода» — предок за сотни лет:
 * обрывок у ребёнка «→ Рувим, 12 П»), дети (обрывок такой связи у предка) и супруги (черта брака, ромб бездетного брака).
 */
export function linkKinOf(ids: Iterable<string>, U: Pick<Unions, 'of' | 'origin'>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    for (const u of U.origin.get(id) ?? []) for (const p of [u.a, u.b]) if (p) out.add(p);
    for (const u of U.of.get(id) ?? []) {
      for (const p of [u.a, u.b]) if (p && p !== id) out.add(p);
      for (const k of u.kids) out.add(k);
    }
  }
  return out;
}
/** Совместных перестановок соседей по шине на кадр связей (второй проход buildLinks, решение 134). */
export const JOINT_MAX = 12;
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
  /** ломаная следа с переходами «Отчего дома» (этап 15) и год, с которого след живой — в раскладке этапа 14 их нет */
  path?: number[];
  from?: number;
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
  lines: {
    joseph: readonly string[];
    mary: readonly string[];
    styles?: ReadonlyMap<string, PathStyle>;
    /** «линия>лицо» → сколько лиц линии перед ним скрыто показом: шаг к нему — «цепочка» span (этап 13, К4) */
    gaps?: ReadonlyMap<string, number>;
  } | null;
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
  /** переключатель «Лк 3 как второе родословие Иосифа» (решение 107; otherReading) */
  flip?: boolean;
  /** входы грамматики этапа 15 (уровень подробности, x года, годы черт брака) — грамматика этапа 14 их не читает */
  tier?: 0 | 1 | 2;
  xAt?: (t: number) => number;
  model?: unknown;
}

// ---------- выход ----------

export type PathKind = 'trunk' | 'tooth' | 'bar' | 'jog' | 'clan' | 'stub' | 'ribbon';
/**
 * Начертание пути по словарю (этап 13, решение 94): solid — Писание или вывод; dash — иное происхождение; dots — только
 * толкование; faint — бледная сплошная: родовая черта народа (Г12), у которого нет следа.
 */
export type PathStyle = 'solid' | 'dash' | 'dots' | 'faint';
/** Родовая черта (Г12): у лица — сплошная (продлённый след или черта в межстрочье), у народа и рода — бледная сплошная. */
const clanStyle = (id: string): PathStyle => {
  const q = byId.get(id);
  return q && (q.kind === 'people' || q.kind === 'clan') ? 'faint' : 'solid';
};
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
  /** у «цепочки» (ключ span): сколько лиц линии между концами скрыто показом (этап 13, К4) */
  gap?: number;
  /**
   * пересечения с линиями других союзов (этап 14, решение 134: пересечение — не соединение): четвёрки «номер отрезка,
   * доля длины отрезка (0…1), полуширина разрыва px, номер другого пути в кадре». Разрыв даёт нижний по ярусу (trails.ts,
   * drawLinks); при равных ярусах — горизонталь, как след под вертикалью (Г7)
   */
  xcuts?: number[];
  /** дальний ход ('full') проходит ближе r + 5 к чужой звезде: целиком — только у раскрытого (выбор, наведение), не по окну */
  blocked?: boolean;
  /** номер пути в сборке кадра (buildLinks): у копий, пересчитанных движением масштаба, тот же (С1) */
  n?: number;
  /** вид союза у черты брака (этап 15, решение 174) — в грамматике этапа 14 (решение 190) не задаётся */
  bar?: MarriageKind;
  /** бездетный брак (этап 15) — в грамматике этапа 14 не задаётся */
  childless?: boolean;
}

/** Начертание ромба по виду союза (этап 15, решение 174); в грамматике этапа 14 (решение 190) узлы его не несут. */
export type NodeLook = MarriageKind | 'no-mother' | 'no-father';

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
  /**
   * имя у ромба бездетного брака (этап 13, К6) — после подписей звёзд: имя второго супруга связывает ромб с ним, но не
   * отнимает места у имён звёзд (trails.ts, drawLinkLabels)
   */
  late?: boolean;
  /** лицо, на чьём следе узел */
  owner: string;
  /** начертание ромба (этап 15) — в грамматике этапа 14 не задаётся */
  look?: NodeLook;
  childless?: boolean;
  /** лицо, от которого союз показан (карточка союза, раскрытие) */
  from: string;
  /** узел ушёл со следа владельца на столько px по своему стволу (с ленты, решение 166); след — на y − off */
  off?: number;
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
  /**
   * вид обрывка: длинная связь, родовая черта, дочь у мужа в семейной укладке, длинная черта брака (этап 14, решение 134:
   * узел союза — на следе матери у детей, мужу — черта брака; длиннее 8 строк — обрывками «муж — Халев, 24 П»)
   */
  kind: 'long' | 'clan' | 'kid' | 'spouse';
  /** номер обрывка в сборке кадра (как LinkPath.n) */
  n?: number;
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
  /**
   * знак сборки: копии кадра, пересчитанные движением масштаба (sky.ts, rescaleLinks — `{ ...f }`), делят его с точной
   * сборкой, и пути у них — в том же порядке. По нему ярусы связей держатся от кадра к кадру в движении (trails.ts, С1)
   */
  stamp?: object;
}

const EMPTY: LinkFrame = { layout: 'map', paths: [], nodes: [], stubs: [], via: new Map(), issues: [] };

// ---------- общее ----------

/** Союз происхождения лица, который рисует небо: кровные отец и мать (у законного отца — тот же союз с пометой). */
export function mainUnion(U: Unions, id: string): Union | null {
  const u = U.origin.get(id)?.[0];
  return u && !u.id.includes('~') ? u : null;
}

/**
 * Два прочтения Лк 3:23 (решение 107): «Илий — отец Марии» (толкование; лента Марии) и «Илий — отец Иосифа по Луке»
 * (otherParents Иосифа, claim 'by-luke'). Небо рисует одно — выбранное переключателем «Лк 3 как второе родословие
 * Иосифа» (ribbons.ts: Мария в линии Луки заменяется Иосифом): союз другого прочтения не рисуется, как и путь родства
 * не идёт через оба сразу (kinship.ts).
 */
const LK323 = { parent: 'iliy-otets-marii', mary: 'mariya', joseph: 'iosif-muzh-marii' } as const;
export function otherReading(u: Union, flip: boolean): boolean {
  if (u.a !== LK323.parent && u.b !== LK323.parent) return false;
  return flip ? u.kids.includes(LK323.mary) && !u.claim : u.kids.includes(LK323.joseph) && u.claim === 'by-luke';
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
  private rows: { y: number; x0: number; x1: number; i: number; id: string; sy: number }[] = [];
  constructor(stars: readonly LinkStar[]) {
    // строка следа — там, где его рисует trails.ts (trailOf: середина пикселя), а не середина звезды: иначе вертикаль,
    // кончающаяся у строки, на полпикселя проходит сквозь нарисованный след без разрыва (этап 12, перепись Я8)
    for (const s of stars) if (s.x1 !== null && s.x1 > s.x + s.r + 1) this.rows.push({ y: Math.round(s.y) + 0.5, x0: s.x, x1: s.x1, i: s.i, id: s.id, sy: s.y });
    this.rows.sort((a, b) => a.y - b.y);
  }
  /** Чужой живой след на строке y (середина звезды) у x: узел союза на нём читался бы узлом этого следа (Г7). */
  foreignAt(x: number, y: number, skip: string): boolean {
    for (const t of this.rows) if (t.id !== skip && Math.abs(t.sy - y) < 0.75 && x > t.x0 - 0.5 && x < t.x1 + 0.5) return true;
    return false;
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
  if (inp.layout === 'map') nestBuses(f, inp.stars);
  linkCrossings(f.paths);
  markBlocked(f.paths, inp.stars);
  offRibbonNodes(f, inp);
  f.stamp = {};
  f.paths.forEach((q, i) => (q.n = i));
  f.stubs.forEach((st, i) => (st.n = i));
  return f;
}

/**
 * Шина гнёзд одного союза (решение 172, R1-14): у союза, чьи дети висят на нескольких стволах (ромб ◆ и узлы • дальше
 * по тому же следу), участок следа от ◆ до последнего • рисуется линией союза — гнёзда читаются одним союзом, а не
 * «четырьмя матерями». Путь вида 'jog' по строке следа, начертанием ствола союза.
 */
function nestBuses(f: LinkFrame, stars: readonly LinkStar[]) {
  const first = new Map<string, LinkNode>();
  const last = new Map<string, number>();
  for (const n of f.nodes) if (n.kind === 'union') first.set(n.union, n);
  for (const n of f.nodes) {
    if (n.kind !== 'join') continue;
    const u = first.get(n.union);
    if (!u || Math.abs(u.y - n.y) > 0.75 || n.x <= u.x) continue;
    last.set(n.union, Math.max(last.get(n.union) ?? -Infinity, n.x));
  }
  const star = new Map<string, LinkStar>();
  for (const s of stars) if (!s.ghost) star.set(s.id, s);
  const clans = new Set(f.paths.filter((q) => q.kind === 'clan').map((q) => q.union));
  for (const [union, x1] of last) {
    const u = first.get(union)!;
    // шина — только по живому следу владельца (у рода, чьи узлы уходят за конец следа, её нет) и без чужих ромбов на ней
    const o = star.get(u.owner);
    if (!o || clans.has(union) || x1 > (o.x1 ?? o.x) - 1) continue;
    if (f.nodes.some((n) => n.union !== union && Math.abs(n.y - u.y) < 0.75 && n.x > u.x - 1 && n.x < x1 + 1)) continue;
    // и не по участку следа, где идёт маршрут ленты (решение 79: там связь — лента)
    if ([...f.via].some(([pk, vv]) => pk.startsWith(`${u.owner}>`) && vv.x > u.x - 1)) continue;
    const trunk = f.paths.find((q) => q.union === union && q.kind === 'trunk');
    const ends = [...new Set(f.paths.filter((q) => q.union === union && q.kind !== 'ribbon').flatMap((q) => q.ends))];
    f.paths.push({ key: unionKey(union), ks: key(unionKey(union)), kind: 'jog', style: trunk?.style ?? 'solid', pts: [u.x, u.y, x1, u.y], ends, union, when: 'always', cuts: [] });
  }
}

/** Зазор ромба чужого союза от ленты на следе родителя: размах косы, полуширина нити и радиус ромба (решение 166). */
const RIBBON_NODE_OFF = 3 + 1.5 + 1.5;

/**
 * Ромбы союзов не из ленты не стоят на ленте (решение 166, R1-11: лента Давида шла через ромбы Авигеи, Ахиноамы,
 * Маахи — будто линия идёт через эти союзы). Шаг ленты идёт по следу родителя от его звезды до узла своего союза
 * (via, stepRoute); узел другого союза на этом участке следа уходит со следа по своему стволу или черте брака — к
 * детям, «на отвод» — на радиус ромба и зазор от нити. Ствол короче — узел остаётся.
 */
function offRibbonNodes(f: LinkFrame, inp: LinkInput) {
  if (!inp.lines || !f.via.size) return;
  const R = inp.nodeR ?? (inp.layout === 'family' ? NODE_R_FAMILY : NODE_R_MAP);
  const off = R + RIBBON_NODE_OFF;
  const star = new Map<string, LinkStar>();
  for (const s of inp.stars) if (!s.ghost) star.set(s.id, s);
  // участки следов с лентой: лицо → [x от, x до, союз шага]
  const spans = new Map<string, [number, number, string][]>();
  for (const [pk, vv] of f.via) {
    const par = pk.slice(0, pk.indexOf('>'));
    const P = star.get(par);
    if (!P || vv.x <= P.x) continue;
    (spans.get(par) ?? spans.set(par, []).get(par)!).push([P.x, vv.x, vv.union]);
  }
  if (!spans.size) return;
  for (const n of f.nodes) {
    const sp = spans.get(n.owner);
    const P = star.get(n.owner);
    if (!sp || !P || Math.abs(n.y - P.y) > 0.75) continue;
    if (!sp.some(([a, b, u]) => u !== n.union && n.x > a + P.r && n.x < b + R + 2)) continue;
    // ствол или черта брака этого союза из точки узла: куда и на сколько он уходит со следа
    let dir = 0;
    let reach = 0;
    for (const q of f.paths) {
      if (q.union !== n.union || q.kind === 'ribbon' || q.kind === 'tooth') continue;
      for (let k = 0; k + 3 < q.pts.length; k += 2) {
        const [ax, ay, bx, by] = [q.pts[k], q.pts[k + 1], q.pts[k + 2], q.pts[k + 3]];
        if (Math.abs(ax - bx) > 0.5 || Math.abs(ax - n.x) > 0.5) continue;
        for (const [y0, y1] of [
          [ay, by],
          [by, ay],
        ])
          if (Math.abs(y0 - n.y) < 0.75 && Math.abs(y1 - n.y) > reach) {
            reach = Math.abs(y1 - n.y);
            dir = Math.sign(y1 - n.y);
          }
      }
    }
    if (!dir || reach < off + 3) continue;
    n.y += dir * off;
    n.off = dir * off;
  }
}

/**
 * Дальние ходы ('full'), задевающие чужие звёзды (ближе r + 5): такой ход окно не раскрывает (решение 136 — длинная
 * связь целиком, когда оба конца в окне, — только если она ясна; иначе обрывки с именем), его раскрывает только выбор.
 */
function markBlocked(paths: LinkPath[], stars: readonly LinkStar[]) {
  const grid = new Grid<LinkStar>(32);
  let maxR = 0;
  for (const s of stars)
    if (!s.ghost) {
      grid.add(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, s);
      maxR = Math.max(maxR, s.r);
    }
  for (const q of paths) {
    if (q.when !== 'full' || q.kind === 'ribbon') continue;
    const ends = new Set(q.ends);
    q.blocked = segmentsOf(q).some(([x0, y0, x1, y1]) => {
      for (const s of grid.query(Math.min(x0, x1) - maxR - STAR_CLEAR, Math.min(y0, y1) - maxR - STAR_CLEAR, Math.max(x0, x1) + maxR + STAR_CLEAR, Math.max(y0, y1) + maxR + STAR_CLEAR))
        if (!ends.has(s.id) && distSeg(s.x, s.y, x0, y0, x1, y1) < s.r + STAR_CLEAR - 0.01) return true;
      return false;
    });
  }
}

/** Полуширина разрыва линии под чужой вертикалью: 3 px, под чертой брака «‖» — и ещё половина её ширины. */
const XCUT = TRAIL_CUT;

/**
 * Пересечения линий разных союзов (решение 134): вертикаль одного пути × горизонталь другого внутри обоих отрезков (у
 * концов — 2 px допуска, как у переписи). Записываются в оба пути (LinkPath.xcuts); какой из них прервётся, решает
 * отрисовка по ярусам. Расчёт — один раз на кадр связей, по сетке горизонталей.
 */
export function linkCrossings(paths: LinkPath[]) {
  const H = new Grid<{ p: number; k: number }>(32);
  paths.forEach((q, i) => {
    q.xcuts = undefined;
    if (q.kind === 'ribbon') return;
    segmentsOf(q).forEach(([x0, y0, x1, y1], k) => {
      if (Math.abs(y1 - y0) < 0.5 && Math.abs(x1 - x0) > 4) H.add(Math.min(x0, x1), y0, Math.max(x0, x1), y0, { p: i, k });
    });
  });
  paths.forEach((q, i) => {
    if (q.kind === 'ribbon') return;
    segmentsOf(q).forEach(([x0, y0, x1, y1], k) => {
      if (Math.abs(x1 - x0) > 0.5 || Math.abs(y1 - y0) < 4) return;
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);
      for (const h of H.query(x0, lo, x0, hi)) {
        const o = paths[h.p];
        if (h.p === i || (o.union && o.union === q.union)) continue;
        const ax = o.pts[2 * h.k];
        const bx = o.pts[2 * h.k + 2];
        const y = o.pts[2 * h.k + 1];
        if (y <= lo + 2 || y >= hi - 2 || x0 <= Math.min(ax, bx) + 2 || x0 >= Math.max(ax, bx) - 2) continue;
        (q.xcuts ??= []).push(k, (y - y0) / (y1 - y0), XCUT, h.p);
        (o.xcuts ??= []).push(h.k, (x0 - ax) / (bx - ax), XCUT + (q.kind === 'bar' ? BAR_HALF : 0), i);
      }
    });
  });
}
/** Половина ширины черты брака «‖» (trails.ts, BAR_GAP 3,2 и толщина линии). */
const BAR_HALF = 2.1;

// ---------- общая раскладка («все лица») ----------

/**
 * Ступенька дальнего хода (G8): y — межстрочье последней ступеньки (дети за ней висят на x2); mid — средний столбец
 * двойной ступеньки (от y1 до y — по столбцу mid), если прямой и одной ступеньки не хватило.
 */
interface Jog {
  y: number;
  x2: number;
  mid?: { x: number; y1: number };
}

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
  /** черта брака длиннее 8 строк через живые чужие следы: на «всех лицах» — обрывками (решение 134) */
  longBar?: boolean;
  /**
   * дальний ход длинной связи со ступенькой (G8): прямой ход задевал бы чужие звёзды — по стволу до межстрочья y, по нему
   * до x2 и дальше вверх или вниз к дальним детям; по направлению (−1 — вверх, 1 — вниз)
   */
  jog?: Map<number, Jog>;
  x: number;
  far: Set<string>;
  sameUnion: number;
  /** желаемый x ствола: у рождения первого ребёнка, а у нескольких союзов одного следа — с шагом узлов (Г7) */
  pref?: number;
}

/** Дети союза, разобранные по гнёздам (стволам), до постановки. */
interface Grouped {
  u: Union;
  p: LinkStar;
  o: LinkStar | null;
  rib: Set<string>;
  groups: LinkStar[][];
}

/** Окно x ствола гнезда до постановки: от «дальний ребёнок − TOOTH_MAX» (и «первый − TRUNK_MAX») до «первый − TRUNK_MIN». */
const windowOf = (g: readonly LinkStar[], rib: ReadonlySet<string>): [number, number] => {
  const first = g[0];
  const maxTooth = Math.max(first.x, ...g.filter((k) => !rib.has(k.id)).map((k) => k.x));
  return [Math.max(first.x - TRUNK_MAX, maxTooth - TOOTH_MAX), first.x - TRUNK_MIN];
};

/**
 * Шина многожёнца (этап 14, решение 134, G2): у двух союзов одного родителя гнёзда с первыми детьми почти у одного x и
 * общими строками, а окна их стволов не вмещают двух вертикалей с шагом WIDE_GAP — развести их нельзя, и ромб одного
 * ложится на черту другого (Халев: Ефа и Мааха на 60 годах). Тогда дальний ребёнок одного из гнёзд, чьё окно от этого
 * шире, переходит в следующее гнездо своего союза (или в новое, с узлом • на том же следе). Не больше четырёх шагов на пару.
 */
function splitCrowded(grouped: Grouped[]) {
  const byP = new Map<string, Grouped[]>();
  for (const q of grouped) byP.set(q.p.id, [...(byP.get(q.p.id) ?? []), q]);
  const spanOf = (q: Grouped, g: readonly LinkStar[]) => {
    const ys = [q.p.y, ...(q.o ? [q.o.y] : []), ...g.map((k) => k.y)];
    return [Math.min(...ys), Math.max(...ys)];
  };
  /** наибольший шаг двух вертикалей в окнах пары */
  const room = (a: [number, number], b: [number, number]) => Math.max(a[1] - b[0], b[1] - a[0]);
  /** гнездо без дальнего ребёнка: ребёнок — в следующее гнездо своего союза, если оно его принимает, иначе в новое */
  const split = (q: Grouped, i: number) => {
    const g = q.groups[i];
    const k = g.pop()!;
    const next = q.groups[i + 1];
    if (next && Math.max(...next.map((m) => m.x)) - (k.x - leadOf(k)) <= TOOTH_MAX) next.unshift(k);
    else q.groups.splice(i + 1, 0, [k]);
  };
  const canSplit = (q: Grouped, i: number) => q.groups[i].length >= 2 && !q.rib.has(q.groups[i][q.groups[i].length - 1].id);
  const without = (q: Grouped, i: number) => windowOf(q.groups[i].slice(0, -1), q.rib);
  for (const qs of byP.values()) {
    if (qs.length < 2) continue;
    for (let a = 0; a < qs.length; a++)
      for (let b = a + 1; b < qs.length; b++) {
        const A = qs[a];
        const B = qs[b];
        for (let ia = 0; ia < A.groups.length; ia++)
          for (let ib = 0; ib < B.groups.length; ib++)
            for (let step = 0; step < 4; step++) {
              const ga = A.groups[ia];
              const gb = B.groups[ib];
              if (Math.abs(ga[0].x - gb[0].x) >= WIDE_GAP) break;
              const [sa, sb] = [spanOf(A, ga), spanOf(B, gb)];
              if (Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) <= 1) break;
              const [wa, wb] = [windowOf(ga, A.rib), windowOf(gb, B.rib)];
              if (room(wa, wb) >= WIDE_GAP) break;
              const ra = canSplit(A, ia) ? room(without(A, ia), wb) : -Infinity;
              const rb = canSplit(B, ib) ? room(wa, without(B, ib)) : -Infinity;
              if (ra === -Infinity && rb === -Infinity) break;
              if (ra >= rb) split(A, ia);
              else split(B, ib);
            }
      }
  }
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
    if (!u || otherReading(u, !!inp.flip)) continue;
    const g = byUnion.get(u.id);
    if (g) g.kids.push(s);
    else byUnion.set(u.id, { u, kids: [s] });
  }
  // союзы с детьми на каждого родителя (подпись матери у ромба — только при двух и больше, Г8)
  const unionsOf = new Map<string, number>();
  for (const { u } of byUnion.values()) for (const p of [u.a, u.b]) if (p) unionsOf.set(p, (unionsOf.get(p) ?? 0) + 1);

  const nests: Nest[] = [];
  const grouped: Grouped[] = [];
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
    grouped.push({ u, p, o, rib, groups });
  }
  splitCrowded(grouped);
  for (const { u, p, o, rib, groups } of grouped)
    groups.forEach((g, n) => nests.push({ u, p, o, kids: g, rib, first: n === 0, motherNode: false, linked: false, x: g[0].x - leadOf(g[0]), far: new Set(), sameUnion: n }));

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
    // жена-спутница мужа: общая раскладка ставит её у внутреннего края группы её детей (решение 95) — узел на её следе
    // при любом удалении от мужа; черта брака идёт к нему через строки внутренних групп, пока они пусты
    const sat = o.sat === n.p.id;
    const qualifies = (dOP <= SPOUSE_ROWS * ky || sat) && Math.abs(near.y - o.y) <= MOTHER_ROWS * ky + 1 && Math.sign(o.y - n.p.y) === side && reaches(o, xs);
    // этап 14 (решение 134, G1): ствол союза проходит через след второго родителя — это соединение, а не пересечение:
    // узел встаёт на это пересечение (у детей), мужу — черта брака; след мужа до узла не доходит — узел на его строке,
    // от узла к ней — черта брака. Прежде её след резался разрывом, как чужой
    const os = Math.sign(o.y - n.p.y);
    const through = !qualifies && dOP > 0.5 && reaches(o, xs) && ks.some((k) => Math.sign(k.y - n.p.y) === os && Math.abs(k.y - n.p.y) > dOP + 0.5);
    const mother = qualifies || (through && reaches(n.p, xs));
    // черта брака: от мужа к ромбу на следе жены — или от жены к ромбу на следе мужа, если она стоит рядом
    const linked = through || (qualifies ? reaches(n.p, xs) : dOP <= SPOUSE_ROWS * ky && reaches(o, xs));
    // следующие гнёзда: узел • на следе матери, если она связана с союзом (узел или черта у первого гнезда) — или если их
    // ствол сам проходит через её след (Вениамин ниже Рахили: ствол к нему резал её след)
    const throughM = (m: Nest, xm: number) => reaches(o, xm) && m.kids.some((k) => !m.rib.has(k.id) && Math.sign(k.y - n.p.y) === os && Math.abs(k.y - n.p.y) > dOP + 0.5);
    // и наоборот: гнездо на следе матери, чьи дети по ту сторону отца, — узел • на следе отца (ствол Шеломифа от Маахи
    // резал след Ровоама)
    const beyondP = (m: Nest) => m.kids.some((k) => !m.rib.has(k.id) && Math.sign(k.y - n.p.y) === -os && Math.abs(k.y - n.p.y) > 0.5);
    for (const m of ns) {
      const xm = m.kids[0].x - leadOf(m.kids[0]);
      m.motherNode = (mother && (m === n || reaches(o, xm))) || (m !== n && (mother || linked) && dOP > 0.5 && throughM(m, xm));
      if (m !== n && m.motherNode && dOP > 0.5 && reaches(n.p, xm) && beyondP(m)) m.motherNode = false;
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
  // full — дальний ход длинной связи (рисуется только раскрытым: выбор, наведение): близость к нему дешевле (G8)
  type Vert = { x: number; y0: number; y1: number; u: string; wide: boolean; full: boolean; dead?: boolean };
  const verts = new Grid<Vert>(24);
  // реестр зубцов кадра: горизонтали x0…x1 на высоте y, союз
  type Tooth = { x0: number; x1: number; y: number; u: string; dead?: boolean };
  const teeth = new Grid<Tooth>(24);
  // реестр узлов кадра: два ромба разных союзов на одном следе ближе ширины знака с подложкой — один знак на вид (Г7)
  type NodeAt = { x: number; y: number; u: string; dead?: boolean };
  const nodeAt = new Grid<NodeAt>(24);
  const nodeGap = nodeGapOf(inp);

  const owner = (n: Nest) => (n.motherNode ? n.o! : n.p);
  // порядок: сначала гнёзда лент (коридор), затем по времени. Гнёзда одного отца, чьи стволы стоят в одном окне по
  // времени (шина многожёнца: Халев, Мааха и Ефа), — от длинной вертикали к короткой: внешняя черта брака встаёт первой,
  // а узлы внутренних союзов — сбоку от неё, а не под ней (решение 134, G2)
  const extent = (n: Nest) => {
    const ys = [owner(n).y, ...n.kids.map((k) => k.y), ...(n.linked ? [(n.motherNode ? n.p : n.o!).y] : [])];
    return Math.max(...ys) - Math.min(...ys);
  };
  const cluster = new Map<Nest, number>();
  {
    const byP = new Map<string, Nest[]>();
    for (const n of nests) (byP.get(n.p.id) ?? byP.set(n.p.id, []).get(n.p.id)!).push(n);
    for (const ns of byP.values()) {
      ns.sort((a, b) => a.kids[0].x - b.kids[0].x);
      let start = -Infinity;
      let last = -Infinity;
      for (const n of ns) {
        if (n.kids[0].x - last > TRUNK_MAX) start = n.kids[0].x;
        last = n.kids[0].x;
        cluster.set(n, start);
      }
    }
  }
  const order = [...nests].sort((a, b) => {
    const ra = a.kids.some((k) => a.rib.has(k.id)) ? 0 : 1;
    const rb = b.kids.some((k) => b.rib.has(k.id)) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const ca = cluster.get(a)!;
    const cb = cluster.get(b)!;
    if (a.p === b.p && ca === cb) return extent(b) - extent(a) || a.kids[0].x - b.kids[0].x;
    return Math.min(ca, a.kids[0].x) - Math.min(cb, b.kids[0].x) || a.kids[0].x - b.kids[0].x || a.kids[0].y - b.kids[0].y;
  });

  /** Строки, которые проходит вертикаль гнезда: узел, связанный второй родитель, дети без лент и с лентами. */
  const spanOf = (n: Nest, kids: readonly LinkStar[]) => {
    const own = owner(n);
    const ys = [own.y, ...kids.map((k) => k.y)];
    if (n.linked) ys.push((n.motherNode ? n.p : n.o!).y);
    return [Math.min(...ys), Math.max(...ys)] as const;
  };
  const members = (n: Nest) => new Set([n.p.id, ...(n.o ? [n.o.id] : []), ...n.kids.map((k) => k.id)]);
  /** Пределы ствола гнезда: не левее узла на следе (звезда владельца и второго родителя), не правее рождения − 5. */
  /** Правый предел ствола: рождение первого ребёнка − 5, а у узла на следе матери — и не дальше конца её следа. */
  const hiOf = (n: Nest): number => {
    const own = owner(n);
    const hi = n.kids[0].x - TRUNK_MIN;
    return n.motherNode && own.x1 !== null ? Math.min(hi, own.x1 - 0.5) : hi;
  };
  const boundsOf = (n: Nest): [number, number] => {
    const own = owner(n);
    const other = n.linked ? (n.motherNode ? n.p : n.o) : null;
    const firstX = n.kids[0].x;
    let lo = Math.max(firstX - TRUNK_MAX, own.x + own.r + 3);
    if (other) lo = Math.max(lo, other.x + other.r + 3);
    const maxTooth = Math.max(...n.kids.filter((k) => !n.rib.has(k.id)).map((k) => k.x), firstX);
    return [Math.max(lo, maxTooth - TOOTH_MAX), hiOf(n)];
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

  /**
   * Дальний ход длинной связи (G8: при выборе лица его длинные связи разворачиваются): прямой вертикалью, если она не
   * задевает чужих звёзд; иначе — одной ступенькой в межстрочье, после которой вертикаль идёт другим столбцом (в пределах
   * зубцов дальних детей). Звёзды столбцов считаются один раз на столбец, ступенька — перебором межстрочий.
   */
  const farJog = (n: Nest, own: LinkStar, other: LinkStar | null): Map<number, Jog> | undefined => {
    const out = new Map<number, Jog>();
    const near = n.kids.filter((k) => !n.far.has(k.id));
    const mine = new Set([own.id, ...(other ? [other.id] : []), ...n.kids.map((k) => k.id)]);
    for (const dir of [-1, 1] as const) {
      const fs = n.kids.filter((k) => n.far.has(k.id) && Math.sign(k.y - own.y) === dir);
      if (!fs.length) continue;
      const ys = [own.y, ...near.map((k) => k.y), ...(n.linked && other ? [other.y] : [])];
      const edge = dir < 0 ? Math.min(...ys) : Math.max(...ys);
      const reach = dir < 0 ? Math.min(...fs.map((k) => k.y)) : Math.max(...fs.map((k) => k.y));
      const lo = Math.min(edge, reach);
      const hi = Math.max(edge, reach);
      /** чужие звёзды столбца x между a и b (по их радиусу) */
      const column = (x: number): [number, number][] => {
        const out2: [number, number][] = [];
        for (const st of stars.query(x - maxR - STAR_CLEAR, lo - maxR, x + maxR + STAR_CLEAR, hi + maxR))
          if (!mine.has(st.id) && !st.ghost && Math.abs(st.x - x) < st.r + STAR_CLEAR) out2.push([st.y - st.r, st.y + st.r]);
        return out2;
      };
      const count = (col: [number, number][], a: number, b: number) => {
        let c = 0;
        for (const [p, q] of col) if (q > Math.min(a, b) + 0.5 && p < Math.max(a, b) - 0.5) c++;
        return c;
      };
      const base = column(n.x);
      const straight = count(base, edge, reach);
      if (!straight) continue;
      let best: { y: number; x2: number; c: number } | null = null;
      const cols = new Map<number, [number, number][]>();
      for (let j = 0; j < 48; j++) {
        const y = edge + dir * (j + 0.5) * ky;
        if (dir * (reach - y) < ky * 0.5) break;
        // дети за ступенькой — со второго столбца: зубцы к ним не длиннее 40 px и не короче 5
        const beyond = fs.filter((k) => dir * (k.y - y) > 0);
        const x2lo = Math.max(Math.max(...beyond.map((k) => k.x)) - TOOTH_MAX, Math.min(...beyond.map((k) => k.x)) - TRUNK_MAX);
        const x2hi = Math.min(...beyond.map((k) => k.x - leadOf(k))) + (TRUNK_LEAD - TRUNK_MIN);
        const before = count(base, edge, y);
        if (best && before >= best.c) continue;
        // чужие звёзды у межстрочья y — одним запросом на строку (а не на каждый x2; С1)
        const x2a = Math.ceil(x2lo - 0.5) + 0.5;
        const row: LinkStar[] = [];
        for (const st of stars.query(Math.min(n.x, x2a) - maxR, y - maxR - STAR_CLEAR, Math.max(n.x, x2hi) + maxR, y + maxR + STAR_CLEAR))
          if (!mine.has(st.id) && !st.ghost && Math.abs(st.y - y) < st.r + STAR_CLEAR) row.push(st);
        for (let x2 = x2a; x2 <= x2hi; x2 += 1) {
          if (Math.abs(x2 - n.x) < 2) continue;
          let col = cols.get(x2);
          if (!col) cols.set(x2, (col = column(x2)));
          let c = before + count(col, y, reach);
          const xa = Math.min(n.x, x2);
          const xb = Math.max(n.x, x2);
          for (const st of row) if (st.x > xa - st.r && st.x < xb + st.r) c++;
          const score = c * 1000 + Math.abs(x2 - n.x) + Math.abs(y - edge) / ky;
          if (!best || score < best.c * 1000 + 0.5) {
            if (!best || c < best.c || (c === best.c && score < best.c * 1000 + Math.abs(best.x2 - n.x) + Math.abs(best.y - edge) / ky)) best = { y, x2, c };
          }
        }
      }
      // чужие звёзды у межстрочья y — одним запросом на строку для всех x двойной ступеньки (С1)
      const rows = new Map<number, LinkStar[]>();
      const hline = (y: number, xa: number, xb: number) => {
        let row = rows.get(y);
        if (!row) {
          row = [];
          const fx = fs.map((k) => k.x);
          const x0 = Math.min(n.x - 80, ...fx) - TRUNK_MAX - maxR - 2;
          const x1 = Math.max(n.x + 40, ...fx) + TRUNK_LEAD + maxR + 2;
          for (const st of stars.query(x0, y - maxR - STAR_CLEAR, x1, y + maxR + STAR_CLEAR)) if (!mine.has(st.id) && !st.ghost && Math.abs(st.y - y) < st.r + STAR_CLEAR) row.push(st);
          rows.set(y, row);
        }
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb);
        let c = 0;
        for (const st of row) if (st.x > lo - st.r && st.x < hi + st.r) c++;
        return c;
      };
      let jog: Jog | null = best && best.c < straight ? { y: best.y, x2: best.x2 } : null;
      // двойная ступенька: средний столбец — любой в стороне (он не несёт зубцов), дети — со столбца у них
      if (!best || best.c > 0) {
        const firstFar = dir < 0 ? Math.max(...fs.map((k) => k.y)) : Math.min(...fs.map((k) => k.y));
        const x2lo = Math.max(Math.max(...fs.map((k) => k.x)) - TOOTH_MAX, Math.min(...fs.map((k) => k.x)) - TRUNK_MAX);
        const x2hi = Math.min(...fs.map((k) => k.x - leadOf(k))) + (TRUNK_LEAD - TRUNK_MIN);
        let b2: { c: number; s: number; j: Jog } | null = null;
        // нижняя часть (до столбца детей) — одна на y2: лучший x2 для каждого межстрочья, затем средний столбец
        const tails: { y2: number; x2: number; c: number }[] = [];
        for (let z = 0; z < 2; z++) {
          const y2 = firstFar - dir * (z + 0.5) * ky;
          let bt: { x2: number; c: number } | null = null;
          for (let x2 = Math.ceil(x2lo - 0.5) + 0.5; x2 <= x2hi; x2 += 1) {
            let c2 = cols.get(x2);
            if (!c2) cols.set(x2, (c2 = column(x2)));
            const c = count(c2, y2, reach);
            if (!bt || c < bt.c || (c === bt.c && Math.abs(x2 - n.x) < Math.abs(bt.x2 - n.x))) bt = { x2, c };
          }
          if (bt) tails.push({ y2, ...bt });
        }
        for (let a = 0; a < 2; a++) {
          const y1 = edge + dir * (a + 0.5) * ky;
          const c0 = count(base, edge, y1);
          for (const t of tails) {
            if (dir * (t.y2 - y1) < ky) continue;
            for (let xm = Math.round(n.x - 80) + 0.5; xm <= n.x + 40; xm += 2) {
              let cm = cols.get(xm);
              if (!cm) cols.set(xm, (cm = column(xm)));
              const c1 = c0 + t.c + count(cm, y1, t.y2);
              if (b2 && c1 > b2.c) continue;
              const c = c1 + hline(y1, n.x, xm) + hline(t.y2, xm, t.x2);
              const sc = Math.abs(xm - n.x) * 0.5 + Math.abs(t.x2 - xm) * 0.5;
              if (!b2 || c < b2.c || (c === b2.c && sc < b2.s)) b2 = { c, s: sc, j: { y: t.y2, x2: t.x2, mid: { x: xm, y1 } } };
            }
          }
        }
        if (b2 && b2.c < (best ? best.c : straight) && b2.c < straight) jog = b2.j;
      }
      if (jog) out.set(dir, jog);
    }
    return out.size ? out : undefined;
  };
  // зазор ромба от чужого пути (решение 134: ромб не стоит на чужом пути, r + 2) и половина ширины вертикали
  const nodeClear = (inp.nodeR ?? NODE_R_MAP) + 2;
  const halfW = (wide: boolean) => (wide ? 2.1 : 0.5);
  // соседи по шине (гнёзда одного отца в одном окне времени): внешняя вертикаль оставляет место узлам ещё не поставленных
  const peers = new Map<string, Nest[]>();
  for (const n of nests) {
    const k = `${n.p.id}|${cluster.get(n)}`;
    (peers.get(k) ?? peers.set(k, []).get(k)!).push(n);
  }
  const placed = new Set<Nest>();
  // ромбы бездетных браков (childlessNodes) — заранее в реестр узлов: стволы не проходят через них (G2: союз Потифара на
  // стволе Иакова и Рахили); место — то же, что потом даст childlessNodes без сдвига
  {
    const kidsU = new Set(nests.map((n) => n.u.id));
    for (const u of U.byId.values()) {
      if (!u.a || !u.b || u.claim || kidsU.has(u.id)) continue;
      const h = main.get(u.a);
      const w = main.get(u.b);
      if (!h || !w) continue;
      const x = Math.round(Math.max(h.x + h.r, w.x + w.r) + 12) + 0.5;
      const at = [h, w].find((q) => q.x1 !== null && x < q.x1 - 1);
      const nx = at ? x : Math.round(h.x + h.r + 6) + 0.5;
      const y = (at ?? h).y;
      nodeAt.add(nx, y, nx, y, { x: nx, y, u: u.id });
    }
  }
  const bounds = new Map<Nest, [number, number]>();
  const boundsMemo = (m: Nest) => bounds.get(m) ?? bounds.set(m, boundsOf(m)).get(m)!;
  // записи гнезда в реестрах (для второго прохода) и его цена места
  const ent = new Map<Nest, { dead?: boolean }[]>();
  const costs = new Map<Nest, (x: number) => number>();
  /** окна мест гнезда (середины пикселей) — для совместного перебора второго прохода */
  const windows = new Map<Nest, number[]>();
  const placeNest = (n: Nest, force?: number) => {
    n.far.clear();
    n.jog = undefined;
    const mine: { dead?: boolean }[] = [];
    ent.set(n, mine);
    const addV = (x0: number, y0: number, x1: number, y1: number, e: Vert) => {
      mine.push(e);
      verts.add(x0, y0, x1, y1, e);
    };
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
    // длинная черта брака (решение 134): от мужа к узлу на следе матери у детей — больше 8 строк
    const barLong = !!other && !!inp.long && Math.abs(other.y - own.y) > LONG_ROWS * ky;
    const [y0, y1] = barLong ? spanOf({ ...n, linked: false }, near) : spanOf(n, near);
    // весь ход — и дальний, что рисуется только раскрытым (G8: выбранное лицо разворачивает свои длинные связи)
    const [F0, F1] = spanOf(n, n.kids);
    const wide = n.linked || near.some((k) => n.rib.has(k.id));
    // пределы ствола: не левее узла на следе (звезда владельца и второго родителя), не правее рождения − 5
    let lo = Math.max(firstX - TRUNK_MAX, own.x + own.r + 3);
    if (other) lo = Math.max(lo, other.x + other.r + 3);
    const hi = hiOf(n);
    const maxTooth = Math.max(...plain.map((k) => k.x), firstX);
    lo = Math.max(lo, maxTooth - TOOTH_MAX);
    const inNear = (a: number, b: number) => Math.min(b, y1) - Math.max(a, y0) > 0.5;
    const peerList = (peers.get(`${n.p.id}|${cluster.get(n)}`) ?? []).filter((m) => m !== n && !placed.has(m) && m.u !== n.u);
    const pending = peerList.filter((m) => owner(m).y > F0 + 0.5 && owner(m).y < F1 - 0.5);
    // строки, где этот союз стоит станцией (узел, конец черты брака), и соседи, у которых станция на той же строке (след
    // Иакова: ромб Лии и концы черт Зелфы, Валлы, Рахили) — им остаётся место через шаг узлов
    const rowsOf = (m: Nest) => {
      const o = m.linked ? (m.motherNode ? m.p : m.o) : null;
      return [owner(m).y, ...(o ? [o.y] : [])];
    };
    const myRows = rowsOf(n);
    const sameRow = peerList.filter((m) => rowsOf(m).some((y) => myRows.some((z) => Math.abs(y - z) < 0.5)));
    // обрывки длинных связей (у узла и у каждого дальнего ребёнка) и длинной черты брака: у их концов — звёзды обходятся
    const stubBits: [number, number][] = [];
    if (n.far.size) {
      const edgeUp = Math.min(own.y, ...near.map((k) => k.y));
      const edgeDn = Math.max(own.y, ...near.map((k) => k.y));
      for (const k of plain)
        if (n.far.has(k.id)) {
          const dir = Math.sign(own.y - k.y);
          stubBits.push([k.y, k.y + dir * STUB_PX]);
          stubBits.push(k.y < own.y ? [edgeUp, edgeUp - STUB_PX] : [edgeDn, edgeDn + STUB_PX]);
        }
    }
    if (barLong && other) {
      const dir = Math.sign(other.y - own.y);
      stubBits.push([own.y, own.y + dir * STUB_PX], [other.y, other.y - dir * STUB_PX]);
    }
    // всё, что цена места читает из реестров и звёзд, — одним запросом на гнездо по полосе всех его кандидатов (а не по
    // запросу на кандидата): ход длинной связи бывает в сотни px, а кандидатов — до 65
    const kidsX = Math.max(firstX, ...plain.map((k) => k.x));
    const QX0 = lo - WIDE_GAP - maxR - STAR_CLEAR - nodeGap - 4;
    const QX1 = Math.max(hi + WIDE_GAP + maxR + STAR_CLEAR + nodeGap + 4, kidsX);
    let V: Vert[] = [];
    let N: NodeAt[] = [];
    let S: LinkStar[] = [];
    let TT: Tooth[] = [];
    const collect = () => {
      V = [...verts.query(QX0, F0 - 1, QX1, F1 + 1)].filter((v) => !v.dead && v.u !== n.u.id);
      N = [...nodeAt.query(QX0, F0 - 1, QX1, F1 + 1)].filter((m) => !m.dead && m.u !== n.u.id);
      S = [...stars.query(QX0, F0 - maxR - STAR_CLEAR - STUB_PX, QX1, F1 + maxR + STAR_CLEAR + STUB_PX)];
      TT = [...teeth.query(QX0, F0, QX1, F1)].filter((t) => !t.dead && t.u !== n.u.id);
    };
    collect();
    const cost = (x: number): number => {
      let c = 0;
      // узлу ещё не поставленного соседа по шине останется место сбоку от этой вертикали
      for (const m of sameRow) {
        const [mlo, mhi] = boundsMemo(m);
        const a = Math.ceil(mlo - 0.5) + 0.5;
        const b = Math.floor(Math.min(mhi, m.kids[0].x - m.kids[0].r - STAR_CLEAR) - 0.5) + 0.5;
        if (!(a <= x - nodeGap || b >= x + nodeGap)) c += 150;
      }
      for (const m of pending) {
        const [mlo, mhi] = boundsMemo(m);
        const g = nodeClear + halfW(wide);
        // кандидаты соседа — середины пикселей в его пределах, и его ствол не ближе r + 5 к звезде его первого ребёнка
        const a = Math.ceil(mlo - 0.5) + 0.5;
        const b = Math.floor(Math.min(mhi, m.kids[0].x - m.kids[0].r - STAR_CLEAR) - 0.5) + 0.5;
        if (!(a <= x - g || b >= x + g)) c += 150;
      }
      for (const v of V) {
        const d = Math.abs(v.x - x);
        // вертикали других союзов (Г6): штраф растёт к совпадению — совпадающие вертикали читались бы одной линией (G2)
        if (d < WIDE_GAP && Math.min(v.y1, F1) - Math.max(v.y0, F0) > 0.5) {
          const need = v.wide || wide ? WIDE_GAP : TRUNK_GAP;
          if (d < need) {
            const w = !v.full && inNear(v.y0, v.y1) ? 1 : 0.3;
            c += w * (d < 2 ? 1200 : 100 + (300 * (need - d)) / need);
          }
        }
        // ромб не на чужом пути (решение 134, G2): узел этого союза — на вертикали другого
        if (own.y > v.y0 + 0.5 && own.y < v.y1 - 0.5 && d < nodeClear + halfW(v.wide)) c += v.full ? 400 : 1200;
        // свои зубцы пересекают вертикали других союзов (Я11)
        if (v.x > x + 0.5)
          for (const k of plain) if (!n.far.has(k.id) && v.x < k.x - k.r - 2 && k.y > v.y0 + 0.5 && k.y < v.y1 - 0.5) c += v.full ? 30 : 100;
      }
      for (const m of N) {
        const d = Math.abs(m.x - x);
        // чужой узел — на этой вертикали
        if (Math.abs(m.y - own.y) >= 1 && m.y > F0 + 0.5 && m.y < F1 - 0.5 && d < nodeClear + halfW(wide)) c += m.y > y0 + 0.5 && m.y < y1 - 0.5 ? 1200 : 400;
        // узел другого союза на том же следе рядом: ромбы слились бы в один (Г7) — хуже близкой вертикали, лучше звезды;
        // если места нет (очень тесная семья на мелком масштабе), лучше ромбы вплотную, чем один поверх другого
        if (Math.abs(m.y - own.y) < 1 && d < nodeGap) c += 200 + (400 * (nodeGap - d)) / nodeGap;
        // черта брака входит в след второго родителя у чужого ромба: она читалась бы связью с тем союзом (G2)
        if (other && Math.abs(m.y - other.y) < 1 && d < nodeGap) c += d < nodeClear + halfW(true) ? 1200 : 200 + (400 * (nodeGap - d)) / nodeGap;
        // чужой узел на зубце
        if (m.x > x + 0.5) for (const k of plain) if (!n.far.has(k.id) && Math.abs(m.y - k.y) < 1 && m.x < k.x - k.r) c += 1200;
      }
      for (const s of S) {
        const dx = Math.abs(s.x - x);
        // чужие звёзды у вертикали (свои дети с зубцами стоят дальше r + 5 сами); у дальнего хода — дешевле (G8)
        if (dx < s.r + STAR_CLEAR && s.id !== own.id && !(other && s.id === other.id) && s.y >= F0 - s.r && s.y <= F1 + s.r) c += s.y >= y0 - s.r && s.y <= y1 + s.r ? 1000 : tied.has(s.id) ? 0 : FULL_STAR;
        // звёзды у обрывков длинных связей: у узла и у каждого дальнего ребёнка (Г11)
        if (dx < s.r + STAR_CLEAR && !tied.has(s.id)) for (const [a, b] of stubBits) if (s.y >= Math.min(a, b) - s.r && s.y <= Math.max(a, b) + s.r) c += 1000;
        // чужие звёзды на зубцах
        if (s.x > x && !skip.has(s.id)) for (const k of plain) if (!n.far.has(k.id) && s.x < k.x && Math.abs(s.y - k.y) < s.r + STAR_CLEAR) c += 1000;
      }
      // вертикаль пересекает зубцы других союзов (Я11)
      for (const t of TT) if (t.y > F0 + 0.5 && t.y < F1 - 0.5 && x > t.x0 + 0.5 && x < t.x1 - 0.5) c += t.y > y0 + 0.5 && t.y < y1 - 0.5 ? 100 : 30;
      return c;
    };
    const lead = leadOf(n.kids[0]);
    let best = Math.max(lo, Math.min(hi, firstX - lead));
    windows.set(n, lo > hi ? [Math.floor(lo) + 0.5] : Array.from({ length: Math.max(1, Math.floor(hi - 0.5) - Math.ceil(lo - 0.5) + 1) }, (_, k) => Math.ceil(lo - 0.5) + 0.5 + k));
    if (force !== undefined) best = force;
    else if (lo > hi) {
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
    placed.add(n);
    // длинные связи — по окончательному x ствола: он мог уйти от пробного и пересечь живые следы (Г11)
    if (inp.long)
      for (const k of plain)
        if (!n.far.has(k.id) && Math.abs(k.y - own.y) > LONG_ROWS * ky && trails.crossing(n.x, own.y, k.y, tied).length) n.far.add(k.id);
    n.longBar = barLong && !!other && trails.crossing(n.x, own.y, other.y, tied).length > 0;
    if (n.far.size) n.jog = farJog(n, own, other);
    const nearKids = n.kids.filter((k) => !n.far.has(k.id));
    const [fy0, fy1] = n.longBar ? spanOf({ ...n, linked: false }, nearKids) : spanOf(n, nearKids);
    addV(n.x, fy0, n.x, fy1, { x: n.x, y0: fy0, y1: fy1, u: n.u.id, wide, full: false });
    // дальний ход (раскрытым) и обрывки (свёрнутым) — тоже в реестр: другие союзы не встают на них (G2, G8)
    const [gy0, gy1] = spanOf(n, n.kids);
    if (gy0 < fy0 - 0.5 || gy1 > fy1 + 0.5) addV(n.x, gy0, n.x, gy1, { x: n.x, y0: gy0, y1: gy1, u: n.u.id, wide, full: true });
    const stubAt = (a: number, b: number) => addV(n.x, Math.min(a, b), n.x, Math.max(a, b), { x: n.x, y0: Math.min(a, b), y1: Math.max(a, b), u: n.u.id, wide, full: false });
    for (const k of plain) if (n.far.has(k.id)) stubAt(k.y, k.y + Math.sign(own.y - k.y) * STUB_PX);
    if (n.far.size) {
      if (gy0 < fy0 - 0.5) stubAt(fy0, fy0 - STUB_PX);
      if (gy1 > fy1 + 0.5) stubAt(fy1, fy1 + STUB_PX);
    }
    if (n.longBar && other) {
      const dir = Math.sign(other.y - own.y);
      stubAt(other.y, other.y - dir * STUB_PX);
    }
    const na: NodeAt = { x: n.x, y: own.y, u: n.u.id };
    mine.push(na);
    nodeAt.add(n.x, own.y, n.x, own.y, na);
    // зубцы гнезда — в реестр: вертикали других союзов их не пересекают (Я11)
    for (const k of plain)
      if (!n.far.has(k.id)) {
        const t: Tooth = { x0: n.x, x1: k.x - k.r - 1.5, y: k.y, u: n.u.id };
        mine.push(t);
        teeth.add(n.x, k.y, k.x, k.y, t);
      }
    costs.set(n, (x: number) => {
      collect();
      return cost(x);
    });
  };
  for (const n of order) placeNest(n);
  // второй проход (решение 134): гнездо, чьё место заняли поставленные позже (их черта прошла через его ромб, звезда на
  // его вертикали), ставится заново — уже зная всех соседей; его прежние записи в реестрах гаснут
  const kill = (n: Nest) => {
    for (const e of ent.get(n) ?? []) e.dead = true;
  };
  // совместный перебор — дорогой: только на масштабе, где строки не теснее 10 px (на обзоре конфликты повсюду и ромбов
  // всё равно нет), и не больше JOINT_MAX раз на кадр связей
  let joint = ky >= 10 ? JOINT_MAX : 0;
  // на обзоре (строка теснее 6 px — связи проявляются с подробностью, решение 25) второго прохода нет: конфликты там
  // повсюду, а ромбов и подробных связей не видно
  for (const n of ky >= 6 ? order : []) {
    const c = costs.get(n);
    if (!c || c(n.x) < 1000) continue;
    kill(n);
    placeNest(n);
    if (costs.get(n)!(n.x) < 1000 || joint <= 0) continue;
    // совместно с соседом по шине (гнёзда того же отца рядом по времени): Ефа и Мааха у Халева — ромб одной на черте
    // другой, пока второй не уступит место; перебор мест соседа, гнездо — лучшим местом при каждом. Только с соседом,
    // без которого место гнезда стало бы чистым (виновник), — безнадёжные места (звезда) не перебираются
    const culprit = (m: Nest) => {
      const es = ent.get(m) ?? [];
      const alive = es.filter((e) => !e.dead);
      for (const e of alive) e.dead = true;
      const c = costs.get(n)!(n.x);
      for (const e of alive) e.dead = false;
      return c < 1000;
    };
    const near = (peers.get(`${n.p.id}|${cluster.get(n)}`) ?? []).filter((m) => m !== n && Math.abs(m.x - n.x) < 2 * WIDE_GAP && culprit(m)).slice(0, 2);
    if (!near.length) continue;
    joint--;
    let bestT = costs.get(n)!(n.x) + near.reduce((a, m) => a + costs.get(m)!(m.x), 0);
    let bestPick: { m: Nest; xm: number; xn: number } | null = null;
    for (const m of near) {
      const x0 = m.x;
      for (const xm of (windows.get(m) ?? []).filter((_, k) => k % 2 === 0)) {
        kill(m);
        placeNest(m, xm);
        kill(n);
        placeNest(n);
        const t = costs.get(n)!(n.x) + costs.get(m)!(m.x) + near.filter((o) => o !== m).reduce((a, o) => a + costs.get(o)!(o.x), 0) + Math.abs(xm - x0);
        if (t < bestT - 1) {
          bestT = t;
          bestPick = { m, xm, xn: n.x };
        }
      }
      kill(m);
      placeNest(m, x0);
    }
    kill(n);
    if (bestPick) {
      kill(bestPick.m);
      placeNest(bestPick.m, bestPick.xm);
      placeNest(n, bestPick.xn);
    } else placeNest(n);
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
    // родовая черта (Г12): у владельца узла нет следа до узла — сплошной чертой от знака или от конца следа (решение 94; у народа — бледной)
    const tail = own.x1 === null ? own.x + own.r + 1.5 : own.x1;
    const clan = tail < x - 1 && plainNear.length + n.far.size > 0;
    // строка узла: на следе владельца; у длинной родовой черты (обрывками, Г12) строку владельца к году детей уже занял
    // чужой след — узел на нём читался бы его узлом (Г7), и узел встаёт между строками, на полстроки к детям
    // (этап 12, перепись Я8: «Хеврон, сын Каафа» на следе Урии)
    const ny = clan && x - tail > CLAN_MAX && trails.foreignAt(x, own.y, own.id) ? own.y + (Math.sign(n.kids[0].y - own.y) || 1) * (ky / 2) : own.y;
    // вертикаль гнезда по остановкам: узел, второй родитель, дети; черта брака — от второго родителя до узла
    const stops = [ny, ...near.map((k) => k.y), ...(other ? [other.y] : [])].sort((a, b) => a - b);
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
      const isBar = !!other && ((mid - ny) * (mid - other.y) < 0) && !kidYs.some((y) => (y - a) * (y - b) < 0) && !ribYs.some((y) => (y - a) * (y - b) < 0);
      // отрезок, который проходит только лента (к ребёнку линии за узлом и дальше нет других детей)
      const beyondPlain = !kidYs.some((y) => (y >= b && ny <= a) || (y <= a && ny >= b));
      const ribOnly = !isBar && beyondPlain && ribYs.some((y) => (y >= b && ny <= a) || (y <= a && ny >= b));
      if (ribOnly) continue;
      if (isBar && n.longBar) {
        // длинная черта брака (решение 134): целиком — раскрытой; свёрнутой — обрывки у узла и у мужа с подписями
        // «Халев, 24 П» у узла (кто муж) и «Мааха, 22 П» у мужа (кто жена)
        const sk = spouseKey(u.id, other!.id);
        push({ key: sk, kind: 'bar', style: 'solid', pts: [x, a, x, b], ends: [other!.id, own.id], union: u.id, when: 'full' }, skip);
        const dir = Math.sign(other!.y - ny) as -1 | 1;
        push({ key: sk, kind: 'stub', style: 'solid', pts: [x, ny, x, ny + dir * STUB_PX], ends: [other!.id, own.id], union: u.id, when: 'short' }, skip);
        push({ key: sk, kind: 'stub', style: 'solid', pts: [x, other!.y - dir * STUB_PX, x, other!.y], ends: [other!.id, own.id], union: u.id, when: 'short' }, skip);
        stubs.push({ key: sk, ks: key(sk), union: u.id, x, y: ny + dir * STUB_PX, dir, targets: [other!.id], side: 'child', kind: 'spouse' });
        stubs.push({ key: sk, ks: key(sk), union: u.id, x, y: other!.y - dir * STUB_PX, dir: -dir as -1 | 1, targets: [own.id], side: 'parent', kind: 'spouse' });
      } else if (isBar) push({ key: spouseKey(u.id, other!.id), kind: 'bar', style: 'solid', pts: [x, a, x, b], ends: [other!.id, own.id], union: u.id, when: 'always' }, skip);
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
        if (par && n.rib.has(k.id) && steps.has(`${par}>${k.id}`)) via.set(`${par}>${k.id}`, { x, y: ny, union: u.id });
    // длинные связи (Г11): целиком — только раскрытыми; свёрнутыми — обрывки у узла и у каждого дальнего ребёнка
    const far = n.kids.filter((k) => n.far.has(k.id));
    if (far.length) {
      for (const dir of [-1, 1] as const) {
        const fs = far.filter((k) => Math.sign(k.y - ny) === dir);
        if (!fs.length) continue;
        const reach = Math.max(...fs.map((k) => Math.abs(k.y - ny)));
        const edge = dir < 0 ? Math.min(ny, ...near.map((k) => k.y), ...(other ? [other.y] : [])) : Math.max(ny, ...near.map((k) => k.y), ...(other ? [other.y] : []));
        // от края у второго родителя вертикаль идёт от его следа (он связан чертой брака): его след ей не чужой
        const at = other && Math.abs(edge - other.y) < 0.5 ? [other.id] : [];
        // целиком: от края ближней части до самого дальнего ребёнка — прямо или со ступенькой в межстрочье (G8)
        const jg = n.jog?.get(dir);
        const full = jg?.mid
          ? [x, edge, x, jg.mid.y1, jg.mid.x, jg.mid.y1, jg.mid.x, jg.y, jg.x2, jg.y, jg.x2, ny + dir * reach]
          : jg
            ? [x, edge, x, jg.y, jg.x2, jg.y, jg.x2, ny + dir * reach]
            : [x, edge, x, ny + dir * reach];
        push({ key: unionKey(u.id), kind: 'trunk', style, pts: full, ends: [own.id, ...at, ...fs.map((k) => k.id)], union: u.id, when: 'full' }, skip);
        // обрывок у узла
        const sy = edge + dir * STUB_PX;
        push({ key: unionKey(u.id), kind: 'stub', style, pts: [x, edge, x, sy], ends: [own.id, ...at, ...fs.map((k) => k.id)], union: u.id, when: 'short' }, skip);
        stubs.push({ key: unionKey(u.id), ks: key(unionKey(u.id)), union: u.id, x, y: sy, dir, targets: fs.map((k) => k.id), side: 'parent', kind: 'long' });
      }
      for (const k of far) {
        const e = k.x - k.r - 1.5;
        const dir = Math.sign(ny - k.y) as -1 | 1;
        const ck = childKey(u.id, k.id);
        // за ступенькой дальнего хода ребёнок висит на втором столбце
        const jg = n.jog?.get(-dir);
        const kx = jg && -dir * (k.y - jg.y) > 0 ? jg.x2 : x;
        if (e - kx > 0.5) push({ key: ck, kind: 'tooth', style, pts: [kx, k.y, e, k.y], ends: [own.id, k.id], union: u.id, when: 'always' }, skip);
        push({ key: ck, kind: 'stub', style, pts: [kx, k.y + dir * STUB_PX, kx, k.y], ends: [own.id, k.id], union: u.id, when: 'short' }, skip);
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: kx, y: k.y + dir * STUB_PX, dir, targets: [own.id], side: 'child', kind: 'long' });
      }
    }
    // родовая черта (Г12). Гнездо, всех детей которого ведут ленты, черты не получает: к ним идёт сама лента (Г1)
    // К6 (этап 13, решение 93): оба супруга на небе, а жена не связана с союзом — у союза, чьих детей ведёт лента, черта
    // брака от её следа к «станции» на следе мужа, если она рядом (не дальше SPOUSE_ROWS) и её след доходит до года
    // узла; иначе — её имя у ромба (ниже)
    const bride = !other && n.o && n.first && !n.motherNode && !plainNear.length && near.length ? n.o : null;
    const barFrom = bride && bride.x1 !== null && bride.x1 >= x - 1 && bride.x + bride.r + 2 < x && Math.abs(bride.y - ny) > 0.5 && Math.abs(bride.y - ny) <= SPOUSE_ROWS * ky ? bride : null;
    if (barFrom) push({ key: spouseKey(u.id, barFrom.id), kind: 'bar', style: 'solid', pts: [x, Math.min(barFrom.y, ny), x, Math.max(barFrom.y, ny)], ends: [barFrom.id, own.id], union: u.id, when: 'always' }, new Set([barFrom.id, own.id]));
    if (clan) {
      const len = x - tail;
      const ck = unionKey(u.id);
      const cs = clanStyle(own.id);
      if (len <= CLAN_MAX) push({ key: ck, kind: 'clan', style: cs, pts: [tail, own.y, x, own.y], ends: [own.id], union: u.id, when: 'always' }, skip);
      else {
        // целиком — по строке владельца; если узел ушёл между строк (строку занял чужой след), то и черта идёт между строк
        // от обрывка у конца следа: по чужому следу точки не бегут
        const full = ny === own.y ? [tail, own.y, x, own.y] : [tail, own.y, tail + STUB_PX, own.y, tail + STUB_PX, ny, x, ny];
        push({ key: ck, kind: 'clan', style: cs, pts: full, ends: [own.id], union: u.id, when: 'full' }, skip);
        push({ key: ck, kind: 'stub', style: cs, pts: [tail, own.y, tail + STUB_PX, own.y], ends: [own.id], union: u.id, when: 'short' }, skip);
        push({ key: ck, kind: 'stub', style: cs, pts: [x - STUB_PX, ny, x, ny], ends: [own.id], union: u.id, when: 'short' }, skip);
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: tail + STUB_PX, y: own.y, dir: 0, targets: n.kids.map((k) => k.id), side: 'parent', kind: 'clan' });
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: x - STUB_PX, y: ny, dir: 0, targets: [own.id], side: 'child', kind: 'clan' });
      }
    }
    // узел: ◆ у первого гнезда союза, • у следующих
    const count = unionsOf.get(n.p.id) ?? 0;
    // имя матери у ромба на следе отца — если у отца союзов с детьми два и больше (Г8); мать не названа — пустая строка:
    // у ромба тогда название союза «Давид (мать не названа)» (решение 75; trails.ts, drawLinkLabels)
    // этап 13, К6: мать на небе, не связанная линией, — её имя у ромба всегда (прежде — при двух союзах и больше)
    const farMother =
      !n.motherNode && n.o && !n.linked && !barFrom ? n.o.id : !n.motherNode && !n.o && u.b && u.b !== n.p.id && count >= 2 ? u.b : !n.motherNode && !u.b && count >= 2 ? '' : null;
    nodes.push({
      kind: n.first ? 'union' : 'join',
      union: u.id,
      key: unionKey(u.id),
      x,
      y: ny,
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
    // этап 14 (решение 134, G2): черты брака жён одного мужа не совпадают (Азува и Иериофа у Халева) — следующая встаёт
    // правее на шаг вертикалей; ромб не на чужой черте, черта не через чужой ромб
    const y0 = Math.min(h.y, s.y);
    const y1 = Math.max(h.y, s.y);
    const x0 = Math.round(Math.min(s.x1 - 2, Math.max(s.x + s.r, h.x + h.r) + 12)) + 0.5;
    const busy = (x: number) =>
      [...verts.query(x - WIDE_GAP, y0, x + WIDE_GAP, y1)].some((v) => !v.dead && Math.abs(v.x - x) < WIDE_GAP && Math.min(v.y1, y1) - Math.max(v.y0, y0) > 0.5) ||
      [...verts.query(x - nodeClear - 3, s.y - 1, x + nodeClear + 3, s.y + 1)].some((v) => !v.dead && s.y > v.y0 + 0.5 && s.y < v.y1 - 0.5 && Math.abs(v.x - x) < nodeClear + 2.1) ||
      [...nodeAt.query(x - nodeGap, y0 - 1, x + nodeGap, y1 + 1)].some((m) => !m.dead && ((m.y > y0 + 0.5 && m.y < y1 - 0.5 && Math.abs(m.x - x) < nodeClear + 2.1) || ((Math.abs(m.y - s.y) < 1 || Math.abs(m.y - h.y) < 1) && Math.abs(m.x - x) < nodeGap)));
    // места на её следе нет — без черты: ромб на следе мужа с её именем (childlessNodes, К6)
    let x = x0;
    for (let k = 1; busy(x); k++) {
      x = x0 + k * TRUNK_GAP;
      if (k > 6 || x >= Math.min(s.x1 - 2, h.x1 - 1)) {
        x = NaN;
        break;
      }
    }
    if (!(x > s.x + s.r + 1) || x >= h.x1) continue;
    verts.add(x, y0, x, y1, { x, y0, y1, u: u.id, wide: true, full: false });
    nodeAt.add(x, s.y, x, s.y, { x, y: s.y, u: u.id });
    const skip = new Set([s.id, h.id]);
    const path: LinkPath = { key: spouseKey(u.id, h.id), ks: '', kind: 'bar', style: 'solid', pts: [x, h.y, x, s.y], ends: [h.id, s.id], union: u.id, when: 'always', cuts: [] };
    path.ks = key(path.key);
    addCuts(path, trails, skip, TRAIL_CUT);
    paths.push(path);
    nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x, y: s.y, open: true, count: null, mother: null, owner: s.id, from: h.id });
  }

  // ромб бездетного брака не встаёт на чужую вертикаль и вплотную к чужому ромбу (решение 134, G2: союз Соломона с
  // дочерью фараона на обрывке Давида)
  const freeNode = (x: number, y: number, u: string) =>
    ![...verts.query(x - nodeClear - 3, y - 1, x + nodeClear + 3, y + 1)].some((v) => !v.dead && v.u !== u && y >= v.y0 - 0.5 && y <= v.y1 + 0.5 && Math.abs(v.x - x) < nodeClear + halfW(v.wide)) &&
    ![...nodeAt.query(x - nodeGap, y - 1, x + nodeGap, y + 1)].some((m) => !m.dead && m.u !== u && Math.abs(m.y - y) < 1 && Math.abs(m.x - x) < nodeGap) &&
    !nodes.some((m) => m.union !== u && Math.abs(m.y - y) < 1 && Math.abs(m.x - x) < nodeGap);
  childlessNodes(U.byId.values(), main, withKids, nodes, paths, freeNode);

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

/**
 * Бездетный брак, где супруги не связаны линией (К6, этап 13): союз всё равно виден — ромб на следе мужа после рождения
 * младшего из супругов, у ромба — имя жены (Г8: «Фамарь» у Ира и у Онана); след мужа кончился раньше — ромб на следе
 * жены с именем мужа; следов нет — у звезды мужа. Союзы с детьми (withKids) и уже с узлом — мимо.
 */
function childlessNodes(us: Iterable<Union>, main: ReadonlyMap<string, LinkStar>, withKids: ReadonlySet<string>, nodes: LinkNode[], paths: readonly LinkPath[], free: (x: number, y: number, u: string) => boolean = () => true) {
  for (const u of us) {
    if (!u.a || !u.b || u.claim || withKids.has(u.id)) continue;
    const h = main.get(u.a);
    const w = main.get(u.b);
    if (!h || !w) continue;
    const was = nodes.find((q) => q.union === u.id && q.kind === 'union');
    if (was) {
      // ромб уже есть (у мужа или жены): второй супруг, не связанный с ним линией, назван у ромба
      const other = was.owner === u.a ? u.b : u.a;
      const tied = paths.some((q) => q.union === u.id && q.ends.includes(other)) || was.mother === other;
      if (!tied && was.mother === null) {
        was.mother = other;
        was.late = true;
      }
      continue;
    }
    const x = Math.round(Math.max(h.x + h.r, w.x + w.r) + 12) + 0.5;
    const on = [h, w].find((q) => q.x1 !== null && x < q.x1 - 1);
    const at = on ?? h;
    let nx = on ? x : Math.round(h.x + h.r + 6) + 0.5;
    // правее по следу, пока место занято чужой вертикалью или ромбом (на следе — не дальше его конца)
    for (let k = 0; k < 8 && !free(nx, at.y, u.id); k++) {
      const nxt = nx + 2 * NODE_R_MAP + 3;
      if (on && nxt >= on.x1! - 1) break;
      if (!on) break;
      nx = nxt;
    }
    nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x: nx, y: at.y, open: true, count: null, mother: at === h ? w.id : h.id, owner: at.id, from: h.id, late: true });
  }
}

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
  const shown = familyUnions(U, S).filter((u) => !otherReading(u, !!inp.flip));
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
        // обрывок у самой дочери — вертикалью к её звезде со стороны родителя: слева у звезды входит зубец её своего союза
        // (Нааман: сын Вениамина и, по Чис 26:40, Белы), две связи одной чертой читались бы одной (этап 13, перепись Я11)
        const s = -dir as -1 | 1;
        const ky0 = Y(k) + s * (R(k) + 1.5);
        push({ key: ck, kind: 'stub', style: kidStyle(u), pts: [X(k), Y(k) + s * (R(k) + 1.5 + STUB_PX), X(k), ky0], ends: [p, k], union: u.id, when: 'always' }, new Set([p, k]));
        stubs.push({ key: ck, ks: key(ck), union: u.id, x: X(k), y: Y(k) + s * (R(k) + 1.5 + STUB_PX), dir: s, targets: [p], side: 'child', kind: 'kid' });
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
        // строку родителя к году узла занял чужой след (родовая черта длинная: Сегув — Иаир) — узел между строк, на полстроки
        // к детям: на чужом следе он читался бы его узлом (Г7; этап 12, Я8 — так же на общей раскладке)
        if (i === 0 && !q.mother && inp.stars.some((o) => o.id !== p && !o.ghost && Math.abs(o.y - py) < 0.5 && o.x < q.bus && (o.x1 ?? o.x + o.r) > q.bus)) yStart = py + side * (ky / 2);
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
        // родовая черта (Г12): след родителя (у первой группы стороны) или матери кончился раньше ствола — сплошной чертой до него (решение 94; у народа — бледной)
        const clan = (who: string, y: number, yNode = y) => {
          const st = main.get(who)!;
          const tail = st.x1 === null ? st.x + st.r + 1.5 : st.x1;
          if (tail >= q.bus - 1) return;
          const ck = unionKey(q.u.id);
          // длинная черта или чужой след на той же строке (строку занимают после чужого следа) — обрывками с подписями
          const busy = inp.stars.some((o) => o.id !== who && Math.abs(o.y - y) < 0.5 && o.x < q.bus && (o.x1 ?? o.x + o.r) > tail);
          const cs = clanStyle(who);
          if (q.bus - tail <= CLAN_MAX && !busy) {
            push({ key: ck, kind: 'clan', style: cs, pts: [tail, y, q.bus, y], ends: [who], union: q.u.id, when: 'always' }, new Set([who]));
            return;
          }
          const stub = Math.min(STUB_PX, (q.bus - tail) / 3);
          push({ key: ck, kind: 'stub', style: cs, pts: [tail, y, tail + stub, y], ends: [who], union: q.u.id, when: 'always' }, new Set([who]));
          push({ key: ck, kind: 'stub', style: cs, pts: [q.bus - stub, yNode, q.bus, yNode], ends: [who], union: q.u.id, when: 'always' }, new Set([who]));
          stubs.push({ key: ck, ks: key(ck), union: q.u.id, x: tail + stub, y, dir: 0, targets: q.kids.length ? q.kids : q.members, side: 'parent', kind: 'clan' });
          stubs.push({ key: ck, ks: key(ck), union: q.u.id, x: q.bus - stub, y: yNode, dir: 0, targets: [who], side: 'child', kind: 'clan' });
        };
        if (i === 0) clan(p, py, node);
        if (q.mother) clan(q.mother, node);
        const pl = plates?.get(q.u.id);
        const was = nodes.find((n) => n.union === q.u.id && n.kind === 'union');
        if (!was)
          nodes.push({ kind: 'union', union: q.u.id, key: unionKey(q.u.id), x: q.bus, y: node, open: !pl || pl.open || pl.hidden === 0, count: pl && !pl.open && pl.hidden > 0 ? `+${pl.hidden}` : null, mother: null, owner: q.mother ?? p, from: pl?.from ?? p });
        else if (q.mother) {
          was.x = q.bus;
          was.y = node;
          was.owner = q.mother;
        } else if (Math.abs(was.x - q.bus) > 1 || Math.abs(was.y - node) > 0.5)
          // дети союза по обе стороны от следа родителя (дочери Авессалома): у ствола второй стороны — свой узел •,
          // иначе он висел бы без узла (Я7)
          nodes.push({ kind: 'join', union: q.u.id, key: unionKey(q.u.id), x: q.bus, y: node, open: true, count: null, mother: null, owner: p, from: p });
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
  // бездетный брак обоих супругов на небе, не связанных линией (К6)
  childlessNodes(shown, main, new Set(shown.filter((u) => u.kids.some((k) => S.has(k))).map((u) => u.id)), nodes, paths);
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
      // шаг за скрытыми показом лицами — «цепочка» (К4): ключ span, без узла союза (родитель шага по данным — не a)
      const gap = inp.lines.gaps?.get(`${line}>${b.id}`) ?? 0;
      const v = gap ? undefined : via.get(pk);
      const pts = stepRoute(a, b, v ? v.x : b.x - b.r - TRUNK_LEAD);
      const kk: LinkKey = gap ? { kind: 'span', line, from: a.id, to: b.id } : { kind: 'step', line, child: b.id };
      // начертание шага (Г10, решение 94): толкование — точки (разреженная нить), иное происхождение — штрих
      const style = inp.lines.styles?.get(`${line}>${b.id}`) ?? 'solid';
      const path: LinkPath = { key: kk, ks: key(kk), kind: 'ribbon', style, pts, ends: [a.id, b.id], union: v?.union ?? null, when: 'always', cuts: [], line, ...(gap ? { gap } : {}) };
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

/** Отрезок (x0, y0, x1, y1), px. */
export type Seg = readonly [number, number, number, number];

/**
 * Путь по нарисованным линиям от точки a до точки b (этап 12, решение 88: выбранная связь целиком — от звезды родителя
 * по его следу и стволам до узла союза): кратчайший по длине путь по отрезкам segs. Отрезки соединяются только в точках:
 * в концах и там, где конец одного лежит на другом (у ствола на следе, у зубца на стволе); пересечение без общей точки —
 * не соединение (Г7). Точки a и b должны лежать на каком-то отрезке. Возвращает ломаную x0, y0, x1, y1, … без лишних
 * точек на прямых; null — пути нет.
 */
export function routeOver(segs: readonly Seg[], a: { x: number; y: number }, b: { x: number; y: number }): number[] | null {
  const EPS = 0.8;
  const P: { x: number; y: number }[] = [];
  const idx = new Map<string, number>();
  const id = (x: number, y: number) => {
    const k = `${Math.round(x * 2)}|${Math.round(y * 2)}`;
    let i = idx.get(k);
    if (i === undefined) {
      i = P.length;
      P.push({ x, y });
      idx.set(k, i);
    }
    return i;
  };
  const ia = id(a.x, a.y);
  const ib = id(b.x, b.y);
  if (ia === ib) return [a.x, a.y];
  for (const s of segs) {
    id(s[0], s[1]);
    id(s[2], s[3]);
  }
  const adj: { j: number; w: number }[][] = P.map(() => []);
  for (const s of segs) {
    const dx = s[2] - s[0];
    const dy = s[3] - s[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < 0.01) continue;
    const on: { t: number; i: number }[] = [];
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      const t = ((q.x - s[0]) * dx + (q.y - s[1]) * dy) / l2;
      if (t < -0.001 || t > 1.001) continue;
      if (Math.hypot(s[0] + t * dx - q.x, s[1] + t * dy - q.y) < EPS) on.push({ t, i });
    }
    on.sort((u, v) => u.t - v.t);
    for (let k = 0; k + 1 < on.length; k++) {
      const i = on[k].i;
      const j = on[k + 1].i;
      if (i === j) continue;
      const w = Math.hypot(P[j].x - P[i].x, P[j].y - P[i].y);
      adj[i].push({ j, w });
      adj[j].push({ j: i, w });
    }
  }
  // Дейкстра: точек — сотни, простой перебор
  const dist = new Float64Array(P.length).fill(Infinity);
  const prev = new Int32Array(P.length).fill(-1);
  const done = new Uint8Array(P.length);
  dist[ia] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < P.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === ib) break;
    done[u] = 1;
    for (const e of adj[u])
      if (dist[u] + e.w < dist[e.j]) {
        dist[e.j] = dist[u] + e.w;
        prev[e.j] = u;
      }
  }
  if (!(dist[ib] < Infinity)) return null;
  const chain: number[] = [];
  for (let i = ib; i >= 0; i = prev[i]) chain.push(i);
  chain.reverse();
  const out: number[] = [];
  for (let k = 0; k < chain.length; k++) {
    const q = P[chain[k]];
    const n = out.length;
    // точка на прямой между соседними — лишняя
    if (n >= 2 && k + 1 < chain.length) {
      const r = P[chain[k + 1]];
      const px = out[n - 2];
      const py = out[n - 1];
      if ((Math.abs(px - q.x) < 0.01 && Math.abs(q.x - r.x) < 0.01) || (Math.abs(py - q.y) < 0.01 && Math.abs(q.y - r.y) < 0.01)) continue;
    }
    out.push(q.x, q.y);
  }
  return out;
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

/**
 * Ребёнок kid союза u рождён через века после конца жизни родителя par (пропуск поколений): у лица, не у народа и рода.
 * Такую связь показывает дуга родства «через века» (marks.ts); у родословия с пропуском (fatherGap) — порог короче.
 */
export const GAP_YEARS = 60;
export const GAP_YEARS_MARKED = 30;
export function farDescendant(par: string, kid: string, u: Pick<Union, 'a' | 'b'>, m: Pick<ModelData, 'chrono' | 'nodeByPerson'> = models[0]): boolean {
  const q = byId.get(par);
  if (!q || q.kind === 'people' || q.kind === 'clan') return false;
  const n = m.nodeByPerson.get(par);
  const c = m.chrono.get(par);
  const b = m.chrono.get(kid)?.b ?? m.nodeByPerson.get(kid)?.t0;
  const end = c ? (c.d ?? c.dEst) : n && n.t1 > n.t0 ? n.t1 : undefined;
  if (end === undefined || b === undefined) return false;
  const gap = (graph.parentsOf.get(kid) ?? []).some((e) => (e.parent === u.a || e.parent === u.b) && e.gap);
  return b - end > (gap ? GAP_YEARS_MARKED : GAP_YEARS);
}
