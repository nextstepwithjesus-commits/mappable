/**
 * Карточка союза в листе карточки (решения владельца 67 и 71): брак или связь двух лиц, от которой пошли дети, —
 * отдельный предмет изучения. Вёрстка — как у карточки лица (шапка, паспорт-таблица, заголовки разделов), но без
 * 24 разделов: супруги, дети этого союза по порядку рождения, происхождение каждого супруга, команда «Раскрыть на небе».
 *
 * Всё — только из данных атласа (src/engine/unions.ts): связи «отец», «мать», «жена», «наложница» со стихами.
 * Неназванное место — «не названа в Писании»; портретов и «реконструкций» нет.
 *
 * Здесь же — ссылка на карточку союза (UnionLink) для § 9 и § 10 карточки лица и строки союза для диктора: имя в
 * косвенном падеже ставится только функцией склонения (src/ui/text/ru.ts), иначе — после двоеточия, в именительном.
 */
import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, graph, persons } from '../../data/atlas.ts';
import type { Cert, Sex } from '../../data/types.ts';
import { kidEdges, membersOf, partnerIn, type Union } from '../../engine/unions.ts';
import { formatSpan, formatYear, shownYears } from '../../engine/years.ts';
import { model } from '../../state.ts';
import { expanded, originOf, selectUnion, toggleUnion, unionsOf } from '../reveal.ts';
import { skyMode, workSet } from '../work.ts';
import { Mark, P, Refs, VerseInsert, plural } from '../common.tsx';
import { bySex, capFirst, childrenNoun, lowerFirst, MESSIAH_BIRTH, nameCase, otherChildLabel, otherParentLabel } from '../text/ru.ts';
import { typo, typoTree } from '../text/typo.ts';
import { isPeople, passportYears } from './Masthead.tsx';
import { YearMark } from './Chrono.tsx';
import { Clamp } from './Clamp.tsx';
import { MODEL_NAMES } from './shared.tsx';
import { focusQuietly } from '../focus.ts';
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

/**
 * Дети союза по порядку рождения в текущей модели хронологии. У ребёнка без года — место по порядку данных: он идёт
 * сразу за тем, кто перед ним в данных (сортировка устойчива).
 */
export function kidsInBirthOrder(u: Union, yearOf: (id: string) => number | null = birthOf): string[] {
  let last = -Infinity;
  const keyed = u.kids.map((k) => {
    const y = yearOf(k);
    if (y !== null) last = y;
    return { k, key: y ?? last };
  });
  return keyed.sort((a, b) => a.key - b.key).map((x) => x.k);
}

/**
 * Годы союза — рождение первого и последнего ребёнка по текущей модели: «дети родились ок. 1925–1910 гг. до Р. Х.»,
 * «сын родился в 1926 г. до Р. Х.». null — детей нет; exact — все годы по числам текста; early — первый год
 * (для колофона: годы до 967 г. до Р. Х. зависят от модели).
 */
export function unionYears(u: Union): { text: string; exact: boolean; early: number } | null {
  const kids = u.kids.filter((k) => !isPeople(k));
  if (!kids.length) return null;
  const rows = kids.map((k) => ({ k, c: model.value.chrono.get(k) })).flatMap(({ k, c }) => {
    const y = c ? shownYears(c) : null;
    return y && c ? [{ k, b: y.b, approx: y.approx, exact: c.cls === 'exact' }] : [];
  });
  const sexes = kids.map((k) => byId.get(k)?.sex ?? 'm') as Sex[];
  const one = kids.length === 1;
  const who = `${lowerFirst(childrenNoun(sexes))} ${one ? bySex(sexes[0], 'родился', 'родилась') : 'родились'}`;
  if (!rows.length) return { text: `время рождения ${one ? bySex(sexes[0], 'сына', 'дочери') : 'детей'} не установлено`, exact: false, early: Infinity };
  const lo = Math.min(...rows.map((r) => r.b));
  const hi = Math.max(...rows.map((r) => r.b));
  const approx = rows.some((r) => r.approx);
  const span = lo === hi ? formatYear(lo, { approx }) : formatSpan(lo, hi, approx);
  return { text: `${who} ${approx ? '' : 'в '}${span}`, exact: rows.every((r) => r.exact), early: lo };
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

/** Лицо в перечне карточки союза: ссылка, уточнение одноимённого, годы. */
function Who({ id }: { id: string }) {
  const q = byId.get(id)!;
  const years = passportYears(id, model.value.chrono.get(id), isPeople(id));
  // скобки внутри уточнения — через запятую, как в разделах карточки: «Илий (сын Матфата, Лк 3:23, …)»
  const dis = q.disambig && (nameCount.get(q.name) ?? 0) > 1 ? q.disambig.replace(/\s*\(([^)]*)\)/g, ', $1') : '';
  return (
    <>
      <P id={id} />
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

/** Команда «Раскрыть на небе» / «Свернуть на небе»; строка состояния для диктора — что изменилось на небе. */
function RevealCommand({ u, from }: { u: Union; from: string }) {
  const open = u.id in expanded.value;
  const [said, setSaid] = useState('');
  const total = membersOf(u).length;
  // сколько лиц союза уже на небе — только в небе «набор»: во «Всём небе» на нём все
  const onSky = skyMode.value === 'work' ? membersOf(u).filter((m) => workSet.value.has(m)).length : null;
  return (
    <div class="actions union-actions">
      <button
        type="button"
        class="union-reveal"
        title={open ? 'Убрать с неба лиц, раскрытых через этот союз' : 'Показать на небе «набор» обоих супругов и всех детей этого союза'}
        onClick={() => {
          const was = workSet.peek().size;
          toggleUnion(u.id, from);
          const now = workSet.peek().size;
          const n = Math.abs(now - was);
          const who = `${n} ${plural(n, 'лицо', 'лица', 'лиц')}`;
          setSaid(now >= was ? `На небе «набор» показано ещё: ${who}` : `Свёрнуто, с неба убрано: ${who}`);
        }}
      >
        {open ? 'Свернуть на небе' : 'Раскрыть на небе'}
      </button>
      {onSky !== null ? <span class="union-onsky">{typo(`на небе ${onSky} из ${total} ${plural(total, 'лица', 'лиц', 'лиц')} союза`)}</span> : null}
      <span class="visually-hidden" role="status">
        {said}
      </span>
    </div>
  );
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
  const early = years && Number.isFinite(years.early) && years.early < -966;
  const order = familyOrderNote(u.id, m);
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
                  {Number.isFinite(years.early) ? <YearMark cls={years.exact ? 'exact' : 'calculated'} /> : null}
                  {/* помета порядка с верным диапазоном стихов (этап 11, стык 5; src/render/links.ts): на небе её нет (Г9) */}
                  {order ? <div class="note">годы детей — {order}</div> : null}
                </dd>
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
                  const others = unionsOf(x).filter((o) => o.id !== u.id);
                  return (
                    <li class="fact" key={x}>
                      <Who id={x} />
                      {others.length ? (
                        <div class="note">
                          {byId.get(x)?.sex === 'f' ? 'Её' : 'Его'} другие союзы: <UnionLinks us={others} who={x} />
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
                <Clamp sig={`${u.id}|kids`} n={10}>
                  <ul>
                    {kids.map((k, i) => {
                      const kin = kinOf(u, k);
                      const own = unionsOf(k).length;
                      const q = byId.get(k)!;
                      const messiah = q.roles.includes('messiah');
                      const owner = `${ownKey}|k${i}`;
                      return (
                        <li class="fact" key={k}>
                          <Who id={k} />
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
                </Clamp>
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
          {typo(
            'Союз собран из связей «отец», «мать», «жена», «наложница»; у каждой — стих. Ссылки сверены с Синодальным текстом.' +
              (early ? ` Годы до 967 г. до Р. Х. — по модели «${MODEL_NAMES[m.id] ?? m.id}».` : ''),
          )}
        </p>
      </footer>
    </>
  );
}
