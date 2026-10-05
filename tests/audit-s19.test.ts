/**
 * Этап 19 (docs/ui-review/STAGE19.md): значимые замечания внешнего аудита 5 октября, проверенные по коду и данным.
 *  — К-03: пояснение под строкой карточки, сообщающее своё сведение при тех же стихах, не пропадает («Сирота…»
 *    у Есфири, смерть жены Иуды); пересказ строки («Брат его Гелем») по-прежнему опускается;
 *  — К-01: группа родни одного слова, но разной достоверности, не теряет помету («Брат: Иуда» — толк., Иуд 1:1);
 *  — А-01: свойство через брата или сестру супруга несёт худшую достоверность обоих звеньев («по толкованию»);
 *  — Х-02: «наверняка современники» — по раннему краю смерти, а не по её оценке;
 *  — Б-07: порядок брака (order) доходит из данных до союзов в браузере (Мелхола: Давид, затем Фалтий).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { cardSections } from './helpers/cards.ts';
import { graph, models } from '../src/data/atlas.ts';
import { relate } from '../src/engine/kinship.ts';
import { contemporaries } from '../src/engine/chronology.ts';
import { unions } from '../src/ui/reveal.ts';
import { saysMore } from '../src/ui/card/sections.tsx';

const cards = new Map<string, Map<number, string>>();
const sec = (id: string, n: number) => cards.get(id)?.get(n) ?? '';
/** Текст раздела без пробелов перед знаками и с обычными пробелами (как в tests/card-text.test.ts). */
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+([;,.:)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+/g, ' ').trim();

beforeAll(async () => {
  const { loadCard, persons } = await import('../src/data/atlas.ts');
  await Promise.all(persons.map((p) => loadCard(p.id)));
  for (const id of ['esfir', 'iuda', 'iakov', 'lotan', 'shomer-syn-khevera', 'iakov-brat-gospoden', 'ezekiya', 'david']) cards.set(id, new Map([...(await cardSections(id))].map(([n, t]) => [n, norm(t)])));
}, 300_000);

describe('К-03: пояснение со своим сведением не пропадает', () => {
  it('Есфирь § 6 — «Сирота»; Иуда § 9 — смерть жены; Иаков § 9 — «Любил Рахиль больше»', () => {
    expect(sec('esfir', 6)).toMatch(/Сирота: «не было у нее ни отца, ни матери»/);
    expect(sec('iuda', 9)).toMatch(/она умерла, когда «прошло много времени»/);
    expect(sec('iakov', 9)).toMatch(/Любил Рахиль больше, нежели Лию/);
    // «Жена не названа» под строкой «Хефциба — мать Манассии» — сведение, а не повтор
    expect(sec('ezekiya', 9)).toMatch(/Жена не названа/);
  });
  it('пересказ строки по-прежнему опускается: «А сестра у Лотана: Фамна», «Брат его Гелем»', () => {
    expect(sec('lotan', 11)).not.toMatch(/А сестра у Лотана/);
    expect(sec('shomer-syn-khevera', 11)).not.toMatch(/Брат его Гелем/);
    expect(saysMore('Брат его Гелем', ['gelem'], 'брат')).toBe(false);
    expect(saysMore('Жена не названа', ['khefsiba'], 'мать')).toBe(true);
  });
  it('слово строки в кавычках — повтор: «Ионафан, „дядя Давидов“, — советник…» → «Советник, человек умный и писец»', () => {
    expect(sec('david', 12)).toMatch(/Советник, человек умный и писец/);
    expect(sec('david', 12)).not.toMatch(/«дядя Давидов»/);
  });
});

describe('К-01: помета у каждой подгруппы родни', () => {
  it('Иаков, брат Господень, § 11: «Брат: Иуда Иуд 1:1 толк.» отдельно от «Брат: Иисус Христос»', () => {
    expect(sec('iakov-brat-gospoden', 11)).toMatch(/Брат: Иуда Иуд 1:1 толк\./);
    expect(sec('iakov-brat-gospoden', 11)).toMatch(/Брат: Иисус Христос Мф 13:55/);
  });
});

describe('А-01: свойство через брата супруга — с толкованием звена', () => {
  it('«Моисей — муж Сепфоры, сестры Ховава» — по толкованию', () => {
    const s = relate(graph, 'moisey', 'khovav').map((r) => r.sentence).find((x) => /сестры Ховава/.test(x));
    expect(s).toBeTruthy();
    expect(s).toMatch(/по толкованию/);
  });
});

describe('Х-02: «наверняка» — по раннему краю смерти', () => {
  it('Наассон и Раав — не «наверняка» (смерть Наассона около −1410, ранний край −1444; Раав родилась −1439…−1425)', () => {
    const m = models[0];
    const res = { model: m.id as never, persons: new Map([...m.chrono].map(([id, c]) => [id, { ...c, lastAttested: c.last }])), tensions: m.tensions } as never;
    const raav = contemporaries(res, 'naasson', 400).find((x) => x.id === 'raav');
    if (raav) expect(raav.sure).toBe(false);
  });
});

describe('Б-07: порядок брака из данных', () => {
  it('Мелхола: первый союз — с Давидом, затем с Фалтием', () => {
    const own = (unions.of.get('melkhola') ?? []).filter((u) => u.a && u.b).map((u) => u.a);
    expect(own.indexOf('david')).toBeGreaterThanOrEqual(0);
    expect(own.indexOf('david')).toBeLessThan(own.indexOf('faltiy-syn-laisha'));
  });
});

describe('В-02: в показе «линии Мессии» нить проходит через звёзды и при растянутых строках', () => {
  // допуск — как у Ч5 переписи (tools/census.ts: полстроки и амплитуда косы), но не больше 20 px при любой пропорции строк
  it('строки ×1, ×1,5 и ×2: каждое лицо линии не дальше 20 px от своей нити (было до 77 px у Езекии при ×1,5)', async () => {
    const C = await import('../tools/census.ts');
    const ribbons = await import('../src/render/ribbons.ts');
    const { lines } = await import('../src/data/atlas.ts');
    const { distSeg } = await import('../src/render/links.ts');
    for (const k of [1, 1.5, 2]) {
      const f = C.capture('lines');
      f.s.cam.setLanes(k);
      C.frameOf(C.SCENES.lines, f.s, 1, 1440);
      const s = f.s;
      const rc = ribbons.ribbonStrands(s, { lineFlip: false, onlyLines: true } as never, { joseph: lines.joseph.persons, mary: lines.mary.persons });
      const tol = Math.min(s.cam.ky * 0.5, 14) + 6;
      const far: string[] = [];
      for (const st of rc.strands) {
        for (const pid of st.ids) {
          const i = s.indexOf(pid);
          if (i === undefined || s.hides(pid)) continue;
          const x = s.cam.sx(s.X0[i]);
          const y = s.cam.sy(s.nodes[i].lane);
          if (x < 0 || x > s.cam.w || y < 0 || y > s.cam.h) continue;
          // тесные поколения (соседи на нити ближе 24 px, ТЗ § 3.2) — по сглаженной линии без ряби: допуск — строка
          const k = st.ids.indexOf(pid);
          const nx = (q: string | undefined) => (q && s.indexOf(q) !== undefined ? s.cam.sx(s.X0[s.indexOf(q)!]) : null);
          const gaps = [nx(st.ids[k - 1]), nx(st.ids[k + 1])].filter((g): g is number => g !== null).map((g) => Math.abs(g - x));
          const lim = gaps.length && Math.min(...gaps) < ribbons.RIPPLE_PX ? s.cam.ky + 6 : tol;
          let best = Infinity;
          const P = st.points;
          for (let q = 0; q + 1 < P.length; q++) best = Math.min(best, distSeg(x, y, P[q].x + rc.dx, P[q].y + rc.dy, P[q + 1].x + rc.dx, P[q + 1].y + rc.dy));
          if (best > lim) far.push(`${pid} ${Math.round(best)} px`);
        }
      }
      expect(far, `строки ×${k}`).toEqual([]);
    }
  }, 120_000);
});

describe('В-03: прозрачность к готовому rgba', () => {
  it('alpha(alpha(c, .75), 1) — допустимый цвет холста, прозрачности перемножаются', async () => {
    const { alpha } = await import('../src/render/color.ts');
    expect(alpha('rgba(23,34,56,0.75)', 1)).toBe('rgba(23,34,56,0.75)');
    expect(alpha(alpha('#172238', 0.75), 0.5)).toBe('rgba(23,34,56,0.375)');
    expect(alpha('rgb(1,2,3)', 0.5)).toBe('rgba(1,2,3,0.5)');
  });
});

describe('В-01: веер союзов Давида — у каждой дорожки своя высота', () => {
  it('десять союзов Давида: дорожки на разной высоте, ни одна не легла на другую', async () => {
    const C = await import('../tools/census.ts');
    const trails = await import('../src/render/trails.ts');
    const f = C.captureView('all', { person: 'david' }, { select: 'david' });
    const hits = trails.unionFanHits(f.s);
    expect(hits.length).toBeGreaterThanOrEqual(8);
    const ys = hits.map((h) => Math.round(h.pts[3] * 4));
    expect(new Set(ys).size, hits.map((h) => `${h.union}:${h.pts[3]}`).join(' ')).toBe(ys.length);
  }, 120_000);
});

describe('П-02: неизменное выделение — тот же объект', () => {
  it('группа панели и путь родства: повторный вызов highlightFor отдаёт тот же объект (кэш сдвига узнаёт его)', async () => {
    const { highlightFor } = await import('../src/render/marks.ts');
    const g = ['avraam', 'isaak', 'iakov'];
    expect(highlightFor('avraam', null, [...g])).toBe(highlightFor('avraam', null, [...g]));
    const path = ['ioav', 'saruiya', 'david'];
    expect(highlightFor('ioav', [...path])).toBe(highlightFor('ioav', [...path]));
    expect(highlightFor('ioav', ['ioav', 'david'])).not.toBe(highlightFor('ioav', [...path]));
  });
});

describe('Н-04: окно уходящей записи', () => {
  it('withView меняет только поля окна y, w, l и сохраняет остальные поля записи', async () => {
    const { withView } = await import('../src/ui/address.ts');
    expect(withView('#/david~y-1010~w240~l2.5~h1.5~pepochs', { year: -1000, width: 120.4, lane: 3.04 })).toBe('#/david~y-1000~w120~l3.0~h1.5~pepochs');
    expect(withView('#/david', { year: -1000, width: 120, lane: -3 })).toBe('#/david~y-1000~w120~l-3.0');
  });
});

describe('Х-07: якорь Соломона и Исход согласованы', () => {
  it('4-й год Соломона (data/anchors.json) − 479 лет (3 Цар 6:1) = Исход решателя', async () => {
    const { readFileSync } = await import('node:fs');
    const anchors = JSON.parse(readFileSync('data/anchors.json', 'utf8')).anchors as { id: string; value: number }[];
    const sol = anchors.find((a) => a.id === 'solomon-4')!;
    const { EXODUS_HIST } = await import('../src/engine/chronology.ts');
    expect(sol.value - 479).toBe(EXODUS_HIST);
  });
});
