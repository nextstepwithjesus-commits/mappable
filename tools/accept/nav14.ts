/**
 * Сценарии приёмки этапа 14, группа nav14 (исполнитель S3 «Навигация и контекст»): номера 1140–1159, решения 145–149,
 * пороги П1, П2, П3, П7, Т3 (вместе с touch14), Т5. Проверки — по окну неба .sky[data-view], месту выбранной звезды
 * .sky[data-sel], родне выбранного .sky[data-kin] («лицо:x,y,1|0» — в кадре или за краем; «лицо:-» — не на небе) и
 * указателям у края .sky[data-edges] («подпись=лица|…»), подписанным лицам canvas[data-label-ids], адресу и длине истории.
 */
import type { Page } from 'playwright';
import { pass, fail, find, hashId, type Scenario } from './kit.ts';

const go = async (p: Page, hash: string, ms = 2800) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
const selAt = async (p: Page) => {
  const s = await p.locator('.sky').getAttribute('data-sel');
  if (!s) return null;
  const [x, y] = s.split(' ').map(Number);
  return { x, y };
};
const dist = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
const showKey = (p: Page) => p.evaluate(() => document.documentElement.dataset.show ?? '');
const histLen = (p: Page) => p.evaluate(() => history.length);

/** Родня выбранного: на небе, в кадре, подписана, названа указателем у края. */
async function family(p: Page) {
  return (await p.evaluate(`(() => {
    var sky = document.querySelector('.sky');
    var c = sky.querySelector('canvas');
    var kin = (sky.dataset.kin || '').split(';').filter(Boolean).map(function (q) { var a = q.split(':'); return { id: a[0], on: a[1] !== '-', inside: a[1].split(',')[2] === '1' }; });
    var labels = (c.dataset.labelIds || '').split(' ').filter(Boolean);
    var edges = (sky.dataset.edges || '').split('|').filter(Boolean).map(function (e) { var at = e.lastIndexOf('@'); var b = at > 0 ? e.slice(at + 1).split(',').map(Number) : null; var t = at > 0 ? e.slice(0, at) : e; var i = t.lastIndexOf('='); return { label: t.slice(0, i), ids: t.slice(i + 1).split(','), box: b ? { x: b[0], y: b[1], w: b[2], h: b[3] } : null }; });
    return { kin: kin, labels: labels, edges: edges };
  })()`)) as { kin: { id: string; on: boolean; inside: boolean }[]; labels: string[]; edges: { label: string; ids: string[]; box: { x: number; y: number; w: number; h: number } | null }[] };
}

/**
 * Верхняя ступень решения 164 у лица id: родители, супруги и лица линий Мессии величины ≤ 1 в его семье первого колена
 * (по собранному атласу src/generated/atlas.json: модуль атласа в node не грузится). Эти имена подписаны всегда.
 */
export async function topTier(id: string): Promise<Set<string>> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ROOT } = await import('../bible.ts');
  type P = { id: string; f?: string; m?: string; mg: number; sp?: { id: string }[] };
  const a = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: P[]; lines: Record<string, { persons: { id: string }[] }> };
  const by = new Map(a.persons.map((q) => [q.id, q]));
  const spine = new Set(Object.values(a.lines).flatMap((l) => l.persons.map((x) => x.id)));
  const me = by.get(id)!;
  const out = new Set<string>([me.f, me.m, ...(me.sp ?? []).map((q) => q.id)].filter((x): x is string => !!x));
  for (const q of a.persons) {
    if ((q.sp ?? []).some((x) => x.id === id)) out.add(q.id);
    const kid = q.f === id || q.m === id;
    const sib = (!!me.f && q.f === me.f) || (!!me.m && q.m === me.m);
    if ((kid || (sib && q.id !== id)) && spine.has(q.id) && q.mg <= 1) out.add(q.id);
  }
  return out;
}

/**
 * П1: переход по ссылке карточки from → to; родня первого колена учтена: подписана, названа указателем у края (за краем)
 * или стоит в canvas[data-hidden] и в строке «Без подписи на небе» карточки у звезды. Решение 164 (второй круг): верхняя
 * ступень — родители, супруги, лица лент величины ≤ 1 — в кадре подписана всегда; доля подписанных — не ниже labeled.
 */
async function linkKeepsFamily(p: Page, from: string, to: string, labeled = 0.7) {
  await go(p, from, 3000);
  const b = p.locator(`.folio button.person[data-id="${to}"]`).first();
  if (!(await b.count())) return fail(`в карточке нет ссылки на ${to}`);
  await b.click();
  await p.waitForTimeout(2600);
  if (hashId(p) !== to) return fail(`выбрано «${hashId(p)}»`);
  let f = await family(p);
  let on = f.kin.filter((k) => k.on);
  if (!on.length) return fail('родни на небе нет (нет data-kin)');
  let ptr = new Set(f.edges.flatMap((e) => e.ids));
  let row: string[] = [];
  // этап 14 (решения 146, 153; S4): лицо без подписи учтено и строкой «Без подписи на небе: …» карточки у звезды выбранного —
  // если подписей и указателей не хватило, карточка у звезды открывается щелчком по звезде, и всё считается заново
  if (on.some((k) => !f.labels.includes(k.id) && !ptr.has(k.id))) {
    const at = await p.locator('.sky').getAttribute('data-sel');
    const box = await p.locator('.sky canvas').boundingBox();
    if (at && box) {
      const [x, y] = at.split(' ').map(Number);
      await p.mouse.click(box.x + x, box.y + y);
      await p.waitForTimeout(1500);
      if (hashId(p) !== to) return fail(`щелчок по звезде выбрал «${hashId(p)}»`);
      f = await family(p);
      on = f.kin.filter((k) => k.on);
      ptr = new Set(f.edges.flatMap((e) => e.ids));
      // весь список строки (первые имена — кнопками, остальные — «и ещё N») — в data-ids
      const ids = (await p.locator('.sky .dotcard .dc-hidden').getAttribute('data-ids').catch(() => null)) ?? '';
      row = ids.split(' ').filter(Boolean);
    }
  }
  const lab = on.filter((k) => f.labels.includes(k.id));
  const hidden = ((await p.locator('.sky canvas').getAttribute('data-hidden')) ?? '').split(' ');
  const miss = on.filter((k) => !f.labels.includes(k.id) && !ptr.has(k.id) && !(row.includes(k.id) && (!k.inside || hidden.includes(k.id)))).map((k) => k.id);
  const share = lab.length / on.length;
  const top = await topTier(to);
  const topMiss = on.filter((k) => k.inside && top.has(k.id) && !f.labels.includes(k.id)).map((k) => k.id);
  const why = `родни ${on.length}, в кадре ${on.filter((k) => k.inside).length}, подписано ${lab.length} (${Math.round(share * 100)} %), верхняя ступень ${on.filter((k) => k.inside && top.has(k.id)).length - topMiss.length}/${on.filter((k) => k.inside && top.has(k.id)).length}, указатели: ${f.edges.map((e) => e.label).join(' | ') || 'нет'}${row.length ? `, «Без подписи на небе»: ${row.length}` : ''}`;
  if (miss.length) return fail(`${why}; не учтены: ${miss.join(' ')}`);
  if (topMiss.length) return fail(`${why}; верхняя ступень без подписи: ${topMiss.join(' ')}`);
  return share >= labeled ? pass(why) : fail(`${why}; подписано меньше ${Math.round(labeled * 100)} %`);
}

/** Открыть лист «Показ» и выбрать вид kind (широкий экран: применяется сразу). */
async function sheetPick(p: Page, kind: string) {
  await p.locator('.sky .showbar .sb-cmd[data-cmd="sheet"]').first().click();
  await p.waitForTimeout(900);
  await p.locator(`.showsheet .ss-kinds label:has-text("${kind}")`).first().click();
  await p.waitForTimeout(400);
}

/** Звёзды показа под строкой показа (canvas[data-stars] — в частичных показах). */
async function starsUnderBar(p: Page): Promise<number> {
  return (await p.evaluate(`(() => {
    var sky = document.querySelector('.sky'); var c = sky.querySelector('canvas'); var cr = c.getBoundingClientRect();
    var bar = sky.querySelector('.showbar').getBoundingClientRect();
    return (c.dataset.stars || '').split(';').filter(Boolean).map(function (q) { var a = q.split(':')[1].split(',').map(Number); return { x: cr.left + a[0], y: cr.top + a[1] }; })
      .filter(function (q) { return q.x >= bar.left && q.x <= bar.right && q.y >= bar.top - 2 && q.y <= bar.bottom + 2; }).length;
  })()`)) as number;
}

/**
 * Смена показа при выбранном Давиде (П2): сдвиг лица и звёзды под строкой показа. fits — показ вписывается целиком
 * (линии, ключевые лица): под строкой показа звёзд нет; показ больше окна (род лица во все поколения) не вписывается —
 * лицо на месте, а края показа, как у всего неба, могут уходить и под строку.
 */
async function showKeepsPerson(p: Page, kind: string, fits = true, extra?: (p: Page) => Promise<void>) {
  await go(p, '#/david~y-1013~w182~l0.0~s1', 3000);
  await sheetPick(p, kind === 'Созвездия' ? 'Созвездия' : kind);
  // лист «Показ» открылся над выбранным: небо вывело лицо из-под листа — отсчёт от этого места
  const before = await selAt(p);
  if (extra) await extra(p);
  await p.waitForTimeout(2800);
  const after = await selAt(p);
  const d = dist(before, after);
  const under = await starsUnderBar(p);
  const why = `${kind}: сдвиг ${d.toFixed(1)} px, звёзд под строкой показа ${under} (${await showKey(p)})`;
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  return d <= 2 && (under === 0 || !fits) ? pass(why) : fail(why);
}

export const nav14: Scenario[] = [
  {
    n: 1140,
    title: 'П1 (решение 146): Руфь → Давид по ссылке, 1440 — родня первого колена учтена (подпись или указатель у края), подписано ≥ 70 %',
    run: (p) => linkKeepsFamily(p, '#/ruf~y-1099~w169~l-3.0~s1', 'david'),
  },
  {
    n: 1141,
    title: 'П1 (решение 146): Руфь → Давид по ссылке, 1280',
    view: { width: 1280, height: 800 },
    run: (p) => linkKeepsFamily(p, '#/ruf~y-1099~w169~l-3.0~s1', 'david'),
  },
  {
    n: 1142,
    // второй круг (решения 163, 164): имя не на чужой вертикали — тесная семья Давида на 1024 с карточкой подписана не вся;
    // верхняя ступень 164 подписана всегда, остальные учтены строкой «Без подписи на небе», доля подписанных — пол регрессии
    title: 'П1 (решения 146, 153, 164): Руфь → Давид по ссылке, 1024 — верхняя ступень подписана, остальные учтены подписью, указателем у края или строкой «Без подписи на небе»; подписано ≥ 55 %',
    view: { width: 1024, height: 768 },
    run: (p) => linkKeepsFamily(p, '#/ruf~y-1099~w169~l-3.0~s1', 'david', 0.55),
  },
  {
    n: 1143,
    title: 'П1 (решение 146): Иаков → Вениамин и Иосиф по ссылке — родня учтена, указатели у края с числом',
    run: async (p) => {
      const a = await linkKeepsFamily(p, '#/iakov', 'veniamin');
      if (!a.ok) return a;
      const b = await linkKeepsFamily(p, '#/iakov', 'iosif', 0.6);
      return b.ok ? pass(`${a.why}; ${b.why}`) : b;
    },
  },
  {
    n: 1144,
    title: 'Решения 44 и 146: щелчок по звезде камеру не двигает; родня за краем — указателями «→ N детей», «↑ …, отец»',
    run: async (p) => {
      // Давид у правого края окна — его дети за краем; выбран Иессей — колонка карточки уже открыта, ширина неба та же
      await go(p, '#/iessey~y-1080~w120~l0.0~s1', 3000);
      const st = await p.evaluate(() => {
        const b = document.getElementById('sky-star-david');
        return b ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
      });
      if (!st) return fail('Давида нет в списке неба');
      const box = (await p.locator('.sky canvas').boundingBox())!;
      const v0 = await p.locator('.sky').getAttribute('data-view');
      await p.mouse.click(box.x + st.x, box.y + st.y);
      await p.waitForTimeout(1800);
      if (hashId(p) !== 'david') return fail(`щелчок выбрал «${hashId(p)}»`);
      const v1 = await p.locator('.sky').getAttribute('data-view');
      const [x0a, kxa] = (v0 ?? '').split(' ').slice(4, 6).map(Number);
      const [x0b, kxb] = (v1 ?? '').split(' ').slice(4, 6).map(Number);
      if (Math.abs(kxa - kxb) > 1e-6 || Math.abs((x0a - x0b) * kxa) > 2) return fail(`камера сдвинулась: ${v0} → ${v1}`);
      const f = await family(p);
      const out = f.kin.filter((k) => k.on && !k.inside);
      const ptr = new Set(f.edges.flatMap((e) => e.ids));
      // за краем (или у самого края) — указатель; у края, но подписанная, — видна и так
      const miss = out.filter((k) => !ptr.has(k.id) && !f.labels.includes(k.id));
      if (!out.length) return fail('вся родня в кадре — сцена не проверяет указатели');
      if (miss.length) return fail(`за краем без указателя: ${miss.map((k) => k.id).join(' ')}`);
      const counted = f.edges.filter((e) => e.ids.length > 1);
      return counted.every((e) => /^[↑↓←→] /.test(e.label) && (/\d+ /.test(e.label) || /родители/.test(e.label)))
        ? pass(`за краем ${out.length}; указатели: ${f.edges.map((e) => e.label).join(' | ')}`)
        : fail(`указатель группы без числа: ${counted.map((e) => e.label).join(' | ')}`);
    },
  },
  {
    n: 1145,
    title: 'П2 (решение 147): смена показа при выбранном Давиде на «Родословие Иисуса Христа» — лицо на месте ±2 px, под строкой показа звёзд нет',
    run: (p) => showKeepsPerson(p, 'Родословие Иисуса'),
  },
  {
    n: 1146,
    title: 'П2 (решение 147): «Ключевые лица» и «Предки и потомки лица…» при выбранном Давиде — лицо на месте ±2 px',
    run: async (p) => {
      const a = await showKeepsPerson(p, 'Ключевые лица');
      if (!a.ok) return a;
      const b = await showKeepsPerson(p, 'Предки и потомки лица', false);
      return b.ok ? pass(`${a.why}; ${b.why}`) : b;
    },
  },
  {
    n: 1147,
    title: 'П3 (решение 147): сеанс листа «Показ» (вид → направление → поколения → по крови) — одна запись истории; «назад» — прежний показ и окно ±2 px',
    run: async (p) => {
      await go(p, '#/david~y-1013~w182~l0.0~s1', 3000);
      const h0 = await histLen(p);
      const s0 = await selAt(p);
      await sheetPick(p, 'Предки и потомки лица');
      for (const [cls, t] of [
        ['ss-dir', 'оба'],
        ['ss-gen', '1'],
        ['ss-by', 'по крови'],
      ]) {
        await p.locator(`.showsheet .${cls} button:has-text("${t}")`).click();
        await p.waitForTimeout(500);
      }
      await p.waitForTimeout(1200);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(600);
      const h1 = await histLen(p);
      if (h1 - h0 !== 1) return fail(`записей за сеанс: ${h1 - h0}`);
      await p.goBack();
      await p.waitForTimeout(2600);
      const k = await showKey(p);
      if (k !== 'a') return fail(`после «назад» показ «${k}»`);
      const d = dist(s0, await selAt(p));
      return d <= 2 ? pass(`1 запись; после «назад» лицо на месте (${d.toFixed(1)} px)`) : fail(`после «назад» лицо сдвинуто на ${d.toFixed(1)} px`);
    },
  },
  {
    n: 1148,
    title: 'Решение 147 (U10): «Предки и потомки ▾ → Настроить…» открывает лист с родом выбранного лица, а не «Всё небо»',
    run: async (p) => {
      await go(p, '#/david', 3000);
      const st = await selAt(p);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      if (!st) return fail('Давид не на небе');
      await p.mouse.click(box.x + st.x, box.y + st.y);
      await p.waitForTimeout(1200);
      const menu = p.locator('.dotcard .dc-lineage > button').first();
      if (!(await menu.count())) return fail('нет меню «Предки и потомки ▾» в карточке у звезды');
      await menu.click();
      await p.waitForTimeout(300);
      await p.locator('.dotcard [role="menuitem"]:has-text("Настроить")').first().click();
      await p.waitForTimeout(900);
      const on = await p.locator('.showsheet .ss-kinds input:checked').getAttribute('value');
      const who = (await p.locator('.showsheet .ss-lineage .who').count()) ? (await p.locator('.showsheet .ss-lineage .who').innerText()).trim() : '';
      return on === 'lineage' && /^Давид/.test(who) ? pass(`вид «${on}», лицо «${who}»`) : fail(`вид «${on}», лицо «${who}»`);
    },
  },
  {
    n: 1149,
    title: 'П7 (решение 145): «Ближайшая родня» — 2 действия до семейной укладки (звезда, команда); возврат — 1 действие (Escape): прежний показ и окно',
    run: async (p) => {
      await find(p, 'Иаков');
      await p.waitForTimeout(1500);
      const v0 = await p.locator('.sky').getAttribute('data-view');
      const s0 = await selAt(p);
      if (!s0) return fail('Иаков не на небе');
      const box = (await p.locator('.sky canvas').boundingBox())!;
      // действие 1 — звезда; действие 2 — команда карточки у звезды
      await p.mouse.click(box.x + s0.x, box.y + s0.y);
      await p.waitForTimeout(1200);
      const cmd = p.locator('.dotcard .dc-near').first();
      if (!(await cmd.count())) return fail('нет команды «Ближайшая родня» в карточке у звезды');
      await cmd.click();
      await p.waitForTimeout(2500);
      const k = await showKey(p);
      const lay = await p.evaluate(() => document.documentElement.dataset.showLayout);
      if (k !== 'r.iakov.b.1.b' || lay !== 'family') return fail(`показ «${k}», укладка «${lay}»`);
      const bar = (await p.locator('.sky .showbar').innerText()).replace(/\s+/g, ' ');
      if (!/ближайшая родня Иакова/.test(bar) || !/вернуть прежний показ/.test(bar)) return fail(`строка показа: «${bar}»`);
      // возврат — одно действие: Escape (карточка у звезды закрыта — первым Escape закрывается она)
      if (await p.locator('.dotcard[data-placed]').count()) await p.locator('.sky canvas').focus();
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
      if ((await showKey(p)) !== 'a') {
        await p.keyboard.press('Escape');
        await p.waitForTimeout(400);
      }
      await p.waitForTimeout(2000);
      const back = await showKey(p);
      if (back !== 'a') return fail(`после Escape показ «${back}»`);
      if (hashId(p) !== 'iakov') return fail(`после возврата выбрано «${hashId(p)}»`);
      const d = dist(s0, await selAt(p));
      const v1 = await p.locator('.sky').getAttribute('data-view');
      return d <= 2 ? pass(`укладка за 2 действия; возврат — лицо на месте (${d.toFixed(1)} px)`) : fail(`окно не вернулось: ${v0} → ${v1}`);
    },
  },
  {
    n: 1150,
    title: 'П7 (решение 145): «вернуть прежний показ» в строке показа и «назад» возвращают показ и окно одним действием',
    run: async (p) => {
      await go(p, '#/david~y-1013~w182~l0.0~s1~vk', 3200);
      const s0 = await selAt(p);
      const box = (await p.locator('.sky canvas').boundingBox())!;
      if (!s0) return fail('Давид не на небе');
      await p.mouse.click(box.x + s0.x, box.y + s0.y);
      await p.waitForTimeout(1200);
      const cmd = p.locator('.dotcard .dc-near').first();
      if (!(await cmd.count())) return fail('нет команды «Ближайшая родня»');
      await cmd.click();
      await p.waitForTimeout(2500);
      const ret = p.locator('.sky .showbar .sb-cmd[data-cmd="return"]').first();
      if (!(await ret.count())) return fail('нет «вернуть прежний показ» в строке показа');
      await ret.click();
      await p.waitForTimeout(2600);
      if ((await showKey(p)) !== 'k') return fail(`после «вернуть» показ «${await showKey(p)}»`);
      const d1 = dist(s0, await selAt(p));
      if (d1 > 2) return fail(`после «вернуть» лицо сдвинуто на ${d1.toFixed(1)} px`);
      // вперёд к родне и «назад» — то же
      await p.goForward();
      await p.waitForTimeout(2400);
      if (!/^r\.david\.b\.1\.b/.test(await showKey(p))) return fail(`«вперёд» — показ «${await showKey(p)}»`);
      await p.goBack();
      await p.waitForTimeout(2600);
      const d2 = dist(s0, await selAt(p));
      return (await showKey(p)) === 'k' && d2 <= 2 ? pass(`«вернуть» и «назад»: ${d1.toFixed(1)} и ${d2.toFixed(1)} px`) : fail(`«назад»: показ «${await showKey(p)}», сдвиг ${d2.toFixed(1)} px`);
    },
  },
  {
    n: 1151,
    title: 'Решения 148, 168: «История: Руфь › Овид › Иессей» в строке показа; имя истории возвращает к лицу; «назад» — история своей записи',
    run: async (p) => {
      await find(p, 'Руфь');
      for (const id of ['ovid', 'iessey']) {
        const b = p.locator(`.folio button.person[data-id="${id}"]`).first();
        if (!(await b.count())) return fail(`в карточке нет ссылки на ${id}`);
        await b.click();
        await p.waitForTimeout(1600);
      }
      const line = p.locator('.sky .showbar .sb-path');
      if (!(await line.count())) return fail('нет строки истории');
      const t = (await line.innerText()).replace(/\s+/g, ' ').trim();
      if (!/^История: Руфь › Овид › Иессей$/.test(t)) return fail(`строка истории: «${t}»`);
      await line.locator('button[data-id="ruf"]').click();
      await p.waitForTimeout(1600);
      if (hashId(p) !== 'ruf') return fail(`имя в истории выбрало «${hashId(p)}»`);
      const t2 = (await p.locator('.sky .showbar').innerText()).replace(/\s+/g, ' ');
      if (/История:/.test(t2)) return fail(`после возврата к началу истории строка осталась: «${t2}»`);
      // «назад» возвращает и историю
      await p.goBack();
      await p.waitForTimeout(1600);
      const t3 = ((await p.locator('.sky .showbar .sb-path').count()) ? await p.locator('.sky .showbar .sb-path').innerText() : '').replace(/\s+/g, ' ').trim();
      if (!/Руфь › Овид › Иессей/.test(t3)) return fail(`после «назад» история «${t3}»`);
      // новый поиск начинает новую историю (решение 168): «Давид» — один, строки нет
      await find(p, 'Давид');
      await p.waitForTimeout(800);
      const t4 = ((await p.locator('.sky .showbar .sb-path').count()) ? await p.locator('.sky .showbar .sb-path').innerText() : '').replace(/\s+/g, ' ').trim();
      return t4 === '' ? pass(`«${t}»; «назад» — «${t3}»; новый поиск — новая история`) : fail(`после нового поиска строка «${t4}»`);
    },
  },
  {
    n: 1152,
    title: 'Решение 148: на 1024 px история свёрнута до «‹ Руфь»',
    view: { width: 1024, height: 768 },
    run: async (p) => {
      await find(p, 'Руфь');
      await p.locator('.folio button.person[data-id="ovid"]').first().click();
      await p.waitForTimeout(1600);
      const line = p.locator('.sky .showbar .sb-path');
      if (!(await line.count())) return fail('нет строки истории');
      const t = (await line.innerText()).replace(/\s+/g, ' ').trim();
      if (t !== '‹ Руфь') return fail(`строка истории: «${t}»`);
      await line.locator('button').click();
      await p.waitForTimeout(1500);
      return hashId(p) === 'ruf' ? pass(`«${t}» — к Руфи`) : fail(`выбрано «${hashId(p)}»`);
    },
  },
  {
    n: 1153,
    title: 'Решение 147: прыжок по эпохе — своя запись истории; «назад» возвращает прежнее окно',
    run: async (p) => {
      await go(p, '#/~y-1000~w300~l0.0~s1', 2600);
      const v0 = await p.locator('.sky').getAttribute('data-view');
      const h0 = await histLen(p);
      await p.evaluate(() => {
        const b = [...document.querySelectorAll<HTMLButtonElement>('ul[aria-label="Эпохи на полосе времени"] button')].find((x) => /^Исход/.test(x.textContent ?? ''));
        b?.click();
      });
      await p.waitForTimeout(2200);
      const h1 = await histLen(p);
      if (h1 - h0 !== 1) return fail(`записей за прыжок: ${h1 - h0}`);
      await p.goBack();
      await p.waitForTimeout(1800);
      const v1 = await p.locator('.sky').getAttribute('data-view');
      const [x0a, kxa] = (v0 ?? '').split(' ').slice(4, 6).map(Number);
      const [x0b, kxb] = (v1 ?? '').split(' ').slice(4, 6).map(Number);
      return Math.abs(kxa / kxb - 1) < 0.01 && Math.abs((x0a - x0b) * kxa) <= 2 ? pass('«назад» — прежнее окно') : fail(`окно после «назад»: ${v0} → ${v1}`);
    },
  },
  {
    n: 1154,
    title: 'Решение 147 (U5): эпоха в частичном показе — лица показа в кадре или строка «В показе нет лиц этой эпохи — всё небо»',
    run: async (p) => {
      const jump = async (hash: string, ep: string) => {
        await go(p, hash, 3200);
        await p.evaluate((ep) => {
          const b = [...document.querySelectorAll<HTMLButtonElement>('ul[aria-label="Эпохи на полосе времени"] button')].find((x) => (x.textContent ?? '').startsWith(ep));
          b?.click();
        }, ep);
        await p.waitForTimeout(2600);
        const line = p.locator('.sky .showbar .sb-line[data-line="empty"]');
        const stars = await p.locator('#sky-stars li').count();
        return { line, has: (await line.count()) > 0, stars };
      };
      // линии Мессии в эпоху Исхода: лица в кадре есть — строки нет
      const a = await jump('#/~vl', 'Исход');
      if (!a.stars && !a.has) return fail('«Исход» в показе линий: пустое небо без пояснения');
      if (a.stars && a.has) return fail(`«Исход» в показе линий: лиц в кадре ${a.stars}, а строка «нет лиц»`);
      // «Дом Нахора» в эпоху Исхода: лиц нет — строка и «всё небо»
      const b = await jump('#/~vg.nahorites', 'Исход');
      if (!b.has) return fail(`«Дом Нахора» в эпоху Исхода: лиц в кадре ${b.stars}, строки нет`);
      const t = (await b.line.innerText()).replace(/\s+/g, ' ').trim();
      await b.line.locator('button').click();
      await p.waitForTimeout(1500);
      return (await showKey(p)) === 'a' ? pass(`линии: лиц в кадре ${a.stars}; «Дом Нахора»: «${t}» → всё небо`) : fail(`после «всё небо» показ «${await showKey(p)}»`);
    },
  },
  {
    n: 1155,
    title: 'Т5 (решение 149): клавиатура — после «[» фокус (aria-activedescendant) на выбранном; Enter не меняет выбор',
    run: async (p) => {
      await go(p, '#/iakov', 3000);
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('ArrowRight');
      await p.keyboard.press('ArrowLeft');
      await p.waitForTimeout(300);
      await p.keyboard.press('BracketLeft');
      await p.waitForTimeout(1500);
      const sel = hashId(p);
      if (sel !== 'isaak') return fail(`«[» выбрал «${sel}»`);
      const ad = await p.locator('.sky canvas').getAttribute('aria-activedescendant');
      if (ad !== 'sky-star-isaak') return fail(`aria-activedescendant = «${ad}»`);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(1200);
      if (hashId(p) !== 'isaak') return fail(`Enter выбрал «${hashId(p)}»`);
      // «]» возвращает к Иакову, фокус — с ним
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('BracketRight');
      await p.waitForTimeout(1500);
      const ad2 = await p.locator('.sky canvas').getAttribute('aria-activedescendant');
      return hashId(p) === 'iakov' && ad2 === 'sky-star-iakov' ? pass('«[» и «]»: выбор и фокус — одно лицо') : fail(`после «]»: выбрано «${hashId(p)}», фокус «${ad2}»`);
    },
  },
  {
    n: 1156,
    title: 'Решение 149 (M9): клавиша «п» (G) — с неба в карточку выбранного и обратно на небо',
    run: async (p) => {
      await go(p, '#/iakov', 3000);
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('KeyG');
      await p.waitForTimeout(500);
      const inCard = await p.evaluate(() => !!document.activeElement?.closest('.folio'));
      if (!inCard) return fail(`фокус после «п»: ${await p.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className)}`);
      // в карточке — Tab к имени «Родства», «п» на небо и обратно — к тому же имени
      await p.keyboard.press('Tab');
      const spot = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.outerHTML.slice(0, 80) ?? '');
      await p.keyboard.press('KeyG');
      await p.waitForTimeout(400);
      const onSky = await p.evaluate(() => document.activeElement?.tagName === 'CANVAS');
      if (!onSky) return fail('«п» из карточки не вернула фокус на небо');
      await p.keyboard.press('KeyG');
      await p.waitForTimeout(400);
      const back = await p.evaluate(() => (document.activeElement as HTMLElement | null)?.outerHTML.slice(0, 80) ?? '');
      return back === spot ? pass('небо ↔ карточка; возврат — к тому же месту') : fail(`вернулся не туда: «${back}» вместо «${spot}»`);
    },
  },
  {
    n: 1157,
    title: 'Решения 146 (M2) и 165: телефон 390 — окно лица по адресу: строки не теснее 10 px; окно густой семьи (Давид) — по ширине, не w182 стола; родня на небе видна или названа указателем',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/', 2000);
      await go(p, '#/iakov', 3200);
      const ky = Number(((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ')[7]);
      if (ky < 10 - 0.05) return fail(`строка ${ky.toFixed(1)} px`);
      await go(p, '#/', 1500);
      await go(p, '#/david', 3200);
      const w = Number(/~w(\d+)/.exec(decodeURIComponent(new URL(p.url()).hash))?.[1] ?? NaN);
      if (!(w < 182)) return fail(`окно Давида на телефоне w${w} — как на столе`);
      const f = await family(p);
      const ptr = new Set(f.edges.flatMap((e) => e.ids));
      const lost = f.kin.filter((k) => k.on && !k.inside && !ptr.has(k.id) && !f.labels.includes(k.id));
      return lost.length ? fail(`Давид w${w}: за краем без указателя — ${lost.map((k) => k.id).join(' ')}`) : pass(`Иаков: строка ${ky.toFixed(1)} px; Давид: окно w${w}`);
    },
  },
  {
    n: 1158,
    title: 'Решение 161 (R1-02): выбор лица поиском снимает выбранную связь, если лицо не на ней; лицо на связи её сохраняет',
    run: async (p) => {
      await go(p, '#/iakov~ck.iakov.rakhil._.veniamin', 3200);
      const k0 = await p.evaluate(() => document.documentElement.dataset.link ?? '');
      if (!k0) return fail('связь из адреса не выбрана');
      // Вениамин — конец связи: выбор его связь оставляет
      const b = p.locator('.folio button.person[data-id="veniamin"]').first();
      if (await b.count()) {
        await b.click();
        await p.waitForTimeout(1500);
        const k1 = await p.evaluate(() => document.documentElement.dataset.link ?? '');
        if (k1 !== k0) return fail(`выбор конца связи снял её: «${k1}»`);
      }
      await find(p, 'Давид');
      await p.waitForTimeout(600);
      const k2 = await p.evaluate(() => document.documentElement.dataset.link ?? '');
      if (k2) return fail(`после поиска «Давид» связь осталась: ${k2}`);
      if (/~c/.test(decodeURIComponent(new URL(p.url()).hash))) return fail(`связь в адресе: ${p.url()}`);
      const f = await family(p);
      const foreign = f.edges.filter((e) => /Иаков|Рахиль|Вениамин/.test(e.label));
      return foreign.length ? fail(`указатели прежней связи: ${foreign.map((e) => e.label).join(' | ')}`) : pass('связь снята, указателей прежней связи нет');
    },
  },
  {
    n: 1159,
    title: 'Решения 162 и 169 (R1-03, R2-7, R2-11): телефон — указатель родни только к невидимой звезде, стрелкой к её краю, не ближе 24 px к выбранному; после касания скобок фокуса нет, после клавиатуры — есть',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      const issues: string[] = [];
      for (const hash of ['#/iakov~y-1960~w220~l0.0~s1', '#/vooz~y-1099~w169~l-3.0~s1', '#/david']) {
        await go(p, '#/', 1200);
        await go(p, hash, 3200);
        const sel = await selAt(p);
        if (!sel) {
          issues.push(`${hash}: выбранного нет на небе`);
          continue;
        }
        // касание выбранного: карточка у звезды, лист на шапке
        const box = (await p.locator('.sky canvas').boundingBox())!;
        await p.touchscreen.tap(box.x + sel.x, box.y + sel.y);
        await p.waitForTimeout(1200);
        const ring = await p.locator('.sky').getAttribute('data-focus-ring');
        if (ring) issues.push(`${hash}: после касания скобки фокуса у «${ring}»`);
        const f = await family(p);
        const s2 = (await selAt(p)) ?? sel;
        const kin = new Map(f.kin.map((k) => [k.id, k]));
        for (const e of f.edges) {
          if (!e.box || e.ids.length === 0 || !e.ids.every((id) => kin.has(id))) continue;
          for (const id of e.ids) if (kin.get(id)!.inside) issues.push(`${hash}: «${e.label}» указывает на видимую звезду ${id}`);
          const b = e.box;
          const d = Math.hypot(Math.max(b.x - s2.x, 0, s2.x - (b.x + b.w)), Math.max(b.y - s2.y, 0, s2.y - (b.y + b.h)));
          if (d < 24) issues.push(`${hash}: «${e.label}» в ${d.toFixed(0)} px от выбранного`);
        }
      }
      if (issues.length) return fail(issues.join('; '));
      // клавиатура: Tab до неба — скобки появляются
      await p.locator('.sky canvas').focus();
      await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(300);
      const ring = await p.locator('.sky').getAttribute('data-focus-ring');
      return ring ? pass(`касание — без скобок; клавиатура — скобки у «${ring}»`) : fail('после стрелки скобок фокуса нет');
    },
  },
];
