/**
 * Префиксы номеров (02 § 3.3.1) и сокращение номеров в пакетах сборки (02 § 8.1; К-6).
 *
 * Вид записи — до первого дефиса, но префиксы бывают и в две-три буквы (`era-`, `lm-`, `cl-`, `an-`, `tn-`): прежнее
 * `slice(2)` портило их (`era-judges` → `a-judges`, прежний номер эпохи `judges` → `dges`). Пакет сокращает номер только
 * по известному префиксу своего вида, а обратное восстановление даёт исходный номер (тест).
 */

/** Префикс → вид записи (02 § 3.3.1, таблица префиксов). */
export const ID_PREFIXES = {
  'p-': 'действующее лицо', 'u-': 'союз', 'o-': 'ребро происхождения', 'k-': 'родство словами', 'a-': 'утверждение лица',
  'r-': 'набор прочтений', 'g-': 'область', 'ar-': 'отношение лиц', 'pm-': 'упоминание лица', 'x-': 'соответствие',
  'e-': 'история', 'l-': 'место', 'lm-': 'упоминание места', 'lc-': 'утверждение о городе', 'lb-': 'предел', 'rt-': 'путь',
  'c-': 'связь', 'cl-': 'длительная связь', 'un-': 'понимание', 'era-': 'эпоха', 'm-': 'модель хронологии', 's-': 'схема царей',
  'an-': 'опора', 't-': 'хронологический вход', 'tn-': 'напряжение хронологии', 'tp-': 'параллельные тексты',
  'src-': 'источник реестра', 'w-': 'труд',
} as const;
export type IdPrefix = keyof typeof ID_PREFIXES;

/** Префикс номера: самый длинный известный префикс, с которого номер начинается; нет — undefined (прежний номер). */
export function prefixOf(id: string): IdPrefix | undefined {
  const m = /^([a-z]+-)/.exec(id);
  return m && m[1] in ID_PREFIXES ? (m[1] as IdPrefix) : undefined;
}

/** Номер без префикса своего вида; номер другого вида — ошибка (а не тихая порча, как `slice(2)`). */
export function shortId(id: string, prefix: IdPrefix): string {
  if (!id.startsWith(prefix) || prefixOf(id) !== prefix) throw new Error(`номер «${id}» — не вида ${prefix} (${ID_PREFIXES[prefix]})`);
  return id.slice(prefix.length);
}

/** Обратное восстановление: короткий номер вида → полный номер. */
export const fullId = (short: string, prefix: IdPrefix) => `${prefix}${short}`;

/**
 * Номер переадресации в пакете (виды смешаны): номер лица — без `p-`, прочие — полностью. Прежний номер без префикса
 * (`judges`, `solomon-4`) сам по себе неотличим от короткого номера лица, поэтому строка переадресации, где есть не
 * лицо, несёт третий элемент `0`: «номера полные» (`redirectRow`, `redirectBack`).
 */
export function redirectRow(from: string, to: string[]): [string, string[]] | [string, string[], 0] {
  const all = [from, ...to];
  if (all.every((x) => prefixOf(x) === 'p-')) return [shortId(from, 'p-'), to.map((x) => shortId(x, 'p-'))];
  return [from, to, 0];
}
export function redirectBack(row: [string, string[]] | [string, string[], 0]): { from: string; to: string[] } {
  if (row.length === 3) return { from: row[0], to: row[1] };
  return { from: fullId(row[0], 'p-'), to: row[1].map((x) => fullId(x, 'p-')) };
}
