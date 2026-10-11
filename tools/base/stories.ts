/**
 * Истории (документ 11 § 11; 02 § 3.12; В-21, В-30): загрузка из data/stories/ и проверки валидатора 11 § 11.3.
 *
 * Источник — файлы data/stories/*.json, которые пишет составитель историй по протоколу 11 § 12 (И0 → П7 → И3). Каждый
 * файл: `{ chapters, stories, classes, parallels }`:
 *   - `chapters` — главы, размеченные целиком (И3): каждый их стих — в рассказе истории или в классе «вне историй»;
 *   - `stories` — истории и повествования (`Story`);
 *   - `classes` — классы стихов «вне историй» (`VerseClass`);
 *   - `parallels` — параллельные тексты вне историй (`TextParallel`).
 * Перенос (migrate.ts) кладёт их в base/stories.json, base/verse-classes.json, base/text-parallels.json,
 * base/story-chapters.json; руками base/ не правится.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible } from '../bible.ts';
import { parseRef, verseId, BOOK_INDEX } from '../../src/engine/books.ts';
import { norm, nameMatcher } from '../../src/engine/text.ts';
import { scriptureText } from './brackets.ts';
import type { Base } from './migrate.ts';
import type { Story, StoryKind, TextParallel, VerseClass, HardTopic, LinkKind } from './types.ts';

const ROOT = join(import.meta.dirname, '..', '..');
export const STORY_DIR = join(ROOT, 'data', 'stories');

export interface StorySources {
  chapters: string[];
  stories: Story[];
  classes: VerseClass[];
  parallels: TextParallel[];
  /** Файл каждой истории (для сообщений). */
  fileOf: Record<string, string>;
}

/** Файлы data/stories/*.json по порядку имён; нет папки — пусто. */
export function loadStorySources(dir = STORY_DIR): StorySources {
  const out: StorySources = { chapters: [], stories: [], classes: [], parallels: [], fileOf: {} };
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    out.chapters.push(...(j.chapters ?? []));
    for (const s of j.stories ?? []) {
      out.stories.push(s);
      out.fileOf[s.id] = f;
    }
    out.classes.push(...(j.classes ?? []));
    out.parallels.push(...(j.parallels ?? []));
  }
  return out;
}

/** Кладёт истории в базу (после шагов правки: истории — новая коллекция, прежних данных у неё нет). */
export function attachStories(base: Base, src = loadStorySources()) {
  base.stories = src.stories;
  base.verseClasses = src.classes;
  base.textParallels = src.parallels;
  base.storyChapters = src.chapters;
}

// ---------- стихи ----------

const bible = () => loadBible();

/** Стихи ссылки (`Быт 6:9-9:17`) или null, если ссылка неверна. */
export function refVerses(ref: string): string[] | null {
  const p = parseRef(ref, bible().chapterLength);
  if (!p || p.chapterOnly) return null;
  const ids = p.verses.map(verseId);
  return ids.every((id) => bible().verses.has(id)) ? ids : null;
}

const versesOf = (refs: string[]) => refs.flatMap((r) => refVerses(r) ?? []);

/** Стихи рассказов истории (без пересказов и упоминаний). */
export function storyVerses(s: Story): string[] {
  return versesOf(s.accounts.flatMap((a) => a.refs));
}

/** Текст стиха вне скобок (02 § 3.8; brackets.tsv). */
const mainText = (id: string) => {
  const m = /^(.+) (\d+):(\d+)$/.exec(id)!;
  return scriptureText(m[1], +m[2], +m[3]) ?? '';
};
const clean = (t: string) => ` ${norm(t).replace(/[«»"„“”'’`.,;:!?()\[\]\-–—…]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const wordsOf = (t: string) => clean(t).trim().split(' ').filter(Boolean);

/** Служебные слова: в названии их не ищут. */
export const STOP = new Set(['и', 'в', 'во', 'на', 'с', 'со', 'у', 'к', 'ко', 'о', 'об', 'из', 'от', 'по', 'за', 'до', 'для', 'без', 'через', 'при', 'над', 'под', 'не', 'ни', 'а', 'но', 'его', 'ее', 'их', 'он', 'она', 'они', 'это', 'как', 'что', 'кто', 'же', 'ли']);

/** Основа слова: у длинных — без двух последних букв, у четырёхбуквенных — без одной. */
export function stem(w: string): string {
  const x = norm(w);
  return x.length >= 6 ? x.slice(0, -2) : x.length >= 4 ? x.slice(0, -1) : x;
}

/** Слово (по основе) или оборот (подряд) стоит в тексте вне скобок. Имя с прописной — по правилу имён базы. */
export function wordIn(word: string, text: string): boolean {
  const t = clean(text);
  const w = clean(word).trim();
  if (!w) return true;
  if (w.includes(' ')) return t.includes(` ${w} `) || t.includes(` ${w}`);
  if (/^[А-ЯЁ]/.test(word.trim())) {
    if (nameMatcher(word).test(t)) return true;
  }
  if (w.length <= 3) {
    if (t.includes(` ${w} `)) return true;
    // короткое слово с окончанием: «раю» — «рай», «рая» (основа из двух букв и окончание)
    if (w.length === 3 && /[аяйьоеиыую]$/.test(w)) return new RegExp(` ${w.slice(0, 2)}(й|я|ю|е|и|а|у|ы|о|ем|ом|ей|ой|ею|ою) `).test(t);
    return false;
  }
  return t.includes(` ${stem(w)}`);
}

// ---------- проверки 11 § 11.3 ----------

type Err = (check: string, where: string, msg: string) => void;

const LEVELS = new Set(['cycle', 'story']);
const KINDS = new Set<StoryKind>(['event', 'speech', 'parable', 'jesus-story', 'told-story', 'vision', 'dream', 'sign-act', 'song', 'prayer', 'genealogy', 'summary', 'notice']);
const ROLES = new Set(['acts', 'speaks', 'addressed', 'suffers', 'mentioned']);
const PLACE_ROLES = new Set(['where', 'from', 'to', 'via', 'mentioned']);
const CERTS = new Set(['scripture', 'inference', 'interpretation', 'calc', 'reference']);
const LINK_KINDS = new Set<LinkKind>(['retelling', 'mention', 'allusion', 'possibly-same', 'type']);
export const HARD_TOPICS = new Set<HardTopic>(['смерть на глазах', 'убийство', 'казнь', 'гибель детей', 'угроза жизни ребёнка', 'насилие над женщиной', 'блуд', 'нагота', 'самоубийство', 'вызывание умершего', 'страшные образы видения']);
const CLASSES = new Set(['law', 'list', 'teaching', 'prophecy', 'psalm', 'wisdom', 'intro']);
const BAD_LABEL = /согласуется|на самом деле|ошибк/i;
/** Порог длины части для совместного чтения (11 § 2.2, правило 9): 500 слов. */
export const PART_WORDS = 500;

const bookOf = (ref: string) => parseRef(ref, bible().chapterLength)?.book;
const chapterKey = (id: string) => id.replace(/:\d+$/, '');

/** Покрытие размеченных глав: стихов всего, в историях, в классах, без класса. */
export interface ChapterCoverage { chapter: string; verses: number; inStories: number; inClasses: number; missing: string[] }

export function storyCoverage(base: Base): ChapterCoverage[] {
  const inStory = new Set<string>();
  for (const s of base.stories ?? []) for (const v of storyVerses(s)) inStory.add(v);
  const inClass = new Set<string>();
  for (const c of base.verseClasses ?? []) for (let v = c.from; v <= c.to; v++) inClass.add(`${c.book} ${c.ch}:${v}`);
  return (base.storyChapters ?? []).map((ch) => {
    const m = /^(.+) (\d+)$/.exec(ch);
    const n = m ? bible().chapterLength(m[1], +m[2]) : 0;
    const ids = Array.from({ length: n }, (_, i) => `${ch}:${i + 1}`);
    return { chapter: ch, verses: n, inStories: ids.filter((v) => inStory.has(v)).length, inClasses: ids.filter((v) => inClass.has(v)).length, missing: ids.filter((v) => !inStory.has(v) && !inClass.has(v)) };
  });
}

export function validateStories(base: Base, err: Err, warn: Err) {
  const stories = base.stories ?? [];
  const byId = new Map<string, Story>();
  const actorIds = new Map<string, string[]>();
  for (const v of base.volumes) for (const a of v.actors) actorIds.set(a.id, a.names.map((n) => n.form));
  const checkRef = (where: string, r: unknown): string[] => {
    if (typeof r !== 'string') {
      err('история: стих', where, `ссылка не строка: ${JSON.stringify(r)}`);
      return [];
    }
    if (/[–—]/.test(r)) err('история: стих', where, `ссылка «${r}» с тире: диапазон пишется дефисом`);
    const vs = refVerses(r);
    if (!vs) err('история: стих', where, `неверная ссылка «${r}» (66 книг, синодальная нумерация, «1Цар 17:1-58»)`);
    return vs ?? [];
  };
  const textOf = (vs: string[]) => vs.map(mainText).join(' ');

  // номера и уровни
  for (const s of stories) {
    const w = s.id ?? '<без номера>';
    if (!/^e-[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id ?? '')) err('история: номер', w, 'номер истории — вида e-<латиница через дефис> (02 § 3.3)');
    if (byId.has(s.id)) err('история: номер', w, 'номер повторяется');
    byId.set(s.id, s);
  }
  const titles = new Map<string, string>();
  const verseOwner = new Map<string, string[]>();
  const allowedOverlap = new Set<string>();
  for (const s of stories) for (const n of s.nested ?? []) {
    allowedOverlap.add(`${s.id}|${n.story}`);
    allowedOverlap.add(`${n.story}|${s.id}`);
  }

  for (const s of stories) {
    const w = s.id;
    if (!LEVELS.has(s.level)) err('история: уровень', w, `уровень «${s.level}» — cycle или story (часть — поле, В-21)`);
    if (!KINDS.has(s.kind)) err('история: вид', w, `вид «${s.kind}» не из словаря 11 § 2.3`);
    if (s.partOf) {
      const p = byId.get(s.partOf);
      if (!p) err('история: вложенность', w, `повествование ${s.partOf} не найдено`);
      else if (p.level !== 'cycle') err('история: вложенность', w, `${s.partOf} — не повествование: вложенность две ступени (02 § 3.2)`);
    }
    if (s.source?.method !== 'reading') err('история: источник', w, 'source.method — reading: история составлена чтением стихов');

    // рассказы
    const accVerses = s.accounts.map((a, i) => {
      const vs = (a.refs ?? []).flatMap((r) => checkRef(`${w} рассказ ${i}`, r));
      if (!a.refs?.length) err('история: рассказ', w, `у рассказа ${i} нет стихов`);
      const books = new Set((a.refs ?? []).map(bookOf));
      if (books.size > 1) err('история: рассказ', w, `рассказ ${i} — в нескольких книгах (${[...books].join(', ')}): рассказ — одна книга`);
      if (!CERTS.has(a.cert)) err('история: уровень', w, `рассказ ${i}: уровень «${a.cert}»`);
      return vs;
    });
    const verses = accVerses.flat();
    if (s.level === 'cycle') {
      if (s.accounts.length) err('история: вложенность', w, 'у повествования нет своих стихов (11 § 2.1)');
    } else if (!s.accounts.length) {
      const told = s.links.some((l) => l.kind === 'retelling' && l.teller);
      if (!told) err('история: рассказ', w, 'у истории нет рассказа: ≥ 1, или событие известно только из слов лица (пересказ с teller, 11 § 4.3)');
    }
    // 5а: тождество рассказов (11 § 2.6)
    const main = s.accounts[0];
    s.accounts.forEach((a, i) => {
      if (i === 0) return;
      const b0 = bookOf(main.refs[0]);
      const bi = bookOf(a.refs[0]);
      if (!a.basis) err('история: тождество', w, `рассказ ${i} (${a.refs[0]}) склеен без основания basis (11 § 2.6)`);
      else {
        if (!['single-event', 'other-books', 'said'].includes(a.basis.kind)) err('история: тождество', w, `рассказ ${i}: основание «${a.basis.kind}»`);
        if (!a.basis.refs?.length) err('история: тождество', w, `рассказ ${i}: у основания нет стихов`);
        for (const r of a.basis.refs ?? []) checkRef(`${w} основание ${i}`, r);
        if (a.basis.kind === 'other-books' && !Array.isArray(a.basis.time)) err('история: тождество', w, `рассказ ${i}: у склейки other-books нет поля time (слова времени или пусто)`);
        for (const r of a.basis.time ?? []) checkRef(`${w} время ${i}`, r);
      }
      const sameBook = s.accounts.some((x, j) => j !== i && bookOf(x.refs[0]) === bi);
      if (sameBook && a.basis?.kind !== 'said') err('история: тождество', w, `два рассказа одной книги (${bi}) склеены без «сказано»: двойные рассказы одной книги — две истории (11 § 2.6)`);
      if (a.basis?.kind === 'other-books' && bi === b0) err('история: тождество', w, `склейка other-books внутри одной книги (${bi})`);
    });
    // стихи двух историй одной книги не пересекаются (п. 3)
    for (const v of new Set(verses)) {
      for (const o of verseOwner.get(v) ?? []) if (o !== s.id && !allowedOverlap.has(`${o}|${s.id}`)) err('история: пересечение', w, `стих ${v} уже в истории ${o}; вставка — только через nested`);
      verseOwner.set(v, [...(verseOwner.get(v) ?? []), s.id]);
    }
    // у повествования своих стихов нет: граница и прочее — в стихах его историй
    const vset = new Set(s.level === 'cycle' ? stories.filter((x) => x.partOf === s.id).flatMap(storyVerses) : s.accounts.length ? verses : versesOf(s.links.flatMap((l) => l.refs)));
    const inStory = (where: string, r: string) => {
      for (const v of checkRef(where, r)) if (!vset.has(v)) return err('история: вложенность', where, `стих ${v} — вне рассказов истории`);
    };

    // части (правило 9)
    if (s.parts?.length) {
      if (vset.size <= 20) warn('история: часть', w, `части у истории из ${vset.size} стихов: часть выделяется, только если история длиннее 20 стихов`);
      const covered = new Map<string, number>();
      s.parts.forEach((p, i) => {
        if (p.n !== i + 1) err('история: часть', w, `часть ${i + 1}: номер ${p.n}`);
        if (p.title?.by !== 'atlas' || !p.title.short) err('история: часть', w, `часть ${p.n}: нет названия атласа`);
        if (p.title?.short && p.title.short.length > 40) warn('история: часть', w, `название части ${p.n} длиннее 40 знаков`);
        if (i > 0 && !p.change?.length) err('история: часть', w, `часть ${p.n}: не названо, какой признак сцены сменился (место, лица, время)`);
        const pv = p.refs.flatMap((r) => checkRef(`${w} часть ${p.n}`, r));
        for (const v of pv) {
          if (!vset.has(v)) err('история: часть', w, `часть ${p.n}: стих ${v} вне рассказов`);
          covered.set(v, (covered.get(v) ?? 0) + 1);
        }
        const words = wordsOf(textOf(pv)).length;
        if (words > PART_WORDS) warn('история: часть', w, `часть ${p.n} — ${words} слов, больше ${PART_WORDS}: делит ближайшая смена признака (правило 9)`);
      });
      for (const v of vset) if (covered.get(v) !== 1) err('история: часть', w, `стих ${v} — в ${covered.get(v) ?? 0} частях (нужно ровно в одной)`);
    } else if (vset.size > 20 && s.accounts.length === 1 && s.kind !== 'genealogy') warn('история: часть', w, `история из ${vset.size} стихов без частей (правило 9)`);

    // название (п. 9)
    const t = s.title;
    if (!t || t.by !== 'atlas' || !t.short) err('история: название', w, 'нет простого названия атласа (by: atlas)');
    else {
      if (t.short.length > 40) err('история: название', w, `«${t.short}» длиннее 40 знаков`);
      if (/:/.test(t.short)) err('история: название', w, `«${t.short}» с двоеточием`);
      if (t.full && t.full.length > 80) err('история: название', w, `полное название длиннее 80 знаков`);
      const k = norm(t.short);
      if (titles.has(k)) err('история: название', w, `«${t.short}» уже у ${titles.get(k)}: название уникально во всём каталоге`);
      titles.set(k, s.id);
    }

    // участники (п. 5)
    for (const a of s.actors ?? []) {
      const aw = `${w} участник ${a.actor}`;
      if (!ROLES.has(a.role)) err('история: участник', aw, `роль «${a.role}»`);
      if (!CERTS.has(a.cert)) err('история: участник', aw, `уровень «${a.cert}»`);
      if (!a.refs?.length) err('история: участник', aw, 'нет стихов');
      const av = (a.refs ?? []).flatMap((r) => checkRef(aw, r));
      // имя только местоимением в стихах истории — проверка по стиху `antecedent`, где имя названо раньше
      const txt = textOf(a.antecedent ? [...av, ...checkRef(aw, a.antecedent)] : av);
      const named = a.role === 'mentioned' || a.mode === 'in-speech';
      if (a.actor.startsWith('p-')) {
        const names = actorIds.get(a.actor);
        if (!names) err('история: участник', aw, 'лица нет в базе');
        else if (a.label) {
          // лицо базы названо в истории описательным словом («Матерь Иисуса», «теща»): проверяется это слово
          const head = a.label.split(/\s+/).find((x) => !STOP.has(norm(x)))!;
          if (!named && !wordIn(head, txt)) err('история: участник', aw, `слово «${head}» не стоит в его стихах вне скобок`);
        } else if (!named && !names.some((n) => wordIn(n, txt) || nameMatcher(n).test(clean(txt)))) err('история: участник', aw, `ни одна форма имени (${names.slice(0, 3).join(', ')}) не стоит в его стихах вне скобок`);
      } else if (a.actor === 'god' || a.actor.startsWith('new:')) {
        if (!a.label) err('история: участник', aw, 'у лица вне базы нет label — слов стиха');
        else {
          const head = a.label.split(/\s+/).find((x) => !STOP.has(norm(x)))!;
          if (!named && !wordIn(head, txt)) err('история: участник', aw, `слово «${head}» не стоит в его стихах вне скобок (02 § 3.8)`);
        }
        if (a.actor.startsWith('new:') && !a.kind) warn('история: участник', aw, 'у лица вне базы не указан вид (human, unnamed, group, animal…)');
      } else err('история: участник', aw, 'участник — p-…, god или new:<слово>');
      if (a.account !== undefined && !s.accounts[a.account]) err('история: участник', aw, `рассказа ${a.account} нет`);
      for (const v of av) if (!vset.has(v) && !s.links.some((l) => versesOf(l.refs).includes(v))) warn('история: участник', aw, `стих ${v} вне рассказов и ссылок истории`);
      if (a.roleText) {
        const rt = textOf(a.roleText.refs.flatMap((r) => checkRef(aw, r)));
        if (!clean(rt).includes(clean(a.roleText.text))) err('история: участник', aw, `цитата роли «${a.roleText.text}» не стоит в стихе вне скобок`);
      }
    }
    for (const p of s.places ?? []) {
      const pw = `${w} место ${p.place}`;
      if (!PLACE_ROLES.has(p.role)) err('история: место', pw, `роль «${p.role}»`);
      const pv = (p.refs ?? []).flatMap((r) => checkRef(pw, r));
      if (!p.label) err('история: место', pw, 'нет label — слов стиха');
      else {
        const head = p.label.split(/\s+/).find((x) => !STOP.has(norm(x)))!;
        if (p.role !== 'mentioned' && !wordIn(head, textOf(pv))) err('история: место', pw, `слово «${head}» не стоит в его стихах вне скобок`);
      }
      if (!p.place.startsWith('l-') && !p.place.startsWith('new:')) err('история: место', pw, 'место — l-… или new:<слово>');
    }

    // ссылки (п. 6, 7)
    s.links.forEach((l, i) => {
      const lw = `${w} ссылка ${i} (${l.refs?.[0]})`;
      if (!LINK_KINDS.has(l.kind)) err('история: ссылка', lw, `вид «${l.kind}»`);
      if (!CERTS.has(l.cert)) err('история: ссылка', lw, `уровень «${l.cert}»`);
      const lv = (l.refs ?? []).flatMap((r) => checkRef(lw, r));
      for (const v of lv) if (verses.includes(v)) err('история: ссылка', lw, `стих ${v} — в рассказе этой же истории`);
      if (l.kind === 'mention' || l.kind === 'retelling') {
        if (!l.words?.length) err('история: ссылка', lw, 'у упоминания и пересказа нет words — слов стиха (иначе allusion или possibly-same)');
        for (const x of l.words ?? []) if (!wordIn(x, textOf(lv))) err('история: ссылка', lw, `слово «${x}» не стоит в стихе ссылки вне скобок`);
        if ((l.targets?.length ?? 0) > 1 && l.cert !== 'interpretation') err('история: ссылка', lw, 'упоминание с несколькими целями — выбор цели «толк.»');
      }
      if (l.kind === 'allusion') {
        if (!l.basis?.length) err('история: ссылка', lw, 'у намёка нет basis — стиха истории со словами пары');
        if (l.cert === 'scripture') err('история: ссылка', lw, 'намёк — не «Писание» (вывод с основанием)');
      }
      if (l.kind === 'possibly-same' || l.kind === 'type') {
        if (l.cert !== 'interpretation' || !l.works?.length) err('история: ссылка', lw, 'спорное сравнение — только «толк.» с трудами совета источников (Г-3; В-30)');
        if (l.story && !byId.has(l.story)) err('история: ссылка', lw, `истории ${l.story} нет`);
      }
      if (l.teller && !l.teller.startsWith('p-') && !l.teller.startsWith('new:')) err('история: ссылка', lw, 'кто рассказывает — p-… или new:');
      if (l.teller?.startsWith('p-') && !actorIds.has(l.teller)) err('история: ссылка', lw, `лица ${l.teller} нет в базе`);
      if (l.inStory) {
        const host = byId.get(l.inStory);
        if (!host) err('история: ссылка', lw, `истории речи ${l.inStory} нет`);
        else if (!lv.every((v) => storyVerses(host).includes(v))) err('история: ссылка', lw, `стихи пересказа — не в истории речи ${l.inStory}`);
      }
      if (l.kind === 'retelling' && l.teller && !l.inStory) warn('история: ссылка', lw, 'пересказ лица без inStory — истории речи');
    });
    for (const r of s.relations ?? []) {
      if (!byId.has(r.story)) err('история: связь', w, `истории ${r.story} нет`);
      if (!r.refs?.length) err('история: связь', w, '«другая история — так сказано» без стиха');
      for (const x of r.refs ?? []) checkRef(`${w} связь`, x);
    }
    for (const n of s.nested ?? []) {
      if (!byId.has(n.story)) err('история: вложенность', w, `вложенной истории ${n.story} нет`);
      checkRef(`${w} вложение`, n.at);
    }
    for (const b of s.boundary ?? []) {
      if (![1, 2, 3, 4, 5, 6, 7, 8].includes(b.rule)) err('история: граница', w, `правило ${b.rule} — из 11 § 2.2 (1–8)`);
      inStory(`${w} граница`, b.start);
      if (b.end) inStory(`${w} граница`, b.end);
    }
    for (const h of s.hard ?? []) {
      if (!HARD_TOPICS.has(h.topic)) err('история: трудное', w, `тема «${h.topic}» не из 11 § 8.3 п. 2`);
      if (!h.refs?.length) err('история: трудное', w, 'тема без стиха');
      for (const r of h.refs ?? []) inStory(`${w} трудное`, r);
    }
    for (const x of s.time?.after ?? []) if (!x.refs?.length) err('история: время', w, '«раньше / позже» без стиха основания (п. 13)');
    for (const x of s.seeAlso ?? []) {
      for (const r of x.refs) checkRef(`${w} назван ещё`, r);
      if (x.story && !byId.has(x.story)) err('история: назван ещё', w, `истории ${x.story} нет`);
    }

    // «Коротко, нашими словами» (п. 19)
    if (s.summary) {
      if (s.summary.length > 4) err('история: коротко', w, `предложений ${s.summary.length}, больше 4`);
      for (const x of s.summary) {
        if (x.text.includes(';')) err('история: коротко', w, `«${x.text}» — с «;»`);
        const n = x.text.split(/\s+/).filter((z) => /[а-яёА-ЯЁ0-9]/.test(z)).length;
        if (n > 12) err('история: коротко', w, `«${x.text}» — ${n} слов, больше 12`);
        if (!x.refs?.length) err('история: коротко', w, `«${x.text}» — без стиха`);
        for (const r of x.refs) inStory(`${w} коротко`, r);
      }
    }

    // различия (п. 20)
    for (const d of s.discrepancies ?? []) {
      if (BAD_LABEL.test(d.label)) err('история: различия', w, `подпись «${d.label}» — со словами согласования`);
      if ((d.quotes?.length ?? 0) < 2) err('история: различия', w, `«${d.label}»: меньше двух цитат`);
      const src = new Set<string>();
      for (const q of d.quotes ?? []) {
        const qv = checkRef(`${w} различия`, q.ref);
        if (!clean(textOf(qv)).includes(clean(q.text))) err('история: различия', w, `«${q.text}» не стоит дословно в ${q.ref} вне скобок`);
        const acc = s.accounts.findIndex((a) => versesOf(a.refs).some((v) => qv.includes(v)));
        const lnk = s.links.findIndex((l) => versesOf(l.refs).some((v) => qv.includes(v)));
        src.add(acc >= 0 ? `a${acc}` : lnk >= 0 ? `l${lnk}` : `?${q.ref}`);
      }
      if (src.size < 2 && (d.quotes?.length ?? 0) >= 2) err('история: различия', w, `«${d.label}»: цитаты из одного рассказа`);
    }

    // синопсис (п. 15)
    const columns = s.accounts.length + s.links.filter((l) => l.kind === 'retelling' && l.teller).length;
    if (s.accounts.length >= 2 && !s.scenes?.length) err('история: синопсис', w, `рассказов ${s.accounts.length}, а сцен синопсиса нет`);
    if (s.scenes?.length) {
      const split = new Set(s.scenes.flatMap((sc) => (sc.split ?? []).flatMap((r) => refVerses(r) ?? [])));
      const count = new Map<string, number>();
      s.scenes.forEach((sc, i) => {
        const sw = `${w} сцена ${sc.id}`;
        if (sc.id !== `${s.id}#s${i + 1}`) err('история: синопсис', sw, `номер сцены — ${s.id}#s${i + 1}`);
        if (!sc.title?.short || sc.title.by !== 'atlas') err('история: синопсис', sw, 'нет подписи сцены атласа');
        for (const c of sc.refs) {
          const cv = c.refs.flatMap((r) => checkRef(sw, r));
          if (c.account !== undefined) {
            if (!s.accounts[c.account]) err('история: синопсис', sw, `рассказа ${c.account} нет`);
            else {
              const av = new Set(accVerses[c.account]);
              for (const v of cv) if (!av.has(v)) err('история: синопсис', sw, `стих ${v} не из рассказа ${c.account}`);
            }
            for (const v of cv) count.set(v, (count.get(v) ?? 0) + 1);
          } else if (c.link !== undefined) {
            const l = s.links[c.link];
            if (!l || l.kind !== 'retelling') err('история: синопсис', sw, `столбец-пересказ: ссылка ${c.link} — не пересказ этой истории`);
          } else err('история: синопсис', sw, 'клетка без account и без link');
          if (cv.length > 3) warn('история: синопсис', sw, `в клетке ${cv.length} стихов, больше 3 (подсцены — до П7)`);
        }
      });
      for (const [i, vs] of accVerses.entries()) for (const v of vs) {
        const n = count.get(v) ?? 0;
        if (n === 0) err('история: синопсис', w, `стих ${v} рассказа ${i} не стоит ни в одной сцене`);
        else if (n > 1 && !split.has(v)) err('история: синопсис', w, `стих ${v} — в ${n} сценах без split`);
        else if (n > 2) err('история: синопсис', w, `стих ${v} — в ${n} сценах (split — в двух соседних)`);
      }
    } else if (columns >= 2 && s.accounts.length < 2) warn('история: синопсис', w, 'рассказ и пересказы без сцен синопсиса');
  }

  // классы «вне историй» и покрытие (п. 4)
  const classed = new Map<string, string>();
  const storyVerse = new Map<string, string>();
  for (const s of stories) for (const v of storyVerses(s)) storyVerse.set(v, s.id);
  for (const c of base.verseClasses ?? []) {
    const cw = `${c.book} ${c.ch}:${c.from}-${c.to}`;
    if (!CLASSES.has(c.class)) err('класс стихов', cw, `класс «${c.class}» не из 11 § 2.4`);
    const n = bible().chapterLength(c.book, c.ch);
    if (!n || c.from < 1 || c.to > n || c.to < c.from) err('класс стихов', cw, 'нет таких стихов');
    for (let v = c.from; v <= c.to; v++) {
      const id = `${c.book} ${c.ch}:${v}`;
      if (classed.has(id)) err('класс стихов', cw, `стих ${id} уже в классе ${classed.get(id)}`);
      if (storyVerse.has(id)) err('класс стихов', cw, `стих ${id} — в истории ${storyVerse.get(id)}`);
      classed.set(id, c.class);
    }
  }
  for (const c of storyCoverage(base)) {
    if (!c.verses) err('покрытие', c.chapter, 'нет такой главы');
    if (c.missing.length) err('покрытие', c.chapter, `глава объявлена размеченной, а без класса ${c.missing.length} стихов: ${c.missing.slice(0, 5).join(', ')}`);
  }

  // параллельные тексты (п. 21)
  const tps = new Set<string>();
  for (const p of base.textParallels ?? []) {
    if (!/^tp-[a-z0-9-]+$/.test(p.id)) err('параллельные тексты', p.id, 'номер — tp-…');
    if (tps.has(p.id)) err('параллельные тексты', p.id, 'номер повторяется');
    tps.add(p.id);
    if ((p.refs?.length ?? 0) < 2) err('параллельные тексты', p.id, 'меньше двух отрезков');
    const segs = p.refs.map((seg) => clean(textOf(seg.flatMap((r) => checkRef(p.id, r)))));
    for (const b of p.basis) for (const [i, t] of segs.entries()) if (!t.includes(clean(b.text))) err('параллельные тексты', p.id, `«${b.text}» не стоит в отрезке ${i + 1} вне скобок`);
  }

  // название: значимые слова — в стихах истории (п. 9); у повествования — в стихах его историй
  for (const s of stories) {
    if (!s.title?.short) continue;
    // у повествования — стихи его историй; у события, известного только из слов лица, — стихи пересказа
    const own = s.level === 'cycle' ? stories.filter((x) => x.partOf === s.id).flatMap(storyVerses) : s.accounts.length ? storyVerses(s) : versesOf(s.links.flatMap((l) => l.refs));
    const txt = own.map(mainText).join(' ');
    const manual = new Set((s.title.manual ?? []).map((x) => norm(x)));
    for (const word of s.title.short.split(/[\s,—–-]+/).filter(Boolean)) {
      const x = norm(word).replace(/[^а-я]/g, '');
      if (!x || STOP.has(x) || manual.has(x)) continue;
      if (!wordIn(word.replace(/[^А-Яа-яЁё]/g, ''), txt)) err('история: название', s.id, `слово «${word}» названия не стоит в стихах истории вне скобок (или пометка «ручная проверка» в title.manual)`);
    }
    for (const m of s.title.manual ?? []) if (!s.title.short.toLowerCase().includes(m.toLowerCase())) warn('история: название', s.id, `в manual слово «${m}», которого нет в названии`);
  }
}

/** Сводка для отчёта: истории, повествования, части, рассказы, сцены, по видам. */
export function storyStats(base: Base) {
  const ss = base.stories ?? [];
  const stories = ss.filter((s) => s.level === 'story');
  const byKind: Record<string, number> = {};
  for (const s of stories) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  return {
    stories: stories.length,
    cycles: ss.filter((s) => s.level === 'cycle').length,
    parts: stories.reduce((n, s) => n + (s.parts?.length ?? 0), 0),
    accounts: stories.reduce((n, s) => n + s.accounts.length, 0),
    multi: stories.filter((s) => s.accounts.length >= 2).length,
    scenes: stories.reduce((n, s) => n + (s.scenes?.length ?? 0), 0),
    links: stories.reduce((n, s) => n + s.links.length, 0),
    hard: stories.filter((s) => s.hard?.length).length,
    byKind,
    classes: (base.verseClasses ?? []).length,
    parallels: (base.textParallels ?? []).length,
    chapters: (base.storyChapters ?? []).length,
    books: [...new Set(stories.flatMap((s) => s.accounts.map((a) => bookOf(a.refs[0])!)))].sort((a, b) => BOOK_INDEX.get(a)! - BOOK_INDEX.get(b)!),
    verses: new Set(stories.flatMap(storyVerses)).size,
  };
}

export { chapterKey };
