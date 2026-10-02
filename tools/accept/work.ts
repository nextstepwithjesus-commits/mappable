/**
 * Сценарии приёмки этапа 6b: решения владельца 16 и 17.
 * view — масштаб по двум осям и размер областей (J1, J2), номера 190–199;
 * workset — рабочий набор, небо по набору, свёртка, стопка карточек (J3–J6), номера 200–219.
 * Каждый агент правит только свой блок.
 */
import type { Scenario } from './kit.ts';

// view
// J1, J2 (агент view): масштаб по двум осям и размер областей. Проверки — по окну неба .sky[data-view]
// («vp.l vp.t vp.r vp.b x0 kx laneTop ky»: kx — масштаб времени, ky — высота полосы), по адресу (поле h) и памяти
// браузера («toledot:lanes», «toledot:widths»), по ручкам [role="separator"] (aria-valuenow — ширина области).
import type { Page as VPage } from 'playwright';
import { pass as vok, fail as vno } from './kit.ts';

/** Окно неба: масштаб времени kx, высота полосы ky, видимая часть. */
const vcam = async (p: VPage) => {
  const [l, t, r, b, x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  return { l, t, r, b, x0, kx, laneTop, ky };
};
const vgo = async (p: VPage, hash: string, ms = 2400) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Отношение a к b близко к want (с допуском tol). */
const near = (a: number, b: number, want: number, tol = 0.03) => Math.abs(a / b / want - 1) <= tol;
const fmt = (c: { kx: number; ky: number }) => `kx ${c.kx.toFixed(4)}, полоса ${c.ky.toFixed(1)} px`;
/** Окно на масштабе семьи: Давид, 120 лет на ширину. */
const FAMILY = '#/david~y-1000~w120~l0.0';
/** Лист «Вид» над блоком органов неба (широкое небо): открыть, если закрыт. */
async function openViewPop(p: VPage, tap = false) {
  if (await p.locator('.viewpop').count()) return;
  const b = p.locator('.skyctl .view-toggle');
  await (tap ? b.tap() : b.click());
  await p.waitForTimeout(300);
}
/** Кнопка оси в листе «Вид» (широкое небо — над блоком, узкое — лист у колонки). */
const axisBtn = (p: VPage, label: string) => p.locator(`.viewpop button[aria-label="${label}"], .sky .sheet button[aria-label="${label}"]`).first();
/** Замеры подписей: нарисовано/наложений и подписано/видимых звёзд. */
async function vlabels(p: VPage) {
  const d = (await p.evaluate(`({ labels: document.querySelector('.sky').dataset.labels, named: document.querySelector('.sky canvas').dataset.named, rows: document.querySelector('.sky canvas').dataset.rows, mode: document.querySelector('.sky canvas').dataset.mode })`)) as Record<string, string>;
  const [drawn, over] = (d.labels ?? '0/0').split('/').map(Number);
  const [named, stars] = (d.named ?? '0/0').split('/').map(Number);
  return { drawn, over, named, stars, rows: Number(d.rows), mode: d.mode };
}
/** Два пальца: от a0, b0 к a1, b1 за steps шагов (CDP, как в phone.ts). */
async function pinch(p: VPage, a0: [number, number], b0: [number, number], a1: [number, number], b1: [number, number], steps = 8) {
  const cdp = await p.context().newCDPSession(p);
  const pt = (x: number, y: number, id: number) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(...a0, 1), pt(...b0, 2)] });
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const lerp = (q: [number, number], r: [number, number]) => [q[0] + (r[0] - q[0]) * u, q[1] + (r[1] - q[1]) * u] as [number, number];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(...lerp(a0, a1), 1), pt(...lerp(b0, b1), 2)] });
    await p.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await p.waitForTimeout(400);
}
/** Ширина области по ручке: aria-valuenow. */
const splitW = async (p: VPage, side: 'sheet' | 'folio') => Number(await p.locator(`.resizer-${side}`).getAttribute('aria-valuenow'));
/** Протянуть ручку мышью на dx px. */
async function dragSplit(p: VPage, side: 'sheet' | 'folio', dx: number) {
  const b = (await p.locator(`.resizer-${side}`).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + dx / 2, y, { steps: 4 });
  await p.mouse.move(x + dx, y, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(500);
}
/** Ширина неба на экране. */
const skyW = async (p: VPage) => (await p.locator('.sky').boundingBox())!.width;

const view: Scenario[] = [
  {
    n: 190,
    title: 'J1 мышью: органы неба в две строки; лист «Вид» — «полосы +» выше в 1,5 раза при том же времени, «время +» вдвое шире при той же полосе, «по умолчанию» — обычная полоса',
    run: async (p) => {
      await vgo(p, FAMILY);
      const box = (await p.locator('.skyctl').boundingBox())!;
      if (box.height > 90) return vno(`блок органов неба ${Math.round(box.width)} × ${Math.round(box.height)} — больше двух строк`);
      await openViewPop(p);
      if (!(await p.locator('.viewpop').isVisible())) return vno('лист «Вид» не открылся');
      const c0 = await vcam(p);
      await axisBtn(p, 'Строки выше').click();
      // адрес пишется через 300 мс после того, как небо остановилось (D8)
      await p.waitForTimeout(900);
      const c1 = await vcam(p);
      if (!near(c1.kx, c0.kx, 1, 0.001) || !near(c1.ky, c0.ky, 1.5)) return vno(`«полосы +»: было ${fmt(c0)}, стало ${fmt(c1)}`);
      if (!p.url().includes('~h1.5')) return vno(`в адресе нет пропорции h1.5: ${p.url()}`);
      await axisBtn(p, 'Растянуть время').click();
      await p.waitForTimeout(500);
      const c2 = await vcam(p);
      if (!near(c2.kx, c1.kx, 2) || !near(c2.ky, c1.ky, 1, 0.005)) return vno(`«время +»: было ${fmt(c1)}, стало ${fmt(c2)}`);
      await axisBtn(p, 'Пропорции по умолчанию').click();
      await p.waitForTimeout(900);
      const c3 = await vcam(p);
      if (!near(c3.kx, c2.kx, 1, 0.001) || c3.ky >= c2.ky) return vno(`«по умолчанию»: было ${fmt(c2)}, стало ${fmt(c3)}`);
      if ((await axisBtn(p, 'Пропорции по умолчанию').getAttribute('aria-disabled')) !== 'true') return vno('«по умолчанию» не выключилась');
      if (p.url().includes('~h')) return vno(`пропорция осталась в адресе: ${p.url()}`);
      return vok(`блок ${Math.round(box.width)} × ${Math.round(box.height)}; ${fmt(c0)} → ${fmt(c1)} → ${fmt(c2)} → ${fmt(c3)}`);
    },
  },
  {
    n: 191,
    title: 'J1 мышью: протяжка по линейке лет — только время, по буквам полос — только полосы; колесо с Ctrl и Shift — время, с Shift — сдвиг по времени, с Alt — полосы; колесо без клавиш — прежний масштаб (D1, решение 47)',
    run: async (p) => {
      await vgo(p, FAMILY);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const c0 = await vcam(p);
      // линейка лет: курсор ew-resize, протяжка вправо на 160 px — время вдвое
      await p.mouse.move(box.x + 420, box.y + 12);
      await p.waitForTimeout(100);
      const cur = await p.locator('.sky canvas').evaluate((c) => getComputedStyle(c).cursor);
      if (cur !== 'ew-resize') return vno(`курсор над линейкой — ${cur}`);
      await p.mouse.down();
      await p.mouse.move(box.x + 500, box.y + 12, { steps: 5 });
      await p.mouse.move(box.x + 580, box.y + 12, { steps: 5 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const c1 = await vcam(p);
      if (!near(c1.kx, c0.kx, 2, 0.05) || !near(c1.ky, c0.ky, 1, 0.01)) return vno(`линейка: было ${fmt(c0)}, стало ${fmt(c1)}`);
      // буквы полос: протяжка вниз на 60 px — полосы в √2 раз выше
      await p.mouse.move(box.x + 8, box.y + 400);
      await p.waitForTimeout(100);
      const cur2 = await p.locator('.sky canvas').evaluate((c) => getComputedStyle(c).cursor);
      if (cur2 !== 'ns-resize') return vno(`курсор над буквами полос — ${cur2}`);
      await p.mouse.down();
      await p.mouse.move(box.x + 8, box.y + 430, { steps: 4 });
      await p.mouse.move(box.x + 8, box.y + 460, { steps: 4 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const c2 = await vcam(p);
      if (!near(c2.kx, c1.kx, 1, 0.001) || !near(c2.ky, c1.ky, Math.SQRT2, 0.05)) return vno(`буквы полос: было ${fmt(c1)}, стало ${fmt(c2)}`);
      // колесо с Ctrl и Shift — время ×1,5, с Shift — сдвиг по времени без масштаба (решение 47), с Alt — полосы ÷1,25
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.keyboard.down('Control');
      await p.keyboard.down('Shift');
      await p.mouse.wheel(0, -100);
      await p.keyboard.up('Shift');
      await p.keyboard.up('Control');
      await p.waitForTimeout(400);
      const c3 = await vcam(p);
      if (!near(c3.kx, c2.kx, 1.5) || !near(c3.ky, c2.ky, 1, 0.01)) return vno(`Ctrl + Shift + колесо: было ${fmt(c2)}, стало ${fmt(c3)}`);
      await p.keyboard.down('Shift');
      await p.mouse.wheel(0, -100);
      await p.keyboard.up('Shift');
      await p.waitForTimeout(400);
      const c35 = await vcam(p);
      const back = (c3.x0 - c35.x0) * c3.kx;
      if (c35.kx !== c3.kx || c35.ky !== c3.ky || !(back > 80 && back < 120)) return vno(`Shift + колесо вверх: сдвиг ${back.toFixed(0)} px к ранним годам; было ${fmt(c3)}, стало ${fmt(c35)}`);
      await p.keyboard.down('Alt');
      await p.mouse.wheel(0, 100);
      await p.keyboard.up('Alt');
      await p.waitForTimeout(400);
      const c4 = await vcam(p);
      if (!near(c4.kx, c3.kx, 1, 0.001) || !near(c4.ky, c3.ky, 1 / 1.25)) return vno(`Alt + колесо: было ${fmt(c3)}, стало ${fmt(c4)}`);
      // колесо без клавиш — масштаб у указателя ×1,5 по времени, пропорция полос та же
      await p.mouse.wheel(0, -100);
      await p.waitForTimeout(400);
      const c5 = await vcam(p);
      if (!near(c5.kx, c4.kx, 1.5)) return vno(`колесо: было ${fmt(c4)}, стало ${fmt(c5)}`);
      // протяжка по небу — сдвиг, масштаб прежний
      await p.mouse.move(box.x + 600, box.y + 500);
      await p.mouse.down();
      await p.mouse.move(box.x + 500, box.y + 450, { steps: 5 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const c6 = await vcam(p);
      if (c6.kx !== c5.kx || c6.ky !== c5.ky || c6.x0 === c5.x0) return vno('протяжка по небу не сдвинула небо или сменила масштаб');
      return vok(`${fmt(c0)} → линейка ${fmt(c1)} → буквы ${fmt(c2)} → Shift ${fmt(c3)} → Alt ${fmt(c4)} → колесо ${fmt(c5)}`);
    },
  },
  {
    n: 192,
    title: 'J1 клавиатурой: Shift и «+»/«−» — время, Alt и «+»/«−» — полосы, «+» — обычный масштаб; «Вид» открывается Enter, Tab ведёт в лист, Escape закрывает и возвращает фокус',
    run: async (p) => {
      await vgo(p, FAMILY);
      await p.locator('.sky canvas').focus();
      const c0 = await vcam(p);
      await p.keyboard.press('Shift+Equal');
      await p.waitForTimeout(400);
      const c1 = await vcam(p);
      if (!near(c1.kx, c0.kx, 2) || !near(c1.ky, c0.ky, 1, 0.005)) return vno(`Shift и «+»: было ${fmt(c0)}, стало ${fmt(c1)}`);
      await p.keyboard.press('Shift+Minus');
      await p.waitForTimeout(400);
      const c2 = await vcam(p);
      if (!near(c2.kx, c0.kx, 1, 0.01)) return vno(`Shift и «−»: было ${fmt(c1)}, стало ${fmt(c2)}`);
      await p.keyboard.press('Alt+Equal');
      await p.waitForTimeout(400);
      const c3 = await vcam(p);
      if (!near(c3.kx, c2.kx, 1, 0.001) || !near(c3.ky, c2.ky, 1.5)) return vno(`Alt и «+»: было ${fmt(c2)}, стало ${fmt(c3)}`);
      await p.keyboard.press('Alt+Minus');
      await p.waitForTimeout(400);
      const c4 = await vcam(p);
      if (!near(c4.ky, c2.ky, 1, 0.01)) return vno(`Alt и «−»: было ${fmt(c3)}, стало ${fmt(c4)}`);
      await p.keyboard.press('Equal');
      await p.waitForTimeout(400);
      const c5 = await vcam(p);
      if (!near(c5.kx, c4.kx, 2)) return vno(`«+»: было ${fmt(c4)}, стало ${fmt(c5)}`);
      // лист «Вид» с клавиатуры
      await p.locator('.skyctl .view-toggle').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      if (!(await p.locator('.viewpop').isVisible())) return vno('Enter на «Вид» не открыл лист');
      await p.keyboard.press('Tab');
      const inside = await p.evaluate(`!!document.activeElement && !!document.activeElement.closest('.viewpop')`);
      if (!inside) return vno('Tab после «Вид» не ведёт в лист');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      if (await p.locator('.viewpop').count()) return vno('Escape не закрыл лист «Вид»');
      const back = await p.evaluate(`document.activeElement === document.querySelector('.skyctl .view-toggle')`);
      if (!back) return vno('фокус не вернулся на «Вид»');
      // Escape снял лист, а не выбранное лицо
      if (!p.url().includes('#/david')) return vno('Escape снял выбранное лицо вместе с листом');
      return vok(`${fmt(c0)} → Shift ${fmt(c1)} → Alt ${fmt(c3)} → «+» ${fmt(c5)}`);
    },
  },
  {
    n: 193,
    title: 'J1 пальцем, 390 × 844: щипок по горизонтали — только время, по вертикали — только полосы, наискосок — обычный масштаб; лист «Вид» — «Пропорции»',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await vgo(p, '#/~y-1000~w300~l0.0', 2600);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const cx = box.x + box.width * 0.45;
      const cy = box.y + box.height * 0.45;
      const c0 = await vcam(p);
      await pinch(p, [cx - 40, cy + 4], [cx + 40, cy - 4], [cx - 110, cy + 4], [cx + 110, cy - 4]);
      const c1 = await vcam(p);
      if (!(c1.kx > c0.kx * 2) || !near(c1.ky, c0.ky, 1, 0.01)) return vno(`щипок по горизонтали: было ${fmt(c0)}, стало ${fmt(c1)}`);
      await pinch(p, [cx + 3, cy - 40], [cx - 3, cy + 40], [cx + 3, cy - 90], [cx - 3, cy + 90]);
      const c2 = await vcam(p);
      if (!near(c2.kx, c1.kx, 1, 0.01) || !(c2.ky > c1.ky * 1.8)) return vno(`щипок по вертикали: было ${fmt(c1)}, стало ${fmt(c2)}`);
      await pinch(p, [cx - 40, cy - 40], [cx + 40, cy + 40], [cx - 20, cy - 20], [cx + 20, cy + 20]);
      const c3 = await vcam(p);
      if (!(c3.kx < c2.kx * 0.7)) return vno(`щипок наискосок: было ${fmt(c2)}, стало ${fmt(c3)}`);
      await p.locator('.skyctl.column button', { hasText: 'Вид' }).tap();
      await p.waitForTimeout(400);
      const sheet = p.locator('.sky .sheet');
      if (!(await sheet.getByText('Пропорции', { exact: true }).count())) return vno('в листе «Вид» нет «Пропорций»');
      const n = await sheet.locator('.axes button').count();
      await axisBtn(p, 'Строки ниже').tap();
      await p.waitForTimeout(500);
      const c4 = await vcam(p);
      if (!near(c4.ky, c3.ky, 1 / 1.5)) return vno(`«Строки ниже»: было ${fmt(c3)}, стало ${fmt(c4)}`);
      // цели касания — не меньше 44 px
      const small = await sheet.locator('.axes button').evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().height < 44).length);
      if (small) return vno(`кнопок пропорций ниже 44 px: ${small}`);
      return vok(`${fmt(c0)} → по горизонтали ${fmt(c1)} → по вертикали ${fmt(c2)} → наискосок ${fmt(c3)}; в листе ${n} кнопок`);
    },
  },
  {
    n: 194,
    title: 'J1: пропорция в адресе (h) и в памяти браузера — адрес в новой вкладке даёт ту же высоту полосы; «#/» без полей берёт пропорцию из памяти; «по умолчанию» убирает её отовсюду',
    run: async (p) => {
      await vgo(p, FAMILY);
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('Alt+Equal');
      await p.waitForTimeout(400);
      await p.keyboard.press('Alt+Equal');
      await p.waitForTimeout(800);
      const c1 = await vcam(p);
      const url = p.url();
      if (!url.includes('~h2.25')) return vno(`в адресе нет h2.25: ${url}`);
      const stored = await p.evaluate(`localStorage.getItem('toledot:lanes')`);
      if (stored !== '2.25') return vno(`в памяти браузера пропорция ${stored}`);
      // новая вкладка с пустым хранилищем: пропорция — из адреса
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(url);
        await q.waitForTimeout(2600);
        const c2 = await vcam(q);
        if (!near(c2.ky, c1.ky, 1, 0.01) || !near(c2.kx, c1.kx, 1, 0.02)) return vno(`новая вкладка: ${fmt(c2)}, а было ${fmt(c1)}`);
      } finally {
        await ctx.close();
      }
      // тот же браузер, новая вкладка, адрес без полей вида: пропорция — из памяти, и адрес её дописывает
      const q2 = await p.context().newPage();
      try {
        await q2.goto(url.replace(/#.*$/, '') + '#/');
        await q2.waitForTimeout(2600);
        if (!q2.url().includes('~h2.25')) return vno(`«#/» не взял пропорцию из памяти: ${q2.url()}`);
      } finally {
        await q2.close();
      }
      await openViewPop(p);
      await axisBtn(p, 'Пропорции по умолчанию').click();
      await p.waitForTimeout(800);
      const left = await p.evaluate(`localStorage.getItem('toledot:lanes')`);
      if (p.url().includes('~h') || left !== null) return vno(`после «по умолчанию»: адрес ${p.url()}, память ${left}`);
      return vok(`${fmt(c1)}; ${url.replace(/^.*#/, '#')}`);
    },
  },
  {
    n: 195,
    title: 'J1: подписи зависят от высоты полосы — на масштабе семьи при 60 px подписаны все видимые звёзды, при 4 px и при сжатом до обзора времени подписи не налезают',
    run: async (p) => {
      await vgo(p, FAMILY);
      await p.locator('.sky canvas').focus();
      for (let i = 0; i < 8; i++) {
        await p.keyboard.press('Alt+Equal');
        await p.waitForTimeout(300);
      }
      await p.waitForTimeout(500);
      const hi = await vcam(p);
      const a = await vlabels(p);
      if (Math.round(hi.ky) !== 60) return vno(`полоса ${hi.ky.toFixed(1)} px, а не 60`);
      if (a.over || a.stars < 5) return vno(`60 px: наложений ${a.over}, подписано ${a.named}/${a.stars}`);
      // второй круг (решение 163, как в 274): имя не стоит на чужой вертикали — где места нет, лицо без подписи; тогда оно в
      // canvas[data-hidden] и в строке «Без подписи на небе» карточки у звезды (решение 153), если она есть
      if (a.named !== a.stars) {
        if (a.named < a.stars * 0.75) return vno(`60 px: подписано ${a.named}/${a.stars}`);
        const d = (await p.evaluate(`(() => { const c = document.querySelector('.sky canvas'); const r = c.getBoundingClientRect(); const vis = [...document.querySelectorAll('#sky-stars button[data-x]')].map((b) => ({ id: b.id.replace(/^sky-star-/, ''), x: +b.dataset.x, y: +b.dataset.y })).filter((q) => q.x > 0 && q.x < r.width && q.y > 0 && q.y < r.height); return { vis: vis.map((q) => q.id), labels: c.dataset.labelIds ?? '', hidden: c.dataset.hidden ?? '' }; })()`)) as { vis: string[]; labels: string; hidden: string };
        const named = new Set(d.labels.split(' '));
        const hidden = new Set(d.hidden.split(' '));
        const lost = d.vis.filter((id) => !named.has(id) && !hidden.has(id));
        if (lost.length) return vno(`60 px: без подписи и не в списке скрытых — ${lost.join(', ')}`);
        // строка «Без подписи на небе» называет родню первого колена выбранного (родители, супруги, дети; DotCard, HiddenKin)
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { ROOT } = await import('../bible.ts');
        type P = { id: string; f?: string; m?: string; sp?: { id: string }[] };
        const persons = (JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: P[] }).persons;
        const me = persons.find((q) => q.id === 'david')!;
        const kin = new Set([me.f, me.m, ...(me.sp ?? []).map((x) => x.id)].filter((x): x is string => !!x));
        for (const q of persons) if (q.f === 'david' || q.m === 'david' || (q.sp ?? []).some((x) => x.id === 'david')) kin.add(q.id);
        const bare = d.vis.filter((id) => !named.has(id) && kin.has(id));
        const at = await p.locator('.sky').getAttribute('data-sel');
        const cb = await p.locator('.sky > canvas').boundingBox();
        if (at && cb) {
          const [sx, sy] = at.split(' ').map(Number);
          await p.mouse.click(cb.x + sx, cb.y + sy);
          await p.waitForTimeout(1500);
          if (await p.locator('.sky .dotcard').count()) {
            const ids = ((await p.locator('.sky .dotcard .dc-hidden').getAttribute('data-ids', { timeout: 2000 }).catch(() => null)) ?? '').split(' ');
            const miss = bare.filter((id) => !ids.includes(id));
            if (miss.length) return vno(`60 px: без подписи и не в строке «Без подписи на небе» — ${miss.join(', ')}`);
          }
          await p.keyboard.press('Escape');
          await p.waitForTimeout(500);
          await p.locator('.sky canvas').focus();
        }
      }
      for (let i = 0; i < 16; i++) {
        await p.keyboard.press('Alt+Minus');
        await p.waitForTimeout(300);
      }
      await p.waitForTimeout(500);
      const lo = await vcam(p);
      const b = await vlabels(p);
      if (Math.round(lo.ky) !== 4) return vno(`полоса ${lo.ky.toFixed(1)} px, а не 4`);
      if (b.over) return vno(`4 px: наложений ${b.over}`);
      // обычная полоса, затем время сжато до обзора: полоса прежняя, подписи без наложений
      await vgo(p, '#/~y-1000~w120~l0.0');
      await p.locator('.sky canvas').focus();
      for (let i = 0; i < 8; i++) {
        await p.keyboard.press('Shift+Minus');
        await p.waitForTimeout(300);
      }
      await p.waitForTimeout(500);
      const c = await vlabels(p);
      if (c.over) return vno(`время сжато до обзора: наложений ${c.over}`);
      return vok(`60 px: ${a.named}/${a.stars}; 4 px: ${b.named}/${b.stars}, подписей ${b.drawn}; обзор с высокими полосами: ${c.named}/${c.stars}, наложений 0`);
    },
  },
  {
    n: 196,
    title: 'J1 пальцем, 390 × 844: показ «набор» с высоким набором (Давид с предками и потомками) — «Строки ниже» делает строки ниже, все строки набора — в видимой части, подписи без наложений',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await vgo(p, '#/david', 2600);
      await p.locator('.folio .bar-toggle').tap();
      await p.waitForTimeout(600);
      for (const what of ['С потомками: все', 'С предками: все']) {
        await p.locator('.folio .workbtn > button').tap();
        await p.waitForTimeout(250);
        await p.locator(`.workpick button[aria-label="${what}"]`).first().tap();
        await p.waitForTimeout(300);
      }
      await p.locator('.folio .sheet-bar .close').tap();
      await p.waitForTimeout(600);
      // показ «набор» — строкой показа (этап 11, решение 81; прежде — переключатель «все лица | набор» в листе «Вид»)
      await showSet(p, true);
      await p.locator('.skyctl.column button', { hasText: 'Вид' }).tap();
      await p.waitForTimeout(400);
      await axisBtn(p, 'Строки ниже').tap();
      await p.waitForTimeout(400);
      const c0 = await vcam(p);
      await p.locator('.sky .sheet .sheet-head .close').tap();
      await p.waitForTimeout(500);
      // «Вписать» — весь показ в окне (этап 11, Я30: прежде кнопка называлась «Всё небо»)
      await p.locator('.skyctl.column button', { hasText: 'Вписать' }).tap();
      await p.waitForTimeout(1600);
      const c1 = await vcam(p);
      const d = await vlabels(p);
      if (d.mode !== 'work' || d.rows < 20) return vno(`режим ${d.mode}, строк ${d.rows}`);
      if (d.over) return vno(`наложений ${d.over}`);
      const tall = d.rows * c1.ky;
      if (tall > c1.b - c1.t) return vno(`строки набора ${Math.round(tall)} px выше видимой части ${Math.round(c1.b - c1.t)} px`);
      return vok(`строк ${d.rows}, полоса ${c1.ky.toFixed(1)} px (после «Строки ниже» ${c0.ky.toFixed(1)}), высота набора ${Math.round(tall)} из ${Math.round(c1.b - c1.t)} px; подписано ${d.named}/${d.stars}`);
    },
  },
  {
    n: 197,
    title: 'J2 мышью, 1920 × 1080: границы «панель | небо» и «небо | карточка» перетаскиваются; небо не уже max(480, 40 %); двойной щелчок — ширина по умолчанию; ширины помнятся после перезагрузки',
    view: { width: 1920, height: 1080 },
    run: async (p) => {
      await vgo(p, `${FAMILY}~pkinship`, 2600);
      if (!(await p.locator('.resizer-sheet').count()) || !(await p.locator('.resizer-folio').count())) return vno('нет ручек-разделителей');
      const cur = await p.locator('.resizer-folio').evaluate((e) => getComputedStyle(e).cursor);
      if (cur !== 'col-resize') return vno(`курсор ручки — ${cur}`);
      const f0 = await splitW(p, 'folio');
      const s0 = await splitW(p, 'sheet');
      await dragSplit(p, 'folio', -100);
      const f1 = await splitW(p, 'folio');
      const real = (await p.locator('.folio').boundingBox())!.width;
      if (f1 !== f0 + 100 || Math.abs(real - f1) > 1) return vno(`карточка: было ${f0}, стало ${f1} (на экране ${Math.round(real)})`);
      // панель тянется, пока небу не останется max(480, 40 %) = 768 px; карточка не сдвигается и не сворачивается
      await dragSplit(p, 'sheet', 400);
      const s1 = await splitW(p, 'sheet');
      const w1 = await skyW(p);
      if (Math.round(w1) !== 768 || (await splitW(p, 'folio')) !== f1 || (await p.locator('.folio.spine').count()))
        return vno(`небо ${Math.round(w1)} px, панель ${s1}, карточка ${await splitW(p, 'folio')}, корешок: ${await p.locator('.folio.spine').count()}`);
      await p.reload();
      await p.waitForTimeout(2600);
      if ((await splitW(p, 'folio')) !== f1 || (await splitW(p, 'sheet')) !== s1) return vno(`после перезагрузки: карточка ${await splitW(p, 'folio')}, панель ${await splitW(p, 'sheet')}`);
      await p.locator('.resizer-folio').dblclick();
      await p.waitForTimeout(400);
      await p.locator('.resizer-sheet').dblclick();
      await p.waitForTimeout(400);
      const f2 = await splitW(p, 'folio');
      const s2 = await splitW(p, 'sheet');
      if (f2 !== f0 || s2 !== s0) return vno(`двойной щелчок: карточка ${f2}, панель ${s2}`);
      const mem = await p.evaluate(`localStorage.getItem('toledot:widths')`);
      if (mem !== null) return vno(`ширины по умолчанию остались в памяти: ${mem}`);
      return vok(`карточка ${f0} → ${f1}, панель ${s0} → ${s1}, небо ${Math.round(w1)} px; двойной щелчок — ${f2} и ${s2}`);
    },
  },
  {
    n: 198,
    title: 'J2 клавиатурой, 1920 × 1080: на ручке стрелки меняют ширину и не двигают небо, Home и End — пределы, Enter — по умолчанию; F — небо во весь экран (панель и карточка — корешки), F ещё раз — всё как было',
    view: { width: 1920, height: 1080 },
    run: async (p) => {
      await vgo(p, `${FAMILY}~pkinship`, 2600);
      const h = p.locator('.resizer-folio');
      await h.focus();
      const c0 = await vcam(p);
      const f0 = await splitW(p, 'folio');
      await p.keyboard.press('ArrowLeft');
      await p.keyboard.press('Shift+ArrowLeft');
      await p.waitForTimeout(300);
      const f1 = await splitW(p, 'folio');
      if (f1 !== f0 + 80) return vno(`стрелки: было ${f0}, стало ${f1}`);
      const c1 = await vcam(p);
      if (c1.laneTop !== c0.laneTop) return vno('стрелки на ручке сдвинули небо по полосам');
      await p.keyboard.press('Home');
      await p.waitForTimeout(200);
      const lo = await splitW(p, 'folio');
      const min = Number(await h.getAttribute('aria-valuemin'));
      await p.keyboard.press('End');
      await p.waitForTimeout(200);
      const hi = await splitW(p, 'folio');
      const max = Number(await h.getAttribute('aria-valuemax'));
      if (lo !== min || lo !== 360 || hi !== max) return vno(`Home ${lo} (предел ${min}), End ${hi} (предел ${max})`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      if ((await splitW(p, 'folio')) !== f0) return vno(`Enter: ${await splitW(p, 'folio')}, а по умолчанию ${f0}`);
      // F — во весь экран
      const w0 = await skyW(p);
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('KeyF');
      await p.waitForTimeout(600);
      const w1 = await skyW(p);
      const spines = (await p.locator('.folio.spine').count()) + (await p.locator('.sheet.spine').count());
      if (spines !== 2 || Math.round(w1) !== 1920 - 112) return vno(`F: корешков ${spines}, небо ${Math.round(w1)} px`);
      if (await p.locator('[role="separator"].resizer').count()) return vno('во весь экран остались ручки');
      await p.keyboard.press('KeyF');
      await p.waitForTimeout(600);
      const w2 = await skyW(p);
      if (Math.round(w2) !== Math.round(w0) || (await p.locator('.spine').count()) || !(await p.locator('.sheet h2').count())) return vno(`F ещё раз: небо ${Math.round(w2)} px, было ${Math.round(w0)}`);
      return vok(`${f0} → ${f1}; пределы ${lo}…${hi}; небо ${Math.round(w0)} → ${Math.round(w1)} → ${Math.round(w2)} px`);
    },
  },
  {
    n: 199,
    title: 'J2 пальцем: планшет 1024 × 768 — граница карточки тянется пальцем, «небо во весь экран» в листе «Вид», «развернуть» на корешке возвращает всё; телефон 390 × 844 — ручек нет, F ничего не сворачивает',
    view: { width: 1024, height: 768, touch: true },
    run: async (p) => {
      await vgo(p, FAMILY, 2600);
      const f0 = await splitW(p, 'folio');
      const b = (await p.locator('.resizer-folio').boundingBox())!;
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      const cdp = await p.context().newCDPSession(p);
      const pt = (px: number) => [{ x: px, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x) });
      for (let k = 1; k <= 8; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x - (60 * k) / 8) });
        await p.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(500);
      const f1 = await splitW(p, 'folio');
      if (f1 !== f0 + 60) return vno(`пальцем: карточка ${f0} → ${f1}`);
      // «небо во весь экран» в листе «Вид» (небо 564 px — органы колонкой, IX-56: лист «Вид» у колонки)
      await p.locator('.skyctl.column button', { hasText: 'Вид' }).tap();
      await p.waitForTimeout(300);
      await p.locator('.sky .sheet button', { hasText: 'небо во весь экран' }).tap();
      await p.waitForTimeout(600);
      if (!(await p.locator('.folio.spine').count())) return vno('«небо во весь экран» не свернуло карточку');
      await p.locator('.folio.spine .unfold').tap();
      await p.waitForTimeout(600);
      if ((await p.locator('.spine').count()) || (await splitW(p, 'folio')) !== f1) return vno(`«развернуть»: корешков ${await p.locator('.spine').count()}, карточка ${await splitW(p, 'folio')}`);
      // телефон: ручек нет, F ничего не сворачивает
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '') + '#/david');
        await q.waitForTimeout(2600);
        await q.keyboard.press('KeyF');
        await q.waitForTimeout(400);
        const splits = await q.locator('.resizer').count();
        const spines = await q.locator('.spine').count();
        if (splits || spines) return vno(`телефон: ручек ${splits}, корешков ${spines}`);
      } finally {
        await ctx.close();
      }
      return vok(`карточка ${f0} → ${f1} пальцем; во весь экран и обратно`);
    },
  },
];

// workset
// J3–J6 (агент workset): рабочий набор, небо по набору, свёртка, стопка карточек (этап 12, решение 91: вкладки). Проверки — по разметке и замерам неба:
// .sky canvas[data-mode|data-rows|data-named|data-folds|data-fold-hits], .sky[data-labels], localStorage «toledot:work».
import type { Page } from 'playwright';
import { pass as ok, fail as no, find as seek, hashId as idOf } from './kit.ts';

const W_PHONE = { width: 390, height: 844, touch: true };
const nbsp = (s: string) => s.replace(/ /g, ' ');
const wgo = async (p: Page, hash: string, ms = 2200) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Набор из памяти браузера: id лиц по порядку добавления. */
const stored = async (p: Page): Promise<string[]> => ((await p.evaluate(`JSON.parse(localStorage.getItem('toledot:work') || '[]').map((r) => r[0])`)) as string[]);
/** Замеры холста неба. */
const skyData = async (p: Page) => (await p.evaluate(`({ ...document.querySelector('.sky canvas').dataset, labels: document.querySelector('.sky').dataset.labels })`)) as Record<string, string>;
/** Добавить лицо открытой карточки в набор: команда шапки и пункт выбора объёма (по подписи для диктора или по тексту). */
async function takeFromCard(p: Page, what: string, tap = false) {
  const b = p.locator('.folio .workbtn > button');
  if (tap) await b.tap();
  else await b.click();
  await p.waitForTimeout(250);
  const it = p.locator(`.workpick button[aria-label="${what}"], .workpick button:text-is("${what}")`).first();
  if (tap) await it.tap();
  else await it.click();
  await p.waitForTimeout(300);
}
/** Открыть панель «Набор» командой верхней строки (или из «Ещё», «Разделов»; этап 11 — прежде «В работе»). */
async function openWork(p: Page, tap = false) {
  const direct = p.locator('.top .commands > button', { hasText: 'Набор' });
  if ((await direct.count()) && (await direct.first().isVisible())) await (tap ? direct.first().tap() : direct.first().click());
  else {
    const more = p.locator('.top .commands .menu > button');
    await (tap ? more.first().tap() : more.first().click());
    await p.waitForTimeout(200);
    const item = p.locator('.top .commands [role^="menuitem"]', { hasText: 'Набор' }).first();
    await (tap ? item.tap() : item.click());
  }
  await p.waitForTimeout(700);
}
/**
 * Показ «набор» строкой показа: «изменить» → лист «Показ» → «Набор» (этап 11, решение 81; прежде — переключатель неба
 * «все лица | набор», которого больше нет). На телефоне лист применяется кнопкой «Показать N лиц».
 */
async function showSet(p: Page, tap = false) {
  const edit = p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' });
  await (tap ? edit.tap() : edit.click());
  await p.waitForTimeout(400);
  const r = p.locator('.showsheet label.ss-kind:has(input[value="set"])');
  await (tap ? r.tap() : r.click());
  await p.waitForTimeout(500);
  const apply = p.locator('.showsheet .ss-apply .apply');
  if (await apply.count()) await (tap ? apply.tap() : apply.click());
  else await p.locator('.showsheet .sheet-head .close').click();
  await p.waitForTimeout(1500);
}
/** Показ «всё небо» строкой показа (этап 11; прежде — «все лица» переключателя неба). */
async function showAllSky(p: Page, tap = false) {
  const b = p.locator('.sky .showbar .sb-cmd', { hasText: 'всё небо' });
  await (tap ? b.tap() : b.click());
  await p.waitForTimeout(1500);
}
/** Точка звезды выбранного лица на экране (data-sel — px холста). */
async function selPoint(p: Page): Promise<{ x: number; y: number } | null> {
  const v = await p.locator('.sky').getAttribute('data-sel');
  if (!v) return null;
  const [x, y] = v.split(' ').map(Number);
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + x, y: c.y + y };
}
/** Мировое место звезды выбранного лица (время и строка): по нему звезду находят после сдвига неба (как в phone.ts). */
async function worldSel(p: Page): Promise<{ X: number; row: number } | null> {
  return (await p.evaluate(`(() => {
    const el = document.querySelector('.sky');
    if (!el.dataset.sel) return null;
    const [sx, sy] = el.dataset.sel.split(' ').map(Number);
    const [, , , , x0, kx, laneTop, ky] = el.dataset.view.split(' ').map(Number);
    return { X: x0 + sx / kx, row: laneTop - sy / ky };
  })()`)) as { X: number; row: number } | null;
}
/** Точка экрана для мирового места при нынешней камере неба. */
async function screenOfWorld(p: Page, w: { X: number; row: number }): Promise<{ x: number; y: number }> {
  const [, , , , x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + (w.X - x0) * kx, y: c.y + (laneTop - w.row) * ky };
}
/** Знак свёрнутого на небе: «вид:id» → середина его прямоугольника на экране. */
async function foldHit(p: Page, key: string): Promise<{ x: number; y: number } | null> {
  const d = await skyData(p);
  const hit = (d.foldHits ?? '').split(';').find((h) => h.startsWith(`${key}:`));
  if (!hit) return null;
  const [x, y, w, h] = hit.split(':')[2].split(',').map(Number);
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + x + w / 2, y: c.y + y + h / 2 };
}

const workset: Scenario[] = [
  {
    n: 200,
    title: 'J3 мышью: карточка Давида — «Добавить в набор» с предками на 2 поколения; «Набор» в верхней строке, число лиц в заголовке, группа «Давид и его предки (3)»: лицо первым, дальше по рождению',
    run: async (p) => {
      await wgo(p, '#/david');
      await takeFromCard(p, 'С предками: 2 поколения');
      const set = await stored(p);
      if (set.join(' ') !== 'david iessey ovid') return no(`набор: ${set.join(' ')}`);
      const b = p.locator('.folio .workbtn > button');
      // этап 7 (решение 26; UX-48): команда карточки — «В наборе ▾», верхняя строка — «Набор: N» (этап 11, Я30: прежде «В работе: N»)
      if (!/^В наборе/.test((await b.innerText()).trim()) || (await b.getAttribute('aria-pressed')) !== 'true') return no('команда карточки не стала «В наборе ▾»');
      if (!/^Набор: 3$/.test((await p.locator('.top .commands > button', { hasText: 'Набор' }).innerText()).trim())) return no('в верхней строке нет «Набор: 3»');
      await openWork(p);
      const title = nbsp(await p.locator('section.sheet h2').innerText());
      if (title !== 'Набор: 3 лица') return no(`заголовок панели: «${title}»`);
      // VIS-83 (круг 3): одна группа по происхождению с заголовком; внутри — само лицо первым, дальше по рождению
      const heads = (await p.locator('.worklist .wg-head').allInnerTexts()).map((t) => nbsp(t.trim()));
      if (heads.join(' | ') !== 'Давид и его предки (3)') return no(`заголовки групп: ${heads.join(' | ') || 'нет'}`);
      const names = (await p.locator('.worklist .wi-row .nm').allInnerTexts()).map((t) => t.trim());
      if (names.join(' ') !== 'Давид Овид Иессей') return no(`порядок: ${names.join(', ')}`);
      // строка разворачивается: «Кратко» и команды
      await p.locator('.worklist .wi-row', { hasText: 'Иессей' }).click();
      await p.waitForTimeout(700);
      const body = p.locator('.worklist li.open .wi-body');
      if (!(await body.locator('.brief').count())) return no('у развёрнутой строки нет «Кратко»');
      const cmds = (await body.locator('button').allInnerTexts()).map((t) => t.trim());
      if (!cmds.includes('Открыть карточку') || !cmds.includes('Убрать из набора')) return no(`команды строки: ${cmds.join(', ')}`);
      return ok(`${title}; ${names.join(', ')}`);
    },
  },
  {
    n: 201,
    title: 'J3: набор переживает перезагрузку; «Убрать с родословной» убирает взятых с лицом; «Очистить набор» и «Вернуть»; пустой набор — строка о том, как его собрать',
    run: async (p) => {
      await wgo(p, '#/david');
      await takeFromCard(p, 'С семьёй');
      const n0 = (await stored(p)).length;
      await p.reload();
      await p.waitForTimeout(2200);
      if ((await stored(p)).length !== n0) return no('набор не пережил перезагрузку');
      await openWork(p);
      await p.locator('.worklist .wi-row:has(.nm:text-is("Давид"))').click();
      await p.waitForTimeout(500);
      await p.locator('.worklist li.open button', { hasText: 'Убрать с родословной' }).click();
      await p.waitForTimeout(400);
      if ((await stored(p)).length !== 0) return no(`после «Убрать с родословной» в наборе: ${(await stored(p)).join(' ')}`);
      const empty = nbsp(await p.locator('.work-empty').innerText());
      if (!/Добавить в набор/.test(empty)) return no(`пустой набор: «${empty}»`);
      await wgo(p, '#/ruf');
      // «Только Руфи» — имя в родительном падеже (VIS-47)
      await takeFromCard(p, 'Только Руфи');
      await p.locator('section.sheet button', { hasText: 'Очистить набор' }).click();
      await p.waitForTimeout(300);
      if ((await stored(p)).length) return no('«Очистить набор» не очистил');
      await p.locator('section.sheet button', { hasText: 'Вернуть очищенный набор' }).click();
      await p.waitForTimeout(300);
      return (await stored(p)).join(' ') === 'ruf' ? ok(`${n0} лиц с семьёй; перезагрузка; очистка и возврат`) : no('«Вернуть» не вернул набор');
    },
  },
  {
    n: 202,
    title: 'J3 клавиатурой: Enter на «Добавить в набор» — фокус на «Только Руфи», Enter добавляет; Escape закрывает выбор и возвращает фокус',
    run: async (p) => {
      await wgo(p, '#/ruf');
      await p.locator('.folio .workbtn > button').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(250);
      const f = (await p.evaluate('document.activeElement && document.activeElement.textContent')) as string;
      if (f?.trim() !== 'Только Руфи') return no(`фокус после открытия: «${f}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      const back = (await p.evaluate(`document.activeElement === document.querySelector('.folio .workbtn > button')`)) as boolean;
      if (!back || (await p.locator('.workpick').count())) return no('Escape не закрыл выбор или фокус не вернулся');
      if (!(await p.locator('.folio').count())) return no('Escape закрыл карточку');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(250);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      return (await stored(p)).join(' ') === 'ruf' ? ok() : no(`набор: ${(await stored(p)).join(' ')}`);
    },
  },
  {
    n: 203,
    title: 'J3: строка поиска — «в набор» щелчком и Shift+Enter; список остаётся открытым',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'Руфь');
      await p.waitForTimeout(400);
      const cmd = p.locator('#find-results .result .row-cmd').first();
      if (!(await cmd.count())) return no('в строке результата нет команды «в набор» (ждёт rowCmd в Combobox.tsx)');
      await cmd.click();
      await p.waitForTimeout(300);
      if (!(await stored(p)).includes('ruf')) return no(`после щелчка набор: ${(await stored(p)).join(' ')}`);
      if ((await cmd.innerText()).trim() !== 'в наборе') return no(`надпись после щелчка: «${await cmd.innerText()}»`);
      await p.fill('#find', 'Вооз');
      await p.waitForTimeout(400);
      await p.keyboard.press('Shift+Enter');
      await p.waitForTimeout(300);
      const set = await stored(p);
      if (!set.includes('vooz')) return no(`после Shift+Enter набор: ${set.join(' ')}`);
      if (!(await p.locator('#find-results').count())) return no('список закрылся');
      return idOf(p) ? no('Shift+Enter выбрал лицо') : ok(set.join(' '));
    },
  },
  {
    n: 204,
    title: 'J3: «Родство» Иоав — Давид — «добавить путь в набор» кладёт в набор все лица пути',
    run: async (p) => {
      await wgo(p, '#/ioav~bdavid~pkinship', 2600);
      const rel = p.locator('section.sheet .relation').first();
      const b = rel.getByRole('button', { name: 'добавить путь в набор' });
      if (!(await b.count())) return no('нет команды «добавить путь в набор»');
      await b.click();
      await p.waitForTimeout(400);
      const set = await stored(p);
      const path = ((await p.locator('.sky').getAttribute('data-kin-path')) ?? '').split(' ').filter(Boolean);
      if (!path.length || !path.every((id) => set.includes(id))) return no(`путь ${path.join(' ')}; набор ${set.join(' ')}`);
      const done = rel.getByRole('button', { name: 'путь в наборе' });
      return (await done.count()) ? ok(set.join(' ')) : no('команда не стала «путь в наборе»');
    },
  },
  {
    n: 205,
    title: 'J3 на небе: клавиша В (D) добавляет лицо под указателем в набор, повторная — убирает; подсказка звезды — без клавиш (IX-58), клавиша названа в таблице «Клавиши»',
    run: async (p) => {
      await wgo(p, '#/david');
      const at = await selPoint(p);
      if (!at) return no('нет звезды Давида');
      await p.mouse.move(at.x, at.y);
      // подсказка звезды — без клавиш (IX-58, VIS-69): клавиша В (D) названа в таблице «Клавиши»
      await p.waitForTimeout(1100);
      const tip = p.locator('.sky .tip[data-id="david"][data-shown]');
      if (!(await tip.count())) return no('нет подсказки Давида');
      if (/\(D\)|взять в работу|добавить в набор/.test(nbsp(await tip.innerText()))) return no(`клавиши в подсказке: «${await tip.innerText()}»`);
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      if ((await stored(p)).join(' ') !== 'david') return no(`после D: ${(await stored(p)).join(' ')}`);
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      if ((await stored(p)).length !== 0) return no('повторная D не убрала лицо');
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(600);
      const table = (await p.locator('table.keys').first().count()) ? nbsp(await p.locator('table.keys').first().innerText()) : '';
      return /добавить лицо в набор или убрать из набора/.test(table) ? ok() : no('в таблице «Клавиши» нет клавиши В (D)');
    },
  },
  {
    n: 206,
    title: 'J4 мышью: показ «набор» — только лица набора, все подписаны, наложений нет, полосы сжаты; «Вписать» вписывает набор; «всё небо» строки показа возвращает небо',
    run: async (p) => {
      await wgo(p, '#/david');
      await takeFromCard(p, 'С предками: 3 поколения');
      await takeFromCard(p, 'С семьёй');
      const n = (await stored(p)).length;
      // показ «набор» — строкой показа (этап 11, решение 81; прежде — переключатель неба «все лица | набор»)
      await showSet(p);
      await p.waitForTimeout(500);
      let d = await skyData(p);
      if (d.mode !== 'work') return no(`режим неба: ${d.mode}`);
      const [lab, over] = (d.labels ?? '0/0').split('/').map(Number);
      if (over) return no(`наложений подписей: ${over}`);
      const rows = Number(d.rows);
      if (!(rows < n * 1.7)) return no(`строк: ${rows} при ${n} лицах`);
      // «Вписать» — весь набор в видимой части (этап 11, Я30: прежде кнопка называлась «Всё небо»)
      await p.locator('.skyctl button', { hasText: 'Вписать' }).click();
      await p.waitForTimeout(1800);
      d = await skyData(p);
      const [named, stars] = (d.named ?? '0/0').split('/').map(Number);
      if (named !== stars || stars < n - 6) return no(`подписано ${named} из ${stars} видимых (в наборе ${n})`);
      await showAllSky(p);
      d = await skyData(p);
      return d.mode === 'all' && Number(d.rows) > 300 ? ok(`${n} лиц, ${rows} строк, подписей ${lab}, на экране подписано ${named}/${stars}`) : no(`после «все лица»: ${d.mode}, строк ${d.rows}`);
    },
  },
  {
    n: 207,
    title: 'J4: пустой набор в показе «набор» — строка показа «На небе: набор пуст…», найденное лицо вне показа — гостем, «Результаты поиска вне показа: 1 — снять» (решение 113); «Добавить в набор» в карточке — «набор — 1 лицо»; «всё небо» возвращает небо (этап 11: строка показа вместо строки набора, решение 81; этап 13, решение 111: пустой набор в листе «Показ» не выбирается, строка говорит, что делать)',
    run: async (p) => {
      // пустой набор в листе «Показ» выбрать нельзя (решение 111) — показ «набор» с пустым набором, как после «Очистить набор»
      await p.evaluate(() => {
        localStorage.setItem('toledot:work', '[]');
        sessionStorage.setItem('toledot:show', JSON.stringify({ k: 's' }));
        sessionStorage.setItem('toledot:skymode', JSON.stringify('work'));
      });
      // адрес без вида: иначе вид прежнего сценария в адресе («~y…~w…», показ по умолчанию) главнее памяти сеанса
      await p.goto(`${p.url().replace(/[?#].*$/, '')}?w207=${Date.now()}#/`);
      await p.waitForTimeout(2200);
      const bar = p.locator('.sky .showbar');
      const text = async () => nbsp(await bar.innerText()).replace(/\s+/g, ' ').trim();
      if (!/^На небе: набор пуст/.test(await text())) return no(`строка показа пустого набора: «${await text()}»`);
      await seek(p, 'Руфь');
      // этап 13, решение 113: найденное лицо вне показа встаёт гостем, пока выбрано, — строка «Результаты поиска вне
      // показа: 1 — снять» вместо «Руфь — вне показа»
      if (!/Результаты поиска вне показа: 1 — снять/.test(await text()) && !/Руфь[^;]* — вне показа/.test(await text())) return no(`строка при лице вне показа: «${await text()}»`);
      await takeFromCard(p, 'Только Руфи');
      if ((await stored(p)).join(' ') !== 'ruf') return no('«Добавить в набор» не добавило лицо');
      await p.waitForTimeout(800);
      if (!/^На небе: набор — 1 лицо/.test(await text())) return no(`строка после добавления: «${await text()}»`);
      const d = await skyData(p);
      if (d.named !== '1/1') return no(`на небе подписано ${d.named}`);
      await p.keyboard.press('Escape');
      await showAllSky(p);
      return (await skyData(p)).mode === 'all' ? ok() : no('не вернулись ко всему небу');
    },
  },
  {
    n: 208,
    title: 'J4 пальцем, 390 × 844: строка показа — «изменить» — «Набор» — «Показать N лиц»; небо — только набор, подписи без наложений, подписано не меньше 95 %',
    view: W_PHONE,
    run: async (p) => {
      await wgo(p, '#/david', 2600);
      await p.locator('.folio .bar-toggle').tap();
      await p.waitForTimeout(600);
      await takeFromCard(p, 'С семьёй', true);
      await p.locator('.folio .sheet-bar .close').tap();
      await p.waitForTimeout(600);
      // показ «набор» — строкой показа (этап 11, решение 81; прежде — переключатель в листе «Вид»). Смена показа держит
      // выбранное лицо на месте (§ 10) и окно не вписывает — весь набор в окне даёт «Вписать»
      await showSet(p, true);
      await p.locator('.skyctl.column button', { hasText: 'Вписать' }).tap();
      await p.waitForTimeout(1600);
      const d = await skyData(p);
      const [, over] = (d.labels ?? '0/0').split('/').map(Number);
      const [named, stars] = (d.named ?? '0/0').split('/').map(Number);
      if (d.mode !== 'work' || over) return no(`режим ${d.mode}, наложений ${over}`);
      // на 390 px семья Давида стоит плотнее, чем помещаются имена без наложений: подпись, которой нет места, не рисуется
      // (наложений нет — это важнее). Этап 14 (решение 140): имя не ложится на чужой знак и стоит ближе к своей звезде,
      // поэтому мест меньше; подпись без места — в списке скрытых (canvas[data-hidden]), встаёт при касании и фокусе,
      // её читает диктор. Подписано не меньше 90 % видимых лиц набора, остальные — все в списке скрытых
      const hidden = new Set(String((await p.locator('.sky > canvas').getAttribute('data-hidden')) ?? '').split(/[\s,;]+/).filter(Boolean));
      const lost = String(d.unnamed ?? '').split(/\s+/).filter(Boolean).filter((id) => !hidden.has(id));
      const why = `подписано ${named}/${stars}${d.unnamed ? `; без подписи: ${d.unnamed}` : ''}${lost.length ? `; не в списке скрытых: ${lost.join(' ')}` : ''}`;
      return stars > 10 && named / stars >= 0.9 && !lost.length ? ok(why) : no(why);
    },
  },
  {
    n: 209,
    title: 'J5 мышью: «Скрыть потомков на небе» Давида — знак «+N» справа от следа, потомки не рисуются; щелчок по знаку разворачивает',
    run: async (p) => {
      await wgo(p, '#/david');
      // «Скрыть потомков на небе» — пункт выбора «Добавить в набор ▾» (этап 7, решение 26)
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(250);
      await p.locator('.workpick button', { hasText: 'Скрыть потомков на небе' }).click();
      await p.waitForTimeout(900);
      let d = await skyData(p);
      const m = /desc:david:(\d+)/.exec(d.folds ?? '');
      if (!m) return no(`свёрнутого нет: ${d.folds}`);
      const at = await foldHit(p, 'desc:david');
      if (!at) return no('знака «+N» на экране нет');
      const star = (await selPoint(p))!;
      if (at.x <= star.x) return no('знак не справа от звезды');
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(250);
      const back = await p.locator('.workpick button', { hasText: 'Показать потомков на небе' }).count();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      if (back !== 1) return no('пункт не стал «Показать потомков на небе»');
      await p.mouse.click(at.x, at.y);
      await p.waitForTimeout(900);
      d = await skyData(p);
      if (d.folds) return no(`после щелчка по знаку свёрнуто: ${d.folds}`);
      return idOf(p) === 'david' ? ok(`скрыто ${m[1]} лиц`) : no('щелчок по знаку сменил выбор');
    },
  },
  {
    n: 210,
    title: 'J5 клавиатурой: «С» (C) сворачивает и разворачивает потомков выбранного лица; свёрнутое помнится в сеансе',
    run: async (p) => {
      await wgo(p, '#/saul');
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('KeyC');
      await p.waitForTimeout(700);
      if (!/desc:saul:/.test((await skyData(p)).folds ?? '')) return no('C не свернула потомков Саула');
      const rows = Number((await skyData(p)).rows);
      if (!(rows < 334)) return no(`полосы не сжались: ${rows}`);
      await p.reload();
      await p.waitForTimeout(2200);
      if (!/desc:saul:/.test((await skyData(p)).folds ?? '')) return no('после перезагрузки свёрнутое забыто');
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('KeyC');
      await p.waitForTimeout(700);
      return (await skyData(p)).folds ? no('повторная C не развернула') : ok(`строк при свёрнутых потомках Саула: ${rows}`);
    },
  },
  {
    n: 211,
    title: 'J5: правая кнопка по звезде Исава — меню неба; «Свернуть созвездие «Едом»» — строка-подпись с числом лиц; щелчок по ней разворачивает',
    run: async (p) => {
      await wgo(p, '#/isav');
      const at = await selPoint(p);
      if (!at) return no('нет звезды Исава');
      await p.mouse.click(at.x, at.y, { button: 'right' });
      await p.waitForTimeout(400);
      const menu = p.locator('.sky .skymenu');
      if (!(await menu.count())) return no('меню неба не открылось');
      const g = menu.locator('button', { hasText: 'Скрыть созвездие' });
      if (!/«Едом»/.test(await g.innerText())) return no(`команда: «${await g.innerText()}»`);
      await g.click();
      await p.waitForTimeout(900);
      const d = await skyData(p);
      if (!/group:edomites:\d+/.test(d.folds ?? '')) return no(`свёрнуто: ${d.folds}`);
      const hit = await foldHit(p, 'group:edomites');
      if (!hit) return no('строки-подписи на экране нет');
      await p.mouse.click(hit.x, hit.y);
      await p.waitForTimeout(800);
      return (await skyData(p)).folds ? no('щелчок по подписи не развернул') : ok(d.folds);
    },
  },
  {
    n: 212,
    title: 'J3, J5 пальцем, 390 × 844: долгое касание звезды — меню неба с «Добавить в набор» и «Скрыть потомков на небе»',
    view: W_PHONE,
    run: async (p) => {
      await wgo(p, '#/david', 2600);
      const w = await worldSel(p);
      if (!w) return no('нет звезды Давида');
      await p.locator('.folio .sheet-bar .close').tap();
      await p.waitForTimeout(900);
      const pt = await screenOfWorld(p, w);
      const cdp = await p.context().newCDPSession(p);
      const touch = [{ x: pt.x, y: pt.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch });
      await p.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(400);
      const menu = p.locator('.sky .skymenu');
      if (!(await menu.count())) return no('долгое касание не открыло меню');
      const texts = (await menu.locator('button').allInnerTexts()).map((t) => t.trim());
      if (!texts.includes('Только Давида') || !texts.includes('Скрыть потомков на небе')) return no(`меню: ${texts.join(', ')}`);
      await menu.locator('button', { hasText: 'Только Давида' }).tap();
      await p.waitForTimeout(300);
      return (await stored(p)).join(' ') === 'david' && !idOf(p) ? ok() : no(`набор ${(await stored(p)).join(' ')}; выбрано ${idOf(p)}`);
    },
  },
  {
    n: 213,
    // этап 12, решение 91 (прежде — стопка J6, решение 18): закреплённые карточки — вкладки строками вверху листа
    // (метка, имя, уточнение, «×»); щелчок по вкладке раскрывает её; «Свернуть карточку» — корешок; «×» вкладки
    title: 'J6 → решение 91, мышью: закреплённые карточки — вкладки строками «метка, имя, уточнение, ×»; щелчок раскрывает; «Свернуть карточку» — корешок с вкладками; «×» вкладки закрывает только её',
    run: async (p) => {
      const pin = async () => {
        await p.locator('.folio .folio-bar .pin-card').click();
        await p.waitForTimeout(250);
      };
      await wgo(p, '#/ruf', 1800);
      await pin();
      await wgo(p, '#/vooz', 1800);
      await pin();
      await wgo(p, '#/david', 2000);
      const rows = () => p.locator('.folio .card-tabs .card-tab');
      const ids = async () => rows().evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.id}${e.hasAttribute('data-open') ? '*' : ''}`));
      if ((await ids()).join(' ') !== 'ruf vooz') return no(`вкладки: ${(await ids()).join(' ')}`);
      const t = nbsp(await rows().nth(1).locator('.tab-open').innerText()).replace(/\s+/g, ' ');
      if (!/^Вооз .*Салмона/.test(t)) return no(`строка вкладки: «${t}»`);
      if (!(await rows().nth(1).locator('.tab-mark').count())) return no('у вкладки нет цветной метки');
      await rows().first().locator('.tab-open').click();
      await p.waitForTimeout(900);
      if (idOf(p) !== 'ruf') return no(`после щелчка по вкладке Руфи выбрано ${idOf(p)}`);
      if ((await ids()).join(' ') !== 'ruf* vooz') return no(`вкладки после щелчка: ${(await ids()).join(' ')}`);
      await p.locator('.folio .fold-card').click();
      await p.waitForTimeout(500);
      if (!(await p.locator('.folio.spine').count()) || (await p.locator('.folio .mast').count())) return no('«Свернуть карточку» не свернула лист в корешок');
      if ((await p.locator('.folio.spine .spine-tabs .nm').allInnerTexts()).join(' ') !== 'Вооз') return no('на корешке нет вкладки Вооза');
      await p.locator('.folio.spine .unfold').click();
      await p.waitForTimeout(500);
      if (!(await p.locator('.folio .mast').count())) return no('«развернуть» не развернул');
      await rows().nth(1).locator('.close').click();
      await p.waitForTimeout(300);
      return (await ids()).join(' ') === 'ruf*' && idOf(p) === 'ruf' ? ok() : no(`после «×» вкладки: ${(await ids()).join(' ')}, выбрано ${idOf(p)}`);
    },
  },
  {
    n: 214,
    // этап 12, решение 91: щелчок по звезде открывает карточку на месте текущей (не добавляет вкладку); вкладки помнятся
    // в браузере; предела шести (J6) больше нет — вкладок сколько угодно
    title: 'J6 → решение 91: щелчок по звезде открывает её карточку на месте текущей — вкладки не меняются; вкладок больше шести, они помнятся в браузере',
    run: async (p) => {
      await wgo(p, '#/ruf', 1800);
      const ruth = await worldSel(p);
      const ids = async () => (await p.locator('.folio .card-tabs .card-tab').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))).join(' ');
      await p.locator('.folio .folio-bar .pin-card').click();
      for (const id of ['vooz', 'adam', 'sif', 'enos', 'kainan', 'maleleil']) {
        await wgo(p, `#/${id}`, 900);
        await p.locator('.folio .folio-bar .pin-card').click();
        await p.waitForTimeout(150);
      }
      await p.waitForTimeout(500);
      const a = await ids();
      if (a !== 'ruf vooz adam sif enos kainan maleleil') return no(`вкладки (семь): ${a}`);
      // вернуться к Руфи щелчком по её звезде на небе
      await wgo(p, '#/vooz', 1800);
      const pt = await screenOfWorld(p, ruth!);
      await p.mouse.click(pt.x, pt.y);
      await p.waitForTimeout(900);
      if (idOf(p) !== 'ruf') return no(`щелчок по звезде Руфи выбрал «${idOf(p)}»`);
      const b = await ids();
      if (b !== a) return no(`вкладки после щелчка: ${b}`);
      await p.reload();
      await p.waitForTimeout(2200);
      const c = await ids();
      const open = await p.locator('.folio .card-tab[data-open]').getAttribute('data-id');
      return c === a && open === 'ruf' ? ok(`вкладки: ${c}`) : no(`после перезагрузки: ${c}; раскрыта ${open}`);
    },
  },
  {
    n: 215,
    // этап 12, решение 91: на телефоне — те же вкладки строками над листом (прежде — строка стопки)
    title: 'J6 → решение 91 пальцем, 390 × 844: вкладки — строками над листом; касание раскрывает карточку вкладки',
    view: W_PHONE,
    run: async (p) => {
      await wgo(p, '#/ruf', 1600);
      const pin = p.locator('.folio .sheet-bar .pin-card');
      if (!(await pin.count())) return no('в шапке листа нет «Закрепить»');
      await pin.tap();
      await p.waitForTimeout(300);
      await wgo(p, '#/david', 2400);
      const strip = p.locator('.folio .card-tabs');
      if (!(await strip.count())) return no('нет строк вкладок над листом');
      const sb = (await strip.boundingBox())!;
      const fb = (await p.locator('.folio .sheet-bar').boundingBox())!;
      if (sb.y + sb.height > fb.y + 2) return no(`вкладки не над листом: ${sb.y + sb.height} > ${fb.y}`);
      const row = (await p.locator('.folio .card-tabs .tab-open').first().boundingBox())!;
      if (row.height < 44) return no(`строка вкладки ${row.height} px`);
      await strip.locator('.tab-open', { hasText: 'Руфь' }).tap();
      await p.waitForTimeout(900);
      if (idOf(p) !== 'ruf') return no(`после касания выбрано ${idOf(p)}`);
      const names = (await p.locator('.folio .card-tabs .tab-open .nm').allInnerTexts()).map((t) => t.trim());
      return names.join(' ') === 'Руфь' ? ok() : no(`в строках: ${names.join(', ')}`);
    },
  },
];

export const work: Scenario[] = [...view, ...workset];
