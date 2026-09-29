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
  {
    n: 600,
    title: 'Решения 74, 77: «С Адама» — у звезды Адама карточка с образом-силуэтом (без портрета), именем и годами; у ромба союза «Адам и Ева» — карточка союза: «Ева — жена Адама», дети, «Раскрыть детей (3)», «Карточка союза»',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickStar(p, 'adam'))) return fail('нет звезды Адама');
      const c = await cardOf(p);
      if (!c || c.kind !== 'person' || c.name !== 'Адам') return fail(`карточка: ${c ? `${c.kind} «${c.name}»` : 'нет'}`);
      if (!(await p.locator('.sky .dotcard svg.av').count())) return fail('в карточке нет силуэта');
      if (await p.locator('.sky .dotcard img').count()) return fail('в карточке — изображение');
      const t = flat(await p.locator('.sky .dotcard').innerText());
      if (!/до Р\. Х\./.test(t)) return fail(`нет годов: ${t.slice(0, 120)}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      const u = flat(await p.locator('.sky .dotcard[data-kind="union"]').innerText());
      for (const w of ['Адам и Ева', 'Ева — жена Адама', 'Раскрыть детей (3)', 'Карточка союза']) if (!u.includes(w)) return fail(`в карточке союза нет «${w}»: ${u.slice(0, 160)}`);
      return pass();
    },
  },
  {
    n: 601,
    title: 'Решения 70, 77: «Раскрыть детей (3)» в карточке у ромба — Каин, Авель и Сиф на небе (в показе 5 лиц), ромб раскрыт, выбор лица не меняется; команда становится «Свернуть детей», и та сворачивает',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      await p.locator('.sky .dotcard .dc-cmds button', { hasText: 'Раскрыть детей' }).click();
      await p.waitForTimeout(1500);
      const s = await state(p);
      if (Number(s.ids) !== 5) return fail(`в показе ${s.ids} лиц`);
      const d = (await dots(p)).find((q) => q.uid === 'u:adam+eva');
      if (!d?.open) return fail('ромб не раскрыт');
      if (hashId(p) !== 'adam') return fail(`выбрано «${hashId(p)}»`);
      const cmd = p.locator('.sky .dotcard .dc-cmds button', { hasText: 'Свернуть детей' });
      if (!(await cmd.count())) return fail('команда не стала «Свернуть детей»');
      await cmd.click();
      await p.waitForTimeout(1500);
      return Number((await state(p)).ids) === 1 ? pass() : fail(`после «Свернуть детей» в показе ${(await state(p)).ids} лиц`);
    },
  },
  {
    n: 602,
    // Я27 (этап 11, решение координатора по K2): у Сифа один союз с детьми — «Продолжить ветвь» раскрывает его сразу, Енос
    // на небе без второго действия; в карточке союза поэтому «Свернуть детей», а не прежнее «Раскрыть детей (1)»
    title: 'Решения 75, 77, Я27: Сиф — «Продолжить ветвь» показывает ромб союза «Сиф и его жена» и сразу его детей (союз с детьми один); в карточке союза — «имя жены в Писании не названо», «Свернуть детей» и «Другие сыновья и дочери: имена не названы (Быт 5:7)»',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM_OPEN });
      if (!(await clickStar(p, 'sif'))) return fail('нет звезды Сифа');
      await p.locator('.sky .dotcard .dc-cmds button', { hasText: 'Продолжить ветвь' }).click();
      await p.waitForTimeout(1400);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (!(await clickDot(p, 'u:sif+'))) return fail('нет ромба союза Сифа');
      const u = flat(await p.locator('.sky .dotcard[data-kind="union"]').innerText());
      if (!((await p.locator('.sky canvas').getAttribute('data-stars')) ?? '').split(';').some((x) => x.startsWith('enos:'))) return fail('после «Продолжить ветвь» Еноса нет на небе');
      for (const w of ['Сиф и его жена', 'имя жены в Писании не названо', 'Свернуть детей', 'Другие сыновья и дочери: имена не названы (Быт 5:7)'])
        if (!u.includes(w)) return fail(`в карточке союза Сифа нет «${w}»: ${u.slice(0, 200)}`);
      return pass();
    },
  },
  {
    n: 603,
    title: 'Решения 74, 77: «С Иисуса Христа» — в карточке у звезды восьмилучевая звезда вместо силуэта, знаки обеих линий, «Родители: Иосиф (по закону) и Мария»; «Родители» раскрывает союз Иосифа и Марии, «Скрыть родителей» убирает',
    run: async (p) => {
      await open(p, '#/iisus~vs', { start: 'jesus', extra: JESUS });
      if (!(await clickStar(p, 'iisus'))) return fail('нет звезды Иисуса Христа');
      const c = await cardOf(p);
      if (!c || c.name !== 'Иисус Христос') return fail(`карточка: ${c?.name ?? 'нет'}`);
      if (!(await p.locator('.sky .dotcard .av .s').count())) return fail('в карточке нет звезды');
      if ((await p.locator('.sky .dotcard .dc-lines i').count()) !== 2) return fail('нет знаков обеих линий');
      const t = flat(await p.locator('.sky .dotcard').innerText());
      if (!/Родители Иосиф \(по закону\) и Мария/.test(t)) return fail(`«Родство»: ${t.slice(0, 200)}`);
      const par = p.locator('.sky .dotcard .dc-cmds button', { hasText: /^Родители$/ });
      if (await par.count()) {
        await par.click();
        await p.waitForTimeout(1400);
      }
      const d = (await dots(p)).find((q) => q.uid === 'u:iosif-muzh-marii+mariya');
      if (!d) return fail('ромба союза Иосифа и Марии нет');
      const hide = p.locator('.sky .dotcard .dc-cmds button', { hasText: 'Скрыть родителей' });
      if (!(await hide.count())) return pass('союз родителей показан с начала');
      await hide.click();
      await p.waitForTimeout(1400);
      return (await dots(p)).some((q) => q.uid === 'u:iosif-muzh-marii+mariya' && q.open) ? fail('«Скрыть родителей» не убрал союз') : pass();
    },
  },
  {
    n: 604,
    title: 'Решение 77: «Карточка союза» в карточке у ромба открывает справа подробную карточку союза «Адам и Ева»; «Карточка» в карточке у звезды — подробную карточку лица',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      await p.locator('.sky .dotcard .dc-cmds button', { hasText: 'Карточка союза' }).click();
      await p.waitForTimeout(1000);
      const f = flat(await p.locator('.folio').innerText());
      if (!/Адам и Ева/.test(f) || !/Дети от этого союза|Супруги/.test(f)) return fail(`справа: ${f.slice(0, 120)}`);
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM_OPEN });
      if (!(await clickStar(p, 'kain'))) return fail('нет звезды Каина');
      await p.locator('.sky .dotcard .dc-cmds button', { hasText: /^Карточка$/ }).click();
      await p.waitForTimeout(1000);
      if (hashId(p) !== 'kain') return fail(`выбрано «${hashId(p)}»`);
      const h = flat((await p.locator('.folio h2').first().textContent()) ?? '');
      return /^Каин/.test(h) ? pass() : fail(`справа: «${h}»`);
    },
  },
  {
    n: 605,
    title: 'Решения 77, 83: клавиатура — Enter на звезде Адама открывает карточку у звезды, фокус на первом имени «Родства»; Tab — к следующей строке; Enter на имени — карточка связи; Escape — назад к имени; ещё Escape — карточка закрыта, фокус на небе',
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
    title: 'Решение 77, телефон 390 × 844: касание Каина в наборе — лист на 214 px с карточкой у звезды: силуэт, «Родство», «Продолжить ветвь»; команды — 44 px',
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
      if (!/^Каин/.test(t) || !/Родители/.test(t) || !/Продолжить ветвь/.test(t)) return fail(`лист: ${t.slice(0, 160)}`);
      const low = (await sheet.locator('.dc-cmds button').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height))).filter((h) => h < 43.5);
      return low.length ? fail(`низкие команды: ${low.join(', ')}`) : pass();
    },
  },
];
