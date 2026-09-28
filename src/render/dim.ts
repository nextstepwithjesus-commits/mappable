/**
 * Затемнение при выделении (ТЗ § 3.1: «остальное небо гаснет до 25 %»; E12, MOB-41; решение 31):
 *  — звёзды, следы и связи вне выделения — 22 % яркости;
 *  — «вероятно» живые на меридиане — 60 % (MAP-33): бледнее, чем «наверняка», но ярче погашенных;
 *  — погашенные подписи — текст, и по ТЗ § 3.8 держат 4,5 : 1 (DIM_LABEL_CONTRAST) к самому светлому фону под ними:
 *    полосе эпохи, облаку плотности на ней (dimLabelAlpha); гаснут звёзды и связи, а подпись — ещё и начертанием
 *    (без полужирного, labels.ts);
 *  — названия созвездий при выделении — не ниже 0,75 (CONSTELLATION_DIM).
 * Числа проверяют tests/sky-wave3b.test.ts и npm run -s contrast (tools/contrast.ts) в обеих темах.
 */
import { hexToRgb } from './color.ts';
import { contrast, luminance } from '../ui/contrast.ts';

export const DIM = 0.22;
export const LIKELY = 0.6;
export const DIM_LABEL_CONTRAST = 4.5;
/**
 * Облака плотности под погашенной подписью (sky.ts, drawClouds): доля цвета --ink в облаке при выделении рода — половина
 * наибольшей (CLOUD_MAX: ночью 0,14, днём 0,09).
 */
export const CLOUD_DIMMED = { night: 0.07, day: 0.045 };
export const CONSTELLATION_DIM = 0.75;
/**
 * Режим «набор» (J4; MAP-64): набор — уже выбор читателя, поэтому выделение рода гасит его лица не ниже 70 %
 * (звёзды, следы, связи и подписи).
 */
export const WORK_DIM = 0.7;

/**
 * Непрозрачность подписи «вероятно» при пороге погашенной floor: не меньше 0,6 и заметно ярче погашенной — на три четверти
 * пути от порога к полной яркости (отношение контрастов не ниже 1,2 в обеих темах). Порог 4,5 : 1 у --ink-2 днём — около 0,88.
 */
export const likelyAlpha = (floor: number) => Math.max(LIKELY, floor + (1 - floor) * 0.75);

const HEX = /^#[0-9a-f]{6}$/i;
/** Цвет fg с непрозрачностью a поверх bg — так, как его смешивает холст (#rrggbb). */
export function over(fg: string, bg: string, a: number): string {
  const F = hexToRgb(fg);
  const B = hexToRgb(bg);
  return `#${[0, 1, 2].map((k) => Math.round(B[k] + (F[k] - B[k]) * a).toString(16).padStart(2, '0')).join('')}`;
}
/**
 * Наименьшая непрозрачность цвета fg поверх bg, при которой контраст к bg не ниже min (с запасом 0,05 на округление
 * смешения холстом). Цвет, которому и при полной непрозрачности не хватает контраста, получает 1.
 */
export function alphaForContrast(fg: string, bg: string, min: number): number {
  if (!HEX.test(fg.trim()) || !HEX.test(bg.trim())) return 0.5;
  const need = min + 0.05;
  if (contrast(over(fg, bg, 1), bg) < need) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (contrast(over(fg, bg, m), bg) >= need) hi = m;
    else lo = m;
  }
  return hi;
}

/** Фоны, на которых может стоять подпись цвета ink: небо, полоса эпохи и облако плотности на каждом из них. */
export function labelGrounds(ink: string, sky: string, band: string, cloud: number): string[] {
  const out = [sky];
  if (HEX.test(band.trim())) out.push(band);
  if (HEX.test(ink.trim())) for (const b of [...out]) out.push(over(ink, b, cloud));
  return out;
}
/**
 * Непрозрачность погашенной подписи цвета ink (решение 31; MOB-41): наименьшая, при которой контраст не ниже
 * DIM_LABEL_CONTRAST к каждому фону под ней — небу, полосе эпохи, облаку.
 */
export function dimLabelAlpha(ink: string, sky: string, band: string, cloud: number): number {
  return Math.max(...labelGrounds(ink, sky, band, cloud).map((b) => alphaForContrast(ink, b, DIM_LABEL_CONTRAST)));
}

// ---------- светлота лент (решение 32; MOB-61) ----------


/** Наименьшее отношение светлот золотой и лазурной ленты в одном месте линии — в обеих темах (решение 32). */
export const RIBBON_LIGHTNESS = 1.5;
type Rgb = [number, number, number];
const hex2 = (c: Rgb) => `#${c.map((k) => Math.max(0, Math.min(255, Math.round(k))).toString(16).padStart(2, '0')).join('')}`;
/** Светлее (k > 0: к белому) или темнее (k < 0: к чёрному) на долю |k|. */
function shade(hex: string, k: number): string {
  const c = hexToRgb(hex);
  return hex2(k >= 0 ? (c.map((x) => x + (255 - x) * k) as Rgb) : (c.map((x) => x * (1 + k)) as Rgb));
}
/**
 * Цвета лент для холста (решение 32; MOB-61): оттенки ТЗ § 5.2, но светлоты разведены не меньше чем в 1,5 раза
 * в каждом конце линии — ленты различаются и без цвета (серый, проектор, дальтонизм). Ночью лазурь светлее золота,
 * днём золото светлее лазури. Сдвигаются обе ленты понемногу, пока отношение не достигнуто; лента не теряет
 * контраста 3 : 1 к небу (ТЗ § 3.8). Возвращает [золото начала, золото конца, лазурь начала, лазурь конца].
 */
export function separateRibbons(gold: [string, string], azure: [string, string], sky: string, night: boolean): [string, string, string, string] {
  if (![...gold, ...azure, sky].every((c) => /^#[0-9a-f]{6}$/i.test(c.trim()))) return [gold[0], gold[1], azure[0], azure[1]];
  const out: [string, string][] = [0, 1].map((k) => {
    // светлая и тёмная лента этой темы
    let hi = night ? azure[k] : gold[k];
    let lo = night ? gold[k] : azure[k];
    const ratio = () => (luminance(hi) + 0.05) / (luminance(lo) + 0.05);
    for (let step = 0; step < 80 && ratio() < RIBBON_LIGHTNESS + 0.02; step++) {
      let moved = false;
      const dl = shade(lo, -0.03);
      if (contrast(dl, sky) >= 3.05 && luminance(dl) < luminance(lo)) {
        lo = dl;
        moved = true;
      }
      if (ratio() >= RIBBON_LIGHTNESS + 0.02) break;
      const lh = shade(hi, 0.03);
      if (contrast(lh, sky) >= 3.05 && luminance(lh) > luminance(hi)) {
        hi = lh;
        moved = true;
      }
      if (!moved) break;
    }
    return night ? [lo, hi] : [hi, lo];
  });
  return [out[0][0], out[1][0], out[0][1], out[1][1]];
}


const toneMemo = new Map<string, string>();
/**
 * Цвет ленты для текста (номера у бусин, решение 39): сам цвет, если его контраст ко всем фонам grounds не ниже min
 * (текст — 4,5 : 1, ТЗ § 3.8), иначе он придвигается к цвету текста ink, пока контраст не станет достаточным.
 * Цвета — #rrggbb; результат — #rrggbb.
 */
export function textTone(color: string, grounds: readonly string[], ink: string, min = 4.5): string {
  const key = `${color}|${grounds.join()}|${ink}|${min}`;
  const hit = toneMemo.get(key);
  if (hit) return hit;
  let out = color;
  if ([color, ink, ...grounds].every((c) => HEX.test(c.trim())))
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const c = over(ink, color, t);
      out = c;
      if (grounds.every((g) => contrast(c, g) >= min)) break;
    }
  toneMemo.set(key, out);
  return out;
}
