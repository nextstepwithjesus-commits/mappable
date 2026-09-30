/** Сценарии приёмки этапа 3: компоновка, рамка неба, камера, перелёты, вступление, переходы карточки. Номера 30–49. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { ROOT } from '../bible.ts';
import { pass, fail, find, hashId, type Scenario } from './kit.ts';

type How = 'mouse' | 'touch' | 'key';

/** Видимая часть неба и камера (data-view, SkyView): px холста и мировые величины. */
async function view(p: Page) {
  const [l, t, r, b, x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  return { l, t, r, b, x0, kx, laneTop, ky };
}
/** Звезда выбранного лица, px холста (data-sel), или null. */
async function selAt(p: Page): Promise<{ x: number; y: number } | null> {
  const v = await p.locator('.sky').getAttribute('data-sel');
  if (!v) return null;
  const [x, y] = v.split(' ').map(Number);
  return { x, y };
}
/** Выбранное лицо видно: звезда в видимой части неба и сверху в этой точке — сам холст (не панель, не органы, не лист). */
async function selVisible(p: Page): Promise<string> {
  const q = await selAt(p);
  if (!q) return 'нет выбранной звезды';
  const v = await view(p);
  if (q.x < v.l || q.x > v.r || q.y < v.t || q.y > v.b) return `звезда (${q.x.toFixed(0)}, ${q.y.toFixed(0)}) вне видимой части ${v.l.toFixed(0)}…${v.r.toFixed(0)} × ${v.t.toFixed(0)}…${v.b.toFixed(0)}`;
  const top = (await p.evaluate(
    `(() => { const c = document.querySelector('.sky canvas').getBoundingClientRect(); const e = document.elementFromPoint(c.left + ${q.x}, c.top + ${q.y}); return e ? (e.tagName === 'CANVAS' ? 'canvas' : e.className || e.tagName) : 'ничего'; })()`,
  )) as string;
  return top === 'canvas' ? '' : `звезду закрывает «${top}»`;
}
/** Доля неба в ширине окна. */
async function skyShare(p: Page) {
  const w = (await p.locator('.sky').boundingBox())!.width;
  return { w, share: w / (p.viewportSize()!.width) };
}
/** Панель и карточка не пересекаются. */
async function overlap(p: Page): Promise<number> {
  return (await p.evaluate(`(() => {
    const s = document.querySelector('.sheet'), f = document.querySelector('.folio:not([hidden])');
    if (!s || !f) return 0;
    const a = s.getBoundingClientRect(), b = f.getBoundingClientRect();
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  })()`)) as number;
}
/**
 * Органы неба доступны: «Вписать» видно и нажимается (сверху в его середине — он сам). Этап 11 (Я30): команда органов
 * неба «Всё небо» стала «Вписать» — «Всё небо» теперь только показ (строка показа).
 */
async function controlsOk(p: Page): Promise<string> {
  const btn = p.locator('.skyctl button', { hasText: 'Вписать' }).first();
  if (!(await btn.count())) return 'нет «Вписать»';
  const b = await btn.boundingBox();
  if (!b) return '«Вписать» не видно';
  const own = await p.evaluate(`(() => { const e = document.elementFromPoint(${b.x + b.width / 2}, ${b.y + b.height / 2}); return !!e && !!e.closest('.skyctl'); })()`);
  return own ? '' : '«Вписать» закрыто';
}
async function tapOrClick(p: Page, loc: ReturnType<Page['locator']>, how: How) {
  if (how === 'touch') await loc.tap();
  else if (how === 'key') {
    await loc.focus();
    await p.keyboard.press('Enter');
  } else await loc.click();
}
/** Открыть панель командой верхней строки (или из «Ещё»); «Эпохи» — из органов неба. */
async function openPanel(p: Page, name: string, how: How = 'mouse') {
  if (name === 'Эпохи') {
    const b = p.locator('.skyctl .chrono button', { hasText: 'Эпохи' });
    const toggle = p.locator('.skyctl .view-toggle');
    if (await toggle.count()) {
      if (!(await b.count())) await tapOrClick(p, toggle, how);
      await p.waitForTimeout(200);
      await tapOrClick(p, b, how);
    } else {
      await tapOrClick(p, p.locator('.skyctl.column button', { hasText: 'Вид' }), how);
      await p.waitForTimeout(200);
      await tapOrClick(p, p.locator('.sheet button', { hasText: 'Эпохи и их основания' }), how);
    }
  } else {
    const direct = p.locator('.commands > button', { hasText: name });
    if ((await direct.count()) && (await direct.first().isVisible())) await tapOrClick(p, direct.first(), how);
    else {
      await tapOrClick(p, p.locator('.commands .more > button'), how);
      await p.waitForTimeout(150);
      const item = p.locator('.commands .more [role^="menuitem"]', { hasText: name }).first();
      if (how === 'key') {
        await item.focus();
        await p.keyboard.press('Enter');
      } else await tapOrClick(p, item, how);
    }
  }
  await p.waitForTimeout(700);
}
const sheetTitle = async (p: Page) => ((await p.locator('.sheet h2').count()) ? (await p.locator('.sheet h2').first().innerText()).trim() : '');

/** Полосы неба из собранного индекса. */
function lanes(): { min: number; max: number } {
  const a = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { models: { layout: { laneMin: number; laneMax: number } }[] };
  return { min: a.models[0].layout.laneMin, max: a.models[0].layout.laneMax };
}
/** Все полосы в видимой части неба. */
async function allLanes(p: Page): Promise<string> {
  const v = await view(p);
  const { min, max } = lanes();
  const top = (v.laneTop - max) * v.ky;
  const bottom = (v.laneTop - min) * v.ky;
  return top >= v.t - 1 && bottom <= v.b + 1 ? '' : `полосы ${top.toFixed(0)}…${bottom.toFixed(0)} px при видимой части ${v.t.toFixed(0)}…${v.b.toFixed(0)}`;
}

/** U6: карточка, затем «Указатель», затем «Синопсис» — небо не уже 40 %, лицо видно, органы неба доступны. */
function u6(how: How): Scenario['run'] {
  return async (p) => {
    await p.goto(p.url().replace(/#.*$/, '') + '#/david');
    await p.waitForTimeout(1500);
    const notes: string[] = [];
    for (const name of ['Указатель', 'Синопсис']) {
      await openPanel(p, name, how);
      const t = await sheetTitle(p);
      if (!t) return fail(`«${name}» не открылся`);
      const phone = p.viewportSize()!.width <= 720;
      if (!phone) {
        const { w, share } = await skyShare(p);
        if (share < 0.4 - 1e-3) return fail(`${name}: небо ${w.toFixed(0)} px — ${(share * 100).toFixed(0)} %`);
        if ((await overlap(p)) > 0) return fail(`${name}: панель легла на карточку`);
        const vis = await selVisible(p);
        if (vis) return fail(`${name}: ${vis}`);
        const ctl = await controlsOk(p);
        if (ctl) return fail(`${name}: ${ctl}`);
        notes.push(`${name}: небо ${w.toFixed(0)} px`);
      } else {
        // телефон: панель — полноэкранный лист; «×» возвращает к карточке, лицо видно над листом карточки
        await tapOrClick(p, p.locator('.sheet .close').first(), how);
        await p.waitForTimeout(500);
        if (await p.locator('.sheet').count()) return fail(`${name}: «×» не закрыл лист`);
        if (hashId(p) !== 'david') return fail(`${name}: после «×» выбрано «${hashId(p)}»`);
        const vis = await selVisible(p);
        if (vis) return fail(`${name}, после «×»: ${vis}`);
        notes.push(`${name}: лист и «×»`);
      }
    }
    return pass(notes.join('; '));
  };
}

const PANELS = ['Указатель', 'Главы', 'Синопсис', 'Родство', 'Сквозной раздел', 'Условные знаки', 'О карте', 'Эпохи'];

export const layout: Scenario[] = [
  { n: 30, title: 'U6 мышью, 1024 × 768: карточка → «Указатель» → «Синопсис»; небо ≥ 40 %, Давид виден, органы неба доступны', view: { width: 1024, height: 768 }, run: u6('mouse') },
  { n: 31, title: 'U6 с клавиатуры, 1024 × 768', view: { width: 1024, height: 768 }, run: u6('key') },
  { n: 32, title: 'U6 пальцем, планшет 768 × 1024', view: { width: 768, height: 1024, touch: true }, run: u6('touch') },
  { n: 33, title: 'U6 пальцем, телефон 390 × 844: панель — лист поверх карточки, «×» возвращает к ней', view: { width: 390, height: 844, touch: true }, run: u6('touch') },
  {
    n: 34,
    title: 'Все панели при открытой карточке, 1024 и 1440: небо ≥ 40 %, панель не на карточке, лицо видно, органы доступны (C1)',
    run: async (p) => {
      const notes: string[] = [];
      for (const [w, h] of [[1024, 768], [1440, 900]] as const) {
        await p.setViewportSize({ width: w, height: h });
        await p.goto(p.url().replace(/#.*$/, '') + '#/solomon');
        await p.waitForTimeout(1500);
        let spines = 0;
        for (const name of PANELS) {
          await openPanel(p, name);
          const t = await sheetTitle(p);
          if (!t) return fail(`${w}: «${name}» не открылся`);
          const { w: sw, share } = await skyShare(p);
          if (share < 0.4 - 1e-3) return fail(`${w}, ${t}: небо ${sw.toFixed(0)} px`);
          if ((await overlap(p)) > 0) return fail(`${w}, ${t}: панель на карточке`);
          const vis = await selVisible(p);
          if (vis) return fail(`${w}, ${t}: ${vis}`);
          const ctl = await controlsOk(p);
          if (ctl) return fail(`${w}, ${t}: ${ctl}`);
          if (await p.locator('.folio.spine').count()) spines++;
          await p.locator('.sheet .close').first().click();
          await p.waitForTimeout(400);
          if (await p.locator('.folio.spine').count()) return fail(`${w}: после «${t}» карточка осталась корешком`);
        }
        notes.push(`${w}: ${PANELS.length} панелей, корешок у ${spines}`);
      }
      return pass(notes.join('; '));
    },
  },
  {
    n: 35,
    title: 'Корешок карточки: имя и «развернуть»; «развернуть» закрывает панель и возвращает карточку (C1)',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await find(p, 'Руфь');
      await openPanel(p, 'Синопсис');
      const spine = p.locator('.folio.spine');
      if (!(await spine.count())) return fail('при синопсисе на 1024 карточка не свернулась');
      const bw = (await spine.boundingBox())!.width;
      if (Math.round(bw) !== 56) return fail(`корешок ${bw} px`);
      const txt = (await spine.innerText()).replace(/\s+/g, ' ');
      if (!/Руфь/.test(txt) || !/развернуть/.test(txt)) return fail(`на корешке: «${txt}»`);
      await spine.locator('.unfold').click();
      await p.waitForTimeout(500);
      if (await p.locator('.sheet').count()) return fail('панель не закрылась');
      if (!(await p.locator('.folio:not(.spine) h2').count())) return fail('карточка не развернулась');
      const vis = await selVisible(p);
      return vis ? fail(vis) : pass();
    },
  },
  {
    n: 36,
    title: 'Лицо видно после перелёта: при панели слева, с ярусами эпох (D2, C1)',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const notes: string[] = [];
      for (const name of ['Указатель', 'Родство', 'О карте']) {
        await openPanel(p, name);
        await p.fill('#find', 'Авраам');
        await p.waitForTimeout(300);
        await p.keyboard.press('Enter');
        await p.waitForTimeout(1800);
        const vis = await selVisible(p);
        if (vis) return fail(`${name}: ${vis}`);
        notes.push(name);
        await p.goto(p.url().replace(/#.*$/, '') + '#/');
        await p.waitForTimeout(800);
      }
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
      await p.waitForTimeout(500);
      for (const q of ['Езекия', 'Давид']) {
        await find(p, q);
        const vis = await selVisible(p);
        if (vis) return fail(`ярусы, ${q}: ${vis}`);
        const v = await view(p);
        if (v.t < 150) return fail(`видимая часть не учитывает ярусы: верх ${v.t}`);
      }
      notes.push('ярусы эпох');
      return pass(notes.join(', '));
    },
  },
  {
    n: 37,
    title: 'Лицо видно после перелёта на телефоне: над нижним листом карточки (D2)',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      for (const q of ['Давид', 'Руфь', 'Павел']) {
        await find(p, q);
        const vis = await selVisible(p);
        if (vis) return fail(`${q}: ${vis}`);
        const v = await view(p);
        const sheet = await p.locator('.folio').boundingBox();
        const sky = (await p.locator('.sky').boundingBox())!;
        if (sheet && v.b > sheet.y - sky.y + 1) return fail(`видимая часть заходит под лист: ${v.b} > ${(sheet.y - sky.y).toFixed(0)}`);
      }
      return pass();
    },
  },
  {
    n: 38,
    // этап 11 (Я30): команда органов неба «Всё небо» — теперь «Вписать» (весь нынешний показ в окне; показ — всё небо)
    title: 'U7, 1440: «Вписать» на всём небе показывает все полосы, Адама и Иисуса Христа; дальше не отдаляется (D2)',
    run: async (p) => {
      const all = p.locator('.skyctl button', { hasText: 'Вписать' });
      await p.locator('.skyctl button[aria-label="Приблизить"]').click();
      await p.locator('.skyctl button[aria-label="Приблизить"]').click();
      await p.waitForTimeout(500);
      if (!(await allLanes(p))) return fail('после приближения всё ещё видны все полосы');
      await all.click();
      await p.waitForTimeout(1600);
      const lanesNow = await allLanes(p);
      if (lanesNow) return fail(`«Вписать»: ${lanesNow}`);
      const k = (await view(p)).kx;
      // у предела «−» выключена (aria-disabled, IX-62): нажатие всё равно не отдаляет
      const out = p.locator('.skyctl button[aria-label="Отдалить"]');
      if ((await out.getAttribute('aria-disabled')) !== 'true') return fail('на «всём небе» «−» не выключена');
      await out.click({ force: true });
      await p.waitForTimeout(400);
      if (Math.abs((await view(p)).kx / k - 1) > 1e-3) return fail('«−» отдалил дальше «всего неба»');
      for (const id of ['iisus', 'adam']) {
        await p.goto(p.url().replace(/#.*$/, '') + `#/${id}`);
        await p.waitForTimeout(1600);
        await all.click();
        await p.waitForTimeout(1600);
        const vis = await selVisible(p);
        if (vis) return fail(`${id} после «Вписать»: ${vis}`);
        const l = await allLanes(p);
        if (l) return fail(`${id}: ${l}`);
      }
      return pass();
    },
  },
  {
    n: 39,
    title: 'U7, телефон 390 × 844: «Вписать» на всём небе — все полосы, Адам и Иисус Христос, в том числе над листом карточки',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      const all = p.locator('.skyctl button', { hasText: 'Вписать' });
      await p.locator('.skyctl button[aria-label="Приблизить"]').tap();
      await p.waitForTimeout(400);
      await all.tap();
      await p.waitForTimeout(1600);
      const l = await allLanes(p);
      if (l) return fail(`«Вписать»: ${l}`);
      for (const id of ['iisus', 'adam']) {
        await p.goto(p.url().replace(/#.*$/, '') + `#/${id}`);
        await p.waitForTimeout(1600);
        await all.tap();
        await p.waitForTimeout(1600);
        const vis = await selVisible(p);
        if (vis) return fail(`${id}: ${vis}`);
        const l2 = await allLanes(p);
        if (l2) return fail(`${id}: ${l2}`);
      }
      return pass();
    },
  },
  {
    n: 40,
    title: 'D3: звезда у правого края не уходит под открывшуюся карточку (сдвиг за 250 мс)',
    run: async (p) => {
      const plus = p.locator('.skyctl button[aria-label="Приблизить"]');
      await plus.click();
      await p.waitForTimeout(400);
      await plus.click();
      await p.waitForTimeout(400);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      // звезда в правой полосе шириной с будущую карточку, выше органов неба
      let hit: { x: number; y: number; name: string } | null = null;
      for (let y = box.y + 80; y < box.y + box.height - 160 && !hit; y += 7)
        for (let x = box.x + box.width - 140; x > box.x + box.width - 460 && !hit; x -= 9) {
          await p.mouse.move(x, y);
          const tip = p.locator('.sky .tip b');
          if (await tip.count()) hit = { x, y, name: (await tip.innerText()).trim() };
        }
      if (!hit) return fail('не нашлось звезды у правого края');
      await p.mouse.click(hit.x, hit.y);
      await p.waitForTimeout(700);
      if (!hashId(p)) return fail(`щелчок по «${hit.name}» не выбрал лицо`);
      const vis = await selVisible(p);
      return vis ? fail(`${hit.name}: ${vis}`) : pass(hit.name);
    },
  },
  {
    n: 41,
    title: 'D15: переключение масштаба времени держит выбранное лицо на месте (ТЗ § 11.2 п. 6)',
    run: async (p) => {
      await find(p, 'Авраам');
      const a = await selAt(p);
      if (!a) return fail('Авраам не на небе');
      await p.locator('.skyctl .view-toggle').click();
      await p.locator('.skyctl').getByText('истинный', { exact: true }).click();
      await p.waitForTimeout(900);
      const b = await selAt(p);
      await p.locator('.skyctl').getByText('по насыщенности', { exact: true }).click();
      await p.waitForTimeout(900);
      const c = await selAt(p);
      if (!b || !c) return fail('лицо пропало');
      const d1 = Math.hypot(b.x - a.x, b.y - a.y);
      const d2 = Math.hypot(c.x - a.x, c.y - a.y);
      return d1 <= 2 && d2 <= 2 ? pass(`сдвиг ${d1.toFixed(1)} и ${d2.toFixed(1)} px`) : fail(`лицо сдвинулось на ${d1.toFixed(0)} и ${d2.toFixed(0)} px`);
    },
  },
  {
    n: 42,
    title: 'C5: вступление закрывается только «×»; колесо и протяжка его не закрывают; начало лент не под ним; «Как читать карту» возвращает его',
    run: async (p) => {
      await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'open'));
      await p.reload();
      await p.waitForTimeout(1800);
      const cart = p.locator('.cartouche');
      if (!(await cart.count())) return fail('вступления нет при первом визите');
      const bg = await cart.evaluate((e) => getComputedStyle(e).backgroundColor);
      if (/rgba\([^)]*,\s*0?\.\d+\)|transparent/.test(bg)) return fail(`фон вступления прозрачный: ${bg}`);
      const text = (await cart.innerText()).replace(/\s+/g, ' ');
      for (const w of ['Как читать карту', 'клавиша /', 'буквы слева', 'полоса времени', 'Щёлкните эпоху']) if (!text.includes(w)) return fail(`во вступлении нет «${w}»`);
      // первое окно: «всё небо» справа от таблички
      const cb = (await cart.boundingBox())!;
      const sky = (await p.locator('.sky').boundingBox())!;
      const v = await view(p);
      if (v.l < cb.x + cb.width - sky.x) return fail(`небо вписано под табличку: левый край видимой части ${v.l}, табличка до ${(cb.x + cb.width - sky.x).toFixed(0)}`);
      const l = await allLanes(p);
      if (l) return fail(`первое окно: ${l}`);
      // колесо и протяжка по небу
      const cx = sky.x + sky.width * 0.7;
      const cy = sky.y + sky.height * 0.4;
      await p.mouse.move(cx, cy);
      await p.mouse.wheel(0, -200);
      await p.waitForTimeout(300);
      await p.mouse.down();
      await p.mouse.move(cx - 80, cy + 30, { steps: 5 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      if (!(await cart.count())) return fail('колесо или протяжка закрыли вступление');
      await cart.locator('.close').click();
      await p.waitForTimeout(400);
      if (await cart.count()) return fail('«×» не свернул вступление');
      const cmd = p.locator('.sky .guide-cmd');
      if (!(await cmd.count()) || !/Как читать карту/.test(await cmd.innerText())) return fail('нет команды «Как читать карту»');
      await p.reload();
      await p.waitForTimeout(1500);
      if (await cart.count()) return fail('после перезагрузки свёрнутое вступление открылось снова');
      await cmd.click();
      await p.waitForTimeout(300);
      if (!(await cart.count())) return fail('«Как читать карту» не открыл вступление');
      // тот же текст — в начале «Условных знаков»
      await openPanel(p, 'Условные знаки');
      const first = (await p.locator('.sheet h3').first().innerText()).trim();
      if (first !== 'Как читать карту') return fail(`«Условные знаки» начинаются с «${first}»`);
      const legend = (await p.locator('.sheet .guide').innerText()).replace(/\s+/g, ' ');
      return /Касание/.test(legend) && /Мышь/.test(legend) ? pass() : fail('в «Условных знаках» нет касаний или мыши');
    },
  },
  {
    n: 43,
    title: 'C5, MOB-07: телефон в альбомной ориентации (844 × 390) — вступление одной строкой, «Свернуть» 44 px; о касаниях сказано',
    view: { width: 844, height: 390, touch: true },
    run: async (p) => {
      await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'open'));
      await p.reload();
      await p.waitForTimeout(1800);
      const cart = p.locator('.cartouche');
      if (!(await cart.count())) return fail('вступления нет');
      // небо ниже 520 px (MOB-07): вступление — одна строка «Толедот, коснитесь звезды… — Как читать карту — Свернуть»,
      // небо над ней видно; «Свернуть» — цель 44 px
      const cb = (await cart.boundingBox())!;
      if (cb.height > 60) return fail(`вступление не одной строкой: ${cb.height} px`);
      const close = cart.locator('button', { hasText: 'Свернуть' });
      const b = await close.boundingBox();
      if (!b || b.y < 0 || b.y + b.height > 390) return fail(`«×» вне экрана: ${JSON.stringify(b)}`);
      if (b.width < 44 || b.height < 44) return fail(`«Свернуть» ${b.width} × ${b.height}`);
      const touchLine = cart.locator('.for-touch');
      if (!(await touchLine.isVisible())) return fail('на сенсорном экране нет строки о касаниях');
      await close.tap();
      await p.waitForTimeout(300);
      return (await cart.count()) ? fail('«Свернуть» не свернул вступление') : pass();
    },
  },
  {
    n: 44,
    title: 'D11: без «Загрузки…» при переходах; «×» снимает только выбор; прокрутка панели помнится',
    run: async (p) => {
      await p.evaluate(() => {
        const w = window as unknown as { __loading: number };
        w.__loading = 0;
        new MutationObserver(() => {
          if (document.querySelector('.folio')?.textContent?.includes('Загрузка карточки')) w.__loading++;
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      await find(p, 'Давид');
      await p.locator('.folio button.person', { hasText: 'Соломон' }).first().click();
      await p.waitForTimeout(600);
      if (hashId(p) !== 'solomon') return fail(`после ссылки выбрано «${hashId(p)}»`);
      await find(p, 'Павел');
      const flashes = (await p.evaluate('window.__loading')) as number;
      if (flashes) return fail(`«Загрузка карточки…» мелькнула ${flashes} раз`);
      // «×» карточки — только карточка; панель остаётся. «×» закрывает карточку, как вкладку (этап 7, решение 18):
      // открывается прежняя из стопки; после последней выбор снят
      await openPanel(p, 'Указатель');
      for (let i = 0; i < 6 && hashId(p); i++) {
        await p.locator('.folio .close').first().click();
        await p.waitForTimeout(500);
        if ((await sheetTitle(p)) !== 'Указатель') return fail('«×» карточки закрыл и панель');
      }
      if (hashId(p)) return fail('«×» не снял выбор');
      // прокрутка панели
      await p.locator('.sheet').evaluate((e) => (e.scrollTop = 900));
      await p.waitForTimeout(100);
      await openPanel(p, 'О карте');
      await openPanel(p, 'Указатель');
      const top = await p.locator('.sheet').evaluate((e) => e.scrollTop);
      return Math.abs(top - 900) <= 2 ? pass() : fail(`прокрутка «Указателя» после возврата: ${top}`);
    },
  },
  {
    n: 45,
    title: 'D11: том карточки не загрузился — сообщение и «Повторить», а не вечная «Загрузка…»',
    run: async (p) => {
      await p.route(/\/assets\/17-[^/]*\.js$/, (r) => r.abort());
      // отказ сети для тома 17 — нарочно: необработанные отказы других загрузчиков тома считаются, но не роняют сценарий
      await p.evaluate(() => {
        const w = window as unknown as { __rejected: string[] };
        w.__rejected = [];
        window.addEventListener('unhandledrejection', (e) => {
          const m = String((e.reason as Error)?.message ?? e.reason);
          if (/dynamically imported module/.test(m)) {
            w.__rejected.push(m);
            e.preventDefault();
          }
        });
      });
      await p.goto(p.url().replace(/#.*$/, '') + '#/pavel');
      await p.waitForTimeout(2000);
      const err = p.locator('.folio .load-error');
      if (!(await err.count())) return fail(`нет сообщения об ошибке; в карточке: «${(await p.locator('.folio').innerText()).slice(0, 120)}»`);
      if (!(await err.locator('button', { hasText: 'Повторить' }).count())) return fail('нет «Повторить»');
      if (/Загрузка карточки/.test(await p.locator('.folio').innerText())) return fail('«Загрузка карточки…» осталась');
      const rejected = ((await p.evaluate('window.__rejected')) as string[]).length;
      return pass(rejected ? `необработанных отказов загрузки тома вне карточки: ${rejected}` : '');
    },
  },
  {
    n: 46,
    title: 'D4: нажатие на холсте прерывает перелёт; при prefers-reduced-motion перелёт — сразу',
    run: async (p) => {
      await p.fill('#find', 'Павел');
      await p.waitForTimeout(300);
      const v0 = await view(p);
      await p.keyboard.press('Enter');
      // дождаться, когда перелёт начнётся (небо сдвинулось), и нажать посреди него
      let started = false;
      for (let i = 0; i < 40 && !started; i++) {
        await p.waitForTimeout(25);
        const v = await view(p);
        started = Math.abs(v.x0 - v0.x0) * v.kx > 30 || Math.abs(v.kx / v0.kx - 1) > 0.1;
      }
      if (!started) return fail('перелёт не начался');
      const sky = (await p.locator('.sky canvas').boundingBox())!;
      // точка на самом небе: у верхней кромки слева теперь строка показа (этап 11, решение 81) — ниже неё
      let py = sky.y + 60;
      while (py < sky.y + sky.height - 60 && !(await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', { x: sky.x + 60, y: py }))) py += 20;
      await p.mouse.move(sky.x + 60, py);
      // указатель нажат и держится: отпускание без сдвига — щелчок по пустому небу, он снимает выбор (D3, агент nav)
      await p.mouse.down();
      await p.waitForTimeout(100); // data-view пишется кадром неба — после нажатия нужен ещё один кадр
      const a = await view(p);
      await p.waitForTimeout(700);
      const b = await view(p);
      await p.mouse.up();
      if (Math.abs(a.x0 - b.x0) * a.kx > 1 || Math.abs(a.kx / b.kx - 1) > 1e-3) return fail('перелёт продолжился после нажатия');
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.fill('#find', 'Авраам');
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(150);
      const c = await view(p);
      await p.waitForTimeout(800);
      const d = await view(p);
      if (Math.abs(c.x0 - d.x0) * c.kx > 1) return fail('при ослабленном движении небо ещё двигалось');
      const vis = await selVisible(p);
      return vis ? fail(vis) : pass();
    },
  },
  {
    n: 47,
    title: 'Панель, открытая снова, стоит там же: буква указателя и фильтр помнятся (D11)',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/');
      await p.waitForTimeout(800);
      const open = () => p.locator('.commands').getByText('Указатель', { exact: true }).click();
      await open();
      await p.waitForTimeout(300);
      await p.locator('.sheet [role="group"][aria-label="Буква"] button', { hasText: /^Д$/ }).click();
      await p.fill('.sheet .field input', 'дав');
      await p.waitForTimeout(200);
      await p.locator('.sheet .sheet-head .close').click();
      await p.waitForTimeout(200);
      await open();
      await p.waitForTimeout(300);
      const pressed = await p.locator('.sheet [role="group"][aria-label="Буква"] button[aria-pressed="true"]').innerText();
      const filter = await p.locator('.sheet .field input').inputValue();
      return pressed === 'Д' && filter === 'дав' ? pass('буква «Д», фильтр «дав»') : fail(`после повторного открытия: буква «${pressed}», фильтр «${filter}»`);
    },
  },
];
