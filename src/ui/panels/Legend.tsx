/**
 * «Условные знаки» — как читать карту (G5; UX-35, VIS-31, VIS-32, CARD-43; ТЗ § 5.4; принцип 3 docs/UI-PROMPT.md).
 *
 * Всё видимое на небе объяснено строкой с образцом, и образец нарисован той же функцией, что небо:
 *  — знаки, следы, призрак жены и ленты — отдельными образцами: drawGlyph, drawLifeTrail, drawDescent, buildRibbons
 *    и drawStrands (PAINTERS); грамматика связей (этап 11, решение 78: ромб союза, узел, ствол и зубцы, черта брака,
 *    разрыв, обрывки, лента в узле, выбранная связь) — образцами неба drawLinkSample (src/render/plates.ts);
 *    подсветка ветвей выбранного лица — образцом неба drawBranchSample (src/render/branches.ts);
 *  — рамка, облака, созвездия, скопления, кольца, указатели у края, путь родства, выноски линий и меридиан — вырезкой
 *    из настоящего неба: Sky.draw рисует кадр на невидимом холсте, в панель переносится его часть (CROPS);
 *  — полоса времени — часть её собственного холста; рейка и пометы — те же подписи, что в карточке (RailKey,
 *    STATE_TEXT, MARK_FULL, CERT_FULL).
 * Своих копий рисования здесь нет: это проверяет tests/legend.test.ts.
 *
 * Порядок: «Как читать карту» (#legend-guide), небо, карточки на небе, знаки, линии, время, карточка, клавиши
 * (#legend-keys), слои.
 */
import { effect } from '@preact/signals';
import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, graph, type ModelData } from '../../data/atlas.ts';
import { buildRibbons } from '../../engine/ribbons.ts';
import { relate } from '../../engine/kinship.ts';
import { toAstro } from '../../engine/years.ts';
import { Avatar, UnnamedAvatar } from '../card/Avatar.tsx';
import { alpha } from '../../render/color.ts';
import { drawBirthBand, drawGlyph, roleSigla, starRadius, type GlyphOpts } from '../../render/glyphs.ts';
import { drawWorkMark, focusBrackets, focusHalf, highlightFor } from '../../render/marks.ts';
import { drawBranchSample } from '../../render/branches.ts';
import { drawLinkSample, type LinkSign } from '../../render/plates.ts';
import { drawStrands, lineNoteHits, ribbonLook } from '../../render/ribbons.ts';
import { drawFoldMark } from '../../render/labels.ts';
import { eventMarks } from '../../render/frame.ts';
import { FRAME_H, readPalette, Sky, type Palette, type SkyState } from '../../render/sky.ts';
import {
  drawDescent, drawEpochBracket, drawLifeTrail, ghostNote, TAIL_PX, type LifeTrail,
} from '../../render/trails.ts';
import type { SkyView } from '../../render/rows.ts';
import { lambda, lineFlip, model, theme } from '../../state.ts';
import { RailKey, STATE_TEXT, type SecState } from '../card/Rail.tsx';
import { LifeBar } from '../card/Masthead.tsx';
import { CERT_FULL, MARK_FULL, viewTick } from '../common.tsx';
import { ReadingGuide } from '../sky/Overlays.tsx';
import { aliveAt, meridianText } from '../sky/text.ts';
import { KeysTable } from '../top/Keys.tsx';
import { Sheet } from './Sheet.tsx';

// ---------- образцы: те же функции, что у неба ----------

/** Образец: рисунок в пикселях CSS на холсте w × h; фон холста — небо (правило .legend-sample). */
export type Painter = (ctx: CanvasRenderingContext2D, pal: Palette, w: number, h: number) => void;

/** Вид следа неба — как в src/render/trails.ts (drawTrails). */
const look = {
  /** след звезды величины 0–2 (a — яркость лица при выделении) */
  trail: (pal: Palette, a = 1) => alpha(pal.ink2, 0.55 * 1.25 * a),
};

/** Знак лица образца: по умолчанию — мужчина, величина 3, цвет имён на небе. */
const star = (pal: Palette, o: Partial<GlyphOpts> = {}, a = 1): GlyphOpts => ({
  sex: 'm', kind: 'person', magnitude: 3, ...o, color: alpha(pal.ink, a), halo: pal.sky,
});

/** След образца: по умолчанию — годы известны, сплошной от звезды до x1. */
const trail = (pal: Palette, x0: number, x1: number, y: number, o: Partial<LifeTrail> = {}, a = 1): LifeTrail => ({
  x0, x1, y, cls: 'exact', known: true, solidTo: x1, color: look.trail(pal, a), width: 1.2, ...o,
});

/** Лицо со следом: след, потом звезда поверх его начала — как на небе. */
function person(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, x1: number, o: Partial<GlyphOpts> = {}, t: Partial<LifeTrail> = {}, a = 1) {
  if (x1 > x) drawLifeTrail(ctx, trail(pal, x, x1, y, t, a));
  drawGlyph(ctx, x, y, star(pal, o, a));
}

/** Знак без следа (народ, умерший младенцем, призрак) — посередине. */
const sign = (o: Partial<GlyphOpts>): Painter => (ctx, pal, w, h) => drawGlyph(ctx, w / 2, h / 2, star(pal, o));
/** Знак со следом жизни. */
const signTrail = (o: Partial<GlyphOpts>): Painter => (ctx, pal, w, h) => person(ctx, pal, 16, Math.round(h / 2) + 0.5, w - 10, o);
/** Величина звезды m. */
export const magnitude = (m: number): Painter => (ctx, pal, w, h) => drawGlyph(ctx, w / 2, h / 2, star(pal, { magnitude: m }));

/** Середина пикселя: линии в 1 px без размытия. */
const px = (v: number) => Math.round(v) + 0.5;

/** Знак грамматики связей — образцом неба (drawLinkSample). */
const linkSign = (sign: LinkSign): Painter => (ctx, pal, w, h) => drawLinkSample(ctx, pal, w, h, sign);

export const PAINTERS = {
  man: signTrail({}),
  woman: signTrail({ sex: 'f' }),
  people: sign({ kind: 'people', magnitude: 2 }),
  messiah: signTrail({ messiah: true, magnitude: 0 }),
  king: signTrail({ king: true, magnitude: 2 }),
  queen: signTrail({ king: true, sex: 'f', magnitude: 2 }),
  /** полый знак — только «время не установлено» (решение 42): без следа, как в середине скобки */
  hollow: sign({ hollow: true }),
  infant: sign({ infant: true, magnitude: 4 }),
  /** призрак жены в родной семье: пунктирный отвод от следа отца к полому пунктирному кружку */
  ghost: (ctx, pal, w, h) => {
    const y0 = px(8);
    const y1 = px(h - 10);
    const x = px(w * 0.55);
    person(ctx, pal, 14, y0, w - 8);
    ctx.lineWidth = 1;
    drawDescent(ctx, { x, y0, y1, color: alpha(pal.ink3, 0.75), ghost: true });
    drawGlyph(ctx, x, y1, star(pal, { sex: 'f', ghost: true }));
  },
  /** годы известны: сплошной след от рождения до смерти */
  trailExact: (ctx, pal, w, h) => person(ctx, pal, 12, px(h / 2), w - 8),
  /** оценка (решение 90): след проявляется от звезды до конца промежутка рождения и тает от начала промежутка смерти до его конца */
  trailEstimated: (ctx, pal, w, h) =>
    person(ctx, pal, 12, px(h / 2), w - 8, {}, { cls: 'estimated', sureFrom: 12 + (w - 20) * 0.28, solidTo: w - 8 - (w - 20) * 0.22 }),
  /** смерть не известна: сплошной до последнего упоминания и тающий хвост 10 px */
  trailLast: (ctx, pal, w, h) => person(ctx, pal, 12, px(h / 2), w - 8, {}, { known: false, solidTo: w - 8 - TAIL_PX }),
  /** о жизни не известно ничего: только тающий хвост 10 px от звезды */
  trailNone: (ctx, pal, _w, h) => person(ctx, pal, 12, px(h / 2), 12 + TAIL_PX, {}, { known: false, solidTo: 12 }),
  /** известна только эпоха: короткий точечный след */
  trailEpochal: (ctx, pal, w, h) => person(ctx, pal, 12, px(h / 2), w - 8, {}, { cls: 'epochal' }),
  /** растянутое родословие (MAP-51): сплошной след до знака разрыва «//», дальше — бледнее */
  trailBreak: (ctx, pal, w, h) => person(ctx, pal, 12, px(h / 2), w - 8, {}, { brk: 12 + (w - 20) * 0.55 }),
  /** время не установлено (MAP-52): скобка через годы, когда лицо засвидетельствовано, полый знак в середине */
  epochBracket: (ctx, pal, w, h) => {
    const y = px(h / 2);
    drawEpochBracket(ctx, { x0: 10, x1: w - 10, y, color: look.trail(pal) });
    drawGlyph(ctx, w / 2, y, star(pal, { hollow: true }));
  },
  /** промежуток рождения (решение 38; MAP-69): растушёванная полоса влево от знака у первого засвидетельствованного года */
  birthBand: (ctx, pal, w, h) => {
    const y = px(h / 2);
    const x = Math.round(w * 0.62);
    drawBirthBand(ctx, { x0: 8, x1: x, y, color: pal.ink2 });
    person(ctx, pal, x, y, w - 8);
  },
  /** фокус клавиатуры (решение 149): угловые скобки неба (marks.ts, focusBrackets) вокруг знака */
  focus: (ctx, pal, w, h) => {
    const y = px(h / 2);
    const q = { magnitude: 3, sex: 'm' };
    drawGlyph(ctx, w / 2, y, star(pal, { magnitude: 3 }));
    focusBrackets(ctx, w / 2, y, focusHalf(q, 1, false), pal.ink);
  },
  /** лицо из рабочего набора (IX-51, IX-77): уголок над-справа от знака */
  workMark: (ctx, pal, w, h) => {
    const y = px(h / 2 + 2);
    person(ctx, pal, 16, y, w - 10);
    drawWorkMark(ctx, 16, y, starRadius(3), pal.ink);
  },
  /**
   * Грамматика связей (этап 11, решение 78; STAGE11 § 2): ромб союза на следе матери, узел второго гнезда, ствол с
   * зубцами и чертой брака, разрыв чужого следа, обрывки длинной связи, лента в узле своего шага, выбранная связь —
   * образцами неба drawLinkSample (src/render/plates.ts, Q1): те же рисовальщики и размеры, что на небе.
   */
  linkTrunk: linkSign('trunk'),
  linkNode: linkSign('node'),
  linkJoin: linkSign('join'),
  linkCut: linkSign('cut'),
  linkStub: linkSign('stub'),
  linkRibbon: linkSign('ribbon'),
  linkSelected: linkSign('selected'),
  /** свёрнутое созвездие (J5): строка с названием и числом скрытых лиц */
  foldGroup: (ctx, pal, _w, h) => drawFoldMark(ctx, pal, false, 6, Math.round(h / 2) + 4, 'ЕДОМ', '+38'),
  /**
   * Две ленты: общий участок (коса), у Луки лишнее звено по толкованию (разреженная нить), снова коса, расхождение на два
   * поколения (Иосиф выше), схождение; последнее лицо — Иисус Христос.
   */
  ribbons: (ctx, pal, w, h) => {
    const at: Record<string, [number, number]> = {
      a: [0, 0], b: [1, 0], k: [2, 1], c: [3, 0], d: [4, 0], j1: [5, -1], j2: [6, -1], m1: [5, 1], m2: [6, 1], e: [7, 0], z: [8, 0],
    };
    const J = ['a', 'b', 'c', 'd', 'j1', 'j2', 'e', 'z'];
    const M = ['a', 'b', 'k', 'c', 'd', 'm1', 'm2', 'e', 'z'];
    const step = (w - 36) / 8;
    const lane = Math.min(18, (h - 16) / 2);
    const project = (id: string) => ({ x: 18 + at[id][0] * step, y: h / 2 + at[id][1] * lane });
    const strands = buildRibbons({ joseph: J.map((id) => ({ id, weak: false })), mary: M.map((id) => ({ id, weak: id === 'k' })), project, amplitude: 6, meander: 3 });
    drawStrands(ctx, strands, 2.4, ribbonLook(pal), w);
    for (const id of Object.keys(at)) {
      const p = project(id);
      drawGlyph(ctx, p.x, p.y, star(pal, { magnitude: id === 'z' ? 0 : 3, messiah: id === 'z' }));
    }
  },
  /** подсветка ветвей выбранного лица (решение 69): предок, выбранное лицо, три ветви своих цветов, внук бледнее */
  branches: drawBranchSample,
} satisfies Record<string, Painter>;

export type PainterKey = keyof typeof PAINTERS;

/** Ширина образца во всю строку: по ширине строки панели (400–520 px на компьютере, во весь телефон). */
function useFill(ref: { current: HTMLElement | null }, fixed?: number): number {
  const [w, setW] = useState(fixed ?? 0);
  useLayoutEffect(() => {
    if (fixed !== undefined) return;
    const el = ref.current?.parentElement;
    if (!el) return;
    const measure = () => setW(Math.max(0, Math.floor(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixed]);
  return w;
}

/** Холст образца: размер CSS (без w — во всю строку), плотность пикселей, палитра темы; перерисовывается при смене темы. */
function Paint({ draw, w: fixed, h }: { draw: Painter; w?: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = useFill(ref, fixed);
  const map = theme.value;
  useLayoutEffect(() => {
    const cv = ref.current!;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'butt';
    draw(ctx, readPalette(), w, h);
  }, [map, w, h]);
  return <canvas ref={ref} class="legend-sample" style={{ width: fixed ? `${fixed}px` : '100%', height: `${h}px` }} aria-hidden="true" />;
}

// ---------- вырезки из настоящего неба ----------

/** Где середина вырезки: год (астр.) и полоса или лица (середина их рамки на небе). */
type At = { t: number; lane: number } | { ids: string[] };

export interface CropSpec {
  /** середина вырезки и сдвиг от неё, px */
  at: (m: ModelData, sky?: Sky) => At;
  dx?: number;
  dy?: number;
  /** масштаб: лет на ширину вырезки, высота полосы (px) или «вписать лица» (fit) */
  years?: number;
  ky?: number;
  fit?: boolean;
  /**
   * Рамка: небо шириной во вырезку и высотой h, вырезка — от y. По умолчанию — общий холст, вырезка в открытом небе;
   * top — вырезка от верха открытого неба (подписи меридианов событий стоят у него).
   */
  frame?: { h: number; y: number };
  top?: boolean;
  /** состояние неба сверх обычного (все слои, без выделения) */
  state?: (m: ModelData) => Partial<SkyState>;
  /** что показывает небо вырезки: свёрнутые потомки или созвездия (J5) — как setView неба; своё небо на вырезку */
  view?: () => Partial<SkyView>;
  /** масштаб времени: 1 — по насыщенности (полоса плотности на линейке), 0 — истинный; по умолчанию — как у неба */
  lambda?: number;
  /** после кадра — куда передвинуть вырезку (px холста неба), например к указателю у края */
  focus?: (sky: Sky) => { x: number; y: number } | null;
}

/** Общий холст вырезок из открытого неба: пороги подписей строятся один раз на размер. */
const SHARED = { w: 620, h: 420 };
/** Отступ вырезки от рамки неба, px: подписи у края вырезки — как в середине неба. */
const INSET = 40;

const ALL_LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };

/** Лица с хронологическими напряжениями — как у неба (SkyView): знак разрыва на отводах. */
const tensionsOf = (m: ModelData) => new Set(m.tensions.flatMap((t) => (t.persons.length <= 3 ? t.persons : [t.persons[0], t.persons[t.persons.length - 1]])));

/** Небо для вырезок одного размера — одно на размер и плотность пикселей. */
const skies = new Map<string, Sky>();
function skyOf(w: number, h: number, dpr: number, m: ModelData, lam: number, own = ''): Sky {
  const key = `${w}×${h}@${dpr}${own}`;
  let s = skies.get(key);
  if (!s) {
    // ширина панели меняется редко; старые холсты не копятся
    if (skies.size >= 6) skies.clear();
    s = new Sky(document.createElement('canvas'));
    s.setModel(m, lam);
    s.resize(w, h, dpr);
    skies.set(key, s);
  }
  s.pal = readPalette();
  s.setModel(m, lam);
  return s;
}

/** kx, при котором высота полосы — ky: по функции самой камеры (она монотонна). */
function kxForKy(sky: Sky, ky: number): number {
  let lo = Math.log(1e-4);
  let hi = Math.log(12);
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (sky.cam.kyFor(Math.exp(mid)) < ky) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

/** Состояние неба вырезки: все слои, без выделения и движения. */
export function cropState(m: ModelData, lam: number, extra: Partial<SkyState> = {}): SkyState {
  return {
    model: m, lambda: lam, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: ALL_LAYERS,
    onlyLines: false, meridian: null, tensionPersons: tensionsOf(m), flow: 0, reduced: true, intro: 1, lineFlip: lineFlip.peek(),
    pins: new Set(), meridianLabel: null, reserve: [], kinSteps: null, depth: null, ...extra,
  };
}

/** Нарисовать вырезку spec размером w × h на холсте cv: кадр настоящего неба и перенос его части. */
export function paintCrop(cv: HTMLCanvasElement, spec: CropSpec, w: number, h: number) {
  const m = model.peek();
  const lam = spec.lambda ?? lambda.peek();
  const dpr = window.devicePixelRatio || 1;
  const size = spec.frame ? { w, h: spec.frame.h } : SHARED;
  const sky = skyOf(size.w, size.h, dpr, m, lam, spec.view ? '|view' : '');
  // свёрнутое на небе (J5): план неба вырезки; полосы сжаты — лица стоят в строках плана (Sky.rowOf)
  if (spec.view) sky.setView({ mode: 'all', set: new Set(), foldDesc: [], foldGroups: [], ...spec.view() });
  const rowOf = (l: number) => (spec.view ? sky.rowOf(l) : l);
  let rx = spec.frame ? 0 : sky.letterW + INSET;
  let ry = spec.frame ? spec.frame.y : spec.top ? FRAME_H : FRAME_H + INSET;
  // середина вырезки на небе — год и полоса или рамка лиц
  const at = spec.at(m, sky);
  let t: number;
  let lane: number;
  let wx: number | null = null;
  let fit: number | null = null;
  if ('ids' in at) {
    const idx = at.ids.map((id) => sky.indexOf(id)).filter((i): i is number => i !== undefined);
    if (!idx.length) return;
    const xs = idx.map((i) => sky.X0[i]);
    const ls = idx.map((i) => rowOf(sky.nodes[i].lane));
    wx = (Math.min(...xs) + Math.max(...xs)) / 2;
    t = sky.tOf(wx);
    lane = (Math.min(...ls) + Math.max(...ls)) / 2;
    // вписать лица: по ширине — в 3/4 вырезки, по полосам — в 2/3 её высоты
    if (spec.fit) fit = Math.min(0.75 * w / Math.max(1e-6, Math.max(...xs) - Math.min(...xs)), kxForKy(sky, (0.66 * h) / Math.max(1, Math.max(...ls) - Math.min(...ls))));
  } else ({ t, lane } = at);
  const X = wx ?? sky.xOf(t);
  const kx = fit ?? (spec.years ? w / Math.max(1e-6, sky.xOf(t + spec.years / 2) - sky.xOf(t - spec.years / 2)) : kxForKy(sky, spec.ky ?? 14));
  const cx = rx + w / 2 + (spec.dx ?? 0);
  const cy = ry + h / 2 + (spec.dy ?? 0);
  sky.cam.set({ x0: X - cx / kx, kx, laneTop: lane + cy / sky.cam.kyFor(kx) });
  sky.draw(cropState(m, lam, spec.state?.(m)));
  const f = spec.focus?.(sky);
  if (f) {
    rx = Math.max(0, Math.min(size.w - w, f.x - w / 2));
    ry = Math.max(0, Math.min(size.h - h, f.y - h / 2));
  }
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(sky.canvas, Math.round(rx * dpr), Math.round(ry * dpr), cv.width, cv.height, 0, 0, cv.width, cv.height);
}

/** Звезда лица на холсте неба, px. */
const starAt = (sky: Sky, id: string) => {
  const i = sky.indexOf(id);
  return i === undefined ? null : { x: sky.cam.sx(sky.X0[i]), y: sky.cam.sy(sky.nodes[i].lane) };
};

/** Путь родства пары для вырезки: лица и шаги, как у неба после «Родство с…». */
function pairState(a: string, b: string): Partial<SkyState> {
  const rel = relate(graph, a, b, 1)[0];
  if (!rel) return {};
  const path = [a, ...rel.steps.map((s) => s.to)];
  return { selected: a, second: b, kinSteps: rel.steps, highlight: highlightFor(a, path)?.hl ?? null };
}

/**
 * Высота неба вырезок рамки: одна на все, чтобы пороги подписей строились один раз. Вырезки только рамки (полоса
 * плотности, штриховка, координата) — в режиме «только линии»: облака обзора под рамкой не нужны, а их растр дорог.
 */
const FRAME_SKY = 170;

/** Каинан, сын Арфаксада (Лк 3:36): точка сравнения «только у Луки». */
const LUKE_CAINAN = 'kainan-syn-arfaksada';

export const CROPS = {
  /** рамка: линейка лет, служебная строка с эпохами и масштабной линейкой, граница эпох на небе */
  frame: { at: () => ({ t: toAstro(-1000), lane: 8 }), years: 220, frame: { h: FRAME_SKY, y: 0 } },
  /** полоса плотности шкалы и штриховка после 100 г. по Р. Х.; черта завершения канона */
  density: { at: () => ({ t: toAstro(-3000), lane: 0 }), years: 1600, lambda: 1, frame: { h: FRAME_SKY, y: 0 }, state: () => ({ onlyLines: true }) },
  /** штриховка после 100 г. по Р. Х. и черты «завершение канона» и «сегодня» */
  canon: { at: () => ({ t: toAstro(40), lane: 0 }), years: 1500, lambda: 1, frame: { h: FRAME_SKY, y: 0 }, state: () => ({ onlyLines: true }) },
  /** координата: буквы строк слева и номера столбцов внизу */
  coord: { at: () => ({ t: toAstro(-1010), lane: 0 }), years: 420, frame: { h: FRAME_SKY, y: FRAME_SKY - 70 }, state: () => ({ onlyLines: true }) },
  /** постоянный меридиан события с подписью вдоль черты */
  event: {
    // год Потопа — по модели хронологии: тот же, что у меридиана на небе (eventMarks)
    at: (_m: ModelData, sky?: Sky) => ({ t: (sky && eventMarks(sky).find((e) => e.name === 'Потоп')?.t) ?? toAstro(-2518), lane: 60 }),
    years: 120,
    top: true,
  },
  /** облака плотности на обзоре */
  clouds: { at: () => ({ t: toAstro(-760), lane: -2 }), ky: 2.2 },
  /** созвездие и дом внутри него */
  house: { at: () => ({ ids: ['aaron', 'finees'] }), years: 190, dy: 20 },
  /** народ вне Израиля: лёгкая заливка */
  nation: { at: () => ({ ids: (graph.childrenOf.get('khettura') ?? []).map((e) => e.child) }), fit: true },
  /** свёрнутое скопление: кольцо из точек и подпись списка */
  ring: {
    at: (m: ModelData) => {
      const b = m.blocks.find((x) => x.cluster?.name === 'Пришедшие к Давиду в Секелаг');
      return b?.cluster ? { t: b.cluster.tc, lane: (b.laneMin + b.laneMax) / 2 } : { t: toAstro(-989), lane: -30.5 };
    },
    ky: 2.3,
    dx: 120,
  },
  /** раскрытое скопление: сетка имён и скобка «время не установлено» */
  grid: {
    at: (m: ModelData) => {
      const c = m.blocks.find((b) => b.cluster?.name === 'Взявшие жён иноплеменных')?.cluster;
      return c ? { t: c.t0 + 7, lane: c.labelLane - 0.8 } : { t: toAstro(-1000), lane: 29 };
    },
    years: 18,
  },
  /** кольца выбранного лица, фокуса и наведённой звезды */
  rings: {
    at: () => ({ ids: ['david'] }), years: 70, dx: 50,
    state: () => ({ selected: 'david', focus: 'david', hovered: 'iessey', highlight: highlightFor('david', null)?.hl ?? null }),
  },
  /** скопление семьи на обзоре (решение 142): выбранный Иаков, знаки его семьи у его знака и «+N» */
  pile: {
    at: () => ({ ids: ['iakov'] }), ky: 3, dx: -80,
    state: () => ({ selected: 'iakov', highlight: highlightFor('iakov', null)?.hl ?? null }),
  },
  /** отметки одноимённых */
  pins: {
    at: () => ({ ids: ['iosif'] }), years: 90,
    state: () => ({ pins: new Set([...byId.values()].filter((p) => p.name === 'Иосиф').map((p) => p.id)) }),
  },
  /** указатель у края на выбранное лицо за краем окна */
  edge: {
    at: () => ({ ids: ['david'] }), years: 90, dx: SHARED.w, state: () => ({ selected: 'david' }),
    focus: (sky: Sky) => {
      const e = sky.edgeHits[0];
      return e ? { x: e.x + e.w / 2 - 60, y: e.y + e.h / 2 } : null;
    },
  },
  /** семья на небе (этап 11, Г1–Г12): ромбы союзов на следах матерей, стволы и зубцы к детям, черта брака */
  family: { at: () => ({ ids: ['iakov', 'liya', 'ruvim', 'dan'] }), fit: true },
  /** свёрнутые потомки (J5; UX-80): «+N» сразу после имени — кадр неба, где у Давида свёрнуты потомки */
  fold: { at: () => ({ ids: ['david'] }), ky: 16, dx: -40, dy: 6, view: () => ({ foldDesc: ['david'] }) },
  /** путь родства пары и подписи шагов */
  path: { at: () => ({ ids: ['ioav', 'saruiya', 'david'] }), fit: true, state: () => pairState('ioav', 'david') },
  /** дуга родства по термину Писания у наведённого лица */
  arc: { at: () => ({ ids: ['elisaveta', 'mariya'] }), fit: true, state: () => ({ hovered: 'elisaveta' }) },
  /** развилка у Давида в режиме «только линии»: выноска, знак матери ветвей, подписи ветвей */
  split: {
    at: () => ({ ids: ['david'] }), ky: 14, dx: 60, state: () => ({ onlyLines: true }),
    focus: (sky: Sky) => {
      const n = lineNoteHits(sky).find((x) => x.kind === 'synopsis' && x.id === 'david');
      const s = starAt(sky, 'david');
      return n && s ? { x: n.x + n.w / 2 - 30, y: n.y + 58 } : null;
    },
  },
  /** выноска точки сравнения в режиме «только линии» */
  compare: {
    at: () => ({ ids: [LUKE_CAINAN] }), ky: 12, state: () => ({ onlyLines: true }),
    focus: (sky: Sky) => {
      const n = lineNoteHits(sky).find((x) => x.kind === 'synopsis' && x.id === LUKE_CAINAN);
      const s = starAt(sky, LUKE_CAINAN);
      return n && s ? { x: (n.x + n.w / 2 + s.x) / 2, y: (n.y + n.h / 2 + s.y) / 2 } : null;
    },
  },
  /** меридиан года: черта через небо, флажок у линейки, живые — ярко */
  meridian: {
    at: () => ({ t: toAstro(-990), lane: 8 }), years: 200, frame: { h: FRAME_SKY, y: 0 },
    state: (m: ModelData) => {
      const t = toAstro(-990);
      const alive = aliveAt(m.chrono, t);
      let sure = 0;
      for (const k of alive.values()) if (k === 'sure') sure++;
      return { meridian: t, meridianLabel: meridianText(t, alive.size, sure), highlight: alive };
    },
  },
} satisfies Record<string, CropSpec>;

export type CropKey = keyof typeof CROPS;

/**
 * Вырезка из неба: рисуется, когда попадает в видимую часть панели (кадр неба — несколько миллисекунд, вырезок много),
 * и заново — при смене темы, модели и масштаба времени.
 */
function Crop({ spec, w: fixed, h }: { spec: CropSpec; w?: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = useFill(ref, fixed);
  const deps = [theme.value, model.value, lambda.value, lineFlip.value, w, h];
  useEffect(() => {
    const cv = ref.current!;
    if (!w) return;
    let done = false;
    const paint = () => {
      if (done) return;
      done = true;
      paintCrop(cv, spec, w, h);
    };
    if (typeof IntersectionObserver === 'undefined') {
      paint();
      return;
    }
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (paint(), io.disconnect()), { rootMargin: '300px 0px' });
    io.observe(cv);
    return () => io.disconnect();
  }, deps);
  return <canvas ref={ref} class="legend-sample" style={{ width: fixed ? `${fixed}px` : '100%', height: `${h}px` }} aria-hidden="true" />;
}

// ---------- полоса времени ----------

/** Поле полосы времени у края холста, px (как в src/ui/TimeStrip.tsx). */
const STRIP_PAD = 14;

/**
 * Полоса времени — часть её собственного холста около рамки окна: те же эпохи, гистограмма, нити лент и рамка.
 * Годы рамки и края шкалы полоса сама пишет в разметку (data-window, aria-valuemin, aria-valuemax).
 */
function StripSample() {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = useFill(ref);
  const [h, setH] = useState(0);
  useEffect(() => {
    const cv = ref.current!;
    if (!w) return;
    let raf = 0;
    const copy = () => {
      raf = 0;
      const src = document.querySelector<HTMLCanvasElement>('.strip canvas');
      if (!src || !src.width || !src.clientWidth) return;
      const win = src.closest<HTMLElement>('.strip')?.dataset.window?.split(' ').map(Number);
      const dpr = src.width / src.clientWidth;
      const W = src.clientWidth;
      const H = src.clientHeight;
      const t0 = toAstro(Number(src.getAttribute('aria-valuemin')));
      const t1 = Number(src.getAttribute('aria-valuemax'));
      const mid = win?.length === 2 && Number.isFinite(t0) && t1 > t0 ? (win[0] + win[1]) / 2 : null;
      const x = mid === null ? W / 2 : STRIP_PAD + ((mid - t0) / (t1 - t0)) * (W - 2 * STRIP_PAD);
      const sx = Math.max(0, Math.min(W - w, x - w / 2));
      const cw = Math.round(w * dpr);
      const ch = Math.round(H * dpr);
      if (cv.width !== cw) cv.width = cw;
      if (cv.height !== ch) cv.height = ch;
      setH(H);
      cv.getContext('2d')?.drawImage(src, Math.round(sx * dpr), 0, cw, ch, 0, 0, cw, ch);
    };
    // полоса перерисовывается с каждым кадром неба и при смене темы; копия — в следующем кадре
    const off = effect(() => {
      void viewTick.value;
      void theme.value;
      if (!raf) raf = requestAnimationFrame(copy);
    });
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [w]);
  return <canvas ref={ref} class="legend-sample" style={{ width: '100%', height: `${h}px` }} aria-hidden="true" />;
}

// ---------- образы лиц (решение 74) ----------

/** Образцы образов лиц (решение 74): мужчина, женщина, народ, неназванное лицо, Иисус Христос — функциями древа. */
function AvatarSamples() {
  const people = ['mitsraim', 'kittim'].find((id) => byId.has(id));
  const items: [ComponentChildren, string][] = [
    [<Avatar id="adam" size={40} />, 'мужчина'],
    [<Avatar id="eva" size={40} />, 'женщина'],
    ...(people ? [[<Avatar id={people} size={40} />, 'народ'] as [ComponentChildren, string]] : []),
    [<UnnamedAvatar size={40} />, 'не назван'],
    [<Avatar id="iisus" size={40} />, 'Иисус Христос'],
  ];
  return (
    <span class="lt-sample lt-avatars" aria-hidden="true">
      {items.map(([pic, cap]) => (
        <span class="lt-av" key={cap}>
          {pic}
          <span class="legend-num">{cap}</span>
        </span>
      ))}
    </span>
  );
}

// ---------- строки ----------

/** Строка: образец слева, пояснение справа. */
function Row({ s, children }: { s: ComponentChildren; children: ComponentChildren }) {
  return (
    <li class="legend-row">
      <span class="legend-pic">{s}</span>
      <span class="legend-text">{children}</span>
    </li>
  );
}
/** Строка с образцом во всю ширину: образец сверху, пояснение под ним. */
function Wide({ s, children }: { s: ComponentChildren; children: ComponentChildren }) {
  return (
    <li class="legend-row legend-wide">
      <span class="legend-pic">{s}</span>
      <span class="legend-text">{children}</span>
    </li>
  );
}

/** Ширина образца в строке с пояснением справа. */
const SW = 96;
const P = (k: PainterKey, h = 26) => <Paint draw={PAINTERS[k]} w={SW} h={h} />;
const C = (k: CropKey, h = 90, w?: number) => <Crop spec={CROPS[k]} w={w} h={h} />;

/** Сокращения ролей после имени — те же, что пишет небо (roleSigla). */
const ROLES: [string, string][] = [
  ['king', 'царь'],
  ['queen', 'царица'],
  ['prophet', 'пророк'],
  ['high-priest', 'первосвященник'],
  ['priest', 'священник'],
  ['judge', 'судья'],
  ['apostle', 'апостол'],
  ['patriarch', 'праотец'],
  ['levite', 'левит'],
];

/** Словарь «Как читать карту» (решение 36; UX-54): каждое слово — одно понятие. */
export const GLOSSARY: [string, string][] = [
  ['небо', 'карта: по горизонтали время, по вертикали — роды и колена'],
  ['строка неба', 'деление неба по вертикали: горизонтальный ряд звёзд; у левого края — буква строки'],
  ['столбец', 'сто лет неба; внизу — его номер'],
  ['созвездие', 'род, колено или народ — область неба с контуром'],
  ['лента', 'линия Мессии: золотая — по Матфею, через Иосифа; лазурная — по Луке, традиционно через Марию'],
  ['след', 'полоса вправо от звезды — время жизни лица'],
];

/** Разделы панели после «Как читать карту». */
const PARTS = [
  ['legend-sky', 'Небо'],
  ['legend-cards', 'Карточки на небе'],
  ['legend-signs', 'Знаки'],
  ['legend-lines', 'Линии'],
  ['legend-map', 'Линии карты'],
  ['legend-time', 'Время'],
  ['legend-card', 'Карточка'],
  ['legend-keys', 'Клавиши'],
  ['legend-layers', 'Слои'],
] as const;

/** Состояния рейки — все четыре вида меток. */
const RAIL_ALL: Record<number, SecState> = { 1: 'content', 2: 'silent', 3: 'absent', 21: 'na' };

export function LegendPanel() {
  // перечитать образцы при смене темы
  void theme.value;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' });
  const rachel = ghostNote('rakhil', 'iakov');
  return (
    <Sheet title="Условные знаки" lead="Как читать карту: что значит каждый знак, линия и надпись на небе.">
      {/* тот же текст, что во вступлении (C5; UX-03): клавиша «?» и команда «Как читать карту» ведут сюда */}
      <h3 id="legend-guide">Как читать карту</h3>
      <ReadingGuide both />
      {/* одно слово — одно понятие (решение 36; UX-54): эти слова значат одно и то же во всех текстах атласа */}
      <dl class="glossary">
        {GLOSSARY.map(([term, what]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <nav class="cmds legend-toc" aria-label="Разделы условных знаков">
        {PARTS.map(([id, name]) => (
          <button key={id} type="button" class="cmd" onClick={() => go(id)}>
            {name}
          </button>
        ))}
      </nav>

      <h3 id="legend-sky">Небо</h3>
      <p class="muted">Небо — лист звёздного атласа: по горизонтали время, по вертикали — роды и колена.</p>
      <ul class="legend">
        <Wide s={C('frame', FRAME_H + 1)}>
          Вверху — линейка лет: риски, годы и граница эр. Под ней — служебная строка: названия эпох, их границы короткими
          чертами и справа масштабная линейка «масштаб ├──┤ 50 лет» — столько лет в отрезке здесь; «≈» — время в окне растянуто
          неравномерно. Эпохи на небе чередуются светлотой фона.
        </Wide>
        <Wide s={C('density', 26)}>
          Под рисками — полоса плотности шкалы: светлее там, где время растянуто (масштаб «Сжатый по плотности лиц»),
          темнее — где сжато.
        </Wide>
        <Wide s={C('canon', FRAME_H + 1)}>
          После 100 г. по Р. Х. — штриховка: время до 2040 г. сжато, лиц Писания там нет; на пустом небе — пояснение об этом.
          Черты «завершение канона» и «сегодня» идут через небо, их названия — в служебной строке.
        </Wide>
        <Wide s={C('coord', 70)}>
          Слева — буквы строк неба, внизу — номера столбцов по сто лет. Номер столбца и буква строки — координата лица
          в «Указателе».
        </Wide>
        <Wide s={C('event', 110)}>
          Точечная черта с подписью вдоль неё — постоянный меридиан события: Потоп, призвание Аврама, Исход, закладка
          храма, плен, возвращение, Рождество Христово.
        </Wide>
        <Wide s={C('clouds', 90)}>
          На обзоре — облака: чем светлее, тем больше лиц родилось в этом месте неба. Видны только самые яркие звёзды;
          при приближении облака гаснут, проявляются все звёзды, следы и связи.
        </Wide>
        <Wide s={C('house', 110)}>
          Сплошной контур — созвездие: род, колено. Пунктирный контур внутри — дом внутри колена (здесь — священники, сыны
          Аароновы, в колене Левиином). Названия созвездий набраны прописными вразрядку и не закрывают звёзд: где места
          нет, название стоит дальше по области.
        </Wide>
        <Wide s={C('nation', 90)}>Лёгкая заливка внутри контура — народ вне Израиля.</Wide>
        <Wide s={C('ring', 70)}>
          Кольцо из шести точек — скопление: список имён без родства (храбрые Давида, строители стены). Подпись — название
          списка, число имён и, если есть место, стихи.
        </Wide>
        <Wide s={C('grid', 110)}>
          Приблизьте — скопление раскроется в сетку имён под скобкой «время не установлено»: годы этих лиц Писание не
          сообщает, поэтому следов жизни у них нет.
        </Wide>
        <Wide s={C('fold', 56)}>
          «+» с числом сразу после имени — потомки лица скрыты на небе, число — сколько лиц скрыто (здесь — у Давида);
          щелчок по знаку показывает их. Скрыть потомков на небе — пункт «Добавить в набор ▾» в подробной карточке, клавиша С (C)
          или меню звезды: правая кнопка мыши, долгое касание.
        </Wide>
        {/* помета порядка (этап 11, Г9): на небе её нет — только в подсказке звезды и в карточках (src/render/links.ts) */}
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Порядок рождения виден по положению: старший — ближе к матери, дальше вниз по годам. Исключение — ребёнок на
            линии Мессии (Иуда у Иакова, Соломон и Нафан у Давида): он стоит у своей ленты, а не в ряду братьев и сестёр,
            и его место в этом ряду по небу не читается — порядок детей называет карточка союза. Если годы детей оценены по
            порядку перечисления, помета об этом — не на небе, а в подсказке звезды и в строке «Год» карточки у звезды
            (у Рувима: по порядку перечисления, Быт 29:32–35; 30:17–21, выв.); у союза — «годы детей — …» в его карточке.
          </span>
        </li>
        <Row s={P('workMark')}>
          уголок над звездой справа — лицо в наборе («Добавить в набор»); при добавлении звезда один раз обводится
        </Row>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Строка «Свёрнуто: … — развернуть» в служебной строке неба перечисляет скрытое: созвездия и потомков лиц, с числом
            скрытых лиц; щелчок по пункту разворачивает его. Лица линий Мессии не скрываются никогда.
          </span>
        </li>
        <Row s={P('foldGroup')}>
          Свёрнутое созвездие — надпись с названием и числом скрытых лиц; щелчок разворачивает. Свернуть созвездие — правой
          кнопкой мыши или долгим касанием по его названию; развернуть всё сразу — команда «развернуть всё» у кнопок внизу
          справа.
        </Row>
        {/* показ (решения 81, 82): строка «На небе: …» и лист «Показ» — src/ui/sky/ShowBar.tsx, src/ui/panels/Show.tsx */}
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Строка «На небе: …» у верхней кромки неба говорит, что показано: всё небо, линии Мессии, ключевые лица,
            созвездия, род лица или набор, и сколько в показе лиц. Её части — команды: «изменить» открывает лист «Показ»,
            в нём — вид показа, созвездия с полем «Найти созвездие», связи наружу, род лица и число лиц до применения.
            «Вписать» у кнопок внизу справа и название «Толедот» ставят в окно весь показ; «Всё небо» — показ всех лиц.
            Ближайшая родня Давида — 33 лица: родители, супруги и дети лица в семейной укладке; «вернуть прежний показ»,
            «изменить», «всё небо». «История: Руфь › Давид › Соломон» — последние пять выборов, имя возвращает к лицу;
            новый поиск начинает новую историю; на узком экране — «‹ Давид». После перехода к эпохе в частичном показе — «в показе нет лиц этой эпохи — всё небо».
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Набор — лица, собранные вручную: начало «С Адама» или «С Иисуса Христа», раскрытые союзы и команда «Добавить в
            набор» в подробной карточке, в меню звезды, в поиске и в «Родстве». В показе «набор» подписаны все его лица,
            пустые строки неба убраны; список — в панели «Набор».
          </span>
        </li>
        {/* союз на небе (решение 78, Г4): ромб на следе матери — образцом неба drawLinkSample (src/render/plates.ts) */}
        <Wide s={<Paint draw={PAINTERS.linkNode} h={30} />}>
          Союз на небе — брак или связь, от которой пошли дети: жена, наложница, служанка, данная в жену. Ромб союза стоит
          на следе матери, там, где из него выходит ствол к её детям; мать не названа — на следе отца. Ромб двухцветный:
          синяя половина — муж, розовая — жена; звёзды лиц круглые, так что союз не спутать с лицом. Когда линии союза
          цветные, ромб того же цвета: цвет ветви выбранного лица, жёлтый выбранной связи, золотистый — союзы лица под
          указателем и выбранного. От мужа к ромбу идёт черта брака, от ромба — вертикальный ствол, от ствола — короткие
          зубцы к детям: старший ближе к матери, дальше вниз по годам (ребёнок на линии Мессии — у своей ленты, вне этого
          ряда). Залитый ромб — дети показаны; полый с числом —
          свёрнуты, число — сколько лиц союза ещё не показано. Линия штрихом — иное происхождение (по закону, по Луке, левират, усыновление), точками — по толкованию
          и «время не установлено». Щелчок по ромбу открывает у него карточку союза: супруги, вид связи и стих; «Показать
          детей союза» или «Скрыть детей союза», «Подробнее о союзе» — подробная карточка союза справа.
        </Wide>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Плюс без числа после имени — у лица есть союзы, которых нет на небе: щелчок по нему покажет их ромбы, как
            «Продолжить ветвь» в карточке у звезды. Плюс с числом после имени — другое: потомки лица скрыты на небе (см.
            выше).
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            {/* имена начал — те же, что в интерфейсе (STARTS, LINES_TITLE в src/ui/reveal.ts; tests/start-m3.test.ts) */}
            Начало — «С Адама», «С Иисуса Христа», «Родословие Иисуса Христа (Мф 1, Лк 3)», «Ключевые лица» или «Всё небо»
            — выбирается при первом посещении. Первые два начинают набор с одного лица, его карточка у звезды открыта;
            «Родословие Иисуса Христа (Мф 1, Лк 3)» — показ линий Мессии; «Ключевые лица» и «Всё небо» — одноимённые показы.
            «Начать заново» — в листе «Вид», в панели «Набор» и в меню «Ещё».
          </span>
        </li>
      </ul>

      {/* один атлас (решения 77, 83): карточка у звезды, у ромба союза и у связи — лист атласа на небе */}
      <h3 id="legend-cards">Карточки на небе</h3>
      <p class="muted">
        Одна карточка за раз — у звезды, у ромба союза или у выбранной связи. Подробная карточка лица — справа, на телефоне —
        лист снизу.
      </p>
      <ul class="legend">
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Щелчок, касание или Enter на звезде — у неё карточка: образ, имя, уточнение, годы и блок «Родство» — родители,
            жёны или муж, дети, братья и сёстры и как получен год. Наведите указатель на имя в «Родстве» — его линия
            подсветится на небе; щелчок по имени выбирает это лицо, Enter — открывает карточку этой связи. «Вся карточка» —
            подробная карточка справа; «Предки и потомки ▾» — на небе только предки или потомки лица; «Родство с…» — путь к
            другому лицу.
          </span>
        </li>
        {/* образы лиц (решение 74): силуэт — условный знак оформления, изображение «худож.» — не из Писания */}
        <li class="legend-row legend-wide">
          <span class="legend-pic">
            <AvatarSamples />
          </span>
          <span class="legend-text">
            Силуэт на карточке — условный знак: мужской или женский, у народа — группа, у неназванного — пунктир; у Иисуса
            Христа — восьмилучевая звезда. Изображение с пометой «худож.» — художественная интерпретация создателей
            приложения, не изображение из Писания.
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Щелчок по линии — связь выделяется жёлтым целиком: от звёзд отца и матери по их следам до ромба союза и от него
            по стволу до звезды ребёнка; на её концах — кольца с ролями («отец», «мать», «сын»), рядом —
            карточка связи: «Иаков и Рахиль — родители; Иосиф — сын» и стихи, концы с годами, союз, ленты, если это шаг
            родословия Иисуса Христа. Выбор лица при этом не меняется. Escape снимает сначала связь, потом карточку у
            звезды.
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Неназванный супруг: союз — «Сиф и его жена», в карточке — «имя жены в Писании не названо». Если у лица есть и
            названные жёны, — «Давид (мать не названа)»: какая из жён, текст не говорит.
          </span>
        </li>
      </ul>

      <h3 id="legend-signs">Знаки</h3>
      <p class="muted">Звезда — лицо, в году его рождения.</p>
      <ul class="legend">
        <li class="legend-row legend-wide">
          <span class="legend-pic legend-mags">
            {[0, 1, 2, 3, 4, 5, 6].map((m) => (
              <span class="legend-mag" key={m}>
                <Paint draw={magnitude(m)} w={30} h={22} />
                <span class="legend-num">{m}</span>
              </span>
            ))}
          </span>
          <span class="legend-text">Величина звезды — значимость лица в повествовании: 0 — самые значимые лица, 6 — упомянутые мимоходом.</span>
        </li>
        <Row s={P('man')}>мужчина</Row>
        <Row s={P('woman')}>женщина — диск в тонком кольце</Row>
        <Row s={P('people')}>народ или род, названный «сыном» в родословии (Быт 10) — пять точек, как рассеянное скопление; следа нет</Row>
        <Row s={P('king')}>царь — черта над знаком</Row>
        <Row s={P('queen')}>царица — черта над кольцом</Row>
        <Row s={P('messiah')}>Иисус Христос — восьмилучевая звезда, «звезда светлая и утренняя» (Откр 22:16)</Row>
        <Row s={P('hollow')}>
          полый знак — время лица не установлено: он стоит в середине скобки (см. «Линии»); у года по расчёту знак сплошной,
          помета «расч.» — в подсказке и в карточке
        </Row>
        <Row s={P('infant')}>† слева от звезды — умер младенцем; следа жизни нет</Row>
        <Row s={P('ghost', 40)}>
          «Призрак» жены: сама она стоит рядом с мужем, а в родной семье — пунктирный кружок на пунктирном отводе с подписью
          «{rachel}»; при наведении на жену и при её выборе — тонкая золотистая дуга между её двумя знаками
        </Row>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            После имени на крупном масштабе — сокращение роли:{' '}
            {ROLES.map(([r, noun], i) => (
              <Fragment key={r}>
                <span class="nobr">
                  {roleSigla([r])} — {noun}
                </span>
                {i < ROLES.length - 1 ? '; ' : '.'}
              </Fragment>
            ))}
          </span>
        </li>
        <Wide s={C('rings', 90)}>
          Кольцо цвета фокуса — выбранное лицо; угловые скобки ⌜ ⌟ — звезда с фокусом клавиатуры (у выбранной — вокруг
          кольца); тонкое кольцо — звезда под указателем. Род выбранного лица светится, остальное небо гаснет.
        </Wide>
        <Row s={P('focus', 30)}>фокус клавиатуры — угловые скобки; выбор — кольцо</Row>
        <Wide s={C('pile', 70)}>
          «Иаков +13» — на обзоре знаки его семьи легли бы друг на друга: тринадцать лиц собраны у его знака; щелчок по
          «+N» — «Ближайшая родня», приближение раскрывает их. На масштабе семьи скоплений нет: видны все знаки.
        </Wide>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Подпись стоит у своей звезды — справа, слева, над ней или под ней в 3 px от её колец, — или на тонкой выноске
            не длиннее 40 px; у самых значимых лиц на обзоре выноска может быть длиннее — до 100 px, у Иисуса Христа до 160 px,
            через пустое небо. Имя не ложится ни на чужую звезду, ни на чужую связь, ленту или дугу и не стоит вплотную
            к чужому имени; выноска не пересекает связей; имя лица линии — над своей лентой или под ней. Следы и сетка под
            серединой имени прерываются. Где места нет, подпись скрыта: она появляется при наведении, фокусе клавиатуры и
            выборе, экранный диктор читает лицо и без неё, а карточка у звезды называет такую родню строкой «Без подписи на
            небе». Выбранный, его родители, супруги и лица лент из его семьи подписаны всегда: если им нет чистого места,
            чужая линия под их именем разрывается. Карточка у звезды и подсказка закрывают небо под собой — имена семьи уходят
            на свободное место, прочие под ними не пишутся. На узком экране при выбранном лице подписаны только его род,
            семья и лица лент.
          </span>
        </li>
        <Wide s={C('pins', 80)}>
          Сплошное тонкое кольцо и подпись с уточнением — отметки поиска: строка «Все N на небе» в списке найденного отмечает
          всех одноимённых. Снять — командой «Снять» или клавишей Esc.
        </Wide>
        <Wide s={C('edge', 44, 200)}>
          Указатель у края — выбранное лицо за краем окна; щелчок — перелёт к нему. У края неба — и родня выбранного за
          краем: «→ 22 ребёнка», «↑ Иессей, отец»; щелчок — небо сдвигается к ним, выбранное остаётся на месте. На телефоне
          строки окна лица не теснее 10 px (временная пропорция; своя возвращается при снятии выбора).
        </Wide>
      </ul>

      <h3 id="legend-lines">Линии</h3>
      <p class="muted">След вправо от звезды — время жизни; по вертикали — родство.</p>
      <ul class="legend">
        <Row s={P('trailExact')}>сплошной след — годы рождения и смерти известны</Row>
        <Row s={P('trailEstimated')}>
          след проявляется в начале и тает в конце — годы оценочные: растушёвка идёт через возможный промежуток рождения и
          смерти
        </Row>
        <Row s={P('trailLast')}>смерть не известна: след до последнего упоминания и короткий тающий конец; придуманной длительности жизни нет</Row>
        <Row s={P('trailNone')}>только короткий тающий след — кроме рождения, о жизни ничего не известно</Row>
        <Row s={P('trailEpochal')}>редкие точки — известна только эпоха, время не установлено</Row>
        <Row s={P('epochBracket')}>
          скобка с полым знаком — время лица не установлено: скобка идёт через годы, когда оно засвидетельствовано (встреча,
          годы брата, эпоха главы); звезды в год рождения нет
        </Row>
        <Row s={P('birthBand')}>
          растушёванная полоса слева от знака — возможные годы рождения: чисел в тексте нет, поэтому знак стоит у первого года,
          когда лицо засвидетельствовано (призвание, суд, событие Деяний)
        </Row>
        <Row s={P('trailBreak')}>
          «//» на следе — родословие, вероятно, называет не все поколения: жизнь от рождения до ребёнка вышла бы длиннее
          обычной; дальше разрыва след бледнее (толкование, см. § 13 и § 24 карточки)
        </Row>
        {/* грамматика связей (этап 11, решение 78; STAGE11 § 2): образцы — функцией неба drawLinkSample (src/render/plates.ts) */}
        <Wide s={<Paint draw={PAINTERS.linkTrunk} h={64} />}>
          Родство идёт по вертикали: от союза родителей — вертикальный ствол, от ствола — короткие зубцы к детям; старший
          ближе к матери, дальше вниз по годам; ребёнок на линии Мессии стоит у своей ленты, вне ряда братьев. Ромб — союз: он стоит на следе матери, там, где из него выходит ствол к её
          детям; мать не названа или стоит далеко от детей — на следе отца, и тогда, если союзов с детьми у отца два и
          больше, у ромба подписано имя матери («Авигея», «Мааха» у Давида) или «мать не названа». Двойная черта «‖» — брак:
          от следа мужа к ромбу. Косых линий нет: путь идёт по времени слева направо, одна связь — одна линия.
        </Wide>
        <Row s={P('linkNode', 30)}>
          залитый ромб — дети союза показаны; полый с числом — свёрнуты, число — сколько лиц союза ещё не показано; щелчок
          по числу раскрывает их
        </Row>
        <Row s={P('linkJoin', 44)}>точка на следе — второе гнездо того же союза: дети, рождённые далеко от первых, идут от своего ствола</Row>
        <Row s={P('linkCut', 30)}>
          разрыв чужого следа — пересечение без связи; пересечение связей — разрыв нижней линии: линии соединяются только
          в узле ◆ или •
        </Row>
        <Row s={P('linkStub', 44)}>
          на всём небе длинная связь через чужие следы — два коротких обрывка с именем; координата у обрывка — только когда
          второй конец за краем окна; целиком связь видна при наведении и выборе. Длинная черта брака — тоже обрывками
          с подписью: «муж — Халев, 24 П»
        </Row>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Связи выбранного лица — толще, с ореолом цвета неба; его род — тонкой линией; остальные связи видны вместе с
            именами своих лиц: на дальнем масштабе остаётся структура, гребёнки списков уходят вместе с именами.
            Наложница названа словом: Ефа, наложница Халева.
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Словарь линий родства: сплошная — Писание или вывод; штрих — иное происхождение: по закону, по Луке, левират,
            усыновление, предок; точки — только толкование, без исключений; сплошная тонкая золотистая дуга — родство
            словом Писания («сестра», «родственница»: Саруия — сестра Давида) у лица под указателем и у выбранного.
            Неуверенные годы на следе жизни — не точки, а
            растушёвка. Пунктирное кольцо значит одно: лицо нарисовано не здесь — призрак жены в родном роду, конец связи вне
            показа, конец обрывка наружу показа. Меридианы, контуры созвездий и скобки — линии карты, а не родство (ниже).
          </span>
        </li>
        <Wide s={C('family', 150)}>Так семья выглядит на небе: Иаков и его жёны; у каждой матери — свой ромб, свой ствол и её дети.</Wide>
        {/* выбранная связь (решения 83, 84): жёлтый путь и кольца на концах — drawLinkSample('selected') */}
        <Wide s={<Paint draw={PAINTERS.linkSelected} h={44} />}>
          Щелчок по линии — связь выделяется жёлтым целиком: от звёзд отца и матери по их следам до ромба союза, от ромба по
          стволу и зубцу до звезды ребёнка; ромб союза — тоже жёлтый; дуга родства — жёлтым по той же дуге. Жёлтое
          начинается и кончается только у своих концов. На концах — кольца с ролями: отец, мать, сын. Конец, которого нет
          в показе, — пунктирное кольцо в его год с подписью «Илий, отец — вне показа»: щелчок по нему показывает лицо
          временным гостем. Конец за краем окна — жёлтый указатель у кромки. Рядом — карточка связи: кто её концы, стихи,
          ленты и союз. Выбор лица при этом не меняется; снять связь — «×», Escape или щелчок по пустому небу.
        </Wide>
        {/* подсветка ветвей (решение 69): образец — функцией неба drawBranchSample (src/render/branches.ts) */}
        <Wide s={<Paint draw={PAINTERS.branches} h={64} />}>
          Подсветка ветвей выбранного лица: на небе его семья — союз родителей, его союзы и дети, все подписаны; остальное
          небо гаснет. Родитель или родственник по слову Писания, которого нет в показе, — пунктирное кольцо в его год с
          подписью, как «Илий, отец — вне показа»; сестра Давида Саруия — с термином «сестра». То же — у лица под указателем. Предки — мягкое белое свечение; потомки окрашены по ветвям. Если у лица два союза с детьми и больше —
          у каждого союза свой цвет (у Авраама — Сарра, Агарь, Хеттура); если союз один — свой цвет у ветви каждого ребёнка
          (у Ноя — Сим, Хам, Иафет). Цвет тянется по всей ветви и бледнеет с каждым поколением; черта под именем — начало
          ветви. Цвета ветвей не похожи на золото и лазурь лент и на жёлтый выбранной связи.
        </Wide>
        <Wide s={C('path', 120)}>
          Путь родства — ломаная линия со словами шагов («мать», «сын»): кровное родство и брак — сплошной линией, иное
          происхождение (по закону, по Луке) — штрихом, толкование — точками цвета текста, слово Писания — тонкой
          золотистой дугой.
        </Wide>
        <Wide s={C('arc', 110)}>
          Наведите указатель на лицо или выберите его — к родственнику, названному словом Писания без указания родителей,
          протянется сплошная тонкая золотистая дуга с этим словом: Елисавета — «родственница» Марии (Лк 1:36); ромбы союзов этого
          лица — тоже золотистые. Золотистый не похож на золото ленты Иосифа, жёлтый — другой знак: он только у выбранной
          связи.
        </Wide>
        <Wide s={<Paint draw={PAINTERS.ribbons} h={64} />}>
          Золотая лента — линия Иосифа (Мф 1), лазурная — линия по Луке, традиционно — Марии (Лк 3). Где линии совпадают,
          нити свиты в косу, лицо — между нитями; где расходятся, у каждой свои лица, нить Иосифа выше. Разреженная нить —
          только звено по толкованию: Илий — Мария. Штрих на всём шаге ленты — иное происхождение: Иосиф — Иисус «по закону»
          (Мф 1:16) и Нирий — Салафиил по Луке (Лк 3:27). Ленты подписаны у края видимого участка: «Мф 1» — линия
          Иосифа, «Лк 3» — линия по Луке; их различают и без цвета. Имя лица линии стоит над лентой или под ней,
          по свою сторону; если иначе места нет — на ленте, и лента под именем прерывается. Каинан — только у Луки (Лк 3:36): нить сплошная, с выноской. Где показ скрыл
          поколения линии, лента прервана и в разрыве стоит «+N» — сколько лиц скрыто; щелчок показывает их. Наведите
          указатель на ленту — появится шаг линии словами родства и стихом, где назван родитель (Давид — отец; Соломон —
          сын, Мф 1:6), и медленный ток света к Иисусу Христу.
        </Wide>
        <Row s={P('linkRibbon', 56)}>
          на масштабе семьи лента идёт по следу родителя до ромба своего шага и ступенькой уходит к звезде ребёнка; другой
          линии к ребёнку линии Мессии нет. В ромбе Давида и Вирсавии ленты расходятся: золото — к Соломону, лазурь — к Нафану
        </Row>
        <Wide s={C('compare', 90)}>
          В показе «линии Мессии» у мест, где линии расходятся и сходятся, — выноски со стихами; щелчок по выноске
          открывает синопсис этого участка.
        </Wide>
        <Wide s={C('split', 130)}>
          У развилки — знак общей матери первых лиц ветвей с подписью; у начала ветвей — их названия: «через Соломона (Мф 1)»
          над золотой лентой, «через Нафана (Лк 3)» под лазурной. Такими же малыми знаками у сыновей стоят женщины,
          которых называет Матфей: Фамарь (Мф 1:3), Раав и Руфь (Мф 1:5), бывшая за Урией (Мф 1:6).
        </Wide>
      </ul>

      {/* линии карты (этап 13, решение 94): не родство — правило «точки — только толкование» к ним не относится */}
      <h3 id="legend-map">Линии карты</h3>
      <p class="muted">Эти линии — не родство: они размечают небо, время и области.</p>
      <ul class="legend">
        <Row s={P('trailEpochal')}>редкие точки следа — время лица не установлено, известна только эпоха</Row>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Меридианы событий — точечные вертикали через всё небо с подписью у линейки: Потоп, призвание Аврама, Исход,
            закладка храма, плен, возвращение, Рождество. Контур созвездия — тонкая граница рода, колена или народа; народы
            вне Израиля обведены точечной границей. Полосы эпох различаются светлотой фона. Штриховка в ярусах эпох —
            совместное правление; скобка «время не установлено» — годы, когда лицо засвидетельствовано.
          </span>
        </li>
      </ul>

      <h3 id="legend-time">Время</h3>
      <ul class="legend">
        <Wide s={<StripSample />}>
          Внизу — полоса времени от сотворения до 2040 г. в равномерном масштабе (каждый год одной ширины): названия эпох; столбики — число рождений
          за 25 лет, без лиц, чьё время не установлено (задержите указатель над столбиком — флажок назовёт число); две линии
          Мессии бусинами рождений: где линии совпадают — один ряд, где расходятся — два, золотой — по Матфею, лазурный —
          по Луке; черта «завершение канона» и заштрихованное время после него, где лиц нет; отметка «сегодня». Рамка —
          видимая часть неба: тяните её за середину, края — за ручки. Щелчок вне рамки или по названию эпохи — переход
          к эпохе, двойной щелчок — всё небо. Колесо над полосой меняет ширину окна у года под указателем, Shift + колесо
          сдвигает окно. Эпоху, чьё название не поместилось, называет флажок над строкой названий.
        </Wide>
        <Wide s={C('meridian', 100)}>
          Задержите указатель на линейке лет или на полосе времени — через небо пройдёт меридиан года. Во флажке — сколько
          лиц живы в этот год; ярко — живые наверняка, бледнее — вероятно.
        </Wide>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Флажок «ярусы эпох» у неба: над небом — эпохи, судьи, цари Иудеи и Израиля, служения пророков и события.
            Штриховка — совместное правление, пунктирная рамка — годы по оценке; тонкая вертикаль между царями Иудеи
            и Израиля — синхронизм текста («в N-й год X воцарился Y»); черта с засечками вместо отрезка — пророк, чьё время
            не установлено. Жизнь выбранного лица — столбец: в ярусах он залит, на небе — две тонкие черты по краям
            надёжной части жизни; растушёванные края — неопределённость годов рождения и смерти. Под ярусами — формула:
            после чьего рождения и до чьего лицо родилось, при чьей жизни умерло (расчёт). Щелчок по царю, судье или
            пророку открывает его карточку.
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Масштаб времени «Сжатый по плотности лиц» растягивает время там, где много лиц; «Равномерный по годам» — каждый
            год одной ширины. Переключатель —
            кнопка «Вид» внизу справа неба, строка «Масштаб времени»; полоса плотности на линейке показывает, где время
            растянуто. Там же, в строке «Пропорции», — «время» и «высота строк»: небо растягивается отдельно в длину и в ширину.
          </span>
        </li>
      </ul>

      <h3 id="legend-card">Карточка</h3>
      <ul class="legend">
        {/* образец — сама мини-шкала шапки (LifeBar, раскладка — lifeBarLayout), без шапки целиком: второй h2 в панели
            не нужен; лицо — Вооз: оценка года рождения, о смерти Писание молчит (решение 97) */}
        <Wide s={<LifeBar id="vooz" />}>
          Мини-шкала в шапке карточки (здесь — Вооз): вверху — эпохи, эпоха жизни выделена и подписана; жизнь — полоса:
          растушёванное начало — промежуток, в котором мог быть год рождения, тающий конец — о смерти Писание молчит. Тонкая
          полоса под жизнью — служение или царствование, штриховка на ней — соправление. На оси — только концы жизни, начало
          царствования (например, 1010 — воцарение) и «Р. Х.»; если окно переходит через Р. Х., у каждой подписи — эра.
        </Wide>
        <Wide
          s={
            <>
              <RailKey states={RAIL_ALL} />
              <span class="visually-hidden">Метки разделов: {(['content', 'silent', 'absent', 'na'] as const).map((k) => STATE_TEXT[k]).join('; ')}.</span>
            </>
          }
        >
          Рейка у края карточки — 24 метки разделов в шести частях; текущий раздел крупнее, щелчок по метке — переход
          к разделу.
        </Wide>
      </ul>
      <table class="legend-marks">
        <caption>Пометы на полях карточки</caption>
        <tbody>
          {(
            [
              ['выв.', CERT_FULL.inference],
              ['толк.', CERT_FULL.interpretation],
              ['расч.', MARK_FULL.calc],
              ['справ.', MARK_FULL.ref],
            ] as const
          ).map(([k, v]) => (
            <tr key={k}>
              <th scope="row">
                <span class="mark">{k}</span>
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted">Без пометы — прямо сказано в Писании. Щелчок по помете в карточке раскрывает её пояснение.</p>

      <h3 id="legend-keys">Клавиши</h3>
      <KeysTable />

      <h3 id="legend-layers">Слои</h3>
      <p class="muted">Слои — в листе «Вид» → «Слои».</p>
    </Sheet>
  );
}
