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
/** Нейтральный тон следов и сетки — «Туманность» ТЗ § 5.2: цвет ветви от него должен отличаться. */
const NEBULA = { night: '#8FA2BF', day: '#5A6A84' } as const;
/**
 * Пиксели следа лица id справа от звезды (px холста): сколько из них близки к цвету ветви color — и ближе к нему, чем к
 * нейтральному тону следа (иначе светлый нейтральный след без выбора считался бы «цветом ветви»). Подпись справа от
 * звезды закрывает начало следа — поэтому просматривается полоса от 8 до 320 px, по три строки.
 */
const near = (p: Page, id: string, color: string, theme: 'night' | 'day' = 'night') =>
  star(p, id).then((s) =>
    s
      ? p.evaluate(
          ({ s, id, c, n }) => {
            const cv = document.querySelector('.sky > canvas') as HTMLCanvasElement;
            const k = cv.width / cv.getBoundingClientRect().width;
            const ctx = cv.getContext('2d')!;
            // этап 16, решение 182: основной холст прозрачен, свет — отдельным холстом; пиксель накладывается на цвет неба по
            // своей альфе — то, что прежде давала заливка неба под следом
            const sky = getComputedStyle(document.documentElement).getPropertyValue('--sky').trim();
            const g = [1, 3, 5].map((i) => parseInt(sky.slice(i, i + 2), 16));
            // этап 15 (решение 173): лицо рождается в доме отца у матери и переходом (S-кривая, canvas[data-glides]) уходит
            // в полосу своей жизни — след идёт по строке звезды до перехода, по кривой и дальше по строке жизни
            const gl = (cv.dataset.glides ?? '').split(';').map((q) => q.split(':')).filter((q) => q[0] === id).map((q) => q[1].split(',').map(Number));
            let hits = 0;
            for (let x = s.x + 8; x < s.x + 320; x++) {
              // строка следа в столбце x (без именованных функций: page.evaluate получает текст функции)
              let y = s.y;
              for (const [x0, y0, x1, y1] of gl) {
                if (x <= x0) break;
                const t = Math.min(1, (x - x0) / Math.max(1, x1 - x0));
                y = y0 + (y1 - y0) * t * t * (3 - 2 * t);
              }
              const d = ctx.getImageData(Math.round(x * k), Math.round((y - 1) * k), 1, Math.round(3 * k)).data;
              for (let i = 0; i < d.length; i += 4 * Math.max(1, Math.round(k))) {
                const al = d[i + 3] / 255;
                const px = [0, 1, 2].map((j) => d[i + j] * al + g[j] * (1 - al));
                const dc = Math.abs(px[0] - c[0]) + Math.abs(px[1] - c[1]) + Math.abs(px[2] - c[2]);
                const dn = Math.abs(px[0] - n[0]) + Math.abs(px[1] - n[1]) + Math.abs(px[2] - n[2]);
                if (dc < 90 && dc < dn) hits++;
              }
            }
            return hits;
          },
          { s, id, c: hex(color), n: hex(NEBULA[theme]) },
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
          const hits = await near(q, 'izmail', color, theme);
          if (!(hits >= 20)) return fail(`${theme}: у следа Измаила пикселей цвета ${color} — ${hits}`);
          out.push(`${theme}: ${hits} px цвета ${color}`);
          // без выбранного лица — ни цвета, ни замера
          await q.goto(q.url().replace(/#.*$/, '') + '#/~y-1950~w500~l0~s1');
          await q.waitForTimeout(2200);
          if (await frame(q)) return fail(`${theme}: без выбранного лица замер ветвей остался`);
          const after = await near(q, 'izmail', color, theme);
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
        // доля цвета ветви в пикселях следа (над местной подложкой): медиана по пикселям, похожим на цвет ветви
        const share = (id: string) =>
          star(q, id).then((s) =>
            s
              ? q.evaluate(
                  ({ s, id, c }) => {
                    const cv = document.querySelector('.sky > canvas') as HTMLCanvasElement;
                    const k = cv.width / cv.getBoundingClientRect().width;
                    const ctx = cv.getContext('2d')!;
                    // этап 16, решение 182 (после жалобы на прозрачные окна): свет рисуется в том же холсте неба, под следом —
                    // не ровный цвет неба, а свет и подложки. Доля цвета ветви считается над местной подложкой: она плавная
                    // (растр света в половину разрешения), её цвет в столбце — среднее пикселей на 6 px выше и ниже следа, если
                    // они согласны (иначе там чужой след или подпись, и столбец пропускается). След идёт, как в near(), по строке
                    // звезды до перехода (canvas[data-glides], решение 173) и дальше по строке жизни; столбцы самой кривой
                    // пропускаются — там след крут и строка его не ловит
                    const gl = (cv.dataset.glides ?? '').split(';').map((q) => q.split(':')).filter((q) => q[0] === id).map((q) => q[1].split(',').map(Number));
                    // Строка следа и по строке выше и ниже, по столбцу — наибольшая доля: след в 1–1,5 px ложится между
                    // строками пикселей, и одна строка ловила его край (прежде край дотягивала до порога полоса эпохи под ним)
                    const best = new Map<number, number>();
                    for (let x = s.x + 8; x < s.x + 308; x++) {
                      let y = s.y;
                      let bend = false;
                      for (const [x0, , x1, y1] of gl) {
                        if (x <= x0) break;
                        if (x < x1) bend = true;
                        else y = y1;
                      }
                      if (bend) continue;
                      const up = ctx.getImageData(Math.round(x * k), Math.round((y - 6) * k), 1, 1).data;
                      const dn = ctx.getImageData(Math.round(x * k), Math.round((y + 6) * k), 1, 1).data;
                      if (Math.abs(up[0] - dn[0]) + Math.abs(up[1] - dn[1]) + Math.abs(up[2] - dn[2]) > 18) continue;
                      const g = [0, 1, 2].map((j) => (up[j] + dn[j]) / 2);
                      const u = c.map((v, j) => v - g[j]);
                      const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
                      for (const dy of [-1, 0, 1]) {
                        const d = ctx.getImageData(Math.round(x * k), Math.round(y * k) + dy, 1, 1).data;
                        const v = [d[0] - g[0], d[1] - g[1], d[2] - g[2]];
                        const t = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / uu;
                        const res = Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2] - t * u[2]);
                        if (t > 0.1 && res < 0.2 * Math.sqrt(uu) * t + 10) best.set(x, Math.max(best.get(x) ?? 0, t));
                      }
                    }
                    const ts = [...best.values()];
                    ts.sort((a, b) => a - b);
                    return ts.length >= 8 ? ts[Math.floor(ts.length / 2)] : -ts.length;
                  },
                  { s, id, c: hex(color) },
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
