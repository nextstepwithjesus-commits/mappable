/**
 * Сценарии приёмки этапа 4 «Небо как карта». Номера 130–149.
 * Файл общий для трёх агентов — у каждого свой блок; правки только точечными вставками в свой блок.
 */
import type { Scenario } from './kit.ts';

export const map: Scenario[] = [
  // data
  // 146–149 — данные неба (агент data): скопления, честные следы, контуры, координаты и синхронизмы.
  // Проверки читают собранный индекс (npm run -s data) и живое небо; импорты — внутри, чтобы не трогать общую шапку файла.
  {
    n: 146,
    title: 'E2, U12: списки без родства — скопления без следов; небо ниже, обзор вписывает его крупнее',
    run: async (p) => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const { pass, fail } = await import('./kit.ts');
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8'));
      const lists = JSON.parse(readFileSync(join(ROOT, 'data/lists.json'), 'utf8')).lists as { id: string }[];
      const L = atlas.models[0].layout;
      const clusters = L.blocks.filter((b: { cluster?: unknown }) => b.cluster) as { id: number; laneMin: number; laneMax: number; cluster: { list: string; name: string; count: number; members: string[] } }[];
      const heroes = clusters.find((b) => b.cluster.list === 'heroes-david');
      if (!heroes) return fail('нет скопления «Храбрые Давида»');
      if (clusters.length < lists.length - 2) return fail(`скоплений ${clusters.length} из ${lists.length} списков`);
      // у лиц скоплений нет следа: t1 − t0 = 0, след «list» (код 3)
      const inCl = new Set(clusters.map((b) => b.id));
      const bad = (L.nodes as number[][]).filter((n) => inCl.has(n[4]) && (n[3] !== 0 || n[9] !== 3));
      if (bad.length) return fail(`у ${bad.length} лиц скоплений есть след`);
      const tall = clusters.filter((b) => b.laneMax - b.laneMin > 5);
      if (tall.length) return fail(`скопление выше 6 полос: ${tall.map((b) => b.cluster.list).join(', ')}`);
      if (L.laneMax - L.laneMin + 1 > 345) return fail(`полос неба ${L.laneMax - L.laneMin + 1} (было 489)`);
      // живое небо: «всё небо» при первом показе — полоса неба не тоньше, чем позволяет высота холста при 345 полосах
      await p.waitForTimeout(500);
      const [, t, , b, , , , ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
      if (!(ky >= (b - t) / 345 - 0.05)) return fail(`на обзоре полоса ${ky} px при высоте ${b - t}`);
      return pass(`скоплений: ${clusters.length}; «${heroes.cluster.name}» — имён: ${heroes.cluster.count}; полос неба: ${L.laneMax - L.laneMin + 1}; на обзоре ${ky.toFixed(2)} px на полосу`);
    },
  },
  {
    n: 147,
    title: 'A14, A15: честные даты — без условного следа, народы без следа, жёны не в год мужа',
    run: async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const { pass, fail } = await import('./kit.ts');
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8'));
      const idx = new Map<string, number>((atlas.persons as { id: string }[]).map((x, i) => [x.id, i]));
      const m = atlas.models[0];
      const node = (id: string) => (m.layout.nodes as number[][]).find((n) => n[0] === idx.get(id))!;
      const b = (id: string) => m.chrono[idx.get(id)!][0] as number;
      // сын Давида и Вирсавии, умерший младенцем: сплошного следа нет (было 33 года)
      const baby = node('mladenets-syn-virsavii');
      if (baby[3] > 1) return fail(`у младенца след ${baby[3]} лет`);
      // народ таблицы народов: без следа, код «people»
      const ludim = node('ludim');
      if (ludim[3] !== 0 || ludim[9] !== 1) return fail(`у Лудима след ${ludim[3]} лет, код ${ludim[9]}`);
      // лицо без смерти и событий: без условных 30 лет
      const stubs = (m.layout.nodes as number[][]).filter((n) => n[0] >= 0 && n[9] === 0 && m.chrono[n[0]][3] === null && m.chrono[n[0]][4] === null);
      const long = stubs.filter((n) => n[3] > 0);
      if (long.length) return fail(`${long.length} следов без смерти и событий`);
      // жёны Иакова — не ровесницы мужа
      const gap = Math.min(b('liya'), b('rakhil')) - b('iakov');
      if (gap < 20) return fail(`Лия и Рахиль моложе Иакова только на ${gap} лет`);
      return pass(`младенец без следа; народы без следа; лиц без условного следа: ${stubs.length}; Лия и Рахиль моложе Иакова не меньше чем на ${gap} г.`);
    },
  },
  {
    n: 148,
    title: 'E8: один сглаженный контур на связную часть созвездия, с местом под название',
    run: async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const { pass, fail } = await import('./kit.ts');
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8'));
      const L = atlas.models[0].layout;
      const O = (L.outlines ?? []) as { g: string; p?: string; n: number; r: number[][]; s: number[][] }[];
      if (O.length < 40) return fail(`контуров ${O.length}`);
      const blocks3 = (L.blocks as { size: number; cluster?: unknown }[]).filter((x) => !x.cluster && x.size >= 3).length;
      if (O.length >= blocks3) return fail(`контуров ${O.length} при ${blocks3} притоках: не по созвездиям`);
      if (O.some((o) => !o.r.length || o.r.some((ring) => ring.length < 8))) return fail('пустое или вырожденное кольцо');
      if (!O.some((o) => o.g === 'davidic' && o.p === 'judah')) return fail('нет вложенного контура «Дом Давидов» в «Колене Иудином»');
      const withSlot = O.filter((o) => o.s.length).length;
      return pass(`контуров: ${O.length} (притоков от 3 лиц: ${blocks3}); с местом под название: ${withSlot}`);
    },
  },
  {
    n: 149,
    title: 'E9, MAP-47: атласная координата — столбец и буква от оси; синхронизмы царей со стихами',
    run: async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const { pass, fail } = await import('./kit.ts');
      const { atlasCoord, atlasRow, ATLAS_LETTERS } = await import('../../src/engine/layout.ts');
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8'));
      const idx = new Map<string, number>((atlas.persons as { id: string }[]).map((x, i) => [x.id, i]));
      const m = atlas.models[0];
      const L = m.layout;
      if (atlasRow(L.laneMax) < 0 || atlasRow(L.laneMin) >= ATLAS_LETTERS.length) return fail(`полосы ${L.laneMin}…${L.laneMax} не помещаются в буквы`);
      const d = (L.nodes as number[][]).find((n) => n[0] === idx.get('david'))!;
      const coord = atlasCoord(m.chrono[d[0]][0] + d[2], d[1]);
      if (coord !== '32 П') return fail(`Давид — «${coord}», ожидалось «32 П»`);
      const aviya = atlas.persons[idx.get('aviya')!];
      const s = aviya.reign?.[0]?.sync?.[0];
      if (!s || s.with !== 'ieroboam' || s.year !== 18 || !s.refs.includes('3Цар 15:1')) return fail(`синхронизм Авии: ${JSON.stringify(s)}`);
      const n = (atlas.persons as { reign?: { sync?: unknown[] }[] }[]).reduce((a, x) => a + (x.reign ?? []).reduce((q, r) => q + (r.sync?.length ?? 0), 0), 0);
      if (n < 30) return fail(`синхронизмов в индексе ${n}`);
      return pass(`Давид — ${coord}; синхронизмов в индексе: ${n}; «в 18-й год Иеровоама воцарился Авия (3 Цар 15:1)»`);
    },
  },

  // labels

  // paths
];
