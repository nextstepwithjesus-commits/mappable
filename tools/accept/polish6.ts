/**
 * Сценарии приёмки: доводка неба «набор» после решения 76 (задача P3), группа polish6: номера 700–719 — «Всё небо»
 * вписывает раскрытое, помета порядка не на линиях к детям, большая семья читается (точки между супругами, не вплотную,
 * жёны подписаны), карточка у точки не закрывает своей семьи, справка — о точке союза. Небо «все лица» — как прежде.
 * Этап 11 (задача Q3): кнопка кадра называется «Вписать» (Я30); на телефоне карточка — нижний лист (решение 77); справка —
 * о грамматике связей решения 78 (ромб на следе матери, ствол, зубцы) и командах «Карточка», «Карточка союза» — сценарии
 * 707–710 и помощник fitSky приведены к этому.
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
  // этап 14 (решение 147, S3): показ — в адресе; адрес с окном неба («~y…»), который приложение дописывает сразу, без поля
  // показа при перезагрузке — «все лица». Поэтому — новая загрузка с коротким адресом (другая строка запроса): показ «набор»
  // берётся из sessionStorage, как прежде
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?p6=${Date.now()}${o.hash}`);
  await p.waitForTimeout(2600);
  await ready(p, o.work[0], !!o.opened?.length && (o.mode ?? 'work') === 'work');
}

/**
 * Небо готово (этап 16, разбор 664, 706, 707 исполнителем F): новая загрузка, звёзды набора в кадре и, если у набора
 * показаны союзы, — точки союзов в кадре покоя (canvas[data-dots]). Прежде — ровно 2,6 с после загрузки: под нагрузкой
 * машины точка союза Адама и Евы появлялась через 0,5–2,9 с (перелёт к лицу, «звёзды зажигаются», проявление связей),
 * и сценарий падал на «нет точки союза» при верном небе.
 */
async function ready(p: Page, first: string | undefined, dots: boolean) {
  // звезда первого лица набора стоит на месте три замера подряд (перелёт к лицу кончился), точки союзов — в кадре
  let last = '';
  let same = 0;
  for (let k = 0; k < 40; k++) {
    const d = await p.evaluate(() => {
      const c = document.querySelector('.sky > canvas') as HTMLCanvasElement | null;
      return { stars: c?.dataset.stars ?? '', dots: c?.dataset.dots ?? '' };
    });
    const at = first ? (d.stars.split(';').find((q) => q.startsWith(`${first}:`)) ?? '') : 'any';
    same = at && at === last ? same + 1 : 0;
    last = at;
    if (same >= 2 && (!dots || d.dots)) return;
    await p.waitForTimeout(200);
  }
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
  const read = async (): Promise<Pt | null> => {
    if (!(await el.count())) return null;
    const x = Number(await el.getAttribute('data-x'));
    const y = Number(await el.getAttribute('data-y'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };
  // список неба обновляется через 600 мс после остановки окна неба (SkyA11y; этап 14: на телефоне после выбора небо ещё
  // сходится к временной пропорции строк, S3): место — когда два чтения через 900 мс совпали
  let q = await read();
  for (let k = 0; k < 4; k++) {
    await p.waitForTimeout(900);
    const r = await read();
    if (r && q && r.x === q.x && r.y === q.y) return r;
    q = r;
  }
  return q;
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
    // этап 14 (решение 153): карточка у звезды и подсказка — тоже резерв подписей, но не органы неба: сама себе она не запрет
    return [...document.querySelectorAll<HTMLElement>('.sky [data-reserve]:not([data-reserve="dot"]):not([data-reserve="tip"])')]
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width && b.height)
      .map((b) => ({ x: b.left - sky.left, y: b.top - sky.top, w: b.width, h: b.height }));
  });
/** Наложения подписей: «подписано/наложений» (.sky[data-labels]). */
const overlaps = async (p: Page) => Number(((await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.labels ?? '')).split('/')[1]) ?? NaN);
const inside = (q: Pt, b: Box, pad = 0) => q.x > b.x - pad && q.x < b.x + b.w + pad && q.y > b.y - pad && q.y < b.y + b.h + pad;
/** Кнопка «Вписать» органов неба (этап 11, Я30: прежде «Всё небо»; «всё небо» — теперь показ в строке показа). */
async function fitSky(p: Page) {
  await p.locator('.sky .skyctl button[title^="Вписать"]').first().click();
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
    // этап 11 (решение 78, Г9): порядок рождения виден по положению, помет «годы — по порядку …» на небе нет ни в каком
    // масштабе; их текст — в строке «Год» карточки у звезды ребёнка (и в подсказке, в карточке союза). Прежняя проверка «помета
    // не на линиях» заменена проверкой, что пометы на небе нет, а строка «Год» у Каина называет место перечисления
    title: 'Задача P3, изъян 1; этап 11 (Г9): выбран Адам, союз с Евой раскрыт — помет порядка на небе нет (обычный масштаб и «Вписать»); у Каина в «Родстве» карточки справа строка «Год» — «по порядку перечисления, Быт 4:…, выв.» (решение 194)',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      for (const step of ['обычный', '«Вписать»']) {
        if (step !== 'обычный') await fitSky(p);
        const d = await canvasData(p);
        if (!(await dotsOf(p)).get('u:adam+eva')) return fail(`${step}: нет ромба союза`);
        if ((d.notes ?? '').includes('по порядку')) return fail(`${step}: помета порядка на небе: ${d.notes}`);
      }
      const k = await frameStar(p, 'kain');
      if (!k) return fail('нет звезды Каина');
      const cv = (await p.locator('.sky canvas').boundingBox())!;
      await p.mouse.click(cv.x + k.x, cv.y + k.y);
      await p.waitForTimeout(1000);
      // этап 20 (решение 194): карточки у звезды на широком экране нет — строка «Год» со стихом — в «Родстве» карточки справа
      const card = flat(await p.locator('.folio .kin-col').first().innerText().catch(() => ''));
      if (!/по порядку перечисления, Быт 4:[^,]*, выв\./.test(card)) return fail(`строка «Год» у Каина: «${card.slice(0, 200)}»`);
      return (await overlaps(p)) === 0 ? pass('помет на небе нет; «Год» у Каина — по порядку перечисления') : fail('подписи наложились');
    },
  },
  {
    n: 704,
    // этап 11 (решение 78, Г4, Г8): ромб союза стоит на следе матери (прежде — точка между строками мужа и жены)
    title: 'Задача P3, изъян 2; этап 11 (Г4): Иаков и четыре жены — ромб каждого союза на следе своей жены, ромбы не вплотную (≥ 16 px), все четыре жены подписаны',
    run: async (p) => {
      await setup(p, JACOB);
      const ds = await dotsOf(p);
      const j = await starAt(p, 'iakov');
      if (!j) return fail('нет звезды Иакова');
      const pts: Pt[] = [];
      for (const w of JACOB_WIVES) {
        const q = ds.get(`u:iakov+${w}`);
        const s = await starAt(p, w);
        if (!q || !s) return fail(`нет ромба или звезды: ${w}`);
        if (Math.abs(q.y - s.y) > 1.5 || !(q.x > s.x)) return fail(`ромб союза с ${w} не на её следе: ${q.x},${q.y} (жена ${s.x},${s.y})`);
        pts.push(q);
      }
      for (let a = 0; a < pts.length; a++)
        for (let b = a + 1; b < pts.length; b++) if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < 16) return fail(`ромбы вплотную: ${JSON.stringify(pts[a])} и ${JSON.stringify(pts[b])}`);
      const named = ((await canvasData(p)).labelIds ?? '').split(' ');
      const miss = JACOB_WIVES.filter((w) => !named.includes(w));
      if (miss.length) return fail(`жёны без подписи: ${miss.join(', ')}`);
      return (await overlaps(p)) === 0 ? pass() : fail('подписи наложились');
    },
  },
  {
    n: 705,
    // этап 11 (решение 77, § 4.2): на телефоне с листом карточки (214 px) небо у выбранного Иакова — «лицо и поколения вокруг»,
    // строки семейной укладки; вся семья по высоте не помещается, остальное уходит за край и доступно сдвигом. Прежнее «все
    // четыре жены на виду» заменено: жёны на виду подписаны (не меньше двух), наложений нет
    title: 'Задача P3, изъян 2; этап 11 (Я12), телефон 390 × 844: семья Иакова — жёны на виду подписаны, остальные — за краем по высоте; подписи без наложений',
    view: PHONE,
    run: async (p) => {
      await setup(p, JACOB);
      const v = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
      const named = ((await canvasData(p)).labelIds ?? '').split(' ');
      const shown: string[] = [];
      // на виду — звезда не под строкой показа и органами неба (этап 13, решение 118: строка показа на телефоне — до двух
      // строк; как denseSpots в tools/accept/phone.ts)
      const cv = (await p.locator('.sky > canvas').boundingBox())!;
      for (const w of JACOB_WIVES) {
        const q = await starAt(p, w);
        if (q && (await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', { x: cv.x + q.x, y: cv.y + q.y }))) shown.push(w);
      }
      if (shown.length < 2) return fail(`на виду жён: ${shown.join(', ')}`);
      const miss = shown.filter((w) => !named.includes(w));
      if (miss.length) return fail(`жёны без подписи: ${miss.join(', ')}`);
      return (await overlaps(p)) === 0 ? pass(`строка ${v[7].toFixed(1)} px; на виду: ${shown.join(', ')}`) : fail('подписи наложились');
    },
  },
  {
    n: 706,
    // этап 20 (решение 194): карточки у точки на широком экране нет — карточка союза справа, небо открыто; проверка «не
    // закрывает точку и звёзды семьи» стала проверкой, что на небе карточки нет; лист и команды — те же требования
    title: 'Задача P3, изъян 5; решение 194: щелчок по точке союза Адама и Евы (раскрыт) — карточка союза справа, на небе карточки нет (точка и звёзды семьи открыты); лист без тени и скругления; в командах нет стрелок',
    run: async (p) => {
      for (const theme of ['night', 'day'] as const) {
        await setup(p, { ...ADAM_OPEN, theme });
        const d = (await dotsOf(p)).get('u:adam+eva');
        if (!d) return fail(`${theme}: нет точки союза`);
        const cv = (await p.locator('.sky canvas').boundingBox())!;
        await p.mouse.click(cv.x + d.x, cv.y + d.y);
        await p.waitForTimeout(900);
        if (await p.locator('.sky .dotcard').count()) return fail(`${theme}: на небе — карточка у точки`);
        const card = p.locator('aside.folio[data-union="u:adam+eva"]');
        if (!(await card.count())) return fail(`${theme}: справа нет карточки союза`);
        const css = await card.evaluate((el) => {
          const c = getComputedStyle(el);
          return { shadow: c.boxShadow, radius: c.borderTopLeftRadius };
        });
        if (css.shadow !== 'none' || css.radius !== '0px') return fail(`${theme}: тень или скругление: ${JSON.stringify(css)}`);
        const cmds = (await card.locator('button').allInnerTexts()).join(' | ');
        if (/[→←↗]/.test(cmds)) return fail(`${theme}: стрелки в командах: ${cmds}`);
      }
      return pass();
    },
  },
  {
    n: 707,
    title: 'Задача P3, изъян 5; этап 11 (решение 77), телефон 390 × 844: касание точки союза — карточка союза в нижнем листе на 214 px (над небом второй карточки нет), а точка и звёзды Адама и Евы — в открытом небе между верхними органами и листом; цели 44 px',
    view: PHONE,
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const d0 = (await dotsOf(p)).get('u:adam+eva');
      if (!d0) return fail('нет точки союза');
      const cv = (await p.locator('.sky canvas').boundingBox())!;
      await p.touchscreen.tap(cv.x + d0.x, cv.y + d0.y);
      await p.waitForTimeout(1600);
      if (await p.locator('.sky .dotcard[data-placed]').count()) return fail('над небом — карточка, а должен быть лист');
      const card = p.locator('.folio .sheet-dot .dotcard[data-kind="union"]');
      if (!(await card.count())) return fail('в листе нет карточки союза');
      const b = (await p.locator('.folio').boundingBox())!;
      const top = b.y - cv.y;
      // верхние органы неба: строка показа у кромки
      const rs = (await reserves(p)).filter((r) => r.y < 200 && r.w > 150);
      const ceil = Math.max(0, ...rs.map((r) => r.y + r.h));
      const d = (await dotsOf(p)).get('u:adam+eva');
      if (!d) return fail('точка союза ушла с неба');
      // места звёзд — по кадру (список неба для клавиатуры обновляется, только когда небо постоит)
      if (!(await canvasData(p)).stars) return fail('нет canvas[data-stars] — мест звёзд кадра');
      for (const [id, q] of [['точка', d], ['adam', await frameStar(p, 'adam')], ['eva', await frameStar(p, 'eva')]] as const) {
        if (!q) return fail(`${id}: нет на виду`);
        // с полем на знак и подпись: звезда не под строкой у кромки и не у самого листа
        if (!(q.y > ceil + 14 && q.y < top - 14)) return fail(`${id} не в открытом небе: y ${q.y}, верхние органы до ${Math.round(ceil)}, лист с ${Math.round(top)}`);
      }
      const low = (await card.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).filter((h) => h < 43.5);
      return low.length ? fail(`цели ниже 44 px: ${low.join(', ')}`) : pass(`лист с ${Math.round(top)} px, точка на ${d.y}`);
    },
  },
  {
    n: 708,
    title: 'Задача P3, изъян 6; этап 11 (решения 77, 78): «Клавиши» — «к ближайшей звезде или ромбу союза», Enter на звезде или ромбе союза открывает карточку у него, щелчок по ромбу союза — карточка союза у ромба; слова «картуш» нет',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(700);
      const sheet = p.locator('.app > .sheet');
      if (!(await sheet.count())) return fail('таблица клавиш не открылась');
      const t = flat(await sheet.innerText());
      for (const w of ['к ближайшей звезде или ромбу союза', 'на звезде или ромбе союза — открыть у неё карточку', 'щелчок по ромбу союза', 'карточка союза у ромба: «Показать детей союза»'])
        if (!t.includes(w)) return fail(`в «Клавишах» нет «${w}»`);
      return /картуш/.test(t) ? fail('в «Клавишах» осталось слово «картуш»') : pass();
    },
  },
  {
    n: 709,
    title: 'Задача P3, изъян 7; этап 11 (решение 78): «Как читать карту» описывает грамматику связей — ствол от родителя, зубцы к детям, ромб союза на следе матери, выбор линии жёлтым',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await p.locator('.sky .guide-cmd').click();
      await p.waitForTimeout(700);
      const g = p.locator('.sky .cartouche .guide');
      if (!(await g.count())) return fail('«Как читать карту» не открылся');
      const t = flat(await g.innerText());
      for (const w of ['от родителя идёт вертикальный ствол, от ствола — короткие зубцы к детям', 'ромб — союз родителей, он стоит на следе матери', 'связь выделяется жёлтым', 'карточка с родством'])
        if (!t.includes(w)) return fail(`в «Как читать карту» нет «${w}»: ${t}`);
      return pass();
    },
  },
  {
    n: 710,
    title: 'Задача P3, изъян 7; этап 11 (решения 77, 78): «Условные знаки» — ромб союза на следе матери, черта брака, ствол и зубцы; «Карточка» и «Карточка союза» в карточках на небе',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const t = flat(await p.locator('.app > .sheet').innerText());
      for (const w of ['Ромб союза стоит на следе матери', 'От мужа к ромбу идёт черта брака', 'от ствола — короткие зубцы к детям', '«Вся карточка» — подробная карточка справа', '«Подробнее о союзе» — подробная карточка союза справа'])
        if (!t.includes(w)) return fail(`в «Условных знаках» нет «${w}»`);
      return /картуш/.test(t) ? fail('в «Условных знаках» осталось слово «картуш»') : pass();
    },
  },
];
