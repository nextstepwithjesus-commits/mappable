/**
 * Поиск по стиху и главе (IX-55, UX-58): две группы — «Названы в стихе» (via 'verse', по порядку текста) и
 * «Стих упомянут в карточке» (via 'cited', по значимости); иное имя с нарицательным словом впереди («Сын Иессеев»)
 * ищется в тексте только целиком. Нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { searchIndex, prepareBook } from '../src/ui/top/searchIndex.ts';
import { personBlocks } from '../src/ui/top/Combobox.tsx';

describe('поиск по стиху: названные и упомянутые в карточке (IX-55, UX-58)', () => {
  beforeAll(async () => {
    await Promise.all(['Быт', 'Лк', 'Мф'].map(prepareBook));
  }, 120_000);
  it('«Быт 14:18»: Мелхиседек назван, Авраам — только в карточке', () => {
    const hits = searchIndex.search('Быт 14:18', 60);
    expect(hits.find((h) => h.id === 'melkhisedek')?.via).toBe('verse');
    expect(hits.find((h) => h.id === 'avraam')?.via).toBe('cited');
    const blocks = personBlocks(hits);
    // этап 13, решение 120: у каждой группы — свой счётчик
    const n = (via: string) => hits.filter((h) => h.via === via).length;
    const people = (k: number) => `${k}\u00a0${k % 10 === 1 && k % 100 !== 11 ? 'лицо' : [2, 3, 4].includes(k % 10) && ![12, 13, 14].includes(k % 100) ? 'лица' : 'лиц'}`;
    expect(blocks.map((b) => b.head)).toEqual([`Названы в стихе — ${people(n('verse'))}`, `Стих упомянут в карточке — ${people(n('cited'))}`]);
  });
  it('«Лк 3:23»: слово «Сын» стиха не находит Давида («Сын Иессеев» — только целиком)', () => {
    const hits = searchIndex.search('Лк 3:23', 60);
    const named = hits.filter((h) => h.via === 'verse').map((h) => h.id);
    expect(named).not.toContain('david');
    expect(named).toEqual(expect.arrayContaining(['iisus', 'iosif-muzh-marii', 'iliy-otets-marii']));
    // названные — раньше упомянутых
    const firstCited = hits.findIndex((h) => h.via === 'cited');
    if (firstCited >= 0) expect(hits.slice(firstCited).every((h) => h.via === 'cited')).toBe(true);
  });
  it('«Мф 1»: Адам и Сиф в главе не названы — они среди упомянутых в карточке', () => {
    const hits = searchIndex.search('Мф 1', 300);
    for (const id of ['adam', 'sif']) {
      const h = hits.find((x) => x.id === id);
      if (h) expect(h.via, id).toBe('cited');
    }
    expect(hits.find((h) => h.id === 'avraam')?.via).toBe('verse');
    expect(personBlocks(hits)[0].head).toMatch(/^Названы в главе — \d+\u00a0(лицо|лица|лиц)$/);
  });
});
