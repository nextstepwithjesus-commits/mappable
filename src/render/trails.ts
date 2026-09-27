/**
 * Следы жизни и родство на небе (ТЗ § 3.1, «след жизни» и «связи»; A14, E4).
 *
 * След жизни честно показывает меру уверенности (A14; MAP-12, 13, 14):
 *  — смерть известна — сплошной след до неё; у оценочной даты конец — пунктиром до края интервала смерти;
 *  — известно только последнее упоминание — сплошной след до него и пунктир 10 px;
 *  — не известно ничего — только пунктир 10 px от звезды: условной длительности жизни на небе нет;
 *  — оценочное рождение — начало следа пунктиром до конца интервала рождения (bHi);
 *  — умерший младенцем, народ или род из таблицы народов, лицо скопления-списка — без следа (знаки — glyphs.ts).
 *
 * Семьи (E4; MAP-15, 16, 20, 22; UX-34):
 *  — дети одной пары «отец — мать», рождённые рядом, — под одной скобой: ствол от следа отца и короткие засечки
 *    к звёздам детей; скобы разных матерей одного отца сдвинуты на 4 px и различаются начертанием, у верха — «от Лии»;
 *  — при выделении рода: предки — сплошной линией 1,5 px, потомки — штрихом, братья и сёстры — своей степенью;
 *  — брак — короткий знак «‖» от следа мужа к жене в год первого ребёнка; к дальней жене — знак и тонкая выноска;
 *  — призрак жены в её роду — пунктирный отвод и подпись «Рахиль, жена Иакова».
 *
 * drawLifeTrail, drawDescent, drawBracket и drawMarriage рисуют одиночный знак на любом холсте без неба: ими
 * пользуются небо, образец #/specimen и «Как читать карту», чтобы знак в легенде был тем же, что на небе.
 */
import { alpha } from './color.ts';
import { byId, graph, type ModelData } from '../data/atlas.ts';
import type { DateClass } from '../engine/chronology.ts';
import { nameCase } from '../ui/text/ru.ts';
import { starRadius } from './glyphs.ts';
import { mapFont, mapSize, T_MAP_S } from './type.ts';
import { claim, textBox } from './labels.ts';
import type { Emphasis, Pass, SkyContext } from './sky.ts';

/** Пунктир неуверенного начала и конца следа. */
export const TRAIL_DOTS = [1.5, 3];
/** Пунктир после последнего упоминания, px (MAP-13). */
export const TAIL_PX = 10;

/** Одиночный след жизни в px холста. */
export interface LifeTrail {
  /** звезда: рождение (точечная оценка) */
  x0: number;
  /** конец следа: конец интервала смерти, либо сплошной конец + TAIL_PX, если смерть не известна */
  x1: number;
  y: number;
  /** класс датировки: эпохальный — короткий точечный след «время не установлено» */
  cls: DateClass;
  /** год смерти известен */
  known: boolean;
  /** где кончается сплошная часть: смерть, начало интервала смерти или последнее упоминание */
  solidTo: number;
  /** оценочное рождение: до этой x (bHi) начало следа — пунктиром; нет — сплошной от звезды */
  sureFrom?: number;
  color: string;
  width: number;
}

/**
 * След жизни: пунктир от звезды до sureFrom (оценочное рождение), сплошной до solidTo; дальше до x1 — пунктир,
 * если смерть не известна или дата оценочная. Эпохальная дата — точечный след не длиннее 60 px.
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
  const solidTo = Math.max(x0, t.solidTo);
  // оценочное рождение: начало следа до bHi — пунктиром (но не дальше засвидетельствованного)
  const from = Math.max(x0, Math.min(t.sureFrom ?? x0, solidTo));
  if (from > x0 + 0.5) {
    ctx.setLineDash(TRAIL_DOTS);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(from, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (solidTo > from + 0.5) {
    ctx.beginPath();
    ctx.moveTo(from, y);
    ctx.lineTo(solidTo, y);
    ctx.stroke();
  }
  if ((!t.known || t.cls === 'estimated') && x1 > solidTo + 0.5) {
    ctx.setLineDash(TRAIL_DOTS);
    ctx.beginPath();
    ctx.moveTo(solidTo, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * След узла i в px холста или null, если следа нет: призрак, народ или род, умерший младенцем, лицо скопления.
 * Концы берутся из данных раскладки (NodeRow.t1 — конец уверенной жизни, trail — вид следа) и хронологии
 * (bHi — конец интервала рождения, dHi — конец интервала смерти).
 */
export function trailOf(v: SkyContext, i: number, out: LifeTrail): LifeTrail | null {
  const n = v.nodes[i];
  if (n.ghost) return null;
  if (n.trail && n.trail !== 'life') return null;
  const q = byId.get(n.person);
  if (!q || q.kind === 'people' || q.kind === 'clan') return null;
  const c = v.model.chrono.get(n.person);
  if (!c || c.infant) return null;
  const { cam } = v;
  const x0 = cam.sx(v.X0[i]);
  const sure = Math.max(x0, cam.sx(v.X1[i]));
  const known = c.d !== null;
  const loose = c.cls === 'estimated' || c.cls === 'epochal';
  out.x0 = x0;
  out.y = Math.round(cam.sy(n.lane)) + 0.5;
  out.cls = c.cls;
  out.known = known;
  out.solidTo = sure;
  out.x1 = known ? (loose && c.dHi !== null && c.dHi > n.t1 ? Math.max(sure, cam.sx(v.xOf(c.dHi))) : sure) : sure + TAIL_PX;
  out.sureFrom = loose && c.bHi > n.t0 ? cam.sx(v.xOf(c.bHi)) : undefined;
  return out;
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

/** Знак разрыва (хронологическое напряжение) на вертикали x в высоте ym. */
function drawTension(ctx: CanvasRenderingContext2D, x: number, ym: number, color: string) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 4, ym + 1);
  ctx.lineTo(x + 4, ym - 3);
  ctx.moveTo(x - 4, ym + 4);
  ctx.lineTo(x + 4, ym);
  ctx.stroke();
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
  if (d.tension) drawTension(ctx, x, (y0 + y1) / 2, d.tension);
}

/** Начертания скоб разных матерей одного отца: сплошная, штрих, точки, штрих-пунктир (MAP-16). */
export const MOTHER_DASH: readonly number[][] = [[], [3, 2], [1, 2], [5, 2, 1, 2]];

/** Скоба пары «отец — мать»: ствол x от следа родителя y0 до дальнего ребёнка и засечки к звёздам детей. */
export interface Bracket {
  x: number;
  y0: number;
  kids: { x: number; y: number }[];
  color: string;
  /** начертание скобы этой матери (MOTHER_DASH) */
  dash?: readonly number[];
  /** узелок матери на стволе */
  mother?: { y: number; color: string };
}

/** Скоба: ствол и засечки. Толщину линии задаёт вызывающий. */
export function drawBracket(ctx: CanvasRenderingContext2D, b: Bracket) {
  let lo = b.y0;
  let hi = b.y0;
  for (const k of b.kids) {
    lo = Math.min(lo, k.y);
    hi = Math.max(hi, k.y);
  }
  ctx.strokeStyle = b.color;
  if (b.dash?.length) ctx.setLineDash(b.dash as number[]);
  ctx.beginPath();
  ctx.moveTo(b.x, lo);
  ctx.lineTo(b.x, hi);
  for (const k of b.kids) {
    if (Math.abs(k.x - b.x) < 0.75) continue;
    ctx.moveTo(b.x, k.y);
    ctx.lineTo(k.x, k.y);
  }
  ctx.stroke();
  if (b.dash?.length) ctx.setLineDash([]);
  if (b.mother) {
    ctx.fillStyle = b.mother.color;
    ctx.fillRect(b.x - 1.5, b.mother.y - 1.5, 3, 3);
  }
}

/** Брак: от следа мужа (yH) к жене (yW) в x — знак «‖»; к дальней жене — знак 8 px и тонкая выноска (MAP-22). */
export interface Marriage {
  x: number;
  yH: number;
  yW: number;
  color: string;
  /** до какой высоты от следа мужа рисуется двойная черта: ближе — вся, дальше — 8 px и выноска */
  near: number;
}

export function drawMarriage(ctx: CanvasRenderingContext2D, m: Marriage) {
  const dir = Math.sign(m.yW - m.yH) || 1;
  const far = Math.abs(m.yW - m.yH) > m.near;
  const yS = far ? m.yH + dir * 8 : m.yW;
  ctx.strokeStyle = m.color;
  ctx.beginPath();
  ctx.moveTo(m.x - 1.5, m.yH);
  ctx.lineTo(m.x - 1.5, yS);
  ctx.moveTo(m.x + 1.5, m.yH);
  ctx.lineTo(m.x + 1.5, yS);
  ctx.stroke();
  if (far) {
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(m.x, yS);
    ctx.lineTo(m.x, m.yW);
    ctx.stroke();
    ctx.setLineDash([]);
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
    if (!trailOf(v, i, t)) continue;
    const n = v.nodes[i];
    const q = byId.get(n.person)!;
    const e = p.emph(n.person) * intro;
    const a = (ky < 5 ? 0.35 : 0.55) * e * (q.magnitude <= 2 ? 1.25 : 1);
    t.color = alpha(pal.ink2, Math.min(1, a));
    t.width = ky < 5 ? 1 : q.magnitude <= 1 ? 1.6 : 1.2;
    drawLifeTrail(ctx, t);
  }
}

/**
 * Следы лиц линий Мессии поверх лент (E6; MAP-28): тонкой линией цвета --ink 60 %, чтобы лента не закрывала,
 * сколько жил Авраам, Иаков, Давид. Рисуется после лент.
 */
export function drawSpineTrails(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  if (cam.ky < 5) return;
  const t: LifeTrail = { x0: 0, x1: 0, y: 0, cls: 'exact', known: true, solidTo: 0, color: '', width: 1 };
  ctx.lineCap = 'butt';
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (!p.spine.has(n.person) || !trailOf(v, i, t)) continue;
    t.color = alpha(pal.ink, 0.6 * p.emph(n.person) * p.s.intro);
    t.width = 1;
    drawLifeTrail(ctx, t);
  }
}

// ---------- семьи ----------

/** Вид связи родитель → ребёнок при выделении рода. */
export type LinkKind = 'base' | 'anc' | 'desc' | 'sib' | 'lit';

/**
 * Вид связи по степеням выделения родителя и ребёнка: предки — к выбранному лицу по восходящей, потомки — от него,
 * братья и сёстры — от общего родителя-предка; остальные выделенные (путь, группа) — «lit».
 */
export function linkKind(kp: Emphasis | undefined, kc: Emphasis | undefined): LinkKind {
  if (kp === undefined || kc === undefined) return 'base';
  if (kp === 'anc' && (kc === 'anc' || kc === 'self')) return 'anc';
  if ((kp === 'self' || kp === 'desc') && kc === 'desc') return 'desc';
  if (kp === 'anc' && kc === 'sib') return 'sib';
  if (kp === 'sure' || kp === 'likely' || kc === 'sure' || kc === 'likely') return 'base';
  return 'lit';
}

/** Начертание связи при выделении (MAP-20): предки сплошные 1,5 px, потомки штрихом [4, 3], братья и сёстры — 1 px. */
export const LINK_STYLE: Record<Exclude<LinkKind, 'base'>, { width: number; dash: number[] }> = {
  anc: { width: 1.5, dash: [] },
  desc: { width: 1.5, dash: [4, 3] },
  sib: { width: 1, dash: [] },
  lit: { width: 1, dash: [] },
};

/** Дети ближе этого по x (px) — под одной скобой; дальше — у каждого свой отвод. */
const MERGE_PX = 18;
/** С какой высоты полосы у скоб появляется помета матери «от Лии». */
const NOTE_KY = 14;

/** Подпись, которую небо ставит после подписей звёзд, если есть место: «от Лии», «Рахиль, жена Иакова». */
export interface FamilyNote {
  text: string;
  /** точка привязки: ствол скобы или звезда призрака */
  x: number;
  y: number;
  /** где ставить: у ствола скобы (вниз или вверх от следа отца) или справа от звезды */
  at: 'down' | 'up' | 'star';
  /** радиус звезды (для at = 'star') */
  r?: number;
}

type Kid = { i: number; x: number; y: number; id: string };
type Group = { parent: string; mother: string | null; y0: number; kids: Kid[] };

/** Год первого общего ребёнка пары (для знака брака): по модели и паре «муж|жена». */
const firstChildCache = new WeakMap<ModelData, Map<string, number | null>>();
function firstChild(m: ModelData, husband: string, wife: string): number | null {
  let c = firstChildCache.get(m);
  if (!c) firstChildCache.set(m, (c = new Map()));
  const key = `${husband}|${wife}`;
  if (c.has(key)) return c.get(key)!;
  let best: number | null = null;
  for (const e of graph.childrenOf.get(wife) ?? []) {
    if (e.kind !== 'mother') continue;
    if (byId.get(e.child)?.father !== husband) continue;
    const b = m.chrono.get(e.child)?.b;
    if (b !== undefined && (best === null || b < best)) best = b;
  }
  c.set(key, best);
  return best;
}

/** «от Лии»: имя матери в родительном падеже; если склонение ненадёжно — пометы нет. */
export function motherNote(id: string): string | null {
  const q = byId.get(id);
  if (!q) return null;
  const g = nameCase(q.name, q.sex, 'gen', q.unnamed);
  return g ? `от ${g}` : null;
}

/** «Рахиль, жена Иакова»: подпись призрака жены; если склонение имени мужа ненадёжно — только имя. */
export function ghostNote(id: string, husband: string | null): string {
  const q = byId.get(id);
  if (!q) return id;
  const h = husband ? byId.get(husband) : undefined;
  const g = h ? nameCase(h.name, h.sex, 'gen', h.unnamed) : null;
  return g ? `${q.name}, ${q.sex === 'f' ? 'жена' : 'муж'} ${g}` : q.name;
}

/**
 * Связи родитель → ребёнок (слой «связи»; на обзоре их нет): скобы детей одной пары, отводы, узелки матерей,
 * знаки разрыва при напряжении, отводы к призракам; затем браки. Возвращает пометы матерей для drawFamilyNotes.
 */
export function drawDescents(v: SkyContext, p: Pass): FamilyNote[] {
  const { ctx, cam, pal } = v;
  const s = p.s;
  const L = s.layers;
  const hl = s.highlight;
  const intro = s.intro;
  const notes: FamilyNote[] = [];
  const d: Descent = { x: 0, y0: 0, y1: 0, color: '', ghost: false, mother: undefined, tension: undefined };
  ctx.lineWidth = 1;
  const groups = new Map<string, Group>();
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.parentLane === null || n.satelliteOf) continue;
    if (n.ghost && !L.ghosts) continue;
    // родитель скрыт рабочим набором или свёрткой (J4, J5): связь не рисуется — её конец висел бы в пустоте
    if (n.layoutParent && v.hides(n.layoutParent)) continue;
    const y0 = cam.sy(n.parentLane);
    const y1 = cam.sy(n.lane);
    const x = Math.round(cam.sx(v.X0[i])) + 0.5;
    if (n.ghost) {
      // призрак жены в её роду — пунктирный отвод
      const e = Math.min(p.emph(n.person), n.layoutParent ? p.emph(n.layoutParent) : 1) * intro;
      d.x = x;
      d.y0 = y0;
      d.y1 = y1;
      d.color = alpha(pal.ink3, 0.75 * e);
      d.ghost = true;
      d.mother = undefined;
      d.tension = undefined;
      drawDescent(ctx, d);
      continue;
    }
    const q = byId.get(n.person);
    const par = n.layoutParent ?? '';
    const other = !q ? null : par === q.father ? q.mother : par === q.mother ? q.father : q.mother;
    const key = `${par}|${other ?? ''}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { parent: par, mother: other && byId.get(other)?.sex === 'f' ? other : null, y0, kids: [] }));
    g.kids.push({ i, x, y: y1, id: n.person });
  }
  // матери одного отца — по первому ребёнку: их номер задаёт начертание скобы
  const byParent = new Map<string, Group[]>();
  for (const g of groups.values()) {
    g.kids.sort((a, b) => a.x - b.x);
    const a = byParent.get(g.parent);
    if (a) a.push(g);
    else byParent.set(g.parent, [g]);
  }
  const knot = { y: 0, color: '' };
  for (const [, gs] of byParent) {
    gs.sort((a, b) => a.kids[0].x - b.kids[0].x);
    const mothers = gs.filter((g) => g.mother).length;
    const trunks: { x: number; lo: number; hi: number }[] = [];
    gs.forEach((g, mi) => {
      const dash = mothers >= 2 ? MOTHER_DASH[mi % MOTHER_DASH.length] : MOTHER_DASH[0];
      // соседние по году рождения дети — под одной скобой
      const clusters: Kid[][] = [];
      for (const k of g.kids) {
        const last = clusters[clusters.length - 1];
        if (last && k.x - last[0].x <= MERGE_PX) last.push(k);
        else clusters.push([k]);
      }
      let noted = false;
      for (const cl of clusters) {
        let lo = g.y0;
        let hi = g.y0;
        for (const k of cl) {
          lo = Math.min(lo, k.y);
          hi = Math.max(hi, k.y);
        }
        // стволы скоб разных матерей не сливаются: сдвиг на 4 px
        let x = cl[0].x;
        while (trunks.some((t) => Math.abs(t.x - x) < 3.5 && t.lo < hi && lo < t.hi)) x -= 4;
        trunks.push({ x, lo, hi });
        const eP = g.parent ? p.emph(g.parent) : 1;
        const eBase = Math.min(eP, ...cl.map((k) => p.emph(k.id))) * intro;
        const color = alpha(pal.ink3, 0.75 * eBase);
        // узелок матери на стволе
        let mother: typeof knot | undefined;
        if (g.mother) {
          const mi2 = v.indexOf(g.mother);
          if (mi2 !== undefined && !v.hides(g.mother)) {
            const my = cam.sy(v.nodes[mi2].lane);
            if (my > lo + 1 && my < hi - 1 && my !== g.y0) {
              knot.y = my;
              knot.color = alpha(pal.ink2, 0.9 * eBase);
              mother = knot;
            }
          }
        }
        // выделенный род: связи к выделенным детям — своим начертанием (предки, потомки, братья), остальные — как обычно
        const kp = hl ? hl.get(g.parent) : undefined;
        const lit = hl ? cl.filter((k) => linkKind(kp, hl.get(k.id)) !== 'base') : [];
        const plain = lit.length ? cl.filter((k) => !lit.includes(k)) : cl;
        if (plain.length === 1 && Math.abs(x - plain[0].x) < 0.75) {
          d.x = x;
          d.y0 = g.y0;
          d.y1 = plain[0].y;
          d.color = color;
          d.ghost = false;
          d.mother = mother;
          d.tension = undefined;
          if (dash.length) ctx.setLineDash(dash);
          drawDescent(ctx, d);
          if (dash.length) ctx.setLineDash([]);
        } else if (plain.length) drawBracket(ctx, { x, y0: g.y0, kids: plain, color, dash, mother });
        for (const k of lit) {
          const st = LINK_STYLE[linkKind(kp, hl!.get(k.id)) as Exclude<LinkKind, 'base'>];
          ctx.lineWidth = st.width;
          drawBracket(ctx, { x, y0: g.y0, kids: [k], color: alpha(pal.ink2, Math.min(1, p.emph(k.id) * intro)), dash: st.dash, mother: plain.length ? undefined : mother });
          ctx.lineWidth = 1;
        }
        // хронологическое напряжение: знак разрыва на стволе
        if (L.tensions && s.tensionPersons.has(g.parent))
          for (const k of cl)
            if (s.tensionPersons.has(k.id)) drawTension(ctx, x, (g.y0 + k.y) / 2, alpha(pal.ink, 0.9 * Math.min(eP, p.emph(k.id)) * intro));
        // помета матери у верха скобы — когда у отца дети от разных матерей
        if (!noted && mothers >= 2 && g.mother && cam.ky >= NOTE_KY) {
          const text = motherNote(g.mother);
          if (text) notes.push({ text, x, y: g.y0, at: cl[0].y >= g.y0 ? 'down' : 'up' });
          noted = true;
        }
      }
    });
  }
  drawMarriages(v, p);
  // подписи призраков жён — на масштабе семьи
  if (L.ghosts && cam.ky >= 12)
    for (const i of p.vis) {
      const n = v.nodes[i];
      if (!n.ghost) continue;
      const ri = v.indexOf(n.person);
      const husband = (ri !== undefined ? v.nodes[ri].satelliteOf : null) ?? byId.get(n.person)?.spouses[0]?.id ?? null;
      const q = byId.get(n.person);
      if (!q) continue;
      notes.push({ text: ghostNote(n.person, husband), x: cam.sx(v.X0[i]), y: cam.sy(n.lane), at: 'star', r: starRadius(q.magnitude, p.zoomScale) });
    }
  return notes;
}

/**
 * Брак (MAP-22): знак «‖» от следа мужа к жене-спутнице в год первого общего ребёнка (или рядом со звездой жены,
 * если детей нет). Жена ближе трёх полос — знак во всю высоту; дальше — знак 8 px и тонкая выноска. Супруги
 * выбранного лица — ярко.
 */
function drawMarriages(v: SkyContext, p: Pass) {
  const { ctx, cam, pal } = v;
  const hl = p.s.highlight;
  const m: Marriage = { x: 0, yH: 0, yW: 0, color: '', near: cam.ky * 3.2 };
  ctx.lineWidth = 1;
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (!n.satelliteOf) continue;
    const hi = v.indexOf(n.satelliteOf);
    if (hi === undefined || v.hides(n.satelliteOf)) continue;
    const fc = firstChild(v.model, n.satelliteOf, n.person);
    const xw = cam.sx(v.X0[i]);
    const x = fc !== null ? cam.sx(v.xOf(fc)) - 6 : Math.max(xw, cam.sx(v.X0[hi])) + 12;
    m.x = Math.round(Math.max(x, xw + 6)) + 0.5;
    m.yH = cam.sy(v.nodes[hi].lane);
    m.yW = cam.sy(n.lane);
    const lit = !!hl && hl.has(n.person) && hl.has(n.satelliteOf);
    const e = Math.min(p.emph(n.person), p.emph(n.satelliteOf)) * p.s.intro;
    m.color = lit ? alpha(pal.ink, Math.min(1, e)) : alpha(pal.ink3, 0.8 * e);
    drawMarriage(ctx, m);
  }
}

/**
 * Пометы семей после подписей звёзд (E4): «от Лии» у верха скобы, «Рахиль, жена Иакова» у призрака.
 * Проходят ту же проверку наложений, что подписи звёзд (labels.ts, claim): ставятся только на свободное место
 * и попадают в замер подписей.
 */
export function drawFamilyNotes(v: SkyContext, p: Pass, notes: readonly FamilyNote[]) {
  if (!notes.length || !p.s.layers.labels) return;
  const { ctx, pal } = v;
  const size = mapSize(T_MAP_S, v.coarse);
  ctx.font = mapFont(T_MAP_S, { italic: true, coarse: v.coarse });
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const nt of notes) {
    const w = ctx.measureText(nt.text).width;
    const r = nt.r ?? 3;
    const cands: { tx: number; ty: number }[] = [];
    if (nt.at === 'star') cands.push({ tx: nt.x + r + 4, ty: nt.y + size * 0.35 }, { tx: nt.x - r - 4 - w, ty: nt.y + size * 0.35 }, { tx: nt.x - w / 2, ty: nt.y + r + size + 1 });
    else {
      // у верха скобы: сначала к детям (вниз или вверх от следа отца), затем в другую сторону; у ствола и чуть дальше по следу
      const below = { ty: nt.y + size + 1 };
      const above = { ty: nt.y - 4 };
      for (const side of nt.at === 'down' ? [below, above] : [above, below])
        for (const dx of [4, 16, 30]) cands.push({ tx: nt.x + dx, ty: side.ty }, { tx: nt.x - dx - w, ty: side.ty });
    }
    const boxes = cands.map((c) => textBox(c.tx, c.ty, w, size));
    const b = claim(v, p, boxes, 'note', nt.text);
    if (!b) continue;
    const c = cands[boxes.indexOf(b)];
    ctx.strokeStyle = pal.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(nt.text, c.tx, c.ty);
    ctx.fillStyle = pal.ink3;
    ctx.fillText(nt.text, c.tx, c.ty);
  }
  ctx.lineWidth = 1;
}
