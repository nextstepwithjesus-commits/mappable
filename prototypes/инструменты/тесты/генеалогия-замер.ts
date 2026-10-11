/**
 * П9 — лабораторно (03 § 11; 08 § 9; 09 § 7): скорость Генеалогии на сборке прототипа. Порог 03: 60 кадров/с на ноутбуке,
 * 50 — на телефоне; первый показ < 2,5 с; «Потомки Адама» < 1 с; блок «По родству» ≤ 200 мс. На устройстве — до показа
 * пакета 2 (10 § 4.2.1). Ноутбук — 1280 × 800, ×1; «телефон» — 360 × 640, касание, замедление CDP ×6 (как П-Т1: растр и GPU
 * не замедляются — это оценка, не телефон).
 *
 *   npx tsx prototypes/инструменты/тесты/генеалогия-замер.ts     → снимки/генеалогия/П9.json
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { сервер } from './сервер.ts';

const OUT = join(import.meta.dirname, '..', 'снимки', 'генеалогия');
mkdirSync(OUT, { recursive: true });

/** Кадры за время действия: доля пропущенных обновлений при 60 Гц и длинные задачи > 50 мс. */
async function кадры(p: Page, действие: () => Promise<void>) {
  // код страницы — строкой: tsx не вставляет в него свои помощники (`__name`)
  await p.evaluate(`(() => {
    const w = window;
    w.__к = { t: [], long: [], on: true };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (w.__к.on) w.__к.long.push(e.duration); }).observe({ type: 'longtask', buffered: false });
    const f = (t) => { if (!w.__к.on) return; w.__к.t.push(t); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  })()`);
  await действие();
  return p.evaluate(() => {
    const w = window as unknown as { __к: { t: number[]; long: number[]; on: boolean } };
    w.__к.on = false;
    const t = w.__к.t;
    const всего = (t.at(-1)! - t[0]) / (1000 / 60);
    const пропущено = Math.max(0, всего - (t.length - 1));
    return { кадров: t.length, доляПропусков: +(пропущено / Math.max(1, всего)).toFixed(3), кадровВСекунду: +(((t.length - 1) / (t.at(-1)! - t[0])) * 1000).toFixed(1), длинныхЗадач: w.__к.long.length, длиннейшая: Math.round(Math.max(0, ...w.__к.long)) };
  });
}

async function main() {
  const { origin, base, close } = await сервер();
  const browser = await chromium.launch();
  const итог: Record<string, unknown> = { дата: new Date().toISOString(), браузер: browser.version(), окна: {} };
  for (const окно of [
    { имя: 'ноутбук 1280×800, ×1', ctx: { viewport: { width: 1280, height: 800 } }, замедление: 1 },
    { имя: 'телефон 360×640, ×6', ctx: { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, замедление: 6 },
  ]) {
    const ctx = await browser.newContext(окно.ctx);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: окно.замедление });
    const r: Record<string, unknown> = {};
    for (const [сцена, адрес] of [['Семья Иакова', 'genealogiya?p=iakov'], ['весь раскрытый лес', 'genealogiya?p=iakov&open=все']] as const) {
      await p.goto(`${origin}${base}${адрес}&age=null`);
      await p.waitForFunction(() => (window as unknown as { __генеалогия?: { замеры: { первыйПоказ?: number } } }).__генеалогия?.замеры.первыйПоказ !== undefined, null, { timeout: 60000 });
      await p.waitForTimeout(300);
      const з = await p.evaluate(() => ({ ...(window as unknown as { __генеалогия: { замеры: Record<string, number> } }).__генеалогия.замеры, кнопок: document.querySelectorAll('[data-пр]').length, узловDOM: document.getElementsByTagName('*').length })) as Record<string, number>;
      await p.evaluate(() => document.getElementById('схема-окно')!.scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(100);
      const box = await p.locator('#схема-окно').boundingBox();
      const vh = окно.ctx.viewport.height;
      const cx = box!.x + box!.width / 2, cy = Math.min(box!.y + box!.height / 2, (box!.y + vh) / 2);
      await p.mouse.move(cx, cy);
      const прокрутка = await кадры(p, async () => {
        for (let i = 0; i < 40; i++) { await p.mouse.wheel(i % 20 < 10 ? 120 : -120, i % 2 ? 60 : -60); await p.waitForTimeout(50); }
      });
      const щипок = await кадры(p, async () => {
        if (окно.ctx.hasTouch) {
          // два пальца: CDP-жест касания (как П-Т1)
          await cdp.send('Input.synthesizePinchGesture', { x: cx, y: cy, scaleFactor: 2, relativeSpeed: 400, gestureSourceType: 'touch' });
          await cdp.send('Input.synthesizePinchGesture', { x: cx, y: cy, scaleFactor: 0.5, relativeSpeed: 400, gestureSourceType: 'touch' });
          return;
        }
        await p.keyboard.down('Control');
        for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, i < 15 ? -20 : 20); await p.waitForTimeout(33); }
        await p.keyboard.up('Control');
      });
      r[сцена] = { первыйПоказМс: Math.round(з.первыйПоказ), загрузкаПакетаМс: Math.round(з.загрузка), лесМс: Math.round(з.лес), раскладкаИОтрисовкаМс: Math.round(з.раскладка), кнопок: з.кнопок, узловDOM: з.узловDOM, прокрутка, щипок };
    }
    // «По родству»: путь в прочтении по умолчанию
    r['По родству, мс'] = await p.evaluate(() => {
      const f = (window as unknown as { __генеалогия: { путь: (a: string, b: string) => { мс: number; звеньев: number } } }).__генеалогия.путь;
      return [['david', 'moisey'], ['ruf', 'david'], ['adam', 'iisus'], ['kain', 'esfir']].map(([a, b]) => ({ пара: `${a}—${b}`, ...f(a, b), мс: +f(a, b).мс.toFixed(2) }));
    });
    // «Потомки Адама»: от нажатия «Потомки» до готового отчёта
    await p.goto(`${origin}${base}genealogiya?p=adam&age=null`);
    await p.waitForFunction(() => document.querySelectorAll('[data-пр]').length > 0, null, { timeout: 60000 });
    const мс = (await p.evaluate(`(async () => {
      const t0 = performance.now();
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Потомки').click();
      await new Promise((ok) => { const f = () => (document.querySelector('.отчёт .поколение') ? ok() : requestAnimationFrame(f)); f(); });
      return { доОтчётаМс: Math.round(performance.now() - t0), строк: document.querySelectorAll('.отчёт li').length };
    })()`)) as { доОтчётаМс: number; строк: number };
    r['Потомки Адама'] = мс;
    (итог.окна as Record<string, unknown>)[окно.имя] = r;
    await ctx.close();
  }
  await browser.close();
  await close();
  writeFileSync(join(OUT, 'П9.json'), JSON.stringify(итог, null, 1));
  console.log(JSON.stringify(итог, null, 1));
}
void main();
