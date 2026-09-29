/**
 * Сценарии приёмки: ошибки отрисовки неба (этап 11, задача B1), группа bugs7: номера 720–739.
 *
 * Снимок владельца 14: небо «набор», раскрытое «С Адама» до Арфаксада, и «только линии Мессии» — имена Каинана, Салы …
 * Наассона висели на пустом небе без звёзд, лент и следов, у Фареса — знак Фамари, у Арфаксада — выноска «Каинан —
 * только у Луки»; лента от Мафусала к Ламеху и Ною — горбом вдвое выше раскладки. Проверки — по замерам кадра
 * (src/render/sky.ts): canvas[data-bare] — подписи лиц без нарисованной звезды, canvas[data-ribbon-gaps] — обрывы лент
 * и ленты не у звёзд, canvas[data-out] — подписи за краем, canvas[data-size] и canvas[data-pal] — размер кадра и цвет
 * неба, которыми он нарисован.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { ROOT } from '../bible.ts';
import { fail, pass, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };

const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as {
  persons: { id: string; f?: string; m?: string }[];
  lines: Record<string, { persons: { id: string }[] }>;
};
const LINE = [...new Set(Object.values(atlas.lines).flatMap((l) => l.persons.map((x) => x.id)))];

/** Раскрытие «С Адама» вниз по линии до лица to — как щелчками по точкам союзов: набор, показанные и раскрытые союзы. */
function chain(to: string) {
  const line = atlas.lines.joseph.persons.map((x) => x.id);
  const by = new Map(atlas.persons.map((p) => [p.id, p]));
  const work: string[] = ['adam'];
  const opened: string[] = [];
  const expanded: Record<string, string> = {};
  for (let k = 0; k < line.indexOf(to); k++) {
    const kid = by.get(line[k + 1])!;
    const f = kid.f ?? null;
    const m = kid.m ?? null;
    expanded[`u:${f ?? ''}+${m ?? ''}`] = line[k];
    opened.push(line[k]);
    for (const id of [f, m, ...atlas.persons.filter((q) => (q.f ?? null) === f && (q.m ?? null) === m).map((q) => q.id)]) if (id && !work.includes(id)) work.push(id);
  }
  return { work, opened, expanded };
}
const ARFAKSAD = chain('arfaksad');

type Scene = { work: string[]; opened?: string[]; expanded?: Record<string, string>; hash: string; start?: string; mode?: 'work' | 'all'; theme?: 'night' | 'day' };
/** Небо в заданном состоянии (src/ui/reveal.ts, src/ui/work.ts): набор, союзы, режим неба; адрес выбирает лицо. */
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

const canvasData = (p: Page) => p.evaluate(() => ({ ...(document.querySelector('.sky canvas') as HTMLCanvasElement).dataset }) as Record<string, string>);
const viewOf = async (p: Page) => {
  const v = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
  return { l: v[0], t: v[1], r: v[2], b: v[3], ky: v[7] };
};
/** Звёзды неба «набор» в последнем кадре: «лицо:x,y» (canvas[data-stars]). */
async function stars(p: Page): Promise<Map<string, { x: number; y: number }>> {
  const out = new Map<string, { x: number; y: number }>();
  for (const q of ((await canvasData(p)).stars ?? '').split(';').filter(Boolean)) {
    const [id, xy] = q.split(':');
    const [x, y] = xy.split(',').map(Number);
    out.set(id, { x, y });
  }
  return out;
}

/** Флажок «только линии Мессии»: на блоке органов неба, а на узком небе — в листе «Вид» у колонки. */
async function toggleLines(p: Page) {
  const on = p.locator('.sky .skyctl:not(.column) label.check:has-text("только линии Мессии")');
  if ((await on.count()) && (await on.first().isVisible())) await on.first().click();
  else {
    await p.locator('.sky .skyctl.column button[aria-expanded]').first().click();
    await p.waitForTimeout(300);
    await p.locator('.sky .sheet label.check:has-text("только линии Мессии")').first().click();
    await p.waitForTimeout(200);
    await p.keyboard.press('Escape');
  }
  await p.waitForTimeout(1600);
}

/** Замечания кадра: подписи без звезды, ленты, подписи за краем. */
async function frameIssues(p: Page): Promise<string[]> {
  const d = await canvasData(p);
  const out: string[] = [];
  if (d.bare === undefined) out.push('нет замера canvas[data-bare]');
  if (d.bare) out.push(`подписи без звезды: ${d.bare}`);
  if (d.ribbonGaps) out.push(`лента: ${d.ribbonGaps}`);
  if (d.out) out.push(`подписи за краем: ${d.out}`);
  return out;
}

/** Снимок 14 целиком: подписаны только лица набора, у каждой подписи — звезда, выносок и знаков чужих лиц нет. */
async function shot14(p: Page): Promise<string[]> {
  const bad = await frameIssues(p);
  const d = await canvasData(p);
  const set = new Set(ARFAKSAD.work);
  const stray = (d.labelIds ?? '').split(' ').filter((id) => id && !set.has(id));
  if (stray.length) bad.push(`подписаны лица вне набора: ${stray.join(', ')}`);
  const notes = d.notes ?? '';
  for (const t of ['только у Луки', 'Фамарь', 'Расходятся', 'Мф ', 'Лк ']) if (notes.includes(t)) bad.push(`помета «${t}…» у лица вне набора`);
  if (d.mode !== 'work') bad.push(`режим неба ${d.mode}`);
  // и список для клавиатуры не называет точек сравнения лиц вне набора
  const points = await p.locator('.sky ul[aria-label^="Точки сравнения"] button').allInnerTexts();
  if (points.length) bad.push(`точки сравнения для клавиатуры: ${points.join(' | ')}`);
  // окно — у лиц набора, а не на пустом небе: Арфаксад и Ной в видимой части
  const v = await viewOf(p);
  const st = await stars(p);
  for (const id of ['arfaksad', 'noy']) {
    const q = st.get(id);
    if (!q || q.x < v.l || q.x > v.r || q.y < v.t || q.y > v.b) bad.push(`${id} не в кадре: ${JSON.stringify(q ?? null)}`);
  }
  return bad;
}

export const bugs7: Scenario[] = [
  {
    n: 720,
    title: 'Этап 11, B1, снимок 14: «С Адама» раскрыто до Арфаксада, Арфаксад выбран, «только линии Мессии» — имена только у лиц набора и у каждого своя звезда; ни «Каинан — только у Луки», ни Фамари; окно — у набора',
    run: async (p) => {
      await setup(p, { ...ARFAKSAD, hash: '#/arfaksad' });
      await toggleLines(p);
      const bad = await shot14(p);
      return bad.length ? fail(bad.join('; ')) : pass(`подписано: ${(await canvasData(p)).labelIds}`);
    },
  },
  {
    n: 721,
    title: 'Этап 11, B1, снимок 14 на телефоне 390 × 844: «только линии» из листа «Вид» у колонки — те же проверки',
    view: PHONE,
    run: async (p) => {
      await setup(p, { ...ARFAKSAD, hash: '#/arfaksad' });
      await toggleLines(p);
      const bad = await shot14(p);
      return bad.length ? fail(bad.join('; ')) : pass();
    },
  },
  {
    n: 726,
    title: 'Этап 11, B1, самый короткий путь к снимку 14 (критик K4): начало «С Адама» — на небе один Адам; «только линии Мессии» — подписан только Адам, у подписи звезда, помет о чужих лицах нет; протянули небо — так же',
    run: async (p) => {
      await setup(p, { work: ['adam'], opened: ['adam'], hash: '#/adam' });
      await toggleLines(p);
      const bad: string[] = [];
      const look = async (step: string) => {
        const d = await canvasData(p);
        const ids = (d.labelIds ?? '').split(' ').filter(Boolean);
        if (ids.some((id) => id !== 'adam')) bad.push(`${step}: подписаны ${ids.join(', ')}`);
        if (d.notes) bad.push(`${step}: пометы ${d.notes}`);
        bad.push(...(await frameIssues(p)).map((x) => `${step}: ${x}`));
      };
      await look('линии');
      const b = (await p.locator('.sky canvas').boundingBox())!;
      await p.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
      await p.mouse.down();
      for (let k = 1; k <= 10; k++) await p.mouse.move(b.x + b.width * 0.6 - 30 * k, b.y + b.height * 0.5);
      await p.mouse.up();
      await p.waitForTimeout(900);
      await look('протяжка');
      return bad.length ? fail(bad.join('; ')) : pass();
    },
  },
  {
    n: 722,
    title: 'Этап 11, B1, горб у Ламеха: в небе «набор» с «только линиями» точек союзов нет — нет и строк под них; Ламех выше Мафусала не больше чем на полторы строки (раскладка: на одну полосу), без «только линий» точки на месте',
    run: async (p) => {
      await setup(p, { ...ARFAKSAD, hash: '#/arfaksad' });
      const d0 = await canvasData(p);
      if (!d0.dots) return fail('без «только линий» нет точек союзов');
      await toggleLines(p);
      const st = await stars(p);
      const { ky } = await viewOf(p);
      const a = st.get('lamekh');
      const b = st.get('mafusal');
      const n = st.get('noy');
      if (!a || !b || !n) return fail(`нет звёзд: Ламех ${JSON.stringify(a)}, Мафусал ${JSON.stringify(b)}, Ной ${JSON.stringify(n)}`);
      const up = (b.y - a.y) / ky;
      const down = (n.y - a.y) / ky;
      if (!(up > 0.3 && up <= 1.5)) return fail(`Ламех выше Мафусала на ${up.toFixed(2)} строки (строка ${ky.toFixed(1)} px)`);
      if (!(down <= 2.6)) return fail(`Ламех выше Ноя на ${down.toFixed(2)} строки`);
      if ((await canvasData(p)).dots) return fail('в «только линиях» нарисованы точки союзов');
      return pass(`Ламех выше Мафусала на ${up.toFixed(2)}, Ноя — на ${down.toFixed(2)} строки`);
    },
  },
  {
    n: 723,
    title: 'Этап 11, B1: в небе «набор» с «только линиями» у подписей нет «+» нераскрытых союзов (точек союзов нет — «+» ничего бы не открыл); выключили — «+» снова есть',
    run: async (p) => {
      await setup(p, { ...ARFAKSAD, hash: '#/arfaksad' });
      const before = (await canvasData(p)).foldHits ?? '';
      if (!before.includes('reveal:')) return fail(`без «только линий» нет «+»: ${before}`);
      await toggleLines(p);
      const on = (await canvasData(p)).foldHits ?? '';
      if (on.includes('reveal:')) return fail(`в «только линиях» есть «+»: ${on}`);
      await toggleLines(p);
      const off = (await canvasData(p)).foldHits ?? '';
      return off.includes('reveal:') ? pass() : fail(`после выключения «+» не вернулся: ${off}`);
    },
  },
  {
    n: 724,
    title: 'Этап 11, B1: «все лица» с «только линиями» (#/~o1) и «Родословие Иисуса Христа» в «наборе» с «только линиями» — у каждой подписи лица звезда, ленты без обрывов, подписи не за краем',
    run: async (p) => {
      const bad: string[] = [];
      await p.goto(p.url().replace(/#.*$/, '') + '#/~o1');
      await p.waitForTimeout(3000);
      bad.push(...(await frameIssues(p)).map((x) => `все лица: ${x}`));
      await setup(p, { work: LINE, start: 'lines', hash: '#/david' });
      bad.push(...(await frameIssues(p)).map((x) => `набор: ${x}`));
      await toggleLines(p);
      bad.push(...(await frameIssues(p)).map((x) => `набор и линии: ${x}`));
      if (!((await canvasData(p)).labelIds ?? '').split(' ').includes('david')) bad.push('Давид не подписан');
      return bad.length ? fail(bad.join('; ')) : pass();
    },
  },
  {
    n: 725,
    title: 'Этап 11, B1: смена темы и ширины — кадр нарисован заново целиком: цвет неба кадра — нынешний --sky, размер кадра — размер холста, буфер холста — по нему',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/david');
      await p.waitForTimeout(2500);
      const bad: string[] = [];
      const probe = async (step: string) => {
        await p.waitForTimeout(900);
        const d = await canvasData(p);
        const g = await p.evaluate(() => {
          const c = document.querySelector('.sky canvas') as HTMLCanvasElement;
          const r = c.getBoundingClientRect();
          return { w: r.width, h: r.height, bw: c.width, bh: c.height, dpr: Math.min(2, devicePixelRatio || 1), sky: getComputedStyle(document.documentElement).getPropertyValue('--sky').trim() };
        });
        if ((d.pal ?? '').toLowerCase() !== g.sky.toLowerCase()) bad.push(`${step}: цвет неба кадра ${d.pal}, темы ${g.sky}`);
        const [w, h] = (d.size ?? '0x0').split('x').map(Number);
        if (Math.abs(w - g.w) > 1 || Math.abs(h - g.h) > 1) bad.push(`${step}: кадр ${d.size}, холст ${g.w}x${g.h}`);
        if (Math.abs(g.bw - Math.round(g.w * g.dpr)) > 1) bad.push(`${step}: буфер ${g.bw} при ${g.w}·${g.dpr}`);
        bad.push(...(await frameIssues(p)).map((x) => `${step}: ${x}`));
      };
      await probe('ночь');
      await p.locator('.top .seg[aria-label="Тема"] button:text-is("День")').first().click();
      await probe('день');
      await p.setViewportSize({ width: 700, height: 800 });
      await probe('700');
      await p.setViewportSize({ width: 1440, height: 900 });
      await probe('1440');
      await p.locator('.top .seg[aria-label="Тема"] button:text-is("Ночь")').first().click();
      await probe('снова ночь');
      return bad.length ? fail(bad.join('; ')) : pass();
    },
  },
  {
    n: 727,
    title: 'Этап 11, B1 (хаос: day-390, зерно 1, шаг 20): ярусы эпох, выбран Иаков на низком телефоне (лист карточки — шапкой), телефон повернули в 360 × 844 — формула «родился после … умер после …» переносится по словам, не уходит за правый край холста и не закрывает звезду Иакова',
    view: { width: 844, height: 390, touch: true },
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/iakov~e1');
      await p.waitForTimeout(3000);
      await p.setViewportSize({ width: 360, height: 844 });
      await p.waitForTimeout(2500);
      const d = await canvasData(p);
      const t = JSON.parse(d.tiers ?? '{}') as { formula?: { text: string[]; rect: { x: number; y: number; w: number; h: number } } | null };
      const w = await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).getBoundingClientRect().width);
      const f = t.formula;
      if (!f) return fail('формулы нет');
      if (f.rect.x < 0 || f.rect.x + f.rect.w > w) return fail(`формула за краем: ${Math.round(f.rect.x)}…${Math.round(f.rect.x + f.rect.w)} при ширине ${w}`);
      const sel = ((await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.sel ?? '')) || '').split(' ').map(Number);
      if (sel.length === 2 && sel[0] > f.rect.x - 6 && sel[0] < f.rect.x + f.rect.w + 6 && sel[1] > f.rect.y - 6 && sel[1] < f.rect.y + f.rect.h + 6) return fail(`формула на звезде Иакова: ${sel.map(Math.round)} в ${JSON.stringify(f.rect)}`);
      const bad = await frameIssues(p);
      return bad.length ? fail(bad.join('; ')) : pass(`${f.text.join(' / ')}: ${Math.round(f.rect.x)}…${Math.round(f.rect.x + f.rect.w)} из ${w}`);
    },
  },
  {
    n: 728,
    title: 'Этап 11, B1: путь родства «Руфь — Давид» в режиме «только линии» — шаги только между нарисованными звёздами (от Овида к пустому месту Руфи отрезка нет), без режима — весь путь',
    run: async (p) => {
      const routes = async () => ((await canvasData(p)).kinRoutes ?? '').split(' ').filter(Boolean);
      await p.goto(p.url().replace(/#.*$/, '') + '#/ruf~bdavid~pkinship~o1');
      await p.waitForTimeout(3500);
      const on = await routes();
      if (on.includes('ruf>ovid')) return fail(`в «только линиях» есть шаг к Руфи: ${on.join(' ')}`);
      if (!on.includes('ovid>iessey')) return fail(`нет шага Овид → Иессей: ${on.join(' ')}`);
      const bad = await frameIssues(p);
      await p.goto(p.url().replace(/#.*$/, '') + '#/ruf~bdavid~pkinship');
      await p.waitForTimeout(3000);
      const off = await routes();
      if (!off.includes('ruf>ovid')) bad.push(`без «только линий» нет шага Руфь → Овид: ${off.join(' ')}`);
      return bad.length ? fail(bad.join('; ')) : pass(`только линии: ${on.join(' ')}; все лица: ${off.join(' ')}`);
    },
  },
  {
    n: 729,
    title: 'Этап 11, B1 (хаос: night-390, зерно 4, шаг 3): телефон, «набор» от Адама до Авраама, выбран Авраам — имя выбранного не ложится на точки союзов Рагава и Серуха: сначала дальние выноски, только потом поверх занятого; наложений нет',
    view: PHONE,
    run: async (p) => {
      await setup(p, { ...chain('avraam'), hash: '#/avraam' });
      const sd = await p.evaluate(() => ({ ...(document.querySelector('.sky') as HTMLElement).dataset }) as Record<string, string>);
      const over = Number((sd.labels ?? '0/0').split('/')[1]);
      if (!((await canvasData(p)).labelIds ?? '').split(' ').includes('avraam')) return fail('Авраам не подписан');
      const bad = await frameIssues(p);
      if (over) bad.push(`наложений: ${over} (${sd.overlapPairs})`);
      return bad.length ? fail(bad.join('; ')) : pass(`подписей ${sd.labels}`);
    },
  },
  {
    n: 730,
    title: 'Этап 11, B1: «только линии» у Давида, «Древо» и снова «Небо» — новое небо вписывает коридор линий, как «Всё небо» режима: строки коридора читаются (не по 2 px), подписаны Адам и Иисус Христос, у каждой подписи — звезда',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/david~o1');
      await p.waitForTimeout(3200);
      await p.locator('.top .view-switch button:text-is("Древо")').first().click();
      await p.waitForTimeout(1500);
      await p.locator('.top .view-switch button:text-is("Небо")').first().click();
      await p.waitForTimeout(2600);
      const { ky } = await viewOf(p);
      const ids = ((await canvasData(p)).labelIds ?? '').split(' ');
      const bad = await frameIssues(p);
      if (!(ky >= 10)) bad.push(`строка коридора ${ky.toFixed(1)} px`);
      for (const id of ['adam', 'iisus']) if (!ids.includes(id)) bad.push(`${id} не подписан`);
      return bad.length ? fail(bad.join('; ')) : pass(`строка ${ky.toFixed(1)} px`);
    },
  },
];
