/**
 * Книги: синодальные сокращения, названия, протестантские названия, английские названия и OSIS (11 § 3.6 (в)).
 * Порядок — Синодальное издание (соборные послания перед Павловыми). Основа — `src/engine/books.ts`
 * (сокращения и названия сверены), дополнено для разбора адресов.
 */
export interface Book {
  /** Синодальное сокращение без пробела: «1Цар». */
  code: string;
  /** Как пишется в ссылке: «1 Цар». */
  short: string;
  name: string;
  osis: string;
  /** Код в адресе страницы (09 § 4.4.1): транслит сокращения. */
  slug: string;
  /** Другие русские названия и формы (родительный падеж, «Евангелие от …»). */
  ru: string[];
  /** Протестантские русские названия (другая нумерация книг Царств): показывают строку «В Синодальном переводе: …». */
  prot?: string[];
  /** Английские названия и сокращения (западная нумерация). */
  en: string[];
}

// code | short | name | osis | slug | русские формы | протестантские | английские
const RAW: [string, string, string, string, string, string, string, string][] = [
  ['Быт', 'Быт', 'Бытие', 'Gen', 'byt', 'бытие|бытия|книга бытия', '', 'genesis|gen|gn'],
  ['Исх', 'Исх', 'Исход', 'Exod', 'iskh', 'исход|исхода|книга исхода', '', 'exodus|exod|ex|exo'],
  ['Лев', 'Лев', 'Левит', 'Lev', 'lev', 'левит|книга левит', '', 'leviticus|lev|lv'],
  ['Чис', 'Чис', 'Числа', 'Num', 'chis', 'числа|чисел|книга чисел', '', 'numbers|num|nm'],
  ['Втор', 'Втор', 'Второзаконие', 'Deut', 'vtor', 'второзаконие|второзакония', '', 'deuteronomy|deut|dt'],
  ['Нав', 'Нав', 'Иисус Навин', 'Josh', 'nav', 'иисус навин|иисуса навина|навин|навина', '', 'joshua|josh|jos'],
  ['Суд', 'Суд', 'Судьи', 'Judg', 'sud', 'судьи|судей|книга судей', '', 'judges|judg|jdg'],
  ['Руф', 'Руф', 'Руфь', 'Ruth', 'ruf', 'руфь|руфи|книга руфи', '', 'ruth|ru'],
  ['1Цар', '1 Цар', '1-я Царств', '1Sam', '1tsar', '1 царств', '1 самуила', '1 samuel|1sam|1sa|1 sam'],
  ['2Цар', '2 Цар', '2-я Царств', '2Sam', '2tsar', '2 царств', '2 самуила', '2 samuel|2sam|2sa|2 sam'],
  ['3Цар', '3 Цар', '3-я Царств', '1Kgs', '3tsar', '3 царств', '1 царей', '1 kings|1kgs|1ki|1 kgs'],
  ['4Цар', '4 Цар', '4-я Царств', '2Kgs', '4tsar', '4 царств', '2 царей', '2 kings|2kgs|2ki|2 kgs'],
  ['1Пар', '1 Пар', '1-я Паралипоменон', '1Chr', '1par', '1 паралипоменон', '1 хроник|1 летопись', '1 chronicles|1chr|1ch|1 chr'],
  ['2Пар', '2 Пар', '2-я Паралипоменон', '2Chr', '2par', '2 паралипоменон', '2 хроник|2 летопись', '2 chronicles|2chr|2ch|2 chr'],
  ['Езд', 'Езд', 'Ездра', 'Ezra', 'ezd', 'ездра|ездры|книга ездры', '', 'ezra|ezr'],
  ['Неем', 'Неем', 'Неемия', 'Neh', 'neem', 'неемия|неемии|книга неемии', '', 'nehemiah|neh'],
  ['Есф', 'Есф', 'Есфирь', 'Esth', 'esf', 'есфирь|есфири|книга есфири', 'эсфирь|эсфири', 'esther|esth|est'],
  ['Иов', 'Иов', 'Иов', 'Job', 'iov', 'иов|иова|книга иова', '', 'job|jb'],
  ['Пс', 'Пс', 'Псалтирь', 'Ps', 'ps', 'псалтирь|псалтыри|псалтири|псалом|псалмы|пслт', '', 'psalms|psalm|ps|psa|pss'],
  ['Притч', 'Притч', 'Притчи', 'Prov', 'pritch', 'притчи|притчей|притч|книга притчей', '', 'proverbs|prov|pr|prv'],
  ['Еккл', 'Еккл', 'Екклесиаст', 'Eccl', 'yekkl', 'екклесиаст|екклесиаста|екк', 'экклезиаст|экклезиаста', 'ecclesiastes|eccl|ecc|qoh'],
  ['Песн', 'Песн', 'Песнь песней', 'Song', 'pesn', 'песнь песней|песни песней|песнь песней соломона', '', 'song of solomon|song of songs|song|sng|sos'],
  ['Ис', 'Ис', 'Исаия', 'Isa', 'is', 'исаия|исаии|книга исаии|пророка исаии', '', 'isaiah|isa|is'],
  ['Иер', 'Иер', 'Иеремия', 'Jer', 'ier', 'иеремия|иеремии|книга иеремии', '', 'jeremiah|jer|je'],
  ['Плач', 'Плач', 'Плач Иеремии', 'Lam', 'plach', 'плач иеремии|плач', '', 'lamentations|lam|la'],
  ['Иез', 'Иез', 'Иезекииль', 'Ezek', 'iez', 'иезекииль|иезекииля|книга иезекииля', '', 'ezekiel|ezek|eze|ezk'],
  ['Дан', 'Дан', 'Даниил', 'Dan', 'dan', 'даниил|даниила|книга даниила', '', 'daniel|dan|dn'],
  ['Ос', 'Ос', 'Осия', 'Hos', 'os', 'осия|осии|книга осии', '', 'hosea|hos|ho'],
  ['Иоил', 'Иоил', 'Иоиль', 'Joel', 'ioil', 'иоиль|иоиля|книга иоиля', '', 'joel|jl'],
  ['Ам', 'Ам', 'Амос', 'Amos', 'am', 'амос|амоса|книга амоса', '', 'amos|am'],
  ['Авд', 'Авд', 'Авдий', 'Obad', 'avd', 'авдий|авдия|книга авдия', '', 'obadiah|obad|ob'],
  ['Ион', 'Ион', 'Иона', 'Jonah', 'ion', 'иона|ионы|книга ионы', '', 'jonah|jon|jnh'],
  ['Мих', 'Мих', 'Михей', 'Mic', 'mikh', 'михей|михея|книга михея', '', 'micah|mic|mi'],
  ['Наум', 'Наум', 'Наум', 'Nah', 'naum', 'наум|наума|книга наума', '', 'nahum|nah|na'],
  ['Авв', 'Авв', 'Аввакум', 'Hab', 'avv', 'аввакум|аввакума|книга аввакума', '', 'habakkuk|hab|hb'],
  ['Соф', 'Соф', 'Софония', 'Zeph', 'sof', 'софония|софонии|книга софонии', '', 'zephaniah|zeph|zep'],
  ['Агг', 'Агг', 'Аггей', 'Hag', 'agg', 'аггей|аггея|книга аггея', '', 'haggai|hag|hg'],
  ['Зах', 'Зах', 'Захария', 'Zech', 'zakh', 'захария|захарии|книга захарии', '', 'zechariah|zech|zec'],
  ['Мал', 'Мал', 'Малахия', 'Mal', 'mal', 'малахия|малахии|книга малахии', '', 'malachi|mal|ml'],
  ['Мф', 'Мф', 'От Матфея', 'Matt', 'mf', 'матфея|от матфея|евангелие от матфея|мат|матф', '', 'matthew|matt|mt|mat'],
  ['Мк', 'Мк', 'От Марка', 'Mark', 'mk', 'марка|от марка|евангелие от марка|мар|марк', '', 'mark|mk|mrk|mar'],
  ['Лк', 'Лк', 'От Луки', 'Luke', 'lk', 'луки|от луки|евангелие от луки|лук', '', 'luke|lk|luk'],
  ['Ин', 'Ин', 'От Иоанна', 'John', 'in', 'иоанна|от иоанна|евангелие от иоанна|иоан', '', 'john|jn|jhn'],
  ['Деян', 'Деян', 'Деяния', 'Acts', 'deyan', 'деяния|деяния апостолов|деян', '', 'acts|act'],
  ['Иак', 'Иак', 'Иакова', 'Jas', 'iak', 'иакова|послание иакова', '', 'james|jas|jms'],
  ['1Пет', '1 Пет', '1-е Петра', '1Pet', '1pet', '1 петра', '', '1 peter|1pet|1pe|1 pet'],
  ['2Пет', '2 Пет', '2-е Петра', '2Pet', '2pet', '2 петра', '', '2 peter|2pet|2pe|2 pet'],
  ['1Ин', '1 Ин', '1-е Иоанна', '1John', '1in', '1 иоанна', '', '1 john|1john|1jn|1 jn'],
  ['2Ин', '2 Ин', '2-е Иоанна', '2John', '2in', '2 иоанна', '', '2 john|2john|2jn|2 jn'],
  ['3Ин', '3 Ин', '3-е Иоанна', '3John', '3in', '3 иоанна', '', '3 john|3john|3jn|3 jn'],
  ['Иуд', 'Иуд', 'Иуды', 'Jude', 'iud', 'иуды|послание иуды', '', 'jude|jud'],
  ['Рим', 'Рим', 'К римлянам', 'Rom', 'rim', 'римлянам|к римлянам', '', 'romans|rom|ro'],
  ['1Кор', '1 Кор', '1-е к коринфянам', '1Cor', '1kor', '1 коринфянам|1 к коринфянам', '', '1 corinthians|1cor|1co|1 cor'],
  ['2Кор', '2 Кор', '2-е к коринфянам', '2Cor', '2kor', '2 коринфянам|2 к коринфянам', '', '2 corinthians|2cor|2co|2 cor'],
  ['Гал', 'Гал', 'К галатам', 'Gal', 'gal', 'галатам|к галатам', '', 'galatians|gal|ga'],
  ['Еф', 'Еф', 'К ефесянам', 'Eph', 'yef', 'ефесянам|к ефесянам', 'эфесянам|к эфесянам', 'ephesians|eph'],
  ['Флп', 'Флп', 'К филиппийцам', 'Phil', 'flp', 'филиппийцам|к филиппийцам|фил', '', 'philippians|phil|php'],
  ['Кол', 'Кол', 'К колоссянам', 'Col', 'kol', 'колоссянам|к колоссянам', '', 'colossians|col'],
  ['1Фес', '1 Фес', '1-е к фессалоникийцам', '1Thess', '1fes', '1 фессалоникийцам|1 к фессалоникийцам', '', '1 thessalonians|1thess|1th|1 thess'],
  ['2Фес', '2 Фес', '2-е к фессалоникийцам', '2Thess', '2fes', '2 фессалоникийцам|2 к фессалоникийцам', '', '2 thessalonians|2thess|2th|2 thess'],
  ['1Тим', '1 Тим', '1-е к Тимофею', '1Tim', '1tim', '1 тимофею|1 к тимофею', '', '1 timothy|1tim|1ti|1 tim'],
  ['2Тим', '2 Тим', '2-е к Тимофею', '2Tim', '2tim', '2 тимофею|2 к тимофею', '', '2 timothy|2tim|2ti|2 tim'],
  ['Тит', 'Тит', 'К Титу', 'Titus', 'tit', 'титу|к титу', '', 'titus|tit'],
  ['Флм', 'Флм', 'К Филимону', 'Phlm', 'flm', 'филимону|к филимону', '', 'philemon|phlm|phm'],
  ['Евр', 'Евр', 'К евреям', 'Heb', 'yevr', 'евреям|к евреям', '', 'hebrews|heb'],
  ['Откр', 'Откр', 'Откровение', 'Rev', 'otkr', 'откровение|откровение иоанна|апокалипсис|откр', '', 'revelation|rev|rv|apocalypse'],
];

export const BOOKS: Book[] = RAW.map(([code, short, name, osis, slug, ru, prot, en]) => ({
  code,
  short,
  name,
  osis,
  slug,
  ru: ru ? ru.split('|') : [],
  prot: prot ? prot.split('|') : undefined,
  en: en.split('|'),
}));

export const BOOK_BY_CODE = new Map(BOOKS.map((b) => [b.code, b]));
export const BOOK_ORDER = new Map(BOOKS.map((b, i) => [b.code, i]));

/** Ключ названия книги: нижний регистр, «ё» = «е», без точек и лишних пробелов, «1-я», «1-е», «I» → «1». */
export function bookKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\./g, ' ')
    .replace(/^\s*(iii|ii|i)\s+/i, (m) => String(m.trim().length) + ' ')
    .replace(/^(\d)\s*-?\s*(я|е|й|го|ое|ая)\b/, '$1')
    .replace(/^(\d)\s*/, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type BookSystem = 'syn' | 'prot' | 'en';
export interface BookHit {
  book: Book;
  /** Чья нумерация и название: синодальные, протестантские русские, английские / OSIS (западная нумерация). */
  system: BookSystem;
}

const LOOKUP = new Map<string, BookHit>();
for (const b of BOOKS) {
  const put = (k: string, system: BookSystem) => {
    const key = bookKey(k);
    if (!LOOKUP.has(key)) LOOKUP.set(key, { book: b, system });
  };
  put(b.code, 'syn');
  put(b.short, 'syn');
  put(b.name, 'syn');
  for (const r of b.ru) put(r, 'syn');
}
for (const b of BOOKS) for (const p of b.prot ?? []) if (!LOOKUP.has(bookKey(p))) LOOKUP.set(bookKey(p), { book: b, system: 'prot' });
for (const b of BOOKS) {
  for (const e of [...b.en, b.osis]) {
    const key = bookKey(e);
    if (!LOOKUP.has(key)) LOOKUP.set(key, { book: b, system: 'en' });
  }
}

export function findBook(s: string): BookHit | null {
  return LOOKUP.get(bookKey(s)) ?? null;
}

/** Книга по одному слову без чисел («Иона», «Бытие»): только полные названия, не сокращения («Лев», «Суд», «Рим»). */
const BY_NAME = new Map<string, Book>();
for (const b of BOOKS) for (const n of [b.name, ...b.ru]) if (n.length >= 4 || n === b.name.toLowerCase() || n === b.name) BY_NAME.set(bookKey(n), b);
export function findBookByName(s: string): Book | null {
  return BY_NAME.get(bookKey(s)) ?? null;
}
