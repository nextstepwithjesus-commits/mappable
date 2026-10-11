/**
 * Разбор адреса во всех формах 11 § 3.6 (в): «Мк 6:35», «Мк 6 35», «Мк6:35», «Мк. 6,35», «Марка 6:35»,
 * «Евангелие от Марка 6:35», «Mark 6:35», «Mk 6:35», «Mark.6.35», диапазоны, списки через «;», глава без стиха,
 * протестантские названия, западная нумерация Псалмов. Раскладку переводит вызывающий (search.ts).
 *
 * Перенесено копией из пробы П-Т3 (`prototypes/П-Т3/core/`, 11 октября 2026) по 10 § 3.1 п. 4: тесты — `tests/core-search.test.ts`;
 * рецензия переноса по правилам продукта (данные и интерфейс) ещё не проведена — до неё код не меняет поведения пробы.
 */
import { findBook, BOOK_BY_CODE, type Book, type BookSystem } from '../books.ts';
import { psKjvToSyn } from './psalms.ts';

/** Отрезок: от c1:v1 до c2:v2 включительно; без стиха — главы целиком. */
export interface Span {
  book: string;
  c1: number;
  v1?: number;
  c2: number;
  v2?: number;
}

export interface Address {
  spans: Span[];
  /** Метка в синодальных сокращениях: «Мк 6:35», «Быт 6–9; Ин 3:16». */
  label: string;
  /** Строки под результатом: «В Синодальном переводе: 1 Царств 17», подсказка о нумерации Псалмов. */
  notes: string[];
  /** Чья нумерация была на входе. */
  system: BookSystem;
  /** Подсказка для Псалмов в синодальной записи: западный номер → синодальный (11 § 3.6 (в), «Пс 23»). */
  psalmHint?: { asked: number; synodal: number[] };
  errors: string[];
}

/** Число стихов в главах книги: chapters[code][c - 1]. */
export type Versification = Map<string, number[]>;

const SINGLE = new Set(['Авд', 'Флм', '2Ин', '3Ин', 'Иуд']);
const DASH = /[–—−‐-]/g;

function bookName(b: Book): string {
  return b.name.replace(/^(\d)-[яе] /, '$1 ');
}

export function spanLabel(s: Span): string {
  const b = BOOK_BY_CODE.get(s.book)!.short;
  if (s.v1 === undefined) return s.c1 === s.c2 ? `${b} ${s.c1}` : `${b} ${s.c1}–${s.c2}`;
  if (s.c1 === s.c2) return s.v1 === s.v2 ? `${b} ${s.c1}:${s.v1}` : `${b} ${s.c1}:${s.v1}–${s.v2}`;
  return `${b} ${s.c1}:${s.v1}–${s.c2}:${s.v2}`;
}

const OSIS = /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(?:-(?:([1-3]?[A-Za-z]+)\.)?(\d+)(?:\.(\d+))?)?$/;
// книга (возможно с номером впереди), затем глава и остаток
const MAIN = /^\s*((?:[1-3]|iii|ii|i)?\s*(?:-?\s*(?:я|е|й|го|ая|ое)\s+)?[a-zа-яё][a-zа-яё .]*?)\s*\.?\s*(\d+)(.*?)\s*$/i;

interface Part {
  book: Book;
  system: BookSystem;
  span: Span;
}

function parsePart(raw: string): Part | null {
  const s = raw.trim().replace(DASH, '-');
  let m = OSIS.exec(s);
  if (m) {
    const hit = findBook(m[1]);
    if (!hit || hit.system !== 'en') return null;
    const c1 = +m[2];
    const v1 = m[3] ? +m[3] : undefined;
    let c2 = c1;
    let v2 = v1;
    if (m[5]) {
      if (m[6]) {
        c2 = +m[5];
        v2 = +m[6];
      } else if (v1 !== undefined) v2 = +m[5];
      else c2 = +m[5];
    }
    return { book: hit.book, system: 'en', span: { book: hit.book.code, c1, v1, c2, v2 } };
  }
  m = MAIN.exec(s);
  if (!m) return null;
  const hit = findBook(m[1]);
  if (!hit) return null;
  const c1 = +m[2];
  const rest = m[3];
  let span: Span;
  let r: RegExpExecArray | null;
  if (rest.trim() === '') span = { book: hit.book.code, c1, c2: c1 };
  else if ((r = /^\s*-\s*(\d+)$/.exec(rest))) span = { book: hit.book.code, c1, c2: +r[1] };
  else if ((r = /^(?:\s*[:,.]\s*|\s+)(\d+)(?:\s*-\s*(\d+)(?:\s*[:,.]\s*(\d+))?)?$/.exec(rest))) {
    const v1 = +r[1];
    if (r[3]) span = { book: hit.book.code, c1, v1, c2: +r[2], v2: +r[3] };
    else span = { book: hit.book.code, c1, v1, c2: c1, v2: r[2] ? +r[2] : v1 };
  } else return null;
  // одноглавные книги: «Иуд 3» — стих 3
  if (SINGLE.has(hit.book.code) && span.v1 === undefined && (span.c1 > 1 || span.c2 > 1)) {
    span = { book: span.book, c1: 1, v1: span.c1, c2: 1, v2: span.c2 };
  }
  return { book: hit.book, system: hit.system, span };
}

/** Похоже ли на адрес: есть буквы и число. Иначе разбор не пробуется (быстрый путь для слов). */
export const looksLikeAddress = (q: string) => /\d/.test(q) && /[a-zа-яё]/i.test(q);

export function parseAddress(input: string, vers?: Versification, has?: (book: string, c: number, v: number) => boolean): Address | null {
  if (!looksLikeAddress(input)) return null;
  const parts = input.split(';').map((p) => p.trim()).filter(Boolean);
  const out: Address = { spans: [], label: '', notes: [], system: 'syn', errors: [] };
  let prevBook: Book | null = null;
  for (const p of parts) {
    // «Ин 3:16; 17» — продолжение той же книги
    let part = parsePart(p);
    if (!part && prevBook && /^\d/.test(p)) part = parsePart(`${prevBook.short} ${p}`);
    if (!part) return null;
    prevBook = part.book;
    let { span } = part;
    if (part.system !== 'syn') out.system = part.system;
    if (part.system === 'prot') out.notes.push(`В Синодальном переводе: ${bookName(part.book)} ${spanLabel(span).slice(part.book.short.length + 1)}`);
    if (span.book === 'Пс') {
      if (part.system === 'en') {
        const syn1 = psKjvToSyn(span.c1);
        const syn2 = psKjvToSyn(span.c2);
        const was = span;
        span = { ...span, c1: syn1[0], c2: syn2[syn2.length - 1] };
        if (span.v1 !== undefined && (syn1.length > 1 || syn1[0] !== was.c1)) {
          // стихи внутри разделённых псалмов не пересчитываются по главе: показываем главу целиком
          span = { book: 'Пс', c1: span.c1, c2: span.c2 };
        }
        if (syn1[0] !== was.c1 || syn1.length > 1) out.notes.push(`Западная нумерация: Псалом ${was.c1}. В Синодальном переводе: Пс ${syn1.join(' и ')}`);
      } else {
        const syn = psKjvToSyn(span.c1);
        if (syn.length !== 1 || syn[0] !== span.c1) {
          out.psalmHint = { asked: span.c1, synodal: syn };
          out.notes.push(`Если вы ищете Псалом ${span.c1} по западной нумерации, в Синодальном переводе это Пс ${syn.join(' и ')}`);
        }
      }
    }
    if (vers) {
      const ch = vers.get(span.book);
      if (ch) {
        if (span.c1 < 1 || span.c2 > ch.length || span.c2 < span.c1) out.errors.push(`В книге «${part.book.name}» глав: ${ch.length}`);
        else if (span.v1 !== undefined) {
          if (span.v1 < 1 || span.v1 > ch[span.c1 - 1] || (span.v2 ?? 0) > ch[span.c2 - 1] || (span.c1 === span.c2 && (span.v2 ?? 0) < span.v1))
            out.errors.push(`Нет такого стиха: ${spanLabel(span)}`);
          else if (has && (!has(span.book, span.c1, span.v1) || !has(span.book, span.c2, span.v2 ?? span.v1)))
            out.errors.push(`Нет такого стиха в Синодальном тексте: ${spanLabel(span)}`);
        }
      }
    }
    out.spans.push(span);
  }
  out.label = out.spans.map(spanLabel).join('; ');
  return out;
}

/** Стих попадает в отрезок. */
export function inSpan(s: Span, book: string, c: number, v: number): boolean {
  if (s.book !== book) return false;
  const a = s.c1 * 1000 + (s.v1 ?? 0);
  const b = s.c2 * 1000 + (s.v2 ?? 999);
  const x = c * 1000 + v;
  return x >= a && x <= b;
}
