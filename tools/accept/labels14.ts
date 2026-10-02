/**
 * Сценарии приёмки этапа 14, S2 «Подписи и слои» (docs/ui-review/STAGE14.md, решения 139–144; пороги К1–К8 § 4),
 * группа labels14: номера 1120–1139. Замер — тот же, что у набора COLLISION STRESS (tools/collide.ts): запись холста
 * ставится до загрузки, границы берутся из того, что реально нарисовано.
 *  — 1120–1123 Давид, масштаб семьи: 1440 ночь и день, 1280, 1024 — К1–К8;
 *  — 1124–1126 карточка у звезды (1440, 1024) и подсказка: имена семьи под оверлеем и обрывки букв — 0 (К6);
 *  — 1127 выбранная связь Давид и Ахиноама — Амнон: линии поверх текста 0, роли концов читаются (К3);
 *  — 1128 Иаков, семья и связь Иаков и Рахиль — Вениамин;
 *  — 1129 обзор с выбранным лицом (Иаков, Давид): яркие знаки не ложатся друг на друга, у выбранного — «+N» (решение 142);
 *  — 1130 колена Иуды и Вениамина; 1131–1132 тяжёлые участки (1 Пар 2–8, Быт 10, 36, цари, плен, Новый Завет);
 *  — 1133–1134 телефон, касание Иакова и Давида;
 *  — 1135 узкое небо (решение 144): при выбранном лице подписаны только его род, семья и лица лент;
 *  — 1136 скрытые подписи (контракт 2): лица видимых звёзд без подписи — в canvas[data-hidden], подписанные — нет;
 *  — 1137 обзор на телефоне без выбранного (решение 142 на любом масштабе, инвариант 13): знаки, которые легли бы друг на
 *    друга, прорежены — К1 = 0, опорные лица нарисованы, прореженные — в списке неба и в скрытых подписях, без подписи;
 *    касание знака, в который собраны прореженные, — приближение к нему, а не выбор;
 *  — 1138–1139 корпус этапа 15 («Отчий дом», решения 173–181): тяжёлые семьи на обзоре семьи и масштабе семьи, выбор и
 *    наведение (сцены s15-* набора COLLISION STRESS) — К1–К8.
 */
import type { Page } from 'playwright';
import { fail, pass, type Check, type Scenario } from './kit.ts';
import { REC, SCENES, shoot, verdict, type Scene } from '../collide.ts';

const scene = (id: string): Scene => {
  const s = SCENES.find((q) => q.id === id);
  if (!s) throw new Error(`нет сцены ${id}`);
  return s;
};

/** Снять сцены по очереди на этой странице и проверить пороги К1–К8 (verdict); extra — дополнительная проверка кадра. */
async function stress(p: Page, ids: string[], extra?: (id: string, r: Awaited<ReturnType<typeof shoot>>) => string | null): Promise<Check> {
  await p.addInitScript(REC);
  const bad: string[] = [];
  const got: string[] = [];
  for (const id of ids) {
    const r = await shoot(p, scene(id), p.url());
    const v = verdict(r.m.counts);
    const e = extra?.(id, r);
    if (e) v.push(e);
    if (v.length) bad.push(`${id}: ${v.join('; ')}`);
    got.push(`${id} ${r.m.counts.starLabels} имён`);
  }
  return bad.length ? fail(bad.join(' | ')) : pass(got.join(', '));
}

const W1280 = { width: 1280, height: 800 };
const W1024 = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844, touch: true };

export const labels14: Scenario[] = [
  { n: 1120, title: 'COLLISION STRESS: Давид, масштаб семьи, 1440 (К1–К8)', run: (p) => stress(p, ['david-fam', 'david-pan']) },
  { n: 1121, title: 'COLLISION STRESS: Давид, масштаб семьи, 1440, день (К1–К8)', run: (p) => stress(p, ['david-fam-day', 'david-rod-day']) },
  { n: 1122, title: 'COLLISION STRESS: Давид, масштаб семьи, 1280 (К1–К8)', view: W1280, run: (p) => stress(p, ['david-fam-1280', 'david-card-1280']) },
  { n: 1123, title: 'COLLISION STRESS: Давид, масштаб семьи, 1024 (К1–К8)', view: W1024, run: (p) => stress(p, ['david-fam-1024']) },
  { n: 1124, title: 'Карточка у звезды Давида, 1440: имена семьи под ней не рисуются, обрывков букв нет (решение 144, К6)', run: (p) => stress(p, ['david-card']) },
  { n: 1125, title: 'Карточка у звезды Давида, 1024: имена семьи под ней не рисуются, обрывков букв нет (решение 144, К6)', view: W1024, run: (p) => stress(p, ['david-card-1024']) },
  { n: 1126, title: 'Подсказка у Соломона: имена семьи под ней не рисуются, обрывков букв нет (решение 144, К6)', run: (p) => stress(p, ['david-tip']) },
  {
    n: 1127,
    title: 'Выбранная связь Давид и Ахиноама — Амнон: ни одна линия не легла поверх текста, имя выбранного не перечёркнуто (решения 139, 143, К3)',
    run: (p) => stress(p, ['david-link-amnon', 'david-link-amnon-day'], (_id, r) => (r.g.linkSel ? null : 'связь не выбрана')),
  },
  {
    n: 1128,
    title: 'Иаков: семья, карточка, наведение на Иуду, связь Иаков и Рахиль — Вениамин (К1–К8)',
    run: (p) => stress(p, ['iakov-fam', 'iakov-tip', 'iakov-link', 'iakov-link-day'], (id, r) => (!id.includes('link') || r.g.linkSel ? null : 'связь не выбрана')),
  },
  {
    n: 1129,
    title: 'Обзор с выбранным лицом: яркие знаки не ложатся друг на друга — скопление «знак старшего и +N» (решение 142, К1)',
    run: (p) =>
      stress(p, ['iakov-far', 'david-far', 'all-far'], (id, r) => {
        if (id === 'all-far') return null;
        const piles = r.g.piles ?? '';
        return /:\+\d+:/.test(piles) ? null : 'скоплений семьи нет';
      }),
  },
  { n: 1130, title: 'Колена Иуды и Вениамина (К1–К8)', run: (p) => stress(p, ['judah-group', 'benjamin-group']) },
  { n: 1131, title: 'Тяжёлые участки: Халев, Ашхур, Шегараим, Каафиты, Иоктан (К1–К8)', run: (p) => stress(p, ['halev-near', 'ashkhur-near', 'shegaraim-near', 'kaaf-near', 'ioktan-near']) },
  { n: 1132, title: 'Тяжёлые участки: Исав, Ахав, Ровоам, Зоровавель, Иисус, линии Мессии (К1–К8)', run: (p) => stress(p, ['isav-mid', 'akhav-mid', 'rovoam-near', 'zorovavel-mid', 'iisus-mid', 'lines']) },
  { n: 1133, title: 'Телефон: касание Иакова, лист 214 px (К1–К8)', view: PHONE, run: (p) => stress(p, ['phone-iakov-tap']) },
  { n: 1134, title: 'Телефон: касание Давида, лист 214 px (К1–К8)', view: PHONE, run: (p) => stress(p, ['phone-david-tap', 'phone-david']) },
  {
    n: 1135,
    title: 'Узкое небо при выбранном лице: подписаны только его род, ближайшая семья и лица лент (решение 144; M2)',
    view: PHONE,
    run: async (p) => {
      // данные — из собранного атласа (src/generated/atlas.json): модуль атласа в node не грузится (import.meta.glob)
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { ROOT } = await import('../bible.ts');
      type P = { id: string; f?: string; m?: string; op?: { id: string }[]; sp?: { id: string }[] };
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: P[]; lines: Record<string, { persons: { id: string }[] }> };
      const spine = new Set(Object.values(atlas.lines).flatMap((l) => l.persons.map((x) => x.id)));
      const up = new Map<string, string[]>();
      const down = new Map<string, string[]>();
      const mates = new Map<string, string[]>();
      const push = (m: Map<string, string[]>, k: string, v: string) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
      for (const q of atlas.persons) {
        for (const par of [q.f, q.m, ...(q.op ?? []).map((o) => o.id)]) if (par) (push(up, q.id, par), push(down, par, q.id));
        for (const s of q.sp ?? []) (push(mates, q.id, s.id), push(mates, s.id, q.id));
      }
      await p.addInitScript(REC);
      const out: string[] = [];
      for (const id of ['phone-david', 'phone-iakov']) {
        const sc = scene(id);
        const sel = sc.hash.replace(/^#\//, '').split('~')[0];
        const r = await shoot(p, sc, p.url());
        // род выбранного — его предки и потомки по графу; ближняя семья — родители, супруги, дети, братья и сёстры
        const rod = new Set<string>([sel, ...(mates.get(sel) ?? [])]);
        for (const par of up.get(sel) ?? []) for (const sib of down.get(par) ?? []) rod.add(sib);
        for (const dir of [up, down]) {
          const seen = new Set([sel]);
          const q = [sel];
          while (q.length) for (const y of dir.get(q.pop()!) ?? []) if (!seen.has(y)) (seen.add(y), rod.add(y), q.push(y));
        }
        const ids = r.g.labelBoxes.split(';').filter(Boolean).map((q) => q.slice(0, q.lastIndexOf(':')));
        const alien = ids.filter((x) => !rod.has(x) && !spine.has(x) && x !== sel);
        if (alien.length) return fail(`${id}: подписаны вне рода и лент — ${alien.join(', ')}`);
        out.push(`${id}: ${ids.length} подписей рода и лент`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 1136,
    title: 'Скрытые подписи (контракт 2): лица видимых звёзд без подписи — в canvas[data-hidden], подписанных там нет; при наведении скрытая подпись встаёт',
    run: async (p) => {
      await p.addInitScript(REC);
      const r = await shoot(p, scene('david-fam'), p.url());
      const raw = await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.hidden ?? '');
      const hidden = raw.split(' ').filter(Boolean);
      const named = new Set(r.g.labelBoxes.split(';').filter(Boolean).map((q) => q.slice(0, q.lastIndexOf(':'))));
      const both = hidden.filter((x) => named.has(x));
      if (both.length) return fail(`и подписаны, и скрыты: ${both.join(', ')}`);
      // скрытая подпись встаёт при наведении на звезду (явное раскрытие). Проба — звезда в открытом небе: под органом неба
      // (кнопки масштаба, строка показа) указатель наводится на орган, а у самой кромки (этап 15: в семье Давида первыми
      // в скрытых оказались звёзды у нижней кромки и у кнопок масштаба) имени негде встать ни с какой стороны
      const [vl, vt, vr, vb] = r.g.view.split(' ').map(Number);
      const open = (q: { x: number; y: number }) =>
        q.x >= vl + 30 && q.x <= vr - 30 && q.y >= vt + 30 && q.y <= vb - 30 && !r.g.ui.some((u) => q.x >= u.x - 30 && q.x <= u.x + u.w + 30 && q.y >= u.y - 30 && q.y <= u.y + u.h + 30);
      const probe = hidden.find((id) => r.g.stars.some((s) => s.id === id && open(s)));
      if (!probe) return pass(`скрытых нет; подписей ${named.size}`);
      const st = r.g.stars.find((s) => s.id === probe)!;
      const c = (await p.locator('.sky canvas').boundingBox())!;
      await p.mouse.move(c.x + st.x, c.y + st.y);
      await p.waitForTimeout(700);
      const after = await p.evaluate(() => (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.labelIds ?? '');
      return after.split(' ').includes(probe) ? pass(`скрытых ${hidden.length}; ${probe} при наведении подписан`) : fail(`${probe} при наведении не подписан`);
    },
  },
  {
    n: 1137,
    title: 'Телефон, обзор без выбранного: знаки не ложатся друг на друга — прорежены, рисуется значимый (решение 142, инвариант 13, К1 = 0); Адам, Ной, Авраам, Давид, Иисус Христос нарисованы; касание собранного знака — приближение',
    view: PHONE,
    run: async (p) => {
      await p.addInitScript(REC);
      const r = await shoot(p, scene('phone-far'), p.url());
      const bad = verdict(r.m.counts);
      if (r.m.counts.nn) bad.push(`знаков друг на друге ${r.m.counts.nn}`);
      // прореженные — canvas[data-thin] «знак:собранные через запятую» через «;»
      const ds = await p.evaluate(() => {
        const c = (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset;
        return { thin: c.thin ?? '', hidden: c.hidden ?? '', labels: c.labelIds ?? '' };
      });
      const groups = ds.thin.split(';').filter(Boolean).map((g) => g.split(':'));
      const thinned = new Set(groups.flatMap(([, m]) => m.split(',')));
      if (!thinned.size) bad.push('прореженных нет');
      const drawn = new Set(r.g.stars.map((s) => s.id).filter((id) => !thinned.has(id)));
      const lost = ['adam', 'noy', 'avraam', 'david', 'iisus'].filter((id) => !drawn.has(id));
      if (lost.length) bad.push(`не нарисованы: ${lost.join(', ')}`);
      // прореженный в списке неба (#sky-stars) — среди скрытых подписей и без подписи
      const hidden = new Set(ds.hidden.split(' '));
      const named = new Set(ds.labels.split(' '));
      const listed = r.g.stars.filter((s) => thinned.has(s.id));
      const notHidden = listed.filter((s) => !hidden.has(s.id)).map((s) => s.id);
      const labeled = listed.filter((s) => named.has(s.id)).map((s) => s.id);
      if (notHidden.length) bad.push(`прорежены, но не в скрытых: ${notHidden.join(', ')}`);
      if (labeled.length) bad.push(`прорежены, но подписаны: ${labeled.join(', ')}`);
      if (bad.length) return fail(bad.join('; '));
      // касание знака, в который собраны прореженные, — приближение к нему, а не выбор (соседний нарисованный знак — дальше 30 px)
      const pts = r.g.stars.filter((s) => drawn.has(s.id));
      const host = groups
        .map(([h]) => pts.find((s) => s.id === h))
        .find((h) => h && h.y > 260 && h.y < r.g.ch - 120 && h.x > 60 && h.x < r.g.cw - 120 && pts.every((o) => o.id === h.id || Math.hypot(o.x - h.x, o.y - h.y) > 30));
      if (!host) return fail('нет знака с собранными вдали от соседей');
      const w0 = await p.evaluate(() => (document.querySelector('.sky') as HTMLElement).dataset.view ?? '');
      const c = (await p.locator('.sky canvas').boundingBox())!;
      await p.touchscreen.tap(c.x + host.x, c.y + host.y);
      await p.waitForTimeout(900);
      const after = await p.evaluate(() => ({ tap: (document.querySelector('.sky canvas') as HTMLCanvasElement).dataset.tap ?? '', view: (document.querySelector('.sky') as HTMLElement).dataset.view ?? '', sel: document.documentElement.dataset.selected ?? '' }));
      // .sky[data-view] — «л в п н x0 kx верх ky»: kx — px на единицу времени
      const kx = (v: string) => Number(v.split(' ')[5]);
      if (after.tap !== 'zoom' || !(kx(after.view) > kx(w0) * 1.4)) return fail(`касание знака ${host.id} с собранными: ${after.tap}, масштаб ${kx(w0)} → ${kx(after.view)}`);
      if (after.sel) return fail(`касание знака ${host.id} с собранными выбрало ${after.sel}`);
      return pass(`нарисовано ${drawn.size}, прорежено в окне ${listed.length} (в ${groups.length} знаков), К1 0; касание ${host.id} — приближение`);
    },
  },
  {
    n: 1138,
    title: 'Этап 15, корпус «Отчего дома»: Иаков, Давид, Авраам, Халев, Исав, Иуда и Фамарь — обзор семьи (≈ 113 лет) без выбора; переходы — препятствия для имён (К1–К8)',
    run: (p) => stress(p, ['s15-iakov-o', 's15-david-o', 's15-avraam-o', 's15-khalev-o', 's15-isav-o', 's15-iuda-o']),
  },
  {
    n: 1139,
    title: 'Этап 15, корпус «Отчего дома»: масштаб семьи (45–60 лет), выбор Иакова, Давида, Фамари и наведение на Вениамина (К1–К8)',
    run: (p) => stress(p, ['s15-iakov-f', 's15-david-f', 's15-avraam-f', 's15-khalev-f', 's15-isav-f', 's15-iuda-f', 's15-iakov-sel', 's15-david-sel', 's15-famar-sel', 's15-iakov-hover']),
  },
];
