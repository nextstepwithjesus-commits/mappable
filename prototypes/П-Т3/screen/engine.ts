// П-Т3: загрузка и поиск — общий код рабочего потока и режима «в главном потоке» (?main) для замера с замедлением:
// CDP Emulation.setCPUThrottlingRate замедляет только поток страницы, рабочий поток Chromium не замедляется.
import { BOOKS } from '../core/books.ts';
import { TextIndex, type BookText } from '../core/text.ts';
import { parseStemTable } from '../core/stems.ts';
import { NameForms } from '../core/forms.ts';
import { Searcher, type SearchIndexData, type SearchResult } from '../core/search.ts';

export interface Engine {
  searcher: Searcher;
  t: Record<string, number>;
}

export async function loadEngine(base: string): Promise<Engine> {
  const t0 = performance.now();
  const [idx, stems, ...books] = await Promise.all([
    fetch(`${base}search-index.json`).then((r) => r.text()),
    fetch(`${base}stems.tsv`).then((r) => r.text()),
    ...BOOKS.map((b) => fetch(`${base}text/${b.slug}.json`).then((r) => r.text())),
  ]);
  const t1 = performance.now();
  const data = JSON.parse(idx) as SearchIndexData;
  const bt = books.map((s) => JSON.parse(s) as BookText);
  const stemLen = parseStemTable(stems);
  const t2 = performance.now();
  const names = new NameForms(data.names);
  const text = new TextIndex({ books: bt, stemLen, names, exceptions: data.exceptions });
  const searcher = new Searcher(data, names, text);
  const t3 = performance.now();
  searcher.search('Моисей');
  const t4 = performance.now();
  return { searcher, t: { fetchMs: t1 - t0, parseMs: t2 - t1, indexMs: t3 - t2, firstQueryMs: t4 - t3, totalMs: t4 - t0, verses: text.verseCount, forms: text.formCount } };
}

export function slim(r: SearchResult): SearchResult {
  return { ...r, groups: r.groups.map((g) => (g.kind === 'текст' ? { ...g, result: { ...g.result, hits: g.result.hits.slice(0, 20) } } : g)) };
}
