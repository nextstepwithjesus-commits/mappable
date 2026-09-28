/** Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа strip3: номера 410–419, полоса времени и ярусы. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { ROOT } from '../bible.ts';
import { pass, fail, type Check, type Scenario, type View } from './kit.ts';

type Box = { t: string; x: number; y: number; w: number; h: number };

const go = async (p: Page, hash: string, ms = 2600) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.reload();
  await p.waitForTimeout(ms);
};
/** Новая страница в своём окне (ширина, касания): тёмная тема, вступление закрыто. Закрыть — page.context().close(). */
async function openAt(p: Page, v: View, hash: string): Promise<Page> {
  const ctx = await p.context().browser()!.newContext({
    viewport: { width: v.width, height: v.height },
    colorScheme: 'dark',
    isMobile: !!v.touch,
    hasTouch: !!v.touch,
    deviceScaleFactor: v.touch ? 2 : 1,
  });
  const q = await ctx.newPage();
  await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
  await q.goto(p.url().replace(/#.*$/, '') + hash);
  await q.waitForTimeout(2600);
  return q;
}
/** Окно неба в годах (астр.) по полосе времени. */
const win = async (p: Page): Promise<[number, number]> => {
  const [a, b] = ((await p.locator('.strip').getAttribute('data-window')) ?? '').split(' ').map(Number);
  return [a, b];
};
/** Геометрия полосы: рамка холста, x года (астр.) относительно холста и верх поля рамки. */
const geo = async (p: Page) => {
  const cv = p.locator('.strip canvas');
  const box = (await cv.boundingBox())!;
  const vmin = Number(await cv.getAttribute('aria-valuemin'));
  const T0 = vmin < 0 ? vmin + 1 : vmin;
  const PAD = 14;
  const xOf = (t: number) => PAD + ((t - T0) / (2040 - T0)) * (box.width - PAD * 2);
  const top = box.height >= 64 ? 30 : 16;
  return { cv, box, xOf, T0, top };
};
/** Текст и ручки полосы (data-texts, data-grips в TimeStrip.tsx). */
const stripBoxes = async (p: Page) => {
  const d = await p.locator('.strip').evaluate((e) => ({ texts: (e as HTMLElement).dataset.texts ?? '[]', grips: (e as HTMLElement).dataset.grips ?? '[]' }));
  const texts = (JSON.parse(d.texts) as [string, number, number, number, number][]).map(([t, x, y, w, h]) => ({ t, x, y, w, h }));
  const grips = (JSON.parse(d.grips) as [number, number, number, number][]).map(([x, y, w, h]) => ({ t: 'ручка', x, y, w, h }));
  return { texts, grips };
};
const cross = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const fmt = (w: [number, number]) => w.map((v) => v.toFixed(0)).join('…');

/** Наложения на полосе: текст на тексте, на ручке; текст поля рамки на краю рамки; зазор в строке названий меньше 12 px. */
async function stripOverlaps(p: Page): Promise<string[]> {
  const g = await geo(p);
  const [a, b] = await win(p);
  const { texts, grips } = await stripBoxes(p);
  const out: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) if (cross(texts[i], texts[j])) out.push(`«${texts[i].t}» на «${texts[j].t}»`);
    for (const h of grips) if (cross(texts[i], h)) out.push(`«${texts[i].t}» на ручке ${h.x}`);
    const t = texts[i];
    if (t.y >= g.top) for (const x of [g.xOf(a), g.xOf(b)]) if (t.x < x + 1 && x - 1 < t.x + t.w) out.push(`край рамки ${x.toFixed(0)} режет «${t.t}»`);
  }
  const names = texts.filter((t) => t.y < g.top);
  for (const y of new Set(names.map((t) => t.y))) {
    const row = names.filter((t) => t.y === y).sort((m, n) => m.x - n.x);
    for (let i = 1; i < row.length; i++) if (row[i].x - (row[i - 1].x + row[i - 1].w) < 12 - 0.2) out.push(`«${row[i - 1].t}» и «${row[i].t}» ближе 12 px`);
  }
  return out;
}

/** Эпохи модели по умолчанию (данные): годы исторические. */
const epochsData = () => JSON.parse(readFileSync(join(ROOT, 'data/epochs.json'), 'utf8')) as { id: string; name: string; short: string; start: number; end: number }[];
const astro = (h: number) => (h < 0 ? h + 1 : h);

/** Состояние ярусов эпох на холсте неба (src/render/tiers.ts, data-tiers). */
type TiersState = {
  prophets: string[];
  basis: Record<string, string>;
  formula: { text: string[] } | null;
  column: { contrast: number; fill: [number, number]; lines: number[]; cuts: number; feather: [number, number] } | null;
};
const tiers = async (p: Page): Promise<TiersState | null> => {
  const raw = await p.locator('.sky > canvas').first().getAttribute('data-tiers');
  return raw ? (JSON.parse(raw) as TiersState) : null;
};

export const strip3: Scenario[] = [
  {
    n: 410,
    title: 'MOB-68, VIS-65: на «всём небе» при 390, 768, 844 × 390 и 1440 тексты полосы не ложатся друг на друга и на ручки, края рамки не режут подписи; у Давида на 390 — «канон» слева, «сегодня» справа',
    run: async (p): Promise<Check> => {
      const views: [string, View][] = [
        ['390', { width: 390, height: 844, touch: true }],
        ['768', { width: 768, height: 1024, touch: true }],
        ['844×390', { width: 844, height: 390, touch: true }],
        ['1440', { width: 1440, height: 900 }],
      ];
      const notes: string[] = [];
      for (const [tag, v] of views) {
        const q = await openAt(p, v, '#/');
        try {
          const bad = await stripOverlaps(q);
          if (bad.length) return fail(`${tag}: ${bad.slice(0, 4).join('; ')}`);
          const { texts } = await stripBoxes(q);
          notes.push(`${tag}: ${texts.length} подписей`);
        } finally {
          await q.context().close();
        }
      }
      const q = await openAt(p, { width: 390, height: 844, touch: true }, '#/david');
      try {
        const bad = await stripOverlaps(q);
        if (bad.length) return fail(`390, Давид: ${bad.slice(0, 4).join('; ')}`);
        const { texts } = await stripBoxes(q);
        const canon = texts.find((t) => t.t === 'канон');
        const today = texts.find((t) => t.t === 'сегодня');
        if (!canon || !today) return fail(`390, Давид: подписи поля — ${texts.filter((t) => t.y >= 16).map((t) => t.t).join(', ')}`);
        if (!(canon.x < today.x) || canon.y !== today.y) return fail('390, Давид: «канон» не слева от «сегодня» в одной строке');
      } finally {
        await q.context().close();
      }
      return pass(notes.join('; '));
    },
  },
  {
    n: 411,
    title: 'VIS-65: черты границ эпох не заходят в строки названий — над названиями нет ни одной черты',
    run: async (p) => {
      await go(p, '#/david');
      await p.mouse.move(700, 300);
      const g = await geo(p);
      const cols = epochsData().map((e) => Math.round(g.xOf(astro(e.start))));
      const W = Math.round(g.box.width);
      // строки 0 и 1 холста: над текстом; прежде черта шла от 0 до низа полосы
      const bad = (await p.evaluate(`(() => {
        const c = document.querySelector('.strip canvas');
        const d = c.getContext('2d').getImageData(0, 0, ${W}, 2).data;
        const px = (x, y) => [d[(y * ${W} + x) * 4], d[(y * ${W} + x) * 4 + 1], d[(y * ${W} + x) * 4 + 2]];
        const out = [];
        for (const x0 of ${JSON.stringify(cols)}) for (let x = x0 - 1; x <= x0 + 1; x++) for (const y of [0, 1]) {
          if (x < 3 || x > ${W} - 3) continue;
          const a = px(x - 2, y), b = px(x + 2, y), m = px(x, y);
          if (m.some((v, k) => v > Math.max(a[k], b[k]) + 3 || v < Math.min(a[k], b[k]) - 3)) out.push(x + ':' + y + ' ' + m.join(','));
        }
        return out;
      })()`)) as string[];
      return bad.length ? fail(`черты в строке названий: ${bad.slice(0, 5).join('; ')}`) : pass(`${cols.length} границ, над названиями черт нет`);
    },
  },
  {
    n: 412,
    title: 'IX-78: щелчок вне рамки — небо трогается сразу (не позже 120 мс после отпускания); двойной щелчок прерывает переход и ведёт ко всему небу',
    run: async (p) => {
      await go(p, '#/david');
      const g = await geo(p);
      const y = g.box.y + g.top + (g.box.height - g.top) / 2;
      const rec = p.evaluate(`new Promise((res) => {
        const out = [];
        let up = null;
        document.querySelector('.strip canvas').addEventListener('pointerup', () => { up = performance.now(); }, { once: true });
        const s = performance.now();
        const tick = () => {
          out.push([performance.now(), document.querySelector('.strip').dataset.window || '']);
          if (performance.now() - s < 1200) requestAnimationFrame(tick);
          else res({ out, up });
        };
        requestAnimationFrame(tick);
      })`) as Promise<{ out: [number, string][]; up: number | null }>;
      await p.waitForTimeout(50);
      await p.mouse.click(g.box.x + g.xOf(-2300), y);
      const { out, up } = await rec;
      if (up === null) return fail('отпускания на полосе не было');
      const base = out.filter(([t]) => t <= up).pop()?.[1];
      const first = out.find(([t, w]) => t > up && w !== base);
      if (!first) return fail('окно не сдвинулось');
      const lag = first[0] - up;
      if (lag > 120) return fail(`небо тронулось через ${lag.toFixed(0)} мс после отпускания`);
      await p.waitForTimeout(600);
      await p.mouse.dblclick(g.box.x + g.xOf(-3000), y);
      await p.waitForTimeout(1800);
      const [a, b] = await win(p);
      if (!(a < -3900 && b > 0)) return fail(`двойной щелчок: окно ${a.toFixed(0)}…${b.toFixed(0)}, а не всё небо`);
      return pass(`первый кадр движения — через ${lag.toFixed(0)} мс; двойной щелчок — всё небо ${a.toFixed(0)}…${b.toFixed(0)}`);
    },
  },
  {
    n: 413,
    title: 'IX-57, решение 47: колесо над полосой — ширина окна ×1,25 у года под указателем; Shift + колесо — сдвиг; Ctrl + Shift + колесо — растяжение времени',
    run: async (p) => {
      await go(p, '#/david~y-1000~w300');
      const g = await geo(p);
      const w0 = await win(p);
      const y = g.box.y + g.top + (g.box.height - g.top) / 2;
      // указатель — на трети рамки: год под ним остаётся на той же доле окна
      const t = w0[0] + (w0[1] - w0[0]) / 3;
      await p.mouse.move(g.box.x + g.xOf(t), y);
      await p.waitForTimeout(300);
      await p.mouse.wheel(0, -100);
      await p.waitForTimeout(500);
      const w1 = await win(p);
      const r1 = (w0[1] - w0[0]) / (w1[1] - w1[0]);
      if (Math.abs(r1 - 1.25) > 0.04) return fail(`колесо вверх: окно ${fmt(w0)} → ${fmt(w1)}, в ${r1.toFixed(3)} раза`);
      const f0 = (t - w0[0]) / (w0[1] - w0[0]);
      const f1 = (t - w1[0]) / (w1[1] - w1[0]);
      if (Math.abs(f0 - f1) > 0.02) return fail(`год под указателем ушёл: доля ${f0.toFixed(3)} → ${f1.toFixed(3)}`);
      await p.mouse.wheel(0, 100);
      await p.waitForTimeout(500);
      const w2 = await win(p);
      if (Math.abs((w2[1] - w2[0]) / (w1[1] - w1[0]) - 1.25) > 0.04) return fail(`колесо вниз: окно ${fmt(w1)} → ${fmt(w2)}`);
      await p.keyboard.down('Shift');
      await p.mouse.wheel(0, 100);
      await p.keyboard.up('Shift');
      await p.waitForTimeout(500);
      const w3 = await win(p);
      if (!(w3[0] > w2[0] + 3)) return fail(`Shift + колесо не сдвинуло окно позже: ${fmt(w2)} → ${fmt(w3)}`);
      if (Math.abs(w3[1] - w3[0] - (w2[1] - w2[0])) > (w2[1] - w2[0]) * 0.01) return fail(`Shift + колесо изменило ширину: ${fmt(w2)} → ${fmt(w3)}`);
      await p.keyboard.down('Control');
      await p.keyboard.down('Shift');
      await p.mouse.wheel(0, -100);
      await p.keyboard.up('Shift');
      await p.keyboard.up('Control');
      await p.waitForTimeout(500);
      const w4 = await win(p);
      const r4 = (w3[1] - w3[0]) / (w4[1] - w4[0]);
      if (Math.abs(r4 - 1.25) > 0.05) return fail(`Ctrl + Shift + колесо: окно ${fmt(w3)} → ${fmt(w4)}`);
      const zoom = await p.evaluate(() => visualViewport?.scale ?? 1);
      if (zoom !== 1) return fail(`страница масштабировалась: ${zoom}`);
      return pass(`${fmt(w0)} → ${fmt(w1)} → ${fmt(w2)}; Shift: ${fmt(w3)}; Ctrl + Shift: ${fmt(w4)}`);
    },
  },
  {
    n: 414,
    title: 'VIS-64, решение 53: столбец Давида залит только в ярусах (1,12 : 1); на небе — две черты по краям ядра, растушёвка краёв, само небо в столбце не перекрашено',
    run: async (p) => {
      await go(p, '#/david~y-1000~w400~e1', 3200);
      const t = await tiers(p);
      if (!t?.column) return fail('столбца нет');
      const c = t.column;
      if (c.contrast < 1.1 || c.contrast > 1.125) return fail(`заливка в ярусах — ${c.contrast} : 1`);
      if (c.lines.length !== 2) return fail(`черт на небе ${c.lines.length}`);
      if (!(c.feather[0] > 2 && c.feather[1] > 2)) return fail(`растушёвки краёв нет: ${c.feather.join(', ')}`);
      const bottom = c.fill[1];
      // небо под ярусами: медиана цвета по вертикали в середине ядра и сразу за растушёвкой справа (та же эпоха)
      const xin = Math.round((c.lines[0] + c.lines[1]) / 2);
      const xout = Math.round(c.lines[1] + c.feather[1] + 20);
      const lum = (await p.evaluate(`(() => {
        const cv = document.querySelector('.sky > canvas');
        const k = cv.width / cv.getBoundingClientRect().width;
        const y0 = Math.round((${bottom} + 30) * k), y1 = Math.round((cv.getBoundingClientRect().height - 140) * k);
        const med = (x) => {
          const d = cv.getContext('2d').getImageData(Math.round(x * k), y0, 1, y1 - y0).data;
          const v = [];
          for (let i = 0; i < d.length; i += 4) {
            const ch = [d[i], d[i + 1], d[i + 2]].map((u) => { u /= 255; return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); });
            v.push(0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]);
          }
          v.sort((a, b) => a - b);
          return v[v.length >> 1];
        };
        return [med(${xin}), med(${xout})];
      })()`)) as [number, number];
      const ratio = (Math.max(...lum) + 0.05) / (Math.min(...lum) + 0.05);
      if (ratio > 1.03) return fail(`небо в столбце перекрашено: ${ratio.toFixed(3)} : 1 к небу рядом`);
      return pass(`в ярусах ${c.contrast} : 1; на небе ${ratio.toFixed(3)} : 1; черты ${c.lines.join(', ')}, обрывов у подписей ${c.cuts}; растушёвка ${c.feather.join(' и ')} px`);
    },
  },
  {
    n: 415,
    title: 'MAP-48: Моисей, Аарон и Мариам в «Пророках» с основанием (Втор 34:10, Исх 7:1, Исх 15:20); формула столбца двусторонняя — «после…, до…»',
    run: async (p) => {
      await go(p, '#/moisey~e1', 3400);
      const t = await tiers(p);
      if (!t) return fail('ярусы не нарисованы');
      for (const id of ['moisey', 'aaron', 'mariam']) if (!t.prophets.includes(id)) return fail(`в «Пророках» нет ${id}: ${t.prophets.join(', ')}`);
      if (t.basis.moisey !== 'Втор 34:10') return fail(`основание у Моисея — ${t.basis.moisey}`);
      if (!/^Исх (4:16|7:1)/.test(t.basis.aaron ?? '')) return fail(`основание у Аарона — ${t.basis.aaron}`);
      const f = t.formula?.text[0] ?? '';
      if (!/^Моисей родился после рождения Аарона и до рождения \S+/.test(f)) return fail(`формула: «${f}»`);
      return pass(`Моисей — ${t.basis.moisey}, Аарон — ${t.basis.aaron}; «${f}»`);
    },
  },
  {
    n: 416,
    title: 'MOB-39, CARD-90: в панели «Эпохи» на сенсорном экране названия эпох — строкой 44 px; тильда приближения — словами',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/~pepochs');
      const hs = await p.locator('.sheet table.epochs th a, .epoch h3 .person').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
      if (hs.length < 16) return fail(`названий эпох ${hs.length}`);
      const low = hs.filter((h) => h < 44);
      if (low.length) return fail(`${low.length} названий ниже 44 px: ${low.slice(0, 5).join(', ')}`);
      const text = (await p.locator('.sheet').innerText()).replace(/[\u00a0\u2060]/g, ' ');
      if (/~/.test(text)) return fail('в панели осталась тильда');
      if (!/примерно\s+в\s+325\s+лет/.test(text) || !/около\s+390/.test(text)) return fail('нет «примерно в 325 лет» или «около 390»');
      return pass(`${hs.length} названий по 44 px и выше; «примерно в 325 лет», «около 390»`);
    },
  },
  {
    n: 417,
    title: 'VIS-65: эпоха без подписи на узкой полосе названа во флажке над строкой названий, а не третьей строкой',
    run: async (p) => {
      const q = await openAt(p, { width: 1024, height: 768 }, '#/david');
      try {
        const g = await geo(q);
        const { texts } = await stripBoxes(q);
        const shown = new Set(texts.map((t) => t.t));
        const e = epochsData().find((x) => !shown.has(x.short) && astro(x.start) < 100);
        if (!e) return pass('на 1024 подписаны все эпохи');
        const rows = new Set(texts.filter((t) => t.y < g.top).map((t) => t.y));
        if (rows.size > 2) return fail(`строк названий ${rows.size}`);
        await q.mouse.move(g.box.x + g.xOf((astro(e.start) + astro(e.end)) / 2), g.box.y + 8);
        await q.waitForTimeout(600);
        const flag = ((await q.locator('.strip').getAttribute('data-flag')) ?? '').replace(/ /g, ' ');
        return flag.includes(e.name) ? pass(`«${flag}»`) : fail(`над «${e.short}» флажок «${flag}»`);
      } finally {
        await q.context().close();
      }
    },
  },
];
