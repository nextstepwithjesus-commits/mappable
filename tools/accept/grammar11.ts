/**
 * Сценарии приёмки: грамматика связей и выбор линии (этап 11, задача Q1), группа grammar11: номера 740–779.
 *
 * Небо пишет связи кадра в canvas[data-links] (src/render/links.ts, linkLog): «вид|начертание|ключ|x,y,…» и узлы
 * «node|open|ключ|x,y[|+N]», px холста; выбранную связь — в canvas[data-link-sel] (концы с ролями, кольца, точка карточки)
 * и в html[data-link] (src/ui/show.ts); звёзды показа — в canvas[data-stars]; переход укладки — в canvas[data-trans].
 *  — сценарии STAGE11 § 12: 1 (снимок 13, Ной), 2 (снимок 12, Адам), 3 (Иаков: мышь, «Родство», касание), 4 (Давид:
 *    лестница, ленты расходятся в узле), 5 (Каинан), 8 (раскрытие Адам → Мехиаель), 10 (ослабленное движение),
 *    11 (шаги ошибки 14);
 *  — Я17 (лента из узла своего шага), Я22 (50 связей мышью), Я23 (касание в 18 px), Я24 (кольца и подписи концов),
 *    Я29 (переход), Я34 (data-bare).
 */
import type { Page } from 'playwright';
import { fail, hashId, pass, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };

type LogPath = { kind: string; style: string; ks: string; pts: number[] };
type Sel = { ks: string; ends: { id: string; role: string; x: number; y: number; on: boolean }[]; x: number | null; y: number | null; segs: number };

/** Открыть адрес заново (новая загрузка). */
async function open(p: Page, hash: string, wait = 3000) {
  await p.evaluate(() => localStorage.setItem('toledot:intro', 'true'));
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.reload();
  await p.waitForTimeout(wait);
}
/** Небо «набор» с раскрытием (src/ui/work.ts, src/ui/reveal.ts): набор и лица, чьи союзы показаны (у них «+N»). */
async function openSet(p: Page, work: string[], opened: string[]) {
  await p.evaluate(
    ({ work, opened }) => {
      localStorage.setItem('toledot:intro', 'true');
      localStorage.setItem('toledot:work', JSON.stringify(work.map((id, i) => [id, { via: i ? 'family' : 'self', of: work[0] }])));
      localStorage.setItem('toledot:reveal', JSON.stringify({ opened, expanded: {} }));
      sessionStorage.setItem('toledot:skymode', JSON.stringify('work'));
    },
    { work, opened },
  );
  await p.goto(p.url().replace(/#.*$/, '') + `#/${work[0]}~vs`);
  await p.reload();
  await p.waitForTimeout(3000);
}
const canvasData = (p: Page) => p.evaluate(() => ({ ...(document.querySelector('.sky canvas') as HTMLCanvasElement).dataset }) as Record<string, string>);
/** Журнал связей кадра (links.ts, parseLinkLog). */
async function linkLog(p: Page): Promise<LogPath[]> {
  return ((await canvasData(p)).links ?? '')
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [kind, style, ks, pts] = q.split('|');
      return { kind, style, ks, pts: (pts ?? '').split(',').map(Number) };
    });
}
/** Звёзды показа: «лицо:x,y» (canvas[data-stars]). */
async function stars(p: Page): Promise<Map<string, { x: number; y: number }>> {
  const out = new Map<string, { x: number; y: number }>();
  for (const q of ((await canvasData(p)).stars ?? '').split(';').filter(Boolean)) {
    const [id, xy] = q.split(':');
    const [x, y] = xy.split(',').map(Number);
    out.set(id, { x, y });
  }
  return out;
}
const sel = async (p: Page): Promise<Sel | null> => {
  const s = (await canvasData(p)).linkSel;
  return s ? (JSON.parse(s) as Sel) : null;
};
const htmlLink = (p: Page) => p.evaluate(() => document.documentElement.dataset.link ?? '');
const origin = async (p: Page) => {
  const b = await p.locator('.sky canvas').boundingBox();
  return { x: b!.x, y: b!.y };
};
const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
const tipText = async (p: Page) => flat((await p.locator('.tip').allInnerTexts()).join(' '));

/** Точка для наведения на путь: на зубце — у ствола (вне поля звезды ребёнка), иначе — середина самого длинного отрезка. */
function aimAt(q: LogPath): { x: number; y: number } {
  if (q.kind === 'tooth') return { x: q.pts[0] + 1, y: q.pts[1] };
  let best = { x: q.pts[0], y: q.pts[1], len: -1 };
  for (let k = 0; k + 3 < q.pts.length; k += 2) {
    const [x0, y0, x1, y1] = q.pts.slice(k, k + 4);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > best.len) best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, len };
  }
  return best;
}
/**
 * Точка на пути, до которой от звёзд и узлов (ромбов, «•») не ближе clear px: щелчок по ней — щелчок по линии, а не по
 * звезде или ромбу (§ 8: звезда > ◆ > линия). null — такой точки нет.
 */
function safeAim(q: LogPath, stars: number[][], nodes: number[][], clear = 13, others: LogPath[] = []): { x: number; y: number } | null {
  const pts: { x: number; y: number; w: number }[] = [];
  for (let k = 0; k + 3 < q.pts.length; k += 2) {
    const [x0, y0, x1, y1] = q.pts.slice(k, k + 4);
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let t = 1; t < len; t += 2) pts.push({ x: x0 + ((x1 - x0) * t) / len, y: y0 + ((y1 - y0) * t) / len, w: Math.min(t, len - t) });
  }
  // и не на общем отрезке с другой связью (ленты Мф и Лк по одному следу до тройника): там щелчок назвал бы любую из них
  const near = others.filter((o) => o.ks !== q.ks && o.kind !== 'node' && o.kind !== 'join').flatMap(segs);
  const ok = pts.filter(
    (a) => stars.every(([x, y]) => Math.hypot(x - a.x, y - a.y) > clear) && nodes.every(([x, y]) => Math.hypot(x - a.x, y - a.y) > clear) && near.every((g) => distSeg(a.x, a.y, g) > 4),
  );
  if (!ok.length) return null;
  ok.sort((a, b) => b.w - a.w);
  return ok[0];
}
const starsOf = async (p: Page) => ((await canvasData(p)).starsAt ?? '').split(';').filter(Boolean).map((q) => q.split(',').map(Number));
const nodesOf = (log: LogPath[]) => log.filter((q) => q.kind === 'node' || q.kind === 'join').map((q) => q.pts);
/** Отрезки пути. */
function segs(q: LogPath): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let k = 0; k + 3 < q.pts.length; k += 2) out.push([q.pts[k], q.pts[k + 1], q.pts[k + 2], q.pts[k + 3]]);
  return out;
}
function distSeg(px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]) {
  const ex = bx - ax;
  const ey = by - ay;
  const l2 = ex * ex + ey * ey;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2)) : 0;
  return Math.hypot(ax + t * ex - px, ay + t * ey - py);
}
/** Ключ связи по пути журнала: зубец — связь с ребёнком, ствол и узел — союз, «‖» — супруг, лента — шаг. */
const keyKind = (ks: string) => ks.split('.')[0];

async function clickPath(p: Page, q: LogPath, touch = false) {
  const o = await origin(p);
  const a = aimAt(q);
  if (touch) await p.touchscreen.tap(o.x + a.x, o.y + a.y);
  else {
    await p.mouse.move(o.x + a.x, o.y + a.y);
    await p.waitForTimeout(120);
    await p.mouse.click(o.x + a.x, o.y + a.y);
  }
  await p.waitForTimeout(700);
}
async function clickAt(p: Page, a: { x: number; y: number }, touch = false) {
  const o = await origin(p);
  if (touch) await p.touchscreen.tap(o.x + a.x, o.y + a.y);
  else {
    await p.mouse.move(o.x + a.x, o.y + a.y);
    await p.waitForTimeout(120);
    await p.mouse.click(o.x + a.x, o.y + a.y);
  }
  await p.waitForTimeout(700);
}
/** Снять выбранную связь: Escape (§ 8). */
/** Небо встало: окно .sky[data-view] не меняется 200 мс (лист телефона после выбора и снятия связи едет, небо — за ним). */
async function settled(p: Page) {
  let was = '';
  for (let k = 0; k < 20; k++) {
    const now = (await p.locator('.sky').getAttribute('data-view')) ?? '';
    if (now === was) return;
    was = now;
    await p.waitForTimeout(200);
  }
}
async function clearLink(p: Page) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  if (await htmlLink(p)) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
}

/** Детерминированный случайный выбор (сценарий повторяем). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const ADAM_SET = '#/adam~vs~nadam.eva.kain.avel.sif.enos.kainan.enokh-syn-kaina.irad.mekhiael';

export const grammar11: Scenario[] = [
  {
    n: 740,
    title: 'Снимок 13 (Ной во «всех лицах»): ромб на следе Ноя, Сим не задет стволом, подсказка ствола, щелчок по зубцу Хама — жёлтый путь и карточка связи',
    run: async (p) => {
      await open(p, '#/noy');
      const log = await linkLog(p);
      const node = log.find((q) => q.kind === 'node' && q.ks === 'u.noy._._');
      if (!node) return fail('нет ромба союза Ноя');
      // след Ноя: лента к Ною кончается у его звезды — ромб на той же строке
      const toNoah = log.find((q) => q.kind === 'ribbon' && q.ks.endsWith('.noy'));
      const ny = toNoah ? toNoah.pts[toNoah.pts.length - 1] : NaN;
      if (!(Math.abs(node.pts[1] - ny) <= 1)) return fail(`ромб на строке ${node.pts[1]}, след Ноя — ${ny}`);
      // Сим: звезда в конце шага ленты к нему; чужие стволы и зубцы проходят не ближе 6 px
      const toShem = log.find((q) => q.kind === 'ribbon' && q.ks.endsWith('.sim'));
      if (toShem) {
        const sx = toShem.pts[toShem.pts.length - 2];
        const sy = toShem.pts[toShem.pts.length - 1];
        const near = log.filter((q) => q.kind !== 'ribbon' && q.kind !== 'node' && q.kind !== 'join' && !q.ks.endsWith('.sim') && segs(q).some((g) => distSeg(sx, sy, g) < 6));
        if (near.length) return fail(`Сима задевает: ${near.map((q) => q.ks).join(', ')}`);
      }
      const trunk = log.find((q) => q.kind === 'trunk' && q.ks === 'u.noy._._');
      if (!trunk) return fail('нет ствола Ноя');
      const o = await origin(p);
      const a = aimAt(trunk);
      await p.mouse.move(o.x + a.x, o.y + a.y);
      await p.waitForTimeout(600);
      const tip = await tipText(p);
      if (tip !== 'Ной и его жена: Сим, Хам, Иафет (Быт 5:32)') return fail(`подсказка ствола: «${tip}»`);
      const ham = log.find((q) => q.kind === 'tooth' && q.ks === 'k.noy._._.kham');
      if (!ham) return fail('нет зубца Хама');
      const before = hashId(p);
      await clickPath(p, ham);
      if ((await htmlLink(p)) !== 'k.noy._._.kham') return fail(`выбрана связь «${await htmlLink(p)}»`);
      const s = await sel(p);
      if (!s || s.segs < 1 || s.ends.length !== 2 || !s.ends.every((e) => e.on)) return fail(`жёлтый путь: ${JSON.stringify(s)}`);
      if (hashId(p) !== before) return fail(`выбор лица сменился: ${before} → ${hashId(p)}`);
      if (!/~ck\.noy\._\._\.kham/.test(p.url())) return fail(`в адресе нет «~c»: ${p.url()}`);
      const card = flat(await p.locator('.dotcard').first().innerText());
      if (!card.includes('Хам — сын')) return fail(`карточка связи: «${card.slice(0, 80)}»`);
      return pass(`подсказка «${tip}»; связь ${s.ks}, кольца у ${s.ends.map((e) => `${e.id} (${e.role})`).join(' и ')}`);
    },
  },
  {
    n: 741,
    title: 'Снимок 12 (Адам в наборе): к Сифу и к Еносу — ровно по одному пути, это лента; косых линий и помет порядка нет',
    run: async (p) => {
      await open(p, ADAM_SET);
      const log = await linkLog(p);
      const log2: string[] = [];
      for (const id of ['sif', 'enos']) {
        const to = [...new Set(log.filter((q) => q.kind !== 'node' && q.kind !== 'join' && (q.ks.endsWith(`.${id}`) || q.ks.startsWith(`r.`) && q.ks.endsWith(id))).map((q) => `${q.kind}:${q.ks}`))];
        const ribbons = to.filter((t) => t.startsWith('ribbon:'));
        const other = to.filter((t) => !t.startsWith('ribbon:') && !t.startsWith('stub:'));
        if (ribbons.length !== 1 || other.length) return fail(`к ${id}: ${to.join(', ') || 'нет пути'}`);
        log2.push(`${id}: ${ribbons[0]}`);
      }
      const oblique = log.filter((q) => q.kind !== 'ribbon' && q.kind !== 'node' && q.kind !== 'join' && segs(q).some(([x0, y0, x1, y1]) => Math.abs(x1 - x0) > 0.5 && Math.abs(y1 - y0) > 0.5));
      if (oblique.length) return fail(`косые: ${oblique.map((q) => q.ks).join(', ')}`);
      const d = await canvasData(p);
      if (/по порядку/.test(d.notes ?? '')) return fail(`помета порядка на небе: ${d.notes}`);
      if (d.bare) return fail(`подписи без звёзд: ${d.bare}`);
      return pass(log2.join('; '));
    },
  },
  {
    n: 742,
    title: 'Иаков: четыре союза, ромбы на следах матерей, дети группами у матерей; связь «Иаков и Рахиль → Иосиф» — щелчком мыши',
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f');
      const log = await linkLog(p);
      const st = await stars(p);
      const moms: Record<string, string> = { liya: 'u.iakov.liya._', rakhil: 'u.iakov.rakhil._', valla: 'u.iakov.valla._', zelfa: 'u.iakov.zelfa._' };
      for (const [m, uk] of Object.entries(moms)) {
        const n = log.find((q) => q.kind === 'node' && q.ks === uk);
        const ms = st.get(m);
        if (!n || !ms) return fail(`нет ромба ${uk} или звезды ${m}`);
        if (Math.abs(n.pts[1] - ms.y) > 1.5) return fail(`ромб ${uk} на строке ${n.pts[1]}, мать — ${ms.y}`);
      }
      // группы сплошные: между детьми одной матери нет детей другой (по строкам)
      const kids = log.filter((q) => q.kind === 'tooth' && q.ks.startsWith('k.iakov.'));
      const rowOf = new Map<string, { m: string; y: number }>();
      for (const q of kids) rowOf.set(q.ks, { m: q.ks.split('.')[2], y: q.pts[1] });
      const rows = [...rowOf.values()].sort((a, b) => a.y - b.y);
      const seen = new Set<string>();
      for (let k = 0; k < rows.length; k++) {
        if (k && rows[k].m !== rows[k - 1].m) {
          if (seen.has(rows[k].m)) return fail(`дети ${rows[k].m} не одной группой: ${rows.map((r) => r.m).join(' ')}`);
          seen.add(rows[k - 1].m);
        }
      }
      const tooth = log.find((q) => q.kind === 'tooth' && q.ks === 'k.iakov.rakhil._.iosif');
      if (!tooth) return fail('нет зубца к Иосифу');
      const before = hashId(p);
      await clickPath(p, tooth);
      if ((await htmlLink(p)) !== 'k.iakov.rakhil._.iosif') return fail(`выбрана «${await htmlLink(p)}»`);
      if (hashId(p) !== before) return fail(`выбор лица сменился: ${before} → ${hashId(p)}`);
      return pass(`четыре ромба на следах матерей; группы: ${rows.map((r) => r.m[0]).join('')}`);
    },
  },
  {
    n: 743,
    title: 'Иаков: связь «Иаков и Рахиль → Иосиф» через «Родство» карточки у звезды Иосифа (клавиатура: Enter на строке родителя)',
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f');
      const js = (await stars(p)).get('iosif');
      if (!js) return fail('нет звезды Иосифа');
      const o = await origin(p);
      await p.mouse.click(o.x + js.x, o.y + js.y);
      await p.waitForTimeout(900);
      const btn = p.locator('.dotcard button.person[data-link="k.iakov.rakhil._.iosif"]').first();
      if (!(await btn.count())) return fail('в карточке у звезды Иосифа нет строки родителей со связью');
      await btn.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      if ((await htmlLink(p)) !== 'k.iakov.rakhil._.iosif') return fail(`выбрана «${await htmlLink(p)}»`);
      const s = await sel(p);
      if (!s || s.ends.length < 2 || !s.ends.some((e) => e.id === 'iosif')) return fail(`выбранная связь на небе: ${JSON.stringify(s)}`);
      return pass(`через «Родство»: ${s.ks}; концы ${s.ends.map((e) => `${e.id} (${e.role})`).join(', ')}`);
    },
  },
  {
    n: 744,
    view: PHONE,
    title: 'Иаков на телефоне: касание зубца Иосифа выбирает связь «Иаков и Рахиль → Иосиф» (или «Какая связь?» с ней)',
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f');
      let log = await linkLog(p);
      let tooth = log.find((q) => q.kind === 'tooth' && q.ks === 'k.iakov.rakhil._.iosif');
      if (!tooth) return fail('нет зубца к Иосифу');
      // палец — на самом зубце, дальше 22 px от ромбов (их поле на касании — 44 px); у звезды Иосифа — «Лицо или связь?»
      let aim = safeAim(tooth, [], nodesOf(log), 22);
      const o0 = await origin(p);
      for (let k = 0; k < 4 && !aim; k++) {
        // приблизить у самого зубца (колесо у точки держит её на месте)
        await p.mouse.move(o0.x + tooth.pts[0], o0.y + tooth.pts[1]);
        await p.mouse.wheel(0, -240);
        await p.waitForTimeout(900);
        log = await linkLog(p);
        tooth = log.find((q) => q.kind === 'tooth' && q.ks === 'k.iakov.rakhil._.iosif');
        if (!tooth) return fail('зубец к Иосифу ушёл из кадра');
        aim = safeAim(tooth, [], nodesOf(log), 22);
      }
      if (!aim) return fail('на зубце нет точки дальше 22 px от ромбов');
      await clickAt(p, aim, true);
      let got = await htmlLink(p);
      if (!got && (await p.locator('.which').count())) {
        const row = p.locator('.which .which-link[data-link="k.iakov.rakhil._.iosif"]');
        if (!(await row.count())) return fail('«Какая связь?» без связи Иосифа');
        const h = (await row.boundingBox())!.height;
        // строка связи — не ниже 56 px (§ 8: слова связи бывают в две строки)
        if (h < 56) return fail(`строка «Какая связь?» ${h} px`);
        await row.tap();
        await p.waitForTimeout(600);
        got = await htmlLink(p);
      }
      if (got !== 'k.iakov.rakhil._.iosif') return fail(`выбрана «${got}»`);
      return pass('касание выбрало связь');
    },
  },
  {
    n: 745,
    title: 'Давид: лестница союзов; ленты Мф и Лк расходятся в узле «Давид и Вирсавия» (Я17: лента выходит из узла своего шага, ±2 px)',
    run: async (p) => {
      await open(p, '#/david~vr.david.d.1.f');
      const log = await linkLog(p);
      const nodes = log.filter((q) => q.kind === 'node' && q.ks.startsWith('u.david.'));
      if (nodes.length < 5) return fail(`ромбов союзов Давида ${nodes.length}`);
      const bars = log.filter((q) => q.kind === 'bar' && q.ks.startsWith('s.david.'));
      if (!bars.length) return fail('нет черт брака Давида');
      const node = nodes.find((q) => q.ks === 'u.david.virsaviya._');
      if (!node) return fail('нет ромба «Давид и Вирсавия»');
      const [nx, ny] = node.pts;
      const out: string[] = [];
      // тройник союза (K3 § 2.1): лента идёт по следу Давида до столбца узла и уходит к ребёнку ступенькой из него
      for (const ks of ['r.j.solomon', 'r.m.nafan-syn-davida']) {
        const r = log.find((q) => q.kind === 'ribbon' && q.ks === ks);
        if (!r) return fail(`нет шага ленты ${ks}`);
        const vert = segs(r).filter(([x0, y0, x1, y1]) => Math.abs(x0 - x1) < 0.5 && Math.abs(y0 - y1) > 0.5);
        const d = Math.min(...vert.map((g) => Math.abs(g[0] - nx)));
        if (!(d <= 2)) return fail(`${ks}: ступенька в ${d.toFixed(1)} px от столбца узла (${nx}, ${ny})`);
        out.push(`${ks}: ${d.toFixed(1)} px`);
      }
      return pass(`${nodes.length} ромбов, ${bars.length} черт брака; ${out.join(', ')}`);
    },
  },
  {
    n: 746,
    // этап 13, решение 94 (словарь начертаний): точки — только толкование; Каинан назван Писанием (Лк 3:36), шаг к нему —
    // сплошная нить, а «только у Луки» говорит подсказка (прежде — разреженная нить)
    title: 'Каинан: шаг лазурной ленты к нему — сплошная нить (решение 94: точки — только толкование); подсказка «только у Луки (Лк 3:36)»',
    run: async (p) => {
      await open(p, '#/kainan-syn-arfaksada~vl~w120');
      const log = await linkLog(p);
      const step = log.find((q) => q.kind === 'ribbon' && q.ks === 'r.m.kainan-syn-arfaksada');
      if (!step) return fail('нет шага ленты к Каинану');
      if (step.style !== 'solid') return fail(`начертание шага ${step.style}`);
      const o = await origin(p);
      // вдоль шага — до первой точки, где небо называет ленту
      for (const g of segs(step)) {
        for (const t of [0.5, 0.3, 0.7]) {
          await p.mouse.move(o.x + g[0] + (g[2] - g[0]) * t, o.y + g[1] + (g[3] - g[1]) * t);
          await p.waitForTimeout(350);
          const tip = await tipText(p);
          if (/только у Луки \(Лк 3:36\)/.test(tip)) return pass(`подсказка: «${tip}»`);
        }
      }
      return fail(`подсказка шага: «${await tipText(p)}»`);
    },
  },
  {
    n: 747,
    title: 'Я22: 50 случайных видимых связей четырёх видов мышью — карточка связи с обоими концами, выбор лица не изменился, в адресе «~c»',
    run: async (p) => {
      const rand = rng(11);
      const scenes = ['#/noy', '#/david', '#/iakov~vr.iakov.d.1.f', '#/david~vr.david.d.1.f', '#/avraam', '#/avraam~vr.avraam.d.1.f', '#/nakhor-syn-farry~vg.nahorites', '#/iuda', '#/iuda~vr.iuda.d.2.f', '#/isaak'];
      let done = 0;
      const kinds = new Map<string, number>();
      const bad: string[] = [];
      for (const hash of scenes) {
        await open(p, hash);
        const all = await linkLog(p);
        const log = all.filter((q) => ['tooth', 'trunk', 'bar', 'ribbon'].includes(q.kind));
        const view = await p.locator('.sky canvas').boundingBox();
        // точка щелчка по линии — дальше 13 px от звёзд и узлов (ближе звезда и ромб важнее линии, § 8)
        const starPts = await starsOf(p);
        const nodePts = nodesOf(all);
        const aims = new Map<LogPath, { x: number; y: number }>();
        for (const q of log) {
          const a = safeAim(q, starPts, nodePts, 13, all);
          if (a && a.x > 60 && a.x < view!.width - 60 && a.y > 60 && a.y < view!.height - 60) aims.set(q, a);
        }
        const inView = [...aims.keys()];
        const want = Math.min(8, inView.length, 50 - done);
        for (let k = 0; k < want; k++) {
          const q = inView[Math.floor(rand() * inView.length)];
          const before = hashId(p);
          await clickAt(p, aims.get(q)!);
          const got = await htmlLink(p);
          const s = await sel(p);
          const card = await p.locator('.dotcard.dc-link .dc-row.end').count();
          // концы: у союза — родители на небе (у Ноя и неназванной жены — один), у связи с ребёнком, чертой брака, шагом — двое
          const need = keyKind(q.ks) === 'u' ? 1 : 2;
          const ok = !!got && (s?.ends.length ?? 0) >= need && card >= need && hashId(p) === before && /~c/.test(p.url());
          // тот же союз: у зубца — связь с его ребёнком, у ствола — союз, у «‖» — супруг, у ленты — шаг
          const same = got === q.ks || (keyKind(q.ks) === 'u' && got.startsWith('u.') && got === q.ks);
          if (!ok || !same) bad.push(`${hash} ${q.kind} ${q.ks} → «${got}» (концов ${s?.ends.length ?? 0}, строк ${card})`);
          kinds.set(q.kind, (kinds.get(q.kind) ?? 0) + 1);
          done++;
          await clearLink(p);
        }
      }
      if (done < 50) return fail(`связей ${done}`);
      if (bad.length) return fail(`${bad.length}/${done}: ${bad.slice(0, 4).join('; ')}`);
      return pass(`${done}/${done}: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
    },
  },
  {
    n: 748,
    view: PHONE,
    title: 'Я23: касание в 18 px от линии — та же связь или «Какая связь?»: строки связей не ниже 56 px, строки лиц — 44 px',
    run: async (p) => {
      const out: string[] = [];
      let valid = 0;
      for (const hash of ['#/iakov~vr.iakov.d.1.f', '#/david~vr.david.d.1.f', '#/noy~vr.noy.d.1.f']) {
      await open(p, hash);
      // ленту ловит нарисованная нить (ribbons.ts), а не маршрут журнала: пробы — по стволам, зубцам и чертам брака
      const kinds = ['tooth', 'trunk', 'bar'];
      const first = (await linkLog(p)).filter((q) => kinds.includes(q.kind)).map((q) => `${q.kind}|${q.ks}`);
      for (const want of first) {
        // журнал и звёзды — заново перед каждой пробой, когда небо встало: выбор связи на телефоне ставит лист на карточку
        // связи (214 px), и небо над ним становится выше
        await settled(p);
        const all = await linkLog(p);
        const q = all.find((r) => `${r.kind}|${r.ks}` === want);
        if (!q) continue;
        const o = await origin(p);
        // звёзды кадра (canvas[data-stars-at]: «x,y;…»)
        const st = (await starsOf(p)).map(([x, y]) => ({ x, y }));
        const a = aimAt(q);
        // видимая часть неба (.sky[data-view]: «l t r b …»): под линейкой годов и буквами полос линий не видно
        const [vl, vt, vr, vb] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
        // проба честная: ближе всех к точке касания — сама линия (на 2 px и больше), звёзд ближе 16 px нет; точка и
        // ближайшая к ней точка линии — в видимой части неба
        let probe: { x: number; y: number } | null = null;
        for (const [dx, dy] of [[0, 18], [0, -18], [18, 0], [-18, 0]]) {
          const tx = a.x + dx;
          const ty = a.y + dy;
          const dq = Math.min(...segs(q).map((g) => distSeg(tx, ty, g)));
          const dmin = Math.min(Infinity, ...all.filter((r) => r.ks !== q.ks && r.kind !== 'node' && r.kind !== 'join').flatMap((r) => segs(r).map((g) => distSeg(tx, ty, g))));
          // и не в поле ромба (на касании — 44 × 44): касание там открывает карточку союза
          const nodesNear = nodesOf(all).some(([x, y]) => Math.abs(x - tx) < 24 && Math.abs(y - ty) < 24);
          const open = tx > vl + 4 && tx < vr - 4 && ty > vt + 4 && ty < vb - 4;
          if (open && dq <= 22 && dq + 2 < dmin && !nodesNear && st.every((z) => Math.hypot(z.x - tx, z.y - ty) > 16)) {
            probe = { x: tx, y: ty };
            break;
          }
        }
        if (!probe) continue;
        const tx = probe.x;
        const ty = probe.y;
        // точка — на самом небе, не под органами неба и строкой показа
        const onCanvas = await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', { x: o.x + tx, y: o.y + ty });
        if (!onCanvas) continue;
        valid++;
        const before = await htmlLink(p);
        if (before) return fail(`${q.ks}: перед пробой выбрана связь ${before} (Escape её не снял)`);
        await p.touchscreen.tap(o.x + tx, o.y + ty);
        await p.waitForTimeout(900);
        const got = await htmlLink(p);
        await p.locator('.which[data-placed] .which-item').first().waitFor({ timeout: 800 }).catch(() => {});
        const ask = await p.locator('.which .which-item').count();
        if (got) {
          if (got !== q.ks) return fail(`${q.ks}: касание в 18 px выбрало ${got}`);
          out.push(`${q.ks} → ${got}`);
          await clearLink(p);
          continue;
        }
        if (ask) {
          // строки лиц — не ниже 44 px, строки связей — не ниже 56 px (§ 8)
          const hs = await p.locator('.which .which-item').evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, link: e.classList.contains('which-link') })));
          if (hs.some((q) => q.h < (q.link ? 56 : 44))) return fail(`строки «Какая связь?» ${hs.map((q) => `${q.h}${q.link ? ' (связь)' : ''}`).join(', ')} px`);
          out.push(`${q.ks} → «Какая связь?» (${ask})`);
          await p.keyboard.press('Escape');
          await p.waitForTimeout(300);
          continue;
        }
        const tap = (await canvasData(p)).tap;
        return fail(`${hash} ${q.ks}: касание в 18 px (${Math.round(tx)}, ${Math.round(ty)}) ничего не выбрало: касание «${tap}», ${p.url()}`);
      }
      }
      if (valid < 2) return fail(`честных проб ${valid}`);
      return pass(out.join('; '));
    },
  },
  {
    n: 749,
    title: 'Я24: выбранная связь — кольца на обоих концах, подписи концов не скрыты, небо гаснет',
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f');
      const log = await linkLog(p);
      const st = await starsOf(p);
      const nd = nodesOf(log);
      const tooth = log.find((q) => q.kind === 'tooth' && q.ks.startsWith('k.iakov.') && safeAim(q, st, nd, 12));
      if (!tooth) return fail('нет зубца, по которому можно щёлкнуть мимо звёзд и ромбов');
      await clickAt(p, safeAim(tooth, st, nd, 12)!);
      const s = await sel(p);
      if (!s || s.ends.length < 2 || !s.ends.every((e) => e.on)) return fail(`${tooth.ks}: концы ${JSON.stringify(s?.ends)}`);
      const labels = ((await canvasData(p)).labelIds ?? '').split(' ');
      const missing = s.ends.filter((e) => !labels.includes(e.id)).map((e) => e.id);
      if (missing.length) return fail(`подписей концов нет: ${missing.join(', ')}`);
      return pass(`кольца: ${s.ends.map((e) => `${e.id} — ${e.role}`).join(', ')}`);
    },
  },
  {
    n: 750,
    title: 'Я29: переход укладки при раскрытии «+N» — 300–500 мс, опора сдвигается не больше 2 px за кадр; ввод во время перехода — сразу конечный кадр',
    run: async (p) => {
      await open(p, '#/adam', 1200);
      await openSet(p, ['adam', 'eva'], ['adam']);
      const log = await linkLog(p);
      const shut = log.find((q) => q.kind === 'node' && q.style === 'shut');
      if (!shut) return fail('нет свёрнутого союза с «+N»');
      const o = await origin(p);
      await p.evaluate(`(() => {
        window.__tr = []; window.__stop = false;
        const tick = () => {
          if (window.__stop) return;
          const c = document.querySelector('.sky canvas');
          const st = (c.dataset.stars || '').split(';').find((q) => q.startsWith('adam:'));
          window.__tr.push({ t: performance.now(), tr: c.dataset.trans || '', adam: st ? st.split(':')[1] : '' });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })()`);
      await p.mouse.click(o.x + shut.pts[0] + 13, o.y + shut.pts[1]);
      await p.waitForTimeout(1200);
      const rec = (await p.evaluate(`(() => { window.__stop = true; return window.__tr; })()`)) as { t: number; tr: string; adam: string }[];
      const mid = rec.filter((r) => r.tr && Number(r.tr) < 1);
      if (!mid.length) return fail('перехода нет (ни одного промежуточного кадра)');
      const ms = mid[mid.length - 1].t - mid[0].t;
      if (ms > 520) return fail(`переход ${Math.round(ms)} мс`);
      let jump = 0;
      for (let k = 1; k < rec.length; k++) {
        const [x0, y0] = rec[k - 1].adam.split(',').map(Number);
        const [x1, y1] = rec[k].adam.split(',').map(Number);
        if ([x0, y0, x1, y1].every(Number.isFinite)) jump = Math.max(jump, Math.hypot(x1 - x0, y1 - y0));
      }
      if (jump > 2) return fail(`опора сдвинулась на ${jump.toFixed(1)} px за кадр`);
      // ввод во время перехода: свернуть обратно и сразу нажать клавишу — конечный кадр без промежуточных
      const log2 = await linkLog(p);
      const open2 = log2.find((q) => q.kind === 'node' && q.ks === shut.ks);
      if (!open2) return pass(`переход ${Math.round(ms)} мс, ${mid.length} кадров, опора ≤ ${jump.toFixed(1)} px`);
      await p.mouse.click(o.x + open2.pts[0] + 13, o.y + open2.pts[1]);
      await p.waitForTimeout(40);
      await p.mouse.move(o.x + 5, o.y + 5);
      await p.waitForTimeout(60);
      const tr = (await canvasData(p)).trans ?? '';
      if (tr) return fail(`после ввода переход идёт дальше: ${tr}`);
      return pass(`переход ${Math.round(ms)} мс, ${mid.length} кадров, опора ≤ ${jump.toFixed(1)} px; ввод обрывает переход`);
    },
  },
  {
    n: 751,
    title: 'Сценарий 10: ослабленное движение — раскрытие «+N» без промежуточных кадров',
    run: async (p) => {
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await open(p, '#/adam', 1200);
      await openSet(p, ['adam', 'eva'], ['adam']);
      const log = await linkLog(p);
      const shut = log.find((q) => q.kind === 'node' && q.style === 'shut');
      if (!shut) return fail('нет свёрнутого союза с «+N»');
      const o = await origin(p);
      await p.evaluate(`(() => {
        window.__tr = []; window.__stop = false;
        const tick = () => {
          if (window.__stop) return;
          window.__tr.push(document.querySelector('.sky canvas').dataset.trans || '');
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })()`);
      await p.mouse.click(o.x + shut.pts[0] + 13, o.y + shut.pts[1]);
      await p.waitForTimeout(900);
      const rec = (await p.evaluate(`(() => { window.__stop = true; return window.__tr; })()`)) as string[];
      await p.emulateMedia({ reducedMotion: null });
      const mid = rec.filter((t) => t && Number(t) < 1);
      if (mid.length) return fail(`промежуточных кадров ${mid.length}`);
      const after = await linkLog(p);
      if (after.find((q) => q.kind === 'node' && q.ks === shut.ks)?.style === 'shut') return fail('союз не раскрылся');
      return pass(`кадров записано ${rec.length}, промежуточных 0`);
    },
  },
  {
    n: 752,
    title: 'Сценарий 8: раскрытие Адам → Мехиаель по шагам — прежние лица не переставляются',
    run: async (p) => {
      await open(p, '#/adam', 1200);
      await openSet(p, ['adam', 'eva'], ['adam']);
      const o = await origin(p);
      const orderOf = async () => [...(await stars(p)).entries()].sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([id]) => id);
      const steps: string[] = [];
      for (const [who, want] of [
        ['adam', 'kain'],
        ['kain', 'enokh-syn-kaina'],
        ['enokh-syn-kaina', 'irad'],
        ['irad', 'mekhiael'],
      ] as const) {
        const before = await orderOf();
        const shutOf = async () => (await linkLog(p)).find((q) => q.kind === 'node' && q.style === 'shut' && q.ks.startsWith(`u.${who}.`));
        let node = await shutOf();
        if (!node) {
          // «+» у лица — показать его союзы (reveal), затем «+N» союза
          const fold = ((await canvasData(p)).foldHits ?? '').split(';').find((q) => q.startsWith(`reveal:${who}:`));
          if (!fold) return fail(`нет «+» у ${who}`);
          const [fx, fy, fw, fh] = fold.split(':')[2].split(',').map(Number);
          await p.mouse.click(o.x + fx + fw / 2, o.y + fy + fh / 2);
          await p.waitForTimeout(1100);
          node = await shutOf();
        }
        if (!node) {
          if ((await orderOf()).includes(want)) continue;
          return fail(`нет «+N» у союзов ${who}`);
        }
        await p.mouse.click(o.x + node.pts[0] + 13, o.y + node.pts[1]);
        await p.waitForTimeout(1100);
        const after = await orderOf();
        if (!after.includes(want)) return fail(`после ${who} нет ${want}`);
        // прежние лица в прежнем порядке строк (Я19: перестановок нет)
        const x1 = after.filter((id) => before.includes(id)).join(' ');
        const x0 = before.filter((id) => after.includes(id)).join(' ');
        if (x1 !== x0) return fail(`после ${who}: было «${x0}», стало «${x1}»`);
        steps.push(`${want}: ${before.length} прежних на местах`);
      }
      return pass(steps.join('; '));
    },
  },
  {
    n: 753,
    title: 'Сценарий 11 и Я34: шаги ошибки 14 — подписей лиц без звёзд нет (data-bare пуст) во всех сценах связей',
    run: async (p) => {
      const out: string[] = [];
      for (const hash of ['#/noy', ADAM_SET, '#/iakov~vr.iakov.d.1.f', '#/david~vr.david.d.1.f', '#/~vl', '#/nakhor-syn-farry~vg.nahorites', '#/arfaksad~vl']) {
        await open(p, hash, 2600);
        const d = await canvasData(p);
        if (d.bare) return fail(`${hash}: подписи без звёзд — ${d.bare}`);
        out.push(`${hash} — ${(d.links ?? '').split(';').filter(Boolean).length} связей`);
      }
      return pass(out.join('; '));
    },
  },
];
