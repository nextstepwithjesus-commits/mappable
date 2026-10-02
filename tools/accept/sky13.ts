/**
 * Сценарии приёмки этапа 13, T1 «Небо» (docs/ui-review/STAGE13.md, решения 93, 94, 95, часть 112; X3 § 3), группа
 * sky13: номера 910–939.
 *  — 910 снимок 20 заново: жёлтое не начинается у Давида; призрак «Илий, отец — вне показа»; щелчок по призраку —
 *    Илий временным гостем (адрес «~g»);
 *  — 911 «ключевые лица»: пропуски лент — разрывы «+N» с верным числом, точек нет;
 *  — 912 щелчок по ленте Давид … Мария — связь «цепочка» (ключ g.m.david.mariya), жёлтое по ленте;
 *  — 913 щелчок по «+40» — показ «Родословие Иисуса Христа (Мф 1, Лк 3)»;
 *  — 914 «Саруия — сестра Давида»: жёлтое по дуге, а не косым отрезком;
 *  — 915 «всё небо», Халев: дети по матерям подряд;
 *  — 916 «Условные знаки»: раздел «Линии карты», словарь начертаний;
 *  — 917 телефон 390: снимок 20 касанием — призрак с подписью, поле касания не меньше 44 × 44;
 *  — 918 «только линии», клавиатура (решение 116): Tab по точкам сравнения — у каждой на небе подпись в рамке и кольцо у
 *    точки; Enter открывает синопсис участка.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { open, starPt, state } from './unify11.ts';

const flat = (s: string) => s.replace(/[  ⁠]/g, ' ').replace(/\s+/g, ' ').trim();
const PHONE = { width: 390, height: 844, touch: true };

type Sel = {
  ks: string;
  ends: { id: string; role: string; x: number; y: number; on: boolean }[];
  ghosts: { id: string; role: string; why: string; x: number; y: number; w: number; h: number; cx: number; cy: number }[];
  routes: number[][];
};
/** Выбранная связь последнего кадра (canvas[data-link-sel], src/render/marks.ts, drawSelectedLink). */
async function linkSel(p: Page): Promise<Sel | null> {
  const raw = (await p.locator('.sky canvas').getAttribute('data-link-sel')) ?? '';
  return raw ? (JSON.parse(raw) as Sel) : null;
}
/** Разрывы лент кадра (canvas[data-gaps]): «от>до:N@x,y». */
async function gaps(p: Page): Promise<{ from: string; to: string; n: number; x: number; y: number }[]> {
  const raw = (await p.locator('.sky canvas').getAttribute('data-gaps')) ?? '';
  return raw
    .split('|')
    .filter(Boolean)
    .map((q) => /^(.+)>(.+):(\d+)@(-?\d+),(-?\d+)$/.exec(q))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ from: m[1], to: m[2], n: +m[3], x: +m[4], y: +m[5] }));
}
const canvasBox = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;
/** Звезда лица на холсте (px холста) из canvas[data-stars]. */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  const q = await starPt(p, id);
  if (!q) return null;
  const c = await canvasBox(p);
  return { x: q.x - c.x, y: q.y - c.y };
}

export const sky13: Scenario[] = [
  {
    n: 910,
    title: 'Снимок 20 заново (решение 93, К1–К3): «ключевые лица», связь Илий — Мария — жёлтое не у Давида, призрак Илия «вне показа», щелчок — Илий гостем',
    run: async (p) => {
      await open(p, '#/mariya~vk~mmt-short~cr.m.mariya', { start: 'key', ms: 3600 });
      const sel = await linkSel(p);
      if (!sel || sel.ks !== 'r.m.mariya') return fail(`выбранная связь: ${sel?.ks ?? 'нет'}`);
      const g = sel.ghosts.find((q) => q.id === 'iliy-otets-marii');
      if (!g) return fail(`призрака Илия нет: ${JSON.stringify(sel.ghosts)}`);
      if (g.why !== 'show' || g.role !== 'отец') return fail(`призрак: ${g.role}, ${g.why}`);
      const david = await starAt(p, 'david');
      const ends = sel.routes.flatMap((r) => [
        [r[0], r[1]],
        [r[r.length - 2], r[r.length - 1]],
      ]);
      if (david && ends.some(([x, y]) => Math.hypot(x - david.x, y - david.y) < 8)) return fail('жёлтое кончается у звезды Давида');
      const far = ends.every(([x, y]) => Math.hypot(x - g.cx, y - g.cy) < 2 || sel.ends.some((e) => Math.hypot(x - e.x, y - e.y) < 12));
      if (!far) return fail(`концы жёлтого не у концов связи: ${JSON.stringify(ends)}`);
      // щелчок — по кольцу призрака (его подпись может уйти под карточку связи)
      const c = await canvasBox(p);
      await p.mouse.click(c.x + g.cx, c.y + g.cy);
      await p.waitForTimeout(1500);
      if (!/~g[a-z0-9.-]*iliy-otets-marii/.test(p.url())) return fail(`после щелчка по призраку адрес без гостя: ${p.url()}`);
      const after = await linkSel(p);
      if (after?.ghosts.some((q) => q.id === 'iliy-otets-marii')) return fail('Илий остался призраком после «показать»');
      return pass(`призрак «Илий, ${g.role} — вне показа» у (${Math.round(g.cx)}, ${Math.round(g.cy)}); жёлтое — ${sel.routes.length} ломаных; Илий — гость`);
    },
  },
  {
    n: 911,
    title: '«Ключевые лица» (К4, решение 94): пропуски поколений на лентах — разрывы «+N» с числом скрытых; разреженной нити у пропусков нет',
    run: async (p) => {
      await open(p, '#/~vk', { start: 'key', ms: 3600 });
      const gs = await gaps(p);
      if (gs.length < 8) return fail(`разрывов «+N» мало: ${gs.length}`);
      const dm = gs.find((q) => q.from === 'david' && q.to === 'mariya');
      if (!dm || dm.n < 30) return fail(`разрыв Давид … Мария: ${JSON.stringify(dm)}`);
      return pass(`разрывов ${gs.length}: ${gs.map((q) => `${q.from}…${q.to} +${q.n}`).slice(0, 6).join(', ')}`);
    },
  },
  {
    n: 912,
    title: 'Щелчок по ленте между Давидом и Марией в «ключевых лицах» — связь «цепочка» (g.m.david.mariya), жёлтое по ленте от Давида до Марии',
    run: async (p) => {
      await open(p, '#/david~vk', { start: 'key', ms: 3600 });
      const g = (await gaps(p)).find((q) => q.from === 'david' && q.to === 'mariya');
      if (!g) return fail('разрыва Давид … Мария нет в окне');
      const david = await starAt(p, 'david');
      if (!david) return fail('Давида нет в окне');
      // точка ленты — между Давидом и знаком «+N», ближе к знаку: вдоль пути ленты у разрыва
      const c = await canvasBox(p);
      const tries = [0.75, 0.6, 0.85, 0.5].map((f) => ({ x: david.x + (g.x - david.x) * f, y: david.y + (g.y - david.y) * f }));
      for (const t of tries)
        for (const dy of [0, -3, 3, -6, 6]) {
          await p.mouse.click(c.x + t.x, c.y + t.y + dy);
          await p.waitForTimeout(700);
          const sel = await linkSel(p);
          if (sel?.ks === 'g.m.david.mariya') {
            const st = await state(p);
            return pass(`связь ${sel.ks}; адрес ${st.link || p.url().split('~c')[1] || ''}; жёлтое — ${sel.routes.length} ломаных`);
          }
        }
      return fail(`щелчок по ленте не выбрал цепочку: ${(await linkSel(p))?.ks ?? 'ничего'}`);
    },
  },
  {
    n: 913,
    title: 'Щелчок по «+40» в «ключевых лицах» — показ «Родословие Иисуса Христа (Мф 1, Лк 3)» (тот же глагол, что у «+N» свёрнутого союза)',
    run: async (p) => {
      await open(p, '#/david~vk', { start: 'key', ms: 3600 });
      const g = (await gaps(p)).find((q) => q.from === 'david' && q.to === 'mariya');
      if (!g) return fail('разрыва Давид … Мария нет в окне');
      const c = await canvasBox(p);
      await p.mouse.click(c.x + g.x, c.y + g.y);
      await p.waitForTimeout(2500);
      const st = await state(p);
      // ключ показа «линии Мессии» — «l» (src/ui/work.ts, showKey)
      if (st.show !== 'l') return fail(`показ после щелчка: ${st.show}`);
      return pass(`показ: ${st.show}`);
    },
  },
  {
    n: 914,
    title: '«Саруия — сестра Давида» (К5, решение 94): выбранная дуга родства — жёлтое по дуге, а не косым отрезком',
    run: async (p) => {
      for (const key of ['n.saruiya.david', 'n.david.saruiya']) {
        await open(p, `#/david~c${key}`, { start: 'all', ms: 3600 });
        const sel = await linkSel(p);
        if (!sel || !sel.ks.startsWith('n.')) continue;
        const r = sel.routes[0];
        if (!r) return fail('пути нет');
        if (r.length <= 4) return fail(`жёлтое — отрезок: ${JSON.stringify(r)}`);
        // дуга: середина ломаной отстоит от хорды
        const k = 2 * Math.floor(r.length / 4);
        const [ax, ay, bx, by] = [r[0], r[1], r[r.length - 2], r[r.length - 1]];
        const d = Math.abs((by - ay) * r[k] - (bx - ax) * r[k + 1] + bx * ay - by * ax) / (Math.hypot(bx - ax, by - ay) || 1);
        if (d < 3) return fail(`жёлтое не изогнуто: ${d.toFixed(1)} px от хорды`);
        return pass(`${sel.ks}: дуга из ${r.length / 2} точек, изгиб ${d.toFixed(0)} px`);
      }
      return fail('связь «Саруия — сестра Давида» не выбрана адресом');
    },
  },
  {
    n: 915,
    title: '«Всё небо», Халев, сын Есрома (решение 95): дети по матерям подряд — у каждой матери её дети стоят одной группой строк',
    run: async (p) => {
      await open(p, '#/khalev-syn-esroma', { start: 'all', ms: 3600 });
      const groups: Record<string, string[]> = {
        efa: ['kharan-syn-khaleva', 'motsa-syn-khaleva', 'gazez-syn-khaleva'],
        maakha: ['shever', 'firkhana', 'shaaf-syn-khaleva', 'sheva-syn-khaleva'],
      };
      // строки детей — по подписям имён кадра (canvas[data-label-boxes] «id:x,y,w,h»): мелкие звёзды в списке неба
      // не значатся, а подпись стоит в строке своей звезды
      const childRows = async () => {
        const raw = (await p.locator('.sky canvas').getAttribute('data-label-boxes')) ?? '';
        const at = new Map(
          raw
            .split(';')
            .filter(Boolean)
            .map((q) => {
              const i = q.lastIndexOf(':');
              const [, y, , h] = q.slice(i + 1).split(',').map(Number);
              return [q.slice(0, i), y + h / 2] as const;
            }),
        );
        const out: { id: string; g: string; y: number }[] = [];
        for (const [g, ids] of Object.entries(groups))
          for (const id of ids) {
            const y = at.get(id);
            if (y !== undefined) out.push({ id, g, y });
          }
        return out;
      };
      // этап 15 («Отчий дом», решение 173): Халев рождается в доме Есрома и переходит в свой дом — его жёны и дети
      // стоят там, выше его звезды; небо — вниз (перетаскиванием), пока дети не покажутся
      let ys = await childRows();
      const box = (await p.locator('.sky canvas').boundingBox())!;
      // строка дома — по корням черт браков Халева (canvas[data-links], вид bar: первая точка — на его следе)
      const KH = 'khalev-syn-esroma';
      const roots = async () =>
        (((await p.locator('.sky canvas').getAttribute('data-links')) ?? '') as string)
          .split(';')
          .map((q) => q.split('|'))
          .filter((q) => q[0] === 'bar' && q[2]?.startsWith(`s.${KH}.`) && q[2].endsWith(`.${KH}`))
          .map((q) => q[3].split(',').map(Number));
      // небо доезжает по инерции — ждать, пока окно (.sky[data-view]) не встанет
      const settle = async () => {
        let was = '';
        for (let k = 0; k < 25; k++) {
          const now = (await p.locator('.sky').getAttribute('data-view')) ?? '';
          if (now === was) break;
          was = now;
          await p.waitForTimeout(200);
        }
        await p.waitForTimeout(400);
      };
      const drag = async (dy: number) => {
        const step = Math.max(-box.height / 3, Math.min(box.height / 3, dy));
        const x0 = box.x + box.width * 0.85;
        await p.mouse.move(x0, box.y + box.height / 2 - step / 2);
        await p.mouse.down();
        await p.mouse.move(x0, box.y + box.height / 2, { steps: 4 });
        await p.mouse.move(x0, box.y + box.height / 2 + step / 2, { steps: 4 });
        await p.mouse.up();
        await settle();
      };
      if (ys.length < 4) {
        let rs = await roots();
        for (let k = 0; k < 12 && !rs.length; k++) {
          await drag(box.height / 3);
          rs = await roots();
        }
        // дом — к середине неба, затем ближе (колесо у его середины): подписи детей видны на масштабе семьи
        for (let k = 0; k < 6 && rs.length; k++) {
          const dy = box.height / 2 - rs[0][1];
          if (Math.abs(dy) < 40) break;
          await drag(dy);
          rs = await roots();
        }
        for (let k = 0; k < 4 && rs.length && (await childRows()).length < 4; k++) {
          // колесо — у середины корней черт (строка дома), затем строка дома снова к середине неба
          const cx = rs.reduce((a, q) => a + q[0], 0) / rs.length;
          await p.mouse.move(box.x + cx, box.y + rs[0][1]);
          await p.mouse.wheel(0, -240);
          await settle();
          rs = await roots();
          if (rs.length && Math.abs(box.height / 2 - rs[0][1]) > 80) {
            await drag(box.height / 2 - rs[0][1]);
            rs = await roots();
          }
        }
        ys = await childRows();
      }
      if (ys.length < 4) return fail(`детей Халева в окне мало: ${ys.map((q) => q.id).join(', ')}`);
      const order = [...ys].sort((a, b) => a.y - b.y).map((q) => q.g);
      let runs = 1;
      for (let k = 1; k < order.length; k++) if (order[k] !== order[k - 1]) runs++;
      const want = new Set(order).size;
      if (runs > want) return fail(`серии по матерям перемешаны: ${order.join(' ')}`);
      return pass(`по вертикали: ${order.join(' ')}`);
    },
  },
  {
    n: 916,
    title: '«Условные знаки» (решение 94): словарь линий родства — точки только толкование; раздел «Линии карты» после «Линий»',
    run: async (p) => {
      await open(p, '#/david', { start: 'all', ms: 2400 });
      await p.goto(p.url().replace(/#.*$/, '') + '#/david~plegend');
      await p.waitForTimeout(2000);
      const heads = (await p.locator('h3[id^="legend-"]').allInnerTexts()).map(flat);
      const i = heads.indexOf('Линии');
      if (i < 0 || heads[i + 1] !== 'Линии карты') return fail(`разделы: ${heads.join(' | ')}`);
      const t = flat(await p.locator('#legend-lines').locator('xpath=following-sibling::ul[1]').innerText());
      if (!t.includes('точки — только толкование')) return fail('в «Линиях» нет словаря «точки — только толкование»');
      if (!t.includes('«+N»')) return fail('в «Линиях» нет «+N» разрыва ленты');
      return pass(`разделы: ${heads.join(' | ')}`);
    },
  },
  {
    n: 917,
    view: PHONE,
    title: 'Телефон 390: снимок 20 — призрак Илия с подписью, поле касания призрака не меньше 44 × 44',
    run: async (p) => {
      await open(p, '#/mariya~vk~mmt-short~cr.m.mariya', { start: 'key', ms: 3800 });
      const sel = await linkSel(p);
      const g = sel?.ghosts.find((q) => q.id === 'iliy-otets-marii');
      if (!g) return fail(`призрака Илия нет: ${JSON.stringify(sel?.ghosts ?? [])}`);
      if (g.w < 44 - 0.5 || g.h < 44 - 0.5) return fail(`поле касания ${g.w.toFixed(0)} × ${g.h.toFixed(0)}`);
      return pass(`поле касания ${g.w.toFixed(0)} × ${g.h.toFixed(0)}`);
    },
  },
  {
    n: 918,
    title: '«Только линии», клавиатура (решение 116): фокус на точке сравнения виден на небе — подпись в рамке и кольцо у точки; Enter — синопсис участка',
    run: async (p) => {
      await open(p, '#/~vl', { ms: 3600 });
      const list = p.locator('ul[aria-label^="Точки сравнения"] button');
      const n = await list.count();
      if (n < 5) return fail(`кнопок точек сравнения ${n}`);
      const c = await canvasBox(p);
      const seen: string[] = [];
      // первая кнопка — фокусом, дальше — клавишей Tab: каждая остановка видна на небе
      await list.first().focus();
      for (let k = 0; k < n; k++) {
        if (k) await p.keyboard.press('Tab');
        await p.waitForTimeout(900);
        const name = flat((await p.evaluate(() => document.activeElement?.textContent ?? '')) || '');
        const raw = (await p.locator('.sky canvas').getAttribute('data-note-focus')) ?? '';
        const m = /^(.+):(-?\d+),(-?\d+),(\d+),(\d+)@(-?\d+),(-?\d+)$/.exec(raw);
        if (!m) return fail(`фокус на «${name}» не виден на небе: data-note-focus «${raw}»`);
        const [bx, by, bw, bh, px, py] = m.slice(2).map(Number);
        if (bx < 0 || by < 0 || bx + bw > c.width || by + bh > c.height) return fail(`подпись «${name}» за краем неба: ${raw}`);
        if (px < 0 || py < 0 || px > c.width || py > c.height) return fail(`точка «${name}» за краем неба: ${raw}`);
        seen.push(m[1]);
      }
      await p.screenshot({ path: '.ui-shots/t1/after/918-note-focus.png' });
      await list.first().focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      if (!/~psynopsis/.test(p.url()) && !(await p.locator('.synopsis').count())) return fail('Enter не открыл синопсис');
      return pass(`видимый фокус у ${seen.join(', ')}; Enter — синопсис`);
    },
  },
];
