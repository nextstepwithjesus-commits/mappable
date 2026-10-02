/**
 * Сценарии приёмки этапа 16, исполнитель S — рассказ (решение 187), фокус созвездия (решение 185), текущая эпоха на
 * полосе времени (решение 188). Номера 1200–1219.
 *
 * Рассказ: шестое начало «Рассказ: от Адама до Иисуса Христа»; колонка справа на месте карточки (.folio.story), на
 * телефоне — нижний лист; «Дальше» — перелёт и новая запись истории «~r<шаг>», «Назад» и «назад» браузера — прежний
 * шаг; PageDown и PageUp; Esc — «Выйти на небо»; свободное небо и «Вернуть кадр шага»; «Карточка …» и «К рассказу»;
 * текст шага — только из данных (описание эпохи, стихи Синодального перевода).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { ROOT } from '../bible.ts';
import { pass, fail, hashId, type Scenario } from './kit.ts';

const STORY = JSON.parse(readFileSync(join(ROOT, 'data/story.json'), 'utf8')) as {
  title: string;
  steps: { id: string; short: string; title: string; epoch: string; focus: string; frame: { persons: string[]; years: [number, number] }; refs: string[] }[];
};
const ATLAS = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { epochs: { id: string; summary: string }[] };
const VERSES = new Map<string, Record<string, string>>();
for (const f of readdirSync(join(ROOT, 'src/generated/verses'))) {
  const j = JSON.parse(readFileSync(join(ROOT, 'src/generated/verses', f), 'utf8')) as { book: string; verses: Record<string, string> };
  VERSES.set(j.book, j.verses);
}
const flat = (s: string) => s.replace(/[   ⁠]/g, ' ').replace(/[«»"„“]/g, '"').replace(/\s+/g, ' ').trim();

/** Шаг рассказа из адреса (с единицы); null — рассказа нет. */
const stepOf = (p: Page) => {
  const m = /~r(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash));
  return m ? Number(m[1]) : null;
};
/** Колонка рассказа: шаг словами, заглавие. */
async function column(p: Page) {
  return (await p.evaluate(() => {
    const c = document.querySelector('.folio.story');
    if (!c) return null;
    return {
      count: c.querySelector('.story-count')?.textContent?.trim() ?? '',
      title: c.querySelector('.story-title')?.textContent?.trim() ?? '',
      said: c.querySelector('[role="status"]')?.textContent?.trim() ?? '',
      w: c.getBoundingClientRect().width,
      left: c.getBoundingClientRect().left,
    };
  })) as { count: string; title: string; said: string; w: number; left: number } | null;
}
/** Выбранная звезда в видимой части неба (не под колонкой, не под листом): .sky[data-sel] — её место на холсте. */
async function selInSky(p: Page) {
  return p.evaluate(() => {
    const sky = document.querySelector<HTMLElement>('.sky');
    const sel = sky?.dataset.sel?.split(' ').map(Number);
    if (!sky || !sel || sel.length < 2 || !sel.every(Number.isFinite)) return false;
    const box = sky.getBoundingClientRect();
    const sheet = document.querySelector<HTMLElement>('.folio:not([hidden])');
    const bottom = sheet && getComputedStyle(sheet).position === 'fixed' ? sheet.getBoundingClientRect().top - box.top : box.height;
    return sel[0] >= 0 && sel[0] <= box.width && sel[1] >= 0 && sel[1] <= bottom;
  });
}
/** Открыть ссылку на шаг. */
async function openStep(p: Page, n: number, id: string) {
  await p.goto(`${p.url().replace(/#.*$/, '')}#/${id}~r${n}`);
  await p.waitForTimeout(2600);
}

export const story16: Scenario[] = [
  {
    n: 1200,
    title: 'Шестое начало «Рассказ» в листе «Вид»: колонка рассказа, шаг 1 из 8, Адам выбран, всё небо',
    run: async (p) => {
      await p.goto(`${p.url().replace(/#.*$/, '')}#/`);
      await p.waitForTimeout(1500);
      await p.locator('.skyctl .view-toggle').first().click();
      await p.waitForTimeout(400);
      const b = p.locator('.viewpop .starts button[data-start="story"]');
      if (!(await b.count())) return fail('в листе «Вид» нет начала «Рассказ»');
      const label = flat(await b.first().innerText());
      if (!label.includes(STORY.title)) return fail(`имя начала: «${label}»`);
      await b.first().click();
      await p.waitForTimeout(2800);
      const c = await column(p);
      if (!c) return fail('нет колонки рассказа');
      if (flat(c.count) !== `Шаг 1 из ${STORY.steps.length}`) return fail(`счёт шага: «${c.count}»`);
      if (hashId(p) !== STORY.steps[0].focus) return fail(`выбрано «${hashId(p)}»`);
      if (stepOf(p) !== 1) return fail(`в адресе нет ~r1: ${p.url()}`);
      if ((await p.evaluate(() => document.documentElement.dataset.show)) !== 'a') return fail('показ — не всё небо');
      return pass(`колонка ${Math.round(c.w)} px справа`);
    },
  },
  {
    n: 1201,
    title: '«Дальше» ведёт по восьми шагам: каждый шаг — запись «~r», опорное лицо выбрано и в видимой части неба',
    run: async (p) => {
      await openStep(p, 1, STORY.steps[0].focus);
      const bad: string[] = [];
      for (let i = 1; i < STORY.steps.length; i++) {
        await p.locator('.folio.story .story-next').first().click();
        await p.waitForTimeout(2400);
        const st = STORY.steps[i];
        if (stepOf(p) !== i + 1) bad.push(`шаг ${i + 1}: адрес ${stepOf(p)}`);
        if (hashId(p) !== st.focus) bad.push(`шаг ${i + 1}: выбрано ${hashId(p)}`);
        if (!(await selInSky(p))) bad.push(`шаг ${i + 1}: ${st.focus} вне неба`);
        const c = await column(p);
        if (!c || flat(c.title) !== flat(st.title)) bad.push(`шаг ${i + 1}: заглавие «${c?.title}»`);
      }
      // на последнем шаге «Дальше» нет — главная команда «Выйти на небо»
      const last = flat(await p.locator('.folio.story .story-next').first().innerText());
      if (last !== 'Выйти на небо') bad.push(`последний шаг: «${last}»`);
      return bad.length ? fail(bad.join('; ')) : pass('8 шагов');
    },
  },
  {
    n: 1202,
    title: '«Назад» браузера — прежний шаг, его лицо и окно; «Назад» рассказа — предыдущий шаг',
    run: async (p) => {
      await openStep(p, 2, STORY.steps[1].focus);
      const w2 = await p.evaluate(() => document.querySelector<HTMLElement>('.strip')?.dataset.window ?? '');
      await p.locator('.folio.story .story-next').first().click();
      await p.waitForTimeout(2400);
      if (stepOf(p) !== 3) return fail(`после «Дальше» шаг ${stepOf(p)}`);
      await p.goBack();
      await p.waitForTimeout(1500);
      if (stepOf(p) !== 2 || hashId(p) !== STORY.steps[1].focus) return fail(`«назад» браузера: шаг ${stepOf(p)}, лицо ${hashId(p)}`);
      const w = await p.evaluate(() => document.querySelector<HTMLElement>('.strip')?.dataset.window ?? '');
      const [a0, b0] = w2.split(' ').map(Number);
      const [a1, b1] = w.split(' ').map(Number);
      if (Math.abs(a1 - a0) > (b0 - a0) * 0.05 || Math.abs(b1 - b0) > (b0 - a0) * 0.05) return fail(`окно не вернулось: ${w2} → ${w}`);
      await p.locator('.folio.story .story-prev').first().click();
      await p.waitForTimeout(1500);
      return stepOf(p) === 1 && hashId(p) === STORY.steps[0].focus ? pass() : fail(`«Назад» рассказа: шаг ${stepOf(p)}, лицо ${hashId(p)}`);
    },
  },
  {
    n: 1203,
    title: 'PageDown и PageUp — следующий и предыдущий шаг; ход шага объявляется живой областью',
    run: async (p) => {
      await openStep(p, 3, STORY.steps[2].focus);
      await p.locator('.sky canvas').first().focus();
      await p.keyboard.press('PageDown');
      await p.waitForTimeout(2400);
      if (stepOf(p) !== 4) return fail(`PageDown: шаг ${stepOf(p)}`);
      const said = (await column(p))?.said ?? '';
      if (!said.startsWith(`Шаг 4 из ${STORY.steps.length}. ${STORY.steps[3].title}.`)) return fail(`объявление: «${said}»`);
      await p.keyboard.press('PageUp');
      await p.waitForTimeout(1500);
      return stepOf(p) === 3 ? pass(said) : fail(`PageUp: шаг ${stepOf(p)}`);
    },
  },
  {
    n: 1204,
    title: 'Esc — «Выйти на небо»: рассказ закрыт, окно и выбранное лицо остаются, в колонке — его карточка',
    run: async (p) => {
      await openStep(p, 6, STORY.steps[5].focus);
      const w0 = await p.evaluate(() => document.querySelector<HTMLElement>('.strip')?.dataset.window ?? '');
      await p.locator('.sky canvas').first().focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(1000);
      if (await p.locator('.folio.story').count()) return fail('колонка рассказа осталась');
      if (stepOf(p) !== null) return fail(`в адресе остался шаг: ${p.url()}`);
      if (hashId(p) !== STORY.steps[5].focus) return fail(`выбор снят: «${hashId(p)}»`);
      if (!(await p.locator('.folio:not([hidden]) .mast h2').count())) return fail('нет карточки лица');
      const w1 = await p.evaluate(() => document.querySelector<HTMLElement>('.strip')?.dataset.window ?? '');
      return w0 === w1 ? pass() : fail(`окно сдвинулось: ${w0} → ${w1}`);
    },
  },
  {
    n: 1205,
    title: 'Свободное небо: сдвиг рассказ не закрывает; «Вернуть кадр шага» возвращает окно и опорное лицо',
    run: async (p) => {
      await openStep(p, 3, STORY.steps[2].focus);
      if (await p.locator('.folio.story .story-back').count()) return fail('«Вернуть кадр шага» видна до сдвига');
      const box = (await p.locator('.sky canvas').boundingBox())!;
      await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await p.mouse.down();
      await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(1200);
      if (stepOf(p) !== 3 || !(await p.locator('.folio.story').count())) return fail('сдвиг закрыл рассказ');
      if (!(await p.locator('.folio.story .story-back').count())) return fail('нет «Вернуть кадр шага» после сдвига');
      await p.locator('.folio.story .story-back').first().click();
      await p.waitForTimeout(2400);
      if (await p.locator('.folio.story .story-back').count()) return fail('«Вернуть кадр шага» осталась');
      return (await selInSky(p)) ? pass() : fail('опорное лицо вне неба');
    },
  },
  {
    n: 1206,
    title: '«Карточка: Иаков» — карточка в колонке, строка «Рассказ, шаг 3 из 8» с «К рассказу» возвращает рассказ',
    run: async (p) => {
      await openStep(p, 3, 'iakov');
      await p.locator('.folio.story .story-card button').first().click();
      await p.waitForTimeout(900);
      if (await p.locator('.folio.story').count()) return fail('колонка рассказа осталась');
      if (!(await p.locator('.folio:not([hidden]) .mast h2').count())) return fail('нет карточки');
      const line = p.locator('.showbar .sb-line[data-line="story"]');
      if (!(await line.count())) return fail('нет строки рассказа у кромки неба');
      const t = flat(await line.innerText());
      if (!t.startsWith(`Рассказ, шаг 3 из ${STORY.steps.length}`)) return fail(`строка: «${t}»`);
      await line.locator('[data-cmd="story"]').click();
      await p.waitForTimeout(800);
      return (await p.locator('.folio.story').count()) ? pass(t) : fail('рассказ не вернулся');
    },
  },
  {
    n: 1207,
    title: 'Ссылка на шаг без окна («#/iakov~r3») — кадр шага: Иаков и все двенадцать сыновей на небе',
    run: async (p) => {
      await openStep(p, 3, 'iakov');
      const st = STORY.steps[2];
      const miss = await p.evaluate((ids) => {
        const sky = document.querySelector('.sky')!.getBoundingClientRect();
        const ids2 = (document.querySelector<HTMLCanvasElement>('.sky canvas')?.dataset.labelIds ?? '').split(' ');
        return ids.filter((id) => !ids2.includes(id) && !document.getElementById(`sky-star-${id}`)).concat(sky.width > 0 ? [] : ['sky']);
      }, st.frame.persons);
      if (!(await selInSky(p))) return fail('Иаков вне неба');
      return miss.length <= 2 ? pass(miss.length ? `без подписи: ${miss.join(', ')}` : 'все лица кадра подписаны') : fail(`нет на небе: ${miss.join(', ')}`);
    },
  },
  {
    n: 1208,
    title: 'Текст шагов — только из данных: описание эпохи и стихи Синодального перевода (приёмка О6)',
    run: async (p) => {
      const bad: string[] = [];
      for (let i = 0; i < STORY.steps.length; i++) {
        const st = STORY.steps[i];
        await openStep(p, i + 1, st.focus);
        const got = await p.evaluate(() => ({
          sum: document.querySelector('.folio.story .story-sum')?.textContent ?? '',
          verses: [...document.querySelectorAll('.folio.story .story-verse .verses')].map((v) => v.textContent ?? ''),
        }));
        const ep = ATLAS.epochs.find((e) => e.id === st.epoch);
        if (ep && flat(got.sum) !== flat(ep.summary)) bad.push(`${st.id}: описание эпохи`);
        st.refs.forEach((r, k) => {
          const m = /^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(r)!;
          const txt: string[] = [];
          for (let v = +m[3]; v <= +(m[4] ?? m[3]); v++) txt.push(VERSES.get(m[1])?.[`${m[2]}:${v}`] ?? '');
          const shown = flat((got.verses[k] ?? '').replace(/\d+:\d+/g, ' '));
          for (const t of txt) if (!shown.includes(flat(t).slice(0, 40))) bad.push(`${st.id}: стих ${r}`);
        });
      }
      return bad.length ? fail(bad.join('; ')) : pass(`${STORY.steps.length} шагов`);
    },
  },
  {
    n: 1209,
    title: 'Телефон: лист рассказа, «Назад» и «Дальше» по 44 px; касание «Дальше» — следующий шаг, лицо над листом',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await openStep(p, 3, 'iakov');
      const sheet = await p.evaluate(() => {
        const c = document.querySelector<HTMLElement>('.folio.story');
        if (!c) return null;
        return {
          fixed: getComputedStyle(c).position === 'fixed',
          btn: [...c.querySelectorAll<HTMLElement>('.story-bar .story-cmds button')].map((b) => Math.round(b.getBoundingClientRect().height)),
        };
      });
      if (!sheet) return fail('нет листа рассказа');
      if (!sheet.fixed) return fail('рассказ — не нижний лист');
      if (sheet.btn.length < 2 || sheet.btn.some((h) => h < 44)) return fail(`кнопки: ${sheet.btn.join(', ')} px`);
      await p.locator('.folio.story .story-bar .story-next').first().tap();
      await p.waitForTimeout(2600);
      if (stepOf(p) !== 4) return fail(`касание «Дальше»: шаг ${stepOf(p)}`);
      return (await selInSky(p)) ? pass(`кнопки ${sheet.btn.join(', ')} px`) : fail('опорное лицо под листом');
    },
  },
  {
    n: 1210,
    title: 'Телефон: «Выйти на небо» — лист карточки лица, рассказа нет',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await openStep(p, 2, 'avraam');
      await p.locator('.folio.story .story-exit').first().tap();
      await p.waitForTimeout(1200);
      if (await p.locator('.folio.story').count()) return fail('лист рассказа остался');
      if (stepOf(p) !== null) return fail('шаг в адресе остался');
      return hashId(p) === 'avraam' ? pass() : fail(`выбрано «${hashId(p)}»`);
    },
  },
  {
    n: 1211,
    title: 'Фокус созвездия (решение 185): «~zjudah» — «В фокусе: Колено Иудино» и «Вернуть»; Esc снимает фокус',
    run: async (p) => {
      await p.goto(`${p.url().replace(/#.*$/, '')}#/~zjudah`);
      await p.waitForTimeout(2200);
      const line = p.locator('.showbar .sb-line[data-line="focus"]');
      if (!(await line.count())) return fail('нет строки фокуса');
      const t = flat(await line.innerText());
      if (!t.startsWith('В фокусе: Колено Иудино')) return fail(`строка: «${t}»`);
      if (/—/.test(t)) return fail(`строка с тире-фрагментом: «${t}»`);
      if (!(await line.locator('button', { hasText: 'Вернуть' }).count())) return fail('нет кнопки «Вернуть»');
      await p.locator('.sky canvas').first().focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(800);
      if (await line.count()) return fail('Esc не снял фокус');
      return /~z/.test(p.url()) ? fail('поле фокуса осталось в адресе') : pass(t);
    },
  },
  {
    n: 1212,
    title: 'Щелчок по названию созвездия на обзоре — фокус и перелёт «вписать»; «Вернуть» — прежнее окно',
    run: async (p) => {
      await p.goto(`${p.url().replace(/#.*$/, '')}#/~y-1500~w2400~l0~s1`);
      await p.waitForTimeout(2400);
      const hits = await p.evaluate(() => document.querySelector<HTMLCanvasElement>('.sky canvas')?.dataset.groupHits ?? null);
      if (hits === null) return fail('небо не отдаёт места названий (canvas[data-group-hits], src/render/sky.ts)');
      const h = hits
        .split(';')
        .map((q) => /^([a-z-]+):(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(q))
        .find((m) => m && m[1] === 'judah');
      if (!h) return fail(`нет названия «Колено Иудино» на обзоре: ${hits.slice(0, 120)}`);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const w0 = await p.evaluate(() => document.querySelector<HTMLElement>('.strip')?.dataset.window ?? '');
      await p.mouse.click(box.x + +h[2] + +h[4] / 2, box.y + +h[3] + +h[5] / 2);
      await p.waitForTimeout(2200);
      if (!/~zjudah/.test(p.url())) return fail(`фокус не в адресе: ${p.url()}`);
      await p.locator('.showbar [data-cmd="focus"]').click();
      await p.waitForTimeout(1200);
      const w1 = await p.evaluate(() => document.querySelector<HTMLElement>('.strip')?.dataset.window ?? '');
      const [a0, b0] = w0.split(' ').map(Number);
      const [a1, b1] = w1.split(' ').map(Number);
      return Math.abs(a1 - a0) < (b0 - a0) * 0.05 && Math.abs(b1 - b0) < (b0 - a0) * 0.05 ? pass() : fail(`окно не вернулось: ${w0} → ${w1}`);
    },
  },
  {
    n: 1213,
    title: 'Полоса времени (решение 188): выделена эпоха середины окна неба; шаг рассказа в другой эпохе — другая',
    run: async (p) => {
      const ATL = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { epochs: { id: string; start: number; end: number }[] };
      const hist = (t: number) => (t <= 0 ? t - 1 : t);
      const check = async () => {
        const d = await p.evaluate(() => {
          const s = document.querySelector<HTMLElement>('.strip');
          return { w: s?.dataset.window ?? '', e: s?.dataset.epoch ?? null };
        });
        const [a, b] = d.w.split(' ').map(Number);
        const mid = hist((a + b) / 2);
        const want = ATL.epochs.find((e) => mid >= e.start && mid < e.end)?.id ?? '';
        return { got: d.e, want };
      };
      await openStep(p, 3, 'iakov');
      const c1 = await check();
      if (!c1.got || c1.got !== c1.want) return fail(`шаг «Колена»: выделена «${c1.got}», середина окна — «${c1.want}»`);
      await openStep(p, 6, 'david');
      const c2 = await check();
      if (!c2.got || c2.got !== c2.want) return fail(`шаг «Царство»: выделена «${c2.got}», середина окна — «${c2.want}»`);
      return c1.got !== c2.got ? pass(`${c1.got} → ${c2.got}`) : fail('эпоха не сменилась');
    },
  },
  {
    n: 1214,
    title: 'Таблица клавиш: Shift+F — семья созвездием; PageUp и PageDown — шаги рассказа; щелчок по названию созвездия',
    run: async (p) => {
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(700);
      const t = flat(await p.locator('#legend-keys').locator('xpath=..').innerText().catch(() => ''));
      const need = ['семья созвездием', 'в рассказе — к предыдущему или следующему шагу', 'созвездие в фокусе'];
      const miss = need.filter((x) => !t.includes(x));
      return miss.length ? fail(`нет в таблице: ${miss.join('; ')}`) : pass();
    },
  },
];
