/**
 * Следы жизни и родство на небе (ТЗ § 3.1, «след жизни» и «связи»): след от рождения вправо, отвод от следа родителя
 * к ребёнку, узелок матери на отводе, знак разрыва при хронологическом напряжении, брак — двойная черта к жене-спутнице,
 * призрак жены в её роду — пунктирный отвод.
 *
 * drawLifeTrail и drawDescent рисуют одиночный след и одиночный отвод на любом холсте: ими пользуются небо, а позже —
 * образец #/specimen и «Как читать карту», чтобы знак в легенде был тем же, что на небе.
 */
import { alpha } from './color.ts';
import { byId } from '../data/atlas.ts';
import type { DateClass } from '../engine/chronology.ts';
import type { Pass, SkyContext } from './sky.ts';

/** Одиночный след жизни в px холста. */
export interface LifeTrail {
  /** рождение и конец следа (смерть, расчётная или оценочная) */
  x0: number;
  x1: number;
  y: number;
  /** класс датировки: эпохальный — короткий точечный след «время не установлено» */
  cls: DateClass;
  /** год смерти известен */
  known: boolean;
  /** где кончается сплошная часть (при известной смерти — x1) */
  solidTo: number;
  color: string;
  width: number;
}

/**
 * След жизни: сплошной до solidTo; дальше — пунктир, если смерть не известна или дата оценочная. Эпохальная дата —
 * точечный след не длиннее 60 px.
 */
export function drawLifeTrail(ctx: CanvasRenderingContext2D, t: LifeTrail) {
  const { x0, x1, y } = t;
  ctx.strokeStyle = t.color;
  ctx.lineWidth = t.width;
  if (t.cls === 'epochal') {
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(Math.min(x1, x0 + 60), y);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(Math.max(x0, t.solidTo), y);
  ctx.stroke();
  if (!t.known || t.cls === 'estimated') {
    ctx.setLineDash([1.5, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.max(x0, t.solidTo), y);
    ctx.lineTo(Math.max(x0, x1), y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Одиночный отвод от следа родителя (y0) к ребёнку (y1) в px холста. */
export interface Descent {
  x: number;
  y0: number;
  y1: number;
  color: string;
  /** отвод к призраку жены — пунктир */
  ghost?: boolean;
  /** узелок матери на отводе: высота её следа и цвет */
  mother?: { y: number; color: string };
  /** хронологическое напряжение: знак разрыва посередине отвода этим цветом */
  tension?: string;
}

/** Отвод: вертикаль x от y0 до y1, узелок матери, знак разрыва. Толщину линии задаёт вызывающий (на небе — 1 px). */
export function drawDescent(ctx: CanvasRenderingContext2D, d: Descent) {
  const { x, y0, y1 } = d;
  ctx.strokeStyle = d.color;
  if (d.ghost) ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  if (d.ghost) ctx.setLineDash([]);
  if (d.mother) {
    ctx.fillStyle = d.mother.color;
    ctx.fillRect(x - 1.5, d.mother.y - 1.5, 3, 3);
  }
  if (d.tension) {
    const ym = (y0 + y1) / 2;
    ctx.strokeStyle = d.tension;
    ctx.beginPath();
    ctx.moveTo(x - 4, ym + 1);
    ctx.lineTo(x + 4, ym - 3);
    ctx.moveTo(x - 4, ym + 4);
    ctx.lineTo(x + 4, ym);
    ctx.stroke();
  }
}

/** Следы жизни видимых лиц (слой «следы жизни»). На обзоре (полоса ниже 5 px) — тоньше и бледнее. */
export function drawTrails(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const ky = cam.ky;
  const intro = p.s.intro;
  // один объект на весь слой: следов в кадре тысячи
  const t: LifeTrail = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 };
  ctx.lineCap = 'butt';
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost) continue;
    const q = byId.get(n.person)!;
    const c = v.model.chrono.get(n.person);
    if (!c) continue;
    const x0 = cam.sx(v.X0[i]);
    const x1 = cam.sx(v.X1[i]);
    const e = p.emph(n.person) * intro;
    const a = (ky < 5 ? 0.35 : 0.55) * e * (q.magnitude <= 2 ? 1.25 : 1);
    t.x0 = x0;
    t.x1 = x1;
    t.y = Math.round(cam.sy(n.lane)) + 0.5;
    t.cls = c.cls;
    t.known = c.d !== null;
    t.solidTo = t.known ? x1 : c.last !== null ? cam.sx(v.xOf(c.last)) : x0 + (x1 - x0) * 0.35;
    t.color = alpha(pal.ink2, Math.min(1, a));
    t.width = ky < 5 ? 1 : q.magnitude <= 1 ? 1.6 : 1.2;
    drawLifeTrail(ctx, t);
  }
}

/**
 * Связи родитель → ребёнок (слой «связи»; на обзоре их нет): отводы с узелком матери и знаком разрыва при напряжении,
 * затем браки — короткая двойная черта между мужем и женой-спутницей.
 */
export function drawDescents(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const L = s.layers;
  const intro = s.intro;
  // один объект на весь слой: отводов в кадре тысячи
  const d: Descent = { x: 0, y0: 0, y1: 0, color: '', ghost: false, mother: undefined, tension: undefined };
  const knot = { y: 0, color: '' };
  ctx.lineWidth = 1;
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.parentLane === null || n.satelliteOf) continue;
    if (n.ghost && !L.ghosts) continue;
    const y0 = cam.sy(n.parentLane);
    const y1 = cam.sy(n.lane);
    const e = Math.min(p.emph(n.person), n.layoutParent ? p.emph(n.layoutParent) : 1) * intro;
    d.x = Math.round(cam.sx(v.X0[i])) + 0.5;
    d.y0 = y0;
    d.y1 = y1;
    d.color = alpha(pal.ink3, 0.75 * e);
    d.ghost = n.ghost;
    // узелок у матери на семейном отводе
    d.mother = undefined;
    const mid = byId.get(n.person)?.mother;
    if (mid) {
      const mi = v.indexOf(mid);
      if (mi !== undefined) {
        const my = cam.sy(v.nodes[mi].lane);
        if ((my - y0) * (my - y1) < 0) {
          knot.y = my;
          knot.color = alpha(pal.ink2, 0.9 * e);
          d.mother = knot;
        }
      }
    }
    // напряжение: знак разрыва на отводе
    d.tension = L.tensions && s.tensionPersons.has(n.person) && n.layoutParent && s.tensionPersons.has(n.layoutParent) ? alpha(pal.ink, 0.9 * e) : undefined;
    drawDescent(ctx, d);
  }
  drawMarriages(v, p);
}

/** Брак: короткая двойная черта между мужем и женой-спутницей. */
function drawMarriages(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  ctx.strokeStyle = alpha(pal.ink3, 0.8);
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (!n.satelliteOf) continue;
    const hi = v.indexOf(n.satelliteOf);
    if (hi === undefined) continue;
    const x = cam.sx(Math.max(v.X0[i], v.X0[hi])) + 14;
    const y0 = cam.sy(v.nodes[hi].lane);
    const y1 = cam.sy(n.lane);
    ctx.beginPath();
    ctx.moveTo(x - 1.5, y0);
    ctx.lineTo(x - 1.5, y1);
    ctx.moveTo(x + 1.5, y0);
    ctx.lineTo(x + 1.5, y1);
    ctx.stroke();
  }
}
