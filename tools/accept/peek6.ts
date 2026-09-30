/**
 * Сценарии приёмки: союзы-точки на небе (решение 76), группа peek6: номера 680–699, карточка у точки на небе.
 * Этап 11 (решение 77, STAGE11.md § 6; задача Q3): карточка у звезды — в любом показе, с блоком «Родство»; её команды —
 * «Карточка» (прежде «Информация»), «Только его род ▾», «Родство с…», в наборе — «Продолжить ветвь» / «Свернуть ветвь»
 * и «Родители»; у ромба — «Карточка союза» (прежде «Подробнее»); Enter на звезде ставит фокус на первое имя «Родства»
 * (§ 8); на телефоне карточка у звезды — нижний лист на 214 px, над небом её нет. Сценарии 680, 683, 685, 686, 688, 689,
 * 692 приведены к этому; остальные проверки — прежние.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

type Box = { x: number; y: number; width: number; height: number };
const PHONE = { width: 390, height: 844, touch: true };

/**
 * Небо «набор» в заданном состоянии раскрытия (src/ui/reveal.ts, src/ui/work.ts): набор, лица с показанными союзами,
 * раскрытые союзы; адрес hash выбирает лицо.
 */
async function setup(p: Page, o: { work: string[]; opened?: string[]; expanded?: Record<string, string>; hash: string; start?: string }) {
  await p.evaluate((o) => {
    localStorage.setItem('toledot:intro', 'true');
    localStorage.setItem('toledot:start', JSON.stringify(o.start ?? 'adam'));
    localStorage.setItem('toledot:view', JSON.stringify('sky'));
    localStorage.setItem('toledot:work', JSON.stringify(o.work.map((id, i) => [id, { via: i ? 'family' : 'self', of: o.work[0] }])));
    localStorage.setItem('toledot:reveal', JSON.stringify({ opened: o.opened ?? [], expanded: o.expanded ?? {} }));
    sessionStorage.setItem('toledot:skymode', JSON.stringify('work'));
  }, o);
  await p.goto(p.url().replace(/#.*$/, '') + o.hash);
  await p.reload();
  await p.waitForTimeout(2600);
}
const ADAM = { work: ['adam'], opened: ['adam'], hash: '#/adam' };
const ADAM_OPEN = { work: ['adam', 'eva', 'kain', 'avel', 'sif'], opened: ['adam'], expanded: { 'u:adam+eva': 'adam' }, hash: '#/adam' };

const canvasBox = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;
/** Звезда лица в координатах страницы — из списка неба для клавиатуры (SkyA11y, data-x/data-y). */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  const el = p.locator(`#sky-star-${id}`);
  if (!(await el.count())) return null;
  const x = Number(await el.getAttribute('data-x'));
  const y = Number(await el.getAttribute('data-y'));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const b = await canvasBox(p);
  return { x: b.x + x, y: b.y + y };
}
/** Точка союза в координатах страницы: середина поля попадания (src/render/sky.ts, dataset.plates). */
async function dotAt(p: Page, uid: string): Promise<{ x: number; y: number } | null> {
  const d = await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.plates ?? '');
  const q = d.split(';').find((s) => s.startsWith(`${uid}:`));
  if (!q) return null;
  const [x, y, w, h] = q.split(':').pop()!.split(',').map(Number);
  const b = await canvasBox(p);
  return { x: b.x + x + w / 2, y: b.y + y + h / 2 };
}
const card = (p: Page) => p.locator('.sky .dotcard[data-placed]');
const cardBox = async (p: Page): Promise<Box | null> => ((await card(p).count()) ? card(p).boundingBox() : null);
const commands = async (p: Page) => (await card(p).locator('.dc-cmds button').allInnerTexts()).map((t) => t.trim());
const flat = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : '')).replace(/\s+/g, ' ').trim();
const inside = (pt: { x: number; y: number }, b: Box, pad = 0) => pt.x > b.x - pad && pt.x < b.x + b.width + pad && pt.y > b.y - pad && pt.y < b.y + b.height + pad;
const cross = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const stored = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string, unknown][]).map((r) => r[0]).sort());
/** Отвод касается знака (в пределах tol px) и края карточки. */
async function leadOk(p: Page, at: { x: number; y: number }, c: Box, tol = 14): Promise<string | null> {
  const l = p.locator('.sky .dc-lead:not([hidden])');
  if (!(await l.count())) return 'нет отвода';
  const b = (await l.boundingBox())!;
  const ends = b.width <= 2 ? [{ x: b.x, y: b.y }, { x: b.x, y: b.y + b.height }] : [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }];
  const d = (q: { x: number; y: number }) => Math.hypot(q.x - at.x, q.y - at.y);
  const [near, far] = d(ends[0]) < d(ends[1]) ? ends : [ends[1], ends[0]];
  if (d(near) > tol) return `отвод далеко от знака: ${Math.round(d(near))} px`;
  if (!inside(far, c, 2)) return 'отвод не доходит до карточки';
  return null;
}

export const peek6: Scenario[] = [
  {
    n: 680,
    title: 'Решения 76, 77: «С Адама» — щелчок по звезде Адама: выбран Адам, справа — его карточка, у звезды — карточка (диалог «Адам, 4174–3244 гг. до Р. Х.»): образ, имя, годы, «Карточка», «Только его род ▾», «Родство с…», «Свернуть ветвь», «×»; не закрывает звезду и её подпись, прикреплена отводом',
    run: async (p) => {
      await setup(p, { ...ADAM, hash: '#/' });
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(1200);
      if (!/#\/adam/.test(p.url())) return fail(`выбрано не лицо Адама: ${p.url()}`);
      if (!(await p.locator('.folio #title-adam').count())) return fail('справа нет карточки Адама');
      const c = await cardBox(p);
      if (!c) return fail('у звезды нет карточки у точки');
      const role = await card(p).getAttribute('role');
      const name = flat((await card(p).getAttribute('aria-label')) ?? '');
      if (role !== 'dialog' || name !== 'Адам, 4174–3244 гг. до Р. Х.') return fail(`роль и имя: ${role}, «${name}»`);
      if (!(await card(p).locator('.av').count())) return fail('нет образа');
      const text = flat(await card(p).innerText());
      if (!/Адам/.test(text) || !/4174–3244 гг\. до Р\. Х\./.test(text)) return fail(`в карточке: «${text}»`);
      const cmds = await commands(p);
      // этап 13 (решение 109): «Вся карточка», «Предки и потомки ▾»
      if (cmds.join(' | ') !== 'Вся карточка | Предки и потомки ▾ | Родство с… | Скрыть ветвь') return fail(`команды: ${cmds.join(' | ')}`);
      if (!(await card(p).locator('button.close[aria-label]').count())) return fail('нет «×»');
      const cb = await card(p).locator('.dc-cmds button').first().boundingBox();
      if (!cb || cb.height < 31.5) return fail(`поле команды ${cb?.height} px`);
      const b = await canvasBox(p);
      if (inside(a, c, 8)) return fail('карточка закрывает звезду');
      // подпись Адама (кольцо клавиатуры не нужно: подпись рисует холст) — по списку подписей кадра в dataset.labels нет;
      // проверяем, что карточка не заходит на строку звезды слева и справа от неё
      if (c.y < a.y + 8 && c.y + c.height > a.y - 8) return fail('карточка на строке звезды — на её подписи');
      const lead = await leadOk(p, a, c);
      if (lead) return fail(lead);
      return pass(`карточка ${Math.round(c.x - b.x)},${Math.round(c.y - b.y)} ${Math.round(c.width)}×${Math.round(c.height)}`);
    },
  },
  {
    n: 681,
    title: 'Решение 76: карточка у точки следует за небом — протяжка сдвигает её вместе со звездой, после колеса отвод по-прежнему у звезды; звезда ушла за край — карточка закрывается',
    run: async (p) => {
      await setup(p, ADAM);
      const a0 = await starAt(p, 'adam');
      if (!a0) return fail('нет звезды Адама');
      await p.mouse.click(a0.x, a0.y);
      await p.waitForTimeout(900);
      const c0 = await cardBox(p);
      if (!c0) return fail('нет карточки у точки');
      // протяжка по пустому небу: на 90 px вправо и 50 px вниз
      const from = { x: a0.x + 240, y: a0.y - 150 };
      await p.mouse.move(from.x, from.y);
      await p.mouse.down();
      for (let k = 1; k <= 6; k++) await p.mouse.move(from.x + 15 * k, from.y + (50 / 6) * k);
      await p.waitForTimeout(80);
      await p.mouse.up();
      // место звезды — из списка неба, а он обновляется, когда небо постоит 600 мс (SkyA11y)
      await p.waitForTimeout(1400);
      const a1 = await starAt(p, 'adam');
      const c1 = await cardBox(p);
      if (!a1 || !c1) return fail('карточка закрылась после протяжки');
      const dx = a1.x - a0.x;
      const dy = a1.y - a0.y;
      if (Math.abs(dx) < 40) return fail(`небо не сдвинулось: ${dx.toFixed(0)} px`);
      if (Math.abs(c1.x - c0.x - dx) > 2 || Math.abs(c1.y - c0.y - dy) > 2) return fail(`карточка не последовала: звезда ${dx.toFixed(0)},${dy.toFixed(0)}, карточка ${(c1.x - c0.x).toFixed(0)},${(c1.y - c0.y).toFixed(0)}`);
      // колесо у звезды: масштаб меняется, карточка у звезды
      await p.mouse.move(a1.x + 30, a1.y + 3);
      await p.mouse.wheel(0, -200);
      await p.waitForTimeout(1500);
      const a2 = await starAt(p, 'adam');
      const c2 = await cardBox(p);
      if (!a2 || !c2) return fail('карточка закрылась после колеса');
      const lead = await leadOk(p, a2, c2);
      if (lead) return fail(`после колеса: ${lead}`);
      // протяжка, уводящая звезду за левый край неба
      const b = await canvasBox(p);
      const go = { x: a2.x + 300, y: a2.y - 120 };
      await p.mouse.move(go.x, go.y);
      await p.mouse.down();
      for (let k = 1; k <= 8; k++) await p.mouse.move(go.x - ((a2.x - b.x + 100) / 8) * k, go.y);
      await p.waitForTimeout(80);
      await p.mouse.up();
      await p.waitForTimeout(900);
      if (await p.locator('.sky .dotcard').count()) return fail('звезда за краем, а карточка осталась');
      return pass(`сдвиг ${dx.toFixed(0)},${dy.toFixed(0)}`);
    },
  },
  {
    n: 682,
    title: 'Решение 76: карточку у точки закрывают Escape (фокус — на холсте), щелчок по пустому небу (выбор лица остаётся) и «×»',
    run: async (p) => {
      await setup(p, ADAM);
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      const open = async () => {
        await p.mouse.click(a.x, a.y);
        await p.waitForTimeout(700);
        return !!(await cardBox(p));
      };
      if (!(await open())) return fail('карточка не открылась');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (await p.locator('.sky .dotcard').count()) return fail('Escape не закрыл карточку');
      if (!(await p.evaluate(() => document.activeElement?.matches('.sky canvas')))) return fail('после Escape фокус не на холсте');
      if (!/#\/adam/.test(p.url())) return fail('Escape снял выбор лица вместе с карточкой');
      if (!(await open())) return fail('карточка не открылась снова');
      await p.mouse.click(a.x + 260, a.y - 170);
      await p.waitForTimeout(600);
      if (await p.locator('.sky .dotcard').count()) return fail('щелчок по пустому небу не закрыл карточку');
      if (!/#\/adam/.test(p.url())) return fail('первый щелчок по пустому небу снял и выбор');
      if (!(await open())) return fail('карточка не открылась в третий раз');
      await card(p).locator('button.close').click();
      await p.waitForTimeout(300);
      return (await p.locator('.sky .dotcard').count()) ? fail('«×» не закрыл карточку') : pass();
    },
  },
  {
    n: 683,
    title: 'Решения 76, 77: щелчок по точке союза Адама и Евы — карточка союза у точки: «Адам и Ева», «Ева — жена Адама», стих, «3 сына, выв.», «Раскрыть детей (3)», «Карточка союза»; набор не меняется, подсказки у открытой точки нет; «Карточка союза» — справа карточка союза, карточка у точки остаётся',
    run: async (p) => {
      await setup(p, ADAM);
      const d = await dotAt(p, 'u:adam+eva');
      if (!d) return fail('нет точки союза');
      await p.mouse.move(d.x - 20, d.y - 30);
      await p.mouse.move(d.x, d.y, { steps: 4 });
      await p.mouse.click(d.x, d.y);
      await p.waitForTimeout(900);
      const c = await cardBox(p);
      if (!c || (await card(p).getAttribute('data-kind')) !== 'union') return fail('у точки нет карточки союза');
      if (flat((await card(p).getAttribute('aria-label')) ?? '') !== 'Союз Адама и Евы') return fail(`имя диалога: ${await card(p).getAttribute('aria-label')}`);
      const text = flat(await card(p).innerText());
      for (const w of ['союз', 'Быт 2:22–25', 'Адам и Ева', 'Ева — жена Адама', '3 сына, выв.']) if (!text.includes(w)) return fail(`в карточке нет «${w}»: ${text}`);
      if (!(await card(p).locator('.av').count())) return fail('нет образа союза');
      const cmds = await commands(p);
      if (cmds.join(' | ') !== 'Показать детей союза (3) | Подробнее о союзе') return fail(`команды: ${cmds.join(' | ')}`);
      if ((await stored(p)).join(' ') !== 'adam') return fail(`щелчок по точке изменил набор: ${(await stored(p)).join(' ')}`);
      await p.mouse.move(d.x + 1, d.y);
      await p.waitForTimeout(500);
      if (await p.locator('.sky .tip[data-shown]').count()) return fail('подсказка у точки с открытой карточкой');
      await card(p).locator('.dc-cmds button', { hasText: 'Подробнее о союзе' }).click();
      await p.waitForTimeout(900);
      if (!(await p.locator('.folio[data-union="u:adam+eva"]').count())) return fail('справа нет карточки союза');
      if (!(await cardBox(p))) return fail('карточка у точки закрылась после «Карточки союза»');
      return pass(text);
    },
  },
  {
    n: 684,
    title: 'Решение 76: одна карточка за раз — щелчок по звезде, затем по точке союза, затем снова по звезде: всякий раз на небе одна карточка у точки, у последнего щелчка',
    run: async (p) => {
      await setup(p, ADAM);
      const a = await starAt(p, 'adam');
      const d = await dotAt(p, 'u:adam+eva');
      if (!a || !d) return fail('нет звезды или точки союза');
      const seq: string[] = [];
      for (const [at, want] of [
        [a, 'adam'],
        [d, 'u:adam+eva'],
        [a, 'adam'],
      ] as const) {
        await p.mouse.click(at.x, at.y);
        await p.waitForTimeout(700);
        const n = await p.locator('.sky .dotcard').count();
        const id = n ? await p.locator('.sky .dotcard').getAttribute('data-id') : null;
        if (n !== 1 || id !== want) return fail(`после щелчка — ${n} карточек, у ${id}, ждали ${want}`);
        seq.push(id!);
      }
      return pass(seq.join(' → '));
    },
  },
  {
    n: 685,
    title: 'Решения 76, 77, 83, клавиатура: стрелкой — к Адаму, Enter открывает карточку у звезды (диалог) с фокусом на первом имени «Родства» (Ева), Tab — к следующей строке (Каин); Escape закрывает, фокус на холсте, кольцо — на Адаме',
    run: async (p) => {
      await setup(p, ADAM);
      await p.locator('.sky canvas').focus();
      await p.waitForTimeout(300);
      let id = '';
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
        id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
        if (id === 'sky-star-adam') break;
        await p.keyboard.press(key);
        await p.waitForTimeout(250);
      }
      if (id !== 'sky-star-adam') return fail(`кольцо не на Адаме: ${id || 'нет'}`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const f1 = await p.evaluate(() => ({ t: (document.activeElement as HTMLElement | null)?.innerText?.trim() ?? '', dlg: document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label') ?? '' }));
      if (f1.t !== 'Ева' || !/^Адам/.test(f1.dlg)) return fail(`фокус после Enter: «${f1.t}» в «${f1.dlg}»`);
      await p.keyboard.press('Tab');
      // имя на кнопке — в .nm; запятая за именем (.sep, решение 92) скрыта от диктора и в имя не входит
      const f2 = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return ((a?.querySelector('.nm') as HTMLElement | null) ?? a)?.innerText?.trim() ?? '';
      });
      if (f2 !== 'Каин') return fail(`Tab: «${f2}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      if (await p.locator('.sky .dotcard').count()) return fail('Escape не закрыл карточку');
      if (!(await p.evaluate(() => document.activeElement?.matches('.sky canvas')))) return fail('фокус не вернулся на холст');
      const ring = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
      return ring === 'sky-star-adam' ? pass() : fail(`кольцо после Escape: ${ring || 'нет'}`);
    },
  },
  {
    n: 686,
    title: 'Решения 76, 77: «Карточка» (прежде «Информация») разворачивает свёрнутую в корешок карточку лица и ставит фокус на её заголовок',
    run: async (p) => {
      await setup(p, ADAM);
      const fold = p.locator('.folio button', { hasText: 'Свернуть карточку' });
      if (!(await fold.count())) return fail('нет «Свернуть карточку»');
      await fold.first().click();
      await p.waitForTimeout(800);
      if (!(await p.locator('.folio.spine').count())) return fail('карточка не свернулась в корешок');
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(800);
      if (!(await cardBox(p))) return fail('нет карточки у точки');
      await card(p).locator('.dc-cmds button', { hasText: /^Вся карточка$/ }).click();
      await p.waitForTimeout(1000);
      if (await p.locator('.folio.spine').count()) return fail('карточка осталась корешком');
      const f = await p.evaluate(() => document.activeElement?.id ?? '');
      return f === 'title-adam' ? pass() : fail(`фокус: ${f || 'нет'}`);
    },
  },
  {
    n: 687,
    title: 'Решение 76: «С Иисуса Христа» — щелчок по звезде Иисуса Христа, «Родители»: Иосиф и Мария на небе, команда — «Скрыть родителей»; карточка у звезды на виду; «Скрыть родителей» убирает их',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const j = await starAt(p, 'iisus');
      if (!j) return fail('нет звезды Иисуса Христа');
      await p.mouse.click(j.x, j.y);
      await p.waitForTimeout(900);
      const cmds = await commands(p);
      if (!cmds.includes('Показать родителей')) return fail(`команды: ${cmds.join(' | ')}`);
      await card(p).locator('.dc-cmds button', { hasText: 'Показать родителей' }).click();
      await p.waitForTimeout(1300);
      const ids = await stored(p);
      if (!ids.includes('iosif-muzh-marii') || !ids.includes('mariya')) return fail(`набор: ${ids.join(' ')}`);
      if (!(await commands(p)).includes('Скрыть родителей')) return fail(`команды после: ${(await commands(p)).join(' | ')}`);
      if (!(await cardBox(p))) return fail('карточка у звезды пропала');
      await card(p).locator('.dc-cmds button', { hasText: 'Скрыть родителей' }).click();
      await p.waitForTimeout(1000);
      const back = await stored(p);
      return back.join(' ') === 'iisus' ? pass() : fail(`после «Скрыть родителей»: ${back.join(' ')}`);
    },
  },
  {
    n: 688,
    title: 'Решения 76, 77, телефон 390 × 844: касание Адама — нижний лист на 214 px и есть карточка у звезды (образ, имя, годы, «Родство»), второй карточки над небом нет, звезда не под листом; цели 44 px; «Карточка ▴» поднимает лист',
    view: PHONE,
    run: async (p) => {
      await setup(p, { ...ADAM, hash: '#/' });
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.touchscreen.tap(a.x, a.y);
      await p.waitForTimeout(1200);
      if (await cardBox(p)) return fail('над небом — карточка у звезды, а должен быть лист');
      const sheet = await p.locator('.folio').boundingBox();
      if (!sheet) return fail('нет листа карточки');
      if (Math.abs(sheet.height - 214) > 16) return fail(`лист ${Math.round(sheet.height)} px`);
      const dc = p.locator('.folio .sheet-dot .dotcard');
      if (!(await dc.count())) return fail('в листе нет карточки у звезды');
      const text = flat(await dc.innerText());
      if (!/^Адам/.test(text) || !/4174–3244 гг\. до Р\. Х\./.test(text) || !(await dc.locator('.av').count())) return fail(`лист: «${text.slice(0, 120)}»`);
      const a1 = (await starAt(p, 'adam'))!;
      if (a1.y > sheet.y - 6) return fail('звезда под листом');
      // цели — команды листа и «×» (имена «Родства» — ссылки в тексте: поле касания у них — псевдоэлементом, phone.css)
      const hs = await p.locator('.folio .sheet-dot').locator('.dc-cmds button, .close').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect().height));
      if (hs.some((h) => h < 43.5)) return fail(`низкие цели: ${hs.map(Math.round).join(', ')}`);
      await p.locator('.folio .sheet-dot .dc-cmds button', { hasText: 'Вся карточка' }).first().tap();
      await p.waitForTimeout(1000);
      const sheet2 = (await p.locator('.folio').boundingBox())!;
      return sheet2.height > sheet.height + 100 ? pass(`лист ${Math.round(sheet.height)} → ${Math.round(sheet2.height)} px`) : fail(`лист не поднялся: ${Math.round(sheet.height)} → ${Math.round(sheet2.height)}`);
    },
  },
  {
    n: 689,
    title: 'Решения 76, 77: небо «все лица» — щелчок по звезде Давида выбирает его и открывает у звезды карточку с «Родством» (этап 11: карточка у звезды — в любом показе)',
    run: async (p) => {
      await p.evaluate(() => sessionStorage.setItem('toledot:skymode', JSON.stringify('all')));
      await p.goto(p.url().replace(/#.*$/, '') + '#/david');
      await p.reload();
      await p.waitForTimeout(2800);
      if ((await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.mode)) !== 'all') return fail('небо не «все лица»');
      const d = await starAt(p, 'david');
      if (!d) return fail('нет звезды Давида');
      await p.mouse.click(d.x, d.y);
      await p.waitForTimeout(900);
      if (!/#\/david/.test(p.url())) return fail(`выбор: ${p.url()}`);
      const c = await cardBox(p);
      if (!c) return fail('во «всех лицах» нет карточки у звезды');
      return (await card(p).locator('.dc-kin').count()) ? pass() : fail('в карточке нет «Родства»');
    },
  },
  {
    n: 690,
    title: 'Решение 76: звезда у правого края неба — карточка у точки уходит туда, где есть место: целиком в видимой части неба, не на звезде и не на органах неба',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const a0 = await starAt(p, 'iisus');
      if (!a0) return fail('нет звезды Иисуса Христа');
      const view = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
      const b = await canvasBox(p);
      // протяжка: звезда — в 40 px от правого края видимой части
      const want = b.x + view[2] - 40;
      const from = { x: a0.x - 200, y: a0.y + 120 };
      await p.mouse.move(from.x, from.y);
      await p.mouse.down();
      for (let k = 1; k <= 8; k++) await p.mouse.move(from.x + ((want - a0.x) / 8) * k, from.y);
      await p.waitForTimeout(80);
      await p.mouse.up();
      await p.waitForTimeout(1400);
      const a = await starAt(p, 'iisus');
      if (!a || a.x < b.x + view[2] - 90) return fail(`звезда не у правого края: ${a?.x} при крае ${b.x + view[2]}`);
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(900);
      const c = await cardBox(p);
      if (!c) return fail('нет карточки у точки');
      if (c.x < b.x + view[0] - 1 || c.x + c.width > b.x + view[2] + 1 || c.y < b.y + view[1] - 1 || c.y + c.height > b.y + view[3] + 1) return fail(`карточка за краем видимой части: ${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}×${Math.round(c.height)}`);
      if (inside(a, c, 8)) return fail('карточка на звезде');
      for (const el of await p.locator('.sky .skyctl').all()) {
        const r = await el.boundingBox();
        if (r && cross(r, c)) return fail('карточка на органах неба');
      }
      const lead = await leadOk(p, a, c);
      return lead ? fail(lead) : pass(`сторона ${await card(p).getAttribute('data-side')}`);
    },
  },
  {
    n: 691,
    title: 'Решение 76: подсказка звезды при открытой карточке у точки её не закрывает; у звезды с открытой карточкой подсказки нет',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(900);
      const c = await cardBox(p);
      if (!c) return fail('нет карточки у точки');
      await p.mouse.move(a.x + 2, a.y + 1);
      await p.waitForTimeout(600);
      if (await p.locator('.sky .tip[data-shown]').count()) return fail('у звезды с открытой карточкой — подсказка');
      const checked: string[] = [];
      for (const id of ['eva', 'kain', 'avel', 'sif']) {
        const s = await starAt(p, id);
        if (!s || inside(s, c, 4)) continue;
        await p.mouse.move(s.x - 30, s.y - 30);
        await p.mouse.move(s.x, s.y, { steps: 3 });
        await p.waitForTimeout(700);
        const tip = p.locator('.sky .tip[data-shown]');
        if (!(await tip.count())) continue;
        const t = (await tip.boundingBox())!;
        if (cross(t, c)) return fail(`подсказка ${id} закрывает карточку у точки`);
        checked.push(id);
      }
      return checked.length ? pass(checked.join(', ')) : fail('ни одной подсказки звёзд рядом');
    },
  },
  {
    n: 692,
    title: 'Решения 76, 77, клавиатура: Enter на звезде Иисуса Христа — фокус на первом имени «Родства» (Иосиф); Tab — к команде «Родители», Enter раскрывает родителей, фокус остаётся в карточке на «Скрыть родителей»; живая область объявляет раскрытие',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      await p.locator('.sky canvas').focus();
      await p.waitForTimeout(300);
      let id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
      if (id !== 'sky-star-iisus') {
        await p.keyboard.press('ArrowLeft');
        await p.waitForTimeout(250);
        id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
      }
      if (id !== 'sky-star-iisus') return fail(`кольцо: ${id || 'нет'}`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const t = () => p.evaluate(() => (document.activeElement?.closest('.dotcard') ? (document.activeElement as HTMLElement).innerText.trim() : `вне карточки: ${document.activeElement?.tagName}`));
      if ((await t()) !== 'Иосиф') return fail(`фокус после Enter: «${await t()}»`);
      // «Родство» — строка за строкой, затем команды карточки; «Родители» — не дальше восьми Tab
      for (let i = 0; i < 8 && (await t()) !== 'Показать родителей'; i++) await p.keyboard.press('Tab');
      if ((await t()) !== 'Показать родителей') return fail(`Tab: «${await t()}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1300);
      const ids = await stored(p);
      if (!ids.includes('iosif-muzh-marii') || !ids.includes('mariya')) return fail(`набор: ${ids.join(' ')}`);
      if ((await t()) !== 'Скрыть родителей') return fail(`фокус после команды: «${await t()}»`);
      const said = await p.evaluate(() => [...document.querySelectorAll('.sky [aria-live]')].map((e) => (e.textContent ?? '').trim()).join(' | '));
      return /Раскрыт союз/.test(said.replace(/\u00a0/g, ' ')) ? pass() : fail(`живая область: «${said}»`);
    },
  },
];
