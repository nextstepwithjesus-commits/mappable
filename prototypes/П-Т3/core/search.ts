/**
 * Поиск по правилу 11 § 3.6: одно поле понимает адрес, слово, имя и название. Порядок групп — (е):
 * адрес или название истории → пара лиц → лицо с точным именем → истории (нужен каталог 11) → «В тексте Библии».
 * Имена и названия — MiniSearch (09 § 3.5 п. 3); раскладка и адреса — свой разбор; текст — TextIndex.
 */
import MiniSearch from 'minisearch';
import { parseAddress, type Address, type Span } from './address.ts';
import { BOOK_BY_CODE, findBookByName } from './books.ts';
import { norm, words, enToRu, ruToEn, hasLatin, hasCyr, osa, allowedErrors } from './norm.ts';
import type { TextIndex, TextResult, Mode } from './text.ts';
import type { NameForms } from './forms.ts';

export interface Person {
  id: string;
  n: string;
  o?: string[];
  d?: string;
  p: number;
  k: string;
}

export interface Story {
  id: string;
  t: string;
  main: string;
  roles?: Record<string, string[]>;
  /** Привычные названия не из текста — только для поиска (11 § 3.6 (д)). */
  common?: string[];
}

export interface SearchIndexData {
  names: { forms: string[]; ids: string[] }[];
  exceptions: string[][];
  persons: Person[];
  stories: Story[];
}

export interface StoryAt {
  story: Story;
  role: string;
  /** Для диапазона: история целиком внутри него или частично. */
  cover?: 'целиком' | 'частично';
}

export type Group =
  | { kind: 'адрес'; address: Address; stories: StoryAt[] }
  | { kind: 'история'; story: Story; notFromText: boolean }
  | { kind: 'книга'; book: string }
  | { kind: 'пара'; a: Person[]; b: Person[] }
  | { kind: 'лица'; persons: Person[]; form: string }
  | { kind: 'текст'; result: TextResult }
  | { kind: 'возможно'; text: string; target: string; id: string }
  | { kind: 'пусто'; message: string };

export interface SearchResult {
  query: string;
  /** Запрос, по которому найдено (после перевода раскладки). */
  used: string;
  layout: boolean;
  groups: Group[];
  ms: number;
}

const STOP = new Set(['и', 'с', 'да']);

interface Doc {
  id: string;
  kind: 'лицо' | 'книга' | 'история';
  title: string;
  alt: string;
  p: number;
}

export class Searcher {
  private persons = new Map<string, Person>();
  private ms: MiniSearch<Doc>;
  private storySpans: { story: Story; main: Span[]; roles: [string, Span[]][] }[] = [];
  private storyByTitle = new Map<string, { story: Story; notFromText: boolean }>();

  constructor(
    idx: SearchIndexData,
    private names: NameForms,
    private text?: TextIndex,
  ) {
    for (const p of idx.persons) this.persons.set(p.id, p);
    this.ms = new MiniSearch<Doc>({
      fields: ['title', 'alt'],
      storeFields: ['kind', 'title', 'p'],
      processTerm: (t) => norm(t),
      searchOptions: { boost: { title: 2 } },
    });
    const docs: Doc[] = [];
    for (const p of idx.persons) docs.push({ id: `p:${p.id}`, kind: 'лицо', title: p.n, alt: (p.o ?? []).join(' '), p: p.p });
    for (const b of BOOK_BY_CODE.values()) docs.push({ id: `b:${b.code}`, kind: 'книга', title: b.name, alt: b.ru.join(' '), p: 5 });
    for (const s of idx.stories) {
      docs.push({ id: `s:${s.id}`, kind: 'история', title: s.t, alt: (s.common ?? []).join(' '), p: 5 });
      this.storyByTitle.set(norm(s.t), { story: s, notFromText: false });
      for (const c of s.common ?? []) this.storyByTitle.set(norm(c), { story: s, notFromText: true });
      const main = parseAddress(s.main)?.spans ?? [];
      const roles = Object.entries(s.roles ?? {}).map(([r, refs]) => [r, refs.flatMap((x) => parseAddress(x)?.spans ?? [])] as [string, Span[]]);
      this.storySpans.push({ story: s, main, roles });
    }
    this.ms.addAll(docs);
  }

  setText(t: TextIndex) {
    this.text = t;
  }

  /** Лица, чьё имя даёт эту форму (тёзки и слившиеся имена — все, по значимости). */
  personsOf(form: string): Person[] {
    return this.names
      .ids(form)
      .map((id) => this.persons.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.p - a.p);
  }

  search(q: string, opts: { mode?: Mode; limit?: number } = {}): SearchResult {
    const t0 = performance.now();
    const query = q.trim();
    const res: SearchResult = { query, used: query, layout: false, groups: [], ms: 0 };
    if (!query) return res;
    const tries = [query];
    if (hasLatin(query)) tries.push(enToRu(query));
    else if (hasCyr(query) && /\d/.test(query)) tries.push(ruToEn(query));
    let best: { used: string; groups: Group[]; score: number } | null = null;
    for (const t of tries) {
      const groups = this.core(t, opts.mode ?? 'формы', opts.limit ?? 50);
      const score = this.score(groups);
      if (!best || score > best.score) best = { used: t, groups, score };
      if (score >= 1000) break;
    }
    res.used = best!.used;
    res.layout = best!.used !== query;
    res.groups = best!.groups;
    if (res.groups.length === 0) res.groups.push({ kind: 'пусто', message: emptyMessage(query) });
    res.ms = performance.now() - t0;
    return res;
  }

  /** Точнее тот вариант, где есть точное совпадение; затем — больше стихов в тексте. */
  private score(groups: Group[]): number {
    let s = 0;
    for (const g of groups) {
      if (g.kind === 'адрес' && g.address.errors.length === 0) s += 1000;
      else if (g.kind === 'адрес') s += 100;
      else if (g.kind === 'история' || g.kind === 'книга' || g.kind === 'пара' || g.kind === 'лица') s += 1000;
      else if (g.kind === 'текст') s += Math.min(500, g.result.total);
      else if (g.kind === 'возможно') s += 1;
    }
    return s;
  }

  private core(q: string, mode: Mode, limit: number): Group[] {
    const groups: Group[] = [];
    const addr = parseAddress(q, this.text?.vers, this.text?.has);
    if (addr) {
      groups.push({ kind: 'адрес', address: addr, stories: this.storiesAt(addr) });
      return groups;
    }
    const key = norm(q).replace(/\s+/g, ' ').replace(/[«»"„“]/g, '').trim();
    const st = this.storyByTitle.get(key);
    if (st) groups.push({ kind: 'история', story: st.story, notFromText: st.notFromText });
    const toks = words(q);
    const content = toks.filter((t) => !STOP.has(t));
    if (content.length === 1) {
      const b = findBookByName(content[0]);
      if (b) groups.push({ kind: 'книга', book: b.code });
    }
    const named = content.map((t) => ({ t, ps: this.personsOf(t) }));
    if (content.length === 2 && named.every((x) => x.ps.length > 0)) {
      groups.push({ kind: 'пара', a: named[0].ps, b: named[1].ps });
    } else {
      for (const x of named) if (x.ps.length) groups.push({ kind: 'лица', persons: x.ps, form: x.t });
    }
    let textTotal = 0;
    if (this.text && toks.length) {
      const r = this.text.search(toks.length > 4 ? content.slice(0, 4) : toks, mode, limit);
      textTotal = r.total;
      if (r.total > 0) groups.push({ kind: 'текст', result: r });
    }
    const strong = groups.some((g) => g.kind !== 'текст');
    const knownWord = content.length === 1 && this.text?.hasForm(content[0]);
    if (!strong && content.length >= 1 && content.length <= 2 && !knownWord && textTotal === 0) {
      const sug = this.didYouMean(content.join(' '));
      if (sug) groups.push(sug);
    }
    return groups;
  }

  /** «Возможно, вы искали: Голиаф» — одна-две ошибки по длине слова (11 § 3.6 (б)). */
  didYouMean(q: string): Group | null {
    const terms = words(q);
    if (!terms.length) return null;
    const hits = this.ms.search(q, { fuzzy: 2, prefix: false, combineWith: 'AND', boost: { title: 2 } });
    let best: { d: number; extra: number; p: number; score: number; title: string; id: string } | null = null;
    for (const h of hits) {
      // каждое слово запроса должно совпасть с каким-то словом названия не больше чем с допустимым числом ошибок
      const titleWords = words(`${h.title}`);
      let worst = 0;
      for (const t of terms) {
        const d = Math.min(...titleWords.map((w) => osa(t, w)));
        if (d > allowedErrors(t)) {
          worst = 99;
          break;
        }
        worst = Math.max(worst, d);
      }
      if (worst === 99 || worst === 0) continue;
      const extra = titleWords.length - terms.length;
      const cand = { d: worst, extra, p: h.p as number, score: h.score, title: h.title as string, id: h.id as string };
      const better = (a: typeof cand, b: typeof cand) =>
        a.d !== b.d ? a.d < b.d : a.extra !== b.extra ? a.extra < b.extra : a.p !== b.p ? a.p > b.p : a.score > b.score;
      if (!best || better(cand, best)) best = cand;
    }
    return best ? { kind: 'возможно', text: `Возможно, вы искали: ${best.title}`, target: best.title, id: best.id } : null;
  }

  /** Подсказки при вводе: с двух букв, до 8 строк (11 § 3.6 (з)). */
  suggest(q: string): { id: string; title: string; kind: string }[] {
    const s = q.trim();
    if (s.length < 2) return [];
    const run = (x: string) =>
      this.ms.search(x, {
        prefix: true,
        fuzzy: (term) => (term.length >= 4 ? allowedErrors(term) : 0),
        combineWith: 'AND',
        boost: { title: 2 },
        boostDocument: (_id, _t, f) => 1 + ((f?.p as number) ?? 1) / 5,
      });
    let hits = run(s);
    if (!hits.length && hasLatin(s)) hits = run(enToRu(s));
    return hits.slice(0, 8).map((h) => ({ id: h.id as string, title: h.title as string, kind: h.kind as string }));
  }

  /** Истории, где стоит стих или которые пересекаются с диапазоном, с ролью (11 § 3.6 (в)). Каталог — эскиз. */
  storiesAt(a: Address): StoryAt[] {
    const out: StoryAt[] = [];
    for (const span of a.spans) {
      const hits: StoryAt[] = [];
      for (const s of this.storySpans) {
        if (s.main.some((m) => overlap(m, span))) {
          const cover = s.main.every((m) => contains(span, m)) ? 'целиком' : 'частично';
          hits.push({ story: s.story, role: 'рассказ', cover: isPoint(span) ? undefined : cover });
          continue;
        }
        for (const [role, spans] of s.roles) if (spans.some((m) => overlap(m, span))) hits.push({ story: s.story, role });
      }
      // история, внутри которой лежит другая найденная история, — «вложенная история»
      for (const h of hits) {
        if (h.role !== 'рассказ') continue;
        const outer = this.storySpans.find((s) => s.story === h.story)!.main;
        const inner = hits.find((x) => x !== h && x.role === 'рассказ' && this.storySpans.find((s) => s.story === x.story)!.main.every((m) => outer.some((o) => contains(o, m))));
        if (inner) h.role = `вложенная история: ${inner.story.t}`;
      }
      out.push(...hits);
    }
    return out;
  }
}

const pos = (c: number, v: number | undefined, end: boolean) => c * 1000 + (v ?? (end ? 999 : 0));
function overlap(a: Span, b: Span): boolean {
  return a.book === b.book && pos(a.c1, a.v1, false) <= pos(b.c2, b.v2, true) && pos(b.c1, b.v1, false) <= pos(a.c2, a.v2, true);
}
function contains(outer: Span, inner: Span): boolean {
  return outer.book === inner.book && pos(outer.c1, outer.v1, false) <= pos(inner.c1, inner.v1, false) && pos(inner.c2, inner.v2, true) <= pos(outer.c2, outer.v2, true);
}
const isPoint = (s: Span) => s.v1 !== undefined && s.c1 === s.c2 && s.v1 === s.v2;

export function emptyMessage(q: string): string {
  return `Ничего не нашлось по запросу «${q}». Проверьте буквы и раскладку. Попробуйте имя («Давид»), место («Вифлеем») или адрес («Мк 6:35»)`;
}

/** Ключ первого результата для набора 50 запросов: «адрес:Мк 6:35», «лица:noy», «история:s-noy» … */
export function firstKey(r: SearchResult): string {
  const g = r.groups[0];
  if (!g) return 'пусто';
  switch (g.kind) {
    case 'адрес':
      return `адрес:${g.address.label}`;
    case 'история':
      return `история:${g.story.id}`;
    case 'книга':
      return `книга:${g.book}`;
    case 'пара':
      return `пара:${g.a[0].id}+${g.b[0].id}`;
    case 'лица':
      return `лица:${g.persons.map((p) => p.id).join(',')}`;
    case 'текст':
      return 'текст';
    case 'возможно':
      return `возможно:${g.id}`;
    case 'пусто':
      return 'пусто';
  }
}
