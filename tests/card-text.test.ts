/**
 * Текст карточки по всем лицам: голые числа, грамматика, согласование с полом, родство от лица владельца (A1–A4, A11).
 * Карточки собираются так же, как в интерфейсе (buildSections), и читаются как текст по разделам.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { cardSections, allIds, byId } from './helpers/cards.ts';
import { graph, models, persons } from '../src/data/atlas.ts';
import { siblings } from '../src/engine/graph.ts';
import { familyIds, contemporaryGroups } from '../src/ui/Folio.tsx';
import { section14, visible14 } from '../src/ui/card/sections.tsx';
import { stemsOf } from '../src/ui/text/repeat.ts';

/** Слова встречи повторяют уточнение (как в карточке, CARD-06). */
const saysSame = (text: string, dis: string) => {
  const a = stemsOf(text);
  const b = new Set(stemsOf(dis));
  return a.length > 0 && a.filter((w) => b.has(w)).length / a.length >= 0.5;
};
import { typo } from '../src/ui/text/typo.ts';
import {
  nameCase, realmGenitive, kinTermIns, kinTermReverse, renamedDirection, otherChildLabel, otherParentLabel, reignTitle, KIN_TERMS, splitKinTerm,
} from '../src/ui/text/ru.ts';

/** Текст раздела без пробелов перед знаками препинания (теги при разборе заменяются пробелами). */
const norm = (s: string) => s.replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();

const cards = new Map<string, Map<number, string>>();
const sec = (id: string, n: number) => cards.get(id)?.get(n) ?? '';
const nameOf = (id: string) => byId.get(id)!.name;

beforeAll(async () => {
  // все тома загружены, как в интерфейсе после подгрузки томов § 14 (встречи, записанные в чужих карточках): иначе
  // «Встречи и связи» зависели бы от порядка, в котором тест собирает карточки
  const { loadCard } = await import('../src/data/atlas.ts');
  await Promise.all(allIds.map((id) => loadCard(id)));
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
        // тёзка в карточке — с уточнением (решение 106): «Иорам (сын Иосафата, царь Иудейский) — муж»
        if (!t.includes(`${husband} — муж`) && !new RegExp(`${husband.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\([^)]*\\) — муж`).test(t)) bad.push(`${p.id} § 9: нет «${husband} — муж»`);
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
        // свойство (зять, невестка…) — строкой «Иуда — свёкор» (CARD-91); остальное — «Приходится тёткой Амраму»
        const term = splitKinTerm(k.rel).term;
        const rev = /^(зять|невестка|сноха|тесть|тёща|свёкор|свекровь)$/.test(term) ? kinTermReverse(term, other.sex) : null;
        if (rev) {
          if (!mine.includes(`${other.name} — ${rev}`) && !mine.includes(`${other.name} (`)) bad.push(`${p.id}: нет «${other.name} — ${rev}»`);
          continue;
        }
        // термин прямого родства, расходящийся с родословием (решение 106): «Мааха — названа «матерью» …; по родословию —
        // бабка», у неё — «Названа «матерью» Асы …; по родословию — бабка»
        if (/по родословию — /.test(mine) && /назван[а]? «/i.test(mine) && /по родословию — /.test(sec(k.id, 12))) continue;
        const dat = kinTermIns(term) ? nameCase(other.name, other.sex, 'dat', other.unnamed) : null;
        if (!mine.includes(dat ?? other.name)) bad.push(`${p.id}: нет ${dat ?? other.name}`);
        // у второго лица — «Иохаведа — тётка»; тёзка в карточке — с уточнением: «Кеназ (…) — младший брат»
        const withDis = new RegExp(`${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\([^)]*\\))? — ${k.rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        if (!withDis.test(sec(k.id, 12))) bad.push(`${k.id}: нет «${p.name} — ${k.rel}»`);
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

  test('§ 14: встречи с именем в начале строки, современники без повторов, одноимённые различены', async () => {
    const { loadCard } = await import('../src/data/atlas.ts');
    const m = models[0];
    const bad: string[] = [];
    const namesakes = new Map<string, number>();
    for (const p of persons) namesakes.set(p.name, (namesakes.get(p.name) ?? 0) + 1);
    const disOf = (x: string) => typo(byId.get(x)!.disambig.replace(/\s*\(([^)]*)\)/g, ', $1')).replace(/\u2060/g, '');
    for (const p of persons) {
      const t = sec(p.id, 14);
      if (/\(вероятно\)/.test(t)) bad.push(`${p.id}: «(вероятно)» при имени`);
      if ((t.match(/Вероятно/g) ?? []).length > 1) bad.push(`${p.id}: «Вероятно» не один раз`);
      // лицо встречи с одноимёнными — с уточнением и тогда, когда его имя стоит в самом тексте встречи (F7)
      const card = (await loadCard(p.id))?.card ?? null;
      const met = card?.met ?? [];
      // встреча выводится со словами события (CARD-80); уточнение не нужно, если слова встречи его повторяют (CARD-06)
      for (const mt of met) {
        const q = byId.get(mt.id)!;
        if (!mt.text?.trim() || familyIds(p.id).has(mt.id) || saysSame(mt.text, q.disambig)) continue;
        // уточнение — «(…)», у имени в начале строки ещё и годы: «(…; 874–853)» (решение 100)
        if ((namesakes.get(q.name) ?? 0) > 1 && q.disambig && !t.includes(norm(`(${disOf(mt.id)})`)) && !t.includes(norm(`(${disOf(mt.id)};`))) bad.push(`${p.id}: встреча с ${mt.id} без уточнения`);
      }
      const c = m.chrono.get(p.id);
      if (!c || c.cls === 'epochal') continue; // у лиц без дат современников по расчёту нет
      const fam = familyIds(p.id);
      // как в карточке: лица встреч названы выше и среди современников не повторяются
      const groups = contemporaryGroups(p.id, m, fam, new Set(met.map((x) => x.id)));
      const ids = groups.flatMap((g) => g.ids);
      if (new Set(ids).size !== ids.length) bad.push(`${p.id}: повтор в современниках`);
      for (const x of ids) if (fam.has(x)) bad.push(`${p.id}: ${x} из семьи среди современников`);
      // видимые без «ещё N» лица расчётного списка и родни — одноимённые с уточнением
      const d = section14(p.id, m, card);
      for (const x of d ? visible14(d) : []) {
        if (fam.has(x)) bad.push(`${p.id}: ${x} из семьи среди современников`);
        const q = byId.get(x)!;
        // уточнение набрано той же типографикой, что вся карточка («Мф 1:15-16» → «Мф 1:15–16»); U+2060 в тексте проверок нет
        const shown = `${q.unnamed ? q.name.charAt(0).toLowerCase() + q.name.slice(1) : q.name} (${typo(q.disambig.replace(/\s*\(([^)]*)\)/g, ', $1')).replace(/\u2060/g, '')})`;
        // у имени — годы (решение 100): «Енох (сын Иареда; …)»
        if ((namesakes.get(q.name) ?? 0) > 1 && q.disambig && !t.includes(norm(shown)) && !t.includes(norm(`${shown.slice(0, -1)};`))) bad.push(`${p.id}: ${x} без уточнения`);
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
    // не «Приходится дочерью дяди Мардохею» (этап 1, оставлено на этап 5): родство словом, термин Писания — после двоеточия
    expect(sec('esfir', 12)).toContain('Приходится двоюродной сестрой Мардохею: дочь его дяди Абихаила Есф 2:7; 2:15');
    expect(sec('esfir', 12)).not.toContain('дочерью дяди');
    expect(sec('esfir', 12)).not.toContain('Дочь дяди: Мардохей');
    // свойство — формой «Имя — кем приходится» (CARD-91): зять Илия — у Иосифа «Илий — тесть»
    expect(sec('iosif-muzh-marii', 12)).toContain('Илий — тесть (по толкованию Лк 3:23)');
  });

  test('§ 9: Мааха, наложница Халева (A3)', () => {
    const t = sec('maakha-nalozhnitsa-khaleva', 9);
    expect(t).toContain('Халев — муж; она названа его наложницей 1 Пар 2:48');
    expect(t).not.toContain('Халев — наложница');
    // у мужа трёх и больше жён — первой строкой «Жёны: …; наложницы: …» (CARD-93)
    expect(sec('khalev-syn-esroma', 9)).toMatch(/наложницы: [^.]*Мааха/);
  });

  test('§ 10 Давида: Исмаил — потомок, а не предок (A3)', () => {
    const t = sec('david', 10);
    // «из племени царского» (4 Цар 25:25) и «из сыновей Давида Хаттуш» (Езд 8:2; этап 11, DF1) — потомки без звеньев
    // этап 19 (К-01): строки по достоверности — у Исмаила «выв.» (4 Цар 25:25), Хаттуш назван прямо (Езд 8:2); прежде общая
    // строка теряла помету у обоих
    expect(t).toMatch(/Потомок, названный без промежуточных звеньев: Исмаил \(сын Нафании[^)]*\) 4 Цар 25:25; Иер 41:1 выв\./);
    expect(t).toMatch(/Потомок, названный без промежуточных звеньев: Хаттуш \(из сыновей Давида/);
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

  test('§ 14 и § 16 Давида (A2, A11, F7)', () => {
    const t14 = sec('david', 14);
    // решение 19 (CARD-55): встречи из своей и чужих карточек одной группой
    expect(t14).toContain('Встречи и связи, о которых говорит Писание');
    // племянник — вторая степень, в § 12 (решение 62); в § 14 его нет ни в «Родне», ни среди «Других»
    expect(sec('david', 12)).toMatch(/Племянники: Иоав, Авесса и Асаил — сыновья сестры Саруии/);
    expect(t14).not.toMatch(/Иоав/);
    expect(t14).toContain('Кто ещё жил в это время (расчёт)');
    // имя лица встречи — в самом тексте, а не «Самуил — помазан Самуилом» (F7)
    expect(t14).toContain('Помазан Самуилом (пророк и судья); бежал к нему в Раму');
    expect(t14).not.toContain('Самуил (пророк и судья) — помазан Самуилом');
    // у имени — годы (этап 13, решение 100): «Саул (царь Израиля, сын Киса; род. между … ум. 1010) — служил при нём»
    expect(t14).toMatch(/Саул \(царь Израиля, сын Киса; [^)]*\) — служил при нём/);
    expect(t14).not.toMatch(/Саул \(царь Израиля, сын Киса\) — /);
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
    // не «Авраам — встретил Аврама» (F7): прежнее имя Аврам — ссылка на Авраама в самом тексте
    expect(sec('melkhisedek', 14)).toContain('Встретил Аврама, возвращавшегося после поражения царей Быт 14:18–20');
    expect(sec('melkhisedek', 14)).not.toContain('Авраам — встретил');
  });

  test('братья и сёстры не попадают в «Современники» Давида', () => {
    const sibs = siblings(graph, 'david').map((s) => s.id);
    const ids = contemporaryGroups('david', models[0], familyIds('david'), new Set()).flatMap((g) => g.ids);
    for (const s of sibs) expect(ids).not.toContain(s);
  });
});

describe('остатки этапа 1: типографика и подписи (B4, B5)', () => {
  test('нет двойной точки после года: «ок. 6 г. до Р. Х. Ангел…», не «Х..» (Мария § 17)', () => {
    // первая строка § 17 — подзаголовок части рассказа (CARD-58), затем событие с годом без второй точки
    // подзаголовков-ссылок («Лк 1») больше нет (решение 63): § 17 начинается с события
    // первым — оглавление периодов (решение 63), затем подзаголовок периода и событие
    expect(sec('mariya', 17)).toMatch(/^По периодам: Благовещение \(5\);[^]*Благовещение ок\. 6 г\. до Р\. Х\. Ангел Гавриил/);
    const bad: string[] = [];
    for (const [id, s] of cards) for (const [n, t] of s) if (/\.\./.test(t)) bad.push(`${id} § ${n}`);
    expect(bad.slice(0, 10), `${bad.length} разделов`).toEqual([]);
  });

  test('оценка словом, а не знаком «~»: «примерно через 55 лет после отца»', () => {
    // этап 13, решение 100: у Авиуда формулы больше нет (сжатое родословие) — оценка словом в формуле Марии
    expect(sec('mariya', 13)).toMatch(/Родилась примерно за \d+ лет до Сына, Иисуса Христа\./);
    const bad: string[] = [];
    for (const [id, s] of cards) for (const [n, t] of s) if (t.includes('~')) bad.push(`${id} § ${n}`);
    expect(bad.slice(0, 10), `${bad.length} разделов`).toEqual([]);
  });

  test('§ 9–12: родственник с именем владельца или другого родственника назван с уточнением', () => {
    // братья и сёстры группой с подписью (CARD-84): «Сестра: Мария (Клеопова) Ин 19:25»
    expect(sec('mariya', 11)).toContain('Сестра: Мария (Клеопова) Ин 19:25');
    expect(sec('mariya-kleopova', 11)).toContain('Сестра: Мария (Мать Иисуса)');
    expect(sec('david', 10)).toContain('Фамарь (дочь Давида, сестра Авессалома)');
    // внуки — при родителях (F6), в порядке перечня (решение 104); Мааха — тёзка жены Давида, с уточнением (решение 106)
    expect(sec('david', 10)).toContain('от Авессалома — Фамарь (дочь Авессалома), Мааха (дочь Авессалома, жена Ровоама, мать Авии)');
    const shown = (x: string) => norm(`${nameOf(x)} (${typo(byId.get(x)!.disambig.replace(/\s*\(([^)]*)\)/g, ', $1')).replace(/\u2060/g, '')})`);
    const bad: string[] = [];
    for (const p of persons) {
      const rel: [number, string[]][] = [
        [9, (graph.spousesOf.get(p.id) ?? []).map((s) => (s.a === p.id ? s.b : s.a))],
        [11, [...siblings(graph, p.id).map((s) => s.id), ...(graph.kinOf.get(p.id) ?? []).filter((k) => /^(брат|сестра)/i.test(k.rel)).map((k) => (k.from === p.id ? k.to : k.from))]],
        [12, (graph.kinOf.get(p.id) ?? []).filter((k) => !/^(брат|сестра)/i.test(k.rel)).map((k) => (k.from === p.id ? k.to : k.from))],
      ];
      for (const [n, ids] of rel)
        for (const x of new Set(ids)) {
          const q = byId.get(x);
          if (!q?.disambig || q.unnamed) continue;
          const clash = q.name === p.name || ids.some((y) => y !== x && byId.get(y)?.name === q.name);
          if (clash && !sec(p.id, n).includes(shown(x))) bad.push(`${p.id} § ${n}: ${x} без уточнения`);
        }
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('§ 10: народы с именем во множественном числе — без «сын» и «внук» (Мицраим, Каслухим)', () => {
    expect(sec('mitsraim', 10)).toContain('От него произошли: Лудим, Анамим');
    expect(sec('mitsraim', 10)).toContain('Потомки во втором поколении: Филистимляне');
    expect(sec('mitsraim', 10)).not.toMatch(/Внук: Филистимляне/);
    expect(sec('kaslukhim', 10)).toContain('От них произошли: Филистимляне');
    // Ханаан «родил… Иевусея» (Быт 10:15–16): народ с именем в единственном числе остаётся сыном
    expect(sec('khanaan', 10)).toMatch(/Сыновья: .*Иевусей/);
    const plural = new Set(persons.filter((p) => (p.kind === 'people' || p.kind === 'clan') && /(им|[ая]не)$/.test(p.name)).map((p) => p.name));
    const bad: string[] = [];
    for (const [id, s] of cards) {
      const t = s.get(10) ?? '';
      for (const m of t.matchAll(/(Сын|Дочь|Сыновья|Дочери|Дети|Внук|Внучка|Внуки|Внучки|Правнук|Правнучка|Правнуки|Правнучки)[^:]{0,40}: ([^.:;]*?)(?= [А-ЯЁ][а-яё]+(?: [а-яё]+)*:|$)/g))
        for (const nm of m[2].split(', ')) if (plural.has(nm.replace(/ \(.*$/, '').trim())) bad.push(`${id}: «${m[1]}: … ${nm}»`);
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('§ 10: группы детей одной схемой — «Сын от Вооза», «Сыновья от Вирсавии», «Дети, мать которых не названа»', () => {
    expect(sec('ruf', 10)).toContain('Сын от Вооза: Овид');
    // главное — наверх (CARD-57): сыновья от Вирсавии — первой группой; внутри — порядок текста (этап 13, решение 104:
    // значимость — знаком, а не местом), безымянный первый сын — первым по году (2 Цар 12:15–18); его описание — через
    // тире и «;», оно не читается как приложение к соседнему имени (VIS-72); дети по одному от матери — одной строкой
    expect(sec('david', 10)).toMatch(/^Сыновья от Вирсавии: сын Давида и Вирсавии — умер младенцем на седьмой день; Самус, Совав, Нафан, Соломон/);
    // по одному от матери — по порядку рождения, с подписью и стихом заметки (CARD-93): первенец Амнон — первым
    // у каждого — ссылка на карточку союза с его матерью (решение 71)
    // тёзки карточки (Авигея — жена и сестра, Мааха — жена и внучка; решение 106) — с уточнением, без вложенной скобки
    expect(sec('david', 10)).toContain('В Хевроне родились шесть сыновей от шести матерей: Амнон (от Ахиноамы, союз), Далуиа (мать — Авигея, жена Навала, затем Давида; союз), Авессалом (мать — Мааха, дочь Фалмая, царя Гессурского, жена Давида; союз)');
    expect(sec('david', 10)).toMatch(/Дети, мать которых не названа: [^:]*Евеар, Елисуа/);
    expect(sec('iakov', 10)).toContain('Сыновья от Рахили: Иосиф, Вениамин');
    // подпись «от …» не бывает без существительного: прежнее «от Лии: …» без «Сыновья» в начале раздела и после других строк
    // (слово перед «от» — имя ребёнка из прежней строки или начало раздела; строчное слово — текст данных: «четверо от Вирсавии: …»)
    const bad: string[] = [];
    for (const [id, s] of cards)
      for (const m of (s.get(10) ?? '').matchAll(/(?:^|(\S+) )от [А-ЯЁ][а-яё]+: /g))
        if (m[1] === undefined || (/^[А-ЯЁ]/.test(m[1]) && !/^(Сын|Дочь|Сыновья|Дочери|Дети)$/.test(m[1]))) bad.push(`${id}: «${m[0]}»`);
    expect(bad.slice(0, 10), `${bad.length} карточек`).toEqual([]);
  });

  test('§ 23: «Додо — Додова» и «Руфь — Руфью» находит сам сопоставитель форм', async () => {
    const { nameMatcher, norm } = await import('../src/engine/text.ts');
    const hit = (name: string, word: string) => nameMatcher(name).test(` ${norm(word)} `);
    expect(hit('Руфь', 'Руфь')).toBe(true);
    expect(hit('Руфь', 'Руфью')).toBe(true);
    expect(hit('Руфь', 'Руфи')).toBe(true);
    expect(hit('Додо', 'Додова')).toBe(true);
    expect(hit('Додо', 'Додо')).toBe(true);
    expect(hit('Ной', 'но')).toBe(false);
    expect(sec('dodo-ded-foly', 23)).toMatch(/^Имя названо в 1 стихе \(Суд\)/);
    expect(sec('ruf', 23)).toMatch(/^Имя названо в 13 стихах/);
  });
});
