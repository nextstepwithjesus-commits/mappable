/**
 * Снимки Генеалогии — серый макет шага 2.0 (правило прототипов): 1280 × 800 и 360 × 640, обе темы; ошибки JS и
 * горизонтальная прокрутка страницы → `снимки/генеалогия/`, итог — `снимки/генеалогия/проверки.json`.
 *
 *   npx tsx prototypes/инструменты/тесты/генеалогия-снимки.ts      (после npm run -s proto:build)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { сервер } from './сервер.ts';
import { загрузитьГраф } from './генеалогия-данные.ts';
import { построитьЛес } from '../генеалогия/лес.ts';
import { потомки, предки } from '../генеалогия/отчёты.ts';
import { выгрузитьGedcom, проверитьGedcom } from '../генеалогия/gedcom.ts';

const OUT = join(import.meta.dirname, '..', 'снимки', 'генеалогия');
mkdirSync(OUT, { recursive: true });

const СЦЕНЫ: { имя: string; адрес: string; издали?: boolean }[] = [
  { имя: 'г0-входы', адрес: 'genealogiya' },
  { имя: 'г1-семья-иаков', адрес: 'genealogiya?p=iakov' },
  { имя: 'г1в-семья-иаков-второй-слой', адрес: 'genealogiya?p=iakov&layer=2' },
  { имя: 'г2-вход-авраам-исаак-иаков', адрес: 'genealogiya?vhod=avraam-iakov' },
  { имя: 'г3-иисус-христос', адрес: 'genealogiya?p=iisus' },
  { имя: 'г4-каинан', адрес: 'genealogiya?p=kainan-syn-arfaksada' },
  { имя: 'г5-лист-рёбер-иаков', адрес: 'genealogiya?p=iakov&edge=up:iakov' },
  { имя: 'г6-предки-давида', адрес: 'genealogiya?p=david&show=predki' },
  { имя: 'г7-потомки-аарона', адрес: 'genealogiya?p=aaron&show=potomki' },
  { имя: 'г8-весь-лес-издали', адрес: 'genealogiya?p=iakov&open=все', издали: true },
];

/** Файлы GEDCOM для проверки человеком на GED-inline (https://ged-inline.org) и импорта в Gramps (03 § 22.3; П14). */
function выгрузки() {
  const г = загрузитьГраф();
  const л = построитьЛес(г);
  const дата = new Date().toISOString().slice(0, 10);
  const ид = (x: string) => г.ид(x);
  const наборы: Record<string, number[]> = {
    'потомки-аарона': потомки(г, ид('aaron')).строки.map((s) => s.лицо),
    'предки-давида': [ид('david'), ...предки(г, ид('david')).группы.flatMap((x) => x.строки.map((s) => s.лицо))],
    'весь-лес': [...Array(г.лица.length).keys()].filter((i) => л.в[i]),
  };
  for (const [имя, xs] of Object.entries(наборы)) {
    const ged = выгрузитьGedcom(г, xs, { дата, описание: имя });
    const ош = проверитьGedcom(ged);
    if (ош.length) throw new Error(`${имя}: ${ош[0].текст}`);
    writeFileSync(join(OUT, `${имя}.ged`), ged);
  }
}

async function main() {
  выгрузки();
  const { origin, base, close } = await сервер();
  const browser = await chromium.launch();
  const итог: { сцена: string; окно: string; тема: string; ошибки: string[]; прокрутка: number }[] = [];
  for (const окно of [{ имя: '1280', w: 1280, h: 800 }, { имя: '360', w: 360, h: 640 }]) {
    for (const тема of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ viewport: { width: окно.w, height: окно.h }, colorScheme: тема, ...(окно.w < 600 && { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }) });
      for (const с of СЦЕНЫ) {
        const p = await ctx.newPage();
        const ошибки: string[] = [];
        p.on('pageerror', (e) => ошибки.push(String(e)));
        p.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text()); });
        await p.goto(`${origin}${base}${с.адрес}${с.адрес.includes('?') ? '&' : '?'}age=null&theme=${тема}`);
        await p.waitForFunction(() => document.documentElement.dataset.готово === '1');
        await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && (document.querySelectorAll('[data-пр]').length > 0 || !!document.querySelector('.отчёт, .входы')), null, { timeout: 30000 });
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(300);
        if (с.издали) {
          await p.focus('[data-пр][tabindex="0"]');
          for (let i = 0; i < 10; i++) await p.keyboard.press('Minus');
          await p.waitForTimeout(200);
        }
        if (с.адрес.includes('edge=')) await p.evaluate(() => document.querySelector('.лист-ребра')?.scrollIntoView({ block: 'start' }));
        else if (с.адрес.includes('p=') && !с.адрес.includes('show=')) await p.evaluate(() => document.getElementById('описание-схемы')?.scrollIntoView({ block: 'start' }));
        await p.waitForTimeout(100);
        const прокрутка = await p.evaluate((w) => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - w, окно.w);
        await p.screenshot({ path: join(OUT, `${с.имя}-${окно.имя}-${тема === 'light' ? 'светлая' : 'тёмная'}.png`) });
        итог.push({ сцена: с.имя, окно: окно.имя, тема, ошибки, прокрутка });
        await p.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  await close();
  writeFileSync(join(OUT, 'проверки.json'), JSON.stringify(итог, null, 1));
  const плохо = итог.filter((x) => x.ошибки.length || x.прокрутка > 0);
  console.log(`снимков ${итог.length}; с ошибками JS или горизонтальной прокруткой — ${плохо.length}`);
  for (const x of плохо) console.log(x);
  process.exit(плохо.length ? 1 : 0);
}
void main();
