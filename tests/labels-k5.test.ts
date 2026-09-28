/**
 * Небо, отрисовка — этап 7, K5 (docs/ui-review/README.md, «K. Повторная экспертиза»): подробность по двум осям
 * (решение 25; MAP-61), подписи (MAP-06, 56, 66; MOB-41, 53, 60; решения 29, 31), свёрнутое (решение 30; MAP-63, UX-60),
 * названия созвездий на масштабе эпохи (MAP-58, MAP-08), режим «набор» (MAP-64), холст по ширине области (MOB-44).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { contrast } from '../src/ui/contrast.ts';

const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const THEMES = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };
let tokens: Record<string, string> = THEMES.night;

type Text = { t: string; x: number; y: number; font: string; alpha: number; fill: string };
type Fill = { x: number; y: number; w: number; h: number; fill: string; alpha: number };
function recording() {
  const texts: Text[] = [];
  const fills: Fill[] = [];
  const st = { font: '', alpha: 1, fill: '' };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y, font: st.font, alpha: st.alpha, fill: st.fill });
      if (k === 'fillRect') return (x: number, y: number, w: number, h: number) => fills.push({ x, y, w, h, fill: st.fill, alpha: st.alpha });
      if (k === 'globalAlpha') return st.alpha;
      if (k === 'fillStyle') return st.fill;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'font') st.font = v as string;
      if (k === 'globalAlpha') st.alpha = v as number;
      if (k === 'fillStyle') st.fill = String(v);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, fills };
}

let sky: typeof import('../src/render/sky.ts');
let labels: typeof import('../src/render/labels.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: (n: string) => tokens[n] ?? '' }),
  });
  sky = await import('../src/render/sky.ts');
  labels = await import('../src/render/labels.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(o: { w?: number; h?: number; move?: (s: Sky) => void; state?: Record<string, unknown>; view?: import('../src/render/rows.ts').SkyView; dataset?: Record<string, string> } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {} as Record<string, string>, width: 0, height: 0, dataset: { ...(o.dataset ?? {}) } } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(atlas.models[0], 1);
  if (o.view) s.setView(o.view);
  s.fitAll();
  o.move?.(s);
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    ...(o.state ?? {}),
  } as Parameters<Sky['draw']>[0]);
  return { sky: s, ...rec, canvas };
}
/** Окно в `years` лет вокруг лица id; mult — пропорция полос (J1). */
const around = (id: string, span: number, mult = 1) => (s: Sky) => {
  s.cam.lanes = mult;
  const x = s.nodeX(id)!;
  const t = s.tOf(x);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: x - (vp.l + vw / 2) / kx, kx, laneTop: s.node(id)!.lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};
/** Окно в `span` лет вокруг года (исторического) и полосы. */
const window = (year: number, span: number, lane = 0) => (s: Sky) => {
  const t = years.toAstro(year);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + vw / 2) / kx, kx, laneTop: lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};

describe('подробность по двум осям (решение 25; MAP-61)', () => {
  it('следы и связи — по масштабу времени, звёзды — по любой из осей, облака — только когда мелки обе', () => {
    // узкие строки (×0,1: полоса 4 px) при масштабе поколения: время подробно, строки — нет
    const narrow = drawSky({ move: around('david', 60, 0.1) });
    const d = sky.detailOf(narrow.sky.cam);
    expect(narrow.sky.cam.ky).toBeLessThanOrEqual(sky.DETAIL_KY0);
    expect(d.time).toBe(1);
    expect(d.rows).toBe(0);
    expect(d.stars).toBe(1);
    expect((narrow.canvas as unknown as { dataset: Record<string, string> }).dataset.detail).toBe('1.00');
    // мелкие звёзды видны и ловят указатель
    const s = narrow.sky;
    let small = 0;
    for (let i = 0; i < s.nodes.length; i++) if ((atlas.byId.get(s.nodes[i].person)?.magnitude ?? 0) >= 4 && s.reachable(i)) small++;
    expect(small).toBeGreaterThan(20);
    // облаков нет: их растр рисуется drawImage — холст-запись его не знает, но подробность звёзд 1 значит альфу облаков 0
    // обзор: мелки обе оси
    const ov = drawSky();
    const o = sky.detailOf(ov.sky.cam);
    expect(o.time).toBe(0);
    expect(o.rows).toBe(0);
    // широкие строки на обзоре: строки подробны, время — нет; звёзды видны, следов нет
    const wide = sky.detailOf({ kx: ov.sky.cam.kx, ky: 20, kyWith: (kx: number, m: number) => ov.sky.cam.kyWith(kx, m) });
    expect(wide.time).toBe(0);
    expect(wide.rows).toBe(1);
    expect(wide.stars).toBe(1);
  });
  it('подробность по времени не зависит от пропорции полос: ×0,25, ×1 и ×3 при одном масштабе времени', () => {
    const a = sky.detailOf(drawSky({ move: around('david', 60, 0.25) }).sky.cam).time;
    const b = sky.detailOf(drawSky({ move: around('david', 60, 1) }).sky.cam).time;
    const c = sky.detailOf(drawSky({ move: around('david', 60, 3) }).sky.cam).time;
    expect(a).toBe(b);
    expect(c).toBe(b);
  });
});

describe('подписи (MAP-06, 56, 66; MOB-53)', () => {
  it('Иаков подписан на обзоре (MAP-06); Иисус Христос — на обзоре телефона (MOB-53)', () => {
    const ov = drawSky();
    expect(ov.sky.labelStats().boxes.some((b) => b.kind === 'star' && b.id === 'iakov')).toBe(true);
    const phone = drawSky({ w: 390, h: 700 });
    expect(phone.sky.labelStats().boxes.some((b) => b.kind === 'star' && b.id === 'iisus')).toBe(true);
    expect(phone.sky.labelStats().overlaps).toBe(0);
  });
  it('имя Иисуса Христа на обзоре телефона не закрывает звёзд ярче 4-й величины (гуща царей Иудеи) и не отнимает место у Давида (MOB-53; H5)', () => {
    const { sky: s } = drawSky({ w: 390, h: 700 });
    const boxes = s.labelStats().boxes.filter((b) => b.kind === 'star');
    const jb = boxes.find((b) => b.id === 'iisus')!;
    expect(jb).toBeTruthy();
    const covered: string[] = [];
    for (let i = 0; i < s.nodes.length; i++) {
      const n = s.nodes[i];
      if (n.ghost || n.person === 'iisus' || !s.reachable(i)) continue;
      const x = s.cam.sx(s.X0[i]);
      const y = s.cam.sy(n.lane);
      if (x >= jb.x && x <= jb.x + jb.w && y >= jb.y && y <= jb.y + jb.h && atlas.byId.get(n.person)!.magnitude < 4) covered.push(n.person);
    }
    expect(covered).toEqual([]);
    expect(boxes.some((b) => b.id === 'david')).toBe(true);
  });
  it('краткое уточнение одноимённых: не больше трёх слов, целой частью, с запятой у родства, без — у прозвища и «из …» (решения 29, 43)', () => {
    expect(labels.shortNote('сын Иоседека, великий иерей')).toBe(', сын Иоседека');
    expect(labels.shortNote('Магдалина')).toBe(' Магдалина');
    expect(labels.shortNote('из Аримафеи')).toBe(' из Аримафеи');
    expect(labels.shortNote('апостол, сын Зеведеев')).toBe(', сын Зеведеев');
    expect(labels.shortNote('апостол, Иаковлев (Фаддей)')).toBe(' Иаковлев');
    expect(labels.shortNote('Искариот, предавший Иисуса')).toBe(' Искариот');
    expect(labels.shortNote('сын Иосифа (Лк 3:30)')).toBe(', сын Иосифа');
    // решение 43: часть длиннее трёх слов не обрезается («мать Иакова» из «мать Иакова меньшего и Иосии» — обрывок);
    // без лица (нет главы первого упоминания) уточнения нет, а оборот с предлогом в три слова — целиком
    expect(labels.shortNote('мать Иакова меньшего и Иосии')).toBe(null);
    expect(labels.shortNote('с горы Ефремовой')).toBe(' с горы Ефремовой');
    for (const p of atlas.byId.values()) {
      const n = p.disambig ? labels.shortNote(p.disambig, p.id) : null;
      if (!n) continue;
      // «, сын Навата», « Магдалина», « (Азария)», « (Мф 2)»: не больше трёх слов, без обрывков
      expect(n.replace(/^,? /, '').split(/\s+/).length, p.id).toBeLessThanOrEqual(3);
      expect(n, p.id).not.toMatch(/\s(и|в|из|от|с|на)$/);
    }
  });
  it('одноимённые в одном окне различимы: «Мария Магдалина», «Иаков, сын Зеведеев» (MAP-66); одиночные — без уточнения', () => {
    const { sky: s, texts } = drawSky({ move: window(30, 120) });
    const names = s.labelStats().boxes.filter((b) => b.kind === 'star');
    const byName = new Map<string, number>();
    for (const b of names) byName.set(b.text, (byName.get(b.text) ?? 0) + 1);
    const dup = [...byName].filter(([, k]) => k >= 2).map(([n]) => n);
    expect(dup.length).toBeGreaterThan(0);
    const notes = texts.filter((q) => /^(, | )/.test(q.t) && q.font.includes('italic'));
    // у каждой подписи дублирующегося имени рядом — уточнение (или места для него не было — тогда имя одно в строке)
    let noted = 0;
    for (const b of names.filter((q) => dup.includes(q.text))) {
      if (notes.some((n) => n.x >= b.x && n.x <= b.x + b.w && Math.abs(n.y - (b.y + b.h - 4)) < 6)) noted++;
    }
    expect(noted / names.filter((q) => dup.includes(q.text)).length).toBeGreaterThanOrEqual(0.6);
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('подпись справа гасит под собой свой след полосой цвета фона — между звездой и именем нет «дефиса» (MAP-56)', () => {
    const { sky: s, fills } = drawSky({ move: around('moisey', 90) });
    const b = s.labelStats().boxes.find((q) => q.kind === 'star' && q.id === 'moisey')!;
    expect(b).toBeTruthy();
    const i = s.indexOf('moisey')!;
    const x = s.cam.sx(s.X0[i]);
    const y = Math.round(s.cam.sy(s.nodes[i].lane)) + 0.5;
    if (b.x > x) {
      // заливка фона — от края звезды до конца подписи, поперёк следа
      const k = fills.find((f) => f.x > x && f.x < x + 12 && f.y <= y - 1 && f.y + f.h >= y + 1 && f.x + f.w >= b.x + b.w - 2);
      expect(k, 'полоса под подписью Моисея').toBeTruthy();
    }
  });
  it('лица «время не установлено» — курсивом; умерший младенцем — «†» перед именем кеглем подписи (MAP-52, MAP-68)', () => {
    const nt = drawSky({ move: window(40, 120) });
    const luka = nt.texts.find((q) => q.t === 'Лука');
    expect(luka?.font).toMatch(/^italic /);
    const fam = drawSky({ move: window(-1005, 40, 4) });
    const inf = fam.sky.labelStats().boxes.find((b) => b.id === 'mladenets-syn-virsavii');
    expect(inf).toBeTruthy();
    const dag = fam.texts.find((q) => q.t.startsWith('†') && q.x >= inf!.x && q.x <= inf!.x + 4);
    expect(dag).toBeTruthy();
    const name = fam.texts.find((q) => q.t === 'Сын Давида и Вирсавии')!;
    // кегль «†» — кегль имени
    expect(dag!.font).toBe(name.font);
  });
});

describe('погашенные подписи — не ниже 4,5 : 1 к самому светлому фону (решение 31; MOB-41)', () => {
  for (const [name, t] of Object.entries(THEMES))
    it(`тема ${name}: --ink, --ink-2 и --ink-3 при погашении — ≥ 4,5 : 1 к небу, полосе эпохи и облаку на них`, () => {
      const cloud = name === 'night' ? sky.CLOUD_DIMMED.night : sky.CLOUD_DIMMED.day;
      for (const ink of ['--ink', '--ink-2', '--ink-3']) {
        const a = sky.dimLabelAlpha(t[ink], t['--sky'], t['--sky-band'], cloud);
        for (const g of sky.labelGrounds(t[ink], t['--sky'], t['--sky-band'], cloud)) expect(contrast(sky.over(t[ink], g, Math.max(sky.DIM, a)), g), `${ink} на ${g}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  it('при выбранном Давиде погашенные подписи не прозрачнее порога и без полужирного; выделенные — в полную силу', () => {
    for (const [name, t] of Object.entries(THEMES)) {
      tokens = t;
      const hl = new Map<string, 'self' | 'anc' | 'desc'>([['david', 'self'], ['iessey', 'anc'], ['solomon', 'desc']]);
      const { texts, sky: s } = drawSky({ move: around('david', 60), state: { selected: 'david', highlight: hl } });
      const stars = new Map(s.labelStats().boxes.filter((b) => b.kind === 'star').map((b) => [b.text, b.id!]));
      const floor = Math.min(s.pal.dimInk, s.pal.dimInk2);
      let dim = 0;
      for (const q of texts) {
        const id = stars.get(q.t);
        if (!id || !q.font) continue;
        if (hl.has(id as 'david')) {
          expect(q.alpha, `${name}: ${q.t}`).toBe(1);
          continue;
        }
        if (q.alpha < 1) {
          dim++;
          expect(q.alpha, `${name}: ${q.t}`).toBeGreaterThanOrEqual(floor - 1e-9);
          expect(q.font, `${name}: ${q.t}`).toMatch(/^(italic )?400 /);
        }
      }
      expect(dim, name).toBeGreaterThan(5);
    }
    tokens = THEMES.night;
  });
});

describe('свёрнутое видно всегда (решение 30; MAP-63, UX-51, UX-60)', () => {
  it('свёрнутое созвездие — знак у левого края в окне его лет, даже если его строка выше или ниже окна; строка в рамке', () => {
    const { sky: s, texts } = drawSky({ view: { mode: 'all', set: new Set(), foldDesc: [], foldGroups: ['judah'] }, move: window(-1000, 700) });
    const mark = s.plan.marks.find((m) => m.kind === 'group' && m.id === 'judah')!;
    expect(mark).toBeTruthy();
    const hit = s.foldHits.find((h) => h.kind === 'group' && h.id === 'judah' && h.y > sky.FRAME_H);
    expect(hit, 'знак «КОЛЕНО ИУДИНО +N» на небе').toBeTruthy();
    expect(hit!.x).toBeLessThan(s.letterW + 40);
    expect(texts.some((q) => q.t === `колено Иудино (${mark.count})`)).toBe(true);
    expect(texts.some((q) => q.t === 'развернуть')).toBe(true);
    // пустой контур свёрнутого созвездия не рисуется: названия «КОЛЕНО ИУДИНО» среди названий созвездий нет
    expect(s.labelStats().boxes.some((b) => b.kind === 'group' && b.text === 'КОЛЕНО ИУДИНО')).toBe(false);
  });
});

describe('названия созвездий на масштабе эпохи (MAP-58, MAP-08)', () => {
  it('в окне 700 лет у крупных видимых областей есть названия, одно и то же — не ближе 1 200 px; наложений нет', () => {
    const { sky: s } = drawSky({ move: window(-1000, 700) });
    const g = s.labelStats().boxes.filter((b) => b.kind === 'group');
    expect(g.length).toBeGreaterThanOrEqual(4);
    for (const a of g) for (const b of g) if (a !== b && a.text === b.text) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(labels.GROUP_REPEAT_PX - 1);
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('название на средней линии гасит под собой линии: следы и стволы скоб его не перечёркивают (MAP-08)', () => {
    const { sky: s, fills } = drawSky({ move: window(-1000, 700) });
    const g = s.labelStats().boxes.filter((b) => b.kind === 'group');
    // у каждого названия либо место без линий (слот раскладки), либо заливка фона ровно под ним
    let knocked = 0;
    for (const b of g) if (fills.some((f) => Math.abs(f.x - b.x) < 0.5 && Math.abs(f.y - b.y) < 0.5 && Math.abs(f.w - b.w) < 0.5)) knocked++;
    expect(knocked).toBeGreaterThan(0);
  });
});

describe('рабочий набор на небе (IX-51; MAP-64)', () => {
  it('в режиме «все лица» у членов набора — уголок 5 × 5 px тоном --ink (не черта: черта — царь; IX-77), только при высоте строки от 8 px', () => {
    const set = new Set(['david', 'iessey', 'solomon']);
    const near = drawSky({ move: around('david', 120), state: { workMarks: set } });
    const ink = near.sky.pal.ink;
    // уголок «┐»: верхняя полоса 5 × 1,25 и правая 1,25 × 5 с общим правым верхним углом
    const tops = near.fills.filter((f) => f.w === 5 && f.h === 1.25 && f.fill === ink);
    const sides = near.fills.filter((f) => f.w === 1.25 && f.h === 5 && f.fill === ink);
    const corners = tops.filter((t) => sides.some((s) => Math.abs(s.x + s.w - (t.x + t.w)) < 0.01 && Math.abs(s.y - t.y) < 0.01));
    expect(near.sky.cam.ky).toBeGreaterThanOrEqual(8);
    expect(corners.length).toBeGreaterThanOrEqual(2);
    // черты 6 × 1,5 (прежней метки, похожей на черту царя) больше нет
    expect(near.fills.filter((f) => f.w === 6 && f.h === 1.5).length).toBe(0);
    const far = drawSky({ state: { workMarks: set } });
    expect(far.sky.cam.ky).toBeLessThan(8);
    expect(far.fills.filter((f) => f.w === 5 && f.h === 1.25).length).toBe(0);
  });
  it('в режиме «набор» выделение рода гасит лица набора не ниже 70 %', () => {
    const set = new Set(['david', 'iessey', 'ovid', 'vooz', 'ruf', 'solomon', 'avessalom', 'amnon']);
    const hl = new Map<string, 'self'>([['ruf', 'self']]);
    const { texts, sky: s } = drawSky({ view: { mode: 'work', set, foldDesc: [], foldGroups: [] }, state: { selected: 'ruf', highlight: hl } });
    s.fitAll();
    const names = texts.filter((q) => ['Давид', 'Соломон', 'Авессалом', 'Амнон'].includes(q.t) && q.font);
    expect(names.length).toBeGreaterThan(0);
    for (const q of names) expect(q.alpha, q.t).toBeGreaterThanOrEqual(0.7);
  });
});

describe('имя и формула выбранного лица под ярусами — в общей проверке наложений (MOB-60)', () => {
  it('место формулы из прошлого кадра ярусов занято до подписей: подписи на него не ложатся', () => {
    const rect = { x: 400, y: 200, w: 260, h: 18 };
    const tiers = JSON.stringify({ formula: { text: ['Давид родился после рождения Иессея'], rect } });
    const { sky: s } = drawSky({ move: around('david', 60), state: { selected: 'david' }, dataset: { tiers } });
    // без ярусов (under не передан) место не занимается
    const st = s.labelStats();
    expect(st.boxes.some((b) => b.kind === 'note' && b.x === rect.x)).toBe(false);
    // с ярусами — занимается первым, и подписи его обходят
    const rec = recording();
    const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: { tiers } } as unknown as HTMLCanvasElement;
    const s2 = new sky.Sky(canvas);
    s2.resize(1440, 776, 1);
    s2.setModel(atlas.models[0], 1);
    s2.fitAll();
    around('david', 60)(s2);
    s2.draw({
      model: atlas.models[0], lambda: 1, selected: 'david', second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<Sky['draw']>[0], () => {});
    const st2 = s2.labelStats();
    const f = st2.boxes.find((b) => b.kind === 'note' && b.x === rect.x && b.y === rect.y);
    expect(f).toBeTruthy();
    expect(st2.overlaps).toBe(0);
  });
});

describe('холст неба следует за шириной области (MOB-44)', () => {
  it('CSS-размер холста — вся область, а не px: сужение окна не держит область прежней ширины', () => {
    const { canvas } = drawSky({ w: 844, h: 390 });
    const style = (canvas as unknown as { style: Record<string, string> }).style;
    expect(style.width).toBe('100%');
    expect(style.height).toBe('100%');
    expect(canvas.width).toBe(844);
  });
});
