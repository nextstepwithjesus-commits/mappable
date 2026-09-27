import { useEffect, useRef, useState } from 'preact/hooks';
import { byId, graph, lineMembership, loadCard, loadedCard } from '../../data/atlas.ts';
import type { ChronoRow } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { roleText, Mark } from '../common.tsx';
import { lifeSpanText, shownYears, shortYear, toAstro, toHist } from '../../engine/years.ts';
import { activityEpochs, affiliation, birthEpoch, birthRange, constellation } from './shared.tsx';
import { typo, typoTree } from '../text/typo.ts';
import { mapFont, coarsePointer, T_MAP_S } from '../../render/type.ts';

/** Народ или род из родословия (Быт 10; Езд 2): у него нет рождения и жизни, только место в родословии. */
export const isPeople = (id: string) => {
  const k = byId.get(id)?.kind;
  return k === 'people' || k === 'clan';
};

export function Masthead({ id }: { id: string }) {
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
      {p.disambig ? <div class="dis">{typo(p.disambig)}</div> : <div class="dis">&nbsp;</div>}
      {typoTree(<dl class="passport">
        {p.roles.length ? (
          <>
            <dt>Роль</dt>
            <dd>{roleText(p.roles, p.sex)}</dd>
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
              {c?.cls === 'exact' ? <abbr class="mark" title="по числам Писания и принятой хронологической модели">расч.</abbr> : <Mark calc />}
            </>
          ) : (
            'время не установлено'
          )}
        </dd>
      </dl>)}
      <LifeBar id={id} />
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
  if (y.d === null) return { left: shortYear(y.b, y.approx, true), right: null };
  const hb = toHist(y.b);
  const hd = toHist(y.d);
  return { left: shortYear(y.b, y.approx, hb < 0 && hd > 0), right: shortYear(y.d, y.approx, true) };
}

/** Высота мини-шкалы в CSS-пикселях; та же в правиле .lifebar (src/styles/folio.css). */
const LIFEBAR_H = 52;

/** Мини-шкала жизни на фоне эпох: ядро — надёжная часть, растушёвка — неопределённость рождения. */
function LifeBar({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // границы рождения из данных приходят с томом карточки; шапка с сигналами не перерисовывается вместе с Folio,
  // поэтому шкала сама ждёт свой том и перерисовывается, когда он пришёл
  const [, setVolume] = useState(0);
  const loaded = loadedCard(id) !== null;
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    loadCard(id).then(() => alive && setVolume((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [id, loaded]);
  useEffect(() => {
    const cv = ref.current;
    const c = model.value.chrono.get(id);
    if (!cv || !c) return;
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
    // окно шкалы: у лица без опор — его эпоха; иначе от раннего края рождения до смерти или последнего события
    const ep = c.cls === 'epochal' ? birthEpoch(id, c, epochs) : null;
    const [bLo, bHi] = birthRange(id, c, model.value.chrono);
    const start = ep ? toAstro(ep.start) : bLo;
    const end = ep ? toAstro(ep.end) : people ? bHi : (c.d ?? c.last ?? bHi);
    const span = Math.max(80, end - start);
    const t0 = start - span * 0.3;
    const t1 = end + span * 0.3;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
    // эпохи — полосой с названиями
    // кегли холста — ступень шкалы T_MAP_S (11,5 px; на сенсорном экране 12,5 px), src/render/type.ts
    const font = mapFont(T_MAP_S, { sans: true, coarse: coarsePointer() });
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    epochs.forEach((e, i) => {
      const a = Math.max(0, x(toAstro(e.start)));
      const b = Math.min(w, x(toAstro(e.end)));
      if (b <= a) return;
      ctx.fillStyle = i % 2 ? col('--sky-band') : col('--sheet-2');
      ctx.fillRect(a, 0, b - a, 16);
      const tw = ctx.measureText(e.name).width;
      if (b - a > tw + 10) {
        ctx.fillStyle = col('--ink-3');
        ctx.fillText(e.name, a + 5, 12);
      }
    });
    const ink = col('--ink');
    ctx.font = font;
    if (c.cls === 'epochal') {
      if (!ep) return;
      // время не установлено: скобка на всю эпоху, без годов (ТЗ § 3.1)
      const a = x(toAstro(ep.start));
      const b = x(toAstro(ep.end));
      ctx.strokeStyle = col('--ink-2');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a, 28);
      ctx.lineTo(a, 23);
      ctx.lineTo(b, 23);
      ctx.lineTo(b, 28);
      ctx.stroke();
      const label = 'время не установлено';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = col('--ink-2');
      ctx.fillText(label, Math.max(0, Math.min(w - tw, (a + b) / 2 - tw / 2)), 44);
      return;
    }
    const y = shownYears(c);
    if (!y) return;
    if (people) {
      // народ или род: только засечка времени в родословии, без следа жизни
      ctx.fillStyle = ink;
      ctx.fillRect(x(c.b) - 1, 19, 2, 8);
    } else {
      // жизнь: размытое начало, сплошная часть до смерти или последнего события, дальше — короткий пунктир
      const g = ctx.createLinearGradient(x(bLo), 0, x(bHi), 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, ink);
      ctx.fillStyle = c.cls === 'exact' ? ink : g;
      ctx.fillRect(x(bLo), 21, Math.max(2, x(bHi) - x(bLo)), 4);
      ctx.fillStyle = ink;
      const solidEnd = c.d ?? c.last ?? bHi;
      if (solidEnd > bHi) ctx.fillRect(x(bHi), 21, x(solidEnd) - x(bHi), 4);
      if (c.d === null) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x(Math.max(solidEnd, bHi)), 23);
        ctx.lineTo(x(Math.max(solidEnd, bHi)) + 10, 23);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // рождения родителей (полые) и детей (сплошные) — риски под полосой
    const p = byId.get(id)!;
    ctx.strokeStyle = col('--ink-3');
    ctx.lineWidth = 1;
    for (const par of [p.father, p.mother]) {
      const pc = par ? model.value.chrono.get(par) : null;
      if (!pc || pc.cls === 'epochal') continue;
      ctx.beginPath();
      ctx.arc(x(pc.b), 31, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col('--ink-2');
    for (const e of graph.childrenOf.get(id) ?? []) {
      const kc = model.value.chrono.get(e.child);
      if (kc && kc.cls !== 'epochal') ctx.fillRect(x(kc.b) - 0.5, 28, 1, 6);
    }
    // годы на концах — те же, что в паспорте
    const { left, right } = lifeBarLabels(c);
    const lw = left ? ctx.measureText(left).width : 0;
    const rw = right ? ctx.measureText(right).width : 0;
    const lx = Math.max(0, Math.min(w - lw, x(y.b) - lw / 2));
    const rx = right && y.d !== null ? Math.max(0, Math.min(w - rw, x(y.d) - rw / 2)) : w;
    ctx.fillStyle = col('--ink-2');
    if (left && (!right || lx + lw + 8 < rx)) ctx.fillText(left, lx, 48);
    if (right) ctx.fillText(right, rx, 48);
  }, [id, model.value, loaded]);
  // размер — классом .lifebar (src/styles/folio.css): ширина строки, высота LIFEBAR_H
  return <canvas class="lifebar" ref={ref} aria-hidden="true" />;
}
