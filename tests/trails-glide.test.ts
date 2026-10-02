/**
 * Этап 15, «Отчий дом» (решения 173, 178, 179; договор 1 STAGE15 § 3): небо по пребываниям.
 *  — след лица — по пребываниям: горизонтали и S-кривые переходов той же выборки, что у попадания и связей (trails.ts,
 *    bendsOf, trailY, trailSegs, trailPolyline); переход не отвесный; разрывы под связями — и на переходе;
 *  — звезда — в полосе рождения (starLaneOf): знак, подпись, попадание, список неба;
 *  — попадание по ломаной: указатель над переходом ловит само лицо (решение 179);
 *  — чужой след под переходом прерывается (переход идёт поверх с разрывом под собой);
 *  — уровни подробности (решение 178): на небе — связи структурных лиц и выбранного, с обзора семьи — все; переходы на
 *    небе — бледнее.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { beforeAll, describe, expect, it } from 'vitest';

/** Холст-запись: вызовы путей и текст, ширина текста — 6 px на знак. */
function recording() {
  const calls: [string, ...unknown[]][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 6 });
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: () => {} };
      };
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

let sky: typeof import('../src/render/sky.ts');
let trails: typeof import('../src/render/trails.ts');
let stays: typeof import('../src/engine/stays.ts');
let atlas: typeof import('../src/data/atlas.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  trails = await import('../src/render/trails.ts');
  stays = await import('../src/engine/stays.ts');
  atlas = await import('../src/data/atlas.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };

/** Кадр 1440 × 776: окно years лет вокруг года t (астр.) на полосе lane; состояние — сверх обычного. */
function frame(t: number, years: number, lane: number, state: Record<string, unknown> = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(1440, 776, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  const vp = s.cam.vp;
  const kx = (vp.r - vp.l) / (s.xOf(t + years / 2) - s.xOf(t - years / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + (vp.r - vp.l) / 2) / kx, kx, laneTop: s.rowOf(lane) + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, depth: null,
    layers: LAYERS, onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false,
    pins: new Set(), reserve: [], ...state,
  } as Parameters<Sky['draw']>[0]);
  return { s, calls: rec.calls, data: (canvas as unknown as { dataset: Record<string, string> }).dataset };
}

/** Окно семьи Иакова: середина — между рождением Иакова и рождениями сыновей, полоса — дом Иакова. */
function jacob(years: number, state: Record<string, unknown> = {}) {
  const n = atlas.models[0].nodeByPerson.get('iakov')!;
  const t = (atlas.models[0].nodeByPerson.get('veniamin')!.t0 + n.t0) / 2 + 25;
  return frame(t, years, n.lane, state);
}

describe('след по пребываниям: ломаная перехода (trails.ts)', () => {
  const shape = () => ({ y: 10.5, bends: [trails.sampleBend(100, 160, 10.5, 70.5)] });
  it('высота следа: до перехода — звезда, на переходе — по ломаной монотонно, после — конец перехода', () => {
    const t = shape();
    expect(trails.trailY(t, 50)).toBe(10.5);
    expect(trails.trailY(t, 100)).toBe(10.5);
    expect(trails.trailY(t, 200)).toBe(70.5);
    let prev = 10.5;
    for (let x = 100; x <= 160; x += 2) {
      const y = trails.trailY(t, x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    // S-кривая: у концов касательна к полосе, середина — на полпути
    expect(trails.trailY(t, 103) - 10.5).toBeLessThan(3);
    expect(Math.abs(trails.trailY(t, 130) - 40.5)).toBeLessThan(1.5);
  });
  it('отрезки следа: горизонталь до перехода, ломаная перехода, горизонталь после; ломаная для связей — непрерывна', () => {
    const t = shape();
    const segs: [number, number, number, number, boolean][] = [];
    trails.trailSegs(t, 20, 220, (a, b, c, d, bend) => segs.push([a, b, c, d, bend]));
    expect(segs[0]).toEqual([20, 10.5, 100, 10.5, false]);
    expect(segs[segs.length - 1]).toEqual([160, 70.5, 220, 70.5, false]);
    expect(segs.filter((q) => q[4]).length).toBeGreaterThanOrEqual(6);
    for (let k = 1; k < segs.length; k++) {
      expect(segs[k][0]).toBeCloseTo(segs[k - 1][2], 9);
      expect(segs[k][1]).toBeCloseTo(segs[k - 1][3], 9);
    }
    const pl = trails.trailPolyline({ x0: 20, x1: 220, ...t });
    expect([pl[0], pl[1], pl[pl.length - 2], pl[pl.length - 1]]).toEqual([20, 10.5, 220, 70.5]);
    for (let k = 2; k < pl.length; k += 2) expect(pl[k]).toBeGreaterThan(pl[k - 2]);
  });
  it('разрыв под связью — и на переходе: вертикаль над ломаной вырезает её вокруг точки пересечения', () => {
    const t = shape();
    const whole = recording();
    whole.ctx.beginPath();
    trails.trailPath(whole.ctx, t, 20, 220);
    const cut = recording();
    trails.trailPath(cut.ctx, t, 20, 220, [130, 3]);
    // разрыв на переходе: длина нарисованного короче на просвет, а точек у x = 130 ближе 2,5 px нет (без разрыва — есть)
    const len = (calls: [string, ...unknown[]][]) => {
      let l = 0;
      let at: [number, number] | null = null;
      for (const c of calls) {
        if (c[0] === 'moveTo') at = [c[1] as number, c[2] as number];
        else if (c[0] === 'lineTo' && at) {
          l += Math.hypot((c[1] as number) - at[0], (c[2] as number) - at[1]);
          at = [c[1] as number, c[2] as number];
        }
      }
      return l;
    };
    expect(len(whole.calls) - len(cut.calls)).toBeGreaterThan(5);
    const yc = trails.trailY(t, 130);
    const near = (calls: [string, ...unknown[]][]) => calls.some((c) => (c[0] === 'lineTo' || c[0] === 'moveTo') && Math.hypot((c[1] as number) - 130, (c[2] as number) - yc) < 2.5);
    expect(near(cut.calls)).toBe(false);
  });
  it('след с переходом рисуется тем же рисовальщиком: бледные переходы — вторым проходом с меньшей непрозрачностью', () => {
    const r = recording();
    trails.drawLifeTrail(r.ctx, { x0: 20, x1: 220, cls: 'exact', known: true, solidTo: 220, color: '#ffffff', width: 1, ...shape(), bendAlpha: 0.45 });
    expect(r.calls.filter((c) => c[0] === 'stroke').length).toBe(2);
    const one = recording();
    trails.drawLifeTrail(one.ctx, { x0: 20, x1: 220, cls: 'exact', known: true, solidTo: 220, color: '#ffffff', width: 1, ...shape() });
    expect(one.calls.filter((c) => c[0] === 'stroke').length).toBe(1);
    // доля следа до прихода жены в дом мужа (Д7) — бледнее: два прохода с вырезом по x
    const wed = recording();
    trails.drawLifeTrail(wed.ctx, { x0: 20, x1: 220, y: 10.5, cls: 'exact', known: true, solidTo: 220, color: '#ffffff', width: 1, liveFrom: 90 });
    expect(wed.calls.filter((c) => c[0] === 'clip').length).toBe(2);
  });
  it('уровни 178: пороги 7 и 24 px на год, переход — плавный в полосе ×1,5', () => {
    expect([3, 6.9, 7, 23.9, 24, 60].map(trails.familyTier)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(trails.tierAlpha(7 / 1.5, 7)).toBe(0);
    expect(trails.tierAlpha(7 * 1.5, 7)).toBe(1);
    expect(trails.tierAlpha(7, 7)).toBeCloseTo(0.5, 6);
    expect(trails.bendAlpha({ pxYear: 1 })).toBeCloseTo(trails.BEND_SKY, 6);
    expect(trails.bendAlpha({ pxYear: 30 })).toBe(1);
  });
});

describe('небо «Отчего дома» на семье Иакова', () => {
  it('звезда — в полосе рождения; переходы в окне не отвесны; чужие следы под переходами прерваны', () => {
    const { s, data } = jacob(60);
    const glides = data.glides.split(';').filter(Boolean).map((q) => {
      const [id, xy] = q.split(':');
      const [x0, y0, x1, y1] = xy.split(',').map(Number);
      return { id, x0, y0, x1, y1 };
    });
    expect(glides.length).toBeGreaterThan(3);
    for (const g of glides) {
      // не отвесный: переход идёт 5–16 лет — на масштабе семьи не меньше 5 лет по x
      expect(g.x1 - g.x0, g.id).toBeGreaterThanOrEqual(5 * s.pxPerYear() * 0.8);
      const i = s.indexOf(g.id)!;
      const n = s.nodes[i];
      // звезда — в полосе рождения (первое пребывание), след после перехода — в полосе другого пребывания
      expect(Math.abs(s.starY(i) - s.cam.sy(stays.starLaneOf(n))), g.id).toBeLessThan(1e-6);
      expect(n.stays!.length, g.id).toBeGreaterThan(1);
    }
    // звезда Вениамина — у Рахили (отчий дом), полоса жизни — в колене
    const v = s.indexOf('veniamin')!;
    expect(stays.starLaneOf(s.nodes[v])).not.toBe(s.nodes[v].lane);
    // список звёзд кадра (canvas[data-stars-at]) несёт её на полосе рождения
    expect(data.starsAt.split(';')).toContain(`${Math.round(s.cam.sx(s.X0[v]))},${Math.round(s.starY(v))}`);
    // переход поверх чужого следа — с разрывом под собой (D2, С6)
    const cuts = data.glideCuts.split(' ').filter(Boolean);
    expect(cuts.length).toBeGreaterThan(0);
    const [who, rest] = cuts[0].split('>');
    const [, x] = rest.split('@');
    const j = s.nodes.findIndex((n) => n.person === rest.split('@')[0] && !n.ghost);
    const c = s.cutsNow(j) ?? [];
    expect(c.some((_, k) => k % 2 === 0 && Math.abs(c[k] - Number(x)) < 1), `${who} над ${rest}`).toBe(true);
  });
  it('указатель над переходом ловит само лицо (решение 179); над звездой — звезду', () => {
    const { s, data } = jacob(60);
    const glides = data.glides.split(';').filter(Boolean);
    let caught = 0;
    for (const q of glides) {
      const [id, xy] = q.split(':');
      const [x0, y0, x1, y1] = xy.split(',').map(Number);
      const i = s.indexOf(id)!;
      // середина S-кривой — по году середины перехода
      const xm = (x0 + x1) / 2;
      const ym = s.trailYAt(i, xm);
      if (Math.abs(y1 - y0) < 4) continue;
      expect(Math.abs(ym - (y0 + y1) / 2), id).toBeLessThan(Math.abs(y1 - y0) * 0.2 + 2);
      if (s.hitTrail(xm, ym) === id) caught++;
      // в стороне от перехода (не на нём и не на чужом следе рядом) — не это лицо
      expect(s.trailDist(i, xm + 40, ym), id).toBeGreaterThan(5);
    }
    expect(caught).toBeGreaterThan(0);
    const v = s.indexOf('veniamin')!;
    expect(s.hitStar(s.cam.sx(s.X0[v]), s.starY(v), 6)?.id).toBe('veniamin');
  });
  it('уровни подробности (решение 178): на небе контекстных связей нет, с обзора семьи — все; переходы на небе бледнее', () => {
    const far = jacob(2500);
    const fd = far.s.linkFrame();
    expect(far.data.glides).toBeDefined();
    if (fd?.look) {
      const ctx = fd.frame.paths.filter((q) => q.kind !== 'ribbon' && fd.look!(q).tier === 2);
      expect(ctx.length).toBeGreaterThan(0);
      for (const q of ctx) expect(fd.look!(q).a, q.ks).toBe(0);
    }
    const mid = jacob(113);
    const md = mid.s.linkFrame()!;
    const pxYear = mid.s.pxPerYear();
    expect(pxYear).toBeGreaterThanOrEqual(7 * 1.5);
    const ctx2 = md.frame.paths.filter((q) => q.kind !== 'ribbon' && !q.childless && md.look!(q).tier === 2);
    expect(ctx2.length).toBeGreaterThan(0);
    for (const q of ctx2) expect(md.look!(q).a, q.ks).toBe(1);
  });
});
