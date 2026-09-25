/**
 * Конвейер сборки данных (ТЗ § 6): тома → граф → хронология (все модели) → раскладка → масштаб времени →
 * индекс неба (src/generated/atlas.json), тела карточек по томам (src/generated/cards/*.json),
 * процитированные стихи по книгам (src/generated/verses/*.json), отчёт с метриками (docs/layout-report.md).
 *
 *   npm run data            — собрать
 *   npm run layout          — собрать и показать метрики раскладки
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Typograf from 'typograf';
import { loadBible, ROOT } from './bible.ts';
import { buildGraph, primaryChildren } from '../src/engine/graph.ts';
import { solveChronology, MODELS, type ChronoResult } from '../src/engine/chronology.ts';
import { computeLayout, type LineStep, type LayoutResult } from '../src/engine/layout.ts';
import { buildTimeScale } from '../src/engine/timescale.ts';
import { parseRef, verseId, BOOKS } from '../src/engine/books.ts';
import type { Person, Volume, Epoch, Group } from '../src/data/types.ts';

const read = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const personsDir = join(ROOT, 'data/persons');
const volumes: Volume[] = existsSync(personsDir)
  ? readdirSync(personsDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(personsDir, f), 'utf8')))
  : [];
const persons: Person[] = [];
const volumeOf = new Map<string, string>();
for (const v of volumes) for (const p of v.persons) {
  if (volumeOf.has(p.id)) continue;
  persons.push(p);
  volumeOf.set(p.id, v.volume);
}
const epochs = read<Epoch[]>('data/epochs.json');
const groups = read<Group[]>('data/groups.json');
const anchors = read<{ anchors: unknown[] }>('data/anchors.json');
const joseph = read<{ persons: LineStep[]; name: string; subtitle: string; basis: string; refs: string[] }>('data/lines/joseph.json');
const mary = read<{ persons: LineStep[]; name: string; subtitle: string; basis: string; refs: string[] }>('data/lines/mary.json');

const g = buildGraph(persons);
const lines = {
  joseph: joseph.persons.filter((s) => g.persons.has(s.id)),
  mary: mary.persons.filter((s) => g.persons.has(s.id)),
};

// ---------- хронология и раскладка по всем моделям ----------
const results: { id: string; chrono: ChronoResult; layout: LayoutResult; scale: ReturnType<typeof buildTimeScale> }[] = [];
for (const m of MODELS) {
  const t0 = performance.now();
  const chrono = solveChronology(g, epochs, m.id);
  const layout = computeLayout(g, chrono, lines);
  const births = [...chrono.persons.values()].map((c) => c.b);
  const spans = layout.nodes.map((n) => [n.t0, n.t1] as [number, number]);
  const scale = buildTimeScale(births, spans);
  results.push({ id: m.id, chrono, layout, scale });
  console.log(`модель ${m.id}: ${(performance.now() - t0).toFixed(0)} мс · напряжений ${chrono.tensions.length} · метрики ${JSON.stringify(layout.metrics)}`);
}

// ---------- значимость → звёздная величина (степень интереса по Фурнасу) ----------
const refsOf = (p: Person): string[] => {
  const out = new Set<string>();
  const add = (r?: string[] | string) => { if (!r) return; for (const x of Array.isArray(r) ? r : [r]) out.add(x); };
  add(p.parentRefs);
  for (const s of p.spouses ?? []) add(s.refs);
  for (const k of p.kin ?? []) add(k.refs);
  for (const o of p.otherParents ?? []) add(o.refs);
  const c = p.card;
  if (c) {
    add(c.meaning?.refs);
    for (const a of c.altNames ?? []) add(a.refs);
    for (const k of ['status', 'parentsNote', 'lineage', 'spousesNote', 'childrenNote', 'siblingsNote', 'kinNote', 'chronoNote', 'withGod', 'messiahNote', 'laterMentions'] as const) for (const f of c[k] ?? []) add(f.refs);
    for (const f of c.birth?.facts ?? []) add(f.refs);
    for (const f of c.death?.facts ?? []) add(f.refs);
    for (const f of c.death?.burial ?? []) add(f.refs);
    for (const m of c.met ?? []) add(m.refs);
    for (const pl of c.places ?? []) add(pl.refs);
    for (const o of c.offices ?? []) add(o.refs);
    for (const e of c.events ?? []) add(e.refs);
    for (const s of c.sayings ?? []) add(s.ref);
    add(c.scripture?.first);
    add(c.scripture?.key);
    add(c.scripture?.all);
    for (const n of c.notes ?? []) add(n.refs);
  }
  for (const r of p.chrono?.reign ?? []) add(r.refs);
  add(p.chrono?.active?.refs);
  return [...out];
};
const spineIds = new Set([...lines.joseph, ...lines.mary].map((s) => s.id));
const descendants = new Map<string, number>();
const countDesc = (id: string, seen = new Set<string>()): number => {
  if (descendants.has(id)) return descendants.get(id)!;
  let n = 0;
  for (const c of primaryChildren(g, id)) if (!seen.has(c)) { seen.add(c); n += 1 + countDesc(c, seen); }
  descendants.set(id, n);
  return n;
};
const ROLE_W: Record<string, number> = { messiah: 6, patriarch: 2, king: 1.6, prophet: 1.4, 'high-priest': 1.2, judge: 1.2, apostle: 1.4, matriarch: 1.2, forefather: 0.8, queen: 0.8 };
const doi = new Map<string, number>();
for (const p of persons) {
  const refs = refsOf(p).length;
  const role = Math.max(0, ...(p.roles ?? []).map((r) => ROLE_W[r] ?? 0));
  const score = Math.log2(1 + refs) + (spineIds.has(p.id) ? 1.5 : 0) + role + Math.log2(1 + countDesc(p.id)) * 0.35 + p.prominence * 1.3;
  doi.set(p.id, score);
}
const ranked = [...doi.entries()].sort((a, b) => b[1] - a[1]);
const magnitude = new Map<string, number>();
const cuts = [12, 45, 140, 380, 900, 2000];
ranked.forEach(([id], i) => {
  let m = 6;
  for (let k = 0; k < cuts.length; k++) if (i < cuts[k]) { m = k; break; }
  magnitude.set(id, m);
});

// ---------- типографика цитат ----------
const tp = new Typograf({ locale: ['ru', 'en-US'] });
const typo = (s: string) => tp.execute(s.replace(/"([^"]*)"/g, '«$1»').replace(/\s-\s/g, ' — '));

// ---------- стихи ----------
const bible = loadBible();
const cited = new Set<string>();
const addCited = (r: string) => {
  const p = parseRef(r, bible.chapterLength);
  if (!p) return;
  for (const v of p.verses.slice(0, 40)) cited.add(verseId(v));
};
for (const p of persons) for (const r of refsOf(p)) addCited(r);
for (const e of epochs) { for (const r of e.refs) addCited(r); for (const ev of e.events) for (const r of ev.refs) addCited(r); }
for (const s of [...joseph.persons, ...mary.persons]) for (const r of s.refs) addCited(r);
const versesByBook = new Map<string, Record<string, string>>();
for (const key of cited) {
  const t = bible.verses.get(key);
  if (t === undefined) continue;
  const book = key.split(' ')[0];
  const m = versesByBook.get(book) ?? {};
  m[key.slice(book.length + 1)] = typo(t);
  versesByBook.set(book, m);
}

// ---------- запись ----------
const gen = join(ROOT, 'src/generated');
if (existsSync(gen)) rmSync(gen, { recursive: true });
mkdirSync(join(gen, 'cards'), { recursive: true });
mkdirSync(join(gen, 'verses'), { recursive: true });

const r1 = (x: number) => Math.round(x * 10) / 10;
const def = results[0];
const index = persons.map((p) => {
  const c = p.card;
  const bookCounts: Record<string, number> = {};
  for (const r of refsOf(p)) {
    const pr = parseRef(r);
    if (pr) bookCounts[pr.book] = (bookCounts[pr.book] ?? 0) + Math.max(1, pr.verses.length);
  }
  return {
    id: p.id,
    n: p.name,
    d: p.disambig ?? '',
    s: p.sex,
    k: p.kind ?? 'person',
    u: p.unnamed ? 1 : 0,
    g: p.group,
    pr: p.prominence,
    mg: magnitude.get(p.id)!,
    r: p.roles ?? [],
    v: volumeOf.get(p.id)!,
    f: p.father ?? null,
    m: p.mother ?? null,
    fk: p.fatherKind ?? 'natural',
    fg: p.fatherGap ? 1 : 0,
    pc: p.parentCert ?? 'scripture',
    mc: p.motherCert ?? p.parentCert ?? 'scripture',
    pRefs: p.parentRefs ?? [],
    op: (p.otherParents ?? []).map((o) => ({ id: o.id, role: o.role, kind: o.kind, cert: o.cert, refs: o.refs })),
    sp: (p.spouses ?? []).map((s) => ({ id: s.id, kind: s.kind, refs: s.refs, cert: s.cert ?? 'scripture', ...(s.note ? { note: s.note } : {}) })),
    kin: (p.kin ?? []).map((k) => ({ id: k.id, rel: k.rel, refs: k.refs, cert: k.cert ?? 'scripture' })),
    ord: p.order ?? null,
    alt: (c?.altNames ?? []).map((a) => a.name),
    books: bookCounts,
    ep: p.chrono?.epoch ?? null,
    reign: (p.chrono?.reign ?? []).map((x) => ({ over: x.over, start: x.start, end: x.end, years: x.years ?? null })),
    active: p.chrono?.active ? [p.chrono.active.from, p.chrono.active.to] : null,
    silent: c?.silent ?? [],
    filled: c ? Object.keys(c).filter((k) => k !== 'silent') : [],
  };
});
const models = results.map((res) => ({
  id: res.id,
  chrono: Object.fromEntries(
    [...res.chrono.persons].map(([id, c]) => [id, [r1(c.b), r1(c.bLo), r1(c.bHi), c.d === null ? null : r1(c.d), c.lastAttested === null ? null : r1(c.lastAttested), r1(c.dEst), c.cls, c.epoch]]),
  ),
  tensions: res.chrono.tensions,
  layout: {
    nodes: res.layout.nodes.map((n) => [n.id, n.lane, r1(n.t0), r1(n.t1), n.block, n.parentLane, n.layoutParent, n.satelliteOf, n.spine ? 1 : 0]),
    blocks: res.layout.blocks,
    laneMin: res.layout.laneMin,
    laneMax: res.layout.laneMax,
    metrics: res.layout.metrics,
  },
  scale: { knots: res.scale.knots.map(r1), xTrue: res.scale.xTrue.map(r1), xDense: res.scale.xDense.map(r1) },
}));
const atlas = {
  built: new Date().toISOString(),
  persons: index,
  models,
  modelInfo: MODELS,
  lines: { joseph, mary },
  epochs,
  groups,
  anchors,
  books: BOOKS,
  volumes: volumes.map((v) => ({ volume: v.volume, title: v.title, scope: v.scope, count: v.persons.length })),
};
writeFileSync(join(gen, 'atlas.json'), JSON.stringify(atlas));
for (const v of volumes) {
  const cards: Record<string, unknown> = {};
  for (const p of v.persons) {
    const card = p.card ? JSON.parse(JSON.stringify(p.card)) : {};
    for (const s of card.sayings ?? []) s.quote = typo(s.quote);
    cards[p.id] = { card, chrono: p.chrono ?? null };
  }
  writeFileSync(join(gen, 'cards', `${v.volume}.json`), JSON.stringify(cards));
}
for (const [book, m] of versesByBook) writeFileSync(join(gen, 'verses', `${BOOKS.findIndex((b) => b.code === book).toString().padStart(2, '0')}.json`), JSON.stringify({ book, verses: m }));

// ---------- родословные главы для чтения ----------
const CHAPTERS = ['Быт 4', 'Быт 5', 'Быт 10', 'Быт 11', 'Быт 25', 'Быт 36', 'Быт 46', 'Исх 6', 'Руф 4', '1Пар 1', '1Пар 2', '1Пар 3', '1Пар 4', '1Пар 5', '1Пар 6', '1Пар 7', '1Пар 8', '1Пар 9', 'Мф 1', 'Лк 3'];
const personsByVerse = new Map<string, Set<string>>();
for (const p of persons) {
  for (const r of refsOf(p)) {
    const pr = parseRef(r, bible.chapterLength);
    if (!pr) continue;
    for (const v of pr.verses.slice(0, 60)) {
      const k = verseId(v);
      const set = personsByVerse.get(k) ?? new Set<string>();
      set.add(p.id);
      personsByVerse.set(k, set);
    }
  }
}
const chapters: Record<string, { n: number; t: string; ids: string[] }[]> = {};
for (const ch of CHAPTERS) {
  const [book, num] = ch.split(' ');
  const len = bible.chapterLength(book, Number(num));
  const out: { n: number; t: string; ids: string[] }[] = [];
  for (let v = 1; v <= len; v++) {
    const key = `${book} ${num}:${v}`;
    const t = bible.verses.get(key);
    if (t === undefined) continue;
    out.push({ n: v, t: typo(t), ids: [...(personsByVerse.get(key) ?? [])] });
  }
  chapters[ch] = out;
}
writeFileSync(join(gen, 'chapters.json'), JSON.stringify(chapters));

// ---------- отчёт ----------
const rep: string[] = ['# Отчёт сборки данных', '', `Лиц: ${persons.length}; томов: ${volumes.length}; процитированных стихов: ${cited.size}.`, ''];
for (const res of results) {
  rep.push(`## Модель ${res.id}`, '', '```', JSON.stringify(res.layout.metrics, null, 1), '```', '', `Напряжений: ${res.chrono.tensions.length}`, '');
}
rep.push('## Хронологические напряжения (модель по умолчанию)', '');
for (const t of def.chrono.tensions.slice(0, 200)) rep.push(`- ${t.text} (${t.refs.slice(0, 4).join('; ')})`);
writeFileSync(join(ROOT, 'docs/layout-report.md'), rep.join('\n') + '\n');
const size = readFileSync(join(gen, 'atlas.json')).length;
console.log(`atlas.json: ${(size / 1024).toFixed(0)} КБ; карточек: ${volumes.length} томов; стихов: ${cited.size}`);
