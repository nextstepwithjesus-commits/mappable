/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа cardshell (K2): оболочка карточки —
 * первый экран (VIS-41, CARD-54), закреплённые карточки — вкладки (этап 12, решение 91; прежде — стопка, решение 18;
 * CARD-52, IX-52, UX-49), свёрнутая карточка —
 * корешок (VIS-44, UX-50), закреплённая полоса (CARD-53, UX-67), рейка (VIS-42, CARD-70), полоса 66 книг (CARD-49),
 * «Добавить в набор» (VIS-47, CARD-75, UX-48; этап 11 — прежде «Взять в работу»), фокус заголовков (VIS-45, VIS-56, CARD-74), лист телефона (MOB-50, MOB-64),
 * живые «Загрузка» и «Ошибка» образца (VIS-55). Номера 230–239.
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };
const go = async (p: Page, hash: string, ms = 2000) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Имена лиц сценариев для поиска. */
const NAMES: Record<string, string> = { david: 'Давид', avraam: 'Авраам', ruf: 'Руфь', moisey: 'Моисей', mariya: 'Мария', solomon: 'Соломон' };
/**
 * Открыть карточку лица так, как её открывает читатель, — поиском («/», имя, Enter); вкладки живут в памяти браузера.
 * Не сменой адреса: адрес — запись истории, а «назад» и адрес не меняют вкладок (решения 50, 91; UX-74).
 * Поиск выбрал не то лицо — сценарий падает с причиной.
 */
const hop = async (p: Page, id: string, ms = 1300) => {
  await p.click('#find');
  await p.fill('#find', NAMES[id] ?? id);
  await p.waitForTimeout(350);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(ms);
  if (hashId(p) !== id) throw new Error(`поиск «${NAMES[id] ?? id}» выбрал «${hashId(p)}», а не ${id}`);
};
/**
 * Верх первого блока сведений карточки и нижний край видимой части листа (над полосой времени). Этап 20 (решение 195):
 * под шапкой — «Родство» (прежде оно было в карточке у звезды); первый экран — шапка и «Родство», а § 1 у большой семьи
 * (Давид) уходит ниже. Без «Родства» (Мелхиседек) первый блок — по-прежнему § 1.
 */
const firstSection = (p: Page) =>
  p.evaluate(() => {
    const s = (document.querySelector('.folio .kin-col') ?? document.querySelector('.folio-body .sec')) as HTMLElement | null;
    const f = document.querySelector('.folio') as HTMLElement;
    const strip = document.querySelector('.strip') as HTMLElement | null;
    const bottom = Math.min(f.getBoundingClientRect().bottom, strip ? strip.getBoundingClientRect().top : innerHeight);
    return { top: s ? Math.round(s.getBoundingClientRect().top) : null, n: s?.dataset.n ?? (s ? 'Родство' : null), bottom: Math.round(bottom) };
  });
/** Команды шапки: подписи без «▾» и их верхние края. */
/**
 * Этап 20 (решение 194): команды неба («К звезде», «Ближайшая родня», «Предки и потомки ▾») — своей строкой выше; этап 21
 * (решение 197): строка «Шаги карты» (.map-cmds) — своей строкой ниже них.
 */
const commands = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.folio .actions:not(.sky-cmds):not(.map-cmds) > button, .folio .actions:not(.sky-cmds):not(.map-cmds) > .workbtn > button')].map((b) => ({
      t: b.innerText.replace(/[▾▴]/g, '').replace(/\s+/g, ' ').trim(),
      y: Math.round(b.getBoundingClientRect().top),
    })),
  );
const rect = (p: Page, sel: string) => p.locator(sel).first().boundingBox();

export const cardshell: Scenario[] = [
  {
    n: 230,
    title: 'VIS-41 (пересмотры — решения 97, 195), CARD-54, 1440 × 900: «Родство» (у лица без родни — § 1) на первом экране; команды неба — строкой «К звезде» (решение 156), «Ближайшая родня», «Предки и потомки ▾»; ниже одной строкой «Родство с…», «Разворот с…», «Добавить в набор ▾»; «Эпоха» паспорта видна; легенды лент в шапке нет',
    run: async (p) => {
      const tops: string[] = [];
      for (const id of ['david', 'melkhisedek', 'avraam', 'esfir']) {
        await go(p, `#/${id}`);
        const s = await firstSection(p);
        // этап 13, решение 97 пересматривает VIS-41: паспорт — три строки времени и видимая эпоха, под шапкой — строка
        // «Разделы карточки» (решение 119); смысл прежний — § 1 на первом экране: заголовок целиком над полосой времени
        if (s.top === null || s.top + 24 > s.bottom) return fail(`${id}: § ${s.n} на ${s.top} px, край листа ${s.bottom}`);
        tops.push(`${id} ${s.top}`);
      }
      const cmds = await commands(p);
      const names = cmds.map((c) => c.t).join(' | ');
      if (names !== 'Родство с… | Разворот с… | Добавить в набор') return fail(`команды: ${names}`);
      const sky = (await p.locator('.folio .actions.sky-cmds > button, .folio .actions.sky-cmds .menu > button').allInnerTexts()).map((t) => t.replace(/[▾▴]/g, '').trim()).join(' | ');
      if (!/^К звезде \| Ближайшая родня \| Предки и потомки/.test(sky)) return fail(`команды неба: ${sky}`);
      if (new Set(cmds.map((c) => c.y)).size !== 1) return fail(`команды в ${new Set(cmds.map((c) => c.y)).size} строки`);
      // этап 13, решение 97: строка «Эпоха» паспорта — видимая (прежде VIS-41: только для диктора)
      const visibleEpoch = await p.evaluate(() => [...document.querySelectorAll('.folio .passport dt')].some((d) => d.textContent === 'Эпоха' && (d as HTMLElement).getBoundingClientRect().width > 2));
      if (!visibleEpoch) return fail('в паспорте не видна строка «Эпоха»');
      if (await p.locator('.folio .mast .lines').count()) return fail('в шапке строка-легенда лент');
      // «Скрыть потомков на небе» — пункт выбора «Добавить в набор», а не команда шапки (решение 26)
      if (await p.locator('.folio .actions > button', { hasText: /потомков/ }).count()) return fail('«потомков» — командой шапки');
      return pass(tops.join(', '));
    },
  },
  {
    n: 231,
    title: 'VIS-41 (пересмотры — решения 97, 195) на ноутбуке: 1280 × 800 и 1024 × 768 — «Родство» (у лица без родни — § 1) видно над полосой времени, команды сравнения — одной строкой',
    view: { width: 1280, height: 800 },
    run: async (p) => {
      const out: string[] = [];
      for (const id of ['david', 'melkhisedek', 'avraam']) {
        await go(p, `#/${id}`);
        const s = await firstSection(p);
        // этап 13, решение 97 (пересмотр VIS-41): § 1 — на первом экране, заголовок целиком над полосой времени
        if (s.top === null || s.top + 24 > s.bottom) return fail(`1280: ${id} — § ${s.n} на ${s.top} px, край листа ${s.bottom}`);
        out.push(`${id} ${s.top}`);
      }
      const cmds = await commands(p);
      if (new Set(cmds.map((c) => c.y)).size !== 1) return fail('1280: команды не в одну строку');
      await p.setViewportSize({ width: 1024, height: 768 });
      for (const id of ['david', 'melkhisedek', 'avraam']) {
        await go(p, `#/${id}`);
        const s = await firstSection(p);
        // заголовок § 1 целиком над полосой времени
        if (s.top === null || s.top + 24 > s.bottom) return fail(`1024: ${id} — § ${s.n} на ${s.top} px, край листа ${s.bottom}`);
        out.push(`1024 ${id} ${s.top}`);
      }
      return pass(out.join(', '));
    },
  },
  {
    n: 232,
    // этап 12, решение 91: стопки «Ещё открыты (N)» нет — прежняя проверка стопки (решение 18) переведена на вкладки с тем
    // же смыслом: открытые карточки не теряются (закреплённые — вкладками), «×» закрывает одну, Escape не чистит вкладки,
    // первый раздел — на первом экране
    title: 'Решение 91 (прежде 18, CARD-52, IX-52): выбор заменяет карточку — стопки нет; закреплённая — вкладкой вверху листа; «×» карточки закрывает её, вкладки остаются; Escape сворачивает раскрытую закреплённую, фокус на её вкладке; «Открепить карточку персонажа»',
    run: async (p) => {
      await go(p, '#/david', 1800);
      const pin = p.locator('.folio .folio-bar .pin-card');
      if ((await pin.getAttribute('aria-label')) !== 'Закрепить карточку персонажа') return fail(`команда закрепления: «${await pin.getAttribute('aria-label')}»`);
      await pin.click();
      await p.waitForTimeout(300);
      if ((await pin.getAttribute('aria-label')) !== 'Открепить карточку персонажа') return fail('после закрепления команда не сменилась на «Открепить…»');
      for (const id of ['avraam', 'ruf', 'moisey', 'mariya']) await hop(p, id);
      if (await p.locator('.folio .stack-sum, .folio .stack').count()) return fail('стопка осталась');
      if (/Ещё открыт/.test(await p.locator('.folio').innerText())) return fail('строка «Ещё открыты» осталась');
      const tabs = async () => (await p.locator('.folio .card-tabs .card-tab').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.id}${e.hasAttribute('data-open') ? '*' : ''}`))).join(' ');
      if ((await tabs()) !== 'david') return fail(`вкладки: ${await tabs()}`);
      const close = await p.locator('.folio .card-tab[data-id="david"] .close').getAttribute('aria-label');
      if (!/^Закрыть вкладку: Давид/.test(close ?? '')) return fail(`«×» вкладки: «${close}»`);
      const s = await firstSection(p);
      // этап 13, решение 97 (пересмотр VIS-41): § 1 — на первом экране и при вкладке
      if (s.top === null || s.top + 24 > s.bottom) return fail(`при вкладке § 1 на ${s.top} px, край листа ${s.bottom}`);
      // «×» карточки — карточка закрыта, прежняя из стопки не открывается; вкладка остаётся (корешок справа)
      await p.locator('.folio .folio-bar .bar-cmds .close').click();
      await p.waitForTimeout(900);
      if (hashId(p)) return fail(`после «×» выбрано «${hashId(p)}»`);
      if ((await p.locator('.folio.spine.tabs-only .spine-tabs li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))).join(' ') !== 'david') return fail('после «×» нет вкладки на корешке');
      // вкладка раскрывает карточку
      await p.locator('.folio.spine .spine-tabs [data-id="david"] .tab-open').click();
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'david' || (await tabs()) !== 'david*') return fail(`после вкладки: ${hashId(p)}; ${await tabs()}`);
      // Escape — раскрытая закреплённая сворачивается во вкладку, фокус на ней; Enter раскрывает снова
      await p.locator('#title-david').focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(700);
      if (hashId(p)) return fail('Escape не свернул карточку');
      const f = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.closest('[data-id]')?.getAttribute('data-id') ?? document.activeElement?.className ?? '');
      if (f !== 'david') return fail(`фокус после Escape — на «${f}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'david') return fail('Enter на вкладке не раскрыл карточку');
      // «Открепить…» — вкладки нет, карточка остаётся текущей
      await p.locator('.folio .folio-bar .pin-card').click();
      await p.waitForTimeout(300);
      if (await p.locator('.folio .card-tabs').count()) return fail('после «Открепить…» вкладка осталась');
      if (hashId(p) !== 'david') return fail('«Открепить…» закрыл карточку');
      const store = await p.evaluate(() => localStorage.getItem('toledot:tabs'));
      return store ? fail(`память браузера после открепления: ${store}`) : pass('Давид: вкладка, «×», корешок, Escape → вкладка, Enter, «Открепить…»');
    },
  },
  {
    n: 233,
    // этап 12, решение 91: на корешке — вкладки закреплённых карточек (прежде — имена стопки)
    title: 'VIS-44, UX-50, решение 91: «Свернуть карточку» — корешок 56 px, небо шире на ширину листа; на корешке — вкладки закреплённых карточек; «развернуть» возвращает лист и фокус на заголовок',
    run: async (p) => {
      await go(p, '#/ruf', 1600);
      await p.locator('.folio .folio-bar .pin-card').click();
      await p.waitForTimeout(300);
      await hop(p, 'david', 1600);
      const sky0 = (await rect(p, '.sky'))!.width;
      const f0 = (await rect(p, '.folio'))!.width;
      const fold = p.locator('.folio .folio-bar .fold-card');
      if ((await fold.innerText()).trim() !== 'Свернуть карточку') return fail(`команда: «${await fold.innerText()}»`);
      await fold.click();
      await p.waitForTimeout(900);
      const spine = p.locator('.folio.spine');
      if (!(await spine.count())) return fail('нет корешка');
      const w = (await rect(p, '.folio.spine'))!.width;
      const sky1 = (await rect(p, '.sky'))!.width;
      if (Math.abs(w - 56) > 1) return fail(`корешок ${w} px`);
      if (sky1 < sky0 + f0 - 60) return fail(`небо ${sky0} → ${sky1} при листе ${f0}`);
      const others = (await spine.locator('.sp-open .nm').allInnerTexts()).map((t) => t.trim());
      if (others.join(' ') !== 'Руфь') return fail(`на корешке: ${others.join(', ')}`);
      const focus = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');
      if (!/unfold/.test(focus)) return fail(`фокус после «Свернуть карточку» — на «${focus}»`);
      await spine.locator('.unfold').click();
      await p.waitForTimeout(900);
      if (await p.locator('.folio.spine').count()) return fail('«развернуть» не развернул');
      const t = await p.evaluate(() => document.activeElement?.id ?? '');
      if (t !== 'title-david') return fail(`фокус после «развернуть» — на «${t}»`);
      // вкладка на корешке открывает её карточку развёрнутой
      await p.locator('.folio .folio-bar .fold-card').click();
      await p.waitForTimeout(700);
      await p.locator('.folio.spine .sp-open', { hasText: 'Руфь' }).click();
      await p.waitForTimeout(900);
      return hashId(p) === 'ruf' && !(await p.locator('.folio.spine').count()) ? pass(`небо ${sky0} → ${sky1} px`) : fail(`с корешка выбрано «${hashId(p)}»`);
    },
  },
  {
    n: 234,
    title: 'CARD-53, UX-67: прокрученный лист — полоса «Свернуть карточку ×» на всю ширину с фоном и чертой, текст под ней не виден; переход по рейке ставит заголовок раздела ниже полосы',
    run: async (p) => {
      await go(p, '#/david');
      const bar0 = await p.evaluate(() => getComputedStyle(document.querySelector('.folio-bar')!).backgroundColor);
      for (const y of [259, 407]) {
        await p.evaluate((yy) => document.querySelector('.folio')!.scrollTo({ top: yy }), y);
        await p.waitForTimeout(250);
        const r = await p.evaluate(() => {
          const bar = document.querySelector('.folio-bar') as HTMLElement;
          const b = bar.getBoundingClientRect();
          const f = (document.querySelector('.folio') as HTMLElement).getBoundingClientRect();
          const cs = getComputedStyle(bar);
          // над кнопками полосы — сами кнопки, а не текст карточки
          const pts = [...bar.querySelectorAll<HTMLElement>('.bar-cmds > *')].map((el) => {
            const q = el.getBoundingClientRect();
            const top = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
            return !!top && el.contains(top);
          });
          return { bg: cs.backgroundColor, full: Math.abs(b.width - f.width) < 16, onTop: pts.every(Boolean), scrolled: (document.querySelector('.folio') as HTMLElement).hasAttribute('data-scrolled') };
        });
        if (!r.scrolled || /rgba\(0, 0, 0, 0\)|transparent/.test(r.bg)) return fail(`прокрутка ${y}: полоса без фона (${r.bg})`);
        if (!r.full) return fail('полоса не на всю ширину листа');
        if (!r.onTop) return fail(`прокрутка ${y}: команды полосы закрыты текстом`);
      }
      await go(p, '#/ruf');
      const barBottom = async () => (await rect(p, '.folio-bar'))!.y + (await rect(p, '.folio-bar'))!.height;
      for (const n of [16, 20]) {
        await p.locator('.folio .rail button').nth(n - 1).click();
        await p.waitForTimeout(900);
        const h = await rect(p, `.folio #sec-${n}`);
        if (!h) continue;
        if (h.y < (await barBottom()) - 1) return fail(`§ ${n} ушёл под полосу: ${h.y} < ${await barBottom()}`);
      }
      return pass(`в покое полоса ${bar0}`);
    },
  },
  {
    n: 235,
    title: 'VIS-42, CARD-70, 1280: рейка у края листа, номера — своей колонкой и не налезают на неё, диапазон в две строки; «не относится» — квадрат, текущий раздел — метка в кольце',
    view: { width: 1280, height: 800 },
    run: async (p) => {
      await go(p, '#/khettura');
      await p.locator('.folio .colophon button', { hasText: 'Показать все 24 раздела' }).click();
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const f = (document.querySelector('.folio') as HTMLElement).getBoundingClientRect();
        const rail = (document.querySelector('.folio .rail') as HTMLElement).getBoundingClientRect();
        const nos = [...document.querySelectorAll<HTMLElement>('.folio .sec .no')].map((n) => n.getBoundingClientRect());
        // диапазон «3–5» рисуется в две строки псевдоэлементом строки раздела (folio.css, div.sec[data-to]::before)
        const range = document.querySelector<HTMLElement>('.folio div.sec[data-to]');
        const pseudo = range ? getComputedStyle(range, '::before') : null;
        const lines = pseudo && /\\a|\n/i.test(pseudo.content) && pseudo.whiteSpace === 'pre' && getComputedStyle(range!.querySelector('.no')!).color === 'rgba(0, 0, 0, 0)' ? [0, 1] : [];
        return { railL: rail.left - f.left, railR: rail.right, minNo: Math.min(...nos.map((n) => n.left)), lines, content: pseudo?.content ?? '' };
      });
      // рейка у края листа, но за ручкой границы «небо | карточка», которая заходит в лист на 12 px (VIS-66, сценарий 422)
      if (r.railL < 12 || r.railL > 16) return fail(`рейка в ${r.railL} px от края листа`);
      if (r.minNo < r.railR + 4) return fail(`номер разделов налезает на рейку: ${r.minNo} < ${r.railR}`);
      if (r.lines.length !== 2) return fail(`диапазон сведённых разделов не в две строки: ${r.content}`);
      await go(p, '#/moisey');
      const marks = await p.evaluate(() => {
        const na = document.querySelector('.folio .rail button.na .dot') as HTMLElement | null;
        const cur = document.querySelector('.folio .rail button.current .dot') as HTMLElement | null;
        const after = document.querySelector('.folio .rail button.current') ? getComputedStyle(document.querySelector('.folio .rail button.current')!, '::after').content : 'none';
        return {
          na: na ? { w: na.getBoundingClientRect().width, h: na.getBoundingClientRect().height, radius: getComputedStyle(na).borderRadius } : null,
          cur: cur ? { w: cur.getBoundingClientRect().width, ring: getComputedStyle(cur).outlineStyle } : null,
          after,
        };
      });
      if (!marks.na || marks.na.radius !== '0px' || Math.abs(marks.na.w - marks.na.h) > 0.5) return fail(`«не относится»: ${JSON.stringify(marks.na)}`);
      if (!marks.cur || marks.cur.w < 8.5 || marks.cur.ring === 'none') return fail(`текущий: ${JSON.stringify(marks.cur)}`);
      if (marks.after && marks.after !== 'none' && marks.after !== 'normal') return fail('у текущей метки осталась черта');
      return pass(`рейка ${r.railL} px от края, номера с ${Math.round(r.minNo - r.railR)} px за ней`);
    },
  },
  {
    n: 236,
    title: 'CARD-49, VIS-43: у Давида в § 23 светлее фона не меньше 25 клеток, Пс — не пустая клетка; VIS-55: образец показывает «Загрузку» и «Ошибку» живыми листами',
    run: async (p) => {
      await go(p, '#/david');
      const cells = await p.evaluate(() => {
        const all = [...document.querySelectorAll<HTMLElement>('.folio .canon .cg > span')];
        const empty = all.find((e) => e.className === 'l0');
        const base = empty ? getComputedStyle(empty).backgroundColor : '';
        const ps = all.find((e) => /^Пс/.test(e.title));
        return { n: all.length, lit: all.filter((e) => getComputedStyle(e).backgroundColor !== base).length, ps: ps ? getComputedStyle(ps).backgroundColor !== base : false };
      });
      if (cells.n !== 66) return fail(`клеток ${cells.n}`);
      if (cells.lit < 25) return fail(`светлее фона ${cells.lit} клеток`);
      if (!cells.ps) return fail('Пс выглядит как книга без упоминаний');
      await go(p, '#/specimen', 2500);
      const states = await p.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.spec-cardstate')].map((f) => ({
          cap: f.querySelector('figcaption')?.textContent ?? '',
          wait: !!f.querySelector('.folio .load-wait'),
          err: !!f.querySelector('.folio .load-error button'),
        })),
      );
      const load = states.find((s) => s.cap === 'Загрузка');
      const err = states.find((s) => s.cap === 'Ошибка');
      if (!load?.wait) return fail('в образце нет живого листа «Загрузка карточки…»');
      if (!err?.err) return fail('в образце нет живого листа с «Повторить»');
      if (await p.locator('.spec-dl', { hasText: 'Такого состояния в интерфейсе нет' }).count()) return fail('образец по-прежнему говорит, что ошибки нет');
      return pass(`клеток светлее фона: ${cells.lit}`);
    },
  },
  {
    n: 237,
    title: 'VIS-47, UX-48, CARD-75: «Добавить в набор ▾» — лист во всю колонку, поколения столбцами, «Скрыть потомков на небе»; верхняя строка — «Набор: N»; в панели видно, почему лицо в наборе',
    run: async (p) => {
      await go(p, '#/ruf');
      const btn = p.locator('.folio .workbtn > button');
      if (!/^Добавить в набор\s*▾$/.test((await btn.innerText()).trim())) return fail(`команда: «${await btn.innerText()}»`);
      await btn.click();
      await p.waitForTimeout(300);
      const pick = await p.evaluate(() => {
        const w = document.querySelector('.folio .workpick') as HTMLElement;
        const col = (document.querySelector('.folio .brief') ?? document.querySelector('.folio .mast')) as HTMLElement;
        const rows = [...w.querySelectorAll('.wp-gens')].map((r) => [...r.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().left)));
        const take = [...w.querySelectorAll<HTMLElement>('.wp-take .cmd')].map((b) => ({ t: b.innerText.trim(), border: getComputedStyle(b).borderTopWidth }));
        return { w: w.getBoundingClientRect().width, col: col.getBoundingClientRect().width, rows, take, fold: [...w.querySelectorAll('button')].some((b) => b.textContent === 'Скрыть потомков на небе') };
      });
      if (pick.w < pick.col - 2) return fail(`лист выбора ${pick.w} px уже колонки ${pick.col}`);
      if (pick.rows.length !== 2 || pick.rows[0].join() !== pick.rows[1].join()) return fail(`числа поколений не столбцами: ${JSON.stringify(pick.rows)}`);
      if (pick.take[0]?.t !== 'Только Руфи' || pick.take.some((t) => t.border === '0px')) return fail(`команды выбора: ${JSON.stringify(pick.take)}`);
      if (!pick.fold) return fail('в выборе нет «Скрыть потомков на небе»');
      await p.locator('.workpick .wp-take button', { hasText: 'С семьёй' }).click();
      await p.waitForTimeout(400);
      const n = ((await p.evaluate(`JSON.parse(localStorage.getItem('toledot:work') || '[]').length`)) as number) || 0;
      const top = p.locator('.top .commands > button', { hasText: 'Набор' });
      const label = (await top.innerText()).trim();
      if (label !== `Набор: ${n}`) return fail(`верхняя строка: «${label}», в наборе ${n}`);
      if (!/^В наборе/.test((await btn.innerText()).trim())) return fail(`команда карточки: «${await btn.innerText()}»`);
      // «Скрыть потомков на небе» из того же выбора
      await btn.click();
      await p.waitForTimeout(250);
      await p.locator('.workpick button', { hasText: 'Скрыть потомков на небе' }).click();
      await p.waitForTimeout(600);
      const folds = await p.evaluate(`JSON.parse(sessionStorage.getItem('toledot:folds') || '{}').desc || []`);
      if (!(folds as string[]).includes('ruf')) return fail(`потомки не скрыты: ${JSON.stringify(folds)}`);
      await top.click();
      await p.waitForTimeout(700);
      // почему лицо в наборе (CARD-75) — один раз, заголовком группы (VIS-83): «Руфь и её семья (N)», Руфь — первой строкой
      // группы, под строками членов семьи «семья Руфи» не повторяется
      const heads = (await p.locator('.worklist .wg-head').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      if (heads.length !== 1 || heads[0] !== `Руфь и её семья (${n})`) return fail(`заголовки групп: ${heads.join(', ')}; в наборе ${n}`);
      const vias = (await p.locator('.worklist .wi-via').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      if (vias.some((t) => /Руфи/.test(t))) return fail(`«семья Руфи» под строками: ${vias.join(', ')}`);
      const first = await p.locator('.worklist .wg-list > li').first().getAttribute('data-id');
      return first === 'ruf' ? pass(`${label}; «${heads[0]}»`) : fail(`первой в группе — «${first}»`);
    },
  },
  {
    n: 238,
    title: 'VIS-45, CARD-74, VIS-56: заголовок панели и карточки в фокусе — черта по ширине текста, без рамки; «×» панели вне черты',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await go(p, '#/~pindex', 1500);
      await go(p, '#/~pabout', 1500);
      const r = await p.evaluate(() => {
        const h = document.activeElement as HTMLElement;
        const sheet = h.closest('.sheet') as HTMLElement;
        const x = sheet.querySelector('.sheet-head .close') as HTMLElement;
        const cs = getComputedStyle(h);
        const hr = h.getBoundingClientRect();
        const xr = x.getBoundingClientRect();
        return { tag: h.tagName, outline: cs.outlineStyle, shadow: cs.boxShadow, hw: hr.width, sw: sheet.getBoundingClientRect().width, clash: hr.right > xr.left && hr.left < xr.right && hr.bottom > xr.top && hr.top < xr.bottom };
      });
      if (r.tag !== 'H2') return fail(`фокус на ${r.tag}`);
      if (r.outline !== 'none' || r.shadow === 'none') return fail(`заголовок панели: outline ${r.outline}, черта ${r.shadow}`);
      if (r.hw > r.sw * 0.6) return fail(`черта во всю панель: ${r.hw} из ${r.sw}`);
      if (r.clash) return fail('«×» лежит на заголовке');
      // заголовок карточки получает фокус с клавиатуры (выбор в поиске клавишей Enter, Enter на небе): черта под именем
      await p.locator('.sheet .sheet-head .close').first().click();
      await p.waitForTimeout(400);
      await go(p, '#/melkhisedek', 1800);
      if (await p.locator('.folio.spine').count()) return fail('карточка — корешок: панель не закрылась');
      await p.keyboard.press('Shift');
      await p.evaluate(() => document.getElementById('title-melkhisedek')?.focus());
      await p.waitForTimeout(200);
      const t = await p.evaluate(() => {
        const h = document.activeElement as HTMLElement;
        const nm = h.querySelector('.nm') as HTMLElement | null;
        return { id: h.id, col: h.getBoundingClientRect().width, nm: nm ? nm.getBoundingClientRect().width : 0, shadow: nm ? getComputedStyle(nm).boxShadow : 'none' };
      });
      if (t.id !== 'title-melkhisedek') return fail(`фокус после поиска на «${t.id}»`);
      if (t.shadow === 'none' || t.nm > t.col * 0.8) return fail(`черта под именем: ${t.nm} из ${t.col}, ${t.shadow}`);
      return pass(`черта ${Math.round(r.hw)} из ${Math.round(r.sw)} px; под именем ${Math.round(t.nm)} из ${Math.round(t.col)} px`);
    },
  },
  {
    n: 239,
    // этап 11 (STAGE11 § 6, решение 77): нижнее положение листа — не шапка 104 px, а карточка у звезды 214 px; требования те же:
    // имя, годы и уточнение — целыми строками внутри листа, текст подробной карточки под ним не виден, Tab в тело — 55 %
    title: 'MOB-64, MOB-50, MOB-52, 390 × 844: лист на нижнем положении (карточка у звезды; решение 155 — её высотой) — имя, годы и уточнение целыми строками; Tab в тело свёрнутого листа поднимает его на 55 %; «расч.» паспорта не ложится на годы',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david', 2400);
      // к нижнему положению — «Свернуть» шапки листа (на 214 px у листа уже нет «Свернуть»: это карточка у звезды)
      for (let k = 0; k < 3; k++) {
        if ((await p.locator('.folio').getAttribute('data-stop')) === 'peek') break;
        await p.locator('.folio .sheet-bar .bar-toggle').tap();
        await p.waitForTimeout(800);
      }
      const peek = await p.evaluate(() => {
        const f = document.querySelector('.folio') as HTMLElement;
        const fr = f.getBoundingClientRect();
        const lines = ['.dotcard .dc-nm', '.dotcard .dc-yrs', '.dotcard .dc-dis'].map((s) => f.querySelector<HTMLElement>(`.sheet-bar ${s}`)?.getBoundingClientRect() ?? null);
        const inner = (f.querySelector('.folio-inner') as HTMLElement).getBoundingClientRect();
        return { stop: f.dataset.stop, h: fr.height, top: fr.top, bottom: fr.bottom, lines: lines.map((r) => (r ? [Math.round(r.top), Math.round(r.bottom)] : null)), inner: Math.round(inner.top) };
      });
      if (peek.stop !== 'peek') return fail(`лист ${peek.stop}`);
      // этап 14, решение 155: шапка листа — высотой краткой карточки (--sheet-peek на .app ставит лист), прежде 214 px
      const want = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.app')!).getPropertyValue('--sheet-peek')) || 214);
      if (Math.abs(peek.h - want) > 2) return fail(`лист на нижнем положении ${Math.round(peek.h)} px, а не ${Math.round(want)}`);
      if (peek.lines.some((l) => !l)) return fail('в карточке листа нет имени, годов или уточнения');
      if (peek.lines.some((l) => l![1] > peek.bottom + 0.5 || l![0] < peek.top - 0.5)) return fail(`строка карточки режется краем листа: ${JSON.stringify(peek.lines)} при крае ${peek.bottom}`);
      if (peek.inner < peek.bottom - 1) return fail(`текст листа виден под карточкой: ${peek.inner} < ${peek.bottom}`);
      await p.locator('.folio .sheet-bar .close').focus();
      await p.keyboard.press('Tab');
      await p.waitForTimeout(800);
      const after = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const f = document.querySelector('.folio') as HTMLElement;
        const r = a.getBoundingClientRect();
        const fr = f.getBoundingClientRect();
        // не под закреплённой шапкой листа (WCAG 2.4.11)
        const bar = (f.querySelector('.sheet-bar') as HTMLElement).getBoundingClientRect();
        return { stop: f.dataset.stop, inside: !!a.closest('.folio-inner'), visible: r.top >= bar.bottom - 1 && r.bottom <= fr.bottom };
      });
      if (!after.inside) return fail('Tab ушёл не в карточку');
      if (after.stop !== 'half' || !after.visible) return fail(`фокус в теле листа: лист ${after.stop}, фокус виден — ${after.visible}`);
      // интервалы текста WCAG 1.4.12: помета «расч.» не ложится на годы
      await p.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }' });
      await p.locator('.folio .sheet-bar .bar-toggle').tap();
      await p.waitForTimeout(700);
      const clash = await p.evaluate(() => {
        const dd = document.querySelector('.folio .passport dd.fact') as HTMLElement;
        // сама надпись пометы: поле нажатия (32 px на сенсорном экране) шире и выше её
        const mark = (dd.querySelector('.mark abbr') ?? dd.querySelector('.mark')) as HTMLElement;
        const range = document.createRange();
        range.selectNodeContents(dd.firstChild as Node);
        const t = [...range.getClientRects()];
        const m = mark.getBoundingClientRect();
        return t.some((r) => r.right > m.left + 1 && r.left < m.right && r.bottom > m.top + 1 && r.top < m.bottom - 1);
      });
      return clash ? fail('«расч.» ложится на годы при интервалах 1.4.12') : pass(`лист ${Math.round(peek.h)} px — карточка у звезды целыми строками; Tab — лист на 55 %`);
    },
  },
];
