/**
 * Этап 11, доводка Q4: высота строки семейной укладки на телефоне (Я12: не ниже 32 px), строка показа в одну строку
 * (краткие формы), место карточки по двум ярусам запретного (§ 6).
 * Поведение в браузере — сценарии tools/accept/polish11.ts (850–899), Я25 — tools/accept/unify11.ts (811, 812).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Camera, KY_MAX, KY_MAX_TALL, ROW_SHIFT_TALL, type Frame } from '../src/render/camera.ts';
import { placeCard } from '../src/ui/sky/DotCard.tsx';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;
beforeAll(async () => {
  C = await import('../tools/census.ts');
}, 60_000);

const frame: Frame = { x0: 0, x1: 100_000, lane0: -100, lane1: 100 };
function cam(w: number) {
  const c = new Camera();
  c.w = w;
  c.h = 700;
  c.laneSpan = 200;
  c.setViewport({ l: 22, t: 44, r: w, b: 684 }, frame, frame);
  c.set(c.fitView(frame));
  return c;
}

describe('высота строки семейной укладки на узком небе (Я12, Q4)', () => {
  it('камера: по умолчанию предел 26 px; в семейной укладке на узком небе — сдвиг кривой на масштабе чтения и до 34 px', () => {
    const c = cam(390);
    expect(c.rowCap).toBe(KY_MAX);
    expect(c.rowShift).toBe(0);
    const kx = 0.4;
    const low = c.kyFor(kx);
    expect(low).toBeLessThanOrEqual(KY_MAX);
    c.rowCap = KY_MAX_TALL;
    c.rowShift = ROW_SHIFT_TALL;
    const tall = c.kyFor(kx);
    expect(tall).toBeGreaterThan(low);
    expect(tall).toBeGreaterThanOrEqual(32);
    expect(tall).toBeLessThanOrEqual(KY_MAX_TALL);
    // обзор («всё небо») не меняется: высота строки при масштабе вписывания — та же
    const fit = c.fitK!.kx;
    c.rowCap = KY_MAX;
    c.rowShift = 0;
    const f0 = c.kyFor(fit);
    c.rowCap = KY_MAX_TALL;
    c.rowShift = ROW_SHIFT_TALL;
    expect(c.kyFor(fit)).toBeCloseTo(f0, 6);
    // мелкий масштаб («Вписать» показа): строки не выше, чем на карте — показ помещается по высоте без отдаления времени
    c.rowShift = 0;
    const small = c.kyFor(0.03);
    c.rowShift = ROW_SHIFT_TALL;
    expect(c.kyFor(0.03)).toBeCloseTo(small, 6);
  });
  it('небо: семейная укладка на 390 px — высокие строки и строка не ниже 32 px; на 1440 и на карте — обычные', () => {
    for (const id of ['iakov', 'david', 'judah']) {
      const f = C.capture(id, 1, 390);
      expect(f.s.cam.rowCap, id).toBe(KY_MAX_TALL);
      expect(f.ky, id).toBeGreaterThanOrEqual(32 - 0.5);
    }
    const wide = C.capture('iakov', 1, 1440).s.cam;
    expect(wide.rowCap).toBe(KY_MAX);
    expect(wide.rowShift).toBe(0);
    // «все лица» — карта: строки как прежде (NFR-3 — общая раскладка не меняется)
    const map = C.captureAt('all', 'noy', 200, { width: 390 }).s.cam;
    expect(map.rowCap).toBe(KY_MAX);
    expect(map.rowShift).toBe(0);
  }, 60_000);
});

describe('строка показа: краткие формы (Q4, § 5)', () => {
  it('всё небо, линии, ключевые лица — коротко без «На небе:», одна команда «изменить»', async () => {
    const show = await import('../src/ui/show.ts');
    for (const [s, want] of [
      [{ kind: 'all' }, /^всё небо$/],
      // этап 13, решение 110: показ линий зовётся так же, как начало
      [{ kind: 'lines' }, /^родословие Иисуса Христа \(Мф 1, Лк 3\) — \d+ лиц[а]?$/],
      [{ kind: 'key' }, /^ключевые лица — \d+ лиц[а]?$/],
    ] as const) {
      const sm = show.summaryOf(s as import('../src/ui/show.ts').Show);
      expect(sm.short.map((q) => q.text).join(''), s.kind).toMatch(want);
      expect(sm.shortCmds.map((q) => q.text)).toEqual(['изменить']);
      expect(sm.mid).toEqual(sm.text);
    }
  });
  it('все колена и несколько созвездий — коротко: «все колена — N лиц», «3 созвездия — N лиц»', async () => {
    const show = await import('../src/ui/show.ts');
    const t = show.summaryOf({ kind: 'groups', groups: [...show.TRIBES], links: 'stubs' });
    expect(t.short.map((q) => q.text).join('')).toMatch(/^все колена — 1\s\d{3} лиц/);
    const three = show.summaryOf({ kind: 'groups', groups: ['nahorites', 'patriarchs', 'terahites'], links: 'stubs' });
    expect(three.short.map((q) => q.text).join('')).toMatch(/^3 созвездия — \d+ лиц/);
    const two = show.summaryOf({ kind: 'groups', groups: ['nahorites', 'patriarchs'], links: 'stubs' });
    expect(two.short.map((q) => q.text).join('')).toMatch(/^«Дом Нахора», «Патриархи» — \d+ лиц/);
  });
});

describe('место карточки по двум ярусам (§ 6; Я25)', () => {
  const bounds = { x: 0, y: 0, w: 900, h: 700 };
  const a = { x: 450, y: 350, r: 8 };
  it('обязательное (never) не закрывается никогда, даже если желательное (keep, hard) заняло всё небо', () => {
    // семья на всё небо: звёзды сеткой через 60 px, подписи справа от них
    const keep: { x: number; y: number; w: number; h: number }[] = [];
    const hard: { x: number; y: number; w: number; h: number }[] = [];
    for (let x = 20; x < 900; x += 60)
      for (let y = 20; y < 700; y += 60) {
        keep.push({ x: x - 5, y: y - 5, w: 10, h: 10 });
        hard.push({ x: x + 8, y: y - 8, w: 40, h: 16 });
      }
    const never = [
      { x: 0, y: 0, w: 300, h: 40 },
      { x: 640, y: 620, w: 260, h: 80 },
      { x: a.x - 8, y: a.y - 8, w: 16, h: 16 },
      { x: a.x + 10, y: a.y - 9, w: 60, h: 18 },
    ];
    const q = placeCard(a, { w: 300, h: 120 }, bounds, { never, keep, hard });
    expect(q.free).toBe(false);
    const r = { x: q.x, y: q.y, w: 300, h: 120 };
    const hit = (z: { x: number; y: number; w: number; h: number }) => r.x < z.x + z.w && z.x < r.x + r.w && r.y < z.y + z.h && z.y < r.y + r.h;
    expect(never.filter(hit)).toEqual([]);
    // карточка — в пределах неба
    expect(r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h).toBe(true);
  });
  it('место есть — ни обязательного, ни желательного', () => {
    const q = placeCard(a, { w: 300, h: 200 }, bounds, { never: [{ x: 460, y: 340, w: 60, h: 18 }], keep: [{ x: 440, y: 400, w: 12, h: 12 }], hard: [{ x: 455, y: 395, w: 50, h: 16 }] });
    expect(q.free).toBe(true);
  });
});

describe('помета порядка в подсказке звезды — та же, что в карточке (Г9; DG 2.3.6)', () => {
  it('сыновья Лии — Быт 29:32–35; 30:17–21; сыновья Хеттуры — Быт 25:2 (не стихи рождения Измаила и Исаака); сыновья Реумы — Быт 22:24', async () => {
    Object.assign(globalThis, { document: (globalThis as { document?: unknown }).document ?? { documentElement: { dataset: {} } } });
    const text = await import('../src/ui/sky/text.ts');
    const links = await import('../src/render/links.ts');
    const nb = (s: string | null) => (s ?? '').replace(/\u2060/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
    expect(nb(text.orderText('ruvim'))).toBe('год оценён по порядку перечисления (Быт 29:32–35; 30:17–21), выв.');
    expect(nb(text.orderText('zimran'))).toBe('год оценён по порядку перечисления (Быт 25:2), выв.');
    expect(nb(text.orderText('tevakh'))).toBe('год оценён по порядку перечисления (Быт 22:24), выв.');
    // подсказка и строка «Год» карточки называют одно место
    for (const id of ['ruvim', 'zimran', 'tevakh', 'solomon', 'kham', 'amnon']) {
      const card = links.personOrderNote(id);
      const tip = text.orderText(id);
      expect(!!card, id).toBe(!!tip);
      if (card && tip) expect(nb(tip), id).toContain(nb(card).replace(/^по порядку перечисления, /, '').replace(/, выв\.$/, ''));
    }
  });
});

describe('низкий экран: лист карточки оставляет небо (H6, MOB-26; сценарий 259)', () => {
  it('первое положение — не выше места без 150 px неба и не ниже 104 px; 55 % — не ниже 214 px', async () => {
    const { stopsFor, PEEK_H, LOW_SKY } = await import('../src/ui/sheet.ts');
    expect(LOW_SKY).toBe(150);
    expect(stopsFor(300, true).peek).toBe(150);
    expect(stopsFor(200, true).peek).toBe(104);
    expect(stopsFor(500, true).peek).toBe(PEEK_H);
    for (const a of [150, 200, 300, 500]) expect(stopsFor(a, true).half).toBeGreaterThanOrEqual(PEEK_H);
    // обычный экран — как прежде: 214 px при любом месте
    expect(stopsFor(300, false).peek).toBe(PEEK_H);
  });
});

describe('«только линии»: поле у Адама 24 px и в пределах сдвига (MAP-59; сценарий 269)', () => {
  it('Camera.edge расширяет запас за краем данных при мелком масштабе', () => {
    const c = cam(1024);
    const k = c.kxLo();
    const b16 = c.bounds(k)!;
    c.edge = 24;
    const b24 = c.bounds(k)!;
    // левый предел x0 — на 8 px (в мировых единицах) дальше за краем данных
    expect((b16.x[0] - b24.x[0]) * k).toBeCloseTo(8, 5);
  });
});
