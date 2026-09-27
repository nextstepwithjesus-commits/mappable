/**
 * Рамка неба (ТЗ § 3.1, «рамка листа»; C4; VIS-21, VIS-23, MAP-09, UX-09, UX-41) и то, что привязано к её шкалам:
 *  — линейка лет вверху, служебная строка под ней (видимые годы, эпоха в середине окна, местный масштаб, подписи черт
 *    «завершение канона» и «сегодня»), левая кромка с буквами полос;
 *  — на самом небе: сетка лет, черты завершения канона и «сегодня», пояснение на пустом небе после канона;
 *  — указатели у края на выбранных лиц за краем окна («→ Давид»);
 *  — атласная координата «41 К»: столбец — век от начала шкалы, строка — буква полосы.
 * Все функции читают небо через SkyContext и ничего в нём не меняют.
 */
import { alpha } from './color.ts';
import { hits, type Rect } from './rect.ts';
import { mapFont, T_MAP_S, T_NOTE, T_UI } from './type.ts';
import { T_END } from '../engine/timescale.ts';
import { toAstro, toHist } from '../engine/years.ts';
import { byId } from '../data/atlas.ts';
import type { SkyContext, SkyState } from './sky.ts';

/** Линейка лет вверху рамки. */
export const RULER_H = 26;
/** Служебная строка под линейкой: слева видимые годы и эпоха, справа масштаб (C4; VIS-21, MAP-09, UX-09). */
export const ROW_H = 18;
/** Верхнее поле рамки целиком: ниже него — открытое небо. */
export const FRAME_H = RULER_H + ROW_H;
/** Ширина левой кромки с буквами полос; на сенсорном экране шире — буквы там крупнее («Ж2» в 12,5 px). */
export const LETTER_W = 18;
export const LETTER_W_TOUCH = 22;
/** Полос в одной букве левой кромки. */
export const BAND = 12;
const LETTERS = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШЭЮЯ';

/** Буква полосы band (считая от верхней полосы данных): «А» … «Я», дальше «А2», «Б2»… */
export function bandLetter(band: number): string {
  return LETTERS[band % LETTERS.length] + (band >= LETTERS.length ? String(Math.floor(band / LETTERS.length) + 1) : '');
}

/** Атласная координата: столбец — век от начала шкалы, строка — буква полосы. */
export function atlasCoord(t: number, lane: number, laneMax: number): string {
  const col = Math.floor((toHist(t) + 4200) / 100) + 1;
  const band = Math.floor((laneMax - lane + 0.5) / BAND);
  return `${col} ${bandLetter(band)}`;
}

export interface YearTick {
  /** год, астрономический */
  t: number;
  major: boolean;
}

/** Риски линейки: круглые исторические годы с шагом не мельче 78 px, крупные — через пять шагов. */
export function yearTicks(v: SkyContext): YearTick[] {
  const cam = v.cam;
  const tL = v.tOf(cam.wx(v.letterW));
  const tR = v.tOf(cam.wx(cam.w));
  const tMid = v.tOf(cam.wx(cam.w / 2));
  const pxPerYear = (v.xOf(tMid + 1) - v.xOf(tMid)) * cam.kx;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  let step = steps[steps.length - 1];
  for (const s of steps)
    if (s * pxPerYear >= 78) {
      step = s;
      break;
    }
  const out: YearTick[] = [];
  // шаги по историческим годам, чтобы метки были круглыми («1000 до Р. Х.»)
  // до начала шкалы (сотворения) рисок нет: первая — не раньше него
  const t0 = Math.max(v.scale.knots[0], tL);
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

/** Черты завершения канона (Откр — ок. 95 г.) и «сегодня»: шкала неба тянется до 2040 г. */
const CANON = 95;
const today = () => new Date().getFullYear();

/**
 * Черты завершения канона и «сегодня» на небе; подписи к ним — в служебной строке рамки (drawFrame), не на данных
 * (C4; MAP-38). Время после канона пусто по существу: сказать об этом, а не оставлять тёмное поле — только на пустом месте.
 */
export function drawTimeMarks(v: SkyContext, reserve: Rect[] | undefined) {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const H = cam.h;
  for (const [t, dashed] of [[CANON, true], [today(), false]] as const) {
    const x = Math.round(cam.sx(v.xOf(t))) + 0.5;
    if (x < v.letterW || x > W) continue;
    ctx.strokeStyle = alpha(pal.ink3, 0.9);
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [3, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, FRAME_H);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const xc = Math.max(v.letterW + 40, cam.sx(v.xOf(110)));
  if (W - xc > 380) {
    const cx = (xc + W) / 2;
    ctx.font = mapFont(T_NOTE, { italic: true, coarse: v.coarse });
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
      v.ledger.add('note', l1, box);
    }
  }
}

/** Сетка лет на небе: при частых рисках — только крупные. */
export function drawGrid(v: SkyContext, ticks: YearTick[]) {
  const { ctx, cam, pal } = v;
  const H = cam.h;
  ctx.lineWidth = 1;
  ctx.strokeStyle = alpha(pal.rule, 0.4);
  ctx.beginPath();
  for (const t of ticks) {
    if (!t.major && ticks.length > 14) continue;
    const x = Math.round(cam.sx(v.xOf(t.t))) + 0.5;
    ctx.moveTo(x, FRAME_H);
    ctx.lineTo(x, H);
  }
  ctx.stroke();
}

/** Строка колонтитула: видимые годы и эпоха в середине окна (UX-09). */
export function headText(v: SkyContext): { years: string; epoch: string } {
  const cam = v.cam;
  const tL = v.tOf(cam.wx(v.letterW));
  const tR = v.tOf(cam.wx(cam.w));
  const tC = v.tOf(cam.wx((cam.vp.l + cam.vp.r) / 2));
  const ep = v.model.epochs.find((e) => tC >= toAstro(e.start) && tC < toAstro(e.end));
  const span = (a: number, b: number) => {
    const ha = Math.round(toHist(a));
    const hb = Math.round(toHist(b));
    if (ha < 0 && hb < 0) return `${-ha}–${-hb} гг. до Р. Х.`;
    if (ha > 0 && hb > 0) return `${ha}–${hb} гг. по Р. Х.`;
    return `${-ha} г. до Р. Х. — ${hb} г. по Р. Х.`;
  };
  // эпоха — только когда окно уже тысячи лет; на обзоре она ничего не называет
  return { years: `видно ${span(Math.max(v.scale.knots[0], tL), Math.min(T_END, tR))}`, epoch: ep && tR - tL < 1000 ? `эпоха в середине — «${ep.name}»` : '' };
}

/** Местный масштаб: «1 см ≈ 60 лет»; мельче года — «1 год ≈ 2 см» (IX-03). */
export function scaleText(v: SkyContext): string {
  const cam = v.cam;
  const tC = v.tOf(cam.wx((cam.vp.l + cam.vp.r) / 2));
  const pxPerYear = (v.xOf(tC + 1) - v.xOf(tC)) * cam.kx;
  if (!(pxPerYear > 0)) return '';
  const uneven = v.lambda > 0.5 ? ', масштаб неравномерный' : '';
  const raw = 37.8 / pxPerYear;
  if (raw < 0.75) {
    const cm = Math.round((pxPerYear / 37.8) * 2) / 2;
    return `1 год ≈ ${String(cm).replace('.', ',')} см${uneven}`;
  }
  const nice = raw >= 100 ? Math.round(raw / 50) * 50 : raw >= 10 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
  const word = nice % 10 === 1 && nice % 100 !== 11 ? 'год' : nice % 10 >= 2 && nice % 10 <= 4 && (nice % 100 < 12 || nice % 100 > 14) ? 'года' : 'лет';
  return `1 см ≈ ${nice} ${word}${uneven}`;
}

/**
 * Рамка листа (C4; VIS-21, VIS-23, MAP-09, UX-09, UX-41). Все поля непрозрачные, служебные надписи — только в них:
 *  — линейка лет: подписи не левее кромки, эра — у первой подписи каждой эры, мелкие риски теснее 6 px не рисуются;
 *  — служебная строка 18 px: слева видимые годы и эпоха в середине окна, справа масштаб, у своих черт — «завершение
 *    канона» и «сегодня», если не мешают;
 *  — угловое поле и левая кромка с буквами полос; буква не ближе 10 px к краям кромки.
 */
export function drawFrame(v: SkyContext, ticks: YearTick[]) {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const H = cam.h;
  const LW = v.letterW;
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
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.fillStyle = pal.ink3;
  ctx.strokeStyle = pal.ink3;
  ctx.textBaseline = 'middle';
  let lastX = -Infinity;
  let lastTick = -Infinity;
  let bcDone = false;
  let adDone = false;
  for (const tk of ticks) {
    const x = cam.sx(v.xOf(tk.t));
    if (x < LW + 4 || x > W - 4) continue;
    if (!tk.major && x - lastTick < 6) continue;
    lastTick = x;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, RULER_H - (tk.major ? 7 : 4));
    ctx.lineTo(Math.round(x) + 0.5, RULER_H);
    ctx.stroke();
    const h = toHist(tk.t);
    const era = h < 0 && !bcDone ? ' до Р. Х.' : h > 0 && !adDone ? ' по Р. Х.' : '';
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
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: v.coarse });
  ctx.fillStyle = pal.ink2;
  const { years, epoch } = headText(v);
  const left = LW + 8;
  let leftEnd = left;
  let rightStart = W - 8;
  const scale = scaleText(v);
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
  for (const [t, label] of [[CANON, 'завершение канона'], [today(), 'сегодня']] as const) {
    const x = cam.sx(v.xOf(t));
    const tw = ctx.measureText(label).width;
    if (x + 4 > leftEnd + 16 && x + 4 + tw < rightStart - 16) ctx.fillText(label, x + 4, rowY);
  }

  drawBandLetters(v);
  ctx.textBaseline = 'alphabetic';
}

/** Левая кромка: буквы полос. На «всём небе» полоса ниже 14 px: подписана каждая k-я, черты — не теснее 5 px. */
function drawBandLetters(v: SkyContext) {
  const { ctx, cam, pal } = v;
  const H = cam.h;
  const LW = v.letterW;
  const laneTopG = v.model.laneMax;
  ctx.font = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: v.coarse });
  ctx.fillStyle = pal.ink3;
  ctx.strokeStyle = alpha(pal.rule, 0.9);
  // иначе кромка — «штрихкод»
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
      const letter = bandLetter(band);
      const tw = ctx.measureText(letter).width;
      ctx.fillText(letter, Math.max(1, (LW - tw) / 2), ym);
    }
  }
}

/** Указатель у края: прямоугольник в px холста и лицо, к которому он ведёт. */
export interface EdgeHit extends Rect {
  id: string;
}

/**
 * Указатели на выбранных за краем экрана («→ Давид»): по щелчку — перелёт. Не заходят под органы неба (C4; MAP-37).
 * Возвращает их прямоугольники — для попадания указателем.
 */
export function drawWayfinding(v: SkyContext, s: SkyState): EdgeHit[] {
  const { ctx, cam, pal } = v;
  const W = cam.w;
  const top = v.openTop;
  const bottom = cam.vp.b;
  const out: EdgeHit[] = [];
  const placed: Rect[] = [];
  for (const id of [s.selected, s.second]) {
    if (!id) continue;
    const i = v.indexOf(id);
    if (i === undefined) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(v.nodes[i].lane);
    const inside = x > v.letterW && x < W && y > top && y < bottom;
    if (inside) continue;
    const name = byId.get(id)!.name;
    let arrow = '';
    if (y < top) arrow = '↑';
    else if (y > bottom) arrow = '↓';
    else if (x < v.letterW) arrow = '←';
    else arrow = '→';
    const label = `${arrow} ${name}`;
    ctx.font = mapFont(T_UI, { sans: true, weight: 500, coarse: v.coarse });
    const tw = ctx.measureText(label).width;
    let lx = Math.max(v.letterW + 6, Math.min(W - tw - 10, x - tw / 2));
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
      else lx = Math.max(v.letterW + 6, r.x - tw - 16);
    }
    const b = box();
    ctx.fillStyle = pal.sky;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = pal.ruleStrong;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1);
    ctx.fillStyle = pal.ink;
    ctx.fillText(label, lx, ly);
    out.push({ ...b, id });
    v.ledger.add('edge', label, b, id);
    placed.push(b);
  }
  return out;
}
