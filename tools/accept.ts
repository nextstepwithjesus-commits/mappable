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

type Check = { ok: boolean; why: string };
const pass = (why = ''): Check => ({ ok: true, why });
const fail = (why: string): Check => ({ ok: false, why });

async function find(p: Page, q: string) {
  await p.click('#find');
  await p.fill('#find', q);
  await p.waitForTimeout(250);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
}
const hashId = (p: Page) => decodeURIComponent(new URL(p.url()).hash.replace(/^#\/?/, '').split('?')[0]);
const folioText = (p: Page) => p.locator('.folio').innerText();
const secText = async (p: Page, n: number) => ((await p.locator(`.folio #sec-${n}`).count()) ? p.locator(`.folio #sec-${n}`).innerText() : '');

const SCENARIOS: { n: number; title: string; run: (p: Page) => Promise<Check> }[] = [
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
      await p.click('.folio .actions >> text=Вся схема разделов');
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
      await p.fill('.sheet .search input', 'Давид');
      await p.waitForTimeout(300);
      await p.locator('.sheet button.person', { hasText: 'Давид' }).first().click();
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
      await p.click('.commands >> text=О карте');
      await p.click('.sheet >> text=Краткое пребывание');
      await p.waitForTimeout(1500);
      await p.click('.sheet .close');
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
      const bar = (await p.locator('.sky .pickbar').count()) ? await p.locator('.sky .pickbar').innerText() : '';
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
      await p.waitForTimeout(400);
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
      await p.fill('.sheet .search input', 'Давид');
      await p.waitForTimeout(300);
      await p.locator('.sheet button.person', { hasText: 'Давид' }).first().click();
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
    title: 'Эпохи: звёзды под ярусами не ловят указатель',
    run: async (p) => {
      await find(p, 'Давид');
      await p.click('.commands >> text=Эпохи');
      await p.waitForTimeout(800);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const sheet = await p.locator('.sheet').boundingBox();
      const left = Math.max(box.x + 30, sheet ? sheet.x + sheet.width + 10 : 0);
      // ярусов шесть, каждый не ниже 35 px: полоса 40…220 px от верха неба всегда под ними
      for (let y = box.y + 40; y < box.y + 220; y += 6)
        for (let x = left; x < box.x + box.width - 20; x += 23) {
          await p.mouse.move(x, y);
          const tip = p.locator('.sky .tip b');
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
];

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
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
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
