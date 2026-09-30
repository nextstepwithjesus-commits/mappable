/**
 * Сценарии приёмки этапа 11, задача Q4 «Доводка и приёмка» (STAGE11.md § 5, § 6, § 8, § 12), группа polish11: 850–899.
 *  — строка показа — всегда одной строкой: на широком небе полностью, на узком — без подробностей, на телефоне — коротко
 *    «Дом Нахора» — 17 лиц — изменить»; цель «изменить» на касании ≥ 44 px (Q4, п. 3);
 *  — Я12: строка семейной укладки на телефоне на масштабе чтения — выше при том же масштабе времени (Q4, п. 5);
 *  — карточка связи на телефоне — в нижнем листе на 214 px, как карточка у звезды (§ 6, § 8);
 *  — Я25: карточка связи у рода Иакова не закрывает детей Лии, если место есть (Q4, п. 2; снимок Q1
 *    preview-iakov-link); краткий вид — только когда полной карточке места нет, «всё родство» возвращает полную;
 *  — вступительная табличка не заходит на строку показа;
 *  — список звёзд неба (клавиатура, диктор) держит места звёзд после сдвига неба;
 *  — телефон: лист «Показ» — над листом карточки, «Показать» не под ней (861);
 *  — Я35: § 5.6 ТЗ на новых экранах на 1024 и 390 (на 1440 — сценарий 827): карточки, строка показа, лист «Показ»,
 *    лист-карточка телефона — без теней, скруглений, прописных, моноширинных, «·» и «→».
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';
import { cardOf, clickStar, inView, open, pan, placeIssue, starPt, templateIssues } from './unify11.ts';

const PHONE = { width: 390, height: 844, touch: true };

/** Сколько строк текста в строке показа (по верхним краям частей текста, как ShowBar.tsx) и высота цели «изменить». */
const barOf = (p: Page) =>
  p.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.sky .showbar');
    const txt = bar?.querySelector('.txt');
    if (!bar || !txt) return null;
    const r = document.createRange();
    r.selectNodeContents(txt);
    const mids: number[] = [];
    for (const q of r.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      const m = q.top + q.height / 2;
      if (!mids.some((t) => Math.abs(t - m) < 10)) mids.push(m);
    }
    const change = [...bar.querySelectorAll<HTMLElement>('.sb-cmd')].find((b) => b.textContent?.trim() === 'изменить');
    const clipped = [...bar.querySelectorAll<HTMLElement>('.sb-v')].some((e) => e.scrollWidth > e.clientWidth + 1);
    return {
      lines: mids.length,
      h: Math.round(bar.getBoundingClientRect().height),
      text: (txt.textContent ?? '').replace(/\s+/g, ' ').trim(),
      level: bar.dataset.level ?? '',
      change: change ? Math.round(change.getBoundingClientRect().height) : 0,
      clipped,
    };
  });

/** Высота строки неба сейчас, px (.sky[data-view]: «l t r b x0 kx laneTop ky»). */
const rowPx = (p: Page) => p.evaluate(() => Number(((document.querySelector('.sky') as HTMLElement).dataset.view ?? '').split(' ')[7]));

/** Показы для строки показа: всё небо, созвездие, род лица, набор, линии Мессии. */
const BARS = ['#/~va', '#/nakhor-syn-farry~vg.nahorites', '#/iuda~vr.iuda.d.0.f', '#/iakov~vr.iakov.b.2.b', '#/~vl'];

async function barCases(p: Page, touch: boolean): Promise<{ ok: boolean; why: string }> {
  const bad: string[] = [];
  const seen: string[] = [];
  for (const theme of ['night', 'day'] as const)
    for (const h of BARS) {
      await open(p, h, { theme });
      const b = await barOf(p);
      if (!b) {
        bad.push(`${h}: нет строки показа`);
        continue;
      }
      // этап 13, решение 118 (UI-06): на телефоне строка показа — до двух строк (лицо, направление, глубина, принцип
      // родства); на широком экране — одна строка, как прежде
      if (b.lines > (touch ? 2 : 1)) bad.push(`${theme} ${h}: строк ${b.lines} (${b.h} px): «${b.text}»`);
      if (!b.change && b.level === '2') bad.push(`${theme} ${h}: в короткой строке нет «изменить»`);
      if (touch && b.change && b.change < 43.5) bad.push(`${theme} ${h}: «изменить» ${b.change} px`);
      if (theme === 'night') seen.push(`«${b.text}»`);
    }
  return bad.length ? { ok: false, why: bad.slice(0, 4).join(' | ') } : { ok: true, why: seen.join('; ') };
}

export const polish11: Scenario[] = [
  {
    n: 850,
    title: 'Строка показа — одной строкой, 1440 × 900 с открытой подробной карточкой: всё небо, «Дом Нахора», род Иуды, род Иакова, линии Мессии, ночью и днём',
    run: async (p) => {
      const r = await barCases(p, false);
      return r.ok ? pass(r.why) : fail(r.why);
    },
  },
  {
    n: 851,
    title: 'Строка показа — одной строкой, 1024 × 768: те же показы, ночью и днём',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      const r = await barCases(p, false);
      return r.ok ? pass(r.why) : fail(r.why);
    },
  },
  {
    n: 852,
    title: 'Строка показа на телефоне 390 × 844 — не больше двух строк (решение 118): «Дом Нахора» — 17 лиц — изменить»; «изменить» — 44 px и открывает лист «Показ»; у рода лица — на поле рода',
    view: PHONE,
    run: async (p) => {
      const r = await barCases(p, true);
      if (!r.ok) return fail(r.why);
      await open(p, '#/iuda~vr.iuda.d.0.f');
      await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).tap();
      await p.waitForTimeout(700);
      if (!(await p.locator('.showsheet').count())) return fail('«изменить» не открыл лист «Показ»');
      const on = await p.evaluate(() => {
        const r = document.querySelector<HTMLInputElement>('.showsheet input[type="radio"]:checked');
        return r?.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      });
      if (!/^Предки и потомки лица/.test(on)) return fail(`лист открылся на «${on}», а не на «Предках и потомках лица»`);
      return pass(r.why);
    },
  },
  {
    n: 853,
    // Q4, п. 5 (Я12 на телефоне). Высота строки идёт за масштабом времени; в семейной укладке на узком небе на масштабе
    // чтения кривая сдвинута (camera.ts, ROW_SHIFT_TALL, ROW_RAMP): у семьи Иакова окно 30 лет — строка 31–32 px (было
    // 18), 60 лет — 28 px (было 15). По адресу без окна (окно — по жизни лица, 180–400 лет) и после «Вписать» строка — как
    // прежде: иначе время сжалось бы до окна без детей (род Иакова — 27 лет у рождения Иакова) или «Вписать» отдалил бы
    // время до 4 000 лет. Строка 32 px по адресу — в отчёте Q4 (остаток)
    title: 'Я12, телефон: семейная укладка на масштабе чтения — строка ≥ 31 px при окне 30 лет, ≥ 27 px при 60 годах (Иаков, Давид), касание звезды её не меняет; «Вписать» — весь род без отдаления времени',
    view: PHONE,
    run: async (p) => {
      const out: string[] = [];
      for (const [h, id, min] of [
        ['#/iakov~y-1918~w30~l0~vr.iakov.d.1.f', 'iuda', 31],
        ['#/iakov~y-1918~w60~l0~vr.iakov.d.1.f', 'iuda', 27],
        ['#/david~y-1000~w30~l0~vr.david.d.1.b', 'solomon', 31],
        ['#/david~y-1000~w60~l0~vr.david.d.1.b', 'solomon', 27],
      ] as const) {
        await open(p, h);
        const k0 = await rowPx(p);
        if (!(k0 >= min)) return fail(`${h}: строка ${k0} px`);
        const q = await inView(p, id);
        if (!q) return fail(`${h}: нет звезды ${id}`);
        await p.touchscreen.tap(q.x, q.y);
        await p.waitForTimeout(1200);
        const k1 = await rowPx(p);
        if (!(k1 >= k0 - 0.5)) return fail(`${h}: строка ${k1} px после касания (была ${k0})`);
        out.push(`${h.split('~')[0]} ${/~w(\d+)/.exec(h)![1]} лет: ${k0.toFixed(0)}/${k1.toFixed(0)}`);
      }
      // «Вписать» на телефоне: весь род Давида — окно не шире 400 лет (было 4 240 лет при сдвиге кривой на любом масштабе)
      await open(p, '#/david~vr.david.d.1.b');
      await p.locator('.skyctl button', { hasText: 'Вписать' }).first().tap();
      await p.waitForTimeout(1600);
      const w = Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1]);
      if (!(w > 0 && w <= 400)) return fail(`«Вписать» рода Давида: окно ${w} лет`);
      return pass(`${out.join(', ')}; «Вписать» — ${w} лет`);
    },
  },
  {
    n: 854,
    // строка 24 px (Я12) на широком небе — не ценой приближения времени: у рода Давида строка 22,4 px (все лица показа по
    // высоте), 24 px стоили бы окна в 27 лет вместо 182; у рода Иуды по отцам — 11 px (известный остаток, см. отчёт Q4)
    title: 'Семейная укладка на 1440 по адресу (Иаков, Давид, «Дом Нахора», род Иуды): время не приближается ради высоты строки — окно не уже 100 лет (строка — в отчёте)',
    run: async (p) => {
      const out: string[] = [];
      for (const h of ['#/iakov~vr.iakov.d.1.f', '#/david~vr.david.d.1.b', '#/nakhor-syn-farry~vg.nahorites', '#/iuda~vr.iuda.d.0.f']) {
        await open(p, h);
        const k = await rowPx(p);
        // окно — из адреса: он дописывается, когда небо встало
        let w = NaN;
        for (let t = 0; t < 20 && !(w > 0); t++) {
          w = Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1]);
          if (!(w > 0)) await p.waitForTimeout(200);
        }
        if (!(w >= 100)) return fail(`${h}: окно ${w} лет — время приближено ради строки (${decodeURIComponent(new URL(p.url()).hash)})`);
        out.push(`${k.toFixed(1)} px, ${w} лет`);
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 855,
    title: 'Телефон: выбранная связь — карточка связи в нижнем листе на 214 px (по адресу «~c» при листе на 55 % и после касания зубца)',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f~ck.iakov.rakhil._.iosif');
      await p.waitForTimeout(600);
      const st = await p.evaluate(() => ({
        stop: (document.querySelector('.folio') as HTMLElement | null)?.dataset.stop ?? '',
        link: document.querySelector('.folio .sheet-dot .dotcard[data-kind="link"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        h: Math.round(document.querySelector('.folio')?.getBoundingClientRect().height ?? 0),
      }));
      if (st.stop !== 'peek') return fail(`лист на «${st.stop}», а не на карточке`);
      if (!/Иаков и Рахиль — родители; Иосиф — сын/.test(st.link)) return fail(`в листе нет карточки связи: «${st.link.slice(0, 80)}»`);
      return pass(`лист ${st.h} px: «${st.link.slice(0, 60)}…»`);
    },
  },
  {
    n: 856,
    title: 'Я25: карточка связи «Иаков и Рахиль → Иосиф» в роде Иакова (1440 и 1024, ночь и день): обязательного 0 px²; детей Лии и других лиц семьи не закрывает, где место есть; краткий вид — только без места',
    run: async (p) => {
      const out: string[] = [];
      for (const [w, h] of [
        [1440, 900],
        [1024, 768],
      ] as const) {
        await p.setViewportSize({ width: w, height: h });
        for (const theme of ['night', 'day'] as const) {
          await open(p, '#/iakov~vr.iakov.d.1.f~ck.iakov.rakhil._.iosif', { theme });
          await p.waitForTimeout(600);
          const c = await cardOf(p);
          if (!c || c.kind !== 'link') return fail(`${w} ${theme}: карточки связи нет`);
          const r = await placeIssue(p);
          if (r.why) return fail(`${w} ${theme}: ${r.why}`);
          out.push(`${w} ${theme}: ${r.note ?? 'полная, 0 px²'}`);
        }
      }
      return pass(out.join('; '));
    },
  },
  {
    n: 857,
    title: 'Краткий вид карточки (§ 6): Давид с детьми при 1440 и подробной карточке — краткая (имя, годы, одна строка «Родства», команды); «всё родство» — полная и больше не сжимается; Хам на всём небе — полная',
    run: async (p) => {
      await open(p, '#/david~vr.david.d.1.b');
      if (!(await clickStar(p, 'david'))) return fail('нет звезды Давида');
      const c = await cardOf(p);
      if (!c) return fail('карточки нет');
      if (!c.brief) {
        // место нашлось — краткий вид не нужен; тогда и «всё родство» нет
        return (await placeIssue(p)).why ? fail(`полная карточка: ${(await placeIssue(p)).why}`) : pass('полной карточке место нашлось');
      }
      const rows = await p.locator('.sky .dotcard .dc-kin .dc-row:not(.all)').count();
      if (rows !== 1) return fail(`в краткой карточке строк «Родства»: ${rows}`);
      if (await p.locator('.sky .dotcard .dc-top .av').count()) return fail('в краткой карточке — образ');
      const all = p.locator('.sky .dotcard .dc-row.all .dc-more');
      if (!(await all.count())) return fail('нет «всё родство»');
      const label = (await all.innerText()).trim();
      await all.click();
      await p.waitForTimeout(900);
      const d = await cardOf(p);
      if (!d || d.brief) return fail('после «всё родство» карточка краткая');
      if (!(await p.locator('.sky .dotcard .dc-row.children').count())) return fail('после «всё родство» нет строки детей');
      // небо сдвинули — полная карточка остаётся полной (читатель просил её)
      await pan(p, 40, 0);
      if ((await cardOf(p))?.brief) return fail('после сдвига неба карточка снова краткая');
      await open(p, '#/kham~va');
      await clickStar(p, 'kham');
      const k = await cardOf(p);
      if (!k || k.brief) return fail('у Хама на всём небе — краткая карточка');
      return pass(`«${label}» → полная`);
    },
  },
  {
    n: 858,
    title: 'Вступительная табличка («Как читать карту») и строка показа не перекрываются — 1440, 1024 и 390, ночью и днём; и при первом посещении с родом Иакова (строка — одной строкой)',
    run: async (p) => {
      const bad: string[] = [];
      for (const [w, h] of [
        [1440, 900],
        [1024, 768],
        [390, 844],
      ] as const) {
        await p.setViewportSize({ width: w, height: h });
        for (const theme of ['night', 'day'] as const) {
          await open(p, '#/', { theme });
          const b = p.locator('button', { hasText: 'Как читать карту' }).first();
          if (await b.count()) await b.click();
          await p.waitForTimeout(700);
          const r = await p.evaluate(() => {
            const a = document.querySelector('.cartouche')?.getBoundingClientRect();
            const s = document.querySelector('.sky .showbar')?.getBoundingClientRect();
            if (!a || !s) return null;
            return Math.max(0, Math.min(a.right, s.right) - Math.max(a.left, s.left)) * Math.max(0, Math.min(a.bottom, s.bottom) - Math.max(a.top, s.top));
          });
          if (r === null) bad.push(`${w} ${theme}: нет таблички или строки показа`);
          else if (r > 0.5) bad.push(`${w} ${theme}: табличка закрывает строку показа на ${Math.round(r)} px²`);
        }
        // первое посещение (табличка открыта сама) с длинной строкой показа — род Иакова: строка не ложится на табличку
        // и на её заголовок «Толедот» (снимок координатора на c0b9396), строка — одной строкой
        await open(p, '#/iakov~vr.iakov.d.1.f');
        // как при первом посещении — табличка открыта (прогон ставит «toledot:intro» до загрузки, поэтому — отметкой таблички)
        await p.evaluate(() => localStorage.setItem('toledot:cartouche', 'open'));
        await p.reload();
        await p.waitForTimeout(2600);
        const first = await p.evaluate(() => {
          const a = document.querySelector('.cartouche')?.getBoundingClientRect();
          const t = document.querySelector('.cartouche h1, .cartouche h2')?.getBoundingClientRect();
          const s = document.querySelector('.sky .showbar')?.getBoundingClientRect();
          if (!a || !s) return null;
          const [all, title] = [a, t].map((x) => (x ? Math.max(0, Math.min(x.right, s.right) - Math.max(x.left, s.left)) * Math.max(0, Math.min(x.bottom, s.bottom) - Math.max(x.top, s.top)) : 0));
          return { all, title, h: s.height };
        });
        if (!first) bad.push(`${w} род Иакова: нет открытой таблички или строки показа`);
        else if (first.all > 0.5) bad.push(`${w} род Иакова: строка показа на табличке ${Math.round(first.all)} px² (на заголовке ${Math.round(first.title)})`);
        // на телефоне — до двух строк (решение 118), на широком экране — одна
        else if (first.h > (w < 600 ? 96 : 40)) bad.push(`${w} род Иакова: строка показа в ${Math.round(first.h)} px — перенеслась`);
      }
      return bad.length ? fail(bad.join(' | ')) : pass('0 px²; и при первом посещении с родом Иакова');
    },
  },
  {
    n: 859,
    title: 'Список звёзд неба (клавиатура, диктор) после сдвига неба: места звёзд обновляются, когда небо встало, и совпадают с кадром (±1 px)',
    run: async (p) => {
      await open(p, '#/iakov~vr.iakov.d.1.f');
      await pan(p, -120, 60);
      await p.waitForTimeout(900);
      const r = await p.evaluate(() => {
        const frame = new Map(
          ((document.querySelector('.sky canvas') as HTMLElement).dataset.stars ?? '')
            .split(';')
            .filter(Boolean)
            .map((q) => {
              const [id, xy] = q.split(':');
              const [x, y] = xy.split(',').map(Number);
              return [id, { x, y }] as const;
            }),
        );
        const out: string[] = [];
        let n = 0;
        for (const b of document.querySelectorAll<HTMLElement>('#sky-stars button[id^="sky-star-"]')) {
          const id = b.id.slice('sky-star-'.length);
          const f = frame.get(id);
          if (!f || !b.dataset.x) continue;
          n++;
          if (Math.abs(Number(b.dataset.x) - f.x) > 1 || Math.abs(Number(b.dataset.y) - f.y) > 1) out.push(`${id}: список ${b.dataset.x},${b.dataset.y}, кадр ${f.x},${f.y}`);
        }
        return { n, out };
      });
      if (r.n < 5) return fail(`звёзд в списке и кадре: ${r.n}`);
      return r.out.length ? fail(r.out.slice(0, 3).join('; ')) : pass(`${r.n} звёзд на местах`);
    },
  },
  {
    n: 860,
    title: 'Я35: § 5.6 ТЗ на новых экранах 1024 и 390, ночью и днём — карточка у звезды, карточка связи, строка показа, лист «Показ», лист-карточка телефона: без теней, скруглений, прописных, моноширинных, «·» и «→»',
    run: async (p) => {
      const out: string[] = [];
      for (const [w, h] of [
        [1024, 768],
        [390, 844],
      ] as const) {
        await p.setViewportSize({ width: w, height: h });
        for (const theme of ['night', 'day'] as const) {
          await open(p, '#/iakov~vr.iakov.d.1.f', { theme });
          await clickStar(p, 'iakov');
          out.push(...(await templateIssues(p, ['.sky .dotcard', '.sky .showbar', '.folio .sheet-dot'])).map((x) => `${w} ${theme}: ${x}`));
          await open(p, '#/iakov~vr.iakov.d.1.f~ck.iakov.rakhil._.iosif', { theme });
          out.push(...(await templateIssues(p, ['.sky .dotcard', '.folio .sheet-dot'])).map((x) => `${w} ${theme} связь: ${x}`));
          // у рода лица «изменить» — только в короткой строке; лист «Показ» — из строки созвездия
          await open(p, '#/~vg.nahorites', { theme });
          await p.locator('.sky .showbar .sb-cmd', { hasText: 'изменить' }).first().click();
          await p.waitForTimeout(500);
          out.push(...(await templateIssues(p, ['.showsheet', '.sky .showbar'])).map((x) => `${w} ${theme} лист: ${x}`));
        }
      }
      return out.length ? fail([...new Set(out)].slice(0, 5).join(' | ')) : pass();
    },
  },
  {
    n: 861,
    title: 'Телефон, карточка на 55 %: лист «Показ» — над листом карточки (карточка опускается на 214 px); «Показать …» видна и нажимается, все виды показа — в листе',
    view: PHONE,
    run: async (p) => {
      await open(p, '#/david');
      if ((await p.locator('.folio').getAttribute('data-stop')) !== 'half') return fail(`лист карточки не на 55 %: ${await p.locator('.folio').getAttribute('data-stop')}`);
      await p.locator('.showbar button.sb-cmd[data-cmd="sheet"]').first().tap();
      await p.waitForTimeout(800);
      const r = await p.evaluate(() => {
        const sh = document.querySelector('.sky .showsheet')?.getBoundingClientRect();
        const f = document.querySelector('.folio')?.getBoundingClientRect();
        const ap = document.querySelector<HTMLElement>('.showsheet .ss-apply button.apply');
        const a = ap?.getBoundingClientRect();
        const hit = a ? document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2) : null;
        return { sheet: sh ? sh.bottom : null, folio: f ? f.top : null, stop: document.querySelector<HTMLElement>('.folio')?.dataset.stop, apply: !!ap && !!hit && ap.contains(hit), kinds: document.querySelectorAll('.showsheet input[name="show-kind"]').length };
      });
      if (r.sheet === null || r.folio === null) return fail('нет листа «Показ» или карточки');
      if (r.sheet > r.folio + 0.5) return fail(`лист «Показ» уходит под карточку: низ ${Math.round(r.sheet)}, карточка с ${Math.round(r.folio)}`);
      if (r.stop !== 'peek') return fail(`карточка не опустилась: ${r.stop}`);
      if (!r.apply) return fail('«Показать …» закрыта');
      if (r.kinds < 6) return fail(`видов показа в листе ${r.kinds}`);
      await p.locator('.showsheet input[name="show-kind"][value="lines"]').first().check({ force: true });
      await p.waitForTimeout(300);
      await p.locator('.showsheet .ss-apply button.apply').first().tap();
      await p.waitForTimeout(1200);
      const show = await p.evaluate(() => document.documentElement.dataset.show);
      return show === 'l' ? pass(`лист до ${Math.round(r.sheet)}, карточка с ${Math.round(r.folio)}; «Показать» — линии Мессии`) : fail(`показ после «Показать»: ${show}`);
    },
  },
];
void starPt;
