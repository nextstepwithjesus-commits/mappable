/**
 * Время в карточке (docs/ui-review/README.md, A2 § 13, A5, A6, A8, A9, A10): без выдуманных годов, с пометой «расч.»,
 * одни и те же годы в паспорте, мини-шкале, § 8 и § 13; глагол по полу; § 23 — стихи, где лицо названо по имени;
 * «Колено / народ» по предкам; тексты напряжений человеческим языком.
 * Перед тестами нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cardSections, passport, allIds, byId } from './helpers/cards.ts';
import { models, loadModel, loadCard } from '../src/data/atlas.ts';

const ROOT = join(__dirname, '..');
/** Число стихов в каждой книге Синодального текста. */
const versesInBook = (() => {
  const m = new Map<string, number>();
  for (const line of readFileSync(join(ROOT, 'tools/bible/synodal.tsv'), 'utf8').split('\n')) {
    if (!line) continue;
    const book = line.split('\t')[0];
    m.set(book, (m.get(book) ?? 0) + 1);
  }
  return m;
})();

/** Разделы без пробелов перед знаками препинания (рендер ставит пробел на месте тегов). */
const tidy = (s: string | undefined) => (s ?? '').replace(/[\s ]+/g, ' ').replace(/ ([,.;:)])/g, '$1');
/** Первый год строки: «род. ок. 1335 г. до Р. Х.» → 1335. */
const firstYear = (s: string) => Number(/(\d[\d\s ]*)(?=[\s ]*(?:г\.|гг\.|–))/.exec(s)?.[1].replace(/\D/g, '') ?? NaN);
const SINGLE_YEAR = /\d[\s ]*г\./; // «2100 г.»; промежуток эпохи — «гг.»

const secs = new Map<string, Map<number, string>>();
const pass = new Map<string, Map<string, string>>();

beforeAll(async () => {
  for (const id of allIds) {
    const s = await cardSections(id);
    const t = new Map<number, string>();
    for (const [n, v] of s) t.set(n, tidy(v));
    secs.set(id, t);
    const pp = await passport(id);
    const tp = new Map<string, string>();
    for (const [k, v] of pp) tp.set(k, tidy(v));
    pass.set(id, tp);
  }
}, 240_000);

const sec = (id: string, n: number) => secs.get(id)!.get(n) ?? '';
const pp = (id: string, k: string) => pass.get(id)!.get(k) ?? '';

describe('по всем лицам: § 13 согласован с полом и видом лица', () => {
  it('у женщин нет «Родился» и «застал»', () => {
    const bad = allIds.filter((id) => byId.get(id)!.sex === 'f' && /Родился|(^|[^а-яё])[Зз]астал(?!а)/.test(sec(id, 13)));
    expect(bad).toEqual([]);
  });
  it('у народов и родов нет «Родился» / «Родилась»', () => {
    const bad = allIds.filter((id) => ['people', 'clan'].includes(byId.get(id)!.kind) && /Родил(ся|ась)/.test(sec(id, 13)));
    expect(bad).toEqual([]);
  });
  it('нет «жил при жизни», строки «По родству» и служебной строки «Рождение: … (оценка)»', () => {
    const bad = allIds.filter((id) => /жил при жизни|По родству:|Рождение: .*\((оценка|эпоха|по реконструкции|по числам Писания)\)/.test(sec(id, 13)));
    expect(bad).toEqual([]);
  });
  it('формула § 13 называет родство, а не голые имена', () => {
    // «после Иессея (отец)» — прежний вид; теперь «после отца, Иессея»
    const bad = allIds.filter((id) => /\((отец|мать|сын|дочь)\)/.test(sec(id, 13)));
    expect(bad).toEqual([]);
  });
});

describe('по всем лицам: годы', () => {
  it('у лиц без опор (epochal) нет годов в паспорте, § 8 и § 13', () => {
    const m = models[0];
    const ids = allIds.filter((id) => m.chrono.get(id)?.cls === 'epochal');
    expect(ids.length).toBeGreaterThan(0);
    // годы самой эпохи в скобках («Эпоха: Земная жизнь Иисуса Христа (5 г. до Р. Х. — 30 г. по Р. Х.)») — не годы лица
    const own = (t: string) => t.replace(/^Эпоха[^(]*\([^)]*\)/, '');
    const bad = ids.filter((id) => SINGLE_YEAR.test(sec(id, 8)) || SINGLE_YEAR.test(own(sec(id, 13))) || /\d/.test(pp(id, 'Годы')));
    expect(bad).toEqual([]);
  });
  it('годы паспорта помечены «расч.», оценки округлены до 5 лет', () => {
    const m = models[0];
    const bad: string[] = [];
    for (const id of allIds) {
      const c = m.chrono.get(id);
      if (!c || c.cls === 'epochal') continue;
      const y = pp(id, 'Годы');
      if (!/расч\.$/.test(y)) bad.push(`${id}: нет «расч.»: ${y}`);
      if (c.cls === 'estimated' && firstYear(y) % 5 !== 0) bad.push(`${id}: не округлено: ${y}`);
    }
    expect(bad).toEqual([]);
  });
  it('паспорт, мини-шкала и § 8 называют один и тот же год рождения; конец шкалы — только при годе смерти в паспорте', async () => {
    const { lifeBarLabels } = await import('../src/ui/card/Masthead.tsx');
    const m = models[0];
    const bad: string[] = [];
    for (const id of allIds) {
      const c = m.chrono.get(id);
      if (!c || c.cls === 'epochal') continue;
      const y = pp(id, 'Годы');
      const b8 = firstYear(sec(id, 8));
      const { left, right } = lifeBarLabels(c);
      const lb = Number(left?.replace(/\D/g, '') ?? NaN);
      if (firstYear(y) !== b8 || lb !== b8) bad.push(`${id}: паспорт «${y}», § 8 «${sec(id, 8).slice(0, 40)}», шкала «${left}»`);
      const deathInPassport = /–| — /.test(y); // «1040–970 гг.»; через эру — «5 г. до Р. Х. — 30 г. по Р. Х.»
      if (!!right !== deathInPassport) bad.push(`${id}: конец шкалы «${right}» при паспорте «${y}»`);
    }
    expect(bad).toEqual([]);
  });
  it('§ 20 называет тот же год смерти, что паспорт', () => {
    const bad: string[] = [];
    for (const id of allIds) {
      const y = pp(id, 'Годы');
      // год смерти — после «–» или, если промежуток переходит через эру, после « — »
      const m = /(?:–|г\.[^—]*—)(\d+)/.exec(y.replace(/[\s ]/g, ''));
      const s20 = sec(id, 20);
      if (!m || !/в возрасте/.test(s20)) continue;
      if (firstYear(s20) !== Number(m[1])) bad.push(`${id}: паспорт «${y}», § 20 «${s20.slice(0, 50)}»`);
    }
    expect(bad).toEqual([]);
  });
});

describe('по всем лицам: § 23 считает стихи, а не ссылки', () => {
  it('ни одно число не превышает числа стихов книги', async () => {
    const bad: string[] = [];
    for (const id of allIds) {
      await loadCard(id);
      for (const [book, n] of Object.entries(byId.get(id)!.books)) {
        const max = versesInBook.get(book);
        if (max === undefined || n > max) bad.push(`${id}: ${book} ${n} из ${max}`);
      }
      const t = sec(id, 23);
      const total = /Названо по имени в ([\d\s ]+) стих/.exec(t);
      if (total && Number(total[1].replace(/\D/g, '')) !== Object.values(byId.get(id)!.books).reduce((a, b) => a + b, 0)) bad.push(`${id}: итог не равен сумме по книгам`);
    }
    expect(bad).toEqual([]);
  });
  it('у безымянных лиц нет счёта «названо по имени»', () => {
    const bad = allIds.filter((id) => byId.get(id)!.unnamed && /Названо по имени/.test(sec(id, 23)));
    expect(bad).toEqual([]);
  });
});

describe('напряжения: человеческий язык', () => {
  it('без стрелок, со стихами, имена — цепочкой в именительном падеже', () => {
    for (const t of models[0].tensions) {
      expect(t.text).not.toMatch(/→|->/);
      expect(t.refs.length).toBeGreaterThan(0);
      expect(t.text).toMatch(/^[А-ЯЁ][^:]*:/);
      expect(t.text).not.toMatch(/\((отец|мать|[А-ЯЁ][а-яё]+)\)/);
    }
  });
});

describe('Мелхиседек (сценарий U3)', () => {
  it('без выдуманных годов: паспорт, § 8, § 13 и мини-шкала', async () => {
    const { lifeBarLabels } = await import('../src/ui/card/Masthead.tsx');
    expect(pp('melkhisedek', 'Годы')).toBe('время не установлено');
    expect(sec('melkhisedek', 8)).toBe('Время не установлено; эпоха — Патриархи');
    expect(sec('melkhisedek', 13)).not.toMatch(SINGLE_YEAR);
    expect(lifeBarLabels(models[0].chrono.get('melkhisedek')!)).toEqual({ left: null, right: null });
  });
  it('опора времени — встреча с Авраамом', () => {
    expect(sec('melkhisedek', 13)).toMatch(/Современник Авраама Быт 14:18/);
  });
  it('служебная группа «Прочие лица» не называется ни родом, ни созвездием', () => {
    expect([...pass.get('melkhisedek')!.values()].join(' ')).not.toMatch(/Прочие лица/);
    expect(pass.get('melkhisedek')!.has('Род')).toBe(false);
  });
  it('§ 23: имя в Евр названо в 9 стихах, а не 42 ссылки', () => {
    expect(sec('melkhisedek', 23)).toMatch(/^Названо по имени в 11 стихах; больше всего — Евр \(9\), Быт \(1\), Пс \(1\)\./);
  });
});

describe('Руфь', () => {
  it('колено по браку, эпоха деятельности, годы с пометой', () => {
    expect(pp('ruf', 'Колено / народ')).toBe('моавитянка; в колене Иудином по браку');
    expect(pp('ruf', 'Созвездие')).toBe('Колено Иудино');
    expect(pp('ruf', 'Эпоха')).toBe('Судьи');
    expect(pp('ruf', 'Годы')).toMatch(/^род\. ок\. \d+[05] г\. до Р\. Х\. расч\.$/);
  });
  it('на мини-шкале нет года конца, которого нет в паспорте', async () => {
    const { lifeBarLabels } = await import('../src/ui/card/Masthead.tsx');
    const { left, right } = lifeBarLabels(models[0].chrono.get('ruf')!);
    expect(right).toBeNull();
    expect(Number(left!.replace(/\D/g, ''))).toBe(firstYear(pp('ruf', 'Годы')));
  });
  it('§ 23: книга Руфь — 12 стихов из 85, а не 118', () => {
    expect(sec('ruf', 23)).toMatch(/Руф \(12\)/);
  });
});

describe('Авиуд, сын Зоровавеля (ТЗ § 11.2, п. 4)', () => {
  it('формула «после отца, Зоровавеля» с названием родства и пометой «расч.»', () => {
    expect(sec('aviud-syn-zorovavelya', 13)).toMatch(/Родился примерно через \d+ лет после отца, Зоровавеля, и примерно за \d+ лет до сына, Елиакима\. расч\./);
    expect(sec('aviud-syn-zorovavelya', 13)).toMatch(/Эпоха рождения: Возвращение и персидское время/);
  });
  it('колено по предкам — колено Иудино, дом Давидов; § 23 — только Мф 1:13', () => {
    expect(pp('aviud-syn-zorovavelya', 'Колено / народ')).toBe('колено Иудино, дом Давидов');
    expect(sec('aviud-syn-zorovavelya', 23)).toMatch(/^Названо по имени в 1 стихе \(Мф\)/);
  });
});

describe('Моисей (ТЗ § 11.2, п. 8–9)', () => {
  it('напряжение — цепочкой имён, со стихом Исх 12:40 и объяснением', () => {
    const t = sec('moisey', 13);
    expect(t).toMatch(/Хронологическое напряжение\. Иаков — Левий — Кааф — Амрам — Моисей: 4 поколения на \d+ лет/);
    expect(t).toMatch(/430 годах пребывания в Египте \(Исх 12:40\)/);
    // больше трёх ссылок — первые три и «ещё N мест» (B4); все стихи напряжения — в данных
    expect(t).toMatch(/Исх 12:40; 6:16; 6:18; ещё 5 мест/);
    const refs = models[0].tensions.find((x) => x.persons.includes('moisey') && x.refs.includes('Исх 12:40'))!.refs;
    expect(refs.slice(0, 5)).toEqual(['Исх 12:40', 'Исх 6:16', 'Исх 6:18', 'Исх 6:20', 'Исх 7:7']);
    expect(t).toMatch(/В модели «краткое пребывание, 215 лет в Египте» этого напряжения нет/);
    expect(t).not.toMatch(/→/);
  });
  it('в модели «краткое пребывание» напряжения у Моисея нет', async () => {
    const short = await loadModel('mt-short');
    expect(short!.tensions.filter((x) => x.persons.includes('moisey'))).toEqual([]);
  });
  it('паспорт: эпохи жизни, колено по предкам, годы с пометой', () => {
    expect(pp('moisey', 'Эпоха')).toBe('Израиль в Египте — Исход и странствие в пустыне');
    expect(pp('moisey', 'Колено / народ')).toBe('колено Левиино');
    expect(pp('moisey', 'Годы')).toBe('ок. 1526–1406 гг. до Р. Х. расч.');
  });
  it('формула не опирается на пару, о которой говорит напряжение', () => {
    expect(sec('moisey', 13)).not.toMatch(/после отца, Амрама/);
  });
});

describe('Мария', () => {
  it('«Родилась», Сын — Иисус Христос', () => {
    const t = sec('mariya', 13);
    expect(t).toMatch(/Родилась примерно за \d+ лет до Сына, Иисуса Христа/);
    expect(t).not.toMatch(/Родился/);
  });
  it('паспорт: эпоха служения, колено по толкованию и по браку', () => {
    expect(pp('mariya', 'Эпоха')).toBe('Земная жизнь Иисуса Христа');
    expect(pp('mariya', 'Колено / народ')).toBe('колено Иудино, дом Давидов — по толкованию; в колене Иудином по браку');
    expect(pp('mariya', 'Созвездие')).toBe('Родословие Иисуса Христа');
  });
  it('§ 8 и § 13 называют эпоху рождения', () => {
    expect(sec('mariya', 8)).toMatch(/эпоха — Межзаветное время/);
    expect(sec('mariya', 13)).toMatch(/^Эпоха рождения: Межзаветное время/);
  });
});

describe('Давид и Мицраим', () => {
  it('Давид: паспорт и § 23 в пределах книг', () => {
    expect(pp('david', 'Колено / народ')).toBe('колено Иудино');
    expect(pp('david', 'Эпоха')).toBe('Единое царство');
    expect(pp('david', 'Годы')).toBe('ок. 1040–970 гг. до Р. Х. расч.');
    const n = Number(/2 Цар \((\d+)\)/.exec(sec('david', 23))?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(versesInBook.get('2Цар')!);
  });
  it('Мицраим: «застал деда, Ноя» вместо «жил при жизни»', () => {
    expect(sec('mitsraim', 13)).toMatch(/застал деда, Ноя/);
    expect(pp('mitsraim', 'Годы')).toMatch(/^род\. ок\. \d+[05] г\. до Р\. Х\. расч\.$/);
  });
});

describe('правки координатора по отчёту карточки', () => {
  it('ни в одном разделе и паспорте нет NaN, undefined, null и [object …] (прежде: «ок. NaN г.» у Хелува)', () => {
    const bad: string[] = [];
    const junk = /NaN|undefined|\bnull\b|\[object/;
    for (const id of allIds) {
      for (const [n, t] of secs.get(id)!) if (junk.test(t)) bad.push(`${id} § ${n}`);
      for (const [k, t] of pass.get(id)!) if (junk.test(t)) bad.push(`${id} ${k}`);
    }
    expect(bad).toEqual([]);
  });
  it('§ 7 называет колено или народ по предкам, а не созвездие', () => {
    expect(sec('ruf', 7)).toMatch(/^моавитянка; в колене Иудином по браку/);
    expect(sec('david', 7)).toMatch(/^колено Иудино/);
  });
  it('Иисус Христос — «колено Иудино, дом Давидов» без пометы: законная линия и Лк 3 сходятся (Евр 7:14)', () => {
    expect(pp('iisus', 'Колено / народ')).toBe('колено Иудино, дом Давидов');
    expect(sec('iisus', 7)).toMatch(/^колено Иудино, дом Давидов(?! —)/);
  });
  it('§ 20: у точного года смерти тоже помета «расч.»; возраст не повторяется, если его называет запись составителя (F5)', () => {
    expect(sec('david', 20)).toMatch(/^ок\. 970 г\. до Р\. Х\. расч\./);
    expect(sec('david', 20)).toMatch(/Прожил около 70 лет/);
    expect(sec('david', 20).match(/70 лет/g)).toHaveLength(1);
    expect(sec('avraam', 20)).toMatch(/^1991 г\. до Р\. Х\. расч\. Прожил 175 лет/);
    // у Адама число лет в записи — словами, в цитате: возраст по расчёту остаётся
    expect(sec('adam', 20)).toMatch(/в возрасте 930 лет расч\./);
  });
  it('§ 23 остаётся с «Первым упоминанием», даже если лицо не названо по имени ни в одном стихе', () => {
    expect(sec('dodo-ded-foly', 23)).toMatch(/Первое упоминание: Суд 10:1/);
  });
  it('§ 14: встреча Мелхиседека с Аврамом показана, хотя время его жизни не установлено', () => {
    expect(sec('melkhisedek', 14)).toMatch(/Встречи, о которых говорит Писание/);
    expect(sec('melkhisedek', 14)).toMatch(/Быт 14:18–20/);
  });
});

describe('младенец, сын Давида и Вирсавии (2 Цар 12:18)', () => {
  it('умер младенцем: без «в возрасте 0 лет», годы — одним годом', () => {
    expect(sec('mladenets-syn-virsavii', 20)).toMatch(/младенцем/);
    expect(sec('mladenets-syn-virsavii', 20)).not.toMatch(/в возрасте 0/);
    expect(pp('mladenets-syn-virsavii', 'Годы')).not.toMatch(/(\d+)–\1/);
  });
});
