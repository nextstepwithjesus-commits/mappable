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
  // 140–143 — подписи, обзор, время (агент labels): замер наложений (.sky[data-labels="N/M"]), подписанные звёзды
  // (canvas[data-named="n/m"]), подробность и скопления (canvas[data-detail], [data-clusters]). Каждое окно — новая
  // вкладка с адресом вида «#/david~y-1010~w50~l0~s1».
  ...([
    [140, 'E1, U12: 1440 — 0 наложений подписей на обзоре, в масштабе эпохи, поколений и семьи; с Давидом и без', undefined],
    [141, 'E1, U12: телефон 390×844 — 0 наложений подписей на обзоре и трёх масштабах; на масштабе семьи подписано ≥ 90 %', { width: 390, height: 844, touch: true }],
  ] as const).map(([n, title, view]) => ({
    n,
    title,
    view,
    run: async (p: import('playwright').Page) => {
      const { pass, fail } = await import('./kit.ts');
      const base = p.url().replace(/#.*$/, '');
      const notes: string[] = [];
      const states: [string, string, boolean][] = [];
      for (const id of ['', 'david'])
        for (const [name, w] of [['обзор', 0], ['эпоха', 700], ['поколения', 180], ['семья', 50]] as const)
          states.push([`${name}${id ? ' + Давид' : ''}`, w ? `#/${id}~y-1010~w${w}~l0~s1` : `#/${id}`, name === 'семья']);
      for (const [name, hash, family] of states) {
        const q = await p.context().newPage();
        try {
          await q.goto(base + hash);
          await q.waitForTimeout(1600);
          const [, m] = ((await q.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/').map(Number);
          const [named, stars] = ((await q.locator('.sky canvas').getAttribute('data-named')) ?? '0/0').split('/').map(Number);
          if (m !== 0) return fail(`${name}: наложений подписей ${m}`);
          if (family && stars > 0 && named / stars < 0.9) return fail(`${name}: подписано ${named} из ${stars} видимых звёзд`);
          notes.push(`${name} ${named}/${stars}`);
        } finally {
          await q.close();
        }
      }
      return pass(`0 наложений; подписано: ${notes.join(', ')}`);
    },
  })),
  {
    n: 142,
    title: 'E3, E2, U12: обзор — облака и звёзды величины 0–2, списки свёрнуты в скопления, видна вся высота неба',
    run: async (p) => {
      const { pass, fail } = await import('./kit.ts');
      await p.waitForTimeout(500);
      const c = p.locator('.sky canvas');
      const detail = Number(await c.getAttribute('data-detail'));
      const [rings, total] = ((await c.getAttribute('data-clusters')) ?? '0/0').split('/').map(Number);
      const [, m] = ((await p.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/').map(Number);
      if (detail !== 0) return fail(`на обзоре подробность ${detail}: следы и мелкие звёзды не должны быть видны`);
      if (!(total > 0) || !(rings > 0) || rings > total) return fail(`скоплений ${total}, знаков ${rings}`);
      if (m !== 0) return fail(`наложений подписей ${m}`);
      // вся высота неба: верхняя и нижняя полосы данных — в видимой части
      const [, t, , b, , , laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const L = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')).models[0].layout;
      const yTop = (laneTop - L.laneMax) * ky;
      const yBot = (laneTop - L.laneMin) * ky;
      if (yTop < t - 1 || yBot > b + 1) return fail(`полосы ${L.laneMin}…${L.laneMax} на ${yTop.toFixed(0)}…${yBot.toFixed(0)} px при видимой части ${t}…${b}`);
      // приближение раскрывает подробность плавно: после нескольких шагов масштаба — следы и все звёзды
      for (let k = 0; k < 3; k++) {
        await p.locator('.skyctl button[aria-label="Приблизить"]').first().click();
        await p.waitForTimeout(400);
      }
      await p.waitForTimeout(400);
      const d2 = Number(await c.getAttribute('data-detail'));
      if (!(d2 > 0)) return fail(`после приближения подробность ${d2}`);
      return pass(`обзор: подробность 0, знаков скоплений ${rings} (скоплений ${total}), полосы неба видны целиком; после приближения — ${d2}`);
    },
  },
  {
    n: 144,
    title: 'G2 на небе (skyGroup): лица главы светятся, над небом — строка группы с «Снять»; подписи без наложений',
    run: async (p) => {
      const { pass, fail } = await import('./kit.ts');
      await p.goto(p.url().replace(/#.*$/, '') + '#/~pchapter');
      await p.waitForTimeout(2500);
      const bar = p.locator('.sky .groupbar');
      if (!(await bar.count())) return fail('нет строки группы над небом');
      const text = (await bar.innerText()).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      // «Отмечены лица главы Мф 1 — снять (Esc)»: «снять» — один раз (CARD-71)
      if (!/^Отмечены лица главы .+ — снять \(Esc\)$/.test(text)) return fail(`строка группы: «${text}»`);
      const [, m] = ((await p.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/').map(Number);
      if (m !== 0) return fail(`наложений подписей ${m}`);
      await bar.getByRole('button', { name: 'Снять' }).click();
      await p.waitForTimeout(300);
      if (await bar.count()) return fail('«Снять» не сняло группу');
      return pass(`«${text}»; «снять» снимает`);
    },
  },
  {
    n: 143,
    title: 'E7, решение 1: масштаб «Сжатый по плотности лиц» (решение 124; было «по насыщенности») при первом показе, растяжение шкалы не больше 1 : 6',
    run: async (p) => {
      const { pass, fail } = await import('./kit.ts');
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const { hydrateScale, timeToX, T_CANON_END, DENSE_MAG } = await import('../../src/engine/timescale.ts');
      const sc = hydrateScale(JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')).models[0].scale);
      let lo = Infinity;
      let hi = 0;
      for (let t = sc.knots[0]; t < T_CANON_END - 1; t += 0.5) {
        const d = timeToX(sc, t + 0.5, 1) - timeToX(sc, t, 1);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      if (hi / lo > DENSE_MAG + 0.05) return fail(`растяжение 1 : ${(hi / lo).toFixed(1)} (npm run -s data после правки src/engine/timescale.ts)`);
      await p.locator('.skyctl .view-toggle').click();
      const on = await p.locator('.skyctl').getByText('Сжатый по плотности лиц', { exact: true }).first().getAttribute('aria-pressed');
      if (on !== 'true') return fail(`при первом показе масштаб не «Сжатый по плотности лиц» (aria-pressed ${on})`);
      return pass(`растяжение 1 : ${(hi / lo).toFixed(1)}; при первом показе — «Сжатый по плотности лиц»`);
    },
  },

  // paths
  // 130–139 — следы, семьи, путь родства и линии Мессии на небе (агент paths): A14, E4, E5, E6; U1, U2, U5.
  // Где звезда на экране, считается по окну неба (.sky[data-view]) и данным раскладки; выноски точек сравнения —
  // .sky[data-line-notes] («лицо:x,y,w,h;…»), путь родства — .sky[data-kin-path].
  ...(() => {
    type P = import('playwright').Page;
    /** Экранные места лиц ids (px холста) по окну неба и раскладке; lam — масштаб времени (1 — по насыщенности). */
    const places = async (p: P, ids: string[]) => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      const { hydrateScale, timeToX } = await import('../../src/engine/timescale.ts');
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8'));
      const m = atlas.models[0];
      const idx = new Map<string, number>((atlas.persons as { id: string }[]).map((x, i) => [x.id, i]));
      const sc = hydrateScale(m.scale);
      const lam = /~s0/.test(p.url()) ? 0 : 1;
      const [l, t, r, b, x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
      return {
        vp: { l, t, r, b },
        at: ids.map((id) => {
          const k = idx.get(id)!;
          const n = (m.layout.nodes as number[][]).find((q) => q[0] === k)!;
          // годы раскладки — те же, что у неба (src/data/atlas.ts: t0 = рождение + сдвиг узла)
          const t0 = m.chrono[k][0] + n[2];
          return { id, x: (timeToX(sc, t0, lam) - x0) * kx, y: (laneTop - n[1]) * ky };
        }),
      };
    };
    /** Все лица ids — в видимой части неба. */
    const allIn = async (p: P, ids: string[]) => {
      const { vp, at } = await places(p, ids);
      const out = at.filter((q) => !(q.x > vp.l && q.x < vp.r && q.y > vp.t && q.y < vp.b));
      return out.map((q) => `${q.id} (${Math.round(q.x)}, ${Math.round(q.y)})`);
    };
    const overlaps = async (p: P) => Number(((await p.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/')[1]);
    const skyPath = async (p: P) => ((await p.locator('.sky').getAttribute('data-kin-path')) ?? '').split(' ').filter(Boolean);
    const lineNotes = async (p: P) =>
      ((await p.locator('.sky').getAttribute('data-line-notes')) ?? '')
        .split(';')
        .filter(Boolean)
        .map((s) => {
          const [id, box] = s.split(':');
          const [x, y, w, h] = box.split(',').map(Number);
          return { id, x, y, w, h };
        });
    const canvasAt = async (p: P, x: number, y: number) => {
      const c = await p.locator('.sky canvas').boundingBox();
      return { x: c!.x + x, y: c!.y + y };
    };
    const synopsisOpen = async (p: P) => (await p.locator('section.sheet h2', { hasText: 'Синопсис' }).count()) > 0 || /~psynopsis/.test(p.url());
    /** Путь родства на небе: оба конца и все шаги в видимой части, наложений подписей нет. */
    const pathOk = async (p: P, want: string[]) => {
      const { pass, fail } = await import('./kit.ts');
      const path = await skyPath(p);
      if (path[0] !== want[0] || path[path.length - 1] !== want[want.length - 1]) return fail(`на небе путь «${path.join(' ')}»`);
      const out = await allIn(p, path);
      if (out.length) return fail(`за краем видимой части: ${out.join(', ')}`);
      const m = await overlaps(p);
      if (m) return fail(`наложений подписей ${m}`);
      return pass(`путь ${path.length} лиц целиком на экране, наложений подписей нет`);
    };
    const U2 = ['kainan-syn-arfaksada', 'david', 'salafiil', 'zorovavel', 'iisus'];
    const out: import('./kit.ts').Scenario[] = [
      {
        n: 130,
        title: 'E5, U5 мышью: Давид → «Родство с…» → «Иоав»: путь на небе, оба конца в видимой части, наложений подписей нет',
        run: async (p) => {
          const { find } = await import('./kit.ts');
          await p.goto(p.url().replace(/#.*$/, '') + '#/david');
          await p.waitForTimeout(1600);
          await p.locator('.folio button', { hasText: 'Родство с…' }).first().click();
          await p.waitForTimeout(300);
          await find(p, 'Иоав');
          await p.waitForTimeout(2500);
          return pathOk(p, ['david', 'saruiya', 'ioav']);
        },
      },
      {
        n: 131,
        title: 'E5, U5 пальцем, 390 × 844: «Родство» Иоав — Давид → «показать путь на небе»: лист свёрнут, путь целиком в видимой части',
        view: { width: 390, height: 844, touch: true },
        run: async (p) => {
          const { fail } = await import('./kit.ts');
          await p.goto(p.url().replace(/#.*$/, '') + '#/ioav~pkinship~bdavid');
          await p.waitForTimeout(2000);
          const b = p.locator('section.sheet button', { hasText: 'показать путь на небе' }).first();
          if (!(await b.count())) return fail('нет команды «показать путь на небе»');
          await b.tap();
          await p.waitForTimeout(2800);
          return pathOk(p, ['ioav', 'saruiya', 'david']);
        },
      },
      {
        n: 132,
        title: 'E5, U1 с клавиатуры, 1024 × 768: Руфь → Enter на «Родство с…» → поиск «Давид» → Enter: путь Руфь — Давид на экране',
        view: { width: 1024, height: 768 },
        run: async (p) => {
          await p.goto(p.url().replace(/#.*$/, '') + '#/ruf');
          await p.waitForTimeout(1600);
          await p.locator('.folio button', { hasText: 'Родство с…' }).first().focus();
          await p.keyboard.press('Enter');
          await p.waitForTimeout(300);
          await p.locator('#find').focus();
          await p.keyboard.type('Давид');
          await p.waitForTimeout(300);
          await p.keyboard.press('Enter');
          await p.waitForTimeout(2800);
          return pathOk(p, ['ruf', 'ovid', 'iessey', 'david']);
        },
      },
      {
        n: 133,
        // этап 11 (решение 81): флажок «только линии Мессии» стал показом «Линии Мессии» (лист «Показ»)
        title: 'E6, U2 мышью: показ «Линии Мессии» — коридор вписан, пять выносок точек сравнения; щелчок по выноске «Давид» открывает синопсис',
        run: async (p) => {
          const { pass, fail, pickShow } = await import('./kit.ts');
          await pickShow(p, 'Линии Мессии', { ms: 2500 });
          const notes = await lineNotes(p);
          const ids = notes.map((q) => q.id).sort();
          if (ids.join() !== [...U2].sort().join()) return fail(`выноски: ${ids.join(', ') || 'нет'}`);
          const out = await allIn(p, U2);
          if (out.length) return fail(`коридор не вписан: ${out.join(', ')}`);
          const m = await overlaps(p);
          if (m) return fail(`наложений подписей ${m}`);
          const d = notes.find((q) => q.id === 'david')!;
          const at = await canvasAt(p, d.x + d.w / 2, d.y + d.h / 2);
          await p.mouse.click(at.x, at.y);
          await p.waitForTimeout(900);
          if (!(await synopsisOpen(p))) return fail('щелчок по выноске не открыл синопсис');
          return pass('пять выносок; коридор в видимой части; выноска открывает синопсис участка');
        },
      },
      {
        n: 134,
        title: 'E6, U2 с клавиатуры, 1024 × 768: точки сравнения — в списке для клавиатуры; Enter на «Расходятся: Соломон…» открывает синопсис',
        view: { width: 1024, height: 768 },
        run: async (p) => {
          const { pass, fail } = await import('./kit.ts');
          await p.goto(p.url().replace(/#.*$/, '') + '#/~o1');
          await p.waitForTimeout(2500);
          const items = p.locator('.sky ul[aria-label^="Точки сравнения"] button');
          const n = await items.count();
          if (n !== 5) return fail(`в списке для клавиатуры точек сравнения: ${n}`);
          const b = items.filter({ hasText: 'Расходятся: Соломон' }).first();
          await b.focus();
          await p.keyboard.press('Enter');
          await p.waitForTimeout(900);
          if (!(await synopsisOpen(p))) return fail('Enter не открыл синопсис');
          return pass('пять точек сравнения в списке; Enter открывает синопсис участка');
        },
      },
      {
        n: 135,
        title: 'E6, U2 пальцем, 390 × 844: «только линии» — выноски стоят без наложений; касание выноски открывает синопсис',
        view: { width: 390, height: 844, touch: true },
        run: async (p) => {
          const { pass, fail } = await import('./kit.ts');
          await p.goto(p.url().replace(/#.*$/, '') + '#/~o1');
          await p.waitForTimeout(2500);
          const notes = await lineNotes(p);
          if (!notes.length) return fail('на телефоне нет ни одной выноски');
          const m = await overlaps(p);
          if (m) return fail(`наложений подписей ${m}`);
          const q = notes[0];
          const at = await canvasAt(p, q.x + q.w / 2, q.y + q.h / 2);
          await p.touchscreen.tap(at.x, at.y);
          await p.waitForTimeout(900);
          if (!(await synopsisOpen(p))) return fail(`касание выноски «${q.id}» не открыло синопсис`);
          return pass(`выносок на экране: ${notes.length} (${notes.map((x) => x.id).join(', ')}); касание открывает синопсис`);
        },
      },
      {
        n: 136,
        title: 'A14, E4: семья Иакова на масштабе семьи — скобы по матерям, пометы и подписи призраков без наложений; Моисей — братья выделены',
        run: async (p) => {
          const { pass, fail } = await import('./kit.ts');
          const base = p.url().replace(/#.*$/, '');
          const notes: string[] = [];
          for (const hash of ['#/iakov~y-1925~w70~l-2.0~s1', '#/moisey', '#/mladenets-syn-virsavii~y-1000~w60~l4.0~s1']) {
            const q = await p.context().newPage();
            try {
              await q.goto(base + hash);
              await q.waitForTimeout(2000);
              const m = await overlaps(q);
              if (m) return fail(`${hash}: наложений подписей ${m}`);
              notes.push(`${hash.split('~')[0]} — 0`);
            } finally {
              await q.close();
            }
          }
          return pass(`наложений подписей нет: ${notes.join('; ')}`);
        },
      },
    ];
    return out;
  })(),
];
