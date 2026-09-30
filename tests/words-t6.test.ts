/**
 * Этап 13, T6 «Связи, показ, слова» (docs/ui-review/STAGE13.md, решения 105, 109, 110, 111; приёмка П17, П20):
 *  — карточка связи: слово уровня первым (П17), строка основания из § 24, неназванный конец строкой, «одна дочь»;
 *  — «Какая связь?» — одна форма строк;
 *  — «Родство» у звезды: лица линий Мессии не уходят под «ещё N» (решение 104);
 *  — строка показа: имя показа линий, пустой набор, лицо вне показа — «показать на всём небе»; лист «Показ» без лица;
 *  — «Сквозной раздел»: три группы царей, каждый царь — ровно в одной;
 *  — словарь: запретные слова в строках интерфейса (исходники экранов; DOM всех экранов — сценарий 1000 tools/accept/ui13.ts).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { byId, graph, lines, loadCard, persons } from '../src/data/atlas.ts';
import type { LinkKey } from '../src/engine/linkkey.ts';
import { unions } from '../src/ui/reveal.ts';
import { accOf, kidsCount, linkBasis, linkInfo, linkRow, linkSpeech, linkTitle } from '../src/ui/linkwords.ts';
import { contentOf, EMPTY_SET_TEXT, LINES_TITLE, showTitle, summaryOf } from '../src/ui/show.ts';
import { draftFor } from '../src/ui/panels/Show.tsx';
import { KING_SETS, SETS } from '../src/ui/panels/Section.tsx';
import { cutRow } from '../src/ui/sky/DotCard.tsx';
import { synopsisRows } from '../src/ui/panels/Synopsis.tsx';
import type { KinPart } from '../src/ui/card/kinrows.ts';

const plain = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\u2060/g, '');
const child = (union: string, c: string): LinkKey => ({ kind: 'child', union, child: c });

/** Все связи данных — как в linkwords-q3.test.ts. */
function allKeys(): LinkKey[] {
  const keys: LinkKey[] = [];
  for (const u of unions.byId.values()) {
    keys.push({ kind: 'union', union: u.id });
    for (const c of u.kids) keys.push({ kind: 'child', union: u.id, child: c });
    for (const p of [u.a, u.b]) if (p && u.a && u.b) keys.push({ kind: 'spouse', union: u.id, person: p });
  }
  for (const line of ['joseph', 'mary'] as const) for (const s of lines[line].persons.slice(1)) keys.push({ kind: 'step', line, child: s.id });
  for (const [id, es] of graph.kinOf) for (const e of es) if (e.from === id) keys.push({ kind: 'kin', a: e.from, b: e.to });
  return keys;
}

describe('П17: заголовок связи по толкованию и по выводу начинается словом уровня (решение 105)', () => {
  it('родительские, супружеские, шаги лент и родство словами: 100 %', () => {
    const n = { interpretation: 0, inference: 0 };
    for (const k of allKeys()) {
      if (k.kind === 'union') continue;
      const i = linkInfo(k)!;
      if (i.cert !== 'interpretation' && i.cert !== 'inference') continue;
      n[i.cert]++;
      expect(plain(i.title), JSON.stringify(k)).toMatch(i.cert === 'interpretation' ? /^По толкованию: / : /^Вывод: /);
      expect(i.lead).not.toBeNull();
      expect(plain(linkSpeech(k))).toMatch(/^Связь — (по толкованию|вывод): /);
    }
    // X4 § 1 Д2: 48 + 48 родительских, 5 + 14 супружеских, 20 родства — после сверки данных не меньше сотни
    expect(n.interpretation + n.inference).toBeGreaterThan(100);
  });
  it('снимок 20: «По толкованию: Илий и его жена — родители; Мария — дочь»; строка «Мать — в Писании не названа»', () => {
    const k = child('u:iliy-otets-marii+', 'mariya');
    expect(plain(linkTitle(k))).toBe('По толкованию: Илий и его жена — родители; Мария — дочь');
    expect(linkInfo(k)!.missing).toEqual({ role: 'Мать', text: 'в Писании не названа' });
    expect(plain(linkTitle({ kind: 'step', line: 'mary', child: 'mariya' }))).toBe('По толкованию: Илий — отец; Мария — дочь');
    expect(linkInfo({ kind: 'step', line: 'mary', child: 'mariya' })!.missing?.role).toBe('Мать');
  });
  it('Писание — без слова уровня и без строки основания', () => {
    const k = child('u:iakov+rakhil', 'iosif');
    expect(linkInfo(k)!.lead).toBeNull();
    expect(linkBasis(k)).toBeNull();
  });
  it('строка основания — предложение § 24 конца связи, где назван другой конец; карточки не загружены — их просят', { timeout: 30_000 }, async () => {
    const k = child('u:iliy-otets-marii+', 'mariya');
    const before = linkBasis(k)!;
    await Promise.all(before.need.map((id) => loadCard(id)));
    const b = linkBasis(k)!;
    expect(b.need).toEqual([]);
    expect(b.from).toBe('mariya');
    expect(plain(b.text)).toMatch(/Илий/);
    expect(plain(b.text)).toMatch(/^Первое понимание: Лк 3 — родословие Марии/);
  });
  it('у каждой связи по толкованию и по выводу есть строка основания — своя или словами уровня', { timeout: 60_000 }, async () => {
    const ks = allKeys().filter((k) => k.kind !== 'union' && linkInfo(k)!.lead);
    const ids = new Set(ks.flatMap((k) => linkInfo(k)!.ends.map((e) => e.id)));
    await Promise.all([...ids].map((id) => loadCard(id)));
    let own = 0;
    for (const k of ks) {
      const b = linkBasis(k)!;
      expect(b.text.length, JSON.stringify(k)).toBeGreaterThan(10);
      expect(b.text).not.toMatch(/undefined|null/);
      if (b.from) own++;
    }
    expect(own).toBeGreaterThan(0);
  });
});

describe('слова связи этапа 13', () => {
  it('число детей словами: «одна дочь», «один сын», «6 сыновей и одна дочь»', () => {
    expect(kidsCount(unions.byId.get('u:iliy-otets-marii+')!)).toBe('одна дочь');
    expect(kidsCount(unions.byId.get('u:iakov+liya')!)).toBe('6 сыновей и одна дочь');
    const one = [...unions.byId.values()].find((u) => u.kids.length === 1 && byId.get(u.kids[0])?.sex === 'm' && !u.claim)!;
    expect(kidsCount(one)).toBe('один сын');
  });
  it('«Какая связь?» — одна форма: «… — родители; … — сын», союз целиком — «… — союз: …», «мать не названа» — в конце', () => {
    expect(plain(linkRow({ kind: 'union', union: 'u:ioram-syn-iosafata+gofoliya' }))).toMatch(/^Иорам и Гофолия — (родители; Охозия — сын|союз: Охозия)/);
    const d = unions.byId.get('u:david+')!;
    expect(d.kids.length).toBeGreaterThan(1);
    expect(plain(linkRow({ kind: 'union', union: d.id }))).toMatch(/^Давид — союз: .+; мать не названа$/);
    expect(plain(linkRow(child(d.id, d.kids[0])))).toMatch(/^Давид — отец; \S+ — (сын|дочь); мать не названа$/);
    expect(plain(linkRow({ kind: 'union', union: 'u:iakov+rakhil' }))).toBe('Иаков и Рахиль — союз: Иосиф, Вениамин');
  });
  it('цепочка ленты (решение 93, К4; контракт 2): «Давид … Мария — 41 поколение по Лк 3; скрыто 40»', () => {
    const k: LinkKey = { kind: 'span', line: 'mary', from: 'david', to: 'mariya' };
    const i = linkInfo(k)!;
    expect(plain(i.body)).toBe('Давид … Мария — 41 поколение по Лк 3; скрыто 40');
    // шаг Илий → Мария — толкование: уровень цепочки — худший из шагов
    expect(plain(i.title)).toBe('По толкованию: Давид … Мария — 41 поколение по Лк 3; скрыто 40');
    expect(i.ends.map((e) => [e.id, e.role])).toEqual([
      ['david', 'предок'],
      ['mariya', 'потомок'],
    ]);
    expect(i.lines.map((l) => l.line)).toEqual(['mary']);
    expect(plain(i.refs[0])).toMatch(/^Лк 3:23-3\d$/);
    expect(plain(i.note ?? '')).toBe('В этом показе лента сжата: скрыто 40 (Нафан … Илий)');
    expect(linkInfo({ kind: 'span', line: 'mary', from: 'mariya', to: 'david' })).toBeNull();
  });
  it('команда «показать Илия»: винительный — только там, где он равен родительному', () => {
    expect(accOf('iliy-otets-marii')).toBe('Илия');
    expect(accOf('david')).toBe('Давида');
    expect(accOf('mariya')).toBeNull();
    expect(accOf('iuda')).toBeNull();
  });
});

describe('«Родство» у звезды: лица линий Мессии не уходят под «ещё N» (решение 104)', () => {
  const n = (id: string, line = false): KinPart => ({ t: 'name', id, key: { kind: 'union', union: `u:${id}+` }, ...(line ? { line: true } : {}) });
  const t = (text: string): KinPart => ({ t: 'text', text });
  const words = (ps: KinPart[]) => ps.map((p) => (p.t === 'name' ? p.id : p.text)).join('');
  it('Давид: «Вирсавия: Самуа, Шовав, Нафан, Соломон; …» — видны Вирсавия, Нафан и Соломон', () => {
    const parts = [n('Вирсавия'), t(': '), n('Самуа'), t(', '), n('Шовав'), t(', '), n('Нафан', true), t(', '), n('Соломон', true), t('; '), n('Ахиноама'), t(': '), n('Амнон')];
    const r = cutRow(parts, 2);
    expect(words(r.shown)).toBe('Вирсавия: Самуа, Нафан, Соломон');
    expect(r.rest).toBe(3);
    expect(r.firstHidden).toBe(2);
  });
  it('одно лишнее имя не прячется; без лиц линий — как прежде: первые limit и «ещё N»', () => {
    const parts = [n('А'), t(', '), n('Б'), t(', '), n('В')];
    expect(words(cutRow(parts, 2).shown)).toBe('А, Б, В');
    const more = [...parts, t(', '), n('Г')];
    const r = cutRow(more, 2);
    expect(words(r.shown)).toBe('А, Б');
    expect(r.rest).toBe(2);
  });
  it('заголовок группы виден, если видно имя его группы; пропуск между группами — «; »', () => {
    const parts = [n('Ахиноама'), t(': '), n('Амнон'), t('; '), n('Авигея'), t(': '), n('Далуия'), t('; '), n('Вирсавия'), t(': '), n('Самуа'), t(', '), n('Соломон', true)];
    expect(words(cutRow(parts, 2).shown)).toBe('Ахиноама: Амнон; Вирсавия: Соломон');
  });
});

describe('строка показа и лист «Показ» (решения 110, 111)', () => {
  it('показ линий — «Родословие Иисуса Христа (Мф 1, Лк 3)», как начало', () => {
    expect(LINES_TITLE).toBe('Родословие Иисуса Христа (Мф 1, Лк 3)');
    expect(plain(summaryOf({ kind: 'lines' }).label)).toMatch(/^На небе: родословие Иисуса Христа \(Мф 1, Лк 3\) — \d+ лиц/);
    expect(showTitle({ kind: 'key' })).toBe('ключевые лица');
  });
  it('пустой набор: строка говорит, что делать; «всё небо» — рядом', () => {
    const s = summaryOf({ kind: 'set' }, contentOf({ kind: 'set' }, new Map()));
    expect(s.label).toBe(`На небе: ${EMPTY_SET_TEXT}`);
    expect(s.cmds.map((c) => c.text)).toContain('всё небо');
  });
  it('«Предки и потомки лица…» без лица — черновик без лица (поле лица в фокусе), а не прежний показ', () => {
    expect(draftFor('lineage', { kind: 'all' }, null)).toEqual({ kind: 'lineage', id: '', dir: 'down', gen: null, by: 'father' });
    expect(draftFor('lineage', { kind: 'all' }, 'iuda')).toMatchObject({ kind: 'lineage', id: 'iuda' });
  });
});

describe('второе родословие Иосифа (решения 107, 110): шаг «Илий → Иосиф» — связь графа «по Луке»', () => {
  it('в графе у Иосифа — утверждение «по Луке» на Илия (Лк 3:23); синопсис берёт его стихи и помету', () => {
    const e = (graph.parentsOf.get('iosif-muzh-marii') ?? []).find((x) => x.parent === 'iliy-otets-marii' && x.claim === 'by-luke');
    expect(e, 'запись 107 (T3)').toBeTruthy();
    const rows = synopsisRows(true);
    const lk = rows.flatMap((r) => (r.kind === 'note' ? [] : [r.lk])).find((x) => x?.id === 'iosif-muzh-marii');
    expect(lk?.flag).toBe('by-luke');
    expect(lk?.refs).toEqual(e!.refs);
    expect(rows.flatMap((r) => (r.kind === 'note' ? [] : [r.lk?.id])).includes('mariya')).toBe(false);
  });
});

describe('«Сквозной раздел»: три группы царей (решение 110; X4 А8)', () => {
  const set = (id: string) => SETS.find((s) => s.id === id)!.ids();
  it('имена групп — одни с ярусами и созвездием', () => {
    expect(SETS.filter((s) => s.kings).map((s) => s.name)).toEqual([KING_SETS.united, KING_SETS.judah, KING_SETS.israel]);
    expect(KING_SETS).toEqual({ united: 'Цари единого царства', judah: 'Цари Иудеи', israel: 'Цари Израиля (северного)' });
  });
  it('Саул, Иевосфей, Давид, Соломон — цари единого царства; Цари Иудеи — от Ровоама', () => {
    expect(set('united')).toEqual(['saul', 'ievosfey', 'david', 'solomon']);
    expect(set('judah')[0]).toBe('rovoam');
    expect(set('judah')).not.toContain('david');
  });
  it('каждый царь Израиля или Иудеи — ровно в одной группе (Авимелех, «Сихем и Израиль», — вне групп)', () => {
    const groups = SETS.filter((s) => s.kings).map((s) => s.ids());
    for (const p of persons) {
      if (!p.reign.some((r) => /Израил|Иуд/.test(r.over)) || p.id === 'avimelekh-syn-gedeona') continue;
      expect(groups.filter((g) => g.includes(p.id)).length, p.id).toBe(1);
    }
  });
});

describe('П20: словарь интерфейса — запретных слов нет в строках экранов (решение 109)', () => {
  // строки интерфейса — в разметке и строковых литералах; комментарии не в счёт
  const FORBIDDEN = [/Только (его|её) род/, /Показать концы/, /\bобход(а|ов)?\b/, /Отобрать:/, /в режиме «/, /Дневная карта/, /Показать набор на небе/, /Род лица…/];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk(join(__dirname, '../src/ui'));
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  // «Дневная карта» — имя темы в образце (ТЗ § 5.2, таблица цветов); T1 решает о нём отдельно
  const allowed = (file: string, re: RegExp) => /Specimen\.tsx$/.test(file) && re.source.includes('Дневная');
  it('в моих экранах — ноль; в чужих — перечислено для владельцев', () => {
    const hits: string[] = [];
    for (const f of files) {
      const src = strip(readFileSync(f, 'utf8'));
      for (const re of FORBIDDEN) if (re.test(src) && !allowed(f, re)) hits.push(`${f.replace(/.*src\//, 'src/')}: ${re.source}`);
    }
    const mine = /src\/ui\/(linkwords|show|work|stack|reveal|address)\.ts|src\/ui\/sky\/(DotCard|Which|ShowBar|Overlays|view)\.tsx?|src\/ui\/panels\/(Show|Section|Index|Kinship|Chapter|Work|Synopsis)\.tsx|src\/ui\/Spread\.tsx|src\/ui\/top\//;
    expect(hits.filter((h) => mine.test(h))).toEqual([]);
  });
});
