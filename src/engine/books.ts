/** 66 канонических книг в порядке Синодального издания. */
export interface Book {
  code: string; // сокращение в ссылках
  name: string; // полное название
  gen: string; // в родительном падеже для «Книга …»
  t: 'ot' | 'nt';
}

export const BOOKS: Book[] = [
  { code: 'Быт', name: 'Бытие', gen: 'Бытия', t: 'ot' },
  { code: 'Исх', name: 'Исход', gen: 'Исхода', t: 'ot' },
  { code: 'Лев', name: 'Левит', gen: 'Левит', t: 'ot' },
  { code: 'Чис', name: 'Числа', gen: 'Чисел', t: 'ot' },
  { code: 'Втор', name: 'Второзаконие', gen: 'Второзакония', t: 'ot' },
  { code: 'Нав', name: 'Иисус Навин', gen: 'Иисуса Навина', t: 'ot' },
  { code: 'Суд', name: 'Судьи', gen: 'Судей', t: 'ot' },
  { code: 'Руф', name: 'Руфь', gen: 'Руфи', t: 'ot' },
  { code: '1Цар', name: '1-я Царств', gen: '1-й Царств', t: 'ot' },
  { code: '2Цар', name: '2-я Царств', gen: '2-й Царств', t: 'ot' },
  { code: '3Цар', name: '3-я Царств', gen: '3-й Царств', t: 'ot' },
  { code: '4Цар', name: '4-я Царств', gen: '4-й Царств', t: 'ot' },
  { code: '1Пар', name: '1-я Паралипоменон', gen: '1-й Паралипоменон', t: 'ot' },
  { code: '2Пар', name: '2-я Паралипоменон', gen: '2-й Паралипоменон', t: 'ot' },
  { code: 'Езд', name: 'Ездра', gen: 'Ездры', t: 'ot' },
  { code: 'Неем', name: 'Неемия', gen: 'Неемии', t: 'ot' },
  { code: 'Есф', name: 'Есфирь', gen: 'Есфири', t: 'ot' },
  { code: 'Иов', name: 'Иов', gen: 'Иова', t: 'ot' },
  { code: 'Пс', name: 'Псалтирь', gen: 'Псалтири', t: 'ot' },
  { code: 'Притч', name: 'Притчи', gen: 'Притчей', t: 'ot' },
  { code: 'Еккл', name: 'Екклесиаст', gen: 'Екклесиаста', t: 'ot' },
  { code: 'Песн', name: 'Песнь песней', gen: 'Песни песней', t: 'ot' },
  { code: 'Ис', name: 'Исаия', gen: 'Исаии', t: 'ot' },
  { code: 'Иер', name: 'Иеремия', gen: 'Иеремии', t: 'ot' },
  { code: 'Плач', name: 'Плач Иеремии', gen: 'Плача Иеремии', t: 'ot' },
  { code: 'Иез', name: 'Иезекииль', gen: 'Иезекииля', t: 'ot' },
  { code: 'Дан', name: 'Даниил', gen: 'Даниила', t: 'ot' },
  { code: 'Ос', name: 'Осия', gen: 'Осии', t: 'ot' },
  { code: 'Иоил', name: 'Иоиль', gen: 'Иоиля', t: 'ot' },
  { code: 'Ам', name: 'Амос', gen: 'Амоса', t: 'ot' },
  { code: 'Авд', name: 'Авдий', gen: 'Авдия', t: 'ot' },
  { code: 'Ион', name: 'Иона', gen: 'Ионы', t: 'ot' },
  { code: 'Мих', name: 'Михей', gen: 'Михея', t: 'ot' },
  { code: 'Наум', name: 'Наум', gen: 'Наума', t: 'ot' },
  { code: 'Авв', name: 'Аввакум', gen: 'Аввакума', t: 'ot' },
  { code: 'Соф', name: 'Софония', gen: 'Софонии', t: 'ot' },
  { code: 'Агг', name: 'Аггей', gen: 'Аггея', t: 'ot' },
  { code: 'Зах', name: 'Захария', gen: 'Захарии', t: 'ot' },
  { code: 'Мал', name: 'Малахия', gen: 'Малахии', t: 'ot' },
  { code: 'Мф', name: 'От Матфея', gen: 'от Матфея', t: 'nt' },
  { code: 'Мк', name: 'От Марка', gen: 'от Марка', t: 'nt' },
  { code: 'Лк', name: 'От Луки', gen: 'от Луки', t: 'nt' },
  { code: 'Ин', name: 'От Иоанна', gen: 'от Иоанна', t: 'nt' },
  { code: 'Деян', name: 'Деяния', gen: 'Деяний', t: 'nt' },
  { code: 'Иак', name: 'Иакова', gen: 'Иакова', t: 'nt' },
  { code: '1Пет', name: '1-е Петра', gen: '1-го Петра', t: 'nt' },
  { code: '2Пет', name: '2-е Петра', gen: '2-го Петра', t: 'nt' },
  { code: '1Ин', name: '1-е Иоанна', gen: '1-го Иоанна', t: 'nt' },
  { code: '2Ин', name: '2-е Иоанна', gen: '2-го Иоанна', t: 'nt' },
  { code: '3Ин', name: '3-е Иоанна', gen: '3-го Иоанна', t: 'nt' },
  { code: 'Иуд', name: 'Иуды', gen: 'Иуды', t: 'nt' },
  { code: 'Рим', name: 'К римлянам', gen: 'к римлянам', t: 'nt' },
  { code: '1Кор', name: '1-е к коринфянам', gen: '1-го к коринфянам', t: 'nt' },
  { code: '2Кор', name: '2-е к коринфянам', gen: '2-го к коринфянам', t: 'nt' },
  { code: 'Гал', name: 'К галатам', gen: 'к галатам', t: 'nt' },
  { code: 'Еф', name: 'К ефесянам', gen: 'к ефесянам', t: 'nt' },
  { code: 'Флп', name: 'К филиппийцам', gen: 'к филиппийцам', t: 'nt' },
  { code: 'Кол', name: 'К колоссянам', gen: 'к колоссянам', t: 'nt' },
  { code: '1Фес', name: '1-е к фессалоникийцам', gen: '1-го к фессалоникийцам', t: 'nt' },
  { code: '2Фес', name: '2-е к фессалоникийцам', gen: '2-го к фессалоникийцам', t: 'nt' },
  { code: '1Тим', name: '1-е к Тимофею', gen: '1-го к Тимофею', t: 'nt' },
  { code: '2Тим', name: '2-е к Тимофею', gen: '2-го к Тимофею', t: 'nt' },
  { code: 'Тит', name: 'К Титу', gen: 'к Титу', t: 'nt' },
  { code: 'Флм', name: 'К Филимону', gen: 'к Филимону', t: 'nt' },
  { code: 'Евр', name: 'К евреям', gen: 'к евреям', t: 'nt' },
  { code: 'Откр', name: 'Откровение', gen: 'Откровения', t: 'nt' },
];

export const BOOK_INDEX = new Map(BOOKS.map((b, i) => [b.code, i]));

export interface VerseKey {
  book: string;
  chapter: number;
  verse: number;
}

export interface ParsedRef {
  raw: string;
  book: string;
  /** Развёрнутый список стихов (для диапазонов через главы — до 400 стихов). */
  verses: VerseKey[];
  /** Если ссылка на главу без стиха. */
  chapterOnly?: number;
}

const REF_RE = /^\s*([1-4]?[А-Яа-яЁё]+)\s+(\d+)(?::(.+))?\s*$/;

/**
 * Разбор ссылки: «Быт 5:3», «Быт 5:3-5», «Быт 5:3,6,9-11», «Быт 5:32-6:2», «Быт 5» (глава).
 * Возвращает null при неверном формате. Проверку существования стихов делает вызывающий код.
 */
export function parseRef(raw: string, chapterLength?: (book: string, ch: number) => number): ParsedRef | null {
  const m = REF_RE.exec(raw.replace(/[–—]/g, '-'));
  if (!m) return null;
  const book = m[1];
  if (!BOOK_INDEX.has(book)) return null;
  const chapter = Number(m[2]);
  if (!m[3]) return { raw, book, verses: [], chapterOnly: chapter };
  const verses: VerseKey[] = [];
  for (const partRaw of m[3].split(',')) {
    const part = partRaw.trim();
    let mm: RegExpExecArray | null;
    if ((mm = /^(\d+)$/.exec(part))) {
      verses.push({ book, chapter, verse: Number(mm[1]) });
    } else if ((mm = /^(\d+)-(\d+)$/.exec(part))) {
      const a = Number(mm[1]);
      const b = Number(mm[2]);
      if (b < a || b - a > 400) return null;
      for (let v = a; v <= b; v++) verses.push({ book, chapter, verse: v });
    } else if ((mm = /^(\d+)-(\d+):(\d+)$/.exec(part))) {
      // межглавный диапазон
      const a = Number(mm[1]);
      const ch2 = Number(mm[2]);
      const b = Number(mm[3]);
      if (ch2 <= chapter || ch2 - chapter > 3 || !chapterLength) return null;
      for (let c = chapter; c <= ch2; c++) {
        const from = c === chapter ? a : 1;
        const to = c === ch2 ? b : chapterLength(book, c);
        for (let v = from; v <= to; v++) verses.push({ book, chapter: c, verse: v });
      }
    } else {
      return null;
    }
  }
  return { raw, book, verses };
}

export function verseId(v: VerseKey): string {
  return `${v.book} ${v.chapter}:${v.verse}`;
}

/** Сравнение ссылок для сортировки в каноническом порядке. */
export function compareRefs(a: string, b: string): number {
  const pa = parseRef(a);
  const pb = parseRef(b);
  if (!pa || !pb) return a.localeCompare(b);
  const ba = BOOK_INDEX.get(pa.book)!;
  const bb = BOOK_INDEX.get(pb.book)!;
  if (ba !== bb) return ba - bb;
  const ca = pa.verses[0]?.chapter ?? pa.chapterOnly ?? 0;
  const cb = pb.verses[0]?.chapter ?? pb.chapterOnly ?? 0;
  if (ca !== cb) return ca - cb;
  return (pa.verses[0]?.verse ?? 0) - (pb.verses[0]?.verse ?? 0);
}
