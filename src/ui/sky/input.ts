/**
 * Ввод неба: указатель (протяжка, щипок, колесо и тачпад, двойной щелчок, наведение и подсказка).
 * Масштаб по двум осям (J1): протяжка по линейке лет — время, по буквам полос — полосы; колесо мыши с Shift — время,
 * с Alt — полосы; щипок по горизонтали — время, по вертикали — полосы, наискосок — обычный масштаб.
 * Клавиши неба — в src/ui/sky/skykeys.ts.
 */
import { FRAME_H, type Rect, type Sky } from '../../render/sky.ts';
import { byId } from '../../data/atlas.ts';
import { selected, hovered, epochMode, layers, panel, pins, pinsQuery, pickMode, pickSecond, synopsisAt } from '../../state.ts';
import { lineNoteHits, ribbonAt, setRibbonHover } from '../../render/ribbons.ts';
import { goTo, skyRef } from '../common.tsx';
import { tierAt, tierHot, type TierHit } from '../../render/tiers.ts';
import { showYears, stopFlight, stretchBy, zoomBy } from './view.ts';
import type { Axis } from '../../render/camera.ts';
import { hoverYear } from './meridian.ts';
import { openSheetAt } from '../sheet.ts';
import { closeWhich, openWhich, whichOpen } from './Which.tsx';
import type { Tip } from './Tip.tsx';
import { foldDescOf, foldGroupOf } from '../work.ts';
import { skyMenu } from '../panels/Work.tsx';

export type { Tip };

/** Линейка лет вверху неба: над ней — меридиан года (D13). */
const RULER = 26;

export interface PointerInput {
  /** Небо сдвинулось? Подсказка прежнего лица прячется, попадание проверяется заново, когда небо остановится. extra — масштаб времени и модель. */
  watchCamera(extra: string): void;
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
 * иначе — выбор, и на телефоне лист карточки открывается на шапке 104 px (решение владельца 12).
 */
function chooseStar(id: string) {
  if (pins.value.length) pins.value = [];
  if (pickSecond(id)) return;
  if (id !== selected.value) openSheetAt('peek');
  selected.value = id;
}

export function attachPointer(sky: Sky, canvas: HTMLCanvasElement, request: () => void, setTip: (t: Tip | null) => void): PointerInput {
  const pointers = new Map<number, { x: number; y: number }>();
  // axis — нажали на линейку лет или на буквы полос: протяжка растягивает ось, а не сдвигает небо (J1)
  let drag: { x0: number; y0: number; x: number; y: number; moved: boolean; t: number; type: string; long?: boolean; axis: Axis | null } | null = null;
  // долгое касание звезды или названия созвездия — меню неба (J3, J5): «Взять в работу», «Свернуть потомков»
  let longTimer = 0;
  /** Меню неба у точки (px холста): у названия созвездия — «Свернуть созвездие», у звезды — выбор объёма и свёртка. */
  const menuAt = (x: number, y: number, r: number): boolean => {
    const g = sky.groupHits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const id = g ? null : sky.hit(x, y, r);
    if (!g && !id) return false;
    showTip(null);
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
  let tipKey = '';
  const showTip = (t: Tip | null) => {
    if (!t && !tipShown) return;
    const k = !t ? '' : t.kind === 'star' ? `s:${t.id}` : `t:${t.hit.bar.key}`;
    // та же звезда или тот же отрезок — подсказка стоит, а не переставляется за указателем
    if (k && k === tipKey) return;
    tipKey = k;
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
  /** Что под указателем (px холста): отрезок яруса или звезда; обновляет наведение, подсказку и курсор. */
  const probe = (x: number, y: number, r: number) => {
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
    const fold = sky.foldHits.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const edge = fold || sky.edgeHits.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    // выноски точек сравнения линий — ссылки (E6; src/render/ribbons.ts)
    const note = !edge && lineNoteHits(sky).some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const hit = edge || note ? null : sky.hit(x, y, r);
    if (hit !== hovered.value) hovered.value = hit;
    // лента под указателем: подсвечивается, у указателя — шаг со стихом, идёт ток света (E6; MAP-28)
    if (setRibbonHover(sky, hit || edge || note || !layers.value.ribbons ? null : ribbonAt(sky, x, y))) request();
    setHot(!!hit || edge || note);
    showTip(hit ? { kind: 'star', id: hit, x, y } : null);
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
    setTierHot(null);
    clearTimeout(calm);
    calm = window.setTimeout(rehit, 120);
  };
  const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    // нажатие прерывает перелёт и шаг масштаба (D4): stopFlight и упор камеры — в SkyView
    stopZoom();
    if (whichOpen()) closeWhich();
    clearTimeout(clearTimer);
    const p = local(e);
    pointers.set(e.pointerId, p);
    // нажатие снимает меридиан: во время протяжки его нет (D13)
    hoverYear(null);
    if (pointers.size === 1)
      drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, t: performance.now(), type: e.pointerType, axis: edgeAxis(p.x, p.y, sky.letterW, sky.cam.vp.b) };
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
      // протяжка начинается за порогом щелчка своего указателя; небо сдвигается от точки нажатия, без скачка
      if (drag.moved || Math.hypot(p.x - drag.x0, p.y - drag.y0) > (CLICK_SLOP[drag.type] ?? 5)) {
        drag.moved = true;
        clearTimeout(longTimer);
        canvas.classList.add('dragging');
        setHot(false);
        // по линейке лет — растянуть время вокруг точки нажатия, по буквам полос — полосы (J1); иначе — сдвиг
        if (drag.axis === 'time') sky.cam.stretchAt('time', drag.x0, (sky.cam.vp.t + sky.cam.vp.b) / 2, Math.pow(2, (p.x - drag.x) / STRETCH_PX.time));
        else if (drag.axis === 'lanes') sky.cam.stretchAt('lanes', drag.x0, drag.y0, Math.pow(2, (p.y - drag.y) / STRETCH_PX.lanes));
        else sky.cam.pan(p.x - drag.x, p.y - drag.y);
        drag.x = p.x;
        drag.y = p.y;
        showTip(null);
        request();
      }
      return;
    }
    // над линейкой лет и буквами полос курсор говорит, что их можно тянуть (J1)
    const zone = e.pointerType === 'touch' ? null : edgeAxis(p.x, p.y, sky.letterW, sky.cam.vp.b);
    canvas.classList.toggle('stretch-x', zone === 'time');
    canvas.classList.toggle('stretch-y', zone === 'lanes');
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
    // долгое касание открыло меню — это не щелчок
    if (d?.long) return;
    if (pointer) {
      clearTimeout(calm);
      calm = window.setTimeout(rehit, 120);
    }
    if (!d || e.type === 'pointercancel' || !isClick(Math.hypot(p.x - d.x0, p.y - d.y0), performance.now() - d.t, d.type)) return;
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
      else foldGroupOf(fold.id, false);
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
    let hit: string | null = null;
    if (touch) {
      // палец в плотном месте: не наугад — единственная вероятная звезда, список «Какое лицо?» или приближение (H5)
      const cam = sky.cam;
      const canZoom = cam.clampKx(cam.kx * KEY_STEP, cam.wx(at.x)) > cam.kx * 1.2;
      const c = tapChoice(tapCandidates(sky, at.x, at.y, TOUCH_R), canZoom);
      // что сделало касание — для проверок приёмки (tools/accept/phone.ts)
      canvas.dataset.tap = c.kind;
      if (c.kind === 'zoom') {
        zoomBy(KEY_STEP, at, KEY_MS);
        return;
      }
      if (c.kind === 'ask') {
        const b = canvas.getBoundingClientRect();
        const vp = sky.cam.vp;
        openWhich({
          ids: c.ids,
          x: b.left + at.x,
          y: b.top + at.y,
          bounds: { left: b.left + vp.l, top: b.top + sky.openTop, right: b.left + vp.r, bottom: b.top + vp.b },
          onPick: chooseStar,
          back: canvas,
        });
        return;
      }
      // одна звезда — она; ни одной — ближайший след под пальцем
      hit = c.kind === 'pick' ? c.id : sky.hit(at.x, at.y, TOUCH_R);
    } else hit = sky.hit(at.x, at.y, 12);
    if (hit) {
      // в режиме «Родство с…» или «Разворот с…» щелчок выбирает второе лицо, первое остаётся
      chooseStar(hit);
      return;
    }
    // пустое небо: снять выбор (IX-09); «назад» в браузере его вернёт (D8). В режиме выбора второго лица — ничего.
    if (pickMode.value || at.y < RULER) return;
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
    if (kind === 'pinch') {
      // щипок — непрерывно, за пальцами
      stopZoom();
      stopFlight();
      sky.cam.zoomAt(p.x, p.y, Math.exp(-dy * 0.01));
    } else if (kind === 'trackpad') {
      // два пальца — сдвиг 1 : 1 по обеим осям
      stopZoom();
      stopFlight();
      if (e.shiftKey && dx === 0) sky.cam.pan(-dy, 0);
      else sky.cam.pan(-dx, -dy);
    } else if (e.shiftKey || e.altKey) {
      // Shift + колесо — растянуть или сжать только время, Alt + колесо — только полосы (J1); сдвиг у мыши — протяжкой
      stopFlight();
      const along = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      const n = wheelNotches(along);
      const axis: Axis = e.shiftKey ? 'time' : 'lanes';
      if (n > 0) wheelStretch(axis, Math.pow(axis === 'time' ? WHEEL_STEP : LANES_WHEEL, -Math.sign(along) * n), p.x, p.y);
    } else {
      // колесо мыши — масштаб у курсора: щелчок ×1,5 за 180 мс, щелчки накапливаются
      const along = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      const n = wheelNotches(along);
      if (n > 0) wheelZoom(Math.pow(WHEEL_STEP, -Math.sign(along) * n), p.x, p.y);
    }
    request();
  };
  const onDbl = (e: MouseEvent) => {
    clearTimeout(clearTimer);
    const p = local(e);
    // двойной щелчок — ×2 у точки, Shift — ×0,5 (IX-02)
    stopZoom();
    zoomBy(e.shiftKey ? 1 / KEY_STEP : KEY_STEP, p, KEY_MS);
  };
  // правая кнопка мыши (и долгое касание, если браузер шлёт contextmenu) — меню неба вместо меню браузера
  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    const p = local(e);
    if (!menuAt(p.x, p.y, 12)) skyMenu.value = null;
  };
  const onLeave = () => {
    pointer = null;
    canvas.classList.remove('stretch-x', 'stretch-y');
    hovered.value = null;
    if (setRibbonHover(sky, null)) request();
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

  return {
    watchCamera,
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
      clearTimeout(longTimer);
    },
  };
}
