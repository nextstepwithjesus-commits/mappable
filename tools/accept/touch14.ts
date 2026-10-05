/**
 * Сценарии приёмки этапа 14, S4 «Карточки, касание, доступность» (docs/ui-review/STAGE14.md, решения 150–157; пороги
 * § 4: П4, П5, П6, П8, Т1, Т3, Т6, Т7, Т8, Т9), группа touch14: номера 1160–1179.
 *  — 1160 П4: Escape и пустое небо снимают выбор, подробная карточка — вкладкой с именем, «развернуть» её возвращает;
 *    «×» закрывает без вкладки (решение 150);
 *  — 1161 П5: в «Родстве» карточки у звезды — уровень и шаг линии («толк.», «по Луке», «по закону», «только у Луки»)
 *    и уточнение тёзки (Мария, Иосиф, Салафиил, Каинан; решение 151);
 *  — 1162 П6: стих из карточки связи и из строки «Год» — одним действием (решение 152);
 *  — 1163 П8: при открытой подробной карточке карточка у звезды Давида — легенда семьи (образцы цветов ветвей), имена
 *    детей и «+N» под ней не стоят (1440, 1280, 1024; решение 153 и резерв подписей S2);
 *  — 1164 Т1: телефон, касание середины имени семьи — это лицо или «Какое лицо?» с ним, связи вместо имени нет (154);
 *  — 1165 Т3: телефон, шаг по родству внутри листа — лист на прежнем положении; «назад» — прежнее лицо и положение (150);
 *  — 1166 Т6: телефон, цели листа и выдачи поиска — не ниже 44 px, поля не перекрываются (154);
 *  — 1167 Т7: масштаб 200 % (720 × 450): шапка листа — высотой краткой карточки, под данными неба ≥ 140 px (155);
 *  — 1168 Т8: телефон, щипок под 20°, 45°, 70° — пропорции не меняются (154);
 *  — 1169 Т9: имя кнопки «Родства» называет отношение («Лия — жена»), пункт списка неба — отношение к выбранному,
 *    выбранная связь объявляется один раз (151);
 *  — 1170 решение 156: слова команд — «К звезде», «Отметить на небе (N)», «поставить на небо»;
 *  — 1171 решение 153: имя в «Родстве» выбирает лицо и сразу открывает его карточку у звезды.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { open, starPt } from './unify11.ts';

const PHONE = { width: 390, height: 844, touch: true };
const flat = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2060\u00ad]/g, '').replace(/\s+/g, ' ').trim();
const hashId = (p: Page) => decodeURIComponent(new URL(p.url()).hash.replace(/^#\/?/, '').split(/[?~]/)[0]);

/** Положение и высота нижнего листа (телефон). */
const sheet = (p: Page) =>
  p.evaluate(() => {
    const f = document.querySelector<HTMLElement>('.app > .folio');
    if (!f || f.hidden) return null;
    const r = f.getBoundingClientRect();
    return { stop: f.dataset.stop ?? '', h: r.height, top: r.top };
  });

/** Звезда лица на экране: точка для щелчка или касания (после того как небо встало). */
async function star(p: Page, id: string) {
  await p.waitForTimeout(300);
  return starPt(p, id);
}

/** Открыть карточку у звезды лица щелчком (широкий экран) — после того как небо встало. */
async function dotOf(p: Page, id: string): Promise<boolean> {
  const q = await star(p, id);
  if (!q) return false;
  await p.mouse.click(q.x, q.y);
  await p.waitForTimeout(900);
  // этап 20 (решение 194): на широком экране карточка у звезды — это карточка справа с «Родством» этого лица
  return (await p.locator(`.sky .dotcard[data-placed][data-id="${id}"], .folio .kin-col[data-id="${id}"]`).count()) > 0;
}

/**
 * Всё «Родство» в карточке у звезды: у легенды семьи — ссылка «всё родство» в её подписи (решение 153); у краткой карточки
 * (§ 6: полной нет места у звезды, так бывает на 1024 с подробной карточкой справа) — «всё родство — ещё N строк».
 */
async function kinAll(p: Page) {
  const more = p.locator('.sky .dotcard button.dc-more', { hasText: 'всё родство' });
  if (!(await more.count())) return;
  await more.first().click();
  await p.waitForTimeout(500);
}

/** Живые области (aria-live, role=status) — что услышит диктор, начиная с этой минуты. */
async function listen(p: Page) {
  await p.evaluate(() => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    const obs = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = (m.target.nodeType === 3 ? m.target.parentElement : (m.target as Element))?.closest('[aria-live],[role=status],[role=alert]');
        const t = el?.textContent?.trim();
        if (t) w.__said.push(t);
      }
    });
    document.querySelectorAll('[aria-live],[role=status],[role=alert]').forEach((e) => obs.observe(e, { childList: true, subtree: true, characterData: true }));
  });
}
const heard = (p: Page) => p.evaluate(() => [...new Set((window as unknown as { __said: string[] }).__said)]);

/** Щипок двумя пальцами (CDP): середина (cx, cy), угол линии пальцев к горизонтали deg, разнос d0 → d1. */
async function pinch(p: Page, cx: number, cy: number, deg: number, d0: number, d1: number) {
  const cdp = await p.context().newCDPSession(p);
  const u = Math.cos((deg * Math.PI) / 180);
  const v = Math.sin((deg * Math.PI) / 180);
  const pts = (d: number) => [
    { x: cx - (u * d) / 2, y: cy - (v * d) / 2, id: 1 },
    { x: cx + (u * d) / 2, y: cy + (v * d) / 2, id: 2 },
  ];
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0), timestamp: t0 });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + ((d1 - d0) * i) / 10), timestamp: t0 + (0.3 * i) / 10 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 0.31 });
  await cdp.detach();
  await p.waitForTimeout(700);
}

/** Пропорция строк неба сейчас: множитель высоты полосы (адрес «~h», без него — 1). */
const lanesNow = (p: Page) => p.evaluate(() => Number(/~h([\d.]+)/.exec(decodeURIComponent(location.hash))?.[1] ?? 1));

export const touch14: Scenario[] = [
  {
    n: 1160,
    title: 'П4, решение 150: Escape и пустое небо снимают выбор — подробная карточка Давида свёрнута во вкладку с именем; «развернуть» — Давид и карточка снова; «×» закрывает без вкладки',
    run: async (p) => {
      await open(p, '#/david', { ms: 4500 });
      // Escape с неба: снять одно за другим — пока выбор не снят
      await p.locator('.sky canvas').focus();
      for (let i = 0; i < 4 && hashId(p) === 'david'; i++) {
        await p.keyboard.press('Escape');
        await p.waitForTimeout(400);
      }
      if (hashId(p) === 'david') return fail('Escape не снял выбор');
      const tab = p.locator('.app > .folio.reading');
      if (!(await tab.count())) return fail('после Escape карточки нет — ни открытой, ни вкладкой');
      const label = (await tab.getAttribute('aria-label')) ?? '';
      if (!/Давид/.test(label)) return fail(`вкладка: «${label}»`);
      await tab.locator('.unfold').click();
      await p.waitForTimeout(1500);
      if (hashId(p) !== 'david') return fail(`«развернуть» выбрал «${hashId(p)}»`);
      if (!(await p.locator('.app > .folio h2').count())) return fail('карточка Давида не развернулась');
      // пустое небо: два щелчка (карточка у звезды, затем выбор) — та же вкладка
      const c = (await p.locator('.sky canvas').boundingBox())!;
      const empty = await p.evaluate(() => {
        const cv = document.querySelector<HTMLCanvasElement>('.sky canvas')!;
        const boxes = (cv.dataset.labelBoxes ?? '').split(';').filter(Boolean).map((s) => s.slice(s.lastIndexOf(':') + 1).split(',').map(Number));
        const stars = (cv.dataset.stars ?? '').split(';').filter(Boolean).map((s) => s.slice(s.lastIndexOf(':') + 1).split(',').map(Number));
        for (let y = 120; y < cv.clientHeight - 60; y += 23)
          for (let x = 80; x < cv.clientWidth - 80; x += 37) {
            if (stars.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 30)) continue;
            if (boxes.some(([bx, by, bw, bh]) => x > bx - 12 && x < bx + bw + 12 && y > by - 12 && y < by + bh + 12)) continue;
            const e = document.elementFromPoint(cv.getBoundingClientRect().left + x, cv.getBoundingClientRect().top + y);
            if (e === cv) return { x, y };
          }
        return null;
      });
      if (!empty) return fail('нет пустого места на небе');
      for (let i = 0; i < 3 && hashId(p) === 'david'; i++) {
        await p.mouse.click(c.x + empty.x, c.y + empty.y);
        await p.waitForTimeout(700);
      }
      if (hashId(p) === 'david') return fail('щелчки по пустому небу не сняли выбор');
      if (!(await p.locator('.app > .folio.reading').count())) return fail('после щелчка по пустому небу карточки нет');
      // «×» вкладки — закрыть: вкладки больше нет
      await p.locator('.app > .folio.reading > .close').click();
      await p.waitForTimeout(500);
      if (await p.locator('.app > .folio.reading').count()) return fail('«×» не закрыл вкладку');
      // «×» открытой карточки — без вкладки
      await open(p, '#/ruf', { ms: 3500 });
      await p.locator('.app > .folio .folio-bar .close').first().click();
      await p.waitForTimeout(600);
      if (await p.locator('.app > .folio.reading').count()) return fail('«×» карточки оставил вкладку');
      return pass('Escape и пустое небо: карточка — вкладкой «Давид»; «развернуть» вернул выбор; «×» закрывает без вкладки');
    },
  },
  {
    n: 1161,
    title: 'П5, решение 151: «Родство» с уровнем и шагом линии и с уточнением тёзки — Мария, Иосиф, Салафиил, Каинан',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const want: Record<string, RegExp[]> = {
        mariya: [/^Илий — отец, толк\.$/, /^Мария \(Клеопова\) — сестра, толк\.$/],
        'iosif-muzh-marii': [/^Илий — отец по Луке$/, /^Иисус Христос — сын по закону$/],
        salafiil: [/^Нирий — отец по Луке$/],
        'kainan-syn-arfaksada': [/^Арфаксад — отец, только у Луки$/, /^Сала — сын по Луке$/],
      };
      const got: string[] = [];
      for (const [id, rs] of Object.entries(want)) {
        await open(p, `#/${id}`, { ms: 4500 });
        if (!(await dotOf(p, id))) return fail(`${id}: нет карточки у звезды`);
        await kinAll(p);
        const labels = await p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-kin .person').evaluateAll((bs) => bs.map((b) => (b.getAttribute('aria-label') ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2060\u00ad]/g, '').replace(/\s+/g, ' ').trim()));
        for (const r of rs) if (!labels.some((l) => r.test(l))) return fail(`${id}: нет «${r.source}» среди ${labels.join(' / ')}`);
        // видно глазу: помета и уточнение — не только в имени кнопки
        const text = flat(await p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-kin').innerText());
        if (id === 'mariya' && !/Мария \(Клеопова\) толк\./.test(text)) return fail(`Мария: в строке «${text}»`);
        got.push(`${id}: ${labels.length} имён`);
      }
      return pass(got.join('; '));
    },
  },
  {
    n: 1162,
    title: 'П6, решение 152: стих из карточки связи и из строки «Год» — одним действием (кнопка с вклейкой)',
    run: async (p) => {
      await open(p, '#/iakov~ck.iakov.rakhil._.iosif', { ms: 4500 });
      const ref = p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-refs button.ref').first();
      if (!(await ref.count())) return fail('в карточке связи ссылки — не кнопки');
      await ref.click();
      await p.waitForTimeout(900);
      const v = flat((await p.locator(':is(.sky .dotcard, aside.folio[data-link] .dotcard) .verses').first().textContent().catch(() => '')) ?? '');
      if (!/вспомнил Бог о Рахили/.test(v)) return fail(`вклейка: «${v.slice(0, 80)}»`);
      // строка «Год» (Салафиил: «по порядку перечисления, 1 Пар 3:17–18, выв.»)
      await open(p, '#/salafiil', { ms: 4500 });
      if (!(await dotOf(p, 'salafiil'))) return fail('нет карточки у звезды Салафиила');
      await kinAll(p);
      const y = p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-row.year button.ref').first();
      if (!(await y.count())) return fail('в строке «Год» ссылка — не кнопка');
      await y.click();
      await p.waitForTimeout(900);
      const yv = flat((await p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-verse .verses').first().textContent().catch(() => '')) ?? '');
      return /Салафиил/.test(yv) ? pass('карточка связи и «Год»: стих — первым щелчком') : fail(`вклейка «Года»: «${yv.slice(0, 80)}»`);
    },
  },
  {
    n: 1163,
    // этап 20 (решение 194): карточки у звезды на широком экране нет — легенда цветов жён (решение 153) стала образцами
    // цвета ветви в строке детей «Родства» справа; небо ничем не закрыто: имён детей под карточкой быть не может
    title: 'П8, решения 153, 194: Давид — в «Родстве» справа дети по матерям с образцами цвета ветви (не меньше 8), на небе карточки нет (1920, 1440, 1280, 1024)',
    run: async (p) => {
      const out: string[] = [];
      for (const [W, H] of [
        [1920, 1200],
        [1440, 900],
        [1280, 800],
        [1024, 768],
      ]) {
        await p.setViewportSize({ width: W, height: H });
        await open(p, '#/david~y-1013~w182~l0.0~s1', { ms: 4500 });
        if (!(await dotOf(p, 'david'))) return fail(`${W}: нет карточки Давида`);
        await p.waitForTimeout(600);
        if (await p.locator('.sky .dotcard').count()) return fail(`${W}: на небе — карточка у звезды`);
        const sw = await p.locator('.folio .kin-col .dc-row.children .dc-sw').count();
        if (sw < 8) return fail(`${W}: образцов цвета в строке детей ${sw}`);
        out.push(`${W}: ${sw} цветов`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 1164,
    title: 'Т1, решение 154: телефон 390, шапка листа — касание середины имени члена семьи выбирает это лицо (или «Какое лицо?» с ним); связи вместо имени — 0 (Давид, Иаков)',
    view: PHONE,
    run: async (p) => {
      let ok = 0;
      let all = 0;
      const bad: string[] = [];
      for (const id of ['david', 'iakov']) {
        await open(p, `#/${id}`, { ms: 3500 });
        await p.locator('.folio .actions button.show-on-sky').tap();
        await p.waitForTimeout(2500);
        const fam = await p.evaluate((id) => {
          const c = document.querySelector<HTMLCanvasElement>('.sky canvas')!;
          const cr = c.getBoundingClientRect();
          const f = document.querySelector('.app > .folio')!.getBoundingClientRect();
          const kin = [...document.querySelectorAll('.sheet-dot .dc-kin .person')].map((b) => (b as HTMLElement).dataset.id);
          void kin;
          return (c.dataset.labelBoxes ?? '')
            .split(';')
            .filter(Boolean)
            .map((q) => {
              const i = q.lastIndexOf(':');
              const [x, y, w, h] = q.slice(i + 1).split(',').map(Number);
              return { id: q.slice(0, i), x: cr.left + x + w / 2, y: cr.top + y + h / 2 };
            })
            .filter((b) => b.id !== id && b.y < f.top - 6 && b.y > cr.top + 70);
        }, id);
        // родня первого колена: по данным строк «Родства» карточки у звезды неизвестна целиком — берём всех подписанных,
        // кого карточка лица называет (ссылки на лица в листе на 55 %)
        const kinIds = new Set(await p.evaluate(() => [...document.querySelectorAll('.app > .folio [data-id]')].map((e) => (e as HTMLElement).dataset.id!)));
        const targets = fam.filter((b) => kinIds.has(b.id)).slice(0, 10);
        for (const b of targets) {
          await open(p, `#/${id}`, { ms: 3200 });
          await p.locator('.folio .actions button.show-on-sky').tap();
          await p.waitForTimeout(2500);
          // место подписи — заново: окно могло встать иначе
          const q = await p.evaluate((who) => {
            const c = document.querySelector<HTMLCanvasElement>('.sky canvas')!;
            const cr = c.getBoundingClientRect();
            const m = (c.dataset.labelBoxes ?? '').split(';').find((s) => s.slice(0, s.lastIndexOf(':')) === who);
            if (!m) return null;
            const [x, y, w, h] = m.slice(m.lastIndexOf(':') + 1).split(',').map(Number);
            return { x: cr.left + x + w / 2, y: cr.top + y + h / 2 };
          }, b.id);
          if (!q) continue;
          all++;
          await p.touchscreen.tap(q.x, q.y);
          await p.waitForTimeout(700);
          const r = await p.evaluate(() => ({
            sel: (location.hash.match(/^#\/([^~]*)/) || [])[1] ?? '',
            link: (location.hash.match(/~c([^~]*)/) || [])[1] ?? '',
            which: [...document.querySelectorAll('.which .which-item')].map((x) => (x as HTMLElement).dataset.id ?? ''),
          }));
          if (r.link) bad.push(`${b.id} → связь ${r.link}`);
          else if (r.sel === b.id || r.which.includes(b.id)) ok++;
          else bad.push(`${b.id} → ${r.sel}`);
        }
      }
      if (!all) return fail('ни одного подписанного члена семьи над листом');
      const share = ok / all;
      return share >= 0.95 && !bad.some((x) => /связь/.test(x)) ? pass(`верно ${ok} из ${all}`) : fail(`верно ${ok} из ${all}: ${bad.join('; ')}`);
    },
  },
  {
    n: 1165,
    title: 'Т3, решение 150: телефон — шаг по родству внутри листа оставляет лист на прежнем положении; «назад» — прежнее лицо и положение листа',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/iakov', { ms: 3500 });
      // лист на шапке: касание звезды Иакова
      await p.locator('.folio .actions button.show-on-sky').tap();
      await p.waitForTimeout(2500);
      let s = await sheet(p);
      if (s?.stop !== 'peek') return fail(`лист после «К звезде»: ${s?.stop}`);
      const rakhil = p.locator('.app > .folio .sheet-dot .dc-kin .person[data-id="rakhil"]');
      if (!(await rakhil.count())) return fail('в «Родстве» листа нет Рахили');
      await rakhil.tap();
      await p.waitForTimeout(1500);
      s = await sheet(p);
      if (hashId(p) !== 'rakhil') return fail(`касание выбрало «${hashId(p)}»`);
      if (s?.stop !== 'peek') return fail(`шаг по родству поднял лист: ${s?.stop}`);
      await p.goBack();
      await p.waitForTimeout(1800);
      s = await sheet(p);
      if (hashId(p) !== 'iakov') return fail(`«назад» — «${hashId(p)}»`);
      if (s?.stop !== 'peek') return fail(`«назад»: лист ${s?.stop}, а был на шапке`);
      // лист на 55 %: ссылка в подробной карточке — лист остаётся на 55 %
      await p.locator('.app > .folio .sheet-dot .dc-cmds button', { hasText: 'Вся карточка' }).first().tap();
      await p.waitForTimeout(900);
      if ((await sheet(p))?.stop !== 'half') return fail('«Вся карточка» не подняла лист до 55 %');
      const link = p.locator('.app > .folio .folio-body button.person[data-id="liya"]').first();
      if (!(await link.count())) return fail('в карточке нет ссылки на Лию');
      await link.scrollIntoViewIfNeeded();
      await link.tap();
      await p.waitForTimeout(1500);
      s = await sheet(p);
      if (hashId(p) !== 'liya' || s?.stop !== 'half') return fail(`ссылка из карточки: «${hashId(p)}», лист ${s?.stop}`);
      await p.goBack();
      await p.waitForTimeout(1800);
      s = await sheet(p);
      return hashId(p) === 'iakov' && s?.stop === 'half' ? pass('шапка → Рахиль — шапка, «назад» — Иаков на шапке; 55 % → Лия — 55 %, «назад» — 55 %') : fail(`«назад»: «${hashId(p)}», лист ${s?.stop}`);
    },
  },
  {
    n: 1166,
    title: 'Т6, решение 154: телефон — цели листа (имена «Родства», «ещё N», команды) и выдачи поиска не ниже 44 px, поля имён не перекрываются',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/iakov', { ms: 3500 });
      await p.locator('.folio .actions button.show-on-sky').tap();
      await p.waitForTimeout(2500);
      // действующая высота каждой цели: столбец точек по её середине — сколько px elementFromPoint отдаёт ей самой
      const r = await p.evaluate(() => {
        const sel = '.app > .folio .sheet-dot button';
        const els = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetParent);
        const out: { t: string; h: number }[] = [];
        for (const e of els) {
          const b = e.getBoundingClientRect();
          const cx = b.left + Math.min(b.width / 2, 12);
          let h = 0;
          for (let y = b.top - 40; y <= b.bottom + 40; y++) {
            const hit = document.elementFromPoint(cx, y)?.closest('button');
            if (hit === e) h++;
          }
          out.push({ t: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24), h });
        }
        return out;
      });
      const low = r.filter((x) => x.h < 43.5);
      if (low.length) return fail(`низкие цели листа: ${low.map((x) => `${x.t} ${x.h}`).join('; ')}`);
      // выдача поиска: команда группы «Отметить на небе (N)» и строки — не ниже 44 px
      await p.locator('#find').tap();
      await p.fill('#find', 'Иаков');
      await p.waitForTimeout(600);
      const rows = await p.locator('.results [role="option"]').evaluateAll((os) => os.filter((o) => (o as HTMLElement).offsetParent).map((o) => ({ t: (o.textContent ?? '').trim().slice(0, 24), h: o.getBoundingClientRect().height })));
      const lowR = rows.filter((x) => x.h < 43.5);
      if (!rows.length) return fail('выдача пуста');
      return lowR.length ? fail(`низкие строки выдачи: ${lowR.map((x) => `${x.t} ${Math.round(x.h)}`).join('; ')}`) : pass(`целей листа ${r.length} (наименьшая ${Math.min(...r.map((x) => x.h))} px); строк выдачи ${rows.length}`);
    },
  },
  {
    n: 1167,
    title: 'Т7, решение 155: масштаб 200 % (720 × 450) — шапка листа высотой краткой карточки, под данными неба не меньше 140 px',
    run: async (p) => {
      const out: string[] = [];
      for (const [W, H] of [
        [720, 450],
        [640, 400],
      ]) {
        await p.setViewportSize({ width: W, height: H });
        await open(p, '#/david', { ms: 4000 });
        const r = await p.evaluate(() => {
          const sky = document.querySelector<HTMLElement>('.sky')!.getBoundingClientRect();
          const f = document.querySelector<HTMLElement>('.app > .folio');
          const card = f?.querySelector('.sheet-dot .dotcard')?.getBoundingClientRect();
          const fr = f?.getBoundingClientRect();
          const view = (document.querySelector<HTMLElement>('.sky')!.dataset.view ?? '').split(' ').map(Number);
          return { stop: f?.dataset.stop ?? '', top: fr?.top ?? sky.bottom, h: fr?.height ?? 0, cardBottom: card ? card.bottom : null, skyTop: sky.top, openTop: view[1] ?? 0 };
        });
        if (r.stop !== 'peek') return fail(`${W} × ${H}: лист ${r.stop}`);
        const data = r.top - r.skyTop - r.openTop;
        if (data < 140) return fail(`${W} × ${H}: под данными неба ${Math.round(data)} px (рамка неба ${Math.round(r.openTop)} px, шапка листа ${Math.round(r.h)} px)`);
        if (r.cardBottom === null || r.cardBottom > r.top + r.h + 1) return fail(`${W} × ${H}: краткая карточка не помещается в шапку`);
        const empty = r.top + r.h - r.cardBottom;
        if (empty > 24) return fail(`${W} × ${H}: под карточкой пусто ${Math.round(empty)} px`);
        out.push(`${W}: неба ${Math.round(data)} px, шапка ${Math.round(r.h)} px`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 1168,
    title: 'Т8, решение 154: телефон — щипок под 20°, 45° и 70° меняет масштаб, а пропорции остаются 1,0',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/david', { ms: 3500 });
      await p.locator('.folio .actions button.show-on-sky').tap();
      await p.waitForTimeout(2500);
      const c = (await p.locator('.sky canvas').boundingBox())!;
      const out: string[] = [];
      for (const deg of [20, 45, 70]) {
        const before = await lanesNow(p);
        await pinch(p, c.x + c.width / 2, c.y + c.height * 0.4, deg, 80, 180);
        await p.waitForTimeout(800);
        const after = await lanesNow(p);
        if (Math.abs(after - before) > 0.02) return fail(`щипок ${deg}°: пропорции ${before} → ${after}`);
        out.push(`${deg}°: ${after}`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 1169,
    title: 'Т9, решение 151: имена «Родства» — «Лия — жена»; пункт списка неба — отношение к выбранному; выбранная связь объявляется один раз',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await open(p, '#/iakov', { ms: 4500 });
      if (!(await dotOf(p, 'iakov'))) return fail('нет карточки у звезды Иакова');
      await kinAll(p);
      const labels = await p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-kin .person').evaluateAll((bs) => bs.map((b) => (b.getAttribute('aria-label') ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/[\u2060\u00ad]/g, '').replace(/\s+/g, ' ').trim()));
      const bare = labels.filter((l) => !/ — \S/.test(l));
      if (!labels.length || bare.length) return fail(`имена без отношения: ${bare.join(' / ') || 'кнопок нет'}`);
      if (!labels.includes('Лия — жена')) return fail(`нет «Лия — жена»: ${labels.join(' / ')}`);
      // список неба: пункт Лии называет отношение к Иакову
      const item = (await p.locator('#sky-star-liya').getAttribute('aria-label').catch(() => null)) ?? '';
      if (!/жена Иакова/.test(flat(item))) return fail(`пункт неба Лии: «${item}»`);
      // связь через «Родство»: Enter на имени — одно объявление
      await listen(p);
      const name = p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-kin .person[data-id="liya"]').first();
      await name.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      const said = (await heard(p)).filter((t) => /^Связь/.test(t));
      return said.length === 1 ? pass(`${labels.length} имён с отношением; «${flat(item).slice(0, 60)}»; связь — одно объявление`) : fail(`объявлений связи: ${said.length} (${said.join(' | ')})`);
    },
  },
  {
    n: 1170,
    title: 'Решение 156 (U9): слова команд — «К звезде» в карточке, «Отметить на небе (N)» в выдаче поиска, «поставить на небо» у конца связи вне показа',
    run: async (p) => {
      await open(p, '#/david', { ms: 3500 });
      const fly = flat(await p.locator('.app > .folio .actions button.show-on-sky').innerText());
      if (fly !== 'К звезде') return fail(`перелёт: «${fly}»`);
      await p.click('#find');
      await p.fill('#find', 'Иосиф');
      await p.waitForTimeout(600);
      const cmd = flat((await p.locator('#find-results .cmdrow.all').first().textContent()) ?? '');
      if (!/^Отметить на небе \(\d+\)$/.test(cmd)) return fail(`команда группы: «${cmd}»`);
      await p.keyboard.press('Escape');
      await open(p, '#/mariya~vk~mmt-short~cr.m.mariya', { start: 'key', ms: 4000 });
      const out = p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-out .dc-show').first();
      if (!(await out.count())) return fail('у конца связи вне показа нет команды');
      const t = flat(await out.innerText());
      return t === 'поставить на небо' ? pass('«К звезде», «Отметить на небе (N)», «поставить на небо»') : fail(`гость: «${t}»`);
    },
  },
  {
    n: 1171,
    title: 'Решение 153 (U11): имя в «Родстве» выбирает лицо и сразу открывает его карточку у звезды',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await open(p, '#/ruf', { ms: 4500 });
      if (!(await dotOf(p, 'ruf'))) return fail('нет карточки у звезды Руфи');
      await kinAll(p);
      const name = p.locator(':is(.sky .dotcard, .folio .kin-col, aside.folio[data-link] .dotcard) .dc-kin .person[data-id="vooz"]').first();
      if (!(await name.count())) return fail('в «Родстве» Руфи нет Вооза');
      await name.click();
      await p.waitForTimeout(2200);
      if (hashId(p) !== 'vooz') return fail(`выбрано «${hashId(p)}»`);
      const card = await p.locator('.sky .dotcard[data-placed][data-id="vooz"], .folio .kin-col[data-id="vooz"]').count();
      return card ? pass('Вооз выбран, его карточка у звезды открыта') : fail('карточка у звезды Вооза не открылась');
    },
  },
];
