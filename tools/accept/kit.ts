/**
 * Общее для сценариев приёмки (tools/accept.ts и tools/accept/*.ts): результат проверки, поиск лица, чтение карточки.
 */
import type { Page } from 'playwright';

export type Check = { ok: boolean; why: string };
export const pass = (why = ''): Check => ({ ok: true, why });
export const fail = (why: string): Check => ({ ok: false, why });

export async function find(p: Page, q: string) {
  await p.click('#find');
  await p.fill('#find', q);
  await p.waitForTimeout(250);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1500);
}
/** Лицо из адреса: «#/david» и «#/david~y-1010~w240~…» (D8: поля вида идут после «~»). */
export const hashId = (p: Page) => decodeURIComponent(new URL(p.url()).hash.replace(/^#\/?/, '').split(/[?~]/)[0]);
export const folioText = (p: Page) => p.locator('.folio').innerText();
export const secText = async (p: Page, n: number) => ((await p.locator(`.folio #sec-${n}`).count()) ? p.locator(`.folio #sec-${n}`).innerText() : '');

/** Окно сценария; по умолчанию 1440 × 900, мышь. */
export type View = { width: number; height: number; touch?: boolean };
/** Сценарий: номер, название, окно и проверка. */
export type Scenario = { n: number; title: string; view?: View; run: (p: Page) => Promise<Check> };

/**
 * Показ неба через лист «Показ» (этап 11, решение 81): «изменить» в строке показа, вид показа («Всё небо», «Линии Мессии»,
 * «Ключевые лица», «Набор»), на телефоне — «Показать N лиц», на широком экране лист применяется сразу и закрывается «×».
 * Прежде эти показы включались флажком «только линии Мессии» и переключателем «все лица | набор» у органов неба.
 */
export async function pickShow(p: Page, kind: 'Всё небо' | 'Линии Мессии' | 'Ключевые лица' | 'Набор', o: { touch?: boolean; ms?: number } = {}) {
  const hit = (l: ReturnType<Page['locator']>) => (o.touch ? l.tap() : l.click());
  await hit(p.locator('.sky .showbar .sb-cmd[data-cmd="sheet"]').first());
  await p.waitForTimeout(500);
  // этап 13 (решение 110): показ линий называется «Родословие Иисуса Христа (Мф 1, Лк 3)»
  await hit(p.locator('.showsheet .ss-kind', { hasText: kind === 'Линии Мессии' ? 'Родословие Иисуса Христа' : kind }).first());
  await p.waitForTimeout(300);
  const apply = p.locator('.showsheet .ss-apply button');
  if (await apply.count()) await hit(apply);
  else if (await p.locator('.showsheet').count()) await hit(p.locator('.showsheet .sheet-head .close').first());
  await p.waitForTimeout(o.ms ?? 1500);
}

/**
 * Небо встало (этап 21): места звёзд и рукоятки шагов кадра (canvas[data-stars], [data-handles]) не меняются три замера
 * подряд — перелёт и переход после шага карты кончились. Прежние сценарии ждали ровно 1,1–1,3 с, а небо после шага
 * следует за раскрытым (решение 207) — под нагрузкой машины дольше.
 */
export async function skySettled(p: Page) {
  let last = '';
  let same = 0;
  for (let k = 0; k < 40 && same < 3; k++) {
    await p.waitForTimeout(150);
    const now = await p.evaluate(() => {
      const c = document.querySelector<HTMLElement>('.sky > canvas');
      return `${c?.dataset.stars ?? ''}|${c?.dataset.handles ?? ''}|${c?.dataset.trans ?? ''}`;
    });
    if (now === last) same++;
    else {
      same = 0;
      last = now;
    }
  }
}
