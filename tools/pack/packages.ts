/**
 * Пакеты по инструментам из допущенных записей базы (09 § 5.3; 02 § 8.1). Что попадает в пакет, решает одна функция
 * допуска (`tools/base/admit.ts`); своих фильтров здесь нет. Развитие `tools/base/bundle.ts` (09 § 4.2): индекс делится на
 * ядро (поиск, каталог) и указатель инструментов (В-30); стихи — весь текст по книгам с разметкой скобок, а не только
 * процитированные (пакет «стихи» снят, 09 § 5.3).
 */
import { createRequire } from 'node:module';
import { buildCards, buildIndex } from '../base/bundle.ts';
import type { Admission } from '../base/admit.ts';
import type { Base } from '../base/migrate.ts';
import { loadBible } from '../bible.ts';
import { isText, matchBrackets } from '../base/brackets.ts';
import { sourceIssues } from '../base/source-issues.ts';
import { shortId } from '../base/prefixes.ts';
import { BOOKS } from '../../core/books.ts';
import { norm } from '../../core/search/norm.ts';
import { buildForms } from '../../core/search/forms.ts';
import { buildStemTable, EXCEPTIONS } from '../../core/search/stems.ts';
import {
  BRACKET_KINDS, PACK_SCHEMA, PROBE_BANNER,
  type ActorRow, type BookTextPack, type BracketKind, type CardsVolume, type CoreIndex, type GenealogyPack, type PersonName, type PlaceName,
  type PlacePoint, type Stamp, type StemsPack, type ToolsIndex, type TskPack,
} from '../../core/types.ts';

export const stamp = (A: Pick<Admission, 'level'>): Stamp =>
  A.level === 'probe' ? { schema: PACK_SCHEMA, admit: 'probe', banner: PROBE_BANNER } : { schema: PACK_SCHEMA, admit: 'release' };

// ---------- текст ----------

export interface BibleChapters {
  /** Код книги → главы → стихи (null — стиха нет в файле). */
  books: Map<string, (string | null)[][]>;
  /** Порядковый номер стиха в синодальном тексте («Быт 1:1» → 0). */
  ordinal: Map<string, number>;
}

let chaptersCache: BibleChapters | null = null;
export function bibleChapters(): BibleChapters {
  if (chaptersCache) return chaptersCache;
  const bible = loadBible();
  const books = new Map<string, (string | null)[][]>();
  const ordinal = new Map<string, number>();
  bible.order.forEach((key, i) => {
    ordinal.set(key, i);
    const sp = key.lastIndexOf(' ');
    const book = key.slice(0, sp);
    const [c, v] = key.slice(sp + 1).split(':').map(Number);
    const chs = books.get(book) ?? books.set(book, []).get(book)!;
    (chs[c - 1] ??= [])[v - 1] = bible.verses.get(key)!;
  });
  // стиха нет в синодальном тексте (Дан 3:24–90) — null, а не пропуск и не пустая строка (П-Т3)
  for (const chs of books.values()) for (let c = 0; c < chs.length; c++) {
    chs[c] ??= [];
    for (let v = 0; v < chs[c].length; v++) chs[c][v] ??= null;
  }
  chaptersCache = { books, ordinal };
  return chaptersCache;
}

/**
 * Текст по книгам (09 § 5.3): все стихи с разметкой отрезков скобок, их видом и пометками дефектов. Текст — общий для
 * всех уровней (`src-synodal`); уровень пакета — уровень сборки.
 */
export function buildTexts(A: Pick<Admission, 'level'>): Map<string, BookTextPack> {
  const { books } = bibleChapters();
  const br = new Map<string, BookTextPack['br']>();
  for (const { seg, row } of matchBrackets().matched) {
    const kind: BracketKind = row?.kind ?? 'unknown';
    const k = BRACKET_KINDS.indexOf(kind);
    const text: 0 | 1 = row !== null && isText(row) ? 1 : 0;
    for (const p of seg.parts) {
      const sp = p.key.lastIndexOf(' ');
      const book = p.key.slice(0, sp);
      const [c, v] = p.key.slice(sp + 1).split(':').map(Number);
      (br.get(book) ?? br.set(book, []).get(book)!).push([c, v, p.start, p.end, k, text]);
    }
  }
  const iss = new Map<string, BookTextPack['iss']>();
  for (const r of sourceIssues()) for (let v = r.from; v <= r.to; v++) (iss.get(r.book) ?? iss.set(r.book, []).get(r.book)!).push([r.chapter, v, r.kind]);
  const out = new Map<string, BookTextPack>();
  for (const b of BOOKS) {
    const ch = books.get(b.code);
    if (!ch) throw new Error(`в synodal.tsv нет книги ${b.code}`);
    out.set(b.code, { ...stamp(A), book: b.code, ch, br: br.get(b.code) ?? [], iss: iss.get(b.code) ?? [] });
  }
  return out;
}

/** Слова текста и формы, написанные с прописной не в начале предложения (09 § 3.5 п. 1; П-Т3). */
export function textWords(): { words: Set<string>; capitalized: Set<string> } {
  const words = new Set<string>();
  const capitalized = new Set<string>();
  for (const chs of bibleChapters().books.values())
    for (const c of chs)
      for (const v of c) {
        if (v === null) continue;
        for (const m of v.matchAll(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g)) {
          const w = m[0];
          const f = norm(w);
          words.add(f);
          if (/^[А-ЯЁ]/.test(w)) {
            const before = v.slice(0, m.index).trimEnd();
            if (before !== '' && !/[.!?:]$/.test(before) && !/[«"(\[]$/.test(before)) capitalized.add(f);
          }
        }
      }
  return { words, capitalized };
}

type Stemmer = { stem(w: string): string };
let stemmer: Stemmer | null = null;
/** Snowball для русского (snowball-stemmers, ISC; 09 § 12) — только при сборке. */
export function russianStemmer(): Stemmer {
  if (stemmer) return stemmer;
  const require = createRequire(import.meta.url);
  stemmer = (require('snowball-stemmers') as { newStemmer(l: string): Stemmer }).newStemmer('russian');
  return stemmer;
}

export function buildStems(A: Pick<Admission, 'level'>, words = textWords().words): StemsPack {
  const ru = russianStemmer();
  return { ...stamp(A), table: buildStemTable(words, (w) => ru.stem(w)), exceptions: EXCEPTIONS.map((e) => e.forms) };
}

// ---------- индекс: ядро и указатель инструментов ----------

interface IndexActor {
  id: string; k: string; sk?: string; s?: string; n: string; o?: string[]; d?: string; r?: string[]; p?: number; c?: number; v: string;
}

/** Места: имя — в ядро, точка и степень — в указатель (09 § 3.5 п. 3). Степень по 05 § 3.3; нет степени — «не установлено». */
const DEGREE: Record<string, string> = { certain: 'точно', probable: 'вероятно', possible: 'предположительно', unknown: 'не установлено' };

export function buildIndexes(base: Base, A: Admission, forms = textWords()): { core: CoreIndex; tools: ToolsIndex; genealogy: GenealogyPack } {
  const idx = buildIndex(base, A) as ReturnType<typeof buildIndex> & { actors: IndexActor[] };
  const persons: PersonName[] = idx.actors.map((a) => ({ id: a.id, n: a.n, ...(a.o && { o: a.o }), ...(a.d && { d: a.d }), p: a.p ?? 1, k: a.k }));
  const actors: ActorRow[] = idx.actors.map((a) => ({
    id: a.id, k: a.k, ...(a.sk && { sk: a.sk }), ...(a.s && { s: a.s }), ...(a.d && { d: a.d }), ...(a.r && { r: a.r }), ...(a.p && { p: a.p }), ...(a.c && { c: a.c }), v: a.v,
  }));
  const places: PlaceName[] = [];
  const points: PlacePoint[] = [];
  for (const raw of base.places ?? []) {
    if (!A.ok(raw)) continue;
    const pl = A.view(raw);
    const names = pl.names; // закрытые части уже сняты `A.view` (К-15); своего статуса у имени места нет
    if (!names.length) continue;
    const id = shortId(pl.id, 'l-');
    places.push({ id, n: names[0].form, ...(names.length > 1 && { o: names.slice(1).map((n) => n.form) }) });
    const pos = pl.labelPoint ?? pl.positions?.find((p) => !p.rejected);
    if (pos) points.push({ id, lon: pos.lon, lat: pos.lat, deg: DEGREE[pl.degree ?? 'unknown'] });
  }
  const names = buildForms(idx.actors.map((a) => ({ id: a.id, names: [a.n, ...(a.o ?? [])] })), forms.words, forms.capitalized).names;
  const s = stamp(A);
  const core: CoreIndex = { ...s, persons, places, stories: [], names, exceptions: EXCEPTIONS.map((e) => e.forms), glossary: [] };
  const tools: ToolsIndex = {
    ...s,
    actors,
    origins: idx.origins as ToolsIndex['origins'],
    cand: idx.cand as ToolsIndex['cand'],
    unions: idx.unions as ToolsIndex['unions'],
    kin: idx.kin as ToolsIndex['kin'],
    readings: idx.readings as ToolsIndex['readings'],
    works: idx.works as ToolsIndex['works'],
    areas: idx.areas as ToolsIndex['areas'],
    lines: idx.lines as ToolsIndex['lines'],
    redirects: idx.redirects as ToolsIndex['redirects'],
    places: points,
  };
  const genealogy: GenealogyPack = { ...s, members: idx.members as GenealogyPack['members'] };
  return { core, tools, genealogy };
}

export function buildCardVolumes(base: Base, A: Admission): Map<string, CardsVolume> {
  const out = new Map<string, CardsVolume>();
  const { cards } = buildCards(base, A);
  for (const [file, c] of Object.entries(cards)) {
    const volume = file.replace(/\.json$/, '');
    out.set(volume, { ...stamp(A), volume, cards: c.cards as CardsVolume['cards'] });
  }
  return out;
}

// ---------- параллельные места (TSK) ----------

/**
 * TSK по книгам (02 § 3.16, § 8.1; Р-11): строка — [глава, стих, группа, ...цели], цели — порядковые номера стихов (диапазон —
 * [от, до]); английских слов нет. Книга, чья часть выходит за бюджет, делится по границе главы (Пс — две части).
 * Только уровень «проба»: ключа допуска `vp:…` ещё нет, блок не открывается до Д-12 (02 § 3.16 [4.2]).
 */
export function buildTsk(A: Pick<Admission, 'level'>, tsv: string, fits: (rows: TskPack['rows']) => boolean): TskPack[] {
  if (A.level !== 'probe') throw new Error('TSK — только уровень «проба»: коллекции параллельных мест нет в допуске, блок закрыт до Д-12 (02 § 3.16)');
  const { ordinal } = bibleChapters();
  const ord = (book: string, c: number, v: number) => {
    const n = ordinal.get(`${book} ${c}:${v}`);
    if (n === undefined) throw new Error(`TSK: нет стиха ${book} ${c}:${v}`);
    return n;
  };
  const byBook = new Map<string, TskPack['rows']>();
  for (const line of tsv.split('\n').slice(1)) {
    if (!line) continue;
    const [book, c, v, , g, , places] = line.split('\t');
    const targets: (number | [number, number])[] = [];
    for (const raw of places.split('; ')) {
      const ref = raw.trim();
      const m = /^([1-4]?[А-Яа-яЁё]+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(ref);
      if (!m) continue; // пометки источника (`*marg:` и подобные) в пакет не идут
      const a = ord(m[1], +m[2], +m[3]);
      if (m[5] === undefined) targets.push(a);
      else targets.push([a, ord(m[1], m[4] ? +m[4] : +m[2], +m[5])]);
    }
    if (!targets.length) continue;
    (byBook.get(book) ?? byBook.set(book, []).get(book)!).push([+c, +v, +g, ...targets]);
  }
  const out: TskPack[] = [];
  for (const b of BOOKS) {
    const rows = byBook.get(b.code);
    if (!rows) continue;
    for (const [i, part] of splitByChapter(rows, fits).entries()) out.push({ ...stamp(A), book: b.code, part: i + 1, rows: part });
  }
  return out;
}

/** Делит строки книги на наименьшее число частей по границе главы, чтобы каждая часть прошла `fits`. */
export function splitByChapter<R extends (number | [number, number])[]>(rows: R[], fits: (rows: R[]) => boolean): R[][] {
  for (let n = 1; n <= 16; n++) {
    const chapters = [...new Set(rows.map((r) => r[0] as number))];
    const per = Math.ceil(rows.length / n);
    const parts: R[][] = [];
    let cur: R[] = [];
    for (const ch of chapters) {
      const these = rows.filter((r) => r[0] === ch);
      if (cur.length && cur.length + these.length > per && parts.length < n - 1) {
        parts.push(cur);
        cur = [];
      }
      cur.push(...these);
    }
    parts.push(cur);
    if (parts.every(fits)) return parts;
  }
  throw new Error('TSK: книга не делится на части в бюджете');
}
