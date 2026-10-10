/**
 * Дефекты электронного Синодального текста (Д-база, Б-4; этап Д3-4): таблица tools/bible/source-issues.tsv.
 *
 * Сам tools/bible/synodal.tsv не правится. Таблица говорит, где текст файла ненадёжен: пустой стих (Пс 114:9),
 * вероятная склейка (Пс 114:8), незакрытая скобка (Притч 29:6), скобка через несколько стихов, форма скобки под
 * вопросом (Притч 30:31). Ею пользуются `npm run -s verse`, проверка базы (validate.ts) и проверка цитат документов
 * (docs/app/data/07-цитаты.py читает тот же файл).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible } from '../bible.ts';

const ROOT = join(import.meta.dirname, '..', '..');
export const SOURCE_ISSUES_TSV = join(ROOT, 'tools', 'bible', 'source-issues.tsv');

/** Вид дефекта: пустой стих, склейка, незакрытая скобка, скобка через стихи, форма скобки под вопросом. */
export type IssueKind = 'empty' | 'merge' | 'open-bracket' | 'span-bracket' | 'bracket-shape';
const KINDS = new Set<IssueKind>(['empty', 'merge', 'open-bracket', 'span-bracket', 'bracket-shape']);

export const KIND_WORD: Record<IssueKind, string> = {
  empty: 'стих пуст',
  merge: 'вероятная склейка стихов',
  'open-bracket': 'скобка не закрыта',
  'span-bracket': 'скобка через несколько стихов',
  'bracket-shape': 'форма скобки под вопросом',
};

export interface SourceIssue {
  book: string;
  chapter: number;
  from: number;
  to: number;
  kind: IssueKind;
  what: string;
  todo: string;
  checkedBy: string;
  state: string;
}

let cache: SourceIssue[] | null = null;

export function sourceIssues(file = SOURCE_ISSUES_TSV): SourceIssue[] {
  if (cache && file === SOURCE_ISSUES_TSV) return cache;
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const out = lines.slice(1).map((l, i) => {
    const c = l.split('\t');
    if (c.length !== 9) throw new Error(`source-issues.tsv, строка ${i + 2}: столбцов ${c.length}, нужно 9`);
    const [book, ch, from, to, kind, what, todo, checkedBy, state] = c;
    if (!KINDS.has(kind as IssueKind)) throw new Error(`source-issues.tsv, строка ${i + 2}: неизвестный вид «${kind}»`);
    return { book, chapter: Number(ch), from: Number(from), to: Number(to), kind: kind as IssueKind, what, todo, checkedBy, state };
  });
  if (file === SOURCE_ISSUES_TSV) cache = out;
  return out;
}

/** Дефекты, которые касаются стиха. */
export function issuesAt(book: string, chapter: number, verse: number, rows = sourceIssues()): SourceIssue[] {
  return rows.filter((r) => r.book === book && r.chapter === chapter && verse >= r.from && verse <= r.to);
}

/** Пометка для показа: «Пс 114:9 — стих пуст: …; что делать: …». */
export const issueNote = (r: SourceIssue) =>
  `${KIND_WORD[r.kind]} (${r.book} ${r.chapter}:${r.from}${r.to !== r.from ? `–${r.to}` : ''}): ${r.what}; ${r.todo} [${r.state}; tools/bible/source-issues.tsv]`;

/** Пустые стихи файла synodal.tsv: адреса «Пс 114:9». */
export function emptyVerses(): string[] {
  const b = loadBible();
  return b.order.filter((k) => !b.verses.get(k)!.trim());
}

/**
 * Сверка таблицы с файлом: каждый пустой стих записан видом `empty`, каждая строка таблицы указывает на стихи, которые
 * есть в файле, а строка `empty` — на действительно пустой стих. Страж против замены файла текста.
 */
export function checkSourceIssues(rows = sourceIssues()): string[] {
  const b = loadBible();
  const out: string[] = [];
  const listed = new Set(rows.filter((r) => r.kind === 'empty').flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => `${r.book} ${r.chapter}:${r.from + i}`)));
  for (const k of emptyVerses()) if (!listed.has(k)) out.push(`стих ${k} пуст в synodal.tsv, а в таблице дефектов (source-issues.tsv) не записан`);
  for (const r of rows) {
    for (let v = r.from; v <= r.to; v++) {
      const k = `${r.book} ${r.chapter}:${v}`;
      const t = b.verses.get(k);
      if (t === undefined) out.push(`таблица дефектов: нет стиха ${k}`);
      else if (r.kind === 'empty' && t.trim()) out.push(`таблица дефектов: стих ${k} записан пустым, а в synodal.tsv он не пуст`);
    }
  }
  return out;
}
