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
import { loadBible, ROOT } from './bible.ts';
import { buildGraph, primaryChildren } from '../src/engine/graph.ts';
import { solveChronology, noteModelDifferences, MODELS, type ChronoResult, type WhenSpan } from '../src/engine/chronology.ts';
import { computeLayout, computeOutlines, packSpan, GHOST_SPAN, TRAIL_KINDS, type LineStep, type LayoutResult, type ListDef, type Outline } from '../src/engine/layout.ts';
import { buildTimeScale, timeToX, xToTime } from '../src/engine/timescale.ts';
import { epochDelta } from '../src/engine/epochs.ts';
import { parseRef, verseId, BOOKS } from '../src/engine/books.ts';
import { nameMatcher, norm, stripBrackets, splitParentRefs } from '../src/engine/text.ts';
import { typo } from '../src/ui/text/typo.ts';
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

// ---------- синтетические лица для замера быстродействия (NFR-1): npm run data -- --synthetic 5000 ----------
const synthArg = process.argv.indexOf('--synthetic');
const SYNTH = synthArg > 0 ? Number(process.argv[synthArg + 1]) : 0;
if (SYNTH > persons.length) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const synth: Person[] = [];
  const need = SYNTH - persons.length;
  let n = 0;
  while (synth.length < need) {
    // корень рода с явным годом, затем 3–5 поколений с возрастом отца при рождении
    const group = pick(groups).id;
    const rootId = `synth-${n++}`;
    synth.push({ id: rootId, name: `Синт ${n}`, sex: 'm', group, prominence: 2, chrono: { born: { year: -Math.round(200 + rnd() * 2200) }, died: { age: 60 + Math.round(rnd() * 60) } } } as Person);
    const queue = [{ id: rootId, depth: 0 }];
    while (queue.length && synth.length < need) {
      const cur = queue.shift()!;
      if (cur.depth >= 3 + Math.floor(rnd() * 3)) continue;
      const kids = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < kids && synth.length < need; k++) {
        const id = `synth-${n++}`;
        synth.push({
          id, name: `Синт ${n}`, sex: rnd() < 0.8 ? 'm' : 'f', father: cur.id, parentRefs: ['Быт 5:3'], group, prominence: 1, order: k + 1,
          chrono: { born: { fatherAge: 20 + Math.round(rnd() * 30) }, died: { age: 40 + Math.round(rnd() * 60) } },
        } as Person);
        queue.push({ id, depth: cur.depth + 1 });
      }
    }
  }
  volumes.push({ volume: 'zz', title: 'Синтетические лица', persons: synth } as Volume);
  for (const p of synth) {
    persons.push(p);
    volumeOf.set(p.id, 'zz');
  }
  console.log(`синтетических лиц: ${synth.length}; всего: ${persons.length}`);
}
const anchors = read<{ anchors: unknown[] }>('data/anchors.json');
const joseph = read<{ persons: LineStep[]; name: string; subtitle: string; basis: string; refs: string[] }>('data/lines/joseph.json');
const mary = read<{ persons: LineStep[]; name: string; subtitle: string; basis: string; refs: string[] }>('data/lines/mary.json');

const g = buildGraph(persons);
const lines = {
  joseph: joseph.persons.filter((s) => g.persons.has(s.id)),
  mary: mary.persons.filter((s) => g.persons.has(s.id)),
};

// ---------- хронология и раскладка по всем моделям ----------
// списки имён без родства — скопления на небе (E2): data/lists.json
const lists = read<{ lists: ListDef[] }>('data/lists.json').lists;
// дом → колено: контур колена обводит и его дома (E8)
const groupParents: Record<string, string> = Object.fromEntries(groups.filter((gr) => gr.parent).map((gr) => [gr.id, gr.parent!]));
const results: { id: string; chrono: ChronoResult; layout: LayoutResult; scale: ReturnType<typeof buildTimeScale>; outlines: Outline[] }[] = [];
for (const m of MODELS) {
  const t0 = performance.now();
  const chrono = solveChronology(g, epochs, m.id);
  // эпохи в годах этой модели (CARD-60): время скоплений «по эпохе» — тоже по ним
  const layout = computeLayout(g, chrono, lines, { lists, epochs: chrono.epochs ?? epochs });
  // насыщенность времени — по годам решателя и месту лиц в полосах, как до честных следов и скоплений (A14, E2):
  // масштаб «по насыщенности» от них не меняется
  const births = [...chrono.persons.values()].map((c) => c.b);
  const spans = [...chrono.persons.values()].map((c) => packSpan(c));
  for (const n of layout.nodes) if (n.ghost) spans.push([n.t0, n.t0 + GHOST_SPAN]);
  const scale = buildTimeScale(births, spans);
  // контуры созвездий (E8) — в единицах масштаба «по насыщенности», вершины — в годах
  const outlines = computeOutlines(g, layout, (t) => timeToX(scale, t, 1), (x) => xToTime(scale, x, 1), groupParents);
  results.push({ id: m.id, chrono, layout, scale, outlines });
  console.log(`модель ${m.id}: ${(performance.now() - t0).toFixed(0)} мс · напряжений ${chrono.tensions.length} · контуров ${outlines.length} · метрики ${JSON.stringify(layout.metrics)}`);
}

// в каких моделях напряжения нет — проверено расчётом всех моделей
noteModelDifferences(results.map((r) => ({ model: r.chrono.model, tensions: r.chrono.tensions })));

// ---------- значимость → звёздная величина (степень интереса по Фурнасу) ----------
/** Все ссылки лица; notes: false — без примечаний § 24 (они часто ведут к другим лицам: «не смешивать с…»). */
const refsOf = (p: Person, opts: { notes?: boolean } = {}): string[] => {
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
    if (opts.notes !== false) for (const n of c.notes ?? []) add(n.refs);
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
// Та же функция, что у строк интерфейса (src/ui/text/typo.ts, B5): стих во вклейке и строка карточки набраны по одним правилам.
// Прежний typograf менял сам текст стиха: вставлял запятую после скобки («[и обыскивал,], но», Быт 31:33) и пробел
// внутри скобок; typo() меняет только пробелы, кавычки, тире и многоточие.

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

// ---------- § 23: в скольких стихах лицо названо по имени ----------
// Считаются стихи основного текста (без вставок в скобках), где стоит имя лица или его иная форма (§ 4; титулы и прозвания — нет).
// Имя ищется сопоставителем форм nameMatcher (склонение, притяжательные «Давидов», «Илиев») среди слов
// с прописной буквы: имена в Синодальном тексте пишутся с прописной, а совпадающие с ними слова («дано», «гады») — нет.
// Если имя носят и другие лица атласа, или это имя колена или народа (Завулон, Моав, Хам), или это иная форма
// (Израиль — и Иаков, и народ), стихи считаются только в главах, на которые ссылается карточка (без § 24),
// а в главе, которую цитирует и одноимённый, — только стихи, на которые ссылается карточка.
const t23 = performance.now();
const wordVerses = new Map<string, string[]>(); // словоформа → стихи
for (const [key, text] of bible.verses) {
  const seenWords = new Set<string>();
  for (const w of stripBrackets(text).match(/[А-ЯЁ][а-яё]*(?:[-—–][А-ЯЁа-яё][а-яё]*)*/g) ?? []) {
    const n = norm(w);
    if (seenWords.has(n)) continue;
    seenWords.add(n);
    const a = wordVerses.get(n);
    if (a) a.push(key);
    else wordVerses.set(n, [key]);
  }
}
const byPrefix = new Map<string, string[]>(); // первые две буквы → словоформы
for (const w of wordVerses.keys()) {
  const k = w.slice(0, 2);
  const a = byPrefix.get(k);
  if (a) a.push(w);
  else byPrefix.set(k, [w]);
}
const firstWord = (name: string) => norm(name).split(/\s+/)[0];
/** Словоформы текста, в которых названо имя (формы «Руфь», «Руфью», «Додова» находит сам nameMatcher). */
const formsCache = new Map<string, string[]>();
const formsOf = (name: string): string[] => {
  const w0 = firstWord(name);
  if (formsCache.has(w0)) return formsCache.get(w0)!;
  const re = nameMatcher(name);
  const out = (byPrefix.get(w0.slice(0, 2)) ?? []).filter((w) => re.test(` ${w} `));
  formsCache.set(w0, out);
  return out;
};
// одноимённые: имя одного лица совпадает с именем или иной формой другого (Иисус Христос и Иисус Навин, Руфь и Руф)
type NameEntry = { pid: string; word: string; re: RegExp };
const nameEntries: NameEntry[] = [];
for (const p of persons) {
  if (p.unnamed) continue;
  const names = [p.name, ...(p.card?.altNames ?? []).filter((a) => a.kind !== 'title' && a.kind !== 'epithet').map((a) => a.name)];
  for (const n of names) nameEntries.push({ pid: p.id, word: firstWord(n), re: nameMatcher(n) });
}
const entriesByPrefix = new Map<string, NameEntry[]>();
for (const e of nameEntries) {
  const k = e.word.slice(0, 2);
  const a = entriesByPrefix.get(k);
  if (a) a.push(e);
  else entriesByPrefix.set(k, [e]);
}
/** Одноимённые лица: чьё имя ловит сопоставитель этого лица («Мелхи» не мешает счёту «Мелхиседека», «Руф» мешает счёту «Руфи»). */
const namesakes = (p: Person): string[] => {
  const w = firstWord(p.name);
  const re = nameMatcher(p.name);
  return [...new Set((entriesByPrefix.get(w.slice(0, 2)) ?? []).filter((e) => e.pid !== p.id && (e.word === w || re.test(` ${e.word} `))).map((e) => e.pid))];
};
// имена колен и народов на небе: «Колено Завулоново», «Моав», «Сыны Хама», «Хорреи Сеира»
const groupWords = groups.filter((gr) => gr.kind === 'tribe' || gr.kind === 'nation').flatMap((gr) => norm(gr.name).split(/[^а-я-]+/).filter((w) => w.length > 2));
const eponym = (p: Person): boolean => {
  const re = nameMatcher(p.name);
  return groupWords.some((w) => re.test(` ${w} `));
};
/** Главы и стихи, на которые ссылается карточка лица (без § 24); целая глава или длинный диапазон — только главой. */
const citedCache = new Map<string, { chapters: Set<string>; verses: Set<string> }>();
const citedBy = (p: Person) => {
  const have = citedCache.get(p.id);
  if (have) return have;
  const chapters = new Set<string>();
  const verses = new Set<string>();
  for (const r of refsOf(p, { notes: false })) {
    const pr = parseRef(r, bible.chapterLength);
    if (pr && pr.chapterOnly) chapters.add(`${pr.book} ${pr.chapterOnly}`);
    else if (pr)
      for (const v of pr.verses) {
        chapters.add(`${v.book} ${v.chapter}`);
        verses.add(verseId(v));
      }
    else {
      // межглавный диапазон длиннее трёх глав: «Быт 12:1-25:10»
      const m = /^(\S+)\s+(\d+)(?::\d+)?(?:-(\d+):\d+)?/.exec(r.replace(/[–—]/g, '-'));
      if (m) for (let ch = Number(m[2]); ch <= Number(m[3] ?? m[2]); ch++) chapters.add(`${m[1]} ${ch}`);
    }
  }
  const out = { chapters, verses };
  citedCache.set(p.id, out);
  return out;
};
const personById = new Map(persons.map((p) => [p.id, p]));
const booksOf = new Map<string, Record<string, number>>(); // для § 23 карточки; в индекс неба не входит
const mentionsOf = new Map<string, { n: number; scope: 'bible' | 'chapters' }>();
let restrictedCount = 0;
for (const p of persons) {
  if (p.unnamed) {
    booksOf.set(p.id, {});
    continue;
  }
  const kind = p.kind ?? 'person';
  const rivals = namesakes(p);
  const restrict = kind !== 'person' || rivals.length > 0 || eponym(p);
  if (restrict) restrictedCount++;
  const cited = citedBy(p);
  // глава, которую цитирует и одноимённый (Лк 3 — четыре Иосифа): в ней — только стихи, на которые ссылается эта карточка
  const rivalChapters = new Set(rivals.flatMap((r) => [...citedBy(personById.get(r)!).chapters]));
  const inChapters = (v: string) => {
    const ch = v.slice(0, v.indexOf(':'));
    return cited.chapters.has(ch) && (!rivalChapters.has(ch) || cited.verses.has(v));
  };
  const verses = new Set<string>();
  for (const w of formsOf(p.name)) for (const v of wordVerses.get(w)!) if (!restrict || inChapters(v)) verses.add(v);
  // иные имена, но не титулы и прозвания: «Дева» (Ис 7:14) и «Благодатная» — не имя Марии
  for (const a of p.card?.altNames ?? []) {
    if (a.kind === 'title' || a.kind === 'epithet') continue;
    for (const w of formsOf(a.name)) for (const v of wordVerses.get(w)!) if (inChapters(v)) verses.add(v);
  }
  const counts: Record<string, number> = {};
  for (const v of verses) {
    const book = v.slice(0, v.indexOf(' '));
    counts[book] = (counts[book] ?? 0) + 1;
  }
  booksOf.set(p.id, counts);
  if (verses.size) mentionsOf.set(p.id, { n: verses.size, scope: restrict ? 'chapters' : 'bible' });
}
console.log(`§ 23: упоминания по имени — ${(performance.now() - t23).toFixed(0)} мс; счёт в главах карточки у ${restrictedCount} лиц; без упоминаний ${persons.length - mentionsOf.size}`);

// ---------- запись ----------
const gen = join(ROOT, 'src/generated');
if (existsSync(gen)) rmSync(gen, { recursive: true });
mkdirSync(join(gen, 'cards'), { recursive: true });
mkdirSync(join(gen, 'verses'), { recursive: true });

const r1 = (x: number) => Math.round(x * 10) / 10;
const def = results[0];
const index = persons.map((p) => {
  const c = p.card;
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
    ep: p.chrono?.epoch ?? null,
    // синхронизмы текста «в N-й год X воцарился Y» — для ярусов эпох (MAP-47)
    reign: (p.chrono?.reign ?? []).map((x) => ({ over: x.over, start: x.start, end: x.end, years: x.years ?? null, ...(x.sync?.length ? { sync: x.sync } : {}) })),
    active: p.chrono?.active ? [p.chrono.active.from, p.chrono.active.to] : null,
    silent: c?.silent ?? [],
  };
});
// значения по умолчанию не пишутся в индекс (NFR-2: индекс неба ≤ 200 КБ gzip); atlas.ts восстанавливает их
const DEFAULTS: Record<string, unknown> = { d: '', k: 'person', u: 0, r: [], f: null, m: null, fk: 'natural', fg: 0, pc: 'scripture', pRefs: [], op: [], sp: [], kin: [], ord: null, alt: [], books: {}, ep: null, reign: [], active: null, silent: [], filled: [] };
const isDefault = (k: string, v: unknown) => k in DEFAULTS && JSON.stringify(DEFAULTS[k]) === JSON.stringify(v);
const compactIndex = index.map((row) => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'mc' && v === row.pc) continue; // мать — тем же уровнем, что и отец
    if (!isDefault(k, v)) o[k] = v;
  }
  return o;
});
const yr = (x: number) => Math.round(x);
/** Откуда скобка «время не установлено» — одной буквой (src/data/atlas.ts, decodeWhen). */
const WHEN_CODE: Record<WhenSpan['by'], string> = {
  met: 'm', kin: 'k', mention: 'r', epoch: 'e', bounds: 'b', group: 'g',
};
// хронология и узлы раскладки — массивами по номеру лица в индексе, годы — разностями (сжимаются вдвое лучше)
const personIndex = new Map(index.map((p, i) => [p.id, i]));
const pi = (id: string | null) => (id === null ? null : personIndex.get(id) ?? null);
const models = results.map((res) => ({
  id: res.id,
  chrono: index.map((p) => {
    const c = res.chrono.persons.get(p.id);
    if (!c) return null;
    const b = yr(c.b);
    const rel = (x: number | null) => (x === null ? null : yr(x) - b);
    const row: unknown[] = [b, rel(c.bLo), rel(c.bHi), rel(c.d), rel(c.lastAttested), rel(c.dEst), c.cls, c.epoch];
    // A14: интервал смерти и «умер младенцем»; этап 7 (K1): признаки (1 — народ или род без года рождения, CARD-59;
    // 2 — год по порядку перечисления братьев, MAP-54) и откуда скобка «время не установлено» (MAP-52).
    // Только если есть (atlas.ts восстанавливает null, false и undefined)
    // этап 7, круг 3: 4 — свой год смерти, не по возрасту (dAge = false; CARD-79); год знака у первого засвидетельствованного
    // года (MAP-69) — 14-м полем, разностью от рождения
    const flags = (c.named ? 1 : 0) | (c.byOrder ? 2 : 0) | (c.dAge === false ? 4 : 0);
    const when = c.when ? `${WHEN_CODE[c.when.by]}${c.when.id ? `:${c.when.id}` : c.when.ref ? `:${c.when.ref}` : ''}` : null;
    const extra: unknown[] = [c.infant ? 1 : 0, flags, when, c.mark === undefined ? null : yr(c.mark) - b];
    let k = extra.length;
    while (k > 0 && (extra[k - 1] === 0 || extra[k - 1] === null)) k--;
    if (c.dLo !== null || k > 0) row.push(rel(c.dLo), rel(c.dHi), ...extra.slice(0, k));
    return row;
  }),
  tensions: res.chrono.tensions,
  // эпохи в годах модели (CARD-60): только отличия от data/epochs.json — id → [начало, конец, годы событий]
  ...(() => {
    const d = epochDelta(epochs, res.chrono.epochs ?? epochs);
    return Object.keys(d).length ? { epochs: d } : {};
  })(),
  layout: {
    // [лицо (для призрака — −(номер+1)), полоса, t0 − рождение, t1 − t0, блок, полоса родителя, родитель раскладки, спутник чего, хребет, след,
    //  разрыв следа − t0 (MAP-51; только если есть, иначе null перед полосой рождения),
    //  полоса рождения [начало − t0, конец − t0] и оценка рождения − t0 (MAP-69; только у знака у первого свидетельства)]
    // t1 — конец рисуемого следа (layout.ts, п. 7); след — номер в TRAIL_KINDS: life, people, infant, list, ghost, epochal
    nodes: res.layout.nodes.map((n) => {
      const ghost = n.id.startsWith('ghost:');
      const person = ghost ? n.id.slice(6) : n.id;
      const k = personIndex.get(person)!;
      const b = yr(res.chrono.persons.get(person)?.b ?? 0); // так же считает atlas.ts
      const row = [ghost ? -(k + 1) : k, n.lane, yr(n.t0) - b, yr(n.t1) - yr(n.t0), n.block, n.parentLane, pi(n.layoutParent), pi(n.satelliteOf), n.spine ? 1 : 0, TRAIL_KINDS.indexOf(n.trail)];
      if (n.brk !== undefined || n.band) row.push(n.brk === undefined ? null : yr(n.brk) - yr(n.t0));
      if (n.band) row.push(yr(n.band[0]) - yr(n.t0), yr(n.band[1]) - yr(n.t0), yr(n.born!) - yr(n.t0));
      return row;
    }),
    // у скоплений (E2) — cluster: годы в десятых долях года, как у контуров
    blocks: res.layout.blocks.map((bl) =>
      bl.cluster
        ? { ...bl, t0: r1(bl.t0), t1: r1(bl.t1), cluster: { ...bl.cluster, t0: r1(bl.cluster.t0), t1: r1(bl.cluster.t1), tc: r1(bl.cluster.tc), span: bl.cluster.span.map(r1) } }
        : bl,
    ),
    laneMin: res.layout.laneMin,
    laneMax: res.layout.laneMax,
    metrics: res.layout.metrics,
    // контуры созвездий (E8): кольца — [год·10, полоса·20, затем разности], места под название — [полоса·20, высота, год·10, год·10]
    outlines: res.outlines.map((o) => ({
      g: o.group,
      ...(o.parent ? { p: o.parent } : {}),
      n: o.size,
      r: o.rings.map((ring) => {
        const flat: number[] = [];
        let pt = 0;
        let pl = 0;
        for (const [t, l] of ring) {
          const qt = Math.round(t * 10);
          const ql = Math.round(l * 20);
          flat.push(qt - pt, ql - pl);
          pt = qt;
          pl = ql;
        }
        return flat;
      }),
      s: o.slots.map((s) => [Math.round(s.lane * 20), s.h, Math.round(s.t0 * 10), Math.round(s.t1 * 10)]),
    })),
  },
  scale: { knots: res.scale.knots.map(r1), xTrue: res.scale.xTrue.map(r1), xDense: res.scale.xDense.map(r1) },
}));
const atlas = {
  built: new Date().toISOString(),
  persons: compactIndex,
  // в индексе — только модель по умолчанию; остальные подгружаются при переключении (src/generated/models/*.json)
  models: models.slice(0, 1),
  modelInfo: MODELS,
  lines: { joseph, mary },
  epochs,
  groups,
  anchors,
  books: BOOKS,
  volumes: volumes.map((v) => ({ volume: v.volume, title: v.title, scope: v.scope, count: v.persons.length })),
};
writeFileSync(join(gen, 'atlas.json'), JSON.stringify(atlas));
mkdirSync(join(gen, 'models'), { recursive: true });
for (const m of models.slice(1)) writeFileSync(join(gen, 'models', `${m.id}.json`), JSON.stringify(m));
// ---------- стихи родства: свои у отца и у матери (§ 6; CARD-32) ----------
/** Текст стиха (или диапазона) и три предыдущих стиха той же главы, ближайший первым. */
const verseCtx = (r: string): { text: string; before: string[] } | null => {
  const pr = parseRef(r, bible.chapterLength);
  if (!pr || !pr.verses.length) return null;
  const text = pr.verses.map((v) => bible.verses.get(verseId(v)) ?? '').join(' ');
  const v0 = pr.verses[0];
  const before: string[] = [];
  for (let k = v0.verse - 1; k >= Math.max(1, v0.verse - 3); k--) before.push(bible.verses.get(verseId({ ...v0, verse: k })) ?? '');
  return { text, before };
};
const ownNames = (id: string): string[] => {
  const q = personById.get(id);
  return q && !q.unnamed ? [q.name, ...(q.card?.altNames ?? []).filter((a) => a.kind !== 'title' && a.kind !== 'epithet').map((a) => a.name)] : [];
};
let splitCount = 0;
const parentRefsBy = (p: Person): { father: string[]; mother: string[] } | null => {
  const refs = p.parentRefs ?? [];
  if (!p.father || !p.mother || refs.length < 2) return null;
  const fn = ownNames(p.father);
  const mn = ownNames(p.mother);
  if (!fn.length || !mn.length) return null;
  const s = splitParentRefs(refs, fn, mn, verseCtx);
  if (s.father.length === refs.length && s.mother.length === refs.length) return null;
  splitCount++;
  return s;
};

// встречи, записанные у других лиц (§ 14; CARD-80): в карточку того, с кем встреча, — metBy, чтобы § 14 не зависел
// от того, какие тома уже загружены (L8a, обход 2 660 карточек)
const metByOf = new Map<string, { id: string; text?: string; refs: string[] }[]>();
for (const v of volumes)
  for (const p of v.persons)
    for (const mt of p.card?.met ?? []) metByOf.set(mt.id, [...(metByOf.get(mt.id) ?? []), { id: p.id, ...(mt.text ? { text: mt.text } : {}), refs: mt.refs }]);

for (const v of volumes) {
  const cards: Record<string, unknown> = {};
  for (const p of v.persons) {
    const card = p.card ? JSON.parse(JSON.stringify(p.card)) : {};
    for (const s of card.sayings ?? []) s.quote = typo(s.quote);
    const split = parentRefsBy(p);
    if (split) card.parentRefsBy = split;
    const metBy = metByOf.get(p.id);
    if (metBy?.length) card.metBy = metBy;
    const mentions = mentionsOf.get(p.id);
    cards[p.id] = { card, chrono: p.chrono ?? null, books: booksOf.get(p.id) ?? {}, ...(mentions ? { mentions } : {}) };
  }
  writeFileSync(join(gen, 'cards', `${v.volume}.json`), JSON.stringify(cards));
}
console.log(`§ 6: стихи родства разделены между отцом и матерью у ${splitCount} лиц`);
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
if (!SYNTH) writeFileSync(join(ROOT, 'docs/layout-report.md'), rep.join('\n') + '\n');
const size = readFileSync(join(gen, 'atlas.json')).length;
console.log(`atlas.json: ${(size / 1024).toFixed(0)} КБ; карточек: ${volumes.length} томов; стихов: ${cited.size}`);
