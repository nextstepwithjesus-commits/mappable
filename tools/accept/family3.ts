/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа family3: номера 345–349, семьи
 * на небе и коса (src/render/trails.ts, src/engine/ribbons.ts).
 * Проверки — по замерам кадра на холсте неба (src/render/sky.ts, конец draw()): canvas[data-notes] — пометы, знаки
 * брака «‖» и прочие надписи неба через «|»; .sky[data-labels="N/M"] — подписей и пересекающихся пар; звёзды —
 * кнопки #sky-star-<id> с data-x, data-y (px холста; src/ui/sky/SkyA11y.tsx).
 */
import type { Page } from 'playwright';
import { pass, fail, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 2600) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
const cv = (p: Page, k: string) => p.locator('.sky > canvas').getAttribute(`data-${k}`).then((v) => v ?? '');
const overlaps = async (p: Page) => Number(((await p.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/')[1]);
const notes = async (p: Page) => (await cv(p, 'notes')).split('|').filter(Boolean);
const ORDER = /^годы — по порядку /;
const MOTHER = /^от [А-ЯЁ]/;
const star = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
  }, id);

export const family3: Scenario[] = [
  {
    n: 345,
    title: 'Решение 41, MAP-73: помета «годы — по порядку …, выв.» только у семьи выбранного лица; у сыновей Иакова — рассказ о рождениях Быт 29:32–30:24; 35:16–18',
    run: async (p) => {
      // без выбора — ни одной пометы порядка (было 7 и 8 на экран)
      for (const hash of ['#/~y-1700~w300~l0~s1', '#/~y-2070~w250~l21~s1', '#/~y-1915~w70~l-2~s1']) {
        await go(p, hash, 2200);
        const n = (await notes(p)).filter((t) => ORDER.test(t));
        if (n.length) return fail(`${hash}: без выбора пометы порядка: ${n.join('; ')}`);
      }
      // выбран Иаков — одна помета у его сыновей, со ссылкой на рассказ о рождениях, а не на 1 Пар 2:1–2
      await go(p, '#/iakov~y-1915~w70~l-2~s1');
      const n = (await notes(p)).filter((t) => ORDER.test(t));
      if (n.join('|') !== 'годы — по порядку Быт 29:32–30:24; 35:16–18, выв.') return fail(`у сыновей Иакова: ${n.join(' | ') || 'пометы нет'}`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass(n[0]);
    },
  },
  {
    n: 346,
    title: 'MAP-74: у детей Давида от семи матерей — гребёнки одним начертанием, помета матери у корня; «Как читать карту» объясняет гребёнку',
    run: async (p) => {
      await go(p, '#/~y-1010~w50~l0~s1');
      const n = await notes(p);
      const moms = n.filter((t) => MOTHER.test(t));
      if (moms.length < 5 || !moms.includes('от Вирсавии')) return fail(`помет матерей ${moms.length}: ${moms.join(', ')}`);
      if (n.some((t) => ORDER.test(t))) return fail('помета порядка без выбранного лица');
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      await go(p, '#/~y-1010~w50~l0~s1~plegend', 2200);
      const rows = (await p.locator('.legend-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
      const row = rows.find((t) => /гребёнк/.test(t));
      if (!row) return fail('в «Как читать карту» нет строки о гребёнке матери');
      if (rows.some((t) => /разного начертания/.test(t))) return fail('в «Как читать карту» осталось «скобы разного начертания»');
      return pass(`${moms.join(', ')}; «${row.slice(0, 90)}»`);
    },
  },
  {
    n: 347,
    title: 'MAP-76: знак брака «‖» занимает место в общей проверке наложений — у Моисея и у Давида знаки есть, наложений нет',
    run: async (p) => {
      const got: string[] = [];
      for (const hash of ['#/moisey', '#/david~y-1010~w60~l6~s1']) {
        await go(p, hash);
        const marks = (await notes(p)).filter((t) => t === '‖').length;
        if (!marks) return fail(`${hash}: знаков брака в замере нет`);
        if (await overlaps(p)) return fail(`${hash}: наложений ${await overlaps(p)}`);
        got.push(`${hash.split('~')[0]}: ${marks}`);
      }
      return pass(`знаков брака: ${got.join(', ')}`);
    },
  },
  {
    n: 348,
    title: 'MAP-80: режим «набор» — Давид с семьёй: пометы матерей у детей, помета порядка у выбранного Давида, наложений нет',
    run: async (p) => {
      await go(p, '#/david');
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(300);
      await p.locator('.workpick button:text-is("С семьёй")').first().click();
      await p.waitForTimeout(400);
      await go(p, '#/david~k1');
      if ((await cv(p, 'mode')) !== 'work') return fail(`небо не в режиме «набор»: ${await cv(p, 'mode')}`);
      const n = await notes(p);
      const moms = n.filter((t) => MOTHER.test(t));
      if (moms.length < 3) return fail(`помет матерей ${moms.length}: ${moms.join(', ')}`);
      if (!n.some((t) => /^годы — по порядку 1 Пар 3:/.test(t))) return fail(`нет пометы порядка у детей Давида: ${n.filter((t) => ORDER.test(t)).join('; ')}`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass(`${moms.join(', ')}`);
    },
  },
  {
    n: 349,
    title: 'Решение 41: наведение на гребёнку показывает помету порядка этой семьи (у детей Давида — «годы — по порядку 1 Пар 3:…»)',
    run: async (p) => {
      await go(p, '#/~y-1010~w50~l0~s1');
      if ((await notes(p)).some((t) => ORDER.test(t))) return fail('помета порядка видна без наведения');
      const box = await p.locator('.sky > canvas').boundingBox();
      // Авессалом — яркая звезда, она всегда в списке неба (SkyA11y, LIST_MAX)
      const kid = await star(p, 'avessalom');
      if (!box || !kid) return fail('нет звезды Авессалома на экране');
      // ствол гребёнки — на x ребёнка, между его звездой и следом Давида (след Давида — строка 0, середина окна: ~l0)
      const x = Math.round(kid.x) + 0.5;
      const y = kid.y + Math.sign(box.height / 2 - kid.y) * 24;
      await p.mouse.move(box.x + x, box.y + y);
      await p.waitForTimeout(700);
      const n = (await notes(p)).filter((t) => ORDER.test(t));
      if (!n.some((t) => /^годы — по порядку 1 Пар 3:/.test(t))) return fail(`наведение на гребёнку (${x}, ${Math.round(y)}): пометы порядка нет`);
      await p.mouse.move(box.x + 30, box.y + box.height - 30);
      await p.waitForTimeout(700);
      if ((await notes(p)).some((t) => ORDER.test(t))) return fail('помета порядка осталась после ухода указателя');
      return pass(n.join('; '));
    },
  },
];
