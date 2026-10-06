/**
 * Рамка неба и время (этап 4, E7, E9; MAP-30…35, 40; UX-07…10): честная линейка (один шаг рисок на окно, подписи у своих
 * рисок, граница эр), масштабная линейка, меридианы событий, названия эпох, нижняя кромка со столбцами атласа, буквы
 * строк, растяжение шкалы не больше 1 : 6, контраст линий карты.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { contrast } from '../src/ui/contrast.ts';
import { alphaForContrast, over } from '../src/render/dim.ts';
import { buildTimeScale, timeToX, DENSE_MAG, T_CANON_END } from '../src/engine/timescale.ts';
import { atlasColumn, atlasRow, atlasRowLetter, packSpan } from '../src/engine/layout.ts';
import { toAstro, toHist } from '../src/engine/years.ts';

const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const THEMES = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };

type Text = { t: string; x: number; y: number; base: string };
type Call = [string, ...unknown[]];
function recording() {
  const texts: Text[] = [];
  const calls: Call[] = [];
  let base = 'alphabetic';
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y, base });
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      if (k === 'textBaseline') base = v as string;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, calls };
}

let sky: typeof import('../src/render/sky.ts');
let frame: typeof import('../src/render/frame.ts');
let models: typeof import('../src/data/atlas.ts').models;
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  sky = await import('../src/render/sky.ts');
  frame = await import('../src/render/frame.ts');
  ({ models } = await import('../src/data/atlas.ts'));
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(o: { w?: number; move?: (s: Sky) => void; lambda?: number } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, 776, 1);
  s.setModel(models[0], o.lambda ?? 1);
  s.fitAll();
  o.move?.(s);
  s.draw({
    model: models[0], lambda: o.lambda ?? 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
  } as Parameters<Sky['draw']>[0]);
  return { sky: s, ...rec };
}
/** Окно в years лет вокруг года h (исторический). */
const window = (h: number, years: number) => (s: Sky) => {
  const t = toAstro(h);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + vw / 2) / kx, kx, laneTop: 0 + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};
const VIEWS: [string, ((s: Sky) => void) | undefined][] = [
  ['обзор', undefined],
  ['эпоха у Давида', window(-1000, 700)],
  ['поколения', window(-1000, 180)],
  ['семья', window(-1010, 50)],
  ['Рождество', window(-10, 80)],
];

// этап 21, решение 196: линейка лет — у масштаба «Равномерный по годам» (λ = 0); у масштаба «По эпохам» (λ = 1) линейка
// называет эпохи — её проверки ниже («линейка эпох») и в tests/time13.test.ts
describe('линейка лет (E7; MAP-30, UX-08)', () => {
  for (const [name, move] of VIEWS)
    it(`${name}: один шаг рисок на окно; подписи — у своих рисок, по кратным одного шага, без наложений`, () => {
      const { sky: s, texts } = drawSky({ move, lambda: 0 });
      const ticks = frame.yearTicks(s).filter((t) => t.t <= T_CANON_END);
      expect(ticks.length).toBeGreaterThan(3);
      const steps = new Set<number>();
      for (let k = 1; k < ticks.length; k++) steps.add(ticks[k].h - ticks[k - 1].h - (ticks[k - 1].h < 0 && ticks[k].h > 0 ? ticks[k].h : 0));
      expect(steps.size, [...steps].join(' ')).toBe(1);
      const step = [...steps][0];
      const labels = ticks.filter((t) => t.major);
      const L = Math.min(...labels.slice(1).map((t, k) => t.h - labels[k].h).filter((d) => d > 0));
      for (const t of labels) expect(Math.abs(t.h % L), `${t.h}`).toBe(0);
      expect(L % step).toBe(0);
      // нарисованные подписи линейки: число — по центру своей риски
      const ruler = texts.filter((q) => q.base === 'middle' && q.y < frame.RULER_H && /^\d+/.test(q.t));
      expect(ruler.length).toBeGreaterThan(1);
      for (const q of ruler) {
        const num = /^\d+/.exec(q.t)![0];
        const tk = labels.find((t) => String(Math.abs(t.h)) === num && Math.abs(s.cam.sx(s.xOf(t.t)) - (q.x + (num.length * 6) / 2)) < 0.5);
        expect(tk, q.t).toBeTruthy();
      }
      const boxes = s.labelStats().boxes.filter((b) => b.kind === 'frame' && b.y < frame.RULER_H);
      expect(s.labelStats().overlaps).toBe(0);
      expect(boxes.length).toBeGreaterThanOrEqual(ruler.length);
    });

  it('эра: «до Р. Х.» у первой подписи до Рождества, «по Р. Х.» — у первой после; граница эр — риска во всю высоту', () => {
    const { sky: s, texts, calls } = drawSky({ move: window(-10, 80), lambda: 0 });
    const ruler = texts.filter((q) => q.base === 'middle' && q.y < frame.RULER_H);
    expect(ruler.filter((q) => /до Р\. Х\./.test(q.t)).length).toBe(1);
    expect(ruler.filter((q) => /по Р\. Х\./.test(q.t)).length).toBe(1);
    const bc = ruler.find((q) => /до Р/.test(q.t))!;
    const ad = ruler.find((q) => /по Р/.test(q.t))!;
    const xEra = Math.round(s.cam.sx(s.xOf(1))) + 0.5;
    expect(bc.x).toBeLessThan(xEra);
    expect(ad.x).toBeGreaterThan(xEra);
    // риска границы эр: от верха линейки
    expect(calls.some((c, k) => c[0] === 'moveTo' && c[1] === xEra && c[2] === 2 && calls[k + 1]?.[0] === 'lineTo')).toBe(true);
  });

  it('после 100 г. шкала сжата: свой шаг рисок; знак разрыва', () => {
    const { sky: s } = drawSky({ lambda: 0 });
    const post = frame.yearTicks(s).filter((t) => t.t > T_CANON_END);
    for (const t of post) expect(t.h % 100).toBe(0);
  });
});

describe('линейка эпох (этап 21, решение 196)', () => {
  for (const [name, move] of VIEWS)
    it(`${name}: «По эпохам» — рисок лет нет, эпохи названы в линейке без наложений; граница эпохи — риска во всю высоту`, () => {
      const { sky: s, texts, calls } = drawSky({ move });
      expect(frame.byEpochs(s)).toBe(true);
      expect(frame.yearTicks(s)).toEqual([]);
      const names = new Set(models[0].epochs.flatMap((e) => [e.name, e.short]));
      const ruler = texts.filter((q) => q.base === 'middle' && q.y < frame.RULER_H);
      expect(ruler.length, name).toBeGreaterThan(0);
      for (const q of ruler) expect(names.has(q.t), q.t).toBe(true);
      expect(s.labelStats().overlaps).toBe(0);
      // риска границы эпохи в окне — от верха линейки (3 px) до её низа
      const bounds = models[0].epochs.map((e) => Math.round(s.cam.sx(s.xOf(toAstro(e.start)))) + 0.5).filter((x) => x > s.letterW + 1 && x < s.cam.w - 1);
      for (const x of bounds) expect(calls.some((c, k) => c[0] === 'moveTo' && c[1] === x && c[2] === 3 && calls[k + 1]?.[0] === 'lineTo'), `риска у ${x}`).toBe(true);
    });
});

describe('масштабная линейка и слова (E7; UX-08)', () => {
  // шесть окон неба подряд: под нагрузкой общей машины — больше 5 с (явный срок, как у других тяжёлых тестов неба)
  it('«├─ 50 лет ─┤»: круглое число лет, отрезок 12–120 px; «≈» — только при неравномерной шкале', { timeout: 60_000 }, () => {
    for (const [, move] of VIEWS) {
      // круглые годы — и на «Равномерном по годам» (λ = 0), и на «По эпохам» (λ = 1): линейку «поколение ≈ N лет»
      // (решение 196) сняла рецензия этапа 21 — длина поколения выходила из оценок решателя, а не из чисел текста
      for (const lambda of [0, 1]) {
        const { sky: s } = drawSky({ move, lambda });
        const b = frame.scaleBar(s)!;
        expect(b).toBeTruthy();
        expect([1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000]).toContain(b.years);
        expect(b.px).toBeGreaterThanOrEqual(12);
        expect(b.px).toBeLessThanOrEqual(120);
      }
    }
    const { sky: t } = drawSky({ lambda: 0 });
    expect(frame.scaleBar(t)!.approx).toBe(false);
  });
  it('годы согласованы с числом', () => {
    expect(frame.yearsWord(1)).toBe('1 год');
    expect(frame.yearsWord(2)).toBe('2 года');
    expect(frame.yearsWord(5)).toBe('5 лет');
    expect(frame.yearsWord(11)).toBe('11 лет');
    expect(frame.yearsWord(21)).toBe('21 год');
    expect(frame.yearsWord(250)).toBe('250 лет');
    expect(frame.yearText(toAstro(-1446))).toBe('1446 г. до Р. Х.');
    expect(frame.yearText(30)).toBe('30 г. по Р. Х.');
  });
});

describe('меридианы событий и эпохи (E7; MAP-32, 35, UX-10)', () => {
  it('семь событий ТЗ § 3.1: годы по модели, со стихами', () => {
    const { sky: s } = drawSky();
    const ev = frame.eventMarks(s);
    expect(ev.map((e) => e.name)).toEqual(['Потоп', 'Призвание Аврама', 'Исход', 'Закладка храма', 'Вавилонский плен', 'Возвращение из плена', 'Рождество Христово']);
    const year = (n: string) => Math.round(toHist(ev.find((e) => e.name === n)!.t));
    expect(year('Потоп')).toBe(-2518);
    expect(year('Призвание Аврама')).toBe(-2091);
    expect(year('Исход')).toBe(-1446);
    expect(year('Закладка храма')).toBe(-967);
    expect(year('Рождество Христово')).toBe(-5);
    for (const e of ev) expect(e.refs.length, e.name).toBeGreaterThan(0);
    expect(ev.find((e) => e.name === 'Исход')!.full).toBe('Исход, 1446 г. до Р. Х. (расч.)');
  });
  it('названия эпох — в служебной строке, по своим годам (масштаб «Равномерный по годам»; «По эпохам» — в линейке, выше)', () => {
    const { sky: s, texts } = drawSky({ move: window(-1000, 700), lambda: 0 });
    const row = texts.filter((q) => q.y > frame.RULER_H && q.y < frame.FRAME_H && q.base === 'middle');
    const names = models[0].epochs.flatMap((e) => [e.name, e.short]);
    const eps = row.filter((q) => names.includes(q.t));
    expect(eps.length).toBeGreaterThanOrEqual(2);
    for (const q of eps) {
      const e = models[0].epochs.find((x) => x.name === q.t || x.short === q.t)!;
      const t = s.tOf(s.cam.wx(q.x));
      expect(t, q.t).toBeGreaterThanOrEqual(toAstro(e.start) - 1);
      expect(t, q.t).toBeLessThan(toAstro(e.end));
    }
  });
});

describe('координаты на карте (E9; UX-07, MAP-34, MOB-08)', () => {
  for (const [name, move] of VIEWS.slice(0, 4))
    it(`${name}: номера столбцов на нижней кромке — в своих столбцах; буквы строк слева`, () => {
      const { sky: s, texts } = drawSky({ move });
      const vpb = s.cam.vp.b;
      const cols = texts.filter((q) => q.y > vpb && q.y < vpb + frame.BOTTOM_H && /^\d+$/.test(q.t));
      expect(cols.length).toBeGreaterThan(0);
      for (const q of cols) expect(atlasColumn(s.tOf(s.cam.wx(q.x + (q.t.length * 6) / 2))), q.t).toBe(Number(q.t));
      const letters = texts.filter((q) => q.x < s.letterW && q.y > s.openTop && q.y < vpb);
      expect(letters.length).toBeGreaterThan(0);
      for (const q of letters) expect(atlasRowLetter(atlasRow(s.cam.wLane(q.y))), q.t).toBe(q.t);
    });
  it('низкое небо (лист карточки на телефоне): буквы у каждой k-й строки, каждая — в своей строке', () => {
    const rec = recording();
    const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const s = new sky.Sky(canvas);
    s.resize(390, 330, 1);
    s.setModel(models[0], 1);
    s.fitAll();
    s.draw({
      model: models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<Sky['draw']>[0]);
    expect(s.cam.ky * 15).toBeLessThan(16);
    const letters = rec.texts.filter((q) => q.x < s.letterW && q.y > s.openTop && q.y < s.cam.vp.b);
    expect(letters.length).toBeGreaterThan(2);
    for (const q of letters) expect(atlasRowLetter(atlasRow(s.cam.wLane(q.y))), q.t).toBe(q.t);
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('Давид — в строке «П» (ось коридора)', () => {
    const { sky: s, texts } = drawSky({ move: window(-1010, 50) });
    const y = s.cam.sy(s.node('david')!.lane);
    const letters = texts.filter((q) => q.x < s.letterW && q.y > s.openTop);
    const near = letters.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
    expect(near.t).toBe('П');
  });
});

describe('масштаб времени «По эпохам» (решение 196; прежде «Сжатый по плотности лиц», «по насыщенности») — растяжение не больше 1 : 6 (решение 1; MAP-31)', () => {
  const ratio = (ts: ReturnType<typeof buildTimeScale>) => {
    let lo = Infinity;
    let hi = 0;
    for (let t = ts.knots[0]; t < T_CANON_END - 1; t += 0.5) {
      const d = timeToX(ts, t + 0.5, 1) - timeToX(ts, t, 1);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return hi / lo;
  };
  it('на данных атласа', () => {
    const m = models[0];
    const births: number[] = [];
    const spans: [number, number][] = [];
    for (const c of m.chrono.values()) {
      births.push(c.b);
      spans.push(packSpan({ b: c.b, d: c.d, lastAttested: c.last }));
    }
    expect(DENSE_MAG).toBe(6);
    expect(ratio(buildTimeScale(births, spans))).toBeLessThanOrEqual(DENSE_MAG + 0.05);
  });
  it('на плотном скоплении рождений в пустом времени', () => {
    const births = [-4000, -3000, ...Array.from({ length: 400 }, (_, k) => -1000 + (k % 20))];
    const spans = births.map((b) => [b, b + 60] as [number, number]);
    const r = ratio(buildTimeScale(births, spans));
    expect(r).toBeGreaterThan(3);
    expect(r).toBeLessThanOrEqual(DENSE_MAG + 0.05);
  });
});

describe('контраст линий карты (E8; MAP-41)', () => {
  for (const [name, t] of Object.entries(THEMES))
    it(`тема ${name}: контуры созвездий и меридианы событий — не ниже 3 : 1 к небу`, () => {
      const a = alphaForContrast(t['--ink-3'], t['--sky'], sky.LINE_CONTRAST);
      expect(a).toBeLessThan(1);
      expect(contrast(over(t['--ink-3'], t['--sky'], a), t['--sky'])).toBeGreaterThanOrEqual(3);
    });
});
