/** Сценарии приёмки: раскрытие родословия и союзы (решения 67–72), группа reveal4: номера 500–519, раскрытие на небе и карточки союзов на небе. */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

/** Картуш союза на холсте: «союз:раскрыт:x,y,w,h» (src/render/sky.ts, dataset.plates). */
type Plate = { uid: string; open: boolean; x: number; y: number; w: number; h: number };

const PHONE = { width: 390, height: 844, touch: true };

/**
 * Небо «набор» в заданном состоянии раскрытия (src/ui/reveal.ts, src/ui/work.ts): набор, лица с показанными союзами,
 * раскрытые союзы; адрес hash выбирает лицо. Начало — «С Адама» (выбор начала — сценарии группы start4).
 */
async function setup(p: Page, o: { work: string[]; opened?: string[]; expanded?: Record<string, string>; hash: string; start?: string }) {
  await p.evaluate((o) => {
    localStorage.setItem('toledot:intro', 'true');
    localStorage.setItem('toledot:start', JSON.stringify(o.start ?? 'adam'));
    localStorage.setItem('toledot:work', JSON.stringify(o.work.map((id, i) => [id, { via: i ? 'family' : 'self', of: o.work[0] }])));
    localStorage.setItem('toledot:reveal', JSON.stringify({ opened: o.opened ?? [], expanded: o.expanded ?? {} }));
    sessionStorage.setItem('toledot:skymode', JSON.stringify('work'));
  }, o);
  await p.goto(p.url().replace(/#.*$/, '') + o.hash);
  await p.reload();
  await p.waitForTimeout(2600);
}

const canvasData = (p: Page) => p.evaluate(() => ({ ...(document.querySelector('.sky canvas') as HTMLCanvasElement).dataset }) as Record<string, string>);

async function platesOf(p: Page): Promise<Plate[]> {
  const d = await canvasData(p);
  return (d.plates ?? '')
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const m = /^(u:.*):([01]):(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(q);
      return m ? { uid: m[1], open: m[2] === '1', x: +m[3], y: +m[4], w: +m[5], h: +m[6] } : null;
    })
    .filter((q): q is Plate => !!q);
}
const plateOf = async (p: Page, uid: string) => (await platesOf(p)).find((q) => q.uid === uid) ?? null;

/** Точка холста в координатах страницы. */
async function pageAt(p: Page, x: number, y: number) {
  const b = (await p.locator('.sky canvas').boundingBox())!;
  return { x: b.x + x, y: b.y + y };
}
const clickPlate = async (p: Page, q: Plate) => {
  const at = await pageAt(p, q.x + q.w / 2, q.y + q.h / 2);
  await p.mouse.click(at.x, at.y);
};
/** Место звезды лица на холсте — из списка неба для клавиатуры (SkyA11y, data-x/data-y). */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  const el = p.locator(`#sky-star-${id}`);
  if (!(await el.count())) return null;
  const x = Number(await el.getAttribute('data-x'));
  const y = Number(await el.getAttribute('data-y'));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
const stored = (p: Page) =>
  p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string, unknown][]).map((r) => r[0]).sort());
const reveal = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('toledot:reveal') ?? '{}') as { opened: string[]; expanded: Record<string, string> });
const liveText = (p: Page) => p.evaluate(() => [...document.querySelectorAll('.sky [aria-live]')].map((e) => (e.textContent ?? '').replace(/ /g, ' ').trim()).join(' | '));
const near = (a: Plate, b: Plate, d: number) => Math.abs(a.x - b.x) <= d && Math.abs(a.y - b.y) <= d;
const inside = (pt: { x: number; y: number }, r: Plate) => pt.x > r.x && pt.x < r.x + r.w && pt.y > r.y && pt.y < r.y + r.h;

const ADAM = { work: ['adam'], opened: ['adam'], hash: '#/adam' };
const ADAM_OPEN = { work: ['adam', 'eva', 'kain', 'avel', 'sif'], opened: ['adam'], expanded: { 'u:adam+eva': 'adam' }, hash: '#/adam' };

/** Ширина окна неба в годах из адреса (поле «~w»). */
const windowYears = (p: Page) => Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1] ?? NaN);

export const reveal4: Scenario[] = [
  {
    n: 500,
    title: 'С Адама: на небе Адам и картуш «Адам и Ева» со знаком «+»; у Адама нет «+» (его союзы показаны); окно — не всё небо',
    run: async (p) => {
      await setup(p, ADAM);
      const d = await canvasData(p);
      if (d.mode !== 'work') return fail(`режим неба: ${d.mode}`);
      const q = await plateOf(p, 'u:adam+eva');
      if (!q) return fail(`нет картуша «Адам и Ева»: ${d.plates || 'картушей нет'}`);
      if (q.open) return fail('картуш раскрыт до щелчка');
      if ((d.foldHits ?? '').includes('reveal:adam:')) return fail('у Адама «+», хотя его союзы показаны');
      const w = Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1] ?? NaN);
      return w < 1500 ? pass(`картуш ${q.w}×${q.h} px; окно ${w} лет`) : fail(`окно ${w} лет — почти всё небо`);
    },
  },
  {
    n: 501,
    title: 'Щелчок по картушу раскрывает союз: Ева, Каин, Авель и Сиф на небе, знак «−», картуш на месте экрана, звёзды не под картушем; объявление «Раскрыт союз Адама и Евы: 4 лица»',
    run: async (p) => {
      await setup(p, ADAM);
      const q0 = await plateOf(p, 'u:adam+eva');
      if (!q0) return fail('нет картуша');
      await clickPlate(p, q0);
      await p.waitForTimeout(1200);
      const ids = await stored(p);
      if (ids.join(' ') !== 'adam avel eva kain sif') return fail(`набор после щелчка: ${ids.join(' ')}`);
      const q1 = await plateOf(p, 'u:adam+eva');
      if (!q1 || !q1.open) return fail('картуш не раскрыт');
      if (!near(q0, q1, 3)) return fail(`картуш сдвинулся: ${q0.x},${q0.y} → ${q1.x},${q1.y}`);
      for (const id of ids) {
        const s = await starAt(p, id);
        if (s && inside(s, q1)) return fail(`звезда ${id} под картушем`);
      }
      const said = await liveText(p);
      if (!/Раскрыт союз Адама и Евы: 4 лица/.test(said)) return fail(`объявление: «${said}»`);
      // карточка союза — в листе (решение 71)
      if (!(await p.locator('.folio[data-union="u:adam+eva"]').count())) return fail('карточка союза не открылась в листе');
      const d = await canvasData(p);
      return pass(`картуш на месте (${q1.x},${q1.y}); подписи ${d.named}`);
    },
  },
  {
    n: 502,
    title: 'Повторный щелчок сворачивает союз: на небе снова один Адам, небо не прыгает; объявление «Свёрнут союз Адама и Евы: скрыто 4 лица»',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const q0 = await plateOf(p, 'u:adam+eva');
      const a0 = await starAt(p, 'adam');
      if (!q0 || !q0.open || !a0) return fail('нет раскрытого картуша или звезды Адама');
      await clickPlate(p, q0);
      await p.waitForTimeout(1000);
      const ids = await stored(p);
      if (ids.join(' ') !== 'adam') return fail(`набор после свёртки: ${ids.join(' ')}`);
      const q1 = await plateOf(p, 'u:adam+eva');
      const a1 = await starAt(p, 'adam');
      if (!q1 || q1.open) return fail('картуш не свёрнут');
      if (!a1 || Math.abs(a1.x - a0.x) > 2 || Math.abs(a1.y - a0.y) > 3) return fail(`Адам сдвинулся: ${a0.x},${a0.y} → ${a1?.x},${a1?.y}`);
      const said = await liveText(p);
      return /Свёрнут союз Адама и Евы: скрыто 4 лица/.test(said) ? pass() : fail(`объявление: «${said}»`);
    },
  },
  {
    n: 503,
    title: 'Подсказка картуша: «Союз Адама и Евы: сыновья Каин (Быт 4:1), … — щёлкните, чтобы раскрыть»; курсор — рука',
    run: async (p) => {
      await setup(p, ADAM);
      const q = await plateOf(p, 'u:adam+eva');
      if (!q) return fail('нет картуша');
      const at = await pageAt(p, q.x + q.w / 2, q.y + q.h / 2);
      await p.mouse.move(at.x - 30, at.y - 40);
      await p.mouse.move(at.x, at.y, { steps: 4 });
      await p.waitForTimeout(700);
      const tip = p.locator('.sky .tip[data-shown]');
      if (!(await tip.count())) return fail('подсказки нет');
      const t = (await tip.innerText()).replace(/ /g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ');
      if (!/^Союз Адама и Евы: сыновья Каин \(Быт 4:1\)/.test(t) || !/щёлкните, чтобы раскрыть/.test(t)) return fail(`подсказка: «${t}»`);
      const hot = await p.locator('.sky canvas.hot').count();
      return hot ? pass(t) : fail('курсор не рука');
    },
  },
  {
    n: 504,
    title: 'Щелчок по звезде в небе «набор» — карточка лица и его союзы на небе; повторный щелчок их не прячет',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const k = await starAt(p, 'kain');
      if (!k) return fail('нет звезды Каина');
      const at = await pageAt(p, k.x, k.y);
      await p.mouse.click(at.x, at.y);
      await p.waitForTimeout(900);
      if (!/#\/kain/.test(p.url())) return fail(`выбрано не лицо Каина: ${p.url()}`);
      if (!(await plateOf(p, 'u:kain+'))) return fail(`нет картуша союза Каина: ${(await canvasData(p)).plates}`);
      await p.mouse.click(at.x, at.y);
      await p.waitForTimeout(700);
      const r = await reveal(p);
      return (await plateOf(p, 'u:kain+')) && r.opened.includes('kain') ? pass() : fail('повторный щелчок спрятал союзы Каина');
    },
  },
  {
    n: 505,
    title: '«+» после подписи лица с нераскрытыми союзами: у Каина есть, у Адама нет; щелчок по «+» показывает союзы Каина',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const d = await canvasData(p);
      const hit = (d.foldHits ?? '').split(';').find((h) => h.startsWith('reveal:kain:'));
      if (!hit) return fail(`нет «+» у Каина: ${d.foldHits}`);
      if ((d.foldHits ?? '').includes('reveal:adam:')) return fail('«+» у Адама, чьи союзы показаны');
      const [x, y, w, h] = hit.split(':')[2].split(',').map(Number);
      const at = await pageAt(p, x + w / 2, y + h / 2);
      await p.mouse.click(at.x, at.y);
      await p.waitForTimeout(700);
      const r = await reveal(p);
      if (!r.opened.includes('kain')) return fail('союзы Каина не показаны');
      return (await plateOf(p, 'u:kain+')) ? pass() : fail('нет картуша союза Каина');
    },
  },
  {
    n: 506,
    title: 'Клавиатура: стрелками — к картушу союза (холст называет его), Enter раскрывает; объявление в живой области',
    run: async (p) => {
      await setup(p, ADAM);
      await p.locator('.sky canvas').focus();
      await p.waitForTimeout(300);
      let id = '';
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
        await p.keyboard.press(key);
        await p.waitForTimeout(250);
        id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
        if (id.startsWith('sky-plate-')) break;
      }
      if (!id.startsWith('sky-plate-')) return fail(`фокус не пришёл на картуш: ${id || 'нет'}`);
      const label = (await p.locator(`#${id}`).getAttribute('aria-label')) ?? '';
      if (!/^Союз Адама и Евы/.test(label.replace(/ /g, ' '))) return fail(`пункт картуша: «${label}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1000);
      const ids = await stored(p);
      if (!ids.includes('sif')) return fail(`Enter не раскрыл союз: ${ids.join(' ')}`);
      const said = await liveText(p);
      return /Раскрыт союз Адама и Евы/.test(said) ? pass(label.replace(/ /g, ' ')) : fail(`объявление: «${said}»`);
    },
  },
  {
    n: 507,
    title: 'Касание, 390 × 844: поле картуша не меньше 44 px — касание у края рамки раскрывает союз',
    view: PHONE,
    run: async (p) => {
      await setup(p, ADAM);
      const q = await plateOf(p, 'u:adam+eva');
      if (!q) return fail('нет картуша');
      // касание чуть ниже нарисованной рамки, но в поле 44 px
      const dy = Math.max(2, Math.min(8, (44 - q.h) / 2 - 1));
      const at = await pageAt(p, q.x + q.w / 2, q.y + q.h + dy);
      await p.touchscreen.tap(at.x, at.y);
      await p.waitForTimeout(1100);
      const ids = await stored(p);
      return ids.includes('eva') && ids.includes('sif') ? pass(`картуш ${q.w}×${q.h}, касание на ${dy.toFixed(0)} px ниже рамки`) : fail(`набор после касания: ${ids.join(' ')}`);
    },
  },
  {
    n: 508,
    title: 'Авраам: три союза с детьми — Сарра, Агарь, Хеттура (наложница) — три картуша без наложений на подписи и друг на друга',
    run: async (p) => {
      await setup(p, { work: ['avraam'], opened: ['avraam'], hash: '#/avraam' });
      const ps = await platesOf(p);
      const want = ['u:avraam+sarra', 'u:avraam+agar', 'u:avraam+khettura'];
      const miss = want.filter((u) => !ps.some((q) => q.uid === u));
      if (miss.length) return fail(`нет картушей: ${miss.join(', ')}`);
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i];
          const b = ps[j];
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return fail(`картуши ${a.uid} и ${b.uid} наложились`);
        }
      const labels = await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.labels ?? '');
      const over = Number(labels.split('/')[1] ?? NaN);
      return over === 0 ? pass(`${ps.length} картушей; подписи ${labels}`) : fail(`наложений подписей: ${labels}`);
    },
  },
  {
    n: 509,
    title: 'С Иисуса Христа: картуш «Иосиф и Мария» над звездой слева; щелчок раскрывает родителей — картуш у следа Иосифа, почти на том же месте экрана (сдвиг — только чтобы вписать родителей), родители на виду',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const uid = 'u:iosif-muzh-marii+mariya';
      const q0 = await plateOf(p, uid);
      const j = await starAt(p, 'iisus');
      if (!q0 || !j) return fail(`нет картуша или звезды: ${(await canvasData(p)).plates}`);
      if (!(q0.x + q0.w <= j.x && q0.y + q0.h <= j.y)) return fail(`картуш не над звездой слева: ${q0.x},${q0.y} ${q0.w}×${q0.h}, звезда ${j.x},${j.y}`);
      await clickPlate(p, q0);
      await p.waitForTimeout(1300);
      const ids = await stored(p);
      if (!ids.includes('iosif-muzh-marii') || !ids.includes('mariya')) return fail(`набор: ${ids.join(' ')}`);
      const q1 = await plateOf(p, uid);
      if (!q1 || !q1.open) return fail('картуш не раскрыт');
      const js = await starAt(p, 'iosif-muzh-marii');
      const ms = await starAt(p, 'mariya');
      if (!js || !ms) return fail('родителей нет на виду');
      const vp = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
      if (js.x < vp[0] || ms.x < vp[0] || js.x > vp[2] || ms.x > vp[2]) return fail(`родители за краем: Иосиф ${js.x}, Мария ${ms.x}`);
      if (Math.abs(q1.y - js.y) > 60) return fail(`картуш не у следа Иосифа: ${q1.y} при следе ${js.y}`);
      if (!(await p.locator(`.folio[data-union="${uid}"]`).count())) return fail('карточка союза не открылась в листе');
      return near(q0, q1, 80) ? pass(`картуш ${q0.x},${q0.y} → ${q1.x},${q1.y}`) : fail(`картуш сдвинулся: ${q0.x},${q0.y} → ${q1.x},${q1.y}`);
    },
  },
  {
    n: 510,
    title: 'Начало с одного лица: окно — вокруг него с запасом на поколение-два (Адам — до рождения внуков, Иисус Христос — от рождения дедов), не всё небо; картуш союза на виду',
    run: async (p) => {
      const out: string[] = [];
      for (const [id, uid, lo, hi] of [
        ['adam', 'u:adam+eva', 150, 600],
        ['iisus', 'u:iosif-muzh-marii+mariya', 60, 250],
      ] as const) {
        await setup(p, { work: [id], opened: [id], hash: '#/', start: id === 'adam' ? 'adam' : 'jesus' });
        const w = windowYears(p);
        if (!(w >= lo && w <= hi)) return fail(`${id}: окно ${w} лет, ждали ${lo}–${hi}`);
        const s = await starAt(p, id);
        if (!s) return fail(`${id}: звезды нет на виду`);
        if (!(await plateOf(p, uid))) return fail(`${id}: нет картуша ${uid}`);
        out.push(`${id} — ${w} лет`);
      }
      return pass(out.join('; '));
    },
  },
];
