/** Загрузка собранных данных поиска в Node (тесты и замер ядра). В браузере то же делает screen/worker.ts. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { BOOKS } from './books.ts';
import { TextIndex, type BookText } from './text.ts';
import { parseStemTable } from './stems.ts';
import { Searcher, type SearchIndexData } from './search.ts';
import { NameForms } from './forms.ts';

const here = fileURLToPath(new URL('..', import.meta.url));
export const DATA = join(here, 'public-data');

export function loadNode() {
  const require = createRequire(import.meta.url);
  const ru = (require(join(here, 'node_modules/snowball-stemmers')) as { newStemmer(l: string): { stem(w: string): string } }).newStemmer('russian');
  const idx = JSON.parse(readFileSync(join(DATA, 'search-index.json'), 'utf8')) as SearchIndexData;
  const t0 = performance.now();
  const books: BookText[] = BOOKS.map((b) => JSON.parse(readFileSync(join(DATA, 'text', `${b.slug}.json`), 'utf8')));
  const stemLen = parseStemTable(readFileSync(join(DATA, 'stems.tsv'), 'utf8'));
  const names = new NameForms(idx.names);
  const text = new TextIndex({ books, stemLen, names, exceptions: idx.exceptions, stem: (w) => ru.stem(w) });
  const coldMs = performance.now() - t0;
  const searcher = new Searcher(idx, names, text);
  return { idx, text, searcher, coldMs, stem: (w: string) => ru.stem(w), files: readdirSync(join(DATA, 'text')).length };
}
