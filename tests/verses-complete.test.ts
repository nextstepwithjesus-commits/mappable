/**
 * Стихи раскрываются полностью (этап 13, решение 129; TOL 002, TOL 003): в сборке (src/generated/verses) есть каждый стих
 * каждой ссылки данных — без предела в 40 стихов, с межглавными диапазонами и стихами хронологических входов
 * (born, died, reign, sync, active) — и каждой ссылки напряжений всех моделей. Длины глав — в файле книги, по ним
 * atlas.ts раскрывает межглавную ссылку в интерфейсе.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible } from '../tools/bible.ts';
import { allDataRefs, refVerses } from '../tools/data-refs.ts';
import { expandRef, loadRefVerses, loadChapterLengths } from '../src/data/atlas.ts';

const ROOT = join(__dirname, '..');
const bible = loadBible();
const gen = join(ROOT, 'src/generated');
const built = new Set<string>();
const chapters = new Map<string, number[]>();
for (const f of readdirSync(join(gen, 'verses'))) {
  const j = JSON.parse(readFileSync(join(gen, 'verses', f), 'utf8')) as { book: string; chapters: number[]; verses: Record<string, string> };
  chapters.set(j.book, j.chapters);
  for (const k of Object.keys(j.verses)) built.add(`${j.book} ${k}`);
}
/** Ссылки напряжений всех моделей (§ 13, § 24). */
function tensionRefs(): Set<string> {
  const out = new Set<string>();
  const atlas = JSON.parse(readFileSync(join(gen, 'atlas.json'), 'utf8')) as { models: { tensions: { refs: string[] }[] }[] };
  const all = [...atlas.models, ...readdirSync(join(gen, 'models')).map((f) => JSON.parse(readFileSync(join(gen, 'models', f), 'utf8')))];
  for (const m of all) for (const t of m.tensions as { refs: string[] }[]) for (const r of t.refs) out.add(r);
  return out;
}
const missingOf = (refs: Iterable<string>) => {
  const unparsed: string[] = [];
  const missing = new Map<string, string>();
  for (const r of refs) {
    const vs = refVerses(r, bible.chapterLength);
    if (!vs) {
      unparsed.push(r);
      continue;
    }
    for (const k of vs) if (bible.verses.has(k) && !built.has(k)) missing.set(k, r);
  }
  return { unparsed, missing: [...missing].map(([k, r]) => `${k} (${r})`) };
};

describe('стихи всех ссылок — в сборке (решение 129)', () => {
  const refs = allDataRefs();
  it('ссылок в данных много, межглавные и длинные среди них есть', () => {
    expect(refs.size).toBeGreaterThan(9000);
    const cross = [...refs].filter((r) => /\d+:\d+[-–—]\d+:\d+/.test(r));
    expect(cross.length).toBeGreaterThan(30);
    expect(cross).toContain('Быт 27:41-28:5');
    expect([...refs].some((r) => (refVerses(r, bible.chapterLength) ?? []).length > 40)).toBe(true);
  });
  it('каждая ссылка данных разбирается, и все её стихи — в сборке (0 недостающих)', () => {
    const m = missingOf(refs);
    expect(m.unparsed).toEqual([]);
    expect(m.missing).toEqual([]);
  });
  it('длинный диапазон — целиком, не 40 стихов: Мф 5:1-7:29 (111 стихов), Исх 12:1-15:21', () => {
    for (const r of ['Мф 5:1-7:29', 'Исх 12:1-15:21', 'Деян 27:1-28:31']) {
      const vs = refVerses(r, bible.chapterLength)!;
      expect(vs.length, r).toBeGreaterThan(40);
      for (const k of vs) expect(built.has(k), `${k} из «${r}»`).toBe(true);
    }
    expect(refVerses('Мф 5:1-7:29', bible.chapterLength)!.length).toBe(111);
  });
  it('стихи хронологических входов (born, died) — в сборке: Втор 31:2 (Моисей), Чис 33:36-39 (Аарон)', () => {
    for (const k of ['Втор 31:2', 'Чис 33:38', 'Чис 33:39']) expect(built.has(k), k).toBe(true);
  });
  it('стихи напряжений всех моделей — в сборке', () => {
    const m = missingOf(tensionRefs());
    expect(m.unparsed).toEqual([]);
    expect(m.missing).toEqual([]);
  });
});

describe('межглавные ссылки в интерфейсе: длины глав из сборки (решение 129)', () => {
  it('в файле книги — длины всех глав по синодальной нумерации', () => {
    for (const [book, ch] of chapters) {
      expect(ch.length, book).toBeGreaterThan(0);
      ch.forEach((n, i) => expect(n, `${book} ${i + 1}`).toBe(bible.chapterLength(book, i + 1)));
      expect(bible.chapterLength(book, ch.length + 1), book).toBe(0);
    }
  });
  it('expandRef раскрывает ссылку так же, как сборка, в том числе больше трёх глав', () => {
    const len = (book: string) => (c: number) => bible.chapterLength(book, c);
    for (const r of ['Быт 27:41-28:5', 'Быт 5:3-5,7', 'Мф 5:1-7:29', 'Ион 1:1-4:11', 'Быт 12:1-17:27', 'Руф 4']) {
      const book = r.split(' ')[0];
      const x = expandRef(r, len(book))!;
      expect(x, r).not.toBeNull();
      const flat = x.keys.map(([c, v]) => `${book} ${c}:${v}`);
      expect(flat, r).toEqual(refVerses(r, bible.chapterLength));
    }
    expect(expandRef('Быт 12:1-17:27', len('Быт'))!.keys.length).toBe([12, 13, 14, 15, 16, 17].reduce((s, c) => s + bible.chapterLength('Быт', c), 0));
    expect(expandRef('Быт 7:6 говорит', len('Быт'))).toBeNull();
  });
  it('loadRefVerses: «Быт 27:41-28:5» — все стихи двух глав, недостающих нет', async () => {
    expect(await loadChapterLengths('Быт')).toHaveLength(50);
    const r = (await loadRefVerses('Быт 27:41-28:5'))!;
    expect(r.total).toBe(bible.chapterLength('Быт', 27) - 40 + 5);
    expect(r.missing).toBe(0);
    expect(r.verses[0].n).toBe('27:41');
    expect(r.verses.at(-1)!.n).toBe('28:5');
    expect(await loadRefVerses('не ссылка')).toBeNull();
  });
});
