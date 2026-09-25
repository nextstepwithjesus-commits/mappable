/**
 * Условные знаки (ТЗ § 5.4). Общие для неба, легенды и образца.
 * Величина звезды 0–6 → радиус; мужчина — диск, женщина — диск в кольце, народ из таблицы народов —
 * пунктирный кружок (знак рассеянного скопления), Иисус Христос — восьмилучевая звезда (Откр 22:16),
 * царь — черта над знаком.
 */
export const MAG_R = [5.6, 4.6, 3.8, 3.1, 2.5, 2.0, 1.6];

export interface GlyphOpts {
  sex: 'm' | 'f';
  kind: string; // person | people | founder | clan
  magnitude: number;
  king?: boolean;
  messiah?: boolean;
  ghost?: boolean;
  hollow?: boolean; // расчётная дата — полый знак
  scale?: number;
  color: string;
  halo: string;
}

export function starRadius(mag: number, scale = 1): number {
  return MAG_R[Math.max(0, Math.min(6, mag))] * scale;
}

export function drawGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, o: GlyphOpts) {
  const r = starRadius(o.magnitude, o.scale ?? 1);
  ctx.save();
  ctx.fillStyle = o.color;
  ctx.strokeStyle = o.color;
  if (o.messiah) {
    // восьмилучевая звезда
    const R = r * 2.4;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * i) / 8 - Math.PI / 2;
      const rr = i % 2 === 0 ? (i % 4 === 0 ? R : R * 0.72) : R * 0.28;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  // подложка цвета неба — чтобы звезда отделялась от линий
  ctx.beginPath();
  ctx.fillStyle = o.halo;
  ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = o.color;
  if (o.kind === 'people' || o.kind === 'clan') {
    ctx.setLineDash([1.2, 1.6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (o.ghost) {
    ctx.setLineDash([1.5, 1.5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (o.hollow) {
      ctx.lineWidth = Math.max(1, r * 0.45);
      ctx.stroke();
    } else ctx.fill();
    if (o.sex === 'f') {
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, r + 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (o.king) {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const top = y - r - (o.sex === 'f' ? 4.6 : 3.2);
    ctx.moveTo(x - r - 1.5, top);
    ctx.lineTo(x + r + 1.5, top);
    ctx.stroke();
  }
  ctx.restore();
}

/** Сокращения ролей после имени на крупном масштабе (не больше двух). */
const SIGLA: [string, string][] = [
  ['messiah', ''],
  ['king', 'ц.'],
  ['queen', 'цар.'],
  ['prophet', 'пр.'],
  ['high-priest', 'первосв.'],
  ['priest', 'св.'],
  ['judge', 'суд.'],
  ['apostle', 'ап.'],
  ['patriarch', 'патр.'],
  ['levite', 'лев.'],
];
export function roleSigla(roles: string[]): string {
  const out: string[] = [];
  for (const [r, s] of SIGLA) if (roles.includes(r) && s) out.push(s);
  return out.slice(0, 2).join(' ');
}
