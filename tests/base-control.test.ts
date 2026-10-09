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
    const sala = (r: string) => base.origins.filter((o) => o.child === 'p-sala' && o.reading?.in.includes(r)).map((o) => o.parent);
    expect([sala('gen'), sala('lk')]).toEqual([['p-arfaksad'], ['p-kainan-syn-arfaksada']]);
    expect(base.origins.find((o) => o.child === 'p-kainan-syn-arfaksada')!.reading).toEqual({ set: 'r-father-sala', in: ['lk'] });
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
    // «не от союза» — нейтральный вид «Писание говорит» со словами стихов (07 § 8.2; шаг C31)
    const nd = base.nodata.filter((n) => n.actor === 'p-iisus' && n.kind === 'scripture-says');
    expect(nd.map((n) => n.what)).toEqual(['отец по плоти']);
    expect(nd[0].words?.map((w) => w.ref)).toEqual(['Мф 1:18', 'Мф 1:20', 'Лк 1:34', 'Лк 1:35']);
  });
});

describe('правки Д2 (рецензии 03 и 07, решение совета о скобках)', () => {
  const edge = (child: string, parent: string) => base.origins.filter((o) => o.child === child && o.parent === parent);
  it('Саломиф, дочь Давриина, из племени Данова — мать хулителя (Лев 24:11, пояснение самого текста)', () => {
    const m = A.get('p-mat-khulitelya')!;
    expect([m.kind, m.names[0].form]).toEqual(['human', 'Саломиф']);
    expect(edge('p-syn-izrailtyanki-khulitel', 'p-mat-khulitelya')).toHaveLength(1);
    expect(edge('p-mat-khulitelya', 'p-davriin').map((o) => [o.role, o.cert, o.refs])).toEqual([['father', 'scripture', ['Лев 24:11']]]);
    expect(base.memberships.some((x) => x.actor === m.id && x.area === 'g-dan' && x.basis === 'named')).toBe(true);
    // слова Лев 24:10 вне скобок остаются фактом; еврейский текст — только справочно, в карантине
    const lin = m.facts.filter((f) => f.field === 'lineage').map((f) => (f.value as any).refs);
    expect(lin).toEqual([['Лев 24:10'], ['Лев 24:11']]);
    const heb = m.facts.filter((f) => JSON.stringify(f.value).includes('еврейском'));
    expect(heb.map((f) => [f.cert, f.prov?.status])).toEqual([['reference', 'quarantine']]);
    expect(A.get('p-davriin')!.disambig).toBe('отец Саломифи (Лев 24:11)');
    expect(base.memberships.filter((x) => x.actor === 'p-davriin')).toEqual([]);
  });
  it('Финеес при ковчеге (Суд 20:27–28) — событие; у Иоанна Марка нет Антиохии по Деян 12:25', () => {
    expect(A.get('p-finees')!.facts.some((f) => f.field === 'events' && JSON.stringify(f.value).includes('Суд 20:27-28'))).toBe(true);
    expect(A.get('p-ioann-mark')!.facts.filter((f) => f.field === 'places' && JSON.stringify(f.value).includes('Антиохия'))).toEqual([]);
  });
  it('неплодство Сарры — по Быт 11:30; цитата Евр 11:11 без «(будучи неплодна)»', () => {
    const s = JSON.stringify(A.get('p-sarra')!.facts);
    expect(s).not.toContain('будучи неплодна');
    expect(s).toContain('Быт 11:30');
  });
  it('примечаний «скобки не основание» у мест «б» больше нет', () => {
    for (const id of ['p-mat-khulitelya', 'p-finees', 'p-eldad', 'p-modad', 'p-gedeon', 'p-iarkha', 'p-ioann-mark']) {
      expect([id, A.get(id)!.facts.filter((f) => (f.value as any)?.kind === 'bracket').length]).toEqual([id, 0]);
    }
  });
  it('два Халева не слиты: ребро Ахсы без 1Пар 2:49; у Халева, сына Есрома, — метка', () => {
    expect(edge('p-akhsa', 'p-khalev')[0].refs).toEqual(['Нав 15:16', 'Суд 1:12']);
    expect(edge('p-akhsa', 'p-khalev-syn-esroma')).toEqual([]);
    expect(A.get('p-khalev-syn-esroma')!.facts.some((f) => (f.value as any)?.degree === 'possible')).toBe(true);
    // ни примечание Халева, сына Иефонниина, ни § 23 Ахсы не приписывают 1Пар 2:49 Ахсе как факт
    expect(JSON.stringify(A.get('p-khalev')!.facts)).not.toContain('названа и в перечне');
    expect((A.get('p-akhsa')!.facts.find((f) => f.field === 'scripture')!.value as any).key).not.toContain('1Пар 2:49');
  });
  it('«из сыновей»: слова — Писание, уровень ребра — уровень вывода о степени (Лаван — выв., Валтасар — толк.)', () => {
    expect(edge('p-lavan', 'p-nakhor-syn-farry').map((o) => [o.kind, o.cert, o.primary, o.words?.[0].ref])).toEqual([['ancestor', 'inference', false, 'Быт 29:5']]);
    expect(edge('p-valtasar-tsar', 'p-navukhodonosor').map((o) => [o.kind, o.cert, o.primary, o.words?.[0].text])).toEqual([['ancestor', 'interpretation', false, 'Навуходоносор, отец его']]);
    for (const [c, p] of [['p-oziya', 'p-ioram-syn-iosafata'], ['p-azariya-1par6-10', 'p-meraiof']]) expect(edge(c, p)[0].cert).toBe('inference');
  });
  it('Боган назван вне перечня сыновей Рувима', () => {
    expect(edge('p-bogan', 'p-ruvim')[0].outsideLists?.refs).toContain('Быт 46:9');
  });
  it('пропуски Мф 1:8 и Езд 7:3 — с перечнем пропущенных', () => {
    expect(edge('p-oziya', 'p-ioram-syn-iosafata')[0].skipped?.actors).toEqual(['p-okhoziya-syn-iorama', 'p-ioas-syn-okhozii', 'p-amasiya']);
    expect(edge('p-azariya-1par6-10', 'p-meraiof')[0].skipped?.actors).toHaveLength(6);
  });
  it('Седекия: «брат его» (2Пар 36:10) рядом с «дядя» (4Цар 24:17); лица не слиты', () => {
    expect(kin('p-sedekiya', 'p-iekhoniya').map((k) => k.rel).sort()).toEqual(['брат', 'дядя']);
    expect(A.has('p-sedekiya-syn-ioakima')).toBe(true);
  });
  it('Онан и Фамарь — «как деверь»; Кис — «Нер» в подписи по 1Пар 8:33', () => {
    expect(base.unions.find((u) => u.id === 'u-onan--famar')!.terms.map((t) => t.word)).toEqual(['как деверь']);
    expect(base.readings.find((r) => r.id === 'r-father-kis-nir')!.readings[1].label).toMatch(/^Нер \(1Пар 8:33; 9:39\)/);
  });
  it('Адам, Ева, Мелхиседек — «Писание говорит» о родителях; прежних видов stated-absent и not-applicable нет', () => {
    const says = (id: string) => base.nodata.filter((n) => n.actor === id && n.sec === 6 && n.kind === 'scripture-says').map((n) => n.refs);
    expect([says('p-adam'), says('p-eva'), says('p-melkhisedek')]).toEqual([[['Быт 2:7', 'Лк 3:38']], [['Быт 2:22']], [['Евр 7:3']]]);
    expect(parentsOf('p-adam')).toEqual([]);
    expect(base.nodata.filter((n) => n.kind === 'stated-absent' || n.kind === 'not-applicable')).toEqual([]);
  });
});
