/**
 * Небо на Canvas 2D (ТЗ § 3.1–3.2, § 5): модель, камера, попадание указателем и кадр как порядок слоёв.
 *
 * Слои снизу вверх и где их код:
 *  фон и полосы эпох — здесь; черты канона и «сегодня», меридианы событий, сетка лет — frame.ts;
 *  облака плотности рождений (обзор), контуры созвездий, знаки скоплений — здесь;
 *  следы жизни, отводы, браки — trails.ts; ленты — ribbons.ts; в небе «набор» — линии союзов (plates.ts);
 *  звёзды — здесь (знаки — glyphs.ts); точки союзов (plates.ts);
 *  подписи — labels.ts (пороги масштаба вычислены заранее, в кадре подписи только отбираются и проверяются на наложения);
 *  кольца выбора, фокуса, наведения и отметок — marks.ts;
 *  ярусы эпох (tiers.ts, их рисует SkyView через under) → рамка (frame.ts) → меридиан (marks.ts) → указатели у края (frame.ts).
 *
 * Семантическое увеличение (E3; ТЗ § 3.1; MAP-03, 04): на обзоре — облака плотности рождений, контуры и названия созвездий,
 * скопления, ленты и звёзды величины 0–2; следы, связи и мелкие звёзды проявляются плавно в полосе ×1,5 масштаба
 * (Pass.detail: высота полосы 4 → 6 px), облака при этом гаснут. Выделенное (выбранное лицо, его род, отметки) видно всегда.
 *
 * Общее состояние модули читают через SkyContext (его реализует Sky) и проход кадра Pass; глобального состояния нет.
 */
import { KX_MIN, type Camera, type Frame, type ViewState } from './camera.ts';
import { RowCamera, gapsKey, identityRows, planSky, type FoldMark, type SkyPlan, type SkyView } from './rows.ts';
import { dotTime, drawUnionDots, drawUnionLines, layoutUnionDots, plateGaps, unionLinks, type PlateHit, type PlateIn, type PlateMarks } from './plates.ts';
import { BIRTH_BAND, daggerAt, drawBirthBand, drawGlyph, personGlyph, starRadius } from './glyphs.ts';
import { alpha, hexToRgb } from './color.ts';
import { alphaForContrast, CLOUD_DIMMED, dimLabelAlpha, separateRibbons, WORK_DIM } from './dim.ts';
import { clearOfRibbons, drawBranchLabels, drawSkyRibbons, ribbonBeads, ribbonCheck } from './ribbons.ts';
import {
  drawEventLines, drawFrame, drawGrid, drawTimeMarks, paintWayfinding, placeWayfinding, yearTicks, rateAt,
  BOTTOM_H, CANON_NOTE, FRAME_H, LETTER_W, LETTER_W_TOUCH, RULER_H, type EdgeHit,
} from './frame.ts';
import {
  claim, clusterShort, clusterText, drawClusterLabel, drawEventLabel, drawFoldMark, drawGroupNames, drawNote, drawStarLabels, foldMarkWidth, groupName, LabelCache, LabelLedger,
  measureLabels, namesakesInView, Placer, textBox, zoomScaleFor, GROUP_AREA_MIN, type GroupNameSpot, type LabelStats,
} from './labels.ts';
import { drawDescents, drawFamilyNotes, drawSpineTrails, drawTrails, familyHover, type FamilyNote } from './trails.ts';
import { drawKinPath, drawLeadNotes, drawMeridian, drawRings, drawWorkMarks, emphasis, kinRoutes, meridianFlagAt } from './marks.ts';
import { coarsePointer, mapFont, mapSize, T_MAP_S } from './type.ts';
import type { Rect } from './rect.ts';
import { timeToX, xToTime, hydrateScale, type TimeScale, T_CANON_END, T_END } from '../engine/timescale.ts';
import { toAstro } from '../engine/years.ts';
import type { ClusterInfo, Outline } from '../engine/layout.ts';
import type { KinStep } from '../engine/kinship.ts';
import type { ModelData, NodeRow } from '../data/atlas.ts';
import { byId, graph, groupById, lines } from '../data/atlas.ts';

// рамка и атласная координата — src/render/frame.ts; прежние импорты из sky.ts продолжают работать
export { FRAME_H, BAND, atlasCoord } from './frame.ts';
export type { LabelBox, LabelStats } from './labels.ts';
export type { Rect } from './rect.ts';

export interface Palette {
  sky: string;
  band: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  ruleStrong: string;
  gold1: string;
  gold2: string;
  azure1: string;
  azure2: string;
  focus: string;
  halo: string;
  /** лист и поле наведения: флажок меридиана, отрезки ярусов эпох */
  sheet: string;
  sheet2: string;
  /** непрозрачность погашенной подписи цвета --ink и --ink-2: контраст не ниже 4,5 : 1 к самому светлому фону (решение 31) */
  dimInk: number;
  dimInk2: number;
  /** то же для --ink-3: названия созвездий и подписи скоплений при выделении */
  dimInk3: number;
  /** непрозрачность линии цвета --ink-3 (контуры созвездий, меридианы событий), при которой контраст к небу ≥ 3 : 1 (E8) */
  lineAlpha: number;
  glow: boolean;
  /** сила двух слоёв свечения лент ночью (широкий, узкий) */
  ribbonGlow: [number, number];
  /** сила дневного тона под лентой */
  ribbonTone: number;
}

/**
 * Сила свечения и тона лент (B6, VIS-30, MAP-50).
 * TODO(ds): вынести в tokens.css как --ribbon-glow-1, --ribbon-glow-2, --ribbon-tone; пока токенов нет, действуют эти значения.
 */
const RIBBON_GLOW: [number, number] = [0.06, 0.1];
const RIBBON_TONE = 0.15;

// затемнение при выделении — src/render/dim.ts (его же проверяет npm run -s contrast)
export { DIM, LIKELY, WORK_DIM, DIM_LABEL_CONTRAST, CONSTELLATION_DIM, CLOUD_DIMMED, over, alphaForContrast, likelyAlpha, dimLabelAlpha, labelGrounds } from './dim.ts';

/** Контраст линий карты (контуры созвездий, меридианы событий) к небу — как у графики (ТЗ § 3.8): не ниже 3 : 1. */
export const LINE_CONTRAST = 3;

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const num = (n: string, d: number) => {
    const x = parseFloat(v(n));
    return Number.isFinite(x) ? x : d;
  };
  const glow = v('--glow') === '1';
  const sky = v('--sky');
  // ленты на холсте — оттенки токенов с разведённой светлотой (решение 32; ribbons.ts, separateRibbons)
  const [gold1, gold2, azure1, azure2] = separateRibbons([v('--gold-1'), v('--gold-2')], [v('--azure-1'), v('--azure-2')], sky, glow);
  return {
    sky, band: v('--sky-band'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'),
    ruleStrong: v('--rule-strong'), gold1, gold2, azure1, azure2,
    focus: v('--focus'), halo: v('--halo'), sheet: v('--sheet'), sheet2: v('--sheet-2'),
    dimInk: dimLabelAlpha(v('--ink'), sky, v('--sky-band'), glow ? CLOUD_DIMMED.night : CLOUD_DIMMED.day),
    dimInk2: dimLabelAlpha(v('--ink-2'), sky, v('--sky-band'), glow ? CLOUD_DIMMED.night : CLOUD_DIMMED.day),
    dimInk3: dimLabelAlpha(v('--ink-3'), sky, v('--sky-band'), glow ? CLOUD_DIMMED.night : CLOUD_DIMMED.day),
    lineAlpha: alphaForContrast(v('--ink-3'), sky, LINE_CONTRAST), glow,
    ribbonGlow: glow ? [num('--ribbon-glow-1', RIBBON_GLOW[0]), num('--ribbon-glow-2', RIBBON_GLOW[1])] : [0, 0],
    ribbonTone: glow ? 0 : num('--ribbon-tone', RIBBON_TONE),
  };
}

export interface SkyState {
  model: ModelData;
  lambda: number;
  selected: string | null;
  second: string | null;
  hovered: string | null;
  focus: string | null;
  /**
   * Выделение: остальное небо гаснет. self — выбранное лицо и отметки поиска, anc и desc — предки и потомки,
   * path — путь родства и супруги; sure и likely — живые в год меридиана «наверняка» и «вероятно» (D13).
   */
  highlight: Map<string, Emphasis> | null;
  layers: Record<string, boolean>;
  onlyLines: boolean;
  meridian: number | null;
  tensionPersons: Set<string>;
  flow: number; // 0 — нет тока, иначе время в мс
  reduced: boolean;
  intro: number; // 0…1 — зажигание звёзд
  lineFlip: boolean; // Лк 3 как второе родословие Иосифа
  pins: Set<string>; // отмеченные одноимённые (E10): сплошное кольцо и подпись с уточнением
  /** флажок меридиана у линейки: «990 г. до Р. Х.: живы 186, наверняка 41» (D13) */
  meridianLabel?: string | null;
  /**
   * Резерв: прямоугольники в px холста, закрытые органами неба, колонкой кнопок, вступлением (C4, C6).
   * Подписи звёзд и указатели у края под ними не рисуются.
   */
  reserve?: Rect[];
  /** шаги пути родства (E5, src/state.ts kinSteps): подписи шагов на небе — marks.ts */
  kinSteps?: KinStep[] | null;
  /** поколений от выбранного лица у предков и потомков: дальше третьего род гаснет до 70 % (E4; marks.ts, familyHighlight) */
  depth?: Map<string, number> | null;
  /** ленты — тонким ориентиром (режим «В работе», J4; ribbons.ts); ставит само небо */
  guide?: boolean;
  /** название модели хронологии, если она не по умолчанию (решение 35; IX-48): служебная строка справа (frame.ts) */
  modelNote?: string | null;
  /** лица рабочего набора в режиме «все лица» (IX-51): метка у знака (marks.ts); в режиме «набор» — null */
  workMarks?: ReadonlySet<string> | null;
  /** отклик звезды на клавишу набора (IX-51): однократная обводка 300 мс с мгновения at (performance.now()) */
  workFlash?: { id: string; at: number } | null;
  /**
   * Союзы в небе «набор» (решения 70, 76; src/ui/reveal.ts, plates; рисует plates.ts) — точки с линиями к супругам
   * и детям: что показать и в каком состоянии; plateMarks — наведённая, с кольцом клавиатуры, открытая в листе карточки.
   * В небе «все лица» — нет.
   */
  plates?: readonly PlateIn[] | null;
  plateMarks?: PlateMarks | null;
  /** лица с нераскрытыми союзами, чьи карточки союзов не показаны: «+» после подписи (решение 70) */
  reveal?: ReadonlySet<string> | null;
}

/**
 * Что показывает небо (rows.ts, SkyView) и союзы неба «набор» (решения 70, 76): по ним Sky сам оставляет место
 * под точки у строки одного лица (plates.ts, plateGaps) — и заново при смене модели хронологии, когда меняются полосы.
 */
export type SkyViewIn = SkyView & { plates?: readonly PlateIn[] | null };

/** Знак свёрнутого под указателем: потомки, созвездие, «развернуть всё»; reveal — «+» нераскрытых союзов лица (решение 70). */
export type FoldHitKind = FoldMark['kind'] | 'all' | 'reveal';
export type { PlateHit, PlateIn, PlateMarks } from './plates.ts';

/** sib — братья и сёстры выбранного (E4), group — лица группы панели «Главы» или «Синопсис» (skyGroup) — marks.ts. */
export type Emphasis = 'self' | 'anc' | 'desc' | 'path' | 'sure' | 'likely' | 'sib' | 'group';

/**
 * Что модули отрисовки (frame, labels, trails, marks, ribbons) читают у неба. Реализует Sky; модули ничего в нём
 * не меняют — свои результаты (прямоугольники указателей, флажка, названий) они возвращают.
 */
export interface SkyContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly cam: Camera;
  readonly pal: Palette;
  /** сенсорный экран: кегли холста не мельче 12,5 px */
  readonly coarse: boolean;
  /** ширина левой кромки с буквами строк */
  readonly letterW: number;
  readonly model: ModelData;
  readonly scale: TimeScale;
  readonly lambda: number;
  readonly nodes: readonly NodeRow[];
  /** мировые x рождения и конца следа по узлам */
  readonly X0: Float64Array;
  readonly X1: Float64Array;
  /** верх открытого неба в этом кадре (px): ниже рамки, а в режиме эпох — ниже ярусов */
  readonly openTop: number;
  /** пороги подписей и замеренные ширины имён */
  readonly labelCache: LabelCache;
  /** подписи, нарисованные в этом кадре: замер наложений */
  readonly ledger: LabelLedger;
  /** номер узла лица; undefined — лица нет на небе */
  indexOf(id: string): number | undefined;
  xOf(t: number): number;
  tOf(x: number): number;
  /** узел нарисован в этом кадре (режим «только линии», призраки жён, рабочий набор и свёрнутое — J4, J5) */
  drawn(i: number): boolean;
  /** лицо скрыто рабочим набором или свёрткой (J4, J5): связи к нему не рисуются */
  hides(id: string): boolean;
  /** строка экрана полосы и полоса строки (сжатие полос, src/render/rows.ts; без сжатия — та же полоса) */
  rowOf(lane: number): number;
  laneOf(row: number): number;
  /** ключ сжатия полос: кэши, построенные по полосам, перестраиваются при его смене */
  readonly rowsKey: string;
  /**
   * Залить прямоугольник цветом фона под ним — неба или полосы эпохи (по годам x): так подпись гасит под собой свой след
   * (MAP-56), не оставляя на полосе эпохи тёмной заплаты.
   */
  fillGround(x0: number, x1: number, y: number, h: number): void;
  /** Нарисовать заново звёзды внутри прямоугольника (после того как fillGround погасил под названием линии). */
  restars(p: Pass, box: Rect): void;
}

/** Проход кадра: то, что draw() вычисляет один раз и отдаёт слоям. */
export interface Pass {
  s: SkyState;
  /** видимые узлы в порядке узлов (без лиц свёрнутых скоплений) */
  vis: number[];
  /** яркость лица при выделении: 1, LIKELY или DIM (marks.ts) */
  emph: (id: string) => number;
  /** лица линий Мессии */
  spine: Set<string>;
  /** уровень масштаба подписей: 2·log2(kx / KX_MIN); «всё небо» на телефоне мельче KX_MIN — уровень 0 */
  level: number;
  /** масштаб знаков по высоте полосы */
  zoomScale: number;
  /**
   * Подробность кадра по времени (E3; решение 25): 0 — обзор, 1 — следы и связи. Переход — в полосе ×1,5 масштаба.
   * Слои следов и связей рисуются с этой непрозрачностью, кроме выделенных лиц.
   */
  detail: number;
  /** подробность по высоте строки (решение 25): знаки и подписи */
  rowDetail: number;
  /** подробность звёзд: max(detail, rowDetail) — мелкие звёзды, раскрытие скоплений, облака (1 − она) */
  starDetail: number;
  /** непрозрачность звезды узла i в этом кадре (0 — не нарисована и не ловит указатель) */
  starAlpha: (i: number) => number;
  /**
   * Звезда узла i рисуется в этом кадре (этап 11, B1): не скрыта набором, свёрткой, режимом «только линии» или слоем
   * призраков, проявилась и уже зажглась. Та же проверка — у звёзд (drawStars) и у подписей лиц (labels.ts, labelStar):
   * подписи без звезды не бывает. Положение на экране проверяет каждый слой сам.
   */
  starShown: (i: number) => boolean;
  /** узлы, чьи звёзды нарисованы в этом кадре (drawStars): замер «подпись без звезды» (canvas[data-bare]) */
  starsDrawn: Set<number>;
  /** резерв органов неба */
  reserve: Rect[] | undefined;
  /** занятые места кадра: любая подпись проверяется здесь (labels.ts, claim и labelStar) */
  placer: Placer;
  /** узлы, у которых уже есть подпись в этом кадре */
  labeled: Set<number>;
  /** названия созвездий этого кадра */
  nameBoxes: Rect[];
  /** полосы лент линий Мессии между соседними лицами линии (px холста): названия и пояснения на них не ложатся */
  ribbonBoxes: Rect[];
  /** режим «В работе» (J4): небо рисует только рабочий набор, и все его лица подписываются */
  work: boolean;
  /** линии кадра — следы, отводы, стволы скоб (trails.ts): названия созвездий на них не ложатся (MAP-08) */
  lines?: Placer;
  /** прямоугольник не ложится на нити лент (после их отрисовки; ribbons.ts, clearOfRibbons): подписи лиц линий — вне лент */
  offRibbon?: (b: Rect) => boolean;
  /** одноимённые в окне (MAP-66, MAP-72; решение 43): лицо → краткое уточнение его подписи (пустое — уточнения нет) */
  namesakes?: Map<string, string>;
  /** лица со свёрнутыми потомками → «+N» (MAP-63, UX-60): знак — у подписи лица */
  foldText?: Map<string, string>;
  /** небо «набор»: лица с нераскрытыми союзами → «+» после подписи (решение 70); щелчок показывает их союзы */
  revealText?: Map<string, string>;
  /**
   * небо «набор» (решение 76): дети союзов с точкой на небе — их связь с родителями рисует точка союза (plates.ts),
   * прежних отводов и гребёнок у них нет; пары «муж|жена» с точкой — без знака брака «‖» (trails.ts)
   */
  unionKids?: ReadonlySet<string>;
  unionPairs?: ReadonlySet<string>;
  /** знаки свёрнутого этого кадра (px холста): щелчок разворачивает (src/ui/sky/input.ts); reveal — «+» союзов */
  foldHits?: (Rect & { kind: FoldHitKind; id: string })[];
  /** для проверок приёмки: лица с разрывом «//» на следе и со скобкой «время не установлено» в кадре (trails.ts) */
  shown?: { breaks: Set<string>; brackets: Set<string>; workMarks: number; noted: string[] };
}

/** Лица линий на нитях в режиме «только линии» (MAP-71; ТЗ § 3.2: «каждое лицо — бусина»). */
const BEADS = true;
/** Сколько лет самое крупное окно видимой части неба (D2; IX-03). */
const MIN_YEARS = 20;
/** Семантическое увеличение: подробность растёт с высотой полосы от DETAIL_KY0 до DETAIL_KY1 (≈ ×1,5 по времени). */
export const DETAIL_KY0 = 4;
export const DETAIL_KY1 = 6;
/** Подробность кадра по высоте полосы: плавная ступень (E3). */
export function detailFor(ky: number): number {
  const u = Math.max(0, Math.min(1, (ky - DETAIL_KY0) / (DETAIL_KY1 - DETAIL_KY0)));
  return u * u * (3 - 2 * u);
}
/**
 * Подробность по двум осям (решение 25; MAP-61). По времени — высота полосы, которая была бы при этом масштабе времени
 * без пропорции полос (J1): следы, связи и даты зависят только от того, сколько лет на экране. По строкам — настоящая
 * высота полосы: знаки и подписи. Звёзды видны, когда подробна хотя бы одна ось (при узких строках и крупном времени
 * они — точки у начала следов), облака — только когда мелки обе.
 */
export interface Detail {
  /** по масштабу времени: следы, связи, даты */
  time: number;
  /** по высоте строки: знаки и подписи */
  rows: number;
  /** звёзды: max(time, rows); облака гаснут с ней */
  stars: number;
}
export function detailOf(cam: Pick<Camera, 'kx' | 'ky' | 'kyWith'>): Detail {
  const time = detailFor(cam.kyWith(cam.kx, 1));
  const rows = detailFor(cam.ky);
  return { time, rows, stars: Math.max(time, rows) };
}
/** На обзоре видны (и ловят указатель) звёзды величины 0–2 (E3, E11). */
export const OVERVIEW_MAG = 2;
/** Облака плотности: светлота до +14 % к небу (MAP-03); при выделении — вдвое слабее (dim.ts, CLOUD_DIMMED). */
const CLOUD_MAX = { night: CLOUD_DIMMED.night * 2, day: CLOUD_DIMMED.day * 2 };
/** Скопление раскрывается в сетку имён, когда столбец сетки шире стольких px: имена в сетке помещаются (E2). */
const CLUSTER_OPEN_PX = 64;

interface OutlineView {
  o: Outline;
  foreign: boolean;
  /** кольца: годы и полосы вершин, мировые x при нынешнем масштабе времени */
  rings: { t: Float64Array; lane: Float64Array; x: Float64Array }[];
  /** ортогональные кольца (VIS-77) по шагу времени и масштабу: вершины — годы, полосы и мировые x */
  ortho?: { key: string; rings: { t: number[]; lane: number[]; x: Float64Array }[] };
  t0: number;
  t1: number;
  l0: number;
  l1: number;
}

interface ClusterView {
  block: number;
  c: ClusterInfo;
  /** середина блока по полосам */
  lane: number;
  laneMin: number;
  laneMax: number;
}

/** Высота строки, на которой контуры созвездий начинают гаснуть и на которой они погашены до 30 % (масштаб семьи). */
const FAMILY_FADE: [number, number] = [10, 14];

/** Поля вписанного рабочего набора, px: слева — у звезды, справа — место для имени, сверху и снизу — как у «всего неба». */
const FIT_SET = { l: 16, r: 110, y: 10 };
/**
 * «Всё небо» в небе «набор»: следы жизни входят в окно, только если удлиняют окно звёзд и точек набора не больше чем
 * на такую долю его ширины; иначе окно — по звёздам, следы уходят за правый край.
 */
export const FIT_TRAIL = 0.35;

export class Sky implements SkyContext {
  /** камера со сжатием полос (J4, J5): вертикаль камеры — строки, src/render/rows.ts */
  cam = new RowCamera();
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  /** сенсорный экран: кегли холста не мельче 12,5 px (B2, MOB-42) */
  coarse = false;
  letterW = LETTER_W;
  pal: Palette;
  model!: ModelData;
  scale!: TimeScale;
  lambda = -1;
  X0 = new Float64Array(0);
  X1 = new Float64Array(0);
  nodes: NodeRow[] = [];
  private nodeIndex = new Map<string, number>();
  readonly labelCache = new LabelCache();
  readonly ledger = new LabelLedger();
  /** прежние контуры притоков — только если в данных нет контуров созвездий (E8) */
  private outlines: { block: number; group: string; foreign: boolean; poly: [number, number][]; size: number }[] = [];
  private outlineViews: OutlineView[] = [];
  private clusters: ClusterView[] = [];
  private epochX: { id: string; x0: number; x1: number; name: string; short: string }[] = [];
  /** облака плотности рождений (E3): растр в мировых x масштаба «по насыщенности» */
  private cloud: { img: HTMLCanvasElement; x0: number; x1: number; strips: number[]; key: string } | null = null;
  /** непрозрачность звезды по узлам в последнем кадре (попадание указателем, клавиатура) */
  private starA = new Float32Array(0);
  /** свёрнутые в этом кадре скопления (номера блоков) */
  private collapsed = new Set<number>();
  /** знаки свёрнутых скоплений кадра: соседние (ближе 16 px) сливаются в один знак с общей подписью */
  private rings: { x: number; y: number; members: ClusterView[] }[] = [];
  /**
   * Поля видимой части неба сверх рамки, px холста: top — нижний край ярусов эпох или рамки, bottom — верх нижнего листа
   * карточки на телефоне, left и right — полосы, занятые вступлением или колонкой кнопок при вписывании «всего неба».
   */
  private insets = { top: FRAME_H, bottom: 0, left: 0, right: 0 };
  /** что показывает небо: режим «Всё небо | В работе», рабочий набор, свёрнутое (J4, J5; src/ui/work.ts) */
  private view: SkyViewIn = { mode: 'all', set: new Set(), foldDesc: [], foldGroups: [] };
  /** план неба по view: скрытые узлы, сжатие полос, знаки свёрнутого (src/render/rows.ts) */
  plan: SkyPlan = { hidden: null, hiddenPersons: new Set(), rows: identityRows(-1, 1), marks: [], mode: 'all' };
  /**
   * Знаки свёрнутого в последнем кадре (px холста): «+N» у подписи лица, строка свёрнутого созвездия, пункты строки
   * «Свёрнуто: … — развернуть» в рамке (kind 'all' — развернуть всё); щелчок разворачивает (src/ui/sky/input.ts).
   */
  foldHits: (Rect & { kind: FoldHitKind; id: string })[] = [];
  /** точки союзов в последнем кадре (px холста; решения 70, 76): щелчок, касание и клавиатура — src/ui/sky */
  plateHits: PlateHit[] = [];
  /** резерв органов неба в последнем кадре: вписанный набор не уходит под них (fitShown) */
  private reserveNow: Rect[] = [];
  /** названия созвездий в последнем кадре (px холста): у них — меню «Свернуть созвездие» (J5) */
  groupHits: (Rect & { group: string })[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.pal = readPalette();
    // кириллица шрифтов догружается при первом употреблении (unicode-range): ширины имён, замеренные до неё, узки —
    // уточнение после имени наезжало бы на имя. Догрузился шрифт — пороги и ширины подписей считаются заново
    const fonts = typeof document !== 'undefined' ? (document as { fonts?: FontFaceSet }).fonts : undefined;
    fonts?.addEventListener?.('loadingdone', () => {
      this.labelCache.invalidate();
      this.cam.onChange();
    });
  }

  resize(w: number, h: number, dpr: number) {
    this.dpr = dpr;
    this.coarse = coarsePointer();
    this.letterW = this.coarse ? LETTER_W_TOUCH : LETTER_W;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // холст следует за областью неба (MOB-44): при сужении окна (поворот телефона 844 → 390, 1440 → 700) ширина в px
    // держала бы область на прежней ширине; размер буфера — по замеру области (SkyView), CSS-размер — вся область
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.cam.w = w;
    this.cam.h = h;
    this.labelCache.invalidate();
    this.updateView();
  }

  /** Поля видимой части (C1, D2): их задаёт SkyView по ярусам, листу карточки, вступлению и органам неба. */
  setInsets(ins: Partial<{ top: number; bottom: number; left: number; right: number }>) {
    const next = { ...this.insets, ...ins };
    if (next.top === this.insets.top && next.bottom === this.insets.bottom && next.left === this.insets.left && next.right === this.insets.right) return false;
    this.insets = next;
    this.updateView();
    return true;
  }
  /** Видимая часть неба в px холста: без рамки, нижней кромки, ярусов, листа карточки и полей вступления. */
  viewport() {
    return this.cam.vp;
  }
  /** Рамка «всего неба»: от сотворения до 100 г. по Р. Х., все полосы. */
  private fitFrame(): Frame {
    // по вертикали — строки: при сжатии полос (J4, J5) «всё небо» — все оставшиеся строки
    const r = this.cam.rows;
    return { x0: this.xOf(this.scale.knots[0]), x1: this.xOf(100), lane0: r.min, lane1: r.max };
  }
  /** Видимая часть, пределы сдвига и масштаб «всего неба» — после смены размера, полей, масштаба времени или модели. */
  private updateView() {
    const cam = this.cam;
    const vp = {
      l: this.letterW + this.insets.left,
      t: Math.max(FRAME_H, this.insets.top),
      r: cam.w - this.insets.right,
      // нижняя кромка рамки (столбцы атласа) — над листом карточки
      b: cam.h - this.insets.bottom - BOTTOM_H,
    };
    if (vp.r - vp.l < 80) vp.l = Math.max(0, vp.r - 80);
    if (vp.b - vp.t < 80) vp.b = Math.min(cam.h, vp.t + 80);
    if (!this.model) {
      cam.setViewport(vp, null, null);
      return;
    }
    const fit = this.fitFrame();
    // пределы сдвига — вся шкала до 2040 г.: полоса времени и «сегодня» (ТЗ § 11.2, п. 7)
    const frame = { ...fit, x1: this.xOf(T_END) };
    cam.setViewport(vp, frame, fit);
    // приближение — не больше ~20 лет на ширину видимой части: у мировой x — по местной плотности шкалы
    cam.kxMaxAt = (x: number) => {
      const t = this.tOf(x);
      const dw = this.xOf(t + MIN_YEARS / 2) - this.xOf(t - MIN_YEARS / 2);
      return dw > 0 ? (vp.r - vp.l) / dw : Infinity;
    };
  }

  setModel(m: ModelData, lambda: number) {
    const modelChanged = m !== this.model;
    if (modelChanged) {
      this.model = m;
      this.scale = hydrateScale(m.scale);
      this.nodes = m.nodes;
      this.nodeIndex = new Map(m.nodes.map((n, i) => [n.id, i]));
      this.X0 = new Float64Array(m.nodes.length);
      this.X1 = new Float64Array(m.nodes.length);
      this.starA = new Float32Array(m.nodes.length).fill(1);
      this.buildOutlines();
      this.clusters = m.blocks
        .filter((b) => b.cluster)
        .map((b) => ({ block: b.id, c: b.cluster!, lane: (b.laneMin + b.laneMax) / 2, laneMin: b.laneMin, laneMax: b.laneMax }));
      this.cloud = null;
      // план неба (набор, свёртка) — по новой раскладке; камера ещё не поставлена, держать нечего
      this.replan(false);
    }
    if (modelChanged || lambda !== this.lambda) {
      this.lambda = lambda;
      for (let i = 0; i < this.nodes.length; i++) {
        this.X0[i] = timeToX(this.scale, this.nodes[i].t0, lambda);
        this.X1[i] = timeToX(this.scale, this.nodes[i].t1, lambda);
      }
      for (const ov of this.outlineViews) for (const r of ov.rings) for (let k = 0; k < r.t.length; k++) r.x[k] = timeToX(this.scale, r.t[k], lambda);
      this.epochX = m.epochs.map((e) => ({ id: e.id, x0: timeToX(this.scale, toAstro(e.start), lambda), x1: timeToX(this.scale, toAstro(e.end), lambda), name: e.name, short: e.short }));
      this.updateView();
    }
  }

  /**
   * Что показывает небо (J4, J5): режим «Всё небо | В работе», рабочий набор, свёрнутое. Строится план (rows.ts), камера
   * переходит на новое сжатие полос, не сдвигая неба: лицо anchor (если оно видно и после смены) остаётся на своём месте
   * экрана, иначе — полоса в середине видимой части. Возвращает, изменилось ли что-нибудь на небе.
   */
  setView(v: SkyViewIn, anchor?: string | null): boolean {
    // места под точки союзов (решения 70, 76): по союзам и полосам раскладки — только в небе «набор»
    const next: SkyViewIn = { ...v, gaps: v.gaps ?? this.gapsFor(v), reveal: v.mode === 'work' && !!v.plates?.length };
    // набор в режиме «Всё небо» на небо не влияет
    const same =
      v.mode === this.view.mode &&
      (v.mode === 'all' || (v.set === this.view.set && gapsKey(next.gaps) === gapsKey(this.view.gaps) && !!next.reveal === !!this.view.reveal)) &&
      v.foldDesc.join() === this.view.foldDesc.join() &&
      v.foldGroups.join() === this.view.foldGroups.join();
    this.view = next;
    if (same || !this.model) return false;
    this.replan(true, anchor);
    return true;
  }
  /** Места под точки союзов (решения 70, 76; plates.ts, plateGaps) для вида v по полосам нынешней раскладки. */
  private gapsFor(v: SkyViewIn) {
    if (v.mode !== 'work' || !this.model || !v.plates?.length) return [];
    const m = this.model;
    return plateGaps(v.plates, (id) => m.nodeByPerson.get(id)?.lane, (id) => v.set.has(id));
  }
  /** Построить план неба по this.view; keep — держать небо на месте (см. setView). */
  private replan(keep: boolean, anchor?: string | null) {
    const m = this.model;
    const old = this.cam.rows;
    // смена модели хронологии меняет полосы раскладки: места под точки союзов — по новым полосам
    if (this.view.plates?.length) this.view = { ...this.view, gaps: this.gapsFor(this.view) };
    const plan = planSky(
      {
        graph, nodes: m.nodes, laneMin: m.laneMin, laneMax: m.laneMax, t0: (i) => m.nodes[i].t0, groupOf: (id) => byId.get(id)?.group,
        parentGroup: (g) => groupById.get(g)?.parent, cluster: (b) => !!m.blocks[b]?.cluster, rank: (i) => byId.get(m.nodes[i].person)?.magnitude ?? 6,
      },
      this.view,
    );
    let hold: { lane: number; sy: number } | null = null;
    if (keep && this.cam.w > 0) {
      const i = anchor ? this.nodeIndex.get(anchor) : undefined;
      const [, cy] = this.cam.vpCenter();
      if (i !== undefined && !plan.hidden?.[i] && !this.plan.hidden?.[i]) hold = { lane: this.nodes[i].lane, sy: this.cam.sy(this.nodes[i].lane) };
      else hold = { lane: old.lane(this.cam.wLane(cy)), sy: cy };
    }
    this.plan = plan;
    this.cam.rows = plan.rows;
    // полос в сжатом небе — строк: от неё зависит самая низкая полоса (Camera.kyMin)
    this.cam.laneSpan = plan.rows.max - plan.rows.min - 1;
    this.labelCache.invalidate();
    if (this.scale && this.lambda >= 0) this.updateView();
    if (hold) this.cam.laneTop = plan.rows.row(hold.lane) + hold.sy / this.cam.ky;
  }
  get rowsKey(): string {
    return this.cam.rows.key;
  }
  rowOf(lane: number): number {
    return this.cam.rows.row(lane);
  }
  laneOf(row: number): number {
    return this.cam.rows.lane(row);
  }
  hides(id: string): boolean {
    return this.plan.hiddenPersons.has(id);
  }
  /** Полосы эпох включены в этом кадре: фон под подписью — их цвет (fillGround). */
  private bandsOn = false;
  fillGround(x0: number, x1: number, y: number, h: number) {
    const { ctx, cam, pal } = this;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.sky;
    ctx.fillRect(x0, y, x1 - x0, h);
    if (this.bandsOn) {
      ctx.fillStyle = pal.band;
      this.epochX.forEach((e, k) => {
        if (k % 2 !== 1) return;
        const a = Math.max(x0, cam.sx(e.x0));
        const b = Math.min(x1, cam.sx(e.x1));
        if (b > a) ctx.fillRect(a, y, b - a, h);
      });
    }
    ctx.restore();
  }

  xOf(t: number): number {
    return timeToX(this.scale, t, this.lambda);
  }
  tOf(x: number): number {
    return xToTime(this.scale, x, this.lambda);
  }
  indexOf(id: string): number | undefined {
    return this.nodeIndex.get(id);
  }
  node(id: string): NodeRow | undefined {
    const i = this.nodeIndex.get(id);
    return i === undefined ? undefined : this.nodes[i];
  }
  nodeX(id: string): number | null {
    const i = this.nodeIndex.get(id);
    return i === undefined ? null : this.X0[i];
  }

  /** Вид «всё небо»: сотворение … 100 г. по Р. Х. и все полосы — в видимой части по обеим осям (D2; MAP-01, MOB-01). */
  fitState(): ViewState {
    // в режиме «В работе» «Всё небо» вписывает рабочий набор (J4)
    if (this.plan.mode === 'work') {
      const v = this.fitShown(false);
      if (v) return v;
    }
    return this.cam.fitView(this.fitFrame());
  }
  /**
   * Вид, в который вписан рабочий набор вместе со всеми следами жизни (прежнее «всё небо» набора): по нему — предел
   * отдаления в небе «набор» (src/ui/sky/view.ts, updateZoomFloor), чтобы долгий след можно было увидеть целиком.
   */
  fitWideState(): ViewState {
    return (this.plan.mode === 'work' && this.fitShown(true)) || this.cam.fitView(this.fitFrame());
  }
  /**
   * Вид, в который вписано то, что раскрыто в небе «набор» (J4; решение 76): по времени — звёзды набора и точки их
   * союзов, не уже 60 лет, справа — место для имени; следы жизни — только если они удлиняют окно не больше чем на треть
   * (FIT_TRAIL): иначе долгий след (Адам — 930 лет) прижал бы раскрытое родословие к левому краю; trails — со всеми
   * следами (предел отдаления, fitWideState). По высоте — все строки в видимой части (высота строки следует за
   * масштабом: если строки не помещаются, масштаб уменьшается, пока не поместятся).
   */
  private fitShown(trails: boolean): ViewState | null {
    const hid = this.plan.hidden;
    let x0 = Infinity;
    let xs = -Infinity;
    let xt = -Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (hid && hid[i]) continue;
      x0 = Math.min(x0, this.X0[i]);
      xs = Math.max(xs, this.X0[i]);
      xt = Math.max(xt, this.X1[i]);
    }
    if (!(xs >= x0)) return null;
    // точки союзов — правее звёзд супругов и левее первого ребёнка, но союз родителей у ребёнка и брак без детей на небе
    // могут выйти за звёзды
    const has = (id: string | null | undefined) => {
      const i = id ? this.nodeIndex.get(id) : undefined;
      return i !== undefined && !(hid && hid[i]);
    };
    for (const pl of this.view.plates ?? []) {
      const u = pl.union;
      if (![u.a, u.b, ...u.kids].some(has)) continue;
      const t = dotTime(this.model, u);
      if (t === null) continue;
      const x = this.xOf(t);
      x0 = Math.min(x0, x);
      xs = Math.max(xs, x);
    }
    const tm0 = this.tOf((x0 + xs) / 2);
    const span0 = Math.max(xs - x0, this.xOf(tm0 + 30) - this.xOf(tm0 - 30));
    // следы — целиком, если помещаются в прибавку FIT_TRAIL; иначе окно — по звёздам и точкам (следы уходят за край)
    const x1 = trails || xt <= xs + FIT_TRAIL * span0 ? Math.max(xs, xt) : xs;
    const cam = this.cam;
    const vp = cam.vp;
    const W = Math.max(40, vp.r - vp.l - FIT_SET.l - FIT_SET.r);
    // по вертикали — без широких органов неба у верхнего и нижнего края: строки набора не уходят под них (как у view.ts)
    let top = vp.t;
    let bottom = vp.b;
    for (const r of this.reserveNow) {
      if (r.w < (vp.r - vp.l) * 0.3) continue;
      if (r.y + r.h >= vp.b - 8 && r.y > (vp.t + vp.b) / 2) bottom = Math.min(bottom, r.y - 4);
      else if (r.y <= vp.t + 8 && r.y + r.h < (vp.t + vp.b) / 2) top = Math.max(top, r.y + r.h + 4);
    }
    const tm = this.tOf((x0 + x1) / 2);
    const span = Math.max(x1 - x0, this.xOf(tm + 30) - this.xOf(tm - 30));
    const xc = (x0 + x1) / 2;
    const R = cam.rows.max - cam.rows.min;
    /** Масштаб, при котором строки помещаются между t и b; null — не помещаются ни при каком. */
    const fitIn = (t: number, b: number): number | null => {
      const H = Math.max(40, b - t - 2 * FIT_SET.y);
      const tall = (k: number) => cam.kyFor(k) * R > H + 0.5;
      const k0 = cam.clampKx(W / span, xc);
      if (!tall(k0)) return k0;
      let lo = cam.kxLo();
      if (tall(lo)) return null;
      let hi = k0;
      for (let k = 0; k < 40; k++) {
        const mid = Math.sqrt(lo * hi);
        if (tall(mid)) hi = mid;
        else lo = mid;
      }
      return lo;
    };
    let kx = fitIn(top, bottom);
    // над органами неба строкам не хватает места: вся высота видимой части, как у «всего неба»
    if (kx === null) {
      top = vp.t;
      bottom = vp.b;
      kx = fitIn(top, bottom) ?? cam.kxLo();
    }
    const cy = (top + bottom) / 2;
    return { x0: xc - (vp.l + FIT_SET.l + W / 2) / kx, kx, laneTop: (cam.rows.min + cam.rows.max) / 2 + cy / cam.kyFor(kx) };
  }
  fitAll() {
    this.cam.stop();
    this.cam.set(this.fitState());
  }
  /** Камера на «всём небе» (с точностью до пикселя). */
  atFit(): boolean {
    return !!this.model && this.cam.near(this.fitState());
  }

  /**
   * Контуры созвездий (E8): сглаженные кольца из раскладки (engine/layout.ts, computeOutlines) — годы и полосы вершин;
   * мировые x пересчитываются при смене масштаба времени. Если в данных контуров нет — прежние контуры притоков.
   */
  private buildOutlines() {
    this.outlineViews = [];
    this.outlines = [];
    const data = this.model.outlines ?? [];
    if (data.length) {
      for (const o of data) {
        let t0 = Infinity, t1 = -Infinity, l0 = Infinity, l1 = -Infinity;
        const rings = o.rings.map((ring) => {
          const t = new Float64Array(ring.length);
          const lane = new Float64Array(ring.length);
          ring.forEach(([yr, ln], k) => {
            t[k] = yr;
            lane[k] = ln;
            t0 = Math.min(t0, yr);
            t1 = Math.max(t1, yr);
            l0 = Math.min(l0, ln);
            l1 = Math.max(l1, ln);
          });
          return { t, lane, x: new Float64Array(ring.length) };
        });
        this.outlineViews.push({ o, foreign: !!groupById.get(o.group)?.foreign, rings, t0, t1, l0, l1 });
      }
      return;
    }
    const byBlock = new Map<number, NodeRow[]>();
    for (const n of this.model.nodes) {
      if (n.block < 0) continue;
      const a = byBlock.get(n.block);
      if (a) a.push(n);
      else byBlock.set(n.block, [n]);
    }
    for (const b of this.model.blocks) {
      if (b.cluster) continue;
      const ns = byBlock.get(b.id) ?? [];
      if (ns.length < 5) continue;
      const rows = new Map<number, [number, number]>();
      for (const n of ns) {
        const r = rows.get(n.lane);
        if (r) rows.set(n.lane, [Math.min(r[0], n.t0), Math.max(r[1], n.t1)]);
        else rows.set(n.lane, [n.t0, n.t1]);
      }
      const lanes = [...rows.keys()].sort((a, c) => a - c);
      for (let l = lanes[0]; l <= lanes[lanes.length - 1]; l++) {
        if (rows.has(l)) continue;
        let lo = l - 1;
        while (!rows.has(lo)) lo--;
        let hi = l + 1;
        while (!rows.has(hi)) hi++;
        rows.set(l, [Math.min(rows.get(lo)![0], rows.get(hi)![0]), Math.max(rows.get(lo)![1], rows.get(hi)![1])]);
      }
      const all = [...rows.keys()].sort((a, c) => c - a);
      const poly: [number, number][] = [];
      for (const l of all) poly.push([rows.get(l)![1] + 6, l + 0.5], [rows.get(l)![1] + 6, l - 0.5]);
      for (const l of [...all].reverse()) poly.push([rows.get(l)![0] - 6, l - 0.5], [rows.get(l)![0] - 6, l + 0.5]);
      this.outlines.push({ block: b.id, group: b.group, foreign: !!groupById.get(b.group)?.foreign, poly, size: ns.length });
    }
  }

  // ---------- попадание ----------
  /** Что нарисовано в последнем кадре и потому ловит указатель: в режиме «только линии» — лица линий Мессии. */
  private drawnOnly: Set<string> | null = null;
  private drawnGhosts = true;
  /** Верх открытого неба (px): ниже линейки годов и служебной строки, а в режиме эпох — ниже ярусов (их рисует tiers.ts). */
  openTop = FRAME_H;

  drawn(i: number): boolean {
    const n = this.nodes[i];
    // рабочий набор и свёрнутое (J4, J5): скрытое не рисуется и не ловит указатель
    const hid = this.plan.hidden;
    if (hid && hid[i]) return false;
    if (this.drawnOnly && !this.drawnOnly.has(n.person)) return false;
    return !(n.ghost && !this.drawnGhosts);
  }

  /**
   * Звезда нарисована в полную силу и ловит указатель: на обзоре — величины 0–2 и выделенные, мелкие — по мере
   * проявления (E3, E11; IX-07); лица свёрнутых скоплений — нет.
   */
  private pointable(i: number): boolean {
    return (this.starA[i] ?? 1) >= 0.5;
  }

  /** Звезда нарисована и лежит в открытой части неба — её можно навести, щёлкнуть и выбрать с клавиатуры. */
  reachable(i: number | string): boolean {
    if (typeof i === 'string') {
      const k = this.nodeIndex.get(i);
      if (k === undefined) return false;
      i = k;
    }
    if (!this.drawn(i) || !this.pointable(i)) return false;
    const x = this.cam.sx(this.X0[i]);
    const y = this.cam.sy(this.nodes[i].lane);
    return x > this.letterW && x < this.cam.w && y > this.openTop && y < this.cam.vp.b;
  }

  hit(sx: number, sy: number, radius = 12): string | null {
    const cam = this.cam;
    // линейка, левая и нижняя кромки и ярусы эпох закрывают звёзды под собой
    if (sy < this.openTop || sx < this.letterW || sy > cam.vp.b) return null;
    let best: string | null = null;
    let bestD = radius * radius;
    const ky = cam.ky;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(n.lane);
      if (Math.abs(y - sy) > radius + ky) continue;
      if (y < this.openTop || !this.drawn(i) || !this.pointable(i)) continue;
      const dx = x - sx;
      const dy = y - sy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = n.person;
      }
    }
    if (best) return best;
    // след жизни под указателем
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const y = cam.sy(n.lane);
      if (Math.abs(y - sy) > Math.max(3, ky * 0.35)) continue;
      if (!this.drawn(i) || !this.pointable(i)) continue;
      if (sx >= cam.sx(this.X0[i]) && sx <= cam.sx(this.X1[i])) return n.person;
    }
    return null;
  }

  /** Где стоит флажок меридиана (px холста) — для проверок. */
  meridianFlag: Rect | null = null;
  /** Указатели на выбранных за краем экрана («→ Давид»): по щелчку — перелёт. */
  edgeHits: EdgeHit[] = [];

  /** Замер подписей последнего кадра: прямоугольники и число пересекающихся пар (labels.ts). */
  labelStats(): LabelStats & { stars: number; named: number } {
    return { ...measureLabels(this.ledger.boxes), stars: this.ledger.stars, named: this.ledger.named };
  }

  // ---------- кадр ----------
  /**
   * Кадр неба. under — то, что лежит поверх звёзд, но под меридианом, рамкой и указателями у края: ярусы эпох
   * (src/render/tiers.ts; их рисует SkyView). Меридиан проходит и через ярусы, указатели у края не уходят под них.
   */
  draw(s: SkyState, under?: () => void) {
    const { ctx, cam, pal } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, cam.w, cam.h);
    const hl = s.highlight;
    const L = s.layers;
    const lineOnly = s.onlyLines;
    this.reserveNow = s.reserve ?? [];
    const spine = new Set([...lines.joseph.persons, ...lines.mary.persons].map((x) => x.id));
    this.drawnOnly = lineOnly ? spine : null;
    // узлы кадра — по раскладке; в режиме «только линии» лица линий стоят на нитях, как бусины (MAP-71)
    this.nodes = this.model.nodes;
    if (lineOnly && L.ribbons && BEADS) this.nodes = beadNodes(this, this.model.nodes, ribbonBeads(this, s, { joseph: lines.joseph.persons, mary: lines.mary.persons }));
    this.drawnGhosts = !!L.ghosts;
    // открытое небо — ниже рамки, а в режиме эпох — ниже ярусов (их нижний край — верхнее поле видимой части)
    this.openTop = Math.max(FRAME_H, this.insets.top);
    this.ledger.reset();
    // режим «В работе» (J4): только лица набора — все звёзды, следы и связи в полную силу, без облаков, контуров и скоплений
    const work = this.plan.mode === 'work';
    const dd = work ? { time: 1, rows: 1, stars: 1 } : detailOf(cam);
    const detail = dd.time;
    if (work) {
      this.collapsed.clear();
      this.rings = [];
    } else this.markClusters(dd.stars);
    this.fillStarAlpha(s, spine, dd.stars);
    const starA = this.starA;
    const p: Pass = {
      s,
      vis: [],
      emph: familyDim(this, work ? floorAt(emphasis(hl, s.depth), WORK_DIM) : emphasis(hl, s.depth)),
      spine,
      level: Math.max(0, 2 * Math.log2(cam.kx / KX_MIN)),
      zoomScale: zoomScaleFor(cam.ky),
      detail,
      rowDetail: dd.rows,
      starDetail: dd.stars,
      starAlpha: (i) => starA[i] ?? 0,
      starShown: (i) => this.starShown(s, i),
      starsDrawn: new Set(),
      reserve: s.reserve,
      placer: new Placer(),
      labeled: new Set(),
      nameBoxes: [],
      ribbonBoxes: [],
      work,
      lines: new Placer(),
      shown: { breaks: new Set(), brackets: new Set(), workMarks: 0, noted: [] },
    };
    for (const r of s.reserve ?? []) p.placer.add(r);

    this.bandsOn = !!L.epochs;
    if (L.epochs) this.drawEpochBands();
    drawTimeMarks(this);
    const events = drawEventLines(this);
    const ticks = yearTicks(this);
    drawGrid(this, ticks);
    if (!lineOnly && !work) this.drawClouds(dd.stars, !!hl);
    const constellations = L.constellations && !lineOnly && !work;
    const spots = constellations ? this.drawConstellations(p) : [];
    p.vis = this.visible(p);
    if (!lineOnly && !work) this.drawClusters(p);
    // следы и связи проявляются с подробностью кадра; выделенные — всегда в полную силу
    const lit = (i: number) => lineOnly || (!!hl && hl.has(this.nodes[i].person)) || s.pins.has(this.nodes[i].person);
    const layer = (draw: (q: Pass) => void) => {
      if (detail >= 0.99) return draw(p);
      const faint = p.vis.filter((i) => !lit(i));
      const full = p.vis.filter(lit);
      if (detail > 0.01 && faint.length) {
        ctx.globalAlpha = detail;
        draw({ ...p, vis: faint });
        ctx.globalAlpha = 1;
      }
      if (full.length) draw({ ...p, vis: full });
    };
    if (L.lifelines) layer((q) => drawTrails(this, q));
    // промежутки рождения у лиц, чей знак стоит у первого засвидетельствованного года (решение 38; MAP-69)
    if (L.lifelines) layer((q) => this.drawBirthBands(q));
    const notes: FamilyNote[] = [];
    // союзы неба «набор» (решение 76): точки и линии к супругам и детям; у их детей нет прежних отводов и знаков брака
    const unionPlates = work && s.plates?.length && !lineOnly ? s.plates : null;
    if (unionPlates) {
      const links = unionLinks(this, unionPlates);
      p.unionKids = links.kids;
      p.unionPairs = links.pairs;
    }
    if (L.connectors) layer((q) => void notes.push(...(drawDescents(this, q) ?? [])));
    // в режиме «В работе» ленты — тонкий ориентир, и только если в наборе есть лица линий Мессии (J4)
    const ribbons = L.ribbons && (!work || [...spine].some((id) => !this.plan.hiddenPersons.has(id)));
    if (ribbons) {
      drawSkyRibbons(this, work ? { ...s, guide: true } : s, { joseph: lines.joseph.persons, mary: lines.mary.persons });
      p.offRibbon = (b) => clearOfRibbons(this, b);
    }
    if (L.lifelines && L.ribbons) drawSpineTrails(this, p);
    // точки союзов — места до звёзд и подписей: они обходят звёзды и ленты, подписи обходят их; линии — под звёздами
    const dots = unionPlates ? layoutUnionDots(this, p, unionPlates, s.plateMarks ?? {}) : null;
    const unionLog = dots && L.connectors ? drawUnionLines(this, p, dots, s.plateMarks ?? {}) : [];
    // путь родства — под звёздами: звёзды пути лежат на ломаной (E5)
    drawKinPath(this, p);
    this.drawStars(p);
    drawWorkMarks(this, p);
    this.plateHits = dots ? drawUnionDots(this, p, dots, s.plateMarks ?? {}) : [];

    // подписи: одна проверка наложений на всё, что пишется на небе (E1)
    for (const i of p.vis) {
      const a = starA[i];
      if (a <= 0.5 || !this.drawn(i)) continue;
      const q = byId.get(this.nodes[i].person)!;
      const r = starRadius(q.magnitude, p.zoomScale) + 1.5;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      const k = q.roles.includes('king') || q.roles.includes('queen') ? 4 : 0;
      p.placer.add({ x: x - r, y: y - r - k, w: 2 * r, h: 2 * r + k }, true, q.magnitude);
    }
    // знаки свёрнутых скоплений — как звёзды величины 2: подпись их не закрывает
    if (!lineOnly) for (const g of this.rings) p.placer.add({ x: g.x - 7, y: g.y - 7, w: 14, h: 14 }, true, 2);
    if (ribbons) p.ribbonBoxes = this.ribbonBoxes();
    // одноимённые в окне (MAP-66) и свёрнутые потомки (MAP-63, UX-60): их подписям положено уточнение и «+N»
    p.namesakes = namesakesInView(this, p);
    p.foldText = new Map(this.plan.marks.filter((m) => m.kind === 'desc').map((m) => [m.id, `+${m.count}`]));
    // небо «набор»: «+» у лица с нераскрытыми союзами, пока его карточки союзов не показаны (решение 70); в режиме
    // «только линии» точек союзов нет (unionPlates), и «+» был бы мёртвой ссылкой (этап 11, B1)
    if (work && !lineOnly && s.reveal?.size) p.revealText = new Map([...s.reveal].map((id) => [id, '+']));
    p.foldHits = [];
    // имя и формула выбранного лица под ярусами эпох (их пишет tiers.ts поверх неба, после подписей) — в общей проверке
    // наложений, первыми (MOB-60): место берётся из прошлого кадра ярусов (canvas.dataset.tiers.formula.rect)
    if (under && s.selected && L.labels) {
      const t = tierFormulaRect(this.canvas);
      if (t) {
        p.placer.add(t.rect);
        this.ledger.add('note', t.text, t.rect, s.selected);
      }
    }
    const edges = placeWayfinding(this, s, p);
    const lineSteps = { joseph: lines.joseph.persons, mary: lines.mary.persons };
    // подписи шагов пути родства (E5), выноски точек сравнения и подписи лиц линий (E6) — раньше обычных подписей
    drawLeadNotes(this, p, lineSteps);
    // знак свёрнутого созвездия — раньше всех подписей звёзд: он вытесняет соседей (решение 30)
    if (L.labels) this.drawFoldMarks(p, 'group');
    const between = () => {
      // «+N» потомков, не вставший в подпись лица (J5), — раньше меридианов событий и обычных подписей
      if (!L.labels) this.drawFoldMarks(p, 'group');
      this.drawFoldMarks(p, 'desc');
      // подписи лент «через Соломона (Мф 1)» — важнее подписей звёзд величины 2–6 (UX-45)
      if (ribbons && !lineOnly && L.labels) drawBranchLabels(this, p, lineSteps);
      for (const { x, e } of events) drawEventLabel(this, p, x, e.full, e.name);
      if (!lineOnly && !work) this.clusterLabels(p);
      const xc = Math.max(this.letterW + 40, cam.sx(this.xOf(110)));
      if (cam.w - xc > 380) drawNote(this, p, CANON_NOTE, (xc + cam.w) / 2, (cam.vp.t + cam.vp.b) / 2, xc);
      if (constellations) p.nameBoxes = drawGroupNames(this, p, spots);
    };
    if (L.labels) drawStarLabels(this, p, between);
    else between();
    this.groupHits = p.nameBoxes as (Rect & { group: string })[];
    this.drawDaggers(p);
    drawFamilyNotes(this, p, notes);
    // шаг наведённой ленты объясняет подсказка («Давид, отец; Соломон, сын (Мф 1:6)», src/ui/sky/Tip.tsx; решение 54):
    // подписи шага на холсте нет — две надписи об одном сразу не нужны. Лента по-прежнему подсвечивается с током света
    drawRings(this, p);

    under?.();
    // флажок меридиана — место на служебной строке до рамки: её надписи его обходят (MAP-33)
    const flag = meridianFlagAt(this, s);
    const cmds = drawFrame(this, ticks, { model: s.modelNote, folds: this.plan.marks, flag });
    this.foldHits = [...(p.foldHits ?? []), ...cmds];
    this.meridianFlag = drawMeridian(this, s, flag);
    paintWayfinding(this, edges);
    this.edgeHits = edges;
    // замер на холсте для проверок этапа 4: «подписано / видимых звёзд» (E1), подробность кадра (E3),
    // знаков свёрнутых скоплений / скоплений (E2)
    const ds = (this.canvas as { dataset?: DOMStringMap }).dataset;
    if (ds) {
      const put = (k: string, v: string) => ds[k] !== v && (ds[k] = v);
      put('named', `${this.ledger.named}/${this.ledger.stars}`);
      // подробность звёзд (облака гаснут с ней) и по осям: «время строки» (решение 25)
      put('detail', dd.stars.toFixed(2));
      put('detailAxes', `${dd.time.toFixed(2)} ${dd.rows.toFixed(2)}`);
      put('clusters', `${this.rings.length}/${this.clusters.length}`);
      // рабочий набор и свёртка (J4, J5): режим, строк на небе, знаки свёрнутого «вид:id:скрыто» и какие из них на экране
      put('mode', this.plan.mode);
      put('unnamed', this.ledger.unnamed.join(' '));
      put('rows', String(Math.round(this.cam.rows.max - this.cam.rows.min)));
      put('folds', this.plan.marks.map((m) => `${m.kind}:${m.id}:${m.count}`).join(';'));
      put('foldHits', this.foldHits.map((h) => `${h.kind}:${h.id}:${[h.x, h.y, h.w, h.h].map(Math.round).join(',')}`).join(';'));
      // точки союзов (решения 70, 76): «союз:раскрыт (1/0):x,y,w,h» — поле попадания, для проверок приёмки
      // tools/accept/reveal4.ts; центры ромбов и «+N» — canvas[data-dots], линии — canvas[data-union-lines] (plates.ts)
      put('plates', this.plateHits.map((h) => `${h.uid}:${h.open ? 1 : 0}:${[h.x, h.y, h.w, h.h].map(Math.round).join(',')}`).join(';'));
      // «союз:раскрыт (1/0):x,y (центр ромба):скрыто лиц» и линии «союз=супруг», «союз>ребёнок:#цвет» (tools/accept/dots6.ts)
      put('dots', this.plateHits.map((h) => `${h.uid}:${h.open ? 1 : 0}:${Math.round(h.cx)},${Math.round(h.cy)}:${h.hidden}`).join(';'));
      put('unionLines', unionLog.join(';'));
      // этап 7 (K5), для проверок приёмки tools/accept/skydraw.ts: подписанные лица, пометы и названия (текст), служебная
      // строка, разрывы «//», скобки «время не установлено», метки набора
      const boxes = this.ledger.boxes;
      put('labelIds', boxes.filter((b) => b.kind === 'star').map((b) => b.id).join(' '));
      // этап 11 (B1), для проверок tools/accept/bugs7.ts и tools/_bugs-chaos.ts: лица, чья подпись (имя или номер у бусины)
      // есть в кадре, а звезды нет, — «лицо» через пробел; пусто — у каждой подписи лица нарисована его звезда
      put('bare', bareLabels(boxes, (id) => this.nodeIndex.get(id), p.starsDrawn).join(' '));
      // лента не обрывается между соседними видимыми лицами линии и идёт у их звёзд (ribbons.ts, ribbonCheck); пусто — да
      put('ribbonGaps', ribbons ? ribbonCheck(this, p, lineSteps).join(' ') : '');
      // подписи за краем холста — «вид:текст»; пусто — ни одна подпись не срезана краем
      put('out', boxes.filter((b) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > cam.w + 0.5 || b.y + b.h > cam.h + 0.5).map((b) => `${b.kind}:${b.text}`).join('|'));
      // размер кадра и цвет неба, которыми он нарисован: после смены ширины и темы — новые (tools/_bugs-chaos.ts)
      put('size', `${Math.round(cam.w)}x${Math.round(cam.h)}`);
      put('pal', pal.sky);
      // шаги пути родства, нарисованные на небе, — «от>к» (marks.ts, kinRoutes): только между нарисованными звёздами
      put('kinRoutes', s.kinSteps?.length ? kinRoutes(this, s.kinSteps).map((r) => `${r.st.from}>${r.st.to}`).join(' ') : '');
      put('notes', boxes.filter((b) => b.kind === 'note' || b.kind === 'mark' || b.kind === 'group' || b.kind === 'fold').map((b) => b.text.replace(/\u00a0/g, ' ')).join('|'));
      // звёзды неба «набор» в этом кадре (решение 76; tools/accept/polish6.ts): «лицо:x,y» — список неба для клавиатуры
      // (SkyA11y) обновляется, только когда небо постоит, а проверке нужен кадр сразу после сдвига
      put('stars', this.plan.mode === 'work' ? p.vis.filter((i) => this.drawn(i) && !this.nodes[i].ghost).slice(0, 240).map((i) => `${this.nodes[i].person}:${Math.round(cam.sx(this.X0[i]))},${Math.round(cam.sy(this.nodes[i].lane))}`).join(';') : '');
      // места помет семей в небе «набор» (решение 76; tools/accept/polish6.ts): «x,y,w,h» — помета не на линиях к детям
      put('noteBoxes', this.plan.mode === 'work' ? boxes.filter((b) => b.kind === 'note').map((b) => [b.x, b.y, b.w, b.h].map(Math.round).join(',')).join(';') : '');
      put('service', boxes.filter((b) => b.kind === 'frame' && b.y >= RULER_H - 1 && b.y + b.h <= FRAME_H + 1).map((b) => b.text.replace(/\u00a0/g, ' ')).join('|'));
      put('breaks', [...(p.shown?.breaks ?? [])].sort().join(' '));
      put('brackets', [...(p.shown?.brackets ?? [])].sort().join(' '));
      put('workMarks', String(p.shown?.workMarks ?? 0));
      put('noted', (p.shown?.noted ?? []).join('|'));
      // названия созвездий (MAP-58): области видимой частью не меньше 150 × 60 px — «группа:ш×в:подписана (1/0)»
      put('groupAreas', groupAreas(this, spots, p.nameBoxes as (Rect & { group: string })[]).map((a) => `${a.group}:${a.w}×${a.h}:${a.named}`).join('|'));
    }
  }

  /**
   * Знаки свёрнутого (J5; MAP-63, UX-51, UX-60), кроме «+N», вставшего в подпись лица (labels.ts, putLabel):
   *  — потомки: лицо на экране, а его подписи места не нашлось — «+N» у звезды; звезда за левым краем, а след виден —
   *    «‹ Давид +62» у левого поля; лица нет в окне — только строка «Свёрнуто: …» в рамке (frame.ts);
   *  — созвездие: строка-подпись «НАЗВАНИЕ +N» в его строке, у начала его лет или «прилипнув» к левому полю, в каждом
   *    окне, куда приходятся его годы.
   * Подчёркнуты, как ссылки неба: щелчок разворачивает (src/ui/sky/input.ts, foldHits). Та же проверка наложений, что подписи.
   */
  private drawFoldMarks(p: Pass, kind: FoldMark['kind']) {
    const { ctx, cam, pal } = this;
    const size = mapSize(T_MAP_S, this.coarse);
    const hitsOut = p.foldHits ?? [];
    for (const m of this.plan.marks) {
      if (m.kind !== kind) continue;
      const count = `+${m.count}`;
      let name = '';
      let lead = '';
      let x: number;
      let y: number;
      if (m.kind === 'desc') {
        if (hitsOut.some((h) => h.kind === 'desc' && h.id === m.id)) continue;
        const i = this.nodeIndex.get(m.id);
        if (i === undefined || !this.drawn(i)) continue;
        const q = byId.get(m.id);
        const x0 = cam.sx(this.X0[i]);
        y = cam.sy(this.nodes[i].lane);
        if (y < this.openTop || y > cam.vp.b) continue;
        if (x0 >= cam.vp.l) {
          if (x0 > cam.w) continue;
          x = x0 + starRadius(q?.magnitude ?? 6, p.zoomScale) + 5;
        } else {
          // звезда за левым краем, след в окне: имя у левого поля, как «липкие» имена следов
          if (cam.sx(this.X1[i]) < cam.vp.l + 20) continue;
          x = cam.vp.l + 4;
          lead = `‹ ${q?.name ?? m.id} `;
        }
      } else {
        // годы созвездия не приходятся на окно — знака нет
        if (m.t1 !== undefined && cam.sx(this.xOf(m.t1)) < cam.vp.l) continue;
        name = groupName(m.id);
        x = Math.max(this.letterW + 8, cam.sx(this.xOf(m.t0 ?? 0)));
        y = cam.sy(m.lane ?? 0);
        // строка свёрнутого созвездия выше или ниже окна — знак у левого края со стрелкой к ней (MAP-63)
        if (y < this.openTop + size) {
          y = this.openTop + size;
          lead = '↑ ';
        } else if (y > cam.vp.b - size) {
          y = cam.vp.b - size;
          lead = '↓ ';
        }
      }
      const leadFont = mapFont(T_MAP_S, { italic: true, coarse: this.coarse });
      ctx.font = leadFont;
      const lw = lead ? ctx.measureText(lead).width : 0;
      const { nw, cw } = foldMarkWidth(ctx, this.coarse, name, count);
      const w = lw + nw + cw;
      const base = y + size * 0.35;
      // у строки и чуть выше или ниже; у свёрнутого созвездия — и дальше вдоль левого поля
      const cands: Rect[] = [];
      for (const dx of name ? [0, 40, 80, 160] : [0])
        for (const dy of [0, -size - 2, size + 2, -2 * size - 4, 2 * size + 4]) cands.push(textBox(x + dx, base + dy, w, size));
      const got = claim(this, p, cands, 'fold', name ? `${name} ${count}` : `${lead}${count}`, { id: m.id });
      if (!got) continue;
      const bx = got.x + 1.5;
      const by = got.y + 1.5 + 0.8 * size;
      if (lead) {
        ctx.font = leadFont;
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.strokeText(lead, bx, by);
        ctx.fillStyle = pal.ink2;
        ctx.fillText(lead, bx, by);
      }
      drawFoldMark(ctx, pal, this.coarse, bx + lw, by, name, count);
      hitsOut.push({ ...got, kind: m.kind, id: m.id });
    }
  }

  /** Полосы лент на экране: между соседними лицами каждой линии — прямоугольник с полем 4 px. */
  private ribbonBoxes(): Rect[] {
    const cam = this.cam;
    const out: Rect[] = [];
    for (const line of [lines.joseph.persons, lines.mary.persons]) {
      let prev: [number, number] | null = null;
      for (const st of line) {
        const i = this.nodeIndex.get(st.id);
        if (i === undefined) continue;
        const pt: [number, number] = [cam.sx(this.X0[i]), cam.sy(this.nodes[i].lane)];
        if (prev && Math.max(prev[0], pt[0]) > 0 && Math.min(prev[0], pt[0]) < cam.w) {
          const x0 = Math.min(prev[0], pt[0]);
          const y0 = Math.min(prev[1], pt[1]);
          out.push({ x: x0 - 2, y: y0 - 5, w: Math.abs(pt[0] - prev[0]) + 4, h: Math.abs(pt[1] - prev[1]) + 10 });
        }
        prev = pt;
      }
    }
    return out;
  }

  /**
   * Свёрнутые скопления этого кадра: на обзоре и пока столбец сетки уже CLUSTER_OPEN_PX (E2). Знаки соседних скоплений
   * (списки одного царствования стоят рядом) сливаются: один знак, подпись самого большого списка и «и ещё N».
   */
  private markClusters(detail: number) {
    this.collapsed.clear();
    const cam = this.cam;
    const pts: { x: number; y: number; c: ClusterView }[] = [];
    for (const c of this.clusters) {
      const px = c.c.pitch * rateAt(this, c.c.tc);
      if (px >= CLUSTER_OPEN_PX && detail >= 0.5) continue;
      this.collapsed.add(c.block);
      pts.push({ x: cam.sx(this.xOf(c.c.tc)), y: cam.sy(c.lane), c });
    }
    pts.sort((a, b) => a.y - b.y);
    this.rings = [];
    for (const q of pts) {
      const g = this.rings.find((r) => Math.abs(r.x - q.x) < 16 && r.members.some((m) => Math.abs(cam.sy(m.lane) - q.y) < 16));
      if (!g) {
        this.rings.push({ x: q.x, y: q.y, members: [q.c] });
        continue;
      }
      g.members.push(q.c);
      g.x = g.members.reduce((a, m) => a + cam.sx(this.xOf(m.c.tc)), 0) / g.members.length;
      g.y = g.members.reduce((a, m) => a + cam.sy(m.lane), 0) / g.members.length;
    }
  }

  /** Непрозрачность звёзд этого кадра (E3): выделенные и лица линий в режиме «только линии» — 1, величины 0–2 — 1, мелкие — по подробности. */
  private fillStarAlpha(s: SkyState, spine: Set<string>, detail: number) {
    const hl = s.highlight;
    const A = this.starA;
    const hid = this.plan.hidden;
    const work = this.plan.mode === 'work';
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      // скрытое набором или свёрткой не рисуется; лица набора в режиме «В работе» видны все (J4, J5)
      if (hid) {
        if (hid[i]) {
          A[i] = 0;
          continue;
        }
        if (work) {
          A[i] = 1;
          continue;
        }
      }
      const q = byId.get(n.person);
      const k = hl?.get(n.person);
      // лицо свёрнутого скопления видно отдельно, только если это выбранное лицо, путь родства или отметка поиска
      if (n.block >= 0 && this.collapsed.has(n.block)) A[i] = k === 'self' || k === 'path' || s.pins.has(n.person) ? 1 : 0;
      else if (k !== undefined || s.pins.has(n.person) || (s.onlyLines && spine.has(n.person))) A[i] = 1;
      else A[i] = (q?.magnitude ?? 6) <= OVERVIEW_MAG ? 1 : detail;
    }
  }

  /** Эпохи чередуются светлотой фона: каждая вторая — тоном «глубины». */
  private drawEpochBands() {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const H = cam.h;
    this.epochX.forEach((e, i) => {
      const a = cam.sx(e.x0);
      const b = cam.sx(e.x1);
      if (b < 0 || a > W) return;
      if (i % 2 === 1) {
        ctx.fillStyle = pal.band;
        ctx.fillRect(a, 0, b - a, H);
      }
    });
  }

  // ---------- облака плотности (E3) ----------

  /** Растр плотности рождений: столбцы — мировые x «по насыщенности» до 100 г., строки — полосы; размыт и нормирован. */
  private buildClouds(): typeof this.cloud {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const m = this.model;
    const COLS = 900;
    const rows = m.laneMax - m.laneMin + 1;
    const x0 = timeToX(this.scale, this.scale.knots[0], 1);
    const x1 = timeToX(this.scale, T_CANON_END, 1);
    const cw = (x1 - x0) / COLS;
    const g = new Float32Array(COLS * rows);
    for (const n of m.nodes) {
      if (n.ghost || n.trail === 'list') continue;
      const c = Math.floor((timeToX(this.scale, n.t0, 1) - x0) / cw);
      const r = m.laneMax - n.lane;
      if (c < 0 || c >= COLS || r < 0 || r >= rows) continue;
      g[r * COLS + c] += 1;
    }
    const blur = (src: Float32Array, sigma: number, horiz: boolean) => {
      const R = Math.ceil(sigma * 2.5);
      const k = Array.from({ length: 2 * R + 1 }, (_, j) => Math.exp(-((j - R) ** 2) / (2 * sigma * sigma)));
      const ks = k.reduce((a, b) => a + b, 0);
      const out = new Float32Array(src.length);
      const W = COLS;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < W; c++) {
          let s = 0;
          for (let j = -R; j <= R; j++) {
            const cc = horiz ? c + j : c;
            const rr = horiz ? r : r + j;
            if (cc < 0 || cc >= W || rr < 0 || rr >= rows) continue;
            s += src[rr * W + cc] * k[j + R];
          }
          out[r * W + c] = s / ks;
        }
      return out;
    };
    const d = blur(blur(g, 5, true), 1.6, false);
    const sorted = [...d].filter((q) => q > 0).sort((a, b) => a - b);
    const top = sorted[Math.floor(sorted.length * 0.985)] || 1;
    const img = document.createElement('canvas');
    img.width = COLS;
    img.height = rows;
    const c2 = img.getContext('2d');
    if (!c2) return null;
    const data = c2.createImageData(COLS, rows);
    const [R, G, B] = hexToRgb(this.pal.ink);
    for (let k = 0; k < d.length; k++) {
      const v = Math.min(1, Math.sqrt(d[k] / top));
      data.data[k * 4] = R;
      data.data[k * 4 + 1] = G;
      data.data[k * 4 + 2] = B;
      data.data[k * 4 + 3] = Math.round(255 * (this.pal.glow ? CLOUD_MAX.night : CLOUD_MAX.day) * v);
    }
    c2.putImageData(data, 0, 0);
    // полосы для перевода столбцов в годы при другом масштабе времени
    const strips: number[] = [];
    for (let k = 0; k <= 48; k++) strips.push(xToTime(this.scale, x0 + ((x1 - x0) * k) / 48, 1));
    return { img, x0, x1, strips, key: `${m.id}|${this.pal.ink}|${this.pal.glow}` };
  }

  /** Облака на обзоре: гаснут по мере проявления следов (E3; MAP-03). */
  private drawClouds(detail: number, dimmed: boolean) {
    const a = (1 - detail) * (dimmed ? 0.5 : 1);
    if (a <= 0.02) return;
    const key = `${this.model.id}|${this.pal.ink}|${this.pal.glow}`;
    if (!this.cloud || this.cloud.key !== key) this.cloud = this.buildClouds();
    const cl = this.cloud;
    if (!cl) return;
    const { ctx, cam } = this;
    const m = this.model;
    // строки растра — полосы; при сжатии полос (J5) — только отрезки оставшихся полос, каждый на свою строку экрана
    const runs: [number, number][] = [];
    if (cam.rows.identity) runs.push([m.laneMax, m.laneMin]);
    else
      for (let l = m.laneMax; l >= m.laneMin; l--) {
        if (Math.abs(this.rowOf(l + 0.5) - this.rowOf(l - 0.5) - 1) > 1e-6) continue;
        let e = l;
        while (e - 1 >= m.laneMin && Math.abs(this.rowOf(e - 0.5) - this.rowOf(e - 1.5) - 1) < 1e-6) e--;
        runs.push([l, e]);
        l = e;
      }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = true;
    const cols = cl.img.width;
    for (const [la, lb] of runs) {
      const sy0 = m.laneMax - la;
      const sh = la - lb + 1;
      const yTop = cam.sy(la + 0.5);
      const h = sh * cam.ky;
      if (Math.abs(this.lambda - 1) < 1e-6) {
        ctx.drawImage(cl.img, 0, sy0, cols, sh, cam.sx(cl.x0), yTop, (cl.x1 - cl.x0) * cam.kx, h);
      } else {
        // другой масштаб времени: растр переводится полосами через годы
        const n = cl.strips.length - 1;
        for (let k = 0; k < n; k++) {
          const a0 = cam.sx(this.xOf(cl.strips[k]));
          const a1 = cam.sx(this.xOf(cl.strips[k + 1]));
          if (a1 < 0 || a0 > cam.w) continue;
          ctx.drawImage(cl.img, (cols * k) / n, sy0, cols / n, sh, a0, yTop, a1 - a0 + 0.5, h);
        }
      }
    }
    ctx.restore();
  }

  // ---------- созвездия (E8) ----------

  /**
   * Ортогональные кольца контура ov при нынешнем масштабе (решение 52; VIS-77): шаг по времени — круглое число лет,
   * при котором ступень на экране не мельче ORTHO_PX (у середины созвездия). Кэш — по шагу и масштабу времени.
   */
  private orthoOf(ov: OutlineView): { t: number[]; lane: number[]; x: Float64Array }[] {
    const tc = (ov.t0 + ov.t1) / 2;
    const rate = rateAt(this, tc);
    const step = ORTHO_STEPS.find((q) => q * rate >= ORTHO_PX) ?? ORTHO_STEPS[ORTHO_STEPS.length - 1];
    // по высоте — строка клеток не ниже ORTHO_ROW_PX: на обзоре граница не дробится на полосы в 5 px
    const band = Math.max(1, Math.round(ORTHO_ROW_PX / Math.max(1, this.cam.ky)));
    const key = `${step}|${band}|${this.model.id}|${this.lambda}`;
    if (ov.ortho?.key === key) return ov.ortho.rings;
    const rings = orthoRings(ov.rings, step, band).map((r) => ({ ...r, x: Float64Array.from(r.t, (t) => this.xOf(t)) }));
    ov.ortho = { key, rings };
    return rings;
  }

  /**
   * Созвездия: один контур на связную часть (E8; MAP-41) — ортогональные отрезки по времени и полосам со скруглением
   * углов до 3 px (решение 52; VIS-77; ТЗ § 3.1), сплошной 1 px с контрастом к небу не ниже 3 : 1; дом внутри колена —
   * вложенный контур пунктиром; народы вне Израиля — лёгкая заливка. Возвращает места под названия.
   */
  private drawConstellations(p: Pass): GroupNameSpot[] {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const hl = p.s.highlight;
    if (!this.outlineViews.length) return this.drawBlockOutlines(p);
    const spots: GroupNameSpot[] = [];
    ctx.save();
    ctx.lineWidth = 1;
    // на масштабе семьи контур гаснет до 30 % (MAP-58): от него остаются бессмысленные дуги, а род читается по связям
    const u = Math.max(0, Math.min(1, (cam.ky - FAMILY_FADE[0]) / (FAMILY_FADE[1] - FAMILY_FADE[0])));
    const la = pal.lineAlpha * (hl ? 0.6 : 1) * (1 - 0.7 * u * u * (3 - 2 * u));
    // свёрнутое созвездие (J5) — строка-подпись вместо контура; вложенные в него дома тоже
    const folded = (g: string) => {
      for (let x: string | undefined = g, k = 0; x && k < 8; x = groupById.get(x)?.parent, k++) if (this.view.foldGroups.includes(x)) return true;
      return false;
    };
    for (const ov of this.outlineViews) {
      if (this.view.foldGroups.length && folded(ov.o.group)) continue;
      const xa = cam.sx(this.xOf(ov.t0));
      const xb = cam.sx(this.xOf(ov.t1));
      const ya = cam.sy(ov.l1);
      const yb = cam.sy(ov.l0);
      if (xb < 0 || xa > W || yb < this.openTop - 4 || ya > cam.vp.b + 4) continue;
      // граница — ортогональные отрезки по круглым годам и между полосами (решение 52; VIS-77)
      const rings = this.orthoOf(ov);
      ctx.beginPath();
      for (const r of rings) orthoPath(ctx, r.x, r.lane, cam);
      if (ov.foreign) {
        ctx.fillStyle = alpha(pal.ink, 0.035);
        ctx.fill('evenodd');
      }
      ctx.strokeStyle = alpha(pal.ink3, la);
      ctx.setLineDash(ov.o.parent ? [3, 3] : []);
      ctx.stroke();
      const slots = ov.o.slots.map((sl) => ({ x0: cam.sx(this.xOf(sl.t0)), x1: cam.sx(this.xOf(sl.t1)), yc: cam.sy(sl.lane), h: sl.h * cam.ky }));
      // пересечения контура с левым краем открытого неба: отрезки по y внутри области
      const edge: [number, number][] = [];
      const xl = this.letterW + 8;
      if (xa < xl && xb > xl + 40)
        for (const r of rings) {
          const ys: number[] = [];
          const n = r.x.length;
          for (let k = 0; k < n; k++) {
            const x1 = cam.sx(r.x[k]);
            const x2 = cam.sx(r.x[(k + 1) % n]);
            if ((x1 - xl) * (x2 - xl) < 0) {
              const u = (xl - x1) / (x2 - x1);
              ys.push(cam.sy(r.lane[k] + (r.lane[(k + 1) % n] - r.lane[k]) * u));
            }
          }
          ys.sort((a, b) => a - b);
          for (let k = 0; k + 1 < ys.length; k += 2) edge.push([Math.max(ys[k], this.openTop), Math.min(ys[k + 1], cam.vp.b)]);
        }
      // кольца в px холста: по ним на масштабе эпохи название ищет место по средней линии области (labels.ts)
      const poly = rings.map((r) => {
        const xs = new Float64Array(r.x.length);
        const ys = new Float64Array(r.x.length);
        for (let k = 0; k < r.x.length; k++) {
          xs[k] = cam.sx(r.x[k]);
          ys[k] = cam.sy(r.lane[k]);
        }
        return { x: xs, y: ys };
      });
      spots.push({ group: ov.o.group, size: ov.o.size, slots, box: { x0: xa, x1: xb, y0: ya, y1: yb }, edge: edge.filter(([a, b]) => b > a), poly });
    }
    ctx.setLineDash([]);
    ctx.restore();
    return spots;
  }

  /** Прежние контуры притоков (в данных нет контуров созвездий): пунктир, название — у левого края блока. */
  private drawBlockOutlines(p: Pass): GroupNameSpot[] {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const H = cam.h;
    const hl = p.s.highlight;
    const spots: GroupNameSpot[] = [];
    ctx.save();
    ctx.lineWidth = 1;
    for (const o of this.outlines) {
      const xs = o.poly.map(([t, l]) => [cam.sx(this.xOf(t)), cam.sy(l)] as const);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of xs) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (maxX < 0 || minX > W || maxY < 0 || minY > H) continue;
      ctx.strokeStyle = alpha(pal.ruleStrong, hl ? 0.35 : 0.8);
      ctx.setLineDash(o.foreign ? [1, 3] : [4, 3]);
      ctx.beginPath();
      xs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      spots.push({ group: o.group, size: o.size, slots: [{ x0: minX + 4, x1: maxX - 4, yc: Math.max(minY + 10, this.openTop + 10), h: 18 }] });
    }
    ctx.setLineDash([]);
    ctx.restore();
    return spots;
  }

  // ---------- скопления (E2) ----------

  /**
   * Скопления списков без родства (E2; MAP-02, UX-32; ТЗ § 3.1): свёрнутое — знак рассеянного скопления (кольцо из шести
   * точек, 12 px) в год списка; раскрытое (столбец сетки шире 9 px) — сетка звёзд без следов и скобка «время не
   * установлено» над ней. Подписи — в слое подписей (clusterLabels).
   */
  private drawClusters(p: Pass) {
    const { ctx, cam, pal } = this;
    const hl = p.s.highlight;
    const lit = (c: ClusterView) => (hl ? (c.c.members.some((id) => hl.has(id)) ? 1 : 0.35) : 1);
    for (const g of this.rings) {
      const { x, y } = g;
      if (x < this.letterW - 8 || x > cam.w + 8 || y < this.openTop - 8 || y > cam.vp.b + 8) continue;
      ctx.fillStyle = alpha(pal.ink2, 0.9 * Math.max(...g.members.map(lit)));
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI * 2 * k) / 6 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const c of this.clusters) {
      if (this.collapsed.has(c.block)) continue;
      const e = lit(c);
      const xa = cam.sx(this.xOf(c.c.t0));
      const xb = cam.sx(this.xOf(c.c.t1));
      const y = Math.round(cam.sy(c.c.labelLane)) + 0.5;
      if (xb < 0 || xa > cam.w || y < this.openTop || y > cam.vp.b) continue;
      // скобка «время не установлено»: над сеткой, с засечками вниз
      ctx.strokeStyle = alpha(pal.ink3, pal.lineAlpha * e);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(Math.round(xa) + 0.5, y);
      ctx.lineTo(Math.round(xa) + 0.5, y + 4);
      ctx.moveTo(Math.round(xb) + 0.5, y);
      ctx.lineTo(Math.round(xb) + 0.5, y + 4);
      ctx.stroke();
    }
  }

  /**
   * Подписи скоплений: «Храбрые Давида, 2 Цар 23:8–39; 54 имени» у знака (слитый знак — «… и ещё 2 списка») или над
   * скобкой раскрытой сетки — «…; время не установлено».
   */
  private clusterLabels(p: Pass) {
    const { cam } = this;
    const hl = p.s.highlight;
    // погашенная подпись скопления — не ниже 4,5 : 1 (решение 31)
    const lit = (c: ClusterView) => (hl ? (c.c.members.some((id) => hl.has(id)) ? 1 : this.pal.dimInk2) : 1);
    for (const g of this.rings) {
      const { x, y } = g;
      if (x < this.letterW || x > cam.w || y < this.openTop || y > cam.vp.b) continue;
      const main = g.members.reduce((a, b) => (b.c.count > a.c.count ? b : a));
      const more = g.members.length - 1;
      const tail = more ? ` и ещё ${more} ${more === 1 ? 'список' : more < 5 ? 'списка' : 'списков'}` : '';
      const anchor = { x: x - 7, y: y - 7, w: 14, h: 14 };
      const e = Math.max(...g.members.map(lit));
      // полная подпись, короче — без стиха, короче — без «и ещё»; места нет — только знак
      for (const text of [clusterText(main.c) + tail, clusterShort(main.c) + tail, clusterShort(main.c)])
        if (drawClusterLabel(this, p, text, anchor, e)) break;
    }
    for (const c of this.clusters) {
      if (this.collapsed.has(c.block)) continue;
      const text = clusterText(c.c);
      const xa = cam.sx(this.xOf(c.c.t0));
      const xb = cam.sx(this.xOf(c.c.t1));
      const y = cam.sy(c.c.labelLane);
      if (xb < this.letterW || xa > cam.w || y < this.openTop || y > cam.vp.b) continue;
      const a = Math.max(xa, this.letterW + 4);
      const anchor = { x: a, y: y - 1, w: Math.max(1, xb - a), h: 2 };
      for (const t of [`${text}; время не установлено`, text, `${clusterShort(c.c)}; время не установлено`, clusterShort(c.c)])
        if (drawClusterLabel(this, p, t, anchor, lit(c), 'above')) break;
    }
  }

  /** Видимые узлы: в полосе экрана; отвод может проходить через экран, даже если сам след вне его. Без свёрнутых скоплений. */
  private visible(p: Pass): number[] {
    const cam = this.cam;
    const W = cam.w;
    const H = cam.h;
    const lineOnly = p.s.onlyLines;
    const hid = this.plan.hidden;
    const vis: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (hid && hid[i]) continue;
      const n = this.nodes[i];
      const y = cam.sy(n.lane);
      if (y < -20 || y > H + 20) continue;
      const x0 = cam.sx(this.X0[i]);
      const x1 = cam.sx(this.X1[i]);
      if (x1 < -40 || x0 > W + 40) {
        if (n.parentLane === null || x0 < -40 || x0 > W + 40) continue;
      }
      if (lineOnly && !p.spine.has(n.person)) continue;
      if (n.block >= 0 && this.collapsed.has(n.block) && !(this.starA[i] > 0)) continue;
      vis.push(i);
    }
    return vis;
  }

  restars(p: Pass, box: Rect) {
    const { cam } = this;
    const inside = p.vis.filter((i) => {
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      return x >= box.x - 6 && x <= box.x + box.w + 6 && y >= box.y - 6 && y <= box.y + box.h + 6;
    });
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(box.x, box.y, box.w, box.h);
    this.ctx.clip();
    this.drawStars(p, inside);
    this.ctx.restore();
  }

  /**
   * Звезда узла i рисуется в этом кадре (Pass.starShown; этап 11, B1): узел нарисован (не скрыт набором, свёрткой,
   * режимом «только линии», слоем призраков), звезда проявилась и уже зажглась. По ней решают и звёзды, и подписи лиц.
   */
  private starShown(s: SkyState, i: number): boolean {
    const n = this.nodes[i];
    if (!n || !this.drawn(i) || (n.ghost && !s.layers.ghosts) || !(this.starA[i] > 0.02)) return false;
    const q = byId.get(n.person);
    // зажигание по величине (ТЗ § 5.5): звезда величины m загорается, когда intro · 7 > m
    return !!q && s.intro * 7 - q.magnitude > 0;
  }

  /** Звёзды: мелкие проявляются с подробностью кадра; зажигание при загрузке — от ярких к тусклым (ТЗ § 5.5). */
  private drawStars(p: Pass, only?: number[]) {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const s = p.s;
    const intro = s.intro;
    const look = { scale: p.zoomScale, color: '', halo: pal.sky };
    for (const i of only ?? p.vis) {
      if (!p.starShown(i)) continue;
      const n = this.nodes[i];
      const sa = this.starA[i];
      const q = byId.get(n.person)!;
      const c = this.model.chrono.get(n.person);
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(n.lane);
      if (x < -20 || x > W + 20) continue;
      // зажигание по величине
      const lit = Math.max(0, Math.min(1, intro * 7 - q.magnitude));
      const e = p.emph(q.id) * lit * sa;
      look.color = alpha(pal.ink, e);
      // «†» умершего младенцем — в подписи, кеглем имени (MAP-68); у звезды без подписи — знаком (drawDaggers)
      drawGlyph(ctx, x, y, personGlyph(q, n.ghost, c?.cls, look, false));
      p.starsDrawn.add(i);
    }
  }

  /**
   * Промежутки рождения (решение 38; MAP-69): у лица Нового Завета, чей знак стоит у первого засвидетельствованного года
   * (NodeRow.band), — растушёванная полоса влево от знака через возможные годы рождения (glyphs.ts, drawBirthBand).
   */
  private drawBirthBands(p: Pass) {
    const { ctx, cam, pal } = this;
    for (const i of p.vis) {
      const n = this.nodes[i];
      if (!n.band || n.ghost || !this.drawn(i)) continue;
      const x0 = cam.sx(this.xOf(n.band[0]));
      const x1 = Math.min(cam.sx(this.xOf(n.band[1])), cam.sx(this.X0[i]));
      if (x1 < -4 || x0 > cam.w + 4) continue;
      const y = Math.round(cam.sy(n.lane)) + 0.5;
      drawBirthBand(ctx, { x0, x1, y, color: pal.ink2, alpha: BIRTH_BAND.alpha * p.emph(n.person) * p.s.intro });
      if (p.lines && x1 > x0) p.lines.add({ x: x0, y: y - 3, w: x1 - x0, h: 6 });
    }
  }

  /** Знак † у звезды умершего младенцем, если её подпись не встала (при подписи «†» стоит перед именем, MAP-68). */
  private drawDaggers(p: Pass) {
    const { ctx, cam, pal } = this;
    for (const i of p.vis) {
      const n = this.nodes[i];
      if (p.labeled.has(i) || n.ghost || !(n.trail === 'infant' || this.model.chrono.get(n.person)?.infant)) continue;
      if (this.starA[i] <= 0.02) continue;
      const q = byId.get(n.person)!;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(n.lane);
      if (x < -20 || x > cam.w + 20) continue;
      const r = starRadius(q.magnitude, p.zoomScale) + (q.sex === 'f' ? 2.2 : 0);
      const g = daggerAt(x, y, r);
      ctx.strokeStyle = alpha(pal.ink, p.emph(q.id) * p.s.intro * this.starA[i]);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(g.x, g.top);
      ctx.lineTo(g.x, g.bottom);
      ctx.moveTo(g.x - g.half, g.bar);
      ctx.lineTo(g.x + g.half, g.bar);
      ctx.stroke();
    }
  }
}

/**
 * Подписи лиц без звезды (этап 11, B1): лица подписей-имён ('star') и номеров у бусин («Мф 17», «Лк 39»; 'mark') кадра,
 * чьих звёзд в кадре нет (drawn — узлы нарисованных звёзд). Пометы, знак брака «‖», указатели у края, «липкие» имена
 * и знаки свёрнутого стоят и без звезды на экране — они не в счёт.
 */
export function bareLabels(boxes: readonly { kind: string; id?: string; text?: string }[], indexOf: (id: string) => number | undefined, drawn: ReadonlySet<number>): string[] {
  const out = new Set<string>();
  for (const b of boxes) {
    const bead = b.kind === 'mark' && /^(Мф|Лк)[\s\u00a0]\d/.test(b.text ?? '');
    if ((b.kind !== 'star' && !bead) || !b.id) continue;
    const i = indexOf(b.id);
    if (i === undefined || !drawn.has(i)) out.add(b.id);
  }
  return [...out];
}

/**
 * Место формулы выбранного лица под ярусами эпох в последнем кадре (MOB-60): его пишет src/render/tiers.ts в
 * canvas.dataset.tiers (formula: { text, rect }). null — формулы нет.
 */
function tierFormulaRect(canvas: HTMLCanvasElement): { text: string; rect: Rect } | null {
  const raw = (canvas as { dataset?: DOMStringMap }).dataset?.tiers;
  if (!raw) return null;
  try {
    const f = (JSON.parse(raw) as { formula?: { text?: string[]; rect?: Rect } | null }).formula;
    const r = f?.rect;
    if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite)) return null;
    return { text: (f!.text ?? []).join(' '), rect: { x: r.x, y: r.y, w: r.w, h: r.h } };
  } catch {
    return null;
  }
}

/**
 * Области созвездий, у которых название обязательно (MAP-58): видимая часть рамки контура в открытом небе не меньше
 * GROUP_AREA_MIN; named — название этого созвездия есть в кадре.
 */
export function groupAreas(v: SkyContext, spots: readonly GroupNameSpot[], names: readonly (Rect & { group: string })[]): { group: string; w: number; h: number; named: 0 | 1 | 2 }[] {
  const out: { group: string; w: number; h: number; named: 0 | 1 | 2 }[] = [];
  for (const o of spots) {
    if (!o.box) continue;
    const w = Math.round(Math.min(o.box.x1, v.cam.w - 8) - Math.max(o.box.x0, v.letterW + 8));
    const h = Math.round(Math.min(o.box.y1, v.cam.vp.b) - Math.max(o.box.y0, v.openTop));
    if (w < GROUP_AREA_MIN[0] || h < GROUP_AREA_MIN[1]) continue;
    // 1 — название внутри самой области; 2 — у другой части того же созвездия в кадре (повтор — не ближе 1 200 px); 0 — нет
    const own = names.filter((b) => b.group === o.group);
    const inside = own.some((b) => b.x + b.w / 2 >= o.box!.x0 && b.x + b.w / 2 <= o.box!.x1 && b.y + b.h / 2 >= o.box!.y0 && b.y + b.h / 2 <= o.box!.y1);
    out.push({ group: o.group, w, h, named: inside ? 1 : own.length ? 2 : 0 });
  }
  return out;
}

/**
 * Узлы кадра с лицами линий на нитях (MAP-71): у лица из beads — дробная полоса, в которой его звезда ложится на нить
 * (обратное преобразование камеры и сжатия строк). Остальные узлы — те же объекты; номера узлов не меняются.
 */
export function beadNodes(v: SkyContext, nodes: readonly NodeRow[], beads: ReadonlyMap<string, number>): NodeRow[] {
  if (!beads.size) return nodes as NodeRow[];
  const out = nodes.slice();
  const moved = new Map<string, number>();
  for (const [id, y] of beads) {
    const i = v.indexOf(id);
    if (i === undefined || !Number.isFinite(y)) continue;
    const lane = v.laneOf(v.cam.wLane(y));
    if (Number.isFinite(lane) && Math.abs(lane - nodes[i].lane) > 1e-3) {
      out[i] = { ...nodes[i], lane };
      moved.set(id, lane);
    }
  }
  // отвод к ребёнку идёт от следа родителя: у ребёнка родителя-бусины — полоса родителя на нити, иначе вертикаль
  // уходила бы к прежнему месту родителя в пустоту
  if (moved.size)
    out.forEach((n, i) => {
      const lane = n.layoutParent ? moved.get(n.layoutParent) : undefined;
      if (lane !== undefined && n.parentLane !== null) out[i] = { ...n, parentLane: lane };
    });
  return out;
}

/** Дети того же отца вне наведённой семьи (гребёнка или помета матери; MAP-74) гаснут до стольких. */
export const FAMILY_HOVER_DIM = 0.4;
/**
 * Яркость с наведённой семьёй (MAP-74; trails.ts, familyHover): наведены гребёнка детей одной матери или её помета —
 * её дети остаются, остальные дети того же отца гаснут до FAMILY_HOVER_DIM. Помета порядка («порядок по …») не гасит.
 */
function familyDim(v: object, f: (id: string) => number): (id: string) => number {
  const h = familyHover(v);
  if (!h || h.kind === 'order') return f;
  const kids = new Set(h.kids);
  const others = new Set<string>();
  for (const e of graph.childrenOf.get(h.parent) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && !kids.has(e.child)) others.add(e.child);
  if (!others.size) return f;
  return (id) => (others.has(id) ? Math.min(FAMILY_HOVER_DIM, f(id)) : f(id));
}

/** Яркость не ниже floor (режим «набор», MAP-64). */
const floorAt = (f: (id: string) => number, floor: number) => (id: string) => Math.max(floor, f(id));

/** Шаги границ созвездий по времени, лет (VIS-77): граница идёт по круглым годам. */
export const ORTHO_STEPS = [1, 2, 5, 10, 25, 50, 100, 250];
/** Ступень границы на экране — не мельче стольких px. */
export const ORTHO_PX = 24;
/** Строка клеток границы на экране — не ниже стольких px (на обзоре — несколько полос). */
export const ORTHO_ROW_PX = 10;
/** Скругление углов границы, px (решение 52: не больше 3). */
export const ORTHO_ROUND = 3;

/**
 * Ортогональные кольца области (решение 52; VIS-77; ТЗ § 3.1): клетки «[k·step, (k + 1)·step) лет × полоса j» (полоса —
 * от j − ½ до j + ½), середина которых внутри колец rings (чётно-нечётное правило), образуют область; её граница —
 * замкнутые ломаные из вертикалей по круглым годам и горизонталей между полосами, без лишних вершин на прямых.
 * Клетки, касающиеся только углом, — разные части. Вершины — годы и полосы.
 */
export function orthoRings(rings: readonly { t: ArrayLike<number>; lane: ArrayLike<number> }[], step: number, band = 1): { t: number[]; lane: number[] }[] {
  let lMin = Infinity;
  let lMax = -Infinity;
  for (const r of rings)
    for (let k = 0; k < r.lane.length; k++) {
      lMin = Math.min(lMin, r.lane[k]);
      lMax = Math.max(lMax, r.lane[k]);
    }
  if (!(lMax >= lMin)) return [];
  const j0 = Math.ceil(lMin);
  const j1 = Math.floor(lMax);
  // клетки по полосам: пересечения горизонтали lane = j с кольцами → отрезки внутри → клетки, чья середина в них
  const cells = new Map<number, Set<number>>();
  for (let j = j0; j <= j1; j++) {
    const ts: number[] = [];
    for (const r of rings) {
      const n = r.t.length;
      for (let k = 0; k < n; k++) {
        const a = r.lane[k];
        const b = r.lane[(k + 1) % n];
        if ((a > j) !== (b > j)) ts.push(r.t[k] + ((r.t[(k + 1) % n] - r.t[k]) * (j - a)) / (b - a));
      }
    }
    ts.sort((a, b) => a - b);
    // строка клеток — band полос: клетка внутри, если внутри хоть одна её полоса
    const rj = Math.floor(j / band);
    const row = cells.get(rj) ?? new Set<number>();
    for (let k = 0; k + 1 < ts.length; k += 2)
      for (let c = Math.ceil(ts[k] / step - 0.5); (c + 0.5) * step <= ts[k + 1]; c++) row.add(c);
    if (row.size) cells.set(rj, row);
  }
  const inside = (c: number, j: number) => !!cells.get(j)?.has(c);
  // рёбра границы: область слева по ходу (годы — вправо, полосы — вверх); вершина (c, j) — год c·step, полоса j − ½
  const key = (c: number, j: number) => `${c},${j}`;
  const out = new Map<string, [number, number][]>();
  const edge = (a: [number, number], b: [number, number]) => {
    const k = key(...a);
    const list = out.get(k);
    if (list) list.push(b);
    else out.set(k, [b]);
  };
  let edges = 0;
  for (const [j, row] of cells)
    for (const c of row) {
      if (!inside(c, j - 1)) (edge([c, j], [c + 1, j]), edges++);
      if (!inside(c + 1, j)) (edge([c + 1, j], [c + 1, j + 1]), edges++);
      if (!inside(c, j + 1)) (edge([c + 1, j + 1], [c, j + 1]), edges++);
      if (!inside(c - 1, j)) (edge([c, j + 1], [c, j]), edges++);
    }
  const loops: { t: number[]; lane: number[] }[] = [];
  while (edges > 0) {
    // начало — любая вершина с исходящим ребром
    let start: [number, number] | null = null;
    for (const [k, list] of out)
      if (list.length) {
        const [c, j] = k.split(',').map(Number);
        start = [c, j];
        break;
      }
    if (!start) break;
    const pts: [number, number][] = [];
    let cur = start;
    let dir: [number, number] = [0, 0];
    const limit = edges + 4;
    for (let guard = 0; guard <= limit; guard++) {
      const list = out.get(key(...cur));
      if (!list?.length) break;
      // на седловой вершине — самый левый поворот: клетки, касающиеся углом, остаются разными частями
      let pick = 0;
      if (list.length > 1 && (dir[0] || dir[1])) {
        let best = -Infinity;
        list.forEach((b, i) => {
          const d = [b[0] - cur[0], b[1] - cur[1]];
          const turn = dir[0] * d[1] - dir[1] * d[0];
          if (turn > best) {
            best = turn;
            pick = i;
          }
        });
      }
      const next = list.splice(pick, 1)[0];
      edges--;
      pts.push(cur);
      dir = [next[0] - cur[0], next[1] - cur[1]];
      cur = next;
      if (cur[0] === start[0] && cur[1] === start[1]) break;
    }
    // вершины на прямой — лишние
    const keep = pts.filter((q, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[(i + 1) % pts.length];
      return !((a[0] === q[0] && q[0] === b[0]) || (a[1] === q[1] && q[1] === b[1]));
    });
    if (keep.length >= 4) loops.push({ t: keep.map((q) => q[0] * step), lane: keep.map((q) => q[1] * band - 0.5) });
  }
  return loops;
}

/** Путь ортогонального кольца на экране: отрезки с углами, скруглёнными до ORTHO_ROUND px (не больше половины стороны). */
function orthoPath(ctx: CanvasRenderingContext2D, xs: ArrayLike<number>, lanes: ArrayLike<number>, cam: Camera) {
  const n = xs.length;
  if (n < 3) return;
  const X = (k: number) => Math.round(cam.sx(xs[(k + n) % n])) + 0.5;
  const Y = (k: number) => Math.round(cam.sy(lanes[(k + n) % n])) + 0.5;
  ctx.moveTo((X(n - 1) + X(0)) / 2, (Y(n - 1) + Y(0)) / 2);
  for (let k = 0; k < n; k++) {
    const a = Math.hypot(X(k) - X(k - 1), Y(k) - Y(k - 1));
    const b = Math.hypot(X(k + 1) - X(k), Y(k + 1) - Y(k));
    // у коротких сторон скругление меньше: граница не превращается в «пилюлю»
    ctx.arcTo(X(k), Y(k), X(k + 1), Y(k + 1), Math.max(0, Math.min(ORTHO_ROUND, a / 4, b / 4)));
  }
  ctx.closePath();
}

/** Название созвездия прописными с разрядкой — для проверок и легенды. */
export { groupName };
