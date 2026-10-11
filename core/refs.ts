/**
 * Один форматер адреса стиха на приложение (08 § 6.1 п. 16, грамматика адреса; рецензия интерфейса, № 6): неразрывный
 * пробел U+00A0 после номера книги и после сокращения, «–» без пробелов, несмежные стихи главы — через запятую, другие главы
 * той же книги — через «;» без повтора книги, другие книги — через «;». Список сортируется и сворачивается. Ядро без DOM.
 */
import { BOOK_BY_CODE, BOOK_ORDER } from './books.ts';

/** Отрезок: от c1:v1 до c2:v2 включительно; без стиха — главы целиком. */
export interface Span {
  book: string;
  c1: number;
  v1?: number;
  c2: number;
  v2?: number;
}

export const NBSP = ' ';
const DASH = '–';

/** Сокращение книги с неразрывными пробелами: «1 Цар» → «1 Цар» (U+00A0). */
export function bookShort(code: string): string {
  const b = BOOK_BY_CODE.get(code);
  if (!b) throw new Error(`нет книги «${code}»`);
  return b.short.replace(/ /g, NBSP);
}

const start = (s: Span) => (BOOK_ORDER.get(s.book) ?? 99) * 1e6 + s.c1 * 1000 + (s.v1 ?? 0);
const whole = (s: Span) => s.v1 === undefined;

/** Сортировка и свёртка: пересекающиеся и смежные отрезки одной книги сливаются. */
export function normalizeSpans(spans: Span[]): Span[] {
  const xs = [...spans].map((s) => ({ ...s })).sort((a, b) => start(a) - start(b));
  const out: Span[] = [];
  for (const s of xs) {
    const p = out.at(-1);
    if (p && p.book === s.book) {
      if (whole(p) && whole(s) && s.c1 <= p.c2 + 1) {
        p.c2 = Math.max(p.c2, s.c2);
        continue;
      }
      if (whole(p) && s.c2 <= p.c2) continue; // стихи внутри уже взятой главы
      if (!whole(p) && !whole(s) && p.v2 !== undefined && s.v1 !== undefined) {
        const pe = p.c2 * 1000 + p.v2;
        const ss = s.c1 * 1000 + s.v1;
        if (ss <= pe + 1) {
          const se = s.c2 * 1000 + (s.v2 ?? s.v1);
          if (se > pe) {
            p.c2 = s.c2;
            p.v2 = s.v2;
          }
          continue;
        }
      }
    }
    out.push(s);
  }
  return out;
}

/** Адрес списка отрезков по грамматике 08: «Быт 6:9–22», «Быт 6:9, 22; 7:1», «Быт 6–9», «Быт 6:9; Евр 11:7». */
export function formatRefs(spans: Span[], opts: { part?: boolean } = {}): string {
  const xs = normalizeSpans(spans);
  let out = '';
  let prev: Span | null = null;
  for (const s of xs) {
    const sameBook = prev?.book === s.book;
    const one = !whole(s) && s.c1 === s.c2;
    let body: string;
    if (whole(s)) body = s.c1 === s.c2 ? `${s.c1}` : `${s.c1}${DASH}${s.c2}`;
    else if (one) body = s.v1 === s.v2 ? `${s.c1}:${s.v1}` : `${s.c1}:${s.v1}${DASH}${s.v2}`;
    else body = `${s.c1}:${s.v1}${DASH}${s.c2}:${s.v2}`;
    if (!prev) out += `${bookShort(s.book)}${NBSP}${body}`;
    else if (!sameBook) out += `; ${bookShort(s.book)}${NBSP}${body}`;
    else if (one && prev.v2 !== undefined && prev.c2 === s.c1) out += `, ${body.slice(body.indexOf(':') + 1)}`;
    else out += `; ${body}`;
    prev = s;
  }
  return opts.part ? `из${NBSP}${out}` : out;
}

/** Адрес для программы чтения (08 § 6.1 п. 16): «Бытие, глава 6, стих 9 — глава 9, стих 17». */
export function spokenRefs(spans: Span[]): string {
  return normalizeSpans(spans)
    .map((s) => {
      const b = BOOK_BY_CODE.get(s.book)?.name ?? s.book;
      if (whole(s)) return s.c1 === s.c2 ? `${b}, глава ${s.c1}` : `${b}, главы ${s.c1} — ${s.c2}`;
      if (s.c1 === s.c2) return s.v1 === s.v2 ? `${b}, глава ${s.c1}, стих ${s.v1}` : `${b}, глава ${s.c1}, стихи ${s.v1} — ${s.v2}`;
      return `${b}, глава ${s.c1}, стих ${s.v1} — глава ${s.c2}, стих ${s.v2}`;
    })
    .join('; ');
}
