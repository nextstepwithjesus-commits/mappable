/**
 * Все ссылки на стихи в данных (этап 13, решение 129): каждая строка данных, которая целиком является ссылкой
 * («Быт 5:3», «Быт 5:3-5,7», «Быт 27:41-28:5»), где бы она ни стояла — факты карточки, связи, хронологические входы
 * (born, died, reign, sync, active), линии, эпохи, опоры, списки. Сборка (tools/build-data.ts) включает все их стихи
 * без предела длины; tests/verses-complete.test.ts проверяет, что в сборке нет недостающих стихов.
 * Свободный текст («Быт 7:6 говорит…») ссылкой не считается: его стихи — в refs того же факта.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';
import { parseRef, verseId } from '../src/engine/books.ts';

/** Файлы данных, кроме томов лиц, в которых стоят ссылки. */
export const DATA_REF_FILES = ['epochs.json', 'anchors.json', 'lines/joseph.json', 'lines/mary.json', 'groups.json', 'lists.json', 'story.json'];

/** Ссылки во вложенном значении JSON: строки, которые parseRef разбирает целиком. */
export function refsIn(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string') {
    if (/^\s*[1-4]?[А-Яа-яЁё]+\s+\d+:\d/.test(v) && parseRef(v)) out.add(v);
    else if (/^\s*[1-4]?[А-Яа-яЁё]+\s+\d+:[\d,\s-]*\d+[-–—]\d+:\d+\s*$/.test(v)) out.add(v); // межглавный диапазон — разбирается с длинами глав
  } else if (Array.isArray(v)) for (const x of v) refsIn(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) refsIn(x, out);
  return out;
}

/** Все ссылки данных: все поля лиц в томах («scope» тома — описание охвата, а не ссылка) и файлы DATA_REF_FILES. */
export function allDataRefs(root = ROOT): Set<string> {
  const out = new Set<string>();
  const dir = join(root, 'data/persons');
  if (existsSync(dir))
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { persons: unknown[] };
      refsIn(v.persons, out);
    }
  for (const f of DATA_REF_FILES) {
    const p = join(root, 'data', f);
    if (existsSync(p)) refsIn(JSON.parse(readFileSync(p, 'utf8')), out);
  }
  return out;
}

/**
 * Стихи ссылки с длинами глав. parseRef разбирает межглавный диапазон до трёх глав; длиннее — здесь, по главам.
 * null — ссылка не разбирается.
 */
export function refVerses(ref: string, chapterLength: (book: string, ch: number) => number): string[] | null {
  const p = parseRef(ref, chapterLength);
  if (p) {
    if (p.chapterOnly) return Array.from({ length: chapterLength(p.book, p.chapterOnly) }, (_, i) => `${p.book} ${p.chapterOnly}:${i + 1}`);
    return p.verses.map(verseId);
  }
  const m = /^\s*([1-4]?[А-Яа-яЁё]+)\s+(\d+):(\d+)[-–—](\d+):(\d+)\s*$/.exec(ref);
  if (!m) return null;
  const [book, c1, v1, c2, v2] = [m[1], +m[2], +m[3], +m[4], +m[5]];
  if (c2 <= c1 || !chapterLength(book, c1)) return null;
  const out: string[] = [];
  for (let c = c1; c <= c2; c++) for (let v = c === c1 ? v1 : 1; v <= (c === c2 ? v2 : chapterLength(book, c)); v++) out.push(`${book} ${c}:${v}`);
  return out;
}
