/** Сценарии приёмки этапа 3: колесо и тачпад, адрес, поиск, клавиатура, ссылки на лица, полоса времени. Номера 50–69. */
import type { Page } from 'playwright';
import { pass, fail, find, hashId, type Scenario } from './kit.ts';

/** Окно неба в годах (астр.) по полосе времени: [начало, конец]. Обновляется каждый кадр неба. */
const win = async (p: Page): Promise<[number, number]> => {
  const [a, b] = ((await p.locator('.strip').getAttribute('data-window')) ?? '').split(' ').map(Number);
  return [a, b];
};
const width = async (p: Page) => {
  const [a, b] = await win(p);
  return b - a;
};
/** Поля вида из адреса (D8): год середины, ширина, полоса, панель, масштаб. */
const addr = (p: Page) => {
  const h = decodeURIComponent(new URL(p.url()).hash);
  const f = Object.fromEntries(h.replace(/^#\/[^~]*/, '').split('~').filter(Boolean).map((x) => [x[0], x.slice(1)]));
  return { y: Number(f.y), w: Number(f.w), l: Number(f.l), p: f.p ?? '', s: f.s ?? '', m: f.m ?? '', raw: h };
};
/** Точка неба в рамке холста, где нет звезды (нет подсказки) и сверху лежит сам холст. */
async function emptySpot(p: Page): Promise<{ x: number; y: number } | null> {
  const box = (await p.locator('.sky canvas').boundingBox())!;
  for (let y = box.y + 80; y < box.y + box.height - 80; y += 23)
    for (let x = box.x + 60; x < box.x + box.width - 60; x += 31) {
      const top = await p.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y]);
      if (top !== 'CANVAS') continue;
      await p.mouse.move(x, y);
      await p.waitForTimeout(8);
      if (!(await p.locator('.sky .tip').count())) {
        // и в радиусе порога щелчка тоже пусто
        let clear = true;
        for (const [dx, dy] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) {
          await p.mouse.move(x + dx, y + dy);
          if (await p.locator('.sky .tip').count()) clear = false;
        }
        if (clear) return { x, y };
      }
    }
  return null;
}
/** Навести указатель на звезду: спираль от середины неба, пока не появится подсказка. */
async function starSpot(p: Page, ok: (name: string) => boolean = () => true): Promise<{ x: number; y: number; name: string } | null> {
  const box = (await p.locator('.sky canvas').boundingBox())!;
  const cx = box.x + box.width * 0.45;
  const cy = box.y + box.height * 0.5;
  for (let r = 0; r < 360; r += 9)
    for (let k = 0; k < 16; k++) {
      const x = cx + r * Math.cos((k / 16) * Math.PI * 2);
      const y = cy + r * Math.sin((k / 16) * Math.PI * 2);
      if (y < box.y + 60 || y > box.y + box.height - 60 || x < box.x + 40 || x > box.x + box.width - 40) continue;
      const top = await p.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y]);
      if (top !== 'CANVAS') continue;
      await p.mouse.move(x, y);
      await p.waitForTimeout(8);
      const tip = p.locator('.sky .tip b');
      if (await tip.count()) {
        const name = (await tip.innerText()).trim();
        if (ok(name)) return { x, y, name };
      }
    }
  return null;
}
const title = async (p: Page) => ((await p.locator('.folio [id^="title-"]').count()) ? (await p.locator('.folio [id^="title-"]').first().innerText()).trim() : '');
const near = (a: number, b: number, tol: number) => Math.abs(a / b - 1) <= tol;

export const nav: Scenario[] = [
  {
    n: 50,
    title: 'U7, тачпад: два пальца вниз сдвигают небо вниз, щипок масштабирует; колесо мыши — масштаб у указателя, Shift + колесо — только время (D1, J1)',
    run: async (p) => {
      // адрес с лицом — перелёт к нему: на «всём небе» сдвигать и отдалять некуда
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const mx = box.x + box.width * 0.4;
      const my = box.y + box.height * 0.5;
      await p.mouse.move(mx, my);
      await p.waitForTimeout(450);
      const a0 = addr(p);
      const w0 = await width(p);
      // тачпад: мелкие дробные шаги прокрутки; пальцы вниз — deltaY < 0 (естественная прокрутка)
      for (let i = 0; i < 8; i++) {
        await p.mouse.wheel(0, -12.5);
        await p.waitForTimeout(16);
      }
      await p.waitForTimeout(500);
      const a1 = addr(p);
      const w1 = await width(p);
      if (!near(w1, w0, 0.01)) return fail(`два пальца изменили масштаб: ${w0.toFixed(0)} → ${w1.toFixed(0)} лет`);
      if (!(a1.l > a0.l + 0.5)) return fail(`небо не сдвинулось вниз: полоса середины ${a0.l} → ${a1.l}`);
      // щипок: ctrlKey + мелкий шаг
      await p.keyboard.down('Control');
      for (let i = 0; i < 6; i++) {
        await p.mouse.wheel(0, -10);
        await p.waitForTimeout(16);
      }
      await p.keyboard.up('Control');
      await p.waitForTimeout(300);
      const w2 = await width(p);
      if (!(w2 < w1 * 0.8)) return fail(`щипок не приблизил: ${w1.toFixed(0)} → ${w2.toFixed(0)} лет`);
      // колесо мыши: щелчок 100 px — масштаб ×1,5
      await p.mouse.wheel(0, 100);
      await p.waitForTimeout(450);
      const w3 = await width(p);
      if (!near(w3 / w2, 1.5, 0.08)) return fail(`щелчок колеса: ${w2.toFixed(0)} → ${w3.toFixed(0)} лет, а не ×1,5`);
      // Shift + колесо — только время (J1): окно ×1,5 по годам, высота полосы прежняя; сдвиг у мыши — протяжкой
      const ky0 = Number(((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ')[7]);
      await p.keyboard.down('Shift');
      await p.mouse.wheel(0, 100);
      await p.keyboard.up('Shift');
      await p.waitForTimeout(450);
      const w4 = await width(p);
      const ky1 = Number(((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ')[7]);
      if (!near(w4 / w3, 1.5, 0.08) || !near(ky1, ky0, 0.01)) return fail(`Shift + колесо: ширина ${w3.toFixed(0)} → ${w4.toFixed(0)} лет, полоса ${ky0.toFixed(1)} → ${ky1.toFixed(1)} px`);
      return pass(`пальцы: полоса ${a0.l} → ${a1.l}; щипок ×${(w1 / w2).toFixed(2)}; колесо ×${(w3 / w2).toFixed(2)}`);
    },
  },
  {
    n: 51,
    title: 'Шаги масштаба анимированы и складываются: колесо ×1,5 за 180 мс, «+» ×2 за 250 мс без фокуса на холсте; «0» — всё небо (D1, D10)',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      await p.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
      const w0 = await width(p);
      await p.mouse.wheel(0, 100);
      const early = await width(p);
      await p.mouse.wheel(0, 100);
      await p.waitForTimeout(450);
      const w1 = await width(p);
      if (near(early / w0, 1.5, 0.02)) return fail('щелчок колеса сработал скачком, без анимации');
      if (!near(w1 / w0, 2.25, 0.1)) return fail(`два щелчка подряд: ×${(w1 / w0).toFixed(2)}, а не ×2,25`);
      // «+» без фокуса на холсте: фокус — на заголовке карточки
      await p.locator('.folio [id^="title-"]').first().focus();
      await p.keyboard.press('Equal');
      await p.waitForTimeout(450);
      const w2 = await width(p);
      if (!near(w1 / w2, 2, 0.08)) return fail(`«+»: ×${(w1 / w2).toFixed(2)}, а не ×2`);
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(1700);
      const [a, b] = await win(p);
      if (!(a < -3900 && b > 0)) return fail(`«0» не показал всё небо: ${a.toFixed(0)}…${b.toFixed(0)}`);
      // prefers-reduced-motion: шаг сразу, без анимации
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
      try {
        const q = await ctx.newPage();
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '#/david'));
        await q.waitForTimeout(2000);
        const r0 = await width(q);
        await q.keyboard.press('Equal');
        await q.waitForTimeout(40);
        const r1 = await width(q);
        if (!near(r0 / r1, 2, 0.1)) return fail(`при ослабленном движении «+» не сразу: ×${(r0 / r1).toFixed(2)} через 40 мс`);
      } finally {
        await ctx.close();
      }
      return pass(`колесо ×${(w1 / w0).toFixed(2)} за два щелчка, «+» ×${(w1 / w2).toFixed(2)}; при ослабленном движении — сразу`);
    },
  },
  {
    n: 52,
    title: 'Щелчок по пустому небу снимает выбор, «назад» возвращает; дрожание мыши 4 px — всё ещё щелчок (D3)',
    run: async (p) => {
      await find(p, 'Давид');
      await p.waitForTimeout(800);
      const spot = await emptySpot(p);
      if (!spot) return fail('не нашлось пустого места на небе');
      await p.mouse.click(spot.x, spot.y);
      await p.waitForTimeout(500);
      if (hashId(p) !== '') return fail(`щелчок по пустому небу не снял выбор: «${hashId(p)}»`);
      await p.goBack();
      await p.waitForTimeout(800);
      if (hashId(p) !== 'david') return fail(`«назад» вернул «${hashId(p)}», а не Давида`);
      const star = await starSpot(p, (n) => n !== 'Давид');
      if (!star) return fail('не нашлось звезды');
      await p.mouse.move(star.x, star.y);
      await p.mouse.down();
      await p.mouse.move(star.x + 3, star.y + 2.6);
      await p.mouse.up();
      await p.waitForTimeout(600);
      const t = await title(p);
      return t.startsWith(star.name) ? pass(`дрожание 4 px выбрало «${star.name}»`) : fail(`после дрожания 4 px открыто «${t}», а не «${star.name}»`);
    },
  },
  {
    n: 53,
    title: 'Телефон 390 × 844: касание с дрожанием 8 px выбирает звезду (D3; MOB-09)',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      const star = await starSpot(p);
      if (!star) return fail('не нашлось звезды');
      const cdp = await p.context().newCDPSession(p);
      const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(star.x, star.y) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(star.x + 5, star.y + 6) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(800);
      if (!hashId(p)) return fail(`касание с дрожанием ≈8 px не выбрало «${star.name}»`);
      const t = await title(p);
      return t.startsWith(star.name) ? pass(`«${star.name}»`) : fail(`выбрано «${t}», а не «${star.name}»`);
    },
  },
  {
    n: 54,
    title: 'Ссылка на лицо: на экране — выбор без перелёта, за краем — с перелётом; наведение подсвечивает звезду; в «Родстве» пара не меняется (D7)',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      // отец на виду — без перелёта
      const father = p.locator('.folio #sec-6 button.person[data-id="iessey"]').first();
      if (!(await father.count())) return fail('в § 6 Давида нет ссылки на Иессея');
      const w0 = await win(p);
      await father.click();
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'iessey') return fail(`ссылка выбрала «${hashId(p)}»`);
      const w1 = await win(p);
      if (Math.abs(w1[0] - w0[0]) > 1 || Math.abs(w1[1] - w0[1]) > 1) return fail(`Иессей был на виду, но небо сдвинулось: ${w0.map(Math.round)} → ${w1.map(Math.round)}`);
      // лицо за краем — перелёт: небо уведено клавишами далеко от семьи Давида
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      await p.locator('.sky canvas').focus();
      for (let i = 0; i < 14; i++) await p.keyboard.press('Shift+ArrowLeft');
      await p.waitForTimeout(600);
      const far = p.locator('.folio #sec-6 button.person[data-id="iessey"]').first();
      const w2 = await win(p);
      await far.click();
      await p.waitForTimeout(1800);
      const w3 = await win(p);
      if (hashId(p) !== 'iessey') return fail(`ссылка выбрала «${hashId(p)}»`);
      if (Math.abs(w3[0] - w2[0]) < 50) return fail(`к Иессею за краем небо не перелетело: ${w2.map(Math.round)} → ${w3.map(Math.round)}`);
      // наведение на ссылку подсвечивает звезду (подпись на небе), уход — как было; на «всём небе» подписаны не все
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(1800);
      const shot = () => p.locator('.sky canvas').screenshot();
      const links = p.locator('.folio button.person');
      let lit = '';
      for (let i = 0; i < Math.min(8, await links.count()) && !lit; i++) {
        const link = links.nth(i);
        await link.scrollIntoViewIfNeeded();
        await p.mouse.move(2, 2);
        await p.waitForTimeout(250);
        const before = await shot();
        await link.hover();
        await p.waitForTimeout(250);
        const during = await shot();
        await p.mouse.move(2, 2);
        await p.waitForTimeout(250);
        const after = await shot();
        if (!before.equals(during)) {
          if (!before.equals(after)) return fail('после ухода со ссылки подсветка осталась');
          lit = (await link.getAttribute('data-id')) ?? '?';
        }
      }
      if (!lit) return fail('наведение на ссылки карточки не изменило небо');
      // «Родство»: ссылки внутри панели пару не меняют
      await p.goto(p.url().replace(/#.*$/, '#/ioav'));
      await p.waitForTimeout(1500);
      await p.click('.commands >> text=Родство');
      await p.fill('.sheet .field input', 'Давид');
      await p.waitForTimeout(300);
      // поле «Второе» — комбобокс поиска (G1): лицо выбирается строкой списка
      await p.locator('.sheet [role="option"]', { hasText: 'Давид' }).first().click();
      await p.waitForTimeout(600);
      const inPanel = p.locator('.sheet button.person[data-id="saruiya"], .sheet button.person[data-id="iessey"]').first();
      if (!(await inPanel.count())) return fail('в цепочке родства нет ссылки на Саруию или Иессея');
      await inPanel.click();
      await p.waitForTimeout(800);
      const a = addr(p);
      if (a.p !== 'kinship') return fail('панель «Родство» закрылась');
      if (!/~bdavid/.test(a.raw) || !/~aioav/.test(a.raw)) return fail(`пара изменилась: ${a.raw}`);
      return pass(`на виду — без перелёта, за краем — с перелётом, наведение на «${lit}» — подпись; пара Иоав — Давид цела`);
    },
  },
  {
    n: 55,
    title: 'U10: адрес при открытом Давиде, «Эпохах» и истинном масштабе — в новой вкладке то же лицо, окно, панель и масштаб (D8)',
    run: async (p) => {
      // окно вокруг Давида, а не «всё небо»: ссылка должна передать именно его
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      await p.locator('.skyctl .view-toggle').click();
      // «Эпохи» — команда листа «Вид», она закрывает лист (IX-65): масштаб — раньше
      await p.locator('.skyctl').getByText('истинный', { exact: true }).click();
      await p.locator('.skyctl').getByText('Эпохи', { exact: true }).click();
      await p.waitForTimeout(1500);
      const url = p.url();
      const hash = new URL(url).hash;
      if (!/^#\/[A-Za-z0-9._~-]*$/.test(hash)) return fail(`в адресе недопустимые знаки: ${hash}`);
      const a = addr(p);
      if (hashId(p) !== 'david' || a.p !== 'epochs' || a.s !== '0' || !(a.w > 0)) return fail(`адрес не хранит вид: ${hash}`);
      const w0 = await win(p);
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      try {
        const q = await ctx.newPage();
        // новая вкладка: своё хранилище, в нём — масштаб «по насыщенности»
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true'); localStorage.setItem('toledot:lambda', '1')");
        await q.goto(url);
        await q.waitForTimeout(3000);
        if (hashId(q) !== 'david') return fail(`в новой вкладке лицо «${hashId(q)}»`);
        const h2 = (await q.locator('.sheet h2').count()) ? (await q.locator('.sheet h2').innerText()).trim() : '';
        if (h2 !== 'Эпохи') return fail(`в новой вкладке панель «${h2}»`);
        // панель «Эпохи» и карточка сужают небо — органы колонкой, масштаб — в листе «Вид» у колонки (IX-56)
        const col = (await q.locator('.skyctl.column').count()) > 0;
        if (col) await q.locator('.skyctl.column button', { hasText: 'Вид' }).click();
        else await q.locator('.skyctl .view-toggle').click();
        await q.waitForTimeout(300);
        // «Вид» у колонки сменил панель «Эпохи» — небо стало шире, и лист «Вид» открыт над блоком
        const scale = (await q.locator('.viewpop .seg button[aria-pressed="true"], .sky .sheet .viewctl .seg button[aria-pressed="true"]').first().innerText()).trim();
        if (scale !== 'истинный') return fail(`в новой вкладке масштаб «${scale}»`);
        const w1 = await win(q);
        const c0 = (w0[0] + w0[1]) / 2;
        const c1 = (w1[0] + w1[1]) / 2;
        if (!near(w1[1] - w1[0], w0[1] - w0[0], 0.03) || Math.abs(c1 - c0) > (w0[1] - w0[0]) * 0.03) return fail(`окно ${w0.map(Math.round)} → ${w1.map(Math.round)}`);
        return pass(`${hash}; окно ${w1.map(Math.round).join('…')}`);
      } finally {
        await ctx.close();
      }
    },
  },
  {
    n: 56,
    title: '«Назад» сначала закрывает панель, затем возвращает прежнее лицо; прежний адрес #/david работает (D8; UX-30)',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      if (hashId(p) !== 'david' || !(await p.locator('.folio').isVisible())) return fail('адрес #/david не открыл Давида');
      if (!(addr(p).w > 0)) return fail(`адрес не дополнился окном: ${addr(p).raw}`);
      await find(p, 'Руфь');
      await p.click('.commands >> text=Синопсис');
      await p.waitForTimeout(500);
      if (!(await p.locator('.sheet').count())) return fail('«Синопсис» не открылся');
      await p.goBack();
      await p.waitForTimeout(600);
      if (await p.locator('.sheet').count()) return fail('«назад» не закрыл панель');
      if (hashId(p) !== 'ruf') return fail(`после первого «назад» выбрано «${hashId(p)}», а не Руфь`);
      await p.goBack();
      await p.waitForTimeout(1500);
      return hashId(p) === 'david' ? pass() : fail(`второе «назад» вернуло «${hashId(p)}», а не Давида`);
    },
  },
  {
    n: 57,
    title: 'Несуществующее лицо в адресе — сообщение и открытый поиск с похожими лицами (D8; IX-44)',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '#/davdi'));
      await p.reload();
      await p.waitForTimeout(2200);
      if (!(await p.evaluate("document.activeElement && document.activeElement.id === 'find'"))) return fail('поиск не открыт');
      const t = ((await p.locator('#find-results').count()) ? await p.locator('#find-results').innerText() : '').replace(/ /g, ' ');
      if (!/Лица с адресом «davdi» в атласе нет/.test(t)) return fail(`нет сообщения: «${t.slice(0, 80)}»`);
      return /Давид/.test(t) ? pass() : fail('среди похожих нет Давида');
    },
  },
  {
    n: 58,
    title: 'U4: «Иисус» — Иисус Христос первым; «иосиф» — группа одноимённых с годами; строки ≤ 60 px; стрелки ведут видимую строку, мышь — ту же (D9)',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'Иисус');
      await p.waitForTimeout(300);
      const first = (await p.locator('#find-results .result:not(.cmdrow) .nm').first().innerText()).trim();
      if (first !== 'Иисус Христос') return fail(`первым — «${first}»`);
      await p.fill('#find', 'иосиф');
      await p.waitForTimeout(300);
      const head = ((await p.locator('#find-results .grp-head').first().innerText()) ?? '').replace(/ /g, ' ');
      if (!/^Иосиф — \d+ лиц/.test(head)) return fail(`нет группы одноимённых: «${head}»`);
      const grouped = p.locator('#find-results .result.grouped');
      const n = await grouped.count();
      if (n < 5) return fail(`в группе ${n} строк`);
      for (let i = 0; i < n; i++) if (!(await grouped.nth(i).locator('.yr').innerText()).trim()) return fail('у строки группы нет годов');
      const heights = await p.locator('#find-results [role="option"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      if (Math.max(...heights) > 60) return fail(`строка выше 60 px: ${Math.max(...heights).toFixed(0)}`);
      for (let i = 0; i < 14; i++) await p.keyboard.press('ArrowDown');
      const st = await p.evaluate(`(() => {
        const inp = document.getElementById('find');
        const id = inp.getAttribute('aria-activedescendant');
        const a = id && document.getElementById(id);
        const l = document.getElementById('find-results').getBoundingClientRect();
        if (!a) return { ok: false };
        const r = a.getBoundingClientRect();
        return { ok: a.getAttribute('aria-selected') === 'true', vis: r.top >= l.top - 1 && r.bottom <= l.bottom + 1 };
      })()`) as { ok: boolean; vis?: boolean };
      if (!st.ok) return fail('aria-activedescendant не указывает на выделенную строку');
      if (!st.vis) return fail('выделенная стрелками строка за краем списка');
      // мышь переносит выделение: Enter выбирает строку под мышью
      const row = p.locator('#find-results .result.grouped', { hasText: 'из Аримафеи' });
      await row.hover();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      return hashId(p) === 'iosif-arimafeyskiy' ? pass(`строк ${heights.length}, выше всех — ${Math.max(...heights).toFixed(0)} px`) : fail(`Enter после наведения выбрал «${hashId(p)}»`);
    },
  },
  {
    n: 59,
    title: 'U3 и U4: «Быт 14:18» с клавиатуры — Мелхиседек за 3 действия, в карточке Евр 7:3; «руф 4:21» — все лица стиха; «Руф 4» — глава (D9)',
    run: async (p) => {
      // 1) «/», 2) набор, 3) Enter — без мыши
      await p.keyboard.press('Slash');
      await p.keyboard.type('Быт 14:18');
      await p.waitForTimeout(1500);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      if (hashId(p) !== 'melkhisedek') return fail(`«Быт 14:18» выбрал «${hashId(p)}»`);
      const card = (await p.locator('.folio').innerText()).replace(/ /g, ' ');
      if (!/Евр 7:3/.test(card)) return fail('в карточке Мелхиседека нет Евр 7:3');
      await p.click('#find');
      await p.fill('#find', 'руф 4:21');
      await p.waitForTimeout(1200);
      const names = (await p.locator('#find-results .result:not(.cmdrow) .nm').allInnerTexts()).map((t) => t.trim());
      for (const nm of ['Салмон', 'Вооз', 'Овид']) if (!names.includes(nm)) return fail(`в «руф 4:21» нет «${nm}»: ${names.join(', ')}`);
      await p.fill('#find', 'Руф 4');
      await p.waitForTimeout(1200);
      const ch = (await p.locator('#find-results .result:not(.cmdrow) .nm').allInnerTexts()).map((t) => t.trim());
      for (const nm of ['Руфь', 'Вооз', 'Давид']) if (!ch.includes(nm)) return fail(`в главе «Руф 4» нет «${nm}»`);
      return pass(`стих: ${names.join(', ')}; глава: ${ch.length} лиц`);
    },
  },
  {
    n: 60,
    title: 'Поиск прощает: «Иессея» — Иессей, «Навуходонасор» — «Возможно, вы искали», «Богородица» — «в Синодальном переводе — Мария» (D9; решение владельца 13)',
    run: async (p) => {
      const top = async (q: string) => {
        await p.click('#find');
        await p.fill('#find', q);
        await p.waitForTimeout(350);
        return {
          head: ((await p.locator('#find-results .grp-head').count()) ? await p.locator('#find-results .grp-head').first().innerText() : '').replace(/ /g, ' '),
          name: (await p.locator('#find-results .result:not(.cmdrow) .nm').first().innerText()).trim(),
        };
      };
      const a = await top('Иессея');
      if (a.name !== 'Иессей') return fail(`«Иессея» → «${a.name}»`);
      const b = await top('Навуходонасор');
      if (b.name !== 'Навуходоносор' || !/Возможно, вы искали/.test(b.head)) return fail(`«Навуходонасор» → «${b.name}», «${b.head}»`);
      const c = await top('Богородица');
      if (c.name !== 'Мария' || !/в Синодальном переводе — Мария/.test(c.head)) return fail(`«Богородица» → «${c.name}», «${c.head}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      return hashId(p) === 'mariya' ? pass(c.head) : fail(`Enter выбрал «${hashId(p)}»`);
    },
  },
  {
    n: 61,
    title: '«Все N на небе» — первой строкой; отметки ставятся, «Снять отметки» и Escape их снимают (D9; IX-19)',
    run: async (p) => {
      await p.click('#find');
      await p.fill('#find', 'иосиф');
      await p.waitForTimeout(300);
      const firstRow = p.locator('#find-results [role="option"]').first();
      const t = (await firstRow.innerText()).trim();
      if (!/^Все \d+ на небе$/.test(t)) return fail(`первая строка — «${t}»`);
      if ((await firstRow.getAttribute('aria-selected')) === 'true') return fail('курсор стоит на «Все N», а не на первом лице');
      await firstRow.click();
      await p.waitForTimeout(400);
      // тот же запрос: вместо «Все N» — «Снять отметки»
      await p.click('#find');
      await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(200);
      const t2 = ((await p.locator('#find-results [role="option"]').first().innerText()) ?? '').replace(/ /g, ' ').trim();
      if (!/^Снять отметки/.test(t2)) return fail(`после отметки первая строка — «${t2}»`);
      // Escape вне поля снимает отметки (D5: одно нажатие — одно состояние)
      await p.keyboard.press('Escape');
      await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await p.keyboard.press('Escape');
      await p.click('#find');
      await p.waitForTimeout(200);
      const t3 = (await p.locator('#find-results [role="option"]').first().innerText()).trim();
      return /^Все \d+ на небе$/.test(t3) ? pass(t) : fail(`Escape не снял отметки: «${t3}»`);
    },
  },
  {
    n: 62,
    title: 'Клавиши без фокуса на холсте: «[» к отцу, «]» — обратно; «?» — клавиши обеих раскладок; J и K — разделы карточки (D10)',
    run: async (p) => {
      await find(p, 'Давид');
      // фокус — на заголовке карточки (поиск ставит его туда), не на холсте
      await p.keyboard.press('BracketLeft');
      await p.waitForTimeout(700);
      if (hashId(p) !== 'iessey') return fail(`«[» от Давида выбрал «${hashId(p)}»`);
      await p.keyboard.press('BracketRight');
      await p.waitForTimeout(700);
      if (hashId(p) !== 'david') return fail(`«]» вернул «${hashId(p)}», а не Давида`);
      // J — к следующему разделу: фокус на его заголовке
      await p.locator('.folio [id^="title-"]').first().focus();
      await p.keyboard.press('KeyJ');
      await p.waitForTimeout(500);
      const s1 = await p.evaluate("(document.activeElement && document.activeElement.closest('.sec') || {}).id || ''");
      await p.keyboard.press('KeyJ');
      await p.waitForTimeout(500);
      const s2 = await p.evaluate("(document.activeElement && document.activeElement.closest('.sec') || {}).id || ''");
      await p.keyboard.press('KeyK');
      await p.waitForTimeout(500);
      const s3 = await p.evaluate("(document.activeElement && document.activeElement.closest('.sec') || {}).id || ''");
      if (!s1 || !s2 || s1 === s2 || s3 !== s1) return fail(`J, J, K: ${s1} → ${s2} → ${s3}`);
      // «?» — «Условные знаки» на разделе «Клавиши»
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(700);
      const h2 = (await p.locator('.sheet h2').count()) ? (await p.locator('.sheet h2').innerText()).trim() : '';
      if (h2 !== 'Условные знаки') return fail(`«?» открыл «${h2}»`);
      const keys = p.locator('.sheet #legend-keys');
      if (!(await keys.count())) return fail('в «Условных знаках» нет раздела «Клавиши»');
      const kb = (await keys.boundingBox())!;
      const sb = (await p.locator('.sheet').boundingBox())!;
      if (kb.y < sb.y - 1 || kb.y + 30 > sb.y + sb.height) return fail('раздел «Клавиши» не виден в панели');
      return pass(`разделы ${s1} → ${s2} → ${s3}`);
    },
  },
  {
    n: 63,
    title: 'Полоса времени: курсоры, протяжка вне рамки ставит её середину под указатель, ползунок со стрелками, двойной щелчок — всё небо (D12, IX-50)',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '#/david'));
      await p.waitForTimeout(2200);
      const cv = p.locator('.strip canvas');
      const box = (await cv.boundingBox())!;
      const T0 = -4183, T1 = 2040, PAD = 14;
      const xOf = (t: number) => box.x + PAD + ((t - T0) / (T1 - T0)) * (box.width - PAD * 2);
      const y = box.y + box.height / 2;
      const [a, b] = await win(p);
      // курсоры: тело рамки — grab, край — ew-resize, вне рамки — pointer
      const cursor = async (x: number) => {
        await p.mouse.move(x, y);
        return p.evaluate(() => (document.querySelector('.strip canvas') as HTMLElement).style.cursor);
      };
      const cm = await cursor((xOf(a) + xOf(b)) / 2);
      const cl = await cursor(Math.min(xOf(a), (xOf(a) + xOf(b)) / 2 - 22) - 10);
      const co = await cursor(xOf(-3000));
      if (cm !== 'grab' || cl !== 'ew-resize' || co !== 'pointer') return fail(`курсоры: рамка «${cm}», край «${cl}», вне «${co}»`);
      // протяжка вне рамки: со сдвигом больше 3 px середина — под указатель, дальше рамка идёт за ним
      // (IX-50: нажатие без сдвига рамку не трогает — это проверяет сценарий 291)
      const target = -2500;
      await p.mouse.move(xOf(target) - 6, y);
      await p.mouse.down();
      await p.mouse.move(xOf(target), y, { steps: 2 });
      await p.waitForTimeout(250);
      const [a1, b1] = await win(p);
      await p.mouse.move(xOf(target) + 40, y, { steps: 4 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const [a2] = await win(p);
      const mid = (a1 + b1) / 2;
      if (Math.abs(mid - target) > (b - a) * 0.15) return fail(`после нажатия середина окна ${mid.toFixed(0)}, а не ${target}`);
      if (!(a2 > a1 + 50)) return fail('протяжка после нажатия не сдвинула окно');
      // ползунок: стрелка вправо — на 10 % ширины
      await cv.focus();
      const role = await cv.getAttribute('role');
      const [c0, d0] = await win(p);
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(200);
      const [c1, d1] = await win(p);
      if (role !== 'slider') return fail(`у полосы role «${role}»`);
      if (!near(c1 - c0, (d0 - c0) * 0.1, 0.25) || !near(d1 - c1, d0 - c0, 0.02)) return fail(`стрелка: ${c0.toFixed(0)}…${d0.toFixed(0)} → ${c1.toFixed(0)}…${d1.toFixed(0)}`);
      if (!(await cv.getAttribute('aria-valuetext'))) return fail('у ползунка нет aria-valuetext');
      // двойной щелчок — всё небо
      await p.mouse.dblclick(xOf(-1000), y);
      await p.waitForTimeout(1800);
      const [e0, e1] = await win(p);
      return e0 < -3900 && e1 > 0 ? pass(`курсоры ${cm}/${cl}/${co}`) : fail(`двойной щелчок: ${e0.toFixed(0)}…${e1.toFixed(0)}`);
    },
  },
];
