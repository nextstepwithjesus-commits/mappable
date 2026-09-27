/**
 * Отметки на небе: выделение рода (яркость лиц), кольца выбранного, второго лица, фокуса клавиатуры и наведённой звезды,
 * отметки одноимённых (E10), меридиан года с флажком (D13). Путь родства на небе пока выражен выделением (emphasis:
 * «path») и подписями шагов (labels.ts).
 */
import { alpha } from './color.ts';
import { DIM, LIKELY } from './dim.ts';
import { starRadius } from './glyphs.ts';
import { RULER_H, ROW_H } from './frame.ts';
import { mapFont, T_MAP_S } from './type.ts';
import { byId } from '../data/atlas.ts';
import type { Rect } from './rect.ts';
import type { Emphasis, Pass, SkyContext, SkyState } from './sky.ts';

/**
 * Яркость лица при выделении: без выделения — 1; выбранное, род, путь и «наверняка» живые — 1; «вероятно» живые —
 * LIKELY; остальное небо — DIM (src/render/dim.ts).
 */
export function emphasis(hl: Map<string, Emphasis> | null): (id: string) => number {
  return (id: string) => {
    if (!hl) return 1;
    const k = hl.get(id);
    return k === undefined ? DIM : k === 'likely' ? LIKELY : 1;
  };
}

/**
 * Кольца: выбранные — кольцо цвета фокуса; фокус клавиатуры — такое же кольцо, а у выбранной звезды — второе, снаружи;
 * наведённая звезда — тонкое кольцо (E11; IX-06); отмеченные одноимённые — сплошное кольцо (E10; UX-31: пунктир читался
 * как знак народа).
 */
export function drawRings(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const ring = (id: string, out: number, width = 2, color = pal.focus, gap?: number) => {
    const i = v.indexOf(id);
    if (i === undefined) return;
    const q = byId.get(id)!;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    const r = starRadius(q.magnitude, p.zoomScale) + (gap ?? (q.sex === 'f' ? 6.5 : 5)) + out;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  for (const id of [s.selected, s.second]) if (id) ring(id, 0);
  if (s.focus) ring(s.focus, s.focus === s.selected || s.focus === s.second ? 4 : 0);
  // наведённая звезда — тонкое кольцо: звезда отвечает на указатель
  if (s.hovered && s.hovered !== s.selected && s.hovered !== s.second && s.hovered !== s.focus) {
    const i = v.indexOf(s.hovered);
    if (i !== undefined && v.drawn(i)) ring(s.hovered, 0, 1, pal.ink, byId.get(s.hovered)!.sex === 'f' ? 6.2 : 4);
  }
  // отмеченные одноимённые
  for (const id of s.pins) {
    const i = v.indexOf(id);
    if (i === undefined || !v.drawn(i)) continue;
    ring(id, 0, 1.5, pal.ink, byId.get(id)!.sex === 'f' ? 8.5 : 7);
  }
}

/**
 * Меридиан года (D13; UX-27, IX-34, MAP-07, MAP-33): черта через ярусы и небо и флажок у линейки неба —
 * «990 г. до Р. Х.: живы 186, наверняка 41». Флажок — лист на служебной строке рамки, справа от черты, у правого края — слева.
 * Возвращает прямоугольник флажка (px холста) или null.
 */
export function drawMeridian(v: SkyContext, s: SkyState): Rect | null {
  if (s.meridian === null) return null;
  const { ctx, cam, pal } = v;
  const x = Math.round(cam.sx(v.xOf(s.meridian))) + 0.5;
  if (x < v.letterW || x > cam.w) return null;
  ctx.strokeStyle = alpha(pal.ink, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, RULER_H);
  ctx.lineTo(x, cam.h);
  ctx.stroke();
  const text = s.meridianLabel;
  if (!text) return null;
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const w = tw + 12;
  const h = ROW_H - 1;
  let bx = x + 1;
  if (bx + w > cam.w - 2) bx = x - w;
  bx = Math.max(v.letterW + 1, bx);
  const by = RULER_H;
  ctx.fillStyle = pal.sheet;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = pal.ruleStrong;
  ctx.strokeRect(Math.round(bx) + 0.5, by + 0.5, Math.round(w) - 1, h - 1);
  ctx.fillStyle = pal.ink;
  ctx.fillText(text, bx + 6, by + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  return { x: bx, y: by, w, h };
}
