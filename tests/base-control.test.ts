/**
 * Контрольный набор базы (docs/app/02-ДАННЫЕ.md, § 9, этап Д1): трудные случаи с ожидаемыми ответами.
 * На них же стартуют прототипы инструментов. Проверка базы — tools/base/validate.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildBase, type Base } from '../tools/base/migrate.ts';
import { validate } from '../tools/base/validate.ts';
import type { Actor } from '../tools/base/types.ts';

let base: Base;
let A: Map<string, Actor>;
beforeAll(() => {
  base = buildBase();
  A = new Map(base.volumes.flatMap((v) => v.actors.map((a) => [a.id, a] as const)));
});
const unionsOf = (id: string) => base.unions.filter((u) => u.husband === id || u.wife === id);
const married = (id: string) => unionsOf(id).filter((u) => u.terms.some((t) => t.kind !== 'not-stated'));
const children = (id: string) => base.origins.filter((o) => o.parent === id && o.primary).map((o) => o.child);
const parentsOf = (id: string) => base.origins.filter((o) => o.child === id).map((o) => o.parent);
const kin = (from: string, to: string) => base.kin.filter((k) => k.from === from && k.to === to);
const named = (form: string) => [...A.values()].filter((a) => a.names[0].form === form);

describe('контрольный набор', () => {
  it('проверка базы — без ошибок', () => {
    expect(validate(base).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('Авраам — 3 союза и 8 детей', () => {
    expect(married('p-avraam').map((u) => u.wife).sort()).toEqual(['p-agar', 'p-khettura', 'p-sarra']);
    expect(children('p-avraam')).toHaveLength(8);
  });
  it('Сарра — «сестра» словами Авраама (Быт 20:12)', () => {
    expect(kin('p-sarra', 'p-avraam').map((k) => [k.rel, k.refs])).toEqual([['сестра', ['Быт 20:12']]]);
  });
  it('Хеттура — и «жена» (Быт 25:1), и «наложница» (1Пар 1:32)', () => {
    const u = married('p-khettura')[0];
    expect(u.terms.map((t) => [t.kind, t.refs]).sort()).toEqual([['concubine', ['1Пар 1:32']], ['marriage', ['Быт 25:1']]]);
  });
  it('Иуда и Фамарь — союз без брака, только по детям', () => {
    const u = unionsOf('p-iuda').find((x) => x.wife === 'p-famar')!;
    expect(u.terms.map((t) => [t.kind, t.cert])).toEqual([['not-stated', 'inference']]);
  });
  it('Иродиада — жена Филиппа и Ирода (Мк 6:17)', () => {
    expect(married('p-irodiada').map((u) => u.husband).sort()).toEqual(['p-filipp-brat-iroda', 'p-irod-antipa']);
  });
  it('Марфа, Мария и Лазарь — братья и сёстры без названных родителей', () => {
    for (const id of ['p-marfa', 'p-mariya-iz-vifanii', 'p-lazar']) expect(parentsOf(id)).toEqual([]);
    expect(kin('p-marfa', 'p-mariya-iz-vifanii')[0].rel).toBe('сестра');
    expect(kin('p-lazar', 'p-marfa')[0].rel).toBe('брат');
  });
  it('жена Каина — безымянное лицо (Быт 4:17); мать Еноса не названа и не придумана', () => {
    const w = A.get('p-zhena-kaina')!;
    expect(w.kind).toBe('unnamed');
    expect(parentsOf('p-enokh-syn-kaina')).toContain('p-zhena-kaina');
    expect(base.origins.filter((o) => o.child === 'p-enos').map((o) => o.role)).toEqual(['father']);
  });
  it('десять прокажённых — группа из 10; Самарянин — один из них и числа не увеличивает', () => {
    const g = A.get('p-desyat-prokazhennykh')!;
    expect([g.kind, g.count?.n]).toEqual(['group', 10]);
    const m = base.memberships.filter((x) => x.area === g.id);
    expect(m.map((x) => [x.actor, x.role])).toEqual([['p-samaryanin-iz-desyati-prokazhennykh', 'один из них']]);
  });
  it('три Михаила — разные лица: 1Пар 5:13, 5:14 и Михаил Архангел (Иуд 1:9)', () => {
    const ids = ['p-mikhail-syn-avikhaila', 'p-mikhail-syn-ieshishaya', 'p-mikhail-arkhangel'];
    for (const id of ids) expect(A.get(id)?.names[0].form).toBe('Михаил');
    expect(A.get('p-mikhail-arkhangel')!.kind).toBe('angel');
    expect(named('Михаил').length).toBeGreaterThanOrEqual(3);
  });
  it('Лк 3:23 — у Иосифа один отец при каждом прочтении; Илий не отец сразу Иосифа и Марии', () => {
    const r = base.readings.find((x) => x.id === 'r-lk3-23')!;
    expect(r.default).toBe('mt');
    const fathers = (reading: string, child: string) =>
      base.origins.filter((o) => o.child === child && o.role === 'father' && (!o.reading || o.reading.in.includes(reading))).map((o) => o.parent);
    expect(fathers('mt', 'p-iosif-muzh-marii')).toEqual(['p-iakov-otets-iosifa']);
    expect(fathers('lk', 'p-iosif-muzh-marii')).toEqual(['p-iliy-syn-matfata']);
    for (const x of r.readings) expect(fathers(x.id, 'p-iosif-muzh-marii').includes('p-iliy-syn-matfata') && fathers(x.id, 'p-mariya').includes('p-iliy-syn-matfata')).toBe(false);
    expect(base.lines.luke.readings['r-lk3-23']).toBe('lk');
  });
  it('Кис — сын Авиила или Нира по разным местам, не оба сразу; Каинан не брат Салы', () => {
    const k = base.origins.filter((o) => o.child === 'p-kis' && o.role === 'father');
    expect(k.map((o) => [o.parent, o.reading?.set, o.reading?.in])).toEqual([['p-aviil', 'r-father-kis-nir', ['a']], ['p-nir', 'r-father-kis-nir', ['b']]]);
    expect(base.origins.find((o) => o.child === 'p-sala' && o.parent === 'p-arfaksad')!.gapPossible).toEqual({ refs: ['Лк 3:36'], via: ['p-kainan-syn-arfaksada'] });
  });
  it('«мои они» (Быт 48:5) — утверждение, а не ребро происхождения', () => {
    expect(parentsOf('p-efrem')).not.toContain('p-iakov');
    expect(A.get('p-efrem')!.facts.some((f) => JSON.stringify(f.value).includes('Быт 48:5-6'))).toBe(true);
  });
  it('Беера (1Пар 5:6) — сын Ваала, князь Рувимлян', () => {
    const b = A.get('p-beera-syn-vaala')!;
    expect(b.names[0].form).toBe('Беера');
    expect(parentsOf(b.id)).toEqual(['p-vaal-syn-reaii']);
    expect(base.origins.find((o) => o.child === b.id)?.refs).toEqual(['1Пар 5:5-6']);
  });
  it('Иисус Христос — мать Мария; отца по плоти нет', () => {
    const os = base.origins.filter((o) => o.child === 'p-iisus');
    expect(os.find((o) => o.role === 'mother')?.parent).toBe('p-mariya');
    expect(os.filter((o) => o.role === 'father').map((o) => [o.kind, o.cert])).toEqual([['legal', 'interpretation']]);
    expect(base.nodata.filter((n) => n.actor === 'p-iisus' && n.kind === 'not-applicable').map((n) => n.what)).toEqual(['отец по плоти']);
  });
});
