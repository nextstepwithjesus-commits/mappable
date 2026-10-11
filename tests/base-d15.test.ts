/**
 * Форма имени лица — уровень тождества (02 ред. 4.4 § 3.3.5–3.3.6; задачи К-18, К-19) и начало Д-15 (В-32). Настоящая база
 * проходит без ошибок; на каждое правило — нарочно испорченная запись, которую проверка ловит. Стихи сравнения (`compare`)
 * — стихи записи: их видят отпечаток подписи, проверка стихов и пакеты книг. Шаги — tools/base/corrections-d15.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import { admission, recordVerses } from '../tools/base/admit.ts';
import { buildCards, buildIndex, citedRefs } from '../tools/base/bundle.ts';
import { identityCsv, identityRows, IDENTITY_COLUMNS } from '../tools/base/name-forms.ts';
import { buildCardVolumes, buildIndexes, personNames } from '../tools/pack/packages.ts';
import { NameForms } from '../core/search/forms.ts';
import { Searcher } from '../core/search/search.ts';
import type { Actor } from '../tools/base/types.ts';

let base: Base;
const card = (b: Base, id: string) => b.volumes.flatMap((v) => v.actors).find((a) => a.id === id)!;
const errs = (b: Base, check?: string) => validate(b).filter((i) => i.level === 'error' && (!check || i.check === check)).map((i) => `${i.where}: ${i.msg}`).join('\n');

beforeAll(() => {
  base = loadBase();
});

describe('К-18: форма имени — уровень, стихи сравнения по сторонам, коды, номер', () => {
  it('настоящая база — без ошибок формы имени и тождества по форме', () => {
    expect(validate(base).filter((i) => i.level === 'error' && /форма имени|тождество по форме|переадресация/.test(i.check))).toEqual([]);
  });

  it('форма «выв.» без стихов сравнения, без кодов, с кодом не из списка; основная форма «выв.» — ошибка', () => {
    const b = structuredClone(base);
    const a = card(b, 'p-abikhail-otets-esfiri');
    delete a.names[1].compare;
    a.names[1].why = { codes: ['похоже' as any] };
    const e = errs(b, 'форма имени');
    expect(e).toMatch(/нет стихов сравнения обеих сторон/);
    expect(e).toMatch(/код проверки «похоже» не из закрытого списка/);
    const c = structuredClone(base);
    card(c, 'p-abikhail-otets-esfiri').names[0].cert = 'inference';
    expect(errs(c, 'форма имени')).toMatch(/основная форма «Аминадав» — «выв.»/);
  });

  it('стих сравнения стороны формы, где формы нет; named-number без стиха числа; номер формы чужой карточки', () => {
    const b = structuredClone(base);
    const f = card(b, 'p-faddey');
    f.names[2].compare = { form: { refs: ['Мф 10:3'] }, main: { refs: ['Мк 3:18'] } };
    f.names[3].id = 'p-iofor#n9';
    const e = errs(b, 'форма имени');
    expect(e).toMatch(/в стихе сравнения Мф 10:3 формы «Иуда Иаковлев» нет вне скобок/);
    expect(e).toMatch(/код named-number без стиха числа/);
    expect(e).toMatch(/номер формы «p-iofor#n9» — вида p-faddey#n<число>/);
  });

  it('стихи сравнения — в отпечатке подписи, в проверке стихов и в пакете книги', () => {
    const f = card(base, 'p-faddey');
    // отпечаток: стихи записи «лицо» включают стихи сравнения и стих числа (Лк 6:13 — только в compare.count)
    expect(recordVerses({ names: f.names }).map((v) => v.id)).toContain('Лк 6:13');
    // пакет книги: стих сравнения допущенной формы лежит в своём пакете (проба допускает черновики)
    expect([...citedRefs(base, admission(base, 'probe'))]).toContain('Лк 6:13');
    // проверка стихов: неверная ссылка в compare — ошибка «стих»
    const b = structuredClone(base);
    card(b, 'p-faddey').names[2].compare!.main.refs = ['Мф 99:1'];
    expect(validate(b).some((i) => i.level === 'error' && i.check === 'стих' && /Мф 99:1/.test(i.msg))).toBe(true);
  });

  it('запись, которая держится на форме «выв.», без idCert — ошибка; idCert на форму «Писание» — ошибка', () => {
    const b = structuredClone(base);
    const f = card(b, 'p-faddey');
    // заметка о тождестве («Не смешивать с Иудой Искариотом», a-12970) idCert не требует (второй ключ партии 2, № 7); событие — да
    delete f.facts.find((x) => x.id === 'a-12965')!.idCert;
    delete f.facts.find((x) => x.id === 'a-12970')!.idCert;
    f.facts.find((x) => x.id === 'a-12964')!.idCert = { form: 'p-faddey#n2', refs: ['Ин 14:22'] };
    const e = errs(b, 'тождество по форме');
    expect(e).toMatch(/a-12965.*держится на форме «выв.»/);
    expect(e).not.toMatch(/a-12970/);
    expect(e).toMatch(/idCert: форма p-faddey#n2 — не «выв.»/);
  });

  it('identity inferred без номера формы; номер формы при другой степени — ошибка', () => {
    const b = structuredClone(base);
    const o = b.origins.find((x) => x.child === 'p-esfir' && x.parent === 'p-abikhail-otets-esfiri')!;
    o.identity = { of: 'parent', degree: 'inferred', note: 'по форме', refs: ['Есф 9:29'] };
    const o2 = b.origins.find((x) => x.identity?.degree === 'possible')!;
    o2.identity!.form = 'p-abikhail-otets-esfiri#n1';
    const e = errs(b, 'тождество по форме');
    expect(e).toMatch(/inferred\) без номера формы/);
    expect(e).toMatch(/номер формы \(form\) — только при степени inferred/);
    // ребро «весомо по имени» с формой конца — допустимо
    const c = structuredClone(base);
    c.origins.find((x) => x.child === 'p-esfir' && x.parent === 'p-abikhail-otets-esfiri')!.identity = { of: 'parent', degree: 'inferred', note: 'по форме', refs: ['Есф 9:29'], form: 'p-abikhail-otets-esfiri#n1' };
    expect(errs(c, 'тождество по форме')).toBe('');
  });

  it('переадресация: basis parallel без формы «выв.» у цели; said без двух форм в одном стихе — ошибка', () => {
    const b = structuredClone(base);
    b.redirects.push({ from: 'p-proba-1', to: ['p-iofor'], reason: 'проба', refs: ['Исх 3:1'], at: '2026-10-11', basis: 'parallel' });
    b.redirects.push({ from: 'p-proba-2', to: ['p-iofor'], reason: 'проба', refs: ['Исх 3:1'], at: '2026-10-11', basis: 'said' });
    const e = errs(b, 'переадресация');
    expect(e).toMatch(/p-proba-1: основание parallel, а у карточки p-iofor нет формы «выв.»/);
    expect(e).toMatch(/p-proba-2: основание said/);
    expect(base.redirects.find((r) => r.from === 'p-iuda-iakovlev')?.basis).toBe('parallel');
  });

  it('уточнение «он же» у карточки с формой «выв.» — ошибка', () => {
    const b = structuredClone(base);
    card(b, 'p-abikhail-otets-esfiri').disambig = 'отец Есфири, он же Абихаил';
    expect(errs(b, 'форма имени')).toMatch(/со словами «он же», «иначе»/);
  });

  it('форма без общего стиха с основным и без вида — ошибка (после Д-15, партия 2 — 02 § 3.3.5 [4.4 по Р-5])', () => {
    // настоящая база: все 208 форм получили вид (Д-15, партия 2)
    expect(validate(base).filter((i) => i.check === 'форма без вида')).toEqual([]);
    // форма без вида — ошибка; та же форма с видом — нет
    const b = structuredClone(base);
    card(b, 'p-iessey').names.push({ form: 'Ишай', type: 'variant', refs: ['Быт 1:1'] });
    expect(errs(b, 'форма без вида')).toMatch(/p-iessey «Ишай»: нет общего стиха с основным именем «Иессей»/);
    const c = structuredClone(base);
    const n = card(c, 'p-iessey').names.find((x) => x.form === 'Иесей')!;
    delete n.cert;
    expect(errs(c, 'форма без вида')).toMatch(/p-iessey «Иесей»/);
  });
});

describe('К-19: сборка, поиск и выгрузка «Тождества лиц»', () => {
  it('индекс: номера форм «выв.» среди других имён (oi); карточка: формы «выв.» со сторонами и кодами (nm)', () => {
    const ix = buildIndex(base, 'probe');
    const ab = ix.actors.find((a: any) => a.id === 'abikhail-otets-esfiri') as any;
    expect([ab.n, ab.o, ab.oi]).toEqual(['Аминадав', ['Абихаил'], [0]]);
    const f = ix.actors.find((a: any) => a.id === 'faddey') as any;
    expect(f.o.filter((_: string, i: number) => f.oi.includes(i))).toEqual(['Иуда Иаковлев', 'Иуда, брат Иакова']);
    const { cards } = buildCards(base, 'probe');
    const fc = Object.values(cards).map((v: any) => v.cards['faddey']).find(Boolean) as any;
    expect(fc.nm.map((x: any) => [x.id, x.n, x.c, x.cmp.count?.ref, x.w.codes.length])).toEqual([['p-faddey#n3', 'Иуда Иаковлев', 'inference', 'Лк 6:13', 4], ['p-faddey#n4', 'Иуда, брат Иакова', 'inference', 'Лк 6:13', 4]]);
    // записи по форме — с полем ic
    expect(fc.f.find((x: any) => x.f === 'sayings').ic).toEqual({ form: 'p-faddey#n3', refs: ['Ин 14:22'] });
  });

  it('пакеты ядра: oi и «возможно, тот же человек» (ps); поиск ставит форму «Писание» выше «выв.», при виде (в) — обе карточки', () => {
    const A = admission(base, 'probe');
    const { core } = buildIndexes(base, A);
    const p = (id: string) => core.persons.find((x) => x.id === id)!;
    expect(p('abikhail-otets-esfiri').oi).toEqual([0]);
    expect(p('raguil').ps).toEqual(['iofor']);
    expect(p('iofor').ps).toEqual(['raguil']);
    expect(personNames([{ form: 'Аминадав', type: 'main' }, { form: 'Абихаил', type: 'variant', cert: 'inference' }]).oi).toEqual([0]);
    const s = new Searcher({ names: core.names, exceptions: core.exceptions, persons: core.persons, stories: [], places: core.places, areas: core.areas }, new NameForms(core.names));
    // «Рагуил» — карточка Рагуила, затем Иофор («возможно, тот же человек»); тёзки-Рагуилы — свои карточки
    const r = s.personsOf('рагуил', 'Рагуил').map((x) => x.id);
    expect(r).toContain('raguil');
    expect(r.indexOf('iofor')).toBeGreaterThan(r.indexOf('raguil'));
    // ранг: при равных прочих совпадение с формой «Писание» выше совпадения с формой «выв.»
    const fake = new Searcher(
      { names: [{ forms: ['иов'], ids: ['a', 'b'] }], exceptions: [], persons: [{ id: 'a', n: 'Иашув', o: ['Иов'], oi: [0], p: 3, k: 'human' }, { id: 'b', n: 'Иашув-2', o: ['Иов'], p: 1, k: 'human' }], stories: [] },
      new NameForms([{ forms: ['иов'], ids: ['a', 'b'] }]),
    );
    expect(fake.personsOf('иов', 'Иов').map((x) => x.id)).toEqual(['b', 'a']);
    const { volumes } = buildCardVolumes(base, A);
    const fc = [...volumes.values()].map((v) => v.cards['faddey']).find(Boolean)!;
    expect(fc.nm!.map((x) => x.id)).toEqual(['p-faddey#n3', 'p-faddey#n4']);
  });

  it('выгрузка «Тождества лиц»: CSV «;», UTF-8 с BOM; формы «выв.» (вид б) и пары possibly-same (вид в)', () => {
    const rows = identityRows(base);
    expect(rows.find((r) => r[0] === 'p-abikhail-otets-esfiri')).toEqual(['p-abikhail-otets-esfiri', 'Аминадав', 'Абихаил', 'p-abikhail-otets-esfiri#n1', 'вывод', 'Есф 9:29', 'Есф 2:15', '', 'parallel, same-node, one-candidate, no-contradiction', '', 'б', '', '']);
    expect(rows.find((r) => r[0] === 'p-raguil')).toMatchObject({ 10: 'в', 11: 'p-iofor' });
    expect(rows.some((r) => r[0] === 'p-faddey' && r[2] === 'Иуда Иаковлев' && r[7] === 'Лк 6:13')).toBe(true);
    const csv = identityCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe(`﻿${IDENTITY_COLUMNS.join(';')}`);
    // поле со знаком «;» — в кавычках (RFC 4180)
    expect(csv).toContain('"Мф 10:3; Мк 3:18"');
  });
});

describe('Д-15: начало — данные', () => {
  it('лиц: +1 Рагуил, −1 Иуда Иаковлев (начало); +22 карточки вида (в) (партия 2); переадресация Иуды — на Фаддея', () => {
    const ids = new Set(base.volumes.flatMap((v) => v.actors.map((a: Actor) => a.id)));
    expect(ids.has('p-raguil')).toBe(true);
    expect(ids.has('p-iuda-iakovlev')).toBe(false);
    // правка по второму ключу партии 2 (D15-13, D15-15): +10 тёзок и Раамия, +1 Иоханан из Неем 12:22–23
    // 02 ред. 4.6 (В-33): +21 глава дома из Неем 12:12–21 (Д15-2, D15-19), +1 Селлум Кореянин (вид (в), D18-2)
    // правка по второму ключу В-33 (D18-5): +4 карточки вида (в) — Анания, отец Ииуя; Анхус при Соломоне; Мааха; Вания (Неем 10:14)
    expect(ids.size).toBe(2699 + 22 + 11 + 22 + 4);
  });
});

describe('Д-15: правка по второму ключу В-32 (D15-4)', () => {
  const fact = (actor: string, id: string) => card(base, actor).facts.find((f) => f.id === id);
  it('Сепфора: Иофор не назван её отцом (Исх 18:2 — «тесть Моисеев»); запись «родители» a-4378 сведена в событие', () => {
    expect(JSON.stringify(fact('p-sepfora', 'a-4390')!.value)).not.toMatch(/в Исх 18:2 — Иофор/);
    expect(JSON.stringify(fact('p-sepfora', 'a-4386')!.value)).not.toMatch(/к отцу/);
    expect(fact('p-sepfora', 'a-4378')).toBeUndefined();
    expect(base.redirects.find((r) => r.from === 'a-4378')?.to).toEqual(['a-4386']);
    expect(card(base, 'p-sepfora').facts.filter((f) => f.field === 'parentsNote').map((f) => JSON.stringify(f.value)).join()).not.toMatch(/Иофор/);
  });
  it('Фаддей: толкование об Иакове — needsSources; Ин 14:22 — не среди ключевых мест; Рагуил «велел дочерям позвать»', () => {
    expect(fact('p-faddey', 'a-12969')).toMatchObject({ cert: 'interpretation', needsSources: true });
    expect((fact('p-faddey', 'a-16295')!.value as any).key).not.toContain('Ин 14:22');
    expect((fact('p-raguil', 'a-16297')!.value as any).text).toMatch(/^велел дочерям позвать его есть хлеб/);
  });
  it('лицо Есевон — без стихов города Есевона (Суд 11:19, 26)', () => {
    const s = JSON.stringify(card(base, 'p-esevon-iz-vifleema'));
    expect(s).not.toMatch(/Суд 11:(19|26)/);
  });
});


describe('Д-15, партия 2 — данные (tools/base/corrections-d15b.ts)', () => {
  const names = (id: string) => card(base, id).names.map((n) => `${n.form}${n.type === 'main' ? '*' : ''}${n.cert === 'inference' ? '~' : n.cert === 'scripture' ? '=' : ''}`);
  it('Озия и Азария — вид (б): «Азария» — форма «выв.» со стихами сравнения, уточнение без «он же»; запись по 4Цар 15:1 — с idCert', () => {
    const a = card(base, 'p-oziya');
    expect(names('p-oziya')).toEqual(['Озия*', 'Азария~']);
    expect(a.disambig).toBe('царь Иудейский');
    const az = a.names[1];
    expect([az.id, az.compare?.main.refs, az.why?.codes]).toEqual(['p-oziya#n2', ['2Пар 26:1', '4Цар 15:32'], ['parallel', 'same-node', 'one-candidate', 'no-contradiction']]);
    expect(a.facts.find((f) => f.id === 'a-9071')?.idCert?.form).toBe('p-oziya#n2');
  });

  it('Сафай (с формой «Шима») и Самай — вид (в): свои карточки, «возможно, то же лицо» с Саммой; строки истории — на карточке Сафая', () => {
    expect(names('p-samma-syn-iesseya')).toEqual(['Самма*']);
    expect(names('p-safay-brat-davida')).toEqual(['Сафай*', 'Шима~']);
    expect(names('p-samay-brat-davida')).toEqual(['Самай*']);
    const rel = (a: string) => base.relations.filter((r) => r.a === a && r.kind === 'possibly-same').map((r) => [r.b, r.cert]);
    expect(rel('p-safay-brat-davida')).toEqual([['p-samma-syn-iesseya', 'inference']]);
    expect(rel('p-samay-brat-davida')).toEqual([['p-samma-syn-iesseya', 'inference']]);
    expect(base.origins.filter((o) => o.parent === 'p-safay-brat-davida').map((o) => o.child)).toEqual(['p-ionafan-syn-sammy']);
    expect(base.origins.filter((o) => o.parent === 'p-samay-brat-davida').map((o) => o.child)).toEqual(['p-ionadav-syn-sammy']);
    const s = base.stories!.find((x: any) => x.id === 'e-snova-voyna-s-filistimlyanami')!;
    const rows = s.actors.filter((x: any) => x.actor === 'p-safay-brat-davida').map((x: any) => [x.label, x.cert, x.idCert?.form]);
    expect(rows).toEqual([['Сафай', 'scripture', undefined], ['Шима', 'inference', 'p-safay-brat-davida#n2']]);
  });

  it('Симон Зилот — форма «выв.» по перечню с названным числом; строка Лк 6:15 — с idCert, Мк 3:18 — «Писание»', () => {
    const z = card(base, 'p-simon-zilot').names.find((n) => n.form === 'Симон Зилот')!;
    expect([z.cert, z.compare?.count?.ref]).toEqual(['inference', 'Лк 6:13']);
    const s = base.stories!.find((x: any) => x.id === 'e-iisus-stavit-dvenadtsat')!;
    // строка с idCert — уровня «вывод» (второй ключ партии 2, № 16; решение координатора 6)
    expect(s.actors.filter((x: any) => x.actor === 'p-simon-zilot').map((x: any) => [x.refs[0], x.cert, x.idCert?.form])).toEqual([['Мк 3:18', 'scripture', undefined], ['Лк 6:15', 'inference', 'p-simon-zilot#n3']]);
  });

  it('основное имя — по числу стихов: Иашув, Шухам, Илий, Гирсон, Навин, Авинадав, Беродах Баладан', () => {
    for (const [id, main] of [['p-iov-syn-issakhara', 'Иашув'], ['p-khushim-syn-dana', 'Шухам'], ['p-eliil-syn-toakha', 'Илий'], ['p-girsam', 'Гирсон'], ['p-non', 'Навин'], ['p-aminadav-syn-saula', 'Авинадав'], ['p-merodakh-valadan', 'Беродах Баладан']]) {
      expect([id, card(base, id).names[0].form, card(base, id).names[0].type]).toEqual([id, main, 'main']);
    }
    const iov = card(base, 'p-iov-syn-issakhara').names.find((n) => n.form === 'Иов')!;
    expect([iov.cert, iov.compare?.form.refs, iov.compare?.count?.ref]).toEqual(['inference', ['Быт 46:13'], '1Пар 7:1']);
  });

  it('другое написание — по общим проверкам (02 ред. 4.6, Д-18): форма «выв.»; имя народа — не форма лица; Иез 1:2 — не форма Иехонии', () => {
    // 4.6: другое написание само по себе уровня не даёт; «Писание» — только когда стих называет лицо обоими именами (D18-1)
    expect(names('p-iessey')).toContain('Иесей~');
    expect(names('p-amon-tsar')).toContain('Аммон~');
    expect(names('p-iavan')).toEqual(['Иаван*']);
    expect(names('p-kedar')).toEqual(['Кедар*']);
    expect(card(base, 'p-iekhoniya').names.flatMap((n) => n.refs)).not.toContain('Иез 1:2');
    // «предали Его Понтию Пилату» (Мф 27:2): стих называет лицо обоими именами — «Писание» остаётся
    expect(names('p-pontiy-pilat')).toContain('Пилат=');
  });

  it('Д-р14: у Маахи один отец; две матери Авии — набор прочтений; Гофониил — «из потомков» у Хелдая; «из дома Харима» — степень не названа, без тождества (Д15-2)', () => {
    expect(base.origins.filter((o) => o.child === 'p-maakha-doch-avessaloma' && o.role === 'father').map((o) => [o.parent, o.reading])).toEqual([['p-avessalom', undefined]]);
    expect(base.readings.find((r) => r.id === 'r-father-maakha-doch-avessaloma')).toBeUndefined();
    expect(base.origins.filter((o) => o.child === 'p-aviya' && o.role === 'mother').map((o) => [o.parent, o.reading?.set, o.primary])).toEqual(
      [['p-maakha-doch-avessaloma', 'r-mother-aviya', true], ['p-mikhaiya-doch-uriila', 'r-mother-aviya', false]],
    );
    const g = base.origins.filter((o) => o.parent === 'p-gofoniil' && o.refs.includes('1Пар 27:15'));
    expect(g.map((o) => [o.child, o.kind, o.degree, o.words?.[0].text])).toEqual([['p-kheldai-netofafyanin', 'ancestor', 'unstated', 'из потомков Гофониила']]);
    const ad = base.origins.find((o) => o.child === 'p-adna-neem12')!;
    // Д15-2 (D15-19): «из дома Харима» — к карточке главы дома, без тождества с Рехумом (Неем 12:3); с ним — «возможно, то же лицо»
    expect([ad.parent, ad.kind, ad.degree, ad.identity]).toEqual(['p-kharim-neem12-15', 'ancestor', 'unstated', undefined]);
    expect(base.relations.filter((r) => r.a === 'p-kharim-neem12-15').map((r) => [r.b, r.kind, r.cert])).toEqual([['p-rekhum-neem12', 'possibly-same', 'inference']]);
  });

  it('вид (в) — своя карточка, ребро к ней по стиху и «возможно, то же лицо»: Рахава, Силуан, Ешбаал, Михаия, Елиам, сын Ахитофела', () => {
    const rel = (a: string) => base.relations.filter((r) => r.a === a && r.kind === 'possibly-same').map((r) => r.b).sort();
    expect(rel('p-rakhava')).toEqual(['p-raav']);
    expect(rel('p-siluan')).toEqual(['p-sila']);
    expect(rel('p-eshbaal-syn-saula')).toEqual(['p-iessui', 'p-ievosfey']);
    expect(rel('p-mikhaiya-doch-uriila')).toEqual(['p-maakha-doch-avessaloma']);
    expect(rel('p-eliam-syn-akhitofela')).toEqual(['p-eliam']);
    expect(base.origins.filter((o) => o.child === 'p-vooz' && o.role === 'mother').map((o) => o.parent)).toEqual(['p-rakhava']);
    expect(base.origins.filter((o) => o.child === 'p-eshbaal-syn-saula').map((o) => [o.parent, o.refs])).toEqual([['p-saul', ['1Пар 8:33', '1Пар 9:39']]]);
    expect(card(base, 'p-sila').disambig).not.toMatch(/он же/);
  });
});

describe('Д-15, партия 2 — правка по второму ключу (tools/base/corrections-d15c.ts)', () => {
  const rel = (a: string) => base.relations.filter((r) => r.a === a && r.kind === 'possibly-same').map((r) => r.b).sort();
  it('тёзки — свои карточки и «возможно, то же лицо»: Имер, Корей, Уззиил, Елисафан, Елицафан, Шуваил, Шавтай, Авиезер, Сивхай; Раамия', () => {
    for (const [id, b] of [['p-imer-1par24-14', ['p-immer']], ['p-korey-otets-meshelemii', ['p-kore-syn-eviasafa', 'p-korey']], ['p-uzziil-1par15-10', ['p-uziil']],
      ['p-elisafan-1par15-8', ['p-elitsafan']], ['p-elitsafan-2par29-13', ['p-elitsafan']], ['p-shuvail-1par24-20', ['p-shevuil-syn-girsama']], ['p-shavtay-levit', ['p-shavfay-levit']],
      ['p-aviezer-1par27-12', ['p-eviezer']], ['p-sivkhay-khushatyanin', ['p-mebunnay', 'p-sovokhay']], ['p-raamiya', ['p-nakhmaniy', 'p-reelay']]] as const) {
      expect([id, rel(id)]).toEqual([id, [...b].sort()]);
    }
    expect(base.origins.filter((o) => o.child === 'p-meshelemiya' && o.role === 'father').map((o) => o.parent)).toEqual(['p-korey-otets-meshelemii']);
    expect(card(base, 'p-reelay').names.map((n) => n.form)).toEqual(['Реелай']);
  });

  it('«Нер» — форма «выв.» с напряжением; рёбра Киса на ней — с тождеством по форме', () => {
    const ner = card(base, 'p-nir').names.find((n) => n.form === 'Нер')!;
    expect([ner.cert, ner.why?.codes.includes('no-contradiction'), /Напряжение/.test(ner.why?.note ?? '')]).toEqual(['inference', false, true]);
    expect(base.origins.find((o) => o.child === 'p-kis' && o.parent === 'p-nir')?.identity?.form).toBe(ner.id);
  });

  it('Иоханан из Неем 12:22–23 — своя карточка; связи с Иохананом (Езд 10:6) и Ионафаном', () => {
    expect(card(base, 'p-iokhanan-syn-eliashiva').names[0].refs).toEqual(['Езд 10:6']);
    expect(rel('p-iokhanan-neem12-22')).toEqual(['p-iokhanan-syn-eliashiva', 'p-ionafan-syn-ioiady']);
    expect(base.relations.filter((r) => r.a === 'p-iokhanan-syn-eliashiva')).toEqual([]);
  });

  it('тождество по форме «или не названо вовсе»: рёбра Нона, Ахшура, Силома; записи Гирсама, Юхала', () => {
    expect(base.origins.find((o) => o.child === 'p-non' && o.parent === 'p-elishama-syn-ammiuda')?.identity?.form).toBe('p-non#n1');
    expect(base.origins.filter((o) => o.parent === 'p-ashkhur').every((o) => o.identity?.degree === 'inferred')).toBe(true);
    expect(base.origins.filter((o) => o.parent === 'p-shela-syn-iudy' && o.refs.some((r) => r.startsWith('1Пар 4:'))).every((o) => o.identity?.degree === 'inferred')).toBe(true);
    for (const [c, id] of [['p-girsam', 'a-4405'], ['p-girsam', 'a-4408'], ['p-iegukhal', 'a-11264']]) expect([id, !!card(base, c).facts.find((f) => f.id === id)?.idCert]).toEqual([id, true]);
    // проверка ловит ребро без тождества
    const b = structuredClone(base);
    delete b.origins.find((o) => o.child === 'p-non' && o.parent === 'p-elishama-syn-ammiuda')!.identity;
    expect(errs(b, 'тождество по форме')).toMatch(/p-non ← p-elishama-syn-ammiuda: ребро держится на форме «выв.» «Нон»/);
  });

  it('строка истории с idCert — уровень «вывод»; другой уровень — ошибка', () => {
    for (const s of base.stories ?? []) for (const a of (s as any).actors ?? []) if (a.idCert) expect([s.id, a.actor, a.cert]).toEqual([s.id, a.actor, 'inference']);
    const b = structuredClone(base);
    const row = (b.stories!.find((x: any) => x.id === 'e-iisus-stavit-dvenadtsat') as any).actors.find((a: any) => a.idCert);
    row.cert = 'scripture';
    expect(validate(b).filter((i) => i.level === 'error').map((i) => i.msg).join('\n')).toMatch(/строка с idCert — уровень «вывод»/);
  });

  it('Иез 1:2 Иехонии не отдан: a-9572 и a-9590 выбыли с переадресацией; соседние тексты без «одного лица»', () => {
    expect(card(base, 'p-iekhoniya').facts.flatMap((f) => JSON.stringify(f.value).match(/Иез 1:2/g) ?? []).length).toBe(2); // заметка: текст и ссылка
    expect(base.redirects.filter((r) => ['a-9572', 'a-9590'].includes(r.from)).map((r) => r.to[0])).toEqual(['p-iekhoniya', 'p-iekhoniya']);
    expect(card(base, 'p-ionafan-syn-sammy').disambig).toBe('сын Сафая, брата Давидова (2Цар 21:21)');
    expect(JSON.stringify(card(base, 'p-salmon').facts.map((f) => f.value))).not.toMatch(/весомо одно лицо/);
  });
});
