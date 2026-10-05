/**
 * Карточка как статья (этап 5, F1–F12; docs/ui-review/README.md, раздел F): лист целиком (CardPage) и разделы
 * (buildSections) по всем 2 660 лицам. Предел «8 строк» меряется в браузере — tools/accept/card.ts.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { cardPageHtml, cardSections, htmlText, allIds, byId } from './helpers/cards.ts';
import { graph, lineMembership, loadCard, persons } from '../src/data/atlas.ts';
import { siblings } from '../src/engine/graph.ts';
import { SECTIONS, sectionStates, colophonText, buildSections, ranges } from '../src/ui/Folio.tsx';
import { derivedKin } from '../src/ui/card/sections.tsx';
import { authoredCount } from '../src/ui/card/Brief.tsx';
import { canonLevel } from '../src/ui/card/Canon.tsx';
import { typo } from '../src/ui/text/typo.ts';
import { models } from '../src/data/atlas.ts';

const norm = (s: string) => s.replace(/\u00a0/g, ' ').replace(/«\s+/g, '«').replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();
const pages = new Map<string, string>();
const texts = new Map<string, string>();
const secs = new Map<string, Map<number, string>>();
const states = new Map<string, ReturnType<typeof sectionStates>>();
const sec = (id: string, n: number) => secs.get(id)?.get(n) ?? '';

beforeAll(async () => {
  const m = models[0];
  for (const id of allIds) {
    const html = await cardPageHtml(id);
    pages.set(id, html);
    texts.set(id, norm(htmlText(html)));
    const s = await cardSections(id);
    secs.set(id, new Map([...s].map(([n, t]) => [n, norm(t)])));
    const data = await loadCard(id);
    const p = byId.get(id)!;
    states.set(id, sectionStates(id, buildSections(id, p, data?.card ?? null, m, m.chrono.get(id), '', data?.chrono ?? null), data?.card ?? null));
  }
}, 600_000);

/** Строки сведённых разделов листа: «номер(а) → текст». */
function runLines(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<div class="sec (silent|na|absent)"[^>]*><span class="no">([^<]*)<\/span>([^<]*)<\/div>/g)) out.set(norm(htmlText(m[2])), `${m[1]}|${norm(htmlText(m[3]))}`);
  return out;
}

describe('F4: пустые разделы — «в Писании не сообщается» всегда, «не составлен» скрыт, § 21 «не относится»', () => {
  test('каждый раздел, о котором Писание молчит, — на листе бледной сведённой строкой; несоставленных строк нет', () => {
    const bad: string[] = [];
    for (const id of allIds) {
      const st = states.get(id)!;
      const lines = runLines(pages.get(id)!);
      const covered = new Set<number>();
      for (const [label, v] of lines) {
        const [kind, text] = v.split('|');
        if (kind === 'absent') bad.push(`${id}: «раздел не составлен» без команды «Все 24 раздела»`);
        const [a, b] = label.split('–').map(Number);
        for (let n = a; n <= (b || a); n++) {
          covered.add(n);
          if (st[n] !== kind) bad.push(`${id} § ${n}: строка «${kind}», а состояние «${st[n]}»`);
        }
        if (kind === 'silent' && !/— в Писании не сообщается$/.test(text)) bad.push(`${id}: «${text}»`);
        // у народа и рода не относятся § 8 и § 14 (решение 23; CARD-87): «Рождение — не относится к народу»
        const kindOf = byId.get(id)!.kind;
        const people = kindOf === 'people' || kindOf === 'clan';
        if (kind === 'na' && !(people ? /^(Рождение|Современники|В родословии Мессии) — не относится к народу$/ : /^В родословии Мессии — не относится/).test(text)) bad.push(`${id}: «${text}»`);
      }
      for (const s of SECTIONS) if ((st[s.n] === 'silent' || st[s.n] === 'na') && !covered.has(s.n) && authoredCount(null) >= 0 && !/Показать все сведения/.test(texts.get(id)!)) bad.push(`${id} § ${s.n}: нет строки «${st[s.n]}»`);
    }
    expect(bad.slice(0, 10), `${bad.length} строк`).toEqual([]);
  });

  test('§ 21 «не относится» — ровно у лиц вне линий Мессии без записи составителя', async () => {
    const bad: string[] = [];
    for (const p of persons) {
      const on = lineMembership.joseph.has(p.id) || lineMembership.mary.has(p.id);
      const note = !!(await loadCard(p.id))?.card?.messiahNote?.length;
      const na = states.get(p.id)![21] === 'na';
      if (na !== (!on && !note && !p.silent.includes(21))) bad.push(`${p.id}: § 21 ${states.get(p.id)![21]}`);
    }
    expect(bad).toEqual([]);
  });

  test('Мелхиседек: «9–12. Супруги, дети, братья и сёстры, иное родство — в Писании не сообщается» — без «Вся схема»', () => {
    const lines = runLines(pages.get('melkhisedek')!);
    expect(lines.get('9–12')).toBe('silent|Супруги, дети, братья и сёстры, иное родство — в Писании не сообщается');
    expect(texts.get('melkhisedek')).toMatch(/Родители\. «Без отца, без матери, без родословия»/);
  });
});

describe('F1: набор — заголовок в строку у раздела из одного абзаца, отдельный — у раздела со списком', () => {
  test('заголовок в строку — с точкой, отдельный — без точки; список номеров в коде не нужен', () => {
    const bad: string[] = [];
    for (const id of allIds) {
      const html = pages.get(id)!;
      for (const m of html.matchAll(/<section class="sec( long)?"[^>]*>.*?<h4 id="h-(\d+)">([^<]*)<\/h4>/g)) {
        const long = !!m[1];
        const title = htmlText(m[3]);
        if (long === title.endsWith('.')) bad.push(`${id} § ${m[2]}: «${title}»${long ? ' — отдельный заголовок с точкой' : ' — в строку без точки'}`);
        if (!long && !/<div class="runin/.test(m[0])) bad.push(`${id} § ${m[2]}: заголовок в строку вне .runin`);
      }
    }
    expect(bad.slice(0, 10), `${bad.length} разделов`).toEqual([]);
  });

  test('части I–VI — заголовки третьего уровня, разделы — четвёртого; под шапкой одна двойная черта', () => {
    const html = pages.get('david')!;
    expect(html.match(/<h3 class="part">/g)).toHaveLength(6);
    expect(html.match(/class="mast-rule"/g)).toHaveLength(1);
    expect(html).not.toMatch(/class="mast"><div class="rule"/);
  });

  test('пометы — кнопки с пояснением для диктора; помета стоит в строке факта', () => {
    const html = pages.get('david')!;
    const marks = [...html.matchAll(/<button type="button" class="mark" aria-expanded="false" aria-label="([^"]+)"><abbr title="([^"]+)">([^<]+)<\/abbr><\/button>/g)];
    expect(marks.length).toBeGreaterThan(5);
    for (const m of marks) expect(m[1]).toBe(`${m[3]} — ${m[2]}`);
    // «толк.» — у напряжения «Наассон — … — Давид» в § 13 и § 24: «Вероятно, родословие называет не все поколения» (MAP-51)
    expect(new Set(marks.map((m) => m[3]))).toEqual(new Set(['расч.', 'выв.', 'справ.', 'толк.']));
  });
});

describe('F2, F10: шапка и колофон', () => {
  test('три команды карточки — глаголами; «Все 24 раздела» и печать — в колофоне', () => {
    const html = pages.get('david')!;
    expect(html).not.toMatch(/Вся схема разделов/);
    // этап 13, решение 96: годы Давида одинаковы во всех моделях — строки о модели в его колофоне нет
    expect(texts.get('david')).toMatch(/Сведения — в 24 разделах\. Ссылки сверены с Синодальным текстом\. Показать все 24 раздела/);
  });

  test('колофон — точный перечень по состояниям разделов у всех лиц', () => {
    const bad: string[] = [];
    for (const id of allIds) {
      const st = states.get(id)!;
      const t = texts.get(id)!;
      const of = (...k: string[]) => SECTIONS.filter((s) => k.includes(st[s.n])).map((s) => s.n);
      const silent = of('silent');
      const absent = of('absent');
      if (!t.includes(norm(colophonText(id, st)).replace(/⁠/g, ''))) bad.push(`${id}: колофон не по состояниям`);
      if (silent.length && !t.includes(`Писание молчит — § ${ranges(silent)}`)) bad.push(`${id}: «Писание молчит»`);
      if (absent.length && !t.includes(`— § ${ranges(absent)}`)) bad.push(`${id}: «не составлены»`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
  });

  // этап 13, решение 96: строка о модели — только у лиц, чьи годы меняются между моделями (IdxPerson.modelDep), а не у
  // всех лиц до 967 г.: у Авраама есть, у Давида (годы от 967 г. по числам царствований) — нет
  test('модель хронологии названа только там, где годы от неё зависят', () => {
    expect(texts.get('avraam')).toMatch(/по модели хронологии «Основной текст: 430 лет в Египте»; в других моделях они иные/);
    expect(texts.get('david')).not.toMatch(/по модели/);
    expect(texts.get('iisus')).not.toMatch(/по модели «/);
    expect(texts.get('melkhisedek')).not.toMatch(/по модели «/);
  });
});

describe('F5: без повторов', () => {
  test('§ 1 не повторяет шапку: говорит об одноимённых', () => {
    const bad: string[] = [];
    for (const p of persons) {
      const t = sec(p.id, 1);
      if (!/^(В атласе ещё \d+ (лицо|лица|лиц) с именем|Других лиц с именем|В Писании имя не названо|В тексте это имя|Назван|Названа)/.test(t)) bad.push(`${p.id}: «${t.slice(0, 50)}»`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
    expect(sec('iosif-muzh-marii', 1)).toMatch(/^В атласе ещё \d+ лиц с именем Иосиф: /);
  });

  test('§ 5 не повторяет строку ролей паспорта: в разделе — только записи составителя', async () => {
    const bad: string[] = [];
    const { briefMovedStatus } = await import('../src/ui/card/Brief.tsx');
    for (const p of persons) {
      const card = (await loadCard(p.id))?.card ?? null;
      // этап 13, решение 121: запись, которую «Кратко» привело целиком со стихами, § 5 не повторяет
      const moved = briefMovedStatus(p.id, card);
      const status = (card?.status ?? []).filter((f) => f.text !== moved);
      const has5 = secs.get(p.id)!.has(5);
      if (!status.length && has5) bad.push(`${p.id}: § 5 без записей составителя`);
      if (status.length && !sec(p.id, 5).startsWith(norm(typo(status[0].text)).slice(0, 12))) bad.push(`${p.id}: «${sec(p.id, 5).slice(0, 40)}»`);
      if ((p.roles.length || moved) && !status.length && states.get(p.id)![5] !== 'header') bad.push(`${p.id}: роль в шапке, а § 5 — «${states.get(p.id)![5]}»`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
    expect(sec('david', 5)).toMatch(/^Царь над домом Иудиным/);
  });

  test('Давид: одно пояснение на трёх жён, сёстры не пересказаны, место рождения один раз, царствования без повтора должностей', () => {
    expect(sec('david', 9).match(/прямо «женой» не названа/g)).toHaveLength(1);
    expect(sec('david', 9)).toContain('Каждая из трёх: прямо «женой» не названа');
    // CARD-93: первой строкой — «Жёны: …»; ниже у каждой — пояснение без повтора «— жена»
    // этап 13, решение 106: тёзки в одной карточке (Авигея — жена и сестра, Мааха — жена и внучка) — с уточнением
    // при каждом упоминании, и в первой строке
    // порядок — по order брака в данных (этап 19, Б-07: порядок брака теперь доходит до карточки; Ахиноама — 2, Авигея — 3,
    // как в 1 Цар 27:3; 2 Цар 2:2; 3:2–3); прежде order терялся при сборке, и порядок шёл по случаю
    expect(sec('david', 9)).toMatch(/^Жёны: Мелхола, Ахиноама, Авигея \(жена Навала, затем Давида\), Мааха \(дочь Фалмая[^)]*\), Аггифа, Авитала, Эгла, Вирсавия\./);
    // в карточке Давида несколько Маах — уточнение при каждом упоминании (этап 13, решение 106)
    expect(sec('david', 9)).toContain('Мааха (дочь Фалмая, царя Гессурского, жена Давида) — мать Авессалома 2 Цар 3:3; 1 Пар 3:2; 3:9 выв.');
    expect(sec('david', 11)).not.toContain('Сёстры — Саруия и Авигея');
    expect(sec('david', 8)).not.toMatch(/Вифлеем Вифлеем/);
    expect(sec('david', 8)).toContain('Место: Вифлеем — «город Давидов»');
    expect(sec('david', 16)).not.toContain('Царь над домом Иудиным в Хевроне');
    expect(sec('david', 16)).toMatch(/Царь Иудеи, в Хевроне: воцарился в 30 лет; по тексту — семь лет и шесть месяцев 2 Цар 5:4–5; 2:11; 2:4;/);
  });

  test('заметка составителя о лице строки — под этой строкой, а не отдельным повтором (Мелхола, Ионафан)', () => {
    const html = pages.get('david')!;
    // заметка о Мелхоле стоит внутри пункта «Мелхола — жена»
    expect(html).toMatch(/data-id="melkhola">Мелхола<\/button>(?:(?!<\/li>).)*Мелхолу/s);
    // CARD-81: пояснение под строкой — только с новыми именами или стихами; «Ионафан, „дядя Давидов“…» на том же
    // стихе строку не повторяет
    // решение 106: Ионафан — дядя и Ионафан — племянник в одной карточке, у обоих уточнение
    expect(sec('david', 12)).toContain('Ионафан (дядя Давида, советник) — дядя 1 Пар 27:32');
    expect(sec('david', 12)).not.toMatch(/«дядя Давидов»/);
  });

  test('§ 22 не повторяет § 21 (Руфь: «В родословии Иисуса Христа, Мф 1:5»)', () => {
    expect(sec('ruf', 21)).toContain('Мф 1:5');
    expect(secs.get('ruf')!.has(22)).toBe(false);
  });
});

describe('F6: родство в карточке', () => {
  test('§ 10: внуки при родителях; сыновья от Вирсавии — первыми (CARD-57), внутри — порядок текста (решение 104)', () => {
    expect(sec('david', 10)).toMatch(/Внуки: от Нафана — Маттафа; от Соломона — Ровоам/);
    // сыновья Иессея — в порядке текста (1 Пар 2:13–15): Давид, седьмой, — последним, со знаком лент
    expect(sec('ruf', 10)).toMatch(/Правнуки: Елиав, Аминадав, Самма, .*Давид/);
    expect(sec('david', 10)).toMatch(/^Сыновья от Вирсавии: сын Давида и Вирсавии — умер младенцем на седьмой день; Самус, Совав, Нафан, Соломон/);
  });

  test('§ 11: единокровные — группой по матерям; братья через отождествление отца — «выв.»', () => {
    expect(sec('isaak', 11)).toContain('Единокровные братья: Измаил — от Агари; Зимран, Иокшан, Медан, Мадиан, Ишбак, Шуах — от Хеттуры');
    expect(sec('isaak', 11)).not.toContain('единокровн.');
    // группа — с подписью и стихом (CARD-84): «Братья и сестра: Мешуллам, … Рисай 1 Пар 3:19; 3:20 выв.»
    expect(sec('aviud-syn-zorovavelya', 11)).toMatch(/^Братья и сестра: Мешуллам, Ханания, .*Рисай [^.]*\d выв\./);
    expect(sec('david', 11)).not.toMatch(/выв\./);
  });

  test('вторая степень: дед, дядя по матери, свойственники — с пометой «выв.»', () => {
    // у вычисленного деда — стих второго звена (этап 19, К-04; ТЗ П-3: у каждого факта — стих)
    expect(sec('david', 6)).toMatch(/Дед по отцу: Овид Руф 4:17.*?выв\./);
    // одна форма строки § 12 (CARD-66): «Имя — кем приходится, уточнение»; у группы — «Невестки: … — жёны Иакова»
    expect(sec('ioav', 12)).toContain('Давид — дядя по матери, брат Саруии 1 Пар 2:16 выв.');
    // этап 19 (К-04): у свойственников — стихи брака и родства (Раав — мать Вооза по Мф 1:5)
    expect(sec('ruf', 12)).toMatch(/Раав — свекровь, мать Вооза Руф 4:10–21\s?; Мф 1:5.*?выв\./);
    expect(sec('isaak', 12)).toMatch(/Невестки: Лия, Рахиль, Валла и Зелфа — жёны Иакова Быт 29:23–30\s?; 30:4–9.*?выв\./);
  });

  test('вычисляемая родня — не сам владелец, не родители, дети, супруги, братья и не родня по терминам Писания', () => {
    const bad: string[] = [];
    for (const p of persons) {
      const known = new Set<string>([p.id]);
      for (const e of graph.parentsOf.get(p.id) ?? []) known.add(e.parent);
      for (const e of graph.childrenOf.get(p.id) ?? []) known.add(e.child);
      for (const s of graph.spousesOf.get(p.id) ?? []) known.add(s.a === p.id ? s.b : s.a);
      for (const s of siblings(graph, p.id)) known.add(s.id);
      for (const k of graph.kinOf.get(p.id) ?? []) known.add(k.from === p.id ? k.to : k.from);
      const seen = new Set<string>();
      for (const r of derivedKin(p.id))
        for (const x of r.ids) {
          if (known.has(x)) bad.push(`${p.id}: ${x} уже в семье`);
          if (seen.has(x)) bad.push(`${p.id}: ${x} дважды`);
          seen.add(x);
        }
    }
    expect(bad.slice(0, 10), `${bad.length}`).toEqual([]);
  });
});

describe('F7: § 14, § 15, § 16', () => {
  test('встреча: имя лица встречи не повторяется подписью, если оно есть в тексте («Авраам — встретил Аврама»)', async () => {
    const bad: string[] = [];
    for (const p of persons) {
      for (const mt of (await loadCard(p.id))?.card?.met ?? []) {
        const q = byId.get(mt.id)!;
        if (mt.text && new RegExp(`${q.name.slice(0, 4)}`, 'i').test(mt.text) && sec(p.id, 14).includes(`${q.name} — ${mt.text.slice(0, 12)}`)) bad.push(`${p.id}: ${mt.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('§ 15: места по роли — «Родился», «Жил», «Бывал», «События»; нет «— жительство», «— путь»', () => {
    const bad: string[] = [];
    for (const [id, s] of secs) if (/— (жительство|путь|связано с лицом)(?=\s+[0-9А-ЯЁ]|\s*$)|место рождения, см\./.test(s.get(15) ?? '')) bad.push(id);
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
    expect(sec('david', 15)).toMatch(/^Родился: Вифлеем \(см\. § 8\) Жил: Вифлеем 1 Цар 16:4; 17:15; 20:6; при дворе Саула/);
    expect(sec('david', 15)).toMatch(/Бывал: Рама, Наваф/);
    expect(sec('ruf', 15)).toMatch(/^Жила: /);
  });
});

describe('F9: полоса 66 книг', () => {
  test('одна строка из 66 клеток по группам книг; ступени светлоты 0–4', () => {
    const html = pages.get('david')!;
    const canon = /<div class="canon"[^>]*>(.*?)<\/div>/.exec(html)![1];
    expect(canon.match(/<span class="l\d"/g)).toHaveLength(66);
    expect(canon.match(/<span class="cg/g)).toHaveLength(8);
    expect(canonLevel(0, 10)).toBe(0);
    expect(canonLevel(1, 1000)).toBe(1);
    expect(canonLevel(1000, 1000)).toBe(4);
    // подсказка клетки — синодальным сокращением: «2 Цар: 230 стихов»
    expect(canon).toMatch(/title="2&nbsp;Цар: 230&nbsp;стихов"|title="2 Цар: 230 стихов"/);
  });
});

describe('F11: малые лица — краткая статья', () => {
  test('меньше трёх записей составителя — «Кратко» и одна раскрываемая строка вместо разделов', async () => {
    const bad: string[] = [];
    let small = 0;
    for (const p of persons) {
      const n = authoredCount((await loadCard(p.id))?.card ?? null);
      const t = texts.get(p.id)!;
      const compact = /Показать все сведения/.test(t);
      if (n < 3) small++;
      if (compact !== n < 3) bad.push(`${p.id}: записей ${n}, краткая статья — ${compact}`);
      if (compact && /<section class="sec/.test(pages.get(p.id)!)) bad.push(`${p.id}: разделы при краткой статье`);
    }
    expect(bad.slice(0, 10), `${bad.length} лиц`).toEqual([]);
    expect(small).toBeGreaterThan(100);
    expect(texts.get('zakkhur-syn-imriya')).toMatch(/Кратко: Сын Имрия\. Строил стену подле Иерихонцев Неем 3:2\. Показать все сведения/);
  });
});

describe('F12: имена в тексте фактов — ссылки', () => {
  test('Руфь: «Прабабка царя Давида» ведёт к Давиду', () => {
    // имя в тексте факта помечено data-in="text" (tests/card13.test.ts отличает его от ссылки строки родства)
    expect(pages.get('ruf')!).toMatch(/Прабабка царя <button class="person" data-id="david"(?: data-in="text")?>Давида<\/button>/);
  });

  test('ссылка — на лицо из окружения, с прописной, целым словом; на самого владельца ссылок нет', () => {
    const bad: string[] = [];
    for (const id of allIds) {
      const html = pages.get(id)!;
      const body = html.slice(html.indexOf('class="folio-body'));
      for (const m of body.matchAll(/(.)<button class="person" data-id="([^"]+)">([^<]*)<\/button>(.)/g)) {
        if (m[2] === id) bad.push(`${id}: ссылка на себя «${m[3]}»`);
        if (/[а-яё]/i.test(m[1]) || /[а-яё]/i.test(m[4])) bad.push(`${id}: ссылка внутри слова «${m[1]}${m[3]}${m[4]}»`);
      }
    }
    expect(bad.slice(0, 10), `${bad.length}`).toEqual([]);
  });
});

describe('F8: рейка', () => {
  test('24 метки с подписью состояния; текущая — aria-current', () => {
    const html = pages.get('melkhisedek')!;
    const rail = /<nav class="rail"[^>]*>(.*?)<\/nav>/.exec(html)![1];
    const labels = [...rail.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(24);
    expect(labels[8]).toBe('9 Супруги — в Писании не сообщается');
    // решение 66: типология Мелхиседека (Пс 109:4; Евр 5–7) — в § 22; § 21 у лица вне линий Мессии — «не относится»
    expect(labels[20]).toBe('21 В родословии Мессии — не относится');
    expect(labels[21]).toBe('22 Упоминания в других книгах — есть сведения');
    expect(labels[3]).toBe('4 Другие имена — в Писании не сообщается');
    expect(labels[0]).toBe('1 Имя — есть сведения');
    for (const id of allIds) {
      const st = states.get(id)!;
      const r = /<nav class="rail"[^>]*>(.*?)<\/nav>/.exec(pages.get(id)!);
      if (!r) continue; // краткая статья — без рейки
      const cls = [...r[1].matchAll(/<button type="button" class="([a-z]+)/g)].map((m) => m[1]);
      expect(cls, id).toEqual(SECTIONS.map((s) => (st[s.n] === 'header' ? 'content' : st[s.n])));
    }
  });
});
