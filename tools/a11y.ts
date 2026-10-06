/**
 * Проверка доступности (ТЗ § 3.8; WCAG 2.2 AA) движком axe-core на основных экранах в обеих темах: стол 1440 и 1024,
 * телефон 390 (360, альбомная 844 × 390) и планшет 768 — небо, карточка, разворот, панели, поиск, листы телефона.
 * Теги axe: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa (в том числе размер целей касания, 2.5.8).
 * Небо — холст role="application" со списком лиц на виду (src/ui/sky/SkyA11y.tsx); всё остальное — обычная разметка.
 *   npm run -s a11y   (нужна сборка: npx vite build)
 *   npx tsx tools/a11y.ts --dist .ui-build/<имя> --port <порт>   (своя сборка и порт — для параллельной работы)
 *   npx tsx tools/a11y.ts --only телефон                          (только экраны, в имени которых есть слово)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';
import { denseSpots } from './accept/phone.ts';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? null : (argv[i + 1] ?? null);
};
const DIST = opt('dist');
const PORT = Number(opt('port') ?? 4187);
const ONLY = opt('only');
const axeSource = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type View = { width: number; height: number; touch?: boolean };
/** ms — сколько ждать действия (по умолчанию 6 с): перебор плотных мест на телефоне дольше. */
/** fresh — новый читатель (начало не выбрано): пошаговая карта «Адам и Иисус Христос» (этап 21, решение 200). */
type Screen = { name: string; hash: string; act?: (p: Page) => Promise<void>; view?: View; ms?: number; fresh?: boolean };
const PHONE: View = { width: 390, height: 844, touch: true };
const TABLET: View = { width: 768, height: 1024, touch: true };

/** Касание элемента (экраны телефона и планшета). */
const press = (p: Page, sel: string, text?: string) => (text ? p.locator(sel, { hasText: text }) : p.locator(sel)).first().tap();

/**
 * Набор на небе (этап 11, решение 77: вида «Древо» больше нет — его состояния проверяются на небе «набор»): набор и
 * раскрытие из памяти браузера, как после щелчков по командам карточек («С Адама»; Адам → союз → Каин, Авель, Сиф → союз
 * Сифа → Енос), показ «набор» (~vs), ромбы союзов с «+N» и карточка у звезды.
 */
const fam = (of: string) => ({ via: 'family', of });
const SET_ADAM = { work: [['adam', { via: 'self', of: 'adam' }]], reveal: { opened: ['adam'], expanded: {} } };
const SET_ENOS = {
  work: [['adam', { via: 'self', of: 'adam' }], ['eva', fam('adam')], ['kain', fam('adam')], ['avel', fam('adam')], ['sif', fam('adam')], ['enos', fam('sif')]],
  reveal: { opened: ['adam', 'sif'], expanded: { 'u:adam+eva': 'adam', 'u:sif+': 'sif' } },
};
async function openSet(p: Page, st: { work: unknown[]; reveal: unknown }) {
  await p.evaluate((st) => {
    localStorage.setItem('toledot:view', '"sky"');
    localStorage.setItem('toledot:start', '"adam"');
    localStorage.setItem('toledot:work', JSON.stringify(st.work));
    localStorage.setItem('toledot:reveal', JSON.stringify(st.reveal));
    sessionStorage.setItem('toledot:skymode', '"work"');
  }, st);
  // адрес лица без полей вида и с показом «набор»
  const u = new URL(p.url());
  u.hash = `${u.hash.replace(/~.*$/, '')}~vs`;
  await p.goto(u.toString());
  await p.reload();
  await p.waitForTimeout(2200);
  if ((await p.evaluate(() => document.documentElement.dataset.show)) !== 's') throw new Error('набор на небе не открылся');
}

const DESK: Screen[] = [
  { name: 'небо', hash: '#/' },
  // небо с фокусом клавиатуры: холст — приложение, у него звезда с фокусом (aria-activedescendant)
  { name: 'небо: фокус на холсте', hash: '#/', act: async (p) => {
    await p.locator('.sky canvas').focus();
    await p.keyboard.press('ArrowRight');
  } },
  { name: 'карточка Давида', hash: '#/david' },
  // карточка союза в листе (решение 71): супруги, дети, происхождение, «Раскрыть на небе»
  { name: 'карточка союза', hash: '#/avraam~uavraam.agar' },
  { name: 'разворот', hash: '#/avraam', act: async (p) => {
    await p.click('.folio .actions >> text=Разворот с…');
    await p.fill('#find', 'Исаак');
    await p.waitForTimeout(250);
    await p.keyboard.press('Enter');
  } },
  ...['Указатель', 'Родство', 'Синопсис', 'Главы', 'Сквозной раздел', 'Условные знаки', 'О карте'].map((cmd) => ({
    name: `панель «${cmd}»`,
    hash: '#/david',
    act: async (p: Page) => {
      await p.locator('.commands').getByText(cmd, { exact: true }).click();
    },
  })),
  // «Эпохи» — в органах неба (C6): флажок ярусов и команда панели
  { name: 'панель «Эпохи» и ярусы', hash: '#/david', act: async (p) => {
    await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
    await p.locator('.skyctl .view-toggle').click();
    await p.locator('.skyctl').getByText('Эпохи', { exact: true }).click();
  } },
  { name: 'список моделей хронологии', hash: '#/', act: async (p) => {
    await p.click('.skyctl .view-toggle');
    await p.click('.skyctl .menu.model > button');
  } },
  // масштаб по осям и размер областей (J1, J2): лист «Вид» над органами неба, ручки границ, небо во весь экран
  { name: 'лист «Вид» над органами неба', hash: '#/david', act: async (p) => {
    await p.click('.skyctl .view-toggle');
  } },
  { name: 'ручки границ областей', hash: '#/david~y-1000~w120~l0.0~pkinship', act: async (p) => {
    await p.locator('.resizer-folio').focus();
  } },
  { name: 'небо во весь экран', hash: '#/david~y-1000~w120~l0.0~pkinship', act: async (p) => {
    await p.locator('.sky canvas').focus();
    await p.keyboard.press('KeyF');
  } },
  // комбобокс поиска (I3; MOB-28): открытый список с группой одноимённых и список «ничего не найдено»
  { name: 'поиск с подсказками', hash: '#/', act: async (p) => {
    await p.click('#find');
    await p.keyboard.type('Иосиф');
    await p.keyboard.press('ArrowDown');
  } },
  { name: 'поиск без совпадений', hash: '#/', act: async (p) => {
    await p.click('#find');
    await p.keyboard.type('Щщщщ');
  } },
  { name: '«Ещё» на 1024', hash: '#/', view: { width: 1024, height: 768 }, act: async (p) => {
    await p.click('.commands .more > button');
  } },
  { name: 'карточка и «Синопсис» на 1024', hash: '#/david', view: { width: 1024, height: 768 }, act: async (p) => {
    const b = p.locator('.commands > button', { hasText: 'Синопсис' });
    if (await b.count()) await b.click();
    else {
      await p.click('.commands .more > button');
      await p.locator('.commands [role^="menuitem"]', { hasText: 'Синопсис' }).click();
    }
  } },
  { name: 'образец', hash: '#/specimen' },
  // набор на небе (этап 11, решение 77; прежде — древо карточек): ромбы союзов, «+N», карточка у звезды
  { name: 'набор на небе: С Адама', hash: '#/adam', act: (p) => openSet(p, SET_ADAM) },
  { name: 'набор на небе: раскрытый союз и выбранное лицо', hash: '#/sif', act: (p) => openSet(p, SET_ENOS) },
  // выбранная связь (этап 11, § 8): жёлтый путь, кольца, карточка связи с концами
  { name: 'выбранная связь: Ной и его жена → Хам', hash: '#/noy~ck.noy._._.kham' },
  // пошаговая карта нового читателя (этап 21, решения 197–200): рукоятки «⊕», шаг у Адама, карточка с командами шагов,
  // строка «Отменить шаг», «Указатель» с частью Писания
  { name: 'пошаговая карта: первый экран', hash: '#/', fresh: true },
  { name: 'пошаговая карта: шаг у Адама и карточка Сифа', hash: '#/', fresh: true, act: async (p) => {
    await p.waitForTimeout(1500);
    const box = (await p.locator('.sky canvas').boundingBox())!;
    const h = ((await p.locator('.sky canvas').getAttribute('data-handles')) ?? '').split(';').find((q) => q.startsWith('adam:fwd:'));
    if (!h) throw new Error('у Адама нет рукоятки');
    const [x, y] = h.split(':')[2].split(',').map(Number);
    await p.mouse.click(box.x + x, box.y + y);
    await p.waitForTimeout(1800);
    await p.click('#find');
    await p.fill('#find', 'Сиф');
    await p.waitForTimeout(250);
    await p.keyboard.press('Enter');
  } },
  { name: 'пошаговая карта: «Указатель», Новый Завет', hash: '#/', fresh: true, act: async (p) => {
    await p.locator('.commands').getByText('Указатель', { exact: true }).click();
    await p.locator('.sheet .canon button', { hasText: 'Новый Завет' }).click();
  } },
];

// телефон и планшет (H1–H7): касание, листы, «Разделы», «Какое лицо?»
const TOUCH: Screen[] = [
  { name: 'телефон: небо', hash: '#/', view: PHONE },
  { name: 'телефон: лист на 55 %', hash: '#/david', view: PHONE },
  // команда «К звезде» (прежде «Показать на небе», решение 156) — по своему классу, а не по словам
  { name: 'телефон: лист на шапке', hash: '#/david', view: PHONE, act: (p) => press(p, '.folio .actions button.show-on-sky') },
  { name: 'телефон: лист на 100 %', hash: '#/david', view: PHONE, act: (p) => press(p, '.folio .sheet-bar .bar-toggle') },
  { name: 'телефон: «Разделы»', hash: '#/david', view: PHONE, act: (p) => press(p, '.top .sections > button') },
  { name: 'телефон: поиск с подсказками', hash: '#/', view: PHONE, act: async (p) => {
    await press(p, '.top label[for="find"]');
    await p.keyboard.type('Иосиф');
  } },
  { name: 'телефон: «Родство»', hash: '#/david', view: PHONE, act: async (p) => {
    await press(p, '.top .sections > button');
    await press(p, '.top .sections [role^="menuitem"]', 'Родство');
  } },
  { name: 'телефон: «Вид»', hash: '#/david', view: PHONE, act: (p) => press(p, '.skyctl.column button', 'Вид') },
  { name: 'телефон: «Эпохи»', hash: '#/david', view: PHONE, act: async (p) => {
    await press(p, '.skyctl.column button', 'Вид');
    await press(p, '.sheet button', 'Эпохи и их основания');
  } },
  { name: 'телефон: «Какое лицо?»', hash: '#/david', view: PHONE, ms: 20_000, act: async (p) => {
    // касание в плотном месте открывает список «Какое лицо?» (H5): середина ближайшей пары звёзд на виду — место ищется
    // по данным раскладки (tools/accept/phone.ts, denseSpots), а не смещением от Давида
    // окно неба успокоилось (перелёт к Давиду кончился): места считаются по окончательной раскладке
    const settle = async () => {
      let prev = '';
      for (let i = 0; i < 20; i++) {
        const v = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement | null)?.dataset.view ?? '')) as string;
        if (v && v === prev) return;
        prev = v;
        await p.waitForTimeout(250);
      }
    };
    for (let k = 0; k < 4; k++) {
      await settle();
      const q = (await denseSpots(p))[k];
      if (!q) break;
      const box = (await p.locator('.sky canvas').boundingBox())!;
      await p.touchscreen.tap(box.x + q.x, box.y + q.y);
      await p.waitForTimeout(600);
      if (await p.locator('.which').count()) return;
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(1200);
    }
    // экран не открылся — проверка не должна пройти молча
    throw new Error('список «Какое лицо?» не открылся');
  } },
  { name: 'телефон 360: лист на 100 %', hash: '#/ruf', view: { width: 360, height: 740, touch: true }, act: (p) => press(p, '.folio .sheet-bar .bar-toggle') },
  { name: 'телефон, альбомная: карточка', hash: '#/david', view: { width: 844, height: 390, touch: true } },
  { name: 'телефон: карточка союза на 100 %', hash: '#/david~udavid.virsaviya', view: PHONE, act: (p) => press(p, '.folio .sheet-bar .bar-toggle') },
  { name: 'телефон: набор на небе и лист карточки', hash: '#/sif', view: PHONE, act: (p) => openSet(p, SET_ENOS) },
  { name: 'планшет: карточка', hash: '#/david', view: TABLET },
  { name: 'планшет: «Указатель»', hash: '#/david', view: TABLET, act: async (p) => {
    const b = p.locator('.commands > button', { hasText: 'Указатель' });
    if (await b.count()) await b.tap();
    else {
      await p.locator('.commands .more > button').tap();
      await p.locator('.commands [role^="menuitem"]', { hasText: 'Указатель' }).tap();
    }
  } },
];

const SCREENS = [...DESK, ...TOUCH].filter((s) => !ONLY || s.name.includes(ONLY));

async function main() {
  const args = ['vite', 'preview', '--port', String(PORT), '--strictPort'];
  if (DIST) args.push('--outDir', DIST);
  const server = spawn('npx', args, { cwd: ROOT, stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  let total = 0;
  try {
    for (const theme of ['night', 'day']) {
      for (const s of SCREENS) {
        const v = s.view ?? { width: 1440, height: 900 };
        const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: !!v.touch, hasTouch: !!v.touch });
        const p = await ctx.newPage();
        await p.addInitScript(`localStorage.setItem('toledot:intro','true');localStorage.setItem('toledot:theme', JSON.stringify('${theme}'))`);
        // прежние экраны — на начале «Всё небо» (до этапа 21 его видел новый читатель); новый читатель — экраны fresh
        if (!s.fresh) await p.addInitScript(`if (localStorage.getItem('toledot:start') === null) localStorage.setItem('toledot:start', JSON.stringify('all'))`);
        await p.goto(`http://localhost:${PORT}/${s.hash}`);
        await p.waitForTimeout(v.touch ? 2200 : 1500);
        let note = '';
        if (s.act) {
          // экран, который не удалось открыть, проверяется как есть — с пометой
          const ms = s.ms ?? 6000;
          await Promise.race([s.act(p), new Promise((_, no) => setTimeout(() => no(new Error(`действие не выполнено за ${ms / 1000} с`)), ms))]).catch((e) => {
            note = ` (${(e as Error).message.split('\n')[0]})`;
          });
          await p.waitForTimeout(900);
        }
        await p.addScriptTag({ content: axeSource });
        const res = (await p.evaluate(
          `axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' ' + (n.failureSummary || '').split('\\n').slice(1, 2).join(' ')) })))`,
        )) as { id: string; impact: string; help: string; nodes: string[] }[];
        total += res.length + (note ? 1 : 0);
        console.log(`${res.length || note ? 'НЕТ' : 'да '} ${theme} · ${s.name}${note}`);
        for (const r of res) console.log(`     ${r.impact} ${r.id}: ${r.help}\n       ${r.nodes.join('\n       ')}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    try {
      process.kill(-server.pid!);
    } catch {
      /* уже остановлен */
    }
  }
  console.log(total ? `\nНарушений: ${total}` : '\nНарушений не найдено.');
  process.exitCode = total ? 1 : 0;
}
main();
