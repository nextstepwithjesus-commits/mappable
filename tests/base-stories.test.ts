/**
 * Истории (11 § 11.3; 02 § 3.12): настоящие данные пакета 1 проходят без ошибок; на каждое правило — нарочно испорченная
 * запись, которую проверка ловит (10 § 4.3.2). Допуск знает коллекции историй.
 */
import { describe, expect, it } from 'vitest';
import { loadBase } from '../tools/base/validate.ts';
import { attachStories, loadStorySources, storyCoverage, validateStories, wordIn } from '../tools/base/stories.ts';
import { records, COLL_FILES } from '../tools/base/admit.ts';
import type { Base } from '../tools/base/migrate.ts';
import type { Story, TextParallel, VerseClass } from '../tools/base/types.ts';

const disk = loadBase();
const src = loadStorySources();

/** Проверка набора историй поверх настоящей базы лиц: ошибки «проверка: где: что». */
function errorsOf(stories: Story[], extra: { classes?: VerseClass[]; parallels?: TextParallel[]; chapters?: string[] } = {}) {
  const base: Base = { ...disk, stories, verseClasses: extra.classes ?? [], textParallels: extra.parallels ?? [], storyChapters: extra.chapters ?? [] };
  const out: string[] = [];
  validateStories(base, (c, w, m) => out.push(`${c}: ${w}: ${m}`), () => {});
  return out;
}

const mk = (o: Partial<Story> & { id: string }): Story => ({
  level: 'story', kind: 'event', title: { short: 'Каин и Авель', by: 'atlas' }, accounts: [{ refs: ['Быт 4:1-16'], cert: 'scripture' }],
  actors: [], places: [], links: [], source: { method: 'reading' }, ...o,
} as Story);

describe('истории: настоящие данные пакета 1', () => {
  it('проверка 11 § 11.3 — без ошибок', () => {
    const base: Base = { ...disk };
    attachStories(base, src);
    const out: string[] = [];
    validateStories(base, (c, w, m) => out.push(`${c}: ${w}: ${m}`), () => {});
    expect(out).toEqual([]);
  });

  it('размеченные главы покрыты целиком (п. 4)', () => {
    const base: Base = { ...disk };
    attachStories(base, src);
    const cov = storyCoverage(base);
    expect(cov.length).toBeGreaterThanOrEqual(38);
    for (const c of cov) expect([c.chapter, c.missing]).toEqual([c.chapter, []]);
    for (const ch of ['Быт 1', 'Быт 11', 'Мк 1', 'Мк 3', 'Мф 9', 'Ин 6', 'Деян 22', 'Иак 5', 'Ис 2', 'Мих 4']) expect(base.storyChapters).toContain(ch);
  });

  it('образцы 11: Ной и потоп, Давид и Голиаф, Умер Самуил, Расслабленный, Пять хлебов, Савл', () => {
    const by = new Map(src.stories.map((s) => [s.id, s]));
    expect(by.get('e-noy-i-potop')!.accounts[0].refs).toEqual(['Быт 6:9-9:17']);
    expect(by.get('e-noy-i-potop')!.parts).toHaveLength(7); // Быт 8:6 — новая часть по правилу 9 (второй ключ)
    expect(by.get('e-david-i-goliaf')!.accounts[0].refs).toEqual(['1Цар 17:1-58']);
    expect(by.get('e-david-i-goliaf')!.seeAlso![0].refs).toContain('2Цар 21:19');
    expect(by.get('e-umer-samuil')!.kind).toBe('notice');
    expect(by.get('e-umer-samuil')!.hard).toBeUndefined();
    // номер записи — по основному рассказу (первому по канону): Мф 9:1, а не Мк 2:1 (11 § 11.1)
    expect(by.get('e-rasslablennogo-spuskayut-cherez-krovlyu')!.accounts.map((a) => a.refs[0])).toEqual(['Мф 9:1-8', 'Мк 2:1-12', 'Лк 5:17-26']);
    expect(by.get('e-pyat-khlebov-i-dve-ryby')!.accounts.map((a) => a.refs[0])).toEqual(['Мф 14:13-21', 'Мк 6:30-44', 'Лк 9:10-17', 'Ин 6:1-15']);
    const saul = by.get('e-savl-na-puti-v-damask')!;
    expect(saul.accounts).toHaveLength(1);
    expect(saul.links.filter((l) => l.kind === 'retelling' && l.teller === 'p-pavel').map((l) => l.refs[0])).toEqual(['Деян 22:6-16', 'Деян 26:12-18']);
    // спорное сравнение без трудов совета источников в данные не идёт (Г-3; В-30)
    expect(src.stories.flatMap((s) => s.links).filter((l) => l.kind === 'possibly-same' || l.kind === 'type')).toEqual([]);
  });

  it('допуск знает коллекции историй; файлы — в таблице коллекций', () => {
    const base: Base = { ...disk };
    attachStories(base, src);
    const recs = records(base);
    const st = recs.filter((r) => r.coll === 'story');
    expect(st.length).toBe(src.stories.length);
    expect(recs.filter((r) => r.coll === 'vclass').length).toBe(src.classes.length);
    expect(recs.filter((r) => r.coll === 'textparallel').length).toBe(1);
    for (const r of st) expect(COLL_FILES.story.test(r.file)).toBe(true);
    // участники-лица — зависимости допуска; god и new: — нет
    const noy = st.find((r) => r.key === 'story:e-noy-i-potop')!;
    expect(noy.deps).toContain('actor:p-noy');
    expect(noy.deps.some((d) => d.includes('new:') || d.includes('god'))).toBe(false);
  });
});

describe('истории: испорченные записи ловятся', () => {
  it('п. 1: неверный стих', () => {
    expect(errorsOf([mk({ id: 'e-x', accounts: [{ refs: ['Быт 4:1-99'], cert: 'scripture' }] })]).join('\n')).toMatch(/история: стих/);
  });

  it('номер истории не вида e-…', () => {
    expect(errorsOf([mk({ id: 'x-kain' })]).join('\n')).toMatch(/история: номер/);
  });

  it('п. 2: повествование со своими стихами; история в истории, а не в повествовании', () => {
    expect(errorsOf([mk({ id: 'e-c', level: 'cycle' })]).join('\n')).toMatch(/у повествования нет своих стихов/);
    expect(errorsOf([mk({ id: 'e-a' }), mk({ id: 'e-b', title: { short: 'Другое', by: 'atlas' }, accounts: [{ refs: ['Быт 2:4-25'], cert: 'scripture' }], partOf: 'e-a' })]).join('\n')).toMatch(/не повествование/);
  });

  it('п. 3: стихи двух историй одной книги пересекаются без nested', () => {
    const a = mk({ id: 'e-a' });
    const b = mk({ id: 'e-b', title: { short: 'Каин уходит', by: 'atlas', manual: ['уходит'] }, accounts: [{ refs: ['Быт 4:16'], cert: 'scripture' }] });
    expect(errorsOf([a, b]).join('\n')).toMatch(/история: пересечение/);
    expect(errorsOf([{ ...a, nested: [{ story: 'e-b', at: 'Быт 4:16', kind: 'insert' }] }, b]).join('\n')).not.toMatch(/пересечение/);
  });

  it('п. 4: глава объявлена размеченной, а стих без класса', () => {
    expect(errorsOf([mk({ id: 'e-a' })], { chapters: ['Быт 4'] }).join('\n')).toMatch(/покрытие: Быт 4: .*Быт 4:17/);
  });

  it('п. 4: стих и в истории, и в классе «вне историй»', () => {
    expect(errorsOf([mk({ id: 'e-a' })], { classes: [{ book: 'Быт', ch: 4, from: 16, to: 16, class: 'law' }] }).join('\n')).toMatch(/в истории e-a/);
  });

  it('п. 5: группа на словах в скобках (Быт 6:19) — ошибка', () => {
    const s = mk({
      id: 'e-g', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 6:9-9:17'], cert: 'scripture' }],
      actors: [{ actor: 'new:skot', label: 'скота', kind: 'group', roles: [{ role: 'agent' }], refs: ['Быт 6:19'], cert: 'scripture' }],
    });
    expect(errorsOf([s]).join('\n')).toMatch(/слово «скота» не стоит в его стихах вне скобок/);
  });

  it('п. 5: имя лица не стоит в его стихах; лица нет в базе', () => {
    const s = mk({ id: 'e-a', actors: [{ actor: 'p-noy', roles: [{ role: 'agent' }], refs: ['Быт 4:8'], cert: 'scripture' }, { actor: 'p-netu', roles: [{ role: 'agent' }], refs: ['Быт 4:8'], cert: 'scripture' }] });
    const e = errorsOf([s]).join('\n');
    expect(e).toMatch(/p-noy: ни одна форма имени/);
    expect(e).toMatch(/p-netu: лица нет в базе/);
  });

  it('п. 5а: два рассказа одной книги склеены без «сказано» (1 Цар 23 и 1 Цар 26)', () => {
    const s = mk({
      id: 'e-z', title: { short: 'Зифеи', by: 'atlas' },
      accounts: [{ refs: ['1Цар 23:19-28'], cert: 'scripture' }, { refs: ['1Цар 26:1-25'], cert: 'scripture', basis: { kind: 'other-books', refs: ['1Цар 23:19', '1Цар 26:1'], time: [] } }],
      scenes: [{ id: 'e-z#s1', title: { short: 'всё', by: 'atlas' }, refs: [{ account: 0, refs: ['1Цар 23:19-28'] }, { account: 1, refs: ['1Цар 26:1-25'] }] }],
    });
    const e = errorsOf([s]).join('\n');
    expect(e).toMatch(/два рассказа одной книги/);
    expect(e).toMatch(/other-books внутри одной книги/);
  });

  it('п. 5а: склейка без основания', () => {
    const s = mk({ id: 'e-a', accounts: [{ refs: ['Быт 4:1-16'], cert: 'scripture' }, { refs: ['1Ин 3:12'], cert: 'scripture' }] });
    expect(errorsOf([s]).join('\n')).toMatch(/склеен без основания/);
  });

  it('п. 6: упоминание без слов стиха и со словом, которого в стихе нет', () => {
    const e1 = errorsOf([mk({ id: 'e-a', links: [{ refs: ['Евр 11:4'], kind: 'mention', cert: 'scripture' }] })]).join('\n');
    expect(e1).toMatch(/нет words/);
    const e2 = errorsOf([mk({ id: 'e-a', links: [{ refs: ['Евр 11:4'], kind: 'mention', words: ['ковчег'], cert: 'scripture' }] })]).join('\n');
    expect(e2).toMatch(/«ковчег» не стоит в стихе ссылки/);
  });

  it('п. 7: спорное сравнение без трудов и без «толк.»; намёк без основания', () => {
    const e = errorsOf([mk({ id: 'e-a', links: [{ refs: ['Евр 11:4'], kind: 'possibly-same', cert: 'inference' }, { refs: ['Евр 12:24'], kind: 'allusion', cert: 'scripture' }] })]).join('\n');
    expect(e).toMatch(/только «толк.» с трудами/);
    expect(e).toMatch(/нет basis/);
    expect(e).toMatch(/намёк — не «Писание»/);
  });

  it('п. 9: название длинное, с двоеточием, повторяется, слово не из стихов', () => {
    const long = errorsOf([mk({ id: 'e-a', title: { short: 'Каин и Авель: очень длинное название истории про братьев', by: 'atlas' } })]).join('\n');
    expect(long).toMatch(/длиннее 40 знаков/);
    expect(long).toMatch(/с двоеточием/);
    expect(errorsOf([mk({ id: 'e-a' }), mk({ id: 'e-b', accounts: [{ refs: ['Быт 2:4-25'], cert: 'scripture' }] })]).join('\n')).toMatch(/уникально во всём каталоге/);
    expect(errorsOf([mk({ id: 'e-a', title: { short: 'Каин убивает Авеля', by: 'atlas' } })]).join('\n')).toMatch(/слово «убивает»/);
    expect(errorsOf([mk({ id: 'e-a', title: { short: 'Каин убивает Авеля', by: 'atlas', manual: ['убивает'] } })]).join('\n')).not.toMatch(/убивает/);
  });

  it('п. 13: «раньше / позже» без стиха', () => {
    expect(errorsOf([mk({ id: 'e-a', time: { after: [{ story: 'e-b', refs: [], cert: 'scripture' }] } })]).join('\n')).toMatch(/без стиха основания/);
  });

  it('п. 15: синопсис — нет сцен; стих ни в одной сцене; стих в двух сценах без split', () => {
    const two = { accounts: [{ refs: ['Мф 8:14-15'], cert: 'scripture' as const }, { refs: ['Мк 1:29-31'], cert: 'scripture' as const, basis: { kind: 'other-books' as const, refs: ['Мф 8:14', 'Мк 1:30'], time: [] } }], title: { short: 'Тёща Симона', by: 'atlas' as const } };
    expect(errorsOf([mk({ id: 'e-t', ...two })]).join('\n')).toMatch(/сцен синопсиса нет/);
    const sc = (refs: [number, string][][]) => refs.map((cells, i) => ({ id: `e-t#s${i + 1}`, title: { short: `с${i}`, by: 'atlas' as const }, refs: cells.map(([a, r]) => ({ account: a, refs: [r] })) }));
    const e = errorsOf([mk({ id: 'e-t', ...two, scenes: sc([[[0, 'Мф 8:14'], [1, 'Мк 1:29-30']], [[0, 'Мф 8:14'], [1, 'Мк 1:30']]]) })]).join('\n');
    expect(e).toMatch(/Мф 8:15 рассказа 0 не стоит ни в одной сцене/);
    expect(e).toMatch(/Мф 8:14 — в 2 сценах без split/);
  });

  it('части: стих не в части; часть без признака смены', () => {
    const s = mk({
      id: 'e-n', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 6:9-9:17'], cert: 'scripture' }],
      parts: [{ n: 1, title: { short: 'а', by: 'atlas' }, refs: ['Быт 6:9-22'], change: [] }, { n: 2, title: { short: 'б', by: 'atlas' }, refs: ['Быт 7:1-24'], change: [] }],
    });
    const e = errorsOf([s]).join('\n');
    expect(e).toMatch(/часть 2: не названо, какой признак сцены сменился/);
    expect(e).toMatch(/стих Быт 8:1 — в 0 частях/);
  });

  it('правило 9: рассказ длиннее 20 стихов без частей — ошибка; часть по порогу слов — без признака смены', () => {
    expect(errorsOf([mk({ id: 'e-n', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 6:9-9:17'], cert: 'scripture' }] })]).join('\n')).toMatch(/без частей/);
    const s = mk({
      id: 'e-n', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 6:9-9:17'], cert: 'scripture' }],
      parts: [{ n: 1, title: { short: 'а', by: 'atlas' }, refs: ['Быт 6:9-8:22'], change: [] }, { n: 2, title: { short: 'б', by: 'atlas' }, refs: ['Быт 9:1-17'], change: [], byWords: true }],
    });
    expect(errorsOf([s]).join('\n')).not.toMatch(/часть/);
  });

  it('лицо, названное в стихе другим именем: строка ведёт на карточку имени из стиха, «Писание» (Р-1, 02 § 3.3.4)', () => {
    const by = new Map(src.stories.map((s) => [s.id, s]));
    // Левий (Мк 2:14; Лк 5:27, 29) — своя карточка; с Матфеем — отношение «возможно, то же лицо» в базе (tests/base-d4.test.ts)
    const levi = by.get('e-mytar-u-sbora-poshlin')!.actors.filter((a) => a.actor === 'p-matfey' || a.actor === 'p-leviy-alfeev');
    expect(levi.map((a) => [a.actor, a.refs[0], a.cert])).toEqual([['p-matfey', 'Мф 9:9', 'scripture'], ['p-leviy-alfeev', 'Мк 2:14', 'scripture'], ['p-leviy-alfeev', 'Лк 5:27', 'scripture']]);
    expect(src.stories.flatMap((s) => s.actors).filter((a) => (a.actor === 'p-matfey' && /Леви/.test(a.label ?? '')) || a.actor === 'p-iuda-iakovlev')).toEqual([]);
    // Фаддей и Иуда Иаковлев — вид (б) (Д-15): строка у Луки — карточка Фаддея с именем стиха и idCert формы «выв.»
    const twelve = by.get('e-iisus-stavit-dvenadtsat')!.actors.filter((a) => a.actor === 'p-faddey');
    expect(twelve.map((a) => [a.label, a.refs, a.cert, a.idCert])).toEqual([[undefined, ['Мк 3:18'], 'scripture', undefined], ['Иуда Иаковлев', ['Лк 6:16'], 'scripture', { form: 'p-faddey#n3', refs: ['Лк 6:16'] }]]);
    const war = by.get('e-snova-voyna-s-filistimlyanami')!.actors.filter((a) => a.account === 1 && a.actor.startsWith('p-') && a.label);
    expect(war.every((a) => a.cert === 'inference' || a.actor === 'p-ionafan-syn-sammy')).toBe(true);
    // у Луки о посте спрашивают «Они» — книжники и фарисеи, не ученики Иоанновы (11 § 13.2)
    expect(by.get('e-pochemu-ucheniki-ne-postyatsya')!.actors.find((a) => a.actor === 'new:ucheniki-ioannovy')!.account).toBe(0);
    // подписи Бога — форма имени, а не обрывок
    expect(src.stories.flatMap((s) => s.actors).filter((a) => a.actor === 'god' && /Господ(не|ень)$/.test(a.label ?? ''))).toEqual([]);
  });

  it('п. 19: «Коротко» — предложение длиннее 12 слов и с «;»', () => {
    const e = errorsOf([mk({ id: 'e-a', summary: [{ text: 'Каин принёс дар от плодов земли, а Авель принёс от первородных стада своего и тука их', refs: ['Быт 4:3'] }, { text: 'Каин огорчился; лицо его поникло.', refs: ['Быт 4:5'] }] })]).join('\n');
    expect(e).toMatch(/больше 12/);
    expect(e).toMatch(/с «;»/);
  });

  it('п. 20: различия — цитата не дословно, из одного рассказа, подпись с согласованием', () => {
    const e = errorsOf([mk({ id: 'e-a', discrepancies: [{ label: 'на самом деле одно', quotes: [{ ref: 'Быт 4:8', text: 'Каин убил брата' }, { ref: 'Быт 4:9', text: 'где Авель, брат твой?' }] }] })]).join('\n');
    expect(e).toMatch(/со словами согласования/);
    expect(e).toMatch(/не стоит дословно/);
    expect(e).toMatch(/цитаты из одного рассказа/);
  });

  it('п. 21: слово параллельных текстов не стоит во всех отрезках', () => {
    const p: TextParallel = { id: 'tp-x', refs: [['Ис 2:2-4'], ['Мих 4:1-3']], basis: [{ ref: 'Мих 4:4', text: 'под своею виноградною лозою' }], cert: 'scripture' };
    expect(errorsOf([], { parallels: [p] }).join('\n')).toMatch(/не стоит в отрезке 1/);
  });

  it('трудное: тема не из словаря; стих вне истории', () => {
    const e = errorsOf([mk({ id: 'e-a', hard: [{ topic: 'страшное' as any, refs: ['Быт 5:1'] }] })]).join('\n');
    expect(e).toMatch(/тема «страшное»/);
    expect(e).toMatch(/вне рассказов истории/);
  });

  it('класс стихов не из словаря 11 § 2.4', () => {
    expect(errorsOf([], { classes: [{ book: 'Иак', ch: 1, from: 1, to: 1, class: 'story' as any }] }).join('\n')).toMatch(/класс «story»/);
  });

  it('слова названия ищутся по основе и вне скобок', () => {
    expect(wordIn('раю', 'И насадил Господь Бог рай в Едеме')).toBe(true);
    expect(wordIn('Ноя', 'И вошел Ной и сыновья его')).toBe(true);
    expect(wordIn('убивает', 'восстал Каин на Авеля, брата своего, и убил его')).toBe(false);
  });
});

describe('проба П7: служебная программа замера (tools/base/p7.ts)', () => {
  it('одинаковые разметки: каппа 1, WindowDiff 0; сдвиг границы виден', async () => {
    const { compareMarkups, rangeVerses } = await import('../tools/base/p7.ts');
    const range = rangeVerses('Мк', 1, 1);
    const m = (cut: number) => ({ name: 'x', units: [{ key: 'a', segs: [range.slice(0, cut)], parts: [] }, { key: 'b', segs: [range.slice(cut)], parts: [] }] });
    const same = compareMarkups(m(8), m(8), range);
    expect(same.kappaBoundary).toBe(1);
    expect(same.windowDiffAB).toBe(0);
    const moved = compareMarkups(m(8), m(9), range);
    expect(moved.kappaBoundary).toBeLessThan(1);
    expect(moved.hitsAinB.near).toBe(2);
    expect(moved.hitsAinB.exact).toBe(1);
  });

  it('замер на данных идёт; покрытие наших разметок — 100 %', async () => {
    const { report } = await import('../tools/base/p7.ts');
    const r: any = report();
    expect(r['Мк 1–3 (отрывок П7)'].coverageA).toBe(1);
    expect(r['Быт 1–11 (книга прототипа)'].coverageA).toBe(1);
  });
});

describe('истории: ред. 4.3 (задача 23; 11 § 11.3 п. 5б–5д, 20, 22, 24–27)', () => {
  const by = new Map(src.stories.map((x) => [x.id, x]));

  it('данные: роли из закрытого списка и по частям; Голиаф — «действует» в частях 1 и 3, «с ним происходит» в части 5', () => {
    const all = src.stories.flatMap((x) => x.actors);
    expect(all.filter((a) => (a as any).role !== undefined)).toEqual([]);
    expect(new Set(all.flatMap((a) => a.roles.map((r) => r.role)))).toEqual(new Set(['agent', 'undergoer', 'addressed', 'mentioned']));
    const g = by.get('e-david-i-goliaf')!.actors.find((a) => a.actor === 'p-goliaf')!;
    expect(g.roles.filter((r) => [1, 3, 5].includes(r.part!))).toEqual([{ part: 1, role: 'agent' }, { part: 3, role: 'agent' }, { part: 5, role: 'undergoer' }]);
    // у истории с частями — роль с номером части, без частей — без номера
    for (const x of src.stories) for (const a of x.actors) for (const r of a.roles) expect([x.id, a.actor, r.part === undefined]).toEqual([x.id, a.actor, !x.parts?.length]);
  });

  it('данные: Ной и потоп — 7 частей, Быт 9:1 — часть по порогу слов; сыновья Ноя — одной строкой; подписи в именительном падеже', () => {
    const n = by.get('e-noy-i-potop')!;
    expect(n.parts!.map((p) => p.refs[0])).toEqual(['Быт 6:9-22', 'Быт 7:1-16', 'Быт 7:17-24', 'Быт 8:1-5', 'Быт 8:6-14', 'Быт 8:15-22', 'Быт 9:1-17']);
    expect(n.parts![6]).toMatchObject({ change: [], byWords: true });
    expect(n.actors.filter((a) => ['p-sim', 'p-kham', 'p-iafet'].includes(a.actor))).toEqual([]);
    expect(n.actors.find((a) => a.actor === 'new:synovya-noya')!.label).toBe('сыновья Ноя');
    expect(n.actors.find((a) => a.actor === 'new:voron-noya')!.label).toBe('ворон');
    expect(n.actors.find((a) => a.actor === 'new:golub-noya')!.label).toBe('голубь');
    expect(n.actors.filter((a) => a.actor !== 'god')).toHaveLength(8);
  });

  it('данные: Лк 5:1–11 — своя история; Преображение без «отступления», с тремя совпадениями и различием «когда» с Мк 9:2; Мф 10 — деление у середины речи', () => {
    expect(by.get('e-lovtsy-chelovekov')!.accounts.map((a) => a.refs[0])).toEqual(['Мф 4:18-22', 'Мк 1:16-20']);
    expect(by.get('e-velikoe-mnozhestvo-ryby')!.accounts[0].refs).toEqual(['Лк 5:1-11']);
    const t = by.get('e-iisus-preobrazhaetsya-na-gore')!;
    expect(JSON.stringify(t)).not.toMatch(/ОТСТУПЛЕНИЕ|отступлени|примерн/);
    for (const a of t.accounts.slice(1)) expect([a.cert, !!a.basis?.place?.length, !!a.basis?.actors?.length, !!a.basis?.course?.length]).toEqual(['inference', true, true, true]);
    expect(t.discrepancies!.find((d) => d.kind === 'when')!.quotes.map((q) => q.ref)).toEqual(['Мф 17:1', 'Мк 9:2', 'Лк 9:28']);
    expect(by.get('e-iisus-posylaet-dvenadtsat')!.parts![1].refs).toEqual(['Мф 10:24-42']);
    // склейки «весомо» — inference; «сказано» — scripture
    for (const x of src.stories) x.accounts.forEach((a, i) => i && expect([x.id, a.cert]).toEqual([x.id, a.basis?.kind === 'said' ? 'scripture' : 'inference']));
  });

  it('п. 5в: прежний код роли и поле role — ошибка; роль без части у истории с частями — ошибка', () => {
    const old = mk({ id: 'e-a', actors: [{ actor: 'p-kain', role: 'participant', refs: ['Быт 4:8'], cert: 'scripture' } as any] });
    expect(errorsOf([old]).join('\n')).toMatch(/поле role «participant» — прежний вид/);
    const bad = mk({ id: 'e-b', actors: [{ actor: 'p-kain', roles: [{ role: 'acts' as any }], refs: ['Быт 4:8'], cert: 'scripture' }] });
    expect(errorsOf([bad]).join('\n')).toMatch(/роль «acts» — прежний код/);
    const parts = mk({
      id: 'e-c', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 6:9-9:17'], cert: 'scripture' }],
      parts: [{ n: 1, title: { short: 'а', by: 'atlas' }, refs: ['Быт 6:9-8:22'], change: [] }, { n: 2, title: { short: 'б', by: 'atlas' }, refs: ['Быт 9:1-17'], change: [], byWords: true }],
      actors: [{ actor: 'p-noy', roles: [{ role: 'agent' }], refs: ['Быт 6:9'], cert: 'scripture' }],
    });
    expect(errorsOf([parts]).join('\n')).toMatch(/у истории с частями роль — с номером части/);
  });

  it('п. 5б: строка p-matfey на Мк 2:14 — ошибка (там имя карточки Левия, «возможно, тот же человек»)', () => {
    const s = mk({ id: 'e-m', title: { short: 'Мытарь у сбора пошлин', by: 'atlas' }, accounts: [{ refs: ['Мк 2:13-14'], cert: 'scripture' }], actors: [{ actor: 'p-matfey', roles: [{ role: 'agent' }], refs: ['Мк 2:14'], cert: 'scripture' }] });
    expect(errorsOf([s]).join('\n')).toMatch(/стоит «Левий» — имя карточки p-leviy-alfeev/);
  });

  it('п. 5б: строка на форме «выв.» без idCert — ошибка (Иуда Иаковлев у Фаддея, Лк 6:16)', () => {
    const s = mk({ id: 'e-f', title: { short: 'Иисус ставит двенадцать', by: 'atlas', manual: ['Иисус', 'ставит', 'двенадцать'] }, accounts: [{ refs: ['Лк 6:12-16'], cert: 'scripture' }], actors: [{ actor: 'p-faddey', label: 'Иуда Иаковлев', roles: [{ role: 'addressed' }], refs: ['Лк 6:16'], cert: 'scripture' }] });
    expect(errorsOf([s]).join('\n')).toMatch(/только форма «выв.» «Иуда Иаковлев»: у строки — idCert/);
  });

  it('п. 5г: строка Бога — «Бог», «Господь», «Господь Бог»; «глас» — ошибка', () => {
    const s = mk({ id: 'e-g', title: { short: 'Иисус крестится', by: 'atlas' }, accounts: [{ refs: ['Мф 3:13-17'], cert: 'scripture' }], actors: [{ actor: 'god', label: 'глас', roles: [{ role: 'agent' }], refs: ['Мф 3:17'], cert: 'scripture' }] });
    expect(errorsOf([s]).join('\n')).toMatch(/подпись «глас» — не из списка протокола И0/);
  });

  it('п. 5д: «ворона» в «Ной и потоп» — ошибка, «ворон» — нет', () => {
    const row = (label: string) => mk({ id: 'e-v', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 8:6-14'], cert: 'scripture' }], actors: [{ actor: 'new:voron', label, kind: 'animal', roles: [{ role: 'agent' }], refs: ['Быт 8:7'], cert: 'scripture' }] });
    expect(errorsOf([row('ворона')]).join('\n')).toMatch(/подпись «ворона» не в именительном падеже/);
    expect(errorsOf([row('ворон')]).join('\n')).not.toMatch(/падеж/);
    expect(errorsOf([row('народу')]).join('\n')).toMatch(/не в именительном падеже/);
  });

  it('п. 20: различие без вида и со словом «около» — ошибка; «молчит» рассказ, которого нет', () => {
    const s = mk({
      id: 'e-d', accounts: [{ refs: ['Мф 17:1-13'], cert: 'scripture' }, { refs: ['Лк 9:28-36'], cert: 'inference', basis: { kind: 'other-books', refs: ['Мф 17:5', 'Лк 9:35'], time: [] } }],
      scenes: [{ id: 'e-d#s1', title: { short: 'всё', by: 'atlas' }, refs: [{ account: 0, refs: ['Мф 17:1-13'] }, { account: 1, refs: ['Лк 9:28-36'] }] }],
      plot: [{ account: 0, setup: 'Мф 17:1', resolution: 'Мф 17:8' }, { account: 1, setup: 'Лк 9:28', resolution: 'Лк 9:36' }],
      discrepancies: [{ label: 'около скольких дней', silent: [5], quotes: [{ ref: 'Мф 17:1', text: 'По прошествии дней шести' }, { ref: 'Лк 9:28', text: 'После сих слов, дней через восемь' }] }],
    });
    const e = errorsOf([s]).join('\n');
    expect(e).toMatch(/нет вида различия/);
    expect(e).toMatch(/со словами «примерно», «около»/);
    expect(e).toMatch(/silent — рассказа 5 нет/);
  });

  it('п. 22: у истории с двумя рассказами завязка и развязка — в каждом рассказе', () => {
    const s = mk({
      id: 'e-p', accounts: [{ refs: ['Мф 8:14-15'], cert: 'scripture' }, { refs: ['Мк 1:29-31'], cert: 'inference', basis: { kind: 'other-books', refs: ['Мф 8:14', 'Мк 1:30'], time: [] } }],
      scenes: [{ id: 'e-p#s1', title: { short: 'всё', by: 'atlas' }, refs: [{ account: 0, refs: ['Мф 8:14-15'] }, { account: 1, refs: ['Мк 1:29-31'] }] }],
      plot: [{ account: 0, setup: 'Мф 8:14', resolution: 'Мк 1:31' }],
    });
    const e = errorsOf([s]).join('\n');
    expect(e).toMatch(/развязка Мк 1:31 — не в стихах рассказа 0/);
    expect(e).toMatch(/у рассказа 1 \(Мк 1:29-31\) нет завязки и развязки/);
  });

  it('п. 24: byWords, а вместе с прошлой частью не больше 500 слов (со скобками) — ошибка; Быт 8:15 – 9:17 — 505 слов', () => {
    const mkParts = (second: string) => mk({
      id: 'e-w', title: { short: 'Ной и потоп', by: 'atlas' }, accounts: [{ refs: ['Быт 8:1-9:17'], cert: 'scripture' }],
      parts: [{ n: 1, title: { short: 'а', by: 'atlas' }, refs: [second === 'Быт 9:1-17' ? 'Быт 8:1-22' : 'Быт 8:1-9:7'], change: [] }, { n: 2, title: { short: 'б', by: 'atlas' }, refs: [second], change: [], byWords: true }],
    });
    expect(errorsOf([mkParts('Быт 9:8-17')]).join('\n')).not.toMatch(/byWords, а вместе/);
    const short = mk({
      id: 'e-x', title: { short: 'Каин и Авель', by: 'atlas' }, accounts: [{ refs: ['Быт 4:1-16'], cert: 'scripture' }],
      parts: [{ n: 1, title: { short: 'а', by: 'atlas' }, refs: ['Быт 4:1-8'], change: [] }, { n: 2, title: { short: 'б', by: 'atlas' }, refs: ['Быт 4:9-16'], change: [], byWords: true }],
    });
    expect(errorsOf([short]).join('\n')).toMatch(/byWords, а вместе с частью 1 — \d+ слов/);
  });

  it('п. 25: цитата роли на стихе трудного — ошибка (Авель — не стих убийства)', () => {
    const s = mk({ id: 'e-h', hard: [{ topic: 'убийство', refs: ['Быт 4:8'] }], actors: [{ actor: 'p-avel', roles: [{ role: 'undergoer' }], refs: ['Быт 4:8'], cert: 'scripture', roleText: { text: 'восстал Каин на Авеля', refs: ['Быт 4:8'] } }] });
    expect(errorsOf([s]).join('\n')).toMatch(/цитата роли стоит на стихе трудного/);
  });

  it('п. 27: слова времени расходятся (различие «когда») — без места, лиц и хода склейка — ошибка; «весомо» не inference — ошибка', () => {
    const s = mk({
      id: 'e-t', accounts: [{ refs: ['Мф 17:1-13'], cert: 'scripture' }, { refs: ['Лк 9:28-36'], cert: 'scripture', basis: { kind: 'other-books', refs: ['Мф 17:5', 'Лк 9:35'], time: ['Мф 17:1', 'Лк 9:28'] } }],
      scenes: [{ id: 'e-t#s1', title: { short: 'всё', by: 'atlas' }, refs: [{ account: 0, refs: ['Мф 17:1-13'] }, { account: 1, refs: ['Лк 9:28-36'] }] }],
      plot: [{ account: 0, setup: 'Мф 17:1', resolution: 'Мф 17:8' }, { account: 1, setup: 'Лк 9:28', resolution: 'Лк 9:36' }],
      discrepancies: [{ label: 'через сколько дней', kind: 'when', quotes: [{ ref: 'Мф 17:1', text: 'По прошествии дней шести' }, { ref: 'Лк 9:28', text: 'После сих слов, дней через восемь' }] }],
    });
    const e = errorsOf([s]).join('\n');
    expect(e).toMatch(/нужны стихи совпадения «place»/);
    expect(e).toMatch(/склейка other-books — уровень inference, а не scripture/);
  });
});

