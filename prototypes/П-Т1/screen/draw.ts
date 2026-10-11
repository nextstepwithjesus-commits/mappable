/**
 * Слой рисунка: линии и знаки лиц. Три способа на одной геометрии — для сравнения (09 § 3.2.1):
 * svg — элемент на каждую линию и знак; svgpath — по одному пути на вид; canvas — Canvas 2D.
 * Подписи и цели фокуса здесь не рисуются: они всегда HTML (labels.tsx).
 */
import type { Forest } from '../core/forest.ts';
import { LABEL_PERSON, BASE, type Geometry } from '../core/layout.ts';

export type Renderer = 'svg' | 'svgpath' | 'canvas';

export interface DrawJob {
  geom: Geometry;
  forest: Forest;
  segs: number[];
  labels: number[];
  /** Сдвиг: экранная точка слоя = мировая × k − o. */
  ox: number;
  oy: number;
  k: number;
  w: number;
  h: number;
  selected: number;
  /** Наименьший радиус знака в единицах слоя (1,5 px на экране). */
  minR?: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function glyphs(j: DrawJob, fn: (sex: string | undefined, cx: number, cy: number, r: number, sel: boolean) => void) {
  const { geom, forest, k } = j;
  const r = Math.max(j.minR ?? 1.5, BASE.glyph * k);
  const gy = 10 * (geom.rowH / BASE.rowH); // центр знака по высоте строки имени
  for (const i of j.labels) {
    if (geom.labels.kind[i] !== LABEL_PERSON) continue;
    const p = geom.labels.ref[i];
    fn(forest.persons[p].sex, (geom.labels.x[i] + BASE.glyph) * k - j.ox, (geom.labels.y[i] + gy) * k - j.oy, r, p === j.selected);
  }
}

export function svgMarkup(j: DrawJob, mode: 'svg' | 'svgpath'): { html: string; elements: number } {
  const S = j.geom.segs, k = j.k;
  let html = '';
  let elements = 1;
  if (mode === 'svg') {
    for (const i of j.segs) {
      html += `<line class="e" x1="${r1(S[4 * i] * k - j.ox)}" y1="${r1(S[4 * i + 1] * k - j.oy)}" x2="${r1(S[4 * i + 2] * k - j.ox)}" y2="${r1(S[4 * i + 3] * k - j.oy)}"/>`;
      elements++;
    }
    glyphs(j, (sex, cx, cy, r, sel) => {
      const cls = sel ? 'g s' : 'g';
      if (sex === 'f') html += `<circle class="${cls}" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"/>`;
      else if (sex === 'm') html += `<rect class="${cls}" x="${r1(cx - r)}" y="${r1(cy - r)}" width="${r1(2 * r)}" height="${r1(2 * r)}"/>`;
      else html += `<path class="${cls}" d="M${r1(cx)} ${r1(cy - r)}l${r1(r)} ${r1(r)}l${r1(-r)} ${r1(r)}l${r1(-r)} ${r1(-r)}z"/>`;
      elements++;
    });
  } else {
    let d = '';
    for (const i of j.segs) d += `M${r1(S[4 * i] * k - j.ox)} ${r1(S[4 * i + 1] * k - j.oy)}L${r1(S[4 * i + 2] * k - j.ox)} ${r1(S[4 * i + 3] * k - j.oy)}`;
    let m = '', f = '', u = '', sel = '';
    glyphs(j, (sex, cx, cy, r, s) => {
      const part = sex === 'f'
        ? `M${r1(cx - r)} ${r1(cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0`
        : sex === 'm' ? `M${r1(cx - r)} ${r1(cy - r)}h${r1(2 * r)}v${r1(2 * r)}h${r1(-2 * r)}z`
        : `M${r1(cx)} ${r1(cy - r)}l${r1(r)} ${r1(r)}l${r1(-r)} ${r1(r)}l${r1(-r)} ${r1(-r)}z`;
      if (s) sel += part; else if (sex === 'f') f += part; else if (sex === 'm') m += part; else u += part;
    });
    html = `<path class="e" d="${d}"/><path class="g" d="${m}"/><path class="g" d="${f}"/><path class="g" d="${u}"/><path class="g s" d="${sel}"/>`;
    elements += 5;
  }
  return { html, elements };
}

export interface Colors { line: string; ink: string; sel: string }

export function drawCanvas(ctx: CanvasRenderingContext2D, j: DrawJob, dpr: number, c: Colors, line = 1) {
  const S = j.geom.segs, k = j.k;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, j.w, j.h);
  ctx.strokeStyle = c.line;
  ctx.lineWidth = line;
  ctx.beginPath();
  // половина пикселя — чёткая линия толщиной 1 px (09 § 3.2.1 п. 3: учёт плотности пикселей)
  const snap = line === 1 ? (v: number) => Math.round(v * dpr) / dpr + 0.5 / dpr : (v: number) => v;
  for (const i of j.segs) {
    ctx.moveTo(snap(S[4 * i] * k - j.ox), snap(S[4 * i + 1] * k - j.oy));
    ctx.lineTo(snap(S[4 * i + 2] * k - j.ox), snap(S[4 * i + 3] * k - j.oy));
  }
  ctx.stroke();
  ctx.fillStyle = c.ink;
  ctx.beginPath();
  const selPath: number[] = [];
  glyphs(j, (sex, cx, cy, r, s) => {
    if (s) { selPath.push(cx, cy, r); return; }
    if (sex === 'f') { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
    else if (sex === 'm') ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
    else { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); }
  });
  ctx.fill();
  if (selPath.length) {
    const [cx, cy, r] = selPath;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = c.ink;
    ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
}
