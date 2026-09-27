/**
 * Телефон и планшет (этап 6: H2–H7; MOB-10, 11, 12, 16, 18, 24, 26, 39, 43) без браузера: положения нижнего листа
 * карточки и протяжка с учётом скорости, касание в плотном месте, доля ярусов эпох, меню «Разделы», стили телефона.
 * Поведение в браузере (390 × 844, 360 × 740, 844 × 390, 768 × 1024; пальцем) — сценарии 150–160 в tools/accept/phone.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { snapSheet, stopsFor, releaseVelocity, stopForNewSelection, PEEK_H, HALF_SHARE } from '../src/ui/sheet.ts';
import { tapChoice, tapScore, inflate, ASK_MAX, type TapCandidate } from '../src/ui/sky/input.ts';
import { phoneMenuItems } from '../src/ui/top/TopBar.tsx';
import { PHONE_MAX } from '../src/ui/layout.ts';

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('нижний лист карточки: положения (H2; ТЗ § 3.8; решение владельца 12)', () => {
  const s = stopsFor(740);
  it('три положения: 104 px, 55 % и всё место между верхней строкой и полосой времени', () => {
    expect(s).toEqual({ peek: PEEK_H, half: Math.round(740 * HALF_SHARE), full: 740 });
    expect(PEEK_H).toBe(104);
    // низкий экран: 55 % не ниже шапки
    expect(stopsFor(150).half).toBeGreaterThanOrEqual(104);
  });
  it('касание звезды — шапка; поиск и ссылки — 55 %; на низком экране — всегда шапка', () => {
    const now = 10_000;
    expect(stopForNewSelection({ stop: 'peek', at: now - 50 }, now, false)).toBe('peek');
    expect(stopForNewSelection(null, now, false)).toBe('half');
    // просьба касания устарела (касание уже выбранной звезды ничего не выбрало) — следующему поиску она не достаётся
    expect(stopForNewSelection({ stop: 'peek', at: now - 5000 }, now, false)).toBe('half');
    expect(stopForNewSelection(null, now, true)).toBe('peek');
  });
  it('медленная протяжка — к ближайшему положению; взмах перебрасывает дальше', () => {
    // от шапки на 60 px вверх: медленно — обратно к шапке, быстро — к 55 %
    expect(snapSheet(164, 0.05, s, 'peek')).toBe('peek');
    expect(snapSheet(164, 1.3, s, 'peek')).toBe('half');
    // сильный взмах от 55 % — к 100 %
    expect(snapSheet(460, 2, s, 'half')).toBe('full');
    // от 100 % вниз медленно на 100 px — остаётся 100 %, взмахом — 55 %
    expect(snapSheet(640, -0.1, s, 'full')).toBe('full');
    expect(snapSheet(640, -1.2, s, 'full')).toBe('half');
  });
  it('взмах вниз с шапки или ниже неё закрывает лист; с 55 % — лишь сворачивает', () => {
    expect(snapSheet(80, -0.8, s, 'peek')).toBe('close');
    expect(snapSheet(40, 0, s, 'peek')).toBe('close');
    expect(snapSheet(300, -2, s, 'half')).toBe('peek');
    expect(snapSheet(96, -0.2, s, 'peek')).toBe('peek');
  });
  it('скорость — по времени событий за последние 100 мс; палец постоял перед отпусканием — взмаха нет', () => {
    const pts = [
      { t: 0, y: 700 },
      { t: 15, y: 680 },
      { t: 30, y: 660 },
      { t: 45, y: 640 },
    ];
    expect(releaseVelocity(pts, 50)).toBeCloseTo(60 / 45, 5);
    expect(releaseVelocity(pts, 300)).toBe(0);
    expect(releaseVelocity([{ t: 0, y: 700 }])).toBe(0);
    // протяжка вниз — скорость меньше нуля
    expect(releaseVelocity([{ t: 0, y: 500 }, { t: 20, y: 540 }], 22)).toBeCloseTo(-2, 5);
  });
});

describe('касание в плотном месте неба: «Какое лицо?» (H5; MOB-10)', () => {
  const c = (id: string, d: number, mag = 4, labeled = false, y = 0): TapCandidate => ({ id, d, mag, labeled, x: 0, y });
  it('одна вероятная звезда — выбор; вес — расстояние с поправкой на яркость и подпись', () => {
    expect(tapChoice([], true)).toEqual({ kind: 'none' });
    expect(tapChoice([c('a', 6)], true)).toEqual({ kind: 'pick', id: 'a' });
    // подписанная яркая звезда в 10 px вероятнее тусклой безымянной в 6 px
    expect(tapScore(c('david', 10, 0, true))).toBeLessThan(tapScore(c('x', 6, 5)));
    expect(tapChoice([c('david', 10, 0, true), c('x', 6, 5)], true)).toEqual({ kind: 'pick', id: 'david' });
  });
  it('несколько равновероятных — список сверху вниз, как на небе', () => {
    const r = tapChoice([c('low', 7, 4, false, 120), c('high', 6, 4, false, 100), c('far', 20, 4, false, 90)], true);
    expect(r).toEqual({ kind: 'ask', ids: ['high', 'low'] });
    // две звезды в паре пикселей друг от друга неразличимы даже при точном касании
    expect(tapChoice([c('a', 0.5, 3, false, 1), c('b', 3, 3, false, 4)], true).kind).toBe('ask');
  });
  it('больше пяти равновероятных — приближение; приближать некуда — пять ближайших', () => {
    const many = Array.from({ length: 8 }, (_, i) => c(`p${i}`, 8 + i * 0.3, 5, false, i));
    expect(tapChoice(many, true)).toEqual({ kind: 'zoom' });
    const r = tapChoice(many, false);
    expect(r.kind).toBe('ask');
    expect(r.kind === 'ask' && r.ids.length).toBe(ASK_MAX);
  });
  it('поле касания указателя у края — 44 × 44 вокруг надписи', () => {
    expect(inflate({ x: 100, y: 200, w: 80, h: 18 }, 44)).toEqual({ x: 100, y: 187, w: 80, h: 44 });
    expect(inflate({ x: 0, y: 0, w: 10, h: 10 }, 44)).toEqual({ x: -17, y: -17, w: 44, h: 44 });
  });
});

describe('ярусы эпох — не больше 35 % видимого неба (H7; MOB-24)', () => {
  let tiers: typeof import('../src/render/tiers.ts');
  let models: typeof import('../src/data/atlas.ts').models;
  let years: typeof import('../src/engine/years.ts');
  let FRAME_H = 0;
  beforeAll(async () => {
    Object.assign(globalThis, {
      document: { documentElement: { dataset: {} } },
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
    });
    tiers = await import('../src/render/tiers.ts');
    ({ models } = await import('../src/data/atlas.ts'));
    years = await import('../src/engine/years.ts');
    FRAME_H = (await import('../src/render/sky.ts')).FRAME_H;
  });
  it('доля — 35 % видимого неба; при небе ниже 160 px — самый сжатый вид', () => {
    expect(tiers.tiersBudget(FRAME_H + 300)).toBe(105);
    expect(tiers.tiersBudget(FRAME_H + 100)).toBe(0);
  });
  it('без доли раскладка прежняя; с долей — укладывается в неё на любом окне', () => {
    const ts = tiers.buildTiers(models[0]);
    const T = years.toAstro;
    for (const [a, b] of [[-1100, -900], [-800, -600], [-2100, -1900], [-4200, 100], [-1500, -1000]]) {
      const free = tiers.planTiers(ts, T(a), T(b));
      const same = tiers.planTiers(ts, T(a), T(b), '', tiers.TIER_TOP, false, free.bottom - FRAME_H);
      expect(same.bottom).toBe(free.bottom);
      expect(same.blocks.map((x) => [x.tier.key, x.h])).toEqual(free.blocks.map((x) => [x.tier.key, x.h]));
      // телефон, лист на 55 %: видимого неба 273 px — ярусам не больше 96
      const budget = tiers.tiersBudget(FRAME_H + 273);
      const tight = tiers.planTiers(ts, T(a), T(b), '', tiers.TIER_TOP, false, budget);
      expect(tight.bottom - FRAME_H, `${a}…${b}`).toBeLessThanOrEqual(budget);
      expect(tight.blocks.some((x) => x.tier.key === 'epochs')).toBe(true);
      // ярусы идут подряд, не налезая друг на друга
      for (let i = 1; i < tight.blocks.length; i++) expect(tight.blocks[i].y).toBeGreaterThanOrEqual(tight.blocks[i - 1].y + tight.blocks[i - 1].h);
    }
  });
  it('первым делом уходят пустые ярусы и лишние строки, подписи отрезков остаются, пока помещаются', () => {
    const ts = tiers.buildTiers(models[0]);
    const T = years.toAstro;
    // Единое царство на телефоне с листом на шапке: видимого неба ~590 px — строки с подписями
    const roomy = tiers.planTiers(ts, T(-1100), T(-900), '', tiers.TIER_TOP, false, tiers.tiersBudget(FRAME_H + 590));
    expect(roomy.blocks.filter((b) => b.tier.key !== 'epochs').every((b) => b.pitch === tiers.PITCH)).toBe(true);
    const free = tiers.planTiers(ts, T(-1100), T(-900));
    const tight = tiers.planTiers(ts, T(-1100), T(-900), '', tiers.TIER_TOP, false, 120);
    expect(tight.bottom).toBeLessThan(free.bottom);
    expect(tight.blocks.every((b) => !b.collapsed || b.tier.key === 'epochs')).toBe(true);
  });
});

describe('верх телефона: «Разделы» (H4; MOB-03, MOB-04)', () => {
  it('все панели, справка и тема — флажком «Дневная карта»', () => {
    const opened: string[] = [];
    let flipped = 0;
    const items = phoneMenuItems('kinship', true, (id) => opened.push(id), () => flipped++);
    // «В работе» (J3) — после «Указателя», как в строке команд
    expect(items.map((i) => i.label)).toEqual(['Указатель', 'В работе', 'Главы', 'Синопсис', 'Родство', 'Сквозной раздел', 'Условные знаки', 'О карте', 'Дневная карта']);
    expect(items.filter((i) => i.checked).map((i) => i.label)).toEqual(['Родство', 'Дневная карта']);
    // справка и тема отделены чертой
    expect(items.filter((i) => i.sep).map((i) => i.label)).toEqual(['Условные знаки', 'Дневная карта']);
    items[3].onSelect();
    items[8].onSelect();
    expect(opened).toEqual(['synopsis']);
    expect(flipped).toBe(1);
  });
});

describe('стили телефона (H2, H4, H6; MOB-16, MOB-18, MOB-43)', () => {
  const phone = css('phone.css');
  it('порог телефона в CSS — тот же, что в раскладке (src/ui/layout.ts)', () => {
    expect(phone).toContain(`@media (max-width: ${PHONE_MAX}px)`);
  });
  it('лист над полосой времени, шапка 104 px, 100 % — по dvh, 55 % — по svh; вырез экрана учтён', () => {
    expect(phone).toMatch(/--sheet-peek:\s*104px/);
    expect(phone).toMatch(/--sheet-avail:\s*calc\(100dvh/);
    expect(phone).toMatch(/--sheet-half:\s*calc\(\(100svh[^;]*\*\s*0\.55\)/);
    expect(phone).toMatch(/bottom:\s*calc\(var\(--strip-h\)\s*\+\s*env\(safe-area-inset-bottom\)\)/);
    for (const side of ['top', 'right', 'bottom', 'left']) expect(phone).toContain(`env(safe-area-inset-${side})`);
    expect(phone).not.toMatch(/\d+vh\b/);
  });
  it('низкий экран: компактные поля; сенсорный экран: цели 44 px, ссылки в тексте — поле 32 px', () => {
    expect(phone).toMatch(/@media \(max-height: 520px\)\s*\{\s*:root\s*\{\s*--top-h:\s*44px;\s*--strip-h:\s*44px;/);
    const coarse = phone.slice(phone.indexOf('@media (pointer: coarse) {'));
    expect(coarse).toMatch(/min-height:\s*44px/);
    expect(coarse).toMatch(/\.person::after[\s\S]*?height:\s*32px/);
    expect(coarse).not.toMatch(/line-height/);
  });
});
