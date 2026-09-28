/** Сценарии приёмки этапа 7, круг 3 (доработка по второй повторной экспертизе), группа cardtext3: номера 435–449, тексты разделов карточки. */
import type { Page } from 'playwright';
import { pass, fail, secText, type Scenario } from './kit.ts';

/** Открыть адрес и дождаться карточки. */
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

export const cardtext3: Scenario[] = [
  {
    n: 435,
    title: 'CARD-77: «Кратко» Вирсавии, Авигеи, Иродиады — без «Затем …» в начале, мужья по порядку текста (Урия, затем Давид; Навал, затем Давид; Филипп, затем Ирод)',
    run: async (p) => {
      const want: [string, RegExp][] = [
        ['virsaviya', /^Царица-мать, дочь Елиама; жена Урии, затем Давида; мать Соломона и Нафана\.$/],
        ['avigeya', /^Жена Навала, затем Давида[.;]/],
        ['irodiada', /^Жена Филиппа, затем Ирода[.;]/],
      ];
      const seen: string[] = [];
      for (const [id, re] of want) {
        await open(p, `#/${id}`);
        const t = flat((await p.locator('.folio .brief').first().innerText()).replace(/^Кратко:\s*/, ''));
        if (/^(Затем|Потом)(?![а-яё])/.test(t)) return fail(`${id}: «${t}»`);
        if (!re.test(t)) return fail(`${id}: «${t}»`);
        seen.push(t);
      }
      return pass(seen.join(' | '));
    },
  },
  {
    n: 436,
    title: 'CARD-80 (решение 62): § 14 Иисуса Христа — Пилат, Каиафа, Иуда Искариот во «Встречах» со словами события, а не в «Кто ещё жил в это время (расчёт)»',
    run: async (p) => {
      // тома лиц встреч подгружаются через секунду после открытия (LoadVolumes) — раздел перестраивается сам
      await open(p, '#/iisus', 4500);
      await unclamp(p, 14);
      const sec = p.locator('.folio #sec-14');
      const det = sec.locator('details.calc');
      const calc = (await det.count()) ? flat(await det.evaluate((d) => (d as HTMLElement).textContent ?? '')) : '';
      const all = flat(await sec.innerText());
      for (const name of ['Пилат', 'Каиафа', 'Искариот']) {
        if (!all.includes(name)) return fail(`нет «${name}» во «Встречах»: «${all.slice(0, 200)}»`);
        if (calc.includes(name)) return fail(`«${name}» — среди «по расчёту»`);
      }
      if (!/Иуда \(Искариот, предавший Иисуса\) — получил от Него кусок хлеба на вечере; предал Его поцелуем/.test(all)) return fail('у Иуды нет слов события');
      return pass(`«${all.slice(all.indexOf('Понтий'), all.indexOf('Понтий') + 60)}…»`);
    },
  },
  {
    n: 437,
    title: 'CARD-85 (решение 63): § 17 Иисуса Христа свёрнут и показывает оглавление периодов с числом событий; щелчок по «Страсти» раскрывает раздел и ведёт к периоду',
    run: async (p) => {
      await open(p, '#/iisus');
      const sec = p.locator('.folio #sec-17');
      const toc = flat(await sec.locator('p.periods').innerText());
      if (!/^По периодам: Рождество и детство \(6\); .*Страсти \(7\); Воскресение и вознесение \(7\)$/.test(toc)) return fail(`оглавление: «${toc}»`);
      if (!(await sec.locator('.clamp-more').count())) return fail('раздел не свёрнут');
      await sec.locator('p.periods button', { hasText: 'Страсти' }).click();
      await p.waitForTimeout(900);
      const head = p.locator('.folio #sec-17 li.sub', { hasText: /^Страсти$/ });
      if (!(await head.count())) return fail('нет подзаголовка «Страсти»');
      const focused = (await p.evaluate(`document.activeElement ? document.activeElement.textContent : ''`)) as string;
      if (flat(focused) !== 'Страсти') return fail(`фокус: «${focused}»`);
      const box = (await head.boundingBox())!;
      const folio = (await p.locator('.folio').boundingBox())!;
      if (box.y < folio.y || box.y > folio.y + folio.height - 40) return fail(`подзаголовок вне листа: ${Math.round(box.y)}`);
      if (/(^| )(Мф|Лк|Ин) \d+(–\d+)?; /.test(flat(await secText(p, 17)))) return fail('подзаголовок-ссылка');
      return pass(`«${toc}»; щелчок — к «Страсти», фокус на нём`);
    },
  },
  {
    n: 438,
    title: 'CARD-84, CARD-93, VIS-72, VIS-73: § 11 Давида — «Братья: …» со стихом; § 9 — «Жёны: …» первой строкой; § 10 — безымянный через «; ещё …»; § 18 — «Голиафу: «…»»',
    run: async (p) => {
      await open(p, '#/david');
      const s11 = flat(await secText(p, 11));
      if (!/Братья: Елиав, Аминадав, Самма, Нафанаил, Раддай, Оцем ?1 Пар 2:13–15/.test(s11)) return fail(`§ 11: «${s11.slice(0, 160)}»`);
      const s9 = flat(await secText(p, 9));
      if (!/^9 Супруги Жёны: Мелхола, Авигея, Ахиноама, Мааха, Аггифа, Авитала, Эгла, Вирсавия\./.test(s9)) return fail(`§ 9: «${s9.slice(0, 160)}»`);
      const s10 = flat(await secText(p, 10));
      if (!/Совав; ещё сын Давида и Вирсавии — умер младенцем на седьмой день/.test(s10)) return fail(`§ 10: «${s10.slice(0, 200)}»`);
      await unclamp(p, 18);
      const s18 = flat(await secText(p, 18));
      if (!/Голиафу: «ты идешь против меня/.test(s18)) return fail(`§ 18: «${s18.slice(0, 160)}»`);
      return pass('§ 9, 10, 11, 18 Давида');
    },
  },
  {
    n: 439,
    title: 'CARD-92: «Родство» Авигея (жена Давида) — Авигея (сестра Давида): «Кровного родства Писание не называет. Через брак: Авигея — жена Давида, брата Авигеи»; без «в данных атласа»',
    run: async (p) => {
      await open(p, '#/avigeya~pkinship~aavigeya~bavigeya-sestra-davida', 3000);
      const t = flat(await p.locator('.sheet').first().innerText());
      if (/в данных атласа/.test(t)) return fail('«в данных атласа»');
      if (!/Кровного родства Писание не называет\. Через брак:/.test(t)) return fail(`нет «Через брак»: «${t.slice(0, 300)}»`);
      if (!/Авигея — жена Давида, брата Авигеи \(1 Цар 25:39–42; 1 Пар 2:16\)/.test(t)) return fail(`фраза: «${t.slice(0, 300)}»`);
      return pass('Через брак: Авигея — жена Давида, брата Авигеи (1 Цар 25:39–42; 1 Пар 2:16)');
    },
  },
];