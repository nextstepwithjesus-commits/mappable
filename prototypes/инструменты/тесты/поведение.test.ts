/**
 * Поведенческие проверки рабочего прототипа пакета 1 (Playwright по собранной сборке `dist/`):
 *  - модель возврата 08 § 6.5: история → образ «Время» → выбор → Esc → «Назад: Ной и потоп» — фокус на образе; история →
 *    Карточка → «Назад» — фокус на ссылке; вход по ссылке — кнопки «Назад: …» нет; Esc не уводит с экрана;
 *  - бюджет над первым стихом ≤ 300 px без плашки пробы (11 § 4.1; 08 § 3.3.4; Л-д1) на 1280 × 720, 1024 × 768, 360 × 560;
 *  - копия выделения стиха = показанный текст в Chromium, Firefox и WebKit (08 § 16.2; Л-д2);
 *  - «черновик» и «Текст Библии здесь полный» (11 § 12.2); подсказки детям — только при возрасте младше 13 (В-28);
 *  - первый экран каталога: строк историй не меньше 13 на 1280 × 720 и 7 на 360 × 560 без плашки (11 § 16 п. 4).
 * Перед запуском: `npm run -s proto:build`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { сервер } from './сервер.ts';

let origin = '';
let base = '';
let close: () => Promise<void> = async () => {};
let browser: Browser;
const DIST = join(import.meta.dirname, '..', 'dist', 'index.html');

/** Запуск движка: своя сборка Playwright; если её нет на машине — последняя установленная той же семьи (локально). */
async function запустить(тип: BrowserType): Promise<Browser> {
  if (existsSync(тип.executablePath())) return тип.launch();
  const кэш = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const имя = тип.name();
  const папки = existsSync(кэш) ? readdirSync(кэш).filter((d) => d.startsWith(`${имя}-`)).sort() : [];
  const п = папки.at(-1);
  const путь = п && (имя === 'firefox' ? join(кэш, п, 'firefox', 'Nightly.app', 'Contents', 'MacOS', 'firefox') : join(кэш, п, 'pw_run.sh'));
  if (!путь || !existsSync(путь)) return тип.launch();
  return тип.launch({ executablePath: путь });
}

beforeAll(async () => {
  if (!existsSync(DIST)) throw new Error('нет сборки: npm run -s proto:build');
  ({ origin, base, close } = await сервер());
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await close();
});

async function открыть(p: Page, адрес: string) {
  await p.goto(`${origin}${base}${адрес}`);
  await p.waitForFunction(() => document.documentElement.dataset.готово === '1');
  await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await p.waitForTimeout(200);
}
const активный = (p: Page) => p.evaluate(() => (document.activeElement as HTMLElement | null)?.id ?? '');

describe('модель возврата (08 § 6.5)', () => {
  it('история → «Время» → выбор → Esc → «Назад: Ной и потоп»: фокус на образе, история не выросла', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, '');
    await p.click('a[href*="istoriya/e-noy-i-potop"]');
    await p.waitForSelector('#h1:text("Ной и потоп")');
    expect(await p.locator('#кн-назад').innerText()).toContain('Назад: Главная');
    const длина0 = await p.evaluate(() => history.length);
    await p.click('#образ-время');
    await p.waitForSelector('#h1:text("Ной и потоп — Время")');
    expect(await p.locator('#кн-назад').innerText()).toContain('Назад: Ной и потоп');
    // лист выбранной истории открыт (уровень 2 из адреса); Esc закрывает лист и не уводит с экрана
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    expect(await p.locator('#h1').innerText()).toBe('Время');
    await p.keyboard.press('Escape');
    expect(p.url()).toContain('vremya');
    // три выбора и шаги вида
    await p.click('#бусина-e-kain-i-avel');
    await p.click('#бусина-e-sif-i-enos');
    await p.click('#бусина-e-noy-i-potop');
    await p.getByRole('button', { name: 'Крупнее' }).click();
    await p.getByRole('button', { name: 'Мельче' }).click();
    expect(await p.evaluate(() => history.length)).toBeLessThanOrEqual(длина0 + 2);
    await p.click('#кн-назад');
    await p.waitForSelector('#h1:text("Ной и потоп")');
    await p.waitForTimeout(300);
    expect(await активный(p)).toBe('образ-время');
    await p.close();
  });

  it('история → Карточка Ноя → «Назад»: фокус на строке лица; по ссылке кнопки нет', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'istoriya/e-noy-i-potop');
    expect(await p.locator('#кн-назад').count()).toBe(0);
    await p.focus('#лицо-p-noy');
    await p.keyboard.press('Enter');
    await p.waitForSelector('#h1:text("Ной")');
    expect(await p.locator('#кн-назад').innerText()).toContain('Назад: Ной и потоп');
    await p.click('#кн-назад');
    await p.waitForSelector('#h1:text("Ной и потоп")');
    await p.waitForTimeout(300);
    expect(await активный(p)).toBe('лицо-p-noy');
    await p.close();
  });
});

describe('страница истории', () => {
  const верх = (p: Page) =>
    p.evaluate(() => {
      const v = document.querySelector('.части .стих');
      const pl = document.querySelector('.плашка-пробы-полоса');
      return v ? Math.round(v.getBoundingClientRect().top - (pl?.getBoundingClientRect().height ?? 0)) : 9999;
    });
  for (const id of ['e-noy-i-potop', 'e-david-i-goliaf', 'e-umer-samuil', 'e-rasslablennogo-spuskayut-cherez-krovlyu'])
    for (const [w, h] of [
      [1280, 720],
      [1024, 768],
      [360, 560],
    ])
      it(`бюджет ≤ 300 px над первым стихом: ${id}, ${w}×${h}`, async () => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 600 && { isMobile: true, hasTouch: true }) });
        const p = await ctx.newPage();
        await открыть(p, `istoriya/${id}?age=null`);
        expect(await верх(p)).toBeLessThanOrEqual(300);
        await ctx.close();
      });

  it('«черновик» в строке адреса и «Текст Библии здесь полный» (11 § 12.2)', async () => {
    const p = await browser.newPage();
    await открыть(p, 'istoriya/e-noy-i-potop?layer=1');
    expect(await p.locator('.шапка-истории__вид .черновик').innerText()).toContain('черновик');
    expect(await p.locator('.колофон').innerText()).toContain('текст Библии здесь полный');
    await p.getByRole('button', { name: /^Ещё/ }).first().click();
    await p.getByRole('menuitem', { name: 'Как читать эту страницу' }).click();
    expect(await p.locator('.как-читать').innerText()).toContain('Текст Библии здесь полный');
    await p.close();
  });

  it('подсказки детям — только при возрасте младше 13 (В-28)', async () => {
    const p = await browser.newPage();
    const текст = async (age: string) => {
      await открыть(p, `istoriya/e-noy-i-potop?age=${age}`);
      return p.locator('.шапка-истории').innerText();
    };
    expect(await текст('null')).not.toContain('Прочтите сначала сами');
    expect(await текст('13')).not.toContain('Прочтите сначала сами');
    expect(await текст('9')).toContain('Прочтите сначала сами');
    expect(await текст('null')).toContain('Трудная история: здесь есть смерть');
    await p.close();
  });

  it('трудная история: часть 1 открыта, части со стихами `hard` закрыты (11 § 4.1)', async () => {
    const p = await browser.newPage();
    await открыть(p, 'istoriya/e-noy-i-potop?layer=1&age=null');
    expect(await p.locator('#chast-1 .часть__кнопка').getAttribute('aria-expanded')).toBe('true');
    expect(await p.locator('#chast-3 .часть__кнопка').getAttribute('aria-expanded')).toBe('false');
    await p.close();
  });
});

describe('копия выделения в трёх движках (08 § 16.2; Л-д2)', () => {
  const движки: [string, BrowserType][] = [
    ['chromium', chromium],
    ['firefox', firefox],
    ['webkit', webkit],
  ];
  for (const [имя, тип] of движки)
    it(`${имя}: стих Быт 6:9–22 копируется показанным текстом, без номеров и меток`, async () => {
      const b = имя === 'chromium' ? browser : await запустить(тип);
      const p = await b.newPage();
      await открыть(p, 'istoriya/e-noy-i-potop?layer=1&age=null');
      const итог = await p.evaluate(async () => {
        const pack = await (await fetch(`${document.baseURI.split('istoriya')[0]}data/pack/manifest.json`)).json();
        const file = pack.packages.find((x: { kind: string; book?: string }) => x.kind === 'text' && x.book === 'Быт').file;
        const text = await (await fetch(`${document.baseURI.split('istoriya')[0]}data/pack/${file}`)).json();
        let ок = 0;
        const плохо: string[] = [];
        const стихи = [...document.querySelectorAll('#chast-1 .стих')];
        for (const s of стихи) {
          const [c, v] = s.id.replace('st', '').split('.').map(Number);
          const r = document.createRange();
          r.selectNodeContents(s);
          const sel = getSelection()!;
          sel.removeAllRanges();
          sel.addRange(r);
          const t = sel.toString().replace(/\s+/g, ' ').trim();
          const надо = String(text.ch[c - 1][v - 1]).replace(/ - /g, ' — ').replace(/\s+/g, ' ').trim();
          if (t === надо) ок++;
          else плохо.push(`${c}:${v} «${t.slice(0, 60)}» ≠ «${надо.slice(0, 60)}»`);
        }
        return { ок, всего: стихи.length, плохо };
      });
      expect(итог.плохо).toEqual([]);
      expect(итог.всего).toBe(14);
      if (b !== browser) await b.close();
    });
});

describe('каталог: первый экран (11 § 16 п. 4)', () => {
  for (const [w, h, n] of [
    [1280, 720, 13],
    [360, 560, 7],
  ])
    it(`Бытие, ${w}×${h}: видно строк историй не меньше ${n} (без плашки пробы)`, async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 600 && { isMobile: true, hasTouch: true }) });
      const p = await ctx.newPage();
      await открыть(p, 'kniga/byt');
      const видно = await p.evaluate(() => {
        const pl = document.querySelector('.плашка-пробы-полоса')?.getBoundingClientRect().height ?? 0;
        return [...document.querySelectorAll('.строка__верх')].filter((r) => r.getBoundingClientRect().bottom - pl <= innerHeight).length;
      });
      expect(видно).toBeGreaterThanOrEqual(n);
      await ctx.close();
    });
});
