/**
 * Сценарии приёмки этапа 6: клавиатура и экранный диктор (I1–I3; U9; ТЗ § 11.2 п. 10). Номера 170–189.
 * Небо — одна остановка Tab (холст role="application"); звезда с фокусом — пункт списка лиц на виду (#sky-stars),
 * на который указывает aria-activedescendant холста; data-x и data-y пункта — где звезда (px холста).
 */
import type { Page } from 'playwright';
import { pass, fail, find, hashId, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };

/** Что в фокусе: тег, id, где (верхняя строка, панель, небо, карточка, полоса) и указатель холста. */
async function active(p: Page) {
  return (await p.evaluate(`(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { tag: 'body', id: '', where: '', desc: '', text: '' };
    const where = a.closest('.top') ? 'top' : a.closest('.sheet, .spread') ? 'sheet' : a.closest('.sky') ? 'sky' : a.closest('.folio') ? 'folio' : a.closest('.strip') ? 'strip' : '';
    return { tag: a.tagName.toLowerCase(), id: a.id, where, desc: a.getAttribute('aria-activedescendant') || '', text: (a.textContent || '').trim().slice(0, 60) };
  })()`)) as { tag: string; id: string; where: string; desc: string; text: string };
}
/** Звезда с фокусом клавиатуры (id лица) — по aria-activedescendant холста. */
const focusedStar = async (p: Page) => ((await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '').replace(/^sky-star-/, '');
/** Где звезда лица id (px холста) — по пункту списка лиц неба. */
async function starXY(p: Page, id: string) {
  const b = p.locator(`#sky-star-${id}`);
  if (!(await b.count())) return null;
  return { x: Number(await b.getAttribute('data-x')), y: Number(await b.getAttribute('data-y')) };
}
/** Tab от начала страницы до холста неба: сколько нажатий (или −1, если за max не дошли). */
async function tabToSky(p: Page, max = 40) {
  for (let i = 1; i <= max; i++) {
    await p.keyboard.press('Tab');
    if ((await active(p)).tag === 'canvas') return i;
  }
  return -1;
}
/**
 * Стрелками к звезде id: на каждом шаге — стрелка в ту сторону, где цель дальше. Возвращает число нажатий и путь;
 * steps −1 — не дошли за max.
 */
async function arrowsTo(p: Page, id: string, max = 60) {
  const path: string[] = [];
  let target = await starXY(p, id);
  for (let i = 0; i <= max; i++) {
    const cur = await focusedStar(p);
    path.push(cur);
    if (cur === id) return { steps: i, path };
    const a = cur ? await starXY(p, cur) : null;
    target = (await starXY(p, id)) ?? target;
    if (!a || !target) return { steps: -1, path };
    const dx = target.x - a.x;
    const dy = target.y - a.y;
    await p.keyboard.press(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp');
    await p.waitForTimeout(60);
  }
  return { steps: -1, path };
}
/** Окно неба (data-view, SkyView): сдвиг по x0 и полосам. */
async function view(p: Page) {
  const v = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  return { x0: v[4], laneTop: v[6] };
}
/**
 * Клавиша русской раскладки: физическая клавиша code с надписью key (например, «/» — это «.» на русской раскладке).
 * Через протокол отладки, как от настоящей клавиатуры: атлас смотрит на KeyboardEvent.code.
 */
async function ruKey(p: Page, key: string, code: string, vk: number, shift = false) {
  const cdp = await p.context().newCDPSession(p);
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (key.length === 1) await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: key, unmodifiedText: key, ...base });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await cdp.detach();
}

export const a11y: Scenario[] = [
  {
    n: 170,
    title: 'U9: от начала страницы до неба не больше 15 Tab; стрелками до Давида; Enter — карточка у звезды, фокус в ней; «?» — таблица клавиш; «Карточка» — фокус на заголовке; Escape возвращает фокус',
    run: async (p) => {
      const tabs = await tabToSky(p);
      if (tabs < 0 || tabs > 15) return fail(`до неба ${tabs < 0 ? 'больше 40' : tabs} нажатий Tab`);
      const start = await focusedStar(p);
      if (!start) return fail('фокус на небе, но звезды с фокусом нет (нет кольца)');
      const walk = await arrowsTo(p, 'david');
      if (walk.steps < 0) return fail(`стрелками до Давида не дошли: ${walk.path.slice(0, 20).join(' → ')}`);
      // этап 11 (решения 77, 83): Enter на звезде открывает у неё карточку с «Родством», фокус — в ней (первое имя
      // «Родства»: связь — Enter на имени, § 8); подробная карточка справа — её команда «Карточка», фокус — на заголовке
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      if (hashId(p) !== 'david') return fail(`Enter выбрал «${hashId(p)}»`);
      const inDot = () => p.evaluate(`(() => { const c = document.querySelector('.sky .dotcard'); return c && c.contains(document.activeElement) ? c.getAttribute('aria-label') : ''; })()`) as Promise<string>;
      const d1 = await inDot();
      if (!/^Давид/.test(d1)) return fail(`после Enter фокус не в карточке у звезды Давида: ${JSON.stringify(await active(p))}`);
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(800);
      const a2 = await active(p);
      if (a2.where !== 'sheet' || a2.id !== 'legend-keys') return fail(`«?»: фокус на ${a2.tag}#${a2.id} (${a2.where || 'вне панели'}), а не на «Клавиши»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      if (!/^Давид/.test(await inDot())) return fail(`Escape из таблицы клавиш: фокус на ${JSON.stringify(await active(p))}, а не в карточке у звезды`);
      await p.locator('.sky .dotcard .dc-card').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const a1 = await active(p);
      if (a1.id !== 'title-david') return fail(`«Карточка»: фокус на ${a1.tag}#${a1.id}, а не на заголовке карточки`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(700);
      const a4 = await active(p);
      if (hashId(p)) return fail('Escape с заголовка не закрыл карточку');
      if (a4.tag !== 'canvas' || a4.desc !== 'sky-star-david') return fail(`после карточки фокус на ${a4.tag}${a4.desc ? ` (${a4.desc})` : ''}, а не на небе у Давида`);
      return pass(`Tab до неба: ${tabs}; стрелок до Давида: ${walk.steps} (${walk.path.join(' → ')})`);
    },
  },
  {
    n: 171,
    title: 'I1: небо — одна остановка Tab: холст role="application", список лиц вне порядка Tab, следующий Tab уходит с неба',
    run: async (p) => {
      const cv = p.locator('.sky canvas');
      const role = await cv.getAttribute('role');
      const rd = await cv.getAttribute('aria-roledescription');
      if (role !== 'application' || rd !== 'звёздная карта') return fail(`холст: role «${role}», aria-roledescription «${rd}»`);
      const tabbable = (await p.evaluate(`[...document.querySelectorAll('.sky .visually-hidden button, .sky .visually-hidden a, #sky-stars button')].filter((e) => e.tabIndex >= 0 && e.getClientRects().length).length`)) as number;
      if (tabbable) return fail(`в скрытых списках неба ${tabbable} остановок Tab`);
      const items = await p.locator('#sky-stars button').count();
      if (items < 10) return fail(`в списке лиц на виду ${items} пунктов`);
      await tabToSky(p);
      await p.keyboard.press('Tab');
      const a = await active(p);
      if (a.tag === 'canvas' || (await p.evaluate(`!!document.activeElement.closest('.visually-hidden')`))) return fail(`Tab с неба ушёл в ${a.tag}#${a.id}`);
      return pass(`после холста — «${a.text}»; в списке лиц ${items}`);
    },
  },
  {
    n: 172,
    title: 'I1: стрелка на небе — к ближайшей звезде в эту сторону (кольцо и имя), Shift со стрелкой — сдвиг неба; вне неба стрелки сдвигают небо',
    run: async (p) => {
      await tabToSky(p);
      const s0 = await focusedStar(p);
      const a = await starXY(p, s0);
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(150);
      const s1 = await focusedStar(p);
      const b = await starXY(p, s1);
      if (!s1 || s1 === s0 || !a || !b) return fail(`стрелка вправо: ${s0} → ${s1}`);
      if (!(b.x > a.x)) return fail(`«${s1}» не правее «${s0}»: ${a.x} → ${b.x}`);
      const back = await p.evaluate(`document.getElementById('sky-star-${s1}').getAttribute('aria-label')`);
      if (!back || !/[;]/.test(back as string)) return fail(`пункт звезды без годов для диктора: «${back}»`);
      await p.waitForTimeout(400);
      const v0 = await view(p);
      await p.keyboard.press('Shift+ArrowLeft');
      await p.waitForTimeout(500);
      const v1 = await view(p);
      if (Math.abs(v1.x0 - v0.x0) < 1e-6) return fail('Shift + стрелка не сдвинула небо');
      if ((await focusedStar(p)) !== s1) return fail('Shift + стрелка переставила фокус');
      // вне неба (фокус снят): стрелка сдвигает небо
      await p.evaluate(`document.activeElement && document.activeElement.blur()`);
      await p.keyboard.press('ArrowUp');
      await p.waitForTimeout(500);
      const v2 = await view(p);
      if (Math.abs(v2.laneTop - v1.laneTop) < 1e-6) return fail('вне неба стрелка вверх не сдвинула небо');
      return pass(`${s0} → ${s1}; Shift + ← и ↑ вне неба сдвигают`);
    },
  },
  {
    n: 173,
    title: 'I1: Enter на пункте списка лиц неба (диктор) открывает у звезды карточку-диалог с именем лица, фокус в ней; «Карточка» — фокус на заголовке подробной карточки (MOB-29, MOB-31)',
    run: async (p) => {
      const btn = p.locator('#sky-stars button').first();
      const id = ((await btn.getAttribute('id')) ?? '').replace(/^sky-star-/, '');
      await btn.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      if (hashId(p) !== id) return fail(`Enter на «${id}» выбрал «${hashId(p)}»`);
      // этап 11 (решение 77): Enter открывает у звезды карточку с «Родством» — диалог с именем лица, фокус в нём;
      // «Карточка» — подробная карточка, фокус на её заголовке
      const dlg = (await p.evaluate(`(() => { const c = document.querySelector('.sky .dotcard'); return c && c.contains(document.activeElement) ? { role: c.getAttribute('role'), label: c.getAttribute('aria-label') } : null; })()`)) as { role: string; label: string } | null;
      if (!dlg || dlg.role !== 'dialog') return fail(`фокус не в карточке у звезды: ${JSON.stringify(await active(p))}`);
      const name = (await p.evaluate(`document.getElementById('sky-star-${id}')?.textContent ?? ''`)) as string;
      if (!dlg.label.startsWith(name.trim())) return fail(`имя диалога «${dlg.label}», а лицо «${name}»`);
      await p.locator('.sky .dotcard .dc-card').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const a = await active(p);
      return a.id === `title-${id}` ? pass(`${id}: «${dlg.label}»`) : fail(`«Карточка»: фокус на ${a.tag}#${a.id}, а не на заголовке карточки`);
    },
  },
  {
    n: 174,
    title: 'I2: панель — фокус на её заголовке; Escape и «×» возвращают фокус на открывшую кнопку',
    run: async (p) => {
      const cmd = p.locator('.commands > button', { hasText: 'Указатель' });
      await cmd.click();
      await p.waitForTimeout(400);
      const a = await active(p);
      if (a.where !== 'sheet' || a.tag !== 'h2') return fail(`после открытия фокус на ${a.tag} (${a.where || 'вне панели'})`);
      await p.keyboard.press('Tab');
      if ((await active(p)).where !== 'sheet') return fail('Tab с заголовка панели ушёл из панели');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      const b = await active(p);
      if (b.where !== 'top' || b.text !== 'Указатель') return fail(`после Escape фокус на ${b.tag} «${b.text}»`);
      // с клавиатуры: Enter на команде, Tab до «×», Enter
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      const close = p.locator('.sheet .sheet-head .close');
      await close.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      const c = await active(p);
      return c.where === 'top' && c.text === 'Указатель' ? pass() : fail(`после «×» фокус на ${c.tag} «${c.text}»`);
    },
  },
  {
    n: 175,
    title: 'I2: панель в разметке сразу после верхней строки — от начала страницы до первого органа панели не больше 15 Tab',
    run: async (p) => {
      // адрес с открытой панелью «Главы» и карточкой Давида: страница открывается заново, фокус — в начале страницы
      await p.goto(p.url().replace(/#.*$/, '#/david~pchapter'));
      await p.reload();
      await p.waitForTimeout(2200);
      const next = (await p.evaluate(`(() => { const t = document.querySelector('.app > .top'); const n = t && t.nextElementSibling; return n ? n.className : ''; })()`)) as string;
      if (!/\bsheet\b/.test(next)) return fail(`после верхней строки в разметке — «${next}»`);
      await p.keyboard.press('Tab');
      for (let i = 1; i <= 15; i++) {
        if ((await active(p)).where === 'sheet') return pass(`первый орган панели — на ${i}-м нажатии Tab`);
        await p.keyboard.press('Tab');
      }
      return fail('за 15 нажатий Tab до панели не дошли');
    },
  },
  {
    n: 176,
    title: 'I2: на телефоне панель модальна — небо, карточка и полоса времени inert; «×» снимает inert и возвращает фокус',
    view: PHONE,
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      await p.locator('.top .sections > button').tap();
      await p.locator('.top .sections [role^="menuitem"]', { hasText: 'Указатель' }).tap();
      await p.waitForTimeout(600);
      const inert = (await p.evaluate(`['.sky', '.folio', '.strip'].map((s) => !!document.querySelector(s).closest('[inert]'))`)) as boolean[];
      if (inert.some((x) => !x)) return fail(`под листом не inert: ${['небо', 'карточка', 'полоса'].filter((_, i) => !inert[i]).join(', ')}`);
      if (await p.evaluate(`!!document.querySelector('.top').closest('[inert]')`)) return fail('верхняя строка стала inert');
      const a = await active(p);
      if (a.where !== 'sheet') return fail(`фокус не в листе панели: ${a.tag}`);
      await p.locator('.sheet .sheet-head .close').tap();
      await p.waitForTimeout(600);
      const left = (await p.evaluate(`document.querySelectorAll('[inert]').length`)) as number;
      if (left) return fail(`после «×» осталось inert: ${left}`);
      const b = await active(p);
      return b.tag !== 'body' ? pass(`фокус после «×»: ${b.tag} «${b.text}»`) : fail('после «×» фокус потерян');
    },
  },
  {
    n: 177,
    title: 'I2: после закрытия карточки фокус не теряется — туда, откуда её открыли; переход по ссылке в карточке — на новый заголовок',
    run: async (p) => {
      await find(p, 'Давид');
      const a = await active(p);
      if (a.id !== 'title-david') return fail(`после поиска фокус на ${a.tag}#${a.id}`);
      // ссылка в карточке: новое лицо, фокус не на body
      await p.locator('.folio #sec-6 button.person[data-id="iessey"]').first().focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      if (hashId(p) !== 'iessey') return fail(`ссылка выбрала «${hashId(p)}»`);
      const b = await active(p);
      if (b.tag === 'body') return fail('после перехода по ссылке фокус потерян');
      // «×» карточки закрывает её, как вкладку (этап 7, решение 18; IX-52): открыта прежняя карточка — фокус на её заголовке
      await p.locator('.folio .close').first().focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      if (hashId(p) !== 'david') return fail(`после «×» выбрано «${hashId(p)}», а не прежняя карточка — Давид`);
      const d = await active(p);
      if (d.id !== 'title-david') return fail(`после «×» фокус на ${d.tag}#${d.id}, а не на заголовке прежней карточки`);
      // последняя карточка: «×» закрывает лист, фокус — туда, откуда карточку открыли
      await p.locator('.folio .close').first().focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      if (hashId(p)) return fail('«×» последней карточки не закрыл её');
      const c = await active(p);
      return c.tag !== 'body' ? pass(`после ссылки — ${b.tag}#${b.id}; после «×» — #${d.id}, затем ${c.tag}${c.id ? `#${c.id}` : ''}`) : fail('после «×» карточки фокус потерян');
    },
  },
  {
    n: 178,
    title: 'I3: холст описан окном неба («На карте … гг. …; видно N лиц»), описание звучит вежливой живой областью после сдвига',
    run: async (p) => {
      const cv = p.locator('.sky canvas');
      const ids = ((await cv.getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
      // описание окна появляется, когда небо остановится после зажигания звёзд
      let texts: string[] = [];
      for (let i = 0; i < 25; i++) {
        texts = await Promise.all(ids.map((id) => p.locator(`#${id}`).textContent().then((t) => t ?? '')));
        if (texts.some((t) => /^На\sкарте/.test(t))) break;
        await p.waitForTimeout(200);
      }
      const win = texts.find((t) => /^На\sкарте/.test(t)) ?? '';
      if (!/гг\.|г\./.test(win) || !/видно \d+/.test(win.replace(/ /g, ' '))) return fail(`описание окна: «${win}»`);
      if (!texts.some((t) => /Стрелки/.test(t))) return fail('в описании холста нет клавиш');
      await tabToSky(p);
      await p.keyboard.press('Equal');
      await p.waitForTimeout(1400);
      const live = (await p.evaluate(`[...document.querySelectorAll('.sky [aria-live="polite"]')].map((e) => e.textContent).join(' | ')`)) as string;
      const after = (await p.locator(`#${ids.find((_, i) => /^На\sкарте/.test(texts[i]))}`).textContent()) ?? '';
      if (after === win) return fail('после приближения описание окна не изменилось');
      return live.includes(after) ? pass(after) : fail(`живая область: «${live}», описание: «${after}»`);
    },
  },
  {
    n: 179,
    title: 'I3: main и h1; части карточки — h3, разделы — h4; панель названа своим h2',
    run: async (p) => {
      await find(p, 'Давид');
      const s = (await p.evaluate(`(() => ({
        h1: document.querySelectorAll('h1').length,
        main: document.querySelectorAll('main').length,
        skyInMain: !!document.querySelector('main .sky'),
        parts: document.querySelectorAll('.folio h3.part').length,
        secs: document.querySelectorAll('.folio .sec h4').length,
        folioLandmark: document.querySelector('.folio').tagName,
      }))()`)) as { h1: number; main: number; skyInMain: boolean; parts: number; secs: number; folioLandmark: string };
      if (s.h1 !== 1 || s.main !== 1 || !s.skyInMain) return fail(`h1: ${s.h1}, main: ${s.main}, небо в main: ${s.skyInMain}`);
      if (s.parts < 3 || s.secs < 10) return fail(`частей h3: ${s.parts}, разделов h4: ${s.secs}`);
      await p.locator('.commands > button', { hasText: 'Синопсис' }).click();
      await p.waitForTimeout(500);
      const named = (await p.evaluate(`(() => { const s = document.querySelector('.app > .sheet'); const id = s && s.getAttribute('aria-labelledby'); const h = id && document.getElementById(id); return h ? h.tagName + ' ' + h.textContent : ''; })()`)) as string;
      return /^H2 Синопсис/.test(named) ? pass(`частей ${s.parts}, разделов ${s.secs}; ${s.folioLandmark.toLowerCase()} карточки`) : fail(`панель названа «${named}»`);
    },
  },
  {
    n: 180,
    title: 'I3: комбобокс поиска по образцу ARIA — список с пунктами, aria-activedescendant за стрелкой; «ничего не найдено» — не список, а статус',
    run: async (p) => {
      await p.click('#find');
      await p.keyboard.type('Иосиф');
      await p.waitForTimeout(400);
      const inp = p.locator('#find');
      if ((await inp.getAttribute('role')) !== 'combobox' || (await inp.getAttribute('aria-expanded')) !== 'true') return fail('поле не комбобокс или список не раскрыт');
      const list = (await inp.getAttribute('aria-controls')) ?? '';
      if ((await p.locator(`#${list}`).getAttribute('role')) !== 'listbox') return fail(`aria-controls «${list}» — не listbox`);
      await p.keyboard.press('ArrowDown');
      const ad = (await inp.getAttribute('aria-activedescendant')) ?? '';
      const opt = p.locator(`#${ad}`);
      if (!ad || (await opt.getAttribute('role')) !== 'option' || (await opt.getAttribute('aria-selected')) !== 'true') return fail(`aria-activedescendant «${ad}» не на выделенном пункте`);
      const status = (await p.locator('.top .search [aria-live="polite"]').innerText()).replace(/ /g, ' ');
      if (!/\d+ лиц/.test(status)) return fail(`статус списка: «${status}»`);
      await p.fill('#find', 'Щщщщ');
      await p.waitForTimeout(400);
      const exp = await inp.getAttribute('aria-expanded');
      const roles = await p.locator('.top .results[role="listbox"]').count();
      const st2 = await p.locator('.top .search [aria-live="polite"]').innerText();
      if (exp !== 'false' || roles) return fail(`без совпадений: aria-expanded «${exp}», списков ${roles}`);
      return /ничего не найдено/.test(st2) ? pass() : fail(`статус без совпадений: «${st2}»`);
    },
  },
  {
    n: 181,
    title: 'I3: пометы «выв.», «толк.», «расч.», «справ.» — с полным текстом для диктора; у заголовков таблиц — scope',
    run: async (p) => {
      await find(p, 'Давид');
      const marks = (await p.evaluate(`[...document.querySelectorAll('.folio button.mark')].map((b) => b.getAttribute('aria-label') || '')`)) as string[];
      if (marks.length < 3) return fail(`помет в карточке Давида: ${marks.length}`);
      const short = marks.filter((m) => !/^(выв|толк|расч|справ)\.\s+—\s+\S{3,}/.test(m));
      if (short.length) return fail(`помета без полного текста: «${short[0]}»`);
      // таблицы: паспорт карточки, клавиши («?»), эпохи, синопсис
      const bare: string[] = [];
      let all = 0;
      const scan = async () => {
        all += (await p.evaluate(`document.querySelectorAll('th').length`)) as number;
        bare.push(...((await p.evaluate(`[...document.querySelectorAll('th')].filter((t) => !t.getAttribute('scope')).map((t) => t.textContent.trim().slice(0, 20))`)) as string[]));
      };
      await scan();
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(600);
      await scan();
      // «Эпохи» — в листе «Вид»: у блока органов — над ним, у колонки (небо уже 760 px) — лист «Вид» колонки (IX-56)
      if (await p.locator('.skyctl .view-toggle').count()) {
        await p.locator('.skyctl .view-toggle').click();
        await p.locator('.skyctl').getByText('Эпохи', { exact: true }).click();
      } else {
        // «Вид» у колонки заменяет открытую панель: небо становится шире, и лист «Вид» открывается над блоком органов
        await p.locator('.skyctl.column button', { hasText: 'Вид' }).click();
        await p.waitForTimeout(500);
        if (await p.locator('.viewpop').count()) await p.locator('.skyctl').getByText('Эпохи', { exact: true }).click();
        else await p.locator('.sky > .sheet button', { hasText: 'Эпохи и их основания' }).click();
      }
      await p.waitForTimeout(600);
      await scan();
      await p.locator('.commands > button', { hasText: 'Синопсис' }).click();
      await p.waitForTimeout(600);
      await scan();
      if (!all) return fail('на экранах нет заголовков таблиц');
      return bare.length ? fail(`th без scope: ${bare.slice(0, 4).join(', ')}`) : pass(`помет ${marks.length}; th со scope: ${all}`);
    },
  },
  {
    n: 182,
    title: 'ТЗ § 11.2 п. 10: карточка Давида только клавиатурой на русской раскладке — «.» (клавиша «/»), «Давид», Enter, J и K, «?» (Shift+7), Escape; остановки Tab — видимые органы',
    run: async (p) => {
      await ruKey(p, '.', 'Slash', 191);
      await p.waitForTimeout(150);
      if ((await active(p)).id !== 'find') return fail('клавиша «/» (на русской раскладке «.») не открыла поиск');
      if ((await p.inputValue('#find')) !== '') return fail(`в поле попал символ: «${await p.inputValue('#find')}»`);
      await p.keyboard.type('Давид');
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      if (hashId(p) !== 'david') return fail(`выбрано «${hashId(p)}»`);
      if ((await active(p)).id !== 'title-david') return fail('фокус не на заголовке карточки');
      // J — к следующему разделу (на русской раскладке «о»), K — к предыдущему («л»)
      await ruKey(p, 'о', 'KeyJ', 74);
      await p.waitForTimeout(400);
      const s1 = (await p.evaluate(`(document.activeElement.closest('.sec') || {}).id || ''`)) as string;
      await ruKey(p, 'о', 'KeyJ', 74);
      await p.waitForTimeout(400);
      await ruKey(p, 'л', 'KeyK', 75);
      await p.waitForTimeout(400);
      const s3 = (await p.evaluate(`(document.activeElement.closest('.sec') || {}).id || ''`)) as string;
      if (!s1 || s1 !== s3) return fail(`о, о, л: ${s1} → … → ${s3}`);
      // остановки Tab по карточке: каждая — видимый орган с полем нажатия, без невидимых и нулевых
      const stops: string[] = [];
      for (let i = 0; i < 60; i++) {
        await p.keyboard.press('Tab');
        const st = (await p.evaluate(`(() => {
          const a = document.activeElement;
          if (!a || !a.closest('.folio')) return null;
          const r = a.getBoundingClientRect();
          const f = a.closest('.folio').getBoundingClientRect();
          const hid = !!a.closest('.visually-hidden, [aria-hidden="true"]');
          return { ok: r.width >= 8 && r.height >= 8 && !hid && r.bottom > f.top && r.top < f.bottom, what: a.tagName.toLowerCase() + '.' + a.className + ' «' + (a.textContent || '').trim().slice(0, 24) + '»' };
        })()`)) as { ok: boolean; what: string } | null;
        if (!st) break;
        if (!st.ok) return fail(`невидимая остановка Tab: ${st.what}`);
        stops.push(st.what);
      }
      // «?» на русской раскладке — Shift + 7
      await ruKey(p, '?', 'Digit7', 55, true);
      await p.waitForTimeout(700);
      if ((await active(p)).id !== 'legend-keys') return fail('«?» (Shift + 7) не открыл таблицу клавиш');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      return (await active(p)).where === 'folio' ? pass(`J/K: ${s1}; остановок Tab проверено ${stops.length}`) : fail('Escape из таблицы клавиш не вернул фокус в карточку');
    },
  },
  {
    n: 184,
    title: 'ТЗ § 11.2 п. 10 без лишних остановок: рейка карточки — одна остановка Tab (метка текущего раздела), по меткам — стрелками',
    run: async (p) => {
      await find(p, 'Давид');
      const tabbable = (await p.evaluate(`[...document.querySelectorAll('.folio .rail button')].filter((b) => b.tabIndex >= 0).length`)) as number;
      const all = await p.locator('.folio .rail button').count();
      if (tabbable > 1) return fail(`у рейки ${tabbable} остановок Tab из ${all} меток`);
      const first = p.locator('.folio .rail button[tabindex="0"]');
      await first.focus();
      await p.keyboard.press('ArrowDown');
      const moved = (await p.evaluate(`(document.activeElement.getAttribute('aria-label') || '')`)) as string;
      return /^\d+ /.test(moved) ? pass(`меток ${all}, остановка одна; ↓ — «${moved}»`) : fail('стрелка вниз не переводит фокус по меткам рейки');
    },
  },
  {
    n: 183,
    title: 'I2: «Ещё» на 1024 — панель из меню; Escape возвращает фокус на кнопку «Ещё»',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const more = p.locator('.commands .more > button');
      if (!(await more.count())) return pass('на 1024 все команды в строке — «Ещё» нет');
      await more.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(200);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(600);
      const a = await active(p);
      if (a.where !== 'sheet' && a.where !== 'folio') return fail(`после выбора пункта фокус на ${a.tag} (${a.where || 'вне панели'})`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      const b = await active(p);
      return b.where === 'top' && /Ещё/.test(b.text) ? pass() : fail(`после Escape фокус на ${b.tag} «${b.text}»`);
    },
  },
];
