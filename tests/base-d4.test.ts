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

  it('Фаддей и Леввей — одна карточка (тождество сказано: «Леввей, прозванный Фаддеем», Мф 10:3); Иуда Иаковлев — без них; «Иуда» не на Мф 10:3', () => {
    const j = actors.get('p-iuda-iakovlev')!;
    const f = actors.get('p-faddey')!;
    expect(f.names.map((n) => n.form)).toEqual(['Фаддей', 'Леввей']);
    expect(j.names.map((n) => n.form)).toEqual(['Иуда', 'Иуда Иаковлев', 'Иуда, брат Иакова']);
    expect(j.names[0].refs).toEqual(['Лк 6:16']);
    // стихи Фаддея — только в примечании о тождестве, не в именах и не в утверждениях
    const own = JSON.stringify([j.names, j.facts.filter((x) => x.field !== 'notes').map((x) => x.value)]);
    expect(['Мф 10:3', 'Мк 3:18'].filter((r) => own.includes(r))).toEqual([]);
    expect(base.memberships.find((m) => m.actor === 'p-faddey')).toMatchObject({ area: 'g-apostles', basis: 'named', refs: ['Мф 10:2-3'] });
  });

  it('«возможно, то же лицо» уровня «вывод» со стихами обеих сторон; карточки не сливаются', () => {
    const rel = (a: string, b: string) => base.relations.find((r) => r.a === a && r.b === b && r.kind === 'possibly-same');
    expect(rel('p-leviy-alfeev', 'p-matfey')).toMatchObject({ cert: 'inference', refs: ['Мк 2:14', 'Лк 5:27', 'Мф 9:9'] });
    expect(rel('p-faddey', 'p-iuda-iakovlev')).toMatchObject({ cert: 'inference', refs: ['Мф 10:3', 'Мк 3:18', 'Лк 6:16', 'Деян 1:13'] });
    for (const r of [rel('p-leviy-alfeev', 'p-matfey')!, rel('p-faddey', 'p-iuda-iakovlev')!]) {
      expect(r.needsSources).toBeUndefined();
      expect(base.redirects.some((x) => (x.from === r.a && x.to.includes(r.b)) || (x.from === r.b && x.to.includes(r.a)))).toBe(false);
    }
    // прежний номер ребра Алфея ведёт на новое ребро
    const e = base.origins.find((o) => o.parent === 'p-alfey-otets-leviya')!;
    expect(base.redirects.find((r) => r.to.includes(e.id!))?.from).toBeTruthy();
  });

  it('подложенная ошибка ловится: форма «Левий» снова у Матфея, «Фаддей» у Иуды Иаковлева', () => {
    const b = structuredClone(base);
    const a = (id: string) => b.volumes.flatMap((v) => v.actors).find((x) => x.id === id)!;
    a('p-matfey').names.push({ form: 'Левий', type: 'variant', refs: ['Лк 5:27'] });
    a('p-iuda-iakovlev').names.push({ form: 'Фаддей', type: 'epithet', refs: ['Мк 3:18'] });
    const e = validate(b).filter((i) => i.level === 'error' && i.check === 'стоп-список').map((i) => i.where);
    expect(e).toEqual(expect.arrayContaining(['p-matfey', 'p-iuda-iakovlev']));
  });
});
