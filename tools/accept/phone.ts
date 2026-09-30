/**
 * Сценарии приёмки этапа 6: телефон и планшет (H2–H7; U8). Номера 150–169.
 * Касания и протяжки — CDP Input.dispatchTouchEvent: у протяжки задаётся скорость.
 */
import type { Page } from 'playwright';
import { pass, fail, find, hashId, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };
const TABLET = { width: 768, height: 1024, touch: true };

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
/** Выбранное лицо видно: звезда в видимой части неба и сверху в этой точке — холст (не лист, не органы). */
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
const go = async (p: Page, hash: string, ms = 2200) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Положение листа карточки и его прямоугольник. */
async function sheet(p: Page) {
  return (await p.evaluate(`(() => {
    const f = document.querySelector('.folio:not([hidden])');
    if (!f) return null;
    const r = f.getBoundingClientRect(), sky = document.querySelector('.sky').getBoundingClientRect();
    return { stop: f.getAttribute('data-stop'), top: r.top, bottom: r.bottom, h: r.height, avail: sky.height, skyTop: sky.top, pos: getComputedStyle(f).position };
  })()`)) as { stop: string | null; top: number; bottom: number; h: number; avail: number; skyTop: number; pos: string } | null;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/**
 * Протяжка пальцем: от (x, y) на dy px за ms мс, steps шагов. Время касаний задаётся явно (timestamp): скорость взмаха
 * считается по нему, а не по тому, как быстро их доставил протокол отладки.
 */
async function swipe(p: Page, x: number, y: number, dy: number, ms: number, steps = 8) {
  const cdp = await p.context().newCDPSession(p);
  const pt = (yy: number) => [{ x, y: yy, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y), timestamp: t0 });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y + (dy * i) / steps), timestamp: t0 + (ms * i) / steps / 1000 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + (ms + 8) / 1000 });
  await cdp.detach();
  await p.waitForTimeout(450);
}
/**
 * Середина имени в шапке листа — за неё лист тянется. Этап 11 (решение 77): на первом положении (214 px) лист — карточка
 * у звезды, имя — в её шапке (.sheet-dot .dc-nm); выше — шапка листа (.bar-name).
 */
async function barAt(p: Page) {
  const b = (await p.locator('.folio .sheet-bar .bar-name, .folio .sheet-dot .dc-nm .nm').first().boundingBox())!;
  return { x: b.x + Math.min(40, b.width / 2), y: b.y + b.height / 2 };
}
/** Высота листа на первом положении (src/ui/sheet.ts, PEEK_H): карточка у звезды — 214 px (этап 11; было 104). */
const PEEK = 214;

/**
 * Коснуться звезды лица: адрес выбирает лицо и ставит небо; «×» снимает выбор, место звезды пересчитывается
 * по камере (data-view) — касание идёт по звезде при закрытой карточке.
 */
async function tapStar(p: Page, id: string) {
  await go(p, `#/${id}`, 2400);
  const w = (await p.evaluate(`(() => {
    const el = document.querySelector('.sky');
    const [sx, sy] = el.dataset.sel.split(' ').map(Number);
    const [, , , , x0, kx, laneTop, ky] = el.dataset.view.split(' ').map(Number);
    return { X: x0 + sx / kx, lane: laneTop - sy / ky };
  })()`)) as { X: number; lane: number };
  await p.locator('.folio .close').first().tap();
  await p.waitForTimeout(900);
  const v = await view(p);
  const box = (await p.locator('.sky canvas').boundingBox())!;
  await p.touchscreen.tap(box.x + (w.X - v.x0) * v.kx, box.y + (v.laneTop - w.lane) * v.ky);
  await p.waitForTimeout(1200);
}
/**
 * Плотные места на виду: середины ближайших пар звёзд (список лиц неба, data-x/y у пунктов), от 4 до 24 px друг от
 * друга, по возрастанию расстояния; не у края видимой части. Место ищется по данным, а не смещением от лица: раскладка
 * меняется (этап 7, K1: сыновья Давида больше не стоят «гребёнкой»), а проверка «Какое лицо?» должна оставаться проверкой.
 * Этап 13: середина пары не лежит на подписи лица (data-label-boxes холста, с полем 4 px) — касание подписи честно
 * открывает её лицо, и «Какое лицо?» там не спрашивается; такое место — не плотное место между звёздами. И касание
 * приходится на холст, а не на строку показа или органы неба над ним.
 */
export async function denseSpots(p: Page): Promise<{ x: number; y: number; ids: [string, string] }[]> {
  return (await p.evaluate(`(() => {
    const [l, t, r, b] = document.querySelector('.sky').dataset.view.split(' ').map(Number);
    const labels = ((document.querySelector('.sky > canvas') || {}).dataset?.labelBoxes || '').split(';').filter(Boolean).map((q) => {
      const [x, y, w, h] = q.slice(q.lastIndexOf(':') + 1).split(',').map(Number);
      return { x, y, w, h };
    });
    const onLabel = (x, y) => labels.some((q) => x >= q.x - 4 && x <= q.x + q.w + 4 && y >= q.y - 4 && y <= q.y + q.h + 4);
    // и не под строкой показа, органами неба или листом: касание должно прийтись на сам холст
    const cv = document.querySelector('.sky > canvas');
    const cr = cv ? cv.getBoundingClientRect() : { left: 0, top: 0 };
    const onCanvas = (x, y) => document.elementFromPoint(cr.left + x, cr.top + y) === cv;
    const pts = [...document.querySelectorAll('[id^="sky-star-"]')].filter((e) => e.dataset.x)
      .map((e) => ({ id: e.id.slice(9), x: +e.dataset.x, y: +e.dataset.y }))
      .filter((q) => q.x > l + 30 && q.x < r - 30 && q.y > t + 30 && q.y < b - 30);
    const out = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        const x = (pts[i].x + pts[j].x) / 2, y = (pts[i].y + pts[j].y) / 2;
        if (d >= 4 && d <= 24 && !onLabel(x, y) && onCanvas(x, y)) out.push({ d, x, y, ids: [pts[i].id, pts[j].id] });
      }
    return out.sort((u, v) => u.d - v.d);
  })()`)) as { x: number; y: number; ids: [string, string] }[];
}
/**
 * Коснуться плотного места рядом с лицом id (оно выбрано адресом): перебор ближайших пар, пока касание не спросит
 * «Какое лицо?». true — список открыт.
 */
export async function tapDense(p: Page, id: string, tries = 6): Promise<boolean> {
  for (let k = 0; k < tries; k++) {
    await go(p, `#/${id}`, 2400);
    const q = (await denseSpots(p))[k];
    if (!q) return false;
    const box = (await p.locator('.sky canvas').boundingBox())!;
    await p.touchscreen.tap(box.x + q.x, box.y + q.y);
    await p.waitForTimeout(500);
    if ((await p.locator('.sky canvas').getAttribute('data-tap')) === 'ask' && (await p.locator('.which').count())) return true;
  }
  return false;
}
/** Открыть панель: на телефоне — из «Разделов», на планшете — командой строки или из «Ещё». */
async function openPanel(p: Page, name: string) {
  const direct = p.locator('.commands > button', { hasText: name });
  if ((await direct.count()) && (await direct.first().isVisible())) await direct.first().tap();
  else {
    await p.locator('.commands .more > button').tap();
    await p.waitForTimeout(200);
    await p.locator('.commands .more [role^="menuitem"]', { hasText: name }).first().tap();
  }
  await p.waitForTimeout(700);
}

export const phone: Scenario[] = [
  {
    n: 150,
    // этап 11 (решение 77): первое положение листа — карточка у звезды на 214 px (было 104): имя и годы — в её шапке
    title: 'U8, телефон 390 × 844: касание звезды — лист-карточка на 214 px; протяжка — 55 % и 100 %; «Родство» — полноэкранный лист, «×» — к карточке; «Показать на небе» сворачивает лист',
    view: PHONE,
    run: async (p) => {
      await tapStar(p, 'david');
      if (hashId(p) !== 'david') return fail(`касание выбрало «${hashId(p)}»`);
      let s = await sheet(p);
      if (!s || s.stop !== 'peek' || !near(s.h, PEEK, 2)) return fail(`после касания лист ${s?.stop} ${s?.h.toFixed(0)} px, а не ${PEEK}`);
      const name = (await p.locator('.folio .sheet-dot .dc-nm .nm').innerText()).trim();
      if (name !== 'Давид') return fail(`в шапке «${name}»`);
      if (!(await p.locator('.folio .sheet-dot .dc-yrs').isVisible())) return fail('на шапке нет годов');
      // протяжка шапки вверх, медленно: до 55 %
      let a = await barAt(p);
      const half = s.avail * 0.55;
      await swipe(p, a.x, a.y, -(half - PEEK), 700, 14);
      s = (await sheet(p))!;
      if (s.stop !== 'half' || !near(s.h, half, 12)) return fail(`после протяжки к 55 % лист ${s.stop} ${s.h.toFixed(0)} px (ждали ${half.toFixed(0)})`);
      // ещё вверх: 100 % — верхняя строка и полоса времени видны
      a = await barAt(p);
      await swipe(p, a.x, a.y, -(s.avail - half), 700, 14);
      s = (await sheet(p))!;
      if (s.stop !== 'full' || !near(s.h, s.avail, 3)) return fail(`после протяжки к 100 % лист ${s.stop} ${s.h.toFixed(0)} из ${s.avail.toFixed(0)} px`);
      const topBar = (await p.locator('.top').boundingBox())!;
      const strip = (await p.locator('.strip').boundingBox())!;
      if (s.top < topBar.y + topBar.height - 1 || s.bottom > strip.y + 1) return fail(`лист на 100 % закрывает верхнюю строку или полосу: ${s.top.toFixed(0)}…${s.bottom.toFixed(0)}`);
      const toggle = p.locator('.folio .sheet-bar .bar-toggle');
      if ((await toggle.innerText()).trim() !== 'Свернуть' || (await toggle.getAttribute('aria-expanded')) !== 'true') return fail('на 100 % в шапке нет «Свернуть»');
      // «Родство» — полноэкранный лист поверх карточки; «×» возвращает к карточке
      await openPanel(p, 'Родство');
      const panel = await p.locator('.sheet').boundingBox();
      if (!panel || panel.y > topBar.y + topBar.height + 1 || panel.y + panel.height < 844 - 1 || panel.width < 389) return fail(`«Родство» не на весь экран: ${JSON.stringify(panel)}`);
      const onTop = await p.evaluate(`(() => { const e = document.elementFromPoint(195, 600); return !!e && !!e.closest('.sheet'); })()`);
      if (!onTop) return fail('лист «Родства» под карточкой');
      await p.locator('.sheet .sheet-head .close').tap();
      await p.waitForTimeout(500);
      if (await p.locator('.sheet').count()) return fail('«×» не закрыл «Родство»');
      s = (await sheet(p))!;
      if (hashId(p) !== 'david' || s.stop !== 'full') return fail(`после «×» — ${hashId(p)}, лист ${s.stop}`);
      // «Показать на небе»: лист — на шапку, звезда видна над ним
      await p.locator('.folio .actions button', { hasText: 'Показать на небе' }).tap();
      await p.waitForTimeout(1600);
      s = (await sheet(p))!;
      if (s.stop !== 'peek') return fail(`«Показать на небе» оставил лист ${s.stop}`);
      const vis = await selVisible(p);
      if (vis) return fail(`после «Показать на небе»: ${vis}`);
      return pass(`${PEEK} → ${half.toFixed(0)} → ${s.avail.toFixed(0)} px; «Родство» и «×»; «Показать на небе» — шапка`);
    },
  },
  {
    n: 151,
    title: 'U8, планшет 768 × 1024: касание звезды — карточка колонкой; «Родство» — колонкой, карточка в корешке; «×» — к карточке; «Показать на небе» — звезда видна',
    view: TABLET,
    run: async (p) => {
      await tapStar(p, 'david');
      if (hashId(p) !== 'david') return fail(`касание выбрало «${hashId(p)}»`);
      const s = await sheet(p);
      if (!s || s.pos === 'fixed' || s.stop) return fail(`карточка на планшете — ${s?.pos} ${s?.stop}`);
      await openPanel(p, 'Родство');
      if (!(await p.locator('.sheet h2', { hasText: 'Родство' }).count())) return fail('«Родство» не открылось');
      if (!(await p.locator('.folio.spine').count())) return fail('карточка не свернулась в корешок');
      await p.locator('.sheet .sheet-head .close').tap();
      await p.waitForTimeout(600);
      if ((await p.locator('.sheet').count()) || (await p.locator('.folio.spine').count())) return fail('«×» не вернул карточку');
      if (hashId(p) !== 'david') return fail(`после «×» выбрано «${hashId(p)}»`);
      await p.locator('.folio .actions button', { hasText: 'Показать на небе' }).tap();
      await p.waitForTimeout(1600);
      const vis = await selVisible(p);
      if (vis) return fail(vis);
      // метки рейки на планшете — шаг 24 px, цели 24 × 24 (MOB-14)
      const ys = await p.locator('.folio .rail button').evaluateAll((bs) => bs.slice(0, 3).map((b) => b.getBoundingClientRect()));
      if (ys.some((r) => r.height < 24 || r.width < 24)) return fail(`метка рейки ${ys[0].width}×${ys[0].height}`);
      return pass();
    },
  },
  {
    n: 152,
    title: 'H2: лист с учётом скорости — короткий взмах поднимает дальше медленной протяжки; взмах вниз закрывает; протяжка текста у начала сворачивает',
    view: PHONE,
    run: async (p) => {
      await tapStar(p, 'david');
      let a = await barAt(p);
      // медленно на 60 px — назад к шапке
      await swipe(p, a.x, a.y, -60, 900, 12);
      let s = (await sheet(p))!;
      if (s.stop !== 'peek') return fail(`медленные 60 px подняли лист до ${s.stop}`);
      // быстро на те же 60 px — выше шапки
      a = await barAt(p);
      await swipe(p, a.x, a.y, -60, 45, 3);
      s = (await sheet(p))!;
      if (s.stop === 'peek') return fail('быстрый взмах на 60 px не поднял лист');
      const flung = s.stop;
      // текст у начала: протяжка вниз сворачивает лист, а не прокручивает текст
      if (s.stop !== 'full') {
        const brief = (await p.locator('.folio .passport').boundingBox())!;
        await swipe(p, 200, brief.y + 20, 160, 400, 8);
        s = (await sheet(p))!;
        if (s.stop !== 'peek') return fail(`протяжка текста вниз оставила лист ${s.stop}`);
      }
      // взмах вниз с шапки — лист закрыт
      a = await barAt(p);
      await swipe(p, a.x, a.y, 70, 50, 3);
      if (hashId(p)) return fail(`взмах вниз не закрыл лист: выбрано «${hashId(p)}»`);
      if (await p.locator('.folio:not([hidden])').count()) return fail('лист остался');
      return pass(`быстрые 60 px — ${flung}`);
    },
  },
  {
    n: 153,
    title: 'Решение 12: поиск и ссылки открывают лист на 55 %, касание звезды — на первом положении (214 px); выбор второго лица сворачивает лист, «Отменить» возвращает',
    view: PHONE,
    run: async (p) => {
      await find(p, 'Руфь');
      let s = await sheet(p);
      if (s?.stop !== 'half') return fail(`поиск открыл лист ${s?.stop}`);
      // ссылка в карточке — тоже 55 %, даже если лист был на 100 %
      await p.locator('.folio .sheet-bar .bar-toggle').tap();
      await p.waitForTimeout(400);
      if ((await sheet(p))?.stop !== 'full') return fail('«Развернуть» не поднял лист до 100 %');
      const link = p.locator('.folio .brief button.person').first();
      const to = await link.getAttribute('data-id');
      await link.tap();
      await p.waitForTimeout(1200);
      s = await sheet(p);
      if (hashId(p) !== to || s?.stop !== 'half') return fail(`ссылка: ${hashId(p)} (ждали ${to}), лист ${s?.stop}`);
      // выбор второго лица: лист на шапке, небо видно; «Отменить» — обратно к 55 %
      await p.locator('.folio .actions button', { hasText: 'Родство с…' }).tap();
      await p.waitForTimeout(500);
      if ((await sheet(p))?.stop !== 'peek') return fail('«Родство с…» не свернул лист');
      await p.locator('.pickbar button', { hasText: 'Отменить' }).tap();
      await p.waitForTimeout(500);
      if ((await sheet(p))?.stop !== 'half') return fail(`«Отменить» оставил лист ${(await sheet(p))?.stop}`);
      return pass();
    },
  },
  {
    n: 154,
    title: 'H4: верх телефона — одна строка 48 px (название, поиск, «Разделы»); в «Разделах» все панели, справка и тема; поле при фокусе — во всю строку; 390 и 360',
    view: PHONE,
    run: async (p) => {
      // этап 13 (решение 109): меню «Меню» (прежде «Разделы»), тема — «Ночь» и «День»
      const ALL = ['Указатель', 'Главы', 'Синопсис', 'Родство', 'Сквозной раздел', 'Условные знаки', 'О карте', 'Ночь', 'День'];
      const notes: string[] = [];
      /** Строка — 48 px, три части в пределах экрана, без прокрутки вбок. */
      const row = async (q: Page, w: number) => {
        const top = (await q.locator('.top').boundingBox())!;
        if (Math.round(top.height) !== 48) return `${w}: верхняя строка ${top.height} px`;
        const parts = (await q.evaluate(`(() => [...document.querySelectorAll('.top .wordmark, .top .search, .top .sections > button')].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }))()`)) as number[][];
        if (parts.length !== 3) return `${w}: в строке ${parts.length} части`;
        if (parts.some(([l, r, t, b]) => l < 0 || r > w + 0.5 || t < top.y - 0.5 || b > top.y + top.height + 0.5)) return `${w}: часть строки за краем`;
        if ((await q.evaluate('document.documentElement.scrollWidth - innerWidth')) as number) return `${w}: прокрутка вбок`;
        notes.push(`${w}: 48 px`);
        return '';
      };
      const r390 = await row(p, 390);
      if (r390) return fail(r390);
      // 360 × 740 — своё окно: телефонный браузер не меняет ширину страницы на лету
      const small = await p.context().browser()!.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
      try {
        const q = await small.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '#/'));
        await q.waitForTimeout(1500);
        const r360 = await row(q, 360);
        if (r360) return fail(r360);
      } finally {
        await small.close();
      }
      await p.locator('.top .sections > button').tap();
      await p.waitForTimeout(200);
      const items = (await p.locator('.top .sections [role^="menuitem"] .nm').allInnerTexts()).map((t) => t.trim());
      const missing = ALL.filter((x) => !items.includes(x));
      if (missing.length) return fail(`в «Разделах» нет: ${missing.join(', ')}`);
      const hs = await p.locator('.top .sections [role^="menuitem"]').evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
      if (hs.some((h) => h < 48)) return fail(`строка «Разделов» ${Math.min(...hs)} px`);
      const was = await p.evaluate('document.documentElement.dataset.map');
      await p.locator('.top .sections [role^="menuitem"]', { hasText: /^День$/ }).tap();
      await p.waitForTimeout(300);
      const now = await p.evaluate('document.documentElement.dataset.map');
      if (was === now) return fail('«День» не сменил тему');
      // поиск: поле в фокусе занимает строку, подсказки — во всю ширину
      await p.locator('.top label[for="find"]').tap();
      await p.waitForTimeout(200);
      await p.keyboard.type('Иосиф');
      await p.waitForTimeout(300);
      const f = (await p.locator('.top .search').boundingBox())!;
      const res = await p.locator('.top .results').boundingBox();
      if (f.width < 360 * 0.9) return fail(`поле в фокусе ${f.width.toFixed(0)} px`);
      if (!res || res.width < 330) return fail(`подсказки ${res?.width.toFixed(0)} px`);
      return pass(`${notes.join(', ')}; тема ${was} → ${now}`);
    },
  },
  {
    n: 155,
    title: 'H4: полоса времени видна при листе на первом положении (214 px) и 55 %; указатель у края — над листом, поле касания 44 px',
    view: PHONE,
    run: async (p) => {
      await find(p, 'Давид');
      for (const stop of ['half', 'peek']) {
        if (stop === 'peek') {
          await p.locator('.folio .actions button', { hasText: 'Показать на небе' }).tap();
          await p.waitForTimeout(1400);
        }
        const strip = (await p.locator('.strip').boundingBox())!;
        const topEl = await p.evaluate(`(() => { const e = document.elementFromPoint(${strip.x + strip.width / 2}, ${strip.y + strip.height / 2}); return !!e && !!e.closest('.strip'); })()`);
        if (!topEl) return fail(`лист на ${stop} закрывает полосу времени`);
      }
      // лист на 55 %; небо протянуто вверх так, что Давид ушёл под лист: указатель «↓ Давид» — над листом
      // этап 11: на первом положении лист — карточка у звезды (214 px); касание её шапки поднимает лист до 55 %
      await p.locator('.folio .sheet-bar .bar-name, .folio .sheet-dot .dc-nm .nm').first().tap();
      await p.waitForTimeout(500);
      if ((await sheet(p))?.stop !== 'half') return fail(`касание шапки на ${PEEK} px не подняло лист до 55 %`);
      const v0 = await view(p);
      const q0 = (await selAt(p))!;
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const need = v0.b - q0.y + 40;
      const cdp = await p.context().newCDPSession(p);
      const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      // палец ведёт небо вниз: звезда уходит под лист
      const x = box.x + 200;
      const y0 = box.y + v0.t + 10;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y0) });
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y0 + (need * i) / 10) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(600);
      const v = await view(p);
      const q = (await selAt(p))!;
      if (q.y <= v.b) return fail(`Давид не ушёл под лист: ${q.y.toFixed(0)} ≤ ${v.b.toFixed(0)}`);
      // указатель — у нижнего края видимой части (над листом), высотой 18 px; касание в 13 px под надписью — в поле 44 px
      await p.touchscreen.tap(box.x + Math.max(60, Math.min(v.r - 60, q.x)), box.y + v.b - 14 + 13);
      await p.waitForTimeout(1600);
      const vis = await selVisible(p);
      return vis ? fail(`касание указателя не вернуло Давида: ${vis}`) : pass();
    },
  },
  {
    n: 156,
    title: 'H5: в плотном месте касание спрашивает «Какое лицо?» (2–5 имён, строки 44 px), выбор — лицо и лист на шапке; на обзоре в гуще — список или приближение, а не выбор наугад',
    view: PHONE,
    run: async (p) => {
      // плотное место у Давида: середина ближайшей пары звёзд на виду (по данным раскладки, а не по смещениям)
      let ids: string[] = [];
      if (await tapDense(p, 'david')) ids = await p.locator('.which .which-item').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.id!));
      if (!ids.length) return fail('ни одно касание в плотном месте не спросило «Какое лицо?»');
      if (ids.length < 2 || ids.length > 5) return fail(`в списке ${ids.length} имён`);
      if (hashId(p) !== 'david') return fail(`пока список открыт, выбор сменился на «${hashId(p)}»`);
      const hs = await p.locator('.which .which-item, .which .close').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
      if (hs.some((h) => h < 44)) return fail(`строка списка ${Math.min(...hs)} px`);
      const pick = ids[ids.length - 1];
      await p.locator(`.which .which-item[data-id="${pick}"]`).tap();
      await p.waitForTimeout(900);
      if (hashId(p) !== pick) return fail(`выбрано «${hashId(p)}», а не «${pick}»`);
      if ((await sheet(p))?.stop !== 'peek') return fail('выбор из списка открыл лист не на шапке');
      if (await p.locator('.which').count()) return fail('список не закрылся');
      // обзор: касание в гуще — список «Какое лицо?» (до 5 равновероятных) или приближение (больше 5), но не выбор наугад
      // (H5; tapChoice в src/ui/sky/input.ts). Перебор мест от середины Единого царства к краям
      const fit = async () => {
        if (await p.locator('.which').count()) await p.locator('.which .close').tap();
        if (await p.locator('.folio .sheet-bar .close').count()) await p.locator('.folio .sheet-bar .close').tap();
        // этап 11 (Я30): «Всё небо» органов неба — теперь «Вписать» (на всём небе вписывает всё небо)
        await p.locator('.skyctl button', { hasText: 'Вписать' }).tap();
        await p.waitForTimeout(1300);
      };
      await go(p, '#/', 1800);
      await fit();
      const k0 = (await view(p)).kx;
      const box = (await p.locator('.sky canvas').boundingBox())!;
      let zoomed = false;
      let asked = 0;
      const spots: [number, number][] = [];
      for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6]) for (const fx of [0.72, 0.68, 0.76, 0.64, 0.8, 0.6]) spots.push([fx, fy]);
      for (const [fx, fy] of spots) {
        // что сделало именно это касание: прежняя отметка не должна остаться от предыдущего (касание яруса её не пишет)
        await p.evaluate(`document.querySelector('.sky canvas').removeAttribute('data-tap')`);
        await p.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
        await p.waitForTimeout(500);
        const kind = await p.locator('.sky canvas').getAttribute('data-tap');
        if (kind === 'zoom') {
          zoomed = true;
          break;
        }
        if (kind === 'ask') {
          // список на обзоре: 2–5 имён, выбора наугад нет — лицо не выбрано, пока читатель не коснулся строки
          const n = await p.locator('.which .which-item').count();
          if (n < 2 || n > 5) return fail(`на обзоре «Какое лицо?» из ${n} строк`);
          if (hashId(p)) return fail(`на обзоре касание в гуще выбрало «${hashId(p)}» без списка`);
          asked++;
          break;
        }
        if (kind === 'pick' || hashId(p)) await fit();
      }
      if (!zoomed && !asked) return fail('на обзоре касание в гуще не дало ни списка, ни приближения');
      if (zoomed) {
        const k1 = (await view(p)).kx;
        if (!(k1 > k0 * 1.5)) return fail(`масштаб ${k0} → ${k1}`);
        return pass(`«Какое лицо?»: ${ids.join(', ')}; обзор ×${(k1 / k0).toFixed(1)}`);
      }
      return pass(`«Какое лицо?»: ${ids.join(', ')}; на обзоре в гуще — тоже список`);
    },
  },
  {
    n: 157,
    title: 'H7: ярусы эпох на телефоне — не больше 35 % видимого неба; колонка кнопок не лежит на ярусах',
    view: PHONE,
    run: async (p) => {
      await find(p, 'Давид');
      await p.locator('.skyctl.column button', { hasText: 'Вид' }).tap();
      await p.waitForTimeout(300);
      await p.locator('.sheet').getByText('ярусы эпох', { exact: true }).tap();
      await p.waitForTimeout(300);
      await p.locator('.sheet .close').tap();
      await p.waitForTimeout(1500);
      const notes: string[] = [];
      for (const stop of ['half', 'peek']) {
        if (stop === 'peek') {
          await p.locator('.folio .actions button', { hasText: 'Показать на небе' }).tap();
          await p.waitForTimeout(1600);
        }
        const v = await view(p);
        const room = v.b - 44;
        const tiers = v.t - 44;
        if (tiers > room * 0.35 + 6) return fail(`${stop}: ярусы ${tiers.toFixed(0)} px из ${room.toFixed(0)} (${((tiers / room) * 100).toFixed(0)} %)`);
        const col = (await p.locator('.skyctl.column').boundingBox())!;
        const sky = (await p.locator('.sky').boundingBox())!;
        if (col.y - sky.y < v.t - 1) return fail(`${stop}: колонка кнопок (верх ${(col.y - sky.y).toFixed(0)}) на ярусах (низ ${v.t.toFixed(0)})`);
        notes.push(`${stop}: ${((tiers / room) * 100).toFixed(0)} %`);
      }
      return pass(notes.join(', '));
    },
  },
  {
    n: 158,
    title: 'H5: цели касания на телефоне не меньше 44 px (ссылки в тексте — поле 32 px без смены межстрочия)',
    view: PHONE,
    run: async (p) => {
      await find(p, 'Давид');
      await p.locator('.folio .sheet-bar .bar-toggle').tap();
      await p.waitForTimeout(500);
      const small = (await p.evaluate(`(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
        // «ещё 5 ссылок» в конце строки ссылок и «см. § 24» — в строке текста: их поле касания — прозрачное продолжение
        // (::after), оно проверяется ниже; межстрочие не меняется
        // ссылка поля «Созвездие» в паспорте (этап 11: лист «Показ» на созвездии) — тоже ссылка в тексте строки паспорта
        const skip = (e) => e.closest('.rail') || e.matches('.person, .ref, .sec .see, .refs .more, .mark, .passport .pass-link, .visually-hidden *') || e.closest('.visually-hidden');
        return [...document.querySelectorAll('button, [role^=menuitem], input, a[href]')].filter(vis).filter((e) => !skip(e))
          .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24), w: r.width, h: r.height }; })
          .filter((r) => r.h < 44 || r.w < 44 && r.t.length < 3);
      })()`)) as { t: string; w: number; h: number }[];
      if (small.length) return fail(`мелкие цели: ${small.slice(0, 4).map((s) => `«${s.t}» ${s.w.toFixed(0)}×${s.h.toFixed(0)}`).join(', ')}`);
      const link = p.locator('.folio .sec button.person').first();
      const ok = (await link.evaluate((e) => {
        const a = getComputedStyle(e, '::after');
        return { h: parseFloat(a.height), lh: getComputedStyle(e.closest('p, li, div')!).lineHeight };
      })) as { h: number; lh: string };
      if (!(ok.h >= 32)) return fail(`поле ссылки ${ok.h} px`);
      if (ok.lh !== '24px') return fail(`межстрочие текста ${ok.lh}`);
      // «ещё N ссылок» — команда: поле 44 px (решение 33); «см. § N» — ссылка в тексте: 32 px
      const fields = (await p.evaluate(`(() => {
        const h = (sel) => [...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e, '::after').height) || 0);
        return { more: h('.folio .refs .more'), see: h('.folio .sec .see'), pass: h('.folio .passport .pass-link') };
      })()`)) as { more: number[]; see: number[]; pass: number[] };
      if (!fields.more.length) return fail('в карточке Давида нет «ещё N ссылок»');
      if (fields.more.some((x) => x < 44)) return fail(`поле «ещё N ссылок» ${Math.min(...fields.more)} px`);
      if (fields.see.some((x) => x < 32)) return fail(`поле «см. § N» ${Math.min(...fields.see)} px`);
      if (fields.pass.some((x) => x < 32)) return fail(`поле ссылки паспорта ${Math.min(...fields.pass)} px`);
      return pass(`«ещё N ссылок»: ${fields.more.length} × 44 px`);
    },
  },
  {
    n: 159,
    title: 'H6: альбомная 844 × 390 — верх и полоса по 44 px, карточка 340 px, колонка кнопок 2 × 2 не на ярусах; масштаб 200 % (720 × 450) — поиск открывает лист на первом положении (214 px)',
    view: { width: 844, height: 390, touch: true },
    run: async (p) => {
      await find(p, 'Давид');
      const top = (await p.locator('.top').boundingBox())!;
      const strip = (await p.locator('.strip').boundingBox())!;
      const folio = (await p.locator('.folio').boundingBox())!;
      if (Math.round(top.height) !== 44 || Math.round(strip.height) !== 44) return fail(`верх ${top.height}, полоса ${strip.height}`);
      if (Math.round(folio.width) !== 340) return fail(`карточка ${folio.width} px`);
      const col = await p.locator('.skyctl.column button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.top)]));
      if (new Set(col.map((c) => c[1])).size !== 2) return fail(`колонка кнопок не 2 × 2: ${JSON.stringify(col)}`);
      const sky = (await p.locator('.sky').boundingBox())!;
      if (Math.max(...col.map((c) => c[1])) + 44 > sky.y + sky.height + 1) return fail('кнопки ниже неба');
      // масштаб 200 %: окно 720 × 450 — телефонная раскладка, лист по умолчанию на шапке
      await p.setViewportSize({ width: 720, height: 450 });
      await p.waitForTimeout(500);
      await find(p, 'Руфь');
      const s = await sheet(p);
      // этап 11: первое положение — карточка у звезды на 214 px (не выше места для листа)
      if (s?.stop !== 'peek' || !near(s.h, Math.min(PEEK, s.avail), 2)) return fail(`720 × 450: поиск открыл лист ${s?.stop} ${s?.h}`);
      const vis = await selVisible(p);
      if (vis) return fail(`720 × 450: ${vis}`);
      return pass();
    },
  },
  {
    n: 160,
    title: 'H3: строка номеров на 360 × 740 — под шапкой листа, текущий номер всегда на виду; касание номера ведёт к разделу',
    view: { width: 360, height: 740, touch: true },
    run: async (p) => {
      await find(p, 'Давид');
      await p.locator('.folio .sheet-bar .bar-toggle').tap();
      await p.waitForTimeout(500);
      const bar = (await p.locator('.folio .sheet-bar').boundingBox())!;
      const nums = p.locator('.folio .rail button:visible');
      const last = nums.last();
      const n = (await last.innerText()).trim();
      await last.tap();
      await p.waitForTimeout(1200);
      const rail = (await p.locator('.folio .rail').boundingBox())!;
      if (Math.abs(rail.y - (bar.y + bar.height)) > 1) return fail(`строка номеров на ${rail.y.toFixed(0)}, шапка кончается на ${(bar.y + bar.height).toFixed(0)}`);
      const cur = p.locator('.folio .rail button.current');
      if (!(await cur.count())) return fail('нет текущего номера');
      const cb = (await cur.boundingBox())!;
      if (cb.x < rail.x - 1 || cb.x + cb.width > rail.x + rail.width + 1) return fail(`текущий номер ${(await cur.innerText()).trim()} за краем строки`);
      const sec = (await p.locator(`.folio #sec-${n}`).boundingBox())!;
      if (sec.y < rail.y + rail.height - 2 || sec.y > rail.y + rail.height + 90) return fail(`§ ${n} на ${(sec.y - rail.y - rail.height).toFixed(0)} px ниже строки номеров`);
      return pass(`§ ${n}`);
    },
  },
  {
    n: 161,
    title: 'U8 клавиатурой (телефон): фокус после поиска виден на имени шапки; «Развернуть» и «Свернуть» — кнопка с aria-expanded; Escape закрывает «Какое лицо?»',
    view: PHONE,
    run: async (p) => {
      await find(p, 'Руфь');
      const f = await p.evaluate(`(() => ({ id: document.activeElement?.id, ring: getComputedStyle(document.querySelector('.folio .bar-name')).boxShadow }))()`) as { id: string; ring: string };
      if (f.id !== 'title-ruf') return fail(`фокус после поиска на «${f.id}»`);
      if (!f.ring || f.ring === 'none') return fail('фокус на заголовке карточки не виден на имени шапки');
      const t = p.locator('.folio .sheet-bar .bar-toggle');
      await t.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      if ((await sheet(p))?.stop !== 'full' || (await t.getAttribute('aria-expanded')) !== 'true') return fail('Enter на «Развернуть» не поднял лист до 100 %');
      await p.keyboard.press('Space');
      await p.waitForTimeout(400);
      // этап 11 (решение 77): свёрнутый лист — карточка у звезды (214 px); развернуть его — её команда «Карточка ▴»:
      // тоже кнопка с aria-expanded
      const up = p.locator('.folio .sheet-dot .dc-card');
      if ((await sheet(p))?.stop !== 'peek' || !(await up.count()) || (await up.getAttribute('aria-expanded')) !== 'false') return fail('пробел на «Свернуть» не свернул лист до карточки у звезды');
      const nm = ((await up.getAttribute('aria-label')) ?? (await up.innerText())).trim();
      if (!/^Вся карточка/.test(nm) || !/развернуть/i.test(nm)) return fail(`имя кнопки «${nm}»`);
      await up.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(500);
      if ((await sheet(p))?.stop !== 'half') return fail('Enter на «Вся карточка ▴» не поднял лист');
      // «Какое лицо?»: Escape закрывает список и возвращает фокус на небо
      if (!(await tapDense(p, 'david'))) return fail('список «Какое лицо?» не открылся');
      await p.locator('.which .which-item').first().focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (await p.locator('.which').count()) return fail('Escape не закрыл список');
      if (hashId(p) !== 'david') return fail(`Escape снял и выбор: «${hashId(p)}»`);
      const back = await p.evaluate(`document.activeElement?.tagName`);
      return back === 'CANVAS' ? pass() : fail(`фокус после Escape — ${back}`);
    },
  },
];
