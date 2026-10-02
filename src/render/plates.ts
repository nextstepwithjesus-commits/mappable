/**
 * Союзы на небе «набор» — точки (решения владельца 67, 70, 76). Союз — брак или связь, от которой пошли дети, — стоит
 * на небе малым знаком между супругами: к нему сходятся линии от мужа и жены, от него расходятся линии к детям.
 * Прямоугольных картушей нет; кто в союзе и что в нём сказано, читатель узнаёт из подсказки (наведение) и из карточки
 * у точки (щелчок; src/ui/sky/DotCard.tsx).
 *
 *        Адам ●━━━━━━━╮                         ● Сиф
 *                     ╰──◆ ─────────────────────╯      линия к ребёнку — цветом его ветви (branches.ts), 1,5 px,
 *                     ╭──╯╲──────────── ● Авель       мягкое свечение; от мужа и жены — скобки тоном следа
 *         Ева ◉━━━━━━━╯    ╲──────────── ● Каин
 *
 * Знак — ромбик 8 px (у касаний 9 px). Почему ромб: все знаки лиц в атласе круглые (диск, диск в кольце, пунктирное
 * скопление, восьмилучевая звезда, ТЗ § 5.4), а двойное кольцо спутали бы со знаком женщины; ромб той же величины, что
 * звезда 2–3-й величины, остаётся «точкой» звёздной карты и с первого взгляда не читается как лицо. В генеалогических
 * схемах ромб — привычный знак узла брака.
 *  — раскрыт (оба супруга и все дети на небе) — ромб залит; свёрнут — полый, справа мелко «+N» — сколько лиц союза
 *    ещё не на небе (как «+N» свёрнутых потомков);
 *  — выбранный (карточка союза открыта) — кольцо, как у выбранной звезды; наведённый — ярче и тонкое кольцо;
 *    с фокусом клавиатуры — кольцо фокуса;
 *  — подписи у точки нет: имена супругов и детей — в подсказке и в карточке у точки.
 *
 * Место (решение 76):
 *  — по высоте — между строками мужа и жены (посередине); если на небе один супруг (жена не названа или не раскрыта) —
 *    у его строки со стороны детей; если на небе только ребёнок (союз его родителей) — у строки ребёнка со стороны
 *    родителей;
 *  — по времени — через четверть пути от рождения младшего из супругов до рождения первого ребёнка: правее звёзд
 *    супругов и левее звезды первого ребёнка (dotTime); брак без детей — через четверть пути до конца более короткого
 *    следа;
 *  — точка не ложится на звёзды, ленты и другие точки и уходит с линий следов: сдвиг вдоль времени, затем чуть выше
 *    или ниже; подписи звёзд ставятся после точек и обходят их (общая проверка наложений, labels.ts, Placer).
 *
 * Линии рисуются под звёздами и подписями (sky.ts): скобки от супругов — плавные кривые Безье, выходящие из следа
 * и входящие в ромб слева; к детям — прямые, как отрезки созвездия. Цвет линии к ребёнку — цвет его ветви у родителя
 * (по союзам, если у родителя союзов с детьми два и больше, иначе по детям — решение 69); у выбранного лица и его рода —
 * цвет и свечение его ветвей (подсветка M4), предки — мягким белым светом, прочие гаснут вместе с небом. Связь иного
 * рода (по закону, по Луке, усыновление) — штрихом, по толкованию — редкими точками. Дети раскрытого союза не получают
 * прежних отводов от следа отца (trails.ts): связь не дублируется.
 *
 * drawUnionSample рисует образец — союз с линиями к трём детям и свёрнутый союз — на любом холсте (условные знаки,
 * src/ui/panels/Legend.tsx).
 */
import { byId, graph } from '../data/atlas.ts';
import type { ModelData } from '../data/atlas.ts';
import { branchesOf, membersOf, type Union } from '../engine/unions.ts';
import { unions as ALL_UNIONS } from '../ui/reveal.ts';
import { lowerFirst, nameCase } from '../ui/text/ru.ts';
import { alpha } from './color.ts';
import { branchColor, GlowBatch, glowLayers, type MapTheme } from './branches.ts';
import { branchKeysOf, branchOrTribeColor } from './light.ts';
import { drawGlyph, starRadius } from './glyphs.ts';
import { branchFrame } from './marks.ts';
import { commonBranch, nodeOnSky, unionAlpha } from './trails.ts';
import { mapFont, mapSize, T_MAP_S } from './type.ts';
import { cross, type Rect } from './rect.ts';
import { KIN_GOLD, LINK_YELLOW, UNION_COLORS } from './branches.ts';
import type { PlateGap } from './rows.ts';
import type { Pass, SkyContext } from './sky.ts';
import { JOIN_R, NODE_R_FAMILY, NODE_R_MAP, type LinkNode, type LinkPath, type NodeLook } from './links.ts';
import type { LinkDraw } from './trails.ts';
import { linkKeyString } from '../engine/linkkey.ts';

/** Союз на небе: что рисовать (src/ui/reveal.ts, plates — тот же вид). */
export interface PlateIn {
  union: Union;
  /** лицо, от которого союз показан */
  from: string;
  /** 'down' — союз лица (к детям), 'up' — союз его происхождения (к родителям) */
  dir: 'down' | 'up';
  /** раскрыт: оба супруга и все дети на небе */
  open: boolean;
}

/**
 * Точка союза в последнем кадре (px холста): прямоугольник вокруг ромба (и «+N»), по которому ловят щелчок и наведение
 * (src/ui/sky/input.ts, plateAt; на касании поле раздувается до 44 px) и клавиатура (starnav.ts); cx, cy — центр ромба:
 * к нему крепится карточка у точки (DotCard).
 */
export interface PlateHit extends Rect {
  uid: string;
  from: string;
  open: boolean;
  /** центр ромба */
  cx: number;
  cy: number;
  /** полуразмер ромба, px */
  r: number;
  /** лиц союза, которых ещё нет на небе («+N»; 0 — все на небе) */
  hidden: number;
  /** то же, что cx, cy (прежнее имя: точка, от которой шёл отвод картуша) */
  ax: number;
  ay: number;
}

/** Состояния точек в кадре: наведённая, с кольцом клавиатуры, открытая в листе карточки. */
export interface PlateMarks {
  hover?: string | null;
  focus?: string | null;
  selected?: string | null;
}

// ---------- текст ----------

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

/** Имя лица в названии союза: безымянное («Жена Лота») не первым словом — со строчной. */
function nameIn(id: string, first: boolean): string {
  const p = byId.get(id);
  if (!p) return id;
  return p.unnamed && !first ? lowerFirst(p.name) : p.name;
}

/**
 * Название союза (подсказка, карточка у точки, клавиатура) — имена супругов в именительном: «Авраам и Агарь». Второе
 * лицо не названо — «Сиф и его жена», «Мария и её муж» (решение 75). У союза происхождения иного рода с одним лицом
 * (усыновление, по Луке) — одно имя.
 */
export function plateNames(u: Union): string {
  if (u.a && u.b) return `${nameIn(u.a, true)} и ${nameIn(u.b, false)}`;
  const one = u.a ?? u.b;
  if (!one) return '';
  if (u.claim || !u.kids.length) return nameIn(one, true);
  // второй супруг не назван (решение 75): «Сиф и его жена», «Мария и её муж»
  const his = byId.get(one)?.sex === 'f' ? 'её' : 'его';
  return u.a ? `${nameIn(one, true)} и ${his} жена` : `${nameIn(one, true)} и ${his} муж`;
}

/** Вид связи словами данных. */
const KIND_WORD: Record<Union['kind'], string> = { wife: 'жена', concubine: 'наложница', parents: '' };
/** Вид утверждения о происхождении детей (Union.claim). */
const CLAIM_WORD: Record<string, string> = {
  legal: 'по закону',
  'by-luke': 'по Луке',
  adoptive: 'усыновление',
  levirate: 'по закону ужичества',
  alternative: 'по другому месту Писания',
};
/** Помета уровня достоверности (П-4). */
const CERT_MARK: Record<string, string> = { inference: 'выв.', interpretation: 'толк.' };
const marked = (s: string, cert: string) => (CERT_MARK[cert] ? `${s}, ${CERT_MARK[cert]}` : s);

/** Дети союза со склонением: «сын», «6 сыновей», «2 сына и дочь», «детей не названо». */
export function kidsCount(u: Union): string {
  if (!u.kids.length) return 'детей не названо';
  const girls = u.kids.filter((k) => byId.get(k)?.sex === 'f').length;
  const boys = u.kids.length - girls;
  const s = boys === 1 ? 'сын' : boys ? `${boys} ${plural(boys, 'сын', 'сына', 'сыновей')}` : '';
  const d = girls === 1 ? 'дочь' : girls ? `${girls} ${plural(girls, 'дочь', 'дочери', 'дочерей')}` : '';
  return [s, d].filter(Boolean).join(' и ');
}

/**
 * Вид союза одной строкой (карточка у точки, объявление): вид связи словами данных («жена», «наложница»), вид
 * происхождения детей («по закону», «по Луке», «усыновление») с пометой «толк.» или «выв.», и дети со склонением:
 * «наложница; 6 сыновей», «жена; по закону; сын».
 */
export function plateSub(u: Union): string {
  if (u.claim === 'ancestor') {
    const n = u.kids.length;
    return marked(n === 1 ? 'потомок, названный без промежуточных звеньев' : `потомки, названные без промежуточных звеньев: ${n}`, u.kidsCert);
  }
  const kind = KIND_WORD[u.kind] ? marked(KIND_WORD[u.kind], u.cert) : '';
  const cw = u.claim ? (CLAIM_WORD[u.claim] ?? 'по иному указанию') : '';
  const claimed = cw ? marked(cw, u.kidsCert) : '';
  const kids = cw ? kidsCount(u) : marked(kidsCount(u), u.kids.length ? u.kidsCert : 'scripture');
  return [kind, claimed, kids].filter(Boolean).join('; ');
}

/** Имена супругов в родительном падеже («Авраама и Агари») или null, если склонение ненадёжно (ru.ts, nameCase). */
export function unionGen(u: Union): string | null {
  const out: string[] = [];
  for (const id of [u.a, u.b]) {
    if (!id) continue;
    const p = byId.get(id);
    if (!p) return null;
    const g = nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt);
    if (!g) return null;
    out.push(g);
  }
  return out.length ? out.join(' и ') : null;
}

// ---------- место ----------

/** Полуразмер ромба союза, px: 4,5 — ромб 9 px (у касаний — 5). */
export const DOT_R = 4.5;
/** Поле точки в проверке наложений, px от центра: ромб и кольцо выбора; подписи отступают от ромба на столько. */
export const DOT_FIELD = 8;
/**
 * Точка у строки одного лица (супруг или ребёнок): отступ от строки, px — доля высоты строки в пределах. Не меньше
 * полувысоты подписи и поля точки: подписи справа и слева от звёзд этой строки точку не задевают.
 */
export const DOT_HANG = { k: 0.7, min: 19, max: 24 };
/** Точка не ближе стольких px к звезде супруга (справа) и к звезде ребёнка (слева). */
export const DOT_CLEAR = 9;
/**
 * Не ближе стольких px к звезде супруга, если до звезды ребёнка есть место (не дальше середины промежутка): при мелком
 * масштабе времени четверть пути — считаные пиксели, и скобки от супругов сливались бы со звездой.
 */
export const DOT_LEAD = 24;
/** Где по времени стоит точка: доля пути от рождения младшего супруга до рождения первого ребёнка. */
export const DOT_AT = 0.25;

/** Супруги союза, которые на небе (муж, затем жена); ребёнок союза супругом не считается. */
export function spousesShown(u: Union, shown: (id: string) => boolean): string[] {
  return [u.a, u.b].filter((x): x is string => !!x && !u.kids.includes(x) && shown(x));
}

/** Лица союза, которых нет на небе, — «+N» у свёрнутой точки (только лица с местом на небе). */
export function hiddenOf(u: Union, shown: (id: string) => boolean, has: (id: string) => boolean): number {
  return membersOf(u).filter((id) => has(id) && !shown(id)).length;
}

/** С какой стороны строки родителя на полосе lane дети союза: 1 — выше (к верху экрана), −1 — ниже. */
export function hangSide(u: Union, lane: number, laneOf: (id: string) => number | undefined): 1 | -1 {
  let s = 0;
  for (const k of u.kids) {
    const l = laneOf(k);
    if (l !== undefined) s += Math.sign(l - lane);
  }
  return s > 0 ? 1 : -1;
}

/** С какой стороны строки ребёнка (полоса lane) его родители: 1 — выше, −1 — ниже; поровну или неизвестно — выше. */
export function parentSide(u: Union, lane: number, laneOf: (id: string) => number | undefined): 1 | -1 {
  let s = 0;
  for (const p of [u.a, u.b]) {
    const l = p ? laneOf(p) : undefined;
    if (l !== undefined) s += l - lane;
  }
  return s < 0 ? -1 : 1;
}

/**
 * Места под точки союзов для сжатия строк неба «набор» (src/render/rows.ts, planSky). Точка между строками двух
 * супругов места не просит. Точке у строки одного супруга — PLATE_ROWS строки со стороны детей, точке у строки ребёнка
 * (родителей нет на небе) — со стороны родителей.
 */
export function plateGaps(plates: readonly PlateIn[], laneOf: (id: string) => number | undefined, shown: (id: string) => boolean): PlateGap[] {
  const out = new Map<string, PlateGap>();
  const put = (lane: number, dir: 1 | -1) => out.set(`${lane}${dir}`, { lane, dir });
  for (const pl of plates) {
    const u = pl.union;
    const sp = spousesShown(u, shown);
    if (sp.length >= 2) continue;
    if (sp.length === 1) {
      const lane = laneOf(sp[0]);
      if (lane !== undefined) put(lane, hangSide(u, lane, laneOf));
      continue;
    }
    const kid = u.kids.includes(pl.from) && shown(pl.from) ? pl.from : u.kids.find(shown);
    const lane = kid ? laneOf(kid) : undefined;
    if (lane !== undefined) put(lane, parentSide(u, lane, laneOf));
  }
  return [...out.values()];
}

/** Год рождения первого ребёнка союза (астр.; год знака на небе). */
export function firstBirth(model: ModelData, u: Union): number | null {
  let t = Infinity;
  for (const k of u.kids) {
    const n = model.nodeByPerson.get(k);
    if (n) t = Math.min(t, n.t0);
  }
  return Number.isFinite(t) ? t : null;
}

/**
 * Год точки союза (астр.): через четверть пути (DOT_AT) от рождения младшего из супругов до рождения первого ребёнка.
 * Брак без детей — через четверть пути до конца более короткого из следов (не дальше 60 лет); супругов нет в модели —
 * за 20 лет до первого ребёнка. Год точки — только место знака, не утверждение о годе брака.
 */
export function dotTime(model: ModelData, u: Union): number | null {
  const sp = [u.a, u.b].map((id) => (id ? model.nodeByPerson.get(id) : undefined)).filter((n) => !!n);
  const first = firstBirth(model, u);
  if (!sp.length) return first === null ? null : first - 20 * DOT_AT;
  const young = Math.max(...sp.map((n) => n!.t0));
  const end = first ?? Math.min(young + 60, ...sp.map((n) => Math.max(n!.t1, young + 4)));
  return young + DOT_AT * (end - young);
}

/** Отступ точки от строки одного лица, px. */
const hangPx = (ky: number) => Math.max(DOT_HANG.min, Math.min(DOT_HANG.max, ky * DOT_HANG.k));

/**
 * Точка между супругами (строки ya и yb, px) держится от их строк не ближе DOT_BAND строки (и не ближе поля точки
 * с запасом): так она не ложится на следы и подписи супругов. Строки ближе двух отступов — посередине.
 */
export const DOT_BAND = 0.55;
export function betweenBand(ya: number, yb: number, ky: number): [number, number] {
  const top = Math.min(ya, yb);
  const bottom = Math.max(ya, yb);
  const m = Math.max(DOT_FIELD + 6, ky * DOT_BAND);
  if (bottom - top <= 2 * m) return [(top + bottom) / 2, (top + bottom) / 2];
  return [top + m, bottom - m];
}
/**
 * Высота точки между супругами (решение 76): в полосе между их строками (band) — как можно ближе к строкам детей
 * (медиана по высоте). У малой семьи (Адам и Ева, трое сыновей между ними) это почти середина; у большой (Иаков и
 * Лия, чьи сыновья выше строки Иакова) точка встаёт у строки мужа, и линии к детям не пересекают всю семью.
 * Детей на небе нет — середина.
 */
export function betweenY(band: [number, number], kids: readonly number[]): number {
  const [a, b] = band;
  if (!kids.length || b - a < 0.5) return (a + b) / 2;
  const ys = [...kids].sort((p, q) => p - q);
  const n = ys.length;
  const mid = n % 2 ? ys[(n - 1) / 2] : (ys[n / 2 - 1] + ys[n / 2]) / 2;
  return Math.max(a, Math.min(b, mid));
}

// ---------- цвет линий к детям ----------

/** Ветвь ребёнка у родителя (решение 69): по союзам родителя, если их с детьми два и больше, иначе по детям. */
const schemes = new Map<string, Map<string, number>>();
function schemeOf(parent: string): Map<string, number> {
  let m = schemes.get(parent);
  if (!m) {
    m = new Map([...branchesOf(ALL_UNIONS, graph, parent, 1).desc].map(([k, b]) => [k, b.branch]));
    if (schemes.size > 512) schemes.clear();
    schemes.set(parent, m);
  }
  return m;
}
/** Номер ветви ребёнка kid в союзе u — у отца (или матери, если отец не назван); иное происхождение — по порядку детей. */
export function kidBranch(u: Union, kid: string): number {
  const parent = u.a ?? u.b;
  if (parent && !u.claim) {
    const b = schemeOf(parent).get(kid);
    if (b !== undefined) return b;
  }
  return Math.max(0, u.kids.indexOf(kid));
}
/** Цвет линии к ребёнку по ветви у родителя (#rrggbb): тот же, что у ветви при выборе этого родителя. */
export const kidColor = (u: Union, kid: string, theme: MapTheme): string => {
  const parent = u.a ?? u.b;
  const b = kidBranch(u, kid);
  // у Иакова и четырёх матерей — оттенок колена ветви (решение 183, «без перескока»)
  return parent ? branchOrTribeColor(parent, branchKeysOf(parent), b, theme) : branchColor(b, theme);
};
/** Начертание линии к ребёнку: иное происхождение (по закону, по Луке, усыновление) — штрих, по толкованию — точки. */
export function kidDash(u: Union): number[] {
  if (u.kidsCert === 'interpretation') return [1, 3.5];
  if (u.claim) return [5, 3];
  return [];
}

// ---------- кадр ----------

/** Яркость ромба союза относительно звезды (наведённый и выбранный — 1). */
export const DOT_TONE = 0.82;
/** Толщина линии к ребёнку и скобки от супруга, px. */
export const KID_LINE_W = 1.5;
export const SPOUSE_LINE_W = 1.2;

const countFont = (coarse: boolean) => mapFont(T_MAP_S, { sans: true, weight: 500, coarse });

/** Пересекаются ли отрезки (a–b) и (c–d) внутри (общий конец не считается). */
export function crossing(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(cx, cy, dx, dy, ax, ay);
  const d2 = o(cx, cy, dx, dy, bx, by);
  const d3 = o(ax, ay, bx, by, cx, cy);
  const d4 = o(ax, ay, bx, by, dx, dy);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** Точки союзов не ближе стольких px друг к другу, если есть место: ближе — штраф за каждый недостающий px. */
export const DOT_APART = 28;
/** Штраф места (x, y) за тесноту с уже поставленными точками. */
export function crowdCost(x: number, y: number, taken: readonly { x: number; y: number }[]): number {
  let c = 0;
  for (const q of taken) {
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < DOT_APART) c += (DOT_APART - d) * 2;
  }
  return c;
}

/**
 * Скобка от супруга (звезда s, её след до end) к ромбу d: кривая Безье выходит из следа и входит в левый угол ромба
 * горизонтально. Если начало скобки пришлось бы под подпись справа от звезды (s.lab — конец её места), скобка выходит
 * из самой звезды — вниз или вверх, к ромбу: из-под подписи линия читалась бы как её помета. Если на этом отвесном пути
 * стоят другие звёзды (blocked: жёны Иакова одна под другой — отвесы их скобок слились бы в одну черту через их звёзды),
 * скобка выходит из звезды косо, прямо к ромбу, и входит в него горизонтально. Ромб у самой звезды или левее — прямой
 * отрезок. Четыре точки кривой (у отрезка — две).
 */
export function bracketCurve(
  s: { x: number; y: number; r: number; end: number; lab?: number },
  d: { x: number; y: number; r: number },
  blocked?: (x: number, y0: number, y1: number) => boolean,
): number[] {
  const tip = d.x - d.r;
  const dy = d.y - s.y;
  const W = Math.max(12, Math.min(48, Math.abs(dy) * 0.9));
  let x0 = Math.max(s.x + s.r + 1.5, tip - W);
  // след не доходит до начала скобки (нет следа или он короче) — скобка выходит прямо от звезды
  if (s.end < x0 + 1) x0 = s.x + s.r + 1.5;
  const dir = Math.sign(dy) || 1;
  if (s.lab !== undefined && x0 < s.lab + 2 && tip > s.x + s.r + 4 && Math.abs(dy) > s.r + 4) {
    const y0 = s.y + dir * (s.r + 1.5);
    const y1 = s.y + dir * Math.max(s.r + 2, Math.abs(dy) * 0.8);
    if (blocked?.(s.x, Math.min(y0, d.y), Math.max(y0, d.y))) {
      const dx = tip - s.x;
      const l = Math.hypot(dx, dy) || 1;
      const ax = s.x + (dx / l) * (s.r + 1.5);
      const ay = s.y + (dy / l) * (s.r + 1.5);
      return [ax, ay, ax + (tip - ax) * 0.5, ay + (d.y - ay) * 0.5, tip - (tip - ax) * 0.3, d.y, tip, d.y];
    }
    return [s.x, y0, s.x, y1, s.x + (tip - s.x) * 0.35, d.y, tip, d.y];
  }
  if (tip <= x0 + 2) {
    const dx = d.x - s.x;
    const l = Math.hypot(dx, dy) || 1;
    return [s.x + (dx / l) * (s.r + 1.5), s.y + (dy / l) * (s.r + 1.5), d.x - (dx / l) * d.r, d.y - (dy / l) * d.r];
  }
  const m = (tip - x0) * 0.5;
  return [x0, s.y, x0 + m, s.y, tip - m, d.y, tip, d.y];
}
/** Нарисовать скобку от супруга к ромбу (bracketCurve) текущим цветом и толщиной. */
export function spouseBracket(
  ctx: CanvasRenderingContext2D,
  s: { x: number; y: number; r: number; end: number; lab?: number },
  d: { x: number; y: number; r: number },
  blocked?: (x: number, y0: number, y1: number) => boolean,
) {
  const c = bracketCurve(s, d, blocked);
  ctx.beginPath();
  ctx.moveTo(c[0], c[1]);
  if (c.length === 4) ctx.lineTo(c[2], c[3]);
  else ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
  ctx.stroke();
}

/** Отрезок от ромба (x0, y0) к звезде ребёнка (x1, y1) радиуса r: концы — у края ромба и у края звезды. */
function kidSegment(x0: number, y0: number, dr: number, x1: number, y1: number, r: number): [number, number, number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const a = Math.min(dr * 0.75 + 1, l / 2);
  const b = Math.min(r + 1.5, l / 2);
  return [x0 + (dx / l) * a, y0 + (dy / l) * a, x1 - (dx / l) * b, y1 - (dy / l) * b];
}

/** Ромб союза: заливка (раскрыт) или контур с подложкой цвета неба (свёрнут). */
export function paintDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, o: { open: boolean; color: string; halo: string; width?: number }) {
  const path = (h: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - h, y);
    ctx.closePath();
  };
  ctx.save();
  ctx.setLineDash([]);
  // подложка цвета неба — ромб отделяется от линий, как звезда
  ctx.fillStyle = o.halo;
  path(r + 1.8);
  ctx.fill();
  path(r);
  if (o.open) {
    ctx.fillStyle = o.color;
    ctx.fill();
  } else {
    ctx.lineWidth = o.width ?? 1.3;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = o.color;
    // контур внутри ромба: полый знак той же величины, что залитый
    path(r - (o.width ?? 1.3) / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Вид знака союза: двухцветный (синяя половина — муж, розовая — жена) или цветом своих линий (решение 87). */
export interface UnionLook {
  open: boolean;
  /** подложка цвета неба */
  halo: string;
  theme: MapTheme;
  /** непрозрачность знака */
  a: number;
  /** цвет линий союза (#rrggbb): ветвь выбранного, жёлтый выбранной связи, золотистый семьи; null — двухцветный знак */
  color?: string | null;
  /** тонкая обводка, отделяющая цветной ромб от неба (днём — тёмная); null — без неё */
  edge?: string | null;
  /**
   * вид союза (решение 174; links.ts, NodeLook): половина не названного лица — полая ('no-mother' — жены, 'no-father' —
   * мужа); брак в Писании не назван ('none') — обе половины полые. Нет — обе залиты
   */
  look?: NodeLook | null;
}

/**
 * Знак союза (этап 12, решение 87): ромб на подложке цвета неба. Без выделения — двухцветный: левая половина синяя (муж),
 * правая розовая (жена); сразу отличим от круглой звезды лица и не читается цветом ветви или ленты (у тех цвет один).
 * С цветными линиями — залит их цветом (ветвь выбранного, жёлтый выбранной связи, золотистый семьи лица) с тонкой
 * обводкой. Раскрыт — залит; свёрнут — полый контур той же величины (цвета — те же, половинами).
 */
export function paintUnion(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, o: UnionLook) {
  const path = (h: number, half: 0 | -1 | 1 = 0, closed = o.open) => {
    ctx.beginPath();
    if (half === 0) {
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x - h, y);
      ctx.closePath();
    } else {
      // половина ромба: от верхней вершины через боковую к нижней
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + half * h, y);
      ctx.lineTo(x, y + h);
      if (closed) ctx.closePath();
    }
  };
  const a = Math.max(0, Math.min(1, o.a));
  const U = UNION_COLORS[o.theme];
  // полые половины (решение 174): лицо не названо — его половина; брак не назван — обе
  const hollowH = o.look === 'none' || o.look === 'no-father';
  const hollowW = o.look === 'none' || o.look === 'no-mother';
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = o.halo;
  path(r + 1.8);
  ctx.fill();
  const w = 1.3;
  ctx.lineJoin = 'miter';
  /** половина: залитая или полая (контур с внутренней диагональю) */
  const half = (side: -1 | 1, color: string, hollow: boolean) => {
    if (hollow) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      path(r - w / 2, side, true);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      path(r, side, true);
      ctx.fill();
    }
  };
  if (o.color) {
    const c = alpha(o.color, a);
    if (o.open && !hollowH && !hollowW) {
      ctx.fillStyle = c;
      path(r);
      ctx.fill();
      if (o.edge) {
        ctx.strokeStyle = alpha(o.edge, a);
        ctx.lineWidth = 0.8;
        path(r);
        ctx.stroke();
      }
    } else if (o.open) {
      half(-1, c, hollowH);
      half(1, c, hollowW);
    } else {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      path(r - w / 2);
      ctx.stroke();
    }
  } else if (o.open && !hollowH && !hollowW) {
    // двухцветный: розовая заливка целиком и синяя левая половина поверх — шва между половинами нет
    ctx.fillStyle = alpha(U.wife, a);
    path(r);
    ctx.fill();
    ctx.fillStyle = alpha(U.husband, a);
    path(r, -1);
    ctx.fill();
  } else if (o.open) {
    half(-1, alpha(U.husband, a), hollowH);
    half(1, alpha(U.wife, a), hollowW);
  } else {
    ctx.lineWidth = w;
    ctx.strokeStyle = alpha(U.husband, a);
    path(r - w / 2, -1);
    ctx.stroke();
    ctx.strokeStyle = alpha(U.wife, a);
    path(r - w / 2, 1);
    ctx.stroke();
  }
  ctx.restore();
}

/** «+N» свёрнутого союза справа от ромба: малый гротеск, с ореолом цвета неба. */
function paintCount(ctx: CanvasRenderingContext2D, pal: { ink2: string; halo: string }, coarse: boolean, x: number, y: number, text: string, color: string) {
  ctx.font = countFont(coarse);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const base = y + mapSize(T_MAP_S, coarse) * 0.34;
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, base);
  ctx.fillStyle = color;
  ctx.fillText(text, x, base);
}

// ---------- образец для «Условных знаков» ----------

/** Палитра образца: тема (glow — ночь), небо, текст. */
export interface UnionSamplePalette {
  glow: boolean;
  sky: string;
  ink: string;
  ink2: string;
}

/**
 * Образец союза для условных знаков (src/ui/panels/Legend.tsx): слева — раскрытый союз, как на небе: муж и жена
 * со следами, скобки от них к залитому ромбу и три линии к трём детям цветами их ветвей со свечением; справа — лицо
 * со свёрнутым союзом: полый ромб у его строки со стороны детей и «+4». Те же функции, что на небе (paintDot,
 * spouseBracket, drawGlyph). Сигнатура — как у образцов легенды: (ctx, pal, w, h), пиксели CSS. Возвращает центры
 * ромбов — раскрытого и свёрнутого.
 */
export function drawUnionSample(ctx: CanvasRenderingContext2D, pal: UnionSamplePalette, w: number, h: number): { open: { x: number; y: number }; closed: { x: number; y: number } } {
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  const px = (x: number) => Math.round(x) + 0.5;
  const R = DOT_R;
  const split = Math.min(w - 120, Math.max(200, w * 0.64));
  // раскрытый союз: муж сверху, жена снизу, дети между ними и правее
  const top = px(10);
  const bottom = px(h - 10);
  const husband = { x: px(14), y: top, r: starRadius(3), end: split - 24 };
  const wife = { x: px(22), y: bottom, r: starRadius(3) + 2.2, end: split * 0.62 };
  const dot = { x: px(husband.x + (split - husband.x) * 0.3), y: px((top + bottom) / 2) };
  // дети — между строками супругов, не на их строках: следы не сливаются
  const kids = [0.24, 0.53, 0.82].map((f, k) => ({ x: px(dot.x + 64 + k * 26), y: px(top + (bottom - top) * f), b: k }));
  const trail = (x0: number, y: number, x1: number) => {
    ctx.strokeStyle = alpha(pal.ink2, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  };
  ctx.save();
  ctx.setLineDash([]);
  trail(husband.x, husband.y, husband.end);
  trail(wife.x, wife.y, wife.end);
  for (const k of kids) trail(k.x, k.y, Math.min(split - 8, k.x + 40));
  ctx.strokeStyle = alpha(pal.ink2, 0.62);
  ctx.lineWidth = SPOUSE_LINE_W;
  spouseBracket(ctx, husband, { x: dot.x, y: dot.y, r: R });
  spouseBracket(ctx, wife, { x: dot.x, y: dot.y, r: R });
  const glow = new GlowBatch(glowLayers('branch', theme));
  const segs = kids.map((k) => ({ seg: kidSegment(dot.x, dot.y, R, k.x, k.y, starRadius(4)), color: branchColor(k.b, theme) }));
  for (const q of segs) glow.add(q.color, 1, ...q.seg);
  glow.flush(ctx, pal.glow);
  ctx.lineWidth = KID_LINE_W;
  ctx.lineCap = 'round';
  for (const q of segs) {
    ctx.strokeStyle = q.color;
    ctx.beginPath();
    ctx.moveTo(q.seg[0], q.seg[1]);
    ctx.lineTo(q.seg[2], q.seg[3]);
    ctx.stroke();
  }
  paintDot(ctx, dot.x, dot.y, R, { open: true, color: pal.ink2, halo: pal.sky });
  const star = (x: number, y: number, magnitude: number, sex: 'm' | 'f' = 'm') => drawGlyph(ctx, x, y, { sex, kind: 'person', magnitude, color: pal.ink, halo: pal.sky });
  star(husband.x, husband.y, 3);
  star(wife.x, wife.y, 3, 'f');
  for (const k of kids) star(k.x, k.y, 4);
  // свёрнутый союз: лицо и полый ромб у его строки со стороны детей, «+4»
  const one = { x: px(split + 18), y: px(h * 0.3), r: starRadius(3), end: w - 8 };
  trail(one.x, one.y, one.end);
  const closed = { x: px(one.x + Math.min(40, (w - one.x) * 0.35)), y: px(one.y + hangPx(h / 2.5)) };
  ctx.strokeStyle = alpha(pal.ink2, 0.62);
  ctx.lineWidth = SPOUSE_LINE_W;
  spouseBracket(ctx, one, { x: closed.x, y: closed.y, r: R });
  paintDot(ctx, closed.x, closed.y, R, { open: false, color: pal.ink2, halo: pal.sky });
  paintCount(ctx, { ink2: pal.ink2, halo: pal.sky }, false, closed.x + R + 4, closed.y, '+4', pal.ink2);
  star(one.x, one.y, 3);
  ctx.restore();
  return { open: dot, closed };
}

// ---------- узлы союзов кадра (этап 11, § 2; геометрия — src/render/links.ts) ----------

/** «+N» свёрнутого союза в последнем кадре (px холста): отдельная цель, не меньше 24 × 24 (на касании — 44 × 44). */
export type CountHit = Rect & { uid: string; from: string; open: boolean };

/** Поле цели не меньше min × min вокруг середины прямоугольника. */
function atLeast(r: Rect, min: number): Rect {
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}

/** Узел • следующего гнезда: кружок 4 px на подложке цвета неба. */
export function paintJoin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, halo: string) {
  ctx.save();
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, JOIN_R + 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, JOIN_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Узлы союзов кадра (§ 2, «Знаки»): ◆ — 9 px в раскрытом небе, 7 px на «всех лицах»; залит — дети показаны, полый с «+N» —
 * свёрнут; выбранный (карточка союза) — в кольце; наведённый — ярче и в тонком кольце; с фокусом клавиатуры — кольцо
 * фокуса. Знак двухцветный (синяя половина — муж, розовая — жена), а с цветными линиями — их цвета (этап 12, решение 87;
 * paintUnion, nodeLook). • — узел следующего гнезда того же союза. Рисуются над лентами и под звёздами: ленты проходят через ромб, как
 * через пересадочную станцию (§ 3). Возвращает поля попадания ромбов (не меньше 24 × 24) и «+N» (отдельная цель).
 */
/**
 * Цвет ромба союза в кадре (этап 12, решение 87): ромб берёт цвет своих линий.
 *  — союз выбранной связи — жёлтый (его рисует marks.ts, drawSelectedLink, поверх жёлтого пути);
 *  — линии союза цвета ветви выбранного (дети — потомки выбранного одной ветви) — тот же цвет той же яркости;
 *  — союз лица под указателем или выбранного (его браки и союз его родителей: семья, чьи дуги родства — золотистые) —
 *    золотистый;
 *  — иначе — двухцветный знак союза с яркостью его лиц.
 * a — непрозрачность знака; edge — тонкая обводка цветного ромба (днём — тёмная, ночью её заменяет подложка неба).
 */
export function nodeLook(v: SkyContext, p: Pass, n: Pick<LinkNode, 'union' | 'owner' | 'from'>, hot: boolean): { color: string | null; a: number; edge: string | null } {
  const theme: MapTheme = v.pal.glow ? 'night' : 'day';
  const edge = theme === 'day' ? alpha(v.pal.ink, 0.75) : null;
  const intro = p.s.intro;
  const k = p.s.link;
  if (k && (k.kind === 'child' || k.kind === 'union' || k.kind === 'spouse') && k.union === n.union) return { color: LINK_YELLOW[theme], a: intro, edge };
  const u = ALL_UNIONS.byId.get(n.union);
  const bf = branchFrame(v, p);
  if (u && bf.map) {
    const kids = u.kids.filter((id) => {
      const i = v.indexOf(id);
      return i !== undefined && v.drawn(i);
    });
    const c = commonBranch(bf, p, kids);
    if (c) return { color: c.color, a: hot ? 1 : c.a, edge };
  }
  const focus = [p.s.hovered, p.s.selected];
  if (u && focus.some((id) => !!id && (u.a === id || u.b === id || u.kids.includes(id)))) return { color: KIN_GOLD[theme], a: intro, edge };
  const e = hot ? 1 : DOT_TONE * Math.max(p.emph(n.owner), p.emph(n.from));
  return { color: null, a: Math.min(1, e * intro), edge: null };
}

export function drawLinkNodes(v: SkyContext, p: Pass, d: LinkDraw, marks: PlateMarks = {}, settle = 1): { plates: PlateHit[]; counts: CountHit[] } {
  const { ctx, cam, pal } = v;
  const plates: PlateHit[] = [];
  const counts: CountHit[] = [];
  const R = d.frame.layout === 'family' ? NODE_R_FAMILY : NODE_R_MAP;
  // поле ромба и «+N» — не меньше 24 × 24; на касании input.ts раздувает его до 44 × 44 (plateAt, countAt; Я31)
  const least = 24;
  const intro = p.s.intro;
  const g0 = ctx.globalAlpha;
  const size = mapSize(T_MAP_S, v.coarse);
  const state = (n: LinkNode) => {
    const ks = linkKeyString(n.key) ?? '';
    const hover = marks.hover === n.union || d.hover === ks || d.preview.has(ks);
    const sel = marks.selected === n.union;
    // видимость ромба — как у его линий по ярусу (решение 135): выделенный союз — в полную силу
    const ua = unionAlpha(v, p, d, n.union);
    const lit = hover || sel || marks.focus === n.union || d.lit({ ends: [n.owner, n.from] } as LinkPath) || ua.tier === 0;
    // на обзоре (подробность кадра ниже 1) структурные связи видны без ромбов: знаки союзов проявляются с подробностью,
    // как прежде, — иначе они отнимали бы места у имён звёзд (решения 25, 135)
    return { hover, sel, lit, a: Math.min(ua.a, d.alpha) };
  };
  // на мелком масштабе ромбы соседних семей сходятся: знак, чьё место занято уже нарисованным ромбом, не рисуется
  // (семантическое увеличение, ТЗ § 3.1) — выделенные и наведённые первыми
  const map = d.frame.layout === 'map';
  // «все лица» теснее поколения в 18 px: ромбов нет (семья — сгусток; знаки только закрывали бы друг друга и имена)
  if (map && v.genRoom < 0.5) return { plates, counts };
  const inView: { n: LinkNode; x: number; y: number; st: ReturnType<typeof state> }[] = [];
  // вид нарисованных ромбов — для проверок приёмки (canvas[data-union-looks]): «союз:цвет или two:непрозрачность»
  const looks: string[] = [];
  for (const n of d.frame.nodes) {
    const x = n.x + d.dx;
    const y = n.y + d.dy;
    // под рамкой листа (линейка годов сверху, буквы полос слева) узла не видно: ни знака, ни цели, ни места в замере
    if (x < v.letterW || x > cam.w + 12 || y < v.openTop || y > cam.vp.b) continue;
    // узел союза, чьи связи рисуют только ленты, — станция их маршрута: пока ленты — сплайн обзора, его нет (§ 3)
    if (d.frame.ribbonOnly?.has(n.union) && v.routeFactor < 0.5) continue;
    // пока имена семьи не видны — ромбы только у выбранного и наведённого (решение 170, V-2)
    if (!nodeOnSky(v, p, d, n.union)) continue;
    inView.push({ n, x, y, st: state(n) });
  }
  // и в семейной укладке, когда поколения теснее 24 px (показ, вписанный в узкое небо со строками ниже, J1): ромбы
  // союзов Давида сходятся в одну точку, ромбы соседних следов — друг на друга; хватает одного знака.
  // На масштабе чтения ромбы не сходятся (links.ts: соседние — через 2r + 2 px), и каждый союз — со своим знаком (Я7)
  const crowd = map || v.genRoom < 1;
  if (crowd) inView.sort((a, b) => Number(b.st.lit) - Number(a.st.lit));
  const taken: Rect[] = [];
  for (const { n, x, y, st } of inView) {
    const { hover, sel, lit } = st;
    const a0 = lit ? 1 : st.a;
    if (a0 <= 0.01) continue;
    const own = { x: x - R - 0.5, y: y - R - 0.5, w: 2 * R + 1, h: 2 * R + 1 };
    // знак целиком в открытом небе: у кромки рамки ромб не срезается — его нет
    if (own.x < v.letterW || own.x + own.w > cam.w || own.y < v.openTop || own.y + own.h > cam.vp.b) continue;
    // под указателем у края («← Давид») ромба не видно: его нет
    if (p.wayEdges?.some((e) => cross(e, own))) continue;
    if (crowd) {
      if (taken.some((t) => cross(t, own))) continue;
      taken.push(own);
    }
    const e = hover || sel ? 1 : DOT_TONE * Math.max(p.emph(n.owner), p.emph(n.from));
    const color = alpha(pal.ink, Math.min(1, e * intro));
    const look = nodeLook(v, p, n, hover || sel);
    ctx.globalAlpha = g0 * a0 * settle;
    if (n.kind === 'join') {
      // узел следующего гнезда — тоном линий: цветом союза, если его линии цветные
      paintJoin(ctx, x, y, look.color ? alpha(look.color, look.a) : color, pal.sky);
      continue;
    }
    paintUnion(ctx, x, y, R, { open: n.open, halo: pal.sky, theme: v.pal.glow ? 'night' : 'day', a: look.a, color: look.color, edge: look.edge, look: n.look });
    looks.push(`${n.union}:${look.color ?? 'two'}:${(Math.round(look.a * a0 * settle * 100) / 100).toFixed(2)}`);
    let count: CountHit | null = null;
    if (n.count) {
      ctx.font = countFont(v.coarse);
      const w = ctx.measureText(n.count).width;
      const tx = x + R + 4;
      paintCount(ctx, pal, v.coarse, tx, y, n.count, color);
      count = { ...atLeast({ x: tx - 2, y: y - size * 0.7, w: w + 4, h: size * 1.4 }, least), uid: n.union, from: n.from, open: n.open };
      counts.push(count);
    }
    ctx.save();
    ctx.setLineDash([]);
    const ring = (r: number, w: number, c: string) => {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (sel) ring(R + 3.5, 1.5, pal.focus);
    else if (hover) ring(R + 3, 1, pal.ink);
    if (marks.focus === n.union) ring(R + (sel ? 6.5 : 5), 2, pal.focus);
    ctx.restore();
    // поле ромба — не меньше 24 × 24 (на касании 44 × 44), но не на «+N»: у него своя цель
    let box = atLeast({ x: x - R - 2, y: y - R - 2, w: 2 * R + 4, h: 2 * R + 4 }, least);
    // у свёрнутого — поле ромба левее «+N», той же ширины (не меньше 24 px): цели не накладываются
    if (count && box.x + box.w > count.x) box = { ...box, x: count.x - box.w };
    const hidden = n.count ? Number(n.count.replace(/\D/g, '')) || 0 : 0;
    plates.push({ ...box, uid: n.union, from: n.from, open: n.open, cx: x, cy: y, r: R, hidden, ax: x, ay: y });
    // место ромба и «+N» — в общей проверке наложений: подписи их не закрывают; в замере — знаком союза (kind 'plate')
    const dot = { x: x - R - 1.5, y: y - R - 1.5, w: 2 * R + 3, h: 2 * R + 3 };
    p.placer.add(dot);
    // в замере — сам знак (ромб r с полупикселем сглаживания): соседние ромбы одного следа стоят через 2r + 2 px (links.ts,
    // в самой тесной семье — через 2r + 1) и не накладываются
    v.ledger.add('plate', '', own, n.union);
    if (count) p.placer.add({ x: x + R + 2, y: y - size * 0.6, w: count.w - (count.x - (x + R + 2)) - 2, h: size * 1.2 });
  }
  ctx.globalAlpha = g0;
  const ds = (ctx.canvas as { dataset?: DOMStringMap } | undefined)?.dataset;
  if (ds) {
    const t = looks.join(';');
    if (ds.unionLooks !== t) ds.unionLooks = t;
  }
  return { plates, counts };
}

// ---------- образцы знаков грамматики связей («Условные знаки»; Q3 пишет подписи) ----------

/** Знак грамматики связей для образца: ◆, •, ствол с зубцами, разрыв, обрывок, лента в узле, выбранная связь. */
export type LinkSign = 'node' | 'join' | 'trunk' | 'cut' | 'stub' | 'ribbon' | 'selected';

/** Палитра образца знаков связей: тема (glow — ночь), небо, текст, ленты. */
export interface LinkSamplePalette extends UnionSamplePalette {
  gold1?: string;
  azure1?: string;
}

/** Жёлтый выбранной связи (§ 8, § 9; K1 § 2.7): ночью — линия со свечением, днём — маркер под линией --ink. */
export { LINK_YELLOW };

/**
 * Образец знака грамматики связей (src/ui/panels/Legend.tsx): те же рисовальщики и размеры, что на небе. Сигнатура — как
 * у образцов легенды: (ctx, pal, w, h), пиксели CSS; sign — какой знак.
 */
export function drawLinkSample(ctx: CanvasRenderingContext2D, pal: LinkSamplePalette, w: number, h: number, sign: LinkSign) {
  const px = (x: number) => Math.round(x) + 0.5;
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  const tone = alpha(pal.ink2, 0.72);
  const trailTone = alpha(pal.ink2, 0.6);
  const star = (x: number, y: number, magnitude: number, sex: 'm' | 'f' = 'm') => drawGlyph(ctx, x, y, { sex, kind: 'person', magnitude, color: pal.ink, halo: pal.sky });
  const line = (pts: number[], color: string, width = 1, dash: number[] = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
    ctx.stroke();
    ctx.restore();
  };
  const top = px(h * 0.28);
  const mid = px(h * 0.5);
  const low = px(h * 0.78);
  ctx.save();
  ctx.lineCap = 'butt';
  switch (sign) {
    case 'node': {
      // залитый ромб (дети показаны) и полый с «+N» (свёрнут): на следе матери
      line([px(8), mid, px(w * 0.46), mid], trailTone, 1.2);
      paintUnion(ctx, px(w * 0.24), mid, NODE_R_FAMILY, { open: true, halo: pal.sky, theme, a: 1 });
      line([px(w * 0.56), mid, px(w - 6), mid], trailTone, 1.2);
      paintUnion(ctx, px(w * 0.68), mid, NODE_R_FAMILY, { open: false, halo: pal.sky, theme, a: 1 });
      paintCount(ctx, { ink2: pal.ink2, halo: pal.sky }, false, px(w * 0.68) + NODE_R_FAMILY + 4, mid, '+4', pal.ink);
      break;
    }
    case 'join': {
      // два гнезда одного союза на одном следе: ◆ у первого ствола, • у второго
      const x1 = px(w * 0.3);
      const x2 = px(w * 0.66);
      line([px(8), top, px(w - 6), top], trailTone, 1.2);
      line([x1, top, x1, low, x1 + 16, low], tone);
      line([x2, top, x2, low, x2 + 16, low], tone);
      paintUnion(ctx, x1, top, NODE_R_FAMILY, { open: true, halo: pal.sky, theme, a: 1 });
      paintJoin(ctx, x2, top, pal.ink, pal.sky);
      star(x1 + 20, low, 4);
      star(x2 + 20, low, 4);
      break;
    }
    case 'trunk': {
      // ствол от ромба на следе матери и зубцы к детям; «‖» — черта брака от следа мужа
      const x = px(w * 0.34);
      const hy = px(4);
      const my = px(h * 0.3);
      line([px(8), hy, px(w - 6), hy], trailTone, 1.2);
      line([px(14), my, px(w - 10), my], trailTone, 1.2);
      line([x - BAR_HALF, hy, x - BAR_HALF, my], tone);
      line([x + BAR_HALF, hy, x + BAR_HALF, my], tone);
      const kids = [h * 0.55, h * 0.72, h * 0.9].map(px);
      line([x, my, x, kids[kids.length - 1]], tone);
      kids.forEach((ky, k) => {
        line([x, ky, x + 12 + k * 8, ky], tone);
        star(x + 16 + k * 8, ky, 4);
      });
      paintUnion(ctx, x, my, NODE_R_FAMILY, { open: true, halo: pal.sky, theme, a: 1 });
      star(px(10), hy, 3);
      star(px(16), my, 3, 'f');
      break;
    }
    case 'cut': {
      // чужой след под стволом — разрыв по 3 px с каждой стороны, без узла
      const x = px(w * 0.5);
      line([px(8), mid, x - 3, mid], trailTone, 1.2);
      line([x + 3, mid, px(w - 6), mid], trailTone, 1.2);
      line([x, px(3), x, px(h - 3)], tone);
      break;
    }
    case 'stub': {
      // длинная связь обрывками по 16 px
      const x = px(w * 0.3);
      line([px(8), top, px(w - 6), top], trailTone, 1.2);
      line([x, top, x, top + 16], tone);
      paintUnion(ctx, x, top, NODE_R_MAP, { open: true, halo: pal.sky, theme, a: 1 });
      line([x, low - 12, x, low, x + 10, low], tone);
      star(x + 14, low, 4);
      break;
    }
    case 'ribbon': {
      // лента идёт по следу родителя до узла союза и ступенькой уходит к ребёнку; в узле ленты расходятся
      const x = px(w * 0.42);
      const g = pal.gold1 ?? (pal.glow ? '#E6B550' : '#9A6A12');
      const a = pal.azure1 ?? (pal.glow ? '#9CCBF5' : '#2B64A8');
      line([px(8), top, px(w - 6), top], trailTone, 1.2);
      line([px(10), top - 2, x - 8, top - 2], g, 2);
      line([px(10), top + 2, x - 8, top + 2], a, 2);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 8, top - 2);
      ctx.arcTo(x - 2, top - 2, x - 2, top + 8, 6);
      ctx.lineTo(x - 2, mid - 6);
      ctx.arcTo(x - 2, mid, x + 6, mid, 6);
      ctx.lineTo(px(w * 0.72), mid);
      ctx.stroke();
      ctx.strokeStyle = a;
      ctx.beginPath();
      ctx.moveTo(x - 8, top + 2);
      ctx.arcTo(x + 2, top + 2, x + 2, top + 12, 6);
      ctx.lineTo(x + 2, low - 6);
      ctx.arcTo(x + 2, low, x + 10, low, 6);
      ctx.lineTo(px(w * 0.8), low);
      ctx.stroke();
      ctx.restore();
      paintUnion(ctx, x, top, NODE_R_FAMILY, { open: true, halo: pal.sky, theme, a: 1 });
      star(px(w * 0.72) + 4, mid, 3);
      star(px(w * 0.8) + 4, low, 3);
      break;
    }
    case 'selected': {
      // выбранная связь целиком (решение 88): жёлтый путь от звезды отца по его следу через ромб союза к ребёнку, кольца на концах
      const x = px(w * 0.3);
      const pts = [px(10), top, x, top, x, low, px(w * 0.7), low];
      if (pal.glow) {
        line(pts, alpha(LINK_YELLOW.night, 0.18), 9);
        line(pts, alpha(LINK_YELLOW.night, 0.3), 5);
        line(pts, LINK_YELLOW.night, 2.5);
      } else {
        line(pts, alpha(LINK_YELLOW.day, 0.9), 9);
        line(pts, pal.ink, 2.2);
      }
      const ring = (cx: number, cy: number) => {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = pal.glow ? LINK_YELLOW.night : pal.ink;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      // ромб союза на пути — жёлтым (решение 87)
      paintUnion(ctx, x, top, NODE_R_FAMILY, { open: true, halo: pal.sky, theme, a: 1, color: LINK_YELLOW[theme], edge: pal.glow ? null : alpha(pal.ink, 0.75) });
      star(px(10), top, 3);
      star(px(w * 0.7) + 4, low, 4);
      ring(px(10), top);
      ring(px(w * 0.7) + 4, low);
      break;
    }
  }
  ctx.restore();
}
/** Полуразнос черт «‖» в образце (trails.ts, BAR_GAP). */
const BAR_HALF = 1.6;
