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
    for (const [k, v] of pp) tp.set(tidy(k), tidy(v));
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
    // этап 13 (решение 100): строка «Эпоха» § 13 стоит второй — «Эпоха Патриархи (2166–1876 гг. до Р. Х.)»
    const own = (t: string) => t.replace(/Эпоха [^(]*\([^)]*\)/g, '');
    const bad = ids.filter((id) => SINGLE_YEAR.test(sec(id, 8)) || SINGLE_YEAR.test(own(sec(id, 13))) || /\d/.test(pp(id, 'Годы')));
    expect(bad).toEqual([]);
  });
  // народ и род из родословия года рождения не имеют (решение 23; CARD-59): их годы здесь не сверяются, см. ниже
  const people = (id: string) => ['people', 'clan'].includes(byId.get(id)!.kind);
  // этап 13, решение 96: помета «расч.» — у всех годов атласа, и у оценённого по порядку перечисления братьев («выв.» у
  // такого года больше не ставится: из порядка выводится очерёдность, а не год); оценка округлена до 5 лет (концы
  // промежутка «между» — до 5 или 10), кроме года на границе текста («не позже 1876»)
  it('годы паспорта помечены «расч.», оценки округлены до 5 лет', () => {
    const m = models[0];
    const bad: string[] = [];
    for (const id of allIds) {
      const c = m.chrono.get(id);
      if (!c || c.cls === 'epochal' || people(id)) continue;
      const y = pp(id, 'Годы');
      const years = y.split(' расч.')[0];
      if (!/ расч\./.test(y) || / выв\./.test(years)) bad.push(`${id}: нет «расч.»: ${y}`);
      if (c.cls === 'estimated' && !c.pin && !/не (позже|раньше)/.test(years) && (years.match(/\d+/g) ?? []).slice(0, /между/.test(years) ? 2 : 1).some((n) => Number(n) % 5 !== 0))
        bad.push(`${id}: не округлено: ${y}`);
    }
    expect(bad).toEqual([]);
  });
  it('паспорт, мини-шкала и § 8 называют один и тот же год рождения; конец шкалы — только при годе смерти в паспорте', async () => {
    const { lifeBarLabels } = await import('../src/ui/card/Masthead.tsx');
    const { datesOf } = await import('../src/ui/card/shared.tsx');
    const m = models[0];
    const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
    const bad: string[] = [];
    for (const id of allIds) {
      const c = m.chrono.get(id);
      if (!c || c.cls === 'epochal' || people(id)) continue;
      const y = pp(id, 'Годы').split(' расч.')[0];
      // § 8: «между 45 и 20 гг. до Р. Х.; эпоха рождения — …»; шкала: «45–20»; паспорт: «род. между 45 и 20 гг. …»
      const b8 = nums(sec(id, 8).split(';')[0]);
      const { left, right } = lifeBarLabels(datesOf(id, c, m.chrono));
      const lb = nums(left ?? '');
      if (b8.join() !== lb.join() || nums(y).slice(0, b8.length).join() !== b8.join()) bad.push(`${id}: паспорт «${y}», § 8 «${sec(id, 8).slice(0, 50)}», шкала «${left}»`);
      const deathInPassport = /–| — |ум\./.test(y); // «1040–970 гг.»; через эру — «5 г. до Р. Х. — 30 г. по Р. Х.»; «ум. между…»
      if (!!right !== deathInPassport) bad.push(`${id}: конец шкалы «${right}» при паспорте «${y}»`);
    }
    expect(bad.slice(0, 20), `${bad.length}`).toEqual([]);
  });
  it('у народа и рода § 8 не строится, происхождение — в § 6 «Произошли от» (решение 23; CARD-87)', () => {
    const bad: string[] = [];
    for (const id of allIds.filter(people)) {
      const t = sec(id, 8);
      if (t) bad.push(`${id}: § 8 «${t.slice(0, 60)}»`);
      if (byId.get(id)!.kind === 'people' && byId.get(id)!.father && !/^Произошли от: /.test(sec(id, 6))) bad.push(`${id}: § 6 «${sec(id, 6).slice(0, 60)}»`);
    }
    expect(bad).toEqual([]);
    expect(sec('ludim', 6)).toMatch(/^Произошли от: Мицраим Быт 10:13/);
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
      // у народа и рода подпись своя (решение 108): «Имя народа или земли названо…», «Имя рода названо…»
      const total = /Имя(?: народа или земли| рода)? названо в ([\d\s ]+) стих/.exec(t);
      if (total && Number(total[1].replace(/\D/g, '')) !== Object.values(byId.get(id)!.books).reduce((a, b) => a + b, 0)) bad.push(`${id}: итог не равен сумме по книгам`);
    }
    expect(bad).toEqual([]);
  });
  it('у безымянных лиц нет счёта «имя названо»', () => {
    const bad = allIds.filter((id) => byId.get(id)!.unnamed && /Имя(?: народа или земли| рода)? названо/.test(sec(id, 23)));
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
    expect(sec('melkhisedek', 23)).toMatch(/^Имя названо в 11 стихах; больше всего — Евр \(9\), Быт \(1\), Пс \(1\)\./);
  });
});

describe('Руфь', () => {
  it('колено по браку, эпоха деятельности, годы с пометой', () => {
    // этап 13, решение 97: происхождение и брак — отдельными строками паспорта
    expect(pp('ruf', 'Колено / народ')).toBe('моавитянка');
    expect(pp('ruf', 'По браку')).toBe('колено Иудино (жена Вооза)');
    expect(pp('ruf', 'Созвездие')).toBe('Колено Иудино');
    expect(pp('ruf', 'Эпоха')).toBe('Судьи');
    // этап 13, решения 96–97: широкая оценка — промежутком «между … и …» без «ок.»; о смерти — второй строкой со стихом
    expect(pp('ruf', 'Годы')).toMatch(/^род\. между \d+[05] и \d+[05] гг\. до Р\. Х\. расч\. о смерти Писание не говорит; последнее упоминание — \d+ г\. до Р\. Х\. Руф 4:13$/);
  });
  it('на мини-шкале нет года конца, которого нет в паспорте', async () => {
    const { lifeBarLabels } = await import('../src/ui/card/Masthead.tsx');
    const { left, right } = lifeBarLabels(models[0].chrono.get('ruf')!);
    expect(right).toBeNull();
    // этап 13, решение 97: на шкале — те же числа промежутка, что в паспорте («1360–1315»)
    const nums = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
    expect(nums(left!)).toEqual(nums(pp('ruf', 'Годы')).slice(0, 2));
  });
  it('§ 23: книга Руфь — 12 стихов из 85, а не 118', () => {
    expect(sec('ruf', 23)).toMatch(/Руф \(12\)/);
  });
});

describe('Авиуд, сын Зоровавеля (ТЗ § 11.2, п. 4)', () => {
  it('сжатое родословие вместо формулы «после отца, Зоровавеля»; эпоха; помета «толк.»', () => {
    // этап 13, решение 100 (X2 § 1 п. 2, § 2.3 п. 3): цепочка Мф 1:13–16 растянута по 44+ года на поколение — в строке
    // «Среди родни» вместо формулы «через 55 лет после отца» напряжение «сжатое родословие»; Зоровавель в нём первый
    const t = sec('aviud-syn-zorovavelya', 13);
    expect(t).toMatch(/Среди родни Хронологическое напряжение\. Зоровавель — Авиуд — Елиаким — [^:]+ — Иосиф: 10 поколений — не меньше чем \d+ лет\. Вероятно, родословие называет не все поколения\. Подробнее см\. § 24\./);
    expect(t).not.toMatch(/примерно через \d+ лет после отца/);
    expect(t).not.toMatch(/Елиакима/);
    // строка «Эпоха» § 13 — эпоха жизни с её годами; эпоха рождения та же и не повторяется
    expect(t).toMatch(/Эпоха Возвращение и персидское время \([^)]+\)\. Среди родни/);
  });
  it('колено по предкам — колено Иудино, дом Давидов; § 23 — только Мф 1:13', () => {
    expect(pp('aviud-syn-zorovavelya', 'Колено / народ')).toBe('колено Иудино, дом Давидов');
    expect(sec('aviud-syn-zorovavelya', 23)).toMatch(/^Имя названо в 1 стихе \(Мф\)/);
  });
});

describe('Моисей (ТЗ § 11.2, п. 8–9)', () => {
  it('напряжение 430 лет — одной записью со стихом Исх 12:40 и объяснением', () => {
    // в § 13 — одной записью: суть, вывод и «Подробнее см. § 24»; объяснение целиком — в § 24
    // (предел 8 строк § 13 и правило «каждый факт живёт в одном разделе»; CARD-61)
    const t = sec('moisey', 13);
    // этап 13, решения 100–101: 430 лет — одна запись на все звенья (Зара — … — Ахан; Кааф — Амрам — Моисей; Левий —
    // Иохаведа — Моисей); формулы нет (она опиралась бы на пару напряжения) — запись в строке «Среди родни»
    // после сути — звенья записи, где назван Моисей
    expect(t).toMatch(/Среди родни Хронологическое напряжение\. Пребывание в Египте — 430 лет \(Исх 12:40\), а родословия называют за это время лишь несколько поколений: Кааф — Амрам — Моисей; Левий — Иохаведа — Моисей\. Вероятно, родословия называют не все поколения\. Подробнее см\. § 24\./);
    // вторая половина вывода («— или 430 лет считаются с прихода Авраама…») — в § 24: § 13 держит предел 8 строк (F5)
    expect(sec('moisey', 24)).toMatch(/или 430 лет считаются с прихода Авраама в Ханаан/);
    expect(t.match(/Вероятно/g)).toHaveLength(1);
    // больше трёх ссылок — первые три и «ещё N ссылок» (B4; CARD-67); все стихи напряжения — в данных
    expect(t).toMatch(/Исх 12:40; Гал 3:17; [^;]+; ещё \d+ ссыл/);
    const refs = models[0].tensions.find((x) => x.persons.includes('moisey') && x.refs.includes('Исх 12:40'))!.refs;
    expect(refs[0]).toBe('Исх 12:40');
    const n = sec('moisey', 24);
    expect(n).toMatch(/Хронологическое напряжение\. Пребывание в Египте — 430 лет \(Исх 12:40\)/);
    expect(n).toMatch(/Кааф — Амрам — Моисей: /);
    expect(n).toMatch(/Левий — Иохаведа — Моисей: /);
    expect(n).toMatch(/Исх 12:40; Гал 3:17; [^;]+; ещё \d+ ссыл/);
    expect(n).toMatch(/В модели «Краткое пребывание» этого напряжения нет/);
    expect(t + n).not.toMatch(/→/);
  });
  it('в модели «краткое пребывание» напряжения 430 лет у Моисея нет; остаётся «Левий — Иохаведа» (решение 101)', async () => {
    const short = await loadModel('mt-short');
    const own = short!.tensions.filter((x) => x.persons.includes('moisey'));
    expect(own.filter((x) => x.refs.includes('Исх 12:40') && x.kind === 'chain')).toEqual([]);
    expect(own.map((x) => x.text.split(':')[0].replace(/\s+/g, ' '))).toEqual(['Левий — Иохаведа — Моисей']);
  });
  it('паспорт: эпохи жизни, колено по предкам, годы с пометой', () => {
    // этап 13, решение 98: видимая строка — эпоха жизни (служения), вторая строка — эпоха рождения
    expect(pp('moisey', 'Эпоха')).toBe('Исход и странствие в пустыне родился в эпоху «Израиль в Египте»');
    expect(pp('moisey', 'Колено / народ')).toBe('колено Левиино');
    // этап 13, решение 96: у расчётных годов нет «ок.» — только помета «расч.»
    expect(pp('moisey', 'Годы')).toBe('1526–1406 гг. до Р. Х. расч.');
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
    // этап 13 (T3, data/epochs.json): эпоха служения Иисуса — «Евангельская история»
    expect(pp('mariya', 'Эпоха')).toBe('Евангельская история родилась в эпоху «Межзаветное время»');
    // этап 13, решение 97 (X4 Д9, D9): две подписанные строки; «по толкованию» — помета «толк.» на поле, а не хвост строки
    expect(pp('mariya', 'Колено / народ')).toBe('колено Иудино, дом Давидов толк.');
    expect(pp('mariya', 'По браку')).toBe('колено Иудино (жена Иосифа)');
    // этап 13, решение 110: созвездие с братьями Господними — «Родословие и семья Иисуса Христа» (data/groups.json)
    expect(pp('mariya', 'Созвездие')).toBe('Родословие и семья Иисуса Христа');
  });
  it('§ 8 и § 13 называют эпоху рождения', () => {
    // этап 13, решения 98 и 100: в § 8 — «эпоха рождения», в § 13 — строка «Эпоха» с эпохой жизни и эпохой рождения
    expect(sec('mariya', 8)).toMatch(/эпоха рождения — Межзаветное время/);
    expect(sec('mariya', 13)).toMatch(/Эпоха Евангельская история \([^)]+\); родилась в эпоху «Межзаветное время» \([^)]+\)\./);
  });
});

describe('Давид и Мицраим', () => {
  it('Давид: паспорт и § 23 в пределах книг', () => {
    expect(pp('david', 'Колено / народ')).toBe('колено Иудино');
    expect(pp('david', 'Эпоха')).toBe('Единое царство');
    expect(pp('david', 'Годы')).toBe('1040–970 гг. до Р. Х. расч.'); // этап 13, решение 96: без «ок.» у расчётных
    const n = Number(/2 Цар \((\d+)\)/.exec(sec('david', 23))?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(versesInBook.get('2Цар')!);
  });
  it('Мицраим — народ (решение 61): без года рождения, без § 8 и § 14; § 6 «Произошли от: Хам»', () => {
    // «Мицраим» — еврейское имя Египта (§ 24); Писание не рассказывает о нём как о человеке
    expect(byId.get('mitsraim')!.kind).toBe('people');
    expect(pp('mitsraim', 'Годы')).not.toMatch(/род\. ок\./);
    expect(sec('mitsraim', 8)).toBe('');
    expect(sec('mitsraim', 14)).toBe('');
    expect(sec('mitsraim', 6)).toMatch(/^Произошли от: Хам/);
    // Хуш и Ханаан остаются лицами: о Ханаане — рассказ (Быт 9:18–27), о Хуше — отец Нимрода (Быт 10:8)
    expect(byId.get('khanaan')!.kind).toBe('person');
    expect(byId.get('khush-syn-khama')!.kind).toBe('person');
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
    expect(sec('ruf', 7)).toMatch(/^моавитянка По браку — колено Иудино \(жена Вооза\)/);
    expect(sec('david', 7)).toMatch(/^колено Иудино/);
  });
  it('Иисус Христос — «колено Иудино, дом Давидов» без пометы: законная линия и Лк 3 сходятся (Евр 7:14)', () => {
    expect(pp('iisus', 'Колено / народ')).toBe('колено Иудино, дом Давидов');
    expect(sec('iisus', 7)).toMatch(/^колено Иудино, дом Давидов(?! —)/);
  });
  it('§ 20: у точного года смерти тоже помета «расч.»; возраст не повторяется, если его называет запись составителя (F5)', () => {
    expect(sec('david', 20)).toMatch(/^970 г\. до Р\. Х\. расч\./); // этап 13, решение 96
    expect(sec('david', 20)).toMatch(/Прожил около 70 лет/);
    expect(sec('david', 20).match(/70 лет/g)).toHaveLength(1);
    expect(sec('avraam', 20)).toMatch(/^1991 г\. до Р\. Х\. расч\. Прожил 175 лет/);
    // этап 13 (решение 112; X4 Д10): возраст, названный Писанием (Быт 5:5), — своей строкой со стихом и без «расч.»;
    // помета «расч.» — только у года
    expect(sec('adam', 20)).toMatch(/^3244 г\. до Р\. Х\. расч\. В возрасте 930 лет Быт 5:5/);
    // возраст по расчёту — со словами «по расчёту» под пометой года
    expect(sec('korey', 20)).toMatch(/в возрасте около \d+ лет по расчёту/);
  });
  it('§ 23 остаётся с «Первым упоминанием», даже если лицо не названо по имени ни в одном стихе', () => {
    expect(sec('dodo-ded-foly', 23)).toMatch(/Первое упоминание: Суд 10:1/);
  });
  it('§ 14: встреча Мелхиседека с Аврамом показана, хотя время его жизни не установлено', () => {
    // решение 19 (CARD-55): встречи из своей и чужих карточек — «Встречи и связи, о которых говорит Писание»
    expect(sec('melkhisedek', 14)).toMatch(/Встречи и связи, о которых говорит Писание/);
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
