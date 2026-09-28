/**
 * Содержимое разделов 1–24 карточки лица (ТЗ § 3.3): каждый раздел — абзацы и списки, собранные из данных.
 * Как разделы стоят на листе (заголовки в строку, предел 8 строк, пустые разделы) — src/ui/Folio.tsx, CardPage.
 *
 * Правила этапа 5 (docs/ui-review/README.md, F):
 * — раздел не повторяет шапку: § 1 говорит об одноимённых, § 5 — без строки ролей, § 7 — без строки колена (F5);
 * — пояснения, общие для нескольких записей, сводятся в одно; заметка составителя, которая повторяет строку,
 *   встаёт под эту строку, а пересказ строк целиком не выводится (F5; CARD-20);
 * — § 10 — внуки при родителях, значимые первыми; § 11 — единокровные группой; § 6 и § 12 — вычисляемая
 *   вторая степень родства с пометой «выв.» (F6);
 * — § 14 — имя лица встречи в самом тексте, § 15 — места по роли, § 16 — без повтора царствований (F7);
 * — имена лиц в тексте фактов — ссылки (F12).
 */
import { Fragment, type ComponentChildren, type VNode } from 'preact';
import { useState } from 'preact/hooks';
import { byId, graph, lineMembership, persons, loadedCard } from '../../data/atlas.ts';
import type { Card, Chrono, Fact, Cert, Role, Reign, Place } from '../../data/types.ts';
import type { ModelData, ChronoRow } from '../../data/atlas.ts';
import { P, Refs, VerseInsert, Mark, MarkNote, MARK_FULL, CERT_FULL, plural } from '../common.tsx';
import { siblings, type ParentEdge } from '../../engine/graph.ts';
import { formatSpan, formatYear, shownYears, yearsWord } from '../../engine/years.ts';
import { contemporaries, type ChronoResult, type PersonChrono } from '../../engine/chronology.ts';
import { relate } from '../../engine/kinship.ts';
import { compareRefs, parseRef } from '../../engine/books.ts';
import { firstRef } from './Brief.tsx';
import { affiliation, deathLine, SeeSec } from './shared.tsx';
import {
  bySex, capFirst, lowerFirst, nameCase, splitKinTerm, kinTermIns, kinTermReverse, ownSpouseDat, otherParentLabel, otherChildLabel,
  altKindLabel, reignTitle, MESSIAH_BIRTH, leadingNumber, pluralPeopleName, childrenNoun, unnamedParentLabel, descendantsNoun, peoplesLabel,
  countGen, halfSiblingsLabel, derivedKinLabel, placeRoleLabel, KIN_TERM_QUOTED,
} from '../text/ru.ts';
import { typo, typoTree } from '../text/typo.ts';
import { addSeen, newPart, stemsOf } from '../text/repeat.ts';
import { CanonStrip } from './Canon.tsx';
import { Clamp } from './Clamp.tsx';
import { BirthLine, RelativeChrono, YearMark } from './Chrono.tsx';
import { candidateFor, linkCandidates, linkNames, mentionsPerson, type LinkCand } from './links.tsx';

type AtlasPerson = NonNullable<ReturnType<typeof byId.get>>;

export const SECTIONS: { n: number; part: number; title: string }[] = [
  { n: 1, part: 1, title: 'Имя' },
  { n: 2, part: 1, title: 'Имя в подлиннике' },
  { n: 3, part: 1, title: 'Значение имени' },
  { n: 4, part: 1, title: 'Другие имена' },
  { n: 5, part: 1, title: 'Роль и положение' },
  { n: 6, part: 2, title: 'Родители' },
  { n: 7, part: 2, title: 'Род, колено, народ' },
  { n: 8, part: 2, title: 'Рождение' },
  { n: 9, part: 3, title: 'Супруги' },
  { n: 10, part: 3, title: 'Дети' },
  { n: 11, part: 3, title: 'Братья и сёстры' },
  { n: 12, part: 3, title: 'Иное родство' },
  { n: 13, part: 4, title: 'Эпоха и относительная хронология' },
  { n: 14, part: 4, title: 'Современники' },
  { n: 15, part: 5, title: 'Места' },
  { n: 16, part: 5, title: 'Занятие и служение' },
  { n: 17, part: 5, title: 'Жизнеописание' },
  { n: 18, part: 5, title: 'Слова' },
  { n: 19, part: 5, title: 'Перед Богом' },
  { n: 20, part: 5, title: 'Смерть и погребение' },
  { n: 21, part: 6, title: 'В родословии Мессии' },
  { n: 22, part: 6, title: 'Упоминания в других книгах' },
  { n: 23, part: 6, title: 'Места Писания' },
  { n: 24, part: 6, title: 'Примечания' },
];
export const PARTS = ['', 'I. Личность', 'II. Происхождение', 'III. Семья', 'IV. Время', 'V. Жизнь', 'VI. Наследие'];

/** Термины Писания «брат», «сестра» (в т. ч. «брат по отцу»). */
const SIBLING_KIN = /^(брат|сестра)(?![а-яё])/i;

/** Модель ChronoResult поверх данных выбранной модели (для «современников»); одна на модель. */
const resultCache = new WeakMap<ModelData, ChronoResult>();
function asResult(m: ModelData): ChronoResult {
  const have = resultCache.get(m);
  if (have) return have;
  const personsMap = new Map<string, PersonChrono>();
  for (const [id, c] of m.chrono) personsMap.set(id, {
      b: c.b, bLo: c.bLo, bHi: c.bHi, d: c.d, dLo: c.dLo, dHi: c.dHi, lastAttested: c.last, dEst: c.dEst, cls: c.cls, epoch: c.epoch,
      // народ или род (решение 23): без named «современники» (engine/chronology.ts, contemporaries) считали бы его лицом
      named: c.named, byOrder: c.byOrder, when: c.when, infant: c.infant,
    });
  const res: ChronoResult = { model: m.id as never, persons: personsMap, tensions: m.tensions };
  resultCache.set(m, res);
  return res;
}

/** Есть ли что показать: непустой список или истинное значение (не число: `a.length && …` даёт голый «0»). */
const has = (...xs: unknown[]) => xs.some((x) => (Array.isArray(x) ? x.length > 0 : typeof x === 'string' ? x.trim() !== '' : typeof x === 'number' ? false : !!x));

/** Пустое содержимое раздела: null, false, числа, пустые строки, пустые списки и фрагменты из пустого. */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'number') return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every(isEmpty);
  if (typeof v === 'object' && (v as VNode).type === Fragment) return isEmpty((v as VNode<{ children?: unknown }>).props.children);
  return false;
}

/** Число лиц с каждым именем: одноимённых различает уточнение. */
const nameCount = (() => {
  const m = new Map<string, string[]>();
  for (const q of persons) m.set(q.name, [...(m.get(q.name) ?? []), q.id]);
  return m;
})();

/** Ссылка на лицо в строке после двоеточия или в перечне: безымянное («Дочь фараонова») — со строчной. */
function PT({ id }: { id: string }) {
  const q = byId.get(id);
  return <P id={id}>{q ? (q.unnamed ? lowerFirst(q.name) : q.name) : id}</P>;
}

/**
 * Знак препинания сразу за ссылкой на лицо держится за неё. Кнопка — строчный блок, и перед знаком браузер переносит
 * строку даже без пробела: в перечне «Шеломиф» / «, Маинан» запятая уходила в начало строки (B4, B5).
 */
function Glued({ after, children }: { after?: ComponentChildren; children: ComponentChildren }) {
  return after ? (
    <span class="nobr">
      {children}
      {after}
    </span>
  ) : (
    <>{children}</>
  );
}

/** Уточнение одноимённого в скобках: «Мария (Клеопова)»; скобки внутри уточнения — через запятую. */
const disambigText = (id: string) => typo(byId.get(id)!.disambig.replace(/\s*\(([^)]*)\)/g, ', $1'));

/**
 * Ссылка на лицо с уточнением: «Мария (Клеопова)». dis — показать уточнение (по умолчанию — если в атласе есть одноимённые).
 * after — знак препинания, который идёт следом («,» в перечне).
 */
function PN({ id, lower = false, dis, after }: { id: string; lower?: boolean; dis?: boolean; after?: string }) {
  const q = byId.get(id);
  const show = !!q?.disambig && (dis ?? (nameCount.get(q.name)?.length ?? 0) > 1);
  const link = lower ? <PT id={id} /> : <P id={id} />;
  if (!show) return <Glued after={after}>{link}</Glued>;
  return (
    <>
      {link}
      <span class="muted">
        {' '}({disambigText(id)}){after}
      </span>
    </>
  );
}

/**
 * Одноимённые в одном разделе (§ 9–12): лица, чьё имя совпадает с именем владельца карточки или другого лица раздела.
 * Их называют с уточнением, иначе «Мария — сестра» у Марии читается как «сестра самой себе».
 */
function namesakesIn(ownerId: string, ids: string[]): Set<string> {
  const owner = byId.get(ownerId)!.name;
  const count = new Map<string, number>();
  for (const x of new Set(ids)) {
    const n = byId.get(x)?.name;
    if (n) count.set(n, (count.get(n) ?? 0) + 1);
  }
  return new Set(
    ids.filter((x) => {
      const n = byId.get(x)?.name;
      return !!n && (n === owner || (count.get(n) ?? 0) > 1);
    }),
  );
}

/** Ссылка на лицо в косвенном падеже; null — если имя не склоняется надёжно (строку тогда строят иначе). */
function caseLink(id: string, cs: 'gen' | 'dat' | 'ins'): ComponentChildren | null {
  const q = byId.get(id);
  // иные формы имени из данных помогают склонению: «Далуиа» — «Далуии» (L8a)
  const f = q ? nameCase(q.name, q.sex, cs, q.unnamed, q.alt) : null;
  return f ? <P id={id}>{f}</P> : null;
}

const direct = (e: ParentEdge) => e.kind === 'father' || e.kind === 'mother';
/** Прямая кровная связь, записанная Писанием или выведенная (не толкование и не «по закону»). */
const plainLink = (e: ParentEdge) => direct(e) && e.cert !== 'interpretation' && e.claim !== 'legal';
const kidsOf = (x: string) => [...new Set((graph.childrenOf.get(x) ?? []).filter(direct).map((e) => e.child))];
const sexesOf = (ids: string[]) => ids.map((x) => byId.get(x)!.sex);

/** Лица, названные в семейных разделах карточки (§ 6, 9–12): их не повторяют «Современники». */
export function familyIds(id: string): Set<string> {
  const out = new Set<string>();
  for (const e of graph.parentsOf.get(id) ?? []) out.add(e.parent);
  for (const s of graph.spousesOf.get(id) ?? []) out.add(s.a === id ? s.b : s.a);
  for (const e of graph.childrenOf.get(id) ?? []) out.add(e.child);
  const grand = [...new Set(kidsOf(id).flatMap(kidsOf))];
  for (const g of grand) {
    out.add(g);
    for (const gg of kidsOf(g)) out.add(gg);
  }
  for (const s of siblings(graph, id)) out.add(s.id);
  for (const k of graph.kinOf.get(id) ?? []) out.add(k.from === id ? k.to : k.from);
  for (const r of derivedKin(id)) for (const x of r.ids) out.add(x);
  out.delete(id);
  return out;
}

/**
 * Родня в пределах четырёх шагов по связям «родитель — ребёнок»: деды, дяди, двоюродные, внучатые.
 * Брак — только первым шагом (родня супруга: тесть, шурин) или последним (супруги родни: невестка, зять);
 * поэтому другие жёны мужа и родня свойственников в родню не попадают.
 */
function nearKin(id: string, depth = 4): Map<string, boolean> {
  const up = (x: string) => (graph.parentsOf.get(x) ?? []).filter(direct).map((e) => e.parent);
  const down = (x: string) => (graph.childrenOf.get(x) ?? []).filter(direct).map((e) => e.child);
  const wed = (x: string) => (graph.spousesOf.get(x) ?? []).map((s) => (s.a === x ? s.b : s.a));
  const kinSib = (x: string) => (graph.kinOf.get(x) ?? []).filter((k) => SIBLING_KIN.test(k.rel)).map((k) => (k.from === x ? k.to : k.from));
  // кровный путь идёт вверх к общему предку, затем вниз (вверх после спуска — это уже другой родитель ребёнка, не родня);
  // фаза: 0 — только кровные шаги; 1 — путь начался с брака; 2 — закончился браком
  type St = { x: string; ph: number; down: boolean };
  const seen = new Set<string>();
  // лицо → родство только через брак (свойство): «свойственник»
  const out = new Map<string, boolean>();
  let front: St[] = [{ x: id, ph: 0, down: false }];
  for (let d = 0; d < depth; d++) {
    const next: St[] = [];
    const step = (s: St) => {
      const key = `${s.x}|${s.ph}|${s.down}`;
      if (s.x === id || seen.has(key)) return;
      seen.add(key);
      out.set(s.x, (out.get(s.x) ?? true) && s.ph !== 0);
      if (s.ph !== 2) next.push(s);
    };
    for (const s of front) {
      if (!s.down) for (const y of up(s.x)) step({ x: y, ph: s.ph, down: false });
      // брат или сестра по слову Писания без общих родителей в данных (Саруия — сестра Давида, 1 Пар 2:16): шаг вбок,
      // после него — вверх к их родителям и вниз к детям (Иоав — племянник Давида, CARD-55)
      if (!s.down) for (const y of kinSib(s.x)) step({ x: y, ph: s.ph, down: false });
      for (const y of down(s.x)) step({ x: y, ph: s.ph, down: true });
      if (s.ph === 0) for (const y of wed(s.x)) step({ x: y, ph: d === 0 ? 1 : 2, down: s.down });
    }
    front = next;
  }
  return out;
}

/** Лица в пределах depth шагов по любым связям: родитель, ребёнок, брак, слово Писания. */
function nearAll(id: string, depth: number): Set<string> {
  const seen = new Set([id]);
  let front = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const x of front) {
      const ys = [
        ...(graph.parentsOf.get(x) ?? []).map((e) => e.parent),
        ...(graph.childrenOf.get(x) ?? []).map((e) => e.child),
        ...(graph.spousesOf.get(x) ?? []).map((s) => (s.a === x ? s.b : s.a)),
        ...(graph.kinOf.get(x) ?? []).map((k) => (k.from === x ? k.to : k.from)),
      ];
      for (const y of ys) if (!seen.has(y)) (seen.add(y), next.push(y));
    }
    front = next;
  }
  seen.delete(id);
  return seen;
}

/** «Правители» § 14 — только царь, судья и иноземный правитель (CARD-55): не царица-мать, не князь колена. */
const RULERS = new Set<Role>(['king', 'judge', 'foreign-ruler']);
const CLERGY = new Set<Role>(['high-priest', 'priest', 'prophet']);
const CON_GROUPS = ['Правители', 'Священники и пророки', 'Родня', 'Другие'] as const;
/** «Другие» — не больше восьми лиц, звёзды не тусклее третьей величины, без народов (CARD-55). */
const OTHERS_MAX = 8;

/** Связь с лицом, о которой говорит текст, а не расчёт (§ 14; CARD-55). */
export type TextLink =
  | { kind: 'met-by'; id: string; text?: string; refs: string[] }
  | { kind: 'co-spouse'; ids: string[]; spouse: string; refs: string[] };

/** Пул лиц, среди которых ищутся встречи, записанные у них: все, кто по расчёту жил в то же время. */
function contemporaryPool(id: string, m: ModelData): string[] {
  const c = m.chrono.get(id);
  const p = byId.get(id);
  if (!c || c.cls === 'epochal' || !p || p.kind === 'people' || p.kind === 'clan') return [];
  return contemporaries(asResult(m), id, 400).map((x) => x.id);
}

/**
 * Связи из текста, которых нет в своей карточке лица:
 * — встреча, записанная в карточке другого лица («Андрей — пробыл у Него день тот; призван Им», Ин 1:37–40): при сборке
 *   она переписана в карточку владельца (card.metBy), поэтому § 14 одинаков при любом порядке загрузки томов;
 * — другие жёны того же мужа, другие мужья той же жены (Астинь и Есфирь, Есф 2:17; Махлон и Вооз, Руф 4:10).
 */
export function textLinks(id: string, _pool: string[] = []): TextLink[] {
  const out: TextLink[] = [];
  const card = loadedCard(id);
  const own = new Set((card?.met ?? []).map((x) => x.id));
  for (const mt of card?.metBy ?? []) if (!own.has(mt.id) && byId.has(mt.id)) out.push({ kind: 'met-by', id: mt.id, text: mt.text, refs: mt.refs });
  // другие жёны того же мужа — только у женщин: у мужчины прежний или следующий муж жены назван в § 9
  const me = byId.get(id);
  for (const s of me?.sex === 'f' ? (graph.spousesOf.get(id) ?? []) : []) {
    const spouse = s.a === id ? s.b : s.a;
    const others = (graph.spousesOf.get(spouse) ?? []).map((t) => (t.a === spouse ? t.b : t.a)).filter((x) => x !== id && !byId.get(x)?.unnamed);
    if (!others.length) continue;
    const refs = [...new Set((graph.spousesOf.get(spouse) ?? []).filter((t) => others.includes(t.a === spouse ? t.b : t.a)).flatMap((t) => t.refs))].slice(0, 3);
    out.push({ kind: 'co-spouse', ids: [...new Set(others)], spouse, refs });
  }
  return out;
}
const linkIdsOf = (ls: TextLink[]) => new Set(ls.flatMap((l) => (l.kind === 'met-by' ? [l.id] : l.ids)));

/**
 * «Современники» (§ 14) по группам: сначала те, кто по расчёту жил в то же время наверняка, затем «вероятно».
 * Без семьи из § 6, 9–12, без тех, о встрече с кем говорит Писание (своя карточка и чужие), и без народов.
 * Родня любой степени — только в «Родне», никогда не в «Других» (решение 19; CARD-55).
 */
export function contemporaryGroups(id: string, m: ModelData, family: Set<string>, met: Set<string>, limit = 16): { sure: boolean; label: string; ids: string[] }[] {
  const p = byId.get(id);
  if (!p || p.kind === 'people' || p.kind === 'clan') return [];
  const kin = kinSet(id);
  const linked = linkIdsOf(textLinks(id, contemporaryPool(id, m)));
  const ruler = (x: string) => {
    const q = byId.get(x)!;
    return q.roles.some((k) => RULERS.has(k)) || q.reign.length > 0;
  };
  const groupOf = (x: string): (typeof CON_GROUPS)[number] => {
    if (kin.has(x)) return 'Родня';
    if (ruler(x)) return 'Правители';
    if (byId.get(x)!.roles.some((k) => CLERGY.has(k))) return 'Священники и пророки';
    return 'Другие';
  };
  const con = contemporaries(asResult(m), id, 120).filter((x) => {
    const q = byId.get(x.id)!;
    if (family.has(x.id) || met.has(x.id) || q.kind === 'people' || q.kind === 'clan') return false;
    // связанные текстом — во «Встречах и связях»; родня остаётся в «Родне» (со словом степени)
    if (linked.has(x.id) && !kin.has(x.id)) return false;
    // родня — только та, чью степень называет калькулятор родства («племянник», «шурин»), при любой яркости звезды;
    // родня без названной степени не попадает ни в «Родню», ни в «Других»; «Другие» — не тусклее третьей величины
    if (kin.has(x.id)) return kinWord(x.id, id) !== null;
    return q.magnitude <= (groupOf(x.id) === 'Другие' ? 3 : 4);
  });
  const out: { sure: boolean; label: string; ids: string[] }[] = [];
  let left = limit;
  let others = OTHERS_MAX;
  for (const sure of [true, false])
    for (const label of CON_GROUPS) {
      let ids = con.filter((x) => x.sure === sure && groupOf(x.id) === label).map((x) => x.id);
      if (label !== 'Родня') ids = ids.slice(0, Math.max(0, label === 'Другие' ? Math.min(left, others) : left));
      if (label === 'Другие') others -= ids.length;
      if (label !== 'Родня') left -= ids.length;
      if (ids.length) out.push({ sure, label, ids });
    }
  return out;
}

/**
 * Кем родственник приходится владельцу карточки — словом калькулятора родства: «племянник», «шурин», «дед (по закону)».
 * null — степень не называется (путь с пропуском поколений, свойство дальше одного брака): такое лицо не попадает
 * ни в «Родню», ни в «Других».
 */
const kinWords = new Map<string, string | null>();
function kinWord(x: string, owner: string): string | null {
  const key = `${x}>${owner}`;
  if (kinWords.has(key)) return kinWords.get(key)!;
  const w = kinWordOf(x, owner);
  kinWords.set(key, w);
  return w;
}
function kinWordOf(x: string, owner: string): string | null {
  return kinDegree(x, owner)?.word ?? null;
}

/**
 * Родство лица x с владельцем карточки для «Родни» § 14 (CARD-80; решение 62): слово степени и близость — сумма поколений
 * вверх и вниз по пути. Предок дальше прапрапрадеда — «предок в 9-м поколении» (Сим у Авраама); брат или сестра предка —
 * «брат Сима, предка в 9-м поколении» (Хам, Иафет). null — степень не называется: путь с пропуском поколений или
 * общий предок слишком далеко.
 */
const kinDegrees = new Map<string, { word: string; dist: number } | null>();
export function kinDegree(x: string, owner: string): { word: string; dist: number } | null {
  const key = `${x}>${owner}`;
  if (kinDegrees.has(key)) return kinDegrees.get(key)!;
  const d = kinDegreeOf(x, owner);
  kinDegrees.set(key, d);
  return d;
}
function kinDegreeOf(x: string, owner: string): { word: string; dist: number } | null {
  // из путей — ближайший: у Елисаветы, жены Аарона, в карточке Моисея — «невестка», а не дальнее кровное родство
  const all = relate(graph, x, owner, 64)
    .filter((y) => y.kind !== 'spouse')
    .map((y) => {
      const d = degreeOf(y, x);
      // путь через усыновление (Ефрем и Манассия — сыновья Иакова, Быт 48:5) — после кровного
      return d && y.steps.some((st) => st.claim === 'adoptive') ? { ...d, dist: d.dist + 2 } : d;
    })
    .filter((d): d is { word: string; dist: number } => d !== null);
  return all.sort((a, b) => a.dist - b.dist)[0] ?? null;
}
function degreeOf(r: ReturnType<typeof relate>[number], x: string): { word: string; dist: number } | null {
  const q = (w: string) => w + (r.interpretive ? ' (по толкованию)' : r.legal ? ' (по закону)' : '');
  let t = r.term ?? '';
  const dist = r.kind === 'blood' ? r.up + r.down : r.kind === 'in-law' ? 3 : 2;
  if (r.kind === 'blood' && r.lineal && !r.open && /колене/.test(t)) t = t.replace(/\s*(во?)\s*(\d+)-м колене/, ' в $2-м поколении');
  else if (r.kind === 'blood' && !r.lineal && !r.open && r.up === 1 && r.down >= 3 && (!t || /^родственни/.test(t))) {
    // брат или сестра предка: цепочка x → общий предок → предок владельца (chain[2]) → … → владелец
    const anc = r.chain[2]?.id;
    const a = anc ? byId.get(anc) : null;
    const g = a ? nameCase(a.name, a.sex, 'gen', false, a.alt) : null;
    const n = r.down - 1;
    const who = byId.get(x)!.sex === 'f' ? 'сестра' : 'брат';
    t = g ? `${who} ${g}, ${a!.sex === 'f' ? 'прародительницы' : 'предка'} в ${n}-м поколении` : `${who} предка в ${n}-м поколении`;
  }
  if (!t || t.length > 60 || /колене/.test(t) || (r.kind !== 'kin' && /^родственни/.test(t))) return null;
  return { word: q(t), dist };
}

/**
 * Родня для «Современников»: в пределах четырёх шагов (nearKin), все предки владельца и их братья и сёстры —
 * кровное родство любой степени, а не «Другие» (CARD-80).
 */
function kinSet(id: string): Map<string, boolean> {
  const out = nearKin(id);
  const up = (x: string) => (graph.parentsOf.get(x) ?? []).filter(direct).map((e) => e.parent);
  const seen = new Set<string>();
  let front = up(id);
  while (front.length) {
    const next: string[] = [];
    for (const a of front) {
      if (seen.has(a)) continue;
      seen.add(a);
      if (!out.has(a)) out.set(a, false);
      for (const par of up(a)) {
        next.push(par);
        for (const sib of kidsOf(par)) if (sib !== a && !out.has(sib)) out.set(sib, false);
      }
    }
    front = next;
  }
  out.delete(id);
  return out;
}

/** § 9 с первой строкой «Жёны: …» — у мужчины с тремя и больше жёнами (CARD-93). */
const summaryOf = (sex: 'm' | 'f', n: number) => sex === 'm' && n >= 3;
/** «зять (по толкованию Лк 3:23)» → «зять». */
const bareRel = (rel: string) => rel.replace(/\s*\(.*\)\s*$/, '').trim();
/** Слово родства во множественном числе: «сестра по отцу» → «сёстры по отцу». */
const pluralKin = (t: string) => t.replace(/^сестра/, 'сёстры').replace(/^брат(?![а-яё])/, 'братья');
/**
 * Подпись группы братьев и сестёр (CARD-84): «Братья», «Сестра», «Брат и сестра»; у родных по обоим родителям —
 * «Родной брат», «Родные братья и сёстры».
 */
function siblingsLabel(sexes: ('m' | 'f')[], full: boolean): string {
  const m = sexes.filter((x) => x === 'm').length;
  const f = sexes.length - m;
  const noun = m && f ? (m === 1 && f === 1 ? 'брат и сестра' : m === 1 ? 'брат и сёстры' : f === 1 ? 'братья и сестра' : 'братья и сёстры') : m ? (m > 1 ? 'братья' : 'брат') : f > 1 ? 'сёстры' : 'сестра';
  if (!full) return capFirst(noun);
  const adj = sexes.length > 1 ? 'Родные' : m ? 'Родной' : 'Родная';
  return `${adj} ${noun}`;
}
/** «Жёны», «Жена», «Наложницы» — подпись первой строки § 9 (CARD-93). */
const spouseKindLabel = (k: 'wife' | 'concubine', n: number) => (k === 'wife' ? (n > 1 ? 'Жёны' : 'Жена') : n > 1 ? 'Наложницы' : 'Наложница');

// ---------- § 14: современники (CARD-80; решения 19, 62) ----------

/** Строка «Встреч»: у каждой — слова события и стихи (встреча без слов о событии не выводится). */
export type MeetRow =
  | { kind: 'met'; id: string; text: string; refs: string[] }
  | { kind: 'event'; ids: string[]; text: string; refs: string[] }
  | { kind: 'met-by'; ids: string[]; text: string; refs: string[] }
  | { kind: 'co-spouse'; ids: string[]; spouse: string; refs: string[] };
export type Sec14 = {
  rows: MeetRow[];
  /** родня третьей степени и дальше, свойственники: слово степени и близость */
  kin: { id: string; word: string; dist: number }[];
  calc: { sure: boolean; label: string; ids: string[] }[];
};

/** Части записи через «;», которые называют лиц: слова события без остального рассказа. */
function clausesNaming(text: string, ids: string[]): string {
  const parts = text.split(/;\s+/);
  const hit = parts.map((t) => ids.some((x) => mentionsPerson(t, x)));
  const a = hit.indexOf(true);
  const b = hit.lastIndexOf(true);
  // от первой части с именем до последней: без середины «её» в «после смерти Навала взял её в жёны» потеряло бы Авигею
  return a < 0 ? text : parts.slice(a, b + 1).join('; ');
}

/** Стихи двух списков ссылок пересекаются (по стихам; ссылка без стихов — по главе). */
function sameVerse(a: string[], b: string[]): boolean {
  const keys = (refs: string[]) => {
    const out = new Set<string>();
    for (const r of refs) {
      const p = parseRef(r);
      if (p && p.verses.length) for (const v of p.verses) out.add(`${v.book} ${v.chapter}:${v.verse}`);
      else out.add(chapterOf(r));
    }
    return out;
  };
  const x = keys(a);
  const y = keys(b);
  for (const k of x) if (y.has(k)) return true;
  // ссылка на главу целиком или межглавный промежуток — по главе
  const ch = (s: Set<string>) => new Set([...s].map((k) => refKey(k).replace(/:.*$/, '')));
  const cy = ch(y);
  return [...x].some((k) => !k.includes(':') && cy.has(k)) || [...y].some((k) => !k.includes(':') && ch(x).has(k));
}

const cache14 = new Map<string, Sec14 | null>();
/**
 * Разделы § 14 одного лица:
 * — «Встречи»: свои встречи со словами (met), встречи, записанные у других лиц (met-by, одинаковые — одной строкой),
 *   лица, названные в записях § 17–20 владельца (event: слова события — часть записи через «;», где они названы),
 *   другие жёны того же мужа;
 * — родня дальше второй степени — словом степени, по близости (первая и вторая — в § 6, 10–12);
 * — остальные современники по расчёту.
 */
export function section14(id: string, m: ModelData, card: Card | null): Sec14 | null {
  const p = byId.get(id);
  if (!p || p.kind === 'people' || p.kind === 'clan') return null;
  const key = `${id}|${m.id}|${card ? 1 : 0}`;
  if (cache14.has(key)) return cache14.get(key)!;
  if (cache14.size > 4000) cache14.clear();
  const met = card?.met ?? [];
  const pool = contemporaryPool(id, m);
  const family = familyIds(id);
  const rows: MeetRow[] = [];
  const shown = new Set<string>();
  // свои встречи со словами события
  for (const mt of met) {
    // своя встреча со словами — и с родным (Саул — тесть Давида: «служил при нём; дважды пощадил его»)
    if (!mt.text?.trim()) continue;
    rows.push({ kind: 'met', id: mt.id, text: mt.text, refs: mt.refs });
    shown.add(mt.id);
  }
  const links = textLinks(id, pool);
  // встречи, записанные у других лиц, — со словами; одинаковые слова и стихи — одной строкой (CARD-81)
  const byWords = new Map<string, { ids: string[]; text: string; refs: string[] }>();
  for (const l of links) {
    if (l.kind !== 'met-by' || !l.text?.trim() || family.has(l.id) || shown.has(l.id)) continue;
    const k = `${l.text}|${l.refs.join(',')}`;
    const g = byWords.get(k) ?? { ids: [], text: l.text, refs: l.refs };
    g.ids.push(l.id);
    byWords.set(k, g);
  }
  const metBy = [...byWords.values()];
  for (const g of metBy) for (const x of g.ids) shown.add(x);
  // лица, названные в записях § 17–20 владельца, — со словами события (CARD-80): «Предан Понтию Пилату…» (Мф 27:1–2)
  // встреча без слов (своя или записанная у другого лица) — словами записи владельца на том же стихе
  const bareRefs = new Map<string, string[]>();
  for (const mt of met) if (!mt.text?.trim()) bareRefs.set(mt.id, mt.refs);
  for (const l of links) if (l.kind === 'met-by' && !l.text?.trim()) bareRefs.set(l.id, l.refs);
  const cand = [...new Set([...pool, ...bareRefs.keys()])].filter((x) => x !== id && !family.has(x) && !shown.has(x) && byId.get(x)?.kind !== 'people' && byId.get(x)?.kind !== 'clan' && !byId.get(x)?.unnamed);
  // имя определяет лицо, только если его основа не общая с другим лицом окружения: «Иоанна» — и Иоанн, и Иоанна;
  // «Илия» и «Илий» — одна основа
  const stemKey = (f: string) => f.split(' ').map((w) => (w.length > 3 && /[аяйьоеиыу]$/.test(w) ? w.slice(0, -1) : w)).join(' ');
  const owners = new Map<string, Set<string>>();
  const env = new Set([...cand, ...family, id, ...met.map((mt) => mt.id), ...links.flatMap((l) => (l.kind === 'met-by' ? [l.id] : l.ids)), ...linkCandidates(id).map((c) => c.id)]);
  for (const x of env) for (const f of candidateFor(x).stems) owners.set(stemKey(f), (owners.get(stemKey(f)) ?? new Set()).add(x));
  const forms: LinkCand[] = cand
    .map((x) => ({ id: x, stems: candidateFor(x).stems.filter((f) => owners.get(stemKey(f))!.size === 1) }))
    .filter((c) => c.stems.length);
  // только записи, прямо сказанные в Писании: «Вероятно, один из трёх…» (вывод) — не встреча
  const records: { text: string; refs: string[] }[] = [...(card?.events ?? []), ...(card?.withGod ?? []), ...(card?.death?.facts ?? []), ...(card?.death?.burial ?? [])].filter((r) => r.refs.length && (r.cert ?? 'scripture') === 'scripture');
  const low = (t: string) => t.toLowerCase().replace(/ё/g, 'е');
  // имя при слове родства («на поле Ефрона, сына Цохара») — родословная справка, а не встреча
  const KIN_BEFORE = /(сын|сына|сыну|сыном|сыновей|дочь|дочери|отца|отец|отцу|мать|матери|внук|внука)\s+$/i;
  const named = (t: string, c: LinkCand) => {
    const v = linkNames(t, [c]);
    if (!Array.isArray(v)) return false;
    const at = low(t).indexOf(c.stems.map((f) => stemKey(f).split(' ')[0]).find((st) => low(t).includes(st)) ?? '\u0000');
    return at < 0 || !KIN_BEFORE.test(t.slice(0, at));
  };
  const eventIds = new Set<string>();
  for (const r of records) {
    const lt = low(r.text);
    const here = new Set<string>();
    for (const c of forms) if (!eventIds.has(c.id) && c.stems.some((f) => lt.includes(stemKey(f).split(' ')[0])) && named(r.text, c)) here.add(c.id);
    for (const [x, refs] of bareRefs)
      if (!eventIds.has(x) && cand.includes(x) && sameVerse(refs, r.refs) && mentionsPerson(r.text, x)) here.add(x);
    if (!here.size) continue;
    const ids = [...here];
    for (const x of ids) eventIds.add(x);
    rows.push({ kind: 'event', ids, text: clausesNaming(r.text, ids), refs: r.refs });
  }
  for (const x of eventIds) shown.add(x);
  for (const g of metBy) rows.push({ kind: 'met-by', ...g });
  // другие жёны того же мужа — стихи браков тех, кто в строке остался
  for (const l of links) {
    if (l.kind !== 'co-spouse') continue;
    const ids = l.ids.filter((x) => !family.has(x) && !shown.has(x));
    if (!ids.length) continue;
    const refs = [...new Set((graph.spousesOf.get(l.spouse) ?? []).filter((t) => ids.includes(t.a === l.spouse ? t.b : t.a)).flatMap((t) => t.refs))].slice(0, 3);
    rows.push({ kind: 'co-spouse', ids, spouse: l.spouse, refs });
    for (const x of ids) shown.add(x);
  }
  // по расчёту: родня — отдельно, словом степени; лица встреч — не повторяются
  const groups = pool.length ? contemporaryGroups(id, m, family, shown) : [];
  const kin = [...new Set(groups.filter((g) => g.label === 'Родня').flatMap((g) => g.ids))]
    .map((x) => ({ id: x, ...kinDegree(x, id)! }))
    .filter((x) => !!x.word)
    .sort((a, b) => a.dist - b.dist || (byId.get(a.id)!.magnitude ?? 6) - (byId.get(b.id)!.magnitude ?? 6));
  const calc = groups.filter((g) => g.label !== 'Родня');
  const out: Sec14 = { rows, kin, calc };
  cache14.set(key, out);
  return out;
}

/** Лица § 14, видимые без раскрытия «ещё N» (для проверок: одноимённые среди них — с уточнением). */
export function visible14(d: Sec14): string[] {
  const kin = d.kin.length <= KIN_FLAT_MAX ? d.kin.slice(0, KIN_SHOW).map((x) => x.id) : [...groupBy(d.kin, (x) => x.word).values()].flatMap((xs) => xs.slice(0, xs.length > KIN_SHOW + 1 ? KIN_SHOW : xs.length).map((x) => x.id));
  return [...kin, ...d.calc.flatMap((g) => g.ids.slice(0, g.ids.length > 17 ? 16 : g.ids.length))];
}

/** Слово степени во множественном числе для группы: «двоюродный брат» → «двоюродные братья». */
const KIN_NOUN_PL: Record<string, string> = {
  брат: 'братья', сестра: 'сёстры', дядя: 'дяди', тётя: 'тёти', племянник: 'племянники', племянница: 'племянницы', дед: 'деды',
  бабушка: 'бабушки', внук: 'внуки', внучка: 'внучки', шурин: 'шурины', свояченица: 'свояченицы', зять: 'зятья', невестка: 'невестки',
  деверь: 'девери', золовка: 'золовки', тесть: 'тести', тёща: 'тёщи', свёкор: 'свёкры', свекровь: 'свекрови', предок: 'предки',
  потомок: 'потомки', прародительница: 'прародительницы', родственник: 'родственники', родственница: 'родственницы',
};
export function kinPlural(word: string): string {
  const [head, ...tail] = word.split(/(?=\s\(|\sв\s\d|,)/);
  const ws = head.split(' ').map((w) => {
    const pra = /^(пра)+/.exec(w)?.[0] ?? '';
    const base = w.slice(pra.length);
    if (KIN_NOUN_PL[base]) return pra + KIN_NOUN_PL[base];
    if (/(ый|ой|ий)$/.test(w)) return w.replace(/(ый|ой)$/, 'ые').replace(/ий$/, 'ие');
    if (/ая$/.test(w)) return w.replace(/ая$/, 'ые');
    return w;
  });
  return [ws.join(' '), ...tail].join('');
}

/** Больше стольких родственников — по степеням («двоюродные братья (47)»); меньше — одним списком до 8 имён. */
const KIN_FLAT_MAX = 20;
const KIN_SHOW = 8;

/**
 * § 14 карточки: свёртка «ещё N» — своя (Clamp), у расчётного списка — раскрытие по команде.
 */
function Contemporaries({ id, m, card, ns }: { id: string; m: ModelData; card: Card | null; ns: string }) {
  const data = section14(id, m, card);
  const [kinOpen, setKinOpen] = useState<string | null>(null);
  if (!data) return null;
  const cands = linkCandidates(id, (card?.met ?? []).map((x) => x.id));
  const L = (t: string) => linkText(t, cands);
  const kinSig = `${id}|${data.kin.length}`;
  const kinAll = kinOpen === kinSig;
  const kinItem = (x: { id: string; word: string }, i: number, last: boolean) => (
    <Fragment key={x.id}>
      {i ? ' ' : ''}
      <PN id={x.id} lower /> — <Glued after={last ? undefined : ';'}>{x.word}</Glued>
    </Fragment>
  );
  const body = (
    <>
      {data.rows.length ? (
        <>
          <p class="sub">
            Встречи и связи, о которых говорит Писание
          </p>
          <ul>
            {data.rows.map((r, i) => {
              const key = ns + `m14.${i}`;
              if (r.kind === 'met') {
                // имя лица встречи — в самом тексте: «Помазан Самуилом; бежал к нему в Раму» (F7); иначе — в начале строки.
                // Уточнение одноимённого не повторяет слова встречи: «Елиезер — распорядитель в его доме» (CARD-06)
                const q = byId.get(r.id);
                const needDis = !!q?.disambig && (nameCount.get(q.name)?.length ?? 0) > 1 && !saysSame(r.text, q.disambig);
                const dis = needDis ? <span class="muted">({disambigText(r.id)})</span> : null;
                const inText = linkNames(capFirst(r.text), [candidateFor(r.id)], dis ? () => dis : undefined);
                return (
                  <li class="fact" key={key}>
                    {Array.isArray(inText) ? L2(inText as ComponentChildren[], cands) : <><PN id={r.id} dis={needDis} /> — {L(r.text)}</>}
                    <Refs refs={r.refs} owner={key} />
                    <VerseInsert owner={key} refs={r.refs} />
                  </li>
                );
              }
              if (r.kind === 'event') {
                // слова события владельца с именами-ссылками: «Предан Понтию Пилату, отослан к Ироду и возвращён»
                const text = linkNames(capFirst(r.text), [...r.ids.map(candidateFor), ...cands.filter((c) => !r.ids.includes(c.id))]);
                return (
                  <li class="fact" key={key}>
                    {Array.isArray(text) ? L2(text as ComponentChildren[], cands) : text}
                    <Refs refs={r.refs} owner={key} />
                    <VerseInsert owner={key} refs={r.refs} />
                  </li>
                );
              }
              if (r.kind === 'met-by')
                return (
                  // встреча, записанная у другого лица, — его словами; у нескольких лиц одни слова — одной строкой
                  <li class="fact" key={key}>
                    <InlineList ids={r.ids} item={(x, after) => <PN id={x} dis={r.ids.length === 1 ? undefined : false} after={after} />} />
                    {' — '}
                    {r.ids.length > 1 ? `${r.ids.every((x) => byId.get(x)!.sex === 'f') ? 'каждая' : 'каждый'}: ` : null}
                    {L(r.text)}
                    <Refs refs={r.refs} owner={key} />
                    <VerseInsert owner={key} refs={r.refs} />
                  </li>
                );
              // «Другая жена Артаксеркса: Астинь» — если имя мужа склоняется; иначе — «Жёны того же мужа: …»
              const g = caseLink(r.spouse, 'gen');
              const many = r.ids.length > 1;
              return (
                <li class="fact" key={key}>
                  {g ? (
                    <>
                      <span class="muted">{many ? 'Другие жёны' : 'Другая жена'} </span>
                      <Glued after={<span class="muted">:</span>}>{g}</Glued>{' '}
                    </>
                  ) : (
                    <span class="muted">{many ? 'Другие жёны того же мужа' : 'Другая жена того же мужа'}: </span>
                  )}
                  <InlineList ids={r.ids} item={(x, after) => <PN id={x} after={after} />} />
                  <Refs refs={r.refs} owner={key} />
                  <VerseInsert owner={key} refs={r.refs} />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {data.kin.length || data.calc.length ? (
        // остальные современники и дальняя родня — машинный список: свёрнут, раскрывается по команде (решения 19, 62)
        <details class="calc">
          <summary>
            <span class="more">
              Кто ещё жил в это время (расчёт)<span class="if-shut"> — показать</span>
              <span class="if-open"> — скрыть</span>
            </span>
          </summary>
          {data.kin.length ? (
            data.kin.length <= KIN_FLAT_MAX ? (
              // до 8 имён по близости степени, остальные — «ещё N»
              <p class="fact">
                <span class="muted">Родня: </span>
                {(kinAll ? data.kin : data.kin.slice(0, KIN_SHOW)).map((x, i, a) => kinItem(x, i, i === a.length - 1))}
                {!kinAll && data.kin.length > KIN_SHOW ? (
                  <>
                    {' '}
                    <button type="button" class="more" onClick={() => setKinOpen(kinSig)}>
                      ещё{' '}{data.kin.length - KIN_SHOW}{' '}{personsWord(data.kin.length - KIN_SHOW)}
                    </button>
                  </>
                ) : null}
                <MarkNote label="расч." full={MARK_FULL.calc} />
              </p>
            ) : (
              // больше двадцати — по степеням: «Двоюродные братья (47): …»
              [...groupBy(data.kin, (x) => x.word)].map(([word, xs]) => (
                <p class="fact" key={word}>
                  <span class="muted">
                    {capFirst(xs.length > 1 ? kinPlural(word) : word)} ({xs.length}):{' '}
                  </span>
                  <InlineList ids={xs.map((x) => x.id)} max={KIN_SHOW} item={(x, after) => <PN id={x} lower after={after} />} />
                </p>
              ))
            )
          ) : null}
          {[true, false].map((sure) => {
            const gs = data.calc.filter((g) => g.sure === sure);
            if (!gs.length) return null;
            return (
              <Fragment key={String(sure)}>
                <p class="sub fact">
                  {sure ? 'По расчёту жили в одно время' : 'Вероятно, жили в одно время'}
                  <MarkNote label="расч." full={MARK_FULL.calc} />
                </p>
                {gs.map((g) => (
                  <p key={g.label}>
                    <span class="muted">{g.label}: </span>
                    <InlineList ids={g.ids} item={(x, after) => <PN id={x} lower after={after} />} />
                  </p>
                ))}
              </Fragment>
            );
          })}
        </details>
      ) : null}
    </>
  );
  return (
    <Clamp sig={`${id}|14`} n={14}>
      {typoTree(body)}
    </Clamp>
  );
}

/** Группы по ключу в порядке первого появления. */
function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

/** Слова встречи повторяют уточнение: «распорядитель в его доме» при «распорядитель в доме Аврама» (CARD-06). */
function saysSame(text: string, dis: string): boolean {
  const a = stemsOf(text);
  const b = new Set(stemsOf(dis));
  return a.length > 0 && a.filter((w) => b.has(w)).length / a.length >= 0.5;
}

// ---------- перечни с «ещё N» ----------

type Item = (id: string, after?: string) => ComponentChildren;
const lowItem: Item = (x, after) => <PN id={x} lower dis={false} after={after} />;
const personsWord = (n: number) => plural(n, 'лицо', 'лица', 'лиц');

/**
 * Перечень лиц через запятую, не больше max, затем команда «ещё N лиц» (F5). Запятая — за своим именем (after),
 * чтобы перенос не ставил её в начало строки.
 */
function InlineList({ ids, max = 16, item = lowItem, tail, sep = ',' }: { ids: string[]; max?: number; item?: Item; tail?: string; sep?: string }) {
  const sig = ids.join('|');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const cut = openFor !== sig && ids.length > max + 1;
  const shown = cut ? ids.slice(0, max) : ids;
  const more = ids.length - shown.length;
  return (
    <>
      {shown.map((k, i) => (
        <Fragment key={k}>
          {i ? ' ' : ''}
          {item(k, i < shown.length - 1 ? sep : more ? (sep === ',' ? undefined : sep) : tail)}
        </Fragment>
      ))}
      {more > 0 ? (
        <>
          {' '}
          <Glued after={tail}>
            <button type="button" class="more" onClick={() => setOpenFor(sig)}>
              ещё{' '}{more}{' '}{personsWord(more)}
            </button>
          </Glued>
        </>
      ) : null}
    </>
  );
}

/** Группа перечня: «от Соломона — Ровоам». head — подпись группы; null — без подписи (последней). */
type Group = { head: ComponentChildren | null; key: string; ids: string[] };

/** Перечень групп через «;»: «от Соломона — Ровоам; от Нафана — Маттафа»; больше max лиц — «ещё N лиц». */
function GroupList({ groups, max = 12, item = lowItem }: { groups: Group[]; max?: number; item?: Item }) {
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const sig = groups.map((g) => `${g.key}:${g.ids.join(',')}`).join('|');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const limit = openFor !== sig && total > max + 1 ? max : total;
  const out: ComponentChildren[] = [];
  let left = limit;
  const vis = groups.map((g) => {
    const ids = g.ids.slice(0, Math.max(0, left));
    left -= ids.length;
    return { ...g, ids };
  }).filter((g) => g.ids.length);
  vis.forEach((g, gi) => {
    const lastGroup = gi === vis.length - 1;
    out.push(
      <Fragment key={g.key}>
        {gi ? ' ' : ''}
        {g.head ? <>{g.head}{' '}— </> : null}
        {g.ids.map((x, i) => (
          <Fragment key={x}>
            {i ? ' ' : ''}
            {item(x, i < g.ids.length - 1 ? ',' : lastGroup ? undefined : ';')}
          </Fragment>
        ))}
      </Fragment>,
    );
  });
  const more = total - limit;
  return (
    <>
      {out}
      {more > 0 ? (
        <>
          {' '}
          <button type="button" class="more" onClick={() => setOpenFor(sig)}>
            ещё{' '}{more}{' '}{personsWord(more)}
          </button>
        </>
      ) : null}
    </>
  );
}

// ---------- повторы (F5; CARD-20) ----------

/** Ссылка без пробелов — для сравнения «1Цар 18:27» и «1 Цар 18:27». */
const refKey = (r: string) => r.replace(/\s+/g, '');
/** Глава ссылки: «1Пар 3:19-20» → «1Пар3». */
const chapterOf = (r: string) => refKey(r).replace(/:.*$/, '');

/** Слова, которые в заметке-перечне ничего не добавляют к строкам: термины родства, союзы. */
const FILLER = /^(и|а|от|также|—|–|-|сёстры|сестры|сестра|братья|брат|сыновья|сын|сына|сыновей|дочери|дочь|дочерей|жёны|жены|жена|мужья|муж|дети|детей|их|его|её|ее)$/;
/** Числительные в заметке-перечне: «Два сына», «шесть сыновей». */
const NUMERAL = /^(один|одна|два|две|двое|три|трое|четыре|четверо|пять|пятеро|шесть|шестеро|семь|семеро|восемь|девять|десять|одиннадцать|двенадцать|тринадцать)$/;

type RowRef = { id: string; refs: string[] };
type NoteFate = { keep: Fact[]; attach: Map<string, Fact[]> };

/**
 * Заметки составителя (*Note) рядом со строками раздела, собранными из графа (§ 9, 11, 12):
 * — заметка-перечень, которая называет только лиц строк и стоит на тех же стихах, не выводится («Сёстры — Саруия
 *   и Авигея» при строках «Саруия — сестра», «Авигея — сестра»);
 * — заметка об одном лице строки, со стихом этой строки, встаёт под неё («Ионафан, „дядя Давидов“, — советник…»);
 * — остальные — отдельными абзацами, как были.
 */
function placeNotes(notes: Fact[] | undefined, rows: RowRef[]): NoteFate {
  const keep: Fact[] = [];
  const attach = new Map<string, Fact[]>();
  for (const f of notes ?? []) {
    const named = rows.filter((r) => mentionsPerson(f.text, r.id));
    const rowRefs = new Set(named.flatMap((r) => r.refs.map(refKey)));
    const covered = f.refs.length > 0 && f.refs.every((r) => rowRefs.has(refKey(r)));
    if (named.length >= 2 && covered) {
      let rest = f.text;
      for (const r of named) for (const w of byId.get(r.id)!.name.split(' ')) rest = rest.replace(new RegExp(`${w.slice(0, Math.max(3, w.length - 2))}[а-яё]*`, 'g'), ' ');
      const words = rest.split(/[\s,.;:«»()]+/).filter((w) => w && !FILLER.test(w.toLowerCase()));
      if (words.length <= 1) continue;
    }
    // заметка об одном лице строки — под этой строкой (CARD-56: «если пояснение относится к строке — под строкой»)
    if (named.length === 1) {
      attach.set(named[0].id, [...(attach.get(named[0].id) ?? []), f]);
      continue;
    }
    keep.push(f);
  }
  return { keep, attach };
}

/** Короткое пояснение строки повторяет подробную заметку под ней: большая часть его слов есть в заметке. */
function noteRepeats(short: string, long: string): boolean {
  const stems = (s: string) => s.toLowerCase().split(/[^а-яё]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 4));
  const a = stems(short);
  const b = new Set(stems(long));
  return a.length > 0 && a.filter((w) => b.has(w)).length / a.length >= 0.6;
}

/** Слова с прописной, которые не имена лиц: они не делают пояснение «новым» (CARD-81). */
const NOT_NAMES = /^(бог|бож|госп|дух|свят|хрис|изра|писа|иуде|цар|мест|книг)/;

/**
 * Есть ли в пояснении имена, которых нет в строке (CARD-81): слово с прописной не в начале, от четырёх букв, чья основа
 * не совпадает с именами лиц строки и владельца карточки.
 */
export function newNamesIn(text: string, known: string[]): boolean {
  const stems: string[] = [];
  for (const x of known) {
    const q = byId.get(x);
    if (!q) continue;
    for (const n of [q.name, ...q.alt]) for (const w of n.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/)) if (w.length >= 3) stems.push(nameStem(w));
  }
  const isKnown = (w: string) => {
    const low = w.toLowerCase().replace(/ё/g, 'е');
    return stems.some((st) => low.startsWith(st) && CASE_END.test(low.slice(st.length)));
  };
  const words = text.replace(/^[«"„(\s]+/, '').split(/[^А-Яа-яЁё]+/).slice(1);
  return words.some((w) => w.length >= 4 && /^[А-ЯЁ]/.test(w) && !NOT_NAMES.test(w.toLowerCase()) && !isKnown(w) && isPersonWord(w));
}
/** Основа имени без конечной гласной: «Урия» — «ури», «Саул» — «саул». */
const nameStem = (w: string) => (w.length > 3 && /[аяйьоеиыу]$/.test(w) ? w.slice(0, -1) : w);

/** Основы имён всех лиц атласа по первым трём буквам: «Саула», «Фалтию» — имена, «Мадиамской» — нет. */
const personStems = (() => {
  const m = new Map<string, Set<string>>();
  for (const q of persons) {
    if (q.unnamed) continue;
    for (const n of [q.name, ...q.alt]) {
      const w = n.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/)[0];
      if (!w || w.length < 3) continue;
      const st = nameStem(w);
      const k = st.slice(0, 3);
      m.set(k, (m.get(k) ?? new Set()).add(st));
    }
  }
  return m;
})();
const CASE_END = /^(|а|я|у|ю|е|ы|и|о|й|ь|ом|ем|ой|ей|ою|ею|ью|ям|ах|ях|ов|ев|ова|ева|ову|еву|овы|евы|ово|ево|овым|евым|овой|евой|овых|евых|ин|ина|ину|ины|ино|ином|иной|иных|ым|им|ых|их)$/;
/** Слово — имя лица в каком-либо падеже или притяжательной форме. */
function isPersonWord(w: string): boolean {
  const low = w.toLowerCase().replace(/ё/g, 'е');
  for (const st of personStems.get(low.slice(0, 3)) ?? []) if (low.startsWith(st) && CASE_END.test(low.slice(st.length))) return true;
  return false;
}

/**
 * Пояснение под строкой без повтора самой строки (CARD-81): «Сарра — жена и одновременно сестра по отцу» под «Сарра —
 * жена» — «Сестра по отцу»; «Амессай, сын Авигеи, сестры Саруии, — его двоюродный брат» под «Амессай — двоюродный
 * брат» — «Сын Авигеи, сестры Саруии». Пустая строка — пояснение целиком повторяет строку.
 */
export function trimRowRepeat(text: string, names: string[], label?: string): string {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let t = text.trim();
  let named = false;
  for (const n of names) {
    const m = new RegExp(`^«?${esc(n)}»?\\s*(,|—)\\s*`).exec(t);
    if (m) {
      t = t.slice(m[0].length);
      named = true;
      break;
    }
  }
  // «Родственница Елисаветы, жены…» — не повтор строки: слово строки снимается, только если перед ним стояло имя
  if (label && named) {
    const l = esc(label);
    t = t.replace(new RegExp(`^${l}(\\s+и)?(\\s+(одновременно|также|тоже))?(\\s+|$)`, 'i'), '');
    t = t.replace(new RegExp(`,?\\s*—\\s*(его|её|ее)\\s+${l}\\s*$`, 'i'), '');
  }
  t = t.replace(/^[,;—\s]+|[,;—\s]+$/g, '');
  return t === text.trim() ? text : capFirst(t);
}

/**
 * Одинаковые части пояснений у соседних записей (§ 9 Давида: «прямо „женой“ не названа, но сыновья её…» трижды)
 * сводятся в одно: у записей остаётся своё («мать Авессалома»), общее — одной строкой после группы:
 * «Каждая из трёх: прямо „женой“ не названа…». Части — по «;».
 */
function sharedClauses(notes: (string | undefined)[], sexes: ('m' | 'f')[]): { own: (string | undefined)[]; shared: Map<number, string> } {
  const parts = notes.map((n) => (n ? n.split(/;\s+/) : []));
  const count = new Map<string, number[]>();
  parts.forEach((ps, i) => ps.forEach((c) => count.set(c, [...(count.get(c) ?? []), i])));
  const own = parts.map((ps, i) => {
    const rest = ps.filter((c) => (count.get(c)?.length ?? 0) < 2);
    return rest.length ? rest.join('; ') : notes[i] && ps.length ? undefined : notes[i];
  });
  const shared = new Map<number, string>();
  for (const [c, at] of count) {
    if (at.length < 2) continue;
    const last = Math.max(...at);
    const allF = at.every((i) => sexes[i] === 'f');
    const lead = `${allF ? 'Каждая' : 'Каждый'} из ${countGen(at.length)}`;
    shared.set(last, `${lead}: ${c}`);
  }
  return { own, shared };
}

// ---------- вычисляемая вторая степень родства (F6; CARD-29) ----------

export type DerivedRow = { section: 6 | 12; label: string; ids: string[]; via?: { ids: string[]; word: string }; refs: string[] };

/**
 * Родня второй степени, которой нет среди связей Писания: деды и бабки (§ 6); дяди и тётки, тесть и тёща
 * (у женщины — свёкор и свекровь), невестки и зятья (§ 12). Вычисляется по связям «родитель — ребёнок» и брака
 * и по терминам Писания «брат», «сестра» у родителя (Давид — дядя Иоава по матери: Саруия — сестра Давида,
 * 1 Пар 2:16). Всё это — вывод («выв.»): однозначно следует из сопоставления стихов (ТЗ П-4).
 */
export function derivedKin(id: string): DerivedRow[] {
  const p = byId.get(id);
  if (!p || p.kind === 'people' || p.kind === 'clan') return [];
  const out: DerivedRow[] = [];
  const explicit = new Set<string>([id]);
  for (const k of graph.kinOf.get(id) ?? []) explicit.add(k.from === id ? k.to : k.from);
  for (const e of graph.parentsOf.get(id) ?? []) explicit.add(e.parent);
  for (const e of graph.childrenOf.get(id) ?? []) explicit.add(e.child);
  for (const s of graph.spousesOf.get(id) ?? []) explicit.add(s.a === id ? s.b : s.a);
  for (const s of siblings(graph, id)) explicit.add(s.id);
  const taken = new Set(explicit);
  const parents = (graph.parentsOf.get(id) ?? []).filter(plainLink).sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother'));
  // деды и бабки — § 6
  for (const e of parents) {
    const side = e.kind === 'father' ? 'по отцу' : 'по матери';
    for (const g of (graph.parentsOf.get(e.parent) ?? []).filter(plainLink).sort((a, b) => Number(a.kind === 'mother') - Number(b.kind === 'mother'))) {
      if (taken.has(g.parent)) continue;
      taken.add(g.parent);
      out.push({ section: 6, label: derivedKinLabel(g.kind === 'father' ? 'grandfather' : 'grandmother', side, 1), ids: [g.parent], refs: g.refs });
    }
  }
  // дяди и тётки — братья и сёстры родителей: по графу и по терминам Писания у родителя
  for (const e of parents) {
    const side = e.kind === 'father' ? 'по отцу' : 'по матери';
    const sibs = siblings(graph, e.parent).map((s) => s.id).filter((x) => !taken.has(x));
    const viaKin = (graph.kinOf.get(e.parent) ?? [])
      .filter((k) => SIBLING_KIN.test(k.rel))
      .map((k) => ({ other: k.from === e.parent ? k.to : k.from, refs: k.refs }))
      .filter((x, i, a) => !taken.has(x.other) && !sibs.includes(x.other) && a.findIndex((y) => y.other === x.other) === i);
    for (const x of sibs) taken.add(x);
    if (sibs.length) out.push({ section: 12, label: derivedKinLabel('uncle', side, sibs.length, sibs.map((x) => byId.get(x)!.sex)), ids: sibs, refs: [] });
    for (const x of viaKin) {
      taken.add(x.other);
      const q = byId.get(x.other)!;
      out.push({ section: 12, label: derivedKinLabel('uncle', side, 1, [q.sex]), ids: [x.other], via: { ids: [e.parent], word: bySex(q.sex, 'брат', 'сестра') }, refs: x.refs });
    }
  }
  // племянники и племянницы — дети братьев и сестёр (по графу и по слову Писания «брат», «сестра»): вторая степень
  // родства — в § 12, а не в «Современниках» (решение 62): «Племянники: Иоав, Авесса и Асаил — сыновья сестры Саруии»
  {
    const sibs = [
      ...siblings(graph, id).map((x) => ({ id: x.id, refs: [] as string[] })),
      ...(graph.kinOf.get(id) ?? []).filter((k) => SIBLING_KIN.test(k.rel)).map((k) => ({ id: k.from === id ? k.to : k.from, refs: k.refs })),
    ].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
    for (const sb of sibs) {
      const kids = kidsOf(sb.id).filter((x) => !taken.has(x) && !byId.get(x)!.unnamed && byId.get(x)!.kind !== 'people');
      if (!kids.length) continue;
      for (const x of kids) taken.add(x);
      // стихи — слово Писания «сестра» (1 Пар 2:16) и стихи родителей детей: по главе — самый широкий
      const refs = widestPerChapter([...sb.refs, ...kids.map((x) => byId.get(x)!.parentRefs[0]).filter(Boolean)]).slice(0, 3);
      out.push(nephewRow(kids, sb.id, refs));
    }
  }
  // свойственники: родители супругов; супруги детей
  const inlaw = new Map<string, { via: string[]; kind: 'parent' | 'child' }>();
  for (const s of graph.spousesOf.get(id) ?? []) {
    const sp = s.a === id ? s.b : s.a;
    for (const g of (graph.parentsOf.get(sp) ?? []).filter(plainLink)) {
      if (taken.has(g.parent)) continue;
      const v = inlaw.get(g.parent) ?? { via: [], kind: 'parent' as const };
      if (!v.via.includes(sp)) v.via.push(sp);
      inlaw.set(g.parent, v);
    }
  }
  for (const k of kidsOf(id)) {
    for (const s of graph.spousesOf.get(k) ?? []) {
      const sp = s.a === k ? s.b : s.a;
      if (taken.has(sp) || sp === id) continue;
      const v = inlaw.get(sp) ?? { via: [], kind: 'child' as const };
      if (!v.via.includes(k)) v.via.push(k);
      inlaw.set(sp, v);
    }
  }
  // невестки и зятья — по детям: «Невестки: Лия, Рахиль, Валла, Зелфа, жёны Иакова»
  const byChild = new Map<string, string[]>();
  for (const [x, v] of inlaw) {
    taken.add(x);
    const q = byId.get(x)!;
    if (v.kind === 'child') {
      const key = `${v.via.join('+')}|${q.sex}`;
      byChild.set(key, [...(byChild.get(key) ?? []), x]);
      continue;
    }
    const role = p.sex === 'f' ? (q.sex === 'f' ? 'mother-in-law-f' : 'father-in-law-f') : q.sex === 'f' ? 'mother-in-law' : 'father-in-law';
    // «Свекровь: Ноеминь, мать Махлона»
    out.push({ section: 12, label: derivedKinLabel(role, '', 1), ids: [x], via: { ids: v.via, word: bySex(q.sex, 'отец', 'мать') }, refs: [] });
  }
  for (const [key, xs] of byChild) {
    const [via, sex] = key.split('|') as [string, 'm' | 'f'];
    const many = xs.length > 1;
    const role = sex === 'f' ? 'daughter-in-law' : 'son-in-law';
    const word = sex === 'f' ? (many ? 'жёны' : 'жена') : many ? 'мужья' : 'муж';
    out.push({ section: 12, label: derivedKinLabel(role, '', xs.length), ids: xs, via: { ids: via.split('+'), word }, refs: [] });
  }
  return out;
}

/** Строка племянников: подпись и «сыновья сестры Саруии» — по полу детей и брата или сестры. */
function nephewRow(kids: string[], sib: string, refs: string[]): DerivedRow {
  const sx = kids.map((x) => byId.get(x)!.sex);
  const noun = sx.length > 1 ? (sx.every((v) => v === 'f') ? 'дочери' : sx.every((v) => v === 'm') ? 'сыновья' : 'дети') : sx[0] === 'f' ? 'дочь' : 'сын';
  return { section: 12, label: nephewLabel(sx), ids: kids, via: { ids: [sib], word: `${noun} ${byId.get(sib)!.sex === 'f' ? 'сестры' : 'брата'}` }, refs };
}
/** Ссылки без повторов: ссылки одной главы — одним промежутком («Быт 22:20–24», а не 22:20–21, 22:20–22 и 22:24). */
function widestPerChapter(refs: string[]): string[] {
  const span = (r: string) => {
    const m = /^(.+?\d+):(\d+)(?:-(\d+))?$/.exec(r.replace(/[–—]/g, '-').trim());
    return m ? { head: m[1], a: Number(m[2]), b: Number(m[3] ?? m[2]) } : null;
  };
  const out: string[] = [];
  for (const r of refs) {
    const k = out.findIndex((q) => chapterOf(q) === chapterOf(r));
    const x = span(r);
    const y = k >= 0 ? span(out[k]) : null;
    if (k < 0) out.push(r);
    else if (x && y) {
      const a = Math.min(x.a, y.a);
      const b = Math.max(x.b, y.b);
      out[k] = `${y.head}:${a === b ? a : `${a}-${b}`}`;
    }
  }
  return out;
}
/** Подпись группы для одного оставшегося лица: «Невестки» → «Невестка», «Племянники» → «Племянник». */
function singleLabel(label: string, sex: 'm' | 'f'): string {
  if (/^Племянни/.test(label)) return nephewLabel([sex]);
  if (/^Невестки/.test(label)) return 'Невестка';
  if (/^Зятья/.test(label)) return 'Зять';
  if (/^Дяди|^Тётки/.test(label)) return label.replace(/^(Дяди и тётки|Дяди|Тётки)/, sex === 'f' ? 'Тётка' : 'Дядя');
  return label;
}

/** «Племянник», «Племянницы», «Племянники и племянницы». */
function nephewLabel(sexes: ('m' | 'f')[]): string {
  if (sexes.length === 1) return sexes[0] === 'f' ? 'Племянница' : 'Племянник';
  return sexes.every((x) => x === 'f') ? 'Племянницы' : sexes.every((x) => x === 'm') ? 'Племянники' : 'Племянники и племянницы';
}

/**
 * Заметка владельца о себе словом свойства: «Зять царя Саула» — владелец зять Саула; обратное слово — по полу второго.
 * «Невестка Орфы» у Руфи (Руф 1:15): жёны братьев — невестки друг другу; у мужчины это деверь (CARD-91).
 */
const OWN_INLAW = /^(зять|сноха|невестка)(?![а-яё])/i;
const OWN_INLAW_REV: Record<string, [string, string]> = { зять: ['тесть', 'тёща'], сноха: ['свёкор', 'свекровь'], невестка: ['деверь', 'невестка'] };
/** Термины свойства: в строке владельца — «Иуда — свёкор», а не «Приходится невесткой Иуде» (CARD-91). */
const INLAW_TERMS = new Set(['зять', 'невестка', 'сноха', 'тесть', 'тёща', 'свёкор', 'свекровь']);

/** Слова свойства, которыми карточки называют родство в заметках: «Сноха Ноемини», «Зять царя Саула». */
const INLAW_WORD = /^(сноха|невестка|свекровь|свёкор|тесть|тёща|зять)(?![а-яё])/i;

/**
 * Термин самой книги для вычисленного свойства (CARD-66): если в карточке второго лица заметка § 12 начинается словом
 * свойства и называет владельца («Сноха Ноемини» у Руфи), в карточке владельца строка — «Руфь — сноха» со стихами
 * этой заметки. Карточка второго лица должна быть загружена; иначе — вычисленный термин.
 */
function bookTerm(other: string, owner: string): { term: string; refs: string[]; cert?: Cert } | null {
  for (const f of loadedCard(other)?.kinNote ?? []) {
    for (const part of f.text.split(/;\s*/)) {
      const m = INLAW_WORD.exec(part);
      if (m && mentionsPerson(part, owner)) return { term: m[1].toLowerCase(), refs: f.refs, cert: f.cert };
    }
  }
  return null;
}

// ---------- § 15: места по роли ----------

const LEAD_PREP = /^(При|У|В|Во|На|Близ|Около|Между|Из|От|До|Под|Над|За|Перед)(?=\s)/;
/** Нарицательное слово в начале названия места: «Гора Нево», «Пещера Одолламская», «Гумно Орны» (CARD-67). */
const LEAD_NOUN = /^(Гора|Горы|Долина|Пещера|Лес|Поле|Земля|Город|Река|Пустыня|Гумно|Дом|Двор|Храм|Вершина|Колодезь|Источник|Остров|Страна|Море|Озеро|Дубрава|Равнина|Холм|Ворота|Башня|Крепость|Стан|Сад|Селение|Область|Окрестность|Потоки?|Долины|Равнины|Поля|Земли|Воды|Дубравы)(?=\s)/;
/** Название места в перечне: «При дворе Саула» → «при дворе Саула», «Гора Нево» → «гора Нево»; имена собственные — как есть. */
/** Нарицательное прилагательное в начале названия: «Царский дом» — посреди перечня «царский дом» (CARD-90). */
const LEAD_ADJ = /^(Царск(ий|ая|ое|ие)|Божи(й|я|е)|Священн(ый|ая|ое|ые))(?=\s)/;
const placeName = (s: string) => (LEAD_PREP.test(s) || LEAD_NOUN.test(s) || LEAD_ADJ.test(s) ? lowerFirst(s) : s);

/** Пояснение места «по связи стихов» (данные) — это вывод: в карточке помета «выв.» (CARD-73). */
const INFER_NOTE = /(^|\s*—\s*)по связи стихов\s*$/;

/**
 * Место из § 8 или § 20 («земля Моавитская, гора Нево») и то же место в перечне мест («Гора Нево, вершина Фасги») —
 * одна запись: «земля Моавитская, гора Нево, вершина Фасги» со стихами перечня (CARD-67). null — мест общих слов нет.
 */
function mergePlace(extra: string, name: string): string | null {
  const key = (t: string) => t.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 4));
  const e = new Set(key(extra));
  if (![...new Set(key(name))].some((w) => e.has(w))) return null;
  const add = name.split(/,\s*/).filter((part) => !key(part).every((w) => e.has(w)));
  return [extra, ...add.map(lowerFirst)].join(', ');
}

/**
 * Места одной роли (§ 15): «Вифлеем 1 Цар 16:4; при дворе Саула 1 Цар 16:21–22; …» — не больше пяти, затем «ещё 4 места».
 * Свёртка раздела («ещё N строк») прячет строки целиком: без своей свёртки длинная строка «Жил» ушла бы под неё вся,
 * и раздел показал бы одно «Родился». «Места» здесь — места, «ссылки» — стихи (CARD-67).
 */
function PlaceList({ places, owner, link, max = 5 }: { places: { name: string; note?: string; refs: string[] }[]; owner: string; link: (t: string) => ComponentChildren; max?: number }) {
  const sig = `${owner}|${places.map((x) => x.name).join('|')}`;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const cut = openFor !== sig && places.length > max + 1;
  const shown = cut ? places.slice(0, max) : places;
  const more = places.length - shown.length;
  return (
    <>
      {shown.map((x0, i) => {
        // «по связи стихов» в пояснении — это уровень достоверности: помета «выв.», а не слова для читателя (CARD-73)
        const inferred = !!x0.note && INFER_NOTE.test(x0.note);
        const x = inferred ? { ...x0, note: x0.note!.replace(INFER_NOTE, '') || undefined } : x0;
        // «;» между местами — за ссылками на стихи или за последним словом: перенос не ставит его в начало строки
        const sep = i < shown.length - 1 || more ? ';' : '';
        const bare = !x.refs.length;
        return (
          <Fragment key={i}>
            {i ? ' ' : ''}
            {/* строки собраны здесь, внутри компонента: typoTree раздела до них не доходит — typo на месте */}
            {typo(x.note ? placeName(x.name) : placeName(x.name) + (bare ? sep : ''))}
            {x.note ? <> — {typoTree(link(lowerFirst(x.note) + (bare ? sep : '')))}</> : null}
            <Refs refs={x.refs} owner={`${owner}.${i}`} tail={bare ? undefined : sep || undefined} />
            {inferred ? <MarkNote label="выв." full={CERT_FULL.inference} /> : null}
          </Fragment>
        );
      })}
      {more > 0 ? (
        <>
          {' '}
          <button type="button" class="more" onClick={() => setOpenFor(sig)}>
            ещё{'\u00a0'}{more}{'\u00a0'}{plural(more, 'место', 'места', 'мест')}
          </button>
        </>
      ) : null}
      {places.map((x, i) => (
        <VerseInsert key={`v${i}`} owner={`${owner}.${i}`} refs={x.refs} />
      ))}
    </>
  );
}

// ---------- разделы ----------

/**
 * Содержимое разделов 1–24 одного лица; ns — приставка ключей вставок стихов (две карточки в развороте).
 * chrono — хронологические входы из тома карточки (царствования со стихами, § 16); без них — годы из индекса.
 */
export function buildSections(
  id: string, p: AtlasPerson, card: Card | null, m: ModelData, c: ChronoRow | undefined, ns = '', chrono: Chrono | null = null,
): Map<number, ComponentChildren> {
  const out = new Map<number, ComponentChildren>();
  // раздел без сведений не выводится и не считается составленным: ни «0», ни пустой строки, ни пустого фрагмента
  const put = (n: number, v: unknown) => {
    // одна функция русской типографики для всех строк раздела (B5): неразрывные пробелы, «–» с U+2060, без «;» в начале
    if (!isEmpty(v)) out.set(n, typoTree(v as ComponentChildren));
  };
  // имена лиц окружения в тексте фактов — ссылки (F12)
  const cands: LinkCand[] = linkCandidates(id, (card?.met ?? []).map((x) => x.id));
  const L = (t: string) => linkText(t, cands);
  const fact = (f: Fact, key: string, i: number, extra?: ComponentChildren) => (
    <li class="fact" key={i}>
      {L(f.text)}
      <Refs refs={f.refs} owner={ns + `${key}.${i}`} />
      <Mark cert={f.cert} />
      {extra}
      <VerseInsert owner={ns + `${key}.${i}`} refs={f.refs} />
    </li>
  );
  const facts = (fs: Fact[] | undefined, key: string) => (fs && fs.length ? <ul>{fs.map((f, i) => fact(f, key, i))}</ul> : null);
  /**
   * Заметки под строкой: текст и стихи, которых у строки нет. Пояснение показывается, только если в нём есть новые
   * имена или стихи (CARD-81); начало и конец, которые повторяют строку («Сарра — жена и…»), опускаются.
   * row — лица строки и её термин («жена», «двоюродный брат»).
   */
  const subNotes = (fs: Fact[] | undefined, rowRefs: string[], key: string, row: { ids: string[]; label?: string } = { ids: [] }) =>
    fs?.flatMap((f, i) => {
      const own = f.refs.filter((r) => !rowRefs.some((q) => refKey(q) === refKey(r)));
      const text = trimRowRepeat(f.text, row.ids.flatMap((x) => [byId.get(x)?.name ?? '']).filter(Boolean), row.label);
      if (!own.length && (!text || !newNamesIn(text, [...row.ids, id]))) return [];
      return [
        <div class="note fact" key={`${key}${i}`}>
          {text ? L(text) : null}
          <Refs refs={own} owner={ns + `${key}.${i}`} />
          <Mark cert={f.cert} />
          <VerseInsert owner={ns + `${key}.${i}`} refs={own} />
        </div>,
      ];
    });
  /**
   * Пояснения без того, что уже сказано строками раздела (CARD-56): часть пояснения (по «;»), чьи слова на 70 % есть выше,
   * опускается; пояснение, которое целиком повторяет строки и не добавляет стихов, не выводится.
   */
  const fresh = (fs: Fact[] | undefined, seen: Set<string>, seenRefs: string[]): Fact[] => {
    const refSet = new Set(seenRefs.map(refKey));
    const out: Fact[] = [];
    for (const f of fs ?? []) {
      const t = newPart(f.text, seen, nameStems);
      const newRefs = f.refs.filter((r) => !refSet.has(refKey(r)));
      if (t === null && !newRefs.length) continue;
      // слова повторяют строки, а стихи новые — остаются стихи: основание перечня не теряется
      out.push(t === null ? { ...f, text: 'Стихи:', refs: newRefs } : t === f.text ? f : { ...f, text: t });
      // «сказано выше» — только строки раздела: две заметки, говорящие о разном одними словами, обе остаются
      for (const r of f.refs) refSet.add(refKey(r));
    }
    return out;
  };
  /** Основы имён лиц раздела — для «сказано выше»; сами имена новостью не считаются (nameStems). */
  const nameStems = new Set<string>();
  const namesSeen = (ids: string[], ...texts: (string | undefined)[]) => {
    const names = ids.map((x) => byId.get(x)?.name);
    addSeen(nameStems, ...names);
    return addSeen(new Set<string>(), ...names, ...texts);
  };
  const derived = derivedKin(id);
  // народ или род из родословия (Быт 10): свои названия § 6, 8, 11, без § 14 (решение 23; CARD-59)
  const people = p.kind === 'people' || p.kind === 'clan';

  // 1 — имя: шапка его уже называет; раздел говорит об одноимённых и о том, что это за имя
  {
    const same = (nameCount.get(p.name) ?? []).filter((x) => x !== id);
    put(
      1,
      (
        <>
          {p.unnamed ? <p>{typo('В Писании имя не названо; в атласе лицо названо описательно.')}</p> : null}
          {p.kind === 'people' ? <p>В тексте это имя народа или рода.</p> : null}
          {p.kind === 'founder' ? <p>{bySex(p.sex, 'Назван «отцом» города, то есть родоначальником', 'Названа «матерью» города, то есть родоначальницей')} его жителей.</p> : null}
          {!same.length && !p.unnamed ? <p>{`Других лиц с именем ${p.name} в атласе нет.`}</p> : null}
          {same.length && !p.unnamed ? (
            <p>
              {`В атласе ещё ${same.length} ${plural(same.length, 'лицо', 'лица', 'лиц')} с именем ${p.name}: `}
              <InlineList
                ids={same}
                max={8}
                tail="."
                sep=";"
                item={(x, after) => <PN id={x} dis after={after} />}
              />
            </p>
          ) : null}
        </>
      ),
    );
  }
  if (card) {
    const o = card.original;
    put(
      2,
      o && (
        <p class="fact">
          <bdi lang={o.lang === 'gr' ? 'el' : 'he'} dir={o.lang === 'gr' ? 'ltr' : 'rtl'} class={o.lang === 'gr' ? '' : 'he'}>
            {o.script}
          </bdi>{' '}
          <i>{o.translit}</i>
          {o.note ? <span class="muted">; {o.note}</span> : null}
          <MarkNote label="справ." full={MARK_FULL.ref} />
        </p>
      ),
    );
    const mn = card.meaning;
    put(
      3,
      mn && (
        <p class="fact">
          {mn.text}
          <Refs refs={mn.refs} owner={ns + 'm3'} />
          {!mn.refs?.length ? <MarkNote label="справ." full={MARK_FULL.etym} /> : <Mark cert={mn.cert} />}
          <VerseInsert owner={ns + 'm3'} refs={mn.refs} />
        </p>
      ),
    );
    put(
      4,
      card.altNames?.length ? (
        <ul>
          {card.altNames.map((a, i) => {
            // «Аврам — прежнее имя», «Израиль — новое имя»; пояснение, которое само начинается с подписи, заменяет её
            const label = altKindLabel(a.kind, a.note, p.name);
            const noteLeads = !!a.note && a.note.toLowerCase().startsWith(label);
            return (
              <li class="fact" key={i}>
                {a.name} <span class="muted">— {noteLeads ? a.note : label}</span>
                {a.note && !noteLeads ? <span class="muted">. {L(capFirst(a.note))}</span> : null}
                <Refs refs={a.refs} owner={ns + `a4.${i}`} />
                <VerseInsert owner={ns + `a4.${i}`} refs={a.refs} />
              </li>
            );
          })}
        </ul>
      ) : null,
    );
  }
  // 5 — роль и положение: роли уже в паспорте (F5); здесь — записи составителя
  put(5, facts(card?.status, 's5'));
  // 6 — родители и деды
  {
    const rows: ComponentChildren[] = [];
    const pc: Cert = p.parentCert;
    // у отца и у матери свои стихи (CARD-32): при сборке общий список parentRefs разделён по тому, кто назван в стихе
    const by = card?.parentRefsBy;
    const fRefs = by?.father ?? p.parentRefs;
    const mRefs = by?.mother ?? p.parentRefs;
    // у народа — «Произошли от: Мицраим» (Быт 10:13: «От Мицраима произошли Лудим…»; решение 23)
    const fLabel = people ? 'Произошли от' : p.fatherKind === 'legal' ? 'Законный отец' : 'Отец';
    // заметка составителя об одном родителе — под его строкой («Воспитан дочерью фараоновой „как сына“» — под
    // «Приёмная мать: дочь фараонова»), а не отдельной строкой с теми же стихами (CARD-56)
    const fate6 = placeNotes(card?.parentsNote, [
      ...(p.father ? [{ id: p.father, refs: fRefs }] : []),
      ...(p.mother ? [{ id: p.mother, refs: mRefs }] : []),
      ...p.otherParents.map((o) => ({ id: o.id, refs: o.refs })),
    ]);
    const under6 = (who: string, refs: string[], key: string) => {
      const fs = fate6.attach.get(who);
      if (!fs) return null;
      fate6.attach.delete(who);
      return subNotes(fs, refs, key, { ids: [who] });
    };
    if (p.father) rows.push(<li class="fact" key="f">{fLabel}: <PT id={p.father} /><Refs refs={fRefs} owner={ns + 'p6f'} /><Mark cert={pc} />{p.fatherGap && <span class="muted"> — родословие здесь может пропускать поколения</span>}{under6(p.father, fRefs, 'p6fn.')}<VerseInsert owner={ns + 'p6f'} refs={fRefs} /></li>);
    if (p.mother) rows.push(<li class="fact" key="m">{people ? 'Произошли от' : 'Мать'}: <PT id={p.mother} /><Refs refs={mRefs} owner={ns + 'p6m'} /><Mark cert={p.motherCert} />{under6(p.mother, mRefs, 'p6mn.')}<VerseInsert owner={ns + 'p6m'} refs={mRefs} /></li>);
    p.otherParents.forEach((o, i) =>
      rows.push(
        // «Приёмная мать: дочь фараонова», «Приёмный отец: Мардохей» — вид и роль одним словосочетанием, согласованным по роду
        <li class="fact" key={`o${i}`}>
          {otherParentLabel(o.kind, o.role)}: <PT id={o.id} />
          <Refs refs={o.refs} owner={ns + `p6o${i}`} />
          <Mark cert={o.cert} />
          {under6(o.id, o.refs, `p6on${i}.`)}
          <VerseInsert owner={ns + `p6o${i}`} refs={o.refs} />
        </li>,
      ),
    );
    derived.filter((r) => r.section === 6).forEach((r, i) =>
      rows.push(
        <li class="fact" key={`g${i}`}>
          {r.label}: <PT id={r.ids[0]} />
          <MarkNote label="выв." full="вывод: родитель родителя — по двум связям, записанным в Писании" />
        </li>,
      ),
    );
    // заметки, не вставшие под строку (родитель назван в них не один раз, их лица нет среди строк), — ниже, без повторов
    const rest6 = [...fate6.keep, ...[...fate6.attach.values()].flat()];
    const notes6 = fresh(rest6, namesSeen([p.father, p.mother, ...p.otherParents.map((o) => o.id)].filter((x): x is string => !!x)), [...fRefs, ...mRefs]);
    put(6, has(rows, notes6) && (<>{rows.length ? <ul>{rows}</ul> : null}{facts(notes6, 'n6')}</>));
  }
  // 7 — род, колено, народ: колено по предкам (как в паспорте) и записи составителя
  {
    const aff = affiliation(id)?.text;
    put(7, has(card?.lineage, aff) && (<>{aff ? <p>{aff}</p> : null}{facts(card?.lineage, 'l7')}</>));
  }
  // 8 — у народа и рода не строится: происхождение — в § 6 «Произошли от: Мицраим» (CARD-87); лист пишет «не относится»
  // 8 — рождение; место, с которого начинается запись («Вифлеем — „город Давидов“»), не повторяется отдельной строкой
  if (c && !people) {
    const place = card?.birth?.place;
    const bf = card?.birth?.facts ?? [];
    const lead = place ? bf.findIndex((f) => f.text.startsWith(place)) : -1;
    put(
      8,
      <>
        {BirthLine({ p, c, m })}
        {place && lead < 0 ? <p>Место: {place}</p> : null}
        {bf.length ? <ul>{bf.map((f, i) => (i === lead ? fact({ ...f, text: `Место: ${f.text}` }, 'b8', i) : fact(f, 'b8', i)))}</ul> : null}
      </>,
    );
  }
  // 9 — супруги
  {
    // по порядку текста (CARD-77): по первому стиху брака — «Урия, затем Давид» у Вирсавии
    const sp = (graph.spousesOf.get(id) ?? []).map((s) => ({ other: s.a === id ? s.b : s.a, s })).sort((x, y) => (p.sex === 'm' ? (x.s.order ?? 99) - (y.s.order ?? 99) : 0) || compareRefs(firstRef(x.s.refs), firstRef(y.s.refs)));
    // подпись — кем второе лицо приходится владельцу карточки: у мужчины «Мааха — наложница», у женщины «Халев — муж»
    const spouseLabel = (s: (typeof sp)[number]['s']) =>
      p.sex === 'm' ? (s.kind === 'concubine' ? 'наложница' : 'жена') : s.kind === 'concubine' ? 'муж; она названа его наложницей' : 'муж';
    // описательное имя уже называет родство («Жена-Ефиоплянка Моисея»): подпись «— жена» была бы тавтологией
    const saysItself = (other: string, s: (typeof sp)[number]['s']) => byId.get(other)!.name.toLowerCase().startsWith(spouseLabel(s).split(';')[0]);
    const same9 = namesakesIn(id, sp.map((x) => x.other));
    const fate = placeNotes(card?.spousesNote, sp.map((x) => ({ id: x.other, refs: x.s.refs })));
    // пояснения: подробная заметка под строкой заменяет короткое; общее у нескольких жён — одной строкой после группы
    const shortNotes = sp.map((x) => (x.s.note && !(fate.attach.get(x.other) ?? []).some((f) => noteRepeats(x.s.note!, f.text)) ? x.s.note : undefined));
    const { own: own0, shared } = sharedClauses(shortNotes, sp.map((x) => byId.get(x.other)!.sex));
    // короткое пояснение без новых имён («прежде — жена Урии» в карточке Вирсавии, где Урия — строкой выше) не выводится (CARD-81)
    const own = own0.map((t) => (t && newNamesIn(t, [id, ...sp.map((x) => x.other)]) ? t : t && /[«»]/.test(t) && !summaryOf(p.sex, sp.length) ? t : undefined));
    // заметка под строкой не повторяет строку и её короткое пояснение (Моисей: «Позже названа „жена Ефиоплянка…“», CARD-56)
    const seen9 = namesSeen(sp.map((x) => x.other), ...shortNotes, ...[...shared.values()]);
    const under9 = sp.map((x, i) => {
      const rowSeen = addSeen(new Set<string>(), byId.get(x.other)!.name, spouseLabel(x.s), own[i], shortNotes[i]);
      const out = fresh(fate.attach.get(x.other), rowSeen, x.s.refs);
      addSeen(seen9, ...out.map((f) => f.text));
      return out;
    });
    const keep9 = fresh(fate.keep, seen9, sp.flatMap((x) => x.s.refs));
    /**
     * Три и больше жён (CARD-93): первой строкой — «Жёны: Мелхола, Ахиноама, …, Вирсавия»; ниже — каждая со стихами
     * и пояснением, уже без «— жена»: термин назван в первой строке.
     */
    const summary = summaryOf(p.sex, sp.length);
    const kinds = summary ? (['wife', 'concubine'] as const).map((k) => ({ k, ids: sp.filter((x) => (x.s.kind === 'concubine' ? 'concubine' : 'wife') === k).map((x) => x.other) })).filter((g) => g.ids.length) : [];
    put(
      9,
      has(sp, keep9) && (
        <>
          {summary ? (
            <p class="fact">
              {kinds.map((g, gi) => (
                <Fragment key={g.k}>
                  {gi ? ' ' : ''}
                  <span class="muted">{gi ? lowerFirst(spouseKindLabel(g.k, g.ids.length)) : spouseKindLabel(g.k, g.ids.length)}: </span>
                  <InlineList ids={g.ids} item={(x, after) => <PN id={x} dis={same9.has(x)} after={after} />} tail={gi < kinds.length - 1 ? ';' : '.'} />
                </Fragment>
              ))}
            </p>
          ) : null}
          {sp.length ? (
            <ul>
              {sp.map(({ other, s }, i) => (
                <Fragment key={other}>
                  <li class="fact">
                    {/* двоеточие держится за имя (.nobr): «Вирсавия: прежде — жена Урии» */}
                    <PN id={other} dis={same9.has(other)} after={summary && own[i] && / — /.test(own[i]!) ? ':' : undefined} />
                    {summary ? (
                      own[i] ? <span class="muted">{/ — /.test(own[i]!) ? ' ' : ' — '}{L(own[i]!)}</span> : null
                    ) : saysItself(other, s) ? null : (
                      <span class="muted"> — {spouseLabel(s)}</span>
                    )}
                    <Refs refs={s.refs} owner={ns + `s9.${i}`} />
                    <Mark cert={s.cert} />
                    {!summary && own[i] ? <div class="note">{L(own[i]!)}</div> : null}
                    {subNotes(under9[i], s.refs, `s9n${i}.`, { ids: [other], label: spouseLabel(s).split(';')[0] })}
                    <VerseInsert owner={ns + `s9.${i}`} refs={s.refs} />
                  </li>
                  {shared.has(i) ? <li class="note">{L(shared.get(i)!)}</li> : null}
                </Fragment>
              ))}
            </ul>
          ) : null}
          {facts(keep9, 'n9')}
        </>
      ),
    );
  }
  // 10 — дети по матерям; внуки и правнуки при родителях
  {
    const kids = (graph.childrenOf.get(id) ?? []).filter(direct);
    // в группе — по порядку рождения; безымянный без номера (первый сын от Вирсавии, 2 Цар 12:15–18) — первым
    const rank = (x: string) => byId.get(x)!.order ?? (byId.get(x)!.unnamed ? 0 : 99);
    const order = (a: string, b: string) => rank(a) - rank(b);
    // законное отцовство (Иосиф — Иисус Христос, Мф 1:16): группа «от …» не строится ни у отца, ни у матери
    const legal: string[] = [];
    const byMother = new Map<string, string[]>();
    for (const e of kids) {
      const k = byId.get(e.child)!;
      if (k.fatherKind === 'legal' && k.father) {
        if (!legal.includes(e.child)) legal.push(e.child);
        continue;
      }
      const other = p.sex === 'm' ? k.mother ?? '' : k.father ?? '';
      const a = byMother.get(other) ?? [];
      if (!a.includes(e.child)) a.push(e.child);
      byMother.set(other, a);
    }
    const legalRow = (kid: string, i: number) => {
      const k = byId.get(kid)!;
      const messiah = k.roles.includes('messiah');
      if (k.father === id) {
        // «Законный сын: Иисус Христос, рождённый Марией (Мф 1:16)»
        const mother = k.mother ? caseLink(k.mother, 'ins') : null;
        const refs = messiah ? MESSIAH_BIRTH.fatherRefs : k.parentRefs;
        return (
          <li class="fact" key={`l${kid}`}>
            {bySex(k.sex, 'Законный сын', 'Законная дочь')}: <Glued after={k.mother ? (mother ? ',' : ';') : undefined}><P id={kid} /></Glued>
            {k.mother ? (mother ? <> {bySex(k.sex, 'рождённый', 'рождённая')} {mother}</> : <> мать — <PT id={k.mother} /></>) : null}
            <Refs refs={refs} owner={ns + `c10l${i}`} />
            <VerseInsert owner={ns + `c10l${i}`} refs={refs} />
          </li>
        );
      }
      // у матери: «Сын: Иисус Христос — зачат от Духа Святаго (Мф 1:18, 20; Лк 1:35)»
      const refs = messiah ? MESSIAH_BIRTH.mother.refs : k.parentRefs;
      return (
        <li class="fact" key={`l${kid}`}>
          {bySex(k.sex, 'Сын', 'Дочь')}: <Glued after={messiah ? undefined : ';'}><P id={kid} /></Glued>
          {messiah ? <> — {MESSIAH_BIRTH.mother.text}</> : <> законный отец — <PT id={k.father!} /></>}
          <Refs refs={refs} owner={ns + `c10l${i}`} />
          <VerseInsert owner={ns + `c10l${i}`} refs={refs} />
        </li>
      );
    };
    // дети по иным указаниям — подписью от лица родителя: «Потомок, названный без промежуточных звеньев: Исмаил»
    const byClaim = new Map<string, ParentEdge[]>();
    for (const e of graph.childrenOf.get(id) ?? []) {
      if (!e.kind.startsWith('other')) continue;
      const a = byClaim.get(e.claim) ?? [];
      if (!a.some((x) => x.child === e.child)) a.push(e);
      byClaim.set(e.claim, a);
    }
    const childIds = [...new Set(kids.map((e) => e.child))];
    const grand = [...new Set(childIds.flatMap(kidsOf))];
    const great = [...new Set(grand.flatMap(kidsOf))];
    // одноимённые в разделе (Фамарь — дочь и Фамарь — внучка Давида) — с уточнением; безымянные — всегда
    const same10 = namesakesIn(id, [...childIds, ...[...byClaim.values()].flat().map((e) => e.child), ...grand, ...great]);
    const showDis = (x: string) => same10.has(x) || (byId.get(x)!.unnamed && !!byId.get(x)!.disambig);
    const item: Item = (x, after) => <PN id={x} lower dis={showDis(x)} after={after} />;
    const sexes = (ids: string[]) => ids.map((x) => byId.get(x)!.sex);
    // народ с именем во множественном числе («Лудим», «Филистимляне») не называется «сыном» или «внуком» (Быт 10:13–14)
    const isPlural = (x: string) => pluralPeopleName(byId.get(x)!.name, byId.get(x)!.kind);
    // эпоним-родоначальник, названный «сыном» (Мицраим, Быт 10:6), — «От него произошли», хотя имя на -им
    const owner = { sex: p.sex, plural: pluralPeopleName(p.name, p.kind) && !p.roles.includes('forefather') };
    const onLine = (x: string) => lineMembership.joseph.has(x) || lineMembership.mary.has(x);
    // значимые первыми: на линиях Мессии, затем по яркости звезды, затем по порядку рождения (UX-37, CARD-27)
    const weight = (x: string) => (onLine(x) ? -10 : 0) + (byId.get(x)!.magnitude ?? 6);
    const bySignificance = (a: string, b: string) => weight(a) - weight(b) || rank(a) - rank(b);
    /** «Внуки: от Соломона — Ровоам; от Нафана — Маттафа…» — при родителях; родитель без надёжного падежа — последней группой. */
    const genRow = (gen: 2 | 3, ids: string[], from: string[]) => {
      const people = ids.filter(isPlural);
      const rest = new Set(ids.filter((x) => !isPlural(x)));
      const groups: Group[] = [];
      const loose: string[] = [];
      const seen = new Set<string>();
      for (const par of [...from].sort(bySignificance)) {
        const g = kidsOf(par).filter((x) => rest.has(x) && !seen.has(x)).sort(bySignificance);
        if (!g.length) continue;
        g.forEach((x) => seen.add(x));
        const head = caseLink(par, 'gen');
        if (head) groups.push({ head: <>от {head}</>, key: par, ids: g });
        else loose.push(...g);
      }
      if (loose.length) groups.push({ head: null, key: '~', ids: loose });
      // все внуки — от одного ребёнка: подпись «от Овида» ничего не различает
      if (groups.length === 1) groups[0] = { ...groups[0], head: null };
      const all = groups.flatMap((g) => g.ids);
      return (
        <>
          {all.length ? (
            <p key={`g${gen}`}>
              <span class="muted">{descendantsNoun(gen, sexes(all))}: </span>
              <GroupList groups={groups} item={item} />
            </p>
          ) : null}
          {people.length ? (
            <p key={`g${gen}p`}>
              <span class="muted">{peoplesLabel(gen, owner)}: </span>
              <InlineList ids={people} item={item} />
            </p>
          ) : null}
        </>
      );
    };
    /**
     * Группы детей по второму родителю — одной схемой: «Сын от Вооза: Овид», «Сыновья от Вирсавии: …»;
     * если имя не склоняется — «Сын: Махир; мать — наложница-Арамеянка»; дети, второй родитель которых не назван, —
     * последней группой: «Дети, мать которых не названа: …» (если у других детей мать названа) или просто «Сыновья: …».
     */
    // группы по второму родителю — по значимости детей, как у внуков: сначала линии Мессии, затем яркость звезды
    // (у Давида первыми — сыновья от Вирсавии: Соломон и Нафан; CARD-57); группа без названного родителя — последней
    const bestOf = (ids: string[]) => Math.min(...ids.map(weight));
    const groups = [...byMother].sort((a, b) => Number(!a[0]) - Number(!b[0]) || bestOf(a[1]) - bestOf(b[1]) || order(a[1][0], b[1][0]));
    const anyNamed = groups.some(([other]) => !!other);
    // внутри группы — значимые первыми, затем по порядку рождения; безымянный («первый сын… умер») — в конце
    const inGroup = (a: string, b: string) => Number(byId.get(a)!.unnamed) - Number(byId.get(b)!.unnamed) || bySignificance(a, b);
    /**
     * Заметка составителя, которая называет ровно детей одной строки («Два сына от Сепфоры — Гирсам и Елиезер»,
     * «В Хевроне родились шесть сыновей от шести матерей: Амнон, …»), не повторяется отдельным абзацем (CARD-81):
     * её стихи — у строки, а начало до двоеточия у строки «по одному от матери» — подпись строки (CARD-93).
     */
    const kidNotes = card?.childrenNote ?? [];
    const usedNotes = new Set<number>();
    const allKids = [...childIds, ...grand, ...great];
    // слова заметки без имён, слов родства и числительных: «Два сына от Сепфоры — Гирсам и Елиезер» — пусто
    const restWords = (t: string, ids: string[]) => {
      let r = t;
      for (const x of ids) for (const w of (byId.get(x)?.name ?? '').split(' ')) if (w.length >= 3) r = r.replace(new RegExp(`${w.slice(0, Math.max(3, w.length - 2))}[а-яё]*`, 'g'), ' ');
      return r.split(/[\s,.;:«»()—–-]+/).filter((w) => w && !FILLER.test(w.toLowerCase()) && !NUMERAL.test(w.toLowerCase()));
    };
    const noteFor = (ids: string[]): { refs: string[]; lead: string | null } => {
      const mothers = [...byMother.keys()].filter(Boolean);
      const k = kidNotes.findIndex((f, i) => {
        if (usedNotes.has(i) || !ids.length) return false;
        if (!ids.every((x) => mentionsPerson(f.text, x))) return false;
        if (allKids.some((x) => !ids.includes(x) && mentionsPerson(f.text, x))) return false;
        const lead = /^([^:;«»()]{8,80}):\s(.*)$/.exec(f.text);
        // заметка — перечень тех же детей: целиком или после подписи с двоеточием
        return restWords(lead ? lead[2] : f.text, [...ids, ...mothers]).length <= 1;
      });
      if (k < 0) return { refs: [], lead: null };
      usedNotes.add(k);
      const f = kidNotes[k];
      const lead = /^([^:;«»()]{8,80}):\s/.exec(f.text)?.[1] ?? null;
      return { refs: f.refs, lead };
    };
    /**
     * Перечень детей строки: безымянный («сын Давида и Вирсавии») — после имён, через «; ещё …», с уточнением через
     * тире: иначе «Совав, сын Давида и Вирсавии (умер младенцем…)» читается как приложение к Соваву (VIS-72).
     */
    const kidsList = (ids: string[], tail?: string) => {
      const named = ids.filter((x) => !byId.get(x)!.unnamed);
      const bare = ids.filter((x) => byId.get(x)!.unnamed);
      if (!named.length || !bare.length) return <InlineList ids={ids} item={item} tail={tail} />;
      return (
        <>
          <InlineList ids={named} item={item} tail=";" />
          {bare.map((x, i) => {
            const q = byId.get(x)!;
            return (
              <Fragment key={x}>
                {' '}ещё <PT id={x} />
                {q.disambig ? <span class="muted"> — {typo(q.disambig)}</span> : null}
                {i < bare.length - 1 ? ';' : tail ?? ''}
              </Fragment>
            );
          })}
        </>
      );
    };
    const row = (key: string, label: ComponentChildren, ids: string[], refs: string[] = []) => (
      <p key={key} class={refs.length ? 'fact' : undefined}>
        <span class="muted">{label}: </span>
        {kidsList(ids)}
        <Refs refs={refs} owner={ns + `c10r${key}`} />
        <VerseInsert owner={ns + `c10r${key}`} refs={refs} />
      </p>
    );
    /**
     * Дети по одному от каждой матери — одной строкой, а не шестью строками с одним именем (CARD-57):
     * «Сыновья: Амнон (от Ахиноамы), Далуиа (от Авигеи)…». Родитель, имя которого не склоняется, — «(мать — …)».
     */
    const single = groups.filter(([other, all]) => !!other && all.length === 1 && !isPlural(all[0]));
    const merged = single.length >= 3 ? new Set(single.map(([other]) => other)) : new Set<string>();
    const mergedRow = () => {
      // по порядку рождения, как в тексте (CARD-93): первенец Амнон — первым (2 Цар 3:2–5)
      const ids = single.map(([, all]) => all[0]).sort((a, b) => rank(a) - rank(b) || bySignificance(a, b));
      const parentOf = (x: string) => single.find(([, all]) => all[0] === x)![0];
      const nt = noteFor(ids);
      return (
        <p key="single" class={nt.refs.length ? 'fact' : undefined}>
          <span class="muted">{nt.lead ? typo(nt.lead) : childrenNoun(sexes(ids))}: </span>
          {ids.map((x, i) => {
            const par = parentOf(x);
            const g = caseLink(par, 'gen');
            const last = i === ids.length - 1;
            return (
              <Fragment key={x}>
                {i ? ' ' : ''}
                <PN id={x} lower dis={showDis(x)} />
                <span class="muted">
                  {' '}
                  {/* скобка и запятая держатся за имя родителя: «(от Эглы)» не рвётся перед «)» */}
                  <span class="nobr">
                    ({g ? <>от {g}</> : <>{byId.get(par)?.sex === 'f' ? 'мать' : 'отец'} — <PT id={par} /></>}){last ? '' : ','}
                  </span>
                </span>
              </Fragment>
            );
          })}
          <Refs refs={nt.refs} owner={ns + 'c10single'} />
          <VerseInsert owner={ns + 'c10single'} refs={nt.refs} />
        </p>
      );
    };
    let mergedDone = false;
    const childRows = groups.map(([other, all]) => {
      if (merged.has(other)) {
        if (mergedDone) return null;
        mergedDone = true;
        return mergedRow();
      }
      const ids = all.filter((x) => !isPlural(x)).sort(inGroup);
      const people = all.filter(isPlural).sort(order);
      const peopleRow = people.length ? row(`p${other}`, peoplesLabel(1, owner), people) : null;
      if (!ids.length) return <Fragment key={`p${other}`}>{peopleRow}</Fragment>;
      const noun = childrenNoun(sexes(ids));
      const nt = noteFor(ids);
      if (!other) return <Fragment key="u">{row(`u`, anyNamed ? unnamedParentLabel(sexes(ids), p.sex) : noun, ids, nt.refs)}{peopleRow}</Fragment>;
      const g = caseLink(other, 'gen');
      if (g)
        return (
          <Fragment key={other}>
            <p key={`m${other}`} class={nt.refs.length ? 'fact' : undefined}>
              <span class="muted">{noun} от </span>
              <Glued after={<span class="muted">:</span>}>{g}</Glued>{' '}
              {kidsList(ids)}
              <Refs refs={nt.refs} owner={ns + `c10m${other}`} />
              <VerseInsert owner={ns + `c10m${other}`} refs={nt.refs} />
            </p>
            {peopleRow}
          </Fragment>
        );
      // имя второго родителя не склоняется — оно в именительном падеже после перечня
      return (
        <Fragment key={other}>
          <p key={`m${other}`} class={nt.refs.length ? 'fact' : undefined}>
            <span class="muted">{noun}: </span>
            {kidsList(ids, ';')}
            <span class="muted"> {byId.get(other)?.sex === 'f' ? 'мать' : 'отец'} — </span>
            <PT id={other} />
            <Refs refs={nt.refs} owner={ns + `c10m${other}`} />
            <VerseInsert owner={ns + `c10m${other}`} refs={nt.refs} />
          </p>
          {peopleRow}
        </Fragment>
      );
    });
    // пояснения составителя — без того, что уже сказали строки детей и внуков (CARD-56)
    const kidSexes = sexes([...childIds, ...grand, ...great]);
    // заметки, ставшие подписью или стихами строки (noteFor), не повторяются
    const notes10 = fresh(
      (card?.childrenNote ?? []).filter((_, i) => !usedNotes.has(i)),
      namesSeen([...childIds, ...grand, ...great, ...[...byMother.keys()].filter(Boolean)], kidSexes.includes('m') ? 'сын сына сыну сыном сыновья сыновей' : '', kidSexes.includes('f') ? 'дочь дочери дочерей' : ''),
      [],
    );
    put(
      10,
      has(kids, byClaim.size > 0, notes10) && (
        <>
          {legal.length ? <ul>{legal.map(legalRow)}</ul> : null}
          {childRows}
          {[...byClaim].map(([claim, es], i) => {
            const ids = es.map((e) => e.child);
            // стихи — при небольшой группе; у большой они в § 6 каждого потомка
            const refs = es.length <= 3 ? [...new Set(es.flatMap((e) => e.refs))] : [];
            return (
              <p class="fact" key={`c${claim}`}>
                <span class="muted">{otherChildLabel(claim, sexes(ids))}: </span>
                <InlineList ids={ids} item={(x, after) => <PN id={x} lower dis={same10.has(x) || undefined} after={after} />} />
                <Refs refs={refs} owner={ns + `c10o${i}`} />
                <Mark cert={es.every((e) => e.cert === es[0].cert) ? es[0].cert : undefined} />
                <VerseInsert owner={ns + `c10o${i}`} refs={refs} />
              </p>
            );
          })}
          {genRow(2, grand, childIds)}
          {genRow(3, great, grand)}
          {facts(notes10, 'n10')}
        </>
      ),
    );
  }
  // 11 — братья и сёстры: каждая группа — с подписью и стихами (CARD-84): «Братья: Елиав, Аминадав… (1 Пар 2:13–15)»,
  //      «Родной брат: Вениамин — от Рахили (Быт 35:24)», «Сестра по отцу: Сарра (Быт 20:12)»
  {
    const sib = siblings(graph, id);
    // брат или сестра, названные так в Писании (Саруия — сестра Давида, 1 Пар 2:16; Сарра — «сестра по отцу»):
    // термин записан у того, кого он описывает; у владельца — обратный по полу
    const termOf = (k: { from: string; to: string; rel: string }, other: string) => {
      if (k.from === other) return bareRel(k.rel);
      const r = bareRel(k.rel).replace(/^(брат|сестра)/, byId.get(other)!.sex === 'f' ? 'сестра' : 'брат');
      return r;
    };
    const kinAll = (graph.kinOf.get(id) ?? [])
      .filter((k) => SIBLING_KIN.test(k.rel))
      .map((k) => ({ other: k.from === id ? k.to : k.from, k }))
      .filter((x, i, a) => a.findIndex((y) => y.other === x.other) === i);
    const kinSib = kinAll.filter((x) => !sib.some((s) => s.id === x.other));
    // брат или сестра по графу, о которых Писание говорит своим словом («сестра по отцу»): строка — по слову Писания
    const termed = new Map(kinAll.filter((x) => sib.some((s) => s.id === x.other)).map((x) => [x.other, x.k]));
    const same11 = namesakesIn(id, [...kinSib.map((x) => x.other), ...sib.map((x) => x.id)]);
    const item: Item = (x, after) => <PN id={x} dis={same11.has(x)} after={after} />;
    // братья по родителю, названному в другом месте Писания (Авиуд — Мф 1:13, братья — 1 Пар 3:19–20): вывод
    const myChapters = new Set(p.parentRefs.map(chapterOf));
    const attested = (x: string) => byId.get(x)!.parentRefs.some((r) => myChapters.has(chapterOf(r)));
    /** Стих группы: стих родителей владельца, где названы все или больше всего лиц группы, — один (CARD-84). */
    const groupRefs = (ids: string[]): string[] => {
      const score = (r: string, exact: boolean) =>
        ids.filter((x) => byId.get(x)!.parentRefs.some((q) => refKey(q) === refKey(r) || (!exact && chapterOf(q) === chapterOf(r)))).length;
      const ranked = p.parentRefs.map((r, i) => ({ r, s: score(r, false), e: score(r, true), i })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.e - a.e || a.i - b.i);
      if (ranked.length) return [ranked[0].r];
      return [...new Set(ids.map((x) => byId.get(x)!.parentRefs[0]).filter(Boolean))].slice(0, 2);
    };
    const fatherOfOwner = p.father && p.fatherKind !== 'legal' ? p.father : null;
    // «— от Рахили»: у общего отца дети от нескольких матерей, и мать надо назвать
    const manyMothers = !!fatherOfOwner && new Set(kidsOf(fatherOfOwner).map((x) => byId.get(x)!.mother).filter(Boolean)).size > 1;
    const motherTail = () => {
      if (!manyMothers || !p.mother) return null;
      const g = caseLink(p.mother, 'gen');
      return g ? <span class="muted"> — от {g}</span> : null;
    };
    const plain = sib.filter((s) => (s.kind === 'full' || s.kind === 'unknown') && !termed.has(s.id));
    const half = sib.filter((s) => (s.kind === 'paternal' || s.kind === 'maternal') && !termed.has(s.id));
    const rows: ComponentChildren[] = [];
    const inferMark = <MarkNote label="выв." full="вывод: общий родитель назван в разных местах Писания и отождествлён" />;
    /** Строка группы: «Подпись: имена (стихи)». */
    const groupRow = (key: string, label: ComponentChildren, ids: string[], opts: { refs?: string[]; mark?: ComponentChildren; tail?: ComponentChildren } = {}) => {
      const refs = opts.refs ?? groupRefs(ids);
      return (
        <p class="fact" key={key}>
          <span class="muted">{label}: </span>
          <InlineList ids={ids} item={item} />
          {opts.tail}
          <Refs refs={refs} owner={ns + `b11${key}`} />
          {opts.mark}
          <VerseInsert owner={ns + `b11${key}`} refs={refs} />
        </p>
      );
    };
    for (const sure of [true, false]) {
      const ofKind = (k: 'full' | 'unknown') => plain.filter((s) => s.kind === k && attested(s.id) === sure).map((s) => s.id);
      const mark = sure ? undefined : inferMark;
      // у народа — «Названы вместе: Анамим, Легавим…» (Быт 10:13–14; решение 23)
      if (people) {
        const ids = [...ofKind('full'), ...ofKind('unknown')];
        if (ids.length) rows.push(groupRow(`t${sure}`, 'Названы вместе', ids, { mark }));
        continue;
      }
      const full = ofKind('full');
      if (full.length) rows.push(groupRow(`f${sure}`, siblingsLabel(sexesOf(full), true), full, { mark, tail: motherTail() }));
      const unk = ofKind('unknown');
      if (unk.length) rows.push(groupRow(`u${sure}`, siblingsLabel(sexesOf(unk), false), unk, { mark }));
    }
    // единокровные и единоутробные — группой, по второму родителю: «Единокровные братья: Измаил — от Агари; …»
    for (const kind of ['paternal', 'maternal'] as const) {
      const ids = half.filter((s) => s.kind === kind).map((s) => s.id);
      if (!ids.length) continue;
      const by = new Map<string, string[]>();
      for (const x of ids) {
        const q = byId.get(x)!;
        const other = (kind === 'paternal' ? q.mother : q.father) ?? '';
        by.set(other, [...(by.get(other) ?? []), x]);
      }
      const refs = groupRefs(ids);
      rows.push(
        <p class="fact" key={kind}>
          <span class="muted">{halfSiblingsLabel(kind, sexesOf(ids))}: </span>
          {[...by].map(([other, xs], gi) => {
            const g = other ? caseLink(other, 'gen') : null;
            const last = gi === by.size - 1;
            return (
              <Fragment key={other || '~'}>
                {gi ? ' ' : ''}
                <InlineList ids={xs} item={item} tail={g || last ? undefined : ';'} />
                {g ? <> — от <Glued after={last ? undefined : ';'}>{g}</Glued></> : null}
              </Fragment>
            );
          })}
          <Refs refs={refs} owner={ns + `b11${kind}`} />
          {ids.some((x) => !attested(x)) ? inferMark : null}
          <VerseInsert owner={ns + `b11${kind}`} refs={refs} />
        </p>,
      );
    }
    // названные словом Писания — группой по слову: «Сёстры: Саруия, Авигея (1 Пар 2:16)», «Сестра по отцу: Сарра (Быт 20:12)»
    const fate = placeNotes(card?.siblingsNote, kinAll.map((x) => ({ id: x.other, refs: x.k.refs })));
    const byTerm = new Map<string, { ids: string[]; refs: string[]; cert?: Cert }>();
    for (const { other, k } of kinAll) {
      const t = termOf(k, other);
      const g = byTerm.get(t) ?? { ids: [], refs: [], cert: k.cert };
      g.ids.push(other);
      for (const r of k.refs) if (!g.refs.some((q) => refKey(q) === refKey(r))) g.refs.push(r);
      if (g.cert !== k.cert) g.cert = undefined;
      byTerm.set(t, g);
    }
    const termRows = [...byTerm].map(([t, g], i) => (
      <li class="fact" key={`k${t}`}>
        <span class="muted">{capFirst(g.ids.length > 1 ? pluralKin(t) : t)}: </span>
        <InlineList ids={g.ids} item={item} />
        <Refs refs={g.refs} owner={ns + `ks11.${i}`} />
        <Mark cert={g.cert} />
        {g.ids.flatMap((x, j) => subNotes(fate.attach.get(x), g.refs, `ks11n${i}.${j}.`, { ids: [x], label: t }) ?? [])}
        <VerseInsert owner={ns + `ks11.${i}`} refs={g.refs} />
      </li>
    ));
    // «Братья — Нахор и Аран; Аран умер…» после строки «Братья: Нахор, Аран» — только новое: «Аран умер…» (CARD-56)
    const keep11 = fresh(fate.keep, namesSeen([...sib.map((x) => x.id), ...kinSib.map((x) => x.other)], 'брат братья братьев сестра сёстры сестры родной родные'), kinAll.flatMap((x) => x.k.refs));
    put(
      11,
      has(sib, kinSib, keep11, fate.attach.size > 0) && (
        <>
          {rows}
          {termRows.length ? <ul>{termRows}</ul> : null}
          {facts(keep11, 'n11')}
        </>
      ),
    );
  }
  // 12 — иное родство: термины Писания, затем вычисляемая вторая степень
  {
    const kin = (graph.kinOf.get(id) ?? []).filter((k) => !SIBLING_KIN.test(k.rel)); // братья и сёстры — в § 11
    const spouses = new Set((graph.spousesOf.get(id) ?? []).map((s) => (s.a === id ? s.b : s.a)));
    const same12 = namesakesIn(id, kin.map((k) => (k.from === id ? k.to : k.from)));
    const dis12 = (x: string) => (same12.has(x) ? <span class="muted"> ({disambigText(x)})</span> : null);
    /**
     * Термин записан у того, кого он описывает (`kin` у Иохаведы: Амрам, «тётка» — она тётка Амрама).
     * Термин второго лица о владельце: «Иохаведа — тётка» (в карточке Амрама).
     * Термин владельца о втором лице: «Приходится тёткой Амраму, своему мужу» — термин Писания сохраняется (П-8).
     */
    const kinLine = (k: (typeof kin)[number]) => {
      if (k.from !== id) {
        return (
          <>
            <PN id={k.from} dis={same12.has(k.from)} /> — {k.rel}
          </>
        );
      }
      const o = byId.get(k.to)!;
      const { term, tail } = splitKinTerm(k.rel);
      const ins = kinTermIns(term);
      const dat = caseLink(k.to, 'dat');
      // свойство — одной формой «Имя — кем приходится» (CARD-91): у Фамари «Иуда — свёкор», а не «Приходится невесткой Иуде»
      const inlawRev = INLAW_TERMS.has(term.toLowerCase()) ? kinTermReverse(term, o.sex) : null;
      if (inlawRev) {
        return (
          <>
            <PN id={k.to} dis={same12.has(k.to)} /> — {inlawRev}
            {tail ? ` ${tail}` : ''}
          </>
        );
      }
      if (ins && dat) {
        // термин Писания, пересказанный другим словом, — после двоеточия: «двоюродной сестрой Мардохею: дочь его дяди Абихаила»
        const quoted = KIN_TERM_QUOTED.has(term.toLowerCase());
        const myFather = quoted && p.father && p.fatherKind !== 'legal' ? caseLink(p.father, 'gen') : null;
        const after = quoted ? ':' : spouses.has(k.to) ? ',' : undefined;
        return (
          <>
            Приходится {ins}{' '}
            {same12.has(k.to) ? dat : <Glued after={after}>{dat}</Glued>}
            {dis12(k.to)}
            {same12.has(k.to) && quoted ? ':' : ''}
            {quoted ? (
              <>
                {' '}
                {term.split(' ')[0]} {bySex(o.sex, 'его', 'её')} {term.split(' ').slice(1).join(' ')}
                {myFather ? <> {myFather}</> : null}
              </>
            ) : null}
            {spouses.has(k.to) ? `${same12.has(k.to) ? ',' : ''} ${ownSpouseDat(o.sex)}` : ''}
            {tail ? ` ${tail}` : ''}
          </>
        );
      }
      // склонение ненадёжно — имя второго лица в начале строки, термин от его лица, если он есть в словаре
      const rev = kinTermReverse(term, o.sex);
      return rev ? (
        <>
          <PN id={k.to} dis={same12.has(k.to)} /> — {rev}
          {tail ? ` ${tail}` : ''}
        </>
      ) : (
        <>
          <PN id={k.to} dis={same12.has(k.to)} /> — связь по Писанию: «{k.rel}»
        </>
      );
    };
    const fate = placeNotes(card?.kinNote, kin.map((k) => ({ id: k.from === id ? k.to : k.from, refs: k.refs })));
    // вычисляемое родство — если о лице не говорит ни термин Писания, ни заметка составителя («Сноха Ноемини»)
    /**
     * Заметка владельца словом свойства о лице вычисленной строки («Зять царя Саула», «Сноха Ноемини») — строкой той же
     * формы (CARD-66): «Саул — тесть, отец Мелхолы» со стихами заметки; часть заметки, ставшая строкой, не повторяется.
     */
    const noteRows: { row: DerivedRow; term: string; refs: string[]; cert?: Cert }[] = [];
    const notesLeft: Fact[] = [];
    // лица окружения, о которых заметка говорит словом свойства без вычисленной строки («Невестка Орфы» у Руфи):
    // родня и свойственники в пределах пяти шагов по любым связям
    const kinIds12 = new Set(kin.map((k) => (k.from === id ? k.to : k.from)));
    const inlawOf = (part: string) => [...nearAll(id, 5)].find((x) => x !== id && !kinIds12.has(x) && mentionsPerson(part, x)) ?? null;
    for (const f of fate.keep) {
      const parts = f.text.split(/;\s*/);
      const rest = parts.filter((part) => {
        const m = OWN_INLAW.exec(part);
        if (!m) return true;
        let r = derived.find((d) => d.section === 12 && d.ids.length === 1 && mentionsPerson(part, d.ids[0]) && !noteRows.some((n) => n.row === d));
        if (!r) {
          // строки нет — строка из самой заметки: «Орфа — невестка (Руф 1:15)» (CARD-91)
          const who = inlawOf(part);
          if (!who || /[«»:(]/.test(part) || part.split(/\s+/).length > 4) return true;
          r = { section: 12, label: '', ids: [who], refs: [] };
        }
        const x = byId.get(r.ids[0])!;
        noteRows.push({ row: r, term: OWN_INLAW_REV[m[1].toLowerCase()][x.sex === 'f' ? 1 : 0], refs: f.refs, cert: f.cert });
        return false;
      });
      if (rest.length === parts.length) notesLeft.push(f);
      else if (rest.length) notesLeft.push({ ...f, text: capFirst(rest.join('; ')) });
    }
    fate.keep = notesLeft;
    // лицо вычисленной строки, о котором говорит заметка составителя, — в заметке; остальные лица группы остаются строкой
    // одноимённый уже есть строкой Писания (Ионафан — «дядя») — заметка о нём, а не о племяннике Ионафане
    const kinNames12 = new Set([...kinIds12].map((x) => byId.get(x)!.name));
    const inNotes = (x: string) => !kinNames12.has(byId.get(x)!.name) && (card?.kinNote ?? []).some((f) => mentionsPerson(f.text, x));
    const dRows = [
      ...derived
        .filter((r) => r.section === 12)
        .flatMap((r) => {
          if (noteRows.some((n) => n.row === r)) return [r];
          const ids = r.ids.filter((x) => !inNotes(x));
          if (!ids.length) return [];
          if (ids.length === r.ids.length) return [r];
          // у группы осталось меньше лиц: подпись по числу и полу оставшихся
          if (/^Племянни/.test(r.label) && r.via) return [nephewRow(ids, r.via.ids[0], r.refs)];
          return [{ ...r, ids, label: ids.length === 1 ? singleLabel(r.label, byId.get(ids[0])!.sex) : r.label }];
        }),
      ...noteRows.filter((n) => !derived.includes(n.row)).map((n) => n.row),
    ];
    const fromNote = new Map(noteRows.map((n) => [n.row, n]));
    // жена сына: слово книги у одной из невесток («сноха» у Ноемини, Руф 1:6–8) — и у остальных
    const daughterInLaw = (r: DerivedRow) => /^(Невестк|Снох)/.test(r.label);
    const inlawWord = dRows
      .filter((r) => daughterInLaw(r) && r.ids.length === 1)
      .map((r) => fromNote.get(r)?.term ?? bookTerm(r.ids[0], id)?.term)
      .find((t) => t === 'сноха' || t === 'невестка') ?? null;
    put(
      12,
      has(kin, card?.kinNote, dRows) && (
        <>
          {kin.length ? (
            <ul>
              {kin.map((k, i) => {
                const other = k.from === id ? k.to : k.from;
                return (
                  <li class="fact" key={i}>
                    {kinLine(k)}
                    <Refs refs={k.refs} owner={ns + `k12.${i}`} />
                    <Mark cert={k.cert} />
                    {subNotes(fate.attach.get(other), k.refs, `k12n${i}.`, { ids: [other], label: k.from === id ? kinTermReverse(splitKinTerm(k.rel).term, byId.get(other)!.sex) ?? splitKinTerm(k.rel).term : splitKinTerm(k.rel).term })}
                    <VerseInsert owner={ns + `k12.${i}`} refs={k.refs} />
                  </li>
                );
              })}
            </ul>
          ) : null}
          {dRows.length ? (
            <ul>
              {dRows.map((r, i) => {
                // одна форма строки (CARD-66): «Фалмай — тесть, отец Маахи»; у группы — «Дяди по отцу: Ицгар, Хеврон»;
                // «Невестки: Сепфора и жена-Ефиоплянка Моисея — жёны Моисея» — если все имена склоняются
                const via = r.via ? r.via.ids.map((x) => caseLink(x, 'gen')) : [];
                const viaNamed = !!r.via && r.ids.some((x) => r.via!.ids.some((v) => mentionsPerson(byId.get(x)!.name, v)));
                const viaOk = !!r.via && via.length > 0 && via.every((x) => x !== null) && !viaNamed;
                // термин книги вместо вычисленного: у Ноемини — «Руфь — сноха» (Руф 1:22), как пишет карточка Руфи;
                // у второй невестки той же книги — то же слово: «Орфа — сноха» (одно родство — одно слово, CARD-91)
                const own = fromNote.get(r);
                const book0 = own ? { term: own.term, refs: own.refs, cert: own.cert } : r.ids.length === 1 ? bookTerm(r.ids[0], id) : null;
                const book = book0 ?? (r.ids.length === 1 && daughterInLaw(r) && inlawWord ? { term: inlawWord, refs: [] as string[], cert: undefined } : null);
                const refs = book?.refs.length ? book.refs : r.refs;
                const viaText = viaOk ? (
                  <>
                    {r.via!.word}{' '}
                    {via.map((v, k) => (
                      <Fragment key={k}>
                        {k ? (k === via.length - 1 ? ' и ' : ', ') : ''}
                        {v}
                      </Fragment>
                    ))}
                  </>
                ) : null;
                return (
                  <li class="fact" key={`d${i}`}>
                    {r.ids.length === 1 ? (
                      <>
                        <PN id={r.ids[0]} dis={r.via ? false : undefined} /> — {book ? book.term : lowerFirst(r.label)}
                        {viaText ? <>, {viaText}</> : null}
                      </>
                    ) : (
                      <>
                        {r.label}:{' '}
                        {r.ids.map((x, k) => (
                          // запятая держится за своё имя (.nobr): перенос не ставит её в начало строки
                          <Fragment key={x}>
                            {k ? (k === r.ids.length - 1 ? ' и ' : ' ') : ''}
                            <PN id={x} lower dis={r.via ? false : undefined} after={k < r.ids.length - 2 ? ',' : undefined} />
                          </Fragment>
                        ))}
                        {viaText ? <> — {viaText}</> : null}
                      </>
                    )}
                    <Refs refs={refs} owner={ns + `d12.${i}`} />
                    {book?.refs.length ? <Mark cert={book.cert} /> : <MarkNote label="выв." full="вывод: родство второй степени по связям, записанным в Писании" />}
                    <VerseInsert owner={ns + `d12.${i}`} refs={refs} />
                  </li>
                );
              })}
            </ul>
          ) : null}
          {facts(fresh(fate.keep, namesSeen([...kin.map((k) => (k.from === id ? k.to : k.from)), ...dRows.flatMap((r) => r.ids)], ...kin.map((k) => k.rel)), kin.flatMap((k) => k.refs)), 'n12')}
        </>
      ),
    );
  }
  // 13 — эпоха и относительная хронология
  if (c) put(13, RelativeChrono({ id, m, note: card?.chronoNote }));
  // 14 — встречи из текста со словами события; остальные современники по расчёту и дальняя родня — свёрнуто
  //      (решения 19, 62; CARD-55, CARD-80); у народа и рода § 14 не строится (решение 23; CARD-59)
  if (!people) {
    const data = section14(id, m, card);
    if (data && (data.rows.length || data.kin.length || data.calc.length))
      put(14, <Contemporaries id={id} m={m} card={card} ns={ns} />);
  }
  if (card) {
    // 15 — места по роли: «Родился: Вифлеем (см. § 8). Жил: …; Бывал: …; События: …» (F7; CARD-30)
    const byRole = new Map<Place['role'], { name: string; note?: string; refs: string[] }[]>();
    const add = (role: Place['role'], x: { name: string; note?: string; refs: string[] }) => byRole.set(role, [...(byRole.get(role) ?? []), x]);
    for (const pl of card.places ?? []) add(pl.role, pl);
    const roleRow = (role: Place['role'], see?: number) => {
      const xs = byRole.get(role) ?? [];
      const extra = role === 'birth' ? card.birth?.place : role === 'death' ? card.death?.place : undefined;
      // одно место под двумя названиями — одной записью: «земля Моавитская, гора Нево, вершина Фасги»
      const same = extra ? xs.findIndex((x) => x.name === extra || mergePlace(extra, x.name) !== null) : -1;
      const listed = !extra ? xs : same >= 0 ? xs.map((x, k) => (k === same ? { ...x, name: x.name === extra ? x.name : mergePlace(extra, x.name)! } : x)) : [{ name: extra, refs: [] as string[] }, ...xs];
      if (!listed.length) return null;
      return (
        <li class="fact" key={role}>
          <span class="muted">{placeRoleLabel(role, p.sex, people)}: </span>
          <PlaceList places={listed} owner={ns + `p15.${role}`} link={L} />
          {see ? (
            <>
              {' '}
              <span class="nobr">
                (<SeeSec n={see} />)
              </span>
            </>
          ) : null}
        </li>
      );
    };
    put(
      15,
      has(card.places, card.birth?.place, card.death?.place) && (
        <ul>
          {roleRow('birth', card.birth?.place ? 8 : undefined)}
          {roleRow('residence')}
          {roleRow('travel')}
          {roleRow('other')}
          {roleRow('death', card.death?.place ? 20 : undefined)}
          {roleRow('burial')}
        </ul>
      ),
    );
    // 16 — царствование: «Царь Иудеи, в Хевроне: воцарился в 30 лет; по тексту — семь лет и шесть месяцев (2 Цар 5:4–5); 1010–1003 гг. до Р. Х. — расч.»
    const reigns: (Omit<Reign, 'years' | 'refs'> & { years?: number | null; refs: string[] })[] =
      chrono?.reign ?? p.reign.map((r) => ({ ...r, refs: [] as string[] }));
    // должность «Царь над домом Иудиным в Хевроне» повторяет царствование со стихом той же главы: её стихи — к царствованию
    const offices = card.offices ?? [];
    const mergedInto = new Map<number, number>();
    offices.forEach((o, i) => {
      if (!/^Цар/.test(o.title)) return;
      const r = reigns.findIndex((x) => x.refs.some((q) => o.refs.some((w) => chapterOf(q) === chapterOf(w))) && (o.from === undefined || o.from === x.start));
      if (r >= 0) mergedInto.set(i, r);
    });
    const astro = (y: number) => (y <= 0 ? y + 1 : y); // в данных годы исторические, форматёр ждёт астрономические
    put(
      16,
      has(offices, reigns) && (
        <ul>
          {reigns.map((r, i) => {
            const title = reignTitle(r.over, p.sex) ?? `${bySex(p.sex, 'Царь', 'Царица')}; царство — ${r.over}`;
            // число лет по тексту; пояснение «по тексту — …» точнее круглого числа и заменяет его
            const noteIsText = !!r.note && /^по тексту/.test(r.note);
            const parts = [
              r.ageAtStart !== undefined ? `${bySex(p.sex, 'воцарился', 'воцарилась')} в ${yearsWord(r.ageAtStart)}` : null,
              noteIsText ? r.note : r.years ? `${yearsWord(r.years)} по тексту` : null,
            ].filter(Boolean);
            const refs = [...r.refs];
            for (const [oi, ri] of mergedInto) if (ri === i) for (const x of offices[oi].refs) if (!refs.some((q) => refKey(q) === refKey(x))) refs.push(x);
            // формат годов уже с U+2060 после «–»: диапазон не разрывается в конце строки
            const span = r.start === r.end ? formatYear(astro(r.start)) : formatSpan(astro(r.start), astro(r.end), false);
            return (
              <li class="fact" key={`r${i}`}>
                {title}: {parts.length ? parts.join('; ') : span}
                {/* «;» после стихов держится за последнюю ссылку, иначе перенос ставит его в начало строки */}
                <Refs refs={refs} owner={ns + `r16.${i}`} tail={parts.length ? ';' : undefined} />
                {parts.length ? ` ${span}` : ''}
                <MarkNote label="расч." full={MARK_FULL.reign} />
                {r.note && !noteIsText ? <div class="note">{capFirst(r.note)}</div> : null}
                <VerseInsert owner={ns + `r16.${i}`} refs={refs} />
              </li>
            );
          })}
          {offices.map((o, i) =>
            mergedInto.has(i) ? null : (
              <li class="fact" key={i}>
                {L(o.note ? `${o.title};` : o.title)}
                {o.note ? <span class="muted"> {L(o.note)}</span> : null}
                <Refs refs={o.refs} owner={ns + `o16.${i}`} />
                <VerseInsert owner={ns + `o16.${i}`} refs={o.refs} />
              </li>
            ),
          )}
        </ul>
      ),
    );
    // 17 — жизнеописание; длинное — с подзаголовками: у царей — периоды жизни по царствованиям, у остальных — части
    //      рассказа по книгам и главам (F5; CARD-21, CARD-58)
    {
      const ev = card.events ?? [];
      const parts = lifeParts(ev, p, c, chrono);
      // оглавление периодов с числом событий (CARD-85; решение 63): видно и в свёрнутом разделе, щелчок раскрывает период
      const anchor = (k: number) => `${ns}p17-${id}-${k}`;
      const counts = parts.map((r, k) => (k < parts.length - 1 ? parts[k + 1].from : ev.length) - r.from);
      put(
        17,
        ev.length ? (
          <>
            {parts.length >= 2 ? <PeriodToc parts={parts} counts={counts} anchor={anchor} /> : null}
          <ul>
            {ev.map((e, i) => {
              const k = parts.findIndex((r) => r.from === i);
              const part = k >= 0 ? parts[k] : undefined;
              // возраст на полях не повторяет возраст, названный словами в начале записи: «Двенадцати лет…» (CARD-68)
              const ageSaid = e.age !== undefined && leadingNumber(e.text) === e.age;
              return (
                <Fragment key={i}>
                  {part ? <li class="sub" id={anchor(k)}>{part.head}</li> : null}
                  <li class="fact">
                    {e.age !== undefined && !ageSaid ? <span class="muted">{yearsWord(e.age)}. </span> : e.year !== undefined && e.age === undefined ? <span class="muted">{withPeriodYear(e.year)} </span> : null}
                    {L(e.text)}
                    <Refs refs={e.refs} owner={ns + `e17.${i}`} />
                    <Mark cert={e.cert} />
                    <VerseInsert owner={ns + `e17.${i}`} refs={e.refs} />
                  </li>
                </Fragment>
              );
            })}
          </ul>
          </>
        ) : null,
      );
    }
    put(
      18,
      card.sayings?.length ? (
        <ul>
          {card.sayings.map((s, i) => {
            // к кому и когда — перед цитатой, с двоеточием (VIS-73): «Голиафу: «…» 1 Цар 17:45», а не строкой после ссылки
            const ctx = s.context?.trim().replace(/[.:;]\s*$/, '');
            return (
              <li class="fact quote" key={i}>
                {/* двоеточие держится за имя-ссылку («Голиафу:»): L склеивает знак с кнопкой (.nobr) */}
                {ctx ? <span class="muted">{L(`${capFirst(ctx)}:`)} </span> : null}
                «{s.quote}»
                <Refs refs={[s.ref]} owner={ns + `q18.${i}`} />
                <VerseInsert owner={ns + `q18.${i}`} refs={[s.ref]} />
              </li>
            );
          })}
        </ul>
      ) : null,
    );
    put(19, facts(card.withGod, 'g19'));
  }
  // 20 — смерть; возраст не повторяется, если запись составителя его уже называет («Прожил около 70 лет…»)
  {
    const bits: ComponentChildren[] = [];
    if (c?.d !== null && c?.d !== undefined && c.cls !== 'epochal') {
      const y = shownYears(c);
      const age = Math.round(c.d - c.b);
      const said = (card?.death?.facts ?? []).some((f) => new RegExp(`(^|\\D)${age}\\s+(лет|год)`).test(f.text));
      // dAge === false — год смерти свой, а не выведен из возраста (L1): «в возрасте N лет» тогда не пишется
      const line = said && y && y.d !== null ? formatYear(y.d, { approx: y.approx }) : deathLine(c.b, c.d, c.cls, c.b, c.b, c.dAge);
      bits.push(<p class="fact" key="y">{line}<YearMark cls={c.cls} /></p>);
    }
    if (card?.death?.place) bits.push(<p key="pl">Место: {card.death.place}</p>);
    put(20, has(bits, card?.death?.facts, card?.death?.burial) && (<>{bits}{facts(card?.death?.facts, 'd20')}{card?.death?.burial?.length ? <><p class="sub">Погребение</p>{facts(card.death.burial, 'u20')}</> : null}</>));
  }
  // 21 — линии Мессии (CARD-64): номер у Матфея — с местом в ряду из четырнадцати родов (Мф 1:17); номер у Луки —
  //      с направлением счёта; заметка составителя, которая сама начинается с названия линии, заменяет строку линии
  const j = lineMembership.joseph.get(id);
  const mm = lineMembership.mary.get(id);
  {
    const notes21 = card?.messiahNote ?? [];
    const jNote = j ? notes21.findIndex((f) => /^Линия Иосифа/.test(f.text)) : -1;
    const mNote = mm ? notes21.findIndex((f) => /^Линия по Луке/.test(f.text)) : -1;
    const lineNote = (k: number, swatch: 'gold' | 'azure') => {
      const f = notes21[k];
      return (
        <p class="fact">
          <span class={`swatch ${swatch}`} />
          {L(f.text)}
          <Refs refs={f.refs} owner={ns + `n21l${k}`} />
          <Mark cert={f.cert} />
          <VerseInsert owner={ns + `n21l${k}`} refs={f.refs} />
        </p>
      );
    };
    const lkRef = mm?.refs.find((r) => /^Лк\s/.test(r));
    const rest21 = notes21.filter((_, k) => k !== jNote && k !== mNote);
    const lineSeen = addSeen(new Set<string>(), j ? matthewLine(j) : '', mm ? lukeLine(mm) : '', 'Линия Иосифа Линия по Луке');
    // номер в родословии уже назван строкой линии: «41-й от Авраама» в заметке — повтор «41-е имя у Матфея» (CARD-81)
    const nums = [j?.mt, mm?.lk].filter((x): x is number => !!x);
    const dropNums = (f: Fact): Fact => {
      if (!nums.length) return f;
      const re = new RegExp(`(^|\\s)(${nums.join('|')})-(й|е|м|го)(?![0-9])`);
      const text = f.text
        .split(/(;\s+|\.\s+)/)
        .map((part) => (/^(;|\.)\s+$/.test(part) ? part : part.split(/,\s+/).filter((x) => !re.test(x)).join(', ')))
        .join('');
      return text === f.text ? f : { ...f, text };
    };
    put(
      21,
      has(j, mm, notes21) && (
        <>
          {j &&
            (jNote >= 0 ? (
              lineNote(jNote, 'gold')
            ) : (
              <p>
                <span class="swatch gold" />
                {matthewLine(j)}
                {j.flag === 'omitted-by-mt' ? ' — у Матфея опущен (Мф 1:8), в цепи по 4 Цар и 1 Пар 3' : ''}
                {j.flag === 'before-matthew' ? ' — участок до Авраама по Быт 5; 11 (Матфей начинает с Авраама)' : ''}
                {j.flag === 'legal' ? ' — законный сын Иосифа' : ''}
              </p>
            ))}
          {mm &&
            (mNote >= 0 ? (
              lineNote(mNote, 'azure')
            ) : (
              <p class="fact">
                <span class="swatch azure" />
                {lukeLine(mm)}
                {mm.flag === 'luke-only' ? ' — только у Луки' : ''}
                {mm.flag === 'interpretation' ? ' — по толкованию Лк 3:23 как родословия Марии' : ''}
                {lkRef && (mm.lk || mm.flag === 'luke-only') ? <Refs refs={[lkRef]} owner={ns + 'lk21'} /> : null}
                {lkRef && (mm.lk || mm.flag === 'luke-only') ? <VerseInsert owner={ns + 'lk21'} refs={[lkRef]} /> : null}
              </p>
            ))}
          {facts(fresh(rest21.map(dropNums), lineSeen, []), 'n21')}
        </>
      ),
    );
  }
  // 22 — упоминания в других книгах; запись на тех же стихах, что § 21, — повтор (у Руфи «В родословии… Мф 1:5»)
  if (card) {
    const used = new Set([...(card.messiahNote ?? []).flatMap((f) => f.refs), ...(j?.refs ?? []), ...(mm?.refs ?? [])].map(refKey));
    const later = (card.laterMentions ?? []).filter((f) => !(f.refs.length && f.refs.every((r) => used.has(refKey(r)))));
    put(22, facts(later, 'l22'));
  }
  put(23, Object.keys(p.books).length || card?.scripture?.first || card?.scripture?.key?.length ? CanonStrip({ books: p.books, first: card?.scripture?.first, keyRefs: card?.scripture?.key, id }) : null);
  // 24 — хронологические напряжения целиком, со всеми стихами (в § 13 — одной записью и «Подробнее см. § 24»;
  //      CARD-61), затем примечания составителя
  {
    const tensions = c ? m.tensions.filter((t) => t.persons.includes(id)) : [];
    const notes = card?.notes ?? [];
    put(
      24,
      tensions.length || notes.length ? (
        <ul>
          {tensions.map((t, i) => (
            <li class="fact" key={`t${i}`}>
              <span class="muted">Хронологическое напряжение. </span>
              {L(t.text)}
              <Refs refs={t.refs} owner={ns + `t24.${i}`} />
              {t.cert === 'interpretation' ? <Mark cert="interpretation" /> : null}
              <VerseInsert owner={ns + `t24.${i}`} refs={t.refs} />
            </li>
          ))}
          {notes.map((n, i) => (
            <li class="fact" key={`n${i}`}>
              <span class="muted">{NOTE_KIND[n.kind]}. </span>
              {L(n.text)}
              <Refs refs={n.refs} owner={ns + `n24.${i}`} />
              <VerseInsert owner={ns + `n24.${i}`} refs={n.refs} />
            </li>
          ))}
        </ul>
      ) : null,
    );
  }

  return out;
}

/**
 * Текст факта: имена лиц — ссылки (F12), перекрёстная ссылка «см. § 24» — команда перехода к разделу (CARD-31).
 * Знак сразу за командой держится за неё (.nobr).
 */
function linkText(t: string, cands: LinkCand[]): ComponentChildren {
  if (!/см\.\s*§\s*\d/.test(t)) return linkNames(t, cands);
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const m of t.matchAll(/см\.\s*§\s*(\d+)([),.;:]*)/g)) {
    if (m.index! > at) out.push(linkNames(t.slice(at, m.index), cands));
    out.push(
      <span class="nobr" key={m.index}>
        <SeeSec n={Number(m[1])} />
        {m[2]}
      </span>,
    );
    at = m.index! + m[0].length;
  }
  if (at < t.length) out.push(linkNames(t.slice(at), cands));
  return out;
}

/** Остальные имена в тексте встречи — тоже ссылки: к уже связанному имени лица встречи добавить ссылки окружения. */
function L2(parts: ComponentChildren[], cands: LinkCand[]): ComponentChildren {
  return parts.map((x) => (typeof x === 'string' ? linkNames(x, cands) : x));
}

const RYAD = ['', 'первом', 'втором', 'третьем'];
/**
 * «Линия Иосифа: 14-е имя у Матфея, последнее в первом ряду из четырнадцати родов (Мф 1:17)» (CARD-64):
 * три ряда по четырнадцать — Авраам…Давид, Соломон…Иоаким, Иехония…Иисус (ТЗ § 3.2).
 */
export function matthewLine(j: { mt?: number; mtGroup?: number }): string {
  if (!j.mt) return 'Линия Иосифа';
  const g = j.mtGroup ?? Math.ceil(j.mt / 14);
  const pos = j.mt - 14 * (g - 1);
  const where = pos === 14 ? 'последнее' : pos === 1 ? 'первое' : `${pos}-е`;
  return `Линия Иосифа: ${j.mt}-е имя у Матфея, ${where} в ${RYAD[g] ?? ''} ряду из четырнадцати родов (Мф 1:17)`;
}
/**
 * «Линия по Луке: 42-е имя у Луки, считая от Иосифа» — Лука ведёт родословие вверх, от Иосифа (1) до Адама (75);
 * у Иисуса Христа номера нет: с Него родословие начинается (Лк 3:23).
 */
export function lukeLine(m: { lk?: number; flag: string }): string {
  if (m.lk) return `Линия по Луке: ${m.lk}-е имя у Луки, считая от Иосифа`;
  if (m.flag === 'interpretation' || m.flag === 'luke-only') return 'Линия по Луке';
  return 'Линия по Луке: с Него начинается родословие — «был, как думали, Сын Иосифов, Илиев» (Лк 3:23)';
}

type Ev = NonNullable<Card['events']>[number];
/** Часть жизнеописания: с какой записи начинается и её подзаголовок. */
export type LifePart = { from: number; head: string };

/** Жизнеописание длиннее восьми записей делится на части; короче — без подзаголовков. */
const PARTS_FROM = 9;

/**
 * Части § 17 (CARD-58): периоды жизни, а не книги.
 * — Царь: «До воцарения», затем царствования словами § 16 («Царь Иудеи, в Хевроне», «Царь всего Израиля»),
 *   «После царствования». Период записи — по её году или возрасту; запись без года остаётся в периоде предыдущей
 *   (записи идут по порядку жизни).
 * — Остальные: части рассказа по книгам и главам («Исх 2–4», «Чис 11–14»); часть из одной записи присоединяется
 *   к соседней, длинная часть делится по главам на части по 6–10 записей.
 * Меньше двух частей — подзаголовков нет.
 */
export function lifeParts(ev: Ev[], p: AtlasPerson, c: ChronoRow | undefined, chrono: Chrono | null): LifePart[] {
  // периоды, заданные составителем (поле period; решение 63): запись без периода — в периоде предыдущей
  if (ev.some((e) => e.period)) {
    const out: LifePart[] = [];
    let cur: string | null = null;
    ev.forEach((e, i) => {
      const k = e.period ?? cur;
      if (k && k !== cur) {
        out.push({ from: i, head: k });
        cur = k;
      }
    });
    if (out.length && out[0].from > 0) out[0] = { ...out[0], from: 0 };
    return out.length >= 2 ? out : [];
  }
  if (ev.length < PARTS_FROM) return [];
  const reigns = [...(chrono?.reign ?? p.reign)].sort((a, b) => a.start - b.start);
  if (reigns.length && c) {
    const astro = (y: number) => (y <= 0 ? y + 1 : y);
    const yearOf = (e: Ev) => (e.year !== undefined ? astro(e.year) : e.age !== undefined ? c.b + e.age : null);
    const periodOf = (y: number) => {
      if (y < astro(reigns[0].start)) return 0;
      const k = reigns.findIndex((r) => y >= astro(r.start) && y < astro(r.end));
      if (k >= 0) return k + 1;
      return y <= astro(reigns[reigns.length - 1].end) ? reigns.length : reigns.length + 1;
    };
    const heads = ['До воцарения', ...reigns.map((r) => reignTitle(r.over, p.sex) ?? `${bySex(p.sex, 'Царь', 'Царица')}: ${r.over}`), 'После царствования'];
    const out: LifePart[] = [];
    let cur = -1;
    ev.forEach((e, i) => {
      const y = yearOf(e);
      const k = y === null ? Math.max(cur, 0) : Math.max(cur, periodOf(y));
      if (k !== cur) {
        // соседние царствования с одним названием («Царь Иудеи» дважды) — одна часть
        if (!out.length || out[out.length - 1].head !== heads[k]) out.push({ from: i, head: heads[k] });
        cur = k;
      }
    });
    if (out.length >= 2) return out;
  }
  // у остальных — без подзаголовков: номер главы («Быт 11–13») не период жизни и не отличим от ссылки (решение 63)
  return [];
}

/** Оглавление периодов § 17 (CARD-85): «До воцарения (19); Царь Иудеи, в Хевроне (3); …» — щелчок раскрывает раздел и ведёт к периоду. */
function PeriodToc({ parts, counts, anchor }: { parts: LifePart[]; counts: number[]; anchor: (k: number) => string }) {
  const go = (k: number) => (e: Event) => {
    const sec = (e.currentTarget as HTMLElement).closest<HTMLElement>('[id^="sec-"]');
    const more = sec?.querySelector<HTMLButtonElement>('.clamp-more');
    if (more) more.click();
    // после раскрытия раздела (Clamp) — к подзаголовку периода; фокус — на него, чтобы клавиатура продолжила оттуда
    window.setTimeout(() => {
      const h = document.getElementById(anchor(k));
      if (!h) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      h.setAttribute('tabindex', '-1');
      h.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      h.focus({ preventScroll: true });
    }, more ? 80 : 0);
  };
  return (
    <p class="periods">
      <span class="muted">По периодам: </span>
      {parts.map((r, k) => (
        <Fragment key={k}>
          {k ? ' ' : ''}
          <span class="nobr">
            <button type="button" class="see" onClick={go(k)}>
              {r.head}
            </button>{' '}
            <span class="muted">({counts[k]}){k < parts.length - 1 ? ';' : ''}</span>
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** «ок. 6 г. до Р. Х.» на поле строки события; год оканчивается точкой сокращения — вторую не ставить (CARD-26). */
function withPeriodYear(y: number): string {
  const s = formatYear(y <= 0 ? y + 1 : y, { approx: true });
  return /[.…]$/.test(s) ? s : `${s}.`;
}

const NOTE_KIND: Record<string, string> = { textual: 'Текст', interpretation: 'Толкование', identification: 'Отождествление', chronology: 'Хронология', bracket: 'Скобки Синодального текста' };
