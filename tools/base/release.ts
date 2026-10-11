/**
 * Номер выпуска и журнал изменений записи (02 § 8.2; 09 § 5.4; К-12).
 *
 *   - номер выпуска — вида `2026.10.2` (год, месяц, порядковый номер выпуска в месяце); общий для кода, страниц и данных;
 *   - у переадресации — поле `release`: с какого выпуска она действует. Строка без номера получает номер того выпуска,
 *     в котором вышла впервые (`stampRelease`), и дальше его не меняет;
 *   - `changes.json` выпуска: номер записи → что изменилось с прошлого выпуска (добавлено; изменено поле — какое;
 *     переадресовано — куда; снято — почему). Строится по отпечаткам допущенных записей двух выпусков (`digests.json`).
 */
import { createHash } from 'node:crypto';
import { canon } from './project.ts';
import { records, type Admission, type Rec } from './admit.ts';
import type { Base } from './migrate.ts';
import type { Redirect } from './types.ts';

export const RELEASE_RE = /^\d{4}\.(?:[1-9]|1[0-2])\.[1-9]\d*$/;
export const releaseOk = (r: string) => RELEASE_RE.test(r);

/** Номер записи для журнала: свой номер записи, у записей без номера — ключ допуска (членство, «нет сведений»). */
export function recordId(r: Pick<Rec, 'key' | 'coll' | 'rec'>): string {
  if (r.coll === 'cite') return r.key.replace(/^reading:/, '');
  if (r.coll === 'redirect') return r.key;
  return typeof r.rec?.id === 'string' && !r.rec.id.startsWith('?') ? r.rec.id : r.key;
}

const h12 = (x: unknown) => createHash('sha256').update(canon(x)).digest('hex').slice(0, 12);

/** Отпечатки выпуска: номер записи → вид и отпечаток каждого поля (служебный prov не входит). */
export interface Digests { release: string; records: Record<string, { coll: string; f: Record<string, string> }> }

export function digests(base: Base, A: Admission, release: string): Digests {
  const out: Digests['records'] = {};
  for (const r of records(base)) {
    if (!A.okKey(r.key)) continue;
    const rec = A.view(r.rec) as Record<string, unknown>;
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec ?? {})) if (k !== 'prov' && !(r.coll === 'actor' && k === 'facts')) f[k] = h12(v);
    out[recordId(r)] = { coll: r.coll, f };
  }
  return { release, records: out };
}

/** Что изменилось в записи с прошлого выпуска. */
export type Change =
  | { what: 'added' }
  | { what: 'changed'; fields: string[] }
  | { what: 'redirected'; to: string[] }
  | { what: 'removed'; why: string };

export interface Changes { release: string; since: string | null; items: Record<string, Change> }

/** Почему запись не вышла в этом выпуске: по статусу допуска. */
export function whyNotAdmitted(base: Base, A: Admission, id: string): string {
  const r = records(base).find((x) => recordId(x) === id);
  if (!r) return 'записи больше нет';
  const s = A.status.get(r.key);
  if (s?.status === 'quarantine') return 'карантин';
  if (s?.stale) return `подпись устарела: ${s.stale}`;
  if (A.rights.has(r.key)) return `права источника: ${A.rights.get(r.key)!.join(', ')}`;
  if (s?.status !== 'checked') return 'не проверена';
  return 'не допущена запись, без которой её не показать';
}

/**
 * Журнал изменений между двумя выпусками. Переадресация, которая действует с этого выпуска, пишется у выбывшего
 * номера как «переадресовано — куда», а не как «снято».
 */
export function buildChanges(prev: Digests | null, cur: Digests, redirects: Redirect[], why: (id: string) => string): Changes {
  const items: Record<string, Change> = {};
  const was = prev?.records ?? {};
  const red = new Map(redirects.filter((r) => (r.release ?? cur.release) === cur.release).map((r) => [r.from, r.to]));
  for (const [id, d] of Object.entries(cur.records)) {
    if (d.coll === 'redirect') continue;
    const p = was[id];
    if (!p) items[id] = { what: 'added' };
    else {
      const fields = [...new Set([...Object.keys(p.f), ...Object.keys(d.f)])].filter((k) => p.f[k] !== d.f[k]).sort();
      if (fields.length) items[id] = { what: 'changed', fields };
    }
  }
  for (const [id, p] of Object.entries(was)) {
    if (p.coll === 'redirect' || cur.records[id]) continue;
    items[id] = red.has(id) ? { what: 'redirected', to: red.get(id)! } : { what: 'removed', why: why(id) };
  }
  return { release: cur.release, since: prev?.release ?? null, items };
}

/** Строка «Что изменилось в этой записи» (08 § 16.3; 07 § 26) по журналу выпуска. */
export function changeLine(ch: Changes, id: string): string {
  const c = ch.items[id];
  const since = ch.since ? `с выпуска ${ch.since}` : 'в первом выпуске';
  if (!c) return ch.since ? `Не изменилась с выпуска ${ch.since}.` : `Вышла в выпуске ${ch.release}.`;
  switch (c.what) {
    case 'added': return ch.since ? `Добавлена в выпуске ${ch.release}.` : `Вышла в выпуске ${ch.release}.`;
    case 'changed': return `Изменена в выпуске ${ch.release} (${since}): ${c.fields.join(', ')}.`;
    case 'redirected': return `С выпуска ${ch.release} номер ведёт на ${c.to.join(', ')}.`;
    case 'removed': return `Снята в выпуске ${ch.release}: ${c.why}.`;
  }
}

/** Строкам переадресации без номера выпуска — номер этого выпуска; прежние номера не меняются. */
export function stampRelease(redirects: Redirect[], release: string): { items: Redirect[]; stamped: number } {
  if (!releaseOk(release)) throw new Error(`номер выпуска «${release}» — нужен вид 2026.10.2`);
  let stamped = 0;
  const items = redirects.map((r) => (r.release ? r : (stamped++, { ...r, release })));
  return { items, stamped };
}
