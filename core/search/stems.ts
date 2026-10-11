/**
 * Основы обычных слов (09 § 3.5 п. 2): Snowball для русского считается при сборке; на устройство идёт одна таблица
 * «словоформа → длина основы» на весь текст и таблица исключений. Основа короче 3 букв не принимается.
 *
 * Перенесено копией из пробы П-Т3 (`prototypes/П-Т3/core/`, 11 октября 2026) по 10 § 3.1 п. 4: тесты — `tests/core-search.test.ts`;
 * рецензия переноса по правилам продукта (данные и интерфейс) ещё не проведена — до неё код не меняет поведения пробы.
 */

/** Пары однокоренных на вид, но разных слов: формы группы отделяются от общей основы и ищутся только вместе. */
export const EXCEPTIONS: { word: string; forms: string[]; note: string }[] = [
  // «пята» и «пять» дают одну основу «пят» (09 § 3.5 п. 2): формы «пята» — своя группа
  { word: 'пята', forms: ['пята', 'пяты', 'пяте', 'пяту', 'пятою', 'пятам', 'пятами'], note: 'пята (часть ноги) ≠ пять (число)' },
];

export const MIN_STEM = 3;

/** Таблица для устройства: строка «форма<TAB>длина основы» только там, где основа короче формы. */
export function buildStemTable(forms: Iterable<string>, stem: (w: string) => string): string {
  const rows: string[] = [];
  for (const f of [...forms].sort()) {
    const s = stem(f);
    if (s.length < f.length && f.startsWith(s)) rows.push(`${f}\t${s.length}`);
    else if (!f.startsWith(s)) rows.push(`${f}\t${commonPrefix(f, s)}`);
  }
  return rows.join('\n');
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function parseStemTable(tsv: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const line of tsv.split('\n')) {
    const t = line.indexOf('\t');
    if (t > 0) m.set(line.slice(0, t), +line.slice(t + 1));
  }
  return m;
}
