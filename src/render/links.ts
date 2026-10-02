/**
 * Связи кадра — одна грамматика семьи для всего неба: «Отчий дом» (этап 15, решения 174–177, 181; STAGE15.md; прежде —
 * этап 11, решения 78, 79; STAGE11.md § 2–4).
 *
 * Модуль чистый: по местам звёзд и следов кадра (px; у лица с переходом — ломаная следа, LinkStar.path), союзам
 * (src/engine/unions.ts), году черты брака и виду союза (договор 1, src/engine/stays.ts: unionYear, marriageKind) он
 * строит геометрию связей, ничего не рисуя. Рисуют её trails.ts (стволы, зубцы, черты брака, родовые черты, разрывы
 * следов), plates.ts (ромбы и «•», «+N»), ribbons.ts (ленты через станции) и marks.ts (выбранная связь, путь
 * происхождения).
 *
 * Грамматика:
 *  — союз — двухцветный ромб на следе жены в год черты брака; от мужа к нему — черта брака, вид союза — начертанием
 *    (LinkPath.bar: жена «‖», наложница «|», левират «‖» штрихом, брак не назван — тонкая «|» и полые половины ромба);
 *    мать не названа — ромб с полой половиной жены на следе отца; повторные браки — свои черты к следу жены по времени;
 *  — дети — отводом от следа матери (мать не названа — отца): ствол в год рождения − отступ (8–10 px, до 32 px), зубец
 *    5–40 px к звезде; дети ближе 40 px — на одном стволе, следующее гнездо — «•» на её следе; первое гнездо — на
 *    колонне союза, если черта брака у рождения первого ребёнка;
 *  — вертикали разных союзов — не ближе 8 px (12 px, если одна из них — черта брака или лента); линия не ближе r + 5 px к
 *    чужой звезде; ромб не на чужой линии (решение 181);
 *  — пересечение с чужим следом — разрыв следа по 3 px с каждой стороны (у ленты — 7 px), соединение — только в узле;
 *  — связь целиком: обрывков нет (решение 176), конец за краем окна называет указатель шатра у кромки (frame.ts); у
 *    родителя, чей след кончился раньше узла, — родовая черта до узла (Г12; у народа — бледная);
 *  — к ребёнку линии Мессии ведёт лента, ствола и зубца к нему нет; её станция — у черты брака его матери на следе
 *    родителя шага (решение 177).
 *
 * Всё — в px кадра, для которого строилось (ribbons.ts так же кэширует нити): при сдвиге неба геометрия та же, небо
 * рисует её со сдвигом. Ключи связей — src/engine/linkkey.ts; ими пользуются попадание, подсказка, выбор и адрес «~c».
 */
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
import type { Union, Unions } from '../engine/unions.ts';
import { marriageKind, unionYear, type MarriageKind, type UnionYears } from '../engine/stays.ts';
import { byId, graph, models, type ModelData } from '../data/atlas.ts';
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
export function linkSpanOk(span: { x0: number; x1: number }, cam: { x0: number; kx: number; w: number }): boolean {
  const w = cam.w / cam.kx;
  const slack = (LINK_MARGIN / 2) * w;
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
/** Разрыв следа на пересечении, px с каждой стороны (Г7); у ленты — RIBBON_CUT. */
export const TRAIL_CUT = 3;
export const RIBBON_CUT = 7;
/**
 * Пропуск поколений (решение 176: связь целиком, обрывков нет): ребёнок родился позже конца следа родителя больше чем на
 * столько лет (на GAP_YEARS_MARKED, если родословие пропускает поколения — fatherGap) — связи через века на небе нет;
 * родство называют карточка и путь родства. У народа и рода (Быт 10) — родовая черта, как прежде.
 */
export const GAP_YEARS = 60;
export const GAP_YEARS_MARKED = 30;
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
  /**
   * ломаная нарисованного следа, px кадра (x0, y0, x1, y1, … слева направо): пребывания и S-кривые переходов «Отчего
   * дома» (решение 173; src/engine/stays.ts) — той же выборкой, что рисует trails.ts; только у лица с переходом. Нет —
   * след горизонталь y от x до x1 (y — звезда, полоса рождения)
   */
  path?: readonly number[];
  /**
   * x px, с которого след лица — жизнь в этом доме (решение 173: жена в доме мужа с года брака — семейная укладка since,
   * небо wed); до него — бледная доля следа: связи её не режут разрывом, узел на ней не «чужой». Нет — от звезды
   */
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
  units?: ReadonlyMap<string, readonly { union: { id: string }; parent: string; wife: string | null; kids: readonly string[]; trunk?: number }[]> | null;
  /** переключатель «Лк 3 как второе родословие Иосифа» (решение 107; otherReading) */
  flip?: boolean;
  /** уровень подробности семьи (решение 178; sky.ts, familyTier): 0 — небо, 1 — обзор семьи, 2 — семья */
  tier?: 0 | 1 | 2;
  /** px x кадра для года t (астр., как node.t0): черта брака в год unionYear (решение 174) */
  xAt?: (t: number) => number;
  /** модель неба: годы черт брака (src/engine/stays.ts, unionYear) и годы лиц; нет — первая модель атласа */
  model?: UnionYears & Partial<Pick<ModelData, 'chrono' | 'nodeByPerson'>>;
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
/**
 * Когда путь рисуется. С этапа 15 (решение 176: связь целиком, обрывков нет) — всегда 'always'; 'full' и 'short' (длинная
 * связь целиком только раскрытой, обрывками свёрнутой) остались в типе для прежних читателей кадра.
 */
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
  /**
   * вид союза у черты брака (kind 'bar'; решение 174, src/engine/stays.ts, marriageKind): жена — двойная «‖», наложница —
   * одинарная «|», левират — двойная штрихом, брак не назван — тонкая одинарная
   */
  bar?: MarriageKind;
  /** путь бездетного брака (решение 178: на небе и обзоре семьи — только у выбранного, на масштабе семьи — всегда) */
  childless?: boolean;
}

/**
 * Знак союза по виду (решение 174; plates.ts, paintUnion): половины ромба — муж и жена; полая половина — лицо не
 * названо ('no-mother' — ромб на следе отца, 'no-father' — на следе матери); 'none' — брак не назван: обе половины полые.
 */
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
  /** лицо, от которого союз показан (карточка союза, раскрытие) */
  from: string;
  /** узел ушёл со следа владельца на столько px по своему стволу (с ленты, решение 166); след — на y − off */
  off?: number;
  /** вид знака союза (решение 174); нет — двухцветный залитый ромб */
  look?: NodeLook;
  /** бездетный брак (решение 178: на небе и обзоре семьи — только у выбранного, на масштабе семьи — всегда) */
  childless?: boolean;
}

/**
 * Подпись обрывка: где кончается отрезок, куда он смотрит, чья связь и кого он называет. С этапа 15 обрывков нет (решение
 * 176): LinkFrame.stubs пуст, тип — для прежних читателей кадра.
 */
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

/**
 * y следа лица в x, px кадра (решение 173): по ломаной следа (LinkStar.path — пребывания и переходы), до её начала и
 * после конца — по крайней точке; без ломаной — строка звезды.
 */
export function trailYAt(s: Pick<LinkStar, 'y' | 'path'>, x: number): number {
  const p = s.path;
  if (!p || p.length < 4) return s.y;
  if (x <= p[0]) return p[1];
  for (let k = 2; k + 1 < p.length; k += 2) {
    if (x > p[k]) continue;
    const x0 = p[k - 2];
    const x1 = p[k];
    return x1 - x0 < 1e-9 ? p[k + 1] : p[k - 1] + ((p[k + 1] - p[k - 1]) * (x - x0)) / (x1 - x0);
  }
  return p[p.length - 1];
}

/** Конец нарисованного следа лица, px; у народа и лица без следа — край знака. */
const tailOf = (s: LinkStar) => (s.x1 === null ? s.x + s.r + 1.5 : s.path && s.path.length >= 4 ? Math.max(s.x1, s.path[s.path.length - 2]) : s.x1);

/**
 * Следы кадра: какие живые следы пересекает вертикаль (разрывы Г7) и есть ли чужой след в точке (узел союза на нём
 * читался бы его узлом). Горизонтальные участки — строками по y (двоичный поиск), участки переходов (решение 173) — сеткой
 * по x: их на небе — десятки.
 */
class Trails {
  private rows: { y: number; x0: number; x1: number; i: number; id: string; sy: number }[] = [];
  private slopes = new Grid<{ x0: number; y0: number; x1: number; y1: number; i: number; id: string }>(48);
  private any = false;
  constructor(stars: readonly LinkStar[]) {
    for (const s of stars) {
      const p = s.path;
      // до начала живой доли (жена в доме мужа с года брака) след бледен: разрывов и «чужих» узлов на нём нет
      const from = s.from ?? -Infinity;
      if (p && p.length >= 4) {
        for (let k = 0; k + 3 < p.length; k += 2) {
          let [x0, y0, x1, y1] = [p[k], p[k + 1], p[k + 2], p[k + 3]];
          if (x1 <= from) continue;
          if (x0 < from) {
            y0 += ((y1 - y0) * (from - x0)) / (x1 - x0);
            x0 = from;
          }
          if (x1 - x0 < 0.01) continue;
          if (Math.abs(y1 - y0) < 0.01) this.rows.push({ y: y0, x0, x1, i: s.i, id: s.id, sy: y0 });
          else {
            this.slopes.add(x0, Math.min(y0, y1), x1, Math.max(y0, y1), { x0, y0, x1, y1, i: s.i, id: s.id });
            this.any = true;
          }
        }
        continue;
      }
      // строка следа — там, где его рисует trails.ts (trailOf: середина пикселя), а не середина звезды: иначе вертикаль,
      // кончающаяся у строки, на полпикселя проходит сквозь нарисованный след без разрыва (этап 12, перепись Я8)
      if (s.x1 !== null && s.x1 > Math.max(s.x + s.r + 1, from)) this.rows.push({ y: Math.round(s.y) + 0.5, x0: Math.max(s.x, from), x1: s.x1, i: s.i, id: s.id, sy: s.y });
    }
    this.rows.sort((a, b) => a.y - b.y);
  }
  /** Чужой живой след на строке y у x: узел союза на нём читался бы узлом этого следа (Г7). */
  foreignAt(x: number, y: number, skip: string): boolean {
    for (const t of this.rows) if (t.id !== skip && Math.abs(t.sy - y) < 0.75 && x > t.x0 - 0.5 && x < t.x1 + 0.5) return true;
    if (this.any)
      for (const g of this.slopes.query(x - 1, y - 1, x + 1, y + 1)) {
        if (g.id === skip || x < g.x0 || x > g.x1) continue;
        if (Math.abs(g.y0 + ((g.y1 - g.y0) * (x - g.x0)) / (g.x1 - g.x0) - y) < 0.75) return true;
      }
    return false;
  }
  /** Чужой живой след на строке y между x0 и x1 (родовая черта по строке легла бы на него, Г7). */
  rowBusy(y: number, x0: number, x1: number, skip: string): boolean {
    let a = 0;
    let b = this.rows.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (this.rows[m].y < y - 2) a = m + 1;
      else b = m;
    }
    for (let k = a; k < this.rows.length && this.rows[k].y <= y + 2; k++) {
      const t = this.rows[k];
      if (t.id !== skip && Math.min(Math.abs(t.sy - y), Math.abs(t.y - y)) < 0.75 && t.x1 > x0 + 0.5 && t.x0 < x1 - 0.5) return true;
    }
    if (this.any)
      for (const g of this.slopes.query(x0, y - 1, x1, y + 1)) {
        if (g.id === skip || g.x1 <= x0 || g.x0 >= x1) continue;
        if (Math.min(g.y0, g.y1) < y + 0.75 && Math.max(g.y0, g.y1) > y - 0.75) return true;
      }
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
    if (this.any)
      for (const g of this.slopes.query(x, lo, x, hi)) {
        if (skip.has(g.id) || x <= g.x0 + 0.5 || x >= g.x1 - 0.5) continue;
        const y = g.y0 + ((g.y1 - g.y0) * (x - g.x0)) / (g.x1 - g.x0);
        if (y > lo && y < hi && !out.some((q) => q.i === g.i)) out.push({ i: g.i, id: g.id, y });
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

/** Связи кадра по укладке: одна грамматика «Отчего дома» для общей раскладки и семейной укладки (решения 174–177). */
export function buildLinks(inp: LinkInput): LinkFrame {
  if (!inp.stars.length) return { ...EMPTY, layout: inp.layout, via: new Map() };
  const f = houseLinks(inp);
  // узлы-«станции» лент: союз шага ленты, у которого своих линий в кадре нет
  const drawn = new Set(f.paths.filter((p) => p.kind !== 'ribbon' && p.union).map((p) => p.union!));
  const rib = new Set([...f.via.values()].map((v) => v.union));
  f.ribbonOnly = new Set(f.nodes.filter((n) => rib.has(n.union) && !drawn.has(n.union)).map((n) => n.union));
  linkCrossings(f.paths);
  offRibbonNodes(f, inp);
  f.stamp = {};
  f.paths.forEach((q, i) => (q.n = i));
  return f;
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

// ---------- «Отчий дом»: одна грамматика союза (этап 15, решения 174–177, 181) ----------

/**
 * Станция ленты сдвигается с черты брака вправо на столько px сверх радиуса ромба, если мать стоит между отцом и
 * ребёнком линии: лента не ложится на ромб матери (решение 177: «ромб под лентой не прячется»).
 */
export const RIB_STEP = 6;

/**
 * Ребёнок kid союза u рождён через века после конца жизни родителя par (пропуск поколений: GAP_YEARS, у родословия с
 * пропуском — GAP_YEARS_MARKED): у лица, не у народа и рода. Такой связи линией на небе нет — её показывает дуга родства
 * «потомок» у выбранного и наведённого (marks.ts, kinArcs), карточка и путь родства.
 */
export function farDescendant(par: string, kid: string, u: Pick<Union, 'a' | 'b'>, m: Pick<ModelData, 'chrono' | 'nodeByPerson'> = models[0]): boolean {
  const q = byId.get(par);
  if (!q || q.kind === 'people' || q.kind === 'clan') return false;
  const n = m.nodeByPerson.get(par);
  const c = m.chrono.get(par);
  const b = m.chrono.get(kid)?.b ?? m.nodeByPerson.get(kid)?.t0;
  // конец жизни родителя: год смерти или его оценка, а без них — конец нарисованного следа
  const end = c ? (c.d ?? c.dEst) : n && n.t1 > n.t0 ? n.t1 : undefined;
  if (end === undefined || b === undefined) return false;
  const gap = (graph.parentsOf.get(kid) ?? []).some((e) => (e.parent === u.a || e.parent === u.b) && e.gap);
  return b - end > (gap ? GAP_YEARS_MARKED : GAP_YEARS);
}

/** Союз кадра: супруги на небе, владелец узла и отводов, дети, вид союза, гнёзда и места вертикалей. */
interface Plan {
  u: Union;
  kind: MarriageKind;
  /** муж или отец на небе */
  F: LinkStar | null;
  /** жена или мать на небе (у брака без детей на небе — и её призрак у мужа) */
  W: LinkStar | null;
  /** владелец отводов: мать, если её звезда на небе, иначе отец (решение 175) */
  O: LinkStar;
  /** дети союза на небе (не ленты), по x */
  kids: LinkStar[];
  /** дети ленты: связь с ними рисует лента, её станция — у черты брака (решение 177) */
  rib: LinkStar[];
  look: NodeLook;
  /** подпись у ромба: имя матери не на небе, «мать не названа» (пусто), имя второго супруга без черты */
  label: string | null;
  late: boolean;
  childless: boolean;
  /** x года черты брака, px (договор 1, unionYear); null — года нет */
  xw: number | null;
  /** гнёзда детей: дети ближе 40 px — на одном стволе (решение 175) */
  nests: LinkStar[][];
  /** первое гнездо — на колонне союза: черта брака и ствол одной вертикалью */
  merged: boolean;
  /** x колонны союза (черта брака, ромб) и стволов гнёзд */
  col: number;
  xs: number[];
}

/** Вертикаль к постановке: колонна союза (n = −1: черта брака, ромб, первое гнездо) или ствол гнезда n. */
interface Slot {
  p: Plan;
  n: number;
  kids: LinkStar[];
  /** черта брака на вертикали: соседи — не ближе 12 px (решение 175) */
  wide: boolean;
  want: number;
  lo: number;
  hi: number;
  y0: number;
  y1: number;
  /** строка узла на вертикали (ромб или «•») */
  ny: number;
  /** строка отца у черты брака */
  fy: number | null;
  x: number;
}

/**
 * Связи кадра одной грамматикой «Отчего дома» (решения 174–177, 181) — для общей раскладки и семейной укладки:
 *  — ромб союза — на следе жены в год черты брака, от мужа к нему — черта брака (вид — начертанием: LinkPath.bar);
 *    мать не названа или не на небе — ромб на следе отца (полая половина или её имя); отец не на небе — на следе матери;
 *  — дети — отводом от следа матери: ствол в год рождения − отступ, зубец к звезде; дети ближе 40 px — на одном стволе
 *    (первое гнездо — на колонне союза, если черта брака у рождения), следующее гнездо — «•» на её следе;
 *  — вертикали разных союзов не ближе 8 px, у черты брака — 12 px; линия не ближе r + 5 к чужой звезде; ромб не на
 *    чужой линии (решение 181) — ценой места по сетке кадра;
 *  — связь целиком, без обрывков (решение 176): у следа, кончившегося раньше узла, — родовая черта до него (Г12);
 *  — ребёнок линии Мессии — лентой со станции у черты брака своей матери на следе отца (решение 177).
 */
function houseLinks(inp: LinkInput): LinkFrame {
  const fam = inp.layout === 'family';
  const { ky } = inp;
  const U = inp.unions;
  const R = inp.nodeR ?? (fam ? NODE_R_FAMILY : NODE_R_MAP);
  const nodeGap = 2 * R + 2;
  const nodeClear = R + 2;
  const halfW = (wide: boolean) => (wide ? 2.1 : 0.5);
  const issues: string[] = [];
  const main = new Map<string, LinkStar>();
  const ghostsOf = new Map<string, LinkStar[]>();
  for (const s of inp.stars) {
    if (!s.ghost) main.set(s.id, s);
    else (ghostsOf.get(s.id) ?? ghostsOf.set(s.id, []).get(s.id)!).push(s);
  }
  const steps = stepPairs(inp.lines);
  const trails = new Trails(inp.stars);
  const model = inp.model ?? models[0];
  const yAt = (s: LinkStar, x: number) => trailYAt(s, x);
  const plates = inp.plates ?? null;
  const years = inp.model?.chrono && inp.model.nodeByPerson ? (inp.model as Pick<ModelData, 'chrono' | 'nodeByPerson'>) : models[0];
  const afterLife = (par: string, k: string, u: Union) => farDescendant(par, k, u, years);

  const stars = new Grid<LinkStar>(32);
  let maxR = 0;
  for (const s of inp.stars) {
    stars.add(s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r, s);
    maxR = Math.max(maxR, s.r);
  }
  /** Чужая звезда у горизонтали y (x0…x1) ближе r + 5 (Г5). */
  const starOnRow = (y: number, x0: number, x1: number, skip: string) => {
    for (const q of stars.query(x0 - maxR - STAR_CLEAR, y - maxR - STAR_CLEAR, x1 + maxR + STAR_CLEAR, y + maxR + STAR_CLEAR))
      if (q.id !== skip && distSeg(q.x, q.y, x0, y, x1, y) < q.r + STAR_CLEAR) return true;
    return false;
  };
  const unitYear = new Map<string, number>();
  for (const us of inp.units?.values() ?? []) for (const q of us) if (q.trunk !== undefined && Number.isFinite(q.trunk)) unitYear.set(q.union.id, q.trunk);

  // ---------- союзы кадра ----------
  /** Союз пары «муж — жена» (у призрака бездетного брака satelliteOf — муж): бездетный — призрак у мужа. */
  const pairUnion = (h: string, w: string) => (U.of.get(w) ?? []).find((q) => q.a === h && q.b === w && !q.claim) ?? null;
  /** Призрак бездетного брака (у мужа) — не изображение лица в родной семье. */
  const marriageGhost = (g: LinkStar) => !!g.sat && !(pairUnion(g.sat, g.id)?.kids.length ?? 1);
  // союзы детей кадра: общая раскладка — союз происхождения (кровные отец и мать); семейная — все союзы показа
  const S = new Set(main.keys());
  const shownU: Union[] = [];
  const seenU = new Set<string>();
  const take = (u: Union | null | undefined) => {
    if (!u || seenU.has(u.id) || otherReading(u, !!inp.flip)) return;
    seenU.add(u.id);
    shownU.push(u);
  };
  if (fam) for (const u of familyUnions(U, S)) take(u);
  else
    for (const s of inp.stars) {
      take(mainUnion(U, s.id));
      // браки лиц кадра (бездетные и с детьми не на небе): ромб и черта, если оба супруга на небе
      if (!s.ghost) for (const u of U.of.get(s.id) ?? []) if (!u.claim && u.a && u.b) take(u);
    }
  // сколько союзов с детьми на небе у родителя: имя матери не на небе у ромба — при двух и больше (Г8)
  const withKidsOf = new Map<string, number>();
  const plans: Plan[] = [];
  for (const u of shownU) {
    const F = u.a ? (main.get(u.a) ?? null) : null;
    let W = u.b ? (main.get(u.b) ?? null) : null;
    const kidIds = u.kids.filter((k) => main.has(k) || ghostsOf.has(k));
    const ribIds = kidIds.filter((k) => main.has(k) && ((!!u.a && steps.has(`${u.a}>${k}`)) || (!!u.b && steps.has(`${u.b}>${k}`))));
    const plain = kidIds.filter((k) => !ribIds.includes(k));
    const childless = !u.kids.length;
    if (!kidIds.length) {
      // брак без детей на небе: черта и ромб, если оба супруга на небе (жена — и призраком у мужа)
      if (!F || !u.b || u.claim) continue;
      // призрак бездетного брака у этого мужа; нет его — изображение жены, ближайшее к следу мужа (её звезда или призрак в
      // родной семье): черта не идёт через всё небо к звезде в чужом доме
      const g = (ghostsOf.get(u.b) ?? []).find((q) => q.sat === F.id && marriageGhost(q));
      const imgs = [...(W ? [W] : []), ...(ghostsOf.get(u.b) ?? []).filter((q) => !marriageGhost(q) || q.sat === F.id)];
      const near = imgs.reduce<LinkStar | null>((b, q) => (!b || Math.abs(q.y - yAt(F, q.x)) < Math.abs(b.y - yAt(F, b.x)) ? q : b), null);
      W = g ?? near ?? W;
      if (!W) continue;
    }
    const O = W && !W.ghost ? W : F;
    if (!O) continue;
    // дети: настоящая звезда или призрак в родной семье — ближайший к следу владельца; ребёнок через века после конца
    // следа родителя (пропуск поколений) — без связи на небе
    const kids: LinkStar[] = [];
    for (const k of plain) {
      if (afterLife(O.id, k, u)) {
        issues.push(`века:${u.id}>${k}`);
        continue;
      }
      const imgs = [...(main.has(k) ? [main.get(k)!] : []), ...(ghostsOf.get(k) ?? []).filter((g) => !marriageGhost(g))];
      if (!imgs.length) continue;
      let best = imgs[0];
      for (const q of imgs) if (Math.abs(q.y - yAt(O, q.x)) < Math.abs(best.y - yAt(O, best.x))) best = q;
      kids.push(best);
    }
    kids.sort((a, b) => a.x - b.x || a.y - b.y);
    const rib = ribIds.map((k) => main.get(k)!).sort((a, b) => a.x - b.x);
    if (!kids.length && !rib.length && kidIds.length) continue;
    const kind = marriageKind(u);
    const look: NodeLook = !u.a ? 'no-father' : !u.b ? 'no-mother' : kind;
    // год черты: в семейной укладке — год союза её единицы (family.ts, FamilyUnit.trunk), на небе — договор 1 (unionYear)
    const t = (fam ? unitYear.get(u.id) : undefined) ?? unionYear(u.id, model);
    const xw = t !== null && t !== undefined && inp.xAt ? inp.xAt(t) : null;
    if (kids.length || rib.length) for (const q of [u.a, u.b]) if (q) withKidsOf.set(q, (withKidsOf.get(q) ?? 0) + 1);
    // гнёзда: дети ближе 40 px от ствола первого — на одном стволе (Г3)
    const nests: LinkStar[][] = [];
    for (const k of kids) {
      const g = nests[nests.length - 1];
      if (g && k.x - (g[0].x - leadOf(g[0])) <= TOOTH_MAX) g.push(k);
      else nests.push([k]);
    }
    plans.push({ u, kind, F, W, O, kids, rib, look, label: null, late: false, childless, xw, nests, merged: false, col: NaN, xs: [] });
  }
  for (const p of plans) {
    const u = p.u;
    if (p.W || !p.kids.length && !p.rib.length) continue;
    // ромб на следе отца: имя матери, которая не на небе, или «мать не названа» — если у отца союзов с детьми два и больше
    const n = withKidsOf.get(p.O.id) ?? 0;
    if (u.b && u.b !== p.O.id && n >= 2) p.label = u.b;
    else if (!u.b && u.a && n >= 2) p.label = '';
  }

  // ---------- места вертикалей ----------
  type Vert = { x: number; y0: number; y1: number; u: string; wide: boolean; dead?: boolean };
  type NodeAt = { x: number; y: number; u: string; dead?: boolean };
  type Tooth = { x0: number; x1: number; y: number; u: string; dead?: boolean };
  const verts = new Grid<Vert>(24);
  const nodeAt = new Grid<NodeAt>(24);
  const teeth = new Grid<Tooth>(24);
  const slots: Slot[] = [];
  const span = (ys: number[]): [number, number] => [Math.min(...ys), Math.max(...ys)];
  /**
   * x прихода лица в дом (решение 173): конец последнего перехода следа до hi и начало живой доли следа (LinkStar.from:
   * wed — на небе, since — в семейной укладке); −∞ — лицо в доме с рождения.
   */
  const arrivalOf = (q: LinkStar | null, hi: number): number => {
    if (!q || q.ghost) return -Infinity;
    let a = q.from ?? -Infinity;
    const pp = q.path;
    if (pp) for (let k = 0; k + 3 < pp.length; k += 2) if (Math.abs(pp[k + 3] - pp[k + 1]) > 0.01 && pp[k + 2] <= hi + 0.5) a = Math.max(a, pp[k + 2]);
    return a;
  };
  /** Нижний предел вертикали союза: правее звёзд его лиц. */
  const lo0Of = (p: Plan) => Math.max(p.O.x + p.O.r + 3, p.F ? p.F.x + p.F.r + 3 : -Infinity, p.W ? p.W.x + p.W.r + 3 : -Infinity);
  /**
   * Колонна союза (черта брака и ромб): с первым гнездом детей (merged) — у рождения первого ребёнка; без него — в год
   * черты, левее ствола первого гнезда (wide — шире окно: место у звёзд не нашлось на колонне с гнездом).
   */
  const colSlot = (p: Plan, wideWin = false): Slot => {
    const { F, W, O } = p;
    const bar = !!F && !!W;
    const lo0 = lo0Of(p);
    const n0 = p.nests[0];
    const colKids = p.merged ? n0 : [];
    let want: number;
    let lo: number;
    let hi: number;
    if (p.merged) {
      const first = n0[0];
      want = p.xw !== null ? Math.min(p.xw, first.x - leadOf(first)) : first.x - leadOf(first);
      lo = Math.max(lo0, first.x - TRUNK_MAX, Math.max(...n0.map((k) => k.x)) - TOOTH_MAX);
      hi = first.x - TRUNK_MIN;
    } else if (n0 || p.rib.length) {
      // у союза только с ребёнком линии — до самой его звезды: станция ленты у черты (решение 177), а черта — не раньше
      // прихода матери в дом (у матери царя он бывает за год до рождения)
      const next = n0 ? n0[0].x - leadOf(n0[0]) : p.rib[0].x - p.rib[0].r - 2;
      want = p.xw ?? next;
      lo = Math.max(lo0, Math.min(want, next) - (wideWin ? 2 * TRUNK_MAX : TRUNK_MAX));
      hi = Math.min(want + 16, n0 ? next - (wideWin ? nodeGap : WIDE_GAP) : next);
      want = Math.min(want, hi);
    } else {
      // брак без детей на небе: на обоих следах — правее звёзд, левее концов следов (у следа, кончившегося раньше, — родовая
      // черта до черты брака); в год брака или ближе всего к нему
      // призрак жены у мужа (бездетный брак, жена живёт не у него; решение 173) — ромб справа от призрака
      const tails = [F ? tailOf(F) : Infinity, W && !W.ghost ? tailOf(W) : W ? W.x + W.r + 3 + 3 * WIDE_GAP : Infinity];
      const end = Math.min(...tails) - 1;
      const end2 = Math.max(...tails.filter(Number.isFinite)) - 1;
      want = p.xw ?? Math.max(F ? F.x + F.r : -Infinity, W ? W.x + W.r : -Infinity) + 12;
      lo = lo0;
      // окно — пока оба следа идут; тесно (следы-метки лиц без дат по 10 px) — дальше по более длинному, у короткого —
      // родовая черта до черты брака
      hi = end >= lo0 + 2 * WIDE_GAP ? end : Math.min(end2, lo0 + 3 * WIDE_GAP);
      want = Math.max(lo, Math.min(end >= lo0 ? end : hi, want));
      if (hi < lo) {
        // места на её следе нет: ромб на следе мужа с её именем (К6)
        p.W = null;
        p.label = p.u.b;
        p.late = true;
        want = (F ?? O).x + (F ?? O).r + 6;
        lo = want;
        hi = want;
        p.O = F ?? O;
      }
    }
    // черта брака — не раньше прихода жены в дом мужа (решение 173: конец её перехода, начало живой доли следа wed/since)
    const arr = arrivalOf(p.W, hi) + 1;
    if (arr > lo && arr <= hi) {
      lo = arr;
      want = Math.max(want, lo);
    }
    const xq = Math.max(lo, Math.min(hi, want));
    const ny = p.W ? yAt(p.W, xq) : yAt(p.O, xq);
    const fy = bar && p.W ? (F ? yAt(F, xq) : null) : null;
    const [y0, y1] = span([ny, ...(fy !== null ? [fy] : []), ...colKids.map((k) => k.y)]);
    return { p, n: -1, kids: colKids, wide: fy !== null, want, lo, hi, y0, y1, ny, fy, x: xq };
  };
  /** Ствол гнезда n: в год рождения первого ребёнка гнезда − отступ, от следа владельца (матери). */
  const nestSlot = (p: Plan, n: number): Slot => {
    const g = p.nests[n];
    const first = g[0];
    const w = first.x - leadOf(first);
    let l = Math.max(p.O.x + p.O.r + 3, first.x - TRUNK_MAX, Math.max(...g.map((k) => k.x)) - TOOTH_MAX);
    const h = first.x - TRUNK_MIN;
    // ствол — от живой доли следа матери (после её перехода в дом мужа), если гнездо это позволяет
    const arr = arrivalOf(p.O, h) + 1;
    if (arr > l && arr <= h) l = arr;
    const x = Math.max(l, Math.min(h, w));
    const oy = yAt(p.O, x);
    const [a, b] = span([oy, ...g.map((k) => k.y)]);
    return { p, n, kids: g, wide: false, want: w, lo: l, hi: h, y0: a, y1: b, ny: oy, fy: null, x };
  };
  for (const p of plans) {
    const { F, W } = p;
    const n0 = p.nests[0];
    if (n0) {
      const first = n0[0];
      const t0 = first.x - leadOf(first);
      const want = p.xw !== null ? Math.min(p.xw, t0) : t0;
      // первое гнездо — на колонне, если черта у рождения первого ребёнка и дети не по сторону отца от матери
      const yW = W ? yAt(W, want) : 0;
      const yF = F ? yAt(F, want) : 0;
      const wrongSide = !!F && !!W && Math.abs(yW - yF) > 0.5 && n0.some((k) => Math.sign(k.y - yW) === Math.sign(yF - yW));
      p.merged = want >= first.x - TRUNK_MAX - 0.5 && !wrongSide;
    }
    slots.push(colSlot(p));
    p.nests.forEach((_, n) => {
      if (!(n === 0 && p.merged)) slots.push(nestSlot(p, n));
    });
  }
  // звёзды, мимо которых линии не идут: все, кроме родителей союза (дети — со своими зубцами, отступ не меньше r + 5)
  const cost = (sl: Slot, x: number): number => {
    const u = sl.p.u.id;
    const { y0, y1, ny, kids } = sl;
    const par = new Set([sl.p.O.id, ...(sl.p.F ? [sl.p.F.id] : []), ...(sl.p.W ? [sl.p.W.id] : [])]);
    let c = Math.abs(x - sl.want) * (x > sl.want ? 2 : 1);
    for (const v of verts.query(x - WIDE_GAP, y0 - 7, x + WIDE_GAP, y1 + 7)) {
      if (v.dead || v.u === u) continue;
      const d = Math.abs(v.x - x);
      // вертикали других союзов (решение 175): ближе 8 px (12 px у черты брака) — дороже к совпадению; и встык по высоте
      // (одна кончается на следе, где начинается другая): одна линия через след читалась бы одной связью
      if (Math.min(v.y1, y1) - Math.max(v.y0, y0) > -6) {
        const need = v.wide || sl.wide ? WIDE_GAP : TRUNK_GAP;
        if (d < need) c += d < 2 ? 1200 : 100 + (300 * (need - d)) / need;
      }
      // свой узел — на чужой вертикали (решение 181)
      if (ny > v.y0 + 0.5 && ny < v.y1 - 0.5 && d < nodeClear + halfW(v.wide)) c += 1200;
      if (sl.fy !== null && sl.fy > v.y0 + 0.5 && sl.fy < v.y1 - 0.5 && d < 2) c += 400;
      // чужая вертикаль пересекает свои зубцы (Я11)
      if (v.x > x + 0.5) for (const k of kids) if (v.x < k.x - k.r - 2 && k.y > v.y0 + 0.5 && k.y < v.y1 - 0.5) c += 100;
    }
    for (const m of nodeAt.query(x - nodeGap, y0 - 1, x + nodeGap, y1 + 1)) {
      if (m.dead || m.u === u) continue;
      const d = Math.abs(m.x - x);
      // чужой узел на этой вертикали
      if (Math.abs(m.y - ny) >= 1 && m.y > y0 + 0.5 && m.y < y1 - 0.5 && d < nodeClear + halfW(sl.wide)) c += 1200;
      // узлы разных союзов на одном следе ближе ширины знака: один знак на вид (Г7)
      if (Math.abs(m.y - ny) < 1 && d < nodeGap) c += 200 + (400 * (nodeGap - d)) / nodeGap;
      // черта брака входит в след мужа у чужого ромба: читалась бы связью с тем союзом
      if (sl.fy !== null && Math.abs(m.y - sl.fy) < 1 && d < nodeGap) c += d < nodeClear + halfW(true) ? 1200 : 200 + (400 * (nodeGap - d)) / nodeGap;
      // чужой узел на своём зубце
      if (m.x > x + 0.5) for (const k of kids) if (Math.abs(m.y - k.y) < 1 && m.x < k.x - k.r) c += 1200;
    }
    for (const s of stars.query(x - maxR - STAR_CLEAR, y0 - maxR - 16, Math.max(x, ...kids.map((k) => k.x)) + maxR + STAR_CLEAR, y1 + maxR + 16)) {
      if (par.has(s.id)) continue;
      // чужие звёзды у вертикали (Г5); звезда прямо над или под её концом — вертикаль читалась бы связью этого лица
      if (Math.abs(s.x - x) < s.r + STAR_CLEAR && s.y >= y0 - s.r && s.y <= y1 + s.r) c += 1000;
      else if (Math.abs(s.x - x) < s.r + 2 && s.y >= y0 - s.r - 16 && s.y <= y1 + s.r + 16) c += 300;
      // чужие звёзды на зубцах
      if (s.x > x) for (const k of kids) if (k !== s && s.x < k.x && Math.abs(s.y - k.y) < s.r + STAR_CLEAR) c += 1000;
    }
    // вертикаль пересекает чужие зубцы (Я11)
    for (const t of teeth.query(x, y0, x, y1)) if (!t.dead && t.u !== u && t.y > y0 + 0.5 && t.y < y1 - 0.5 && x > t.x0 + 0.5 && x < t.x1 - 0.5) c += 100;
    return c;
  };
  const ent = new Map<Slot, { dead?: boolean }[]>();
  const yOn = (sl: Slot, x: number): Slot => {
    // строки концов вертикали — в её x (переход следа меняет строку по времени)
    const p = sl.p;
    const ny = sl.n < 0 ? (p.W ? yAt(p.W, x) : yAt(p.O, x)) : yAt(p.O, x);
    const fy = sl.fy !== null && p.F ? yAt(p.F, x) : null;
    const [y0, y1] = span([ny, ...(fy !== null ? [fy] : []), ...sl.kids.map((k) => k.y)]);
    return { ...sl, ny, fy, y0, y1 };
  };
  const place = (sl: Slot) => {
    let best = Math.round(sl.x - 0.5) + 0.5;
    if (sl.lo > sl.hi + 0.01) issues.push(`тесно:${sl.p.u.id}`);
    else {
      let bc = Infinity;
      const pref = Math.round(Math.max(sl.lo, Math.min(sl.hi, sl.want)) - 0.5) + 0.5;
      const a = Math.ceil(sl.lo - 0.5) + 0.5;
      const b = Math.floor(sl.hi - 0.5) + 0.5;
      const reach = Math.max(pref - a, b - pref);
      for (let d = 0; d <= reach; d++)
        for (const x of d ? [pref - d, pref + d] : [pref]) {
          if (x < a - 1e-6 || x > b + 1e-6) continue;
          const c = cost(sl, x);
          if (c < bc) {
            bc = c;
            best = x;
          }
        }
      if (bc >= 100) issues.push(`${bc >= 1000 ? 'звезда' : 'рядом'}:${sl.p.u.id}`);
    }
    const q = yOn(sl, best);
    Object.assign(sl, { x: best, ny: q.ny, fy: q.fy, y0: q.y0, y1: q.y1 });
    const mine: { dead?: boolean }[] = [];
    ent.set(sl, mine);
    const v: Vert = { x: best, y0: sl.y0, y1: sl.y1, u: sl.p.u.id, wide: sl.wide };
    verts.add(best, sl.y0, best, sl.y1, v);
    const n: NodeAt = { x: best, y: sl.ny, u: sl.p.u.id };
    nodeAt.add(best, sl.ny, best, sl.ny, n);
    mine.push(v, n);
    for (const k of sl.kids) {
      const t: Tooth = { x0: best, x1: k.x - k.r - 1.5, y: k.y, u: sl.p.u.id };
      teeth.add(best, k.y, k.x, k.y, t);
      mine.push(t);
    }
  };
  // ромбы бездетных браков и колонны союзов — по времени; при равных — сверху вниз
  slots.sort((a, b) => a.want - b.want || a.y0 - b.y0 || (a.p.u.id < b.p.u.id ? -1 : a.p.u.id > b.p.u.id ? 1 : a.n - b.n));
  for (const sl of slots) place(sl);
  // второй проход: место, которое заняли поставленные позже (их линия прошла через ромб, звезда на вертикали), — заново,
  // уже зная всех соседей (на обзоре, где строки теснее 6 px, ромбов и подробных связей не видно — без него)
  if (ky >= 6)
    for (const sl of slots) {
      if (cost(yOn(sl, sl.x), sl.x) < 1000) continue;
      for (const e of ent.get(sl) ?? []) e.dead = true;
      place(sl);
    }
  // колонна с первым гнездом у чужой звезды (Г5): черта брака и ромб — своей вертикалью левее, первое гнездо — своим
  // стволом с «•» (место у звёзд одной вертикали на двоих не нашлось)
  if (ky >= 6)
    for (const sl of [...slots]) {
      if (sl.n >= 0 || cost(yOn(sl, sl.x), sl.x) < 1000) continue;
      for (const e of ent.get(sl) ?? []) e.dead = true;
      if (!sl.p.merged) {
        // колонна без гнезда (черта к ребёнку линии, черта у позднего первого ребёнка) — шире окно
        if (!sl.p.nests.length && !sl.p.rib.length) {
          place(sl);
          continue;
        }
        const c = colSlot(sl.p, true);
        const g0 = slots.find((q) => q.p === sl.p && q.n === 0);
        if (g0) c.hi = Math.min(c.hi, g0.x - nodeGap);
        slots.splice(slots.indexOf(sl), 1, c);
        place(c);
        continue;
      }
      sl.p.merged = false;
      const c = colSlot(sl.p, true);
      const g = nestSlot(sl.p, 0);
      slots.splice(slots.indexOf(sl), 1, c, g);
      place(g);
      c.hi = Math.min(c.hi, g.x - nodeGap);
      place(c);
    }
  for (const sl of slots) {
    if (sl.n < 0) sl.p.col = sl.x;
    else sl.p.xs[sl.n] = sl.x;
  }

  // ---------- пути ----------
  const paths: LinkPath[] = [];
  const nodes: LinkNode[] = [];
  const via = new Map<string, { x: number; y: number; union: string }>();
  const push = (p: Omit<LinkPath, 'ks' | 'cuts' | 'when'>, half = TRAIL_CUT) => {
    const path: LinkPath = { ...p, ks: key(p.key), cuts: [], when: 'always' };
    addCuts(path, trails, new Set(p.ends), half);
    paths.push(path);
    return path;
  };
  /**
   * Строка следа s у x и родовая черта (Г12), если след кончился раньше: сплошной чертой от конца следа (у народа —
   * бледной), а если строку к году x занял чужой след — между строк, на полстроки к dir (узел на чужом следе читался бы
   * его узлом, Г7).
   */
  const reach = (s: LinkStar, x: number, union: string, dir: number, ck: LinkKey = unionKey(union), ends: string[] = [s.id]): ((x: number) => number) => {
    const tail = tailOf(s);
    if (tail >= x - 1) return (q) => yAt(s, q);
    const ty = yAt(s, tail);
    const cs = clanStyle(s.id);
    // по своей строке, если она до узла пуста; строку после конца следа занял чужой след или звезда — между строк
    if (trails.rowBusy(ty, tail + 1, x, s.id) || starOnRow(ty, tail + 1, x, s.id)) {
      const d0 = dir || 1;
      const bend = Math.min(16, (x - tail) / 3);
      const sides = [d0 * 0.5, -d0 * 0.5, d0 * 1.5, -d0 * 1.5].map((k) => ty + k * ky);
      const ny = sides.find((y) => !trails.rowBusy(y, tail + bend, x, s.id) && !starOnRow(y, tail + bend, x, s.id)) ?? sides[0];
      push({ key: ck, kind: 'clan', style: cs, pts: [tail, ty, tail + bend, ty, tail + bend, ny, x, ny], ends, union });
      return (q) => (q <= tail + 1 ? yAt(s, q) : q < tail + bend ? ty : ny);
    }
    push({ key: ck, kind: 'clan', style: cs, pts: [tail, ty, x, ty], ends, union });
    return (q) => (q <= tail + 1 ? yAt(s, q) : ty);
  };
  for (const p of plans) {
    const u = p.u;
    const x = p.col;
    if (!Number.isFinite(x)) continue;
    const at0 = paths.length;
    const style = kidStyle(u);
    const pl = plates?.get(u.id);
    const kidDir = p.kids.length ? Math.sign(p.kids[0].y - p.O.y) : p.rib.length ? Math.sign(p.rib[0].y - p.O.y) : 1;
    // ромб: на следе жены (у призрака бездетного брака — у призрака), иначе на следе владельца
    const at = p.W ?? p.O;
    // строка владельца: по следу, после его конца — одна родовая черта до самого дальнего узла союза
    const far = Math.max(x, ...p.xs.filter(Number.isFinite));
    const line = at.ghost ? () => at.y : reach(at, far, u.id, kidDir);
    const ny = line(x);
    // черта брака: от мужа к ромбу на следе жены, вид союза — начертанием (решение 174)
    if (p.F && p.W && p.F !== at) {
      // у мужа, чей след кончился раньше, — родовая черта к черте брака тем же ключом (видна вместе с ней)
      const fy = reach(p.F, x, u.id, Math.sign(ny - yAt(p.F, x)), spouseKey(u.id, p.F.id), [p.F.id, at.id])(x);
      if (Math.abs(fy - ny) > 0.5) {
        push({ key: spouseKey(u.id, p.F.id), kind: 'bar', style: p.kind === 'levirate' ? 'dash' : 'solid', pts: [x, fy, x, ny], ends: [p.F.id, at.id], union: u.id, bar: p.kind });
      }
    }
    const node: LinkNode = {
      kind: 'union', union: u.id, key: unionKey(u.id), x, y: ny,
      open: !pl || pl.open || pl.hidden === 0, count: pl && !pl.open && pl.hidden > 0 ? `+${pl.hidden}` : null,
      mother: p.label, owner: at.id, from: pl?.from ?? (p.F ?? p.O).id, look: p.look,
      ...(p.late ? { late: true } : {}), ...(p.childless ? { childless: true } : {}),
    };
    nodes.push(node);
    // второй родитель у отводов (концы путей): связан чертой брака
    const other = p.F && p.W && p.F.id !== p.O.id ? p.F.id : null;
    /**
     * Шина гнёзд (см. ниже): межстрочье у ближнего к владельцу ребёнка следующих гнёзд; null — стволы от следа владельца
     * проходят не больше чужих живых следов, чем ствол колонны до шины и стволы от шины.
     */
    const busOf = (q: Plan, cx: number, cy: number, ln: (x: number) => number): { y: number } | null => {
      const rest = q.nests.map((g, n) => ({ g, n })).filter(({ n }) => !(n === 0 && q.merged) && Number.isFinite(q.xs[n]));
      if (!rest.length || q.O !== at) return null;
      const dir = Math.sign(rest[0].g[0].y - cy);
      if (!dir || rest.some(({ g }) => g.some((k) => Math.sign(k.y - cy) !== dir))) return null;
      const near = dir > 0 ? Math.min(...rest.flatMap(({ g }) => g.map((k) => k.y))) : Math.max(...rest.flatMap(({ g }) => g.map((k) => k.y)));
      const by = near - (dir * ky) / 2;
      const skip = new Set([q.O.id, ...q.kids.map((k) => k.id)]);
      const far = (g: LinkStar[]) => (dir > 0 ? Math.max(...g.map((k) => k.y)) : Math.min(...g.map((k) => k.y)));
      let direct = 0;
      let viaBus = trails.crossing(cx, cy, by, skip).length;
      for (const { g, n } of rest) {
        direct += trails.crossing(q.xs[n], ln(q.xs[n]), far(g), skip).length;
        viaBus += trails.crossing(q.xs[n], by, far(g), skip).length;
      }
      if (viaBus >= direct) return null;
      // ствол колонны до шины (у колонны с первым гнездом — от его дальнего ребёнка, если шина дальше)
      const ends = [q.O.id, ...(other ? [other] : []), ...rest.flatMap(({ g }) => g.map((k) => k.id))];
      const from = q.merged ? far(q.nests[0]) : cy;
      if ((by - from) * dir > 0.5) push({ key: unionKey(q.u.id), kind: 'trunk', style, pts: [cx, from, cx, by], ends, union: q.u.id });
      return { y: by };
    };
    // шина гнёзд между строками у детей (решение 175, «следующее гнездо — „•“»): если стволы следующих гнёзд от следа
    // владельца прошли бы чужие живые следы (между отцом и детьми неназванной матери — чужой дом), они висят на шине —
    // горизонтали в межстрочье у ближнего ребёнка, к которой от колонны союза идёт один ствол; «•» — на шине
    const bus = busOf(p, x, ny, line);
    p.nests.forEach((g, n) => {
      const xn = n === 0 && p.merged ? x : p.xs[n];
      if (!Number.isFinite(xn)) return;
      const onBus = !!bus && !(n === 0 && p.merged);
      const oy = n === 0 && p.merged ? ny : onBus ? bus!.y : p.O === at ? line(xn) : yAt(p.O, xn);
      if (!(n === 0 && p.merged)) nodes.push({ kind: 'join', union: u.id, key: unionKey(u.id), x: xn, y: oy, open: true, count: null, mother: null, owner: p.O.id, from: (p.F ?? p.O).id });
      if (onBus) {
        // шина — отрезками от колонны к каждому гнезду по порядку (конец каждого — у «•» своего гнезда)
        const prev = n === 0 || (n === 1 && !p.merged) ? x : p.xs[n - 1];
        const x0 = Number.isFinite(prev) ? prev : x;
        if (xn - x0 > 0.5) push({ key: unionKey(u.id), kind: 'jog', style, pts: [x0, bus!.y, xn, bus!.y], ends: [p.O.id, ...(other ? [other] : []), ...g.map((k) => k.id)], union: u.id });
      }
      const ids = g.map((k) => k.id);
      const ends = [p.O.id, ...(other ? [other] : []), ...ids];
      const up = g.filter((k) => k.y < oy - 0.5).map((k) => k.y);
      const dn = g.filter((k) => k.y > oy + 0.5).map((k) => k.y);
      if (up.length) push({ key: unionKey(u.id), kind: 'trunk', style, pts: [xn, oy, xn, Math.min(...up)], ends, union: u.id });
      if (dn.length) push({ key: unionKey(u.id), kind: 'trunk', style, pts: [xn, oy, xn, Math.max(...dn)], ends, union: u.id });
      for (const k of g) {
        const e = k.x - k.r - 1.5;
        if (e - xn > 0.5) push({ key: childKey(u.id, k.id), kind: 'tooth', style, pts: [xn, k.y, e, k.y], ends: [p.O.id, ...(other ? [other] : []), k.id], union: u.id });
      }
    });
    // ленты: станция у черты брака матери на следе родителя шага (решение 177)
    for (const k of p.rib)
      for (const par of [u.a, u.b]) {
        if (!par || !steps.has(`${par}>${k.id}`)) continue;
        const P = main.get(par);
        if (!P) continue;
        let sx = x;
        if (p.W && !p.W.ghost && P === p.F) {
          const py = yAt(P, x);
          // мать — между отцом и ребёнком линии: лента выходит у черты, но правее ромба
          if ((ny - py) * (k.y - ny) > 0 && x + R + RIB_STEP < k.x - k.r - 3) sx = x + R + RIB_STEP;
        }
        via.set(`${par}>${k.id}`, { x: sx, y: yAt(P, sx), union: u.id });
      }
    // бездетный брак — все его линии (черта, родовые черты к ней) видны вместе (решение 178)
    if (p.childless) for (let k = at0; k < paths.length; k++) paths[k].childless = true;
  }

  // шаги лент без своего союза в кадре (союз иного рода: Нирий → Салафиил по Луке, Лк 3:27): узел на следе родителя шага
  for (const pk of steps.keys()) {
    if (via.has(pk)) continue;
    const [pa, ka] = pk.split('>');
    const P = main.get(pa);
    const K = main.get(ka);
    if (!P || !K) continue;
    const u = (U.origin.get(ka) ?? []).find((q) => q.a === pa || q.b === pa);
    if (!u) continue;
    const x = Math.round(Math.max(P.x + P.r + 3, K.x - TRUNK_LEAD)) + 0.5;
    via.set(pk, { x, y: yAt(P, x), union: u.id });
    if (!nodes.some((q) => q.union === u.id)) nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x, y: yAt(P, x), open: true, count: null, mother: null, owner: P.id, from: P.id, look: !u.a ? 'no-father' : !u.b ? 'no-mother' : marriageKind(u) });
  }

  if (fam) collapsedNodes(inp, main, nodes, paths, push);
  clearVia(inp, main, via, paths, nodes);
  ribbonPaths(inp, main, via, trails, paths);
  return { layout: inp.layout, paths, nodes, stubs: [], via, issues };
}

/**
 * Свёрнутые союзы набора (показ «набор»): полый ромб с «+N» — у следа родителя (к детям) или у строки ребёнка (к
 * родителям). Поле ромба и «+N» на одной строке — около 48 px: соседний ромб той же строки — не ближе, правее.
 */
function collapsedNodes(inp: LinkInput, main: ReadonlyMap<string, LinkStar>, nodes: LinkNode[], _paths: LinkPath[], push: (p: Omit<LinkPath, 'ks' | 'cuts' | 'when'>) => LinkPath) {
  const plates = inp.plates;
  if (!plates) return;
  const U = inp.unions;
  const S = new Set(main.keys());
  const shownIds = new Set(nodes.map((n) => n.union));
  const SHUT_W = 48;
  const gap = TRUNK_LEAD;
  const shutX = (x0: number, y: number) => {
    let x = x0;
    for (let k = 0; k < 8; k++) {
      const hit = nodes.find((q) => Math.abs(q.y - y) < 1 && Math.abs(q.x - x) < SHUT_W);
      if (!hit) break;
      x = hit.x + SHUT_W;
    }
    return x;
  };
  const list: { u: Union; plate: LinkPlate; at: number }[] = [];
  for (const [uid, pl] of plates) {
    const u = U.byId.get(uid);
    if (!u || pl.open || pl.hidden <= 0 || shownIds.has(uid)) continue;
    list.push({ u, plate: pl, at: Math.min(...u.kids.map((k) => inp.xOf?.(k) ?? Infinity)) });
  }
  list.sort((a, b) => a.at - b.at);
  for (const { u, plate } of list) {
    const par = [u.a, u.b].find((x) => !!x && S.has(x) && !u.kids.includes(x)) ?? null;
    const kid = u.kids.find((k) => S.has(k)) ?? null;
    const look: NodeLook = !u.a ? 'no-father' : !u.b ? 'no-mother' : marriageKind(u);
    if (par && (plate.dir === 'down' || !kid)) {
      const P = main.get(par)!;
      const xs = u.kids.map((k) => inp.xOf?.(k) ?? null).filter((v): v is number => v !== null);
      const x = shutX(Math.max(P.x + P.r + 6, xs.length ? Math.min(...xs) - gap : P.x + P.r + 3 * gap), P.y);
      nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x: Math.round(x) + 0.5, y: trailYAt(P, x), open: false, count: `+${plate.hidden}`, mother: null, owner: par, from: plate.from, look });
    } else if (kid) {
      const K = main.get(kid)!;
      const x = Math.round(K.x - K.r - 1.5 - 2 * gap) + 0.5;
      nodes.push({ kind: 'union', union: u.id, key: unionKey(u.id), x, y: K.y, open: false, count: `+${plate.hidden}`, mother: null, owner: kid, from: plate.from, look });
      push({ key: childKey(u.id, kid), kind: 'tooth', style: kidStyle(u), pts: [x, K.y, K.x - K.r - 1.5, K.y], ends: [kid], union: u.id });
    }
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
