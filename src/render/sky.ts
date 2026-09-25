/**
 * Отрисовка неба на Canvas 2D (ТЗ § 3.1–3.2, § 5). Слои снизу вверх:
 * эпохи → сетка лет → созвездия → следы жизни → связи → ленты → звёзды → подписи → меридиан → рамка листа.
 * Подписи отбираются по заранее вычисленным порогам масштаба (без пересчёта на каждый кадр).
 */
import { Camera, KX_MIN } from './camera.ts';
import { drawGlyph, starRadius, roleSigla } from './glyphs.ts';
import { timeToX, xToTime, hydrateScale, type TimeScale, T_START, T_END } from '../engine/timescale.ts';
import { buildRibbons, type Strand } from '../engine/ribbons.ts';
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
}

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    sky: v('--sky'), band: v('--sky-band'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'),
    ruleStrong: v('--rule-strong'), gold1: v('--gold-1'), gold2: v('--gold-2'), azure1: v('--azure-1'), azure2: v('--azure-2'),
    focus: v('--focus'), halo: v('--halo'), glow: v('--glow') === '1',
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
}

const LETTERS = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЮЯ';
export const BAND = 12;
const FONT_SERIF = "'Literata Variable', Literata, Georgia, serif";
const FONT_SANS = "'Jost Variable', Jost, sans-serif";
const LABEL_SIZE = [16, 15, 14, 13, 12.5, 12, 11.5];
const LABEL_WEIGHT = [620, 560, 520, 470, 430, 420, 400];
const RULER_H = 26;
const LETTER_W = 18;

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
function alpha(c: string, a: number): string {
  if (c.startsWith('#')) {
    const [r, g, b] = hexToRgb(c);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c.replace('rgb(', 'rgba(').replace(')', `,${a})`);
}

export function labelFont(mag: number): string {
  const m = Math.max(0, Math.min(6, mag));
  return `${LABEL_WEIGHT[m]} ${LABEL_SIZE[m]}px ${FONT_SERIF}`;
}

export class Sky {
  cam = new Camera();
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.pal = readPalette();
  }

  resize(w: number, h: number, dpr: number) {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.cam.w = w;
    this.cam.h = h;
    this.labelKey = '';
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

  fitAll() {
    const lo = this.xOf(T_START);
    const hi = this.xOf(100);
    this.cam.fit(lo, hi, this.model.laneMin, this.model.laneMax, 36);
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
    const key = `${this.model.id}|${Math.round(this.lambda * 4)}|${this.cam.h}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const n = this.nodes.length;
    this.labelLevel = new Float64Array(n).fill(Infinity);
    const ctx = this.ctx;
    const widths = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = byId.get(this.nodes[i].person)!;
      if (this.nodes[i].ghost) continue;
      ctx.font = labelFont(p.magnitude);
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
      const size = LABEL_SIZE[Math.max(0, Math.min(6, p.magnitude))];
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
  hit(sx: number, sy: number, radius = 12): string | null {
    const cam = this.cam;
    let best: string | null = null;
    let bestD = radius * radius;
    const ky = cam.ky;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(n.lane);
      if (Math.abs(y - sy) > radius + ky) continue;
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
    const level = 2 * Math.log2(kx / KX_MIN);
    const zoomScale = Math.max(0.7, Math.min(1.25, ky / 18));
    const hl = s.highlight;
    const emph = (id: string) => (hl ? (hl.has(id) ? 1 : 0.22) : 1);
    const L = s.layers;
    const lineOnly = s.onlyLines;
    const spineSet = new Set([...lines.joseph.persons, ...lines.mary.persons].map((x) => x.id));
    const intro = s.intro;

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

    // сетка лет
    const ticks = this.yearTicks();
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(pal.rule, 0.4);
    ctx.beginPath();
    for (const t of ticks) {
      if (!t.major && ticks.length > 14) continue;
      const x = Math.round(cam.sx(this.xOf(t.t))) + 0.5;
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    // созвездия
    if (L.constellations && !lineOnly) {
      ctx.save();
      ctx.lineWidth = 1;
      // название рода подписывается один раз на экран — у самого крупного видимого блока этого рода
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
          ctx.setLineDash([]);
          ctx.font = `500 ${Math.min(13, 9 + ky * 0.15)}px ${FONT_SANS}`;
          ctx.letterSpacing = '0.22em';
          const tw = ctx.measureText(name).width;
          const y = Math.max(minY + 14, Math.min(maxY - 6, RULER_H + 18));
          const x = Math.max(minX + 10, LETTER_W + 12);
          if (x + tw < maxX - 6) {
            ctx.fillStyle = alpha(pal.ink3, hl ? 0.45 : 0.95);
            ctx.fillText(name, x, y);
          }
          ctx.letterSpacing = '0px';
        }
      }
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
        const forced = p.id === s.selected || p.id === s.hovered || p.id === s.second || (hl?.get(p.id) === 'path');
        if (!forced && !(level >= this.labelLevel[i])) continue;
        if (!forced && lineOnly && !spineSet.has(p.id)) continue;
        const lit = Math.max(0, Math.min(1, intro * 7 - p.magnitude - 0.5));
        if (lit <= 0 && !forced) continue;
        const x = cam.sx(this.X0[i]);
        const y = cam.sy(n.lane);
        const r = starRadius(p.magnitude, zoomScale);
        ctx.font = labelFont(p.magnitude);
        const tx = x + r + 3;
        const ty = y - 3;
        const e = forced ? 1 : emph(p.id) * lit;
        ctx.strokeStyle = pal.halo;
        ctx.lineWidth = 3;
        ctx.globalAlpha = e;
        ctx.strokeText(p.name, tx, ty);
        ctx.fillStyle = p.magnitude <= 2 || forced ? pal.ink : pal.ink2;
        ctx.fillText(p.name, tx, ty);
        if (ky >= 18 && p.roles.length) {
          const sig = roleSigla(p.roles);
          if (sig) {
            const w = ctx.measureText(p.name).width;
            ctx.font = `italic 400 ${Math.max(10.5, LABEL_SIZE[Math.min(6, p.magnitude)] - 2)}px ${FONT_SERIF}`;
            ctx.strokeText(sig, tx + w + 4, ty);
            ctx.fillStyle = pal.ink3;
            ctx.fillText(sig, tx + w + 4, ty);
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // выбранные: кольцо фокуса
    for (const id of [s.selected, s.second, s.focus]) {
      if (!id) continue;
      const i = this.nodeIndex.get(id);
      if (i === undefined) continue;
      const p = byId.get(id)!;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      const r = starRadius(p.magnitude, zoomScale) + (p.sex === 'f' ? 6.5 : 5);
      ctx.strokeStyle = pal.focus;
      ctx.lineWidth = id === s.focus && id !== s.selected ? 1.5 : 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

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

  /** Колонтитул (эпоха и годы окна), местный масштаб и указатели на выбранных за краем экрана. */
  edgeHits: { x: number; y: number; w: number; h: number; id: string }[] = [];
  private drawWayfinding(s: SkyState) {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const H = cam.h;
    const tL = this.tOf(cam.wx(LETTER_W));
    const tR = this.tOf(cam.wx(W));
    const tC = this.tOf(cam.wx((LETTER_W + W) / 2));
    const ep = this.model.epochs.find((e) => tC >= toAstro(e.start) && tC < toAstro(e.end));
    const span = (a: number, b: number) => {
      const ha = toHist(a);
      const hb = toHist(b);
      if (ha < 0 && hb < 0) return `${-ha}–${-hb}\u00A0гг.\u00A0до\u00A0Р.\u00A0Х.`;
      if (ha > 0 && hb > 0) return `${ha}–${hb}\u00A0гг.\u00A0по\u00A0Р.\u00A0Х.`;
      return `${-ha}\u00A0г.\u00A0до\u00A0Р.\u00A0Х. — ${hb}\u00A0г.\u00A0по\u00A0Р.\u00A0Х.`;
    };
    ctx.font = `italic 400 13px ${FONT_SERIF}`;
    ctx.fillStyle = pal.ink2;
    const head = `${ep ? ep.name + '; ' : ''}${span(Math.max(T_START, tL), Math.min(T_END, tR))}`;
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(head, LETTER_W + 10, RULER_H + 17);
    ctx.fillText(head, LETTER_W + 10, RULER_H + 17);
    const headEnd = LETTER_W + 10 + ctx.measureText(head).width;
    // местный масштаб: 1 см ≈ N лет — только если помещается рядом с колонтитулом (на узком экране не помещается)
    const pxPerYear = (this.xOf(tC + 1) - this.xOf(tC)) * cam.kx;
    if (pxPerYear > 0 && W >= 720) {
      const raw = 37.8 / pxPerYear;
      const nice = raw >= 100 ? Math.round(raw / 50) * 50 : raw >= 10 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
      const note = `1\u00A0см ≈ ${nice}\u00A0${nice % 10 === 1 && nice % 100 !== 11 ? 'год' : nice % 10 >= 2 && nice % 10 <= 4 && (nice % 100 < 12 || nice % 100 > 14) ? 'года' : 'лет'}${this.lambda > 0.5 ? ', масштаб неравномерный' : ''}`;
      ctx.font = `450 11.5px ${FONT_SANS}`;
      const tw = ctx.measureText(note).width;
      if (W - tw - 12 > headEnd + 24) {
        ctx.fillStyle = pal.ink3;
        ctx.strokeText(note, W - tw - 12, RULER_H + 16);
        ctx.fillText(note, W - tw - 12, RULER_H + 16);
      }
    }
    // указатели на выбранных за краем
    this.edgeHits = [];
    for (const id of [s.selected, s.second]) {
      if (!id) continue;
      const i = this.nodeIndex.get(id);
      if (i === undefined) continue;
      const x = cam.sx(this.X0[i]);
      const y = cam.sy(this.nodes[i].lane);
      const inside = x > LETTER_W && x < W && y > RULER_H && y < H;
      if (inside) continue;
      const name = byId.get(id)!.name;
      let arrow = '';
      if (y < RULER_H) arrow = '↑';
      else if (y > H) arrow = '↓';
      else if (x < LETTER_W) arrow = '←';
      else arrow = '→';
      const label = `${arrow} ${name}`;
      ctx.font = `500 13px ${FONT_SANS}`;
      const tw = ctx.measureText(label).width;
      const lx = Math.max(LETTER_W + 6, Math.min(W - tw - 10, x - tw / 2));
      const ly = Math.max(RULER_H + 34, Math.min(H - 12, y));
      ctx.fillStyle = pal.sky;
      ctx.fillRect(lx - 5, ly - 13, tw + 10, 18);
      ctx.strokeStyle = pal.ruleStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - 5.5, ly - 13.5, tw + 11, 19);
      ctx.fillStyle = pal.ink;
      ctx.fillText(label, lx, ly);
      this.edgeHits.push({ x: lx - 5, y: ly - 13, w: tw + 10, h: 18, id });
    }
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
    const strands: Strand[] = buildRibbons({ joseph: weakOf('joseph'), mary: weakOf('mary'), project, amplitude: A, meander: A * 0.5 });
    const core = Math.max(2.1, Math.min(3.6, ky / 6)) * boost;
    const colorAt = (line: 'joseph' | 'mary', t: number) => (line === 'joseph' ? mix(pal.gold1, pal.gold2, t) : mix(pal.azure1, pal.azure2, t));
    const hlDim = s.highlight ? 0.55 : 1;
    const strokeStrand = (st: Strand, from: number, to: number, width: number, a: number, composite: GlobalCompositeOperation) => {
      ctx.globalCompositeOperation = composite;
      const pts = st.points;
      const CH = 6;
      for (let i = from; i < to - 1; i += CH) {
        const j = Math.min(to - 1, i + CH);
        const seg = pts.slice(i, j + 1);
        if (!seg.length) continue;
        const minX = Math.min(...seg.map((p) => p.x));
        const maxX = Math.max(...seg.map((p) => p.x));
        if (maxX < -20 || minX > cam.w + 20) continue;
        ctx.strokeStyle = alpha(colorAt(st.line, pts[i].t), a);
        ctx.lineWidth = width;
        ctx.setLineDash(pts[i].weak ? [width * 1.2, width * 2.2] : []);
        ctx.beginPath();
        seg.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // свечение (ночью)
    if (pal.glow) {
      for (const st of strands) strokeStrand(st, 0, st.points.length, core * 5, 0.1 * hlDim, 'lighter');
      for (const st of strands) strokeStrand(st, 0, st.points.length, core * 2.4, 0.16 * hlDim, 'lighter');
    }
    // основные нити: сначала Мария, потом Иосиф; под каждой — подложка цвета неба (зазор в плетении)
    for (const st of strands) {
      const pts = st.points;
      ctx.strokeStyle = pal.sky;
      ctx.lineWidth = core + 2.2;
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      strokeStrand(st, 0, pts.length, core, 0.95 * hlDim, 'source-over');
    }
    // переплетение: там, где Иосиф «под» Марией, Мария рисуется поверх ещё раз
    const [mary, joseph] = strands;
    for (const [a, b] of joseph.under) {
      ctx.strokeStyle = pal.sky;
      ctx.lineWidth = core + 2.2;
      ctx.beginPath();
      mary.points.slice(a, b + 1).forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      strokeStrand(mary, a, b + 1, core, 0.95 * hlDim, 'source-over');
    }
    // ток света к Иисусу — только при выборе или наведении линии
    if (s.flow && !s.reduced) {
      for (const st of strands) {
        ctx.save();
        ctx.setLineDash([2, 14]);
        ctx.lineDashOffset = -s.flow * 0.02;
        ctx.strokeStyle = alpha(st.line === 'joseph' ? pal.gold1 : pal.azure1, 0.9);
        ctx.lineWidth = core * 0.9;
        ctx.beginPath();
        st.points.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  yearTicks(): { t: number; major: boolean }[] {
    const cam = this.cam;
    const tL = this.tOf(cam.wx(LETTER_W));
    const tR = this.tOf(cam.wx(cam.w));
    const tMid = this.tOf(cam.wx(cam.w / 2));
    const pxPerYear = (this.xOf(tMid + 1) - this.xOf(tMid)) * cam.kx;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    let step = steps[steps.length - 1];
    for (const s of steps) if (s * pxPerYear >= 78) { step = s; break; }
    const out: { t: number; major: boolean }[] = [];
    // шаги по историческим годам, чтобы метки были круглыми («1000 до Р. Х.»)
    const hStart = Math.floor(toHist(Math.max(T_START, tL)) / step) * step;
    const hEnd = toHist(Math.min(T_END, tR));
    for (let h = hStart; h <= hEnd + step; h += step) {
      if (h === 0) continue;
      const t = toAstro(h);
      if (t < tL - step || t > tR + step) continue;
      out.push({ t, major: h % (step * 5) === 0 });
    }
    return out;
  }

  private drawFrame(ticks: { t: number; major: boolean }[]) {
    const { ctx, cam, pal } = this;
    const W = cam.w;
    const H = cam.h;
    // верхняя кромка: годы
    ctx.fillStyle = alpha(pal.sky, 0.94);
    ctx.fillRect(0, 0, W, RULER_H);
    ctx.strokeStyle = pal.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H - 0.5);
    ctx.lineTo(W, RULER_H - 0.5);
    ctx.stroke();
    ctx.font = `450 11.5px ${FONT_SANS}`;
    ctx.fillStyle = pal.ink3;
    ctx.textBaseline = 'middle';
    let lastX = -Infinity;
    let bcDone = false;
    let adDone = false;
    for (const tk of ticks) {
      const x = cam.sx(this.xOf(tk.t));
      if (x < LETTER_W + 4 || x > W - 10) continue;
      ctx.strokeStyle = pal.ink3;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, RULER_H - (tk.major ? 7 : 4));
      ctx.lineTo(Math.round(x) + 0.5, RULER_H);
      ctx.stroke();
      const h = toHist(tk.t);
      let label = String(Math.abs(h));
      if (h < 0 && !bcDone) {
        label += ' до Р. Х.';
        bcDone = true;
      } else if (h > 0 && !adDone) {
        label += ' по Р. Х.';
        adDone = true;
      }
      const tw = ctx.measureText(label).width;
      // подпись по центру риски, но не за краями кромки
      const lx = Math.max(2, Math.min(W - tw - 2, x - tw / 2));
      if (lx < lastX + 12) continue;
      ctx.fillText(label, lx, 10);
      lastX = lx + tw;
    }
    // левая кромка: буквы полос
    ctx.fillStyle = alpha(pal.sky, 0.94);
    ctx.fillRect(0, RULER_H, LETTER_W, H - RULER_H);
    ctx.strokeStyle = pal.rule;
    ctx.beginPath();
    ctx.moveTo(LETTER_W - 0.5, RULER_H);
    ctx.lineTo(LETTER_W - 0.5, H);
    ctx.stroke();
    const laneTopG = this.model.laneMax;
    ctx.font = `500 11px ${FONT_SANS}`;
    ctx.fillStyle = pal.ink3;
    const ky = cam.ky;
    for (let band = 0; band < 400; band++) {
      const l0 = laneTopG - band * BAND;
      const y0 = cam.sy(l0 + 0.5);
      const y1 = cam.sy(l0 - BAND + 0.5);
      if (y1 < RULER_H) continue;
      if (y0 > H) break;
      ctx.strokeStyle = alpha(pal.rule, 0.9);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y1) + 0.5);
      ctx.lineTo(LETTER_W, Math.round(y1) + 0.5);
      ctx.stroke();
      if (y1 - y0 > 14 && ky > 0) {
        const letter = LETTERS[band % LETTERS.length] + (band >= LETTERS.length ? String(Math.floor(band / LETTERS.length) + 1) : '');
        const ym = Math.max(RULER_H + 10, Math.min(H - 8, (y0 + y1) / 2));
        const tw = ctx.measureText(letter).width;
        ctx.fillText(letter, (LETTER_W - tw) / 2, ym);
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
