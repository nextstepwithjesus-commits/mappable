/**
 * Сценарии приёмки ТЗ § 11.2 и проверки поведения интерфейса (docs/UI-PROMPT.md) — в браузере,
 * со снимком каждого сценария в docs/screens/accept-NN.png.
 * Каждый сценарий печатает «да» или «НЕТ» с причиной; код выхода 1, если хоть один не прошёл.
 *   npm run -s accept                — все сценарии (нужна сборка: npx vite build)
 *   npm run -s accept -- 5           — только пятый
 *   npx tsx tools/accept.ts --dist .ui-build/shell --port 4334 [--out <каталог снимков>] [N]
 *                                    — своя сборка и свой порт (параллельные агенты); снимки тогда
 *                                      по умолчанию в .ui-shots/accept/<имя сборки>, чтобы не затирать docs/screens
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v ?? null;
};
const DIST = opt('dist');
const PORT = Number(opt('port') ?? 4184);
const OUT = resolve(ROOT, opt('out') ?? (DIST ? join('.ui-shots/accept', basename(DIST)) : 'docs/screens'));
const only = argv[0] ? Number(argv[0]) : null;

import { pass, fail, find, hashId, folioText, secText, type Check, type Scenario } from './accept/kit.ts';
import { layout } from './accept/layout.ts';
import { nav } from './accept/nav.ts';
import { sky } from './accept/sky.ts';
import { card } from './accept/card.ts';
import { panels } from './accept/panels.ts';
import { map } from './accept/map.ts';

const BASE: Scenario[] = [
  {
    n: 1,
    title: 'Руфь → правнук Давид; небо перелетает к Давиду',
    run: async (p) => {
      await find(p, 'Руфь');
      if (hashId(p) !== 'ruf') return fail(`выбрано «${hashId(p)}», а не Руфь`);
      const link = p.locator('.folio #sec-10 p', { hasText: 'Правнук' }).locator('button.person', { hasText: 'Давид' });
      if (!(await link.count())) return fail('в § 10 нет правнука Давида');
      await link.first().click();
      await p.waitForTimeout(1600);
      return hashId(p) === 'david' ? pass() : fail(`после перехода выбрано «${hashId(p)}»`);
    },
  },
  {
    n: 2,
    title: 'Только линии Мессии: две ленты от Адама до Иисуса',
    run: async (p) => {
      await p.click('text=только линии Мессии');
      await p.waitForTimeout(1200);
      return pass('проверяется по снимку');
    },
  },
  {
    n: 3,
    title: 'Мелхиседек: § 6 «в Писании не сообщается» с Евр 7:3',
    run: async (p) => {
      await find(p, 'Мелхиседек');
      // строки «в Писании не сообщается» видны всегда (F4); вся схема — командой колофона
      await p.click('.folio .colophon >> text=Показать все 24 раздела');
      await p.waitForTimeout(400);
      const t = await folioText(p);
      if (!/6[^\n]*Родители[^\n]*в Писании не сообщается|Родители[\s\S]{0,300}Евр\s7:3/.test(t)) return fail('§ 6 не отмечен как «в Писании не сообщается» или нет Евр 7:3');
      return pass();
    },
  },
  {
    n: 4,
    title: 'Авиуд: расчётный интервал, «после Зоровавеля», нет в 1 Пар 3:19–20',
    run: async (p) => {
      // «Авиуд» — и сын Аарона (Исх 6:23), и сын Зоровавеля (Мф 1:13): выбрать второго в результатах поиска
      await p.click('#find');
      await p.fill('#find', 'Авиуд');
      await p.waitForTimeout(300);
      await p.locator('.results .result', { hasText: 'Зоровавел' }).first().click();
      await p.waitForTimeout(1500);
      const t = await secText(p, 13);
      if (!t) return fail('нет § 13');
      if (!/Зоровавел/.test(t)) return fail('в § 13 нет привязки к Зоровавелю');
      const all = await folioText(p);
      return /1\s?Пар\s3:19/.test(all) ? pass() : fail('нет примечания о 1 Пар 3:19–20');
    },
  },
  {
    n: 5,
    title: 'Родство «Иоав — Давид»: племянник, сын его сестры Саруии',
    run: async (p) => {
      await find(p, 'Иоав');
      await p.click('.commands >> text=Родство');
      await p.fill('.sheet .field input', 'Давид');
      await p.waitForTimeout(300);
      await p.locator('.sheet [role="option"]', { hasText: 'Давид' }).first().click();
      await p.waitForTimeout(600);
      const t = await p.locator('.sheet').innerText();
      return /племянник Давида/.test(t) && /Саруи/.test(t) ? pass() : fail('нет «племянник Давида … Саруии»');
    },
  },
  {
    n: 6,
    title: 'Истинный масштаб времени: выбранное лицо остаётся на месте',
    run: async (p) => {
      await find(p, 'Авраам');
      await p.click('text=истинный');
      await p.waitForTimeout(1200);
      return pass('проверяется по снимку');
    },
  },
  {
    n: 7,
    title: 'Полоса времени до 2040: «сегодня», «завершение канона», «Время Церкви»',
    run: async (p) => {
      const strip = p.locator('.strip canvas').first();
      const b = (await strip.boundingBox())!;
      await p.mouse.click(b.x + b.width - 30, b.y + b.height / 2);
      await p.waitForTimeout(1200);
      return pass('проверяется по снимку');
    },
  },
  {
    n: 8,
    title: 'Моисей: напряжение «Левий — Амрам — Моисей» при 430 годах',
    run: async (p) => {
      await find(p, 'Моисей');
      const t = await secText(p, 13);
      return /Амрам/.test(t) ? pass() : fail('в § 13 нет напряжения с Амрамом');
    },
  },
  {
    n: 9,
    title: 'Модель «краткое пребывание»: напряжение у Моисея исчезает',
    run: async (p) => {
      await find(p, 'Моисей');
      // модель выбирается в органах неба (C6); «О карте» только описывает модели
      await p.click('.skyctl .menu.model > button');
      await p.locator('.skyctl [role="menuitemradio"]', { hasText: 'Краткое пребывание' }).click();
      await p.waitForTimeout(1500);
      const t = await secText(p, 13);
      return /Амрам/.test(t) && /напряжени/i.test(t) ? fail('напряжение осталось') : pass();
    },
  },
  {
    n: 10,
    title: 'Карточка Давида только с клавиатуры',
    run: async (p) => {
      await p.locator('canvas').first().focus();
      await p.keyboard.press('Slash');
      await p.keyboard.type('Давид');
      await p.waitForTimeout(250);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      if (hashId(p) !== 'david') return fail(`выбрано «${hashId(p)}»`);
      for (let i = 0; i < 6; i++) await p.keyboard.press('Tab');
      const focused = await p.evaluate('document.activeElement && document.activeElement.closest(".folio") ? "folio" : (document.activeElement || {}).tagName');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      return focused === 'folio' ? pass() : fail(`фокус после Tab не в карточке, а на ${focused}`);
    },
  },
  {
    n: 11,
    title: 'Поиск «Иисус»: первым — Иисус Христос, Иисус Навин — в первой тройке',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'Иисус');
      await p.waitForTimeout(300);
      const names = (await p.locator('.results .result .nm').allInnerTexts()).map((t) => t.trim());
      if (names[0] !== 'Иисус Христос') return fail(`первым — «${names[0]}»`);
      return names.slice(0, 3).includes('Иисус Навин') ? pass() : fail(`первые три: ${names.slice(0, 3).join(', ')}`);
    },
  },
  {
    n: 12,
    title: 'Давид → «Родство с…» → поиск «Иоав»: первое лицо — Давид, второе — Иоав, открыто «Родство»',
    run: async (p) => {
      await find(p, 'Давид');
      await p.locator('.folio .actions button', { hasText: 'Родство с' }).click();
      await p.waitForTimeout(300);
      // строка набрана с неразрывными пробелами (B5): сравнивается текст
      const bar = (await p.locator('.sky .pickbar').count()) ? (await p.locator('.sky .pickbar').innerText()).replace(/\u00a0/g, ' ') : '';
      if (!/^Родство с Давидом: щёлкните второе лицо на небе или найдите его в поле «Найти»\. Esc — отмена/.test(bar)) return fail(`строка режима: «${bar}»`);
      await find(p, 'Иоав');
      if (hashId(p) !== 'david') return fail(`первым лицом стало «${hashId(p)}»`);
      if (await p.locator('.sky .pickbar').count()) return fail('режим выбора второго лица не снят');
      const sheet = p.locator('.sheet', { has: p.locator('h2', { hasText: 'Родство' }) });
      if (!(await sheet.count())) return fail('панель «Родство» не открыта');
      const t = await sheet.innerText();
      if (!/Иоав/.test(t) || !/Давид/.test(t)) return fail('в панели нет пары Давид — Иоав');
      const path = (await p.locator('.sky').getAttribute('data-kin-path')) ?? '';
      return path.startsWith('david ') && path.endsWith(' ioav') ? pass() : fail(`путь на небе: «${path}»`);
    },
  },
  {
    n: 13,
    title: 'Escape в поле поиска: подсказки, текст, фокус — карточка остаётся; следующий Escape закрывает её',
    run: async (p) => {
      await find(p, 'Давид');
      await p.click('#find');
      await p.keyboard.type('Руфь');
      await p.waitForTimeout(300);
      await p.keyboard.press('Escape');
      if (await p.locator('.results').count()) return fail('первый Escape не закрыл подсказки');
      if ((await p.inputValue('#find')) !== 'Руфь') return fail('первый Escape стёр текст');
      await p.keyboard.press('Escape');
      if ((await p.inputValue('#find')) !== '') return fail('второй Escape не очистил поле');
      await p.keyboard.press('Escape');
      const inField = await p.evaluate("document.activeElement && document.activeElement.id === 'find'");
      if (inField) return fail('третий Escape не снял фокус с поля');
      if (hashId(p) !== 'david' || !(await p.locator('.folio').isVisible())) return fail('Escape в поле закрыл карточку');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      return hashId(p) === '' ? pass() : fail('Escape вне поля не снял выбор');
    },
  },
  {
    n: 14,
    title: 'Узкая рамка полосы времени: протяжка за середину сдвигает окно, а не сжимает',
    run: async (p) => {
      const strip = p.locator('.strip');
      const box = (await p.locator('.strip canvas').boundingBox())!;
      // полоса линейна: от сотворения (−4174, астр. −4173) минус 10 лет до 2040
      const T0 = -4183, T1 = 2040, PAD = 14;
      const xOf = (t: number) => box.x + PAD + ((t - T0) / (T1 - T0)) * (box.width - PAD * 2);
      await p.mouse.click(xOf(-990), box.y + box.height / 2); // эпоха «Царство»
      // щелчок по эпохе — перелёт (D4), после паузы на двойной щелчок (D12): ждать конца перелёта
      await p.waitForTimeout(2000);
      const win = async () => ((await strip.getAttribute('data-window')) ?? '').split(' ').map(Number);
      const [a, b] = await win();
      const wPx = xOf(b) - xOf(a);
      if (!(wPx > 0 && wPx < 88)) return fail(`рамка не узкая: ${wPx.toFixed(0)} px`);
      const cx = (xOf(a) + xOf(b)) / 2;
      const y = box.y + box.height / 2;
      await p.mouse.move(cx, y);
      await p.mouse.down();
      for (let i = 1; i <= 10; i++) await p.mouse.move(cx + i * 10, y);
      await p.mouse.up();
      await p.waitForTimeout(300);
      const [a2, b2] = await win();
      const ratio = (b2 - a2) / (b - a);
      if (Math.abs(ratio - 1) > 0.01) return fail(`окно ${(b - a).toFixed(0)} → ${(b2 - a2).toFixed(0)} лет`);
      return a2 - a > 300 ? pass() : fail(`окно сдвинулось лишь на ${(a2 - a).toFixed(0)} лет`);
    },
  },
  {
    n: 15,
    title: 'Enter на пункте скрытого списка лиц неба выбирает лицо',
    run: async (p) => {
      const btn = p.locator('.sky ul.visually-hidden button').first();
      if (!(await btn.count())) return fail('скрытый список пуст');
      const name = (await btn.innerText()).trim();
      await btn.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(800);
      if (!hashId(p)) return fail(`Enter на «${name}» ничего не выбрал`);
      const title = (await p.locator('.folio [id^="title-"]').first().innerText()).trim();
      return title.startsWith(name) ? pass() : fail(`выбрано «${title}», а не «${name}»`);
    },
  },
  {
    n: 16,
    title: 'После «Родства» и выбора другого лица щелчком на небе прежняя цепочка не светится',
    run: async (p) => {
      await find(p, 'Иоав');
      await p.click('.commands >> text=Родство');
      await p.fill('.sheet .field input', 'Давид');
      await p.waitForTimeout(300);
      await p.locator('.sheet [role="option"]', { hasText: 'Давид' }).first().click();
      await p.waitForTimeout(500);
      const path = (await p.locator('.sky').getAttribute('data-kin-path')) ?? '';
      if (!path) return fail('путь родства Иоав — Давид не показан на небе');
      await p.click('.sheet .close');
      await p.waitForTimeout(500);
      const star = await hoverStar(p, (n) => !['Иоав', 'Давид', 'Саруия', 'Иессей'].includes(n));
      if (!star) return fail('не нашлось звезды для щелчка');
      await p.mouse.click(star.x, star.y);
      await p.waitForTimeout(500);
      if (['ioav', ''].includes(hashId(p))) return fail(`щелчок по «${star.name}» не выбрал лицо`);
      const after = await p.locator('.sky').getAttribute('data-kin-path');
      return after ? fail(`у «${star.name}» светится прежний путь: ${after}`) : pass();
    },
  },
  {
    n: 17,
    title: 'Только линии Мессии: скрытые лица не ловят указатель',
    run: async (p) => {
      await find(p, 'Давид');
      await p.click('text=только линии Мессии');
      await p.waitForTimeout(600);
      const onLines = lineNames();
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const seen = new Set<string>();
      for (let y = box.y + 40; y < box.y + box.height - 60; y += 11)
        for (let x = box.x + 30; x < box.x + box.width - 30; x += 37) {
          await p.mouse.move(x, y);
          const tip = p.locator('.sky .tip b');
          if (await tip.count()) seen.add((await tip.innerText()).trim());
        }
      const stray = [...seen].filter((n) => !onLines.has(n));
      if (!seen.size) return fail('ни одна звезда линий не отозвалась');
      return stray.length ? fail(`отзываются скрытые лица: ${stray.slice(0, 5).join(', ')}`) : pass(`отозвались ${seen.size} лиц линий`);
    },
  },
  {
    n: 18,
    title: 'Ярусы эпох (флажок органов неба): звёзды под ярусами не ловят указатель',
    run: async (p) => {
      await find(p, 'Давид');
      if (await p.locator('.sky[data-tiers]').count()) return fail('ярусы включены до флажка');
      await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
      await p.waitForTimeout(800);
      if (!(await p.locator('.skyctl input[type="checkbox"]').nth(1).isChecked())) return fail('флажок «ярусы эпох» не отмечен');
      if (!(await p.locator('.sky[data-tiers="on"]').count())) return fail('флажок не включил ярусы');
      const box = (await p.locator('.sky canvas').boundingBox())!;
      // панель слева (если открыта) закрывает часть неба: проверяется только видимая часть
      const sheet = (await p.locator('.sheet').count()) ? await p.locator('.sheet').boundingBox() : null;
      const left = Math.max(box.x + 30, sheet ? sheet.x + sheet.width + 10 : 0);
      // ярусы — от служебной строки рамки (40 px) до верха видимой части неба (data-view: l t r b …); пустые ярусы
      // свёрнуты (D14), поэтому их нижний край берётся из вида, а не из прежних «шести ярусов по 35 px»
      const bottom = Number(((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ')[1]);
      if (!(bottom > 100)) return fail(`ярусы не сдвинули верх неба: ${bottom}`);
      // отрезки ярусов отвечают сами (подсказка data-kind="tier"); звёзды под ними — нет
      for (let y = box.y + 40; y < box.y + bottom; y += 6)
        for (let x = left; x < box.x + box.width - 20; x += 23) {
          await p.mouse.move(x, y);
          const tip = p.locator('.sky .tip[data-kind="star"] b');
          if (await tip.count()) return fail(`под ярусами отозвалось «${(await tip.innerText()).trim()}»`);
        }
      return pass();
    },
  },
  {
    n: 19,
    title: 'Подсказка не остаётся от прежнего лица после сдвига и перелёта',
    run: async (p) => {
      await find(p, 'Давид');
      const tipNow = async () => ((await p.locator('.sky .tip b').count()) ? (await p.locator('.sky .tip b').innerText()).trim() : '');
      const star = await hoverStar(p, () => true);
      if (!star) return fail('не нашлось звезды');
      // сдвиг клавишами: указатель остаётся над небом, звезда уезжает из-под него
      await p.locator('.sky canvas').focus();
      for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowLeft');
      await p.waitForTimeout(60);
      if ((await tipNow()) === star.name) return fail(`после сдвига висит «${star.name}»`);
      // перелёт из поиска, набранного с клавиатуры: мышь так и стоит над небом
      const star2 = await hoverStar(p, () => true);
      if (!star2) return fail('не нашлось звезды после сдвига');
      await p.focus('#find');
      await p.keyboard.type('Авраам');
      await p.waitForTimeout(250);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1800);
      const t = await tipNow();
      return t === star2.name ? fail(`после перелёта висит «${t}»`) : pass(t ? `под указателем теперь «${t}»` : '');
    },
  },
  {
    n: 20,
    title: 'Верхняя строка на 1440, 1280, 1024, 768: все команды видны или в «Ещё», тема доступна, прокрутки нет; «Ещё» с клавиатуры',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const ALL = ['Указатель', 'Главы', 'Синопсис', 'Родство', 'Сквозной раздел', 'Условные знаки', 'О карте'];
      const notes: string[] = [];
      for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [1024, 768]]) {
        await p.setViewportSize({ width: w, height: h });
        await p.waitForTimeout(300);
        const row = (await p.evaluate(`(() => {
          const top = document.querySelector('.top'), nav = document.querySelector('.commands');
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= top.getBoundingClientRect().bottom + 0.5; };
          return {
            height: top.getBoundingClientRect().height,
            scroll: [top.scrollWidth - top.clientWidth, nav.scrollWidth - nav.clientWidth],
            shown: [...nav.querySelectorAll(':scope > button')].filter(vis).map((b) => b.textContent.trim()),
            more: nav.querySelector('.more > button') ? vis(nav.querySelector('.more > button')) : null,
            theme: [...document.querySelectorAll('.top > .seg button')].filter(vis).map((b) => b.textContent.trim()),
            doc: document.documentElement.scrollWidth - innerWidth,
          };
        })()`)) as { height: number; scroll: number[]; shown: string[]; more: boolean | null; theme: string[]; doc: number };
        if (Math.round(row.height) !== 48) return fail(`${w}: высота строки ${row.height} px, а не 48`);
        if (row.scroll.some((d) => d > 0) || row.doc > 0) return fail(`${w}: строка прокручивается вбок (${row.scroll.join(', ')})`);
        if (row.theme.join('|') !== 'Ночь|День') return fail(`${w}: переключатель темы не виден целиком: ${row.theme.join('|')}`);
        let inMore: string[] = [];
        if (row.more === false) return fail(`${w}: «Ещё» за краем`);
        if (row.more) {
          await p.locator('.commands .more > button').click();
          inMore = (await p.locator('.commands .more [role="menu"] [role^="menuitem"] .nm').allInnerTexts()).map((t) => t.trim());
          await p.keyboard.press('Escape');
        }
        const missing = ALL.filter((c) => !row.shown.includes(c) && !inMore.includes(c));
        if (missing.length) return fail(`${w}: нет команд ${missing.join(', ')}`);
        notes.push(`${w}: ${row.shown.length} в строке${inMore.length ? `, ${inMore.length} в «Ещё»` : ''}`);
      }
      // «Ещё» с клавиатуры (1024): Enter открывает, фокус на первом пункте, стрелка — следующий, Escape закрывает и возвращает фокус
      const more = p.locator('.commands .more > button');
      if (!(await more.count())) return fail('на 1024 нет «Ещё»');
      await more.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(100);
      const items = p.locator('.commands .more [role="menu"] [role^="menuitem"]');
      const n = await items.count();
      if (!n) return fail('Enter не открыл «Ещё»');
      const at = () => p.evaluate("[...document.querySelectorAll('.commands .more [role^=menuitem]')].indexOf(document.activeElement)");
      if ((await at()) !== 0) return fail('после открытия фокус не на первом пункте');
      await p.keyboard.press('ArrowDown');
      if ((await at()) !== (n > 1 ? 1 : 0)) return fail('стрелка вниз не перевела фокус');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(100);
      if (await items.count()) return fail('Escape не закрыл список');
      if (!(await p.evaluate("document.activeElement === document.querySelector('.commands .more > button')"))) return fail('после Escape фокус не вернулся на «Ещё»');
      // выбор пункта открывает панель; тема переключается сегментом
      await more.press('Space');
      await p.waitForTimeout(100);
      const label = (await items.first().locator('.nm').innerText()).trim();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      const h2 = (await p.locator('.sheet h2').count()) ? (await p.locator('.sheet h2').innerText()).trim() : '';
      if (!h2) return fail(`пункт «${label}» не открыл панель`);
      await p.locator('.top > .seg button', { hasText: 'День' }).click();
      const map = await p.evaluate('document.documentElement.dataset.map');
      if (map !== 'day') return fail('«День» не включил дневную карту');
      return pass(`${notes.join('; ')}; «${label}» → панель «${h2}»`);
    },
  },
  {
    n: 21,
    title: 'Модель «краткое пребывание» из органов неба (с клавиатуры): напряжение у Моисея исчезает',
    run: async (p) => {
      await find(p, 'Моисей');
      const before = await secText(p, 13);
      if (!/Амрам/.test(before)) return fail('в § 13 Моисея нет напряжения до смены модели');
      const btn = p.locator('.skyctl .menu.model > button');
      if (!(await btn.count())) return fail('в органах неба нет выбора модели');
      const was = (await btn.innerText()).trim();
      await btn.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(100);
      const items = p.locator('.skyctl [role="menu"] [role="menuitemradio"]');
      const names = (await items.locator('.nm').allInnerTexts()).map((t) => t.trim());
      if (names.length < 2) return fail(`в списке моделей ${names.length} пунктов`);
      if ((await items.locator('.note').count()) !== names.length) return fail('не у каждой модели есть пояснение');
      const checked = (await p.locator('.skyctl [role="menuitemradio"][aria-checked="true"] .nm').innerText()).trim();
      if (checked !== was) return fail(`отмечена «${checked}», на кнопке «${was}»`);
      const k = names.findIndex((x) => /Краткое пребывание/.test(x));
      if (k < 0) return fail('нет модели «Краткое пребывание»');
      const at = await p.evaluate("[...document.querySelectorAll('.skyctl [role=menuitemradio]')].indexOf(document.activeElement)");
      for (let i = at as number; i < k; i++) await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      if (await items.count()) return fail('список не закрылся после выбора');
      if (!(await p.evaluate("document.activeElement === document.querySelector('.skyctl .menu.model > button')"))) return fail('фокус не вернулся на кнопку модели');
      const now = (await btn.innerText()).trim();
      if (!/Краткое пребывание/.test(now)) return fail(`на кнопке «${now}»`);
      const t = await secText(p, 13);
      return /Амрам/.test(t) && /напряжени/i.test(t) ? fail('напряжение осталось') : pass();
    },
  },
  {
    n: 22,
    title: 'Телефон 390 × 844: колонка органов неба 44 × 44, «Вид» открывает лист; тема и все команды доступны',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      if (await p.locator('.skyctl:not(.column)').count()) return fail('на телефоне — блок органов, а не колонка');
      const col = p.locator('.skyctl.column button');
      const labels = (await col.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? (b.textContent ?? '').replace(/\s+/g, ' ').trim())));
      if (labels.join('|') !== 'Приблизить|Отдалить|Всё небо|Вид') return fail(`в колонке: ${labels.join(', ')}`);
      for (const b of await col.all()) {
        const r = (await b.boundingBox())!;
        if (r.width < 44 || r.height < 44) return fail(`кнопка ${r.width.toFixed(0)} × ${r.height.toFixed(0)}`);
      }
      const sky = (await p.locator('.sky').boundingBox())!;
      const last = (await col.last().boundingBox())!;
      if (last.x + last.width > sky.x + sky.width || last.y + last.height > sky.y + sky.height) return fail('колонка выходит за небо');
      // тема и команды: без прокрутки, всё видно или в «Ещё»
      const theme = (await p.locator('.top > .seg button').allInnerTexts()).map((t) => t.trim());
      if (theme.join('|') !== 'Ночь|День' || !(await p.locator('.top > .seg button').last().isVisible())) return fail('тема недоступна');
      const scroll = (await p.evaluate("(() => { const n = document.querySelector('.commands'); return n.scrollWidth - n.clientWidth; })()")) as number;
      if (scroll > 0) return fail('ряд команд прокручивается');
      // «Вид» — лист со слоями, масштабом и моделью
      await col.last().tap();
      await p.waitForTimeout(400);
      const sheet = p.locator('.sheet', { has: p.locator('h2', { hasText: 'Вид' }) });
      if (!(await sheet.count())) return fail('«Вид» не открыл лист');
      const text = await sheet.innerText();
      for (const w of ['только линии Мессии', 'ярусы эпох', 'по насыщенности', 'истинный', 'Хронология']) if (!text.includes(w)) return fail(`в листе нет «${w}»`);
      await sheet.getByText('ярусы эпох', { exact: true }).tap();
      await p.waitForTimeout(300);
      if (!(await p.locator('.sky[data-tiers="on"]').count())) return fail('флажок в листе не включил ярусы');
      await sheet.getByText('истинный', { exact: true }).tap();
      await p.waitForTimeout(200);
      if ((await sheet.locator('.seg button[aria-pressed="true"]').first().innerText()).trim() !== 'истинный') return fail('масштаб не переключился');
      // лист у нижнего края, небо над ним видно
      const sb = (await sheet.boundingBox())!;
      if (sb.y < sky.y + 120) return fail(`лист закрывает небо: верх листа ${sb.y.toFixed(0)}`);
      await sheet.locator('.close').tap();
      await p.waitForTimeout(300);
      if (await sheet.count()) return fail('«×» не закрыл лист');
      // планшет 768 × 1024 с карточкой: небо уже 520 px — та же колонка; без карточки — блок
      const tablet = await p.context().browser()!.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true });
      try {
        const q = await tablet.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        const kind = async (hash: string) => {
          await q.goto(p.url().replace(/#.*$/, hash));
          await q.waitForTimeout(1500);
          const w = (await q.locator('.sky').boundingBox())!.width;
          return { w, column: (await q.locator('.skyctl.column').count()) > 0 };
        };
        const withCard = await kind('#/david');
        if (!(withCard.w < 520 && withCard.column)) return fail(`планшет с карточкой: небо ${withCard.w.toFixed(0)} px, ${withCard.column ? 'колонка' : 'блок'}`);
        const bare = await kind('#/');
        if (bare.column) return fail(`планшет без карточки: небо ${bare.w.toFixed(0)} px, а органы — колонкой`);
        return pass(`планшет: с карточкой небо ${withCard.w.toFixed(0)} px — колонка, без карточки ${bare.w.toFixed(0)} px — блок`);
      } finally {
        await tablet.close();
      }
    },
  },
  {
    n: 23,
    title: 'Образец #/specimen при выбранном лице: открывается, без ошибок консоли, восемь строк таблицы кеглей, обе темы рядом (B7)',
    run: async (p) => {
      const errs: string[] = [];
      p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      await p.goto(p.url().replace(/#.*$/, '') + '#/david');
      await p.waitForTimeout(800);
      // переход по адресу при открытой карточке (прежде App сбрасывал выбор и возвращал «#/»)
      await p.evaluate(() => (location.hash = '#/specimen'));
      await p.waitForSelector('.spec-type tbody tr', { timeout: 5000 }).catch(() => null);
      await p.waitForTimeout(1500);
      if (!p.url().includes('#/specimen')) return fail(`адрес вернулся: ${p.url()}`);
      const rows = await p.locator('.spec-type tbody tr').count();
      if (errs.length) return fail(`ошибка консоли: ${errs[0]}`);
      if (rows !== 8) return fail(`строк в таблице кеглей: ${rows}`);
      const sky = (m: string) => p.locator(`.spec-map[data-map="${m}"]`).first().evaluate((el) => getComputedStyle(el).getPropertyValue('--sky').trim());
      const [n, d] = [await sky('night'), await sky('day')];
      return n && d && n !== d ? pass(`кеглей 8; небо ночью ${n}, днём ${d}`) : fail(`колонки тем без своих токенов: ${n} / ${d}`);
    },
  },
];
/** Сценарии этапа 3 — в своих файлах, чтобы параллельные агенты не правили один список (номера 30–49, 50–69, 70–89). */
const SCENARIOS: Scenario[] = [...BASE, ...layout, ...nav, ...sky, ...map, ...card, ...panels];

/** Имена лиц обеих линий Мессии — из собранного индекса. */
function lineNames(): Set<string> {
  const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as {
    persons: { id: string; n: string }[];
    lines: Record<string, { persons: { id: string }[] }>;
  };
  const ids = new Set(Object.values(atlas.lines).flatMap((l) => l.persons.map((x) => x.id)));
  return new Set(atlas.persons.filter((x) => ids.has(x.id)).map((x) => x.n));
}

/** Навести указатель на звезду, подходящую по имени: спираль от середины неба, пока не появится подсказка. */
async function hoverStar(p: Page, ok: (name: string) => boolean): Promise<{ x: number; y: number; name: string } | null> {
  const box = (await p.locator('.sky canvas').boundingBox())!;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.55;
  for (let r = 0; r < 360; r += 9)
    for (let k = 0; k < 16; k++) {
      const x = cx + r * Math.cos((k / 16) * Math.PI * 2);
      const y = cy + r * Math.sin((k / 16) * Math.PI * 2);
      if (y < box.y + 60 || y > box.y + box.height - 60 || x < box.x + 40 || x > box.x + box.width - 40) continue;
      await p.mouse.move(x, y);
      await p.waitForTimeout(10);
      const tip = p.locator('.sky .tip b');
      if (await tip.count()) {
        const name = (await tip.innerText()).trim();
        if (ok(name)) return { x, y, name };
      }
    }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const args = ['vite', 'preview', '--port', String(PORT), '--strictPort'];
  if (DIST) args.push('--outDir', DIST);
  const server = spawn('npx', args, { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  let failed = 0;
  try {
    for (const s of SCENARIOS) {
      if (only && s.n !== only) continue;
      const v = s.view ?? { width: 1440, height: 900 };
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: 'dark', isMobile: !!v.touch, hasTouch: !!v.touch, deviceScaleFactor: v.touch ? 2 : 1 });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript("localStorage.setItem('toledot:intro', 'true')");
      await page.goto(`http://localhost:${PORT}/`);
      await page.waitForTimeout(1500);
      let res: Check;
      try {
        res = await s.run(page);
      } catch (e) {
        res = fail(String((e as Error).message).split('\n')[0]);
      }
      if (errors.length) res = fail(`ошибка страницы: ${errors[0]}`);
      await page.screenshot({ path: join(OUT, `accept-${String(s.n).padStart(2, '0')}.png`) });
      console.log(`${res.ok ? 'да ' : 'НЕТ'} ${s.n}. ${s.title}${res.why ? ` — ${res.why}` : ''}`);
      if (!res.ok) failed++;
      await ctx.close();
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid!); } catch { /* уже остановлен */ }
  }
  console.log(failed ? `\nНе прошло сценариев: ${failed}` : '\nВсе сценарии пройдены.');
  process.exitCode = failed ? 1 : 0;
}
main();
