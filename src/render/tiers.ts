/**
 * Режим «Эпохи» (ТЗ § 3.5): ярусы на том же полотне и в том же масштабе времени.
 * Эпохи; судьи; цари Иудеи; цари Израиля (совместные правления — подрядами с перекрытием);
 * служения пророков; события. Промежуток жизни выбранного лица проецируется столбцом через все ярусы.
 */
import type { Sky, SkyState } from './sky.ts';
import { byId, persons, type ModelData } from '../data/atlas.ts';
import { toAstro } from '../engine/years.ts';

interface Bar {
  id: string;
  label: string;
  t0: number;
  t1: number;
  soft: boolean;
}

const FONT_SERIF = "'Literata Variable', Literata, Georgia, serif";
const FONT_SANS = "'Jost Variable', Jost, sans-serif";

let cache: { model: string; tiers: { name: string; bars: Bar[] }[] } | null = null;

function buildTiers(m: ModelData) {
  if (cache && cache.model === m.id) return cache;
  const epochs = m.epochs;
  const ep: Bar[] = epochs.map((e) => ({ id: e.id, label: e.name, t0: toAstro(e.start), t1: toAstro(e.end), soft: e.id === 'judges' || e.id === 'conquest' }));
  const judges: Bar[] = [];
  const judah: Bar[] = [];
  const israel: Bar[] = [];
  const prophets: Bar[] = [];
  for (const p of persons) {
    for (const r of p.reign) {
      const bar = { id: p.id, label: p.name, t0: toAstro(r.start), t1: Math.max(toAstro(r.end), toAstro(r.start) + 0.6), soft: false };
      if (/Иуд/.test(r.over)) judah.push(bar);
      else if (/Израил/.test(r.over) && !p.roles.includes('judge')) israel.push(bar);
    }
    if (p.roles.includes('judge') && p.active) judges.push({ id: p.id, label: p.name, t0: toAstro(p.active[0]), t1: toAstro(p.active[1]), soft: true });
    if (p.roles.includes('prophet') && p.active) prophets.push({ id: p.id, label: p.name, t0: toAstro(p.active[0]), t1: toAstro(p.active[1]), soft: false });
  }
  const events: Bar[] = epochs.flatMap((e) => e.events.map((ev, i) => ({ id: `${e.id}-${i}`, label: ev.text, t0: toAstro(ev.year), t1: toAstro(ev.year), soft: false })));
  cache = {
    model: m.id,
    tiers: [
      { name: 'Эпохи', bars: ep },
      { name: 'Судьи', bars: judges },
      { name: 'Цари Иудеи', bars: judah },
      { name: 'Цари Израиля', bars: israel },
      { name: 'Пророки', bars: prophets },
      { name: 'События', bars: events },
    ],
  };
  return cache;
}

/** Раскладка полос яруса по подрядам (совместные правления не накладываются). */
function rowsOf(bars: Bar[]): Bar[][] {
  const rows: Bar[][] = [];
  for (const b of [...bars].sort((a, c) => a.t0 - c.t0)) {
    const row = rows.find((r) => r[r.length - 1].t1 <= b.t0);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows;
}

export function drawTiers(sky: Sky, s: SkyState) {
  const { ctx, cam, pal } = sky;
  const W = cam.w;
  const { tiers } = buildTiers(s.model);
  const top = 30;
  const rowH = 17;
  let y = top;
  // подложка
  const layout = tiers.map((t) => ({ t, rows: t.name === 'Эпохи' || t.name === 'События' ? [t.bars] : rowsOf(t.bars) }));
  const totalH = layout.reduce((a, l) => a + Math.max(1, l.rows.length) * rowH + 18, 0) + 8;
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, top - 4, W, totalH);
  ctx.strokeStyle = pal.rule;
  ctx.beginPath();
  ctx.moveTo(0, top - 4 + totalH + 0.5);
  ctx.lineTo(W, top - 4 + totalH + 0.5);
  ctx.stroke();

  const sel = s.selected ? s.model.chrono.get(s.selected) : null;
  const selP = s.selected ? byId.get(s.selected) : null;

  for (const { t, rows } of layout) {
    ctx.font = `500 11.5px ${FONT_SANS}`;
    ctx.fillStyle = pal.ink3;
    ctx.fillText(t.name, 24, y + 11);
    y += 15;
    for (const row of rows.length ? rows : [[]]) {
      for (const b of row) {
        const x0 = cam.sx(sky.xOf(b.t0));
        const x1 = cam.sx(sky.xOf(b.t1));
        if (x1 < 0 || x0 > W) continue;
        const inSel = sel ? b.t1 >= sel.bLo && b.t0 <= (sel.d ?? sel.dEst) : false;
        if (t.name === 'События') {
          ctx.strokeStyle = inSel ? pal.ink2 : pal.ink3;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x0) + 0.5, y);
          ctx.lineTo(Math.round(x0) + 0.5, y + rowH - 4);
          ctx.stroke();
          continue;
        }
        const h = rowH - 5;
        const wBar = Math.max(1.5, x1 - x0);
        // полоса — тон неба на ступень светлее; пересечение с жизнью выбранного лица — ещё на ступень
        ctx.fillStyle = pal.band;
        ctx.fillRect(x0, y, wBar, h);
        if (inSel) {
          ctx.fillStyle = pal.rule;
          ctx.fillRect(x0, y, wBar, h);
        }
        ctx.strokeStyle = inSel ? pal.ink3 : pal.ruleStrong;
        ctx.lineWidth = 1;
        ctx.setLineDash(b.soft ? [2, 2] : []);
        ctx.strokeRect(x0 + 0.5, y + 0.5, wBar - 1, h - 1);
        ctx.setLineDash([]);
        ctx.font = `450 11.5px ${FONT_SERIF}`;
        const tw = ctx.measureText(b.label).width;
        if (x1 - x0 > tw + 8) {
          ctx.fillStyle = inSel ? pal.ink : pal.ink2;
          ctx.fillText(b.label, Math.max(x0 + 4, Math.min(x1 - tw - 4, 24)), y + h - 3);
        }
      }
      y += rowH;
    }
    y += 3;
  }

  // проекция выбранного лица столбцом
  if (sel && selP) {
    const end = sel.d ?? sel.last ?? sel.b;
    const a = cam.sx(sky.xOf(sel.bLo));
    const b = cam.sx(sky.xOf(sel.bHi));
    const c = cam.sx(sky.xOf(end));
    const d = cam.sx(sky.xOf(sel.d ?? sel.dEst));
    const g = ctx.createLinearGradient(a, 0, b, 0);
    g.addColorStop(0, 'rgba(128,160,210,0)');
    g.addColorStop(1, 'rgba(128,160,210,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(a, top - 4, Math.max(1, b - a), cam.h);
    ctx.fillStyle = 'rgba(128,160,210,0.16)';
    ctx.fillRect(b, top - 4, Math.max(1, c - b), cam.h);
    const g2 = ctx.createLinearGradient(c, 0, d, 0);
    g2.addColorStop(0, 'rgba(128,160,210,0.16)');
    g2.addColorStop(1, 'rgba(128,160,210,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(c, top - 4, Math.max(1, d - c), cam.h);
    ctx.strokeStyle = pal.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(b) + 0.5, top - 4);
    ctx.lineTo(Math.round(b) + 0.5, cam.h);
    ctx.stroke();
    ctx.font = `italic 400 13px ${FONT_SERIF}`;
    ctx.fillStyle = pal.ink;
    ctx.fillText(selP.name, b + 6, top - 4 + totalH + 16);
  }
}
