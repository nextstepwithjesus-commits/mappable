/**
 * Тексты разделов карточки (L8b, этап 7, круг 3): § 14 — встречи со словами события и родня словом степени (CARD-80;
 * решение 62), повторы (CARD-81), § 11 с подписью и стихами (CARD-84), периоды § 17 (CARD-85; решение 63), народ без § 8
 * (CARD-87; решение 61), § 12 одним словом и одной формой (CARD-91), «Родство» через брак (CARD-92), § 9 и § 10 Давида
 * (CARD-93), типология Мелхиседека в § 22 (решение 66), перечень детей и адресат слов (VIS-72, VIS-73).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { cardSections, allIds, byId } from './helpers/cards.ts';
import { graph, loadCard, models } from '../src/data/atlas.ts';
import { relate } from '../src/engine/kinship.ts';
import { kinDegree, kinPlural, lifeParts, section14, trimRowRepeat, newNamesIn } from '../src/ui/card/sections.tsx';

const norm = (s: string) => s.replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();
const IDS = ['david', 'avraam', 'ruf', 'melkhisedek', 'aviud-syn-zorovavelya', 'moisey', 'iisus', 'mariya', 'iosif-muzh-marii', 'ioav', 'esfir', 'avigeya', 'iosif', 'noemin', 'famar', 'ludim', 'mitsraim', 'saul-syn-simeona', 'orfa'];
const cards = new Map<string, Map<number, string>>();
const sec = (id: string, n: number) => cards.get(id)?.get(n) ?? '';

beforeAll(async () => {
  // встречи, записанные у других лиц, — из их томов: как в браузере после LoadVolumes
  await Promise.all(allIds.map((id) => loadCard(id)));
  for (const id of IDS) {
    const s = await cardSections(id);
    cards.set(id, new Map([...s].map(([n, t]) => [n, norm(t)])));
  }
}, 300_000);

describe('CARD-80 (решение 62): § 14', () => {
  it('Иисус Христос: суд и предательство — во «Встречах» словами события, не «по расчёту»', () => {
    const t = sec('iisus', 14);
    const calc = t.slice(t.indexOf('Кто ещё жил'));
    for (const name of ['Понтий Пилат', 'Каиафа', 'Иуда (Искариот', 'Филипп (апостол', 'Нафанаил', 'Матфей', 'Мария (Магдалина']) {
      expect(t.indexOf(name), name).toBeGreaterThanOrEqual(0);
      expect(t.indexOf(name), name).toBeLessThan(t.indexOf('Кто ещё жил'));
    }
    expect(calc).not.toMatch(/Пилат|Каиафа|Искариот/);
    expect(t).toMatch(/Иуда \(Искариот, предавший Иисуса\) — получил от Него кусок хлеба на вечере; предал Его поцелуем/);
  });
  it('встречи, записанные у других лиц, — в карточке владельца (card.metBy): § 14 не зависит от порядка загрузки томов', async () => {
    const z = (await loadCard('zelfa'))!.card;
    expect((z.metBy ?? []).some((x) => x.id === 'lavan')).toBe(true);
    const iisus = (await loadCard('iisus'))!.card;
    expect((iisus.metBy ?? []).find((x) => x.id === 'iuda-iskariot')?.text).toMatch(/предал Его поцелуем/);
  });
  it('встреча без слов о событии не выводится: у каждой строки «Встреч» — слова, а не голое имя', async () => {
    const bad: string[] = [];
    for (const id of IDS) {
      const d = section14(id, models[0], (await loadCard(id))?.card ?? null);
      for (const r of d?.rows ?? []) if (r.kind !== 'co-spouse' && !r.text.trim()) bad.push(`${id}: ${JSON.stringify(r)}`);
    }
    expect(bad).toEqual([]);
  });
  it('Авраам: предки и их братья — родня словом степени, не «Другие»', () => {
    expect(kinDegree('sim', 'avraam')?.word).toBe('предок в 9-м поколении');
    expect(kinDegree('kham', 'avraam')?.word).toBe('брат Сима, предка в 9-м поколении');
    const t = sec('avraam', 14);
    expect(t).not.toMatch(/Другие:[^.]*(Сим|Евер|Хам|Иафет)(?![а-яё])/);
    expect(t).toMatch(/Родня: /);
  });
  it('родня: до 8 имён и «ещё N»; больше двадцати — по степеням («Двоюродные братья (N)»)', () => {
    expect(sec('avraam', 14)).toMatch(/Родня: [^.]*ещё \d+ (лицо|лица|лиц)/);
    expect(sec('saul-syn-simeona', 14)).toMatch(/Двоюродные братья \(\d+\): /);
    expect(kinPlural('двоюродный брат')).toBe('двоюродные братья');
    expect(kinPlural('брат Сима, предка в 9-м поколении')).toBe('братья Сима, предка в 9-м поколении');
    expect(kinPlural('прапрадед')).toBe('прапрадеды');
  });
  it('первая и вторая степень — в § 12: «Племянники: Иоав, Авесса и Асаил — сыновья сестры Саруии»', () => {
    expect(sec('david', 12)).toMatch(/Племянники: Иоав, Авесса и Асаил — сыновья сестры Саруии 1 Пар 2:16/);
    expect(sec('moisey', 12)).toMatch(/Племянники: Надав, Авиуд, Елеазар и Ифамар — сыновья брата Аарона/);
    expect(sec('david', 14)).not.toMatch(/Иоав/);
  });
  it('CARD-06: «Елиезер — распорядитель в его доме» без повтора уточнения; встречи с одними словами — одной строкой', () => {
    expect(sec('avraam', 14)).toMatch(/Елиезер — распорядитель в его доме/);
    expect(sec('moisey', 14)).toMatch(/Елицур, Шелумиил, [^—]*— каждый: вместе исчисляли общество сынов Израилевых/);
  });
});

describe('CARD-81: повторы', () => {
  it('пояснение под строкой — только с новыми именами или стихами; повтор начала строки снимается', () => {
    expect(trimRowRepeat('Сарра — жена и одновременно сестра по отцу', ['Сарра'], 'жена')).toBe('Сестра по отцу');
    expect(trimRowRepeat('Амессай, сын Авигеи, сестры Саруии, — его двоюродный брат', ['Амессай'], 'двоюродный брат')).toBe('Сын Авигеи, сестры Саруии');
    expect(trimRowRepeat('Родственница Елисаветы, жены священника Захарии', ['Елисавета'], 'родственница')).toBe('Родственница Елисаветы, жены священника Захарии');
    expect(newNamesIn('Мелхолу, дочь Саула, получил…', ['melkhola', 'david'])).toBe(true);
    expect(newNamesIn('В земле Мадиамской взял в жену Сепфору', ['sepfora', 'moisey'])).toBe(false);
    expect(sec('moisey', 6)).not.toMatch(/Воспитан дочерью фараоновой/);
    // «союз» — ссылка на карточку союза за стихами брака (решение 71)
    expect(sec('avraam', 9)).toMatch(/Сарра Быт 11:29; 12:5; 23:19 союз Сестра по отцу Быт 20:12/);
    expect(sec('ioav', 12)).toMatch(/Амессай — двоюродный брат 2 Цар 17:25 выв\. Сын Авигеи, сестры Саруии/);
    expect(sec('mariya', 12)).toMatch(/Елисавета — родственница Лк 1:36 Жена священника Захарии, «из рода Ааронова»/);
    expect(sec('iosif-muzh-marii', 21)).not.toMatch(/41-й от Авраама/);
    expect(sec('moisey', 10)).not.toMatch(/Два сына от Сепфоры/);
  });
  it('в 12 центральных карточках ни одна строка § 9–12 не повторяет другую (те же имена и тот же термин)', () => {
    const bad: string[] = [];
    for (const id of IDS.slice(0, 12))
      for (const n of [9, 10, 11, 12]) {
        const t = sec(id, n);
        for (const name of new Set(t.match(/[А-ЯЁ][а-яё]{2,}/g) ?? [])) {
          const rows = t.split(/(?<=\d) (?=[А-ЯЁ])/).filter((r) => r.startsWith(`${name} — `));
          const terms = rows.map((r) => r.replace(/ [\d(].*$/, ''));
          if (new Set(terms).size !== terms.length) bad.push(`${id} § ${n}: ${name}`);
        }
      }
    expect(bad).toEqual([]);
  });
});

describe('CARD-84: § 11 — подпись и стихи', () => {
  it('Давид, Иосиф, Авраам', () => {
    expect(sec('david', 11)).toMatch(/^Братья: Елиав, Аминадав, Самма, Нафанаил, Раддай, Оцем 1 Пар 2:13–15 Сёстры: Саруия, Авигея 1 Пар 2:16/);
    expect(sec('iosif', 11)).toMatch(/^Родной брат: Вениамин — от Рахили Быт 35:24/);
    expect(sec('avraam', 11)).toMatch(/^Братья: Нахор, Аран Быт 11:26–27/);
    expect(sec('avraam', 11)).toMatch(/Сестра: Сарра Быт 20:12/);
  });
});

describe('CARD-85 (решение 63): периоды § 17', () => {
  it('Иисус Христос: оглавление периодов с числом событий; подзаголовков-ссылок нет', async () => {
    const t = sec('iisus', 17);
    expect(t).toMatch(/^По периодам: Рождество и детство \(6\); Крещение и начало служения \(4\); Служение в Галилее \(12\); Путь в Иерусалим \(3\); Страсти \(7\); Воскресение и вознесение \(7\)/);
    expect(t).not.toMatch(/(^| )(Мф|Лк|Ин) \d+(–\d+)?; /);
    const d = await loadCard('avraam');
    expect(lifeParts(d!.card.events!, byId.get('avraam')!, models[0].chrono.get('avraam'), d!.chrono).map((x) => x.head)[0]).toBe('Путь в Ханаан и в Египет');
  });
});

describe('CARD-87, решение 61: народы', () => {
  it('у народа § 8 не строится; Мицраим — народ, «в родословии — сын Хама»', () => {
    expect(cards.get('ludim')!.has(8)).toBe(false);
    expect(sec('ludim', 6)).toMatch(/^Произошли от: Мицраим/);
    expect(byId.get('mitsraim')!.kind).toBe('people');
    expect(cards.get('mitsraim')!.has(14)).toBe(false);
    expect(sec('mitsraim', 10)).toMatch(/^От него произошли: Лудим/);
  });
});

describe('CARD-91: § 12 — одно слово и одна форма', () => {
  it('Орфа — сноха у Ноемини и невестка у Руфи; Иофор — тесть без «выв.»; Иуда — свёкор', () => {
    expect(sec('noemin', 12)).toMatch(/Орфа — сноха, жена Хилеона Руф 1:6–8/);
    expect(sec('ruf', 12)).toMatch(/Орфа — невестка Руф 1:15/);
    expect(sec('ruf', 12)).not.toMatch(/Невестка Орфы/);
    expect(sec('moisey', 12)).toMatch(/Иофор — тесть, отец Сепфоры Исх 3:1; 18:1(?! выв)/);
    expect(sec('famar', 12)).toMatch(/^Иуда — свёкор Быт 38:11/);
  });
});

describe('CARD-92: «Родство» через брак', () => {
  it('Авигея, жена Давида, и Авигея, сестра Давида', () => {
    const r = relate(graph, 'avigeya', 'avigeya-sestra-davida');
    expect(r.every((x) => x.kind === 'in-law')).toBe(true);
    expect(r[0].sentence.replace(/\u00a0/g, ' ').replace(/\u2060/g, '')).toBe('Авигея — жена Давида, брата Авигеи (1 Цар 25:39–42; 1 Пар 2:16)');
    expect(r[0].term).toBe('невестка');
  });
});

describe('CARD-93, VIS-72, VIS-73, решение 66, CARD-90', () => {
  it('§ 9 Давида — «Жёны: …» первой строкой; § 10 — по одному от матери по порядку рождения, со стихами', () => {
    expect(sec('david', 9)).toMatch(/^Жёны: Мелхола, Авигея, Ахиноама, Мааха, Аггифа, Авитала, Эгла, Вирсавия\./);
    // у каждого — ссылка на карточку союза с его матерью (решение 71)
    expect(sec('david', 10)).toMatch(/В Хевроне родились шесть сыновей от шести матерей: Амнон \(от Ахиноамы, союз\), Далуиа \(от Авигеи, союз\), Авессалом \(от Маахи, союз\), Адония \(от Аггифы, союз\), Сафатия \(от Авиталы, союз\), Иефераам \(от Эглы, союз\) 2 Цар 3:2–5; 1 Пар 3:1–4/);
    expect(sec('david', 10)).toMatch(/Совав; ещё сын Давида и Вирсавии — умер младенцем на седьмой день/);
  });
  it('§ 18: адресат — перед цитатой, с двоеточием', () => {
    expect(sec('david', 18)).toMatch(/^Голиафу: «ты идешь против меня/);
  });
  it('Мелхиседек: § 21 не строится, типология — в § 22 (Пс 109:4)', () => {
    expect(cards.get('melkhisedek')!.has(21)).toBe(false);
    expect(sec('melkhisedek', 22)).toMatch(/Ты священник вовек по чину Мелхиседека/);
  });
  it('«царский дом» в перечне мест — со строчной; «царь из книги Есфирь»', () => {
    expect(sec('esfir', 15)).toMatch(/; царский дом Есф 2:16/);
    expect(byId.get('artakserks-muzh-esfiri')!.disambig).toBe('царь из книги Есфирь (Ахашверош)');
  });
});
