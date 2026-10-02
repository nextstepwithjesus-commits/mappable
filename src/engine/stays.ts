/**
 * Пребывания лица на небе (этап 15, решение 173 «Отчий дом»; договор 1 STAGE15 § 3).
 *
 * Лицо рождается в доме отца (если отец не назван — матери), его звезда стоит у матери. Если жизнь лица идёт в другой
 * полосе (родоначальник колена, жена в доме мужа), его след переходит туда плавной S-кривой в 5–16 лет. Раскладка
 * (src/engine/layout.ts, src/engine/house.ts) отдаёт:
 *  — lane — полосу жизни (как прежде);
 *  — starLane — полосу рождения (звезда);
 *  — stays — пребывания по порядку [{ lane, t0, t1 }]; между соседними пребываниями — переход: от stays[k].t1 до
 *    stays[k + 1].t0, из stays[k].lane в stays[k + 1].lane. Нет stays — лицо всю жизнь в полосе lane.
 *
 * Всё небо спрашивает полосу лица в год t только через laneAt (а не через node.lane), полосу звезды — через starLaneOf.
 * Модуль чистый: функции получают узел (LayoutNode из раскладки или NodeRow из src/data/atlas.ts) и модель.
 */
import type { Union } from './unions.ts';

/** Пребывание в полосе: годы астрономические, t0 ≤ t1. */
export interface Stay {
  lane: number;
  t0: number;
  t1: number;
}

/** Переход между пребываниями — часть следа лица, а не связь: S-кривая (smoothstep) от from к to за годы t0…t1. */
export interface Glide {
  t0: number;
  t1: number;
  from: number;
  to: number;
}

/** Узел неба с пребываниями: LayoutNode (engine/layout.ts) и NodeRow (data/atlas.ts). */
export interface StayNode {
  lane: number;
  starLane?: number;
  stays?: readonly Stay[];
}

/** Вид союза для начертания черты брака (решение 174). */
export type MarriageKind = 'wife' | 'concubine' | 'levirate' | 'none';

/** Годы черт брака модели: id союза → год (астр.). У модели неба — ModelData.unionYears (src/data/atlas.ts). */
export interface UnionYears {
  unionYears?: ReadonlyMap<string, number>;
}

/** Плавная ступень 0…1 (smoothstep): переход начинается и кончается касательной к полосе. */
export const smooth = (u: number): number => {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return x * x * (3 - 2 * x);
};

/** Полоса звезды (рождения). */
export function starLaneOf(n: StayNode): number {
  return n.starLane ?? n.stays?.[0]?.lane ?? n.lane;
}

/** Переходы лица по порядку; пусто — лицо не меняет полосы. */
export function glidesOf(n: StayNode): Glide[] {
  const st = n.stays;
  if (!st || st.length < 2) return [];
  const out: Glide[] = [];
  for (let k = 1; k < st.length; k++) out.push({ t0: st[k - 1].t1, t1: st[k].t0, from: st[k - 1].lane, to: st[k].lane });
  return out;
}

/**
 * Полоса лица в год t (астр.): в пребывании — его полоса, на переходе — S-кривая, до первого пребывания — полоса
 * рождения, после последнего — полоса жизни. Без пребываний — node.lane.
 */
export function laneAt(n: StayNode, t: number): number {
  const st = n.stays;
  if (!st || !st.length) return n.lane;
  if (t <= st[0].t1) return st[0].lane;
  for (let k = 1; k < st.length; k++) {
    const p = st[k - 1];
    const q = st[k];
    if (t < q.t0) {
      if (t <= p.t1) return p.lane;
      const w = q.t0 - p.t1;
      return w > 0 ? p.lane + (q.lane - p.lane) * smooth((t - p.t1) / w) : q.lane;
    }
    if (t <= q.t1) return q.lane;
  }
  return st[st.length - 1].lane;
}

/**
 * Год черты брака союза (астр.) — тот же, что у плана дома (src/engine/house.ts): приход жены в дом мужа — год до
 * первого ребёнка союза; у бездетного брака — взрослость младшего из супругов, не позже конца жизни обоих.
 * null — у союза нет черты брака (один из родителей не назван, союз «по закону» или «по Луке», лица нет на небе).
 */
export function unionYear(uid: string, m: UnionYears): number | null {
  return m.unionYears?.get(uid) ?? null;
}

/** Пометы данных о левирате (Быт 38:8: «войди к жене брата твоего… восстанови семя брату твоему»). */
const LEVIRATE = /левират|деверь|восстановлени\S* семени/i;

/**
 * Вид союза по данным (решение 174):
 *  — 'levirate' — брак по закону деверя: помета у брака (Онан и Фамарь) или утверждение о происхождении 'levirate';
 *  — 'concubine' — наложница (вид связи супругов в данных);
 *  — 'wife' — жена (вид связи супругов в данных);
 *  — 'none' — брак в Писании не назван, союз виден только через детей: оба родителя названы, связи супругов в данных
 *    нет (Иуда и Фамарь, Лот и дочери, Галаад и мать Иеффая, цари Иудеи и царицы-матери — «имя матери его…»; у них
 *    Union.queenMother — для слов подсказки); также союз, где один из родителей не назван (черты брака нет).
 */
export function marriageKind(u: Pick<Union, 'a' | 'b' | 'kind' | 'note' | 'claim'>): MarriageKind {
  if (u.claim === 'levirate' || (u.note && LEVIRATE.test(u.note))) return 'levirate';
  if (!u.a || !u.b) return 'none';
  if (u.kind === 'concubine') return 'concubine';
  if (u.kind === 'wife') return 'wife';
  return 'none';
}
