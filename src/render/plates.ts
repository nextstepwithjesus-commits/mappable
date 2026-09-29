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
import { branchColor, GlowBatch, glowLayers, glows, type MapTheme } from './branches.ts';
import { drawGlyph, starRadius } from './glyphs.ts';
import { insideSky, Placer, spot as labelSpot } from './labels.ts';
import { branchFrame } from './marks.ts';
import { branchAlpha } from './trails.ts';
import { mapFont, mapSize, nameSize, T_MAP_S } from './type.ts';
import { cross, type Rect } from './rect.ts';
import { LINK_YELLOW } from './branches.ts';
import type { PlateGap } from './rows.ts';
import type { Pass, SkyContext } from './sky.ts';
import { JOIN_R, NODE_R_FAMILY, NODE_R_MAP, type LinkNode, type LinkPath } from './links.ts';
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
export const DOT_R_TOUCH = 5;
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

/** Лицо на небе: узел есть и нарисован в этом кадре. */
const shownIn = (v: Pick<SkyContext, 'indexOf' | 'drawn'>) => (id: string) => {
  const i = v.indexOf(id);
  return i !== undefined && v.drawn(i);
};

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

/**
 * Где союз на небе по раскладке (px холста), до проверки наложений: центр, пределы по времени (правее звёзд супругов,
 * левее звёзд детей) и вид места — между супругами, у строки одного супруга, у строки ребёнка.
 */
interface DotSpot {
  x: number;
  y: number;
  lo: number;
  hi: number;
  kind: 'between' | 'hang' | 'child';
  /** половина промежутка между строками супругов (для сдвига вверх и вниз) или отступ от строки */
  room: number;
  /** строка лица, у которой стоит точка (у точки между супругами — середина) */
  ref: number;
  /** у точки между супругами — где она может стоять по высоте: от строки одного супруга до строки другого с отступами */
  band?: [number, number];
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

function dotSpot(v: SkyContext, p: Pick<Pass, 'zoomScale'>, pl: PlateIn, shown: (id: string) => boolean): DotSpot | null {
  const { cam, model } = v;
  const u = pl.union;
  const t = dotTime(model, u);
  if (t === null) return null;
  const at = (id: string) => {
    const i = v.indexOf(id)!;
    const q = byId.get(id);
    return { x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane), r: starRadius(q?.magnitude ?? 6, p.zoomScale) + (q?.sex === 'f' ? 2.2 : 0), lane: v.nodes[i].lane };
  };
  const sp = spousesShown(u, shown).map(at);
  const kids = u.kids.filter(shown).map(at);
  const laneOf = (id: string) => model.nodeByPerson.get(id)?.lane;
  let lo = -Infinity;
  let hi = Infinity;
  for (const s of sp) lo = Math.max(lo, s.x + s.r + DOT_CLEAR);
  for (const k of kids) hi = Math.min(hi, k.x - k.r - DOT_CLEAR);
  const x0 = Math.max(cam.sx(v.xOf(t)), Math.min(lo + DOT_LEAD, (lo + (Number.isFinite(hi) ? hi : lo + 2 * DOT_LEAD)) / 2));
  const x = lo <= hi ? Math.max(lo, Math.min(hi, x0)) : (lo + hi) / 2;
  const hang = hangPx(cam.ky);
  if (sp.length >= 2) {
    const band = betweenBand(sp[0].y, sp[1].y, cam.ky);
    return { x, y: betweenY(band, kids.map((k) => k.y)), lo, hi, kind: 'between', room: Math.abs(sp[0].y - sp[1].y) / 2, ref: (sp[0].y + sp[1].y) / 2, band };
  }
  if (sp.length === 1) {
    const side = hangSide(u, sp[0].lane, laneOf);
    return { x, y: sp[0].y - side * hang, lo, hi, kind: 'hang', room: hang, ref: sp[0].y };
  }
  const kid = u.kids.includes(pl.from) && shown(pl.from) ? pl.from : u.kids.find(shown);
  if (!kid) return null;
  const k = at(kid);
  return { x, y: k.y - parentSide(u, k.lane, laneOf) * hang, lo, hi, kind: 'child', room: hang, ref: k.y };
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
export const kidColor = (u: Union, kid: string, theme: MapTheme): string => branchColor(kidBranch(u, kid), theme);
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

/** Точка союза в кадре: место, лица на небе и их звёзды (px холста). */
export interface UnionDot {
  pl: PlateIn;
  cx: number;
  cy: number;
  /** точка встала в открытое небо (иначе линии идут к её месту за краем, а ромба и попадания нет) */
  placed: boolean;
  box: Rect | null;
  hidden: number;
  /** яркость союза при выделении: по детям на небе, иначе по супругам */
  e: number;
  /** супруги на небе: звезда, конец следа и конец места подписи справа от звезды (lab), куда подпись встанет первой */
  spouses: { id: string; x: number; y: number; r: number; end: number; lab?: number }[];
  kids: { id: string; x: number; y: number; r: number; t0: number }[];
  r: number;
  count: string;
  countW: number;
  /**
   * где «+N» у ромба — там, где нет линий: справа (линий к детям нет), слева (нет скобок от супругов — союз родителей
   * лица) или под ромбом, дальше от строки лица (есть и те и другие)
   */
  countAt: 'r' | 'l' | 'v';
  /** сторона от строки лица, куда уходит «+N» под ромбом: 1 — вниз, −1 — вверх */
  away: 1 | -1;
}

/** Где точка стояла в прошлых кадрах (ключ сдвига): точка, которой хватает места там же, там и остаётся. */
const placedMemo = new WeakMap<object, Map<string, string>>();

/**
 * Лица, связь которых с родителями рисует точка союза (дети союзов на небе), и пары супругов с точкой: у них нет
 * прежних отводов, гребёнок и знаков брака (trails.ts). Считается до слоя связей.
 */
export function unionLinks(v: Pick<SkyContext, 'indexOf' | 'drawn'>, plates: readonly PlateIn[]): { kids: Set<string>; pairs: Set<string> } {
  const shown = shownIn(v);
  const kids = new Set<string>();
  const pairs = new Set<string>();
  for (const pl of plates) {
    const u = pl.union;
    for (const k of u.kids) if (shown(k)) kids.add(k);
    const sp = spousesShown(u, shown);
    if (sp.length === 2) pairs.add(`${sp[0]}|${sp[1]}`).add(`${sp[1]}|${sp[0]}`);
  }
  return { kids, pairs };
}

/**
 * Места точек союзов в кадре. Вызывается после следов и лент, до звёзд: точка обходит звёзды, ленты, резерв органов
 * неба и другие точки и уходит с линий следов; её поле занимает место в общей проверке наложений — подписи звёзд,
 * которые ставятся позже, её обходят. Раскрытые и открытая в листе карточки — первыми: им лучшие места.
 */
export function layoutUnionDots(v: SkyContext, p: Pass, plates: readonly PlateIn[], marks: PlateMarks = {}): UnionDot[] {
  const { ctx, cam } = v;
  const out: UnionDot[] = [];
  if (!plates.length) return out;
  let memo = placedMemo.get(v);
  if (!memo) placedMemo.set(v, (memo = new Map()));
  const shown = shownIn(v);
  const has = (id: string) => v.indexOf(id) !== undefined;
  // звёзды кадра — как их занимает небо перед подписями (sky.ts): точка их не закрывает
  const stars = new Placer();
  for (const i of p.vis) {
    if (p.starAlpha(i) <= 0.5 || !v.drawn(i)) continue;
    const q = byId.get(v.nodes[i].person);
    const r = starRadius(q?.magnitude ?? 6, p.zoomScale) + (q?.sex === 'f' ? 2.2 : 0) + 1.5;
    const k = q && (q.roles.includes('king') || q.roles.includes('queen')) ? 4 : 0;
    stars.add({ x: cam.sx(v.X0[i]) - r, y: cam.sy(v.nodes[i].lane) - r - k, w: 2 * r, h: 2 * r + k }, true);
  }
  // подписи ставятся после точек и обходят их; но место подписи справа у звезды — первое, куда она встанет, — точка
  // по возможности оставляет свободным: у выбранного, второго, наведённого лица и лица с фокусом (их подпись обязана
  // встать) — почти всегда, у остальных — если рядом есть другое место
  const s = p.s;
  const must = new Set([s.selected, s.second, s.hovered, s.focus].filter((x): x is string => !!x));
  v.labelCache.ensure(v);
  const nameW = v.labelCache.nameW;
  const siglaW = v.labelCache.siglaW;
  const names: { box: Rect; cost: number }[] = [];
  const nameEnd = new Map<string, number>();
  for (const i of p.vis) {
    const n = v.nodes[i];
    if (n.ghost || p.starAlpha(i) <= 0.5 || !v.drawn(i)) continue;
    const q = byId.get(n.person);
    if (!q) continue;
    const x = cam.sx(v.X0[i]);
    const y = cam.sy(n.lane);
    if (x < -200 || x > cam.w + 20 || y < v.openTop - 20 || y > cam.vp.b + 20) continue;
    const w = (nameW[i] > 0 ? nameW[i] : q.name.length * 8) + Math.max(0, siglaW[i] ?? 0) + (p.revealText?.has(q.id) || s.reveal?.has(q.id) ? 14 : 0);
    const king = q.roles.includes('king') || q.roles.includes('queen');
    const box = labelSpot('r', x, y, starRadius(q.magnitude, p.zoomScale), w, nameSize(q.magnitude, v.coarse), king).box;
    names.push({ box, cost: must.has(q.id) ? 300 : 22 });
    nameEnd.set(q.id, box.x + box.w);
  }
  const nameCost = (b: Rect, near: readonly { box: Rect; cost: number }[]) => {
    let c = 0;
    for (const nm of near) if (b.x < nm.box.x + nm.box.w && nm.box.x < b.x + b.w && b.y < nm.box.y + nm.box.h && nm.box.y < b.y + b.h) c += nm.cost;
    return c;
  };
  const R = v.coarse ? DOT_R_TOUCH : DOT_R;
  ctx.font = countFont(v.coarse);
  // точки, уже поставленные в этом кадре: следующая отходит от них (DOT_APART), чтобы пучки линий разных союзов
  // одного лица (Иаков и четыре жены) начинались из разных мест
  const taken: { x: number; y: number }[] = [];
  /** хорды скобок поставленных точек: от звезды супруга к ромбу */
  const chords: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  const rank = (pl: PlateIn) => (pl.union.id === marks.selected ? 0 : pl.open ? 1 : 2);
  const order = plates.map((pl, k) => ({ pl, k })).sort((a, b) => rank(a.pl) - rank(b.pl) || a.k - b.k);
  for (const { pl } of order) {
    const u = pl.union;
    const spot = dotSpot(v, p, pl, shown);
    if (!spot) continue;
    const at = (id: string) => {
      const i = v.indexOf(id)!;
      const q = byId.get(id);
      return { id, x: cam.sx(v.X0[i]), y: cam.sy(v.nodes[i].lane), r: starRadius(q?.magnitude ?? 6, p.zoomScale) + (q?.sex === 'f' ? 2.2 : 0), end: cam.sx(v.X1[i]), t0: v.nodes[i].t0 };
    };
    const spouses = spousesShown(u, shown).map((id) => ({ ...at(id), lab: nameEnd.get(id) }));
    const kids = u.kids.filter(shown).map(at);
    // союз целиком за краем окна — не рисуется
    const xs = [spot.x, ...spouses.map((s) => s.x), ...kids.map((k) => k.x)];
    const ys = [spot.y, ...spouses.map((s) => s.y), ...kids.map((k) => k.y)];
    if (Math.max(...xs) < -40 || Math.min(...xs) > cam.w + 40 || Math.max(...ys) < v.openTop - 40 || Math.min(...ys) > cam.vp.b + 40) continue;
    const hidden = pl.open ? 0 : hiddenOf(u, shown, has);
    const count = hidden ? `+${hidden}` : '';
    const countW = count ? ctx.measureText(count).width : 0;
    const e = !p.s.highlight ? 1 : kids.length ? Math.max(...kids.map((k) => p.emph(k.id))) : spouses.length ? Math.min(...spouses.map((s) => p.emph(s.id))) : 1;
    const countAt: UnionDot['countAt'] = !kids.length ? 'r' : !spouses.length ? 'l' : 'v';
    const dot: UnionDot = { pl, cx: spot.x, cy: spot.y, placed: false, box: null, hidden, e, spouses, kids, r: R, count, countW, countAt, away: 1 };
    const csize = mapSize(T_MAP_S, v.coarse);
    out.push(dot);
    // места: вдоль времени, затем чуть выше или ниже — у точки между супругами на треть свободного места от середины,
    // у точки у строки одного лица — дальше от строки
    // у точки между супругами — в полосе между их строками (band), на треть свободного места от своей высоты
    const band = spot.band ?? [spot.y, spot.y];
    const step = 0.35 * Math.max(0, spot.room - DOT_FIELD);
    const ups = spot.kind === 'between' ? [0, step, -step].map((d) => Math.max(band[0], Math.min(band[1], spot.y + d)) - spot.y) : [0, 6];
    const dxs = [0, 8, -8, 16, -16, 24, -24, 36, -36, 48, -48, 64, -64, 84, -84, 110, -110, 140];
    const cands: { x: number; y: number; key: string; score: number; box: Rect; away: 1 | -1 }[] = [];
    // места подписей у точки — в пределах сдвигов (кадр набора может нести сотни подписей)
    const near = names.filter((nm) => nm.box.x < spot.x + 200 && nm.box.x + nm.box.w > spot.x - 200 && nm.box.y < spot.y + 80 && nm.box.y + nm.box.h > spot.y - 80);
    ups.forEach((dy, vi) => {
      if (vi && ups.indexOf(dy) < vi) return;
      const sy = spot.kind === 'between' ? spot.y + dy : spot.y + (Math.sign(spot.y - spot.ref) || 1) * dy;
      for (const dx of dxs) {
        const x = spot.x + dx;
        const away = (Math.sign(sy - spot.ref) || 1) as 1 | -1;
        const box = dotBox(x, sy, countW, countAt, away, csize);
        const outside = spot.lo <= spot.hi && (x < spot.lo - 0.5 || x > spot.hi + 0.5);
        const score = Math.abs(dx) + vi * 14 + (outside ? 60 : 0) + nameCost(box, near) + crowdCost(x, sy, taken);
        cands.push({ x, y: sy, key: `${vi}|${dx}`, score, box, away });
      }
    });
    cands.sort((a, b) => a.score - b.score);
    const inSky = (b: Rect) => insideSky(v, b);
    const free = (b: Rect) => inSky(b) && !p.placer.clash(b) && !stars.clash(b, true);
    // штраф места, дорогой в счёте, — только у мест, которые ещё могут победить: точка на линии следа (+18) и на ленте (+400)
    // и скобки от супругов не перекрещиваются со скобками уже поставленных точек (жёны одна под другой: скобка нижней
    // не пересекает скобку верхней), кроме скобок от того же лица
    const penalty = (c: (typeof cands)[number]) =>
      (p.lines?.clash({ x: c.x - R, y: c.y - R, w: 2 * R, h: 2 * R }, false) ? 18 : 0) +
      (p.offRibbon && !p.offRibbon(c.box) ? 400 : 0) +
      BRACKET_CROSS * spouses.reduce((n, sp) => n + chords.filter((q) => q.id !== sp.id && crossing(sp.x, sp.y, c.x, c.y, q.x0, q.y0, q.x1, q.y1)).length, 0);
    let got: (typeof cands)[number] | null = null;
    // место прошлого кадра — первым, если оно свободно и не намного хуже лучшего (точка не прыгает при сдвиге неба)
    const was = memo.get(u.id);
    const prev = was ? cands.find((c) => c.key === was) : undefined;
    if (prev && prev.score <= cands[0].score + 30 && free(prev.box) && prev.score + penalty(prev) <= cands[0].score + 30) got = prev;
    if (!got) {
      let best = Infinity;
      for (const c of cands) {
        if (c.score >= best) break;
        if (!free(c.box)) continue;
        const sc = c.score + penalty(c);
        if (sc < best) {
          best = sc;
          got = c;
        }
      }
    }
    // места нет — лучшее место в открытом небе, даже на чужой звезде: без точки союз распался бы на линии
    got ??= cands.find((c) => inSky(c.box) && !p.placer.clash(c.box, false)) ?? null;
    if (!got) {
      memo.delete(u.id);
      continue;
    }
    memo.set(u.id, got.key);
    dot.cx = got.x;
    dot.cy = got.y;
    dot.placed = true;
    dot.box = got.box;
    dot.away = got.away;
    p.placer.add(got.box);
    taken.push({ x: got.x, y: got.y });
    for (const sp of spouses) chords.push({ id: sp.id, x0: sp.x, y0: sp.y, x1: got.x, y1: got.y });
    v.ledger.add('plate', plateNames(u), got.box, u.id);
    // линия ромба в проверке линий: название созвездия и помета не ложатся на точку
    p.lines?.add({ x: got.x - R, y: got.y - R, w: 2 * R, h: 2 * R });
  }
  return out;
}

const countFont = (coarse: boolean) => mapFont(T_MAP_S, { sans: true, weight: 500, coarse });

/** Штраф места точки за каждое пересечение её скобки со скобкой другой точки (по хордам: звезда супруга — ромб). */
export const BRACKET_CROSS = 24;
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

/** Поле точки: ромб с кольцом и «+N» справа, слева или под ромбом (away — сторона от строки лица: 1 — вниз). */
function dotBox(x: number, y: number, countW: number, at: UnionDot['countAt'], away: number, size: number): Rect {
  const F = DOT_FIELD;
  if (!countW) return { x: x - F, y: y - F, w: 2 * F, h: 2 * F };
  if (at === 'r') return { x: x - F, y: y - F, w: 2 * F + countW + 3, h: 2 * F };
  if (at === 'l') return { x: x - F - countW - 3, y: y - F, w: 2 * F + countW + 3, h: 2 * F };
  const w = Math.max(2 * F, countW + 4);
  return away > 0 ? { x: x - w / 2, y: y - F, w, h: 2 * F + size } : { x: x - w / 2, y: y - F - size, w, h: 2 * F + size };
}
/** Где пишется «+N» у ромба (x — начало строки, y — середина строки). */
function countSpot(d: UnionDot, size: number, away: number): { x: number; y: number } {
  if (d.countAt === 'r') return { x: d.cx + d.r + 4, y: d.cy };
  if (d.countAt === 'l') return { x: d.cx - d.r - 4 - d.countW, y: d.cy };
  return { x: d.cx - d.countW / 2, y: d.cy + away * (d.r + 3 + size * 0.5) };
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
/** Точки кривой скобки через равные доли параметра (для проверки линий кадра). */
function bracketSamples(c: number[], n = 8): [number, number][] {
  if (c.length === 4) return [[c[0], c[1]], [c[2], c[3]]];
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const q = 3 * (1 - t) * t * t;
    const e = t ** 3;
    out.push([a * c[0] + b * c[2] + q * c[4] + e * c[6], a * c[1] + b * c[3] + q * c[5] + e * c[7]]);
  }
  return out;
}
/** Ломаная — в линии кадра (Pass.lines): названия созвездий и пометы семей на неё не ложатся. */
function addPolyline(pl: Pick<Placer, 'add'> | undefined, pts: readonly [number, number][]) {
  if (!pl) return;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 24));
    for (let j = 0; j < n; j++) {
      const ax = x0 + ((x1 - x0) * j) / n;
      const ay = y0 + ((y1 - y0) * j) / n;
      const bx = x0 + ((x1 - x0) * (j + 1)) / n;
      const by = y0 + ((y1 - y0) * (j + 1)) / n;
      pl.add({ x: Math.min(ax, bx) - 1, y: Math.min(ay, by) - 1, w: Math.abs(bx - ax) + 2, h: Math.abs(by - ay) + 2 });
    }
  }
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

/** Знак разрыва (хронологическое напряжение) поперёк отрезка в его середине: две короткие косые черты. */
function tensionAcross(ctx: CanvasRenderingContext2D, s: [number, number, number, number], color: string) {
  const [x0, y0, x1, y1] = s;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const l = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / l;
  const uy = (y1 - y0) / l;
  // черты наклонены к отрезку, как «//» на следе
  const nx = -uy + ux * 0.6;
  const ny = ux + uy * 0.6;
  const nl = Math.hypot(nx, ny) || 1;
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const k of [-1.6, 1.6]) {
    const cx = mx + ux * k;
    const cy = my + uy * k;
    ctx.moveTo(cx - (nx / nl) * 4, cy - (ny / nl) * 4);
    ctx.lineTo(cx + (nx / nl) * 4, cy + (ny / nl) * 4);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Линии союзов (под звёздами и подписями): скобки от супругов тоном следа и линии к детям цветом ветви со свечением.
 * У наведённой и выбранной точки линии — в полную силу и толще: в гуще семьи видно, какие линии её. Возвращает, что
 * нарисовано, — для проверок приёмки (sky.ts пишет canvas[data-union-lines]): «союз=супруг» и «союз>ребёнок:#цвет».
 */
export function drawUnionLines(v: SkyContext, p: Pass, dots: readonly UnionDot[], marks: PlateMarks = {}): string[] {
  const { ctx, pal } = v;
  const s = p.s;
  const hl = s.highlight;
  const intro = s.intro;
  const bf = branchFrame(v, p);
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  const glow = new GlowBatch(glowLayers('branch', theme));
  const anc = new GlowBatch(glowLayers('ancestor', theme));
  const log: string[] = [];
  type Seg = { seg: [number, number, number, number]; color: string; dash: number[]; tension?: string; hot: boolean };
  const hot = (d: UnionDot) => d.pl.union.id === marks.hover || d.pl.union.id === marks.selected;
  const segs: Seg[] = [];
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  // скобки от супругов — тоном следа; отвес скобки не проходит через чужие звёзды (bracketCurve, blocked)
  const starsAt: { x: number; y: number; r: number; id: string }[] = [];
  for (const i of p.vis) {
    if (!v.drawn(i) || p.starAlpha(i) <= 0.5) continue;
    const q = byId.get(v.nodes[i].person);
    starsAt.push({ x: v.cam.sx(v.X0[i]), y: v.cam.sy(v.nodes[i].lane), r: starRadius(q?.magnitude ?? 6, p.zoomScale) + (q?.sex === 'f' ? 2.2 : 0), id: v.nodes[i].person });
  }
  ctx.lineWidth = SPOUSE_LINE_W;
  for (const d of dots) {
    for (const sp of d.spouses) {
      const e = hot(d) ? 1 : Math.min(p.emph(sp.id), d.e) * intro;
      ctx.strokeStyle = alpha(hot(d) ? pal.ink : pal.ink2, Math.min(1, (hot(d) ? 0.85 : 0.62) * e));
      ctx.lineWidth = hot(d) ? SPOUSE_LINE_W + 0.5 : SPOUSE_LINE_W;
      const blocked = (x: number, y0: number, y1: number) => starsAt.some((q) => q.id !== sp.id && Math.abs(q.x - x) < q.r + 3 && q.y > y0 && q.y < y1);
      spouseBracket(ctx, sp, { x: d.cx, y: d.cy, r: d.r }, blocked);
      addPolyline(p.lines, bracketSamples(bracketCurve(sp, { x: d.cx, y: d.cy, r: d.r }, blocked)));
      log.push(`${d.pl.union.id}=${sp.id}`);
    }
  }
  // линии к детям — цветом ветви: у рода выбранного — его ветвей, у предков — светом текста, у прочих — ветви у родителя
  const L = s.layers;
  for (const d of dots) {
    const u = d.pl.union;
    const dash = kidDash(u);
    const par = u.a ?? u.b;
    const pi = par ? v.indexOf(par) : undefined;
    const brk = pi !== undefined ? v.nodes[pi].brk : null;
    const torn = !!par && L.tensions && s.tensionPersons.has(par);
    for (const k of d.kids) {
      const seg = kidSegment(d.cx, d.cy, d.r, k.x, k.y, k.r);
      const bp = bf.paint(k.id);
      const kind = hl?.get(k.id);
      let color: string;
      let hex: string;
      if (bp) {
        hex = bp.color;
        const a = branchAlpha(bp, p.emph(k.id), intro);
        color = alpha(hex, a);
        if (glows(bp.gen, false)) glow.add(hex, a, ...seg);
      } else if (bf.map && (kind === 'anc' || kind === 'self')) {
        hex = pal.ink;
        color = alpha(pal.ink2, Math.min(1, p.emph(k.id) * intro));
        anc.add(pal.ink, intro, ...seg);
      } else {
        hex = kidColor(u, k.id, theme);
        const a = hot(d) ? 1 : Math.min(1, p.emph(k.id) * intro);
        color = alpha(hex, a);
        glow.add(hex, a, ...seg);
      }
      if (hot(d) && bp) color = alpha(hex, 1);
      const tension = (torn && s.tensionPersons.has(k.id)) || (brk !== null && brk !== undefined && k.t0 > brk) ? alpha(pal.ink, 0.9 * Math.min(1, p.emph(k.id)) * intro) : undefined;
      segs.push({ seg, color, dash, tension, hot: hot(d) });
      log.push(`${u.id}>${k.id}:${hex}`);
    }
  }
  anc.flush(ctx, theme === 'night');
  glow.flush(ctx, theme === 'night');
  for (const q of segs) {
    ctx.lineWidth = q.hot ? KID_LINE_W + 0.75 : KID_LINE_W;
    ctx.strokeStyle = q.color;
    ctx.setLineDash(q.dash);
    ctx.beginPath();
    ctx.moveTo(q.seg[0], q.seg[1]);
    ctx.lineTo(q.seg[2], q.seg[3]);
    ctx.stroke();
    addPolyline(p.lines, [[q.seg[0], q.seg[1]], [q.seg[2], q.seg[3]]]);
  }
  ctx.setLineDash([]);
  for (const q of segs) if (q.tension) tensionAcross(ctx, q.seg, q.tension);
  ctx.restore();
  return log;
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

/**
 * Ромбы союзов поверх линий: состояние (залит — раскрыт, полый с «+N» — свёрнут), наведение (ярче, тонкое кольцо),
 * выбор (кольцо, как у выбранной звезды) и фокус клавиатуры (кольцо фокуса). Возвращает попадания (src/ui/sky).
 */
export function drawUnionDots(v: SkyContext, p: Pass, dots: readonly UnionDot[], marks: PlateMarks = {}): PlateHit[] {
  const { ctx, pal } = v;
  const out: PlateHit[] = [];
  const intro = p.s.intro;
  for (const d of dots) {
    if (!d.placed || !d.box) continue;
    const u = d.pl.union;
    const hover = marks.hover === u.id;
    const sel = marks.selected === u.id;
    // ромб — светом звёзд, чуть тише звезды: такая же точка неба, что лицо, но узел, а не лицо; наведённый и выбранный — ярче
    const e = hover || sel ? 1 : DOT_TONE * d.e;
    const color = alpha(pal.ink, Math.min(1, e * intro));
    paintDot(ctx, d.cx, d.cy, d.r, { open: d.pl.open, color, halo: pal.sky });
    if (d.count) {
      const at = countSpot(d, mapSize(T_MAP_S, v.coarse), d.away);
      paintCount(ctx, pal, v.coarse, at.x, at.y, d.count, color);
    }
    ctx.save();
    ctx.setLineDash([]);
    const ring = (r: number, w: number, c: string) => {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    if (sel) ring(d.r + 3.5, 1.5, pal.focus);
    else if (hover) ring(d.r + 3, 1, pal.ink);
    if (marks.focus === u.id) ring(d.r + (sel ? 6.5 : 5), 2, pal.focus);
    ctx.restore();
    // поле попадания — не меньше 18 × 18 (на касании input.ts раздувает до 44)
    const b = d.box;
    const g = Math.max(0, (18 - b.h) / 2);
    out.push({ x: b.x - g, y: b.y - g, w: b.w + 2 * g, h: b.h + 2 * g, uid: u.id, from: d.pl.from, open: d.pl.open, cx: d.cx, cy: d.cy, r: d.r, hidden: d.hidden, ax: d.cx, ay: d.cy });
  }
  return out;
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
 * фокуса. • — узел следующего гнезда того же союза. Рисуются над лентами и под звёздами: ленты проходят через ромб, как
 * через пересадочную станцию (§ 3). Возвращает поля попадания ромбов (не меньше 24 × 24) и «+N» (отдельная цель).
 */
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
    const lit = hover || sel || marks.focus === n.union || d.lit({ ends: [n.owner, n.from] } as LinkPath);
    return { hover, sel, lit };
  };
  // на мелком масштабе «всех лиц» ромбы соседних семей сходятся: знак, чьё место занято уже нарисованным ромбом, не
  // рисуется (семантическое увеличение, ТЗ § 3.1) — выделенные и наведённые первыми
  const map = d.frame.layout === 'map';
  // «все лица» теснее поколения в 18 px: ромбов нет (семья — сгусток; знаки только закрывали бы друг друга и имена)
  if (map && v.genRoom < 0.5) return { plates, counts };
  const inView: { n: LinkNode; x: number; y: number; st: ReturnType<typeof state> }[] = [];
  for (const n of d.frame.nodes) {
    const x = n.x + d.dx;
    const y = n.y + d.dy;
    // под рамкой листа (линейка годов сверху, буквы полос слева) узла не видно: ни знака, ни цели, ни места в замере
    if (x < v.letterW || x > cam.w + 12 || y < v.openTop || y > cam.vp.b) continue;
    // узел союза, чьи связи рисуют только ленты, — станция их маршрута: пока ленты — сплайн обзора, его нет (§ 3)
    if (d.frame.ribbonOnly?.has(n.union) && v.routeFactor < 0.5) continue;
    inView.push({ n, x, y, st: state(n) });
  }
  if (map) inView.sort((a, b) => Number(b.st.lit) - Number(a.st.lit));
  const taken: Rect[] = [];
  for (const { n, x, y, st } of inView) {
    const { hover, sel, lit } = st;
    const a0 = lit ? 1 : d.alpha;
    if (a0 <= 0.01) continue;
    const own = { x: x - R - 0.5, y: y - R - 0.5, w: 2 * R + 1, h: 2 * R + 1 };
    // знак целиком в открытом небе: у кромки рамки ромб не срезается — его нет
    if (own.x < v.letterW || own.x + own.w > cam.w || own.y < v.openTop || own.y + own.h > cam.vp.b) continue;
    if (map) {
      if (taken.some((t) => cross(t, own))) continue;
      taken.push(own);
    }
    const e = hover || sel ? 1 : DOT_TONE * Math.max(p.emph(n.owner), p.emph(n.from));
    const color = alpha(pal.ink, Math.min(1, e * intro));
    ctx.globalAlpha = g0 * a0 * settle;
    if (n.kind === 'join') {
      paintJoin(ctx, x, y, color, pal.sky);
      continue;
    }
    paintDot(ctx, x, y, R, { open: n.open, color, halo: pal.sky });
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
      paintDot(ctx, px(w * 0.24), mid, NODE_R_FAMILY, { open: true, color: pal.ink, halo: pal.sky });
      line([px(w * 0.56), mid, px(w - 6), mid], trailTone, 1.2);
      paintDot(ctx, px(w * 0.68), mid, NODE_R_FAMILY, { open: false, color: pal.ink, halo: pal.sky });
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
      paintDot(ctx, x1, top, NODE_R_FAMILY, { open: true, color: pal.ink, halo: pal.sky });
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
      paintDot(ctx, x, my, NODE_R_FAMILY, { open: true, color: pal.ink, halo: pal.sky });
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
      paintDot(ctx, x, top, NODE_R_MAP, { open: true, color: pal.ink, halo: pal.sky });
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
      paintDot(ctx, x, top, NODE_R_FAMILY, { open: true, color: pal.ink, halo: pal.sky });
      star(px(w * 0.72) + 4, mid, 3);
      star(px(w * 0.8) + 4, low, 3);
      break;
    }
    case 'selected': {
      // выбранная связь: жёлтый путь и кольца на концах
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
