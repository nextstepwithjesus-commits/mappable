/**
 * Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа input3: номера 370–389, ввод на
 * небе, меню и подсказки (L5). Проверки — по окну неба .sky[data-view] («vp.l vp.t vp.r vp.b x0 kx laneTop ky»), месту
 * звёзд в списке неба для диктора (#sky-star-<id> data-x, data-y), адресу, разметке меню и подсказки.
 */
import type { Page } from 'playwright';
import { pass, fail, hashId, type Check, type Scenario } from './kit.ts';

const PHONE = { width: 390, height: 844, touch: true };
const flat = (s: string) => s.replace(/⁠/g, '').replace(/ /g, ' ');
const go = async (p: Page, hash: string, ms = 2400) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
const view = async (p: Page) => ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
/** Звезда лица на холсте (px холста) — по списку неба для диктора; null — её нет среди лиц на виду. */
const star = (p: Page, id: string) =>
  p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`) as HTMLElement | null;
    return b && b.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
  }, id);
const canvasBox = async (p: Page) => (await p.locator('.sky > canvas').boundingBox())!;
/** Текст фокуса: подпись для диктора или текст. */
const focusText = (p: Page) => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '');
/** Подсказка под указателем в точке холста (x, y): текст видимой подсказки, после задержки ms. */
async function tipAt(p: Page, x: number, y: number, ms = 1100): Promise<string> {
  const c = await canvasBox(p);
  await p.mouse.move(c.x + x, c.y + y);
  await p.waitForTimeout(ms);
  const t = p.locator('.sky .tip[data-shown]');
  return (await t.count()) ? flat(await t.innerText()) : '';
}
/** Правой кнопкой по звезде: меню звезды открыто? */
async function menuOn(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  const c = await canvasBox(p);
  const s = await star(p, id);
  if (!s) return null;
  await p.mouse.click(c.x + s.x, c.y + s.y, { button: 'right' });
  await p.waitForTimeout(600);
  return (await p.locator('.sky .skymenu').count()) ? { x: c.x + s.x, y: c.y + s.y } : null;
}

export const input3: Scenario[] = [
  {
    n: 370,
    title: 'IX-72: пока меню звезды открыто, щелчок мимо только закрывает его — не выбирает звезду и не снимает выбор; так же у «Добавить в набор ▾»',
    run: async (p): Promise<Check> => {
      await go(p, '#/david~y-1050~w180~l0~s1', 2600);
      const v0 = await view(p);
      if (!(await menuOn(p, 'iessey'))) return fail('меню у Иессея не открылось');
      const c = await canvasBox(p);
      const so = await star(p, 'solomon');
      if (!so) return fail('Соломона нет на небе');
      await p.mouse.click(c.x + so.x, c.y + so.y);
      await p.waitForTimeout(700);
      if (await p.locator('.sky .skymenu').count()) return fail('щелчок мимо не закрыл меню');
      if (hashId(p) !== 'david') return fail(`щелчок, закрывший меню, выбрал «${hashId(p)}»`);
      // пустое небо: щелчок, закрывший меню, не снимает выбор
      if (!(await menuOn(p, 'iessey'))) return fail('меню не открылось второй раз');
      await p.mouse.click(c.x + c.width * 0.5, c.y + c.height - 60);
      await p.waitForTimeout(700);
      if (await p.locator('.sky .skymenu').count()) return fail('щелчок по пустому небу не закрыл меню');
      if (hashId(p) !== 'david') return fail('щелчок по пустому небу, закрывший меню, снял выбор');
      const v1 = await view(p);
      if (Math.abs(v1[4] - v0[4]) > 1e-3 || Math.abs(v1[5] - v0[5]) > 1e-6) return fail('щелчок, закрывший меню, сдвинул небо');
      // следующий щелчок — уже обычный: выбирает звезду
      await p.mouse.click(c.x + so.x, c.y + so.y);
      await p.waitForTimeout(700);
      if (hashId(p) !== 'solomon') return fail(`следующий щелчок не выбрал Соломона: «${hashId(p)}»`);
      // «Добавить в набор ▾» в карточке: щелчок по звезде на небе только закрывает выбор
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(300);
      if (!(await p.locator('.folio .workpick').count())) return fail('«Добавить в набор ▾» не раскрылся');
      const je = await star(p, 'iessey');
      if (!je) return fail('Иессея нет на небе');
      await p.mouse.click(c.x + je.x, c.y + je.y);
      await p.waitForTimeout(600);
      if (await p.locator('.folio .workpick').count()) return fail('щелчок мимо не закрыл выбор');
      return hashId(p) === 'solomon' ? pass('меню и выбор закрываются, выбор и небо на месте') : fail(`щелчок, закрывший выбор, выбрал «${hashId(p)}»`);
    },
  },
  {
    n: 371,
    title: 'IX-83: меню звезды — role menu; ↓ ↑ между рядами, ← → по «1 2 3 все», Home и End; фокус держит один пункт; Escape — фокус на небо',
    run: async (p) => {
      await go(p, '#/david~y-1050~w180~l0~s1', 2600);
      if (!(await menuOn(p, 'iessey'))) return fail('меню у Иессея не открылось');
      const menu = p.locator('.sky .skymenu [role="menu"]');
      if (!(await menu.count())) return fail('у меню нет role menu');
      const items = await menu.locator('[role^="menuitem"]').count();
      if (items < 10) return fail(`пунктов меню: ${items}`);
      const seq: string[] = [await focusText(p)];
      for (const k of ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'End', 'Home', 'ArrowUp']) {
        await p.keyboard.press(k);
        seq.push(`${k}: ${await focusText(p)}`);
      }
      const want = [
        /^Только Иессея$/,
        /^ArrowDown: С предками: 1 поколение$/,
        /^ArrowRight: С предками: 2 поколения$/,
        /^ArrowRight: С предками: 3 поколения$/,
        /^ArrowDown: С потомками: 3 поколения$/,
        /^ArrowLeft: С потомками: 2 поколения$/,
        /^End: Скрыть созвездие/,
        /^Home: Только Иессея$/,
        /^ArrowUp: Скрыть созвездие/,
      ];
      const bad = seq.findIndex((s, i) => !want[i].test(flat(s)));
      if (bad >= 0) return fail(`шаг ${bad}: «${seq[bad]}»; путь: ${seq.join(' | ')}`);
      const tabbable = await menu.locator('[role^="menuitem"][tabindex="0"]').count();
      if (tabbable !== 1) return fail(`в порядке Tab пунктов: ${tabbable}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
      if (await p.locator('.sky .skymenu').count()) return fail('Escape не закрыл меню');
      const onSky = await p.evaluate(() => document.activeElement === document.querySelector('.sky > canvas'));
      return onSky && hashId(p) === 'david' ? pass(seq.slice(1).join(' | ')) : fail('фокус не вернулся на небо или выбор сменился');
    },
  },
  {
    n: 372,
    title: 'UX-71: в меню звезды — «Добавить в набор:» перед пунктами набора и «На небе:» над командами вида неба; «×» закрывает меню',
    run: async (p) => {
      await go(p, '#/~y-1100~w300~l0~s1~mmt-long', 2600);
      if (!(await menuOn(p, 'gedeon'))) return fail('меню у Гедеона не открылось');
      const m = p.locator('.sky .skymenu');
      const subs = (await m.locator('.wp-sub').allInnerTexts()).map((t) => flat(t).trim());
      if (subs.join('|') !== 'Добавить в набор:|На небе:') return fail(`подзаголовки: ${subs.join(', ')}`);
      const groups = await m.locator('[role="menu"] > [role="group"]').evaluateAll((gs) => gs.map((g) => `${g.getAttribute('aria-label')}: ${[...g.querySelectorAll('[role^="menuitem"]')].map((b) => (b.textContent ?? '').trim()).join(', ')}`));
      if (!/^Добавить в набор: Только Гедеона, С семьёй, 1/.test(flat(groups[0] ?? ''))) return fail(`первая группа: ${groups[0]}`);
      if (!/^На небе: .*Скрыть созвездие «Колено Манассиино»/.test(flat(groups[1] ?? ''))) return fail(`вторая группа: ${groups[1]}`);
      const close = m.locator('.wp-head .close');
      if (!(await close.count())) return fail('у меню нет «×»');
      await close.click();
      await p.waitForTimeout(300);
      return (await m.count()) ? fail('«×» не закрыл меню') : pass(groups.join(' / '));
    },
  },
  {
    n: 373,
    title: 'MOB-77, 390 × 844: у меню после долгого касания — «×» 44 × 44 в строке с именем; касание «×» закрывает меню, выбор не меняется',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/~y-1050~w120~l0~s1', 2600);
      const c = await canvasBox(p);
      const s = (await star(p, 'iessey')) ?? (await star(p, 'david'));
      if (!s) return fail('нет звезды Иессея или Давида');
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x + s.x, y: c.y + s.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
      await p.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await p.waitForTimeout(500);
      const m = p.locator('.sky .skymenu');
      if (!(await m.count())) return fail('долгое касание не открыло меню');
      const x = m.locator('.wp-head .close');
      const b = await x.boundingBox();
      if (!b || b.width < 44 || b.height < 44) return fail(`«×» ${b ? `${b.width.toFixed(0)} × ${b.height.toFixed(0)}` : 'нет'}`);
      const name = (await m.locator('.wp-head p').boundingBox())!;
      if (Math.abs(b.y + b.height / 2 - (name.y + name.height / 2)) > 22) return fail('«×» не в строке с именем');
      const was = hashId(p);
      await x.tap();
      await p.waitForTimeout(400);
      if (await m.count()) return fail('касание «×» не закрыло меню');
      return hashId(p) === was ? pass(`«×» ${b.width.toFixed(0)} × ${b.height.toFixed(0)}`) : fail('касание «×» сменило выбор');
    },
  },
  {
    n: 374,
    title: 'MOB-74, 390 × 844: «Добавить в набор ▾» из листа на 55 % — выбор целиком над полосой времени и под шапкой листа',
    view: PHONE,
    run: async (p) => {
      await go(p, '#/david', 2600);
      const bar = p.locator('.folio .sheet-bar .bar-toggle');
      if (await bar.count()) {
        await bar.tap();
        await p.waitForTimeout(700);
      }
      await p.locator('.folio .workbtn > button').tap();
      await p.waitForTimeout(900);
      const pick = await p.locator('.folio div.workpick').boundingBox();
      const strip = (await p.locator('.app > .strip').boundingBox())!;
      const head = (await p.locator('.folio .sheet-bar').boundingBox())!;
      if (!pick) return fail('выбор не раскрылся');
      if (pick.y + pick.height > strip.y + 1) return fail(`низ выбора ${(pick.y + pick.height).toFixed(0)} под полосой времени (верх ${strip.y.toFixed(0)})`);
      if (pick.y < head.y + head.height - 1) return fail(`верх выбора ${pick.y.toFixed(0)} под шапкой листа`);
      const btn = (await p.locator('.folio .workbtn > button').boundingBox())!;
      return btn.y >= head.y + head.height - 1 ? pass(`выбор ${pick.y.toFixed(0)}–${(pick.y + pick.height).toFixed(0)}, полоса с ${strip.y.toFixed(0)}`) : fail('кнопка «Добавить в набор» ушла под шапку');
    },
  },
  {
    n: 375,
    title: 'VIS-82, 1440: «Добавить в набор ▾» — выбор целиком в видимой части карточки',
    run: async (p) => {
      await go(p, '#/moisey', 2600);
      const f = (await p.locator('.folio').boundingBox())!;
      await p.locator('.folio .workbtn > button').click();
      await p.waitForTimeout(700);
      const pick = await p.locator('.folio div.workpick').boundingBox();
      if (!pick) return fail('выбор не раскрылся');
      const bottom = Math.min(f.y + f.height, 900);
      return pick.y + pick.height <= bottom + 1 && pick.y >= f.y ? pass() : fail(`выбор ${pick.y.toFixed(0)}–${(pick.y + pick.height).toFixed(0)}, карточка до ${bottom.toFixed(0)}`);
    },
  },
  {
    n: 376,
    title: 'IX-58, MAP-51, MAP-53, UX-73: подсказка звезды — три строки без клавиш; рождение одной строкой с «(расч.)»; «//» и порядок перечисления объяснены',
    run: async (p) => {
      const cases: [string, string, RegExp[]][] = [
        ['#/iokhaveda', 'iokhaveda', [/^Иохаведа, мать Моисея$/, /^род\. между \d+ и \d+ гг\. до Р\. Х\. \(расч\.\)$/, /^родословие, вероятно, называет не все поколения \(выв\.\)$/]],
        // словарь дат (решение 96): рождение и смерть одной строкой, эра — один раз в конце
        ['#/david~y-1010~w60', 'amnon', [/^Амнон/, /^род\. ок\. \d+, ум\. между \d+ и \d+ гг\. до Р\. Х\.$/, /^год оценён по порядку перечисления \(1 Пар 3:1–\d+\), выв\.$/]],
        ['#/david~y-1050~w180~l0~s1', 'iessey', [/^Иессей/, /\(расч\.\)/, /./]],
      ];
      const out: string[] = [];
      for (const [hash, id, want] of cases) {
        await go(p, hash, 2600);
        const s = await star(p, id);
        if (!s) return fail(`нет звезды ${id}`);
        const t = await tipAt(p, s.x + 1, s.y + 1);
        const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length !== 3) return fail(`${id}: ${lines.length} строк: «${lines.join(' | ')}»`);
        const bad = lines.findIndex((l, i) => !want[i].test(l));
        if (bad >= 0) return fail(`${id}, строка ${bad + 1}: «${lines[bad]}»`);
        if (/\((D|C)\)|взять в работу|добавить в набор|потомков на небе/.test(t) || (await p.locator('.sky .tip kbd').count())) return fail(`${id}: клавиши в подсказке`);
        const b = (await p.locator('.sky .tip[data-shown]').boundingBox())!;
        // три строки: имя кеглем текста и две строки заметок — без переносов
        if (b.height > 96) return fail(`${id}: подсказка ${b.width.toFixed(0)} × ${b.height.toFixed(0)} — строки переносятся`);
        out.push(lines.slice(1).join('; '));
        await p.mouse.move(2, 2);
        await p.waitForTimeout(200);
      }
      return pass(out.join(' / '));
    },
  },
  {
    n: 377,
    // этап 11 (§ 8, решение 83): слова связи — «Овид — отец; Иессей — сын (Мф 1:5)» (src/ui/linkwords.ts), как у всех связей
    title: 'MAP-28, решение 54: наведение на ленту между Овидом и Иессеем — подсказка шага «Овид — отец; Иессей — сын (…)», а не звезды; без стрелки',
    run: async (p) => {
      await go(p, '#/iessey~y-1180~w260~l0~s1', 2600);
      const a = await star(p, 'ovid');
      const b = await star(p, 'iessey');
      if (!a || !b) return fail('нет звёзд Овида и Иессея');
      const c = await canvasBox(p);
      // точка на нити: середина поколения по времени, по высоте — поиск ленты у середины
      const mx = a.x + (b.x - a.x) * 0.45;
      const my = a.y + (b.y - a.y) * 0.45;
      for (let dy = -12; dy <= 12; dy += 2) {
        await p.mouse.move(c.x + mx, c.y + my + dy);
        await p.waitForTimeout(60);
        const kind = await p.evaluate(() => document.querySelector('.sky .tip')?.getAttribute('data-kind') ?? '');
        if (kind !== 'ribbon') continue;
        await p.waitForTimeout(300);
        const t = flat(await p.locator('.sky .tip[data-kind="ribbon"]').innerText()).trim();
        if (/[→←]/.test(t)) return fail(`стрелка в подсказке: «${t}»`);
        if (!/^Овид — отец; Иессей — сын \((Мф 1:5|Лк 3:32)\)$/.test(t)) return fail(`подсказка ленты: «${t}»`);
        // этап 11 (§ 8): шаг ленты — связь, он выбирается щелчком: указатель «рука» над лентой — её, а не звезды; подсказки
        // звезды нет
        const star = await p.locator('.sky .tip[data-kind="star"]').count();
        return star ? fail('над лентой — подсказка звезды') : pass(`${t}; ${dy} px от середины`);
      }
      return fail('у середины поколения лента не ловится: подсказка — звезды или её нет');
    },
  },
  {
    n: 378,
    title: 'UX-69, решение 39: «только линии» — номер у бусины отвечает на наведение: «Мф N» — N-й от Авраама, «Лк N» — N-й от Иосифа',
    run: async (p) => {
      await go(p, '#/~o1', 3000);
      const notes = (await p.locator('.sky > canvas').getAttribute('data-notes')) ?? '';
      // на обзоре коридора имён всем не хватает места: у части бусин — номера (MAP-59, решение 39)
      if (!/(^|\|)(Мф |Лк )?\d+(\||$)/.test(notes)) return fail(`на обзоре линий нет номеров у бусин — проверить нечего: «${notes.slice(0, 200)}»`);
      const ids = await p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[id^="sky-star-"]')].map((b) => ({ id: b.id.slice(9), x: Number(b.dataset.x), y: Number(b.dataset.y) })).filter((q) => q.x > 0));
      const c = await canvasBox(p);
      for (const q of ids) {
        for (const [dx, dy] of [[0, -12], [0, 14], [14, 0], [-14, 0], [0, -20], [0, 22], [20, 0], [-20, 0]]) {
          await p.mouse.move(c.x + q.x + dx, c.y + q.y + dy);
          await p.waitForTimeout(25);
          const ex = p.locator('.sky .tip[data-kind="star"] .ex');
          if (!(await ex.count())) continue;
          const t = flat(await ex.innerText()).trim();
          if (!/^«(Мф|Лк) \d+»/.test(t)) continue;
          const m = /^«(Мф|Лк) (\d+)» — (\d+)-й в родословии (Мф 1:2–16, считая от Авраама|Лк 3:23–38, считая от Иосифа)$/.exec(t);
          if (!m || m[2] !== m[3] || (m[1] === 'Мф') !== m[4].startsWith('Мф')) return fail(`подсказка номера: «${t}»`);
          return pass(`${q.id}: ${t}`);
        }
      }
      return fail('наведение на номер у бусины не дало подсказки счёта');
    },
  },
  {
    n: 379,
    title: 'UX-65: название эпохи в служебной строке — курсор-рука и подсказка «Эпоха «…»: годы; щёлкните…»; щелчок ведёт небо к эпохе, выбор остаётся',
    run: async (p) => {
      await go(p, '#/david', 2600);
      const c = await canvasBox(p);
      const service = (await p.locator('.sky > canvas').getAttribute('data-service')) ?? '';
      if (!service.includes('Единое царство')) return fail(`в служебной строке: «${service}»`);
      // название — слева направо по служебной строке (24–44 px)
      let found = -1;
      for (let x = 30; x < c.width - 40 && found < 0; x += 12) {
        await p.mouse.move(c.x + x, c.y + 34);
        await p.waitForTimeout(40);
        const cur = await p.locator('.sky > canvas').evaluate((el) => getComputedStyle(el).cursor);
        if (cur !== 'pointer') continue;
        const k = await p.evaluate(() => document.querySelector('.sky .tip')?.getAttribute('data-id') ?? '');
        if (k === 'epoch:kingdom' || k.startsWith('epoch:')) found = x;
      }
      if (found < 0) return fail('над названиями эпох курсор не «рука» или нет подсказки');
      await p.waitForTimeout(300);
      const t = flat(await p.locator('.sky .tip[data-shown]').innerText()).trim();
      // словарь дат (решение 96): концы разного вида — каждый со своей пометой, «ок. 1375 г. — 1050 г. до Р. Х.»
      if (!/^Эпоха «[^»]+»: ((ок\. )?\d+–\d+ гг\.|(ок\. )?\d+ г\. — (ок\. )?\d+ г\.) до Р\. Х\.; щёлкните — небо покажет эпоху$/.test(t)) return fail(`подсказка: «${t}»`);
      const v0 = await view(p);
      await p.mouse.click(c.x + found, c.y + 34);
      await p.waitForTimeout(900);
      const v1 = await view(p);
      if (Math.abs(v1[5] / v0[5] - 1) < 0.02 && Math.abs(v1[4] - v0[4]) < 1) return fail('щелчок по названию эпохи не сдвинул небо');
      return hashId(p) === 'david' ? pass(t) : fail(`щелчок по эпохе сменил выбор: «${hashId(p)}»`);
    },
  },
  {
    n: 380,
    title: 'IX-80, 1024 с карточкой: «Вид» у колонки — всплывающий лист без записи в истории; Escape и «×» закрывают, фокус — на «Вид»',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await go(p, '#/david', 2600);
      const url = p.url();
      const h0 = await p.evaluate(() => history.length);
      const btn = p.locator('.skyctl.column button', { hasText: 'Вид' });
      await btn.click();
      await p.waitForTimeout(400);
      const sheet = p.locator('.sky > .sheet', { has: p.locator('h2', { hasText: 'Вид' }) });
      if (!(await sheet.count())) return fail('лист «Вид» не открылся');
      if (p.url() !== url || (await p.evaluate(() => history.length)) !== h0) return fail(`адрес или история изменились: ${decodeURIComponent(p.url())}`);
      if ((await btn.getAttribute('aria-expanded')) !== 'true') return fail('«Вид» не говорит, что лист открыт');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      if (await sheet.count()) return fail('Escape не закрыл лист');
      if (hashId(p) !== 'david') return fail('Escape снял выбранное лицо вместе с листом');
      await btn.click();
      await p.waitForTimeout(300);
      await sheet.locator('.close').click();
      await p.waitForTimeout(300);
      if (await sheet.count()) return fail('«×» не закрыл лист');
      const back = await p.evaluate(() => (document.activeElement?.textContent ?? '').trim());
      if (back !== 'Вид') return fail(`фокус после «×»: «${back}»`);
      // нажатие мимо листа закрывает его, как у блока на широком небе
      await btn.click();
      await p.waitForTimeout(300);
      const c = await canvasBox(p);
      await p.mouse.click(c.x + 60, c.y + c.height - 80);
      await p.waitForTimeout(400);
      return (await sheet.count()) ? fail('нажатие мимо не закрыло лист') : pass();
    },
  },
  {
    n: 381,
    title: 'IX-81, 1024 с карточкой: строка выбора второго лица помещается целиком — не шире 560 px и не обрезана',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await go(p, '#/david', 2600);
      await p.locator('.folio .actions button', { hasText: 'Родство' }).first().click();
      await p.waitForTimeout(500);
      const bar = p.locator('.sky .pickbar-pick');
      if (!(await bar.count())) return fail('строки выбора нет');
      const b = (await bar.boundingBox())!;
      const clipped = await bar.locator('.txt').evaluate((t) => t.scrollWidth > t.clientWidth + 1);
      const text = flat(await bar.innerText()).replace(/\s+/g, ' ').trim();
      if (text !== 'Родство с Давидом: выберите второе лицо на небе или через поиск — отменить (Esc)') return fail(`строка: «${text}»`);
      return b.width <= 560 && !clipped ? pass(`${b.width.toFixed(0)} px`) : fail(`${b.width.toFixed(0)} px, обрезана: ${clipped}`);
    },
  },
  {
    n: 382,
    title: 'VIS-68, VIS-67: «?» — черта фокуса только под заголовком «Клавиши»; включённый флажок полным тоном и с галочкой',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await go(p, '#/', 2000);
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(900);
      const f = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement;
        const cs = getComputedStyle(a);
        const panel = a.closest('.sheet')!.getBoundingClientRect();
        return { id: a.id, outline: cs.outlineStyle, shadow: cs.boxShadow, w: a.getBoundingClientRect().width, pw: panel.width };
      });
      if (f.id !== 'legend-keys') return fail(`фокус на «${f.id}»`);
      if (f.outline !== 'none' || !/inset/.test(f.shadow)) return fail(`рамка фокуса: outline ${f.outline}, shadow ${f.shadow}`);
      if (f.w > f.pw * 0.6) return fail(`черта фокуса ${f.w.toFixed(0)} px при панели ${f.pw.toFixed(0)}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      await p.locator('.skyctl.column button', { hasText: 'Вид' }).click().catch(() => undefined);
      await p.waitForTimeout(300);
      const chk = p.locator('.sky .check', { hasText: 'ярусы эпох' }).first();
      await chk.click();
      await p.waitForTimeout(300);
      const s = await chk.evaluate((l) => {
        const i = l.querySelector('input')!;
        const off = l.parentElement!.querySelector('.check:has(input:not(:checked))') as HTMLElement | null;
        return { on: getComputedStyle(l).color, off: off ? getComputedStyle(off).color : '', tick: getComputedStyle(i, '::after').content, checked: i.checked };
      });
      if (!s.checked) return fail('флажок не включился');
      if (s.tick === 'none' || s.tick === 'normal') return fail('у включённого флажка нет галочки');
      return s.on !== s.off ? pass(`включённый ${s.on}, выключенный ${s.off}`) : fail(`включённый и выключенный одного тона: ${s.on}`);
    },
  },
  {
    n: 383,
    title: 'Решение 48: «Клавиши-буквы: выкл.» в таблице «Клавиши» — E, L, 0, D не действуют, «+», «/», стрелки работают; выбор помнится после перезагрузки',
    run: async (p) => {
      await go(p, '#/david', 2600);
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(800);
      const seg = p.locator('.letter-keys .seg');
      if (!(await seg.count())) return fail('в таблице «Клавиши» нет переключателя «Клавиши-буквы»');
      await seg.locator('button', { hasText: 'выкл.' }).click();
      await p.waitForTimeout(200);
      if ((await p.evaluate(() => localStorage.getItem('toledot:letterKeys'))) !== 'false') return fail('выбор не записан в память браузера');
      const off = await p.locator('table.keys tr.off').count();
      if (off < 8) return fail(`строк «выключено»: ${off}`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      await p.locator('.sky > canvas').focus();
      await p.keyboard.press('KeyE');
      await p.keyboard.press('KeyL');
      await p.waitForTimeout(400);
      if (await p.locator('.sky[data-tiers="on"]').count()) return fail('E включила ярусы при выключенных буквах');
      if (await p.locator('.app > .sheet').count()) return fail('L открыла «Условные знаки» при выключенных буквах');
      await p.keyboard.press('KeyD');
      await p.waitForTimeout(300);
      if ((await p.evaluate(() => localStorage.getItem('toledot:work') ?? '[]')) !== '[]') return fail('D взяла лицо в работу при выключенных буквах');
      const w0 = (await view(p))[5];
      await p.keyboard.press('Digit0');
      await p.waitForTimeout(700);
      if ((await view(p))[5] !== w0) return fail('0 сработала при выключенных буквах');
      await p.keyboard.press('Equal');
      await p.waitForTimeout(500);
      if (!((await view(p))[5] > w0 * 1.5)) return fail('«+» не приблизил');
      await p.keyboard.press('Slash');
      await p.waitForTimeout(200);
      const inFind = await p.evaluate(() => document.activeElement?.id === 'find');
      if (!inFind) return fail('«/» не перевёл фокус в поиск');
      await p.keyboard.press('Escape');
      // перезагрузка: выбор тот же
      await p.reload();
      await p.waitForTimeout(2600);
      await p.locator('.sky > canvas').focus();
      await p.keyboard.press('KeyE');
      await p.waitForTimeout(400);
      if (await p.locator('.sky[data-tiers="on"]').count()) return fail('после перезагрузки E снова работает');
      // включить обратно — E работает
      await p.keyboard.press('Shift+Slash');
      await p.waitForTimeout(800);
      await p.locator('.letter-keys .seg button', { hasText: 'вкл.' }).click();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      await p.locator('.sky > canvas').focus();
      await p.keyboard.press('KeyE');
      await p.waitForTimeout(400);
      return (await p.locator('.sky[data-tiers="on"]').count()) ? pass(`строк «выключено»: ${off}`) : fail('после «вкл.» E не включила ярусы');
    },
  },
  {
    n: 384,
    // этап 11 (решение 81): флажок «только линии Мессии» и переключатель «все лица | набор» стали показами — их выбирают
    // строка показа («изменить» — лист «Показ»); у органов неба остался флажок «ярусы эпох»
    title: 'UX-21: у флажка «ярусы эпох» и у «изменить» строки показа (линии Мессии, набор — показы) — пояснение при наведении и для диктора',
    run: async (p) => {
      await go(p, '#/', 2000);
      const items = await p.locator('.skyctl .check, .sky .showbar .sb-cmd[data-cmd="sheet"]').evaluateAll((els) =>
        els.map((e) => ({ t: (e.textContent ?? '').trim(), title: e.getAttribute('title') ?? '', desc: e.getAttribute('aria-description') ?? e.querySelector('input')?.getAttribute('aria-description') ?? '' })),
      );
      if (items.length !== 2) return fail(`органов: ${items.length}`);
      const bad = items.find((i) => i.title.length < 20 || i.desc !== i.title);
      if (bad) return fail(`«${bad.t}»: title «${bad.title}», для диктора «${bad.desc}»`);
      const sheet = items.find((i) => i.t === 'изменить');
      // этап 13 (решение 110): показ линий — «Родословие Иисуса Христа (Мф 1, Лк 3)»
      if (!sheet || !/родословие Иисуса Христа \(Мф 1, Лк 3\)/.test(sheet.title) || !/набор/.test(sheet.title)) return fail(`«изменить»: ${sheet?.title}`);
      return pass(items.map((i) => `${i.t}: ${i.title}`).join(' / '));
    },
  },
];
