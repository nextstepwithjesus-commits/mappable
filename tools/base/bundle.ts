/**
 * Сборка данных для приложения из базы (docs/app/02-ДАННЫЕ.md, § 8; этап Д1.6; допуск — Д3-1, черновик 09 § 5.2).
 *
 *   npm run -s base:bundle                 уровень «выпуск»: только проверенное → dist-data/
 *   npm run -s base:bundle -- --probe      уровень «проба»: и черновики → dist-data-probe/ (только для прототипов)
 *
 * Исходная модель (base/) — полная, с происхождением; сборка — только нужное для показа:
 *   index.json        — номера, имена, виды, основные связи, наборы прочтений, области: не больше 200 КБ в gzip;
 *   cards/<том>.json  — утверждения карточек и «нет сведений», частями по томам;
 *   verses/<книга>.json — тексты только тех стихов, на которые есть ссылки, частями по книгам;
 *   NOTICE.txt        — источники и права: собирается из реестра base/sources.json (09 § 5.5; Д3-5);
 *   manifest.json     — опись выпуска: уровень допуска и числа по статусам, отпечатки текста, таблиц, реестра, базы; размеры.
 * Что попадает в сборку, решает одна функция допуска (admit.ts): своих фильтров здесь нет. Карантин не попадает никогда.
 * Каждый файл сборки несёт уровень допуска (`admit`); у пробы — плашку, которую нельзя убрать, и своя папка: проба в
 * папку выпуска — ошибка. Перед сборкой база проверяется (validate.ts): с ошибками сборка не идёт.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { loadBase, validate } from './validate.ts';
import { loadBible } from '../bible.ts';
import { parseRef, verseId, BOOKS } from '../../src/engine/books.ts';
import { admission, LEVEL_WORD, PROBE_BANNER, type Admission, type Level } from './admit.ts';
import type { Base } from './migrate.ts';
import { noticeEntries, noticeText } from './sources.ts';

const ROOT = join(import.meta.dirname, '..', '..');
/** Папки сборки по уровням: выпуск и проба никогда не пишутся в одну папку. */
export const OUT_DIR: Record<Level, string> = { release: join(ROOT, 'dist-data'), probe: join(ROOT, 'dist-data-probe') };
export const BUDGET_INDEX_GZ = 200 * 1024;

const sha = (buf: string | Buffer) => createHash('sha256').update(buf).digest('hex');
/** Отметка уровня в каждом файле сборки. */
const mark = (A: Admission) => (A.level === 'probe' ? { admit: 'probe' as const, banner: PROBE_BANNER } : { admit: 'release' as const });
const asAdmission = (base: Base, a: Level | Admission) => (typeof a === 'string' ? admission(base, a) : a);

/** Проба пишется только в свою папку; выпуск — только в свою. */
export function assertOut(level: Level, dir: string) {
  const other: Level = level === 'probe' ? 'release' : 'probe';
  if (resolve(dir) === resolve(OUT_DIR[other])) throw new Error(`сборка уровня «${level}» в папку уровня «${other}» (${relative(ROOT, dir)}) — ошибка`);
}

/** Индекс: всё, что нужно поиску, указателю и схемам без карточек. Короткие ключи — ради объёма. Только допущенное. */
export function buildIndex(base: Base, level: Level | Admission) {
  const A = asAdmission(base, level);
  const ok = (x: object) => A.ok(x);
  const actors = base.volumes.flatMap((v) =>
    v.actors.filter(ok).map((a) => {
      const names = a.names.filter((n: any) => A.part(n));
      return {
        id: a.id.slice(2), k: a.kind, ...(a.subkind && { sk: a.subkind }), ...(a.sex && { s: a.sex }),
        n: names[0]?.form ?? a.names[0].form, ...(names.length > 1 && { o: names.slice(1).map((n) => n.form) }),
        ...(a.disambig && { d: a.disambig }), ...(a.roles?.length && { r: a.roles }), ...(a.prominence && { p: a.prominence }),
        ...(a.count && { c: a.count.n }), v: v.vol,
      };
    }),
  );
  const short = (id?: string) => id?.slice(2);
  const saidBy = (s: { actor: string; ref: string; label: string }) => ({ a: short(s.actor), r: s.ref, l: s.label });
  return {
    schema: 1,
    ...mark(A),
    actors,
    origins: base.origins.filter(ok).map((o) => ({
      c: short(o.child), ...(o.parent ? { p: short(o.parent) } : { u: o.unnamedParent?.words }), r: o.role === 'father' ? 'f' : 'm',
      k: o.kind, ...(o.primary && { pr: 1 }), ...(o.gap && { g: 1 }), ...(o.gapPossible && { gv: o.gapPossible.via.map(short) }),
      ...(o.reading && { rs: o.reading.set, ri: o.reading.in }), ...(o.cert !== 'scripture' && { ce: o.cert }), ...(o.order !== undefined && { or: o.order }),
      ...(o.skipped && { sk: o.skipped.actors.map(short) }), ...(o.outsideLists && { ol: 1 }),
      ...(o.saidBy && { sb: saidBy(o.saidBy) }),
    })),
    unions: base.unions.filter(ok).map((u) => ({ u, terms: u.terms.filter((t) => A.part(t)) })).filter((x) => x.terms.length)
      .map(({ u, terms }) => ({ h: short(u.husband), w: short(u.wife), k: [...new Set(terms.map((t) => t.kind))] })),
    // пометка «по словам …» (02 § 3.6) и авторы толкований (02 § 3.4 [R9]) идут в выпуск вместе с записью
    kin: base.kin.filter(ok).map((k) => ({ f: short(k.from), t: short(k.to), r: k.rel, ...(k.saidBy && { sb: saidBy(k.saidBy) }) })),
    readings: base.readings.filter(ok).map((r) => ({
      id: r.id, t: r.title, d: r.default,
      r: r.readings.map((x) => ({ id: x.id, l: x.label, ce: x.cert, ...(x.authors?.length && { au: x.authors }) })),
    })),
    areas: base.areas.filter(ok).map((a) => ({ id: a.id.slice(2), n: a.name, k: a.kind, ...(a.founder && { f: short(a.founder) }), ...(a.parent && { pa: a.parent.slice(2) }) })),
    members: base.memberships.filter(ok).map((m) => [short(m.actor), m.area.slice(2), ...(m.role ? [m.role] : [])]),
    lines: Object.fromEntries(Object.entries<any>(base.lines).filter(([, l]) => ok(l)).map(([k, l]) => [k, { n: l.name, st: l.subtitle, rd: l.readings, ids: l.persons.map((s: any) => short(s.id)) }])),
    redirects: base.redirects.filter(ok).map((r) => [short(r.from), r.to.map(short)]),
  };
}

/** Карточки по томам: только допущенные лица, их допущенные утверждения и «нет сведений». */
export function buildCards(base: Base, level: Level | Admission) {
  const A = asAdmission(base, level);
  const out: Record<string, { schema: 1; admit: string; banner?: string; cards: Record<string, unknown> }> = {};
  let excludedFacts = 0;
  for (const v of base.volumes) {
    const cards: Record<string, unknown> = {};
    for (const a of v.actors) {
      if (!A.ok(a)) continue;
      const facts = a.facts.filter((f) => A.ok(f) || (excludedFacts++, false));
      const nod = base.nodata.filter((n) => n.actor === a.id && A.ok(n)).map((n) => ({ s: n.sec, k: n.kind, ...(n.what && { w: n.what }), ...(n.refs.length && { r: n.refs }), ...(n.words && { q: n.words }) }));
      cards[a.id.slice(2)] = { f: facts.map((f) => ({ s: f.sec, f: f.field, v: f.value, ...(f.cert && { c: f.cert }) })), ...(nod.length && { nd: nod }) };
    }
    out[v.file] = { schema: 1, ...mark(A), cards };
  }
  return { cards: out, excludedFacts };
}

/** Все ссылки допущенных записей. */
export function citedRefs(base: Base, A: Admission): Set<string> {
  const cited = new Set<string>();
  const go = (x: any) => {
    if (Array.isArray(x)) return x.forEach(go);
    if (!x || typeof x !== 'object') return;
    for (const r of [...(Array.isArray(x.refs) ? x.refs : []), ...(typeof x.ref === 'string' ? [x.ref] : [])]) cited.add(r);
    Object.values(x).forEach(go);
  };
  const ok = (x: object) => A.ok(x);
  for (const v of base.volumes) for (const a of v.actors) if (A.ok(a)) {
    go(a.facts.filter(ok));
    go(a.names.filter((n: any) => A.part(n)));
  }
  for (const xs of [base.origins, base.unions, base.kin, base.memberships, base.readings, base.nodata, Object.values(base.lines)] as object[][]) go(xs.filter(ok));
  return cited;
}

/** Отпечаток содержимого base/: все файлы по порядку путей (опись — какая база в сборке, а не только коммит). */
export function baseFingerprint(dir = join(ROOT, 'base')): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p)).update('\0').update(readFileSync(p)).update('\0');
    }
  };
  walk(dir);
  return h.digest('hex');
}

function main() {
  const level: Level = process.argv.includes('--probe') ? 'probe' : 'release';
  const OUT = OUT_DIR[level];
  assertOut(level, OUT);
  const base = loadBase();
  const errors = validate(base).filter((i) => i.level === 'error');
  if (errors.length) {
    console.error(`!! проверка базы: ошибок ${errors.length} — сборка остановлена`);
    process.exit(1);
  }
  const A = admission(base, level);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'cards'), { recursive: true });
  mkdirSync(join(OUT, 'verses'), { recursive: true });
  const sizes: Record<string, { raw: number; gz: number }> = {};
  const write = (rel: string, v: unknown) => {
    const s = JSON.stringify(v);
    writeFileSync(join(OUT, rel), s);
    sizes[rel] = { raw: Buffer.byteLength(s), gz: gzipSync(s, { level: 9 }).length };
  };

  write('index.json', buildIndex(base, A));
  const { cards, excludedFacts } = buildCards(base, A);
  for (const [file, c] of Object.entries(cards)) write(`cards/${file}`, c);

  // стихи по книгам: только процитированные допущенными записями
  const bible = loadBible();
  const byBook = new Map<string, Record<string, string>>();
  for (const r of citedRefs(base, A)) {
    const p = parseRef(r, bible.chapterLength);
    if (!p) continue;
    for (const v of p.verses) {
      const key = verseId(v);
      const t = bible.verses.get(key);
      if (t === undefined) continue;
      (byBook.get(v.book) ?? byBook.set(v.book, {}).get(v.book)!)[key.slice(v.book.length + 1)] = t;
    }
  }
  const bookNo = new Map(BOOKS.map((b, i) => [b.code, String(i + 1).padStart(2, '0')]));
  const m = mark(A);
  for (const [book, verses] of byBook) write(`verses/${bookNo.get(book)}.json`, { ...m, book, verses });

  // источники и права (09 § 5.5; Д3-5): из реестра; у выпуска источник без права распространения — ошибка сборки
  const notice = noticeEntries(base, A);
  const noticeTxt = noticeText(notice, level);
  writeFileSync(join(OUT, 'NOTICE.txt'), noticeTxt);

  // опись выпуска
  const fileSha = (rel: string) => (existsSync(join(ROOT, rel)) ? sha(readFileSync(join(ROOT, rel))) : null);
  const idx = sizes['index.json'];
  const total = (pre: string) => Object.entries(sizes).filter(([k]) => k.startsWith(pre)).reduce((n, [, s]) => n + s.gz, 0);
  const manifest = {
    schema: 2,
    ...m,
    admitLevel: LEVEL_WORD[level],
    built: new Date().toISOString(),
    commit: execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(),
    base: { sha256: baseFingerprint(), note: 'отпечаток всех файлов base/ по порядку путей' },
    sources: {
      synodal: { file: 'tools/bible/synodal.tsv', sha256: fileSha('tools/bible/synodal.tsv') },
      brackets: { file: 'tools/bible/brackets.tsv', sha256: fileSha('tools/bible/brackets.tsv') },
      sourceIssues: { file: 'tools/bible/source-issues.tsv', sha256: fileSha('tools/bible/source-issues.tsv') },
      registry: { file: 'base/sources.json', sha256: fileSha('base/sources.json') },
      checks: { file: 'base/checks.json', sha256: fileSha('base/checks.json') },
      versification: { file: 'base/versification/synodal-kjv.json', sha256: fileSha('base/versification/synodal-kjv.json') },
      chronology: { anchors: fileSha('base/anchors.json'), epochs: fileSha('base/epochs.json'), note: 'модели хронологии — этап Д6' },
      places: null,
    },
    notice: { file: 'NOTICE.txt', sha256: sha(noticeTxt), sources: notice.map((e) => ({ id: e.id, version: e.version, spdx: e.spdx })) },
    statuses: A.counts,
    counts: {
      actors: A.counts.actor.admitted, origins: A.counts.origin.admitted, unions: A.counts.union.admitted,
      kin: A.counts.kin.admitted, readings: A.counts.reading.admitted, citedVerses: [...byBook.values()].reduce((n, b) => n + Object.keys(b).length, 0),
      excludedFacts,
    },
    budget: { indexGzipMax: BUDGET_INDEX_GZ, indexGzip: idx.gz, ok: idx.gz <= BUDGET_INDEX_GZ },
    sizesGzip: { index: idx.gz, cards: total('cards/'), verses: total('verses/') },
    files: sizes,
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;
  const c = A.counts.all;
  console.log(`уровень: ${LEVEL_WORD[level]} → ${relative(ROOT, OUT)}/${level === 'probe' ? `  [${PROBE_BANNER}]` : ''}`);
  console.log(`записей: проверено ${c.checked}, черновик ${c.draft}, карантин ${c.quarantine}; допущено ${c.admitted} (лиц ${A.counts.actor.admitted})`);
  console.log(`индекс: ${kb(idx.gz)} в gzip (бюджет ${kb(BUDGET_INDEX_GZ)}) — ${manifest.budget.ok ? 'в бюджете' : 'ПРЕВЫШЕН'}`);
  console.log(`карточки: ${kb(manifest.sizesGzip.cards)} в gzip, ${base.volumes.length} частей; стихи: ${kb(manifest.sizesGzip.verses)} в gzip, ${byBook.size} книг, ${manifest.counts.citedVerses} стихов`);
  console.log(`утверждений не в сборке: ${excludedFacts}`);
  if (!manifest.budget.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
