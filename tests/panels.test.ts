/**
 * Панели этапа 5 (G1–G4, G6, G7, G9; docs/ui-review/README.md, раздел G): логика без браузера —
 * выравнивание синопсиса, ссылки в тексте главы, таблица § 20, указатель, «О карте», общая ось разворота, комбобокс.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { byId, loadCard, loadedCard, persons, volumes } from '../src/data/atlas.ts';
import type { Note } from '../src/data/types.ts';
import chapters from '../src/generated/chapters.json';
import { synopsisRows, OT_COLS, SynopsisPanel, type SynRow } from '../src/ui/panels/Synopsis.tsx';
import { linkChapter, chapterSequence, FIRST_VERSE, CHAPTERS, type Verse } from '../src/ui/panels/Chapter.tsx';
import { deathAge, SETS } from '../src/ui/panels/Section.tsx';
import { indexGroups } from '../src/ui/panels/Index.tsx';
import { anchorAlt, anchorYear, builtDate, AboutPanel } from '../src/ui/panels/About.tsx';
import { ChronologyPanel } from '../src/ui/panels/Chronology.tsx';
import { commonAxis } from '../src/ui/Spread.tsx';
import { personBlocks, personHits } from '../src/ui/top/Combobox.tsx';
import { resultBlocks } from '../src/ui/top/Search.tsx';
import { searchIndex } from '../src/ui/top/searchIndex.ts';

const NB = /[ ⁠]/g;
const plain = (s: string) => s.replace(NB, (c) => (c === ' ' ? ' ' : ''));
const html = (v: VNode) => plain(renderToString(v).replace(/&nbsp;|&#160;/g, ' '));
const body = (rows: SynRow[]) => rows.filter((r): r is Exclude<SynRow, { kind: 'note' }> => r.kind !== 'note');
const rowOf = (rows: SynRow[], id: string) => body(rows).find((r) => (r.kind === 'common' ? r.id === id : r.mt?.id === id || r.lk?.id === id));

beforeAll(async () => {
  // примечания карточек (скобки у Каинана, «нет в 1 Пар 3:19–20» у Авиуда) и иные имена — из томов
  for (const v of volumes) {
    const p = persons.find((x) => x.volume === v.volume);
    if (p) await loadCard(p.id);
  }
}, 60000);
const notesOf = (id: string): Note[] | null => loadedCard(id)?.notes ?? null;

describe('G2: синопсис — две линии выровнены, расхождения параллельными столбцами', () => {
  let rows: SynRow[] = [];
  beforeAll(() => {
    rows = synopsisRows(false, notesOf);
  });
  it('общие лица — одной строкой с номерами у обоих евангелистов', () => {
    const david = rowOf(rows, 'david')!;
    expect(david.kind).toBe('common');
    expect([david.mt?.no, david.lk?.no]).toEqual([14, 42]);
    const adam = rowOf(rows, 'adam')!;
    expect(adam.kind).toBe('common');
    expect(adam.mt?.flag).toBe('before-matthew'); // Матфей начинает с Авраама: номер у Мф — «не охватывает»
    expect(adam.lk?.no).toBe(75);
  });
  it('ниже Давида — Соломон против Нафана в одной строке, Иехония … Нирий; линии сходятся в Салафииле и Зоровавеле', () => {
    const r = rowOf(rows, 'solomon')!;
    expect(r.kind).toBe('split');
    expect([r.mt?.id, r.mt?.no, r.lk?.id, r.lk?.no]).toEqual(['solomon', 15, 'nafan-syn-davida', 41]);
    expect(rowOf(rows, 'salafiil')!.kind).toBe('common');
    expect(rowOf(rows, 'zorovavel')!.kind).toBe('common');
    const a = rowOf(rows, 'aviud-syn-zorovavelya')!;
    expect([a.kind, a.mt?.no, a.lk?.id]).toEqual(['split', 32, 'risay']);
    // трое царей, опущенных Матфеем (Мф 1:8), — в столбце Матфея с пометой
    for (const id of ['okhoziya-syn-iorama', 'ioas-syn-okhozii', 'amasiya']) expect(rowOf(rows, id)!.mt?.flag).toBe('omitted-by-mt');
  });
  it('вставки: Каинан — «у Луки больше», расхождение у Давида и у Зоровавеля, схождение в Салафииле и в Иисусе', () => {
    const notes = rows.filter((r): r is Extract<SynRow, { kind: 'note' }> => r.kind === 'note').map((r) => `${r.note.kind}:${r.note.kind === 'join' ? r.note.at : r.note.prev}`);
    expect(notes).toEqual(['extra:arfaksad', 'split:david', 'join:salafiil', 'split:zorovavel', 'join:iisus']);
    const k = rowOf(rows, 'kainan-syn-arfaksada')!;
    expect(k.kind === 'split' && !k.mt && k.lk?.no === 63).toBe(true);
  });
  it('столбцы Ветхого Завета: стих, скобки, «нет», иной отец; «не охватывает» — вне первой и последней ссылки', () => {
    const gen = OT_COLS.findIndex((c) => c.key === 'gen');
    const chr = OT_COLS.findIndex((c) => c.key === 'chr');
    const ruth = OT_COLS.findIndex((c) => c.key === 'ruth');
    expect(rowOf(rows, 'sif')!.ot[gen]).toEqual({ kind: 'ref', ref: 'Быт 5:3' });
    expect(rowOf(rows, 'kainan-syn-arfaksada')!.ot[gen].kind).toBe('bracket');
    expect(rowOf(rows, 'zorovavel')!.ot[chr]).toMatchObject({ kind: 'ref', via: 'fedaiya-syn-iekhonii', mother: false });
    expect(rowOf(rows, 'aviud-syn-zorovavelya')!.ot[chr]).toEqual({ kind: 'absent', ref: '1Пар 3:19-20' });
    expect(rowOf(rows, 'adam')!.ot[ruth].kind).toBe('out');
    expect(rowOf(rows, 'vooz')!.ot[ruth]).toMatchObject({ kind: 'ref' });
    expect(rowOf(rows, 'iisus')!.ot.every((c) => c.kind === 'out')).toBe(true);
  });
  it('Лк 3 как второе родословие Иосифа: вместо Марии — Иосиф с номером 1, линии сходятся в нём', () => {
    const f = synopsisRows(true, notesOf);
    const j = rowOf(f, 'iosif-muzh-marii')!;
    expect(j.kind).toBe('common');
    expect([j.mt?.no, j.lk?.no]).toEqual([41, 1]);
    expect(rowOf(f, 'mariya')).toBeUndefined();
    expect(rowOf(rows, 'mariya')!.lk?.flag).toBe('interpretation');
  });
  it('панель: шапка столбцов, заголовки строк, стихи вместо «●», вставка «Здесь линии расходятся: Соломон — Нафан»', () => {
    const out = html(h(SynopsisPanel, {}) as VNode);
    expect(out).toContain('<th scope="col">Мф 1</th>');
    expect(out).toContain('scope="row"');
    expect(out).not.toContain('●');
    expect(out).toMatch(/Здесь линии расходятся: .*Соломон.*Мф 1:6.* — .*Нафан.*Лк 3:31/);
  });
});

describe('G3: имена в тексте главы — ссылки на свои лица', () => {
  const ch = chapters as unknown as Record<string, Verse[]>;
  const ids = (c: string, n: number) => linkChapter(c, ch[c]).find((v) => v.n === n)!.parts.flatMap((p) => (typeof p === 'string' ? [] : [`${p.text}→${p.id}`]));
  it('Лк 3 открывается с 3:23, Мф 1 — с 1:1', () => {
    expect(FIRST_VERSE['Лк 3']).toBe(23);
    expect(FIRST_VERSE['Мф 1'] ?? 1).toBe(1);
    expect(CHAPTERS).toContain('Лк 3');
  });
  it('Лк 3: «Иисус» и «Ноев» — ссылки; одноимённые Иосифы, Матфаты и Левии — по порядку родословия', () => {
    expect(ids('Лк 3', 23)).toEqual(['Иисус→iisus', 'Иосифов→iosif-muzh-marii', 'Илиев→iliy-otets-marii']);
    expect(ids('Лк 3', 36)).toContain('Ноев→noy');
    expect(ids('Лк 3', 24)).toEqual(['Матфатов→matfat-lk3-24', 'Левиин→leviy-lk3-24', 'Мелхиев→melkhiy-lk3-24', 'Ианнаев→iannay', 'Иосифов→iosif-lk3-24']);
    expect(ids('Лк 3', 29)).toContain('Левиин→leviy-lk3-29');
    const seq = chapterSequence('Лк 3')!;
    expect(seq[0]).toBe('iosif-muzh-marii');
    expect(seq[seq.length - 1]).toBe('adam');
  });
  it('Лк 3:1–2: одноимённые различаются по уточнению — Ирод четвертовластник, Филипп, брат Ирода, Анна первосвященник', () => {
    expect(ids('Лк 3', 1)).toEqual(expect.arrayContaining(['Понтий Пилат→pontiy-pilat', 'Ирод→irod-antipa', 'Филипп→filipp-brat-iroda']));
    expect(ids('Лк 3', 2)).toContain('Анне→anna-pervosvyashchennik');
  });
  it('титулы и описательные имена не становятся ссылками («Сын», «Господень», «Дева»)', () => {
    expect(ids('Мф 1', 1)).toEqual(['Иисуса→iisus', 'Давидова→david', 'Авраамова→avraam']);
    expect(ids('Мф 1', 20).map((x) => x.split('→')[0])).toEqual(['Иосиф', 'Марию']);
  });
  it('1 Пар 3:22: Шехания и Шемаия — те, чьё родство стоит на этом стихе', () => {
    expect(ids('1Пар 3', 22).slice(0, 3)).toEqual(['Шехании→shekhaniya-syn-ovadii', 'Шемаия→shemaiya-syn-shekhanii', 'Шемаии→shemaiya-syn-shekhanii']);
  });
  it('вставка в [скобках] не сверяется и остаётся текстом', () => {
    const v = linkChapter('Быт 5', ch['Быт 5']).find((x) => x.n === 3)!;
    expect(v.parts.filter((p) => typeof p !== 'string').map((p) => (p as { id: string }).id)).toEqual(['adam', 'sif']);
    expect(v.parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')).toBe(ch['Быт 5'][2].t);
  });
});

describe('G4: сквозной раздел § 20', () => {
  it('возраст при смерти — названный в данных или сложенный из возраста при воцарении и лет царствования (выв.)', async () => {
    const hez = await loadCard('ezekiya');
    expect(deathAge(hez!.chrono)).toMatchObject({ age: 54, cert: 'inference' });
    const dav = await loadCard('david');
    expect(deathAge(dav!.chrono)).toMatchObject({ age: 70 });
    const sol = await loadCard('solomon');
    expect(deathAge(sol!.chrono)).toBeNull(); // возраст Соломона Писание не называет: не выдумывается
  });
  // этап 13 (решение 110; X4 Д3): Давид, Саул, Иевосфей и Соломон — «Цари единого царства»; «Цари Иудеи» — от Ровоама
  it('группы: цари Иудеи — по началу царствования, от Ровоама; Давид — в «Царях единого царства»', () => {
    const judah = SETS.find((s) => s.id === 'judah')!.ids();
    expect(judah[0]).toBe('rovoam');
    expect(judah).toContain('ezekiya');
    expect(SETS.find((s) => s.id === 'united')!.ids()[0]).toBe('saul');
    expect(SETS.find((s) => s.id === 'united')!.ids()).toContain('david');
  });
});

describe('G7: указатель', () => {
  it('одноимённые — по году рождения; лица без года — в конце', () => {
    const groups = indexGroups((id) => {
      const p = byId.get(id);
      return p ? ({ 'iosif-muzh-marii': -35, iosif: -1915, 'iosif-lk3-30': -450 } as Record<string, number>)[id] ?? null : null;
    });
    const jos = groups.find(([n]) => n === 'Иосиф')![1];
    expect(jos.slice(0, 3)).toEqual(['iosif', 'iosif-lk3-30', 'iosif-muzh-marii']);
    expect(jos.length).toBeGreaterThan(5);
  });
});

describe('G6: «О карте» по-русски', () => {
  it('годы опор — «966 г. до Р. Х. (Тиле)», дата сборки без второй точки', () => {
    expect(plain(anchorAlt('-966 (Тиле)'))).toBe('966 г. до Р. Х. (Тиле)');
    expect(plain(anchorYear(-4))).toBe('4 г. до Р. Х.');
    expect(plain(anchorAlt('28 (при счёте от единоличного правления, 14 г.)'))).toBe('28 г. по Р. Х. (при счёте от единоличного правления, 14 г.)');
    expect(builtDate('2026-09-27T07:36:00Z')).toMatch(/^27 сентября 2026$/);
  });
  // этап 13, решение 102: опоры, модели и напряжения — в панели «О хронологии»; «О карте» ссылается на неё
  it('панель: без «-966», служебных метрик, «г..» и номеров томов «01»; опоры по-русски — в «О хронологии»', () => {
    const about = html(h(AboutPanel, {}) as VNode).replace(/<[^>]+>/g, ' ');
    const chrono = html(h(ChronologyPanel, {}) as VNode).replace(/<[^>]+>/g, ' ');
    for (const out of [about, chrono]) {
      expect(out).not.toMatch(/-\d{3,4}\b/);
      expect(out).not.toMatch(/persons|lanes|Assyrian/i);
      expect(out).not.toMatch(/г\.\./);
      expect(out).not.toMatch(/(^|\s)0\d\s/);
      expect(out).not.toMatch(/ТЗ П-6/);
    }
    expect(about).toContain('О хронологии');
    expect(chrono).toContain('966 г. до Р. Х. (Тиле)');
  });
});

describe('G9: разворот', () => {
  it('общая ось мини-шкал — объединение окон двух лиц', () => {
    expect(commonAxis([-2200, -1900], [-2100, -1850])).toEqual([-2200, -1850]);
    expect(commonAxis(null, [-2100, -1850])).toBeUndefined();
  });
});

describe('G1: поле «Второе» — тот же комбобокс, что поиск', () => {
  it('те же строки, что у поиска, без строк-команд и без исключённого лица', () => {
    const hits = personHits('иосиф', (id) => id === 'iosif-muzh-marii');
    expect(hits.some((x) => x.id === 'iosif-muzh-marii')).toBe(false);
    const blocks = personBlocks(hits);
    expect(blocks.flatMap((b) => b.rows).every((r) => r.kind === 'person')).toBe(true);
    // поиск верхней строки: те же группы и строки-лица; в группе — ещё строка «Показать на небе» (решение 120)
    const all = searchIndex.search('иосиф', 60);
    const top = resultBlocks(all, { pinned: false, noAll: false, q: 'иосиф' });
    expect(top[0].rows[0]).toMatchObject({ kind: 'all', group: true });
    expect(top.map((b) => ({ ...b, rows: b.rows.filter((r) => r.kind !== 'all') }))).toEqual(personBlocks(all, 'иосиф'));
  });
  it('по стиху поле «Второе» не ищет: лицо выбирается по имени', () => {
    expect(personHits('Руф 4:21')).toEqual([]);
  });
});
