/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа strip (K6): полоса времени и ярусы эпох.
 * Номера 290–299.
 */
import type { Page } from 'playwright';
import { pass, fail, type Check, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 2400) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.reload();
  await p.waitForTimeout(ms);
};
/** Окно неба в годах (астр.) по полосе времени. */
const win = async (p: Page): Promise<[number, number]> => {
  const [a, b] = ((await p.locator('.strip').getAttribute('data-window')) ?? '').split(' ').map(Number);
  return [a, b];
};
/** Геометрия полосы: рамка холста и x года (астр.); поле рамки начинается ниже строк названий. */
const geo = async (p: Page) => {
  const cv = p.locator('.strip canvas');
  const box = (await cv.boundingBox())!;
  const vmin = Number(await cv.getAttribute('aria-valuemin'));
  const T0 = vmin < 0 ? vmin + 1 : vmin;
  const T1 = 2040;
  const PAD = 14;
  const xOf = (t: number) => box.x + PAD + ((t - T0) / (T1 - T0)) * (box.width - PAD * 2);
  const names = box.height >= 64 ? 30 : 16;
  return { cv, box, xOf, T0, names, field: box.y + names + (box.height - names) / 2 };
};
/** Окно эпохи для перехода (как epochWindow в TimeStrip.tsx): поля по 4 %, не меньше 10 лет; годы исторические. */
const epochWin = (start: number, end: number): [number, number] => {
  const a = start + 1;
  const b = end + 1;
  const pad = Math.max(10, (b - a) * 0.04);
  return [a - pad, b + pad];
};
const near = (x: [number, number], y: [number, number], d: number) => Math.abs(x[0] - y[0]) <= d && Math.abs(x[1] - y[1]) <= d;
const fmt = (w: [number, number]) => w.map((v) => v.toFixed(0)).join('…');
/** Окна полосы по кадрам, пока идёт действие act: [мс от начала, окно]. */
async function sample(p: Page, ms: number, act: () => Promise<void>): Promise<[number, [number, number]][]> {
  // строкой, а не функцией: сборка сценариев (tsx) добавляет к функциям помощник __name, которого нет в странице
  const rec = p.evaluate(`new Promise((res) => {
    const out = [];
    const s = performance.now();
    const tick = () => {
      out.push([performance.now() - s, document.querySelector('.strip').dataset.window || '']);
      if (performance.now() - s < ${ms}) requestAnimationFrame(tick);
      else res(out);
    };
    requestAnimationFrame(tick);
  })`) as Promise<[number, string][]>;
  rec.catch(() => undefined);
  await act();
  return (await rec).map(([t, w]) => [t, w.split(' ').map(Number) as [number, number]]);
}
/** Состояние ярусов эпох на холсте неба (src/render/tiers.ts, data-tiers). */
type TiersState = {
  col: number;
  sync: number;
  events: [number, number];
  prophets: string[];
  labeled: string[];
  formula: { text: string[]; rect: { x: number; y: number; w: number; h: number }; avoid: { x: number; y: number; w: number; h: number }[] } | null;
};
const tiers = async (p: Page): Promise<TiersState | null> => {
  const raw = await p.locator('.sky > canvas').first().getAttribute('data-tiers');
  return raw ? (JSON.parse(raw) as TiersState) : null;
};
const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const strip: Scenario[] = [
  {
    n: 290,
    title: 'IX-50: щелчок внутри рамки полосы — ничего; вне рамки — одно движение 350–450 мс к эпохе без «отдалить — приблизить»; двойной щелчок — всё небо',
    run: async (p): Promise<Check> => {
      await go(p, '#/david');
      const g = await geo(p);
      const w0 = await win(p);
      await p.mouse.click(g.xOf((w0[0] + w0[1]) / 2), g.field);
      await p.waitForTimeout(900);
      const w1 = await win(p);
      if (!near(w0, w1, 0.5)) return fail(`щелчок внутри рамки сдвинул окно: ${fmt(w0)} → ${fmt(w1)}`);
      // вне рамки — эпоха «От Потопа до Авраама» (2518–2166 гг. до Р. Х.)
      const want = epochWin(-2518, -2166);
      const rec = await sample(p, 1300, () => p.mouse.click(g.xOf(-2300), g.field));
      const moving = rec.filter(([, w], i) => i > 0 && !near(w, rec[i - 1][1], 0.01));
      if (!moving.length) return fail('щелчок вне рамки не сдвинул окно');
      const first = rec[rec.indexOf(moving[0]) - 1][0];
      const last = moving[moving.length - 1][0];
      const dur = last - first;
      const end = rec[rec.length - 1][1];
      if (!near(end, want, 2)) return fail(`окно после щелчка ${fmt(end)}, а не окно эпохи ${fmt(want)}`);
      if (dur < 320 || dur > 500) return fail(`переход длился ${dur.toFixed(0)} мс`);
      // без «отдалить — приблизить»: окно ни в какой миг не шире большего из начального и конечного
      const widest = Math.max(...rec.map(([, w]) => w[1] - w[0]));
      const limit = Math.max(w1[1] - w1[0], want[1] - want[0]) * 1.02;
      if (widest > limit) return fail(`по пути окно расширялось до ${widest.toFixed(0)} лет (предел ${limit.toFixed(0)})`);
      await p.mouse.dblclick(g.xOf(-3500), g.field);
      await p.waitForTimeout(1800);
      const [a, b] = await win(p);
      if (!(a < -3900 && b > 0)) return fail(`двойной щелчок не показал всё небо: ${a.toFixed(0)}…${b.toFixed(0)}`);
      return pass(`внутри — без движения; вне — ${dur.toFixed(0)} мс к ${fmt(end)}, шире ${limit.toFixed(0)} лет не было`);
    },
  },
  {
    n: 291,
    title: 'IX-50: нажатие вне рамки без сдвига рамку не трогает; сдвиг больше 3 px ставит середину рамки под указатель и тянет её; после отпускания перехода нет',
    run: async (p) => {
      await go(p, '#/david');
      const g = await geo(p);
      const w0 = await win(p);
      const x = g.xOf(-3000);
      await p.mouse.move(x, g.field);
      await p.mouse.down();
      await p.waitForTimeout(350);
      if (!near(await win(p), w0, 0.5)) return fail(`нажатие без сдвига переместило рамку: ${fmt(await win(p))}`);
      await p.mouse.move(x + 2, g.field);
      await p.waitForTimeout(120);
      if (!near(await win(p), w0, 0.5)) return fail('сдвиг на 2 px уже тянет рамку');
      await p.mouse.move(x + 8, g.field);
      await p.waitForTimeout(150);
      const w1 = await win(p);
      const tAt = g.T0 + ((x + 8 - g.box.x - 14) / (g.box.width - 28)) * (2040 - g.T0);
      if (Math.abs((w1[0] + w1[1]) / 2 - tAt) > (w0[1] - w0[0]) * 0.1) return fail(`после сдвига на 8 px середина рамки ${((w1[0] + w1[1]) / 2).toFixed(0)}, под указателем ${tAt.toFixed(0)}`);
      await p.mouse.move(x + 70, g.field, { steps: 6 });
      await p.mouse.up();
      await p.waitForTimeout(200);
      const w2 = await win(p);
      if (!(w2[0] > w1[0] + 100)) return fail(`протяжка не повела рамку: ${fmt(w1)} → ${fmt(w2)}`);
      if (Math.abs(w2[1] - w2[0] - (w0[1] - w0[0])) > (w0[1] - w0[0]) * 0.01) return fail(`ширина окна изменилась: ${(w0[1] - w0[0]).toFixed(0)} → ${(w2[1] - w2[0]).toFixed(0)}`);
      await p.waitForTimeout(900);
      const w3 = await win(p);
      return near(w3, w2, 0.5) ? pass(`рамка под указателем, протяжка ${fmt(w1)} → ${fmt(w2)}`) : fail(`после протяжки окно ещё двигалось: ${fmt(w2)} → ${fmt(w3)}`);
    },
  },
  {
    n: 292,
    title: 'IX-50, MAP-43: у названий эпох — курсор pointer и подсветка; щелчок по названию над рамкой — переход к эпохе; рамка не заходит на названия',
    run: async (p) => {
      await go(p, '#/david');
      const g = await geo(p);
      const nameY = g.box.y + 10;
      await p.mouse.move(g.box.x + 3, g.box.y + g.box.height - 2);
      await p.waitForTimeout(300);
      const idle = await g.cv.screenshot();
      await p.mouse.move(g.xOf(-1250), nameY);
      await p.waitForTimeout(150);
      const cursor = await g.cv.evaluate((c) => (c as HTMLElement).style.cursor);
      if (cursor !== 'pointer') return fail(`курсор над названием эпохи «${cursor}»`);
      // меридиан над полосой приходит через 250 мс — снимок раньше: отличие только от подсветки эпохи
      const hot = await g.cv.screenshot();
      if (idle.equals(hot)) return fail('наведение на название эпохи ничего не подсветило');
      // щелчок по названию над рамкой (по x — внутри рамки): переход к эпохе середины рамки, «Единое царство»
      const w0 = await win(p);
      await p.mouse.click(g.xOf((w0[0] + w0[1]) / 2), nameY);
      await p.waitForTimeout(1000);
      const w1 = await win(p);
      const want = epochWin(-1050, -931);
      if (!near(w1, want, 2)) return fail(`щелчок по названию: окно ${fmt(w1)}, а не ${fmt(want)}`);
      const labels = await p.locator('.strip').getAttribute('data-epoch-labels');
      return labels === '16/16' ? pass(`pointer, подсветка; окно ${fmt(w1)}; подписано эпох ${labels}`) : fail(`подписано эпох ${labels}`);
    },
  },
  {
    n: 293,
    title: 'MOB-06: касание полосы правее 100 г. по Р. Х. ведёт к окну около 10 г. до Р. Х. — 100 г.; на полосе — «После завершения канона лиц нет»',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/');
      const g = await geo(p);
      const note = await p.locator('.strip').getAttribute('data-canon-note');
      if (!note) return fail('на полосе нет пояснения после канона');
      await p.touchscreen.tap(g.box.x + g.box.width * 0.93, g.field);
      await p.waitForTimeout(1500);
      const w = await win(p);
      if (!near(w, [-9, 100], 2)) return fail(`окно после касания ${fmt(w)}`);
      return pass(`окно ${fmt(w)}; «${note}»`);
    },
  },
  {
    n: 294,
    title: 'MOB-49: у кнопок эпох полосы нет остановок Tab; PageDown и PageUp на ползунке — к следующей и предыдущей эпохе, aria-valuetext называет эпоху',
    run: async (p) => {
      await go(p, '#/david');
      const cv = p.locator('.strip canvas');
      const tabbable = await p.locator('.strip button').evaluateAll((bs) => bs.filter((b) => (b as HTMLElement).tabIndex >= 0).length);
      if (tabbable) return fail(`в полосе ${tabbable} кнопок с остановкой Tab`);
      await cv.focus();
      await p.keyboard.press('Tab');
      const inStrip = await p.evaluate(() => !!document.activeElement?.closest('.strip'));
      if (inStrip) return fail('Tab с ползунка остался внутри полосы');
      // кнопка эпохи в фокусе (диктор) — эпоха обведена на полосе
      const idle = await cv.screenshot();
      await p.locator('.strip button').nth(4).focus();
      await p.waitForTimeout(150);
      const lit = await cv.screenshot();
      if (idle.equals(lit)) return fail('кнопка эпохи в фокусе — на полосе ничего не отмечено');
      await cv.focus();
      await p.keyboard.press('PageDown');
      await p.waitForTimeout(800);
      const w1 = await win(p);
      const t1 = (await cv.getAttribute('aria-valuetext')) ?? '';
      if (!near(w1, epochWin(-931, -722), 2)) return fail(`PageDown: окно ${fmt(w1)}`);
      if (!/Разделённое царство/.test(t1)) return fail(`aria-valuetext: «${t1}»`);
      await p.keyboard.press('PageUp');
      await p.waitForTimeout(700);
      await p.keyboard.press('PageUp');
      await p.waitForTimeout(800);
      const w2 = await win(p);
      const t2 = (await cv.getAttribute('aria-valuetext')) ?? '';
      if (!near(w2, epochWin(-1375, -1050), 2)) return fail(`PageUp дважды: окно ${fmt(w2)}`);
      return /Судьи/.test(t2) ? pass(`«${t1}»; «${t2}»`) : fail(`aria-valuetext после PageUp: «${t2}»`);
    },
  },
  {
    n: 295,
    title: 'MOB-44: полоса времени следует за шириной окна — поворот 844 → 390 и сужение 1440 → 700',
    view: { width: 844, height: 390, touch: true },
    run: async (p) => {
      await go(p, '#/david');
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForTimeout(1200);
      const m = await p.evaluate(() => ({ inner: innerWidth, strip: document.querySelector('.strip')!.getBoundingClientRect().width, canvas: document.querySelector('.strip canvas')!.getBoundingClientRect().width }));
      if (Math.abs(m.strip - m.inner) > 1 || Math.abs(m.canvas - m.inner) > 1) return fail(`после поворота: окно ${m.inner}, полоса ${m.strip}, холст ${m.canvas}`);
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url());
        await q.waitForTimeout(2200);
        await q.setViewportSize({ width: 700, height: 900 });
        await q.waitForTimeout(1200);
        const d = await q.evaluate(() => ({ inner: innerWidth, strip: document.querySelector('.strip')!.getBoundingClientRect().width, canvas: document.querySelector('.strip canvas')!.getBoundingClientRect().width }));
        if (Math.abs(d.strip - d.inner) > 1 || Math.abs(d.canvas - d.inner) > 1) return fail(`1440 → 700: окно ${d.inner}, полоса ${d.strip}, холст ${d.canvas}`);
        return pass(`390: ${m.strip}; 700: ${d.strip}`);
      } finally {
        await ctx.close();
      }
    },
  },
  {
    n: 296,
    title: 'MAP-45, VIS-25: над столбиками флажок называет число рождений за 25 лет; над названиями — только год',
    run: async (p) => {
      await go(p, '#/david');
      const g = await geo(p);
      await p.mouse.move(g.xOf(-1500), g.box.y + g.box.height - 6);
      await p.waitForTimeout(500);
      const f1 = (await p.locator('.strip').getAttribute('data-flag')) ?? '';
      if (!/1\d{3}\s*г\.\s*до\s*Р\.\s*Х\.: .*(рожден)/.test(f1.replace(/ /g, ' '))) return fail(`флажок над столбиками: «${f1}»`);
      await p.mouse.move(g.xOf(-1500), g.box.y + 10);
      await p.waitForTimeout(200);
      const f2 = (await p.locator('.strip').getAttribute('data-flag')) ?? '';
      if (!f2 || /рожден/.test(f2)) return fail(`флажок над названиями: «${f2}»`);
      return pass(`«${f1}»; «${f2}»`);
    },
  },
  {
    n: 297,
    title: 'MAP-48: Моисей и Аарон в ярусе «Пророки»; у столбца — формула «Моисей родился после рождения Аарона»; формула не ложится на «↑ Моисей»',
    run: async (p) => {
      await go(p, '#/moisey~e1', 3200);
      const t = await tiers(p);
      if (!t) return fail('ярусы не нарисованы');
      if (!t.prophets.includes('moisey') || !t.prophets.includes('aaron')) return fail(`в «Пророках» на виду: ${t.prophets.join(', ')}`);
      if (!t.formula || !/^Моисей родился после рождения Аарона/.test(t.formula.text[0])) return fail(`формула: ${JSON.stringify(t.formula?.text)}`);
      // Моисей под ярусами: у верхнего края неба — указатель «↑ Моисей», формула обходит его
      await go(p, '#/moisey~y-1440~w160~l0~e1', 3200);
      const u = await tiers(p);
      if (!u?.formula) return fail('при Моисее за краем формулы нет');
      if (!u.formula.avoid.length) return fail('указателя у края нет — сценарий не проверяет обход');
      const hit = u.formula.avoid.find((r) => cross(r, u.formula!.rect));
      return hit ? fail(`формула ${JSON.stringify(u.formula.rect)} на указателе ${JSON.stringify(hit)}`) : pass(`${t.formula.text.join(' / ')}; обходит ${u.formula.avoid.length}`);
    },
  },
  {
    n: 298,
    title: 'MAP-47: вертикали синхронизмов между царями Иудеи и Израиля; Гофолия подписана между Иорамом и Иоасом',
    run: async (p) => {
      await go(p, '#/~y-800~w240~l0~e1', 3000);
      const t = await tiers(p);
      if (!t) return fail('ярусы не нарисованы');
      if (t.sync < 5) return fail(`синхронизмов на виду ${t.sync}`);
      if (!t.labeled.includes('gofoliya')) return fail('Гофолия без подписи');
      return t.labeled.includes('ioas-syn-okhozii') ? pass(`синхронизмов ${t.sync}; подписаны Гофолия и Иоас`) : fail('подпись Иоаса ушла');
    },
  },
  {
    n: 299,
    title: 'VIS-26: колонка названий ярусов 88 px; на обзоре — только подписанные события, без «штрихкода» рисок',
    run: async (p) => {
      await go(p, '#/~e1', 3000);
      const t = await tiers(p);
      if (!t) return fail('ярусы не нарисованы');
      if (t.col !== 88) return fail(`колонка названий ${t.col} px`);
      const [drawn, visible] = t.events;
      if (drawn < 3) return fail(`на обзоре подписано событий ${drawn}`);
      if (drawn >= visible) return fail(`на обзоре нарисованы все ${visible} событий — места для подписей всем нет`);
      await go(p, '#/david~e1', 3000);
      const u = await tiers(p);
      return u && u.events[0] >= 2 ? pass(`обзор: подписано ${drawn} из ${visible}; Давид: ${u.events[0]} из ${u.events[1]}`) : fail(`у Давида подписано событий ${u?.events[0]}`);
    },
  },
];
