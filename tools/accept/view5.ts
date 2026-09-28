/**
 * Сценарии приёмки: древо карточек (решение 73), группа view5: номера 630–649, вид атласа: небо и древо, органы, начала.
 * Задача N2 — древо на месте неба: переключатель «Небо | Древо» в верхней строке и в «Разделах» телефона; в древе нет
 * органов неба и полосы времени; начала, «Начать заново…» и строка «Раскрыто N лиц» работают и в древе; вступление древа
 * объясняет древо; поле адреса «t1», «назад» и «вперёд» между небом и древом; «Условные знаки», «О карте», «Клавиши».
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

const NAMES = ['С Адама', 'С Иисуса Христа', 'Родословие Иисуса Христа', 'Ключевые лица', 'Всё небо'];
const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();

/** Открыть заново с памятью браузера: вступление, начало, вид и прочие ключи (toledot:<ключ>). */
async function fresh(p: Page, o: { intro?: boolean; start?: string | null; view?: 'sky' | 'tree'; extra?: Record<string, unknown> } = {}, hash = '#/', ms = 2200) {
  await p.evaluate(
    ([intro, start, view, extra]) => {
      localStorage.setItem('toledot:cartouche', intro ? 'open' : 'folded');
      if (start) localStorage.setItem('toledot:start', JSON.stringify(start));
      else localStorage.removeItem('toledot:start');
      if (view) localStorage.setItem('toledot:view', JSON.stringify(view));
      else localStorage.removeItem('toledot:view');
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) localStorage.setItem(`toledot:${k}`, JSON.stringify(v));
      sessionStorage.clear();
    },
    [!!o.intro, o.start ?? null, o.view ?? null, o.extra ?? {}] as const,
  );
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?v5=${Date.now()}${hash}`);
  await p.waitForTimeout(ms);
}

/** Что на месте неба: древо, небо (режим холста) или ничего. */
async function area(p: Page): Promise<{ tree: boolean; sky: string | null; strip: boolean; ctl: boolean; treeCtl: boolean; cards: string[] }> {
  return (await p.evaluate(`(() => {
    const c = document.querySelector('.sky canvas');
    return {
      tree: !!document.querySelector('.app > main > .treearea .tree'),
      sky: c ? (c.dataset.mode || 'on') : null,
      strip: !!document.querySelector('.app > .strip'),
      ctl: !!document.querySelector('.skyctl'),
      treeCtl: !!document.querySelector('.treearea .tree-ctl'),
      cards: [...document.querySelectorAll('.treearea .tc')].map((e) => e.dataset.key),
    };
  })()`)) as { tree: boolean; sky: string | null; strip: boolean; ctl: boolean; treeCtl: boolean; cards: string[] };
}
/** Нажатая кнопка переключателя «Небо | Древо» в верхней строке. */
const pressed = (p: Page) => p.evaluate("[...document.querySelectorAll('.top .view-switch button[aria-pressed=\"true\"]')].map((b) => b.textContent.trim()).join('|')");
/** Рабочий набор из памяти браузера: id по порядку. */
const work = async (p: Page) => ((await p.evaluate(() => JSON.parse(localStorage.getItem('toledot:work') ?? '[]'))) as [string, unknown][]).map((r) => r[0]);
/** Строка у кромки древа: текст и видимые команды. */
async function treeBar(p: Page) {
  return (await p.evaluate(`(() => {
    const b = document.querySelector('.treearea .skytop .pickbar');
    if (!b) return null;
    const vis = (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    return { text: b.querySelector('.txt').textContent, cmds: [...b.querySelectorAll('button')].filter(vis).map((x) => x.textContent.trim()) };
  })()`)) as { text: string; cmds: string[] } | null;
}
/** Кнопки начал во вступлении. */
const startLabels = (p: Page) => p.evaluate("[...document.querySelectorAll('.cartouche .starts button')].map((b) => b.getAttribute('aria-label')).join('|')");
/** Раскрытие Адам → союз с Евой (дети) в памяти браузера. */
const fam = (of: string) => ({ via: 'family', of });
const ADAM_OPEN = {
  work: [['adam', { via: 'self', of: 'adam' }], ['eva', fam('adam')], ['kain', fam('adam')], ['avel', fam('adam')], ['sif', fam('adam')]],
  reveal: { opened: ['adam'], expanded: { 'u:adam+eva': 'adam' } },
};

export const view5: Scenario[] = [
  {
    n: 630,
    title: 'Решение 73: первое посещение — вступление с пятью началами; «С Адама» открывает древо на месте неба: Адам, союз «Адам и Ева»; полосы времени и органов неба нет, адрес с «~t1»',
    run: async (p) => {
      await fresh(p, { intro: true });
      if ((await startLabels(p)) !== NAMES.join('|')) return fail(`начала: ${await startLabels(p)}`);
      await p.locator('.cartouche .starts button', { hasText: 'С Адама' }).click();
      await p.waitForTimeout(1500);
      const a = await area(p);
      if (!a.tree) return fail('древа нет');
      if (a.sky !== null) return fail('небо осталось на экране');
      if (a.strip) return fail('полоса времени в древе');
      if (a.ctl) return fail('органы неба в древе');
      if (!a.treeCtl) return fail('нет органов древа');
      if (!a.cards.includes('p:adam') || !a.cards.includes('u:adam+eva')) return fail(`карточки: ${a.cards.join(' ')}`);
      if (await p.locator('.cartouche').count()) return fail('вступление не свернулось');
      if (!/~t1(~|$)/.test(new URL(p.url()).hash)) return fail(`адрес без «t1»: ${new URL(p.url()).hash}`);
      if (hashId(p) !== 'adam') return fail(`выбрано «${hashId(p)}»`);
      if ((await pressed(p)) !== 'Древо') return fail(`переключатель: ${await pressed(p)}`);
      // древо — во всю высоту до нижнего края окна: место полосы времени отдано ему
      const box = (await p.locator('.treearea').boundingBox())!;
      const H = p.viewportSize()!.height;
      return Math.abs(box.y + box.height - H) <= 1 ? pass(`${a.cards.length} карточки`) : fail(`древо кончается на ${box.y + box.height}, окно ${H}`);
    },
  },
  {
    n: 631,
    title: 'Решение 73: переключатель «Небо | Древо» у поиска; «Небо» — те же лица на небе «набор», «Древо» — снова древо; «назад» и «вперёд» — между ними',
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'tree', extra: ADAM_OPEN }, '#/adam');
      let a = await area(p);
      if (!a.tree) return fail('при виде «древо» из памяти — не древо');
      // переключатель — сразу после поиска, до панелей; весь на виду
      const sw = (await p.locator('.top .view-switch').boundingBox())!;
      const find = (await p.locator('.top .search').boundingBox())!;
      const nav = (await p.locator('.top .commands').boundingBox())!;
      if (!(sw.x >= find.x + find.width && sw.x + sw.width <= nav.x + 1)) return fail('переключатель не между поиском и панелями');
      await p.locator('.top .view-switch button', { hasText: 'Небо' }).click();
      await p.waitForTimeout(1800);
      a = await area(p);
      if (a.tree || a.sky !== 'work') return fail(`«Небо»: древо ${a.tree}, небо ${a.sky}`);
      if (!a.strip) return fail('на небе нет полосы времени');
      if ((await work(p)).join(',') !== 'adam,eva,kain,avel,sif') return fail(`набор изменился: ${(await work(p)).join(',')}`);
      if (/~t1/.test(new URL(p.url()).hash)) return fail('в адресе неба осталось «t1»');
      await p.goBack();
      await p.waitForTimeout(1500);
      if (!(await area(p)).tree) return fail('«назад» не вернул древо');
      await p.goForward();
      await p.waitForTimeout(1800);
      a = await area(p);
      if (a.tree || !a.sky) return fail('«вперёд» не вернул небо');
      await p.locator('.top .view-switch button', { hasText: 'Древо' }).click();
      await p.waitForTimeout(1200);
      a = await area(p);
      return a.tree && a.cards.includes('p:sif') ? pass() : fail(`«Древо»: ${a.cards.join(' ')}`);
    },
  },
  {
    n: 632,
    title: 'Решение 73: адрес с «~t1» открывает древо, без него — небо; «Раскрыто N лиц — показать всё небо | начать заново» у кромки древа',
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'sky', extra: ADAM_OPEN }, '#/adam~k1~t1');
      let a = await area(p);
      if (!a.tree) return fail('«~t1» не открыл древо');
      const b = await treeBar(p);
      if (!b) return fail('нет строки у кромки древа');
      if (flat(b.text) !== 'Раскрыто 5 лиц') return fail(`строка: «${flat(b.text)}»`);
      if (b.cmds.join('|') !== 'показать всё небо|начать заново') return fail(`команды: ${b.cmds.join(' | ')}`);
      await p.locator('.treearea .skytop button', { hasText: 'показать всё небо' }).click();
      await p.waitForTimeout(1800);
      a = await area(p);
      if (a.tree || a.sky !== 'all') return fail(`«показать всё небо»: древо ${a.tree}, небо ${a.sky}`);
      if ((await work(p)).length !== 5) return fail('набор изменился');
      await fresh(p, { start: 'adam', view: 'tree', extra: ADAM_OPEN }, '#/adam~k1');
      a = await area(p);
      return !a.tree && a.sky === 'work' ? pass() : fail(`адрес без «t1»: древо ${a.tree}, небо ${a.sky}`);
    },
  },
  {
    n: 633,
    title: 'Решения 68, 73: в древе «Начать заново…» из «Ещё» открывает вступление с началами, фокус — на текущем; набор больше лица — с подтверждением; «С Иисуса Христа» — древо с Иисусом Христом',
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'tree', extra: ADAM_OPEN }, '#/adam');
      await p.locator('.commands .more > button').click();
      await p.waitForTimeout(200);
      await p.locator('.commands .more [role^="menuitem"]', { hasText: 'Начать заново' }).click();
      await p.waitForTimeout(600);
      if (!(await p.locator('.treearea .cartouche').count())) return fail('вступление древа не открылось');
      if (await p.locator('.viewpop, .sheet .viewctl').count()) return fail('открылся лист «Вид»');
      if ((await startLabels(p)) !== NAMES.join('|')) return fail(`начала: ${await startLabels(p)}`);
      const head = flat(await p.locator('.cartouche #starts-title').innerText());
      if (head !== 'Начать заново') return fail(`заголовок начал: «${head}»`);
      const focus = await p.evaluate("document.activeElement?.getAttribute('data-start')");
      if (focus !== 'adam') return fail(`фокус не на текущем начале: ${focus}`);
      await p.locator('.cartouche .starts button', { hasText: 'С Иисуса Христа' }).click();
      await p.waitForTimeout(300);
      const ask = p.locator('.cartouche .starts-ask');
      if (!(await ask.count())) return fail('замена набора из 5 лиц без подтверждения');
      if (!/Набор из 5 лиц будет заменён/.test(flat(await ask.innerText()))) return fail(`вопрос: ${flat(await ask.innerText())}`);
      await ask.locator('button', { hasText: 'начать заново' }).click();
      await p.waitForTimeout(1500);
      const a = await area(p);
      if (!a.tree) return fail('после начала — не древо');
      if (await p.locator('.cartouche').count()) return fail('вступление не свернулось');
      if (!a.cards.includes('p:iisus')) return fail(`карточки: ${a.cards.join(' ')}`);
      return (await work(p)).join(',') === 'iisus' ? pass() : fail(`набор: ${(await work(p)).join(',')}`);
    },
  },
  {
    n: 634,
    title: 'Решение 73: «Как читать карту» в древе объясняет древо — поколения слева направо, команды карточек, пустое место, линии Мессии; не небо; «Всё небо» из вступления — небо «все лица»',
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'tree', extra: ADAM_OPEN }, '#/adam');
      const cmd = p.locator('.treearea .guide-cmd');
      if (!(await cmd.count())) return fail('нет «Как читать карту» в древе');
      // команда не под органами древа: слева, органы — справа
      const cb = (await cmd.boundingBox())!;
      const ob = (await p.locator('.treearea .tree-ctl').boundingBox())!;
      if (cb.x + cb.width > ob.x) return fail('команда заходит под органы древа');
      await cmd.click();
      await p.waitForTimeout(500);
      const c = p.locator('.treearea .cartouche');
      if (!(await c.count())) return fail('вступление не открылось');
      const t = flat(await c.innerText());
      for (const w of ['Слева направо — поколения', '«Продолжить ветвь»', '«Раскрыть детей»', 'Пунктирная рамка', 'Золотая и лазурная'])
        if (!t.includes(w)) return fail(`во вступлении нет «${w}»`);
      if (/Годы сверху|номера столбцов|полоса времени/.test(t)) return fail('вступление древа говорит о небе');
      if (await c.locator('.entry').count()) return fail('быстрые входы в древе');
      await c.locator('.starts button', { hasText: 'Всё небо' }).click();
      await p.waitForTimeout(300);
      const ask = c.locator('.starts-ask button', { hasText: 'начать заново' });
      if (await ask.count()) await ask.click();
      await p.waitForTimeout(1800);
      const a = await area(p);
      return !a.tree && a.sky === 'all' ? pass() : fail(`«Всё небо»: древо ${a.tree}, небо ${a.sky}`);
    },
  },
  {
    n: 635,
    title: 'Решение 73: пустое древо — «Древо» при пустом наборе начинается с выбранного лица; без выбранного — вступление с началами',
    run: async (p) => {
      await fresh(p, { start: 'all', view: 'sky' }, '#/david');
      await p.locator('.top .view-switch button', { hasText: 'Древо' }).click();
      await p.waitForTimeout(1200);
      let a = await area(p);
      if (!a.tree) return fail('не древо');
      if (!a.cards.includes('p:david')) return fail(`нет карточки Давида: ${a.cards.join(' ')}`);
      // у Давида показаны его союзы: ветвь продолжается без поиска
      if (!a.cards.some((k) => k.startsWith('u:david+'))) return fail('нет союзов Давида');
      await fresh(p, { start: 'all', view: 'sky', extra: { work: [], reveal: { opened: [], expanded: {} } } }, '#/');
      await p.locator('.top .view-switch button', { hasText: 'Древо' }).click();
      await p.waitForTimeout(1200);
      a = await area(p);
      if (!a.tree) return fail('не древо');
      return (await p.locator('.treearea .cartouche .starts button').count()) === 5 ? pass() : fail('нет вступления с началами');
    },
  },
  {
    n: 636,
    title: 'Решение 73: «Условные знаки» — раздел «Древо» (карточка лица, союза, пустое место, двойная линия, ветви; силуэты и «худож.»), «Клавиши» — таблица древа; «О карте» — абзац о древе',
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'tree', extra: ADAM_OPEN }, '#/');
      await p.locator('.commands button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const sheet = p.locator('.app > .sheet');
      if (!(await sheet.locator('#legend-tree').count())) return fail('нет раздела «Древо»');
      for (const sel of ['.tc.tc-person', '.tc.tc-union', '.tc.tc-unnamed', 'svg.lt-svg .rb.mt', 'svg.lt-svg .ln.desc'])
        if (!(await sheet.locator(sel).count())) return fail(`нет образца ${sel}`);
      const person = flat(await sheet.locator('.tc.tc-person').innerText());
      if (!person.startsWith('Сиф') || !/Продолжить ветвь/.test(person)) return fail(`образец лица: ${person}`);
      const union = flat(await sheet.locator('.tc.tc-union').innerText());
      if (!/Адам и Ева/.test(union) || !/Быт 2:22/.test(union)) return fail(`образец союза: ${union}`);
      const text = flat(await sheet.innerText());
      if (!/Силуэт на карточке — условный знак/.test(text) || !text.includes('«худож.»')) return fail('нет строки о силуэтах');
      // образцы силуэтов — рисунком самих карточек: мужчина, женщина, народ, неназванный, звезда Иисуса Христа
      if ((await sheet.locator('.lt-avatars .av').count()) < 5) return fail('нет образцов силуэтов');
      // «Как читать карту» в начале панели — о древе, пока на экране древо
      if (!/Слева направо — поколения/.test(flat(await sheet.locator('ul.guide').first().innerText()))) return fail('«Как читать карту» панели — не о древе');
      if (!(await sheet.locator('#legend-keys-tree').count())) return fail('нет клавиш древа');
      // образцы — в пределах панели, без прокрутки вбок
      const over = await sheet.evaluate((s) => s.scrollWidth - s.clientWidth);
      if (over > 0) return fail(`панель прокручивается вбок на ${over} px`);
      await p.locator('.commands button', { hasText: 'О карте' }).click();
      await p.waitForTimeout(600);
      const about = flat(await p.locator('.app > .sheet').innerText());
      if (!about.includes('«Небо | Древо»')) return fail('в «О карте» нет абзаца о древе');
      return about.includes('художественная интерпретация создателей приложения') ? pass() : fail('в «О карте» нет фразы об изображениях');
    },
  },
  {
    n: 637,
    title: 'Решение 73, телефон 390 × 844: «Небо» и «Древо» в «Разделах»; древо — на весь экран под верхней строкой, без полосы времени; карточка — нижний лист над древом',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'sky', extra: ADAM_OPEN }, '#/');
      await p.locator('.top .sections > button').tap();
      await p.waitForTimeout(250);
      const items = (await p.locator('.top .sections [role^="menuitem"] .nm').allInnerTexts()).map((x) => x.trim());
      if (items[0] !== 'Небо' || items[1] !== 'Древо') return fail(`«Разделы»: ${items.join(' | ')}`);
      await p.locator('.top .sections [role^="menuitem"]', { hasText: 'Древо' }).tap();
      await p.waitForTimeout(1200);
      const a = await area(p);
      if (!a.tree || a.strip) return fail(`древо ${a.tree}, полоса ${a.strip}`);
      const box = (await p.locator('.treearea').boundingBox())!;
      const top = (await p.locator('.top').boundingBox())!;
      if (Math.abs(box.y - (top.y + top.height)) > 1 || Math.abs(box.y + box.height - 844) > 1) return fail(`древо ${box.y}…${box.y + box.height}`);
      const over = (await p.evaluate('document.documentElement.scrollWidth - innerWidth')) as number;
      if (over > 0) return fail(`прокрутка вбок ${over} px`);
      // выбор карточки — лист карточки снизу, над древом (карточка на виду: древо вписано органом «Вписать всё»)
      await p.locator('.treearea .tree-ctl button', { hasText: 'Вписать всё' }).tap();
      await p.waitForTimeout(600);
      await p.locator('.tc[data-key="p:adam"] .tc-nm').tap();
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'adam') return fail(`выбрано «${hashId(p)}»`);
      const f = await p.locator('.folio').boundingBox();
      if (!f || f.y <= box.y || f.y + f.height > 844 + 1) return fail('нет листа карточки над древом');
      await p.locator('.top .sections > button').tap();
      await p.waitForTimeout(250);
      const checked = await p.evaluate("[...document.querySelectorAll('.top .sections [aria-checked=\"true\"] .nm')].map((e) => e.textContent.trim()).join('|')");
      if (!String(checked).startsWith('Древо')) return fail(`отмечено: ${checked}`);
      await p.locator('.top .sections [role^="menuitem"]', { hasText: 'Небо' }).tap();
      await p.waitForTimeout(1500);
      const b = await area(p);
      return !b.tree && b.sky === 'work' ? pass() : fail(`«Небо»: древо ${b.tree}, небо ${b.sky}`);
    },
  },
  {
    n: 638,
    title: 'Решение 73, 320 × 640: древо без прокрутки вбок, строка раскрытия — «все лица» (уже 360 px «начать заново» — в «Разделах», как на небе), органы древа и «Как читать карту» не накладываются',
    view: { width: 320, height: 640, touch: true },
    run: async (p) => {
      await fresh(p, { start: 'adam', view: 'tree', extra: ADAM_OPEN }, '#/');
      const a = await area(p);
      if (!a.tree) return fail('не древо');
      const over = (await p.evaluate('document.documentElement.scrollWidth - innerWidth')) as number;
      if (over > 0) return fail(`прокрутка вбок ${over} px`);
      const b = await treeBar(p);
      if (!b || b.cmds.join('|') !== 'все лица') return fail(`строка: ${b ? b.cmds.join(' | ') : 'нет'}`);
      const bb = (await p.locator('.treearea .skytop .pickbar').boundingBox())!;
      if (bb.height > 50 || bb.x + bb.width > 320) return fail(`строка ${bb.height.toFixed(0)} px, правый край ${bb.x + bb.width}`);
      const g = await p.locator('.treearea .guide-cmd').boundingBox();
      const o = await p.locator('.treearea .tree-ctl').boundingBox();
      if (!g || !o) return fail('нет команды или органов');
      const cross = g.x < o.x + o.width && o.x < g.x + g.width && g.y < o.y + o.height && o.y < g.y + g.height;
      return cross ? fail('«Как читать карту» на органах древа') : pass();
    },
  },
];
