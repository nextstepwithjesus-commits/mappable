/**
 * Этап 7, группа K3 (тексты карточки и панелей): падежи, § 14, повторы, § 10, § 17, § 21, «Кратко», § 12, § 15, § 23,
 * народы (решение 23), типографика порядковых. Карточки собираются, как в интерфейсе (buildSections).
 * Нужна свежая сборка данных: npm run -s data.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { cardSections, allIds, byId } from './helpers/cards.ts';
import { loadCard, models } from '../src/data/atlas.ts';
import { briefText } from '../src/ui/card/Brief.tsx';
import { lifeParts, matthewLine, lukeLine, contemporaryGroups, familyIds } from '../src/ui/card/sections.tsx';
import { tensionBrief } from '../src/ui/card/Chrono.tsx';
import { whenText, lifeText, birthSpanText } from '../src/ui/sky/text.ts';
import { loadModel } from '../src/data/atlas.ts';
import { yearsGen, leadingNumber, realmInstrumental } from '../src/ui/text/ru.ts';
import { reignOverLine } from '../src/ui/card/shared.tsx';
import { newPart, overlap, addSeen } from '../src/ui/text/repeat.ts';
import { typo } from '../src/ui/text/typo.ts';
import { scopeReason, CanonStrip } from '../src/ui/card/Canon.tsx';
import { renderToString } from 'preact-render-to-string';
import { h } from 'preact';

const norm = (s: string) => s.replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();
const cards = new Map<string, Map<number, string>>();
const sec = (id: string, n: number) => cards.get(id)?.get(n) ?? '';

beforeAll(async () => {
  await Promise.all(allIds.map((id) => loadCard(id)));
  for (const id of allIds) {
    const s = await cardSections(id);
    cards.set(id, new Map([...s].map(([n, t]) => [n, norm(t)])));
  }
}, 300_000);

describe('CARD-50: «в возрасте» — родительный падеж', () => {
  it('yearsGen: «1 года», «21 года», «34 лет», «11 лет», «120 лет»', () => {
    const f = (n: number) => yearsGen(n).replace(/ /g, ' ');
    expect([1, 21, 34, 11, 120, 101, 111, 2].map(f)).toEqual(['1 года', '21 года', '34 лет', '11 лет', '120 лет', '101 года', '111 лет', '2 лет']);
  });
  it('по всем лицам: после «в возрасте» нет «год» и «года» при числах на 2–4, «год» при 1', () => {
    const bad: string[] = [];
    for (const [id, s] of cards)
      for (const [n, t] of s) {
        for (const m of t.matchAll(/в возрасте (\d+) (год|года|лет)\b/g)) {
          const k = Number(m[1]);
          const want = k % 10 === 1 && k % 100 !== 11 ? 'года' : 'лет';
          if (m[2] !== want) bad.push(`${id} § ${n}: «${m[0]}»`);
        }
      }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(sec('iisus', 20)).toMatch(/в возрасте \d+ (лет|года)/);
  });
});

describe('CARD-51: царствование одними словами в § 16 и в «Сквозном разделе»', () => {
  it('«семь лет и шесть месяцев над Иудеей, в Хевроне»; «33 года над всем Израилем»', () => {
    const nb = (s: string) => s.replace(/ /g, ' ');
    expect(realmInstrumental('Иудея (в Хевроне)')).toBe('Иудеей, в Хевроне');
    expect(realmInstrumental('весь Израиль')).toBe('всем Израилем');
    expect(nb(reignOverLine({ over: 'Иудея (в Хевроне)', start: -1010, end: -1003, years: 7, note: 'по тексту — семь лет и шесть месяцев' }))).toBe('семь лет и шесть месяцев над Иудеей, в Хевроне');
    expect(nb(reignOverLine({ over: 'весь Израиль', start: -1003, end: -970, years: 33 }))).toBe('33 года над всем Израилем');
  });
});

describe('CARD-55 (решение 19): § 14', () => {
  it('Давид: «Встречи и связи», Иоав — племянник в родне, список по расчёту свёрнут в <details>', () => {
    const t = sec('david', 14);
    expect(t).toMatch(/^Встречи и связи, о которых говорит Писание/);
    expect(t).toMatch(/Родня, жившая в то же время: [^.]*Иоав[^;]*— племянник/);
    expect(t).toContain('Кто ещё жил в это время (расчёт)');
  });
  it('Есфирь: Астинь — «Другая жена Артаксеркса» среди связей текста, не «Правители»', () => {
    const t = sec('esfir', 14);
    expect(t).toMatch(/Другая жена Артаксеркса: Астинь/);
    expect(t).not.toMatch(/Правители:[^.]*Астинь/);
  });
  it('«Правители» — только царь, судья, иноземный правитель; у народа § 14 не строится', () => {
    expect(sec('ioav', 14)).not.toMatch(/Правители:[^.]*Вирсавия/);
    for (const id of allIds) if (['people', 'clan'].includes(byId.get(id)!.kind)) expect(cards.get(id)!.has(14), id).toBe(false);
  });
});

describe('CARD-56: повторы', () => {
  it('мера сходства: пересказ одной записи другой — повтор, разные записи — нет', () => {
    expect(overlap('Амрам взял её, «тётку свою», в жену: она сестра его отца Каафа', 'Амрам взял в жену Иохаведу, тётку свою, сестру отца Каафа')).toBeGreaterThan(0.7);
    expect(overlap('По рождении Сифа Адам родил ещё сынов и дочерей', 'По рождении Еноса жил 807 лет и родил сынов и дочерей')).toBeLessThanOrEqual(0.7);
  });
  it('часть пояснения, сказанная строками выше, опускается: «Братья — Нахор и Аран; Аран умер…» → «Аран умер…»', () => {
    const seen = addSeen(new Set(), 'Нахор Аран Сарра брат братья');
    expect(newPart('Братья — Нахор и Аран; Аран умер ещё при жизни Фарры', seen, addSeen(new Set(), 'Нахор Аран Сарра'))).toBe('Аран умер ещё при жизни Фарры');
  });
  it('Моисей § 9 — «жена Ефиоплянка, которую он взял» один раз; § 6 — «Воспитан…» под строкой приёмной матери; Авраам § 11 без «Братья — Нахор и Аран»', () => {
    expect((sec('moisey', 9).match(/Ефиоплянка, которую он взял/g) ?? []).length).toBe(1);
    expect(sec('moisey', 6)).toMatch(/Приёмная мать: дочь фараонова[^.]*Воспитан дочерью фараоновой/);
    expect(sec('avraam', 11)).not.toMatch(/Братья — Нахор и Аран/);
    expect(sec('avraam', 11)).toMatch(/Аран умер ещё при жизни Фарры/);
  });
});

describe('CARD-58: части § 17 — периоды жизни', () => {
  it('Давид: «До воцарения», «Царь Иудеи, в Хевроне», «Царь всего Израиля»; у длинных жизнеописаний части есть почти всегда', async () => {
    const m = models[0];
    const d = await loadCard('david');
    const heads = lifeParts(d!.card.events!, byId.get('david')!, m.chrono.get('david'), d!.chrono).map((x) => x.head);
    expect(heads).toEqual(['До воцарения', 'Царь Иудеи, в Хевроне', 'Царь всего Израиля']);
    let long = 0;
    let parted = 0;
    for (const id of allIds) {
      const c = await loadCard(id);
      const ev = c?.card?.events ?? [];
      if (ev.length < 9) continue;
      long++;
      if (lifeParts(ev, byId.get(id)!, m.chrono.get(id), c!.chrono).length >= 2) parted++;
    }
    expect(parted / long).toBeGreaterThan(0.7);
  });
  it('возраст на полях не повторяет возраст словами: «Двенадцати лет…» без «12 лет.»', () => {
    expect(leadingNumber('Двенадцати лет остался в храме')).toBe(12);
    expect(leadingNumber('В сорок лет взял в жёны двух хеттеянок')).toBe(40);
    expect(leadingNumber('Тридцать три года царствовал')).toBe(33);
    expect(leadingNumber('Пошёл в Египет')).toBeNull();
    expect(sec('iisus', 17)).not.toMatch(/12 лет\. Двенадцати лет/);
  });
});

describe('CARD-64: § 21', () => {
  it('ряд из четырнадцати родов и направление счёта у Луки', () => {
    const nb = (s: string) => s.replace(/ /g, ' ');
    expect(nb(matthewLine({ mt: 14, mtGroup: 1 }))).toBe('Линия Иосифа: 14-е имя у Матфея, последнее в первом ряду из четырнадцати родов (Мф 1:17)');
    expect(lukeLine({ lk: 42, flag: 'in-text' })).toBe('Линия по Луке: 42-е имя у Луки, считая от Иосифа');
    expect(lukeLine({ flag: 'in-text' })).toMatch(/с Него начинается родословие — «был, как думали, Сын Иосифов, Илиев» \(Лк 3:23\)/);
    for (const [id, s] of cards) expect(s.get(21) ?? '', id).not.toMatch(/четырнадцатица|Линия по Луке$/);
  });
});

describe('CARD-65 (решение 22): «Кратко» по правилам', () => {
  const b = async (id: string) => briefText(id, (await loadCard(id))?.card ?? null);
  it('первая фраза — из подзаголовка: служение, а не одно слово роли', async () => {
    expect(await b('moisey')).toMatch(/^Пророк и законодатель, сын Амрама из колена Левиина; вождь и избавитель Израиля при Исходе/);
    expect(await b('ioav')).toMatch(/^Военачальник Давида, сын Саруии/);
    expect(await b('iisus')).toMatch(/^Христос, Сын Божий, Сын Давидов; родился от Марии/);
    expect(await b('iisus')).not.toMatch(/Мессия, Христос/);
  });
  it('без термина, оговорённого в § 9, без «Вифлеемлянин… из Вифлеема», дети не повторяются', async () => {
    expect(await b('esfir')).not.toMatch(/жена Артаксеркса/);
    expect(await b('iessey')).not.toMatch(/Вифлеемлянин/);
    expect(await b('iokhaveda')).not.toMatch(/Мариам[^.]*\.[^.]*мать Аарона/);
  });
});

describe('CARD-66, CARD-67, CARD-72, CARD-73', () => {
  it('§ 12 одной формой: «Фалмай — тесть, отец Маахи»; у Ноемини — «Руфь — сноха» (слово книги)', () => {
    expect(sec('david', 12)).toContain('Фалмай — тесть, отец Маахи выв.');
    expect(sec('noemin', 12)).toMatch(/Руфь — сноха/);
    // заметка владельца словом свойства — строкой той же формы: «Зять царя Саула» → «Саул — тесть, отец Мелхолы»
    expect(sec('david', 12)).toMatch(/Саул — тесть, отец Мелхолы 1 Цар 18:27/);
    expect(sec('david', 12)).not.toContain('Зять царя Саула');
    expect(sec('ruf', 12)).toMatch(/Ноеминь — свекровь, мать Махлона Руф/);
  });
  it('§ 15: одно место одной записью; нарицательное слово после «;» — строчное; «по связи стихов» — помета «выв.»', () => {
    expect(sec('moisey', 15)).not.toMatch(/гора Нево;[^.]*Гора Нево/i);
    expect(sec('david', 15)).toMatch(/; пещера Одолламская/);
    expect(sec('melkhisedek', 15)).not.toMatch(/по связи стихов/);
    for (const [id, s] of cards) expect(s.get(15) ?? '', id).not.toMatch(/по связи стихов/);
  });
  it('§ 23: настоящая причина счёта только в главах карточки', () => {
    expect(scopeReason('ruf')).toMatch(/^сходное имя — Руф/);
    expect(sec('ruf', 23)).not.toMatch(/То же имя носят другие лица, колено, народ или место/);
  });
});

describe('решение 23 (CARD-59): народы и роды', () => {
  it('Лудим: § 6 «Произошли от», § 8 «Происхождение», § 11 «Названы вместе»', () => {
    expect(sec('ludim', 6)).toMatch(/^Произошли от: Мицраим/);
    expect(sec('ludim', 8)).toMatch(/^Происхождение: от Мицраима/);
    expect(sec('ludim', 11)).toMatch(/^Названы вместе: Анамим/);
  });
});

describe('CARD-68, UX-12, VIS-54: типографика', () => {
  it('порядковое с наращением неразрывно; «=» не начинает строку', () => {
    expect(typo('в 34-м колене')).toBe('в 34-⁠м колене');
    expect(typo(typo('в 34-м колене'))).toBe(typo('в 34-м колене'));
    expect(typo('75 + 10 = 85 лет')).toContain(' =');
    // диапазоны чисел — прежние: «1–2», а не порядковое
    expect(typo('Быт 1-2')).toBe('Быт 1–⁠2');
  });
});

describe('поручения координатора после K1: напряжения, народы, порядок братьев, «время не установлено»', () => {
  it('§ 13: напряжение одной записью — цепочка, суть, вывод «толк.» и «Подробнее см. § 24»; всё объяснение — в § 24', () => {
    const d13 = sec('david', 13);
    expect(d13).toMatch(/Хронологическое напряжение\. Наассон — Салмон — Вооз — Овид — Иессей — Давид: 5 поколений — не меньше чем 418 лет\. Вероятно, родословие называет не все поколения\. Подробнее см\. § 24\./);
    expect(d13).toMatch(/Подробнее см\. § 24\. Чис 1:1; 1:7; 2 Цар 5:4; ещё 5 ссылок толк\./);
    // пояснение в скобках и «в среднем…» — только в § 24
    expect(d13).not.toMatch(/Наассон засвидетельствован/);
    expect(sec('david', 24)).toMatch(/^Хронологическое напряжение\. Наассон — Салмон — Вооз — Овид — Иессей — Давид: 5 поколений — не меньше чем 418 лет, в среднем не меньше чем по 84 года на поколение \(Наассон засвидетельствован уже в 1446 г\. до Р\. Х\., Давид родился около 1040 г\. до Р\. Х\.\)\. Вероятно, родословие называет не все поколения\. Чис 1:1; 1:7; 2 Цар 5:4; ещё 5 ссылок толк\./);
    // Иодай — Иосавеф: напряжение без толкования — без «толк.» в § 13 и § 24
    expect(sec('iodai', 13)).toMatch(/Иодай — Иосавеф: по принятым годам жена моложе мужа на 53 года\. Подробнее см\. § 24\./);
    expect(sec('iodai', 13)).not.toMatch(/толк\./);
    expect(sec('iosavef', 24)).toMatch(/Годы обоих выведены из чисел текста и родства/);
    // два напряжения — одной записью: у Вооза «Наассон — … — Давид» и «Вооз — Руфь», вывод-толкование один раз
    expect(sec('vooz', 13)).toMatch(/Хронологические напряжения\. Наассон — Салмон — Вооз — Овид — Иессей — Давид: 5 поколений — не меньше чем 418 лет\. Вооз — Руфь: по принятым годам жена моложе мужа на 49 лет\. Вероятно, родословие называет не все поколения\. Подробнее см\. § 24\./);
    expect(sec('vooz', 13).match(/Вероятно/g)).toHaveLength(1);
  });
  it('напряжения всех моделей: у каждого есть цепочка и короткая суть; каждое напряжение лица — и в § 13, и в § 24', async () => {
    for (const mid of ['mt-long', 'mt-short', 'lxx', 'terah70']) {
      const m = mid === 'mt-long' ? models[0] : (await loadModel(mid as never))!;
      for (const t of m.tensions) {
        const b = tensionBrief(t);
        expect(b.chain, t.text).toMatch(/^[А-ЯЁ][^:]*\s—\s/);
        expect(b.gist.length, t.text).toBeGreaterThan(10);
        expect(b.gist.length, t.text).toBeLessThanOrEqual(160);
        if (t.cert === 'interpretation') expect(b.interp, t.text).toMatch(/^Вероятно, /);
      }
    }
    for (const t of models[0].tensions)
      for (const id of t.persons) {
        const b = tensionBrief(t);
        expect(sec(id, 13), id).toMatch(/Хронологическ(ое напряжение|ие напряжения)\. /);
        expect(sec(id, 13), id).toContain(`${b.chain.replace(/\s+/g, ' ')}: ${b.gist.replace(/\s+/g, ' ')}.`);
        expect(sec(id, 24), id).toContain(`Хронологическое напряжение. ${t.text.replace(/\s+/g, ' ').slice(0, 60)}`);
      }
  });
  it('§ 8: год, оценённый по порядку перечисления братьев, — с пометой «выв.», а не «расч.»', () => {
    const m = models[0];
    const ids = [...m.chrono].filter(([id, c]) => c.byOrder && c.cls !== 'epochal' && cards.get(id)?.get(8)).map(([id]) => id);
    expect(ids.length).toBeGreaterThan(50);
    for (const id of ids.slice(0, 200)) {
      const s8 = sec(id, 8);
      if (!/г\. до Р\. Х\.|г\. по Р\. Х\./.test(s8.split(/\. /)[0])) continue; // первая строка — не год (народ)
      expect(s8, id).toMatch(/ выв\./);
    }
    expect(sec('iaval', 8)).toMatch(/Первозданный мир выв\./);
  });
  it('§ 14: народы и роды не попадают в современники лиц (asResult передаёт named)', () => {
    const m = models[0];
    const bad: string[] = [];
    for (const id of allIds) {
      const p = byId.get(id)!;
      if (p.kind === 'people' || p.kind === 'clan') continue;
      const c = m.chrono.get(id);
      if (!c || c.cls === 'epochal' || !['antediluvian', 'postdiluvian', 'patriarchs'].includes(c.epoch ?? '')) continue;
      for (const g of contemporaryGroups(id, m, familyIds(id), new Set()))
        for (const x of g.ids) if (['people', 'clan'].includes(byId.get(x)!.kind)) bad.push(`${id}: ${x}`);
    }
    expect(bad).toEqual([]);
  });
  it('подсказка звезды «время не установлено»: откуда время — «Современник Авраама», «Упомянут в Быт 14:13»', () => {
    const m = models[0];
    expect(m.chrono.get('melkhisedek')!.when).toEqual({ by: 'met', id: 'avraam' });
    expect(whenText('melkhisedek')).toBe('Современник Авраама');
    expect(whenText('eshkol')).toBe(typo('Упомянут в Быт 14:13'));
    // строка годов подсказки звезды, списка неба для диктора и «Какое лицо?»; в узких строках поиска — без неё
    expect(lifeText('melkhisedek')).toBe('время не установлено; современник Авраама');
    expect(lifeText('eshkol')).toBe(`время не установлено; ${typo('упомянут в Быт 14:13')}`);
    expect(lifeText('melkhisedek', { when: false })).toBe('время не установлено');
    expect(birthSpanText('melkhisedek')).toBeNull();
    // у всех лиц «время не установлено» строка либо нет, либо начинается с одного из трёх оборотов
    for (const [id, c] of m.chrono) {
      if (c.cls !== 'epochal') continue;
      const w = whenText(id);
      if (w) expect(w, id).toMatch(/^(Упомянута?\sв\s|Современни(к|ца)\s|Одного\sпоколения\sсо?\s)/);
    }
  });
});

describe('VIS-43: подписи восьми групп книг под полосой § 23', () => {
  it('восемь подписей по группам в синодальном порядке; подпись — data-label, текст раздела не меняется', () => {
    const html = renderToString(h('div', null, CanonStrip({ books: byId.get('david')!.books, id: 'david' }) as never));
    const row = /<div class="canon-g"[^>]*>(.*?)<\/div>/.exec(html)?.[1] ?? '';
    const labels = [...row.matchAll(/<span[^>]*data-label="([^"]*)"/g)].map((m) => m[1]);
    expect(labels).toEqual(['Закон', 'Исторические', 'Учительные', 'Пророки', 'Евангелия', 'Деяния', 'Послания', 'Откровение']);
    expect(html).toMatch(/class="canon-g"[^>]*aria-hidden="true"/);
    expect(sec('david', 23)).toMatch(/^Названо по имени в \d+ стихах/);
  });
});
