/** Сценарии приёмки этапа 5: панели «Родство», «Синопсис», «Главы», «Сквозной раздел», «О карте», «Указатель» и разворот. Номера 110–129. */
import type { Page } from 'playwright';
import { pass, fail, find, hashId, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };
const nb = (s: string) => s.replace(/[ ⁠]/g, (c) => (c === ' ' ? ' ' : ''));

/** Открыть панель верхней строки: командой или из «Ещё». */
async function openPanel(p: Page, name: string) {
  const direct = p.locator('.commands > button', { hasText: name });
  if ((await direct.count()) && (await direct.first().isVisible())) await direct.first().click();
  else {
    await p.locator('.commands .more > button').click();
    await p.locator('.commands .more [role^="menuitem"]', { hasText: name }).first().click();
  }
  await p.waitForTimeout(700);
}
/** Путь родства, который светится на небе (SkyView пишет его в data-kin-path). */
const skyPath = async (p: Page) => ((await p.locator('.sky').getAttribute('data-kin-path')) ?? '').split(' ').filter(Boolean);
const sheet = (p: Page) => p.locator('section.sheet');

/** Пара из адреса: a и b (D8). */
const pair = (p: Page) => {
  const h = decodeURIComponent(new URL(p.url()).hash);
  const f = Object.fromEntries(h.replace(/^#\/[^~]*/, '').split('~').filter(Boolean).map((x) => [x[0], x.slice(1)]));
  return { a: f.a ?? hashId(p), b: f.b ?? '', p: f.p ?? '' };
};

export const panels: Scenario[] = [
  {
    n: 110,
    title: 'G1 мышью: Руфь → «Родство» → поле «Второе» — комбобокс поиска; два пути различимы, у Иосифа — «по закону», цепочка с терминами, «показать путь на небе» меняет путь',
    run: async (p) => {
      await find(p, 'Руфь');
      await openPanel(p, 'Родство');
      const input = sheet(p).locator('input[role="combobox"]');
      if (!(await input.count())) return fail('поле «Второе» — не комбобокс');
      await input.fill('Иисус');
      await p.waitForTimeout(300);
      const first = sheet(p).locator('[role="listbox"] [role="option"]').first();
      if (!/Иисус Христос/.test(await first.innerText())) return fail(`первая строка поля: «${(await first.innerText()).trim()}»`);
      await first.click();
      await p.waitForTimeout(900);
      const sents = (await sheet(p).locator('.relation .sent').allInnerTexts()).map(nb);
      if (sents.length < 2) return fail(`путей показано: ${sents.length}`);
      if (new Set(sents).size !== sents.length) return fail('одинаковые заголовки путей');
      if (!/через Соломона/.test(sents[0]) || !/по закону \(Мф 1:16\)/.test(sents[0]) || /по толкованию/.test(sents[0])) return fail(`первый путь: «${sents[0]}»`);
      if (!sents.some((s) => /через Нафана/.test(s) && /по толкованию/.test(s))) return fail('нет пути через Нафана «по толкованию»');
      if (!(await sheet(p).locator('.relation').first().locator('.chain .gap').count())) return fail('длинная цепочка не свёрнута');
      const terms = await sheet(p).locator('.relation').first().locator('.chain .step .term').allInnerTexts();
      if (!terms.length || terms[0] !== 'сын') return fail(`термин первого звена: «${terms[0]}»`);
      if (!(await sheet(p).locator('.relation').first().locator('.chain .step .ref').count())) return fail('у звеньев нет стихов');
      const lit0 = await skyPath(p);
      if (!lit0.includes('solomon')) return fail(`на небе не путь через Соломона: ${lit0.join(' ')}`);
      await sheet(p).locator('.relation').nth(1).getByRole('button', { name: 'показать путь на небе' }).click();
      await p.waitForTimeout(800);
      const lit1 = await skyPath(p);
      if (!lit1.includes('nafan-syn-davida') || lit1[0] !== 'ruf') return fail(`после команды на небе: ${lit1.join(' ')}`);
      const pressed = await sheet(p).locator('.relation').nth(1).getByRole('button', { name: 'показать путь на небе' }).getAttribute('aria-pressed');
      return pressed === 'true' ? pass(`${sents.length} пути; на небе — путь через Нафана`) : fail('команда не отмечена нажатой');
    },
  },
  {
    n: 111,
    title: 'G1 с клавиатуры: поле «Второе» — стрелки и Enter; «поменять местами» и «заменить» не теряют пару; Escape отменяет замену',
    run: async (p) => {
      await find(p, 'Давид');
      await openPanel(p, 'Родство');
      const input = sheet(p).locator('#kin-second');
      await input.focus();
      await p.keyboard.type('Иоав');
      await p.waitForTimeout(300);
      await p.keyboard.press('ArrowDown');
      const act = await input.getAttribute('aria-activedescendant');
      if (!act) return fail('стрелка не ставит курсор в списке');
      await p.keyboard.press('ArrowUp');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(800);
      let pr = pair(p);
      if (pr.b !== 'ioav' || hashId(p) !== 'david') return fail(`после Enter пара: ${pr.a} — ${pr.b}`);
      const sent = nb(await sheet(p).locator('.relation .sent').first().innerText());
      if (!/^Давид — дядя Иоава/.test(sent)) return fail(`фраза: «${sent}»`);
      const focused = await p.evaluate(() => document.activeElement?.className ?? '');
      if (!/sent/.test(focused)) return fail(`фокус после выбора: «${focused}»`);
      await sheet(p).getByRole('button', { name: 'поменять местами' }).focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(700);
      pr = pair(p);
      const sent2 = nb(await sheet(p).locator('.relation .sent').first().innerText());
      if (pr.a !== 'ioav' || pr.b !== 'david' || !/^Иоав — племянник Давида/.test(sent2)) return fail(`после «поменять местами»: ${pr.a} — ${pr.b}; «${sent2}»`);
      await sheet(p).getByRole('button', { name: 'Заменить второе лицо' }).focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      const repl = sheet(p).locator('#kin-second');
      if (!(await repl.count())) return fail('«заменить» не открыло поле');
      const inField = await p.evaluate(() => document.activeElement?.id);
      if (inField !== 'kin-second') return fail('фокус не в поле замены');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      pr = pair(p);
      if ((await sheet(p).locator('#kin-second').count()) || pr.b !== 'david') return fail('Escape не отменил замену или пара потеряна');
      return pass('Иоав — Давид; поменять местами; заменить и отменить');
    },
  },
  {
    n: 112,
    title: 'G1 пальцем, 390 × 844: «Родство» — лист; «показать путь на небе» сворачивает лист, путь светится на небе',
    view: PHONE,
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/ruf~pkinship~aruf~bdavid');
      await p.waitForTimeout(2000);
      if (!(await sheet(p).count())) return fail('лист «Родство» не открыт');
      const cmd = sheet(p).getByRole('button', { name: 'показать путь на небе' }).first();
      await cmd.scrollIntoViewIfNeeded();
      await cmd.tap();
      await p.waitForTimeout(1200);
      if (await sheet(p).count()) return fail('лист не свернулся');
      const lit = await skyPath(p);
      return lit.join(' ') === 'ruf ovid iessey david' ? pass('путь Руфь — Овид — Иессей — Давид на небе') : fail(`на небе: «${lit.join(' ')}»`);
    },
  },
  {
    n: 113,
    title: 'G1: Иоав — Давид — «племянник Давида (сын его сестры Саруии, 1 Пар 2:16)»; у звена по термину Писания — отвод точками и стих',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/ioav~pkinship~aioav~bdavid');
      await p.waitForTimeout(1800);
      const t = nb(await sheet(p).locator('.relation .sent').first().innerText());
      if (t !== 'Иоав — племянник Давида (сын его сестры Саруии, 1 Пар 2:16)') return fail(`фраза: «${t}»`);
      const steps = sheet(p).locator('.relation').first().locator('.chain .step');
      const n = await steps.count();
      if (n !== 2) return fail(`звеньев: ${n}`);
      const loose = await steps.nth(1).getAttribute('class');
      const ref = nb(await steps.nth(1).locator('.ref').first().innerText());
      return /loose/.test(loose ?? '') && /2:16/.test(ref) ? pass('«брат» по 1 Пар 2:16 — точками') : fail(`второе звено: ${loose}, стих «${ref}»`);
    },
  },
  {
    n: 114,
    title: 'G2: синопсис — расхождения параллельными колонками «Мф 1 | № | Лк 3 | №», липкая шапка, стихи вместо «●», вставки «Здесь расходятся» с «почему»',
    run: async (p) => {
      await openPanel(p, 'Синопсис');
      await p.waitForTimeout(1200);
      const s = sheet(p);
      const row = s.locator('tr.split', { has: p.locator('button.person[data-id="solomon"]') });
      if (!(await row.count())) return fail('нет строки расхождения с Соломоном');
      if (!(await row.locator('.nm.lk button.person[data-id="nafan-syn-davida"]').count())) return fail('Нафан не стоит рядом с Соломоном');
      const nos = (await row.locator('td.no-cell').allInnerTexts()).map((x) => x.trim());
      if (nos.join('|') !== '15|41') return fail(`номера строки: ${nos.join('|')}`);
      const align = await row.locator('td.no-cell').first().evaluate((e) => getComputedStyle(e).textAlign);
      if (align !== 'right') return fail('номера не вправо');
      const sticky = await s.locator('thead th').first().evaluate((e) => getComputedStyle(e).position);
      if (sticky !== 'sticky') return fail('шапка не липкая');
      if ((await s.locator('tbody th[scope="row"]').count()) < 40) return fail('имена — не заголовки строк');
      const bullets = await s.locator('table.synopsis').innerText();
      if (/●/.test(bullets)) return fail('в таблице остались «●»');
      if (!(await s.locator('td.ot button.ref').count())) return fail('нет ссылок на стихи в столбцах источников');
      const note = nb(await s.locator('tr.note.split').first().innerText());
      if (!/Здесь линии расходятся: Соломон\s?Мф 1:6 — Нафан\s?Лк 3:31/.test(note) || !/Почему — Илий, § 24/.test(note)) return fail(`вставка: «${note.slice(0, 160)}»`);
      if (!(await s.locator('tr', { has: p.locator('button.person[data-id="kainan-syn-arfaksada"]') }).locator('td.ot.bracket').count())) return fail('у Каинана нет чтения в скобках');
      if (!/нет/.test(await s.locator('tr', { has: p.locator('button.person[data-id="aviud-syn-zorovavelya"]') }).locator('td.ot.absent').innerText())) return fail('у Авиуда нет «нет» в 1 Пар');
      const cmd = s.locator('tr.note.split').first().getByRole('button', { name: 'показать участок на небе' });
      await cmd.click();
      await p.waitForTimeout(400);
      if ((await cmd.getAttribute('aria-pressed')) !== 'true') return fail('команда «показать участок на небе» не нажата');
      return pass('Соломон 15 | Нафан 41; шапка липкая; скобки у Каинана; «нет» у Авиуда');
    },
  },
  {
    n: 115,
    title: 'G2: переключатель понимания Лк 3 — в «Синопсисе»; «второе родословие Иосифа» сводит линии в Иосифе (Лк 3, № 1)',
    run: async (p) => {
      await openPanel(p, 'Синопсис');
      const s = sheet(p);
      if (!(await s.locator('tr', { has: p.locator('button.person[data-id="mariya"]') }).count())) return fail('в традиционном понимании нет строки Марии');
      await s.locator('[role="group"][aria-label="Как понимать Лк 3"] button', { hasText: 'второе родословие Иосифа' }).click();
      await p.waitForTimeout(500);
      const jr = s.locator('tr.common[data-id="iosif-muzh-marii"]');
      if (!(await jr.count())) return fail('Иосиф не стал общей строкой');
      const nos = (await jr.locator('td.no-cell').allInnerTexts()).map((x) => x.trim());
      if (nos.join('|') !== '41|1') return fail(`номера Иосифа: ${nos.join('|')}`);
      const note = nb(await s.locator('tr.note.join[data-at="iosif-muzh-marii"]').innerText());
      return /сходятся: Иосиф/.test(note) ? pass('Иосиф: Мф 41, Лк 1') : fail(`вставка: «${note}»`);
    },
  },
  {
    n: 116,
    title: 'G3: «Главы» — Лк 3 открывается с 3:23, «Ноев» и «Иисус» — ссылки, одноимённые различены; Мф 1 — с 1:1; черта только при наведении',
    run: async (p) => {
      await openPanel(p, 'Главы');
      const s = sheet(p);
      const lk = s.locator('.toc button[aria-label]').filter({ hasText: /^3$/ });
      const n = await lk.count();
      let clicked = false;
      for (let i = 0; i < n; i++) {
        const l = nb((await lk.nth(i).getAttribute('aria-label')) ?? '');
        if (l === 'Лк 3') {
          await lk.nth(i).click();
          clicked = true;
        }
      }
      if (!clicked) return fail('в оглавлении нет Лк 3');
      await p.waitForTimeout(1500);
      const first = (await s.locator('.chapter p sup').first().innerText()).trim();
      if (first !== '23') return fail(`первый стих: ${first}`);
      if (!(await s.locator('.chapter button.person[data-id="noy"]', { hasText: 'Ноев' }).count())) return fail('«Ноев» — не ссылка на Ноя');
      if (!(await s.locator('.chapter button.person[data-id="iisus"]', { hasText: 'Иисус' }).count())) return fail('«Иисус» (3:23) — не ссылка');
      const josephs = await s.locator('.chapter button.person', { hasText: 'Иосифов' }).evaluateAll((es) => es.map((e) => e.getAttribute('data-id')));
      if (new Set(josephs).size !== josephs.length || josephs.length !== 4) return fail(`«Иосифов»: ${josephs.join(', ')}`);
      const dec = await s.locator('.chapter button.person').first().evaluate((e) => getComputedStyle(e).textDecorationColor);
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(dec)) return fail(`черта под именем без наведения: ${dec}`);
      await s.getByRole('button', { name: /^показать стихи 1–\u2060?22$/ }).click();
      await p.waitForTimeout(300);
      if ((await s.locator('.chapter p sup').first().innerText()).trim() !== '1') return fail('«показать стихи 1–22» не показало начало главы');
      const mt = s.locator('.toc button[aria-label]').filter({ hasText: /^1$/ });
      for (let i = 0; i < (await mt.count()); i++) if (nb((await mt.nth(i).getAttribute('aria-label')) ?? '') === 'Мф 1') await mt.nth(i).click();
      await p.waitForTimeout(1200);
      return (await s.locator('.chapter p sup').first().innerText()).trim() === '1' ? pass('Лк 3:23; Ноев, Иисус; 4 разных Иосифа; Мф 1:1') : fail('Мф 1 открылась не с 1:1');
    },
  },
  {
    n: 117,
    title: 'G4: «Сквозной раздел» — таблица § 20 у царей Иудеи: годы правления, возраст при смерти (выв.), место, погребение, стихи; § 6 — как в карточке',
    view: { width: 1440, height: 900 },
    run: async (p) => {
      await openPanel(p, 'Сквозной раздел');
      const s = sheet(p);
      await p.waitForTimeout(1500);
      const heads = (await s.locator('table.xtable thead th').allInnerTexts()).map((x) => x.trim());
      if (heads.join('|') !== 'Царь|Годы правления|Возраст при смерти|Место|Погребение|Стихи') return fail(`шапка: ${heads.join('|')}`);
      const hez = s.locator('table.xtable tbody tr', { has: p.locator('button.person[data-id="ezekiya"]') });
      const age = nb(await hez.locator('td.num').innerText());
      if (!/54 года/.test(age) || !/выв\./.test(age)) return fail(`возраст Езекии: «${age}»`);
      const yrs = nb(await hez.locator('td').first().innerText());
      if (!/715–686 гг\. до Р\. Х\., 29 лет/.test(yrs)) return fail(`годы Езекии: «${yrs}»`);
      await s.locator('#xsec-n').selectOption('6');
      await p.waitForTimeout(800);
      const blocks = await s.locator('.xsec .xbody').count();
      return blocks >= 10 ? pass(`§ 20 — таблица; § 6 — лиц со сведениями: ${blocks}`) : fail(`§ 6 — лиц со сведениями: ${blocks}`);
    },
  },
  {
    n: 118,
    title: 'G6: «О карте» по-русски и без служебных строк: годы опор «966 г. до Р. Х.», нет «-966», метрик, «01», двойной точки; модель и Лк 3 — ссылками на свои места',
    run: async (p) => {
      await openPanel(p, 'О карте');
      const t = nb(await sheet(p).innerText());
      const bad = [/-\d{2,4}\b/, /persons|lanes|corridor|Assyrian/i, /г\.\./, /^0\d\s/m].find((re) => re.test(t));
      if (bad) return fail(`служебная строка: ${bad}`);
      if (!/966 г\. до Р\. Х\. \(Тиле\)/.test(t)) return fail('нет «966 г. до Р. Х. (Тиле)»');
      if (await sheet(p).locator('[role="group"][aria-label="Модель хронологии"]').count()) return fail('переключатель модели остался в «О карте»');
      await sheet(p).getByRole('button', { name: /в «Синопсисе»/ }).click();
      await p.waitForTimeout(600);
      return (await p.locator('section.sheet h2', { hasText: 'Синопсис' }).count()) ? pass('опоры по-русски; Лк 3 — в «Синопсисе»') : fail('команда не открыла «Синопсис»');
    },
  },
  {
    n: 119,
    title: 'G7: «Указатель» — три столбца; одноимённые Иосифы по году рождения, с годами; известные — полужирным; координата — по последней строке',
    run: async (p) => {
      await openPanel(p, 'Указатель');
      const s = sheet(p);
      const cols = await s.locator('.idx').evaluate((e) => getComputedStyle(e).columnCount);
      if (cols !== '3') return fail(`столбцов: ${cols}`);
      await s.locator('#idx-filter').fill('иосиф');
      await p.waitForTimeout(400);
      const subs = s.locator('.idx .entry', { has: p.locator('.row.word', { hasText: /^Иосиф$/ }) }).locator('button.row.sub');
      const texts = (await subs.allInnerTexts()).map(nb);
      if (texts.length < 8) return fail(`Иосифов: ${texts.length}`);
      if (!/^сын Иакова/.test(texts[0])) return fail(`первый Иосиф: «${texts[0]}»`);
      if (!texts.every((x) => /г\.|время не установлено/.test(x))) return fail('не у всех одноимённых есть годы');
      const known = await subs.first().getAttribute('class');
      if (!/known/.test(known ?? '')) return fail('Иосиф, сын Иакова, не выделен');
      const align = await subs.first().evaluate((e) => getComputedStyle(e).alignItems);
      return /last baseline/.test(align) ? pass(`${texts.length} Иосифов по годам`) : fail(`выравнивание координаты: ${align}`);
    },
  },
  {
    n: 120,
    title: 'G9 мышью: разворот Авраам — Исаак — линейки только между частями, § 1 не выводится, мини-шкалы на общей оси, «Показать на небе» закрывает разворот и выбирает лицо',
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/avraam~pspread~aavraam~bisaak');
      await p.waitForTimeout(2200);
      const sp = p.locator('section.spread');
      if (!(await sp.count())) return fail('разворот не открыт');
      const spines = (await sp.locator('.row:not(.mastrow) .spine').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
      if (spines.some((x) => /^1 Имя$/.test(x))) return fail('строка «1 Имя» повторяет шапки');
      const rowRules = await sp.locator('.row').evaluateAll((es) => es.filter((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0).length);
      if (rowRules) return fail(`линейки между строками: ${rowRules}`);
      const partRules = await sp.locator('h3.part').evaluateAll((es) => es.filter((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0).length);
      if (partRules < 3) return fail(`линеек между частями: ${partRules}`);
      if ((await sp.locator('canvas.lifebar').count()) !== 2) return fail('нет двух мини-шкал');
      await sp.locator('.mastrow .pg').nth(1).getByRole('button', { name: 'Показать на небе' }).click();
      await p.waitForTimeout(1200);
      if (await p.locator('section.spread').count()) return fail('разворот не закрылся');
      return hashId(p) === 'isaak' ? pass('Исаак выбран, разворот закрыт') : fail(`выбрано: ${hashId(p)}`);
    },
  },
  {
    n: 121,
    title: 'G9 пальцем, 390 × 844: разворот — один столбец, строки двух лиц подряд с именами, лист карточки скрыт',
    view: PHONE,
    run: async (p) => {
      await p.goto(p.url().replace(/#.*$/, '') + '#/avraam~pspread~aavraam~bisaak');
      await p.waitForTimeout(2200);
      const sp = p.locator('section.spread');
      if (!(await sp.count())) return fail('разворот не открыт');
      const row = sp.locator('.row:not(.mastrow):not(.quiet)').first();
      const disp = await row.evaluate((e) => getComputedStyle(e).display);
      if (disp !== 'block') return fail(`строка раздела: display ${disp}`);
      const who = (await row.locator('.pg .who').allInnerTexts()).map((x) => x.trim());
      if (who.join('|') !== 'Авраам:|Исаак:') return fail(`имена строк: ${who.join('|')}`);
      const folio = await p.locator('.folio').evaluateAll((es) => es.filter((e) => getComputedStyle(e).display !== 'none' && !(e as HTMLElement).hidden).length);
      if (folio) return fail('лист карточки виден под разворотом');
      const close = sp.locator('.spread-bar .close');
      await close.tap();
      await p.waitForTimeout(600);
      return (await p.locator('section.spread').count()) ? fail('«×» не закрыл разворот') : pass('один столбец; «×» закрывает');
    },
  },
];
