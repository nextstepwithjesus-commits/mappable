/**
 * Полоса времени, этап 7, круг 3 (L7): подписи без наложений (MOB-68, VIS-65), щелчок без ожидания (IX-78), колесо над
 * полосой (IX-57; решение 47), тильда словами в панели «Эпохи» (CARD-90).
 */
import { beforeAll, describe, expect, it } from 'vitest';

let strip: typeof import('../src/ui/TimeStrip.tsx');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
let epochsPanel: typeof import('../src/ui/panels/Epochs.tsx');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  strip = await import('../src/ui/TimeStrip.tsx');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
  epochsPanel = await import('../src/ui/panels/Epochs.tsx');
});

/** Ширина подписи Jost 12,5 (сенсорный экран) — по замеру в браузере; 6,6 px на знак. */
const wOf = (s: string) => s.length * 6.6;
const PAD = 14;

/** Поле рамки полосы шириной W и высотой H при окне [ta, tb] лет — как рисует TimeStrip.draw. */
function lateFor(W: number, H: number, ta: number, tb: number) {
  const T0 = years.toAstro(atlas.models[0].epochs[0].start) - 10;
  const xOf = (t: number) => PAD + ((t - T0) / (2040 - T0)) * (W - PAD * 2);
  const { top } = strip.stripRows(H);
  const a = xOf(ta);
  const b = xOf(tb);
  // ручки — как handleX в TimeStrip.tsx: 6 × 18 за краями рамки, в 4 px от них; у узкой рамки — снаружи поля захвата
  const c = (a + b) / 2;
  const half = b - a >= 88 ? (b - a) / 2 : Math.max((b - a) / 2, 11);
  const hy = Math.round(top + (H - top - 18) / 2);
  const grips = [
    { x: Math.round(Math.min(a, c - half) - 4 - 6), y: hy, w: 6, h: 18 },
    { x: Math.round(Math.max(b, c + half) + 4), y: hy, w: 6, h: 18 },
  ];
  const t = (text: string) => ({ text, w: wOf(text) });
  const input = {
    W,
    H,
    top,
    canonX: Math.round(xOf(95)) + 0.5,
    todayX: Math.round(xOf(2026)) + 0.5,
    hatch: [Math.max(0, xOf(100)), Math.min(W, xOf(2040))] as [number, number],
    frame: [a, a + Math.max(3, b - a)] as [number, number],
    grips,
    canon: (W < 700 ? ['канон'] : ['завершение канона', 'канон']).map(t),
    today: t('сегодня'),
    note: ['После завершения канона лиц нет', 'После канона лиц нет', 'Лиц нет'].map(t),
  };
  return { input, out: strip.placeLate(input) };
}

/** Проверка раскладки: подписи не пересекают друг друга, ручки, края рамки и черты; пояснение — вне рамки, в штриховке. */
function checkLate(input: ReturnType<typeof lateFor>['input'], out: ReturnType<typeof lateFor>['out'], tag: string) {
  const placed = [out.today, out.canon, out.note].filter((p): p is NonNullable<typeof p> => !!p);
  for (const p of placed) {
    expect(p.box.x, `${tag}: ${p.text} у левого края`).toBeGreaterThanOrEqual(0);
    expect(p.box.x + p.box.w, `${tag}: ${p.text} у правого края`).toBeLessThanOrEqual(input.W);
    expect(p.box.y + p.box.h, `${tag}: ${p.text} внизу`).toBeLessThanOrEqual(input.H);
    expect(p.box.y, `${tag}: ${p.text} наверху`).toBeGreaterThanOrEqual(input.top);
    for (const g of input.grips) expect(strip.boxesCross(p.box, g), `${tag}: ${p.text} на ручке ${JSON.stringify(g)}`).toBe(false);
    for (const x of [input.frame[0], input.frame[1], input.canonX, input.todayX]) {
      const crossed = p.box.x < x + 1 && x - 1 < p.box.x + p.box.w;
      expect(crossed, `${tag}: ${p.text} пересекает черту в ${x.toFixed(1)}`).toBe(false);
    }
    for (const q of placed) if (q !== p) expect(strip.boxesCross(p.box, q.box), `${tag}: ${p.text} на ${q.text}`).toBe(false);
  }
  if (out.note) {
    const n = out.note.box;
    expect(n.x >= input.hatch[0] && n.x + n.w <= input.hatch[1], `${tag}: пояснение вне штриховки`).toBe(true);
    expect(n.x + n.w <= input.frame[0] || n.x >= input.frame[1], `${tag}: пояснение в рамке`).toBe(true);
  }
  if (out.canon) expect(out.canon.x, `${tag}: канон — справа от своей черты`).toBeGreaterThan(input.canonX);
  if (out.canon && out.today) expect(out.canon.x, `${tag}: «канон» слева, «сегодня» справа`).toBeLessThan(out.today.x);
}

describe('подписи поля рамки после канона (MOB-68)', () => {
  it('первый экран «всё небо»: 390 × 844, 768 × 1024, 844 × 390, 720 × 450, 1024, 1440 — без наложений', () => {
    // окна «всего неба» на этих ширинах (замер сборки: data-window)
    const cases: [number, number, number, number][] = [
      [390, 56, -4392, 1199],
      [768, 76, -4340, 571],
      [844, 44, -4345, 584],
      [720, 44, -4378, 669],
      [1024, 76, -4301, 443],
      [1440, 76, -4269, 231],
    ];
    for (const [W, H, a, b] of cases) {
      const { input, out } = lateFor(W, H, a, b);
      checkLate(input, out, `${W}×${H}`);
    }
  });
  it('канон и «сегодня» — в одной нижней строке; пояснение на полосе 44 px — в ней же, на 56 и 76 px — строкой выше', () => {
    const low = lateFor(844, 44, -1100, -900).out;
    const ys = [low.today, low.canon, low.note].filter(Boolean).map((p) => p!.box.y);
    expect(ys.length).toBe(3);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(44 - 16);
    for (const [W, H] of [[390, 56], [844, 56], [1440, 76]]) {
      const { out } = lateFor(W, H, -1100, -900);
      expect(out.canon!.box.y, `${W}×${H}`).toBe(H - 16);
      expect(out.today!.box.y, `${W}×${H}`).toBe(H - 16);
      expect(out.note!.box.y + out.note!.box.h, `${W}×${H}`).toBeLessThanOrEqual(H - 16 - 4);
    }
    const { out } = lateFor(1440, 76, -1100, -900);
    expect(out.note?.text).toBe('После завершения канона лиц нет');
    expect(out.note!.box.y).toBeLessThan(out.today!.box.y);
    expect(out.canon?.text).toBe('завершение канона');
    expect(out.today?.text).toBe('сегодня');
  });
  it('рамка в штриховке: пояснение уходит в свободную часть справа от ручки; не помещается — его нет', () => {
    const { input, out } = lateFor(1440, 76, -4269, 231);
    checkLate(input, out, '1440');
    expect(out.note!.box.x).toBeGreaterThan(input.grips[1].x + input.grips[1].w);
    // на 390 рамка «всего неба» доходит до 1199 г.: справа от ручки 35 px — пояснения нет, но и наложения нет
    const narrow = lateFor(390, 56, -4392, 1199);
    expect(narrow.out.note).toBe(null);
    expect(narrow.out.canon?.text).toBe('канон');
  });
  it('перебор окон и ширин: ни одна подпись не ложится на ручку, край рамки, черту или другую подпись', () => {
    let n = 0;
    for (const W of [320, 360, 390, 430, 600, 720, 768, 844, 1024, 1280, 1440, 1920])
      for (const H of [44, 56, 76])
        for (let a = -4200; a < 2040; a += 97)
          for (const w of [20, 60, 180, 700, 2500]) {
            const { input, out } = lateFor(W, H, a, Math.min(2040, a + w));
            checkLate(input, out, `${W}×${H} ${a}+${w}`);
            n++;
          }
    expect(n).toBeGreaterThan(10000);
  }, 60000);
  it('«сегодня» не уходит от своей черты дальше 30 px, канон — дальше 60 px', () => {
    for (const W of [390, 768, 1440])
      for (let a = -4200; a < 2040; a += 211) {
        const { input, out } = lateFor(W, W < 700 ? 56 : 76, a, Math.min(2040, a + 400));
        if (out.today) expect(Math.max(out.today.x - input.todayX, input.todayX - (out.today.x + wOf('сегодня')))).toBeLessThanOrEqual(30);
        if (out.canon) expect(out.canon.x - input.canonX).toBeLessThanOrEqual(60);
      }
  });
});

describe('подписи эпох (VIS-65)', () => {
  const layout = (W: number, rows: number, cw = 6.6) => {
    const T0 = years.toAstro(atlas.models[0].epochs[0].start) - 10;
    const xOf = (t: number) => PAD + ((t - T0) / (2040 - T0)) * (W - PAD * 2);
    const eps = atlas.models[0].epochs;
    const items = eps.map((e) => ({ id: e.id, x0: xOf(years.toAstro(e.start)), x1: xOf(years.toAstro(e.end)), w: e.short.length * cw }));
    const start = '4174 до Р. Х.'.length * cw;
    const places = strip.placeEpochLabels(items, rows, 2, W - 2, [[0, PAD, PAD + start], [0, W - PAD - 4 * cw, W - PAD]]);
    return { items, places, start };
  };
  it('между подписями строки — не меньше 14 px (не меньше 12 по заданию); подпись касается своей эпохи', () => {
    expect(strip.LABEL_GAP).toBeGreaterThanOrEqual(12);
    for (const [W, rows] of [[1440, 2], [1280, 2], [1024, 2], [768, 2], [844, 1], [720, 1], [390, 1], [320, 1]] as const) {
      const { items, places, start } = layout(W, rows);
      const boxes = items.filter((it) => places.has(it.id)).map((it) => ({ ...it, ...places.get(it.id)! }));
      for (const a of boxes) {
        expect(a.x + a.w, `${W}: ${a.id}`).toBeGreaterThanOrEqual(a.x0 - 2);
        expect(a.x, `${W}: ${a.id}`).toBeLessThanOrEqual(a.x1 + 2);
        for (const b of boxes)
          if (a !== b && a.row === b.row) expect(a.x + a.w + strip.LABEL_GAP <= b.x + 0.01 || b.x + b.w + strip.LABEL_GAP <= a.x + 0.01, `${W}: ${a.id} / ${b.id}`).toBe(true);
        if (a.row === 0) expect(a.x >= PAD + start + strip.LABEL_GAP - 0.01 || a.x + a.w <= PAD, `${W}: ${a.id} у начала шкалы`).toBe(true);
      }
    }
  });
  it('на 1440 и 1280 px подписаны все 16 эпох и при зазоре 14 px', () => {
    expect(layout(1440, 2).places.size).toBe(16);
    expect(layout(1280, 2).places.size).toBe(16);
    expect(layout(1280, 2, 7).places.size).toBe(16);
  });
  it('на полосе в одну строку подписаны самые широкие эпохи: «Время Церкви», при 720 и 844 — и «До Потопа»', () => {
    // при 390 «До Потопа» стоит вплотную к «4174 до Р. Х.»: помещается ли — решают доли пикселя замера шрифта (в сборке
    // помещается, сценарий 410); здесь ширина знака взята с запасом
    for (const W of [390, 720, 844]) {
      const { places } = layout(W, 1);
      if (W > 390) expect(places.has('antediluvian'), `${W}`).toBe(true);
      expect(places.has('church'), `${W}`).toBe(true);
    }
  });
});

describe('щелчок и колесо (IX-78, IX-57)', () => {
  it('второй щелчок двойного — не позже 500 мс и не дальше 6 px от первого; иначе — новый щелчок', () => {
    expect(strip.isSecondClick(null, 1000, 100)).toBe(false);
    expect(strip.isSecondClick({ t: 1000, x: 100 }, 1200, 103)).toBe(true);
    expect(strip.isSecondClick({ t: 1000, x: 100 }, 1600, 100)).toBe(false);
    expect(strip.isSecondClick({ t: 1000, x: 100 }, 1200, 120)).toBe(false);
  });
  it('колесо мыши — масштаб окна ×1,25 за щелчок: вниз — окно шире, вверх — уже', () => {
    const down = strip.stripWheel('mouse', false, false, 0, 100);
    expect(down).toEqual({ kind: 'zoom', f: 1 / 1.25 });
    const up = strip.stripWheel('mouse', false, false, 0, -100);
    expect(up?.kind).toBe('zoom');
    expect((up as { f: number }).f).toBeCloseTo(1.25, 10);
    // три щелчка разом — не больше трёх шагов
    expect((strip.stripWheel('mouse', false, false, 0, -1000) as { f: number }).f).toBeCloseTo(1.25 ** 3, 10);
  });
  it('Shift + колесо — сдвиг по времени (вниз — позже); Ctrl + Shift + колесо — растяжение времени; решение 47', () => {
    expect(strip.stripWheel('mouse', true, false, 0, 100)).toEqual({ kind: 'shift', px: 100 });
    // браузер мог уже повернуть Shift + колесо в прокрутку вбок
    expect(strip.stripWheel('mouse', true, false, -100, 0)).toEqual({ kind: 'shift', px: -100 });
    const st = strip.stripWheel('mouse', true, true, 0, -100);
    expect(st?.kind).toBe('stretch');
    expect((st as { f: number }).f).toBeCloseTo(1.25, 10);
  });
  it('тачпад: вбок — сдвиг, вдоль — плавный масштаб; щипок — масштаб за пальцами', () => {
    expect(strip.stripWheel('trackpad', false, false, 40, 3)).toEqual({ kind: 'shift', px: 40 });
    const z = strip.stripWheel('trackpad', false, false, 0, 10) as { kind: string; f: number };
    expect(z.kind).toBe('zoom');
    expect(z.f).toBeGreaterThan(0.97);
    expect(z.f).toBeLessThan(1);
    const p = strip.stripWheel('pinch', false, true, 0, -5) as { kind: string; f: number };
    expect(p.kind).toBe('pinch');
    expect(p.f).toBeCloseTo(Math.exp(0.05), 10);
    expect(strip.stripWheel('mouse', false, false, 0, 0)).toBe(null);
  });
});

describe('панель «Эпохи»: приближение словами (CARD-90)', () => {
  it('«в ~325 лет» — «примерно в 325 лет», «(~390)» — «(около 390)»', () => {
    expect(epochsPanel.approxWords('вмещает судей в ~325 лет. Сумма лет (~390) и ~40')).toBe('вмещает судей примерно в 325 лет. Сумма лет (около 390) и около 40');
  });
  it('в основаниях эпох всех моделей после замены нет тильды', () => {
    for (const m of atlas.models) for (const e of m.epochs) expect(epochsPanel.approxWords(`${e.basis} ${e.summary}`), `${m.id}: ${e.id}`).not.toMatch(/~/);
  });
});
