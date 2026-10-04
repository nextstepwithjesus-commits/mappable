/**
 * Небо этапа 12, задача S1 (решения 87–90; отзыв владельца от 30 сентября 2026 г., снимки 15–17, 19):
 *  — 87: знак союза — двухцветный ромб (синяя половина — муж, розовая — жена); с цветными линиями — их цвета: ветвь
 *    выбранного, жёлтый выбранной связи, золотистый — союзы лица под указателем и выбранного;
 *  — 88: выбранная связь целиком — от звезды каждого названного родителя по его следу до узла союза и от узла по стволу
 *    и зубцу до ребёнка (снимок 16: «Каин и его жена → Енох» — жёлтое от звезды Каина);
 *  — 89: дуги родства словами Писания и дуги к призраку жены — золотистым пунктиром, у лица под указателем и у выбранного;
 *  — 90: неуверенность следа — растушёвкой: точек на следах жизни нет (снимок 17: Енох и Ирад).
 * Кадры — через перепись (tools/census.ts): то же небо и те же показы, что у атласа.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;
let links: typeof import('../src/render/links.ts');
let key: typeof import('../src/engine/linkkey.ts');
let marks: typeof import('../src/render/marks.ts');
let plates: typeof import('../src/render/plates.ts');
let branches: typeof import('../src/render/branches.ts');
let trails: typeof import('../src/render/trails.ts');

beforeAll(async () => {
  C = await import('../tools/census.ts');
  links = await import('../src/render/links.ts');
  key = await import('../src/engine/linkkey.ts');
  marks = await import('../src/render/marks.ts');
  plates = await import('../src/render/plates.ts');
  branches = await import('../src/render/branches.ts');
  trails = await import('../src/render/trails.ts');
}, 60_000);

type Frame = ReturnType<CensusMod['capture']>;
type Call = [string, ...unknown[]];

/** Холст, который записывает вызовы и присваивания по порядку. */
function recording() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: (...b: unknown[]) => calls.push(['addColorStop', ...b]) };
      };
    },
    set: (_o, k, v) => {
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Звезда кадра в px холста. */
function starOf(f: Frame, id: string) {
  const s = f.stars.find((q) => q.id === id && !q.ghost)!;
  return { x: s.x + f.d.dx, y: s.y + f.d.dy, r: s.r };
}
/** Ромб союза в px холста. */
function nodeOf(f: Frame, union: string) {
  const n = f.d.frame.nodes.find((q) => q.union === union && q.kind === 'union')!;
  return { x: n.x + f.d.dx, y: n.y + f.d.dy, owner: n.owner };
}
const near = (ax: number, ay: number, bx: number, by: number, tol = 1.01) => Math.abs(ax - bx) <= tol && Math.abs(ay - by) <= tol;
/** Ломаная начинается (или кончается) в точке. */
const endsAt = (r: number[], x: number, y: number) => near(r[0], r[1], x, y) || near(r[r.length - 2], r[r.length - 1], x, y);
/** Точка лежит на ломаной. */
function onRoute(r: number[], x: number, y: number, tol = 1.01): boolean {
  for (let k = 0; k + 3 < r.length; k += 2) if (links.distSeg(x, y, r[k], r[k + 1], r[k + 2], r[k + 3]) <= tol) return true;
  return r.length === 2 && near(r[0], r[1], x, y, tol);
}
/** Все отрезки — горизонтали и вертикали (Г2: косых нет). */
const straight = (r: number[]) => links.segmentsOf({ pts: r }).every(([x0, y0, x1, y1]) => Math.abs(x0 - x1) < 0.5 || Math.abs(y0 - y1) < 0.5);

describe('путь по нарисованным линиям (links.ts, routeOver)', () => {
  it('след → ствол → зубец: соединение в точке, где конец одного отрезка лежит на другом', () => {
    const r = links.routeOver([[0, 0, 100, 0], [50, 0, 50, 50], [50, 50, 80, 50]], { x: 0, y: 0 }, { x: 80, y: 50 });
    expect(r).toEqual([0, 0, 50, 0, 50, 50, 80, 50]);
  });
  it('пересечение без общей точки — не соединение (Г7): пути нет', () => {
    expect(links.routeOver([[0, 0, 100, 0], [50, -20, 50, 20]], { x: 0, y: 0 }, { x: 50, y: 20 })).toBe(null);
  });
  it('из двух дорог — короче; лишних точек на прямой нет', () => {
    const r = links.routeOver([[0, 0, 40, 0], [40, 0, 100, 0], [0, 0, 0, 30], [0, 30, 100, 30], [100, 0, 100, 30]], { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(r).toEqual([0, 0, 100, 0]);
  });
});

describe('выбранная связь целиком (решение 88)', () => {
  it('снимок 16: «Каин и его жена → Енох» — жёлтое от звезды Каина по его следу до ромба и от ромба к Еноху', () => {
    const f = C.capture('adam', 1, 1440);
    const k = key.parseLinkKey('k.kain._._.enokh-syn-kaina')!;
    const g = C.frameOf(C.SCENES.adam, f.s, 1, 1440, { link: k });
    const { all, core } = marks.selectedRoutes(g.s, g.d, k);
    const cain = starOf(g, 'kain');
    const node = nodeOf(g, 'u:kain+');
    expect(node.owner).toBe('kain');
    // путь Каина: от его звезды по строке следа до ромба
    const fromCain = all.find((r) => endsAt(r, cain.x, cain.y));
    expect(fromCain, JSON.stringify(all)).toBeTruthy();
    expect(onRoute(fromCain!, node.x, node.y)).toBe(true);
    expect(links.segmentsOf({ pts: fromCain! }).every(([, y0, , y1]) => Math.abs(y0 - cain.y) < 1 && Math.abs(y1 - cain.y) < 1)).toBe(true);
    // путь связи: от ромба по стволу и зубцу к Еноху (до края его звезды)
    const enokh = starOf(g, 'enokh-syn-kaina');
    const kid = core.find((r) => endsAt(r, node.x, node.y));
    expect(kid, JSON.stringify(core)).toBeTruthy();
    expect(onRoute(kid!, enokh.x - enokh.r - 1.5, enokh.y, 1.6)).toBe(true);
    for (const r of all) expect(straight(r), JSON.stringify(r)).toBe(true);
    // кольца: Каин (отец) и Енох (сын); мать не названа — кольца нет
    const info = g.s.linkSel!;
    expect(info.ends.map((e) => `${e.id}:${e.role}`).sort()).toEqual(['enokh-syn-kaina:сын', 'kain:отец']);
    expect(info.ends.every((e) => e.on)).toBe(true);
  });
  it('Иаков и Рахиль → Иосиф (семейная укладка): пути от звёзд отца и матери сходятся в ромбе союза, от ромба — к Иосифу', () => {
    const f = C.capture('iakov', 1, 1440);
    const k = key.parseLinkKey('k.iakov.rakhil._.iosif')!;
    const g = C.frameOf(C.SCENES.iakov, f.s, 1, 1440, { link: k });
    const { all } = marks.selectedRoutes(g.s, g.d, k);
    const node = nodeOf(g, 'u:iakov+rakhil');
    for (const id of ['iakov', 'rakhil']) {
      const s = starOf(g, id);
      const r = all.find((q) => endsAt(q, s.x, s.y));
      expect(r, `${id}: ${JSON.stringify(all)}`).toBeTruthy();
      expect(endsAt(r!, node.x, node.y) || onRoute(r!, node.x, node.y), id).toBe(true);
      expect(straight(r!), id).toBe(true);
    }
    // кольца с ролями — на всех трёх концах
    expect(g.s.linkSel!.ends.map((e) => `${e.id}:${e.role}`).sort()).toEqual(['iakov:отец', 'iosif:сын', 'rakhil:мать']);
  });
  it('союз целиком: все линии союза и пути обоих супругов к ромбу; черта брака — пути обоих супругов', () => {
    const f = C.capture('iakov', 1, 1440);
    for (const ks of ['u.iakov.liya._', 's.iakov.liya._.iakov']) {
      const k = key.parseLinkKey(ks)!;
      const g = C.frameOf(C.SCENES.iakov, f.s, 1, 1440, { link: k });
      const { all } = marks.selectedRoutes(g.s, g.d, k);
      for (const id of ['iakov', 'liya']) {
        const s = starOf(g, id);
        expect(all.some((q) => endsAt(q, s.x, s.y)), `${ks}: ${id}`).toBe(true);
      }
    }
  });
  it('«все лица»: мать стоит далеко (Г8) — путь от её звезды по её строке до столбца ромба и к ромбу на следе отца', () => {
    const f = C.captureAt('all', 'david', 160, { select: 'david' });
    const k = key.parseLinkKey('k.david.aggifa._.adoniya')!;
    const g = C.frameOf({ ...C.SCENES.all, select: 'david' }, f.s, 1, 1440, { link: k });
    const { all } = marks.selectedRoutes(g.s, g.d, k);
    const node = nodeOf(g, 'u:david+aggifa');
    const m = starOf(g, 'aggifa');
    const r = all.find((q) => endsAt(q, m.x, m.y));
    expect(r, JSON.stringify(all)).toBeTruthy();
    expect(endsAt(r!, node.x, node.y)).toBe(true);
    expect(straight(r!)).toBe(true);
    const d = starOf(g, 'david');
    expect(all.some((q) => endsAt(q, d.x, d.y) && onRoute(q, node.x, node.y))).toBe(true);
  });
});

describe('перепись «все лица»: разрывы и узлы (Я8; этап 12)', () => {
  it('у каждого пересечения с живым чужим следом — разрыв, узлов на чужих следах нет (×1 и ×2)', () => {
    for (const scale of [1, 2]) {
      const c = C.census(C.capture('all', scale, 1440));
      expect(c.y8, `×${scale}`).toBe(0);
      expect(c.y8nodes, `×${scale}`).toBe(0);
    }
  }, 60_000);
});

describe('знак союза (решение 87)', () => {
  it('двухцветный: розовая заливка и синяя левая половина; свёрнутый — два полых полуконтура; цветной — заливка и обводка', () => {
    let r = recording();
    plates.paintUnion(r.ctx, 50, 50, 4.5, { open: true, halo: '#0d1b34', theme: 'night', a: 1 });
    const fills = r.calls.filter((c) => c[0] === '=fillStyle').map((c) => c[1]);
    const U = branches.UNION_COLORS.night;
    expect(fills).toEqual(['#0d1b34', `rgba(${[1, 3, 5].map((i) => parseInt(U.wife.slice(i, i + 2), 16)).join(',')},1)`, `rgba(${[1, 3, 5].map((i) => parseInt(U.husband.slice(i, i + 2), 16)).join(',')},1)`]);
    expect(r.calls.filter((c) => c[0] === 'fill').length).toBe(3);
    r = recording();
    plates.paintUnion(r.ctx, 50, 50, 4.5, { open: false, halo: '#0d1b34', theme: 'night', a: 1 });
    expect(r.calls.filter((c) => c[0] === 'fill').length).toBe(1);
    expect(r.calls.filter((c) => c[0] === 'stroke').length).toBe(2);
    r = recording();
    plates.paintUnion(r.ctx, 50, 50, 4.5, { open: true, halo: '#e9eef4', theme: 'day', a: 1, color: '#137632', edge: '#172238' });
    expect(r.calls.filter((c) => c[0] === 'fill').length).toBe(2);
    expect(r.calls.filter((c) => c[0] === 'stroke').length).toBe(1);
  });
  // этап 18, решение 193 (владелец 4 октября: «у каждой линии по каждой жене или наложнице должен быть свой цвет»): бездетный
  // союз выбранного — тоже своим цветом ветви (прежде — золотистый, как вся родня), не совпадающим с цветами других союзов
  it('без выбора — двухцветный; у выбранного Давида ромбы его союзов с детьми — цвета их ветвей, бездетный союз — свой цвет', () => {
    const f = C.captureAt('all', 'david', 160, { select: null });
    const looks0 = (f.s.canvas.dataset.unionLooks ?? '').split(';').filter(Boolean);
    expect(looks0.length).toBeGreaterThan(5);
    expect(looks0.every((q) => q.split(':')[2] === 'two'), looks0.join(' ')).toBe(true);
    const g = C.capture('david', 1, 1440);
    const looks = new Map((g.s.canvas.dataset.unionLooks ?? '').split(';').filter(Boolean).map((q) => {
      const [, u, c] = /^(u:[^:]+):([^:]+):/.exec(q)!;
      return [u, c];
    }));
    const bf = marks.branchMapOf('david', g.s.model.id);
    // ветвь союза с Аггифой: цвет у всех её детей один — ромб того же цвета
    const adon = bf.desc.get('adoniya')!;
    const theme = g.s.pal.glow ? 'night' : 'day';
    expect(looks.get('u:david+aggifa')).toBe(branches.branchColor(adon.branch, theme));
    const mel = looks.get('u:david+melkhola');
    expect(mel).toBeTruthy();
    expect(mel).not.toBe(branches.KIN_GOLD[theme]);
    expect(Array.from({ length: 24 }, (_, k) => branches.branchColor(k, theme))).toContain(mel);
    const others = [...looks].filter(([u]) => u.startsWith('u:david+') && u !== 'u:david+melkhola').map(([, c]) => c);
    expect(others.length).toBeGreaterThan(3);
    expect(others, `Мелхола ${mel}`).not.toContain(mel);
  });
  it('выбранная связь — ромб её союза жёлтый', () => {
    const f = C.capture('iakov', 1, 1440);
    const k = key.parseLinkKey('k.iakov.rakhil._.iosif')!;
    const g = C.frameOf(C.SCENES.iakov, f.s, 1, 1440, { link: k });
    const looks = (g.s.canvas.dataset.unionLooks ?? '').split(';');
    expect(looks.find((q) => q.startsWith('u:iakov+rakhil:'))?.split(':')[2]).toBe(branches.LINK_YELLOW[g.s.pal.glow ? 'night' : 'day']);
  });
});

describe('золотистые дуги семьи (решение 89)', () => {
  it('у выбранного Давида и у Давида под указателем — дуги родства словами Писания («сестра», «дядя») золотистым', () => {
    for (const st of [{ select: 'david' as string | null, hovered: null as string | null }, { select: null, hovered: 'david' }]) {
      const f = C.captureAt('all', 'david', 160, { select: st.select });
      const g = st.hovered ? C.frameOf({ ...C.SCENES.all, select: null }, f.s, 1, 1440, { hovered: st.hovered }) : f;
      const arcs = (g.s.canvas.dataset.kinArcs ?? '').split('|').filter(Boolean);
      expect(arcs.some((a) => a.includes('saruiya') && a.endsWith(':сестра')), arcs.join(' ')).toBe(true);
    }
  });
  it('золотистый — не жёлтый выбранной связи; подписи на дугах — тем же цветом', () => {
    expect(branches.KIN_GOLD.night).not.toBe(branches.LINK_YELLOW.night);
    expect(branches.KIN_GOLD.day).not.toBe(branches.LINK_YELLOW.day);
  });
});

describe('след без точек (решение 90)', () => {
  it('снимок 17: у Еноха и Ирада на небе нет точек на следе — начало и конец растушёваны', () => {
    const f = C.capture('adam', 1, 1440);
    const t = { x0: 0, x1: 0, y: 0, cls: 'exact' as const, known: true, solidTo: 0, color: '#ffffff', width: 1.2 };
    for (const id of ['enokh-syn-kaina', 'irad']) {
      const i = f.s.indexOf(id)!;
      const tr = trails.trailOf(f.s, i, { ...t })!;
      expect(tr, id).toBeTruthy();
      const r = recording();
      trails.drawLifeTrail(r.ctx, { ...tr, color: '#ffffff' });
      expect(r.calls.some((c) => c[0] === 'setLineDash' && (c[1] as number[]).length), id).toBe(false);
      // неуверенные части — растушёвкой: у оценочного рождения градиент от звезды, у оценочной смерти — к концу следа
      const grads = r.calls.filter((c) => c[0] === 'createLinearGradient');
      expect(grads.length, id).toBeGreaterThan(0);
      if (tr.sureFrom !== undefined && tr.sureFrom > tr.x0 + 0.5) expect(grads.some((c) => Math.abs((c[1] as number) - tr.x0) < 0.01)).toBe(true);
      // растушёвка тает к краю: у начала — доля TRAIL_FADE.start, у конца — TRAIL_FADE.end
      const stops = r.calls.filter((c) => c[0] === 'addColorStop').map((c) => String(c[2]));
      expect(stops.some((s) => s.endsWith(`,${trails.TRAIL_FADE.start})`) || s.endsWith(`,${trails.TRAIL_FADE.end})`))).toBe(true);
    }
  });
  it('точки остаются только у «время не установлено»: эпохальный след и скобка', () => {
    const r = recording();
    trails.drawLifeTrail(r.ctx, { x0: 10, x1: 300, y: 5.5, cls: 'epochal', known: false, solidTo: 10, color: '#fff', width: 1 });
    expect(r.calls.some((c) => c[0] === 'setLineDash' && JSON.stringify(c[1]) === JSON.stringify([1, 4]))).toBe(true);
  });
});
