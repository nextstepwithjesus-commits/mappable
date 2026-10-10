/**
 * Положительный допуск в сборку и отпечаток проверки (Д-база, Б-1; этап Д3-1, Д3-2; черновик 09 § 5.2).
 *
 * Сборка берёт запись, только если про неё доказано, что её можно показывать:
 *   - действующий статус = статус записи, а если его нет — статус содержащей записи (утверждение — у лица), затем файла;
 *   - «проверено» = подпись в журнале base/checks.json (или prov.check самой записи) и отпечаток совпал: канонический
 *     JSON записи без служебного prov + отпечатки текста ЕЁ стихов (synodal.tsv), строк brackets.tsv и source-issues.tsv
 *     об этих стихах + версии её источников из base/sources.json. Правка записи или её входа снимает «проверено»,
 *     правка чужого стиха или чужой строки таблицы — нет (02 § 3.1; рецензия данных на 09, № 1);
 *   - уровень «выпуск» (release) — только «проверено»; уровень «проба» (probe) — и черновики, только для прототипов;
 *     карантин — никогда;
 *   - зависимости: утверждение, «нет сведений», время — только при допущенном лице; ребро и родство — оба конца; союз —
 *     оба супруга; членство — лицо и область; линия — каждое лицо и наборы прочтений; переадресация — каждая цель.
 *
 * Одна функция `admission` даёт ответ для всех коллекций сборки (bundle.ts своих фильтров не имеет).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canon } from './project.ts';
import { loadBible } from '../bible.ts';
import { parseRef, verseId } from '../../src/engine/books.ts';
import type { Base } from './migrate.ts';
import type { Check, CheckEntry, CheckInputs, Prov, Status } from './types.ts';

const ROOT = join(import.meta.dirname, '..', '..');
export const CHECKS_FILE = 'checks.json';

export type Level = 'release' | 'probe';
export const LEVEL_WORD: Record<Level, string> = {
  release: 'выпуск: только проверенное',
  probe: 'проба: черновики без проверки — только для прототипов',
};
/** Плашка пробы: сборка уровня «проба» несёт её в каждом файле, убрать её нельзя (09 § 5.2, п. 5). */
export const PROBE_BANNER = 'Данные не проверены: проба';

export type Coll =
  | 'actor' | 'fact' | 'origin' | 'union' | 'kin' | 'reading' | 'area' | 'membership' | 'nodata' | 'chrono' | 'redirect'
  | 'line' | 'epoch';
export const COLLS: Coll[] = ['actor', 'fact', 'origin', 'union', 'kin', 'reading', 'area', 'membership', 'nodata', 'chrono', 'redirect', 'line', 'epoch'];

/** Запись базы для допуска: ключ, вид, сама запись, файл, содержащая запись и ключи записей, без которых её не показать. */
export interface Rec {
  key: string;
  coll: Coll;
  rec: any;
  /** Путь файла от base/: «actors/04-abraham.json», «origins.json», «lines/luke.json». */
  file: string;
  /** Содержащая запись (лицо у утверждения): её явный статус наследуется. */
  parent?: any;
  deps: string[];
}

/**
 * Все записи базы с устойчивыми ключами. Ключ повторяется — к нему добавляется «#2», «#3» по порядку записей
 * (несколько утверждений одного поля у лица: `fact:p-avraam|17|events`, `fact:p-avraam|17|events#2`).
 */
export function records(base: Base): Rec[] {
  const out: Rec[] = [];
  const seen = new Map<string, number>();
  const actorIds = new Set(base.volumes.flatMap((v) => v.actors.map((a) => a.id)));
  const add = (coll: Coll, k: string, rec: any, file: string, deps: (string | undefined | false)[], parent?: any) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    out.push({ key: n > 1 ? `${k}#${n}` : k, coll, rec, file, deps: deps.filter((d): d is string => !!d), ...(parent && { parent }) });
  };
  const A = (id?: string) => id && `actor:${id}`;
  for (const v of base.volumes) {
    const file = `actors/${v.file}`;
    for (const a of v.actors) {
      add('actor', `actor:${a.id}`, a, file, []);
      for (const f of a.facts) add('fact', `fact:${a.id}|${f.sec}|${f.field}`, f, file, [A(a.id), f.field === 'met' && A((f.value as any)?.id)], a);
    }
  }
  for (const o of base.origins) {
    add('origin', `origin:${o.child}|${o.parent ?? '?'}|${o.role}|${o.primary ? 'p' : 'o'}`, o, 'origins.json', [
      A(o.child), A(o.parent), o.reading && `reading:${o.reading.set}`,
    ]);
  }
  for (const u of base.unions) add('union', `union:${u.id}`, u, 'unions.json', [A(u.husband), A(u.wife)]);
  for (const k of base.kin) add('kin', `kin:${k.from}|${k.to}|${k.rel}`, k, 'kin.json', [A(k.from), A(k.to)]);
  for (const r of base.readings) add('reading', `reading:${r.id}`, r, 'readings.json', []);
  for (const a of base.areas) add('area', `area:${a.id}`, a, 'areas.json', [A(a.founder), a.parent && `area:${a.parent}`]);
  for (const m of base.memberships) {
    add('membership', `membership:${m.actor}|${m.area}`, m, 'memberships.json', [A(m.actor), m.area.startsWith('g-') ? `area:${m.area}` : A(m.area)]);
  }
  for (const n of base.nodata) add('nodata', `nodata:${n.actor}|${n.sec}|${n.kind}`, n, 'nodata.json', [A(n.actor)]);
  for (const c of base.chrono) add('chrono', `chrono:${c.actor}`, c, 'chrono.json', [A(c.actor)]);
  for (const r of base.redirects) add('redirect', `redirect:${r.from}`, r, 'redirects.json', r.to.map((t) => (actorIds.has(t) ? A(t) : `redirect:${t}`)));
  for (const [k, l] of Object.entries<any>(base.lines)) {
    add('line', `line:${k}`, l, `lines/${k}.json`, [...(l.persons ?? []).map((s: any) => A(s.id)), ...Object.keys(l.readings ?? {}).map((s) => `reading:${s}`)]);
  }
  for (const e of base.epochs) add('epoch', `epoch:${e.id}`, e, 'epochs.json', [A(e.startRule?.person), A(e.endRule?.person)]);
  return out;
}

// ---------- отпечаток ----------

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/**
 * Текст, от которого зависит запись: стихи synodal.tsv, строки brackets.tsv и source-issues.tsv по стиху. Подпись
 * зависит только от стихов самой записи (02 § 3.1; рецензия данных на 09, № 1): правка чужого стиха или чужой строки
 * таблицы её не снимает. В тестах текст подменяется.
 */
export interface TextEnv {
  verse(id: string): string | undefined;
  /** Строки brackets.tsv, отрезок которых задевает стих (строка целиком, как в файле). */
  brackets(book: string, chapter: number, verse: number): string[];
  /** Строки source-issues.tsv, которые задевают стих. */
  issues(book: string, chapter: number, verse: number): string[];
}

/** Строки таблицы «книга, глава, с стиха, по стих, …» по главам. */
function rowsByChapter(file: string) {
  const m = new Map<string, { from: number; to: number; line: string }[]>();
  for (const line of readFileSync(file, 'utf8').split('\n').slice(1).filter(Boolean)) {
    const [book, ch, from, to] = line.split('\t');
    const k = `${book} ${ch}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push({ from: Number(from), to: Number(to), line });
  }
  return (book: string, chapter: number, verse: number) => (m.get(`${book} ${chapter}`) ?? []).filter((r) => verse >= r.from && verse <= r.to).map((r) => r.line);
}

let envCache: TextEnv | null = null;
export function fileEnv(): TextEnv {
  if (envCache) return envCache;
  const bible = loadBible();
  envCache = {
    verse: (id) => bible.verses.get(id),
    brackets: rowsByChapter(join(ROOT, 'tools', 'bible', 'brackets.tsv')),
    issues: rowsByChapter(join(ROOT, 'tools', 'bible', 'source-issues.tsv')),
  };
  return envCache;
}

/** Стихи, на которые ссылается запись (refs, ref, first, key, all, verse; глава целиком — все её стихи), по порядку. */
export function recordVerses(rec: unknown): { id: string; book: string; chapter: number; verse: number }[] {
  const bible = loadBible();
  const refs = new Set<string>();
  const go = (x: any) => {
    if (Array.isArray(x)) return x.forEach(go);
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if ((k === 'ref' || k === 'first' || k === 'verse') && typeof v === 'string') refs.add(v);
      else if ((k === 'refs' || k === 'key' || k === 'all') && Array.isArray(v)) for (const r of v) if (typeof r === 'string') refs.add(r);
      go(v);
    }
  };
  go(rec);
  const out = new Map<string, { id: string; book: string; chapter: number; verse: number }>();
  for (const r of refs) {
    const p = parseRef(r, bible.chapterLength);
    if (!p) continue;
    const vs = p.chapterOnly
      ? Array.from({ length: bible.chapterLength(p.book, p.chapterOnly) }, (_, i) => ({ book: p.book, chapter: p.chapterOnly!, verse: i + 1 }))
      : p.verses;
    for (const v of vs) out.set(verseId(v), { id: verseId(v), ...v });
  }
  return [...out.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** Запись без служебного prov (на любой глубине: prov обозначений союза тоже служебный); у лица — без утверждений. */
export function content(r: Pick<Rec, 'coll' | 'rec'>): unknown {
  const strip = (x: any): any => {
    if (Array.isArray(x)) return x.map(strip);
    if (!x || typeof x !== 'object') return x;
    return Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'prov').map(([k, v]) => [k, strip(v)]));
  };
  const c = strip(r.rec);
  if (r.coll === 'actor') delete c.facts;
  return c;
}

/** Источники, на которые ссылается запись (поля source и sources с номером из реестра), и всегда src-synodal. */
export function recordSources(rec: unknown, base: Base): string[] {
  const reg = new Set((base.sources ?? []).map((s) => s.id));
  const ids = new Set<string>(['src-synodal']);
  const go = (x: any) => {
    if (Array.isArray(x)) return x.forEach(go);
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if ((k === 'source' || k === 'sources') && (typeof v === 'string' || Array.isArray(v))) {
        for (const s of [v].flat()) if (typeof s === 'string' && (reg.has(s) || s.startsWith('src-'))) ids.add(s);
      }
      go(v);
    }
  };
  go(rec);
  return [...ids].sort();
}

export function inputsOf(r: Pick<Rec, 'coll' | 'rec'>, base: Base, env: TextEnv = fileEnv()): CheckInputs {
  const ver = new Map((base.sources ?? []).map((s) => [s.id, s.version]));
  const vs = recordVerses(content(r));
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    verses: vs.map((v) => v.id),
    text: sha(vs.map((v) => `${v.id}\t${env.verse(v.id) ?? '<нет стиха>'}`).join('\n')),
    brackets: sha(uniq(vs.flatMap((v) => env.brackets(v.book, v.chapter, v.verse))).join('\n')),
    issues: sha(uniq(vs.flatMap((v) => env.issues(v.book, v.chapter, v.verse))).join('\n')),
    sources: Object.fromEntries(recordSources(r.rec, base).map((s) => [s, ver.get(s) ?? '?'])),
  };
}

/** Отпечаток записи: канонический JSON содержимого без prov вместе с версиями входов. */
export function recordHash(r: Pick<Rec, 'coll' | 'rec'>, inputs: CheckInputs): string {
  return sha(canon({ coll: r.coll, record: content(r), inputs }));
}

/** Почему подпись не сходится: что изменилось со времени проверки. */
export function staleReason(check: Check, now: CheckInputs): string {
  const was = check.inputs;
  if (!was) return 'отпечаток не совпал (входы проверки не записаны)';
  const why: string[] = [];
  if (was.verses?.join() !== now.verses.join()) return 'изменилось содержимое записи';
  if (was.text !== now.text) why.push(`изменился текст её стихов в tools/bible/synodal.tsv (${now.verses.slice(0, 6).join('; ')}${now.verses.length > 6 ? '…' : ''})`);
  if (was.brackets !== now.brackets) why.push('изменились строки tools/bible/brackets.tsv о её стихах');
  if (was.issues !== now.issues) why.push('изменились строки tools/bible/source-issues.tsv о её стихах');
  for (const s of new Set([...Object.keys(was.sources), ...Object.keys(now.sources)])) {
    if (was.sources[s] !== now.sources[s]) why.push(`источник ${s}: «${was.sources[s] ?? '—'}» → «${now.sources[s] ?? '—'}»`);
  }
  return why.length ? why.join('; ') : 'изменилось содержимое записи';
}

// ---------- статус и допуск ----------

export interface RecStatus {
  /** Действующий статус: «проверено» — только при совпавшем отпечатке. */
  status: Status;
  /** Подпись есть, но отпечаток не совпал: почему. Статус тогда — черновик. */
  stale?: string;
  /** Статус «проверено» записан без подписи. */
  unsigned?: boolean;
}

const DEFAULT_PROV: Pick<Prov, 'status'> = { status: 'draft' };

/** Журнал подписей по ключам. */
export const ledger = (base: Base) => new Map((base.checks ?? []).map((c) => [c.key, c]));

export function statusOf(r: Rec, base: Base, led = ledger(base), env: TextEnv = fileEnv()): RecStatus {
  const declared: Status = r.rec.prov?.status ?? r.parent?.prov?.status ?? (base.files?.[r.file] ?? DEFAULT_PROV).status;
  if (declared === 'quarantine') return { status: 'quarantine' };
  const check: Check | undefined = led.get(r.key) ?? r.rec.prov?.check;
  if (!check) return declared === 'checked' ? { status: 'draft', unsigned: true } : { status: 'draft' };
  const now = inputsOf(r, base, env);
  if (recordHash(r, now) !== check.hash) return { status: 'draft', stale: staleReason(check, now) };
  return { status: 'checked' };
}

export interface Counts { checked: number; draft: number; quarantine: number; stale: number; admitted: number }
const zero = (): Counts => ({ checked: 0, draft: 0, quarantine: 0, stale: 0, admitted: 0 });

export interface Admission {
  level: Level;
  /** Допущена ли запись (по самому объекту записи). */
  ok(rec: object): boolean;
  okKey(key: string): boolean;
  /** Часть записи (обозначение союза, имя лица) идёт с записью, кроме явного карантина. */
  part(p: { prov?: Partial<Prov> } | undefined): boolean;
  status: Map<string, RecStatus>;
  counts: Record<Coll, Counts> & { all: Counts };
}

/** Одна функция допуска для всех коллекций сборки (09 § 5.2, п. 1). */
export function admission(base: Base, level: Level, env: TextEnv = fileEnv()): Admission {
  const recs = records(base);
  const led = ledger(base);
  const byKey = new Map(recs.map((r) => [r.key, r]));
  const status = new Map(recs.map((r) => [r.key, statusOf(r, base, led, env)]));
  const own = (s: RecStatus) => (level === 'release' ? s.status === 'checked' : s.status !== 'quarantine');
  const memo = new Map<string, boolean>();
  const okKey = (key: string, path = new Set<string>()): boolean => {
    if (memo.has(key)) return memo.get(key)!;
    const r = byKey.get(key);
    if (!r || path.has(key)) return false;
    path.add(key);
    const v = own(status.get(key)!) && r.deps.every((k) => okKey(k, path));
    path.delete(key);
    memo.set(key, v);
    return v;
  };
  const admitted = new Set<object>();
  const counts = Object.fromEntries([...COLLS, 'all'].map((c) => [c, zero()])) as Admission['counts'];
  for (const r of recs) {
    const s = status.get(r.key)!;
    const a = okKey(r.key);
    if (a) admitted.add(r.rec);
    for (const c of [counts[r.coll], counts.all]) {
      c[s.status]++;
      if (s.stale) c.stale++;
      if (a) c.admitted++;
    }
  }
  return {
    level,
    ok: (rec) => admitted.has(rec),
    okKey: (k) => okKey(k),
    part: (p) => p?.prov?.status !== 'quarantine',
    status,
    counts,
  };
}

// ---------- журнал подписей ----------

export function loadChecks(dir = join(ROOT, 'base')): CheckEntry[] {
  const f = join(dir, CHECKS_FILE);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).items : [];
}

export function saveChecks(items: CheckEntry[], dir = join(ROOT, 'base')) {
  const sorted = [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const file = {
    schema: 1,
    title: 'Подписи проверки (второй ключ; 02 § 3.1; Д3-2)',
    note: 'Ставится командой npm run -s base:mark; руками не править. Подпись действует, пока отпечаток записи и её входов совпадает.',
    items: sorted,
  };
  writeFileSync(join(dir, CHECKS_FILE), JSON.stringify(file, null, 1) + '\n');
}

/** Подпись проверки записи по ключу: текущий отпечаток и входы; прежняя подпись — в историю. */
export function sign(base: Base, key: string, who: { by: string; kind: 'human' | 'agent'; at?: string }, env: TextEnv = fileEnv()): CheckEntry {
  const r = records(base).find((x) => x.key === key);
  if (!r) throw new Error(`нет записи с ключом «${key}»`);
  const s = statusOf(r, base, new Map(), env);
  if (s.status === 'quarantine') throw new Error(`запись «${key}» в карантине: подписать нельзя`);
  const author = r.rec.prov?.by ?? r.parent?.prov?.by ?? base.files?.[r.file]?.by;
  if (author && author === who.by) throw new Error(`второй ключ — не составитель: «${who.by}» составил запись «${key}»`);
  const inputs = inputsOf(r, base, env);
  const prev = (base.checks ?? []).find((c) => c.key === key);
  const history = prev ? [...(prev.history ?? []), { by: prev.by, kind: prev.kind, at: prev.at, hash: prev.hash, ...(prev.inputs && { inputs: prev.inputs }) }] : undefined;
  return { key, by: who.by, kind: who.kind, at: who.at ?? new Date().toISOString().slice(0, 10), hash: recordHash(r, inputs), inputs, ...(history && { history }) };
}

/** Проверка подписей для валидатора: каждая подпись находит запись, отпечаток совпадает, карантин не подписан. */
export function validateChecks(base: Base, env: TextEnv = fileEnv()): { where: string; msg: string }[] {
  const out: { where: string; msg: string }[] = [];
  const recs = records(base);
  const byKey = new Map(recs.map((r) => [r.key, r]));
  const led = ledger(base);
  const keys = new Set<string>();
  for (const c of base.checks ?? []) {
    if (keys.has(c.key)) out.push({ where: c.key, msg: 'подпись проверки повторяется' });
    keys.add(c.key);
    if (!c.by || !c.at || !c.hash || (c.kind !== 'human' && c.kind !== 'agent')) out.push({ where: c.key, msg: 'подпись без «кто», «когда», «человек или агент» или отпечатка' });
    if (!byKey.has(c.key)) out.push({ where: c.key, msg: 'проверенной записи больше нет (ключ не найден): запись удалена или изменилась так, что сменился ключ' });
  }
  for (const r of recs) {
    const s = statusOf(r, base, led, env);
    if (s.stale) out.push({ where: r.key, msg: `запись изменилась после проверки — статус снят до повторной проверки: ${s.stale}` });
    if (s.unsigned) out.push({ where: r.key, msg: 'статус «проверено» без подписи проверки' });
    if (s.status === 'quarantine' && (led.has(r.key) || r.rec.prov?.check)) out.push({ where: r.key, msg: 'подпись проверки у записи в карантине' });
  }
  return out;
}
