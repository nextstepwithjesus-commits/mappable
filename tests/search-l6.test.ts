/**
 * Поиск, круг 3 (L6) на настоящих данных: запрос из нескольких слов (IX-71), служебные слова уточнений (IX-55),
 * глава и стих, которых нет (IX-82, UX-82), строки главы и стиха (IX-75), выбор второго лица (UX-13), объявление
 * «в работу» (IX-84) и микрошкала строки (VIS-17). Нужна свежая сборка данных: npm run -s data.
 */
import { describe, expect, it } from 'vitest';
import { byId, models } from '../src/data/atlas.ts';
import { chapterCount, parseQueryRef, refProblem, verseCount, verseExists } from '../src/engine/search.ts';
import { GAPS, VERSES } from '../src/engine/verseCounts.ts';
import { BOOKS } from '../src/engine/books.ts';
import { searchIndex } from '../src/ui/top/searchIndex.ts';
import { bookWhere, cmdLabel, emptyText, markAllIds, refProblemText, resultBlocks, searchRowCmd } from '../src/ui/top/Search.tsx';
import { axisMarks, partialHead, personBlocks } from '../src/ui/top/Combobox.tsx';
import { workSet } from '../src/ui/work.ts';
import { loadBible } from '../tools/bible.ts';

const ids = (q: string, n = 30) => searchIndex.search(q, n).map((h) => h.id);
const flat = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : ''));

describe('несколько слов: имя, уточнение, роль (IX-71)', () => {
  it('«Иосиф муж Марии» — Иосиф, муж Марии, первым; запятая не мешает', () => {
    expect(ids('Иосиф муж Марии')[0]).toBe('iosif-muzh-marii');
    expect(ids('Иосиф, муж Марии')[0]).toBe('iosif-muzh-marii');
  });
  it('роль и имя в любом порядке: «царь Давид», «пророк Илия», «апостол Петр»', () => {
    expect(ids('царь Давид')[0]).toBe('david');
    expect(ids('пророк Илия')[0]).toBe('iliya');
    expect(ids('апостол Петр')[0]).toBe('petr');
    expect(ids('Руфь Моавитянка')[0]).toBe('ruf');
  });
  it('выше — лица, у которых с именем совпало первое слово: «Давид сын Иессея» — Давид, «Иаков сын Исаака» — Иаков', () => {
    expect(ids('Давид сын Иессея')[0]).toBe('david');
    const jacob = ids('Иаков сын Исаака');
    expect(jacob[0]).toBe('iakov');
    // Исаак — не «сын Исаака»: слово после «сын» называет отца, а не само лицо
    expect(jacob).not.toContain('isaak');
    // первое слово — роль: имя совпало со вторым словом — Давид выше лиц, у которых «Давид» только в уточнении
    const tsar = searchIndex.search('царь Давид', 10);
    expect(tsar[0].id).toBe('david');
    expect(tsar.find((h) => h.id === 'solomon')!.score).toBeLessThan(tsar[0].score);
  });
  it('слово после слова родства называет родню, а не само лицо: «сын Давида» — не Иессей и не Иоав', () => {
    const sons = ids('сын Давида', 60);
    expect(sons).toContain('solomon');
    expect(sons).toContain('avessalom');
    expect(sons).not.toContain('iessey'); // «сын Овида, отец Давида»
    expect(sons).not.toContain('ioav'); // «племянник Давида»
    expect(ids('сын Иессея')[0]).toBe('david');
    expect(ids('сын Иессея')).not.toContain('iessey');
  });
  it('по всем словам никого — лица по имени с пометой, а не «такого лица нет»', () => {
    const hits = searchIndex.search('Иосиф муж Рахили', 60);
    expect(hits.length).toBeGreaterThanOrEqual(8);
    expect(hits.every((h) => h.partial === 'Иосиф')).toBe(true);
    expect(hits.every((h) => byId.get(h.id)!.name.startsWith('Иосиф'))).toBe(true);
    expect(flat(partialHead('Иосиф', hits.length))).toBe(`По всем словам ничего; по имени «Иосиф» — ${hits.length} лиц`);
    const blocks = personBlocks(hits);
    expect(blocks).toHaveLength(1);
    expect(flat(blocks[0].head!)).toMatch(/^По всем словам ничего; по имени «Иосиф» — \d+ лиц$/);
    // имя из нескольких слов — по первому слову: «Иисус», а не «Иисус Христос»
    expect(searchIndex.search('Иисус сын Сирахов', 5)[0]?.partial).toBe('Иисус');
  });
  it('пустой ответ не винит написание, если имя есть; служебное слово — подсказка, как искать', () => {
    expect(emptyText('Руфь Моавитянка Вооз Самсон')).toMatch(/По всем словам ничего/);
    expect(emptyText('брат')).toMatch(/^«брат» — слово уточнения; ищите вместе с именем/);
  });
});

describe('служебные слова уточнений (IX-55)', () => {
  it('«Сын» не находит Давида («Сын Иессеев»), Иисуса Навина («Иисус, сын Навин») и Иакова («сын Исаака»)', () => {
    const got = ids('Сын', 60);
    for (const id of ['david', 'iisus-navin', 'iakov', 'iisus']) expect(got, id).not.toContain(id);
    // имена, которые начинаются с этого слова, находятся: «Сын Израильтянки»
    expect(got.every((id) => /^сын/i.test(byId.get(id)!.name))).toBe(true);
    expect(got.length).toBeGreaterThan(0);
    // общее у них только слово «Сын» — одноимёнными не отмечаются
    expect(markAllIds(searchIndex.search('Сын', 60))).toEqual([]);
  });
  it('«дочь», «жена», «брат», «при» — не по уточнению; «жена Лота» — целиком', () => {
    for (const q of ['дочь', 'жена', 'брат', 'при']) for (const h of searchIndex.search(q, 60)) expect(h.via, `${q}: ${h.id}`).not.toBe('disambig');
    expect(ids('жена Лота')[0]).toBe('zhena-lota');
  });
});

describe('глава и стих, которых нет (IX-82, UX-82)', () => {
  it('таблица стихов совпадает с Синодальным текстом tools/bible/synodal.tsv', () => {
    const bible = loadBible();
    for (const b of BOOKS) {
      expect(VERSES[b.code]?.length, b.code).toBeGreaterThan(0);
      VERSES[b.code].forEach((n, i) => expect(n, `${b.code} ${i + 1}`).toBe(bible.chapterLength(b.code, i + 1)));
      expect(bible.chapterLength(b.code, VERSES[b.code].length + 1), `${b.code}: лишняя глава`).toBe(0);
    }
    // пропуски — только стихи вне канона: Дан 3:24–90 (ТЗ П-1)
    expect(GAPS).toEqual({ 'Дан 3': [24, 90] });
    for (let v = 24; v <= 90; v++) expect(bible.verses.has(`Дан 3:${v}`)).toBe(false);
  });
  it('«Мф 29» — «Такой главы нет: в Евангелии от Матфея 28 глав»; «Быт 51:1» — «в книге Бытия 50 глав»', () => {
    expect(chapterCount('Мф')).toBe(28);
    const p = refProblem(parseQueryRef('Мф 29')!);
    expect(p).toEqual({ kind: 'chapter', book: 'Мф', chapters: 28 });
    expect(flat(refProblemText(p!))).toBe('Такой главы нет: в Евангелии от Матфея 28 глав.');
    expect(flat(refProblemText(refProblem(parseQueryRef('Быт 51:1')!)!))).toBe('Такой главы нет: в книге Бытия 50 глав.');
    expect(flat(refProblemText(refProblem(parseQueryRef('Авд 2')!)!))).toBe('Такой главы нет: в книге Авдия одна глава.');
    expect(searchIndex.search('Мф 29')).toEqual([]);
  });
  it('«Быт 5:40» — «Такого стиха нет: в Быт 5 — 32 стиха»; «Быт 99:1» — нет главы', () => {
    expect(verseCount('Быт', 5)).toBe(32);
    const p = refProblem(parseQueryRef('Быт 5:40')!);
    expect(flat(refProblemText(p!))).toBe('Такого стиха нет: в Быт 5 — 32 стиха.');
    expect(refProblem(parseQueryRef('Быт 99:1')!)?.kind).toBe('chapter');
    // стих есть — ошибки нет; диапазон, в котором есть хоть один стих, — тоже
    expect(refProblem(parseQueryRef('Быт 5:32')!)).toBe(null);
    expect(refProblem(parseQueryRef('Быт 5:30-40')!)).toBe(null);
    expect(refProblem(parseQueryRef('Руф 4')!)).toBe(null);
  });
  it('Дан 3:30 — стиха нет в каноническом тексте; Дан 3:91 — есть', () => {
    expect(verseExists('Дан', 3, 30)).toBe(false);
    expect(verseExists('Дан', 3, 91)).toBe(true);
    expect(flat(refProblemText(refProblem(parseQueryRef('Дан 3:30')!)!))).toBe('Такого стиха нет: в Дан 3 — стихи 1–23 и 91–100; стихов 24–90 в каноническом тексте нет.');
  });
  it('где глава: книга, Евангелие, послание — без подстановки названия в падеж', () => {
    expect(bookWhere('1Цар')).toBe('в 1-й книге Царств');
    expect(bookWhere('Лк')).toBe('в Евангелии от Луки');
    expect(bookWhere('Рим')).toBe('в Послании к римлянам');
    expect(bookWhere('1Кор')).toBe('в 1-м послании к коринфянам');
    expect(bookWhere('Иак')).toBe('в Послании Иакова');
    expect(bookWhere('Деян')).toBe('в книге Деяний');
    expect(bookWhere('Откр')).toBe('в книге Откровения');
  });
});

describe('строки главы и стиха (IX-75), выбор второго лица (UX-13)', () => {
  const person = (id: string) => ({ id, score: 1, matched: id, via: 'verse' as const });
  it('глава из «Глав» — первая строка «Читать Мф 1 — имена со ссылками» (Enter — она), вторая — «Все N на небе»', () => {
    const hits = ['iisus', 'david', 'avraam'].map(person);
    const rows = resultBlocks(hits, { pinned: false, noAll: false, ref: parseQueryRef('Мф 1') }).flatMap((b) => b.rows);
    expect(rows[0]).toMatchObject({ kind: 'read', ch: 'Мф 1', lead: true });
    expect(rows[1]).toMatchObject({ kind: 'all', lead: false, scope: 'chapter' });
    expect(flat(cmdLabel(rows[0] as never, 0))).toBe('Читать Мф 1 — имена со ссылками');
    expect(cmdLabel(rows[1] as never, 0)).toBe('Все 3 на небе');
  });
  it('стих — «Все N из стиха на небе» первой строкой, и Enter выбирает её, а не первое лицо', () => {
    const rows = resultBlocks(['vooz', 'ovid'].map(person), { pinned: false, noAll: false, ref: parseQueryRef('Руф 4:21') }).flatMap((b) => b.rows);
    expect(rows[0]).toMatchObject({ kind: 'all', lead: true, scope: 'verse' });
    expect(cmdLabel(rows[0] as never, 0)).toBe('Все 2 из стиха на небе');
    // глава не из «Глав» — без «Читать»
    const other = resultBlocks(['vooz', 'ovid'].map(person), { pinned: false, noAll: false, ref: parseQueryRef('Руф 2') }).flatMap((b) => b.rows);
    expect(other.some((r) => r.kind === 'read')).toBe(false);
  });
  it('набранное снова первое лицо — строка «Руфь уже выбрана первой — выберите другое лицо»; глагол по полу', () => {
    const rows = resultBlocks([], { pinned: false, noAll: true, self: 'ruf' }).flatMap((b) => b.rows);
    expect(rows[0]).toMatchObject({ kind: 'self', id: 'ruf', lead: true });
    expect(cmdLabel(rows[0] as never, 0)).toBe('Руфь уже выбрана первой — выберите другое лицо');
    expect(cmdLabel({ key: 'self', kind: 'self', id: 'david', lead: true }, 0)).toBe('Давид уже выбран первым — выберите другое лицо');
    // «Руфь» — совпадение по имени целиком: оно и ставит строку «уже выбрана»
    const top = searchIndex.search('Руфь', 5)[0];
    expect(top.id).toBe('ruf');
    expect(top.strong).toBe(true);
  });
});

describe('«в работу» в поиске и микрошкала (IX-84, VIS-17)', () => {
  it('«в работу» говорит то же, что клавиша В на небе', () => {
    const was = workSet.peek();
    try {
      const said = searchRowCmd.run('iessey');
      expect(said).toMatch(/^Иессей добавлен в набор; в наборе \d+ (лицо|лица|лиц)$/);
      expect(searchRowCmd.run('iessey')).toMatch(/^Иессей убран из набора; /);
    } finally {
      workSet.value = was;
    }
  });
  it('риски — меридианы Потопа, Исхода, закладки храма и Рождества; жизнь без придуманной длительности', () => {
    const m = models[0];
    const a = axisMarks(m, m.chrono.get('david')!);
    expect(a.ticks).toHaveLength(4);
    expect(a.ticks.every((t) => t > a.t0 && t < a.t1)).toBe(true);
    expect(a.from).toBe(m.chrono.get('david')!.b);
    expect(a.to).toBe(m.chrono.get('david')!.d);
    // смерть не известна — отрезок до последнего упоминания или только знак рождения
    const noDeath = [...m.chrono.entries()].find(([, c]) => c.d === null && c.cls !== 'epochal');
    if (noDeath) {
      const c = noDeath[1];
      expect(axisMarks(m, c).to).toBe(Math.max(c.b, c.last ?? c.b));
    }
    // время не установлено — редкие точки
    const ep = [...m.chrono.values()].find((c) => c.cls === 'epochal');
    if (ep) expect(axisMarks(m, ep).dotted).toBe(true);
  });
});
