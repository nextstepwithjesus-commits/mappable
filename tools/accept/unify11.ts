/**
 * Сценарии приёмки этапа 11, задача Q3 «Единый вид» (решения 77, 81–83; STAGE11.md § 5–8, § 12), группа unify11: 810–849.
 *  — Я21: один жест — один смысл: 5 лиц × 5 показов — щелчок по звезде открывает у неё карточку с «Родством»; показ
 *    не меняется, камера не сдвигается;
 *  — Я25: место карточки у звезды, у ромба союза и у связи — 7 трудных случаев × {1440, 1024} × {ночь, день}: с
 *    обязательными запретными областями (§ 6: звезда фокуса с подписью, концы связи с подписями, органы неба, строка
 *    показа, указатели у края) — 0 px²; с желательными (звёзды и подписи семьи первого поколения, ромбы союзов фокуса) —
 *    0 px², где место есть; где его нет — краткий вид и наименьшее перекрытие (число — в ответе сценария). Запретное
 *    карточка пишет в data-must и data-want; сценарий сверяет его с тем, что видит сам: знак карточки (data-at), звёзды
 *    семьи из «Родства» (#sky-star-…), строка показа и органы неба ([data-reserve]) — и сам проверяет, что у краткой
 *    карточки полной (data-full) места действительно нет;
 *  — Я27 (часть интерфейса): «Дом Нахора» ≤ 3 действий, «все колена» ≤ 3, род Иуды ≤ 3 после поиска, Адам → Ной
 *    в наборе ≤ 11 без «Вписать»;
 *  — Я30: слова — «Древо», «В работе», «Раскрыто» нигде нет; «Всё небо» — только показ, кадр — «Вписать»;
 *  — Я31: цели ромбов и «+» у имени ≥ 24 × 24 (на касании ≥ 44 × 44); команды листа-карточки на телефоне ≥ 44 px;
 *  — Я32: axe (WCAG 2.2 AA) — 0 нарушений на карточках у звезды, у ромба и у связи, строке показа и листе «Показ»;
 *    «Дом Нахора» с клавиатуры ≤ 12 нажатий; связь через «Родство» ≤ 6 нажатий; фокус возвращается; живая область;
 *  — Я35: § 5.6 ТЗ на новых экранах (ночь и день, 1440 и 390): без теней, скруглений, прописных, «·», «→»,
 *    моноширинных; снимки .ui-shots/q3/preview-*.png;
 *  — сценарии владельца § 12: 1 (снимок 13: подсказка ствола Ноя, щелчок по зубцу Хама — карточка связи), 3 (Иаков:
 *    «Иаков и Рахиль → Иосиф» через «Родство»), 9 (телефон: касание Хама — лист на 214 px с «Родством»).
 */
import type { Page } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../bible.ts';
import { fail, hashId, pass, type Scenario } from './kit.ts';

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

export const flat = (s: string) => s.replace(/[   ]/g, ' ').replace(/⁠/g, '').replace(/\s+/g, ' ').trim();
const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const rects = (s: string | undefined | null): Rect[] =>
  (s ?? '')
    .split(';')
    .filter(Boolean)
    .map((q) => q.split(',').map(Number))
    .map(([x, y, w, h]) => ({ x, y, w, h }));

/**
 * Открыть адрес с новой памятью сеанса: вступление свёрнуто, начало выбрано (по умолчанию «всё небо»), тема, прочие
 * ключи памяти браузера (toledot:<ключ>).
 */
export async function open(p: Page, hash: string, o: { start?: string | null; theme?: 'night' | 'day'; extra?: Record<string, unknown>; ms?: number } = {}) {
  await p.evaluate(
    ([start, theme, extra]) => {
      localStorage.setItem('toledot:cartouche', 'folded');
      if (start) localStorage.setItem('toledot:start', JSON.stringify(start));
      else localStorage.removeItem('toledot:start');
      if (theme) localStorage.setItem('toledot:theme', JSON.stringify(theme));
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) localStorage.setItem(`toledot:${k}`, JSON.stringify(v));
      sessionStorage.clear();
    },
    [o.start === undefined ? 'all' : o.start, o.theme ?? null, o.extra ?? {}] as const,
  );
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?u11=${Date.now()}${hash}`);
  await p.waitForTimeout(o.ms ?? 2600);
}

/** Показ неба (html[data-show…], src/ui/show.ts) и окно неба (.sky[data-view]). */
export const state = (p: Page) =>
  p.evaluate(() => {
    const d = document.documentElement.dataset;
    const s = (document.querySelector('.sky') as HTMLElement | null)?.dataset ?? {};
    return { show: d.show ?? '', ids: d.showIds ?? '', link: d.link ?? '', view: s.view ?? '', sel: s.sel ?? '' };
  });

/** Прямоугольник холста неба на странице. */
const canvasBox = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;

/** Экранная точка звезды лица id: выбранное — .sky[data-sel], иначе скрытый список лиц неба (#sky-star-id). */
export async function starPt(p: Page, id: string): Promise<Pt | null> {
  const c = await canvasBox(p);
  const q = (await p.evaluate(
    ([id, sel]) => {
      const s = (document.querySelector('.sky') as HTMLElement).dataset.sel;
      if (sel && s) {
        const [x, y] = s.split(' ').map(Number);
        return { x, y };
      }
      // показ из части лиц: холст пишет места их звёзд каждым кадром (canvas[data-stars] «id:x,y;…»), и за краем окна
      // тоже; список неба (#sky-star-…) обновляется, только когда небо постоит (SkyA11y)
      const m = ((document.querySelector('.sky canvas') as HTMLElement | null)?.dataset.stars ?? '').split(';').find((q) => q.startsWith(`${id}:`));
      if (m) {
        const [x, y] = m.slice(id.length + 1).split(',').map(Number);
        return { x, y };
      }
      const b = document.getElementById(`sky-star-${id}`);
      if (b?.dataset.x) return { x: Number(b.dataset.x), y: Number(b.dataset.y) };
      return null;
    },
    [id, hashId(p) === id] as const,
  )) as Pt | null;
  return q ? { x: c.x + q.x, y: c.y + q.y } : null;
}

/** Центры ромбов союзов кадра (canvas[data-dots]: «союз:раскрыт:x,y:скрыто»), px холста. */
export async function dots(p: Page): Promise<{ uid: string; open: boolean; x: number; y: number; hidden: number }[]> {
  const s = (await p.locator('.sky canvas').getAttribute('data-dots')) ?? '';
  return s
    .split(';')
    .filter(Boolean)
    .map((x) => /^(.+):([01]):(-?\d+),(-?\d+):(\d+)$/.exec(x))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ uid: m[1], open: m[2] === '1', x: +m[3], y: +m[4], hidden: +m[5] }));
}

/** Открытая карточка на небе: вид, имя или заголовок, прямоугольник (px холста), запретное, точка знака. */
export async function cardOf(p: Page) {
  return (await p.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.sky .dotcard[data-placed]');
    const c = document.querySelector('.sky canvas')?.getBoundingClientRect();
    if (!el || !c) return null;
    const r = el.getBoundingClientRect();
    const [ax, ay, ar] = (el.dataset.at ?? '').split(',').map(Number);
    return {
      kind: el.dataset.kind ?? '',
      name: (el.querySelector('.dc-nm .nm, h3')?.textContent ?? '').trim(),
      rect: { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height },
      hard: el.dataset.hard ?? '',
      must: el.dataset.must ?? '',
      want: el.dataset.want ?? '',
      brief: el.hasAttribute('data-brief'),
      full: el.dataset.full ?? '',
      bounds: el.dataset.bounds ?? '',
      at: Number.isFinite(ax) ? { x: ax, y: ay, r: ar } : null,
      family: [...el.querySelectorAll<HTMLElement>('.dc-kin .person[data-id]')].map((b) => b.dataset.id!),
    };
  })) as null | {
    kind: string;
    name: string;
    rect: Rect;
    hard: string;
    must: string;
    want: string;
    brief: boolean;
    full: string;
    bounds: string;
    at: { x: number; y: number; r: number } | null;
    family: string[];
  };
}

/** Органы неба, строка показа и лист «Показ» ([data-reserve]) — px холста. */
const reserves = (p: Page) =>
  p.evaluate(() => {
    const c = document.querySelector('.sky canvas')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.sky [data-reserve]')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height }));
  }) as Promise<Rect[]>;

/** Точки звёзд лиц на небе (скрытый список лиц неба), px холста. */
const starsOf = (p: Page, ids: string[]) =>
  p.evaluate((ids) => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const b = document.getElementById(`sky-star-${id}`);
      if (b?.dataset.x) out[id] = { x: Number(b.dataset.x), y: Number(b.dataset.y) };
    }
    return out;
  }, ids) as Promise<Record<string, Pt>>;

/**
 * Есть ли полной карточке размера size место в bounds без единого px² запретного: перебор по сетке 16 px, затем 6 px —
 * та же сетка, что у места карточки (src/ui/sky/DotCard.tsx, placeCard).
 */
function roomFor(size: { w: number; h: number }, bounds: Rect, bad: Rect[]): boolean {
  const x1 = bounds.x + bounds.w - size.w;
  const y1 = bounds.y + bounds.h - size.h;
  if (x1 < bounds.x || y1 < bounds.y) return false;
  for (const step of [16, 6])
    for (let x = bounds.x; x <= x1 + 0.5; x += step)
      for (let y = bounds.y; y <= y1 + 0.5; y += step) {
        const q = { x: Math.min(x, x1), y: Math.min(y, y1), ...size };
        if (bad.every((z) => area(q, z) === 0)) return true;
      }
  return false;
}

/**
 * Я25 (STAGE11.md § 6, уточнение координатора): запретное — два яруса.
 *  — Обязательное (data-must карточки и то, что сценарий видит сам: знак, у которого карточка — data-at, органы неба
 *    и строка показа — [data-reserve]): 0 px² всегда.
 *  — Желательное (data-want: звёзды и подписи семьи первого поколения, ромбы союзов фокуса; и звёзды семьи из «Родства»,
 *    которые сценарий видит сам): 0 px², если полной карточке есть место. Если места нет — карточка краткая (data-brief), и
 *    сценарий сам проверяет, что полной карточке (data-full) места действительно нет; площадь закрытого желательного —
 *    в ответе (число — в отчёт).
 * Возвращает { why } — замечание, или { note } — краткий вид и закрытая площадь.
 */
export async function placeIssue(p: Page): Promise<{ why?: string; note?: string }> {
  const c = await cardOf(p);
  if (!c) return { why: 'карточки нет' };
  const vp = (await state(p)).view.split(' ').map(Number);
  const [l, t, r, b] = vp;
  const must: Rect[] = [...rects(c.must), ...(await reserves(p))];
  const mark = c.at ? { x: c.at.x - c.at.r, y: c.at.y - c.at.r, w: 2 * c.at.r, h: 2 * c.at.r } : null;
  if (mark) must.push(mark);
  const want: Rect[] = rects(c.want);
  const fam = await starsOf(p, c.family);
  const hard = rects(c.hard);
  for (const [id, q] of Object.entries(fam)) {
    if (q.x < l || q.x > r || q.y < t || q.y > b) continue;
    want.push({ x: q.x - 3, y: q.y - 3, w: 6, h: 6 });
    // звезда семьи — в запретном карточки (иначе проверка data-hard неполна)
    if (!hard.some((h) => q.x >= h.x - 1 && q.x <= h.x + h.w + 1 && q.y >= h.y - 1 && q.y <= h.y + h.h + 1)) return { why: `звезды ${id} нет в запретном карточки` };
  }
  if (c.rect.x < l - 1 || c.rect.x + c.rect.w > r + 1 || c.rect.y + c.rect.h > b + 1) return { why: 'карточка за краем неба' };
  const list = (rs: Rect[]) => rs.map((h) => ({ h, a: area(c.rect, h) })).filter((x) => x.a > 0.5);
  const say = (xs: { h: Rect; a: number }[]) => xs.slice(0, 3).map((x) => `${Math.round(x.h.x)},${Math.round(x.h.y)} ${Math.round(x.h.w)}×${Math.round(x.h.h)} — ${Math.round(x.a)} px²`).join('; ');
  const m = list(must);
  if (m.length) return { why: `карточка закрывает ${m.length} обязательных областей: ${say(m)}` };
  const w = list(want);
  if (!c.brief) return w.length ? { why: `полная карточка закрывает ${w.length} желательных областей: ${say(w)}` } : {};
  // краткий вид — только когда полной карточке места нет
  const [fw, fh] = c.full.split(',').map(Number);
  const [bx, by, bw, bh] = c.bounds.split(',').map(Number);
  if (!(fw > 0 && fh > 0 && bw > 0)) return { why: 'краткая карточка без размера полной (data-full) или места (data-bounds)' };
  const bad = [...rects(c.must), ...rects(c.want), ...(mark ? [mark] : [])];
  if (roomFor({ w: fw, h: fh }, { x: bx, y: by, w: bw, h: bh }, bad)) return { why: `краткий вид, хотя полной карточке ${fw}×${fh} место есть` };
  return { note: `краткий вид, закрыто ${Math.round(w.reduce((s, x) => s + x.a, 0))} px² желательного` };
}

/** Сдвинуть небо протяжкой на (dx, dy): протяжками не длиннее трети неба, от середины неба. */
export async function pan(p: Page, dx: number, dy: number) {
  const c = await canvasBox(p);
  const step = Math.min(c.width, c.height) / 3;
  const parts = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / step));
  for (let k = 0; k < parts; k++) {
    const ddx = dx / parts;
    const ddy = dy / parts;
    const x0 = c.x + c.width / 2 - ddx / 2;
    const y0 = c.y + c.height / 2 - ddy / 2;
    await p.mouse.move(x0, y0);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await p.mouse.move(x0 + (ddx * i) / 8, y0 + (ddy * i) / 8);
      await p.waitForTimeout(16);
    }
    // палец постоял перед отпусканием — без инерции: небо сдвигается ровно на протяжку
    await p.waitForTimeout(160);
    await p.mouse.up();
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(600);
}

/**
 * Звезда лица id на экране: если её нет в видимой части неба (адрес с показом ставит окно по всему небу, а семейная
 * укладка переставляет строки), небо сдвигается протяжкой так, чтобы звезда встала в середину. Возвращает её точку.
 */
export async function inView(p: Page, id: string): Promise<Pt | null> {
  let q = await starPt(p, id);
  if (!q) return null;
  const c = await canvasBox(p);
  const inside = (t: Pt) => t.x > c.x + 90 && t.x < c.x + c.width - 90 && t.y > c.y + 130 && t.y < c.y + c.height - 130;
  for (let k = 0; k < 3 && q && !inside(q); k++) {
    await pan(p, c.x + c.width / 2 - q.x, c.y + c.height / 2 - q.y);
    // места звёзд в списке неба обновляются, когда небо встало (SkyA11y: 600 мс после последнего кадра) — ждать, пока
    // место звезды не перестанет меняться
    q = await starPt(p, id);
    for (let t = 0; t < 12; t++) {
      await p.waitForTimeout(200);
      const q2 = await starPt(p, id);
      if (q && q2 && Math.abs(q2.x - q.x) < 0.5 && Math.abs(q2.y - q.y) < 0.5 && t >= 3) break;
      q = q2;
    }
  }
  return q && inside(q) ? q : null;
}

/** Щёлкнуть звезду лица id; карточка у звезды — через 800 мс. */
export async function clickStar(p: Page, id: string): Promise<boolean> {
  const q = await inView(p, id);
  if (!q) return false;
  await p.mouse.click(q.x, q.y);
  await p.waitForTimeout(800);
  return true;
}

/** Щёлкнуть ромб союза uid (карточка союза у ромба). */
export async function clickDot(p: Page, uid: string): Promise<boolean> {
  const d = (await dots(p)).find((q) => q.uid === uid);
  if (!d) return false;
  const c = await canvasBox(p);
  await p.mouse.click(c.x + d.x, c.y + d.y);
  await p.waitForTimeout(800);
  return true;
}

/**
 * Карточка связи «Иаков и Лия — родители; Иуда — сын» из «Родства» Иакова: «ещё N» в строке детей (сразу видно два
 * имени), Enter на имени Иуды. Карточка у звезды Иакова уже открыта.
 */
async function judahLink(p: Page): Promise<string | null> {
  // краткий вид карточки (§ 6: полной нет места) — одна строка «Родства»; «всё родство» — вся карточка
  const all = p.locator('.sky .dotcard .dc-row.all .dc-more');
  if (!(await p.locator('.sky .dotcard .dc-row.children').count()) && (await all.count())) {
    await all.click();
    await p.waitForTimeout(500);
  }
  const row = p.locator('.sky .dotcard .dc-row.children');
  if (!(await row.count())) return 'в «Родстве» Иакова нет строки детей';
  const more = row.locator('.dc-more');
  if (await more.count()) {
    await more.click();
    await p.waitForTimeout(400);
  }
  const b = row.locator('.person[data-id="iuda"]');
  if (!(await b.count())) return 'в «Родстве» Иакова нет Иуды';
  await b.focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(900);
  return (await p.locator('.sky .dotcard[data-kind="link"]').count()) ? null : 'карточка связи не открылась';
}

/** Набор «С Адама»: Адам и его союзы на небе (память браузера, как после начала). */
export const self = (id: string) => [id, { via: 'self', of: id }];
export const ADAM = { work: [self('adam')], reveal: { opened: ['adam'], expanded: {} } };

/** axe-core (WCAG 2.2 AA) по элементу sel: нарушения «правило: цель». */
export async function axeOn(p: Page, sel: string): Promise<string[]> {
  const axe = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
  if (!(await p.evaluate('typeof axe !== "undefined"'))) await p.evaluate(axe);
  return (await p.evaluate(
    `(async () => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return ['нет ' + ${JSON.stringify(sel)}];
      const r = await axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return r.violations.map((v) => v.id + ': ' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join('; ')); })()`,
  )) as string[];
}

/** Нажать клавишу n раз; счётчик нажатий — в k. */
async function press(p: Page, key: string, k: { n: number }, times = 1) {
  for (let i = 0; i < times; i++) {
    await p.keyboard.press(key);
    k.n++;
    await p.waitForTimeout(60);
  }
}

/** Лица и показы Я21: всё небо, набор из лица, его потомки, его созвездие, линии Мессии или его предки. */
const PEOPLE = [
  { id: 'kham', name: 'Хам', group: 'noahides', lines: false },
  { id: 'iakov', name: 'Иаков', group: 'patriarchs', lines: true },
  { id: 'david', name: 'Давид', group: 'davidic', lines: true },
  { id: 'nakhor-syn-farry', name: 'Нахор', group: 'terahites', lines: false },
  { id: 'sif', name: 'Сиф', group: 'sethites', lines: true },
];
const showsOf = (x: (typeof PEOPLE)[number]) => ['va', `vs~n${x.id}`, `vr.${x.id}.d.0.f`, `vg.${x.group}`, x.lines ? 'vl' : `vr.${x.id}.a.0.b`];

/** Я25: трудные случаи места карточки. Каждый открывает карточку и возвращает её вид (или замечание). */
const PLACES: { name: string; run: (p: Page, theme: 'night' | 'day') => Promise<string | null> }[] = [
  {
    name: 'Хам на всём небе',
    run: async (p, theme) => {
      await open(p, '#/kham~va', { theme });
      return (await clickStar(p, 'kham')) ? null : 'нет звезды Хама';
    },
  },
  {
    name: 'Иаков на всём небе (четыре жены, 13 детей)',
    run: async (p, theme) => {
      await open(p, '#/iakov~va', { theme });
      return (await clickStar(p, 'iakov')) ? null : 'нет звезды Иакова';
    },
  },
  {
    name: 'Давид и его дети, семейная укладка',
    run: async (p, theme) => {
      await open(p, '#/david~vr.david.d.1.b', { theme });
      return (await clickStar(p, 'david')) ? null : 'нет звезды Давида';
    },
  },
  {
    name: 'Ной у правого края неба',
    run: async (p, theme) => {
      await open(p, '#/noy~va', { theme });
      const q = await starPt(p, 'noy');
      const c = await canvasBox(p);
      if (!q) return 'нет звезды Ноя';
      await pan(p, c.x + c.width - 70 - q.x, 0);
      return (await clickStar(p, 'noy')) ? null : 'звезда Ноя ушла с неба';
    },
  },
  {
    name: 'Авраам у нижнего правого угла, над органами неба',
    run: async (p, theme) => {
      await open(p, '#/avraam~va', { theme });
      const q = await starPt(p, 'avraam');
      const ctl = await p.locator('.skyctl').boundingBox();
      if (!q || !ctl) return 'нет звезды Авраама или органов неба';
      await pan(p, ctl.x + ctl.width * 0.5 - q.x, ctl.y - 40 - q.y);
      return (await clickStar(p, 'avraam')) ? null : 'звезда Авраама ушла с неба';
    },
  },
  {
    name: 'Карточка союза у ромба Ноя',
    run: async (p, theme) => {
      await open(p, '#/noy~vs~nnoy', { theme, start: 'adam', extra: { work: [self('noy')], reveal: { opened: ['noy'], expanded: {} } } });
      return (await clickDot(p, 'u:noy+')) ? null : 'нет ромба союза Ноя';
    },
  },
  {
    name: 'Карточка связи «Иаков и Лия — родители; Иуда — сын»',
    run: async (p, theme) => {
      await open(p, '#/iakov~va', { theme });
      if (!(await clickStar(p, 'iakov'))) return 'нет звезды Иакова';
      return judahLink(p);
    },
  },
];

async function placeCases(p: Page, width: number): Promise<{ ok: boolean; why: string }> {
  const out: string[] = [];
  const bad: string[] = [];
  const notes: string[] = [];
  for (const theme of ['night', 'day'] as const)
    for (const c of PLACES) {
      const e = await c.run(p, theme);
      if (e) {
        bad.push(`${width} ${theme}, ${c.name}: ${e}`);
        continue;
      }
      const r = await placeIssue(p);
      if (r.why) bad.push(`${width} ${theme}, ${c.name}: ${r.why}`);
      else {
        out.push(c.name);
        if (r.note) notes.push(`${theme}, ${c.name}: ${r.note}`);
      }
    }
  const tail = notes.length ? `; мест нет — ${notes.join('; ')}` : '';
  return bad.length ? { ok: false, why: bad.slice(0, 4).join(' | ') } : { ok: true, why: `${out.length} случаев: обязательного 0 px², желательного 0 px² там, где место есть${tail}` };
}

/** Строки § 5.6 на элементах: тень, скругление больше 2 px, прописные, моноширинный, «·», «→» в тексте. */
export async function templateIssues(p: Page, sels: string[]): Promise<string[]> {
  return (await p.evaluate((sels) => {
    const out: string[] = [];
    for (const sel of sels)
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const all = [el, ...el.querySelectorAll<HTMLElement>('*')];
        for (const e of all) {
          const cs = getComputedStyle(e);
          // тень — размытая (blur > 0), не inset; черта фокуса «0 1px 0» — не тень
          const blur = cs.boxShadow === 'none' || /inset/.test(cs.boxShadow) ? 0 : Math.max(0, ...[...cs.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map((m) => Number(m[3])));
          if (blur > 0 && cs.display !== 'none') out.push(`${sel}: тень у ${e.className || e.tagName}`);
          const rad = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((k) => parseFloat((cs as unknown as Record<string, string>)[k]) || 0));
          if (rad > 2 && !e.matches('.dc-lines i, input[type="radio"], input[type="checkbox"]')) out.push(`${sel}: скругление ${rad} px у ${e.className || e.tagName}`);
          if (cs.textTransform === 'uppercase') out.push(`${sel}: прописные у ${e.className || e.tagName}`);
          if (/mono/i.test(cs.fontFamily)) out.push(`${sel}: моноширинный у ${e.className || e.tagName}`);
        }
        const t = el.innerText;
        if (/·/.test(t)) out.push(`${sel}: «·» в тексте`);
        if (/→/.test(t)) out.push(`${sel}: «→» в тексте`);
      }
    return [...new Set(out)];
  }, sels)) as string[];
}

const PREVIEW = join(ROOT, '.ui-shots/q3');

export const unify11: Scenario[] = [
  {
    n: 810,
    title: 'Я21: один жест — один смысл — Хам, Иаков, Давид, Нахор, Сиф × пять показов (всё небо, набор, потомки, созвездие, линии или предки): щелчок по звезде открывает у неё карточку с «Родством», показ не меняется, камера не сдвигается',
    run: async (p) => {
      const bad: string[] = [];
      let n = 0;
      for (const x of PEOPLE)
        for (const v of showsOf(x)) {
          await open(p, `#/${x.id}~${v}`);
          const q = await inView(p, x.id);
          if (!q) {
            bad.push(`${x.name} ${v}: звезды нет на небе`);
            continue;
          }
          const s0 = await state(p);
          await p.mouse.click(q.x, q.y);
          await p.waitForTimeout(900);
          const c = await cardOf(p);
          const s1 = await state(p);
          if (!c || c.kind !== 'person' || c.name !== x.name) bad.push(`${x.name} ${v}: карточка ${c ? `${c.kind} «${c.name}»` : 'не открылась'}`);
          else if (!(await p.locator('.sky .dotcard .dc-kin').count())) bad.push(`${x.name} ${v}: нет «Родства»`);
          else if (s1.show !== s0.show || s1.ids !== s0.ids) bad.push(`${x.name} ${v}: показ ${s0.show}/${s0.ids} → ${s1.show}/${s1.ids}`);
          else if (s1.view !== s0.view) bad.push(`${x.name} ${v}: камера сдвинулась`);
          else n++;
        }
      return bad.length ? fail(`${n}/25; ${bad.slice(0, 4).join(' | ')}`) : pass('25/25');
    },
  },
  {
    n: 811,
    title: 'Я25, 1440 × 900: место карточки — 7 трудных случаев (Хам, Иаков, Давид с детьми, Ной у правого края, Авраам над органами неба, ромб Ноя, связь Иаков — Иуда) ночью и днём: обязательного — 0 px²; желательного — 0 px², где место есть; где нет — краткий вид и наименьшее перекрытие',
    run: async (p) => {
      const r = await placeCases(p, 1440);
      return r.ok ? pass(r.why) : fail(r.why);
    },
  },
  {
    n: 812,
    title: 'Я25, 1024 × 768: те же 7 случаев ночью и днём — обязательного 0 px²; желательного 0 px², где место есть; где нет — краткий вид',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const r = await placeCases(p, 1024);
      return r.ok ? pass(r.why) : fail(r.why);
    },
  },
  {
    n: 813,
    title: 'Я27: «только Дом Нахора» — три действия («изменить», «нах», Enter): показ «Дом Нахора», лист закрыт, фокус на «изменить», семья Нахора на небе',
    run: async (p) => {
      await open(p, '#/');
      await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).click();
      await p.waitForTimeout(400);
      await p.keyboard.type('нах');
      await p.waitForTimeout(300);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2200);
      const s = await state(p);
      if (s.show !== 'g.nahorites') return fail(`показ: ${s.show}`);
      if (await p.locator('.showsheet').count()) return fail('лист «Показ» не закрылся');
      const f = await p.evaluate(() => document.activeElement?.textContent?.trim());
      if (f !== 'изменить') return fail(`фокус на «${f}»`);
      const bar = flat(await p.locator('.sky .showbar').innerText());
      if (!/^На небе: созвездие «Дом Нахора» — \d+ лиц; основатель Нахор/.test(bar)) return fail(`строка показа: «${bar}»`);
      return pass(bar);
    },
  },
  {
    n: 814,
    title: 'Я27: «все колена» — три действия («изменить», «Созвездия», флажок «Колена Израилевы»): строка «На небе: все колена — …»',
    run: async (p) => {
      await open(p, '#/');
      await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).click();
      await p.waitForTimeout(400);
      await p.locator('.showsheet label.ss-kind:has(input[value="groups"])').click();
      await p.waitForTimeout(300);
      await p.locator('.showsheet .ss-sec-head:has(.ss-toggle:text("Колена Израилевы")) input[type="checkbox"]').click();
      await p.waitForTimeout(2200);
      const s = await state(p);
      const bar = flat(await p.locator('.sky .showbar').innerText());
      if (!s.show.startsWith('g.') || !/^На небе: все колена — /.test(bar)) return fail(`показ ${s.show}; строка «${bar}»`);
      return pass(`${s.ids} лиц; ${bar}`);
    },
  },
  {
    n: 815,
    title: 'Я27: «вся генеалогия Иуды» — после поиска три действия: звезда Иуды, «Только его род ▾», «Потомки — N»: показ «потомки Иуды, по отцам»',
    run: async (p) => {
      await open(p, '#/iuda~va');
      if (!(await clickStar(p, 'iuda'))) return fail('нет звезды Иуды');
      await p.locator('.sky .dotcard .dc-cmds .menu > button', { hasText: 'Предки и потомки' }).click();
      await p.waitForTimeout(300);
      await p.locator('.sky .dotcard [role^="menuitem"]', { hasText: 'Потомки' }).first().click();
      await p.waitForTimeout(2400);
      const s = await state(p);
      if (s.show !== 'r.iuda.d.0.f') return fail(`показ: ${s.show}`);
      const bar = flat(await p.locator('.sky .showbar').innerText());
      return /^На небе: потомки ▾ Иуды/.test(bar) ? pass(`${s.ids} лиц; ${bar}`) : fail(`строка: «${bar}»`);
    },
  },
  {
    n: 816,
    title: 'Я27: Адам → Ной в наборе — не больше 11 действий и без «Вписать»: «+N» у ромбов и «+» у имён по линии Сифа (сдвиг неба, если цель у края, — тоже действие)',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      const LINE = ['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy'];
      const c = await canvasBox(p);
      let acts = 0;
      const steps: string[] = [];
      const hits = async () => ((await p.locator('.sky canvas').getAttribute('data-fold-hits')) ?? '').split(';').map((x) => /^reveal:(.+):(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(x));
      const onSky = async (id: string) => ((await p.locator('.sky canvas').getAttribute('data-stars')) ?? '').split(';').some((s) => s.startsWith(`${id}:`));
      /** Цель у правого или нижнего края — сдвинуть небо (действие). */
      const reach = async (x: number, y: number) => {
        if (x < c.width - 160 && y < c.height - 160) return false;
        await pan(p, Math.min(0, c.width / 2 - x), Math.min(0, c.height / 2 - y));
        acts++;
        steps.push('сдвиг');
        return true;
      };
      for (let i = 0; i < LINE.length - 1 && acts <= 24; i++) {
        const who = LINE[i];
        const next = LINE[i + 1];
        if (await onSky(next)) continue;
        let d = (await dots(p)).find((q) => q.uid.startsWith(`u:${who}+`) && !q.open && q.hidden > 0);
        if (!d) {
          let f = (await hits()).find((m) => m && m[1] === who);
          if (f && (await reach(+f[2], +f[3]))) f = (await hits()).find((m) => m && m[1] === who);
          if (!f) return fail(`у ${who} нет ни ромба с «+N», ни «+» у имени (${steps.join(', ')})`);
          await p.mouse.click(c.x + +f[2] + +f[4] / 2, c.y + +f[3] + +f[5] / 2);
          acts++;
          steps.push(`+ ${who}`);
          await p.waitForTimeout(1300);
          // у лица с одним союзом «+» сразу раскрывает и детей (решение координатора по Я27): следующий уже на небе
          if (await onSky(next)) continue;
          d = (await dots(p)).find((q) => q.uid.startsWith(`u:${who}+`) && !q.open && q.hidden > 0);
          if (!d) return fail(`«+» у ${who} не показал ромб союза (${steps.join(', ')})`);
        }
        if (await reach(d.x, d.y)) {
          d = (await dots(p)).find((q) => q.uid.startsWith(`u:${who}+`) && !q.open && q.hidden > 0);
          if (!d) return fail(`ромб ${who} ушёл после сдвига`);
        }
        await p.mouse.click(c.x + d.x + 14, c.y + d.y);
        acts++;
        steps.push(`+N ${who}`);
        await p.waitForTimeout(1300);
        if (!(await onSky(next))) return fail(`после «+N» у ${who} ${next} не на небе (${steps.join(', ')})`);
      }
      const why = `${acts} действий: ${steps.join(', ')}`;
      return acts <= 11 ? pass(why) : fail(why);
    },
  },
  {
    n: 817,
    title: 'Я30: слова — в верхней строке, строке показа, органах неба, листах «Вид» и «Показ», панели «Набор», карточке у звезды и справке нет «Древо», «В работе», «Раскрыто»; «Всё небо» — только показ, кадр — «Вписать»',
    run: async (p) => {
      await open(p, '#/iakov~va');
      await clickStar(p, 'iakov');
      const texts: string[] = [];
      const grab = async (sel: string) => {
        for (const t of await p.locator(sel).allInnerTexts()) texts.push(flat(t));
      };
      await grab('.top');
      await grab('.sky .skytop');
      await grab('.sky .skyctl');
      await grab('.sky .dotcard');
      await grab('.folio');
      await p.locator('.skyctl .view-toggle').click();
      await p.waitForTimeout(300);
      await grab('.viewpop');
      await p.keyboard.press('Escape');
      await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).click();
      await p.waitForTimeout(300);
      await grab('.showsheet');
      await p.keyboard.press('Escape');
      for (const panel of ['Набор', 'Условные знаки', 'О карте']) {
        await p.locator('.top .commands > button', { hasText: panel }).first().click();
        await p.waitForTimeout(700);
        await grab('.app > .sheet');
      }
      const all = texts.join('\n');
      const words = [/Древо/, /В работе/i, /Раскрыто/].filter((w) => w.test(all)).map(String);
      if (words.length) return fail(`слова: ${words.join(', ')}`);
      const fit = flat(await p.locator('.sky .skyctl').innerText());
      if (/Всё небо/.test(fit) || !/Вписать/.test(fit)) return fail(`органы неба: «${fit}»`);
      return pass();
    },
  },
  {
    n: 818,
    title: 'Я31: цели ромбов союзов не меньше 24 × 24 на мыши; на касании — 44 × 44; команды листа-карточки на телефоне — 44 px',
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      const sizes = ((await p.locator('.sky canvas').getAttribute('data-plates')) ?? '')
        .split(';')
        .filter(Boolean)
        .map((x) => /:(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(x)!)
        .map((m) => ({ w: +m[3], h: +m[4] }));
      if (!sizes.length) return fail('ромбов нет');
      const small = sizes.filter((s) => s.w < 23.5 || s.h < 23.5);
      if (small.length) return fail(`ромбы меньше 24 × 24: ${small.map((s) => `${s.w}×${s.h}`).join(', ')}`);
      return pass(`${sizes.length} ромбов, от ${Math.min(...sizes.map((s) => Math.min(s.w, s.h)))} px`);
    },
  },
  {
    n: 819,
    title: 'Я31, 390 × 844 пальцем: цели ромбов 44 × 44 (касание у края поля открывает карточку союза); лист-карточка Хама — команды «Карточка ▴», «Только его род ▾», «Родство с…», «×» не ниже 44 px',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      // поле ромба в canvas[data-plates] — рисованное, не меньше 24 × 24; на касании input.ts раздувает его до 44 × 44
      // (Q1, plateAt): это проверяется касанием у верхнего и нижнего края поля — в 20 px от середины ромба (слева от ромба
      // — звезда Адама, справа — «+N» со своей целью: там ближняя цель выигрывает по праву)
      const sizes = ((await p.locator('.sky canvas').getAttribute('data-plates')) ?? '')
        .split(';')
        .filter(Boolean)
        .map((x) => /:(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(x)!)
        .map((m) => ({ w: +m[3], h: +m[4] }));
      const small = sizes.filter((s) => s.w < 23.5 || s.h < 23.5);
      if (!sizes.length || small.length) return fail(`ромбы: ${sizes.map((s) => `${s.w}×${s.h}`).join(', ') || 'нет'}`);
      const c = await canvasBox(p);
      for (const dy of [-20, 20]) {
        await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
        const d = (await dots(p)).find((q) => q.uid === 'u:adam+eva');
        if (!d) return fail('нет ромба союза Адама и Евы');
        await p.touchscreen.tap(c.x + d.x, c.y + d.y + dy);
        await p.waitForTimeout(900);
        if (!(await p.locator('.dotcard[data-kind="union"]').count())) return fail(`касание в ${Math.abs(dy)} px ${dy < 0 ? 'выше' : 'ниже'} середины ромба не открыло карточку союза — поле меньше 44 px`);
      }
      await open(p, '#/kham~va');
      const q = await starPt(p, 'kham');
      if (!q) return fail('нет звезды Хама');
      await p.touchscreen.tap(q.x, q.y);
      await p.waitForTimeout(1000);
      const cmds = (await p.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.folio .sheet-dot .dc-cmds button, .folio .sheet-dot > .close')].map((b) => ({ t: b.getAttribute('aria-label') || b.textContent?.trim() || '', h: b.getBoundingClientRect().height })),
      )) as { t: string; h: number }[];
      if (cmds.length < 4) return fail(`команд в листе: ${cmds.map((c) => c.t).join(', ')}`);
      const low = cmds.filter((c) => c.h < 43.5);
      return low.length ? fail(`низкие команды: ${low.map((c) => `${c.t} ${c.h.toFixed(0)}`).join(', ')}`) : pass(`${cmds.length} команд по 44 px`);
    },
  },
  {
    n: 820,
    title: 'Я32: axe (WCAG 2.2 AA) ночью и днём — карточка у звезды Иакова, карточка связи, карточка союза у ромба Ноя, строка показа и лист «Показ»: 0 нарушений',
    run: async (p) => {
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/iakov~va', { theme });
        await clickStar(p, 'iakov');
        out.push(...(await axeOn(p, '.sky .dotcard')).map((x) => `${theme} звезда: ${x}`));
        out.push(...(await axeOn(p, '.sky .showbar')).map((x) => `${theme} строка: ${x}`));
        const e = await judahLink(p);
        if (e) out.push(`${theme}: ${e}`);
        else out.push(...(await axeOn(p, '.sky .dotcard')).map((x) => `${theme} связь: ${x}`));
        await p.keyboard.press('Escape');
        await p.keyboard.press('Escape');
        await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).click();
        await p.waitForTimeout(400);
        out.push(...(await axeOn(p, '.showsheet')).map((x) => `${theme} лист: ${x}`));
        await open(p, '#/noy~vs~nnoy', { theme, start: 'adam', extra: { work: [self('noy')], reveal: { opened: ['noy'], expanded: {} } } });
        if (await clickDot(p, 'u:noy+')) out.push(...(await axeOn(p, '.sky .dotcard')).map((x) => `${theme} союз: ${x}`));
        else out.push(`${theme}: нет ромба Ноя`);
      }
      return out.length ? fail(out.slice(0, 5).join(' | ')) : pass();
    },
  },
  {
    n: 821,
    title: 'Я32: «Дом Нахора» с клавиатуры от неба в фокусе — не больше 12 нажатий: Tab до «изменить», Enter, «нах», Enter; фокус возвращается на «изменить»; строка показа объявляет новый показ',
    run: async (p) => {
      await open(p, '#/');
      const k = { n: 0 };
      // небо в фокусе — как после Tab до неба или щелчка по нему; строка показа — следующая остановка Tab
      await p.locator('.sky canvas').focus();
      for (let i = 0; i < 20; i++) {
        await press(p, 'Tab', k);
        const t = await p.evaluate(() => document.activeElement?.textContent?.trim());
        if (t === 'изменить') break;
      }
      if ((await p.evaluate(() => document.activeElement?.textContent?.trim())) !== 'изменить') return fail(`«изменить» не достигнут за ${k.n} нажатий Tab`);
      await press(p, 'Enter', k);
      await p.waitForTimeout(300);
      for (const ch of 'нах') {
        await p.keyboard.type(ch);
        k.n++;
        await p.waitForTimeout(60);
      }
      await press(p, 'Enter', k);
      await p.waitForTimeout(2000);
      const s = await state(p);
      if (s.show !== 'g.nahorites') return fail(`показ: ${s.show} (${k.n} нажатий)`);
      const f = await p.evaluate(() => document.activeElement?.textContent?.trim());
      if (f !== 'изменить') return fail(`фокус после показа — «${f}»`);
      const said = flat((await p.locator('.sky .showbar [role="status"]').textContent()) ?? '');
      if (!/Дом Нахора/.test(said)) return fail(`живая область: «${said}»`);
      return k.n <= 12 ? pass(`${k.n} нажатий`) : fail(`${k.n} нажатий`);
    },
  },
  {
    n: 822,
    title: 'Я32, сценарий владельца 3: связь «Иаков и Рахиль — родители; Иосиф — сын» с клавиатуры через «Родство» Иосифа — не больше 6 нажатий (Enter на звезде, Enter на имени отца); фокус на заголовке карточки связи; диктор слышит «Связь: …»; Escape — назад к имени, выбор лица прежний',
    run: async (p) => {
      await open(p, '#/iosif~va');
      // звезда Иосифа выбрана и с кольцом клавиатуры: холст в фокусе, Enter — карточка у звезды, фокус — на первом имени «Родства»
      await p.locator('.sky canvas').focus();
      const k = { n: 0 };
      await press(p, 'Enter', k);
      await p.waitForTimeout(900);
      if (!(await p.locator('.sky .dotcard[data-kind="person"]').count())) return fail('Enter на звезде не открыл карточку у звезды');
      for (let i = 0; i < 4; i++) {
        const id = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id);
        if (id === 'iakov') break;
        await press(p, 'ArrowRight', k);
      }
      if ((await p.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id)) !== 'iakov') return fail(`фокус не на Иакове в «Родителях» (${k.n} нажатий)`);
      await press(p, 'Enter', k);
      await p.waitForTimeout(900);
      const title = flat((await p.locator('.sky .dotcard[data-kind="link"] h3').textContent()) ?? '');
      if (title !== 'Иаков и Рахиль — родители; Иосиф — сын') return fail(`заголовок: «${title}»`);
      if ((await p.evaluate(() => document.activeElement?.id)) !== 'dc-link-title') return fail('фокус не на заголовке карточки связи');
      const said = await p.evaluate(() => [...document.querySelectorAll('.sky [aria-live], .sky [role="status"]')].map((e) => e.textContent ?? '').join(' '));
      if (!/Связь: Иаков и Рахиль — родители; Иосиф — сын; Бытие 30/.test(flat(said))) return fail(`диктор: «${flat(said).slice(0, 140)}»`);
      if (!(await state(p)).link) return fail('связь не выбрана (html[data-link])');
      if (hashId(p) !== 'iosif') return fail('выбор лица изменился');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      const back = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id);
      if (back !== 'iakov') return fail(`после Escape фокус на «${back}»`);
      return k.n <= 6 ? pass(`${k.n} нажатий`) : fail(`${k.n} нажатий`);
    },
  },
  {
    n: 823,
    title: 'Карточка связи мышью (§ 8): наведение на имя в «Родстве» подсвечивает его линию; Enter — карточка связи: заголовок, стихи, «Отец», «Мать», «Сын», «Линия», «Союз» — ссылка на карточку союза у ромба; «×» и Escape — назад',
    run: async (p) => {
      await open(p, '#/iakov~va');
      await clickStar(p, 'iakov');
      // наведение на строку детей — её линии подсвечены (previewLinks: небо пишет их в .sky[data-kin-preview])
      // краткий вид карточки (§ 6) — сначала «всё родство», затем наведение на строку детей
      const allRows = p.locator('.sky .dotcard .dc-row.all .dc-more');
      if (!(await p.locator('.sky .dotcard .dc-row.children').count()) && (await allRows.count())) {
        await allRows.click();
        await p.waitForTimeout(500);
      }
      await p.locator('.sky .dotcard .dc-row.children').hover();
      await p.waitForTimeout(300);
      const e = await judahLink(p);
      if (e) return fail(e);
      // этап 13: у Иакова на 1440 × 900 карточке связи бывает мало места — краткий вид: заголовок, стихи, концы с ролями;
      // «всё о связи — ещё N строк» раскрывает «Линию» и «Союз»
      const lc = p.locator('.sky .dotcard[data-kind="link"]');
      let brief = '';
      if (await lc.getAttribute('data-brief').then((v) => v !== null)) {
        const tb = flat(await lc.innerText());
        for (const w of ['Иаков и Лия — родители; Иуда — сын', 'Отец', 'Мать', 'Сын']) if (!tb.includes(w)) return fail(`в краткой карточке связи нет «${w}»: ${tb.slice(0, 160)}`);
        const more = lc.locator('.dc-row.all .dc-more');
        if (!(await more.count())) return fail('в краткой карточке связи нет «всё о связи»');
        await more.click();
        await p.waitForTimeout(500);
        brief = 'краткий вид → всё о связи; ';
      }
      const t = flat(await lc.innerText());
      // этап 13 (решение 105): строка «Линия» — «обе ленты: Мф 1:2 (золотая), Лк 3:33–34 (лазурная)», команды «Подробнее о союзе», «Вписать связь»
      for (const w of ['Иаков и Лия — родители; Иуда — сын', 'Быт 29:35', 'Отец', 'Мать', 'Сын', 'Линия', 'обе ленты: Мф 1:2 (золотая), Лк 3:33–34 (лазурная)', 'Союз', 'Иаков и Лия', 'Подробнее о союзе', 'Вписать связь'])
        if (!t.includes(w)) return fail(`в карточке связи нет «${w}»: ${t.slice(0, 160)}`);
      if (!/~ck?/.test(p.url()) && !(await state(p)).link) return fail('связь не записана в адрес');
      await p.locator('.sky .dotcard .dc-row.union .person').click();
      await p.waitForTimeout(900);
      const u = await cardOf(p);
      if (!u || u.kind !== 'union' || !/^Иаков и Лия/.test(flat(u.name))) return fail(`«Союз» открыл ${u ? `${u.kind} «${u.name}»` : 'ничего'}`);
      return pass(brief);
    },
  },
  {
    n: 824,
    title: 'Карточка союза у ромба (решения 75, 78): «Ной и его жена» — «Раскрыть детей (3)», помета порядка «годы детей — по порядку перечисления, Быт 5:32…», «Карточка союза» — справа; у Адама и Евы — «Другие сыновья и дочери: имена не названы (Быт 5:4)»',
    run: async (p) => {
      await open(p, '#/noy~vs~nnoy', { start: 'adam', extra: { work: [self('noy')], reveal: { opened: ['noy'], expanded: {} } } });
      if (!(await clickDot(p, 'u:noy+'))) return fail('нет ромба союза Ноя');
      const t = flat(await p.locator('.sky .dotcard[data-kind="union"]').innerText());
      for (const w of ['Ной и его жена', 'Показать детей союза (3)', 'годы детей — по порядку перечисления, Быт 5:32', 'Подробнее о союзе'])
        if (!t.includes(w)) return fail(`в карточке союза Ноя нет «${w}»: ${t.slice(0, 200)}`);
      await p.locator('.sky .dotcard .dc-cmds button', { hasText: 'Подробнее о союзе' }).click();
      await p.waitForTimeout(900);
      const folio = flat(await p.locator('.folio').innerText());
      if (!/Ной и его жена/.test(folio)) return fail('справа не карточка союза Ноя');
      await open(p, '#/adam~vs', { start: 'adam', extra: ADAM });
      if (!(await clickDot(p, 'u:adam+eva'))) return fail('нет ромба союза Адама и Евы');
      const a = flat(await p.locator('.sky .dotcard[data-kind="union"]').innerText());
      return /Другие сыновья и дочери: имена не названы \(Быт 5:4\)/.test(a) ? pass() : fail(`карточка Адама и Евы: ${a.slice(0, 200)}`);
    },
  },
  {
    n: 825,
    title: 'Сценарий владельца 9, телефон 390 × 844: касание Хама — нижний лист на 214 px и есть карточка у звезды с «Родством»; второй карточки над небом нет; «Карточка ▴» поднимает лист',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, '#/kham~va');
      const q = await starPt(p, 'kham');
      if (!q) return fail('нет звезды Хама');
      await p.touchscreen.tap(q.x, q.y);
      await p.waitForTimeout(1000);
      if (await p.locator('.sky .dotcard[data-placed]').count()) return fail('над небом — вторая карточка');
      const sheet = await p.locator('.folio').boundingBox();
      const dot = p.locator('.folio .sheet-dot .dotcard');
      if (!(await dot.count())) return fail('в листе нет карточки у звезды');
      const t = flat(await dot.innerText());
      if (!/^Хам/.test(t) || !/Родители/.test(t) || !/Ной и его жена/.test(t)) return fail(`лист: ${t.slice(0, 120)}`);
      if (!sheet || Math.abs(sheet.height - 214) > 16) return fail(`высота листа ${sheet?.height.toFixed(0)}`);
      await p.locator('.folio .sheet-dot .dc-cmds button', { hasText: 'Вся карточка' }).first().tap();
      await p.waitForTimeout(900);
      const up = await p.locator('.folio').boundingBox();
      return up && up.height > 300 ? pass(`лист ${sheet.height.toFixed(0)} → ${up.height.toFixed(0)} px`) : fail('«Карточка ▴» не подняла лист');
    },
  },
  {
    n: 826,
    title: 'Строка показа и лист «Показ» (§ 5, § 7): «Только его род ▾» в карточке — «Потомки — N», строка «На небе: потомки ▾ Иакова …; по отцам ▾ — N лиц — всё небо»; её части — списки; «всё небо» возвращает небо; «Назад» браузера — прежний показ',
    run: async (p) => {
      await open(p, '#/iakov~va');
      await clickStar(p, 'iakov');
      await p.locator('.sky .dotcard .dc-cmds .menu > button', { hasText: 'Предки и потомки' }).click();
      await p.waitForTimeout(300);
      await p.locator('.sky .dotcard [role^="menuitem"]', { hasText: 'Потомки' }).first().click();
      await p.waitForTimeout(2200);
      if ((await state(p)).show !== 'r.iakov.d.0.f') return fail(`показ: ${(await state(p)).show}`);
      const bar = flat(await p.locator('.sky .showbar').innerText());
      if (!/^На небе: потомки ▾ Иакова/.test(bar) || !/по отцам ▾ — \d+ (лицо|лица|лиц)/.test(bar)) return fail(`строка: «${bar}»`);
      if ((await p.locator('.sky .showbar .sb-menu').count()) !== 3) return fail('частей-списков не три');
      await p.goBack();
      await p.waitForTimeout(1500);
      if ((await state(p)).show !== 'a') return fail(`«Назад» — показ ${(await state(p)).show}`);
      return pass(bar);
    },
  },
  {
    n: 827,
    title: 'Я35: § 5.6 ТЗ — карточка у звезды, карточка связи, строка показа, лист «Показ» ночью и днём на 1440: без теней, скруглений больше 2 px, прописных, моноширинных, «·» и «→»; снимки preview-*.png',
    run: async (p) => {
      mkdirSync(PREVIEW, { recursive: true });
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/kham~va', { theme });
        await clickStar(p, 'kham');
        out.push(...(await templateIssues(p, ['.sky .dotcard', '.sky .showbar'])));
        await p.screenshot({ path: join(PREVIEW, `preview-ham-all-1440-${theme}.png`) });
        await open(p, '#/iakov~va', { theme });
        await clickStar(p, 'iakov');
        await p.screenshot({ path: join(PREVIEW, `preview-jacob-kin-1440-${theme}.png`) });
        const e = await judahLink(p);
        if (e) out.push(`${theme}: ${e}`);
        out.push(...(await templateIssues(p, ['.sky .dotcard'])));
        await p.screenshot({ path: join(PREVIEW, `preview-jacob-link-1440-${theme}.png`) });
        await open(p, '#/nakhor-syn-farry~va', { theme });
        await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).click();
        await p.waitForTimeout(300);
        await p.keyboard.type('нах');
        await p.waitForTimeout(400);
        out.push(...(await templateIssues(p, ['.showsheet'])));
        await p.screenshot({ path: join(PREVIEW, `preview-show-sheet-1440-${theme}.png`) });
      }
      return out.length ? fail([...new Set(out)].slice(0, 5).join(' | ')) : pass();
    },
  },
  {
    n: 828,
    title: 'Я35, 390 × 844: § 5.6 — лист-карточка Хама, строка показа и лист «Показ» на телефоне ночью и днём; снимки preview-phone-*.png',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      mkdirSync(PREVIEW, { recursive: true });
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await open(p, '#/kham~va', { theme });
        const q = await starPt(p, 'kham');
        if (!q) return fail('нет звезды Хама');
        await p.touchscreen.tap(q.x, q.y);
        await p.waitForTimeout(1000);
        out.push(...(await templateIssues(p, ['.folio .sheet-dot', '.sky .showbar'])));
        await p.screenshot({ path: join(PREVIEW, `preview-phone-ham-390-${theme}.png`) });
        await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).tap();
        await p.waitForTimeout(500);
        out.push(...(await templateIssues(p, ['.showsheet'])));
        const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (sw > 1) out.push(`прокрутка вбок ${sw} px`);
        await p.screenshot({ path: join(PREVIEW, `preview-phone-show-390-${theme}.png`) });
      }
      return out.length ? fail([...new Set(out)].slice(0, 5).join(' | ')) : pass();
    },
  },
];
