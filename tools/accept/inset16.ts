/**
 * Сценарии приёмки этапа 16, группа inset16 (исполнитель F «Семья созвездием»): номера 1220–1239, решение 186, порог О5.
 * Проверки — по разметке врезки .fam-inset (data-family, заголовок, подзаголовок, подпись масштаба, карточка источника
 * .fi-src и скрытый от глаз список лиц врезки в порядке чтения — строки «Рувим; мать — Лия»), по адресу (поле «~f») и по
 * данным собранного атласа (src/generated/atlas.json: модуль атласа в node не грузится).
 */
import type { Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../bible.ts';
import { pass, fail, hashId, type Scenario } from './kit.ts';
import { axeOn } from './unify11.ts';

type P = { id: string; n: string; s: string; f?: string; m?: string; sp?: { id: string; kind: string }[] };
let atlas: Map<string, P> | null = null;
const persons = () => (atlas ??= new Map((JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: P[] }).persons.map((q) => [q.id, q])));
/** Дети отца id по данным: имя ребёнка → имя матери (или null). */
function kidsByMother(id: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const q of persons().values()) if (q.f === id) out.set(q.n, q.m ? persons().get(q.m)!.n : null);
  return out;
}

const go = async (p: Page, hash: string, ms = 3200) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
const inset = (p: Page) => p.locator('.sky .fam-inset');
const rows = async (p: Page) => (await p.locator('.sky .fam-inset ul li > button:first-child').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const head = async (p: Page) => ({
  family: await inset(p).getAttribute('data-family'),
  title: ((await p.locator('.fam-inset .fi-title').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim(),
  sub: ((await p.locator('.fam-inset .fi-sub').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim(),
  scale: ((await p.locator('.fam-inset .fi-scale').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim(),
});
/** О5 в браузере: каждая строка ребёнка во врезке называет его мать по данным; все дети отца — во врезке. */
async function kidsCheck(p: Page, id: string): Promise<string | null> {
  const want = kidsByMother(id);
  const got = await rows(p);
  const bad: string[] = [];
  for (const [kid, mom] of want) {
    const r = got.find((t) => t === kid || t.startsWith(`${kid};`));
    if (!r) bad.push(`нет ${kid}`);
    else if (mom && !r.includes(`мать — ${mom}`)) bad.push(`${kid}: «${r}», а мать — ${mom}`);
    else if (!mom && r.includes('мать —')) bad.push(`${kid}: мать не названа, а строка «${r}»`);
  }
  return bad.length ? bad.join('; ') : null;
}
/** Строка супруги: «Валла, наложница; детей: 2». */
const spouseRow = async (p: Page, name: string) => (await rows(p)).find((t) => t.startsWith(`${name},`)) ?? null;

export const inset16: Scenario[] = [
  {
    n: 1220,
    title: 'Решение 186, О5: «Семья созвездием» Иакова из карточки у звезды — «Семья Иакова», «12 сыновей и дочь Дина», подпись масштаба; дети по матерям, Валла — наложница, Зелфа — жена',
    run: async (p) => {
      await go(p, '#/iakov~y-1560~w1500~l-4~s1');
      const at = await p.locator('.sky').getAttribute('data-sel');
      const box = await p.locator('.sky canvas').first().boundingBox();
      if (!at || !box) return fail('Иаков не на небе');
      const [x, y] = at.split(' ').map(Number);
      await p.mouse.click(box.x + x, box.y + y);
      await p.waitForTimeout(900);
      await p.locator('.sky .dotcard .dc-lineage > button').click();
      await p.waitForTimeout(300);
      const item = p.locator('.sky .dotcard [role="menuitem"]', { hasText: 'Семья созвездием' });
      if (!(await item.count())) return fail('в меню «Предки и потомки ▾» нет «Семья созвездием»');
      await item.first().click();
      await p.waitForTimeout(1200);
      if (!(await inset(p).count())) return fail('врезка не открылась');
      if (await p.locator('.sky .dotcard').count()) return fail('карточка у звезды осталась над врезкой (одна карточка на небе — решение 77)');
      const h = await head(p);
      if (h.family !== 'iakov' || h.title !== 'Семья Иакова' || h.sub !== '12 сыновей и дочь Дина') return fail(`шапка: ${JSON.stringify(h)}`);
      if (h.scale !== 'врезка без шкалы времени: дети по порядку рождения сверху вниз') return fail(`подпись масштаба: «${h.scale}»`);
      const bad = await kidsCheck(p, 'iakov');
      if (bad) return fail(bad);
      const valla = await spouseRow(p, 'Валла');
      const zelfa = await spouseRow(p, 'Зелфа');
      if (!valla?.includes('наложница') || !zelfa?.includes('жена')) return fail(`вид союза: «${valla}», «${zelfa}»`);
      if (!/~fiakov(~|$)/.test(decodeURIComponent(new URL(p.url()).hash))) return fail(`в адресе нет врезки: ${p.url()}`);
      return pass(`${h.title} — ${h.sub}; 13 детей по матерям; ${valla}; ${zelfa}`);
    },
  },
  {
    n: 1221,
    title: 'Решение 186, О5: Давид по адресу «~fdavid» — 9 союзов, 22 ребёнка, 11 от неназванных матерей; Мелхола — бездетный брак; источник союза с Вирсавией — 1 Пар 3:5; подписи врезки шести семей без столкновений',
    run: async (p) => {
      await go(p, '#/david~fdavid');
      if ((await inset(p).getAttribute('data-family')) !== 'david') return fail('врезка Давида по адресу не открылась');
      const h = await head(p);
      if (h.title !== 'Семья Давида' || h.sub !== '21 сын и дочь Фамарь') return fail(`шапка: ${JSON.stringify(h)}`);
      const bad = await kidsCheck(p, 'david');
      if (bad) return fail(bad);
      const mel = await spouseRow(p, 'Мелхола');
      if (!mel || !/детей: 0/.test(mel)) return fail(`Мелхола: «${mel}»`);
      // фокус на строке Вирсавии — союз в фокусе, внизу — стих, где она и её сыновья названы вместе
      await p.locator('.sky .fam-inset ul li > button:first-child', { hasText: /^Вирсавия,/ }).first().focus();
      await p.waitForTimeout(800);
      const src = (await p.locator('.fam-inset .fi-src').innerText()).replace(/\s+/g, ' ');
      if (!/1 Пар 3:5/.test(src) || !/Вирсавии/.test(src)) return fail(`карточка источника: «${src}»`);
      // подписи врезки на шести семьях (настоящие шрифты): подпись × знак, × подпись, × линия кроме своей выноски — 0
      // (after-avraam.png: «Хеттура, наложница» на звезде Авраама, «Агарь, жена» на нити ленты)
      const clash: string[] = [];
      for (const id of ['iakov', 'david', 'avraam', 'iuda', 'khalev-syn-esroma', 'isav']) {
        await go(p, `#/${id}~f${id}`, 2600);
        if ((await inset(p).getAttribute('data-family')) !== id) return fail(`врезка ${id} по адресу не открылась`);
        const c = (await inset(p).getAttribute('data-clash')) ?? '?';
        if (c) clash.push(`${id}: ${c}`);
      }
      if (clash.length) return fail(`столкновения подписей: ${clash.join(' | ')}`);
      return pass(`${h.sub}; ${mel}; источник: ${src.slice(0, 90)}…; подписи шести семей — без столкновений`);
    },
  },
  {
    n: 1222,
    title: 'Решение 186, О5: Авраам — Сарра и Агарь жёны, Хеттура наложница (6 сыновей); Иуда — Фамарь «брак не назван», Ир и Онан учтены',
    run: async (p) => {
      await go(p, '#/avraam~favraam');
      const a = await head(p);
      if (a.title !== 'Семья Авраама' || a.sub !== '8 сыновей') return fail(`шапка Авраама: ${JSON.stringify(a)}`);
      const bad = await kidsCheck(p, 'avraam');
      if (bad) return fail(bad);
      const ket = await spouseRow(p, 'Хеттура');
      const hag = await spouseRow(p, 'Агарь');
      if (!ket?.includes('наложница') || !/детей: 6/.test(ket) || !hag?.includes('жена')) return fail(`«${ket}», «${hag}»`);
      await go(p, '#/iuda~fiuda');
      const j = await head(p);
      if (j.title !== 'Семья Иуды' || j.sub !== '5 сыновей') return fail(`шапка Иуды: ${JSON.stringify(j)}`);
      const bad2 = await kidsCheck(p, 'iuda');
      if (bad2) return fail(bad2);
      const tam = await spouseRow(p, 'Фамарь');
      if (!tam?.includes('брак не назван')) return fail(`Фамарь: «${tam}»`);
      return pass(`${ket}; ${hag}; ${tam}`);
    },
  },
  {
    n: 1223,
    title: 'Решение 186, О5: Халев (1 Пар 2) и Исав — дети по матерям по данным; у Халева 8 сыновей «матери не названы»',
    run: async (p) => {
      await go(p, '#/khalev-syn-esroma~fkhalev-syn-esroma');
      const k = await head(p);
      if (k.title !== 'Семья Халева' || k.sub !== '16 сыновей') return fail(`шапка Халева: ${JSON.stringify(k)}`);
      const bad = await kidsCheck(p, 'khalev-syn-esroma');
      if (bad) return fail(bad);
      await go(p, '#/isav~fisav');
      const e = await head(p);
      if (e.title !== 'Семья Исава' || e.sub !== '5 сыновей') return fail(`шапка Исава: ${JSON.stringify(e)}`);
      const bad2 = await kidsCheck(p, 'isav');
      return bad2 ? fail(bad2) : pass(`${k.sub}; ${e.sub}`);
    },
  },
  {
    n: 1224,
    title: 'Решение 186: Escape закрывает врезку, поле «~f» уходит из адреса; без врезки под небом один холст',
    run: async (p) => {
      await go(p, '#/iakov~fiakov');
      if (!(await inset(p).count())) return fail('врезка по адресу не открылась');
      await p.locator('.sky .fam-inset ul li > button').first().focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(700);
      if (await inset(p).count()) return fail('Escape не закрыл врезку');
      const hash = decodeURIComponent(new URL(p.url()).hash);
      if (/~f/.test(hash)) return fail(`в адресе осталась врезка: ${hash}`);
      const n = await p.locator('.sky canvas').count();
      return n === 1 ? pass(`адрес ${hash}`) : fail(`холстов под небом: ${n}`);
    },
  },
  {
    n: 1225,
    title: 'Решение 186: пыль внуков — щелчок по точкам детей Иуды во врезке Иакова открывает семью Иуды; путь шагов «Иаков › Иуда»; то же — командой списка с клавиатуры',
    run: async (p) => {
      await go(p, '#/iakov~fiakov');
      const dust = (await inset(p).getAttribute('data-dust')) ?? '';
      const m = /(?:^|;)iuda:(-?\d+),(-?\d+)/.exec(dust);
      if (!m) return fail(`у Иуды во врезке нет пыли внуков: ${dust.slice(0, 120)}`);
      const cv = (await p.locator('.fam-layer canvas').boundingBox())!;
      await p.mouse.click(cv.x + Number(m[1]), cv.y + Number(m[2]));
      await p.waitForTimeout(1200);
      const h = await head(p);
      if (h.family !== 'iuda' || h.title !== 'Семья Иуды') return fail(`после щелчка по пыли: ${JSON.stringify(h)}`);
      const trail = ((await p.locator('.fam-inset .fi-trail').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
      if (trail !== 'Иаков › Иуда') return fail(`путь шагов: «${trail}»`);
      if (hashId(p) !== 'iuda') return fail(`выбрано «${hashId(p)}»`);
      // с клавиатуры: шаг назад по пути и снова к Иуде — командой строки списка
      await p.locator('.fam-inset .fi-trail button', { hasText: 'Иаков' }).click();
      await p.waitForTimeout(900);
      const btn = p.locator('.sky .fam-inset ul li', { hasText: /^Иуда;/ }).locator('button', { hasText: 'Семья Иуды' });
      if (!(await btn.count())) return fail('у строки Иуды нет команды «Семья Иуды»');
      await btn.first().focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1000);
      const k = await head(p);
      return k.family === 'iuda' ? pass(`${h.title}; путь «${trail}»; с клавиатуры — тоже`) : fail(`с клавиатуры: ${JSON.stringify(k)}`);
    },
  },
  {
    n: 1226,
    title: 'Решение 186: «По времени» — врезка закрывается, на небе «Ближайшая родня» того же лица',
    run: async (p) => {
      await go(p, '#/iakov~fiakov');
      await p.locator('.fam-inset .fi-cmds button', { hasText: 'По времени' }).click();
      await p.waitForTimeout(1500);
      if (await inset(p).count()) return fail('врезка не закрылась');
      const show = await p.evaluate(() => document.documentElement.dataset.show ?? '');
      return show === 'r.iakov.b.1.b' ? pass(`показ ${show}`) : fail(`показ «${show}», а не «Ближайшая родня» Иакова`);
    },
  },
  {
    n: 1227,
    title: 'Решение 186, телефон 390 × 844: «Предки и потомки ▾» → «Ближайшая родня» открывает лист «Семья»; касание ребёнка выбирает его, лист остаётся',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/iakov', 3500);
      const at = await p.locator('.sky').getAttribute('data-sel');
      const box = await p.locator('.sky canvas').first().boundingBox();
      if (!at || !box) return fail('Иаков не на небе');
      const [x, y] = at.split(' ').map(Number);
      await p.touchscreen.tap(box.x + x, box.y + y);
      await p.waitForTimeout(900);
      const menu = p.locator('.dotcard .dc-lineage > button').first();
      if (!(await menu.count())) return fail('нет меню «Предки и потомки ▾»');
      await menu.tap();
      await p.waitForTimeout(300);
      await p.locator('.dotcard [role="menuitem"]', { hasText: 'Ближайшая родня' }).first().tap();
      await p.waitForTimeout(1500);
      if (!(await p.locator('.sky .fam-inset.fam-sheet').count())) return fail('лист «Семья» не открылся');
      const h = await head(p);
      if (h.title !== 'Семья Иакова') return fail(`шапка: ${JSON.stringify(h)}`);
      const clash = (await inset(p).getAttribute('data-clash')) ?? '?';
      if (clash) return fail(`столкновения подписей листа: ${clash}`);
      // касание Иосифа на холсте врезки: место — из списка (у каждой строки — кнопка; место звезды берём из data-at)
      const pos = await p.evaluate(() => (document.querySelector('.fam-inset') as HTMLElement).dataset.at ?? '');
      const m = new RegExp('iosif:(-?[\\d.]+),(-?[\\d.]+)').exec(pos);
      if (!m) return fail(`нет места Иосифа во врезке: ${pos.slice(0, 120)}`);
      const cv = await p.locator('.fam-layer canvas').boundingBox();
      await p.touchscreen.tap(cv!.x + Number(m[1]), cv!.y + Number(m[2]));
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'iosif') return fail(`касание выбрало «${hashId(p)}»`);
      if (!(await p.locator('.sky .fam-inset.fam-sheet').count())) return fail('лист «Семья» закрылся после выбора');
      return pass('лист «Семья» без столкновений подписей; Иосиф выбран касанием, лист на месте');
    },
  },
  {
    n: 1228,
    title: 'Решение 186: Shift + F (на русской раскладке — Shift + А) открывает врезку выбранного лица и закрывает её; F без Shift — прежнее «Небо во весь экран»',
    run: async (p) => {
      await go(p, '#/iakov');
      await p.locator('.sky canvas').first().focus();
      await p.keyboard.press('Shift+KeyF');
      await p.waitForTimeout(1000);
      if ((await inset(p).getAttribute('data-family').catch(() => null)) !== 'iakov') return fail('Shift + F не открыл врезку Иакова');
      await p.keyboard.press('Shift+KeyF');
      await p.waitForTimeout(700);
      return (await inset(p).count()) ? fail('повторное Shift + F не закрыло врезку') : pass('открыта и закрыта');
    },
  },
  {
    n: 1229,
    title: 'Решение 186: строка «Ближайшей родни» — «по времени | созвездием»: «созвездием» открывает врезку того же лица, «по времени» закрывает; выбранное начертанием',
    run: async (p) => {
      await go(p, '#/iakov~vr.iakov.b.1.b');
      const on = p.locator('.sky .showbar [data-cmd="near-inset"]');
      const off = p.locator('.sky .showbar [data-cmd="near-time"]');
      if (!(await on.count()) || !(await off.count())) return fail('в строке показа нет «по времени | созвездием»');
      if ((await off.getAttribute('aria-pressed')) !== 'true') return fail('без врезки не выделено «по времени»');
      await on.click();
      await p.waitForTimeout(1000);
      if ((await inset(p).getAttribute('data-family').catch(() => null)) !== 'iakov') return fail('«созвездием» не открыло врезку');
      if ((await on.getAttribute('aria-pressed')) !== 'true') return fail('при врезке не выделено «созвездием»');
      await off.click();
      await p.waitForTimeout(700);
      return (await inset(p).count()) ? fail('«по времени» не закрыло врезку') : pass('переключение в обе стороны');
    },
  },
  {
    n: 1230,
    title: 'Решение 186, ТЗ § 3.8: axe (WCAG 2.2 AA) по врезке Давида ночью и днём — 0 нарушений',
    run: async (p) => {
      const out: string[] = [];
      for (const theme of ['night', 'day'] as const) {
        await p.evaluate((t) => localStorage.setItem('toledot:theme', JSON.stringify(t)), theme);
        await go(p, `#/david~fdavid&t=${theme}`.replace(/&t=.*$/, ''));
        await p.reload();
        await p.waitForTimeout(3000);
        if (!(await inset(p).count())) {
          out.push(`${theme}: врезка не открылась`);
          continue;
        }
        out.push(...(await axeOn(p, '.sky .fam-inset')).map((x) => `${theme}: ${x}`));
      }
      return out.length ? fail(out.slice(0, 5).join(' | ')) : pass('0 нарушений');
    },
  },
];
