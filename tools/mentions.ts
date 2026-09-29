/**
 * § 23 «Места Писания»: в каких стихах лицо названо по имени (tools/build-data.ts; проверка — tests/mentions-df.test.ts).
 *
 * Считаются стихи основного текста (без вставок в скобках), где стоит имя лица или его иная форма (§ 4; титулы
 * и прозвания — нет). Имя ищется сопоставителем форм nameMatcher (склонение, притяжательные «Давидов», «Илиев») среди
 * слов с прописной буквы: имена в Синодальном тексте пишутся с прописной, а совпадающие с ними слова («дано», «гады») — нет.
 *
 * Одна и та же словоформа текста может называть не это лицо, а тёзку, место, народ, бога или быть падежом другого имени
 * («Салу» в Быт 10:24 — винительный падеж от «Сала»). Поэтому стих засчитывается лицу, только если его не исключает ни одно
 * из правил ниже (этап 11, DF2: прежде у лиц без тёзок в атласе считалась вся Библия, и в § 23 попадали Гог Иез 38–39,
 * город Фирца, бог Адрамелех 4 Цар 17:31):
 *  1. Тёзки (прежнее правило). Если имя носят и другие лица атласа, или это имя колена или народа (Завулон, Моав, Хам),
 *     или лицо — народ или род, стихи считаются только в главах, на которые ссылается карточка (без § 24), а в главе,
 *     которую цитирует и тёзка, — только стихи, на которые ссылается карточка. Иные имена (§ 4) — всегда так.
 *  2. «Не смешивать с…». Стихи из примечания § 24, где составитель прямо отличает лицо от другого лица или предмета
 *     («Не смешивать с городом Фирца (Нав 12:24)», «…с Адрамелехом, богом Сепарваимским (4 Цар 17:31)»), не считаются,
 *     если карточка не ссылается на них в других разделах.
 *  3. Места. Словоформа, которой называется место из карточек атласа (§ 8, 15, 20: Фирца, Рама, Сихем, Вирсавия, Дан),
 *     засчитывается только в стихах, на которые ссылается карточка: в остальных это город, а не лицо.
 *  4. Книги. У лиц значимости 1–3 (data/AUTHORING.md: только имя в родословии; несколько фактов; собственный рассказ)
 *     составитель карточки приводит все места, где лицо названо, поэтому имя в книге, на которую карточка не ссылается,
 *     принадлежит другому: Гог Иезекииля и Откровения, народ Буз у Иеремии, «Гадитяне» 1 Пар 5:26. Исключение — стих,
 *     где рядом по имени названы родитель, ребёнок, супруг, брат или сестра, дед или внук лица: «Халев, сын Иефонниин»
 *     (Втор 1:36), «Иоав, сын Саруин» (3 Цар 2:5), «из сыновей Каафовых… Мерариных» (2 Пар 29:12).
 *     У лиц значимости 4–5 (главные лица книг и истории спасения) имя в других книгах — это они: «Притчи Соломона,
 *     сына Давидова» (Притч 1:1), «как говорил Моисей» (Суд 1:20), послания Павла (Еф 1:1). Для них правило книг не
 *     действует (правила 1–3 — действуют: Вирсавия, жена Урии, — не город Вирсавия).
 * Составитель управляет счётом через ссылки карточки: стих, на который карточка ссылается (кроме § 24), правила 2–4
 * не исключают.
 */
import { parseRef, verseId } from '../src/engine/books.ts';
import { nameMatcher, norm, stripBrackets, namesIn } from '../src/engine/text.ts';
import type { Person, Group } from '../src/data/types.ts';
import type { BibleText } from './bible.ts';

/** Все ссылки лица; notes: false — без примечаний § 24 (они часто ведут к другим лицам: «не смешивать с…»). */
export function refsOf(p: Person, opts: { notes?: boolean } = {}): string[] {
  const out = new Set<string>();
  const add = (r?: string[] | string) => {
    if (!r) return;
    for (const x of Array.isArray(r) ? r : [r]) out.add(x);
  };
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
}

/** Правило 4: наибольшая значимость лица, у которого имя считается только в книгах его карточки. */
export const BOOK_RULE_MAX_PROMINENCE = 3;
/** Правило 2: примечание § 24, которое отличает лицо от другого лица или предмета. */
const NOT_THIS = /^(Не смешивать|Не путать|Другое лицо|Иное лицо)/;

export interface Mentions {
  n: number;
  /** 'chapters' — счёт только в главах карточки (правило 1); 'bible' — по правилам 2–4. */
  scope: 'bible' | 'chapters';
}

export interface MentionCount {
  /** Лицо → книга → число стихов (§ 23 карточки). */
  books: Map<string, Record<string, number>>;
  /** Лицо → число стихов и охват счёта; только у лиц, названных хотя бы в одном стихе. */
  mentions: Map<string, Mentions>;
  /** Лицо → стихи, где оно названо («Быт 5:3»). */
  verses: Map<string, Set<string>>;
  /** Сколько лиц считаются только в главах карточки (правило 1). */
  restricted: number;
}

export function countMentions(persons: Person[], groups: Group[], bible: BibleText): MentionCount {
  const WORD = /[А-ЯЁ][а-яё]*(?:[-—–][А-ЯЁа-яё][а-яё]*)*/g;
  const wordVerses = new Map<string, string[]>(); // словоформа → стихи
  const proper = new Map<string, number>(); // сколько раз слово стоит с прописной внутри предложения (имя собственное)
  const lower = new Map<string, number>(); // сколько раз слово стоит со строчной буквы
  const bump = (m: Map<string, number>, w: string) => m.set(w, (m.get(w) ?? 0) + 1);
  for (const [key, text] of bible.verses) {
    const t = stripBrackets(text);
    const seenWords = new Set<string>();
    for (const m of t.matchAll(WORD)) {
      const n = norm(m[0]);
      let i = m.index - 1;
      while (i >= 0 && /\s/.test(t[i])) i--;
      if (i >= 0 && /[\p{Ll}\d,]/u.test(t[i])) bump(proper, n);
      if (seenWords.has(n)) continue;
      seenWords.add(n);
      const a = wordVerses.get(n);
      if (a) a.push(key);
      else wordVerses.set(n, [key]);
    }
    for (const w of t.match(/(?<![А-ЯЁа-яё])[а-яё]+/g) ?? []) bump(lower, norm(w));
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
  const ownNames = (p: Person): string[] =>
    p.unnamed ? [] : [p.name, ...(p.card?.altNames ?? []).filter((a) => a.kind !== 'title' && a.kind !== 'epithet').map((a) => a.name)];

  // --- правило 1: тёзки — чьё имя ловит сопоставитель этого лица («Мелхи» не мешает счёту «Мелхиседека», «Руф» мешает счёту «Руфи»)
  type NameEntry = { pid: string; word: string };
  const entriesByPrefix = new Map<string, NameEntry[]>();
  for (const p of persons)
    for (const n of ownNames(p)) {
      const e = { pid: p.id, word: firstWord(n) };
      const k = e.word.slice(0, 2);
      const a = entriesByPrefix.get(k);
      if (a) a.push(e);
      else entriesByPrefix.set(k, [e]);
    }
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

  // --- правило 3: места из карточек — первое слово каждой части названия («Фирца — столица», «Гива Саула», «Сузы,
  // престольный город»), если это имя собственное текста: его формы стоят с прописной внутри предложения чаще, чем само
  // слово — со строчной («Земля Ханаанская», «Город Давидов», «дерево ситтим» — не имена мест)
  const placeForms = new Set<string>();
  const placeSeen = new Set<string>();
  for (const p of persons) {
    const c = p.card;
    for (const s of [...(c?.places ?? []).map((x) => x.name), c?.birth?.place, c?.death?.place]) {
      if (!s) continue;
      for (const seg of s.split(/[,;—–()«»]/)) {
        const m = /^\s*([А-ЯЁ][а-яё]*(?:-[А-ЯЁа-яё][а-яё]*)*)/.exec(seg);
        if (!m) continue;
        const w = norm(m[1]);
        if (placeSeen.has(w)) continue;
        placeSeen.add(w);
        const forms = formsOf(w);
        if (forms.reduce((sum, f) => sum + (proper.get(f) ?? 0), 0) > (lower.get(w) ?? 0)) for (const f of forms) placeForms.add(f);
      }
    }
  }

  /**
   * Главы, стихи и книги, на которые ссылается карточка лица (без § 24); целая глава или длинный диапазон — только главой
   * (whole: такая глава для правила 3 — как если бы карточка сослалась на каждый её стих).
   */
  const citedCache = new Map<string, { chapters: Set<string>; verses: Set<string>; books: Set<string>; whole: Set<string> }>();
  const citedBy = (p: Person) => {
    const have = citedCache.get(p.id);
    if (have) return have;
    const chapters = new Set<string>();
    const verses = new Set<string>();
    const books = new Set<string>();
    const whole = new Set<string>();
    for (const r of refsOf(p, { notes: false })) {
      const pr = parseRef(r, bible.chapterLength);
      if (pr) books.add(pr.book);
      if (pr && pr.chapterOnly) {
        chapters.add(`${pr.book} ${pr.chapterOnly}`);
        whole.add(`${pr.book} ${pr.chapterOnly}`);
      } else if (pr)
        for (const v of pr.verses) {
          chapters.add(`${v.book} ${v.chapter}`);
          verses.add(verseId(v));
        }
      else {
        // межглавный диапазон длиннее трёх глав: «Быт 12:1-25:10»
        const m = /^(\S+)\s+(\d+)(?::\d+)?(?:-(\d+):\d+)?/.exec(r.replace(/[–—]/g, '-'));
        if (m) {
          books.add(m[1]);
          for (let ch = Number(m[2]); ch <= Number(m[3] ?? m[2]); ch++) {
            chapters.add(`${m[1]} ${ch}`);
            whole.add(`${m[1]} ${ch}`);
          }
        }
      }
    }
    const out = { chapters, verses, books, whole };
    citedCache.set(p.id, out);
    return out;
  };

  // --- правило 4: родня лица по данным — родители (кроме «потомка» через пропуск поколений), дети, супруги, братья
  // и сёстры, родство словами Писания (kin), деды и внуки
  const byId = new Map(persons.map((p) => [p.id, p]));
  const parentsOf = (p: Person): string[] =>
    [p.father, p.mother, ...(p.otherParents ?? []).filter((o) => o.kind !== 'ancestor').map((o) => o.id)].filter((x): x is string => !!x && byId.has(x));
  const childrenOf = new Map<string, string[]>();
  const around = new Map<string, Set<string>>(); // супруги и kin — в обе стороны
  const link = (a: string, b: string) => {
    const s = around.get(a) ?? new Set<string>();
    s.add(b);
    around.set(a, s);
  };
  for (const p of persons) {
    for (const par of parentsOf(p)) childrenOf.set(par, [...(childrenOf.get(par) ?? []), p.id]);
    for (const s of p.spouses ?? []) if (byId.has(s.id)) { link(p.id, s.id); link(s.id, p.id); }
    for (const k of p.kin ?? []) if (byId.has(k.id)) { link(p.id, k.id); link(k.id, p.id); }
  }
  const relativeNames = (p: Person): string[] => {
    const out = new Set<string>();
    const ps = parentsOf(p);
    const kids = childrenOf.get(p.id) ?? [];
    for (const x of [...ps, ...kids, ...(around.get(p.id) ?? [])]) out.add(x);
    for (const x of ps) {
      for (const s of childrenOf.get(x) ?? []) out.add(s);
      for (const gp of parentsOf(byId.get(x)!)) out.add(gp);
    }
    for (const x of kids) for (const gc of childrenOf.get(x) ?? []) out.add(gc);
    out.delete(p.id);
    return [...out].flatMap((x) => ownNames(byId.get(x)!));
  };

  const books = new Map<string, Record<string, number>>();
  const mentions = new Map<string, Mentions>();
  const verses = new Map<string, Set<string>>();
  let restricted = 0;
  for (const p of persons) {
    if (p.unnamed) {
      books.set(p.id, {});
      verses.set(p.id, new Set());
      continue;
    }
    const rivals = namesakes(p);
    const restrict = (p.kind ?? 'person') !== 'person' || rivals.length > 0 || eponym(p);
    if (restrict) restricted++;
    const cited = citedBy(p);
    // правило 1: глава, которую цитирует и тёзка (Лк 3 — четыре Иосифа), — только стихи, на которые ссылается эта карточка
    const rivalChapters = new Set(rivals.flatMap((r) => [...citedBy(byId.get(r)!).chapters]));
    const inChapters = (v: string) => {
      const ch = v.slice(0, v.indexOf(':'));
      return cited.chapters.has(ch) && (!rivalChapters.has(ch) || cited.verses.has(v));
    };
    // правило 2: стихи примечаний «Не смешивать с…», на которые карточка не ссылается в других разделах
    const notThis = new Set<string>();
    for (const n of p.card?.notes ?? []) {
      if (n.kind !== 'identification' || !NOT_THIS.test(n.text)) continue;
      for (const r of n.refs ?? [])
        for (const v of parseRef(r, bible.chapterLength)?.verses ?? []) {
          const k = verseId(v);
          if (!cited.verses.has(k)) notThis.add(k);
        }
    }
    // правило 4: стих в чужой книге — только если рядом названа родня (имена родни — по требованию)
    const bookRule = !restrict && p.prominence <= BOOK_RULE_MAX_PROMINENCE;
    let kinNames: string[] | null = null;
    const withKin = (v: string) => {
      kinNames ??= relativeNames(p);
      return kinNames.length > 0 && namesIn(bible.verses.get(v) ?? '', kinNames);
    };
    const out = new Set<string>();
    for (const w of formsOf(p.name)) {
      const place = !restrict && placeForms.has(w);
      for (const v of wordVerses.get(w)!) {
        if (notThis.has(v)) continue;
        if (restrict) {
          if (inChapters(v)) out.add(v);
          continue;
        }
        if (place && !cited.verses.has(v) && !cited.whole.has(v.slice(0, v.indexOf(':')))) continue; // правило 3
        if (bookRule && !cited.books.has(v.slice(0, v.indexOf(' '))) && !withKin(v)) continue; // правило 4
        out.add(v);
      }
    }
    // иные имена, но не титулы и прозвания: «Дева» (Ис 7:14) и «Благодатная» — не имя Марии
    for (const a of p.card?.altNames ?? []) {
      if (a.kind === 'title' || a.kind === 'epithet') continue;
      for (const w of formsOf(a.name)) for (const v of wordVerses.get(w)!) if (inChapters(v) && !notThis.has(v)) out.add(v);
    }
    const counts: Record<string, number> = {};
    for (const v of out) {
      const book = v.slice(0, v.indexOf(' '));
      counts[book] = (counts[book] ?? 0) + 1;
    }
    books.set(p.id, counts);
    verses.set(p.id, out);
    if (out.size) mentions.set(p.id, { n: out.size, scope: restrict ? 'chapters' : 'bible' });
  }
  return { books, mentions, verses, restricted };
}
