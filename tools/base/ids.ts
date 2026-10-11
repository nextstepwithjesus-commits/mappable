/**
 * Выданные номера записей — таблица base/ids.json (02 § 3.3.1; задачи К-1, К-16).
 *
 * Номер выдаётся один раз и хранится, а не вычисляется. Таблица переживает пересборку base/ из data/: пересборка её не
 * меняет, только дописывает новые номера. Номер выбывшей записи второй раз не выдаётся.
 *
 * Ключ сопоставления — содержательный, не позиционный:
 *   - утверждение — `fact:<лицо>|<поле>|<отпечаток значения и стихов>`; родство словами — `kin:<от>|<к>|<слово>|<отпечаток стихов>`.
 *     Ключ считается по записи, какой её даёт data/ до шагов правки (данные Н-9): шаг, который меняет текст или переносит
 *     запись к другому лицу, номера не меняет. Запись, которую создал шаг, получает ключ этого шага (`…|<шаг>`);
 *   - ребро происхождения — по концам: `origin:<ребёнок>|<родитель>|<роль>|<p|o>`, номер смысловой `o-<родитель>--<ребёнок>`
 *     (03 § 21.1); смена конца — новая запись и новый номер. Ребро без названного родителя — `o-<число>`;
 *   - эпоха — `epoch:<прежний номер>`, номер `era-<прежний номер>` (02 § 3.3.2); на прежний номер — строка переадресации.
 * Совпадение ключей двух записей — ошибка сборки.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canon } from './project.ts';
import type { Base } from './migrate.ts';
import type { Redirect } from './types.ts';

export const IDS_FILE = 'ids.json';
export type IdKind = 'origin' | 'fact' | 'kin' | 'epoch' | 'anchor';
export interface IdEntry {
  id: string;
  kind: IdKind;
  /** Содержательный ключ сопоставления. */
  key: string;
  /** Дата выдачи. */
  at: string;
  /** «Действует» или «выбыл»; куда переадресован — только в redirects.json. */
  state: 'active' | 'retired';
}
export const PREFIX: Record<IdKind, string> = { origin: 'o-', fact: 'a-', kin: 'k-', epoch: 'era-', anchor: 'an-' };
export const EPOCH_REDIRECT_REASON = 'номер эпохи получил префикс era- (02 § 3.3.2; К-1)';
export const ANCHOR_REDIRECT_REASON = 'номер опоры получил префикс an- (02 § 3.3.1; К-1, К-10)';
export const ORIGIN_REDIRECT_REASON = 'у ребра сменился конец или номер лица — новая запись (02 § 3.3.1 [4.2]; К-12)';

const h16 = (x: unknown) => createHash('sha256').update(canon(x)).digest('hex').slice(0, 16);
const short = (id: string) => id.replace(/^p-/, '');

/** Ключи сопоставления по записи. */
export const factKey = (actor: string, f: { field: string; value: unknown; cert?: unknown }, step?: string) =>
  `fact:${actor}|${f.field}|${h16({ value: f.value, cert: f.cert ?? null })}${step ? `|${step}` : ''}`;
export const kinKey = (k: { from: string; to: string; rel: string; refs: unknown; cert?: unknown }, step?: string) =>
  `kin:${k.from}|${k.to}|${k.rel}|${h16({ refs: k.refs, cert: k.cert ?? null })}${step ? `|${step}` : ''}`;
export const originKey = (o: { child: string; parent?: string; unnamedParent?: { words: string }; role: string; primary: boolean }) =>
  `origin:${o.child}|${o.parent ?? `?${o.unnamedParent?.words ?? ''}`}|${o.role}|${o.primary ? 'p' : 'o'}`;
export const originId = (o: { child: string; parent?: string }) => (o.parent ? `o-${short(o.parent)}--${short(o.child)}` : undefined);

// ---------- файл ----------

export function loadIds(dir: string): IdEntry[] {
  const f = join(dir, IDS_FILE);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).items : [];
}

/** Файл таблицы: одна строка — один номер (таблица большая, так её удобно сравнивать). */
export function serializeIds(items: IdEntry[]): string {
  const head = {
    schema: 1,
    title: 'Выданные номера (02 § 3.3.1; К-1, К-16)',
    note: 'Пишет только npm run -s base, и только дописывает: выданный номер не меняется и второй раз не выдаётся. Руками не править. Куда переадресован выбывший номер — base/redirects.json.',
  };
  const lines = items.map((e) => JSON.stringify({ id: e.id, kind: e.kind, key: e.key, at: e.at, state: e.state }));
  const h = JSON.stringify(head, null, 1).replace(/\n}$/, '');
  return `${h},\n "items": [\n${lines.map((l) => `  ${l}`).join(',\n')}\n ]\n}\n`;
}

/** Дописывает таблицу; файл переписывается, только если появились новые номера. Возвращает, записан ли файл. */
export function saveIds(items: IdEntry[], dir: string): boolean {
  const f = join(dir, IDS_FILE);
  const text = serializeIds(items);
  if (existsSync(f) && readFileSync(f, 'utf8') === text) return false;
  writeFileSync(f, text);
  return true;
}

/** Переадресация только дописывается (К-16): строки из базы, которых в файле ещё нет (по прежнему номеру), — в конец. */
export function mergeRedirects(onDisk: Redirect[], built: Redirect[]): Redirect[] {
  const have = new Set(onDisk.map((r) => r.from));
  return [...onDisk, ...built.filter((r) => !have.has(r.from) && (have.add(r.from), true))];
}

// ---------- выдача ----------

export class Issuer {
  readonly table: IdEntry[];
  readonly added: IdEntry[] = [];
  private byKey = new Map<string, IdEntry>();
  private byId = new Map<string, IdEntry>();
  /** Ключи, уже занятые записями этой сборки: совпадение — ошибка. */
  private used = new Map<string, string>();
  private next = new Map<string, number>();
  readonly errors: string[] = [];

  constructor(table: IdEntry[], readonly at: string) {
    this.table = [...table];
    for (const e of table) {
      if (this.byKey.has(e.key)) this.errors.push(`в ${IDS_FILE} ключ повторяется: ${e.key}`);
      if (this.byId.has(e.id)) this.errors.push(`в ${IDS_FILE} номер повторяется: ${e.id}`);
      this.byKey.set(e.key, e);
      this.byId.set(e.id, e);
      const m = /^([a-z]+-)(\d+)$/.exec(e.id);
      if (m) this.next.set(m[1], Math.max(this.next.get(m[1]) ?? 1, Number(m[2]) + 1));
    }
  }

  /** Номер записи по ключу: выданный — тот же; новый — смысловой (`want`) или следующий по порядку. */
  issue(kind: IdKind, key: string, where: string, want?: string): string {
    const prev = this.used.get(key);
    if (prev !== undefined) {
      this.errors.push(`совпадение ключей сопоставления: ${key} (${prev}; ${where})`);
      return this.byKey.get(key)?.id ?? '';
    }
    this.used.set(key, where);
    const have = this.byKey.get(key);
    if (have) {
      if (have.kind !== kind) this.errors.push(`ключ ${key} выдан виду ${have.kind}, а запись — ${kind}`);
      if (want && have.id !== want) this.errors.push(`ключ ${key}: выдан номер ${have.id}, а запись требует ${want}`);
      return have.id;
    }
    const prefix = PREFIX[kind];
    let id = want;
    if (!id) {
      const n = this.next.get(prefix) ?? 1;
      this.next.set(prefix, n + 1);
      id = `${prefix}${n}`;
    }
    if (this.byId.has(id)) {
      this.errors.push(`номер ${id} уже выдан записи с другим ключом (${this.byId.get(id)!.key}); выданный номер второй раз не выдаётся — ${key}`);
      return id;
    }
    const e: IdEntry = { id, kind, key, at: this.at, state: 'active' };
    this.byKey.set(key, e);
    this.byId.set(id, e);
    this.table.push(e);
    this.added.push(e);
    return id;
  }

  has(id: string) {
    return this.byId.has(id);
  }

  /** Выданная запись таблицы по номеру. */
  entryById(id: string): IdEntry | undefined {
    return this.byId.get(id);
  }

  /** Выданная запись таблицы по ключу. */
  entry(key: string): IdEntry | undefined {
    return this.byKey.get(key);
  }

  /** Номер выбывает (запись сменила ключ): строка таблицы остаётся, номер второй раз не выдаётся. */
  retire(id: string) {
    const e = this.byId.get(id);
    if (!e || e.state === 'retired') return;
    const r: IdEntry = { ...e, state: 'retired' };
    this.byId.set(id, r);
    this.byKey.set(e.key, r);
    const i = (this.table as IdEntry[]).indexOf(e);
    if (i >= 0) (this.table as IdEntry[])[i] = r;
    this.retired.push(id);
  }
  readonly retired: string[] = [];

  /** Номер, который запись принесла сама (шаг правки дал его явно): заносится в таблицу, если его там нет. */
  claim(kind: IdKind, id: string, key: string, where: string) {
    const have = this.byId.get(id);
    if (have) {
      if (have.kind !== kind) this.errors.push(`номер ${id} выдан виду ${have.kind}, а запись — ${kind} (${where})`);
      return;
    }
    if (!id.startsWith(PREFIX[kind])) this.errors.push(`номер ${id} без префикса ${PREFIX[kind]} (${where})`);
    this.issue(kind, key, where, id);
  }
}

const ISSUERS = new WeakMap<Base, Issuer>();
export const issuerOf = (base: Base) => ISSUERS.get(base);

/** id — первым полем записи: так номер виден в файле. */
const withId = <T extends object>(id: string, x: T): T => {
  const { id: _old, ...rest } = x as any;
  return { id, ...rest } as T;
};

/** Заготовка номера на время шагов: «?» и ключ. Шаги переносят её вместе с записью (и в копиях `{ ...f }`). */
const PENDING = '?';
const pending = (key: string) => `${PENDING}${key}`;

/**
 * Начало выдачи — сразу после точного переноса, до шагов правки: утверждения и родство словами получают заготовку номера
 * с ключом записи из data/ (данные Н-9). Сам номер выдаётся в конце (`finishIds`) — только записям, которые остались
 * после шагов: удалённая шагом запись номера не получает.
 */
export function startIds(base: Base, table: IdEntry[], at: string): Issuer {
  const iss = new Issuer(table, at);
  ISSUERS.set(base, iss);
  for (const v of base.volumes) for (const a of v.actors) a.facts = a.facts.map((f) => (f.id ? f : withId(pending(factKey(a.id, f)), f)));
  base.kin = base.kin.map((k) => (k.id ? k : withId(pending(kinKey(k)), k)));
  // ребро помнит свои концы по data/ (К-12): если шаг сменит конец, прежний номер получит переадресацию на новый
  base.origins = base.origins.map((o) => (o.id ? o : withId(pending(originKey(o)), o)));
  return iss;
}

/** После каждого шага правки: записи, которые шаг создал без номера, получают ключ этого шага. */
export function tagNew(base: Base, step: string) {
  if (!ISSUERS.has(base)) return;
  for (const v of base.volumes) {
    for (const a of v.actors) if (a.facts.some((f) => !f.id)) a.facts = a.facts.map((f) => (f.id ? f : withId(pending(factKey(a.id, f, step)), f)));
  }
  if (base.kin.some((k) => !k.id)) base.kin = base.kin.map((k) => (k.id ? k : withId(pending(kinKey(k, step)), k)));
}

/**
 * Закрепить номера до шагов, которые пишутся после появления таблицы (шаги Д-партий, corrections-d.ts): все записи
 * получают номера сейчас, в том же порядке, в каком их выдал бы конец выдачи. Тогда сборка с пустой таблицей
 * повторяет таблицу на диске: записи, добавленные поздним шагом, получают номера после прежних (а не в середине),
 * а снятая поздним шагом запись успевает получить свой номер и выбывает с переадресацией (02 § 3.3.1; К-16).
 */
export function freezeIds(base: Base) {
  // та же выдача, что в конце (все виды и в том же порядке); второй вызов в конце закреплённые номера только сверяет
  finishIds(base);
}

/**
 * Конец выдачи — после всех шагов: номера утверждений и родства по заготовкам, рёбра по концам, эпохи с префиксом era- и
 * переадресация с прежних номеров эпох. Номер, который шаг дал записи явно, заносится в таблицу. Ошибки (совпадение
 * ключей, повтор номера) — в `issuer.errors`.
 */
export function finishIds(base: Base): Issuer | undefined {
  const iss = ISSUERS.get(base);
  if (!iss) return undefined;
  tagNew(base, 'после шагов');
  // один номер — у одной записи: шаг, размноживший запись с закреплённым номером (freezeIds), — ошибка, как совпадение ключей
  const claimed = new Map<string, string>();
  const fix = <T extends { id?: string }>(kind: IdKind, x: T, where: string): T => {
    const id = x.id!;
    if (id.startsWith(PENDING)) return withId(iss.issue(kind, id.slice(1), where), x);
    if (claimed.has(id)) iss.errors.push(`совпадение ключей сопоставления: номер ${id} стоит у двух записей (${claimed.get(id)}; ${where})`);
    claimed.set(id, where);
    iss.claim(kind, id, `${kind}:${id}`, where);
    return x;
  };
  for (const v of base.volumes) for (const a of v.actors) a.facts = a.facts.map((f) => fix('fact', f, `${a.id} § ${f.sec} ${f.field}`));
  base.kin = base.kin.map((k) => fix('kin', k, `${k.from} — ${k.to}`));
  // рёбра — по нынешним концам. Конец сменился (смена родителя, ребёнка, роли или номера лица) — новая запись и новый
  // номер; прежний номер, если он выдан и больше ни у кого не стоит, выбывает со строкой переадресации (02 § 3.3.1; К-12)
  const moved: { old: string; key: string }[] = [];
  base.origins = base.origins.map((o) => {
    const where = `${o.child} ← ${o.parent ?? '?'}`;
    const cur = originKey(o);
    if (o.id && !o.id.startsWith(PENDING)) {
      // номер закреплён до поздних шагов (freezeIds), а конец с тех пор сменился — как у заготовки: новая запись
      const had = iss.entryById(o.id);
      if (!had || had.kind !== 'origin' || !had.key.includes('|') || had.key === cur) return fix('origin', o, where);
      moved.push({ old: had.key, key: cur });
      return withId(iss.issue('origin', cur, where, originId(o)), o);
    }
    if (o.id && o.id.slice(1) !== cur) moved.push({ old: o.id.slice(1), key: cur });
    return withId(iss.issue('origin', cur, where, originId(o)), o);
  });
  const usedIds = new Set(base.origins.map((o) => o.id));
  for (const m of moved) {
    const was = iss.entry(m.old);
    const now = iss.entry(m.key);
    if (!was || !now || was.kind !== 'origin' || usedIds.has(was.id)) continue;
    iss.retire(was.id);
    if (!base.redirects.some((r) => r.from === was.id)) base.redirects.push({ from: was.id, to: [now.id], reason: ORIGIN_REDIRECT_REASON, refs: [], at: iss.at });
  }
  base.epochs = base.epochs.map((e) => {
    if (typeof e.id === 'string' && e.id.startsWith(PREFIX.epoch)) {
      iss.claim('epoch', e.id, `epoch:${e.id}`, e.id);
      return e;
    }
    const old = e.id as string;
    const id = iss.issue('epoch', `epoch:${old}`, old, `${PREFIX.epoch}${old}`);
    if (!base.redirects.some((r) => r.from === old)) base.redirects.push({ from: old, to: [id], reason: EPOCH_REDIRECT_REASON, refs: [], at: iss.at });
    return { ...e, id };
  });
  // опоры (02 § 3.3.1; К-1, К-10): номер `an-<прежний>`, на прежний — строка переадресации
  if (base.anchors?.anchors) {
    base.anchors = {
      ...base.anchors,
      anchors: base.anchors.anchors.map((a: any) => {
        if (typeof a.id === 'string' && a.id.startsWith(PREFIX.anchor)) {
          iss.claim('anchor', a.id, `anchor:${a.id}`, a.id);
          return a;
        }
        const old = a.id as string;
        const id = iss.issue('anchor', `anchor:${old}`, old, `${PREFIX.anchor}${old}`);
        if (!base.redirects.some((r) => r.from === old)) base.redirects.push({ from: old, to: [id], reason: ANCHOR_REDIRECT_REASON, refs: [], at: iss.at });
        return { ...a, id };
      }),
    };
  }
  // ссылки на эпоху во времени прежнего вида — на новый номер (прежний ведёт сюда же через переадресацию)
  const epochIds = new Set(base.epochs.map((e) => e.id as string));
  for (const c of base.chrono as { chrono: any }[]) {
    const ep = c.chrono?.epoch;
    if (typeof ep === 'string' && !epochIds.has(ep) && epochIds.has(`${PREFIX.epoch}${ep}`)) c.chrono = { ...c.chrono, epoch: `${PREFIX.epoch}${ep}` };
  }
  return iss;
}
