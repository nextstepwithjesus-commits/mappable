/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа phone7: телефон и планшет (K7). Номера 300–309.
 * MOB-44 (поворот), MOB-45 (меню над панелью), MOB-47 (выбор второго лица из «Родства»), MOB-48 (разворот), MOB-59
 * («Эпохи» на месте листа карточки), MOB-39 и решение 33 (цели 44 px), MOB-50 («Как читать карту» под листом).
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };
const TABLET = { width: 768, height: 1024, touch: true };

/** Открыть адрес заново: смена одного якоря страницу не перезагружает, открытая панель и лист остались бы. */
let loads = 0;
const go = async (p: Page, hash: string, ms = 2400) => {
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?load=${++loads}${hash}`);
  await p.waitForTimeout(ms);
};
const tap = async (p: Page, sel: string, text?: string) => {
  await (text ? p.locator(sel, { hasText: text }) : p.locator(sel)).first().tap({ timeout: 5000 });
  await p.waitForTimeout(500);
};
/** Панель из «Разделов» телефона. */
const openSection = async (p: Page, name: string) => {
  await tap(p, '.top .sections > button');
  await tap(p, '.top .sections [role^="menuitem"]', name);
  await p.waitForTimeout(300);
};
/** Ширины областей и холстов против ширины окна; «Разделы» и органы неба — в пределах экрана. */
async function widthsOff(p: Page): Promise<string> {
  return (await p.evaluate(`(() => {
    const W = innerWidth, bad = [];
    const w = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().width) : null; };
    // во всю ширину окна — сетка, верхняя строка и полоса времени; небо — своей колонкой, холст неба — во всё небо
    for (const sel of ['.app', '.top', '.strip', '.strip canvas']) {
      const v = w(sel);
      if (v === null) bad.push(sel + ' нет');
      else if (Math.abs(v - W) > 1) bad.push(sel + ' ' + v);
    }
    if (Math.abs(w('.sky canvas') - w('.sky')) > 1) bad.push('холст неба ' + w('.sky canvas') + ' при небе ' + w('.sky'));
    const cols = getComputedStyle(document.querySelector('.app')).gridTemplateColumns.split(' ').reduce((a, x) => a + parseFloat(x), 0);
    if (Math.abs(cols - W) > 1) bad.push('колонки сетки ' + cols.toFixed(0));
    const sky = document.querySelector('.sky').getBoundingClientRect();
    if (sky.right > W + 1 || sky.left < -1) bad.push('небо за краем ' + sky.left.toFixed(0) + '…' + sky.right.toFixed(0));
    if (document.documentElement.scrollWidth > W + 1) bad.push('прокрутка вбок ' + document.documentElement.scrollWidth);
    for (const sel of ['.top .sections > button', '.top .commands', '.skyctl']) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1) bad.push(sel + ' за краем ' + Math.round(r.left) + '…' + Math.round(r.right));
    }
    return bad.length ? W + ': ' + bad.join(', ') : '';
  })()`)) as string;
}
/** Звезда лица на холсте (пункт списка лиц неба, data-x/y), px холста, или null — её нет на виду. */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  return (await p.evaluate(`(() => { const b = document.getElementById('sky-star-${id}'); return b && b.dataset.x ? { x: +b.dataset.x, y: +b.dataset.y } : null; })()`)) as {
    x: number;
    y: number;
  } | null;
}
/** Выбранное лицо видно: звезда в видимой части неба и сверху в этой точке — холст (не лист, не органы). */
async function selVisible(p: Page): Promise<string> {
  const r = (await p.evaluate(`(() => {
    const el = document.querySelector('.sky');
    if (!el.dataset.sel) return 'нет выбранной звезды';
    const [x, y] = el.dataset.sel.split(' ').map(Number);
    const [l, t, r, b] = el.dataset.view.split(' ').map(Number);
    if (x < l || x > r || y < t || y > b) return 'звезда (' + x.toFixed(0) + ', ' + y.toFixed(0) + ') вне видимой части ' + t.toFixed(0) + '…' + b.toFixed(0);
    const c = el.querySelector('canvas').getBoundingClientRect();
    const e = document.elementFromPoint(c.left + x, c.top + y);
    return e && e.tagName === 'CANVAS' ? '' : 'звезду закрывает «' + (e ? e.className || e.tagName : 'ничего') + '»';
  })()`)) as string;
  return r;
}
/** Мелкие цели касания в корне sel: кнопки, поля, пункты; ссылки внутри фразы (поле 32 px — ::after) не считаются. */
async function smallTargets(p: Page, sel: string): Promise<string[]> {
  return (await p.evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(sel)});
    if (!root) return ['нет ' + ${JSON.stringify(sel)}];
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !e.closest('.visually-hidden') && getComputedStyle(e).visibility !== 'hidden'; };
    const inline = (e) => e.matches('.person, .ref, .see, button.why, .refs .more, .mark');
    return [...root.querySelectorAll('button, input, select, [role^=menuitem]')].filter(vis).filter((e) => !inline(e))
      .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || e.type || e.tagName).trim().slice(0, 24), w: r.width, h: r.height }; })
      .filter((q) => q.h < 43.5 || q.w < 43.5)
      .map((q) => '«' + q.t + '» ' + q.w.toFixed(0) + '×' + q.h.toFixed(0));
  })()`)) as string[];
}

export const phone7: Scenario[] = [
  {
    n: 300,
    title: 'MOB-44: поворот 844 × 390 → 390 × 844 и обратно, сужение окна 1440 → 700 — верхняя строка, небо, полоса и их холсты шириной окна',
    view: { width: 844, height: 390, touch: true },
    run: async (p) => {
      await go(p, '#/david');
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForTimeout(1500);
      let off = await widthsOff(p);
      if (off) return fail(`после поворота в книжную: ${off}`);
      // колонка сетки не следует за содержимым (minmax(0, 1fr)): холст шириной 844 px в потоке области (так прежде
      // оставался холст полосы после поворота, MOB-44) не раздвигает её, даже у области без min-width: 0 и overflow —
      // небо, верхняя строка и полоса остаются шириной окна
      const held = (await p.evaluate(`(() => {
        const strip = document.querySelector('.strip'), c = strip.querySelector('canvas');
        const was = [strip.getAttribute('style'), c.getAttribute('style')];
        strip.style.minWidth = 'auto';
        strip.style.overflow = 'visible';
        c.style.position = 'static';
        c.style.width = '844px';
        const w = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width);
        const out = [w('.app'), w('.top'), w('.sky'), w('.strip')];
        const put = (e, v) => (v === null ? e.removeAttribute('style') : e.setAttribute('style', v));
        put(strip, was[0]);
        put(c, was[1]);
        return out;
      })()`)) as number[];
      if (held.some((x) => x !== 390)) return fail(`холст шириной 844 px держит сетку: .app, .top, .sky, .strip — ${held.join(', ')}`);
      // «Разделы» открываются и пункты в пределах экрана
      await tap(p, '.top .sections > button');
      const menu = await p.locator('.top .sections [role="menu"]').boundingBox();
      if (!menu || menu.x < 0 || menu.x + menu.width > 391) return fail(`«Разделы» за краем: ${JSON.stringify(menu)}`);
      await p.keyboard.press('Escape');
      await p.setViewportSize({ width: 844, height: 390 });
      await p.waitForTimeout(1500);
      off = await widthsOff(p);
      if (off) return fail(`после поворота обратно: ${off}`);
      // окно 1440 × 900 с мышью — сузить до 700 и снова расширить
      const desk = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const q = await desk.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '#/david'));
        await q.waitForTimeout(2000);
        await q.setViewportSize({ width: 700, height: 900 });
        await q.waitForTimeout(1500);
        off = await widthsOff(q);
        if (off) return fail(`окно 1440 → 700: ${off}`);
        await q.setViewportSize({ width: 1440, height: 900 });
        await q.waitForTimeout(1500);
        off = await widthsOff(q);
        if (off) return fail(`окно 700 → 1440: ${off}`);
      } finally {
        await desk.close();
      }
      return pass('844 → 390 → 844, 1440 → 700 → 1440: области шириной окна');
    },
  },
  {
    n: 301,
    title: 'MOB-45, решение 117: на телефоне под открытой панелью верхняя строка недоступна; после «×» «Меню» раскрывается поверх неба, «Указатель» открывается одной панелью; подсказки поиска — поверх',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david');
      await openSection(p, 'Родство');
      if (!(await p.locator('.app > .sheet h2', { hasText: 'Родство' }).count())) return fail('«Родство» не открылось');
      // этап 13, решение 117: панель — модальное окно, верхняя строка под ней недоступна; «×» закрывает панель, «Меню»
      // раскрывается поверх неба
      if (!(await p.evaluate(() => !!document.querySelector('.app > .top')?.closest('[inert]')))) return fail('под панелью верхняя строка доступна');
      await tap(p, '.app > .sheet .sheet-head .close');
      await tap(p, '.top .sections > button');
      const onTop = (await p.evaluate(`(() => {
        const m = document.querySelector('.top .sections [role=menu]');
        if (!m) return 'нет меню';
        // пункты в видимой части списка (длинный список со строками задач прокручивается, решение 122)
        const mb = m.getBoundingClientRect();
        const bad = [...m.querySelectorAll('[role^=menuitem]')].filter((it) => { const r = it.getBoundingClientRect(); if (r.top < mb.top || r.bottom > mb.bottom) return false; const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !e || !it.contains(e); });
        return bad.length ? 'пункты под листом: ' + bad.map((b) => b.textContent.trim()).join(', ') : '';
      })()`)) as string;
      if (onTop) return fail(onTop);
      await tap(p, '.top .sections [role^="menuitem"]', 'Указатель');
      const heads = await p.locator('.app > .sheet h2').allInnerTexts();
      if (heads.length !== 1 || heads[0].trim() !== 'Указатель') return fail(`после выбора «Указателя» панели: ${heads.join(', ')}`);
      // поиск — после закрытия панели (решение 117): подсказки поверх неба
      await tap(p, '.app > .sheet .sheet-head .close');
      await tap(p, '.top label[for="find"]');
      await p.keyboard.type('Руфь');
      await p.waitForTimeout(400);
      const res = await p.locator('.top .results').boundingBox();
      if (!res) return fail('нет подсказок поиска');
      const hit = await p.evaluate(`(() => { const e = document.elementFromPoint(${res.x + res.width / 2}, ${res.y + Math.min(30, res.height / 2)}); return !!e && !!e.closest('.results'); })()`);
      if (!hit) return fail('подсказки поиска под другим слоем');
      return pass('под панелью верхняя строка недоступна; меню и подсказки — поверх неба');
    },
  },
  {
    n: 302,
    title: 'MOB-47: «Родство» → «выбрать второе на небе» на телефоне убирает лист панели, снимает inert, строка выбора с «отменить» 44 px; касание звезды — панель с ответом',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david');
      await openSection(p, 'Родство');
      await tap(p, '.app > .sheet .cmd', 'выбрать второе на небе');
      await p.waitForTimeout(400);
      const st = (await p.evaluate(`(() => {
        const sh = document.querySelector('.app > .sheet');
        const bar = document.querySelector('.pickbar-pick');
        const r = bar && bar.getBoundingClientRect();
        const top = r && document.elementFromPoint(r.left + 20, r.top + r.height / 2);
        const cancel = bar && [...bar.querySelectorAll('button')].find((b) => /отменить/i.test(b.textContent));
        return {
          sheet: sh ? getComputedStyle(sh).display : 'нет',
          inert: [...document.querySelectorAll('[inert]')].map((e) => e.className),
          bar: !!top && !!top.closest('.pickbar'),
          cancel: cancel ? cancel.getBoundingClientRect().height : 0,
          stop: document.querySelector('.app > .folio')?.dataset.stop,
          focus: document.activeElement?.tagName,
        };
      })()`)) as { sheet: string; inert: string[]; bar: boolean; cancel: number; stop: string; focus: string };
      if (st.sheet !== 'none') return fail(`лист панели на месте (${st.sheet})`);
      if (st.inert.length) return fail(`под листом осталось inert: ${st.inert.join(', ')}`);
      if (!st.bar) return fail('строки выбора не видно');
      if (st.cancel < 44) return fail(`«отменить» ${st.cancel} px`);
      if (st.stop !== 'peek') return fail(`лист карточки ${st.stop}, а не на шапке`);
      if (st.focus !== 'CANVAS') return fail(`фокус на ${st.focus}, а не на небе`);
      // «отменить» — панель возвращается, выбора нет
      await tap(p, '.pickbar-pick button', 'отменить');
      if ((await p.locator('.app > .sheet').evaluate((e) => getComputedStyle(e).display)) === 'none') return fail('после «отменить» лист панели не вернулся');
      // снова выбор — касание Соломона на небе
      await tap(p, '.app > .sheet .cmd', 'выбрать второе на небе');
      await p.waitForTimeout(400);
      const at = await starAt(p, 'solomon');
      if (!at) return fail('Соломона нет на виду');
      const box = (await p.locator('.sky canvas').boundingBox())!;
      await p.touchscreen.tap(box.x + at.x, box.y + at.y);
      await p.waitForTimeout(1000);
      if (hashId(p) !== 'david') return fail(`касание сменило выбор на «${hashId(p)}»`);
      const back = (await p.evaluate(`(() => {
        const sh = document.querySelector('.app > .sheet');
        return { shown: !!sh && getComputedStyle(sh).display !== 'none', sent: sh?.querySelector('.relation .sent')?.textContent ?? '', focus: document.activeElement?.textContent?.slice(0, 40) ?? '', inert: [...document.querySelectorAll('[inert]')].length };
      })()`)) as { shown: boolean; sent: string; focus: string; inert: number };
      if (!back.shown) return fail('после выбора панель не вернулась');
      if (!/Давид\s—\sотец Соломона/.test(back.sent)) return fail(`ответ «${back.sent}»`);
      if (back.focus !== back.sent) return fail(`фокус на «${back.focus}», а не на ответе`);
      if (!back.inert) return fail('лист панели вернулся, а небо под ним не inert');
      return pass(back.sent);
    },
  },
  {
    n: 303,
    title: 'MOB-48: разворот на телефоне (390, 360) — в каждом разделе сначала корешок с номером и названием, под ним «Давид: …», затем «Соломон: …»',
    view: PHONE,
    run: async (p) => {
      const check = async (q: Page, w: number) => {
        await go(q, '#/david');
        const bt = q.locator('.folio .actions button', { hasText: 'Разворот с…' });
        if (!(await bt.isVisible())) await tap(q, '.folio .sheet-bar .bar-toggle');
        await bt.first().tap();
        await q.waitForTimeout(500);
        await tap(q, '.top label[for="find"]');
        await q.keyboard.type('Соломон');
        await q.waitForTimeout(400);
        await q.keyboard.press('Enter');
        await q.waitForTimeout(1500);
        if (!(await q.locator('.spread').count())) return `${w}: разворот не открылся`;
        const bad = (await q.evaluate(`(() => [...document.querySelectorAll('.spread .row:not(.mastrow)')].map((r) => {
          const sp = r.querySelector(':scope > .spine'), pg = [...r.querySelectorAll(':scope > .pg')];
          if (!sp || pg.length !== 2) return 'строка без корешка';
          const [a, b] = pg.map((e) => e.getBoundingClientRect().top);
          const s = sp.getBoundingClientRect();
          const who = pg.map((e) => e.querySelector('.who')?.textContent.trim());
          const no = sp.querySelector('.no')?.textContent.trim();
          if (!(s.bottom <= a + 1 && a < b)) return '§ ' + no + ': корешок ' + s.top.toFixed(0) + ', Давид ' + a.toFixed(0) + ', Соломон ' + b.toFixed(0);
          if (who[0] !== 'Давид:' || who[1] !== 'Соломон:') return '§ ' + no + ': ' + who.join(' / ');
          return '';
        }).filter(Boolean))()`)) as string[];
        return bad.length ? `${w}: ${bad.slice(0, 3).join('; ')}` : '';
      };
      const r390 = await check(p, 390);
      if (r390) return fail(r390);
      const small = await p.context().browser()!.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      try {
        const q = await small.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '#/'));
        await q.waitForTimeout(1200);
        const r360 = await check(q, 360);
        if (r360) return fail(r360);
      } finally {
        await small.close();
      }
      return pass('390 и 360: корешок, Давид, Соломон');
    },
  },
  {
    n: 304,
    title: 'MOB-59: «Эпохи» на телефоне — лист на месте листа карточки (над полосой времени), карточка не выглядывает, Давид виден над листом; закрыли — карточка на прежнем месте',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david');
      const stop0 = await p.locator('.app > .folio').getAttribute('data-stop');
      await tap(p, '.skyctl.column button', 'Вид');
      await p.locator('.sky > .sheet').getByText('ярусы эпох', { exact: true }).tap();
      await p.waitForTimeout(300);
      await tap(p, '.sky > .sheet button', 'Эпохи и их основания');
      await p.waitForTimeout(1200);
      const g = (await p.evaluate(`(() => {
        const sh = document.querySelector('.app > .sheet'), f = document.querySelector('.app > .folio'), st = document.querySelector('.strip');
        const r = sh.getBoundingClientRect(), s = st.getBoundingClientRect();
        return { h2: sh.querySelector('h2')?.textContent, bottom: r.bottom, strip: s.top, folio: getComputedStyle(f).visibility, stripHit: !!document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2)?.closest('.strip') };
      })()`)) as { h2: string; bottom: number; strip: number; folio: string; stripHit: boolean };
      if (g.h2 !== 'Эпохи') return fail(`открыта панель «${g.h2}»`);
      if (Math.abs(g.bottom - g.strip) > 1.5) return fail(`низ листа «Эпох» ${g.bottom.toFixed(0)}, полоса времени с ${g.strip.toFixed(0)}`);
      if (!g.stripHit) return fail('полоса времени закрыта');
      if (g.folio !== 'hidden') return fail(`лист карточки виден (${g.folio})`);
      const vis = await selVisible(p);
      if (vis) return fail(`Давид при «Эпохах»: ${vis}`);
      await tap(p, '.app > .sheet .sheet-head .close');
      await p.waitForTimeout(500);
      const after = (await p.evaluate(`(() => { const f = document.querySelector('.app > .folio'); return { vis: getComputedStyle(f).visibility, stop: f.dataset.stop }; })()`)) as { vis: string; stop: string };
      if (after.vis !== 'visible' || after.stop !== stop0) return fail(`после закрытия «Эпох» лист карточки ${after.vis}, ${after.stop} (было ${stop0})`);
      return pass();
    },
  },
  {
    n: 305,
    title: 'MOB-39, решение 33: на телефоне цели в панелях не меньше 44 × 44 — номера глав, поле «Второе», указатель, «Сквозной раздел», «Вид», выбор «Добавить в набор» с флажком',
    view: PHONE,
    run: async (p) => {
      const out: string[] = [];
      for (const name of ['Главы', 'Родство', 'Указатель', 'Сквозной раздел', 'Синопсис']) {
        await go(p, '#/david');
        await openSection(p, name);
        await p.waitForTimeout(400);
        const small = await smallTargets(p, '.app > .sheet');
        if (small.length) out.push(`${name}: ${small.slice(0, 3).join(', ')}`);
      }
      await go(p, '#/david');
      await tap(p, '.skyctl.column button', 'Вид');
      const v = await smallTargets(p, '.sky > .sheet');
      if (v.length) out.push(`«Вид»: ${v.slice(0, 3).join(', ')}`);
      await go(p, '#/david');
      await tap(p, '.folio .actions button', 'Добавить в набор');
      const w = await smallTargets(p, '.folio div.workpick');
      if (w.length) out.push(`«Добавить в набор»: ${w.slice(0, 3).join(', ')}`);
      // строка выбора не шире листа: подписи и «поколений» не уходят за его край
      const over = (await p.evaluate(`(() => { const w = document.querySelector('.folio div.workpick'); if (!w) return 0; const r = w.getBoundingClientRect(); return Math.max(0, ...[...w.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - r.right)); })()`)) as number;
      if (over > 1) out.push(`«Добавить в набор»: строка шире листа на ${over.toFixed(0)} px`);
      return out.length ? fail(out.join('; ')) : pass();
    },
  },
  {
    n: 306,
    title: 'MOB-50: на телефоне «Как читать карту» под открытым листом карточки не получает фокус и не читается; лист закрыт — команда на месте',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david');
      const state = async () =>
        (await p.evaluate(`(() => { const g = document.querySelector('.guide-cmd'); if (!g) return 'нет'; const vis = getComputedStyle(g).visibility; g.focus(); return vis + (document.activeElement === g ? ' фокус' : ''); })()`)) as string;
      for (const stop of ['half', 'peek']) {
        if (stop === 'peek') await tap(p, '.folio .actions button', 'Показать на небе');
        const s = await state();
        if (s !== 'hidden') return fail(`лист на ${stop}: «Как читать карту» — ${s}`);
      }
      await tap(p, '.folio .sheet-bar .close');
      await p.waitForTimeout(500);
      const s = await state();
      if (s !== 'visible фокус') return fail(`без листа «Как читать карту» — ${s}`);
      return pass();
    },
  },
  {
    n: 307,
    title: 'Планшет 768 × 1024: поворот 1024 × 768 → 768 × 1024 — области шириной окна; «выбрать второе на небе» в «Родстве» не убирает панель-колонку, небо доступно',
    view: { width: 1024, height: 768, touch: true },
    run: async (p) => {
      await go(p, '#/david');
      await p.setViewportSize(TABLET);
      await p.waitForTimeout(1500);
      const off = await widthsOff(p);
      if (off) return fail(`после поворота: ${off}`);
      const direct = p.locator('.commands > button', { hasText: 'Родство' });
      if ((await direct.count()) && (await direct.first().isVisible())) await direct.first().tap();
      else {
        await tap(p, '.commands .more > button');
        await tap(p, '.commands .more [role^="menuitem"]', 'Родство');
      }
      await p.waitForTimeout(500);
      await tap(p, '.app > .sheet .cmd', 'выбрать второе на небе');
      const st = (await p.evaluate(`(() => { const sh = document.querySelector('.app > .sheet'); return { shown: !!sh && getComputedStyle(sh).display !== 'none', inert: [...document.querySelectorAll('[inert]')].length, bar: !!document.querySelector('.pickbar-pick') }; })()`)) as {
        shown: boolean;
        inert: number;
        bar: boolean;
      };
      if (!st.shown) return fail('на планшете панель-колонка убрана');
      if (st.inert) return fail('на планшете небо inert');
      if (!st.bar) return fail('нет строки выбора');
      return pass();
    },
  },
  {
    n: 308,
    title: 'MOB-48, IX-66: в разметке разворота корешок раздела — первым, затем Давид, затем Соломон; «Показать на небе» Соломона — карточка Соломона, фокус на её заголовке',
    run: async (p) => {
      await go(p, '#/david', 2000);
      await p.locator('.folio .actions button', { hasText: 'Разворот с…' }).first().click();
      await p.waitForTimeout(400);
      await p.click('#find');
      await p.keyboard.type('Соломон');
      await p.waitForTimeout(400);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      if (!(await p.locator('.spread').count())) return fail('разворот не открылся');
      // порядок разметки — порядок чтения диктора: корешок, первое лицо, второе лицо; в шапках — Давид, Соломон, цепочка
      const bad = (await p.evaluate(`(() => {
        const out = [];
        for (const r of document.querySelectorAll('.spread .row:not(.mastrow)')) {
          const k = [...r.children].map((c) => c.classList.contains('spine') ? 'корешок' : c.querySelector('.who')?.textContent.trim());
          if (k.join(' ') !== 'корешок Давид: Соломон:') out.push(k.join(' '));
        }
        const m = [...document.querySelector('.spread .mastrow').children].map((c) => c.classList.contains('spine') ? 'цепочка' : c.querySelector('h2')?.textContent.trim());
        if (m.join(' ') !== 'Давид Соломон цепочка') out.push('шапки: ' + m.join(' '));
        return out;
      })()`)) as string[];
      if (bad.length) return fail(`порядок разметки: ${bad.slice(0, 3).join('; ')}`);
      // на экране — прежний разворот: Давид слева, корешок посередине, Соломон справа
      const row = p.locator('.spread .row:not(.mastrow)').first();
      const xs = await row.evaluate((r) => [...r.children].map((c) => Math.round(c.getBoundingClientRect().left)));
      if (!(xs[1] < xs[0] && xs[0] < xs[2])) return fail(`места на экране (корешок, Давид, Соломон): ${xs.join(', ')}`);
      await p.locator('.spread .mastrow .pg').nth(1).locator('button', { hasText: 'Показать на небе' }).click();
      await p.waitForTimeout(1600);
      if (await p.locator('.spread').count()) return fail('разворот не закрылся');
      if (hashId(p) !== 'solomon') return fail(`выбрано «${hashId(p)}»`);
      const f = await p.evaluate('document.activeElement?.id');
      if (f !== 'title-solomon') return fail(`фокус на «${f}», а не на заголовке карточки Соломона`);
      const vis = await selVisible(p);
      if (vis) return fail(vis);
      return pass();
    },
  },
  {
    n: 309,
    title: 'Разворот на телефоне: «Показать на небе» — разворот закрыт, лист карточки на шапке, звезда видна над ним, фокус на заголовке карточки (IX-66, MOB-15)',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david');
      const bt = p.locator('.folio .actions button', { hasText: 'Разворот с…' });
      if (!(await bt.isVisible())) await tap(p, '.folio .sheet-bar .bar-toggle');
      await bt.first().tap();
      await p.waitForTimeout(500);
      await tap(p, '.top label[for="find"]');
      await p.keyboard.type('Соломон');
      await p.waitForTimeout(400);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      await p.locator('.spread .mastrow .pg').nth(1).locator('button', { hasText: 'Показать на небе' }).tap();
      await p.waitForTimeout(1600);
      if (await p.locator('.spread').count()) return fail('разворот не закрылся');
      if (hashId(p) !== 'solomon') return fail(`выбрано «${hashId(p)}»`);
      const stop = await p.locator('.app > .folio').getAttribute('data-stop');
      if (stop !== 'peek') return fail(`лист карточки ${stop}, а не на шапке`);
      const vis = await selVisible(p);
      if (vis) return fail(vis);
      const f = await p.evaluate('document.activeElement?.id');
      return f === 'title-solomon' ? pass() : fail(`фокус на «${f}»`);
    },
  },
];
