/**
 * Пакеты по инструментам из допущенных записей базы (09 § 5.3; 02 § 8.1). Что попадает в пакет, решает одна функция
 * допуска (`tools/base/admit.ts`); своих фильтров здесь нет. Развитие `tools/base/bundle.ts` (09 § 4.2): индекс делится на
 * ядро (поиск, каталог) и указатель инструментов (В-30); стихи — весь текст по книгам с разметкой скобок, а не только
 * процитированные (пакет «стихи» снят, 09 § 5.3).
 */
import { createRequire } from 'node:module';
import { buildIndex, nameForms } from '../base/bundle.ts';
import type { Admission } from '../base/admit.ts';
import { yearIn } from '../base/validate.ts';
import type { Prov } from '../base/types.ts';
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
  type ActorRow, type BookTextPack, type BracketKind, type CardNameForm, type CardsVolume, type CoreIndex, type GenealogyPack, type PersonName, type PlaceName,
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
            if (before !== '' && !/[.!?:]$/.test(before) && !/[«"([]$/.test(before)) capitalized.add(f);
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
  id: string; k: string; sk?: string; s?: string; n: string; o?: string[]; oi?: number[]; d?: string; r?: string[]; p?: number; c?: number; v: string;
}

/** Места: имя — в ядро, точка и степень — в указатель (09 § 3.5 п. 3). Степень по 05 § 3.3; нет степени — «не установлено». */
const DEGREE: Record<string, string> = { certain: 'точно', probable: 'вероятно', possible: 'предположительно', unknown: 'не установлено' };

/**
 * Имена лица для поиска (рецензия интерфейса, № 2–3): показываемое — основное; другие имена — те, что текст даёт лицу как имя
 * (`variant`, `renamed`, `foreign`, `patronymic`), и описания, в которых стоит основное имя («Мария Магдалина»). Титулы
 * (`title`: «Господь», «Слово», «Мессия») и прочие описания (`epithet`: «Агнец Божий») в поиск имён не идут — по ним ищется текст.
 * Формы — из основного имени, `variant`, `renamed`, `foreign` и описаний с основным именем; `patronymic` форм не даёт
 * («Сын Иессеев» не делает «Сын» и «Иессеев» именами Давида).
 */
const OTHER_TYPES = new Set(['variant', 'renamed', 'foreign', 'patronymic']);
const FORM_TYPES = new Set(['main', 'variant', 'renamed', 'foreign']);
export function personNames(names: { form: string; type: string; cert?: string }[]): { n: string; o: string[]; oi: number[]; forms: string[] } {
  const main = names.find((x) => x.type === 'main') ?? names[0];
  const mainWord = norm(main.form.split(/[\s,]+/)[0]);
  const withMain = (x: { form: string }) => x.form.split(/[\s,]+/).some((w) => norm(w) === mainWord);
  const others = names.filter((x) => x !== main && (OTHER_TYPES.has(x.type) || (x.type === 'epithet' && withMain(x))));
  const o = [...new Set(others.map((x) => x.form))];
  // формы «выв.» (вид (б), К-19): номера в `o` — поиск ставит их ниже форм «Писание»
  const inferred = new Set(others.filter((x) => x.cert === 'inference').map((x) => x.form));
  const oi = o.flatMap((f, i) => (inferred.has(f) ? [i] : []));
  const forms = names.filter((x) => FORM_TYPES.has(x.type) || (x.type === 'epithet' && withMain(x))).map((x) => x.form);
  return { n: main.form, o, oi, forms: [...new Set(forms)] };
}

/** Стихи записи: все строки вида «Книга глава:стих…» в полях `refs` и `ref` (число стихов лица — порядок тёзок, № 3). */
function refsIn(x: unknown, out: Set<string>): void {
  if (Array.isArray(x)) x.forEach((y) => refsIn(y, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if ((k === 'refs' || k === 'ref' || k === 'read') && (typeof v === 'string' || Array.isArray(v))) for (const r of [v].flat()) if (typeof r === 'string') out.add(r);
      else refsIn(v, out);
    }
  }
}

export interface Indexes { core: CoreIndex; tools: ToolsIndex; genealogy: GenealogyPack; formSources: { id: string; names: string[] }[] }

export function buildIndexes(base: Base, A: Admission, forms = textWords()): Indexes {
  const idx = buildIndex(base, A) as ReturnType<typeof buildIndex> & { actors: IndexActor[] };
  const byId = new Map<string, { names: { form: string; type: string; cert?: string }[]; refs: number }>();
  for (const v of base.volumes) for (const a of v.actors) {
    if (!A.ok(a)) continue;
    const names = a.names.filter((x) => A.part(x as { prov?: Partial<Prov> })).map((x) => ({ form: x.form, type: x.type, ...(x.cert && { cert: x.cert }) }));
    const refs = new Set<string>();
    refsIn(a.names.filter((x) => A.part(x as { prov?: Partial<Prov> })), refs);
    refsIn(a.facts.filter((f) => A.ok(f)), refs);
    byId.set(shortId(a.id, 'p-'), { names: names.length ? names : [{ form: a.names[0].form, type: 'main' }], refs: refs.size });
  }
  const formSources: { id: string; names: string[] }[] = [];
  // «возможно, тот же человек» (вид (в)): допущенные отношения — для поиска обеих карточек (02 § 3.3.6; К-19)
  const ps = new Map<string, string[]>();
  for (const r of base.relations ?? []) if (r.kind === 'possibly-same' && A.ok(r)) {
    const [x, y] = [shortId(r.a, 'p-'), shortId(r.b, 'p-')];
    ps.set(x, [...(ps.get(x) ?? []), y]);
    ps.set(y, [...(ps.get(y) ?? []), x]);
  }
  const persons: PersonName[] = idx.actors.map((a) => {
    const b = byId.get(a.id);
    const nm = b ? personNames(b.names) : { n: a.n, o: a.o ?? [], oi: a.oi ?? [], forms: [a.n] };
    formSources.push({ id: a.id, names: nm.forms });
    // уточнение `d` — только в указателе инструментов: правило 02 § 8.1 (К-9) на перерасход ядра (решение координатора по
    // рецензии данных на ядро, № 2); указатель грузится фоном сразу после ядра
    return { id: a.id, n: nm.n, ...(nm.o.length && { o: nm.o }), ...(nm.oi.length && { oi: nm.oi }), ...(ps.get(a.id) && { ps: ps.get(a.id) }), p: a.p ?? 1, k: a.k, ...(b?.refs && { c: b.refs }) };
  });
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
    formSources.push({ id: `l-${id}`, names: names.map((n) => n.form) });
    const pos = pl.labelPoint ?? pl.positions?.find((p) => !p.rejected);
    if (pos) points.push({ id, lon: pos.lon, lat: pos.lat, deg: DEGREE[pl.degree ?? 'unknown'] });
  }
  const areas = (idx.areas as ToolsIndex['areas']).map((a) => ({ id: a.id, n: a.n }));
  const names = buildForms(formSources, forms.words, forms.capitalized).names;
  const s = stamp(A);
  const core: CoreIndex = { ...s, persons, places, areas, stories: [], names, exceptions: EXCEPTIONS.map((e) => e.forms), glossary: [] };
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
  return { core, tools, genealogy, formSources };
}

/**
 * Карточки по томам (02 § 8.1): допущенные лица, их допущенные утверждения с порядковым номером утверждения `n` (полный номер
 * `a-<n>` собирает ядро — Р-11, К-6) и «нет сведений». Правило выноса — как `tools/base/bundle.ts`: толкование без авторов и год
 * без модели в сборку не идут. Том больше бюджета делится на части `08-levi.1`, `08-levi.2` (02 § 8.1: «том больше — делится»);
 * у лица в указателе — номер своей части (`ActorRow.v`).
 */
export function buildCardVolumes(base: Base, A: Admission, fits: (v: CardsVolume) => boolean = () => true): { volumes: Map<string, CardsVolume>; volumeOf: Map<string, string> } {
  const volumes = new Map<string, CardsVolume>();
  const volumeOf = new Map<string, string>();
  for (const v of base.volumes) {
    const name = v.file.replace(/\.json$/, '');
    const cards: CardsVolume['cards'] = {};
    for (const a of v.actors) {
      if (!A.ok(a)) continue;
      const facts = a.facts.filter((f) => A.ok(f) && !f.needsSources && (f.cert === 'calc' || !yearIn(f.value)));
      const nod = base.nodata.filter((n) => n.actor === a.id && A.ok(n)).map((n) => ({ s: n.sec, k: n.kind, ...(n.what && { w: n.what }), ...(n.refs.length && { r: n.refs }), ...(n.words && { q: n.words }) }));
      cards[shortId(a.id, 'p-')] = {
        f: facts.map((f) => ({ n: claimNo(f.id ?? ''), s: f.sec, f: f.field, v: f.value, ...(f.cert && { c: f.cert }), ...(f.idCert && { ic: f.idCert }) })),
        ...(nod.length && { nd: nod }),
        ...(nameForms(a.names.filter((n) => A.part(n as { prov?: Partial<Prov> }))) as { nm?: CardNameForm[] }),
      };
    }
    const whole: CardsVolume = { ...stamp(A), volume: name, cards };
    const ids = Object.keys(cards);
    let parts = 1;
    const cut = (k: number) => {
      const per = Math.ceil(ids.length / k);
      return Array.from({ length: k }, (_, i) => ids.slice(i * per, (i + 1) * per)).filter((x) => x.length);
    };
    while (!cut(parts).every((p, i) => fits({ ...whole, volume: parts > 1 ? `${name}.${i + 1}` : name, cards: Object.fromEntries(p.map((id) => [id, cards[id]])) })) && parts < 16) parts++;
    cut(parts).forEach((p, i) => {
      const vol = parts > 1 ? `${name}.${i + 1}` : name;
      volumes.set(vol, { ...whole, volume: vol, cards: Object.fromEntries(p.map((id) => [id, cards[id]])) });
      for (const id of p) volumeOf.set(id, vol);
    });
  }
  return { volumes, volumeOf };
}

/** Порядковый номер утверждения: `a-12299` → 12299 (обратно — `claimId` ядра; тест обратного восстановления). */
export function claimNo(id: string): number {
  const m = /^a-(\d+)$/.exec(id);
  if (!m) throw new Error(`номер утверждения «${id}» — не вида a-<число>`);
  return Number(m[1]);
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
