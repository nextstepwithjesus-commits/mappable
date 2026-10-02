/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа family3: номера 345–349, семьи
 * на небе и коса (src/render/trails.ts, src/engine/ribbons.ts).
 * Проверки — по замерам кадра на холсте неба (src/render/sky.ts, конец draw()): canvas[data-notes] — пометы и прочие
 * надписи неба через «|» (этап 11: помет матерей и порядка на небе нет — Г8, Г9); [data-plate-texts] — подписи у ромбов;
 * [data-links] — пути и узлы связей (черта брака — вид bar); [data-label-boxes] — места подписей лиц; .sky[data-labels="N/M"] — подписей и пересекающихся пар; звёзды —
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
const flat = (s: string) => s.replace(/\u2060/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
/** Подписи у узлов и обрывков (canvas[data-plate-texts]): «ключ союза:текст». */
const plateTexts = async (p: Page) => (await cv(p, 'plate-texts')).split('|').filter(Boolean).map((t) => ({ key: t.slice(0, t.lastIndexOf(':')), text: t.slice(t.lastIndexOf(':') + 1) }));
/**
 * Подсказка звезды после неподвижности (третья строка — через 700 мс, IX-58): текст подсказки или null. Звезда — по
 * списку неба (#sky-star-…).
 */
async function starTip(p: Page, id: string): Promise<string | null> {
  const box = await p.locator('.sky > canvas').boundingBox();
  const s = await star(p, id);
  if (!box || !s) return null;
  await p.mouse.move(box.x + s.x, box.y + s.y);
  await p.waitForTimeout(1300);
  const t = p.locator('.sky .tip[data-shown][data-more]');
  return (await t.count()) ? flat(await t.innerText()) : null;
}
/**
 * Этап 15 (решение 179): третья строка подсказки ребёнка, чей союз происхождения на небе, — строка происхождения
 * «Иаков и Лия — родители; Рувим — сын»; год, оценённый по порядку перечисления, несёт «выв.» у самих лет, а пояснение
 * порядка с местом перечисления — в строке «Год» карточки (src/ui/card/kinrows.ts, personOrderNote).
 */
async function originTip(p: Page, id: string, origin: string): Promise<string | null> {
  const t = await starTip(p, id);
  if (!t) return `нет подсказки у звезды ${id}`;
  if (!t.includes(origin)) return `подсказка ${id} без строки происхождения «${origin}»: «${t}»`;
  if (!/выв\./.test(t.slice(0, t.indexOf(origin)))) return `подсказка ${id}: у лет нет пометы «выв.»: «${t}»`;
  if (/порядку перечисления/.test(t)) return `подсказка ${id}: строка порядка рядом со строкой происхождения (больше трёх строк): «${t}»`;
  return null;
}
/** Пояснение порядка в карточке лица: «по порядку перечисления, <стихи>, выв.» (null — есть). */
async function cardOrder(p: Page, id: string, verses: RegExp): Promise<string | null> {
  await go(p, `#/${id}`, 2600);
  const txt = flat(await p.locator('.folio').innerText());
  const m = /по порядку перечисления, ([^,]*), выв\./.exec(txt);
  if (!m) return `карточка ${id}: нет пояснения «по порядку перечисления, …, выв.»`;
  if (!verses.test(m[1])) return `карточка ${id}: «по порядку перечисления, ${m[1]}»`;
  return null;
}
/** Имена жён Давида — подписи у ромбов его союзов на следе отца (Г8). */
const DAVID_WIVES = ['Ахиноама', 'Авигея', 'Мааха', 'Аггифа', 'Авитала', 'Эгла', 'Вирсавия', 'Мелхола'];

export const family3: Scenario[] = [
  {
    n: 345,
    // этап 11 (Г9): помет «годы — по порядку …» на небе нет вовсе — ни без выбора, ни у семьи выбранного лица; помета —
    // в карточках, с диапазоном стихов, где названы дети этого союза (DG 2.3.6): у сыновей Лии — рассказ о рождениях
    // Быт 29:32–35; 30:17–21 (а не 1 Пар 2:1–2), у сыновей Валлы — Быт 30:4–8.
    // Этап 15 (решение 179): третья строка подсказки звезды — строка происхождения («Иаков и Лия — родители; Рувим —
    // сын»), «выв.» — у лет; пояснение порядка со стихами — в строке «Год» карточки
    title: 'Решение 41, MAP-73, Г9, решение 179: помет порядка на небе нет; у сыновей Иакова в подсказке — строка происхождения и «выв.» у лет, пояснение порядка — в карточке: рассказ о рождениях (Быт 29:32–35; 30:17–21 у Рувима, Быт 30:4–8 у Дана)',
    run: async (p) => {
      for (const hash of ['#/~y-1700~w300~l0~s1', '#/~y-2070~w250~l21~s1', '#/~y-1915~w70~l-2~s1', '#/iakov']) {
        await go(p, hash, 2200);
        const n = (await notes(p)).filter((t) => ORDER.test(t) || /по порядку/.test(t));
        if (n.length) return fail(`${hash}: помета порядка на небе: ${n.join('; ')}`);
      }
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      const got: string[] = [];
      for (const [id, origin] of [['ruvim', 'Иаков и Лия — родители; Рувим — сын'], ['dan', 'Иаков и Валла — родители; Дан — сын']] as const) {
        const bad = await originTip(p, id, origin);
        if (bad) return fail(bad);
        await p.mouse.move(5, 5);
        await p.waitForTimeout(300);
      }
      for (const [id, want] of [['ruvim', 'Быт 29:32–35; 30:17–21'], ['dan', 'Быт 30:4–8']] as const) {
        const bad = await cardOrder(p, id, new RegExp(`^${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
        if (bad) return fail(bad);
        got.push(`${id}: ${want}`);
      }
      return pass(`подсказки — строка происхождения; карточки — ${got.join('; ')}`);
    },
  },
  {
    n: 346,
    // этап 11 (Г8): помет «от Вирсавии» на небе нет — мать видна положением: ромб союза на её следе, а если жена стоит
    // далеко от детей (у Давида на всём небе), ромб — на следе отца и у него подписано имя матери
    title: 'MAP-74, Г8: дети Давида от семи матерей — у ромбов союзов на следе Давида подписаны имена матерей (помет «от …» на небе нет); «Условные знаки» объясняют подпись у ромба',
    run: async (p) => {
      await go(p, '#/~y-1010~w50~l0~s1');
      const n = await notes(p);
      if (n.some((t) => MOTHER.test(t))) return fail(`помета матери на небе: ${n.filter((t) => MOTHER.test(t)).join(', ')}`);
      if (n.some((t) => ORDER.test(t))) return fail('помета порядка на небе');
      const moms = (await plateTexts(p)).filter((t) => t.key.startsWith('u:david+') && DAVID_WIVES.includes(t.text)).map((t) => t.text);
      if (moms.length < 2 || !moms.includes('Вирсавия')) return fail(`имён матерей у ромбов ${moms.length}: ${moms.join(', ')}`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      await go(p, '#/~y-1010~w50~l0~s1~plegend', 2200);
      const rows = (await p.locator('.legend-row').allInnerTexts()).map((t) => flat(t));
      const row = rows.find((t) => /у ромба подписано имя матери/.test(t));
      if (!row) return fail('в «Условных знаках» нет строки об имени матери у ромба');
      if (rows.some((t) => /разного начертания/.test(t))) return fail('в «Условных знаках» осталось «скобы разного начертания»');
      return pass(`${moms.join(', ')}; «${row.slice(row.indexOf('мать не названа или'), row.indexOf('мать не названа или') + 90)}»`);
    },
  },
  {
    n: 347,
    // этап 11 (Г4): знак брака «‖» — черта брака, путь от следа мужа к ромбу (data-links, вид bar); подписи лиц на неё не
    // ложатся, наложений нет. У Давида черты — в его роде (жёны стоят у мужа); на всём небе они далеко от детей (Г8)
    title: 'MAP-76, Г4: черта брака «‖» — от следа мужа к ромбу; у Моисея и у Давида (его род) черты есть, подписи лиц на них не ложатся, наложений нет',
    run: async (p) => {
      const got: string[] = [];
      for (const hash of ['#/moisey', '#/david~vr.david.d.1.f~y-1000~w90~l0']) {
        await go(p, hash, 3000);
        const bad = await p.evaluate(() => {
          const c = document.querySelector('.sky > canvas') as HTMLElement;
          const bars = (c.dataset.links ?? '').split(';').filter((q) => q.startsWith('bar|'));
          const boxes = (c.dataset.labelBoxes ?? '').split(';').filter(Boolean).map((q) => {
            const [id, r] = q.split(':');
            const [x, y, w, h] = r.split(',').map(Number);
            return { id, x, y, w, h };
          });
          const hit: string[] = [];
          for (const b of bars) {
            const [, , ks, pts] = b.split('|');
            const [x, y0, , y1] = pts.split(',').map(Number);
            for (const r of boxes) if (x > r.x && x < r.x + r.w && Math.max(y0, y1) > r.y && Math.min(y0, y1) < r.y + r.h) hit.push(`${r.id} на ${ks}`);
          }
          return { bars: bars.length, hit };
        });
        if (!bad.bars) return fail(`${hash}: черт брака нет`);
        if (bad.hit.length) return fail(`${hash}: подписи на черте брака: ${bad.hit.join(', ')}`);
        if (await overlaps(p)) return fail(`${hash}: наложений ${await overlaps(p)}`);
        got.push(`${hash.split('~')[0]}: ${bad.bars}`);
      }
      return pass(`черт брака: ${got.join(', ')}`);
    },
  },
  {
    n: 348,
    // этап 11 (Г8, Г9): в наборе «Давид с семьёй» мать видна положением — ромб союза на её следе (строка её звезды), помет
    // матерей и порядка на небе нет; этап 15 (решение 179): в подсказке звезды ребёнка — строка происхождения («Давид и
    // Ахиноама — родители; Амнон — сын»), «выв.» у лет; помета порядка (1 Пар 3:1–9) — в карточке
    title: 'MAP-80, Г8, Г9, решение 179: показ «набор» — Давид с семьёй: ромбы союзов — на следах матерей, помет на небе нет, в подсказке ребёнка — строка происхождения, наложений нет',
    run: async (p) => {
      await go(p, '#/david');
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(300);
      await p.locator('.workpick button:text-is("С семьёй")').first().click();
      await p.waitForTimeout(400);
      await go(p, '#/david~k1', 3000);
      if ((await cv(p, 'mode')) !== 'work') return fail(`небо не в режиме «набор»: ${await cv(p, 'mode')}`);
      const n = await notes(p);
      if (n.some((t) => MOTHER.test(t) || ORDER.test(t))) return fail(`пометы на небе: ${n.filter((t) => MOTHER.test(t) || ORDER.test(t)).join('; ')}`);
      // ромб союза Давида с названной женой — на строке её звезды (±2 px)
      const at = await p.evaluate(() => {
        const c = document.querySelector('.sky > canvas') as HTMLElement;
        const stars = new Map((c.dataset.stars ?? '').split(';').filter(Boolean).map((q) => {
          const [id, xy] = q.split(':');
          return [id, Number(xy.split(',')[1])] as const;
        }));
        return (c.dataset.links ?? '').split(';').filter((q) => q.startsWith('node|') && /^u\.david\.[^_.]/.test(q.split('|')[2])).map((q) => {
          const [, , key, xy] = q.split('|');
          const wife = key.split('.')[2];
          return { wife, y: Number(xy.split(',')[1]), wy: stars.get(wife) ?? null };
        });
      });
      const seen = at.filter((q) => q.wy !== null);
      if (seen.length < 3) return fail(`ромбов у жён на небе ${seen.length}: ${JSON.stringify(at)}`);
      const off = seen.filter((q) => Math.abs(q.y - q.wy!) > 2);
      if (off.length) return fail(`ромб не на следе матери: ${off.map((q) => `${q.wife} ${q.y} ≠ ${q.wy}`).join(', ')}`);
      const bad = await originTip(p, 'amnon', 'Давид и Ахиноама — родители; Амнон — сын');
      if (bad) return fail(bad);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass(`ромбов на следах матерей: ${seen.map((q) => q.wife).join(', ')}; в подсказке Амнона — «Давид и Ахиноама — родители; Амнон — сын»`);
    },
  },
  {
    n: 349,
    // этап 11 (Г9): гребёнок с пометой на небе нет; наведение на звезду ребёнка показывает третью строку подсказки (через
    // 700 мс), и небо при этом помет не рисует. Этап 15 (решение 179): третья строка — строка происхождения, «выв.» — у лет,
    // помета порядка (1 Пар 3:…) — в карточке
    title: 'Решение 41, Г9, решение 179: наведение на звезду ребёнка Давида — в подсказке строка происхождения и «выв.» у лет, помета порядка (1 Пар 3:…) — в карточке; на небе пометы нет ни до, ни во время, ни после',
    run: async (p) => {
      await go(p, '#/~y-1010~w50~l0~s1');
      if ((await notes(p)).some((t) => ORDER.test(t))) return fail('помета порядка видна без наведения');
      const bad = await originTip(p, 'avessalom', 'Давид и Мааха — родители; Авессалом — сын');
      if (bad) return fail(bad);
      if ((await notes(p)).some((t) => ORDER.test(t))) return fail('при наведении помета порядка легла на небо');
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      await p.mouse.move(box.x + 30, box.y + box.height - 30);
      await p.waitForTimeout(700);
      if (await p.locator('.sky .tip[data-shown][data-kind="star"]').count()) return fail('подсказка осталась после ухода указателя');
      if ((await notes(p)).some((t) => ORDER.test(t))) return fail('помета порядка осталась после ухода указателя');
      const card = await cardOrder(p, 'avessalom', /^1 Пар 3:1–\d+$/);
      if (card) return fail(card);
      return pass('в подсказке — «Давид и Мааха — родители; Авессалом — сын», «выв.» у лет; в карточке — порядок по 1 Пар 3');
    },
  },
];
