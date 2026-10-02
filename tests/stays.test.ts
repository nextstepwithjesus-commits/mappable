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

describe('собранный индекс неба: пребывания и годы черт брака (src/generated/atlas.json)', () => {
  const m = models[0];
  const withStays = m.nodes.filter((n) => !n.ghost && n.stays);
  it('у лиц с переходом — полоса рождения, пребывания по порядку, последняя полоса = полоса жизни', () => {
    expect(withStays.length).toBeGreaterThan(40);
    for (const n of withStays) {
      const st = n.stays!;
      expect(st.length).toBeGreaterThanOrEqual(2);
      expect(n.starLane).toBe(st[0].lane);
      expect(st[st.length - 1].lane, n.person).toBe(n.lane);
      for (let k = 1; k < st.length; k++) {
        expect(st[k].lane, n.person).not.toBe(st[k - 1].lane);
        expect(st[k].t0, n.person).toBeGreaterThan(st[k - 1].t1);
      }
      // первое пребывание — с рождения по хронологии модели
      expect(st[0].t0).toBe(m.chrono.get(n.person)!.b);
      expect(laneAt(n, st[0].t0)).toBe(n.starLane);
      expect(laneAt(n, st[st.length - 1].t0)).toBe(n.lane);
    }
  });
  it('у остальных лиц полоса рождения — полоса жизни', () => {
    for (const n of m.nodes) if (!n.stays) expect(starLaneOf(n)).toBe(n.lane);
  });
  it('Иаков → Иуда: Иуда — лицо коридора, полоса одна; Рувим родился в доме Иакова и ушёл в колено', () => {
    const iuda = m.nodeByPerson.get('iuda')!;
    expect(iuda.stays).toBeUndefined();
    const ruvim = m.nodeByPerson.get('ruvim')!;
    expect(ruvim.stays?.length).toBe(2);
    const iakov = m.nodeByPerson.get('iakov')!;
    expect(Math.abs(starLaneOf(ruvim) - iakov.lane)).toBeLessThanOrEqual(13);
    expect(Math.abs(ruvim.lane - iakov.lane)).toBeGreaterThan(13);
  });
  it('годы черт брака: жена приходит в дом мужа за год до первого ребёнка союза; Давид и Вирсавия, Иаков и Лия', () => {
    for (const uid of ['u:david+virsaviya', 'u:iakov+liya', 'u:avraam+khettura']) {
      const u = unions.byId.get(uid)!;
      const first = Math.min(...u.kids.map((k) => m.chrono.get(k)!.b));
      expect(unionYear(uid, m), uid).toBe(first - 1);
    }
    // жена, приходящая переходом, — в год черты брака уже в доме мужа
    const lia = m.nodeByPerson.get('virsaviya')!;
    expect(laneAt(lia, unionYear('u:david+virsaviya', m)!)).toBe(lia.lane);
  });
  it('у союза без черты брака (мать не названа, «по Луке») года нет', () => {
    expect(unionYear('u:david+', m)).toBeNull();
    expect(unionYear('u:iliy+~by-luke', m)).toBeNull();
  });
  it('бездетный брак с призраком — год есть: Мелхола у Давида и у Фалтия', () => {
    expect(unionYear('u:david+melkhola', m)).not.toBeNull();
    expect(unionYear('u:faltiy-syn-laisha+melkhola', m)).not.toBeNull();
    const gh = m.nodes.filter((n) => n.ghost && n.person === 'melkhola');
    expect(gh.map((n) => n.id).sort()).toEqual(['ghost:melkhola@david', 'ghost:melkhola@faltiy-syn-laisha']);
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
