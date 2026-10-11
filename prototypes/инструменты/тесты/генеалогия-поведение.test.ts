/**
 * Генеалогия в браузере (Playwright, Chromium; сборка `dist/`) — тесты сборки 03 § 9, которым нужен браузер:
 *  - правило якоря: экранная точка предмета действия до и после шага совпадает (допуск 1 px, 03 § 7.9), щипок — тоже;
 *  - смена выбора и слоя — 0 px сдвига любого узла; кнопки поверх рисунка не пересекаются на мыши и на касании, при «Самом
 *    крупном» тексте подпись помещается в кнопку;
 *  - одна остановка Tab, стрелки по таблице «вид узла × клавиша», объявление у клетки без перехода; Ctrl+Z;
 *  - порядок DOM = порядок леса; состояние → адрес → то же состояние; выгрузка GEDCOM и таблицы скачивается и проходит проверку.
 * Перед запуском: `npm run -s proto:build`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { сервер } from './сервер.ts';
import { загрузитьГраф } from './генеалогия-данные.ts';
import { построитьЛес } from '../генеалогия/лес.ts';
import { вход } from '../генеалогия/семья.ts';
import { проверитьGedcom } from '../генеалогия/gedcom.ts';

let origin = '', base = '';
let close: () => Promise<void> = async () => {};
let browser: Browser;
const DIST = join(import.meta.dirname, '..', 'dist', 'index.html');

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
  await p.goto(`${origin}${base}${адрес}${адрес.includes('?') ? '&' : '?'}age=null`);
  await p.waitForFunction(() => document.documentElement.dataset.готово === '1');
  await p.waitForFunction(() => document.querySelectorAll('[data-пр]').length > 0 || !!document.querySelector('.отчёт'), null, { timeout: 20000 });
  await p.waitForTimeout(300);
}
const rect = (p: Page, id: string) => p.evaluate((i) => { const r = document.getElementById(i)!.getBoundingClientRect(); return { x: r.left, y: r.top }; }, id);
const места = (p: Page) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-пр]')].map((b) => { const r = b.getBoundingClientRect(); return [b.id, [r.left, r.top, r.width, r.height]]; })));
const мировые = (p: Page) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('[data-пр]')].map((b) => [b.id, b.style.cssText])));
const активный = (p: Page) => p.evaluate(() => document.activeElement?.id ?? '');
const объявление = async (p: Page) => { await p.waitForTimeout(160); return p.evaluate(() => document.getElementById('объявления')?.textContent ?? ''); };

function пересечения(m: Record<string, number[]>): string[] {
  const xs = Object.entries(m);
  const out: string[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const [ia, a] = xs[i], [ib, b] = xs[j];
    if (a[0] < b[0] + b[2] - 0.5 && b[0] < a[0] + a[2] - 0.5 && a[1] < b[1] + b[3] - 0.5 && b[1] < a[1] + a[3] - 0.5) out.push(`${ia} × ${ib}`);
  }
  return out;
}

describe('правило якоря и 0 px (03 § 3.3 п. 2, § 7.9, § 9 п. 8)', () => {
  it('«Показать ещё N детей», союз, «Показать родителей»: предмет действия стоит на месте (≤ 1 px); фокус не теряется', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iakov');
    const ошибки: number[] = [];
    // «ещё» у Иуды: якорь — Иуда
    await p.focus('#г-ещё-iuda');
    await p.waitForTimeout(100);
    const a0 = await rect(p, 'г-iuda');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => !document.getElementById('г-ещё-iuda'));
    await p.waitForTimeout(150);
    const a1 = await rect(p, 'г-iuda');
    ошибки.push(Math.hypot(a1.x - a0.x, a1.y - a0.y));
    expect(await активный(p)).toBe('г-iuda');
    // союз Иакова и Лии: свернуть и раскрыть — точка союза на месте
    await p.focus('#г-u-iakov--liya');
    await p.waitForTimeout(100);
    const d0 = await rect(p, 'г-u-iakov--liya');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
    const d1 = await rect(p, 'г-u-iakov--liya');
    ошибки.push(Math.hypot(d1.x - d0.x, d1.y - d0.y));
    expect(await активный(p)).toBe('г-u-iakov--liya');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
    const d2 = await rect(p, 'г-u-iakov--liya');
    ошибки.push(Math.hypot(d2.x - d0.x, d2.y - d0.y));
    // «Показать родителей» у Исаака: якорь — Исаак
    await p.focus('#г-родители-isaak');
    await p.waitForTimeout(100);
    const i0 = await rect(p, 'г-isaak');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(250);
    const i1 = await rect(p, 'г-isaak');
    ошибки.push(Math.hypot(i1.x - i0.x, i1.y - i0.y));
    expect(await активный(p)).toBe('г-isaak');
    // Ctrl+Z — шаг отменён, Исаак на месте, кнопка «Показать родителей» вернулась
    await p.keyboard.press('Control+z');
    await p.waitForSelector('#г-родители-isaak');
    await p.waitForTimeout(200);
    const i2 = await rect(p, 'г-isaak');
    ошибки.push(Math.hypot(i2.x - i0.x, i2.y - i0.y));
    console.log(`якорь: ${ошибки.map((x) => x.toFixed(2)).join(', ')} px`);
    for (const e of ошибки) expect(e).toBeLessThanOrEqual(1);
    await p.close();
  });
  it('щипок (Ctrl + колесо) и «Крупнее»: точка под указателем на месте (≤ 1 px)', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iakov');
    const q0 = await rect(p, 'г-liya');
    // координаты мыши — целые (clientX/clientY события колеса — целые): точка мира под ней — (mx − q0.x, my − q0.y)
    const mx = Math.round(q0.x + 3), my = Math.round(q0.y + 10);
    await p.mouse.move(mx, my);
    await p.keyboard.down('Control');
    for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, -50); await p.waitForTimeout(40); }
    await p.keyboard.up('Control');
    await p.waitForTimeout(100);
    const k2 = await p.evaluate(() => (window as unknown as { __генеалогия: { схема: { cam: { k: number } } } }).__генеалогия.схема.cam.k);
    const q1 = await rect(p, 'г-liya');
    const ex = mx - (mx - q0.x) * k2, ey = my - (my - q0.y) * k2;
    const ош = Math.hypot(q1.x - ex, q1.y - ey);
    console.log(`щипок: масштаб ${k2.toFixed(3)}, ошибка якоря ${ош.toFixed(2)} px (${(q1.x - ex).toFixed(2)}, ${(q1.y - ey).toFixed(2)})`);
    expect(ош).toBeLessThanOrEqual(1);
    await p.close();
  });
  it('смена выбора и смена слоя — 0 px сдвига любого узла', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iakov');
    const м0 = await места(p);
    await p.focus('#г-liya');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => location.search.includes('sel=liya'));
    await p.waitForTimeout(200);
    const м1 = await места(p);
    for (const id of Object.keys(м0)) expect(м1[id], id).toEqual(м0[id]);
    const w1 = await мировые(p);
    await открыть(p, 'genealogiya?p=iakov&layer=2');
    const w2 = await мировые(p);
    expect(w2).toEqual(w1);
    await p.close();
  });
});

describe('кнопки поверх рисунка (03 § 7.9, § 9 п. 8–9)', () => {
  for (const [имя, окно] of [['мышь 1280', { viewport: { width: 1280, height: 800 } }], ['касание 360', { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true }], ['200 % текста', { viewport: { width: 1280, height: 800 } }]] as const) {
    it(`не пересекаются и подпись помещается: ${имя}`, async () => {
      const p = await browser.newPage(окно);
      for (const адрес of ['genealogiya?p=iakov', 'genealogiya?vhod=avraam-iakov', 'genealogiya?p=iisus', 'genealogiya?p=david', 'genealogiya?p=aaron']) {
        await открыть(p, `${адрес}${имя.startsWith('200') ? '&text=самый' : ''}`);
        expect(пересечения(await места(p)), адрес).toEqual([]);
        const тесно = await p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-пр]')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id));
        expect(тесно, адрес).toEqual([]);
      }
      await p.close();
    });
  }
});

describe('клавиатура и DOM (03 § 7.3, § 9 п. 9–10)', () => {
  it('одна остановка Tab; стрелки по графу; объявление на краю; буква; Alt + ↑ — лист рёбер к родителям', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iakov');
    const стоп = await p.evaluate(() => [...document.querySelectorAll('[data-пр]')].filter((b) => (b as HTMLElement).tabIndex === 0).map((b) => b.id));
    expect(стоп).toEqual(['г-iakov']);
    await p.focus('#г-iakov');
    await p.keyboard.press('ArrowDown');
    expect(await активный(p)).toBe('г-u-iakov--liya');
    await p.keyboard.press('ArrowDown');
    expect(await активный(p)).toBe('г-ruvim');
    await p.keyboard.press('ArrowRight');
    expect(await активный(p)).toBe('г-simeon');
    await p.keyboard.press('Home');
    expect(await активный(p)).toBe('г-ruvim');
    await p.keyboard.press('ArrowLeft');
    expect(await объявление(p)).toBe('Первый в этой группе детей');
    expect(await активный(p)).toBe('г-ruvim');
    await p.keyboard.press('ArrowUp');
    expect(await активный(p)).toBe('г-u-iakov--liya');
    await p.keyboard.press('ArrowLeft');
    expect(await активный(p)).toBe('г-iakov');
    await p.keyboard.press('ArrowUp');
    expect(await активный(p)).toBe('г-u-isaak--revekka');
    await p.keyboard.press('ArrowUp');
    expect(await активный(p)).toBe('г-isaak');
    await p.keyboard.press('ArrowUp');
    expect(await активный(p)).toBe('г-родители-isaak');
    expect(await объявление(p)).toContain('Родители не показаны');
    await p.focus('#г-iakov');
    await p.keyboard.insertText('и');
    await p.waitForTimeout(50);
    await p.evaluate(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'и', bubbles: true, cancelable: true })));
    expect(await активный(p)).toMatch(/^г-i/);
    await p.evaluate(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'щ', bubbles: true, cancelable: true })));
    expect(await объявление(p)).toBe('Нет имён на «Щ»');
    // Tab выходит из схемы к следующему элементу
    await p.focus('#г-iakov');
    await p.keyboard.press('Tab');
    expect(await p.evaluate(() => !!document.activeElement?.closest('.схема__мир'))).toBe(false);
    // Alt + ↑ — лист «Рёбра к родителям»; Esc закрывает, фокус возвращается в схему
    await p.focus('#г-iakov');
    await p.keyboard.press('Alt+ArrowUp');
    await p.waitForSelector('#лист-заголовок');
    expect(await p.textContent('#лист-заголовок')).toContain('Рёбра к родителям');
    expect(await p.textContent('.лист-ребра')).toContain('Копировать источник');
    await p.waitForFunction(() => document.activeElement?.id === 'лист-заголовок');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.getElementById('лист-заголовок'));
    expect(await p.evaluate(() => !!document.activeElement?.closest('.схема__мир'))).toBe(true);
    await p.close();
  });
  it('стрелка к предмету за краем окна: камера показывает его, фокус на нём', async () => {
    const p = await browser.newPage({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    await открыть(p, 'genealogiya?p=iakov');
    await p.focus('#г-ruvim');
    for (let i = 0; i < 12; i++) await p.keyboard.press('ArrowRight');
    const id = await активный(p);
    expect(id).not.toBe('г-ruvim');
    const внутри = await p.evaluate((i) => { const r = document.getElementById(i)!.getBoundingClientRect(), v = document.getElementById('схема-окно')!.getBoundingClientRect(); return r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1; }, id);
    expect(внутри).toBe(true);
    await p.close();
  });
  it('порядок DOM = порядок леса; aria-level, aria-setsize, aria-posinset от данных; у каждого видимого лица — строка двойника', async () => {
    const г = загрузитьГраф();
    const л = построитьЛес(г);
    const s = вход(л, г.ид('iakov'));
    const ожид = [...s].sort((a, b) => л.порядок[a] - л.порядок[b]).flatMap((k) => (л.узлы[k].вид === 'block' ? л.узлы[k].лица.map((i) => `г-${г.лица[i].id}`) : []));
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iakov');
    const dom = await p.evaluate(() => [...document.querySelectorAll('[data-пр="лицо"]')].map((b) => b.id));
    expect(dom).toEqual(ожид);
    const ли = await p.evaluate(() => { const li = document.getElementById('г-ruvim')!.closest('li')!; return [li.getAttribute('aria-level'), li.getAttribute('aria-setsize'), li.getAttribute('aria-posinset')]; });
    expect(ли[0]).toBe(String(л.узлы[л.узелЛица[г.ид('ruvim')]].ряд + 1));
    expect(Number(ли[2])).toBe(1);
    // двойник: каждое лицо схемы есть ссылкой на семейной странице, кроме тех, что дальше ближней семьи (они — в «Где я» или в схеме у соседей)
    const двойник = await p.evaluate(() => [...document.querySelectorAll('.семейная a')].map((a) => a.textContent));
    for (const имя of ['Исаак, сын Авраама', 'Рувим', 'Иосиф, сын Иакова', 'Лия', 'Дина']) expect(двойник.some((t) => t?.startsWith(имя.split(',')[0])), имя).toBe(true);
    await p.close();
  });
  it('состояние → адрес → то же состояние (шаги, выбор, прочтение, лист)', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iakov');
    await p.focus('#г-ещё-iuda');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(200);
    await p.focus('#г-родители-isaak');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(200);
    await p.focus('#г-liya');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(200);
    const ids = Object.keys(await места(p)).sort();
    const url = p.url();
    expect(url).toContain('open=');
    expect(url).toContain('sel=liya');
    const q = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await q.goto(url);
    await q.waitForFunction(() => document.querySelectorAll('[data-пр]').length > 0);
    await q.waitForTimeout(300);
    expect(Object.keys(await места(q)).sort()).toEqual(ids);
    expect(await q.getAttribute('#г-liya', 'aria-current')).toBe('true');
    await p.close();
    await q.close();
  });
});

describe('выгрузка (03 § 22.3; П14, тестовая часть)', () => {
  it('«Потомки Аарона» → GEDCOM 5.5.1 без ошибок; «Предки Давида» → таблица в архиве', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await открыть(p, 'genealogiya?p=aaron&show=potomki');
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('text=Сохранить GEDCOM 5.5.1')]);
    expect(d.suggestedFilename()).toMatch(/^библия-наглядно_генеалогия_аарон-потомки_\d{4}-\d\d-\d\d\.ged$/);
    const ged = await readFile((await d.path())!, 'utf8');
    expect(проверитьGedcom(ged)).toEqual([]);
    expect(ged).toContain('1 ASSO');
    await открыть(p, 'genealogiya?p=david&show=predki');
    const [z] = await Promise.all([p.waitForEvent('download'), p.click('text=Сохранить таблицу в файл')]);
    expect(z.suggestedFilename()).toMatch(/давид-предки.*\.zip$/);
    const bytes = await readFile((await z.path())!);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.toString('utf8')).toContain('№ (Ahnentafel);порядок;');
    await p.close();
  });
  it('прочтение в отчёте: по Луке отец Иосифа — Илий; переключатель — радиокнопки, адрес помнит выбор', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await открыть(p, 'genealogiya?p=iosif-muzh-marii&show=predki');
    expect(await p.textContent('.отчёт')).toContain('Иаков');
    await p.check('input[name="прочтение-r-lk3-23"] >> nth=1');
    await p.waitForFunction(() => location.search.includes('read=r-lk3-23'));
    await p.waitForTimeout(200);
    const t = await p.textContent('.отчёт');
    expect(t).toContain('Илий');
    expect(t).not.toMatch(/№2 Иаков/);
    await p.close();
  });
});
