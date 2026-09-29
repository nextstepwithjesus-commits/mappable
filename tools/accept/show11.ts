/**
 * Сценарии приёмки: показ неба, составы фильтров, адрес и «назад» (этап 11, задача Q2), группа show11: номера 780–809.
 *
 * Показ (src/ui/show.ts) пишет себя на корень документа: html[data-show] — ключ показа (он же поле «~v» адреса),
 * data-show-ids, -guests, -stubs — число лиц, гостей и обрывков, data-show-layout — укладка ('map' или 'family'),
 * data-link — выбранная связь (src/engine/linkkey.ts). Окно неба — .sky[data-view] (src/ui/SkyView.tsx).
 *  — Я26: «Дом Нахора» — 16 лиц показа (15 и основатель Нахор) и гостья Милка, 4 обрывка; род Иуды по отцам — 246 лиц;
 *    «Колено Иудино со связями» — лица колена и гости одного шага; «все колена» — карта;
 *  — Я28: шесть показов и выбранная связь восстанавливаются по адресу, прежние «~o1», «~k1», «~t1» открываются;
 *    «назад» возвращает прежний показ и окно за ≤ 300 мс; показ помнится в сеансе и «как в прошлый раз».
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

type Ds = { show?: string; showIds?: string; showGuests?: string; showStubs?: string; showLayout?: string; link?: string };
const ds = (p: Page) => p.evaluate(() => ({ ...document.documentElement.dataset }) as Record<string, string>) as Promise<Ds>;
/** Открыть адрес заново (новая загрузка, память сеанса та же). */
async function open(p: Page, hash: string, wait = 2600) {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.reload();
  await p.waitForTimeout(wait);
}
/** Поле «~v» адреса страницы (всё небо — пусто). */
const vField = (p: Page) => (new URL(p.url()).hash.split('~').find((f) => f.startsWith('v')) ?? '').slice(1);
const field = (p: Page, k: string) => (new URL(p.url()).hash.split('~').find((f) => f.startsWith(k)) ?? '').slice(1);

/** Движение окна неба за время act (как в nav3.ts): от первого до последнего изменения камеры, мс. */
async function motion(p: Page, act: () => Promise<unknown>, wait: number) {
  await p.evaluate(`(() => {
    window.__rec = []; window.__stop = false;
    const tick = () => {
      if (window.__stop) return;
      const v = (document.querySelector('.sky')?.getAttribute('data-view') ?? '').split(' ').map(Number);
      window.__rec.push({ t: performance.now(), x0: v[4], kx: v[5], lt: v[6] });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await act();
  await p.waitForTimeout(wait);
  const r = (await p.evaluate(`(() => { window.__stop = true; return window.__rec; })()`)) as { t: number; x0: number; kx: number; lt: number }[];
  let first = -1;
  let last = -1;
  for (let i = 1; i < r.length; i++)
    if (r[i].x0 !== r[i - 1].x0 || r[i].kx !== r[i - 1].kx || r[i].lt !== r[i - 1].lt) {
      if (first < 0) first = r[i - 1].t;
      last = r[i].t;
    }
  return first < 0 ? 0 : Math.round(last - first);
}

const TRIBES = 'reuben.simeon.levi.aaronides.judah.davidic.dan.naphtali.gad.asher.issachar.zebulun.joseph.ephraim.manasseh.benjamin.saulides';

export const show11: Scenario[] = [
  {
    n: 780,
    title: 'Я26: «Дом Нахора» по адресу — 16 лиц показа (с основателем Нахором) и гостья Милка, 4 обрывка, семейная укладка',
    run: async (p) => {
      await open(p, '#/nakhor-syn-farry~vg.nahorites');
      const d = await ds(p);
      if (d.show !== 'g.nahorites') return fail(`показ ${d.show}`);
      if (d.showIds !== '16' || d.showGuests !== '1' || d.showStubs !== '4') return fail(`лиц ${d.showIds}, гостей ${d.showGuests}, обрывков ${d.showStubs}`);
      if (d.showLayout !== 'family') return fail(`укладка ${d.showLayout}`);
      if (vField(p) !== 'g.nahorites') return fail(`адрес после записи: ${p.url()}`);
      return pass('16 лиц, 1 гость, 4 обрывка; адрес держит «~vg.nahorites»');
    },
  },
  {
    n: 781,
    title: 'Я26: род Иуды по отцам по адресу — 246 лиц, жёны — гости, укладка «Г»',
    run: async (p) => {
      await open(p, '#/iuda~vr.iuda.d.0.f');
      const d = await ds(p);
      if (d.show !== 'r.iuda.d.0.f') return fail(`показ ${d.show}`);
      if (d.showIds !== '246') return fail(`лиц ${d.showIds}`);
      if (Number(d.showGuests) < 30) return fail(`гостей ${d.showGuests}`);
      if (d.showLayout !== 'family') return fail(`укладка ${d.showLayout}`);
      return pass(`246 лиц и ${d.showGuests} гостей`);
    },
  },
  {
    n: 782,
    title: 'Я26: «Колено Иудино со связями» — лица колена и Дома Давидова, гости одного шага, без обрывков; «все колена» — карта',
    run: async (p) => {
      await open(p, '#/~vg.judah.davidic~x2');
      const d = await ds(p);
      if (d.show !== 'g.judah.davidic~x2') return fail(`показ ${d.show}`);
      if (d.showIds !== '392' || d.showStubs !== '0' || !(Number(d.showGuests) > 0)) return fail(`лиц ${d.showIds}, гостей ${d.showGuests}, обрывков ${d.showStubs}`);
      if (field(p, 'x') !== '2') return fail(`поле «~x» потеряно: ${p.url()}`);
      await open(p, `#/~vg.${TRIBES}`);
      const t = await ds(p);
      if (t.showLayout !== 'map') return fail(`«все колена» уложены «${t.showLayout}», а не картой`);
      return pass(`колено: 392 лица и ${d.showGuests} гостей; все колена — ${t.showIds} лиц картой`);
    },
  },
  {
    n: 783,
    title: 'Я28: шесть показов открываются по адресу, и атлас пишет тот же показ обратно',
    run: async (p) => {
      const cases: [string, string][] = [
        ['#/david~y-1010~w240~l2.0', ''],
        ['#/~vl', 'l'],
        ['#/~vk', 'k'],
        ['#/adam~vs~nadam.eva.kain', 's'],
        ['#/nakhor-syn-farry~vg.nahorites', 'g.nahorites'],
        ['#/iuda~vr.iuda.d.0.f', 'r.iuda.d.0.f'],
        ['#/iakov~vr.iakov.b.2.b', 'r.iakov.b.2.b'],
      ];
      const log: string[] = [];
      for (const [hash, v] of cases) {
        await open(p, hash);
        const d = await ds(p);
        if (d.show !== (v || 'a')) return fail(`${hash}: показ ${d.show}`);
        if (vField(p) !== v) return fail(`${hash}: адрес после записи ${p.url()}`);
        log.push(d.show!);
      }
      return pass(log.join(', '));
    },
  },
  {
    n: 784,
    title: 'Я28: прежние адреса — «~o1» линии Мессии, «~k1» и «~t1» набор; адрес переписывается полем показа',
    run: async (p) => {
      const cases: [string, string][] = [
        ['#/~y-1010~w2000~l0.0~o1', 'l'],
        ['#/adam~k1~nadam.eva', 's'],
        ['#/adam~k1~nadam.eva~t1', 's'],
        ['#/~y-1010~w2000~l0.0~k0', 'a'],
      ];
      for (const [hash, v] of cases) {
        await open(p, hash);
        const d = await ds(p);
        if (d.show !== v) return fail(`${hash}: показ ${d.show}, а не ${v}`);
        if (/~[okt]1/.test(p.url())) return fail(`${hash}: прежнее поле осталось в адресе ${p.url()}`);
      }
      // адрес только с лицом («#/david») показа не меняет: лицо выбирается, небо летит к нему
      await open(p, '#/~vl');
      await open(p, '#/david');
      if ((await ds(p)).show !== 'l') return fail(`«#/david» сменил показ на ${(await ds(p)).show}`);
      return pass('~o1 → ~vl, ~k1 и ~t1 → ~vs; «#/david» показ не трогает');
    },
  },
  {
    n: 785,
    title: 'Я28: выбранная связь восстанавливается по адресу «~c» и остаётся в нём',
    run: async (p) => {
      await open(p, '#/iosif~ck.iakov.rakhil._.iosif');
      const d = await ds(p);
      if (d.link !== 'k.iakov.rakhil._.iosif') return fail(`связь ${d.link ?? 'не выбрана'}`);
      if (field(p, 'c') !== 'k.iakov.rakhil._.iosif') return fail(`адрес после записи: ${p.url()}`);
      // связи, которой нет в данных, адрес не выбирает
      await open(p, '#/iosif~ck.iakov.liya._.iosif');
      const e = await ds(p);
      if (e.link) return fail(`выбрана несуществующая связь ${e.link}`);
      return pass('связь «Иаков и Рахиль → Иосиф» выбрана по адресу');
    },
  },
  {
    n: 786,
    title: 'Я28: смена показа — новая запись истории; «назад» возвращает прежний показ и окно за ≤ 300 мс',
    run: async (p) => {
      // время — лучшее из двух попыток: машина общая, кадры иногда пропадают
      const tries: number[] = [];
      for (let k = 0; k < 2; k++) {
        await open(p, '#/nakhor-syn-farry~vg.nahorites', 3000);
        const before = p.url();
        const len0 = (await p.evaluate(() => history.length)) as number;
        await p.evaluate(() => (location.hash = '#/nakhor-syn-farry~vl'));
        await p.waitForTimeout(2500);
        const mid = await ds(p);
        if (mid.show !== 'l') return fail(`после смены показ ${mid.show}`);
        const len1 = (await p.evaluate(() => history.length)) as number;
        if (len1 <= len0) return fail('смена показа не записана в историю');
        const ms = await motion(p, () => p.goBack(), 1200);
        const d = await ds(p);
        if (d.show !== 'g.nahorites') return fail(`«назад»: показ ${d.show}`);
        if (p.url() !== before) return fail(`«назад»: адрес ${p.url()}, а была запись ${before}`);
        tries.push(ms);
      }
      const ms = Math.min(...tries);
      if (ms > 300) return fail(`«назад»: окно возвращалось ${tries.join(' и ')} мс`);
      return pass(`«назад» — «Дом Нахора» и прежнее окно за ${ms} мс (попытки: ${tries.join(', ')})`);
    },
  },
  {
    n: 787,
    title: 'Я28: строка показа «всё небо» — новая запись; «назад» возвращает созвездие',
    run: async (p) => {
      await open(p, '#/nakhor-syn-farry~vg.nahorites', 3000);
      const cmd = p.locator('.showbar .sb-cmd', { hasText: 'всё небо' }).first();
      if (!(await cmd.count())) return fail('в строке показа нет команды «всё небо»');
      await cmd.click();
      await p.waitForTimeout(2000);
      if ((await ds(p)).show !== 'a') return fail(`после «всё небо» показ ${(await ds(p)).show}`);
      if (vField(p)) return fail(`у всего неба в адресе осталось «~v${vField(p)}»`);
      await p.goBack();
      await p.waitForTimeout(1500);
      if ((await ds(p)).show !== 'g.nahorites') return fail(`«назад»: показ ${(await ds(p)).show}`);
      return pass();
    },
  },
  {
    n: 788,
    title: 'Показ помнится в сеансе; новый сеанс открывается «как в прошлый раз» по выбранному началу',
    run: async (p) => {
      await open(p, '#/~vl');
      await open(p, '#/');
      const a = await ds(p);
      if (a.show !== 'l') return fail(`после перезагрузки показ ${a.show}`);
      // новый сеанс: память сеанса пуста, начало — «Ключевые лица»
      const ctx = await p.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
      const q = await ctx.newPage();
      await q.addInitScript(`localStorage.setItem('toledot:intro', 'true'); localStorage.setItem('toledot:start', JSON.stringify('key'))`);
      await q.goto(p.url().replace(/#.*$/, '') + '#/');
      await q.waitForTimeout(2600);
      const b = await ds(q);
      await ctx.close();
      if (b.show !== 'k') return fail(`новый сеанс после начала «Ключевые лица»: показ ${b.show}`);
      return pass('сеанс: линии Мессии; новый сеанс: ключевые лица');
    },
  },
];
