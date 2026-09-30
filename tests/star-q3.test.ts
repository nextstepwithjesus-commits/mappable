/**
 * Карточка у звезды и лист «Показ» (этап 11, решения 77, 81, 82; STAGE11.md § 5–7; задача Q3):
 *  — блок «Родство» по графу и союзам (src/ui/card/kinrows.ts): подписи строк, родители с неназванной матерью
 *    (решение 75), утверждения «по закону», жёны с «наложница», дети по порядку, братья по отцу; при пропуске поколений
 *    (fatherGap; DF1) — «Предок» и «потомки», а братьями такие лица не считаются; «Год» — с пометой порядка Q1;
 *  — строки карточек, перешедшие из древа (src/ui/card/star.ts, Avatar.tsx; прежде — tests/tree-n1.test.ts):
 *    «другие сыновья и дочери» (Быт 5:4), вид союза, пустое место, команда детей союза, образы лиц;
 *  — место карточки (placeCard; Я25): пока на небе есть место — ни одного px² запретного; нет места — органы неба
 *    и знак не закрываются никогда, звёзды семьи — только если иначе нельзя;
 *  — строка показа (ShowBar) и лист «Показ» (виды, поиск созвездия по правилам главного поиска).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { graph, models, persons } from '../src/data/atlas.ts';
import { buildUnions } from '../src/engine/unions.ts';
import { familyOf, kinRows, yearHow, type KinRow } from '../src/ui/card/kinrows.ts';
import { kidsCommand, othersNote, othersUnionOf, unionKindLine, unnamedText } from '../src/ui/card/star.ts';
import { FEMALE_VARIANTS, lookOf, MALE_VARIANTS, variantOf } from '../src/ui/card/Avatar.tsx';
import { overlap, placeCard } from '../src/ui/sky/DotCard.tsx';
import { personOrderNote } from '../src/render/links.ts';
import { setShow } from '../src/ui/show.ts';
import { ShowBar } from '../src/ui/sky/ShowBar.tsx';
import { closeShowSheet, groupMatches, KINDS, openShowSheet, showSheet } from '../src/ui/panels/Show.tsx';
import { Masthead } from '../src/ui/card/Masthead.tsx';

const U = buildUnions(graph);
const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '');
/** Строка «Родства» текстом: имена — по id. */
const rowText = (r: KinRow) => flat(r.parts.map((p) => (p.t === 'text' ? p.text : `[${p.id}]`)).join(''));
const rows = (id: string) => Object.fromEntries(kinRows(id, yearHow(id, personOrderNote(id, models[0]))).map((r) => [r.kind, r]));

describe('блок «Родство» (решение 77; STAGE11.md § 6)', () => {
  it('Хам: «Родители — Ной и его жена» (решение 75), сыновья, братья, год по порядку перечисления', () => {
    const r = rows('kham');
    expect(Object.keys(r)).toEqual(['parents', 'children', 'siblings', 'year']);
    expect(r.parents.label).toBe('Родители');
    expect(rowText(r.parents)).toBe('[noy] и его жена');
    expect(r.children.label).toBe('Сыновья');
    // этап 13, решение 104: порядок текста (Быт 10:6: «Хуш, Мицраим, Фут и Ханаан»), как в § 10 и карточке союза
    expect(rowText(r.children)).toBe('[khush-syn-khama], [mitsraim], [fut], [khanaan]');
    expect(r.siblings.label).toBe('Братья');
    expect(rowText(r.siblings)).toBe('[sim], [iafet]');
    // помета порядка — от неба (стык 5, personOrderNote): диапазон стихов, где названы дети этого союза
    expect(rowText(r.year)).toMatch(/^по порядку перечисления, Быт 5:32.*, выв\.$/);
  });
  // этап 12, решение 92 («все дети по союзам»): при двух союзах с детьми и больше строка детей — группами «от Лии — …»;
  // порядок внутри союза — прежний, по рождению
  it('Иаков: четыре жены — наложница помечена; дети по союзам; приёмные сыновья помечены; брат Исав', () => {
    const r = rows('iakov');
    expect(rowText(r.parents)).toBe('[isaak] и [revekka]');
    expect(r.spouses.label).toBe('Жёны');
    expect(rowText(r.spouses)).toBe('[liya], [rakhil], [valla] (наложница), [zelfa]');
    expect(r.children.label).toBe('Дети');
    const kids = rowText(r.children);
    expect(kids.startsWith('от Лии — [ruvim], [simeon], [leviy], [iuda]')).toBe(true);
    expect(kids).toContain('; от Рахили — [iosif], [veniamin]');
    expect(kids).toContain('[dina]');
    expect(kids).toContain('[manassiya] (приёмный)');
    expect(r.siblings.label).toBe('Брат');
    expect(rowText(r.siblings)).toBe('[isav]');
  });
  it('у каждого имени — ключ связи для подсветки и карточки связи (§ 8): у сына Иосифа — союз Иакова и Рахили', () => {
    const r = rows('iakov');
    expect(r.children.keys).toContainEqual({ kind: 'child', union: 'u:iakov+rakhil', child: 'iosif' });
    const j = rows('iosif');
    expect(j.parents.keys).toEqual([{ kind: 'child', union: 'u:iakov+rakhil', child: 'iosif' }, { kind: 'child', union: 'u:iakov+rakhil', child: 'iosif' }]);
    for (const row of Object.values(j)) expect(row.keys.length).toBe(row.parts.filter((p) => p.t === 'name').length);
  });
  it('Иисус Христос: «Иосиф (по закону) и Мария»; братья Господни — словами Писания', () => {
    const r = rows('iisus');
    expect(rowText(r.parents)).toBe('[iosif-muzh-marii] (по закону) и [mariya]');
    expect(rowText(r.siblings)).toContain('[iakov-brat-gospoden]');
  });
  it('пропуск поколений (fatherGap; DF1): Шевуил — «Предок» Гирсам, не сын; у Гирсама — «потомки — Шевуил»; братьев через пропуск нет', () => {
    const s = rows('shevuil-syn-girsama');
    expect(s.parents.label).toBe('Предок');
    expect(rowText(s.parents)).toBe('[girsam]');
    expect(s.siblings).toBeUndefined();
    expect(rowText(s.year)).toBe('оценка по поколениям; родословие может пропускать поколения');
    expect(rowText(rows('girsam').children)).toBe('[ionafan-syn-girsama]; потомки — [shevuil-syn-girsama]');
    // Зихрий «из сыновей Асафа» — не брат сыновьям Асафа
    expect(rows('zikhriy-syn-asafa').siblings).toBeUndefined();
    expect(rowText(rows('asaf').children)).toMatch(/; потомки — \[zikhriy-syn-asafa\]$/);
  });
  it('семья первого поколения — те, кого карточка не закрывает (§ 6): у Хама — отец, сыновья, братья', () => {
    expect(familyOf('kham')).toEqual(['noy', 'khush-syn-khama', 'mitsraim', 'fut', 'khanaan', 'sim', 'iafet']);
  });
  it('у народа и рода года нет (решение 23); «Год» — всегда с пометой, как получен', () => {
    const people = persons.find((p) => p.kind === 'people')!;
    expect(rows(people.id).year).toBeUndefined();
    for (const id of ['adam', 'david', 'ruf', 'enokh-syn-kaina']) {
      const y = rows(id).year;
      if (y) expect(rowText(y)).toMatch(/(расч\.|выв\.|не установлено|поколения)$/);
    }
  });
});

describe('строки карточек, перешедшие из древа (прежде — tests/tree-n1.test.ts)', () => {
  it('«другие сыновья и дочери» (Быт 5:4): запись § 10 у отца; у Евы (о матери не сказано) — нет', () => {
    expect(othersNote({ childrenNote: [{ text: 'По рождении Сифа родил сынов и дочерей; их имена не названы', refs: ['Быт 5:4'] }] })?.refs).toEqual(['Быт 5:4']);
    expect(othersNote({ childrenNote: [{ text: 'Мать Каина, Авеля и Сифа; о матери других сынов и дочерей Адама (Быт 5:4) не сказано', refs: ['Быт 5:4'] }] })).toBeNull();
    expect(othersUnionOf(U, 'adam')?.id).toBe('u:adam+eva');
    expect(othersUnionOf(U, 'sif')?.id).toBe('u:sif+');
    expect(othersUnionOf(U, 'avraam')).toBeNull();
  });
  it('союз: вид связи словами данных; неназванная жена; законный отец; наложница', () => {
    expect(unionKindLine(U.byId.get('u:adam+eva')!)).toBe('Ева — жена Адама');
    expect(unionKindLine(U.byId.get('u:sif+')!)).toBe('имя жены в Писании не названо');
    expect(unionKindLine(U.byId.get('u:iosif-muzh-marii+mariya')!)).toBe('Иосиф — законный отец');
    expect(unionKindLine(U.byId.get('u:avraam+khettura')!)).toBe('Хеттура — наложница Авраама');
  });
  it('пустое место (решение 75): «Жена Сифа (мать Еноса), имя в Писании не названо»', () => {
    expect(unnamedText(U.byId.get('u:sif+')!, 'b')).toBe('Жена Сифа (мать Еноса), имя в Писании не названо');
  });
  it('команда детей союза: «Раскрыть детей (3)», «Раскрыть ещё (2)», «Свернуть детей»; без детей — нет', () => {
    const u = U.byId.get('u:adam+eva')!;
    expect(kidsCommand(u, false, 3)?.text).toBe('Раскрыть детей (3)');
    expect(kidsCommand(u, false, 2)).toMatchObject({ text: 'Раскрыть ещё (2)' });
    expect(kidsCommand(u, true, 0)?.text).toBe('Свернуть детей');
    expect(kidsCommand(U.byId.get('u:david+melkhola')!, false, 0)).toBeNull();
  });
  it('образы лиц (решение 74): вариант силуэта по id и полу; Иисус Христос — звезда, народ — группа', () => {
    expect(MALE_VARIANTS.length).toBe(5);
    expect(FEMALE_VARIANTS.length).toBe(4);
    expect(variantOf('adam', 'm')).toBe(variantOf('adam', 'm'));
    expect(FEMALE_VARIANTS).toContain(variantOf('eva', 'f'));
    expect(lookOf('iisus').kind).toBe('star');
    expect(lookOf('adam').kind).toBe('figure');
    expect(lookOf(persons.find((p) => p.kind === 'people')!.id).kind).toBe('group');
  });
});

/** Детерминированный генератор (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = { x: number; y: number; w: number; h: number };

describe('место карточки (placeCard; § 6, Я25)', () => {
  /** Сцена: небо, органы неба (never), звёзды семьи и подпись фокуса (keep), подписи семьи (hard). */
  function scene(r: () => number) {
    const bounds = { x: 30, y: 100, w: 600 + Math.round(r() * 800), h: 500 + Math.round(r() * 300) };
    const a = { x: bounds.x + 20 + r() * (bounds.w - 40), y: bounds.y + 20 + r() * (bounds.h - 40), r: 6 + r() * 3 };
    const size = { w: 300, h: 180 + Math.round(r() * 80) };
    const never: R[] = [
      { x: bounds.x, y: bounds.y, w: 215, h: 37 },
      { x: bounds.x + bounds.w - 241, y: bounds.y + bounds.h - 75, w: 241, h: 75 },
      { x: bounds.x, y: bounds.y + bounds.h - 32, w: 112, h: 32 },
    ];
    const keep: R[] = [{ x: a.x + a.r + 2, y: a.y - 9, w: 40 + r() * 60, h: 18 }];
    const hard: R[] = [];
    const n = Math.round(r() * 14);
    for (let i = 0; i < n; i++) {
      const x = a.x + (r() - 0.5) * 500;
      const y = a.y + (r() - 0.5) * 400;
      keep.push({ x: x - 6, y: y - 6, w: 12, h: 12 });
      hard.push({ x: x + 8, y: y - 9, w: 30 + r() * 90, h: 18 });
    }
    return { bounds, a, size, never, keep, hard };
  }
  const inside = (q: R, b: R) => q.x >= b.x - 0.5 && q.y >= b.y - 0.5 && q.x + q.w <= b.x + b.w + 0.5 && q.y + q.h <= b.y + b.h + 0.5;
  /** Есть ли на сетке 16 px место без единого px² запретного (та же сетка, что у placeCard). */
  function freeExists(s: ReturnType<typeof scene>): boolean {
    const all = [...s.never, ...s.keep, ...s.hard, { x: s.a.x - s.a.r, y: s.a.y - s.a.r, w: 2 * s.a.r, h: 2 * s.a.r }];
    const x1 = s.bounds.x + s.bounds.w - s.size.w;
    const y1 = s.bounds.y + s.bounds.h - s.size.h;
    for (let x = s.bounds.x; x <= x1 + 0.5; x += 16)
      for (let y = s.bounds.y; y <= y1 + 0.5; y += 16) {
        const q = { x: Math.min(x, x1), y: Math.min(y, y1), ...s.size };
        if (all.every((z) => overlap(q, z) === 0)) return true;
      }
    return false;
  }
  it('400 случайных сцен: место есть — 0 px² запретного; места нет — органы неба и знак не закрыты никогда', () => {
    const r = rng(11);
    let free = 0;
    let tight = 0;
    for (let i = 0; i < 400; i++) {
      const s = scene(r);
      const q = placeCard(s.a, s.size, s.bounds, { never: s.never, keep: s.keep, hard: s.hard });
      const rect = { x: q.x, y: q.y, ...s.size };
      expect(inside(rect, s.bounds), `сцена ${i}: за краем неба`).toBe(true);
      const mark = { x: s.a.x - s.a.r, y: s.a.y - s.a.r, w: 2 * s.a.r, h: 2 * s.a.r };
      if (freeExists(s)) {
        free++;
        const bad = [...s.never, ...s.keep, ...s.hard, mark].filter((z) => overlap(rect, z) > 0);
        expect(bad, `сцена ${i}`).toEqual([]);
      } else {
        tight++;
        // места нет: органы неба — никогда; знак — никогда, если хоть одно место его не закрывает
        expect(s.never.filter((z) => overlap(rect, z) > 0), `сцена ${i}: органы неба`).toEqual([]);
      }
    }
    expect(free).toBeGreaterThan(200);
    expect(free + tight).toBe(400);
  });
  it('далеко от знака — отвод-отрезок от края знака к ближней точке карточки', () => {
    const bounds = { x: 0, y: 0, w: 1000, h: 700 };
    const a = { x: 500, y: 350, r: 8 };
    // вокруг знака всё занято подписями семьи — карточка уходит в сторону
    const keep = [{ x: 150, y: 150, w: 700, h: 400 }];
    const q = placeCard(a, { w: 300, h: 200 }, bounds, { keep: [], hard: keep });
    expect(q.side).toBe('corner');
    expect(q.line).toBeTruthy();
    const d = Math.hypot(q.line!.x2 - a.x, q.line!.y2 - a.y);
    expect(d).toBeGreaterThan(a.r);
  });
});

describe('строка показа и лист «Показ» (§ 5, § 7)', () => {
  beforeEach(() => setShow({ kind: 'all' }));
  it('всё небо: «На небе: всё небо — изменить»; «изменить» открывает лист (dialog)', () => {
    const out = flat(renderToString(h(ShowBar, {})));
    expect(out).toContain('На небе:');
    expect(out).toMatch(/>всё небо</);
    expect(out).toMatch(/aria-haspopup="dialog"[^>]*>изменить</);
    expect(out).toContain('data-reserve="bar"');
  });
  it('«Дом Нахора»: созвездие, основатель, связи наружу, «добавить созвездие «Патриархи»», «всё небо»', () => {
    setShow({ kind: 'groups', groups: ['nahorites'], links: 'stubs' });
    const out = flat(renderToString(h(ShowBar, {}))).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(out).toMatch(/созвездие «Дом Нахора» — \d+ лиц; основатель Нахор; \d+ связ/);
    expect(out).toContain('добавить созвездие «Патриархи»');
    expect(out).toContain('всё небо');
  });
  it('род лица: части «потомки», «все поколения», «по отцам» — списки (меню) с выбором', () => {
    setShow({ kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' });
    const out = flat(renderToString(h(ShowBar, {})));
    expect([...out.matchAll(/class="[^"]*sb-menu/g)].length).toBe(3);
    expect(out.replace(/<[^>]+>/g, '')).toMatch(/потомки ▾ Иуды/);
  });
  it('лист «Показ»: шесть видов по порядку § 5; «Всё небо» — первым', () => {
    expect(KINDS.map((k) => k.kind)).toEqual(['all', 'lines', 'key', 'set', 'lineage', 'groups']);
    expect(KINDS[0].label).toBe('Всё небо');
    expect(KINDS.find((k) => k.kind === 'set')!.label).toMatch(/^Набор/);
  });
  it('поле «Созвездие» в паспорте подробной карточки — ссылка в лист «Показ» на этом созвездии (§ 5)', () => {
    const out = flat(renderToString(h(Masthead, { id: 'kham' })));
    expect(out).toMatch(/<button[^>]*class="pass-link"[^>]*>Ной и сыновья<\/button>/);
    openShowSheet({ focus: 'groups', group: 'noahides', back: null });
    expect(showSheet.value).toMatchObject({ focus: 'groups', group: 'noahides' });
    closeShowSheet(false);
    expect(showSheet.value).toBeNull();
  });
  it('поиск созвездия — по правилам главного поиска: начало слова, раскладка, ё и е, окончания', () => {
    expect(groupMatches('Дом Нахора', 'нах')).toBe(true);
    expect(groupMatches('Дом Нахора', 'yf[')).toBe(true);
    expect(groupMatches('Дом Нахора', 'дом нахор')).toBe(true);
    expect(groupMatches('Колено Ефремово', 'ефрем')).toBe(true);
    expect(groupMatches('Дом Нахора', 'иуд')).toBe(false);
  });
});
