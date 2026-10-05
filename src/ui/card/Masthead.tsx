import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, graph, lineMembership, loadCard, loadedCard, loadedChrono, loadedLastRef, models, modelDependent, modelInfoOf } from '../../data/atlas.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import type { Card, Epoch } from '../../data/types.ts';
import { model, theme } from '../../state.ts';
import { Mark, MarkNote, MARK_FULL, Refs, VerseInsert } from '../common.tsx';
import { dateText, isWide, wideEnds, lastText, lifeDates, lifeText, markTitle, modelYearsText, shownPoint, shownYears, spanText, toAstro, toHist, yearsWord, type DateVal } from '../../engine/years.ts';
import { affiliation, birthEpoch, birthRange, constellation, datesOf, lifeEpoch, reignLength, reignWords, roleLabel, type ReignLike } from './shared.tsx';
import { bySex, nameCase, pluralPeopleName } from '../text/ru.ts';
import { typo, typoTree } from '../text/typo.ts';
import { YearMark } from './Chrono.tsx';
import { mapFont, T_UI_S } from '../../render/type.ts';
import { openShowSheet } from '../panels/Show.tsx';

/** Народ или род из родословия (Быт 10; Езд 2): у него нет рождения и жизни, только место в родословии. */
export const isPeople = (id: string) => {
  const k = byId.get(id)?.kind;
  return k === 'people' || k === 'clan';
};

/**
 * Время народа или рода в паспорте (CARD-59; решение 23): без года — «названы в родословии; эпоха — После Потопа».
 * Глагол — по имени: «Лудим» — народ во множественном числе («названы»), иначе по полу.
 */
export function peopleTime(id: string): string {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const ep = birthEpoch(id, c, model.value.epochs);
  const verb = pluralPeopleName(p.name, p.kind ?? '') ? 'названы' : bySex(p.sex, 'назван', 'названа');
  return `${verb} в родословии, без года${ep ? `; эпоха — ${ep.name}` : ''}`;
}

/**
 * Годы паспорта словами словаря дат (решение 96; engine/years.ts, lifeText): «1040–970 гг. до Р. Х.», «род. между 45 и
 * 20 гг. до Р. Х.», «ок. 1045–975 гг. до Р. Х.»; границы текста (birthRange) — те же, что в § 8 и на мини-шкале.
 */
export function passportYears(id: string, c: ChronoRow | undefined, people = isPeople(id)): string {
  if (!c) return '';
  return lifeText(datesOf(id, c, model.value.chrono), { people });
}

/** Созвездие повторяет колено («Колено Иудино» и «колено Иудино») — строки «Созвездие» нет. */
const sameAs = (a: string | null, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Шапка карточки: имя, уточнение, строка команд (у разворота), паспорт, мини-шкала жизни.
 * Эпоха — полосой мини-шкалы (VIS-41): в паспорте её строка есть только для диктора (шкала — рисунок без текста).
 * Линии Мессии — в § 21, строки-легенды лент в шапке нет.
 * actions — команды под именем (разворот); у листа карточки команды стоят под «Кратко» (Folio.tsx, CardPage).
 * axis — общая ось лет мини-шкалы (в развороте у двух шапок одна ось).
 * card — том карточки, когда он пришёл: шапка с сигналами перерисовывается только при смене свойств, а слово ремесла
 * в роли («плотник», а не «мастер») берётся из текстов тома (roleLabel).
 */
export function Masthead({ id, actions, axis, lead, avatar }: { id: string; actions?: ComponentChildren; axis?: [number, number]; card?: Card | null; lead?: ComponentChildren; avatar?: ComponentChildren }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const life = lifeEpoch(id, c, model.value.epochs);
  const bornIn = c && c.cls !== 'epochal' ? birthEpoch(id, c, model.value.epochs) : null;
  const tribe = affiliation(id);
  const star = constellation(p.group);
  const people = isPeople(id);
  const years = passportYears(id, c, people);
  return (
    <header class="mast">
      {/* образ лица (решение 74) — слева от имени: на широком экране карточки у звезды нет (решение 194), и силуэт —
          здесь; уточнение обтекает его */}
      {avatar ? <span class="mast-av">{avatar}</span> : null}
      {/* имя — в строчном блоке: черта фокуса — по ширине имени (VIS-56); первая строка обходит команды полосы листа */}
      <h2 id={`title-${id}`} tabIndex={-1}>
        <span class="nm">{p.name}</span>
      </h2>
      {p.disambig ? <div class="dis">{typo(p.disambig)}</div> : null}
      {lead}
      {actions}
      {typoTree(
        <dl class="passport">
          {p.roles.length ? (
            <>
              <dt>Роль</dt>
              <dd>{roleLabel(id)}</dd>
            </>
          ) : null}
          {/* созвездие повторяет колено по браку («Колено Иудино» и «колено Иудино (жена Салмона)») — строки нет (решение 195) */}
          {star && !sameAs(star, tribe?.own?.text) && !sameAs(star, tribe?.marriage?.replace(/\s*\(.*\)$/, '')) ? (
            <>
              <dt>Созвездие</dt>
              <dd>
                {/* лист «Показ» на этом созвездии (этап 11, § 5): «только это» — показать на небе одно созвездие */}
                <button
                  type="button"
                  class="pass-link"
                  title="Лист «Показ»: только это созвездие на небе"
                  onClick={(e) => openShowSheet({ focus: 'groups', group: p.group, back: e.currentTarget as HTMLElement })}
                >
                  {star}
                </button>
              </dd>
            </>
          ) : null}
          {/* происхождение — своей строкой, помета «толк.» или «выв.» на поле; брак — строкой «По браку» (решение 97; X4 Д9) */}
          {tribe?.own ? (
            <>
              <dt>Колено / народ</dt>
              {/* class fact — только у строки с пометой на поле («толк.», «выв.») */}
              <dd class={tribe.own.cert && tribe.own.cert !== 'scripture' ? 'fact' : undefined}>
                {tribe.own.text}
                <Mark cert={tribe.own.cert} />
              </dd>
            </>
          ) : null}
          {tribe?.marriage ? (
            <>
              <dt>По браку</dt>
              <dd>{tribe.marriage}</dd>
            </>
          ) : null}
          {people ? (
            <>
              <dt>Время</dt>
              <dd>{peopleTime(id)}</dd>
            </>
          ) : (
            <>
              <dt>Годы</dt>
              {/* class fact: помета «расч.» встаёт на внешнее поле строки, как у фактов разделов; её пояснение — своё
                  у лица: откуда год и зависит ли он от модели (решение 96) */}
              <dd class="fact">
                {years ? (
                  <>
                    {years}
                    {c ? <YearMark id={id} c={c} /> : <Mark calc />}
                  </>
                ) : (
                  'время не установлено'
                )}
                <YearsSub id={id} c={c} />
              </dd>
              <TimeRows id={id} c={c} />
            </>
          )}
          {/* эпоха жизни — видимая строка (решение 97, 98; пересматривает VIS-41): та же, что подписана на мини-шкале,
              что слышит диктор и что называет § 13; второй строкой — эпоха рождения, если она другая */}
          {!people && life ? (
            <>
              <dt>Эпоха</dt>
              <dd>
                {life.name}
                {bornIn && bornIn.id !== life.id ? <span class="pass-sub">{`${bySex(p.sex, 'родился', 'родилась')} в эпоху «${bornIn.name}»`}</span> : null}
              </dd>
            </>
          ) : null}
          <LinesRow id={id} />
        </dl>,
      )}
      <LifeBar id={id} axis={axis} />
    </header>
  );
}

/** Стих шага линии: у линии Иосифа — из Мф 1, у линии по Луке — из Лк 3; иначе первый. */
const lineRef = (refs: readonly string[], book: RegExp) => refs.find((r) => book.test(r)) ?? refs[0];

/**
 * Строка паспорта «Линия Мессии» (этап 20, решение 195): место лица в родословиях Иисуса Христа — номер у Матфея и у Луки
 * со стихом, образец цвета ленты. Прежде это знали только § 21 в конце карточки и фраза «Кратко» без номеров. Строго по
 * data/lines (lineMembership); у Самого Иисуса Христа строки нет — с Него родословия начинаются (§ 21).
 */
export function lineItems(id: string): { line: 'joseph' | 'mary'; text: string; ref?: string }[] {
  if (id === 'iisus') return [];
  const j = lineMembership.joseph.get(id);
  const m = lineMembership.mary.get(id);
  const out: { line: 'joseph' | 'mary'; text: string; ref?: string }[] = [];
  if (j) {
    const text = j.mt
      ? `у Матфея — ${j.mt}-е имя`
      : j.flag === 'omitted-by-mt'
        ? 'линия Иосифа; у Матфея опущен'
        : j.flag === 'before-matthew'
          ? 'линия Иосифа, до Авраама'
          : 'линия Иосифа';
    out.push({ line: 'joseph', text, ref: lineRef(j.refs, /^Мф\s/) });
  }
  if (m) {
    const text = m.lk ? `у Луки — ${m.lk}-е имя` : m.flag === 'interpretation' ? 'линия по Луке — по толкованию' : 'линия по Луке';
    out.push({ line: 'mary', text, ref: lineRef(m.refs, /^Лк\s/) });
  }
  return out;
}

function LinesRow({ id }: { id: string }) {
  const items = lineItems(id);
  if (!items.length) return null;
  return (
    <>
      <dt>{items.length > 1 ? 'Линии Мессии' : 'Линия Мессии'}</dt>
      <dd class="pass-lines">
        {items.map((x) => (
          <span class="pass-line" key={x.line}>
            <span class={`swatch ${x.line === 'joseph' ? 'gold' : 'azure'}`} aria-hidden="true" />
            {typo(x.text)}
            {x.ref ? <Refs refs={[x.ref]} owner={`pass-line-${x.line}|${id}`} /> : null}
            {x.ref ? <VerseInsert owner={`pass-line-${x.line}|${id}`} refs={[x.ref]} /> : null}
          </span>
        ))}
      </dd>
    </>
  );
}

/**
 * Пояснения под годами паспорта (решение 96; X2 § 2.2): о смерти Писание молчит — «последнее упоминание — 30 г. по Р. Х.»
 * со стихом; в модели не по умолчанию у лица, чьи годы от неё зависят, — «в модели «Основной текст» — 2166–1991 гг.»
 */
function YearsSub({ id, c }: { id: string; c: ChronoRow | undefined }) {
  if (!c || c.cls === 'epochal' || c.named) return null;
  const m = model.value;
  const out: ComponentChildren[] = [];
  const lastRef = loadedLastRef(id);
  if (c.d === null && c.last !== null && Math.round(c.last) > (shownYears(c)?.b ?? c.b))
    out.push(
      <span class="pass-sub" key="last">
        {`о смерти Писание не говорит; ${lastText(c.last)}`}
        {lastRef ? <Refs refs={[lastRef]} owner={`pass-last|${id}`} /> : null}
        {lastRef ? <VerseInsert owner={`pass-last|${id}`} refs={[lastRef]} /> : null}
      </span>,
    );
  const base = models[0];
  const b0 = base.chrono.get(id);
  if (m.id !== base.id && b0 && modelDependent(id)) {
    const t = modelYearsText(datesOf(id, b0, base.chrono), modelInfoOf(base.id).short);
    if (t) out.push(<span class="pass-sub" key="model">{t}</span>);
  }
  // строки собраны здесь, внутри компонента: typoTree паспорта до них не доходит — typo на месте
  return out.length ? typoTree(<>{out}</>) : null;
}

/**
 * Вторая строка времени паспорта (решение 97): «Царствовал» — сроки по реконструкции Тиле — Янга, соправления словами
 * («792–767 — вместе с отцом, Амасией; один — с 767, в 27-й год Иеровоама»); иначе «В Писании» — годы засвидетельствованной
 * деятельности (служение, события: «6 г. до Р. Х. — 30 г. по Р. Х.; от Благовещения до молитвы с апостолами») или, у лица
 * без годов, время встречи («между 2091 и 2080 гг. до Р. Х.; встреча с Авраамом», Быт 14:17–20).
 */
function TimeRows({ id, c }: { id: string; c: ChronoRow | undefined }) {
  // строки собраны внутри компонента: typoTree паспорта до них не доходит — typo здесь
  const rows = timeRows(id, c);
  return rows ? typoTree(rows) : null;
}
function timeRows(id: string, c: ChronoRow | undefined) {
  const p = byId.get(id)!;
  const vol = loadedChrono(id);
  const reigns = (vol?.reign?.length ? vol.reign : p.reign.map((r) => ({ ...r, refs: [] as string[] }))) as (ReignLike & { sole?: number; sync?: { with: string; year: number; refs: string[] }[] })[];
  if (reigns.length) {
    const start = Math.min(...reigns.map((r) => r.start));
    const end = Math.max(...reigns.map((r) => r.end));
    const one = reigns.length === 1 ? reigns[0] : null;
    const len = one ? reignLength(one) : null;
    const span = spanText({ t: toAstro(start) }, { t: toAstro(end) });
    const words = reignWords(id, reigns);
    const age = reigns.find((r) => r.ageAtStart !== undefined);
    return (
      <>
        <dt>{bySex(p.sex, 'Царствовал', 'Царствовала')}</dt>
        <dd class="fact">
          {len ? `${len}: ${span}` : span}
          <MarkNote label="расч." full={MARK_FULL.reign} />
          {age ? (
            <span class="pass-sub">
              {`${bySex(p.sex, 'воцарился', 'воцарилась')} в ${yearsWord(age.ageAtStart!)}`}
              <Refs refs={age.refs} owner={`pass-age|${id}`} />
              <VerseInsert owner={`pass-age|${id}`} refs={age.refs} />
            </span>
          ) : null}
          {/* царствования по отдельности («семь лет и шесть месяцев над Иудеей, в Хевроне») — в § 16: паспорт держит срок,
              возраст при воцарении и соправления словами (решение 97), без повтора § 16 */}
          {words.map((w, i) => (
            <span class="pass-sub" key={`w${i}`}>
              {w.text}
              <Refs refs={w.refs} owner={`pass-w${i}|${id}`} />
              <VerseInsert owner={`pass-w${i}|${id}`} refs={w.refs} />
            </span>
          ))}
        </dd>
      </>
    );
  }
  const act = vol?.active ?? (p.active ? { from: p.active[0], to: p.active[1], refs: [] as string[], note: undefined } : null);
  if (act) {
    return (
      <>
        <dt>В Писании</dt>
        <dd class="fact">
          {spanText({ t: toAstro(act.from) }, { t: toAstro(act.to) })}
          <MarkNote label="расч." full="годы засвидетельствованной деятельности — по годам событий, названных в стихах; расчёт атласа" />
          {act.note || act.refs.length ? (
            <span class="pass-sub">
              {act.note ?? ''}
              <Refs refs={act.refs} owner={`pass-act|${id}`} />
              <VerseInsert owner={`pass-act|${id}`} refs={act.refs} />
            </span>
          ) : null}
        </dd>
      </>
    );
  }
  // время не установлено, но встреча названа (Мелхиседек и Аврам, Быт 14:17–20): её время — строкой «В Писании»
  if (c?.cls === 'epochal' && c.basis?.kind === 'met' && c.basis.ids?.[0] && c.bHi > c.bLo) {
    const who = c.basis.ids[0];
    const q = byId.get(who);
    const ins = q ? nameCase(q.name, q.sex, 'ins', q.unnamed, q.alt) : null;
    const met = loadedCard(id)?.met?.find((x) => x.id === who);
    return (
      <>
        <dt>В Писании</dt>
        <dd class="fact">
          {dateText({ t: c.b, est: true, lo: c.bLo, hi: c.bHi })}
          <MarkNote label="расч." full={markTitle(c, { dep: modelDependent(id), model: modelInfoOf(model.value.id).short })} />
          <span class="pass-sub">
            {ins ? `встреча с ${ins}` : `встреча: ${q?.name ?? who}`}
            {met ? <Refs refs={met.refs} owner={`pass-met|${id}`} /> : null}
            {met ? <VerseInsert owner={`pass-met|${id}`} refs={met.refs} /> : null}
          </span>
        </dd>
      </>
    );
  }
  return null;
}

/**
 * Подпись года на мини-шкале — теми же словами словаря, что паспорт (решение 96), без «г.» и эры: «1040», «ок. 1330»,
 * «не позже 1876»; широкая оценка — промежутком «45–20» (в паспорте — «род. между 45 и 20 гг. до Р. Х.»).
 */
function scaleYear(v: DateVal): string {
  if (isWide(v)) {
    const [a, b] = wideEnds(v).map(toHist);
    // промежуток через Р. Х. — у каждого конца своя эра: «40 до Р. Х.–30 по Р. Х.» (решение 97)
    if (a < 0 !== b < 0) return `${Math.abs(a)}\u00a0до\u00a0Р.\u00a0Х.–${b}\u00a0по\u00a0Р.\u00a0Х.`;
    const t = dateText(v, { era: false });
    const m = /^между\s(\d+)\sи\s(\d+)$/.exec(t);
    return m ? `${m[1]}–${m[2]}` : t;
  }
  return dateText(v, { era: false });
}

/**
 * Подписи концов мини-шкалы — те же годы, что в паспорте. Конец подписывается, только если год смерти есть в паспорте;
 * у лиц без опор (epochal) годов нет, у народа — только время в родословии.
 * Эра («до Р. Х.») — не у конца жизни, а у крайней правой подписи оси (VIS-06): риска конца стоит под самим годом;
 * при переходе через Р. Х. — у каждой подписи (решение 97; lifeBarLayout).
 */
export function lifeBarLabels(c: ChronoRow): { left: string | null; right: string | null } {
  const ld = lifeDates(c);
  if (!ld) return { left: null, right: null };
  const left = scaleYear(ld.birth);
  // о смерти нет данных — или умер в год рождения (младенец): одна подпись, как в паспорте
  if (!ld.death || shownPoint(ld.death) === shownPoint(ld.birth)) return { left, right: null };
  const hb = toHist(shownPoint(ld.birth));
  const hd = toHist(shownPoint(ld.death));
  return { left: hb < 0 && hd > 0 && !/Р\./.test(left) ? `${left}\u00a0до\u00a0Р.\u00a0Х.` : left, right: scaleYear(ld.death) };
}

/**
 * Высота мини-шкалы в CSS-пикселях (решение 97): эпохи 13, жизнь 4, служение или царствование 3, ось и подписи 16;
 * та же в правиле .lifebar (src/styles/folio.css).
 */
export const LIFEBAR_H = 48;

/**
 * Окно мини-шкалы в астрономических годах: у лица без опор и у народа — его эпоха; иначе от раннего края рождения
 * до смерти или последнего события (и до конца царствования или служения), с полями по 30 %. Развороту — для общей
 * оси двух шапок (объединение окон).
 */
export function lifeWindow(id: string): [number, number] | null {
  const c = model.value.chrono.get(id);
  if (!c) return null;
  const epochs = model.value.epochs;
  const byEpoch = c.cls === 'epochal' || isPeople(id);
  const ep = byEpoch ? birthEpoch(id, c, epochs) : null;
  if (byEpoch && !ep) return null;
  const [bLo, bHi] = birthRange(id, c, model.value.chrono);
  const act = activitySpan(id);
  const start = ep ? toAstro(ep.start) : Math.min(bLo, act?.[0] ?? bLo);
  const end = ep ? toAstro(ep.end) : Math.max(c.d ?? c.last ?? bHi, act?.[1] ?? -Infinity);
  const span = Math.max(80, end - start);
  return [start - span * 0.3, end + span * 0.3];
}

/** Полоса эпохи на мини-шкале и её подпись. own — эпоха жизни лица (решение 98): полоса выделена, подпись — всегда. */
export type EpochBand = { i: number; name: string; a: number; b: number; own?: boolean };
export type EpochLabel = { text: string; x: number; w: number; own?: boolean };

/**
 * Полосы эпох мини-шкалы и их подписи (VIS-63; решение 97): подпись — только целиком, многоточия нет.
 * — Эпоха жизни лица (born — её id) подписывается всегда: полным именем, а если оно не помещается в полосу — кратким
 *   (Epoch.short, решение 99: «Жизнь Христа»); подпись сдвигается в видимую часть своей полосы, а если полоса у́же
 *   слова — выходит за неё, соседние подписи тогда уступают.
 * — Остальные эпохи подписываются, только если полное или краткое имя помещается в видимую часть полосы с запасом
 *   8 px и не задевает подпись эпохи жизни; иначе полоса без текста, название — в подсказке шкалы.
 * x — год (астрономический) → px; w — ширина шкалы; measure — ширина строки в px.
 */
export function epochBandLabels(epochs: Epoch[], x: (t: number) => number, w: number, born: string | null, measure: (t: string) => number): { bands: EpochBand[]; labels: EpochLabel[] } {
  const PAD = 4;
  const bands: EpochBand[] = [];
  epochs.forEach((e, i) => {
    const a = Math.max(0, x(toAstro(e.start)));
    const b = Math.min(w, x(toAstro(e.end)));
    if (b > a) bands.push({ i, name: e.name, a, b, own: e.id === born });
  });
  const labels: EpochLabel[] = [];
  const own = bands.find((band) => band.own) ?? null;
  const fit = (band: EpochBand) => {
    const e = epochs[band.i];
    for (const t of [e.name, e.short].filter((q): q is string => !!q)) if (measure(t) <= band.b - band.a - 2 * PAD) return t;
    return null;
  };
  if (own) {
    const e = epochs[own.i];
    const text = fit(own) ?? (e.short && measure(e.short) < measure(e.name) ? e.short : e.name);
    const tw = measure(text);
    // в видимую часть своей полосы; не помещается — к её правому краю, но не за края шкалы
    let lx = own.a + PAD;
    if (lx + tw > own.b - PAD) lx = own.b - PAD - tw;
    lx = Math.max(PAD / 2, Math.min(w - PAD / 2 - tw, lx));
    labels.push({ text, x: lx, w: tw, own: true });
  }
  for (const band of bands) {
    if (band === own) continue;
    const text = fit(band);
    if (!text) continue;
    const tw = measure(text);
    const lx = band.a + PAD;
    if (labels.some((l) => lx < l.x + l.w + 2 * PAD && lx + tw + 2 * PAD > l.x)) continue;
    labels.push({ text, x: lx, w: tw });
  }
  return { bands, labels };
}

/** Срок служения или царствования (астрономические годы): царствования — от первого до конца последнего. */
function activitySpan(id: string): [number, number] | null {
  const p = byId.get(id);
  if (!p) return null;
  if (p.reign.length) return [toAstro(Math.min(...p.reign.map((r) => r.start))), toAstro(Math.max(...p.reign.map((r) => r.end)))];
  if (p.active) return [toAstro(p.active[0]), toAstro(p.active[1])];
  return null;
}

/**
 * Соправления (решение 97, 103; X2 Д9): годы царствования, которые делятся с отцом или сыном, царствовавшим над той же
 * землёй («792–767 — вместе с отцом, Амасией»). До контракта 1 (reign.sole) — по пересечению царствований отца и сына.
 */
export function coRegencies(id: string): { with: string; a: number; b: number }[] {
  const p = byId.get(id);
  if (!p?.reign.length) return [];
  const kin = [p.father, ...(graph.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child)].filter((x): x is string => !!x);
  const out: { with: string; a: number; b: number }[] = [];
  for (const r of p.reign)
    for (const k of kin)
      for (const q of byId.get(k)?.reign ?? []) {
        if (q.over !== r.over) continue;
        const a = Math.max(toAstro(r.start), toAstro(q.start));
        const b = Math.min(toAstro(r.end), toAstro(q.end));
        if (b > a) out.push({ with: k, a, b });
      }
  return out;
}

/** Подпись оси мини-шкалы: год (x — середина риски), текст; kind — конец жизни, начало царствования, «Р. Х.». */
export type AxisLabel = { tick: number; text: string; kind: 'life' | 'reign' | 'era'; x: number; w: number };

/**
 * Мини-шкала жизни — раскладка без холста (решение 97; X2 § 2.2), для рисунка и проверок:
 *  — полосы эпох, подписана эпоха жизни (lifeEpoch), она выделена;
 *  — жизнь: промежуток рождения растушёван, сплошная часть — до смерти или последнего упоминания, дальше след тает;
 *  — под жизнью — полоса служения или царствования, соправление заштриховано;
 *  — на оси — только концы жизни, начало царствования и «Р. Х.»; кружков родителей и рисок детей нет;
 *  — эра у каждой подписи, если окно переходит через Р. Х., иначе — у крайней правой.
 * У лица без опор — скобка эпохи «время не установлено» (или отрезок встречи, если время задано встречей); у народа —
 * скобка «без года».
 */
export interface LifeBarLayout {
  bands: EpochBand[];
  epochLabels: EpochLabel[];
  life: { lo: number; hi: number; solidTo: number; fade: boolean } | null;
  act: { a: number; b: number; hatch: [number, number][] } | null;
  bracket: { a: number; b: number; text: string; x: number; w: number } | null;
  axis: AxisLabel[];
}
export function lifeBarLayout(id: string, win: [number, number], w: number, measure: (t: string) => number, m = model.value): LifeBarLayout | null {
  const c = m.chrono.get(id);
  if (!c) return null;
  const [t0, t1] = win;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const epochs = m.epochs;
  const people = isPeople(id);
  const { bands, labels: epochLabels } = epochBandLabels(epochs, x, w, lifeEpoch(id, c, epochs)?.id ?? null, measure);
  const byEpoch = c.cls === 'epochal' || people;
  const crossing = t0 < 1 && t1 > 1;
  const era = (t: number) => (toHist(t) < 0 ? ' до Р. Х.' : ' по Р. Х.');
  const axis: AxisLabel[] = [];
  const put = (tick: number, text: string, kind: AxisLabel['kind']) => axis.push({ tick, text, kind, x: x(tick), w: measure(text) });
  let life: LifeBarLayout['life'] = null;
  let act: LifeBarLayout['act'] = null;
  let bracket: LifeBarLayout['bracket'] = null;
  if (byEpoch) {
    const ep = birthEpoch(id, c, epochs);
    if (ep) {
      // время задано встречей (Мелхиседек — с Аврамом, Быт 14:17–20): отрезок встречи, а не вся эпоха
      const met = !people && c.when?.by === 'met' && c.bHi > c.bLo;
      const a = met ? c.bLo : toAstro(ep.start);
      const b = met ? c.bHi : toAstro(ep.end);
      // «встреча с Аврамом»: имя — творительным падежом через склонение; не склоняется — «встреча»
      const q = met && c.when?.id ? byId.get(c.when.id) : null;
      const who = q ? nameCase(q.name, q.sex, 'ins', q.unnamed, q.alt) : null;
      const text = people ? 'без года' : met ? `встреча${who ? ` с ${who}` : ''}` : 'время не установлено';
      const tw = measure(text);
      bracket = { a: x(a), b: x(b), text, x: Math.max(0, Math.min(w - tw, (x(a) + x(b)) / 2 - tw / 2)), w: tw };
    }
  } else {
    // те же годы и границы текста, что в паспорте и § 8 (datesOf, словарь дат)
    const cd = datesOf(id, c, m.chrono);
    const ld = lifeDates(cd);
    if (ld) {
      const { bLo, bHi } = cd;
      const end = c.d ?? c.last ?? bHi;
      life = { lo: x(bLo), hi: x(c.cls === 'estimated' ? bHi : bLo), solidTo: x(Math.max(end, bHi)), fade: c.d === null };
      const { left, right } = lifeBarLabels(cd);
      const tb = shownPoint(ld.birth);
      // эру ставит ось (ниже); промежуток через Р. Х. («40 до Р. Х.–30 по Р. Х.») держит обе свои
      if (left) put(tb, (left.match(/Р\.\u00a0Х\./g) ?? []).length > 1 ? left : left.replace(/\u00a0(до|по)\u00a0Р\.\u00a0Х\.$/, ''), 'life');
      if (right && ld.death) put(shownPoint(ld.death), right, 'life');
      // о смерти Писание молчит — конец сплошной части подписан годом последнего упоминания, как в паспорте
      else if (!ld.death && c.last !== null && c.last - tb > 5) put(c.last, dateText({ t: c.last }, { era: false }), 'life');
    }
    const span = activitySpan(id);
    if (span) {
      const hatch = coRegencies(id).map((r) => [x(r.a), x(r.b)] as [number, number]);
      act = { a: x(span[0]), b: x(span[1]), hatch };
      const p = byId.get(id)!;
      if (p.reign.length) {
        const start = toAstro(Math.min(...p.reign.map((r) => r.start)));
        put(start, `${Math.abs(toHist(start))} — воцарение`, 'reign');
      }
    }
  }
  if (crossing) put(1, 'Р. Х.', 'era');
  // эра: при переходе через Р. Х. — у каждого года; иначе — у крайней правой подписи
  // эра — после последнего числа подписи: «45–20 до Р. Х.», «1010 до Р. Х. — воцарение»
  if (crossing) for (const l of axis) if (l.kind !== 'era' && !/Р\. Х\./.test(l.text)) (l.text = l.text.replace(/(\d+)(?!.*\d)/, (d) => `${d}${era(l.tick)}`)), (l.w = measure(l.text));
  // без наложений: концы жизни важнее «Р. Х.», «Р. Х.» — важнее начала царствования
  const rank = { life: 0, era: 1, reign: 2 } as const;
  const placed: AxisLabel[] = [];
  const at = (l: AxisLabel) => Math.max(0, Math.min(w - l.w, l.x - l.w / 2));
  for (const l of [...axis].sort((a, b) => rank[a.kind] - rank[b.kind] || a.tick - b.tick)) {
    let lx = at(l);
    const clash = (q: number) => placed.some((o) => q < o.x + o.w + 8 && q + l.w + 8 > o.x);
    if (clash(lx) && l.kind === 'life') {
      // второй конец жизни — сдвинуть от первого, не за края шкалы
      const other = placed.find((o) => o.kind === 'life');
      if (other) lx = l.tick > other.tick ? Math.min(w - l.w, other.x + other.w + 8) : Math.max(0, other.x - l.w - 8);
    }
    if (clash(lx) || (bracket && lx < bracket.x + bracket.w + 8 && lx + l.w + 8 > bracket.x)) continue;
    placed.push({ ...l, x: lx });
  }
  if (!crossing && placed.length) {
    const right = [...placed].sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    const withEra = right.text.replace(/(\d+)(?!.*\d)/, (d) => `${d}${era(right.tick)}`);
    const ww = measure(withEra);
    right.text = withEra;
    right.x = Math.max(0, Math.min(w - ww, right.x));
    right.w = ww;
    // эра не должна налезть на соседнюю подпись: соседняя уступает
    for (const o of [...placed]) if (o !== right && o.x < right.x + right.w + 8 && o.x + o.w + 8 > right.x) placed.splice(placed.indexOf(o), 1);
  }
  return { bands, epochLabels, life, act, bracket, axis: placed.sort((a, b) => a.x - b.x) };
}

/**
 * Мини-шкала жизни на фоне эпох (решение 97; F2; VIS-06, VIS-41): рисует lifeBarLayout. Её же показывает образец
 * в «Условных знаках» (G5). Холст перерисовывается при каждой смене ширины (ручка границы, окно): подписи — Jost 12 px
 * (CARD-69). Для диктора шкала — рисунок: эпоху и годы он слышит из паспорта.
 */
export function LifeBar({ id, axis }: { id: string; axis?: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // границы рождения из данных приходят с томом карточки; шапка с сигналами не перерисовывается вместе с Folio,
  // поэтому шкала сама ждёт свой том и перерисовывается, когда он пришёл
  const [, setVolume] = useState(0);
  const [width, setWidth] = useState(0);
  const loaded = loadedCard(id) !== null;
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    // том не загрузился — шкала остаётся без подписей; сообщение и «Повторить» показывает карточка (Folio)
    loadCard(id).then(() => alive && setVolume((n) => n + 1)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, loaded]);
  // ширина холста меняется без смены лица (ручка «небо | карточка», окно): рисунок — заново, без растяжения
  useEffect(() => {
    const cv = ref.current;
    if (!cv || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(Math.round(cv.clientWidth)));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    const win = axis ?? lifeWindow(id);
    if (!cv || !win) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = LIFEBAR_H;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const col = (n: string) => cs.getPropertyValue(n).trim();
    // кегль — ступень шкалы интерфейса 12 px (Jost), как подписи полей паспорта: холст не масштабируется (CARD-69)
    const font = mapFont(T_UI_S, { sans: true, coarse: false });
    // полужирное начертание той же строки шрифта: «400 12px …» → «600 12px …» (было «600 400 12px …» — холст отвергает
    // такую строку молча, и подпись своей эпохи оставалась обычной; этап 19, аудит Т-01)
    const bold = /^\d{3}\s/.test(font) ? font.replace(/^\d{3}\s/, '600 ') : font.replace(/^(\d+(?:\.\d+)?px)/, '600 $1').replace(/^normal\s/, '600 ');
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    const L = lifeBarLayout(id, win, w, (t) => ctx.measureText(t).width);
    if (!L) return;
    // ряды по высоте: эпохи 0–13, жизнь 17–21, служение 24–27, ось 31, подписи оси — базовая линия 45
    const EPOCH_H = 13;
    const EPOCH_BASE = 10;
    const lifeY = 17;
    const actY = 24;
    const axisY = 31;
    const labelY = 45;
    const ink = col('--ink');
    const ink2 = col('--ink-2');
    // ряд 1 — эпохи: соседние различаются светлотой, эпоха жизни — выделена (решение 97)
    for (const band of L.bands) {
      ctx.fillStyle = band.own ? col('--rule-strong') : band.i % 2 ? col('--rule') : col('--sheet-2');
      ctx.fillRect(band.a, 0, band.b - band.a, EPOCH_H);
    }
    for (const l of L.epochLabels) {
      ctx.font = l.own ? bold : font;
      ctx.fillStyle = l.own ? ink : ink2;
      ctx.fillText(l.text, l.x, EPOCH_BASE);
    }
    ctx.font = font;
    // названия эпох без подписи на полосе — в подсказке шкалы
    cv.title = L.bands.map((band) => band.name).join('; ');
    // ось
    ctx.fillStyle = col('--rule-strong');
    ctx.fillRect(0, axisY, w, 1);
    // ряд 2 — жизнь: растушёванное начало (промежуток рождения), сплошная часть, тающий конец (о смерти неизвестно)
    if (L.life) {
      const { lo, hi, solidTo, fade } = L.life;
      if (hi > lo + 1) {
        const g = ctx.createLinearGradient(lo, 0, hi, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, ink);
        ctx.fillStyle = g;
        ctx.fillRect(lo, lifeY, hi - lo, 4);
      }
      ctx.fillStyle = ink;
      ctx.fillRect(hi, lifeY, Math.max(2, solidTo - hi), 4);
      if (fade) {
        const g = ctx.createLinearGradient(solidTo, 0, solidTo + 18, 0);
        g.addColorStop(0, ink);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(solidTo, lifeY, 18, 4);
      }
    }
    // ряд 3 — служение или царствование; соправление — штриховкой
    if (L.act) {
      ctx.fillStyle = ink2;
      ctx.fillRect(L.act.a, actY, Math.max(2, L.act.b - L.act.a), 3);
      for (const [a, b] of L.act.hatch) {
        ctx.clearRect(a, actY, b - a, 3);
        ctx.save();
        ctx.beginPath();
        ctx.rect(a, actY - 1, b - a, 5);
        ctx.clip();
        ctx.strokeStyle = ink2;
        ctx.lineWidth = 1;
        for (let q = a - 6; q < b + 6; q += 3) {
          ctx.beginPath();
          ctx.moveTo(q, actY + 4);
          ctx.lineTo(q + 4, actY - 1);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // скобка: время не установлено, встреча, народ без года
    if (L.bracket) {
      const { a, b } = L.bracket;
      ctx.strokeStyle = ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a, lifeY + 6);
      ctx.lineTo(a, lifeY);
      ctx.lineTo(b, lifeY);
      ctx.lineTo(b, lifeY + 6);
      ctx.stroke();
      ctx.fillStyle = ink2;
      ctx.fillText(L.bracket.text, L.bracket.x, labelY);
    }
    // подписи оси: риска под своим годом, текст — не за краями
    for (const l of L.axis) {
      ctx.fillStyle = l.kind === 'life' ? ink : col('--rule-strong');
      ctx.fillRect(Math.round(((l.tick - win[0]) / (win[1] - win[0])) * w) - 0.5, axisY - 2, 1, 6);
      ctx.fillStyle = l.kind === 'life' ? ink2 : col('--ink-3');
      ctx.fillText(l.text, l.x, labelY);
    }
    // тема — в зависимостях: цвета холста читаются из CSS, при смене «Ночь/День» шкала перерисовывается (этап 19, А-02)
  }, [id, model.value, loaded, axis?.[0], axis?.[1], width, theme.value]);
  // размер — классом .lifebar (src/styles/folio.css): ширина строки, высота LIFEBAR_H
  return <canvas class="lifebar" ref={ref} aria-hidden="true" />;
}
