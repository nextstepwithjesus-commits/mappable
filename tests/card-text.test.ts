/**
 * Текст карточки по всем лицам: голые числа, грамматика, согласование с полом, родство от лица владельца (A1–A4, A11).
 * Карточки собираются так же, как в интерфейсе (buildSections), и читаются как текст по разделам.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { cardSections, allIds, byId } from './helpers/cards.ts';
import { graph, models, persons } from '../src/data/atlas.ts';
import { siblings } from '../src/engine/graph.ts';
import { familyIds, contemporaryGroups } from '../src/ui/Folio.tsx';
import {
  nameCase, realmGenitive, kinTermIns, kinTermReverse, renamedDirection, otherChildLabel, otherParentLabel, reignTitle, KIN_TERMS, splitKinTerm,
} from '../src/ui/text/ru.ts';

/** Текст раздела без пробелов перед знаками препинания (теги при разборе заменяются пробелами). */
const norm = (s: string) => s.replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();

const cards = new Map<string, Map<number, string>>();
const sec = (id: string, n: number) => cards.get(id)?.get(n) ?? '';
const nameOf = (id: string) => byId.get(id)!.name;

beforeAll(async () => {
  for (const id of allIds) {
    const s = await cardSections(id);
    const m = new Map<number, string>();
    for (const [n, t] of s) m.set(n, norm(t));
    cards.set(id, m);
  }
}, 300_000);

describe('ru: склонение и словари', () => {
  test('имена в косвенных падежах', () => {
    expect(nameCase('Амрам', 'm', 'dat')).toBe('Амраму');
    expect(nameCase('Илий', 'm', 'dat')).toBe('Илию');
    expect(nameCase('Мардохей', 'm', 'dat')).toBe('Мардохею');
    expect(nameCase('Израиль', 'm', 'gen')).toBe('Израиля');
    expect(nameCase('Иуда', 'm', 'gen')).toBe('Иуды');
    expect(nameCase('Иуда', 'm', 'dat')).toBe('Иуде');
    expect(nameCase('Илия', 'm', 'gen')).toBe('Илии');
    expect(nameCase('Павел', 'm', 'dat')).toBe('Павлу');
    expect(nameCase('Пётр', 'm', 'gen')).toBe('Петра');
    expect(nameCase('Иисус Христос', 'm', 'gen')).toBe('Иисуса Христа');
    expect(nameCase('Иисус Навин', 'm', 'ins')).toBe('Иисусом Навиным');
    expect(nameCase('Мария', 'f', 'ins')).toBe('Марией');
    expect(nameCase('Ревекка', 'f', 'gen')).toBe('Ревекки');
    expect(nameCase('Мааха', 'f', 'ins')).toBe('Маахой');
    expect(nameCase('Рахиль', 'f', 'gen')).toBe('Рахили');
    expect(nameCase('Руфь', 'f', 'ins')).toBe('Руфью');
    expect(nameCase('Мириам', 'f', 'gen')).toBe('Мириам');
    // ненадёжное склонение — null, строка строится с именем в именительном падеже
    expect(nameCase('Ави', 'f', 'gen')).toBe('Ави');
    expect(nameCase('Церуа', 'f', 'gen')).toBe('Церуа');
    // безымянные: склоняется главное слово описания, со строчной
    expect(nameCase('Жена Лота', 'f', 'gen', true)).toBe('жены Лота');
    expect(nameCase('Мать сыновей Зеведеевых', 'f', 'dat', true)).toBe('матери сыновей Зеведеевых');
    expect(nameCase('Тёща Симона', 'f', 'ins', true)).toBe('тёщей Симона');
    expect(nameCase('Дочь фараонова', 'f', 'gen', true)).toBeNull();
    expect(nameCase('Старшая дочь Лота', 'f', 'gen', true)).toBeNull();
    expect(nameCase('Семь сынов Скевы', 'm', 'gen', true)).toBeNull();
    expect(nameCase('Бен-Амми', 'm', 'dat')).toBeNull();
    expect(nameCase('Жена-Ефиоплянка Моисея', 'f', 'gen')).toBeNull();
  });

  test('названия царств в родительном падеже — для всех царствований в данных', () => {
    expect(realmGenitive('Иудея (в Хевроне)')).toBe('Иудеи, в Хевроне');
    expect(realmGenitive('весь Израиль')).toBe('всего Израиля');
    expect(realmGenitive('Сихем и Израиль')).toBe('Сихема и Израиля');
    expect(realmGenitive('Вавилон')).toBe('Вавилона');
    for (const p of persons) for (const r of p.reign) expect(realmGenitive(r.over), r.over).not.toBeNull();
    expect(reignTitle('Иудея', 'f')).toBe('Царица Иудеи');
  });

  test('каждый термин родства из данных есть в словаре (творительный падеж и обратный термин)', () => {
    const missing = new Set<string>();
    for (const p of persons)
      for (const k of p.kin) {
        const { term } = splitKinTerm(k.rel);
        if (/^(брат|сестра)$/.test(term) || term.startsWith('из ')) continue; // братья — § 11; «из рода…» — не существительное
        if (!kinTermIns(k.rel)) missing.add(k.rel);
      }
    expect([...missing]).toEqual([]);
    expect(kinTermIns('зять (по толкованию Лк 3:23)')).toBe('зятем (по толкованию Лк 3:23)');
    expect(kinTermReverse('тётка', 'm')).toBe('племянник');
    expect(kinTermReverse('зять', 'm')).toBe('тесть');
    expect(Object.keys(KIN_TERMS).length).toBeGreaterThan(15);
  });

  test('иные родители и дети по иным указаниям — в обе стороны', () => {
    expect(otherParentLabel('adoptive', 'mother')).toBe('Приёмная мать');
    expect(otherParentLabel('adoptive', 'father')).toBe('Приёмный отец');
    expect(otherChildLabel('ancestor', ['m'])).toBe('Потомок, названный без промежуточных звеньев');
    expect(otherChildLabel('adoptive', ['m', 'm'])).toBe('Приёмные сыновья');
    expect(otherChildLabel('adoptive', ['f'])).toBe('Приёмная дочь');
    expect(otherChildLabel('by-luke', ['m'])).toBe('Сын по родословию Луки');
  });

  test('прежнее и новое имя — для всех переименований в данных', async () => {
    const expected: Record<string, 'former' | 'new'> = {
      avraam: 'former', sarra: 'former', iakov: 'new', veniamin: 'former', noemin: 'new', 'iisus-navin': 'former', gedeon: 'new',
      'ioakim-tsar': 'former', sedekiya: 'former', 'paskhor-syn-emmera': 'new', daniil: 'new', 'ananiya-sedrakh': 'new',
      'misail-misakh': 'new', 'azariya-avdenago': 'new', petr: 'former', varnava: 'former',
    };
    const { loadCard } = await import('../src/data/atlas.ts');
    const seen: string[] = [];
    for (const p of persons) {
      const c = (await loadCard(p.id))?.card;
      for (const a of c?.altNames ?? []) {
        if (a.kind !== 'renamed') continue;
        seen.push(p.id);
        expect(renamedDirection(a.note, p.name), `${p.id}: ${a.name}`).toBe(expected[p.id]);
      }
    }
    expect(seen.sort()).toEqual(Object.keys(expected).sort());
  });
});

describe('карточки всех лиц', () => {
  test('ни в одном разделе нет голых чисел', () => {
    const bad: string[] = [];
    for (const [id, s] of cards)
      for (const [n, t] of s) if (/^[\d\s.,;:]*$/.test(t) || /(^|[\s.:;,])0(?=$|[\s.;,])/.test(t)) bad.push(`${id} § ${n}: «${t.slice(0, 40)}»`);
    expect(bad.slice(0, 10), `${bad.length} разделов`).toEqual([]);
  });

  test('нет «Встреча с», «Царствовал над», «Приёмный: мать»', () => {
    const bad: string[] = [];
    for (const [id, s] of cards)
      for (const [n, t] of s) {
        if (/Встреча с/.test(t)) bad.push(`${id} § ${n}: Встреча с`);
        if (/Царствовал(?![а-яё])/.test(t) && n === 16) bad.push(`${id} § ${n}: Царствовал`);
        if (/(Приёмный|Законный|Предок|По Луке|По другому месту Писания|По закону ужичества|Иное указание): (отец|мать)/.test(t)) bad.push(`${id} § ${n}: вид родителя отдельно от слова «отец/мать»`);
        if (n === 10 && /\((предок|приёмный|законный|по луке|по другому месту писания|по закону ужичества)\)/i.test(t)) bad.push(`${id} § ${n}: вид связи ребёнка в скобках`);
      }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('царствование согласовано с полом и названо по-русски', () => {
    const bad: string[] = [];
    for (const p of persons) {
      if (!p.reign.length) continue;
      const t = sec(p.id, 16);
      for (const r of p.reign) {
        const title = reignTitle(r.over, p.sex)!;
        if (!t.includes(title)) bad.push(`${p.id}: нет «${title}»`);
      }
      if (p.sex === 'f' && /(^|\s)Царь |воцарился/.test(t)) bad.push(`${p.id}: мужская форма`);
      if (p.sex === 'm' && /Царица |воцарилась/.test(t)) bad.push(`${p.id}: женская форма`);
    }
    expect(bad).toEqual([]);
  });

  test('у женщин нет мужских форм в строках интерфейса (§ 1, 9, 12, 14, 16)', () => {
    const bad: string[] = [];
    for (const p of persons) {
      if (p.sex !== 'f') continue;
      if (/назван «отцом»/.test(sec(p.id, 1))) bad.push(`${p.id} § 1`);
      for (const s of graph.spousesOf.get(p.id) ?? []) {
        if (s.b !== p.id) continue; // она — жена или наложница в этой связи
        const t = sec(p.id, 9);
        const husband = nameOf(s.a);
        if (t.includes(`${husband} — жена`) || t.includes(`${husband} — наложница`)) bad.push(`${p.id} § 9: ${husband}`);
        if (!t.includes(`${husband} — муж`)) bad.push(`${p.id} § 9: нет «${husband} — муж»`);
      }
      if (/своему мужу/.test(sec(p.id, 12)) && !(graph.spousesOf.get(p.id) ?? []).length) bad.push(`${p.id} § 12`);
      if (/(^|\s)Царь |воцарился|Царствовал(?![а-яё])/.test(sec(p.id, 16))) bad.push(`${p.id} § 16`);
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('родство в § 12 — от лица владельца карточки', () => {
    const bad: string[] = [];
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    for (const p of persons)
      for (const k of p.kin) {
        if (/^(брат|сестра)(?![а-яё])/i.test(k.rel)) continue; // братья и сёстры — § 11
        const other = byId.get(k.id);
        if (!other) continue;
        const mine = sec(p.id, 12);
        // термин описывает владельца, а не второе лицо: не «Тётка: Амрам»
        if (mine.includes(`${cap(k.rel)}: ${other.name}`)) bad.push(`${p.id}: «${cap(k.rel)}: ${other.name}»`);
        const dat = kinTermIns(splitKinTerm(k.rel).term) ? nameCase(other.name, other.sex, 'dat', other.unnamed) : null;
        if (!mine.includes(dat ?? other.name)) bad.push(`${p.id}: нет ${dat ?? other.name}`);
        // у второго лица — «Иохаведа — тётка»
        if (!sec(k.id, 12).includes(`${p.name} — ${k.rel}`)) bad.push(`${k.id}: нет «${p.name} — ${k.rel}»`);
      }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('при законном отцовстве группа «от …» не строится', () => {
    const legal = persons.filter((p) => p.fatherKind === 'legal');
    expect(legal.length).toBeGreaterThan(0);
    for (const c of legal) {
      const f = byId.get(c.father!)!;
      const m = c.mother ? byId.get(c.mother)! : null;
      const tf = sec(f.id, 10);
      expect(tf).toContain(`${c.sex === 'f' ? 'Законная дочь' : 'Законный сын'}: ${c.name}`);
      if (m) {
        expect(tf).not.toContain(`от ${nameCase(m.name, m.sex, 'gen')}`);
        expect(sec(m.id, 10)).not.toContain(`от ${nameCase(f.name, f.sex, 'gen')}`);
      }
    }
  });

  test('§ 14: встречи с именем в начале строки, современники без повторов, одноимённые различены', () => {
    const m = models[0];
    const bad: string[] = [];
    const namesakes = new Map<string, number>();
    for (const p of persons) namesakes.set(p.name, (namesakes.get(p.name) ?? 0) + 1);
    for (const p of persons) {
      const t = sec(p.id, 14);
      if (/\(вероятно\)/.test(t)) bad.push(`${p.id}: «(вероятно)» при имени`);
      if ((t.match(/Вероятно/g) ?? []).length > 1) bad.push(`${p.id}: «Вероятно» не один раз`);
      const c = m.chrono.get(p.id);
      if (!c || c.cls === 'epochal') continue; // у лиц без дат современников по расчёту нет
      const fam = familyIds(p.id);
      const groups = contemporaryGroups(p.id, m, fam, new Set());
      const ids = groups.flatMap((g) => g.ids);
      if (new Set(ids).size !== ids.length) bad.push(`${p.id}: повтор в современниках`);
      for (const x of ids) {
        if (fam.has(x)) bad.push(`${p.id}: ${x} из семьи среди современников`);
        const q = byId.get(x)!;
        const shown = `${q.unnamed ? q.name.charAt(0).toLowerCase() + q.name.slice(1) : q.name} (${q.disambig.replace(/\s*\(([^)]*)\)/g, ', $1')})`;
        if ((namesakes.get(q.name) ?? 0) > 1 && q.disambig && !t.includes(norm(shown))) bad.push(`${p.id}: ${x} без уточнения`);
      }
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('встречи не повторяются среди современников', async () => {
    const { loadCard } = await import('../src/data/atlas.ts');
    const m = models[0];
    const bad: string[] = [];
    for (const p of persons) {
      const met = (await loadCard(p.id))?.card?.met ?? [];
      if (!met.length || !m.chrono.get(p.id)) continue;
      const metIds = new Set(met.map((x) => x.id));
      const ids = contemporaryGroups(p.id, m, familyIds(p.id), metIds).flatMap((g) => g.ids);
      for (const x of ids) if (metIds.has(x)) bad.push(`${p.id}: ${x}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('карточки из экспертизы CARD', () => {
  test('Мария § 10 и Иосиф § 10: законное отцовство (A1)', () => {
    const m10 = sec('mariya', 10);
    expect(m10).toContain('Сын: Иисус Христос — зачат от Духа Святаго Мф 1:18; 1:20; Лк 1:35');
    expect(m10).not.toMatch(/от Иосифа/);
    const j10 = sec('iosif-muzh-marii', 10);
    expect(j10).toContain('Законный сын: Иисус Христос, рождённый Марией Мф 1:16');
    expect(j10).not.toMatch(/от Марии/);
  });

  test('§ 12: Иохаведа, Есфирь, Иосиф — термин относится к владельцу (A3)', () => {
    expect(sec('iokhaveda', 12)).toContain('Приходится тёткой Амраму, своему мужу Исх 6:20');
    expect(sec('iokhaveda', 12)).not.toContain('Тётка: Амрам');
    expect(sec('amram', 12)).toContain('Иохаведа — тётка');
    expect(sec('esfir', 12)).toContain('Приходится дочерью дяди Мардохею Есф 2:7; 2:15');
    expect(sec('esfir', 12)).not.toContain('Дочь дяди: Мардохей');
    expect(sec('iosif-muzh-marii', 12)).toContain('Приходится зятем Илию (по толкованию Лк 3:23)');
  });

  test('§ 9: Мааха, наложница Халева (A3)', () => {
    const t = sec('maakha-nalozhnitsa-khaleva', 9);
    expect(t).toContain('Халев — муж; она названа его наложницей 1 Пар 2:48');
    expect(t).not.toContain('Халев — наложница');
    expect(sec('khalev-syn-esroma', 9)).toContain('Мааха — наложница');
  });

  test('§ 10 Давида: Исмаил — потомок, а не предок (A3)', () => {
    const t = sec('david', 10);
    expect(t).toContain('Потомок, названный без промежуточных звеньев: Исмаил');
    expect(t).not.toContain('(предок)');
  });

  test('§ 4 Авраама: Аврам — прежнее имя (A3)', () => {
    const t = sec('avraam', 4);
    expect(t).toContain('Аврам — прежнее имя');
    expect(t).not.toContain('Аврам — новое имя');
    expect(sec('iakov', 4)).toContain('Израиль — новое имя');
  });

  test('§ 6: приёмные родители Моисея и Есфири (A2)', () => {
    expect(sec('moisey', 6)).toContain('Приёмная мать: дочь фараонова Исх 2:10');
    expect(sec('esfir', 6)).toContain('Приёмный отец: Мардохей Есф 2:7');
  });

  test('§ 14 и § 16 Давида (A2, A11)', () => {
    const t14 = sec('david', 14);
    expect(t14).toContain('Встречи, о которых говорит Писание');
    expect(t14).toContain('Самуил (пророк и судья) — помазан Самуилом');
    expect(t14).not.toMatch(/Встреча с/);
    const t16 = sec('david', 16);
    expect(t16).toContain('Царь Иудеи, в Хевроне: воцарился в 30 лет');
    expect(t16).toContain('Царь всего Израиля');
    expect(t16).not.toMatch(/Царствовал/);
    expect(sec('gofoliya', 16)).toContain('Царица Иудеи');
  });

  test('§ 16 без «0» у Руфи и Марии (A4)', () => {
    expect(cards.get('ruf')!.has(16)).toBe(false);
    expect(cards.get('mariya')!.has(16)).toBe(false);
  });

  test('§ 14 Мелхиседека: встреча с Аврамом показана и у лица без дат', () => {
    expect(sec('melkhisedek', 14)).toContain('Авраам — встретил Аврама');
  });

  test('братья и сёстры не попадают в «Современники» Давида', () => {
    const sibs = siblings(graph, 'david').map((s) => s.id);
    const ids = contemporaryGroups('david', models[0], familyIds('david'), new Set()).flatMap((g) => g.ids);
    for (const s of sibs) expect(ids).not.toContain(s);
  });
});
