import { useEffect, useRef } from 'preact/hooks';
import { byId, graph, groupById, lineMembership } from '../../data/atlas.ts';
import { model } from '../../state.ts';
import { roleText } from '../common.tsx';
import { toHist } from '../../engine/years.ts';
import { lifeText } from '../SkyView.tsx';

export function Masthead({ id }: { id: string }) {
  const p = byId.get(id)!;
  const c = model.value.chrono.get(id);
  const ep = c ? model.value.epochs.find((e) => e.id === (p.epoch ?? c.epoch)) : null;
  const j = lineMembership.joseph.has(id);
  const mm = lineMembership.mary.has(id);
  return (
    <header class="mast">
      <h2 id={`title-${id}`} tabIndex={-1}>{p.name}</h2>
      {p.disambig ? <div class="dis">{p.disambig}</div> : <div class="dis">&nbsp;</div>}
      <dl class="passport">
        {p.roles.length ? (
          <>
            <dt>Роль</dt>
            <dd>{roleText(p.roles, p.sex)}</dd>
          </>
        ) : null}
        <dt>Род</dt>
        <dd>{groupById.get(p.group)?.name}</dd>
        <dt>Эпоха</dt>
        <dd>{ep?.name ?? '—'}</dd>
        <dt>Годы</dt>
        <dd>{lifeText(id) || '—'}</dd>
      </dl>
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

/** Мини-шкала жизни на фоне эпохи: ядро — надёжная часть, края — неопределённость. */
function LifeBar({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const c = model.value.chrono.get(id);
    if (!cv || !c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = 52;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const col = (n: string) => cs.getPropertyValue(n).trim();
    const sans = cs.getPropertyValue('--sans').trim() || 'sans-serif';
    const end = c.d ?? c.dEst;
    const span = Math.max(80, end - c.bLo);
    const t0 = c.bLo - span * 0.3;
    const t1 = end + span * 0.3;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
    // эпохи — полосой с названиями
    ctx.font = `400 11px ${sans}`;
    ctx.textBaseline = 'alphabetic';
    model.value.epochs.forEach((e, i) => {
      const a = Math.max(0, x(toAstroYear(e.start)));
      const b = Math.min(w, x(toAstroYear(e.end)));
      if (b <= a) return;
      ctx.fillStyle = i % 2 ? col('--sky-band') : col('--sheet-2');
      ctx.fillRect(a, 0, b - a, 16);
      const tw = ctx.measureText(e.name).width;
      if (b - a > tw + 10) {
        ctx.fillStyle = col('--ink-3');
        ctx.fillText(e.name, a + 5, 12);
      }
    });
    // жизнь: размытое начало, сплошная часть, предполагаемый конец пунктиром
    const ink = col('--ink');
    const g = ctx.createLinearGradient(x(c.bLo), 0, x(c.bHi), 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, ink);
    ctx.fillStyle = c.cls === 'exact' ? ink : g;
    ctx.fillRect(x(c.bLo), 21, Math.max(2, x(c.bHi) - x(c.bLo)), 4);
    ctx.fillStyle = ink;
    const solidEnd = c.d ?? c.last ?? c.bHi;
    ctx.fillRect(x(c.bHi), 21, Math.max(2, x(solidEnd) - x(c.bHi)), 4);
    if (c.d === null) {
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(solidEnd), 23);
      ctx.lineTo(x(c.dEst), 23);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // рождения родителей (полые) и детей (сплошные) — риски под полосой
    const p = byId.get(id)!;
    ctx.strokeStyle = col('--ink-3');
    ctx.lineWidth = 1;
    for (const par of [p.father, p.mother]) {
      const pc = par ? model.value.chrono.get(par) : null;
      if (!pc) continue;
      ctx.beginPath();
      ctx.arc(x(pc.b), 31, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col('--ink-2');
    for (const e of graph.childrenOf.get(id) ?? []) {
      const kc = model.value.chrono.get(e.child);
      if (kc) ctx.fillRect(x(kc.b) - 0.5, 28, 1, 6);
    }
    // годы на концах
    ctx.font = `400 11.5px ${sans}`;
    ctx.fillStyle = col('--ink-2');
    const hb = toHist(c.b);
    const he = toHist(end);
    const era = he < 0 ? ' до Р. Х.' : hb < 0 ? ' по Р. Х.' : '';
    const left = `${c.cls === 'exact' ? '' : 'ок. '}${Math.abs(hb)}${hb < 0 && he > 0 ? ' до Р. Х.' : ''}`;
    const right = `${c.d === null ? 'ок. ' : ''}${Math.abs(he)}${era}`;
    const lw = ctx.measureText(left).width;
    const rw = ctx.measureText(right).width;
    const lx = Math.max(0, Math.min(w - lw, x(c.b) - lw / 2));
    const rx = Math.max(0, Math.min(w - rw, x(end) - rw / 2));
    if (lx + lw + 8 < rx) ctx.fillText(left, lx, 48);
    ctx.fillText(right, rx, 48);
  }, [id, model.value]);
  return <canvas class="lifebar" ref={ref} style={{ width: '100%', height: '52px' }} aria-hidden="true" />;
}

/** Годы эпох в данных исторические; шкала полосы — астрономическая. */
const toAstroYear = (hist: number) => (hist < 0 ? hist + 1 : hist);
