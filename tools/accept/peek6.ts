/**
 * Сценарии приёмки: союзы-точки на небе (решение 76), группа peek6: номера 680–699, карточка у точки на небе.
 * Этап 11 (решение 77, STAGE11.md § 6; задача Q3): карточка у звезды — в любом показе, с блоком «Родство»; её команды —
 * «Карточка» (прежде «Информация»), «Только его род ▾», «Родство с…», в наборе — «Продолжить ветвь» / «Свернуть ветвь»
 * и «Родители»; у ромба — «Карточка союза» (прежде «Подробнее»); Enter на звезде ставит фокус на первое имя «Родства»
 * (§ 8); на телефоне карточка у звезды — нижний лист на 214 px, над небом её нет. Сценарии 680, 683, 685, 686, 688, 689,
 * 692 приведены к этому; остальные проверки — прежние.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

type Box = { x: number; y: number; width: number; height: number };
const PHONE = { width: 390, height: 844, touch: true };

/**
 * Небо «набор» в заданном состоянии раскрытия (src/ui/reveal.ts, src/ui/work.ts): набор, лица с показанными союзами,
 * раскрытые союзы; адрес hash выбирает лицо.
 */
async function setup(p: Page, o: { work: string[]; opened?: string[]; expanded?: Record<string, string>; hash: string; start?: string }) {
  const store = () =>
    p.evaluate((o) => {
      localStorage.setItem('toledot:intro', 'true');
      localStorage.setItem('toledot:start', JSON.stringify(o.start ?? 'adam'));
      localStorage.setItem('toledot:view', JSON.stringify('sky'));
      localStorage.setItem('toledot:work', JSON.stringify(o.work.map((id, i) => [id, { via: i ? 'family' : 'self', of: o.work[0] }])));
      localStorage.setItem('toledot:reveal', JSON.stringify({ opened: o.opened ?? [], expanded: o.expanded ?? {} }));
      sessionStorage.setItem('toledot:skymode', JSON.stringify('work'));
    }, o);
  await store();
  // этап 14 (решение 147, S3): показ — в адресе; адрес с окном неба («~y…») без поля показа — показ «все лица», и
  // перезагрузка такого адреса (приложение дописывает окно в адрес сразу) сбросила бы набор. Поэтому — новая загрузка
  // страницы с коротким адресом (другая строка запроса — не переход по якорю): показ берётся из sessionStorage
  const base = p.url().replace(/[?#].*$/, '');
  await p.goto(`${base}?load=${Date.now()}${o.hash}`);
  await p.waitForTimeout(2600);
}
const ADAM = { work: ['adam'], opened: ['adam'], hash: '#/adam' };
const ADAM_OPEN = { work: ['adam', 'eva', 'kain', 'avel', 'sif'], opened: ['adam'], expanded: { 'u:adam+eva': 'adam' }, hash: '#/adam' };

const canvasBox = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;
/** Звезда лица в координатах страницы — из списка неба для клавиатуры (SkyA11y, data-x/data-y). */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  const el = p.locator(`#sky-star-${id}`);
  const read = async () => {
    if (!(await el.count())) return null;
    const x = Number(await el.getAttribute('data-x'));
    const y = Number(await el.getAttribute('data-y'));
    const view = await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '');
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y, view } : null;
  };
  // список неба обновляется через 600 мс после остановки окна неба (SkyA11y): место звезды берётся, когда два чтения
  // через 900 мс совпали вместе с окном неба (этап 14: после перелёта к выбранному небо ещё сходится к своему окну)
  let q = await read();
  for (let k = 0; k < 6 && q; k++) {
    await p.waitForTimeout(900);
    const r = await read();
    if (r && r.x === q.x && r.y === q.y && r.view === q.view) break;
    q = r;
  }
  if (!q) return null;
  const b = await canvasBox(p);
  return { x: b.x + q.x, y: b.y + q.y };
}
/** Точка союза в координатах страницы: середина поля попадания (src/render/sky.ts, dataset.plates). */
async function dotAt(p: Page, uid: string): Promise<{ x: number; y: number } | null> {
  const d = await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.plates ?? '');
  const q = d.split(';').find((s) => s.startsWith(`${uid}:`));
  if (!q) return null;
  const [x, y, w, h] = q.split(':').pop()!.split(',').map(Number);
  const b = await canvasBox(p);
  return { x: b.x + x + w / 2, y: b.y + y + h / 2 };
}
const card = (p: Page) => p.locator('.sky .dotcard[data-placed]');
const cardBox = async (p: Page): Promise<Box | null> => ((await card(p).count()) ? card(p).boundingBox() : null);
const flat = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : '')).replace(/\s+/g, ' ').trim();
const stored = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string, unknown][]).map((r) => r[0]).sort());

export const peek6: Scenario[] = [
  {
    n: 680,
    // этап 20 (решение 194): на широком экране карточки у звезды нет — её содержание в карточке справа: образ — в шапке,
    // «Родство» — под шапкой, команды — строкой команд неба; поле команды по-прежнему не ниже 32 px
    title: 'Решения 74, 77, 194: «С Адама» — щелчок по звезде Адама: выбран Адам, справа — его карточка с образом, именем, годами, «Родством» («Ева», «Каин»…) и командами «К звезде», «Ближайшая родня», «Предки и потомки ▾», «Скрыть ветвь»; на небе карточки нет',
    run: async (p) => {
      await setup(p, { ...ADAM, hash: '#/' });
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(1200);
      if (!/#\/adam/.test(p.url())) return fail(`выбрано не лицо Адама: ${p.url()}`);
      if (!(await p.locator('.folio #title-adam').count())) return fail('справа нет карточки Адама');
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у звезды');
      if (!(await p.locator('.folio .mast-av .av').count())) return fail('нет образа');
      const mast = flat(await p.locator('.folio .mast').innerText());
      if (!/4174–3244 гг\. до Р\. Х\./.test(mast)) return fail(`в шапке: «${mast.slice(0, 160)}»`);
      const kin = p.locator('.folio .kin-col');
      if ((await kin.getAttribute('aria-label')) !== 'Родство: Адам') return fail(`«Родство»: ${await kin.getAttribute('aria-label')}`);
      const kt = flat(await kin.innerText());
      if (!/Ева/.test(kt)) return fail(`в «Родстве» нет Евы: «${kt}»`);
      const cmds = (await p.locator('.folio .actions.sky-cmds > button, .folio .actions.sky-cmds .menu > button').allInnerTexts()).map((t) => flat(t));
      for (const w of ['К звезде', 'Ближайшая родня', 'Предки и потомки ▾']) if (!cmds.includes(w)) return fail(`команды: ${cmds.join(' | ')}`);
      // этап 21 (решение 197): «Скрыть ветвь» и «Продолжить ветвь» строки команд неба заменил блок «Шаги карты»: у Адама
      // начала «С Адама» — «Жена и дети»
      const steps = (await p.locator('.folio .map-cmds > button').allInnerTexts()).map((t) => flat(t));
      if (!steps.includes('Жена и дети')) return fail(`шаги карты: ${steps.join(' | ')}`);
      const cb = await p.locator('.folio .actions.sky-cmds > button').first().boundingBox();
      if (!cb || cb.height < 31.5) return fail(`поле команды ${cb?.height} px`);
      return pass(cmds.join(' | '));
    },
  },
  {
    n: 681,
    // этап 20 (решение 194, просьба владельца): на широком экране карточки на небе нет — небо не закрыто ничем; прежде
    // (решение 76) здесь проверялось, что карточка у точки следует за небом
    title: 'Решение 194: щелчок по звезде Адама — карточка справа, на небе карточки нет; протяжка, колесо и звезда за краем меняют только небо: справа та же карточка Адама',
    run: async (p) => {
      await setup(p, ADAM);
      const a0 = await starAt(p, 'adam');
      if (!a0) return fail('нет звезды Адама');
      await p.mouse.click(a0.x, a0.y);
      await p.waitForTimeout(900);
      const same = async (when: string) => {
        if (await p.locator('.sky .dotcard').count()) return `${when}: на небе карточка`;
        const h = flat((await p.locator('.folio .mast h2').first().textContent().catch(() => '')) ?? '');
        return h === 'Адам' ? null : `${when}: справа «${h}»`;
      };
      const w0 = await same('после щелчка');
      if (w0) return fail(w0);
      const from = { x: a0.x + 240, y: a0.y - 150 };
      await p.mouse.move(from.x, from.y);
      await p.mouse.down();
      for (let k = 1; k <= 6; k++) await p.mouse.move(from.x + 15 * k, from.y + (50 / 6) * k);
      await p.waitForTimeout(80);
      await p.mouse.up();
      await p.waitForTimeout(1400);
      const a1 = await starAt(p, 'adam');
      if (!a1 || Math.abs(a1.x - a0.x) < 40) return fail('небо не сдвинулось');
      const w1 = await same('после протяжки');
      if (w1) return fail(w1);
      await p.mouse.move(a1.x + 30, a1.y + 3);
      await p.mouse.wheel(0, -200);
      await p.waitForTimeout(1500);
      const w2 = await same('после колеса');
      if (w2) return fail(w2);
      const b = await canvasBox(p);
      const go = { x: a1.x + 300, y: a1.y - 120 };
      await p.mouse.move(go.x, go.y);
      await p.mouse.down();
      for (let k = 1; k <= 8; k++) await p.mouse.move(go.x - ((a1.x - b.x + 100) / 8) * k, go.y);
      await p.waitForTimeout(80);
      await p.mouse.up();
      await p.waitForTimeout(900);
      const w3 = await same('звезда за краем');
      return w3 ? fail(w3) : pass();
    },
  },
  {
    n: 682,
    // этап 20 (решение 194): прежде здесь закрывали карточку у точки; теперь карточка союза открывается справа, на месте
    // карточки лица, и её закрывают так же: Escape, щелчок по пустому небу, «×» — справа снова карточка лица
    title: 'Решение 194: карточку союза справа закрывают Escape (фокус — на холсте), щелчок по пустому небу и «×» — справа снова карточка Адама, выбор лица остаётся',
    run: async (p) => {
      await setup(p, ADAM);
      const d = await dotAt(p, 'u:adam+eva');
      const a = await starAt(p, 'adam');
      if (!d || !a) return fail('нет точки союза или звезды Адама');
      const open = async () => {
        await p.mouse.click(d.x, d.y);
        await p.waitForTimeout(700);
        return (await p.locator('.folio[data-union="u:adam+eva"]').count()) > 0 && !(await p.locator('.sky .dotcard').count());
      };
      const back = async () => !(await p.locator('.folio[data-union]').count()) && /#\/adam/.test(p.url()) && flat((await p.locator('.folio .mast h2').first().textContent().catch(() => '')) ?? '') === 'Адам';
      if (!(await open())) return fail('карточка союза справа не открылась');
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      if (!(await back())) return fail('Escape не вернул карточку Адама');
      if (!(await p.evaluate(() => document.activeElement?.matches('.sky canvas')))) return fail('после Escape фокус не на холсте');
      if (!(await open())) return fail('карточка союза не открылась снова');
      await p.mouse.click(a.x + 260, a.y - 170);
      await p.waitForTimeout(600);
      if (!(await back())) return fail('щелчок по пустому небу не вернул карточку Адама (или снял выбор)');
      if (!(await open())) return fail('карточка союза не открылась в третий раз');
      await p.locator('.folio[data-union] .folio-bar button.close').click();
      await p.waitForTimeout(400);
      return (await back()) ? pass() : fail('«×» не вернул карточку Адама');
    },
  },
  {
    n: 683,
    // этап 20 (решение 194): карточка союза — справа, сразу подробная («Подробнее о союзе» больше не нужна); команда
    // раскрытия — словами прежней карточки у ромба
    title: 'Решения 76, 77, 194: щелчок по точке союза Адама и Евы — справа карточка союза: «Адам и Ева», «Ева — жена Адама», стих, «Показать детей союза (3)»; на небе карточки нет; набор не меняется, подсказки у открытой точки нет',
    run: async (p) => {
      await setup(p, ADAM);
      const d = await dotAt(p, 'u:adam+eva');
      if (!d) return fail('нет точки союза');
      await p.mouse.move(d.x - 20, d.y - 30);
      await p.mouse.move(d.x, d.y, { steps: 4 });
      await p.mouse.click(d.x, d.y);
      await p.waitForTimeout(900);
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у точки');
      const col = p.locator('aside.folio[data-union="u:adam+eva"]');
      if (!(await col.count())) return fail('справа нет карточки союза');
      const text = flat(await col.innerText());
      for (const w of ['Адам и Ева', 'Ева — жена Адама', 'Быт 2:22', 'Показать детей союза (3)']) if (!text.includes(w)) return fail(`в карточке нет «${w}»: ${text.slice(0, 200)}`);
      if ((await stored(p)).join(' ') !== 'adam') return fail(`щелчок по точке изменил набор: ${(await stored(p)).join(' ')}`);
      await p.mouse.move(d.x + 1, d.y);
      await p.waitForTimeout(500);
      if (await p.locator('.sky .tip[data-shown]').count()) return fail('подсказка у точки с открытой карточкой');
      return pass(text.slice(0, 120));
    },
  },
  {
    n: 684,
    // этап 20 (решение 194): одна карточка за раз — теперь в колонке справа; на небе карточек нет
    title: 'Решение 194: одна карточка за раз — щелчок по звезде, затем по точке союза, затем снова по звезде: справа всякий раз карточка последнего щелчка, на небе карточки нет',
    run: async (p) => {
      await setup(p, ADAM);
      const a = await starAt(p, 'adam');
      const d = await dotAt(p, 'u:adam+eva');
      if (!a || !d) return fail('нет звезды или точки союза');
      const seq: string[] = [];
      for (const [at, want] of [
        [a, 'adam'],
        [d, 'u:adam+eva'],
        [a, 'adam'],
      ] as const) {
        await p.mouse.click(at.x, at.y);
        await p.waitForTimeout(700);
        if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка');
        const uid = await p.locator('aside.folio[data-union]').getAttribute('data-union').catch(() => null);
        const id = uid ?? (/#\/([^~?]+)/.exec(decodeURIComponent(p.url()))?.[1] ?? null);
        if (id !== want) return fail(`после щелчка справа ${id}, ждали ${want}`);
        seq.push(id);
      }
      return pass(seq.join(' → '));
    },
  },
  {
    n: 685,
    // этап 20 (решение 194): карточки у звезды нет — Enter открывает карточку справа, фокус — на первом имени «Родства»;
    // сворачивать подробную карточку ради полного «Родства» больше не нужно (легенды семьи нет); Escape с имени снимает
    // выбор и возвращает фокус на холст
    title: 'Решения 83, 194, клавиатура: стрелкой — к Адаму, Enter — карточка справа с фокусом на первом имени «Родства» (Ева), Tab — к следующей строке (Каин); Escape — фокус на холсте, кольцо на Адаме',
    run: async (p) => {
      await setup(p, ADAM);
      await p.locator('.sky canvas').focus();
      await p.waitForTimeout(300);
      let id = '';
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
        id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
        if (id === 'sky-star-adam') break;
        await p.keyboard.press(key);
        await p.waitForTimeout(250);
      }
      if (id !== 'sky-star-adam') return fail(`кольцо не на Адаме: ${id || 'нет'}`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const f1 = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return { t: ((a?.querySelector('.nm') as HTMLElement | null) ?? a)?.innerText?.trim() ?? '', kin: a?.closest('.kin-col')?.getAttribute('aria-label') ?? '' };
      });
      if (f1.t !== 'Ева' || f1.kin !== 'Родство: Адам') return fail(`фокус после Enter: «${f1.t}» в «${f1.kin}»`);
      await p.keyboard.press('Tab');
      const f2 = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return ((a?.querySelector('.nm') as HTMLElement | null) ?? a)?.innerText?.trim() ?? '';
      });
      if (f2 !== 'Каин') return fail(`Tab: «${f2}»`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      if (!(await p.evaluate(() => document.activeElement?.matches('.sky canvas')))) return fail('фокус не вернулся на холст');
      const ring = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
      return ring === 'sky-star-adam' ? pass() : fail(`кольцо после Escape: ${ring || 'нет'}`);
    },
  },
  {
    n: 686,
    // этап 20 (решение 194): команды «Вся карточка» у звезды больше нет — свёрнутую колонку разворачивает повторный щелчок
    // по выбранной звезде (первый щелчок выбора колонку не разворачивает: её свернул читатель)
    title: 'Решения 76, 77, 194: колонка карточки свёрнута в корешок — щелчок по звезде выбранного Адама разворачивает её, справа его карточка; на небе карточки нет',
    run: async (p) => {
      await setup(p, ADAM);
      const fold = p.locator('.folio button', { hasText: 'Свернуть карточку' });
      if (!(await fold.count())) return fail('нет «Свернуть карточку»');
      await fold.first().click();
      await p.waitForTimeout(800);
      if (!(await p.locator('.folio.spine').count())) return fail('карточка не свернулась в корешок');
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(1000);
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у звезды');
      if (await p.locator('.folio.spine').count()) return fail('карточка осталась корешком');
      return (await p.locator('.folio #title-adam').count()) ? pass() : fail('справа не карточка Адама');
    },
  },
  {
    n: 687,
    // этап 20 (решение 194): «Показать родителей» — в строке команд неба карточки справа; этап 21 (решение 197) — шаг
    // карты «Родители»
    title: 'Решения 76, 194, 197: «С Иисуса Христа» — щелчок по звезде Иисуса Христа, в карточке справа шаг «Родители»: Иосиф и Мария на небе, команда — «Скрыть родителей»; «Скрыть родителей» убирает их',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const j = await starAt(p, 'iisus');
      if (!j) return fail('нет звезды Иисуса Христа');
      await p.mouse.click(j.x, j.y);
      await p.waitForTimeout(900);
      // этап 21 (решения 197, 198): «Показать родителей» и «Скрыть родителей» — шаги карты «Родители» и «Свернуть предков»
      const cmds = async () => (await p.locator('.folio .map-cmds > button').allInnerTexts()).map((t) => t.trim());
      if (!(await cmds()).includes('Родители')) return fail(`шаги карты: ${(await cmds()).join(' | ')}`);
      await p.locator('.folio .map-cmds > button', { hasText: 'Родители' }).click();
      await p.waitForTimeout(1300);
      const ids = await stored(p);
      if (!ids.includes('iosif-muzh-marii') || !ids.includes('mariya')) return fail(`набор: ${ids.join(' ')}`);
      if (!(await cmds()).includes('Свернуть предков')) return fail(`шаги карты после: ${(await cmds()).join(' | ')}`);
      await p.locator('.folio .map-cmds > button', { hasText: 'Свернуть предков' }).click();
      await p.waitForTimeout(1000);
      const back = await stored(p);
      return back.join(' ') === 'iisus' ? pass() : fail(`после «Свернуть предков»: ${back.join(' ')}`);
    },
  },
  {
    n: 688,
    title: 'Решения 76, 77, 155, телефон 390 × 844: касание Адама — нижний лист высотой краткой карточки и есть карточка у звезды (образ, имя, годы, «Родство»), второй карточки над небом нет, звезда не под листом; цели 44 px; «Карточка ▴» поднимает лист',
    view: PHONE,
    run: async (p) => {
      await setup(p, { ...ADAM, hash: '#/' });
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.touchscreen.tap(a.x, a.y);
      await p.waitForTimeout(1200);
      if (await cardBox(p)) return fail('над небом — карточка у звезды, а должен быть лист');
      const sheet = await p.locator('.folio').boundingBox();
      if (!sheet) return fail('нет листа карточки');
      // этап 14, решение 155: шапка листа — высотой краткой карточки (--sheet-peek на .app ставит лист), прежде 214 px
      const want = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.app')!).getPropertyValue('--sheet-peek')) || 214);
      if (Math.abs(sheet.height - want) > 2) return fail(`лист ${Math.round(sheet.height)} px, карточка ${Math.round(want)} px`);
      const dc = p.locator('.folio .sheet-dot .dotcard');
      if (!(await dc.count())) return fail('в листе нет карточки у звезды');
      const text = flat(await dc.innerText());
      if (!/^Адам/.test(text) || !/4174–3244 гг\. до Р\. Х\./.test(text) || !(await dc.locator('.av').count())) return fail(`лист: «${text.slice(0, 120)}»`);
      const a1 = (await starAt(p, 'adam'))!;
      if (a1.y > sheet.y - 6) return fail('звезда под листом');
      // цели — команды листа и «×» (имена «Родства» — ссылки в тексте: поле касания у них — псевдоэлементом, phone.css)
      const hs = await p.locator('.folio .sheet-dot').locator('.dc-cmds button, .close').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect().height));
      if (hs.some((h) => h < 43.5)) return fail(`низкие цели: ${hs.map(Math.round).join(', ')}`);
      await p.locator('.folio .sheet-dot .dc-cmds button', { hasText: 'Вся карточка' }).first().tap();
      await p.waitForTimeout(1000);
      const sheet2 = (await p.locator('.folio').boundingBox())!;
      return sheet2.height > sheet.height + 100 ? pass(`лист ${Math.round(sheet.height)} → ${Math.round(sheet2.height)} px`) : fail(`лист не поднялся: ${Math.round(sheet.height)} → ${Math.round(sheet2.height)}`);
    },
  },
  {
    n: 689,
    title: 'Решения 76, 77, 194: небо «все лица» — щелчок по звезде Давида выбирает его, справа его карточка с «Родством» (в любом показе)',
    run: async (p) => {
      await p.evaluate(() => sessionStorage.setItem('toledot:skymode', JSON.stringify('all')));
      await p.goto(p.url().replace(/#.*$/, '') + '#/david');
      await p.reload();
      await p.waitForTimeout(2800);
      if ((await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.mode)) !== 'all') return fail('небо не «все лица»');
      const d = await starAt(p, 'david');
      if (!d) return fail('нет звезды Давида');
      await p.mouse.click(d.x, d.y);
      await p.waitForTimeout(900);
      if (!/#\/david/.test(p.url())) return fail(`выбор: ${p.url()}`);
      // этап 20 (решение 194): на широком экране «Родство» — в карточке справа, на небе карточки нет
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у звезды');
      return (await p.locator('.folio .kin-col .dc-kin').count()) ? pass() : fail('во «всех лицах» в карточке справа нет «Родства»');
    },
  },
  {
    n: 690,
    // этап 20 (решение 194): места карточки на небе больше нет — проверяется, что у правого края неба щелчок открывает
    // карточку справа, на небе ничего не встаёт, а камера не сдвигается
    title: 'Решение 194: звезда у правого края неба — щелчок открывает карточку справа, на небе карточки нет, звезда остаётся на месте экрана',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      const a0 = await starAt(p, 'iisus');
      if (!a0) return fail('нет звезды Иисуса Христа');
      const view = (await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '')).split(' ').map(Number);
      const b = await canvasBox(p);
      const want = b.x + view[2] - 40;
      const from = { x: a0.x - 200, y: a0.y + 120 };
      await p.mouse.move(from.x, from.y);
      await p.mouse.down();
      for (let k = 1; k <= 8; k++) await p.mouse.move(from.x + ((want - a0.x) / 8) * k, from.y);
      await p.waitForTimeout(80);
      await p.mouse.up();
      await p.waitForTimeout(1400);
      const a = await starAt(p, 'iisus');
      if (!a || a.x < b.x + view[2] - 90) return fail(`звезда не у правого края: ${a?.x} при крае ${b.x + view[2]}`);
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(1200);
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у звезды');
      if (!(await p.locator('.folio .mast').count())) return fail('справа нет карточки');
      const a2 = await starAt(p, 'iisus');
      return a2 && Math.abs(a2.x - a.x) <= 2 && Math.abs(a2.y - a.y) <= 2 ? pass() : fail(`звезда сдвинулась: ${Math.round(a.x)},${Math.round(a.y)} → ${a2 ? `${Math.round(a2.x)},${Math.round(a2.y)}` : 'нет'}`);
    },
  },
  {
    n: 691,
    // этап 20 (решение 194): карточки у точки нет — подсказки звёзд семьи ничем на небе не закрыты
    title: 'Решение 194: выбран Адам, карточка справа — подсказки звёзд его семьи на небе появляются, на небе карточки нет',
    run: async (p) => {
      await setup(p, ADAM_OPEN);
      const a = await starAt(p, 'adam');
      if (!a) return fail('нет звезды Адама');
      await p.mouse.click(a.x, a.y);
      await p.waitForTimeout(900);
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у звезды');
      const checked: string[] = [];
      for (const id of ['eva', 'kain', 'avel', 'sif']) {
        const s = await starAt(p, id);
        if (!s) continue;
        await p.mouse.move(s.x - 30, s.y - 30);
        await p.mouse.move(s.x, s.y, { steps: 3 });
        await p.waitForTimeout(700);
        if (await p.locator('.sky .tip[data-shown]').count()) checked.push(id);
      }
      return checked.length ? pass(checked.join(', ')) : fail('ни одной подсказки звёзд рядом');
    },
  },
  {
    n: 692,
    title: 'Решения 76, 77, 194, клавиатура: Enter на звезде Иисуса Христа — карточка справа, фокус на первом имени «Родства» (Иосиф); Tab — к команде «Показать родителей», Enter раскрывает родителей, фокус остаётся в карточке на «Скрыть родителей»; живая область объявляет раскрытие',
    run: async (p) => {
      await setup(p, { work: ['iisus'], opened: ['iisus'], hash: '#/iisus', start: 'jesus' });
      await p.locator('.sky canvas').focus();
      await p.waitForTimeout(300);
      let id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
      if (id !== 'sky-star-iisus') {
        await p.keyboard.press('ArrowLeft');
        await p.waitForTimeout(250);
        id = (await p.locator('.sky canvas').getAttribute('aria-activedescendant')) ?? '';
      }
      if (id !== 'sky-star-iisus') return fail(`кольцо: ${id || 'нет'}`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      // этап 20 (решение 194): карточка — справа; «Показать родителей» — в строке команд неба под «Родством»
      const t = () => p.evaluate(() => (document.activeElement?.closest('.dotcard, .folio') ? (((document.activeElement as HTMLElement).querySelector('.nm') as HTMLElement | null) ?? (document.activeElement as HTMLElement)).innerText.trim() : `вне карточки: ${document.activeElement?.tagName}`));
      if ((await t()) !== 'Иосиф') return fail(`фокус после Enter: «${await t()}»`);
      // «Родство» — строка за строкой, затем команды карточки; «Родители» — не дальше восьми Tab
      // этап 21 (решения 197, 209): «Показать родителей» — шаг карты «Родители» в блоке «Шаги карты» после команд неба;
      // после шага фокус не падает в body — на «Свернуть предков» (команда, вставшая на место «Родителей») или первой команде
      for (let i = 0; i < 12 && (await t()) !== 'Родители'; i++) await p.keyboard.press('Tab');
      if ((await t()) !== 'Родители') return fail(`Tab: «${await t()}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1300);
      const ids = await stored(p);
      if (!ids.includes('iosif-muzh-marii') || !ids.includes('mariya')) return fail(`набор: ${ids.join(' ')}`);
      const f = await t();
      if (!f || !(await p.evaluate(() => !!document.activeElement?.closest('.map-cmds')))) return fail(`фокус после команды: «${f}»`);
      const said = await p.evaluate(() => [...document.querySelectorAll('.sky [aria-live]')].map((e) => (e.textContent ?? '').trim()).join(' | '));
      return /раскрыты родители/.test(said.replace(/\u00a0/g, ' ')) ? pass(`фокус: «${f}»`) : fail(`живая область: «${said}»`);
    },
  },
];
