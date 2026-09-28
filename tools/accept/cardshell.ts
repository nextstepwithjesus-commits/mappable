/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа cardshell (K2): оболочка карточки —
 * первый экран (VIS-41, CARD-54), стопка как вкладки (решение 18; CARD-52, IX-52, UX-49), свёрнутая карточка —
 * корешок (VIS-44, UX-50), закреплённая полоса (CARD-53, UX-67), рейка (VIS-42, CARD-70), полоса 66 книг (CARD-49),
 * «Взять в работу» (VIS-47, CARD-75, UX-48), фокус заголовков (VIS-45, VIS-56, CARD-74), лист телефона (MOB-50, MOB-64),
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
 * Открыть карточку лица так, как её открывает читатель, — поиском («/», имя, Enter); стопка живёт в сеансе.
 * Не сменой адреса: адрес — запись истории, а «назад» и адрес не меняют состав стопки (решение 50; UX-74).
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
/** Верх первого раздела карточки и нижний край видимой части листа (над полосой времени). */
const firstSection = (p: Page) =>
  p.evaluate(() => {
    const s = document.querySelector('.folio-body .sec') as HTMLElement | null;
    const f = document.querySelector('.folio') as HTMLElement;
    const strip = document.querySelector('.strip') as HTMLElement | null;
    const bottom = Math.min(f.getBoundingClientRect().bottom, strip ? strip.getBoundingClientRect().top : innerHeight);
    return { top: s ? Math.round(s.getBoundingClientRect().top) : null, n: s?.dataset.n ?? null, bottom: Math.round(bottom) };
  });
/** Команды шапки: подписи без «▾» и их верхние края. */
const commands = (p: Page) =>
  p.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.folio .actions > button, .folio .actions > .workbtn > button')].map((b) => ({
      t: b.innerText.replace(/[▾▴]/g, '').replace(/\s+/g, ' ').trim(),
      y: Math.round(b.getBoundingClientRect().top),
    })),
  );
const rect = (p: Page, sel: string) => p.locator(sel).first().boundingBox();

export const cardshell: Scenario[] = [
  {
    n: 230,
    title: 'VIS-41, CARD-54, 1440 × 900: § 1 не ниже 480 px; команды — одной строкой: «Показать на небе», «Родство с…», «Разворот с…», «Взять в работу ▾»; эпохи и легенды лент в шапке нет',
    run: async (p) => {
      const tops: string[] = [];
      for (const id of ['david', 'melkhisedek', 'avraam', 'esfir']) {
        await go(p, `#/${id}`);
        const s = await firstSection(p);
        if (s.top === null || s.top > 480) return fail(`${id}: § ${s.n} на ${s.top} px`);
        tops.push(`${id} ${s.top}`);
      }
      const cmds = await commands(p);
      const names = cmds.map((c) => c.t).join(' | ');
      if (names !== 'Показать на небе | Родство с… | Разворот с… | Взять в работу') return fail(`команды: ${names}`);
      if (new Set(cmds.map((c) => c.y)).size !== 1) return fail(`команды в ${new Set(cmds.map((c) => c.y)).size} строки`);
      const visibleEpoch = await p.evaluate(() => [...document.querySelectorAll('.folio .passport dt')].some((d) => d.textContent === 'Эпоха' && (d as HTMLElement).getBoundingClientRect().width > 2));
      if (visibleEpoch) return fail('в паспорте видна строка «Эпоха»');
      if (await p.locator('.folio .mast .lines').count()) return fail('в шапке строка-легенда лент');
      // «Скрыть потомков на небе» — пункт выбора «Взять в работу», а не команда шапки (решение 26)
      if (await p.locator('.folio .actions > button', { hasText: /потомков/ }).count()) return fail('«потомков» — командой шапки');
      return pass(tops.join(', '));
    },
  },
  {
    n: 231,
    title: 'VIS-41 на ноутбуке: 1280 × 800 — § 1 не ниже 520 px, команды одной строкой; 1024 × 768 — § 1 виден над полосой времени',
    view: { width: 1280, height: 800 },
    run: async (p) => {
      const out: string[] = [];
      for (const id of ['david', 'melkhisedek', 'avraam']) {
        await go(p, `#/${id}`);
        const s = await firstSection(p);
        if (s.top === null || s.top > 520) return fail(`1280: ${id} — § ${s.n} на ${s.top} px`);
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
    title: 'Решение 18, CARD-52, IX-52: стопка — одна строка «Ещё открыты (N): …», по щелчку — список от недавних к старым; «×» активной открывает следующую, фокус на её заголовке; «Закрыть все»; Escape стопку не чистит',
    run: async (p) => {
      await go(p, '#/david', 1800);
      for (const id of ['avraam', 'ruf', 'moisey', 'mariya']) await hop(p, id);
      const sum = p.locator('.folio .folio-bar .stack-sum');
      if ((await sum.count()) !== 1) return fail('нет строки стопки');
      const label = (await sum.getAttribute('aria-label')) ?? '';
      if (!/^Ещё открыты \(4\): Моисей, Руфь, Авраам, Давид$/.test(label.replace(/\s+/g, ' '))) return fail(`строка стопки: «${label}»`);
      if (await p.locator('.folio .stack-row').count()) return fail('список раскрыт без щелчка');
      const s = await firstSection(p);
      if (s.top === null || s.top > 520) return fail(`при стопке § 1 на ${s.top} px`);
      await sum.click();
      await p.waitForTimeout(300);
      const ids = await p.locator('.folio .stack .stack-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
      if (ids.join(' ') !== 'moisey ruf avraam david') return fail(`список: ${ids.join(' ')}`);
      if (!(await p.locator('.folio .stack button', { hasText: 'Закрыть все' }).count())) return fail('нет «Закрыть все»');
      // уточнение не обрезано посреди слова
      const ds = await p.locator('.folio .stack .ds').allInnerTexts();
      if (ds.some((t) => /[а-яё]…$/.test(t) && !/\s\S+…$/.test(t))) return fail(`уточнение: ${ds.join(' / ')}`);
      // Escape закрывает список, но не карточку
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      if (hashId(p) !== 'mariya' || (await p.locator('.folio .stack-row').count())) return fail('Escape списка снял не только список');
      // «×» активной — следующая по недавности, фокус на её заголовке
      await p.locator('.folio .folio-bar .bar-cmds .close').click();
      await p.waitForTimeout(900);
      if (hashId(p) !== 'moisey') return fail(`после «×» выбрано «${hashId(p)}», а не Моисей`);
      const focus = await p.evaluate(() => document.activeElement?.id ?? '');
      if (focus !== 'title-moisey') return fail(`фокус после «×» — на «${focus}»`);
      const label2 = ((await sum.getAttribute('aria-label')) ?? '').replace(/\s+/g, ' ');
      if (!/^Ещё открыты \(3\): Руфь, Авраам, Давид$/.test(label2)) return fail(`после «×»: «${label2}»`);
      // Escape снимает выбор, стопка остаётся; следующий выбор её возвращает
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      if (hashId(p)) return fail('Escape не снял выбор');
      await hop(p, 'solomon');
      const label3 = ((await sum.getAttribute('aria-label')) ?? '').replace(/\s+/g, ' ');
      if (!/^Ещё открыты \(4\): Моисей, Руфь, Авраам, Давид$/.test(label3)) return fail(`после Escape и выбора: «${label3}»`);
      await sum.click();
      await p.waitForTimeout(200);
      await p.locator('.folio .stack button', { hasText: 'Закрыть все' }).click();
      await p.waitForTimeout(500);
      if (hashId(p) || (await p.locator('.folio:not([hidden])').count())) return fail('«Закрыть все» не закрыл карточки');
      await hop(p, 'ruf');
      return (await sum.count()) ? fail('после «Закрыть все» стопка вернулась') : pass('Моисей, Руфь, Авраам, Давид; «×», Escape, «Закрыть все»');
    },
  },
  {
    n: 233,
    title: 'VIS-44, UX-50: «Свернуть карточку» — корешок 56 px, небо шире на ширину листа; на корешке — имена стопки; «развернуть» возвращает лист и фокус на заголовок',
    run: async (p) => {
      await go(p, '#/ruf', 1600);
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
      const others = (await spine.locator('.sp-open').allInnerTexts()).map((t) => t.trim());
      if (others.join(' ') !== 'Руфь') return fail(`на корешке: ${others.join(', ')}`);
      const focus = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');
      if (!/unfold/.test(focus)) return fail(`фокус после «Свернуть карточку» — на «${focus}»`);
      await spine.locator('.unfold').click();
      await p.waitForTimeout(900);
      if (await p.locator('.folio.spine').count()) return fail('«развернуть» не развернул');
      const t = await p.evaluate(() => document.activeElement?.id ?? '');
      if (t !== 'title-david') return fail(`фокус после «развернуть» — на «${t}»`);
      // имя стопки на корешке открывает её карточку развёрнутой
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
    title: 'VIS-47, UX-48, CARD-75: «Взять в работу ▾» — лист во всю колонку, поколения столбцами, «Скрыть потомков на небе»; верхняя строка — «В работе: N»; в панели видно, почему лицо в наборе',
    run: async (p) => {
      await go(p, '#/ruf');
      const btn = p.locator('.folio .workbtn > button');
      if (!/^Взять в работу\s*▾$/.test((await btn.innerText()).trim())) return fail(`команда: «${await btn.innerText()}»`);
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
      const top = p.locator('.top .commands > button', { hasText: 'В работе' });
      const label = (await top.innerText()).trim();
      if (label !== `В работе: ${n}`) return fail(`верхняя строка: «${label}», в наборе ${n}`);
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
    title: 'MOB-64, MOB-50, MOB-52, 390 × 844: шапка листа на 104 px — имя, годы и уточнение целыми строками; Tab в тело свёрнутого листа поднимает его на 55 %; «расч.» паспорта не ложится на годы',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david', 2400);
      await p.locator('.folio .sheet-bar .bar-toggle').tap();
      await p.waitForTimeout(700);
      await p.locator('.folio .sheet-bar .bar-toggle').tap();
      await p.waitForTimeout(800);
      const peek = await p.evaluate(() => {
        const f = document.querySelector('.folio') as HTMLElement;
        const fr = f.getBoundingClientRect();
        const lines = ['.bar-name', '.bar-years', '.bar-dis'].map((s) => f.querySelector<HTMLElement>(s)?.getBoundingClientRect() ?? null);
        const inner = (f.querySelector('.folio-inner') as HTMLElement).getBoundingClientRect();
        return { stop: f.dataset.stop, h: fr.height, bottom: fr.bottom, lines: lines.map((r) => (r ? [Math.round(r.top), Math.round(r.bottom)] : null)), inner: Math.round(inner.top) };
      });
      if (peek.stop !== 'peek') return fail(`лист ${peek.stop}`);
      if (peek.lines.some((l) => !l)) return fail('в шапке нет имени, годов или уточнения');
      if (peek.lines.some((l) => l![1] > peek.bottom + 0.5)) return fail(`строка шапки режется краем листа: ${JSON.stringify(peek.lines)} при крае ${peek.bottom}`);
      if (peek.inner < peek.bottom - 1) return fail(`текст листа виден под шапкой: ${peek.inner} < ${peek.bottom}`);
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
      return clash ? fail('«расч.» ложится на годы при интервалах 1.4.12') : pass('шапка 104 px целыми строками; Tab — лист на 55 %');
    },
  },
];
