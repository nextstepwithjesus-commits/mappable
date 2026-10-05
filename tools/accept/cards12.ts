/**
 * Сценарии приёмки этапа 12, задача S2 «Карточки: вкладки и родство» (решения 91, 92; пункты 5 и 6 отзыва владельца),
 * группа cards12: 890–909.
 *  — 890–899, решение 91: боковая карточка — одна текущая, стопки «Ещё открыты (N)» нет; «Закрепить карточку персонажа»
 *    рядом со «Свернуть карточку»; закреплённая при выборе другого лица — строка-вкладка вверху листа (цветная метка, имя
 *    с уточнением, «×»); щелчок раскрывает; у раскрытой — «Открепить карточку персонажа»; вкладок сколько угодно, у каждой
 *    свой цвет спокойной палитры; помнятся в браузере; клавиатура (список кнопок, «Закрыть вкладку …», Escape); телефон
 *    и планшет; «Разворот» — как был; axe и § 5.6;
 *  — 900–909, решение 92: «Родство» у звезды и § 9 — все, от кого у лица есть дети: жёны и наложницы; мать детей, которую
 *    текст не называет женой («Наама, Аммонитянка — мать Ровоама», 3 Цар 14:21); неназванная жена, если текст её
 *    упоминает («имя в Писании не названо, Быт 4:17»); все дети по союзам; «ещё N» вместо молчаливой обрезки; дочери Лота
 *    и Фамарь — Иуда словами текста, без слова «жена». Проверка — на Соломоне, Иуде, Каине, Лоте, Давиде, Иакове, Аврааме,
 *    Исаве и на всех 17 парах «отец + мать ребёнка», где мать не записана супругой.
 */
import type { Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../bible.ts';
import { fail, hashId, pass, type Scenario } from './kit.ts';
import { axeOn, clickStar, flat, open, templateIssues } from './unify11.ts';

const PHONE = { width: 390, height: 844, touch: true };
const PREVIEW = join(ROOT, '.ui-shots/s2');

/** Вкладки листа: «id» или «id*» (раскрыта). */
const tabs = async (p: Page) =>
  (await p.locator('.folio .card-tabs .card-tab, .folio .spine-tabs li').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.id}${e.hasAttribute('data-open') ? '*' : ''}`))).join(' ');
/** Закрепить карточку, открытую в листе («Закрепить карточку персонажа» полосы, на телефоне — шапки листа). */
async function pin(p: Page, tap = false) {
  const b = p.locator('.folio .folio-bar .pin-card, .folio .sheet-bar .pin-card').first();
  if (tap) await b.tap();
  else await b.click();
  await p.waitForTimeout(250);
}
/** Выбрать лицо сменой адреса (выбор заменяет текущую карточку). */
async function hop(p: Page, id: string, ms = 1500) {
  await p.evaluate((x) => (location.hash = `#/${x}`), id);
  await p.waitForTimeout(ms);
}
/** Строки «Родства» открытой карточки у звезды: вид строки, подпись, текст. Краткий вид раскрывается «всё родство». */
async function kin(p: Page): Promise<{ kind: string; label: string; text: string }[]> {
  const all = p.locator(':is(.sky .dotcard, .folio .kin-col) .dc-row.all .dc-more');
  if (await all.count()) {
    await all.click();
    await p.waitForTimeout(500);
  }
  return (await p.evaluate(`[...document.querySelectorAll(':is(.sky .dotcard, .folio .kin-col) .dc-row:not(.all)')].map((r) => ({
    kind: [...r.classList].find((c) => c !== 'dc-row' && c !== 'hot') || '',
    label: (r.querySelector('.dc-lbl')?.textContent || '').trim(),
    text: (() => {
      // этап 14 (решение 151): пометы уровня (.dc-cert: «выв.», «толк.») и уточнения тёзок (.dc-ds) — видимые части фразы
      // родства; строка здесь — имена, как прежде (пометы и уточнения проверяют сценарии 1161 и 1169)
      const v = r.querySelector('.dc-val');
      if (!v) return '';
      const c = v.cloneNode(true);
      c.querySelectorAll('.dc-cert, .dc-ds').forEach((e) => e.remove());
      return (c.textContent || '').replace(/[\\u00a0\\u202f\\u2009]/g, ' ').replace(/\\u2060/g, '').replace(/\\s+/g, ' ').replace(/\\s+([,;])/g, '$1').trim();
    })(),
  }))`)) as { kind: string; label: string; text: string }[];
}
/** Раскрыть «ещё N» во всех строках «Родства». */
async function moreAll(p: Page) {
  // краткая карточка у звезды (этап 13): сначала «всё родство — ещё N строк», затем «ещё N» в каждой строке
  const all = p.locator(':is(.sky .dotcard, .folio .kin-col) .dc-row.all .dc-more');
  if (await all.count()) {
    await all.click();
    await p.waitForTimeout(500);
  }
  for (let i = 0; i < 6; i++) {
    const m = p.locator(':is(.sky .dotcard, .folio .kin-col) .dc-row:not(.all) .dc-more');
    if (!(await m.count())) return;
    await m.first().click();
    await p.waitForTimeout(250);
  }
}
/** Открыть лицо и его карточку у звезды (всё небо). */
async function dot(p: Page, id: string, theme?: 'night' | 'day'): Promise<boolean> {
  await open(p, `#/${id}`, { theme });
  return clickStar(p, id);
}
/** Текст раздела § n подробной карточки (без «ещё N записей»: раскрывается). */
async function sec(p: Page, n: number): Promise<string> {
  const el = p.locator(`.folio #sec-${n}`);
  if (!(await el.count())) return '';
  for (let i = 0; i < 3; i++) {
    const more = el.locator('button.more');
    if (!(await more.count())) break;
    await more.first().click();
    await p.waitForTimeout(200);
  }
  return flat(await el.innerText());
}
const row = (rows: { kind: string; label: string; text: string }[], kind: string) => rows.find((r) => r.kind === kind);

/** 17 пар «отец + мать ребёнка», где мать не записана супругой (request5.md, п. 6): отец, мать, имя матери, ребёнок. */
const PAIRS: [string, string, string][] = [
  ['lot', 'starshaya-doch-lota', 'Старшая дочь Лота'],
  ['lot', 'mladshaya-doch-lota', 'Младшая дочь Лота'],
  ['iuda', 'famar', 'Фамарь'],
  ['galaad-otets-ieffaya', 'mat-ieffaya', 'Мать Иеффая'],
  ['solomon', 'naama', 'Наама'],
  ['asa', 'azuva-doch-salaila', 'Азува'],
  ['okhoziya-syn-iorama', 'tsivya-iz-virsavii', 'Цивья'],
  ['ioas-syn-okhozii', 'iegoaddan', 'Иегоаддань'],
  ['amasiya', 'iekholiya', 'Иехолия'],
  ['oziya', 'ierusha-doch-sadoka', 'Иеруша'],
  ['akhaz', 'avi-doch-zakharii', 'Ави'],
  ['ezekiya', 'kheftsiba', 'Хефциба'],
  ['manassiya-tsar', 'meshullemef', 'Мешуллемеф'],
  ['amon-tsar', 'iedida', 'Иедида'],
  ['iosiya', 'khamutal', 'Хамуталь'],
  ['iosiya', 'zebudda', 'Зебудда'],
  ['ioakim-tsar', 'nekhushta', 'Нехушта'],
];

export const cards12: Scenario[] = [
  // ---------- решение 91: одна текущая карточка, закреплённые — вкладки ----------
  {
    n: 890,
    title: 'Решение 91: стопки нет — пять выборов подряд: в листе одна карточка, ни «Ещё открыты», ни списка открытых; «×» закрывает, прежняя не открывается; в памяти сеанса нет стопки',
    run: async (p) => {
      await open(p, '#/ruf');
      for (const id of ['vooz', 'david', 'solomon', 'avraam']) await hop(p, id, 1200);
      const txt = await p.locator('.folio').innerText();
      if (/Ещё открыт|Закрыть все/.test(txt)) return fail('в листе осталась стопка');
      if (await p.locator('.folio .stack-sum, .folio .stack, .folio .card-tabs').count()) return fail('в листе стопка или вкладки без закрепления');
      if ((await p.locator('.folio .mast h2').count()) !== 1) return fail('в листе больше одной карточки');
      await p.locator('.folio .folio-bar .bar-cmds .close').click();
      await p.waitForTimeout(800);
      if (hashId(p)) return fail(`после «×» открыта «${hashId(p)}»`);
      if (await p.locator('.folio:not([hidden])').count()) return fail('после «×» лист остался');
      const st = await p.evaluate(() => sessionStorage.getItem('toledot:stack'));
      return st ? fail(`стопка в памяти сеанса: ${st}`) : pass('Руфь → Вооз → Давид → Соломон → Авраам: одна карточка; «×» — лист закрыт');
    },
  },
  {
    n: 891,
    title: 'Решение 91: «Закрепить карточку персонажа» — рядом со «Свернуть карточку»; закреплённая — вкладка вверху листа, раскрыта; выбор другого лица сворачивает её в тонкую строку: метка, имя с уточнением, «×»; у раскрытой — «Открепить карточку персонажа»',
    run: async (p) => {
      await open(p, '#/david');
      const cmds = await p.locator('.folio .folio-bar .bar-cmds > *').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || (e as HTMLElement).innerText.trim()));
      if (cmds.join(' | ') !== 'Закрепить карточку персонажа | Свернуть карточку | Закрыть карточку') return fail(`команды полосы: ${cmds.join(' | ')}`);
      const b = await p.locator('.folio .folio-bar .pin-card').boundingBox();
      const f = await p.locator('.folio .folio-bar .fold-card').boundingBox();
      if (!b || !f || Math.abs(b.y - f.y) > 2 || f.x - (b.x + b.width) > 12) return fail('«Закрепить…» не рядом со «Свернуть карточку»');
      await pin(p);
      if ((await tabs(p)) !== 'david*') return fail(`после закрепления: ${await tabs(p)}`);
      if ((await p.locator('.folio .card-tab[data-id="david"] .tab-open').getAttribute('aria-expanded')) !== 'true') return fail('раскрытая вкладка без aria-expanded=true');
      if ((await p.locator('.folio .folio-bar .pin-card').getAttribute('aria-label')) !== 'Открепить карточку персонажа') return fail('нет «Открепить карточку персонажа»');
      await hop(p, 'ruf');
      await pin(p);
      await hop(p, 'solomon');
      if ((await tabs(p)) !== 'david ruf') return fail(`вкладки: ${await tabs(p)}`);
      const r = await p.evaluate(`[...document.querySelectorAll('.folio .card-tab')].map((li) => {
        const b = li.querySelector('.tab-open').getBoundingClientRect();
        return { h: Math.round(b.height), mark: !!li.querySelector('.tab-mark'), nm: li.querySelector('.nm').textContent, ds: li.querySelector('.ds')?.textContent || '', close: li.querySelector('.close')?.getAttribute('aria-label') || '', exp: li.querySelector('.tab-open').getAttribute('aria-expanded') };
      })`) as { h: number; mark: boolean; nm: string; ds: string; close: string; exp: string }[];
      for (const t of r) {
        if (t.h > 36) return fail(`строка вкладки ${t.nm} — ${t.h} px, не тонкая`);
        if (!t.mark || !t.ds || !/^Закрыть вкладку: /.test(t.close) || t.exp !== 'false') return fail(`вкладка ${t.nm}: ${JSON.stringify(t)}`);
      }
      // вкладки — вверху листа, над полосой и карточкой
      const top = await p.evaluate(`(() => { const f = document.querySelector('.folio').getBoundingClientRect(); const t = document.querySelector('.folio .card-tabs').getBoundingClientRect(); const h = document.querySelector('.folio .mast h2').getBoundingClientRect(); return { dt: Math.round(t.top - f.top), below: h.top >= t.bottom - 1 }; })()`) as { dt: number; below: boolean };
      if (top.dt > 2 || !top.below) return fail(`вкладки не вверху листа: ${JSON.stringify(top)}`);
      return pass(r.map((t) => `${t.nm} (${t.ds}) ${t.h} px`).join('; '));
    },
  },
  {
    n: 892,
    title: 'Решение 91: у каждой вкладки свой цвет спокойной палитры (--tab-1 …): четыре вкладки — четыре цвета; ни один не цвет лент и не жёлтый связи; ночью и днём',
    run: async (p) => {
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/solomon', { theme, extra: { tabs: [{ id: 'david', hue: 0 }, { id: 'ruf', hue: 1 }, { id: 'avraam', hue: 2 }, { id: 'moisey', hue: 3 }] } });
        const r = (await p.evaluate(`(() => {
          const cs = getComputedStyle(document.documentElement);
          const tok = (n) => cs.getPropertyValue(n).trim().toLowerCase();
          const rgb = (h) => 'rgb(' + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
          const palette = Array.from({ length: 8 }, (_, i) => rgb(tok('--tab-' + (i + 1))));
          const bad = ['--gold-1', '--gold-2', '--azure-1', '--azure-2'].map((n) => rgb(tok(n))).concat(['rgb(242, 230, 0)', 'rgb(252, 218, 45)']);
          const marks = [...document.querySelectorAll('.folio .card-tab .tab-mark')].map((m) => getComputedStyle(m).backgroundColor);
          return { marks, palette, bad };
        })()`)) as { marks: string[]; palette: string[]; bad: string[] };
        if (r.marks.length !== 4) return fail(`${theme}: меток ${r.marks.length}`);
        if (new Set(r.marks).size !== 4) return fail(`${theme}: цвета меток повторяются: ${r.marks.join(', ')}`);
        if (r.marks.some((m) => !r.palette.includes(m))) return fail(`${theme}: цвет не из палитры вкладок: ${r.marks.join(', ')}`);
        if (r.marks.some((m) => r.bad.includes(m))) return fail(`${theme}: цвет ленты или связи у метки`);
        out.push(`${theme}: ${r.marks.join(' ')}`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 893,
    title: 'Решение 91, клавиатура: вкладки — список кнопок с aria-expanded; «×» — отдельная кнопка «Закрыть вкладку …»; Enter раскрывает; Escape сворачивает раскрытую — фокус на её вкладке; «×» с клавиатуры — фокус на соседнюю вкладку',
    run: async (p) => {
      await open(p, '#/solomon', { extra: { tabs: [{ id: 'david', hue: 0 }, { id: 'ruf', hue: 1 }] } });
      const list = p.locator('.folio ul.card-tabs[aria-label="Закреплённые карточки"]');
      if (!(await list.count())) return fail('нет списка «Закреплённые карточки»');
      const kinds = await list.locator(':scope > li > *').evaluateAll((els) => els.map((e) => `${e.tagName}:${e.getAttribute('aria-expanded') ?? ''}:${e.getAttribute('aria-label') ?? ''}`));
      if (kinds.length !== 4 || !kinds.every((k) => k.startsWith('BUTTON'))) return fail(`строки вкладок: ${kinds.join(' | ')}`);
      if (!/^BUTTON:false:Давид/.test(kinds[0]) || !/^BUTTON::Закрыть вкладку: Давид/.test(kinds[1])) return fail(`вкладка Давида: ${kinds.slice(0, 2).join(' | ')}`);
      // Tab: вкладка → её «×» → следующая вкладка
      await list.locator('.tab-open').first().focus();
      await p.keyboard.press('Tab');
      const a1 = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      await p.keyboard.press('Tab');
      const a2 = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
      if (!/^Закрыть вкладку: Давид/.test(a1) || !/^Руфь/.test(a2)) return fail(`порядок Tab: «${a1}» → «${a2}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'ruf' || (await tabs(p)) !== 'david ruf*') return fail(`Enter: ${hashId(p)}; ${await tabs(p)}`);
      // Escape из карточки — раскрытая закреплённая сворачивается, фокус на её вкладке (корешок)
      await p.locator('#title-ruf').focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(700);
      const f = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.closest('[data-id]')?.getAttribute('data-id') ?? document.activeElement?.tagName ?? '');
      if (hashId(p) || f !== 'ruf') return fail(`Escape: выбрано «${hashId(p)}», фокус на «${f}»`);
      // «×» вкладки с клавиатуры (на листе с карточкой) — фокус на соседнюю вкладку
      await hop(p, 'solomon');
      await p.locator('.folio .card-tab[data-id="david"] .close').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(500);
      const g = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.closest('[data-id]')?.getAttribute('data-id') ?? '');
      if ((await tabs(p)) !== 'ruf' || g !== 'ruf') return fail(`после «×» Давида: вкладки ${await tabs(p)}, фокус на «${g}»`);
      const news = await p.locator('.folio [role="status"]').first().innerText();
      return /Вкладка закрыта: Давид/.test(news) ? pass(`Tab: ${a1} → ${a2}; живая строка: «${news}»`) : fail(`живая строка: «${news}»`);
    },
  },
  {
    n: 894,
    title: 'Решение 91: вкладки помнятся в браузере — после перезагрузки те же, в том же порядке и цвете; лицо не выбрано — корешок 56 px с подписью «вкладки» и именами; щелчок раскрывает карточку',
    run: async (p) => {
      await open(p, '#/ruf');
      await pin(p);
      await hop(p, 'david');
      await pin(p);
      await hop(p, 'moisey');
      await pin(p);
      const before = await p.evaluate(() => localStorage.getItem('toledot:tabs'));
      await p.reload();
      await p.waitForTimeout(2400);
      const after = await p.evaluate(() => localStorage.getItem('toledot:tabs'));
      if (!before || before !== after) return fail(`память: ${before} → ${after}`);
      if ((await tabs(p)) !== 'ruf david moisey*') return fail(`вкладки после перезагрузки: ${await tabs(p)}`);
      const hues = await p.locator('.folio .card-tab').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.hue));
      if (hues.join(' ') !== '1 2 3') return fail(`цвета: ${hues.join(' ')}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(800);
      const sp = await p.locator('.folio.spine.tabs-only').boundingBox();
      if (!sp || Math.abs(sp.width - 56) > 1) return fail(`корешок вкладок: ${sp?.width}`);
      const cap = (await p.locator('.folio.spine.tabs-only .sp-cap').innerText()).trim();
      const names = (await p.locator('.folio.spine .spine-tabs .nm').allInnerTexts()).map((t) => t.trim());
      if (cap !== 'вкладки' || names.join(' ') !== 'Руфь Давид Моисей') return fail(`корешок: «${cap}» ${names.join(', ')}`);
      await p.locator('.folio.spine .spine-tabs [data-id="david"] .tab-open').click();
      await p.waitForTimeout(1200);
      return hashId(p) === 'david' && (await tabs(p)) === 'ruf david* moisey' ? pass(after) : fail(`после щелчка: ${hashId(p)}; ${await tabs(p)}`);
    },
  },
  {
    n: 895,
    title: 'Решение 91, 390 × 844: «Закрепить» — в шапке листа (≥ 44 px, имя для диктора полное); вкладки строками над листом по 44 px; больше трёх — прокрутка внутри, лист не закрыт; лицо не выбрано — строки над полосой времени; касание раскрывает',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/ruf', { extra: { tabs: [{ id: 'david', hue: 0 }, { id: 'avraam', hue: 1 }, { id: 'moisey', hue: 2 }, { id: 'sarra', hue: 3 }] } });
      const b = p.locator('.folio .sheet-bar .pin-card');
      if (!(await b.count())) return fail('в шапке листа нет «Закрепить»');
      const bb = (await b.boundingBox())!;
      if (bb.height < 44 || (await b.getAttribute('aria-label')) !== 'Закрепить карточку персонажа' || (await b.innerText()).trim() !== 'Закрепить') return fail(`«Закрепить»: ${bb.height} px, «${await b.innerText()}»`);
      await b.tap();
      await p.waitForTimeout(300);
      if ((await tabs(p)) !== 'david avraam moisey sarra ruf*') return fail(`вкладки: ${await tabs(p)}`);
      const r = await p.evaluate(`(() => {
        const ul = document.querySelector('.folio .card-tabs'); const u = ul.getBoundingClientRect();
        const bar = document.querySelector('.folio .sheet-bar').getBoundingClientRect();
        const rows = [...ul.querySelectorAll('.tab-open')].map((x) => Math.round(x.getBoundingClientRect().height));
        return { above: u.bottom <= bar.top + 2, scroll: ul.scrollHeight > ul.clientHeight + 4, h: Math.round(u.height), rows };
      })()`) as { above: boolean; scroll: boolean; h: number; rows: number[] };
      if (!r.above || !r.scroll || r.h > 150 || r.rows.some((h) => h < 44)) return fail(`строки над листом: ${JSON.stringify(r)}`);
      await p.locator('.folio .card-tabs .tab-open', { hasText: 'Давид' }).tap();
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'david') return fail(`касание выбрало «${hashId(p)}»`);
      await p.locator('.folio .sheet-bar .close').first().tap();
      await p.waitForTimeout(900);
      const only = await p.evaluate(`(() => { const a = document.querySelector('.folio.tabs-only'); const s = document.querySelector('.strip'); if (!a || !s) return null; return Math.round(s.getBoundingClientRect().top - a.getBoundingClientRect().bottom); })()`);
      if (hashId(p) || only === null || Math.abs(only as number) > 2) return fail(`без выбора: ${hashId(p)}; зазор до полосы ${only}`);
      await p.locator('.folio.tabs-only .tab-open', { hasText: 'Моисей' }).tap();
      await p.waitForTimeout(1200);
      return hashId(p) === 'moisey' ? pass(`строк ${r.rows.length}, видно ${r.h} px`) : fail(`касание без выбора: «${hashId(p)}»`);
    },
  },
  {
    n: 896,
    title: 'Решение 91, 1024 × 768: на узком листе — «Закрепить» (имя для диктора полное), команды полосы не наезжают на имя; вкладки во всю ширину листа, без горизонтальной прокрутки',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await open(p, '#/iosif-muzh-marii', { extra: { tabs: [{ id: 'doch-faraona-zhena-solomona', hue: 0 }, { id: 'iosif', hue: 1 }] } });
      const b = p.locator('.folio .folio-bar .pin-card');
      const vis = (await b.innerText()).trim();
      if (vis !== 'Закрепить' || (await b.getAttribute('aria-label')) !== 'Закрепить карточку персонажа') return fail(`на узком листе: «${vis}»`);
      const r = await p.evaluate(`(() => {
        const nm = document.querySelector('.folio .mast h2 .nm').getBoundingClientRect();
        const c = document.querySelector('.folio .bar-cmds').getBoundingClientRect();
        // поле строчного блока имени выше глифов (интерлиньяж 40 px при кегле 34): до 6 px по вертикали — не наезд
        const cross = nm.right > c.left && nm.left < c.right && Math.min(nm.bottom, c.bottom) - Math.max(nm.top, c.top) > 6;
        const f = document.querySelector('.folio');
        const rows = [...document.querySelectorAll('.folio .card-tab .tab-open')].map((x) => x.scrollWidth <= x.clientWidth + 1);
        return { cross, hscroll: f.scrollWidth > f.clientWidth + 1, rows };
      })()`) as { cross: boolean; hscroll: boolean; rows: boolean[] };
      if (r.cross) return fail('команды полосы наезжают на имя');
      if (r.hscroll || r.rows.some((x) => !x)) return fail(`прокрутка вбок: ${JSON.stringify(r)}`);
      return pass('«Закрепить»; имя под командами; строки вкладок в листе');
    },
  },
  {
    n: 897,
    title: 'Решение 91: «Разворот» остаётся как был — при закреплённых вкладках «Разворот с…» открывает две карточки рядом; вкладки после разворота прежние',
    run: async (p) => {
      await open(p, '#/david', { extra: { tabs: [{ id: 'ruf', hue: 0 }] } });
      await p.locator('.folio .actions button', { hasText: 'Разворот с…' }).click();
      await p.waitForTimeout(300);
      await p.click('#find');
      await p.fill('#find', 'Соломон');
      await p.waitForTimeout(400);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      const n = await p.locator('.spread .mast h2').count();
      if (n !== 2) return fail(`в развороте карточек: ${n}`);
      const names = (await p.locator('.spread .mast h2').allInnerTexts()).map((t) => t.trim());
      const st = await p.evaluate(() => localStorage.getItem('toledot:tabs'));
      return /ruf/.test(st ?? '') ? pass(names.join(' | ')) : fail(`вкладки после разворота: ${st}`);
    },
  },
  {
    n: 898,
    title: 'Решение 91, axe (WCAG 2.2 AA): лист с вкладками ночью и днём, корешок вкладок и строки вкладок телефона — 0 нарушений; живая строка объявляет закрепление',
    run: async (p) => {
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/solomon', { theme, extra: { tabs: [{ id: 'david', hue: 0 }, { id: 'ruf', hue: 5 }] } });
        await pin(p);
        const news = await p.locator('.folio [role="status"]').first().innerText();
        if (!/Карточка закреплена.*Соломон/.test(news)) return fail(`живая строка: «${news}»`);
        out.push(...(await axeOn(p, '.folio')).map((v) => `${theme}: ${v}`));
        await p.keyboard.press('Escape');
        await p.waitForTimeout(700);
        out.push(...(await axeOn(p, '.folio.spine')).map((v) => `${theme}, корешок: ${v}`));
      }
      return out.length ? fail(out.slice(0, 4).join('; ')) : pass('0 нарушений: лист, корешок; ночь и день');
    },
  },
  {
    n: 899,
    title: 'Решение 91, § 5.6: вкладки и полоса — без теней, скруглений, прописных, моноширинных, «·», «→»; ночью и днём, 1440 и 390; снимки .ui-shots/s2/preview-tabs-*.png',
    run: async (p) => {
      mkdirSync(PREVIEW, { recursive: true });
      const out: string[] = [];
      const tb = { tabs: [{ id: 'david', hue: 0 }, { id: 'ruf', hue: 1 }, { id: 'naama', hue: 2 }] };
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/ruf', { theme, extra: tb });
        out.push(...(await templateIssues(p, ['.folio .card-tabs', '.folio .folio-bar'])));
        await p.screenshot({ path: join(PREVIEW, `preview-tabs-1440-${theme}.png`) });
      }
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
      const q = await ctx.newPage();
      await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
      await q.goto(p.url().replace(/[?#].*$/, ''));
      await q.waitForTimeout(800);
      for (const theme of ['night', 'day'] as const) {
        await open(q, '#/ruf', { theme, extra: tb });
        out.push(...(await templateIssues(q, ['.folio .card-tabs', '.folio .sheet-bar'])));
        await q.screenshot({ path: join(PREVIEW, `preview-tabs-390-${theme}.png`) });
      }
      await ctx.close();
      return out.length ? fail(out.slice(0, 4).join('; ')) : pass('без нарушений § 5.6');
    },
  },

  // ---------- решение 92: родство полно ----------
  {
    n: 900,
    title: 'Решение 92, Соломон: «Родство» — «Жена: Дочь фараона», «Мать сына: Наама», дети по союзам «от Наамы — Ровоам; мать не названа — Тафафь, Васемафа»; § 9 — «Наама, Аммонитянка — мать Ровоама» со стихом 3 Цар 14:21',
    run: async (p) => {
      if (!(await dot(p, 'solomon'))) return fail('звезда Соломона не на экране');
      const rows = await kin(p);
      await moreAll(p);
      const all = await kin(p);
      const sp = row(all, 'spouses');
      const co = row(all, 'coparents');
      const ch = row(all, 'children');
      if (sp?.label !== 'Жена' || !/^Дочь фараона/.test(sp.text) || /Наама/.test(sp.text)) return fail(`супруги: ${JSON.stringify(sp)}`);
      if (co?.label !== 'Мать сына' || co.text !== 'Наама') return fail(`мать сына: ${JSON.stringify(co)}`);
      if (!ch || !/^от Наамы — Ровоам; мать не названа — Тафафь, Васемафа$/.test(ch.text)) return fail(`дети: ${JSON.stringify(ch)}`);
      const s9 = await sec(p, 9);
      if (!/Наама, Аммонитянка — мать Ровоама ?3 Цар 14:21/.test(s9)) return fail(`§ 9: «${s9.slice(0, 200)}»`);
      if (/Наама[^.;]*— жена/.test(s9)) return fail('§ 9 называет Нааму женой');
      return pass(`${rows.map((r) => r.label).join(', ')}; § 9: Наама — мать Ровоама`);
    },
  },
  {
    n: 901,
    title: 'Решение 92, Иуда: «Жена: Дочь Шуи», «Мать сыновей: Фамарь» — словами текста, без «жена»; дети по союзам «от Фамари — Фарес, Зара; от дочери Шуи — Ир, Онан, Шела» (решение 104: союз линии — первым); § 9 — «Фамарь, невестка Иуды — мать Фареса и Зары»',
    run: async (p) => {
      if (!(await dot(p, 'iuda'))) return fail('звезда Иуды не на экране');
      await moreAll(p);
      const all = await kin(p);
      const sp = row(all, 'spouses');
      const co = row(all, 'coparents');
      const ch = row(all, 'children');
      if (sp?.label !== 'Жена' || sp.text !== 'Дочь Шуи') return fail(`супруги: ${JSON.stringify(sp)}`);
      if (co?.label !== 'Мать сыновей' || co.text !== 'Фамарь') return fail(`мать сыновей: ${JSON.stringify(co)}`);
      // этап 13, решение 104 (X4 § 2.2 п. 3; CARD-57): союз с ребёнком линии Мессии (Фарес) — первым; внутри — порядок текста
      if (!ch || ch.text !== 'от Фамари — Фарес, Зара; от дочери Шуи — Ир, Онан, Шела') return fail(`сыновья: ${JSON.stringify(ch)}`);
      const s9 = await sec(p, 9);
      if (!/Фамарь, невестка Иуды — мать Фареса и Зары/.test(s9)) return fail(`§ 9: «${s9.slice(0, 240)}»`);
      if (/Фамарь[^.;]*— жена/.test(s9)) return fail('§ 9 называет Фамарь женой');
      return pass(`${co.label}: ${co.text}; ${ch.text}`);
    },
  },
  {
    n: 902,
    title: 'Решение 92, Лот: дочери — «Матери детей: Старшая дочь Лота (мать Моава), Младшая дочь Лота (мать Бен-Амми)», без слова «жена»; дети по союзам; § 9 — «Старшая дочь Лота — мать Моава» (Быт 19:36–37)',
    run: async (p) => {
      if (!(await dot(p, 'lot'))) return fail('звезда Лота не на экране');
      await moreAll(p);
      const all = await kin(p);
      const sp = row(all, 'spouses');
      const co = row(all, 'coparents');
      const ch = row(all, 'children');
      if (sp?.label !== 'Жена' || sp.text !== 'Жена Лота') return fail(`супруги: ${JSON.stringify(sp)}`);
      if (co?.label !== 'Матери детей' || co.text !== 'Старшая дочь Лота (мать Моава), Младшая дочь Лота (мать Бен-Амми)') return fail(`матери: ${JSON.stringify(co)}`);
      if (!ch || !/от старшей дочери Лота — Моав; от младшей дочери Лота — Бен-Амми$/.test(ch.text)) return fail(`дети: ${JSON.stringify(ch)}`);
      const s9 = await sec(p, 9);
      if (!/Старшая дочь Лота — мать Моава ?Быт 19:3/.test(s9) || !/Младшая дочь Лота — мать Бен-Амми/.test(s9)) return fail(`§ 9: «${s9.slice(0, 260)}»`);
      if (/дочь Лота[^.;]*— жена/.test(s9)) return fail('§ 9 называет дочь Лота женой');
      return pass(co.text);
    },
  },
  {
    n: 903,
    title: 'Решение 92, Каин и Ной: неназванная жена, которую текст упоминает, — «Жена: имя в Писании не названо, Быт 4:17»; у Ноя — со стихами ковчега; § 9 Каина — запись со стихом',
    run: async (p) => {
      if (!(await dot(p, 'kain'))) return fail('звезда Каина не на экране');
      const k = row(await kin(p), 'spouses');
      if (k?.label !== 'Жена' || k.text !== 'имя в Писании не названо, Быт 4:17') return fail(`Каин: ${JSON.stringify(k)}`);
      const s9 = await sec(p, 9);
      if (!/Жена не названа по имени.*Быт 4:17/.test(s9)) return fail(`§ 9 Каина: «${s9}»`);
      if (!(await dot(p, 'noy'))) return fail('звезда Ноя не на экране');
      const n = row(await kin(p), 'spouses');
      if (n?.label !== 'Жена' || !/^имя в Писании не названо, Быт 6:18/.test(n.text)) return fail(`Ной: ${JSON.stringify(n)}`);
      // у Сифа жену текст не упоминает — строки нет
      if (!(await dot(p, 'sif'))) return fail('звезда Сифа не на экране');
      const s = row(await kin(p), 'spouses');
      return s ? fail(`Сиф: ${JSON.stringify(s)}`) : pass(`Каин: ${k.text}; Ной: ${n.text}`);
    },
  },
  {
    n: 904,
    title: 'Решение 92, Давид: «Жёны: Мелхола, Ахиноама и ещё 6» — «ещё 6» раскрывает всех восьмерых; дети по союзам — все 22, включая «мать не названа — …»; ничего не обрезано молча',
    run: async (p) => {
      if (!(await dot(p, 'david'))) return fail('звезда Давида не на экране');
      const first = row(await kin(p), 'spouses');
      if (!first || !/^Мелхола, Ахиноама и ещё 6$/.test(first.text)) return fail(`жёны до раскрытия: ${JSON.stringify(first)}`);
      await moreAll(p);
      const all = await kin(p);
      const sp = row(all, 'spouses')!;
      const wives = sp.text.split(', ');
      if (wives.length !== 8 || wives[7] !== 'Вирсавия') return fail(`жёны: ${sp.text}`);
      const ch = row(all, 'children')!;
      const kids = await p.locator(':is(.sky .dotcard, .folio .kin-col) .dc-row.children .person').count();
      if (kids !== 22) return fail(`детей в строке: ${kids} (${ch.text})`);
      // этап 13, решение 104 (X4 § 2.2 п. 3; CARD-57): союз с ребёнком линии (Вирсавия — Соломон, Нафан) — первым
      if (!/^от Вирсавии — Сын Давида и Вирсавии, Самус, Совав, Нафан, Соломон; от Ахиноамы — Амнон; от Авигеи — Далуиа;/.test(ch.text) || !/мать не названа — Евеар/.test(ch.text)) return fail(`дети: ${ch.text}`);
      return pass(`8 жён, 22 ребёнка по союзам`);
    },
  },
  {
    n: 905,
    title: 'Решение 92, Иаков, Авраам, Исав: все жёны и все дети по союзам (от Лии, Рахили, Валлы, Зелфы; от Сарры, Агари, Хеттуры; от Ады, Махалафы, Оливемы)',
    run: async (p) => {
      const want: Record<string, { sp: string; ch: RegExp; n: number }> = {
        iakov: { sp: 'Лия, Рахиль, Валла (наложница), Зелфа', ch: /^от Лии — Рувим.*; от Рахили — Иосиф, Вениамин; от Валлы — Дан, Неффалим; от Зелфы — Гад, Асир; Манассия \(приёмный\), Ефрем \(приёмный\)$/, n: 15 },
        // этап 13, решение 104: внутри группы — порядок текста (Быт 25:2: Зимран, Иокшан, Медан, Мадиан, Ишбак, Шуах)
        avraam: { sp: 'Сарра, Агарь, Хеттура (наложница)', ch: /^от Сарры — Исаак; от Агари — Измаил; от Хеттуры — Зимран, Иокшан, Медан, Мадиан, Ишбак, Шуах$/, n: 8 },
        isav: { sp: 'Иегудифа, Ада, Махалафа, Оливема', ch: /^от Ады — Елифаз; от Махалафы — Рагуил; от Оливемы — Иеус, Иеглом, Корей$/, n: 5 },
      };
      const out: string[] = [];
      for (const [id, w] of Object.entries(want)) {
        if (!(await dot(p, id))) return fail(`звезда ${id} не на экране`);
        await moreAll(p);
        const all = await kin(p);
        const sp = row(all, 'spouses');
        const ch = row(all, 'children');
        if (sp?.text !== w.sp) return fail(`${id}, жёны: ${sp?.text}`);
        if (!ch || !w.ch.test(ch.text)) return fail(`${id}, дети: ${ch?.text}`);
        const n = await p.locator(':is(.sky .dotcard, .folio .kin-col) .dc-row.children .person').count();
        if (n !== w.n) return fail(`${id}: детей ${n}, а не ${w.n}`);
        out.push(`${id}: ${n}`);
      }
      return pass(out.join(', '));
    },
  },
  {
    n: 906,
    title: 'Решение 92, со стороны матери: Наама — «Отец сына: Соломон», не «Муж»; Фамарь — «Мужья: Ир, Онан», «Отец сыновей: Иуда»; § 9 Наамы — «Соломон — отец Ровоама»',
    run: async (p) => {
      if (!(await dot(p, 'naama'))) return fail('звезда Наамы не на экране');
      const a = await kin(p);
      if (row(a, 'spouses')) return fail(`у Наамы строка супругов: ${JSON.stringify(row(a, 'spouses'))}`);
      const c = row(a, 'coparents');
      if (c?.label !== 'Отец сына' || c.text !== 'Соломон') return fail(`Наама: ${JSON.stringify(c)}`);
      const s9 = await sec(p, 9);
      if (!/Соломон — отец Ровоама/.test(s9) || /Соломон — муж/.test(s9)) return fail(`§ 9 Наамы: «${s9}»`);
      if (!(await dot(p, 'famar'))) return fail('звезда Фамари не на экране');
      const b = await kin(p);
      const sp = row(b, 'spouses');
      const co = row(b, 'coparents');
      if (sp?.label !== 'Мужья' || sp.text !== 'Ир, Онан' || co?.label !== 'Отец сыновей' || co.text !== 'Иуда') return fail(`Фамарь: ${JSON.stringify([sp, co])}`);
      return pass('Наама: Отец сына — Соломон; Фамарь: Мужья — Ир, Онан; Отец сыновей — Иуда');
    },
  },
  {
    n: 907,
    title: 'Решение 92, 390 × 844: «Родство» на листе 214 px — не вошедшие строки названы «всё родство — ещё N строк», а не обрезаны молча; касание поднимает лист к разделам родства',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/david');
      const sheet = p.locator('.folio .sheet-dot');
      if (!(await sheet.count())) {
        // лист на 214 px — после касания звезды; адрес открывает лист выше
        await p.evaluate(() => {
          const b = document.querySelector<HTMLElement>('.folio .bar-toggle');
          if (b && b.getAttribute('aria-expanded') === 'true') b.click();
        });
        await clickStar(p, 'david');
      }
      const more = p.locator('.folio .sheet-dot .dc-row.all .dc-more');
      if (!(await more.count())) return fail('на листе 214 px нет «всё родство — ещё N строк»');
      const t = (await more.innerText()).replace(/\s+/g, ' ').trim();
      if (!/^всё родство — ещё \d+ строк/.test(t)) return fail(`команда: «${t}»`);
      await more.tap();
      await p.waitForTimeout(1000);
      const st = await p.locator('.app > .folio').getAttribute('data-stop');
      const vis = await p.evaluate(`(() => { const s = document.querySelector('.folio #sec-6, .folio #sec-9'); if (!s) return false; const r = s.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()`);
      return st === 'half' && vis ? pass(t) : fail(`лист «${st}», раздел родства на экране: ${vis}`);
    },
  },
  {
    n: 908,
    title: 'Решение 92: карточка связи из «Родства» Соломона (Enter на «Наама») — «Соломон и Наама: Ровоам», концы «отец» и «мать», без «муж» и «жена»',
    run: async (p) => {
      if (!(await dot(p, 'solomon'))) return fail('звезда Соломона не на экране');
      await kin(p);
      const nm = p.locator(':is(.sky .dotcard, .folio .kin-col) .dc-row.coparents .person', { hasText: 'Наама' });
      if (!(await nm.count())) return fail('в «Родстве» нет Наамы');
      await nm.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const card = p.locator(':is(.sky .dotcard[data-kind="link"], aside.folio[data-link] .dotcard)');
      if (!(await card.count())) return fail('карточка связи не открылась');
      const txt = flat(await card.innerText());
      if (/(^|\s)(муж|жена)(\s|$|,)/.test(txt)) return fail(`в карточке связи — «муж» или «жена»: ${txt.slice(0, 200)}`);
      return /Соломон и Наама: Ровоам/.test(txt) && /(^|\s)отец(\s|$)/i.test(txt) && /(^|\s)мать(\s|$)/i.test(txt) ? pass(txt.slice(0, 120)) : fail(`карточка связи: ${txt.slice(0, 200)}`);
    },
  },
  {
    n: 909,
    title: 'Решение 92, все 17 пар «отец + мать ребёнка», где мать не записана супругой: в § 9 отца — «<мать> — мать <ребёнка>» со стихом и без «жена»',
    run: async (p) => {
      const bad: string[] = [];
      let seen = 0;
      for (const [father, , name] of PAIRS) {
        await open(p, `#/${father}`, { ms: 1800 });
        const s9 = await sec(p, 9);
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // строка: имя, уточнение, «— мать …» (у описательного имени «Мать Иеффая» — без неё), стих
        const ok = new RegExp(`${esc}[^\\n]{0,90}?[А-Я][а-я]+ \\d+:\\d+`).test(s9);
        if (!ok) bad.push(`${father}: «${s9.slice(0, 160)}»`);
        else if (new RegExp(`${esc}[^.;]{0,40}— (жена|наложница)`).test(s9)) bad.push(`${father}: ${name} — жена`);
        else seen++;
      }
      return bad.length ? fail(bad.slice(0, 3).join(' | ')) : pass(`${seen} из ${PAIRS.length}`);
    },
  },
];
