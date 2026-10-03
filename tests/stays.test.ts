/**
 * Договор 1 этапа 15 (src/engine/stays.ts; решение 173 «Отчий дом»): полоса лица в год t — laneAt, полоса звезды —
 * starLaneOf, переходы — glidesOf, год черты брака — unionYear, вид союза — marriageKind. Проверки — на условном узле
 * и на собранном индексе неба (src/generated/atlas.json): пребывания из сборки читаются так же, как их считает раскладка.
 */
import { describe, expect, it } from 'vitest';
import { glidesOf, laneAt, marriageKind, smooth, starLaneOf, unionYear, type StayNode } from '../src/engine/stays.ts';
import { models, byId } from '../src/data/atlas.ts';
import { unions } from '../src/ui/reveal.ts';

// рождение −1900 в полосе 2 (дом отца), с −1888 переход, с −1880 — полоса жизни 9
const son: StayNode = { lane: 9, starLane: 2, stays: [{ lane: 2, t0: -1900, t1: -1888 }, { lane: 9, t0: -1880, t1: -1800 }] };

describe('laneAt: пребывания и переход', () => {
  it('без пребываний — полоса узла в любой год', () => {
    const n: StayNode = { lane: -4 };
    for (const t of [-5000, -1000, 0, 100]) expect(laneAt(n, t)).toBe(-4);
    expect(starLaneOf(n)).toBe(-4);
    expect(glidesOf(n)).toEqual([]);
  });
  it('в пребывании — его полоса; до первого — полоса рождения, после последнего — полоса жизни', () => {
    expect(laneAt(son, -1950)).toBe(2);
    expect(laneAt(son, -1900)).toBe(2);
    expect(laneAt(son, -1888)).toBe(2);
    expect(laneAt(son, -1880)).toBe(9);
    expect(laneAt(son, -1850)).toBe(9);
    expect(laneAt(son, -1700)).toBe(9);
  });
  it('на переходе — S-кривая: монотонно, середина — посередине, у концов — касательно полосам', () => {
    let prev = laneAt(son, -1888);
    for (let t = -1887.5; t <= -1880; t += 0.5) {
      const l = laneAt(son, t);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
    expect(laneAt(son, -1884)).toBeCloseTo(5.5, 6);
    // касательная у концов: первые и последние полгода — меньше 3 % пути (smoothstep)
    expect(laneAt(son, -1887.5) - 2).toBeLessThan(0.03 * 7 * 2);
    expect(9 - laneAt(son, -1880.5)).toBeLessThan(0.03 * 7 * 2);
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(-1)).toBe(0);
    expect(smooth(2)).toBe(1);
  });
  it('полоса звезды и переходы', () => {
    expect(starLaneOf(son)).toBe(2);
    expect(starLaneOf({ lane: 9, stays: son.stays })).toBe(2);
    expect(glidesOf(son)).toEqual([{ t0: -1888, t1: -1880, from: 2, to: 9 }]);
  });
  it('три пребывания: рождение, дом первого мужа, дом второго — два перехода по порядку', () => {
    const n: StayNode = { lane: -3, stays: [{ lane: 4, t0: 0, t1: 10 }, { lane: 1, t0: 16, t1: 30 }, { lane: -3, t0: 40, t1: 70 }] };
    expect(glidesOf(n).map((g) => [g.from, g.to])).toEqual([[4, 1], [1, -3]]);
    expect(laneAt(n, 20)).toBe(1);
    expect(laneAt(n, 35)).toBeCloseTo(-1, 6);
    expect(laneAt(n, 80)).toBe(-3);
  });
});

/**
 * Этап 17, решение 190 (docs/ui-review/STAGE17.md; просьба владельца 3 октября: «сейчас вообще непонятный фарш»): небо
 * вернулось к раскладке этапа 14 — «Отчий дом» (173–181) снят, у лиц нет пребываний и переходов, год черты брака не
 * назначается. Проверки пребываний собранного индекса (полоса рождения в доме отца, Рувим уходит в колено, годы черт брака,
 * Мелхола у двух мужей) сняты вместе с раскладкой; договор laneAt / starLaneOf (выше) остаётся — им пользуются следы и подписи.
 */
describe('собранный индекс неба: раскладка этапа 14 — пребываний нет (решение 190)', () => {
  const m = models[0];
  it('ни у одного лица нет переходов: полоса звезды — полоса жизни в любой год', () => {
    for (const n of m.nodes) {
      expect(n.stays, n.id).toBeUndefined();
      expect(starLaneOf(n), n.id).toBe(n.lane);
      expect(glidesOf(n), n.id).toEqual([]);
    }
  });
  it('года черт брака нет ни у одного союза — ромб стоит на следе отца в год первого ребёнка (links.ts)', () => {
    for (const uid of ['u:david+virsaviya', 'u:iakov+liya', 'u:david+', 'u:iliy+~by-luke', 'u:david+melkhola']) expect(unionYear(uid, m), uid).toBeNull();
  });
});

describe('marriageKind: вид союза по данным (решение 174)', () => {
  const kind = (uid: string) => marriageKind(unions.byId.get(uid)!);
  it('жена, наложница, левират, брак не назван', () => {
    expect(kind('u:iakov+liya')).toBe('wife');
    expect(kind('u:iakov+valla')).toBe('concubine');
    expect(kind('u:onan+famar')).toBe('levirate');
    expect(kind('u:iuda+famar')).toBe('none');
    expect(kind('u:lot+starshaya-doch-lota')).toBe('none');
    expect(kind('u:lot+mladshaya-doch-lota')).toBe('none');
  });
  it('мать царя без связи супругов в данных — брак в Писании не назван (флаг queenMother — для слов подсказки)', () => {
    const u = unions.byId.get('u:solomon+naama')!;
    expect(u.queenMother).toBe(true);
    expect(marriageKind(u)).toBe('none');
    expect(byId.get('naama')?.roles).toContain('queen-mother');
  });
  it('один из родителей не назван — черты брака нет', () => {
    expect(kind('u:david+')).toBe('none');
  });
});
