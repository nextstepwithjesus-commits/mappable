/**
 * § 23 «Места Писания», этап 11 (DF2): упоминание по имени засчитывается лицу, только если стих не называет тёзку, место,
 * народ или бога (правила — tools/mentions.ts). Прежде у лиц без тёзок в атласе считалась вся Библия, и в § 23 попадали:
 *  — Гог, сын Шемаии (1 Пар 5:4), — Гог Иез 38–39 и Откр 20:7;
 *  — Салу (Чис 25:14) — «Салу», винительный падеж от «Сала»: Быт 10:24; 11:12; 1 Пар 1:18;
 *  — Буз (1 Пар 5:14) — народ Буз, Иер 25:23;
 *  — Ноа, дочь Салпаада, — «о Ное», Быт 8:1;
 *  — Фирца, дочь Салпаада, — город Фирца: Нав 12:24, 3–4 Цар, Песн 6:4;
 *  — Гадий, отец Менаима (4 Цар 15:14), — «Гадитянин», «Гадитяне»: 2 Цар 23:36; 1 Пар 5:26; 12:8;
 *  — Адрамелех, сын Сеннахирима, — бог Сепарваимский, 4 Цар 17:31.
 * Счёт у главных лиц не уменьшается: Давид, Авраам, Моисей, Павел названы и в книгах, на которые их карточки не ссылаются.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Group, Volume } from '../src/data/types.ts';
import { loadBible } from '../tools/bible.ts';
import { countMentions, refsOf, BOOK_RULE_MAX_PROMINENCE, type MentionCount } from '../tools/mentions.ts';

const ROOT = join(__dirname, '..');

/** Лица всех томов — как в сборке (tools/build-data.ts): лицо — из первого тома, где оно записано. */
function allPersons(): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const dir = join(ROOT, 'data/persons');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume;
    for (const p of v.persons) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  return out;
}

const persons = allPersons();
const byId = new Map(persons.map((p) => [p.id, p]));
const groups = JSON.parse(readFileSync(join(ROOT, 'data/groups.json'), 'utf8')) as Group[];
let M: MentionCount;
beforeAll(() => {
  M = countMentions(persons, groups, loadBible());
}, 60_000);
const verses = (id: string) => M.verses.get(id)!;
const books = (id: string) => Object.keys(M.books.get(id)!);

describe('§ 23: семь случаев из сверки с Писанием (DF2) больше не попадают', () => {
  it('Гог, сын Шемаии: только 1 Пар 5:4 — без Гога Иезекииля и Откровения', () => {
    expect(verses('gog-syn-shemai').has('1Пар 5:4')).toBe(true);
    expect(books('gog-syn-shemai')).not.toContain('Иез');
    expect(books('gog-syn-shemai')).not.toContain('Откр');
  });
  it('Салу: Чис 25:14, а не «родил Салу» (Сала) в Быт 10:24; 11:12; 1 Пар 1:18', () => {
    expect(verses('salu').has('Чис 25:14')).toBe(true);
    for (const v of ['Быт 10:24', 'Быт 11:12', '1Пар 1:18']) expect(verses('salu').has(v), v).toBe(false);
    // сам Сала эти стихи сохраняет
    for (const v of ['Быт 10:24', 'Быт 11:12', '1Пар 1:18']) expect(verses('sala').has(v), v).toBe(true);
  });
  it('Буз, сын Иахдо: 1 Пар 5:14 — без народа Буз (Иер 25:23)', () => {
    expect(verses('buz-1par5-14').has('1Пар 5:14')).toBe(true);
    expect(verses('buz-1par5-14').has('Иер 25:23')).toBe(false);
  });
  it('Ноа, дочь Салпаада: без «вспомнил Бог о Ное» (Быт 8:1); у Ноя этот стих остаётся', () => {
    expect(verses('noa-doch-salpaada').has('Чис 26:33')).toBe(true);
    expect(verses('noa-doch-salpaada').has('Быт 8:1')).toBe(false);
    expect(verses('noy').has('Быт 8:1')).toBe(true);
  });
  it('Фирца, дочь Салпаада: без города Фирца — Нав 12:24, 3–4 Цар, Песн 6:4', () => {
    for (const v of ['Чис 26:33', 'Чис 27:1', 'Нав 17:3']) expect(verses('firtsa-doch-salpaada').has(v), v).toBe(true);
    expect(verses('firtsa-doch-salpaada').has('Нав 12:24')).toBe(false);
    expect(verses('firtsa-doch-salpaada').has('Песн 6:4')).toBe(false);
    expect(books('firtsa-doch-salpaada')).not.toContain('3Цар');
    expect(books('firtsa-doch-salpaada')).not.toContain('4Цар');
  });
  it('Гадий, отец Менаима: 4 Цар 15:14, 17 — без «Гадитянина» и «Гадитян»', () => {
    expect(verses('gadiy').has('4Цар 15:14')).toBe(true);
    for (const v of ['2Цар 23:36', '1Пар 5:26', '1Пар 12:8']) expect(verses('gadiy').has(v), v).toBe(false);
  });
  it('Адрамелех, сын Сеннахирима: 4 Цар 19:37 и Ис 37:38 — без бога Адрамелеха (4 Цар 17:31)', () => {
    expect(verses('adramelekh').has('4Цар 19:37')).toBe(true);
    expect(verses('adramelekh').has('Ис 37:38')).toBe(true);
    expect(verses('adramelekh').has('4Цар 17:31')).toBe(false);
  });
});

describe('§ 23: счёт у главных лиц не уменьшился', () => {
  // до правки (прежнее правило на тех же данных): Давид — 992 стиха в 28 книгах, Авраам — 282 в 27, Моисей — 784 в 31,
  // Павел — 120 в 15. Этап 13 (решение 108): у Давида из 992 стихов 23 были ложными — описательное «Сын Иессеев» (§ 4)
  // засчитывалось по первому слову: «Сына» в Мф 1:21, «Сыновья» в 1 Пар 2:8. Настоящих — 969; ложные проверены ниже
  const before: [string, number, number, string[]][] = [
    ['david', 28, 992 - 23, ['Притч', 'Еккл', 'Зах', 'Песн', '1Цар', 'Пс']],
    ['avraam', 27, 282, ['Втор', 'Пс', 'Мих', 'Лев', 'Мк']],
    ['moisey', 31, 784, ['Суд', '4Цар', 'Мк', 'Рим', 'Дан', '1Кор']],
    ['pavel', 15, 120, ['Еф', 'Кол', '1Фес', '2Фес', '1Тим', 'Тит']],
  ];
  for (const [id, nBooks, nVerses, kept] of before)
    it(`${byId.get(id)?.name}: не меньше ${nBooks} книг и ${nVerses} стихов, в том числе книги без ссылок карточки`, () => {
      expect(books(id).length).toBeGreaterThanOrEqual(nBooks);
      expect(verses(id).size).toBeGreaterThanOrEqual(nVerses);
      for (const b of kept) expect(books(id), b).toContain(b);
      expect(M.mentions.get(id)!.scope).toBe('bible');
    });
});

describe('§ 23: этап 13 (решение 108) — одно имя одному лицу, дефис, описательные имена', () => {
  it('Давид: «Сын Иессеев» не засчитывает стихи со словом «Сын» и «Сыновья», где Давида нет', () => {
    for (const v of ['Мф 1:21', 'Мф 1:23', 'Лк 1:31', 'Лк 1:35', 'Рим 1:4', 'Мф 12:8', '1Пар 2:8', '1Пар 9:40']) expect(verses('david').has(v), v).toBe(false);
    for (const v of ['Мф 1:1', 'Мф 1:6', 'Рим 1:3', 'Лк 1:32']) expect(verses('david').has(v), v).toBe(true);
  });
  it('стих, где имя одно, засчитан одному лицу: тому, у кого полное имя, родня рядом или ссылка точнее', () => {
    expect(verses('mariya-magdalina').has('Ин 19:25')).toBe(true);
    expect(verses('mariya-kleopova').has('Ин 19:25')).toBe(true);
    expect(verses('mariya').has('Ин 19:25')).toBe(false); // «Матерь Его» — не по имени
    expect(verses('ieroboam').has('4Цар 14:24')).toBe(true); // «Иеровоама, сына Наватова»
    expect(verses('ieroboam-vtoroy').has('4Цар 14:24')).toBe(false);
    expect(verses('iakov-menshiy').has('Мф 27:56')).toBe(true); // «мать Иакова и Иосии»
    expect(verses('iakov-zevedeev').has('Мф 27:56')).toBe(false);
    expect(verses('ioann-deyan4-6').has('Деян 4:6')).toBe(true);
    expect(verses('ioann-apostol').has('Деян 4:6')).toBe(false);
    for (const [a, b, v] of [['gera-1par8-3', 'gera-1par8-5', '1Пар 8:3'], ['gera-1par8-5', 'gera-1par8-3', '1Пар 8:5'], ['melkhiy-lk3-28', 'melkhiy-lk3-24', 'Лк 3:28'], ['iosif-lk3-30', 'iosif-lk3-24', 'Лк 3:30']]) {
      expect(verses(a).has(v), `${a} ${v}`).toBe(true);
      expect(verses(b).has(v), `${b} ${v}`).toBe(false);
    }
    // сплошная проверка (П19): стих, где имя стоит k раз, засчитан не больше чем k лицам с этим именем
    expect(M.resolved.length).toBeGreaterThan(10);
    expect(M.unresolved).toEqual([]);
  });
  it('дефис: царь Хирам — не «Хирам-Авий» (2 Пар 2:13); иная форма «Азария» — не первосвященник 2 Пар 26:17, 20', () => {
    expect(verses('khiram-tsar').has('2Пар 2:13')).toBe(false);
    expect(verses('khiram-master').has('2Пар 2:13')).toBe(true);
    for (const v of ['2Пар 26:17', '2Пар 26:20']) expect(verses('oziya').has(v), v).toBe(false);
    expect(verses('oziya').has('4Цар 15:1')).toBe(true); // «Азария» — сам царь в 4 Цар 15
    expect(verses('pavel').has('Деян 22:7')).toBe(true); // «Савл, Савл!» — Павел
  });
  it('у народа — пометка для подписи § 23 «имя народа или земли»', () => {
    const people = persons.filter((p) => p.kind === 'people' && M.mentions.has(p.id));
    expect(people.length).toBeGreaterThan(5);
    for (const p of people) expect(M.mentions.get(p.id)!.people, p.id).toBe(true);
    expect(M.mentions.get('david')!.people).toBeUndefined();
  });
});

describe('§ 23: правила счёта (tools/mentions.ts)', () => {
  it('правило книг — только у лиц значимости 1–3; у главных лиц книг и истории спасения — вся Библия', () => {
    expect(BOOK_RULE_MAX_PROMINENCE).toBe(3);
    for (const id of ['david', 'avraam', 'moisey', 'pavel']) expect(byId.get(id)!.prominence).toBeGreaterThan(BOOK_RULE_MAX_PROMINENCE);
  });
  it('стих чужой книги засчитывается, если рядом названа родня: «Халев, сын Иефонниин» (Втор 1:36), «Иоав, сын Саруин» (3 Цар 2:5)', () => {
    const own = (id: string) => new Set(refsOf(byId.get(id)!, { notes: false }).map((r) => r.split(' ')[0]));
    expect(own('iefonniya-otets-khaleva').has('Втор')).toBe(false);
    expect(verses('iefonniya-otets-khaleva').has('Втор 1:36')).toBe(true);
    expect(own('saruiya').has('3Цар')).toBe(false);
    expect(verses('saruiya').has('3Цар 2:5')).toBe(true);
  });
  it('форма места — только в стихах карточки: Вирсавия, жена Урии, — не город Вирсавия (Быт 21:14; «от Дана до Вирсавии»)', () => {
    expect(verses('virsaviya').has('2Цар 11:3')).toBe(true);
    for (const v of ['Быт 21:14', 'Суд 20:1', '3Цар 19:3']) expect(verses('virsaviya').has(v), v).toBe(false);
  });
  it('у безымянных лиц упоминаний по имени нет; число в § 23 — сумма по книгам', () => {
    for (const p of persons) {
      const n = Object.values(M.books.get(p.id)!).reduce((a, b) => a + b, 0);
      if (p.unnamed) expect(n, p.id).toBe(0);
      expect(M.mentions.get(p.id)?.n ?? 0, p.id).toBe(n);
    }
  });
});
