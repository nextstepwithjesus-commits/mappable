/** Сценарии приёмки: союзы-точки на небе (решение 76), группа dots6: номера 660–679, союз-точка на небе и линии к детям. */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };

/** Цвета ветвей в теме (src/render/branches.ts, BRANCH_COLORS и BRANCH_SHADES): линия к ребёнку — одним из них. */
const BRANCH = {
  night: ['#48fd8b', '#9a75c8', '#e8968e', '#e960a2', '#81fac1', '#477dfe', '#247f46', '#b69cd7', '#99635e', '#ef8dbc', '#67c89a', '#6f9afe'],
  day: ['#137632', '#8243d8', '#e22a11', '#ce4094', '#1c8a64', '#19459a', '#0a3b19', '#6534a8', '#ac200d', '#7c2659', '#125b42', '#112e66'],
};

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

const canvasData = (p: Page) => p.evaluate(() => ({ ...(document.querySelector('.sky canvas') as HTMLCanvasElement).dataset }) as Record<string, string>);
/** Точки союзов: «союз:раскрыт:cx,cy:скрыто» (src/render/sky.ts, dataset.dots). */
type Dot = { uid: string; open: boolean; x: number; y: number; hidden: number };
async function dotsOf(p: Page): Promise<Dot[]> {
  return ((await canvasData(p)).dots ?? '')
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const m = /^(u:.*):([01]):(-?\d+),(-?\d+):(\d+)$/.exec(q);
      return m ? { uid: m[1], open: m[2] === '1', x: +m[3], y: +m[4], hidden: +m[5] } : null;
    })
    .filter((q): q is Dot => !!q);
}
/** Поле попадания точки: «союз:раскрыт:x,y,w,h» (dataset.plates). */
async function hitOf(p: Page, uid: string) {
  const q = ((await canvasData(p)).plates ?? '').split(';').find((x) => x.startsWith(`${uid}:`));
  const m = q ? /:(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(q) : null;
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
}
/** Линии союзов: скобки «союз=супруг» и линии к детям «союз>ребёнок:#цвет» (dataset.unionLines). */
async function linesOf(p: Page) {
  const all = ((await canvasData(p)).unionLines ?? '').split(';').filter(Boolean);
  return {
    spouses: all.filter((l) => l.includes('=')),
    kids: all.filter((l) => l.includes('>')).map((l) => ({ uid: l.split('>')[0], kid: l.split('>')[1].split(':')[0], color: l.split(':').pop()! })),
  };
}
/** Место звезды лица на холсте — из списка неба для клавиатуры (SkyA11y, data-x/data-y). */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  const el = p.locator(`#sky-star-${id}`);
  if (!(await el.count())) return null;
  const x = Number(await el.getAttribute('data-x'));
  const y = Number(await el.getAttribute('data-y'));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
/** Наложения подписей: «подписано/наложений» (.sky[data-labels]). */
const overlaps = async (p: Page) => Number(((await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.labels ?? '')).split('/')[1]) ?? NaN);

const ADAM_KIDS = ['adam', 'eva', 'kain', 'avel', 'sif'];
const ADAM: Scene = { work: ['adam'], opened: ['adam'], hash: '#/adam' };
const ADAM_OPEN: Scene = { work: ADAM_KIDS, opened: ['adam'], expanded: { 'u:adam+eva': 'adam' }, hash: '#/adam' };
const JACOB: Scene = {
  work: ['iakov', 'liya', 'ruvim', 'simeon', 'leviy', 'iuda', 'issakhar', 'zavulon', 'dina', 'rakhil', 'iosif', 'veniamin', 'valla', 'dan', 'neffalim', 'zelfa', 'gad', 'asir'],
  opened: ['iakov'],
  expanded: { 'u:iakov+liya': 'iakov', 'u:iakov+rakhil': 'iakov', 'u:iakov+valla': 'iakov', 'u:iakov+zelfa': 'iakov' },
  hash: '#/iakov',
};

export const dots6: Scenario[] = [
  {
    n: 660,
    title: 'Решение 76: «С Адама» — союз Адама и Евы на небе малой полой точкой у строки Адама, правее его звезды, с «+4»; от Адама к ней — скобка; картуша нет',
    run: async (p) => {
      await setup(p, ADAM);
      const ds = await dotsOf(p);
      const q = ds.find((d) => d.uid === 'u:adam+eva');
      if (!q) return fail(`нет точки союза Адама и Евы: ${(await canvasData(p)).dots || 'точек нет'}`);
      if (q.open) return fail('точка залита до раскрытия');
      if (q.hidden !== 4) return fail(`скрыто лиц: ${q.hidden}, ждали 4 (Ева и трое сыновей)`);
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      if (!(q.x > a.x + 8)) return fail(`точка не правее звезды Адама: ${q.x} при ${a.x}`);
      const dy = Math.abs(q.y - a.y);
      if (dy < 15 || dy > 36) return fail(`точка не у строки Адама: ${dy} px от неё`);
      const h = await hitOf(p, 'u:adam+eva');
      // не картуш: поле — ромб и «+4», не прямоугольник с двумя строками текста
      if (!h || h.w > 60 || h.h > 30) return fail(`поле точки ${h?.w}×${h?.h} — похоже на картуш`);
      const l = await linesOf(p);
      if (l.spouses.join() !== 'u:adam+eva=adam' || l.kids.length) return fail(`линии: ${l.spouses.join()} ${l.kids.map((k) => k.kid).join()}`);
      return (await overlaps(p)) === 0 ? pass(`точка ${q.x},${q.y}; звезда ${a.x},${a.y}; поле ${h.w}×${h.h}`) : fail('подписи наложились');
    },
  },
  {
    n: 661,
    title: 'Решение 76: раскрытый союз Адама и Евы — залитая точка между строками Адама и Евы, правее их звёзд и левее первого сына; скобки от обоих супругов; к Каину, Авелю и Сифу — по линии своего цвета ветви',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:adam+eva');
      if (!q || !q.open || q.hidden) return fail(`точка: ${JSON.stringify(q)}`);
      const st = Object.fromEntries(await Promise.all(ADAM_KIDS.map(async (id) => [id, await starAt(p, id)] as const)));
      if (Object.values(st).some((s) => !s)) return fail('не все звёзды на виду');
      const a = st.adam!;
      const e = st.eva!;
      if (!(q.y > Math.min(a.y, e.y) + 4 && q.y < Math.max(a.y, e.y) - 4)) return fail(`точка не между строками Адама (${a.y}) и Евы (${e.y}): ${q.y}`);
      const first = Math.min(st.kain!.x, st.avel!.x, st.sif!.x);
      if (!(q.x > Math.max(a.x, e.x) && q.x < first)) return fail(`точка не между звёздами супругов и детей по времени: ${q.x} (супруги ${a.x}, ${e.x}; первый сын ${first})`);
      const l = await linesOf(p);
      if (!l.spouses.includes('u:adam+eva=adam') || !l.spouses.includes('u:adam+eva=eva')) return fail(`скобки: ${l.spouses.join()}`);
      const kids = l.kids.filter((k) => k.uid === 'u:adam+eva');
      if (kids.map((k) => k.kid).sort().join() !== 'avel,kain,sif') return fail(`линии к детям: ${kids.map((k) => k.kid).join()}`);
      if (new Set(kids.map((k) => k.color)).size !== 3) return fail(`цвета линий не различаются: ${kids.map((k) => k.color).join()}`);
      if (!kids.every((k) => BRANCH.night.includes(k.color))) return fail(`цвет не из палитры ветвей: ${kids.map((k) => k.color).join()}`);
      return (await overlaps(p)) === 0 ? pass(`точка ${q.x},${q.y}; ${kids.map((k) => `${k.kid} ${k.color}`).join(', ')}`) : fail('подписи наложились');
    },
  },
  {
    n: 662,
    title: 'Решение 76: связь не дублируется — у Иакова и четырёх жён с раскрытыми союзами знаков брака «‖» нет, каждый ребёнок связан с точкой союза своей матери одной линией',
    run: async (p) => {
      await setup(p, JACOB);
      const d = await canvasData(p);
      if ((d.notes ?? '').split('|').includes('‖')) return fail('на небе остался знак брака «‖»');
      const l = await linesOf(p);
      const kids = JACOB.work.filter((id) => !['iakov', 'liya', 'rakhil', 'valla', 'zelfa'].includes(id));
      const per = new Map<string, number>();
      for (const k of l.kids) per.set(k.kid, (per.get(k.kid) ?? 0) + 1);
      const bad = kids.filter((k) => per.get(k) !== 1);
      if (bad.length) return fail(`не по одной линии: ${bad.map((k) => `${k} ${per.get(k) ?? 0}`).join(', ')}`);
      for (const w of ['liya', 'rakhil', 'valla', 'zelfa'])
        if (!l.spouses.includes(`u:iakov+${w}=${w}`) || !l.spouses.includes(`u:iakov+${w}=iakov`)) return fail(`нет скобок союза Иакова и ${w}`);
      return pass(`${l.kids.length} линий к детям, ${l.spouses.length} скобок`);
    },
  },
  {
    n: 663,
    title: 'Решения 69, 76: выбран Иаков — линии к детям цветом его ветвей по союзам: дети Лии одного цвета, Рахили — другого, у четырёх союзов — четыре цвета',
    run: async (p) => {
      await setup(p, JACOB);
      const l = await linesOf(p);
      const by = new Map<string, Set<string>>();
      for (const k of l.kids) (by.get(k.uid) ?? by.set(k.uid, new Set()).get(k.uid)!).add(k.color);
      const unions = ['u:iakov+liya', 'u:iakov+rakhil', 'u:iakov+valla', 'u:iakov+zelfa'];
      for (const u of unions) if (by.get(u)?.size !== 1) return fail(`у союза ${u} цветов: ${[...(by.get(u) ?? [])].join()}`);
      const colors = unions.map((u) => [...by.get(u)!][0]);
      if (new Set(colors).size !== 4) return fail(`цвета союзов совпали: ${colors.join()}`);
      // цвет ветви — тот же, что у метки ветви под подписью первого ребёнка (canvas[data-branches], решение 69)
      const br = JSON.parse((await canvasData(p)).branches ?? '{}') as { sel?: string; colors?: string[] };
      if (br.sel !== 'iakov' || !colors.every((c) => br.colors?.includes(c))) return fail(`цвета не из ветвей Иакова: ${colors.join()} / ${br.colors?.join()}`);
      return pass(colors.join(', '));
    },
  },
  {
    n: 664,
    title: 'Решение 76, дневная карта: точка и линии в дневной палитре ветвей; подписи не наложились',
    run: async (p) => {
      await setup(p, { ...ADAM_OPEN, theme: 'day' });
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:adam+eva');
      if (!q?.open) return fail('нет залитой точки союза');
      const kids = (await linesOf(p)).kids;
      if (kids.length !== 3 || !kids.every((k) => BRANCH.day.includes(k.color))) return fail(`цвета линий днём: ${kids.map((k) => k.color).join()}`);
      return (await overlaps(p)) === 0 ? pass(kids.map((k) => k.color).join(', ')) : fail('подписи наложились');
    },
  },
  {
    n: 665,
    title: 'Решение 76, телефон 390 × 844: точка союза Адама и Евы на виду, её поле — внутри открытого неба, подписи не наложились',
    view: PHONE,
    run: async (p) => {
      await setup(p, ADAM);
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:adam+eva');
      if (!q) return fail('нет точки союза');
      const vp = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
      if (vp.length === 4 && !(q.x > vp[0] && q.x < vp[2] && q.y > vp[1] && q.y < vp[3])) return fail(`точка вне открытого неба: ${q.x},${q.y} при ${vp.join(' ')}`);
      return (await overlaps(p)) === 0 ? pass(`точка ${q.x},${q.y}`) : fail('подписи наложились');
    },
  },
  {
    n: 666,
    title: 'Решение 76: небо «все лица» — как прежде: точек и линий союзов нет, гребёнки и отводы — прежние',
    run: async (p) => {
      await setup(p, { ...ADAM_OPEN, mode: 'all', hash: '#/adam' });
      const d = await canvasData(p);
      if (d.mode !== 'all') return fail(`режим неба: ${d.mode}`);
      if (d.dots || d.unionLines || d.plates) return fail(`в небе «все лица» точки союзов: ${d.dots} ${d.unionLines}`);
      return pass();
    },
  },
  {
    n: 667,
    title: 'Решение 76: «С Иисуса Христа» — точка союза Иосифа и Марии левее звезды Иисуса Христа, со стороны родителей, «+2»; линия от неё к Иисусу Христу',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:iosif-muzh-marii+mariya');
      const j = await starAt(p, 'iisus');
      if (!q || !j) return fail(`нет точки или звезды: ${(await canvasData(p)).dots}`);
      if (q.open || q.hidden !== 2) return fail(`точка: раскрыта ${q.open}, скрыто ${q.hidden}`);
      if (!(q.x < j.x - 8)) return fail(`точка не левее звезды: ${q.x} при ${j.x}`);
      const l = await linesOf(p);
      if (!l.kids.some((k) => k.kid === 'iisus' && k.uid === 'u:iosif-muzh-marii+mariya')) return fail('нет линии к Иисусу Христу');
      return (await overlaps(p)) === 0 ? pass(`точка ${q.x},${q.y}, звезда ${j.x},${j.y}`) : fail('подписи наложились');
    },
  },
  {
    n: 668,
    title: 'Решение 76: «Условные знаки» — союз на небе описан точкой: ромб между супругами, линии к детям цвета ветви, залитый — раскрыт, полый с числом — свёрнут; образец нарисован',
    run: async (p) => {
      await setup(p, ADAM);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const t = (await p.locator('.app > .sheet').innerText()).replace(/\s+/g, ' ');
      for (const w of ['Союз на небе', 'малый ромб между строками мужа и жены', 'цвета его ветви', 'Залитый ромб — союз раскрыт', 'полый с числом — свёрнут'])
        if (!t.includes(w)) return fail(`в «Условных знаках» нет «${w}»`);
      return pass();
    },
  },
];
