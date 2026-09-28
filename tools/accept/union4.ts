/** Сценарии приёмки: раскрытие родословия и союзы (решения 67–72), группа union4: номера 520–539, карточка союза в листе. */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

/**
 * Открыть адрес с чистого листа: начало «Всё небо» уже выбрано (решение 68; выбор начала при первом посещении — не
 * предмет этих сценариев), страница перезагружается, чтобы адрес прочитался как при входе.
 */
const open = async (p: Page, hash: string, ms = 2400) => {
  await p.evaluate(() => {
    try {
      localStorage.setItem('toledot:start', JSON.stringify('all'));
    } catch {
      /* без хранилища — как есть */
    }
  });
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.reload();
  await p.waitForTimeout(ms);
};
const unionShown = (p: Page) => p.locator('.folio[data-union]').getAttribute('data-union');
/** Текст без неразрывных пробелов типографики (typo): «от этого» → «от этого». */
const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
const title = async (p: Page) => flat(await p.locator('.folio h2').first().innerText());
const active = (p: Page) =>
  p.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? { id: a.id, union: a.dataset.union ?? '', text: (a.innerText ?? '').trim() } : null;
  });
const skyMode = (p: Page) => p.locator('.sky > canvas').getAttribute('data-mode').then((v) => v ?? '');

export const union4: Scenario[] = [
  {
    n: 520,
    title: 'Решение 71: § 10 Авраама — «союз» у сына от Агари открывает карточку союза «Авраам и Агарь» вместо карточки лица; лицо остаётся выбранным, стопка не меняется; «×» возвращает карточку Авраама',
    run: async (p) => {
      await open(p, '#/sarra');
      await open(p, '#/avraam');
      const stack0 = (await p.locator('.folio-bar .stack-sum').count()) ? await p.locator('.folio-bar .stack-sum').innerText() : '';
      const link = p.locator('.folio #sec-10 [data-union="u:avraam+agar"]');
      if (!(await link.count())) return fail('в § 10 Авраама нет ссылки на союз с Агарью');
      const label = await link.getAttribute('aria-label');
      if (label !== 'Карточка союза Авраама и Агари') return fail(`имя ссылки: ${label}`);
      await link.click();
      await p.waitForTimeout(500);
      if ((await unionShown(p)) !== 'u:avraam+agar') return fail(`карточка союза не открылась: ${await unionShown(p)}`);
      if ((await title(p)) !== 'Авраам и Агарь') return fail(`заголовок: ${await title(p)}`);
      const dts = (await p.locator('.folio .passport dt').allInnerTexts()).map(flat);
      if (dts.join('|') !== 'Союз|Годы|Стихи') return fail(`паспорт: ${dts.join(', ')}`);
      const heads = (await p.locator('.folio .union-body h4').allInnerTexts()).map(flat);
      if (heads.join('|') !== 'Супруги|Дети от этого союза|Происхождение') return fail(`разделы: ${heads.join(', ')}`);
      if (hashId(p) !== 'avraam') return fail(`выбранное лицо сменилось: ${hashId(p)}`);
      const stack1 = (await p.locator('.folio-bar .stack-sum').count()) ? await p.locator('.folio-bar .stack-sum').innerText() : '';
      if (stack1 !== stack0 || !/Сарра/.test(stack1)) return fail(`стопка: «${stack0}» → «${stack1}»`);
      await p.locator('.folio-bar button[aria-label="Закрыть карточку союза"]').click();
      await p.waitForTimeout(500);
      if (await p.locator('.folio[data-union]').count()) return fail('после «×» карточка союза осталась');
      if (!(await p.locator('.folio #title-avraam').count())) return fail('после «×» нет карточки Авраама');
      return pass(`${dts.join(', ')}; ${heads.join(', ')}; стопка «${stack1}»`);
    },
  },
  {
    n: 521,
    title: 'Решение 71: «Раскрыть на небе» в карточке союза — небо «набор» с супругами и детьми союза; «Свернуть на небе» убирает раскрытых через союз',
    run: async (p) => {
      await open(p, '#/avraam');
      await p.locator('.folio #sec-10 [data-union="u:avraam+agar"]').click();
      await p.waitForTimeout(400);
      const btn = p.locator('.folio .union-reveal');
      if ((await btn.innerText()).trim() !== 'Раскрыть на небе') return fail(`команда: ${await btn.innerText()}`);
      await btn.click();
      await p.waitForTimeout(1200);
      if ((await skyMode(p)) !== 'work') return fail(`небо не в «наборе»: ${await skyMode(p)}`);
      if ((await btn.innerText()).trim() !== 'Свернуть на небе') return fail(`после раскрытия команда: ${await btn.innerText()}`);
      const on = (await p.locator('.folio .union-onsky').innerText()).replace(/\s+/g, ' ');
      if (!/на небе 3 из 3 лиц союза/.test(on)) return fail(`строка состояния: ${on}`);
      const said = await p.locator('.folio .union-actions [role="status"]').innerText();
      if (!/Раскрыто/.test(said)) return fail(`диктору: «${said}»`);
      await btn.click();
      await p.waitForTimeout(800);
      const off = (await p.locator('.folio .union-onsky').innerText()).replace(/\s+/g, ' ');
      if ((await btn.innerText()).trim() !== 'Раскрыть на небе' || !/на небе 1 из 3/.test(off)) return fail(`после свёртки: ${await btn.innerText()}; ${off}`);
      return pass(`${on}; после свёртки — ${off}`);
    },
  },
  {
    n: 522,
    title: 'Решение 67: союз Сифа — мать Еноса не названа: заголовок «Сиф и его жена», строкой ниже «Имя жены в Писании не названо» (решение 75); ничего не выдумано',
    run: async (p) => {
      await open(p, '#/sif');
      const link = p.locator('.folio #sec-10 [data-union="u:sif+"]');
      if (!(await link.count())) return fail('в § 10 Сифа нет ссылки на союз');
      await link.click();
      await p.waitForTimeout(400);
      const t = await title(p);
      const dis = flat(await p.locator('.folio .mast .dis').innerText());
      if (t !== 'Сиф и его жена' || dis !== 'Имя жены в Писании не названо') return fail(`«${t}» / «${dis}»`);
      const body = await p.locator('.folio').innerText();
      if (/Сиф и мать|реконструкц|образ матери/i.test(body)) return fail('в карточке союза есть выдуманное место');
      if (!/Енос/.test(body)) return fail('нет Еноса среди детей');
      return pass(`${t} — ${dis}`);
    },
  },
  {
    n: 523,
    title: 'Решение 71, клавиатура: Enter на «союз» в § 10 — фокус на заголовке карточки союза; Escape — карточка лица на прежнем месте, фокус на той же ссылке «союз»',
    run: async (p) => {
      await open(p, '#/avraam');
      const link = p.locator('.folio #sec-10 [data-union="u:avraam+khettura"]');
      await link.focus();
      const top0 = await p.locator('.folio').evaluate((el) => el.scrollTop);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      const a1 = await active(p);
      if (a1?.id !== 'union-title') return fail(`фокус после Enter: ${JSON.stringify(a1)}`);
      if ((await title(p)) !== 'Авраам и Хеттура') return fail(`заголовок: ${await title(p)}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      if (await p.locator('.folio[data-union]').count()) return fail('Escape не закрыл карточку союза');
      if (!(await p.locator('.folio #title-avraam').count())) return fail('Escape снял выбор лица, а не карточку союза');
      const a2 = await active(p);
      if (a2?.union !== 'u:avraam+khettura') return fail(`фокус после Escape: ${JSON.stringify(a2)}`);
      const top1 = await p.locator('.folio').evaluate((el) => el.scrollTop);
      if (Math.abs(top1 - top0) > 40) return fail(`место листа: ${top0} → ${top1}`);
      return pass(`фокус: заголовок союза, затем «${a2.text}»; прокрутка ${top0} → ${top1}`);
    },
  },
  {
    n: 524,
    title: 'Решение 71: в карточке союза — другие союзы супруга (Сарра) ведут к их карточкам, ребёнок (Исаак) — к карточке лица',
    run: async (p) => {
      await open(p, '#/avraam');
      await p.locator('.folio #sec-10 [data-union="u:avraam+agar"]').click();
      await p.waitForTimeout(400);
      const other = p.locator('.folio .union-body [data-union="u:avraam+sarra"]');
      if (!(await other.count())) return fail('нет ссылки на союз Авраама и Сарры среди «других союзов»');
      await other.click();
      await p.waitForTimeout(400);
      if ((await title(p)) !== 'Авраам и Сарра') return fail(`заголовок: ${await title(p)}`);
      if (hashId(p) !== 'avraam') return fail(`выбранное лицо сменилось: ${hashId(p)}`);
      const kid = p.locator('.folio .union-body button.person[data-id="isaak"]');
      if (!(await kid.count())) return fail('нет Исаака среди детей союза');
      await kid.click();
      await p.waitForTimeout(1600);
      if (await p.locator('.folio[data-union]').count()) return fail('карточка союза осталась после перехода к ребёнку');
      if (hashId(p) !== 'isaak') return fail(`после щелчка по Исааку выбран: ${hashId(p)}`);
      return pass('Авраам и Агарь → Авраам и Сарра → Исаак');
    },
  },
  {
    n: 525,
    title: 'Решение 71, телефон: карточка союза — в нижнем листе; в шапке листа — «Авраам и Агарь», «×» возвращает карточку Авраама',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, '#/avraam', 2800);
      await p.locator('.folio .bar-toggle').click();
      await p.waitForTimeout(500);
      const link = p.locator('.folio #sec-10 [data-union="u:avraam+agar"]');
      await link.scrollIntoViewIfNeeded();
      await link.tap();
      await p.waitForTimeout(600);
      const bar = flat(await p.locator('.folio .sheet-bar .bar-name').innerText());
      if (bar !== 'Авраам и Агарь') return fail(`шапка листа: ${bar}`);
      const close = p.locator('.folio .sheet-bar button[aria-label="Закрыть карточку союза"]');
      if (!(await close.count())) return fail('в шапке листа нет «×» карточки союза');
      const box = await close.boundingBox();
      if (!box || box.width < 44 || box.height < 44) return fail(`«×» меньше 44 px: ${JSON.stringify(box)}`);
      await close.tap();
      await p.waitForTimeout(500);
      const bar2 = flat(await p.locator('.folio .sheet-bar .bar-name').innerText());
      if (bar2 !== 'Авраам') return fail(`после «×»: ${bar2}`);
      return pass(`${bar} → ${bar2}`);
    },
  },
  {
    n: 526,
    title: 'Решение 71, адрес: «#/avraam~uavraam.agar» открывает карточку союза при входе; открытый союз пишется в адрес, «назад» возвращает карточку Авраама',
    run: async (p) => {
      await open(p, '#/avraam~uavraam.agar', 2800);
      if ((await unionShown(p)) !== 'u:avraam+agar') return fail(`при входе: ${await unionShown(p)}`);
      if (hashId(p) !== 'avraam') return fail(`лицо: ${hashId(p)}`);
      await p.locator('.folio-bar button[aria-label="Закрыть карточку союза"]').click();
      await p.waitForTimeout(900);
      if (/~u/.test(p.url())) return fail(`после «×» союз остался в адресе: ${p.url()}`);
      await p.locator('.folio #sec-10 [data-union="u:avraam+khettura"]').click();
      await p.waitForTimeout(900);
      if (!/~uavraam\.khettura(~|$)/.test(p.url())) return fail(`союз не записан в адрес: ${p.url()}`);
      await p.goBack();
      await p.waitForTimeout(900);
      if (await p.locator('.folio[data-union]').count()) return fail(`«назад» не закрыл карточку союза: ${p.url()}`);
      if (!(await p.locator('.folio #title-avraam').count())) return fail('после «назад» нет карточки Авраама');
      return pass(new URL(p.url()).hash);
    },
  },
];
