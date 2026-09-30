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
import { byId, graph, lines } from '../data/atlas.ts';
import type { Cert, Sex } from '../data/types.ts';
import { BOOKS } from '../engine/books.ts';
import { linkKeyString, type LinkKey } from '../engine/linkkey.ts';
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
  title: string;
  refs: string[];
  ends: LinkEnd[];
  /** союз связи: у «союз → ребёнок», черты брака и союза — сам союз; у шага ленты — союз родителя шага и ребёнка */
  union: Union | null;
  /** худший уровень достоверности связи (П-4) */
  cert: Cert;
  /** пометы: вид шага ленты, пропуск поколений, уровень */
  marks: string[];
  lines: LinkLine[];
  /** пояснение для карточки: «мать не названа в Писании», «родство названо словами Писания; родители не выводятся» */
  note: string | null;
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
  if (!plain || isClaimUnion(u) || peopleUnion(u)) return `${nameOf(one)} — ${roles[0]}`;
  if (unnamedAmbiguous(u, one)) return `${nameOf(one)} — ${roles[0]}, ${u.a ? 'мать не названа' : 'отец не назван'}`;
  return `${unionName(u)} — родители`;
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

/** Дети союза числом: «сын», «3 сына», «6 сыновей и дочь», «2 потомка»; детей нет — «детей не названо». */
export function kidsCount(u: Union): string {
  const n = u.kids.length;
  if (!n) return 'детей не названо';
  if (isClaimUnion(u) && u.claim === 'ancestor') return n === 1 ? 'потомок' : `${n} ${plural(n, 'потомок', 'потомка', 'потомков')}`;
  const girls = u.kids.filter((k) => sexOf(k) === 'f').length;
  const boys = n - girls;
  const s = boys === 1 ? 'сын' : boys ? `${boys} ${plural(boys, 'сын', 'сына', 'сыновей')}` : '';
  const d = girls === 1 ? 'дочь' : girls ? `${girls} ${plural(girls, 'дочь', 'дочери', 'дочерей')}` : '';
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
  return `${parentsText(u)}; ${nameOf(kid)} — ${childRole(u, kid)}`;
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
  const out = build(key);
  if (ks) infoCache.set(ks, out);
  return out;
}

function build(key: LinkKey): LinkInfo | null {
  switch (key.kind) {
    case 'child': {
      const u = union(key.union);
      if (!u || !u.kids.includes(key.child)) return null;
      const kin = kidLink(u, key.child);
      const parents = [u.a, u.b].filter((x): x is string => !!x);
      const marks: string[] = [];
      if (kin.gap) marks.push('пропуск поколений');
      if (CERT_WORD[kin.cert]) marks.push(CERT_WORD[kin.cert]);
      const missing = !isClaimUnion(u) && parents.length === 1 && !peopleUnion(u) ? (u.a ? 'Мать в Писании не названа' : 'Отец в Писании не назван') : null;
      return {
        key,
        title: typo(childTitle(u, key.child)),
        refs: kin.refs.length ? kin.refs : [...u.refs],
        ends: [...parents.map((p) => ({ id: p, role: parentRole(u, p), side: 'from' as const })), { id: key.child, role: childRole(u, key.child), side: 'to' }],
        union: u,
        cert: kin.cert,
        marks,
        lines: linesOf(parents, key.child),
        note: kin.gap ? 'Родословие здесь может пропускать поколения' : missing,
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
        note: coparentsOnly(u) ? COPARENTS_NOTE : other ? (u.note ?? null) : u.a ? 'Имя жены в Писании не названо' : 'Имя мужа в Писании не названо',
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
        note: coparentsOnly(u) ? COPARENTS_NOTE : !isClaimUnion(u) && parents.length === 1 && kids && !peopleUnion(u) ? (u.a ? 'Имя жены в Писании не названо' : 'Имя мужа в Писании не названо') : null,
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
  }
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

/**
 * Подсказка наведения: заголовок, пометы и главный стих — «Иаков и Рахиль — родители; Иосиф — сын (Быт 30:22–24)»,
 * «Арфаксад — отец; Каинан — сын; только у Луки (Лк 3:36)», «Илий — отец; Мария — дочь; толк. (Лк 3:23)».
 */
export function linkTip(key: LinkKey): string {
  const i = linkInfo(key);
  if (!i) return '';
  const marks = i.marks.length ? `; ${i.marks.join(', ')}` : '';
  const ref = i.refs[0] ? ` (${refShort(i.refs[0])})` : '';
  return typo(`${i.title}${marks}${ref}`);
}

/** Для диктора: «Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35». */
export function linkSpeech(key: LinkKey): string {
  const i = linkInfo(key);
  if (!i) return '';
  const marks = i.marks.length ? `; ${i.marks.join(', ')}` : '';
  const ref = i.refs[0] ? `; ${refSpoken(i.refs[0])}` : '';
  return typo(`Связь: ${i.title}${marks}${ref}`);
}

/** Союз связи (у шага ленты — союз родителя шага и ребёнка) или null. */
export const linkUnion = (key: LinkKey): Union | null => linkInfo(key)?.union ?? null;
