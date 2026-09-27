/** Сценарии приёмки этапа 3: меридиан, ярусы эпох, отметки одноимённых, наведение, затемнение. Номера 70–89. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { ROOT } from '../bible.ts';
import { pass, fail, hashId, type Scenario } from './kit.ts';

/** Видимая часть неба и камера (data-view, SkyView): px холста и мировые величины. */
async function view(p: Page) {
  const [l, t, r, b, x0, kx, laneTop, ky] = ((await p.locator('.sky').getAttribute('data-view')) ?? '').split(' ').map(Number);
  return { l, t, r, b, x0, kx, laneTop, ky };
}
const canvasBox = async (p: Page) => (await p.locator('.sky canvas').boundingBox())!;
const meridianFlag = (p: Page) => p.locator('.sky').getAttribute('data-meridian');
const go = async (p: Page, hash: string, ms = 2200) => {
  await p.goto(p.url().replace(/#.*$/, '') + hash);
  await p.waitForTimeout(ms);
};
/** Величины звёзд из собранного индекса. */
const magnitude = (() => {
  let m: Map<string, number> | null = null;
  return (id: string) => {
    if (!m) {
      const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: { id: string; mg: number }[] };
      m = new Map(atlas.persons.map((x) => [x.id, x.mg]));
    }
    return m.get(id) ?? 9;
  };
})();

/** Подсказка сейчас: вид, лицо или отрезок, положение, видна ли и её прямоугольник (px страницы). */
async function tipNow(p: Page) {
  const t = p.locator('.sky .tip');
  if (!(await t.count())) return null;
  return {
    kind: (await t.getAttribute('data-kind')) ?? '',
    id: (await t.getAttribute('data-id')) ?? '',
    side: (await t.getAttribute('data-side')) ?? '',
    shown: (await t.getAttribute('data-shown')) !== null,
    text: (await t.innerText()).trim(),
    box: (await t.boundingBox())!,
  };
}
/** Навести указатель на звезду, подходящую под ok: спираль от точки, пока не появится подсказка звезды. */
async function starNear(p: Page, cx: number, cy: number, ok: (id: string) => boolean = () => true, rmax = 300) {
  const b = await canvasBox(p);
  for (let r = 0; r < rmax; r += 6)
    for (let k = 0; k < 16; k++) {
      const x = cx + r * Math.cos((k / 16) * Math.PI * 2);
      const y = cy + r * Math.sin((k / 16) * Math.PI * 2);
      if (y < b.y + 60 || y > b.y + b.height - 10 || x < b.x + 24 || x > b.x + b.width - 4) continue;
      const top = await p.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y]);
      if (top !== 'CANVAS') continue;
      await p.mouse.move(x, y);
      await p.waitForTimeout(8);
      const t = await tipNow(p);
      if (t && t.kind === 'star' && ok(t.id)) return { x, y, id: t.id };
    }
  return null;
}
/** Навести указатель на отрезок яруса, в подсказке которого есть re. */
async function barNear(p: Page, re: RegExp) {
  const b = await canvasBox(p);
  const v = await view(p);
  for (let y = b.y + 46; y < b.y + v.t; y += 4)
    for (let x = b.x + 30; x < b.x + b.width - 10; x += 16) {
      await p.mouse.move(x, y);
      await p.waitForTimeout(4);
      const t = await tipNow(p);
      if (t && t.kind === 'tier' && re.test(t.text)) return { x, y, id: t.id };
    }
  return null;
}

export const sky: Scenario[] = [
  {
    n: 70,
    title: 'D13 мышью: меридиан над линейкой — через 250 мс, флажок «… г. до Р. Х.: живы N, наверняка M»; при протяжке его нет',
    run: async (p) => {
      await go(p, '#/~y-1000~w900~l0', 1800);
      const b = await canvasBox(p);
      const x = b.x + b.width * 0.5;
      await p.mouse.move(x, b.y + 12);
      await p.waitForTimeout(90);
      if (await meridianFlag(p)) return fail('меридиан появился раньше 250 мс');
      await p.mouse.move(x + 3, b.y + 13);
      await p.waitForTimeout(400);
      const flag = ((await meridianFlag(p)) ?? '').replace(/\s/g, ' ');
      if (!/^\d+ г\. (до|по) Р\. Х\.: живы? \d+, (наверняка \d+|все — вероятно|вероятно)$/.test(flag)) return fail(`флажок: «${flag}»`);
      // следует за указателем без задержки
      await p.mouse.move(x + 120, b.y + 12);
      await p.waitForTimeout(30);
      const moved = (await meridianFlag(p)) ?? '';
      if (!moved || moved === flag) return fail('меридиан не пошёл за указателем');
      // нажатие и протяжка — меридиана нет
      await p.mouse.down();
      await p.mouse.move(x + 60, b.y + 60, { steps: 5 });
      await p.waitForTimeout(350);
      const during = await meridianFlag(p);
      await p.mouse.up();
      if (during) return fail(`при протяжке меридиан стоит: «${during}»`);
      // ушёл с линейки на небо — меридиан снят сразу
      await p.mouse.move(x, b.y + 12);
      await p.waitForTimeout(400);
      await p.mouse.move(x, b.y + 300);
      await p.waitForTimeout(30);
      if (await meridianFlag(p)) return fail('меридиан остался после ухода с линейки');
      return pass(flag);
    },
  },
  {
    n: 71,
    title: 'D13 мышью: меридиан над полосой времени — через 250 мс; при протяжке рамки полосы его нет',
    run: async (p) => {
      const s = (await p.locator('.strip canvas').boundingBox())!;
      const x = s.x + s.width * 0.3;
      await p.mouse.move(x, s.y + s.height * 0.6);
      await p.waitForTimeout(100);
      if (await meridianFlag(p)) return fail('меридиан появился раньше 250 мс');
      await p.waitForTimeout(300);
      if (!(await meridianFlag(p))) return fail('меридиан над полосой не появился');
      await p.mouse.down();
      await p.mouse.move(x + 80, s.y + s.height * 0.6, { steps: 6 });
      await p.waitForTimeout(350);
      const during = await meridianFlag(p);
      await p.mouse.up();
      return during ? fail(`при протяжке полосы меридиан стоит: «${during}»`) : pass();
    },
  },
  {
    n: 72,
    title: 'D14 мышью: флажок «ярусы эпох» сдвигает небо вниз, а не закрывает; отрезок царя — подсказка со стихом, щелчок выбирает',
    run: async (p) => {
      await go(p, '#/ezekiya');
      const v0 = await view(p);
      const sel0 = ((await p.locator('.sky').getAttribute('data-sel')) ?? '').split(' ').map(Number);
      await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
      await p.waitForTimeout(900);
      const v1 = await view(p);
      const dt = v1.t - v0.t;
      if (dt < 60) return fail(`верх неба сдвинулся на ${dt.toFixed(0)} px`);
      const sel1 = ((await p.locator('.sky').getAttribute('data-sel')) ?? '').split(' ').map(Number);
      // звезда ушла вниз вместе с небом (или осталась видна, если бы ушла за край)
      if (Math.abs(sel1[1] - sel0[1] - dt) > 6 && sel1[1] < v1.t) return fail(`звезда Езекии: ${sel0[1].toFixed(0)} → ${sel1[1].toFixed(0)} при сдвиге ${dt.toFixed(0)}`);
      const bar = await barNear(p, /Манассия[\s\S]*Царствовал/);
      if (!bar) return fail('отрезок Манассии в ярусе «Цари Иудеи» не отозвался');
      await p.waitForTimeout(600);
      const t = await tipNow(p);
      if (!t?.shown) return fail('подсказка отрезка не показана');
      if (!/ок\.\s*\d+–⁠?\d+\s*гг\.\s*до\s*Р\.\s*Х\./.test(t.text)) return fail(`в подсказке нет годов: «${t.text}»`);
      if (!/«[^»]+» \(4\s*Цар\s*21:1\)/.test(t.text)) return fail(`в подсказке нет стиха: «${t.text}»`);
      const cls = await p.locator('.sky canvas').getAttribute('class');
      if (!/\bhot\b/.test(cls ?? '')) return fail('над отрезком курсор не «pointer»');
      await p.mouse.click(bar.x, bar.y);
      await p.waitForTimeout(1200);
      return hashId(p) === bar.id ? pass(`${dt.toFixed(0)} px; ${bar.id}`) : fail(`щелчок по отрезку выбрал «${hashId(p)}», а не ${bar.id}`);
    },
  },
  {
    n: 73,
    title: 'D14: пустые ярусы свёрнуты (эпоха патриархов ниже эпохи царей); одна кнопка — одно состояние',
    run: async (p) => {
      await go(p, '#/avraam~e1', 2600);
      const a = await view(p);
      await go(p, '#/ezekiya~e1', 2600);
      const e = await view(p);
      if (!(a.t < e.t - 40)) return fail(`верх неба: у Авраама ${a.t.toFixed(0)}, у Езекии ${e.t.toFixed(0)} — пустые ярусы не свёрнуты`);
      // «Эпохи» открывает только панель, флажок включает и выключает только ярусы
      // адрес без полей вида ярусов не трогает: выключить флажком
      await go(p, '#/david', 2000);
      if (await p.locator('.sky[data-tiers]').count()) {
        await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
        await p.waitForTimeout(600);
      }
      await p.locator('.skyctl .view-toggle').click();
      const epochs = p.locator('.skyctl button', { hasText: 'Эпохи' });
      await epochs.click();
      await p.waitForTimeout(500);
      if ((await epochs.getAttribute('aria-pressed')) !== 'true') return fail('«Эпохи» не нажата при открытой панели');
      if (await p.locator('.sky[data-tiers]').count()) return fail('«Эпохи» включила ярусы');
      await p.locator('.skyctl').getByText('ярусы эпох', { exact: true }).click();
      await p.waitForTimeout(500);
      if (!(await p.locator('.sky[data-tiers="on"]').count())) return fail('флажок не включил ярусы');
      await p.locator('.sheet .close').first().click();
      await p.waitForTimeout(500);
      if (!(await p.locator('.sky[data-tiers="on"]').count())) return fail('закрытие панели выключило ярусы');
      // щелчок по «×» панели — вне органов неба: лист «Вид» закрылся, открыть снова
      if (!(await p.locator('.viewpop').count())) await p.locator('.skyctl .view-toggle').click();
      if ((await epochs.getAttribute('aria-pressed')) === 'true') return fail('«Эпохи» осталась нажатой без панели');
      return pass(`верх неба ${a.t.toFixed(0)} и ${e.t.toFixed(0)} px`);
    },
  },
  {
    n: 74,
    title: 'D14 пальцем, 390 × 844: касание отрезка царя выбирает его',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await go(p, '#/ezekiya~e1', 2800);
      const bar = await barNear(p, /Манассия[\s\S]*Царствовал/);
      if (!bar) return fail('отрезок Манассии не найден');
      await p.touchscreen.tap(bar.x, bar.y);
      await p.waitForTimeout(1400);
      return hashId(p) === bar.id ? pass() : fail(`касание выбрало «${hashId(p)}»`);
    },
  },
  {
    n: 75,
    title: 'E10 мышью и клавиатурой: «Все N на небе» — строка «Отмечено N лиц по запросу «Иосиф»»; Escape и «Снять» снимают',
    run: async (p) => {
      const pinAll = async (how: 'mouse' | 'key') => {
        await p.click('#find');
        await p.fill('#find', 'Иосиф');
        await p.waitForTimeout(400);
        if (how === 'mouse') await p.locator('.results .cmdrow.all').first().click();
        else {
          // строка «Все N на небе» — первой, курсор по умолчанию — на лучшем лице: стрелка вверх, Enter
          await p.keyboard.press('ArrowUp');
          await p.keyboard.press('Enter');
        }
        await p.waitForTimeout(1600);
      };
      await pinAll('mouse');
      const bar = p.locator('.sky .pinbar');
      if (!(await bar.count())) return fail('нет строки отметок');
      const txt = (await bar.innerText()).replace(/\s/g, ' ');
      const m = /Отмечено (\d+) (лицо|лица|лиц) по запросу «Иосиф»/.exec(txt);
      if (!m || Number(m[1]) < 5) return fail(`строка: «${txt}»`);
      await p.locator('.sky .pinbar button', { hasText: 'Снять' }).click();
      await p.waitForTimeout(300);
      if (await bar.count()) return fail('«Снять» не сняло отметки');
      await pinAll('key');
      if (!(await bar.count())) return fail('с клавиатуры отметки не поставлены');
      // фокус уходит из поля поиска; Escape снимает отметки
      await p.keyboard.press('Tab');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      return (await bar.count()) ? fail('Escape не снял отметки') : pass(`${m[1]} отметок`);
    },
  },
  {
    n: 76,
    title: 'E10 пальцем, 390 × 844: отметки одноимённых и «Снять»',
    view: { width: 390, height: 844, touch: true },
    run: async (p) => {
      await p.locator('#find').tap();
      await p.fill('#find', 'Иосиф');
      await p.waitForTimeout(400);
      await p.locator('.results .cmdrow.all').first().tap();
      await p.waitForTimeout(1600);
      const bar = p.locator('.sky .pinbar');
      if (!(await bar.count())) return fail('нет строки отметок');
      const b = (await bar.boundingBox())!;
      if (b.x < 0 || b.x + b.width > 390) return fail(`строка отметок выходит за край: ${b.x.toFixed(0)}…${(b.x + b.width).toFixed(0)}`);
      await p.locator('.sky .pinbar button', { hasText: 'Снять' }).tap();
      await p.waitForTimeout(300);
      return (await bar.count()) ? fail('«Снять» не сняло отметки') : pass();
    },
  },
  {
    n: 77,
    title: 'E11 мышью: над звездой — курсор pointer и подсказка через 120 мс, не на звезде и в пределах неба; при сдвиге прячется',
    run: async (p) => {
      await go(p, '#/david');
      const b = await canvasBox(p);
      const st = await starNear(p, b.x + b.width * 0.35, b.y + b.height * 0.5);
      if (!st) return fail('не нашлось звезды');
      // новая подсказка «холодная»: уйти с неба и вернуться
      await p.mouse.move(b.x + b.width / 2, b.y + 5);
      await p.waitForTimeout(700);
      await p.mouse.move(st.x, st.y);
      await p.waitForTimeout(30);
      const early = await tipNow(p);
      if (!early) return fail('подсказки нет в разметке');
      if (early.shown) return fail('подсказка видна раньше 120 мс');
      await p.waitForTimeout(250);
      const t = await tipNow(p);
      if (!t?.shown) return fail('подсказка не появилась');
      if (!/\bhot\b/.test((await p.locator('.sky canvas').getAttribute('class')) ?? '')) return fail('над звездой курсор не «pointer»');
      const inside = t.box.x >= b.x + 11 && t.box.y >= b.y + 11 && t.box.x + t.box.width <= b.x + b.width - 11 && t.box.y + t.box.height <= b.y + b.height - 11;
      if (!inside) return fail('подсказка выходит за край неба');
      if (st.x > t.box.x - 4 && st.x < t.box.x + t.box.width + 4 && st.y > t.box.y - 4 && st.y < t.box.y + t.box.height + 4) return fail('подсказка лежит на звезде');
      // протяжка — подсказка прячется
      await p.mouse.down();
      await p.mouse.move(st.x + 60, st.y + 20, { steps: 4 });
      await p.waitForTimeout(40);
      const during = await tipNow(p);
      await p.mouse.up();
      return during ? fail('при протяжке подсказка осталась') : pass(`${st.id}, положение ${t.side}`);
    },
  },
  {
    n: 78,
    title: 'E11: у правого и нижнего края неба подсказка встаёт слева или сверху и целиком видна',
    run: async (p) => {
      await go(p, '#/david');
      const b = await canvasBox(p);
      const notes: string[] = [];
      for (const [name, x, y, want] of [
        ['правый край', b.x + b.width - 30, b.y + b.height * 0.35, /^(sw|nw)$/],
        ['нижний край', b.x + b.width * 0.25, b.y + b.height - 30, /^(ne|nw)$/],
      ] as const) {
        const st = await starNear(p, x, y, () => true, 120);
        if (!st) {
          notes.push(`${name}: нет звезды`);
          continue;
        }
        await p.waitForTimeout(250);
        const t = await tipNow(p);
        if (!t?.shown) return fail(`${name}: подсказка не видна`);
        if (!want.test(t.side)) {
          // положение по умолчанию допустимо, только если подсказка там целиком помещается
          const fits = t.box.x + t.box.width <= b.x + b.width - 11 && t.box.y + t.box.height <= b.y + b.height - 11;
          if (!fits) return fail(`${name}: подсказка ${t.side} выходит за край`);
        }
        if (t.box.x < b.x + 11 || t.box.x + t.box.width > b.x + b.width - 11 || t.box.y + t.box.height > b.y + b.height - 11) return fail(`${name}: подсказка обрезана`);
        notes.push(`${name}: ${t.side}`);
      }
      return pass(notes.join('; '));
    },
  },
  {
    n: 79,
    title: 'E11: на обзоре подсказки только у звёзд величины 0–3',
    run: async (p) => {
      const b = await canvasBox(p);
      const v = await view(p);
      if (v.ky >= 5) return fail(`не обзор: полоса ${v.ky.toFixed(1)} px`);
      const seen = new Set<string>();
      for (let y = b.y + v.t + 10; y < b.y + b.height - 150; y += 7)
        for (let x = b.x + 40; x < b.x + b.width * 0.6; x += 19) {
          await p.mouse.move(x, y);
          const t = await tipNow(p);
          if (t?.kind === 'star') seen.add(t.id);
        }
      if (!seen.size) return fail('ни одна звезда не отозвалась');
      const small = [...seen].filter((id) => magnitude(id) > 3);
      return small.length ? fail(`отозвались мелкие: ${small.slice(0, 5).join(', ')}`) : pass(`${seen.size} звёзд`);
    },
  },
];
