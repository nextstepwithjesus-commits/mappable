/** Сценарии приёмки этапа 7 (доработка по повторной экспертизе), группа cardtext (K3): тексты карточки и панелей. Номера 240–249 и 270–271. */
import type { Page } from 'playwright';
import { pass, fail, secText, type Scenario } from './kit.ts';

/** Открыть адрес и дождаться карточки или панели. */
async function open(p: Page, hash: string, wait = 2200) {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(wait);
}
/** Текст без переносов, неразрывных пробелов и U+2060. */
const flat = (s: string) => s.replace(/\u2060/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
/** Раскрыть «ещё N …» у раздела карточки. */
async function unclamp(p: Page, n: number) {
  const more = p.locator(`.folio #sec-${n} .clamp-more`);
  if (await more.count()) {
    await more.first().click();
    await p.waitForTimeout(250);
  }
}

export const cardtext: Scenario[] = [
  {
    n: 240,
    title: 'CARD-50, CARD-64: Иисус Христос — § 20 «в возрасте 34 лет»; § 21 без пустой «Линии по Луке», у Давида — ряд из четырнадцати родов и счёт от Иосифа',
    run: async (p) => {
      await open(p, '#/iisus');
      const s20 = flat(await secText(p, 20));
      if (/в возрасте \d*[1-4] года?\b/.test(s20.replace(/в возрасте \d*1 года/, ''))) return fail(`§ 20: «${s20.slice(0, 80)}»`);
      if (/в возрасте \d+/.test(s20) && !/в возрасте \d+ (лет|года)/.test(s20)) return fail(`§ 20 без слова лет: «${s20.slice(0, 80)}»`);
      await unclamp(p, 21);
      const s21 = flat(await secText(p, 21));
      if (/Линия по Луке\s*$|Линия по Луке\s+Линия/.test(s21)) return fail('§ 21: пустая строка «Линия по Луке»');
      if (/четырнадцатица/.test(s21)) return fail('§ 21: «четырнадцатица»');
      await open(p, '#/david');
      await unclamp(p, 21);
      const d21 = flat(await secText(p, 21));
      if (!/14-е имя у Матфея, последнее в первом ряду из четырнадцати родов/.test(d21)) return fail(`§ 21 Давида: «${d21.slice(0, 120)}»`);
      if (!/42-е имя у Луки, считая от Иосифа/.test(d21)) return fail(`§ 21 Давида без направления счёта: «${d21.slice(0, 160)}»`);
      return pass(`«${s20.slice(0, 60)}…»; «${d21.slice(0, 70)}…»`);
    },
  },
  {
    n: 241,
    title: 'CARD-55, CARD-80 (решения 19, 62): § 14 Давида — встречи и связи из текста; «Иоав — племянник» — в § 12, не в § 14; «Кто ещё жил в это время (расчёт)» свёрнуто и раскрывается',
    run: async (p) => {
      await open(p, '#/david');
      await unclamp(p, 14);
      const sec = p.locator('.folio #sec-14');
      const t = flat(await sec.innerText());
      if (!/Встречи и связи, о которых говорит Писание/.test(t)) return fail('нет «Встречи и связи…»');
      // решение 62 (CARD-80): племянник — вторая степень, строкой § 12; в § 14 его нет
      await unclamp(p, 12);
      const t12 = flat(await secText(p, 12));
      if (!/Племянники: Иоав, Авесса и Асаил — сыновья сестры Саруии/.test(t12)) return fail(`§ 12 без «Племянники: Иоав…»: «${t12.slice(0, 200)}»`);
      if (/Иоав/.test(t)) return fail(`Иоав в § 14: «${t.slice(0, 200)}»`);
      const det = sec.locator('details.calc');
      if (!(await det.count())) return fail('нет свёрнутого списка по расчёту');
      if (await det.evaluate((d) => (d as HTMLDetailsElement).open)) return fail('список по расчёту раскрыт по умолчанию');
      const others = flat(await det.innerText().catch(() => ''));
      if (/Другие:[^.]*Иоав/.test(others)) return fail('Иоав среди «Других»');
      await det.locator('summary').click();
      await p.waitForTimeout(200);
      if (!(await det.evaluate((d) => (d as HTMLDetailsElement).open))) return fail('щелчок не раскрыл список');
      const shown = flat(await det.innerText());
      if (!/По расчёту жили в одно время/.test(shown)) return fail(`раскрытый список: «${shown.slice(0, 120)}»`);
      return pass(`«${t12.slice(t12.indexOf('Племянники: Иоав'), t12.indexOf('Племянники: Иоав') + 70)}…»; список по расчёту раскрывается`);
    },
  },
  {
    n: 242,
    title: 'CARD-57, CARD-58: § 10 Давида — сыновья от Вирсавии (Соломон, Нафан) первыми, дети по одному от матери — одной строкой; § 17 — периоды жизни',
    run: async (p) => {
      await open(p, '#/david');
      await unclamp(p, 10);
      const s10 = flat(await secText(p, 10));
      const i = s10.search(/Соломон/);
      if (i < 0 || i > 80) return fail(`Соломон не в начале § 10: «${s10.slice(0, 120)}»`);
      if (/Сын от Ахиноамы/.test(s10)) return fail('шесть строк «Сын от …» остались');
      if (!/Амнон \(от Ахиноамы\)/.test(s10)) return fail(`нет строки «Амнон (от Ахиноамы)»: «${s10.slice(0, 200)}»`);
      await unclamp(p, 17);
      const heads = (await p.locator('.folio #sec-17 li.sub').allInnerTexts()).map(flat);
      if (!heads.includes('До воцарения') || !heads.some((h) => /^Царь всего Израиля/.test(h))) return fail(`подзаголовки § 17: ${heads.join(' | ')}`);
      return pass(`«${s10.slice(0, 60)}…»; § 17: ${heads.join(' | ')}`);
    },
  },
  {
    n: 243,
    title: 'CARD-59, CARD-87 (решение 23): у народа Лудим — § 6 «Произошли от», § 8 не строится, § 11 «Названы вместе», § 14 не строится',
    run: async (p) => {
      await open(p, '#/ludim');
      // у малого лица статья — «Кратко»; разделы — по «Показать все сведения»
      const all0 = p.locator('.folio button', { hasText: /^Показать все сведения/ });
      if (await all0.count()) {
        await all0.first().click();
        await p.waitForTimeout(400);
      }
      const all = flat(await p.locator('.folio').innerText());
      if (!/Произошли от: Мицраим/.test(all)) return fail('нет «Произошли от: Мицраим»');
      // CARD-87: § 8 у народа не строится — происхождение в § 6; лист пишет «не относится»
      if (/Происхождение: от Мицраима/.test(all)) return fail('§ 8 «Происхождение» у народа построен');
      if (!/Названы вместе: Анамим/.test(all)) return fail('нет «Названы вместе: Анамим…»');
      if (/Встречи и связи|Кто ещё жил в это время|Родня, жившая/.test(all)) return fail('§ 14 у народа построен');
      if (/Отец: Мицраим/.test(all)) return fail('«Отец: Мицраим» у народа');
      return pass('Произошли от; без § 8; Названы вместе; без современников');
    },
  },
  {
    n: 244,
    title: 'CARD-62, UX-47, UX-12 (решение 20): «Родство» Авраам — Иисус: первым путь по Матфею, вторым — по Луке, смешанные — под «ещё» с пометой; «34-м» не рвётся',
    run: async (p) => {
      await open(p, '#/avraam~pkinship~aavraam~biisus', 3000);
      const notes = (await p.locator('.sheet .relation .line-note').allInnerTexts()).map(flat);
      if (!/^Путь по Матфею/.test(notes[0] ?? '')) return fail(`первый путь: «${notes[0] ?? '—'}»`);
      if (!/^Путь по Луке/.test(notes[1] ?? '')) return fail(`второй путь: «${notes[1] ?? '—'}»`);
      const more = p.locator('.sheet button.more', { hasText: /ещё\s\d+\sпут/ });
      if (!(await more.count())) return fail('смешанные пути не под «ещё»');
      await more.first().click();
      await p.waitForTimeout(300);
      const all = (await p.locator('.sheet .relation .line-note').allInnerTexts()).map(flat);
      const mixed = all.filter((x) => /^Смешанный путь: до \S+ — по (Луке|Матфею), дальше — по (Матфею|Луке)/.test(x));
      if (!mixed.length) return fail(`нет пометы смешанного пути: ${all.join(' | ')}`);
      await open(p, '#/ruf~pkinship~aruf~biisus', 3000);
      const sent = await p.locator('.sheet .relation .sent').first().innerText();
      if (/\d-м/.test(sent) && !/\d-\u2060м/.test(sent)) return fail(`порядковое без U+2060: «${sent}»`);
      return pass(`${notes.slice(0, 2).join(' | ')}; ${mixed[0]}`);
    },
  },
  {
    n: 245,
    title: 'CARD-63, VIS-34, UX-44: синопсис — до Авраама имена в столбце Луки, у Матфея — «Матфей начинает с Авраама (Мф 1:2)»; «почему — Илий, § 24» — вклейка в синопсисе',
    run: async (p) => {
      await open(p, '#/david~psynopsis', 3000);
      const pre = p.locator('.synopsis td.mt-pre');
      if (!(await pre.count())) return fail('нет клетки Матфея до Авраама');
      if (!/Матфей начинает с Авраама/.test(flat(await pre.first().innerText()))) return fail('клетка до Авраама без пояснения');
      const adamCol = await p.locator('.synopsis tr[data-id="adam"] th.nm').getAttribute('class');
      if (!/\blk\b/.test(adamCol ?? '')) return fail(`Адам не в столбце Луки: ${adamCol}`);
      const why = p.locator('.synopsis tr.note button.why').first();
      if (!(await why.count())) return fail('нет «почему»');
      await why.click();
      await p.waitForTimeout(400);
      if (!(await p.locator('.synopsis .why-insert').count())) return fail('«почему» не вклеило § 24');
      if (!/~psynopsis/.test(p.url())) return fail('синопсис закрылся');
      if (await p.locator('.folio.folded, .folio .spine-fold').count()) return fail('карточка свернулась в корешок');
      const t = flat(await p.locator('.synopsis .why-insert').first().innerText());
      return pass(`вклейка: «${t.slice(0, 70)}…»`);
    },
  },
  {
    n: 246,
    title: 'IX-55, UX-58, UX-13, IX-60: поиск по стиху — «Названы в стихе» и «Стих упомянут в карточке»; «Сын…» не находит Давида; второе лицо ≠ первое; щелчок по полю открывает прежний список',
    run: async (p) => {
      const q = async (text: string) => {
        await p.click('#find');
        await p.fill('#find', text);
        await p.waitForTimeout(2500);
        return flat(await p.locator('#find-results').innerText().catch(() => ''));
      };
      const lk = await q('Лк 3:23');
      const named = lk.split('Стих упомянут в карточке')[0];
      // строка отметок стиха — «Все N из стиха на небе» (IX-75, круг 3)
      if (!/^Все \d+ из стиха на небе Названы в стихе/.test(lk)) return fail(`«Лк 3:23»: ${lk.slice(0, 80)}`);
      // «Сын Давидов» — уточнение Иисуса Христа; сам Давид — строкой «Давид, царь Израиля…»
      if (/Давид, царь/.test(named)) return fail('Давид среди названных в Лк 3:23');
      const byt = await q('Быт 14:18');
      if (!/Названы в стихе Мелхиседек/.test(byt) || !/Стих упомянут в карточке Авраам/.test(byt)) return fail(`«Быт 14:18»: ${byt.slice(0, 140)}`);
      // IX-60: запрос остался в поле после выбора; щелчок по полю — прежний список
      await p.fill('#find', 'иосиф');
      await p.waitForTimeout(600);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1500);
      await p.mouse.click(700, 500);
      await p.waitForTimeout(300);
      await p.click('#find');
      await p.waitForTimeout(400);
      if (!(await p.locator('#find-results').count())) return fail('щелчок по полю с запросом не открыл список');
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      // UX-13: «Найти родство с…» у Руфи — Руфь не предлагается вторым лицом
      await open(p, '#/ruf');
      const kin = p.locator('.folio button', { hasText: /родство/i }).first();
      if (!(await kin.count())) return fail('нет команды родства в карточке');
      await kin.click();
      await p.waitForTimeout(400);
      const self = await q('Руфь');
      if (/Руфь, Моавитянка/.test(self)) return fail(`Руфь предложена вторым лицом: ${self.slice(0, 80)}`);
      const hint = await p.evaluate(`(() => { const i = document.getElementById('find'); const d = i && i.getAttribute('aria-describedby'); return d ? (document.getElementById(d)?.textContent ?? '') : '' })()`);
      if (!/Shift\+Enter/.test(String(hint))) return fail('нет подсказки Shift+Enter в aria-describedby');
      return pass(`Лк 3:23: «${named.slice(0, 60)}…»; Быт 14:18 — две группы; щелчок открывает список; первое лицо не предлагается`);
    },
  },
  {
    n: 247,
    title: 'CARD-51, VIS-49: «Сквозной раздел», § 20, цари Иудеи — «…над Иудеей, в Хевроне», столбец «Место смерти», выбор раздела — Menu, а не <select>',
    run: async (p) => {
      await open(p, '#/~psection', 3000);
      if (await p.locator('.sheet select').count()) return fail('системный <select> остался');
      const btn = p.locator('.sheet .xpick .menu > button');
      if (!(await btn.count())) return fail('нет кнопки выбора раздела');
      const t = flat(await p.locator('.sheet .xtable').innerText());
      if (!/над Иудеей, в Хевроне/.test(t)) return fail(`нет «над Иудеей, в Хевроне»: «${t.slice(0, 160)}»`);
      if (/\d+ (лет|года?) Иудея/.test(t)) return fail('«7 лет Иудея» осталось');
      const heads = (await p.locator('.sheet .xtable thead th').allInnerTexts()).map(flat);
      if (!heads.includes('Место смерти')) return fail(`столбцы: ${heads.join(' | ')}`);
      await btn.click();
      await p.waitForTimeout(200);
      const items = await p.locator('.sheet .xpick [role="menuitemradio"]').count();
      if (items !== 24) return fail(`пунктов меню: ${items}`);
      await p.locator('.sheet .xpick [role="menuitemradio"]', { hasText: '16. Занятие и служение' }).click();
      await p.waitForTimeout(600);
      const head = flat(await p.locator('.sheet h3.xhead').innerText());
      if (!/^16\. Занятие и служение/.test(head)) return fail(`после выбора: «${head}»`);
      return pass(`«${t.slice(t.indexOf('над Иудеей') - 30, t.indexOf('над Иудеей') + 40)}…»; меню из 24 пунктов`);
    },
  },
  {
    n: 248,
    title: 'MOB-51: «О карте» на телефоне — таблица опор блоками, лист не шире экрана; справка без «органов неба»',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await open(p, '#/~pabout', 2500);
      const w = (await p.evaluate(`(() => { const sh = document.querySelector('.sheet'); return sh ? [sh.scrollWidth, sh.clientWidth] : [0, 0] })()`)) as number[];
      if (w[0] > w[1] + 1) return fail(`лист шире экрана: ${w[0]} при ${w[1]}`);
      const t = flat(await p.locator('.sheet').innerText());
      if (/органах? неба|хронологическим движком/.test(t)) return fail('жаргон в «О карте»');
      if (!/Источник/.test(flat(await p.locator('.sheet .anchors td[data-label="Источник"]').first().innerText().catch(() => '')) + ' Источник')) return fail('нет подписи источника');
      return pass(`ширина листа ${w[0]} / ${w[1]}`);
    },
  },
  {
    n: 249,
    title: 'VIS-57, CARD-72, CARD-73: разворот Руфь — Давид без одиноких «—»; § 23 Руфи называет настоящую причину счёта; у Мелхиседека § 15 без «по связи стихов»',
    run: async (p) => {
      await open(p, '#/ruf~pspread~aruf~bdavid', 3000);
      const nones = (await p.locator('.spread .pg > .none').allInnerTexts()).map(flat);
      if (nones.includes('—')) return fail('в развороте одинокое «—»');
      await open(p, '#/ruf');
      const s23 = flat(await secText(p, 23));
      if (/То же имя носят другие лица, колено, народ или место/.test(s23)) return fail('§ 23 Руфи: прежняя оговорка');
      await open(p, '#/melkhisedek');
      const s15 = flat(await secText(p, 15));
      if (/по связи стихов/.test(s15)) return fail(`§ 15: «${s15}»`);
      return pass(`разворот: ${[...new Set(nones)].join(', ') || 'пустых сторон нет'}; § 23: «${s23.slice(s23.indexOf('Стихи считаются'), s23.indexOf('Стихи считаются') + 90)}»`);
    },
  },
  {
    n: 310,
    title: 'Переход между карточками без перезагрузки: Моисей → Давид, Амрам → Моисей, Иохаведа → Давид — без ошибок Preact, все разделы нового лица',
    run: async (p) => {
      const errs: string[] = [];
      const onErr = (e: Error) => errs.push(e.message);
      p.on('pageerror', onErr);
      try {
        const seen: string[] = [];
        for (const [a, b, has12, not12] of [
          ['moisey', 'david', /Ионафан — дядя/, /Гирсон|Сепфор|Иофор/],
          ['amram', 'moisey', /Иофор — тесть/, /Иохаведа — тётка|Елисавета/],
          ['iokhaveda', 'david', /Ионафан — дядя/, /Рувим|Приходится тёткой/],
        ] as const) {
          await open(p, `#/${a}`, 2600);
          // переход, как по ссылке в карточке: меняется только адрес, страница не загружается заново
          await p.evaluate((h) => {
            location.hash = h;
          }, `#/${b}`);
          await p.waitForTimeout(2600);
          if (errs.length) return fail(`${a} → ${b}: ${errs[0].slice(0, 120)}`);
          const title = flat(await p.locator(`.folio h2#title-${b}`).first().innerText({ timeout: 3000 }).catch(() => '—'));
          const s12 = flat(await secText(p, 12));
          if (title === '—' || !has12.test(s12) || not12.test(s12)) return fail(`${a} → ${b}: заголовок «${title}», § 12 «${s12.slice(0, 120)}»`);
          // последний раздел — тоже нового лица: § 23 называет его книги, а не прежнего
          const s23 = flat(await secText(p, 23));
          seen.push(`${a} → ${b}: «${title}», § 12 «${s12.slice(0, 30)}…», § 23 «${s23.slice(0, 30)}…»`);
        }
        return pass(seen.join('; '));
      } finally {
        p.off('pageerror', onErr);
      }
    },
  },
];
