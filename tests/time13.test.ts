/**
 * Этап 13, T5: модели хронологии словами (решение 102) и слои неба в строке показа (решение 111) — контракт 5
 * (src/ui/modelinfo.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { barLines, factsOf, layersBar, modelBar, modelItems, modelShift, modelsFoot, DEFAULT_MODEL } from '../src/ui/modelinfo.ts';
import { layers, modelId, restoreLayers, LAYER_KEYS } from '../src/state.ts';
import { modelInfo } from '../src/data/atlas.ts';

describe('контракт 5: модели словами', () => {
  it('модель по умолчанию — «Основной текст: 430 лет в Египте», без «масоретских»', () => {
    expect(factsOf(DEFAULT_MODEL)!.name).toBe('Основной текст: 430 лет в Египте');
    for (const it of modelItems()) expect(it.name).not.toMatch(/масорет/i);
  });
  it('каждый пункт списка: название, входные числа, «Напряжения»; у не основной — «Меняет»', () => {
    const items = modelItems();
    expect(items.map((i) => i.id)).toEqual(modelInfo.map((m) => m.id));
    for (const it of items) {
      expect(it.inputs.length).toBeGreaterThan(10);
      expect(it.tensions).toMatch(/^Напряжения: \d+/);
      if (it.id === DEFAULT_MODEL) expect(it.changes).toBeNull();
      else expect(it.changes).toMatch(/^Меняет: \d+ лиц/);
    }
  });
  it('«Краткое пребывание» сдвигает всё до Исхода на 215 лет позже, Исход на месте', () => {
    const s = modelShift('mt-short')!;
    expect(s.until).toBe('до Исхода');
    expect(s.how).toBe('на 215 лет позже');
    expect(s.years).toMatch(/сотворение — 3959/);
    expect(modelShift('lxx')!.until).toBe('до рождения Аврама');
    expect(modelShift(DEFAULT_MODEL)).toBeNull();
    expect(modelsFoot()).toMatch(/^Во всех моделях одинаковы Исход \(1446 г\. до Р\. Х\.\) и годы после него: 3 Цар 6:1 и опора 967/);
  });
  it('строка модели в строке показа — только у модели не по умолчанию', () => {
    modelId.value = DEFAULT_MODEL;
    expect(modelBar.value).toBeNull();
    modelId.value = 'mt-short';
    const b = modelBar.value!;
    expect(b.text).toBe('Годы — по модели «Краткое пребывание»');
    expect(b.cmd).toBe('вернуть основную');
    expect(b.hint).toMatch(/Исход .* как в основной модели/);
    b.run();
    expect(modelId.value).toBe(DEFAULT_MODEL);
    expect(modelBar.value).toBeNull();
  });
});

describe('контракт 5: слой выключен', () => {
  it('«Скрыто: связи — вернуть»; «вернуть» включает все слои', () => {
    restoreLayers();
    expect(layersBar.value).toBeNull();
    layers.value = { ...layers.value, connectors: false };
    expect(layersBar.value!.text).toBe('Скрыто: связи');
    layers.value = { ...layers.value, labels: false };
    expect(layersBar.value!.text).toBe('Скрыто: связи, подписи');
    expect(layersBar.value!.short).toBe('Скрыто: 2 слоя');
    expect(barLines.value.map((l) => l.key)).toEqual(['layers']);
    layersBar.value!.run();
    expect(LAYER_KEYS.every((k) => layers.value[k])).toBe(true);
    expect(barLines.value).toEqual([]);
  });
});

// ---------- линейка и меридианы (решения 99, 102; П22) ----------

type Text = { t: string; x: number; y: number };
function recording() {
  const texts: Text[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y });
      if (k === 'canvas') return undefined;
      return () => ({ addColorStop: () => {} });
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}
let skyMod: typeof import('../src/render/sky.ts');
let frame: typeof import('../src/render/frame.ts');
let tiers: typeof import('../src/render/tiers.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
beforeAll(async () => {
  Object.assign(globalThis, { document: (globalThis as { document?: unknown }).document ?? { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  skyMod = await import('../src/render/sky.ts');
  frame = await import('../src/render/frame.ts');
  tiers = await import('../src/render/tiers.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
});
const ALL = Object.fromEntries(LAYER_KEYS.map((k) => [k, true]));
function drawAt(w: number, h: number, span: number, lambda = 1) {
  const rec = recording();
  const s = new skyMod.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
  s.resize(w, w < 600 ? 700 : 776, 1);
  s.setModel(atlas.models[0], lambda);
  s.fitAll();
  const t = years.toAstro(h);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + vw / 2) / kx, kx, laneTop: s.cam.laneTop });
  s.draw({
    model: atlas.models[0], lambda, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: ALL, onlyLines: false, meridian: null,
    tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
  } as Parameters<Sky['draw']>[0]);
  return { s, texts: rec.texts };
}

describe('П22: эра на линейке в каждом окне (решение 102; X2 § 2.6)', () => {
  it('1440 и 390, оба масштаба, окна от 20 до 1500 лет: у подписей лет есть эра', { timeout: 120_000 }, () => {
    const bad: string[] = [];
    let n = 0;
    for (const w of [1440, 390])
      for (const lambda of [1, 0])
        for (const span of [20, 60, 250, 1500])
          for (const h of [-3900, -2400, -1300, -700, -200, -10, 40]) {
            const { s, texts } = drawAt(w, h, span, lambda);
            const ruler = s.labelStats().boxes.filter((b) => b.kind === 'frame' && b.y + b.h <= frame.RULER_H).map((b) => b.text.replace(/ /g, ' '));
            n++;
            if (ruler.some((t) => /\d/.test(t)) && !ruler.some((t) => /Р\. Х\./.test(t))) bad.push(`${w} λ${lambda} ${span} у ${h}: ${ruler.slice(0, 4).join(' ')}`);
            void texts;
          }
    expect(bad, bad.slice(0, 5).join('; ')).toEqual([]);
    expect(n).toBeGreaterThanOrEqual(100);
  });
  it('«масштаб ├──┤ 20 лет»: слово слева от отрезка, название эпохи не ближе 24 px; имена эпох одного вида', () => {
    for (const [w, h, span] of [
      [1440, -1000, 200],
      [390, -10, 90],
      [390, -1000, 150],
      [1440, -2000, 1500],
    ] as const) {
      const { s } = drawAt(w, h, span);
      const row = s.labelStats().boxes.filter((b) => b.kind === 'frame' && b.y >= frame.RULER_H - 1 && b.y + b.h <= frame.FRAME_H + 1);
      const word = row.find((b) => b.text === 'масштаб');
      expect(word, `${w} ${h}`).toBeTruthy();
      const eps = atlas.models[0].epochs;
      const names = row.filter((b) => eps.some((e) => e.name === b.text || e.short === b.text));
      for (const b of names) if (b.x < word!.x) expect(word!.x - (b.x + b.w), `${b.text} у «масштаб»`).toBeGreaterThanOrEqual(20);
      const full = names.filter((b) => eps.some((e) => e.name === b.text));
      const short = names.filter((b) => eps.some((e) => e.short === b.text && e.name !== b.text));
      expect(full.length === 0 || short.length === 0, `${w} ${h}: ${names.map((b) => b.text).join(', ')}`).toBe(true);
      expect(row.some((b) => b.text.startsWith('модель'))).toBe(false);
    }
  });
  it('меридиан Рождества — «ок. 5 г. до Р. Х.», у Исхода в модели не по умолчанию — «во всех моделях»', () => {
    const marks = frame.eventMarks({ model: atlas.models[0] } as never);
    const nat = marks.find((m) => m.name === 'Рождество Христово')!;
    expect(nat.full.replace(/ /g, ' ')).toMatch(/^Рождество Христово, ок\. 5 г\. до Р\. Х\.$/);
    expect(marks.find((m) => m.name === 'Исход')!.full.replace(/ /g, ' ')).toBe('Исход, 1446 г. до Р. Х. (расч.)');
    const other = { ...atlas.models[0], id: 'mt-short' };
    expect(frame.eventMarks({ model: other } as never).find((m) => m.name === 'Исход')!.full).toMatch(/во всех моделях — 3 Цар 6:1/);
  });
  it('шкала «лет от сотворения»: Потоп — 1656 г. от сотворения; византийская эра: 1 г. по Р. Х. — 5509', () => {
    const v = { model: atlas.models[0] } as never;
    expect(frame.scaleValue(v, years.toAstro(-2518), 'am')).toBe(1656);
    expect(frame.scaleValue(v, years.toAstro(-4174), 'am')).toBe(0);
    expect(frame.scaleValue(v, 1, 'byz')).toBe(5509);
    expect(frame.scaleValue(v, years.toAstro(-1446), 'ad')).toBe(-1446);
  });
});

// ---------- ярусы (решения 100, 103, 110) ----------

describe('ярусы эпох: имена групп, синхронизмы, штриховка', () => {
  it('имена ярусов царей — те же, что у групп «Сквозного раздела» (решение 110)', async () => {
    const { KING_SETS } = await import('../src/ui/panels/Section.tsx');
    expect(tiers.TIER_NAMES.united).toBe(KING_SETS.united);
    expect(tiers.TIER_NAMES.judah).toBe(KING_SETS.judah);
    expect(tiers.TIER_NAMES.israel).toBe(KING_SETS.israel);
    const ts = tiers.buildTiers(atlas.models[0]);
    const ids = (k: string) => ts.find((t) => t.key === k)!.bars.map((b) => b.id);
    for (const id of ['saul', 'david', 'solomon']) expect(ids('united'), id).toContain(id);
    expect(ids('judah')).toContain('rovoam');
    expect(ids('judah')).not.toContain('david');
    expect(ids('israel')).toContain('ieroboam');
    expect(ids('israel')).not.toContain('saul');
  });
  it('П14: вертикаль синхронизма — только в отрезке своего царя (расхождение ≤ 1 года); остальное — штрих с подсказкой', () => {
    const m = atlas.models[0];
    const all = new Map(tiers.buildTiers(m).flatMap((t) => t.bars).map((b) => [b.key, b]));
    const syncs = tiers.buildSyncs(m);
    for (const s of syncs) {
      const f = all.get(s.from)!;
      if (s.inside) expect(s.t >= f.t0 - 1.01 && s.t <= f.t1 + 0.5, s.from).toBe(true);
      else expect(s.note!.replace(/[\u00a0\u2060]/g, (c) => (c === '\u00a0' ? ' ' : '')), s.from).toMatch(/^\d? ?[А-ЯЁ][а-яё]+ \d+:\d+: в \d+-й год .+ — \d+ г\. до Р\. Х\.; принятое начало — \d+ г\. до Р\. Х\., см\. § 24$/);
    }
    const ez = syncs.find((s) => s.from.startsWith('r:ezekiya:'))!;
    expect(ez.inside).toBe(false);
    expect(ez.note!.replace(/ /g, ' ')).toMatch(/^4 Цар 18:1: в 3-й год Осии — 730 г\. до Р\. Х\.; принятое начало — 715 г\. до Р\. Х\./);
  });
  it('штриховка говорит словами: «вместе с отцом», «вместе с сыном», «одновременно»', () => {
    expect(tiers.hatchWord('oziya', 'amasiya')).toBe('вместе с отцом');
    expect(tiers.hatchWord('amasiya', 'oziya')).toBe('вместе с сыном');
    expect(tiers.hatchWord('menaim', 'fakey')).toBe('одновременно');
    const oz = tiers.buildTiers(atlas.models[0]).find((t) => t.key === 'judah')!.bars.find((b) => b.id === 'oziya')!;
    expect(oz.sharedWith).toContain('amasiya');
  });
});

describe('панель «О хронологии» (решение 102)', () => {
  it('словарь дат, Рождество, цепочка, таблица моделей; без «ТЗ»', async () => {
    const { h } = await import('preact');
    const { renderToString: render } = await import('preact-render-to-string');
    const { ChronologyPanel } = await import('../src/ui/panels/Chronology.tsx');
    const out = render(h(ChronologyPanel, {})).replace(/<[^>]+>/g, ' ').replace(/[\u00a0\u202f]/g, ' ').replace(/\u2060/g, '').replace(/\s+/g, ' ');
    for (const s of ['Как читать годы', '1446 г. до Р. Х.', 'между 45 и 20 гг. до Р. Х.', 'ок. 30 г. до Р. Х.', 'не позже 1876 г. до Р. Х.', 'Почему Рождество Христово', 'Откуда годы', '4-й год Соломона', 'Хронологические напряжения'])
      expect(out, s).toContain(s);
    expect(out).not.toMatch(/\bТЗ\b/);
    expect(out).not.toMatch(/-\d{3,4}\b/);
  });
});

describe('ссылки «см. «О хронологии»» (решение 102)', () => {
  it('в тексте основания «О хронологии» — кнопка, открывающая панель', async () => {
    const { h } = await import('preact');
    const { renderToString } = await import('preact-render-to-string');
    const { ChronoText } = await import('../src/ui/panels/Chronology.tsx');
    const out = renderToString(h(ChronoText, { text: 'по реконструкции Тиле — Янга (см. «О хронологии»).' }));
    expect(out).toMatch(/<button[^>]*class="link chrono-link"[^>]*>«О хронологии»<\/button>/);
    expect(renderToString(h(ChronoText, { text: 'без ссылки' }))).not.toMatch(/button/);
  });
});

describe('сохранённые настройки читаются с проверкой схемы (решение 130)', () => {
  it('JSON null, чужая схема, испорченная строка — значения по умолчанию; понимание Лк 3 — своим ключом', async () => {
    const store = new Map<string, string>();
    const ls = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const prev = (globalThis as { localStorage?: unknown }).localStorage;
    Object.assign(globalThis, { localStorage: ls });
    try {
      store.set('toledot:model', 'null');
      store.set('toledot:lambda', '"по насыщенности"');
      store.set('toledot:ruler', '{"a":1}');
      store.set('toledot:layers', '[1,2]');
      store.set('toledot:theme', 'не json');
      store.set('toledot:luke', '"joseph"');
      const { vi } = await import('vitest');
      vi.resetModules();
      const st = await import('../src/state.ts');
      expect(st.modelId.value).toBe('mt-long');
      expect(st.lambda.value).toBe(1);
      expect(st.rulerScale.value).toBe('ad');
      expect(st.LAYER_KEYS.every((k) => st.layers.value[k] === true)).toBe(true);
      expect(['night', 'day']).toContain(st.theme.value);
      expect(st.lineFlip.value).toBe(true);
      st.lineFlip.value = false;
      expect(store.get('toledot:luke')).toBe('"mary"');
    } finally {
      Object.assign(globalThis, { localStorage: prev });
    }
  });
});

describe('«О карте»: первый слой, оглавление, текст Писания (решение 132)', () => {
  it('оглавление ведёт к разделам; «Текст Писания» — строкой с раскрытием, хеш целиком, без разбивки на разряды', async () => {
    const { h } = await import('preact');
    const { renderToString } = await import('preact-render-to-string');
    const { AboutPanel } = await import('../src/ui/panels/About.tsx');
    const { bibleText } = await import('../src/data/atlas.ts');
    const html = renderToString(h(AboutPanel, {}));
    for (const id of ['about-source', 'about-levels', 'about-chrono', 'about-luke', 'about-data', 'about-start']) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    if (bibleText) {
      expect(html).toContain(`<bdi class="v">${bibleText.sha256}</bdi>`);
      expect(html.replace(/<[^>]+>/g, ' ')).toMatch(/Текст Писания: /);
    }
  });
});
