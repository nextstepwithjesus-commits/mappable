/**
 * Сборка данных для приложения из базы (docs/app/02-ДАННЫЕ.md, § 8; этап Д1.6).
 *
 *   npx tsx tools/base/bundle.ts            собрать в dist-data/ и проверить бюджет
 *
 * Исходная модель (base/) — полная, с происхождением; сборка — только нужное для показа:
 *   index.json        — номера, имена, виды, основные связи, наборы прочтений, области: не больше 200 КБ в gzip;
 *   cards/<том>.json  — утверждения карточек и «нет сведений», частями по томам;
 *   verses/<книга>.json — тексты только тех стихов, на которые есть ссылки, частями по книгам;
 *   manifest.json     — опись выпуска: отпечатки текста, схемы, таблиц, моделей; размеры; бюджет.
 * Записи в карантине в сборку не попадают. Перед сборкой база проверяется (validate.ts): с ошибками сборка не идёт.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadBase, validate } from './validate.ts';
import { loadBible } from '../bible.ts';
import { parseRef, verseId, BOOKS } from '../../src/engine/books.ts';
import type { Base } from './migrate.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'dist-data');
export const BUDGET_INDEX_GZ = 200 * 1024;

const sha = (buf: string | Buffer) => createHash('sha256').update(buf).digest('hex');
const ok = (p?: { status?: string }) => p?.status !== 'quarantine';

/** Индекс: всё, что нужно поиску, указателю и схемам без карточек. Короткие ключи — ради объёма. */
export function buildIndex(base: Base) {
  const actors = base.volumes.flatMap((v) =>
    v.actors.map((a) => ({
      id: a.id.slice(2), k: a.kind, ...(a.subkind && { sk: a.subkind }), ...(a.sex && { s: a.sex }),
      n: a.names[0].form, ...(a.names.length > 1 && { o: a.names.slice(1).map((n) => n.form) }),
      ...(a.disambig && { d: a.disambig }), ...(a.roles?.length && { r: a.roles }), ...(a.prominence && { p: a.prominence }),
      ...(a.count && { c: a.count.n }), v: v.vol,
    })),
  );
  const short = (id?: string) => id?.slice(2);
  return {
    schema: 1,
    actors,
    origins: base.origins.filter((o) => ok(o.prov)).map((o) => ({
      c: short(o.child), ...(o.parent ? { p: short(o.parent) } : { u: o.unnamedParent?.words }), r: o.role === 'father' ? 'f' : 'm',
      k: o.kind, ...(o.primary && { pr: 1 }), ...(o.gap && { g: 1 }), ...(o.gapPossible && { gv: o.gapPossible.via.map(short) }),
      ...(o.reading && { rs: o.reading.set, ri: o.reading.in }), ...(o.cert !== 'scripture' && { ce: o.cert }), ...(o.order !== undefined && { or: o.order }),
      ...(o.skipped && { sk: o.skipped.actors.map(short) }), ...(o.outsideLists && { ol: 1 }),
    })),
    unions: base.unions.map((u) => ({ h: short(u.husband), w: short(u.wife), k: [...new Set(u.terms.map((t) => t.kind))] })),
    kin: base.kin.filter((k) => ok(k.prov)).map((k) => ({ f: short(k.from), t: short(k.to), r: k.rel })),
    readings: base.readings.map((r) => ({ id: r.id, t: r.title, d: r.default, r: r.readings.map((x) => ({ id: x.id, l: x.label, ce: x.cert })) })),
    areas: base.areas.map((a) => ({ id: a.id.slice(2), n: a.name, k: a.kind, ...(a.founder && { f: short(a.founder) }), ...(a.parent && { pa: a.parent.slice(2) }) })),
    members: base.memberships.map((m) => [short(m.actor), m.area.slice(2), ...(m.role ? [m.role] : [])]),
    lines: Object.fromEntries(Object.entries<any>(base.lines).map(([k, l]) => [k, { n: l.name, st: l.subtitle, rd: l.readings, ids: l.persons.map((s: any) => short(s.id)) }])),
    redirects: base.redirects.map((r) => [short(r.from), r.to.map(short)]),
  };
}

function main() {
  const base = loadBase();
  const errors = validate(base).filter((i) => i.level === 'error');
  if (errors.length) {
    console.error(`!! проверка базы: ошибок ${errors.length} — сборка остановлена`);
    process.exit(1);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'cards'), { recursive: true });
  mkdirSync(join(OUT, 'verses'), { recursive: true });
  const sizes: Record<string, { raw: number; gz: number }> = {};
  const write = (rel: string, v: unknown) => {
    const s = JSON.stringify(v);
    writeFileSync(join(OUT, rel), s);
    sizes[rel] = { raw: Buffer.byteLength(s), gz: gzipSync(s, { level: 9 }).length };
  };

  write('index.json', buildIndex(base));

  // карточки по томам: без карантина
  let quarantined = 0;
  const cited = new Set<string>();
  const cite = (v: unknown) => {
    const go = (x: any) => {
      if (Array.isArray(x)) return x.forEach(go);
      if (!x || typeof x !== 'object') return;
      for (const r of [...(Array.isArray(x.refs) ? x.refs : []), ...(typeof x.ref === 'string' ? [x.ref] : [])]) cited.add(r);
      Object.values(x).forEach(go);
    };
    go(v);
  };
  for (const v of base.volumes) {
    const cards: Record<string, unknown> = {};
    for (const a of v.actors) {
      const facts = a.facts.filter((f) => {
        if (ok(f.prov)) return true;
        quarantined++;
        return false;
      });
      cite(facts);
      cite(a.names);
      const nod = base.nodata.filter((n) => n.actor === a.id).map((n) => ({ s: n.sec, k: n.kind, ...(n.what && { w: n.what }), ...(n.refs.length && { r: n.refs }), ...(n.words && { q: n.words }) }));
      cards[a.id.slice(2)] = { f: facts.map((f) => ({ s: f.sec, f: f.field, v: f.value, ...(f.cert && { c: f.cert }) })), ...(nod.length && { nd: nod }) };
    }
    write(`cards/${v.file}`, cards);
  }
  cite(base.origins);
  cite(base.unions);
  cite(base.kin);
  cite(base.memberships);
  cite(base.readings);
  cite(Object.values(base.lines));

  // стихи по книгам: только процитированные
  const bible = loadBible();
  const byBook = new Map<string, Record<string, string>>();
  for (const r of cited) {
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
  for (const [book, verses] of byBook) write(`verses/${bookNo.get(book)}.json`, { book, verses });

  // опись выпуска
  const fileSha = (rel: string) => (existsSync(join(ROOT, rel)) ? sha(readFileSync(join(ROOT, rel))) : null);
  const idx = sizes['index.json'];
  const total = (pre: string) => Object.entries(sizes).filter(([k]) => k.startsWith(pre)).reduce((n, [, s]) => n + s.gz, 0);
  const manifest = {
    schema: 1,
    built: new Date().toISOString(),
    commit: execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(),
    sources: {
      synodal: { file: 'tools/bible/synodal.tsv', sha256: fileSha('tools/bible/synodal.tsv') },
      versification: { file: 'base/versification/synodal-kjv.json', sha256: fileSha('base/versification/synodal-kjv.json') },
      chronology: { anchors: fileSha('base/anchors.json'), epochs: fileSha('base/epochs.json'), note: 'модели хронологии — этап Д6' },
      places: null,
    },
    counts: {
      actors: base.volumes.reduce((n, v) => n + v.actors.length, 0), origins: base.origins.length, unions: base.unions.length,
      kin: base.kin.length, readings: base.readings.length, citedVerses: [...byBook.values()].reduce((n, b) => n + Object.keys(b).length, 0),
      quarantinedFacts: quarantined,
    },
    budget: { indexGzipMax: BUDGET_INDEX_GZ, indexGzip: idx.gz, ok: idx.gz <= BUDGET_INDEX_GZ },
    sizesGzip: { index: idx.gz, cards: total('cards/'), verses: total('verses/') },
    files: sizes,
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;
  console.log(`индекс: ${kb(idx.gz)} в gzip (бюджет ${kb(BUDGET_INDEX_GZ)}) — ${manifest.budget.ok ? 'в бюджете' : 'ПРЕВЫШЕН'}`);
  console.log(`карточки: ${kb(manifest.sizesGzip.cards)} в gzip, ${base.volumes.length} частей; стихи: ${kb(manifest.sizesGzip.verses)} в gzip, ${byBook.size} книг, ${manifest.counts.citedVerses} стихов`);
  console.log(`в карантине и не в сборке: ${quarantined} утверждений`);
  if (!manifest.budget.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
