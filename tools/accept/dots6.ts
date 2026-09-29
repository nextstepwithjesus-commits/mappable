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
/** Связи кадра (этап 11; src/render/links.ts, linkLog): «вид|начертание|ключ|x,y,…» и узлы «node|open|ключ|x,y[|+N]». */
async function linkLog(p: Page): Promise<{ kind: string; style: string; ks: string; pts: number[] }[]> {
  return ((await canvasData(p)).links ?? '')
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [kind, style, ks, pts] = q.split('|');
      return { kind, style, ks, pts: (pts ?? '').split(',').map(Number) };
    });
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
    // этап 11 (решение 78, Г4): ромб союза стоит на следе матери, а если её на небе нет — на следе отца, там, где из него
    // выходит ствол к детям; прежняя точка «у строки Адама» между строками и скобка к ней ушли с неба
    title: 'Решения 76, 78: «С Адама» — союз Адама и Евы на небе полым ромбом с «+4» на следе Адама, правее его звезды; линий к детям нет; картуша нет',
    run: async (p) => {
      await setup(p, ADAM);
      const ds = await dotsOf(p);
      const q = ds.find((d) => d.uid === 'u:adam+eva');
      if (!q) return fail(`нет ромба союза Адама и Евы: ${(await canvasData(p)).dots || 'ромбов нет'}`);
      if (q.open) return fail('ромб залит до раскрытия');
      if (q.hidden !== 4) return fail(`скрыто лиц: ${q.hidden}, ждали 4 (Ева и трое сыновей)`);
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      if (!(q.x > a.x + 8)) return fail(`ромб не правее звезды Адама: ${q.x} при ${a.x}`);
      if (Math.abs(q.y - a.y) > 1.5) return fail(`ромб не на следе Адама: ${Math.abs(q.y - a.y)} px от строки`);
      const node = (await linkLog(p)).find((l) => l.kind === 'node' && l.ks === 'u.adam.eva._');
      if (!node || node.style !== 'shut') return fail(`журнал связей: ромб ${node ? node.style : 'нет'}`);
      const h = await hitOf(p, 'u:adam+eva');
      // не картуш: поле — ромб, не прямоугольник с двумя строками текста
      if (!h || h.w > 60 || h.h > 30) return fail(`поле ромба ${h?.w}×${h?.h} — похоже на картуш`);
      const l = await linesOf(p);
      if (l.kids.length) return fail(`линии к детям при свёрнутом союзе: ${l.kids.map((k) => k.kid).join()}`);
      return (await overlaps(p)) === 0 ? pass(`ромб ${q.x},${q.y}; звезда ${a.x},${a.y}; поле ${h.w}×${h.h}`) : fail('подписи наложились');
    },
  },
  {
    n: 661,
    // этап 11 (Г4, § 3, § 9): ромб — на следе Евы (матери), от Адама к нему — черта брака; к Каину и Авелю — зубцы цвета
    // своей ветви выбранного Адама; к Сифу — лента линии Мессии (она и есть связь к ребёнку линии), зубца у него нет
    title: 'Решения 76, 78, 79: раскрытый союз Адама и Евы — залитый ромб на следе Евы, правее звёзд супругов и левее первого сына; от Адама к нему — черта брака или ствол; к Каину и Авелю — зубцы цвета своих ветвей, к Сифу — лента',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:adam+eva');
      if (!q || !q.open || q.hidden) return fail(`ромб: ${JSON.stringify(q)}`);
      const st = Object.fromEntries(await Promise.all(ADAM_KIDS.map(async (id) => [id, await starAt(p, id)] as const)));
      if (Object.values(st).some((s) => !s)) return fail('не все звёзды на виду');
      const a = st.adam!;
      const e = st.eva!;
      if (Math.abs(q.y - e.y) > 1.5) return fail(`ромб не на следе Евы (${e.y}): ${q.y}`);
      const first = Math.min(st.kain!.x, st.avel!.x, st.sif!.x);
      if (!(q.x > Math.max(a.x, e.x) && q.x < first)) return fail(`ромб не между звёздами супругов и детей по времени: ${q.x} (супруги ${a.x}, ${e.x}; первый сын ${first})`);
      const l = await linesOf(p);
      // от следа Адама к ромбу на следе Евы — черта брака (или ствол союза, если между ними её дети)
      const log = await linkLog(p);
      const ys = log.filter((r) => r.kind !== 'node' && r.kind !== 'join' && (r.ks === 's.adam.eva._.adam' || r.ks === 'u.adam.eva._')).flatMap((r) => r.pts.filter((_, k) => k % 2 === 1));
      if (!ys.length || Math.min(...ys) > Math.min(a.y, e.y) + 1.5 || Math.max(...ys) < Math.max(a.y, e.y) - 1.5) return fail(`нет линии от Адама к ромбу: ${l.spouses.join()}`);
      const kids = l.kids.filter((k) => k.uid === 'u:adam+eva');
      if (kids.map((k) => k.kid).sort().join() !== 'avel,kain') return fail(`зубцы к детям: ${kids.map((k) => k.kid).join()}`);
      if (new Set(kids.map((k) => k.color)).size !== 2) return fail(`цвета зубцов не различаются: ${kids.map((k) => k.color).join()}`);
      if (!kids.every((k) => BRANCH.night.includes(k.color))) return fail(`цвет не из палитры ветвей: ${kids.map((k) => k.color).join()}`);
      if (!log.some((r) => r.kind === 'ribbon' && /^r\.[jm]\.sif$/.test(r.ks))) return fail('к Сифу нет ленты');
      return (await overlaps(p)) === 0 ? pass(`ромб ${q.x},${q.y}; ${kids.map((k) => `${k.kid} ${k.color}`).join(', ')}; Сиф — лента`) : fail('подписи наложились');
    },
  },
  {
    n: 662,
    // этап 11 (Г4, Г8): ромб каждого союза — на следе его матери, от Иакова к нему — черта брака (линия связи, а не знак
    // «‖» в подписях); к каждому ребёнку — одна связь: зубец, а у ребёнка линии Мессии — лента
    title: 'Решения 76, 78: связь не дублируется — у Иакова и четырёх жён знака «‖» в подписях нет, от Иакова к ромбу каждой жены — черта брака или ствол союза, каждый ребёнок связан с союзом своей матери одной линией (зубец или лента)',
    run: async (p) => {
      await setup(p, JACOB);
      const d = await canvasData(p);
      if ((d.notes ?? '').split('|').includes('‖')) return fail('на небе остался знак брака «‖» в подписях');
      const log = await linkLog(p);
      const kids = JACOB.work.filter((id) => !['iakov', 'liya', 'rakhil', 'valla', 'zelfa'].includes(id));
      const per = new Map<string, number>();
      for (const q of log) {
        if (q.kind === 'tooth' && q.ks.startsWith('k.iakov.')) per.set(q.ks.split('.').pop()!, (per.get(q.ks.split('.').pop()!) ?? 0) + 1);
        if (q.kind === 'ribbon') per.set(q.ks.split('.').pop()!, (per.get(q.ks.split('.').pop()!) ?? 0) + 1);
      }
      const bad = kids.filter((k) => per.get(k) !== 1);
      if (bad.length) return fail(`не по одной линии: ${bad.map((k) => `${k} ${per.get(k) ?? 0}`).join(', ')}`);
      // от следа Иакова к ромбу на следе жены — черта брака (или ступенька лестницы), а если между ними её дети — ствол союза
      const j = await starAt(p, 'iakov');
      if (!j) return fail('нет звезды Иакова');
      // линии союзов Иакова (стволы, черты брака, ступеньки лестницы) — связный рисунок: от строки Иакова по лестнице союзов
      // до ромба каждой жены (Г4: лестница — общая шина с узлами союзов)
      const segs: number[][] = [];
      for (const q of log)
        if (q.kind !== 'node' && q.kind !== 'join' && q.kind !== 'tooth' && /^[su]\.iakov\./.test(q.ks))
          for (let k = 0; k + 3 < q.pts.length; k += 2) segs.push(q.pts.slice(k, k + 4));
      const on = (x: number, y: number, g: number[]) => Math.abs(g[0] - g[2]) < 0.6 ? Math.abs(x - g[0]) < 1.5 && y >= Math.min(g[1], g[3]) - 1.5 && y <= Math.max(g[1], g[3]) + 1.5 : Math.abs(y - g[1]) < 1.5 && x >= Math.min(g[0], g[2]) - 1.5 && x <= Math.max(g[0], g[2]) + 1.5;
      const reach = (x: number, y: number) => {
        const seen = new Set<number>();
        const todo = segs.map((_, i) => i).filter((i) => on(x, y, segs[i]));
        while (todo.length) {
          const i = todo.pop()!;
          if (seen.has(i)) continue;
          seen.add(i);
          const g = segs[i];
          for (let k = 0; k < segs.length; k++) if (!seen.has(k) && (on(g[0], g[1], segs[k]) || on(g[2], g[3], segs[k]) || on(segs[k][0], segs[k][1], g) || on(segs[k][2], segs[k][3], g))) todo.push(k);
        }
        return [...seen].some((i) => Math.min(segs[i][1], segs[i][3]) <= j.y + 1.5 && Math.max(segs[i][1], segs[i][3]) >= j.y - 1.5);
      };
      for (const w of ['liya', 'rakhil', 'valla', 'zelfa']) {
        const n = log.find((q) => q.kind === 'node' && q.ks === `u.iakov.${w}._`);
        if (!n) return fail(`нет ромба союза Иакова и ${w}`);
        if (!reach(n.pts[0], n.pts[1])) return fail(`нет линии от Иакова к ромбу союза с ${w}`);
      }
      return pass(`${kids.length} детей — по одной линии; от Иакова — к ромбам четырёх жён`);
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
    // этап 11: к Сифу — лента (§ 3), зубцов два
    title: 'Решения 76, 78, дневная карта: ромб и зубцы к Каину и Авелю в дневной палитре ветвей; подписи не наложились',
    run: async (p) => {
      await setup(p, { ...ADAM_OPEN, theme: 'day' });
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:adam+eva');
      if (!q?.open) return fail('нет залитого ромба союза');
      // этап 11 (§ 3): к Сифу — лента, зубцы — к Каину и Авелю
      const kids = (await linesOf(p)).kids;
      if (kids.length !== 2 || !kids.every((k) => BRANCH.day.includes(k.color))) return fail(`цвета зубцов днём: ${kids.map((k) => k.color).join()}`);
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
    // этап 11 (§ 4.1): «все лица» — карта остаётся, но связи рисует та же грамматика: ромбы на следах, стволы, зубцы; союзов
    // «набора» с «+N» (свёрнутых) там нет
    title: 'Решения 76, 78: небо «все лица» — грамматика связей карты: ромб союза Адама и Евы, стволы и зубцы; свёрнутых союзов с «+N» нет',
    run: async (p) => {
      await setup(p, { ...ADAM_OPEN, mode: 'all', hash: '#/adam' });
      const d = await canvasData(p);
      if (d.mode !== 'all') return fail(`режим неба: ${d.mode}`);
      const log = await linkLog(p);
      if (!log.some((q) => q.kind === 'node' && q.ks === 'u.adam.eva._')) return fail('нет ромба союза Адама и Евы');
      if (!log.some((q) => q.kind === 'tooth') || !log.some((q) => q.kind === 'trunk')) return fail('нет стволов и зубцов');
      const shut = log.filter((q) => q.kind === 'node' && q.style === 'shut');
      if (shut.length) return fail(`свёрнутые союзы на «всех лицах»: ${shut.map((q) => q.ks).join(', ')}`);
      return pass(`${log.length} связей и узлов`);
    },
  },
  {
    n: 667,
    // этап 11 (Г4): ромб свёрнутого союза встаёт в год первого ребёнка на его строке (следа родителей на небе нет)
    title: 'Решения 76, 78: «С Иисуса Христа» — полый ромб союза Иосифа и Марии с «+2» левее звезды Иисуса Христа на его строке; связь от него к Иисусу Христу',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const q = (await dotsOf(p)).find((d) => d.uid === 'u:iosif-muzh-marii+mariya');
      const j = await starAt(p, 'iisus');
      if (!q || !j) return fail(`нет точки или звезды: ${(await canvasData(p)).dots}`);
      if (q.open || q.hidden !== 2) return fail(`точка: раскрыта ${q.open}, скрыто ${q.hidden}`);
      if (!(q.x < j.x - 8)) return fail(`ромб не левее звезды: ${q.x} при ${j.x}`);
      // этап 11 (Г4): родителей на небе нет — ромб на строке Иисуса Христа, у ствола к нему
      if (Math.abs(q.y - j.y) > 1.5) return fail(`ромб не на строке Иисуса Христа: ${q.y} при ${j.y}`);
      const log = await linkLog(p);
      if (!log.some((r) => (r.kind === 'tooth' || r.kind === 'ribbon' || r.kind === 'trunk') && r.ks.endsWith('iisus'))) return fail('нет связи к Иисусу Христу');
      return (await overlaps(p)) === 0 ? pass(`точка ${q.x},${q.y}, звезда ${j.x},${j.y}`) : fail('подписи наложились');
    },
  },
  {
    n: 668,
    // этап 11 (решение 78, Г4): ромб союза стоит на следе матери, от него — ствол и зубцы; цвет — у ветвей выбранного лица
    title: 'Решения 76, 78: «Условные знаки» — союз на небе: ромб на следе матери, черта брака, ствол и зубцы к детям, залитый — дети показаны, полый с числом — свёрнуты; образец нарисован',
    run: async (p) => {
      await setup(p, ADAM);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const t = (await p.locator('.app > .sheet').innerText()).replace(/\s+/g, ' ');
      for (const w of ['Союз на небе', 'Ромб союза стоит на следе матери', 'черта брака', 'короткие зубцы к детям', 'Залитый ромб — дети показаны', 'полый с числом — свёрнуты'])
        if (!t.includes(w)) return fail(`в «Условных знаках» нет «${w}»`);
      if (!(await p.locator('.app > .sheet canvas').count())) return fail('образцов нет');
      return pass();
    },
  },
];
