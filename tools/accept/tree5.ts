/**
 * Сценарии приёмки: древо карточек (решение 73), группа tree5: номера 600–629, древо: карточки, связи, камера.
 * Древо ставится на место неба памятью браузера (toledot:view = "tree"); раскрытие — как после щелчков, из памяти
 * (toledot:work, toledot:reveal) или щелчками по командам карточек.
 */
import type { Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../bible.ts';
import { pass, fail, find, type Scenario } from './kit.ts';

const fam = (of: string) => ({ via: 'family', of });
const self = (id: string) => [id, { via: 'self', of: id }];
/** «С Адама»: на древе Адам, его союз с Евой и Ева. */
const ADAM = { work: [self('adam')], reveal: { opened: ['adam'], expanded: {} } };
/** «С Иисуса Христа»: Иисус Христос и союз Иосифа и Марии. */
const JESUS = { work: [self('iisus')], reveal: { opened: ['iisus'], expanded: {} } };
/** Адам → союз → Каин, Авель, Сиф → союз Сифа → Енос. */
const ENOS = {
  work: [self('adam'), ['eva', fam('adam')], ['kain', fam('adam')], ['avel', fam('adam')], ['sif', fam('adam')], ['enos', fam('sif')]],
  reveal: { opened: ['adam', 'sif'], expanded: { 'u:adam+eva': 'adam', 'u:sif+': 'sif' } },
};

/** Открыть древо с состоянием раскрытия st (адрес hash — выбранное лицо или пусто). */
async function openTree(p: Page, st: { work: unknown[]; reveal: unknown }, hash = '#/', theme?: 'night' | 'day') {
  await p.evaluate(
    ([st, theme]) => {
      const s = st as { work: unknown[]; reveal: unknown };
      localStorage.setItem('toledot:view', '"tree"');
      localStorage.setItem('toledot:start', '"adam"');
      localStorage.setItem('toledot:cartouche', 'folded');
      localStorage.setItem('toledot:work', JSON.stringify(s.work));
      localStorage.setItem('toledot:reveal', JSON.stringify(s.reveal));
      if (theme) localStorage.setItem('toledot:theme', JSON.stringify(theme));
      sessionStorage.clear();
    },
    [st, theme ?? null] as const,
  );
  await p.goto(`${p.url().replace(/[?#].*$/, '')}?t5=${Date.now()}${hash}`);
  await p.waitForTimeout(1600);
}
const card = (p: Page, key: string) => p.locator(`.tree .tc[data-key="${key}"]`);
/** Текст без неразрывных пробелов и склеек типографики. */
const flat = (s: string) => s.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\u2060/g, '').replace(/\s+/g, ' ').trim();
const text = async (p: Page, key: string) => flat(await card(p, key).innerText().catch(() => ''));
/** Прямоугольник карточки на экране. */
const rect = async (p: Page, key: string) => (await card(p, key).boundingBox()) ?? null;
/** Ключи карточек на древе. */
const keys = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tree .tc')].map((e) => e.dataset.key!));
/** Масштаб и сдвиг слоя древа. */
const camOf = (p: Page) =>
  p.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.tree-plane')!).transform);
    return { x: m.e, y: m.f, k: m.a };
  });
const live = (p: Page) => p.evaluate(() => document.querySelector('.tree [aria-live]')?.textContent?.trim() ?? '');
/** Пересекаются ли карточки древа (в одном столбце). */
const overlaps = (p: Page) =>
  p.evaluate(() => {
    const bs = [...document.querySelectorAll<HTMLElement>('.tree .tc')].map((e) => ({ k: e.dataset.key, r: e.getBoundingClientRect() }));
    const out: string[] = [];
    for (const a of bs) for (const b of bs) if (a !== b && a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1) out.push(`${a.k}/${b.k}`);
    return out;
  });

export const tree5: Scenario[] = [
  {
    n: 600,
    title: 'Решение 73: «С Адама» на древе — карточка Адама с образом-силуэтом (без портрета), его союз «Адам и Ева» с «Раскрыть детей (3)», карточка Евы; связи — SVG под карточками',
    run: async (p) => {
      await openTree(p, ADAM);
      const ks = await keys(p);
      for (const k of ['p:adam', 'u:adam+eva', 'p:eva']) if (!ks.includes(k)) return fail(`нет карточки ${k}: ${ks.join(', ')}`);
      const u = await text(p, 'u:adam+eva');
      if (!/союз/.test(u) || !/Адам и Ева/.test(u) || !/Ева — жена Адама/.test(u) || !/Раскрыть детей \(3\)/.test(u) || !/Быт 2:22/.test(u)) return fail(`союз: ${u}`);
      const img = await p.locator('.tree img').count();
      const av = await p.locator('.tree .tc[data-key="p:adam"] svg.av[aria-hidden="true"]').count();
      if (img || !av) return fail(`образ: img ${img}, силуэт ${av}`);
      const paths = await p.locator('.tree-links path').count();
      const a = await rect(p, 'p:adam');
      const b = await rect(p, 'u:adam+eva');
      if (!paths || !a || !b || b.x <= a.x + a.width) return fail(`связи ${paths}, союз не правее Адама`);
      return pass(`${ks.length} карточки, связей ${paths}`);
    },
  },
  {
    n: 601,
    title: 'Решение 73: «Раскрыть детей (3)» — Каин, Авель, Сиф в столбце правее союза без наложений; карточка союза остаётся на месте; диктор: «Раскрыт союз Адама и Евы: 3 ребёнка»',
    run: async (p) => {
      await openTree(p, ADAM);
      const before = await rect(p, 'u:adam+eva');
      await card(p, 'u:adam+eva').getByRole('button', { name: /Раскрыть детей/ }).click();
      await p.waitForTimeout(600);
      const after = await rect(p, 'u:adam+eva');
      const kids = await Promise.all(['p:kain', 'p:avel', 'p:sif'].map((k) => rect(p, k)));
      if (kids.some((k) => !k)) return fail('нет детей на древе');
      if (!before || !after || Math.hypot(before.x - after.x, before.y - after.y) > 1.5) return fail(`союз сдвинулся: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
      if (kids.some((k) => k!.x <= after.x + after.width)) return fail('дети не правее союза');
      const ov = await overlaps(p);
      if (ov.length) return fail(`наложения: ${ov.join(', ')}`);
      const said = await live(p);
      if (!/Раскрыт союз Адама и Евы: 3 ребёнка/.test(said)) return fail(`диктор: «${said}»`);
      const cmd = await text(p, 'u:adam+eva');
      if (!/Свернуть детей/.test(cmd)) return fail(`команда союза: ${cmd}`);
      return pass(said);
    },
  },
  {
    n: 602,
    title: 'Решение 73: Сиф → «Продолжить ветвь» — союз «Сиф» («мать детей не названа в Писании») и пустое место пунктиром; «Раскрыть детей (1)» — Енос и «Другие сыновья и дочери: имена не названы» (Быт 5:7), связь к ним пунктиром',
    run: async (p) => {
      await openTree(p, ADAM);
      await card(p, 'u:adam+eva').getByRole('button', { name: /Раскрыть детей/ }).click();
      await p.waitForTimeout(500);
      await card(p, 'p:sif').getByRole('button', { name: 'Продолжить ветвь' }).click();
      await p.waitForTimeout(500);
      const u = await text(p, 'u:sif+');
      if (!/Сиф/.test(u) || !/мать детей не названа в Писании/.test(u)) return fail(`союз Сифа: ${u}`);
      const empty = p.locator('.tree .tc-unnamed[data-key="u:sif+#b"]');
      if (!(await empty.count())) return fail('нет пустого места');
      const et = flat(await empty.innerText());
      const dashed = await empty.evaluate((e) => getComputedStyle(e).borderTopStyle);
      if (!/Мать .*не названа в Писании/.test(et) || dashed !== 'dashed') return fail(`пустое место: ${et}, рамка ${dashed}`);
      await card(p, 'u:sif+').getByRole('button', { name: /Раскрыть детей \(1\)/ }).click();
      await p.waitForTimeout(900);
      if (!(await card(p, 'p:enos').count())) return fail('нет Еноса');
      const others = p.locator('.tree .tc-others');
      const ot = flat((await others.allInnerTexts()).join(' | '));
      if (!/Другие сыновья и дочери/.test(ot) || !/имена не названы/.test(ot) || !/Быт 5:7/.test(ot) || !/Быт 5:4/.test(ot)) return fail(`другие дети: ${ot}`);
      const dash = await p.evaluate(() => [...document.querySelectorAll('.tree-links g[data-edge*="others:"] path')].map((x) => getComputedStyle(x).strokeDasharray));
      if (!dash.length || dash.some((d) => d === 'none')) return fail(`связь к другим детям: ${dash.join(', ')}`);
      // «другие дети» не входят в число детей союза: пустое место называет мать Еноса
      const et2 = flat(await empty.innerText());
      if (!/Мать Еноса не названа в Писании/.test(et2)) return fail(`пустое место после раскрытия: ${et2}`);
      const ov = await overlaps(p);
      if (ov.length) return fail(`наложения: ${ov.join(', ')}`);
      return pass(ot.replace(/\s+/g, ' '));
    },
  },
  {
    n: 603,
    title: 'Решение 69 на древе: выбран Адам — связи к Каину, Авелю и Сифу тремя цветами ветвей, к Еносу — цветом Сифа бледнее; выбран Енос — путь к предкам светлый, Каин гаснет (40 %); справа — подробная карточка',
    run: async (p) => {
      await openTree(p, ENOS, '#/adam');
      const col = (to: string) =>
        p.evaluate((to) => {
          const g = [...document.querySelectorAll<SVGGElement>('.tree-links g')].find((x) => x.dataset.edge?.endsWith(`>${to}`));
          const ln = g?.querySelector<SVGPathElement>('path.ln, path.rb');
          const glow = g?.querySelector<SVGPathElement>('path.glow');
          return ln ? { stroke: getComputedStyle(glow ?? ln).stroke, op: Number(getComputedStyle(glow ?? ln).opacity), cls: ln.getAttribute('class') } : null;
        }, to);
      const [k, a, s, e] = await Promise.all(['p:kain', 'p:avel', 'p:sif', 'p:enos'].map(col));
      if (!k || !a || !s || !e) return fail('нет связей');
      if (new Set([k.stroke, a.stroke, s.stroke]).size !== 3) return fail(`цвета ветвей: ${k.stroke} ${a.stroke} ${s.stroke}`);
      if (e.stroke !== s.stroke || !(e.op < s.op)) return fail(`Енос: ${e.stroke} ${e.op} против Сифа ${s.stroke} ${s.op}`);
      if (!/Адам/.test(await p.locator('.folio').innerText())) return fail('справа нет карточки Адама');
      await p.locator('.tree-ctl').getByText('Вписать всё').click();
      await p.waitForTimeout(500);
      await card(p, 'p:enos').click({ position: { x: 100, y: 12 } });
      await p.waitForTimeout(800);
      const k2 = await col('p:kain');
      const s2 = await col('p:sif');
      if (!k2 || !/dim/.test(k2.cls ?? '') ) return fail(`Каин не погас: ${k2?.cls}`);
      if (!s2 || !/anc/.test(s2.cls ?? '') && !/rb/.test(s2.cls ?? '')) return fail(`путь к Сифу: ${s2?.cls}`);
      const cur = await card(p, 'p:enos').getAttribute('aria-current');
      if (cur !== 'true') return fail('Енос не выделен рамкой');
      return pass(`${k.stroke} ${a.stroke} ${s.stroke}`);
    },
  },
  {
    n: 604,
    title: 'Ленты на древе: Адам → союз → Сиф → союз → Енос — двойная нить, золотая (Мф) и лазурная (Лк); к Каину — одна серая линия; у Сифа — знак обеих линий',
    run: async (p) => {
      await openTree(p, ENOS);
      const kinds = (edge: string) => p.evaluate((edge) => [...document.querySelectorAll(`.tree-links g[data-edge="${edge}"] path`)].map((x) => x.getAttribute('class')), edge);
      const sif = await kinds('u:adam+eva>p:sif');
      const enos = await kinds('u:sif+>p:enos');
      const kain = await kinds('u:adam+eva>p:kain');
      if (!sif.some((c) => /rb mt/.test(c ?? '')) || !sif.some((c) => /rb lk/.test(c ?? ''))) return fail(`Сиф: ${sif.join(', ')}`);
      if (!enos.some((c) => /rb mt/.test(c ?? '')) || !enos.some((c) => /rb lk/.test(c ?? ''))) return fail(`Енос: ${enos.join(', ')}`);
      if (kain.some((c) => /rb/.test(c ?? ''))) return fail(`Каин: ${kain.join(', ')}`);
      const marks = await p.locator('.tree .tc[data-key="p:sif"] .tc-lines i').count();
      if (marks !== 2) return fail(`знаки линий у Сифа: ${marks}`);
      return pass();
    },
  },
  {
    n: 605,
    title: 'Карточка союза на древе: «Подробнее» открывает справа карточку союза «Адам и Ева»; щелчок по карточке лица — его подробную карточку',
    run: async (p) => {
      await openTree(p, ADAM);
      await card(p, 'u:adam+eva').getByRole('button', { name: /Подробнее/ }).click();
      await p.waitForTimeout(900);
      const t = await p.locator('.folio #union-title').innerText().catch(() => '');
      if (!/Адам и Ева/.test(t)) return fail(`карточка союза: «${t}»`);
      if ((await card(p, 'u:adam+eva').getAttribute('aria-current')) !== 'true') return fail('союз не выделен');
      await card(p, 'p:eva').click({ position: { x: 150, y: 16 } });
      await p.waitForTimeout(900);
      const h = await p.locator('.folio h2').first().innerText();
      if (!/Ева/.test(h)) return fail(`карточка лица: ${h}`);
      return pass();
    },
  },
  {
    n: 606,
    title: 'Клавиатура на древе: Tab — к карточкам по столбцам; → — к союзу, → — к ребёнку, ↓ — по столбцу, ← — назад к союзу; Enter — подробная карточка; пробел — «Раскрыть детей»',
    run: async (p) => {
      await openTree(p, ADAM);
      await card(p, 'p:adam').focus();
      await p.keyboard.press('ArrowRight');
      let f = await p.evaluate(() => (document.activeElement as HTMLElement)?.dataset.key);
      if (f !== 'u:adam+eva') return fail(`→ от Адама: ${f}`);
      await p.keyboard.press('Space');
      await p.waitForTimeout(600);
      if (!(await card(p, 'p:sif').count())) return fail('пробел не раскрыл детей');
      await p.keyboard.press('ArrowRight');
      f = await p.evaluate(() => (document.activeElement as HTMLElement)?.dataset.key);
      if (!['p:kain', 'p:avel', 'p:sif'].includes(f ?? '')) return fail(`→ от союза: ${f}`);
      const first = f;
      await p.keyboard.press('ArrowDown');
      f = await p.evaluate(() => (document.activeElement as HTMLElement)?.dataset.key);
      if (f === first) return fail('↓ не сдвинул фокус');
      await p.keyboard.press('ArrowLeft');
      f = await p.evaluate(() => (document.activeElement as HTMLElement)?.dataset.key);
      if (f !== 'u:adam+eva' && !/^u:sif\+#/.test(f ?? '')) return fail(`← от ребёнка: ${f}`);
      await card(p, 'p:kain').focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      const h = await p.locator('.folio h2').first().innerText();
      if (!/Каин/.test(h)) return fail(`Enter: ${h}`);
      // порядок Tab: первые карточки — первый столбец
      const order = await p.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tree .tc')].map((e) => e.getBoundingClientRect().left));
      if (order.some((x, i) => i && x < order[i - 1] - 1)) return fail('порядок карточек не по столбцам');
      return pass();
    },
  },
  {
    n: 607,
    title: 'Масштаб древа: колесо — у указателя; «−», «+» и клавиши «+», «−» (по физическим клавишам); предел 0,3 — «Отдалить» выключается; «Вписать всё»',
    run: async (p) => {
      await openTree(p, ENOS);
      const c0 = await camOf(p);
      const box = (await p.locator('.tree').boundingBox())!;
      await p.mouse.move(box.x + 300, box.y + 300);
      await p.mouse.wheel(0, 300);
      await p.waitForTimeout(200);
      const c1 = await camOf(p);
      if (!(c1.k < c0.k)) return fail(`колесо: ${c0.k} → ${c1.k}`);
      await p.locator('.tree').click({ position: { x: 5, y: box.height - 5 } }).catch(() => {});
      await p.keyboard.press('Equal');
      await p.waitForTimeout(350);
      const c2 = await camOf(p);
      if (!(c2.k > c1.k)) return fail(`клавиша +: ${c1.k} → ${c2.k}`);
      for (let i = 0; i < 12; i++) {
        await p.locator('.tree-ctl button[aria-label="Отдалить"]').click();
        await p.waitForTimeout(60);
      }
      await p.waitForTimeout(300);
      const c3 = await camOf(p);
      const off = await p.locator('.tree-ctl button[aria-label="Отдалить"]').getAttribute('aria-disabled');
      if (Math.abs(c3.k - 0.3) > 0.01 || off !== 'true') return fail(`предел: ${c3.k}, «Отдалить» ${off}`);
      await p.locator('.tree-ctl').getByText('Вписать всё').click();
      await p.waitForTimeout(500);
      const c4 = await camOf(p);
      if (!(c4.k > 0.3 && c4.k <= 1)) return fail(`вписать: ${c4.k}`);
      return pass(`k: ${c0.k.toFixed(2)} → ${c1.k.toFixed(2)} → ${c2.k.toFixed(2)} → ${c3.k.toFixed(2)} → ${c4.k.toFixed(2)}`);
    },
  },
  {
    n: 608,
    title: 'Протяжка сдвигает древо; отпускание после протяжки по карточке не выбирает лицо; «К выбранному» ставит выбранную карточку в середину видимой части (под строкой у кромки)',
    run: async (p) => {
      await openTree(p, ENOS, '#/adam');
      const c0 = await camOf(p);
      const r = (await rect(p, 'p:kain'))!;
      await p.mouse.move(r.x + 150, r.y + 20);
      await p.mouse.down();
      await p.mouse.move(r.x + 50, r.y + 60, { steps: 6 });
      await p.mouse.up();
      await p.waitForTimeout(400);
      const c1 = await camOf(p);
      if (Math.abs(c1.x - c0.x + 100) > 2 || Math.abs(c1.y - c0.y - 40) > 2) return fail(`сдвиг: ${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);
      const h = await p.locator('.folio h2').first().innerText();
      if (!/Адам/.test(h)) return fail(`протяжка выбрала лицо: ${h}`);
      await p.locator('.tree-ctl').getByText('К выбранному').click();
      await p.waitForTimeout(500);
      const a = (await rect(p, 'p:adam'))!;
      const t = (await p.locator('.tree').boundingBox())!;
      // посередине видимой части: под строкой «Раскрыто N лиц» у кромки и над нижним полем 24 px
      const barBottom = await p.evaluate(() => document.querySelector('.treearea > .skytop')?.getBoundingClientRect().bottom ?? 0);
      const top = Math.max(24, barBottom - t.y + 8);
      const mid = t.y + (top + t.height - 24) / 2;
      if (Math.abs(a.x + a.width / 2 - (t.x + t.width / 2)) > 3 || Math.abs(a.y + a.height / 2 - mid) > 3) return fail(`Адам не посередине: ${a.y + a.height / 2} против ${mid}`);
      return pass();
    },
  },
  {
    n: 609,
    title: '«С Иисуса Христа» на древе: у Иисуса Христа — восьмилучевая звезда вместо силуэта; союз «Иосиф и Мария» («Иосиф — законный отец»); «Родители» у Иосифа — союз Иакова слева без братьев; «Скрыть родителей» — убирает',
    run: async (p) => {
      await openTree(p, JESUS);
      if (!(await p.locator('.tree .tc[data-key="p:iisus"] svg.av polygon.s').count())) return fail('нет звезды у Иисуса Христа');
      const u = await text(p, 'u:iosif-muzh-marii+mariya');
      if (!/Иосиф и Мария/.test(u) || !/законный отец/.test(u)) return fail(`союз: ${u}`);
      const n0 = (await keys(p)).length;
      await card(p, 'p:iosif-muzh-marii').getByRole('button', { name: 'Родители' }).click();
      await p.waitForTimeout(700);
      const ks = await keys(p);
      if (!ks.includes('u:iakov-otets-iosifa+')) return fail(`нет союза Иакова: ${ks.join(', ')}`);
      const a = (await rect(p, 'u:iakov-otets-iosifa+'))!;
      const j = (await rect(p, 'p:iosif-muzh-marii'))!;
      if (!(a.x + a.width <= j.x)) return fail('союз родителей не левее Иосифа');
      // Иаков и пустое место матери — и только: братьев у Иосифа на древе нет
      if (ks.length - n0 > 3) return fail(`лишние карточки: ${ks.length - n0}`);
      await card(p, 'p:iosif-muzh-marii').getByRole('button', { name: 'Скрыть родителей' }).click();
      await p.waitForTimeout(700);
      if ((await keys(p)).includes('u:iakov-otets-iosifa+')) return fail('союз Иакова остался');
      return pass(`+${ks.length - n0}`);
    },
  },
  {
    n: 610,
    title: '«Свернуть ветвь» у Адама после раскрытия — дети и союз уходят, у Адама снова «Продолжить ветвь»; повтор возвращает союз',
    run: async (p) => {
      await openTree(p, ENOS);
      await card(p, 'p:adam').getByRole('button', { name: 'Свернуть ветвь' }).click();
      await p.waitForTimeout(700);
      const ks = await keys(p);
      if (ks.join() !== 'p:adam') return fail(`осталось: ${ks.join(', ')}`);
      await card(p, 'p:adam').getByRole('button', { name: 'Продолжить ветвь' }).click();
      await p.waitForTimeout(700);
      if (!(await keys(p)).includes('u:adam+eva')) return fail('союз не вернулся');
      return pass();
    },
  },
  {
    n: 611,
    title: 'Телефон 390 × 844: древо во всю ширину; касание карточки открывает нижний лист карточки; органы — цели 44 × 44',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await openTree(p, ADAM);
      const t = (await p.locator('.tree').boundingBox())!;
      if (Math.abs(t.width - 390) > 1) return fail(`ширина древа ${t.width}`);
      const bs = await p.evaluate(() => [...document.querySelectorAll('.tree-ctl button')].map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
      if (bs.some(([w, h]) => w < 44 || h < 44)) return fail(`органы: ${JSON.stringify(bs)}`);
      await p.evaluate(() => (document.querySelector('.tree-ctl') as HTMLElement | null)?.scrollIntoView());
      const r = (await rect(p, 'p:eva'))!;
      await p.touchscreen.tap(r.x + Math.min(150, r.width / 2), r.y + 12);
      await p.waitForTimeout(1200);
      const h = await p.locator('.folio h2').first().innerText().catch(() => '');
      if (!/Ева/.test(h)) return fail(`лист: ${h}`);
      return pass();
    },
  },
  {
    n: 613,
    title: 'Миникарта древа: видна, когда древо не помещается в окно; щелчок по ней ведёт камеру; после «Вписать всё» её нет',
    run: async (p) => {
      await openTree(p, ENOS, '#/adam');
      await p.locator('.tree-ctl button[aria-label="Приблизить"]').click();
      await p.waitForTimeout(400);
      const map = p.locator('.tree .tree-map');
      if (!(await map.count())) return fail('миникарты нет, хотя древо не помещается');
      const hidden = await map.getAttribute('aria-hidden');
      const m = (await map.boundingBox())!;
      const c0 = await camOf(p);
      await p.mouse.click(m.x + 3, m.y + m.height / 2);
      await p.waitForTimeout(300);
      const c1 = await camOf(p);
      if (!(c1.x > c0.x + 20)) return fail(`щелчок по левому краю миникарты: ${c0.x} → ${c1.x}`);
      await p.locator('.tree-ctl').getByText('Вписать всё').click();
      await p.waitForTimeout(600);
      if (await map.count()) return fail('миникарта осталась, хотя древо вписано');
      return pass(`aria-hidden=${hidden}`);
    },
  },
  {
    n: 614,
    title: 'Телефон: касание карточки открывает лист карточки, а выбранная карточка древа остаётся над листом, а не под ним',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await openTree(p, ENOS);
      await p.locator('.tree-ctl').getByText('Вписать всё').tap();
      await p.waitForTimeout(500);
      const r = (await rect(p, 'p:enos'))!;
      await p.touchscreen.tap(r.x + Math.min(40, r.width / 2), r.y + 8);
      await p.waitForTimeout(1500);
      const f = await p.locator('.folio[data-stop]').boundingBox();
      const c = await rect(p, 'p:enos');
      if (!f || !c) return fail('нет листа или карточки');
      if (c.y + c.height > f.y + 1) return fail(`карточка под листом: низ ${Math.round(c.y + c.height)}, лист с ${Math.round(f.y)}`);
      return pass(`низ карточки ${Math.round(c.y + c.height)}, лист с ${Math.round(f.y)}`);
    },
  },
  {
    n: 615,
    title: 'Набор из чужой ссылки (~k1~n…) виден и в древе: Иессей, Давид и их союз; команд раскрытия нет (только просмотр), свой набор не меняется',
    run: async (p) => {
      await openTree(p, ADAM, '#/david~t1~k1~niessey.david');
      const ks = await keys(p);
      if (!ks.includes('p:iessey') || !ks.includes('p:david') || ks.includes('p:adam')) return fail(`на древе: ${ks.join(', ')}`);
      const cmds = await p.evaluate(() => [...document.querySelectorAll('.tree .tc .cmd')].map((b) => b.textContent?.trim()));
      if (cmds.some((c) => c !== 'Подробнее')) return fail(`команды: ${cmds.join(', ')}`);
      const mine = await p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string][]).map((r) => r[0]));
      if (mine.join() !== 'adam') return fail(`свой набор: ${mine.join()}`);
      return pass(ks.join(', '));
    },
  },
  {
    n: 616,
    title: 'Лицо, выбранное вне древа (поиск «Давид»), появляется на древе карточкой и в виду; выбор карточкой внутри древа ничего не добавляет',
    run: async (p) => {
      await openTree(p, ENOS, '#/adam');
      const n0 = (await keys(p)).length;
      await card(p, 'p:kain').click({ position: { x: 100, y: 12 } });
      await p.waitForTimeout(500);
      if ((await keys(p)).length !== n0) return fail('выбор внутри древа добавил карточки');
      await find(p, 'Давид');
      await p.waitForTimeout(800);
      const d = await rect(p, 'p:david');
      if (!d) return fail('Давида нет на древе');
      const t = (await p.locator('.tree').boundingBox())!;
      if (d.x < t.x || d.y < t.y || d.x + d.width > t.x + t.width || d.y + d.height > t.y + t.height) return fail('Давид вне окна древа');
      const mine = await p.evaluate(() => (JSON.parse(localStorage.getItem('toledot:work') ?? '[]') as [string, { via: string }][]).find((r) => r[0] === 'david')?.[1].via);
      if (mine !== 'self') return fail(`Давид в наборе: ${mine}`);
      return pass();
    },
  },
  {
    n: 617,
    title: 'Клавиши древа: «0» вписывает древо и слушается выключателя «Клавиши-буквы»; «+» работает и при выключенных буквах; «Толедот» в верхней строке вписывает древо',
    run: async (p) => {
      await openTree(p, ENOS);
      const k0 = (await camOf(p)).k;
      await p.keyboard.press('Equal');
      await p.keyboard.press('Equal');
      await p.waitForTimeout(400);
      const k1 = (await camOf(p)).k;
      if (!(k1 > k0)) return fail(`«+»: ${k0} → ${k1}`);
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(500);
      const k2 = (await camOf(p)).k;
      if (!(k2 < k1)) return fail(`«0»: ${k1} → ${k2}`);
      await p.evaluate(() => localStorage.setItem('toledot:letterKeys', 'false'));
      await p.reload();
      await p.waitForTimeout(1600);
      await p.keyboard.press('Equal');
      await p.waitForTimeout(400);
      const k3 = (await camOf(p)).k;
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(500);
      const k4 = (await camOf(p)).k;
      if (Math.abs(k4 - k3) > 1e-3) return fail(`«0» при выключенных буквах: ${k3} → ${k4}`);
      await p.locator('header.top .wordmark').click();
      await p.waitForTimeout(500);
      const k5 = (await camOf(p)).k;
      if (!(k5 < k4)) return fail(`«Толедот»: ${k4} → ${k5}`);
      return pass(`k: ${[k0, k1, k2, k3, k4, k5].map((x) => x.toFixed(2)).join(' → ')}`);
    },
  },
  {
    n: 612,
    title: 'Доступность древа (axe, WCAG 2.2 AA) ночью и днём: карточки, команды, органы, образы; раскрытое древо с выбранным лицом',
    run: async (p) => {
      const axe = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await openTree(p, ENOS, '#/sif', theme);
        await p.evaluate(axe);
        const v = (await p.evaluate(
          `axe.run(document.querySelector('.tree'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join('; ')))`,
        )) as string[];
        out.push(...v.map((x) => `${theme}: ${x}`));
      }
      return out.length ? fail(out.join(' | ')) : pass();
    },
  },
];
