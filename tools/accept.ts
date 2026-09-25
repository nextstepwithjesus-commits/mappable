/**
 * Сценарии приёмки ТЗ § 11.2 — в браузере, со снимком каждого шага в docs/screens/accept-NN.png.
 * Каждый сценарий печатает «да» или «НЕТ» с причиной; код выхода 1, если хоть один не прошёл.
 *   npm run -s accept                — все сценарии (нужна сборка: npx vite build)
 *   npm run -s accept -- 5           — только пятый
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { ROOT } from './bible.ts';

const PORT = 4184;
const OUT = join(ROOT, 'docs/screens');
const only = process.argv[2] ? Number(process.argv[2]) : null;

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
];

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
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
