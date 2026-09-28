/**
 * Полоса времени, этап 7 (K6): щелчок и протяжка (IX-50), подписи эпох (MAP-43), схема линий (MAP-44),
 * гистограмма без лиц «время не установлено» (MAP-45), после канона (MOB-06), эпохи с ползунка (MOB-49).
 */
import { beforeAll, describe, expect, it } from 'vitest';

let strip: typeof import('../src/ui/TimeStrip.tsx');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  strip = await import('../src/ui/TimeStrip.tsx');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
});

/** Эпохи модели по умолчанию в астрономических годах. */
const epochs = () => atlas.models[0].epochs.map((e) => ({ ...e, start: years.toAstro(e.start), end: years.toAstro(e.end) }));

describe('полоса: зоны нажатия (IX-50)', () => {
  it('над названиями эпох — строка названий; ниже — рамка, её края и поле вне рамки', () => {
    const H = 76;
    const { top } = strip.stripRows(H);
    expect(top).toBe(30);
    expect(strip.stripZone(800, top - 2, 700, 900, H)).toBe('names');
    expect(strip.stripZone(800, top + 10, 700, 900, H)).toBe('move');
    expect(strip.stripZone(500, top + 10, 700, 900, H)).toBe('new');
    expect(strip.stripZone(705, top + 10, 700, 900, H)).toBe('left');
    // над рамкой, но в строке названий — снова названия: рамка на них не заходит (MAP-43)
    expect(strip.stripZone(800, 5, 700, 900, H)).toBe('names');
  });
  it('на полосе телефона (56 px) и низкого окна (44 px) — одна строка названий; поле для столбиков остаётся', () => {
    for (const H of [56, 44]) {
      const r = strip.stripRows(H);
      expect(r.names).toBe(1);
      expect(r.top).toBe(16);
      expect(r.histMax).toBeGreaterThanOrEqual(6);
      expect(r.beads + 6).toBeLessThan(H - 3 - Math.min(r.histMax, 6) + 6);
    }
  });
  it('переход к эпохе — одно движение 350–450 мс; протяжка начинается со сдвига больше 3 px', () => {
    expect(strip.GLIDE_MS).toBeGreaterThanOrEqual(350);
    expect(strip.GLIDE_MS).toBeLessThanOrEqual(450);
    expect(strip.DRAG_PX).toBe(3);
  });
});

describe('окна эпох: щелчок, PageUp и PageDown (IX-50, MOB-49, MOB-06)', () => {
  it('окно эпохи — с полями 4 %, не меньше 10 лет', () => {
    const united = epochs().find((e) => e.id === 'united')!;
    const [a, b] = strip.epochWindow(united);
    expect(a).toBeCloseTo(united.start - 10, 5);
    expect(b).toBeCloseTo(united.end + 10, 5);
    const flood = epochs().find((e) => e.id === 'antediluvian')!;
    const [c, d] = strip.epochWindow(flood);
    expect(flood.start - c).toBeCloseTo((flood.end - flood.start) * 0.04, 5);
    expect(d - flood.end).toBeCloseTo((flood.end - flood.start) * 0.04, 5);
  });
  it('после канона лиц нет: окно эпохи «После завершения канона» — конец данных, около −10…+100 (MOB-06)', () => {
    const church = epochs().find((e) => e.start >= strip.CANON_AFTER)!;
    expect(church.id).toBe('church');
    const [a, b] = strip.epochWindow(church);
    expect(a).toBeGreaterThanOrEqual(-15);
    expect(a).toBeLessThanOrEqual(-5);
    expect(b).toBe(100);
  });
  it('PageDown — к следующей эпохе, PageUp — к предыдущей; за краями эпох — null, после канона клавиши не ведут', () => {
    const eps = epochs();
    const at = (id: string) => strip.epochWindow(eps.find((e) => e.id === id)!);
    const [a, b] = at('united');
    expect(strip.epochStep(1, a, b, eps)).toEqual(at('divided'));
    expect(strip.epochStep(-1, a, b, eps)).toEqual(at('judges'));
    const [c, d] = at('antediluvian');
    expect(strip.epochStep(-1, c, d, eps)).toBe(null);
    const [e, f] = at('apostolic');
    expect(strip.epochStep(1, e, f, eps)).toBe(null);
    // окно после канона (протянули рамку к 2040) — PageUp ведёт к последней эпохе с лицами
    expect(strip.epochStep(-1, 1500, 2000, eps)).toEqual(at('apostolic'));
    // окно до сотворения — PageDown ведёт к первой эпохе
    expect(strip.epochStep(1, -4300, -4200, eps)).toEqual(at('antediluvian'));
  });
  it('эпоха года: граница принадлежит следующей эпохе, 2040 — последней', () => {
    const eps = atlas.models[0].epochs;
    expect(strip.epochAtYear(eps, years.toAstro(-1050), years.toAstro)?.id).toBe('united');
    expect(strip.epochAtYear(eps, years.toAstro(-1051), years.toAstro)?.id).toBe('judges');
    expect(strip.epochAtYear(eps, 2040, years.toAstro)?.id).toBe('church');
  });
});

describe('подписи эпох (MAP-43)', () => {
  /** Ширина подписи Jost 12 с запасом: 7 px на знак (замер в браузере — 5,6–6,6 px). */
  const wOf = (s: string) => s.length * 7;
  const layout = (W: number, rows: number) => {
    const PAD = 14;
    const T0 = years.toAstro(atlas.models[0].epochs[0].start) - 10;
    const xOf = (t: number) => PAD + ((t - T0) / (2040 - T0)) * (W - PAD * 2);
    const eps = atlas.models[0].epochs;
    const items = eps.map((e) => ({ id: e.id, x0: xOf(years.toAstro(e.start)), x1: xOf(years.toAstro(e.end)), w: wOf(e.short) }));
    const start = wOf('4174 до Р. Х.');
    const places = strip.placeEpochLabels(items, rows, 2, W - 2, [[0, PAD, PAD + start], [0, W - PAD - wOf('2040'), W - PAD]]);
    return { items, places };
  };
  it('на 1440 px подписаны все 16 эпох в две строки; подписи не ложатся друг на друга и касаются своей эпохи', () => {
    const { items, places } = layout(1440, 2);
    expect(items.length).toBe(16);
    expect(places.size).toBe(16);
    const boxes = items.map((it) => ({ ...it, ...places.get(it.id)! }));
    for (const a of boxes) {
      expect(a.x + a.w, a.id).toBeGreaterThanOrEqual(a.x0 - 2);
      expect(a.x, a.id).toBeLessThanOrEqual(a.x1 + 2);
      expect(a.x).toBeGreaterThanOrEqual(2);
      expect(a.x + a.w).toBeLessThanOrEqual(1438);
      for (const b of boxes) if (a !== b && a.row === b.row) expect(a.x + a.w <= b.x || b.x + b.w <= a.x, `${a.id} / ${b.id}`).toBe(true);
    }
    // края шкалы в первой строке не заняты подписями эпох
    for (const a of boxes.filter((x) => x.row === 0)) expect(a.x >= 14 + wOf('4174 до Р. Х.') || a.x + a.w <= 14, a.id).toBe(true);
  });
  it('на 1280 px — тоже все 16', () => {
    expect(layout(1280, 2).places.size).toBe(16);
  });
  it('на телефоне (одна строка) подписи не накладываются; широкие эпохи подписаны', () => {
    const { items, places } = layout(390, 1);
    const boxes = items.filter((it) => places.has(it.id)).map((it) => ({ ...it, ...places.get(it.id)! }));
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x, `${a.id} / ${b.id}`).toBe(true);
    expect(places.has('church')).toBe(true);
  });
});

describe('схема линий Мессии на полосе (MAP-44)', () => {
  it('где линии совпадают — один ряд, где расходятся — два: Каинан, Соломон и Нафан, Салафиил, Авиуд и Рисай, Иисус', () => {
    const j = atlas.lines.joseph.persons.map((p) => p.id);
    const m = atlas.lines.mary.persons.map((p) => p.id);
    const b = strip.lineBeads(j, m);
    const rowJ = new Map(b.joseph.map((x) => [x.id, x.row]));
    const rowM = new Map(b.mary.map((x) => [x.id, x.row]));
    expect(rowJ.get('adam')).toBe('both');
    expect(rowJ.get('david')).toBe('both');
    expect(rowJ.get('solomon')).toBe('joseph');
    expect(rowM.get('kainan-syn-arfaksada')).toBe('mary');
    expect(rowM.get('kainan')).toBe('both');
    expect(rowM.get('nafan-syn-davida')).toBe('mary');
    expect(rowJ.get('salafiil')).toBe('both');
    expect(rowJ.get('zorovavel')).toBe('both');
    expect(rowJ.get('aviud-syn-zorovavelya')).toBe('joseph');
    expect(rowM.get('risay')).toBe('mary');
    expect(rowJ.get('iisus')).toBe('both');
    expect(rowM.get('iisus')).toBe('both');
    // расхождений (участков с двумя рядами) — четыре: Каинан, Давид…Салафиил, Зоровавель…Иисус (с обеих сторон)
    const runs = (xs: { row: string }[]) => xs.reduce((n, x, i) => n + (x.row !== 'both' && (i === 0 || xs[i - 1].row === 'both') ? 1 : 0), 0);
    expect(runs(b.mary)).toBe(3);
    expect(runs(b.joseph)).toBe(2);
  });
});

describe('гистограмма плотности (MAP-45)', () => {
  it('без лиц «время не установлено», без имён из списков без родства и без народов', () => {
    const m = atlas.models[0];
    const T0 = years.toAstro(m.epochs[0].start) - 10;
    const bins = strip.birthBins(m, T0, 2040);
    const total = bins.reduce((a, b) => a + b, 0);
    let expected = 0;
    for (const [id, c] of m.chrono) {
      const trail = m.nodeByPerson.get(id)?.trail;
      if (c.cls !== 'epochal' && !c.named && trail && !['list', 'epochal', 'people'].includes(trail) && c.b >= T0 && c.b < 2040) expected++;
    }
    expect(total).toBe(expected);
    // скопления списков возвращения (Езд 2; Неем 7; 10–12) больше не дают всплеска около 500 г. до Р. Х.
    const i = Math.floor((years.toAstro(-500) - T0) / strip.BIN);
    expect(bins[i]).toBeLessThan(60);
    // лица списков без родства есть в данных, но не в столбиках
    const list = [...m.nodeByPerson.values()].filter((n) => n.trail === 'list');
    expect(list.length).toBeGreaterThan(100);
  });
  it('флажок над столбиками — год и число рождений за 25 лет, с согласованием', () => {
    expect(strip.birthsWord(1)).toBe('1 рождение');
    expect(strip.birthsWord(3)).toBe('3 рождения');
    expect(strip.birthsWord(11)).toBe('11 рождений');
    expect(strip.birthsWord(21)).toBe('21 рождение');
    expect(strip.birthsWord(25)).toBe('25 рождений');
    expect(strip.histFlag(years.toAstro(-1010), 34)).toBe('1010 г. до Р. Х.: 34 рождения за 25 лет');
    expect(strip.histFlag(years.toAstro(-1010), 0)).toBe('1010 г. до Р. Х.: за 25 лет рождений нет');
  });
});
