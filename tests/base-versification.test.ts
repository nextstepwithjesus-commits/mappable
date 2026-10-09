/**
 * Таблица нумерации Синодальная → KJV (docs/app/02-ДАННЫЕ.md, § 6.1; tools/base/versification.ts): опасные места
 * сверены по тексту стихов; каждый ключ — стих нашего Синодального текста.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible } from '../tools/bible.ts';
import { toKjv } from '../tools/base/versification.ts';

const table = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'base', 'versification', 'synodal-kjv.json'), 'utf8'));
const map: Record<string, string[]> = table.map;

describe('нумерация Синодальная → KJV', () => {
  it('ключи — стихи нашего текста; значения — номера OSIS', () => {
    const bible = loadBible();
    for (const [k, v] of Object.entries(map)) {
      expect(bible.verses.has(k), k).toBe(true);
      for (const x of v) expect(x, k).toMatch(/^[1-3]?[A-Za-z]+\.\d+\.\d+(!a|!b)?$/);
    }
    expect(table.unmatched).toEqual([]);
  });
  it('опасные места', () => {
    const cases: [string, string[]][] = [
      ['Ион 2:1', ['Jonah.1.17']], ['Ион 2:2', ['Jonah.2.1']],
      ['Нав 5:16', ['Josh.6.1']],
      ['1Цар 24:1', ['1Sam.23.29']], ['1Цар 20:43', ['1Sam.20.42']],
      ['Пс 9:22', ['Ps.10.1']], ['Пс 22:1', ['Ps.23.0', 'Ps.23.1']], ['Пс 89:1', ['Ps.90.0']], ['Пс 89:6', ['Ps.90.5', 'Ps.90.6']],
      ['Пс 12:6', ['Ps.13.5', 'Ps.13.6']],
      ['Дан 3:23', ['Dan.3.23']], ['Дан 3:91', ['Dan.3.24']], ['Дан 3:97', ['Dan.3.30']], ['Дан 3:98', ['Dan.4.1']], ['Дан 4:1', ['Dan.4.4']],
      ['Притч 13:14', []], ['Притч 13:15', ['Prov.13.14']], ['Притч 18:25', ['Prov.18.24']], ['Нав 24:35', []],
      ['Песн 1:1', ['Song.1.2']], ['Рим 14:24', ['Rom.16.25']], ['2Кор 13:13', ['2Cor.13.14']], ['3Ин 1:15', ['3John.1.14!b']],
      ['Быт 1:1', ['Gen.1.1']], ['Мф 1:16', ['Matt.1.16']], ['Иак 1:1', ['Jas.1.1']],
    ];
    for (const [syn, kjv] of cases) expect([syn, toKjv(map, syn)]).toEqual([syn, kjv]);
  });
});
