/**
 * Эпохи в годах хронологической модели (CARD-60; решение владельца 21).
 *
 * Границы первых эпох заданы числами Писания: «Первозданный мир» — от сотворения Адама до Потопа (600-й год Ноя,
 * Быт 7:6), «Патриархи» — от рождения Аврама до прихода Иакова в Египет (130 лет, Быт 47:9) и т. д. В каждой модели
 * (430 или 215 лет в Египте, числа в скобках Быт 5 и 11, Фарре 70 лет) эти годы свои. Правило границы записано
 * в data/epochs.json рядом с её основанием: startRule / endRule у эпохи и rule у события — лицо, от рождения
 * (или смерти) которого отсчитывается год, и число лет. Годы в data/epochs.json — модели по умолчанию; тест
 * сверяет, что правила дают в ней ровно эти годы (tests/chronology-k1.test.ts).
 *
 * Все потребители — паспорт, мини-шкала, § 8 и § 13 карточки, панель «Эпохи», полосы эпох на небе, меридианы
 * событий, полоса времени — берут эпохи из данных модели (ModelData.epochs), а их строит эта функция.
 */
import type { Epoch } from '../data/types.ts';
import { toAstro, toHist, formatYear, yearsWord } from './years.ts';

/** Год границы или события: рождение (или смерть) лица плюс years лет. */
export interface EpochRule {
  person: string;
  years?: number;
  of?: 'birth' | 'death';
}

/**
 * Эпоха с правилами границ (data/epochs.json). Основание пишется годами модели (этап 13, решение 99; X1 А4): в тексте
 * basis метки {start}, {end} — годы границ («4174 г. до Р. Х.»), {years} — длина эпохи («1656 лет»); basisBy — своё
 * основание для модели, где меняются сами числа (Фарре 70 лет, 215 лет в Египте, числа в скобках).
 */
export type RuledEpoch = Omit<Epoch, 'events'> & {
  startRule?: EpochRule;
  endRule?: EpochRule;
  basisBy?: Partial<Record<string, string>>;
  events: (Epoch['events'][number] & { rule?: EpochRule })[];
};

/** Основание эпохи годами модели: basisBy[модель] или basis, метки {start}, {end}, {years} — годы этой эпохи. */
export function epochBasis(e: RuledEpoch | Epoch, modelId?: string): string {
  const r = e as RuledEpoch;
  const text = (modelId && r.basisBy?.[modelId]) || e.basis;
  return text
    .replace(/\{start\}/g, formatYear(toAstro(e.start)))
    .replace(/\{end\}/g, formatYear(toAstro(e.end)))
    .replace(/\{years\}/g, yearsWord(toAstro(e.end) - toAstro(e.start)));
}

/**
 * Эпохи в годах модели. yearOf — год рождения или смерти лица в этой модели (астрономический) или null,
 * если он не закреплён числами текста; тогда остаётся год из данных. Возвращает новые объекты (исторические годы).
 */
export function modelEpochs(epochs: Epoch[], yearOf: (id: string, of: 'birth' | 'death') => number | null, modelId?: string): Epoch[] {
  const at = (r: EpochRule | undefined, fallback: number): number => {
    if (!r) return fallback;
    const y = yearOf(r.person, r.of ?? 'birth');
    return y === null ? fallback : toHist(y + (r.years ?? 0));
  };
  return (epochs as RuledEpoch[]).map((e): Epoch => {
    const { basisBy, ...rest } = e;
    void basisBy;
    const out = {
      ...rest,
      start: at(e.startRule, e.start),
      end: at(e.endRule, e.end),
      events: e.events.map((ev) => (ev.rule ? { ...ev, year: at(ev.rule, ev.year) } : ev)),
    } as Epoch;
    out.basis = epochBasis({ ...e, start: out.start, end: out.end }, modelId);
    return out;
  });
}

/** Отличия эпох модели от эпох модели по умолчанию — для файла модели (tools/build-data.ts): id → [начало, конец, годы событий, основание]. */
export type EpochDelta = Record<string, [number, number, number[], string?]>;
export function epochDelta(base: Epoch[], model: Epoch[]): EpochDelta {
  const out: EpochDelta = {};
  base.forEach((e, i) => {
    const m = model[i];
    const basis = m.basis !== e.basis;
    if (basis || m.start !== e.start || m.end !== e.end || m.events.some((ev, k) => ev.year !== e.events[k].year)) out[e.id] = [m.start, m.end, m.events.map((ev) => ev.year), ...(basis ? [m.basis] : [])] as EpochDelta[string];
  });
  return out;
}

/** Эпохи модели из эпох модели по умолчанию и отличий (src/data/atlas.ts). */
export function applyEpochDelta(base: Epoch[], delta: EpochDelta | undefined): Epoch[] {
  if (!delta) return base;
  return base.map((e) => {
    const d = delta[e.id];
    return d ? { ...e, start: d[0], end: d[1], events: e.events.map((ev, k) => ({ ...ev, year: d[2][k] ?? ev.year })), ...(d[3] !== undefined ? { basis: d[3] } : {}) } : e;
  });
}
