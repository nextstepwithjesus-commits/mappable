/**
 * Карточка лица, этап 13 (docs/ui-review/STAGE13.md, решения 96–100, 104, 106, 112; приёмка П16–П18 и X4 А7) — обход
 * всех карточек так, как их собирает интерфейс (buildSections, шапка, карточка союза, «Родство» у звезды).
 * Перед тестами нужна свежая сборка данных: npm run -s data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderToString } from 'preact-render-to-string';
import { h, type VNode } from 'preact';
import { persons, byId, graph, models, loadCard, lineMembership } from '../src/data/atlas.ts';
import { buildSections, childGroups } from '../src/ui/card/sections.tsx';
import { kidsInOrder, UnionCard } from '../src/ui/card/Union.tsx';
import { kinRows } from '../src/ui/card/kinrows.ts';
import { unionById, unionsOf } from '../src/ui/reveal.ts';
import { unionId } from '../src/engine/unions.ts';
import { shownYears } from '../src/engine/years.ts';
import { pluralPeopleName } from '../src/ui/text/ru.ts';

const m = models[0];
const html = (v: unknown) => renderToString(h('div', null, v as never) as VNode);
/** Лица по порядку появления в разметке (ссылки на лицо — button.person[data-id]). */
const idsIn = (s: string) => [...s.matchAll(/data-id="([^"]+)"/g)].map((x) => x[1]);
/** Идут ли лица xs в последовательности seq в том же порядке (по первому появлению). */
function sameOrder(seq: string[], xs: string[]): boolean {
  const at = xs.map((x) => seq.indexOf(x));
  if (at.some((i) => i < 0)) return true; // лица нет в разметке (под «ещё N») — порядок не проверяется здесь
  return at.every((v, i) => i === 0 || v > at[i - 1]);
}
const isLine = (x: string) => lineMembership.joseph.has(x) || lineMembership.mary.has(x);
const year = (k: string) => {
  const c = m.chrono.get(k);
  return c ? (shownYears(c)?.b ?? null) : null;
};

/** Лица с детьми хотя бы в одной группе из двух и больше. */
const parents = persons.filter((p) => childGroups(p.id).groups.some((g) => g.ids.length > 1)).map((p) => p.id);
const sec10 = new Map<string, string>();

beforeAll(async () => {
  for (const id of parents) {
    const data = await loadCard(id);
    const s = buildSections(id, byId.get(id)!, data?.card ?? null, m, m.chrono.get(id), '', data?.chrono ?? null);
    sec10.set(id, html(s.get(10) ?? null));
  }
}, 240_000);

describe('П16, решение 104: один порядок детей в § 10, в «Родстве» у звезды и в карточке союза', () => {
  it('внутри группы — порядок текста (order), дети без него — по году', () => {
    const bad: string[] = [];
    for (const id of parents)
      for (const g of childGroups(id).groups) {
        const ords = g.ids.map((k) => byId.get(k)!.order).filter((x): x is number => x !== null && x !== undefined);
        if (ords.some((v, i) => i > 0 && v < ords[i - 1])) bad.push(`${id}: порядок текста ${ords.join(',')}`);
        const free = g.ids.filter((k) => byId.get(k)!.order == null).map(year).filter((y): y is number => y !== null);
        if (free.some((v, i) => i > 0 && v < free[i - 1])) bad.push(`${id}: годы ${free.join(',')}`);
      }
    expect(bad).toEqual([]);
  });
  it('§ 10 = карточка союза: группа по второму родителю — дети союза в том же порядке', () => {
    const bad: string[] = [];
    for (const id of parents) {
      const f = byId.get(id)!.sex === 'f';
      for (const g of childGroups(id).groups) {
        const u = unionById(f ? unionId(g.other || null, id) : unionId(id, g.other || null));
        if (!u) continue;
        const card = idsIn(renderToString(h(UnionCard, { u, from: id }) as VNode));
        const inU = kidsInOrder(u.kids).filter((k) => g.ids.includes(k));
        if (inU.join() !== g.ids.filter((k) => u.kids.includes(k)).join() || !sameOrder(card, inU)) bad.push(`${id} / ${u.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('§ 10 = «Родство» у звезды: группы и дети в одном порядке', () => {
    const bad: string[] = [];
    for (const id of parents) {
      const row = kinRows(id, null).find((r) => r.kind === 'children');
      if (!row) continue;
      const kin = row.parts.flatMap((p) => (p.t === 'name' ? [p.id] : []));
      const ten = childGroups(id).groups.flatMap((g) => g.ids).filter((k) => kin.includes(k));
      const both = kin.filter((k) => ten.includes(k));
      if (both.join() !== ten.join()) bad.push(`${id}: «Родство» ${both.join(',')} ≠ § 10 ${ten.join(',')}`);
    }
    expect(bad).toEqual([]);
  });
  it('§ 10 на листе стоит в том же порядке', () => {
    // народ с именем во множественном числе («Мицраим», «Лудим») стоит своей строкой «От него произошли» (Быт 10:13)
    const plural = (k: string) => pluralPeopleName(byId.get(k)!.name, byId.get(k)!.kind);
    const bad = parents.filter((id) => !childGroups(id).groups.every((g) => sameOrder(idsIn(sec10.get(id) ?? ''), g.ids.filter((k) => !plural(k)))));
    expect(bad).toEqual([]);
  });
  it('Адам, Исаак, Иаков, Сим, Давид — порядок текста (X4, сценарий 2)', () => {
    const names = (id: string) => childGroups(id).groups.map((g) => g.ids.map((k) => byId.get(k)!.name).join(', '));
    expect(names('adam')[0]).toBe('Каин, Авель, Сиф');
    expect(names('isaak')[0]).toBe('Исав, Иаков');
    expect(names('iakov')[0]).toMatch(/^Рувим, Симеон, Левий, Иуда/);
    expect(names('sim')[0]).toBe('Елам, Ассур, Арфаксад, Луд, Арам');
    // союз с ребёнком линии — первым (CARD-57); первый сын от Вирсавии — первым по году (2 Цар 12:15–18)
    expect(names('david')[0]).toBe('Сын Давида и Вирсавии, Самус, Совав, Нафан, Соломон');
  });
  it('ребёнок линии Мессии не уходит под «ещё N»: Соломон виден в карточке союза Давида и Вирсавии', () => {
    const u = unionById(unionId('david', 'virsaviya'))!;
    const s = renderToString(h(UnionCard, { u, from: 'david' }) as VNode);
    expect(idsIn(s)).toContain('solomon');
    // у союза с большим числом детей ребёнок линии виден и за пределом первых восьми
    const bad: string[] = [];
    for (const p of persons)
      for (const uu of unionsOf(p.id)) {
        if (uu.a !== p.id || uu.kids.length <= 9) continue;
        const seq = idsIn(renderToString(h(UnionCard, { u: uu, from: p.id }) as VNode));
        for (const k of uu.kids) if ((graph.childrenOf.get(p.id) ?? []).length && isLine(k) && !seq.includes(k)) bad.push(`${uu.id}: ${k}`);
      }
    expect(bad).toEqual([]);
  });
});

/** Разметка разделов карточки: номер → HTML (без браузера: «ещё N» не режет перечни больше предела). */
async function sectionsHtml(id: string): Promise<Map<number, string>> {
  const data = await loadCard(id);
  const s = buildSections(id, byId.get(id)!, data?.card ?? null, m, m.chrono.get(id), '', data?.chrono ?? null);
  const out = new Map<number, string>();
  for (const [n, v] of s) out.set(n, html(v));
  return out;
}
const plain = (s: string) =>
  s
    .replace(/<\/(p|li|div|dd|dt|ul)>|<br\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/[   ⁠]/g, ' ')
    .replace(/\s+/g, ' ');

/**
 * Тёзки без уточнения в § 6–14 одной карточки (П18; X6 п. 4): в разделах названы два разных лица с одним именем (или
 * лицо с именем владельца), а ссылка на одно из них не сопровождается его уточнением «(…)».
 */
export function bareNamesakes(id: string, secs: Map<number, string>): string[] {
  const owner = byId.get(id)!;
  const links: { n: number; x: string; tail: string; row: string[] }[] = [];
  for (const n of [6, 7, 9, 10, 11, 12, 13]) {
    const s = secs.get(n) ?? '';
    const parts = s.split(/(?=<button[^>]*data-id=")/);
    // лица той же строки (пункт, абзац) до этой ссылки
    let row: string[] = [];
    for (const part of parts) {
      const mm = /^<button[^>]*data-id="([^"]+)"/.exec(part);
      // имя в тексте факта (data-in="text") — слова составителя: уточнение у него ставит linkNames, если текст не
      // называет его сам; здесь проверяются ссылки строк родства и формулы
      if (mm && !/^<button[^>]*data-in="text"/.test(part)) links.push({ n, x: mm[1], tail: plain(part.replace(/^<button[^>]*>.*?<\/button>/, '')).slice(0, 160), row: [...row] });
      if (mm) row.push(mm[1]);
      if (/<\/(li|p|dd)>/.test(part)) row = [];
    }
  }
  const byName = new Map<string, Set<string>>();
  for (const l of links) {
    const q = byId.get(l.x);
    if (!q || q.unnamed || l.x === id) continue;
    byName.set(q.name, (byName.get(q.name) ?? new Set()).add(l.x));
  }
  const out: string[] = [];
  for (const l of links) {
    const q = byId.get(l.x);
    if (!q || q.unnamed || l.x === id || !q.disambig) continue;
    const many = (byName.get(q.name)?.size ?? 0) > 1 || q.name === owner.name;
    if (!many) continue;
    // имя в пояснении строки («Фалмай — тесть, отец Маахи»): уточнение, которое называет лицо той же строки («дочь
    // Фалмая…»), повторило бы саму строку — строка уже различает тёзку (viaLink в sections.tsx)
    const stem = (name: string) => {
      const w = name.split(' ')[0].toLowerCase();
      return w.slice(0, Math.max(3, w.length - 1));
    };
    if (l.row.some((r) => { const h = byId.get(r); return !!h && !h.unnamed && q.disambig.toLowerCase().includes(stem(h.name)); })) continue;
    const want = plain(q.disambig.replace(/\s*\(([^)]*)\)/g, ', $1')).trim().slice(0, 10);
    // уточнение — в скобках за именем или (строка матери «мать — Авигея, жена Навала…; союз») через запятую
    if (!new RegExp(`^\\s*[(,]\\s*${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(l.tail)) out.push(`${id} § ${l.n}: ${q.name} (${l.x})`);
  }
  return out;
}

describe('П18, решение 106: тёзки в одной карточке — с уточнением при каждом упоминании', () => {
  it('Иехония: у обоих Седекий видно уточнение (§ 11 и § 12)', async () => {
    const s = await sectionsHtml('iekhoniya');
    expect(plain(s.get(11) ?? '')).toMatch(/Седекия \(сын Иоакима/);
    expect(plain(s.get(12) ?? '')).toMatch(/Седекия \(царь Иудейский/);
    expect(bareNamesakes('iekhoniya', s)).toEqual([]);
  });
  it('по всем карточкам: 0 тёзок без уточнения в § 6–13', async () => {
    const bad: string[] = [];
    for (const p of persons) bad.push(...bareNamesakes(p.id, await sectionsHtml(p.id)));
    expect(bad.slice(0, 60), `${bad.length} упоминаний`).toEqual([]);
  }, 600_000);
});

/** Текст разметки для проверок: теги — пробелами (как tests/helpers/cards.ts), без пробелов перед знаками. */
const flat = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/[\u00a0\u202f\u2009\u2060]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.;:)»])/g, '$1')
    .replace(/([(«]) /g, '$1')
    .trim();
const norm = (m: Map<string, string>) => new Map([...m].map(([k, v]) => [flat(k), flat(v)]));

describe('X4 А7: тексты всех карточек', () => {
  const all = new Map<string, { secs: Map<number, string>; pass: Map<string, string> }>();
  beforeAll(async () => {
    const { passport } = await import('./helpers/cards.ts');
    for (const p of persons) {
      const secs = await sectionsHtml(p.id);
      const t = new Map<number, string>();
      for (const [n, v] of secs) t.set(n, flat(v));
      all.set(p.id, { secs: t, pass: norm(await passport(p.id)) });
    }
  }, 600_000);
  it('нет «в втором», повторов слова подряд, сырых id, undefined, NaN, null', () => {
    const bad: string[] = [];
    for (const [id, { secs, pass }] of all) {
      const texts = [...[...secs].map(([n, t]) => [`§ ${n}`, t] as const), ...[...pass].map(([k, v]) => [k, v] as const)];
      for (const [where, t] of texts) {
        if (/(^|\s)в втором/.test(t)) bad.push(`${id} ${where}: «в втором»`);
        // слово дважды подряд — «сестры сестры»; кроме повторов Писания в кавычках («свят, свят»)
        // (кроме имени перед ссылкой на книгу того же имени: «Иов Иов 42:14»)
        const rep = /(^|[\s(])([А-Яа-яЁё]{3,}) \2(?=[,.;:)]|\s(?!\d)|$)/.exec(t.replace(/«[^»]*»/g, '«»'));
        if (rep) bad.push(`${id} ${where}: «${rep[2]} ${rep[2]}»`);
        if (/\b[a-z]+(?:-[a-z0-9]+)+\b|undefined|NaN|\bnull\b/.test(t)) bad.push(`${id} ${where}: служебный текст «${/\b[a-z]+(?:-[a-z0-9]+)+\b|undefined|NaN|\bnull\b/.exec(t)![0]}»`);
      }
    }
    expect(bad.slice(0, 30), `${bad.length}`).toEqual([]);
  });
  it('паспорт = § 20: год смерти и помета одни и те же', () => {
    const bad: string[] = [];
    for (const [id, { secs, pass }] of all) {
      const y = pass.get('Годы') ?? '';
      const s20 = secs.get(20) ?? '';
      const m = /(?:–|г\.[^—]*—)\s?(?:ок\.\s)?(\d+)/.exec(y);
      if (!m || !s20) continue;
      const first = /^(?:ок\.\s)?(\d+)\sг\./.exec(s20);
      if (!first) continue;
      if (first[1] !== m[1]) bad.push(`${id}: паспорт «${y}», § 20 «${s20.slice(0, 40)}»`);
      const markP = /(расч\.|выв\.)$/.exec(y)?.[1];
      const mark20 = /^[^.]*?г\.[^А-Я]*?(расч\.|выв\.)/.exec(s20)?.[1];
      if (markP && mark20 && markP !== mark20) bad.push(`${id}: помета паспорта «${markP}», § 20 «${mark20}»`);
    }
    expect(bad.slice(0, 30), `${bad.length}`).toEqual([]);
  });
  it('§ 20: возраст Писания — со стихом и без «по расчёту»; расчётный — «по расчёту»', async () => {
    const bad: string[] = [];
    for (const [id, { secs }] of all) {
      const s20 = secs.get(20) ?? '';
      if (!/в возрасте/i.test(s20)) continue;
      const died = (await loadCard(id))?.chrono?.died;
      const said = died?.age !== undefined && died.age >= 1 && !!died.refs?.length && (died.cert ?? 'scripture') !== 'interpretation';
      if (said && !new RegExp(`В возрасте ${died!.age} (год|года|лет) (\\d )?[А-ЯЁ][а-яё]* \\d`).test(s20)) bad.push(`${id}: возраст Писания без стиха: «${s20.slice(0, 80)}»`);
      if (said && /по расчёту/.test(s20.split('В возрасте')[1]?.slice(0, 30) ?? '')) bad.push(`${id}: возраст Писания «по расчёту»`);
      if (!said && /в возрасте/.test(s20) && !/в возрасте (около )?\d+ (год|года|лет) по расчёту/.test(s20)) bad.push(`${id}: расчётный возраст без «по расчёту»: «${s20.slice(0, 80)}»`);
    }
    expect(bad.slice(0, 30), `${bad.length}`).toEqual([]);
  });
  it('§ 21: заметка без обрывков после снятия номера (dropNums)', () => {
    const bad = [...all].filter(([, { secs }]) => /(^|\. )[а-яё]/.test(secs.get(21) ?? '')).map(([id, { secs }]) => `${id}: «${(secs.get(21) ?? '').slice(0, 80)}»`);
    expect(bad).toEqual([]);
  });
  it('паспорт: «Колено / народ» без «по толкованию» в строке; брак — строкой «По браку»; колено из § 7 (Павел, Анна)', () => {
    const bad: string[] = [];
    for (const [id, { pass }] of all) {
      const t = pass.get('Колено / народ') ?? '';
      if (/по толкованию|по браку/.test(t)) bad.push(`${id}: «${t}»`);
    }
    expect(bad).toEqual([]);
    expect([...all.get('mariya')!.pass.keys()]).toContain('По браку');
    expect(all.get('mariya')!.pass.get('Колено / народ')).toBe('колено Иудино, дом Давидов толк.');
    expect(all.get('mariya')!.pass.get('По браку')).toBe('колено Иудино (жена Иосифа)');
    expect(all.get('pavel')!.pass.get('Колено / народ')).toBe('колено Вениаминово');
    expect(all.get('anna-prorochitsa')!.pass.get('Колено / народ')).toBe('колено Асирово');
  });
  it('§ 12: термин Писания против родословия — «названа „матерью“ …; по родословию — бабка» (Аса, 3 Цар 15:10)', () => {
    expect(all.get('asa')!.secs.get(12)).toMatch(/^Мааха — названа «матерью» 3 Цар 15:10; 15:13; 2 Пар 15:16; по родословию — бабка выв\./);
    expect(all.get('maakha-doch-avessaloma')!.secs.get(12)).toMatch(/^Названа «матерью» Асы 3 Цар 15:10/);
  });
  it('§ 14 Илии: Преображение — «Вне земной жизни», а не среди встреч', () => {
    const t = all.get('iliya')!.secs.get(14) ?? '';
    const [meet, beyond] = t.split('Вне земной жизни');
    // у имён — годы (решение 100): «Иисус Христос (ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.) — беседовал…»
    expect(beyond).toMatch(/Иисус Христос( \([^)]*\))? — беседовал с Ним на горе Преображения/);
    expect(beyond).toMatch(/Иисус Христос \([^)]*по Р\. Х\.\)/);
    expect(meet).not.toMatch(/Преображения/);
  });
  it('§ 23: у народа — «Имя народа или земли названо…»', () => {
    const bad = persons.filter((p) => p.kind === 'people' && /^Имя названо/.test(all.get(p.id)!.secs.get(23) ?? '')).map((p) => p.id);
    expect(bad).toEqual([]);
  });
});

describe('П11, решения 97–98: эпоха жизни одна — паспорт, мини-шкала, диктор, § 13', () => {
  it('по всем лицам: строка «Эпоха» паспорта, подпись эпохи на мини-шкале и строка «Эпоха» § 13 называют одну эпоху', async () => {
    const { passport } = await import('./helpers/cards.ts');
    const { lifeBarLayout, lifeWindow } = await import('../src/ui/card/Masthead.tsx');
    const { lifeEpoch } = await import('../src/ui/card/shared.tsx');
    const bad: string[] = [];
    for (const p of persons) {
      if (p.kind === 'people' || p.kind === 'clan') continue;
      const c = m.chrono.get(p.id);
      const life = lifeEpoch(p.id, c, m.epochs);
      if (!life) continue;
      const pass = norm(await passport(p.id));
      // паспорт — видимая строка (её же читает диктор): первая строка значения — эпоха жизни
      if (!(pass.get('Эпоха') ?? '').startsWith(life.name)) bad.push(`${p.id}: паспорт «${pass.get('Эпоха')}» ≠ ${life.name}`);
      const win = lifeWindow(p.id);
      if (win) {
        const L = lifeBarLayout(p.id, win, 400, (t) => t.length * 7);
        const own = L?.epochLabels.find((l) => l.own);
        if (L?.bands.some((b) => b.own) && (!own || (own.text !== life.name && own.text !== life.short))) bad.push(`${p.id}: шкала «${own?.text}» ≠ ${life.name}`);
      }
      const s13 = flat((await sectionsHtml(p.id)).get(13) ?? '');
      if (s13 && !new RegExp(`Эпоха ${life.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(s13)) bad.push(`${p.id}: § 13 «${s13.slice(0, 80)}»`);
    }
    expect(bad.slice(0, 20), `${bad.length}`).toEqual([]);
  }, 600_000);
});

describe('Мини-шкала (решение 97): только концы жизни, начало царствования и «Р. Х.»; эра у каждой подписи через Р. Х.', () => {
  it('Мария: «Р. Х.» на оси, у каждого года — эра; Давид — «1010 — воцарение», эра у крайней правой', async () => {
    const { lifeBarLayout, lifeWindow } = await import('../src/ui/card/Masthead.tsx');
    const measure = (t: string) => t.length * 6;
    const mar = lifeBarLayout('mariya', lifeWindow('mariya')!, 460, measure)!;
    const texts = mar.axis.map((l) => flat(l.text));
    expect(texts).toContain('Р. Х.');
    for (const l of mar.axis) if (l.kind !== 'era') expect(flat(l.text), l.text).toMatch(/(до|по) Р\. Х\.$/);
    expect(mar.act).not.toBeNull();
    const dav = lifeBarLayout('david', lifeWindow('david')!, 460, measure)!;
    const dt = dav.axis.map((l) => flat(l.text));
    expect(dt.some((t) => /1010 — воцарение/.test(t))).toBe(true);
    expect(dt.filter((t) => /Р\. Х\./.test(t))).toHaveLength(1);
    expect(dav.axis[dav.axis.length - 1].text).toMatch(/до Р\. Х\.$/);
  });
  it('по всем лицам: на оси нет круглых промежуточных годов, окно через Р. Х. — эра у каждой подписи года', async () => {
    const { lifeBarLayout, lifeWindow } = await import('../src/ui/card/Masthead.tsx');
    const bad: string[] = [];
    for (const p of persons) {
      const win = lifeWindow(p.id);
      if (!win) continue;
      const L = lifeBarLayout(p.id, win, 400, (t) => t.length * 7);
      if (!L) continue;
      const crossing = win[0] < 1 && win[1] > 1;
      for (const l of L.axis) {
        if (!['life', 'reign', 'era'].includes(l.kind)) bad.push(`${p.id}: подпись «${l.text}»`);
        if (crossing && l.kind !== 'era' && !/(до|по) Р\. Х\.$/.test(l.text)) bad.push(`${p.id}: без эры «${l.text}»`);
      }
    }
    expect(bad.slice(0, 20), `${bad.length}`).toEqual([]);
  }, 300_000);
});

describe('решения 119, 130: закреплённая вкладка помнит место чтения; сохранённое читается с проверкой схемы', () => {
  it('readTabs: JSON null, чужая схема, испорченная строка — вкладок нет, без ошибки', async () => {
    const { readTabs } = await import('../src/ui/stack.ts');
    const known = (x: string) => ['david', 'ruf'].includes(x);
    expect(readTabs('null', known)).toEqual([]);
    expect(readTabs('{"tabs":[1,2]}', known)).toEqual([]);
    expect(readTabs('{oops', known)).toEqual([]);
    expect(readTabs('[null, 5, {"hue": 2}, "david"]', known)).toEqual([{ id: 'david', hue: 0 }]);
  });
  it('место чтения — только правдоподобное: раздел 1…24 и конечный сдвиг; иначе вкладка без места', async () => {
    const { readTabs } = await import('../src/ui/stack.ts');
    const known = (x: string) => ['david', 'ruf', 'moisey'].includes(x);
    const raw = JSON.stringify([
      { id: 'david', hue: 1, at: { sec: 17, off: 120.4 } },
      { id: 'ruf', hue: 2, at: { sec: 99, off: 0 } },
      { id: 'moisey', hue: 3, at: { sec: 13, off: 'x' } },
    ]);
    expect(readTabs(raw, known)).toEqual([
      { id: 'david', hue: 1, at: { sec: 17, off: 120 } },
      { id: 'ruf', hue: 2 },
      { id: 'moisey', hue: 3 },
    ]);
  });
  it('rememberPlace: пишет место только закреплённой карточке и не пишет то же место второй раз', async () => {
    const { cardTabs, rememberPlace } = await import('../src/ui/stack.ts');
    cardTabs.value = [{ id: 'david', hue: 0 }];
    rememberPlace('ruf', 10, 5);
    expect(cardTabs.value).toEqual([{ id: 'david', hue: 0 }]);
    rememberPlace('david', 17, 40);
    const once = cardTabs.value;
    expect(once).toEqual([{ id: 'david', hue: 0, at: { sec: 17, off: 40 } }]);
    rememberPlace('david', 17, 40);
    expect(cardTabs.value).toBe(once);
    cardTabs.value = [];
  });
});
