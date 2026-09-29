/**
 * Сценарии приёмки: доводка неба «набор» после решения 76 (задача P3), группа polish6: номера 700–719 — «Всё небо»
 * вписывает раскрытое, помета порядка не на линиях к детям, большая семья читается (точки между супругами, не вплотную,
 * жёны подписаны), карточка у точки не закрывает своей семьи, справка — о точке союза. Небо «все лица» — как прежде.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };

type Scene = { work: string[]; opened?: string[]; expanded?: Record<string, string>; hash: string; start?: string; theme?: 'night' | 'day'; mode?: 'work' | 'all' };

/** Небо в заданном состоянии раскрытия (src/ui/reveal.ts, src/ui/work.ts): набор, лица с показанными союзами, раскрытые союзы. */
async function setup(p: Page, o: Scene) {
  await p.evaluate((o) => {
    localStorage.setItem('toledot:intro', 'true');
    localStorage.setItem('toledot:view', JSON.stringify('sky'));
    localStorage.setItem('toledot:start', JSON.stringify(o.start ?? 'adam'));
    if (o.theme) localStorage.setItem('toledot:theme', JSON.stringify(o.theme));
    localStorage.setItem('toledot:work', JSON.stringify(o.work.map((id, i) => [id, { via: i ? 'family' : 'self', of: o.work[0] }])));
    localStorage.setItem('toledot:reveal', JSON.stringify({ opened: o.opened ?? [], expanded: o.expanded ?? {} }));
    sessionStorage.setItem('toledot:skymode', JSON.stringify(o.mode ?? 'work'));
  }, o);
  await p.goto(p.url().replace(/#.*$/, '') + o.hash);
  await p.reload();
  await p.waitForTimeout(2600);
}

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
const canvasData = (p: Page) => p.evaluate(() => ({ ...(document.querySelector('.sky canvas') as HTMLCanvasElement).dataset }) as Record<string, string>);
/** Звезда лица в последнем кадре неба «набор» (px холста): canvas[data-stars] «лицо:x,y». */
async function frameStar(p: Page, id: string): Promise<Pt | null> {
  const q = ((await canvasData(p)).stars ?? '').split(';').find((x) => x.startsWith(`${id}:`));
  if (!q) return null;
  const [x, y] = q.slice(id.length + 1).split(',').map(Number);
  return { x, y };
}
/** Звезда лица на холсте (px холста) — из списка неба для клавиатуры (SkyA11y, data-x/data-y). */
async function starAt(p: Page, id: string): Promise<Pt | null> {
  const el = p.locator(`#sky-star-${id}`);
  if (!(await el.count())) return null;
  const x = Number(await el.getAttribute('data-x'));
  const y = Number(await el.getAttribute('data-y'));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
/** Центры точек союзов (px холста): canvas[data-dots] «союз:раскрыт:x,y:скрыто». */
async function dotsOf(p: Page): Promise<Map<string, Pt>> {
  const out = new Map<string, Pt>();
  for (const q of ((await canvasData(p)).dots ?? '').split(';').filter(Boolean)) {
    const m = /^(u:.*):([01]):(-?\d+),(-?\d+):(\d+)$/.exec(q);
    if (m) out.set(m[1], { x: +m[3], y: +m[4] });
  }
  return out;
}
/** Видимая часть неба (px холста): .sky[data-view] — левый, верхний, правый, нижний края. */
async function viewOf(p: Page): Promise<{ l: number; t: number; r: number; b: number }> {
  const v = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
  return { l: v[0], t: v[1], r: v[2], b: v[3] };
}
/** Органы неба (px холста): блоки с data-reserve внутри неба. */
const reserves = (p: Page) =>
  p.evaluate(() => {
    const sky = (document.querySelector('.sky') as HTMLElement).getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.sky [data-reserve]')]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width && b.height)
      .map((b) => ({ x: b.left - sky.left, y: b.top - sky.top, w: b.width, h: b.height }));
  });
/** Наложения подписей: «подписано/наложений» (.sky[data-labels]). */
const overlaps = async (p: Page) => Number(((await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.labels ?? '')).split('/')[1]) ?? NaN);
const inside = (q: Pt, b: Box, pad = 0) => q.x > b.x - pad && q.x < b.x + b.w + pad && q.y > b.y - pad && q.y < b.y + b.h + pad;
/** Отрезок a–b проходит через прямоугольник r. */
function crosses(r: Box, a: Pt, b: Pt) {
  for (let k = 0; k <= 64; k++) if (inside({ x: a.x + ((b.x - a.x) * k) / 64, y: a.y + ((b.y - a.y) * k) / 64 }, r)) return true;
  return false;
}
/** Кнопка «Всё небо» органов неба (не «показать всё небо» строки у кромки). */
async function fitSky(p: Page) {
  await p.locator('.sky button[title^="Всё небо"]').first().click();
  await p.waitForTimeout(1400);
}
const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();

const ADAM_KIDS = ['adam', 'eva', 'kain', 'avel', 'sif'];
const ADAM_OPEN: Scene = { work: ADAM_KIDS, opened: ['adam'], expanded: { 'u:adam+eva': 'adam' }, hash: '#/adam' };
const JACOB_WIVES = ['liya', 'rakhil', 'valla', 'zelfa'];
const JACOB: Scene = {
  work: ['iakov', 'liya', 'ruvim', 'simeon', 'leviy', 'iuda', 'issakhar', 'zavulon', 'dina', 'rakhil', 'iosif', 'veniamin', 'valla', 'dan', 'neffalim', 'zelfa', 'gad', 'asir'],
  opened: ['iakov'],
  expanded: { 'u:iakov+liya': 'iakov', 'u:iakov+rakhil': 'iakov', 'u:iakov+valla': 'iakov', 'u:iakov+zelfa': 'iakov' },
  hash: '#/iakov',
};

export const polish6: Scenario[] = [
  {
    n: 700,
    title: 'Задача P3: «Всё небо» в небе «набор» вписывает раскрытое — семья Адама на всю ширину неба (от Адама до Сифа больше половины), точка союза и все пятеро на виду; след Адама уходит за правый край',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await fitSky(p);
      const v = await viewOf(p);
      const st = Object.fromEntries(await Promise.all(ADAM_KIDS.map(async (id) => [id, await starAt(p, id)] as const)));
      for (const id of ADAM_KIDS) {
        const q = st[id];
        if (!q || q.x < v.l || q.x > v.r || q.y < v.t || q.y > v.b) return fail(`${id} не на виду: ${JSON.stringify(q)}`);
      }
      const span = st.sif!.x - st.adam!.x;
      if (span < 0.5 * (v.r - v.l)) return fail(`семья прижата: от Адама до Сифа ${span} px при ширине неба ${v.r - v.l}`);
      const d = (await dotsOf(p)).get('u:adam+eva');
      if (!d || d.x < v.l || d.x > v.r) return fail(`точка союза не на виду: ${JSON.stringify(d)}`);
      const w = Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1] ?? NaN);
      if (!(w < 400)) return fail(`окно ${w} лет — вписан след Адама, а не семья`);
      return (await overlaps(p)) === 0 ? pass(`окно ${w} лет; от Адама до Сифа ${span} px`) : fail('подписи наложились');
    },
  },
  {
    n: 701,
    title: 'Задача P3: «Всё небо» у семьи Иакова (18 лиц, четыре союза) — все звёзды в открытом небе, ни одна не под органами неба; подписи без наложений',
    run: async (p) => {
      await setup(p, JACOB);
      await fitSky(p);
      const v = await viewOf(p);
      const rs = await reserves(p);
      const bad: string[] = [];
      for (const id of JACOB.work) {
        const q = await starAt(p, id);
        if (!q) {
          bad.push(`${id} нет на виду`);
          continue;
        }
        if (q.x < v.l || q.x > v.r || q.y < v.t || q.y > v.b) bad.push(`${id} за краем`);
        else if (rs.some((r) => inside(q, r, 2))) bad.push(`${id} под органами неба`);
      }
      if (bad.length) return fail(bad.join('; '));
      return (await overlaps(p)) === 0 ? pass() : fail('подписи наложились');
    },
  },
  {
    n: 702,
    title: 'Задача P3: небо «все лица» — «Всё небо» по-прежнему вписывает всё небо, от сотворения до 100 г. по Р. Х.',
    run: async (p) => {
      await setup(p, { ...ADAM_OPEN, mode: 'all' });
      await fitSky(p);
      const d = await canvasData(p);
      if (d.mode !== 'all') return fail(`режим неба: ${d.mode}`);
      const w = Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1] ?? NaN);
      return w > 4000 ? pass(`окно ${w} лет`) : fail(`окно ${w} лет — не всё небо`);
    },
  },
  {
    n: 703,
    title: 'Задача P3, изъян 1: выбран Адам, союз с Евой раскрыт — помета «годы — по порядку Быт 4:1–2; 4:25, выв.» не ложится на линии от точки союза к сыновьям и на саму точку (обычный масштаб и «Всё небо»)',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const out: string[] = [];
      for (const step of ['обычный', '«Всё небо»']) {
        if (step !== 'обычный') await fitSky(p);
        const d = await canvasData(p);
        const dot = (await dotsOf(p)).get('u:adam+eva');
        if (!dot) return fail(`${step}: нет точки союза`);
        const notes = (d.noteBoxes ?? '').split(';').filter(Boolean).map((q) => q.split(',').map(Number)).map(([x, y, w, h]) => ({ x, y, w, h }));
        if (!(d.notes ?? '').includes('годы — по порядку')) {
          out.push(`${step}: пометы нет`);
          continue;
        }
        if (!notes.length) return fail(`${step}: помета есть, а её места нет в canvas[data-note-boxes]`);
        for (const k of ['kain', 'avel', 'sif']) {
          const q = await starAt(p, k);
          if (q && notes.some((n) => crosses(n, dot, q))) return fail(`${step}: помета на линии к ${k}`);
        }
        if (notes.some((n) => inside(dot, n, 4))) return fail(`${step}: помета на точке союза`);
        out.push(`${step}: помета не на линиях`);
      }
      if (out.every((s) => s.endsWith('пометы нет'))) return fail('помета не встала ни разу');
      return (await overlaps(p)) === 0 ? pass(out.join('; ')) : fail('подписи наложились');
    },
  },
  {
    n: 704,
    title: 'Задача P3, изъян 2: Иаков и четыре жены — каждая точка союза между строками мужа и своей жены, точки не вплотную (≥ 16 px), все четыре жены подписаны',
    run: async (p) => {
      await setup(p, JACOB);
      const ds = await dotsOf(p);
      const j = await starAt(p, 'iakov');
      if (!j) return fail('нет звезды Иакова');
      const pts: Pt[] = [];
      for (const w of JACOB_WIVES) {
        const q = ds.get(`u:iakov+${w}`);
        const s = await starAt(p, w);
        if (!q || !s) return fail(`нет точки или звезды: ${w}`);
        if (!(q.y > Math.min(j.y, s.y) && q.y < Math.max(j.y, s.y))) return fail(`точка союза с ${w} не между строками: ${q.y} (Иаков ${j.y}, жена ${s.y})`);
        pts.push(q);
      }
      for (let a = 0; a < pts.length; a++)
        for (let b = a + 1; b < pts.length; b++) if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < 16) return fail(`точки вплотную: ${JSON.stringify(pts[a])} и ${JSON.stringify(pts[b])}`);
      const named = ((await canvasData(p)).labelIds ?? '').split(' ');
      const miss = JACOB_WIVES.filter((w) => !named.includes(w));
      if (miss.length) return fail(`жёны без подписи: ${miss.join(', ')}`);
      return (await overlaps(p)) === 0 ? pass() : fail('подписи наложились');
    },
  },
  {
    n: 705,
    title: 'Задача P3, изъян 2, телефон 390 × 844: семья Иакова — все четыре жены подписаны, подписи без наложений',
    view: PHONE,
    run: async (p) => {
      await setup(p, JACOB);
      const named = ((await canvasData(p)).labelIds ?? '').split(' ');
      const shown: string[] = [];
      for (const w of JACOB_WIVES) if (await starAt(p, w)) shown.push(w);
      if (shown.length < 4) return fail(`на виду не все жёны: ${shown.join(', ')}`);
      const miss = JACOB_WIVES.filter((w) => !named.includes(w));
      if (miss.length) return fail(`жёны без подписи: ${miss.join(', ')}`);
      return (await overlaps(p)) === 0 ? pass() : fail('подписи наложились');
    },
  },
  {
    n: 706,
    title: 'Задача P3, изъян 5: карточка у точки союза Адама и Евы (раскрыт) не закрывает точку и звёзды семьи; лист без тени и скругления, 1 px или двойная рамка; в командах нет стрелок',
    run: async (p) => {
      for (const theme of ['night', 'day'] as const) {
        await setup(p, { ...ADAM_OPEN, theme });
        const d = (await dotsOf(p)).get('u:adam+eva');
        if (!d) return fail(`${theme}: нет точки союза`);
        const cv = (await p.locator('.sky canvas').boundingBox())!;
        await p.mouse.click(cv.x + d.x, cv.y + d.y);
        await p.waitForTimeout(900);
        const card = p.locator('.sky .dotcard[data-placed]');
        const b = await card.boundingBox();
        if (!b) return fail(`${theme}: нет карточки у точки`);
        const box = { x: b.x - cv.x, y: b.y - cv.y, w: b.width, h: b.height };
        if (inside(d, box, 4)) return fail(`${theme}: карточка на точке союза`);
        for (const id of ADAM_KIDS) {
          const q = await starAt(p, id);
          if (q && inside(q, box, 3)) return fail(`${theme}: карточка на звезде ${id}`);
        }
        const css = await card.evaluate((el) => {
          const c = getComputedStyle(el);
          return { shadow: c.boxShadow, radius: c.borderTopLeftRadius, width: c.borderTopWidth, style: c.borderTopStyle };
        });
        if (css.shadow !== 'none' || css.radius !== '0px') return fail(`${theme}: тень или скругление: ${JSON.stringify(css)}`);
        const cmds = (await card.locator('.dc-cmds button').allInnerTexts()).join(' | ');
        if (/[→←↗>]/.test(cmds)) return fail(`${theme}: стрелки в командах: ${cmds}`);
      }
      return pass();
    },
  },
  {
    n: 707,
    title: 'Задача P3, изъян 5, телефон 390 × 844: касание точки союза — карточка у нижнего края над листом, а точка и звёзды Адама и Евы — в открытом небе между верхними органами и карточкой; цели 44 px',
    view: PHONE,
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const d0 = (await dotsOf(p)).get('u:adam+eva');
      if (!d0) return fail('нет точки союза');
      const cv = (await p.locator('.sky canvas').boundingBox())!;
      await p.touchscreen.tap(cv.x + d0.x, cv.y + d0.y);
      await p.waitForTimeout(1600);
      const card = p.locator('.sky .dotcard[data-placed]');
      const b = await card.boundingBox();
      if (!b) return fail('нет карточки у точки');
      const top = b.y - cv.y;
      // верхние органы неба: строка «Раскрыто 5 лиц» у кромки
      const rs = (await reserves(p)).filter((r) => r.y < 200 && r.w > 150);
      const ceil = Math.max(0, ...rs.map((r) => r.y + r.h));
      const d = (await dotsOf(p)).get('u:adam+eva');
      if (!d) return fail('точка союза ушла с неба');
      // места звёзд — по кадру (список неба для клавиатуры обновляется, только когда небо постоит)
      if (!(await canvasData(p)).stars) return fail('нет canvas[data-stars] — мест звёзд кадра');
      for (const [id, q] of [['точка', d], ['adam', await frameStar(p, 'adam')], ['eva', await frameStar(p, 'eva')]] as const) {
        if (!q) return fail(`${id}: нет на виду`);
        // с полем на знак и подпись: звезда не под строкой у кромки и не у самой карточки
        if (!(q.y > ceil + 14 && q.y < top - 14)) return fail(`${id} не в открытом небе: y ${q.y}, верхние органы до ${Math.round(ceil)}, карточка с ${Math.round(top)}`);
      }
      const low = (await card.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).filter((h) => h < 43.5);
      return low.length ? fail(`цели ниже 44 px: ${low.join(', ')}`) : pass(`карточка с ${Math.round(top)} px, точка на ${d.y}`);
    },
  },
  {
    n: 708,
    title: 'Задача P3, изъян 6: «Клавиши» — «к ближайшей звезде или точке союза», Enter на звезде или точке союза открывает карточку у неё, щелчок по точке союза — карточка у точки; слова «картуш» нет',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(700);
      const sheet = p.locator('.app > .sheet');
      if (!(await sheet.count())) return fail('таблица клавиш не открылась');
      const t = flat(await sheet.innerText());
      for (const w of ['к ближайшей звезде или точке союза', 'на звезде или точке союза в небе «набор» — открыть у неё карточку', 'щелчок по точке союза', 'карточка у точки: «Раскрыть детей»'])
        if (!t.includes(w)) return fail(`в «Клавишах» нет «${w}»`);
      return /картуш/.test(t) ? fail('в «Клавишах» осталось слово «картуш»') : pass();
    },
  },
  {
    n: 709,
    title: 'Задача P3, изъян 7: «Как читать карту» в небе «набор» описывает точку союза и цветные линии: ромб между мужем и женой, линии цвета ветви, залитый — раскрыт, полый с числом — свёрнут',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await p.locator('.sky .guide-cmd').click();
      await p.waitForTimeout(700);
      const g = p.locator('.sky .cartouche .guide');
      if (!(await g.count())) return fail('«Как читать карту» не открылся');
      const t = flat(await g.innerText());
      for (const w of ['В небе «набор» союз — малый ромб между строками мужа и жены', 'своя линия цвета его ветви', 'Залитый ромб — союз раскрыт, полый с числом — свёрнут', 'по звезде или по ромбу открывает у него карточку'])
        if (!t.includes(w)) return fail(`в «Как читать карту» нет «${w}»: ${t}`);
      return pass();
    },
  },
  {
    n: 710,
    title: 'Задача P3, изъян 7: «Условные знаки» — союз-точка ближе к строкам детей, плавные линии от супругов и прямые к детям цвета ветви, «Информация» и «Подробнее» в карточках у точки',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const t = flat(await p.locator('.app > .sheet').innerText());
      for (const w of ['ближе к строкам детей', 'плавные линии от мужа и жены', 'прямая линия цвета его ветви', '«Информация» — подробная карточка справа', '«Подробнее» — карточка союза справа', 'В небе «набор» союз — малый ромб'])
        if (!t.includes(w)) return fail(`в «Условных знаках» нет «${w}»`);
      return /картуш/.test(t) ? fail('в «Условных знаках» осталось слово «картуш»') : pass();
    },
  },
];
