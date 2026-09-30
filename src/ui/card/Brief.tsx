/**
 * «Кратко» (F3; CARD-35; решение владельца 11): абзац в 2–3 строки под шапкой отвечает на вопрос «кто это».
 *
 * Собирается автоматически из данных карточки, без новых фактов. Каждое утверждение берётся из раздела, где есть
 * ссылка на стих, или из паспорта:
 * — роль и царство — паспорт и § 16 (царствования со стихами);
 * — сын или дочь такого-то — § 6; колено, дом или народ — паспорт («Колено / народ»);
 * — жена или наложница такого-то — § 9; отец или мать значимых детей — § 10;
 * — положение — первая запись § 5, если роли нет; у малых лиц — событие § 17 со стихами;
 * — место в родословии Иисуса Христа — § 21, строго по линиям из data/lines (lineMembership).
 * Имя в косвенном падеже — только если его надёжно склоняет src/ui/text/ru.ts; иначе часть фразы опускается.
 */
import type { ComponentChildren } from 'preact';
import { byId, graph, lineMembership } from '../../data/atlas.ts';
import type { Card } from '../../data/types.ts';
import { P, Refs, VerseInsert } from '../common.tsx';
import { bySex, capFirst, lowerFirst, nameCase, pluralPeopleName, realmGenitive } from '../text/ru.ts';
import { stemsOf } from '../text/repeat.ts';
import { typoTree } from '../text/typo.ts';
import { yearsWord } from '../../engine/years.ts';
import { compareRefs } from '../../engine/books.ts';
import { affiliationFrom, roleNoun } from './shared.tsx';
import { linkCandidates, linkNames } from './links.tsx';

/** Кусок фразы: текст или имя-ссылка (form — имя в нужном падеже); refs — стихи в конце предложения. */
export type BriefSeg = string | { id: string; form: string };
export type BriefSentence = { segs: BriefSeg[]; refs?: string[]; data?: boolean };

/** Роли, которые называют лицо в первой строке, по старшинству; остальные — только если других нет. */
const HEAD_ROLES = ['messiah', 'king', 'queen', 'queen-mother', 'judge', 'prophet', 'high-priest', 'apostle', 'patriarch', 'matriarch', 'forefather', 'priest', 'foreign-ruler', 'tribal-leader', 'commander', 'prince', 'disciple', 'levite', 'scribe', 'musician', 'official', 'craftsman', 'shepherd'] as const;

/** Предел «Кратко» в знаках: около трёх строк колонки карточки (50–55 знаков); у малого лица «Кратко» — вся статья. */
export const BRIEF_MAX = 160;
export const BRIEF_MAX_SMALL = 240;

/** Вторая роль, которую стоит назвать рядом с первой: служение, а не занятие. */
const SECOND_ROLES = new Set(['king', 'queen', 'judge', 'prophet', 'high-priest', 'priest', 'apostle']);

/** Части подзаголовка, которые говорят о родстве («сын Амрама», «жена Вооза», «он же Савл»), а не о лице. */
const KIN_PART = /^(сын|дочь|жена|муж|мать|отец|брат|сестра|внук|внучка|вдова|наложница|свекровь|свёкор|тесть|тёща|зять|невестка|племянник|племянница|он же|она же|сыновья|дочери|первенец)(?![а-яё])/i;
/** Часть подзаголовка, которая продолжает предыдущую: «затем Давида», «потом Ирода четвертовластника» (CARD-77). */
const THEN_PART = /^(а\s+)?(затем|потом|позже|позднее|после)(?![а-яё])/i;
/** Основы слов родства: «сын Нахора» после «Дитя Нахора» ничего не добавляет, хотя слово «сын» новое. */
const KIN_STEMS = new Set(['дочь', 'дочи', 'жена', 'мать', 'отец', 'брат', 'сест', 'внук', 'вдов', 'нало', 'затем', 'зате', 'роди', 'прои']);
/** Начало записи, которое не может открыть «Кратко»: местоимение, предлог, ссылка. */
const FUNCTION_LEAD = /^[«"]?(через|в|во|на|при|по|с|со|у|к|о|об|от|из|за|он|она|они|его|её|ее|ему|ей|им|ими|него|неё|нее|ним|ней|нём)(?![а-яё])/i;
/** Прозвание по месту или народу в начале записи § 5: «Вифлеемлянин, Ефрафянин из Вифлеема…» — не положение лица. */
const GENTILIC = /^[А-ЯЁ][а-яё]+(янин|янка|итянин|итянка|еянин|еянка)(?![а-яё])/;

/**
 * Первая фраза «Кратко» из подзаголовка (решение 22; CARD-65): части, которые называют служение или положение
 * («пророк и законодатель», «военачальник Давида», «царь Салимский, священник Бога Всевышнего»), без частей о родстве
 * и без стихов. Пусто — подзаголовок говорит только о родстве.
 */
export function disambigHead(dis: string): string {
  const parts = dis.split(/,\s+/).map((x) => x.trim());
  return parts
    .filter((x, i) => {
      if (!x || KIN_PART.test(x) || /\d/.test(x) || /[()]/.test(x)) return false;
      // продолжение родства: «жена Урии, затем Давида», «жена Филиппа, потом Ирода» — о браке, а не о служении (CARD-77)
      if (THEN_PART.test(x)) return false;
      // приложение к родству в родительном падеже: «дочь Фалмая, царя Гессурского» — о Фалмае, не о ней
      if (i > 0 && KIN_PART.test(parts[i - 1]) && /^[а-яё]+(а|я|ого|его|ой|ей|и|ы)(?![а-яё])/.test(x)) return false;
      // одно имя с прописной («апостол, Симон, сын Ионин») — иное имя, а не служение; прозвание («Моавитянка») — служит
      if (/^[А-ЯЁ][а-яё]+$/.test(x) && !GENTILIC.test(x)) return false;
      return true;
    })
    .join(', ');
}

/** Оговорка составителя, что слово «жена» о ней в тексте не употреблено (Есфирь, § 9; жёны Давида из 1 Пар 3:9). */
const WIFE_CAVEAT = /«?жен(а|ой)»?[^.;]{0,60}не (употреблен|назван)|не назван[аы]?[^.;]{0,20}«?жен(ой|а)»?/i;

/** Первый по порядку книг стих из списка ссылок. */
export function firstRef(refs: string[]): string {
  return [...refs].sort(compareRefs)[0] ?? '';
}

/** Имя в родительном падеже; null — если склонение ненадёжно. */
function gen(id: string): BriefSeg | null {
  const q = byId.get(id);
  if (!q) return null;
  // иные формы имени из данных помогают склонению: «Далуиа» — «Далуии» (L8a)
  const f = nameCase(q.name, q.sex, 'gen', q.unnamed, q.alt);
  return f ? { id, form: f } : null;
}

/** «А и Б», «А, Б и В». */
function joinAnd(xs: BriefSeg[]): BriefSeg[] {
  const out: BriefSeg[] = [];
  xs.forEach((x, i) => {
    if (i) out.push(i === xs.length - 1 ? ' и ' : ', ');
    out.push(x);
  });
  return out;
}


/** Сколько записей составитель внёс в карточку: у малых лиц (меньше трёх) «Кратко» — вся статья (F11). */
export function authoredCount(card: Card | null): number {
  if (!card) return 0;
  const arrays = [
    card.status, card.parentsNote, card.lineage, card.birth?.facts, card.spousesNote, card.childrenNote, card.siblingsNote, card.kinNote,
    card.chronoNote, card.met, card.places, card.offices, card.events, card.sayings, card.withGod, card.death?.facts, card.death?.burial,
    card.messiahNote, card.laterMentions, card.notes, card.altNames,
  ];
  return arrays.reduce((n, a) => n + (a?.length ?? 0), 0);
}

/** Предложение о месте в родословии Иисуса Христа — строго по data/lines (lineMembership). */
export function linesSentence(id: string): string | null {
  if (id === 'iisus') return null;
  const j = lineMembership.joseph.get(id);
  const m = lineMembership.mary.get(id);
  if (!j && !m) return null;
  if (m && m.flag === 'interpretation') return 'В линии по Луке — по толкованию Лк 3:23 как родословия Марии';
  if (m && m.flag === 'luke-only' && !j) return 'В родословии Иисуса Христа — только у Луки';
  if (j && j.flag === 'omitted-by-mt' && !m) return 'В линии Иосифа, хотя у Матфея опущен';
  if (j && m) return 'В родословии Иисуса Христа по обеим линиям';
  return j ? 'В родословии Иисуса Христа по линии Иосифа' : 'В родословии Иисуса Христа по линии Луки';
}

/**
 * Часть первой фразы «Кратко»: служение, происхождение, колено, брак, дети. sep — знак перед частью
 * (у первой не ставится): «, » внутри одного утверждения, «; » между утверждениями, « » — «сын Иессея из колена Иудина».
 */
type Clause = { segs: BriefSeg[]; sep: ', ' | '; ' | ' ' };

const segText = (xs: BriefSeg[]) => xs.map((x) => (typeof x === 'string' ? x : x.form)).join('');

/** Основы значимых слов частей (имена — по форме в тексте). */
const clauseStems = (c: Clause) => stemsOf(segText(c.segs));

/** Предложения «Кратко» для лица id. card — тело карточки (для § 5 и § 17); без него — только по индексу. */
export function briefSentences(id: string, card: Card | null): BriefSentence[] {
  return buildBrief(id, card).out;
}

/**
 * Запись § 5, которую «Кратко» приводит целиком, отдельным предложением и со стихами (решение 121; UI-14): § 5 её не
 * повторяет дословно — сведения о положении живут в одном месте, в «Кратко» под шапкой. null — такой записи нет.
 */
export function briefMovedStatus(id: string, card: Card | null): string | null {
  return card?.status?.length ? buildBrief(id, card).moved : null;
}

function buildBrief(id: string, card: Card | null): { out: BriefSentence[]; moved: string | null } {
  const p = byId.get(id);
  if (!p) return { out: [], moved: null };
  const f = p.sex === 'f';
  const people = p.kind === 'people' || p.kind === 'clan';
  const out: BriefSentence[] = [];
  const first: Clause[] = [];
  /**
   * Часть добавляется, если в ней есть что-то новое (CARD-82): «Хеттеянин, сын Цохара» без второго «хеттеянин»,
   * «Дитя Нахора от Реумы» без «сын Нахора». Слова родства сами по себе новостью не считаются.
   */
  const said = () => new Set(first.flatMap(clauseStems));
  const fresh = (segs: BriefSeg[]) => {
    const s = said();
    const st = stemsOf(segText(segs)).filter((w) => !KIN_STEMS.has(w));
    return !st.length || st.some((w) => !s.has(w));
  };
  const add = (segs: BriefSeg[], sep: Clause['sep']) => {
    if (!segs.length || !fresh(segs)) return false;
    first.push({ segs, sep });
    return true;
  };

  // 1. роль (паспорт) — первая по порядку составителя: «Пророк и судья»; у царя — царства (§ 16): «Царь Иудеи, затем всего Израиля»;
  //    запись § 5, которая начинается с той же роли («Царь Салимский»), точнее одного слова и заменяет его
  const roles = p.roles.filter((r) => (HEAD_ROLES as readonly string[]).includes(r));
  const role = p.roles.includes('messiah') ? 'messiah' : (roles[0] ?? null);
  const st = card?.status?.[0];
  let statusUsed: string | null = null;
  // запись § 5, которую «Кратко» приводит целиком отдельным предложением со стихами: § 5 её не повторяет (решение 121)
  let statusMoved: string | null = null;
  let reignNote: BriefSeg[] = [];
  if (role === 'messiah' && !people) {
    // «Христос, Сын Бога Живаго» (§ 5, Мф 16:16) — не «Мессия, Христос» (одно и то же; CARD-65) и не подзаголовок
    // «Сын Божий, Сын Давидов», который стоит прямо над «Кратко» (CARD-82)
    const own = st && /^Христос(?![а-яё])/.test(st.text) && st.text.length <= 60 && !/[«»"():;]/.test(st.text) ? st.text.replace(/[.;]\s*$/, '') : null;
    if (own) statusUsed = st!.text;
    first.push({ segs: [own ?? 'Христос'], sep: ', ' });
  } else if (role && !people) {
    let head = roleNoun(id, role);
    let realm = false;
    if ((role === 'king' || role === 'queen') && p.reign.length) {
      const realms = [...new Set(p.reign.map((r) => r.over.replace(/\s*\(.*\)$/, '')))];
      const g = realms.map(realmGenitive);
      if (g.every((x) => x !== null)) {
        head += ` ${g.join(', затем ')}`;
        realm = true;
      }
      // «царствовал 40 лет» — если царствования идут одно за другим и число лет каждого дано текстом (§ 16)
      const rs = [...p.reign].sort((a, b) => a.start - b.start);
      const chain = rs.every((r, i) => r.years !== null && r.years !== undefined && r.years > 0 && (i === 0 || r.start === rs[i - 1].end));
      if (chain) reignNote = [`${bySex(p.sex, 'царствовал', 'царствовала')} ${yearsWord(rs.reduce((n, r) => n + (r.years ?? 0), 0))}`];
    }
    // подзаголовок называет служение точнее роли: «Пророк и законодатель» у Моисея, «Военачальник Давида» у Иоава
    const dh = realm ? '' : disambigHead(p.disambig ?? '');
    if (dh) head = dh;
    if (!realm && st && st.text.length <= 60 && !/[«»"():;]/.test(st.text) && st.text.toLowerCase().startsWith(head.toLowerCase())) {
      head = st.text.replace(/[.;]\s*$/, '');
      statusUsed = st.text;
    } else if (!realm && !dh) {
      // вторая роль — если она тоже служение: «Царь и священник», «Пророк и судья»
      const second = roles.slice(1).find((r) => SECOND_ROLES.has(r));
      if (second && role !== 'messiah') head += ` и ${roleNoun(id, second)}`;
    }
    first.push({ segs: [capFirst(head)], sep: ', ' });
  } else if (!people) {
    // роли нет, но подзаголовок называет положение: «Моавитянка» у Руфи
    const dh = disambigHead(p.disambig ?? '');
    if (dh) first.push({ segs: [capFirst(dh)], sep: ', ' });
  }

  // 2. положение (§ 5) — если роли нет: «Из храбрых Давида»; короткая запись, без цитаты во всю длину — отдельным предложением
  // запись § 5 целиком — со своими стихами: § 5 её не повторяет (решение 121; statusMoved)
  if (!first.length && st && st.text.length <= 120 && !/^[«"]/.test(st.text) && !GENTILIC.test(st.text)) {
    out.push({ segs: [capFirst(st.text.replace(/[.;]\s*$/, ''))], refs: st.refs, data: true });
    statusUsed = st.text;
    statusMoved = st.text;
  }
  /** Сказанное отдельными предложениями и первой фразой — для «сказано выше». */
  const saidAll = () => new Set([...out.flatMap((x) => stemsOf(segText(x.segs))), ...said()]);

  // 3. происхождение (§ 6): «сын Иессея»; у народа — «в родословии — сын Хама»; у законного отца — нет
  // родитель по толкованию (Илий у Марии) или законный (Иосиф у Иисуса Христа) в «Кратко» не называется
  const father = p.father && p.fatherKind !== 'legal' && p.parentCert !== 'interpretation' ? p.father : null;
  const mother = p.mother && p.motherCert !== 'interpretation' ? p.mother : null;
  // безымянный родитель («Мать Сисары») назван описанием через самого владельца — в «Кратко» это не сведение
  const parent = [father, mother].find((x) => x && !byId.get(x)!.unnamed) ?? null;
  const par = parent ? gen(parent) : null;
  const parentNamed = !!statusUsed && !!parent && statusUsed.includes(byId.get(parent)!.name.slice(0, Math.max(3, byId.get(parent)!.name.length - 2)));
  const messiah = role === 'messiah';
  let origin = false;
  if (par && !parentNamed) {
    // у Иисуса Христа — «родился от Марии» (Мф 1:16: «Марии, от Которой родился Иисус»): «Сын Божий, …, сын Марии» спорило бы
    // эпоним-родоначальник (Мицраим, Быт 10:6) — «в родословии — сын Хама», хотя имя на -им
    const word = messiah ? 'родился от' : people ? (/(им|[ая]не)$/.test(p.name) && !p.roles.includes('forefather') ? 'произошли от' : 'в родословии — сын') : bySex(p.sex, 'сын', 'дочь');
    origin = add([`${word} `, par], messiah ? '; ' : ', ');
  }
  // 4. колено, дом или народ (паспорт): «из колена Иудина»; у детей родоначальника — не повторять
  // «из дома Давидова» у Иисуса Христа повторило бы «Сын Давидов» подзаголовка
  const aff = people || messiah ? null : affiliationFrom(id);
  if (aff && aff.founder !== parent) add([aff.text], origin && aff.text.startsWith('из ') ? ' ' : ', ');
  if (reignNote.length) add(reignNote, '; ');
  // главное служение (§ 16) — у лиц без царства: «вождь и избавитель Израиля при Исходе…» у Моисея (CARD-65);
  // запись, которая повторяет слова первой фразы («военачальник» у Иоава), не добавляется
  // какое служение главное: самое позднее с датой начала (у Иисуса Навина — «Вождь Израиля после Моисея»), иначе — с большим
  // числом стихов (у Иосифа — «Правитель над всею землею Египетскою»); записи с цитатой и одним стихом — нет
  // у Иисуса Христа — служение с годами (Мф 4:17): «учитель и проповедник Царствия Божия» (CARD-82)
  if (!reignNote.length && !p.reign.length && first.length) {
    const head = said();
    const cands = (card?.offices ?? [])
      .map((o) => ({ ...o, t: o.title.split(/;\s*/)[0].replace(/\s*\([^()]*\)/g, '').replace(/[.]\s*$/, '') }))
      .filter((o) => o.t.length <= 70 && !/[«»"]/.test(o.t) && (o.from !== undefined || o.refs.length >= 2) && stemsOf(o.t).every((w) => !head.has(w)));
    const dated = cands.filter((o) => o.from !== undefined).sort((a, b) => b.from! - a.from!);
    const main = dated[0] ?? (messiah ? undefined : [...cands].sort((a, b) => b.refs.length - a.refs.length)[0]);
    if (main) add([lowerFirst(main.t)], '; ');
  }

  // 5. супруг (§ 9) — у женщины: «жена Махлона, затем Вооза»; «наложница Халева»
  let family = !!par;
  if (f && !people) {
    // мужья — по порядку текста (CARD-77): по первому стиху брака; «жена Урии, затем Давида» (2 Цар 11:3; 11:27)
    const hs = (graph.spousesOf.get(id) ?? []).filter((s) => s.b === id).sort((a, b) => compareRefs(firstRef(a.refs), firstRef(b.refs)));
    // термин, оговорённый в § 9 («Слово „жена“ о ней не употреблено»), в «Кратко» не употребляется (CARD-65)
    const caveat = (s: (typeof hs)[number]) => WIFE_CAVEAT.test(s.note ?? '') || (card?.spousesNote ?? []).some((f) => WIFE_CAVEAT.test(f.text));
    const named = hs
      .filter((s) => !caveat(s))
      .map((s) => ({ s, g: gen(s.a) }))
      .filter((x): x is { s: (typeof hs)[number]; g: BriefSeg } => x.g !== null);
    if (named.length && !(statusUsed && named.some((x) => statusUsed!.includes(byId.get(x.s.a)!.name.slice(0, 4))))) {
      const segs: BriefSeg[] = [];
      named.forEach((x, i) => {
        if (i === 0) segs.push(x.s.kind === 'concubine' ? 'наложница ' : 'жена ');
        else segs.push(x.s.kind === named[i - 1].s.kind ? ', затем ' : x.s.kind === 'concubine' ? ', затем наложница ' : ', затем жена ');
        segs.push(x.g);
      });
      if (add(segs, '; ')) family = true;
    }
  }

  // 6. значимые дети (§ 10): на линиях Мессии или яркие звёзды; у малого лица — все, до четырёх
  const small = authoredCount(card) < 3;
  if (!people) {
    // кровные дети; народ с именем во множественном числе («Лудим») не «сын» (Быт 10:13)
    const all = (graph.childrenOf.get(id) ?? []).filter((e) => (e.kind === 'father' || e.kind === 'mother') && !pluralPeopleName(byId.get(e.child)!.name, byId.get(e.child)!.kind));
    const plain = [...new Set(all.filter((e) => e.claim !== 'legal' && e.cert !== 'interpretation' && !byId.get(e.child)!.unnamed).map((e) => e.child))];
    const legal = [...new Set(all.filter((e) => e.claim === 'legal').map((e) => e.child))];
    const onLine = (x: string) => lineMembership.joseph.has(x) || lineMembership.mary.has(x);
    const notable = plain.filter((x) => onLine(x) || (byId.get(x)?.magnitude ?? 9) <= 1);
    // по значимости: линии Мессии, затем яркость звезды, затем порядок рождения — Соломон раньше Нафана (CARD-65)
    const weight = (x: string) => (onLine(x) ? -10 : 0) + (byId.get(x)?.magnitude ?? 6);
    const pick = (notable.length ? notable : small ? plain : [])
      .sort((a, b) => weight(a) - weight(b) || (byId.get(a)!.order ?? 99) - (byId.get(b)!.order ?? 99))
      .map(gen)
      .filter((x): x is BriefSeg => x !== null)
      .slice(0, 4);
    const addKids = (lead: string, xs: BriefSeg[]) => {
      if (add([`${lead} `, ...joinAnd(xs)], '; ')) family = true;
    };
    // дети уже названы записью § 5 («Мать Аарона, Моисея и Мариам») — второй раз не называются
    const kidsSaid = !!statusUsed && pick.some((x) => typeof x !== 'string' && statusUsed!.includes(byId.get(x.id)!.name.slice(0, Math.max(3, byId.get(x.id)!.name.length - 2))));
    if (pick.length && !kidsSaid) addKids(bySex(p.sex, 'отец', 'мать'), pick);
    // законное отцовство (Мф 1:16): «законный отец Иисуса Христа»
    const lg = legal.map(gen).filter((x): x is BriefSeg => x !== null);
    if (lg.length) addKids(bySex(p.sex, 'законный отец', 'законная мать'), lg);
  }
  const firstAt = out.length;
  if (first.length) out.push({ segs: [] });
  // о лице нет ни родства, ни семьи — первое событие жизни (§ 17) со стихами: «Царь Салимский. Вынес хлеб и вино Авраму…»
  const noFamily = !family;

  // 7. у малого лица — то, что о нём сказано (§ 17 или § 14), со стихами: это и есть вся статья (F11)
  // «Кратко» — 2–3 строки: запись из текста добавляется, если с ней абзац не длиннее BRIEF_MAX знаков
  const len = () => out.reduce((n, x) => n + segText(x.segs).length + 2, 0) + first.reduce((n, c) => n + segText(c.segs).length + 2, 0);
  const repeats = (t: string) => {
    const s = saidAll();
    return stemsOf(t).length > 0 && stemsOf(t).every((w) => s.has(w));
  };
  /**
   * Запись из данных, которая говорит то же, что часть первой фразы, и больше («Хананеянин; его дочь стала женой Иуды»
   * после «Хананеянин»; «Египтянин, царедворец фараонов…» после «Царедворец фараонов»), заменяет эту часть (CARD-82).
   */
  const absorb = (t: string) => {
    const inData = new Set(stemsOf(t));
    // слово служения или прозвание — только в начале части записи («Хананеянин; …», «Египтянин, царедворец фараонов…»),
    // а не где угодно: «подарил левитам» не говорит, что он сам левит; имя лица — где угодно
    // запись, которая начинается местоимением или предлогом («Через него — „пророческое слово…“»), первой фразой не станет
    const words = (x: string) => x.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/).filter((w) => w.length >= 3);
    const heads = t.split(/[;.]\s+/).map(words);
    const nearStart = (st0: string[]) =>
      !FUNCTION_LEAD.test(t) && heads.some((h) => st0.every((w) => h.slice(0, st0.length + 2).some((x) => x.startsWith(w))));
    // часть о родстве («сын Аминадава», «мать Иоаса») — если запись называет то же родство тем же словом рядом с именем
    // («Второй сын Самуила», «Мать царя Иоаса»), а не просто имя («из дома Аминадава»)
    const all = words(t);
    const sameKin = (c: Clause) => {
      const lead = words(segText(c.segs.filter((x) => typeof x === 'string')))[0];
      const names = c.segs.filter((x): x is { id: string; form: string } => typeof x !== 'string');
      if (!lead || !names.length) return false;
      return names.every((n, k) => {
        const stem = n.form.toLowerCase().replace(/ё/g, 'е').slice(0, 4);
        const at = all.findIndex((w) => w.startsWith(stem));
        return at >= 0 && (k > 0 || all.slice(Math.max(0, at - 3), at).some((w) => w.startsWith(lead.slice(0, 3))));
      });
    };
    for (let i = first.length - 1; i >= 0; i--) {
      const st0 = clauseStems(first[i]).filter((w) => !KIN_STEMS.has(w));
      const person = first[i].segs.some((x) => typeof x !== 'string');
      if (st0.length && st0.every((w) => inData.has(w)) && (person ? sameKin(first[i]) : nearStart(st0))) first.splice(i, 1);
    }
  };
  // одна роль без родства («Левит.») — ещё и положение из § 5: «Левит. Привратник у ковчега»
  const statusFits = !!st && !statusUsed && st.text.length <= 140 && !repeats(st.text);
  if (noFamily && st && statusFits && len() + st.text.length <= BRIEF_MAX_SMALL) {
    absorb(st.text);
    out.push({ segs: [capFirst(st.text.replace(/[.;]\s*$/, ''))], refs: st.refs, data: true });
    statusUsed = st.text;
    statusMoved = st.text;
  }
  if ((small || noFamily) && card) {
    const ev = card.events?.[0];
    const take = (t: string, refs: string[]) => {
      if (repeats(t)) return false;
      if (out.length === 0 || len() + t.length <= (small ? BRIEF_MAX_SMALL : BRIEF_MAX)) {
        absorb(t);
        out.push({ segs: [capFirst(t.replace(/[.;]\s*$/, ''))], refs, data: true });
        return true;
      }
      return false;
    };
    if (ev) take(ev.text, ev.refs);
    else if (small && st && !statusUsed && take(st.text, st.refs)) statusMoved = st.text;
  }
  // первая фраза собирается из частей: у первой — прописная, у остальных — свой знак перед ними
  if (first.length) {
    const segs: BriefSeg[] = [];
    first.forEach((c, i) => {
      if (i) segs.push(c.sep);
      segs.push(...(i ? c.segs : [capFirstSeg(c.segs[0]), ...c.segs.slice(1)]));
    });
    out[firstAt] = { segs };
  } else if (out[firstAt] && !out[firstAt].segs.length) out.splice(firstAt, 1);

  // 8. родословие Иисуса Христа (§ 21); «праотец в родословии Иисуса Христа» уже сказано — не повторять (CARD-82)
  const ls = linesSentence(id);
  const sayAll = saidAll();
  if (ls && !(sayAll.has('родо') && sayAll.has('иису'))) out.push({ segs: [ls] });

  // ничего нет — первое упоминание (§ 23); у лиц без него — эпоха из паспорта
  if (!out.length) {
    const firstSeen = card?.scripture?.first;
    if (firstSeen) out.push({ segs: [people ? 'Упомянуто в родословии' : bySex(p.sex, 'Упомянут', 'Упомянута')], refs: [firstSeen] });
    else out.push({ segs: [`${people ? 'Упомянуто' : bySex(p.sex, 'Упомянут', 'Упомянута')} в Писании`] });
  }
  return { out, moved: statusMoved };
}

function capFirstSeg(s: BriefSeg): BriefSeg {
  return typeof s === 'string' ? capFirst(s) : { ...s, form: capFirst(s.form) };
}

/** Текст «Кратко» строкой — для проверок по всем лицам. */
export function briefText(id: string, card: Card | null): string {
  return briefSentences(id, card)
    .map((s) => `${s.segs.map((x) => (typeof x === 'string' ? x : x.form)).join('')}${s.refs?.length ? ` (${s.refs.join('; ')})` : ''}.`)
    .join(' ');
}

/** Абзац «Кратко» под шапкой; у предложений, взятых из текста (у малых лиц), — стихи со вклейкой. */
/** ns — приставка вклеек стихов: «Кратко» в панели «В работе» раскрывает свои стихи, а не стихи листа карточки. */
export function Brief({ id, card, ns = '' }: { id: string; card: Card | null; ns?: string }) {
  const ss = briefSentences(id, card);
  if (!ss.length) return null;
  // имена в записях, взятых из текста (§ 5, § 17), — ссылки, как в разделах (F12)
  const cands = ss.some((x) => x.data) ? linkCandidates(id, (card?.met ?? []).map((m) => m.id)) : [];
  const seg = (x: BriefSeg, i: number, data?: boolean): ComponentChildren =>
    typeof x === 'string' ? (data ? linkNames(x, cands) : x) : (
      <P id={x.id} key={i}>
        {x.form}
      </P>
    );
  return typoTree(
    <div class="brief fact">
      <p>
        <span class="visually-hidden">Кратко: </span>
        {ss.map((s, i) => (
          <span key={i}>
            {i ? ' ' : ''}
            {s.segs.map((x, k) => seg(x, k, s.data))}
            {s.refs?.length ? <Refs refs={s.refs} owner={`${ns}brief.${i}`} tail="." /> : '.'}
          </span>
        ))}
      </p>
      {ss.map((s, i) => (s.refs?.length ? <VerseInsert key={`v${i}`} owner={`${ns}brief.${i}`} refs={s.refs} /> : null))}
    </div>,
  );
}

