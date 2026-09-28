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

/** Имя в родительном падеже; null — если склонение ненадёжно. */
function gen(id: string): BriefSeg | null {
  const q = byId.get(id);
  if (!q) return null;
  const f = nameCase(q.name, q.sex, 'gen', q.unnamed);
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

/** Предложения «Кратко» для лица id. card — тело карточки (для § 5 и § 17); без него — только по индексу. */
export function briefSentences(id: string, card: Card | null): BriefSentence[] {
  const p = byId.get(id);
  if (!p) return [];
  const f = p.sex === 'f';
  const people = p.kind === 'people' || p.kind === 'clan';
  const out: BriefSentence[] = [];
  const first: BriefSeg[] = [];

  // 1. роль (паспорт) — первая по порядку составителя: «Пророк и судья»; у царя — царства (§ 16): «Царь Иудеи, затем всего Израиля»;
  //    запись § 5, которая начинается с той же роли («Царь Салимский»), точнее одного слова и заменяет его
  const roles = p.roles.filter((r) => (HEAD_ROLES as readonly string[]).includes(r));
  const role = p.roles.includes('messiah') ? 'messiah' : (roles[0] ?? null);
  const st = card?.status?.[0];
  let statusUsed: string | null = null;
  let reignNote: BriefSeg[] = [];
  if (role === 'messiah' && !people) {
    // «Христос, Сын Божий, Сын Давидов» — одно имя служения, не «Мессия, Христос» (одно и то же; CARD-65)
    const dh = disambigHead(p.disambig ?? '');
    first.push(['Христос', p.disambig].filter(Boolean).join(', ') || dh);
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
    first.push(capFirst(head));
  } else if (!people) {
    // роли нет, но подзаголовок называет положение: «Моавитянка» у Руфи
    const dh = disambigHead(p.disambig ?? '');
    if (dh) first.push(capFirst(dh));
  }

  // 2. положение (§ 5) — если роли нет: «Из храбрых Давида»; короткая запись, без цитаты во всю длину — отдельным предложением
  if (!first.length && st && st.text.length <= 120 && !/^[«"]/.test(st.text) && !GENTILIC.test(st.text)) {
    out.push({ segs: [capFirst(st.text.replace(/[.;]\s*$/, ''))], data: true });
    statusUsed = st.text;
  }

  // 3. происхождение (§ 6): «сын Иессея»; у народа — «в родословии — сын Хама»; у законного отца — нет
  // родитель по толкованию (Илий у Марии) или законный (Иосиф у Иисуса Христа) в «Кратко» не называется
  const father = p.father && p.fatherKind !== 'legal' && p.parentCert !== 'interpretation' ? p.father : null;
  const mother = p.mother && p.motherCert !== 'interpretation' ? p.mother : null;
  // безымянный родитель («Мать Сисары») назван описанием через самого владельца — в «Кратко» это не сведение
  const parent = [father, mother].find((x) => x && !byId.get(x)!.unnamed) ?? null;
  const par = parent ? gen(parent) : null;
  const parentNamed = !!statusUsed && !!parent && statusUsed.includes(byId.get(parent)!.name.slice(0, Math.max(3, byId.get(parent)!.name.length - 2)));
  const origin: BriefSeg[] = [];
  const messiah = role === 'messiah';
  if (par && !parentNamed) {
    // у Иисуса Христа — «родился от Марии» (Мф 1:16: «Марии, от Которой родился Иисус»): «Сын Божий, …, сын Марии» спорило бы
    const word = messiah ? 'родился от' : people ? (/(им|[ая]не)$/.test(p.name) ? 'произошли от' : 'в родословии — сын') : bySex(p.sex, 'сын', 'дочь');
    origin.push(`${word} `, par);
  }
  // 4. колено, дом или народ (паспорт): «из колена Иудина»; у детей родоначальника — не повторять
  // «из дома Давидова» у Иисуса Христа повторило бы «Сын Давидов» подзаголовка
  const aff = people || messiah ? null : affiliationFrom(id);
  if (aff && aff.founder !== parent) {
    if (origin.length) origin.push(aff.text.startsWith('из ') ? ' ' : ', ');
    origin.push(aff.text);
  }
  if (origin.length) {
    if (first.length) first.push(messiah ? '; ' : ', ', ...origin);
    else first.push(capFirstSeg(origin[0]), ...origin.slice(1));
  }
  if (reignNote.length) first.push('; ', ...reignNote);
  // главное служение (§ 16) — у лиц без царства: «вождь и избавитель Израиля при Исходе…» у Моисея (CARD-65);
  // запись, которая повторяет слова первой фразы («военачальник» у Иоава), не добавляется
  // какое служение главное: самое позднее с датой начала (у Иисуса Навина — «Вождь Израиля после Моисея»), иначе — с большим
  // числом стихов (у Иосифа — «Правитель над всею землею Египетскою»); записи с цитатой и одним стихом — нет
  if (!messiah && !reignNote.length && !p.reign.length && first.length) {
    const head = new Set(stemsOf(first.map((x) => (typeof x === 'string' ? x : x.form)).join(' ')));
    const cands = (card?.offices ?? [])
      .map((o) => ({ ...o, t: o.title.split(/;\s*/)[0].replace(/[.]\s*$/, '') }))
      .filter((o) => o.t.length <= 70 && !/[«»"]/.test(o.t) && (o.from !== undefined || o.refs.length >= 2) && stemsOf(o.t).every((w) => !head.has(w)));
    const dated = cands.filter((o) => o.from !== undefined).sort((a, b) => b.from! - a.from!);
    const main = dated[0] ?? [...cands].sort((a, b) => b.refs.length - a.refs.length)[0];
    if (main) first.push('; ', lowerFirst(main.t));
  }

  // 5. супруг (§ 9) — у женщины: «жена Махлона, затем Вооза»; «наложница Халева»
  let family = !!par;
  if (f && !people) {
    const hs = (graph.spousesOf.get(id) ?? []).filter((s) => s.b === id);
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
      if (first.length) first.push('; ', ...segs);
      else first.push(capFirstSeg(segs[0]), ...segs.slice(1));
      family = true;
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
      const segs: BriefSeg[] = [`${lead} `, ...joinAnd(xs)];
      if (first.length) first.push('; ', ...segs);
      else first.push(capFirstSeg(segs[0]), ...segs.slice(1));
      family = true;
    };
    // дети уже названы записью § 5 («Мать Аарона, Моисея и Мариам») — второй раз не называются
    const kidsSaid = !!statusUsed && pick.some((x) => typeof x !== 'string' && statusUsed!.includes(byId.get(x.id)!.name.slice(0, Math.max(3, byId.get(x.id)!.name.length - 2))));
    if (pick.length && !kidsSaid) addKids(bySex(p.sex, 'отец', 'мать'), pick);
    // законное отцовство (Мф 1:16): «законный отец Иисуса Христа»
    const lg = legal.map(gen).filter((x): x is BriefSeg => x !== null);
    if (lg.length) addKids(bySex(p.sex, 'законный отец', 'законная мать'), lg);
  }
  if (first.length) out.push({ segs: first });
  // о лице нет ни родства, ни семьи — первое событие жизни (§ 17) со стихами: «Царь Салимский. Вынес хлеб и вино Авраму…»
  const noFamily = !family;

  // 7. у малого лица — то, что о нём сказано (§ 17 или § 14), со стихами: это и есть вся статья (F11)
  // «Кратко» — 2–3 строки: запись из текста добавляется, если с ней абзац не длиннее BRIEF_MAX знаков
  const len = () => out.reduce((n, x) => n + x.segs.reduce((k, y) => k + (typeof y === 'string' ? y.length : y.form.length), 0) + 2, 0);
  // одна роль без родства («Левит.») — ещё и положение из § 5: «Левит. Привратник у ковчега»
  const said = () => new Set(stemsOf(out.flatMap((x) => x.segs).concat(first).map((x) => (typeof x === 'string' ? x : x.form)).join(' ')));
  const repeats = (t: string) => stemsOf(t).length > 0 && stemsOf(t).every((w) => said().has(w));
  if (noFamily && st && !statusUsed && st.text.length <= 140 && len() + st.text.length <= BRIEF_MAX_SMALL && !repeats(st.text)) {
    out.push({ segs: [capFirst(st.text.replace(/[.;]\s*$/, ''))], data: true });
    statusUsed = st.text;
  }
  if ((small || noFamily) && card) {
    const ev = card.events?.[0];
    const take = (t: string, refs: string[]) => {
      if (len() === 0 || len() + t.length <= (small ? BRIEF_MAX_SMALL : BRIEF_MAX)) out.push({ segs: [capFirst(t.replace(/[.;]\s*$/, ''))], refs, data: true });
    };
    if (ev) take(ev.text, ev.refs);
    else if (small && st && !statusUsed && !repeats(st.text)) take(st.text, st.refs);
  }

  // 8. родословие Иисуса Христа (§ 21)
  const ls = linesSentence(id);
  if (ls) out.push({ segs: [ls] });

  // ничего нет — первое упоминание (§ 23); у лиц без него — эпоха из паспорта
  if (!out.length) {
    const firstRef = card?.scripture?.first;
    if (firstRef) out.push({ segs: [people ? 'Упомянуто в родословии' : bySex(p.sex, 'Упомянут', 'Упомянута')], refs: [firstRef] });
    else if (p.epoch) out.push({ segs: [`${people ? 'Упомянуто' : bySex(p.sex, 'Упомянут', 'Упомянута')} в Писании`] });
    else out.push({ segs: [`${people ? 'Упомянуто' : bySex(p.sex, 'Упомянут', 'Упомянута')} в Писании`] });
  }
  return out;
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

