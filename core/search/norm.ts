/**
 * Нормализация и раскладка (11 § 3.6 (а), (б)). Ядро без DOM.
 *
 * Перенесено копией из пробы П-Т3 (`prototypes/П-Т3/core/`, 11 октября 2026) по 10 § 3.1 п. 4: тесты — `tests/core-search.test.ts`;
 * рецензия переноса по правилам продукта (данные и интерфейс) ещё не проведена — до неё код не меняет поведения пробы.
 */

/**
 * NFC (ввод из PDF и файлов macOS приходит разложенным: «и» + U+0306), нижний регистр, «ё» = «е», без знаков ударения,
 * тире внутри слова = дефис (рецензия данных, № 6; UAX #15).
 */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300\u0301]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(?<=[а-я])[—–](?=[а-я])/g, '-');
}

/** Слова русского текста: буквы и дефис внутри слова. */
export const WORD_RE = /[а-яё]+(?:-[а-яё]+)*/gi;

export function words(s: string): string[] {
  return norm(s).match(/[а-я]+(?:-[а-я]+)*/g) ?? [];
}

// Раскладка ЙЦУКЕН ↔ QWERTY (стандартные раскладки Windows и macOS «Русская» и «ABC/US»).
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const EN2RU = new Map<string, string>();
const RU2EN = new Map<string, string>();
for (let i = 0; i < EN.length; i++) {
  EN2RU.set(EN[i], RU[i]);
  RU2EN.set(RU[i], EN[i]);
  const up = EN[i].toUpperCase();
  if (up !== EN[i]) EN2RU.set(up, RU[i].toUpperCase());
  RU2EN.set(RU[i].toUpperCase(), up !== EN[i] ? up : EN[i]);
}
// Знаки, которые на латинской раскладке стоят на месте русских букв, переводятся только внутри слова:
// иначе «Mark.6.35» или «Ин 3:16; Рим 8:28» потеряли бы точки и точку с запятой.
const PUNCT = new Set(['[', ']', ';', "'", ',', '.', '`']);

/** Перевод латинской раскладки в русскую: «Yjq» → «Ной», «Vr 6:35» → «Мк 6:35». */
export function enToRu(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (PUNCT.has(c)) {
      // знак внутри слова или на его краю («[kt,» → «хлеб»), но не рядом с числом («Mark.6.35», «3:16; Рим»)
      const prev = s[i - 1] ?? '';
      const next = s[i + 1] ?? '';
      const edge = (x: string) => x === '' || /\s/.test(x);
      const letter = (x: string) => /[a-z]/i.test(x);
      const ok = (letter(prev) || edge(prev)) && (letter(next) || edge(next)) && (letter(prev) || letter(next));
      out += ok ? EN2RU.get(c)! : c;
    } else out += EN2RU.get(c) ?? c;
  }
  return out;
}

/** Перевод русской раскладки в латинскую (английские названия книг, набранные в русской раскладке). */
export function ruToEn(s: string): string {
  let out = '';
  for (const c of s) out += RU2EN.get(c) ?? c;
  return out;
}

export const hasLatin = (s: string) => /[a-z]/i.test(s);
export const hasCyr = (s: string) => /[а-яё]/i.test(s);

/**
 * Расстояние Дамерау — Левенштейна в ограниченном виде (вставка, пропуск, замена, перестановка соседних букв;
 * 11 § 3.6 (б)). MiniSearch считает перестановку двумя ошибками, поэтому кандидаты проверяются здесь.
 */
export function osa(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array<number>(m).fill(0)]);
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[n][m];
}

/** Сколько ошибок допускается: до 5 букв — одна, длиннее — две (11 § 3.6 (б)). */
export const allowedErrors = (word: string) => (word.length <= 5 ? 1 : 2);

// Транслит для номеров и кодов адреса (из `src/engine/text.ts`, после проверки): «Иессей» → «iessey».
const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translit(s: string): string {
  return norm(s)
    .split('')
    .map((c) => (c in TR ? TR[c] : /[a-z0-9]/.test(c) ? c : '-'))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
