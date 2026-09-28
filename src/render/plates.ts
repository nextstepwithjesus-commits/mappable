/**
 * Карточки союзов на небе «набор» (решения владельца 67, 70, 72): брак или связь, от которой пошли дети, — небольшой
 * картуш в традиции звёздного атласа (ТЗ § 5): тонкая рамка 1 px цвета туманности, без тени и скругления, фон неба.
 *
 *   ┌──────────────────────┐
 *   │ +  Авраам и Агарь    │   имена супругов — кеглем подписей;
 *   │    жена; сын         │   вид связи словами данных и дети — строкой мельче
 *   └──────────────────────┘
 *
 * Знак слева — состояние: «+» — свёрнут (щелчок раскрывает обоих супругов и детей), «−» — раскрыт.
 *
 * Место (решение 70):
 *  — союз «вниз» — на следе отца (или единственного родителя, если отца нет на небе) в год рождения первого ребёнка,
 *    у корня гребёнки детей этой матери (src/render/trails.ts, familyCombs); картуш висит под следом или над ним —
 *    с той стороны, где больше детей: там небо «набор» оставляет строку (src/render/rows.ts, PlateGap). Брак без детей —
 *    в середине жизни мужа;
 *  — союз «вверх» (родители лица, которых нет на небе) — над лицом, слева от его звезды, на уровне его рождения;
 *    раскрытый союз «вверх» стоит там же, где стоял бы союз «вниз» у родителя;
 *  — картуш не ложится на подписи и звёзды (общая проверка наложений, labels.ts, claim): при нехватке места он сдвигается
 *    вдоль следа, затем — на другую сторону следа, затем — в одну строку;
 *  — от следа к картушу — одна тонкая линия (отвод): у раскрытого союза она продолжается стволом гребёнки его детей.
 *
 * drawPlateSample рисует образец картуша на любом холсте (условные знаки, src/ui/panels/Legend.tsx).
 */
import { byId } from '../data/atlas.ts';
import type { ModelData } from '../data/atlas.ts';
import type { Union } from '../engine/unions.ts';
import { lowerFirst, nameCase } from '../ui/text/ru.ts';
import { alpha } from './color.ts';
import { starRadius } from './glyphs.ts';
import { claim } from './labels.ts';
import { familyCombs } from './trails.ts';
import { mapFont, mapSize, T_MAP_S, T_UI } from './type.ts';
import type { Rect } from './rect.ts';
import type { PlateGap } from './rows.ts';
import type { Pass, SkyContext } from './sky.ts';

/** Союз на небе: что рисовать (src/ui/reveal.ts, plates — тот же вид). */
export interface PlateIn {
  union: Union;
  /** лицо, у которого карточка стоит */
  from: string;
  /** 'down' — союз лица (к детям), 'up' — союз его происхождения (к родителям) */
  dir: 'down' | 'up';
  /** раскрыт: оба супруга и все дети на небе */
  open: boolean;
}

/** Картуш в последнем кадре (px холста): щелчок и касание — src/ui/sky/input.ts, клавиатура — starnav.ts. */
export interface PlateHit extends Rect {
  uid: string;
  from: string;
  open: boolean;
  /** точка на следе (или у звезды), от которой идёт отвод */
  ax: number;
  ay: number;
}

/** Состояния картушей в кадре: наведённый, с кольцом клавиатуры, открытый в листе карточки. */
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

/** Имя лица в картуше: безымянное («Жена Лота») не первым словом — со строчной. */
function nameIn(id: string, first: boolean): string {
  const p = byId.get(id);
  if (!p) return id;
  return p.unnamed && !first ? lowerFirst(p.name) : p.name;
}

/** «сына», «дочери», «сыновей», «дочерей», «детей» — чьи родитель не назван. */
function kidsGen(u: Union): string {
  const sexes = u.kids.map((k) => byId.get(k)?.sex ?? 'm');
  if (sexes.length === 1) return sexes[0] === 'f' ? 'дочери' : 'сына';
  if (sexes.every((s) => s === 'f')) return 'дочерей';
  if (sexes.every((s) => s !== 'f')) return 'сыновей';
  return 'детей';
}

/**
 * Первая строка картуша — имена супругов в именительном: «Авраам и Агарь». Второе лицо не названо — «Сиф: мать сына
 * не названа», «Мария: отец не назван». У союза происхождения иного рода с одним лицом (усыновление, по Луке) — одно имя.
 */
export function plateNames(u: Union): string {
  if (u.a && u.b) return `${nameIn(u.a, true)} и ${nameIn(u.b, false)}`;
  const one = u.a ?? u.b;
  if (!one) return '';
  if (u.claim || !u.kids.length) return nameIn(one, true);
  return u.a ? `${nameIn(one, true)}: мать ${kidsGen(u)} не названа` : `${nameIn(one, true)}: отец ${kidsGen(u)} не назван`;
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
 * Вторая строка картуша: вид связи словами данных («жена», «наложница»), вид происхождения детей («по закону», «по Луке»,
 * «усыновление») с пометой «толк.» или «выв.», и дети со склонением: «наложница; 6 сыновей», «жена; по закону; сын».
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

/**
 * Где стоит картуш: на следе родителя, который есть на небе (отец, иначе мать; у союза «вниз» без родителя на небе —
 * у лица from), или — у союза «вверх», родителей которого нет на небе, — у звезды лица from.
 */
export function plateAnchor(pl: PlateIn, shown: (id: string) => boolean): { at: string; kind: 'trail' | 'star' } {
  const u = pl.union;
  const par = [u.a, u.b].find((x): x is string => !!x && shown(x) && !u.kids.includes(x));
  if (par) return { at: par, kind: 'trail' };
  return { at: pl.from, kind: pl.dir === 'down' ? 'trail' : 'star' };
}

/** С какой стороны следа родителя на полосе lane висит картуш: там, где больше детей союза (1 — выше, −1 — ниже). */
export function hangSide(u: Union, lane: number, laneOf: (id: string) => number | undefined): 1 | -1 {
  let s = 0;
  for (const k of u.kids) {
    const l = laneOf(k);
    if (l !== undefined) s += Math.sign(l - lane);
  }
  return s > 0 ? 1 : -1;
}

/**
 * Места под картуши для сжатия строк неба «набор» (src/render/rows.ts, planSky): у полосы родителя — со стороны детей;
 * у лица, чьих родителей нет на небе, — над ним. У лица с тремя союзами и больше — с обеих сторон следа.
 */
export function plateGaps(plates: readonly PlateIn[], laneOf: (id: string) => number | undefined, shown: (id: string) => boolean): PlateGap[] {
  const out = new Map<string, PlateGap>();
  const put = (lane: number, dir: 1 | -1) => out.set(`${lane}${dir}`, { lane, dir });
  const per = new Map<string, number>();
  for (const pl of plates) {
    const an = plateAnchor(pl, shown);
    const lane = laneOf(an.at);
    if (lane === undefined) continue;
    if (an.kind === 'star') {
      put(lane, 1);
      continue;
    }
    put(lane, hangSide(pl.union, lane, laneOf));
    per.set(an.at, (per.get(an.at) ?? 0) + 1);
  }
  for (const [id, n] of per) {
    const lane = laneOf(id);
    if (n < 3 || lane === undefined) continue;
    put(lane, 1);
    put(lane, -1);
  }
  return [...out.values()];
}

/** Год рождения первого ребёнка союза (астр.; у лица со знаком у первого свидетельства — оценка рождения). */
export function firstBirth(model: ModelData, u: Union): number | null {
  let t = Infinity;
  for (const k of u.kids) {
    const n = model.nodeByPerson.get(k);
    if (n) t = Math.min(t, n.born ?? n.t0);
  }
  return Number.isFinite(t) ? t : null;
}

/**
 * Точка картуша в координатах неба: мировая x и полоса — год рождения первого ребёнка на полосе родителя (брак без детей —
 * середина жизни), а у союза «вверх» без родителей на небе — рождение лица from. По ней небо держит картуш на месте
 * экрана, когда союз раскрывают и сворачивают (src/ui/SkyView.tsx).
 */
export function plateAnchorPoint(v: Pick<SkyContext, 'model' | 'xOf'>, pl: PlateIn, shown: (id: string) => boolean): { x: number; lane: number; kind: 'trail' | 'star' } | null {
  const an = plateAnchor(pl, shown);
  const n = v.model.nodeByPerson.get(an.at);
  if (!n) return null;
  if (an.kind === 'star') return { x: v.xOf(n.t0), lane: n.lane, kind: 'star' };
  const t = firstBirth(v.model, pl.union) ?? (n.t0 + n.t1) / 2;
  return { x: v.xOf(t), lane: n.lane, kind: 'trail' };
}

// ---------- размер и рисунок ----------

/** Поля картуша, px: по горизонтали, по вертикали; просвет между следом и картушем; отступ картуша влево от отвода. */
export const PLATE_PAD = { x: 6, y: 3, gap: 3, lead: 9 };

interface PlateText {
  names: string;
  sub: string;
  sign: string;
}
interface PlateSize {
  w: number;
  h: number;
  signW: number;
  s1: number;
  s2: number;
}

const namesFont = (coarse: boolean) => mapFont(T_UI, { weight: 500, coarse });
const subFont = (coarse: boolean) => mapFont(T_MAP_S, { sans: true, coarse });
const signFont = (coarse: boolean) => mapFont(T_UI, { sans: true, weight: 500, coarse });

/** Размер картуша: две строки (compact — только имена). */
export function plateSize(ctx: CanvasRenderingContext2D, coarse: boolean, t: { names: string; sub: string }, compact = false): PlateSize {
  const s1 = mapSize(T_UI, coarse);
  const s2 = mapSize(T_MAP_S, coarse);
  ctx.font = signFont(coarse);
  const signW = Math.max(ctx.measureText('+').width, ctx.measureText('−').width) + 5;
  ctx.font = namesFont(coarse);
  const w1 = ctx.measureText(t.names).width;
  let w2 = 0;
  if (!compact && t.sub) {
    ctx.font = subFont(coarse);
    w2 = ctx.measureText(t.sub).width;
  }
  const w = Math.ceil(PLATE_PAD.x * 2 + signW + Math.max(w1, w2));
  const h = Math.ceil(PLATE_PAD.y * 2 + s1 * 1.04 + (!compact && t.sub ? s2 * 1.2 + 1 : 0));
  return { w, h, signW, s1, s2 };
}

type PlatePal = { ink: string; ink2: string; ink3: string; focus: string };

/**
 * Картуш в прямоугольнике box: фон (ground), рамка 1 px цвета туманности (наведённый — ярче, открытый в листе карточки —
 * с внутренней второй линией, как рамка в атласе), знак «+» или «−», имена и строка вида связи.
 */
function paintPlate(ctx: CanvasRenderingContext2D, pal: PlatePal, coarse: boolean, box: Rect, t: PlateText, z: PlateSize, compact: boolean, st: { hover?: boolean; focus?: boolean; selected?: boolean }, ground: (b: Rect) => void) {
  ground(box);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = st.selected ? pal.ink : st.hover ? pal.ink2 : pal.ink3;
  ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w) - 1, Math.round(box.h) - 1);
  if (st.selected) ctx.strokeRect(Math.round(box.x) + 2.5, Math.round(box.y) + 2.5, Math.round(box.w) - 5, Math.round(box.h) - 5);
  if (st.focus) {
    ctx.strokeStyle = pal.focus;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(box.x) - 2, Math.round(box.y) - 2, Math.round(box.w) + 4, Math.round(box.h) + 4);
  }
  ctx.textBaseline = 'alphabetic';
  const b1 = box.y + PLATE_PAD.y + z.s1 * 0.84;
  const x0 = box.x + PLATE_PAD.x;
  ctx.font = signFont(coarse);
  ctx.fillStyle = pal.ink2;
  ctx.fillText(t.sign, x0, b1);
  ctx.font = namesFont(coarse);
  ctx.fillStyle = pal.ink;
  ctx.fillText(t.names, x0 + z.signW, b1);
  if (!compact && t.sub) {
    ctx.font = subFont(coarse);
    ctx.fillStyle = pal.ink2;
    ctx.fillText(t.sub, x0 + z.signW, b1 + z.s1 * 0.2 + 1 + z.s2 * 1.0);
  }
  ctx.restore();
}

/**
 * Образец картуша для условных знаков (src/ui/panels/Legend.tsx): тот же рисунок, что на небе, на любом холсте.
 * x, y — левый верхний угол; фон — цвет pal.sky. Возвращает прямоугольник картуша.
 */
export function drawPlateSample(
  ctx: CanvasRenderingContext2D,
  pal: PlatePal & { sky: string },
  coarse: boolean,
  x: number,
  y: number,
  names: string,
  sub: string,
  open = false,
): Rect {
  const t = { names, sub, sign: open ? '−' : '+' };
  const z = plateSize(ctx, coarse, t);
  const box = { x, y, w: z.w, h: z.h };
  paintPlate(ctx, pal, coarse, box, t, z, false, {}, (b) => {
    ctx.fillStyle = pal.sky;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  });
  return box;
}

/** Место-кандидат картуша: прямоугольник, в одну ли строку, с какой стороны следа и ключ места (для постоянства). */
type Cand = { box: Rect; compact: boolean; side: 1 | -1 | 0; key: string; sticky: boolean };

/**
 * Где картуш стоял в прошлых кадрах (ключ места по союзу и виду привязки): картуш, которому хватает места там же, там
 * и остаётся — не прыгает между кадрами, когда соседние подписи меняют сторону, и при раскрытии союза (решение 70).
 */
const placed = new WeakMap<object, Map<string, string>>();

/**
 * Картуши союзов в кадре неба «набор». Раскрытые и открытый в листе карточки — первыми: им лучшие места. Возвращает
 * прямоугольники нарисованных картушей (щелчок, касание, клавиатура).
 */
export function drawPlates(v: SkyContext, p: Pass, plates: readonly PlateIn[], marks: PlateMarks = {}): PlateHit[] {
  const { ctx, cam, pal } = v;
  const out: PlateHit[] = [];
  if (!plates.length) return out;
  let memo = placed.get(v);
  if (!memo) placed.set(v, (memo = new Map()));
  const combs = familyCombs(v);
  const vp = cam.vp;
  /** Картуш сдвинут внутрь видимой части по горизонтали (у края неба — органы, колонка кнопок). */
  const within = (x: number, w: number) => Math.max(vp.l + 2, Math.min(vp.r - w - 2, x));
  const shown = (id: string) => {
    const i = v.indexOf(id);
    return i !== undefined && v.drawn(i);
  };
  const laneOf = (id: string) => v.model.nodeByPerson.get(id)?.lane;
  const rank = (pl: PlateIn) => (pl.union.id === marks.selected ? 0 : pl.open ? 1 : 2);
  const order = plates.map((pl, k) => ({ pl, k })).sort((a, b) => rank(a.pl) - rank(b.pl) || a.k - b.k);
  const ground = (b: Rect) => v.fillGround(b.x, b.x + b.w, b.y, b.h);
  for (const { pl } of order) {
    const u = pl.union;
    const an = plateAnchor(pl, shown);
    const i = v.indexOf(an.at);
    if (i === undefined || !v.drawn(i)) continue;
    const n = v.nodes[i];
    const ay = cam.sy(n.lane);
    if (ay < v.openTop - 80 || ay > cam.vp.b + 80) continue;
    const t: PlateText = { names: plateNames(u), sub: plateSub(u), sign: pl.open ? '−' : '+' };
    const full = plateSize(ctx, v.coarse, t);
    const tight = plateSize(ctx, v.coarse, t, true);
    const cands: Cand[] = [];
    let ax: number;
    if (an.kind === 'trail') {
      const t0 = firstBirth(v.model, u);
      ax = cam.sx(t0 !== null ? v.xOf(t0) : (v.X0[i] + v.X1[i]) / 2);
      // у корня гребёнки детей этого союза (trails.ts): ствол сдвинут от соседней гребёнки другой матери
      const mine = combs.filter((c) => c.parent === an.at && c.kids.some((k) => u.kids.includes(k)));
      if (mine.length) ax = Math.min(...mine.map((c) => c.x));
      if (ax < -2000 || ax > cam.w + 2000) continue;
      const pref = hangSide(u, n.lane, laneOf);
      // вдоль следа — шагами в полкартуша; у края неба — сдвинут внутрь видимой части (ключ «c»)
      const list: { k: number | 'c' | 'r' | 'l'; side: 1 | -1; compact: boolean; score: number }[] = [];
      for (const compact of [false, true])
        for (const side of [pref, -pref as 1 | -1]) {
          for (const k of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 3, -3, 4, -4]) list.push({ k, side, compact, score: Math.abs(k) + (side !== pref ? 1.5 : 0) + (compact ? 20 : 0) });
          // у края неба: сдвинут внутрь видимой части (c), у её правого (r) и левого (l) края — на узком небе
          list.push({ k: 'c', side, compact, score: 0.75 + (side !== pref ? 1.5 : 0) + (compact ? 20 : 0) });
          list.push({ k: 'r', side, compact, score: 5 + (side !== pref ? 1.5 : 0) + (compact ? 20 : 0) });
          list.push({ k: 'l', side, compact, score: 5.5 + (side !== pref ? 1.5 : 0) + (compact ? 20 : 0) });
        }
      list.sort((a, b) => a.score - b.score);
      for (const c of list) {
        const z = c.compact ? tight : full;
        const x0 = ax - PLATE_PAD.lead;
        const x = c.k === 'c' ? within(x0, z.w) : c.k === 'r' ? vp.r - z.w - 2 : c.k === 'l' ? vp.l + 2 : x0 + c.k * (z.w + 8);
        // у края — только недалеко от отвода: длинная косая линия читалась бы как чужая
        if ((c.k === 'r' || c.k === 'l') && Math.abs(x - x0) > 2 * (z.w + 8)) continue;
        const y = c.side < 0 ? ay + PLATE_PAD.gap : ay - PLATE_PAD.gap - z.h;
        cands.push({ box: { x, y, w: z.w, h: z.h }, compact: c.compact, side: c.side, key: `${c.side}|${c.compact ? 1 : 0}|${c.k}`, sticky: typeof c.k === 'number' });
      }
    } else {
      // союз «вверх»: над лицом, слева от его звезды; тесно — дальше влево, под звездой, справа над ней
      const q = byId.get(an.at);
      const r = starRadius(q?.magnitude ?? 6, p.zoomScale);
      ax = cam.sx(v.X0[i]);
      if (ax < -2000 || ax > cam.w + 2000) continue;
      for (const compact of [false, true]) {
        const z = compact ? tight : full;
        const up = ay - 5 - z.h;
        const down = ay + 5;
        const left = ax - r - 6 - z.w;
        const spots = [[left, up], [within(left, z.w), up], [left - z.w - 8, up], [left, down], [ax + r + 6, up], [within(ax + r + 6, z.w), up], [left - z.w - 8, down]] as const;
        spots.forEach(([x, y], k) => cands.push({ box: { x, y, w: z.w, h: z.h }, compact, side: 0, key: `s|${compact ? 1 : 0}|${k}`, sticky: k !== 1 && k !== 5 }));
      }
    }
    // место прошлого кадра — первым (постоянство)
    const was = memo.get(`${u.id}|${an.kind}`);
    const first = was ? cands.findIndex((q) => q.key === was) : -1;
    if (first > 0) cands.unshift(...cands.splice(first, 1));
    const got = claim(v, p, cands.map((c) => c.box), 'plate', t.names, { id: u.id });
    if (!got) continue;
    const c = cands.find((q) => q.box === got)!;
    // место у края видимой части не запоминается: оно зависит от окна, а не от следа
    if (c.sticky) memo.set(`${u.id}|${an.kind}`, c.key);
    else memo.delete(`${u.id}|${an.kind}`);
    const box = got;
    // отвод: от следа (или звезды) к картушу — одна тонкая линия
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(pal.ink3, 0.9);
    ctx.beginPath();
    if (an.kind === 'trail') {
      const tx = Math.max(box.x + 3, Math.min(box.x + box.w - 3, ax));
      const ty = c.side < 0 ? box.y : box.y + box.h;
      ctx.moveTo(Math.round(ax) + 0.5, ay);
      ctx.lineTo(Math.round(tx) + 0.5, ty);
    } else {
      const q = byId.get(an.at);
      const r = starRadius(q?.magnitude ?? 6, p.zoomScale) + 2;
      const cx = Math.max(box.x, Math.min(box.x + box.w, ax));
      const cy = Math.max(box.y, Math.min(box.y + box.h, ay));
      const d = Math.hypot(cx - ax, cy - ay) || 1;
      ctx.moveTo(ax + ((cx - ax) / d) * r, ay + ((cy - ay) / d) * r);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();
    const z = c.compact ? tight : full;
    paintPlate(ctx, pal, v.coarse, box, t, z, c.compact, { hover: marks.hover === u.id, focus: marks.focus === u.id, selected: marks.selected === u.id }, ground);
    out.push({ x: box.x, y: box.y, w: box.w, h: box.h, uid: u.id, from: pl.from, open: pl.open, ax, ay });
  }
  return out;
}
