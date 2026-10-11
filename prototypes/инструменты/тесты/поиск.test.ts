/**
 * Поиск прототипа на настоящих данных пакета (рецензия архитектуры пакета 1, № 1–2; 11 § 3.6, § 16 п. 8):
 *  - каждая строка каждого каталога книги находится по первому стиху рассказа своей книги (все 212 строк);
 *  - упоминания и пересказы — с ролью («Ис 54:9», «Евр 11:7» → *Ной и потоп*; «Деян 22:6» → *Савл на пути в Дамаск*);
 *  - слова названий ищутся: «пять хлебов», «потоп», «расслабленный».
 * Данные — `public/data/proto.json` и ядро индекса пакета пробы (сборка `npm run -s proto:data`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Searcher } from '../../../core/search/search.ts';
import { NameForms } from '../../../core/search/forms.ts';
import { строкиПоиска, историиПоСловам } from '../истории/поиск.ts';
import type { ProtoPack, Story } from '../общее/типы.ts';

const D = join(import.meta.dirname, '..', 'public', 'data');
const p = JSON.parse(readFileSync(join(D, 'proto.json'), 'utf8')) as ProtoPack;
const ci = JSON.parse(readFileSync(join(D, 'pack', readdirSync(join(D, 'pack')).find((f) => f.startsWith('core-index.'))!), 'utf8'));
const истории = new Map<string, Story>(p.stories.map((s) => [s.id, s]));
const S = new Searcher({ names: ci.names, exceptions: ci.exceptions, persons: ci.persons, stories: строкиПоиска(истории.values()), places: ci.places, areas: ci.areas }, new NameForms(ci.names));
const найдено = (q: string) => {
  const g = S.search(q).groups.find((x) => x.kind === 'адрес');
  return g && g.kind === 'адрес' ? g.stories.map((x) => ({ id: x.story.id, role: x.role })) : [];
};
const первыйСтих = (ref: string) => ref.replace(/^(\S+ \d+:\d+).*$/, '$1').replace(/^(\S+ \d+)$/, '$1:1');

describe('поиск по адресу: каждая строка каталога', () => {
  const строки = Object.entries(p.catalog).flatMap(([книга, xs]) => xs.map((x) => ({ книга, ...x })));
  it(`строк каталогов — ${строки.length}`, () => expect(строки.length).toBeGreaterThanOrEqual(212));
  it('каждая находится по первому стиху рассказа своей книги', () => {
    const мимо = строки.filter((x) => !найдено(первыйСтих(x.ref)).some((y) => y.id === x.id && y.role !== 'упоминание')).map((x) => `${x.книга}: ${x.id} (${x.ref})`);
    expect(мимо).toEqual([]);
  });
});

describe('поиск по адресу: роли (11 § 3.6 (в))', () => {
  it('«Мк 2:3» — Расслабленного спускают через кровлю', () => expect(найдено('Мк 2:3').map((x) => x.id)).toContain('e-rasslablennogo-spuskayut-cherez-krovlyu'));
  it('«Мк 6:35» — Пять хлебов', () => expect(найдено('Мк 6:35').map((x) => x.id)).toContain('e-pyat-khlebov-i-dve-ryby'));
  for (const [q, id, роль] of [
    ['Ис 54:9', 'e-noy-i-potop', 'упоминание'],
    ['Евр 11:7', 'e-noy-i-potop', 'пересказ'],
    ['Деян 22:6', 'e-savl-na-puti-v-damask', 'пересказ в речи'],
  ] as const)
    it(`«${q}» — ${id}, ${роль}`, () => expect(найдено(q)).toContainEqual({ id, role: роль }));
});

describe('поиск по словам названий (11 § 3.6 (б))', () => {
  for (const [q, id] of [
    ['пять хлебов', 'e-pyat-khlebov-i-dve-ryby'],
    ['потоп', 'e-noy-i-potop'],
    ['расслабленный', 'e-rasslablennogo-spuskayut-cherez-krovlyu'],
    ['Савл на пути', 'e-savl-na-puti-v-damask'],
  ] as const)
    it(`«${q}»`, () => expect(историиПоСловам(истории.values(), q).map((s) => s.id)).toContain(id));
});
