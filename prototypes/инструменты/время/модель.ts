/**
 * Модель Времени для прототипа (04 § 3): годы жизни по числам текста, цепочка расчёта со стихами, царствования.
 * Годы в данных исторические (−1010 = 1010 г. до Р. Х., нулевого года нет); расчёт — через `core/years.ts`.
 *  - «Жизни» праотцев: счёт от сотворения Адама (Быт 5:1–3): рождение сына — возраст отца при рождении (основной текст,
 *    числа в скобках не берутся — 02 § 3.8), смерть — возраст при смерти; год до Р. Х. — расчёт от начала эпохи 1 в базе.
 *  - Лица с готовым годом (`born.year`, Моисей и Аарон) — расчёт базы от опоры без издания и страницы: только второй слой.
 *  - Царствования — годы реконструкции из базы: схема не названа, таблиц McFall — Young и Тиле нет (04 § 3.8, § 16) — справочно.
 */
import { Д, имя } from '../общее/данные.ts';
import { число } from '../общее/службы.ts';
import { addYears, yearsBetween } from '../../../core/years.ts';
import type { Chrono, Reign } from '../общее/типы.ts';

export interface Звено { text: string; refs: string[]; cert?: string }
export interface Жизнь {
  id: string;
  имя: string;
  от?: number;
  до?: number;
  /** От сотворения Адама (только для родословия Быт 5; 11). */
  amОт?: number;
  amДо?: number;
  /** Длина по числам текста — сплошная; иначе полая (04 § 3.4). */
  сплошная: boolean;
  /** Год до Р. Х. держится на опоре без издания — только второй слой. */
  опора?: boolean;
  цепочка: Звено[];
  ключ: string;
  нет?: string;
}

const НАЧАЛО = () => Д.epochs.find((e) => e.id === 'era-antediluvian')?.start ?? -4174;
/** Отец по ребру происхождения (основное, роль «отец»). */
function отец(id: string): string | undefined {
  const o = Д.tools.origins.find((x) => `p-${x.c}` === id && x.r === 'f' && x.p && x.pr);
  return o ? `p-${o.p}` : undefined;
}

const кэш = new Map<string, Жизнь>();
export function жизнь(id: string): Жизнь {
  const hit = кэш.get(id);
  if (hit) return hit;
  const c: Chrono | undefined = Д.chrono.get(id);
  const out: Жизнь = { id, имя: имя(id), сплошная: true, цепочка: [], ключ: `chrono:${id}` };
  кэш.set(id, out);
  if (!c) {
    out.нет = 'Мы ещё не проверили, когда он жил';
    return out;
  }
  const ch = c.chrono;
  if (id === 'p-adam') {
    out.amОт = 0;
    out.цепочка.push({ text: 'Счёт лет — от сотворения Адама: «в день сотворения их»', refs: ['Быт 5:1-2'] });
  } else if (ch.born?.fatherAge !== undefined) {
    const f = отец(id);
    const pf = f ? жизнь(f) : undefined;
    if (pf?.amОт !== undefined) {
      out.amОт = pf.amОт + ch.born.fatherAge;
      out.цепочка.push(...pf.цепочка.filter((z) => !z.text.includes('всего лет жизни')), { text: `${out.имя}: возраст отца (${pf.имя}) при рождении — ${число(ch.born.fatherAge, ['год', 'года', 'лет'])}`, refs: ch.born.refs, cert: ch.born.cert });
      if (ch.born.cert === 'inference') out.сплошная = true; // вывод из двух стихов — сплошное со словом (04 § 3.3)
    }
  } else if (ch.born?.year !== undefined) {
    out.от = ch.born.year;
    out.опора = true;
    out.цепочка.push({ text: `Год рождения — расчёт базы: ${ch.born.note ?? ''}`, refs: ch.born.refs, cert: 'calc' });
  }
  if (out.amОт !== undefined) out.от = addYears(НАЧАЛО(), out.amОт);
  if (ch.died?.age !== undefined) {
    if (out.amОт !== undefined) out.amДо = out.amОт + ch.died.age;
    if (out.от !== undefined) out.до = addYears(out.от, ch.died.age);
    out.цепочка.push({ text: `${out.имя}: всего лет жизни — ${число(ch.died.age, ['год', 'года', 'лет'])}`, refs: ch.died.refs, cert: ch.died.cert });
  } else if (ch.died?.year !== undefined) {
    out.до = ch.died.year;
    out.сплошная = false;
  }
  if (out.от === undefined && out.до === undefined) {
    if (ch.born?.fatherAgeBracket !== undefined || ch.died?.ageBracket !== undefined) out.нет = 'Числа о нём стоят только в скобках — по ним год не считается';
    else out.нет = 'Когда он жил, по числам Библии не посчитать';
  }
  return out;
}

/** Подпись «от сотворения Адама» (04 § 3.1): «в 1056 г. от сотворения Адама (расч.)». */
export const am = (n: number) => `${n.toLocaleString('ru-RU')}`;
export const лет = yearsBetween;

export interface Царствование extends Reign { id: string; имя: string }
export function царствования(from: number, to: number): Царствование[] {
  const out: Царствование[] = [];
  for (const c of Д.chrono.values()) for (const r of c.chrono.reign ?? []) {
    if (r.end >= from && r.start <= to && (r.over === 'Иудея' || r.over === 'Израиль')) out.push({ ...r, id: c.actor, имя: имя(c.actor) });
  }
  return out.sort((a, b) => a.start - b.start);
}
