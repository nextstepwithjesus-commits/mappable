/**
 * Поиск лиц (ТЗ § 3.7; D9): по имени, иным формам, уточнению, традиционному именованию и ссылке на стих или главу.
 * Нормализация: регистр, ё → е, раскладка (латиница, набранная вместо кириллицы), окончания.
 * Опечатки прощаются расстоянием Дамерау — Левенштейна, если по имени ничего не нашлось.
 */
import { norm, nameMatcher, stripBrackets } from './text.ts';
import { BOOKS, parseRef, verseId } from './books.ts';
import type { Card, Chrono } from '../data/types.ts';

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
const LAYOUT = new Map([...EN].map((c, i) => [c, RU[i]]));

export function fixLayout(q: string): string {
  if (!/[a-z[\];',.`]/i.test(q) || /[а-яё]/i.test(q)) return q;
  return [...q.toLowerCase()].map((c) => LAYOUT.get(c) ?? c).join('');
}

const ENDINGS = ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ой', 'ей', 'ом', 'ем', 'ов', 'ев', 'ин', 'ах', 'ях', 'ам', 'ям', 'а', 'я', 'у', 'ю', 'е', 'ы', 'и', 'ь', 'й', 'о'];

/** Основа слова: без первого подходящего окончания (осталось не меньше трёх букв). */
export function stem(w: string): string {
  const s = norm(w);
  if (s.length <= 3) return s;
  for (const e of ENDINGS) if (s.endsWith(e) && s.length - e.length >= 3) return s.slice(0, -e.length);
  return s;
}

/**
 * Все основы слова: само слово и слово без каждого из подходящих окончаний. Косвенная форма и имя совпадают,
 * если у них есть общая основа: «Иессея» (иессе) — «Иессей» (иессе), «Моисея» — «Моисей» (UX-42).
 */
export function stems(w: string): string[] {
  const s = norm(w);
  const out = [s];
  if (s.length > 3) for (const e of ENDINGS) if (s.endsWith(e) && s.length - e.length >= 3) out.push(s.slice(0, -e.length));
  return out;
}
const share = (a: string[], b: string[]) => a.some((x) => b.includes(x));

/**
 * Расстояние Дамерау — Левенштейна (оптимальное выравнивание строк): вставка, удаление, замена, перестановка соседних.
 * Больше max — возвращается max + 1 (дальше не считается).
 */
export function damerau(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Сколько опечаток прощается: у имён из 5–8 букв — одна, у длинных — две, у коротких — ни одной (IX-18). */
export const typoBudget = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

// ---------- ссылка на стих или главу ----------

/** Как читатель может назвать книгу: сокращение, название, родительный падеж; у книг с номером — с цифрой впереди. */
const BOOK_ALIASES: [string, string][] = (() => {
  const out: [string, string][] = [];
  const add = (k: string, code: string) => out.push([norm(k).replace(/[\s.-]+/g, ''), code]);
  for (const b of BOOKS) {
    add(b.code, b.code);
    for (const n of [b.name, b.gen]) {
      const m = /^([1-4])-[яейго]+\s+(.+)$/.exec(n);
      const base = (m ? m[2] : n).replace(/^(от|к)\s+/i, '');
      add(`${m ? m[1] : ''}${base}`, b.code);
    }
  }
  return out;
})();

/** Книга по слову запроса («руф», «Руфь», «бытие», «1 цар», «1-я Царств»): точное совпадение или однозначное начало. */
export function bookOf(num: string, word: string): string | null {
  const key = `${num}${norm(word).replace(/[\s.-]+/g, '')}`;
  const exact = BOOK_ALIASES.find(([k]) => k === key);
  if (exact) return exact[1];
  if (key.length - num.length < 3) return null;
  const codes = new Set(BOOK_ALIASES.filter(([k]) => k.startsWith(key) && /^\d/.test(k) === !!num).map(([, c]) => c));
  return codes.size === 1 ? [...codes][0] : null;
}

export interface QueryRef {
  /** ссылка в синодальных сокращениях: «Руф 4:21», «Руф 4» */
  ref: string;
  book: string;
  chapter: number;
  /** стихи; пусто — ссылка на главу целиком */
  verses: string[];
}

/**
 * Запрос — ссылка на стих или главу? Регистр и пробел после сокращения не важны, точка после сокращения допустима:
 * «руф 4:21», «Руф4:21», «Быт. 14:18», «1 цар 16», «Бытие 5:3-5», «Руф 4» (IX-17).
 */
export function parseQueryRef(raw: string): QueryRef | null {
  const q = norm(raw).replace(/[–—]/g, '-').trim();
  const m = /^(?:([1-4])\s*(?:-?[яейго]{1,2}\s+)?)?([а-я]+)\.?\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}(?:\s*-\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*-\s*\d{1,3})?)*))?$/.exec(q);
  if (!m) return null;
  const book = bookOf(m[1] ?? '', m[2]);
  if (!book) return null;
  const chapter = Number(m[3]);
  const vs = m[4]?.replace(/\s+/g, '');
  const ref = `${book} ${chapter}${vs ? `:${vs}` : ''}`;
  const p = parseRef(ref);
  if (!p) return null;
  return { ref, book, chapter, verses: p.verses.map(verseId) };
}

// ---------- традиционные именования (решение владельца 13) ----------

/**
 * Традиционные именования, которых нет в Синодальном тексте: поиск отвечает синодальной формой с пометой
 * «в Синодальном переводе — …». Только общепринятые именования, каждое — ровно одно лицо атласа.
 */
export const TRADITIONAL: { name: string; forms: string[]; id: string }[] = [
  { name: 'Богородица', forms: ['Богородица', 'Пресвятая Богородица', 'Богоматерь', 'Божия Матерь', 'Божья Матерь', 'Матерь Божия', 'Дева Мария'], id: 'mariya' },
  { name: 'Иосиф Обручник', forms: ['Иосиф Обручник', 'Обручник'], id: 'iosif-muzh-marii' },
  { name: 'Иоанн Предтеча', forms: ['Иоанн Предтеча', 'Предтеча'], id: 'ioann-krestitel' },
  { name: 'Иоанн Богослов', forms: ['Иоанн Богослов', 'Богослов'], id: 'ioann-apostol' },
  { name: 'Андрей Первозванный', forms: ['Андрей Первозванный', 'Первозванный'], id: 'andrey' },
];

const words = (s: string) => norm(s).split(/[^а-я-]+/).filter(Boolean);

/** Традиционное именование, которое набирает читатель: слово за словом, последнее может быть недописано (от 4 букв). */
export function traditionOf(raw: string): { name: string; id: string } | null {
  const q = words(fixLayout(raw));
  if (!q.length) return null;
  for (const t of TRADITIONAL)
    for (const f of t.forms) {
      const fw = words(f);
      if (fw.length !== q.length) continue;
      const ok = fw.every((w, i) => {
        if (w === q[i] || share(stems(w), stems(q[i]))) return true;
        return i === q.length - 1 && q[i].length >= 4 && w.startsWith(q[i]);
      });
      if (ok) return { name: t.name, id: t.id };
    }
  return null;
}

// ---------- ссылки карточки ----------

/**
 * Все ссылки карточки лица, кроме примечаний § 24 (они часто ведут к другим лицам: «не смешивать с…»),
 * и хронологических входов (годы правления, годы служения). Тот же перечень, что у счёта упоминаний при сборке.
 */
export function refsOfCard(c: Card | null | undefined, chrono?: Chrono | null): string[] {
  const out = new Set<string>();
  const add = (r?: string[] | string) => {
    if (!r) return;
    for (const x of Array.isArray(r) ? r : [r]) out.add(x);
  };
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
  }
  for (const r of chrono?.reign ?? []) add(r.refs);
  add(chrono?.active?.refs);
  return [...out];
}

/** Иные имена карточки, которые ищутся в тексте стихов: без титулов и прозваний («Дева» — не имя Марии). */
export const textNamesOfCard = (c: Card | null | undefined): string[] =>
  (c?.altNames ?? []).filter((a) => a.kind !== 'title' && a.kind !== 'epithet').map((a) => a.name);

// ---------- индекс ----------

export interface SearchDoc {
  id: string;
  name: string;
  alt: string[];
  disambig: string;
  prominence: number;
  /** величина звезды 0–6 (0 — ярче всех); без неё значимость берётся из prominence */
  magnitude?: number;
  /** ссылки лица из индекса неба (родители, супруги, родство); ссылки карточки добавляет addRefs */
  refs: string[];
  kind?: string;
  unnamed?: boolean;
}

export type HitVia = 'name' | 'alt' | 'disambig' | 'verse' | 'tradition' | 'fuzzy';

export interface SearchHit {
  id: string;
  score: number;
  matched: string; // по какой форме найдено
  via: HitVia;
  /** традиционное именование, которому отвечает лицо (via = 'tradition') */
  tradition?: string;
}

/**
 * Классы совпадения, от лучшего к худшему. Порядок результатов — по классу, внутри класса — по значимости лица,
 * поэтому «Иисус» ставит Иисуса Христа (совпадение по первому слову имени) раньше одноимённых левитов.
 */
const EXACT = 0; // имя целиком или его первое слово: «Иисус» → «Иисус», «Иисус Христос», «Иисус Навин»
const PREFIX = 1; // начало имени: «Иос» → «Иосиф»
const STEM = 2; // косвенная форма имени или первого слова: «Давида», «Иисуса», «Иессея»
const WORD = 3; // слово внутри имени: «Навин» → «Иисус Навин»
const PART = 4; // часть имени: «сафат» → «Иосафат»
const BY_DISAMBIG = 5; // уточнение: «Искариот»
const NONE = 6;

interface Form {
  f: string;
  first: string;
  words: string[];
  st: string[];
  firstSt: string[];
  wordSt: string[][];
  alt: number;
  raw: string;
}
const formOf = (raw: string, alt: number): Form => {
  const f = norm(raw);
  const ws = f.split(/[\s-]+/).filter(Boolean);
  const first = f.split(/\s+/)[0];
  return { f, first, words: ws, st: stems(f), firstSt: stems(first), wordSt: ws.map(stems), alt, raw };
};

function matchClass(x: Form, q: string, qs: string[], qWords: string[]): number {
  if (x.f === q || x.first === q) return EXACT;
  if (x.f.startsWith(q)) return PREFIX;
  if (share(x.st, qs) || share(x.firstSt, qs)) return STEM;
  // несколько слов запроса — по словам имени, по порядку: «Иосифа из Аримафеи»
  if (qWords.length > 1 && qWords.length <= x.words.length && qWords.every((w, i) => x.words[i] === w || share(x.wordSt[i], stems(w)) || (i === qWords.length - 1 && x.words[i].startsWith(w))))
    return STEM;
  if (x.words.some((w, i) => w.startsWith(q) || share(x.wordSt[i], qs))) return WORD;
  if (q.length >= 3 && x.f.includes(q)) return PART;
  return NONE;
}

/** Место лица в стихе или главе: упомянуто ли по имени (pos — номер слова) и ссылается ли на стих карточка. */
interface Place {
  pos: number;
}

export class SearchIndex {
  private docs: SearchDoc[];
  private formsCache: Form[][] | null = null;
  private byId = new Map<string, number>();
  /** стих → лица, чьи ссылки его называют */
  private citedIn = new Map<string, Set<string>>();
  /** «Руф 4» → лица, чьи ссылки называют главу или её стихи; значение — первый стих (0 — вся глава) */
  private inChapter = new Map<string, Map<string, number>>();
  /** стих → лица, названные в нём по имени, с номером слова */
  private namedIn = new Map<string, Map<string, Place>>();
  /** лицо → главы, на которые ссылаются его ссылки */
  private chaptersOf = new Map<string, Set<string>>();
  /** формы имени для сверки с текстом стиха: по первым двум буквам */
  private textForms = new Map<string, { id: string; re: RegExp; alt: boolean; first: string }[]>();
  private textFormsOf = new Map<string, string[]>();
  private eponymsCache: Set<string> | null = null;
  private groupWords: string[];
  private readTexts = new Set<string>();
  private refsReady = false;
  private textReady = false;

  /** groupWords — слова названий колен и народов: имя-эпоним («Завулон», «Моав») сверяется с текстом только в главах своих ссылок. */
  constructor(docs: SearchDoc[], opts: { groupWords?: string[] } = {}) {
    this.docs = docs;
    docs.forEach((d, i) => this.byId.set(d.id, i));
    this.groupWords = (opts.groupWords ?? []).map(norm);
  }

  // Индекс строится по частям при первой нужде: к первому показу атласа поиск ничего не считает (NFR-1).
  /** Формы имён для поиска по имени. */
  private get forms(): Form[][] {
    this.formsCache ??= this.docs.map((d) => [formOf(d.name, 0), ...d.alt.map((a) => formOf(a, 1))]);
    return this.formsCache;
  }
  /** Ссылки индекса неба — для поиска по стиху и главе. */
  private ensureRefs() {
    if (this.refsReady) return;
    this.refsReady = true;
    for (const d of this.docs) this.addRefs(d.id, d.refs);
  }
  /** Имена-эпонимы колен и народов. */
  private get eponyms(): Set<string> {
    const gw = this.groupWords;
    this.eponymsCache ??= new Set(this.docs.filter((d) => gw.length && gw.some((w) => nameMatcher(d.name).test(` ${w} `))).map((d) => d.id));
    return this.eponymsCache;
  }
  /** Формы имён для сверки с текстом стиха: имя каждого лица, если иные имена ему ещё не заданы. */
  private ensureText() {
    if (this.textReady) return;
    this.textReady = true;
    for (const d of this.docs) if (!d.unnamed && !this.textFormsOf.has(d.id)) this.setTextForms(d.id, [d.name]);
  }

  /** Дописать ссылки лица (ссылки карточки приходят с томом): стих, глава, межглавный диапазон — только главами. */
  addRefs(id: string, refs: string[]) {
    const chs = this.chaptersOf.get(id) ?? new Set<string>();
    this.chaptersOf.set(id, chs);
    const addCh = (ch: string, v: number) => {
      chs.add(ch);
      const m = this.inChapter.get(ch) ?? new Map<string, number>();
      this.inChapter.set(ch, m);
      const was = m.get(id);
      if (was === undefined || v < was) m.set(id, v);
    };
    for (const r of refs) {
      const p = parseRef(r);
      if (p && p.chapterOnly) addCh(`${p.book} ${p.chapterOnly}`, 0);
      else if (p && p.verses.length <= 3) {
        for (const v of p.verses) {
          const k = verseId(v);
          const s = this.citedIn.get(k);
          if (s) s.add(id);
          else this.citedIn.set(k, new Set([id]));
          addCh(`${v.book} ${v.chapter}`, v.verse);
        }
      } else if (p) {
        // диапазон длиннее трёх стихов — главами: «Руф 4:18-22» не делает Фареса лицом стиха 4:21
        for (const v of p.verses) addCh(`${v.book} ${v.chapter}`, v.verse);
      } else {
        // межглавный диапазон: «Быт 12:1-25:10»
        const m = /^(\S+)\s+(\d+)(?::\d+)?(?:-(\d+):\d+)?/.exec(r.replace(/[–—]/g, '-'));
        if (m && BOOKS.some((b) => b.code === m[1])) for (let ch = Number(m[2]); ch <= Number(m[3] ?? m[2]); ch++) addCh(`${m[1]} ${ch}`, 0);
      }
    }
  }

  /** Формы имени, которые ищутся в тексте стихов: имя и иные имена (без титулов и прозваний — их отбирает вызывающий). */
  setTextForms(id: string, names: string[]) {
    const i = this.byId.get(id);
    if (i === undefined || this.docs[i].unnamed) return;
    for (const old of this.textFormsOf.get(id) ?? []) {
      const b = this.textForms.get(old.slice(0, 2));
      if (b) this.textForms.set(old.slice(0, 2), b.filter((e) => e.id !== id));
    }
    const firsts: string[] = [];
    names.forEach((n, k) => {
      const w = norm(n).split(/\s+/)[0];
      if (w.length < 2) return;
      firsts.push(w);
      const b = this.textForms.get(w.slice(0, 2)) ?? [];
      b.push({ id, re: nameMatcher(n), alt: k > 0, first: w });
      this.textForms.set(w.slice(0, 2), b);
    });
    this.textFormsOf.set(id, firsts);
  }

  /**
   * Тексты стихов (ключ «Руф 4:21»): кто в них назван по имени. Одноимённые, иные имена, народы и эпонимы
   * засчитываются только в главах, на которые ссылается их карточка: «Иосиф» в Быт 37 — сын Иакова, а не муж Марии.
   */
  addVerseTexts(texts: Record<string, string>) {
    this.ensureRefs();
    this.ensureText();
    for (const [key, text] of Object.entries(texts)) {
      if (this.readTexts.has(key)) continue;
      this.readTexts.add(key);
      const ch = key.slice(0, key.indexOf(':'));
      const ws = (stripBrackets(text).match(/[А-ЯЁ][а-яё]*(?:[-—–][А-ЯЁа-яё][а-яё]*)*/g) ?? []).map(norm);
      const found = new Map<string, Place>();
      const cited = this.citedIn.get(key);
      ws.forEach((w, pos) => {
        let hits = (this.textForms.get(w.slice(0, 2)) ?? []).filter((e) => e.re.test(` ${w} `));
        // слово — форма самого имени, а не только его начало: «Иосифа» — Иосиф, а не Иосия
        const ws2 = stems(w);
        const full = hits.filter((h) => share(stems(h.first), ws2));
        if (full.length) hits = full;
        const ids = new Set(hits.map((h) => h.id));
        // одноимённые: те, чья карточка ссылается на этот стих; если таких нет — те, чья ссылается на главу
        const byVerse = ids.size > 1 ? hits.filter((h) => cited?.has(h.id)) : [];
        for (const h of byVerse.length ? byVerse : hits) {
          if (found.has(h.id)) continue;
          const d = this.docs[this.byId.get(h.id)!];
          const plain = ids.size === 1 && !h.alt && (d.kind ?? 'person') === 'person' && !this.eponyms.has(h.id);
          if (plain || cited?.has(h.id) || this.chaptersOf.get(h.id)?.has(ch)) found.set(h.id, { pos });
        }
      });
      if (found.size) this.namedIn.set(key, found);
    }
  }

  /** Лица стиха или главы: названные по имени — в порядке текста, затем те, на кого ссылается карточка, — по значимости. */
  private byRef(r: QueryRef): SearchHit[] {
    this.ensureRefs();
    const rank = new Map<string, number>(); // меньше — раньше
    const mag = (id: string) => {
      const d = this.docs[this.byId.get(id)!];
      return d.magnitude ?? 6 - d.prominence;
    };
    const put = (id: string, v: number) => {
      if (!this.byId.has(id)) return;
      const was = rank.get(id);
      if (was === undefined || v < was) rank.set(id, v);
    };
    if (r.verses.length) {
      r.verses.forEach((k, vi) => {
        for (const [id, pl] of this.namedIn.get(k) ?? []) put(id, vi * 1000 + pl.pos);
        for (const id of this.citedIn.get(k) ?? []) put(id, 500_000 + mag(id));
      });
    } else {
      const ch = `${r.book} ${r.chapter}`;
      for (const [k, m] of this.namedIn) {
        if (k.slice(0, k.indexOf(':')) !== ch) continue;
        const v = Number(k.slice(k.indexOf(':') + 1));
        for (const [id, pl] of m) put(id, v * 1000 + pl.pos);
      }
      for (const [id, v] of this.inChapter.get(ch) ?? []) put(id, v * 1000 + 900 + mag(id));
    }
    return [...rank.entries()]
      .sort((a, b) => a[1] - b[1] || mag(a[0]) - mag(b[0]))
      .map(([id], i, all) => ({ id, score: all.length - i, matched: r.ref, via: 'verse' as const }));
  }

  search(raw: string, limit = 30): SearchHit[] {
    const q0 = raw.trim();
    if (!q0) return [];
    // ссылка на стих или главу: «Руф 4:21», «руф 4», «Лк 3:23-25»
    const ref = parseQueryRef(q0);
    if (ref) return this.byRef(ref).slice(0, Math.max(limit, 300));
    const q = norm(fixLayout(q0));
    const qs = stems(q);
    const qWords = q.split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];
    this.docs.forEach((d, i) => {
      // лучший класс по имени и иным формам; при равном классе имя важнее иной формы
      let cls = NONE;
      let alt = 1;
      let matched = '';
      for (const x of this.forms[i]) {
        const c = matchClass(x, q, qs, qWords);
        if (c < cls || (c === cls && x.alt < alt)) {
          cls = c;
          alt = x.alt;
          matched = x.raw;
        }
      }
      if (cls === NONE && d.disambig) {
        const f = norm(d.disambig);
        if (q.length >= 3 && (f.includes(q) || f.split(/[\s,]+/).some((w) => share(stems(w), qs)))) {
          cls = BY_DISAMBIG;
          alt = 0;
          matched = d.disambig;
        }
      }
      if (cls === NONE) return;
      // значимость: ярче звезда — выше; величина 0–6, prominence 1–5 (5 — главные лица)
      const mag = d.magnitude ?? 6 - d.prominence;
      hits.push({ id: d.id, score: (NONE - cls) * 1000 + (1 - alt) * 100 + (6 - mag) * 10 + d.prominence, matched, via: cls === BY_DISAMBIG ? 'disambig' : alt ? 'alt' : 'name' });
    });
    hits.sort((a, b) => b.score - a.score);
    // традиционное именование — первым, с синодальной формой (решение владельца 13)
    const trad = traditionOf(q0);
    if (trad && this.byId.has(trad.id)) {
      const rest = hits.filter((h) => h.id !== trad.id);
      return [{ id: trad.id, score: 100_000, matched: trad.name, via: 'tradition' as const, tradition: trad.name }, ...rest].slice(0, limit);
    }
    // по имени ничего близкого — опечатки: «Навуходонасор» → «Навуходоносор»
    if (!hits.some((h) => h.score >= (NONE - WORD) * 1000)) {
      const fuzzy = this.fuzzy(q);
      if (fuzzy.length) return [...fuzzy, ...hits.filter((h) => !fuzzy.some((f) => f.id === h.id))].slice(0, limit);
    }
    return hits.slice(0, limit);
  }

  /** Имена в пределах опечаток от запроса (по слову и по основам): сначала ближе, затем значимее. */
  private fuzzy(q: string): SearchHit[] {
    const letters = q.replace(/[^а-я\s-]/g, '').trim();
    const budget = typoBudget(letters.replace(/[\s-]/g, '').length);
    if (!budget) return [];
    const qv = stems(letters).filter((s) => s.length >= 4);
    const out: { id: string; d: number; mag: number; matched: string }[] = [];
    this.docs.forEach((doc, i) => {
      let best = budget + 1;
      let matched = '';
      for (const x of this.forms[i]) {
        for (const fv of new Set([x.f, x.first, ...x.st, ...x.firstSt])) {
          for (const v of qv) {
            const dd = damerau(v, fv, budget);
            if (dd < best) {
              best = dd;
              matched = x.raw;
            }
          }
        }
      }
      if (best <= budget) out.push({ id: doc.id, d: best, mag: doc.magnitude ?? 6 - doc.prominence, matched });
    });
    return out
      .sort((a, b) => a.d - b.d || a.mag - b.mag)
      .map((h, i, all) => ({ id: h.id, score: 50_000 + all.length - i, matched: h.matched, via: 'fuzzy' as const }));
  }
}
