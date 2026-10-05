/**
 * Карточка союза в листе карточки (решения владельца 67 и 71): брак или связь двух лиц, от которой пошли дети, —
 * отдельный предмет изучения. Вёрстка — как у карточки лица (шапка, паспорт-таблица, заголовки разделов), но без
 * 24 разделов: супруги, дети этого союза в порядке перечня, происхождение каждого супруга, команда «Показать детей союза»
 * (на небе — «показать» / «скрыть», словарь 109).
 *
 * Всё — только из данных атласа (src/engine/unions.ts): связи «отец», «мать», «жена», «наложница» со стихами.
 * Неназванное место — «не названа в Писании»; портретов и «реконструкций» нет.
 *
 * Здесь же — ссылка на карточку союза (UnionLink) для § 9 и § 10 карточки лица и строки союза для диктора: имя в
 * косвенном падеже ставится только функцией склонения (src/ui/text/ru.ts), иначе — после двоеточия, в именительном.
 */
import { Fragment, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, graph, lineMembership, persons } from '../../data/atlas.ts';
import type { Cert, Sex } from '../../data/types.ts';
import { kidEdges, membersOf, partnerIn, type Union } from '../../engine/unions.ts';
import { dateText, isWide, lifeDates, shownPoint, shownYears, spanText, type DateVal } from '../../engine/years.ts';
import { model } from '../../state.ts';
import { expanded, originOf, selectUnion, toggleUnion, unions, unionsOf } from '../reveal.ts';
import { askCards, cardsTick, othersNote, othersUnionOf } from './star.ts';
import { loadedCard } from '../../data/atlas.ts';
import { refShort } from '../linkwords.ts';
import { skyMode, workSet } from '../work.ts';
import { show, showContent } from '../show.ts';
import { Mark, P, Refs, VerseInsert, plural } from '../common.tsx';
import { bySex, capFirst, childrenNoun, lowerFirst, MESSIAH_BIRTH, nameCase, otherChildLabel, otherParentLabel } from '../text/ru.ts';
import { typo, typoTree } from '../text/typo.ts';
import { isPeople, passportYears } from './Masthead.tsx';
import { YearMark } from './Chrono.tsx';
import { datesOf, modelColophon } from './shared.tsx';
import { focusQuietly } from '../focus.ts';
import { toggleKids, unionDotCmd } from '../sky/starnav.ts';
import { ChronoText } from '../panels/Chronology.tsx';
import { familyOrderNote } from '../../render/links.ts';
import { isClaimUnion, unionName } from '../linkwords.ts';

/** Стихи о зачатии от Духа Святаго (Мф 1:18, 20; Лк 1:35) — у Иисуса Христа в перечне детей союза Иосифа и Марии. */
const MESSIAH_REFS = MESSIAH_BIRTH.mother.refs;

const nameOf = (id: string) => byId.get(id)?.name ?? id;
/** Имя в середине строки: описательное имя безымянного («Дочь Шуи») — со строчной. */
const midName = (id: string) => (byId.get(id)?.unnamed ? lowerFirst(nameOf(id)) : nameOf(id));

/** Союз иного рода — отдельный союз с пометой (решение 67): «по закону», «по Луке», усыновление. */
export { isClaimUnion };

/** Коротко о союзе иного рода — в подписях ссылок и у диктора. */
const CLAIM_SHORT: Record<string, string> = {
  legal: 'по закону',
  adoptive: 'усыновление',
  'by-luke': 'по родословию Луки',
  ancestor: 'без промежуточных звеньев',
  levirate: 'по закону ужичества',
  alternative: 'по другому месту Писания',
};
const claimShort = (claim: string) => CLAIM_SHORT[claim] ?? 'по иному указанию';

/** Кто назван в союзе иного рода: отец (a) или мать (b). */
const claimRole = (u: Union): 'father' | 'mother' => (u.a ? 'father' : 'mother');

/**
 * Заголовок карточки союза: «Авраам и Агарь»; второе лицо не названо — «Сиф и его жена» (решение 75), а если у лица есть
 * и названные супруги — «Давид (мать не названа)»; у союза иного рода и у народа — одно имя. Одно название на небе,
 * в карточках и в словах связи (src/ui/linkwords.ts, unionName).
 */
export const unionTitle = (u: Union): string => unionName(u);

/**
 * Строка под заголовком: кто в Писании не назван («Мать детей в Писании не названа») или какого рода союз
 * («Приёмный отец», «Отец по родословию Луки»). У народа из родословия (Быт 10) о матери не говорится: null.
 */
export function unionSub(u: Union): string | null {
  if (isClaimUnion(u)) return capFirst(otherParentLabel(u.claim!, claimRole(u)));
  const named = u.a ?? u.b;
  if (named && isPeople(named)) return null;
  if (!u.b) return 'Имя жены в Писании не названо';
  if (!u.a) return 'Имя мужа в Писании не названо';
  return null;
}

/**
 * Имя карточки союза для диктора: «Карточка союза Авраама и Агари». Склонение — только функцией ru.ts; если имя
 * не склоняется надёжно — «Карточка союза: Авраам и дочь Шуи».
 */
export function unionAria(u: Union): string {
  const ids = [u.a, u.b].filter((x): x is string => !!x);
  const gen = ids.map((x) => {
    const q = byId.get(x);
    return q ? nameCase(q.name, q.sex, 'gen', q.unnamed, q.alt) : null;
  });
  const tail = isClaimUnion(u) ? `, ${claimShort(u.claim!)}` : '';
  if (gen.length && gen.every(Boolean)) return `Карточка союза ${gen.join(' и ')}${tail}`;
  return `Карточка союза: ${unionTitle(u)}${tail}`;
}

/** «Евеар, Елисуа и ещё 9»: дети союза в подписи ссылки — первые двое и число остальных. */
function kidsBrief(u: Union): string {
  const names = u.kids.map(midName);
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}` : names.join(' и ');
}

/**
 * Подпись ссылки на союз в перечне союзов лица who (другие союзы супруга, союзы ребёнка): второе лицо союза («Сарра»);
 * если его нет — дети союза с пометой: «Евеар, Елисуа и ещё 9 (мать не названа)», «Манассия и Ефрем (усыновление)».
 */
export function unionLinkText(u: Union, who: string): string {
  const other = partnerIn(u, who);
  if (other) return midName(other);
  const kids = kidsBrief(u) || unionTitle(u);
  if (isClaimUnion(u)) return `${kids} (${claimShort(u.claim!)})`;
  return `${kids} (${u.a === who ? 'мать не названа' : 'отец не назван'})`;
}

/**
 * Подпись ссылки на союз происхождения: родители («Исаак и Ревекка», «Фарра (мать не названа)»,
 * «Илий (по родословию Луки)»).
 */
export function originLinkText(u: Union): string {
  if (isClaimUnion(u)) return `${unionTitle(u)} (${claimShort(u.claim!)})`;
  const named = u.a ?? u.b;
  // здесь речь о родителях: «Фарра (мать не названа)», а не «Фарра и его жена (…)»
  if (!u.b && named && !isPeople(named)) return `${nameOf(named)} (мать не названа)`;
  if (!u.a && named && !isPeople(named)) return `${nameOf(named)} (отец не назван)`;
  return unionTitle(u);
}

/**
 * Ссылка на карточку союза (решение 71): в § 9 и § 10 карточки лица — «союз», в карточке союза — подпись перечня.
 * Имя для диктора — «Карточка союза Авраама и Агари»; у подписи-имени видимый текст стоит в начале имени (WCAG 2.5.3).
 */
export function UnionLink({ u, children }: { u: Union; children?: string }) {
  const label = children ? `${children} — ${lowerFirst(unionAria(u))}` : unionAria(u);
  return (
    <button
      type="button"
      class="ulink"
      data-union={u.id}
      aria-label={label}
      onClick={(e) => {
        opener = { uid: u.id, sec: (e.currentTarget as HTMLElement).closest('.sec')?.id || null };
        selectUnion(u.id);
      }}
    >
      {children ?? 'союз'}
    </button>
  );
}

/** Откуда открыли карточку союза: раздел карточки лица (§ 9 или § 10) — туда возвращается фокус после «×» и Escape. */
let opener: { uid: string; sec: string | null } | null = null;
/** Раздел карточки лица, из которого открыт союз uid (id раздела: «sec-10»), или null. */
export const openerSection = (uid: string): string | null => (opener && opener.uid === uid ? opener.sec : null);

/** Ссылки на союзы через «;» (в подписях детей есть запятые). */
function UnionLinks({ us, who }: { us: Union[]; who: string }) {
  return (
    <>
      {us.map((u, i) => (
        <Fragment key={u.id}>
          {i ? '; ' : ''}
          <UnionLink u={u}>{typo(unionLinkText(u, who))}</UnionLink>
        </Fragment>
      ))}
    </>
  );
}

// ---------- порядок и годы детей ----------

/** Год рождения лица для показа (астрономический) или null: у лиц без опор и у народов года нет. */
const birthOf = (id: string): number | null => {
  const c = model.value.chrono.get(id);
  return c ? shownYears(c)?.b ?? null : null;
};

/** Место лица в данных: порядок перечисления (тома — по порядку Писания, лица — по порядку текста в томе). */
const listedAt = (() => {
  const m = new Map<string, number>();
  persons.forEach((q, i) => m.set(q.id, i));
  return m;
})();
const listed = (id: string) => listedAt.get(id) ?? 1e9;

/**
 * Порядок детей в перечне (решение 104; X4 § 2.2): одинаков в § 10, в «Родстве» у звезды и в карточке союза.
 *  1. порядок текста — поле order (ord индекса): «Рувим, Симеон, Левий, Иуда…»;
 *  2. ребёнок без него — по году рождения: он встаёт после последнего ребёнка с порядком текста, родившегося не позже
 *     его (Мариам — перед Аароном и Моисеем, Исх 2:4; Махалафа — после сыновей Измаила);
 *  3. при равенстве — по порядку перечисления в данных.
 * Ребёнок без года получает год того, кто перед ним в данных (первые без года — в начале). Значимость (линии Мессии,
 * яркость звезды) места не меняет: она показывается знаком (dc-lines).
 */
export function kidsInOrder(ids: readonly string[], yearOf: (id: string) => number | null = birthOf): string[] {
  const uniq = [...new Set(ids)].sort((a, b) => listed(a) - listed(b));
  const key = new Map<string, number>();
  let last = -Infinity;
  for (const k of uniq) {
    const y = yearOf(k);
    if (y !== null) last = y;
    key.set(k, y ?? last);
  }
  const ord = (k: string) => byId.get(k)?.order ?? null;
  const skeleton = uniq.filter((k) => ord(k) !== null).sort((a, b) => ord(a)! - ord(b)! || listed(a) - listed(b));
  const rest = uniq.filter((k) => ord(k) === null).sort((a, b) => key.get(a)! - key.get(b)! || listed(a) - listed(b));
  if (!skeleton.length) return rest;
  // место ребёнка без порядка текста — после последнего ребёнка с порядком, родившегося не позже его
  const slots: string[][] = skeleton.map(() => []);
  const head: string[] = [];
  for (const k of rest) {
    let at = -1;
    // при равном годе — по порядку перечисления в данных
    skeleton.forEach((s, i) => {
      const ks = key.get(s)!;
      const kk = key.get(k)!;
      if (ks < kk || (ks === kk && listed(s) < listed(k))) at = i;
    });
    (at < 0 ? head : slots[at]).push(k);
  }
  return [...head, ...skeleton.flatMap((s, i) => [s, ...slots[i]])];
}

/** Дети союза в порядке перечня (kidsInOrder): тот же порядок, что в § 10 и в «Родстве». */
export function kidsInBirthOrder(u: Union, yearOf: (id: string) => number | null = birthOf): string[] {
  return kidsInOrder(u.kids, yearOf);
}

/** Лицо на линии Мессии (Мф 1 или Лк 3): в перечнях его не прячет «ещё N» (решение 104). */
export const onLine = (id: string) => lineMembership.joseph.has(id) || lineMembership.mary.has(id);

/**
 * Знак лент у имени в перечне (решение 104: значимость — знаком, а не местом): золотая точка — линия Иосифа, лазурная —
 * линия по Луке; те же точки, что у имени в карточке у звезды (.dc-lines). Для диктора — подсказка, сам знак — рисунок.
 */
export function LineDots({ id }: { id: string }) {
  const mt = lineMembership.joseph.has(id);
  const lk = lineMembership.mary.has(id);
  if (!mt && !lk) return null;
  const title = mt && lk ? 'Линия Иосифа и линия по Луке' : mt ? 'Линия Иосифа' : 'Линия по Луке';
  // обёртка — <i>, а не <span>: знак препинания за именем держится в той же .nobr (проверка tests/typo.test.ts)
  return (
    <i class="dc-lines ln" aria-hidden="true" title={title}>
      {mt && <i class="mt" />}
      {lk && <i class="lk" />}
    </i>
  );
}

/**
 * Порядок групп детей по второму родителю (CARD-57; решение 104, X4 § 2.2 п. 3): группа с ребёнком линии Мессии — первой
 * (это не старшинство, а место значимого союза); остальные — в порядке браков (rank — номер союза в unionsOf), без него —
 * по первому ребёнку группы: порядок текста, если у обоих первых детей один отец и порядок назван, иначе год рождения,
 * иначе порядок данных; второй родитель не назван — последней. Одно правило для § 10 и «Родства» у звезды.
 */
export function compareKidGroups(a: { named: boolean; kids: readonly string[]; rank?: number }, b: { named: boolean; kids: readonly string[]; rank?: number }): number {
  if (a.named !== b.named) return a.named ? -1 : 1;
  const la = a.kids.some(onLine);
  const lb = b.kids.some(onLine);
  if (la !== lb) return la ? -1 : 1;
  // остальные союзы — в порядке браков, как их называют данные (unionsOf): у Иакова — Лия, Рахиль, Валла, Зелфа
  // (Быт 35:23–26), у Давида — Ахиноама, Авигея, Мааха… (2 Цар 3:2–5); строка «Жёны» идёт в том же порядке
  if (a.rank !== undefined && b.rank !== undefined && a.rank !== b.rank) return a.rank - b.rank;
  const x = a.kids[0];
  const y = b.kids[0];
  if (!x || !y) return 0;
  const px = byId.get(x);
  const py = byId.get(y);
  if (px?.order != null && py?.order != null && px.father && px.father === py.father && px.order !== py.order) return px.order - py.order;
  const bx = birthOf(x);
  const by = birthOf(y);
  if (bx !== null && by !== null && bx !== by) return bx - by;
  return listed(x) - listed(y);
}

/**
 * Годы союза — рождение первого и последнего ребёнка по текущей модели: «дети родились ок. 1925–1910 гг. до Р. Х.»,
 * «сын родился в 1926 г. до Р. Х.». null — детей нет; exact — все годы по числам текста; early — первый год
 * (для колофона: годы до 967 г. до Р. Х. зависят от модели).
 */
export function unionYears(u: Union): { text: string; exact: boolean; early: number; first: string | null } | null {
  const kids = u.kids.filter((k) => !isPeople(k));
  if (!kids.length) return null;
  const m = model.value;
  // годы детей словами словаря дат (решение 96) — с теми же границами, что паспорт каждого ребёнка (datesOf)
  const rows = kids.flatMap((k) => {
    const c = m.chrono.get(k);
    const ld = c ? lifeDates(datesOf(k, c, m.chrono)) : null;
    return ld && c ? [{ k, v: ld.birth, t: shownPoint(ld.birth), exact: c.cls === 'exact' }] : [];
  });
  const sexes = kids.map((k) => byId.get(k)?.sex ?? 'm') as Sex[];
  const one = kids.length === 1;
  const who = `${lowerFirst(childrenNoun(sexes))} ${one ? bySex(sexes[0], 'родился', 'родилась') : 'родились'}`;
  if (!rows.length) return { text: `время рождения ${one ? bySex(sexes[0], 'сына', 'дочери') : 'детей'} не установлено`, exact: false, early: Infinity, first: null };
  const lo = rows.reduce((a, b) => (b.t < a.t ? b : a));
  const hi = rows.reduce((a, b) => (b.t > a.t ? b : a));
  // оба края — оценки (без границы текста): один промежуток на всех детей — «между 1922 и 1909 гг. до Р. Х.», а не
  // «между 1922 и 1910 — ок. 1915 гг.», где второй год лежит внутри первого промежутка
  // (край «не раньше / не позже» — граница текста — остаётся своими словами; узкий общий промежуток — прежним «ок.»)
  const bound = (v: DateVal) => /^не\s/.test(dateText(v));
  const merged: DateVal | null =
    lo.v.est && hi.v.est && !bound(lo.v) && !bound(hi.v)
      ? (() => {
          const a = Math.min(...rows.map((r) => r.v.lo ?? r.v.t));
          const b = Math.max(...rows.map((r) => r.v.hi ?? r.v.t));
          // граница текста у крайнего ребёнка (Рувим — не раньше прихода к Лавану) держит и общий край
          const pin = rows.some((r) => r.v.pin === 'lo' && (r.v.lo ?? r.v.t) === a) ? 'lo' : rows.some((r) => r.v.pin === 'hi' && (r.v.hi ?? r.v.t) === b) ? 'hi' : undefined;
          const v: DateVal = { t: Math.round((a + b) / 2), est: true, lo: a, hi: b, ...(pin ? { pin } : {}) };
          return isWide(v) ? v : null;
        })()
      : null;
  const span = merged ? dateText(merged) : lo.t === hi.t ? dateText(lo.v) : spanText(lo.v, hi.v);
  return { text: `${who} ${/^\d/.test(span) ? 'в ' : ''}${span}`, exact: rows.every((r) => r.exact), early: lo.t, first: lo.k };
}

// ---------- стихи и уровни ----------

const refKey = (r: string) => r.replace(/\s+/g, '');
const uniqRefs = (rs: string[]) => {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(refKey(r)) ? false : (seen.add(refKey(r)), true)));
};
const CERT_RANK: Record<Cert, number> = { scripture: 0, inference: 1, interpretation: 2 } as Record<Cert, number>;
const worst = (cs: Cert[]): Cert => cs.reduce<Cert>((a, b) => ((CERT_RANK[b] ?? 0) > (CERT_RANK[a] ?? 0) ? b : a), 'scripture');

/** Связи ребёнка с родителями союза: у союза иного рода — только утверждения этого рода, у обычного — отец и мать. */
export function kinOf(u: Union, kid: string) {
  const es = kidEdges(graph, u, kid).filter((e) => (isClaimUnion(u) ? e.kind.startsWith('other') && e.claim === u.claim : e.kind === 'father' || e.kind === 'mother'));
  return { refs: uniqRefs(es.flatMap((e) => e.refs)), cert: worst(es.map((e) => e.cert)), edges: es };
}

/** Стихи отцовства иного рода у обычного союза (Иосиф — законный отец Иисуса Христа, Мф 1:16). */
function claimRefs(u: Union): string[] {
  if (isClaimUnion(u)) return u.refs;
  // вид отцовства у обычного союза — это вид связи «отец» (src/engine/unions.ts, buildUnions)
  return uniqRefs(u.kids.flatMap((k) => kidEdges(graph, u, k).filter((e) => e.kind === 'father' && e.claim === u.claim).flatMap((e) => e.refs)));
}

// ---------- карточка ----------

/** Одноимённые в атласе: у них в перечне — уточнение. */
const nameCount = (() => {
  const m = new Map<string, number>();
  for (const q of persons) m.set(q.name, (m.get(q.name) ?? 0) + 1);
  return m;
})();

/** Лицо в перечне карточки союза: ссылка, знак лент (mark, у детей — решение 104), уточнение одноимённого, годы. */
function Who({ id, mark = false }: { id: string; mark?: boolean }) {
  const q = byId.get(id)!;
  const years = passportYears(id, model.value.chrono.get(id), isPeople(id));
  // скобки внутри уточнения — через запятую, как в разделах карточки: «Илий (сын Матфата, Лк 3:23, …)»
  const dis = q.disambig && (nameCount.get(q.name) ?? 0) > 1 ? q.disambig.replace(/\s*\(([^)]*)\)/g, ', $1') : '';
  return (
    <>
      <P id={id} />
      {mark ? <LineDots id={id} /> : null}
      {dis ? <span class="muted"> ({typo(dis)})</span> : null}
      <span class="muted">, {typo(years || (isPeople(id) ? 'без года' : 'время не установлено'))}</span>
    </>
  );
}

/** Вид связи по данным: «Агарь — жена Авраама», «наложница», «отец и мать детей»; у союза иного рода — его название. */
function kindText(u: Union): string {
  if (isClaimUnion(u)) return `${nameOf((u.a ?? u.b)!)} — ${lowerFirst(otherParentLabel(u.claim!, claimRole(u)))}`;
  if (u.kind === 'wife' || u.kind === 'concubine') {
    const word = u.kind === 'concubine' ? 'наложница' : 'жена';
    const a = u.a ? byId.get(u.a) : null;
    const gen = a ? nameCase(a.name, a.sex, 'gen', a.unnamed, a.alt) : null;
    return u.b ? `${nameOf(u.b)} — ${word}${gen ? ` ${gen}` : ''}` : word;
  }
  if (u.a && u.b) return 'отец и мать детей';
  return u.a ? 'отец детей' : 'мать детей';
}

/**
 * Команда «Показать детей союза» / «Скрыть детей союза» (словарь 109: на небе — «показать» и «скрыть», «свернуть» —
 * только у карточки и листа); у союза без детей — «Показать союз» / «Скрыть союз». Строка состояния для диктора — что
 * изменилось на небе.
 */
function RevealCommand({ u, from }: { u: Union; from: string }) {
  const open = u.id in expanded.value;
  // показ «набор» (этап 20, решение 194): команда — словами карточки у ромба, которой на широком экране больше нет:
  // «Показать детей союза (3)», «Показать ещё (6)», «Показать родителей» (ромб у ребёнка), «Скрыть детей союза»; раскрытие —
  // как с ромба (toggleKids): объявление небом, число лиц
  const sky = show.value.kind === 'set' ? unionDotCmd(u, from) : null;
  const [said, setSaid] = useState('');
  const members = membersOf(u);
  const total = members.length;
  // счётчик считает то, что говорит подпись (решение 126; UI-20): «на небе сейчас» — участники текущего показа (с гостями);
  // во «Всём небе» на нём все — счётчика нет; «в наборе» — набор, если он не пуст
  const content = showContent.value;
  const onSky = show.value.kind === 'all' ? null : members.filter((m) => content.ids.has(m) || content.guests.has(m)).length;
  const inSet = workSet.value.size || skyMode.value === 'work' ? members.filter((m) => workSet.value.has(m)).length : null;
  const of = `из ${total} ${plural(total, 'лица', 'лиц', 'лиц')} союза`;
  return (
    <div class="actions union-actions">
      <button
        type="button"
        class="union-reveal"
        title={open ? 'Убрать с неба лиц, раскрытых через этот союз' : 'Показать на небе «набор» обоих супругов и всех детей этого союза'}
        aria-label={sky?.label}
        onClick={() => {
          const was = workSet.peek().size;
          if (sky) toggleKids(u.id, from);
          else toggleUnion(u.id, from);
          const now = workSet.peek().size;
          const n = Math.abs(now - was);
          const who = `${n} ${plural(n, 'лицо', 'лица', 'лиц')}`;
          setSaid(now >= was ? `На небе «набор» показано ещё: ${who}` : `Скрыто, с неба убрано: ${who}`);
        }}
      >
        {sky ? sky.text : u.kids.length ? (open ? 'Скрыть детей союза' : 'Показать детей союза') : open ? 'Скрыть союз' : 'Показать союз'}
      </button>
      {onSky !== null ? <span class="union-onsky">{typo(`на небе сейчас ${onSky} ${of}`)}</span> : null}
      {inSet !== null ? <span class="union-onsky">{typo(`в наборе ${inSet} ${of}`)}</span> : null}
      <span class="visually-hidden" role="status">
        {said}
      </span>
    </div>
  );
}

/** Сколько детей союза видно сразу; остальные — «ещё N записей» (дети линии Мессии видны всегда, решение 104). */
const KIDS_SHOWN = 8;

/**
 * Перечень детей союза с «ещё N записей» (решение 104): видны первые KIDS_SHOWN детей и все дети линии Мессии на своих
 * местах — у Давида и Вирсавии Соломон не уходит под «ещё»; скрытых меньше двух — видны все.
 */
function KidsCut({ sig, kids, children }: { sig: string; kids: string[]; children: (shown: string[]) => ComponentChildren }) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const kept = kids.filter((k, i) => i < KIDS_SHOWN || onLine(k));
  const hidden = kids.length - kept.length;
  const cut = openFor !== sig && hidden > 1;
  return (
    <>
      {children(cut ? kept : kids)}
      {cut ? (
        <button type="button" class="more clamp-more" onClick={() => setOpenFor(sig)}>
          ещё{'\u00a0'}{hidden}{'\u00a0'}{plural(hidden, 'запись', 'записи', 'записей')}
        </button>
      ) : null}
    </>
  );
}

/** «Другие сыновья и дочери» (Быт 5:4): у союза отца, который «родил сынов и дочерей», — строка со стихом. */
export function othersLine(u: Union): string | null {
  void cardsTick.value;
  if (!u.a || othersUnionOf(unions, u.a)?.id !== u.id) return null;
  const card = loadedCard(u.a);
  if (!card) {
    askCards([u.a]);
    return null;
  }
  const f = othersNote(card);
  return f ? `Другие сыновья и дочери: имена не названы${f.refs[0] ? ` (${refShort(f.refs[0])})` : ''}` : null;
}

/**
 * Карточка союза (решение 71). u — союз; from — лицо, из карточки которого пришли: от него союз раскрывается на небе
 * (не член союза — первый супруг). Заголовок получает фокус, если фокус потерялся (ссылка «союз» ушла из разметки
 * вместе с карточкой лица).
 */
export function UnionCard({ u, from }: { u: Union; from?: string | null }) {
  const title = useRef<HTMLHeadingElement>(null);
  const m = model.value;
  useLayoutEffect(() => {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (!a || a === document.body || !a.isConnected) focusQuietly(title.current);
  }, [u.id]);
  const by = from && membersOf(u).includes(from) ? from : (u.a ?? u.b ?? u.kids[0]);
  const sub = unionSub(u);
  const claim = isClaimUnion(u);
  const years = unionYears(u);
  const kids = kidsInBirthOrder(u);
  const sexes = kids.map((k) => byId.get(k)?.sex ?? 'm') as Sex[];
  const spouses = [u.a, u.b].filter((x): x is string => !!x);
  const ownKey = `union|${u.id}`;
  // стихи отцовства иного рода у обычного союза: «Иосиф — законный отец» (Мф 1:16)
  const jointClaim = !claim && u.claim ? { text: `${nameOf(u.a ?? u.b!)} — ${lowerFirst(otherParentLabel(u.claim, u.a ? 'father' : 'mother'))}`, refs: claimRefs(u) } : null;
  const spouseHead = claim ? capFirst(otherParentLabel(u.claim!, claimRole(u))) : u.kind === 'parents' ? 'Родители' : 'Супруги';
  const kidsHead = claim ? otherChildLabel(u.claim!, sexes) : 'Дети от этого союза';
  // происхождение: союзы родителей каждого супруга; если Писание о родителях молчит (проверено составителем, § 6) — так и сказано
  const origins = spouses.flatMap((x) => {
    const os = originOf(x);
    if (os.length) return [{ x, os }];
    return byId.get(x)?.silent.includes(6) ? [{ x, os: [] as Union[] }] : [];
  });
  const order = familyOrderNote(u.id, m);
  // «другие сыновья и дочери» (Быт 5:4) — как прежде в карточке у ромба (этап 20, решение 194: она теперь здесь)
  const others = othersLine(u);
  return (
    <>
      <header class="mast union-mast">
        <h2 id="union-title" tabIndex={-1} ref={title}>
          <span class="nm">{unionTitle(u)}</span>
        </h2>
        {sub ? <div class="dis">{typo(sub)}</div> : null}
        {typoTree(
          <dl class="passport">
            <dt>Союз</dt>
            <dd class="fact">
              {kindText(u)}
              {claim ? <Mark cert={u.kidsCert} /> : <Mark cert={u.kind === 'parents' ? u.kidsCert : u.cert} />}
              {u.note ? <div class="note">{u.note}</div> : null}
              {jointClaim ? (
                <div class="note fact">
                  {jointClaim.text} <Refs refs={jointClaim.refs} owner={`${ownKey}|claim`} />
                  <Mark cert={u.kidsCert} />
                  <VerseInsert owner={`${ownKey}|claim`} refs={jointClaim.refs} />
                </div>
              ) : null}
            </dd>
            {years ? (
              <>
                <dt>Годы</dt>
                <dd class="fact">
                  {years.text}
                  {years.first && m.chrono.get(years.first) ? <YearMark id={years.first} c={m.chrono.get(years.first)!} m={m} /> : null}
                  {/* помета порядка с верным диапазоном стихов (этап 11, стык 5; src/render/links.ts): на небе её нет (Г9) */}
                  {order ? <div class="note">годы детей — {order}</div> : null}
                </dd>
              </>
            ) : null}
            {others ? (
              <>
                <dt>Другие дети</dt>
                <dd>{typo(lowerFirst(others.replace(/^Другие сыновья и дочери: /, 'сыновья и дочери: ')))}</dd>
              </>
            ) : null}
            <dt>Стихи</dt>
            <dd class="union-refs">
              <Refs refs={u.refs} owner={`${ownKey}|refs`} />
              <VerseInsert owner={`${ownKey}|refs`} refs={u.refs} />
            </dd>
          </dl>,
        )}
      </header>
      <RevealCommand u={u} from={by} />
      <div class="mast-rule" aria-hidden="true" />
      <div class="folio-body union-body" key={u.id}>
        {typoTree(
          <>
            <section class="sec long" aria-labelledby="uh-spouses">
              <h4 id="uh-spouses">{spouseHead}</h4>
              <ul>
                {spouses.map((x) => {
                  const all = unionsOf(x).filter((o) => o.id !== u.id);
                  // потомки, названные без промежуточных звеньев («из сыновей Давида — Хаттуш», Езд 8:2), — не союз
                  // (решение 109; X4 § 2.1): своей строкой, а не в «другие союзы»
                  const far = all.filter((o) => o.claim === 'ancestor');
                  const others = all.filter((o) => o.claim !== 'ancestor');
                  const farKids = kidsInOrder(far.flatMap((o) => o.kids));
                  const farRefs = uniqRefs(far.flatMap((o) => o.refs));
                  return (
                    <li class="fact" key={x}>
                      <Who id={x} />
                      {others.length ? (
                        <div class="note">
                          {byId.get(x)?.sex === 'f' ? 'Её' : 'Его'} другие союзы: <UnionLinks us={others} who={x} />
                        </div>
                      ) : null}
                      {farKids.length ? (
                        <div class="note fact">
                          Потомки без промежуточных звеньев:{' '}
                          {farKids.map((k, i) => (
                            <Fragment key={k}>
                              {i ? ', ' : ''}
                              <P id={k}>{midName(k)}</P>
                            </Fragment>
                          ))}
                          <Refs refs={farRefs} owner={`${ownKey}|far|${x}`} />
                          <VerseInsert owner={`${ownKey}|far|${x}`} refs={farRefs} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {!claim && (!u.a || !u.b) && !isPeople((u.a ?? u.b)!) ? <li class="muted">{u.a ? 'Мать' : 'Отец'} — не {u.a ? 'названа' : 'назван'} в Писании</li> : null}
              </ul>
            </section>
            <section class="sec long" aria-labelledby="uh-kids">
              <h4 id="uh-kids">{kidsHead}</h4>
              {kids.length ? (
                <KidsCut sig={`${u.id}|kids`} kids={kids}>
                  {(shown) => (
                  <ul>
                    {shown.map((k) => {
                      const i = kids.indexOf(k);
                      const kin = kinOf(u, k);
                      const own = unionsOf(k).length;
                      const q = byId.get(k)!;
                      const messiah = q.roles.includes('messiah');
                      const owner = `${ownKey}|k${i}`;
                      return (
                        <li class="fact" key={k}>
                          <Who id={k} mark />
                          <Refs refs={kin.refs} owner={owner} />
                          <Mark cert={kin.cert} />
                          {own ? <span class="muted"> — {bySex(q.sex, 'его', 'её')} союзы: {own}</span> : null}
                          {messiah ? (
                            <div class="note fact">
                              {MESSIAH_BIRTH.mother.text} <Refs refs={MESSIAH_REFS} owner={`${owner}|m`} />
                              <VerseInsert owner={`${owner}|m`} refs={MESSIAH_REFS} />
                            </div>
                          ) : null}
                          <VerseInsert owner={owner} refs={kin.refs} />
                        </li>
                      );
                    })}
                  </ul>
                  )}
                </KidsCut>
              ) : (
                <p class="muted">Дети от этого союза в Писании не названы.</p>
              )}
            </section>
            {origins.length ? (
              <section class="sec long" aria-labelledby="uh-origin">
                <h4 id="uh-origin">Происхождение</h4>
                <ul>
                  {origins.map(({ x, os }) => (
                    <li class="fact" key={x}>
                      <P id={x} />
                      {os.length ? (
                        <>
                          {' '}
                          <span class="muted">— {os.length > 1 ? 'союзы родителей' : 'родители'}: </span>
                          {os.map((o, i) => (
                            <Fragment key={o.id}>
                              {i ? '; ' : ''}
                              <UnionLink u={o}>{typo(originLinkText(o))}</UnionLink>
                              <Mark cert={kinOf(o, x).cert} />
                            </Fragment>
                          ))}
                        </>
                      ) : (
                        <span class="muted"> — родители в Писании не названы</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>,
        )}
      </div>
      <footer class="colophon">
        <p>
          <ChronoText text={'Союз собран из связей «отец», «мать», «жена», «наложница»; у каждой — стих. Ссылки сверены с Синодальным текстом.' + (years ? modelColophon(u.kids, m.id) : '')} />
        </p>
      </footer>
    </>
  );
}
