import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, graph, loadCard, loadedCard } from '../../data/atlas.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import type { Card, Epoch } from '../../data/types.ts';
import { model } from '../../state.ts';
import { Mark } from '../common.tsx';
import { formatYear, lifeSpanText, shownBirthRange, shownYears, shortYear, toAstro, toHist } from '../../engine/years.ts';
import { activityEpochs, affiliation, birthEpoch, birthRange, constellation, roleLabel } from './shared.tsx';
import { bySex, pluralPeopleName } from '../text/ru.ts';
import { typo, typoTree } from '../text/typo.ts';
import { YearMark } from './Chrono.tsx';
import { mapFont, T_UI_S } from '../../render/type.ts';

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
 * Годы паспорта. У лица Нового Завета, чей знак на небе стоит у первого засвидетельствованного года (ChronoRow.mark;
 * MAP-69, решение 38), точка оценки рождения не называется: «род. между 40 и 10 гг. до Р. Х.» — тот же промежуток,
 * что в § 8; иначе — как везде (lifeSpanText).
 */
export function passportYears(id: string, c: ChronoRow | undefined, people = isPeople(id)): string {
  if (!c) return '';
  if (c.mark === undefined || c.cls !== 'estimated' || people) return lifeSpanText(c, { people });
  const [bLo, bHi] = birthRange(id, c, model.value.chrono);
  const [lo, hi] = shownBirthRange({ ...c, bLo, bHi });
  const y = shownYears(c);
  const hl = toHist(lo);
  const hh = toHist(hi);
  const NB = '\u00a0';
  const span =
    hl < 0 && hh < 0 ? `${-hl} и ${-hh}${NB}гг.${NB}до${NB}Р.${NB}Х.` : hl > 0 && hh > 0 ? `${hl} и ${hh}${NB}гг.${NB}по${NB}Р.${NB}Х.` : `${formatYear(lo)} и ${formatYear(hi)}`;
  const death = y && y.d !== null ? `; ум. ${formatYear(y.d, { approx: y.approx })}` : '';
  return `род. между ${span}${death}`;
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
export function Masthead({ id, actions, axis }: { id: string; actions?: ComponentChildren; axis?: [number, number]; card?: Card | null }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const eps = activityEpochs(id, c, model.value.epochs);
  const tribe = affiliation(id);
  const star = constellation(p.group);
  const people = isPeople(id);
  const years = passportYears(id, c, people);
  const epochText = eps.length ? (eps.length === 1 ? eps[0].name : `${eps[0].name} — ${eps[eps.length - 1].name}`) : '—';
  return (
    <header class="mast">
      {/* имя — в строчном блоке: черта фокуса — по ширине имени (VIS-56); первая строка обходит команды полосы листа */}
      <h2 id={`title-${id}`} tabIndex={-1}>
        <span class="nm">{p.name}</span>
      </h2>
      {p.disambig ? <div class="dis">{typo(p.disambig)}</div> : null}
      {actions}
      {typoTree(
        <dl class="passport">
          {p.roles.length ? (
            <>
              <dt>Роль</dt>
              <dd>{roleLabel(id)}</dd>
            </>
          ) : null}
          {star && !sameAs(star, tribe?.text) ? (
            <>
              <dt>Созвездие</dt>
              <dd>{star}</dd>
            </>
          ) : null}
          {tribe ? (
            <>
              <dt>Колено / народ</dt>
              <dd>{tribe.text}</dd>
            </>
          ) : null}
          {/* эпоха видна полосой мини-шкалы; диктору шкала не читается — для него строка остаётся текстом */}
          <div class="visually-hidden">
            <dt>Эпоха</dt>
            <dd>{epochText}</dd>
          </div>
          {people ? (
            <>
              <dt>Время</dt>
              <dd>{peopleTime(id)}</dd>
            </>
          ) : (
            <>
              <dt>Годы</dt>
              {/* class fact: помета «расч.» встаёт на внешнее поле строки, как у фактов разделов */}
              <dd class="fact">
                {years ? (
                  <>
                    {years}
                    {/* та же помета, что в § 8: «выв.» у года по порядку перечисления братьев, иначе «расч.» */}
                    {c ? <YearMark cls={c.cls} byOrder={c.byOrder} /> : <Mark calc />}
                  </>
                ) : (
                  'время не установлено'
                )}
              </dd>
            </>
          )}
        </dl>,
      )}
      <LifeBar id={id} axis={axis} />
    </header>
  );
}

/**
 * Подписи концов мини-шкалы — те же годы, что в паспорте. Конец подписывается, только если год смерти есть в паспорте;
 * у лиц без опор (epochal) годов нет, у народа — только время в родословии.
 * Эра («до Р. Х.») — не у конца жизни, а у крайней правой подписи оси (VIS-06): риска конца стоит под самим годом.
 */
export function lifeBarLabels(c: ChronoRow): { left: string | null; right: string | null } {
  const y = shownYears(c);
  if (!y) return { left: null, right: null };
  // о смерти нет данных — или умер в год рождения (младенец): одна подпись, как в паспорте
  if (y.d === null || y.d === y.b) return { left: shortYear(y.b, y.approx, false), right: null };
  const hb = toHist(y.b);
  const hd = toHist(y.d);
  return { left: shortYear(y.b, y.approx, hb < 0 && hd > 0), right: shortYear(y.d, y.approx, false) };
}

/** Высота мини-шкалы в CSS-пикселях (VIS-41: эпохи 13, жизнь 4, ось 14); та же в правиле .lifebar (src/styles/folio.css). */
export const LIFEBAR_H = 44;
/** Уже этого мини-шкала оставляет на оси только годы жизни (CARD-69): промежуточные круглые годы не помещаются. */
const LIFEBAR_TICKS_MIN = 320;

/**
 * Окно мини-шкалы в астрономических годах: у лица без опор и у народа — его эпоха; иначе от раннего края рождения
 * до смерти или последнего события, с полями по 30 %. Развороту — для общей оси двух шапок (объединение окон).
 */
export function lifeWindow(id: string): [number, number] | null {
  const c = model.value.chrono.get(id);
  if (!c) return null;
  const epochs = model.value.epochs;
  const byEpoch = c.cls === 'epochal' || isPeople(id);
  const ep = byEpoch ? birthEpoch(id, c, epochs) : null;
  if (byEpoch && !ep) return null;
  const [bLo, bHi] = birthRange(id, c, model.value.chrono);
  const start = ep ? toAstro(ep.start) : bLo;
  const end = ep ? toAstro(ep.end) : (c.d ?? c.last ?? bHi);
  const span = Math.max(80, end - start);
  return [start - span * 0.3, end + span * 0.3];
}

/** Полоса эпохи на мини-шкале и её подпись. */
export type EpochBand = { i: number; name: string; a: number; b: number };
export type EpochLabel = { text: string; x: number; w: number };

/**
 * Полосы эпох мини-шкалы и их подписи (VIS-63): подпись — только целиком, многоточия нет.
 * — Эпоха рождения лица (born) подписывается всегда: подпись сдвигается в видимую часть своей полосы, а если полоса
 *   у́же слова — выходит за неё, соседние подписи тогда уступают.
 * — Остальные эпохи подписываются, только если слово помещается в видимую часть полосы с запасом 8 px и не задевает
 *   подпись эпохи рождения; иначе полоса без текста, название — в подсказке шкалы.
 * x — год (астрономический) → px; w — ширина шкалы; measure — ширина строки в px.
 */
export function epochBandLabels(epochs: Epoch[], x: (t: number) => number, w: number, born: string | null, measure: (t: string) => number): { bands: EpochBand[]; labels: EpochLabel[] } {
  const PAD = 4;
  const bands: EpochBand[] = [];
  epochs.forEach((e, i) => {
    const a = Math.max(0, x(toAstro(e.start)));
    const b = Math.min(w, x(toAstro(e.end)));
    if (b > a) bands.push({ i, name: e.name, a, b });
  });
  const labels: EpochLabel[] = [];
  const own = bands.find((band) => epochs[band.i].id === born) ?? null;
  if (own) {
    const tw = measure(own.name);
    // в видимую часть своей полосы; не помещается — к её правому краю, но не за края шкалы
    let lx = own.a + PAD;
    if (lx + tw > own.b - PAD) lx = own.b - PAD - tw;
    lx = Math.max(PAD / 2, Math.min(w - PAD / 2 - tw, lx));
    labels.push({ text: own.name, x: lx, w: tw });
  }
  for (const band of bands) {
    if (band === own) continue;
    const tw = measure(band.name);
    const lx = band.a + PAD;
    if (tw > band.b - band.a - 2 * PAD) continue;
    if (labels.some((l) => lx < l.x + l.w + 2 * PAD && lx + tw + 2 * PAD > l.x)) continue;
    labels.push({ text: band.name, x: lx, w: tw });
  }
  return { bands, labels };
}

/** Круглые годы оси: шаг, при котором на окно приходится 3–5 рисок. */
function roundTicks(t0: number, t1: number): number[] {
  const span = t1 - t0;
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => span / s <= 5) ?? 1000;
  const out: number[] = [];
  // риски — по историческому счёту (год 0 не существует): 1000 г. до Р. Х. — это астрономический −999
  for (let h = Math.ceil(toHist(t0) / step) * step; toAstro(h) <= t1; h += step) if (h !== 0) out.push(toAstro(h));
  return out;
}

/** Эра подписи оси: «до Р. Х.» или «по Р. Х.» — у крайней правой подписи и у первого года по Р. Х., если окно их разделяет. */
const eraOf = (t: number) => (toHist(t) < 0 ? ' до Р. Х.' : ' по Р. Х.');

/**
 * Мини-шкала жизни в три ряда (F2; VIS-06, VIS-41): эпохи с названиями; жизнь — ядро сплошное, неопределённые края
 * растушёваны, дети — риски, родители — кружки; ось лет — круглые годы и годы паспорта на концах.
 * У лица без опор (epochal) — скобка на всю эпоху «время не установлено» (ТЗ § 3.1); у народа — скобка «без года» (CARD-59).
 * Холст перерисовывается при каждой смене ширины (ручка границы, окно): подписи — всегда Jost 12 px (CARD-69).
 */
/** Мини-шкала жизни на фоне эпох; её же показывает образец в «Условных знаках» (G5). */
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
    const c = model.value.chrono.get(id);
    const win = axis ?? lifeWindow(id);
    if (!cv || !c || !win) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = LIFEBAR_H;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const col = (n: string) => cs.getPropertyValue(n).trim();
    const epochs = model.value.epochs;
    const people = isPeople(id);
    const [t0, t1] = win;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
    // кегль — ступень шкалы интерфейса 12 px (Jost), как подписи полей паспорта: холст не масштабируется (CARD-69)
    const font = mapFont(T_UI_S, { sans: true, coarse: false });
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    // ряды по высоте: эпохи 0–13, жизнь 17–21, риски детей 22–26, ось 28, подписи оси — базовая линия 42
    const EPOCH_H = 13;
    const EPOCH_BASE = 10;
    const lifeY = 17;
    const axisY = 28;
    const labelY = 42;
    // ряд 1 — эпохи: соседние различаются светлотой; подписи — только целыми словами, без многоточия (VIS-63)
    const { bands, labels: epochLabels } = epochBandLabels(epochs, x, w, birthEpoch(id, c, epochs)?.id ?? null, (t) => ctx.measureText(t).width);
    bands.forEach((band) => {
      ctx.fillStyle = band.i % 2 ? col('--rule') : col('--sheet-2');
      ctx.fillRect(band.a, 0, band.b - band.a, EPOCH_H);
    });
    ctx.fillStyle = col('--ink-2');
    for (const l of epochLabels) ctx.fillText(l.text, l.x, EPOCH_BASE);
    // названия эпох без подписи на полосе — в подсказке шкалы (холст — рисунок; диктору эпоху говорит паспорт)
    cv.title = bands.map((band) => band.name).join('; ');
    const ink = col('--ink');
    const ink2 = col('--ink-2');
    // ряд 3 — ось: черта и круглые годы; годы паспорта на концах жизни — поверх, круглые рядом с ними не пишутся
    ctx.fillStyle = col('--rule-strong');
    ctx.fillRect(0, axisY, w, 1);
    type Label = { x: number; w: number; text: string; tick: number; life: boolean };
    const labels: Label[] = [];
    const y = shownYears(c);
    const byEpoch = c.cls === 'epochal' || people;
    if (!byEpoch && y) {
      const { left, right } = lifeBarLabels(c);
      if (left) labels.push({ x: x(y.b), w: ctx.measureText(left).width, text: left, tick: y.b, life: true });
      if (right && y.d !== null) labels.push({ x: x(y.d), w: ctx.measureText(right).width, text: right, tick: y.d, life: true });
    }
    // у лица без опор и у народа — подпись под скобкой эпохи на оси: круглые годы её не перекрывают
    const bracketEp = byEpoch ? birthEpoch(id, c, epochs) : null;
    const bracketText = people ? 'без года' : 'время не установлено';
    let bracketAt: { x: number; w: number } | null = null;
    if (bracketEp) {
      const a = x(toAstro(bracketEp.start));
      const b = x(toAstro(bracketEp.end));
      const tw = ctx.measureText(bracketText).width;
      bracketAt = { x: Math.max(0, Math.min(w - tw, (a + b) / 2 - tw / 2)), w: tw };
    }
    // круглые годы — только если шкале хватает ширины (CARD-69); окно через начало эры — первый год по Р. Х. с эрой
    const crossing = toHist(t0) < 0 && toHist(t1) > 0;
    if (w >= LIFEBAR_TICKS_MIN || byEpoch)
      for (const t of roundTicks(t0, t1)) labels.push({ x: x(t), w: ctx.measureText(String(Math.abs(toHist(t)))).width, text: String(Math.abs(toHist(t))), tick: t, life: false });
    // эра — у крайней правой подписи (VIS-06) и у первого года по Р. Х., если окно переходит через эру
    const place = (l: Label) => Math.max(0, Math.min(w - l.w, l.x - l.w / 2));
    const lifeLabels = labels.filter((l) => l.life);
    const roundLabels = labels.filter((l) => !l.life).sort((a, b) => a.tick - b.tick);
    // концы жизни не налезают друг на друга: правый сдвигается вправо, левый — влево
    if (lifeLabels.length === 2) {
      let a = place(lifeLabels[0]);
      let b = place(lifeLabels[1]);
      if (a + lifeLabels[0].w + 8 > b) {
        const mid = (a + lifeLabels[0].w + b) / 2;
        a = Math.max(0, mid - 4 - lifeLabels[0].w);
        b = Math.min(w - lifeLabels[1].w, mid + 4);
      }
      lifeLabels[0].x = a;
      lifeLabels[1].x = b;
    } else lifeLabels.forEach((l) => (l.x = place(l)));
    const taken = lifeLabels.map((l) => [l.x - 8, l.x + l.w + 8] as [number, number]);
    if (bracketAt) taken.push([bracketAt.x - 8, bracketAt.x + bracketAt.w + 8]);
    const shownRound: Label[] = [];
    let eraShown = false;
    for (const l of roundLabels) {
      const ad = crossing && toHist(l.tick) > 0 && !eraShown;
      const text = ad ? `${l.text}${eraOf(l.tick)}` : l.text;
      const tw = ctx.measureText(text).width;
      const lx = Math.max(0, Math.min(w - tw, l.x - tw / 2));
      if (taken.some(([a, b]) => lx < b && lx + tw > a)) continue;
      if (ad) eraShown = true;
      taken.push([lx - 6, lx + tw + 6]);
      shownRound.push({ ...l, x: lx, w: tw, text });
    }
    // эра — у крайней правой подписи оси (VIS-06): дописывается справа, риска остаётся под самим годом. Круглому году
    // у края места под эру нет — он уступает место (он лишь промежуточный); годы жизни сдвигаются влево не дальше
    // половины своей ширины; не помогло — эра у следующей подписи справа налево
    const all = [...shownRound, ...lifeLabels].sort((a, b) => b.x + b.w - (a.x + a.w));
    const want = all.length ? eraOf(all[0].tick) : '';
    if (all.length && !all.some((l) => l.text.includes(want.trim())))
      for (const l of [...all]) {
        const era = eraOf(l.tick);
        if (era !== want) continue;
        const ew = ctx.measureText(era).width;
        const shift = Math.max(0, l.x + l.w + ew - w);
        const x0 = l.x - shift;
        const x1 = x0 + l.w + ew;
        const clash = all.some((o) => o !== l && o.x < x1 + 6 && o.x + o.w > x0 - 6);
        if (shift > l.w / 2 - 2 || clash) {
          if (!l.life) {
            shownRound.splice(shownRound.indexOf(l), 1);
            all.splice(all.indexOf(l), 1);
          }
          continue;
        }
        l.x = x0;
        l.text += era;
        l.w += ew;
        break;
      }
    for (const l of shownRound) {
      ctx.fillStyle = col('--rule-strong');
      ctx.fillRect(x(l.tick) - 0.5, axisY, 1, 4);
      ctx.fillStyle = col('--ink-3');
      ctx.fillText(l.text, l.x, labelY);
    }
    for (const l of lifeLabels) {
      ctx.fillStyle = ink;
      ctx.fillRect(x(l.tick) - 0.5, axisY - 2, 1, 6);
      ctx.fillStyle = ink2;
      ctx.fillText(l.text, l.x, labelY);
    }
    // ряд 2 — жизнь
    if (byEpoch) {
      if (!bracketEp) return;
      // время не установлено или народ: скобка на всю эпоху, без годов (ТЗ § 3.1; CARD-59)
      const a = x(toAstro(bracketEp.start));
      const b = x(toAstro(bracketEp.end));
      ctx.strokeStyle = ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a, lifeY + 6);
      ctx.lineTo(a, lifeY);
      ctx.lineTo(b, lifeY);
      ctx.lineTo(b, lifeY + 6);
      ctx.stroke();
      ctx.fillStyle = ink2;
      if (bracketAt) ctx.fillText(bracketText, bracketAt.x, labelY);
      return;
    }
    if (!y) return;
    const [bLo, bHi] = birthRange(id, c, model.value.chrono);
    // жизнь: растушёвка только на неопределённом начале, сплошная часть до смерти или последнего события, дальше — пунктир
    const g = ctx.createLinearGradient(x(bLo), 0, x(bHi), 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, ink);
    ctx.fillStyle = c.cls === 'exact' ? ink : g;
    ctx.fillRect(x(bLo), lifeY, Math.max(2, x(bHi) - x(bLo)), 4);
    ctx.fillStyle = ink;
    const solidEnd = c.d ?? c.last ?? bHi;
    if (solidEnd > bHi) ctx.fillRect(x(bHi), lifeY, x(solidEnd) - x(bHi), 4);
    if (c.d === null) {
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(Math.max(solidEnd, bHi)), lifeY + 2);
      ctx.lineTo(x(Math.max(solidEnd, bHi)) + 12, lifeY + 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // рождения родителей (кружки 3 px) и детей (риски 1 × 4) — у полосы жизни
    const p = byId.get(id)!;
    ctx.strokeStyle = ink2;
    ctx.lineWidth = 1;
    for (const par of [p.father, p.mother]) {
      const pc = par ? model.value.chrono.get(par) : null;
      if (!pc || pc.cls === 'epochal') continue;
      ctx.beginPath();
      ctx.arc(x(pc.b), lifeY + 2, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = ink2;
    for (const e of graph.childrenOf.get(id) ?? []) {
      const kc = model.value.chrono.get(e.child);
      if (kc && kc.cls !== 'epochal') ctx.fillRect(x(kc.b) - 0.5, lifeY + 5, 1, 4);
    }
  }, [id, model.value, loaded, axis?.[0], axis?.[1], width]);
  // размер — классом .lifebar (src/styles/folio.css): ширина строки, высота LIFEBAR_H
  return <canvas class="lifebar" ref={ref} aria-hidden="true" />;
}
