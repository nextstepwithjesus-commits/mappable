/**
 * Модель «Жизней» прототипа (04 § 3.3–3.4, § 3.8; П-2, П-3): входы хронологии Д6 (`chrono.inputs`) — число текста словами и
 * стихом; вывод — с частями и стихами; выбор модели — с её названием. Годы в данных исторические (−1010 = 1010 г. до Р. Х.).
 *  - Место полосы: от сотворения Адама — сумма возрастов отцов при рождении (Быт 5; 11; числа вне скобок); где текст даёт
 *    только «не меньше» (Аврам: Быт 11:26 и Быт 11:32; 12:4; Деян 7:4), число берёт модель по умолчанию — с её названием.
 *  - Годы до Р. Х. — только второй слой и только с названием модели: начало счёта — начало эпохи «Первый мир» по модели
 *    (Адам), у лиц Исхода — опора «4-й год Соломона» (3 Цар 6:1) и выборы модели.
 *  - Длина полосы — число текста («Прожил … лет» — `age-at-death`, засечка смерти) или «всех дней» без слов о смерти
 *    (`end-of-life`: Енох — «Бог взял его», Быт 5:24; Сим — слов «и умер» вне скобок нет): без засечки.
 */
import { Д, имя } from '../общее/данные.ts';
import { число } from '../общее/службы.ts';
import { addYears } from '../../../core/years.ts';
import type { Chrono, Model, Вход } from '../общее/типы.ts';

export interface Звено { text: string; refs: string[]; cert?: string; цитата?: string; модель?: string; /** Фраза простого слоя (без имени модели, 04 § 2.1). */ простое?: string }

/**
 * Чего в данных нет и что прототип держит сам (задача данных в README): фраза вывода для простого слоя и число стиха, от
 * которого вывод отступает (у Сима вход несёт 502 — вывод, а число Быт 5:32 «пятьсот» отдельным полем не записано).
 */
const ПРОСТОЙ_ВЫВОД: Record<string, string> = {
  'p-avraam': 'Фарра умер двухсот пяти лет (Быт 11:32). Аврам был семидесяти пяти лет, когда вышел из Харрана (Быт 12:4), а вышел он «по смерти отца его» (Деян 7:4). Значит, Фарре при рождении Аврама было не меньше 130 лет.',
  'p-sim': 'Сим был ста лет «чрез два года после потопа» (Быт 11:10), а потоп пришёл, когда Ною было шестьсот лет (Быт 7:6). Значит, Ною при рождении Сима было 502 года.',
};
const ЧИСЛО_СТИХА: Record<string, { n: number; стих: string }> = { 'p-sim': { n: 500, стих: 'Быт 5:32' } };
export interface Жизнь {
  id: string;
  имя: string;
  /** От сотворения Адама (годы счёта). */
  am?: [number, number];
  /** Годы до Р. Х. по модели (второй слой). */
  bc?: [number, number];
  лет?: { n: number; refs: string[]; cert?: string; смерть: boolean; конец?: string; words?: string };
  /** Возраст отца при рождении для таблицы-двойника: число текста со стихом, затем вывод («500 (Быт 5:32); по выводу — 502»). */
  возрастОтца?: string;
  /** Звенья: свои числа текста, выводы, выборы модели. */
  звенья: Звено[];
  /** Положение держится на выборе модели (её название — в звене). */
  выборМодели?: boolean;
  /** Положение — от опоры с годом до Р. Х. (лица Исхода): в простом слое без годов. */
  опора?: boolean;
  ключ: string;
  нет?: string;
}

export const модель = (): Model | undefined => Д.proto.models.find((m) => m.type === 'model' && m.default);
export const схема = (id: string): Model | undefined => Д.proto.models.find((m) => m.id === id);
/**
 * Год сотворения Адама до Р. Х. по модели (второй слой): Исход — опора «4-й год Соломона» минус 479 лет (3 Цар 6:1); приход
 * Иакова в Египет — за 430 лет до Исхода (Исх 12:40, выбор модели), когда Иакову было 130 (Быт 47:9); Иаков — от Адама по
 * возрастам отцов (Быт 5; 11; 21:5; 25:26).
 */
let адамBC: number | null | undefined;
let считается = false;
export function адам(): number | null {
  if (адамBC !== undefined) return адамBC;
  if (считается) return null;
  считается = true;
  // считаем на чистом кэше: иначе лица, которые сейчас в середине расчёта (Ламех, когда Адам вызван из цепочки Ноя), попали бы
  // в цепочку Иакова без своих чисел, и год Адама вышел бы пустым
  кэш.clear();
  const м = модель();
  const опора = Д.proto.anchors.find((a) => a.id === 'an-solomon-4');
  const н479 = м?.choices?.find((c) => c.number === 479)?.number;
  const н430 = м?.choices?.find((c) => c.number === 430)?.number;
  const иаков = жизнь('p-iakov');
  адамBC = опора && н479 && н430 && иаков.am ? addYears(addYears(опора.value, -н479), -(иаков.am[0] + 130 + н430)) : null;
  считается = false;
  кэш.clear(); // лица, посчитанные без года Адама, пересчитываются уже с ним
  return адамBC;
}
/** Год начала или конца эпохи до Р. Х. (второй слой): число из данных или правило — лицо и годы, опора и годы. */
export function годЭпохи(e: { start: unknown; end: unknown }, край: 'start' | 'end'): number | undefined {
  const v = e[край] as number | { rule?: { person?: string; years?: number; anchor?: string; yearsBefore?: number; plus?: number } };
  if (typeof v === 'number') return v;
  const r = v?.rule;
  if (!r) return undefined;
  if (r.anchor) {
    const a = Д.proto.anchors.find((x) => x.id === r.anchor);
    return a ? addYears(a.value, -(r.yearsBefore ?? 0) + (r.plus ?? 0)) : undefined;
  }
  if (r.person) {
    const ж = жизнь(r.person);
    const а = адам();
    if (ж.am && а !== null) return addYears(а, ж.am[0] + (r.years ?? 0));
  }
  return undefined;
}
const НАЧАЛО = () => адам() ?? -4174;

/** Входы лица; прежний вид записи (до Д6) переводится в те же входы. */
function отецПоРебру(id: string): string | undefined {
  const o = Д.tools.origins.find((x) => `p-${x.c}` === id && x.r === 'f' && x.p && x.pr);
  return o ? `p-${o.p}` : undefined;
}
export function входы(c: Chrono | undefined): Вход[] {
  if (!c) return [];
  if (c.chrono.inputs) return c.chrono.inputs;
  const out: Вход[] = [];
  const b = c.chrono.born;
  const d = c.chrono.died;
  const отец = отецПоРебру(c.actor);
  if (b?.fatherAge !== undefined && отец) out.push({ kind: 'age-at-birth', other: отец, number: b.fatherAge, refs: b.refs, cert: b.cert ?? 'scripture' });
  if (d?.age !== undefined) out.push({ kind: 'age-at-death', number: d.age, refs: d.refs, cert: d.cert });
  if (b?.year !== undefined) out.push({ kind: 'born-year', number: b.year, refs: b.refs, cert: 'calc', note: b.note });
  return out;
}

const кэш = new Map<string, Жизнь>();
export function сброситьКэш() {
  кэш.clear();
}

export function жизнь(id: string): Жизнь {
  const hit = кэш.get(id);
  if (hit) return hit;
  const out: Жизнь = { id, имя: имя(id), звенья: [], ключ: `chrono:${id}` };
  кэш.set(id, out);
  const xs = входы(Д.chrono.get(id));
  const м = модель();
  if (!xs.length) {
    out.нет = 'Годы жизни по числам Библии мы ещё не проверили';
    return out;
  }
  // ---- рождение: от сотворения Адама ----
  let am: number | undefined;
  if (id === 'p-adam') {
    am = 0;
    out.звенья.push({ text: 'Счёт лет — от сотворения Адама: «в день сотворения их»', refs: ['Быт 5:1-2'], cert: 'scripture' });
  }
  const рожд = xs.find((x) => x.kind === 'age-at-birth' && x.other);
  if (am === undefined && рожд?.other) {
    const отец = жизнь(рожд.other);
    if (рожд.cert === 'inference' && рожд.parts?.length) {
      // число стиха (Быт 5:32 — «пятьсот лет») — первым, вывод — с частями и подписью
      out.звенья.push({ text: 'Сказано', refs: [рожд.refs[0]], cert: 'scripture', цитата: рожд.refs[0] });
      out.звенья.push({ text: `Вывод: при рождении возраст отца (${отец.имя}) — ${число(рожд.number ?? 0, ['год', 'года', 'лет'])}; ${рожд.parts.map((p) => `${p.number} — ${p.ref}`).join('; ')}`, refs: рожд.parts.map((p) => p.ref), cert: 'inference', простое: ПРОСТОЙ_ВЫВОД[id] });
      const ст = ЧИСЛО_СТИХА[id];
      out.возрастОтца = `${ст ? `${ст.n} (${ст.стих}); ` : ''}по выводу — ${рожд.number}`;
    } else {
      out.возрастОтца = `${рожд.number} (${рожд.refs[0]})`;
    }
    if (!(рожд.cert === 'inference' && рожд.parts?.length))
      out.звенья.push({ text: `Возраст отца (${отец.имя}) при рождении — ${число(рожд.number ?? 0, ['год', 'года', 'лет'])}`, refs: рожд.refs, cert: рожд.cert, ...(рожд.reading && { модель: рожд.reading.set }) });
    if (отец.am && рожд.number !== undefined) am = отец.am[0] + рожд.number;
  }
  const неРаньше = xs.filter((x) => x.kind === 'not-before' && x.of === 'birth' && x.other);
  if (am === undefined && неРаньше.length) {
    const отец = жизнь(неРаньше[0].other!);
    for (const x of неРаньше) {
      if (x.cert === 'scripture') out.звенья.push({ text: 'Сказано', refs: [x.refs[0]], cert: 'scripture', цитата: x.refs[0] });
      else out.звенья.push({ text: `Вывод: возраст отца (${отец.имя}) при рождении — не меньше ${x.number}; ${(x.parts ?? []).map((p) => `${p.number} — ${p.ref}`).join('; ')}`, refs: x.refs, cert: 'inference', простое: ПРОСТОЙ_ВЫВОД[id] });
    }
    out.возрастОтца = неРаньше.map((x) => (x.cert === 'scripture' ? `${x.number} (${x.refs[0]})` : `по выводу — не меньше ${x.number}`)).join('; ');
    const выбор = м?.choices?.find((c) => c.number !== undefined && неРаньше.some((x) => x.number === c.number && x.refs.some((r) => c.refs.includes(r))));
    if (выбор && отец.am) {
      am = отец.am[0] + выбор.number!;
      out.выборМодели = true;
      out.звенья.push({ text: `Выбор модели «${м!.name}»: ${выбор.what}`, refs: выбор.refs, cert: 'model', модель: м!.id, простое: `Мы поставили полосу по ${выбор.number}.` });
    }
  }
  // ---- длина жизни ----
  const смерть = xs.find((x) => x.kind === 'age-at-death');
  const конец = xs.find((x) => x.kind === 'end-of-life');
  if (смерть?.number !== undefined) {
    out.лет = { n: смерть.number, refs: смерть.refs, cert: смерть.cert, смерть: true, words: смерть.words };
    out.звенья.push({ text: `Прожил ${число(смерть.number, ['год', 'года', 'лет'])}`, refs: смерть.refs, cert: смерть.cert });
  } else if (конец?.number !== undefined) {
    out.лет = { n: конец.number, refs: конец.refs, cert: конец.cert, смерть: false, конец: конец.refs[1], words: конец.words };
    out.звенья.push({ text: `Всех дней — ${число(конец.number, ['год', 'года', 'лет'])}${конец.parts ? ` (${конец.parts.map((p) => `${p.number} — ${p.ref}`).join('; ')})` : ''}`, refs: конец.refs, cert: конец.cert });
    if (конец.refs[1]) out.звенья.push({ text: 'Конец земной жизни', refs: [конец.refs[1]], cert: 'scripture', цитата: конец.refs[1] });
  }
  if (am !== undefined) {
    out.am = [am, am + (out.лет?.n ?? 0)];
    if (!считается && адам() !== null) out.bc = [addYears(НАЧАЛО(), am), addYears(НАЧАЛО(), am + (out.лет?.n ?? 0))];
  }
  // ---- лица Исхода: возраст при событии и выбор модели «в год Исхода» (опора 3 Цар 6:1) ----
  const приСобытии = xs.find((x) => x.kind === 'age-at-event' && x.number !== undefined);
  if (am === undefined && приСобытии && м) {
    out.звенья.push({ text: `${приСобытии.event?.text ?? 'Событие'}: возраст — ${число(приСобытии.number!, ['год', 'года', 'лет'])}`, refs: приСобытии.refs, cert: приСобытии.cert });
    const выбор = м.choices?.find((c) => c.refs.some((r) => приСобытии.refs.includes(r)));
    const лет479 = м.choices?.find((c) => c.number === 479);
    const опора = Д.proto.anchors.find((a) => a.id === 'an-solomon-4');
    if (выбор && лет479 && опора) {
      const исход = addYears(опора.value, -лет479.number!);
      const от = addYears(исход, -приСобытии.number!);
      out.bc = [от, addYears(от, out.лет?.n ?? 0)];
      out.опора = true;
      out.звенья.push({ text: `Выбор модели «${м.name}»: ${выбор.what}`, refs: выбор.refs, cert: 'model', модель: м.id });
      out.звенья.push({ text: `Опора модели: ${опора.event} — ${Math.abs(опора.value)} г. до Р. Х.; от Исхода — ${лет479.number} лет`, refs: [опора.verse, ...лет479.refs], cert: 'model', модель: м.id });
    }
  }
  if (!out.am && !out.bc) out.нет = out.лет ? 'Возраст Библия называет, а после кого он родился по счёту лет — нет' : 'Годы жизни по числам Библии не посчитать';
  return out;
}

export const лет = (n: number) => число(n, ['год', 'года', 'лет']);
