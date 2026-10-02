/**
 * Сценарии приёмки этапа 16, исполнитель L «Свет» (docs/ui-review/STAGE16.md, решения 182–184; приёмка О2–О4),
 * группа light16: номера 1240–1259.
 *  — 1240 слой света (решение 182): отдельный холст под основным (основной прозрачен в пустом месте неба), сборка
 *    на покое ≤ 40 мс (О2; canvas[data-light] — длительность последней сборки), при сдвиге — перенос без сборки;
 *  — 1241 цвет «без перескока» (решение 183): ветви Иакова — оттенки колен матерей (сыны Лии, Рахили, Валлы, Зелфы),
 *    у Давида — цвета ветвей решения 69 (canvas[data-branches]);
 *  — 1242 названия созвездий на обзоре (решение 184): у крупных — подзаголовок из данных «родоначальник …; N лиц»;
 *  — 1243 «Условные знаки»: строки света (туманность, устье, пыль, огонёк, четыре колена), знак врезки семьи и шестое
 *    начало «Рассказ: от Адама до Иисуса Христа»;
 *  — 1244 имена у устья (решение 184, К4′): каждое имя в canvas[data-mouths] — у своего следа за концом перехода.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 3000) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
const light = async (p: Page) => {
  const v = ((await p.locator('.sky > canvas').getAttribute('data-light')) ?? '').split(' ');
  return { ms: Number(v[0]), builds: Number(v[1]) };
};

export const light16: Scenario[] = [
  {
    n: 1240,
    title: 'Решение 182, О2: слой света — отдельный холст под прозрачным основным; сборка на покое ≤ 40 мс, сдвиг — перенос без сборки',
    run: async (p) => {
      await go(p, '#/~y-1900~w4600~l0~s1');
      const host = await p.evaluate(`(() => { const h = document.querySelector('.sky > .sky-light'); return !!h && getComputedStyle(h).zIndex === '-1'; })()`);
      if (!host) return fail('нет обёртки слоя света .sky > .sky-light под холстом');
      // основной холст прозрачен там, где на нём ничего нет (небо — в слое света)
      const alpha0 = await p.evaluate(`(() => { const c = document.querySelector('.sky > canvas'); const k = c.width / c.getBoundingClientRect().width; return c.getContext('2d').getImageData(Math.round(c.clientWidth * 0.06 * k), Math.round(c.clientHeight * 0.9 * k), 1, 1).data[3]; })()`);
      if (alpha0 > 0) return fail(`основной холст непрозрачен в пустом месте (альфа ${alpha0})`);
      // сборки на покое после приближения колесом: лучшая из трёх ≤ 40 мс (машина общая; первая сборка — холодная)
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      const times: number[] = [];
      for (let k = 0; k < 3; k++) {
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.wheel(0, k % 2 ? 240 : -240);
        await p.waitForTimeout(1300);
        times.push((await light(p)).ms);
      }
      const best = Math.min(...times);
      if (!(best <= 40)) return fail(`сборка слоя на покое ${times.map((t) => t.toFixed(1)).join(', ')} мс (нужно ≤ 40)`);
      // сдвиг в пределах запаса — перенос (CSS transform), без новой сборки
      const before = (await light(p)).builds;
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await p.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 6 });
      await p.mouse.up();
      await p.waitForTimeout(900);
      const after = (await light(p)).builds;
      if (after !== before) return fail(`сдвиг на 60 px пересобрал слой (сборок ${before} → ${after})`);
      return pass(`сборки ${times.map((t) => t.toFixed(1)).join(', ')} мс; сдвиг — перенос`);
    },
  },
  {
    n: 1241,
    title: 'Решение 183: цвет «без перескока» — ветви Иакова = оттенки колен матерей; у Давида — цвета ветвей решения 69',
    run: async (p) => {
      // оттенки колен (src/render/branches.ts, TRIBE_HUES) — первые четыре цвета ветвей
      const NIGHT: Record<string, string> = { liya: '#9a75c8', rakhil: '#30e978', valla: '#e8968e', zelfa: '#e960a2' };
      await go(p, '#/iakov~y-1916~w60~l-4~s1');
      const raw = await p.locator('.sky > canvas').getAttribute('data-branches');
      if (!raw) return fail('нет замера ветвей у Иакова');
      const f = JSON.parse(raw) as { sel: string; n: number; colors: string[] };
      const keys = (await p.evaluate(`(() => [...document.querySelectorAll('#sky-stars button')].length)()`)) as number;
      if (f.sel !== 'iakov' || f.n < 4) return fail(`ветвей ${f.n} у ${f.sel}`);
      const want = new Set(Object.values(NIGHT));
      const got = new Set(f.colors.slice(0, f.n).map((c) => c.toLowerCase()));
      for (const c of got) if (!want.has(c)) return fail(`у Иакова цвет ветви ${c} — не оттенок колена (${[...want].join(', ')})`);
      await go(p, '#/david~y-1000~w60~l0~s1');
      const d = JSON.parse((await p.locator('.sky > canvas').getAttribute('data-branches')) ?? '{}') as { colors?: string[] };
      const B69 = ['#30e978', '#9a75c8', '#e8968e', '#e960a2', '#81fac1', '#477dfe'];
      if (!d.colors || d.colors.slice(0, 6).some((c, i) => c.toLowerCase() !== B69[i])) return fail(`у Давида цвета ветвей ${d.colors?.slice(0, 6).join(', ')}`);
      return pass(`Иаков: ${[...got].join(', ')} (звёзд в списке ${keys}); Давид — цвета ветвей решения 69`);
    },
  },
  {
    n: 1242,
    title: 'Решение 184: на обзоре крупные созвездия — с подзаголовком из данных «родоначальник …; N лиц»',
    run: async (p) => {
      await go(p, '#/~y-1900~w4600~l0~s1');
      const notes = ((await p.evaluate(`(() => document.querySelector('.sky > canvas').dataset.notes || '')()`)) as string) + '';
      const texts = (await p.evaluate(`(() => { const s = document.querySelector('.sky').dataset; return [s.labels || '', document.querySelector('.sky > canvas').dataset.labelIds || ''].join(' '); })()`)) as string;
      const ledger = (await p.evaluate(`(() => JSON.stringify(document.querySelector('.sky > canvas').dataset))()`)) as string;
      const m = /родоначальник [А-ЯЁ][а-яё]+; \d+[ \u00a0]лиц/.exec(ledger + notes + texts);
      return m ? pass(`подзаголовок: «${m[0]}»`) : fail(`подзаголовка созвездия на обзоре нет в замере кадра (${notes.slice(0, 160)})`);
    },
  },
  {
    n: 1243,
    title: '«Условные знаки»: строки света, оттенки четырёх колен, знак врезки семьи и шестое начало «Рассказ: от Адама до Иисуса Христа»',
    run: async (p) => {
      await go(p, '#/~y-1900~w4600~l0~s1', 2500);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const text = (await p.locator('.app > .sheet').innerText()).replace(/\s+/g, ' ');
      if (!(await p.locator('.app > .sheet canvas').count())) return fail('образцов нет');
      const need = ['туманност', 'Устье', 'звёздная пыль', 'огонёк', 'сыны Лии', 'сыны Рахили', 'сыны Валлы', 'сыны Зелфы', 'Врезка семьи', 'Рассказ: от Адама до Иисуса Христа'];
      const miss = need.filter((w) => !text.includes(w));
      return miss.length ? fail(`нет: ${miss.join(', ')}`) : pass('все строки на месте');
    },
  },
  {
    n: 1244,
    title: 'Решение 184, К4′: имена у устья — у своего следа за концом перехода, путь не прерван чужой подписью',
    run: async (p) => {
      await go(p, '#/~y-1990~w900~l-6~s1');
      const raw = ((await p.locator('.sky > canvas').getAttribute('data-mouths')) ?? '').split(';').filter(Boolean);
      for (const m of raw) {
        const [id, b, path] = m.split(':');
        const [x, y, , h] = b.split(',').map(Number);
        const P = path.split(',').map(Number);
        const ex = P[P.length - 2];
        const ey = P[P.length - 1];
        if (Math.abs(x - ex) > 6 || ey < y - 6 || ey > y + h + 6) return fail(`«${id}»: имя не у своего следа (${x},${y} против ${ex},${ey})`);
      }
      return pass(`имён у устья: ${raw.length}`);
    },
  },
];
