/**
 * Ввод неба: указатель (протяжка, щипок, колесо и тачпад, двойной щелчок, наведение и подсказка).
 * Колесо мыши (решения 8 и 47): без клавиш — масштаб у указателя; с Shift — сдвиг по времени, как горизонтальная
 * прокрутка в браузерах; с Ctrl и Shift — растянуть или сжать только время; с Alt — высота строк (J1). Протяжка по линейке
 * лет — время, по буквам полос — полосы; щипок по горизонтали — время, по вертикали — полосы, наискосок — обычный масштаб.
 * Клавиши неба — в src/ui/sky/skykeys.ts.
 */
import { FRAME_H, type Rect, type Sky } from '../../render/sky.ts';
import { byId, lines } from '../../data/atlas.ts';
import { selected, hovered, epochMode, layers, onlyLines, panel, pins, pinsQuery, pickMode, pickSecond, synopsisAt, model } from '../../state.ts';
import { lineNoteHits, ribbonAt, setRibbonHover } from '../../render/ribbons.ts';
import { starRadius } from '../../render/glyphs.ts';
import { setFamilyHover } from '../../render/trails.ts';
import { goTo, skyRef } from '../common.tsx';
import { tierAt, tierHot, type TierHit } from '../../render/tiers.ts';
import { toAstro } from '../../engine/years.ts';
import { panStep, reduced, resetProportions, screenOf, showYears, stopFlight, stretchBy, zoomBy } from './view.ts';
import type { Axis } from '../../render/camera.ts';
import { hoverYear } from './meridian.ts';
import { openSheetAt } from '../sheet.ts';
import { closeWhich, openWhich, whichOpen } from './Which.tsx';
import { tipKey, type Tip } from './Tip.tsx';
import { RULER_H } from '../../render/frame.ts';
import { foldDescOf, foldGroupOf, unfoldAll } from '../work.ts';
import { MENU_FIRST, dismissedBy, skyMenu } from '../panels/Work.tsx';
import { dotTipText, epochGoText, plateTipText } from './text.ts';
import { openPerson, unionById } from '../reveal.ts';
import { linkHover, plateHover, pressPlate, rememberLinkClick, toggleKids } from './starnav.ts';
import type { CountHit, PlateHit } from '../../render/plates.ts';
import type { LinkHit } from '../../render/links.ts';
import type { PlanStubHit } from '../../render/trails.ts';
import type { RibbonHit } from '../../render/ribbons.ts';
import { linkKeyString, sameLink, type LinkKey } from '../../engine/linkkey.ts';
import { previewLinks, selectedLink } from '../linkstate.ts';
import { linkTitle, linkRefs, refShort } from '../linkwords.ts';
import { closeDot, dotCard, dotsOn, openDot } from './DotCard.tsx';

export type { Tip };

/** Линейка лет вверху неба: над ней — меридиан года (D13). */
const RULER = RULER_H;
/** Пояснение «≈» масштабной линейки в служебной строке (UX-08). */
export const APPROX_NOTE = 'Масштаб неравномерный: время растянуто там, где много лиц. Равномерная шкала — «Вид», «Масштаб времени: истинный».';

export interface PointerInput {
  /** Небо сдвинулось? Подсказка прежнего лица прячется, попадание проверяется заново, когда небо остановится. extra — масштаб времени и модель. */
  watchCamera(extra: string): void;
  /** Колесо над надписями поверх неба (органы, строки у кромки, «Как читать карту») — небу (IX-57). */
  wheel(e: WheelEvent): void;
  dispose(): void;
}

// ---------- колесо и тачпад (D1; IX-01, IX-02; решение владельца 8) ----------

export type WheelKind = 'mouse' | 'trackpad' | 'pinch';
export interface WheelSample {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** время события, мс */
  t: number;
}

/** Шаг колеса мыши: у Chrome на macOS кратен 4,000244140625, у остальных — целый и не меньше 50 px. */
const mouseDelta = (d: number) => d !== 0 && (Math.abs(d) % 4.000244140625 === 0 || (Number.isInteger(d) && Math.abs(d) >= 50));

/**
 * Мышь или тачпад — эвристика Mapbox: строки и страницы (deltaMode ≠ 0) и крупный целый шаг — колесо мыши;
 * мелкий дробный шаг и сдвиг по x — тачпад; ctrlKey с мелким шагом — щипок тачпада (так его передают браузеры).
 * События ближе 300 мс друг к другу — один жест: инерция тачпада не превращается в колесо.
 */
export function classifyWheel(e: WheelSample, prev: { t: number; kind: WheelKind } | null): WheelKind {
  const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (e.ctrlKey) return e.deltaMode !== 0 || mouseDelta(d) ? 'mouse' : 'pinch';
  if (e.deltaMode !== 0) return 'mouse';
  if (prev && prev.kind !== 'pinch' && e.t - prev.t < 300) return prev.kind;
  if (e.deltaX !== 0 && !e.shiftKey) return 'trackpad';
  return mouseDelta(d) ? 'mouse' : 'trackpad';
}

/** Строка прокрутки — треть щелчка колеса (у Firefox щелчок — 3 строки), страница — высота неба. */
export const wheelPixels = (delta: number, mode: number, page: number) => (mode === 1 ? (delta * 100) / 3 : mode === 2 ? delta * page : delta);

/** Щелчков колеса в одном событии: 100 px — один щелчок; крупный шаг — не меньше одного, не больше трёх. */
export const wheelNotches = (px: number) => {
  const a = Math.abs(px);
  return Math.min(3, a >= 50 ? Math.max(1, a / 100) : a / 100);
};

/** Шаги масштаба: колесо ×1,5 за 180 мс, кнопки, клавиши и двойной щелчок ×2 за 250 мс (IX-02). */
export const WHEEL_STEP = 1.5;
export const WHEEL_MS = 180;
export const KEY_STEP = 2;
export const KEY_MS = 250;

// ---------- плавный масштаб ----------

/**
 * Шаг масштаба колеса: щелчки во время шага накапливаются — новый щелчок продолжает идущий шаг (к оставшейся части
 * прибавляется его множитель), а не начинается с места, где анимация успела остановиться (IX-02).
 * Сам шаг — общая функция неба zoomBy (src/ui/sky/view.ts): пределы камеры и prefers-reduced-motion — там.
 */
let wheelStep: { target: number; until: number } | null = null;
/** То же для колеса с Shift (время) и Alt (полосы), J1: цель — kx или пропорция полос. */
let axisStep: { axis: Axis; target: number; until: number } | null = null;

/** Прервать накопление шагов колеса (нажатие, протяжка, клавиши). */
export function stopZoom() {
  wheelStep = null;
  axisStep = null;
}

/** Щелчок колеса с Alt — полосы в 1,25 раза: от 4 до 60 px — дюжина щелчков. */
export const LANES_WHEEL = 1.25;

/** Щелчки колеса мыши с Shift или Alt (J1): только время или только полосы, у указателя; шаги подряд складываются. */
export function wheelStretch(axis: Axis, factor: number, x: number, y: number) {
  const s = skyRef.current;
  if (!s || !(factor > 0)) return;
  const now = performance.now();
  const cur = axis === 'time' ? s.cam.kx : s.cam.lanesAt();
  const f = axisStep && axisStep.axis === axis && s.cam.moving && now < axisStep.until ? (axisStep.target / cur) * factor : factor;
  wheelStep = null;
  axisStep = { axis, target: cur * f, until: now + WHEEL_MS };
  stretchBy(axis, f, { x, y }, WHEEL_MS);
}

// ---------- растяжение по осям протяжкой и щипком (J1) ----------

/** Протяжка по линейке лет или по буквам полос: на столько px — вдвое (время — вправо, полосы — вниз). */
export const STRETCH_PX = { time: 160, lanes: 120 };
/** Щипок по одной оси, если пальцы ближе чем на 30° к ней; иначе — обычный масштаб по обеим осям. */
export const PINCH_AXIS_DEG = 30;

/** Ось щипка по положению двух пальцев: по горизонтали — время, по вертикали — полосы, наискосок — обе (null). */
export function pinchAxis(dx: number, dy: number): Axis | null {
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (deg < PINCH_AXIS_DEG) return 'time';
  if (deg > 90 - PINCH_AXIS_DEG) return 'lanes';
  return null;
}

/**
 * Что под нажатием у кромок неба: линейка лет (над служебной строкой) — растянуть время, буквы полос слева — полосы.
 * Угол между ними и остальное небо — ничего (обычная протяжка сдвигает небо).
 */
export function edgeAxis(x: number, y: number, letterW: number, bottom: number): Axis | null {
  if (y < RULER && x > letterW) return 'time';
  if (x < letterW && y > FRAME_H && y < bottom) return 'lanes';
  return null;
}

/** Щелчки колеса мыши: ×WHEEL_STEP за каждый, у указателя, за WHEEL_MS; шаги подряд складываются. */
export function wheelZoom(factor: number, x: number, y: number) {
  const s = skyRef.current;
  if (!s || !(factor > 0)) return;
  const now = performance.now();
  const f = wheelStep && s.cam.moving && now < wheelStep.until ? (wheelStep.target / s.cam.kx) * factor : factor;
  wheelStep = { target: s.cam.kx * f, until: now + WHEEL_MS };
  zoomBy(f, { x, y }, WHEEL_MS);
}

// ---------- щелчок ----------

/** Долгое касание — меню неба (J3, J5), мс. */
export const LONG_PRESS_MS = 550;

/** Порог щелчка по типу указателя: мышь 5 px, перо 6, палец 10 (IX-10, MOB-09). */
export const CLICK_SLOP: Record<string, number> = { mouse: 5, pen: 6, touch: 10 };
/** Быстрое отпускание (до 250 мс) со смещением до 8 px — тоже щелчок, даже если небо чуть сдвинулось. */
export function isClick(dist: number, ms: number, type: string): boolean {
  return dist <= (CLICK_SLOP[type] ?? 5) || (ms < 250 && dist < 8);
}
/** Протяжка по линейке лет и по буквам строк начинается дальше 8 px: случайное нажатие не меняет пропорцию (UX-53). */
export const AXIS_SLOP = 8;

// ---------- инерция протяжки (решение владельца 37; IX-05) ----------

/** Инерция: столько мс, с замедлением; скорость берётся по последним INERTIA_WINDOW мс протяжки. */
export const INERTIA_MS = 325;
export const INERTIA_WINDOW = 100;
/** Медленнее этого (px/мс) — без инерции: отпустили, остановив руку; и если после последнего движения прошло больше 60 мс. */
export const INERTIA_MIN_V = 0.25;
const INERTIA_IDLE = 60;
/** Не дальше стольких px: бросок не уносит небо за тридевять земель. */
export const INERTIA_MAX = 600;

/** Точка протяжки: время (мс) и место (px). */
export type DragSample = { t: number; x: number; y: number };
/**
 * Сколько ещё проскользит небо после отпускания (px): по скорости последних 100 мс протяжки. Кривая замедления
 * easeOut начинается с утроенной средней скорости, поэтому путь — v × T / 3. Медленное отпускание — 0.
 */
export function inertia(samples: readonly DragSample[], upT: number, ms = INERTIA_MS): { dx: number; dy: number } {
  if (samples.length < 2) return { dx: 0, dy: 0 };
  const last = samples[samples.length - 1];
  if (upT - last.t > INERTIA_IDLE) return { dx: 0, dy: 0 };
  const first = samples.find((q) => last.t - q.t <= INERTIA_WINDOW) ?? samples[0];
  const dt = last.t - first.t;
  if (dt < 8) return { dx: 0, dy: 0 };
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  const v = Math.hypot(vx, vy);
  if (v < INERTIA_MIN_V) return { dx: 0, dy: 0 };
  const k = Math.min(1, INERTIA_MAX / ((v * ms) / 3));
  return { dx: ((vx * ms) / 3) * k, dy: ((vy * ms) / 3) * k };
}

// ---------- касание (H5; MOB-10, MOB-17, MOB-39) ----------

/** Радиус касания пальцем, px: после звезды ищется ближайший след. */
export const TOUCH_R = 22;
/** Цель касания не меньше 44 × 44 (WCAG 2.5.5): указатели у края на телефоне — 18 px в высоту, их поле шире рисунка. */
export const TOUCH_TARGET = 44;

/** Прямоугольник, раздвинутый до min × min вокруг своей середины. */
export function inflate(r: Rect, min: number): Rect {
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}

/** Звезда под пальцем: расстояние до касания (px), величина (0 — самая яркая), подписана ли на небе, место на холсте. */
export interface TapCandidate {
  id: string;
  d: number;
  mag: number;
  labeled: boolean;
  x: number;
  y: number;
}
export type TapChoice = { kind: 'pick'; id: string } | { kind: 'ask'; ids: string[] } | { kind: 'zoom' } | { kind: 'none' };

/**
 * Вес звезды для касания (MOB-10): расстояние / (1 + 0,3·(6 − величина)); у подписанной — ещё ×0,6.
 * Меньше — вероятнее: палец целится в то, что видит, — в яркие звёзды с именами.
 */
export const tapScore = (c: TapCandidate) => (c.d / (1 + 0.3 * (6 - Math.max(0, Math.min(6, c.mag))))) * (c.labeled ? 0.6 : 1);
/** Больше стольких равновероятных звёзд — не список, а приближение: на обзоре имена ничего не скажут. */
export const ASK_MAX = 5;

/**
 * Что значит касание (MOB-10). Звёзды «равновероятны», если вес не больше полуторного веса лучшей (и не дальше 1,5 единицы
 * веса — две звезды в паре пикселей друг от друга неразличимы и при точном касании). Одна такая — выбор; две–пять —
 * список «Какое лицо?» сверху вниз, как на небе; больше пяти — приближение к месту касания, если есть куда.
 */
export function tapChoice(cands: TapCandidate[], canZoom: boolean): TapChoice {
  if (!cands.length) return { kind: 'none' };
  const sorted = [...cands].sort((a, b) => tapScore(a) - tapScore(b));
  const s0 = tapScore(sorted[0]);
  const near = sorted.filter((c) => tapScore(c) <= Math.max(s0 * 1.5, s0 + 1.5));
  if (near.length === 1) return { kind: 'pick', id: near[0].id };
  if (near.length > ASK_MAX && canZoom) return { kind: 'zoom' };
  return { kind: 'ask', ids: near.slice(0, ASK_MAX).sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.id) };
}

/** Подпись под пальцем: касание имени — то же, что касание звезды (на телефоне палец целится в надпись). */
const LABEL_D = 2;

/**
 * Звёзды в радиусе r от точки (px холста), которые видны и ловят указатель; у лица с двумя знаками — ближайший.
 * Звезда, чья подпись под пальцем (поле подписи — не ниже 24 px), считается в LABEL_D px от касания.
 */
function tapCandidates(sky: Sky, x: number, y: number, r: number): TapCandidate[] {
  const cam = sky.cam;
  const labels = sky.labelStats().boxes.filter((b) => b.kind === 'star' && b.id);
  const labeled = new Set(labels.map((b) => b.id!));
  const onLabel = new Set(
    labels
      .filter((b) => {
        const q = inflate(b, 24);
        return x >= b.x - 2 && x <= b.x + b.w + 2 && y >= q.y && y <= q.y + q.h;
      })
      .map((b) => b.id!),
  );
  const best = new Map<string, TapCandidate>();
  for (let i = 0; i < sky.nodes.length; i++) {
    const n = sky.nodes[i];
    const sy = cam.sy(n.lane);
    const named = onLabel.has(n.person);
    if (!named && Math.abs(sy - y) > r) continue;
    const sx = cam.sx(sky.X0[i]);
    let d = Math.hypot(sx - x, sy - y);
    if (named) d = Math.min(d, LABEL_D);
    if (d > r || !sky.reachable(i)) continue;
    const was = best.get(n.person);
    if (was && was.d <= d) continue;
    best.set(n.person, { id: n.person, d, mag: byId.get(n.person)?.magnitude ?? 6, labeled: labeled.has(n.person), x: sx, y: sy });
  }
  return [...best.values()];
}

/**
 * Выбор звезды на небе (щелчок, касание, строка «Какое лицо?»): в режиме «Родство с…» и «Разворот с…» — второе лицо;
 * иначе — выбор, и на телефоне лист карточки открывается на шапке 104 px (решение владельца 12). В небе «набор» у самой
 * звезды раскрывается карточка у точки: образ, имя, годы и команды раскрытия (решение 76; src/ui/sky/DotCard.tsx).
 */
function chooseStar(id: string) {
  if (pins.value.length) pins.value = [];
  if (pickSecond(id)) return;
  if (id !== selected.value) openSheetAt('peek');
  selected.value = id;
  if (dotsOn.peek()) openDot({ kind: 'person', id });
}

// ---------- что под указателем, кроме звезды: лента, номер у бусины, эпоха служебной строки ----------

/** Лента ловится не дальше стольких px от нити (MAP-28). */
export const RIBBON_R = 6;

/**
 * Лента или звезда (MAP-28): нить ленты важнее знака и следа лица, если указатель к ней ближе, чем к знаку (до края
 * диска) и к следу, и не дальше RIBBON_R. d — расстояние до знака или следа лица под указателем (Infinity — лица нет).
 * Радиус, в котором искать нить: 0 — не искать (указатель на самом знаке или следе).
 */
export const ribbonReach = (d: number) => Math.max(0, Math.min(RIBBON_R, d - 0.5));

/** Расстояние от точки (px холста) до знака лица id — до края диска — или до его следа, px. */
export function hitDistance(sky: Sky, id: string, x: number, y: number): number {
  const cam = sky.cam;
  const r = starRadius(byId.get(id)?.magnitude ?? 6, Math.max(0.7, Math.min(1.25, cam.ky / 18)));
  let best = Infinity;
  for (let i = 0; i < sky.nodes.length; i++) {
    const n = sky.nodes[i];
    if (n.person !== id) continue;
    const sx = cam.sx(sky.X0[i]);
    const sy = cam.sy(n.lane);
    best = Math.min(best, Math.max(0, Math.hypot(sx - x, sy - y) - r));
    if (x >= sx && x <= cam.sx(sky.X1[i])) best = Math.min(best, Math.abs(sy - y));
  }
  return best;
}

/** Номер лица в родословии у бусины: чей счёт (Мф 1 или Лк 3) и номер (UX-69; решение 39). */
export type LineCount = { book: 'Мф' | 'Лк'; n: number };

/** Чей счёт у номера без приставки «Мф» или «Лк»: у лица линии Иосифа с этим номером по Мф 1 — Мф, иначе Лк. */
export function countBook(id: string, n: number): 'Мф' | 'Лк' | null {
  if (lines.joseph.persons.some((st) => st.id === id && st.mt === n)) return 'Мф';
  if ([...lines.joseph.persons, ...lines.mary.persons].some((st) => st.id === id && st.lk === n)) return 'Лк';
  return null;
}

/** Номер у бусины под указателем в режиме «только линии» (UX-69): надпись «Мф 17», «Лк 39» (или только число). */
export function lineNumberAt(sky: Sky, x: number, y: number): (LineCount & { id: string }) | null {
  if (!onlyLines.peek()) return null;
  for (const b of sky.ledger.boxes) {
    if (b.kind !== 'mark' || !b.id || x < b.x - 2 || x > b.x + b.w + 2 || y < b.y - 2 || y > b.y + b.h + 2) continue;
    const m = /^(?:(Мф|Лк)\s)?(\d+)$/.exec(b.text.replace(/\u00a0/g, ' ').trim());
    if (!m) continue;
    const n = Number(m[2]);
    const book = (m[1] as 'Мф' | 'Лк' | undefined) ?? countBook(b.id, n);
    if (book) return { id: b.id, book, n };
  }
  return null;
}

/**
 * Точка союза под указателем (решения 70, 76; src/render/plates.ts, Sky.plateHits): на касании — в поле не меньше
 * 44 × 44 вокруг знака (решение 33). Ближайшая к указателю, если поля соседних точек перекрываются.
 */
export function plateAt(sky: Pick<Sky, 'plateHits'>, x: number, y: number, touch = false): PlateHit | null {
  let best: PlateHit | null = null;
  let bestD = Infinity;
  for (const h of sky.plateHits) {
    const r = touch ? inflate(h, TOUCH_TARGET) : h;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    const d = Math.hypot(x - (h.x + h.w / 2), y - (h.y + h.h / 2));
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/** «+N» свёрнутого союза под указателем (этап 11, § 2): отдельная цель, на касании — не меньше 44 × 44. */
export function countAt(sky: Pick<Sky, 'countHits'>, x: number, y: number, touch = false): CountHit | null {
  for (const h of sky.countHits) {
    const r = touch ? inflate(h, TOUCH_TARGET) : h;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return h;
  }
  return null;
}

/** Обрывок наружу показа под указателем (§ 7): подпись и пунктир; на касании — не меньше 44 × 44. */
export function stubAt(sky: Pick<Sky, 'stubHits'>, x: number, y: number, touch = false): PlanStubHit | null {
  for (const h of sky.stubHits) {
    const r = touch ? inflate(h, TOUCH_TARGET) : h;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return h;
  }
  return null;
}

/** Подсказка обрывка наружу показа: «Ревекка — щёлкните, чтобы открыть карточку». */
export function stubTipText(id: string): string {
  const p = byId.get(id);
  return p ? `${p.name}${p.disambig ? `, ${p.disambig}` : ''} — щёлкните, чтобы открыть карточку` : '';
}

/** Линия связи ловится мышью не дальше стольких px (§ 8: 5–6 px от линии). */
export const LINK_R = 6;
/**
 * Звезда важнее линии, ромба и «+N» ближе стольких px к её середине (§ 8: «не ближе 12 px к звезде») — кроме точного
 * наведения: указатель на самой линии (≤ 2 px), на ромбе или на «+N» и вне знака звезды (радиус + 5 px). Иначе зубец
 * длиной 5–12 px, весь лежащий у звезды ребёнка, нельзя было бы выбрать мышью.
 */
export const STAR_FIRST = 12;

/** Что под указателем по старшинству (этап 11, § 8): звезда > ◆ > «+N» > зубец > ствол > «‖» > обрывок > лента > след. */
export type Under =
  | { kind: 'star'; id: string; d: number }
  | { kind: 'plate'; plate: PlateHit }
  | { kind: 'count'; count: CountHit }
  | { kind: 'link'; hit: LinkHit }
  | { kind: 'stub'; stub: PlanStubHit }
  | { kind: 'ribbon'; hit: RibbonHit }
  | { kind: 'trail'; id: string };

/** Радиус знака звезды лица на небе (px холста), как у hitDistance. */
const glyphR = (sky: Sky, id: string) => starRadius(byId.get(id)?.magnitude ?? 6, Math.max(0.7, Math.min(1.25, sky.cam.ky / 18))) + (byId.get(id)?.sex === 'f' ? 2.2 : 0);

/**
 * Что под указателем мыши или пера (px холста; r — радиус звезды): звезда, ромб союза, «+N», линия связи, обрывок наружу,
 * лента, след — по старшинству § 8. Попадание по линиям — сеткой кадра (src/render/links.ts, LinkHits): не больше 1 мс.
 */
export function underPointer(sky: Sky, x: number, y: number, r: number): Under | null {
  const L = layers.peek();
  const star = sky.hitStar(x, y, r);
  const plate = plateAt(sky, x, y);
  const count = plate ? null : countAt(sky, x, y);
  const hit = L.connectors ? sky.linkAt(x, y, LINK_R, false) : null;
  // под рамкой неба линии не видно — и не ловится (как у касания, linksNear)
  const line = hit && hit.x >= sky.letterW && hit.y >= sky.openTop && hit.y <= sky.cam.vp.b ? hit : null;
  const onPlate = !!plate && Math.hypot(x - plate.cx, y - plate.cy) <= plate.r + 3;
  const onCount = !!count && Math.abs(y - (count.y + count.h / 2)) <= 8;
  const onLine = !!line && line.d <= 2;
  if (star && (star.d <= STAR_FIRST || !(plate || count || line))) {
    const exact = (onPlate || onCount || onLine) && star.d > glyphR(sky, star.id) + 5;
    if (!exact) {
      // лента важнее знака, если указатель к нити ближе, чем к знаку (MAP-28)
      const reach = L.ribbons ? ribbonReach(hitDistance(sky, star.id, x, y)) : 0;
      const rib = reach > 0 ? ribbonAt(sky, x, y, reach) : null;
      return rib ? { kind: 'ribbon', hit: rib } : { kind: 'star', id: star.id, d: star.d };
    }
  }
  if (plate) return { kind: 'plate', plate };
  if (count) return { kind: 'count', count };
  if (line) return { kind: 'link', hit: line };
  const stub = stubAt(sky, x, y);
  if (stub) return { kind: 'stub', stub };
  const rib = L.ribbons ? ribbonAt(sky, x, y, RIBBON_R) : null;
  if (rib) return { kind: 'ribbon', hit: rib };
  const trail = sky.hitTrail(x, y);
  return trail ? { kind: 'trail', id: trail } : null;
}

/** Шаг ленты под указателем — ключ связи (src/engine/linkkey.ts): «шаг линии к лицу to». */
export const ribbonKey = (h: Pick<RibbonHit, 'line' | 'to'>): LinkKey => ({ kind: 'step', line: h.line, child: h.to });

/**
 * Связи у пальца (касание, § 8): линии и узлы в радиусе TOUCH_R и шаг ленты — по одной на ключ, ближайшие первыми.
 */
export function linksNear(sky: Sky, x: number, y: number, r = TOUCH_R): { key: LinkKey; ks: string; d: number; x: number; y: number }[] {
  // только видимая часть линии: под рамкой (линейка годов, буквы полос) и под нижней кромкой её не видно — не ловится
  const open = (h: { x: number; y: number }) => h.x >= sky.letterW && h.y >= sky.openTop && h.y <= sky.cam.vp.b;
  const out = (layers.peek().connectors ? sky.linksAt(x, y, r, false) : []).filter(open).map((h) => ({ key: h.key, ks: h.ks, d: h.d, x: h.x, y: h.y }));
  if (layers.peek().ribbons) {
    const rib = ribbonAt(sky, x, y, r);
    if (rib) {
      const key = ribbonKey(rib);
      const ks = linkKeyString(key) ?? '';
      if (!out.some((q) => q.ks === ks)) out.push({ key, ks, d: Math.hypot(rib.x - x, rib.y - y), x: rib.x, y: rib.y });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * Что значит касание у линий (§ 8): одна связь в радиусе — она; две и больше, и вторая ближе полуторного расстояния
 * первой — список «Какая связь?»; иначе — ближайшая.
 */
export function linkChoice<T extends { d: number }>(near: readonly T[]): { kind: 'pick'; hit: T } | { kind: 'ask'; hits: T[] } | { kind: 'none' } {
  if (!near.length) return { kind: 'none' };
  if (near.length === 1) return { kind: 'pick', hit: near[0] };
  const d0 = Math.max(near[0].d, 1);
  const close = near.filter((h) => h.d < 1.5 * d0);
  return close.length >= 2 ? { kind: 'ask', hits: close.slice(0, ASK_MAX) } : { kind: 'pick', hit: near[0] };
}

/** Выбрать связь (§ 8): selectedLink; выбор лица не меняется; x, y — точка щелчка (к ней встаёт карточка связи). */
export function chooseLink(sky: Pick<Sky, 'cam'>, key: LinkKey, x: number, y: number) {
  const ks = linkKeyString(key);
  if (!ks) return;
  rememberLinkClick(sky, ks, x, y);
  previewLinks.value = null;
  selectedLink.value = key;
}

/** Подсказка «+» у подписи лица с нераскрытыми союзами (решение 70). */
export const REVEAL_TIP = 'У лица есть нераскрытые союзы — щёлкните, чтобы показать их на небе';

/** Название эпохи в служебной строке под указателем (UX-65): эпоха модели и прямоугольник надписи. */
function serviceEpochAt(sky: Sky, x: number, y: number) {
  if (y < RULER_H || y >= FRAME_H) return null;
  for (const b of sky.ledger.boxes) {
    if (b.kind !== 'frame' || x < b.x || x > b.x + b.w || b.y < RULER_H - 1 || b.y + b.h > FRAME_H + 1) continue;
    const e = model.peek().epochs.find((q) => q.name === b.text || q.short === b.text);
    if (e) return { e, box: { x: b.x, y: b.y, w: b.w, h: b.h } };
  }
  return null;
}

/** Небо — к эпохе (UX-65): как щелчок по отрезку эпохи в ярусах — её годы и поля по краям. */
function showEpoch(start: number, end: number) {
  const t0 = toAstro(start);
  const t1 = toAstro(end);
  const pad = Math.max(10, Math.max(40, t1 - t0) * 0.06);
  showYears(t0 - pad, t1 + pad, true);
}

/** Когда меню звезды открыли с клавиатуры: следом браузер шлёт своё contextmenu — его место не у звезды. */
let keyMenuAt = -Infinity;

/**
 * Меню звезды с клавиатуры (IX-49; skykeys.ts): клавиша меню или Shift + F10 на звезде с кольцом фокуса — то же меню,
 * что у правой кнопки мыши, у самой звезды. Звезда должна быть в видимой части неба. Открылось ли меню.
 */
export function openStarMenu(id: string): boolean {
  const s = skyRef.current;
  const q = screenOf(id);
  if (!s || !q) return false;
  const vp = s.cam.vp;
  if (q.x < vp.l || q.x > vp.r || q.y < vp.t || q.y > vp.b) return false;
  keyMenuAt = performance.now();
  skyMenu.value = { x: q.x, y: q.y, id };
  // меню открыто клавишей — фокус в меню, когда оно встало на место (до этого оно невидимо и фокус не держит)
  const focusIn = (tries: number) => {
    const m = document.querySelector<HTMLElement>('.sky .skymenu');
    if (m?.hasAttribute('data-placed')) {
      if (!m.contains(document.activeElement)) m.querySelector<HTMLElement>(MENU_FIRST)?.focus({ preventScroll: true });
      return;
    }
    if (tries < 30 && skyMenu.peek()) requestAnimationFrame(() => focusIn(tries + 1));
  };
  requestAnimationFrame(() => focusIn(0));
  return true;
}

export function attachPointer(sky: Sky, canvas: HTMLCanvasElement, request: () => void, setTip: (t: Tip | null) => void): PointerInput {
  const pointers = new Map<number, { x: number; y: number }>();
  // axis — нажали на линейку лет или на буквы полос: протяжка растягивает ось, а не сдвигает небо (J1);
  // stopper — нажатие остановило перелёт или инерцию: оно только останавливает небо и щелчком не считается (IX-54);
  // trail — последние точки протяжки: по ним скорость для инерции (IX-05)
  let drag: {
    x0: number; y0: number; x: number; y: number; moved: boolean; t: number; type: string; long?: boolean; axis: Axis | null; stopper: boolean; trail: DragSample[];
  } | null = null;
  // долгое касание звезды или названия созвездия — меню неба (J3, J5): «Добавить в набор», «Свернуть потомков»
  let longTimer = 0;
  /** Касание кончилось долгим: его touchend не порождает щелчка (см. onTouchEnd). */
  let swallowTap = false;
  const onTouchEnd = (e: TouchEvent) => {
    if (!swallowTap) return;
    swallowTap = false;
    if (e.cancelable) e.preventDefault();
  };
  /** Меню неба у точки (px холста): у названия созвездия — «Свернуть созвездие», у звезды — выбор объёма и свёртка. */
  const menuAt = (x: number, y: number, r: number): boolean => {
    const g = sky.groupHits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const id = g ? null : sky.hit(x, y, r);
    if (!g && !id) return false;
    showTip(null);
    // пока меню открыто, наведение и подсказки заморожены (IX-49): кольцо остаётся у звезды меню
    if (hovered.value !== id) hovered.value = id;
    skyMenu.value = g ? { x, y, group: g.group } : { x, y, id: id! };
    return true;
  };
  // щипок: ось выбирается по положению пальцев в начале (J1) и держится до конца жеста; span — их разнос по этой оси
  let pinch: { d: number; cx: number; cy: number; axis: Axis | null; span: number } | null = null;
  // где мышь или перо над небом (касание не наводит) — чтобы после движения неба проверить, что под указателем теперь
  let pointer: { x: number; y: number; r: number } | null = null;
  let tipShown = false;
  let lastWheel: { t: number; kind: WheelKind } | null = null;
  // щелчок по пустому небу снимает выбор, но не сразу: второй щелчок того же двойного — масштаб, а не снятие
  let clearTimer = 0;
  let tipNow = '';
  const showTip = (t: Tip | null) => {
    if (!t && !tipShown) return;
    const k = tipKey(t);
    // та же звезда или тот же отрезок — подсказка стоит, а не переставляется за указателем
    if (k && k === tipNow) return;
    tipNow = k;
    tipShown = !!t;
    setTip(t);
  };
  /** Отрезок яруса под указателем: обводка в кадре. */
  const setTierHot = (h: TierHit | null) => {
    const k = h?.bar.key ?? null;
    if (k === tierHot.key) return;
    tierHot.key = k;
    request();
  };
  /** Курсор: над звездой, отрезком яруса и указателем у края — «рука со пальцем» (E11; IX-06, UX-29). */
  const setHot = (on: boolean) => canvas.classList.toggle('hot', on);
  /** Наведённая точка союза (решения 70, 76): она ярче. */
  const setPlate = (uid: string | null) => {
    if (plateHover.peek() === uid) return;
    plateHover.value = uid;
    request();
  };
  /** Связь под указателем (§ 8): путь и концы — полной яркостью и на 1 px толще. */
  const setLink = (k: LinkKey | null) => {
    const was = linkHover.peek();
    if (was === k || (was && k && sameLink(was, k))) return;
    linkHover.value = k;
    request();
  };
  /** Что под указателем (px холста): отрезок яруса или звезда; обновляет наведение, подсказку и курсор. */
  const probe = (x: number, y: number, r: number) => {
    // открыто меню неба: подсказки не ложатся на него, наведение стоит (IX-49)
    if (skyMenu.peek()) return;
    if (epochMode.value && y >= FRAME_H && y < sky.openTop) {
      // ярусы эпох: отрезки отвечают сами, звёзды под ними не ловятся (IX-28)
      const t = tierAt(x, y);
      if (hovered.value) hovered.value = null;
      setTierHot(t);
      setHot(!!t);
      showTip(t ? { kind: 'tier', hit: t, x, y } : null);
      return;
    }
    setTierHot(null);
    // знаки свёрнутого (J5) — ссылки, как указатели у края: указатель «рука», щелчок разворачивает
    const foldHit = sky.foldHits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const fold = !!foldHit;
    const edge = fold || sky.edgeHits.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    // «+» у подписи лица с нераскрытыми союзами (решение 70)
    if (foldHit?.kind === 'reveal') {
      setPlate(null);
      setLink(null);
      if (hovered.value) hovered.value = null;
      setHot(true);
      showTip({ kind: 'note', key: `reveal:${foldHit.id}`, text: REVEAL_TIP, x, y, box: { x: foldHit.x, y: foldHit.y, w: foldHit.w, h: foldHit.h } });
      return;
    }
    // выноски точек сравнения линий — ссылки (E6; src/render/ribbons.ts)
    const note = !edge && lineNoteHits(sky).some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    // номер у бусины в режиме «только линии» — это лицо: его подсказка объясняет счёт (UX-69; решение 39)
    const num = edge || note ? null : lineNumberAt(sky, x, y);
    // что под указателем по старшинству (этап 11, § 8): звезда > ◆ > «+N» > зубец > ствол > «‖» > лента > след
    const u = edge || note || num ? null : underPointer(sky, x, y, r);
    const plate = u?.kind === 'plate' ? u.plate : null;
    setPlate(plate?.uid ?? null);
    setLink(u?.kind === 'link' ? u.hit.key : null);
    const hit = num?.id ?? (u?.kind === 'star' || u?.kind === 'trail' ? u.id : null);
    const rib = u?.kind === 'ribbon' ? u.hit : null;
    if (hit !== hovered.value) hovered.value = hit;
    if (setRibbonHover(sky, rib) || setFamilyHover(sky, null)) request();
    setHot(!!u || edge || note || !!num);
    if (plate) {
      // ромб союза: в небе «набор» подсказка — одна строка «Союз Адама и Евы: 3 сына — щёлкните», щелчок открывает
      // карточку у ромба; у ромба с открытой карточкой подсказки нет — всё сказано в карточке
      const un = unionById(plate.uid);
      const card = dotCard.peek();
      const dots = dotsOn.peek();
      if (!un || (dots && card?.kind === 'union' && card.uid === plate.uid)) showTip(null);
      else {
        const text = dots ? dotTipText(un) : plateTipText(un, plate.open);
        showTip({ kind: 'note', key: `plate:${plate.uid}:${dots ? 'dot' : plate.open ? 1 : 0}`, text, x, y, box: { x: plate.x, y: plate.y, w: plate.w, h: plate.h } });
      }
      return;
    }
    if (u?.kind === 'count') {
      // «+N» свёрнутого союза — отдельная цель: щелчок раскрывает или сворачивает союз
      const un = unionById(u.count.uid);
      showTip(un ? { kind: 'note', key: `count:${u.count.uid}:${u.count.open ? 1 : 0}`, text: plateTipText(un, u.count.open), x, y, box: { x: u.count.x, y: u.count.y, w: u.count.w, h: u.count.h } } : null);
      return;
    }
    if (u?.kind === 'stub') {
      showTip({ kind: 'note', key: `stub:${u.stub.from}:${u.stub.to}`, text: stubTipText(u.stub.to), x, y, box: { x: u.stub.x, y: u.stub.y, w: u.stub.w, h: u.stub.h } });
      return;
    }
    if (u?.kind === 'link') {
      showTip({ kind: 'link', key: u.hit.key, ks: u.hit.ks, x: u.hit.x, y: u.hit.y });
      return;
    }
    // у звезды с открытой карточкой у точки подсказки нет: имя и годы — в карточке (решение 76)
    const card = dotCard.peek();
    if (hit && !num && card?.kind === 'person' && card.id === hit) showTip(null);
    else if (hit) showTip({ kind: 'star', id: hit, x, y, ...(num ? { count: { book: num.book, n: num.n } } : {}) });
    else if (rib) showTip({ kind: 'ribbon', hit: rib, x, y });
    else showTip(null);
  };
  /** Подсказка и наведение — по тому, что под указателем сейчас. */
  const rehit = () => {
    if (!pointer || drag || pinch || pointer.y < RULER) return;
    probe(pointer.x, pointer.y, pointer.r);
  };
  // Небо сдвинулось (протяжка, колесо, клавиши, перелёт, полоса времени, смена масштаба): подсказка прежнего лица
  // прячется сразу, а попадание проверяется заново, когда небо остановится (IX-07, MAP-39).
  let camWas = '';
  let calm = 0;
  const watchCamera = (extra: string) => {
    const c = sky.cam;
    const key = `${c.x0} ${c.kx} ${c.laneTop} ${c.lanes} ${c.w} ${c.h} ${extra}`;
    if (key === camWas) return;
    const initial = !camWas;
    camWas = key;
    if (initial) return;
    // список «Какое лицо?» и меню неба стоят у места касания: небо сдвинулось — место уже не то
    if (whichOpen()) closeWhich();
    if (skyMenu.peek()) skyMenu.value = null;
    showTip(null);
    if (hovered.value) hovered.value = null;
    setRibbonHover(sky, null);
    setFamilyHover(sky, null);
    setTierHot(null);
    setPlate(null);
    setLink(null);
    clearTimeout(calm);
    calm = window.setTimeout(rehit, 120);
  };
  const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    // нажатие, которое закрыло меню звезды или выбор «Добавить в набор», только закрывает его (IX-72): не выбирает звезду,
    // не снимает выбор и не тянет небо
    if (dismissedBy(e)) return;
    // правая и средняя кнопки мыши не тянут небо и не выбирают звезду: правая — только меню (contextmenu; IX-49, UX-52)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    // нажатие во время перелёта или инерции только останавливает небо (IX-54); упор камеры — в SkyView
    const stopper = sky.cam.flying;
    stopFlight();
    stopZoom();
    if (whichOpen()) closeWhich();
    clearTimeout(clearTimer);
    const p = local(e);
    pointers.set(e.pointerId, p);
    // нажатие снимает меридиан: во время протяжки его нет (D13)
    hoverYear(null);
    // по линейке и буквам оси тянут только мышь и перо; палец у края — сдвиг, оси — щипком (решение 27; MOB-57)
    const t = performance.now();
    if (pointers.size === 1)
      drag = {
        x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, t, type: e.pointerType, stopper, trail: [{ t, x: p.x, y: p.y }],
        axis: e.pointerType === 'touch' ? null : edgeAxis(p.x, p.y, sky.letterW, sky.cam.vp.b),
      };
    clearTimeout(longTimer);
    if (pointers.size === 1 && e.pointerType === 'touch')
      longTimer = window.setTimeout(() => {
        if (drag && !drag.moved && pointers.size === 1 && menuAt(drag.x0, drag.y0, TOUCH_R)) drag.long = true;
      }, LONG_PRESS_MS);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const axis = pinchAxis(a.x - b.x, a.y - b.y);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      pinch = { d, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, axis, span: axis === 'time' ? Math.abs(a.x - b.x) : axis === 'lanes' ? Math.abs(a.y - b.y) : d };
      drag = null;
    }
  };
  /** Разнос пальцев по оси щипка: не меньше 24 px, чтобы поворот пальцев поперёк оси не давал скачка масштаба. */
  const PINCH_MIN = 24;
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    pointer = e.pointerType === 'touch' ? null : { x: p.x, y: p.y, r: 12 };
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      sky.cam.pan(cx - pinch.cx, cy - pinch.cy);
      // развод пальцев по горизонтали — только время, по вертикали — только полосы, наискосок — масштаб (J1)
      const span = pinch.axis === 'time' ? Math.abs(a.x - b.x) : pinch.axis === 'lanes' ? Math.abs(a.y - b.y) : d;
      if (pinch.axis) sky.cam.stretchAt(pinch.axis, cx, cy, Math.max(PINCH_MIN, span) / Math.max(PINCH_MIN, pinch.span));
      else sky.cam.zoomAt(cx, cy, d / pinch.d);
      pinch = { d, cx, cy, axis: pinch.axis, span };
      request();
      return;
    }
    if (drag) {
      // протяжка начинается за порогом щелчка своего указателя, по осям — за 8 px (UX-53); небо сдвигается от точки
      // нажатия, без скачка
      if (drag.moved || Math.hypot(p.x - drag.x0, p.y - drag.y0) > (drag.axis ? AXIS_SLOP : (CLICK_SLOP[drag.type] ?? 5))) {
        drag.moved = true;
        clearTimeout(longTimer);
        canvas.classList.add('dragging');
        setHot(false);
        // по линейке лет — растянуть время вокруг точки нажатия, по буквам полос — полосы (J1); иначе — сдвиг
        if (drag.axis === 'time') sky.cam.stretchAt('time', drag.x0, (sky.cam.vp.t + sky.cam.vp.b) / 2, Math.pow(2, (p.x - drag.x) / STRETCH_PX.time));
        else if (drag.axis === 'lanes') sky.cam.stretchAt('lanes', drag.x0, drag.y0, Math.pow(2, (p.y - drag.y) / STRETCH_PX.lanes));
        else {
          sky.cam.pan(p.x - drag.x, p.y - drag.y);
          const now = performance.now();
          drag.trail.push({ t: now, x: p.x, y: p.y });
          while (drag.trail.length > 2 && now - drag.trail[0].t > INERTIA_WINDOW * 2) drag.trail.shift();
        }
        drag.x = p.x;
        drag.y = p.y;
        showTip(null);
        request();
      }
      return;
    }
    // открыто меню неба: наведение и подсказки стоят, пока его не закроют (IX-49)
    if (skyMenu.peek()) return;
    // над линейкой лет и буквами полос курсор говорит, что их можно тянуть (J1)
    const zone = e.pointerType === 'touch' ? null : edgeAxis(p.x, p.y, sky.letterW, sky.cam.vp.b);
    canvas.classList.toggle('stretch-x', zone === 'time');
    canvas.classList.toggle('stretch-y', zone === 'lanes');
    // служебная строка: у масштабной линейки «≈» — пояснение неравномерного масштаба (UX-08)
    if (p.y < FRAME_H) {
      setPlate(null);
      setLink(null);
    }
    if (p.y >= RULER_H && p.y < FRAME_H && e.pointerType !== 'touch') {
      hoverYear(null);
      if (hovered.value) hovered.value = null;
      setTierHot(null);
      // «Свёрнуто: … — развернуть» и названия эпох в служебной строке — команды (решение 30; UX-65): курсор-рука
      const ep = serviceEpochAt(sky, p.x, p.y);
      setHot(!!ep || sky.foldHits.some((q) => p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h));
      if (ep) {
        showTip({ kind: 'note', key: `epoch:${ep.e.id}`, text: epochGoText(ep.e), x: p.x, y: p.y, box: ep.box });
        return;
      }
      const b = sky.ledger.boxes.find((q) => q.kind === 'frame' && q.text.startsWith('≈') && p.x >= q.x && p.x <= q.x + q.w);
      showTip(b ? { kind: 'note', key: 'approx', text: APPROX_NOTE, x: p.x, y: p.y, box: { x: b.x, y: b.y, w: b.w, h: b.h } } : null);
      return;
    }
    if (p.y < RULER) {
      // над линейкой — меридиан года, через 250 мс (D13)
      if (e.pointerType !== 'touch') hoverYear(sky.tOf(sky.cam.wx(p.x)));
      if (hovered.value) hovered.value = null;
      setTierHot(null);
      setHot(false);
      showTip(null);
      return;
    }
    hoverYear(null);
    probe(p.x, p.y, e.pointerType === 'touch' ? TOUCH_R : 12);
  };
  const onUp = (e: PointerEvent) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size < 2) pinch = null;
    const d = drag;
    drag = null;
    clearTimeout(longTimer);
    // долгое касание открыло меню — это не щелчок; и отпущенный палец не нажимает пункт меню, открывшегося под ним
    // (совместимые mousedown/click после touchend; меню с целями 44 px выше места под пальцем — решение 33)
    if (d?.long) {
      swallowTap = true;
      return;
    }
    if (pointer) {
      clearTimeout(calm);
      calm = window.setTimeout(rehit, 120);
    }
    if (!d || e.type === 'pointercancel') return;
    if (!isClick(Math.hypot(p.x - d.x0, p.y - d.y0), performance.now() - d.t, d.type)) {
      // бросок: небо скользит ещё ≈ 325 мс с замедлением; при ослабленном движении — нет (решение 37; IX-05)
      if (d.moved && !d.axis && pointers.size === 0) {
        const g = inertia(d.trail, performance.now());
        if (sky.cam.glide(g.dx, g.dy, INERTIA_MS, request, reduced())) request();
      }
      return;
    }
    // нажатие остановило перелёт или инерцию — и только (IX-54)
    if (d.stopper) return;
    // щелчок — там, где нажали: дрожание при отпускании не уводит к соседней звезде
    const at = { x: d.x0, y: d.y0 };
    const touch = d.type === 'touch';
    // указатель у края: палец попадает в поле 44 × 44 вокруг надписи (MOB-17)
    const edge = sky.edgeHits.find((e) => {
      const r = touch ? inflate(e, TOUCH_TARGET) : e;
      return at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h;
    });
    if (edge) {
      goTo(edge.id);
      return;
    }
    // знак свёрнутого (J5): «+N» у следа — развернуть потомков, строка-подпись — развернуть созвездие
    const fold = sky.foldHits.find((e) => {
      const r = touch ? inflate(e, TOUCH_TARGET) : e;
      return at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h;
    });
    if (fold) {
      if (fold.kind === 'desc') foldDescOf(fold.id, false);
      else if (fold.kind === 'all') unfoldAll();
      else if (fold.kind === 'reveal') openPerson(fold.id);
      else foldGroupOf(fold.id, false);
      return;
    }
    // название эпохи в служебной строке — небо к эпохе (UX-65); выбор лица не меняется
    const ep = touch ? null : serviceEpochAt(sky, at.x, at.y);
    if (ep) {
      showEpoch(ep.e.start, ep.e.end);
      return;
    }
    // выноска точки сравнения линий — синопсис участка; знак-спутница у развилки — карточка лица (E6; U2)
    const note = lineNoteHits(sky).find((r) => at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h);
    if (note) {
      if (note.kind === 'synopsis') {
        synopsisAt.value = note.id;
        panel.value = 'synopsis';
      } else goTo(note.id);
      return;
    }
    // ярусы эпох: лицо — выбрать (и перелёт, если его нет на экране), эпоха и событие — показать их годы (IX-28)
    if (epochMode.value && at.y >= FRAME_H && at.y < sky.openTop) {
      const t = tierAt(at.x, at.y);
      if (!t) return;
      const b = t.bar;
      if (b.kind === 'person') {
        if (pins.value.length) pins.value = [];
        // касание отрезка царя — тоже касание неба: лист карточки — на шапке
        if (b.id !== selected.value && !pickMode.value) openSheetAt('peek');
        goTo(b.id);
      } else {
        const span = Math.max(40, b.t1 - b.t0);
        const pad = Math.max(10, span * 0.06);
        showYears(b.kind === 'event' ? b.t0 - 40 : b.t0 - pad, b.kind === 'event' ? b.t0 + 40 : b.t1 + pad, true);
      }
      return;
    }
    // ромб союза (решение 76): карточка у ромба, раскрытие — её командой; без карточки у ромба (выбор второго лица) —
    // раскрыть или свернуть союз, как прежде
    const pressDot = (h: PlateHit) => {
      if (dotsOn.peek()) openDot({ kind: 'union', uid: h.uid, from: h.from });
      else pressPlate(h.uid, h.from);
    };
    // обрывок наружу показа (§ 7): карточка того лица — оно встаёт на небо гостем, небо летит к нему
    const pressStub = (h: PlanStubHit) => {
      goTo(h.to, 'sky');
      if (dotsOn.peek()) openDot({ kind: 'person', id: h.to }, { grace: 1500 });
    };
    const rect = canvas.getBoundingClientRect();
    const vp = sky.cam.vp;
    const whichAt = { x: rect.left + at.x, y: rect.top + at.y, bounds: { left: rect.left + vp.l, top: rect.top + sky.openTop, right: rect.left + vp.r, bottom: rect.top + vp.b }, back: canvas };
    if (touch) {
      // палец в плотном месте: не наугад — единственная вероятная звезда, список «Какое лицо?» или приближение (H5)
      const cam = sky.cam;
      const canZoom = cam.clampKx(cam.kx * KEY_STEP, cam.wx(at.x)) > cam.kx * 1.2;
      const c = tapChoice(tapCandidates(sky, at.x, at.y, TOUCH_R), canZoom);
      // что сделало касание — для проверок приёмки (tools/accept/phone.ts)
      canvas.dataset.tap = c.kind;
      // звезда под самым пальцем важнее связей (§ 8: звезда > ◆ > «+N» > линии)
      const tight = c.kind !== 'none' && c.kind !== 'zoom' ? sky.hitStar(at.x, at.y, STAR_FIRST + 2) : null;
      if (tight && c.kind === 'pick') {
        // палец на самой линии у звезды (зубец к ребёнку короче поля звезды, § 8): не наугад — «лицо или связь» списком.
        // Только на масштабе, где линии связей видны в полную силу: на обзоре они бледные или их нет (пальцу не видно, что
        // рядом линия), и касание у звезды с дрожанием выбирает звезду (MOB-09; звезда > линия, § 8)
        const clear = (sky.linkFrame()?.alpha ?? 0) > 0.5;
        const onLine = pickMode.value || !clear ? [] : linksNear(sky, at.x, at.y, 6);
        if (onLine.length && tight.d > glyphR(sky, tight.id) + 2) {
          canvas.dataset.tap = 'links';
          openWhich({
            ids: [c.id],
            links: onLine.slice(0, ASK_MAX - 1).map((h) => ({ ks: h.ks, text: linkTitle(h.key), sub: linkRefs(h.key).slice(0, 2).map(refShort).join('; ') })),
            ...whichAt,
            onPick: chooseStar,
            onPickLink: (ks) => {
              const h = onLine.find((q) => q.ks === ks);
              if (h) chooseLink(sky, h.key, h.x, h.y);
            },
          });
          return;
        }
        chooseStar(c.id);
        return;
      }
      if (tight && c.kind === 'ask') {
        openWhich({ ids: c.ids, ...whichAt, onPick: chooseStar });
        return;
      }
      // ромб, «+N» и обрывок наружу — поля не меньше 44 × 44
      const plate = plateAt(sky, at.x, at.y, true);
      if (plate) return pressDot(plate);
      const count = countAt(sky, at.x, at.y, true);
      if (count) {
        if (!pickMode.value) toggleKids(count.uid, count.from);
        return;
      }
      const stub = stubAt(sky, at.x, at.y, true);
      if (stub) return pressStub(stub);
      // связи у пальца (§ 8): одна — она, несколько на близких расстояниях — «Какая связь?»
      const lc = pickMode.value ? { kind: 'none' as const } : linkChoice(linksNear(sky, at.x, at.y));
      if (lc.kind === 'pick') {
        canvas.dataset.tap = 'link';
        chooseLink(sky, lc.hit.key, lc.hit.x, lc.hit.y);
        return;
      }
      if (lc.kind === 'ask') {
        canvas.dataset.tap = 'links';
        openWhich({
          ids: [],
          links: lc.hits.map((h) => ({ ks: h.ks, text: linkTitle(h.key), sub: linkRefs(h.key).slice(0, 2).map(refShort).join('; ') })),
          ...whichAt,
          onPick: chooseStar,
          onPickLink: (ks) => {
            const h = lc.hits.find((q) => q.ks === ks);
            if (h) chooseLink(sky, h.key, h.x, h.y);
          },
        });
        return;
      }
      if (c.kind === 'zoom') {
        zoomBy(KEY_STEP, at, KEY_MS);
        return;
      }
      if (c.kind === 'ask') {
        openWhich({ ids: c.ids, ...whichAt, onPick: chooseStar });
        return;
      }
      // одна звезда — она; ни одной — ближайший след под пальцем
      const hit = c.kind === 'pick' ? c.id : sky.hitTrail(at.x, at.y);
      if (hit) {
        chooseStar(hit);
        return;
      }
    } else {
      const u = underPointer(sky, at.x, at.y, 12);
      if (u?.kind === 'star' || u?.kind === 'trail') {
        // в режиме «Родство с…» или «Разворот с…» щелчок выбирает второе лицо, первое остаётся
        chooseStar(u.id);
        return;
      }
      if (u?.kind === 'plate') return pressDot(u.plate);
      if (u?.kind === 'count') {
        if (!pickMode.value) toggleKids(u.count.uid, u.count.from);
        return;
      }
      if (u?.kind === 'stub') return pressStub(u.stub);
      // линия связи или шаг ленты (§ 8): выбрать связь; выбор лица не меняется. В режиме выбора второго лица — ничего
      if (u?.kind === 'link' || u?.kind === 'ribbon') {
        if (!pickMode.value) chooseLink(sky, u.kind === 'link' ? u.hit.key : ribbonKey(u.hit), u.kind === 'link' ? u.hit.x : at.x, u.kind === 'link' ? u.hit.y : at.y);
        return;
      }
    }
    // пустое небо: снять выбор (IX-09); «назад» в браузере его вернёт (D8). В режиме выбора второго лица — ничего.
    if (pickMode.value || at.y < RULER) return;
    // выбрана связь — первый щелчок снимает её (§ 8), второй — карточку у звезды и выбор лица
    if (selectedLink.peek()) {
      selectedLink.value = null;
      return;
    }
    // открыта карточка у точки — щелчок по пустому небу закрывает только её: одно видимое состояние за раз (D5)
    if (dotCard.peek()) {
      closeDot();
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => {
      if (pins.value.length) {
        pins.value = [];
        pinsQuery.value = '';
      }
      if (selected.value) selected.value = null;
    }, 260);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    // deltaMode читается первым: Firefox тогда отдаёт колесо мыши строками, а не пикселями
    const mode = e.deltaMode;
    const sample: WheelSample = { deltaMode: mode, deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, t: performance.now() };
    const kind = classifyWheel(sample, lastWheel);
    lastWheel = { t: sample.t, kind };
    const dx = wheelPixels(e.deltaX, mode, sky.cam.h);
    const dy = wheelPixels(e.deltaY, mode, sky.cam.h);
    clearTimeout(clearTimer);
    const along = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    if (kind === 'pinch') {
      // щипок — непрерывно, за пальцами; с Shift — только время (решение 47)
      stopZoom();
      stopFlight();
      if (e.shiftKey) sky.cam.stretchAt('time', p.x, p.y, Math.exp(-dy * 0.01));
      else sky.cam.zoomAt(p.x, p.y, Math.exp(-dy * 0.01));
    } else if (kind === 'trackpad') {
      // два пальца — сдвиг 1 : 1 по обеим осям
      stopZoom();
      stopFlight();
      if (e.shiftKey && dx === 0) sky.cam.pan(-dy, 0);
      else sky.cam.pan(-dx, -dy);
    } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Shift + колесо — сдвиг по времени, как горизонтальная прокрутка в браузерах (решение 47): вниз — к поздним годам;
      // шаги подряд складываются (panStep, как у стрелок)
      stopZoom();
      if (along) panStep(-along, 0);
    } else if (e.shiftKey || e.altKey) {
      // Ctrl + Shift + колесо — растянуть или сжать только время (решение 47), Alt + колесо — только высота строк (J1)
      stopFlight();
      const n = wheelNotches(along);
      const axis: Axis = e.shiftKey ? 'time' : 'lanes';
      if (n > 0) wheelStretch(axis, Math.pow(axis === 'time' ? WHEEL_STEP : LANES_WHEEL, -Math.sign(along) * n), p.x, p.y);
    } else {
      // колесо мыши — масштаб у курсора: щелчок ×1,5 за 180 мс, щелчки накапливаются
      const n = wheelNotches(along);
      if (n > 0) wheelZoom(Math.pow(WHEEL_STEP, -Math.sign(along) * n), p.x, p.y);
    }
    request();
  };
  const onDbl = (e: MouseEvent) => {
    clearTimeout(clearTimer);
    const p = local(e);
    stopZoom();
    // двойной щелчок по буквам строк — пропорции по умолчанию (UX-53)
    if (edgeAxis(p.x, p.y, sky.letterW, sky.cam.vp.b) === 'lanes') {
      resetProportions();
      return;
    }
    // двойной щелчок — ×2 у точки, Shift — ×0,5 (IX-02)
    zoomBy(e.shiftKey ? 1 / KEY_STEP : KEY_STEP, p, KEY_MS);
  };
  // правая кнопка мыши (и долгое касание, если браузер шлёт contextmenu) — меню неба вместо меню браузера
  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    // меню уже открыто клавишей у звезды с фокусом: contextmenu браузера следом за клавишей его не переставляет
    if (performance.now() - keyMenuAt < 800) return;
    const p = local(e);
    if (!menuAt(p.x, p.y, 12)) skyMenu.value = null;
  };
  const onLeave = () => {
    pointer = null;
    canvas.classList.remove('stretch-x', 'stretch-y');
    hovered.value = null;
    setPlate(null);
    setLink(null);
    const r1 = setRibbonHover(sky, null);
    const r2 = setFamilyHover(sky, null);
    if (r1 || r2) request();
    hoverYear(null);
    setTierHot(null);
    setHot(false);
    showTip(null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });

  return {
    watchCamera,
    wheel: onWheel,
    dispose() {
      closeWhich();
      clearTimeout(calm);
      clearTimeout(clearTimer);
      stopZoom();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('touchend', onTouchEnd);
      clearTimeout(longTimer);
    },
  };
}
