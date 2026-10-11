/**
 * Данные ядра для тестов: пакеты уровня «проба» строятся в памяти теми же функциями, что `tools/pack/build.ts`, и
 * подаются в ядро так же, как в приложении (через пакеты, без файлов base/). Истории — эскиз П-Т3: каталога 11 в базе нет.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBase } from '../../tools/base/validate.ts';
import { admission } from '../../tools/base/admit.ts';
import { buildCardVolumes, buildIndexes, buildStems, buildTexts, russianStemmer, textWords } from '../../tools/pack/packages.ts';
import { NameForms } from '../../core/search/forms.ts';
import { TextIndex } from '../../core/search/text.ts';
import { parseStemTable } from '../../core/search/stems.ts';
import { Searcher } from '../../core/search/search.ts';
import { BOOKS } from '../../core/books.ts';
import { Data } from '../../core/queries.ts';
import type { StoryRow } from '../../core/types.ts';
import { now } from '../../core/clock.ts';

let cache: ReturnType<typeof make> | null = null;

function make() {
  const base = loadBase();
  const A = admission(base, 'probe');
  const words = textWords();
  const { core, tools, genealogy } = buildIndexes(base, A, words);
  const texts = buildTexts(A);
  const stems = buildStems(A, words.words);
  const cards = buildCardVolumes(base, A);
  const stories = (JSON.parse(readFileSync(join(import.meta.dirname, 'core-истории-эскиз.json'), 'utf8')) as { stories: StoryRow[] }).stories;
  const ru = russianStemmer();
  const t0 = now();
  const names = new NameForms(core.names);
  const text = new TextIndex({ books: BOOKS.map((b) => texts.get(b.code)!), stemLen: parseStemTable(stems.table), names, exceptions: stems.exceptions, stem: (w) => ru.stem(w) });
  const coldMs = now() - t0;
  const searcher = new Searcher({ names: core.names, exceptions: core.exceptions, persons: core.persons, stories }, names, text);
  const data = new Data(core, tools);
  return { base, A, core, tools, genealogy, texts, stems, cards, text, searcher, data, coldMs, stem: (w: string) => ru.stem(w) };
}

export function coreData() {
  cache ??= make();
  return cache;
}
