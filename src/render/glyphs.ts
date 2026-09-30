/**
 * Условные знаки (ТЗ § 5.4). Общие для неба, легенды и образца.
 * Величина звезды 0–6 → радиус; мужчина — диск, женщина — диск в кольце, народ или род из таблицы народов —
 * знак рассеянного скопления (пять точек на окружности 9 px, A14; MAP-14), Иисус Христос — восьмилучевая звезда
 * (Откр 22:16), царь — черта над знаком, умерший младенцем — знак † слева от звезды (A14; MAP-13).
 */
import { alpha } from './color.ts';

export const MAG_R = [5.6, 4.6, 3.8, 3.1, 2.5, 2.0, 1.6];

export interface GlyphOpts {
  sex: 'm' | 'f';
  kind: string; // person | people | founder | clan
  magnitude: number;
  king?: boolean;
  messiah?: boolean;
  ghost?: boolean;
  /** полый знак — только «время не установлено», вместе со скобкой (решение 42; MAP-77) */
  hollow?: boolean;
  /** умер младенцем: слева от звезды знак †, следа нет (A14) */
  infant?: boolean;
  scale?: number;
  color: string;
  halo: string;
}

/**
 * Знак лица на небе по данным: пол, род лица (народ, род), величина, черта царя или царицы, звезда Мессии, призрак жены,
 * полый знак у лица «время не установлено», знак † слева от звезды у умершего младенцем. Масштаб, цвет и подложку задаёт
 * тот, кто рисует.
 *
 * Полый знак значит одно — «время не установлено» (решение 42; MAP-77): он стоит в середине скобки. Расчётный год —
 * норма по П-6 (годы царей — реконструкция), знак у него сплошной; помета «расч.» — в подсказке и в карточке.
 */
export function personGlyph(
  p: { id: string; sex: 'm' | 'f'; kind: string; magnitude: number; roles: readonly string[] },
  ghost: boolean,
  cls: string | undefined,
  look: { scale: number; color: string; halo: string },
  infant = false,
): GlyphOpts {
  return {
    sex: p.sex, kind: p.kind, magnitude: p.magnitude, king: p.roles.includes('king') || p.roles.includes('queen'),
    // полый знак — только «время не установлено» (решение 42; MAP-52, MAP-77); расчётный год — сплошной знак
    messiah: p.id === 'iisus', ghost, hollow: cls === 'epochal', infant: infant && !ghost,
    scale: look.scale, color: look.color, halo: look.halo,
  };
}

/** Знак рассеянного скопления (народ, род): пять точек диаметром 1,6 px на окружности 9 px (MAP-14). */
export const SCATTER = { dots: 5, ring: 4.5, dot: 0.8 };

/** Размеры знака скопления у звезды радиуса r: радиус окружности точек и радиус точки. */
export function scatterOf(r: number, scale = 1): { R: number; d: number } {
  const s = Math.max(1, scale * (r > 3.8 ? r / 3.8 : 1));
  return { R: SCATTER.ring * s, d: Math.max(0.8, SCATTER.dot * Math.min(1.4, s)) };
}

/** Знак † слева от звезды радиуса r (справа — подпись, над — черта царя): высота 7 px, перекладина 4 px на трети от верха (A14). */
export function daggerAt(x: number, y: number, r: number): { x: number; top: number; bottom: number; bar: number; half: number } {
  const top = y - r - 3.5;
  return { x: x - r - 4, top, bottom: top + 7, bar: top + 2.3, half: 2 };
}

/** Толщина черты царя, px (VIS-40). */
export const KING_BAR_W = 1.5;
/** Черта царя у звезды радиуса r: длина 2r + 4, высота r + 3 над диском (у женщины — над кольцом r + 2,2). */
export function kingBar(x: number, y: number, r: number, sex: 'm' | 'f'): { x0: number; x1: number; y: number } {
  const top = r + (sex === 'f' ? 2.2 : 0) + 3;
  return { x0: x - r - 2, x1: x + r + 2, y: y - top };
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
  const people = o.kind === 'people' || o.kind === 'clan';
  // рассеянное скопление: пять точек на окружности 9 px; у величин 0–2 — крупнее
  const sc = scatterOf(r, o.scale ?? 1);
  // подложка цвета неба — чтобы звезда отделялась от линий
  ctx.beginPath();
  ctx.fillStyle = o.halo;
  ctx.arc(x, y, people ? sc.R + sc.d + 1.2 : r + 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = o.color;
  if (people) {
    ctx.beginPath();
    for (let k = 0; k < SCATTER.dots; k++) {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / SCATTER.dots;
      const px = x + Math.cos(a) * sc.R;
      const py = y + Math.sin(a) * sc.R;
      ctx.moveTo(px + sc.d, py);
      ctx.arc(px, py, sc.d, 0, Math.PI * 2);
    }
    ctx.fill();
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
  if (o.infant) {
    const g = daggerAt(x, y, r + (o.sex === 'f' ? 2.2 : 0));
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(g.x, g.top);
    ctx.lineTo(g.x, g.bottom);
    ctx.moveTo(g.x - g.half, g.bar);
    ctx.lineTo(g.x + g.half, g.bar);
    ctx.stroke();
  }
  if (o.king) {
    // черта царя (VIS-40, MAP-11): длиной 2r + 4, на r + 3 над диском (у царицы — над кольцом), толщиной 1,5 px —
    // не сливается с подписью и не читается как тире перед именем
    const b = kingBar(x, y, r, o.sex);
    ctx.lineWidth = KING_BAR_W;
    ctx.beginPath();
    ctx.moveTo(b.x0, b.y);
    ctx.lineTo(b.x1, b.y);
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
  ['patriarch', 'праот.'],
  ['levite', 'лев.'],
];
export function roleSigla(roles: string[]): string {
  const out: string[] = [];
  for (const [r, s] of SIGLA) if (roles.includes(r) && s) out.push(s);
  return out.slice(0, 2).join(' ');
}

/** Промежуток рождения (решение 38; MAP-69): высота растушёванной полосы, px, и её наибольшая плотность. */
export const BIRTH_BAND = { h: 6, alpha: 0.34 };

/**
 * Промежуток рождения лица, чей знак стоит у первого засвидетельствованного года (решение 38; MAP-69): растушёванная
 * полоса от x0 (начало промежутка) до x1 (его конец, у знака или левее) на высоте следа y — без острого знака внутри.
 * Слева она проявляется из неба, по краям строки — мягче. Этой же функцией полосу рисует «Как читать карту».
 */
export function drawBirthBand(ctx: CanvasRenderingContext2D, b: { x0: number; x1: number; y: number; color: string; alpha?: number }) {
  const w = b.x1 - b.x0;
  if (!(w >= 1)) return;
  const a = b.alpha ?? BIRTH_BAND.alpha;
  const g = ctx.createLinearGradient(b.x0, 0, b.x1, 0);
  g.addColorStop(0, alpha(b.color, 0));
  g.addColorStop(0.35, alpha(b.color, a));
  g.addColorStop(1, alpha(b.color, a * 0.85));
  ctx.save();
  ctx.fillStyle = g;
  // вертикальная растушёвка: широкая бледная полоса и узкая плотнее
  ctx.globalAlpha *= 0.45;
  ctx.fillRect(b.x0, b.y - BIRTH_BAND.h / 2, w, BIRTH_BAND.h);
  ctx.globalAlpha /= 0.45;
  ctx.fillRect(b.x0, b.y - BIRTH_BAND.h / 4, w, BIRTH_BAND.h / 2);
  ctx.restore();
}
