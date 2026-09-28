/**
 * Числа глав и стихов 66 книг для поиска (IX-82, UX-82): «Мф 29» — «Такой главы нет: в Евангелии от Матфея 28 глав»,
 * «Быт 5:40» — «Такого стиха нет: в Быт 5 — 32 стиха». Таблица создаётся один раз из tools/bible/synodal.tsv (его
 * не править) и лежит в src/engine/verseCounts.ts; в сборку идут только числа, без текста.
 *   npx tsx tools/verse-counts.ts          — записать таблицу
 *   npx tsx tools/verse-counts.ts --check  — сверить таблицу с текстом (код выхода 1 при расхождении)
 * Совпадение таблицы с текстом проверяет и tests/search-l6.test.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible, ROOT } from './bible.ts';
import { BOOKS } from '../src/engine/books.ts';

const OUT = join(ROOT, 'src/engine/verseCounts.ts');

export function build(): string {
  const { order } = loadBible();
  // глава → номера стихов по порядку текста
  const byCh = new Map<string, number[]>();
  for (const key of order) {
    const m = /^(\S+) (\d+):(\d+)$/.exec(key)!;
    const ck = `${m[1]} ${m[2]}`;
    const a = byCh.get(ck) ?? [];
    a.push(Number(m[3]));
    byCh.set(ck, a);
  }
  const lines: string[] = [];
  const gaps: string[] = [];
  for (const b of BOOKS) {
    const counts: number[] = [];
    for (let ch = 1; byCh.has(`${b.code} ${ch}`); ch++) {
      const vs = byCh.get(`${b.code} ${ch}`)!;
      counts.push(Math.max(...vs));
      // пропуски внутри главы: стихи Синодального издания вне канона (ТЗ П-1: Дан 3:24–90)
      for (let k = 1; k < vs.length; k++) if (vs[k] !== vs[k - 1] + 1) gaps.push(`  '${b.code} ${ch}': [${vs[k - 1] + 1}, ${vs[k] - 1}],`);
      if (vs[0] !== 1) gaps.push(`  '${b.code} ${ch}': [1, ${vs[0] - 1}],`);
    }
    if (!counts.length) throw new Error(`нет книги ${b.code} в synodal.tsv`);
    lines.push(`  '${b.code}': [${counts.join(', ')}],`);
  }
  return [
    '/**',
    ' * Числа стихов в главах 66 книг Синодального перевода (синодальная нумерация, только канонический текст).',
    ' * Создано tools/verse-counts.ts из tools/bible/synodal.tsv — не править вручную.',
    ' * VERSES[книга][глава − 1] — номер последнего стиха главы; GAPS — стихи внутри главы, которых в каноне нет.',
    ' */',
    'export const VERSES: Record<string, readonly number[]> = {',
    ...lines,
    '};',
    '',
    '/** Стихи внутри главы, которых нет в каноническом тексте (ТЗ П-1): [первый, последний]. */',
    'export const GAPS: Record<string, readonly [number, number]> = {',
    ...gaps,
    '};',
    '',
  ].join('\n');
}

if (process.argv[1] && /verse-counts\.ts$/.test(process.argv[1])) {
  const text = build();
  if (process.argv.includes('--check')) {
    const same = readFileSync(OUT, 'utf8') === text;
    console.log(same ? 'таблица стихов совпадает с текстом' : 'таблица стихов расходится с текстом: npx tsx tools/verse-counts.ts');
    process.exitCode = same ? 0 : 1;
  } else {
    writeFileSync(OUT, text);
    console.log(`записано: ${OUT}`);
  }
}
