/**
 * Сценарии приёмки этапа 16, исполнитель L «Свет» (docs/ui-review/STAGE16.md, решения 182–184; приёмка О2–О4),
 * группа light16: номера 1240–1259.
 *  — 1240 слой света (решение 182): отдельный холст под основным (основной прозрачен в пустом месте неба), сборка
 *    на покое ≤ 40 мс (О2; canvas[data-light] — длительность последней сборки), при сдвиге — перенос без сборки;
 *  — 1241 цвет «без перескока» (решение 183): ветви Иакова — оттенки колен матерей (сыны Лии, Рахили, Валлы, Зелфы),
 *    у Давида — цвета ветвей решения 69 (canvas[data-branches]);
 *  — 1242 названия созвездий на обзоре (решение 184): у крупных — подзаголовок из данных «родоначальник …; N лиц»;
 *  — 1243 «Условные знаки»: строки света (туманность, устье, пыль, огонёк, четыре колена), знак врезки семьи и шестое
 *    начало «Рассказ: от Адама до Иисуса Христа»;
 *  — 1244 имена у устья (решение 184, К4′): каждое имя в canvas[data-mouths] — у своего следа за концом перехода;
 *  — 1245 «окна» при протяжке (жалоба владельца 3 октября): наведение на звёзды, протяжка, колесо и выбор не оставляют
 *    на холсте неба ни save() без restore() (canvas[data-save-leak]), ни прозрачного пикселя — прежде подсветка пути
 *    происхождения у наведённой звезды оставляла отсечение по подписям пути, и места подписей застывали прошлым кадром;
 *  — 1246 подсветка рода «как лампочка» (просьба владельца 3 октября; canvas[data-lineage]): у Иакова черты брака и шины
 *    всех четырёх союзов — цветом своей ветви (матери), путь к родителям горит; у Вениамина (один союз, ветви по сыновьям)
 *    горят черта, шина и стволы к сыновьям и путь к Иакову и Рахили.
 */
import type { Page } from 'playwright';
import { fail, pass, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 3000) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};

export const light16: Scenario[] = [
  {
    n: 1240,
    // этап 17, решение 191 (docs/ui-review/STAGE17.md): слой света выключен по просьбе владельца («свечения вносят
    // путаницу»); прежде здесь проверялись время сборки слоя (≤ 40 мс) и перенос без сборки при сдвиге
    title: 'Решение 182, О2, этап 17 — решение 191: отдельного слоя документа под небом нет, холст неба непрозрачен; слой света не собирается ни на покое, ни при сдвиге',
    run: async (p) => {
      await go(p, '#/~y-1900~w4600~l0~s1');
      const layers = (await p.evaluate(`document.querySelectorAll('.sky .sky-light').length`)) as number;
      if (layers) return fail(`отдельный слой света в документе: ${layers}`);
      const alpha0 = (await p.evaluate(`(() => { const c = document.querySelector('.sky > canvas'); const k = c.width / c.getBoundingClientRect().width; return c.getContext('2d').getImageData(Math.round(c.clientWidth * 0.06 * k), Math.round(c.clientHeight * 0.9 * k), 1, 1).data[3]; })()`)) as number;
      if (alpha0 < 255) return fail(`холст неба прозрачен в пустом месте (альфа ${alpha0})`);
      const box = (await p.locator('.sky > canvas').boundingBox())!;
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.wheel(0, -240);
      await p.waitForTimeout(1300);
      await p.mouse.down();
      await p.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 10, { steps: 6 });
      await p.mouse.up();
      await p.waitForTimeout(900);
      const probe = (await p.locator('.sky > canvas').getAttribute('data-light')) ?? '';
      if (probe) return fail(`слой света собран: «${probe}»`);
      return pass('слоя света нет; холст непрозрачен');
    },
  },
  {
    n: 1241,
    title: 'Решение 183: цвет «без перескока» — ветви Иакова = оттенки колен матерей; у Давида — цвета ветвей решения 69',
    run: async (p) => {
      // оттенки колен (src/render/branches.ts, TRIBE_HUES) — первые четыре цвета ветвей
      const NIGHT: Record<string, string> = { liya: '#9a75c8', rakhil: '#30e978', valla: '#e8968e', zelfa: '#e960a2' };
      await go(p, '#/iakov~y-1916~w60~l-4~s1');
      const raw = await p.locator('.sky > canvas').getAttribute('data-branches');
      if (!raw) return fail('нет замера ветвей у Иакова');
      const f = JSON.parse(raw) as { sel: string; n: number; colors: string[] };
      const keys = (await p.evaluate(`(() => [...document.querySelectorAll('#sky-stars button')].length)()`)) as number;
      if (f.sel !== 'iakov' || f.n < 4) return fail(`ветвей ${f.n} у ${f.sel}`);
      const want = new Set(Object.values(NIGHT));
      const got = new Set(f.colors.slice(0, f.n).map((c) => c.toLowerCase()));
      for (const c of got) if (!want.has(c)) return fail(`у Иакова цвет ветви ${c} — не оттенок колена (${[...want].join(', ')})`);
      await go(p, '#/david~y-1000~w60~l0~s1');
      const d = JSON.parse((await p.locator('.sky > canvas').getAttribute('data-branches')) ?? '{}') as { colors?: string[] };
      const B69 = ['#30e978', '#9a75c8', '#e8968e', '#e960a2', '#81fac1', '#477dfe'];
      if (!d.colors || d.colors.slice(0, 6).some((c, i) => c.toLowerCase() !== B69[i])) return fail(`у Давида цвета ветвей ${d.colors?.slice(0, 6).join(', ')}`);
      return pass(`Иаков: ${[...got].join(', ')} (звёзд в списке ${keys}); Давид — цвета ветвей решения 69`);
    },
  },
  {
    n: 1242,
    title: 'Решение 184: на обзоре крупные созвездия — с подзаголовком из данных «родоначальник …; N лиц»',
    run: async (p) => {
      await go(p, '#/~y-1900~w4600~l0~s1');
      const notes = ((await p.evaluate(`(() => document.querySelector('.sky > canvas').dataset.notes || '')()`)) as string) + '';
      const texts = (await p.evaluate(`(() => { const s = document.querySelector('.sky').dataset; return [s.labels || '', document.querySelector('.sky > canvas').dataset.labelIds || ''].join(' '); })()`)) as string;
      const ledger = (await p.evaluate(`(() => JSON.stringify(document.querySelector('.sky > canvas').dataset))()`)) as string;
      const m = /родоначальник [А-ЯЁ][а-яё]+; \d+[ \u00a0]лиц/.exec(ledger + notes + texts);
      return m ? pass(`подзаголовок: «${m[0]}»`) : fail(`подзаголовка созвездия на обзоре нет в замере кадра (${notes.slice(0, 160)})`);
    },
  },
  {
    n: 1243,
    title: '«Условные знаки»: строки света, оттенки четырёх колен, знак врезки семьи и шестое начало «Рассказ: от Адама до Иисуса Христа»',
    run: async (p) => {
      await go(p, '#/~y-1900~w4600~l0~s1', 2500);
      await p.locator('.commands > button', { hasText: 'Условные знаки' }).click();
      await p.waitForTimeout(800);
      const text = (await p.locator('.app > .sheet').innerText()).replace(/\s+/g, ' ');
      if (!(await p.locator('.app > .sheet canvas').count())) return fail('образцов нет');
      const need = ['туманност', 'Устье', 'звёздная пыль', 'огонёк', 'сыны Лии', 'сыны Рахили', 'сыны Валлы', 'сыны Зелфы', 'Врезка семьи', 'Рассказ: от Адама до Иисуса Христа'];
      const miss = need.filter((w) => !text.includes(w));
      return miss.length ? fail(`нет: ${miss.join(', ')}`) : pass('все строки на месте');
    },
  },
  {
    n: 1244,
    title: 'Решение 184, К4′: имена у устья — у своего следа за концом перехода, путь не прерван чужой подписью',
    run: async (p) => {
      await go(p, '#/~y-1990~w900~l-6~s1');
      const raw = ((await p.locator('.sky > canvas').getAttribute('data-mouths')) ?? '').split(';').filter(Boolean);
      for (const m of raw) {
        const [id, b, path] = m.split(':');
        const [x, y, , h] = b.split(',').map(Number);
        const P = path.split(',').map(Number);
        const ex = P[P.length - 2];
        const ey = P[P.length - 1];
        if (Math.abs(x - ex) > 6 || ey < y - 6 || ey > y + h + 6) return fail(`«${id}»: имя не у своего следа (${x},${y} против ${ex},${ey})`);
      }
      return pass(`имён у устья: ${raw.length}`);
    },
  },
  {
    n: 1245,
    title: 'Жалоба владельца 3 октября: наведение на звёзды, протяжка, колесо и выбор не оставляют на холсте ни save() без restore(), ни прозрачного пикселя — «окон» с прошлым кадром нет',
    run: async (p) => {
      const scan = `(() => { const cv = document.querySelector('.sky > canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) n++; return n; })()`;
      const out: string[] = [];
      for (const hash of ['#/~y-1900~w150~l-2~s1', '#/david~y-1000~w120~l0~s1', '#/iakov', '#/veniamin', '#/~y-1535~w5592~l18~s1']) {
        await go(p, hash, 2600);
        const box = (await p.locator('.sky > canvas').boundingBox())!;
        // наведение на звёзды по очереди: у каждой — подсветка пути происхождения (marks.ts, drawOriginPath)
        const stars = (await p.evaluate(`[...document.querySelectorAll('#sky-stars button[data-x]')].slice(0, 14).map((b) => [Number(b.dataset.x), Number(b.dataset.y)])`)) as [number, number][];
        for (const [x, y] of stars) {
          await p.mouse.move(box.x + x, box.y + y);
          await p.waitForTimeout(60);
        }
        // протяжка с курсором над звёздами, колесо, щелчок по звезде
        let x = box.x + box.width * 0.55;
        let y = box.y + box.height * 0.5;
        await p.mouse.move(x, y);
        await p.mouse.down();
        for (let k = 0; k < 5; k++) {
          x -= 37;
          y += 11;
          await p.mouse.move(x, y, { steps: 2 });
        }
        await p.mouse.up();
        await p.mouse.wheel(0, -200);
        await p.waitForTimeout(900);
        if (stars.length) {
          await p.mouse.click(box.x + stars[0][0], box.y + stars[0][1]);
          await p.waitForTimeout(900);
        }
        const leak = (await p.locator('.sky > canvas').getAttribute('data-save-leak')) ?? '0';
        if (leak !== '0') return fail(`${hash}: save() без restore() — ${leak} уровней снято страховкой кадра`);
        const clear = (await p.evaluate(scan)) as number;
        if (clear) return fail(`${hash}: прозрачных пикселей ${clear}`);
        out.push(`${hash.split('~')[0]}: ${stars.length} звёзд`);
      }
      return pass(`баланс save/restore, прозрачных пикселей нет — ${out.join('; ')}`);
    },
  },
  {
    n: 1246,
    title: 'Просьба владельца 3 октября: выбор лица зажигает весь род — черты брака, шины, стволы и зубцы потомков цветом ветви (у Иакова — цветом матери), путь к родителям — светом рода; серых кусков нет',
    run: async (p) => {
      const lin = async () => {
        const raw = ((await p.locator('.sky > canvas').getAttribute('data-lineage')) ?? '').split(' ').filter(Boolean);
        return new Map(raw.map((x) => {
          const [k, v] = x.split(':');
          const [n, c] = v.split('/').map(Number);
          return [k, { n, c }] as const;
        }));
      };
      // окно выбора по умолчанию (как после щелчка): в нём и союзы Иакова, и союз Исаака и Ревекки
      await go(p, '#/iakov', 3200);
      const j = await lin();
      const bar = j.get('desc.bar');
      // на небе этапа 14 (решение 190) ромб союза с Лией — на следе Иакова, черты брака у него нет: черт — три (Рахиль,
      // Валла, Зелфа), и все — цветом матери (прежде, в «Отчем доме», черта была у каждой из четырёх жён)
      if (!bar || bar.n < 3 || bar.c !== bar.n) return fail(`Иаков: черты брака рода ${bar ? `${bar.c} цветом из ${bar.n}` : 'не нарисованы'} (нужны все черты брака цветом матери)`);
      const jog = j.get('desc.jog');
      if (jog && jog.c !== jog.n) return fail(`Иаков: шины союзов цветом ${jog.c} из ${jog.n}`);
      if (![...j.keys()].some((k) => k.startsWith('anc.'))) return fail('Иаков: путь к родителям (Исаак и Ревекка) не горит');
      await go(p, '#/veniamin', 3200);
      const v = await lin();
      const vk = [...v.keys()];
      if (!vk.some((k) => k === 'desc.trunk' || k === 'desc.jog')) return fail(`Вениамин: ствол и шина к сыновьям не горят (${vk.join(', ')})`);
      if (!vk.some((k) => k.startsWith('anc.'))) return fail('Вениамин: путь к Иакову и Рахили не горит');
      const fmt = (m: Map<string, { n: number; c: number }>) => [...m].map(([k, x]) => `${k} ${x.c}/${x.n}`).join(', ');
      return pass(`Иаков: ${fmt(j)}; Вениамин: ${fmt(v)}`);
    },
  },
];
