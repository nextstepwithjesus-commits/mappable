/**
 * Отрисовка неба на Canvas 2D (ТЗ § 3.1–3.2, § 5). Слои снизу вверх:
 * эпохи → сетка лет → созвездия → следы жизни → связи → ленты → звёзды → подписи → меридиан → рамка листа.
 * Подписи отбираются по заранее вычисленным порогам масштаба (без пересчёта на каждый кадр).
 */
import { Camera, KX_MIN, type Frame } from './camera.ts';
import { drawGlyph, starRadius, roleSigla } from './glyphs.ts';
import { alpha } from './color.ts';
import { drawStrands, ribbonLook } from './ribbons.ts';
import { coarsePointer, mapFont, mapSize, nameFont, nameSize, siglaFont, T_MAP_S, T_NOTE, T_UI } from './type.ts';
import { timeToX, xToTime, hydrateScale, type TimeScale, T_END } from '../engine/timescale.ts';
import { buildRibbons } from '../engine/ribbons.ts';
import { toHist, toAstro } from '../engine/years.ts';
import type { ModelData, NodeRow } from '../data/atlas.ts';
import { byId, groupById, lines } from '../data/atlas.ts';

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

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const num = (n: string, d: number) => {
    const x = parseFloat(v(n));
    return Number.isFinite(x) ? x : d;
  };
  const glow = v('--glow') === '1';
  return {
    sky: v('--sky'), band: v('--sky-band'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'),
    ruleStrong: v('--rule-strong'), gold1: v('--gold-1'), gold2: v('--gold-2'), azure1: v('--azure-1'), azure2: v('--azure-2'),
    focus: v('--focus'), halo: v('--halo'), glow,
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
  highlight: Map<string, 'self' | 'anc' | 'desc' | 'path'> | null;
  layers: Record<string, boolean>;
  onlyLines: boolean;
  meridian: number | null;
  tensionPersons: Set<string>;
  flow: number; // 0 — нет тока, иначе время в мс
  reduced: boolean;
  intro: number; // 0…1 — зажигание звёзд
  lineFlip: boolean; // Лк 3 как второе родословие Иосифа
  pins: Set<string>; // отмеченные одноимённые
  /**
   * Резерв: прямоугольники в px холста, закрытые органами неба, колонкой кнопок, вступлением (C4, C6).
   * Подписи звёзд и указатели у края под ними не рисуются.
   */
  reserve?: Rect[];
}

/** Прямоугольник в px холста. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const hits = (a: Rect, rs: Rect[] | undefined) => !!rs && rs.some((r) => a.x < r.x + r.w && r.x < a.x + a.w && a.y < r.y + r.h && r.y < a.y + a.h);

const LETTERS = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЮЯ';
export const BAND = 12;
/** Линейка лет вверху рамки. */
const RULER_H = 26;
/** Служебная строка под линейкой: слева видимые годы и эпоха, справа масштаб (C4; VIS-21, MAP-09, UX-09). */
const ROW_H = 18;
/** Верхнее поле рамки целиком: ниже него — открытое небо. */
export const FRAME_H = RULER_H + ROW_H;
/** Сколько лет самое крупное окно видимой части неба (D2; IX-03). */
const MIN_YEARS = 20;
/** Ширина левой кромки с буквами полос; на сенсорном экране шире — буквы там крупнее («Ж2» в 12,5 px). */
const LETTER_W = 18;
const LETTER_W_TOUCH = 22;

export class Sky {
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
  private labelLevel = new Float64Array(0);
  private labelKey = '';
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
    this.labelKey = '';
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

  // ---------- пороги подписей ----------
  private ensureLabels() {
    const f = this.cam.fitK;
    const key = `${this.model.id}|${Math.round(this.lambda * 4)}|${this.cam.h}|${this.coarse}|${f ? `${f.kx.toPrecision(3)} ${f.ky.toPrecision(3)}` : ''}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const n = this.nodes.length;
    this.labelLevel = new Float64Array(n).fill(Infinity);
    const ctx = this.ctx;
    const widths = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = byId.get(this.nodes[i].person)!;
      if (this.nodes[i].ghost) continue;
      ctx.font = nameFont(p.magnitude, this.coarse);
      widths[i] = ctx.measureText(p.name).width;
    }
    const order = [...Array(n).keys()]
      .filter((i) => !this.nodes[i].ghost)
      .sort((a, b) => {
        const pa = byId.get(this.nodes[a].person)!;
        const pb = byId.get(this.nodes[b].person)!;
        return pa.magnitude - pb.magnitude || Number(this.nodes[b].spine) - Number(this.nodes[a].spine) || pb.prominence - pa.prominence;
      });
    const LEVELS = 26;
    const grids: Map<string, number[][]>[] = Array.from({ length: LEVELS }, () => new Map());
    const boxes: number[][] = [];
    const cell = 96;
    for (const i of order) {
      const p = byId.get(this.nodes[i].person)!;
      const size = nameSize(p.magnitude, this.coarse);
      let found = Infinity;
      const boxAt = (lv: number) => {
        const kx = KX_MIN * Math.pow(2, lv / 2);
        const ky = this.cam.kyFor(kx);
        const r = starRadius(p.magnitude, Math.max(0.7, Math.min(1.2, ky / 18)));
        const x = this.X0[i] * kx + r + 3;
        const y = -this.nodes[i].lane * ky - 3;
        return [x - 1, y - size, x + widths[i] + 1, y + 2];
      };
      const fits = (lv: number) => {
        const b = boxAt(lv);
        const g = grids[lv];
        const cx0 = Math.floor(b[0] / cell);
        const cx1 = Math.floor(b[2] / cell);
        const cy0 = Math.floor(b[1] / cell);
        const cy1 = Math.floor(b[3] / cell);
        for (let cx = cx0; cx <= cx1; cx++)
          for (let cy = cy0; cy <= cy1; cy++) {
            for (const o of g.get(`${cx},${cy}`) ?? []) if (b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]) return false;
          }
        return true;
      };
      // минимальный уровень, начиная с которого подпись помещается на всех более крупных уровнях
      for (let lv = LEVELS - 1; lv >= 0; lv--) {
        if (fits(lv)) found = lv;
        else break;
      }
      if (found === Infinity) continue;
      // зоны «пустоты» у очень мелких звёзд на обзоре не подписываем
      const minLv = [0, 2, 5, 8, 10, 12, 13][Math.max(0, Math.min(6, p.magnitude))];
      found = Math.max(found, minLv);
      this.labelLevel[i] = found;
      for (let lv = found; lv < LEVELS; lv++) {
        const b = boxAt(lv);
        boxes.push(b);
        const g = grids[lv];
        for (let cx = Math.floor(b[0] / cell); cx <= Math.floor(b[2] / cell); cx++)
          for (let cy = Math.floor(b[1] / cell); cy <= Math.floor(b[3] / cell); cy++) {
            const k = `${cx},${cy}`;
            const a = g.get(k);
            if (a) a.push(b);
            else g.set(k, [b]);
          }
      }
    }
  }

  // ---------- попадание ----------
  /** Что нарисовано в последнем кадре и потому ловит указатель: в режиме «только линии» — лица линий Мессии. */
  private drawnOnly: Set<string> | null = null;
  private drawnGhosts = true;
  /** Верх открытого неба (px): ниже линейки годов и служебной строки, а в режиме эпох — ниже ярусов (их рисует tiers.ts). */
  openTop = FRAME_H;

  private drawn(i: number): boolean {
    const n = this.nodes[i];
    if (this.drawnOnly && !this.drawnOnly.has(n.person)) return false;
    return !(n.ghost && !this.drawnGhosts);
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
      if (y < this.openTop || !this.drawn(i)) continue;
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
      if (!this.drawn(i)) continue;
      if (sx >= cam.sx(this.X0[i]) && sx <= cam.sx(this.X1[i])) return n.person;
    }
    return null;
  }

  // ---------- кадр ----------
  draw(s: SkyState) {
    const { ctx, cam, pal } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = cam.w;
    const H = cam.h;
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, W, H);
    const ky = cam.ky;
    const kx = cam.kx;
    // «всё небо» на телефоне мельче KX_MIN: подписи нулевого уровня (величина 0) остаются
    const level = Math.max(0, 2 * Math.log2(kx / KX_MIN));
    const zoomScale = Math.max(0.7, Math.min(1.25, ky / 18));
    const hl = s.highlight;
    const emph = (id: string) => (hl ? (hl.has(id) ? 1 : 0.22) : 1);
    const L = s.layers;
    const lineOnly = s.onlyLines;
    const spineSet = new Set([...lines.joseph.persons, ...lines.mary.persons].map((x) => x.id));
    const intro = s.intro;
    this.drawnOnly = lineOnly ? spineSet : null;
    this.drawnGhosts = !!L.ghosts;
    this.openTop = FRAME_H;
    const reserve = s.reserve;

    // эпохи
    if (L.epochs) {
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

    // завершение канона (Откр — ок. 95 г.) и «сегодня»: шкала неба тянется до 2040 г.
    // Черты — на небе; подписи к ним — в служебной строке рамки (drawFrame), не на данных (C4; MAP-38).
    for (const [t, dashed] of [[95, true], [new Date().getFullYear(), false]] as const) {
      const x = Math.round(cam.sx(this.xOf(t))) + 0.5;
      if (x < this.letterW || x > W) continue;
      ctx.strokeStyle = alpha(pal.ink3, 0.9);
      ctx.lineWidth = 1;
      ctx.setLineDash(dashed ? [3, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x, FRAME_H);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    {
      // время после канона пусто по существу: сказать об этом, а не оставлять тёмное поле — только на пустом месте
      const xc = Math.max(this.letterW + 40, cam.sx(this.xOf(110)));
      if (W - xc > 380) {
        const cx = (xc + W) / 2;
        ctx.font = mapFont(T_NOTE, { italic: true, coarse: this.coarse });
        const l1 = 'После завершения канона новых лиц Писания нет.';
        const l2 = 'Родословие приведено к Иисусу Христу (Мф 1:16; Лк 3:23).';
        const w1 = ctx.measureText(l1).width;
        const w2 = ctx.measureText(l2).width;
        const ym = (cam.vp.t + cam.vp.b) / 2;
        const box = { x: cx - Math.max(w1, w2) / 2, y: ym - 26, w: Math.max(w1, w2), h: 44 };
        if (box.x > xc && !hits(box, reserve)) {
          ctx.fillStyle = pal.ink3;
          ctx.fillText(l1, cx - w1 / 2, ym - 10);
          ctx.fillText(l2, cx - w2 / 2, ym + 14);
        }
      }
    }

    // сетка лет
    const ticks = this.yearTicks();
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(pal.rule, 0.4);
    ctx.beginPath();
    for (const t of ticks) {
      if (!t.major && ticks.length > 14) continue;
      const x = Math.round(cam.sx(this.xOf(t.t))) + 0.5;
      ctx.moveTo(x, FRAME_H);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    // созвездия
    if (L.constellations && !lineOnly) {
      ctx.save();
      ctx.lineWidth = 1;
      // название рода подписывается один раз на экран — у самого крупного видимого блока этого рода
      const labelBlock = new Map<string, { block: number; size: number }>();
      const names: { name: string; x: number; y: number; w: number; size: number }[] = [];
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
        // название созвездия — прописными с разрядкой, «прилипает» к левому краю видимой части
        if (labelBlock.get(o.group)?.block === o.block) {
          const name = (groupById.get(o.group)?.name ?? o.group).toUpperCase();
          ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: this.coarse });
          ctx.letterSpacing = '0.22em';
          const tw = ctx.measureText(name).width;
          ctx.letterSpacing = '0px';
          const y = Math.max(minY + 14, Math.min(maxY - 6, FRAME_H + 14));
          const x = Math.max(minX + 10, this.letterW + 12);
          if (x + tw < maxX - 6) names.push({ name, x, y, w: tw, size: o.size });
        }
      }
      // названия не ложатся друг на друга: при столкновении остаётся название более крупного рода
      const fs = mapSize(T_MAP_S, this.coarse);
      const placed: { x: number; y: number; w: number }[] = [];
      ctx.setLineDash([]);
      ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: this.coarse });
      ctx.letterSpacing = '0.22em';
      ctx.fillStyle = alpha(pal.ink3, hl ? 0.45 : 0.95);
      for (const c of names.sort((a, b) => b.size - a.size)) {
        if (placed.some((q) => c.x < q.x + q.w + 8 && q.x < c.x + c.w + 8 && Math.abs(c.y - q.y) < fs + 3)) continue;
        // под органами неба и вступлением названия не рисуются (C6)
        if (hits({ x: c.x, y: c.y - fs, w: c.w, h: fs + 4 }, reserve)) continue;
        placed.push(c);
        ctx.fillText(c.name, c.x, c.y);
      }
      ctx.letterSpacing = '0px';
      ctx.restore();
    }

    // видимые узлы
    const vis: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const y = cam.sy(n.lane);
      if (y < -20 || y > H + 20) continue;
      const x0 = cam.sx(this.X0[i]);
      const x1 = cam.sx(this.X1[i]);
      if (x1 < -40 || x0 > W + 40) {
        // отвод может проходить через экран, даже если сам след вне его
        if (n.parentLane === null || x0 < -40 || x0 > W + 40) continue;
      }
      if (lineOnly && !spineSet.has(n.person)) continue;
      vis.push(i);
    }
    const chronoOf = (id: string) => this.model.chrono.get(id);

    // следы жизни
    if (L.lifelines) {
      ctx.lineCap = 'butt';
      for (const i of vis) {
        const n = this.nodes[i];
        if (n.ghost) continue;
        const p = byId.get(n.person)!;
        const c = chronoOf(n.person);
        if (!c) continue;
        const y = Math.round(cam.sy(n.lane)) + 0.5;
        const x0 = cam.sx(this.X0[i]);
        const x1 = cam.sx(this.X1[i]);
        const e = emph(n.person) * intro;
        const a = (ky < 5 ? 0.35 : 0.55) * e * (p.magnitude <= 2 ? 1.25 : 1);
        ctx.strokeStyle = alpha(pal.ink2, Math.min(1, a));
        ctx.lineWidth = ky < 5 ? 1 : p.magnitude <= 1 ? 1.6 : 1.2;
        if (c.cls === 'epochal') {
          ctx.setLineDash([1, 4]);
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(Math.min(x1, x0 + 60), y);
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        const known = c.d !== null;
        const solidEnd = known ? x1 : c.last !== null ? cam.sx(this.xOf(c.last)) : x0 + (x1 - x0) * 0.35;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(Math.max(x0, solidEnd), y);
        ctx.stroke();
        if (!known || c.cls === 'estimated') {
          ctx.setLineDash([1.5, 3]);
          ctx.beginPath();
          ctx.moveTo(Math.max(x0, solidEnd), y);
          ctx.lineTo(Math.max(x0, x1), y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // связи родитель → ребёнок
    if (L.connectors && ky >= 5) {
      ctx.lineWidth = 1;
      for (const i of vis) {
        const n = this.nodes[i];
        if (n.parentLane === null || n.satelliteOf) continue;
        if (n.ghost && !L.ghosts) continue;
        const x = Math.round(cam.sx(this.X0[i])) + 0.5;
        const y0 = cam.sy(n.parentLane);
        const y1 = cam.sy(n.lane);
        const e = Math.min(emph(n.person), n.layoutParent ? emph(n.layoutParent) : 1) * intro;
        ctx.strokeStyle = alpha(pal.ink3, 0.75 * e);
        if (n.ghost) ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        if (n.ghost) ctx.setLineDash([]);
        // узелок у матери на семейном отводе
        const mother = byId.get(n.person)?.mother;
        if (mother) {
          const mi = this.nodeIndex.get(mother);
          if (mi !== undefined) {
            const my = cam.sy(this.nodes[mi].lane);
            if ((my - y0) * (my - y1) < 0) {
              ctx.fillStyle = alpha(pal.ink2, 0.9 * e);
              ctx.fillRect(x - 1.5, my - 1.5, 3, 3);
            }
          }
        }
        // напряжение: знак разрыва на отводе
        if (L.tensions && s.tensionPersons.has(n.person) && n.layoutParent && s.tensionPersons.has(n.layoutParent)) {
          const ym = (y0 + y1) / 2;
          ctx.strokeStyle = alpha(pal.ink, 0.9 * e);
          ctx.beginPath();
          ctx.moveTo(x - 4, ym + 1);
          ctx.lineTo(x + 4, ym - 3);
          ctx.moveTo(x - 4, ym + 4);
          ctx.lineTo(x + 4, ym);
          ctx.stroke();
        }
      }
      // брак: короткая двойная черта между мужем и женой-спутницей
      ctx.strokeStyle = alpha(pal.ink3, 0.8);
      for (const i of vis) {
        const n = this.nodes[i];
        if (!n.satelliteOf) continue;
        const hi = this.nodeIndex.get(n.satelliteOf);
        if (hi === undefined) continue;
        const x = cam.sx(Math.max(this.X0[i], this.X0[hi])) + 14;
        const y0 = cam.sy(this.nodes[hi].lane);
        const y1 = cam.sy(n.lane);
        ctx.beginPath();
        ctx.moveTo(x - 1.5, y0);
        ctx.lineTo(x - 1.5, y1);
        ctx.moveTo(x + 1.5, y0);
        ctx.lineTo(x + 1.5, y1);
        ctx.stroke();
      }
    }

    // ленты
    if (L.ribbons) this.drawRibbons(s);

    // звёзды
    for (const i of vis) {
      const n = this.nodes[i];
      if (n.ghost && !L.ghosts) continue;
      const p = byId.get(n.person)!;
      const c = chronoOf(n.person);
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(n.lane);
      if (x < -20 || x > W + 20) continue;
      if (ky < 5 && p.magnitude > 3 && !(hl && hl.has(p.id))) {
        // обзор: мелкие звёзды — точками
        ctx.fillStyle = alpha(pal.ink, 0.55 * emph(p.id) * intro);
        ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        continue;
      }
      // зажигание по величине
      const lit = Math.max(0, Math.min(1, intro * 7 - p.magnitude));
      if (lit <= 0) continue;
      const e = emph(p.id) * lit;
      drawGlyph(ctx, x, y, {
        sex: p.sex, kind: p.kind, magnitude: p.magnitude, king: p.roles.includes('king') || p.roles.includes('queen'),
        messiah: p.id === 'iisus', ghost: n.ghost, hollow: c?.cls === 'calculated' && p.magnitude > 1,
        scale: zoomScale, color: alpha(pal.ink, e), halo: pal.sky,
      });
    }

    // подписи
    if (L.labels) {
      this.ensureLabels();
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';
      for (const i of vis) {
        const n = this.nodes[i];
        if (n.ghost) continue;
        const p = byId.get(n.person)!;
        const forced = p.id === s.selected || p.id === s.hovered || p.id === s.second || p.id === s.focus || (hl?.get(p.id) === 'path');
        if (!forced && !(level >= this.labelLevel[i])) continue;
        if (!forced && lineOnly && !spineSet.has(p.id)) continue;
        const lit = Math.max(0, Math.min(1, intro * 7 - p.magnitude - 0.5));
        if (lit <= 0 && !forced) continue;
        const x = cam.sx(this.X0[i]);
        const y = cam.sy(n.lane);
        // звезда за краем окна не подписывается: для выбранных есть указатели у края (MOB-01)
        if (x < this.letterW || x > W) continue;
        const r = starRadius(p.magnitude, zoomScale);
        ctx.font = nameFont(p.magnitude, this.coarse);
        const nameW = ctx.measureText(p.name).width;
        const size = nameSize(p.magnitude, this.coarse);
        const ty = y - 3;
        // у правого края подпись переходит влево от звезды, чтобы не обрезаться рамкой;
        // под органами неба, колонкой кнопок и вступлением подпись не рисуется — или переходит на другую сторону (C6)
        const right = x + r + 3;
        const left = x - r - 3 - nameW;
        const fitsRight = right + nameW <= cam.w - 6;
        const fitsLeft = left > this.letterW + 4;
        const free = (lx: number) => !hits({ x: lx - 2, y: ty - size, w: nameW + 4, h: size + 5 }, reserve);
        let flip = !fitsRight && fitsLeft;
        if (reserve && !free(flip ? left : right)) {
          if (!flip && fitsLeft && free(left)) flip = true;
          else if (flip || !fitsRight || !free(right)) continue;
        }
        const tx = flip ? left : right;
        const e = forced ? 1 : emph(p.id) * lit;
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.globalAlpha = e;
        ctx.strokeText(p.name, tx, ty);
        ctx.fillStyle = p.magnitude <= 2 || forced ? pal.ink : pal.ink2;
        ctx.fillText(p.name, tx, ty);
        if (ky >= 18 && p.roles.length && !flip) {
          const sig = roleSigla(p.roles);
          if (sig) {
            const w = nameW;
            ctx.font = siglaFont(p.magnitude, this.coarse);
            ctx.strokeText(sig, tx + w + 4, ty);
            ctx.fillStyle = pal.ink3;
            ctx.fillText(sig, tx + w + 4, ty);
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // выбранные — кольцо; фокус клавиатуры — такое же кольцо, а у выбранной звезды — второе, снаружи
    const ring = (id: string, out: number) => {
      const i = this.nodeIndex.get(id);
      if (i === undefined) return;
      const p = byId.get(id)!;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      const r = starRadius(p.magnitude, zoomScale) + (p.sex === 'f' ? 6.5 : 5) + out;
      ctx.strokeStyle = pal.focus;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    for (const id of [s.selected, s.second]) if (id) ring(id, 0);
    if (s.focus) ring(s.focus, s.focus === s.selected || s.focus === s.second ? 4 : 0);

    // отмеченные одноимённые
    for (const id of s.pins) {
      const i = this.nodeIndex.get(id);
      if (i === undefined) continue;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      ctx.strokeStyle = pal.focus;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // меридиан года
    if (s.meridian !== null) {
      const x = Math.round(cam.sx(this.xOf(s.meridian))) + 0.5;
      ctx.strokeStyle = alpha(pal.ink, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    this.drawFrame(ticks);
    this.drawWayfinding(s);
  }

  /** Указатели на выбранных за краем экрана («→ Давид»): по щелчку — перелёт. Не заходят под органы неба (C4; MAP-37). */
  edgeHits: { x: number; y: number; w: number; h: number; id: string }[] = [];
  private drawWayfinding(s: SkyState) {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const top = this.openTop;
    const bottom = cam.vp.b;
    this.edgeHits = [];
    const placed: Rect[] = [];
    for (const id of [s.selected, s.second]) {
      if (!id) continue;
      const i = this.nodeIndex.get(id);
      if (i === undefined) continue;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      const inside = x > this.letterW && x < W && y > top && y < bottom;
      if (inside) continue;
      const name = byId.get(id)!.name;
      let arrow = '';
      if (y < top) arrow = '↑';
      else if (y > bottom) arrow = '↓';
      else if (x < this.letterW) arrow = '←';
      else arrow = '→';
      const label = `${arrow} ${name}`;
      ctx.font = mapFont(T_UI, { sans: true, weight: 500, coarse: this.coarse });
      const tw = ctx.measureText(label).width;
      let lx = Math.max(this.letterW + 6, Math.min(W - tw - 10, x - tw / 2));
      let ly = Math.max(top + 18, Math.min(bottom - 10, y));
      // под органами неба, колонкой кнопок, вступлением и другим указателем — сдвиг вверх или вниз, затем влево
      const box = () => ({ x: lx - 5, y: ly - 13, w: tw + 10, h: 18 });
      const taken = [...(s.reserve ?? []), ...placed];
      for (let k = 0; k < 6 && hits(box(), taken); k++) {
        const r = taken.find((q) => hits(box(), [q]))!;
        const up = r.y - 8;
        const down = r.y + r.h + 18;
        if (up - 13 >= top + 4 && (Math.abs(up - ly) <= Math.abs(down - ly) || down > bottom - 4)) ly = up;
        else if (down <= bottom - 4) ly = down;
        else lx = Math.max(this.letterW + 6, r.x - tw - 16);
      }
      const b = box();
      ctx.fillStyle = pal.sky;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = pal.ruleStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1);
      ctx.fillStyle = pal.ink;
      ctx.fillText(label, lx, ly);
      this.edgeHits.push({ ...b, id });
      placed.push(b);
    }
  }

  /** Строка колонтитула: видимые годы и эпоха в середине окна (UX-09). */
  private headText(): { years: string; epoch: string } {
    const cam = this.cam;
    const tL = this.tOf(cam.wx(this.letterW));
    const tR = this.tOf(cam.wx(cam.w));
    const tC = this.tOf(cam.wx((cam.vp.l + cam.vp.r) / 2));
    const ep = this.model.epochs.find((e) => tC >= toAstro(e.start) && tC < toAstro(e.end));
    const span = (a: number, b: number) => {
      const ha = Math.round(toHist(a));
      const hb = Math.round(toHist(b));
      if (ha < 0 && hb < 0) return `${-ha}–${-hb}\u00A0гг.\u00A0до\u00A0Р.\u00A0Х.`;
      if (ha > 0 && hb > 0) return `${ha}–${hb}\u00A0гг.\u00A0по\u00A0Р.\u00A0Х.`;
      return `${-ha}\u00A0г.\u00A0до\u00A0Р.\u00A0Х.\u00A0— ${hb}\u00A0г.\u00A0по\u00A0Р.\u00A0Х.`;
    };
    // эпоха — только когда окно уже тысячи лет; на обзоре она ничего не называет
    return { years: `видно ${span(Math.max(this.scale.knots[0], tL), Math.min(T_END, tR))}`, epoch: ep && tR - tL < 1000 ? `эпоха в\u00A0середине\u00A0— «${ep.name}»` : '' };
  }

  /** Местный масштаб: «1 см ≈ 60 лет»; мельче года — «1 год ≈ 2 см» (IX-03). */
  private scaleText(): string {
    const cam = this.cam;
    const tC = this.tOf(cam.wx((cam.vp.l + cam.vp.r) / 2));
    const pxPerYear = (this.xOf(tC + 1) - this.xOf(tC)) * cam.kx;
    if (!(pxPerYear > 0)) return '';
    const uneven = this.lambda > 0.5 ? ', масштаб неравномерный' : '';
    const raw = 37.8 / pxPerYear;
    if (raw < 0.75) {
      const cm = Math.round((pxPerYear / 37.8) * 2) / 2;
      return `1\u00A0год ≈ ${String(cm).replace('.', ',')}\u00A0см${uneven}`;
    }
    const nice = raw >= 100 ? Math.round(raw / 50) * 50 : raw >= 10 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
    const word = nice % 10 === 1 && nice % 100 !== 11 ? 'год' : nice % 10 >= 2 && nice % 10 <= 4 && (nice % 100 < 12 || nice % 100 > 14) ? 'года' : 'лет';
    return `1\u00A0см ≈ ${nice}\u00A0${word}${uneven}`;
  }

  private drawRibbons(s: SkyState) {
    const { ctx, cam, pal } = this;
    const project = (id: string) => {
      const i = this.nodeIndex.get(id);
      if (i === undefined) return null;
      return { x: cam.sx(this.X0[i]), y: cam.sy(this.nodes[i].lane) };
    };
    // лица, которых ещё нет в данных, пропускаются: нить идёт к следующему известному звену
    const weakOf = (ln: 'joseph' | 'mary') =>
      lines[ln].persons
        .map((st) => (s.lineFlip && ln === 'mary' && st.id === 'mariya' ? { ...st, id: 'iosif-muzh-marii' } : st))
        .filter((st) => this.nodeIndex.has(st.id))
        .map((st) => ({ id: st.id, weak: st.flag === 'interpretation' || st.flag === 'luke-only' || (ln === 'mary' && st.id === 'salafiil') }));
    const ky = cam.ky;
    const boost = s.onlyLines ? 1.35 : 1;
    const A = Math.max(4, Math.min(11, ky * 0.55)) * boost;
    const strands = buildRibbons({ joseph: weakOf('joseph'), mary: weakOf('mary'), project, amplitude: A, meander: A * 0.5 });
    const core = Math.max(2.1, Math.min(3.6, ky / 6)) * boost;
    drawStrands(ctx, strands, core, ribbonLook(pal, !!s.highlight), cam.w, s.flow && !s.reduced ? s.flow * 0.02 : null);
  }

  yearTicks(): { t: number; major: boolean }[] {
    const cam = this.cam;
    const tL = this.tOf(cam.wx(this.letterW));
    const tR = this.tOf(cam.wx(cam.w));
    const tMid = this.tOf(cam.wx(cam.w / 2));
    const pxPerYear = (this.xOf(tMid + 1) - this.xOf(tMid)) * cam.kx;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    let step = steps[steps.length - 1];
    for (const s of steps) if (s * pxPerYear >= 78) { step = s; break; }
    const out: { t: number; major: boolean }[] = [];
    // шаги по историческим годам, чтобы метки были круглыми («1000 до Р. Х.»)
    // до начала шкалы (сотворения) рисок нет: первая — не раньше него
    const t0 = Math.max(this.scale.knots[0], tL);
    const hStart = (t0 > tL ? Math.ceil(toHist(t0) / step) : Math.floor(toHist(t0) / step)) * step;
    const hEnd = toHist(Math.min(T_END, tR));
    for (let h = hStart; h <= hEnd + step; h += step) {
      if (h === 0) continue;
      const t = toAstro(h);
      if (t < tL - step || t > tR + step) continue;
      out.push({ t, major: h % (step * 5) === 0 });
    }
    return out;
  }

  /**
   * Рамка листа (C4; VIS-21, VIS-23, MAP-09, UX-09, UX-41). Все поля непрозрачные, служебные надписи — только в них:
   *  — линейка лет: подписи не левее кромки, эра — у первой подписи каждой эры, мелкие риски теснее 6 px не рисуются;
   *  — служебная строка 18 px: слева видимые годы и эпоха в середине окна, справа масштаб, у своих черт — «завершение
   *    канона» и «сегодня», если не мешают;
   *  — угловое поле и левая кромка с буквами полос; буква не ближе 10 px к краям кромки.
   */
  private drawFrame(ticks: { t: number; major: boolean }[]) {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const H = cam.h;
    const LW = this.letterW;
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, W, FRAME_H);
    ctx.fillRect(0, FRAME_H, LW, H - FRAME_H);
    ctx.strokeStyle = pal.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H - 0.5);
    ctx.lineTo(W, RULER_H - 0.5);
    ctx.moveTo(0, FRAME_H - 0.5);
    ctx.lineTo(W, FRAME_H - 0.5);
    ctx.moveTo(LW - 0.5, 0);
    ctx.lineTo(LW - 0.5, H);
    ctx.stroke();

    // линейка лет
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: this.coarse });
    ctx.fillStyle = pal.ink3;
    ctx.strokeStyle = pal.ink3;
    ctx.textBaseline = 'middle';
    let lastX = -Infinity;
    let lastTick = -Infinity;
    let bcDone = false;
    let adDone = false;
    for (const tk of ticks) {
      const x = cam.sx(this.xOf(tk.t));
      if (x < LW + 4 || x > W - 4) continue;
      if (!tk.major && x - lastTick < 6) continue;
      lastTick = x;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, RULER_H - (tk.major ? 7 : 4));
      ctx.lineTo(Math.round(x) + 0.5, RULER_H);
      ctx.stroke();
      const h = toHist(tk.t);
      const era = h < 0 && !bcDone ? '\u00A0до\u00A0Р.\u00A0Х.' : h > 0 && !adDone ? '\u00A0по\u00A0Р.\u00A0Х.' : '';
      const label = String(Math.abs(h)) + era;
      const tw = ctx.measureText(label).width;
      // подпись по центру риски, но не за краями линейки: у края она сдвигается, оставаясь над своей риской
      const lx = Math.max(LW + 4, Math.min(W - tw - 4, x - tw / 2));
      if (lx < lastX + 12 || x < lx || x > lx + tw) continue;
      ctx.fillText(label, lx, 11);
      lastX = lx + tw;
      if (h < 0) bcDone = true;
      else adDone = true;
    }

    // служебная строка: годы окна и эпоха слева, масштаб справа, подписи черт канона и «сегодня» — у своих черт
    const rowY = RULER_H + ROW_H / 2;
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: this.coarse });
    ctx.fillStyle = pal.ink2;
    const { years, epoch } = this.headText();
    const left = LW + 8;
    let leftEnd = left;
    let rightStart = W - 8;
    const scale = this.scaleText();
    const ws = scale ? ctx.measureText(scale).width : 0;
    const wy = ctx.measureText(years).width;
    const full = epoch ? `${years}; ${epoch}` : years;
    const wf = ctx.measureText(full).width;
    if (scale && W - 8 - ws > left + wy + 24) rightStart = W - 8 - ws;
    const head = left + wf < rightStart - 24 ? full : left + wy < rightStart - 12 ? years : '';
    if (head) {
      ctx.fillText(head, left, rowY);
      leftEnd = left + ctx.measureText(head).width;
    }
    if (rightStart < W - 8) ctx.fillText(scale, rightStart, rowY);
    ctx.fillStyle = pal.ink3;
    for (const [t, label] of [[95, 'завершение канона'], [new Date().getFullYear(), 'сегодня']] as const) {
      const x = cam.sx(this.xOf(t));
      const tw = ctx.measureText(label).width;
      if (x + 4 > leftEnd + 16 && x + 4 + tw < rightStart - 16) ctx.fillText(label, x + 4, rowY);
    }

    // левая кромка: буквы полос
    const laneTopG = this.model.laneMax;
    ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: this.coarse });
    ctx.fillStyle = pal.ink3;
    ctx.strokeStyle = alpha(pal.rule, 0.9);
    // на «всём небе» полоса ниже 14 px: подписана каждая k-я, черты — не теснее 5 px (иначе кромка — «штрихкод»)
    const bandH = BAND * cam.ky;
    const every = bandH >= 14 ? 1 : [2, 3, 4, 6, 12].find((k) => k * bandH >= 16) ?? 24;
    const lines = bandH >= 5;
    for (let band = 0; band < 400; band++) {
      const l0 = laneTopG - band * BAND;
      const y0 = cam.sy(l0 + 0.5);
      const y1 = cam.sy(l0 - BAND + 0.5);
      if (y1 < FRAME_H) continue;
      if (y0 > H) break;
      if (lines || band % every === every - 1) {
        ctx.beginPath();
        ctx.moveTo(lines ? 0 : LW - 5, Math.round(y1) + 0.5);
        ctx.lineTo(LW, Math.round(y1) + 0.5);
        ctx.stroke();
      }
      if (band % every) continue;
      const a = Math.max(y0, FRAME_H);
      const b = Math.min(y1, H);
      const ym = every > 1 ? y0 + 7 : (a + b) / 2;
      if ((every > 1 || b - a > 14) && ym >= FRAME_H + 10 && ym <= H - 10) {
        const letter = LETTERS[band % LETTERS.length] + (band >= LETTERS.length ? String(Math.floor(band / LETTERS.length) + 1) : '');
        const tw = ctx.measureText(letter).width;
        ctx.fillText(letter, Math.max(1, (LW - tw) / 2), ym);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }
}

/** Атласная координата: столбец — век от начала шкалы, строка — буква полосы. */
export function atlasCoord(t: number, lane: number, laneMax: number): string {
  const col = Math.floor((toHist(t) + 4200) / 100) + 1;
  const band = Math.floor((laneMax - lane + 0.5) / BAND);
  const letter = LETTERS[band % LETTERS.length] + (band >= LETTERS.length ? String(Math.floor(band / LETTERS.length) + 1) : '');
  return `${col} ${letter}`;
}
