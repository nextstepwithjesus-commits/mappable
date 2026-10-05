/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа card3: номера 420–434, оболочка
 * карточки и время (L8a): переходы между карточками (CARD-76), разворот (CARD-88, решение 64), команды на 1024 px
 * (VIS-79, IX-81), рейка и ручка (VIS-66), строка стопки (VIS-71, UX-75), ссылки на стихи (VIS-62, IX-42), паспорт
 * (VIS-70), выбор второго лица на узком низком экране (MOB-72), время в § 13 (CARD-78, CARD-86).
 * Полный обход всех лиц (CARD-76) — отдельным скриптом, здесь — короткий вариант.
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 2000) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Перейти по адресу без перезагрузки. */
const hop = async (p: Page, id: string, ms = 1300) => {
  await p.evaluate((h) => (location.hash = h), `#/${id}`);
  await p.waitForTimeout(ms);
};
/** Найти лицо поиском: «/», имя, Enter. */
const find = async (p: Page, q: string, ms = 1600) => {
  await p.click('#find');
  await p.fill('#find', q);
  await p.waitForTimeout(350);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(ms);
};
/** Шапка карточки — этого лица, тело не бледное (том пришёл). */
const settled = (p: Page, id: string) =>
  p
    .waitForFunction(
      (id) => document.querySelector('.folio .mast h2')?.id === `title-${id}` && !document.querySelector('.folio .folio-body.stale') && !!document.querySelector('.folio .colophon'),
      id,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false);
/** Текст разделов карточки (строкой — у tsx именованные функции внутри evaluate не работают). */
const sections = (p: Page) =>
  p.evaluate(`(() => {
    const o = {};
    for (const el of document.querySelectorAll('.folio [id^="sec-"]')) o[el.id] = el.innerText.replace(/\\s+/g, ' ').trim();
    const b = document.querySelector('.folio .brief');
    o.brief = b ? b.innerText.replace(/\\s+/g, ' ').trim() : '';
    return o;
  })()`) as Promise<Record<string, string>>;

/** Разделы после переходов совпадают с чистой загрузкой того же лица (новая вкладка того же окна). */
async function sameAsClean(p: Page, id: string): Promise<string> {
  if (!(await settled(p, id))) return `${id}: карточка не обновилась`;
  await p.waitForTimeout(250);
  const a = await sections(p);
  const q = await p.context().newPage();
  const errs: string[] = [];
  q.on('pageerror', (e) => errs.push(e.message));
  try {
    await q.goto(p.url().replace(/#.*$/, '') + `#/${id}`);
    if (!(await settled(q, id))) return `${id}: чистая загрузка не успокоилась`;
    await q.waitForTimeout(250);
    const b = await sections(q);
    if (errs.length) return `${id}: ошибка чистой загрузки ${errs[0]}`;
    // § 14 («Встречи») больше не зависит от загруженных томов: встречи из карточек других лиц переписаны в карточку
    // владельца при сборке (card.metBy, L8b) — сверяется вместе со всеми разделами
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
    return keys.length ? `${id}: ${keys.slice(0, 3).map((k) => `${k} «${(a[k] ?? '').slice(0, 50)}» ≠ «${(b[k] ?? '').slice(0, 50)}»`).join('; ')}` : '';
  } finally {
    await q.close();
  }
}

export const card3: Scenario[] = [
  {
    n: 420,
    title: 'CARD-76: Саул, сын Симеона → поиск «Шуа»; Шиллем → Зимри → Ефан → Давид; обход 40 лиц по 300 мс — без ошибок, разделы как при чистой загрузке',
    run: async (p) => {
      const errors: string[] = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await go(p, '#/saul-syn-simeona', 2500);
      await find(p, 'Шуа');
      if (hashId(p) !== 'shua-khananeyanin') return fail(`поиск «Шуа» выбрал «${hashId(p)}»`);
      let bad = await sameAsClean(p, 'shua-khananeyanin');
      if (bad) return fail(bad);
      for (const id of ['shillem', 'zimri-syn-zary', 'efan-syn-zary', 'david']) await hop(p, id, 1200);
      bad = await sameAsClean(p, 'david');
      if (bad) return fail(bad);
      // обход по порядку данных с шагом 300 мс: у каждого 10-го — сравнение с чистой загрузкой
      const ids = [
        'adam', 'eva', 'kain', 'avel', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh',
        'mafusal', 'lamekh', 'noy', 'sim', 'kham', 'iafet', 'arfaksad', 'sala', 'ever', 'falek',
        'isaak', 'isav', 'iakov', 'ruvim', 'simeon', 'leviy', 'iuda', 'iosif', 'veniamin', 'ruf',
        'vooz', 'ovid', 'iessey', 'solomon', 'rovoam', 'moisey', 'aaron', 'mariya', 'iisus', 'ioann-krestitel',
      ];
      const seen: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        await hop(p, ids[i], 300);
        const title = await p.evaluate(() => document.querySelector('.folio .mast h2')?.id ?? '');
        if (title !== `title-${ids[i]}`) return fail(`шаг ${i}: шапка «${title}», а не ${ids[i]}`);
        if (i % 10 === 9) {
          bad = await sameAsClean(p, ids[i]);
          if (bad) return fail(bad);
          seen.push(ids[i]);
        }
      }
      if (errors.length) return fail(`ошибка страницы: ${errors[0]}`);
      return pass(`сверены с чистой загрузкой: Шуа, Давид, ${seen.join(', ')}`);
    },
  },
  {
    n: 421,
    title: 'VIS-79, IX-81, 1024 × 768, решение 194: команды неба — одной строкой («К звезде», «Ближайшая родня», «Предки и потомки ▾»), команды сравнения — одной строкой, «В набор» (решение 156) (полные названия — в имени кнопок)',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await go(p, '#/david');
      const r = await p.evaluate(() =>
        // этап 20 (решение 194): «К звезде» — в строке команд неба выше; здесь — строка сравнения и набора
        [...document.querySelectorAll<HTMLElement>('.folio .actions:not(.sky-cmds) > button, .folio .actions:not(.sky-cmds) > .workbtn > button')].map((b) => ({
          t: b.innerText.replace(/[▾▴]/g, '').replace(/\s+/g, ' ').trim(),
          name: b.getAttribute('aria-label') ?? b.innerText.trim(),
          y: Math.round(b.getBoundingClientRect().top),
        })),
      );
      const names = r.map((x) => x.t).join(' | ');
      // этап 11: «Добавить в набор» (Я30: слово «набор») на узком листе — «В набор», полное название — в имени кнопки
      if (names !== 'Родство с… | Разворот с… | В набор') return fail(`команды: ${names}`);
      if (new Set(r.map((x) => x.y)).size !== 1) return fail(`команды в ${new Set(r.map((x) => x.y)).size} строки`);
      if (r[2].name !== 'Добавить в набор') return fail(`имя третьей кнопки «${r[2].name}»`);
      const star = await p.locator('.folio .actions.sky-cmds .show-on-sky').getAttribute('aria-label');
      if (star !== 'К звезде') return fail(`имя «К звезде» — «${star}»`);
      const skyRows = await p.locator('.folio .actions.sky-cmds > button, .folio .actions.sky-cmds .menu > button').evaluateAll((bs) => new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);
      if (skyRows !== 1) return fail(`команды неба в ${skyRows} строки`);
      return pass(names);
    },
  },
  {
    n: 422,
    title: 'VIS-66: метка рейки целиком принадлежит рейке — ручка границы «небо | карточка» её не перекрывает',
    run: async (p) => {
      await go(p, '#/david');
      for (const k of [0, 5, 10]) {
        const b = await p.locator('.folio .rail button').nth(k).boundingBox();
        if (!b) return fail(`нет метки ${k}`);
        if (b.y + b.height > (p.viewportSize()?.height ?? 900) - 80) continue;
        const miss = await p.evaluate(
          ({ x0, w, y }) => {
            const out: number[] = [];
            for (let x = x0; x < x0 + w; x += 1) if (!document.elementFromPoint(x, y)?.closest('.rail')) out.push(Math.round(x - x0));
            return out;
          },
          { x0: Math.ceil(b.x), w: Math.floor(b.width), y: Math.round(b.y + b.height / 2) },
        );
        if (miss.length) return fail(`метка ${k + 1}: ${miss.length} px не у рейки (с ${miss[0]} px)`);
      }
      return pass();
    },
  },
  {
    n: 423,
    // этап 12, решение 91: строки стопки нет — имена стоят во вкладках; смысл прежний (VIS-71, UX-75): имя целиком, без
    // многоточия, строка не обрезана краем листа
    title: 'VIS-71, UX-75 (решение 91): во вкладке — имя целиком, уточнение целыми словами, без обрезки посреди слова; строка вкладки не шире листа',
    run: async (p) => {
      await go(p, '#/david', 1800);
      const pin = async () => {
        await p.locator('.folio .folio-bar .pin-card').click();
        await p.waitForTimeout(250);
      };
      await pin();
      await find(p, 'Руфь');
      await pin();
      await find(p, 'Иосиф');
      await pin();
      await find(p, 'Соломон');
      const names = (await p.locator('.folio .card-tabs .nm').allInnerTexts()).map((t) => t.trim());
      if (names.join(', ') !== 'Давид, Руфь, Иосиф') return fail(`вкладки: ${names.join(', ')}`);
      if (names.some((n) => /…/.test(n))) return fail(`многоточие в имени: ${names.join(', ')}`);
      const r = await p.evaluate(`[...document.querySelectorAll('.folio .card-tab')].map((li) => {
        const b = li.querySelector('.tab-open'); const ds = li.querySelector('.ds');
        return { fit: b.scrollWidth <= b.clientWidth + 1, ds: ds ? ds.textContent : '', full: b.getAttribute('aria-label') };
      })`) as { fit: boolean; ds: string; full: string }[];
      for (const x of r) {
        if (!x.fit) return fail(`строка вкладки обрезана краем: ${x.full}`);
        if (x.ds.endsWith('…') && !x.full.replace(/\u00a0/g, ' ').includes(x.ds.slice(0, -1).replace(/\u00a0/g, ' ').replace(/[,;]$/, ''))) return fail(`уточнение не по словам: «${x.ds}» из «${x.full}»`);
      }
      return pass(r.map((x) => x.full).join(' | '));
    },
  },
  {
    n: 424,
    title: 'VIS-62: перенесённая строка ссылок на стих — вровень с колонкой текста; «Первое упоминание: Руф 4:17» — один пробел',
    run: async (p) => {
      await go(p, '#/david');
      const r = await p.evaluate(() => {
        const out: string[] = [];
        for (const n of [5, 7, 9, 15]) {
          const el = document.querySelector(`.folio #sec-${n}`);
          const col = el?.querySelector('h4')?.getBoundingClientRect().left;
          if (!el || col === undefined) continue;
          for (const r of el.querySelectorAll('.refs'))
            for (const q of r.getClientRects()) if (q.width > 1 && Math.abs(q.left - col) < 12 && Math.abs(q.left - col) > 0.5) out.push(`§ ${n}: ${(q.left - col).toFixed(1)} px`);
        }
        return out;
      });
      if (r.length) return fail(r.slice(0, 3).join('; '));
      const gap = await p.evaluate(() => {
        const sec = document.querySelector('.folio #sec-23');
        const p23 = [...(sec?.querySelectorAll('p') ?? [])].find((x) => x.textContent?.startsWith('Первое упоминание'));
        const ref = p23?.querySelector('button.ref');
        if (!p23 || !ref) return null;
        const rg = document.createRange();
        const tn = p23.firstChild!;
        rg.setStart(tn, 0);
        rg.setEnd(tn, (tn.textContent ?? '').trimEnd().length);
        return Math.round(ref.getBoundingClientRect().left - rg.getBoundingClientRect().right);
      });
      if (gap === null) return fail('нет строки «Первое упоминание»');
      return gap <= 6 ? pass(`зазор ${gap} px`) : fail(`зазор перед ссылкой ${gap} px`);
    },
  },
  {
    n: 425,
    title: 'IX-42: ссылки на стихи раздела — одна остановка Tab; стрелки ← → ходят по ссылкам раздела',
    run: async (p) => {
      await go(p, '#/david');
      await p.locator('.folio .mast h2').focus();
      const bySec = new Map<string, number>();
      let stops = 0;
      for (let i = 0; i < 400; i++) {
        await p.keyboard.press('Tab');
        const w = await p.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return { inFolio: !!a?.closest('.folio'), ref: !!a?.matches('.refs button'), sec: a?.closest('.sec')?.id ?? '' };
        });
        if (!w.inFolio) break;
        stops++;
        if (w.ref && w.sec) bySec.set(w.sec, (bySec.get(w.sec) ?? 0) + 1);
      }
      const many = [...bySec].filter(([, n]) => n > 1);
      if (many.length) return fail(`несколько остановок ссылок: ${many.map(([s, n]) => `${s} × ${n}`).join(', ')}`);
      if (!bySec.size) return fail('ссылки на стихи вовсе не достижимы с Tab');
      // стрелка вправо — следующая ссылка того же раздела, Tab из неё уходит за ссылки раздела
      const first = p.locator('.folio #sec-5 .refs button').first();
      await first.focus();
      await p.keyboard.press('ArrowRight');
      const moved = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const all = [...document.querySelectorAll('.folio #sec-5 .refs button')];
        return { idx: a ? all.indexOf(a) : -1, sec: a?.closest('.sec')?.id };
      });
      if (moved.sec !== 'sec-5' || moved.idx !== 1) return fail(`→ перевела фокус на ${moved.sec} #${moved.idx}`);
      return pass(`остановок Tab в карточке ${stops}; ссылок — по одной в ${bySec.size} разделах`);
    },
  },
  {
    n: 426,
    title: 'MOB-72, 720 × 450 (масштаб 200 %): Enter на «Родство с…» — фокус на небе; Escape — фокус на кнопке, видимой в листе',
    view: { width: 720, height: 450 },
    run: async (p) => {
      await go(p, '#/david', 2500);
      const btn = p.locator('.folio .actions button', { hasText: 'Родство с' });
      if (!(await btn.isVisible())) {
        await p.locator('.folio .sheet-bar .bar-toggle').click();
        await p.waitForTimeout(500);
      }
      await btn.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      const on = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return { sky: !!a?.closest('.sky'), tag: a?.tagName };
      });
      if (!on.sky) return fail(`после «Родство с…» фокус на ${on.tag}, а не на небе`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(900);
      const back = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        const r = a?.getBoundingClientRect();
        const bar = document.querySelector('.folio .sheet-bar')?.getBoundingClientRect();
        return { text: a?.textContent?.trim() ?? '', top: r?.top ?? -1, bottom: r?.bottom ?? 1e9, h: innerHeight, barBottom: bar?.bottom ?? 0 };
      });
      if (!/^Родство с/.test(back.text)) return fail(`после Escape фокус на «${back.text}»`);
      if (back.bottom > back.h || back.top < back.barBottom) return fail(`кнопка вне видимой части листа: ${Math.round(back.top)}–${Math.round(back.bottom)} при окне ${back.h}`);
      return pass();
    },
  },
  {
    n: 427,
    title: 'CARD-88, решение 64: разворот Давид — Руфь: несоставленный раздел — «— раздел не составлен», не «не сообщается»',
    run: async (p) => {
      await go(p, '#/david~pspread~adavid~bruf', 3000);
      const t = await p.locator('.spread').innerText();
      if (/(^|\n)\s*не сообщается/.test(t) || /Руфь:\s*не сообщается/.test(t)) return fail('несоставленный раздел подписан «не сообщается»');
      const absent = await p.locator('.spread .none.absent').count();
      if (!absent) return fail('нет строки «раздел не составлен»');
      const txt = (await p.locator('.spread .none.absent').first().innerText()).replace(/\s+/g, ' ').trim();
      if (txt !== '— раздел не составлен') return fail(`строка «${txt}»`);
      // раздел, не составленный у обоих лиц, строкой не выводится
      const both = await p.evaluate(() => [...document.querySelectorAll('.spread .row')].filter((r) => r.querySelectorAll('.none.absent').length === 2).length);
      return both ? fail(`${both} строк, где раздел не составлен у обоих`) : pass(`${absent} строк «раздел не составлен»`);
    },
  },
  {
    n: 428,
    title: 'VIS-70: значения паспорта у разных карточек начинаются с одной вертикали',
    run: async (p) => {
      const xs: string[] = [];
      for (const id of ['david', 'melkhisedek', 'ruf', 'ludim']) {
        await go(p, `#/${id}`, 1600);
        const x = await p.evaluate(() => {
          const dd = [...document.querySelectorAll<HTMLElement>('.folio .passport > dd')][0];
          return dd ? Math.round(dd.getBoundingClientRect().left) : -1;
        });
        xs.push(`${id} ${x}`);
      }
      return new Set(xs.map((s) => s.split(' ')[1])).size === 1 ? pass(xs.join(', ')) : fail(xs.join(', '));
    },
  },
  {
    n: 429,
    title: 'CARD-78, CARD-86: § 13 Иессея — «Судьи»; у Иисуса — не «после матери», у Давида — «за 30 лет до воцарения»',
    run: async (p) => {
      await go(p, '#/iessey');
      const i = (await p.locator('.folio #sec-13').innerText()).replace(/\s+/g, ' ');
      // этап 13, решение 100: строка «Эпоха» — эпоха жизни и «родился в эпоху …», если эпоха рождения иная
      if (!/Эпоха Единое царство \([^)]*\); родился в эпоху «Судьи»/.test(i)) return fail(`Иессей: ${i.slice(0, 200)}`);
      await go(p, '#/iisus');
      const j = (await p.locator('.folio #sec-13').innerText()).replace(/\s+/g, ' ');
      if (/после матери/.test(j)) return fail('Иисус: «после матери»');
      await go(p, '#/david');
      const d = (await p.locator('.folio #sec-13').innerText()).replace(/\s+/g, ' ');
      if (!/Родился за 30 лет до воцарения/.test(d)) return fail(`Давид: ${d.slice(0, 120)}`);
      return pass();
    },
  },
];
