/**
 * Этап 19 (docs/ui-review/STAGE19.md): значимые замечания внешнего аудита 5 октября, проверенные по коду и данным.
 *  — К-03: пояснение под строкой карточки, сообщающее своё сведение при тех же стихах, не пропадает («Сирота…»
 *    у Есфири, смерть жены Иуды); пересказ строки («Брат его Гелем») по-прежнему опускается;
 *  — К-01: группа родни одного слова, но разной достоверности, не теряет помету («Брат: Иуда» — толк., Иуд 1:1);
 *  — А-01: свойство через брата или сестру супруга несёт худшую достоверность обоих звеньев («по толкованию»);
 *  — Х-02: «наверняка современники» — по раннему краю смерти, а не по её оценке;
 *  — Б-07: порядок брака (order) доходит из данных до союзов в браузере (Мелхола: Давид, затем Фалтий).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { cardSections } from './helpers/cards.ts';
import { graph, models } from '../src/data/atlas.ts';
import { relate } from '../src/engine/kinship.ts';
import { contemporaries } from '../src/engine/chronology.ts';
import { unions } from '../src/ui/reveal.ts';
import { saysMore } from '../src/ui/card/sections.tsx';

const cards = new Map<string, Map<number, string>>();
const sec = (id: string, n: number) => cards.get(id)?.get(n) ?? '';
/** Текст раздела без пробелов перед знаками и с обычными пробелами (как в tests/card-text.test.ts). */
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();

beforeAll(async () => {
  const { loadCard, persons } = await import('../src/data/atlas.ts');
  await Promise.all(persons.map((p) => loadCard(p.id)));
  for (const id of ['esfir', 'iuda', 'iakov', 'lotan', 'shomer-syn-khevera', 'iakov-brat-gospoden', 'ezekiya', 'david']) cards.set(id, new Map([...(await cardSections(id))].map(([n, t]) => [n, norm(t)])));
}, 300_000);

describe('К-03: пояснение со своим сведением не пропадает', () => {
  it('Есфирь § 6 — «Сирота»; Иуда § 9 — смерть жены; Иаков § 9 — «Любил Рахиль больше»', () => {
    expect(sec('esfir', 6)).toMatch(/Сирота: «не было у нее ни отца, ни матери»/);
    expect(sec('iuda', 9)).toMatch(/она умерла, когда «прошло много времени»/);
    expect(sec('iakov', 9)).toMatch(/Любил Рахиль больше, нежели Лию/);
    // «Жена не названа» под строкой «Хефциба — мать Манассии» — сведение, а не повтор
    expect(sec('ezekiya', 9)).toMatch(/Жена не названа/);
  });
  it('пересказ строки по-прежнему опускается: «А сестра у Лотана: Фамна», «Брат его Гелем»', () => {
    expect(sec('lotan', 11)).not.toMatch(/А сестра у Лотана/);
    expect(sec('shomer-syn-khevera', 11)).not.toMatch(/Брат его Гелем/);
    expect(saysMore('Брат его Гелем', ['gelem'], 'брат')).toBe(false);
    expect(saysMore('Жена не названа', ['khefsiba'], 'мать')).toBe(true);
  });
  it('слово строки в кавычках — повтор: «Ионафан, „дядя Давидов“, — советник…» → «Советник, человек умный и писец»', () => {
    expect(sec('david', 12)).toMatch(/Советник, человек умный и писец/);
    expect(sec('david', 12)).not.toMatch(/«дядя Давидов»/);
  });
});

describe('К-01: помета у каждой подгруппы родни', () => {
  it('Иаков, брат Господень, § 11: «Брат: Иуда Иуд 1:1 толк.» отдельно от «Брат: Иисус Христос»', () => {
    expect(sec('iakov-brat-gospoden', 11)).toMatch(/Брат: Иуда Иуд 1:1 толк\./);
    expect(sec('iakov-brat-gospoden', 11)).toMatch(/Брат: Иисус Христос Мф 13:55/);
  });
});

describe('А-01: свойство через брата супруга — с толкованием звена', () => {
  it('«Моисей — муж Сепфоры, сестры Ховава» — по толкованию', () => {
    const s = relate(graph, 'moisey', 'khovav').map((r) => r.sentence).find((x) => /сестры Ховава/.test(x));
    expect(s).toBeTruthy();
    expect(s).toMatch(/по толкованию/);
  });
});

describe('Х-02: «наверняка» — по раннему краю смерти', () => {
  it('Наассон и Раав — не «наверняка» (смерть Наассона около −1410, ранний край −1444; Раав родилась −1439…−1425)', () => {
    const m = models[0];
    const res = { model: m.id as never, persons: new Map([...m.chrono].map(([id, c]) => [id, { ...c, lastAttested: c.last }])), tensions: m.tensions } as never;
    const raav = contemporaries(res, 'naasson', 400).find((x) => x.id === 'raav');
    if (raav) expect(raav.sure).toBe(false);
  });
});

describe('Б-07: порядок брака из данных', () => {
  it('Мелхола: первый союз — с Давидом, затем с Фалтием', () => {
    const own = (unions.of.get('melkhola') ?? []).filter((u) => u.a && u.b).map((u) => u.a);
    expect(own.indexOf('david')).toBeGreaterThanOrEqual(0);
    expect(own.indexOf('david')).toBeLessThan(own.indexOf('faltiy-syn-laisha'));
  });
});
