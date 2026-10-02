/**
 * Небо на Canvas 2D (ТЗ § 3.1–3.2, § 5): модель, камера, попадание указателем и кадр как порядок слоёв.
 *
 * Слои снизу вверх (решение 143) и где их код:
 *  фон и полосы эпох — здесь; черты канона и «сегодня», меридианы событий, сетка лет — frame.ts;
 *  облака плотности рождений (обзор), контуры созвездий, знаки скоплений — здесь;
 *  следы жизни, отводы, браки — trails.ts; связи — links.ts и trails.ts; ленты — ribbons.ts; ◆ и • — plates.ts;
 *  раскладка подписей — labels.ts: знаки кадра с истинными границами и кольцами, маршруты дуг, призраков и выбранной
 *  связи (marks.ts, overlayRoutes) — препятствия до неё; под серединой строки следы, декор и погашенные связи гаснут;
 *  звёзды — здесь (знаки — glyphs.ts), после раскладки: разрывы под текстом их не задевают;
 *  «†», метки ветвей, кольца, дуги и призраки, выбранная связь — marks.ts, с вырезами по рамкам всех подписей;
 *  весь текст кадра — одним проходом поверх всех линий (holdText: fillText и strokeText копятся до конца слоёв);
 *  ярусы эпох (tiers.ts, их рисует SkyView через under) → рамка (frame.ts) → меридиан (marks.ts) → указатели у края (frame.ts).
 *
 * Семантическое увеличение (E3; ТЗ § 3.1; MAP-03, 04): на обзоре — облака плотности рождений, контуры и названия созвездий,
 * скопления, ленты и звёзды величины 0–2; следы, связи и мелкие звёзды проявляются плавно в полосе ×1,5 масштаба
 * (Pass.detail: высота полосы 4 → 6 px), облака при этом гаснут. Выделенное (выбранное лицо, его род, отметки) видно всегда.
 *
 * Общее состояние модули читают через SkyContext (его реализует Sky) и проход кадра Pass; глобального состояния нет.
 */
import { KX_MIN, KY_MAX, KY_MAX_TALL, ROW_SHIFT_TALL, type Camera, type Frame, type ViewState } from './camera.ts';
import { RowCamera, gapsKey, identityRows, planSky, type FoldMark, type SkyPlan, type SkyView } from './rows.ts';
import { dotTime, drawLinkNodes, hiddenOf, plateGaps, type PlateHit, type PlateIn, type PlateMarks } from './plates.ts';
import { buildLinks, TRAIL_CUT, LinkHits, linkKinOf, linkLog, linkMotionNear, linkSpan, linkSpanOk, NODE_R_FAMILY, NODE_R_MAP, type LinkFrame, type LinkHit, type LinkPath, type LinkPlate, type LinkStar, type PathStyle } from './links.ts';
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
import { unions as ALL_UNIONS } from '../ui/reveal.ts';
import { linkRoleOf, linkRoles } from '../ui/linkwords.ts';
import { BIRTH_BAND, daggerAt, drawBirthBand, drawGlyph, glyphExtent, personGlyph, starRadius, type GlyphExt } from './glyphs.ts';
import { alpha, hexToRgb } from './color.ts';
import { alphaForContrast, CLOUD_DIMMED, dimLabelAlpha, separateRibbons, WORK_DIM } from './dim.ts';
import { clearOfRibbons, drawBranchLabels, drawLineNotes, drawRibbonGaps, drawSkyRibbons, lineNoteFocus, ribbonBeads, ribbonCheck, ribbonGapHits, skySteps, stepLegal, stepWeak, type SkyStep } from './ribbons.ts';
import { drawEventLines, drawFrame, drawGrid, drawTimeMarks, paintWayfinding, placeWayfinding, yearTicks, rateAt, BOTTOM_H, CANON_NOTE, FRAME_H, LETTER_W, LETTER_W_TOUCH, RULER_H, type EdgeHit } from './frame.ts';
import { claim, clusterShort, clusterText, drawClusterLabel, familyOf, ownLink, FAMILY_KY, labelFontOf, spot, drawEventLabel, drawFoldMark, drawGroupNames, drawNote, GROUP_COVER_FROM, drawStarLabels, foldMarkWidth, groupName, labelAt, LabelCache, LabelLedger, LineHits, measureLabels, namesakesInView, Placer, textBox, zoomScaleFor, GROUP_AREA_MIN, type GroupNameSpot, type LabelStats } from './labels.ts';
import { bendsOf, FAMILY_TIER, familyTier, hasGlides, tierAlpha, trailPolyline, trailSegs, type Bend, type FamilyTier } from './trails.ts';
import { glidesOf, laneAt, starLaneOf } from '../engine/stays.ts';
export { FAMILY_TIER, familyTier, tierAlpha, type FamilyTier } from './trails.ts';
import { drawBranchTicks, drawGhostNotes, drawLinkLabels, drawLinks, drawPlanStubs, drawSpineTrails, drawTrails, familyHover, linkLooks, linkOn, linkShown, trailLinksAt, trailOf, type LifeTrail, type LinkDraw, type PlanStubHit } from './trails.ts';
import { branchFrame, drawOriginPath, drawKinPath, drawLeadNotes, drawMeridian, drawOverlayText, drawRings, drawSelectedLink, drawWorkMarks, emphasis, kinRoutes, meridianFlagAt, overlayRoutes, reserveSelectedLink, ringOuter, unionHoverDim, type SelectedLinkInfo } from './marks.ts';
import { coarsePointer, mapFont, mapSize, nameSize, T_MAP_S } from './type.ts';
import type { Rect } from './rect.ts';
import { timeToX, xToTime, hydrateScale, type TimeScale, T_CANON_END, T_END } from '../engine/timescale.ts';
import { toAstro } from '../engine/years.ts';
import type { ClusterInfo, Outline } from '../engine/layout.ts';
import type { KinStep } from '../engine/kinship.ts';
import type { ModelData, NodeRow } from '../data/atlas.ts';
import { byId, graph, groupById, lines } from '../data/atlas.ts';
import { nameCase } from '../ui/text/ru.ts';

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
  /** непрозрачность --ink-3 для контура созвездия: CONTOUR_CONTRAST к небу */
  contourAlpha: number;
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

/** Контраст линий карты (меридианы событий, сетка) к небу — как у графики (ТЗ § 3.8): не ниже 3 : 1. */
export const LINE_CONTRAST = 3;
/**
 * Контраст контура созвездия к небу (решение 170; V-3): в 1,5 раза ниже связи контекста (3,2 : 1 при выбранном лице) —
 * контур, тонкий и бледный, не читается связью; граница области — декор, её смысл несёт название
 */
export const CONTOUR_CONTRAST = 2;
/** Толщина контура созвездия, px (решение 170): тоньше связей (1 px). */
export const CONTOUR_W = 0.75;

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
    contourAlpha: alphaForContrast(v('--ink-3'), sky, CONTOUR_CONTRAST),
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
  /** точка сравнения линий с фокусом клавиатуры (решение 116; src/ui/SkyView.tsx): её подпись в рамке, кольцо у точки */
  noteFocus?: string | null;
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
  /**
   * Выбранная связь (этап 11, § 8; src/ui/linkstate.ts, selectedLink): жёлтым, кольца с ролями на концах, указатели у края;
   * остальное небо гаснет до 30 %, ленты — до 55 %. Выбор лица при этом не меняется.
   */
  link?: LinkKey | null;
  /** связи под указателем или на строке «Родство» карточки у звезды (previewLinks): полной яркостью и на 1 px толще */
  linkPreview?: readonly LinkKey[] | null;
  /** связь под указателем (src/ui/sky/input.ts) */
  linkHover?: LinkKey | null;
  /** яркость погашенного неба при выделении: по умолчанию DIM (25 %), при выбранной связи — 30 % (§ 8) */
  dimTo?: number;
  /** переход между укладками (§ 10): связи и подписи проявляются в конце (0…1); 1 — перехода нет */
  settle?: number;
  /** где лицо-гость показа (§ 7): «в «Доме Фарры»» — уточнение его подписи (src/ui/show.ts, whereOf) */
  guestWhere?: ((id: string) => string) | null;
}

/**
 * Что показывает небо (rows.ts, SkyView) и союзы неба «набор» (решения 70, 76): по ним Sky сам оставляет место
 * под точки у строки одного лица (plates.ts, plateGaps) — и заново при смене модели хронологии, когда меняются полосы.
 */
export type SkyViewIn = SkyView & { plates?: readonly PlateIn[] | null };

/** Знак свёрнутого под указателем: потомки, созвездие, «развернуть всё»; reveal — «+» нераскрытых союзов лица (решение 70). */
/**
 * Вид знака-ссылки неба: свёрнутое (J5), «развернуть всё», «+» союзов (решение 70) и скопление семьи на обзоре «+N»
 * (решение 142: щелчок — «Ближайшая родня» или приближение).
 */
export type FoldHitKind = FoldMark['kind'] | 'all' | 'reveal' | 'pile';
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
  /**
   * Доля ленты «по маршрутам связей» в этом кадре (§ 3): 0 — сплайн обзора, 1 — маршрут масштаба семьи (по следу
   * родителя до узла союза, ступенькой к ребёнку); между ними — плавный переход в полосе ×1,5 масштаба.
   */
  readonly routeFactor: number;
  /**
   * Простор поколений в кадре (0–1): медиана шага поколений линий Мессии на экране, 12 px — 0, 24 px — 1. Ромбы союзов
   * на «всех лицах» рисуются с половины: теснее семья — сгусток, и её ромбы только закрывали бы друг друга и имена.
   */
  readonly genRoom: number;
  /** масштаб или пропорция полос сейчас меняются (перелёт, колесо, щипок): тяжёлые кэши кадра не пересчитываются */
  readonly scaleMoving: boolean;
  /**
   * небо движется: масштаб, пропорция или сдвиг (протяжка, инерция, перелёт) — подписи без поиска мест веером (labels.ts,
   * StarOpts.fan, kin, wide): кадр движения короче 20 мс (С1); кадр покоя после движения ставит их заново
   */
  readonly viewMoving: boolean;
  /** узлы, по полосам которых строятся нити лент: в режиме «только линии» на общей раскладке — узлы раскладки */
  readonly ribbonNodes: readonly NodeRow[];
  /** ступенька шага ленты «родитель>ребёнок» (x px холста) у узла его союза (src/render/links.ts); null — узла нет */
  linkVia(pk: string): { x: number; y: number } | null;
  /**
   * Год (астр.), с которого след узла i «живой» (решение 173, Д7): жена в доме мужа с рождения — год прихода в дом
   * (NodeRow.wed; в семейной укладке — FamilyResult.since); null — след живой от звезды
   */
  liveYear?(i: number): number | null;
  /** ключ связей кадра: кэш лент по маршрутам перестраивается при его смене */
  readonly linksKey: string;
}

/** Проход кадра: то, что draw() вычисляет один раз и отдаёт слоям. */
export interface Pass {
  s: SkyState;
  /** указатели у края к выбранному лицу и второму (frame.ts, placeWayfinding): ромбы союзов под ними не рисуются */
  wayEdges?: Rect[];
  /** видимые узлы в порядке узлов (без лиц свёрнутых скоплений) */
  vis: number[];
  /** яркость лица при выделении: 1, LIKELY или DIM (marks.ts) */
  emph: (id: string) => number;
  /** лица линий Мессии */
  spine: Set<string>;
  /** уровень масштаба подписей: 2·log2(kx / KX_MIN); «всё небо» на телефоне мельче KX_MIN — уровень 0 */
  level: number;
  /**
   * Уровень подробности семьи (этап 15, решение 178; уточняет 135): 0 — небо (меньше 7 px на год у середины окна): следы,
   * звёзды, ленты, переходы бледно, союзы и отводы — только у структурных лиц и выбранного; 1 — обзор семьи (7–24 px на
   * год): ромбы, черты, все отводы; 2 — семья (от 24 px на год): слова вида союза, бездетные браки, призраки.
   */
  tier: FamilyTier;
  /** местный масштаб времени у середины окна, px на год: по нему tierAlpha даёт плавный переход уровней */
  pxYear: number;
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
  shown?: {
    breaks: Set<string>;
    brackets: Set<string>;
    workMarks: number;
    noted: string[];
  };
  /** связи кадра (src/render/links.ts) и что из них сейчас нарисовано: длинные — целиком или обрывками */
  links?: LinkDraw | null;
  /** разрывы следов (Г7): номер узла → пары «x px холста, полуширина» */
  cuts?: Map<number, number[]>;
  /** гости показа (§ 7): бледнее, 45 % */
  guests?: ReadonlySet<string>;
  /** прямоугольник ложится на чужую линию связи кадра (не лица id): подписи обходят линии (Я12; labels.ts) */
  onLink?: (b: Rect, id: string) => boolean;
  /**
   * через рамку строки b идёт линия — связь, дуга родства, призрак, выбранная связь или путь родства; через середину
   * строки band — лента (решения 139, 141, 163): подпись лица id так не ставится
   */
  onLine?: (b: Rect, id: string, ribbons?: boolean, perp?: boolean, band?: Rect) => boolean;
  /** скопления семьи на обзоре (решение 142): лицо старшего → «+N» у его подписи */
  pileText?: Map<string, string>;
  /**
   * погасить под серединой строки подписи то, что нарисовано до подписей (решения 139, 141): следы, декор, погашенные
   * связи; нет — на обзоре (облака) и в «только линиях» (ленты)
   */
  knock?: (b: Rect) => void;
  /**
   * разрыв под серединой строки явно раскрытого имени (выбранное, наведённое, фокус), вставшего без правил: и на обзоре —
   * имя важнее облака под ним; нет — в «только линиях» (решения 139, 141)
   */
  knockReveal?: (b: Rect) => void;
  /** имена верхней ступени 164, под которыми чужая линия разорвана по всей рамке + 3 px (исключение 163; К5 — отдельно) */
  cutNames?: string[];
  /** прореженные знаки без выбранного (решение 142): не нарисованы, их лица — в скрытых подписях */
  thinned?: ReadonlySet<number>;
  /** лента по маршруту под прямоугольником (px холста): подписи связей обходят саму ленту, а не рамку шага (§ 3) */
  onRibbon?: (b: Rect) => boolean;
}

/**
 * Копия узла в полосе lane (переход между укладками, § 10): пребывания и звезда сдвигаются вместе с полосой жизни —
 * дом едет целиком, без излома переходов (решение 173).
 */
function shiftLane(n: NodeRow, lane: number): NodeRow {
  const d = lane - n.lane;
  if (!n.stays) return { ...n, lane, ...(n.starLane !== undefined ? { starLane: n.starLane + d } : {}) };
  return { ...n, lane, starLane: starLaneOf(n) + d, stays: n.stays.map((st) => ({ ...st, lane: st.lane + d })) };
}

/** Лица линий на нитях в режиме «только линии» (MAP-71; ТЗ § 3.2: «каждое лицо — бусина»). */
const BEADS = true;

/**
 * Проверочные метки кадра на холсте (canvas.dataset: связи, ромбы, подписи, звёзды, ленты…) — для сценариев приёмки
 * (tools/accept) и тестов (tests/). Читателю они не нужны, а строятся в каждом кадре заново: 3–5 мс кадра при протяжке
 * неба с 5 000 лицами (NFR-1, docs/perf.md). По умолчанию включены — тесты рисуют небо без браузера; атлас в браузере
 * оставляет их только под автоматизацией (src/main.tsx: navigator.webdriver), замер кадров их выключает, как у читателя
 * (tools/perf.ts). На то, что нарисовано, они не влияют.
 */
export const probes = { on: true };
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
  ortho?: {
    key: string;
    rings: { t: number[]; lane: number[]; x: Float64Array }[];
  };
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
/** Высота строки семейной укладки при вписывании (Я12): не ниже стольких px; на узком небе и касании — narrow. */
export const FAMILY_ROW = { wide: 24, narrow: 32 };
/**
 * Переход между укладками (§ 10; решение 85), мс: всего TRANS_MS; уходящие гаснут в [0, TRANS_LEAVE]; строки едут
 * в TRANS_MOVE; узлы, стволы, обрывки и подписи проявляются в TRANS_SETTLE (подписи ставятся один раз, в конце).
 */
export const TRANS_MS = 450;
export const TRANS_LEAVE = 150;
export const TRANS_MOVE: [number, number] = [80, 340];
// связи проявляются, когда строки встали: кадр связей строится один раз на переход (Я33)
export const TRANS_SETTLE: [number, number] = [340, 450];
const transEase = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Яркость звезды при переходе: новые лица проявляются вместе с узлами и стволами (TRANS_SETTLE), остальные — в полную. */
const appearOf = (tr: { from: Float64Array; to: Float64Array }, settle: number) => (i: number) =>
  Number.isFinite(tr.from[i]) || !Number.isFinite(tr.to[i]) ? 1 : settle;

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
  private outlines: {
    block: number;
    group: string;
    foreign: boolean;
    poly: [number, number][];
    size: number;
  }[] = [];
  private outlineViews: OutlineView[] = [];
  private clusters: ClusterView[] = [];
  private epochX: {
    id: string;
    x0: number;
    x1: number;
    name: string;
    short: string;
  }[] = [];
  /** облака плотности рождений (E3): растр в мировых x масштаба «по насыщенности» */
  private cloud: {
    img: HTMLCanvasElement;
    x0: number;
    x1: number;
    strips: number[];
    key: string;
  } | null = null;
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
  private view: SkyViewIn = {
    mode: 'all',
    set: new Set(),
    foldDesc: [],
    foldGroups: [],
  };
  /** план неба по view: скрытые узлы, сжатие полос, знаки свёрнутого (src/render/rows.ts) */
  plan: SkyPlan = {
    hidden: null,
    hiddenPersons: new Set(),
    rows: identityRows(-1, 1),
    marks: [],
    mode: 'all',
  };
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

  // ---------- связи кадра (этап 11, § 2; src/render/links.ts) ----------

  /**
   * Связи кадра: строятся по всем нарисованным звёздам при данном масштабе, строках и составе неба; при сдвиге — те же,
   * со сдвигом (linkDx, linkDy), как нити лент. Попадание — по сетке отрезков (LinkHits).
   */
  private linkCache: {
    key: string;
    /** ключ без того, что меняется с масштабом (свёрнутые скопления, «только нарисованные»): в движении кадр держится по нему */
    base: string;
    x0: number;
    laneTop: number;
    /** масштаб, при котором кадр связей в этих координатах (у пересчитанного движением — нынешний) */
    kx: number;
    ky: number;
    /** масштаб точной сборки: пересчёт движением — не дальше чем вдвое от него */
    kx0: number;
    ky0: number;
    /** кадр собран при этом масштабе (а не пересчитан из прежнего на время движения) */
    exact: boolean;
    /** полоса времени, по звёздам которой собран кадр (links.ts, linkSpan); null — всё небо (семейная укладка: звёзд мало) */
    span: { x0: number; x1: number } | null;
    frame: LinkFrame;
    hitGrid: LinkHits | null;
    stars: LinkStar[];
  } | null = null;
  /** сетка попадания кадра связей: строится при первом запросе (на время движения масштаба она не нужна) */
  private get linkHits(): LinkHits | null {
    const c = this.linkCache;
    if (!c) return null;
    if (!c.hitGrid) c.hitGrid = new LinkHits(c.frame.paths, c.frame.nodes);
    return c.hitGrid;
  }
  /**
   * Масштаб меняется (перелёт, колесо, щипок, смена пропорции полос): кадр связей и пороги подписей пересчитываются из
   * прежних, а заново строятся, когда масштаб постоит SCALE_SETTLE_MS (Я33: 60 кадров/с). SkyView дорисует кадр.
   */
  scaleMoving = false;
  viewMoving = false;
  private lastView = '';
  private viewAt = -Infinity;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  /** кадр связей пересчитан движением: нужен ещё один кадр, когда масштаб постоит (SkyView) */
  linksStale = false;
  private lastScale = '';
  private scaleAt = -Infinity;
  /** что из связей нарисовано в последнем кадре (длинные — целиком или обрывками, выделенные, наведённая) */
  linkDraw: LinkDraw | null = null;
  /** «+N» свёрнутых союзов в последнем кадре: отдельная цель не меньше 24 × 24 (на касании — 44 × 44) */
  countHits: (Rect & { uid: string; from: string; open: boolean })[] = [];
  /** выбранная связь в последнем кадре (для проверок и карточки связи): ключ, концы, точка у пути */
  linkSel: SelectedLinkInfo | null = null;
  /** обрывки наружу показа в последнем кадре (§ 7): щелчок открывает карточку того лица */
  stubHits: PlanStubHit[] = [];
  /** доля лент «по маршрутам» в этом кадре (§ 3; SkyContext.routeFactor) */
  routeFactor = 0;
  genRoom = 1;
  /** в этом кадре лица линий стоят на нитях (MAP-71): нити строятся по полосам раскладки */
  private beads = false;
  /** счётчик смены узлов кадра (семейная укладка, переход): ключ кэша связей */
  private nodesStamp = 0;
  get ribbonNodes(): readonly NodeRow[] {
    return this.beads ? this.model.nodes : this.nodes;
  }
  get linksKey(): string {
    const c = this.linkCache;
    return c ? `${c.key}|${c.x0}|${c.laneTop}|${c.kx}|${c.ky}|${c.exact ? 1 : 0}` : '';
  }
  linkVia(pk: string): { x: number; y: number } | null {
    const c = this.linkCache;
    const v = c?.frame.via.get(pk);
    if (!c || !v) return null;
    const dx = (c.x0 - this.cam.x0) * this.cam.kx;
    const dy = (this.cam.laneTop - c.laneTop) * this.cam.ky;
    return { x: v.x + dx, y: v.y + dy };
  }
  /**
   * Звёзды кадра для связей: нарисованные узлы полосы времени span (окно и ширина окна с каждой стороны; links.ts,
   * linkSpan; С1), те, чей след до неё доходит, и родители и супруги лиц полосы (links.ts, linkKinOf: предок «рода» за
   * сотни лет); за краем окна длинные связи и лестницы видны целиком. span = null — всё небо.
   */
  private linkStars(p: Pass, span: { x0: number; x1: number } | null): LinkStar[] {
    const cam = this.cam;
    const sx0 = span ? cam.sx(span.x0) : -Infinity;
    const sx1 = span ? cam.sx(span.x1) : Infinity;
    const out: LinkStar[] = [];
    const t: LifeTrail = {
      x0: 0,
      x1: 0,
      y: 0,
      cls: 'exact',
      known: true,
      solidTo: 0,
      color: '',
      width: 1,
    };
    const star = (i: number): LinkStar | null => {
      if (!this.drawn(i)) return null;
      const n = this.nodes[i];
      // лица свёрнутых скоплений-списков на небе не видны — и связей к ним нет
      if (n.block >= 0 && this.collapsed.has(n.block) && !(this.starA[i] > 0.02)) return null;
      const q = byId.get(n.person);
      if (!q) return null;
      const tr = trailOf(this, i, t);
      // звезда — в полосе рождения; у лица с переходами — ломаная следа той же выборкой, что рисует trails.ts (решение 173);
      // у жены в доме мужа с рождения — x, с которого след живой (Д7)
      const path = tr?.bends ? trailPolyline(tr) : undefined;
      const from = tr?.liveFrom;
      return {
        i,
        id: n.person,
        x: cam.sx(this.X0[i]),
        y: cam.sy(starLaneOf(n)),
        ...(path ? { path } : {}),
        ...(from !== undefined ? { from } : {}),
        r: starRadius(q.magnitude, p.zoomScale) + (q.sex === 'f' ? 2.2 : 0),
        x1: tr ? Math.max(tr.x0, tr.x1) : null,
        ghost: n.ghost,
        sat: n.satelliteOf,
      };
    };
    const taken = new Uint8Array(this.nodes.length);
    for (let i = 0; i < this.nodes.length; i++) {
      const st = span && cam.sx(this.X0[i]) > sx1 ? null : star(i);
      if (!st || Math.max(st.x, st.x1 ?? st.x) < sx0) continue;
      out.push(st);
      taken[i] = 1;
    }
    if (span) {
      // узлы лица: основной и призрак (жена в родном роду)
      const kin = linkKinOf(
        out.map((q) => q.id),
        ALL_UNIONS,
      );
      for (let i = 0; i < this.nodes.length; i++) {
        if (taken[i] || !kin.has(this.nodes[i].person)) continue;
        const st = star(i);
        if (st) out.push(st);
      }
      // порядок узлов — как у всего неба: сборка от него зависит
      out.sort((a, b) => a.i - b.i);
    }
    return out;
  }
  /** Связи кадра (кэш) и что из них нарисовать в этом кадре. */
  private linksFor(p: Pass, s: SkyState, detail: number): LinkDraw | null {
    const cam = this.cam;
    // семейная укладка — у показов «набор», «род лица», созвездий, линий (план Q2); прежний вызов без показа в режиме
    // набора (тесты, инструменты) — тоже семейная грамматика: у набора лестница союзов и «+N» свёрнутых союзов
    const family = this.plan.layout === 'family' || (!this.view.show && this.plan.mode === 'work');
    const L = s.layers;
    const st = L.ribbons
      ? skySteps(this, s, {
          joseph: lines.joseph.persons,
          mary: lines.mary.persons,
        })
      : null;
    // начертание шагов лент по словарю (этап 13, решение 94; ribbons.ts, stepWeak и stepLegal): точки — только
    // толкование (Илий → Мария), штрих — «по закону» и Нирий → Салафиил по Луке; «только у Луки» (Каинан) — сплошная.
    // Шаг за скрытыми показом лицами — «цепочка» (К4): сплошная, со знаком «+N» в разрыве
    const stepStyle = (ln: 'joseph' | 'mary', q: SkyStep): PathStyle | null => (q.gap ? null : stepWeak(q) ? 'dots' : stepLegal(ln, q) ? 'dash' : null);
    const styles = new Map<string, PathStyle>();
    const gaps = new Map<string, number>();
    if (st)
      for (const ln of ['joseph', 'mary'] as const)
        for (const q of st[ln]) {
          const y = stepStyle(ln, q);
          if (y) styles.set(`${ln}>${q.id}`, y);
          if (q.gap) gaps.set(`${ln}>${q.id}`, q.gap);
        }
    const lineIds = st
      ? {
          joseph: st.joseph.map((q) => q.id),
          mary: st.mary.map((q) => q.id),
          styles,
          gaps,
        }
      : null;
    const plates = s.plates?.length && !s.onlyLines ? s.plates : null;
    const base = [
      family ? 'f' : 'm',
      this.model.id,
      this.lambda,
      this.rowsKey,
      this.nodesStamp,
      !!L.ghosts,
      !!L.ribbons,
      s.lineFlip,
      lineIds ? `${lineIds.joseph.length}.${lineIds.mary.length}.${[...gaps.values()].join('.')}` : '',
      plates ? plates.map((q) => `${q.union.id}${q.open ? 1 : 0}`).join(',') : '',
    ].join('|');
    // что меняется само в движении: свёрнутые с масштабом скопления, «только нарисованные», размер холста (карточка
    // открылась во время перелёта)
    const key = `${base}|${[...this.collapsed].join(',')}|${this.drawnOnly ? 1 : 0}|${cam.w}|${cam.h}|${p.tier}`;
    let c = this.linkCache;
    // масштаб в движении (перелёт, колесо, щипок; С1) — кадр связей не строится: прежний пересчитывается (пути в px
    // масштабируются вокруг начала координат неба), и свёрнутые с масштабом скопления его не сбрасывают; дальше чем
    // вдвое от точной сборки связи не рисуются до остановки (links.ts, linkMotionNear); когда масштаб постоит — строится заново
    if (c && this.scaleMoving && c.base === base) {
      if (!linkMotionNear(cam.kx, cam.ky, c.kx0, c.ky0)) {
        this.linksStale = true;
        this.linkDraw = null;
        return null;
      }
      if (c.kx !== cam.kx || c.ky !== cam.ky) c = this.linkCache = rescaleLinks(c, cam);
    } else if (!c || c.key !== key || c.kx !== cam.kx || c.ky !== cam.ky || (!c.exact && !this.scaleMoving) || (!!c.span && !linkSpanOk(c.span, cam))) {
      const span = family ? null : linkSpan(cam);
      const stars = this.linkStars(p, span);
      const shown = (id: string) => {
        const i = this.nodeIndex.get(id);
        return i !== undefined && this.drawn(i);
      };
      const has = (id: string) => this.nodeIndex.has(id);
      const plateMap = plates
        ? new Map<string, LinkPlate>(
            plates.map((q) => [
              q.union.id,
              {
                open: q.open,
                hidden: q.open ? 0 : hiddenOf(q.union, shown, has),
                from: q.from,
                dir: q.dir,
              },
            ]),
          )
        : null;
      const frame = buildLinks({
        layout: family ? 'family' : 'map',
        stars,
        unions: ALL_UNIONS,
        ky: cam.ky,
        lines: lineIds,
        plates: plateMap,
        xOf: (id) => {
          const i = this.nodeIndex.get(id);
          return i === undefined ? null : cam.sx(this.X0[i]);
        },
        long: !family,
        nodeR: family ? NODE_R_FAMILY : NODE_R_MAP,
        units: family ? (this.plan.units ?? null) : null,
        flip: s.lineFlip,
        // уровень подробности семьи (решение 178), годы черт брака модели неба и x года (решение 174)
        tier: p.tier,
        xAt: (t) => cam.sx(this.xOf(t)),
        model: this.model,
      });
      c = this.linkCache = {
        key,
        base,
        x0: cam.x0,
        laneTop: cam.laneTop,
        kx: cam.kx,
        ky: cam.ky,
        kx0: cam.kx,
        ky0: cam.ky,
        exact: true,
        span,
        frame,
        hitGrid: null,
        stars,
      };
    }
    this.linksStale = !c.exact;
    const dx = (c.x0 - cam.x0) * cam.kx;
    const dy = (cam.laneTop - c.laneTop) * cam.ky;
    const ks = (k: LinkKey | null | undefined) => (k ? (linkKeyString(k) ?? '') : '');
    // раскрытые союзы: длинные связи — целиком (Г11: при наведении и выборе, у выбранного лица и его семьи)
    const expanded = new Set<string>();
    const add = (k: LinkKey | null | undefined) => {
      if (!k) return;
      if (k.kind === 'child' || k.kind === 'union' || k.kind === 'spouse') expanded.add(k.union);
    };
    add(s.link);
    add(s.linkHover);
    for (const k of s.linkPreview ?? []) add(k);
    for (const id of [s.selected, s.second]) {
      if (!id) continue;
      for (const u of ALL_UNIONS.of.get(id) ?? []) expanded.add(u.id);
      for (const u of ALL_UNIONS.origin.get(id) ?? []) expanded.add(u.id);
    }
    const hl = s.highlight;
    const d: LinkDraw = {
      frame: c.frame,
      dx,
      dy,
      expanded,
      hover: ks(s.linkHover),
      preview: new Set((s.linkPreview ?? []).map(ks)),
      selected: ks(s.link),
      alpha: detail,
      // выделенные связи (семья выбранного, путь) — в полную силу при любой подробности; остальные, и в показе «линии Мессии»,
      // проявляются с подробностью: на обзоре ленты — сплайн, стволов и ромбов у них нет (§ 3)
      // меридиан года («наверняка», «вероятно») подсвечивает живых, а не их связи (как у отводов, trails.ts, linkKind): связи
      // идут по уровням решения 178
      lit: (q) => !!(hl && q.ends.every((id) => { const k = hl.get(id); return k !== undefined && k !== 'sure' && k !== 'likely'; })),
    };
    // ярусы связей (решение 135; trails.ts, linkLooks): путь → ярус и непрозрачность; по ним же — попадание, разрывы, журнал
    d.look = linkLooks(this, p, d);
    this.linkDraw = d;
    return d;
  }
  /** Разрывы следов от нарисованных связей (Г7): номер узла → пары «x, полуширина» в px холста. */
  private cutsOf(d: LinkDraw, ribbons: boolean): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (const q of pathsWithCuts(d.frame)) {
      if (q.kind === 'ribbon' ? !ribbons || !linkShown(q, d) : !linkOn(q, d)) continue;
      for (let k = 0; k + 2 < q.cuts.length; k += 3) {
        const a = out.get(q.cuts[k]);
        const x = q.cuts[k + 1] + d.dx;
        if (a) a.push(x, q.cuts[k + 2]);
        else out.set(q.cuts[k], [x, q.cuts[k + 2]]);
      }
    }
    return out;
  }
  /**
   * Связи у точки (px холста) в радиусе r — нарисованные в последнем кадре, ближайшие первыми (§ 8). Звёзды ловит hit();
   * здесь — только линии и узлы связей.
   */
  linksAt(x: number, y: number, r: number, ribbons = true): LinkHit[] {
    const c = this.linkCache;
    const d = this.linkDraw;
    if (!c || !d || d.frame !== c.frame) return [];
    const out = this.linkHits!.at(x, y, r, d.dx, d.dy, (q) => (ribbons || q.kind !== 'ribbon') && linkOn(q, d));
    return out.length ? out : this.trailHits(x, y, r);
  }
  /**
   * Связи по участку следа родителя под точкой (решение 159; trails.ts, trailLinksAt): от звезды (или прежнего узла)
   * до узла союза след — путь родителя к союзу. Лицо и ключи связей дальше по следу, по порядку; null — у звезды ближе
   * r + 2, за последним узлом (там жизнь лица) или линий нет.
   */
  trailLinkAt(x: number, y: number, r = 6): { person: string; keys: LinkKey[] } | null {
    const c = this.linkCache;
    const d = this.linkDraw;
    if (!c || !d || d.frame !== c.frame || this.hitStar(x, y, r + 2)) return null;
    return trailLinksAt(this, d, x, y, r);
  }
  /** Связи участка следа под точкой как попадания по линиям (вид 'jog' — путь супруга к узлу союза по его следу). */
  private trailHits(x: number, y: number, r: number): LinkHit[] {
    const t = this.trailLinkAt(x, y, Math.max(r, 6));
    if (!t) return [];
    const i = this.nodeIndex.get(t.person);
    const ty = i !== undefined ? this.trailYAt(i, x) : y;
    return t.keys.map((key) => ({ key, ks: linkKeyString(key) ?? '', kind: 'jog' as const, d: Math.abs(y - ty), x, y: ty, union: 'union' in key ? key.union : null }));
  }
  /**
   * Лучшая связь у точки: узел — раньше линий, дальше — по расстоянию и старшинству вида (§ 8). ribbons = false — без
   * шагов лент: их ловит нарисованная нить (ribbons.ts, ribbonAt).
   */
  linkAt(x: number, y: number, r: number, ribbons = true): LinkHit | null {
    const c = this.linkCache;
    const d = this.linkDraw;
    if (!c || !d || d.frame !== c.frame) return null;
    const best = this.linkHits!.best(x, y, r, d.dx, d.dy, (q) => (ribbons || q.kind !== 'ribbon') && linkOn(q, d));
    if (best) return best;
    // след родителя до узла союза — связь этого союза (решение 159), если она одна; несколько — linksAt и «Какая связь?»
    const t = this.trailHits(x, y, r);
    return t.length === 1 ? t[0] : null;
  }
  /** Связи последнего кадра: пути и узлы (px холста — со сдвигом linkDraw.dx, dy). */
  linkFrame(): LinkDraw | null {
    return this.linkDraw;
  }
  /** Звёзды, по которым строились связи последнего кадра (перепись, тесты). */
  linkStarsNow(): readonly LinkStar[] {
    return this.linkCache?.stars ?? [];
  }

  // ---------- семейная укладка (§ 4.2) и переход (§ 10) ----------

  /** Узлы кадра с виртуальными полосами семейной укладки: копии узлов раскладки, номера те же. */
  private vNodes: { plan: SkyPlan; nodes: NodeRow[] } | null = null;
  /** Узлы кадра без перехода: общая раскладка или виртуальные полосы семейной укладки (SkyPlan.nodeLane). */
  private planNodes(): NodeRow[] {
    const pl = this.plan;
    const nl = pl.nodeLane;
    // прежний вызов набора без показа (тесты, инструменты): связи — семейной грамматикой (linksFor), полосы — общей
    // раскладки; переходов там нет — лицо на своей полосе жизни, как в семейной укладке (решение 173)
    if (!this.view.show && pl.mode === 'work' && pl.layout !== 'family') {
      if (this.vNodes?.plan === pl) return this.vNodes.nodes;
      const out = this.model.nodes.map((n) => (n.stays || (n.starLane !== undefined && n.starLane !== n.lane) ? { ...n, starLane: n.lane, stays: undefined } : n));
      this.vNodes = { plan: pl, nodes: out };
      this.nodesStamp++;
      return out;
    }
    if (pl.layout !== 'family' || !nl) {
      if (this.vNodes) {
        this.vNodes = null;
        this.nodesStamp++;
      }
      return this.model.nodes;
    }
    if (this.vNodes?.plan === pl) return this.vNodes.nodes;
    // семейная укладка ставит лицо в одну виртуальную полосу: пребывания и переходы общей раскладки (решение 173) к ней
    // не относятся — звезда и след на виртуальной полосе
    const out = this.model.nodes.map((n, i) => (Number.isFinite(nl[i]) && (Math.abs(nl[i] - n.lane) > 1e-9 || n.stays) ? { ...n, lane: nl[i], starLane: nl[i], stays: undefined } : n));
    // призраки укладки, которых нет среди узлов раскладки (бездетный брак у мужа, дочь в родной семье; решение 173), —
    // виртуальными узлами-призраками после узлов модели: знак у года союза (рождения), без следа
    for (const g of pl.extraGhosts ?? [])
      out.push({
        id: g.id, person: g.person, ghost: true, lane: g.lane, starLane: g.lane, t0: g.t, t1: g.t, block: -1, parentLane: null, layoutParent: null,
        satelliteOf: g.husband ?? byId.get(g.person)?.father ?? null, spine: false, trail: 'ghost', brk: null, band: null, born: null,
      });
    this.vNodes = { plan: pl, nodes: out };
    this.nodesStamp++;
    return out;
  }
  /** Узлы кадра: во время перехода (§ 10) — с промежуточными строками. */
  private frameNodes(): NodeRow[] {
    const base = this.planNodes();
    const tr = this.trans;
    if (!tr) return base;
    const t = performance.now() - tr.t0;
    if (t >= TRANS_MS) {
      this.trans = null;
      if (!tr.atBase) this.nodesStamp++;
      return base;
    }
    // строки встали (TRANS_MOVE позади): узлы — конечные, тот же массив до конца перехода (кэши кадра не сбрасываются)
    if (t >= TRANS_MOVE[1]) {
      if (!tr.atBase) {
        tr.atBase = true;
        this.nodesStamp++;
      }
      return base;
    }
    const u = transEase(Math.max(0, Math.min(1, (t - TRANS_MOVE[0]) / (TRANS_MOVE[1] - TRANS_MOVE[0]))));
    const rows = this.cam.rows;
    this.nodesStamp++;
    return base.map((n, i) => {
      const a = tr.from[i];
      const b = tr.to[i];
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < 1e-6) return n;
      const lane = rows.lane(a + (b - a) * u);
      return Math.abs(lane - n.lane) > 1e-9 ? shiftLane(n, lane) : n;
    });
  }
  /**
   * Переход между укладками (§ 10; решение 85): строки едут только по вертикали, опора неподвижна. from, to — строки
   * узлов до и после (NaN — узла нет на небе), leaving — уходящие (гаснут на месте первые 150 мс).
   */
  private trans: {
    t0: number;
    from: Float64Array;
    to: Float64Array;
    /** строки уже конечные (переход в фазе проявления связей) */
    atBase?: boolean;
    leaving: { i: number; row: number }[];
  } | null = null;
  /**
   * Плавный переход при смене показа, раскрытии и свёртке (SkyView ставит его, если движение не ослаблено); по умолчанию —
   * сразу конечный кадр (небо без атласа: тесты, перепись, образец).
   */
  animate = false;
  /** Идёт переход: небо просит кадры, пока он не кончится (SkyView). */
  get transitioning(): boolean {
    return !!this.trans;
  }
  /** Доля перехода от 0 до 1; 1 — перехода нет. */
  transitionT(): number {
    return this.trans ? Math.min(1, (performance.now() - this.trans.t0) / TRANS_MS) : 1;
  }
  /** Сразу конечный кадр перехода: любой ввод во время перехода (§ 10). */
  endTransition() {
    if (!this.trans) return;
    this.trans = null;
    this.nodesStamp++;
    this.nodes = this.frameNodes();
    this.cam.onChange();
  }
  /**
   * Места виртуальных узлов (призраки семейной укладки после узлов модели, planNodes): x знака и яркость — массивы неба
   * растут под них, x считаются каждый кадр (узлов — единицы).
   */
  private fitArrays() {
    const N = this.nodes.length;
    const M = this.model.nodes.length;
    if (N <= M) return;
    if (this.X0.length < N) {
      const grow = <T extends Float64Array | Float32Array>(a: T, make: (n: number) => T): T => {
        const b = make(N);
        b.set(a);
        return b;
      };
      this.X0 = grow(this.X0, (n) => new Float64Array(n));
      this.X1 = grow(this.X1, (n) => new Float64Array(n));
      this.starA = grow(this.starA, (n) => new Float32Array(n).fill(1));
    }
    for (let i = M; i < N; i++) {
      this.X0[i] = timeToX(this.scale, this.nodes[i].t0, this.lambda);
      this.X1[i] = timeToX(this.scale, this.nodes[i].t1, this.lambda);
    }
  }
  /** Строки узлов сейчас (NaN — узел не на небе). */
  private rowsNow(): Float64Array {
    const out = new Float64Array(this.nodes.length).fill(NaN);
    const hid = this.plan.hidden;
    for (let i = 0; i < this.nodes.length; i++) if (!(hid && hid[i])) out[i] = this.cam.rows.row(this.nodes[i].lane);
    return out;
  }
  /** Начать переход: прежние строки before (в строках прежнего плана), сдвиг верха неба shift (строк). */
  private startTransition(before: Float64Array, shift: number) {
    const to = this.rowsNow();
    const from = new Float64Array(to.length);
    let moved = false;
    const leaving: { i: number; row: number }[] = [];
    for (let i = 0; i < to.length; i++) {
      from[i] = Number.isFinite(before[i]) ? before[i] + shift : NaN;
      const a = Number.isFinite(from[i]);
      const b = Number.isFinite(to[i]);
      if (a && b && Math.abs(from[i] - to[i]) > 0.02) moved = true;
      else if (a && !b) leaving.push({ i, row: from[i] });
      else if (!a && b) moved = true;
    }
    if (!moved && !leaving.length) return;
    this.trans = { t0: performance.now(), from, to, leaving };
    this.nodes = this.frameNodes();
  }

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
    // пороги подписей сами видят смену высоты, «всего неба» и указателя (LabelCache.ensure): ширина неба меняется при
    // каждом выборе (карточка) — пересчёт порогов откладывается, пока небо не постоит (С1)
    this.updateView();
  }

  /**
   * Высота строки семейной укладки на узком небе (уже 600 px) и касании (§ 4.2; Я12): на масштабе чтения кривая
   * «масштаб → высота строки» сдвинута (ROW_SHIFT_TALL) и до KY_MAX_TALL (34 px) — строка не ниже 32 px с меньшим
   * приближением времени; на мелком масштабе — как на карте. На широком небе — как на карте. w — ширина видимой части.
   */
  private rowScale(w = this.cam.vp.r - this.cam.vp.l > 0 ? this.cam.vp.r - this.cam.vp.l : this.cam.w) {
    const cam = this.cam;
    const family = !!this.plan && this.plan.layout === 'family';
    const tall = family && w > 0 && (w < 600 || this.coarse);
    cam.rowCap = tall ? KY_MAX_TALL : KY_MAX;
    cam.rowShift = tall ? ROW_SHIFT_TALL : 0;
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
    return {
      x0: this.xOf(this.scale.knots[0]),
      x1: this.xOf(100),
      lane0: r.min,
      lane1: r.max,
    };
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
    // высота строки семейной укладки — по ширине видимой части (узкое небо — строки выше)
    this.rowScale(vp.r - vp.l);
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
        .map((b) => ({
          block: b.id,
          c: b.cluster!,
          lane: (b.laneMin + b.laneMax) / 2,
          laneMin: b.laneMin,
          laneMax: b.laneMax,
        }));
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
    const next: SkyViewIn = {
      ...v,
      gaps: v.gaps ?? this.gapsFor(v),
      reveal: v.mode === 'work' && !!v.plates?.length,
    };
    // набор в режиме «Всё небо» на небо не влияет
    // показ (этап 11; src/ui/show.ts, skyShow): план строится по нему — смена показа узнаётся по его ключу
    const same =
      v.show || this.view.show
        ? (v.show?.key ?? '') === (this.view.show?.key ?? '') &&
          v.foldDesc.join() === this.view.foldDesc.join() &&
          v.foldGroups.join() === this.view.foldGroups.join()
        : v.mode === this.view.mode &&
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
    // опора (§ 10): лицо в фокусе остаётся на своей высоте экрана; без него — середина видимой части
    let hold: { i: number | null; lane: number; sy: number } | null = null;
    if (keep && this.cam.w > 0) {
      const i = anchor ? this.nodeIndex.get(anchor) : undefined;
      const [, cy] = this.cam.vpCenter();
      if (i !== undefined && !plan.hidden?.[i] && !this.plan.hidden?.[i])
        hold = {
          i,
          lane: this.nodes[i].lane,
          sy: this.cam.sy(this.nodes[i].lane),
        };
      else hold = { i: null, lane: old.lane(this.cam.wLane(cy)), sy: cy };
    }
    // прежние строки узлов — для перехода (§ 10): строки едут по вертикали от прежних к новым
    const before = keep && this.cam.w > 0 && this.nodes.length === m.nodes.length ? this.rowsNow() : null;
    const topBefore = this.cam.laneTop;
    this.plan = plan;
    this.rowScale();
    this.cam.rows = plan.rows;
    // полос в сжатом небе — строк: от неё зависит самая низкая полоса (Camera.kyMin)
    this.cam.laneSpan = plan.rows.max - plan.rows.min - 1;
    this.labelCache.invalidate();
    if (this.scale && this.lambda >= 0) this.updateView();
    this.trans = null;
    this.nodes = this.frameNodes();
    if (hold) {
      const lane = hold.i !== null && Number.isFinite(this.nodes[hold.i].lane) ? this.nodes[hold.i].lane : hold.lane;
      this.cam.laneTop = plan.rows.row(lane) + hold.sy / this.cam.ky;
    }
    if (before && this.animate) this.startTransition(before, this.cam.laneTop - topBefore);
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
  /**
   * Кто гость показа лицам показа (X3 Д10): «жена Ашхура», «муж Руфи», «мать Авессалома», «отец Иоава» — по первому
   * супругу, затем ребёнку в показе; имя склоняется (src/ui/text/ru.ts, nameCase), не склоняется — null.
   */
  guestWho(id: string): string | null {
    const q = byId.get(id);
    const ids = this.view.show?.ids;
    if (!q || !ids) return null;
    const inShow = (x: string | null | undefined) => !!x && x !== id && ids.has(x) && !this.hides(x);
    const gen = (x: string) => {
      const o = byId.get(x);
      return o ? nameCase(o.name, o.sex, 'gen', o.unnamed) : null;
    };
    for (const e of graph.spousesOf.get(id) ?? []) {
      const o = e.a === id ? e.b : e.a;
      const g = inShow(o) ? gen(o) : null;
      if (!g) continue;
      // слово союза — как у роли связи (G12; linkwords.ts): наложница — «наложница Халева», не «жена»
      const u = (ALL_UNIONS.of.get(id) ?? []).find((x) => (x.a === id && x.b === o) || (x.b === id && x.a === o));
      const role = u ? linkRoleOf({ kind: 'spouse', union: u.id, person: id }, id) : null;
      return `${role === 'наложница' ? 'наложница' : q.sex === 'f' ? 'жена' : 'муж'} ${g}`;
    }
    for (const e of graph.childrenOf.get(id) ?? []) {
      const g = inShow(e.child) ? gen(e.child) : null;
      if (g) return `${q.sex === 'f' ? 'мать' : 'отец'} ${g}`;
    }
    return null;
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

  /** Местный масштаб времени у середины видимой части неба, px на год (решение 178: уровни подробности семьи). */
  pxPerYear(): number {
    const cam = this.cam;
    const cx = cam.vp.r > cam.vp.l ? (cam.vp.l + cam.vp.r) / 2 : cam.w / 2;
    const t = this.tOf(cam.wx(cx));
    const k = (this.xOf(t + 0.5) - this.xOf(t - 0.5)) * cam.kx;
    return Number.isFinite(k) && k > 0 ? k : cam.kx;
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
   * Вид для команды «Вписать» (Я30: «весь нынешний показ в окне»; J4): все лица показа — в окне, и в семейной укладке
   * тоже, даже если строки выйдут ниже 24 px. Высота строки семейной укладки (Я12) держится при открытии показа
   * (fitState: небо у опоры, остальное — сдвигом), а «Вписать» — явная просьба показать всё.
   */
  fitWholeState(): ViewState {
    return (this.plan.mode === 'work' && this.fitShown(false, true)) || this.cam.fitView(this.fitFrame());
  }
  /**
   * Вид, в который вписано то, что раскрыто в небе «набор» (J4; решение 76): по времени — звёзды набора и точки их
   * союзов, не уже 60 лет, справа — место для имени; следы жизни — только если они удлиняют окно не больше чем на треть
   * (FIT_TRAIL): иначе долгий след (Адам — 930 лет) прижал бы раскрытое родословие к левому краю; trails — со всеми
   * следами (предел отдаления, fitWideState). По высоте — все строки в видимой части (высота строки следует за
   * масштабом: если строки не помещаются, масштаб уменьшается, пока не поместятся). whole — без предела высоты строки
   * семейной укладки («Вписать», fitWholeState).
   */
  private fitShown(trails: boolean, whole = false): ViewState | null {
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
      // строка показа стоит в 12 px от верхней кромки (sky.css, .skytop) — тоже верхний орган
      else if (r.y <= vp.t + 24 && r.y + r.h < (vp.t + vp.b) / 2) top = Math.max(top, r.y + r.h + 4);
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
    // семейная укладка (§ 4.2; Я12): строка не ниже 24 px (на узком небе — 32 px): не помещается — небо у опоры, остальное
    // уходит за край и доступно сдвигом. Только для «Вписать» (fitState): предел отдаления (fitWideState, trails) — по
    // всему показу, иначе на узком небе нельзя было бы отдалить дальше окна в две сотни лет
    if (this.plan.layout === 'family' && !trails && !whole) {
      const k1 = this.familyKx(kx, xc);
      if (k1 > kx && cam.kyFor(k1) > cam.kyFor(kx)) {
        const i = this.plan.anchor ? this.nodeIndex.get(this.plan.anchor) : undefined;
        const row = i !== undefined && !(hid && hid[i]) ? cam.rows.row(this.nodes[i].lane) : (cam.rows.min + cam.rows.max) / 2;
        const ax = i !== undefined && !(hid && hid[i]) ? this.X0[i] : xc;
        const w1 = (vp.r - vp.l - FIT_SET.l - FIT_SET.r) / k1;
        const xm = Math.min(Math.max(ax, x0 + w1 / 2), Math.max(x0 + w1 / 2, x1 - w1 / 2));
        return {
          x0: xm - (vp.l + FIT_SET.l + (vp.r - vp.l - FIT_SET.l - FIT_SET.r) / 2) / k1,
          kx: k1,
          laneTop: row + cy / cam.kyFor(k1),
        };
      }
    }
    // отдалить до всего показа нельзя (предел отдаления — всё небо, а показ с полями шире: «линии Мессии» от Адама):
    // начало показа — у левого поля, срезается правый запас под имена, а не первая звезда
    return {
      x0: Math.min(xc - (vp.l + FIT_SET.l + W / 2) / kx, x0 - (vp.l + FIT_SET.l) / kx),
      kx,
      laneTop: (cam.rows.min + cam.rows.max) / 2 + cy / cam.kyFor(kx),
    };
  }
  /**
   * Масштаб семейной укладки (§ 4.2; Я12): строка не ниже 24 px (на узком небе и касании — 32 px), но не выше предела
   * камеры (KY_MAX: недостижимая высота — не повод приближать до упора). kx — масштаб по окну; вне семейной укладки и если
   * строки и так высокие — он же. Для «Вписать» (fitShown) и перелёта к лицу (src/ui/sky/view.ts, viewForPerson).
   */
  familyKx(kx: number, atX: number): number {
    const cam = this.cam;
    if (this.plan.layout !== 'family') return kx;
    const vp = cam.vp;
    const reach = cam.kyFor(cam.clampKx(Number.MAX_VALUE, atX));
    const need = Math.min(vp.r - vp.l < 600 || this.coarse ? FAMILY_ROW.narrow : FAMILY_ROW.wide, reach - 0.5);
    if (!(cam.kyFor(kx) < need)) return kx;
    let lo = kx;
    let hi = Math.max(kx * 2, KX_MIN);
    for (let k = 0; k < 30 && cam.kyFor(hi) < need; k++) hi *= 2;
    for (let k = 0; k < 40; k++) {
      const mid = Math.sqrt(lo * hi);
      if (cam.kyFor(mid) < need) lo = mid;
      else hi = mid;
    }
    return cam.clampKx(hi, atX);
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
        this.outlineViews.push({
          o,
          foreign: !!groupById.get(o.group)?.foreign,
          rings,
          t0,
          t1,
          l0,
          l1,
        });
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
      this.outlines.push({
        block: b.id,
        group: b.group,
        foreign: !!groupById.get(b.group)?.foreign,
        poly,
        size: ns.length,
      });
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
    return (this.starA[i] ?? 1) >= 0.5 && !this.piled.has(i);
  }

  // ---------- скопления семьи (решение 142) ----------
  /** Узлы, чьи знаки в этом кадре собраны в скопление старшего (не рисуются, не ловят указатель, без подписи). */
  private piled = new Set<number>();
  /** созвездия кадра, в чьей области нет места без звёзд для названия (canvas[data-group-areas] «:3») */
  private groupNoRoom = new Set<string>();
  /** Скопления этого кадра: узел старшего → узлы, собранные в его знак. */
  private piles = new Map<number, number[]>();
  /**
   * Прореженные без выбранного лица (решение 142 на обзоре и любом масштабе; инвариант 13): знак, который лёг бы на знак
   * значимее (зазор по настоящим фигурам < 1 px), не рисуется и не ловит указатель до приближения; лицо — в списке неба
   * (#sky-stars, reachable) и в скрытых подписях. Считается при смене масштаба и показа, а не в каждом кадре.
   */
  private thin = new Set<number>();
  private thinKey = '';
  private thinRefs: unknown[] = [];
  private thinR = new Map<string, Float64Array>();
  /** знак узла i прорежен (не нарисован: лёг бы на знак значимее; решение 142) */
  thinned(i: number | string): boolean {
    const k = typeof i === 'string' ? this.nodeIndex.get(i) : i;
    return k !== undefined && this.thin.has(k);
  }
  /**
   * Прореживание знаков без выбранного (решение 142): в мировых координатах масштаба (сдвиг окна его не меняет) — сеткой
   * 16 px по всем узлам показа; рисуется значимый (меньшая величина, лицо ленты, старший по рождению), остальные — нет.
   * Наведённое, лицо с фокусом, отметки и концы выбранной связи не прореживаются.
   */
  private thinOut(p: Pass) {
    const { cam } = this;
    const s = p.s;
    const keep = new Set([s.hovered, s.focus, ...s.pins, ...(s.link ? linkRoles(s.link).map((e) => e.id) : [])].filter((x): x is string => !!x));
    // масштаб — ступенями 1/16 октавы: места знаков считаются при ступени не крупнее настоящей (знаки ближе), размер знака —
    // при ступени не мельче (знаки больше), поэтому зазор нарисованных и между ступенями не меньше 1 px; при сдвиге окна и
    // наведении (подсветки связи, союза, меридиана) не пересчитывается
    const qd = (k: number) => 2 ** (Math.floor(Math.log2(k) * 16) / 16);
    const kx = qd(cam.kx);
    const ky = qd(cam.ky);
    const scale = zoomScaleFor(2 ** (Math.ceil(Math.log2(cam.ky) * 16) / 16));
    const key = `${this.model?.id}|${kx}|${ky}|${cam.rows.key}|${this.nodes.length}|${p.starDetail > 0.02}|${Math.ceil(s.intro * 7)}|${s.onlyLines}|${s.layers.ghosts}|${[...this.collapsed].join(',')}|${[...keep].join(',')}`;
    if (key === this.thinKey && this.thinRefs[0] === this.plan && this.thinRefs[1] === s.highlight) return;
    this.thinKey = key;
    this.thinRefs = [this.plan, s.highlight];
    const thin = new Set<number>();
    const all: { i: number; x: number; y: number; R: number; m: number; sp: boolean; keep: boolean }[] = [];
    // вынос знака узла при этой ступени масштаба — один раз на модель и ступень (их не больше полутора десятков)
    const rk = `${this.model.id}|${this.nodes.length}|${scale}`;
    let RR = this.thinR.get(rk);
    if (!RR) {
      if (this.thinR.size > 32) this.thinR.clear();
      RR = new Float64Array(this.nodes.length).fill(-1);
      this.thinR.set(rk, RR);
    }
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.ghost || !this.starShown(s, i)) continue;
      const q = byId.get(n.person);
      if (!q) continue;
      // все показанные знаки, и бледные мелкие (их пунктирные кружки иначе слипаются в пятна); приглушение подсветкой не
      // учитывается — иначе знаки появлялись бы при наведении
      if (RR[i] < 0) {
        const e = glyphExtent({ ...personGlyph(q, false, this.model.chrono.get(n.person)?.cls, { scale, color: '', halo: '' }), king: false, infant: false });
        RR[i] = Math.max(e.l, e.r, e.t, e.b);
      }
      all.push({ i, x: this.X0[i] * kx, y: this.rowOf(starLaneOf(n)) * ky, R: RR[i], m: q.magnitude, sp: p.spine.has(q.id), keep: keep.has(q.id) });
    }
    all.sort((a, b) => Number(b.keep) - Number(a.keep) || a.m - b.m || Number(b.sp) - Number(a.sp) || a.x - b.x || a.i - b.i);
    // ячейка сетки не меньше суммы двух наибольших знаков: соседей ищут только в соседних ячейках
    const C = Math.max(16, Math.ceil(2 * all.reduce((m, b) => Math.max(m, b.R), 0) + 1));
    const grid = new Map<number, typeof all>();
    const cell = (cx: number, cy: number) => cx * 1_000_003 + cy;
    const host = new Map<number, number>();
    for (const b of all) {
      const cx = Math.floor(b.x / C);
      const cy = Math.floor(b.y / C);
      let hit: (typeof all)[number] | null = null;
      if (!b.keep)
        for (let x = cx - 1; x <= cx + 1 && !hit; x++)
          for (let y = cy - 1; y <= cy + 1 && !hit; y++)
            for (const k of grid.get(cell(x, y)) ?? [])
              if (Math.hypot(k.x - b.x, k.y - b.y) < k.R + b.R + 1) {
                hit = k;
                break;
              }
      if (hit) {
        thin.add(b.i);
        host.set(b.i, hit.i);
        continue;
      }
      const g = grid.get(cell(cx, cy));
      if (g) g.push(b);
      else grid.set(cell(cx, cy), [b]);
    }
    this.thin = thin;
    this.thinHost = host;
  }
  /** Знак, в который собран прореженный узел (решение 142): узел → узел нарисованного знака значимее. */
  private thinHost = new Map<number, number>();
  /**
   * Лица, собранные в нарисованный знак лица id (решение 142, без выбранного): пусто — знак одиночный. Для касания и
   * щелчка (src/ui/sky/input.ts): знак с собранными — приближение к нему, одиночный — выбор.
   */
  thinMembers(id: string): string[] {
    const k = this.nodeIndex.get(id);
    if (k === undefined || !this.thin.size) return [];
    const out: string[] = [];
    for (const [i, h] of this.thinHost) if (h === k) out.push(this.nodes[i].person);
    return out;
  }
  /**
   * Знак не ложится на знак (решение 142; C6): яркие знаки (выделенная семья на обзоре, бусины лент), которые легли бы
   * друг на друга, собираются в скопление — рисуется знак старшего, у его подписи — «+N». Старший — выбранное, второе,
   * наведённое и лицо с фокусом, отметки и концы выбранной связи, затем по величине, линиям Мессии и значимости. Сетка
   * 16 px — без перебора пар; на масштабе семьи (полоса от 14 px) знаки не сходятся, и скоплений нет.
   */
  private pileUp(p: Pass) {
    this.piled.clear();
    this.piles.clear();
    const { cam } = this;
    const s = p.s;
    // без выбранного лица (решение 142, расширено на обзор и любой масштаб; инвариант 13, К1 = 0): знаки, которые легли бы
    // друг на друга, прорежены — рисуется самый значимый, без «+N»
    if (!s.selected && !p.work) {
      this.thinOut(p);
      for (const i of this.thin) this.piled.add(i);
      p.thinned = this.thin;
      return;
    }
    this.thin = new Set();
    this.thinHost = new Map();
    this.thinKey = '';
    // только при выделенной семье и только на обзоре (решение 142): на масштабе семьи (строка от 14 px) все знаки рисуются
    if (p.work || !s.selected || !s.highlight || cam.ky >= FAMILY_KY) return;
    const keep = new Set([s.selected, s.second, s.hovered, s.focus, ...s.pins, ...(s.link ? linkRoles(s.link).map((e) => e.id) : [])].filter((x): x is string => !!x));
    const bright: { i: number; x: number; y: number; R: number; q: { magnitude: number; prominence: number; id: string } }[] = [];
    const scale = p.zoomScale;
    for (const i of p.vis) {
      const n = this.nodes[i];
      if (n.ghost || !this.starShown(s, i)) continue;
      const q = byId.get(n.person);
      if (!q) continue;
      const lit = Math.max(0, Math.min(1, s.intro * 7 - q.magnitude));
      if (p.emph(q.id) * lit * this.starA[i] <= 0.8) continue;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(starLaneOf(n));
      if (x < -20 || x > cam.w + 20 || y < -20 || y > cam.h + 20) continue;
      const e = glyphExtent({ ...personGlyph(q, false, this.model.chrono.get(n.person)?.cls, { scale, color: '', halo: '' }), king: false, infant: false });
      bright.push({ i, x, y, R: Math.max(e.l, e.r, e.t, e.b), q });
    }
    if (bright.length < 2) return;
    const spine = p.spine;
    bright.sort((a, b) => Number(keep.has(b.q.id)) - Number(keep.has(a.q.id)) || a.q.magnitude - b.q.magnitude || Number(spine.has(b.q.id)) - Number(spine.has(a.q.id)) || b.q.prominence - a.q.prominence || a.i - b.i);
    const C = 16;
    const grid = new Map<number, typeof bright>();
    const cell = (x: number, y: number) => (Math.floor(x / C) + 4096) * 8192 + Math.floor(y / C) + 4096;
    for (const b of bright) {
      let host: (typeof bright)[number] | null = null;
      if (!keep.has(b.q.id))
        for (let cx = Math.floor(b.x / C) - 1; cx <= Math.floor(b.x / C) + 1 && !host; cx++)
          for (let cy = Math.floor(b.y / C) - 1; cy <= Math.floor(b.y / C) + 1 && !host; cy++)
            for (const k of grid.get((cx + 4096) * 8192 + cy + 4096) ?? [])
              if (Math.hypot(k.x - b.x, k.y - b.y) < k.R + b.R + 0.6) {
                host = k;
                break;
              }
      if (host) {
        this.piled.add(b.i);
        const a = this.piles.get(host.i);
        if (a) a.push(b.i);
        else this.piles.set(host.i, [b.i]);
        continue;
      }
      const k = cell(b.x, b.y);
      const a = grid.get(k);
      if (a) a.push(b);
      else grid.set(k, [b]);
    }
    // имя выбранного на обзоре (решение 142): сначала — место без жертв (четыре стороны, углы, выноска ≤ 40 px мимо
    // знаков); нет такого — яркие знаки ЕГО СЕМЬИ на месте имени собираются в его скопление «+N» (только семья; чужой
    // знак не собирается — тогда имя уходит или скрыто, как у всех). На масштабе семьи (строка от 14 px) скоплений нет
    const sel = s.selected ? this.nodeIndex.get(s.selected) : undefined;
    const host = sel !== undefined ? bright.find((b) => b.i === sel) : undefined;
    if (host && cam.ky < FAMILY_KY) {
      const q = byId.get(this.nodes[host.i].person)!;
      this.ctx.font = labelFontOf(this, host.i);
      const w = this.ctx.measureText(q.name).width + 34;
      const size = nameSize(q.magnitude, this.coarse);
      const r0 = starRadius(q.magnitude, scale);
      const ext = { l: host.R, r: host.R, t: host.R, b: host.R };
      const R = host.R + 1;
      // знаки кадра у имени (все видимые, не только яркие): по ним — свободно ли место
      const near: { i: number; x: number; y: number; R: number; fam: boolean }[] = [];
      for (const i of p.vis) {
        if (i === host.i || this.piled.has(i) || !this.starShown(s, i)) continue;
        const n = this.nodes[i];
        const x = cam.sx(this.X0[i]);
        const y = cam.sy(starLaneOf(n));
        if (Math.abs(x - host.x) > w + 60 || Math.abs(y - host.y) > 60) continue;
        const o = byId.get(n.person);
        if (!o) continue;
        const k = s.highlight?.get(o.id);
        near.push({ i, x, y, R: starRadius(o.magnitude, scale) + (o.sex === 'f' ? 2.65 : 0), fam: !n.ghost && k !== undefined && k !== 'sure' && k !== 'likely' && !keep.has(o.id) && bright.some((b) => b.i === i) });
      }
      const under = (b: Rect) => near.filter((g) => g.x + g.R > b.x && g.x - g.R < b.x + b.w && g.y + g.R > b.y && g.y - g.R < b.y + b.h);
      const boxes: Rect[] = [
        ...(['r', 'l', 't', 'b'] as const).map((sd) => spot(sd, host.x, host.y, r0, w, size, false, ext).box),
        ...LEAD_TRY.filter(([dx, dy]) => Math.hypot(dx, dy) - R <= 40).map(([dx, dy]) => textBox(dx > 0 ? host.x + dx + 2 : host.x + dx - 2 - w, host.y + dy + 0.28 * size, w, size)),
      ];
      if (!boxes.some((b) => under(b).length === 0)) {
        // место, где под именем только семья: справа, слева, над, под — первое такое
        const side = boxes.slice(0, 4).find((b) => under(b).every((g) => g.fam));
        if (side)
          for (const g of under(side)) {
            this.piled.add(g.i);
            const own = this.piles.get(g.i) ?? [];
            this.piles.delete(g.i);
            this.piles.set(host.i, [...(this.piles.get(host.i) ?? []), g.i, ...own]);
          }
      }
    }
    if (this.piles.size) p.pileText = new Map([...this.piles].map(([i, m]) => [this.nodes[i].person, `+${m.length}`]));
  }
  /** Скопления семьи последнего кадра: лицо старшего и собранные в его знак (решение 142; для проверок и «Ближайшей родни»). */
  /** Прореженные группами «знак:собранные через запятую» (замер canvas[data-thin]). */
  private thinGroups(): string[] {
    const g = new Map<number, string[]>();
    for (const [i, h] of this.thinHost) (g.get(h) ?? g.set(h, []).get(h)!).push(this.nodes[i].person);
    return [...g].map(([h, m]) => `${this.nodes[h].person}:${m.join(',')}`);
  }
  pilesNow(): { id: string; members: string[] }[] {
    return [...this.piles].map(([i, m]) => ({ id: this.nodes[i].person, members: m.map((k) => this.nodes[k].person) }));
  }

  /** Лицо, чья подпись под точкой (px холста), рамка не ниже least px (контракт 2; решение 154: касание имени). */
  labelAt(x: number, y: number, least = 24): string | null {
    return labelAt(this.ledger.boxes, x, y, least);
  }
  /** Скрытые подписи последнего кадра (контракт 2): лица видимых звёзд без подписи — для экранного диктора. */
  hiddenLabels(): readonly string[] {
    return this.ledger.hidden;
  }

  /** Звезда нарисована и лежит в открытой части неба — её можно навести, щёлкнуть и выбрать с клавиатуры. */
  reachable(i: number | string): boolean {
    if (typeof i === 'string') {
      const k = this.nodeIndex.get(i);
      if (k === undefined) return false;
      i = k;
    }
    // прореженный знак (решение 142) — в списке неба и с клавиатуры: фокус его проявляет
    if (!this.drawn(i) || (!this.pointable(i) && !(this.thin.has(i) && this.starA[i] >= 0.5))) return false;
    const x = this.cam.sx(this.X0[i]);
    const y = this.starY(i);
    return x > this.letterW && x < this.cam.w && y > this.openTop && y < this.cam.vp.b;
  }

  hit(sx: number, sy: number, radius = 12): string | null {
    return this.hitStar(sx, sy, radius)?.id ?? this.hitTrail(sx, sy);
  }
  /** Звезда под указателем в радиусе radius (px холста): ближайшая и расстояние до её середины; без следов. */
  hitStar(sx: number, sy: number, radius = 12): { id: string; d: number } | null {
    const cam = this.cam;
    // линейка, левая и нижняя кромки и ярусы эпох закрывают звёзды под собой
    if (sy < this.openTop || sx < this.letterW || sy > cam.vp.b) return null;
    let best: string | null = null;
    let bestD = radius * radius;
    const ky = cam.ky;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(starLaneOf(n));
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
    return best ? { id: best, d: Math.sqrt(bestD) } : null;
  }
  /** След жизни под указателем (px холста): лицо; последнее по старшинству попадания (§ 8: «… > лента > след»). */
  hitTrail(sx: number, sy: number): string | null {
    const cam = this.cam;
    if (sy < this.openTop || sx < this.letterW || sy > cam.vp.b) return null;
    const ky = cam.ky;
    const r = Math.max(3, ky * 0.35);
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      // след с переходами (решение 173) — ломаная: пребывания и S-кривые; наведение на переход — само лицо (решение 179)
      if (hasGlides(n)) {
        if (!this.drawn(i) || !this.pointable(i)) continue;
        if (this.trailDist(i, sx, sy) <= r) return n.person;
        continue;
      }
      const y = cam.sy(n.lane);
      if (Math.abs(y - sy) > r) continue;
      if (!this.drawn(i) || !this.pointable(i)) continue;
      if (sx >= cam.sx(this.X0[i]) && sx <= cam.sx(this.X1[i])) return n.person;
    }
    return null;
  }
  liveYear(i: number): number | null {
    const n = this.nodes[i];
    if (!n || n.ghost) return null;
    // семейная укладка: строка жены «в семье мужа» — с года since (src/engine/family.ts, FamilyResult.since)
    if (this.plan.layout === 'family') return this.plan.since?.get(n.person) ?? null;
    return n.wed ?? null;
  }
  /** Высота звезды узла i, px холста: полоса рождения (решение 173; src/engine/stays.ts, starLaneOf). */
  starY(i: number): number {
    return this.cam.sy(starLaneOf(this.nodes[i]));
  }
  /** Высота следа узла i над x (px холста): полоса в год под x — пребывание или переход (договор 1, laneAt). */
  trailYAt(i: number, sx: number): number {
    const n = this.nodes[i];
    return this.cam.sy(hasGlides(n) ? laneAt(n, this.tOf(this.cam.wx(sx))) : n.lane);
  }
  /** Переходы следа узла i в px холста (trails.ts, bendsOf); null — переходов нет. */
  bendsOf(i: number): Bend[] | null {
    return bendsOf(this, this.nodes[i]);
  }
  /** Пересечения переходов с чужими следами по узлам кадра (решение 173): след j, год (астр.), лицо перехода g. */
  private glideX: { nodes: readonly NodeRow[]; hits: { j: number; t: number; g: number }[] } | null = null;
  private glideCrossings(): { j: number; t: number; g: number }[] {
    if (this.glideX?.nodes === this.nodes) return this.glideX.hits;
    // переход между укладками и бусины «только линий» — узлы каждого кадра новые: разрывов под переходами нет
    if (this.trans || this.beads) return [];
    const nodes = this.nodes;
    const hits: { j: number; t: number; g: number }[] = [];
    const gl: number[] = [];
    for (let i = 0; i < nodes.length; i++) if (hasGlides(nodes[i]) && !nodes[i].ghost) gl.push(i);
    if (gl.length) {
      // горизонтали следов по полосам: узел и годы пребывания
      const byLane = new Map<number, number[]>();
      const put = (lane: number, j: number, a: number, b: number) => {
        const q = byLane.get(lane);
        if (q) q.push(j, a, b);
        else byLane.set(lane, [j, a, b]);
      };
      for (let j = 0; j < nodes.length; j++) {
        const n = nodes[j];
        if (n.ghost || n.trail !== 'life' || !(n.t1 > n.t0)) continue;
        if (hasGlides(n)) for (const st of n.stays!) put(st.lane, j, Math.max(n.t0, st.t0), Math.min(n.t1, st.t1));
        else put(n.lane, j, n.t0, n.t1);
      }
      const lanes = [...byLane.keys()].sort((a, b) => a - b);
      for (const gi of gl)
        for (const g of glidesOf(nodes[gi])) {
          const lo = Math.min(g.from, g.to);
          const hi = Math.max(g.from, g.to);
          if (!(hi - lo > 1e-6) || !(g.t1 > g.t0)) continue;
          for (const L of lanes) {
            if (L <= lo + 1e-6) continue;
            if (L >= hi - 1e-6) break;
            // доля пути S-кривой (smoothstep) до полосы L — обратная ступень бисекцией
            const u = (L - g.from) / (g.to - g.from);
            let a = 0;
            let b = 1;
            for (let k = 0; k < 24; k++) {
              const m = (a + b) / 2;
              if (m * m * (3 - 2 * m) < u) a = m;
              else b = m;
            }
            const t = g.t0 + (g.t1 - g.t0) * ((a + b) / 2);
            const q = byLane.get(L)!;
            for (let k = 0; k + 2 < q.length; k += 3) if (q[k] !== gi && t >= q[k + 1] && t <= q[k + 2]) hits.push({ j: q[k], t, g: gi });
          }
        }
    }
    this.glideX = { nodes, hits };
    return hits;
  }
  /** Разрывы чужих следов под переходами кадра (решение 173), добавленные к разрывам под связями (Г7). */
  private glideCuts(cuts: Map<number, number[]> | undefined, ribbons: ReadonlySet<string> | null): Map<number, number[]> | undefined {
    const hits = this.glideCrossings();
    if (!hits.length) return cuts;
    const cam = this.cam;
    const out = cuts ?? new Map<number, number[]>();
    for (const h of hits) {
      if (!this.drawn(h.j) || !this.drawn(h.g)) continue;
      // след лица линий Мессии лежит под лентой, а его тонкая линия — над ней (drawSpineTrails): переход идёт под лентой,
      // и разрыв на ленте читался бы засечкой
      if (ribbons?.has(this.nodes[h.j].person)) continue;
      const x = cam.sx(this.xOf(h.t));
      if (x < -10 || x > cam.w + 10) continue;
      const a = out.get(h.j);
      if (a) a.push(x, TRAIL_CUT);
      else out.set(h.j, [x, TRAIL_CUT]);
    }
    return out;
  }
  /** Разрывы следов последнего кадра (под связями и переходами): номер узла → пары «x, полуширина». */
  private lastCuts: Map<number, number[]> | null = null;
  /** Разрывы следа узла i в последнем кадре (для проверок): пары «x px холста, полуширина»; нет — следа без разрывов. */
  cutsNow(i: number): readonly number[] | undefined {
    return this.lastCuts?.get(i);
  }
  /** Пересечения переходов с чужими следами (для проверок): «переход>след@x» в px холста. */
  glideCrossLog(): string[] {
    return this.glideCrossings()
      .filter((h) => this.drawn(h.j) && this.drawn(h.g))
      .map((h) => `${this.nodes[h.g].person}>${this.nodes[h.j].person}@${Math.round(this.cam.sx(this.xOf(h.t)))}`);
  }
  /**
   * Расстояние от точки (px холста) до нарисованного следа узла i — по горизонталям пребываний и ломаным переходов от
   * звезды до конца следа (X1); Infinity — точка не над следом.
   */
  trailDist(i: number, sx: number, sy: number): number {
    const cam = this.cam;
    const x0 = cam.sx(this.X0[i]);
    const x1 = cam.sx(this.X1[i]);
    if (sx < x0 - 6 || sx > x1 + 6) return Infinity;
    const shape = { y: Math.round(this.starY(i)) + 0.5, bends: this.bendsOf(i) ?? undefined };
    let best = Infinity;
    trailSegs(shape, x0, x1, (ax, ay, bx, by) => {
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const u = l2 > 1e-9 ? Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(sx - (ax + dx * u), sy - (ay + dy * u)));
    });
    return best;
  }

  /** Где стоит флажок меридиана (px холста) — для проверок. */
  meridianFlag: Rect | null = null;
  /** Указатели на выбранных за краем экрана («→ Давид»): по щелчку — перелёт. */
  edgeHits: EdgeHit[] = [];

  /** Замер подписей последнего кадра: прямоугольники и число пересекающихся пар (labels.ts). */
  labelStats(): LabelStats & { stars: number; named: number } {
    return {
      ...measureLabels(this.ledger.boxes),
      stars: this.ledger.stars,
      named: this.ledger.named,
    };
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
    // «только линии» на общей раскладке — только лица линий; в семейной укладке показа «линии Мессии» состав задаёт план
    this.drawnOnly = lineOnly && this.plan.layout !== 'family' ? spine : null;
    // узлы кадра: по раскладке; в семейной укладке — копии с виртуальными полосами (§ 4.2, SkyPlan.nodeLane), во время
    // перехода — с промежуточными (§ 10); в режиме «только линии» на общей раскладке лица линий стоят на нитях (MAP-71)
    this.beads = false;
    this.nodes = this.frameNodes();
    this.fitArrays();
    if (lineOnly && L.ribbons && BEADS && this.plan.layout !== 'family') {
      this.beads = true;
      this.routeFactor = 0;
      this.nodes = beadNodes(
        this,
        this.model.nodes,
        ribbonBeads(this, s, {
          joseph: lines.joseph.persons,
          mary: lines.mary.persons,
        }),
      );
    }
    this.drawnGhosts = !!L.ghosts;
    // открытое небо — ниже рамки, а в режиме эпох — ниже ярусов (их нижний край — верхнее поле видимой части)
    this.openTop = Math.max(FRAME_H, this.insets.top);
    this.ledger.reset();
    // режим «В работе» (J4): только лица набора — все звёзды, следы и связи в полную силу, без облаков, контуров и скоплений
    const work = this.plan.mode === 'work';
    const dd = work ? { time: 1, rows: 1, stars: 1 } : detailOf(cam);
    const detail = dd.time;
    // ленты по маршрутам связей (§ 3): на масштабе семьи; на обзоре — прежний сплайн; в «только линиях» на карте — сплайн;
    // поколения линии на экране теснее 24 px — тоже сплайн (маршруты шли бы зигзагом сквозь бусины; ТЗ § 3.2)
    // масштаб в движении (Я33): кадр связей и пороги подписей — пересчётом прежних, пока масштаб не постоит
    {
      const scale = `${cam.kx}|${cam.ky}|${cam.lanes}`;
      const now = performance.now();
      if (scale !== this.lastScale) {
        if (this.lastScale) this.scaleAt = now;
        this.lastScale = scale;
      }
      this.scaleMoving = this.animate && (cam.moving || now - this.scaleAt < SCALE_SETTLE_MS);
      // сдвиг (протяжка, инерция): то же окно покоя; кадр покоя после сдвига — по таймеру (SkyView ждёт только масштаб)
      const view = `${cam.x0}|${cam.laneTop}`;
      if (view !== this.lastView) {
        if (this.lastView) this.viewAt = now;
        this.lastView = view;
      }
      this.viewMoving = this.scaleMoving || (this.animate && now - this.viewAt < SCALE_SETTLE_MS);
      if (this.viewMoving && !this.scaleMoving && typeof window !== 'undefined') {
        if (this.viewTimer) clearTimeout(this.viewTimer);
        this.viewTimer = setTimeout(() => {
          this.viewTimer = null;
          this.cam.onChange();
        }, SCALE_SETTLE_MS + 30);
      }
    }
    this.genRoom = this.generationRoom();
    this.routeFactor = this.beads ? 0 : (work ? 1 : detail) * this.genRoom;
    if (work) {
      this.collapsed.clear();
      this.rings = [];
    } else this.markClusters(dd.stars);
    const pxYear = this.pxPerYear();
    this.fillStarAlpha(s, spine, dd.stars, pxYear);
    const starA = this.starA;
    const p: Pass = {
      s,
      tier: familyTier(pxYear),
      pxYear,
      vis: [],
      // при наведении на ромб гаснут чужие ветви (решение 172; marks.ts, unionHoverDim)
      emph: linkDim(s, unionHoverDim(s, guestDim(this.plan.guests, familyDim(this, work ? floorAt(emphasis(hl, s.depth), WORK_DIM) : emphasis(hl, s.depth))))),
      spine,
      level: Math.max(0, 2 * Math.log2(cam.kx / KX_MIN)),
      zoomScale: zoomScaleFor(cam.ky),
      detail,
      rowDetail: dd.rows,
      starDetail: dd.stars,
      starAlpha: (i) => starA[i] ?? 0,
      // знак, собранный в скопление семьи (решение 142), не рисуется и не подписывается
      starShown: (i) => !this.piled.has(i) && this.starShown(s, i),
      starsDrawn: new Set(),
      reserve: s.reserve,
      placer: new Placer(),
      labeled: new Set(),
      nameBoxes: [],
      cutNames: [],
      ribbonBoxes: [],
      work,
      lines: new Placer(),
      shown: {
        breaks: new Set(),
        brackets: new Set(),
        workMarks: 0,
        noted: [],
      },
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
    // знак не ложится на знак (решение 142): скопления семьи — до всех слоёв, их видят звёзды, подписи и попадание
    this.pileUp(p);
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
    // переход между укладками (§ 10): пока строки едут, связей нет; узлы, стволы и обрывки проявляются в конце,
    // подписи ставятся один раз — когда переход кончился
    const tt = this.trans ? performance.now() - this.trans.t0 : Infinity;
    const settle = Math.min(s.settle ?? 1, this.trans ? Math.max(0, Math.min(1, (tt - TRANS_SETTLE[0]) / (TRANS_SETTLE[1] - TRANS_SETTLE[0]))) : 1);
    this.appear = this.trans ? appearOf(this.trans, settle) : null;
    // связи кадра (src/render/links.ts): стволы, зубцы, черты брака, узлы союзов, обрывки, разрывы следов (§ 2)
    // в «только линиях» на общей раскладке (лица — бусины на нитях) связи рисуют сами ленты: стволов и ромбов нет
    const lf = L.connectors && settle > 0.01 && !this.beads ? this.linksFor(p, s, detail) : null;
    p.links = lf;
    p.guests = this.plan.guests;
    p.cuts = lf ? this.cutsOf(lf, !!L.ribbons && this.routeFactor >= 0.5) : undefined;
    // переход идёт поверх чужого следа с разрывом под собой (решение 173; D2, С6): пересечение — не соединение
    if (L.lifelines) p.cuts = this.glideCuts(p.cuts, L.ribbons ? spine : null);
    this.lastCuts = p.cuts ?? null;
    // подписи обходят линии связей (Я12); в «только линиях» подписи лиц линий ставятся по лентам (UX-16), не по связям
    if (lf && lf.alpha > 0.5 && !lineOnly && !this.linksStale) {
      const hits = this.linkHits!;
      // своя линия подписи: у подписи звезды — линии лица, у подписи связи (обрывок, имя матери у ромба) — линии её союза
      // своя связь подписи не мешает (зубец подходит к звезде слева), кроме черты брака (Г4): она встаёт в 12 px правее
      // звезды супруга, и имя справа от звезды легло бы на неё («Соломон» на черте к дочери фараона)
      p.onLink = (b, id) =>
        hits.crosses(b, lf.dx, lf.dy, (q) => q.kind !== 'ribbon' && linkOn(q, lf) && (q.kind === 'bar' || (!q.ends.includes(id) && q.union !== id && q.ks !== id)));
      // ленты по маршрутам (семейный масштаб): подпись связи не ложится на ленту с её свечением (3 px вокруг)
      if (L.ribbons && this.routeFactor >= 0.5)
        p.onRibbon = (b) => hits.crosses({ x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 }, lf.dx, lf.dy, (q) => q.kind === 'ribbon');
    }
    if (!lf) this.linkDraw = null;
    if (L.lifelines) layer((q) => drawTrails(this, q));
    // промежутки рождения у лиц, чей знак стоит у первого засвидетельствованного года (решение 38; MAP-69)
    if (L.lifelines) layer((q) => this.drawBirthBands(q));
    if (lf && settle > 0.01) {
      ctx.globalAlpha = settle;
      drawLinks(this, p, lf);
      ctx.globalAlpha = 1;
    }
    // в режиме «В работе» ленты — тонкий ориентир, и только если в наборе есть лица линий Мессии (J4)
    const ribbons = L.ribbons && (!work || [...spine].some((id) => !this.plan.hiddenPersons.has(id)));
    if (ribbons) {
      drawSkyRibbons(this, work ? { ...s, guide: true } : s, {
        joseph: lines.joseph.persons,
        mary: lines.mary.persons,
      });
      p.offRibbon = (b) => clearOfRibbons(this, b);
      // разрывы лент со знаком «+N» на месте скрытых показом поколений (К4)
      drawRibbonGaps(this, p);
    }
    if (L.lifelines && L.ribbons) drawSpineTrails(this, p);
    // путь родства — под звёздами: звёзды пути лежат на ломаной (E5)
    drawKinPath(this, p);
    // подписи: одна проверка наложений на всё, что пишется на небе (E1). Знаки — истинными фигурами с кольцами
    // состояний (решение 140): кольцо женщины, точки народа, звезда Мессии, черта царя, «†», кольца выбора, фокуса,
    // наведения, отметок и концов связи (marks.ts, ringOuter); по ним — правило принадлежности подписи
    {
      const look = { scale: p.zoomScale, color: '', halo: '' };
      const states = new Set([s.selected, s.second, s.hovered, s.focus, s.workFlash?.id, ...s.pins, ...(s.link ? linkRoles(s.link).map((e) => e.id) : [])].filter((x): x is string => !!x));
      for (const i of p.vis) {
        if (!p.starShown(i)) continue;
        const n = this.nodes[i];
        const q = byId.get(n.person)!;
        const x = cam.sx(this.X0[i]);
        const y = cam.sy(starLaneOf(n));
        if (x < -20 || x > cam.w + 20 || y < -20 || y > cam.h + 20) continue;
        const lit = Math.max(0, Math.min(1, s.intro * 7 - q.magnitude));
        // меридиан года гасит неживых лишь на время наведения на шкалу: правила подписей — как без него (подписи не мигают)
        const a = (s.meridian !== null ? 1 : p.emph(q.id)) * lit * starA[i] * (this.appear ? this.appear(i) : 1);
        // и погашенные знаки: тусклая звезда — тоже лицо, названия созвездий и пометы её не закрывают (решение 140, К2);
        // правила принадлежности считают только видимые (GLYPH_SEEN, labels.ts)
        if (a < 0.02) continue;
        // «†» младенца — в его подписи (MAP-68); без подписи знак † рисует drawDaggers, и место слева от звезды он берёт сам
        const pg = personGlyph(q, n.ghost, this.model.chrono.get(n.person)?.cls, look, false);
        if (pg.king && !n.ghost && (q.id === s.selected || q.id === s.second)) pg.ring = ringOuter(this, p, q.id);
        const e: GlyphExt = glyphExtent(pg);
        if (!n.ghost && states.has(q.id)) {
          const R = ringOuter(this, p, q.id);
          if (R > 0) {
            e.l = Math.max(e.l, R);
            e.r = Math.max(e.r, R);
            e.t = Math.max(e.t, R);
            e.b = Math.max(e.b, R);
          }
        }
        p.placer.addGlyph({ x, y, e, id: q.id, a, m: q.magnitude });
      }
    }
    // указатели у края — до узлов союзов: ромб под указателем «← Давид» не рисуется (указатель его закрыл бы)
    const edges = placeWayfinding(this, s, p);
    p.wayEdges = edges;
    // узлы союзов ◆ и • — над лентами, под звёздами (порядок слоёв § 13): «пересадочные станции» лент
    const nodeHits = lf && settle > 0.01 ? drawLinkNodes(this, p, lf, s.plateMarks ?? {}, settle) : null;
    this.plateHits = nodeHits?.plates ?? [];
    this.countHits = nodeHits?.counts ?? [];
    drawWorkMarks(this, p);

    // знаки свёрнутых скоплений — как звёзды величины 2: подпись их не закрывает
    if (!lineOnly) for (const g of this.rings) p.placer.add({ x: g.x - 7, y: g.y - 7, w: 14, h: 14 }, true, 2);
    if (ribbons) p.ribbonBoxes = this.ribbonBoxes();
    // одноимённые в окне (MAP-66) и свёрнутые потомки (MAP-63, UX-60): их подписям положено уточнение и «+N»
    p.namesakes = namesakesInView(this, p);
    // гости показа (§ 7; этап 13, X3 Д10): подпись отвечает «кто» — «Хела, жена Ашхура», «Мааха, мать Авессалома» —
    // по родне в показе; если такой родни нет — «где»: «в «Доме Фарры»». У одноимённого со своим уточнением — оно
    if (this.plan.guests?.size)
      for (const id of this.plan.guests) {
        if (p.namesakes.get(id)) continue;
        const w = this.guestWho(id) ?? s.guestWhere?.(id) ?? null;
        if (w) p.namesakes.set(id, `, ${w}`);
      }
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
    // кольца и роли концов выбранной связи — раньше всех подписей (Д12): имена на них не ложатся
    reserveSelectedLink(this, p);
    // маршруты дуг родства, призраков, выбранной связи и пути родства — до подписей (решение 139; контракт 1): чужие имена
    // на них не встают; их кольца уже заняли место (marks.ts, overlayRoutes)
    this.lineObstacles(p, lf, !!L.ribbons && !!ribbons);
    // весь текст кадра — последним проходом (решения 139, 143): подписи, пометы, роли и термины слоёв поверх подписей
    // ставятся и занимают место в своё время, а рисуются после колец, дуг, призраков и выбранной связи
    const flushText = this.holdText();
    const lineSteps = {
      joseph: lines.joseph.persons,
      mary: lines.mary.persons,
    };
    // подписи — один раз, в конце перехода (§ 10)
    const labelsOn = !!L.labels && settle >= 0.999;
    // подписи шагов пути родства (E5), выноски точек сравнения и подписи лиц линий (E6) — раньше обычных подписей
    if (labelsOn) drawLeadNotes(this, p, lineSteps);
    // слой подписей выключен, а на точке сравнения фокус клавиатуры (решение 116) — её подпись и кольцо всё равно видны
    else if (s.noteFocus && settle >= 0.999) drawLineNotes(this, p, lineSteps);
    // знак свёрнутого созвездия — раньше всех подписей звёзд: он вытесняет соседей (решение 30)
    if (L.labels) this.drawFoldMarks(p, 'group');
    const between = () => {
      // «+N» потомков, не вставший в подпись лица (J5), — раньше меридианов событий и обычных подписей
      if (!L.labels) this.drawFoldMarks(p, 'group');
      this.drawFoldMarks(p, 'desc');
      // «+N» скопления семьи, не вставший в подпись старшего (решение 142)
      if (L.labels) this.drawPileMarks(p);
      // подписи лент «через Соломона (Мф 1)» — важнее подписей звёзд величины 2–6 (UX-45)
      if (ribbons && !lineOnly && L.labels) drawBranchLabels(this, p, lineSteps);
      for (const { x, e } of events) drawEventLabel(this, p, x, e.full, e.name);
      if (!lineOnly && !work) this.clusterLabels(p);
      // подписи обрывков (цели длинных связей, «дочь Ревекка — жена Исаака») и имён матерей у ромбов (Г8, Г11, Г12),
      // обрывки наружу показа (§ 7)
      if (lf && L.labels && settle > 0.99) drawLinkLabels(this, p, lf);
      // подписи призраков жён «Рахиль, жена Иакова» (ТЗ § 3.1)
      if (L.labels && !lineOnly) drawGhostNotes(this, p);
      this.stubHits = L.labels && settle > 0.99 ? drawPlanStubs(this, p, this.plan.stubs ?? []) : [];
      const xc = Math.max(this.letterW + 40, cam.sx(this.xOf(110)));
      if (cam.w - xc > 380) drawNote(this, p, CANON_NOTE, (xc + cam.w) / 2, (cam.vp.t + cam.vp.b) / 2, xc);
      this.groupNoRoom.clear();
      if (constellations) p.nameBoxes = drawGroupNames(this, p, spots, this.groupNoRoom);
    };
    if (labelsOn) drawStarLabels(this, p, between);
    else if (settle >= 0.999) between();
    // имена у ромбов бездетных браков (этап 13, К6) — после подписей звёзд
    if (lf && L.labels && settle > 0.99) drawLinkLabels(this, p, lf, true);
    this.groupHits = p.nameBoxes as (Rect & { group: string })[];
    // звёзды — после того как подписи заняли места (решения 139, 140): разрывы следов, сетки и погашенных связей под
    // подписями звёзд не задевают; подписи на чужие знаки не ставятся — знак рисуется всегда
    this.drawStars(p);
    // уходящие при переходе (§ 10) гаснут на месте за 150 мс
    if (this.trans && tt < TRANS_LEAVE) this.drawLeaving(p, 1 - tt / TRANS_LEAVE);
    // слои поверх подписей (решения 139, 143): «†», метки ветвей, кольца, дуги и призраки, выбранная связь — с вырезами
    // по прямоугольникам всех подписей кадра: ни одна их линия не идёт по тексту; их собственный текст — в общем проходе
    const cuts = this.ledger.boxes.filter((b) => b.kind !== 'frame');
    this.clipOut(cuts, () => {
      this.drawDaggers(p);
      // метки ветвей выбранного лица (решение 69) — под началом подписей первых детей ветвей
      drawBranchTicks(this, p);
    });
    // шаг наведённой ленты объясняет подсказка («Давид — отец; Соломон — сын (Мф 1:6)», src/ui/sky/Tip.tsx; решение 54):
    // подписи шага на холсте нет — две надписи об одном сразу не нужны. Лента по-прежнему подсвечивается с током света
    drawRings(this, p, { cuts, deferText: true });
    // путь происхождения наведённого лица (решение 179): след отца → черта → ромб → след матери → отвод — видом наведённой
    // связи; подсказку «Иаков и Рахиль — родители; Вениамин — сын» даёт подсказка звезды (src/ui/sky/Tip.tsx, originLine)
    if (s.hovered && lf && L.connectors && !s.linkHover && !lineOnly && settle > 0.99) drawOriginPath(this, p, s.hovered);
    // выбранная связь (§ 8) — поверх всего неба: жёлтый путь, кольца с ролями на концах, указатели у края
    this.linkSel = drawSelectedLink(this, p, { cuts, deferText: true });
    drawOverlayText(this, p);
    // весь текст — поверх всех линий неба (решение 143); рамка, указатели и ярусы — выше
    flushText();

    under?.();
    // флажок меридиана — место на служебной строке до рамки: её надписи его обходят (MAP-33)
    const flag = meridianFlagAt(this, s);
    const cmds = drawFrame(this, ticks, {
      model: s.modelNote,
      folds: this.plan.marks,
      flag,
    });
    this.foldHits = [...(p.foldHits ?? []), ...cmds];
    this.meridianFlag = drawMeridian(this, s, flag);
    paintWayfinding(this, edges);
    // указатели у края к концам выбранной связи (§ 8): щелчок — перелёт, как у указателей рамки
    this.edgeHits = [
      ...edges,
      ...(this.linkSel?.edges ?? []).map((e) => ({
        ...e,
        label: '',
        lx: e.x,
        ly: e.y,
      })),
    ];
    // замер на холсте для проверок этапа 4: «подписано / видимых звёзд» (E1), подробность кадра (E3),
    // знаков свёрнутых скоплений / скоплений (E2)
    const ds = (this.canvas as { dataset?: DOMStringMap }).dataset;
    if (ds && probes.on) {
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
      // переход укладки (§ 10; tools/accept/grammar11.ts): доля пройденного в этом кадре; пусто — перехода нет
      put('trans', this.transitioning ? this.transitionT().toFixed(3) : '');
      put('folds', this.plan.marks.map((m) => `${m.kind}:${m.id}:${m.count}`).join(';'));
      put('foldHits', this.foldHits.map((h) => `${h.kind}:${h.id}:${[h.x, h.y, h.w, h.h].map(Math.round).join(',')}`).join(';'));
      // точки союзов (решения 70, 76): «союз:раскрыт (1/0):x,y,w,h» — поле попадания, для проверок приёмки
      // tools/accept/reveal4.ts; центры ромбов и «+N» — canvas[data-dots], линии — canvas[data-union-lines] (plates.ts)
      put('plates', this.plateHits.map((h) => `${h.uid}:${h.open ? 1 : 0}:${[h.x, h.y, h.w, h.h].map(Math.round).join(',')}`).join(';'));
      // «союз:раскрыт (1/0):x,y (центр ромба):скрыто лиц» и линии «союз=супруг», «союз>ребёнок:#цвет» (tools/accept/dots6.ts)
      put('dots', this.plateHits.map((h) => `${h.uid}:${h.open ? 1 : 0}:${Math.round(h.cx)},${Math.round(h.cy)}:${h.hidden}`).join(';'));
      // журналы линий (около 5 мс на кадр) — только когда небо стоит: в перелёте и в движении масштаба не пишутся (С1);
      // кадр покоя после движения пишет их заново
      const still = !this.scaleMoving && !cam.moving;
      if (still) put('unionLines', lf ? unionLinesLog(lf, (id) => branchFrame(this, p).paint(id)) : '');
      // связи кадра (этап 11, § 2; src/render/links.ts): «вид|начертание|ключ|x,y,…» и узлы «node|open|ключ|x,y» — в окне
      if (still)
        put(
          'links',
          lf
            ? linkLog(
              // только нарисованные: связи, погашенные подробностью кадра (не выделенные при alpha ≈ 0), не видны и не ловятся
                lf.frame.paths.filter((q) => linkOn(q, lf)),
                lf.frame.nodes,
                cam.vp,
                lf.dx,
                lf.dy,
              )
            : '',
        );
      // выбранная связь (§ 8): ключ, концы с ролями и местом (на экране или у края), точка карточки связи
      put('linkSel', this.linkSel ? JSON.stringify(this.linkSel) : '');
      // разрывы лент «+N» (этап 13, К4): «от>до:N@x,y» через «|» — для приёмки (tools/accept/sky13.ts)
      const nf = lineNoteFocus(this);
      put('noteFocus', nf ? `${nf.id}:${[nf.box.x, nf.box.y, nf.box.w, nf.box.h].map(Math.round).join(',')}@${Math.round(nf.x)},${Math.round(nf.y)}` : '');
      put('gaps', ribbonGapHits(this).map((g) => `${g.from}>${g.to}:${g.n}@${Math.round(g.cx)},${Math.round(g.cy)}`).join('|'));
      // этап 7 (K5), для проверок приёмки tools/accept/skydraw.ts: подписанные лица, пометы и названия (текст), служебная
      // строка, разрывы «//», скобки «время не установлено», метки набора
      const boxes = this.ledger.boxes;
      put('labelIds', boxes.filter((b) => b.kind === 'star').map((b) => b.id).join(' '));
      // места подписей лиц — «лицо:x,y,w,h» (tools/accept/family3.ts, 347: подпись не ложится на черту брака)
      put('labelBoxes', boxes.filter((b) => b.kind === 'star').map((b) => `${b.id}:${[b.x, b.y, b.w, b.h].map(Math.round).join(',')}`).join(';'));
      // скрытые подписи (контракт 2; решение 140) — лица видимых звёзд без подписи, по степени интереса (первые 200)
      put('hidden', this.ledger.hidden.slice(0, 200).join(' '));
      // прореженные без выбранного (решение 142): «знак:собранные через запятую» через «;» (tools/accept/labels14.ts, 1137)
      put('thin', this.thinGroups().slice(0, 300).join(';'));
      // скопления семьи (решение 142): «старший:+N:собранные через запятую»
      put('piles', this.pilesNow().map((q) => `${q.id}:+${q.members.length}:${q.members.join(',')}`).join(';'));
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
      // подписи у узлов и обрывков (этап 11, Г8): имя матери у ромба союза, «дочь Ревекка — жена Исаака» — «ключ:текст»
      // (tools/accept/skydraw.ts, 274)
      put('plateTexts', boxes.filter((b) => b.kind === 'plate' && b.text).map((b) => `${b.id ?? ''}:${b.text.replace(/\u00a0/g, ' ')}`).join('|'));
      // имена верхней ступени 164 с разрывом чужой линии по всей рамке (исключение 163; tools/collide.ts, К5 — отдельно)
      put('cutNames', (p.cutNames ?? []).join(' '));
      // места подписей у ромбов (решение 160; tools/collide.ts, К4): «союз:x,y,w,h» через «|»
      put('plateBoxes', boxes.filter((b) => b.kind === 'plate' && b.text).map((b) => `${b.id ?? ''}:${[b.x, b.y, b.w, b.h].map(Math.round).join(',')}`).join('|'));
      // звёзды неба «набор» в этом кадре (решение 76; tools/accept/polish6.ts): «лицо:x,y» — список неба для клавиатуры
      // (SkyA11y) обновляется, только когда небо постоит, а проверке нужен кадр сразу после сдвига
      // звёзды в окне при любом показе (tools/accept/grammar11.ts): точки наведения на линии — не у звёзд (§ 8: звезда
      // ближе 12 px важнее линии)
      // переходы следов в окне (решение 173; tools/accept/skydraw.ts): «лицо:x0,y0,x1,y1» — начало и конец S-кривой, px холста;
      // разрывы чужих следов под переходами — «переход>след@x»
      put(
        'glides',
        p.vis
          .filter((i) => hasGlides(this.nodes[i]) && this.drawn(i))
          .flatMap((i) => (this.bendsOf(i) ?? []).filter((g) => g.xb > 0 && g.xa < cam.w).map((g) => `${this.nodes[i].person}:${[g.xa, g.ya, g.xb, g.yb].map(Math.round).join(',')}`))
          .join(';'),
      );
      // призраки в кадре (решение 173): «id узла-призрака@x,y» — и виртуальные узлы семейной укладки
      put('ghosts', p.vis.filter((i) => this.nodes[i].ghost && p.starShown(i)).map((i) => `${this.nodes[i].id}@${Math.round(cam.sx(this.X0[i]))},${Math.round(this.starY(i))}`).join(' '));
      // уровень подробности семьи (решение 178): «уровень px-на-год» (tools/accept/skydraw.ts)
      put('tier', `${p.tier} ${p.pxYear.toFixed(1)}`);
      put('glideCuts', L.lifelines ? this.glideCrossLog().filter((q) => { const x = Number(q.split('@')[1]); return x > 0 && x < cam.w; }).join(' ') : '');
      put('starsAt', p.vis.filter((i) => this.drawn(i) && !this.nodes[i].ghost).slice(0, 2000).map((i) => `${Math.round(cam.sx(this.X0[i]))},${Math.round(this.starY(i))}`).join(';'));
      put('stars', this.plan.mode === 'work' ? p.vis.filter((i) => this.drawn(i) && !this.nodes[i].ghost).slice(0, 240).map((i) => `${this.nodes[i].person}:${Math.round(cam.sx(this.X0[i]))},${Math.round(this.starY(i))}`).join(';') : '');
      // места помет семей в небе «набор» (решение 76; tools/accept/polish6.ts): «x,y,w,h» — помета не на линиях к детям
      put('noteBoxes', this.plan.mode === 'work' ? boxes.filter((b) => b.kind === 'note').map((b) => [b.x, b.y, b.w, b.h].map(Math.round).join(',')).join(';') : '');
      put('service', boxes.filter((b) => b.kind === 'frame' && b.y >= RULER_H - 1 && b.y + b.h <= FRAME_H + 1).map((b) => b.text.replace(/\u00a0/g, ' ')).join('|'));
      put('breaks', [...(p.shown?.breaks ?? [])].sort().join(' '));
      put('brackets', [...(p.shown?.brackets ?? [])].sort().join(' '));
      put('workMarks', String(p.shown?.workMarks ?? 0));
      put('noted', (p.shown?.noted ?? []).join('|'));
      // названия созвездий (MAP-58): области видимой частью не меньше 150 × 60 px — «группа:ш×в:подписана (1/2/0/3)»
      put('groupAreas', groupAreas(this, spots, p.nameBoxes as (Rect & { group: string })[], this.groupNoRoom).map((a) => `${a.group}:${a.w}×${a.h}:${a.named}`).join('|'));
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
        // звезда в окне — у звезды (полоса рождения); за левым краем — у следа в год края (решение 173)
        y = x0 >= cam.vp.l ? this.starY(i) : this.trailYAt(i, cam.vp.l);
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
      const text = name ? `${name} ${count}` : `${lead}${count}`;
      // знак созвездия — то же название созвездия: звёзд он, как название (labels.ts, GROUP_COVER_FROM), не закрывает
      const got = claim(this, p, cands, 'fold', text, { id: m.id, coverFrom: GROUP_COVER_FROM });
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

  /**
   * «+N» скопления семьи (решение 142) у знака старшего, если его подпись не встала: справа, слева, над или под знаком —
   * той же проверкой наложений. Подчёркнут, как ссылка неба: щелчок — «Ближайшая родня» (src/ui/sky/input.ts, foldHits).
   */
  private drawPileMarks(p: Pass) {
    const { ctx, cam, pal } = this;
    const size = mapSize(T_MAP_S, this.coarse);
    const out = p.foldHits ?? [];
    // знак «+N» без подписи — только у выбранного и его ближайшей семьи: по всему роду десятки «+1» были бы шумом
    const near = new Set(p.s.selected ? [p.s.selected, ...familyOf(p.s.selected)] : []);
    for (const [i, m] of this.piles) {
      const id = this.nodes[i].person;
      if (!near.has(id) || out.some((h) => h.kind === 'pile' && h.id === id)) continue;
      const q = byId.get(id);
      const x = cam.sx(this.X0[i]);
      const y = this.starY(i);
      if (!q || x < this.letterW || x > cam.w || y < this.openTop || y > cam.vp.b) continue;
      const count = `+${m.length}`;
      const { cw } = foldMarkWidth(ctx, this.coarse, '', count);
      const R = starRadius(q.magnitude, p.zoomScale) + (q.sex === 'f' ? 2.65 : 0) + 3;
      const base = y + size * 0.3;
      const cands = [textBox(x + R, base, cw, size), textBox(x - R - cw, base, cw, size), textBox(x - cw / 2, y - R - size * 0.25, cw, size), textBox(x - cw / 2, y + R + size * 0.8, cw, size)];
      const got = claim(this, p, cands, 'fold', count, { id });
      if (!got) continue;
      drawFoldMark(ctx, pal, this.coarse, got.x + 1.5, got.y + 1.5 + 0.8 * size, '', count);
      out.push({ ...got, kind: 'pile', id });
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
        const pt: [number, number] = [cam.sx(this.X0[i]), this.starY(i)];
        if (prev && Math.max(prev[0], pt[0]) > 0 && Math.min(prev[0], pt[0]) < cam.w) {
          const x0 = Math.min(prev[0], pt[0]);
          const y0 = Math.min(prev[1], pt[1]);
          out.push({
            x: x0 - 2,
            y: y0 - 5,
            w: Math.abs(pt[0] - prev[0]) + 4,
            h: Math.abs(pt[1] - prev[1]) + 10,
          });
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

  /** Величины звёзд узлов кадра (6 — лица нет в данных): один раз на массив узлов, а не поиском по id в каждом кадре. */
  private mags: { nodes: readonly NodeRow[]; mag: Float64Array } | null = null;
  private nodeMags(): Float64Array {
    if (this.mags?.nodes === this.nodes) return this.mags.mag;
    const mag = new Float64Array(this.nodes.length);
    for (let i = 0; i < this.nodes.length; i++) mag[i] = byId.get(this.nodes[i].person)?.magnitude ?? 6;
    this.mags = { nodes: this.nodes, mag };
    return mag;
  }
  /** Непрозрачность звёзд этого кадра (E3): выделенные и лица линий в режиме «только линии» — 1, величины 0–2 — 1, мелкие — по подробности. */
  private fillStarAlpha(s: SkyState, spine: Set<string>, detail: number, pxYear = FAMILY_TIER.family * 2) {
    // призраки (решение 173: жена из далёкого рода в родной семье, бездетный брак у мужа) — на масштабе семьи (решение 178);
    // у выделенных и в режиме «В работе» — всегда
    const ghostA = tierAlpha(pxYear, FAMILY_TIER.family);
    const hl = s.highlight;
    const A = this.starA;
    const hid = this.plan.hidden;
    const work = this.plan.mode === 'work';
    const mag = this.nodeMags();
    const pins = s.pins.size ? s.pins : null;
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
      const k = hl?.get(n.person);
      const pinned = !!pins && pins.has(n.person);
      // лицо свёрнутого скопления видно отдельно, только если это выбранное лицо, путь родства или отметка поиска
      if (n.block >= 0 && this.collapsed.has(n.block)) A[i] = k === 'self' || k === 'path' || pinned ? 1 : 0;
      // призрак — с масштаба семьи; у семьи выбранного и пути родства — всегда (меридиан года «живы» призраков не зажигает)
      else if (n.ghost && !pinned && (k === undefined || k === 'sure' || k === 'likely')) A[i] = (mag[i] <= OVERVIEW_MAG ? 1 : detail) * ghostA;
      else if (k !== undefined || pinned || (s.onlyLines && spine.has(n.person))) A[i] = 1;
      else A[i] = mag[i] <= OVERVIEW_MAG ? 1 : detail;
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
    return {
      img,
      x0,
      x1,
      strips,
      key: `${m.id}|${this.pal.ink}|${this.pal.glow}`,
    };
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
    const rings = orthoRings(ov.rings, step, band).map((r) => ({
      ...r,
      x: Float64Array.from(r.t, (t) => this.xOf(t)),
    }));
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
    // контур тоньше и бледнее связей, с прямыми углами (решение 170; V-3): не читается связью
    ctx.lineWidth = CONTOUR_W;
    // на масштабе семьи контур гаснет до 30 % (MAP-58): от него остаются бессмысленные дуги, а род читается по связям
    const u = Math.max(0, Math.min(1, (cam.ky - FAMILY_FADE[0]) / (FAMILY_FADE[1] - FAMILY_FADE[0])));
    const la = pal.contourAlpha * (hl ? 0.6 : 1) * (1 - 0.7 * u * u * (3 - 2 * u));
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
      const slots = ov.o.slots.map((sl) => ({
        x0: cam.sx(this.xOf(sl.t0)),
        x1: cam.sx(this.xOf(sl.t1)),
        yc: cam.sy(sl.lane),
        h: sl.h * cam.ky,
      }));
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
      spots.push({
        group: ov.o.group,
        size: ov.o.size,
        slots,
        box: { x0: xa, x1: xb, y0: ya, y1: yb },
        edge: edge.filter(([a, b]) => b > a),
        poly,
      });
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
      spots.push({
        group: o.group,
        size: o.size,
        slots: [
          {
            x0: minX + 4,
            x1: maxX - 4,
            yc: Math.max(minY + 10, this.openTop + 10),
            h: 18,
          },
        ],
      });
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
      if (hasGlides(n)) {
        // след с переходами (решение 173): виден, если в окно приходится хоть одно пребывание или переход
        let lo = Infinity;
        let hi = -Infinity;
        for (const st of n.stays!) {
          const y = cam.sy(st.lane);
          if (y < lo) lo = y;
          if (y > hi) hi = y;
        }
        if (hi < -20 || lo > H + 20) continue;
      } else {
        const y = cam.sy(n.lane);
        if (y < -20 || y > H + 20) continue;
      }
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

  /**
   * Текст — последним проходом холста (решения 139, 143): до вызова возвращённой функции fillText и strokeText не рисуют,
   * а запоминают строку с состоянием холста (шрифт, цвет, толщина ореола, разрядка, выравнивание, непрозрачность,
   * преобразование); функция рисует всё запомненное по порядку. Места подписей при этом занимаются как прежде.
   */
  private holdText(): () => void {
    const ctx = this.ctx as CanvasRenderingContext2D & Record<string, unknown>;
    if (typeof ctx.getTransform !== 'function' || typeof ctx.setTransform !== 'function') return () => {};
    type St = { font: string; fill: CanvasRenderingContext2D['fillStyle']; stroke: CanvasRenderingContext2D['strokeStyle']; lw: number; lj: CanvasLineJoin; a: number; ls: string; ta: CanvasTextAlign; tb: CanvasTextBaseline; M: DOMMatrix };
    const q: { m: 'fillText' | 'strokeText'; t: string; x: number; y: number; w?: number; st: St }[] = [];
    const snap = (): St => ({ font: ctx.font, fill: ctx.fillStyle, stroke: ctx.strokeStyle, lw: ctx.lineWidth, lj: ctx.lineJoin, a: ctx.globalAlpha, ls: (ctx as { letterSpacing?: string }).letterSpacing ?? '', ta: ctx.textAlign, tb: ctx.textBaseline, M: ctx.getTransform() });
    const had = { fillText: Object.getOwnPropertyDescriptor(ctx, 'fillText'), strokeText: Object.getOwnPropertyDescriptor(ctx, 'strokeText') };
    for (const m of ['fillText', 'strokeText'] as const)
      Object.defineProperty(ctx, m, {
        configurable: true,
        writable: true,
        value: (t: string, x: number, y: number, w?: number) => q.push({ m, t: String(t), x, y, w, st: snap() }),
      });
    return () => {
      for (const m of ['fillText', 'strokeText'] as const) {
        const d = had[m];
        if (d) Object.defineProperty(ctx, m, d);
        else delete ctx[m];
      }
      if (!q.length) return;
      ctx.save();
      for (const o of q) {
        const st = o.st;
        ctx.setTransform(st.M);
        ctx.font = st.font;
        ctx.fillStyle = st.fill;
        ctx.strokeStyle = st.stroke;
        ctx.lineWidth = st.lw;
        ctx.lineJoin = st.lj;
        ctx.globalAlpha = st.a;
        if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = st.ls || '0px';
        ctx.textAlign = st.ta;
        ctx.textBaseline = st.tb;
        if (o.w === undefined) ctx[o.m](o.t, o.x, o.y);
        else ctx[o.m](o.t, o.x, o.y, o.w);
      }
      ctx.restore();
    };
  }

  /** Нарисовать draw с вырезами по прямоугольникам holes (clip evenodd, поле 1 px): линии под текстом прерываются. */
  private clipOut(holes: readonly Rect[], draw: () => void) {
    const { ctx, cam } = this;
    if (!holes.length || typeof ctx.clip !== 'function') return draw();
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, -10, cam.w + 20, cam.h + 20);
    for (const h of holes) ctx.rect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
    ctx.clip('evenodd');
    draw();
    ctx.restore();
  }

  /**
   * Линии — препятствия для чужих имён (решения 139, 141, 163; C4, R1-04): через рамку строки подписи (b — без поля
   * ореола) не проходят связи кадра — стволы, зубцы, черты брака, выбранная связь, погашенные связи контекста — и маршруты
   * дуг родства, призраков, выбранной связи и пути родства (marks.ts, overlayRoutes — до рисования). Свои связи (зубец к
   * своей звезде, ствол к детям) — не препятствие: они кончаются у своей звезды; кроме наведённой — подсказка у связи не
   * должна сдвигать имя её конца на неё саму (иначе щелчок по видимой связи попадал бы в имя, сценарий 747). Разрыв под
   * ореолом не делает пересечение допустимым: имя на чужой вертикали читается концом связи у этого лица. Ленты — через середину строки band (+3 px свечения; кроме
   * имён лиц линий: у них свой проход «вне лент»). Следы и декор — не препятствия: под серединой имени они гаснут.
   */
  private lineObstacles(p: Pass, lf: LinkDraw | null, ribbons: boolean) {
    const routes = overlayRoutes(this, p);
    const lh = new LineHits();
    for (const r of routes) {
      if (r.pts.length < 4) continue;
      // маршрут — препятствие и для имён его концов (решение 163): дуга или выбранная связь через своё имя тоже
      // зачёркивает его; имя встаёт по другую сторону звезды
      lh.add(r.pts, NO_ROUTE_OWN, Math.min(2.5, Math.max(1, (r.w ?? 1) / 2)));
    }
    // переходы следов (решения 163, 173): чужое имя не ложится на S-кривую — она такая же чужая линия, как ствол. На небе
    // (решение 178, меньше 7 px на год) переходы бледны и почти отвесны у самых звёзд отчего дома — там они не препятствие:
    // имена главы семьи и отметок поиска иначе не нашли бы места (MAP-06, E10); К5 считает лишь видимое пересечение середины
    // строки. В режиме «В работе» подписаны все лица набора (J4) — переход чужого лица набора гасится под именем, как след
    if (p.s.layers.lifelines && !p.s.onlyLines && p.tier >= 1 && !p.work)
      for (const i of p.vis) {
        if (!hasGlides(this.nodes[i]) || !this.drawn(i)) continue;
        const own = new Set([this.nodes[i].person]);
        for (const g of this.bendsOf(i) ?? []) {
          if (g.xb < -20 || g.xa > this.cam.w + 20) continue;
          lh.add(g.pts, own, 1);
        }
      }
    const segs = lf && !p.s.onlyLines && !this.linksStale ? linkSegs(lf.frame) : null;
    const off = ribbons ? p.offRibbon : undefined;
    // разрыв под текстом — на подробном небе без облаков и не в «только линиях» (там ленты под всеми именами)
    const knock = p.starDetail >= 0.99 && !p.s.onlyLines;
    const ground = (b: Rect) => this.fillGround(b.x, b.x + b.w, b.y + 0.5, Math.max(0, b.h - 1));
    if (knock) p.knock = ground;
    if (!p.s.onlyLines) p.knockReveal = ground;
    const at = (b: Rect): Rect => ({ x: b.x - lf!.dx, y: b.y - lf!.dy, w: b.w, h: b.h });
    // наведённая связь — препятствие и для имён своих концов: подсказка у связи не сдвигает имя на неё (сценарий 747)
    const hov = p.s.linkHover ? linkKeyString(p.s.linkHover) : null;
    p.onLine = (b, id, rib = true, _perp = false, band = b) =>
      lh.crosses(b, id) ||
      (!!segs &&
        !!lf &&
        // своя черта брака — тоже препятствие (решение 163): она выходит со следа под именем мужа и режет текст, а не
        // кончается у звезды, как ствол и зубец к ребёнку
        (segs.crosses(at(b), id, (q) => !!q && linkOn(q, lf) && q.kind !== 'ribbon' && (q.kind === 'bar' || !ownLink(q.ks, id) || q.ks === hov)) ||
          (rib && segs.crosses(at(band), id, (q) => !!q && linkOn(q, lf) && q.kind === 'ribbon')))) ||
      // лента со свечением шире своей нити: середина строки — не ближе 3 px к её полю (ribbons.ts, offStrands: ещё 3 px)
      (rib && !!off && !off({ x: band.x, y: band.y - 3, w: band.w, h: band.h + 6 }));
  }

  restars(p: Pass, box: Rect) {
    const { cam } = this;
    const inside = p.vis.filter((i) => {
      const x = cam.sx(this.X0[i]);
      const y = this.starY(i);
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
      const y = cam.sy(starLaneOf(n));
      if (x < -20 || x > W + 20) continue;
      // зажигание по величине
      const lit = Math.max(0, Math.min(1, intro * 7 - q.magnitude));
      const e = p.emph(q.id) * lit * sa * (this.appear ? this.appear(i) : 1);
      look.color = alpha(pal.ink, e);
      // «†» умершего младенцем — в подписи, кеглем имени (MAP-68); у звезды без подписи — знаком (drawDaggers)
      const g = personGlyph(q, n.ghost, c?.cls, look, false);
      // черта царя у выбранного и второго лица — над их кольцом (решение 170; V-6)
      if (g.king && !n.ghost && (q.id === s.selected || q.id === s.second)) g.ring = ringOuter(this, p, q.id);
      drawGlyph(ctx, x, y, g);
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
      const y = Math.round(cam.sy(starLaneOf(n))) + 0.5;
      drawBirthBand(ctx, {
        x0,
        x1,
        y,
        color: pal.ink2,
        alpha: BIRTH_BAND.alpha * p.emph(n.person) * p.s.intro,
      });
      if (p.lines && x1 > x0) p.lines.add({ x: x0, y: y - 3, w: x1 - x0, h: 6 });
    }
  }

  /**
   * Место на поколение линии на экране (§ 3; ТЗ § 3.2: «если поколения на экране ближе 24 px…»): 1 — медиана шага лиц
   * линии Иосифа в окне не меньше 24 px, 0 — не больше 12 px, между ними — плавно.
   */
  private generationRoom(): number {
    const cam = this.cam;
    const ds: number[] = [];
    const seq = lines.joseph.persons;
    for (let k = 1; k < seq.length; k++) {
      const a = this.nodeIndex.get(seq[k - 1].id);
      const b = this.nodeIndex.get(seq[k].id);
      if (a === undefined || b === undefined || !this.drawn(a) || !this.drawn(b)) continue;
      const xa = cam.sx(this.X0[a]);
      const xb = cam.sx(this.X0[b]);
      if (Math.max(xa, xb) < 0 || Math.min(xa, xb) > cam.w) continue;
      ds.push(Math.abs(xb - xa));
    }
    if (!ds.length) return 1;
    ds.sort((p, q) => p - q);
    const med = ds[Math.floor(ds.length / 2)];
    return Math.max(0, Math.min(1, (med - 12) / 12));
  }

  /** Звёзды, появляющиеся при переходе (§ 10): доля яркости; null — перехода нет. */
  private appear: ((i: number) => number) | null = null;
  /** Уходящие при переходе звёзды (§ 10): гаснут на месте с яркостью a. */
  private drawLeaving(p: Pass, a: number) {
    const tr = this.trans;
    if (!tr || a <= 0.01) return;
    const { ctx, cam, pal } = this;
    const look = { scale: p.zoomScale, color: '', halo: pal.sky };
    for (const { i, row } of tr.leaving) {
      const n = this.model.nodes[i];
      const q = byId.get(n.person);
      if (!q || n.ghost) continue;
      const x = cam.sx(this.X0[i]);
      const y = (cam.laneTop - row) * cam.ky;
      if (x < -20 || x > cam.w + 20 || y < this.openTop - 10 || y > cam.vp.b + 10) continue;
      look.color = alpha(pal.ink, a * p.emph(q.id));
      drawGlyph(ctx, x, y, personGlyph(q, false, this.model.chrono.get(n.person)?.cls, look, false));
    }
  }

  /** Знак † у звезды умершего младенцем, если её подпись не встала (при подписи «†» стоит перед именем, MAP-68). */
  private drawDaggers(p: Pass) {
    const { ctx, cam, pal } = this;
    for (const i of p.vis) {
      const n = this.nodes[i];
      if (p.labeled.has(i) || n.ghost || !(n.trail === 'infant' || this.model.chrono.get(n.person)?.infant)) continue;
      if (this.starA[i] <= 0.02 || this.piled.has(i)) continue;
      const q = byId.get(n.person)!;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(starLaneOf(n));
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
    return {
      text: (f!.text ?? []).join(' '),
      rect: { x: r.x, y: r.y, w: r.w, h: r.h },
    };
  } catch {
    return null;
  }
}

/**
 * Области созвездий, у которых название обязательно (MAP-58): видимая часть рамки контура в открытом небе не меньше
 * GROUP_AREA_MIN; named — название этого созвездия есть в кадре.
 */
export function groupAreas(v: SkyContext, spots: readonly GroupNameSpot[], names: readonly (Rect & { group: string })[], noRoom?: ReadonlySet<string>): { group: string; w: number; h: number; named: 0 | 1 | 2 | 3 }[] {
  const out: { group: string; w: number; h: number; named: 0 | 1 | 2 | 3 }[] = [];
  for (const o of spots) {
    if (!o.box) continue;
    const w = Math.round(Math.min(o.box.x1, v.cam.w - 8) - Math.max(o.box.x0, v.letterW + 8));
    const h = Math.round(Math.min(o.box.y1, v.cam.vp.b) - Math.max(o.box.y0, v.openTop));
    if (w < GROUP_AREA_MIN[0] || h < GROUP_AREA_MIN[1]) continue;
    // 1 — название внутри самой области; 2 — у другой части того же созвездия в кадре (повтор — не ближе 1 200 px); 3 — в
    // области нет места без звёзд, название на этом участке не ставится (решение 140; labels.ts, drawGroupNames); 0 — место
    // было, а названия нет
    const own = names.filter((b) => b.group === o.group);
    const inside = own.some((b) => b.x + b.w / 2 >= o.box!.x0 && b.x + b.w / 2 <= o.box!.x1 && b.y + b.h / 2 >= o.box!.y0 && b.y + b.h / 2 <= o.box!.y1);
    out.push({ group: o.group, w, h, named: inside ? 1 : own.length ? 2 : noRoom?.has(o.group) ? 3 : 0 });
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
      // бусина на нити (MAP-71): лицо — в одной точке нити, без пребываний и переходов (решение 173)
      out[i] = { ...nodes[i], lane, starLane: lane, stays: undefined };
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

/**
 * Линии союзов кадра для прежних проверок (tools/accept/dots6.ts): «союз=супруг» — черта брака, «союз>ребёнок:#цвет» —
 * зубец к ребёнку (цвета у связей больше нет — пусто, § 9). Из журнала связей links.ts.
 */
/** Сколько масштаб должен постоять, чтобы кадр связей и пороги подписей строились заново (мс). */
export const SCALE_SETTLE_MS = 160;

/** Пути кадра связей, разрывающие чужие следы (NFR-1: кадр связей — на всё небо, путей с разрывами — малая доля). */
const cutPaths = new WeakMap<LinkFrame, LinkFrame['paths']>();
function pathsWithCuts(f: LinkFrame): LinkFrame['paths'] {
  let out = cutPaths.get(f);
  if (!out) cutPaths.set(f, (out = f.paths.filter((q) => q.cuts.length > 0)));
  return out;
}

/**
 * Кадр связей при новом масштабе — пересчётом прежнего (на время движения масштаба): x и y кадра линейны по координатам
 * неба (sx = (x − x0)·kx, sy = (laneTop − строка)·ky), строки при этом те же (ключ кэша). Разрывы следов — тем же
 * пересчётом x. Сетка попадания строится заново при первом запросе.
 */
function rescaleLinks<C extends { x0: number; laneTop: number; kx: number; ky: number; frame: LinkFrame; hitGrid: LinkHits | null; stars: LinkStar[]; exact: boolean }>(
  c: C,
  cam: { x0: number; laneTop: number; kx: number; ky: number },
): C {
  const a = cam.kx / c.kx;
  const bx = (c.x0 - cam.x0) * cam.kx;
  const e = cam.ky / c.ky;
  const by = (cam.laneTop - c.laneTop) * cam.ky;
  const X = (x: number) => x * a + bx;
  const Y = (y: number) => y * e + by;
  const f = c.frame;
  const paths = f.paths.map((q) => {
    const cuts = q.cuts.slice();
    for (let k = 0; k + 2 < cuts.length; k += 3) cuts[k + 1] = X(cuts[k + 1]);
    return { ...q, pts: q.pts.map((v, k) => (k % 2 ? Y(v) : X(v))), cuts };
  });
  const frame: LinkFrame = {
    ...f,
    paths,
    nodes: f.nodes.map((n) => ({ ...n, x: X(n.x), y: Y(n.y) })),
    stubs: f.stubs.map((st) => ({ ...st, x: X(st.x), y: Y(st.y) })),
    via: new Map([...f.via].map(([k, v]) => [k, { ...v, x: X(v.x), y: Y(v.y) }])),
  };
  const stars = c.stars.map((q) => ({ ...q, x: X(q.x), y: Y(q.y), x1: q.x1 === null ? null : X(q.x1) }));
  return { ...c, x0: cam.x0, laneTop: cam.laneTop, kx: cam.kx, ky: cam.ky, exact: false, frame, hitGrid: null, stars };
}

/** Места выноски, которые пробует имя выбранного до скопления семьи (решение 142): как у подписей (labels.ts). */
const LEAD_TRY: [number, number][] = [[16, -14], [16, 14], [-16, -14], [-16, 14], [24, -22], [24, 22], [-24, -22], [-24, 22], [36, 0], [-36, 0], [28, -26], [28, 26], [-28, -26], [-28, 26]];

/** Отрезки путей кадра связей в сетке (координаты кадра): подписи проверяют середину строки по отрезку (решение 141). */
const segCache = new WeakMap<LinkFrame, LineHits<LinkPath>>();
const NO_OWN: ReadonlySet<string> = new Set();
const NO_ROUTE_OWN: ReadonlySet<string> = new Set();
function linkSegs(f: LinkFrame): LineHits<LinkPath> {
  let h = segCache.get(f);
  if (h) return h;
  h = new LineHits<LinkPath>();
  // полуширина линии: черта брака «‖» — две линии по 2 px от оси пути, прочие — 1 px (рамка имени не задевает их края)
  for (const q of f.paths) h.add(q.pts, NO_OWN, q.kind === 'bar' ? 2.5 : 1, q);
  segCache.set(f, h);
  return h;
}

function unionLinesLog(d: LinkDraw, paint?: (id: string) => { color: string } | null): string {
  const out = new Set<string>();
  for (const q of d.frame.paths) {
    if (!q.union || !linkOn(q, d)) continue;
    // линия супруга к союзу: черта брака «‖» или ступенька лестницы союзов многожёнца (Г4)
    if ((q.kind === 'bar' || q.kind === 'jog') && q.key.kind === 'spouse') out.add(`${q.union}=${q.key.person}`);
    // цвет зубца — цвет ветви потомка выбранного лица (§ 9); без выбора — пусто
    else if (q.kind === 'tooth' && q.key.kind === 'child') out.add(`${q.union}>${q.key.child}:${paint?.(q.key.child)?.color ?? ''}`);
  }
  return [...out].join(';');
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

/** Гости показа (§ 7): тот же знак, светлота 45 %. */
export const GUEST_DIM = 0.45;
function guestDim(guests: ReadonlySet<string> | undefined, f: (id: string) => number): (id: string) => number {
  if (!guests?.size) return f;
  return (id) => (guests.has(id) ? Math.min(GUEST_DIM, f(id)) : f(id));
}
/** При выбранной связи (§ 8) небо гаснет до стольких; её концы — в полную силу. */
export const LINK_DIM = 0.3;
/**
 * Яркость со связью (§ 8): выбранная — её концы в полную силу, остальное небо гаснет до LINK_DIM; наведённая и подсвеченные
 * строкой «Родство» — их концы в полную силу.
 */
function linkDim(s: SkyState, f: (id: string) => number): (id: string) => number {
  const lit = new Set<string>();
  for (const k of [s.linkHover, ...(s.linkPreview ?? [])]) if (k) for (const e of linkRoles(k)) lit.add(e.id);
  const sel = s.link ? new Set(linkRoles(s.link).map((e) => e.id)) : null;
  if (!sel && !lit.size) return f;
  return (id) => (sel?.has(id) || lit.has(id) ? 1 : sel ? Math.min(LINK_DIM, f(id)) : f(id));
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
export const ORTHO_ROUND = 0;

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
    if (keep.length >= 4)
      loops.push({
        t: keep.map((q) => q[0] * step),
        lane: keep.map((q) => q[1] * band - 0.5),
      });
  }
  return loops;
}

/**
 * Путь ортогонального кольца на экране: отрезки с прямыми углами (решение 170: без скруглений — скруглённый контур читался
 * связью); ORTHO_ROUND — радиус угла, сейчас 0.
 */
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
