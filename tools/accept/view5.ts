/**
 * Сценарии приёмки: вид атласа, группа view5 — номера 630–649.
 *
 * Прежде (решение 73, задача N2) здесь проверялся вид «Древо» на месте неба: переключатель «Небо | Древо», поле адреса
 * «~t1», вступление и «Как читать карту» древа, строка «Раскрыто N лиц» у его кромки. Этап 11 (решение 77, STAGE11.md
 * § 5; задача Q3) древо убрал: атлас — одно небо, карточка у звезды заменяет карточки древа. Сценарии 630–638 проверяют
 * новое поведение на тех же местах: главная область — всегда небо с полосой времени и органами; переключателя нет ни
 * в верхней строке, ни в «Разделах» телефона; прежний адрес «~t1» открывает набор на небе; «Начать заново…» — лист «Вид»;
 * справка — о карточке у звезды, «Родстве», связях и строке показа; на телефоне карточка у звезды — нижний лист.
 */
import type { Page } from 'playwright';
import { fail, hashId, pass, type Scenario } from './kit.ts';
import { ADAM, cardOf, clickStar, flat, open, self, starPt, state } from './unify11.ts';

// этап 16 (решение 187): шестое начало — «Рассказ: от Адама до Иисуса Христа»
const NAMES = ['С Адама', 'С Иисуса Христа', 'Родословие Иисуса Христа (Мф 1, Лк 3)', 'Ключевые лица', 'Всё небо', 'Рассказ: от Адама до Иисуса Христа'];

/** Главная область: небо (режим холста), полоса времени, органы неба; древа нет. */
async function area(p: Page): Promise<{ tree: boolean; sky: string | null; strip: boolean; ctl: boolean }> {
  return (await p.evaluate(`(() => {
    const c = document.querySelector('.sky canvas');
    return {
      tree: !!document.querySelector('.treearea, .tree'),
      sky: c ? (c.dataset.mode || 'on') : null,
      strip: !!document.querySelector('.app > .strip'),
      ctl: !!document.querySelector('.skyctl'),
    };
  })()`)) as { tree: boolean; sky: string | null; strip: boolean; ctl: boolean };
}
/** Набор из памяти браузера: id по порядку. */
const work = async (p: Page) => ((await p.evaluate(() => JSON.parse(localStorage.getItem('toledot:work') ?? '[]'))) as [string, unknown][]).map((r) => r[0]);

export const view5: Scenario[] = [
  {
    n: 630,
    title: 'Решение 77: первое посещение — вступление с шестью началами (решение 187); «С Адама» открывает небо (не древо): полоса времени и органы неба на месте, набор из Адама, у его звезды — карточка; в адресе нет «~t1»',
    run: async (p) => {
      await p.evaluate(() => {
        localStorage.setItem('toledot:cartouche', 'open');
        localStorage.removeItem('toledot:start');
        sessionStorage.clear();
      });
      await p.goto(`${p.url().replace(/[?#].*$/, '')}?v5=${Date.now()}#/`);
      await p.waitForTimeout(2200);
      const names = await p.evaluate("[...document.querySelectorAll('.cartouche .starts button')].map((b) => b.getAttribute('aria-label')).join('|')");
      if (names !== NAMES.join('|')) return fail(`начала: ${names}`);
      await p.locator('.cartouche .starts button', { hasText: 'С Адама' }).click();
      await p.waitForTimeout(2200);
      const a = await area(p);
      if (a.tree || a.sky !== 'work' || !a.strip || !a.ctl) return fail(`древо ${a.tree}, небо ${a.sky}, полоса ${a.strip}, органы ${a.ctl}`);
      if ((await work(p)).join(',') !== 'adam') return fail(`набор: ${(await work(p)).join(', ')}`);
      const c = await cardOf(p);
      if (!c || c.name !== 'Адам') return fail('у звезды Адама нет карточки');
      return /~t1/.test(p.url()) ? fail(`адрес: ${p.url()}`) : pass();
    },
  },
  {
    n: 631,
    title: 'Решения 77, 111: переключателя «Небо | Древо» нет — в верхней строке только поиск, панели и тема; «Ещё» на 1440 нет; команд и клавиш древа нет',
    run: async (p) => {
      await open(p, '#/david');
      if (await p.locator('.top .view-switch').count()) return fail('в верхней строке — переключатель вида');
      const top = flat(await p.locator('.top').innerText());
      if (/Древо/.test(top) || /\bНебо\b/.test(top.replace(/На небе/g, ''))) return fail(`верхняя строка: «${top}»`);
      // этап 13 (решение 111): «Ещё» — только когда команды не помещаются
      if (await p.locator('.commands .more').count()) return fail('«Ещё» при 1440');
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(600);
      const keys = flat((await p.locator('table.keys').first().innerText().catch(() => '')) ?? '');
      return /древ/i.test(keys) ? fail('в «Клавишах» — клавиши древа') : pass();
    },
  },
  {
    n: 632,
    title: 'Решения 77, 81: прежний адрес «~t1» (древо) открывает набор на небе: показ «набор», лица набора из «~n…», карточки древа нет',
    run: async (p) => {
      await open(p, '#/david~t1~niessey.david', { start: 'adam' });
      const a = await area(p);
      if (a.tree) return fail('открылось древо');
      const s = await state(p);
      if (s.show !== 's') return fail(`показ: ${s.show}`);
      if (Number(s.ids) !== 2) return fail(`в показе ${s.ids} лиц`);
      const bar = flat(await p.locator('.sky .showbar').innerText());
      return /^На небе: набор — 2 лица/.test(bar) ? pass(bar) : fail(`строка показа: «${bar}»`);
    },
  },
  {
    n: 633,
    title: 'Решения 68, 77, 111: «Вид → Начало» — набор больше лица заменяется с подтверждением; «С Иисуса Христа» — набор из одного Иисуса Христа и его карточка у звезды',
    run: async (p) => {
      await open(p, '#/~vs', { start: 'adam', extra: { work: [self('adam'), ['eva', { via: 'family', of: 'adam' }]], reveal: { opened: ['adam'], expanded: { 'u:adam+eva': 'adam' } } } });
      // этап 13 (решение 111): «Начать заново…» — в «Вид → Начало» (в «Ещё» его больше нет)
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(600);
      const cur = await p.locator('.viewpop .starts button[aria-current="true"]').getAttribute('aria-label');
      if (cur !== 'С Адама') return fail(`текущее начало: ${cur}`);
      await p.locator('.viewpop .starts button', { hasText: 'С Иисуса Христа' }).click();
      await p.waitForTimeout(300);
      if (!(await p.locator('.viewpop .starts-ask').count())) return fail('нет вопроса о замене набора');
      await p.locator('.viewpop .starts-ask button', { hasText: 'начать заново' }).click();
      await p.waitForTimeout(2200);
      if ((await work(p)).join(',') !== 'iisus') return fail(`набор: ${(await work(p)).join(', ')}`);
      if (hashId(p) !== 'iisus') return fail(`выбрано «${hashId(p)}»`);
      const c = await cardOf(p);
      return c && c.name === 'Иисус Христос' ? pass() : fail(`карточка у звезды: ${c ? c.name : 'нет'}`);
    },
  },
  {
    n: 634,
    title: 'Решения 77, 78, 81, 83: «Как читать карту» — карточка с родством у звезды, ствол, зубцы, ромб союза, жёлтая связь, строка «На небе: …» и «Вписать»; о древе ни слова',
    run: async (p) => {
      await open(p, '#/');
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const g = flat(await p.locator('.app > .sheet ul.guide').first().innerText());
      for (const w of ['карточка с родством', 'вертикальный ствол', 'зубцы', 'ромб — союз родителей', 'жёлтым', '«На небе: …»', '«Вписать»'])
        if (!g.includes(w)) return fail(`в «Как читать карту» нет «${w}»`);
      return /древ/i.test(g) ? fail('«Как читать карту» говорит о древе') : pass();
    },
  },
  {
    n: 635,
    title: 'Решения 77, 194: что перешло из древа на атлас — у Каина после раскрытия в карточке справа «Продолжить ветвь» показывает ромб его союза; образ-силуэт в шапке карточки',
    run: async (p) => {
      await open(p, '#/adam~vs', {
        start: 'adam',
        extra: {
          work: [self('adam'), ['eva', { via: 'family', of: 'adam' }], ['kain', { via: 'family', of: 'adam' }], ['avel', { via: 'family', of: 'adam' }], ['sif', { via: 'family', of: 'adam' }]],
          reveal: { opened: ['adam'], expanded: { 'u:adam+eva': 'adam' } },
        },
      });
      if (!(await clickStar(p, 'kain'))) return fail('нет звезды Каина');
      // этап 20 (решение 194): карточка Каина — справа; «Продолжить ветвь» — в строке команд неба, образ — в шапке
      const k = flat(await p.locator('.folio .actions.sky-cmds').innerText());
      if (!k.includes('Продолжить ветвь')) return fail(`команды карточки Каина: ${k.slice(0, 160)}`);
      if (!(await p.locator('.folio .mast-av .av').count())) return fail('в карточке нет образа');
      await p.locator('.folio .actions.sky-cmds button', { hasText: 'Продолжить ветвь' }).click();
      await p.waitForTimeout(1200);
      const d = ((await p.locator('.sky canvas').getAttribute('data-dots')) ?? '').split(';').map((x) => x.split(':')[0] + ':' + x.split(':')[1]);
      if (!d.some((x) => x.startsWith('u:kain+'))) return fail(`ромба союза Каина нет: ${d.join(', ')}`);
      return pass();
    },
  },
  {
    n: 636,
    title: 'Решения 77, 194: «Условные знаки» — раздела «Древо» нет; раздел «Родство и связи» — карточка с «Родством», образы (силуэты, «худож.»), карточка связи; «О карте» — строка показа и «Родство»',
    run: async (p) => {
      await open(p, '#/');
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const sheet = p.locator('.app > .sheet');
      if (await sheet.locator('#legend-tree').count()) return fail('есть раздел «Древо»');
      if (!(await sheet.locator('#legend-cards').count())) return fail('нет раздела «Родство и связи» (прежде «Карточки на небе», решение 194)');
      if ((await sheet.locator('.av').count()) < 5) return fail('нет образцов образов');
      const t = flat(await sheet.innerText());
      for (const w of ['«Родство»', 'карточка связи', '«худож.»']) if (!t.includes(w)) return fail(`в «Условных знаках» нет ${w}`);
      const over = await sheet.evaluate((s) => s.scrollWidth - s.clientWidth);
      if (over > 0) return fail(`панель прокручивается вбок на ${over} px`);
      await p.locator('.commands > button', { hasText: 'О карте' }).click();
      await p.waitForTimeout(600);
      const about = flat(await p.locator('.app > .sheet').innerText());
      if (about.includes('Небо | Древо')) return fail('в «О карте» — абзац о древе');
      return about.includes('«На небе: …»') && about.includes('блоком «Родство»') ? pass() : fail('в «О карте» нет строки показа или «Родства»');
    },
  },
  {
    n: 637,
    title: 'Решение 77, телефон 390 × 844: в «Разделах» нет «Небо» и «Древо»; главная область — небо с полосой времени; касание звезды — нижний лист и есть карточка у звезды',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, '#/adam~va', { start: 'adam', extra: ADAM });
      await p.locator('.top .sections > button').tap();
      await p.waitForTimeout(250);
      const items = (await p.locator('.top .sections [role^="menuitem"] .nm').allInnerTexts()).map((x) => x.trim());
      if (items.includes('Небо') || items.includes('Древо')) return fail(`«Разделы»: ${items.join(' | ')}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      const a = await area(p);
      if (a.tree || !a.sky || !a.strip) return fail(`древо ${a.tree}, небо ${a.sky}, полоса ${a.strip}`);
      const q = await starPt(p, 'adam');
      if (!q) return fail('нет звезды Адама');
      await p.touchscreen.tap(q.x, q.y);
      await p.waitForTimeout(1000);
      if (!(await p.locator('.folio .sheet-dot .dotcard').count())) return fail('в листе нет карточки у звезды');
      if (await p.locator('.sky .dotcard[data-placed]').count()) return fail('над небом — вторая карточка');
      const over = (await p.evaluate('document.documentElement.scrollWidth - innerWidth')) as number;
      return over > 0 ? fail(`прокрутка вбок ${over} px`) : pass();
    },
  },
  {
    n: 638,
    title: 'Решение 77, 320 × 640: небо без прокрутки вбок; строка показа в одну строку, в пределах экрана; органы неба и «Как читать карту» не накладываются на неё',
    view: { width: 320, height: 640, touch: true },
    run: async (p) => {
      await open(p, '#/~vs', { start: 'adam', extra: ADAM });
      const r = (await p.evaluate(`(() => {
        const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, h: q.height }; };
        return { bar: box(document.querySelector('.skytop .showbar')), ctl: [...document.querySelectorAll('.skyctl button')].map(box), guide: box(document.querySelector('.sky .guide-cmd')), W: innerWidth, sw: document.documentElement.scrollWidth };
      })()`)) as { bar: { l: number; r: number; t: number; b: number; h: number } | null; ctl: { l: number; r: number; t: number; b: number }[]; guide: { l: number; r: number; t: number; b: number } | null; W: number; sw: number };
      if (r.sw > r.W + 1) return fail(`прокрутка вбок: ${r.sw}`);
      if (!r.bar) return fail('нет строки показа');
      if (r.bar.h > 50) return fail(`строка показа в ${r.bar.h.toFixed(0)} px`);
      if (r.bar.r > r.W + 0.5 || r.bar.l < -0.5) return fail('строка показа за краем');
      const hit = (a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      if (r.ctl.some((k) => hit(k, r.bar!))) return fail('органы неба на строке показа');
      if (r.guide && hit(r.guide, r.bar)) return fail('«Как читать карту» на строке показа');
      return pass();
    },
  },
];
