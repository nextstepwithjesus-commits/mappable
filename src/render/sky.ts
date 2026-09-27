/**
 * Небо на Canvas 2D (ТЗ § 3.1–3.2, § 5): модель, камера, попадание указателем и кадр как порядок слоёв.
 *
 * Слои снизу вверх и где их код:
 *  фон и полосы эпох — здесь; черты канона и «сегодня», сетка лет — frame.ts;
 *  созвездия: контуры — здесь, названия — labels.ts;
 *  следы жизни, отводы, браки — trails.ts; ленты — ribbons.ts; звёзды — здесь (знаки — glyphs.ts);
 *  подписи — labels.ts (пороги масштаба вычислены заранее, в кадре подписи только отбираются);
 *  кольца выбора, фокуса, наведения и отметок — marks.ts;
 *  ярусы эпох (tiers.ts, их рисует SkyView через under) → рамка (frame.ts) → меридиан (marks.ts) → указатели у края (frame.ts).
 *
 * Общее состояние модули читают через SkyContext (его реализует Sky) и проход кадра Pass; глобального состояния нет.
 */
import { Camera, KX_MIN, type Frame } from './camera.ts';
import { drawGlyph, personGlyph } from './glyphs.ts';
import { alpha } from './color.ts';
import { alphaForContrast, DIM_LABEL_CONTRAST } from './dim.ts';
import { drawSkyRibbons } from './ribbons.ts';
import { drawFrame, drawGrid, drawTimeMarks, drawWayfinding, yearTicks, FRAME_H, LETTER_W, LETTER_W_TOUCH, type EdgeHit } from './frame.ts';
import { drawGroupNames, drawLabels, LabelCache, LabelLedger, measureLabels, type GroupNameSpot, type LabelStats } from './labels.ts';
import { drawDescents, drawTrails } from './trails.ts';
import { drawMeridian, drawRings, emphasis } from './marks.ts';
import { coarsePointer } from './type.ts';
import type { Rect } from './rect.ts';
import { timeToX, xToTime, hydrateScale, type TimeScale, T_END } from '../engine/timescale.ts';
import { toAstro } from '../engine/years.ts';
import type { ModelData, NodeRow } from '../data/atlas.ts';
import { byId, groupById, lines } from '../data/atlas.ts';

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
  /** непрозрачность погашенной подписи цвета --ink и --ink-2, при которой её контраст к небу — не ниже 3 : 1 (E12) */
  dimInk: number;
  dimInk2: number;
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
export { DIM, LIKELY, DIM_LABEL_CONTRAST, CONSTELLATION_DIM, over, alphaForContrast, likelyAlpha } from './dim.ts';

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const num = (n: string, d: number) => {
    const x = parseFloat(v(n));
    return Number.isFinite(x) ? x : d;
  };
  const glow = v('--glow') === '1';
  const sky = v('--sky');
  return {
    sky, band: v('--sky-band'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'),
    ruleStrong: v('--rule-strong'), gold1: v('--gold-1'), gold2: v('--gold-2'), azure1: v('--azure-1'), azure2: v('--azure-2'),
    focus: v('--focus'), halo: v('--halo'), sheet: v('--sheet'), sheet2: v('--sheet-2'),
    dimInk: alphaForContrast(v('--ink'), sky, DIM_LABEL_CONTRAST), dimInk2: alphaForContrast(v('--ink-2'), sky, DIM_LABEL_CONTRAST), glow,
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
}

export type Emphasis = 'self' | 'anc' | 'desc' | 'path' | 'sure' | 'likely';

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
  /** ширина левой кромки с буквами полос */
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
  /** узел нарисован в этом кадре (режим «только линии», призраки жён) */
  drawn(i: number): boolean;
}

/** Проход кадра: то, что draw() вычисляет один раз и отдаёт слоям. */
export interface Pass {
  s: SkyState;
  /** видимые узлы в порядке узлов */
  vis: number[];
  /** яркость лица при выделении: 1, LIKELY или DIM (marks.ts) */
  emph: (id: string) => number;
  /** лица линий Мессии */
  spine: Set<string>;
  /** уровень масштаба подписей: 2·log2(kx / KX_MIN); «всё небо» на телефоне мельче KX_MIN — уровень 0 */
  level: number;
  /** масштаб знаков по высоте полосы */
  zoomScale: number;
  /** резерв органов неба */
  reserve: Rect[] | undefined;
  /** названия созвездий этого кадра: подписи отметок, пути и меридиана на них не ложатся */
  nameBoxes: Rect[];
}

/** Сколько лет самое крупное окно видимой части неба (D2; IX-03). */
const MIN_YEARS = 20;
/** Обзор: полоса ниже 5 px — мелкие звёзды точками, без следов связей (ТЗ § 3.1, семантическое увеличение). */
const OVERVIEW_KY = 5;
/** На обзоре указатель и подсказка — только у звёзд величины 0–3 (E11; IX-07). */
const OVERVIEW_MAG = 3;

export class Sky implements SkyContext {
  cam = new Camera();
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
  private outlines: { block: number; group: string; foreign: boolean; poly: [number, number][]; rows: Map<number, [number, number]>; size: number }[] = [];
  private epochX: { id: string; x0: number; x1: number; name: string; short: string }[] = [];
  /**
   * Поля видимой части неба сверх рамки, px холста: top — нижний край ярусов эпох или рамки, bottom — верх нижнего листа
   * карточки на телефоне, left и right — полосы, занятые вступлением или колонкой кнопок при вписывании «всего неба».
   */
  private insets = { top: FRAME_H, bottom: 0, left: 0, right: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.pal = readPalette();
  }

  resize(w: number, h: number, dpr: number) {
    this.dpr = dpr;
    this.coarse = coarsePointer();
    this.letterW = this.coarse ? LETTER_W_TOUCH : LETTER_W;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
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
  /** Видимая часть неба в px холста: без рамки, ярусов, листа карточки и полей вступления. */
  viewport() {
    return this.cam.vp;
  }
  /** Рамка «всего неба»: от сотворения до 100 г. по Р. Х., все полосы. */
  private fitFrame(): Frame {
    return { x0: this.xOf(this.scale.knots[0]), x1: this.xOf(100), lane0: this.model.laneMin - 0.5, lane1: this.model.laneMax + 0.5 };
  }
  /** Видимая часть, пределы сдвига и масштаб «всего неба» — после смены размера, полей, масштаба времени или модели. */
  private updateView() {
    const cam = this.cam;
    const vp = {
      l: this.letterW + this.insets.left,
      t: Math.max(FRAME_H, this.insets.top),
      r: cam.w - this.insets.right,
      b: cam.h - this.insets.bottom,
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
      this.cam.laneSpan = m.laneMax - m.laneMin;
      this.buildOutlines();
    }
    if (modelChanged || lambda !== this.lambda) {
      this.lambda = lambda;
      for (let i = 0; i < this.nodes.length; i++) {
        this.X0[i] = timeToX(this.scale, this.nodes[i].t0, lambda);
        this.X1[i] = timeToX(this.scale, this.nodes[i].t1, lambda);
      }
      this.epochX = m.epochs.map((e) => ({ id: e.id, x0: timeToX(this.scale, toAstro(e.start), lambda), x1: timeToX(this.scale, toAstro(e.end), lambda), name: e.name, short: e.short }));
      this.updateView();
    }
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
  fitState() {
    return this.cam.fitView(this.fitFrame());
  }
  fitAll() {
    this.cam.stop();
    this.cam.set(this.fitState());
  }
  /** Камера на «всём небе» (с точностью до пикселя). */
  atFit(): boolean {
    return !!this.model && this.cam.near(this.fitState());
  }

  /** Контуры созвездий: по каждой полосе притока — крайние годы; дыры заполняются соседями. */
  private buildOutlines() {
    const byBlock = new Map<number, NodeRow[]>();
    for (const n of this.model.nodes) {
      if (n.block < 0) continue;
      const a = byBlock.get(n.block);
      if (a) a.push(n);
      else byBlock.set(n.block, [n]);
    }
    this.outlines = [];
    for (const b of this.model.blocks) {
      const ns = byBlock.get(b.id) ?? [];
      if (ns.length < 3) continue;
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
      const all = [...rows.keys()].sort((a, c) => c - a); // сверху вниз
      const poly: [number, number][] = [];
      for (const l of all) {
        const [, r] = rows.get(l)!;
        poly.push([r + 6, l + 0.5], [r + 6, l - 0.5]);
      }
      for (const l of [...all].reverse()) {
        const [s] = rows.get(l)!;
        poly.push([s - 6, l - 0.5], [s - 6, l + 0.5]);
      }
      this.outlines.push({ block: b.id, group: b.group, foreign: !!groupById.get(b.group)?.foreign, poly, rows, size: ns.length });
    }
  }

  // ---------- попадание ----------
  /** Что нарисовано в последнем кадре и потому ловит указатель: в режиме «только линии» — лица линий Мессии. */
  private drawnOnly: Set<string> | null = null;
  private drawnGhosts = true;
  /** Верх открытого неба (px): ниже линейки годов и служебной строки, а в режиме эпох — ниже ярусов (их рисует tiers.ts). */
  openTop = FRAME_H;

  /** Выделение последнего кадра: на обзоре выделенные мелкие звёзды нарисованы знаком, а не точкой, и ловят указатель. */
  private drawnHl: Map<string, Emphasis> | null = null;

  drawn(i: number): boolean {
    const n = this.nodes[i];
    if (this.drawnOnly && !this.drawnOnly.has(n.person)) return false;
    return !(n.ghost && !this.drawnGhosts);
  }

  /**
   * На обзоре (полоса ниже 5 px) звёзды величины 4–6 — точки без имени: они не ловят указатель и не дают подсказку
   * (E11; IX-07). Выделенные (выбранное лицо, его род, отметки поиска) нарисованы знаком и ловят.
   */
  private pointable(i: number): boolean {
    if (this.cam.ky >= OVERVIEW_KY) return true;
    const id = this.nodes[i].person;
    return (byId.get(id)?.magnitude ?? 6) <= OVERVIEW_MAG || !!this.drawnHl?.has(id);
  }

  /** Звезда нарисована и лежит в открытой части неба — её можно навести, щёлкнуть и выбрать с клавиатуры. */
  reachable(i: number | string): boolean {
    if (typeof i === 'string') {
      const k = this.nodeIndex.get(i);
      if (k === undefined) return false;
      i = k;
    }
    if (!this.drawn(i)) return false;
    const x = this.cam.sx(this.X0[i]);
    const y = this.cam.sy(this.nodes[i].lane);
    return x > this.letterW && x < this.cam.w && y > this.openTop && y < this.cam.vp.b;
  }

  hit(sx: number, sy: number, radius = 12): string | null {
    const cam = this.cam;
    // линейка, левая кромка и ярусы эпох закрывают звёзды под собой
    if (sy < this.openTop || sx < this.letterW) return null;
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
  labelStats(): LabelStats {
    return measureLabels(this.ledger.boxes);
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
    this.drawnHl = hl;
    const L = s.layers;
    const lineOnly = s.onlyLines;
    const spine = new Set([...lines.joseph.persons, ...lines.mary.persons].map((x) => x.id));
    this.drawnOnly = lineOnly ? spine : null;
    this.drawnGhosts = !!L.ghosts;
    // открытое небо — ниже рамки, а в режиме эпох — ниже ярусов (их нижний край — верхнее поле видимой части)
    this.openTop = Math.max(FRAME_H, this.insets.top);
    this.ledger.reset();
    const p: Pass = {
      s,
      vis: [],
      emph: emphasis(hl),
      spine,
      level: Math.max(0, 2 * Math.log2(cam.kx / KX_MIN)),
      zoomScale: Math.max(0.7, Math.min(1.25, cam.ky / 18)),
      reserve: s.reserve,
      nameBoxes: [],
    };

    if (L.epochs) this.drawEpochBands();
    drawTimeMarks(this, p.reserve);
    const ticks = yearTicks(this);
    drawGrid(this, ticks);
    if (L.constellations && !lineOnly) p.nameBoxes = this.drawConstellations(p);
    p.vis = this.visible(p);
    if (L.lifelines) drawTrails(this, p);
    if (L.connectors && cam.ky >= 5) drawDescents(this, p);
    if (L.ribbons) drawSkyRibbons(this, s, { joseph: lines.joseph.persons, mary: lines.mary.persons });
    this.drawStars(p);
    if (L.labels) drawLabels(this, p);
    drawRings(this, p);

    under?.();
    drawFrame(this, ticks);
    this.meridianFlag = drawMeridian(this, s);
    this.edgeHits = drawWayfinding(this, s);
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

  /**
   * Созвездия: контуры притоков пунктиром (народы вне Израиля — точками); название рода подписывается один раз на экран —
   * у самого крупного видимого блока этого рода (labels.ts). Возвращает прямоугольники названий.
   */
  private drawConstellations(p: Pass): Rect[] {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const H = cam.h;
    const hl = p.s.highlight;
    ctx.save();
    ctx.lineWidth = 1;
    const labelBlock = new Map<string, { block: number; size: number }>();
    for (const o of this.outlines) {
      if (o.size < 5) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [t, l] of o.poly) {
        const x = cam.sx(this.xOf(t));
        const y = cam.sy(l);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (maxX < 0 || minX > W || maxY < 0 || minY > H || maxY - minY <= 34) continue;
      const cur = labelBlock.get(o.group);
      if (!cur || o.size > cur.size) labelBlock.set(o.group, { block: o.block, size: o.size });
    }
    const spots: GroupNameSpot[] = [];
    for (const o of this.outlines) {
      const xs = o.poly.map(([t, l]) => [cam.sx(this.xOf(t)), cam.sy(l)] as const);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
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
      if (labelBlock.get(o.group)?.block === o.block) spots.push({ group: o.group, minX, maxX, minY, maxY, size: o.size });
    }
    const boxes = drawGroupNames(this, p, spots);
    ctx.restore();
    return boxes;
  }

  /** Видимые узлы: в полосе экрана; отвод может проходить через экран, даже если сам след вне его. */
  private visible(p: Pass): number[] {
    const cam = this.cam;
    const W = cam.w;
    const H = cam.h;
    const lineOnly = p.s.onlyLines;
    const vis: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const y = cam.sy(n.lane);
      if (y < -20 || y > H + 20) continue;
      const x0 = cam.sx(this.X0[i]);
      const x1 = cam.sx(this.X1[i]);
      if (x1 < -40 || x0 > W + 40) {
        if (n.parentLane === null || x0 < -40 || x0 > W + 40) continue;
      }
      if (lineOnly && !p.spine.has(n.person)) continue;
      vis.push(i);
    }
    return vis;
  }

  /** Звёзды: на обзоре мелкие — точками; зажигание при загрузке — от ярких к тусклым (ТЗ § 5.5). */
  private drawStars(p: Pass) {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const ky = cam.ky;
    const s = p.s;
    const hl = s.highlight;
    const intro = s.intro;
    const look = { scale: p.zoomScale, color: '', halo: pal.sky };
    for (const i of p.vis) {
      const n = this.nodes[i];
      if (n.ghost && !s.layers.ghosts) continue;
      const q = byId.get(n.person)!;
      const c = this.model.chrono.get(n.person);
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(n.lane);
      if (x < -20 || x > W + 20) continue;
      if (ky < OVERVIEW_KY && q.magnitude > OVERVIEW_MAG && !(hl && hl.has(q.id))) {
        // обзор: мелкие звёзды — точками
        ctx.fillStyle = alpha(pal.ink, 0.55 * p.emph(q.id) * intro);
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        continue;
      }
      // зажигание по величине
      const lit = Math.max(0, Math.min(1, intro * 7 - q.magnitude));
      if (lit <= 0) continue;
      const e = p.emph(q.id) * lit;
      look.color = alpha(pal.ink, e);
      drawGlyph(ctx, x, y, personGlyph(q, n.ghost, c?.cls, look));
    }
  }
}
