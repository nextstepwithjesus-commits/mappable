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
    delete f.facts.find((x) => x.id === 'a-12970')!.idCert;
    f.facts.find((x) => x.id === 'a-12964')!.idCert = { form: 'p-faddey#n2', refs: ['Ин 14:22'] };
    const e = errs(b, 'тождество по форме');
    expect(e).toMatch(/a-12970.*держится на форме «выв.» «Иуда Иаковлев»/);
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

  it('форма без общего стиха с основным и без вида — замечание (до конца Д-15)', () => {
    const w = validate(base).filter((i) => i.check === 'форма без вида');
    expect(w.every((i) => i.level === 'warn')).toBe(true);
    expect(w.length).toBeGreaterThan(100);
    // формы, которым Д-15 уже дал вид, в замечаниях не стоят
    expect(w.filter((i) => /p-abikhail-otets-esfiri|p-faddey|p-iofor/.test(i.where))).toEqual([]);
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
  it('лиц столько же: +1 Рагуил, −1 Иуда Иаковлев; переадресация Иуды — на Фаддея', () => {
    const ids = new Set(base.volumes.flatMap((v) => v.actors.map((a: Actor) => a.id)));
    expect(ids.has('p-raguil')).toBe(true);
    expect(ids.has('p-iuda-iakovlev')).toBe(false);
    expect(ids.size).toBe(2699);
  });
});
