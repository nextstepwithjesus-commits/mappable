/**
 * Сценарии приёмки: что перешло из древа на атлас, группа tree5 — номера 600–629.
 *
 * Прежде (решение 73, задача N1) здесь проверялось древо карточек: карточки лиц и союзов, связи SVG, камера древа,
 * миникарта, клавиши древа. Этап 11 (решение 77, STAGE11.md § 5 «Что из древа переходит на атлас»; задача Q3) древо
 * убрал; его содержание перешло в карточку у звезды и карточку у ромба союза на небе. Сценарии 600–607 проверяют это на
 * небе «набор»: силуэт в карточке, «Раскрыть детей (N)» и «Свернуть детей», «Продолжить ветвь», «Родители», неназванная
 * жена (решение 75), «другие сыновья и дочери» (Быт 5:4, 5:7), звезда Иисуса Христа и «Иосиф — законный отец»,
 * «Карточка союза» справа, клавиатура карточки у звезды.
 */
import { fail, hashId, pass, type Scenario } from './kit.ts';
import { ADAM, cardOf, clickDot, clickStar, dots, flat, inView, open, self, state } from './unify11.ts';

const fam = (of: string) => ({ via: 'family', of });
/** Адам → союз с Евой раскрыт: Ева, Каин, Авель, Сиф. */
const ADAM_OPEN = {
  work: [self('adam'), ['eva', fam('adam')], ['kain', fam('adam')], ['avel', fam('adam')], ['sif', fam('adam')]],
  reveal: { opened: ['adam'], expanded: { 'u:adam+eva': 'adam' } },
};
/** «С Иисуса Христа»: Иисус Христос и союз Иосифа и Марии. */
const JESUS = { work: [self('iisus')], reveal: { opened: ['iisus'], expanded: {} } };

export const tree5: Scenario[] = [
  // этап 20 (решение 194, просьба владельца): на широком экране карточек на небе нет — карточка лица, союза и связи
  // открывается в колонке справа; сценарии 600–604 проверяют то же содержание там: силуэт (решение 74) — в шапке карточки,
  // «Родство» — под шапкой, раскрытие союза — командой карточки союза словами прежней карточки у ромба, «Продолжить ветвь»
  // и «Показать родителей» — в строке команд неба. Команд «Вся карточка» и «Подробнее о союзе» больше нет: карточка и есть
  // колонка справа
  {
    n: 600,
    title: 'Решения 74, 77, 194: «С Адама» — щелчок по звезде Адама: карточка справа с образом-силуэтом (без портрета), именем и годами, на небе карточки нет; щелчок по ромбу «Адам и Ева» — карточка союза справа: «Ева — жена Адама», дети, «Показать детей союза (3)»',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickStar(p, 'adam'))) return fail('нет звезды Адама');
      const c = await cardOf(p);
      if (!c || c.kind !== 'person' || c.name !== 'Адам' || !c.col) return fail(`карточка: ${c ? `${c.kind} «${c.name}»${c.col ? '' : ' на небе'}` : 'нет'}`);
      if (!(await p.locator('.folio .mast-av svg.av').count())) return fail('в карточке нет силуэта');
      if (await p.locator('.folio .mast-av img').count()) return fail('в карточке — изображение');
      const t = flat(await p.locator('.folio .mast').innerText());
      if (!/до Р\. Х\./.test(t)) return fail(`нет годов: ${t.slice(0, 120)}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      if (await p.locator('.sky .dotcard').count()) return fail('на небе — карточка у ромба');
      const u = flat(await p.locator('.folio[data-union="u:adam+eva"]').innerText());
      for (const w of ['Адам и Ева', 'Ева — жена Адама', 'Показать детей союза (3)']) if (!u.includes(w)) return fail(`в карточке союза нет «${w}»: ${u.slice(0, 160)}`);
      return pass();
    },
  },
  {
    n: 601,
    title: 'Решения 70, 77, 194: «Показать детей союза (3)» в карточке союза справа — Каин, Авель и Сиф на небе (в показе 5 лиц), ромб раскрыт, выбор лица не меняется; команда становится «Скрыть детей союза», и та скрывает',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      await p.locator('.folio[data-union="u:adam+eva"] .union-reveal', { hasText: 'Показать детей союза' }).click();
      await p.waitForTimeout(1500);
      const s = await state(p);
      if (Number(s.ids) !== 5) return fail(`в показе ${s.ids} лиц`);
      const d = (await dots(p)).find((q) => q.uid === 'u:adam+eva');
      if (!d?.open) return fail('ромб не раскрыт');
      if (hashId(p) !== 'adam') return fail(`выбрано «${hashId(p)}»`);
      const cmd = p.locator('.folio[data-union="u:adam+eva"] .union-reveal', { hasText: 'Скрыть детей союза' });
      if (!(await cmd.count())) return fail('команда не стала «Скрыть детей союза»');
      await cmd.click();
      await p.waitForTimeout(1500);
      return Number((await state(p)).ids) === 1 ? pass() : fail(`после «Скрыть детей союза» в показе ${(await state(p)).ids} лиц`);
    },
  },
  {
    n: 602,
    // Я27 (этап 11, решение координатора по K2): у Сифа один союз с детьми — «Продолжить ветвь» раскрывает его сразу, Енос
    // на небе без второго действия; в карточке союза поэтому «Скрыть детей союза»
    title: 'Решения 75, 77, 194, Я27: Сиф — «Продолжить ветвь» в карточке справа показывает ромб союза «Сиф и его жена» и сразу его детей; в карточке союза справа — «Имя жены в Писании не названо», «Скрыть детей союза» и «сыновья и дочери: имена не названы (Быт 5:7)»',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM_OPEN });
      if (!(await clickStar(p, 'sif'))) return fail('нет звезды Сифа');
      // этап 21 (решение 197): «Продолжить ветвь» заменил шаг карты вперёд — у Сифа «Дети» (жена не названа)
      await p.locator('.folio .map-cmds .step-fwd').click();
      await p.waitForTimeout(1400);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (!(await clickDot(p, 'u:sif+'))) return fail('нет ромба союза Сифа');
      const u = flat(await p.locator('.folio[data-union="u:sif+"]').innerText());
      if (!((await p.locator('.sky canvas').getAttribute('data-stars')) ?? '').split(';').some((x) => x.startsWith('enos:'))) return fail('после шага вперёд Еноса нет на небе');
      for (const w of ['Сиф и его жена', 'Имя жены в Писании не названо', 'Скрыть детей союза', 'сыновья и дочери: имена не названы (Быт 5:7)'])
        if (!u.includes(w)) return fail(`в карточке союза Сифа нет «${w}»: ${u.slice(0, 200)}`);
      return pass();
    },
  },
  {
    n: 603,
    title: 'Решения 74, 77, 194: «С Иисуса Христа» — в карточке справа восьмилучевая звезда вместо силуэта, «Родители: Иосиф (по закону) и Мария»; «Показать родителей» раскрывает союз Иосифа и Марии, «Скрыть родителей» убирает',
    run: async (p) => {
      await open(p, '#/iisus~vs', { start: 'jesus', extra: JESUS });
      if (!(await clickStar(p, 'iisus'))) return fail('нет звезды Иисуса Христа');
      const c = await cardOf(p);
      if (!c || c.name !== 'Иисус Христос') return fail(`карточка: ${c?.name ?? 'нет'}`);
      if (!(await p.locator('.folio .mast-av .av .s').count())) return fail('в карточке нет звезды');
      const t = flat(await p.locator('.folio .kin-col').innerText());
      if (!/Родители Иосиф \(по закону\) и Мария/.test(t)) return fail(`«Родство»: ${t.slice(0, 200)}`);
      // этап 21 (решения 197, 198): «Показать родителей» и «Скрыть родителей» стали шагами карты «Родители» и «Свернуть
      // предков» (блок «Шаги карты» карточки)
      const par = p.locator('.folio .map-cmds .step-back');
      if (!(await par.count())) return fail('в карточке нет шага «Родители»');
      await par.click();
      await p.waitForTimeout(1400);
      const d = (await dots(p)).find((q) => q.uid === 'u:iosif-muzh-marii+mariya');
      if (!d) return fail('ромба союза Иосифа и Марии нет');
      const hide = p.locator('.folio .map-cmds .step-fanc');
      if (!(await hide.count())) return fail('в карточке нет «Свернуть предков»');
      await hide.click();
      await p.waitForTimeout(1400);
      return (await dots(p)).some((q) => q.uid === 'u:iosif-muzh-marii+mariya' && q.open) ? fail('«Свернуть предков» не убрал союз') : pass();
    },
  },
  {
    n: 604,
    title: 'Решения 77, 194: щелчок по ромбу «Адам и Ева» — справа сразу подробная карточка союза; щелчок по звезде Каина — справа подробная карточка лица',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      await p.waitForTimeout(600);
      const f = flat(await p.locator('.folio').innerText());
      if (!/Адам и Ева/.test(f) || !/Дети от этого союза|Супруги/.test(f)) return fail(`справа: ${f.slice(0, 120)}`);
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM_OPEN });
      if (!(await clickStar(p, 'kain'))) return fail('нет звезды Каина');
      await p.waitForTimeout(600);
      if (hashId(p) !== 'kain') return fail(`выбрано «${hashId(p)}»`);
      const h = flat((await p.locator('.folio h2').first().textContent()) ?? '');
      return /^Каин/.test(h) ? pass() : fail(`справа: «${h}»`);
    },
  },
  {
    n: 605,
    title: 'Решения 77, 83, 194: клавиатура — Enter на звезде Адама открывает карточку справа, фокус на первом имени «Родства»; Tab — к следующей строке; Enter на имени — карточка связи; Escape — назад к имени; ещё Escape — карточка закрыта, фокус на небе',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM_OPEN });
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      const f1 = await p.evaluate(() => ({ id: (document.activeElement as HTMLElement | null)?.dataset.id, row: document.activeElement?.closest('.dc-row')?.className }));
      if (!f1.id) return fail(`фокус после Enter: ${JSON.stringify(f1)}`);
      await p.keyboard.press('Tab');
      await p.waitForTimeout(200);
      const f2 = await p.evaluate(() => ({ id: (document.activeElement as HTMLElement | null)?.dataset.id, row: document.activeElement?.closest('.dc-row')?.className }));
      if (!f2.id || f2.row === f1.row) return fail(`Tab: ${JSON.stringify(f2)}`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      if ((await p.evaluate(() => document.activeElement?.id)) !== 'dc-link-title') return fail('фокус не на заголовке карточки связи');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      if ((await p.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id)) !== f2.id) return fail('Escape не вернул фокус к имени');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      if (await p.locator('.sky .dotcard[data-placed]').count()) return fail('карточка не закрылась');
      const on = await p.evaluate(() => !!document.activeElement?.closest('.sky'));
      return on ? pass() : fail('фокус ушёл с неба');
    },
  },
  {
    n: 606,
    title: 'Решения 77, 197, телефон 390 × 844: касание Каина в наборе — лист на 214 px с карточкой у звезды: силуэт, «Родство», шаг карты «Дети»; команды — 44 px',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM_OPEN });
      const q = await inView(p, 'kain');
      if (!q) return fail('нет звезды Каина');
      await p.touchscreen.tap(q.x, q.y);
      await p.waitForTimeout(1000);
      const sheet = p.locator('.folio .sheet-dot');
      if (!(await sheet.count())) return fail('нет листа-карточки');
      if (!(await sheet.locator('svg.av').count())) return fail('в листе нет силуэта');
      const t = flat(await sheet.innerText());
      // этап 21 (решение 197): «Продолжить ветвь» — шаг карты «Дети» (жена Каина не названа)
      if (!/^Каин/.test(t) || !/Родители/.test(t) || !(await sheet.locator('.dc-cmds .step-fwd').count())) return fail(`лист: ${t.slice(0, 160)}`);
      const low = (await sheet.locator('.dc-cmds button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height))).filter((h) => h < 43.5);
      return low.length ? fail(`низкие команды: ${low.join(', ')}`) : pass();
    },
  },
];
