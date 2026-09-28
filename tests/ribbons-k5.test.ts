/**
 * Ленты — этап 7, K5: светлота лент разведена не меньше чем в 1,5 раза (решение 32; MOB-61), тугая коса не шире 3 px
 * и не зависит от высоты строки (MAP-60, MAP-62), без швов (MAP-57), ориентир режима «набор» без петель (MAP-64),
 * подписи лент (UX-45), все лица линий подписаны (MAP-59), женщины Мф 1 (решение 28; UX-46).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { contrast } from '../src/ui/contrast.ts';
import { buildRibbons, BRAID_PX, runSpans } from '../src/engine/ribbons.ts';

const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const THEMES = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };

type Call = [string, ...unknown[]];
function recording() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (typeof k === 'string' && ['moveTo', 'lineTo', 'stroke'].includes(k)) return (...a: unknown[]) => calls.push([k, ...a]);
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'lineCap' || k === 'lineWidth') calls.push([`set ${String(k)}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

let ribbons: typeof import('../src/render/ribbons.ts');
let sky: typeof import('../src/render/sky.ts');
let atlas: typeof import('../src/data/atlas.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: (n: string) => THEMES.night[n] ?? '' }) });
  ribbons = await import('../src/render/ribbons.ts');
  sky = await import('../src/render/sky.ts');
  atlas = await import('../src/data/atlas.ts');
});

const hex = (c: string) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
const mix = (a: string, b: string, t: number) => `#${hex(a).map((x, k) => Math.round(x + (hex(b)[k] - x) * t).toString(16).padStart(2, '0')).join('')}`;

describe('светлота лент (решение 32; MOB-61)', () => {
  for (const [name, t] of Object.entries(THEMES))
    it(`тема ${name}: по всей длине лент отношение светлот не меньше 1,5; к небу — не меньше 3 : 1; оттенки — те же`, () => {
      const [g1, g2, a1, a2] = ribbons.separateRibbons([t['--gold-1'], t['--gold-2']], [t['--azure-1'], t['--azure-2']], t['--sky'], name === 'night');
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        expect(contrast(mix(g1, g2, u), mix(a1, a2, u)), `${name} t=${u}`).toBeGreaterThanOrEqual(1.5);
      }
      for (const c of [g1, g2, a1, a2]) expect(contrast(c, t['--sky']), c).toBeGreaterThanOrEqual(3);
      // золото остаётся золотом (красный канал больше синего), лазурь — лазурью (синий больше красного)
      for (const c of [g1, g2]) expect(hex(c)[0]).toBeGreaterThan(hex(c)[2]);
      for (const c of [a1, a2]) expect(hex(c)[2]).toBeGreaterThan(hex(c)[0]);
    });
});

describe('коса (MAP-57, 60, 62)', () => {
  // две линии с общим участком a–b–c–d, расхождением e/f и схождением в g
  const J = ['a', 'b', 'c', 'd', 'e', 'g'];
  const M = ['a', 'b', 'c', 'd', 'f', 'g'];
  const pos = (ky: number) =>
    new Map<string, { x: number; y: number }>([
      ['a', { x: 0, y: 0 }], ['b', { x: 120, y: 0 }], ['c', { x: 240, y: ky }], ['d', { x: 360, y: 0 }],
      ['e', { x: 480, y: -2 * ky }], ['f', { x: 490, y: 2 * ky }], ['g', { x: 600, y: 0 }],
    ]);
  const build = (ky: number) => buildRibbons({ joseph: J.map((id) => ({ id, weak: false })), mary: M.map((id) => ({ id, weak: false })), project: (id) => pos(ky).get(id) ?? null, amplitude: BRAID_PX, meander: BRAID_PX * 0.5 });
  it('на общем участке нити расходятся не больше чем на 2 × 3 px при любой высоте строки; на раздельном — до своих строк', () => {
    for (const ky of [6, 14, 40]) {
      const [m, j] = build(ky);
      const shared = (st: typeof j) => st.points.filter((q) => q.u >= 0.2 && q.u <= 2.8);
      for (const q of shared(j)) {
        const r = shared(m).reduce((a, b) => (Math.abs(b.x - q.x) < Math.abs(a.x - q.x) ? b : a));
        if (Math.abs(r.x - q.x) > 3) continue;
        expect(Math.abs(q.y - r.y), `ky ${ky}`).toBeLessThanOrEqual(2 * BRAID_PX + 1.5);
      }
      // у e и f — нити на своих лицах: расхождение — строки, а не волна косы
      const e = j.points.find((q) => Math.abs(q.u - 4) < 0.05)!;
      const f = m.points.find((q) => Math.abs(q.u - 4) < 0.05)!;
      expect(Math.abs(e.y - f.y)).toBeGreaterThanOrEqual(4 * ky - 2);
    }
  });
  it('тугая коса плетётся (MAP-75; решение 40): участки «поверх» Марии перерисованы с плоскими концами — нижняя нить в перекрестье рвётся', () => {
    const r = recording();
    const strands = build(14);
    ribbons.drawStrands(r.ctx, strands, 2.4, ribbons.ribbonLook({ glow: true, sky: '#0d1b34', halo: '#0d1b34', gold1: '#e6b550', gold2: '#c9773a', azure1: '#9ccbf5', azure2: '#9edbd0', ribbonGlow: [0.06, 0.1], ribbonTone: 0 } as never), 800, null, { braid: BRAID_PX });
    // по одной подложке и одной нити на каждую нить (две нити) и ещё подложка и нить на каждый участок «поверх» Марии
    const strokes = r.calls.filter((c) => c[0] === 'stroke').length;
    const glow = 4;
    const mary = strands.find((q) => q.line === 'mary')!;
    expect(mary.over.length).toBeGreaterThan(0);
    expect(strokes - glow).toBe(4 + 2 * mary.over.length);
    // у участков «поверх» — плоские концы: круглый конец подложки прорезал бы свою нить «швом» (MAP-57)
    expect(r.calls.filter((c) => c[0] === 'set lineCap').some((c) => c[1] === 'butt')).toBe(true);
    // с широкой косой (braid > 3) — плетение есть: участки «поверх» с плоскими концами
    const r2 = recording();
    const loose = buildRibbons({ joseph: J.map((id) => ({ id, weak: false })), mary: M.map((id) => ({ id, weak: false })), project: (id) => pos(14).get(id) ?? null, amplitude: 8, meander: 2 });
    ribbons.drawStrands(r2.ctx, loose, 2.4, ribbons.ribbonLook({ glow: true, sky: '#0d1b34', halo: '#0d1b34', gold1: '#e6b550', gold2: '#c9773a', azure1: '#9ccbf5', azure2: '#9edbd0', ribbonGlow: [0.06, 0.1], ribbonTone: 0 } as never), 800, null, { braid: 8 });
    const caps = r2.calls.filter((c) => c[0] === 'set lineCap');
    expect(caps.some((c) => c[1] === 'butt')).toBe(true);
    expect(loose[0].over.length).toBeGreaterThan(0);
  });
  it('участки и точки сравнения прежние: Каинан, Давид, Салафиил, Иисус', () => {
    const spans = runSpans(atlas.lines.joseph.persons.map((x) => x.id), atlas.lines.mary.persons.map((x) => x.id));
    expect(spans.filter((q) => q.kind === 'split').length).toBeGreaterThanOrEqual(3);
  });
});

describe('женщины Мф 1 (решение 28; UX-46)', () => {
  it('«от Фамари», «от Рахавы», «от Руфи» — имена; «от бывшей за Уриею» — нет', () => {
    const verse = 'Салмон родил Вооза от Рахавы; Вооз родил Овида от Руфи; Овид родил Иессея;';
    expect(ribbons.namedAfterOt(verse, ['Раав', 'Рахава', 'Раава'])).toBe(true);
    expect(ribbons.namedAfterOt(verse, ['Руфь'])).toBe(true);
    expect(ribbons.namedAfterOt(verse, ['Сарра', 'Сара'])).toBe(false);
    expect(ribbons.namedAfterOt('Давид царь родил Соломона от бывшей за Уриею;', ['Вирсавия'])).toBe(false);
  });
  it('в режиме «только линии» у Фареса, Вооза и Овида — знаки Фамари, Раав и Руфи со стихом', async () => {
    const s = linesSky();
    await ribbons.loadMt1();
    const m = ribbons.mt1Mothers(s)!;
    expect(m).toBeTruthy();
    expect([...m].map(([son, w]) => `${son}:${w.mother}:${w.ref}`).sort()).toEqual(['fares:famar:Мф 1:3', 'ovid:ruf:Мф 1:5', 'vooz:raav:Мф 1:5']);
  });
});

function linesSky(w = 1440, h = 776, move?: (s: Sky) => void) {
  const rec = recording();
  const s = new sky.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
  s.resize(w, h, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  let x0 = Infinity;
  let x1 = -Infinity;
  let l0 = Infinity;
  let l1 = -Infinity;
  s.nodes.forEach((n, i) => {
    if (!n.spine) return;
    x0 = Math.min(x0, s.X0[i]);
    x1 = Math.max(x1, s.X0[i]);
    l0 = Math.min(l0, n.lane);
    l1 = Math.max(l1, n.lane);
  });
  s.cam.focusLanes = Math.max(27, l1 - l0 + 1);
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l - 24 - 126) / (x1 - x0);
  const [, cy] = s.cam.vpCenter();
  s.cam.set(s.cam.constrain({ x0: x0 - (vp.l + 24) / kx, kx, laneTop: (l0 + l1) / 2 + cy / s.cam.kyFor(kx) }));
  move?.(s);
  const draw = () =>
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null,
      layers: { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true },
      onlyLines: true, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<Sky['draw']>[0]);
  draw();
  return Object.assign(s, { redraw: draw });
}

describe('«только линии»: подписи лент и лиц (UX-45, MAP-59)', () => {
  it('окно 400 лет от Давида: подписаны все лица линий (именем или номером у бусины), подписи лент — у начала ветвей', async () => {
    await ribbons.loadMt1();
    const s = linesSky(1440, 776, (q) => {
      const xd = q.nodeX('david')!;
      const kx = (q.cam.vp.r - q.cam.vp.l) / (q.xOf(q.tOf(xd) + 400) - xd);
      const [, cy] = q.cam.vpCenter();
      q.cam.set({ x0: xd - (q.cam.vp.l + 60) / kx, kx, laneTop: q.node('david')!.lane + cy / q.cam.kyFor(kx) });
    });
    s.redraw();
    const st = s.labelStats();
    expect(st.overlaps).toBe(0);
    const [named, stars] = ((s.canvas as unknown as { dataset: Record<string, string> }).dataset.named ?? '0/0').split('/').map(Number);
    expect(stars).toBeGreaterThan(15);
    expect(named).toBe(stars);
    const notes = st.boxes.map((b) => b.text.replace(/ /g, ' '));
    expect(notes).toContain('через Соломона (Мф 1)');
    expect(notes).toContain('через Нафана (Лк 3)');
  });
  it('всё небо линий: подписей лиц (имён и номеров) — не меньше 60 из 104; наложений нет', async () => {
    await ribbons.loadMt1();
    const s = linesSky();
    s.redraw();
    const [named] = ((s.canvas as unknown as { dataset: Record<string, string> }).dataset.named ?? '0/0').split('/').map(Number);
    expect(named).toBeGreaterThanOrEqual(60);
    expect(s.labelStats().overlaps).toBe(0);
  });
  it('окно 900 лет от Фареса до Давида: у Фареса, Вооза и Овида — «Фамарь…», «Раав…», «Руфь — мать Овида (Мф 1:5)»', async () => {
    await ribbons.loadMt1();
    const s = linesSky(1440, 776, (q) => {
      const xa = q.nodeX('fares')!;
      const kx = (q.cam.vp.r - q.cam.vp.l) / (q.xOf(q.tOf(xa) + 900) - xa);
      const [, cy] = q.cam.vpCenter();
      q.cam.set({ x0: xa - (q.cam.vp.l + 60) / kx, kx, laneTop: q.node('fares')!.lane + cy / q.cam.kyFor(kx) });
    });
    s.redraw();
    const texts = s.labelStats().boxes.map((b) => b.text.replace(/\u00a0/g, ' '));
    expect(texts).toContain('Фамарь — мать Фареса (Мф 1:3)');
    expect(texts).toContain('Раав — мать Вооза (Мф 1:5)');
    expect(texts).toContain('Руфь — мать Овида (Мф 1:5)');
    expect(s.labelStats().overlaps).toBe(0);
    // знак матери — ссылка на её карточку
    expect(ribbons.lineNoteHits(s).some((h) => h.kind === 'person' && h.id === 'ruf')).toBe(true);
  });
  it('обычный режим: подписи лент у развилки Давида стоят и без «только линии» (UX-45)', () => {
    const rec = recording();
    const s = new sky.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
    s.resize(1440, 776, 1);
    s.setModel(atlas.models[0], 1);
    s.fitAll();
    const x = s.nodeX('david')!;
    const t = s.tOf(x);
    const vp = s.cam.vp;
    const kx = (vp.r - vp.l) / (s.xOf(t + 60) - s.xOf(t - 60));
    s.cam.set({ x0: x - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
    s.draw({
      model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null,
      layers: { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true },
      onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    } as Parameters<Sky['draw']>[0]);
    const texts = s.labelStats().boxes.map((b) => b.text.replace(/ /g, ' '));
    expect(texts.filter((q) => q.startsWith('через ')).length).toBeGreaterThanOrEqual(1);
  });
});
