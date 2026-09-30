/**
 * Небо, волна 3b этапа 3 (docs/ui-review/README.md): меридиан года (D13), ярусы эпох (D14), отметки одноимённых (E10),
 * подсказка (E11), затемнение без потери читаемости (E12).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { contrast } from '../src/ui/contrast.ts';

// ---------- токены обеих тем (как их читает npm run -s contrast) ----------
const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const THEMES = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };

// небо в тестах: палитра — токены ночной темы, холст записывает надписи
let tokens: Record<string, string> = THEMES.night;
type Text = { t: string; x: number; y: number; base: string; alpha: number; font: string };
function recording() {
  const texts: Text[] = [];
  const state = { base: 'alphabetic', alpha: 1, font: '' };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y, base: state.base, alpha: state.alpha, font: state.font });
      if (k === 'globalAlpha') return state.alpha;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'textBaseline') state.base = v as string;
      if (k === 'globalAlpha') state.alpha = v as number;
      if (k === 'font') state.font = v as string;
      return true;
    },
  });
  return { ctx, texts };
}

let Sky: typeof import('../src/render/sky.ts').Sky;
let sky: typeof import('../src/render/sky.ts');
let models: typeof import('../src/data/atlas.ts').models;
let byId: typeof import('../src/data/atlas.ts').byId;
let text: typeof import('../src/ui/sky/text.ts');
let tiers: typeof import('../src/render/tiers.ts');
let tip: typeof import('../src/ui/sky/tip.ts');
let years: typeof import('../src/engine/years.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: (n: string) => tokens[n] ?? '' }),
  });
  sky = await import('../src/render/sky.ts');
  Sky = sky.Sky;
  ({ models, byId } = await import('../src/data/atlas.ts'));
  text = await import('../src/ui/sky/text.ts');
  tiers = await import('../src/render/tiers.ts');
  tip = await import('../src/ui/sky/tip.ts');
  years = await import('../src/engine/years.ts');
}, 60_000);

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(o: { w?: number; h?: number; move?: (s: InstanceType<typeof Sky>) => void; state?: Record<string, unknown> } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s = new Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(models[0], 1);
  s.fitAll();
  o.move?.(s);
  s.draw({
    model: models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    ...(o.state ?? {}),
  } as Parameters<InstanceType<typeof Sky>['draw']>[0]);
  return { sky: s, texts: rec.texts };
}
/** Подписи звёзд (без рамки, указателей у края и сокращений ролей): прямоугольник по ширине 7 px на знак. */
const SIGLA = /^(ц\.|цар\.|пр\.|первосв\.|св\.|суд\.|ап\.|патр\.|лев\.)( \S+)?$/;
const starLabels = (texts: Text[], top: number) =>
  // уточнение одноимённого — часть подписи, а не отдельная подпись: «, сын Навата», « Магдалина», « (Мф 2)» (решение 43)
  texts.filter((q) => q.base === 'alphabetic' && q.y > top && !/^[↑↓←→]/.test(q.t) && !SIGLA.test(q.t) && !/^,? /.test(q.t) && !/^[А-ЯЁ ]{4,}$/.test(q.t));
/**
 * Прямоугольник нарисованной подписи — той же геометрией, что проверяет размещение (labels.ts, textBox): строка кеглем
 * из шрифта подписи (верх — 0,8 кегля над базовой линией, низ — 0,24 под ней) с ореолом 1,5 px. Прежняя рамка
 * (14 px вверх и 17 px высотой при любом кегле) была на 1,5–2 px выше настоящей у кегля 12 и видела «наложение»
 * подписей, стоящих вплотную (Уриил и Церуа при шаге строк 16 px): глифы и их ореолы при этом не пересекаются.
 */
const sizeOf = (q: Text) => Number(/(\d+(?:\.\d+)?)px/.exec(q.font)?.[1] ?? 14);
const box = (q: Text) => {
  const size = sizeOf(q);
  return { x: q.x - 1.5, y: q.y - 0.8 * size - 1.5, w: q.t.length * 7 + 3, h: 1.04 * size + 3 };
};
const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Приблизить к году (астр.) у середины неба. */
const at = (t: number, k: number) => (s: InstanceType<typeof Sky>) => {
  s.cam.zoomAt(720, 400, k);
  s.cam.x0 = s.xOf(t) - 720 / s.cam.kx;
};

// ---------- D13: меридиан ----------

describe('меридиан года (D13; UX-27, IX-34, MAP-07, MAP-33)', () => {
  // UX-59 (этап 7): число — с существительным и «около», «наверняка» — с тире; строку меняет агент cardtext (K3)
  it('флажок: «990 г. до Р. Х.: живы около 186 лиц, наверняка — 41»; падеж после «около» — по числу', () => {
    const t = years.toAstro(-990);
    const nb = (s: string) => s.replace(/\u00a0/g, ' ');
    expect(nb(text.meridianText(t, 186, 41))).toBe('990 г. до Р. Х.: живы около 186 лиц, наверняка — 41');
    expect(nb(text.meridianText(t, 291, 7))).toMatch(/: живы около 291 лица, наверняка — 7$/);
    expect(nb(text.meridianText(t, 11, 0))).toMatch(/: живы около 11 лиц, все — вероятно$/);
    expect(nb(text.meridianText(t, 1, 0))).toMatch(/: жив один человек — вероятно$/);
    expect(nb(text.meridianText(t, 1, 1))).toMatch(/: жив один человек — наверняка$/);
    expect(nb(text.meridianText(years.toAstro(2000), 0, 0))).toBe('2000 г. по Р. Х.: живых лиц Писания нет');
  });
  it('«наверняка» — внутри надёжной части жизни, «вероятно» — по оценке; эпохальные даты не считаются', () => {
    const m = models[0];
    const t = years.toAstro(-990);
    const alive = text.aliveAt(m.chrono, t);
    expect(alive.size).toBeGreaterThan(50);
    let sure = 0;
    for (const [id, k] of alive) {
      const c = m.chrono.get(id)!;
      expect(c.cls).not.toBe('epochal');
      expect(c.b <= t && t <= (c.d ?? c.dEst), id).toBe(true);
      if (k === 'sure') {
        sure++;
        expect(t >= c.bHi && t <= (c.d ?? c.last)!, id).toBe(true);
      }
    }
    expect(sure).toBeGreaterThan(0);
    expect(sure).toBeLessThan(alive.size);
    // Давид в 990 г. до Р. Х. — царствует: жив наверняка
    expect(alive.get('david')).toBe('sure');
  });
  it('появляется через 250 мс, дальше следует за указателем; уход и нажатие снимают сразу', async () => {
    vi.useFakeTimers();
    const { hoverYear, MERIDIAN_DELAY } = await import('../src/ui/sky/meridian.ts');
    const { meridian } = await import('../src/state.ts');
    expect(MERIDIAN_DELAY).toBe(250);
    hoverYear(-989);
    vi.advanceTimersByTime(120);
    hoverYear(-985);
    vi.advanceTimersByTime(120);
    expect(meridian.value).toBe(null);
    vi.advanceTimersByTime(10);
    expect(meridian.value).toBe(-985);
    hoverYear(-900);
    expect(meridian.value).toBe(-900);
    hoverYear(null);
    expect(meridian.value).toBe(null);
    // проход мимо шкалы короче 250 мс меридиана не даёт
    hoverYear(-700);
    vi.advanceTimersByTime(200);
    hoverYear(null);
    vi.advanceTimersByTime(500);
    expect(meridian.value).toBe(null);
  });
  afterEach(() => vi.useRealTimers());
  it('подписи меридиана проходят проверку наложений: сверх обычных — не больше восьми, ни одна не ложится на другие', () => {
    const t = years.toAstro(-990);
    for (const k of [3, 8, 20]) {
      const move = at(t, k);
      const base = drawSky({ move });
      const alive = text.aliveAt(models[0].chrono, t);
      let sure = 0;
      for (const v of alive.values()) if (v === 'sure') sure++;
      const label = text.meridianText(t, alive.size, sure);
      const withM = drawSky({ move, state: { meridian: t, highlight: alive, meridianLabel: label } });
      const top = sky.FRAME_H;
      const a = starLabels(base.texts, top);
      const b = starLabels(withM.texts, top);
      const key = (q: Text) => `${q.t}|${Math.round(q.x)}|${Math.round(q.y)}`;
      const old = new Set(a.map(key));
      const extra = b.filter((q) => !old.has(key(q)));
      expect(extra.length, `×${k}`).toBeLessThanOrEqual(8);
      for (const q of extra) for (const o of b) if (o !== q) expect(cross(box(q), box(o)), `${q.t} на ${o.t} (×${k})`).toBe(false);
      // флажок — в служебной строке рамки
      const flag = withM.texts.find((q) => q.t === label);
      expect(flag, `×${k}`).toBeTruthy();
      expect(flag!.y).toBeLessThan(top);
      expect(withM.sky.meridianFlag).toBeTruthy();
    }
  }, 60_000);
  it('«вероятно» — бледнее, чем «наверняка»; погашенные — бледнее обоих', () => {
    const t = years.toAstro(-990);
    const alive = text.aliveAt(models[0].chrono, t);
    const { texts } = drawSky({ move: at(t, 8), state: { meridian: t, highlight: alive } });
    const name = (id: string) => byId.get(id)!.name;
    const alphaOf = (kind: 'sure' | 'likely' | 'dim') =>
      starLabels(texts, sky.FRAME_H)
        .filter((q) => {
          const ids = [...byId.values()].filter((p) => p.name === q.t).map((p) => p.id);
          const k = ids.map((id) => alive.get(id) ?? 'dim');
          return ids.length === 1 && k[0] === kind;
        })
        .map((q) => q.alpha);
    const sure = alphaOf('sure');
    const likely = alphaOf('likely');
    const dim = alphaOf('dim');
    expect(sure.length && likely.length && dim.length).toBeTruthy();
    expect(Math.min(...sure)).toBe(1);
    expect(Math.max(...likely)).toBeLessThan(1);
    expect(Math.max(...dim)).toBeLessThan(Math.min(...likely) + 1e-9);
    void name;
  });
});

// ---------- D14: ярусы эпох ----------

describe('ярусы эпох (D14; IX-28, MAP-46, MAP-47, MAP-48, VIS-26)', () => {
  it('совместные правления — в соседних строках и со штриховкой', () => {
    const ts = tiers.buildTiers(models[0]);
    const judah = ts.find((x) => x.key === 'judah')!;
    const amasiya = judah.bars.find((b) => b.id === 'amasiya')!;
    const oziya = judah.bars.find((b) => b.id === 'oziya')!;
    expect(amasiya.row).not.toBe(oziya.row);
    expect(oziya.shared.length).toBeGreaterThan(0);
    // в строке отрезки не перекрываются
    for (const t of ts.filter((x) => x.key !== 'epochs' && x.key !== 'events'))
      for (const a of t.bars) for (const b of t.bars) if (a !== b && a.row === b.row) expect(a.t1 <= b.t0 || b.t1 <= a.t0, `${a.key} ${b.key}`).toBe(true);
  });
  it('пустой ярус свёрнут в строку 14 px; высота — по видимым отрезкам окна', () => {
    const ts = tiers.buildTiers(models[0]);
    const T = years.toAstro;
    const patriarchs = tiers.planTiers(ts, T(-2100), T(-1900));
    const kings = tiers.planTiers(ts, T(-790), T(-650));
    const all = tiers.planTiers(ts, T(-4200), T(100));
    const blk = (p: typeof all, k: string) => p.blocks.find((b) => b.tier.key === k)!;
    for (const k of ['judges', 'judah', 'israel', 'prophets']) {
      expect(blk(patriarchs, k).collapsed, k).toBe(true);
      expect(blk(patriarchs, k).h).toBe(tiers.COLLAPSED_H);
    }
    expect(blk(patriarchs, 'epochs').collapsed).toBe(false);
    expect(blk(kings, 'judges').collapsed).toBe(true);
    expect(blk(kings, 'judah').rows.length).toBeGreaterThan(0);
    expect(blk(kings, 'prophets').rows.length).toBeGreaterThan(0);
    for (const b of all.blocks) expect(b.collapsed, b.tier.key).toBe(false);
    expect(patriarchs.bottom).toBeLessThan(kings.bottom);
    expect(kings.bottom).toBeLessThanOrEqual(all.bottom);
    // ярусы идут подряд, начиная под рамкой; нижний край — под последним
    let y = tiers.TIER_TOP;
    for (const b of kings.blocks) {
      expect(b.y).toBe(y);
      y = b.y + b.h + 2;
    }
    expect(kings.bottom).toBeGreaterThan(kings.blocks[kings.blocks.length - 1].y + kings.blocks[kings.blocks.length - 1].h);
    // строки яруса — только те, где в окне есть отрезки
    const judah = blk(kings, 'judah');
    const vis = judah.tier.bars.filter((b) => b.t1 >= T(-790) && b.t0 <= T(-650));
    expect(new Set(judah.rows)).toEqual(new Set(vis.map((b) => b.row)));
  });
  it('на обзоре ярусы — мелкие строки без подписей (MAP-48): не больше 20 % неба высотой 776 px', () => {
    const ts = tiers.buildTiers(models[0]);
    const T = years.toAstro;
    // обзор: 4300 лет на 1400 px — мелкий масштаб; 150 лет на 900 px — обычный
    expect(tiers.compactAt(1400 / 4300)).toBe(true);
    expect(tiers.compactAt(900 / 150)).toBe(false);
    const all = tiers.planTiers(ts, T(-4200), T(100), '', tiers.TIER_TOP, true);
    expect(all.bottom - tiers.TIER_TOP).toBeLessThan(776 * 0.2);
    for (const b of all.blocks) if (b.tier.key !== 'epochs') expect(b.pitch).toBe(tiers.COMPACT_PITCH);
  });
});

// ---------- E10: отметки одноимённых ----------

describe('отметки одноимённых (E10; UX-31, IX-19, MAP-49)', () => {
  it('строка «Отмечено поиском: N лиц по запросу «…»» (подсказка «Esc — снять» — в разметке строки, только с клавиатурой)', async () => {
    // этап 13, решение 126: строку пишет Overlays.searchPinText («поиском» отличает отметки от выбора, набора и показа);
    // прежняя pinBarText удалена — смысл проверки тот же: число согласовано, запрос в кавычках, пустой запрос не пишется
    const { searchPinText } = await import('../src/ui/sky/Overlays.tsx');
    expect(searchPinText(11, 'Иосиф')).toBe('Отмечено поиском: 11 лиц по запросу «Иосиф»');
    expect(searchPinText(2, 'Мария')).toBe('Отмечено поиском: 2 лица по запросу «Мария»');
    expect(searchPinText(1, ' ')).toBe('Отмечено поиском: 1 лицо');
  }, 60_000);
  it('у отметки — подпись с уточнением; подписи отметок не ложатся друг на друга', () => {
    const ids = [...byId.values()].filter((p) => p.name === 'Иосиф').map((p) => p.id);
    expect(ids.length).toBeGreaterThan(5);
    const hl = new Map(ids.map((id) => [id, 'self' as const]));
    const { texts } = drawSky({ state: { pins: new Set(ids), highlight: hl } });
    // у отметок — уточнение целиком; у прочих одноимённых в окне (MAP-66) — краткое, не больше двух слов
    const notes = texts.filter((q) => q.t.startsWith(', '));
    const full = notes.filter((n) => ids.some((id) => `, ${byId.get(id)!.disambig}` === n.t));
    expect(full.length).toBeGreaterThan(3);
    for (const n of notes) if (!full.includes(n)) expect(n.t.slice(2).split(/\s+/).length, n.t).toBeLessThanOrEqual(2);
    const names = texts.filter((q) => q.t === 'Иосиф' && q.base === 'alphabetic');
    for (const a of names) for (const b of names) if (a !== b) expect(cross(box(a), box(b))).toBe(false);
  });
});

// ---------- E11: подсказка ----------

describe('подсказка (E11; IX-06, IX-07)', () => {
  const bounds = { x: 12, y: 12, w: 976, h: 676 };
  const size = { w: 220, h: 80 };
  const star = (x: number, y: number) => ({ x: x - 9, y: y - 9, w: 18, h: 18 });
  it('четыре положения у краёв неба: у правого — слева, у нижнего — сверху, в углу — слева сверху', () => {
    expect(tip.placeTip(star(400, 300), size, bounds).side).toBe('se');
    expect(tip.placeTip(star(950, 300), size, bounds).side).toBe('sw');
    expect(tip.placeTip(star(400, 670), size, bounds).side).toBe('ne');
    expect(tip.placeTip(star(950, 670), size, bounds).side).toBe('nw');
  });
  it('не закрывает звезду под указателем, выбранное лицо и по возможности органы неба; не выходит за край', () => {
    for (const [x, y] of [[400, 300], [950, 300], [400, 670], [950, 670], [20, 20], [990, 20]]) {
      const a = star(x, y);
      const p = tip.placeTip(a, size, bounds);
      const r = { x: p.x, y: p.y, ...{ w: size.w, h: size.h } };
      expect(cross(r, a), `${x},${y}`).toBe(false);
      expect(p.x >= bounds.x && p.y >= bounds.y && p.x + size.w <= bounds.x + bounds.w && p.y + size.h <= bounds.y + bounds.h).toBe(true);
    }
    // выбранное лицо справа снизу — подсказка уходит вверх
    const sel = { x: 420, y: 320, w: 120, h: 30 };
    expect(tip.placeTip(star(400, 300), size, bounds, [sel]).side).toBe('ne');
    // органы неба справа сверху и справа снизу — подсказка слева
    const ctl = { x: 410, y: 150, w: 400, h: 400 };
    expect(tip.placeTip(star(400, 300), size, bounds, [], [ctl]).side).toMatch(/^(sw|nw)$/);
  });
  it('задержка 120 мс; соседняя звезда сразу после прежней — без задержки', () => {
    expect(tip.TIP_DELAY).toBe(120);
    expect(tip.TIP_WARM).toBeGreaterThan(tip.TIP_DELAY);
  });
  it('на обзоре указатель ловит только звёзды величины 0–3', () => {
    const { sky: s } = drawSky();
    expect(s.cam.ky).toBeLessThan(5);
    let small = 0;
    for (let i = 0; i < s.nodes.length; i++) {
      const n = s.nodes[i];
      const p = byId.get(n.person)!;
      if (p.magnitude <= 3 || n.ghost) continue;
      const x = s.cam.sx(s.X0[i]);
      const y = s.cam.sy(n.lane);
      if (x < 40 || x > s.cam.w - 40 || y < 80 || y > s.cam.h - 40) continue;
      const hit = s.hit(x, y, 1);
      if (hit === n.person) small++;
    }
    expect(small).toBe(0);
    // крупная звезда на обзоре ловится
    const i = s.nodes.findIndex((n) => n.person === 'david');
    expect(s.hit(s.cam.sx(s.X0[i]), s.cam.sy(s.nodes[i].lane), 2)).toBe('david');
  });
});

// ---------- E12: затемнение ----------

describe('затемнение без потери читаемости (E12; MOB-41)', () => {
  for (const [name, t] of Object.entries(THEMES))
    it(`тема ${name}: погашенная подпись и «вероятно» — не ниже 3 : 1, названия созвездий при выделении — альфа ≥ 0,75 и ≥ 3 : 1`, () => {
      for (const ink of ['--ink', '--ink-2']) {
        const a = sky.alphaForContrast(t[ink], t['--sky'], sky.DIM_LABEL_CONTRAST);
        expect(a).toBeLessThan(1);
        expect(contrast(sky.over(t[ink], t['--sky'], Math.max(sky.DIM, a)), t['--sky'])).toBeGreaterThanOrEqual(3);
        const dim = contrast(sky.over(t[ink], t['--sky'], Math.max(sky.DIM, a)), t['--sky']);
        const likely = contrast(sky.over(t[ink], t['--sky'], sky.likelyAlpha(a)), t['--sky']);
        expect(likely).toBeGreaterThanOrEqual(3);
        // «вероятно» заметно ярче погашенной (в дневной теме порог 3 : 1 у --ink-2 выше 0,6)
        expect(likely / dim).toBeGreaterThan(1.2);
      }
      expect(sky.CONSTELLATION_DIM).toBeGreaterThanOrEqual(0.75);
      expect(contrast(sky.over(t['--ink-3'], t['--sky'], sky.CONSTELLATION_DIM), t['--sky'])).toBeGreaterThanOrEqual(3);
    });
  it('при выбранном Давиде ни одна подпись не прозрачнее порога 3 : 1; погашенные бледнее выделенных', () => {
    for (const [name, t] of Object.entries(THEMES)) {
      tokens = t;
      const david = models[0].chrono.get('david')!;
      const hl = new Map<string, 'self' | 'anc' | 'desc' | 'path'>([['david', 'self'], ['iessey', 'anc'], ['solomon', 'desc']]);
      const { texts } = drawSky({ move: at(david.b, 8), state: { selected: 'david', highlight: hl } });
      const labels = starLabels(texts, sky.FRAME_H);
      expect(labels.length, name).toBeGreaterThan(10);
      const floor = Math.min(sky.alphaForContrast(t['--ink'], t['--sky'], 3), sky.alphaForContrast(t['--ink-2'], t['--sky'], 3));
      for (const q of labels) expect(q.alpha, `${name}: ${q.t}`).toBeGreaterThanOrEqual(floor - 1e-9);
      expect(labels.find((q) => q.t === 'Давид')!.alpha).toBe(1);
      expect(labels.some((q) => q.alpha < 1)).toBe(true);
    }
    tokens = THEMES.night;
  });
});
