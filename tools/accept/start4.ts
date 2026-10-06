/**
 * Сценарии приёмки: раскрытие родословия и союзы (решения 67–72), группа start4: номера 540–559, пять начал, органы
 * и условные знаки (задача M3): выбор начала во вступлении (широкий, невысокий, телефон, 320 px), «Начать заново» в листе
 * «Вид», в «Ещё», в «Разделах» телефона и в панели «Набор» с подтверждением, группы панели «Набор» после раскрытия,
 * «Условные знаки» и «О карте».
 *
 * Этап 11 (решения 77, 81; задача Q3): древа и строки «Раскрыто N лиц» больше нет. «С Адама» и «С Иисуса Христа» —
 * набор с одного лица и его карточка у звезды; «Родословие Иисуса Христа», «Ключевые лица» и «Всё небо» — одноимённые
 * показы, набор они не трогают. Что на небе, говорит строка показа «На небе: …» (html[data-show] — ключ показа,
 * src/ui/show.ts). Панель «В работе» называется «Набор».
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

// этап 13 (решение 110): начало и показ линий — «Родословие Иисуса Христа (Мф 1, Лк 3)»
// этап 16 (решение 187): шестое начало — «Рассказ: от Адама до Иисуса Христа»; этап 21 (решение 200): первое — «Адам
// и Иисус Христос», начало нового читателя
const NAMES = ['Адам и Иисус Христос', 'С Адама', 'С Иисуса Христа', 'Родословие Иисуса Христа (Мф 1, Лк 3)', 'Ключевые лица', 'Всё небо', 'Рассказ: от Адама до Иисуса Христа'];
const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();

/** Открыть заново с памятью браузера: вступление открыто или свёрнуто, начало не выбрано или выбрано. */
async function fresh(p: Page, o: { intro?: boolean; start?: string | null; extra?: Record<string, unknown> } = {}, hash = '#/', ms = 2200) {
  await p.evaluate(
    ([intro, start, extra]) => {
      localStorage.setItem('toledot:cartouche', intro ? 'open' : 'folded');
      if (start) localStorage.setItem('toledot:start', JSON.stringify(start));
      else localStorage.removeItem('toledot:start');
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) localStorage.setItem(`toledot:${k}`, JSON.stringify(v));
      sessionStorage.clear();
    },
    [!!o.intro, o.start ?? null, o.extra ?? {}] as const,
  );
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?s4=${Date.now()}${hash}`);
  await p.waitForTimeout(ms);
}
/** Что показывает небо: «work» — набор, «all» — все лица (холст пишет режим в data-mode). */
const mode = (p: Page) => p.evaluate(() => (document.querySelector('.sky canvas') as HTMLElement | null)?.dataset.mode ?? '');
/** Ключ показа неба (src/ui/show.ts пишет его в html[data-show]): «a» — всё небо, «l» — линии, «k» — ключевые, «s» — набор. */
const showOf = (p: Page) => p.evaluate(() => document.documentElement.dataset.show ?? '');
/** Набор из памяти браузера: id по порядку. */
const work = async (p: Page) => ((await p.evaluate(() => JSON.parse(localStorage.getItem('toledot:work') ?? '[]'))) as [string, unknown][]).map((r) => r[0]);
const startOf = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('toledot:start') ?? 'null') as string | null);
/**
 * Строка показа у кромки неба (этап 11; на месте прежней строки «Раскрыто N лиц»): текст, команды, высота. Этап 21
 * (решение 199): под ней — своя строка шагов («Отменить шаг», «К началу»); строка показа — без неё: текст, команды и
 * высота до строки шагов.
 */
async function showBar(p: Page) {
  return (await p.evaluate(`(() => {
    const b = document.querySelector('.skytop .showbar');
    if (!b) return null;
    const vis = (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    const r = b.getBoundingClientRect();
    const steps = b.querySelector('.sb-steps');
    const bottom = steps ? steps.getBoundingClientRect().top : r.bottom;
    const own = (e) => !e.closest('.sb-steps');
    const over = [...b.querySelectorAll('*')].filter(own).some((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'hidden');
    const text = [...b.childNodes].filter((n) => !(n.nodeType === 1 && n.closest('.sb-steps'))).map((n) => n.textContent).join('');
    return { text: text.replace(/\s*—\s*/g, ' — '), cut: over ? 1 : 0, h: bottom - r.top, l: r.left, r: r.right, W: innerWidth,
      cmds: [...b.querySelectorAll('.sb-cmd')].filter(vis).filter(own).map((x) => x.textContent.trim()) };
  })()`)) as { text: string; cut: number; h: number; l: number; r: number; W: number; cmds: string[] } | null;
}
/** Карточка у звезды лица id открыта (решение 77): диалог .dotcard вида «лицо» с его именем. */
const cardAt = (p: Page, name: string) =>
  p.evaluate((nm) => [...document.querySelectorAll('.dotcard[data-kind="person"][data-placed], .sheet-dot .dotcard, aside.folio:has(.kin-col) .mast')].some((c) => c.querySelector('.nm')?.textContent?.trim() === nm), name);
/** Кнопки начал в элементе sel: названия, текущее, размеры. */
async function starts(p: Page, sel: string) {
  return (await p.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)} + ' .starts button')].map((b) => {
    const q = b.getBoundingClientRect();
    const n = b.querySelector('.note');
    return { t: b.getAttribute('aria-label'), cur: b.getAttribute('aria-current') === 'true', l: q.left, r: q.right, top: q.top, h: q.height, w: q.width,
      note: n && getComputedStyle(n).display !== 'none' ? n.textContent : '' };
  })`)) as { t: string; cur: boolean; l: number; r: number; top: number; h: number; w: number; note: string }[];
}
const labels = (xs: { t: string }[]) => xs.map((x) => x.t).join('|');
/** Раскрытие Адам → союз с Евой → Каин → его союз (Енох): память браузера, как после щелчков по союзам. */
const fam = (of: string) => ({ via: 'family', of });
const ADAM_KAIN = {
  work: [['adam', { via: 'self', of: 'adam' }], ['eva', fam('adam')], ['kain', fam('adam')], ['avel', fam('adam')], ['sif', fam('adam')], ['enokh-syn-kaina', fam('kain')]],
  reveal: { opened: ['adam', 'kain'], expanded: { 'u:adam+eva': 'adam', 'u:kain+': 'kain' } },
};

/** Экранная точка звезды лица id (скрытый список лиц неба пишет её в data-x, data-y; px холста). */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  return (await p.evaluate(`(() => {
    const b = document.getElementById(${JSON.stringify(`sky-star-${id}`)});
    if (b && !b.dataset.x) return null;
    const c = document.querySelector('.sky canvas');
    if (!b || !c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + Number(b.dataset.x), y: r.top + Number(b.dataset.y) };
  })()`)) as { x: number; y: number } | null;
}

export const start4: Scenario[] = [
  {
    n: 540,
    title: 'Решения 68, 77, 81: первое посещение (1440 × 900) — вступление предлагает пять начал с пояснениями, входы — ниже; «С Адама» сворачивает вступление: набор из одного Адама, у его звезды — карточка, строка показа «На небе: набор — 1 лицо — изменить | всё небо»; «всё небо» — показ всех лиц, набор прежний',
    run: async (p) => {
      await fresh(p, { intro: true });
      if (!(await p.locator('.sky .cartouche').count())) return fail('вступления нет');
      const s = await starts(p, '.cartouche');
      if (labels(s) !== NAMES.join('|')) return fail(`начала: ${labels(s)}`);
      if (s.some((x) => !x.note)) return fail('у начала нет пояснения');
      if (s.some((x) => x.cur)) return fail('при первом посещении начало уже отмечено');
      const entry = await p.locator('.cartouche .entry button').first().boundingBox();
      if (!entry || entry.y < s[s.length - 1].top + s[s.length - 1].h - 1) return fail('быстрые входы не ниже начал');
      if ((await p.locator('.cartouche .entry button').count()) !== 7) return fail('быстрых входов не семь');
      await p.locator('.cartouche .starts button', { hasText: 'С Адама' }).click();
      await p.waitForTimeout(2200);
      if (await p.locator('.cartouche').count()) return fail('вступление не свернулось');
      // этап 11 (решение 77): древа нет — «С Адама» открывает небо «набор» с одним Адамом и его карточкой у звезды
      if (await p.locator('.treearea').count()) return fail('на месте неба — древо');
      if (!(await p.locator('.sky .guide-cmd').count())) return fail('нет «Как читать карту»');
      if ((await startOf(p)) !== 'adam') return fail(`начало в памяти: ${await startOf(p)}`);
      const w = await work(p);
      if (w.join(',') !== 'adam') return fail(`набор: ${w.join(', ')}`);
      if (hashId(p) !== 'adam') return fail(`выбрано «${hashId(p)}»`);
      if ((await showOf(p)) !== 's') return fail(`показ: ${await showOf(p)}`);
      if (!(await cardAt(p, 'Адам'))) return fail('у звезды Адама нет карточки');
      const b = await showBar(p);
      if (!b) return fail('нет строки показа');
      if (!/^На небе: набор — 1 лицо/.test(flat(b.text))) return fail(`строка: «${flat(b.text)}»`);
      if (b.cmds.join('|') !== 'изменить|всё небо') return fail(`команды строки: ${b.cmds.join(' | ')}`);
      // «всё небо» — показ всех лиц; набор остаётся
      await p.locator('.skytop .showbar .sb-cmd', { hasText: 'всё небо' }).click();
      await p.waitForTimeout(1200);
      if ((await showOf(p)) !== 'a' || (await mode(p)) !== 'all') return fail('«всё небо» не показало все лица');
      return (await work(p)).join(',') === 'adam' ? pass() : fail('«всё небо» изменило набор');
    },
  },
  {
    n: 541,
    title: 'Решения 68, 81; UX-56, UX-70: 1024 × 768 и 1366 × 768 — начала в два столбца в пределах вступления, вступление не прокручивается, главная фраза и входы видны; «Родословие Иисуса Христа» — показ «линии Мессии», набор не тронут',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const out: string[] = [];
      for (const [w, h] of [
        [1366, 768],
        [1024, 768],
      ]) {
        await p.setViewportSize({ width: w, height: h });
        await fresh(p, { intro: true });
        const s = await starts(p, '.cartouche');
        if (labels(s) !== NAMES.join('|')) return fail(`${w}: начала: ${labels(s)}`);
        const cols = new Set(s.map((x) => Math.round(x.l))).size;
        const rows = new Set(s.map((x) => Math.round(x.top))).size;
        // этап 16 (решение 187): шесть начал — третье и шестое во всю ширину сетки: 2 + 1 + 2 + 1 = 4 строки
        if (cols !== 2 || rows !== 4) return fail(`${w}: начала ${cols} столбца × ${rows} строки`);
        const r = (await p.evaluate(`(() => {
          const c = document.querySelector('.cartouche'), cb = c.getBoundingClientRect(), l = c.querySelector('.long').getBoundingClientRect();
          const e = [...c.querySelectorAll('.entry button')].map((b) => b.getBoundingClientRect().bottom);
          const over = [...c.querySelectorAll('.starts button')].some((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > cb.right + 0.5);
          return { scroll: c.scrollHeight - c.clientHeight, long: l.bottom <= cb.bottom, entries: Math.max(...e) <= cb.bottom, over };
        })()`)) as { scroll: number; long: boolean; entries: boolean; over: boolean };
        if (r.scroll > 1) return fail(`${w}: вступление прокручивается на ${r.scroll} px`);
        if (!r.long || !r.entries) return fail(`${w}: главная фраза или входы за краем вступления`);
        if (r.over) return fail(`${w}: название начала не помещается в свою клетку`);
        out.push(`${w}: 2 × 4`);
      }
      await p.locator('.cartouche .starts button', { hasText: 'Родословие Иисуса Христа' }).click();
      await p.waitForTimeout(2000);
      // этап 11 (решение 81): «Родословие Иисуса Христа» — показ «линии Мессии», набор не заменяется
      if ((await showOf(p)) !== 'l') return fail(`показ: ${await showOf(p)}`);
      // этап 21 (решение 200): у нового читателя набор — начало «Адам и Иисус Христос»; показ линий его не меняет
      if ((await work(p)).join(' ') !== 'adam iisus') return fail(`набор: ${(await work(p)).join(', ')}`);
      const n = Number(await p.evaluate(() => document.documentElement.dataset.showIds ?? '0'));
      const b = await showBar(p);
      const said = Number(/родословие Иисуса Христа \(Мф 1, Лк 3\) — (\d+)/.exec(flat(b?.text ?? '').replace(/(\d) (\d)/g, '$1$2'))?.[1]);
      if (!(n > 100) || said !== n) return fail(`строка «${flat(b?.text ?? '')}», в показе ${n}`);
      return (await mode(p)) === 'work' ? pass(`${out.join('; ')}; линии — ${n} лиц`) : fail('небо показывает не только линии');
    },
  },
  {
    n: 542,
    title: 'Решения 68, 81: телефон 390 × 844 — начала столбцом, цели 44 px во всю ширину; «Ключевые лица» — показ ключевых лиц; строка показа — одна строка «На небе: ключевые лица — N лиц», без обрезки; «изменить» — лист «Показ», текущий вид отмечен',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await fresh(p, { intro: true });
      const s = await starts(p, '.cartouche');
      if (labels(s) !== NAMES.join('|')) return fail(`начала: ${labels(s)}`);
      if (new Set(s.map((x) => Math.round(x.l))).size !== 1) return fail('начала не столбцом');
      const low = s.filter((x) => x.h < 43.5).map((x) => `${x.t} ${x.h.toFixed(0)}`);
      if (low.length) return fail(`низкие цели: ${low.join(', ')}`);
      const cb = (await p.locator('.cartouche').boundingBox())!;
      if (s.some((x) => x.l < cb.x - 0.5 || x.r > cb.x + cb.width + 0.5)) return fail('начало шире вступления');
      if (s.some((x) => x.w < cb.width * 0.7)) return fail('начало не во всю ширину вступления');
      await p.locator('.cartouche .starts button', { hasText: 'Ключевые лица' }).tap();
      await p.waitForTimeout(2000);
      if ((await showOf(p)) !== 'k') return fail(`показ: ${await showOf(p)}`);
      const n = Number(await p.evaluate(() => document.documentElement.dataset.showIds ?? '0'));
      if (n < 40) return fail(`ключевых лиц: ${n}`);
      const b = await showBar(p);
      if (!b) return fail('нет строки показа');
      if (!/^На небе: ключевые лица — \d+ (лицо|лица|лиц)/.test(flat(b.text))) return fail(`строка: «${flat(b.text)}»`);
      if (b.h > 50) return fail(`строка в ${b.h.toFixed(0)} px — не одна`);
      if (b.cut > 1) return fail('текст строки обрезан');
      if (b.r > b.W + 0.5) return fail('строка за правым краем');
      await p.locator('.skytop .showbar .sb-cmd', { hasText: 'изменить' }).tap();
      await p.waitForTimeout(600);
      const cur = await p.locator('.showsheet input[name="show-kind"]:checked').getAttribute('value');
      if (cur !== 'key') return fail(`в листе «Показ» отмечено «${cur}»`);
      const vh = await p.evaluate(() => innerHeight);
      const sb = (await p.locator('.showsheet').boundingBox())!;
      if (sb.y < 0 || sb.y + Math.min(sb.height, 200) > vh) return fail('лист «Показ» за краем экрана');
      return pass(`${n} ключевых лиц, строка ${b.h.toFixed(0)} px`);
    },
  },
  {
    n: 543,
    title: 'Решение 68, MOB-70: 320 × 568 пальцем — укороченное вступление с командой «С чего начать» (44 px, в пределах таблички, мимо кнопок неба); она открывает лист «Вид» на «Начале»; «С Иисуса Христа» — набор из одного Иисуса Христа, строка показа в одну строку',
    view: { width: 320, height: 568, touch: true },
    run: async (p) => {
      await fresh(p, { intro: true });
      const r = (await p.evaluate(`(() => {
        const box = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, h: q.height }; };
        const c = document.querySelector('.cartouche');
        if (!c) return null;
        const b = [...c.querySelectorAll('button')].find((x) => x.textContent.trim() === 'С чего начать');
        return { low: c.classList.contains('low'), c: box(c), b: b ? box(b) : null, col: [...document.querySelectorAll('.skyctl.column button')].map(box), W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth };
      })()`)) as null | { low: boolean; c: { l: number; r: number; t: number; b: number }; b: { l: number; r: number; t: number; b: number; h: number } | null; col: { l: number; r: number; t: number; b: number }[]; W: number; H: number; sw: number };
      if (!r) return fail('вступления нет');
      if (!r.low) return fail('вступление не укороченное');
      if (!r.b) return fail('нет «С чего начать»');
      if (r.b.h < 43.5) return fail(`«С чего начать» ${r.b.h.toFixed(0)} px`);
      if (r.b.l < r.c.l - 0.5 || r.b.r > r.c.r + 0.5 || r.c.r > r.W + 0.5 || r.c.b > r.H) return fail('команда или табличка за краем');
      if (r.col.some((k) => k.l < r.c.r && r.c.l < k.r && k.t < r.c.b && r.c.t < k.b)) return fail('табличка заходит на кнопки неба');
      if (r.sw > r.W + 1) return fail(`прокрутка вбок: ${r.sw}`);
      await p.locator('.cartouche button', { hasText: 'С чего начать' }).tap();
      await p.waitForTimeout(800);
      if (await p.locator('.sky .cartouche').count()) return fail('вступление не свернулось');
      const sh = await starts(p, '.sky .sheet');
      if (labels(sh) !== NAMES.join('|')) return fail(`лист «Вид»: ${labels(sh)}`);
      const inView = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const q = a?.getBoundingClientRect();
        return !!a?.closest('.sheet .starts') && !!q && q.top >= 0 && q.bottom <= innerHeight;
      });
      if (!inView) return fail('фокус не на начале в листе «Вид» или начало за краем');
      await p.locator('.sky .sheet .starts button', { hasText: 'С Иисуса Христа' }).tap();
      await p.waitForTimeout(1800);
      if (await p.locator('.sky .sheet .starts').count()) return fail('лист «Вид» не закрылся после выбора');
      if ((await work(p)).join(',') !== 'iisus') return fail(`набор: ${(await work(p)).join(', ')}`);
      const b = await showBar(p);
      if (!b) return fail('нет строки показа');
      if (b.h > 50 || b.cut > 1) return fail(`строка ${b.h.toFixed(0)} px, обрезано ${b.cut} px`);
      if (b.r > b.W + 0.5) return fail('строка за правым краем');
      return /^На небе: набор — 1 лицо/.test(flat(b.text)) ? pass(`«${flat(b.text)}»`) : fail(`строка на 320 px: «${flat(b.text)}»`);
    },
  },
  {
    n: 544,
    // этап 21 (решение 200): новый читатель видит пошаговую карту «Адам и Иисус Христос» (прежде — всё небо, решение 68)
    title: 'Решения 68, 81, 200: вступление закрыто, начало не выбрано — пошаговая карта «Адам и Иисус Христос», строка «На небе: набор — 2 лица — изменить | всё небо»; в листе «Вид» — «Начало» без отметки; «Родословие Иисуса Христа» закрывает лист и показывает обе линии',
    run: async (p) => {
      await fresh(p, { intro: false });
      if (await p.locator('.sky .cartouche').count()) return fail('вступление открыто');
      if ((await mode(p)) !== 'work' || (await showOf(p)) !== 's') return fail(`небо: ${await mode(p)}, показ ${await showOf(p)}`);
      if ((await work(p)).join(' ') !== 'adam iisus') return fail(`набор: ${(await work(p)).join(', ')}`);
      const b0 = await showBar(p);
      if (!b0 || !/^На небе: набор — 2 лица — изменить/.test(flat(b0.text))) return fail(`строка показа: «${flat(b0?.text ?? '')}»`);
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(400);
      const s = await starts(p, '.viewpop');
      if (labels(s) !== NAMES.join('|')) return fail(`«Начало»: ${labels(s)}`);
      if (s.some((x) => x.cur)) return fail('начало отмечено, хотя не выбрано');
      const lbl = await p.locator('.viewpop .start-lbl').innerText();
      if (lbl.trim() !== 'Начало') return fail(`подпись: «${lbl}»`);
      // лист не выше неба: верх листа ниже служебной строки рамки
      const vb = (await p.locator('.viewpop').boundingBox())!;
      const sky = (await p.locator('.sky').boundingBox())!;
      if (vb.y < sky.y + 40) return fail(`лист «Вид» выше неба: ${vb.y.toFixed(0)}`);
      await p.locator('.viewpop .starts button', { hasText: 'Родословие Иисуса Христа' }).click();
      await p.waitForTimeout(1600);
      if (await p.locator('.viewpop').count()) return fail('лист «Вид» не закрылся');
      if ((await showOf(p)) !== 'l') return fail(`показ: ${await showOf(p)}`);
      const b = await showBar(p);
      return b && /^На небе: родословие Иисуса Христа \(Мф 1, Лк 3\) — /.test(flat(b.text)) && (await work(p)).join(' ') === 'adam iisus' ? pass(`«${flat(b.text)}»`) : fail(`строка «${flat(b?.text ?? '')}», набор ${(await work(p)).join(' ')}`);
    },
  },
  {
    n: 545,
    title: 'Решения 68, 81: «Начать заново» из листа «Вид» с набором больше одного лица — «С Адама» спрашивает «Набор из N лиц будет заменён — начать заново | отмена»; «отмена» ничего не меняет и возвращает фокус; «начать заново» заменяет набор; показы («Родословие») набор не трогают и не спрашивают',
    run: async (p) => {
      await fresh(p, { intro: false, start: 'adam', extra: ADAM_KAIN });
      const before = await work(p);
      if (before.length !== 6) return fail(`набор до начала: ${before.join(', ')}`);
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(300);
      // показ — без вопроса и без замены набора (этап 11, § 5)
      await p.locator('.viewpop .starts button', { hasText: 'Родословие Иисуса Христа' }).click();
      await p.waitForTimeout(1500);
      if (await p.locator('.viewpop .starts-ask').count()) return fail('«Родословие» спросило подтверждение');
      if ((await work(p)).length !== before.length) return fail('«Родословие» изменило набор');
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(300);
      const s = await starts(p, '.viewpop');
      if (s.find((x) => x.cur)?.t !== 'Родословие Иисуса Христа (Мф 1, Лк 3)') return fail('текущее начало не отмечено');
      await p.locator('.viewpop .starts button', { hasText: 'С Адама' }).click();
      await p.waitForTimeout(300);
      const ask = flat(await p.locator('.viewpop .starts-ask').innerText().catch(() => ''));
      if (ask !== `Набор из ${before.length} лиц будет заменён — начать заново отмена` && ask !== `Набор из ${before.length} лица будет заменён — начать заново отмена`) return fail(`вопрос: «${ask}»`);
      const focus1 = await p.evaluate(() => document.activeElement?.textContent?.trim());
      if (focus1 !== 'начать заново') return fail(`фокус на «${focus1}»`);
      await p.locator('.viewpop .starts-ask button', { hasText: 'отмена' }).click();
      await p.waitForTimeout(300);
      if ((await work(p)).length !== before.length) return fail('«отмена» изменила набор');
      const focus2 = await p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      if (focus2 !== 'С Адама') return fail(`после «отмены» фокус на «${focus2}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      const after = await work(p);
      if (after.join(',') !== 'adam') return fail(`после «начать заново» набор: ${after.slice(0, 5).join(', ')}`);
      if ((await startOf(p)) !== 'adam') return fail('начало не сменилось');
      return (await p.locator('.viewpop').count()) ? fail('лист «Вид» не закрылся') : pass(`набор из ${before.length} лиц заменён Адамом`);
    },
  },
  {
    n: 546,
    // этап 13 (решение 111): «Ещё» — только когда команды не помещаются; «Начать заново» — в «Вид → Начало» и во вступлении
    title: 'Решения 68, 111: на 1440 в строке все панели и «Ещё» нет; «Вид» открывает лист с «Началом», фокус — на текущем начале',
    run: async (p) => {
      await fresh(p, { intro: false, start: 'adam', extra: { work: [['adam', { via: 'self', of: 'adam' }]] } });
      const shown = (await p.locator('.commands > button').allInnerTexts()).map((t) => t.trim());
      for (const c of ['Указатель', 'Главы', 'Эпохи', 'Синопсис', 'Родство', 'Сквозной раздел', 'Условные знаки', 'О карте']) if (!shown.includes(c)) return fail(`в строке нет «${c}»`);
      if (await p.locator('.commands .more').count()) return fail('«Ещё» при 1440, хотя все команды помещаются');
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(400);
      await p.locator('.viewpop .starts button[aria-current="true"]').focus();
      await p.waitForTimeout(200);
      if (!(await p.locator('.viewpop').count())) return fail('лист «Вид» не открылся');
      const f = await p.evaluate(() => ({ in: !!document.activeElement?.closest('.viewpop .starts'), label: document.activeElement?.getAttribute('aria-label'), cur: document.activeElement?.getAttribute('aria-current') }));
      if (!f.in) return fail('фокус не в «Начале»');
      if (f.label !== 'С Адама' || f.cur !== 'true') return fail(`фокус на «${f.label}», а не на текущем начале`);
      // Escape закрывает лист, фокус — на «Вид»
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      return (await p.locator('.viewpop').count()) ? fail('Escape не закрыл лист') : pass();
    },
  },
  {
    n: 547,
    title: 'Решения 68, 81: панель «Набор» — раздел «Начать заново»: пять начал с пояснениями, текущее отмечено; «Всё небо» без вопроса — показ всех лиц, набор прежний',
    run: async (p) => {
      await fresh(p, { intro: false, start: 'key', extra: ADAM_KAIN });
      const n = (await work(p)).length;
      // этап 11 (Я30): панель «В работе» называется «Набор»
      await p.locator('.commands > button', { hasText: 'Набор' }).click();
      await p.waitForTimeout(600);
      const head = p.locator('.sheet h3#work-start');
      if (!(await head.count()) || (await head.innerText()).trim() !== 'Начать заново') return fail('в панели «Набор» нет раздела «Начать заново»');
      const s = await starts(p, '.sheet');
      if (labels(s) !== NAMES.join('|')) return fail(`начала: ${labels(s)}`);
      if (s.find((x) => x.cur)?.t !== 'Ключевые лица') return fail('текущее начало не отмечено');
      if (s.some((x) => !x.note)) return fail('у начала нет пояснения');
      await head.scrollIntoViewIfNeeded();
      await p.locator('.sheet .starts button', { hasText: 'Всё небо' }).click();
      await p.waitForTimeout(900);
      if (await p.locator('.sheet .starts-ask').count()) return fail('«Всё небо» спросило подтверждение');
      if ((await mode(p)) !== 'all' || (await showOf(p)) !== 'a') return fail('небо не «всё небо»');
      if ((await work(p)).length !== n) return fail('«Всё небо» изменило набор');
      return (await startOf(p)) === 'all' ? pass(`набор ${n} лиц сохранён`) : fail('начало не «всё небо»');
    },
  },
  {
    n: 548,
    title: 'Решения 72, 81: раскрытие Адам → Ева, Каин, Авель, Сиф → Каин → Енох — строка показа «На небе: набор — 6 лиц»; в панели «Набор» группы «Адам и его семья (5)» и «Семья Каина (1)»',
    run: async (p) => {
      // адрес вида «набор» (~k1 — прежнее поле, открывается показом «набор») — как его писал атлас после щелчков по союзам
      await fresh(p, { intro: false, start: 'adam', extra: ADAM_KAIN }, '#/~k1');
      if ((await mode(p)) !== 'work' || (await showOf(p)) !== 's') return fail(`небо: ${await mode(p)}, показ ${await showOf(p)}`);
      const b = await showBar(p);
      if (!b || !/^На небе: набор — 6 лиц/.test(flat(b.text))) return fail(`строка: «${flat(b?.text ?? '')}»`);
      await p.locator('.commands > button', { hasText: 'Набор' }).click();
      await p.waitForTimeout(600);
      const heads = (await p.locator('.sheet .wg-head').allInnerTexts()).map(flat);
      if (heads.join(' | ') !== 'Адам и его семья (5) | Семья Каина (1)') return fail(`группы: ${heads.join(' | ')}`);
      const first = (await p.locator('.sheet .wg').first().locator('.wi-row .nm').allInnerTexts()).map((t) => t.trim());
      if (first.join(',') !== 'Адам,Ева,Каин,Авель,Сиф') return fail(`первая группа: ${first.join(', ')}`);
      const notes = await p.locator('.sheet .wg .wi-via').count();
      return notes ? fail(`под именами — строки происхождения (${notes})`) : pass();
    },
  },
  {
    n: 549,
    title: 'Решение 68: телефон — «Меню» → «Начать заново…» открывает лист «Вид» на «Начале»; под открытой панелью «Меню» недоступно (решение 117)',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await fresh(p, { intro: false });
      const open = async (label: string) => {
        await p.locator('.top .sections > button').tap();
        await p.waitForTimeout(250);
        await p.locator('.top .sections [role^="menuitem"]', { hasText: label }).tap();
        await p.waitForTimeout(700);
      };
      await open('Указатель');
      if (!(await p.locator('.app > .sheet').count())) return fail('«Указатель» не открылся');
      // этап 13, решение 117: панель телефона — модальное окно, верхняя строка под ней недоступна; «×» закрывает панель,
      // и «Меню» снова в руках
      if (!(await p.evaluate(() => !!document.querySelector('.app > .top')?.closest('[inert]')))) return fail('под панелью «Меню» доступно');
      await p.locator('.app > .sheet .sheet-head .close').tap();
      await p.waitForTimeout(500);
      const items = (await (async () => {
        await p.locator('.top .sections > button').tap();
        await p.waitForTimeout(250);
        const t = (await p.locator('.top .sections [role^="menuitem"] .nm').allInnerTexts()).map((x) => x.trim());
        await p.keyboard.press('Escape');
        await p.waitForTimeout(200);
        return t;
      })());
      const at = items.indexOf('Начать заново…');
      if (at < 0 || items[at + 1] !== 'Ночь' || items[at - 1] !== 'О хронологии') return fail(`«Меню»: ${items.join(' | ')}`);
      await open('Начать заново…');
      if (await p.locator('.app > .sheet').count()) return fail('панель осталась открытой');
      const sh = await starts(p, '.sky .sheet');
      if (labels(sh) !== NAMES.join('|')) return fail(`лист «Вид»: ${labels(sh)}`);
      const low = sh.filter((x) => x.h < 43.5);
      return low.length ? fail(`низкие цели: ${low.map((x) => x.t).join(', ')}`) : pass();
    },
  },
  {
    n: 550,
    // этап 21 (решение 197): «плюс без числа после имени» стал рукояткой шага — «Плюс в кольце — шаг карты»
    title: 'Решения 67–72, 76–78, 197: «Условные знаки» — союз на небе ромбом, плюс в кольце — шаг карты, подсветка ветвей, пять начал; в «Клавишах» — щелчок по звезде и по ромбу союза, Enter на них; «О карте» — абзац о началах и раскрытии',
    run: async (p) => {
      await fresh(p, { intro: false });
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const t = flat(await p.locator('.app > .sheet').innerText());
      for (const w of ['Союз на небе', 'Плюс в кольце — шаг карты', 'Подсветка ветвей выбранного лица', '«С Иисуса Христа»', '«Начать заново»', 'щелчок по ромбу союза', 'на звезде или ромбе союза', 'щелчок по звезде'])
        if (!t.includes(w)) return fail(`в «Условных знаках» нет «${w}»`);
      await p.locator('.commands > button', { hasText: 'О карте' }).click();
      await p.waitForTimeout(800);
      const a = flat(await p.locator('.app > .sheet').innerText());
      for (const w of ['Начало и раскрытие родословия', '«Родословие Иисуса Христа (Мф 1, Лк 3)»', '«Ключевые лица»', 'только после подтверждения']) if (!a.includes(w)) return fail(`в «О карте» нет «${w}»`);
      return pass();
    },
  },
  {
    n: 551,
    title: 'Решение 68: «дальше атлас открывается как в прошлый раз» — новый сеанс (память сеанса пуста) после раскрытия от Адама открывает показ «набор» со строкой «На небе: набор — 6 лиц»',
    run: async (p) => {
      // fresh очищает память сеанса: как новая вкладка на следующий день
      await fresh(p, { intro: false, start: 'adam', extra: ADAM_KAIN });
      if ((await mode(p)) !== 'work' || (await showOf(p)) !== 's') return fail(`новый сеанс открыл небо «${await mode(p)}» (показ ${await showOf(p)}), а не «набор»`);
      const b = await showBar(p);
      return b && /^На небе: набор — 6 лиц/.test(flat(b.text)) ? pass() : fail(`строка: «${flat(b?.text ?? '')}»`);
    },
  },
  {
    n: 552,
    title: 'Решение 70: меню звезды у лица с показанными точками союзов — «Скрыть союзы на небе»; пункт убирает его точки союзов, лицо остаётся в наборе; у лица без показанных точек союзов пункта нет',
    run: async (p) => {
      await fresh(p, { intro: false, start: 'adam', extra: { ...ADAM_KAIN, reveal: { opened: ['adam', 'kain'], expanded: { 'u:adam+eva': 'adam', 'u:kain+': 'kain' } } } }, '#/~k1', 2800);
      const menuAt = async (id: string) => {
        const at = await starAt(p, id);
        if (!at) return null;
        await p.mouse.click(at.x, at.y, { button: 'right' });
        await p.waitForTimeout(400);
        return (await p.locator('.skymenu [role^="menuitem"]').allInnerTexts()).map((t) => flat(t));
      };
      const opened = async () => ((await p.evaluate(() => JSON.parse(localStorage.getItem('toledot:reveal') ?? '{}'))) as { opened?: string[] }).opened ?? [];
      const avel = await menuAt('avel');
      if (!avel) return fail('звезды Авеля нет среди лиц на виду');
      if (avel.includes('Скрыть союзы на небе')) return fail('у Авеля (точки союзов не показаны) есть «Скрыть союзы на небе»');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      const kain = await menuAt('kain');
      if (!kain) return fail('звезды Каина нет среди лиц на виду');
      if (!kain.includes('Скрыть союзы на небе')) return fail(`в меню Каина: ${kain.join(' | ')}`);
      await p.locator('.skymenu [role="menuitem"]', { hasText: 'Скрыть союзы на небе' }).click();
      await p.waitForTimeout(500);
      if ((await opened()).includes('kain')) return fail('точки союзов Каина остались');
      if (!(await work(p)).includes('kain')) return fail('Каин ушёл из набора');
      return (await p.locator('.skymenu').count()) ? fail('меню не закрылось') : pass();
    },
  },
];
