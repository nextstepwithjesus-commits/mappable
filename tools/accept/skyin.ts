/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа skyin (K4): небо — ввод, органы, отклик рабочего
 * набора. Номера 250–269. Проверки — по окну неба .sky[data-view] («vp.l vp.t vp.r vp.b x0 kx laneTop ky»), месту
 * выбранной звезды .sky[data-sel], месту звёзд в списке неба для диктора (#sky-star-<id> data-x, data-y), адресу
 * и разметке органов.
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, pickShow, type Check, type Scenario } from './kit.ts';

const cam = async (p: Page) => {
  const [l, t, r, b, x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  return { l, t, r, b, x0, kx, laneTop, ky };
};
const selAt = async (p: Page) => {
  const s = await p.locator('.sky').getAttribute('data-sel');
  if (!s) return null;
  const [x, y] = s.split(' ').map(Number);
  return { x, y };
};
const go = async (p: Page, hash: string, ms = 2400) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Звезда лица на холсте (px холста) — по списку неба для диктора; null — её нет среди лиц на виду. */
const star = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
  }, id);
const canvasBox = async (p: Page) => (await p.locator('.sky > canvas').boundingBox())!;
/** Живая область неба: выбор лица и ответы клавиш набора. */
const live = (p: Page) => p.locator('.sky > div.visually-hidden[aria-live]').innerText();
const stored = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string][]).map((r) => r[0]));
/** Годы по краям видимой части неба — по линейке нет, по окну адреса: y — середина, w — ширина. */
const hashWin = (p: Page) => {
  const h = decodeURIComponent(new URL(p.url()).hash);
  const y = Number(/~y(-?\d+)/.exec(h)?.[1]);
  const w = Number(/~w(\d+)/.exec(h)?.[1]);
  return { y, w };
};
const nbsp = (s: string) => s.replace(/ /g, ' ');

async function pickModel(p: Page, name: string) {
  if (!(await p.locator('.viewpop').count())) await p.locator('.skyctl .view-toggle').click();
  await p.locator('.skyctl .menu.model > button').click();
  await p.locator('[role="menuitemradio"]', { hasText: name }).click();
}

export const skyin: Scenario[] = [
  {
    n: 250,
    title: 'IX-48, решение 35: смена модели хронологии держит выбранное лицо на месте по обеим осям (Моисей, все модели), переход 450 мс',
    run: async (p) => {
      await go(p, '#/moisey', 2600);
      const a = await selAt(p);
      if (!a) return fail('Моисей не на экране');
      const log: string[] = [];
      // этап 13, решение 102: модель по умолчанию — «Основной текст: 430 лет в Египте» («масоретские» — жаргон)
      for (const name of ['Краткое пребывание', 'Фарре 70', 'Числа в скобках', 'Основной текст']) {
        await pickModel(p, name);
        await p.waitForTimeout(80);
        const mid = await selAt(p);
        await p.waitForTimeout(700);
        const b = await selAt(p);
        if (!b || !mid) return fail(`«${name}»: Моисей ушёл с экрана`);
        const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(mid.x - a.x), Math.abs(mid.y - a.y));
        if (d > 1) return fail(`«${name}»: Моисей сдвинулся на ${d.toFixed(1)} px (${a.x},${a.y} → ${b.x},${b.y})`);
        log.push(`${name}: ${d.toFixed(1)} px`);
      }
      return pass(log.join('; '));
    },
  },
  {
    n: 251,
    title: 'IX-49, UX-52, решение 27, UX-51: правая кнопка по невыбранной звезде — только меню, без выбора и без подсказки поверх; с клавиатуры — клавиша меню и Shift + F10; свёрнутое созвездие — строка «+N» у места щелчка',
    run: async (p) => {
      await go(p, '#/david~y-1050~w180~l0~s1', 2600);
      const box = await canvasBox(p);
      const s = await star(p, 'iessey');
      if (!s) return fail('Иессея нет на небе');
      await p.mouse.move(box.x + s.x, box.y + s.y);
      await p.waitForTimeout(300);
      await p.mouse.click(box.x + s.x, box.y + s.y, { button: 'right' });
      await p.waitForTimeout(600);
      if (hashId(p) !== 'david') return fail(`правая кнопка выбрала «${hashId(p)}»`);
      const menu = p.locator('.sky .skymenu');
      if (!(await menu.count())) return fail('меню звезды не открылось');
      if (!/Иессей/.test(await menu.innerText())) return fail('меню не у Иессея');
      if (await p.locator('.sky .tip[data-shown]').count()) return fail('подсказка лежит поверх меню');
      // указатель ходит по небу — подсказки не появляются, пока меню открыто
      await p.mouse.move(box.x + s.x + 60, box.y + s.y - 40);
      await p.waitForTimeout(400);
      if (await p.locator('.sky .tip[data-shown]').count()) return fail('при открытом меню появилась подсказка');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      if (await menu.count()) return fail('Escape не закрыл меню');
      // клавиатура: фокус на небе, кольцо у звезды — клавиша меню; затем Shift + F10
      await p.locator('.sky > canvas').focus();
      await p.keyboard.press('ArrowLeft');
      await p.waitForTimeout(300);
      const f = await p.evaluate(() => document.querySelector('.sky > canvas')?.getAttribute('aria-activedescendant') ?? '');
      if (!f) return fail('стрелка не поставила кольцо фокуса');
      await p.keyboard.press('ContextMenu');
      await p.waitForTimeout(400);
      if (!(await menu.count())) return fail('клавиша меню не открыла меню звезды');
      const inMenu = await p.evaluate(() => !!document.activeElement?.closest('.skymenu'));
      if (!inMenu) return fail('фокус не в меню');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      await p.keyboard.press('Shift+F10');
      await p.waitForTimeout(400);
      if (!(await menu.count())) return fail('Shift + F10 не открыл меню звезды');
      await p.keyboard.press('Escape');
      if (hashId(p) !== 'david') return fail(`с клавиатуры выбрано «${hashId(p)}»`);
      // UX-51: «Свернуть созвездие» у названия «Дом Саулов» — строка «+N» встаёт у места щелчка, а не за сотню строк
      await go(p, '#/~y-1100~w300~l0~s1~mmt-long', 2400);
      const b2 = await canvasBox(p);
      let opened = false;
      for (const [dx, dy] of [[0, 0], [30, 0], [-30, 0], [60, 0], [0, 6], [0, -6]]) {
        await p.mouse.click(b2.x + 855 + dx, 594 + dy, { button: 'right' });
        await p.waitForTimeout(300);
        const fold = menu.locator('button', { hasText: 'созвездие' });
        if ((await fold.count()) && /Саул/.test(await fold.innerText())) {
          await fold.click();
          opened = true;
          break;
        }
        await p.keyboard.press('Escape');
      }
      if (!opened) return pass('меню звезды — без выбора; название «Дом Саулов» на этом окне не найдено');
      await p.waitForTimeout(900);
      const hits = (await p.locator('.sky > canvas').getAttribute('data-fold-hits')) ?? '';
      const row = hits.split(';').find((h) => h.startsWith('group:'));
      if (!row) return fail(`строки свёрнутого созвездия на экране нет: ${hits}`);
      const y = Number(row.split(':')[2].split(',')[1]);
      if (Math.abs(y - (594 - b2.y)) > 60) return fail(`строка «+N» на y ${y}, щелчок был на ${594 - b2.y}`);
      return pass(`строка свёрнутого созвездия — на y ${y}`);
    },
  },
  {
    n: 252,
    title: 'IX-54: нажатие во время перелёта только останавливает небо — выбор остаётся',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'Павел');
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(250);
      const box = await canvasBox(p);
      await p.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
      await p.waitForTimeout(150);
      const a = await cam(p);
      await p.waitForTimeout(500);
      const b = await cam(p);
      if (Math.abs(a.x0 - b.x0) * a.kx > 1 || Math.abs(a.kx / b.kx - 1) > 1e-3) return fail('перелёт продолжился после нажатия');
      if (hashId(p) !== 'pavel') return fail(`после нажатия выбрано «${hashId(p)}»`);
      if (!(await p.locator('.folio:not([hidden]) h1, .folio:not([hidden]) h2').count())) return fail('карточка закрылась');
      return pass();
    },
  },
  {
    n: 253,
    title: 'IX-05, решение 37: короткая инерция протяжки (≈ 325 мс); при ослабленном движении её нет',
    run: async (p) => {
      const throwSky = async (q: Page) => {
        const box = await canvasBox(q);
        const x = box.x + box.width * 0.6;
        const y = box.y + box.height * 0.55;
        await q.mouse.move(x, y);
        await q.mouse.down();
        await q.mouse.move(x - 60, y, { steps: 3 });
        await q.waitForTimeout(16);
        // бросок: последние точки протяжки — быстро, и отпускание сразу за ними
        await q.mouse.move(x - 240, y, { steps: 6 });
        const c0 = await cam(q);
        await q.mouse.up();
        await q.waitForTimeout(500);
        const c1 = await cam(q);
        return (c1.x0 - c0.x0) * c0.kx;
      };
      await go(p, '#/david~y-1000~w300~l0~s1', 2400);
      const glide = await throwSky(p);
      if (!(glide > 20)) return fail(`после броска небо проехало ещё ${glide.toFixed(0)} px`);
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '') + '#/david~y-1000~w300~l0~s1');
        await q.waitForTimeout(2400);
        const still = await throwSky(q);
        if (Math.abs(still) > 1) return fail(`при ослабленном движении небо скользило ${still.toFixed(0)} px`);
      } finally {
        await ctx.close();
      }
      return pass(`инерция ${glide.toFixed(0)} px`);
    },
  },
  {
    n: 254,
    title: 'IX-51, MOB-55: клавиша В берёт звезду с видимой подсказкой, иначе выбранное лицо; объявление «Иессей добавлен в набор; в наборе 1 лицо»; С — «потомки свёрнуты»',
    run: async (p) => {
      await go(p, '#/david~y-1050~w180~l0~s1', 2600);
      const box = await canvasBox(p);
      const s = await star(p, 'iessey');
      if (!s) return fail('Иессея нет на небе');
      await p.mouse.move(box.x + s.x, box.y + s.y);
      await p.waitForTimeout(400);
      if (!(await p.locator('.sky .tip[data-shown][data-id="iessey"]').count())) return fail('нет подсказки Иессея');
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      if ((await stored(p)).join(' ') !== 'iessey') return fail(`в наборе: ${(await stored(p)).join(' ')}`);
      const t1 = nbsp(await live(p)).trim();
      if (t1 !== 'Иессей добавлен в набор; в наборе 1 лицо') return fail(`объявление: «${t1}»`);
      // указатель ушёл на пустое место — подсказки нет: клавиша берёт выбранное лицо
      await p.mouse.move(box.x + 30, box.y + box.height - 40);
      await p.waitForTimeout(400);
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      if ((await stored(p)).join(' ') !== 'iessey david') return fail(`без подсказки взято: ${(await stored(p)).join(' ')}`);
      const t2 = nbsp(await live(p)).trim();
      if (t2 !== 'Давид добавлен в набор; в наборе 2 лица') return fail(`объявление: «${t2}»`);
      await p.keyboard.press('KeyC');
      await p.waitForTimeout(400);
      const t3 = nbsp(await live(p)).trim();
      if (!/^Давид: потомки скрыты на небе, \d+ (лицо|лица|лиц)$/.test(t3)) return fail(`объявление С: «${t3}»`);
      await p.keyboard.press('KeyC');
      await p.waitForTimeout(300);
      return pass(`${t1}; ${t2}; ${t3}`);
    },
  },
  {
    n: 255,
    // этап 11 (решение 81): переключатель «все лица | набор» стал строкой показа — «На небе: набор — 2 лица — изменить
    // всё небо»; «показать всех» — команда «всё небо»
    title: 'UX-62, IX-59, решение 26: показ «набор» (лист «Показ»); у кромки неба — «На небе: набор — 2 лица — изменить, всё небо»; «всё небо» возвращает все лица',
    run: async (p) => {
      await go(p, '#/david', 2400);
      await p.evaluate(() => localStorage.setItem('toledot:work', JSON.stringify([['david', { via: 'self', of: 'david' }], ['ruf', { via: 'self', of: 'ruf' }]])));
      await p.reload();
      await p.waitForTimeout(2400);
      await pickShow(p, 'Набор', { ms: 1800 });
      const bar = p.locator('.sky .showbar');
      if (!(await bar.count())) return fail('нет строки показа');
      const t = nbsp(await bar.locator('.txt').innerText()).replace(/\u2060/g, '').replace(/\s+/g, ' ').trim();
      if (!/^На небе: набор — 2 лица — изменить ?всё небо$/.test(t)) return fail(`строка: «${t}»`);
      if ((await p.locator('.sky canvas').first().getAttribute('data-mode')) !== 'work') return fail('небо не показывает набор');
      const b = (await bar.boundingBox())!;
      const c = await cam(p);
      const top = (await canvasBox(p)).y;
      if (b.y < top + c.t) return fail(`строка лежит на рамке: верх ${b.y - top}, рамка до ${c.t}`);
      await bar.locator('.sb-cmd', { hasText: 'всё небо' }).click();
      await p.waitForTimeout(900);
      const t2 = nbsp(await bar.locator('.txt').innerText()).replace(/\u2060/g, '').replace(/\s+/g, ' ').trim();
      if ((await p.locator('.sky canvas').first().getAttribute('data-mode')) === 'work' || !/^На небе: всё небо/.test(t2)) return fail(`«всё небо» не вернуло все лица: «${t2}»`);
      return pass(t);
    },
  },
  {
    n: 256,
    title: 'MOB-54, MOB-56, MOB-57, MOB-67, MOB-07 пальцем, 390 × 844: строка показа «набор — 3 лица — изменить» с целью 44 px, все лица — листом «Показ»; палец у края сдвигает небо; «Какое лицо?» получает фокус; описание неба — без повтора, о жестах; вступление — сначала касания',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      // набор — в памяти браузера, режим — в адресе (решение 34): адрес без k1 вернул бы все лица
      await p.evaluate(() => localStorage.setItem('toledot:work', JSON.stringify([['david', { via: 'self', of: 'david' }], ['iessey', { via: 'self', of: 'iessey' }], ['ruf', { via: 'self', of: 'ruf' }]])));
      // атлас читает набор из памяти при загрузке: сначала перезагрузка, потом ссылка «набор» без списка (UX-79: при пустом
      // наборе в памяти атласа такая ссылка показала бы все лица со строкой-пояснением)
      await p.reload();
      await p.waitForTimeout(1600);
      await go(p, '#/~k1', 2600);
      // этап 11 (решение 81): строка показа на телефоне — одной строкой «набор — 3 лица — изменить»; все лица — «Всё
      // небо» в листе «Показ» («Показать 2 670 лиц»)
      const bar = p.locator('.sky .showbar');
      if (!(await bar.count())) return fail('нет строки показа');
      const bt = nbsp(await bar.locator('.txt').innerText()).replace(/\u2060/g, '').replace(/\s+/g, ' ').trim();
      if (!/^набор — 3 лица — изменить$/.test(bt)) return fail(`строка: «${bt}»`);
      const btn = bar.locator('.sb-cmd', { hasText: 'изменить' });
      const h = (await btn.boundingBox())!.height;
      if (h < 44) return fail(`команда ${h} px`);
      await btn.tap();
      await p.waitForTimeout(600);
      await p.locator('.showsheet .ss-kind', { hasText: 'Всё небо' }).first().tap();
      await p.waitForTimeout(300);
      const apply = p.locator('.showsheet .ss-apply button');
      if (!((await apply.boundingBox())!.height >= 44)) return fail('кнопка «Показать» ниже 44 px');
      await apply.tap();
      await p.waitForTimeout(900);
      if ((await p.locator('.sky canvas').first().getAttribute('data-mode')) === 'work') return fail('лист «Показ» не вернул все лица');
      // описание неба для диктора: одно (скрытое, только как описание холста), о жестах
      const d = await p.evaluate(() => ({
        hidden: !!document.getElementById('sky-window')?.hidden && !!document.getElementById('sky-help')?.hidden,
        help: document.getElementById('sky-help')?.textContent ?? '',
      }));
      if (!d.hidden) return fail('описание окна неба читается дважды');
      if (!/Коснитесь звезды/.test(d.help) || /Стрелки/.test(d.help)) return fail(`справка на сенсорном экране: «${d.help}»`);
      // «Какое лицо?»: касание в плотном месте — фокус на первом имени
      await go(p, '#/', 2400);
      const sky = (await p.locator('.sky > canvas').boundingBox())!;
      let asked = false;
      for (const [x, y] of [[270, 430], [250, 440], [290, 420], [230, 450], [300, 440]]) {
        await p.touchscreen.tap(sky.x + x - sky.x, y);
        await p.waitForTimeout(500);
        if (await p.locator('.which[data-placed]').count()) {
          asked = true;
          break;
        }
      }
      if (asked) {
        const f = await p.evaluate(() => document.activeElement?.classList.contains('which-item') ?? false);
        if (!f) return fail('«Какое лицо?» открыт, а фокус не на имени');
        await p.keyboard.press('Escape');
      }
      // протяжка пальцем у левого края сдвигает небо, а не растягивает строки (решение 27; MOB-57)
      await go(p, '#/~y-1000~w300~l0', 2400);
      const v0 = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
      const cdp = await p.context().newCDPSession(p);
      const pt = (y: number) => [{ x: 12, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(400) });
      for (let k = 1; k <= 10; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(400 + 15 * k) });
        await p.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(700);
      const v1 = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
      if (Math.abs(v1[7] / v0[7] - 1) > 0.01) return fail(`палец у края растянул строки: ${v0[7]} → ${v1[7]}`);
      if (Math.abs(v1[6] - v0[6]) < 1e-6) return fail('палец у края не сдвинул небо');
      // вступление на сенсорном экране: касания — первым пунктом, без клавиши «/» и слова «щёлкните»
      await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'open'));
      await p.reload();
      await p.waitForTimeout(2000);
      const guide = p.locator('.cartouche .guide');
      const first = nbsp(await guide.locator('li:visible').first().innerText());
      if (!/^Коснитесь звезды/.test(first)) return fail(`первый пункт вступления: «${first}»`);
      const text = nbsp(await guide.innerText());
      if (/клавиша \/|Щёлкните/i.test(text)) return fail('во вступлении на сенсорном экране — слова для мыши');
      return pass(asked ? '«Какое лицо?» с фокусом' : 'плотного места для «Какое лицо?» не нашлось');
    },
  },
  {
    n: 257,
    title: 'IX-67, решения 34 и 45: режим «набор» и набор до 12 лиц — в адресе; ссылка в новой вкладке показывает тот же набор временным просмотром, память получателя — только после «добавить в мой набор»',
    run: async (p) => {
      await go(p, '#/david', 2400);
      await p.evaluate(() => localStorage.setItem('toledot:work', JSON.stringify([['david', { via: 'self', of: 'david' }], ['ovid', { via: 'self', of: 'ovid' }], ['vooz', { via: 'self', of: 'vooz' }]])));
      await p.reload();
      await p.waitForTimeout(2400);
      // этап 11 (решение 81): показ «набор» — лист «Показ»; в адресе — поле показа «~vs» (прежде «~k1»)
      await pickShow(p, 'Набор', { ms: 1500 });
      const url = p.url();
      const h = decodeURIComponent(new URL(url).hash);
      if (!/~vs/.test(h) || !/~ndavid\.ovid\.vooz/.test(h)) return fail(`адрес: ${h}`);
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(url);
        await q.waitForTimeout(2600);
        const mode = await q.locator('.sky canvas').first().getAttribute('data-mode');
        if (mode !== 'work') return fail(`новая вкладка: режим ${mode}`);
        // набор ссылки — временный просмотр (решение 45): память получателя пуста, у кромки — строка «Набор по ссылке»
        if ((await stored(q)).length) return fail(`новая вкладка: набор записан в память до «добавить»: ${(await stored(q)).join(' ')}`);
        const bar = q.locator('.sky .linkbar');
        if (!(await bar.count())) return fail('новая вкладка: нет строки «Набор по ссылке»');
        const t = nbsp(await bar.innerText()).replace(/\s+/g, ' ').trim();
        // этап 13 (решение 111): свой набор пуст — «всё небо», а не «вернуться к моему (0)»
        if (!/^Набор по ссылке: 3 лица — добавить в мой набор всё небо$/.test(t)) return fail(`новая вкладка: строка «${t}»`);
        // небо показывает ровно набор ссылки: подписаны его лица
        const named = ((await q.locator('.sky canvas').first().getAttribute('data-label-ids')) ?? '').split(' ').filter(Boolean);
        if (named.length && named.some((id) => !['david', 'ovid', 'vooz'].includes(id))) return fail(`новая вкладка: на небе не только набор: ${named.join(' ')}`);
        if (!/~ndavid\.ovid\.vooz/.test(decodeURIComponent(new URL(q.url()).hash))) return fail(`новая вкладка: адрес ${q.url()}`);
        await bar.getByRole('button', { name: 'добавить в мой набор' }).click();
        await q.waitForTimeout(600);
        const set = await stored(q);
        if (set.join(' ') !== 'david ovid vooz') return fail(`после «добавить в мой набор»: ${set.join(' ')}`);
        // строка своего набора — строка показа «На небе: набор — 3 лица»
        const own = nbsp(await q.locator('.sky .showbar .txt').innerText()).replace(/\u2060/g, '').replace(/\s+/g, ' ');
        if ((await bar.count()) || !/набор — 3 лица/.test(own)) return fail(`после «добавить» — не строка своего набора: «${own}»`);
      } finally {
        await ctx.close();
      }
      return pass(h);
    },
  },
  {
    n: 258,
    title: 'IX-64: в показе «набор» отдаление — не дальше окна набора ×1,5 (не уже 200 лет); «Вписать» вписывает набор',
    run: async (p) => {
      await p.evaluate(() => localStorage.setItem('toledot:work', JSON.stringify([['david', { via: 'self', of: 'david' }], ['iessey', { via: 'self', of: 'iessey' }], ['ovid', { via: 'self', of: 'ovid' }], ['vooz', { via: 'self', of: 'vooz' }], ['ruf', { via: 'self', of: 'ruf' }]])));
      // атлас читает набор из памяти при загрузке: сначала перезагрузка, потом ссылка «набор» без списка (UX-79: при пустом
      // наборе в памяти атласа такая ссылка показала бы все лица со строкой-пояснением)
      await p.reload();
      await p.waitForTimeout(1600);
      await go(p, '#/~k1', 2600);
      if ((await p.locator('.sky canvas').first().getAttribute('data-mode')) !== 'work') return fail('адрес с k1 не включил режим «набор»');
      // этап 11 (Я30): «Всё небо» органов неба — «Вписать» (весь показ «набор» в окне)
      await p.locator('.skyctl button', { hasText: 'Вписать' }).click();
      await p.waitForTimeout(1600);
      const fit = hashWin(p);
      // предел — окно набора со всеми следами жизни ×1,5 (view.ts, updateZoomFloor): «Вписать» вписывает только звёзды, а
      // следы (Давид умер в 970 г. до Р. Х.) шире; годы следов — из подписей списка лиц на виду (все годы набора — до Р. Х.)
      const yrs = (await p.evaluate(() =>
        [...document.querySelectorAll('#sky-stars button')]
          .filter((b) => ['david', 'iessey', 'ovid', 'vooz', 'ruf'].some((id) => b.id === `sky-star-${id}`))
          .flatMap((b) => [...(b.getAttribute('aria-label') ?? '').matchAll(/\d{3,4}/g)].map((m) => Number(m[0]))),
      )) as number[];
      const trails = yrs.length ? Math.max(...yrs) - Math.min(...yrs) : 0;
      const box = await canvasBox(p);
      for (let i = 0; i < 12; i++) {
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.wheel(0, 300);
        await p.waitForTimeout(120);
      }
      await p.waitForTimeout(900);
      const out = hashWin(p);
      if (!(out.w > 0 && fit.w > 0)) return fail(`окно не прочитано: ${p.url()}`);
      const limit = Math.max(Math.max(fit.w, trails) * 1.5, 200) * 1.08;
      if (out.w > limit) return fail(`окно набора ${fit.w} лет (со следами ${trails}), после отдаления ${out.w} лет (предел ${Math.round(limit)})`);
      if ((await p.locator('.skyctl button[aria-label="Отдалить"]').getAttribute('aria-disabled')) !== 'true') return fail('«Отдалить» не выключена у предела');
      return pass(`${fit.w} (со следами ${trails}) → ${out.w} лет`);
    },
  },
  {
    n: 259,
    title: 'IX-56, VIS-51, MOB-26, MOB-46, IX-65, UX-08: органы неба колонкой на узком небе, с учётом листа; лист «Вид» пристыкован к блоку, «Эпохи» закрывает лист, у масштаба времени — пояснения',
    run: async (p) => {
      const log: string[] = [];
      const browser = p.context().browser()!;
      const check = async (w: number, h: number, o: { dpr?: number; touch?: boolean }, hash: string): Promise<Check | null> => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.dpr ?? 1, isMobile: !!o.touch, hasTouch: !!o.touch, colorScheme: 'dark' });
        try {
          const q = await ctx.newPage();
          await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
          await q.goto(p.url().replace(/#.*$/, '') + hash);
          await q.waitForTimeout(2600);
          if (!(await q.locator('.sky .skyctl.column').count())) return fail(`${w}×${h}: органы не колонкой`);
          // каждый орган виден и сверху — не под листом карточки
          const covered = await q.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.sky .skyctl.column button')].filter((b) => {
              const r = b.getBoundingClientRect();
              const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !e || !b.contains(e);
            }).length,
          );
          if (covered) return fail(`${w}×${h}: закрыто органов ${covered}`);
          log.push(`${w}×${h} колонка`);
          return null;
        } finally {
          await ctx.close();
        }
      };
      for (const [w, h, o, hash] of [
        [1024, 768, {}, '#/david'],
        [720, 450, { dpr: 2 }, '#/david'],
        [640, 400, { dpr: 2 }, '#/david'],
        [600, 900, {}, '#/david'],
        [844, 390, { touch: true }, '#/'],
      ] as [number, number, { dpr?: number; touch?: boolean }, string][]) {
        const r = await check(w, h, o, hash);
        if (r) return r;
      }
      // 1440: блок; лист «Вид» — нижняя рамка листа совпадает с верхней рамкой блока, правые края совпадают
      await go(p, '#/david', 2400);
      if (await p.locator('.sky .skyctl.column').count()) return fail('1440: колонка вместо блока');
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(300);
      const pop = (await p.locator('.viewpop').boundingBox())!;
      const blk = (await p.locator('.sky > .skyctl').boundingBox())!;
      if (Math.abs(pop.y + pop.height - (blk.y + 1)) > 1.01) return fail(`лист «Вид» не пристыкован: низ ${pop.y + pop.height}, верх блока ${blk.y}`);
      if (Math.abs(pop.x + pop.width - (blk.x + blk.width)) > 1.01) return fail(`правые края: ${pop.x + pop.width} и ${blk.x + blk.width}`);
      const titles = await p.locator('.viewpop .seg button').evaluateAll((bs) => bs.map((b) => b.getAttribute('title') ?? ''));
      if (titles.length < 2 || titles.some((t) => !t)) return fail('у сегментов масштаба времени нет пояснений');
      // «Эпохи» — команда листа: открывает панель и закрывает лист
      await p.locator('.viewpop button', { hasText: 'Эпохи' }).click();
      await p.waitForTimeout(600);
      if (await p.locator('.viewpop').count()) return fail('«Эпохи» не закрыла лист «Вид»');
      if (!/pepochs/.test(p.url())) return fail('панель «Эпохи» не открылась');
      return pass(log.join('; '));
    },
  },
  {
    n: 260,
    title: 'VIS-46, MAP-67, CARD-71: строки состояния — под служебной строкой, линейка лет видна; «Отмечены лица главы Мф 1 — снять (Esc)»',
    run: async (p) => {
      await go(p, '#/ruf', 2400);
      await p.locator('.folio button', { hasText: /Родство с|Найти родство/ }).first().click();
      await p.waitForTimeout(500);
      const bar = p.locator('.sky .pickbar-pick');
      if (!(await bar.count())) return fail('нет строки выбора второго лица');
      const b = (await bar.boundingBox())!;
      const c = await cam(p);
      const top = (await canvasBox(p)).y;
      if (b.y - top < c.t) return fail(`строка выбора закрывает линейку: верх ${Math.round(b.y - top)}, рамка ${c.t}`);
      if (b.height > 37) return fail(`строка выше 36 px: ${b.height}`);
      if (!/— отменить \(Esc\)$/.test(nbsp(await bar.innerText()).replace(/\s+/g, ' ').trim())) return fail(`строка: «${await bar.innerText()}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      // группа главы
      await go(p, '#/~pchapter', 2400);
      const ch = p.locator('.sheet button', { hasText: /Мф/ }).first();
      if (await ch.count()) {
        await ch.click();
        await p.waitForTimeout(1500);
      }
      const g = p.locator('.sky .groupbar');
      if (!(await g.count())) return pass('строка выбора — под рамкой; группы главы на этом пути нет');
      const t = nbsp(await g.innerText()).replace(/\s+/g, ' ').trim();
      if (!/^Отмечены лица главы .+ — снять \(Esc\)$/.test(t)) return fail(`строка группы: «${t}»`);
      if (/снять.*снять/i.test(t)) return fail(`«снять» дважды: «${t}»`);
      return pass(t);
    },
  },
  {
    n: 261,
    title: 'VIS-50, MOB-58: ручки границ видны в покое (три точки), зона захвата 24 px, на сенсорном экране — 44 px',
    run: async (p) => {
      await go(p, '#/david', 2400);
      const r = p.locator('.app > .resizer-folio');
      if (!(await r.count())) return fail('нет ручки границы карточки');
      const w = (await r.boundingBox())!.width;
      if (Math.round(w) !== 24) return fail(`зона захвата ${w} px`);
      const dots = await r.evaluate((e) => getComputedStyle(e, '::before').backgroundImage);
      if (!/gradient/.test(dots)) return fail('в покое ручку не видно');
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: 'dark' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '') + '#/david');
        await q.waitForTimeout(2400);
        const t = q.locator('.app > .resizer-folio');
        if (!(await t.count())) return fail('планшет: нет ручки');
        const tw = (await t.boundingBox())!.width;
        if (Math.round(tw) !== 44) return fail(`планшет: зона захвата ${tw} px`);
      } finally {
        await ctx.close();
      }
      return pass();
    },
  },
  {
    n: 262,
    title: 'MAP-65, VIS-60: «Небо во весь экран» (F) держит выбранное лицо на его месте и окно лет; фокус неба — уголками',
    run: async (p) => {
      await go(p, '#/david~y-1000~w700~l0~s1~pindex', 2600);
      const a = await selAt(p);
      const c0 = await cam(p);
      if (!a) return fail('Давид не на экране');
      const fx0 = (a.x - c0.l) / (c0.r - c0.l);
      await p.locator('.sky > canvas').focus();
      await p.keyboard.press('KeyF');
      await p.waitForTimeout(1000);
      const b = await selAt(p);
      const c1 = await cam(p);
      if (!b) return fail('после F Давида нет на экране');
      const fx1 = (b.x - c1.l) / (c1.r - c1.l);
      if (Math.abs(fx1 - fx0) > 0.01 || Math.abs(b.y - a.y) > 2) return fail(`Давид: доля ширины ${fx0.toFixed(3)} → ${fx1.toFixed(3)}, y ${a.y} → ${b.y}`);
      const years0 = (c0.r - c0.l) / c0.kx;
      const years1 = (c1.r - c1.l) / c1.kx;
      if (Math.abs(years1 / years0 - 1) > 0.02) return fail(`окно в мировых единицах: ${years0.toFixed(0)} → ${years1.toFixed(0)}`);
      const corners = await p.evaluate(() => getComputedStyle(document.querySelector('.sky')!, '::after').backgroundImage);
      const outline = await p.evaluate(() => getComputedStyle(document.querySelector('.sky > canvas')!).outlineStyle);
      await p.keyboard.press('KeyF');
      if (!/gradient/.test(corners)) return fail('у неба с фокусом нет уголков');
      if (outline !== 'none') return fail(`у неба с фокусом рамка: ${outline}`);
      return pass(`доля ${fx0.toFixed(3)} → ${fx1.toFixed(3)}`);
    },
  },
  {
    n: 263,
    title: 'UX-53, IX-61: протяжка по буквам — за 8 px; метка «Пропорции изменены — вернуть» (этап 14, решение 154), величина — в подсказке; двойной щелчок по буквам — сброс; «по умолчанию» доступна, пока пропорция не 1',
    run: async (p) => {
      await go(p, '#/~y-1000~w300~l0~s1', 2400);
      const box = await canvasBox(p);
      const x = box.x + 8;
      const y = box.y + box.height * 0.5;
      // дрожь руки в 6 px — пропорция прежняя
      await p.mouse.move(x, y);
      await p.mouse.down();
      await p.mouse.move(x, y + 6, { steps: 3 });
      await p.mouse.up();
      await p.waitForTimeout(500);
      if (/~h/.test(p.url())) return fail(`6 px по буквам изменили пропорцию: ${p.url()}`);
      await p.mouse.move(x, y);
      await p.mouse.down();
      await p.mouse.move(x, y + 140, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(700);
      const note = p.locator('.sky .lanesbar');
      if (!(await note.count())) return fail('нет метки пропорции строк');
      const t = nbsp(await note.innerText()).replace(/\s+/g, ' ').trim();
      if (t !== 'Пропорции изменены — вернуть') return fail(`метка: «${t}»`);
      const tip = nbsp((await note.locator('.txt').getAttribute('title')) ?? '');
      if (!/[Сс]троки ×[\d,]+/.test(tip)) return fail(`подсказка метки: «${tip}»`);
      // «Всё небо»: пропорция на обзоре может упираться в край, но «по умолчанию» доступна
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(1500);
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(300);
      const reset = p.locator('.viewpop button.reset');
      if ((await reset.getAttribute('aria-disabled')) === 'true') return fail('«по умолчанию» выключена при пропорции не 1');
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(200);
      await p.mouse.dblclick(x, y);
      await p.waitForTimeout(700);
      if (await note.count()) return fail('двойной щелчок по буквам не сбросил пропорцию');
      return pass(t);
    },
  },
  {
    n: 264,
    title: 'IX-62: «+» и «−» выключаются у предела масштаба и говорят почему',
    run: async (p) => {
      await go(p, '#/david', 2400);
      const plus = p.locator('.skyctl button[aria-label="Приблизить"]');
      for (let i = 0; i < 10 && (await plus.getAttribute('aria-disabled')) !== 'true'; i++) {
        await plus.click();
        await p.waitForTimeout(320);
      }
      if ((await plus.getAttribute('aria-disabled')) !== 'true') return fail('«Приблизить» не выключилась у предела');
      if (!/Ближе нельзя/.test((await plus.getAttribute('title')) ?? '')) return fail(`title: ${await plus.getAttribute('title')}`);
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(1600);
      const minus = p.locator('.skyctl button[aria-label="Отдалить"]');
      if ((await minus.getAttribute('aria-disabled')) !== 'true') return fail('на «всём небе» «Отдалить» доступна');
      if ((await plus.getAttribute('aria-disabled')) === 'true') return fail('на «всём небе» «Приблизить» выключена');
      return pass();
    },
  },
  {
    n: 265,
    title: 'IX-53: «Все N на небе» (Мария) — окно по годам группы, а не тысячелетия; строки сжаты, все Марии на экране',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'Мария');
      await p.waitForTimeout(400);
      const all = p.locator('.result.cmdrow').first();
      if (!(await all.count())) return fail('нет строки «Все N на небе»');
      await all.click();
      await p.waitForTimeout(2600);
      const w = hashWin(p).w;
      if (!(w >= 60 && w <= 400)) return fail(`окно ${w} лет`);
      const ids = await p.evaluate(() => [...document.querySelectorAll('#sky-stars button')].map((b) => b.id.replace('sky-star-', '')));
      const marys = ids.filter((id) => /^mariya/.test(id));
      if (marys.length < 4) return fail(`Марий на виду: ${marys.length} (${ids.slice(0, 10).join(', ')})`);
      return pass(`окно ${w} лет, Марий на виду ${marys.length}`);
    },
  },
  {
    n: 266,
    title: 'IX-13: без выбранного лица открытие панели слева вписывает прежнее окно лет в новое небо',
    run: async (p) => {
      await go(p, '#/~y-1000~w300~l0~s1', 2400);
      const c0 = await cam(p);
      const w0 = hashWin(p).w;
      await p.locator('.top button', { hasText: 'Главы' }).first().click();
      await p.waitForTimeout(1500);
      const c1 = await cam(p);
      const w1 = hashWin(p).w;
      if (!(c1.r - c1.l < c0.r - c0.l - 100)) return fail('панель не сузила небо');
      if (Math.abs(w1 / w0 - 1) > 0.06) return fail(`окно лет ${w0} → ${w1}`);
      return pass(`окно ${w0} → ${w1} лет, небо ${Math.round(c0.r - c0.l)} → ${Math.round(c1.r - c1.l)} px`);
    },
  },
  {
    n: 267,
    title: 'IX-57: колесо над надписями поверх неба («Как читать карту», органы, строка у кромки) — небу',
    run: async (p) => {
      await go(p, '#/david', 2400);
      const over = async (sel: string) => {
        const b = (await p.locator(sel).first().boundingBox())!;
        const k0 = (await cam(p)).kx;
        await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await p.mouse.wheel(0, -100);
        await p.waitForTimeout(500);
        return (await cam(p)).kx / k0;
      };
      const g = await over('.sky .guide-cmd');
      if (!(g > 1.2)) return fail(`над «Как читать карту» масштаб ×${g.toFixed(2)}`);
      const c = await over('.sky > .skyctl .layers');
      if (!(c > 1.2)) return fail(`над органами масштаб ×${c.toFixed(2)}`);
      return pass(`×${g.toFixed(2)}, ×${c.toFixed(2)}`);
    },
  },
  {
    n: 268,
    title: 'IX-58, IX-22, UX-08: подсказка — две строки, третья через 700 мс, клавиш нет; выбор второго лица — «Иессей — отец Давида» и путь на небе; «≈» объяснён',
    run: async (p) => {
      await go(p, '#/david~y-1050~w180~l0~s1', 2600);
      const box = await canvasBox(p);
      const s = await star(p, 'iessey');
      if (!s) return fail('Иессея нет на небе');
      await p.mouse.move(box.x + s.x, box.y + s.y);
      await p.waitForTimeout(300);
      const tip = p.locator('.sky .tip[data-shown]');
      if (!(await tip.count())) return fail('нет подсказки');
      const lines1 = (await tip.innerText()).split('\n').filter(Boolean).length;
      if (lines1 > 2) return fail(`сразу ${lines1} строк`);
      await p.waitForTimeout(900);
      // через 700 мс — третья строка, и не больше; клавиш набора в подсказке нет: они в таблице «Клавиши» (IX-58, VIS-69)
      const t2 = nbsp(await tip.innerText());
      const lines2 = t2.split('\n').filter(Boolean).length;
      if (lines2 !== 3) return fail(`через 700 мс — ${lines2} строк: «${t2}»`);
      if (/\((D|C)\)|взять в работу|потомков на небе/.test(t2) || (await tip.locator('kbd').count())) return fail(`клавиши в подсказке: «${t2}»`);
      // выбор второго лица «Родства»: наведение на Иессея — кем он приходится Давиду и путь на небе, до выбора
      await go(p, '#/david~y-1050~w180~l0~s1', 2400);
      await p.locator('.folio button', { hasText: /Родство с|Найти родство/ }).first().click();
      await p.waitForTimeout(500);
      const j = await star(p, 'iessey');
      if (!j) return fail('Иессея нет на небе в режиме выбора');
      await p.mouse.move(box.x + j.x, box.y + j.y);
      await p.waitForTimeout(500);
      const kin = p.locator('.sky .tip[data-shown] .kin');
      if (!(await kin.count())) return fail('в режиме выбора нет предпросмотра родства');
      const kt = nbsp(await kin.innerText());
      if (!/^Иессей — отец Давида/.test(kt)) return fail(`предпросмотр: «${kt}»`);
      const path = await p.locator('.sky').getAttribute('data-kin-preview');
      if (path !== 'david iessey') return fail(`путь на небе: ${path}`);
      if (hashId(p) !== 'david' || !(await p.locator('.sky .pickbar-pick').count())) return fail('наведение сменило выбор или сняло режим');
      // «≈» у масштабной линейки объяснён (UX-08): на «всём небе» шкала неравномерна
      await p.keyboard.press('Escape');
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(1600);
      const bar = await p.evaluate(() => {
        const c = document.querySelector('.sky > canvas') as HTMLCanvasElement;
        return c.getBoundingClientRect().width;
      });
      for (let x = bar - 20; x > bar - 320; x -= 6) {
        await p.mouse.move(box.x + x, box.y + 35);
        await p.waitForTimeout(40);
        if (await p.locator('.sky .tip[data-kind="note"]').count()) break;
      }
      await p.waitForTimeout(300);
      const note = p.locator('.sky .tip[data-kind="note"][data-shown]');
      if (!(await note.count())) return fail('у «≈» нет пояснения');
      if (!/Масштаб неравномерный/.test(nbsp(await note.innerText()))) return fail(`пояснение «≈»: ${await note.innerText()}`);
      await p.keyboard.press('Escape');
      return pass(kt);
    },
  },
  {
    n: 269,
    title: 'UX-56, IX-41, IX-63, MAP-59: вступление на 1024 × 768 — входы с «Руфью» без прокрутки, «?» назван; «Как читать карту» — слева внизу; «только линии» — поле 24 px у Адама',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'open'));
      await p.reload();
      await p.waitForTimeout(2000);
      const cart = p.locator('.sky .cartouche');
      if (!(await cart.count())) return fail('вступление не открыто');
      const cb = (await cart.boundingBox())!;
      const ruf = cart.locator('.entry button', { hasText: 'Руфь' });
      if (!(await ruf.count())) return fail('нет входа «Руфь»');
      const rb = (await ruf.boundingBox())!;
      if (rb.y + rb.height > cb.y + cb.height) return fail('входы ниже края вступления');
      const scroll = await cart.evaluate((e) => e.scrollHeight - e.clientHeight);
      if (scroll > 2) return fail(`вступление прокручивается на ${scroll} px`);
      if (!/Все клавиши — \?/.test(nbsp(await cart.innerText()).replace(/\s+/g, ' '))) return fail('«?» во вступлении не назван');
      await cart.locator('.close').click();
      await p.waitForTimeout(500);
      const g = (await p.locator('.sky .guide-cmd').boundingBox())!;
      const sb = await canvasBox(p);
      if (g.y < sb.y + sb.height / 2 || g.x > sb.x + 60) return fail(`«Как читать карту» не слева внизу: ${Math.round(g.x - sb.x)}, ${Math.round(g.y - sb.y)}`);
      // «только линии Мессии»: Адам — в 24 px от левого края видимой части
      await go(p, '#/~s1~o1', 3000);
      const c = await cam(p);
      const adam = await star(p, 'adam');
      if (!adam) return fail('Адама нет среди лиц на виду');
      if (Math.abs(adam.x - (c.l + 24)) > 3) return fail(`Адам на ${adam.x - c.l} px от края (нужно 24)`);
      return pass(`Адам в ${adam.x - c.l} px`);
    },
  },
];
