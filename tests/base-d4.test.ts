/**
 * Задача данных Д-4, партия 2 (02 § 3.3.4: слияние — только при тождестве «сказано»; решение координатора Р-1,
 * reviews/11-решения-координатора-ред4-2.md): форма другого имени — своя карточка и отношение «возможно, то же лицо»
 * уровня «вывод». Шаги — tools/base/corrections-d4.ts; отчёт — docs/app/reviews/Д-партия-2-отчёт.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import type { Actor } from '../tools/base/types.ts';

let base: Base;
let actors: Map<string, Actor>;
const refsOf = (a: Actor) => new Set([...a.names.flatMap((n) => n.refs), ...a.facts.flatMap((f) => JSON.stringify(f.value).match(/(?:Мф|Мк|Лк) \d+:\d+(?:-\d+)?/g) ?? [])]);

beforeAll(() => {
  base = loadBase();
  actors = new Map(base.volumes.flatMap((v) => v.actors).map((a) => [a.id, a]));
});

describe('Д-4: форма другого имени — своя карточка', () => {
  it('Левий — своя карточка; у Матфея нет ни формы, ни стихов Левия; ребро Алфея — к Левию, «Писание»', () => {
    const m = actors.get('p-matfey')!;
    const l = actors.get('p-leviy-alfeev')!;
    expect(m.names.map((n) => n.form)).toEqual(['Матфей', 'Матфей мытарь']);
    expect(l.names.map((n) => [n.form, n.refs])).toEqual([['Левий', ['Мк 2:14', 'Лк 5:27', 'Лк 5:29']], ['Левий Алфеев', ['Мк 2:14']]]);
    // стих принадлежит лицу только через его записи (02 § 3.11.2): у Матфея — ни Мк 2, ни Лк 5 вне примечания о тождестве
    const own = [...new Set(m.facts.filter((f) => f.field !== 'notes').flatMap((f) => JSON.stringify(f.value).match(/(?:Мк 2|Лк 5):\d+/g) ?? []))];
    expect(own).toEqual([]);
    expect(base.origins.filter((o) => o.parent === 'p-alfey-otets-leviya').map((o) => [o.child, o.cert, o.refs])).toEqual([['p-leviy-alfeev', 'scripture', ['Мк 2:14']]]);
    expect(base.nodata.filter((n) => n.actor === 'p-matfey').flatMap((n) => n.read ?? []).filter((r) => /^(Мк 2|Лк 5):/.test(r))).toEqual([]);
    expect(refsOf(l).has('Мф 9:9')).toBe(false);
  });

  it('Фаддей и Иуда Иаковлев — одна карточка вида (б) (Д-15, 02 ред. 4.4): «Иуда Иаковлев», «Иуда, брат Иакова» — формы «выв.»; Леввей — with «Фаддей»', () => {
    const f = actors.get('p-faddey')!;
    expect(actors.has('p-iuda-iakovlev')).toBe(false);
    expect(f.names.map((n) => [n.id, n.form, n.cert ?? 'scripture'])).toEqual([
      ['p-faddey#n1', 'Фаддей', 'scripture'], ['p-faddey#n2', 'Леввей', 'scripture'], ['p-faddey#n3', 'Иуда Иаковлев', 'inference'], ['p-faddey#n4', 'Иуда, брат Иакова', 'inference'],
    ]);
    expect(f.names[1].with).toBe('p-faddey#n1');
    // стихи сравнения по сторонам и число «двенадцать» (Лк 6:13)
    expect(f.names[2].compare).toEqual({ form: { refs: ['Лк 6:16'] }, main: { refs: ['Мф 10:3', 'Мк 3:18'] }, count: { ref: 'Лк 6:13' } });
    expect(f.names[2].why?.codes).toEqual(['parallel', 'named-number', 'one-candidate', 'no-contradiction']);
    // «Иуда» не стоит на Мф 10:3 (там «Леввей, прозванный Фаддеем»)
    for (const n of f.names.filter((x) => x.form.startsWith('Иуда'))) expect(n.refs).not.toContain('Мф 10:3');
    // записи по Ин 14:22 и Деян 1:13 — через idCert, не строкой «Фаддей спросил» (02 § 3.3.5: цепочка двух выводов)
    const byId = new Map(f.facts.map((x) => [x.id, x]));
    for (const id of ['a-12964', 'a-12966']) expect(byId.get(id)?.idCert).toEqual({ form: 'p-faddey#n3', refs: ['Ин 14:22'] });
    expect(byId.get('a-12965')?.idCert?.form).toBe('p-faddey#n4');
    // одна запись «Один из двенадцати» со стихами обоих перечней — не тринадцать «из двенадцати»
    expect(f.facts.filter((x) => x.field === 'status').map((x) => (x.value as any).refs)).toEqual([['Мф 10:2-3', 'Мк 3:18', 'Лк 6:13-16', 'Деян 1:13']]);
    expect(base.memberships.filter((m) => m.actor === 'p-iuda-iakovlev')).toEqual([]);
    expect(base.memberships.find((m) => m.actor === 'p-faddey')).toMatchObject({ area: 'g-apostles', basis: 'named', refs: ['Мф 10:2-3', 'Лк 6:13-16'] });
    // переадресация — с основанием parallel; выбывшие записи ведут на карточку Фаддея
    expect(base.redirects.find((r) => r.from === 'p-iuda-iakovlev')).toMatchObject({ to: ['p-faddey'], basis: 'parallel' });
    for (const id of ['a-12961', 'a-12963', 'a-12967', 'ar-8']) expect([id, !!base.redirects.find((r) => r.from === id)]).toEqual([id, true]);
  });

  it('«возможно, то же лицо» уровня «вывод» со стихами обеих сторон; карточки не сливаются', () => {
    const rel = (a: string, b: string) => base.relations.find((r) => r.a === a && r.b === b && r.kind === 'possibly-same');
    expect(rel('p-leviy-alfeev', 'p-matfey')).toMatchObject({ cert: 'inference', refs: ['Мк 2:14', 'Лк 5:27', 'Мф 9:9'] });
    // Фаддей — Иуда Иаковлев: связи больше нет (вид (б), Д-15); Рагуил — Иофор: вид (в)
    expect(rel('p-faddey', 'p-iuda-iakovlev')).toBeUndefined();
    expect(rel('p-raguil', 'p-iofor')).toMatchObject({ cert: 'inference', refs: ['Исх 2:18', 'Исх 2:21', 'Исх 3:1', 'Исх 18:2'] });
    for (const r of [rel('p-leviy-alfeev', 'p-matfey')!, rel('p-raguil', 'p-iofor')!]) {
      expect(r.needsSources).toBeUndefined();
      expect(base.redirects.some((x) => (x.from === r.a && x.to.includes(r.b)) || (x.from === r.b && x.to.includes(r.a)))).toBe(false);
    }
    // прежний номер ребра Алфея ведёт на новое ребро
    const e = base.origins.find((o) => o.parent === 'p-alfey-otets-leviya')!;
    expect(base.redirects.find((r) => r.to.includes(e.id!))?.from).toBeTruthy();
  });

  it('подложенная ошибка ловится: форма «Левий» снова у Матфея; «Иуда Иаковлев» у Фаддея без уровня «выв.»; «Рагуил» снова у Иофора', () => {
    const b = structuredClone(base);
    const a = (id: string) => b.volumes.flatMap((v) => v.actors).find((x) => x.id === id)!;
    a('p-matfey').names.push({ form: 'Левий', type: 'variant', refs: ['Лк 5:27'] });
    delete a('p-faddey').names[2].cert;
    a('p-iofor').names.push({ form: 'Рагуил', type: 'variant', refs: ['Исх 2:18'] });
    const e = validate(b).filter((i) => i.level === 'error' && i.check === 'стоп-список').map((i) => i.where);
    expect(e).toEqual(expect.arrayContaining(['p-matfey', 'p-faddey', 'p-iofor']));
  });

  it('Рагуил — своя карточка (вид (в), Д-15): рёбра Сепфоры и Ховава — к нему, «Писание»; у Иофора нет ни формы, ни стихов Исх 2:16–21', () => {
    const r = actors.get('p-raguil')!;
    const io = actors.get('p-iofor')!;
    expect(r.names.map((n) => [n.form, n.refs])).toEqual([['Рагуил', ['Исх 2:18', 'Чис 10:29']]]);
    expect(io.names.map((n) => n.form)).toEqual(['Иофор']);
    expect(base.origins.filter((o) => o.parent === 'p-raguil').map((o) => [o.child, o.cert, o.refs, o.identity])).toEqual([
      ['p-sepfora', 'scripture', ['Исх 2:18', 'Исх 2:21'], undefined], ['p-khovav', 'scripture', ['Чис 10:29'], undefined],
    ]);
    expect(base.origins.filter((o) => o.parent === 'p-iofor')).toEqual([]);
    // у Иофора — только стихи Иофора: Исх 2:16–21 и Чис 10:29 остались лишь в примечании о тождестве
    const own = JSON.stringify(io.facts.filter((x) => x.field !== 'notes').map((x) => x.value));
    expect(['Исх 2:16', 'Исх 2:18', 'Исх 2:20', 'Исх 2:21', 'Чис 10:29'].filter((x) => own.includes(x))).toEqual([]);
  });

  it('отец Есфири — вид (б) (Д-15): основное имя «Аминадав» (Есф 2:15), «Абихаил» (Есф 9:29) — форма «выв.»', () => {
    const a = actors.get('p-abikhail-otets-esfiri')!;
    expect(a.names.map((n) => [n.form, n.type, n.cert ?? 'scripture'])).toEqual([['Аминадав', 'main', 'scripture'], ['Абихаил', 'variant', 'inference']]);
    expect(a.names[1].compare).toEqual({ form: { refs: ['Есф 9:29'] }, main: { refs: ['Есф 2:15'] } });
  });
});
