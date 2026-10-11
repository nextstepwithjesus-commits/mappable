/**
 * П-Т5: поведенческие тесты модели возврата 08 § 6.5 в настоящем браузере (Playwright, Chromium) на экранах-заглушках:
 * страница истории (эскиз), Генеалогия, Время. Фокус после перехода, «Назад» браузера и кнопка «Назад: …», Esc,
 * объявления, «Отменить шаг», слой, «рядом», номер выпуска и переадресация в ссылке, перезагрузка.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
let srv: PreviewServer;
let browser: Browser;
let base = '';

beforeAll(async () => {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
  srv = await preview({ configFile: join(root, 'vite.config.ts') });
  base = srv.resolvedUrls!.local[0].replace(/\/$/, '');
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  srv?.httpServer.close();
});

async function open(path: string, opts: { width?: number; reduce?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: opts.width ?? 1024, height: 800 }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { errors: string[] }).errors = errors;
  await page.goto(base + path);
  await page.waitForFunction(() => (window as any).__probe?.router?.route);
  return page;
}
const focused = (p: Page) => p.evaluate(() => document.activeElement?.id ?? '');
const path = (p: Page) => p.evaluate(() => location.pathname + location.search);
const histLen = (p: Page) => p.evaluate(() => history.length);
const status = async (p: Page, re: RegExp) => {
  await p.waitForFunction((src) => new RegExp(src).test(document.getElementById('status')!.textContent ?? ''), re.source, { timeout: 3000 });
  return p.textContent('#status');
};
async function back(p: Page) {
  const before = await path(p);
  await p.evaluate(() => history.back());
  await p.waitForFunction((b) => location.pathname + location.search !== b, before);
  await p.waitForTimeout(450); // переход общим элементом 250–300 мс, фокус — после него
}
async function nav(p: Page, sel: string) {
  await p.click(sel);
  await p.waitForFunction(() => document.activeElement?.id === 'h1');
}

const TOOLS = [
  { tool: 'genealogiya', entry: '#obraz', focusBack: 'obraz', prefix: 'g', views: ['#expand', '#expand', '#expand', '#expand', '#expand'] },
  { tool: 'vremya', entry: '#story-time', focusBack: 'story-time', prefix: 'v', views: ['#view', '#later', '#later', '#add', '#view'] },
];

describe('сценарий 08 § 6.5 для каждого инструмента', () => {
  for (const t of TOOLS) {
    it(`${t.tool}: история → инструмент → три выбора → лист → пять шагов вида → «Назад» × 2 = история с фокусом на элементе входа`, async () => {
      const p = await open('/istoriya/s-noy');
      const len0 = await histLen(p);
      await nav(p, t.entry);
      expect(await path(p)).toMatch(new RegExp(`^/${t.tool}\\?p=noy`));
      for (const id of ['adam', 'eva', 'kain']) await p.click(`#${t.prefix}-m-${id}`);
      await p.click('#open-sheet');
      for (const v of t.views) await p.click(v);
      expect(await histLen(p)).toBe(len0 + 2); // история браузера: +экран, +запись выбора
      await back(p);
      expect(await path(p)).toMatch(new RegExp(`^/${t.tool}\\?p=noy`));
      expect(await path(p)).not.toMatch(/sel=|list=/);
      expect(await focused(p)).toBe(`${t.prefix}-m-kain`); // фокус — на метку, которая была выбрана
      await back(p);
      expect(await path(p)).toBe('/istoriya/s-noy');
      expect(await focused(p)).toBe(t.focusBack);
      expect((p as Page & { errors: string[] }).errors).toEqual([]);
      await p.context().close();
    });
    it(`${t.tool}: кнопка «Назад: Ной и потоп» — одно нажатие с выбором и листом`, async () => {
      const p = await open('/istoriya/s-noy');
      await nav(p, t.entry);
      await p.click(`#${t.prefix}-m-eva`);
      await p.click('#open-sheet');
      expect((await p.textContent('#back'))?.trim()).toBe('← Назад: Ной и потоп');
      await p.click('#back');
      await p.waitForFunction(() => location.pathname === '/istoriya/s-noy');
      await p.waitForTimeout(450);
      expect(await focused(p)).toBe(t.focusBack);
      await p.context().close();
    });
  }
});

describe('Esc, слой, «поверх»', () => {
  it('Esc: лист → выбор → ничего; с экрана не уводит', async () => {
    const p = await open('/genealogiya?p=noy');
    await p.click('#g-m-adam');
    await p.click('#open-sheet');
    await p.keyboard.press('Escape');
    expect(await path(p)).toBe('/genealogiya?p=noy&sel=adam');
    expect(await focused(p)).toBe('g-m-adam');
    await status(p, /Лист закрыт/);
    await p.keyboard.press('Escape');
    expect(await path(p)).toBe('/genealogiya?p=noy');
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    expect(await path(p)).toBe('/genealogiya?p=noy');
    await p.context().close();
  });
  it('Esc в окне «Справка» закрывает только его и возвращает фокус на кнопку; история не растёт', async () => {
    const p = await open('/genealogiya?p=noy&sel=adam&list=1');
    const len = await histLen(p);
    await p.click('#help-open');
    expect(await p.evaluate(() => (document.getElementById('help') as HTMLDialogElement).open)).toBe(true);
    await p.keyboard.press('Escape');
    expect(await p.evaluate(() => (document.getElementById('help') as HTMLDialogElement).open)).toBe(false);
    expect(await focused(p)).toBe('help-open');
    expect(await path(p)).toBe('/genealogiya?p=noy&sel=adam&list=1');
    expect(await histLen(p)).toBe(len);
    await p.context().close();
  });
  it('слой (уровень 5) не в адресе, «Назад» его не меняет', async () => {
    const p = await open('/istoriya/s-noy');
    await nav(p, '#obraz');
    await p.click('#layer');
    expect(await p.textContent('#layer')).toBe('Слой: для изучающих');
    await p.click('#g-m-adam');
    await p.click('#open-sheet');
    await nav(p, '#sheet-go');
    await back(p);
    expect(await p.textContent('#layer')).toBe('Слой: для изучающих');
    expect(await path(p)).not.toMatch(/sloy|layer/);
    await p.context().close();
  });
});

describe('фокус', () => {
  it('возврат фокуса на метку вне окна: метки нет в DOM, «Назад» прокручивает окно и переводит фокус', async () => {
    const p = await open('/istoriya/s-noy');
    await nav(p, '#obraz');
    const target = await p.evaluate(() => {
      const w = document.getElementById('g-window')!;
      w.scrollTop = w.scrollHeight;
      w.dispatchEvent(new Event('scroll'));
      const marks = [...w.querySelectorAll('.mark')];
      return marks[marks.length - 3].id;
    });
    await p.click(`#${target}`);
    await p.evaluate(() => {
      const w = document.getElementById('g-window')!;
      w.scrollTop = 0;
      w.dispatchEvent(new Event('scroll'));
    });
    await p.locator('#g-m-adam').focus();
    expect(await p.$(`#${target}`)).toBeNull(); // метка вне окна не нарисована
    await back(p);
    expect(await focused(p)).toBe(target);
    const inside = await p.evaluate((id) => {
      const w = document.getElementById('g-window')!.getBoundingClientRect();
      const m = document.getElementById(id)!.getBoundingClientRect();
      return m.top >= w.top && m.bottom <= w.bottom;
    }, target);
    expect(inside).toBe(true);
    await p.context().close();
  });
  it('возврат на прежний экран — фокус на элемент, с которого ушли (ссылка в листе), выбор и лист на месте', async () => {
    const p = await open('/genealogiya?p=noy');
    await p.click('#g-m-kain');
    await p.click('#open-sheet');
    await nav(p, '#sheet-go');
    expect(await path(p)).toBe('/vremya?p=kain');
    expect((await p.textContent('#back'))?.trim()).toBe('← Назад: Ной — Генеалогия');
    await back(p);
    expect(await path(p)).toBe('/genealogiya?p=noy&sel=kain&list=1');
    expect(await focused(p)).toBe('sheet-go');
    await p.context().close();
  });
  it('с уменьшенным движением (без перехода общим элементом) фокус тот же', async () => {
    const p = await open('/istoriya/s-noy', { reduce: true });
    await nav(p, '#obraz');
    await back(p);
    expect(await focused(p)).toBe('obraz');
    await p.context().close();
  });
  it('переход общим элементом в Chromium есть, и фокус переводится после него', async () => {
    const p = await open('/istoriya/s-noy');
    expect(await p.evaluate(() => typeof (document as any).startViewTransition)).toBe('function');
    await p.click('#obraz');
    await p.waitForFunction(() => document.activeElement?.id === 'h1');
    expect(await p.textContent('#h1')).toBe('Генеалогия: Ной');
    await p.context().close();
  });
});

describe('объявления, «Отменить шаг», кнопка возврата', () => {
  it('объявления: экран, выбор, отмена шага', async () => {
    const p = await open('/istoriya/s-noy');
    await nav(p, '#obraz');
    await status(p, /^Ной, Генеалогия$/);
    await p.click('#g-m-adam');
    await status(p, /^Выбрано: Адам$/);
    await p.click('#expand');
    await p.click('#undo');
    await status(p, /^Отменено: раскрыть союз 1$/);
    await p.context().close();
  });
  it('«Отменить шаг»: история не растёт; скрытая кнопка не теряет фокус — он на «Вернуть шаг»', async () => {
    const p = await open('/genealogiya?p=noy');
    const len = await histLen(p);
    await p.click('#expand');
    await p.click('#expand');
    expect(await p.getAttribute('#undo', 'aria-label')).toBe('Отменить шаг: раскрыть союз 2');
    await p.click('#undo');
    expect(await p.textContent('#view-state')).toMatch(/раскрыто союзов: 1/);
    expect(await focused(p)).toBe('undo');
    await p.click('#undo');
    expect(await focused(p)).toBe('redo');
    expect(await histLen(p)).toBe(len);
    expect(await path(p)).toBe('/genealogiya?p=noy');
    await p.context().close();
  });
  it('вход по ссылке — кнопки «Назад: …» нет, есть хлебные крошки', async () => {
    const p = await open('/vremya?p=noy&sel=adam');
    expect(await p.$('#back')).toBeNull();
    expect(await p.textContent('#crumbs')).toMatch(/Главная/);
    await p.context().close();
  });
  it('перезагрузка сохраняет кнопку «Назад: …» и работает', async () => {
    const p = await open('/istoriya/s-noy');
    await nav(p, '#obraz');
    await p.reload();
    await p.waitForFunction(() => (window as any).__probe?.router?.route);
    expect((await p.textContent('#back'))?.trim()).toBe('← Назад: Ной и потоп');
    await p.click('#back');
    await p.waitForFunction(() => location.pathname === '/istoriya/s-noy');
    await p.context().close();
  });
});

describe('«рядом», ссылка на вид, переадресация', () => {
  it('«рядом» (от 1 280 px): открыть и закрыть соседа — записи уровня 1', async () => {
    const p = await open('/genealogiya?p=noy', { width: 1280 });
    const len = await histLen(p);
    await nav(p, '#ryadom-open');
    expect(await path(p)).toBe('/genealogiya?p=noy&ryadom=vremya&r.p=noy');
    await nav(p, '#ryadom-close');
    expect(await histLen(p)).toBe(len + 2);
    await back(p);
    expect(await p.$('#nb-h')).not.toBeNull();
    await p.context().close();
  });
  it('«Ссылка на этот вид» несёт параметры вида и номер выпуска; чужой выпуск — строка', async () => {
    const p = await open('/vremya?p=noy&view=sobytiya&c=-1950');
    await p.click('#link');
    const v = await p.inputValue('#link-out');
    const rel = await p.evaluate(() => (window as any).__probe.release);
    expect(v).toBe(`${base}/vremya?p=noy&view=sobytiya&c=-1950&v=${rel}`);
    const q = await open('/vremya?p=noy&view=sobytiya&v=probe-0000000');
    expect(await q.textContent('#notice')).toMatch(/Ссылка сделана на выпуске данных probe-0000000/);
    expect(await path(q)).toBe('/vremya?p=noy&view=sobytiya');
    await p.context().close();
    await q.context().close();
  });
  it('переадресация номера из сборки (iliy-otets-marii → iliy-syn-matfata)', async () => {
    const p = await open('/genealogiya?p=iliy-otets-marii');
    expect(await path(p)).toBe('/genealogiya?p=iliy-syn-matfata');
    expect(await p.textContent('#notice')).toMatch(/теперь/);
    await p.context().close();
  });
});
