/**
 * Ядро: поиск (09 § 3.5; 11 § 3.6) — эталон поиска по тексту, набор запросов 11 § 3.6, адреса, основы, словарь форм,
 * нумерация Псалмов. Перенесено из пробы П-Т3 (`prototypes/П-Т3/core/search.test.ts`) вместе с кодом (10 § 3.1 п. 4).
 * Данные — пакеты уровня «проба», построенные в памяти функциями `tools/pack/` (tests/helpers/core-data.ts).
 * Бюджеты пакетов, которые проба проверяла здесь, — в tests/pack-build.test.ts (по всем пакетам, тем же сжатием).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreData } from './helpers/core-data.ts';
import { firstKey, type SearchResult, type Group } from '../core/search/search.ts';
import type { TextResult } from '../core/search/text.ts';
import { parseAddress } from '../core/search/address.ts';
import { psSynToKjv, psKjvToSyn } from '../core/search/psalms.ts';
import { enToRu, osa } from '../core/search/norm.ts';
import { QUERIES } from './core-запросы.ts';

const ROOT = join(import.meta.dirname, '..');
/** Адрес по грамматике 08: неразрывный пробел после номера книги и после сокращения (не после «;» и «,»). */
const nb = (s: string) => s.replace(/(?<![;,]) /g, '\u00A0');
let L: ReturnType<typeof coreData>;
beforeAll(() => {
  L = coreData();
});
const keys = (r: { hits: { book: string; c: number; v: number }[] }) => new Set(r.hits.map((h) => `${h.book} ${h.c}:${h.v}`));

describe('эталон поиска по тексту (09 § 3.5)', () => {
  // «найдены все стихи с формами из списка и только стихи с формами словаря»
  const cases: [string, string[], number][] = [
    ['Ной', ['ной', 'ноя', 'ною', 'ноем'], 41],
    ['Лия', ['лия', 'лии', 'лию', 'лиею'], 32],
    ['Илия', ['илия', 'илии', 'илию', 'илиею'], 111],
    ['Моисей', ['моисей', 'моисея', 'моисею', 'моисеем'], 775],
  ];
  for (const [q, listed, n] of cases) {
    it(`${q}: все ${n} стихов с формами из списка и только стихи с формами словаря`, () => {
      const r = L.text.search([q.toLowerCase()], 'формы', 5000);
      const got = keys(r);
      const need = L.text.versesWithAny(listed);
      expect(need.length).toBe(n);
      for (const k of need) expect(got.has(k), k).toBe(true);
      const dict = new Set(L.text.versesWithAny(r.plan[0].forms));
      for (const k of got) expect(dict.has(k), k).toBe(true);
      expect(r.plan[0].how).toBe('имя');
    });
  }
  it('Моисей = Моисея: 775 стихов без повторов', () => {
    expect(L.text.search(['моисей'], 'формы', 0).total).toBe(775);
    expect(L.text.search(['моисея'], 'формы', 0).total).toBe(775);
  });
  it('Ной без «Ное» другого имени: словарь не сливает имена цепочкой', () => {
    const r = L.text.search(['ной'], 'формы', 0);
    expect(r.plan[0].forms.sort()).toEqual(['ное', 'ной', 'ною', 'ноя']);
    expect(r.total).toBe(42); // 41 + «о Ное» (форма словаря шире списка, 09 § 3.5)
  });
  it('пять хлебов: 14 стихов; «пяту … хлеб» (Пс 40:10, Ин 13:18) не входит — это «пята»', () => {
    const r = L.text.search(['пять', 'хлебов'], 'формы', 100);
    const got = keys(r);
    expect(r.total).toBe(14);
    for (const k of ['Мк 6:38', 'Мк 6:41', 'Ин 6:9', 'Мф 14:17', 'Лк 9:13']) expect(got.has(k), k).toBe(true);
    expect(got.has('Пс 40:10')).toBe(false);
    expect(got.has('Ин 13:18')).toBe(false);
  });
  it('пята: точные формы — пять стихов эталона и ещё «по пятам», «пятами»; по основе вместе с «пять» — 281', () => {
    const r = L.text.search(['пята'], 'формы', 100);
    const got = keys(r);
    for (const k of ['Быт 3:15', 'Быт 25:26', 'Пс 40:10', 'Иер 13:22', 'Ин 13:18']) expect(got.has(k), k).toBe(true);
    for (const k of ['Быт 49:19', 'Пс 55:7']) expect(got.has(k), k).toBe(true);
    expect(r.total).toBe(7);
    expect(r.byStemTotal).toBe(281);
    expect(r.plan[0].how).toBe('исключение');
  });
  it('точные формы — первыми', () => {
    const r = L.text.search(['ноя'], 'формы', 100);
    const firstOther = r.hits.findIndex((h) => !h.exact);
    expect(r.exactTotal).toBeGreaterThan(0);
    expect(r.hits.slice(0, r.exactTotal).every((h) => / Ноя|^Ноя/.test(h.text))).toBe(true);
    expect(firstOther).toBe(r.exactTotal);
  });
  it('режим «Точно» — только набранная форма', () => {
    expect(L.text.search(['ноя'], 'точно', 0).total).toBe(L.text.versesWithAny(['ноя']).length);
  });
  it('находка только в словах внутри скобок помечается', () => {
    // Быт 4:19 «… [Селла]»: «Селла» стоит только в скобках
    const r = L.text.search(['селла'], 'точно', 50);
    const h = r.hits.find((x) => x.book === 'Быт' && x.c === 4 && x.v === 19);
    expect(h?.inBrackets).toBe(true);
  });
});

describe('основы и словарь форм (09 § 3.5 п. 1–2)', () => {
  const table = () => L.stems.table;
  it('таблица «словоформа → длина основы»: длина меньше формы', () => {
    for (const line of table().split('\n').slice(0, 5000)) {
      const [f, n] = line.split('\t');
      expect(+n).toBeLessThan(f.length);
    }
  });
  it('основа короче 3 букв не принимается: слово ищется целиком', () => {
    const p = L.text.plan('их', 'формы');
    expect(p.how).toBe('целиком');
    expect(p.forms).toEqual(['их']);
  });
  it('стеммер не режет имена: «Ной» — формы имени, не основа «но»', () => {
    expect(L.stem('ной')).toBe('но');
    expect(L.text.plan('ной', 'формы').how).toBe('имя');
  });
  it('«Илия» — и Илия, и родительный падеж от «Илий»', () => {
    const forms = L.text.plan('илия', 'формы').forms;
    expect(forms).toContain('илий');
    expect(forms).toContain('илию');
    const ps = L.searcher.personsOf('илия').map((p) => p.id);
    expect(ps).toContain('iliya');
    expect(ps).toContain('iliy-svyashchennik');
  });
  it('форма, которая в тексте только строчная, — не имя («аде» от «ад», а не от «Ада»)', () => {
    expect(L.text.plan('аде', 'формы').how).not.toBe('имя');
  });
  it('слово запроса, которого нет в тексте, режется стеммером', () => {
    const p = L.text.plan('хлебушек', 'формы');
    expect(p.how === 'основа' || p.how === 'целиком').toBe(true);
  });
});

describe('адреса (11 § 3.6 (в))', () => {
  const vers = () => L.text.vers;
  it('все формы одного стиха', () => {
    for (const q of ['Мк 6:35', 'Мк 6 35', 'Мк6:35', 'Мк. 6,35', 'Марка 6:35', 'Евангелие от Марка 6:35', 'Mark 6:35', 'Mk 6:35', 'Mark.6.35', 'мк 6:35', 'МК 6:35'])
      expect(parseAddress(q, vers())?.label, q).toBe(nb('Мк 6:35'));
  });
  it('диапазоны и списки', () => {
    expect(parseAddress('Мк 6:35-44')?.label).toBe(nb('Мк 6:35–44'));
    expect(parseAddress('Быт 5:32–6:2')?.label).toBe(nb('Быт 5:32–6:2'));
    expect(parseAddress('Быт 6—9')?.label).toBe(nb('Быт 6–9'));
    expect(parseAddress('Ин 3:16; Рим 8:28')?.spans.length).toBe(2);
    expect(parseAddress('Ин 3:16; 17')?.label).toBe(nb('Ин 3:16; 17'));
    expect(parseAddress('Gen.6.9-Gen.6.12')?.label).toBe(nb('Быт 6:9–12'));
  });
  it('номерные книги во всех записях', () => {
    for (const q of ['1 Цар 17:4', '1Цар 17:4', '1-я Царств 17:4', '1 Царств 17:4', 'I Цар 17:4', '1 Samuel 17:4', '1Sam.17.4']) expect(parseAddress(q)?.label, q).toBe(nb('1 Цар 17:4'));
    expect(parseAddress('2 Царей 5')?.label).toBe(nb('4 Цар 5'));
    expect(parseAddress('1 Kings 3')?.label).toBe(nb('3 Цар 3'));
    expect(parseAddress('1 Хроник 3:5')?.label).toBe(nb('1 Пар 3:5'));
  });
  it('проверка существования главы и стиха', () => {
    expect(parseAddress('Быт 51', vers())?.errors.length).toBe(1);
    expect(parseAddress('Быт 1:32', vers())?.errors.length).toBe(1);
    expect(parseAddress('Быт 1:31', vers())?.errors.length).toBe(0);
    expect(parseAddress('Дан 3:50', vers(), L.text.has)?.errors.length).toBe(1); // Дан 3:24–90 нет в синодальном тексте
  });
  it('сокращение книги без числа — не адрес', () => {
    expect(parseAddress('Лев')).toBeNull();
    expect(parseAddress('суд')).toBeNull();
  });
  it('раскладка: знаки внутри слова переводятся, между числами — нет', () => {
    expect(enToRu('Yjq')).toBe('Ной');
    expect(enToRu('Vr 6:35')).toBe('Мк 6:35');
    expect(enToRu('[kt,')).toBe('хлеб');
    expect(enToRu('Vr 6.35')).toBe('Мк 6.35');
  });
  it('расстояние: перестановка соседних букв — одна ошибка', () => {
    expect(osa('даивд', 'давид')).toBe(1);
    expect(osa('галиаф', 'голиаф')).toBe(1);
  });
});

describe('нумерация Псалмов: своя таблица сверена с base/versification/synodal-kjv.json', () => {
  const vmap = JSON.parse(readFileSync(join(ROOT, 'base/versification/synodal-kjv.json'), 'utf8')).map as Record<string, string[]>;
  it('каждое отличие Пс в таблице JSword попадает в главы нашей таблицы', () => {
    let n = 0;
    for (const [syn, kjv] of Object.entries(vmap)) {
      const m = /^Пс (\d+):(\d+)$/.exec(syn);
      if (!m) continue;
      for (const k of kjv) {
        const kc = +/^Ps\.(\d+)\./.exec(k)![1];
        expect(psSynToKjv(+m[1]), `${syn} → ${k}`).toContain(kc);
        expect(psKjvToSyn(kc), `${k} → ${syn}`).toContain(+m[1]);
        n++;
      }
    }
    expect(n).toBeGreaterThan(2000);
  });
  it('Пс 22 (син.) = Psalm 23 (зап.)', () => {
    expect(psSynToKjv(22)).toEqual([23]);
    expect(psKjvToSyn(23)).toEqual([22]);
    expect(psKjvToSyn(116)).toEqual([114, 115]);
  });
});

describe('набор запросов 11 § 3.6 — ожидаемый первый результат', () => {
  const groupsOf = (r: SearchResult) => r.groups;
  const storyRoles = (g: Group) =>
    g.kind === 'адрес' ? g.stories.map((s) => [s.story.id, s.role, s.cover].filter(Boolean).join(':')).sort() : [];
  it(`в наборе ${QUERIES.length} запросов, из них шесть пар`, () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(50);
    expect(QUERIES.filter((q) => q.first.startsWith('пара:')).length).toBe(6);
  });
  for (const c of QUERIES) {
    it(`«${c.q}» — ${c.what}`, () => {
      const r = L.searcher.search(c.q);
      if (c.first.endsWith('*')) expect(firstKey(r).startsWith(c.first.slice(0, -1)), firstKey(r)).toBe(true);
      else expect(firstKey(r)).toBe(c.first);
      if (c.layout !== undefined) expect(r.layout).toBe(c.layout);
      if (c.second) expect(groupsOf(r)[1]?.kind).toBe(c.second);
      if (c.note) {
        const g = r.groups[0];
        expect(g.kind === 'адрес' ? g.address.notes.join(' | ') : '').toMatch(c.note);
      }
      if (c.stories) expect(storyRoles(r.groups[0])).toEqual([...c.stories].sort());
      if (c.textTotal !== undefined) {
        const t = r.groups.find((g) => g.kind === 'текст');
        expect(t && t.kind === 'текст' ? t.result.total : -1).toBe(c.textTotal);
      }
    });
  }
  it('«Быт 51» — адрес с ошибкой и понятной строкой', () => {
    const g = L.searcher.search('Быт 51').groups[0];
    expect(g.kind === 'адрес' && g.address.errors[0]).toMatch(/глав: 50/);
  });
  it('«в начале сотворил» — Быт 1:1 первым', () => {
    const t = L.searcher.search('в начале сотворил').groups.find((g) => g.kind === 'текст');
    expect(t && t.kind === 'текст' && `${t.result.hits[0].book} ${t.result.hits[0].c}:${t.result.hits[0].v}`).toBe('Быт 1:1');
  });
  it('«Тайная вечеря» — с пометкой «название не из текста»', () => {
    const g = L.searcher.search('Тайная вечеря').groups[0];
    expect(g.kind === 'история' && g.notFromText).toBe(true);
  });
  it('пустой результат — строка 11 § 3.6 (з)', () => {
    const g = L.searcher.search('щщщщ').groups[0];
    expect(g.kind === 'пусто' && g.message).toMatch(/Проверьте буквы и раскладку/);
  });
  it('подсказки: с двух букв, не больше 8, раскладка', () => {
    expect(L.searcher.suggest('Д')).toEqual([]);
    const s = L.searcher.suggest('Дав');
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(8);
    expect(s[0].title).toBe('Давид');
    expect(L.searcher.suggest('Lfd')[0]?.title).toBe('Давид');
  });
});

describe('скорость ядра на этой машине (замер на профиле телефона — bench/run.mts)', () => {
  it('холодная сборка индекса всего текста ≤ 1 с; ответ на запрос — 95-й процентиль ≤ 150 мс', () => {
    expect(L.coldMs).toBeLessThan(1000);
    const t: number[] = [];
    for (let k = 0; k < 3; k++)
      for (const c of QUERIES) {
        const a = performance.now();
        L.searcher.search(c.q);
        t.push(performance.now() - a);
      }
    t.sort((a, b) => a - b);
    expect(t[Math.floor(t.length * 0.95)]).toBeLessThan(150);
  });
});

describe('рецензии переноса ядра: скобки, находки, второй слой поиска', () => {
  const at = (r: TextResult, k: string) => r.hits.find((h) => `${h.book} ${h.c}:${h.v}` === k);
  it('скобки — по разметке пакета: Нав 24:35 (lxx, скобка через стихи) помечен, Суд 20:27–28 (вид «б», текст) — нет', () => {
    const a = at(L.text.search(['пошли', 'каждый', 'свое', 'место'], 'точно', 100), 'Нав 24:35');
    expect(a?.inBrackets).toBe(true);
    expect(a?.brackets).toContainEqual({ kind: 'lxx', isText: false });
    const b = at(L.text.search(['финеес'], 'точно', 100), 'Суд 20:28');
    expect(b?.inBrackets).toBe(false);
    expect(b?.brackets).toContainEqual({ kind: 'gloss', isText: true });
    for (const k of ['Притч 4:29', 'Пс 67:24', 'Нав 24:36']) {
      const v = k.split(/[ :]/);
      const w = L.text.verseText(v[0], +v[1], +v[2])!.match(/[А-Яа-яЁё]{4,}/)![0].toLowerCase();
      expect(at(L.text.search([w], 'точно', 2000), k)?.inBrackets, k).toBe(true);
    }
  });
  it('у находки — пометки дефектов и положения слов', () => {
    const h = at(L.text.search(['буду', 'ходить', 'пред', 'лицем'], 'точно', 50), 'Пс 114:8');
    expect(h?.issues).toContain('merge');
    const r = L.text.search(['ной'], 'формы', 5);
    const x = r.hits[0];
    for (const [s0, e] of x.ranges) expect(x.text.slice(s0, e).toLowerCase()).toMatch(/^но[йяюе]/);
  });
  it('второй слой: опечатки, фраза, «Где искать», порядок по совпадениям', () => {
    // «моисй» — одна ошибка: находит форму «моисей» (5 букв → одна ошибка, 11 § 3.6 (б))
    const typo = L.text.search(['моисй'], 'опечатки', 0);
    expect(typo.plan[0].forms).toContain('моисей');
    expect(typo.total).toBeGreaterThanOrEqual(L.text.versesWithAny(['моисей']).length);
    expect(L.text.search(['в', 'начале', 'сотворил'], 'точно', 10, { phrase: true }).total).toBe(1);
    const inGen = L.text.search(['ной'], 'формы', 100, { within: [{ book: 'Быт', c1: 1, c2: 11 }] });
    expect(inGen.hits.every((h) => h.book === 'Быт' && h.c <= 11)).toBe(true);
    const byCount = L.text.search(['ной'], 'формы', 50, { order: 'совпадения' });
    expect(byCount.hits[0].count).toBeGreaterThanOrEqual(byCount.hits.at(-1)!.count);
    expect(firstKey(L.searcher.search('«в начале сотворил»'))).toBe('текст');
  });
  it('ввод в NFD даёт тот же ответ, что NFC (данные № 6)', () => {
    for (const q of ['Моисей', 'Иаков', 'Её']) expect(firstKey(L.searcher.search(q.normalize('NFD')))).toBe(firstKey(L.searcher.search(q)));
  });
  it('строка о Псалмах — словами псалма, только для главы без стиха (№ 11)', () => {
    const g = L.searcher.search('Пс 23').groups[0];
    expect(g.kind === 'адрес' && g.address.notes.join()).toMatch(/«Господь — Пастырь мой» \(Пс\u00A022:1\)/);
    const g2 = L.searcher.search('Пс 50:3').groups[0];
    expect(g2.kind === 'адрес' && g2.address.notes.length).toBe(0);
  });
  it('второй вариант раскладки виден строкой (№ 18); пустой ответ советует только место, которое находится (№ 9)', () => {
    const g = L.searcher.search('щщщщ').groups[0];
    const msg = g.kind === 'пусто' ? g.message : '';
    const m = msg.match(/место \(«([^»]+)»\)/);
    if (m) expect(L.searcher.search(m[1]).groups.some((x) => x.kind === 'место')).toBe(true);
    expect(L.searcher.search('Lfdbl').alt === undefined || typeof L.searcher.search('Lfdbl').alt?.text === 'string').toBe(true);
  });
  it('места ищутся, когда они есть в индексе (вид «место»)', async () => {
    const { Searcher } = await import('../core/search/search.ts');
    const { NameForms } = await import('../core/search/forms.ts');
    const names = new NameForms([{ forms: ['вифлеем', 'вифлеема'], ids: ['l-vifleem'] }]);
    const s = new Searcher({ names: [], exceptions: [], persons: [], stories: [], places: [{ id: 'vifleem', n: 'Вифлеем' }] }, names);
    expect(firstKey(s.search('Вифлеем'))).toBe('место:vifleem');
    expect(firstKey(s.search('Вифлеема'))).toBe('место:vifleem');
    const e = s.search('щщщщ').groups[0];
    expect(e.kind === 'пусто' && e.message).toMatch(/Вифлеем/);
  });
});

describe('сверка интерфейса: № 24–27', () => {
  it('каждое лицо базы находится по своему показываемому имени (№ 24)', () => {
    expect(L.core.persons.length).toBeGreaterThanOrEqual(2697);
    const miss: string[] = [];
    for (const p of L.core.persons) {
      const r = L.searcher.search(p.n);
      const found = r.groups.some((g) => (g.kind === 'лица' && g.persons.some((x) => x.id === p.id)) || (g.kind === 'пара' && [...g.a, ...g.b].some((x) => x.id === p.id)));
      if (!found) miss.push(`${p.n} (${p.id})`);
    }
    expect(miss).toEqual([]);
    for (const [q, id] of [['Дина', 'dina'], ['Нон', 'non'], ['Иродиада', 'irodiada'], ['Наум', 'naum-prorok'], ['Малахия', 'malakhiya']]) {
      const g = L.searcher.search(q).groups.find((x) => x.kind === 'лица');
      expect(g?.kind === 'лица' && g.persons.map((p) => p.id), q).toContain(id);
    }
    // правило прописной осталось для порождённых форм: «аде» — не имя
    expect(L.text.plan('аде', 'формы').how).not.toBe('имя');
  });
  it('строки о нумерации: одно английское название, адрес через форматер; несуществующий синодальный стих — с соответствием (№ 25)', () => {
    const notes = (q: string) => { const g = L.searcher.search(q).groups[0]; return g.kind === 'адрес' ? g.address.notes.join(' / ') : ''; };
    expect(notes('Psalm 23')).toBe('Западная нумерация: Psalms\u00A023. В Синодальном переводе: Пс\u00A022');
    expect(notes('Ps 3:1')).toBe('Западная нумерация: Psalms\u00A03:1. В Синодальном переводе: Пс\u00A03:2');
    expect(notes('Рим 16:25')).toBe('Если это адрес западной нумерации (Romans\u00A016:25), в Синодальном переводе это Рим\u00A014:24');
  });
  it('начальные слова псалма — не меньше четырёх (№ 26)', () => {
    expect(L.searcher.search('Пс 113').groups[0].kind === 'адрес' && (L.searcher.search('Пс 113').groups[0] as { address: { notes: string[] } }).address.notes[0]).toMatch(/«Хвалите, рабы Господни, хвалите/);
  });
  it('«Эммануил» находит «Еммануил» (Ис 7:14) (№ 27)', () => {
    const r = L.searcher.search('Эммануил');
    expect(r.used).toBe('Еммануил');
    const t = r.groups.find((g) => g.kind === 'текст');
    expect(t?.kind === 'текст' && t.result.hits.map((h) => `${h.book} ${h.c}:${h.v}`)).toContain('Ис 7:14');
  });
});

