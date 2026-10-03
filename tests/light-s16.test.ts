/**
 * Этап 16, исполнитель L «Свет» (решения 182–184; приёмка О3, О4; docs/ui-review/STAGE16.md):
 *  — колено лица для цвета света — по матери родоначальника (Быт 35:23–26), по отцам; жёны и неполные родословия —
 *    по созвездию; народы — 'nations', лица до колен — 'silver' (src/engine/affiliation.ts);
 *  — опорное лицо неба — выбранное, без выбора — Иаков; у Иакова и четырёх матерей цвет ветви равен оттенку колена
 *    («без перескока»), у прочих — цвет ветви решения 69 (src/render/light.ts);
 *  — оттенки колен — первые четыре цвета ветвей (новых цветов нет; пороги О3 — npm run -s contrast);
 *  — каждое устье — у основателя созвездия из данных, от его звезды в отчем доме (О4);
 *  — названия созвездий на обзоре: кегль по числу лиц, подзаголовок из данных (решение 184).
 */
import { describe, expect, it } from 'vitest';
import { byId, groupById, models } from '../src/data/atlas.ts';
import { ANCESTRESS, REF_DEFAULT, refPerson, tribeKey, tribeRef } from '../src/engine/affiliation.ts';
import { laneAt, starLaneOf } from '../src/engine/stays.ts';
import { BRANCH_COLORS, TRIBE_HUES, branchColor } from '../src/render/branches.ts';
import { branchHue, branchKeysOf, branchOrTribeColor, mouthsOf, tribeHue } from '../src/render/light.ts';
import { groupSubtitle, groupTitleSize } from '../src/render/labels.ts';
import { unions } from '../src/ui/reveal.ts';

describe('колено лица для цвета света (решение 183)', () => {
  const cases: [string, string][] = [
    ['ruvim', 'leah'],
    ['leviy', 'leah'],
    ['iuda', 'leah'],
    ['david', 'leah'],
    ['aaron', 'leah'],
    ['iosif', 'rachel'],
    ['efrem', 'rachel'],
    ['veniamin', 'rachel'],
    ['saul', 'rachel'],
    ['dan', 'bilhah'],
    ['neffalim', 'bilhah'],
    ['gad', 'zilpah'],
    ['asir', 'zilpah'],
    ['liya', 'leah'],
    ['rakhil', 'rachel'],
    ['valla', 'bilhah'],
    ['zelfa', 'zilpah'],
    ['avraam', 'silver'],
    ['adam', 'silver'],
    ['isav', 'nations'],
  ];
  for (const [id, k] of cases) it(`${byId.get(id)?.name ?? id} — ${k}`, () => expect(tribeKey(id)).toBe(k));
  it('дочь Иакова — по матери: Дина — дочь Лии (Быт 30:21)', () => {
    const dina = [...byId.values()].find((q) => q.father === 'iakov' && q.mother === 'liya' && q.sex === 'f');
    expect(dina).toBeTruthy();
    expect(tribeKey(dina!.id)).toBe('leah');
  });
  it('каждое лицо получает ключ', () => {
    const keys = new Set(['leah', 'rachel', 'bilhah', 'zilpah', 'nations', 'silver']);
    for (const id of byId.keys()) expect(keys.has(tribeKey(id)), id).toBe(true);
  });
  it('оттенок света — только у четырёх колен матерей; народы и серебро — без оттенка', () => {
    expect(tribeHue('iuda', 'night')).toBe(TRIBE_HUES.night.leah);
    expect(tribeHue('iosif', 'day')).toBe(TRIBE_HUES.day.rachel);
    expect(tribeHue('isav', 'night')).toBeNull();
    expect(tribeHue('avraam', 'night')).toBeNull();
  });
});

describe('цвет ветвей опорного лица, «без перескока» (решение 183)', () => {
  it('без выбора опорное лицо — Иаков; Иаков и четыре матери — опорные для оттенков колен', () => {
    expect(refPerson(null)).toBe(REF_DEFAULT);
    expect(refPerson('david')).toBe('david');
    expect(tribeRef('iakov')).toBe(true);
    for (const m of Object.keys(ANCESTRESS)) expect(tribeRef(m), m).toBe(true);
    expect(tribeRef('david')).toBe(false);
  });
  it('ветви Иакова — оттенки колен матерей: союз с Лией — оттенок сынов Лии и т. д.', () => {
    const keys = branchKeysOf('iakov');
    expect(keys.length).toBeGreaterThanOrEqual(4);
    for (const theme of ['night', 'day'] as const)
      keys.forEach((k, i) => {
        const u = unions.byId.get(k);
        const mother = u?.b ?? null;
        expect(mother && ANCESTRESS[mother], k).toBeTruthy();
        expect(branchOrTribeColor('iakov', keys, i, theme), k).toBe(TRIBE_HUES[theme][ANCESTRESS[mother!]]);
        // без выбора (опорное — Иаков) — тот же цвет
        expect(branchHue(null, i, theme)).toBe(branchOrTribeColor('iakov', keys, i, theme));
      });
  });
  it('у матери все ветви — её оттенок', () => {
    const keys = branchKeysOf('liya');
    keys.forEach((_, i) => expect(branchOrTribeColor('liya', keys, i, 'night')).toBe(TRIBE_HUES.night.leah));
  });
  it('у прочих лиц — цвет ветви решения 69', () => {
    const keys = branchKeysOf('david');
    keys.forEach((_, i) => expect(branchOrTribeColor('david', keys, i, 'night')).toBe(branchColor(i, 'night')));
  });
  it('оттенки колен — первые четыре цвета ветвей: новых цветов в атласе нет', () => {
    for (const theme of ['night', 'day'] as const) expect(Object.values(TRIBE_HUES[theme]).sort()).toEqual(BRANCH_COLORS[theme].slice(0, 4).sort());
  });
});

describe('устья колен (решение 182, О4)', () => {
  const m = models[0];
  const mouths = mouthsOf(m);
  // «устья есть у колен — дельта от дома Иакова» снято на этапе 17 (решения 190, 191; docs/ui-review/STAGE17.md): дом Иакова
  // был свойством раскладки «Отчий дом» (173–181), небо вернулось к раскладке этапа 14, где колено начинается в своём
  // созвездии, и слой света выключен. Правило устья (ниже) проверяется по-прежнему: устья нет — основатель в середине рода
  // колено без устья — только если основатель уже стоит в середине рода: медиана полос живых лиц рода через 70 лет после
  // его рождения (окно ±60 лет) ближе 2 полос к полосе его рождения (у Иуды — коридор линий Мессии проходит через род)
  it('колено без устья — основатель уже в середине своего рода', () => {
    const groups = new Set(mouths.map((q) => q.group));
    for (const g of ['reuben', 'simeon', 'levi', 'judah', 'issachar', 'zebulun', 'dan', 'naphtali', 'gad', 'asher', 'benjamin', 'ephraim', 'manasseh']) {
      if (groups.has(g)) continue;
      const fid = groupById.get(g)!.founder!;
      const f = m.nodeByPerson.get(fid)!;
      const tEnd = f.t0 + 70;
      const lanes = m.nodes
        .filter((n) => !n.ghost && (n.trail === 'life' || n.trail === 'infant') && n.person !== fid && byId.get(n.person)?.group === g)
        .filter((n) => Math.min(n.t1, tEnd + 60) >= Math.max(n.t0, tEnd - 60))
        .map((n) => laneAt(n, (Math.max(n.t0, tEnd - 60) + Math.min(n.t1, tEnd + 60)) / 2))
        .sort((a, b) => a - b);
      if (!lanes.length) continue;
      expect(Math.abs(lanes[Math.floor(lanes.length / 2)] - starLaneOf(f)), g).toBeLessThan(2);
    }
  });
  it('каждое устье — основатель созвездия из данных, от его звезды (год рождения, полоса рождения)', () => {
    for (const q of mouths) {
      expect(groupById.get(q.group)?.founder, q.group).toBe(q.founder);
      const n = m.nodeByPerson.get(q.founder)!;
      expect(q.pts[0][0], q.group).toBe(n.t0);
      expect(q.pts[0][1], q.group).toBe(starLaneOf(n));
      // плавно (smoothstep) к середине рода: полоса монотонна
      const dir = Math.sign(q.pts[q.pts.length - 1][1] - q.pts[0][1]);
      for (let k = 1; k < q.pts.length; k++) expect(Math.sign(q.pts[k][1] - q.pts[k - 1][1]) * dir, q.group).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('названия созвездий на обзоре (решение 184)', () => {
  it('крупные созвездия — крупнее, мелкие — обычным кеглем', () => {
    expect(groupTitleSize('levi')).toBe(17);
    expect(groupTitleSize('judah')).toBe(17);
    expect(groupTitleSize('ephraim')).toBe(0);
  });
  it('подзаголовок из данных: родоначальник и число лиц', () => {
    expect(groupSubtitle('levi')).toMatch(/^родоначальник Левий; \d+\u00a0лиц[оа]?$/);
    expect(groupSubtitle('court')).toMatch(/^\d+\u00a0лиц[оа]?$/);
    expect(groupSubtitle('dan')).toBe('');
  });
});

describe('свет в вырезы кадра — полосами плиток (рецензия 3 октября: сотни рамок отсечением стоили ~10 мс кадра)', () => {
  it('полосы покрывают каждую рамку, соседние плитки строки сливаются, за холстом — обрезаны', async () => {
    const { tileRuns } = await import('../src/render/light.ts');
    const rects = [
      { x: 10, y: 10, w: 20, h: 8 },
      { x: 70, y: 12, w: 30, h: 6 },
      { x: 300, y: 130, w: 10, h: 10 },
      { x: 990, y: 500, w: 40, h: 40 },
    ];
    const runs = tileRuns(rects, 1000, 520);
    // каждая точка рамки в пределах холста — в какой-нибудь полосе (рамка на двух строках плиток — в двух полосах)
    const cover = (r: { x: number; y: number; w: number; h: number }) => {
      for (let x = r.x; x < Math.min(1000, r.x + r.w); x += 2)
        for (let y = r.y; y < Math.min(520, r.y + r.h); y += 2) if (!runs.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h)) return false;
      return true;
    };
    for (const r of rects) expect(cover(r)).toBe(true);
    // первые две рамки — плитки 0 и 1 первой строки: одна полоса
    expect(runs.filter((q) => q.y === 0)).toEqual([{ x: 0, y: 0, w: 128, h: 64 }]);
    // за краем холста полос нет
    for (const q of runs) expect(q.x + q.w <= 1000 && q.y + q.h <= 520).toBe(true);
    expect(tileRuns([], 1000, 520)).toEqual([]);
  });
});
