/**
 * Сценарии приёмки: раскрытие родословия и союзы (решения 67–72), группа colors4: номера 560–569, подсветка ветвей
 * выбранного лица (решение 69; src/render/branches.ts, marks.ts branchFrame, trails.ts).
 * Проверки — по замеру кадра canvas[data-branches] (trails.ts, drawBranchTicks): выбранное лицо, число ветвей, сколько лиц
 * нарисовано цветом, метки ветвей у подписей, цвета ветвей, ветвь и поколение лиц первых трёх поколений в кадре; и по
 * пикселям холста у следа потомка.
 */
import type { Page } from 'playwright';
import { pass, fail, type Scenario } from './kit.ts';

type Frame = { sel: string; n: number; shown: number; ticks: Record<string, number>; colors: string[]; gen: Record<string, [number, number]> };

/** Новая вкладка того же контекста: начало «Всё небо» (решение 68) — без выбора начала, как прежде. */
async function tab(p: Page, hash: string, o: { theme?: 'night' | 'day' } = {}, ms = 3000) {
  const q = await p.context().newPage();
  const init = [`localStorage.setItem('toledot:intro','true')`, `localStorage.setItem('toledot:start', JSON.stringify('all'))`];
  if (o.theme) init.push(`localStorage.setItem('toledot:theme', JSON.stringify('${o.theme}'))`);
  await q.addInitScript(init.join(';'));
  await q.goto(p.url().replace(/#.*$/, '') + hash);
  await q.waitForTimeout(ms);
  return q;
}
const frame = async (p: Page): Promise<Frame | null> => {
  const raw = await p.locator('.sky > canvas').getAttribute('data-branches');
  return raw ? (JSON.parse(raw) as Frame) : null;
};
const star = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
  }, id);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/**
 * Пиксели следа лица id справа от звезды (px холста): сколько из них близки к цвету ветви color. Подпись справа от звезды
 * закрывает начало следа — поэтому просматривается полоса от 8 до 320 px, по три строки.
 */
const near = (p: Page, id: string, color: string) =>
  star(p, id).then((s) =>
    s
      ? p.evaluate(
          ({ s, c }) => {
            const cv = document.querySelector('.sky > canvas') as HTMLCanvasElement;
            const k = cv.width / cv.getBoundingClientRect().width;
            const ctx = cv.getContext('2d')!;
            let hits = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const d = ctx.getImageData(Math.round((s.x + 8) * k), Math.round((s.y + dy) * k), Math.round(312 * k), 1).data;
              for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < 90) hits++;
            }
            return hits;
          },
          { s, c: hex(color) },
        )
      : -1,
  );

export const colors4: Scenario[] = [
  {
    n: 560,
    title: 'Решение 69: у Авраама три ветви по союзам — Сарра (Исаак, Иаков), Агарь (Измаил), Хеттура (Зимран); у первого ребёнка каждой ветви — цветная метка',
    run: async (p) => {
      const q = await tab(p, '#/avraam~y-1950~w500~l0~s1');
      try {
        const f = await frame(q);
        if (!f) return fail('нет замера ветвей: подсветка не включилась');
        if (f.sel !== 'avraam' || f.n !== 3) return fail(`выбранное ${f.sel}, ветвей ${f.n}`);
        const b = (id: string) => f.gen[id]?.[0];
        if (b('isaak') === undefined || b('isaak') !== b('iakov')) return fail(`Исаак ${b('isaak')}, Иаков ${b('iakov')}: одна ветвь союза с Саррой`);
        if (b('izmail') === undefined || b('izmail') === b('isaak')) return fail(`Измаил ${b('izmail')} — не своя ветвь`);
        if (f.gen.iakov?.[1] !== 2) return fail(`Иаков — поколение ${f.gen.iakov?.[1]}, а не 2`);
        if (new Set(f.colors).size !== 3) return fail(`цвета ветвей не различны: ${f.colors.join(' ')}`);
        const ticks = Object.keys(f.ticks);
        if (ticks.length < 2) return fail(`меток ветвей ${ticks.length}: ${ticks.join(', ')}`);
        return pass(`ветвей ${f.n}, цветом ${f.shown} лиц; метки: ${ticks.join(', ')}; цвета ${f.colors.join(' ')}`);
      } finally {
        await q.close();
      }
    },
  },
  {
    n: 561,
    title: 'Решение 69: у Ноя союз один — ветви по детям: Сим, Хам, Иафет — три разных цвета',
    run: async (p) => {
      const q = await tab(p, '#/noy~y-2500~w900~l0~s1');
      try {
        const f = await frame(q);
        if (!f) return fail('нет замера ветвей');
        if (f.n !== 3) return fail(`ветвей ${f.n}`);
        const bs = ['sim', 'kham', 'iafet'].map((id) => f.gen[id]?.[0]);
        if (bs.some((x) => x === undefined) || new Set(bs).size !== 3) return fail(`ветви Сима, Хама, Иафета: ${bs.join(', ')}`);
        if (f.gen.arfaksad?.[0] !== f.gen.sim?.[0]) return fail('Арфаксад — не в ветви Сима');
        return pass(`Сим ${bs[0]}, Хам ${bs[1]}, Иафет ${bs[2]}; цветом ${f.shown} лиц`);
      } finally {
        await q.close();
      }
    },
  },
  {
    n: 562,
    title: 'Решение 69: у Давида восемь ветвей — соседние разного цвета, седьмая и восьмая — оттенки первых (не повтор)',
    run: async (p) => {
      const q = await tab(p, '#/david~y-950~w300~l0~s1');
      try {
        const f = await frame(q);
        if (!f) return fail('нет замера ветвей');
        if (f.n !== 8) return fail(`ветвей ${f.n}`);
        for (let i = 0; i + 1 < f.colors.length; i++) if (f.colors[i] === f.colors[i + 1]) return fail(`ветви ${i + 1} и ${i + 2} одного цвета ${f.colors[i]}`);
        if (new Set(f.colors).size !== 8) return fail(`цвета повторяются: ${f.colors.join(' ')}`);
        const ticks = Object.keys(f.ticks);
        if (ticks.length < 4) return fail(`меток ветвей ${ticks.length}`);
        return pass(`цвета ${f.colors.join(' ')}; метки у ${ticks.length} детей`);
      } finally {
        await q.close();
      }
    },
  },
  {
    n: 563,
    title: 'Решение 69: след Измаила на небе — цветом его ветви (ночью и днём), до выбора Авраама — без цвета',
    run: async (p) => {
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        const q = await tab(p, '#/avraam~y-1950~w500~l0~s1', { theme });
        try {
          const f = await frame(q);
          if (!f) return fail(`${theme}: нет замера ветвей`);
          const color = f.colors[f.gen.izmail?.[0] ?? -1];
          if (!color) return fail(`${theme}: Измаила нет среди нарисованных цветом`);
          const hits = await near(q, 'izmail', color);
          if (!(hits >= 20)) return fail(`${theme}: у следа Измаила пикселей цвета ${color} — ${hits}`);
          out.push(`${theme}: ${hits} px цвета ${color}`);
          // без выбранного лица — ни цвета, ни замера
          await q.goto(q.url().replace(/#.*$/, '') + '#/~y-1950~w500~l0~s1');
          await q.waitForTimeout(2200);
          if (await frame(q)) return fail(`${theme}: без выбранного лица замер ветвей остался`);
          const after = await near(q, 'izmail', color);
          if (after >= hits / 3) return fail(`${theme}: без выбора у следа Измаила ещё ${after} px цвета ветви`);
        } finally {
          await q.close();
        }
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 564,
    title: 'Решение 69: цвет бледнеет с поколениями — Исав (2-е поколение от Авраама) и Рувим (3-е) в ветви Сарры, след Рувима бледнее',
    run: async (p) => {
      const q = await tab(p, '#/avraam~y-1900~w400~l0~s1');
      try {
        const f = await frame(q);
        if (!f) return fail('нет замера ветвей');
        const ge = f.gen.isav;
        const gr = f.gen.ruvim;
        if (!ge || !gr || ge[0] !== gr[0]) return fail(`Исав ${ge}, Рувим ${gr}: не одна ветвь`);
        if (!(ge[1] === 2 && gr[1] === 3)) return fail(`поколения Исава ${ge[1]} и Рувима ${gr[1]}`);
        const color = f.colors[ge[0]];
        // доля цвета ветви в пикселях следа (над цветом неба): медиана по пикселям, похожим на цвет ветви
        const share = (id: string) =>
          star(q, id).then((s) =>
            s
              ? q.evaluate(
                  ({ s, c }) => {
                    const cv = document.querySelector('.sky > canvas') as HTMLCanvasElement;
                    const k = cv.width / cv.getBoundingClientRect().width;
                    const sky = getComputedStyle(document.documentElement).getPropertyValue('--sky').trim();
                    const g = [1, 3, 5].map((i) => parseInt(sky.slice(i, i + 2), 16));
                    const u = c.map((x, j) => x - g[j]);
                    const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
                    const d = cv.getContext('2d')!.getImageData(Math.round((s.x + 8) * k), Math.round(s.y * k), Math.round(300 * k), 1).data;
                    const ts: number[] = [];
                    for (let i = 0; i < d.length; i += 4) {
                      const v = [d[i] - g[0], d[i + 1] - g[1], d[i + 2] - g[2]];
                      const t = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / uu;
                      const res = Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2] - t * u[2]);
                      if (t > 0.1 && res < 0.2 * Math.sqrt(uu) * t + 10) ts.push(t);
                    }
                    ts.sort((a, b) => a - b);
                    return ts.length >= 8 ? ts[Math.floor(ts.length / 2)] : -ts.length;
                  },
                  { s, c: hex(color) },
                )
              : -100,
          );
        const a = await share('isav');
        const b = await share('ruvim');
        if (!(a > 0 && b > 0)) return fail(`нет следов цвета ветви: Исав ${a}, Рувим ${b}`);
        if (!(b < a - 0.05)) return fail(`Рувим (3-е поколение) не бледнее Исава (2-е): ${b.toFixed(2)} и ${a.toFixed(2)}`);
        return pass(`доля цвета ветви у следа: Исав ${a.toFixed(2)}, Рувим ${b.toFixed(2)}`);
      } finally {
        await q.close();
      }
    },
  },
];
