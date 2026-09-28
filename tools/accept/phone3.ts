/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа phone3: номера 450–469, телефон,
 * планшет и доступность (L9). MOB-70 и решение 56 (вступление на 320 px), MOB-69 и VIS-84 (быстрые входы), UX-70 (главная
 * фраза на невысоком окне), UX-76 (Escape, фокус, «Условные знаки»), MOB-71 (крупный текст), MOB-75 (панель — диалог),
 * MOB-42 и решение 57 (кегль холста), VIS-83 и UX-77 («В работе»).
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

/** Открыть адрес заново (смена якоря страницу не перезагружает). */
let loads = 0;
const go = async (p: Page, hash: string, ms = 2200) => {
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?load=${++loads}${hash}`);
  await p.waitForTimeout(ms);
};
/** Первый визит: вступительная табличка открыта. */
const introOpen = async (p: Page, hash = '#/') => {
  await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'open'));
  await go(p, hash, 1800);
};
/** Корневой кегль браузера (размер шрифта в настройках): как «Масштаб текста» и крупный шрифт у слабовидящих. */
const rootFont = async (p: Page, px: number) => {
  const c = await p.context().newCDPSession(p);
  await c.send('Page.setFontSizes' as never, { fontSizes: { standard: px, fixed: px } } as never);
};
type Box = { l: number; r: number; t: number; b: number; w: number; h: number };
const cross = (a: Box, b: Box) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

/**
 * Вступление на узком и низком экране (MOB-70): табличка и обе команды в пределах экрана, ничего не обрезано, прокрутки вбок
 * нет, табличка не заходит на кнопки неба; цели — не меньше minH.
 */
async function lowIntro(p: Page, minH: number): Promise<string> {
  const r = (await p.evaluate(`(() => {
    const box = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width, h: q.height }; };
    const c = document.querySelector('.cartouche');
    if (!c) return { err: 'вступления нет' };
    return {
      W: innerWidth, H: innerHeight, low: c.classList.contains('low'), cb: box(c), over: c.scrollWidth - c.clientWidth,
      btns: [...c.querySelectorAll('button')].map((b) => ({ ...box(b), name: b.textContent.trim(), over: b.scrollWidth - b.clientWidth })),
      col: [...document.querySelectorAll('.skyctl.column button')].map(box),
      hint: (() => { const h = c.querySelector('.hint'); return h && getComputedStyle(h).display !== 'none' ? box(h) : null; })(),
      scrollW: document.documentElement.scrollWidth,
    };
  })()`)) as { err?: string; W: number; H: number; low: boolean; cb: Box; over: number; btns: (Box & { name: string; over: number })[]; col: Box[]; hint: Box | null; scrollW: number };
  if (r.err) return r.err;
  const bad: string[] = [];
  if (!r.low) bad.push('табличка не в укороченном виде');
  if (r.cb.l < 0 || r.cb.r > r.W + 0.5 || r.cb.t < 0 || r.cb.b > r.H) bad.push(`табличка за краем: ${r.cb.l.toFixed(0)}…${r.cb.r.toFixed(0)} × ${r.cb.t.toFixed(0)}…${r.cb.b.toFixed(0)}`);
  if (r.over > 1) bad.push(`содержимое шире таблички на ${r.over} px`);
  if (r.scrollW > r.W + 1) bad.push(`прокрутка вбок: ${r.scrollW}`);
  for (const t of ['Как читать карту', 'Свернуть']) {
    const b = r.btns.find((x) => x.name === t);
    if (!b) bad.push(`нет «${t}»`);
    else {
      if (b.l < r.cb.l - 0.5 || b.r > r.cb.r + 0.5 || b.b > r.H) bad.push(`«${t}» вне таблички: ${b.l.toFixed(0)}…${b.r.toFixed(0)}`);
      if (b.h < minH - 0.5) bad.push(`«${t}» высотой ${b.h.toFixed(0)} px`);
      if (b.over > 1) bad.push(`«${t}» обрезано`);
    }
  }
  if (r.hint && r.hint.r > r.cb.r + 0.5) bad.push('подсказка уходит за правый край таблички');
  if (r.col.some((c) => cross(c, r.cb))) bad.push('табличка заходит на кнопки неба');
  return bad.join('; ');
}

/** Быстрые входы: строки (по верху кнопок) и размеры. */
async function entries(p: Page) {
  return (await p.evaluate(`[...document.querySelectorAll('.cartouche .entry button')].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: q.left, r: q.right, t0: Math.round(q.top), h: q.height }; })`)) as {
    t: string;
    l: number;
    r: number;
    t0: number;
    h: number;
  }[];
}
const rowsOf = (es: { t0: number }[]) => [...new Set(es.map((e) => e.t0))].sort((a, b) => a - b).map((t) => es.filter((e) => e.t0 === t).length);

export const phone3: Scenario[] = [
  {
    n: 450,
    title: 'MOB-70, решение 56: 320 × 568 пальцем — вступление в две строки в пределах экрана, «Как читать карту» и «Свернуть» по 44 px; «Свернуть» сворачивает',
    view: { width: 320, height: 568, touch: true },
    run: async (p) => {
      await introOpen(p);
      const bad = await lowIntro(p, 44);
      if (bad) return fail(bad);
      await p.locator('.cartouche button', { hasText: 'Свернуть' }).tap();
      await p.waitForTimeout(400);
      if (await p.locator('.cartouche').count()) return fail('«Свернуть» не свернул вступление');
      return (await p.locator('.sky .guide-cmd').count()) ? pass() : fail('нет команды «Как читать карту»');
    },
  },
  {
    n: 451,
    title: 'MOB-70, решение 56: 320 × 256 (масштаб 400 %) — вступление под кнопками неба, команды доступны; «Как читать карту» открывает «Условные знаки» и сворачивает табличку (UX-76)',
    view: { width: 320, height: 256 },
    run: async (p) => {
      await introOpen(p);
      const bad = await lowIntro(p, 32);
      if (bad) return fail(bad);
      await p.locator('.cartouche button', { hasText: 'Как читать карту' }).click();
      await p.waitForTimeout(700);
      if (!(await p.locator('.app > .sheet h2', { hasText: 'Условные знаки' }).count())) return fail('«Условные знаки» не открылись');
      return (await p.locator('.cartouche').count()) ? fail('табличка осталась рядом с «Условными знаками»') : pass();
    },
  },
  {
    n: 452,
    title: 'MOB-69, VIS-84: 390 × 844 пальцем — быстрые входы по 44 px с промежутком не меньше 8 px, две строки 4 + 3; «Руфь» открывает Руфь',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await introOpen(p);
      const es = await entries(p);
      if (es.length !== 7) return fail(`входов ${es.length}`);
      const small = es.filter((e) => e.h < 43.5).map((e) => `«${e.t}» ${e.h.toFixed(0)}`);
      if (small.length) return fail(`низкие входы: ${small.join(', ')}`);
      const rows = rowsOf(es);
      if (rows.join('+') !== '4+3') return fail(`строки входов: ${rows.join(' + ')}`);
      const tops = [...new Set(es.map((e) => e.t0))].sort((a, b) => a - b);
      if (tops[1] - tops[0] - 44 < 7.5) return fail(`между строками ${tops[1] - tops[0] - 44} px`);
      for (let i = 1; i < es.length; i++) if (es[i].t0 === es[i - 1].t0 && es[i].l - es[i - 1].r < 7.5) return fail(`«${es[i - 1].t}» и «${es[i].t}» через ${(es[i].l - es[i - 1].r).toFixed(1)} px`);
      await p.locator('.cartouche .entry button', { hasText: 'Руфь' }).tap();
      await p.waitForTimeout(1800);
      return hashId(p) === 'ruf' ? pass(`строки ${rows.join(' + ')}`) : fail(`выбрано «${hashId(p)}»`);
    },
  },
  {
    n: 453,
    title: 'VIS-84, UX-70: 1024 × 768 и 1366 × 768 — входы двумя ровными строками; фраза «Каждая звезда — человек…» видна без прокрутки таблички; 1440 × 900 — вся «Как читать карту»',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const out: string[] = [];
      for (const [w, h] of [
        [1024, 768],
        [1366, 768],
        [1440, 900],
      ]) {
        await p.setViewportSize({ width: w, height: h });
        await introOpen(p);
        const rows = rowsOf(await entries(p));
        if (rows.length !== 2 || Math.abs(rows[0] - rows[1]) > 1) return fail(`${w} × ${h}: строки входов ${rows.join(' + ')}`);
        const r = (await p.evaluate(`(() => {
          const c = document.querySelector('.cartouche'), l = c.querySelector('.long');
          const cb = c.getBoundingClientRect(), lb = l.getBoundingClientRect();
          return { vis: getComputedStyle(l).display !== 'none', text: l.textContent, inside: lb.top >= cb.top && lb.bottom <= cb.bottom, scroll: c.scrollHeight - c.clientHeight,
            items: [...c.querySelectorAll('.guide li')].filter((li) => getComputedStyle(li).display !== 'none').length };
        })()`)) as { vis: boolean; text: string; inside: boolean; scroll: number; items: number };
        if (!r.vis || !/Каждая звезда\s+—\s+человек/.test(r.text)) return fail(`${w} × ${h}: главной фразы нет`);
        if (!r.inside) return fail(`${w} × ${h}: фраза за нижним краем таблички`);
        if (h <= 800 && r.scroll > 1) return fail(`${w} × ${h}: табличка прокручивается на ${r.scroll} px`);
        // строка о колесе и клавише «?» остаётся и на невысоком окне (IX-41)
        const keys = ((await p.locator('.cartouche').innerText()) as string).replace(/\s+/g, ' ');
        if (!/Все клавиши\s—\s\?/.test(keys)) return fail(`${w} × ${h}: «?» во вступлении не назван`);
        if (h > 800 && r.items < 5) return fail(`${w} × ${h}: в «Как читать карту» ${r.items} строки`);
        out.push(`${w}: ${rows.join('+')}, строк «Как читать» ${r.items}`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 454,
    title: 'UX-76: Escape сворачивает вступление последним; «Как читать карту» ставит фокус на заголовок таблички; Escape из таблички — фокус на «Как читать карту»; «?» сворачивает табличку',
    run: async (p) => {
      // вступление свёрнуто, выбран Давид; «Как читать карту» открывает табличку
      await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'folded'));
      await go(p, '#/david', 1800);
      await p.locator('.sky .guide-cmd').click();
      await p.waitForTimeout(400);
      if (!(await p.locator('.cartouche').count())) return fail('«Как читать карту» не открыл табличку');
      const fid = await p.evaluate(() => document.activeElement?.id ?? '');
      if (fid !== 'cartouche-title') return fail(`после «Как читать карту» фокус на «${fid || document.activeElement}»`);
      // сначала Escape снимает выбранное лицо, табличка остаётся
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (hashId(p) !== '') return fail(`первый Escape не снял выбор: ${hashId(p)}`);
      if (!(await p.locator('.cartouche').count())) return fail('первый Escape свернул табличку раньше выбранного лица');
      // фокус — внутри таблички (первый вход), Escape сворачивает её и ставит фокус на «Как читать карту»
      await p.locator('.cartouche .entry button').first().focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      if (await p.locator('.cartouche').count()) return fail('Escape не свернул табличку');
      const cls = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? '');
      if (cls !== 'guide-cmd') return fail(`после Escape фокус на «${cls || 'body'}»`);
      // «?» — «Условные знаки» (раздел «Клавиши»): табличка сворачивается, текст «Как читать карту» не стоит дважды
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      if (!(await p.locator('.cartouche').count())) return fail('Enter на «Как читать карту» не открыл табличку');
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(700);
      if (!(await p.locator('.app > .sheet h2', { hasText: 'Условные знаки' }).count())) return fail('«?» не открыл «Условные знаки»');
      return (await p.locator('.cartouche').count()) ? fail('табличка осталась рядом с «Условными знаками»') : pass();
    },
  },
  {
    n: 455,
    title: 'MOB-71: 390 × 844 при кегле браузера 32 px — «Найти:» командой 44 px, поле раскрывается во всю строку и ищет; «Разделы» в экране; кнопки неба вмещают подписи и не уходят под лист',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await rootFont(p, 32);
      await go(p, '#/david', 2500);
      const top = (await p.evaluate(`(() => {
        const box = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width, h: q.height }; };
        const lab = document.querySelector('.top .search label');
        return { W: innerWidth, lab: box(lab), sec: box(document.querySelector('.top .sections > button')), mark: box(document.querySelector('.top .wordmark')),
          col: [...document.querySelectorAll('.skyctl.column button')].map((b) => ({ ...box(b), name: b.textContent.trim(), over: Math.max(b.scrollWidth - b.clientWidth, b.hasAttribute('aria-label') ? 0 : b.scrollHeight - b.clientHeight),
            hit: (() => { const q = b.getBoundingClientRect(); const e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!e && b.contains(e); })() })) };
      })()`)) as { W: number; lab: Box; sec: Box; mark: Box; col: (Box & { name: string; over: number; hit: boolean })[] };
      if (top.lab.h < 43.5 || top.lab.w < 40) return fail(`«Найти:» ${top.lab.w.toFixed(0)} × ${top.lab.h.toFixed(0)}`);
      if (top.sec.r > top.W + 0.5 || cross(top.lab, top.sec) || cross(top.mark, top.lab)) return fail(`верхняя строка: «Разделы» ${top.sec.l.toFixed(0)}…${top.sec.r.toFixed(0)}, «Найти:» ${top.lab.l.toFixed(0)}…${top.lab.r.toFixed(0)}`);
      if (top.col.length !== 4) return fail(`кнопок неба ${top.col.length}`);
      for (const b of top.col) {
        if (b.over > 1) return fail(`«${b.name}» не помещается в кнопку: ${b.over} px`);
        if (b.w < 44 || b.h < 43.5 || b.r > top.W + 0.5) return fail(`«${b.name}» ${b.w.toFixed(0)} × ${b.h.toFixed(0)} у ${b.r.toFixed(0)}`);
        if (!b.hit) return fail(`«${b.name}» закрыта листом карточки`);
      }
      await p.locator('.top .search label').tap();
      await p.waitForTimeout(400);
      const f = (await p.evaluate(`(() => { const s = document.querySelector('.top .search'), i = s.querySelector('input'); return { focus: document.activeElement === i, w: s.getBoundingClientRect().width, iw: i.getBoundingClientRect().width }; })()`)) as {
        focus: boolean;
        w: number;
        iw: number;
      };
      if (!f.focus || f.w < top.W - 24 || f.iw < 96) return fail(`поле не раскрылось: фокус ${f.focus}, строка ${f.w.toFixed(0)}, поле ${f.iw.toFixed(0)}`);
      await p.keyboard.type('Руфь');
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      return hashId(p) === 'ruf' ? pass(`кнопки неба ${top.col.map((b) => b.w.toFixed(0) + '×' + b.h.toFixed(0)).join(', ')}`) : fail(`поиск выбрал «${hashId(p)}»`);
    },
  },
  {
    n: 456,
    title: 'MOB-71: обычный кегль — поле «Найти» на 360 и 390 px не уже 6rem; на 320 px — команда «Найти:»; «Разделы» в экране',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      const out: string[] = [];
      for (const w of [390, 360, 320]) {
        await p.setViewportSize({ width: w, height: 740 });
        await go(p, '#/', 1500);
        const r = (await p.evaluate(`(() => { const i = document.querySelector('.top .search input'), l = document.querySelector('.top .search label'), s = document.querySelector('.top .sections > button');
          return { iw: i.getBoundingClientRect().width, lh: l.getBoundingClientRect().height, sr: s.getBoundingClientRect().right }; })()`)) as { iw: number; lh: number; sr: number };
        if (r.sr > w + 0.5) return fail(`${w}: «Разделы» за краем (${r.sr.toFixed(0)})`);
        if (w > 336 && r.iw < 95.5) return fail(`${w}: поле ${r.iw.toFixed(0)} px`);
        if (w <= 336 && (r.iw > 2 || r.lh < 43.5)) return fail(`${w}: поле ${r.iw.toFixed(0)} px, «Найти:» ${r.lh.toFixed(0)} px`);
        out.push(`${w}: ${w > 336 ? `поле ${r.iw.toFixed(0)}` : '«Найти:»'}`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 457,
    title: 'MOB-75: панель на телефоне — role="dialog", aria-modal, имя по h2; на компьютере — область без role',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/~pindex', 2000);
      const attrs = async () =>
        (await p.evaluate(`(() => { const s = document.querySelector('.app > .sheet'); const h = s && document.getElementById(s.getAttribute('aria-labelledby'));
          return s ? { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), name: h ? h.textContent.trim() : null } : null; })()`)) as { role: string | null; modal: string | null; name: string | null } | null;
      const a = await attrs();
      if (!a) return fail('панели нет');
      if (a.role !== 'dialog' || a.modal !== 'true' || a.name !== 'Указатель') return fail(`телефон: ${JSON.stringify(a)}`);
      // «Эпохи» — лист над полосой, небо над ним отвечает: не модальный, не диалог
      await go(p, '#/~pepochs', 2000);
      const e = await attrs();
      if (e?.role) return fail(`«Эпохи» на телефоне: role=${e.role}`);
      await p.setViewportSize({ width: 1440, height: 900 });
      await go(p, '#/~pindex', 2000);
      const d = await attrs();
      return d && d.role === null && d.modal === null && d.name === 'Указатель' ? pass() : fail(`компьютер: ${JSON.stringify(d)}`);
    },
  },
  {
    n: 458,
    title: 'MOB-42, решение 57: имена звёзд следуют кеглю браузера — 20 px даёт ×1,25, 32 px — ×1,5 (не больше); смена кегля без перезагрузки перерисовывает подписи',
    run: async (p) => {
      await p.addInitScript(() => {
        const w = window as unknown as { __names: number[] };
        w.__names = [];
        const f = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, ...a: Parameters<typeof f>) {
          // имена звёзд — Literata прямым начертанием (слои неба могут рисоваться и на холстах вне страницы)
          if (/Literata/.test(this.font) && !/italic/.test(this.font)) w.__names.push(Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 0));
          return f.apply(this, a);
        };
      });
      const biggest = async () => {
        await p.evaluate(() => ((window as unknown as { __names: number[] }).__names = []));
        // кадр неба: небольшой сдвиг колесом
        await p.mouse.move(700, 450);
        await p.mouse.wheel(0, -60);
        await p.waitForTimeout(900);
        return p.evaluate(() => Math.max(0, ...(window as unknown as { __names: number[] }).__names));
      };
      await go(p, '#/david', 2200);
      const base = await biggest();
      await rootFont(p, 32);
      await go(p, '#/david', 2200);
      const big = await biggest();
      if (Math.abs(big / base - 1.5) > 0.02) return fail(`кегль 32 px: имена ${big} px при обычных ${base} px`);
      // без перезагрузки: 20 px — ×1,25
      await rootFont(p, 20);
      await p.waitForTimeout(600);
      const mid = await biggest();
      return Math.abs(mid / base - 1.25) < 0.02 ? pass(`имена ${base} → ${big} → ${mid} px`) : fail(`после смены кегля без перезагрузки имена ${mid} px`);
    },
  },
  {
    n: 459,
    title: 'VIS-83, UX-77: «В работе» после «С семьёй» у Давида — «Давид и его семья (N)» один раз, строки группы с отступом 14 px, Давид первым; вводка — «набор помнится в этом браузере»',
    run: async (p) => {
      await go(p, '#/david', 2000);
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(300);
      await p.locator('.workpick .wp-take button', { hasText: 'С семьёй' }).click();
      await p.waitForTimeout(400);
      await go(p, '#/david~pwork', 2000);
      const r = (await p.evaluate(`(() => {
        const s = document.querySelector('.app > .sheet');
        const heads = [...s.querySelectorAll('.worklist .wg-head')].map((h) => h.textContent.replace(/\\s+/g, ' ').trim());
        const list = s.querySelector('.worklist .wg-list');
        const first = list && list.querySelector('li');
        const row = list && list.querySelector('.wi-row'), head = s.querySelector('.wg-head');
        return { heads, lead: s.querySelector('.lead').textContent.replace(/\\s+/g, ' ').trim(), first: first && first.dataset.id,
          indent: row && head ? Math.round(row.getBoundingClientRect().left - s.querySelector('.worklist').getBoundingClientRect().left) : null,
          vias: [...s.querySelectorAll('.worklist .wi-via')].map((v) => v.textContent.trim()), n: list ? list.querySelectorAll(':scope > li').length : 0 };
      })()`)) as { heads: string[]; lead: string; first: string | null; indent: number | null; vias: string[]; n: number };
      if (r.heads.length !== 1 || !new RegExp(`^Давид и его семья \\(${r.n}\\)$`).test(r.heads[0])) return fail(`заголовки групп: ${r.heads.join(' | ')} (в группе ${r.n})`);
      if (r.vias.some((v) => /Давида/.test(v))) return fail(`«семья Давида» под строками: ${r.vias.length}`);
      if (r.first !== 'david') return fail(`первым в группе — «${r.first}»`);
      if (r.indent !== 14) return fail(`отступ строк группы ${r.indent} px`);
      if (!/набор помнится в этом браузере/.test(r.lead)) return fail(`вводка: «${r.lead}»`);
      return pass(`${r.heads[0]}`);
    },
  },
  {
    n: 460,
    title: 'MOB-72: 720 × 450 (масштаб 200 %) — «Родство с…» с клавиатуры: строка выбора в одну линию, «отменить» рядом с текстом, Давид не под строкой; 390 × 844 — Давид не под строкой',
    view: { width: 720, height: 450 },
    run: async (p) => {
      const pick = async () => {
        await go(p, '#/david', 2200);
        await p.locator('.folio button', { hasText: /^Родство с/ }).first().focus();
        await p.keyboard.press('Enter');
        await p.waitForTimeout(1500);
        return (await p.evaluate(`(() => {
          const bar = document.querySelector('.pickbar-pick');
          if (!bar) return null;
          const b = bar.getBoundingClientRect(), t = bar.querySelector('.txt').getBoundingClientRect(), c0 = bar.querySelector('button').getBoundingClientRect();
          const el = document.querySelector('.sky'), c = el.querySelector('canvas').getBoundingClientRect();
          const [x, y] = (el.dataset.sel || '').split(' ').map(Number);
          const hit = document.elementFromPoint(c.left + x, c.top + y);
          return { h: b.height, same: Math.abs((t.top + t.bottom) / 2 - (c0.top + c0.bottom) / 2) < 6, canvas: !!hit && hit.tagName === 'CANVAS', star: y, barBottom: b.bottom - c.top };
        })()`)) as { h: number; same: boolean; canvas: boolean; star: number; barBottom: number } | null;
      };
      const low = await pick();
      if (!low) return fail('720 × 450: строки выбора нет');
      if (low.h > 40 || !low.same) return fail(`720 × 450: строка ${low.h.toFixed(0)} px, «отменить» ${low.same ? 'рядом' : 'под текстом'}`);
      if (!low.canvas) return fail(`720 × 450: Давид (y ${low.star.toFixed(0)}) под строкой (низ ${low.barBottom.toFixed(0)})`);
      await p.setViewportSize({ width: 390, height: 844 });
      const tall = await pick();
      if (!tall) return fail('390 × 844: строки выбора нет');
      return tall.canvas ? pass(`строка ${low.h.toFixed(0)} px`) : fail(`390 × 844: Давид (y ${tall.star.toFixed(0)}) под строкой (низ ${tall.barBottom.toFixed(0)})`);
    },
  },
];
