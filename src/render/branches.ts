/**
 * Цвета ветвей выбранного лица (решение 69; выбор владельца «по ветвям»). Поправка к ТЗ § 5.2: кроме двух лент, цвет
 * несёт подсветка ветвей выбранного лица.
 *
 *  — Ветви дают союзы лица, если союзов с детьми два и больше (Сарра, Агарь, Хеттура), иначе — дети (Сим, Хам, Иафет):
 *    src/engine/unions.ts, branchesOf. Какие лица в какой ветви у выбранного — src/render/marks.ts, branchMapOf.
 *  — Шесть цветов в каждой теме: зелёный, фиолетовый, коралловый, розовый, мятный, синий. Все не похожи на золото и
 *    лазурь лент и друг на друга, в том числе при дейтеранопии и протанопии; контраст к небу и полосе эпохи ≥ 3 : 1.
 *    Проверка — npm run -s contrast (tools/contrast.ts) и tests/branches-m4.test.ts.
 *  — Больше шести ветвей (у Давида восемь союзов) — цвета по кругу: соседние ветви не одного цвета, а седьмая и дальше —
 *    оттенок цвета первого круга (BRANCH_SHADES) и штрих на сплошной части следа (BRANCH_DASH).
 *  — Цвет бледнеет с каждым поколением (BRANCH_FADE): 1 — полный, 2 — 75 %, 3 — 55 %, дальше до 25 %, но не ниже
 *    различимого — контраст к небу не меньше BRANCH_FAR_CONTRAST.
 *  — Свечение: ночью — два слоя в режиме 'lighter', как у лент; днём — тон своего цвета под линией. Предки выбранного —
 *    мягкое свечение цветом текста (ночью светлое, днём тёмное).
 *
 * Модуль чистый: не знает об атласе (его читает и npm run -s contrast).
 */
import { alpha } from './color.ts';
import { alphaForContrast } from './dim.ts';
import { drawGlyph } from './glyphs.ts';

/**
 * Жёлтый выбранной связи (этап 11, § 8, 9): ночью — линия 2,5 px со свечением, днём — маркер 9 px под линией тона текста
 * (K1 § 2.7). Проверка контраста и различимости с лентами и ветвями — tools/contrast.ts.
 */
export const LINK_YELLOW = { night: '#F2E600', day: '#FCDA2D' };

export type MapTheme = 'night' | 'day';

/** Цвета ветвей по порядку: зелёный, фиолетовый, коралловый, розовый, мятный, синий (#rrggbb). */
export const BRANCH_COLORS: Readonly<Record<MapTheme, readonly string[]>> = {
  night: ['#48fd8b', '#9a75c8', '#e8968e', '#e960a2', '#81fac1', '#477dfe'],
  day: ['#137632', '#8243d8', '#e22a11', '#ce4094', '#1c8a64', '#19459a'],
};
/** Названия цветов — для «Условных знаков» и подсказок. */
export const BRANCH_NAMES: readonly string[] = ['зелёный', 'фиолетовый', 'коралловый', 'розовый', 'мятный', 'синий'];
/** Цвет ветви к небу и полосе эпохи — не меньше, чем у графики (ТЗ § 3.8). */
export const BRANCH_CONTRAST = 3;
/**
 * Различимость цветов ветвей (ΔE CIE76 в CIELAB): между собой, с лентами и с цветом текста — при обычном зрении
 * не меньше normal, при дейтеранопии и протанопии (моделирование Machado 2009) — не меньше cvd. Днём тёмных цветов
 * с контрастом 3 : 1 к светлому небу мало, поэтому пороги ниже, чем у двух лент (20): шесть цветов и четыре ленты
 * в одной полосе светлот.
 */
export const BRANCH_DE = { normal: 18, cvd: 10 };
/** Ветвь в дальних поколениях — не бледнее этого контраста к небу: цвет ещё различим, а небо вокруг погашено. */
export const BRANCH_FAR_CONTRAST = 2;
/** Яркость ветви по поколениям: 1-е — полная, 2-е — 75 %, 3-е — 55 %, дальше до 25 % (не ниже различимого). */
export const BRANCH_FADE: readonly number[] = [1, 0.75, 0.55, 0.42, 0.33, 0.25];
/**
 * Оттенки второго круга (седьмая ветвь и дальше): тот же цвет светлее или темнее — в ту сторону, где он дальше от других
 * цветов ветвей и лент (зелёный ночью темнеет: светлый ушёл бы в мятный); контраст к небу ≥ 3 : 1 (npm run -s contrast).
 */
export const BRANCH_SHADES: Readonly<Record<MapTheme, readonly string[]>> = {
  night: ['#247f46', '#b69cd7', '#99635e', '#ef8dbc', '#67c89a', '#6f9afe'],
  day: ['#0a3b19', '#6534a8', '#ac200d', '#7c2659', '#125b42', '#112e66'],
};
/** Сплошная часть следа у ветвей второго круга: штрих, чтобы не спутать с первым кругом. */
export const BRANCH_DASH: readonly number[] = [6, 2.5];

/**
 * Цвет ветви i (с нуля) в теме: шесть цветов по кругу, соседние ветви — разного цвета; со второго круга — оттенок того
 * же цвета (BRANCH_SHADES) и штрих на следе (branchDash). #rrggbb.
 */
export function branchColor(i: number, theme: MapTheme): string {
  const n = BRANCH_COLORS[theme].length;
  const k = ((Math.floor(i) % n) + n) % n;
  return (i >= n ? BRANCH_SHADES : BRANCH_COLORS)[theme][k];
}
/** Штрих сплошной части следа у ветви i: у первого круга — нет, со второго — BRANCH_DASH. */
export const branchDash = (i: number): readonly number[] => (i >= BRANCH_COLORS.night.length ? BRANCH_DASH : []);

const floorMemo = new Map<string, number>();
/**
 * Наименьшая непрозрачность цвета color, при которой ветвь различима на каждом из фонов grounds (небо, полоса эпохи):
 * контраст не меньше BRANCH_FAR_CONTRAST.
 */
export function branchFloor(color: string, grounds: readonly string[]): number {
  const key = `${color}|${grounds.join()}`;
  let a = floorMemo.get(key);
  if (a === undefined) {
    a = Math.max(0, ...grounds.map((g) => alphaForContrast(color, g, BRANCH_FAR_CONTRAST)));
    if (floorMemo.size > 256) floorMemo.clear();
    floorMemo.set(key, a);
  }
  return a;
}

/** Яркость ветви в поколении gen (1 — дети выбранного): BRANCH_FADE, не ниже floor. */
export function branchFade(gen: number, floor = 0): number {
  const g = Math.max(1, Math.floor(gen));
  return Math.max(floor, BRANCH_FADE[Math.min(g, BRANCH_FADE.length) - 1]);
}

// ---------- свечение ----------

/** Слои свечения: ширина, px, и сила (доля непрозрачности линии). Ночь — 'lighter', день — тон под линией. */
export const BRANCH_GLOW: Readonly<Record<MapTheme, readonly { width: number; a: number }[]>> = {
  night: [
    { width: 7, a: 0.09 },
    { width: 3.6, a: 0.18 },
  ],
  day: [{ width: 4.5, a: 0.2 }],
};
/** Свечение предков выбранного: мягче ветвей, цветом текста (ночью светлое, днём тёмное). */
export const ANCESTOR_GLOW: Readonly<Record<MapTheme, readonly { width: number; a: number }[]>> = {
  night: [
    { width: 6, a: 0.06 },
    { width: 3, a: 0.12 },
  ],
  day: [{ width: 4, a: 0.1 }],
};

/**
 * Свечение на обзоре (строка ниже 5 px, линии тоньше) дешевле: светятся только первые поколения ветвей (дальше цвет
 * и так бледный) — у Адама иначе светилось бы всё небо, и кадр при панорамировании рисовался бы на четверть дольше.
 */
export const OVERVIEW_GLOW_GENS = 3;
/** Светится ли потомок поколения gen: на обзоре — только первые OVERVIEW_GLOW_GENS поколений. */
export const glows = (gen: number, overview: boolean) => !overview || gen <= OVERVIEW_GLOW_GENS;
/** Слои свечения для кадра: на обзоре — только узкий слой (широкий там сливается в пятно). */
export function glowLayers(kind: 'branch' | 'ancestor', theme: MapTheme, overview = false): readonly { width: number; a: number }[] {
  const all = (kind === 'branch' ? BRANCH_GLOW : ANCESTOR_GLOW)[theme];
  return overview ? all.slice(-1) : all;
}

/**
 * Свечение кадра: отрезки собираются по цвету и силе и рисуются одним путём на слой — перекрытия внутри пути
 * не складываются (в режиме 'lighter' на стыках нет «бусин»), а путей на кадр — десятки, а не тысячи.
 */
export class GlowBatch {
  private paths = new Map<string, { color: string; a: number; seg: number[] }>();
  constructor(private layers: readonly { width: number; a: number }[]) {}
  /** Отрезок (x0, y0) — (x1, y1) цвета color (#rrggbb) силы a (0…1). */
  add(color: string, a: number, x0: number, y0: number, x1: number, y1: number) {
    if (a <= 0.01) return;
    const q = Math.round(a * 20) / 20;
    const key = `${color}|${q}`;
    let p = this.paths.get(key);
    if (!p) this.paths.set(key, (p = { color, a: q, seg: [] }));
    p.seg.push(x0, y0, x1, y1);
  }
  get size() {
    return this.paths.size;
  }
  /** Нарисовать и очистить: ночью — 'lighter', днём — обычным наложением. */
  flush(ctx: CanvasRenderingContext2D, night: boolean) {
    if (!this.paths.size) return;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (night) ctx.globalCompositeOperation = 'lighter';
    for (const l of this.layers) {
      ctx.lineWidth = l.width;
      for (const p of this.paths.values()) {
        ctx.strokeStyle = alpha(p.color, +(l.a * p.a).toFixed(3));
        ctx.beginPath();
        const s = p.seg;
        for (let k = 0; k < s.length; k += 4) {
          ctx.moveTo(s[k], s[k + 1]);
          ctx.lineTo(s[k + 2], s[k + 3]);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    this.paths.clear();
  }
}

// ---------- метка ветви у подписи ----------

/** Метка ветви (решение 69): цветная черта под началом подписи первого ребёнка ветви — ширина и толщина, px. */
export const BRANCH_TICK = { w: 12, h: 2 };
/** Где встанет метка ветви под подписью box (прямоугольник подписи звезды, labels.ts textBox): у нижнего края, слева. */
export function branchTickAt(box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  return { x: box.x + 1.5, y: box.y + box.h - 1.5 - BRANCH_TICK.h, w: Math.min(BRANCH_TICK.w, Math.max(4, box.w - 3)), h: BRANCH_TICK.h };
}

// ---------- образец для «Условных знаков» ----------

/** Штрих отвода к потомку выбранного — как LINK_STYLE.desc (trails.ts). */
const DESC_DASH: readonly number[] = [4, 3];

/** Палитра, которой довольно образцу: тема (glow — ночь), небо, текст. */
export interface BranchSamplePalette {
  glow: boolean;
  sky: string;
  band?: string;
  ink: string;
  ink2: string;
}

/**
 * Образец подсветки ветвей для «Условных знаков» (src/ui/panels/Legend.tsx, PAINTERS): отец выбранного — мягкое
 * свечение предка; выбранное лицо и три союза с детьми — три цвета ветвей со свечением; у первой ветви — внук,
 * бледнее (второе поколение). Отводы к потомкам — штрихом, как на небе. Сигнатура — как у образцов легенды:
 * (ctx, pal, w, h), пиксели CSS.
 */
export function drawBranchSample(ctx: CanvasRenderingContext2D, pal: BranchSamplePalette, w: number, h: number) {
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  const grounds = pal.band ? [pal.sky, pal.band] : [pal.sky];
  const px = (v: number) => Math.round(v) + 0.5;
  const row = (k: number) => px(7 + k * ((h - 14) / 5));
  const right = w - 8;
  const father = { x: px(10), y: row(0) };
  const self = { x: px(w * 0.18), y: row(1) };
  const kids = [
    { x: px(w * 0.34), y: row(2), b: 0 },
    { x: px(w * 0.46), y: row(3), b: 1 },
    { x: px(w * 0.56), y: row(4), b: 2 },
  ];
  const grand = { x: px(w * 0.62), y: row(5), b: 0 };
  const anc = new GlowBatch(ANCESTOR_GLOW[theme]);
  const glow = new GlowBatch(BRANCH_GLOW[theme]);
  // след жизни (сплошной, как у точной даты) и отвод от следа родителя к ребёнку — те же линии, что рисуют на небе
  // drawLifeTrail и drawBracket (trails.ts); образец не берёт их оттуда, чтобы модуль оставался без данных атласа
  const line = (x0: number, y0: number, x1: number, y1: number, color: string, width: number, dash: readonly number[] = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash as number[]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  // предок: след и связь цветом текста, мягкое свечение
  anc.add(pal.ink, 1, father.x, father.y, right, father.y);
  anc.add(pal.ink, 1, self.x, father.y, self.x, self.y);
  anc.flush(ctx, pal.glow);
  line(father.x, father.y, right, father.y, alpha(pal.ink2, 0.9), 1.2);
  line(self.x, father.y, self.x, self.y, pal.ink2, 1.5);
  line(self.x, self.y, right, self.y, alpha(pal.ink2, 0.9), 1.6);
  // ветви: у каждого ребёнка свой цвет; внук первой ветви — бледнее (второе поколение)
  const paint = (k: { x: number; y: number; b: number }, from: { x: number; y: number }, gen: number) => {
    const c = branchColor(k.b, theme);
    const a = branchFade(gen, branchFloor(c, grounds));
    glow.add(c, a, k.x, from.y, k.x, k.y);
    glow.add(c, a, k.x, k.y, right, k.y);
    return alpha(c, a);
  };
  const colors = kids.map((k) => paint(k, self, 1));
  const gColor = paint(grand, kids[0], 2);
  glow.flush(ctx, pal.glow);
  kids.forEach((k, i) => {
    line(k.x, self.y, k.x, k.y, colors[i], 1.5, DESC_DASH);
    line(k.x, k.y, right, k.y, colors[i], 1.5);
  });
  line(grand.x, kids[0].y, grand.x, grand.y, gColor, 1.5, DESC_DASH);
  line(grand.x, grand.y, right, grand.y, gColor, 1.5);
  ctx.lineWidth = 1;
  const star = (x: number, y: number, magnitude: number) => drawGlyph(ctx, x, y, { sex: 'm', kind: 'person', magnitude, color: pal.ink, halo: pal.sky });
  star(father.x, father.y, 3);
  star(self.x, self.y, 2);
  for (const k of kids) star(k.x, k.y, 3);
  star(grand.x, grand.y, 4);
}
