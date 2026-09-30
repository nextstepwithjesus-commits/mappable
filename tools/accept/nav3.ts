/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа nav3: номера 350–369, камера,
 * адрес и история (L4). Проверки — по окну неба .sky[data-view] («vp.l vp.t vp.r vp.b x0 kx laneTop ky»), месту выбранной
 * звезды .sky[data-sel], месту звёзд в списке неба для диктора (#sky-star-<id> data-x, data-y), адресу, записи
 * движения камеры по кадрам и памяти браузера («toledot:work», «toledot:lanes», «toledot:tabs»).
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, pickShow, type Scenario } from './kit.ts';

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
/** Окно адреса: год середины и ширина в годах. */
const win = (p: Page) => {
  const h = decodeURIComponent(new URL(p.url()).hash);
  return { y: Number(/~y(-?\d+)/.exec(h)?.[1]), w: Number(/~w(\d+)/.exec(h)?.[1]) };
};
const txt = (s: string) => s.replace(/[ ⁠]/g, ' ').replace(/\s+/g, ' ').trim();
const stored = (p: Page, key: string) => p.evaluate((k) => localStorage.getItem(k), key);
const storedWork = async (p: Page) => ((await p.evaluate(`JSON.parse(localStorage.getItem('toledot:work') || '[]').map((r) => r[0])`)) as string[]).join(' ');
const setWork = (p: Page, ids: string[]) => p.evaluate((ids) => localStorage.setItem('toledot:work', JSON.stringify(ids.map((id) => [id, { via: 'self', of: id }]))), ids);
const selInView = async (p: Page) => {
  const s = await selAt(p);
  const c = await cam(p);
  return !!s && s.x > c.l && s.x < c.r && s.y > c.t && s.y < c.b;
};
async function search(p: Page, q: string) {
  await p.click('#find');
  await p.fill('#find', q);
  await p.waitForTimeout(350);
}

/**
 * Записать движение камеры по кадрам во время act: сколько мс от первого до последнего изменения масштаба и сдвига
 * (x0, kx, laneTop — без видимой части: её меняет карточка), и наибольшее отдаление по пути против концов.
 */
async function motion(p: Page, act: () => Promise<unknown>, wait: number) {
  await p.evaluate(`(() => {
    window.__rec = []; window.__stop = false;
    const tick = () => {
      if (window.__stop) return;
      const v = (document.querySelector('.sky')?.getAttribute('data-view') ?? '').split(' ').map(Number);
      window.__rec.push({ t: performance.now(), x0: v[4], kx: v[5], lt: v[6] });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await act();
  await p.waitForTimeout(wait);
  const r = (await p.evaluate(`(() => { window.__stop = true; return window.__rec; })()`)) as { t: number; x0: number; kx: number; lt: number }[];
  let first = -1;
  let last = -1;
  for (let i = 1; i < r.length; i++)
    if (r[i].x0 !== r[i - 1].x0 || r[i].kx !== r[i - 1].kx || r[i].lt !== r[i - 1].lt) {
      if (first < 0) first = r[i - 1].t;
      last = r[i].t;
    }
  const ks = r.map((x) => x.kx).filter((k) => k > 0);
  const k0 = ks[0];
  const k1 = ks[ks.length - 1];
  const kMin = Math.min(...ks);
  // «отдалить — приблизить»: по пути мельче обоих концов
  const beyond = kMin < Math.min(k0, k1) * 0.98;
  // масштаб меняется в одну сторону
  let mono = true;
  for (let i = 1; i < ks.length; i++) if ((ks[i] - ks[i - 1]) * (k1 - k0) < -1e-9 * k0) mono = false;
  return { ms: first < 0 ? 0 : Math.round(last - first), k0, k1, beyond, mono };
}

export const nav3: Scenario[] = [
  {
    n: 350,
    title: 'IX-68, решение 44: поиск «Давид» с обзора приближает к лицу — окно не шире 900 лет, Давид на экране, перелёт 0,8–1,2 с',
    run: async (p) => {
      await go(p, '#/', 2400);
      const w0 = win(p).w;
      await search(p, 'Давид');
      const m = await motion(p, () => p.keyboard.press('Enter'), 2400);
      if (hashId(p) !== 'david') return fail(`выбрано «${hashId(p)}»`);
      const w = win(p).w;
      if (!(w <= 900)) return fail(`небо осталось на обзоре: окно ${w} лет (было ${w0})`);
      if (!(await selInView(p))) return fail('Давида нет в видимой части неба');
      // замер по кадрам: 1,2 с ± кадр слабой машины
      if (m.ms < 700 || m.ms > 1350) return fail(`перелёт ${m.ms} мс`);
      return pass(`окно ${w0} → ${w} лет, перелёт ${m.ms} мс`);
    },
  },
  {
    n: 351,
    title: 'IX-68: щелчок по звезде на обзоре камеру не двигает; ссылка на отца в карточке — перелёт к нему до уровня чтения',
    run: async (p) => {
      await go(p, '#/', 2400);
      const s = await p.evaluate(() => {
        const b = document.getElementById('sky-star-avraam') as HTMLElement | null;
        return b && b.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
      });
      if (!s) return fail('звезды Авраама нет среди звёзд на виду');
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      const w0 = win(p).w;
      await p.mouse.click(box.x + s.x, box.y + s.y);
      await p.waitForTimeout(1600);
      if (hashId(p) !== 'avraam') return fail(`щелчок выбрал «${hashId(p)}»`);
      // небо — по-прежнему всё (карточка сузила небо, и «всё небо» вписано в новую ширину), к звезде оно не приблизилось
      const w1 = win(p).w;
      if (w1 < w0 * 0.9) return fail(`щелчок по звезде приблизил небо: окно ${w0} → ${w1} лет`);
      // ссылка в карточке — лицо с обзора: перелёт до уровня чтения
      const link = p.locator('.folio button.person', { hasText: 'Фарра' }).first();
      if (!(await link.count())) return fail('в карточке Авраама нет ссылки на Фарру');
      await link.click();
      await p.waitForTimeout(2200);
      const w2 = win(p).w;
      if (hashId(p) !== 'farra') return fail(`ссылка выбрала «${hashId(p)}»`);
      if (!(w2 <= 900)) return fail(`ссылка с обзора не приблизила: окно ${w2} лет`);
      return (await selInView(p)) ? pass(`щелчок: окно ${w1} лет, камера на месте; ссылка: окно ${w2} лет`) : fail('Фарры нет в видимой части');
    },
  },
  {
    n: 352,
    title: 'IX-70: «Все 6 на небе» сжимает строки временно — память и адрес без пропорции; Escape возвращает строки; после перезагрузки у Давида строки обычные',
    run: async (p) => {
      await go(p, '#/', 2400);
      await search(p, 'Мария');
      const all = p.locator('.results .cmdrow.all').first();
      if (!(await all.count())) return fail('нет строки «Все N на небе»');
      await all.click();
      await p.waitForTimeout(2200);
      const pinned = await cam(p);
      if ((await stored(p, 'toledot:lanes')) !== null) return fail(`пропорция записана в память: ${await stored(p, 'toledot:lanes')}`);
      if (/~h/.test(p.url())) return fail(`пропорция в адресе: ${p.url()}`);
      if (await p.locator('.sky .lanesbar').count()) return fail('при отметках видна метка «строки ×…»');
      // первый Escape уводит из поля поиска, следующий снимает отметки (D5)
      for (let i = 0; i < 3 && (await p.locator('.sky .pinbar').count()); i++) {
        await p.keyboard.press('Escape');
        await p.waitForTimeout(450);
      }
      await p.waitForTimeout(500);
      if (await p.locator('.sky .pinbar').count()) return fail('Escape не снял отметки');
      const back = await cam(p);
      if (!(back.ky > pinned.ky * 1.2)) return fail(`строки не вернулись: ky ${pinned.ky} → ${back.ky}`);
      if (Math.abs(back.kx / pinned.kx - 1) > 1e-3) return fail('возврат строк сдвинул время');
      await go(p, '#/david', 400);
      await p.reload();
      await p.waitForTimeout(2600);
      if (await p.locator('.sky .lanesbar').count()) return fail(`у Давида после перезагрузки: «${await p.locator('.sky .lanesbar').innerText()}»`);
      return /~h/.test(p.url()) ? fail(`пропорция в адресе: ${p.url()}`) : pass(`строки ×${(pinned.ky / back.ky).toFixed(2)} на время отметок`);
    },
  },
  {
    n: 353,
    title: 'MAP-79: «Все N на небе» для «Захарии» — окно по годам отмеченных, правый край не дальше 100 г. по Р. Х., пропорция строк не меняется',
    run: async (p) => {
      await go(p, '#/', 2400);
      await search(p, 'Захария');
      await p.locator('.results .cmdrow.all').first().click();
      await p.waitForTimeout(2400);
      const { y, w } = win(p);
      // окно адреса — год середины и ширина: правый край ≈ y + w / 2 (у Р. Х. шкала почти равномерна)
      const right = y + w / 2;
      if (!(right <= 110)) return fail(`правый край ≈ ${Math.round(right)} г.: окно ${y} ± ${w / 2}`);
      if (/~h/.test(p.url()) || (await stored(p, 'toledot:lanes')) !== null) return fail(`пропорция строк изменилась: ${p.url()}`);
      const shown = (await p.locator('.sky').getAttribute('data-labels')) ?? '';
      return pass(`окно ${w} лет, правый край ≈ ${Math.round(right)} г.; подписи ${shown}`);
    },
  },
  {
    n: 354,
    title: 'IX-69, решение 45: набор из чужой ссылки — временный просмотр; свой набор и память не меняются до «добавить»; «вернуться к моему» и уход на «#/» убирают набор ссылки из адреса',
    run: async (p) => {
      await setWork(p, ['avraam', 'sarra']);
      const link = '#/david~y-1014~w200~l-0.5~s1~mmt-long~k1~niessey.david';
      await go(p, link, 100);
      await p.reload();
      await p.waitForTimeout(2600);
      const bar = p.locator('.sky .linkbar');
      if (!(await bar.count())) return fail('нет строки «Набор по ссылке»');
      const t = txt(await bar.innerText());
      if (!/^Набор по ссылке: 2 лица — добавить в мой набор вернуться к моему \(2\)$/.test(t)) return fail(`строка: «${t}»`);
      if ((await storedWork(p)) !== 'avraam sarra') return fail(`свой набор изменён: ${await storedWork(p)}`);
      if ((await p.locator('.sky > canvas').getAttribute('data-mode')) !== 'work') return fail('небо не в режиме «набор»');
      // вернуться к моему: небо — свой набор, набор ссылки уходит из адреса
      await bar.getByRole('button', { name: 'вернуться к моему (2)' }).click();
      await p.waitForTimeout(900);
      if (/iessey/.test(p.url())) return fail(`набор ссылки остался в адресе: ${p.url()}`);
      if (await bar.count()) return fail('строка ссылки осталась');
      // снова по ссылке — «добавить в мой набор»
      await go(p, link, 100);
      await p.reload();
      await p.waitForTimeout(2600);
      await p.locator('.sky .linkbar').getByRole('button', { name: 'добавить в мой набор' }).click();
      await p.waitForTimeout(600);
      if ((await storedWork(p)) !== 'avraam sarra iessey david') return fail(`после «добавить»: ${await storedWork(p)}`);
      // свой набор — строка показа «На небе: набор — 4 лица» (этап 11, решение 81: прежде — строка режима «набор»)
      const wl = p.locator('.sky .showbar .txt');
      if (!(await wl.count()) || !/набор — 4 лица/.test(txt(await wl.innerText())) || (await p.locator('.sky .linkbar').count())) return fail('после «добавить» небо не показывает свой набор из 4 лиц');
      // третий раз: ссылка — и уход на «#/»
      await setWork(p, ['avraam']);
      await go(p, link, 100);
      await p.reload();
      await p.waitForTimeout(2600);
      await go(p, '#/', 1400);
      if (/iessey/.test(p.url())) return fail(`после «#/» набор ссылки в адресе: ${p.url()}`);
      return (await storedWork(p)) === 'avraam' ? pass(t) : fail(`память изменена уходом: ${await storedWork(p)}`);
    },
  },
  {
    n: 355,
    title: 'UX-79, IX-69: ссылка «набор» у получателя с пустым набором — со списком: набор ссылки и та же строка; без списка: все лица и строка-пояснение',
    run: async (p) => {
      await go(p, '#/david~y-1855~w3633~l-3.5~s1~mmt-long~k1', 100);
      await p.reload();
      await p.waitForTimeout(2600);
      const note = p.locator('.sky .noticebar');
      if (!(await note.count())) return fail('нет строки-пояснения');
      const t1 = txt(await note.innerText());
      if (!/^Ссылка открыта в режиме «набор», но ваш набор пуст: показаны все лица — скрыть$/.test(t1)) return fail(`строка: «${t1}»`);
      if ((await p.locator('.sky > canvas').getAttribute('data-mode')) !== 'all') return fail('небо не показывает все лица');
      await go(p, '#/david~y-1014~w200~l-0.5~s1~mmt-long~k1~niessey.david', 100);
      await p.reload();
      await p.waitForTimeout(2600);
      const bar = p.locator('.sky .linkbar');
      if (!(await bar.count())) return fail('ссылка со списком: нет строки «Набор по ссылке»');
      const t2 = txt(await bar.innerText());
      if (!/вернуться к моему \(0\)$/.test(t2)) return fail(`строка: «${t2}»`);
      if ((await storedWork(p)) !== '') return fail(`память изменена: ${await storedWork(p)}`);
      await bar.getByRole('button', { name: 'вернуться к моему (0)' }).click();
      await p.waitForTimeout(900);
      if ((await p.locator('.sky > canvas').getAttribute('data-mode')) !== 'all') return fail('«вернуться к моему (0)» оставило пустое небо');
      return pass(`${t1}; ${t2}`);
    },
  },
  {
    n: 356,
    // этап 11 (решение 81): флажок «только линии Мессии» стал показом «Линии Мессии» (лист «Показ»); выключение — «всё
    // небо» в строке показа
    title: 'IX-73, UX-68, решение 49: показ «Линии Мессии» у Руфи — окно ±10 поколений, Руфь и Овид в кадре; «всё небо» возвращает прежнее окно за 400 мс',
    run: async (p) => {
      await go(p, '#/ruf', 2800);
      const w0 = win(p);
      const c0 = await cam(p);
      await pickShow(p, 'Линии Мессии', { ms: 1200 });
      const on = win(p);
      if (!(on.w < 3000)) return fail(`вписан весь коридор: окно ${on.w} лет`);
      const ovid = await p.evaluate(() => {
        const b = document.getElementById('sky-star-ovid') as HTMLElement | null;
        return !!b && !!b.dataset.x;
      });
      if (!ovid) return fail('Овида (сына Руфи на линии) нет на экране');
      const m = await motion(p, () => p.locator('.sky .showbar .sb-cmd', { hasText: 'всё небо' }).click(), 1200);
      const c1 = await cam(p);
      const w1 = win(p);
      if (Math.abs(c1.kx / c0.kx - 1) > 0.01 || Math.abs(c1.x0 - c0.x0) * c1.kx > 3) return fail(`окно не вернулось: ${w0.y}/${w0.w} → ${w1.y}/${w1.w}`);
      // 400 мс по кадрам слабой машины: не больше 700 мс, против 1,2–1,4 с перелёта
      if (m.ms < 250 || m.ms > 700) return fail(`возврат окна ${m.ms} мс`);
      if (!(await selInView(p))) return fail('Руфи нет в видимой части');
      return pass(`окно ${w0.w} → ${on.w} → ${w1.w} лет, возврат ${m.ms} мс`);
    },
  },
  {
    n: 357,
    title: 'IX-73: в показе «Линии Мессии» небо сдвинули — «всё небо» окно не возвращает, выбранное лицо остаётся в видимой части',
    run: async (p) => {
      await go(p, '#/david', 2800);
      await pickShow(p, 'Линии Мессии', { ms: 1200 });
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      await p.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
      await p.mouse.down();
      await p.mouse.move(box.x + box.width * 0.4 - 120, box.y + box.height * 0.5, { steps: 6 });
      await p.mouse.up();
      await p.waitForTimeout(700);
      const moved = await cam(p);
      await p.locator('.sky .showbar .sb-cmd', { hasText: 'всё небо' }).click();
      await p.waitForTimeout(1000);
      const after = await cam(p);
      if (Math.abs(after.kx / moved.kx - 1) > 0.01) return fail(`выключение изменило масштаб: ${moved.kx} → ${after.kx}`);
      return (await selInView(p)) ? pass('окно осталось, Давид в видимой части') : fail('Давида нет в видимой части');
    },
  },
  {
    n: 358,
    title: 'IX-74, решение 46: «назад» и «вперёд» — переход 250–300 мс без «отдалить — приблизить»; адрес — адрес самой записи',
    run: async (p) => {
      await go(p, '#/', 2400);
      const urls: string[] = [p.url()];
      await search(p, 'Давид');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2200);
      urls.push(p.url());
      const sol = p.locator('.folio button.person', { hasText: 'Соломон' }).first();
      if (!(await sol.count())) return fail('в карточке Давида нет ссылки на Соломона');
      await sol.click();
      await p.waitForTimeout(1800);
      urls.push(p.url());
      await p.locator('header.top button', { hasText: 'Указатель' }).first().click();
      await p.waitForTimeout(1200);
      urls.push(p.url());
      await p.keyboard.press('Escape');
      await p.waitForTimeout(1200);
      urls.push(p.url());
      await search(p, 'Павел');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2400);
      urls.push(p.url());
      const log: string[] = [];
      for (let k = urls.length - 2; k >= 1; k--) {
        const m = await motion(p, () => p.goBack(), 900);
        if (p.url() !== urls[k]) return fail(`«назад» к записи ${k}: адрес ${p.url()}, а запись — ${urls[k]}`);
        if (m.beyond) return fail(`«назад» к записи ${k}: «отдалить — приблизить»`);
        if (m.ms > 400) return fail(`«назад» к записи ${k}: ${m.ms} мс`);
        log.push(String(m.ms));
      }
      for (let k = 2; k < urls.length; k++) {
        const m = await motion(p, () => p.goForward(), 900);
        if (p.url() !== urls[k]) return fail(`«вперёд» к записи ${k}: адрес ${p.url()}, а запись — ${urls[k]}`);
        if (m.beyond || m.ms > 400) return fail(`«вперёд» к записи ${k}: ${m.ms} мс${m.beyond ? ', с отдалением' : ''}`);
        log.push(String(m.ms));
      }
      return pass(`переходы, мс: ${log.join(', ')}`);
    },
  },
  {
    n: 359,
    // этап 11 (Я30): команда органов неба «Всё небо» стала «Вписать» (на всём небе — то же вписывание всего неба)
    title: 'IX-79: «Вписать» и «Толедот» — 400–600 мс, масштаб только уменьшается, без фазы «приблизить»',
    run: async (p) => {
      const log: string[] = [];
      for (const [name, sel] of [['«Вписать»', '.skyctl button:has-text("Вписать")'], ['«Толедот»', 'header.top .wordmark']] as const) {
        await go(p, '#/david', 2800);
        const btn = p.locator(sel).first();
        if (!(await btn.count())) return fail(`нет кнопки ${name}`);
        const m = await motion(p, () => btn.click(), 1400);
        if (!m.mono || m.beyond) return fail(`${name}: масштаб меняется не в одну сторону`);
        if (!(m.k1 < m.k0)) return fail(`${name}: небо не отдалилось`);
        if (m.ms < 300 || m.ms > 700) return fail(`${name}: ${m.ms} мс`);
        log.push(`${name} ${m.ms} мс`);
      }
      return pass(log.join('; '));
    },
  },
  {
    n: 360,
    title: 'UX-51: свёртка созвездия из меню у названия — строка «+N» у места щелчка, время не сдвигается, соседние звёзды на месте',
    run: async (p) => {
      await go(p, '#/~y-1100~w300~l0~s1~mmt-long', 2600);
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      const menu = p.locator('.sky .skymenu');
      let at: { x: number; y: number } | null = null;
      let group = '';
      // название созвездия ищется по сетке: правая кнопка — меню с «Свернуть созвездие «…»»
      search: for (let y = 160; y < 700; y += 36)
        for (let x = 120; x < 1300; x += 90) {
          await p.mouse.click(box.x + x, box.y + y, { button: 'right' });
          await p.waitForTimeout(120);
          const cmd = menu.locator('button', { hasText: 'Свернуть созвездие' });
          if (await cmd.count()) {
            group = txt(await cmd.innerText());
            at = { x, y };
            break search;
          }
          if (await menu.count()) await p.keyboard.press('Escape');
        }
      if (!at) return fail('названия созвездия с меню на этом окне не найдено');
      const before = await cam(p);
      // звёзды у места щелчка — не из свёрнутого: после свёртки строка щелчка на месте
      await menu.locator('button', { hasText: 'Свернуть созвездие' }).click();
      await p.waitForTimeout(900);
      const after = await cam(p);
      if (Math.abs(after.kx / before.kx - 1) > 1e-3 || Math.abs(after.x0 - before.x0) * after.kx > 1) return fail('свёртка сдвинула время');
      const hits = (await p.locator('.sky > canvas').getAttribute('data-fold-hits')) ?? '';
      const row = hits.split(';').find((h) => h.startsWith('group:'));
      if (!row) return fail(`строки свёрнутого созвездия на экране нет: ${hits}`);
      const [, , r] = row.split(':');
      const [, ry, , rh] = r.split(',').map(Number);
      const dy = Math.abs(ry + rh / 2 - at.y);
      if (dy > 24) return fail(`строка «+N» на y ${ry}, щелчок был на ${at.y}`);
      return pass(`${group}: строка «+N» в ${Math.round(dy)} px от щелчка`);
    },
  },
  {
    n: 361,
    title: 'MOB-73, решение 58: строка показа «набор» на телефоне — одна строка «набор — 18 лиц — изменить», оговорка о ссылке — в подсказке',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      const ids = ['david', 'iessey', 'ovid', 'vooz', 'ruf', 'solomon', 'salmon', 'avraam', 'isaak', 'iakov', 'iuda', 'fares', 'esrom', 'aram', 'aminadav', 'naasson', 'rovoam', 'aviya'];
      await setWork(p, ids);
      await p.reload();
      await p.waitForTimeout(1600);
      await go(p, '#/~k1', 2600);
      // этап 11 (решение 81): строка режима «набор» — строка показа, на телефоне коротко: «набор — 18 лиц — изменить»
      const bar = p.locator('.sky .showbar');
      if (!(await bar.count())) return fail('нет строки показа');
      const n = ((await p.evaluate(`JSON.parse(localStorage.getItem('toledot:work') || '[]').length`)) as number) || 0;
      const t = txt(await bar.locator('.txt').innerText());
      if (!new RegExp(`^набор — ${n} лиц[а]? — изменить$`).test(t)) return fail(`строка: «${t}»`);
      const b = (await bar.boundingBox())!;
      if (b.height > 50) return fail(`строка ${b.height} px — не одна строка`);
      const cmd = (await bar.locator('.sb-cmd', { hasText: 'изменить' }).boundingBox())!;
      if (cmd.height < 44) return fail(`команда ${cmd.height} px`);
      const title = txt((await bar.locator('.txt').getAttribute('title')) ?? '');
      if (!/не больше 12 лиц/.test(title)) return fail(`подсказка: «${title}»`);
      return /ссылк/.test(t) ? fail(`оговорка осталась в строке: «${t}»`) : pass(`${t}; ${Math.round(b.height)} px`);
    },
  },
  {
    n: 362,
    // этап 12, решение 91: стопки нет — «назад» переключает только текущую карточку, закреплённые вкладки не меняются;
    // карточка, закрытая крестиком, вкладкой не становится (тот же смысл, что у прежней проверки стопки)
    title: 'UX-74, решения 50, 91: «назад» переключает только текущую карточку — вкладки закреплённых не меняются, закрытая крестиком карточка вкладкой не становится',
    run: async (p) => {
      await go(p, '#/ruf', 2600);
      const tabs = async () => ((await p.evaluate(`JSON.parse(localStorage.getItem('toledot:tabs') || '[]').map((t) => t.id)`)) as string[]).join(' ');
      await p.locator('.folio .folio-bar .pin-card').click();
      await p.waitForTimeout(300);
      await p.locator('.folio button.person', { hasText: 'Давид' }).first().click();
      await p.waitForTimeout(1600);
      await p.locator('.folio button.person', { hasText: 'Иессей' }).first().click();
      await p.waitForTimeout(1600);
      await p.locator('.folio button[aria-label="Закрыть карточку"]').first().click();
      await p.waitForTimeout(900);
      await p.click('#find');
      await p.fill('#find', 'Моисей');
      await p.waitForTimeout(350);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1800);
      const s0 = await tabs();
      if (s0 !== 'ruf') return fail(`вкладки до «назад»: ${s0}`);
      const log = [`${hashId(p)}: ${s0}`];
      for (let i = 0; i < 3; i++) {
        await p.goBack();
        await p.waitForTimeout(1000);
        const s = await tabs();
        const shown = (await p.locator('.folio .card-tabs .card-tab').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))).join(' ');
        log.push(`${hashId(p)}: ${s}`);
        if (s !== 'ruf') return fail(`вкладки изменились: ${log.join(' | ')}`);
        if (hashId(p) && shown !== 'ruf') return fail(`на листе вкладки: ${shown} (${log.join(' | ')})`);
        if (hashId(p) && !(await p.locator(`.folio #title-${hashId(p)}`).count())) return fail(`текущая карточка — не лицо записи: ${log.join(' | ')}`);
      }
      return pass(log.join(' | '));
    },
  },
];
