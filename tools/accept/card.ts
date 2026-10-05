/** Сценарии приёмки этапа 5: карточка как статья (F1–F12). Номера 90–109. */
import type { Page } from 'playwright';
import { pass, fail, find, hashId, secText, type Scenario } from './kit.ts';

/** Открыть лицо по адресу и дождаться тела карточки. */
async function open(p: Page, id: string) {
  await p.goto(p.url().replace(/#.*$/, '') + `#/${id}`);
  await p.waitForTimeout(1800);
}

/** Высота разделов листа: тело каждого раздела не выше 8 строк и заголовка (плюс строка «ещё N …»). */
async function sectionHeights(p: Page) {
  return (await p.evaluate(`(() => [...document.querySelectorAll('.folio .sec[data-n]')].map((s) => {
    const clamp = s.querySelector('.clamp');
    const lh = parseFloat(getComputedStyle(s).lineHeight) || 24;
    const more = clamp && clamp.querySelector(':scope > .clamp-more');
    const body = clamp ? clamp.getBoundingClientRect().height - (more ? more.getBoundingClientRect().height + 6 : 0) : s.getBoundingClientRect().height;
    return { n: s.dataset.n, lines: body / lh, more: more ? more.textContent.trim() : '' };
  }))()`)) as { n: string; lines: number; more: string }[];
}

export const card: Scenario[] = [
  {
    n: 90,
    title: 'F5: карточка Давида — не больше 6 экранов по 900 px (было 12), каждый раздел — до 8 строк и «ещё N …»',
    run: async (p) => {
      await open(p, 'david');
      // этап 20 (решение 194): «Родство» карточки у звезды переехало в лист (у Давида — 511 px) — его высота не в счёте;
      // решение 195: отбивки между разделами (16 px) и записями (6 px) разделяют факты — 250 px на лист Давида
      const h = (await p.evaluate(`document.querySelector('.folio-inner').scrollHeight - (document.querySelector('.folio .kin-col')?.getBoundingClientRect().height ?? 0)`)) as number;
      if (h > 6 * 900 + 250) return fail(`высота листа без «Родства» ${h} px — ${(h / 900).toFixed(1)} экрана`);
      const secs = await sectionHeights(p);
      // 8 строк текста 16/24 и вклейки мельче; запас — на абзацный отступ между записями
      const tall = secs.filter((s) => s.lines > 8 + 2.5 && s.n !== '23');
      if (tall.length) return fail(`выше 8 строк: ${tall.map((s) => `§ ${s.n} (${s.lines.toFixed(1)})`).join(', ')}`);
      const cut = secs.filter((s) => s.more);
      if (cut.length < 5) return fail(`«ещё N …» только в ${cut.length} разделах`);
      // «ещё 47 событий» раскрывает § 17 целиком, фокус — на первой раскрытой записи
      const more = p.locator('.folio #sec-17 .clamp-more');
      const label = (await more.innerText()).trim();
      const hidden = Number(/\d+/.exec(label)?.[0] ?? 0);
      const before = await p.locator('.folio #sec-17 li.fact').count();
      await more.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      const after = await p.locator('.folio #sec-17 li.fact').count();
      if (after - before !== hidden) return fail(`«${label}» раскрыло ${after - before}`);
      const focus = (await p.evaluate(`(document.activeElement && document.activeElement.closest('#sec-17') && document.activeElement.tagName) || ''`)) as string;
      if (focus !== 'LI') return fail(`после «${label}» фокус не на раскрытой записи (${focus || 'вне раздела'})`);
      return pass(`лист ${h} px (${(h / 900).toFixed(1)} экрана); свёрнуто разделов: ${cut.length}; «${label}»`);
    },
  },
  {
    n: 91,
    title: 'F8: рейка — ярлык «17 Жизнеописание — есть сведения» при наведении и фокусе, aria-current, цель 24 × 16, переход к разделу',
    run: async (p) => {
      await open(p, 'david');
      const b = p.locator('.folio .rail button').nth(16);
      const box = (await b.boundingBox())!;
      if (box.width < 24 || box.height < 16) return fail(`метка ${box.width}×${box.height}`);
      await b.hover();
      await p.waitForTimeout(150);
      const tip = p.locator('.folio .rail button:nth-of-type(17) .rail-label');
      const shown = (await b.locator('.rail-label').isVisible()) ? (await b.locator('.rail-label').innerText()).replace(/\s+/g, ' ').trim() : '';
      void tip;
      if (shown !== '17 Жизнеописание — есть сведения') return fail(`ярлык при наведении: «${shown}»`);
      // ярлык непрозрачный и сверху: в его середине — он сам
      const lb = (await b.locator('.rail-label').boundingBox())!;
      const top = await p.evaluate(`(() => { const e = document.elementFromPoint(${lb.x + lb.width / 2}, ${lb.y + lb.height / 2}); return !!e && !!e.closest('.rail-label'); })()`);
      if (!top) return fail('ярлык закрыт текстом листа');
      await p.mouse.move(5, 5);
      await b.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      if (!(await b.locator('.rail-label').isVisible())) return fail('ярлык не виден при фокусе');
      const secTop = (await p.locator('.folio #sec-17').boundingBox())!.y;
      const folioTop = (await p.locator('.folio').boundingBox())!.y;
      if (secTop - folioTop > 60 || secTop < folioTop) return fail(`§ 17 после перехода на ${Math.round(secTop - folioTop)} px от верха листа`);
      const cur = await p.locator('.folio .rail button[aria-current="location"]').getAttribute('aria-label');
      if (!cur?.startsWith('17 ')) return fail(`aria-current у «${cur}»`);
      const silent = await p.locator('.folio .rail button').nth(8).getAttribute('aria-label');
      return pass(`«${shown}»; текущая — «${cur}»; ${silent}`);
    },
  },
  {
    n: 92,
    title: 'F1: помета «выв.» (§ 6 Давида: «Дед по отцу: Овид») — у первой строки факта; нажатие раскрывает пояснение строкой под фактом',
    run: async (p) => {
      await open(p, 'david');
      const mark = p.locator('.folio #sec-6 .mark').first();
      await mark.scrollIntoViewIfNeeded();
      const fact = mark.locator('xpath=ancestor::*[contains(concat(" ", @class, " "), " fact ")][1]');
      const mb = (await mark.boundingBox())!;
      const fb = (await fact.boundingBox())!;
      if (Math.abs(mb.y + mb.height / 2 - (fb.y + 12)) > 10) return fail(`помета на ${Math.round(mb.y - fb.y)} px ниже начала факта`);
      const size = (await mark.evaluate((e) => getComputedStyle(e).fontSize)) as string;
      if (size !== '12px') return fail(`кегль пометы ${size}`);
      await mark.click();
      await p.waitForTimeout(150);
      const note = fact.locator('.mark-note');
      if (!(await note.isVisible())) return fail('пояснение не раскрылось');
      const t = (await note.innerText()).trim();
      if ((await mark.getAttribute('aria-expanded')) !== 'true') return fail('aria-expanded не true');
      return pass(`«${t}»`);
    },
  },
  {
    n: 93,
    // этап 7 (CARD-54, VIS-41; решение 26): четыре команды одной строкой — «Добавить в набор ▾» стоит в том же ряду (этап 11, Я30)
    title: 'F2, F10, CARD-54, решение 194: команды неба строкой «К звезде», «Ближайшая родня», «Предки и потомки ▾», ниже три команды одной строкой; «×» в углу; «Все 24 раздела» и печать — в колофоне',
    run: async (p) => {
      await open(p, 'ruf');
      // этап 20 (решение 194): команды карточки у звезды переехали сюда — строкой команд неба выше («К звезде»,
      // «Ближайшая родня», «Предки и потомки ▾»); строка сравнения и набора — три команды одной строкой
      const row = p.locator('.folio .actions:not(.sky-cmds) > button, .folio .actions:not(.sky-cmds) > .workbtn > button');
      const ys = await row.evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
      const names = (await row.allInnerTexts()).map((t) => t.replace(/[▾▴]/g, '').trim());
      if (names.join('|') !== 'Родство с…|Разворот с…|Добавить в набор') return fail(`команды: ${names.join(' | ')}`);
      const sky = (await p.locator('.folio .actions.sky-cmds > button, .folio .actions.sky-cmds .menu > button').allInnerTexts()).map((t) => t.replace(/[▾▴]/g, '').trim()).join('|');
      if (sky !== 'К звезде|Ближайшая родня|Предки и потомки') return fail(`команды неба: ${sky}`);
      if (new Set(ys).size !== 1) return fail(`команды в ${new Set(ys).size} строки`);
      const close = (await p.locator('.folio .close').first().boundingBox())!;
      const f = (await p.locator('.folio').boundingBox())!;
      if (f.x + f.width - (close.x + close.width) > 12 || close.y - f.y > 12) return fail('«×» не в правом верхнем углу');
      const col = p.locator('.folio .colophon');
      const cmds = (await col.locator('button').allInnerTexts()).map((t) => t.trim());
      if (!cmds.includes('Показать все 24 раздела')) return fail(`в колофоне: ${cmds.join(', ')}`);
      const before = await p.locator('.folio .sec.absent').count();
      await col.locator('button', { hasText: 'Показать все 24 раздела' }).click();
      await p.waitForTimeout(300);
      const after = await p.locator('.folio .sec.absent').count();
      if (before !== 0 || after === 0) return fail(`строк «не составлен»: ${before} → ${after}`);
      const text = (await col.locator(':scope > p:not(.rail-key)').innerText()).replace(/\s+/g, ' ');
      return pass(`«${text.slice(0, 90)}…»`);
    },
  },
  {
    n: 94,
    title: 'F3: «Кратко» под шапкой — кто это; имена — ссылки',
    run: async (p) => {
      await open(p, 'david');
      const b = p.locator('.folio .brief');
      if (!(await b.count())) return fail('нет «Кратко»');
      const t = (await b.innerText()).replace(/\s+/g, ' ').replace(/^Кратко: /, '').trim();
      // дети — по значимости (этап 7, CARD-65): Соломон раньше Нафана
      // этап 20 (решение 195): «В родословии Иисуса Христа по обеим линиям» — строкой паспорта «Линии Мессии» с номерами
      if (!/^Царь Иудеи, затем всего Израиля, сын Иессея из колена Иудина; царствовал 40 лет; отец Соломона и Нафана\.$/.test(t)) return fail(`«${t}»`);
      const ln = (await p.locator('.folio .passport .pass-lines').innerText().catch(() => '')).replace(/\u2060/g, '').replace(/\s+/g, ' ');
      if (!/у Матфея — 14-е имя/.test(ln) || !/у Луки — 42-е имя/.test(ln)) return fail(`строка «Линии Мессии»: «${ln}»`);
      const rule = (await p.locator('.folio .mast-rule').boundingBox())!;
      const bb = (await b.boundingBox())!;
      if (bb.y > rule.y) return fail('«Кратко» не над двойной чертой');
      await b.locator('button.person', { hasText: 'Иессея' }).click();
      await p.waitForTimeout(1500);
      return hashId(p) === 'iessey' ? pass(`«${t}»`) : fail(`ссылка «Иессея» выбрала «${hashId(p)}»`);
    },
  },
  {
    n: 95,
    title: 'F4: Мелхиседек — «9–12. Супруги, дети… — в Писании не сообщается» видно сразу; «не составлен» скрыт; у Иоава § 21 «не относится»',
    run: async (p) => {
      await open(p, 'melkhisedek');
      const line = p.locator('.folio .sec.silent', { hasText: 'Супруги' });
      if (!(await line.count())) return fail('нет строки «Супруги… — в Писании не сообщается»');
      const t = (await line.innerText()).replace(/\s+/g, ' ').trim();
      if (!/^9–12 Супруги, дети, братья и сёстры, иное родство — в Писании не сообщается$/.test(t)) return fail(`«${t}»`);
      if (await p.locator('.folio .sec.absent').count()) return fail('видны «не составлен»');
      const color = await line.evaluate((e) => getComputedStyle(e).color);
      const ink = await p.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--ink-3').trim()`);
      await open(p, 'ioav');
      const na = (await secText(p, 21)).replace(/\s+/g, ' ');
      if (!/В родословии Мессии — не относится/.test(na)) return fail(`§ 21 у Иоава: «${na}»`);
      return pass(`«${t}» (${color}, --ink-3 ${ink}); Иоав: «${na}»`);
    },
  },
  {
    n: 96,
    title: 'F11: малое лицо — краткая статья; прочие разделы одной строкой раскрываются',
    run: async (p) => {
      await open(p, 'maakha-nalozhnitsa-khaleva');
      const brief = (await p.locator('.folio .brief').innerText()).replace(/\s+/g, ' ').replace(/^Кратко: /, '').trim();
      // этап 13, решение 121: запись § 5, приведённая целиком, — со своим стихом, § 5 её не повторяет
      if (!/^Наложница Халева\s?1 Пар 2:48\. Мать Шевера, Фирханы, Шаафа и Шевы\.$/.test(brief)) return fail(`«Кратко»: «${brief}»`);
      if (await p.locator('.folio section.sec').count()) return fail('разделы видны до раскрытия');
      const btn = p.locator('.folio .rest button', { hasText: 'Показать все сведения' });
      if (!(await btn.count())) return fail('нет строки «Показать все сведения»');
      const h0 = (await p.evaluate(`document.querySelector('.folio-inner').scrollHeight`)) as number;
      await btn.click();
      await p.waitForTimeout(300);
      const n = await p.locator('.folio section.sec').count();
      if (n < 5) return fail(`после раскрытия разделов: ${n}`);
      return pass(`лист ${h0} px; раскрыто разделов: ${n}`);
    },
  },
  {
    n: 97,
    title: 'F9: § 23 — полоса 66 книг одной строкой, группы книг, заветы',
    run: async (p) => {
      await open(p, 'david');
      const cells = p.locator('.folio .canon .cg > span');
      if ((await cells.count()) !== 66) return fail(`клеток ${await cells.count()}`);
      const tops = new Set(await cells.evaluateAll((cs) => cs.map((c) => Math.round(c.getBoundingClientRect().top))));
      if (tops.size !== 1) return fail(`полоса в ${tops.size} строки`);
      const widths = await cells.evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().width));
      if (Math.min(...widths) < 3) return fail(`клетка уже 3 px: ${Math.min(...widths).toFixed(1)}`);
      const title = await cells.nth(9).getAttribute('title');
      if (!/^2\s?Цар: 230\s?стихов$/.test((title ?? '').replace(/ /g, ' '))) return fail(`подсказка 10-й клетки: «${title}»`);
      return pass(`66 клеток в строку, «${title}»`);
    },
  },
  {
    n: 98,
    title: 'F12: имена в тексте фактов — ссылки: «Прабабка царя Давида» у Руфи ведёт к Давиду',
    run: async (p) => {
      await find(p, 'Руфь');
      if (hashId(p) !== 'ruf') return fail(`выбрано «${hashId(p)}»`);
      const link = p.locator('.folio #sec-5 button.person[data-id="david"]');
      if (!(await link.count())) return fail('в § 5 Руфи «Давида» — не ссылка');
      await link.first().click();
      await p.waitForTimeout(1500);
      return hashId(p) === 'david' ? pass() : fail(`ссылка выбрала «${hashId(p)}»`);
    },
  },
  {
    n: 99,
    title: 'F7: § 14 — имя лица встречи в тексте («Помазан Самуилом»), § 15 — места по роли, § 16 — без повтора царствования',
    run: async (p) => {
      await open(p, 'david');
      const t14 = (await secText(p, 14)).replace(/\s+/g, ' ');
      if (!/Помазан Самуилом \(пророк и судья\); бежал к нему в Раму/.test(t14)) return fail(`§ 14: «${t14.slice(0, 80)}»`);
      if (/Самуил \(пророк и судья\) — помазан/.test(t14)) return fail('«Самуил — помазан Самуилом»');
      const t15 = (await secText(p, 15)).replace(/\s+/g, ' ');
      if (!/Места\s?Родился: Вифлеем \(см\. § 8\)/.test(t15) || !/Жил:/.test(t15)) return fail(`§ 15: «${t15.slice(0, 80)}»`);
      const t16 = (await secText(p, 16)).replace(/\s+/g, ' ');
      if (/Царь над домом Иудиным в Хевроне/.test(t16)) return fail('§ 16 повторяет царствование должностью');
      // «см. § 8» — переход к разделу
      await p.locator('.folio #sec-15 .see').first().click();
      await p.waitForTimeout(900);
      const top = (await p.locator('.folio #sec-8').boundingBox())!.y - (await p.locator('.folio').boundingBox())!.y;
      if (top < 0 || top > 60) return fail(`«см. § 8» привёл к § 8 на ${Math.round(top)} px`);
      return pass();
    },
  },
  {
    n: 100,
    title: 'Телефон 390 × 844: рейка — строка номеров под шапкой; касание номера — переход к разделу; пометы — цели от 24 px',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, 'david');
      await p.evaluate(`document.querySelector('.folio').style.setProperty('--sheet-h','100vh')`);
      await p.waitForTimeout(400);
      const rail = p.locator('.folio .rail');
      // этап 13, решение 119: строка под шапкой — название текущего раздела со списком и номера; вся строка — во всю ширину
      const row = (await p.locator('.folio .rail-row').count()) ? p.locator('.folio .rail-row') : rail;
      const rb = (await row.boundingBox())!;
      if (rb.height > 60 || rb.width < 300) return fail(`рейка ${Math.round(rb.width)}×${Math.round(rb.height)}`);
      const ten = rail.locator('button').nth(9);
      const tb = (await ten.boundingBox())!;
      if (tb.width < 24 || tb.height < 24) return fail(`номер 10 — цель ${tb.width}×${tb.height}`);
      await ten.tap();
      await p.waitForTimeout(900);
      const sec = (await p.locator('.folio #sec-10').boundingBox())!;
      const rail2 = (await rail.boundingBox())!;
      // заголовок § 10 — под строкой номеров, не под ней спрятан
      if (sec.y < rail2.y + rail2.height - 2 || sec.y - (rail2.y + rail2.height) > 80) return fail(`§ 10 после касания на ${Math.round(sec.y - rail2.y - rail2.height)} px от низа рейки`);
      const mark = (await p.locator('.folio .mark').first().boundingBox())!;
      if (mark.width < 24 || mark.height < 24) return fail(`помета — цель ${mark.width.toFixed(0)}×${mark.height.toFixed(0)}`);
      return pass(`рейка ${Math.round(rb.width)}×${Math.round(rb.height)}, цели ${tb.width}×${tb.height}`);
    },
  },
  {
    n: 101,
    title: 'Правда в словах карточки: Иосиф — плотник, законный отец; Есфирь — двоюродная сестра Мардохея; «Жена-Ефиоплянка» без «— жена»',
    run: async (p) => {
      await open(p, 'iosif-muzh-marii');
      const role = (await p.locator('.folio .passport dd').first().innerText()).trim();
      if (role !== 'плотник') return fail(`роль Иосифа: «${role}»`);
      const brief = (await p.locator('.folio .brief').innerText()).replace(/\s+/g, ' ');
      if (!/законный отец Иисуса Христа/.test(brief)) return fail(`«Кратко» Иосифа: «${brief}»`);
      await open(p, 'esfir');
      const t12 = (await secText(p, 12)).replace(/\s+/g, ' ');
      if (!/Приходится двоюродной сестрой Мардохею: дочь его дяди Абихаила/.test(t12)) return fail(`§ 12 Есфири: «${t12}»`);
      await open(p, 'moisey');
      const t9 = (await secText(p, 9)).replace(/\s+/g, ' ');
      if (/Жена-Ефиоплянка Моисея — жена/.test(t9)) return fail('«Жена-Ефиоплянка Моисея — жена»');
      return pass();
    },
  },
];
