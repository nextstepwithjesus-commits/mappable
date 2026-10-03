/**
 * Слой света неба (этап 16, решения 182, 183): туманности из неразрешённых следов, устья колен, звёздная пыль, огоньки.
 *
 * Здесь же — цвет ветвей опорного лица (решение 183): общий для неба, врезки семьи (F), колонки рассказа (S),
 * карточки у звезды и легенды.
 *  — tribeHue(id, theme) — оттенок света лица: колено по матери родоначальника; null — нейтральный (народы, серебро);
 *  — branchOrTribeColor(ref, keys, branch, theme) — цвет ветви branch опорного лица ref: у Иакова и четырёх матерей —
 *    оттенок колена этой ветви («без перескока»), у прочих — цвет ветви решения 69 (branchColor);
 *  — branchHue(selectedId, i, theme) — то же по выбранному лицу (без выбора — Иаков): ключи ветвей считаются здесь.
 */
import { byId, graph, groupById } from '../data/atlas.ts';
import { ANCESTRESS, refPerson, tribeKey, tribeRef, type TribeKey } from '../engine/affiliation.ts';
import { laneAt, smooth, starLaneOf } from '../engine/stays.ts';
import { branchesOf } from '../engine/unions.ts';
import { unions } from '../ui/reveal.ts';
import { branchColor, NEBULA_MAX, TRIBE_HUES, type MapTheme, type TribeHueKey } from './branches.ts';

const isHue = (k: TribeKey | null | undefined): k is TribeHueKey => k === 'leah' || k === 'rachel' || k === 'bilhah' || k === 'zilpah';

/** Оттенок света лица id (#rrggbb): колено по матери родоначальника; null — нейтральный свет (народы, серебро). */
export function tribeHue(id: string, theme: MapTheme): string | null {
  const k = tribeKey(id);
  return isHue(k) ? TRIBE_HUES[theme][k] : null;
}

/** Ключ колена ветви key (id союза «u:отец+мать» или id ребёнка) у опорного лица. */
function branchTribe(key: string | undefined): TribeKey | null {
  if (!key) return null;
  const u = unions.byId.get(key);
  if (u) {
    if (u.b && ANCESTRESS[u.b]) return ANCESTRESS[u.b];
    // союз без одной из четырёх матерей — по старшему ребёнку
    return u.kids.length ? tribeKey(u.kids[0]) : null;
  }
  return tribeKey(key);
}

/**
 * Цвет ветви branch опорного лица ref (#rrggbb; решения 69, 183). keys — ключи ветвей ref по порядку (BranchMap.keys,
 * src/render/marks.ts): id союза, если союзов с детьми два и больше, иначе id ребёнка. Опорное лицо — Иаков или одна
 * из четырёх матерей: оттенок колена ветви (сыны Лии, Рахили, Валлы, Зелфы), чтобы цвет не перескакивал между небом
 * без выбора и выбором Иакова. Иначе — цвет ветви по кругу (branchColor).
 */
export function branchOrTribeColor(ref: string | null | undefined, keys: readonly string[], branch: number, theme: MapTheme): string {
  if (ref && tribeRef(ref)) {
    const k = ANCESTRESS[ref] ?? branchTribe(keys[branch]);
    if (isHue(k)) return TRIBE_HUES[theme][k];
  }
  return branchColor(branch, theme);
}

const keyCache = new Map<string, string[]>();
/** Ключи ветвей лица (как BranchMap.keys): союзы с детьми, если их два и больше, иначе дети. */
export function branchKeysOf(id: string): string[] {
  let k = keyCache.get(id);
  if (!k) {
    k = branchesOf(unions, graph, id, 1).keys;
    if (keyCache.size > 64) keyCache.clear();
    keyCache.set(id, k);
  }
  return k;
}

/** Цвет ветви i выбранного лица (без выбора — Иакова), «без перескока» (решение 183): для колонки рассказа и врезки. */
export function branchHue(selectedId: string | null | undefined, i: number, theme: MapTheme): string {
  const ref = refPerson(selectedId);
  return branchOrTribeColor(ref, branchKeysOf(ref), i, theme);
}

// =====================================================================================================================
// Слой света (решение 182): отдельный холст под прозрачным основным холстом неба
// =====================================================================================================================

/** Узел неба для света: поля NodeRow (src/data/atlas.ts), которые нужны слою. */
export interface LightNode {
  person: string;
  ghost: boolean;
  lane: number;
  t0: number;
  t1: number;
  trail: string;
  starLane?: number;
  stays?: readonly { lane: number; t0: number; t1: number }[];
}

/** Вид неба, по которому собран слой: px холста = (x − x0)·kx, (laneTop − полоса)·ky. */
export interface LightView {
  w: number;
  h: number;
  kx: number;
  ky: number;
  x0: number;
  laneTop: number;
  /** ключ строк (сжатие полос, семейная укладка): при другом — слой собирается заново */
  rowsKey: string;
  sx(x: number): number;
  sy(lane: number): number;
}

/** Палитра слоя: цвета неба (#rrggbb). */
export interface LightPalette {
  sky: string;
  band: string;
  ink: string;
  /** ночь — свет сложением ('lighter'), день — отмывка */
  glow: boolean;
}

/** Устье колена (решение 182): от звезды основателя в отчем доме — плавно к медиане полос его рода. */
export interface Mouth {
  group: string;
  founder: string;
  /** точки: год (астр.), полоса, полуширина в полосах, сила 0…1 */
  pts: [number, number, number, number][];
}

/** Что слою нужно от неба на сборку. */
export interface LightInput {
  /** ключ содержимого: тема, модель, масштаб времени, показ, выбор, фокус, режим — без камеры */
  key: string;
  view: LightView;
  pal: LightPalette;
  nodes: readonly LightNode[];
  X0: Float64Array;
  X1: Float64Array;
  xOf(t: number): number;
  /** проявленность звезды узла 0…1 (Sky.starA) */
  starA: ArrayLike<number>;
  /** мировые x каждой второй эпохи (полоса «глубины»); null — эпохи не тонируются */
  bands: readonly { x0: number; x1: number }[] | null;
  /** рисовать туманность, устья, пыль и огоньки (не «только линии», не набор, не ярусы эпох) */
  nebula: boolean;
  /** подробность звёзд кадра 0…1: на обзоре огоньки у величин 0–2, на масштабе семьи — 0–4 */
  detail: number;
  /** раскрытие созвездия 0…1 (решение 185): раскрытое созвездие — следы, его туманность гаснет до смыва */
  reveal(group: string): number;
  /** яркость лица по выделению рода 0…1 */
  emph(id: string): number;
  /** опорное лицо цвета (решение 183): Иаков или мать — оттенки колен; иначе — свет нейтрален */
  ref: string;
  /** лица линий Мессии: их несут ленты, в туманность они не входят */
  spine: ReadonlySet<string>;
  mouths: readonly Mouth[];
  /** зажигание звёзд при загрузке 0…1 */
  intro: number;
}

/** Шаг растра туманности, px. */
const CELL = 6;
/** Плитка рамок вырезов (px устройства): вырезы кадра заполняются светом полосами плиток (LightLayer.paintHoles). */
const HOLE_TILE = 64;
/** Полосы плиток, задетых рамками rects (px устройства), по строкам плиток; в пределах холста W × H. */
export function tileRuns(rects: readonly { x: number; y: number; w: number; h: number }[], W: number, H: number): { x: number; y: number; w: number; h: number }[] {
  const T = HOLE_TILE;
  const cols = Math.ceil(W / T);
  const rows = Math.ceil(H / T);
  const on = new Uint8Array(cols * rows);
  for (const r of rects) {
    const c0 = Math.max(0, Math.floor(r.x / T));
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w - 1e-6) / T));
    const r0 = Math.max(0, Math.floor(r.y / T));
    const r1 = Math.min(rows - 1, Math.floor((r.y + r.h - 1e-6) / T));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) on[y * cols + x] = 1;
  }
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (!on[y * cols + x]) {
        x++;
        continue;
      }
      const a = x;
      while (x < cols && on[y * cols + x]) x++;
      const px = a * T;
      const py = y * T;
      out.push({ x: px, y: py, w: Math.min(W, x * T) - px, h: Math.min(H, py + T) - py });
    }
  }
  return out;
}
/** Наибольшая площадь копии растра под плотность экрана, px устройства (предел Safari — 16 777 216). */
const DEV_MAX_PX = 16_000_000;
/** Разрешение холста света к CSS px: свет мягкий, полоса эпохи и пыль от половинного растра не теряют (О2: сборка ≤ 40 мс). */
const RES = 0.5;
/** Запас слоя за краем неба (доля ширины и высоты): сдвиг неба внутри запаса — перенос без сборки. */
const MARGIN = { x: 0.35, y: 0.3 };
/** Не чаще стольких мс свет собирается посреди движения, если окно неба вышло за край растра. */
const MOVE_BUILD_MS = 250;
/** Смыв: доля туманности раскрытого созвездия (при приближении она распадается на настоящие следы). */
export const LIGHT_WASH = 0.14;
/** Наибольшая непрозрачность туманности — src/render/branches.ts (её читает и npm run -s contrast). */
export { NEBULA_MAX };
/** Доля полосы, занятая следами живущих, при которой туманность светит в полную силу (одна для всех видов неба). */
const NEBULA_REF = 0.42;
/** Сила света по ключу колена: серебро тусклее цвета, народы — чуть тусклее колен. */
const LIGHT_WEIGHT: Readonly<Record<TribeKey, number>> = { leah: 1, rachel: 1, bilhah: 1, zilpah: 1, nations: 0.8, silver: 0.3 };
/** Огонёк звезды величины 0–4: радиус ореола, px, и сила (ночью; днём — слабее). Лучей нет (Откр 22:16 — только Мессия). */
export const HALO_R: readonly number[] = [30, 22, 15, 10, 7];
export const HALO_A: readonly number[] = [1, 0.85, 0.7, 0.55, 0.4];
/** Огоньки на обзоре — у величин 0–2, на масштабе семьи — у 0–4 (решение 182). */
export const haloMaxMag = (detail: number) => (detail < 0.99 ? 2 : 4);
/** Иисус Христос — своя восьмилучевая звезда, без цветного ореола. */
const NO_HALO = 'iisus';

const hexRgb = (h: string): [number, number, number] => {
  const s = h.trim().replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const mixRgb = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Ящичное размытие по строкам или столбцам (радиус r клеток), src → dst. */
function boxPass(src: Float32Array, dst: Float32Array, cols: number, rows: number, r: number, horiz: boolean) {
  if (r < 1) {
    dst.set(src);
    return;
  }
  const w = 2 * r + 1;
  const inv = 1 / w;
  if (horiz) {
    for (let y = 0; y < rows; y++) {
      const o = y * cols;
      let acc = 0;
      for (let x = 0; x <= r && x < cols; x++) acc += src[o + x];
      for (let x = 0; x < cols; x++) {
        dst[o + x] = acc * inv;
        const xa = x + r + 1;
        const xr = x - r;
        if (xa < cols) acc += src[o + xa];
        if (xr >= 0) acc -= src[o + xr];
      }
    }
  } else {
    for (let x = 0; x < cols; x++) {
      let acc = 0;
      for (let y = 0; y <= r && y < rows; y++) acc += src[y * cols + x];
      for (let y = 0; y < rows; y++) {
        dst[y * cols + x] = acc * inv;
        const ya = y + r + 1;
        const yr = y - r;
        if (ya < rows) acc += src[ya * cols + x];
        if (yr >= 0) acc -= src[yr * cols + x];
      }
    }
  }
}
/** Радиус ящика для приближения гаусса σ тремя проходами. */
const boxR = (s: number) => Math.max(0, Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2));
/** Гаусс тремя проходами ящика по осям (σ в клетках), на месте. */
function gauss(a: Float32Array, tmp: Float32Array, cols: number, rows: number, sx: number, sy: number) {
  const rx = boxR(sx);
  const ry = boxR(sy);
  for (let k = 0; k < 3; k++) {
    boxPass(a, tmp, cols, rows, rx, true);
    boxPass(tmp, a, cols, rows, ry, false);
  }
}

const sprites = new Map<string, HTMLCanvasElement>();
/**
 * Спрайт огонька: ядро — светлее (ночью к белому), корона — цвет колена; профиль гаусса с хвостом до края, без лучей.
 * Ночью ложится сложением ('lighter'), днём — тоном поверх неба.
 */
function haloSprite(color: string, night: boolean): HTMLCanvasElement {
  const key = `${color}|${night ? 1 : 0}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexRgb(color);
  const core = night ? mixRgb([r, gg, b], [255, 255, 255], 0.18) : [r, gg, b];
  const rgba = (k: number[], a: number) => `rgba(${Math.round(k[0])},${Math.round(k[1])},${Math.round(k[2])},${a})`;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let k = 0; k <= 10; k++) {
    const d = k / 10;
    gr.addColorStop(d, rgba(d < 0.15 ? core : [r, gg, b], Math.exp(-((d / 0.45) ** 2)) * (1 - d)));
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  if (sprites.size > 64) sprites.clear();
  sprites.set(key, c);
  return c;
}

/**
 * Слой света неба: туманность, устья, пыль и огоньки — растр вне документа, сборка на покое. В кадр он кладётся тем же
 * холстом неба: первым — фоном (paintBase), а в конце кадра — в вырезы подложек и ореолов (paintHoles, destination-over
 * с отсечением по их рамкам). Фон и вырезы заполняет одна и та же копия растра одним и тем же переносом (отсечение не
 * меняет выборку пикселей) — разойтись им нечем. Два прежних устройства — отдельный слой документа под прозрачным холстом
 * и узор того же растра в подложках (CanvasPattern) — зависели от того, как браузер сводит два источника, и у владельца
 * в вырезах виднелся свет другого места: «окна» с обрывками ореолов и линий, ездившие при сдвиге неба.
 */
export class LightLayer {
  private readonly cv: HTMLCanvasElement;
  /** перенос растра в кадр (px холста неба): последний выбранный frame — его и рисует paint */
  private cur: { a: number; d: number; e: number; f: number } | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private built: {
    key: string;
    view: { kx: number; ky: number; x0: number; laneTop: number; rowsKey: string; w: number; h: number };
    mx: number;
    my: number;
    cols: number;
    rows: number;
    /** созвездие клетки растра (индекс в groupIds + 1; 0 — света нет) */
    groupCell: Uint16Array;
    groupIds: string[];
  } | null = null;
  /** буферы растра — общие между сборками (сборка на покое не плодит мусор, О2) */
  private buf: { N: number; f: Float32Array[]; n2: number; h: Float32Array[]; img: ImageData | null; small: HTMLCanvasElement | null } = { N: 0, f: [], n2: 0, h: [], img: null, small: null };
  private floats(N: number, n2: number) {
    const b = this.buf;
    if (b.N !== N) {
      b.N = N;
      b.f = Array.from({ length: 5 }, () => new Float32Array(N));
      b.img = null;
    } else for (const a of b.f) a.fill(0);
    if (b.n2 !== n2) {
      b.n2 = n2;
      b.h = Array.from({ length: 5 }, () => new Float32Array(n2));
    } else for (const a of b.h) a.fill(0);
    return b;
  }
  /** время последней сборки, мс (замер О2), и её части: следы, размытие, огоньки, сведение, пыль */
  lastBuildMs = 0;
  lastBuildSeg = '';
  builds = 0;

  constructor(readonly sky: HTMLCanvasElement) {
    // растр вне документа: в разметке неба слоя нет, наложение листов и окон неба — прежнее (сценарий 157)
    this.cv = document.createElement('canvas');
    this.ctx = this.cv.getContext('2d', { alpha: false })!;
  }

  dispose() {
    this.cur = null;
    this.dev = null;
    if (this.devTimer !== null) clearTimeout(this.devTimer);
    this.devTimer = null;
  }

  /**
   * Растр, растянутый под плотность экрана (одна копия на сборку): кадр его только копирует со сдвигом. Копия стоит
   * десятки мс (растяжение всего растра с запасом) — она делается не в кадре, а в простое после сборки (devSoon); до того
   * кадр берёт исходный растр с растяжением (и фон, и вырезы — одним источником).
   */
  private dev: { cv: HTMLCanvasElement; dpr: number; builds: number } | null = null;
  private devTimer: ReturnType<typeof setTimeout> | null = null;
  /** небо двигалось в последнем кадре (frame): копия под плотность не делается посреди движения */
  private moving = false;
  private device(dpr: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (this.dev && this.dev.dpr === dpr && this.dev.builds === this.builds) return this.dev.cv;
    this.devSoon(dpr);
    return null;
  }
  /**
   * Копия под плотность готова: небо перерисовывается один раз (sky.ts). Иначе покоящийся кадр оставался со светом,
   * положенным растянутым растром, а следующий кадр (наведение) — уже с копией: свет на ±1 уровень другой по всему небу
   */
  onDevice: (() => void) | null = null;
  private devSoon(dpr: number) {
    if (this.devTimer !== null) return;
    this.devTimer = setTimeout(() => {
      this.devTimer = null;
      if (!this.built) return;
      if (this.moving) return this.devSoon(dpr);
      if (this.makeDevice(dpr)) this.onDevice?.();
    }, 120);
  }
  private makeDevice(dpr: number): HTMLCanvasElement | null {
    const w = Math.ceil((this.cv.width / RES) * dpr);
    const h = Math.ceil((this.cv.height / RES) * dpr);
    // Safari не даёт холст больше 16,7 Мпикс (на iPhone и iPad — и меньше общей памяти холстов): такой холст пуст. Большой
    // экран высокой плотности — без копии, перенос из исходного растра с растяжением
    if (w * h > DEV_MAX_PX) return null;
    const cv = this.dev?.cv ?? document.createElement('canvas');
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const g = cv.getContext('2d', { alpha: false });
    if (!g) return null;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.cv, 0, 0, w, h);
    this.dev = { cv, dpr, builds: this.builds };
    return cv;
  }

  /**
   * Свет фоном кадра — первым, непрозрачной копией (source-over: самое дешёвое наложение, О1): небо, эпохи, туманность,
   * огоньки. ctx — холст неба, dpr — его плотность; за краем растра (в движении, до сборки на покое) и до первой сборки —
   * заливка неба.
   */
  paintBase(ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number, sky: string, view?: LightView) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    this.blit(ctx, dpr, w, h, sky, this.at(view));
    ctx.restore();
  }

  /** Перенос растра под вид view (небо в кэше сдвига, sky.ts): без сборки и без смены переноса кадра; без view — кадра. */
  private at(view?: LightView): { a: number; d: number; e: number; f: number } | null {
    return view && this.built ? this.transform(view) : this.cur;
  }

  /**
   * Покрывает ли собранный растр вид view с запасом ex, ey px по краям, без растяжения (кэш сдвига неба, sky.ts,
   * renderPan). Нет — свет собирается заново вокруг нынешнего окна: иначе у дальнего края кэша осталась бы полоса без
   * туманности, эпох и огоньков, вспыхивающая при отпускании (растр собирается в покое, только когда окно ушло дальше
   * 0,85 запаса, а кэш строится вокруг окна).
   */
  covers(view: LightView, key: string, ex: number, ey: number): boolean {
    const b = this.built;
    if (!b || b.key !== key || b.view.rowsKey !== view.rowsKey || b.view.w !== view.w || b.view.h !== view.h) return false;
    const t = this.transform(view);
    if (Math.abs(t.a - 1) > 1e-9 || Math.abs(t.d - 1) > 1e-9) return false;
    const iw = this.cv.width / RES;
    const ih = this.cv.height / RES;
    return t.e <= -ex + 0.5 && t.f <= -ey + 0.5 && t.e + iw >= view.w + ex - 0.5 && t.f + ih >= view.h + ey - 0.5;
  }

  /** Кадр сдвига из кэша (sky.ts, panFrame): содержимое то же — растр только переносится под нынешний вид. */
  follow(view: LightView) {
    if (this.built) this.cur = this.transform(view);
  }

  /**
   * Свет в вырезы кадра — последним, под нарисованное (destination-over), только там, где кадр вырезал подложки и ореолы
   * (sky.ts, groundify, fillGround; holes — их рамки в px устройства). Рамки собираются в плитки HOLE_TILE px и полосы
   * плиток по строкам. Копия растра под плотность экрана (перенос без растяжения) — участок за участком прямым
   * копированием 1:1, те же пиксели, что у фона; растяжение (колесо, перелёт) — весь растр с отсечением по полосам.
   * holes = null — рамки неизвестны: под весь кадр (дороже, но верно). Сотни рамок отсечением стоили ~10 мс кадра.
   */
  paintHoles(ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number, sky: string, holes: readonly { x: number; y: number; w: number; h: number }[] | null, view?: LightView) {
    if (holes && !holes.length) return;
    const runs = holes ? tileRuns(holes, ctx.canvas.width, ctx.canvas.height) : null;
    if (runs && !runs.length) return;
    const t = this.at(view);
    // та же копия, что взял фон этого кадра (blit → device): готова — да, нет — исходный растр
    const d = this.dev;
    const dev = t && this.built && t.a === 1 && t.d === 1 && d && d.dpr === dpr && d.builds === this.builds ? d.cv : null;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = 1;
    if (runs && dev && t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = sky;
      const ox = Math.round(t.e * dpr);
      const oy = Math.round(t.f * dpr);
      for (const r of runs) {
        const x0 = Math.max(r.x, ox);
        const y0 = Math.max(r.y, oy);
        const x1 = Math.min(r.x + r.w, ox + dev.width);
        const y1 = Math.min(r.y + r.h, oy + dev.height);
        if (x1 > x0 && y1 > y0) ctx.drawImage(dev, x0 - ox, y0 - oy, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
        // за краем растра — небо (под растром уже непрозрачно: destination-over его не трогает); мимо обёртки подложек
        CanvasRenderingContext2D.prototype.fillRect.call(ctx, r.x, r.y, r.w, r.h);
      }
    } else {
      if (runs) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        for (const r of runs) ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
      }
      this.blit(ctx, dpr, w, h, sky, t);
    }
    ctx.restore();
  }

  /**
   * Копия света в кадр текущим наложением: растр переносом кадра, небо — за его краем (или всё небо до сборки). Полосы
   * неба заходят на край растра на 1 px (без щели при округлении переноса), растр на стыке главнее: фоном (source-over)
   * полосы кладутся до растра, в вырезы (destination-over, ниже нарисованного) — после.
   */
  private blit(ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number, sky: string, t: { a: number; d: number; e: number; f: number } | null) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = sky;
    const fill = (x: number, y: number, ww: number, hh: number) => ww > 0 && hh > 0 && CanvasRenderingContext2D.prototype.fillRect.call(ctx, x, y, ww, hh);
    if (!t || !this.built) {
      fill(0, 0, w, h);
      return;
    }
    // небо — полосами за краем растра (в движении, до сборки на покое)
    const iw = (this.cv.width / RES) * t.a;
    const ih = (this.cv.height / RES) * t.d;
    const x0 = Math.max(0, t.e + 1);
    const y0 = Math.max(0, t.f + 1);
    const x1 = Math.min(w, t.e + iw - 1);
    const y1 = Math.min(h, t.f + ih - 1);
    const strips = () => {
      fill(0, 0, w, y0);
      fill(0, y1, w, h - y1);
      fill(0, y0, x0, y1 - y0);
      fill(x1, y0, w - x1, y1 - y0);
    };
    const under = ctx.globalCompositeOperation === 'destination-over';
    if (!under) strips();
    // перенос без растяжения (сдвиг неба) — копией растра, заранее растянутой под плотность экрана: без сглаживания в
    // каждом кадре (телефон, О1); растяжение (колесо, перелёт) — из исходного растра
    const dev = t.a === 1 && t.d === 1 ? this.device(dpr) : null;
    if (dev) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(dev, Math.round(t.e * dpr), Math.round(t.f * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else ctx.drawImage(this.cv, t.e, t.f, (this.cv.width / RES) * t.a, (this.cv.height / RES) * t.d);
    if (under) strips();
  }

  /**
   * Кадр неба: слой собирается, если изменилось содержимое (тема, показ, выбор…) или — в покое — масштаб, строки,
   * выход за запас; иначе только переносится и растягивается (перенос растра в paintBase), без сборки. moving — небо движется.
   */
  frame(inp: LightInput, moving: boolean) {
    this.moving = moving;
    const v = inp.view;
    const b = this.built;
    const sameGeom = !!b && b.view.rowsKey === v.rowsKey && b.view.w === v.w && b.view.h === v.h;
    const sameContent = sameGeom && b!.key === inp.key;
    const sameScale = !!b && Math.abs(b.view.kx - v.kx) < 1e-9 * v.kx && Math.abs(b.view.ky - v.ky) < 1e-9 * v.ky;
    // содержимое сменилось посреди движения (выбор лица запускает перелёт): прежний свет переносится до покоя, сборка
    // (60–180 мс) — в кадре покоя, а не посреди анимации; строки неба те же — перенос верен
    if (b && moving && sameGeom && !sameContent) {
      const t = this.transform(v);
      if (t.a > 0.25 && t.a < 4 && t.d > 0.25 && t.d < 4) {
        this.apply(t);
        return;
      }
    }
    if (b && sameContent) {
      const t = this.transform(v);
      const shift = Math.abs(t.e + b.mx) < b.mx * 0.85 && Math.abs(t.f + b.my) < b.my * 0.85;
      // в движении слой терпит растяжение до 4 раз (перелёт, колесо): сборка — в покое
      const inside = shift && (moving ? t.a > 0.25 && t.a < 4 && t.d > 0.25 && t.d < 4 : t.a > 0.5 && t.a < 2 && t.d > 0.5 && t.d < 2);
      // в движении — перенос и растяжение собранного (сборка в каждом кадре протяжки стоила 10–60 мс, О1); но окно неба
      // вышло за край растра — свет собирается заново и в движении, не чаще раза в MOVE_BUILD_MS: иначе за краем полоса
      // без туманности, эпох и огоньков, вспыхивающая при отпускании (рецензия 3 октября). В покое — сборка, если масштаб
      // другой или окно вышло за запас
      const stretch = t.a > 0.25 && t.a < 4 && t.d > 0.25 && t.d < 4;
      const iw = (this.cv.width / RES) * t.a;
      const ih = (this.cv.height / RES) * t.d;
      const covers = t.e <= 0.5 && t.f <= 0.5 && t.e + iw >= v.w - 0.5 && t.f + ih >= v.h - 0.5;
      const late = typeof performance === 'undefined' || performance.now() - this.moveBuildAt >= MOVE_BUILD_MS;
      if ((moving && stretch && (covers || !late)) || (sameScale && inside)) {
        this.apply(t);
        return;
      }
    }
    if (moving && typeof performance !== 'undefined') this.moveBuildAt = performance.now();
    this.build(inp);
  }
  /** когда свет последний раз собирался посреди движения (performance.now) */
  private moveBuildAt = -Infinity;

  /** Перенос и растяжение собранного слоя под нынешний вид (px холста неба). */
  private transform(v: LightView) {
    const b = this.built!;
    const a = v.kx / b.view.kx;
    const d = v.ky / b.view.ky;
    // точка слоя px ↔ px неба при сборке px − mx; теперь: (px − mx)·a + (x0сб − x0)·kx
    const e = -b.mx * a + (b.view.x0 - v.x0) * v.kx;
    const f = -b.my * d + (v.laneTop - b.view.laneTop) * v.ky;
    return { a, d, e, f };
  }
  private apply(t: { a: number; d: number; e: number; f: number }) {
    this.cur = t;
  }

  /** Созвездие, чей свет (туманность или устье) под точкой (x, y) px холста неба; null — света нет. */
  groupAt(x: number, y: number, v: LightView): string | null {
    const b = this.built;
    if (!b) return null;
    const t = this.transform(v);
    // точка неба → px слоя
    const px = (x - t.e) / t.a;
    const py = (y - t.f) / t.d;
    const c0 = Math.floor(px / CELL);
    const r0 = Math.floor(py / CELL);
    // ближайшая клетка со светом в окрестности 3 клеток (туманность шире своих следов)
    let best = -1;
    let bd = Infinity;
    for (let dr = -3; dr <= 3; dr++)
      for (let dc = -3; dc <= 3; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= b.rows || c >= b.cols) continue;
        const g = b.groupCell[r * b.cols + c];
        if (!g) continue;
        const d = dr * dr + dc * dc;
        if (d < bd) {
          bd = d;
          best = g - 1;
        }
      }
    return best >= 0 ? b.groupIds[best] : null;
  }

  /** Сборка слоя (решение 182): фон и эпохи, туманность из следов, устья, огоньки (в растре), пыль. */
  build(inp: LightInput) {
    const t0 = performance.now();
    const v = inp.view;
    const W = Math.max(1, Math.round(v.w));
    const H = Math.max(1, Math.round(v.h));
    const mx = Math.round(W * MARGIN.x);
    const my = Math.round(H * MARGIN.y);
    const cols = Math.ceil((W + 2 * mx) / CELL);
    const rows = Math.ceil((H + 2 * my) / CELL);
    const CW = cols * CELL;
    const CH = rows * CELL;
    const BW = Math.ceil(CW * RES);
    const BH = Math.ceil(CH * RES);
    if (this.cv.width !== BW || this.cv.height !== BH) {
      this.cv.width = BW;
      this.cv.height = BH;
      this.cv.style.width = `${CW}px`;
      this.cv.style.height = `${CH}px`;
    }
    const ctx = this.ctx;
    const pal = inp.pal;
    const theme: MapTheme = pal.glow ? 'night' : 'day';
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, CW, CH);
    // эпохи чередуются светлотой фона (ТЗ § 5.2): полосы — тоже в слое, под туманностью
    if (inp.bands) {
      ctx.fillStyle = pal.band;
      for (const e of inp.bands) {
        const a = v.sx(e.x0) + mx;
        const b = v.sx(e.x1) + mx;
        if (b < 0 || a > CW) continue;
        ctx.fillRect(a, 0, b - a, CH);
      }
    }
    const N = cols * rows;
    const groupIds: string[] = [];
    const groupIx = new Map<string, number>();
    const groupCell = new Uint16Array(N);
    const groupW = new Float32Array(N);
    if (inp.nebula) this.paint(inp, { mx, my, cols, rows, N, theme, groupIds, groupIx, groupCell, groupW });
    this.built = { key: inp.key, view: { kx: v.kx, ky: v.ky, x0: v.x0, laneTop: v.laneTop, rowsKey: v.rowsKey, w: v.w, h: v.h }, mx, my, cols, rows, groupCell, groupIds };
    this.apply({ a: 1, d: 1, e: -mx, f: -my });
    this.lastBuildMs = performance.now() - t0;
    this.builds++;
    // узор из прежнего растра — снимок: после сборки он другой
  }

  private paint(
    inp: LightInput,
    g: { mx: number; my: number; cols: number; rows: number; N: number; theme: MapTheme; groupIds: string[]; groupIx: Map<string, number>; groupCell: Uint16Array; groupW: Float32Array },
  ) {
    const { mx, my, cols, rows, N, theme } = g;
    const v = inp.view;
    const tm = [performance.now()];
    const pal = inp.pal;
    const ctx = this.ctx;
    const hues = tribeRef(inp.ref);
    const ink = hexRgb(pal.ink);
    // цвет света по ключу колена: оттенок (без выбора и у Иакова с матерями), иначе — тон текста (серебро)
    const lightRgb = new Map<TribeKey, [number, number, number]>();
    const keyRgb = (k: TribeKey): [number, number, number] => {
      let c = lightRgb.get(k);
      if (!c) {
        const hue = hues && isHue(k) ? hexRgb(TRIBE_HUES[theme][k]) : ink;
        // туманность ночью — оттенок, смягчённый тоном текста (не кислотная заливка); днём — сам оттенок
        c = (pal.glow ? mixRgb(hue, ink, hues && isHue(k) ? 0.35 : 0) : hue).map((x) => x / 255) as [number, number, number];
        lightRgb.set(k, c);
      }
      return c;
    };
    const c2 = Math.ceil(cols / 2);
    const r2 = Math.ceil(rows / 2);
    const bufs = this.floats(N, c2 * r2);
    const [T, R, G, B, tmp] = bufs.f;
    const ky = v.ky;
    const sigY = Math.max(2, Math.min(10, 0.6 * ky));
    const sigX = Math.max(4, Math.min(26, 2.5 * sigY));
    // узелок рождения: пик после размытия — около половины насыщения
    const knot = 0.55 * 0.5 * 2 * Math.PI * (sigX / CELL) * (sigY / CELL);
    const reveal = new Map<string, number>();
    const fadeOf = (gid: string) => {
      let r = reveal.get(gid);
      if (r === undefined) reveal.set(gid, (r = inp.reveal(gid)));
      return LIGHT_WASH + (1 - LIGHT_WASH) * (1 - r);
    };
    const groupOf = (gid: string) => {
      let k = g.groupIx.get(gid);
      if (k === undefined) {
        k = g.groupIds.length;
        g.groupIds.push(gid);
        g.groupIx.set(gid, k);
      }
      return k + 1;
    };
    const add = (c: number, w: number, rgb: [number, number, number], gi: number) => {
      T[c] += w;
      R[c] += w * rgb[0];
      G[c] += w * rgb[1];
      B[c] += w * rgb[2];
      if (w > g.groupW[c]) {
        g.groupW[c] = w;
        g.groupCell[c] = gi;
      }
    };
    /** полоса следа в полосе lane от x0 до x1 (px слоя), вес w на долю площади клетки */
    const band = (x0: number, x1: number, y: number, w: number, rgb: [number, number, number], gi: number, hw = ky / 2) => {
      const ya = Math.max(0, y - hw);
      const yb = Math.min(rows * CELL, y + hw);
      const xa = Math.max(0, x0);
      const xb = Math.min(cols * CELL, x1);
      if (yb <= ya || xb <= xa) return;
      const r0 = Math.floor(ya / CELL);
      const r1 = Math.floor((yb - 1e-6) / CELL);
      const c0 = Math.floor(xa / CELL);
      const c1 = Math.floor((xb - 1e-6) / CELL);
      for (let r = r0; r <= r1; r++) {
        const fy = (Math.min(yb, (r + 1) * CELL) - Math.max(ya, r * CELL)) / CELL;
        const o = r * cols;
        for (let c = c0; c <= c1; c++) {
          const fx = (Math.min(xb, (c + 1) * CELL) - Math.max(xa, c * CELL)) / CELL;
          add(o + c, fx * fy * w, rgb, gi);
        }
      }
    };
    const W = cols * CELL;
    const H = rows * CELL;
    for (let i = 0; i < inp.nodes.length; i++) {
      const n = inp.nodes[i];
      if (n.ghost || n.trail === 'ghost' || n.trail === 'epochal' || inp.spine.has(n.person)) continue;
      const q = byId.get(n.person);
      if (!q) continue;
      const xb = v.sx(inp.X0[i]) + mx;
      if (xb > W) continue;
      const k = tribeKey(n.person);
      const rgb = keyRgb(k);
      const w = LIGHT_WEIGHT[k] * fadeOf(q.group) * inp.emph(n.person);
      if (w <= 0.01) continue;
      const gi = groupOf(q.group);
      const yb = v.sy(starLaneOf(n)) + my;
      if (xb >= 0 && yb >= 0 && yb < H) add(Math.floor(yb / CELL) * cols + Math.floor(xb / CELL), knot * w, rgb, gi);
      if (n.trail !== 'life' && n.trail !== 'infant') continue;
      const xe = v.sx(inp.X1[i]) + mx;
      if (xe <= xb + 1 || xe < 0) continue;
      if (n.stays && n.stays.length) {
        // пребывания (решение 173): след в полосе каждого пребывания; переходы — тонкие, в туманность не входят
        for (const st of n.stays) {
          const a = Math.max(n.t0, st.t0);
          const b = Math.min(n.t1, st.t1);
          if (b <= a) continue;
          band(v.sx(inp.xOf(a)) + mx, v.sx(inp.xOf(b)) + mx, v.sy(st.lane) + my, w, rgb, gi);
        }
      } else band(xb, xe, v.sy(n.lane) + my, w, rgb, gi);
    }
    // устья колен (решение 182, V3): мазок от звезды основателя к медиане полос рода — тем же тоном и силой
    for (const m of inp.mouths) {
      const fq = byId.get(m.founder);
      if (!fq) continue;
      const k = tribeKey(m.founder);
      const rgb = keyRgb(k);
      const w0 = LIGHT_WEIGHT[k] * fadeOf(m.group) * inp.emph(m.founder);
      if (w0 <= 0.01) continue;
      const gi = groupOf(m.group);
      for (let j = 1; j < m.pts.length; j++) {
        const [ta, la, ha, sa] = m.pts[j - 1];
        const [tb, lb] = m.pts[j];
        const x0 = v.sx(inp.xOf(ta)) + mx;
        const x1 = v.sx(inp.xOf(tb)) + mx;
        if (x1 < 0 || x0 > W) continue;
        const ym = (v.sy(la) + v.sy(lb)) / 2 + my;
        band(x0, x1, ym, w0 * sa, rgb, gi, Math.max(ky / 2, ha * ky));
      }
    }
    tm.push(performance.now());
    // размытие в два масштаба: волокна (следы) и облако (род) — облако на половинном растре
    const sx = sigX / CELL;
    const sy = sigY / CELL;
    const half = (a: Float32Array, o: Float32Array) => {
      for (let r = 0; r < rows; r++) {
        const oo = (r >> 1) * c2;
        const ia = r * cols;
        for (let c = 0; c < cols; c++) o[oo + (c >> 1)] += a[ia + c] * 0.25;
      }
      return o;
    };
    const big = [T, R, G, B].map((a, k) => half(a, bufs.h[k]));
    const tmp2 = bufs.h[4];
    const bx = (sx * 3.2) / 2;
    const by = (sy * 3.2) / 2;
    for (const a of big) gauss(a, tmp2, c2, r2, bx, by);
    for (const a of [T, R, G, B]) gauss(a, tmp, cols, rows, sx, sy);
    tm.push(performance.now());
    tm.push(performance.now());
    // сведение: туманность (корень из доли живущих) + огоньки сложением; RGBA без премультипликации
    if (!bufs.img || bufs.img.width !== cols || bufs.img.height !== rows) bufs.img = new ImageData(cols, rows);
    const img = bufs.img;
    const px = img.data;
    px.fill(0);
    const Amax = NEBULA_MAX[theme];
    for (let r = 0; r < rows; r++) {
      const rr = Math.min(r2 - 1, r >> 1);
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        const kb = rr * c2 + Math.min(c2 - 1, c >> 1);
        const t = 0.55 * T[k] + 0.45 * big[0][kb];
        let rC = 0;
        let gC = 0;
        let bC = 0;
        let a = 0;
        if (t > 1e-4) {
          a = Amax * Math.min(1, Math.sqrt(t / NEBULA_REF));
          rC = ((0.55 * R[k] + 0.45 * big[1][kb]) / t) * a;
          gC = ((0.55 * G[k] + 0.45 * big[2][kb]) / t) * a;
          bC = ((0.55 * B[k] + 0.45 * big[3][kb]) / t) * a;
        }
        if (a <= 1e-4) continue;
        const o = k * 4;
        px[o] = Math.min(255, (rC / a) * 255);
        px[o + 1] = Math.min(255, (gC / a) * 255);
        px[o + 2] = Math.min(255, (bC / a) * 255);
        px[o + 3] = 255 * a;
      }
    }
    const small = (bufs.small ??= document.createElement('canvas'));
    if (small.width !== cols || small.height !== rows) {
      small.width = cols;
      small.height = rows;
    }
    small.getContext('2d')!.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    // ночью — свет сложением, днём — отмывка поверх неба
    ctx.globalCompositeOperation = pal.glow ? 'lighter' : 'source-over';
    ctx.drawImage(small, 0, 0, cols * CELL, rows * CELL);
    // огоньки (решение 182): ореол по величине звезды, цвет колена — спрайтами при сборке (в кадре — ни одного). Ночью —
    // наибольшим из ореолов ('lighten'), а не сложением: тесная семья (сыны Иакова) не сливается в белое пятно
    if (pal.glow) ctx.globalCompositeOperation = 'lighten';
    const mm = haloMaxMag(inp.detail);
    const zs = Math.sqrt(Math.max(1, Math.min(1.6, ky / 20)));
    for (let i = 0; i < inp.nodes.length; i++) {
      const n = inp.nodes[i];
      if (n.ghost || (inp.starA[i] ?? 0) < 0.5) continue;
      const q = byId.get(n.person);
      if (!q || q.magnitude > mm || q.id === NO_HALO) continue;
      const x = v.sx(inp.X0[i]) + mx;
      const y = v.sy(starLaneOf(n)) + my;
      if (x < -40 || y < -40 || x >= W + 40 || y >= H + 40) continue;
      const lit = Math.max(0, Math.min(1, inp.intro * 7 - q.magnitude));
      const e = inp.emph(q.id) * lit;
      if (e <= 0.02) continue;
      const k = tribeKey(q.id);
      const hued = hues && isHue(k);
      // днём огонёк — только цветной (тон колена на бумаге); серый ореол читался бы грязью
      if (!pal.glow && !hued) continue;
      const color = hued ? TRIBE_HUES[theme][k] : pal.ink;
      const Rr = HALO_R[q.magnitude] * zs * (inp.detail < 0.99 ? 1 : 1.45);
      ctx.globalAlpha = Math.min(1, HALO_A[q.magnitude] * e * (pal.glow ? 1 : 0.45));
      ctx.drawImage(haloSprite(color, pal.glow), x - Rr, y - Rr, 2 * Rr, 2 * Rr);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    tm.push(performance.now());
    // звёздная пыль (решение 182): лица, ещё не ставшие звёздами, — точки 1–1,6 px; фактура неба — только из лиц
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < inp.nodes.length; i++) {
      const n = inp.nodes[i];
      if (n.ghost || n.trail === 'epochal') continue;
      const sa = inp.starA[i] ?? 0;
      if (sa >= 0.97) continue;
      const x = v.sx(inp.X0[i]) + mx;
      if (x < 0 || x > W) continue;
      const y = v.sy(starLaneOf(n)) + my;
      if (y < 0 || y > H) continue;
      const q = byId.get(n.person);
      if (!q) continue;
      const m = q.magnitude;
      const a = (1 - sa) * (m <= 3 ? 0.85 : m <= 4 ? 0.7 : m <= 5 ? 0.55 : 0.42) * inp.emph(n.person) * Math.min(1, inp.intro * 2);
      if (a <= 0.03) continue;
      const k = tribeKey(n.person);
      const key = `${hues && isHue(k) ? k : 'n'}|${Math.round(a * 10)}|${m <= 4 ? 1 : 0}`;
      let bkt = buckets.get(key);
      if (!bkt) buckets.set(key, (bkt = []));
      bkt.push(x, y);
    }
    ctx.save();
    for (const [key, xy] of buckets) {
      const [k, a10, big4] = key.split('|');
      const hue = k === 'n' ? ink : hexRgb(TRIBE_HUES[theme][k as TribeHueKey]);
      const c = mixRgb(hue, ink, k === 'n' ? 0 : 0.45);
      ctx.fillStyle = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${((+a10 / 10) * (pal.glow ? 1 : 0.8)).toFixed(2)})`;
      const s = big4 === '1' ? 1.6 : 1.1;
      ctx.beginPath();
      for (let j = 0; j < xy.length; j += 2) ctx.rect(xy[j] - s / 2, xy[j + 1] - s / 2, s, s);
      ctx.fill();
    }
    ctx.restore();
    tm.push(performance.now());
    this.lastBuildSeg = tm
      .slice(1)
      .map((t, k) => (t - tm[k]).toFixed(1))
      .join('/');
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Устья колен (решение 182; алгоритм V3, tools/_v3-scene.ts): по модели, при первой надобности
// ---------------------------------------------------------------------------------------------------------------------

/** Годы мазка устья: от рождения основателя до середины рода. */
const MOUTH_EASE = 70;
/** Окно медианы полос рода вокруг конца устья, лет. */
const MOUTH_WIN = 60;
const mouthMemo = new WeakMap<object, Mouth[]>();

/**
 * Устья созвездий модели: у каждого созвездия с основателем в данных (groups.founder) — мазок от звезды основателя (год
 * рождения, полоса рождения — отчий дом) за MOUTH_EASE лет к медиане полос живых лиц рода. Если основатель уже стоит в
 * середине рода (меньше 2 полос), устья нет: туманность рода начинается у его звезды.
 */
export function mouthsOf(model: { nodes: readonly LightNode[]; nodeByPerson: ReadonlyMap<string, LightNode> }): Mouth[] {
  const hit = mouthMemo.get(model);
  if (hit) return hit;
  const out: Mouth[] = [];
  const byGroup = new Map<string, LightNode[]>();
  for (const n of model.nodes) {
    if (n.ghost || (n.trail !== 'life' && n.trail !== 'infant')) continue;
    const g = byId.get(n.person)?.group;
    if (!g) continue;
    const a = byGroup.get(g);
    if (a) a.push(n);
    else byGroup.set(g, [n]);
  }
  for (const [gid, mem] of byGroup) {
    const grp = groupById.get(gid);
    const fid = grp?.founder;
    if (!fid || mem.length < 3) continue;
    const f = model.nodeByPerson.get(fid);
    if (!f) continue;
    const tf = f.t0;
    const lf = starLaneOf(f);
    const tEnd = tf + MOUTH_EASE;
    const lanes: number[] = [];
    for (const n of mem) {
      if (n.person === fid) continue;
      const a = Math.max(n.t0, tEnd - MOUTH_WIN);
      const b = Math.min(n.t1, tEnd + MOUTH_WIN);
      if (b < a) continue;
      lanes.push(laneAt(n, (a + b) / 2));
    }
    // никого из рода в окне — по первым рождённым после основателя
    if (!lanes.length) for (const n of [...mem].filter((n) => n.t0 > tf).sort((p, q) => p.t0 - q.t0).slice(0, 8)) lanes.push(laneAt(n, n.t0));
    if (!lanes.length) continue;
    lanes.sort((p, q) => p - q);
    const med = lanes[Math.floor(lanes.length / 2)];
    if (Math.abs(med - lf) < 2) continue;
    const c = lanes.length;
    const hw = 0.6 + 0.5 * Math.sqrt(c);
    const str = 0.35 + 0.65 * Math.min(1, Math.sqrt(c) / 4);
    const pts: Mouth['pts'] = [];
    for (let t = tf; t <= tEnd + 0.01; t += 5) {
      const u = smooth((t - tf) / MOUTH_EASE);
      pts.push([t, lf + (med - lf) * u, Math.max(0.5, hw * u), str]);
    }
    out.push({ group: gid, founder: fid, pts });
  }
  mouthMemo.set(model, out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Образцы «Условных знаков» (решения 182–184, 186, 187): рисуют те же функции, что слой света
// ---------------------------------------------------------------------------------------------------------------------

/** Палитра образца: небо, текст, тема (glow — ночь). */
export interface LightSamplePalette {
  sky: string;
  band: string;
  ink: string;
  ink2: string;
  ink3: string;
  glow: boolean;
}
export type LightSign = 'nebula' | 'mouth' | 'dust' | 'halo' | 'leah' | 'rachel' | 'bilhah' | 'zilpah' | 'silver' | 'inset';

/** Туманность образца: те же размытие и цвет, что у слоя (следы трёх строк двух колен). */
function sampleNebula(ctx: CanvasRenderingContext2D, pal: LightSamplePalette, w: number, h: number, keys: TribeHueKey[], ky = 8) {
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const N = cols * rows;
  const T = new Float32Array(N);
  const Rc = new Float32Array(N);
  const Gc = new Float32Array(N);
  const Bc = new Float32Array(N);
  const ink = hexRgb(pal.ink);
  // следы: по строкам — жизни разной длины (число живущих растёт к середине)
  const lanes = Math.max(3, Math.floor(h / ky) - 1);
  for (let l = 0; l < lanes; l++)
    for (let k = 0; k < 4; k++) {
      const key = keys[(l + k) % keys.length];
      const hue = hexRgb(TRIBE_HUES[theme][key]);
      const c = (pal.glow ? mixRgb(hue, ink, 0.35) : hue).map((x) => x / 255);
      const x0 = w * (0.08 + 0.18 * k + 0.05 * (l % 3));
      const x1 = Math.min(w - 4, x0 + w * (0.22 + 0.06 * ((l * 7 + k) % 4)));
      const y = (l + 1) * ky;
      const r = Math.floor(y / CELL);
      for (let cc = Math.floor(x0 / CELL); cc <= Math.floor(x1 / CELL) && cc < cols; cc++) {
        if (r < 0 || r >= rows) continue;
        const j = r * cols + cc;
        T[j] += 1;
        Rc[j] += c[0];
        Gc[j] += c[1];
        Bc[j] += c[2];
      }
    }
  const tmp = new Float32Array(N);
  for (const a of [T, Rc, Gc, Bc]) gauss(a, tmp, cols, rows, 10 / CELL, 4 / CELL);
  const Amax = NEBULA_MAX[theme];
  ctx.save();
  ctx.globalCompositeOperation = pal.glow ? 'lighter' : 'source-over';
  // образец мал: клетки растра — прямоугольниками (без ImageData: «Условные знаки» рисуются и в тестах без холста)
  for (let k = 0; k < N; k++) {
    const t = T[k];
    if (t <= 1e-4) continue;
    const a = Amax * Math.min(1, Math.sqrt(t / NEBULA_REF));
    ctx.fillStyle = `rgba(${Math.round((Rc[k] / t) * 255)},${Math.round((Gc[k] / t) * 255)},${Math.round((Bc[k] / t) * 255)},${a.toFixed(3)})`;
    ctx.fillRect((k % cols) * CELL, Math.floor(k / cols) * CELL, CELL, CELL);
  }
  ctx.restore();
}

/** Звезда образца с огоньком величины m цвета color (null — нейтральный). */
function sampleStar(ctx: CanvasRenderingContext2D, pal: LightSamplePalette, x: number, y: number, m: number, color: string | null) {
  const c = color ?? pal.ink;
  if ((pal.glow || color) && typeof document !== 'undefined') {
    ctx.save();
    ctx.globalCompositeOperation = pal.glow ? 'lighter' : 'source-over';
    ctx.globalAlpha = HALO_A[m] * (pal.glow ? 1 : 0.45);
    const R = HALO_R[m];
    ctx.drawImage(haloSprite(c, pal.glow), x - R, y - R, 2 * R, 2 * R);
    ctx.restore();
  }
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.arc(x, y, [5.6, 4.6, 3.8, 3.1, 2.5][m] ?? 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Образец знака света (решения 182–184) и врезки семьи (решение 186) для «Условных знаков» и образца #/specimen: те же
 * размытие, цвета колен, спрайт огонька, пыль и рамки, что на небе. Фон — небо; без выбора опорное лицо — Иаков.
 */
export function drawLightSample(ctx: CanvasRenderingContext2D, pal: LightSamplePalette, w: number, h: number, sign: LightSign) {
  const theme: MapTheme = pal.glow ? 'night' : 'day';
  ctx.save();
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, 0, w, h);
  const y = Math.round(h / 2) + 0.5;
  if (sign === 'nebula') sampleNebula(ctx, pal, w, h, ['leah', 'rachel']);
  else if (sign === 'mouth') {
    // звезда родоначальника в отчем доме (вверху) и мазок за 70 лет к середине его рода (внизу)
    const hue = TRIBE_HUES[theme].leah;
    const [r, g, b] = hexRgb(hue);
    const x0 = 14;
    const x1 = w - 10;
    const ya = 9;
    const yb = h - 9;
    ctx.globalCompositeOperation = pal.glow ? 'lighter' : 'source-over';
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      const s = u * u * (3 - 2 * u);
      const x = x0 + (x1 - x0) * u;
      const yy = ya + (yb - ya) * s;
      const rad = 2 + 7 * s;
      const gr = ctx.createRadialGradient(x, yy, 0, x, yy, rad);
      gr.addColorStop(0, `rgba(${r},${g},${b},${(pal.glow ? 0.16 : 0.08) * (0.4 + 0.6 * s)})`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, yy - rad, 2 * rad, 2 * rad);
    }
    ctx.globalCompositeOperation = 'source-over';
    sampleStar(ctx, pal, x0, ya, 2, hue);
  } else if (sign === 'dust') {
    // пыль — лица величины 3–6, ещё не ставшие звёздами: точки 1–1,6 px
    const hue = hexRgb(TRIBE_HUES[theme].leah);
    const c = mixRgb(hue, hexRgb(pal.ink), 0.45);
    ctx.fillStyle = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},0.8)`;
    for (let k = 0; k < 26; k++) {
      const x = 6 + ((k * 37) % (w - 12));
      const yy = 4 + ((k * 23) % (h - 8));
      const s = k % 3 ? 1.1 : 1.6;
      ctx.fillRect(x - s / 2, yy - s / 2, s, s);
    }
  } else if (sign === 'halo') {
    // величины 0, 1, 2: ореол ступенчат по величине, как диск
    sampleStar(ctx, pal, w * 0.2, y, 0, null);
    sampleStar(ctx, pal, w * 0.55, y, 1, null);
    sampleStar(ctx, pal, w * 0.83, y, 2, null);
  } else if (sign === 'silver') sampleStar(ctx, pal, w / 2, y, 2, null);
  else if (sign === 'inset') drawInsetSign(ctx, pal, w, h);
  else sampleStar(ctx, pal, w / 2, y, 2, TRIBE_HUES[theme][sign]);
  ctx.restore();
}

/**
 * Знак врезки семьи (решение 186, от исполнителя F): пунктирная рамка области на небе (1 px, штрих 3/3, звёздный свет
 * α 0,9); две выноски от правых углов рамки к левым углам врезки (0,8 px, штрих 3/3, туманность α 0,7); двойная рамка
 * врезки (внешняя 1 px туманность α 0,75, внутренняя 0,6 px α 0,35, отступ 3,5 px) на фоне неба α 0,96.
 */
function drawInsetSign(ctx: CanvasRenderingContext2D, pal: LightSamplePalette, w: number, h: number) {
  const ink2 = hexRgb(pal.ink2);
  const neb = (a: number) => `rgba(${ink2[0]},${ink2[1]},${ink2[2]},${a})`;
  const ink = hexRgb(pal.ink);
  const area = { x: 6.5, y: h * 0.35, w: w * 0.18, h: h * 0.3 };
  const inset = { x: w * 0.42, y: 4.5, w: w * 0.55, h: h - 9 };
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},0.9)`;
  ctx.strokeRect(area.x, area.y, area.w, area.h);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = neb(0.7);
  ctx.beginPath();
  ctx.moveTo(area.x + area.w, area.y);
  ctx.lineTo(inset.x, inset.y);
  ctx.moveTo(area.x + area.w, area.y + area.h);
  ctx.lineTo(inset.x, inset.y + inset.h);
  ctx.stroke();
  ctx.setLineDash([]);
  const sky = hexRgb(pal.sky);
  ctx.fillStyle = `rgba(${sky[0]},${sky[1]},${sky[2]},0.96)`;
  ctx.fillRect(inset.x, inset.y, inset.w, inset.h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = neb(0.75);
  ctx.strokeRect(inset.x, inset.y, inset.w, inset.h);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = neb(0.35);
  ctx.strokeRect(inset.x + 3.5, inset.y + 3.5, inset.w - 7, inset.h - 7);
  // внутри — мать и дети веером по порядку рождения
  const mx = inset.x + 14;
  const my = inset.y + inset.h / 2;
  ctx.strokeStyle = neb(0.75);
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 3; k++) {
    const ky = inset.y + 9 + k * ((inset.h - 18) / 2);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(inset.x + inset.w - 14, ky);
    ctx.stroke();
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(inset.x + inset.w - 14, ky, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.arc(mx, my, 3.1, 0, Math.PI * 2);
  ctx.fill();
}
