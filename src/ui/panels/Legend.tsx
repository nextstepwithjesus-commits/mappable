/**
 * «Условные знаки» — как читать карту (G5; UX-35, VIS-31, VIS-32, CARD-43; ТЗ § 5.4; принцип 3 docs/UI-PROMPT.md).
 *
 * Всё видимое на небе объяснено строкой с образцом, и образец нарисован той же функцией, что небо:
 *  — знаки, следы, отводы, скобы, браки, выделение рода и ленты — отдельными образцами: drawGlyph, drawLifeTrail,
 *    drawDescent, drawBracket, drawMarriage, buildRibbons и drawStrands (PAINTERS; их же берёт образец #/specimen);
 *  — рамка, облака, созвездия, скопления, кольца, указатели у края, путь родства, выноски линий и меридиан — вырезкой
 *    из настоящего неба: Sky.draw рисует кадр на невидимом холсте, в панель переносится его часть (CROPS);
 *  — полоса времени — часть её собственного холста; рейка и пометы — те же подписи, что в карточке (RailKey,
 *    STATE_TEXT, MARK_FULL, CERT_FULL).
 * Своих копий рисования здесь нет: это проверяет tests/legend.test.ts.
 *
 * Порядок: «Как читать карту» (#legend-guide), небо, знаки, линии, время, карточка, клавиши (#legend-keys), слои.
 */
import { effect } from '@preact/signals';
import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, graph, type ModelData } from '../../data/atlas.ts';
import { buildRibbons } from '../../engine/ribbons.ts';
import { relate } from '../../engine/kinship.ts';
import { toAstro } from '../../engine/years.ts';
import { alpha } from '../../render/color.ts';
import { drawGlyph, roleSigla, type GlyphOpts } from '../../render/glyphs.ts';
import { highlightFor, SIB } from '../../render/marks.ts';
import { drawStrands, lineNoteHits, ribbonLook } from '../../render/ribbons.ts';
import { drawFoldMark } from '../../render/labels.ts';
import { eventMarks } from '../../render/frame.ts';
import { DIM, FRAME_H, readPalette, Sky, type Palette, type SkyState } from '../../render/sky.ts';
import {
  drawBracket, drawDescent, drawLifeTrail, drawMarriage, ghostNote, LINK_STYLE, motherNote, MOTHER_DASH, TAIL_PX, type LifeTrail,
} from '../../render/trails.ts';
import { lambda, layers, lineFlip, model, theme } from '../../state.ts';
import { RailKey, STATE_TEXT, type SecState } from '../card/Rail.tsx';
import { LifeBar } from '../card/Masthead.tsx';
import { CERT_FULL, MARK_FULL, viewTick } from '../common.tsx';
import { Check } from '../controls.tsx';
import { ReadingGuide } from '../sky/Overlays.tsx';
import { aliveAt, meridianText } from '../sky/text.ts';
import { KeysTable } from '../top/Keys.tsx';
import { Sheet } from './Sheet.tsx';

// ---------- образцы: те же функции, что у неба ----------

/** Образец: рисунок в пикселях CSS на холсте w × h; фон холста — небо (правило .legend-sample). */
export type Painter = (ctx: CanvasRenderingContext2D, pal: Palette, w: number, h: number) => void;

/** Вид линий неба на масштабе семьи — как в src/render/trails.ts (drawTrails, drawDescents, drawMarriages). */
const look = {
  /** след звезды величины 0–2 (a — яркость лица при выделении) */
  trail: (pal: Palette, a = 1) => alpha(pal.ink2, 0.55 * 1.25 * a),
  link: (pal: Palette) => alpha(pal.ink3, 0.75),
  knot: (pal: Palette) => alpha(pal.ink2, 0.9),
  tension: (pal: Palette) => alpha(pal.ink, 0.9),
  marriage: (pal: Palette) => alpha(pal.ink3, 0.8),
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

export const PAINTERS = {
  man: signTrail({}),
  woman: signTrail({ sex: 'f' }),
  people: sign({ kind: 'people', magnitude: 2 }),
  messiah: signTrail({ messiah: true, magnitude: 0 }),
  king: signTrail({ king: true, magnitude: 2 }),
  queen: signTrail({ king: true, sex: 'f', magnitude: 2 }),
  hollow: signTrail({ hollow: true }),
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
  /** оценка: пунктир от звезды до конца промежутка рождения и от начала промежутка смерти до его конца */
  trailEstimated: (ctx, pal, w, h) =>
    person(ctx, pal, 12, px(h / 2), w - 8, {}, { cls: 'estimated', sureFrom: 12 + (w - 20) * 0.28, solidTo: w - 8 - (w - 20) * 0.22 }),
  /** смерть не известна: сплошной до последнего упоминания и пунктир 10 px */
  trailLast: (ctx, pal, w, h) => person(ctx, pal, 12, px(h / 2), w - 8, {}, { known: false, solidTo: w - 8 - TAIL_PX }),
  /** о жизни не известно ничего: только пунктир 10 px от звезды */
  trailNone: (ctx, pal, _w, h) => person(ctx, pal, 12, px(h / 2), 12 + TAIL_PX, {}, { known: false, solidTo: 12 }),
  /** известна только эпоха: короткий точечный след */
  trailEpochal: (ctx, pal, w, h) => person(ctx, pal, 12, px(h / 2), w - 8, {}, { cls: 'epochal' }),
  /** отвод: от следа родителя к звезде ребёнка в год его рождения */
  descent: (ctx, pal, w, h) => {
    const [y0, y1, x] = [px(8), px(h - 9), px(w * 0.5)];
    person(ctx, pal, 12, y0, w - 8);
    person(ctx, pal, x, y1, w - 8);
    ctx.lineWidth = 1;
    drawDescent(ctx, { x, y0, y1, color: look.link(pal) });
    drawGlyph(ctx, x, y1, star(pal));
  },
  /** узелок матери: её след пересекает отвод */
  mother: (ctx, pal, w, h) => {
    const [y0, ym, y1, x] = [px(7), px(h / 2), px(h - 8), px(w * 0.62)];
    person(ctx, pal, 12, y0, w - 8);
    person(ctx, pal, 22, ym, w - 8, { sex: 'f' });
    person(ctx, pal, x, y1, w - 8);
    ctx.lineWidth = 1;
    drawDescent(ctx, { x, y0, y1, color: look.link(pal), mother: { y: ym, color: look.knot(pal) } });
    drawGlyph(ctx, x, y1, star(pal));
  },
  /** хронологическое напряжение: знак разрыва на отводе */
  tension: (ctx, pal, w, h) => {
    const [y0, y1, x] = [px(7), px(h - 8), px(w * 0.5)];
    person(ctx, pal, 12, y0, w - 8);
    person(ctx, pal, x, y1, w - 8);
    ctx.lineWidth = 1;
    drawDescent(ctx, { x, y0, y1, color: look.link(pal), tension: look.tension(pal) });
    drawGlyph(ctx, x, y1, star(pal));
  },
  /** дети одной пары, рождённые рядом, — под одной скобой */
  bracket: (ctx, pal, w, h) => {
    const y0 = px(7);
    const kids = [0, 1, 2].map((k) => ({ x: px(w * 0.36 + k * 11), y: px(y0 + 12 + k * ((h - 26) / 2)) }));
    person(ctx, pal, 12, y0, w - 8);
    for (const k of kids) drawLifeTrail(ctx, trail(pal, k.x, w - 8, k.y));
    ctx.lineWidth = 1;
    drawBracket(ctx, { x: kids[0].x, y0, kids, color: look.link(pal) });
    for (const k of kids) drawGlyph(ctx, k.x, k.y, star(pal));
  },
  /** дети разных матерей одного отца: скобы разного начертания */
  mothers: (ctx, pal, w) => {
    const y0 = px(7);
    const group = (x: number, n: number, top: number) => Array.from({ length: n }, (_, k) => ({ x: px(x + k * 10), y: px(top + k * 11) }));
    const a = group(w * 0.22, 2, y0 + 13);
    const b = group(w * 0.6, 2, y0 + 13);
    person(ctx, pal, 10, y0, w - 6);
    for (const k of [...a, ...b]) drawLifeTrail(ctx, trail(pal, k.x, w - 6, k.y));
    ctx.lineWidth = 1;
    drawBracket(ctx, { x: a[0].x, y0, kids: a, color: look.link(pal), dash: MOTHER_DASH[0] });
    drawBracket(ctx, { x: b[0].x, y0, kids: b, color: look.link(pal), dash: MOTHER_DASH[1] });
    for (const k of [...a, ...b]) drawGlyph(ctx, k.x, k.y, star(pal));
  },
  /** свёрнутые потомки (J5): «+12» справа от следа лица — тем же знаком, что на небе */
  foldDesc: (ctx, pal, w, h) => {
    const y = px(h / 2);
    person(ctx, pal, 12, y, w - 44);
    drawFoldMark(ctx, pal, false, w - 38, y + 4, '', '+12');
  },
  /** свёрнутое созвездие (J5): строка с названием и числом скрытых лиц */
  foldGroup: (ctx, pal, _w, h) => drawFoldMark(ctx, pal, false, 6, Math.round(h / 2) + 4, 'ЕДОМ', '+38'),
  /** брак: «‖» от следа мужа к жене в год первого ребёнка */
  marriage: (ctx, pal, w, h) => {
    const [yH, yW] = [px(9), px(h - 10)];
    person(ctx, pal, 12, yH, w - 8);
    person(ctx, pal, 22, yW, w - 8, { sex: 'f' });
    ctx.lineWidth = 1;
    drawMarriage(ctx, { x: px(w * 0.55), yH, yW, color: look.marriage(pal), near: 60 });
  },
  /** к дальней жене — «‖» 8 px и тонкая выноска */
  marriageFar: (ctx, pal, w, h) => {
    const [yH, yW] = [px(7), px(h - 7)];
    person(ctx, pal, 12, yH, w - 8);
    person(ctx, pal, 22, yW, w - 8, { sex: 'f' });
    ctx.lineWidth = 1;
    drawMarriage(ctx, { x: px(w * 0.55), yH, yW, color: look.marriage(pal), near: 12 });
  },
  /**
   * Выделение рода: дед и отец (предки) — сплошная связь 1,5 px, выбранное лицо, его сын (потомок) — штрихом, брат —
   * тонкой связью и бледнее; чужая семья гаснет.
   */
  family: (ctx, pal, w, h) => {
    const row = (k: number) => px(8 + k * ((h - 16) / 4));
    const G = { x: px(14), y: row(0) };
    const P = { x: px(w * 0.2), y: row(1) };
    const S = { x: px(w * 0.38), y: row(2) };
    const B = { x: px(w * 0.47), y: row(3) };
    const C = { x: px(w * 0.62), y: row(4) };
    const other = { x: px(w * 0.72), y: row(1) };
    person(ctx, pal, other.x, other.y, w - 8, {}, {}, DIM);
    person(ctx, pal, G.x, G.y, w - 8);
    person(ctx, pal, P.x, P.y, w - 8);
    person(ctx, pal, S.x, S.y, w - 8, { magnitude: 2 });
    person(ctx, pal, B.x, B.y, w - 8, {}, {}, SIB);
    person(ctx, pal, C.x, C.y, w - 8);
    const link = (from: { x: number; y: number }, to: { x: number; y: number }, kind: keyof typeof LINK_STYLE, a = 1) => {
      const st = LINK_STYLE[kind];
      ctx.lineWidth = st.width;
      drawBracket(ctx, { x: to.x, y0: from.y, kids: [to], color: alpha(pal.ink2, a), dash: st.dash });
    };
    link(G, P, 'anc');
    link(P, S, 'anc');
    link(P, B, 'sib', SIB);
    link(S, C, 'desc');
    ctx.lineWidth = 1;
    drawGlyph(ctx, P.x, P.y, star(pal));
    drawGlyph(ctx, S.x, S.y, star(pal, { magnitude: 2 }));
    drawGlyph(ctx, B.x, B.y, star(pal, {}, SIB));
    drawGlyph(ctx, C.x, C.y, star(pal));
  },
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
function skyOf(w: number, h: number, dpr: number, m: ModelData, lam: number): Sky {
  const key = `${w}×${h}@${dpr}`;
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
  const sky = skyOf(size.w, size.h, dpr, m, lam);
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
    const ls = idx.map((i) => sky.nodes[i].lane);
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
  /** семья на небе: скобы по матерям, помета матери, браки, призраки жён */
  family: { at: () => ({ ids: ['iakov', 'liya', 'ruvim', 'dan'] }), fit: true },
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
  ['patriarch', 'патриарх'],
  ['levite', 'левит'],
];

/** Разделы панели после «Как читать карту». */
const PARTS = [
  ['legend-sky', 'Небо'],
  ['legend-signs', 'Знаки'],
  ['legend-lines', 'Линии'],
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
  const leah = motherNote('liya') ?? 'от Лии';
  const rachel = ghostNote('rakhil', 'iakov');
  return (
    <Sheet title="Условные знаки" lead="Как читать карту: что значит каждый знак, линия и надпись на небе.">
      {/* тот же текст, что во вступлении (C5; UX-03): клавиша «?» и команда «Как читать карту» ведут сюда */}
      <h3 id="legend-guide">Как читать карту</h3>
      <ReadingGuide both />
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
          чертами и справа масштабная линейка «├─ 50 лет ─┤» — столько лет в отрезке здесь; «≈» — время в окне растянуто
          неравномерно. Эпохи на небе чередуются светлотой фона.
        </Wide>
        <Wide s={C('density', 26)}>
          Под рисками — полоса плотности шкалы: светлее там, где время растянуто (масштаб «по насыщенности»), темнее — где
          сжато.
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
          Аароновы, в колене Левиином). Названия созвездий набраны прописными вразрядку.
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
        <Row s={P('foldDesc')}>
          «+12» справа от следа — потомки лица свёрнуты, скрыто 12 лиц; щелчок разворачивает. Свернуть потомков — команда
          карточки, клавиша С (C) или меню звезды: правая кнопка мыши, долгое касание.
        </Row>
        <Row s={P('foldGroup')}>
          Свёрнутое созвездие — строка с названием и числом скрытых лиц; щелчок разворачивает. Свернуть созвездие — правой
          кнопкой мыши или долгим касанием по его названию; «развернуть всё» — в органах неба.
        </Row>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            «На небе: в работе» — только лица рабочего набора, все подписаны; пустые полосы убраны, между родами — зазор;
            ленты Мессии — тонкой нитью. «Всё небо» вписывает набор. Набор собирается командой «Взять в работу» в карточке,
            в подсказке звезды, в поиске и в «Родстве»; список — в панели «В работе».
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
        <Row s={P('hollow')}>полый знак — год рождения по реконструкции, а не прямо из чисел Писания</Row>
        <Row s={P('infant')}>† слева от звезды — умер младенцем; следа жизни нет</Row>
        <Row s={P('ghost', 40)}>
          «Призрак» жены: сама она стоит рядом с мужем, а в родной семье — пунктирный кружок на пунктирном отводе с подписью
          «{rachel}»; при наведении на жену — точечная дуга между её двумя знаками
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
          Кольцо цвета фокуса — выбранное лицо, второе кольцо снаружи — фокус клавиатуры, тонкое кольцо — звезда под
          указателем. Род выбранного лица светится, остальное небо гаснет.
        </Wide>
        <Wide s={C('pins', 80)}>
          Сплошное тонкое кольцо и подпись с уточнением — отметки поиска «Показать всех на небе»: все одноимённые. Снять —
          командой «Снять» или клавишей Esc.
        </Wide>
        <Wide s={C('edge', 44, 200)}>Указатель у края — выбранное лицо за краем окна; щелчок — перелёт к нему.</Wide>
      </ul>

      <h3 id="legend-lines">Линии</h3>
      <p class="muted">След вправо от звезды — время жизни; по вертикали — родство.</p>
      <ul class="legend">
        <Row s={P('trailExact')}>сплошной след — годы рождения и смерти известны</Row>
        <Row s={P('trailEstimated')}>пунктир в начале и в конце — годы оценочные: пунктир идёт через возможный промежуток</Row>
        <Row s={P('trailLast')}>смерть не известна: след до последнего упоминания и короткий пунктир; придуманной длительности жизни нет</Row>
        <Row s={P('trailNone')}>только короткий пунктир — кроме рождения, о жизни ничего не известно</Row>
        <Row s={P('trailEpochal')}>редкие точки — известна только эпоха, время не установлено</Row>
        <Row s={P('descent', 44)}>вертикальный отвод от следа родителя — рождение ребёнка в этот год</Row>
        <Row s={P('mother', 44)}>квадратик на отводе — мать: её след пересекает отвод</Row>
        <Row s={P('tension', 44)}>знак разрыва на отводе — хронологическое напряжение: числа текста спорят, родословие здесь, вероятно, сокращено</Row>
        <Row s={P('bracket', 48)}>дети одной пары, рождённые рядом, — под одной скобой</Row>
        <Row s={P('mothers', 44)}>у детей разных матерей одного отца скобы разного начертания; у верха скобы — помета матери «{leah}»</Row>
        <Row s={P('marriage', 40)}>двойная черта «‖» — брак: от следа мужа к жене в год первого ребёнка</Row>
        <Row s={P('marriageFar', 44)}>к жене, стоящей далеко, — короткая «‖» и тонкая пунктирная выноска</Row>
        <Wide s={C('family', 150)}>Так семья выглядит на небе: Иаков, рядом с ним его жёны, их дети — под скобами по матерям.</Wide>
        <Wide s={<Paint draw={PAINTERS.family} h={64} />}>
          Выбрано лицо — светится его род: предки — сплошной связью, потомки — штрихом, братья и сёстры — тоньше и бледнее;
          дальше третьего поколения — чуть бледнее; остальное небо гаснет.
        </Wide>
        <Wide s={C('path', 120)}>
          Путь родства — ломаная линия со словами шагов («мать», «сын»): кровное родство сплошной линией, по закону и брак —
          штрихом, по слову Писания и по толкованию — точками.
        </Wide>
        <Wide s={C('arc', 110)}>
          Наведите указатель на лицо — к родственнику, названному словом Писания без указания родителей, протянется
          точечная дуга с этим словом: Елисавета — «родственница» Марии (Лк 1:36).
        </Wide>
        <Wide s={<Paint draw={PAINTERS.ribbons} h={64} />}>
          Золотая лента — линия Иосифа (Мф 1), лазурная — линия по Луке, традиционно — Марии (Лк 3). Где линии совпадают,
          нити свиты в косу, лицо — между нитями; где расходятся, у каждой свои лица, нить Иосифа выше. Разреженная нить —
          звено по толкованию. Наведите указатель на ленту — появится шаг линии со стихом («Давид → Соломон (Мф 1:6)»)
          и медленный ток света к Иисусу Христу.
        </Wide>
        <Wide s={C('compare', 90)}>
          В режиме «Только линии Мессии» у мест, где линии расходятся и сходятся, — выноски со стихами; щелчок по выноске
          открывает синопсис этого участка.
        </Wide>
        <Wide s={C('split', 130)}>
          У развилки — знак общей матери первых лиц ветвей с подписью; у начала ветвей — их названия: «через Соломона (Мф 1)»
          над золотой лентой, «через Нафана (Лк 3)» под лазурной.
        </Wide>
      </ul>

      <h3 id="legend-time">Время</h3>
      <ul class="legend">
        <Wide s={<StripSample />}>
          Внизу — полоса времени от сотворения до 2040 г. в истинном масштабе: эпохи, число рождений по 25 лет, две ленты
          тонкими нитями, черта «завершение канона», отметка «сегодня». Рамка — видимая часть неба: её можно тянуть.
        </Wide>
        <Wide s={C('meridian', 100)}>
          Задержите указатель на линейке лет или на полосе времени — через небо пройдёт меридиан года. Во флажке — сколько
          лиц живы в этот год; ярко — живые наверняка, бледнее — вероятно.
        </Wide>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Флажок «ярусы эпох» у неба: над небом — эпохи, судьи, цари Иудеи и Израиля, служения пророков и события.
            Штриховка — совместное правление, пунктирная рамка — годы по оценке. Щелчок по царю, судье или пророку открывает
            его карточку.
          </span>
        </li>
        <li class="legend-row legend-wide">
          <span class="legend-text">
            Масштаб времени «по насыщенности» растягивает время там, где много лиц; «истинный» — равномерный. Переключатель —
            в органах неба; полоса плотности на линейке показывает, где время растянуто.
          </span>
        </li>
      </ul>

      <h3 id="legend-card">Карточка</h3>
      <ul class="legend">
        {/* образец — сама мини-шкала шапки (LifeBar), без шапки целиком: второй h2 в панели не нужен; лицо — Вооз:
            оценка рождения, родители, сын, год смерти не известен */}
        <Wide s={<LifeBar id="vooz" />}>
          Мини-шкала в шапке карточки (здесь — Вооз): вверху эпохи; жизнь — полоса, растушёванное начало — оценка года
          рождения, пунктир в конце — год смерти не известен; кружки — рождения родителей, риски — рождения детей; внизу —
          годы.
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
      <p class="muted">Что рисовать на небе; выбор запоминается.</p>
      <div class="checks" role="group" aria-label="Слои карты">
        {Object.entries({ lifelines: 'следы жизни', connectors: 'связи', constellations: 'созвездия', epochs: 'эпохи', ribbons: 'линии Мессии', tensions: 'напряжения', ghosts: 'призраки', labels: 'подписи' }).map(([k, v]) => (
          <Check key={k} checked={layers.value[k]} onChange={(on) => (layers.value = { ...layers.value, [k]: on })}>
            {v}
          </Check>
        ))}
      </div>
    </Sheet>
  );
}
