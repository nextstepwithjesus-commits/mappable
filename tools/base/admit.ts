/**
 * Положительный допуск в сборку и отпечаток проверки (Д-база, Б-1; этап Д3-1, Д3-2; черновик 09 § 5.2).
 *
 * Сборка берёт запись, только если про неё доказано, что её можно показывать:
 *   - действующий статус = статус записи, а если его нет — статус содержащей записи (утверждение — у лица), затем файла;
 *   - «проверено» = подпись в журнале base/checks.json (или prov.check самой записи) и отпечаток совпал: канонический
 *     JSON записи без служебного prov + отпечатки текста ЕЁ стихов (synodal.tsv), строк brackets.tsv и source-issues.tsv
 *     об этих стихах + версии её источников из base/sources.json. Правка записи или её входа снимает «проверено»,
 *     правка чужого стиха или чужой строки таблицы — нет (02 § 3.1; рецензия данных на 09, № 1);
 *   - уровень «выпуск» (release) — только «проверено» и только если каждый источник записи разрешает распространение
 *     (`redistribute: true` в реестре; 09 § 5.5, Д3-5); уровень «проба» (probe) — и черновики, только для прототипов;
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
  | 'actor' | 'fact' | 'origin' | 'union' | 'kin' | 'reading' | 'cite' | 'area' | 'membership' | 'nodata' | 'chrono' | 'redirect'
  | 'line' | 'epoch' | 'anchor' | 'place' | 'relation';
export const COLLS: Coll[] = ['actor', 'fact', 'origin', 'union', 'kin', 'reading', 'cite', 'area', 'membership', 'nodata', 'chrono', 'redirect', 'line', 'epoch', 'anchor', 'place', 'relation'];

/**
 * Файлы base/ по коллекциям допуска (02 § 3.17 [4.1]; К-10): каждый файл базы принадлежит коллекции допуска или списку
 * служебных. Ссылки на труды (`cite`) живут в файле своего набора прочтений.
 */
export const COLL_FILES: Record<Coll, RegExp> = {
  actor: /^actors\/[^/]+\.json$/, fact: /^actors\/[^/]+\.json$/, origin: /^origins\.json$/, union: /^unions\.json$/, kin: /^kin\.json$/,
  reading: /^readings\.json$/, cite: /^readings\.json$/, area: /^areas\.json$/, membership: /^memberships\.json$/, nodata: /^nodata\.json$/,
  chrono: /^chrono\.json$/, redirect: /^redirects\.json$/, line: /^lines\/[^/]+\.json$/, epoch: /^epochs\.json$/, anchor: /^anchors\.json$/,
  place: /^places\.json$/, relation: /^relations\.json$/,
};
/**
 * Служебные файлы base/ — не коллекции допуска: реестр источников, журнал подписей, исправления, выданные номера,
 * таблица нумерации стихов, отчёт и подсказки переноса.
 */
export const SERVICE_FILES: RegExp[] = [/^sources\.json$/, /^checks\.json$/, /^corrections\.json$/, /^ids\.json$/, /^versification\//, /^legacy\//];

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
  /**
   * Прежний ключ — до номеров (02 § 3.3.3): `origin:<ребёнок>|<родитель>|<роль>|<p|o>`, `fact:<лицо>|<раздел>|<поле>`,
   * `kin:<от>|<к>|<слово>`, `epoch:<номер без era->`; по нему `base:mark --rekey` находит подпись. У прочих — как `key`.
   */
  legacy: string;
}

/** Прежняя функция ключей (до номеров `o-`, `a-`, `k-`, `era-`): без порядкового «#2» — его добавляет `records`. */
export function legacyKey(coll: Coll, rec: any, parent?: any): string | undefined {
  switch (coll) {
    case 'origin': return `origin:${rec.child}|${rec.parent ?? '?'}|${rec.role}|${rec.primary ? 'p' : 'o'}`;
    case 'fact': return `fact:${parent.id}|${rec.sec}|${rec.field}`;
    case 'kin': return `kin:${rec.from}|${rec.to}|${rec.rel}`;
    case 'epoch': return `epoch:${String(rec.id).replace(/^era-/, '')}`;
    case 'anchor': return `anchor:${String(rec.id).replace(/^an-/, '')}`;
    default: return undefined;
  }
}

/**
 * Все записи базы с устойчивыми ключами. Ключ повторяется — к нему добавляется «#2», «#3» по порядку записей
 * (несколько утверждений одного поля у лица: `fact:p-avraam|17|events`, `fact:p-avraam|17|events#2`).
 */
export function records(base: Base): Rec[] {
  const out: Rec[] = [];
  const seen = new Map<string, number>();
  const seenLegacy = new Map<string, number>();
  const nth = (m: Map<string, number>, k: string) => {
    const n = (m.get(k) ?? 0) + 1;
    m.set(k, n);
    return n > 1 ? `${k}#${n}` : k;
  };
  // запись с номером — по номеру; без номера (база до К-1) — прежним ключом
  const add = (coll: Coll, k: string, rec: any, file: string, deps: (string | undefined | false)[], parent?: any) => {
    const own = rec.id && ['origin', 'fact', 'kin'].includes(coll) ? `${coll}:${rec.id}` : k;
    const key = nth(seen, own);
    const legacy = legacyKey(coll, rec, parent);
    // ссылка на запись того же вида — не зависимость (02 § 3.17, Р-3; К-4): цель не допущена — ссылка не выводится
    const ds = [...new Set(deps.filter((d): d is string => !!d && !d.startsWith(`${coll}:`)))];
    out.push({ key, coll, rec, file, deps: ds, legacy: legacy ? nth(seenLegacy, legacy) : key, ...(parent && { parent }) });
  };
  // переадресация — к записи-цели любого вида (02 § 3.3.1); цепочка переадресаций — до конечной цели
  const target = new Map<string, string>();
  for (const v of base.volumes) for (const a of v.actors) target.set(a.id, `actor:${a.id}`);
  for (const u of base.unions) target.set(u.id, `union:${u.id}`);
  for (const r of base.readings) target.set(r.id, `reading:${r.id}`);
  for (const a of base.areas) target.set(a.id, `area:${a.id}`);
  for (const e of base.epochs) target.set(e.id, `epoch:${e.id}`);
  for (const a of base.anchors?.anchors ?? []) target.set(a.id, `anchor:${a.id}`);
  for (const p of base.places ?? []) target.set(p.id, `place:${p.id}`);
  for (const o of base.origins) if (o.id) target.set(o.id, `origin:${o.id}`);
  for (const k of base.kin) if (k.id) target.set(k.id, `kin:${k.id}`);
  for (const r of base.relations ?? []) if (r.id) target.set(r.id, `relation:${r.id}`);
  for (const v of base.volumes) for (const a of v.actors) for (const f of a.facts) if (f.id) target.set(f.id, `fact:${f.id}`);
  const redirectTo = new Map(base.redirects.map((r) => [r.from, r.to]));
  const finalTargets = (to: string[], path = new Set<string>()): string[] =>
    to.flatMap((t) => {
      if (target.has(t)) return [target.get(t)!];
      if (redirectTo.has(t) && !path.has(t)) return finalTargets(redirectTo.get(t)!, new Set([...path, t]));
      return [`missing:${t}`];
    });
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
      A(o.child), A(o.parent), o.reading && `reading:${o.reading.set}`, ...(o.candidates ?? []).map(A),
    ]);
  }
  for (const u of base.unions) add('union', `union:${u.id}`, u, 'unions.json', [A(u.husband), A(u.wife)]);
  for (const k of base.kin) add('kin', `kin:${k.from}|${k.to}|${k.rel}`, k, 'kin.json', [A(k.from), A(k.to)]);
  // отношения лиц (02 § 3.11.1): обе карточки — зависимости
  for (const r of base.relations ?? []) add('relation', `relation:${r.a}|${r.b}|${r.kind}`, r, 'relations.json', [A(r.a), A(r.b)]);
  // ссылки на труды набора — отдельная запись со своей подписью (02 § 3.3.3, п. 6; К-3): `works` в отпечаток набора не
  // входит. В её содержимое входят и записи трудов реестра (издание, год, традиция): правка труда снимает подпись ссылок
  const reg = new Map((base.sources ?? []).map((s) => [s.id, s]));
  for (const r of base.readings) {
    add('reading', `reading:${r.id}`, r, 'readings.json', []);
    const ws = r.readings.filter((x) => x.works?.length);
    if (!ws.length) continue;
    const used = [...new Set(ws.flatMap((x) => x.works!.map((c) => c.work)))].sort();
    const cite = {
      set: r.id,
      works: ws.map((x) => ({ reading: x.id, works: x.works })),
      registry: used.map((id) => {
        const w = reg.get(id);
        return w ? { id, title: w.title, author: w.author, org: w.org, year: w.year, edition: w.edition, volume: w.volume, publisher: w.publisher, tradition: w.tradition } : { id, missing: true };
      }),
    };
    add('cite', `reading:${r.id}#works`, cite, 'readings.json', [`reading:${r.id}`]);
  }
  for (const a of base.areas) add('area', `area:${a.id}`, a, 'areas.json', [A(a.founder), a.parent && `area:${a.parent}`]);
  for (const m of base.memberships) {
    add('membership', `membership:${m.actor}|${m.area}`, m, 'memberships.json', [A(m.actor), m.area.startsWith('g-') ? `area:${m.area}` : A(m.area)]);
  }
  for (const n of base.nodata) add('nodata', `nodata:${n.actor}|${n.sec}|${n.kind}`, n, 'nodata.json', [A(n.actor)]);
  for (const c of base.chrono) add('chrono', `chrono:${c.actor}`, c, 'chrono.json', [A(c.actor)]);
  for (const r of base.redirects) add('redirect', `redirect:${r.from}`, r, 'redirects.json', finalTargets(r.to, new Set([r.from])));
  for (const [k, l] of Object.entries<any>(base.lines)) {
    add('line', `line:${k}`, l, `lines/${k}.json`, [...(l.persons ?? []).map((s: any) => A(s.id)), ...Object.keys(l.readings ?? {}).map((s) => `reading:${s}`)]);
  }
  for (const e of base.epochs) add('epoch', `epoch:${e.id}`, e, 'epochs.json', [A(e.startRule?.person), A(e.endRule?.person)]);
  // опоры (02 § 3.15; К-10): в допуске, как эпохи
  for (const a of base.anchors?.anchors ?? []) add('anchor', `anchor:${a.id}`, a, 'anchors.json', []);
  // места (02 § 3.13; К-11): связи с другими местами — ссылки, а не зависимости (§ 3.17)
  for (const p of base.places ?? []) add('place', `place:${p.id}`, p, 'places.json', []);
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

/** Стихи, на которые ссылается запись (refs, ref, first, key, all, read, verse; глава целиком — все её стихи), по порядку. */
export function recordVerses(rec: unknown): { id: string; book: string; chapter: number; verse: number }[] {
  const bible = loadBible();
  const refs = new Set<string>();
  const go = (x: any) => {
    if (Array.isArray(x)) return x.forEach(go);
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if ((k === 'ref' || k === 'first' || k === 'verse') && typeof v === 'string') refs.add(v);
      else if ((k === 'refs' || k === 'key' || k === 'all' || k === 'read') && Array.isArray(v)) for (const r of v) if (typeof r === 'string') refs.add(r);
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

/**
 * Запись без служебного prov (на любой глубине: prov обозначений союза тоже служебный); у лица — без утверждений.
 * Без поля `sources` записи: её источники входят в отпечаток через входы (`inputs.sources`: номер → версия), поэтому
 * запись того же источника, указанного у файла или у записи, даёт тот же отпечаток, а смена источника подпись снимает.
 */
export function content(r: Pick<Rec, 'coll' | 'rec'>): unknown {
  const strip = (x: any): any => {
    if (Array.isArray(x)) return x.map(strip);
    if (!x || typeof x !== 'object') return x;
    return Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'prov').map(([k, v]) => [k, strip(v)]));
  };
  const c = strip(r.rec);
  if (r.coll === 'actor') delete c.facts;
  // ссылки на труды в отпечаток набора не входят: они подписываются отдельно (02 § 3.3.3, п. 6; К-3)
  if (r.coll === 'reading' && Array.isArray(c?.readings)) for (const x of c.readings) delete x.works;
  if (c && typeof c === 'object') delete c.sources;
  return c;
}

/**
 * Источники записи (09 § 5.5; Д3-3): источники файла по умолчанию (`sources` файла; нет — src-synodal), содержащей записи
 * и самой записи (поля source и sources с номером из реестра или вида «src-…»), и всегда src-synodal: стихи записи — из него.
 */
export function recordSources(r: Pick<Rec, 'rec'> & Partial<Pick<Rec, 'file' | 'parent'>>, base: Base): string[] {
  const reg = new Set((base.sources ?? []).map((s) => s.id));
  const ids = new Set<string>(['src-synodal', ...((r.file && base.fileSources?.[r.file]) || [])]);
  for (const s of [r.parent?.sources].flat()) if (typeof s === 'string') ids.add(s);
  const go = (x: any) => {
    if (Array.isArray(x)) return x.forEach(go);
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if (k === 'facts' && x === r.rec) continue; // утверждения лица — свои записи со своими источниками
      // ссылки на труды — не источник материала: право распространять у труда не проверяется (02 § 5.2, Р-2; К-3)
      if (k === 'works') continue;
      if ((k === 'source' || k === 'sources') && (typeof v === 'string' || Array.isArray(v))) {
        for (const s of [v].flat()) if (typeof s === 'string' && (reg.has(s) || s.startsWith('src-'))) ids.add(s);
      }
      go(v);
    }
  };
  go(r.rec);
  return [...ids].sort();
}

/**
 * Части записи со своим источником (02 § 3.13.3; К-15): положения, имена в других источниках, современное название,
 * точка подписи, сопоставление со сводкой. Часть с закрытым источником снимается, запись остаётся.
 */
export const PART_FIELDS = ['names', 'otherNames', 'positions', 'modernName', 'modernCyr', 'labelPoint', 'match'] as const;

/** Номера источников самой части: `source`, `sources`, `coordSource.source`. */
function partSourceIds(p: any): string[] {
  if (!p || typeof p !== 'object') return [];
  return [p.source, p.sources, p.coordSource?.source].flat().filter((s): s is string => typeof s === 'string');
}

/** Часть закрыта: у неё есть свой источник, и хоть один из них не разрешает распространение или его нет в реестре. */
export function closedPart(p: unknown, base: Base): boolean {
  const reg = new Map((base.sources ?? []).map((s) => [s.id, s]));
  return partSourceIds(p).some((id) => reg.get(id)?.redistribute !== true);
}

/** Запись без закрытых частей — её видит выпуск (К-15). Записи без таких частей возвращаются как есть. */
export function openView<T>(rec: T, base: Base): T {
  if (!rec || typeof rec !== 'object') return rec;
  let out: any = rec;
  for (const f of PART_FIELDS) {
    const v = (rec as any)[f];
    if (Array.isArray(v) ? v.some((p) => closedPart(p, base)) : v && typeof v === 'object' && closedPart(v, base)) {
      if (out === rec) out = { ...rec };
      if (Array.isArray(v)) out[f] = v.filter((p) => !closedPart(p, base));
      else delete out[f];
    }
  }
  return out;
}

/**
 * Источники записи, которые не разрешают попасть в сборку (`redistribute` не true или источника нет в реестре). Закрытые
 * части снимаются до этой проверки (02 § 3.13.3; К-15): они не закрывают запись.
 */
export function blockedSources(r: Pick<Rec, 'rec'> & Partial<Pick<Rec, 'file' | 'parent'>>, base: Base): string[] {
  const reg = new Map((base.sources ?? []).map((s) => [s.id, s]));
  return recordSources({ ...r, rec: openView(r.rec, base) }, base).filter((id) => reg.get(id)?.redistribute !== true);
}

export function inputsOf(r: Pick<Rec, 'coll' | 'rec'> & Partial<Pick<Rec, 'file' | 'parent'>>, base: Base, env: TextEnv = fileEnv()): CheckInputs {
  const ver = new Map((base.sources ?? []).map((s) => [s.id, s.version]));
  const vs = recordVerses(content(r));
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    verses: vs.map((v) => v.id),
    text: sha(vs.map((v) => `${v.id}\t${env.verse(v.id) ?? '<нет стиха>'}`).join('\n')),
    brackets: sha(uniq(vs.flatMap((v) => env.brackets(v.book, v.chapter, v.verse))).join('\n')),
    issues: sha(uniq(vs.flatMap((v) => env.issues(v.book, v.chapter, v.verse))).join('\n')),
    sources: Object.fromEntries(recordSources(r, base).map((s) => [s, ver.get(s) ?? '?'])),
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

/** Числа по статусам; `rights` — записи, которые источник не разрешает выпускать (redistribute: false; 09 § 5.5). */
export interface Counts { checked: number; draft: number; quarantine: number; stale: number; rights: number; admitted: number }
const zero = (): Counts => ({ checked: 0, draft: 0, quarantine: 0, stale: 0, rights: 0, admitted: 0 });

export interface Admission {
  level: Level;
  /** Допущена ли запись (по самому объекту записи). */
  ok(rec: object): boolean;
  okKey(key: string): boolean;
  /**
   * Часть записи (обозначение союза, имя лица, положение места) идёт с записью, кроме явного карантина; в выпуске — и
   * кроме части с закрытым источником (К-15).
   */
  part(p: { prov?: Partial<Prov> } | undefined): boolean;
  /** Запись, какой её видит этот уровень: в выпуске — без закрытых частей (К-15). */
  view<T>(rec: T): T;
  status: Map<string, RecStatus>;
  /** Записи, не допущенные из-за прав источника (уровень «выпуск»): ключ → номера источников. */
  rights: Map<string, string[]>;
  counts: Record<Coll, Counts> & { all: Counts };
}

/** Одна функция допуска для всех коллекций сборки (09 § 5.2, п. 1). */
export function admission(base: Base, level: Level, env: TextEnv = fileEnv()): Admission {
  const recs = records(base);
  const led = ledger(base);
  const byKey = new Map(recs.map((r) => [r.key, r]));
  const status = new Map(recs.map((r) => [r.key, statusOf(r, base, led, env)]));
  // права (09 § 5.5; Д3-5): в выпуск не попадает запись, чей источник не разрешает распространение. Проба — только для
  // прототипов на компьютерах команды; там запрет считается, но не применяется
  const rights = new Map<string, string[]>();
  for (const r of recs) {
    const b = blockedSources(r, base);
    if (b.length) rights.set(r.key, b);
  }
  const own = (s: RecStatus, key: string) => (level === 'release' ? s.status === 'checked' && !rights.has(key) : s.status !== 'quarantine');
  const memo = new Map<string, boolean>();
  const okKey = (key: string, path = new Set<string>()): boolean => {
    if (memo.has(key)) return memo.get(key)!;
    const r = byKey.get(key);
    if (!r || path.has(key)) return false;
    path.add(key);
    const v = own(status.get(key)!, key) && r.deps.every((k) => okKey(k, path));
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
      if (rights.has(r.key)) c.rights++;
      if (a) c.admitted++;
    }
  }
  return {
    level,
    ok: (rec) => admitted.has(rec),
    okKey: (k) => okKey(k),
    part: (p) => p?.prov?.status !== 'quarantine' && !(level === 'release' && closedPart(p, base)),
    view: (rec) => (level === 'release' ? openView(rec, base) : rec),
    status,
    rights,
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
  // эпоха прежнего вида (готовые годы, «предание» в основании) не подписывается до переработки (02 § 3.15; К-8, Д-11)
  if (r.coll === 'epoch') {
    const why = ['start', 'end', 'startEst', 'endEst'].filter((k) => typeof r.rec[k] === 'number').map((k) => `готовый год «${k}»`);
    if (/предани/i.test(JSON.stringify([r.rec.basis, r.rec.basisBy, r.rec.summary]))) why.push('«предание» в основании');
    if (why.length) throw new Error(`эпоху «${key}» подписать нельзя до переработки: ${why.join(', ')} (Д-11)`);
  }
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

// ---------- перенос подписей при смене ключа (02 § 3.3.3; К-2) ----------

export interface RekeyResult {
  /** Журнал после переноса. */
  entries: CheckEntry[];
  moved: { from: string; to: string }[];
  /** Подпись не перенесена: запись изменилась (или не найдена); подпись остаётся под прежним ключом. */
  failed: { key: string; why: string }[];
}

/**
 * `base:mark --rekey`: подпись с прежним ключом находит запись, которая давала этот ключ до номера, и сверяет отпечаток
 * записи без поля номера. Совпал — подпись переписывается на новый ключ с новым отпечатком, прежняя уходит в историю с
 * пометкой «перенос номера». Не совпал — не переносится, причина печатается, запись остаётся черновиком.
 */
export function rekey(base: Base, env: TextEnv = fileEnv(), before?: Base): RekeyResult {
  const recs = records(base);
  const byKey = new Map(recs.map((r) => [r.key, r]));
  const byLegacy = new Map(recs.filter((r) => r.legacy !== r.key).map((r) => [r.legacy, r]));
  const out = new Map((base.checks ?? []).map((c) => [c.key, c]));
  const moved: RekeyResult['moved'] = [];
  const failed: RekeyResult['failed'] = [];
  const prior = before && new Map(records(before).map((r) => [r.key, r]));
  for (const c of base.checks ?? []) {
    if (byKey.has(c.key)) {
      // набор прочтений после замены `authors` на `works` (02 § 3.3.3, п. 6; К-3): отпечаток прежнего вида — из сборки до
      // шага; подпись переносится, только если он совпал с подписью и наборы различаются одной этой заменой
      const r = byKey.get(c.key)!;
      if (!prior || r.coll !== 'reading') continue;
      const inputs = inputsOf(r, base, env);
      if (recordHash(r, inputs) === c.hash) continue;
      const old = prior.get(c.key);
      if (!old) {
        failed.push({ key: c.key, why: 'в сборке до шага нет такой записи' });
        continue;
      }
      if (recordHash(old, inputsOf(old, before!, env)) !== c.hash) {
        failed.push({ key: c.key, why: `отпечаток прежнего вида не совпал с подписью: ${staleReason(c, inputsOf(old, before!, env))}` });
        continue;
      }
      const noAuthors = (x: any) => {
        const y = structuredClone(content(x)) as any;
        for (const rd of y?.readings ?? []) delete rd.authors;
        return canon(y);
      };
      if (noAuthors(old) !== noAuthors(r)) {
        failed.push({ key: c.key, why: 'набор изменился не только заменой авторов строками на ссылки works' });
        continue;
      }
      const prev = { by: c.by, kind: c.kind, at: c.at, hash: c.hash, ...(c.inputs && { inputs: c.inputs }), note: 'перенос: авторы строками → works (К-3); ссылки на труды подписываются отдельно' };
      out.set(c.key, { key: c.key, by: c.by, kind: c.kind, at: c.at, hash: recordHash(r, inputs), inputs, history: [...(c.history ?? []), prev] });
      moved.push({ from: c.key, to: c.key });
      continue;
    }
    const r = byLegacy.get(c.key);
    if (!r) {
      failed.push({ key: c.key, why: 'нет записи ни с этим ключом, ни с этим прежним ключом' });
      continue;
    }
    if (out.has(r.key)) {
      failed.push({ key: c.key, why: `у записи ${r.key} уже есть подпись под новым ключом` });
      continue;
    }
    const { id: _id, ...noId } = r.rec;
    const was = { coll: r.coll, rec: noId };
    const inputs = inputsOf(r, base, env);
    if (recordHash(was, inputs) !== c.hash) {
      failed.push({ key: c.key, why: staleReason(c, inputsOf({ ...r, rec: noId }, base, env)) });
      continue;
    }
    const prev = { by: c.by, kind: c.kind, at: c.at, hash: c.hash, ...(c.inputs && { inputs: c.inputs }), note: `перенос номера: ${c.key}` };
    out.delete(c.key);
    out.set(r.key, { key: r.key, by: c.by, kind: c.kind, at: c.at, hash: recordHash(r, inputs), inputs, history: [...(c.history ?? []), prev] });
    moved.push({ from: c.key, to: r.key });
  }
  return { entries: [...out.values()], moved, failed };
}
