/**
 * Этап 18, решение 193 (консилиум 4 октября; владелец: «жёны и наложницы… недостаточно проработаны, связи не понятны»;
 * «если я отключаю следы жизни, вообще не понятно, откуда появляются жёны и наложницы и всё древо»; «от кружочка самого
 * персонажа — сразу несколько линий по союзам, разноцветных»; «у каждой линии по каждой жене или наложнице свой цвет»):
 *  — вид союза на небе: черта брака наложницы — одинарная, ромб — с полой половиной жены (links.ts, unionKinds);
 *  — следы выключены — у лица связка от звезды до последнего узла его союзов (trails.ts, trailStubs);
 *  — у выбранного лица каждый союз — своим цветом, без повторов (unionColors), и тот же цвет у дорожки веера, пути жены,
 *    черты брака и ромба;
 *  — веер союзов: от звезды выбранного по дорожке на союз (drawUnionFan; проба canvas[data-union-fan]).
 */
import { beforeAll, describe, expect, it } from 'vitest';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;
let trails: typeof import('../src/render/trails.ts');
let marks: typeof import('../src/render/marks.ts');

beforeAll(async () => {
  C = await import('../tools/census.ts');
  trails = await import('../src/render/trails.ts');
  marks = await import('../src/render/marks.ts');
}, 60_000);

type Frame = ReturnType<CensusMod['captureView']>;
const memo = new Map<string, Frame>();
const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
const shot = (id: string, select: string | null, trailsOn = true): Frame => {
  const k = `${id}|${select}|${trailsOn}`;
  return memo.get(k) ?? memo.set(k, C.captureView('all', { person: id }, { select, extra: trailsOn ? {} : { layers: { ...LAYERS, lifelines: false } } })).get(k)!;
};
const ds = (f: Frame) => (f.s.canvas as unknown as { dataset: Record<string, string | undefined> }).dataset;
/** Проход кадра для функций неба: тот же, что строит Sky.draw (выбор, выделение, связи кадра). */
const passOf = (f: Frame, select: string | null) => {
  const h = select ? marks.familyHighlight(select) : null;
  return { s: { selected: select, highlight: h?.hl ?? null, depth: h?.depth ?? null, intro: 1, layers: LAYERS, onlyLines: false }, links: f.d, emph: () => 1, placer: {}, zoomScale: 1 } as unknown as Parameters<typeof trails.unionColors>[1];
};

describe('вид союза на небе (решение 193)', () => {
  it('Иаков: черта брака к наложнице Валле — одинарная, к жене Рахили — двойная; ромб Валлы — с полой половиной жены', () => {
    const f = shot('iakov', 'iakov');
    const bars = f.d.frame.paths.filter((q) => q.kind === 'bar');
    const valla = bars.find((q) => q.union === 'u:iakov+valla');
    const rakhil = bars.find((q) => q.union === 'u:iakov+rakhil');
    expect(valla?.bar).toBe('concubine');
    expect(trails.barOffsets(valla!)).toHaveLength(1);
    expect(rakhil?.bar).toBe('wife');
    expect(trails.barOffsets(rakhil!)).toHaveLength(2);
    const node = f.d.frame.nodes.find((n) => n.kind === 'union' && n.union === 'u:iakov+valla');
    expect(node?.look).toBe('concubine');
    expect(f.d.frame.nodes.find((n) => n.kind === 'union' && n.union === 'u:iakov+liya')?.look).toBe('wife');
  });
  it('у каждой черты брака кадра записан вид союза', () => {
    const f = shot('david', 'david');
    const bars = f.d.frame.paths.filter((q) => q.kind === 'bar' && q.union);
    expect(bars.length).toBeGreaterThan(3);
    for (const q of bars) expect(q.bar, q.ks).toBeTruthy();
  });
});

describe('следы выключены — связка от звезды до союзов (решение 193)', () => {
  it('Иаков: связка доходит до последнего узла его союзов', () => {
    const f = shot('iakov', 'iakov', false);
    const stubs = trails.trailStubs(f.s, f.d);
    const i = f.s.indexOf('iakov')!;
    expect(stubs.has(i)).toBe(true);
    const xs = f.d.frame.nodes.filter((n) => n.kind === 'union' && n.owner === 'iakov').map((n) => n.x + f.d.dx);
    expect(xs.length).toBeGreaterThan(0);
    expect(stubs.get(i)!).toBeGreaterThanOrEqual(Math.max(...xs) - 0.5);
    // связка — не след жизни: короче следа до смерти
    const star = f.stars.find((q) => q.id === 'iakov')!;
    expect(stubs.get(i)!).toBeLessThan((star.x1 ?? Infinity) + f.d.dx);
  });
});

describe('цвет союза у выбранного (решение 193)', () => {
  for (const id of ['avraam', 'iakov', 'david'])
    it(`${id}: у каждого союза свой цвет, без повторов`, () => {
      const f = shot(id, id);
      const p = passOf(f, id);
      const c = trails.unionColors(marks.branchFrame(f.s, p), p);
      const own = [...c.keys()].filter((u) => u.includes(`u:${id}+`) || u.includes(`+${id}`));
      expect(own.length).toBeGreaterThanOrEqual(id === 'david' ? 8 : 3);
      const colors = own.map((u) => c.get(u)!.color);
      expect(new Set(colors).size, colors.join(' ')).toBe(colors.length);
    });
});

describe('веер союзов от звезды выбранного (решение 193)', () => {
  it('Иаков: четыре дорожки — Лия, Рахиль, Валла, Зелфа; у лица без выбора веера нет', () => {
    const fan = (ds(shot('iakov', 'iakov')).unionFan ?? '').split(' ').filter(Boolean).map((q) => q.split(':').slice(0, 2).join(':'));
    for (const u of ['u:iakov+liya', 'u:iakov+rakhil', 'u:iakov+valla', 'u:iakov+zelfa']) expect(fan, u).toContain(u);
    expect(ds(shot('iakov', null)).unionFan).toBeUndefined();
  });
  it('Иаков: дорожки начинаются у его звезды и не совпадают друг с другом', () => {
    const f = shot('iakov', 'iakov');
    const hits = trails.unionFanHits(f.s);
    expect(hits.length).toBeGreaterThanOrEqual(4);
    const star = f.stars.find((q) => q.id === 'iakov')!;
    for (const h of hits) expect(Math.hypot(h.pts[0] - star.x, h.pts[1] - star.y), h.union).toBeLessThan(star.r + 8);
    // на середине пути дорожки разведены: разные высоты
    const ys = hits.map((h) => h.pts[3]);
    expect(new Set(ys.map((y) => Math.round(y * 2))).size).toBe(ys.length);
  });
});
