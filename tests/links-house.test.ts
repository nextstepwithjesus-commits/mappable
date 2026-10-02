/**
 * «Отчий дом» на небе (этап 15, решения 174–177, 179, 181; STAGE15.md; src/render/links.ts, plates.ts, marks.ts, frame.ts)
 * на настоящих данных корпуса — окна конкурса (tools/census.ts, HOUSE_SCENES): семья Иакова и Давида на масштабе семьи,
 * Иуда и Фамарь на обзоре.
 *  — 174: ромб союза — на следе жены у подножия черты брака от мужа; вид союза — начертанием черты (LinkPath.bar); мать
 *    не названа — ромб с полой половиной жены на следе отца;
 *  — 175: дети — отводом от следа матери; дети ближе 40 px — на одном стволе, следующее гнездо — «•»;
 *  — 176: связь целиком — обрывков нет, указатель шатра у кромки называет союз и концы;
 *  — 177: шаг ленты уходит со следа отца у черты брака матери ребёнка (Давид → Соломон и Нафан — у черты Вирсавии);
 *  — 179: путь происхождения при наведении: след отца → черта → ромб → след матери → отвод.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;
let links: typeof import('../src/render/links.ts');
let marks: typeof import('../src/render/marks.ts');
let frame: typeof import('../src/render/frame.ts');
let plates: typeof import('../src/render/plates.ts');
let stays: typeof import('../src/engine/stays.ts');
let reveal: typeof import('../src/ui/reveal.ts');

beforeAll(async () => {
  C = await import('../tools/census.ts');
  links = await import('../src/render/links.ts');
  marks = await import('../src/render/marks.ts');
  frame = await import('../src/render/frame.ts');
  plates = await import('../src/render/plates.ts');
  stays = await import('../src/engine/stays.ts');
  reveal = await import('../src/ui/reveal.ts');
}, 60_000);

type Frame = ReturnType<CensusMod['captureHouse']>;
const scene = (id: string) => C.HOUSE_SCENES.find((h) => h.id === id)!;
const memo = new Map<string, Frame>();
const shot = (id: string): Frame => memo.get(id) ?? memo.set(id, C.captureHouse(scene(id))).get(id)!;
const starOf = (f: Frame, id: string) => f.stars.find((q) => q.id === id && !q.ghost)!;
const nodeOf = (f: Frame, uid: string) => f.d.frame.nodes.find((n) => n.union === uid && n.kind === 'union')!;

describe('174, 181: ромб на следе жены у черты брака, вид союза — начертанием', () => {
  it('Иаков: четыре союза — ромб на следе каждой жены, черта от Иакова; Лия — «‖» жены, Валла — «|» наложницы', () => {
    const f = shot('jacob-f');
    for (const w of ['liya', 'rakhil', 'valla', 'zelfa']) {
      const uid = `u:iakov+${w}`;
      const n = nodeOf(f, uid);
      expect(n, uid).toBeTruthy();
      expect(n.owner, uid).toBe(w);
      expect(Math.abs(n.y - links.trailYAt(starOf(f, w), n.x)), uid).toBeLessThan(1);
      const bar = f.d.frame.paths.find((q) => q.kind === 'bar' && q.union === uid)!;
      expect(bar, uid).toBeTruthy();
      expect(bar.ends, uid).toEqual(['iakov', w]);
      expect(bar.bar, uid).toBe(stays.marriageKind(reveal.unions.byId.get(uid)!));
      // черта — от следа Иакова к ромбу, одной вертикалью в x ромба
      expect(Math.abs(bar.pts[0] - n.x), uid).toBeLessThan(0.5);
      expect(Math.abs(bar.pts[bar.pts.length - 1] - n.y), uid).toBeLessThan(0.5);
      expect(Math.abs(bar.pts[1] - links.trailYAt(starOf(f, 'iakov'), n.x)), uid).toBeLessThan(1);
    }
    expect(f.d.frame.paths.find((q) => q.kind === 'bar' && q.union === 'u:iakov+liya')!.bar).toBe('wife');
    expect(f.d.frame.paths.find((q) => q.kind === 'bar' && q.union === 'u:iakov+valla')!.bar).toBe('concubine');
  });
  it('Иуда и Фамарь: левират Онана — двойная штрихом, союз Иуды и Фамари — брак не назван (обе половины полые); у Фамари три черты', () => {
    const f = shot('iuda-o');
    const lev = f.d.frame.paths.find((q) => q.kind === 'bar' && q.union === 'u:onan+famar');
    expect(lev?.bar).toBe('levirate');
    expect(lev?.style).toBe('dash');
    const none = nodeOf(f, 'u:iuda+famar');
    expect(none.owner).toBe('famar');
    expect(none.look).toBe('none');
    // повторные браки — несколько черт к следу жены, у каждой свой ромб
    const onTamar = f.d.frame.nodes.filter((n) => n.kind === 'union' && n.owner === 'famar');
    expect(new Set(onTamar.map((n) => n.union))).toEqual(new Set(['u:ir-syn-iudy+famar', 'u:onan+famar', 'u:iuda+famar']));
    expect(new Set(onTamar.map((n) => Math.round(n.x))).size).toBe(3);
  });
  it('Давид: мать не названа — ромб с полой половиной жены на следе Давида', () => {
    const f = shot('david-f');
    const n = nodeOf(f, 'u:david+');
    expect(n.owner).toBe('david');
    expect(n.look).toBe('no-mother');
  });
  it('знак союза: брак не назван — обе половины полые; мать не названа — полая половина жены', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_o, k) => (typeof k === 'string' && ['fill', 'stroke'].includes(k) ? () => calls.push(k) : () => undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const look = (l: Parameters<typeof plates.paintUnion>[4]['look']) => {
      calls.length = 0;
      plates.paintUnion(ctx, 10, 10, 4.5, { open: true, halo: '#000', theme: 'night', a: 1, look: l });
      return { fill: calls.filter((c) => c === 'fill').length, stroke: calls.filter((c) => c === 'stroke').length };
    };
    // подложка цвета неба — заливка; дальше: жена — две заливки; брак не назван — два контура; мать не названа — заливка и контур
    expect(look('wife')).toEqual({ fill: 3, stroke: 0 });
    expect(look('none')).toEqual({ fill: 1, stroke: 2 });
    expect(look('no-mother')).toEqual({ fill: 2, stroke: 1 });
  });
});

describe('175, 176: дети — от следа матери; связь целиком, без обрывков', () => {
  it('Иаков: каждый ребёнок жены — зубцом от ствола, начатого на её следе или на шине её гнёзд; обрывков нет', () => {
    const f = shot('jacob-f');
    expect(f.d.frame.stubs).toEqual([]);
    expect(f.d.frame.paths.filter((q) => q.kind === 'stub' || q.when !== 'always')).toEqual([]);
    for (const w of ['liya', 'rakhil', 'valla', 'zelfa']) {
      const uid = `u:iakov+${w}`;
      const own = f.d.frame.paths.filter((q) => q.union === uid);
      const teeth = own.filter((q) => q.kind === 'tooth');
      expect(teeth.length, uid).toBeGreaterThan(0);
      for (const t of teeth) {
        const x = t.pts[0];
        const trunk = own.find((q) => q.kind === 'trunk' && Math.abs(q.pts[0] - x) < 0.5 && Math.min(q.pts[1], q.pts[3]) <= t.pts[1] + 0.5 && Math.max(q.pts[1], q.pts[3]) >= t.pts[1] - 0.5);
        expect(trunk, t.ks).toBeTruthy();
        // ствол начинается на следе матери (у ромба или «•»)
        const top = trunk!.pts[1];
        expect(Math.abs(top - links.trailYAt(starOf(f, w), x)), t.ks).toBeLessThan(1);
        // зубец — 5–40 px до звезды
        const kid = starOf(f, t.ends[t.ends.length - 1]);
        expect(kid.x - x, t.ks).toBeLessThanOrEqual(links.TOOTH_MAX + 0.6);
        expect(kid.x - x, t.ks).toBeGreaterThanOrEqual(links.TRUNK_MIN - 0.6);
      }
    }
  });
  it('указатель шатра: «Лия: Рувим, Симеон, Левий и ещё 1»; без детей — союз', () => {
    expect(frame.tentText('u:iakov+liya', ['ruvim', 'simeon', 'leviy', 'issakhar']).replace(/ /g, ' ')).toBe('Лия: Рувим, Симеон, Левий и ещё 1');
    expect(frame.tentText('u:iakov+valla', ['dan'])).toBe('Валла: Дан');
    expect(frame.tentText('u:iakov+rakhil', ['iakov'])).toBe('Иаков');
  });
});

describe('177, 179: станция ленты у черты брака матери; путь происхождения', () => {
  it('Давид → Соломон и Давид → Нафан уходят со следа Давида у черты Вирсавии; ромб под лентой не прячется', () => {
    const f = shot('david-f');
    const n = nodeOf(f, 'u:david+virsaviya');
    expect(n.owner).toBe('virsaviya');
    for (const pk of ['david>solomon', 'david>nafan-syn-davida']) {
      const v = f.d.frame.via.get(pk)!;
      expect(v, pk).toBeTruthy();
      expect(v.union, pk).toBe('u:david+virsaviya');
      // у черты: в x ромба или правее его на радиус и зазор (мать между отцом и ребёнком — лента мимо ромба)
      expect(v.x - n.x, pk).toBeGreaterThanOrEqual(-0.5);
      expect(v.x - n.x, pk).toBeLessThanOrEqual(links.NODE_R_MAP + links.RIB_STEP + 0.5);
    }
  });
  it('Вениамин: путь от звезды Иакова по его следу, черте брака к ромбу Рахили и по её следу и отводу к Вениамину', () => {
    const f = shot('jacob-f');
    const routes = marks.originRoute(f.s, f.d, 'veniamin');
    expect(routes.length).toBeGreaterThan(0);
    const pts = routes.flatMap((r) => r.reduce<[number, number][]>((a, _, k) => (k % 2 ? a : [...a, [r[k], r[k + 1]]]), []));
    const near = (x: number, y: number, tol = 1.5) => pts.some(([px, py]) => Math.hypot(px - x - f.d.dx, py - y - f.d.dy) <= tol);
    const jacob = starOf(f, 'iakov');
    const rachel = nodeOf(f, 'u:iakov+rakhil');
    const ben = starOf(f, 'veniamin');
    expect(near(jacob.x, jacob.y)).toBe(true);
    expect(near(rachel.x, rachel.y)).toBe(true);
    expect(near(ben.x - ben.r - 1.5, ben.y)).toBe(true);
    // мать — не от своей звезды: путь Рахили к союзу не входит в путь происхождения
    const rs = starOf(f, 'rakhil');
    expect(near(rs.x, rs.y, 0.5)).toBe(false);
  });
});
