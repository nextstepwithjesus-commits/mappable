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
export const hashId = (p: Page) => decodeURIComponent(new URL(p.url()).hash.replace(/^#\/?/, '').split('?')[0]);
export const folioText = (p: Page) => p.locator('.folio').innerText();
export const secText = async (p: Page, n: number) => ((await p.locator(`.folio #sec-${n}`).count()) ? p.locator(`.folio #sec-${n}`).innerText() : '');

/** Окно сценария; по умолчанию 1440 × 900, мышь. */
export type View = { width: number; height: number; touch?: boolean };
/** Сценарий: номер, название, окно и проверка. */
export type Scenario = { n: number; title: string; view?: View; run: (p: Page) => Promise<Check> };
