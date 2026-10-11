/**
 * Синтетика полного размера для бюджетов (10 § 4.0.1 п. 6; 09 § 7.3): каталог по верхней оценке 11 (≈ 1 500 историй,
 * ≈ 2 200 частей), словарь форм имён на все имена, 1 342 настоящие записи сводки OpenBible (`src-openbible-geo`,
 * `redistribute: true`, с пометкой), 10 000 лиц, 5 000 связей. Текст и таблица основ — настоящие (их размер не зависит от
 * разметки). Карточки — настоящие утверждения, размноженные по синтетическим лицам (размер записи как в базе).
 *
 * Каждый пакет помечен «синтетика» (`synthetic: true`, плашка), уровень «проба»; папка — только dist-pack-synth/; в выпуск не
 * идёт: загрузчик выпуска синтетику не читает (core/loader.ts), сборка выпуска в эту папку не пишет (tools/pack/build.ts).
 *
 *   npx tsx tools/pack/synth.ts [--compression gzip] [--out <папка>]
 */
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOOKS, bookNo } from '../../core/books.ts';
import { caseForms } from '../../core/search/forms.ts';
import { EXCEPTIONS } from '../../core/search/stems.ts';
import { norm } from '../../core/search/norm.ts';
import {
  PACK_SCHEMA, SYNTH_BANNER,
  type ActorRow, type CardsVolume, type Compression, type CoreIndex, type OriginRow, type PersonName, type PlaceName, type PlacePoint,
  type RelationsPack, type Stamp, type StoryRow, type ToolsIndex,
} from '../../core/types.ts';
import { loadBase } from '../base/validate.ts';
import { admission } from '../base/admit.ts';
import { buildCardVolumes, buildStems, buildTexts, splitByChapter, textWords } from './packages.ts';
import { BUDGETS } from './budgets.ts';
import { canonical, compressed } from './json.ts';
import { PACK_DIR, ROOT, assertDir, inputDigests, report } from './build.ts';
import { writePacks, type PackOut, type WriteResult } from './write.ts';

/** Объёмы синтетики (10 § 4.0.1 п. 6). */
export const SYNTH = { stories: 1500, parts: 2200, persons: 10_000, relations: 5000, places: 1342 } as const;

const STAMP: Stamp = { schema: PACK_SCHEMA, admit: 'probe', banner: SYNTH_BANNER, synthetic: true };

/** Детерминированный генератор (mulberry32): одна синтетика при каждой сборке. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
}

const SYL = ['а', 'ве', 'ми', 'ла', 'хе', 'со', 'ри', 'да', 'на', 'фа', 'ил', 'ам', 'ев', 'ор', 'ис', 'ну', 'зе', 'ки', 'по', 'та', 'ше', 'иа', 'ел', 'ав', 'ог'];
const END = ['', 'й', 'м', 'н', 'ил', 'ия', 'ай', 'ан', 'ем', 'а', 'ос', 'еф'];
const WORDS = ['Призвание', 'Исход', 'Плач', 'Песнь', 'Видение', 'Суд', 'Завет', 'Чудо', 'Притча', 'Смерть', 'Рождение', 'Помазание', 'Бегство', 'Возвращение', 'Молитва', 'Ответ', 'Слово', 'Падение', 'Победа', 'Посольство'];
const KINDS = ['human', 'human', 'human', 'human', 'group', 'angel'];
const REL = ['говорит', 'встречает', 'посылает', 'благословляет', 'враждует', 'служит', 'учит', 'исцеляет'];

function name(r: ReturnType<typeof rng>): string {
  const n = 2 + r.int(3);
  let s = '';
  for (let i = 0; i < n; i++) s += r.pick(SYL);
  s += r.pick(END);
  return s[0].toUpperCase() + s.slice(1);
}

/** Адрес в синодальной нумерации по настоящему числу глав и стихов. */
function ref(r: ReturnType<typeof rng>, chapters: Map<string, number[]>): { book: string; text: string } {
  const b = r.pick(BOOKS);
  const ch = chapters.get(b.code) ?? [10];
  const c = 1 + r.int(ch.length);
  const v = 1 + r.int(ch[c - 1]);
  const v2 = Math.min(ch[c - 1], v + r.int(20));
  return { book: b.code, text: v2 > v ? `${b.short} ${c}:${v}-${v2}` : `${b.short} ${c}:${v}` };
}

/** Записи сводки OpenBible: имя (английское — синтетика), точка, степень по оценке сводки. */
function openbible(): { names: PlaceName[]; points: PlacePoint[] } {
  const names: PlaceName[] = [];
  const points: PlacePoint[] = [];
  const lines = readFileSync(join(ROOT, 'inputs/openbible/ancient.jsonl'), 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const x = JSON.parse(line) as { id: string; friendly_id: string; identifications?: { score?: number; resolutions?: { lonlat?: string }[] }[] };
    names.push({ id: x.id, n: x.friendly_id });
    const best = x.identifications?.[0];
    const ll = best?.resolutions?.find((r) => r.lonlat)?.lonlat;
    if (!ll) continue;
    const [lon, lat] = ll.split(',').map(Number);
    const s = best?.score ?? 0;
    points.push({ id: x.id, lon: Math.round(lon * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5, deg: s >= 900 ? 'точно' : s >= 500 ? 'вероятно' : s >= 100 ? 'предположительно' : 'не установлено' });
  }
  return { names, points };
}

export function synthPacks(compression: Compression): PackOut[] {
  const r = rng(20261011);
  const base = loadBase();
  const A = admission(base, 'probe');
  const texts = buildTexts(A);
  const chapters = new Map([...texts].map(([b, t]) => [b, t.ch.map((c) => c.length)]));
  const words = textWords();

  // лица
  const persons: PersonName[] = [];
  const actors: ActorRow[] = [];
  const pool: string[] = [];
  for (let i = 0; i < 1800; i++) pool.push(name(r));
  for (let i = 0; i < SYNTH.persons; i++) {
    const id = `s${i}`;
    const n = r.pick(pool); // тёзки — как в базе: одно имя у нескольких лиц
    const k = r.pick(KINDS);
    persons.push({ id, n, ...(r.next() < 0.15 && { o: [name(r)] }), ...(r.next() < 0.3 && { d: `сын ${r.pick(pool)}` }), p: 1 + r.int(5), k });
    actors.push({ id, k, ...(k === 'human' && { s: r.next() < 0.8 ? 'm' : 'f' }), ...(r.next() < 0.3 && { d: `сын ${r.pick(pool)}` }), ...(r.next() < 0.2 && { r: ['king'] }), p: 1 + r.int(5), v: `s${String(Math.floor(i / 500)).padStart(2, '0')}` });
  }
  // словарь форм: все имена со всеми падежными формами (верхняя граница: без отбора по тексту)
  const byName = new Map<string, string[]>();
  for (const p of persons) for (const n of [p.n, ...(p.o ?? [])]) (byName.get(n) ?? byName.set(n, []).get(n)!).push(p.id);
  const names = [...byName].map(([n, ids]) => ({ forms: caseForms(n).map(norm), ids }));

  // каталог: ≈ 1 500 историй, ≈ 2 200 частей, смысловые номера
  const stories: StoryRow[] = [];
  let parts = 0;
  for (let i = 0; i < SYNTH.stories; i++) {
    const main = ref(r, chapters);
    const nParts = parts < SYNTH.parts && r.next() < 0.23 ? 2 + r.int(3) : 0;
    const ps = nParts ? Array.from({ length: nParts }, () => ({ t: `${r.pick(WORDS)} ${r.pick(pool)}`, r: ref(r, chapters).text })) : undefined;
    parts += nParts || 1;
    stories.push({
      id: `s${i}`, t: `${r.pick(WORDS)} ${r.pick(pool)}${r.next() < 0.4 ? ` и ${r.pick(pool)}` : ''}`, main: main.text,
      no: `${1 + Math.floor(i / 150)}.${1 + Math.floor((i % 150) / 12)}.${1 + (i % 12)}`,
      ...(ps && { parts: ps }),
      ...(r.next() < 0.1 && { roles: { 'в пересказе': [ref(r, chapters).text] } }),
      ...(r.next() < 0.05 && { common: [`${r.pick(WORDS)} ${r.pick(pool)}`] }),
    });
  }
  const ob = openbible();
  const core: CoreIndex = { ...STAMP, persons, places: ob.names, stories, names, exceptions: EXCEPTIONS.map((e) => e.forms), glossary: [] };

  // указатель: рёбра (дерево), союзы, родство, области, линии, переадресация, точки мест
  const origins: OriginRow[] = [];
  for (let i = 30; i < SYNTH.persons; i++) {
    origins.push({ c: `s${i}`, p: `s${r.int(i)}`, r: 'f', k: 'natural', ...(r.next() < 0.3 && { pr: 1 }) });
    if (r.next() < 0.35) origins.push({ c: `s${i}`, p: `s${r.int(i)}`, r: 'm', k: 'natural' });
  }
  const unions = Array.from({ length: 2000 }, () => ({ h: `s${r.int(SYNTH.persons)}`, w: `s${r.int(SYNTH.persons)}`, k: ['marriage'] }));
  const kin = Array.from({ length: 400 }, () => ({ f: `s${r.int(SYNTH.persons)}`, t: `s${r.int(SYNTH.persons)}`, r: r.pick(['брат', 'сестра', 'дядя']) }));
  const areas = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, n: `Род ${r.pick(pool)}`, k: r.pick(['line', 'tribe', 'clan']), ...(r.next() < 0.5 && { f: `s${r.int(SYNTH.persons)}` }) }));
  const lines = Object.fromEntries(['joseph', 'mary'].map((k) => [k, { n: `Линия ${k}`, ids: Array.from({ length: 80 }, () => `s${r.int(SYNTH.persons)}`) }]));
  const redirects: ToolsIndex['redirects'] = Array.from({ length: 300 }, (_, i) => [`old${i}`, [`s${r.int(SYNTH.persons)}`]]);
  const tools: ToolsIndex = {
    ...STAMP, actors, origins, cand: [], unions, kin, readings: [], works: [], areas, lines, redirects, places: ob.points,
  };
  const genealogy = { ...STAMP, members: persons.map((p) => [p.id, `s${r.int(200)}`]) };

  // карточки: настоящие карточки базы по кругу на синтетических лиц, тома ≤ бюджета
  const real = [...buildCardVolumes(base, A).values()].flatMap((v) => Object.values(v.cards));
  const packs: PackOut[] = [
    { kind: 'core-index', name: 'core-index', data: core },
    { kind: 'tools-index', name: 'tools-index', data: tools },
    { kind: 'genealogy', name: 'genealogy', data: genealogy },
  ];
  const max = BUDGETS.cards.max;
  let vol: CardsVolume['cards'] = {};
  let vn = 0;
  const flush = () => {
    const volume = `s${String(vn++).padStart(2, '0')}`;
    packs.push({ kind: 'cards', name: `cards/${volume}`, data: { ...STAMP, volume, cards: vol } satisfies CardsVolume, volume });
    vol = {};
  };
  // том режется по gzip (верхняя граница: что входит по gzip, входит и по brotli); проверка — пачками по 10 лиц
  const over = (v: CardsVolume['cards']) => compressed(canonical({ ...STAMP, volume: 'sNN', cards: v }), 'gzip') > max;
  for (let i = 0; i < SYNTH.persons; i += 10) {
    const batch: CardsVolume['cards'] = {};
    for (let j = i; j < Math.min(i + 10, SYNTH.persons); j++) batch[`s${j}`] = real[j % real.length];
    if (Object.keys(vol).length && over({ ...vol, ...batch })) flush();
    Object.assign(vol, batch);
  }
  if (Object.keys(vol).length) flush();

  // связи: 5 000, тома по книге первого стиха; книга делится по главам, если том не входит
  const rel = new Map<string, RelationsPack['rows']>();
  const relCh = new Map<string, number>();
  for (let i = 0; i < SYNTH.relations; i++) {
    const at = ref(r, chapters);
    const row = { id: `s${i}`, a: `s${r.int(SYNTH.persons)}`, b: `s${r.int(SYNTH.persons)}`, k: r.pick(REL), ...(r.next() < 0.5 && { ro: 'говорящий' }), r: [at.text], ...(r.next() < 0.2 && { ce: 'inference' }) };
    (rel.get(at.book) ?? rel.set(at.book, []).get(at.book)!).push(row);
    relCh.set(row.id, Number(/ (\d+):/.exec(at.text)?.[1] ?? 1));
  }
  const fits = (rows: unknown) => {
    const s = canonical({ ...STAMP, rows });
    return compressed(s, compression) <= BUDGETS.relations.max && compressed(s, 'gzip') <= BUDGETS.relations.max;
  };
  const slug = new Map(BOOKS.map((b) => [b.code, b.slug]));
  for (const b of BOOKS) {
    const rows = rel.get(b.code);
    if (!rows) continue;
    const keyed = rows.map((x) => [relCh.get(x.id) ?? 1, x] as unknown as (number | [number, number])[]);
    for (const [i, part] of splitByChapter(keyed, (p) => fits(p.map((x) => x[1]))).entries())
      packs.push({ kind: 'relations', name: `relations/${String(bookNo(b.code)).padStart(2, '0')}-${slug.get(b.code)}-${i + 1}`, data: { ...STAMP, book: b.code, part: i + 1, rows: part.map((x) => x[1]) as unknown as RelationsPack['rows'] } satisfies RelationsPack, book: b.code, part: i + 1 });
  }

  // текст и основы — настоящие, с пометкой синтетики
  for (const [book, t] of texts) packs.push({ kind: 'text', name: `text/${String(bookNo(book)).padStart(2, '0')}-${slug.get(book)}`, data: { ...t, ...STAMP }, book });
  packs.push({ kind: 'stems', name: 'stems', data: { ...buildStems(A, words.words), ...STAMP } });
  return packs;
}

export function buildSynth(o: { dir?: string; compression?: Compression } = {}): WriteResult {
  const dir = o.dir ?? PACK_DIR.synth;
  assertDir('synth', dir);
  const compression = o.compression ?? 'br';
  const packs = synthPacks(compression);
  return writePacks(packs, {
    dir,
    admit: 'probe',
    synthetic: true,
    compression,
    release: null,
    inputs: { base: 'синтетика', files: inputDigests() },
    statuses: { checked: 0, draft: 0, quarantine: 0, stale: 0, rights: 0, admitted: 0 },
    sources: [{ id: 'src-openbible-geo', spdx: 'CC-BY-4.0 AND ODbL-1.0', version: 'github.com/openbibleinfo/Bible-Geocoding-Data, коммит 7eb18a5', attribution: 'OpenBible.info (синтетика: только для замера)' }],
    extra: [{ name: 'СИНТЕТИКА.txt', text: `${SYNTH_BANNER}.\nЛиц ${SYNTH.persons}, историй ${SYNTH.stories}, частей ≈ ${SYNTH.parts}, связей ${SYNTH.relations}, мест сводки OpenBible ${SYNTH.places}.\n` }],
  });
}

function main() {
  const argv = process.argv.slice(2);
  const val = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const compression = (val('--compression') ?? 'br') as Compression;
  const out = val('--out');
  try {
    const r = buildSynth({ ...(out && { dir: resolve(out) }), compression });
    const m = r.manifest;
    const core = m.packages.find((p) => p.kind === 'core-index');
    console.log(`синтетика: лиц ${SYNTH.persons}, историй ${SYNTH.stories}, связей ${SYNTH.relations}, мест ${SYNTH.places}; ядро индекса ${((core?.size ?? 0) / 1024).toFixed(1)} КБ`);
    process.exit(report(r, `синтетика → ${relative(ROOT, out ? resolve(out) : PACK_DIR.synth)}/`));
  } catch (e) {
    console.error(`!! ${(e as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
