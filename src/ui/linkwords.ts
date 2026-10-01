/**
 * Слова связи (этап 11, решения 75, 78, 83; STAGE11.md § 8, стык 4): как назвать линию неба, которую навёл или выбрал
 * читатель, — в подсказке, в карточке связи, в кольцах на концах и для диктора. Ключ связи — src/engine/linkkey.ts.
 *
 *   linkTitle  — «Иаков и Рахиль — родители; Иосиф — сын»: родство словами, в именительном падеже, без стрелок
 *                (решение 54). Родители — названием союза (решение 75: «Сиф и его жена — родители»), ребёнок — своей
 *                ролью. Вид утверждения — в роли: «Иосиф — отец по закону, Мария — мать», «Нирий — отец по Луке».
 *   linkRefs   — стихи связи: у связи «союз → ребёнок» — стихи родства ребёнка с родителями союза (parentRefs или
 *                стихи утверждения иного рода); у черты брака — стихи брака; у союза — стихи, где названы его дети
 *                (первым — место, где названо больше всего детей), затем стихи брака; у шага ленты — стихи шага, первым —
 *                место, где назван родитель шага (DG 2.3.7: «Мария — мать; Иисус Христос — сын» — Лк 1:31, а не Лк 3:23);
 *                у родства словами Писания — стихи этого родства.
 *   linkRoles  — концы связи с ролями для колец: «отец», «мать», «сын», «дочь», «муж», «жена», «наложница»,
 *                «отец по закону», «приёмный сын», «предок», «потомок», термин Писания («сестра»).
 *   linkMarks  — пометы: «выв.», «толк.», «у Мф опущен», «только у Луки», «пропуск поколений».
 *   linkTip    — подсказка наведения: «Иаков и Рахиль — родители; Иосиф — сын (Быт 30:22–24)».
 *   linkSpeech — для диктора: «Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35».
 *   linkLines  — какие ленты Мессии рисуют эту связь и по какому стиху: «Мф 1:2», «Лк 3:33–34».
 *   unionName  — название союза: «Иаков и Лия», «Сиф и его жена» (решение 75); если у лица есть и другие союзы с
 *                названными супругами, «его жена» было бы двусмысленно — «Давид (мать не названа)».
 *
 * Склонение — только функцией src/ui/text/ru.ts (nameCase): если имя не склоняется надёжно, строка строится без
 * косвенного падежа («Иаков и Рахиль — муж и жена» вместо «Рахиль — жена Иакова»). Все сведения — из данных со стихами
 * (граф, союзы src/engine/unions.ts, линии data/lines/*.json); модуль ничего не рисует и не знает о небе.
 */
import { byId, graph, lines, loadedCard } from '../data/atlas.ts';
import type { Cert, Sex } from '../data/types.ts';
import { BOOKS } from '../engine/books.ts';
import { linkKeyString, spanInner, type LinkKey } from '../engine/linkkey.ts';
import { kidEdges, type Union } from '../engine/unions.ts';
import { unions } from './reveal.ts';
import { bySex, KIN_TERMS, lowerFirst, nameCase, pluralPeopleName, splitKinTerm } from './text/ru.ts';
import { typo } from './text/typo.ts';

export type Line = 'joseph' | 'mary';

/** Конец связи: лицо и его роль в этой связи. from — старшая сторона (родители, супруг), to — младшая (ребёнок). */
export interface LinkEnd {
  id: string;
  /** роль коротко — для кольца на небе: «отец», «мать», «сын», «отец по закону», «приёмный отец», «сестра» */
  role: string;
  side: 'from' | 'to';
}

/** Лента, которая рисует связь: линия, номер лица у Мф или Лк, стих шага, помета шага (data/lines). */
export interface LinkLine {
  line: Line;
  /** стих родословия своей книги (Мф у линии Иосифа, Лк у линии по Луке), иначе первый стих шага */
  ref: string | null;
  refs: string[];
  flag: string;
  mt?: number;
  lk?: number;
}

/** Всё о связи — для карточки связи (src/ui/sky/DotCard.tsx) и слов неба. */
export interface LinkInfo {
  key: LinkKey;
  /** заголовок: у связи по толкованию и по выводу первым словом стоит уровень (решение 105) — «По толкованию: …» */
  title: string;
  /** слово уровня в начале заголовка («По толкованию», «Вывод») или null — Писание */
  lead: string | null;
  /** заголовок без слова уровня */
  body: string;
  refs: string[];
  ends: LinkEnd[];
  /** союз связи: у «союз → ребёнок», черты брака и союза — сам союз; у шага ленты — союз родителя шага и ребёнка */
  union: Union | null;
  /** худший уровень достоверности связи (П-4) */
  cert: Cert;
  /** пометы: вид шага ленты, пропуск поколений, уровень */
  marks: string[];
  lines: LinkLine[];
  /** пояснение для карточки: «родство названо словами Писания; родители не выводятся» */
  note: string | null;
  /**
   * Неназванный конец (решение 75; макет X4 М1): строка карточки «Мать — в Писании не названа». role — подпись строки
   * («Мать», «Отец», «Жена», «Муж»), text — «в Писании не названа».
   */
  missing: { role: string; text: string } | null;
  /**
   * Второй родитель шага ленты по союзу (решение 171; R1-12): «Мать — Вирсавия» у шага Давид → Соломон (Мф 1:6). Только
   * строка карточки: концы связи на небе — родитель шага и ребёнок, как прежде.
   */
  other?: { id: string; role: string } | null;
}

// ---------- лица ----------

const nameOf = (id: string) => byId.get(id)?.name ?? id;
const sexOf = (id: string): Sex => byId.get(id)?.sex ?? 'm';
/** Имя не первым словом: описательное имя безымянного («Дочь Шуи») — со строчной. */
const midName = (id: string) => (byId.get(id)?.unnamed ? lowerFirst(nameOf(id)) : nameOf(id));
/** Имя в родительном падеже или null, если склонение ненадёжно (ru.ts). */
const genOf = (id: string): string | null => {
  const p = byId.get(id);
  return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt) : null;
};
const isPeople = (id: string) => {
  const k = byId.get(id)?.kind;
  return k === 'people' || k === 'clan';
};
/** Народ с именем во множественном числе (Лудим, Филистимляне): это не «сын», а потомки (Быт 10:13–14). */
const pluralPeople = (id: string) => {
  const p = byId.get(id);
  return !!p && pluralPeopleName(p.name, p.kind);
};
/**
 * Союз таблицы народов (Быт 10): названный родитель — народ или все дети — народы. О матери здесь не говорится:
 * «Ханаан — отец; Иевусей — сын» (Быт 10:15–16), без «его жены».
 */
const peopleUnion = (u: Union) => {
  const one = u.a ?? u.b;
  return (!!one && isPeople(one)) || (u.kids.length > 0 && u.kids.every(isPeople));
};

// ---------- союзы ----------

/** Союз иного рода — отдельный союз с пометой (решение 67): по Луке, усыновление, по другому месту, предок. */
export const isClaimUnion = (u: Union) => !!u.claim && u.id.includes('~');

/**
 * Второе место союза не названо, а у названного есть и другие союзы с названными супругами: «Давид и его жена» не
 * сказало бы, какая жена (у Давида восемь названных жён и дети от неназванных, 1 Пар 3:9; 14:4).
 */
function unnamedAmbiguous(u: Union, one: string): boolean {
  return (unions.of.get(one) ?? []).some((o) => o !== u && !isClaimUnion(o) && !!o.a && !!o.b);
}

/**
 * Название союза — в подписи ромба, карточке союза, заголовке связи: «Авраам и Агарь», «Авраам и дочь Шуи». Второе
 * место не названо (решение 75) — «Сиф и его жена», «Мария и её муж»; если у лица есть и другие союзы с названными
 * супругами — «Давид (мать не названа)». У союза иного рода, у народа и у брака без детей с одним лицом — одно имя.
 */
export function unionName(u: Union): string {
  if (u.a && u.b) return `${nameOf(u.a)} и ${midName(u.b)}`;
  const one = u.a ?? u.b;
  if (!one) return '';
  if (isClaimUnion(u) || !u.kids.length || peopleUnion(u)) return nameOf(one);
  if (unnamedAmbiguous(u, one)) return `${nameOf(one)} (${u.a ? 'мать не названа' : 'отец не назван'})`;
  const his = sexOf(one) === 'f' ? 'её' : 'его';
  return u.a ? `${nameOf(one)} и ${his} жена` : `${nameOf(one)} и ${his} муж`;
}

/** Вид утверждения иного рода коротко — в пометах и ролях: «по закону», «по Луке». */
export const CLAIM_WORD: Record<string, string> = {
  legal: 'по закону',
  'by-luke': 'по Луке',
  adoptive: 'усыновление',
  levirate: 'по закону ужичества',
  alternative: 'по другому месту Писания',
  ancestor: 'без промежуточных звеньев',
};

/** Роль родителя в союзе: «отец», «мать», «отец по закону», «приёмный отец», «предок»; у брака без детей — «муж», «жена». */
export function parentRole(u: Union, id: string): string {
  const f = sexOf(id) === 'f';
  if (isClaimUnion(u)) {
    switch (u.claim) {
      case 'ancestor':
        return f ? 'прародительница' : 'предок';
      case 'adoptive':
        return f ? 'приёмная мать' : 'приёмный отец';
      default:
        return `${f ? 'мать' : 'отец'} ${CLAIM_WORD[u.claim!] ?? 'по иному указанию'}`;
    }
  }
  // законный отец основной линии — тот же союз с пометой (Иосиф — Иисус, Мф 1:16)
  if (u.claim && u.claim !== 'natural' && id === u.a) return `отец ${CLAIM_WORD[u.claim] ?? 'по иному указанию'}`;
  return f ? 'мать' : 'отец';
}

/** Роль ребёнка союза: «сын», «дочь», «приёмный сын», «потомок»; народ во множественном числе — «потомки». */
export function childRole(u: Union | null, kid: string): string {
  const s = sexOf(kid);
  if (u && isClaimUnion(u)) {
    if (u.claim === 'ancestor') return 'потомок';
    if (u.claim === 'adoptive') return bySex(s, 'приёмный сын', 'приёмная дочь');
  }
  if (pluralPeople(kid)) return 'потомки';
  return bySex(s, 'сын', 'дочь');
}

/**
 * Роль супруга: «муж», «жена», «наложница». Пара, которую текст называет только родителями детей («имя матери его Наама»,
 * 3 Цар 14:21; дочери Лота; Фамарь — Иуда), — «отец» и «мать», без слов брака (решение 92).
 */
function spouseRole(u: Union, id: string): string {
  if (coparentsOnly(u)) return parentRole(u, id);
  if (id === u.b) return u.kind === 'concubine' ? 'наложница' : bySex(sexOf(id), 'муж', 'жена');
  return bySex(sexOf(id), 'муж', 'жена');
}

/** Оба родителя названы, а супругами текст их не называет (решение 92). */
const coparentsOnly = (u: Union) => u.kind === 'parents' && !!u.a && !!u.b && u.kids.length > 0 && !isClaimUnion(u);
/** Пояснение к такой паре — в карточке связи. */
const COPARENTS_NOTE = 'Супругами Писание их не называет: они названы отцом и матерью ребёнка';

/**
 * Родители союза для заголовка связи: «Иаков и Рахиль — родители», «Сиф и его жена — родители», «Иосиф — отец по закону,
 * Мария — мать», «Нирий — отец по Луке», «Давид — отец, мать не названа».
 */
function parentsText(u: Union): string {
  const named = [u.a, u.b].filter((x): x is string => !!x);
  if (!named.length) return '';
  const roles = named.map((x) => parentRole(u, x));
  const plain = roles.every((r) => r === 'отец' || r === 'мать');
  if (named.length === 2) return plain ? `${nameOf(u.a!)} и ${midName(u.b!)} — родители` : named.map((x, i) => `${i ? midName(x) : nameOf(x)} — ${roles[i]}`).join(', ');
  const one = named[0];
  if (!plain || isClaimUnion(u) || peopleUnion(u) || unnamedAmbiguous(u, one)) return `${nameOf(one)} — ${roles[0]}`;
  return `${unionName(u)} — родители`;
}

/**
 * Второй родитель не назван, а «его жена» было бы двусмысленно (у лица есть другие союзы с названными супругами): хвост
 * строки «мать не названа» — одна форма во всех строках (X4 § 2.3 п. 7): «Иорам — отец; Иосавеф — дочь; мать не названа».
 */
function unnamedTail(u: Union): string {
  const one = u.a ?? u.b;
  if (!one || (u.a && u.b) || isClaimUnion(u) || peopleUnion(u) || !u.kids.length || !unnamedAmbiguous(u, one)) return '';
  return `; ${u.a ? 'мать не названа' : 'отец не назван'}`;
}

// ---------- стихи ----------

const refKey = (r: string) => r.replace(/\s+/g, '');
const uniq = (rs: readonly string[]) => {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(refKey(r)) ? false : (seen.add(refKey(r)), true)));
};

const CERT_RANK: Record<string, number> = { scripture: 0, inference: 1, interpretation: 2 };
const worst = (cs: readonly Cert[]): Cert => cs.reduce<Cert>((a, b) => ((CERT_RANK[b] ?? 0) > (CERT_RANK[a] ?? 0) ? b : a), 'scripture');
/** Помета уровня (П-4): «выв.», «толк.»; Писание — без пометы. */
export const CERT_WORD: Record<string, string> = { inference: 'выв.', interpretation: 'толк.' };
/**
 * Слово уровня в начале заголовка связи (решение 105; П17): «По толкованию: Илий и его жена — родители; Мария — дочь»,
 * «Вывод: Рахиль — жена Иакова». Писание — без слова.
 */
export const CERT_LEAD: Record<string, string> = { inference: 'Вывод', interpretation: 'По толкованию' };

/** Связи ребёнка с родителями союза: у союза иного рода — утверждения этого рода, у обычного — отец и мать. */
export function kidLink(u: Union, kid: string): { refs: string[]; cert: Cert; gap: boolean } {
  const es = kidEdges(graph, u, kid).filter((e) => (isClaimUnion(u) ? e.kind.startsWith('other') && e.claim === u.claim : e.kind === 'father' || e.kind === 'mother'));
  return { refs: uniq(es.flatMap((e) => e.refs)), cert: worst(es.map((e) => e.cert)), gap: es.some((e) => e.kind === 'father' && e.gap) };
}

/** Стихи союза: где названы его дети (первым — место, где названо больше всего детей), затем стихи брака. */
function unionRefs(u: Union): string[] {
  const count = new Map<string, { n: number; at: number; ref: string }>();
  let at = 0;
  for (const k of u.kids)
    for (const r of kidLink(u, k).refs) {
      const c = count.get(refKey(r));
      if (c) c.n++;
      else count.set(refKey(r), { n: 1, at: at++, ref: r });
    }
  const kids = [...count.values()].sort((a, b) => b.n - a.n || a.at - b.at).map((c) => c.ref);
  return uniq([...kids, ...(u.kind === 'parents' ? [] : u.refs)]);
}

// ---------- ленты ----------

interface Step {
  line: Line;
  parent: string | null;
  child: string;
  refs: string[];
  flag: string;
  mt?: number;
  lk?: number;
}

const stepCache = new Map<string, Step | null>();
/**
 * Шаг линии Мессии к лицу child (data/lines): родитель — предыдущее лицо линии. Лазурная линия, показанная вторым
 * родословием Иосифа (Лк 3:23: «Сын Иосифов, Илиев»), ведёт к Иосифу шагом Марии — по тексту, без пометы «толк.».
 */
export function stepOf(line: Line, child: string): Step | null {
  const ck = `${line}|${child}`;
  const hit = stepCache.get(ck);
  if (hit !== undefined) return hit;
  const ps = lines[line]?.persons ?? [];
  let i = ps.findIndex((s) => s.id === child);
  let flag: string | null = null;
  if (i < 0 && line === 'mary' && child === 'iosif-muzh-marii') {
    i = ps.findIndex((s) => s.id === 'mariya');
    flag = 'in-text';
  }
  const s = i >= 0 ? ps[i] : null;
  const out: Step | null = s ? { line, parent: i > 0 ? ps[i - 1].id : null, child, refs: [...s.refs], flag: flag ?? s.flag, mt: s.mt, lk: s.lk } : null;
  stepCache.set(ck, out);
  return out;
}

/** Родитель шага линии (для linkEnds из src/engine/linkkey.ts). */
export const stepParent = (line: Line, child: string): string | null => stepOf(line, child)?.parent ?? null;

/** Стих из родословия Мф 1:1–17 или Лк 3:23–38. */
const GENEALOGY: Record<string, (ch: number, v: number) => boolean> = {
  Мф: (ch, v) => ch === 1 && v <= 17,
  Лк: (ch, v) => ch === 3 && v >= 23,
};
/**
 * Называет ли стих родословия родителя шага: у Мф 1 и Лк 3 названы только лица самих родословий (у них номер mt или lk).
 * Лк 3:23 не называет Марию, Мф 1:2 — Фарру: такие стихи шага идут после стихов, где родитель назван (DG 2.3.7).
 */
function namesParent(ref: string, parent: string | null): boolean {
  const m = /^(Мф|Лк)\s+(\d+):(\d+)/.exec(ref);
  if (!m || !GENEALOGY[m[1]](Number(m[2]), Number(m[3]))) return true;
  if (!parent) return true;
  const inLine = m[1] === 'Мф' ? lines.joseph.persons.find((s) => s.id === parent)?.mt : lines.mary.persons.find((s) => s.id === parent)?.lk;
  return inLine !== undefined;
}

/** Стихи шага: сначала те, где назван родитель шага, в порядке данных. */
function stepRefs(s: Step): string[] {
  const good = s.refs.filter((r) => namesParent(r, s.parent));
  return uniq([...good, ...s.refs.filter((r) => !good.includes(r))]);
}

/**
 * Стих шага для строки «Ленты»: стих своей книги (Мф у линии Иосифа, Лк у линии по Луке), где назван родитель шага;
 * иначе первый стих шага (Фарра → Авраам: Быт 11:26 — Мф 1:2 Фарру не называет).
 */
function stepBookRef(s: Step): string | null {
  const book = s.line === 'joseph' ? 'Мф' : 'Лк';
  const refs = stepRefs(s);
  return refs.find((r) => r.startsWith(`${book} `) && namesParent(r, s.parent)) ?? refs[0] ?? null;
}

/** Помета шага линии: «у Мф опущен» (Мф 1:8), «только у Луки» (Лк 3:36); «по закону» и «толк.» — в роли и уровне. */
const STEP_MARK: Record<string, string> = { 'omitted-by-mt': 'у Мф опущен', 'luke-only': 'только у Луки' };

/** Ленты, которые рисуют связь родителя parent (одного из parents) с ребёнком child. */
function linesOf(parents: readonly string[], child: string): LinkLine[] {
  const out: LinkLine[] = [];
  for (const line of ['joseph', 'mary'] as const) {
    const s = stepOf(line, child);
    if (!s || !s.parent || !parents.includes(s.parent)) continue;
    out.push({ line, ref: stepBookRef(s), refs: stepRefs(s), flag: s.flag, ...(s.mt !== undefined ? { mt: s.mt } : {}), ...(s.lk !== undefined ? { lk: s.lk } : {}) });
  }
  return out;
}

/** Союз родителя и ребёнка: первым — обычный союз (кровные отец и мать), затем союзы иного рода. */
function unionOfPair(parent: string, child: string): Union | null {
  const us = (unions.origin.get(child) ?? []).filter((u) => u.a === parent || u.b === parent);
  return us.find((u) => !isClaimUnion(u)) ?? us[0] ?? null;
}

// ---------- родство словами Писания ----------

/** Запись родства между a и b в любую сторону: термин записан у того, кого он описывает (src/ui/text/ru.ts, KIN_TERMS). */
function kinEdge(a: string, b: string) {
  return (graph.kinOf.get(a) ?? []).find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)) ?? null;
}

/** Обратные термины, которых нет в KIN_TERMS: брат и сестра, «сын царя» — царь. [мужской, женский] — по полу второго. */
const KIN_REV: Record<string, [string, string]> = {
  брат: ['брат', 'сестра'],
  сестра: ['брат', 'сестра'],
  'сын царя': ['царь', 'царица'],
};
function kinReverse(rel: string, otherSex: Sex): string | null {
  const term = splitKinTerm(rel).term.toLowerCase();
  const r = KIN_REV[term] ?? (KIN_TERMS[term]?.rev as [string | null, string | null] | undefined);
  return r ? (r[otherSex === 'f' ? 1 : 0] ?? null) : null;
}

/**
 * «Саруия — сестра Давида», «Иосиф — зять Илия (по толкованию Лк 3:23)»; термин не сочетается с родительным падежом
 * («из рода первосвященнического») — «Иоанн — из рода первосвященнического, как Анна»; имя не склоняется — термин
 * и оба имени в именительном: «Саруия — сестра; Давид — брат».
 */
function kinTitle(from: string, to: string, rel: string): string {
  const { term, tail } = splitKinTerm(rel);
  if (/^из\s/.test(term)) return `${nameOf(from)} — ${term}, как ${midName(to)}`;
  const g = genOf(to);
  if (g) return `${nameOf(from)} — ${term} ${g}${tail ? ` ${tail}` : ''}`;
  const back = kinReverse(rel, sexOf(to));
  return `${nameOf(from)} — ${term}${tail ? ` ${tail}` : ''}; ${nameOf(to)}${back ? ` — ${back}` : ''}`;
}

// ---------- связь ----------

const union = (uid: string): Union | null => unions.byId.get(uid) ?? null;

/**
 * Дети союза в заголовке: до четырёх — по имени через запятую, в порядке текста («Ной и его жена: Сим, Хам, Иафет»,
 * STAGE11.md § 12, сценарий 1); больше — числом: «6 сыновей и дочь», «77 потомков»; у народов числа «сыновей» нет —
 * первые три имени и «ещё 4»: «Лудим, Анамим, Легавим и ещё 4».
 */
function kidsWords(u: Union): string {
  const ks = u.kids;
  if (!ks.length) return '';
  if (ks.length <= 4) return ks.map(midName).join(', ');
  if (ks.some(isPeople)) return `${ks.slice(0, 3).map(midName).join(', ')} и ещё ${ks.length - 3}`;
  return kidsCount(u);
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

/**
 * Дети союза числом, словами (решение 105): «один сын», «одна дочь», «3 сына», «6 сыновей и одна дочь», «2 потомка»;
 * детей нет — «детей не названо». «Илий и его жена: одна дочь» — а не «Илий и его жена — дочь».
 */
export function kidsCount(u: Union): string {
  const n = u.kids.length;
  if (!n) return 'детей не названо';
  if (isClaimUnion(u) && u.claim === 'ancestor') return n === 1 ? 'один потомок' : `${n} ${plural(n, 'потомок', 'потомка', 'потомков')}`;
  const girls = u.kids.filter((k) => sexOf(k) === 'f').length;
  const boys = n - girls;
  const s = boys === 1 ? 'один сын' : boys ? `${boys} ${plural(boys, 'сын', 'сына', 'сыновей')}` : '';
  const d = girls === 1 ? 'одна дочь' : girls ? `${girls} ${plural(girls, 'дочь', 'дочери', 'дочерей')}` : '';
  return [s, d].filter(Boolean).join(' и ');
}

/** Заголовок союза: «Ной и его жена: Сим, Хам, Иафет», «Иаков и Лия: 6 сыновей и дочь», «Давид и Мелхола — муж и жена». */
function unionTitleOf(u: Union): string {
  const name = unionName(u);
  if (!u.kids.length) {
    if (u.a && u.b) return `${name} — ${u.kind === 'concubine' ? 'муж и наложница' : 'муж и жена'}`;
    return name;
  }
  if (isClaimUnion(u)) {
    const one = (u.a ?? u.b)!;
    return `${nameOf(one)} — ${parentRole(u, one)}: ${kidsWords(u)}`;
  }
  return `${name}: ${kidsWords(u)}`;
}

/** Черта брака: «Рахиль — жена Иакова», «Иаков — муж Рахили»; имя не склоняется — «Иаков и Рахиль — муж и жена». */
function spouseTitle(u: Union, person: string): string {
  // пара только родителей — как союз: «Соломон и Наама: Ровоам»
  if (coparentsOnly(u)) return unionTitleOf(u);
  const other = person === u.a ? u.b : person === u.b ? u.a : null;
  const role = spouseRole(u, person);
  if (!other) return `${unionName(u)}`;
  const g = genOf(other);
  if (g) return `${nameOf(person)} — ${role} ${g}`;
  return `${nameOf(u.a!)} и ${midName(u.b!)} — ${u.kind === 'concubine' ? 'муж и наложница' : 'муж и жена'}`;
}

/**
 * «Союз → ребёнок»: «Иаков и Рахиль — родители; Иосиф — сын»; народ во множественном числе — «От Мицраима произошли
 * Лудим» (Быт 10:13), без склонения — «Мицраим — отец; Лудим — потомки».
 */
function childTitle(u: Union, kid: string): string {
  if (pluralPeople(kid) && !isClaimUnion(u)) {
    const one = u.a ?? u.b;
    const g = one && !(u.a && u.b) ? genOf(one) : null;
    if (g) return `От ${g} произошли ${nameOf(kid)}`;
  }
  return `${parentsText(u)}; ${nameOf(kid)} — ${childRole(u, kid)}${unnamedTail(u)}`;
}

/** Роль родителя шага ленты: «отец», «мать», «отец по закону» (Иосиф — Иисус, Мф 1:16). */
function stepParentRole(s: Step, parent: string): string {
  const f = sexOf(parent) === 'f';
  if (s.flag === 'legal') return f ? 'мать по закону' : 'отец по закону';
  return f ? 'мать' : 'отец';
}

const infoCache = new Map<string, LinkInfo | null>();

/** Всё о связи; null — связи нет в данных (битый адрес, союз без этого ребёнка). */
export function linkInfo(key: LinkKey): LinkInfo | null {
  const ks = linkKeyString(key);
  if (ks && infoCache.has(ks)) return infoCache.get(ks)!;
  const raw = build(key);
  // уровень — первым словом заголовка (решение 105): «По толкованию: …», «Вывод: …». У союза целиком уровень — худший
  // из его детей («Адам и Ева: Каин, Авель, Сиф» — выведена только мать Сифа): слово уровня отнесло бы его ко всему
  // союзу, поэтому у союза — только помета «выв.»
  const lead = raw && key.kind !== 'union' ? (CERT_LEAD[raw.cert] ?? null) : null;
  const out: LinkInfo | null = raw ? { ...raw, body: raw.title, lead, title: lead ? `${lead}: ${raw.title}` : raw.title, missing: raw.missing ?? null } : null;
  if (ks) infoCache.set(ks, out);
  return out;
}

/** Сведения о связи до слова уровня. */
type RawInfo = Omit<LinkInfo, 'lead' | 'body' | 'missing'> & { missing?: LinkInfo['missing'] };
/** Неназванный второй родитель или супруг: подпись строки и слова. */
const unnamedRow = (u: Union, as: 'parent' | 'spouse'): LinkInfo['missing'] =>
  as === 'parent'
    ? u.a
      ? { role: 'Мать', text: 'в Писании не названа' }
      : { role: 'Отец', text: 'в Писании не назван' }
    : u.a
      ? { role: 'Жена', text: 'имя в Писании не названо' }
      : { role: 'Муж', text: 'имя в Писании не названо' };

function build(key: LinkKey): RawInfo | null {
  switch (key.kind) {
    case 'child': {
      const u = union(key.union);
      if (!u || !u.kids.includes(key.child)) return null;
      const kin = kidLink(u, key.child);
      const parents = [u.a, u.b].filter((x): x is string => !!x);
      const marks: string[] = [];
      if (kin.gap) marks.push('пропуск поколений');
      if (CERT_WORD[kin.cert]) marks.push(CERT_WORD[kin.cert]);
      const missing = !isClaimUnion(u) && parents.length === 1 && !peopleUnion(u) ? unnamedRow(u, 'parent') : null;
      return {
        key,
        title: typo(childTitle(u, key.child)),
        refs: kin.refs.length ? kin.refs : [...u.refs],
        ends: [...parents.map((p) => ({ id: p, role: parentRole(u, p), side: 'from' as const })), { id: key.child, role: childRole(u, key.child), side: 'to' }],
        union: u,
        cert: kin.cert,
        marks,
        lines: linesOf(parents, key.child),
        note: kin.gap ? 'Родословие здесь может пропускать поколения' : null,
        missing,
      };
    }
    case 'spouse': {
      const u = union(key.union);
      if (!u || (u.a !== key.person && u.b !== key.person)) return null;
      const other = key.person === u.a ? u.b : u.a;
      const marks = CERT_WORD[u.cert] && u.kind !== 'parents' ? [CERT_WORD[u.cert]] : [];
      return {
        key,
        title: typo(spouseTitle(u, key.person)),
        refs: u.kind === 'parents' ? [] : [...u.refs],
        ends: [{ id: key.person, role: spouseRole(u, key.person), side: 'from' }, ...(other ? [{ id: other, role: spouseRole(u, other), side: 'to' as const }] : [])],
        union: u,
        cert: u.kind === 'parents' ? 'scripture' : u.cert,
        marks,
        lines: [],
        note: coparentsOnly(u) ? COPARENTS_NOTE : other ? (u.note ?? null) : null,
        missing: other ? null : unnamedRow(u, 'spouse'),
      };
    }
    case 'union': {
      const u = union(key.union);
      if (!u) return null;
      const parents = [u.a, u.b].filter((x): x is string => !!x);
      const kids = u.kids.length > 0;
      const cert = kids ? u.kidsCert : u.cert;
      return {
        key,
        title: typo(unionTitleOf(u)),
        refs: kids ? unionRefs(u) : [...u.refs],
        ends: parents.map((p) => ({ id: p, role: kids ? parentRole(u, p) : spouseRole(u, p), side: 'from' as const })),
        union: u,
        cert,
        marks: CERT_WORD[cert] ? [CERT_WORD[cert]] : [],
        lines: [],
        note: coparentsOnly(u) ? COPARENTS_NOTE : null,
        missing: !isClaimUnion(u) && parents.length === 1 && kids && !peopleUnion(u) ? unnamedRow(u, 'spouse') : null,
      };
    }
    case 'step': {
      const s = stepOf(key.line, key.child);
      if (!s || !s.parent || !byId.has(s.parent) || !byId.has(key.child)) return null;
      const u = unionOfPair(s.parent, key.child);
      const edgeCert = u ? kidLink(u, key.child).cert : 'scripture';
      const cert = worst([s.flag === 'interpretation' ? 'interpretation' : 'scripture', edgeCert]);
      const marks = [STEP_MARK[s.flag], CERT_WORD[cert]].filter((x): x is string => !!x);
      const title = `${nameOf(s.parent)} — ${stepParentRole(s, s.parent)}; ${nameOf(key.child)} — ${childRole(null, key.child)}`;
      // обе ленты, если второй линии тот же шаг (Иаков → Иуда: Мф 1:2 и Лк 3:33–34)
      const both = linesOf([s.parent], key.child);
      return {
        key,
        title: typo(title),
        refs: stepRefs(s),
        ends: [
          { id: s.parent, role: stepParentRole(s, s.parent), side: 'from' },
          { id: key.child, role: childRole(null, key.child), side: 'to' },
        ],
        union: u,
        cert,
        marks,
        lines: both.length ? both : [{ line: key.line, ref: stepBookRef(s), refs: stepRefs(s), flag: s.flag }],
        note: null,
        missing: u && !isClaimUnion(u) && !(u.a && u.b) && !peopleUnion(u) ? unnamedRow(u, 'parent') : null,
        other: (() => {
          // второй родитель союза шага (не утверждение иного рода): «Мать» у шага отца, «Отец» у шага матери
          const o = u && !isClaimUnion(u) ? (u.a === s.parent ? u.b : u.b === s.parent ? u.a : null) : null;
          return o && byId.has(o) ? { id: o, role: sexOf(o) === 'f' ? 'мать' : 'отец' } : null;
        })(),
      };
    }
    case 'kin': {
      const e = kinEdge(key.a, key.b);
      if (!e || !byId.has(e.from) || !byId.has(e.to)) return null;
      const back = kinReverse(e.rel, sexOf(e.to));
      const rel = splitKinTerm(e.rel);
      return {
        key,
        title: typo(kinTitle(e.from, e.to, e.rel)),
        refs: [...e.refs],
        ends: [
          { id: e.from, role: rel.term, side: 'from' },
          { id: e.to, role: back ?? '', side: 'to' },
        ],
        union: null,
        cert: e.cert,
        marks: CERT_WORD[e.cert] ? [CERT_WORD[e.cert]] : [],
        lines: [],
        note: 'Родство названо словами Писания; родители из него не выводятся',
      };
    }
    case 'span':
      return spanInfo(key);
  }
}

/** Лица линии line по порядку, от Адама к Иисусу Христу (data/lines). */
export const lineOrder = (line: Line): string[] => (lines[line]?.persons ?? []).map((x) => x.id);

/**
 * Скрытые лица цепочки (решение 93, К4): лица линии строго между концами, по порядку; null — запись битая.
 */
export const spanHidden = (key: Extract<LinkKey, { kind: 'span' }>): string[] | null => spanInner(lineOrder(key.line), key);

/** Стихи родословия у шагов цепочки одной главой: «Лк 3:23–31»; главы разные — первые три стиха. */
function spanRefs(steps: readonly Step[]): string[] {
  const refs = uniq(steps.map((x) => stepBookRef(x)).filter((r): r is string => !!r));
  const m = refs.map((r) => /^(\S+)\s+(\d+):(\d+)(?:[-–](\d+))?$/.exec(r));
  if (m.length && m.every((x) => x && x[1] === m[0]![1] && x[2] === m[0]![2])) {
    const vs = m.flatMap((x) => [Number(x![3]), Number(x![4] ?? x![3])]);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    return [`${m[0]![1]} ${m[0]![2]}:${lo}${hi > lo ? `-${hi}` : ''}`];
  }
  return refs.slice(0, 3);
}

/**
 * Цепочка (решение 93, К4; X3 § 2.1): «Давид … Мария — 41 поколение по Лк 3; скрыто 40». Цепочка — участок ленты,
 * где показ скрыл все лица между концами, поэтому скрыто — все внутренние лица; пояснение называет их: «В этом показе
 * лента сжата: скрыто 40 (Нафан … Илий)». Уровень — худший из шагов цепочки (шаг Илий → Мария — толкование).
 */
function spanInfo(key: Extract<LinkKey, { kind: 'span' }>): RawInfo | null {
  const inner = spanHidden(key);
  if (!inner || !byId.has(key.from) || !byId.has(key.to)) return null;
  const steps = [...inner, key.to].map((c) => stepOf(key.line, c)).filter((x): x is Step => !!x);
  if (steps.length !== inner.length + 1) return null;
  const certs = steps.map((x) => {
    const u = x.parent ? unionOfPair(x.parent, x.child) : null;
    return worst([x.flag === 'interpretation' ? 'interpretation' : 'scripture', u ? kidLink(u, x.child).cert : 'scripture']);
  });
  const refs = spanRefs(steps);
  const n = steps.length;
  const book = refs.length === 1 ? /^(Мф 1|Лк 3):/.exec(refs[0])?.[1] : null;
  // цепочка — участок, где показ скрыл все лица между концами (linkkey.ts): скрыто — все внутренние
  const hid = inner.length;
  const title = `${nameOf(key.from)} … ${nameOf(key.to)} — ${n} ${plural(n, 'поколение', 'поколения', 'поколений')}${book ? ` по ${book}` : ''}; скрыто ${hid}`;
  return {
    key,
    title: typo(title),
    refs,
    ends: [
      { id: key.from, role: bySex(sexOf(key.from), 'предок', 'прародительница'), side: 'from' },
      { id: key.to, role: sexOf(key.to) === 'f' ? 'потомок' : 'потомок', side: 'to' },
    ],
    union: null,
    cert: worst(certs),
    marks: CERT_WORD[worst(certs)] ? [CERT_WORD[worst(certs)]] : [],
    lines: [{ line: key.line, ref: refs[0] ?? null, refs, flag: 'in-text' }],
    note: hid ? `В этом показе лента сжата: скрыто ${hid} (${hid > 2 ? `${nameOf(inner[0])} … ${nameOf(inner[hid - 1])}` : inner.map(nameOf).join(', ')})` : null,
  };
}

// ---------- «Какая связь?» ----------

/**
 * Строка списка «Какая связь?» (решение 105; X4 Д2, § 2.3 п. 7) — одна форма для всех связей: «X и Y — родители;
 * Z — сын»; союз целиком — «Иорам и Гофолия — союз: Охозия и ещё 1»; второй родитель не назван, а «его жена» было бы
 * двусмысленно, — «Иорам — отец; Иосавеф — дочь; мать не названа». Союз с одним ребёнком — строкой этого ребёнка.
 */
export function linkRow(key: LinkKey): string {
  if (key.kind !== 'union') return linkTitle(key);
  const u = union(key.union);
  if (!u) return '';
  // брак без детей и союз иного рода («Иаков — приёмный отец: Ефрем, Манассия») — своими словами
  if (!u.kids.length || isClaimUnion(u)) return linkTitle(key);
  if (u.kids.length === 1) return linkTitle({ kind: 'child', union: u.id, child: u.kids[0] });
  const one = u.a ?? u.b;
  const tail = unnamedTail(u);
  const names = tail && one ? nameOf(one) : unionName(u);
  const kids = u.kids.length === 2 ? u.kids.map(midName).join(', ') : `${midName(u.kids[0])} и ещё ${u.kids.length - 1}`;
  return typo(`${names} — союз: ${kids}${tail}`);
}

// ---------- слова ----------

/** Заголовок связи: «Иаков и Рахиль — родители; Иосиф — сын». Пусто — связи нет в данных. */
export const linkTitle = (key: LinkKey): string => linkInfo(key)?.title ?? '';

/** Стихи связи; первым — главное место (его печатает подсказка). */
export const linkRefs = (key: LinkKey): string[] => [...(linkInfo(key)?.refs ?? [])];

/** Концы связи с ролями для колец: сначала старшая сторона (родители, супруг), затем младшая. */
export const linkRoles = (key: LinkKey): LinkEnd[] => [...(linkInfo(key)?.ends ?? [])];

/** Роль лица id в связи; null — лицо не на её конце. */
export const linkRoleOf = (key: LinkKey, id: string): string | null => linkInfo(key)?.ends.find((e) => e.id === id)?.role ?? null;

/** Пометы связи: «пропуск поколений», «у Мф опущен», «только у Луки», «выв.», «толк.». */
export const linkMarks = (key: LinkKey): string[] => [...(linkInfo(key)?.marks ?? [])];

/** Ленты Мессии, которые рисуют связь. */
export const linkLines = (key: LinkKey): LinkLine[] => [...(linkInfo(key)?.lines ?? [])];

/** Есть ли связь в данных (адрес «~c» с битым ключом не открывает карточку). */
export const linkExists = (key: LinkKey): boolean => linkInfo(key) !== null;

/** Ссылка для строки: «1Пар 2:16» → «1 Пар 2:16», диапазон — через тире. */
export const refShort = (ref: string): string => typo(ref.replace(/^([1-4])(\S)/, '$1 $2'));

/** Ссылки подряд, книга не повторяется: «Быт 29:35; 35:23; 1 Пар 2:1». */
export function refsShort(refs: readonly string[]): string {
  let prev = '';
  const out = refs.map((r) => {
    const m = /^(\S+)\s+(.+)$/.exec(r.trim());
    const book = m?.[1] ?? '';
    const t = m && book === prev ? m[2] : r.replace(/^([1-4])(\S)/, '$1 $2');
    prev = book;
    return t;
  });
  return typo(out.join('; '));
}

/** Ссылка для диктора: «Быт 29:35» → «Бытие 29:35», «1Пар 2:1» → «1-я Паралипоменон 2:1». */
export function refSpoken(ref: string): string {
  const m = /^(\S+)\s+(.+)$/.exec(ref.trim());
  const b = m ? BOOKS.find((x) => x.code === m[1]) : undefined;
  return typo(b ? `${b.name} ${m![2]}` : ref);
}

/** Пометы связи без пометы уровня, если уровень уже стоит первым словом заголовка. */
const marksAfterLead = (i: LinkInfo) => (i.lead ? i.marks.filter((m) => m !== CERT_WORD[i.cert]) : i.marks);

/**
 * Подсказка наведения: заголовок, пометы и главный стих — «Иаков и Рахиль — родители; Иосиф — сын (Быт 30:22–24)»,
 * «Арфаксад — отец; Каинан — сын; только у Луки (Лк 3:36)», «По толкованию: Илий — отец; Мария — дочь (Лк 3:23)».
 */
export function linkTip(key: LinkKey): string {
  const i = linkInfo(key);
  if (!i) return '';
  const ms = marksAfterLead(i);
  const marks = ms.length ? `; ${ms.join(', ')}` : '';
  const ref = i.refs[0] ? ` (${refShort(i.refs[0])})` : '';
  return typo(`${i.title}${marks}${ref}`);
}

/**
 * Для диктора: «Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35»; уровень — сразу за словом «Связь»:
 * «Связь — по толкованию: Илий и его жена — родители; Мария — дочь; От Луки 3:23».
 */
export function linkSpeech(key: LinkKey): string {
  const i = linkInfo(key);
  if (!i) return '';
  const ms = marksAfterLead(i);
  const marks = ms.length ? `; ${ms.join(', ')}` : '';
  const ref = i.refs[0] ? `; ${refSpoken(i.refs[0])}` : '';
  const head = i.lead ? `Связь — ${i.lead.toLowerCase()}: ${i.body}` : `Связь: ${i.body}`;
  return typo(`${head}${marks}${ref}`);
}

/**
 * Имя в винительном падеже для команды «показать Илия» — только там, где он совпадает с родительным (одушевлённые
 * мужского рода на согласную, «й», «ь»: «Илия», «Давида», «Иоанна Крестителя»); иначе null — команда без имени.
 * Склонение — только функцией ru.ts (nameCase).
 */
export function accOf(id: string): string | null {
  const p = byId.get(id);
  if (!p || p.unnamed || p.sex !== 'm' || (p.kind && p.kind !== 'person')) return null;
  if (!p.name.split(' ').every((w) => /[бвгджзклмнпрстфхцчшщйь]$/.test(w))) return null;
  return genOf(id);
}

// ---------- основание (решение 105) ----------

/** Предложения текста: по точке, «?» или «!» перед заглавной буквой или кавычкой. */
const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[А-ЯЁ«])/).map((x) => x.trim()).filter(Boolean);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Упоминает ли текст лицо id по имени или другой форме имени (целым словом). */
function names(text: string, id: string): boolean {
  const p = byId.get(id);
  if (!p || p.unnamed) return false;
  return [p.name, ...p.alt].some((n) => n && new RegExp(`(^|[^А-Яа-яЁё])${escRe(n)}([^А-Яа-яЁё]|$)`).test(text));
}
const certOrder = ['interpretation', 'identification', 'textual', 'chronology', 'bracket'];

/**
 * Строка основания карточки связи (решение 105; макет X4 М1): одно предложение — откуда связь, если она не сказана прямо.
 *  — у черты брака — пояснение брака из данных (первое предложение);
 *  — иначе — первое предложение § 24 «Примечания» карточки конца связи, где названо имя другого конца (сперва примечания
 *    толкования, затем отождествления и текстологии): «Первое понимание: Лк 3 — родословие Марии, Илий — Её отец…»;
 *    from — чья это карточка;
 *  — такого предложения нет — слова уровня (ТЗ П-4): «в Писании прямо не сказано; следует из сопоставления стихов» у
 *    вывода, «одно из пониманий текста; в Писании прямо не сказано» у толкования.
 * Писание — null (строки нет). need — концы, чьи карточки ещё не загружены (их загружает карточка связи).
 */
export function linkBasis(key: LinkKey): { text: string; from: string | null; need: string[] } | null {
  const i = linkInfo(key);
  if (!i || !i.lead) return null;
  const generic = { text: i.cert === 'inference' ? 'В Писании прямо не сказано; следует из сопоставления стихов' : 'Одно из пониманий текста; в Писании прямо не сказано', from: null };
  if (key.kind === 'spouse' || (key.kind === 'union' && !i.union?.kids.length)) {
    const n = i.union?.note ? sentences(i.union.note)[0] : null;
    if (n) return { text: n.replace(/[.;]$/, ''), from: null, need: [] };
  }
  // младший конец первым: его § 24 говорит о происхождении («Илий — Её отец» у Марии)
  const ends = [...i.ends.filter((e) => e.side === 'to'), ...i.ends.filter((e) => e.side === 'from')].map((e) => e.id);
  const need = ends.filter((id) => !loadedCard(id));
  for (const id of ends) {
    const notes = [...(loadedCard(id)?.notes ?? [])].sort((a, b) => certOrder.indexOf(a.kind) - certOrder.indexOf(b.kind));
    const others = ends.filter((x) => x !== id);
    for (const n of notes)
      for (const t of sentences(n.text))
        if (others.some((o) => names(t, o))) return { text: t.replace(/[.;]$/, ''), from: id, need };
  }
  return { ...generic, need };
}

/** Союз связи (у шага ленты — союз родителя шага и ребёнка) или null. */
export const linkUnion = (key: LinkKey): Union | null => linkInfo(key)?.union ?? null;

// ---------- фраза родства (этап 14, решение 151) ----------

/** Помета шага линии Мессии в фразе родства: толкование — уровнем, «у Мф опущен», «только у Луки» — как есть. */
const STEP_LEVEL: Record<string, string> = { interpretation: 'толк.', 'omitted-by-mt': 'у Мф опущен', 'luke-only': 'только у Луки' };

/**
 * Пометы связи для фразы родства (решение 151; U6): уровень достоверности («выв.», «толк.») и пометы шага линии Мессии,
 * если связь — её шаг («толк.» у Илия — отца Марии, «только у Луки» у Каинана). «По закону», «по Луке», «приёмный» — не
 * пометы, а часть роли («отец по закону»). Писание — пусто.
 */
export function kinMarks(key: LinkKey): string[] {
  const i = linkInfo(key);
  if (!i) return [];
  const out: string[] = [];
  const add = (m: string | undefined) => {
    if (m && !out.includes(m)) out.push(m);
  };
  add(CERT_WORD[i.cert]);
  for (const l of i.lines) add(STEP_LEVEL[l.flag]);
  return out;
}

/** Одна фраза родства (решение 151): кто (имя и уточнение тёзки), кем приходится, уровень, вне показа ли. */
export interface KinPhrase {
  id: string;
  /** уточнение тёзки (решение 106: у одноимённых в семье) или null */
  dis: string | null;
  /** кем лицо приходится владельцу строки: «жена», «сын по закону», «брат по отцу», «сестра» */
  role: string;
  /** пометы уровня и шага линии: «толк.», «выв.», «только у Луки» */
  marks: string[];
  /** лицо вне нынешнего показа неба */
  outside: boolean;
}

/** Уточнение тёзки — без вложенных скобок: «Мария (Клеопова)», «Седекия (сын Иоакима)». */
export const disText = (id: string): string | null => {
  const d = byId.get(id)?.disambig;
  return d ? typo(d.replace(/\s*\(([^)]*)\)/g, ', $1')) : null;
};

/** Фраза родства лица id в строке «Родства» (роль из строки, пометы — из связи key). */
export function kinPhrase(id: string, role: string, key: LinkKey, o: { namesake?: boolean; outside?: boolean } = {}): KinPhrase {
  return { id, dis: o.namesake ? disText(id) : null, role, marks: kinMarks(key), outside: !!o.outside };
}

/** Хвост фразы: «, толк., вне показа». */
const phraseTail = (ph: KinPhrase) => [...ph.marks, ...(ph.outside ? ['вне показа'] : [])].map((x) => `, ${x}`).join('');

/**
 * Имя кнопки «Родства» и строки карточки связи (решение 151; M7): «Лия — жена», «Илий — отец, толк.», «Мария (Клеопова) —
 * сестра, толк., вне показа». Видимое имя входит в него (WCAG 2.5.3).
 */
export function kinLabel(ph: KinPhrase): string {
  const name = nameOf(ph.id);
  return typo(`${name}${ph.dis ? ` (${ph.dis})` : ''}${ph.role ? ` — ${ph.role}` : ''}${phraseTail(ph)}`);
}

/**
 * Родство к лицу of — для подсказки и списка неба (решение 151): «жена Иакова», «сын Давида, толк.»; имя of не склоняется
 * надёжно — «жена; Иаков» не строится, а пишется «жена (выбрано: Иаков)».
 */
export function kinOf(ph: KinPhrase, of: string): string {
  const g = genOf(of);
  const who = g ? `${ph.role} ${g}` : `${ph.role} (выбрано: ${nameOf(of)})`;
  return typo(`${who}${phraseTail(ph)}`);
}
