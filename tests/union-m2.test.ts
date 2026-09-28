/**
 * Задача M2 (решения владельца 67 и 71): карточка союза в листе карточки и ссылки на неё из § 9 и § 10 карточки лица.
 * Карточка собирается, как в интерфейсе (UnionCard из src/ui/card/Union.tsx), и читается текстом.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { renderToString } from 'preact-render-to-string';
import { h, type VNode } from 'preact';
import { byId, loadCard, models } from '../src/data/atlas.ts';
import { UnionCard, unionAria, unionLinkText, unionSub, unionTitle, kidsInBirthOrder, unionYears, originLinkText } from '../src/ui/card/Union.tsx';
import { unionById, unionsOf, selectUnion, selectedUnion, expanded, startWith } from '../src/ui/reveal.ts';
import { buildSections } from '../src/ui/Folio.tsx';
import { shownYears } from '../src/engine/years.ts';
import { formatAddress, parseAddress, unionField, unionFromField } from '../src/ui/address.ts';

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/⁠/g, '')
    .replace(/\s+([;,.:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+/g, ' ')
    .trim();
const card = (uid: string, from?: string) => {
  const u = unionById(uid);
  if (!u) throw new Error(`нет союза ${uid}`);
  return renderToString(h(UnionCard, { u, from }) as VNode);
};
const text = (uid: string, from?: string) => decode(card(uid, from));
const u = (uid: string) => unionById(uid)!;

describe('заголовок и подписи союза', () => {
  it('«Авраам и Агарь»; второй не назван — одно имя и строка «Мать детей в Писании не названа»', () => {
    expect(unionTitle(u('u:avraam+agar'))).toBe('Авраам и Агарь');
    expect(unionSub(u('u:avraam+agar'))).toBeNull();
    expect(unionTitle(u('u:sif+'))).toBe('Сиф');
    expect(unionSub(u('u:sif+'))).toBe('Мать детей в Писании не названа');
    // «Сиф и мать Еноса» не пишется
    expect(text('u:sif+', 'sif')).not.toMatch(/Сиф и /);
  });
  it('описательное имя безымянного — со строчной в середине: «Иуда и дочь Шуи»', () => {
    expect(unionTitle(u('u:iuda+doch-shui'))).toBe('Иуда и дочь Шуи');
  });
  it('союз иного рода: «Иаков» и строка «Приёмный отец» (Быт 48:5)', () => {
    expect(unionTitle(u('u:iakov+~adoptive'))).toBe('Иаков');
    expect(unionSub(u('u:iakov+~adoptive'))).toBe('Приёмный отец');
  });
  it('имя для диктора склоняется только функцией ru.ts: «Карточка союза Авраама и Агари»; иначе — после двоеточия', () => {
    expect(unionAria(u('u:avraam+agar'))).toBe('Карточка союза Авраама и Агари');
    expect(unionAria(u('u:iakov+rakhil'))).toBe('Карточка союза Иакова и Рахили');
    expect(unionAria(u('u:iakov+~adoptive'))).toBe('Карточка союза Иакова, усыновление');
    // ни одного имени в именительном падеже на месте родительного: «союза Авраам» не бывает
    for (const x of [...unionsOf('david'), ...unionsOf('avraam'), ...unionsOf('iuda')]) {
      const a = unionAria(x);
      expect(a.startsWith('Карточка союза: ') || !a.includes(unionTitle(x)) || unionTitle(x).split(' и ').length === 1).toBe(true);
    }
  });
  it('подписи перечня союзов: второе лицо; без него — дети и помета', () => {
    expect(unionLinkText(u('u:avraam+sarra'), 'avraam')).toBe('Сарра');
    expect(unionLinkText(u('u:david+'), 'david')).toMatch(/^Евеар, Елисуа и ещё \d+ \(мать не названа\)$/);
    expect(unionLinkText(u('u:iakov+~adoptive'), 'iakov')).toBe('Манассия и Ефрем (усыновление)');
    expect(originLinkText(u('u:farra+'))).toBe('Фарра (мать не названа)');
    expect(originLinkText(u('u:isaak+revekka'))).toBe('Исаак и Ревекка');
  });
});

describe('карточка союза (решение 71)', () => {
  beforeAll(async () => {
    await Promise.all(['avraam', 'agar', 'izmail', 'iakov', 'liya', 'sif', 'david', 'mariya', 'iosif-muzh-marii', 'iisus'].map((id) => loadCard(id)));
  });
  it('Авраам и Агарь: паспорт «Союз», «Годы», «Стихи»; супруги, дети, происхождение, команда, колофон', () => {
    const t = text('u:avraam+agar', 'avraam');
    expect(t).toMatch(/^Авраам и Агарь Союз Агарь — жена Авраама/);
    // пояснение составителя — словами Писания, со стихами
    expect(t).toContain('Сара дала её Авраму «в жену» (Быт 16:3)');
    expect(t).toMatch(/Годы сын родился в \d+ г\. до Р\. Х\. расч\./);
    expect(t).toMatch(/Стихи Быт 16:3; 16:15; 25:12/);
    expect(t).toContain('Раскрыть на небе');
    expect(t).toMatch(/Супруги Авраам, 2166–1991 гг\. до Р\. Х\. Его другие союзы: Сарра; Хеттура Агарь, /);
    expect(t).toMatch(/Дети от этого союза Измаил, [^]*Быт 16:15–16/);
    expect(t).toMatch(/Происхождение Авраам — родители: Фарра \(мать не названа\)/);
    expect(t).toMatch(/Союз собран из связей «отец», «мать», «жена», «наложница»; у каждой — стих\./);
    // § 5.6: ни стрелок в тексте, ни точек-разделителей
    expect(t).not.toMatch(/→| · /);
  });
  it('ссылки на другие союзы супругов и союзы происхождения — кнопки с именем карточки союза', () => {
    const html = card('u:avraam+agar', 'avraam');
    expect(html).toContain('data-union="u:avraam+sarra"');
    expect(html).toContain('data-union="u:avraam+khettura"');
    expect(html).toContain('data-union="u:farra+"');
    expect(html).toContain('aria-label="Сарра — карточка союза Авраама и Сарры"');
  });
  it('дети — по порядку рождения в текущей модели; у ребёнка с союзами — «его союзы: N»', () => {
    const x = u('u:iakov+liya');
    const order = kidsInBirthOrder(x);
    const years = order.map((k) => shownYears(models[0].chrono.get(k)!)?.b ?? null).filter((y): y is number => y !== null);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(order.map((k) => byId.get(k)!.name).slice(0, 4)).toEqual(['Рувим', 'Симеон', 'Левий', 'Иуда']);
    const t = text('u:iakov+liya', 'iakov');
    expect(t).toMatch(/Иуда \(сын Иакова\), [^—]*— его союзы: 3/);
  });
  it('ребёнок без года стоит по порядку данных — сразу за тем, кто перед ним', () => {
    const x = { ...u('u:iakov+liya'), kids: ['a', 'b', 'c', 'd'] };
    const ys: Record<string, number | null> = { a: 30, b: null, c: 10, d: 20 };
    expect(kidsInBirthOrder(x, (k) => ys[k])).toEqual(['c', 'd', 'a', 'b']);
  });
  it('годы союза — рождение первого и последнего ребёнка с пометой «расч.»', () => {
    const y = unionYears(u('u:iakov+liya'))!;
    expect(y.text.replace(/\u2060/g, '').replace(/\u00a0/g, ' ')).toMatch(/^дети родились (ок\. )?\d+–\d+ гг\. до Р\. Х\.$/);
    expect(unionYears(u('u:david+melkhola'))).toBeNull();
    expect(text('u:david+melkhola', 'david')).toContain('Дети от этого союза в Писании не названы.');
  });
  it('Иосиф и Мария: брак и законное отцовство (Мф 1:16); у Иисуса Христа — «зачат от Духа Святаго»', () => {
    const t = text('u:iosif-muzh-marii+mariya', 'mariya');
    expect(t).toMatch(/Союз Мария — жена Иосифа Иосиф — законный отец Мф 1:16/);
    expect(t).toMatch(/Иисус Христос, [^]*зачат от Духа Святаго Мф 1:18; 1:20; Лк 1:35/);
    // происхождение Марии от Илия — толкование (Лк 3:23), с пометой
    expect(t).toMatch(/Мария — родители: Илий \(мать не названа\) толк\./);
  });
  it('Сиф: мать не названа — строка под именем, ничего не выдумано', () => {
    const t = text('u:sif+', 'sif');
    expect(t).toMatch(/^Сиф Мать детей в Писании не названа Союз отец детей/);
    expect(t).not.toMatch(/реконструкц|образ матери/i);
  });
  it('команда «Раскрыть на небе» ↔ «Свернуть на небе» — по состоянию союза', () => {
    startWith('adam');
    const uid = unionsOf('adam')[0].id;
    expect(text(uid, 'adam')).toContain('Раскрыть на небе');
    expanded.value = { ...expanded.value, [uid]: 'adam' };
    expect(text(uid, 'adam')).toContain('Свернуть на небе');
    startWith('adam');
  });
  it('selectUnion: открывает только существующий союз, null — закрывает', () => {
    selectUnion('u:avraam+agar');
    expect(selectedUnion.value).toBe('u:avraam+agar');
    selectUnion('u:нет+такого');
    expect(selectedUnion.value).toBeNull();
  });
});

describe('адрес карточки союза: «#/avraam~uavraam.agar»', () => {
  it('поле «u» — только буквы, цифры, «-» и точки; туда и обратно — тот же союз, у всех союзов атласа', () => {
    const all = [...new Set(['adam', 'avraam', 'iakov', 'david', 'iuda', 'mariya', 'moisey', 'aaron'].flatMap((id) => [...unionsOf(id)]))];
    for (const x of all) {
      const f = unionField(x.id);
      expect(f, x.id).toMatch(/^[a-z0-9.-]+$/);
      expect(unionFromField(f!)).toBe(x.id);
    }
    expect(unionField('u:avraam+agar')).toBe('avraam.agar');
    expect(unionField('u:sif+')).toBe('sif.');
    expect(unionField('u:iakov+~adoptive')).toBe('iakov..adoptive');
  });
  it('разбор и запись: союз — при лице; без лица поля нет', () => {
    const has = (id: string) => byId.has(id);
    expect(parseAddress('#/avraam~uavraam.agar', has).union).toBe('u:avraam+agar');
    expect(parseAddress('#/iakov~y-1900~w80~l0.0~uiakov..adoptive', has).union).toBe('u:iakov+~adoptive');
    expect(parseAddress('#/avraam~u..', has).union).toBeUndefined();
    expect(formatAddress({ id: 'avraam', union: 'u:avraam+agar' })).toBe('#/avraam~uavraam.agar');
    expect(formatAddress({ id: null, union: 'u:avraam+agar' })).toBe('#/');
  });
});

describe('карточка лица ведёт к союзам (§ 9 и § 10)', () => {
  const sec = async (id: string, n: number) => {
    const data = await loadCard(id);
    const m = models[0];
    const s = buildSections(id, byId.get(id)!, data?.card ?? null, m, m.chrono.get(id), '', data?.chrono ?? null);
    return renderToString(h('div', null, s.get(n) as never) as VNode);
  };
  it('§ 9 Авраама: у каждой жены — «союз» с именем карточки союза', async () => {
    const html = await sec('avraam', 9);
    for (const [uid, label] of [
      ['u:avraam+sarra', 'Карточка союза Авраама и Сарры'],
      ['u:avraam+agar', 'Карточка союза Авраама и Агари'],
      ['u:avraam+khettura', 'Карточка союза Авраама и Хеттуры'],
    ])
      expect(html).toContain(`data-union="${uid}" aria-label="${label}">союз</button>`);
  });
  it('§ 10 Авраама: у каждой группы детей по матери — ссылка на союз', async () => {
    const html = await sec('avraam', 10);
    for (const uid of ['u:avraam+sarra', 'u:avraam+agar', 'u:avraam+khettura']) expect(html).toContain(`data-union="${uid}"`);
  });
  it('§ 10 Давида: сыновья по одному от матери — «(от Эглы, союз)»; дети без названной матери — свой союз', async () => {
    const html = await sec('david', 10);
    const t = decode(html);
    expect(t).toMatch(/Иефераам \(от Эглы, союз\)/);
    expect(html).toContain('data-union="u:david+"');
    expect(html).toContain('data-union="u:david+virsaviya"');
  });
  it('§ 10 матери: у Марии — союз с Иосифом; § 9 жены — тот же союз', async () => {
    expect(await sec('mariya', 10)).toContain('data-union="u:iosif-muzh-marii+mariya"');
    expect(await sec('mariya', 9)).toContain('data-union="u:iosif-muzh-marii+mariya"');
    expect(await sec('iosif-muzh-marii', 10)).toContain('data-union="u:iosif-muzh-marii+mariya"');
  });
});
