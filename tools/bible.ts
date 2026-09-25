import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');

export interface BibleText {
  verses: Map<string, string>;
  chapterLength: (book: string, ch: number) => number;
  order: string[];
}

let cache: BibleText | null = null;

export function loadBible(): BibleText {
  if (cache) return cache;
  const verses = new Map<string, string>();
  const chLen = new Map<string, number>();
  const order: string[] = [];
  const raw = readFileSync(join(ROOT, 'tools/bible/synodal.tsv'), 'utf8');
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [book, ch, v, text] = line.split('\t');
    const key = `${book} ${ch}:${v}`;
    verses.set(key, text);
    order.push(key);
    const ck = `${book} ${ch}`;
    chLen.set(ck, Math.max(chLen.get(ck) ?? 0, Number(v)));
  }
  cache = { verses, chapterLength: (b, c) => chLen.get(`${b} ${c}`) ?? 0, order };
  return cache;
}
