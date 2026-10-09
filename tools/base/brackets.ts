/**
 * Скобки Синодального текста по решению совета (docs/app/reviews/R10-решение-совета.md; 02 § 3.8; CLAUDE.md).
 *
 * Вид каждой скобки — в таблице tools/bible/brackets.tsv (первая версия — research/R10-скобки-места.tsv с поправками
 * совета). Сам tools/bible/synodal.tsv не меняется.
 *
 * Основание факта — только слова вне скобок и слова мест `gloss` (пояснение самого текста) и `damage` (повреждение
 * электронного текста), сверенных с подлинником (ВЗ — WLC, НЗ — TR). Слова мест `lxx`, `slav`, `added`, мест «по признакам» и мест, которых нет
 * в таблице (`unknown`), вырезаются вместе со скобками — квадратными и круглыми. Правило применяется к каждому стиху
 * отдельно, до склейки стихов: отрезок через несколько стихов (Суд 20:27–28; Притч 29:6–27) описан в таблице целиком,
 * а каждый стих получает свою часть.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible } from '../bible.ts';
import { BOOKS, parseRef } from '../../src/engine/books.ts';

const ROOT = join(import.meta.dirname, '..', '..');
export const BRACKETS_TSV = join(ROOT, 'tools', 'bible', 'brackets.tsv');

/** Вид скобки (02 § 3.8.2): б — gloss, г — damage, а — lxx, г-нз — slav, в — added; нет в таблице — unknown. */
export type BracketKind = 'gloss' | 'damage' | 'lxx' | 'slav' | 'added' | 'unknown';
const KINDS = new Set<BracketKind>(['gloss', 'damage', 'lxx', 'slav', 'added']);

export interface BracketRow {
  book: string;
  chapter: number;
  from: number;
  to: number;
  /** Скобка в нашем тексте: «[]», «()» или «[…» (не закрыта до конца главы). */
  bracket: '[]' | '()' | '[…';
  /** Текст внутри скобок; «¦» — граница стихов внутри отрезка. */
  text: string;
  kind: Exclude<BracketKind, 'unknown'>;
  /**
   * Чем проверено: «совет: WLC», «совет: WLC, LXX, CSL», «совет: TR, SBLGNT, CSL», «R10: TR» (НЗ), «R10: по KJV» (ВЗ: R10
   * еврейского текста и LXX не читал — это не сверка с подлинником), «по признакам».
   */
  checkedBy: string;
  /**
   * Откуда слова вставки, если это установлено сверкой: «LXX», «CSL» (в LXX нет, есть в славянском тексте), «TR»,
   * «SBLGNT, CSL», «—» (нет ни в LXX, ни в CSL); пусто — не установлено. По нему строится подпись (02 § 3.8.2).
   */
  source: string;
  /** Для `damage` — исправленное чтение (по частям стихов через «¦»). */
  reading: string;
  basis: string;
  council: string;
}

const NT = new Set(BOOKS.filter((b) => b.t === 'nt').map((b) => b.code));
export const isNT = (book: string) => NT.has(book);
/**
 * Место сверено с подлинником: в Ветхом Завете — с еврейским текстом (WLC), в Новом — с греческим (TR). Пометка
 * «R10: по KJV» сверкой с подлинником не считается (решение совета § 9 п. 7; рецензия второго ключа, № 6).
 */
export const checkedOriginal = (r: BracketRow) => (isNT(r.book) ? /\bTR\b/ : /\bWLC\b/).test(r.checkedBy);
/** Слова места — текст Писания и основание факта: пояснение или повреждение, сверенные с подлинником. */
export const isText = (r: BracketRow) => (r.kind === 'gloss' || r.kind === 'damage') && checkedOriginal(r);

/** Нейтральная подпись (02 § 3.8.2). */
export const NEUTRAL = 'в скобках Синодального издания';
/**
 * Подпись места в Карточке (02 § 3.8.2; 07 § 12): пустая — слова текста, подписи нет. «Дополнение по греческому
 * переводу» — только у места, сверенного с LXX, где слова есть в LXX; «нет в греческом тексте, принятом переводчиками» —
 * у места НЗ, сверенного с TR, где слова взяты из славянского текста; «слово добавлено переводчиками» — только если
 * сверено, что слов нет ни в LXX, ни в CSL. Иначе — нейтральная.
 */
export function caption(r: BracketRow | null): string {
  if (!r) return NEUTRAL;
  if (isText(r)) return '';
  const council = r.checkedBy.startsWith('совет:');
  if (r.kind === 'lxx' && council && /\bLXX\b/.test(r.checkedBy) && r.source === 'LXX') return 'дополнение по греческому переводу';
  if (r.kind === 'slav' && checkedOriginal(r) && r.source === 'CSL') return 'нет в греческом тексте, принятом переводчиками';
  if (r.kind === 'added' && council && r.source === '—') return 'слово добавлено переводчиками';
  return NEUTRAL;
}

let rowsCache: BracketRow[] | null = null;
export function bracketRows(): BracketRow[] {
  if (rowsCache) return rowsCache;
  const lines = readFileSync(BRACKETS_TSV, 'utf8').split('\n').filter(Boolean);
  const head = lines[0].split('\t');
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`brackets.tsv: нет столбца «${name}»`);
    return i;
  };
  const c = {
    book: col('книга'), ch: col('глава'), from: col('стих'), to: col('по стих'), br: col('скобка'), text: col('текст'),
    kind: col('вид'), by: col('чем проверено'), src: col('источник вставки'), reading: col('чтение'), basis: col('основание R10'), council: col('поправка совета'),
  };
  rowsCache = lines.slice(1).map((l, i) => {
    const x = l.split('\t');
    const kind = x[c.kind] as BracketRow['kind'];
    if (!KINDS.has(kind)) throw new Error(`brackets.tsv, строка ${i + 2}: неизвестный вид «${kind}»`);
    const bracket = x[c.br] as BracketRow['bracket'];
    if (!['[]', '()', '[…'].includes(bracket)) throw new Error(`brackets.tsv, строка ${i + 2}: неизвестная скобка «${bracket}»`);
    if (kind === 'damage' && !x[c.reading]) throw new Error(`brackets.tsv, строка ${i + 2}: у повреждения нет исправленного чтения`);
    return {
      book: x[c.book], chapter: Number(x[c.ch]), from: Number(x[c.from]), to: Number(x[c.to]), bracket, text: x[c.text], kind,
      checkedBy: x[c.by], source: x[c.src] ?? '', reading: x[c.reading] ?? '', basis: x[c.basis] ?? '', council: x[c.council] ?? '',
    };
  });
  return rowsCache;
}

/** Скобочный отрезок в synodal.tsv: части по стихам (позиции в тексте стиха, вместе со знаками скобок). */
export interface Segment {
  book: string;
  chapter: number;
  from: number;
  to: number;
  open: '[' | '(';
  closed: boolean;
  parts: { key: string; start: number; end: number; inner: string }[];
}

const segKey = (book: string, chapter: number, from: number, to: number, text: string) => `${book} ${chapter}:${from}-${to}|${text}`;
/** Текст отрезка так, как он записан в таблице: части стихов без краевых пробелов через « ¦ ». */
export const segmentText = (s: Segment) => s.parts.map((p) => p.inner.trim()).join(' ¦ ');

let segCache: Segment[] | null = null;
/** Все скобочные отрезки synodal.tsv. Незакрытая скобка закрывается в конце главы (Притч 29:6). */
export function bracketSegments(): Segment[] {
  if (segCache) return segCache;
  const bible = loadBible();
  const out: Segment[] = [];
  let cur: (Segment & { depth: number }) | null = null;
  let chapter = '';
  for (const key of bible.order) {
    const ch = key.slice(0, key.indexOf(':'));
    if (ch !== chapter) {
      if (cur) out.push(cur);
      cur = null;
      chapter = ch;
    }
    const [book, cv] = [key.slice(0, key.lastIndexOf(' ')), key.slice(key.lastIndexOf(' ') + 1)];
    const [c, v] = cv.split(':').map(Number);
    const t = bible.verses.get(key)!;
    for (let i = 0; i < t.length; i++) {
      const x = t[i];
      if (!cur) {
        if (x === '[' || x === '(') cur = { book, chapter: c, from: v, to: v, open: x, closed: false, depth: 1, parts: [{ key, start: i, end: i + 1, inner: '' }] };
        continue;
      }
      let part = cur.parts.at(-1)!;
      if (part.key !== key) {
        part = { key, start: i, end: i, inner: '' };
        cur.parts.push(part);
        cur.to = v;
      }
      part.end = i + 1;
      if (x === cur.open) cur.depth++;
      else if (x === (cur.open === '[' ? ']' : ')') && --cur.depth === 0) {
        cur.closed = true;
        out.push(cur);
        cur = null;
        continue;
      }
      part.inner += x;
    }
    // стих кончился внутри скобки: часть следующего стиха начинается с его начала
  }
  if (cur) out.push(cur);
  segCache = out.map(({ depth: _d, ...s }: any) => s);
  return segCache;
}

/** Отрезки с их строками таблицы; строки без отрезка — для теста полноты. */
export function matchBrackets() {
  const queue = new Map<string, BracketRow[]>();
  for (const r of bracketRows()) {
    const k = segKey(r.book, r.chapter, r.from, r.to, r.text);
    queue.set(k, [...(queue.get(k) ?? []), r]);
  }
  const matched: { seg: Segment; row: BracketRow | null }[] = [];
  for (const seg of bracketSegments()) {
    const q = queue.get(segKey(seg.book, seg.chapter, seg.from, seg.to, segmentText(seg)));
    matched.push({ seg, row: q?.shift() ?? null });
  }
  const unmatchedRows = [...queue.values()].flat();
  return { matched, unmatchedRows };
}

let textCache: Map<string, string> | null = null;
function build(): Map<string, string> {
  const bible = loadBible();
  const edits = new Map<string, { start: number; end: number; put: string }[]>();
  for (const { seg, row } of matchBrackets().matched) {
    const keep = row !== null && isText(row);
    const reading = row?.kind === 'damage' ? row.reading.split(' ¦ ') : null;
    seg.parts.forEach((p, i) => {
      const put = !keep ? '' : reading ? (reading[i] ?? '') : p.inner;
      edits.set(p.key, [...(edits.get(p.key) ?? []), { start: p.start, end: p.end, put }]);
    });
  }
  const m = new Map<string, string>();
  for (const key of bible.order) {
    const t = bible.verses.get(key)!;
    const es = edits.get(key);
    if (!es) {
      m.set(key, t);
      continue;
    }
    let out = '';
    let at = 0;
    for (const e of es.sort((a, b) => a.start - b.start)) {
      out += t.slice(at, e.start) + (e.put ? ` ${e.put} ` : ' ');
      at = e.end;
    }
    out += t.slice(at);
    m.set(key, out.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim());
  }
  return m;
}

/**
 * Текст стиха, на который можно опираться: слова вне скобок и слова мест gloss и damage, сверенных с подлинником
 * (для damage — исправленное чтение по таблице). Знаки скобок снимаются. Нет стиха — undefined.
 */
export function scriptureText(book: string, chapter: number, verse: number): string | undefined {
  textCache ??= build();
  return textCache.get(`${book} ${chapter}:${verse}`);
}

/** Тексты стихов ссылки по `scriptureText`, по каждому стиху отдельно; неверная ссылка — пустой список. */
export function scriptureTexts(ref: string): string[] {
  const p = parseRef(ref, loadBible().chapterLength);
  if (!p) return [];
  return p.verses.map((v) => scriptureText(v.book, v.chapter, v.verse) ?? '');
}
