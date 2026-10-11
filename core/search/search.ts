/**
 * Поиск по правилу 11 § 3.6: одно поле понимает адрес, слово, имя и название. Порядок групп — (е):
 * адрес или название истории → книга → пара лиц → лицо с точным именем → место, область → истории (нужен каталог 11) →
 * «В тексте Библии». Имена и названия — MiniSearch (09 § 3.5 п. 3); раскладка и адреса — свой разбор; текст — TextIndex.
 *
 * Исправлено по рецензиям переноса (`docs/app/reviews/этап-0-ядро-рецензия-*.md`): титулы — не имена (№ 2; правило — в сборке
 * и в `NOT_NAME_WORDS`); тёзки — полное совпадение имени, затем другое имя, значимость, число стихов (№ 3); имя из двух слов —
 * одно лицо, а не пара (№ 3); места и области (№ 9; данные № 3); «Возможно» — с трёх букв, однозначное сокращение книги —
 * книга (№ 10); строка о Псалмах — словами псалма (№ 11); второй вариант раскладки (№ 18).
 */
import MiniSearch from 'minisearch';
import { now } from '../clock.ts';
import { parseAddress, type Address, type Span } from './address.ts';
import { BOOK_BY_CODE, findBook, findBookByName } from '../books.ts';
import { norm, words, enToRu, ruToEn, hasLatin, hasCyr, osa, allowedErrors } from './norm.ts';
import type { TextIndex, TextResult, Mode, SearchOptions } from './text.ts';
import type { NameForms } from './forms.ts';
import { showText } from '../verses.ts';

export interface Person {
  id: string;
  n: string;
  o?: string[];
  d?: string;
  p: number;
  k: string;
  /** Число стихов записей лица. */
  c?: number;
}

export interface Place {
  id: string;
  n: string;
  o?: string[];
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
  places?: Place[];
  areas?: { id: string; n: string }[];
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
  | { kind: 'место'; places: Place[] }
  | { kind: 'область'; areas: { id: string; n: string }[] }
  | { kind: 'текст'; result: TextResult }
  | { kind: 'возможно'; text: string; target: string; id: string }
  | { kind: 'пусто'; message: string };

export interface SearchResult {
  query: string;
  /** Запрос, по которому найдено (после перевода раскладки). */
  used: string;
  layout: boolean;
  /** Второй вариант раскладки, если и он что-то нашёл: строка „Искали «…»?“ (11 § 3.6 (а)). */
  alt?: { used: string; text: string };
  groups: Group[];
  ms: number;
}

const STOP = new Set(['и', 'с', 'да']);

interface Doc {
  id: string;
  kind: 'лицо' | 'книга' | 'история' | 'место' | 'область';
  title: string;
  alt: string;
  p: number;
}

const key = (s: string) => norm(s).replace(/[«»"„“,]/g, ' ').replace(/\s+/g, ' ').trim();

export class Searcher {
  private persons = new Map<string, Person>();
  private places = new Map<string, Place>();
  private byFullName = new Map<string, { id: string; main: boolean }[]>();
  private byPlace = new Map<string, Place[]>();
  private byArea = new Map<string, { id: string; n: string }[]>();
  private ms: MiniSearch<Doc>;
  private storySpans: { story: Story; main: Span[]; roles: [string, Span[]][] }[] = [];
  private storyByTitle = new Map<string, { story: Story; notFromText: boolean }>();
  private hasPlaces: boolean;

  constructor(
    idx: SearchIndexData,
    private names: NameForms,
    private text?: TextIndex,
  ) {
    for (const p of idx.persons) {
      this.persons.set(p.id, p);
      for (const [n, main] of [[p.n, true], ...(p.o ?? []).map((o) => [o, false] as [string, boolean])] as [string, boolean][]) {
        const k = key(n);
        (this.byFullName.get(k) ?? this.byFullName.set(k, []).get(k)!).push({ id: p.id, main });
      }
    }
    for (const pl of idx.places ?? []) {
      this.places.set(pl.id, pl);
      for (const n of [pl.n, ...(pl.o ?? [])]) (this.byPlace.get(key(n)) ?? this.byPlace.set(key(n), []).get(key(n))!).push(pl);
    }
    for (const a of idx.areas ?? []) (this.byArea.get(key(a.n)) ?? this.byArea.set(key(a.n), []).get(key(a.n))!).push(a);
    this.hasPlaces = this.places.size > 0;
    this.ms = new MiniSearch<Doc>({
      fields: ['title', 'alt'],
      storeFields: ['kind', 'title', 'p'],
      processTerm: (t) => norm(t),
      searchOptions: { boost: { title: 2 } },
    });
    const docs: Doc[] = [];
    for (const p of idx.persons) docs.push({ id: `p:${p.id}`, kind: 'лицо', title: p.n, alt: (p.o ?? []).join(' '), p: p.p });
    for (const b of BOOK_BY_CODE.values()) docs.push({ id: `b:${b.code}`, kind: 'книга', title: b.name, alt: b.ru.join(' '), p: 5 });
    for (const pl of idx.places ?? []) docs.push({ id: `l:${pl.id}`, kind: 'место', title: pl.n, alt: (pl.o ?? []).join(' '), p: 3 });
    for (const a of idx.areas ?? []) docs.push({ id: `g:${a.id}`, kind: 'область', title: a.n, alt: '', p: 3 });
    for (const s of idx.stories) {
      docs.push({ id: `s:${s.id}`, kind: 'история', title: s.t, alt: (s.common ?? []).join(' '), p: 5 });
      this.storyByTitle.set(key(s.t), { story: s, notFromText: false });
      for (const c of s.common ?? []) this.storyByTitle.set(key(c), { story: s, notFromText: true });
      const main = parseAddress(s.main)?.spans ?? [];
      const roles = Object.entries(s.roles ?? {}).map(([r, refs]) => [r, refs.flatMap((x) => parseAddress(x)?.spans ?? [])] as [string, Span[]]);
      this.storySpans.push({ story: s, main, roles });
    }
    this.ms.addAll(docs);
  }

  setText(t: TextIndex) {
    this.text = t;
  }

  /** Уточнения лиц из указателя инструментов (правило К-9: в ядре индекса их нет) — для строк тёзок. */
  setDisambig(rows: { id: string; d?: string }[]) {
    for (const r of rows) {
      const p = this.persons.get(r.id);
      if (p && r.d) p.d = r.d;
    }
  }

  /**
   * Лица, чьё имя даёт эту форму. Порядок (рецензия интерфейса, № 3; решение координатора): совпадение с основным именем,
   * затем с другим именем; при равенстве — значимость, затем больше стихов. «Иисус» — Иисус Христос, «Осия» — пророк Осия.
   */
  personsOf(form: string, query = form, exactFirst = true): Person[] {
    const q = key(query);
    const first = (n: string) => key(n).split(' ')[0];
    // 0 — запрос = основное имя или его первое слово; 1 — другое имя лица («Осия» у Иисуса Навина); 2 — иначе
    const rank = (p: Person) => (!exactFirst ? 0 : key(p.n) === q || first(p.n) === q ? 0 : (p.o ?? []).some((o) => key(o) === q || first(o) === q) ? 1 : 2);
    return this.names
      .ids(form)
      .map((id) => this.persons.get(id))
      .filter((p): p is Person => !!p)
      .sort((a, b) => rank(a) - rank(b) || b.p - a.p || (b.c ?? 0) - (a.c ?? 0) || (a.id < b.id ? -1 : 1));
  }

  /** Места, чьё имя даёт эту форму (номера места в словаре форм — с приставкой `l-`). */
  placesOf(form: string): Place[] {
    return this.names
      .ids(form)
      .filter((id) => id.startsWith('l-'))
      .map((id) => this.places.get(id.slice(2)))
      .filter((p): p is Place => !!p);
  }

  search(q: string, opts: { mode?: Mode; limit?: number; within?: Span[]; order?: SearchOptions['order'] } = {}): SearchResult {
    const t0 = now();
    const query = q.normalize('NFC').trim();
    const res: SearchResult = { query, used: query, layout: false, groups: [], ms: 0 };
    if (!query) return res;
    const tries = [query];
    if (hasLatin(query)) tries.push(enToRu(query));
    else if (hasCyr(query) && /\d/.test(query)) tries.push(ruToEn(query));
    const done: { used: string; groups: Group[]; score: number }[] = [];
    for (const t of tries) {
      const groups = this.core(t, opts.mode ?? 'формы', opts.limit ?? 50, opts);
      done.push({ used: t, groups, score: this.score(groups) });
    }
    // «Э» в начале слова: в Синодальном тексте «Еммануил» (Ис 7:14) — вариант с «Е», только если набранное не нашло ни лица,
    // ни книги, ни адреса («Эла» — своё лицо; сверка, № 27)
    if (/(^|[^а-яё])[эЭ]/.test(query) && Math.max(...done.map((d) => d.score)) < 1000) {
      const t = query.replace(/(^|[^а-яёА-ЯЁ])э/g, '$1е').replace(/(^|[^а-яёА-ЯЁ])Э/g, '$1Е');
      const groups = this.core(t, opts.mode ?? 'формы', opts.limit ?? 50, opts);
      done.push({ used: t, groups, score: this.score(groups) });
    }
    const sorted = [...done].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    res.used = best.used;
    res.layout = best.used !== query && hasLatin(query) !== hasLatin(best.used);
    res.groups = best.groups;
    const second = sorted[1];
    if (second && second.score > 0 && second.groups.some((g) => g.kind !== 'возможно')) res.alt = { used: second.used, text: `Искали «${second.used}»?` };
    if (res.groups.length === 0) res.groups.push({ kind: 'пусто', message: emptyMessage(query, this.hasPlaces) });
    res.ms = now() - t0;
    return res;
  }

  /** Точнее тот вариант, где есть точное совпадение; затем — больше стихов в тексте. */
  private score(groups: Group[]): number {
    let s = 0;
    for (const g of groups) {
      if (g.kind === 'адрес' && g.address.errors.length === 0) s += 1000;
      else if (g.kind === 'адрес') s += 100;
      else if (g.kind === 'история' || g.kind === 'книга' || g.kind === 'пара' || g.kind === 'лица' || g.kind === 'место' || g.kind === 'область') s += 1000;
      else if (g.kind === 'текст') s += Math.min(500, g.result.total);
      else if (g.kind === 'возможно') s += 1;
    }
    return s;
  }

  /** Строка о Псалмах словами псалма (11 § 3.6 (в)): «Если вы ищете псалом со словами «Господь — Пастырь мой» (Пс 22:1), …». */
  private psalmNote(a: Address): string | null {
    const h = a.psalmHint;
    if (!h) return null;
    const syn = h.synodal[0];
    const label = `Пс\u00A0${h.synodal.join(' и ')}`;
    const v1 = this.text?.verseText('Пс', syn, 1);
    if (v1 === undefined || v1 === null) return `Если вы ищете псалом ${h.asked} по западной нумерации, в Синодальном переводе это ${label}`;
    // надписание («Псалом Давида.») — пропускается; берутся слова до первого знака препинания
    let v = 1;
    let t = v1;
    const sentences = t.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1 && /^(псалом|песнь|начальнику|молитва|учение|хвала|аллилуия)/i.test(sentences[0])) t = sentences.slice(1).join(' ');
    else if (sentences.length === 1 && /^(псалом|песнь|начальнику|молитва|учение)/i.test(t)) {
      const v2 = this.text?.verseText('Пс', syn, 2);
      if (v2) {
        t = v2;
        v = 2;
      }
    }
    // не меньше 4 слов после надписания и «Аллилуия» («Хвалите» одно не узнать — сверка, № 26); до знака конца, не больше 6
    t = t.replace(/^\s*аллилуия[.!,]?\s*/i, '');
    const ws = t.trim().split(/\s+/);
    const take: string[] = [];
    for (const x of ws) {
      take.push(x);
      if (take.length >= 6 || (take.length >= 4 && /[;:,.!?]$/.test(x))) break;
    }
    const w = showText(take.join(' ').replace(/[;:,.!?]+$/, ''));
    return `Если вы ищете псалом со словами «${w}» (Пс\u00A0${syn}:${v}), в Синодальном переводе это ${label}`;
  }

  private core(q: string, mode: Mode, limit: number, opts: SearchOptions): Group[] {
    const groups: Group[] = [];
    const addr = parseAddress(q, this.text?.vers, this.text?.has);
    if (addr) {
      const note = this.psalmNote(addr);
      if (note) addr.notes.push(note);
      groups.push({ kind: 'адрес', address: addr, stories: this.storiesAt(addr) });
      return groups;
    }
    const phrase = /^\s*[«"„“].+[»"“”]\s*$/.test(q);
    const k = key(q);
    const st = this.storyByTitle.get(k);
    if (st) groups.push({ kind: 'история', story: st.story, notFromText: st.notFromText });
    const toks = words(q);
    const content = toks.filter((t) => !STOP.has(t));
    let handled = false;
    // книга по полному названию, в том числе из нескольких слов («Песнь песней», «Плач Иеремии», «Иона»)
    const bookByName = findBookByName(content.join(' '));
    if (bookByName) groups.push({ kind: 'книга', book: bookByName.code });
    // однозначное синодальное сокращение без главы («Быт», «Мк», «Ин») — книга; если это и слово текста («Лев», «Суд») — и слово
    let abbrOnly = false;
    if (!bookByName && content.length === 1) {
      const hit = findBook(content[0]);
      if (hit && hit.system === 'syn' && (key(hit.book.code) === content[0] || key(hit.book.short) === content[0])) {
        groups.push({ kind: 'книга', book: hit.book.code });
        abbrOnly = !this.text?.hasForm(content[0]);
      }
    }
    // полное имя лица фразой («Иисус Навин», «Мария Магдалина», «Симон Петр») — одно лицо, а не пара (№ 3)
    const full = this.byFullName.get(k);
    if (full && content.length >= 2) {
      const ps = [...new Set(full.map((x) => x.id))].map((id) => this.persons.get(id)).filter((p): p is Person => !!p);
      const rank = (p: Person) => (full.some((x) => x.id === p.id && x.main) ? 0 : 1);
      ps.sort((a, b) => rank(a) - rank(b) || b.p - a.p || (b.c ?? 0) - (a.c ?? 0));
      groups.push({ kind: 'лица', persons: ps, form: k });
      handled = true;
    }
    const places = this.byPlace.get(k) ?? (content.length === 1 ? this.placesOf(content[0]) : []);
    const areas = this.byArea.get(k) ?? [];
    if (!handled) {
      // в паре слово стоит в падеже и может совпасть с именем другого лица («Иакова и Исава»): там порядок — значимость, стихи
      const named = content.map((t) => ({ t, ps: this.personsOf(t, content.length === 1 ? q : t, content.length === 1) }));
      if (content.length === 2 && named.every((x) => x.ps.length > 0)) {
        const both = named[0].ps.filter((p) => named[1].ps.some((x) => x.id === p.id));
        // оба слова — имена одного лица: это одно лицо, а не пара (лицо с самим собой)
        if (both.length && both.length === Math.min(named[0].ps.length, named[1].ps.length)) groups.push({ kind: 'лица', persons: both, form: k });
        else groups.push({ kind: 'пара', a: named[0].ps, b: named[1].ps });
      } else {
        for (const x of named) if (x.ps.length) groups.push({ kind: 'лица', persons: x.ps, form: x.t });
      }
    }
    if (places.length) groups.push({ kind: 'место', places });
    if (areas.length) groups.push({ kind: 'область', areas });
    let textTotal = 0;
    if (this.text && toks.length && !abbrOnly) {
      const r = this.text.search(toks.length > 4 ? content.slice(0, 4) : toks, mode, limit, { phrase, within: opts.within, order: opts.order });
      textTotal = r.total;
      if (r.total > 0) groups.push({ kind: 'текст', result: r });
    }
    const strong = groups.some((g) => g.kind !== 'текст');
    const knownWord = content.length === 1 && this.text?.hasForm(content[0]);
    if (!strong && content.length >= 1 && content.length <= 2 && !knownWord && textTotal === 0 && content.join('').length >= 3) {
      const sug = this.didYouMean(content.join(' '));
      if (sug) groups.push(sug);
    }
    return groups;
  }

  /** «Возможно, вы искали: Голиаф» — одна-две ошибки по длине слова (11 § 3.6 (б)); запрос короче 3 букв — без подсказки. */
  didYouMean(q: string): Group | null {
    const terms = words(q);
    if (!terms.length || terms.join('').length < 3) return null;
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

/** Пустой результат (11 § 3.6 (з)): советует только то, что поиск умеет (рецензия интерфейса, № 9) — место, если места есть. */
export function emptyMessage(q: string, places = false): string {
  return `Ничего не нашлось по запросу «${q}». Проверьте буквы и раскладку. Попробуйте имя («Давид»)${places ? ', место («Вифлеем»)' : ''} или адрес («Мк\u00A06:35»)`;
}

/** Ключ первого результата для набора 50 запросов: «адрес:Мк 6:35», «лица:noy», «история:s-noy» … */
export function firstKey(r: SearchResult): string {
  const g = r.groups[0];
  if (!g) return 'пусто';
  switch (g.kind) {
    case 'адрес':
      return `адрес:${g.address.label.replace(/\u00A0/g, ' ')}`;
    case 'история':
      return `история:${g.story.id}`;
    case 'книга':
      return `книга:${g.book}`;
    case 'пара':
      return `пара:${g.a[0].id}+${g.b[0].id}`;
    case 'лица':
      return `лица:${g.persons.map((p) => p.id).join(',')}`;
    case 'место':
      return `место:${g.places.map((p) => p.id).join(',')}`;
    case 'область':
      return `область:${g.areas.map((a) => a.id).join(',')}`;
    case 'текст':
      return 'текст';
    case 'возможно':
      return `возможно:${g.id}`;
    case 'пусто':
      return 'пусто';
  }
}
