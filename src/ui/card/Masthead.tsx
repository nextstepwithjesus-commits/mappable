import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { byId, graph, lineMembership, loadCard, loadedCard } from '../../data/atlas.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { Mark, MarkNote, MARK_FULL } from '../common.tsx';
import { lifeSpanText, shownYears, shortYear, toAstro, toHist } from '../../engine/years.ts';
import { activityEpochs, affiliation, birthEpoch, birthRange, constellation, roleLabel } from './shared.tsx';
import { typo, typoTree } from '../text/typo.ts';
import { mapFont, coarsePointer, T_MAP_S } from '../../render/type.ts';

/** Народ или род из родословия (Быт 10; Езд 2): у него нет рождения и жизни, только место в родословии. */
export const isPeople = (id: string) => {
  const k = byId.get(id)?.kind;
  return k === 'people' || k === 'clan';
};

/**
 * Шапка карточки: имя, уточнение, строка команд (у листа), паспорт, мини-шкала жизни, отметки линий Мессии.
 * actions — команды листа под именем (F2); axis — общая ось лет мини-шкалы (в развороте у двух шапок одна ось).
 */
export function Masthead({ id, actions, axis }: { id: string; actions?: ComponentChildren; axis?: [number, number] }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const eps = activityEpochs(id, c, model.value.epochs);
  const tribe = affiliation(id);
  const star = constellation(p.group);
  const years = c ? lifeSpanText(c, { people: isPeople(id) }) : '';
  const j = lineMembership.joseph.has(id);
  const mm = lineMembership.mary.has(id);
  return (
    <header class="mast">
      <h2 id={`title-${id}`} tabIndex={-1}>{p.name}</h2>
      {p.disambig ? <div class="dis">{typo(p.disambig)}</div> : null}
      {actions}
      {typoTree(<dl class="passport">
        {p.roles.length ? (
          <>
            <dt>Роль</dt>
            <dd>{roleLabel(id)}</dd>
          </>
        ) : null}
        {star ? (
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
        <dt>Эпоха</dt>
        <dd>{eps.length ? (eps.length === 1 ? eps[0].name : `${eps[0].name} — ${eps[eps.length - 1].name}`) : '—'}</dd>
        <dt>Годы</dt>
        {/* class fact: помета «расч.» встаёт на внешнее поле строки, как у фактов разделов */}
        <dd class="fact">
          {years ? (
            <>
              {years}
              {c?.cls === 'exact' ? <MarkNote label="расч." full={MARK_FULL.exact} /> : <Mark calc />}
            </>
          ) : (
            'время не установлено'
          )}
        </dd>
      </dl>)}
      <LifeBar id={id} axis={axis} />
      {(j || mm) && (
        <div class="lines">
          {j && (
            <span>
              <span class="swatch gold" />
              линия Иосифа{' '}
            </span>
          )}
          {mm && (
            <span>
              <span class="swatch azure" />
              линия по Луке
            </span>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * Подписи концов мини-шкалы — те же годы, что в паспорте. Конец подписывается, только если год смерти есть в паспорте;
 * у лиц без опор (epochal) годов нет, у народа — только время в родословии.
 */
export function lifeBarLabels(c: ChronoRow): { left: string | null; right: string | null } {
  const y = shownYears(c);
  if (!y) return { left: null, right: null };
  // о смерти нет данных — или умер в год рождения (младенец): одна подпись, как в паспорте
  if (y.d === null || y.d === y.b) return { left: shortYear(y.b, y.approx, true), right: null };
  const hb = toHist(y.b);
  const hd = toHist(y.d);
  return { left: shortYear(y.b, y.approx, hb < 0 && hd > 0), right: shortYear(y.d, y.approx, true) };
}

/** Высота мини-шкалы в CSS-пикселях; та же в правиле .lifebar (src/styles/folio.css). */
const LIFEBAR_H = 56;

/**
 * Окно мини-шкалы в астрономических годах: у лица без опор — его эпоха; иначе от раннего края рождения до смерти
 * или последнего события, с полями по 30 %. Развороту — для общей оси двух шапок (объединение окон).
 */
export function lifeWindow(id: string): [number, number] | null {
  const c = model.value.chrono.get(id);
  if (!c) return null;
  const epochs = model.value.epochs;
  const ep = c.cls === 'epochal' ? birthEpoch(id, c, epochs) : null;
  if (c.cls === 'epochal' && !ep) return null;
  const [bLo, bHi] = birthRange(id, c, model.value.chrono);
  const start = ep ? toAstro(ep.start) : bLo;
  const end = ep ? toAstro(ep.end) : isPeople(id) ? bHi : (c.d ?? c.last ?? bHi);
  const span = Math.max(80, end - start);
  return [start - span * 0.3, end + span * 0.3];
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

/**
 * Мини-шкала жизни в три ряда (F2; VIS-06): эпохи с названиями; жизнь — ядро сплошное, неопределённые края
 * растушёваны, дети — риски, родители — кружки; ось лет — круглые годы и годы паспорта на концах.
 * У лица без опор (epochal) — скобка на всю эпоху «время не установлено» (ТЗ § 3.1).
 */
function LifeBar({ id, axis }: { id: string; axis?: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // границы рождения из данных приходят с томом карточки; шапка с сигналами не перерисовывается вместе с Folio,
  // поэтому шкала сама ждёт свой том и перерисовывается, когда он пришёл
  const [, setVolume] = useState(0);
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
    // кегль холста — ступень шкалы T_MAP_S (11,5 px; на сенсорном экране 12,5 px), src/render/type.ts
    const font = mapFont(T_MAP_S, { sans: true, coarse: coarsePointer() });
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    // ряд 1 — эпохи: соседние различаются светлотой, названия с многоточием, если не помещаются
    const fit = (s: string, room: number) => {
      if (ctx.measureText(s).width <= room) return s;
      let t = s;
      while (t.length > 1 && ctx.measureText(`${t}…`).width > room) t = t.slice(0, -1);
      return t.length > 2 ? `${t.trimEnd()}…` : '';
    };
    epochs.forEach((e, i) => {
      const a = Math.max(0, x(toAstro(e.start)));
      const b = Math.min(w, x(toAstro(e.end)));
      if (b <= a) return;
      ctx.fillStyle = i % 2 ? col('--rule') : col('--sheet-2');
      ctx.fillRect(a, 0, b - a, 14);
      const label = fit(e.name, b - a - 8);
      if (label) {
        ctx.fillStyle = col('--ink-2');
        ctx.fillText(label, a + 4, 11);
      }
    });
    const ink = col('--ink');
    const ink2 = col('--ink-2');
    // ряд 3 — ось: черта и круглые годы; годы паспорта на концах жизни — поверх, круглые рядом с ними не пишутся
    const axisY = 38;
    ctx.fillStyle = col('--rule-strong');
    ctx.fillRect(0, axisY, w, 1);
    const labels: { x: number; w: number; text: string; tick: number }[] = [];
    const y = shownYears(c);
    if (c.cls !== 'epochal' && y) {
      const { left, right } = lifeBarLabels(c);
      if (left) labels.push({ x: x(y.b), w: ctx.measureText(left).width, text: left, tick: y.b });
      if (right && y.d !== null) labels.push({ x: x(y.d), w: ctx.measureText(right).width, text: right, tick: y.d });
    }
    // концы жизни не налезают друг на друга: правый сдвигается вправо, левый — влево
    const place = (l: (typeof labels)[number]) => Math.max(0, Math.min(w - l.w, l.x - l.w / 2));
    if (labels.length === 2) {
      let a = place(labels[0]);
      let b = place(labels[1]);
      if (a + labels[0].w + 8 > b) {
        const mid = (a + labels[0].w + b) / 2;
        a = Math.max(0, mid - 4 - labels[0].w);
        b = Math.min(w - labels[1].w, mid + 4);
      }
      labels[0].x = a;
      labels[1].x = b;
    } else labels.forEach((l) => (l.x = place(l)));
    const taken = labels.map((l) => [l.x - 8, l.x + l.w + 8] as [number, number]);
    // у лица без опор подпись «время не установлено» стоит на оси под скобкой эпохи: круглые годы её не перекрывают
    const epochal = c.cls === 'epochal' ? birthEpoch(id, c, epochs) : null;
    let epochalAt: { x: number; w: number } | null = null;
    if (epochal) {
      const a = x(toAstro(epochal.start));
      const b = x(toAstro(epochal.end));
      const tw = ctx.measureText('время не установлено').width;
      epochalAt = { x: Math.max(0, Math.min(w - tw, (a + b) / 2 - tw / 2)), w: tw };
      taken.push([epochalAt.x - 8, epochalAt.x + tw + 8]);
    }
    ctx.font = font;
    // окно через начало эры: первый год по Р. Х. подписан эрой, иначе «50» слева и «50» справа не различить
    const crossing = toHist(t0) < 0 && toHist(t1) > 0;
    let eraShown = false;
    for (const t of roundTicks(t0, t1)) {
      const tx = x(t);
      ctx.fillStyle = col('--rule-strong');
      ctx.fillRect(tx - 0.5, axisY, 1, 4);
      const ad = crossing && toHist(t) > 0 && !eraShown;
      const text = `${Math.abs(toHist(t))}${ad ? '\u00a0по\u00a0Р.\u00a0Х.' : ''}`;
      const tw = ctx.measureText(text).width;
      const lx = Math.max(0, Math.min(w - tw, tx - tw / 2));
      if (taken.some(([a, b]) => lx < b && lx + tw > a)) continue;
      if (ad) eraShown = true;
      taken.push([lx - 6, lx + tw + 6]);
      ctx.fillStyle = col('--ink-3');
      ctx.fillText(text, lx, 52);
    }
    for (const l of labels) {
      ctx.fillStyle = ink;
      ctx.fillRect(x(l.tick) - 0.5, axisY - 2, 1, 6);
      ctx.fillStyle = ink2;
      ctx.fillText(l.text, l.x, 52);
    }
    // ряд 2 — жизнь
    const lifeY = 21;
    if (c.cls === 'epochal') {
      const ep = birthEpoch(id, c, epochs);
      if (!ep) return;
      // время не установлено: скобка на всю эпоху, без годов (ТЗ § 3.1)
      const a = x(toAstro(ep.start));
      const b = x(toAstro(ep.end));
      ctx.strokeStyle = ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a, lifeY + 6);
      ctx.lineTo(a, lifeY);
      ctx.lineTo(b, lifeY);
      ctx.lineTo(b, lifeY + 6);
      ctx.stroke();
      ctx.fillStyle = ink2;
      if (epochalAt) ctx.fillText('время не установлено', epochalAt.x, 52);
      return;
    }
    if (!y) return;
    const [bLo, bHi] = birthRange(id, c, model.value.chrono);
    if (people) {
      // народ или род: только засечка времени в родословии, без следа жизни
      ctx.fillStyle = ink;
      ctx.fillRect(x(c.b) - 1, lifeY - 3, 2, 10);
    } else {
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
    }
    // рождения родителей (кружки 3 px) и детей (риски 1 × 5) — у полосы жизни
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
      if (kc && kc.cls !== 'epochal') ctx.fillRect(x(kc.b) - 0.5, lifeY + 6, 1, 5);
    }
  }, [id, model.value, loaded, axis?.[0], axis?.[1]]);
  // размер — классом .lifebar (src/styles/folio.css): ширина строки, высота LIFEBAR_H
  return <canvas class="lifebar" ref={ref} aria-hidden="true" />;
}
