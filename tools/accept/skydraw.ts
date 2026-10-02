/**
 * Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа skydraw (K5): отрисовка неба. Номера 271–289 (270 занят сценарием группы cardtext).
 * Проверки — по замерам кадра на холсте неба (src/render/sky.ts, конец draw()): canvas[data-detail], [data-detail-axes],
 * [data-named], [data-label-ids] (подписанные лица), [data-notes] (пометы, подписи лент, номера лиц линий, названия
 * созвездий, знаки свёрнутого — текстом через «|»), [data-service] (служебная строка рамки), [data-breaks] (разрывы «//»),
 * [data-brackets] (скобки «время не установлено»), [data-work-marks], [data-fold-hits]; .sky[data-labels="N/M"] —
 * нарисовано подписей и пересекающихся пар.
 */
import type { Page } from 'playwright';
import { pass, fail, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 2600) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Новая вкладка того же контекста с записью в хранилища до загрузки (свёртка, набор). */
async function tab(p: Page, hash: string, o: { session?: Record<string, unknown>; local?: Record<string, unknown> } = {}, ms = 2800) {
  const q = await p.context().newPage();
  const init: string[] = [];
  for (const [k, v] of Object.entries(o.session ?? {})) init.push(`sessionStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))})`);
  for (const [k, v] of Object.entries(o.local ?? {})) init.push(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))})`);
  if (init.length) await q.addInitScript(init.join(';'));
  await q.goto(p.url().replace(/#.*$/, '') + hash);
  await q.waitForTimeout(ms);
  return q;
}
const cv = (p: Page, k: string) => p.locator('.sky > canvas').getAttribute(`data-${k}`).then((v) => v ?? '');
const overlaps = async (p: Page) => Number(((await p.locator('.sky').getAttribute('data-labels')) ?? '0/0').split('/')[1]);
const notes = async (p: Page) => (await cv(p, 'notes')).split('|').filter(Boolean);
const star = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
  }, id);

export const skydraw: Scenario[] = [
  {
    n: 271,
    title: 'Решение 25, MAP-61: узкие строки (×0,1) на масштабе поколения — следы, связи и звёзды видны, облаков нет, подписаны ведущие; наложений нет',
    run: async (p) => {
      await go(p, '#/~y-1010~w60~l0~s1~h0.1');
      const axes = await cv(p, 'detail-axes');
      const [t, r] = axes.split(' ').map(Number);
      if (!(t === 1 && r < 0.5)) return fail(`подробность по осям «время строки» = ${axes}`);
      if ((await cv(p, 'detail')) !== '1.00') return fail(`подробность звёзд ${await cv(p, 'detail')}: облака не погасли`);
      const [named, stars] = (await cv(p, 'named')).split('/').map(Number);
      if (!(stars > 60)) return fail(`видимых звёзд ${stars}`);
      if (!(named > 15)) return fail(`подписано ${named}`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      // обзор с широкими строками (×4): строки подробны, время — нет; звёзды видны
      await go(p, '#/~y-2000~w4200~l0~s1~h4');
      const [t2, r2] = (await cv(p, 'detail-axes')).split(' ').map(Number);
      if (!(t2 < 0.5 && r2 === 1)) return fail(`4 200 лет при строках ×4: подробность по осям ${t2} ${r2}`);
      return pass(`узкие строки: время ${t}, строки ${r}, подписано ${named}/${stars}; широкие на обзоре: ${t2} ${r2}`);
    },
  },
  {
    n: 272,
    // этап 13: после сверки хронологии жизнь Овида не растянута (разрыва нет); тот же случай — Мариам, сестра Моисея
    // (умерла в Кадесе, Чис 20:1), как в tests/trails-k5.test.ts
    title: 'Решение 24, MAP-51: у Иохаведы, Арама и Мариам — разрыв «//» на следе; отводы к детям после разрыва — со знаком',
    run: async (p) => {
      const seen = new Set<string>();
      for (const hash of ['#/~y-1660~w300~l70~s1', '#/~y-1700~w300~l0~s1', '#/mariam~y-1480~w300~s1']) {
        await go(p, hash, 2200);
        for (const id of (await cv(p, 'breaks')).split(' ').filter(Boolean)) seen.add(id);
      }
      for (const id of ['iokhaveda', 'aram', 'mariam']) if (!seen.has(id)) return fail(`нет разрыва у ${id}; есть: ${[...seen].join(', ')}`);
      return pass(`разрывы: ${[...seen].join(', ')}`);
    },
  },
  {
    n: 273,
    title: 'Решение 24, MAP-52: Лука, Филимон, Онисим — скобкой через годы служения Павла, а не звездой на меридиане Рождества; Мелхиседек — в годы Авраама',
    run: async (p) => {
      await go(p, '#/~y40~w120~l0~s1');
      const br = (await cv(p, 'brackets')).split(' ');
      // этап 13 (решения 98, 101): решатель ставит лиц без годов по эпохе и границам текста — у Луки, Филимона и Онисима
      // теперь промежуток рождения («род. между 10 г. до Р. Х. и 55 г. по Р. Х.»), и звезда стоит у первого
      // засвидетельствованного события (L1) — в годы служения Павла, правее его звезды; скобка — если лет нет вовсе
      const pavel = await star(p, 'pavel');
      for (const id of ['luka', 'filimon', 'onisim']) {
        if (br.includes(id)) continue;
        const q = await star(p, id);
        if (!q || !pavel || q.x <= pavel.x) return fail(`нет скобки у ${id}, и звезда не в годы служения Павла: ${JSON.stringify(q)} против ${JSON.stringify(pavel)}; скобки: ${br.join(' ')}`);
      }
      await go(p, '#/~y-2070~w250~l21~s1');
      if (!(await cv(p, 'brackets')).split(' ').includes('melkhisedek')) return fail('нет скобки у Мелхиседека');
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass(`скобки: ${br.join(', ')}`);
    },
  },
  {
    n: 274,
    // этап 11 (Г8, Г9): помет матерей («от Вирсавии») и порядка на небе нет. Мать видна положением: жёны Давида стоят далеко
    // от детей — ромбы его союзов на его следе, у ромба — имя матери; помета порядка — в подсказке звезды ребёнка
    title: 'MAP-55, MAP-54, MAP-68, Г8, Г9: у детей Давида матери — именами у ромбов союзов (помет «от …» на небе нет), помета порядка — в подсказке ребёнка («1 Пар 3:…, выв.»), у младенца — «†» кеглем подписи',
    run: async (p) => {
      await go(p, '#/david~y-1010~w60~l6~s1');
      const n = await notes(p);
      if (n.some((t) => /^от [А-ЯЁ]/.test(t))) return fail(`помета матери на небе: ${n.filter((t) => /^от [А-ЯЁ]/.test(t)).join(', ')}`);
      if (n.some((t) => /по порядку/.test(t))) return fail(`помета порядка на небе: ${n.filter((t) => /по порядку/.test(t)).join('; ')}`);
      const wives = ['Ахиноама', 'Авигея', 'Мааха', 'Аггифа', 'Авитала', 'Эгла', 'Вирсавия'];
      const moms = (await cv(p, 'plate-texts')).split('|').filter(Boolean).filter((t) => t.startsWith('u:david+') && wives.includes(t.slice(t.lastIndexOf(':') + 1))).map((t) => t.slice(t.lastIndexOf(':') + 1));
      if (moms.length < 3) return fail(`имён матерей у ромбов ${moms.length}: ${moms.join(', ')}`);
      // второй круг (решение 163): имя не стоит на чужой вертикали — в гребёнке стволов Давида у младенца места может не
      // быть; тогда он в canvas[data-hidden] и в строке «Без подписи на небе» карточки у звезды Давида (решение 153)
      let infant = 'подписан';
      if (!(await cv(p, 'label-ids')).split(' ').includes('mladenets-syn-virsavii')) {
        if (!(await cv(p, 'hidden')).split(' ').includes('mladenets-syn-virsavii')) return fail('младенец Давида и Вирсавии без подписи и не в списке скрытых');
        const at = await p.locator('.sky').getAttribute('data-sel');
        const cb = await p.locator('.sky > canvas').boundingBox();
        if (!at || !cb) return fail('нет места выбранной звезды');
        const [sx, sy] = at.split(' ').map(Number);
        await p.mouse.click(cb.x + sx, cb.y + sy);
        await p.waitForTimeout(1500);
        // карточка у звезды — там, где она есть (узкое небо, набор); на широком экране с листом карточки её нет, и младенец
        // учтён списком скрытых (диктор, контракт 2) и разделом «Дети» листа
        if (await p.locator('.sky .dotcard').count()) {
          const ids = (await p.locator('.sky .dotcard .dc-hidden').getAttribute('data-ids', { timeout: 2000 }).catch(() => null)) ?? '';
          if (!ids.split(' ').includes('mladenets-syn-virsavii')) return fail('младенец без подписи и не в строке «Без подписи на небе»');
          infant = 'в строке «Без подписи на небе»';
        } else infant = 'в списке скрытых (карточки у звезды при листе нет)';
        await p.keyboard.press('Escape');
        await p.waitForTimeout(500);
        await go(p, '#/david~y-1010~w60~l6~s1');
      }
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      // подсказка ребёнка: третья строка — через 700 мс неподвижности (IX-58)
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      const kid = await star(p, 'adoniya');
      if (!kid) return fail('нет звезды Адонии');
      await p.mouse.move(box.x + kid.x, box.y + kid.y);
      await p.waitForTimeout(1300);
      const tip = p.locator('.sky .tip[data-shown][data-more]');
      const t = (await tip.count()) ? (await tip.innerText()).replace(/\u2060/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ') : '';
      if (!/год оценён по порядку перечисления \(1 Пар 3:1–\d+\), выв\./.test(t)) return fail(`подсказка Адонии: «${t}»`);
      return pass(`у ромбов: ${moms.join(', ')}; младенец ${infant}; ${t.slice(t.indexOf('год оценён'))}`);
    },
  },
  {
    n: 275,
    title: 'UX-45, MAP-59, MAP-60: «только линии» — подписаны все лица линий (имя или номер у бусины), у начала ветвей «через Соломона (Мф 1)» и «через Нафана (Лк 3)»',
    run: async (p) => {
      await go(p, '#/~y-990~w400~l0~s1~o1', 3000);
      const [named, stars] = (await cv(p, 'named')).split('/').map(Number);
      if (!(stars > 15 && named === stars)) return fail(`подписано ${named} из ${stars}`);
      const n = await notes(p);
      for (const t of ['через Соломона (Мф 1)', 'через Нафана (Лк 3)']) if (!n.includes(t)) return fail(`нет «${t}»`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      // и без режима «только линии» — подписи лент у развилки Давида (UX-45)
      await go(p, '#/~y-1000~w120~l0~s1', 2400);
      const n2 = await notes(p);
      if (!n2.some((t) => t.startsWith('через '))) return fail('в обычном режиме у развилки Давида подписей лент нет');
      return pass(`подписано ${named}/${stars}; ${n.filter((t) => t.startsWith('через ')).join('; ')}`);
    },
  },
  {
    n: 276,
    title: 'Решение 28, UX-46: «только линии» — у Фареса, Вооза и Овида малые знаки Фамари, Раав и Руфи со стихом; выбранная Руфь — не пустое кольцо',
    run: async (p) => {
      // окно −2050…−950: после сверки хронологии (этап 13) Вооз и Овид — в конце времени Судей (−1127, −1099)
      await go(p, '#/~y-1500~w1100~l0~s1~o1', 3200);
      const n = await notes(p);
      for (const t of ['Фамарь — мать Фареса (Мф 1:3)', 'Раав — мать Вооза (Мф 1:5)', 'Руфь — мать Овида (Мф 1:5)']) if (!n.includes(t)) return fail(`нет «${t}»: ${n.filter((q) => q.includes('мать')).join(' | ')}`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass('Фамарь, Раав, Руфь — у сыновей, со стихом');
    },
  },
  {
    n: 277,
    title: 'Решение 30, MAP-63, UX-60: «+62» — сразу после подписи Давида; «Свёрнуто: потомки Давида (62) — развернуть» в служебной строке; «развернуть» разворачивает',
    run: async (p) => {
      const q = await tab(p, '#/david~y-1000~w150~l0~s1', { session: { 'toledot:folds': { desc: ['david'], groups: [] } } });
      try {
        const hits = (await cv(q, 'fold-hits')).split(';').filter(Boolean).map((h) => {
          const [kind, id, r] = h.split(':');
          const [x, y, w, hh] = r.split(',').map(Number);
          return { kind, id, x, y, w, h: hh };
        });
        const d = hits.find((h) => h.kind === 'desc' && h.id === 'david' && h.y > 44);
        const s = await star(q, 'david');
        if (!d || !s) return fail(`нет «+N» у Давида: ${JSON.stringify(hits)}`);
        if (Math.abs(d.x - s.x) > 200 || Math.abs(d.y + d.h / 2 - s.y) > 30) return fail(`«+N» далеко от звезды Давида: ${d.x},${d.y} против ${s.x},${s.y}`);
        const svc = await cv(q, 'service');
        if (!/Свёрнуто: потомки Давида \(\d+\) — развернуть/.test(svc)) return fail(`служебная строка: ${svc}`);
        const all = hits.find((h) => h.kind === 'all');
        if (!all) return fail('нет команды «развернуть»');
        const box = (await q.locator('.sky > canvas').boundingBox())!;
        await q.mouse.click(box.x + all.x + all.w / 2, box.y + all.y + all.h / 2);
        await q.waitForTimeout(800);
        if (await cv(q, 'folds')) return fail(`после «развернуть» свёрнуто: ${await cv(q, 'folds')}`);
        return pass(`«+N» в ${Math.round(d.x - s.x)} px от звезды; строка «${svc.split('|').find((t) => t.startsWith('Свёрнуто'))}»`);
      } finally {
        await q.close();
      }
    },
  },
  {
    n: 278,
    title: 'Решение 30, MAP-63: свёрнутое колено Иудино — знак «КОЛЕНО ИУДИНО +N» у левого края в окне его лет и пункт «колено Иудино (N)» в служебной строке',
    run: async (p) => {
      const q = await tab(p, '#/~y-1000~w700~l0~s1', { session: { 'toledot:folds': { desc: [], groups: ['judah'] } } });
      try {
        const hits = await cv(q, 'fold-hits');
        const onSky = hits.split(';').find((h) => h.startsWith('group:judah:') && Number(h.split(':')[2].split(',')[1]) > 44);
        if (!onSky) return fail(`нет знака на небе: ${hits}`);
        const x = Number(onSky.split(':')[2].split(',')[0]);
        if (x > 80) return fail(`знак не у левого края: x = ${x}`);
        if (!/колено Иудино \(\d+\)/.test(await cv(q, 'service'))) return fail(`служебная строка: ${await cv(q, 'service')}`);
        return pass(`знак у левого края (x = ${x}); ${(await cv(q, 'service')).split('|').find((t) => t.startsWith('Свёрнуто'))}`);
      } finally {
        await q.close();
      }
    },
  },
  {
    n: 279,
    // этап 13, решение 102 (пересматривает место из решения 35): название модели ушло из служебной строки в строку показа —
    // в строке эпох оно читалось как ещё одна эпоха и вытесняло «Земную жизнь Иисуса Христа» (снимок 20)
    title: 'Решение 102 (было 35, IX-48): модель не по умолчанию — «Годы — по модели «Краткое пребывание»» в строке показа, не в служебной строке; по умолчанию — нигде',
    run: async (p) => {
      await go(p, '#/moisey~mmt-short', 3000);
      const svc = await cv(p, 'service');
      if (svc.includes('модель «')) return fail(`модель в служебной строке: ${svc}`);
      const line = (await p.locator('.sky .showbar .sb-line').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
      if (!line.includes('Годы — по модели «Краткое пребывание»')) return fail(`строка показа: «${line}»`);
      await go(p, '#/moisey~mmt-long', 3000);
      if ((await cv(p, 'service')).includes('модель «')) return fail('модель по умолчанию названа в служебной строке');
      if (await p.locator('.sky .showbar .sb-line[data-line="model"]').count()) return fail('строка модели при модели по умолчанию');
      return pass(line);
    },
  },
  {
    n: 280,
    title: 'IX-51: в режиме «все лица» у членов рабочего набора — метки у знаков (при высоте строки от 8 px)',
    run: async (p) => {
      const q = await tab(p, '#/david~y-1010~w120~l0~s1', { local: { 'toledot:work': [['david'], ['iessey'], ['solomon'], ['avessalom'], ['amnon']] } });
      try {
        const k = Number(await cv(q, 'work-marks'));
        if (!(k >= 3)) return fail(`меток набора ${k}`);
        if (await overlaps(q)) return fail(`наложений подписей ${await overlaps(q)}`);
        return pass(`меток набора: ${k}`);
      } finally {
        await q.close();
      }
    },
  },
  {
    n: 281,
    title: 'MAP-66, решения 29 и 43: одноимённые в одном окне — с кратким уточнением до трёх слов без обрывков («Мария Магдалина», «Мария, Мать Иисуса»); наложений нет',
    run: async (p) => {
      await go(p, '#/~y20~w120~l0~s1', 2600);
      const ids = (await cv(p, 'label-ids')).split(' ');
      const marias = ids.filter((id) => id.startsWith('mariya'));
      if (marias.length < 2) return fail(`подписано Марий ${marias.length}`);
      // подписи с уточнением (имя + уточнение, как нарисованы): у Марий — не меньше двух разных
      const noted = (await cv(p, 'noted')).split('|').filter(Boolean).map((t) => t.split('#') as [string, string]);
      const mnoted = new Set(noted.filter(([name]) => name === 'Мария').map(([name, note]) => name + note));
      if (mnoted.size < 2) return fail(`Марии без уточнений: ${noted.map((q) => q.join('')).join('; ')}`);
      // у отметок поиска уточнение целиком; здесь отметок нет — все уточнения краткие (решение 43): не больше трёх слов
      // и без обрывков — ни «он же» в конце, ни служебного слова, ни открытой кавычки или скобки
      for (const [name, note] of noted) {
        const text = note.replace(/^,? /, '');
        if (text.split(/\s+/).length > 3) return fail(`уточнение длиннее трёх слов: «${name}${note}»`);
        if (/(^|\s)(он|она)\s+же$|\s(и|в|во|из|от|до|с|со|на|при|у)$/i.test(text)) return fail(`обрывок уточнения: «${name}${note}»`);
        if ((text.match(/«/g) ?? []).length !== (text.match(/»/g) ?? []).length || (text.match(/\(/g) ?? []).length !== (text.match(/\)/g) ?? []).length)
          return fail(`уточнение с оборванной кавычкой или скобкой: «${name}${note}»`);
      }
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass([...mnoted].join('; '));
    },
  },
  {
    n: 282,
    title: 'MOB-53: на первом экране телефона подписан Иисус Христос; MAP-06: на обзоре 1440 подписан Иаков',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/', 2600);
      if (!(await cv(p, 'label-ids')).split(' ').includes('iisus')) return fail('Иисус Христос без подписи на телефоне');
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      const q = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
      const d = await q.newPage();
      try {
        await d.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await d.goto(p.url().replace(/#.*$/, '#/'));
        await d.waitForTimeout(2600);
        if (!(await cv(d, 'label-ids')).split(' ').includes('iakov')) return fail('Иаков без подписи на обзоре');
      } finally {
        await q.close();
      }
      return pass('Иисус Христос — на телефоне, Иаков — на обзоре');
    },
  },
  {
    n: 283,
    title: 'MAP-58: на масштабе эпохи (700 лет) у крупных областей — названия созвездий, одно и то же — не чаще чем через ~1 200 px',
    run: async (p) => {
      await go(p, '#/~y-1000~w700~l0~s1', 2600);
      const n = (await notes(p)).filter((t) => /^[А-ЯЁ ]{4,}$/.test(t));
      if (n.length < 3) return fail(`названий созвездий ${n.length}: ${n.join(', ')}`);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass(n.join(', '));
    },
  },
  {
    n: 284,
    title: 'MOB-60: имя и формула выбранного под ярусами на телефоне — в общей проверке наложений: 0 пересечений',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/david~y-1013~w182~l0.0~pepochs~e1', 3000);
      // кадр после первого: место формулы — из прошлого кадра ярусов
      await p.mouse.move(200, 400);
      await p.waitForTimeout(600);
      if (await overlaps(p)) return fail(`наложений подписей ${await overlaps(p)}`);
      return pass(`подписей ${(await p.locator('.sky').getAttribute('data-labels')) ?? ''}`);
    },
  },
  {
    n: 285,
    title: 'MOB-44: холст неба следует за шириной области: 1440 → 700 и 844 → 390 (поворот телефона)',
    run: async (p) => {
      const widths = async (q: Page) =>
        q.evaluate(() => {
          const sky = document.querySelector('.sky') as HTMLElement;
          const c = sky.querySelector(':scope > canvas') as HTMLCanvasElement;
          return { sky: sky.getBoundingClientRect().width, canvas: c.getBoundingClientRect().width, inner: innerWidth };
        });
      await go(p, '#/', 2000);
      await p.setViewportSize({ width: 700, height: 900 });
      await p.waitForTimeout(1200);
      const a = await widths(p);
      if (Math.abs(a.canvas - a.sky) > 1) return fail(`1440 → 700: холст ${a.canvas}, область ${a.sky}`);
      if (a.sky > a.inner + 1) return fail(`1440 → 700: область ${a.sky} шире окна ${a.inner}`);
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await ctx.newPage();
      try {
        await q.addInitScript("localStorage.setItem('toledot:intro', 'true')");
        await q.goto(p.url().replace(/#.*$/, '#/'));
        await q.waitForTimeout(2000);
        await q.setViewportSize({ width: 390, height: 844 });
        await q.waitForTimeout(1500);
        const b = await widths(q);
        if (Math.abs(b.canvas - b.sky) > 1) return fail(`844 → 390: холст ${b.canvas}, область ${b.sky}`);
        return pass(`1440 → 700: холст ${a.canvas} = область ${a.sky}; 844 → 390: холст ${b.canvas} = область ${b.sky} (окно ${b.inner})`);
      } finally {
        await ctx.close();
      }
    },
  },
];
