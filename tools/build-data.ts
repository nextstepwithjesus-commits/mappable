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
import { createHash } from 'node:crypto';
import { loadBible, ROOT } from './bible.ts';
import { buildGraph, primaryChildren } from '../src/engine/graph.ts';
import { solveChronology, noteModelDifferences, modelDependence, lifeDatesOf, MODELS, type ChronoResult, type WhenSpan, type YearBasis, type BasisKind } from '../src/engine/chronology.ts';
import type { LifeDates } from '../src/engine/years.ts';
import { computeOutlines, packSpan, GHOST_SPAN, TRAIL_KINDS, type LineStep, type ListDef, type Outline } from '../src/engine/layout.ts';
import { computeHouseLayout, type HouseLayout } from '../src/engine/house.ts';
import { buildTimeScale, timeToX, xToTime } from '../src/engine/timescale.ts';
import { epochDelta } from '../src/engine/epochs.ts';
import { parseRef, verseId, BOOKS } from '../src/engine/books.ts';
import { splitParentRefs } from '../src/engine/text.ts';
import { typo } from '../src/ui/text/typo.ts';
import { refsOf, countMentions } from './mentions.ts';
import { allDataRefs, refVerses } from './data-refs.ts';
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
// априорное условие раскладки (ТЗ § 8.3, п. 5; NFR-3): полосы опорных лиц прежнего выпуска — стороны созвездий и места
// блоков сохраняются (src/engine/layout.ts, п. 8); снимок обновляет только npm run -s coords -- --accept. Снимок — модели
// по умолчанию, и условие ставится только ей: в других моделях годы другие, и прежние места ухудшили бы их метрики
const prior = existsSync(join(ROOT, 'data/coords-snapshot.json')) ? read<{ persons: { id: string; lane: number }[] }>('data/coords-snapshot.json').persons : [];
const results: { id: string; chrono: ChronoResult; layout: HouseLayout; scale: ReturnType<typeof buildTimeScale>; outlines: Outline[] }[] = [];
for (const m of MODELS) {
  const t0 = performance.now();
  const chrono = solveChronology(g, epochs, m.id);
  // эпохи в годах этой модели (CARD-60): время скоплений «по эпохе» — тоже по ним
  // «Отчий дом» (решение 173; src/engine/house.ts): первый проход раскладки, дома коридора, второй проход, все дома
  const layout = computeHouseLayout(g, chrono, lines, { lists, epochs: chrono.epochs ?? epochs, ...(m.id === MODELS[0].id ? { prior } : {}) });
  // насыщенность времени — по годам решателя и месту лиц в полосах, как до честных следов и скоплений (A14, E2):
  // масштаб «по насыщенности» от них не меняется
  const births = [...chrono.persons.values()].map((c) => c.b);
  const spans = [...chrono.persons.values()].map((c) => packSpan(c));
  for (const n of layout.nodes) if (n.ghost) spans.push([n.t0, n.t0 + GHOST_SPAN]);
  const scale = buildTimeScale(births, spans);
  // контуры созвездий (E8) — в единицах масштаба «по насыщенности», вершины — в годах
  const outlines = computeOutlines(g, layout, (t) => timeToX(scale, t, 1), (x) => xToTime(scale, x, 1), groupParents);
  results.push({ id: m.id, chrono, layout, scale, outlines });
  const P = layout.plan;
  console.log(`модель ${m.id}: ${(performance.now() - t0).toFixed(0)} мс (раскладка ${layout.ms.first.toFixed(0)} + второй проход ${layout.ms.second.toFixed(0)} + дома ${layout.ms.houses.toFixed(0)}) · напряжений ${chrono.tensions.length} · контуров ${outlines.length} · домов ${P.houses}, переходов ${P.glides.length}, призраков ${P.natalGhosts.length} + ${P.ghosts.length} · метрики ${JSON.stringify(layout.metrics)}`);
}

// в каких моделях напряжения нет — проверено расчётом всех моделей
noteModelDifferences(results.map((r) => ({ model: r.chrono.model, tensions: r.chrono.tensions })));
// какие годы меняются между моделями и сводка каждой модели (этап 13, решения 96, 102)
const dependence = modelDependence(g, results.map((r) => r.chrono));
console.log(`модели: годы меняются у ${dependence.persons.size} лиц; ${dependence.info.map((m) => `${m.id} — сдвинуто ${m.shifted}, после Исхода ${m.afterExodus.reduce((n, a) => n + a.ids.length, 0)}`).join('; ')}`);
/**
 * Годы в других моделях (IdxPerson.modelDep) — id модели → сдвиг k (число), если все годы лица в этой модели — годы модели
 * по умолчанию, сдвинутые на k лет (так у большинства: всё до Исхода в «Кратком пребывании» — на 215 лет), иначе
 * [b, bLo − b, bHi − b, d − b | null, класс, признаки, dLo − b, dHi − b]; признаки: 1 — свой год смерти (dAge = false),
 * 2 — рождение приблизительно, 4 — смерть приблизительно, 8 / 16 — оценка на границе «не раньше» / «не позже»,
 * 32 — свой год смерти закреплён (src/data/atlas.ts, decodeModelDep).
 */
function depRow(c: LifeDates): unknown[] {
  const b = Math.round(c.b);
  const rel = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x) - b);
  const f = (c.dAge === false ? 1 : 0) | (c.bApprox ? 2 : 0) | (c.dApprox ? 4 : 0) | (c.pin === 'lo' ? 8 : 0) | (c.pin === 'hi' ? 16 : 0) | (c.dFixed ? 32 : 0);
  const row: unknown[] = [b, rel(c.bLo), rel(c.bHi), rel(c.d), c.cls, f];
  if (c.dAge === false && !c.dFixed) row.push(rel(c.dLo), rel(c.dHi));
  return row;
}
/**
 * Годы лица в других моделях (IdxPerson.modelDep): массив по моделям после модели по умолчанию (MODELS[1…]) — сдвиг
 * от годов модели по умолчанию или полная строка; null — годы те же (NFR-2: без имён моделей в каждой записи).
 */
function encodeModelDep(id: string, md: Partial<Record<string, LifeDates>> | undefined): unknown[] | undefined {
  const obj = encodeModelDepObj(id, md);
  const out = MODELS.slice(1).map((m) => (m.id in obj ? obj[m.id] : null));
  while (out.length && out[out.length - 1] === null) out.pop();
  return out.length ? out : undefined;
}
function encodeModelDepObj(id: string, md: Partial<Record<string, LifeDates>> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const c0 = results[0].chrono.persons.get(id);
  for (const [k, c] of Object.entries(md ?? {})) {
    if (!c) continue;
    const row = depRow(c);
    if (c0) {
      const base = depRow(lifeDatesOf(c0));
      const shift = (row[0] as number) - (base[0] as number);
      if (JSON.stringify([shift, ...row.slice(1)]) === JSON.stringify([shift, ...base.slice(1)])) {
        out[k] = shift;
        continue;
      }
    }
    out[k] = row;
  }
  return out;
}

// ---------- значимость → звёздная величина (степень интереса по Фурнасу) ----------
// все ссылки лица — refsOf (tools/mentions.ts)
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
// Весь диапазон, без предела длины, и межглавные ссылки — по длинам глав (решение 129): стихи всех ссылок данных,
// где бы они ни стояли, со стихами хронологических входов (born, died, reign, sync, active), линий, эпох, опор, списков
const addCited = (r: string) => {
  for (const k of refVerses(r, bible.chapterLength) ?? []) cited.add(k);
};
for (const r of allDataRefs()) addCited(r);
for (const p of persons) for (const r of refsOf(p)) addCited(r);
for (const e of epochs) { for (const r of e.refs) addCited(r); for (const ev of e.events) for (const r of ev.refs) addCited(r); }
for (const s of [...joseph.persons, ...mary.persons]) for (const r of s.refs) addCited(r);
// стихи напряжений (§ 13, § 24) — их вклейки: напряжение может ссылаться на стих, которого нет в карточках (DF2)
for (const res of results) for (const t of res.chrono.tensions) for (const r of t.refs) addCited(r);
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
// Правила счёта — в tools/mentions.ts: тёзки, «не смешивать с…» § 24, места, книги карточки у лиц значимости 1–3 (DF2)
const t23 = performance.now();
const counted = countMentions(persons, groups, bible);
const booksOf = counted.books; // для § 23 карточки; в индекс неба не входит
const mentionsOf = counted.mentions;
console.log(`§ 23: упоминания по имени — ${(performance.now() - t23).toFixed(0)} мс; счёт в главах карточки у ${counted.restricted} лиц; без упоминаний ${persons.length - mentionsOf.size}`);
const personById = new Map(persons.map((p) => [p.id, p]));

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
    mgap: p.motherGap ? 1 : 0,
    // синхронизмы текста «в N-й год X воцарился Y» — для ярусов эпох (MAP-47); sole — начало единоличного царствования (решение 103)
    reign: (p.chrono?.reign ?? []).map((x) => ({ over: x.over, start: x.start, end: x.end, years: x.years ?? null, ...(x.sole !== undefined ? { sole: x.sole } : {}), ...(x.sync?.length ? { sync: x.sync } : {}) })),
    active: p.chrono?.active ? [p.chrono.active.from, p.chrono.active.to] : null,
    silent: c?.silent ?? [],
    // годы в других моделях, где они другие (решения 96, 102; src/data/atlas.ts, decodeModelDep)
    md: encodeModelDep(p.id, dependence.persons.get(p.id)),
  };
});
// значения по умолчанию не пишутся в индекс (NFR-2: индекс неба ≤ 200 КБ gzip); atlas.ts восстанавливает их
const DEFAULTS: Record<string, unknown> = { d: '', k: 'person', u: 0, r: [], f: null, m: null, fk: 'natural', fg: 0, pc: 'scripture', pRefs: [], op: [], sp: [], kin: [], ord: null, alt: [], books: {}, ep: null, mgap: 0, reign: [], active: null, silent: [], filled: [], md: undefined };
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
/** Основание года — строкой «вид|номера лиц|вверх,вниз|ссылка|опора» (src/data/atlas.ts, decodeBasis). */
const BASIS_KINDS: BasisKind[] = ['numbers', 'reign', 'year', 'kin', 'order', 'active', 'met', 'mention', 'epoch', 'bounds', 'group', 'interp', 'people'];
/** Опора явного года (основание «year»): год → id опоры data/anchors.json, в том числе производные годы (derived). */
const anchorOfYear = new Map<number, string>();
for (const a of (anchors as { anchors: { id: string; value: number; derived?: { year: number }[] }[] }).anchors) {
  if (!anchorOfYear.has(a.value)) anchorOfYear.set(a.value, a.id);
  for (const d of a.derived ?? []) if (!anchorOfYear.has(d.year)) anchorOfYear.set(d.year, a.id);
}
/** У явного года — его опора: год рождения, смерти или начала деятельности лица, совпадающий с опорой или производным. */
function withAnchor(id: string, b: YearBasis): YearBasis {
  if (b.kind !== 'year' || b.anchor) return b;
  const c = personById.get(id)?.chrono;
  for (const y of [c?.born?.year, c?.died?.year, c?.active?.from]) if (y !== undefined && anchorOfYear.has(y)) return { ...b, anchor: anchorOfYear.get(y) };
  return b;
}
function encodeBasis(b: YearBasis): string {
  const parts = [String(BASIS_KINDS.indexOf(b.kind)), (b.ids ?? []).map((x) => personIndex.get(x) ?? x).join(','), b.gens ? b.gens.join(',') : '', b.ref ?? '', b.anchor ?? ''];
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('|');
}
/** Откуда скобка «время не установлено» — одной буквой (src/data/atlas.ts, decodeWhen). */
const WHEN_CODE: Record<WhenSpan['by'], string> = {
  met: 'm', kin: 'k', mention: 'r', epoch: 'e', bounds: 'b', group: 'g',
};
// хронология и узлы раскладки — массивами по номеру лица в индексе, годы — разностями (сжимаются вдвое лучше)
const personIndex = new Map(index.map((p, i) => [p.id, i]));
/** Номер эпохи в data/epochs.json (в индексе эпохи — в том же порядке); −1 — нет или неизвестна. */
const epochNo = (e: string | null | undefined) => (e ? epochs.findIndex((x) => x.id === e) : -1);
const pi = (id: string | null) => (id === null ? null : personIndex.get(id) ?? null);
const models = results.map((res) => ({
  id: res.id,
  chrono: index.map((p) => {
    const c = res.chrono.persons.get(p.id);
    if (!c) return null;
    const b = yr(c.b);
    const rel = (x: number | null) => (x === null ? null : yr(x) - b);
    // эпоха — номером в data/epochs.json (NFR-2), −1 — нет
    const row: unknown[] = [b, rel(c.bLo), rel(c.bHi), rel(c.d), rel(c.lastAttested), rel(c.dEst), c.cls, epochNo(c.epoch)];
    // A14: интервал смерти и «умер младенцем»; этап 7 (K1): признаки (1 — народ или род без года рождения, CARD-59;
    // 2 — год по порядку перечисления братьев, MAP-54) и откуда скобка «время не установлено» (MAP-52).
    // Только если есть (atlas.ts восстанавливает null, false и undefined)
    // этап 7, круг 3: 4 — свой год смерти, не по возрасту (dAge = false; CARD-79); год знака у первого засвидетельствованного
    // года (MAP-69) — 14-м полем, разностью от рождения
    // этап 13 (контракт 1): 8 — год рождения приблизителен по данным, 64 — год смерти; 16 / 32 — оценка на границе
    // текста «не раньше» / «не позже»; 128 — свой год смерти закреплён (не оценка)
    const flags = (c.named ? 1 : 0) | (c.byOrder ? 2 : 0) | (c.dAge === false ? 4 : 0) | (c.bApprox ? 8 : 0) | (c.pin === 'lo' ? 16 : 0) | (c.pin === 'hi' ? 32 : 0) | (c.dApprox ? 64 : 0) | (c.dFixed ? 128 : 0);
    const when = c.when ? `${WHEN_CODE[c.when.by]}${c.when.id ? `:${c.when.id}` : c.when.ref ? `:${c.when.ref}` : ''}` : null;
    const extra: unknown[] = [c.infant ? 1 : 0, flags, when, c.mark === undefined ? null : yr(c.mark) - b];
    let k = extra.length;
    while (k > 0 && (extra[k - 1] === 0 || extra[k - 1] === null)) k--;
    if (c.dLo !== null || k > 0) row.push(rel(c.dLo), rel(c.dHi), ...extra.slice(0, k));
    return row;
  }),
  tensions: res.chrono.tensions,
  // этап 13 (контракт 1): эпоха рождения и жизни (номер в data/epochs.json; у жизни −1 — та же, что рождения), основание
  // года — параллельными массивами по номеру лица (src/data/atlas.ts). Стих последнего упоминания — в теле карточки (NFR-2)
  ext: (() => {
    const eIdx = (e: string | null | undefined) => (e ? epochs.findIndex((x) => x.id === e) : -2);
    const be: (number | null)[] = [];
    const le: (number | null)[] = [];
    const bs: (string | null)[] = [];
    for (const p of index) {
      const c = res.chrono.persons.get(p.id);
      const b = c ? eIdx(c.birthEpoch) : -2;
      const l = c ? eIdx(c.lifeEpoch) : -2;
      // −1 — та же, что эпоха строки хронологии (ChronoRow.epoch): так у всех лиц, кроме редких (NFR-2)
      be.push(c && b >= 0 && b === epochNo(c.epoch) ? -1 : b < 0 ? null : b);
      le.push(l === b ? -1 : l < 0 ? null : l);
      bs.push(c?.basis ? encodeBasis(withAnchor(p.id, c.basis)) : null);
    }
    return { be, le, bs };
  })(),
  // эпохи в годах модели (CARD-60): только отличия от data/epochs.json — id → [начало, конец, годы событий]
  ...(() => {
    // от эпох модели по умолчанию (в индексе — они, с основаниями в её годах)
    const d = epochDelta(results[0].chrono.epochs ?? epochs, res.chrono.epochs ?? epochs);
    return Object.keys(d).length ? { epochs: d } : {};
  })(),
  layout: {
    // [лицо (для призрака — −(номер+1)), полоса, t0 − рождение, t1 − t0, блок, полоса родителя, родитель раскладки, спутник чего, хребет, след,
    //  разрыв следа − t0 (MAP-51; только если есть, иначе null перед полосой рождения),
    //  полоса рождения [начало − t0, конец − t0] и оценка рождения − t0 (MAP-69; только у знака у первого свидетельства)]
    // t1 — конец рисуемого следа (layout.ts, п. 7); след — номер в TRAIL_KINDS: life, people, infant, list, ghost, epochal
    nodes: res.layout.nodes.map((n) => {
      const ghost = n.id.startsWith('ghost:');
      const person = n.person;
      const k = personIndex.get(person)!;
      const b = yr(res.chrono.persons.get(person)?.b ?? 0); // так же считает atlas.ts
      // призрак бездетного брака у мужа (решение 173): satelliteOf — муж; его id — «ghost:<лицо>@<муж>» (atlas.ts)
      const row = [ghost ? -(k + 1) : k, n.lane, yr(n.t0) - b, yr(n.t1) - yr(n.t0), n.block, n.parentLane, pi(n.layoutParent), pi(n.satelliteOf), n.spine ? 1 : 0, TRAIL_KINDS.indexOf(n.trail)];
      if (n.brk !== undefined || n.band) row.push(n.brk === undefined ? null : yr(n.brk) - yr(n.t0));
      if (n.band) row.push(yr(n.band[0]) - yr(n.t0), yr(n.band[1]) - yr(n.t0), yr(n.born!) - yr(n.t0));
      return row;
    }),
    // у скоплений (E2) — cluster: годы в десятых долях года, как у контуров
    // блоки — массивами [id, основание, созвездие, прикреплён к, рядом с, сторона, полоса от, полоса до, t0, t1, размер,
    // скопление?], лица — номерами в индексе; в скоплении лица и клетки — номерами, клетка — [лицо, строка, столбец, 1 —
    // отец по сыну] (src/data/atlas.ts, decodeBlock; NFR-2)
    blocks: res.layout.blocks.map((bl) => {
      const who = (x: string | null | undefined) => (x === null || x === undefined ? null : personIndex.get(x) ?? x);
      const row: unknown[] = [bl.id, who(bl.root), bl.group, who(bl.attach), who(bl.near), bl.side, bl.laneMin, bl.laneMax, bl.cluster ? r1(bl.t0) : bl.t0, bl.cluster ? r1(bl.t1) : bl.t1, bl.size];
      if (bl.cluster) {
        const c = bl.cluster;
        row.push({
          ...c, t0: r1(c.t0), t1: r1(c.t1), tc: r1(c.tc), span: c.span.map(r1),
          members: c.members.map((x) => who(x)),
          cells: c.cells.map((x) => (x.patronym ? [who(x.id), x.row, x.col, 1] : [who(x.id), x.row, x.col])),
        });
      }
      return row;
    }),
    // «Отчий дом» (решение 173; src/engine/stays.ts): пребывания — только у лиц с переходом: [лицо, полоса рождения,
    // затем на каждый переход — начало − рождение, конец − рождение, полоса прихода]; полоса жизни — последняя (= полоса
    // узла). Годы — целые, от рождения по хронологии модели (как у узлов)
    st: res.layout.nodes.filter((n) => !n.ghost && n.stays && n.stays.length > 1).map((n) => {
      const b = yr(res.chrono.persons.get(n.person)?.b ?? 0);
      const st = n.stays!;
      const row: number[] = [personIndex.get(n.person)!, st[0].lane];
      for (let j = 1; j < st.length; j++) row.push(st[j - 1].t1 - b, st[j].t0 - b, st[j].lane);
      if (st[st.length - 1].lane !== n.lane) throw new Error(`пребывания ${n.person}: последняя полоса ${st[st.length - 1].lane} ≠ полосе узла ${n.lane}`);
      return row;
    }),
    // приход в дом мужа жены, живущей там с рождения (Д7; LayoutNode.wed): [лицо, год − рождение]
    wd: res.layout.nodes.filter((n) => !n.ghost && n.wed !== undefined).map((n) => [personIndex.get(n.person)!, n.wed! - yr(res.chrono.persons.get(n.person)?.b ?? 0)]),
    // годы черт брака (engine/stays.ts, unionYear): [муж, жена, год] — лица номерами в индексе
    uy: [...res.layout.unionYears].map(([uid, t]) => {
      const u = /^u:([^+]*)\+([^~]*)$/.exec(uid);
      if (!u) throw new Error(`год черты брака: союз ${uid}`);
      return [personIndex.get(u[1])!, personIndex.get(u[2])!, t];
    }),
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
// ---------- происхождение текста (решение 132): «О карте» показывает, по какому тексту сверены ссылки ----------
const bibleFile = readFileSync(join(ROOT, 'tools/bible/synodal.tsv'));
const bibleText = {
  name: 'Синодальный перевод (1876), 66 канонических книг, синодальная нумерация стихов',
  source: 'scrollmapper/bible_databases, formats/json/RusSynodal.json; преобразован в tools/bible/synodal.tsv',
  changes: 'исключены неканонические книги и добавления (Пс 151, Дан 3:24–90, Дан 13–14), издательские сноски (Иов 2:9; 9:9) и славянское добавление к Иов 42:17; надписание Пс 144 перенесено из Пс 143:15 на своё место; текст стихов не менялся',
  sha256: createHash('sha256').update(bibleFile).digest('hex'),
  verses: bible.verses.size,
  cited: cited.size,
};
const atlas = {
  built: new Date().toISOString(),
  bibleText,
  persons: compactIndex,
  // в индексе — только модель по умолчанию; остальные подгружаются при переключении (src/generated/models/*.json)
  models: models.slice(0, 1),
  // модели со сводкой (решение 102): сдвинуто лиц, годы опорных событий, напряжения, сдвиги после Исхода
  // сдвиги после Исхода — номерами лиц в индексе (src/data/atlas.ts, modelInfo; NFR-2)
  modelInfo: dependence.info.map((m) => ({ ...m, afterExodus: m.afterExodus.map((a) => ({ ...a, ids: a.ids.map((x) => personIndex.get(x) ?? x) })) })),
  lines: { joseph, mary },
  // эпохи модели по умолчанию: основания — её годами (решение 99; engine/epochs.ts, modelEpochs)
  // правила границ (startRule, endRule, rule событий) нужны только сборке: годы моделей уже посчитаны (NFR-2)
  epochs: (def.chrono.epochs ?? epochs).map((e) => {
    const { startRule: _s, endRule: _e, ...rest } = e as Epoch & { startRule?: unknown; endRule?: unknown };
    return { ...rest, events: e.events.map((ev) => { const { rule: _r, ...x } = ev as typeof ev & { rule?: unknown }; return x; }) };
  }),
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
    // стих последнего упоминания — там, где о смерти Писание молчит (модель по умолчанию: какое событие последнее, от модели
    // не зависит): «последнее упоминание — 30 г. по Р. Х. (Деян 1:14)» (этап 13, решение 96)
    const c0 = def.chrono.persons.get(p.id);
    const lastRef = c0 && c0.d === null && c0.lastAttested !== null ? c0.lastRef : undefined;
    cards[p.id] = { card, chrono: p.chrono ?? null, books: booksOf.get(p.id) ?? {}, ...(mentions ? { mentions } : {}), ...(lastRef ? { lastRef } : {}) };
  }
  writeFileSync(join(gen, 'cards', `${v.volume}.json`), JSON.stringify(cards));
}
console.log(`§ 6: стихи родства разделены между отцом и матерью у ${splitCount} лиц`);
// длины глав книги (число стихов по синодальной нумерации): ссылка «Быт 27:41-28:5» раскрывается в интерфейсе по ним
// (atlas.ts: loadRefVerses, chapterLengths) — в файле стихов книги, не в индексе неба (NFR-2)
const chaptersOf = (book: string): number[] => {
  const out: number[] = [];
  for (let c = 1; bible.chapterLength(book, c) > 0; c++) out.push(bible.chapterLength(book, c));
  return out;
};
for (const [book, m] of versesByBook) writeFileSync(join(gen, 'verses', `${BOOKS.findIndex((b) => b.code === book).toString().padStart(2, '0')}.json`), JSON.stringify({ book, chapters: chaptersOf(book), verses: m }));

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
