/**
 * Поиск по тексту Писания (09 § 3.5 п. 5): проход по стихам без обратного индекса. В продукте живёт в рабочем потоке.
 * Имена — по словарю форм, без стеммера; обычные слова — по основам из таблицы; точные формы — первыми.
 *
 * Скобки — только по разметке пакета текста (`br`: отрезки `brackets.tsv` с видом и признаком «текст»), а не по знакам
 * (рецензия данных, № 1): находка в отрезке, не признанном текстом, помечается видом отрезка (09 § 3.5 п. 6; 02 § 3.8); отрезок
 * вида «б» и «г» — текст. У находки — положения совпавших слов (`ranges`), вид отрезка и пометки дефектов (`iss`). Второй слой
 * (11 § 3.6 (б), (г); рецензия интерфейса, № 12): режим «С опечатками», фраза, «Где искать» (отрезки), порядок по числу совпадений.
 *
 * Перенесено из пробы П-Т3 (10 § 3.1 п. 4) и исправлено по рецензиям переноса.
 */
import { MIN_STEM } from './stems.ts';
import { now } from '../clock.ts';
import { osa, allowedErrors } from './norm.ts';
import { inSpan, type Versification } from './address.ts';
import type { Span } from '../refs.ts';
import { BRACKET_KINDS, type BracketKind } from '../types.ts';

export interface BookText {
  book: string;
  /** ch[c - 1][v - 1] — текст стиха (пустая строка — пустой стих; null — стиха нет в синодальном тексте). */
  ch: (string | null)[][];
  /** Отрезки скобок пакета: [глава, стих, начало, конец, вид (номер в BRACKET_KINDS), текст ли]. */
  br?: [number, number, number, number, number, 0 | 1][];
  /** Пометки дефектов электронного текста: [глава, стих, вид]. */
  iss?: [number, number, string][];
}

export interface TextData {
  books: BookText[];
  /** Словоформа → длина основы (только где короче формы). */
  stemLen: Map<string, number>;
  /** Словарь форм имён: слово запроса → формы для поиска. */
  names: { forms(w: string): string[] | undefined };
  /** Группы исключений (формы одного слова, отделённые от общей основы). */
  exceptions: string[][];
  /** Стеммер для слова запроса, которого нет в тексте (необязателен: без него такое слово ищется целиком). */
  stem?: (w: string) => string;
}

/** «С формами слова» (по умолчанию), «Точно», «С опечатками» (11 § 3.6 (б)). */
export type Mode = 'формы' | 'точно' | 'опечатки';

export interface SearchOptions {
  /** Слова идут подряд и по порядку (фраза в кавычках). */
  phrase?: boolean;
  /** «Где искать»: только стихи внутри этих отрезков (книга, глава, «Быт 1–11»). */
  within?: Span[];
  /** Порядок: по книгам (по умолчанию, точные формы первыми) или по числу совпадений. */
  order?: 'книги' | 'совпадения';
}

export interface TextHit {
  book: string;
  c: number;
  v: number;
  text: string;
  /** Все слова запроса найдены точной формой. */
  exact: boolean;
  /** Хоть одно слово найдено только внутри скобок, не признанных текстом (09 § 3.5 п. 6; 02 § 3.8). */
  inBrackets: boolean;
  /** Виды отрезков скобок, в которых стоят совпавшие слова, и признак «текст» (вид «б», «г»). */
  brackets: { kind: BracketKind; isText: boolean }[];
  /** Пометки дефектов электронного текста этого стиха (`source-issues.tsv`). */
  issues: string[];
  /** Положения совпавших слов в тексте стиха: [начало, конец) — для выделения 600 (11 § 3.6 (г)). */
  ranges: [number, number][];
  /** Сколько слов стиха совпало. */
  count: number;
}

export interface WordPlan {
  word: string;
  how: 'имя' | 'исключение' | 'основа' | 'целиком' | 'опечатки';
  stem?: string;
  forms: string[];
}

export interface TextResult {
  total: number;
  exactTotal: number;
  hits: TextHit[];
  /** Число стихов по книгам в порядке books (полоса 66 книг, 11 § 3.6 (б)). */
  perBook: number[];
  plan: WordPlan[];
  /** «Найдено также по формам: …» — формы, кроме набранной, которые нашлись в стихах. */
  alsoForms: string[];
  /** Если слово отделено исключением: сколько стихов дала бы общая основа («пята» вместе с «пять»). */
  byStemTotal?: number;
  ms: number;
}

export class TextIndex {
  readonly books: string[];
  readonly vers: Versification = new Map();
  private forms: string[] = [];
  private formId = new Map<string, number>();
  private vBook: Uint8Array;
  private vC: Uint16Array;
  private vV: Uint16Array;
  private vText: string[] = [];
  private tokStart: Uint32Array;
  private tok: Int32Array;
  /** 0 — вне скобок; иначе (номер вида + 1) | 0x80, если отрезок признан текстом. */
  private tokBr: Uint8Array;
  private tokPos: Uint32Array;
  private tokLen: Uint8Array;
  private vIssues = new Map<number, string[]>();
  private stemClass = new Map<string, number[]>();
  private stemClassAll = new Map<string, number[]>();
  private exceptOf = new Map<string, number>();
  private mark: Uint8Array;

  constructor(private d: TextData) {
    this.books = d.books.map((b) => b.book);
    let nv = 0;
    for (const b of d.books) for (const c of b.ch) for (const v of c) if (v !== null) nv++;
    this.vBook = new Uint8Array(nv);
    this.vC = new Uint16Array(nv);
    this.vV = new Uint16Array(nv);
    this.tokStart = new Uint32Array(nv + 1);
    // разбор вручную по кодам букв: в 2–3 раза быстрее регулярного выражения (холодный старт, 09 § 7.2)
    let cap = 1 << 20;
    let tok = new Int32Array(cap);
    let br = new Uint8Array(cap);
    let pos = new Uint32Array(cap);
    let len = new Uint8Array(cap);
    let nt = 0;
    let i = 0;
    // буква русского алфавита в любом регистре; lo() — её код в нижнем регистре, «ё» = «е» (без toLowerCase на стих)
    const isL = (c: number) => (c >= 0x410 && c <= 0x44f) || c === 0x451 || c === 0x401;
    const lo = (c: number) => (c >= 0x410 && c <= 0x42f ? c + 0x20 : c === 0x451 || c === 0x401 ? 0x435 : c);
    const mask = (1 << 17) - 1; // 131 072 ячейки на около 43 000 форм
    const table = new Int32Array(mask + 1).fill(-1);
    d.books.forEach((b, bi) => {
      this.vers.set(b.book, b.ch.map((c) => c.length));
      const segs = new Map<number, [number, number, number][]>();
      for (const x of b.br ?? []) {
        const k = x[0] * 1000 + x[1];
        (segs.get(k) ?? segs.set(k, []).get(k)!).push([x[2], x[3], (x[4] + 1) | (x[5] ? 0x80 : 0)]);
      }
      const iss = new Map<number, string[]>();
      for (const x of b.iss ?? []) {
        const k = x[0] * 1000 + x[1];
        (iss.get(k) ?? iss.set(k, []).get(k)!).push(x[2]);
      }
      b.ch.forEach((verses, ci) =>
        verses.forEach((text, vi) => {
          if (text === null) return;
          this.vBook[i] = bi;
          this.vC[i] = ci + 1;
          this.vV[i] = vi + 1;
          this.vText.push(text);
          this.tokStart[i] = nt;
          const vs = segs.get((ci + 1) * 1000 + vi + 1);
          const vi2 = iss.get((ci + 1) * 1000 + vi + 1);
          if (vi2) this.vIssues.set(i, vi2);
          const low = text;
          const n = low.length;
          let p = 0;
          while (p < n) {
            const c = low.charCodeAt(p);
            if (isL(c)) {
              let q = p + 1;
              while (q < n) {
                const x = low.charCodeAt(q);
                if (isL(x)) q++;
                else if (x === 0x2d && q + 1 < n && isL(low.charCodeAt(q + 1))) q += 2; // дефис внутри слова
                else break;
              }
              // словарь форм — своя хэш-таблица по кодам букв: без нового строкового объекта на каждое слово
              let h = 2166136261;
              for (let r = p; r < q; r++) {
                h = Math.imul(h ^ lo(low.charCodeAt(r)), 16777619);
              }
              let slot = (h >>> 0) & mask;
              let id = -1;
              for (;;) {
                const cand = table[slot];
                if (cand < 0) break;
                const f = this.forms[cand];
                if (f.length === q - p) {
                  let same = true;
                  for (let r = 0; r < f.length; r++) {
                    if (f.charCodeAt(r) !== lo(low.charCodeAt(p + r))) {
                      same = false;
                      break;
                    }
                  }
                  if (same) {
                    id = cand;
                    break;
                  }
                }
                slot = (slot + 1) & mask;
              }
              if (id < 0) {
                const f = low.slice(p, q).toLowerCase().replace(/ё/g, 'е');
                id = this.forms.length;
                this.forms.push(f);
                this.formId.set(f, id);
                table[slot] = id;
              }
              if (nt === cap) {
                cap *= 2;
                const t2 = new Int32Array(cap);
                t2.set(tok);
                tok = t2;
                const b2 = new Uint8Array(cap);
                b2.set(br);
                br = b2;
                const p2 = new Uint32Array(cap);
                p2.set(pos);
                pos = p2;
                const l2 = new Uint8Array(cap);
                l2.set(len);
                len = l2;
              }
              tok[nt] = id;
              let mark = 0;
              if (vs) for (const sg of vs) if (p >= sg[0] && p < sg[1]) mark = sg[2];
              br[nt] = mark;
              pos[nt] = p;
              len[nt++] = Math.min(255, q - p);
              p = q;
            } else {
              p++;
            }
          }
          i++;
        }),
      );
    });
    this.tokStart[nv] = nt;
    this.tok = tok.subarray(0, nt);
    this.tokBr = br.subarray(0, nt);
    this.tokPos = pos.subarray(0, nt);
    this.tokLen = len.subarray(0, nt);
    d.exceptions.forEach((g, gi) => g.forEach((f) => this.exceptOf.set(f, gi)));
    for (let id = 0; id < this.forms.length; id++) {
      const f = this.forms[id];
      const s = f.slice(0, d.stemLen.get(f) ?? f.length);
      (this.stemClassAll.get(s) ?? this.stemClassAll.set(s, []).get(s)!).push(id);
      if (!this.exceptOf.has(f)) (this.stemClass.get(s) ?? this.stemClass.set(s, []).get(s)!).push(id);
    }
    this.mark = new Uint8Array(this.forms.length);
  }

  get verseCount() {
    return this.vText.length;
  }
  get formCount() {
    return this.forms.length;
  }

  hasForm(w: string): boolean {
    return this.formId.has(w);
  }

  /** Основа слова запроса: из таблицы, если слово есть в тексте; иначе — стеммером, если он есть. */
  stemOf(w: string): string {
    const len = this.d.stemLen.get(w);
    if (len !== undefined) return w.slice(0, len);
    if (this.formId.has(w)) return w;
    return this.d.stem ? this.d.stem(w) : w;
  }

  plan(word: string, mode: Mode): WordPlan {
    const ids = (fs: string[]) => fs.filter((f) => this.formId.has(f));
    if (mode === 'точно') return { word, how: 'целиком', forms: ids([word]) };
    if (mode === 'опечатки') {
      const k = allowedErrors(word);
      const fs = this.forms.filter((f) => Math.abs(f.length - word.length) <= k && osa(word, f) <= k);
      return { word, how: 'опечатки', forms: fs };
    }
    const nf = this.d.names.forms(word);
    if (nf) return { word, how: 'имя', forms: ids(nf) };
    const e = this.exceptOf.get(word);
    if (e !== undefined) return { word, how: 'исключение', forms: ids(this.d.exceptions[e]) };
    const s = this.stemOf(word);
    if (s.length < MIN_STEM) return { word, how: 'целиком', forms: ids([word]) };
    const cls = (this.stemClass.get(s) ?? []).map((id) => this.forms[id]);
    if (this.formId.has(word) && !cls.includes(word)) cls.push(word);
    return { word, how: 'основа', stem: s, forms: cls };
  }

  search(words: string[], mode: Mode = 'формы', limit = 50, opts: SearchOptions = {}): TextResult {
    const t0 = now();
    const plan = words.map((w) => this.plan(w, mode));
    const res = this.scan(plan, words, limit, opts);
    if (plan.length === 1 && plan[0].how === 'исключение') {
      const s = this.stemOf(words[0]);
      const all = (this.stemClassAll.get(s) ?? []).map((id) => this.forms[id]);
      res.byStemTotal = this.scan([{ word: words[0], how: 'основа', stem: s, forms: all }], words, 0).total;
    }
    res.ms = now() - t0;
    return res;
  }

  private scan(plan: WordPlan[], words: string[], limit: number, opts: SearchOptions = {}): TextResult {
    const n = plan.length;
    const perBook = new Array<number>(this.books.length).fill(0);
    const empty: TextResult = { total: 0, exactTotal: 0, hits: [], perBook, plan, alsoForms: [], ms: 0 };
    if (n === 0 || plan.some((p) => p.forms.length === 0)) return empty;
    // по слову — свой бит: 1, 2, 4 …; точная форма — тот же бит в старшей половине
    if (n > 4) plan = plan.slice(0, 4);
    const m = this.mark;
    const touched: number[] = [];
    plan.forEach((p, k) => {
      for (const f of p.forms) {
        const id = this.formId.get(f)!;
        m[id] |= 1 << k;
        touched.push(id);
      }
      const ex = this.formId.get(words[k]);
      if (ex !== undefined) {
        m[ex] |= 16 << k;
        touched.push(ex);
      }
    });
    const full = (1 << plan.length) - 1;
    const exactHits: number[] = [];
    const otherHits: number[] = [];
    const brFlag = new Set<number>();
    const seenForms = new Set<number>();
    const tok = this.tok;
    const ts = this.tokStart;
    const nv = this.vText.length;
    const within = opts.within;
    const count = new Map<number, number>();
    for (let v = 0; v < nv; v++) {
      if (within && !within.some((sp) => inSpan(sp, this.books[this.vBook[v]], this.vC[v], this.vV[v]))) continue;
      let got = 0;
      let exact = 0;
      let outside = 0;
      let n = 0;
      for (let t = ts[v], e = ts[v + 1]; t < e; t++) {
        const b = m[tok[t]];
        if (b) {
          got |= b & 15;
          exact |= (b >> 4) & 15;
          n++;
          const br = this.tokBr[t];
          if (br === 0 || br & 0x80) outside |= b & 15;
        }
      }
      if (got === full && opts.phrase && plan.length > 1) {
        // фраза: слова подряд и по порядку
        let ok = false;
        for (let t = ts[v], e = ts[v + 1] - plan.length + 1; t < e && !ok; t++) {
          ok = true;
          for (let k = 0; k < plan.length; k++) if (!(m[tok[t + k]] & (1 << k))) { ok = false; break; }
        }
        if (!ok) continue;
      }
      if (got === full) {
        count.set(v, n);
        perBook[this.vBook[v]]++;
        if (exact === full) exactHits.push(v);
        else otherHits.push(v);
        if (outside !== full) brFlag.add(v);
        if (limit > 0 && seenForms.size < 64)
          for (let t = ts[v], e = ts[v + 1]; t < e; t++) if (m[tok[t]] & 15) seenForms.add(tok[t]);
      }
    }
    let order = [...exactHits, ...otherHits];
    const exactSet = new Set(exactHits);
    if (opts.order === 'совпадения') order = [...order].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
    const hits: TextHit[] = order.slice(0, limit).map((v) => {
      const ranges: [number, number][] = [];
      const kinds = new Map<string, { kind: BracketKind; isText: boolean }>();
      for (let t = ts[v], e = ts[v + 1]; t < e; t++) {
        if (!(m[tok[t]] & 15)) continue;
        ranges.push([this.tokPos[t], this.tokPos[t] + this.tokLen[t]]);
        const br = this.tokBr[t];
        if (br) {
          const kind = BRACKET_KINDS[(br & 0x7f) - 1];
          kinds.set(`${kind}${br & 0x80}`, { kind, isText: (br & 0x80) !== 0 });
        }
      }
      return {
        book: this.books[this.vBook[v]],
        c: this.vC[v],
        v: this.vV[v],
        text: this.vText[v],
        exact: exactSet.has(v),
        inBrackets: brFlag.has(v),
        brackets: [...kinds.values()],
        issues: this.vIssues.get(v) ?? [],
        ranges,
        count: count.get(v) ?? 0,
      };
    });
    for (const id of touched) m[id] = 0;
    const typed = new Set(words);
    const alsoForms = [...seenForms].map((id) => this.forms[id]).filter((f) => !typed.has(f)).sort();
    return { total: order.length, exactTotal: exactHits.length, hits, perBook, plan, alsoForms, ms: 0 };
  }

  /** Стихи, где встречается хоть одна из форм (для эталона: «найдены все стихи с формами из списка»). */
  versesWithAny(forms: string[]): string[] {
    const ids = new Set(forms.map((f) => this.formId.get(f)).filter((x) => x !== undefined));
    const out: string[] = [];
    for (let v = 0; v < this.vText.length; v++) {
      for (let t = this.tokStart[v]; t < this.tokStart[v + 1]; t++)
        if (ids.has(this.tok[t])) {
          out.push(this.key(v));
          break;
        }
    }
    return out;
  }

  /** Стих есть в синодальном тексте (Дан 3:24–90 — нет). */
  readonly has = (book: string, c: number, v: number): boolean => {
    const bi = this.books.indexOf(book);
    return bi >= 0 && (this.d.books[bi].ch[c - 1]?.[v - 1] ?? null) !== null;
  };

  verseText(book: string, c: number, v: number): string | undefined {
    const bi = this.books.indexOf(book);
    return bi < 0 ? undefined : (this.d.books[bi].ch[c - 1]?.[v - 1] ?? undefined);
  }

  key(v: number): string {
    return `${this.books[this.vBook[v]]} ${this.vC[v]}:${this.vV[v]}`;
  }
}
