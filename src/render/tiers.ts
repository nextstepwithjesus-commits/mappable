/**
 * Режим «Эпохи» (ТЗ § 3.5; D14; UX-26, IX-27, IX-28, MAP-46, MAP-47, MAP-48, VIS-26): ярусы на том же полотне и в том же
 * масштабе времени — эпохи; судьи; цари Иудеи; цари Израиля; служения пророков; события. Промежуток жизни выбранного лица
 * проецируется столбцом через все ярусы.
 *
 * Как устроено:
 *  — ярусы стоят между рамкой и небом и сдвигают небо вниз: их нижний край — верхнее поле видимой части (SkyView);
 *  — в ярусе столько строк, сколько нужно отрезкам окна; пустой ярус свёрнут в строку 14 px с названием;
 *    раскладка (planTiers) считается, когда небо остановилось, а во время движения держится прежней: отрезки, которым
 *    в ней нет строки, рисуются тонкой чертой внизу яруса, пока небо не встанет;
 *  — отрезки залиты тоном листа, без рамки; оценочные (судьи, завоевание) — с пунктирной рамкой; совместные правления
 *    заштрихованы под 45°; подпись — внутри отрезка, иначе снаружи, если рядом свободно; события — риски с подписями
 *    курсивом в две строки лесенкой;
 *  — отрезки ловят указатель: подсказка (царь, годы, стих) и щелчок (лицо — выбрать, эпоха и событие — показать годы).
 *    Звёзды под ярусами указатель не достаёт (Sky.openTop).
 */
import { FRAME_H, type Rect, type Sky, type SkyState } from './sky.ts';
import { alpha } from './color.ts';
import { contrast } from '../ui/contrast.ts';
import { byId, persons, type ModelData } from '../data/atlas.ts';
import { toAstro } from '../engine/years.ts';
import { mapFont, mapSize, T_MAP_S, T_UI } from './type.ts';

export type TierKey = 'epochs' | 'judges' | 'judah' | 'israel' | 'prophets' | 'events';

export interface TierBar {
  /** ключ отрезка: уникален среди всех ярусов */
  key: string;
  kind: 'epoch' | 'person' | 'event';
  /** лицо, эпоха или событие */
  id: string;
  label: string;
  /** годы, астрономические */
  t0: number;
  t1: number;
  /** границы оценочные (судьи, завоевание): пунктирная рамка */
  soft: boolean;
  /** строка яруса при упаковке всех его отрезков: совместные правления — в соседних строках */
  row: number;
  /** правление: над кем и сколько лет по тексту; номер правления у лица (IdxPerson.reign) */
  over?: string;
  years?: number | null;
  reign?: number;
  /** событие: стихи */
  refs?: string[];
  /** годы совместного правления с другим царём того же яруса (штриховка) */
  shared: [number, number][];
}

export interface Tier {
  key: TierKey;
  name: string;
  bars: TierBar[];
}

// ---------- ярусы из данных ----------

/** Упаковка отрезков по строкам: отрезок — в первую строку, где предыдущий кончился до его начала. */
export function packRows<T extends { t0: number; t1: number; row: number }>(bars: T[]): T[] {
  const ends: number[] = [];
  for (const b of [...bars].sort((a, c) => a.t0 - c.t0 || c.t1 - a.t1)) {
    let r = ends.findIndex((e) => e <= b.t0);
    if (r < 0) r = ends.length;
    ends[r] = b.t1;
    b.row = r;
  }
  return bars;
}

/** Годы, в которые у отрезка есть соправитель в том же ярусе. */
function markShared(bars: TierBar[]) {
  for (const a of bars)
    for (const b of bars) {
      if (a === b) continue;
      const lo = Math.max(a.t0, b.t0);
      const hi = Math.min(a.t1, b.t1);
      if (hi - lo >= 0.5) a.shared.push([lo, hi]);
    }
}

let cache: { model: string; tiers: Tier[] } | null = null;

export function buildTiers(m: ModelData): Tier[] {
  if (cache && cache.model === m.id) return cache.tiers;
  const bar = (b: Omit<TierBar, 'row' | 'shared'>): TierBar => ({ ...b, row: 0, shared: [] });
  const ep = m.epochs.map((e) =>
    bar({ key: `ep:${e.id}`, kind: 'epoch', id: e.id, label: e.name, t0: toAstro(e.start), t1: toAstro(e.end), soft: e.id === 'judges' || e.id === 'conquest' }),
  );
  const judges: TierBar[] = [];
  const judah: TierBar[] = [];
  const israel: TierBar[] = [];
  const prophets: TierBar[] = [];
  for (const p of persons) {
    p.reign.forEach((r, k) => {
      const b = bar({
        key: `r:${p.id}:${k}`, kind: 'person', id: p.id, label: p.name, t0: toAstro(r.start), t1: Math.max(toAstro(r.end), toAstro(r.start) + 0.6), soft: false,
        over: r.over, years: r.years, reign: k,
      });
      if (/Иуд/.test(r.over)) judah.push(b);
      else if (/Израил/.test(r.over) && !p.roles.includes('judge')) israel.push(b);
    });
    if (p.roles.includes('judge') && p.active)
      judges.push(bar({ key: `j:${p.id}`, kind: 'person', id: p.id, label: p.name, t0: toAstro(p.active[0]), t1: Math.max(toAstro(p.active[1]), toAstro(p.active[0]) + 0.6), soft: true }));
    if (p.roles.includes('prophet') && p.active)
      prophets.push(bar({ key: `p:${p.id}`, kind: 'person', id: p.id, label: p.name, t0: toAstro(p.active[0]), t1: Math.max(toAstro(p.active[1]), toAstro(p.active[0]) + 0.6), soft: false }));
  }
  const events = m.epochs.flatMap((e) =>
    e.events.map((ev, i) => bar({ key: `ev:${e.id}:${i}`, kind: 'event', id: `${e.id}-${i}`, label: ev.text, t0: toAstro(ev.year), t1: toAstro(ev.year), soft: false, refs: ev.refs })),
  );
  for (const b of [...judah, ...israel]) b.shared = [];
  markShared(judah);
  markShared(israel);
  const tiers: Tier[] = [
    { key: 'epochs', name: 'Эпохи', bars: ep },
    { key: 'judges', name: 'Судьи', bars: packRows(judges) },
    { key: 'judah', name: 'Цари Иудеи', bars: packRows(judah) },
    { key: 'israel', name: 'Цари Израиля', bars: packRows(israel) },
    { key: 'prophets', name: 'Пророки', bars: packRows(prophets) },
    { key: 'events', name: 'События', bars: events },
  ];
  cache = { model: m.id, tiers };
  return tiers;
}

// ---------- раскладка по окну ----------

/** Ярусы начинаются под линейкой и служебной строкой рамки (C4), не закрывая их. */
export const TIER_TOP = FRAME_H + 4;
/** Строка яруса: отрезок 12 px и зазор 4 px (VIS-26). */
export const PITCH = 16;
export const BAR_H = 12;
/** Свёрнутый (пустой в этом окне) ярус — строка с названием (MAP-48). */
export const COLLAPSED_H = 14;
/** Ярус событий: риски и подписи в две строки лесенкой (MAP-46). */
export const EVENTS_H = 30;
/**
 * Мелкий масштаб (обзор, эпохи в тысячи лет): отрезки короче своих имён — строки по 5 px без подписей, имена — в подсказке.
 * Иначе на обзоре ярусы заняли бы 40 % неба (MAP-48).
 */
export const COMPACT_PITCH = 5;
/** Мелкий масштаб — когда 25 лет (обычное царствование) уже 30 px. */
export const compactAt = (pxPerYear: number) => pxPerYear * 25 < 30;
const TIER_GAP = 2;
const PAD = 4;

export interface TierBlock {
  tier: Tier;
  /** верх яруса, px холста */
  y: number;
  h: number;
  /** строки упаковки, у которых в окне есть отрезки, — сверху вниз */
  rows: number[];
  collapsed: boolean;
  /** шаг строк: PITCH или COMPACT_PITCH (мелкий масштаб, без подписей) */
  pitch: number;
}

export interface TierPlan {
  model: string;
  /** окно лет, по которому раскладка построена */
  t0: number;
  t1: number;
  blocks: TierBlock[];
  /** нижний край ярусов: ниже — открытое небо */
  bottom: number;
}

const visibleIn = (b: TierBar, t0: number, t1: number) => b.t1 >= t0 && b.t0 <= t1;

/**
 * Раскладка ярусов для окна лет [t0, t1]: высота каждого — по строкам его видимых отрезков; пустой — свёрнут.
 * compact — мелкий масштаб: строки по 5 px без подписей, события — риски без подписей (эпохи — как обычно).
 */
export function planTiers(tiers: Tier[], t0: number, t1: number, model = '', top = TIER_TOP, compact = false): TierPlan {
  let y = top;
  const blocks: TierBlock[] = [];
  for (const tier of tiers) {
    const vis = tier.bars.filter((b) => visibleIn(b, t0, t1));
    const rows = [...new Set(vis.map((b) => b.row))].sort((a, b) => a - b);
    const collapsed = rows.length === 0;
    const pitch = compact && tier.key !== 'epochs' ? COMPACT_PITCH : PITCH;
    const h = collapsed ? COLLAPSED_H : tier.key === 'events' ? (compact ? COLLAPSED_H : EVENTS_H) : Math.max(pitch === PITCH ? 0 : COLLAPSED_H, rows.length * pitch);
    blocks.push({ tier, y, h, rows, collapsed, pitch });
    y += h + TIER_GAP;
  }
  return { model, t0, t1, blocks, bottom: y - TIER_GAP + PAD };
}

let plan: TierPlan | null = null;

/** Окно лет видимой части неба с запасом 10 % по краям: малый сдвиг раскладку не меняет. */
function windowOf(sky: Sky): [number, number] {
  const cam = sky.cam;
  const a = sky.tOf(cam.wx(cam.vp.l));
  const b = sky.tOf(cam.wx(cam.vp.r));
  const m = (b - a) * 0.1;
  return [a - m, b + m];
}

/**
 * Разложить ярусы заново по окну неба. Зовёт SkyView: при включении ярусов, когда небо остановилось, при смене модели
 * и размера. Возвращает true, если сдвинулся нижний край ярусов (поле видимой части неба нужно обновить).
 */
export function replanTiers(sky: Sky, m: ModelData): boolean {
  const [a, b] = windowOf(sky);
  const vp = sky.cam.vp;
  const next = planTiers(buildTiers(m), a, b, m.id, TIER_TOP, compactAt(((vp.r - vp.l) * 1.2) / Math.max(1, b - a)));
  const was = plan?.bottom;
  plan = next;
  return next.bottom !== was;
}

/** Нижний край ярусов на холсте (раскладка — последняя; если её нет или сменилась модель — по текущему окну). */
export function tiersBottom(sky: Sky, m: ModelData): number {
  if (!plan || plan.model !== m.id) replanTiers(sky, m);
  return plan!.bottom;
}

/** Текущая раскладка — для проверок. */
export const currentPlan = () => plan;

// ---------- попадание ----------

export interface TierHit extends Rect {
  bar: TierBar;
  tier: TierKey;
}
let hitRects: TierHit[] = [];
/** Отрезок под наведённым указателем: его обводит кадр. */
export const tierHot = { key: null as string | null };

/** Отрезок яруса в точке (px холста) или null. */
export function tierAt(x: number, y: number): TierHit | null {
  let best: TierHit | null = null;
  for (const h of hitRects) {
    if (x < h.x || x > h.x + h.w || y < h.y || y > h.y + h.h) continue;
    // узкий отрезок поверх широкого: ловится тот, что короче (событие поверх эпохи не бывает — разные ярусы)
    if (!best || h.w < best.w) best = h;
  }
  return best;
}

// ---------- отрисовка ----------

/** Штриховка 45° в прямоугольнике: совместные правления (MAP-47, VIS-26). */
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  if (w <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = x - h; k < x + w; k += 5) {
    ctx.moveTo(k, y + h);
    ctx.lineTo(k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawTiers(sky: Sky, s: SkyState) {
  const { ctx, cam, pal } = sky;
  const W = cam.w;
  const LW = sky.letterW;
  const p = plan && plan.model === s.model.id ? plan : (replanTiers(sky, s.model), plan!);
  const bottom = p.bottom;
  hitRects = [];
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, FRAME_H, W, bottom - FRAME_H);
  // звёзды под ярусами закрыты: указатель и скрытый список их не достают (IX-28)
  sky.openTop = Math.max(sky.openTop, bottom);
  ctx.strokeStyle = pal.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, bottom + 0.5);
  ctx.lineTo(W, bottom + 0.5);
  ctx.stroke();

  const sel = s.selected ? s.model.chrono.get(s.selected) : null;
  const selP = s.selected ? byId.get(s.selected) : null;
  const tL = sky.tOf(cam.wx(0));
  const tR = sky.tOf(cam.wx(W));
  const fs = mapSize(T_MAP_S, sky.coarse);
  const nameFont = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: sky.coarse });
  const barFont = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: sky.coarse });
  const evFont = mapFont(T_MAP_S, { italic: true, coarse: sky.coarse });
  ctx.textBaseline = 'alphabetic';
  // тон отрезка — лист на ступень светлее неба (VIS-26); днём --sheet-2 почти сливается с небом — тогда тон линии
  const flat = contrast(pal.sheet2, pal.sky) < 1.3;
  const fill = flat ? pal.rule : pal.sheet2;
  const fillSel = flat ? pal.ruleStrong : pal.rule;

  for (const blk of p.blocks) {
    const { tier } = blk;
    // название яруса — на листе у левой кромки, отрезки уходят под него
    ctx.font = nameFont;
    const nameW = ctx.measureText(tier.name).width;
    const plate = { x: LW, w: nameW + 12 };
    const vis = tier.bars.filter((b) => visibleIn(b, tL, tR));
    const rowOf = new Map(blk.rows.map((r, i) => [r, i]));

    if (tier.key === 'events') {
      // риски событий; подписи — курсивом в две строки лесенкой, без наложений
      const lines = [-Infinity, -Infinity];
      for (const b of vis) {
        const x = Math.round(cam.sx(sky.xOf(b.t0))) + 0.5;
        if (x < LW + plate.w || x > W) continue;
        const inSel = sel ? b.t0 >= sel.bLo && b.t0 <= (sel.d ?? sel.dEst) : false;
        const hot = tierHot.key === b.key;
        ctx.strokeStyle = hot || inSel ? pal.ink : pal.ink3;
        ctx.lineWidth = hot ? 2 : 1;
        const y0 = blk.y + 1;
        const y1 = blk.collapsed ? blk.y + blk.h - 1 : blk.y + blk.h - 2;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
        const hit: TierHit = { x: x - 4, y: blk.y, w: 8, h: blk.h, bar: b, tier: tier.key };
        if (!blk.collapsed && blk.h >= EVENTS_H) {
          ctx.font = evFont;
          const tw = ctx.measureText(b.label).width;
          const k = x + 4 > lines[0] + 8 ? 0 : x + 4 > lines[1] + 8 ? 1 : -1;
          if (k >= 0 && x + 4 + tw < W - 4) {
            const by = blk.y + (k === 0 ? 11 : 25);
            ctx.fillStyle = hot || inSel ? pal.ink : pal.ink2;
            ctx.fillText(b.label, x + 4, by);
            lines[k] = x + 4 + tw;
            hit.w = tw + 12;
          }
        }
        hitRects.push(hit);
      }
    } else {
      // занятые участки строк: отрезки и подписи снаружи не ложатся друг на друга
      const occupied: [number, number][][] = blk.rows.map(() => []);
      const geo = vis.map((b) => {
        const x0 = cam.sx(sky.xOf(b.t0));
        const x1 = cam.sx(sky.xOf(b.t1));
        const di = rowOf.get(b.row);
        return { b, x0, x1, di };
      });
      for (const g of geo) if (g.di !== undefined) occupied[g.di].push([g.x0, g.x1]);
      for (const { b, x0, x1, di } of geo) {
        if (x1 < LW || x0 > W) continue;
        const inSel = sel ? b.t1 >= sel.bLo && b.t0 <= (sel.d ?? sel.dEst) : false;
        const hot = tierHot.key === b.key;
        const a = Math.max(LW, x0);
        const z = Math.min(W, x1);
        const wBar = Math.max(1.5, z - a);
        if (blk.collapsed || di === undefined) {
          // во время движения: отрезку нет строки в раскладке — тонкая черта внизу яруса
          ctx.fillStyle = hot ? pal.ink : pal.ruleStrong;
          ctx.fillRect(a, blk.y + blk.h - 4, wBar, 2);
          hitRects.push({ x: a, y: blk.y + blk.h - 7, w: Math.max(6, wBar), h: 7, bar: b, tier: tier.key });
          continue;
        }
        const compact = blk.pitch < PITCH;
        const bh = compact ? blk.pitch - 1 : BAR_H;
        const y = blk.y + di * blk.pitch + (compact ? 0 : 2);
        ctx.fillStyle = inSel || hot ? fillSel : fill;
        ctx.fillRect(a, y, wBar, bh);
        if (compact) {
          // мелкий масштаб: без подписей и штриховки; наведённый отрезок — цветом текста
          if (hot) {
            ctx.fillStyle = pal.ink;
            ctx.fillRect(a, y, wBar, bh);
          }
          hitRects.push({ x: a, y: y - 1, w: Math.max(6, wBar), h: bh + 2, bar: b, tier: tier.key });
          continue;
        }
        for (const [s0, s1] of b.shared) {
          const h0 = Math.max(a, cam.sx(sky.xOf(s0)));
          const h1 = Math.min(z, cam.sx(sky.xOf(s1)));
          hatch(ctx, h0, y, h1 - h0, bh, alpha(pal.ink3, 0.55));
        }
        if (b.soft) {
          ctx.strokeStyle = pal.ruleStrong;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(Math.round(a) + 0.5, y + 0.5, Math.max(1, Math.round(wBar) - 1), bh - 1);
          ctx.setLineDash([]);
        }
        if (hot) {
          ctx.strokeStyle = pal.ink;
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(a) + 0.5, y + 0.5, Math.max(1, Math.round(wBar) - 1), bh - 1);
        }
        hitRects.push({ x: a, y, w: Math.max(6, wBar), h: bh, bar: b, tier: tier.key });
        // подпись: внутри отрезка (прилипает к левому краю окна), иначе справа или слева, если там свободно
        ctx.font = barFont;
        const tw = ctx.measureText(b.label).width;
        const left = di === 0 ? LW + plate.w + 2 : LW + 4;
        const ix = Math.max(x0 + 4, Math.min(x1 - tw - 4, left));
        let lx: number | null = null;
        if (ix >= x0 + 3 && ix + tw <= x1 - 3 && ix >= left - 0.5) lx = ix;
        else {
          const free = (u0: number, u1: number) => u0 >= left && u1 <= W - 4 && !occupied[di].some(([o0, o1]) => u0 < o1 + 2 && o0 - 2 < u1);
          if (free(x1 + 4, x1 + 4 + tw)) lx = x1 + 4;
          else if (free(x0 - 4 - tw, x0 - 4)) lx = x0 - 4 - tw;
          if (lx !== null) occupied[di].push([lx, lx + tw]);
        }
        if (lx !== null) {
          // под подписью внутри отрезка — его тон без штриховки: имя читается и на совместном правлении
          if (lx >= x0 && lx + tw <= x1 && b.shared.length) {
            ctx.fillStyle = inSel || hot ? fillSel : fill;
            ctx.fillRect(lx - 2, y + 1, tw + 4, BAR_H - 2);
          }
          ctx.fillStyle = inSel || hot ? pal.ink : pal.ink2;
          ctx.fillText(b.label, lx, y + BAR_H - 2.5);
        }
      }
    }
    // табличка с названием — поверх отрезков первой строки
    ctx.fillStyle = pal.sky;
    ctx.fillRect(plate.x, blk.y, plate.w, Math.min(blk.h, blk.collapsed || blk.pitch < PITCH ? COLLAPSED_H : PITCH));
    ctx.font = nameFont;
    ctx.fillStyle = pal.ink3;
    ctx.fillText(tier.name, LW + 6, blk.y + Math.min(blk.h, PITCH) / 2 + fs * 0.36);
  }

  // проекция выбранного лица столбцом: сплошное ядро — надёжная часть, растушёванные края — неопределённость
  if (sel && selP) {
    const end = sel.d ?? sel.last ?? sel.b;
    const a = cam.sx(sky.xOf(sel.bLo));
    const b = cam.sx(sky.xOf(sel.bHi));
    const c = cam.sx(sky.xOf(end));
    const d = cam.sx(sky.xOf(sel.d ?? sel.dEst));
    const tone = (k: number) => alpha(pal.ink3, k);
    const top = TIER_TOP - 4;
    const g = ctx.createLinearGradient(a, 0, b, 0);
    g.addColorStop(0, tone(0));
    g.addColorStop(1, tone(0.16));
    ctx.fillStyle = g;
    ctx.fillRect(a, top, Math.max(1, b - a), cam.h);
    ctx.fillStyle = tone(0.16);
    ctx.fillRect(b, top, Math.max(1, c - b), cam.h);
    const g2 = ctx.createLinearGradient(c, 0, d, 0);
    g2.addColorStop(0, tone(0.16));
    g2.addColorStop(1, tone(0));
    ctx.fillStyle = g2;
    ctx.fillRect(c, top, Math.max(1, d - c), cam.h);
    ctx.strokeStyle = pal.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(b) + 0.5, top);
    ctx.lineTo(Math.round(b) + 0.5, cam.h);
    ctx.stroke();
    ctx.font = mapFont(T_UI, { italic: true, coarse: sky.coarse });
    ctx.fillStyle = pal.ink;
    if (b + 6 > LW && b + 6 < W - 40) ctx.fillText(selP.name, b + 6, bottom + 16);
  }
}
