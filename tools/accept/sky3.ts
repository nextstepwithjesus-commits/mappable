/** Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа sky3: номера 330–344, отрисовка неба. */
import type { Page } from 'playwright';
import { pass, fail, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 2800) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
const cv = (p: Page, k: string) => p.locator('.sky > canvas').getAttribute(`data-${k}`).then((v) => v ?? '');
const overlaps = async (p: Page) => Number(((await p.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/')[1]);
const list = async (p: Page, k: string) => (await cv(p, k)).split('|').filter(Boolean).map((t) => t.replace(/ /g, ' '));

export const sky3: Scenario[] = [
  {
    n: 330,
    title: 'Решение 43, MAP-72: уточнения одноимённых — не длиннее трёх слов, без обрывков («Озия, он же»), «он же X» — «(X)»',
    run: async (p) => {
      const seen: string[] = [];
      for (const hash of ['#/~y-1000~w700~l0~s1~h3', '#/~y-1000~w700~l0~s1~h0.25', '#/~y-10~w120~l0~s1']) {
        await go(p, hash);
        for (const t of await list(p, 'noted')) {
          const [name, note] = t.split('#');
          const words = note.replace(/^,? /, '').split(/\s+/);
          if (words.length > 3) return fail(`${hash}: «${name}${note}» — длиннее трёх слов`);
          if (/\s(он|она)\s+же$|\s(и|в|из|от|с|на)$/.test(note)) return fail(`${hash}: обрывок «${name}${note}»`);
          seen.push(name + note);
        }
        if (await overlaps(p)) return fail(`${hash}: наложений подписей ${await overlaps(p)}`);
      }
      if (!seen.length) return fail('ни одного уточнения одноимённых в окнах');
      return pass(seen.slice(0, 8).join('; '));
    },
  },
  {
    n: 331,
    title: 'MAP-78: «сегодня» подписано и у правого края (слева от черты, если справа нет места); «завершение канона» — у своей черты',
    run: async (p) => {
      await go(p, '#/~y1840~w400~l0~s1');
      const a = await list(p, 'service');
      if (!a.includes('сегодня')) return fail(`у правого края нет «сегодня»: ${a.join(' | ')}`);
      await go(p, '#/~y60~w200~l0~s1');
      const b = await list(p, 'service');
      if (!b.includes('завершение канона')) return fail(`нет «завершение канона»: ${b.join(' | ')}`);
      if (await overlaps(p)) return fail(`наложений ${await overlaps(p)}`);
      return pass(`${a.join(' | ')}; ${b.join(' | ')}`);
    },
  },
  {
    n: 332,
    title: 'MAP-58: на масштабе эпохи у областей созвездий крупнее 150 × 60 px — названия (Судьи, цари); наложений нет',
    run: async (p) => {
      const out: string[] = [];
      for (const hash of ['#/~y-1000~w700~l0~s1', '#/~y-1210~w700~l0~s1']) {
        await go(p, hash);
        const areas = await list(p, 'group-areas');
        if (areas.length < 5) return fail(`${hash}: областей ${areas.length}`);
        // «:1» — название в самой области, «:2» — у другой части того же созвездия (повтор не ближе 1 200 px), «:0» — нет
        const named = areas.filter((a) => !a.endsWith(':0')).length;
        if (named / areas.length < 0.8) return fail(`${hash}: названы ${named} из ${areas.length}: ${areas.filter((a) => a.endsWith(':0')).join(', ')}`);
        if (await overlaps(p)) return fail(`${hash}: наложений ${await overlaps(p)}`);
        out.push(`${named}/${areas.length}`);
      }
      return pass(`названы: ${out.join(', ')}`);
    },
  },
  {
    n: 333,
    title: 'UX-72, IX-85, MAP-80: в наборе «Иессей, Давид» подписей ветвей («через Соломона», «через Нафана») нет — ветвей на небе нет',
    run: async (p) => {
      await go(p, '#/~k1~niessey.david', 3200);
      await p.getByRole('button', { name: 'Всё небо' }).first().click();
      await p.waitForTimeout(2200);
      const n = await list(p, 'notes');
      const br = n.filter((t) => t.startsWith('через '));
      if (br.length) return fail(`подписи ветвей в наборе без ветвей: ${br.join('; ')}`);
      return pass(`пометы набора: ${n.join('; ') || 'нет'}`);
    },
  },
  {
    n: 334,
    title: 'Решение 39, MAP-59, MAP-70: «только линии», окно 2000 лет — Авраам, Давид, Соломон подписаны именем; номера — «Мф N» или «Лк N», не голые числа',
    run: async (p) => {
      await go(p, '#/~y-1300~w2000~l0~s1~o1', 3400);
      const ids = (await cv(p, 'label-ids')).split(' ');
      for (const id of ['avraam', 'david', 'solomon']) if (!ids.includes(id)) return fail(`${id} без имени: ${ids.join(' ')}`);
      const n = await list(p, 'notes');
      const bare = n.filter((t) => /^\d+$/.test(t));
      if (bare.length) return fail(`голые номера: ${bare.join(', ')}`);
      const nums = n.filter((t) => /^(Мф|Лк) \d+$/.test(t));
      if (!nums.length) return fail('ни одного номера «Мф N» / «Лк N»');
      if (await overlaps(p)) return fail(`наложений ${await overlaps(p)}`);
      return pass(`номера: ${nums.join(', ')}`);
    },
  },
];
