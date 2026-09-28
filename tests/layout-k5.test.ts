/**
 * Контуры созвездий и места названий — этап 7, K5 (MAP-58): область — звёзды и первые годы следа, без «сосисок» вокруг
 * длинных жизней; мест под название — по нескольку на высоту, чтобы название было в окне и повторялось по области.
 * Положение узлов раскладки контуры не меняют (npm run -s coords).
 */
import { describe, expect, it } from 'vitest';
import { models } from '../src/data/atlas.ts';
import { hydrateScale, timeToX } from '../src/engine/timescale.ts';

const m = models[0];
const scale = hydrateScale(m.scale);
const X = (t: number) => timeToX(scale, t, 1);

/** Точка внутри колец (чётно-нечётное правило). */
function inside(rings: [number, number][][], t: number, lane: number) {
  let c = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ti, li] = r[i];
      const [tj, lj] = r[j];
      if (li > lane !== lj > lane && t < ((tj - ti) * (lane - li)) / (lj - li) + ti) c = !c;
    }
  return c;
}

describe('контуры созвездий без хвостов следов (MAP-58)', () => {
  it('контур не уходит за звёзды и первые 20 лет их следов дальше чем на поле и сглаживание', () => {
    let checked = 0;
    for (const o of m.outlines) {
      const xs = o.rings.flat().map(([t]) => X(t));
      const right = Math.max(...xs);
      // члены части — узлы внутри её колец
      const members = m.nodes.filter((n) => !n.ghost && inside(o.rings, n.t0, n.lane));
      if (members.length < 5) continue;
      const core = Math.max(...members.map((n) => Math.min(X(n.t1), X(n.t0 + 20))));
      // поле справа 300 единиц, замыкание и сглаживание — до ~6 клеток по 100 единиц
      expect(right - core, o.group).toBeLessThanOrEqual(300 + 600 + 1);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });
  it('длинные следы выходят за контур: контур обводит звёзды, а не жизни', () => {
    let long = 0;
    let out = 0;
    for (const n of m.nodes) {
      if (n.ghost || n.t1 - n.t0 < 60) continue;
      const own = m.outlines.filter((o) => inside(o.rings, n.t0, n.lane));
      if (!own.length) continue;
      long++;
      if (!own.some((o) => inside(o.rings, n.t1, n.lane))) out++;
    }
    expect(long).toBeGreaterThan(20);
    expect(out / long).toBeGreaterThan(0.3);
  });
  it('мест под название — по нескольку на высоту: у крупных созвездий их больше трёх', () => {
    const many = m.outlines.filter((o) => o.slots.length > 3);
    expect(many.length).toBeGreaterThan(10);
    for (const o of m.outlines) {
      // места не перекрываются
      for (const a of o.slots)
        for (const b of o.slots) {
          if (a === b) continue;
          const lanes = Math.abs(a.lane - b.lane) < (a.h + b.h) / 2;
          const years = a.t0 < b.t1 && b.t0 < a.t1;
          expect(lanes && years, `${o.group} ${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(false);
        }
    }
  });
});
