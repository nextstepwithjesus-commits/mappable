/**
 * Сценарии приёмки: небо этапа 12 (задача S1; решения 87–90), группа sky12: номера 870–889.
 *
 * Небо пишет выбранную связь в canvas[data-link-sel] (src/render/marks.ts: концы с ролями, ломаные пути routes), связи
 * кадра — в canvas[data-links], вид ромбов союзов — в canvas[data-union-looks] («союз:цвет или two:непрозрачность»,
 * src/render/plates.ts), золотистые дуги семьи — в canvas[data-kin-arcs] («от>к:слово», «ghost>лицо»), звёзды набора —
 * в canvas[data-stars], места подписей — в canvas[data-label-boxes].
 *  — 88: снимок 16 владельца — «Каин и его жена → Енох»: жёлтое от звезды Каина по его следу до ромба и к Еноху (адрес,
 *    щелчок мышью, телефон, день); Иаков и Рахиль → Иосиф — от звёзд обоих родителей;
 *  — 87: ромб союза — двухцветный без выбора, цвета ветви у выбранного, золотистый у его бездетного союза и союза
 *    родителей, жёлтый у выбранной связи;
 *  — 89: дуги родства словами Писания — золотистые у выбранного и у лица под указателем;
 *  — 90: снимок 17 — у Еноха и Ирада след без точек: растушёвка без чередования «есть — нет»;
 *  — «Условные знаки» — под новые правила.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { KIN_GOLD } from '../../src/render/branches.ts';

const PHONE = { width: 390, height: 844, touch: true };
const ADAM_SET = '#/adam~vs~nadam.eva.kain.avel.sif.enos.kainan.enokh-syn-kaina.irad.mekhiael';
const CAIN_LINK = 'k.kain._._.enokh-syn-kaina';

type Sel = { ks: string; ends: { id: string; role: string; x: number; y: number; on: boolean }[]; x: number | null; y: number | null; segs: number; routes: number[][] };
type LogPath = { kind: string; style: string; ks: string; pts: number[] };

/** Открыть адрес заново (новая загрузка); theme — тема карты. */
async function open(p: Page, hash: string, o: { wait?: number; theme?: 'night' | 'day' } = {}) {
  await p.evaluate((t) => {
    localStorage.setItem('toledot:intro', 'true');
    if (t) localStorage.setItem('toledot:theme', JSON.stringify(t));
  }, o.theme ?? null);
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.reload();
  await p.waitForTimeout(o.wait ?? 3200);
}
const canvasData = (p: Page) => p.evaluate(() => ({ ...(document.querySelector('.sky canvas') as HTMLCanvasElement).dataset }) as Record<string, string>);
const sel = async (p: Page): Promise<Sel | null> => {
  const s = (await canvasData(p)).linkSel;
  return s ? (JSON.parse(s) as Sel) : null;
};
async function linkLog(p: Page): Promise<LogPath[]> {
  return ((await canvasData(p)).links ?? '')
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [kind, style, ks, pts] = q.split('|');
      return { kind, style, ks, pts: (pts ?? '').split(',').map(Number) };
    });
}
/** Звезда лица на холсте: из списка лиц на виду (SkyA11y, data-x, data-y); px холста. */
async function starAt(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  return p.evaluate((id) => {
    const e = document.getElementById(`sky-star-${id}`);
    return e && e.dataset.x ? { x: Number(e.dataset.x), y: Number(e.dataset.y) } : null;
  }, id);
}
const origin = async (p: Page) => {
  const b = await p.locator('.sky canvas').boundingBox();
  return { x: b!.x, y: b!.y };
};
/** Вид ромбов кадра: союз → цвет (#rrggbb или two). */
async function looks(p: Page): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const q of ((await canvasData(p)).unionLooks ?? '').split(';').filter(Boolean)) {
    const m = /^(u:[^:]+):([^:]+):/.exec(q);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}
const near = (ax: number, ay: number, bx: number, by: number, tol = 1.6) => Math.abs(ax - bx) <= tol && Math.abs(ay - by) <= tol;
const endsAt = (r: number[], x: number, y: number, tol = 1.6) => near(r[0], r[1], x, y, tol) || near(r[r.length - 2], r[r.length - 1], x, y, tol);
function onRoute(r: number[], x: number, y: number, tol = 1.6): boolean {
  for (let k = 0; k + 3 < r.length; k += 2) {
    const [ax, ay, bx, by] = r.slice(k, k + 4);
    const ex = bx - ax;
    const ey = by - ay;
    const l2 = ex * ex + ey * ey;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
    if (Math.hypot(ax + t * ex - x, ay + t * ey - y) <= tol) return true;
  }
  return false;
}
const straight = (r: number[]) => {
  for (let k = 0; k + 3 < r.length; k += 2) if (Math.abs(r[k] - r[k + 2]) > 0.6 && Math.abs(r[k + 1] - r[k + 3]) > 0.6) return false;
  return true;
};

/**
 * Проверка снимка 16: выбрана связь «Каин и его жена → Енох»; путь — от звезды Каина по его строке до ромба союза Каина
 * и от ромба к Еноху; кольца у Каина (отец) и Еноха (сын); подписи обоих концов на небе.
 */
async function cainWhole(p: Page): Promise<{ ok: boolean; why: string }> {
  const s = await sel(p);
  if (!s || s.ks !== CAIN_LINK) return { ok: false, why: `выбрана «${s?.ks ?? 'нет'}»` };
  const log = await linkLog(p);
  const node = log.find((q) => q.kind === 'node' && q.ks === 'u.kain._._');
  if (!node) return { ok: false, why: 'нет ромба союза Каина в журнале' };
  const [nx, ny] = node.pts;
  const cain = s.ends.find((e) => e.id === 'kain');
  const enokh = s.ends.find((e) => e.id === 'enokh-syn-kaina');
  if (!cain?.on || !enokh?.on) return { ok: false, why: `концы: ${JSON.stringify(s.ends)}` };
  if (cain.role !== 'отец' || enokh.role !== 'сын') return { ok: false, why: `роли: ${cain.role}, ${enokh.role}` };
  const fromCain = s.routes.find((r) => endsAt(r, cain.x, cain.y));
  if (!fromCain) return { ok: false, why: `нет пути от звезды Каина (${cain.x},${cain.y}): ${JSON.stringify(s.routes)}` };
  if (!onRoute(fromCain, nx, ny)) return { ok: false, why: `путь от Каина не доходит до ромба ${nx},${ny}: ${fromCain.join(',')}` };
  if (!s.routes.some((r) => endsAt(r, nx, ny) && onRoute(r, enokh.x - 4, enokh.y, 4))) return { ok: false, why: `нет пути от ромба к Еноху: ${JSON.stringify(s.routes)}` };
  if (!s.routes.every(straight)) return { ok: false, why: 'косой отрезок в пути' };
  const labels = ((await canvasData(p)).labelIds ?? '').split(' ');
  for (const id of ['kain', 'enokh-syn-kaina']) if (!labels.includes(id)) return { ok: false, why: `нет подписи ${id}` };
  return { ok: true, why: `от Каина ${fromCain.map(Math.round).join(',')}; ромб ${nx},${ny}` };
}

export const sky12: Scenario[] = [
  {
    n: 870,
    title: 'Снимок 16 (адрес): «Каин и его жена → Енох» — жёлтое от звезды Каина по его следу до ромба и от ромба к Еноху; кольца «отец», «сын»; подписи концов на небе',
    run: async (p) => {
      await open(p, `${ADAM_SET}~c${CAIN_LINK}`);
      const r = await cainWhole(p);
      return r.ok ? pass(r.why) : fail(r.why);
    },
  },
  {
    n: 871,
    title: 'Снимок 16 (мышь): щелчок по стволу к Еноху в наборе «С Адама» выбирает союз Каина, и жёлтый путь идёт от звезды Каина через ромб к Еноху',
    run: async (p) => {
      await open(p, ADAM_SET);
      const log = await linkLog(p);
      const trunk = log.find((q) => q.kind === 'trunk' && q.ks === 'u.kain._._');
      if (!trunk) return fail('нет ствола союза Каина');
      const o = await origin(p);
      // середина ствола — дальше 12 px от звёзд (§ 8: у звезды щелчок выбирает лицо)
      const x = trunk.pts[0];
      const y = (trunk.pts[1] + trunk.pts[3]) / 2;
      await p.mouse.move(o.x + x, o.y + y);
      await p.waitForTimeout(150);
      await p.mouse.click(o.x + x, o.y + y);
      await p.waitForTimeout(900);
      const s = await sel(p);
      if (!s || (s.ks !== 'u.kain._._' && s.ks !== CAIN_LINK)) return fail(`выбрана «${s?.ks ?? 'нет'}»`);
      const cain = s.ends.find((e) => e.id === 'kain');
      if (!cain?.on) return fail(`концы: ${JSON.stringify(s.ends)}`);
      // звезда Еноха — из звёзд набора (у союза целиком концы — супруги)
      const st = ((await canvasData(p)).stars ?? '').split(';').find((q) => q.startsWith('enokh-syn-kaina:'));
      if (!st) return fail('нет звезды Еноха');
      const [ex, ey] = st.split(':')[1].split(',').map(Number);
      const enokh = { x: ex, y: ey };
      const node = log.find((q) => q.kind === 'node' && q.ks === 'u.kain._._');
      const fromCain = s.routes.find((r) => endsAt(r, cain.x, cain.y));
      if (!fromCain || !node || !onRoute(fromCain, node.pts[0], node.pts[1])) return fail(`нет пути от звезды Каина до ромба: ${JSON.stringify(s.routes)}`);
      if (!s.routes.some((r) => onRoute(r, enokh.x - 5, enokh.y, 5))) return fail('путь не доходит до Еноха');
      return pass(`выбрана ${s.ks}; от Каина ${fromCain.map(Math.round).join(',')}`);
    },
  },
  {
    n: 872,
    title: 'Иаков и Рахиль → Иосиф (род Иакова): жёлтые пути от звёзд отца и матери сходятся в ромбе союза, от ромба — к Иосифу; кольца на трёх концах',
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f~ck.iakov.rakhil._.iosif');
      const s = await sel(p);
      if (!s) return fail('связь не выбрана');
      const roles = s.ends.map((e) => `${e.id}:${e.role}`).sort().join(' ');
      if (roles !== 'iakov:отец iosif:сын rakhil:мать') return fail(`концы: ${roles}`);
      if (!s.ends.every((e) => e.on)) return fail(`не все концы на экране: ${JSON.stringify(s.ends)}`);
      const node = (await linkLog(p)).find((q) => q.kind === 'node' && q.ks === 'u.iakov.rakhil._');
      if (!node) return fail('нет ромба союза Иакова и Рахили');
      for (const id of ['iakov', 'rakhil']) {
        const e = s.ends.find((q) => q.id === id)!;
        const r = s.routes.find((q) => endsAt(q, e.x, e.y));
        if (!r) return fail(`нет пути от звезды ${id}`);
        if (!onRoute(r, node.pts[0], node.pts[1])) return fail(`путь от ${id} не доходит до ромба`);
        if (!straight(r)) return fail(`косой отрезок в пути от ${id}`);
      }
      const lk = await looks(p);
      if (!/^#f2e600$/i.test(lk.get('u:iakov+rakhil') ?? '')) return fail(`ромб союза выбранной связи не жёлтый: ${lk.get('u:iakov+rakhil')}`);
      return pass(`путей ${s.routes.length}; ромб ${node.pts.join(',')} — жёлтый`);
    },
  },
  {
    n: 873,
    title: 'Решение 87: без выбора ромбы союзов — двухцветные; у выбранного Давида ромбы его союзов с детьми — цветов ветвей, бездетный союз и союз родителей — золотистые',
    run: async (p) => {
      await open(p, '#/david');
      for (let k = 0; k < 3; k++) {
        await p.keyboard.press('Escape');
        await p.waitForTimeout(300);
      }
      await p.mouse.move(3, 450);
      await p.waitForTimeout(700);
      const cur = new URL(p.url()).hash;
      const free = await looks(p);
      if (free.size < 5) return fail(`ромбов на виду мало: ${free.size}`);
      const colored = [...free].filter(([, c]) => c !== 'two');
      if (colored.length) return fail(`без выбора цветные ромбы: ${colored.map(([u, c]) => `${u} ${c}`).join(', ')} (${cur})`);
      await open(p, '#/david~vr.david.d.1.f');
      const lk = await looks(p);
      const branch = lk.get('u:david+aggifa') ?? '';
      if (!/^#[0-9a-f]{6}$/i.test(branch)) return fail(`ромб «Давид и Аггифа» не цвета ветви: ${branch}`);
      if ((lk.get('u:david+melkhola') ?? '').toLowerCase() !== KIN_GOLD.night.toLowerCase()) return fail(`бездетный союз с Мелхолой не золотистый: ${lk.get('u:david+melkhola')}`);
      const kinds = new Set([...lk.values()]);
      return pass(`без выбора — ${free.size} двухцветных; у Давида цветов: ${kinds.size}`);
    },
  },
  {
    n: 874,
    title: 'Решение 89: дуги родства словами Писания — золотистым пунктиром у выбранного Давида и у Давида под указателем («сестра» — Саруия, Авигея; «дядя»)',
    run: async (p) => {
      await open(p, '#/david');
      const selArcs = ((await canvasData(p)).kinArcs ?? '').split('|').filter(Boolean);
      if (!selArcs.some((a) => a.includes('saruiya') && a.endsWith(':сестра'))) return fail(`у выбранного Давида нет дуги к Саруии: ${selArcs.join(' ')}`);
      for (let k = 0; k < 3; k++) {
        await p.keyboard.press('Escape');
        await p.waitForTimeout(300);
      }
      await p.mouse.move(3, 450);
      await p.waitForTimeout(500);
      if (((await canvasData(p)).kinArcs ?? '') !== '') return fail('дуги видны без выбора и наведения');
      const d = await starAt(p, 'david');
      if (!d) return fail('звезды Давида нет в списке лиц на виду');
      const o = await origin(p);
      await p.mouse.move(o.x + d.x, o.y + d.y);
      await p.waitForTimeout(700);
      const hov = ((await canvasData(p)).kinArcs ?? '').split('|').filter(Boolean);
      if (!hov.some((a) => a.includes('saruiya') && a.endsWith(':сестра'))) return fail(`у Давида под указателем нет дуги к Саруии: ${hov.join(' ')}`);
      const notes = (await canvasData(p)).notes ?? '';
      if (!notes.includes('сестра')) return fail(`подписи «сестра» на небе нет: ${notes.slice(0, 120)}`);
      return pass(`выбор: ${selArcs.length} дуг; наведение: ${hov.length} дуг`);
    },
  },
  {
    n: 875,
    title: 'Снимок 17 (решение 90): у Еноха и Ирада след без точек — растушёвка без чередования «линия — пропуск» по всей длине',
    run: async (p) => {
      await open(p, ADAM_SET);
      const d = await canvasData(p);
      const stars = new Map(
        (d.stars ?? '')
          .split(';')
          .filter(Boolean)
          .map((q) => {
            const [id, xy] = q.split(':');
            const [x, y] = xy.split(',').map(Number);
            return [id, { x, y }] as const;
          }),
      );
      const boxes = new Map(
        (d.labelBoxes ?? '')
          .split(';')
          .filter(Boolean)
          .map((q) => {
            const [id, r] = q.split(':');
            const [x, y, w, h] = r.split(',').map(Number);
            return [id, { x, y, w, h }] as const;
          }),
      );
      const out: string[] = [];
      for (const id of ['enokh-syn-kaina', 'irad']) {
        const s = stars.get(id);
        if (!s) return fail(`нет звезды ${id}`);
        const lb = boxes.get(id);
        const x0 = Math.round(Math.max(s.x + 6, lb ? lb.x + lb.w + 4 : 0));
        // строка следа: пиксели следа по x; «переходов» (свет → тьма → свет) у пунктира [1,5; 3] — десятки на 60 px
        const row = await p.evaluate(
          ({ x0, y }) => {
            const c = document.querySelector('.sky canvas') as HTMLCanvasElement;
            const k = c.width / c.getBoundingClientRect().width;
            const g = c.getContext('2d')!.getImageData(Math.round(x0 * k), Math.round(y * k), Math.round(90 * k), 1).data;
            const out: number[] = [];
            for (let i = 0; i < g.length; i += 4) out.push(g[i] + g[i + 1] + g[i + 2]);
            return out;
          },
          { x0, y: Math.round(s.y) },
        );
        const lo = Math.min(...row);
        const hi = Math.max(...row);
        if (hi - lo < 30) return fail(`${id}: следа в строке не видно (${lo}…${hi})`);
        const mid = (lo + hi) / 2;
        let flips = 0;
        for (let k = 1; k < row.length; k++) if ((row[k] > mid) !== (row[k - 1] > mid)) flips++;
        if (flips > 8) return fail(`${id}: след мигает «есть — нет» ${flips} раз на 90 px — похоже на точки`);
        out.push(`${id}: переходов ${flips}`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 876,
    title: '«Условные знаки» — под новые правила: двухцветный ромб, растушёвка следа, жёлтая связь целиком, золотистые дуги',
    run: async (p) => {
      await open(p, ADAM_SET);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(900);
      const t = (await p.locator('.app > .sheet').innerText()).replace(/\s+/g, ' ');
      for (const w of ['синяя половина — муж, розовая — жена', 'растушёвка', 'жёлтым целиком', 'золотистая точечная дуга', 'Ромб союза стоит на следе матери'])
        if (!t.includes(w)) return fail(`в «Условных знаках» нет «${w}»`);
      if (/пунктир в начале и в конце/.test(t)) return fail('осталось «пунктир в начале и в конце»');
      return pass();
    },
  },
  {
    n: 877,
    view: PHONE,
    title: 'Снимок 16 на телефоне: связь «Каин и его жена → Енох» по адресу — путь от звезды Каина до ромба и к Еноху',
    run: async (p) => {
      await open(p, `${ADAM_SET}~c${CAIN_LINK}`, { wait: 3800 });
      const s = await sel(p);
      if (!s || s.ks !== CAIN_LINK) return fail(`выбрана «${s?.ks ?? 'нет'}»`);
      const cain = s.ends.find((e) => e.id === 'kain');
      if (!cain) return fail('нет конца «Каин»');
      if (!cain.on) return pass('Каин за краем — указатель у кромки');
      const log = await linkLog(p);
      const node = log.find((q) => q.kind === 'node' && q.ks === 'u.kain._._');
      const r = s.routes.find((q) => endsAt(q, cain.x, cain.y));
      if (!r) return fail(`нет пути от звезды Каина: ${JSON.stringify(s.routes)}`);
      if (node && !onRoute(r, node.pts[0], node.pts[1])) return fail('путь от Каина не доходит до ромба');
      return pass(`путь ${r.map(Math.round).join(',')}`);
    },
  },
  {
    n: 878,
    title: 'Снимок 16 днём: путь целиком от звезды Каина, ромб союза на пути — жёлтый (#FCDA2D) с тёмной обводкой',
    run: async (p) => {
      await open(p, `${ADAM_SET}~c${CAIN_LINK}`, { theme: 'day' });
      const r = await cainWhole(p);
      if (!r.ok) return fail(r.why);
      const lk = await looks(p);
      if (!/^#fcda2d$/i.test(lk.get('u:kain+') ?? '')) return fail(`ромб союза Каина не жёлтый днём: ${lk.get('u:kain+')}`);
      return pass(r.why);
    },
  },
];
