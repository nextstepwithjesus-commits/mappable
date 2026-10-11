/**
 * Разбор адреса во всех формах 11 § 3.6 (в): «Мк 6:35», «Мк 6 35», «Мк6:35», «Мк. 6,35», «Марка 6:35»,
 * «Евангелие от Марка 6:35», «Послание к Римлянам 8:28», «Mark 6:35», «Mk 6:35», «Mark.6.35», диапазоны, списки, глава без стиха,
 * протестантские названия, западная нумерация. Понимает и адрес в форме самого приложения (08 § 6.1 п. 16): «Быт 6:9, 22; 7:1»,
 * «из Быт 6:9» — всё, что выводит `formatRefs`, разбирается обратно (рецензия интерфейса, № 5). Раскладку переводит search.ts.
 *
 * Английский адрес — в западной нумерации: стих переводится в синодальный по своей таблице приложения
 * (`versification-table.ts`, сверена тестом со всеми расхождениями `base/versification/synodal-kjv.json`; рецензии: интерфейс № 4,
 * данные № 7). «Psalm 3:1» → Пс 3:2, «Num 13:33» → Чис 13:34, «Romans 16:25» → Рим 14:24.
 *
 * Перенесено из пробы П-Т3 (10 § 3.1 п. 4) и исправлено по рецензиям переноса (`docs/app/reviews/этап-0-ядро-рецензия-*.md`).
 */
import { findBook, BOOK_BY_CODE, BOOKS, type Book, type BookSystem } from '../books.ts';
import { formatRefs, type Span } from '../refs.ts';
import { psKjvToSyn } from './psalms.ts';
import { KJV_RUNS } from './versification-table.ts';

export type { Span } from '../refs.ts';

export interface Address {
  spans: Span[];
  /** Метка по грамматике 08 (U+00A0, «–», свёртка): «Мк 6:35», «Быт 6–9; Ин 3:16». */
  label: string;
  /** Строки под результатом: «В Синодальном переводе: 1 Царств 17», пересчёт западной нумерации, подсказка о Псалмах. */
  notes: string[];
  /** Чья нумерация была на входе. */
  system: BookSystem;
  /** Часть стиха: «из Быт 6:9». */
  part?: boolean;
  /** Подсказка для Псалмов в синодальной записи без стиха: западный номер → синодальный (11 § 3.6 (в), «Пс 23»). */
  psalmHint?: { asked: number; synodal: number[] };
  errors: string[];
}

/** Число стихов в главах книги: chapters[code][c - 1]. */
export type Versification = Map<string, number[]>;

const SINGLE = new Set(['Авд', 'Флм', '2Ин', '3Ин', 'Иуд']);
const DASH = /[–—−‐-]/g;
const OSIS_TO_CODE = new Map(BOOKS.map((b) => [b.osis, b.code]));

/** Западный стих → синодальный по своей таблице; вне таблицы — тот же номер. */
export function kjvToSyn(code: string, c: number, v: number): { c: number; v: number; moved: boolean } {
  const osis = BOOK_BY_CODE.get(code)?.osis;
  for (const r of KJV_RUNS) {
    if (r[0] === osis && r[1] === c && v >= r[2] && v < r[2] + r[3] && OSIS_TO_CODE.get(r[0]) === r[4]) {
      const sv = r[6] + (v - r[2]);
      return { c: r[5], v: sv, moved: r[5] !== c || sv !== v };
    }
  }
  return { c, v, moved: false };
}

function bookName(b: Book): string {
  return b.name.replace(/^(\d)-[яе] /, '$1 ');
}

/** Метка одного отрезка по грамматике 08. */
export function spanLabel(s: Span): string {
  return formatRefs([s]);
}

const OSIS = /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(?:-(?:([1-3]?[A-Za-z]+)\.)?(\d+)(?:\.(\d+))?)?$/;
// книга (возможно с номером впереди и словом «послание»), затем глава и остаток
const MAIN = /^\s*((?:[1-4]|iii|ii|i)?\s*(?:-?\s*(?:я|е|й|го|ая|ое)\s+)?[a-zа-яё][a-zа-яё .]*?)\s*\.?\s*(\d+)(.*?)\s*$/i;

interface Part {
  book: Book;
  system: BookSystem;
  spans: Span[];
}

function parsePart(raw: string): Part | null {
  const s = raw.trim().replace(DASH, '-');
  let m = OSIS.exec(s);
  if (m) {
    const hit = findBook(m[1]);
    if (hit?.system !== 'en') return null;
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
    return { book: hit.book, system: 'en', spans: [{ book: hit.book.code, c1, v1, c2, v2 }] };
  }
  m = MAIN.exec(s);
  if (!m) return null;
  const hit = findBook(m[1]);
  if (!hit) return null;
  const code = hit.book.code;
  const c1 = +m[2];
  const rest = m[3];
  let spans: Span[];
  let r: RegExpExecArray | null;
  if (rest.trim() === '') spans = [{ book: code, c1, c2: c1 }];
  else if ((r = /^\s*-\s*(\d+)$/.exec(rest))) spans = [{ book: code, c1, c2: +r[1] }];
  else if ((r = /^\s*:\s*(\d+(?:\s*-\s*\d+(?:\s*:\s*\d+)?)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*)$/.exec(rest))) {
    // «6:9», «6:9-22», «6:9-7:24», «6:9, 22», «6:9-12, 22-24» — после двоеточия запятая разделяет стихи главы
    spans = [];
    for (const piece of r[1].split(',')) {
      const x = /^\s*(\d+)(?:\s*-\s*(\d+)(?:\s*:\s*(\d+))?)?\s*$/.exec(piece);
      if (!x) return null;
      if (x[3]) spans.push({ book: code, c1, v1: +x[1], c2: +x[2], v2: +x[3] });
      else spans.push({ book: code, c1, v1: +x[1], c2: c1, v2: x[2] ? +x[2] : +x[1] });
    }
  } else if ((r = /^(?:\s*[,.]\s*|\s+)(\d+)(?:\s*-\s*(\d+)(?:\s*[:,.]\s*(\d+))?)?$/.exec(rest))) {
    // «Мк 6 35», «Мк. 6,35», «Mark 6.35» — без двоеточия запятая и точка — граница главы и стиха
    const v1 = +r[1];
    if (r[3]) spans = [{ book: code, c1, v1, c2: +r[2], v2: +r[3] }];
    else spans = [{ book: code, c1, v1, c2: c1, v2: r[2] ? +r[2] : v1 }];
  } else return null;
  // одноглавные книги: «Иуд 3» — стих 3 (форма вывода — вопрос 08, рецензия интерфейса № 23)
  if (SINGLE.has(code)) spans = spans.map((sp) => (sp.v1 === undefined && (sp.c1 > 1 || sp.c2 > 1) ? { book: sp.book, c1: 1, v1: sp.c1, c2: 1, v2: sp.c2 } : sp));
  return { book: hit.book, system: hit.system, spans };
}

/** Похоже ли на адрес: есть буквы и число. Иначе разбор не пробуется (быстрый путь для слов). */
export const looksLikeAddress = (q: string) => /\d/.test(q) && /[a-zа-яё]/i.test(q);

export function parseAddress(input: string, vers?: Versification, has?: (book: string, c: number, v: number) => boolean): Address | null {
  if (!looksLikeAddress(input)) return null;
  let text = input.normalize('NFC').replace(/ /g, ' ').trim();
  const part = /^из\s+/i.test(text);
  if (part) text = text.replace(/^из\s+/i, '');
  const parts = text.split(';').map((p) => p.trim()).filter(Boolean);
  const out: Address = { spans: [], label: '', notes: [], system: 'syn', errors: [], ...(part && { part }) };
  let prevBook: Book | null = null;
  let prevSystem: BookSystem = 'syn';
  for (const p of parts) {
    // «Ин 3:16; 17», «Быт 6:9, 22; 7:1» — продолжение той же книги
    let pt = parsePart(p);
    if (!pt && prevBook && /^\d/.test(p)) pt = parsePart(`${prevSystem === 'en' ? prevBook.en[0] : prevBook.code} ${p}`);
    if (!pt) return null;
    prevBook = pt.book;
    prevSystem = pt.system;
    if (pt.system !== 'syn') out.system = pt.system;
    for (let span of pt.spans) {
      const asked = span;
      if (pt.system === 'prot') out.notes.push(`В Синодальном переводе: ${bookName(pt.book)} ${formatRefs([span]).slice(pt.book.short.length + 1)}`);
      if (pt.system === 'en') {
        if (span.v1 !== undefined) {
          const a = kjvToSyn(span.book, span.c1, span.v1);
          const b = kjvToSyn(span.book, span.c2, span.v2 ?? span.v1);
          span = { book: span.book, c1: a.c, v1: a.v, c2: b.c, v2: b.v };
          if (a.moved || b.moved)
            out.notes.push(`Западная нумерация: ${pt.book.en[0][0].toUpperCase()}${pt.book.en[0].slice(1)} ${asked.c1}:${asked.v1}${asked.v2 !== asked.v1 || asked.c2 !== asked.c1 ? `–${asked.c2 !== asked.c1 ? `${asked.c2}:` : ''}${asked.v2}` : ''}. В Синодальном переводе: ${formatRefs([span])}`);
        } else if (span.book === 'Пс') {
          const syn1 = psKjvToSyn(span.c1);
          const syn2 = psKjvToSyn(span.c2);
          span = { ...span, c1: syn1[0], c2: syn2[syn2.length - 1] };
          if (syn1[0] !== asked.c1 || syn1.length > 1) out.notes.push(`Западная нумерация: Psalm ${asked.c1}. В Синодальном переводе: Пс ${syn1.join(' и ')}`);
        }
      } else if (span.book === 'Пс' && span.v1 === undefined && span.c1 === span.c2) {
        const syn = psKjvToSyn(span.c1);
        if (syn.length !== 1 || syn[0] !== span.c1) out.psalmHint = { asked: span.c1, synodal: syn };
      }
      if (vers) {
        const ch = vers.get(span.book);
        if (ch) {
          if (span.c1 < 1 || span.c2 > ch.length || span.c2 < span.c1) out.errors.push(`В книге «${pt.book.name}» глав: ${ch.length}`);
          else if (span.v1 !== undefined) {
            if (span.v1 < 1 || span.v1 > ch[span.c1 - 1] || (span.v2 ?? 0) > ch[span.c2 - 1] || (span.c1 === span.c2 && (span.v2 ?? 0) < span.v1))
              out.errors.push(`Нет такого стиха: ${formatRefs([span])}`);
            else if (has && (!has(span.book, span.c1, span.v1) || !has(span.book, span.c2, span.v2 ?? span.v1)))
              out.errors.push(`Нет такого стиха в Синодальном тексте: ${formatRefs([span])}`);
          }
        }
      }
      out.spans.push(span);
    }
  }
  out.label = formatRefs(out.spans, { part });
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
