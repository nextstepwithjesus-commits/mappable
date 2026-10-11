/**
 * Адреса стихов в интерфейсе: один форматер ядра (`core/refs.ts`, грамматика 08 § 6.1 п. 16) поверх ссылок данных
 * («Быт 6:9-9:17», «1Цар 17:1-58», «Мф 9:18-19; Мф 9:23-26»). Видимое — сокращение; для программы чтения — полный адрес.
 */
import { bookShort, formatRefs, spokenRefs, type Span } from '../../../core/refs.ts';
import { BOOK_BY_CODE } from '../../../core/books.ts';

const RE = /^\s*([1-4]?[А-Яа-яЁё]+)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?)?\s*$/;

/** Ссылка данных → отрезки. Список через «;» и стихи через «,» в одной главе. Неверная — пусто. */
export function отрезки(ref: string): Span[] {
  const out: Span[] = [];
  let book = '';
  let ch = 0;
  for (const raw of ref.split(';')) {
    const piece = raw.trim();
    if (!piece) continue;
    const parts = piece.split(',');
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i].trim();
      if (i > 0 && /^\d/.test(p)) p = `${book} ${ch}:${p}`;
      else if (/^\d/.test(p) && book) p = `${book} ${p}`;
      const m = RE.exec(p);
      if (!m) continue;
      book = m[1];
      ch = +m[2];
      if (!BOOK_BY_CODE.has(book)) continue;
      if (m[3] === undefined) out.push({ book, c1: ch, c2: ch });
      else {
        const c2 = m[4] ? +m[4] : ch;
        out.push({ book, c1: ch, v1: +m[3], c2, v2: m[5] ? +m[5] : +m[3] });
        ch = c2;
      }
    }
  }
  return out;
}
/** Видимый адрес: «Быт 6:9–9:17» (неразрывные пробелы). */
export const адрес = (ref: string | string[]) => {
  const xs = (Array.isArray(ref) ? ref : [ref]).flatMap(отрезки);
  return xs.length ? formatRefs(xs) : String(ref);
};
/** Полное имя книги для показа (11 § 3.2: «Бытие», «Евангелие от Марка»): из имени и родительного падежа ядра. */
export function полноеИмя(code: string): string {
  const b = BOOK_BY_CODE.get(code);
  if (!b) return code;
  if (b.gen.startsWith('от ')) return `Евангелие ${b.gen}`;
  if (code === 'Деян') return 'Деяния апостолов';
  if (b.t === 'nt' && code !== 'Откр') {
    const m = /^(\d-е) (.*)$/.exec(b.name);
    if (m) return `${m[1]} послание ${m[2]}`;
    return `Послание ${b.name[0].toLowerCase() === 'к' ? b.name[0].toLowerCase() + b.name.slice(1) : b.name}`;
  }
  const m = /^(\d-я) (.*)$/.exec(b.name);
  return m ? `${m[1]} книга ${m[2]}` : b.name;
}
/** Полный адрес для программы чтения и простого слоя: «Бытие, глава 6, стих 9 — глава 9, стих 17». */
export const адресПолно = (ref: string | string[]) => {
  const xs = (Array.isArray(ref) ? ref : [ref]).flatMap(отрезки);
  if (!xs.length) return String(ref);
  // имя книги — полное (Евангелие от Марка); порядок частей — как в ядре
  return xs.map((s) => spokenRefs([s]).replace(/^[^,]+/, полноеИмя(s.book))).join('; ');
};
/** Адрес «по стихам» простого слоя: глава у каждого отрезка, чтобы «22–23» не прочли как главы (11 § 4.2, пед. П3-9). */
export function адресПоСтихам(refs: string[]): string {
  const xs = refs.flatMap(отрезки);
  if (!xs.length) return '';
  let prev = '';
  return xs
    .map((s) => {
      const t = formatRefs([s]);
      const pre = `${bookShort(s.book)} `;
      const out = s.book === prev && t.startsWith(pre) ? t.slice(pre.length) : t;
      prev = s.book;
      return out;
    })
    .join('; ');
}
export const книгаСсылки = (ref: string) => /^\s*([1-4]?[А-Яа-яЁё]+)/.exec(ref)?.[1] ?? '';
export const имяКниги = (code: string) => полноеИмя(code);
export const завет = (code: string) => (BOOK_BY_CODE.get(code)?.t === 'nt' ? 'nt' : 'ot');
/** Стих входит в ссылку? */
export function вСсылке(ref: string, book: string, c: number, v: number): boolean {
  return отрезки(ref).some((s) => s.book === book && (c > s.c1 || (c === s.c1 && v >= (s.v1 ?? 1))) && (c < s.c2 || (c === s.c2 && v <= (s.v2 ?? 999))));
}
/** Первый стих ссылки. */
export function начало(ref: string): { book: string; c: number; v: number } | null {
  const s = отрезки(ref)[0];
  return s ? { book: s.book, c: s.c1, v: s.v1 ?? 1 } : null;
}
/** Якорь стиха в адресе страницы главы и истории: `st6.9`. */
export const якорь = (c: number, v: number) => `st${c}.${v}`;
/** Число стихов в ссылках (по пакету текста). */
export function счётСтихов(refs: string[], len: (b: string, c: number) => number): number {
  let n = 0;
  for (const s of refs.flatMap(отрезки)) {
    if (s.v1 === undefined) {
      for (let c = s.c1; c <= s.c2; c++) n += len(s.book, c);
      continue;
    }
    if (s.c1 === s.c2) n += (s.v2 ?? s.v1) - s.v1 + 1;
    else {
      n += len(s.book, s.c1) - s.v1 + 1 + (s.v2 ?? 0);
      for (let c = s.c1 + 1; c < s.c2; c++) n += len(s.book, c);
    }
  }
  return n;
}
