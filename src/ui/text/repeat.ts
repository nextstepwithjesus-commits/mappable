/**
 * Повторы в тексте карточки (CARD-56): одна мера сходства для показа и для проверки данных.
 *
 * Сходство меряется по основам значимых слов: слово от четырёх букв, основа — первые четыре буквы (падежи и числа
 * одного слова дают одну основу: «Сарра» и «Сарры», «Агарь» и «Агари», «брат» и «братья»). Служебные и пересказывающие слова («позже»,
 * «названа», «который») не считаются: они не несут сведений.
 *
 * — Карточка (src/ui/card/sections.tsx) не выводит часть пояснения, которая уже сказана строками раздела:
 *   пояснение делится на части по «;», часть, чьи основы на 70 % и больше есть выше, опускается.
 * — Валидатор (tools/validate.ts) предупреждает, если у двух записей одного лица совпадает больше 70 % основ,
 *   и перечисляет такие места для составителей.
 */

/** Слова, которые ничего не сообщают сами: связки пересказа, местоимения, частые наречия. */
const STOP = new Set([
  'позж', 'такж', 'тоже', 'зате', 'когд', 'кото', 'этог', 'этом', 'этой', 'этот', 'назв', 'назы', 'сказ', 'гово', 'кром',
  'того', 'чтоб', 'буде', 'было', 'были', 'была', 'есть', 'него', 'нему', 'свое', 'свою', 'свои', 'всех', 'чере', 'межд',
  'боле', 'мене',
]);

/** Основы значимых слов строки (с повторами — для доли покрытия). */
export function stemsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^а-я]+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 4))
    .filter((w) => !STOP.has(w));
}

/**
 * Доля основ строки `a`, которые есть в наборе `seen`; у строки без значимых слов — 1 (она ничего не добавляет).
 * skip — основы имён лиц раздела: перечень имён сам по себе не новость, новость — слова при них
 * («В Хевроне родились…» при тех же именах — сведение; «Братья — Нахор и Аран» — повтор).
 */
export function coveredShare(a: string, seen: Set<string>, skip: Set<string> = new Set()): number {
  const st = stemsOf(a).filter((w) => !skip.has(w));
  if (!st.length) return 1;
  return st.filter((w) => seen.has(w)).length / st.length;
}

/** Порог повтора: 70 % основ (CARD-56). */
export const REPEAT_SHARE = 0.7;

/**
 * Сходство двух записей: доля общих основ от большей из двух (без повторов): короткая запись, целиком вошедшая
 * в длинную, — ещё не повтор. Короткие записи (меньше четырёх основ)
 * не сравниваются: «Жена», «Сын Иессеев» совпадают с чем угодно.
 */
export function overlap(a: string, b: string): number {
  const x = new Set(stemsOf(a));
  const y = new Set(stemsOf(b));
  if (x.size < 4 || y.size < 4) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size);
}

/**
 * Пояснение без частей, которые уже сказаны выше: части по «; », часть с покрытием ≥ 70 % опускается.
 * null — всё пояснение повторяет сказанное; иначе — оставшиеся части (первая — с прописной).
 */
export function newPart(text: string, seen: Set<string>, skip: Set<string> = new Set()): string | null {
  const parts = text.split(/;\s+/);
  const keep = parts.filter((p) => coveredShare(p, seen, skip) < REPEAT_SHARE);
  if (!keep.length) return null;
  if (keep.length === parts.length) return text;
  const out = keep.join('; ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Добавить основы строки к набору сказанного. */
export function addSeen(seen: Set<string>, ...texts: (string | undefined | null)[]): Set<string> {
  for (const t of texts) if (t) for (const w of stemsOf(t)) seen.add(w);
  return seen;
}
