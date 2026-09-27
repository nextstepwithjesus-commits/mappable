/**
 * Ввод неба: указатель (протяжка, щипок, колесо и тачпад, двойной щелчок, наведение и подсказка) и клавиши неба.
 * Клавиши — по физическим клавишам (KeyboardEvent.code), поэтому работают и на русской раскладке; слушает их window
 * (src/ui/keys.ts), а не холст: небо отвечает и без фокуса на холсте (IX-38).
 */
import { FRAME_H, type Sky } from '../../render/sky.ts';
import { byId, graph, lineMembership } from '../../data/atlas.ts';
import { selected, hovered, panel, epochMode, pins, pinsQuery, pickMode, pickSecond } from '../../state.ts';
import { goTo, skyRef } from '../common.tsx';
import { tierAt, tierHot, type TierHit } from '../../render/tiers.ts';
import { showAll, showYears, stopFlight, zoomBy } from './view.ts';
import { hoverYear } from './meridian.ts';
import type { Tip } from './Tip.tsx';

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

/** Прервать накопление шагов колеса (нажатие, протяжка, клавиши). */
export function stopZoom() {
  wheelStep = null;
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

/** Порог щелчка по типу указателя: мышь 5 px, перо 6, палец 10 (IX-10, MOB-09). */
export const CLICK_SLOP: Record<string, number> = { mouse: 5, pen: 6, touch: 10 };
/** Быстрое отпускание (до 250 мс) со смещением до 8 px — тоже щелчок, даже если небо чуть сдвинулось. */
export function isClick(dist: number, ms: number, type: string): boolean {
  return dist <= (CLICK_SLOP[type] ?? 5) || (ms < 250 && dist < 8);
}

export function attachPointer(sky: Sky, canvas: HTMLCanvasElement, request: () => void, setTip: (t: Tip | null) => void): PointerInput {
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x0: number; y0: number; x: number; y: number; moved: boolean; t: number; type: string } | null = null;
  let pinch: { d: number; cx: number; cy: number } | null = null;
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
    const edge = sky.edgeHits.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    const hit = edge ? null : sky.hit(x, y, r);
    if (hit !== hovered.value) hovered.value = hit;
    setHot(!!hit || edge);
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
    const key = `${c.x0} ${c.kx} ${c.laneTop} ${c.w} ${c.h} ${extra}`;
    if (key === camWas) return;
    const initial = !camWas;
    camWas = key;
    if (initial) return;
    showTip(null);
    if (hovered.value) hovered.value = null;
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
    clearTimeout(clearTimer);
    const p = local(e);
    pointers.set(e.pointerId, p);
    // нажатие снимает меридиан: во время протяжки его нет (D13)
    hoverYear(null);
    if (pointers.size === 1) drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, t: performance.now(), type: e.pointerType };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null;
    }
  };
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
      sky.cam.zoomAt(cx, cy, d / pinch.d);
      pinch = { d, cx, cy };
      request();
      return;
    }
    if (drag) {
      // протяжка начинается за порогом щелчка своего указателя; небо сдвигается от точки нажатия, без скачка
      if (drag.moved || Math.hypot(p.x - drag.x0, p.y - drag.y0) > (CLICK_SLOP[drag.type] ?? 5)) {
        drag.moved = true;
        canvas.classList.add('dragging');
        setHot(false);
        sky.cam.pan(p.x - drag.x, p.y - drag.y);
        drag.x = p.x;
        drag.y = p.y;
        showTip(null);
        request();
      }
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
    probe(p.x, p.y, e.pointerType === 'touch' ? 22 : 12);
  };
  const onUp = (e: PointerEvent) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size < 2) pinch = null;
    const d = drag;
    drag = null;
    if (pointer) {
      clearTimeout(calm);
      calm = window.setTimeout(rehit, 120);
    }
    if (!d || e.type === 'pointercancel' || !isClick(Math.hypot(p.x - d.x0, p.y - d.y0), performance.now() - d.t, d.type)) return;
    // щелчок — там, где нажали: дрожание при отпускании не уводит к соседней звезде
    const at = { x: d.x0, y: d.y0 };
    const edge = sky.edgeHits.find((r) => at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h);
    if (edge) {
      goTo(edge.id);
      return;
    }
    // ярусы эпох: лицо — выбрать (и перелёт, если его нет на экране), эпоха и событие — показать их годы (IX-28)
    if (epochMode.value && at.y >= FRAME_H && at.y < sky.openTop) {
      const t = tierAt(at.x, at.y);
      if (!t) return;
      const b = t.bar;
      if (b.kind === 'person') {
        if (pins.value.length) pins.value = [];
        goTo(b.id);
      } else {
        const span = Math.max(40, b.t1 - b.t0);
        const pad = Math.max(10, span * 0.06);
        showYears(b.kind === 'event' ? b.t0 - 40 : b.t0 - pad, b.kind === 'event' ? b.t0 + 40 : b.t1 + pad, true);
      }
      return;
    }
    const hit = sky.hit(at.x, at.y, d.type === 'touch' ? 22 : 12);
    if (hit) {
      if (pins.value.length) pins.value = [];
      // в режиме «Родство с…» или «Разворот с…» щелчок выбирает второе лицо, первое остаётся
      if (!pickSecond(hit)) selected.value = hit;
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
      // Shift + колесо — сдвиг по времени, Alt + колесо — по полосам
      stopZoom();
      stopFlight();
      const along = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (e.shiftKey) sky.cam.pan(-along, 0);
      else sky.cam.pan(0, -along);
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
  const onLeave = () => {
    pointer = null;
    hovered.value = null;
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

  return {
    watchCamera,
    dispose() {
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
    },
  };
}

// ---------- клавиши неба ----------

/**
 * Путь подъёма по «[»: лица, от которых поднимались к родителю. «]» возвращает к последнему из них,
 * если стоим на его родителе (IX-40); иначе путь забывается.
 */
let climb: string[] = [];

/** Ребёнок для «]»: откуда пришли по «[»; иначе ребёнок на линии Мессии; иначе самый значимый. */
export function childFor(id: string, path: string[]): { to: string | null; path: string[] } {
  const p = [...path];
  const last = p[p.length - 1];
  const lp = last ? byId.get(last) : undefined;
  if (lp && (lp.father === id || lp.mother === id)) {
    p.pop();
    return { to: last, path: p };
  }
  const kids = (graph.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
  const onLine = kids.find((k) => lineMembership.joseph.has(k) || lineMembership.mary.has(k));
  const best = onLine ?? [...kids].sort((a, b) => (byId.get(a)?.magnitude ?? 9) - (byId.get(b)?.magnitude ?? 9))[0];
  return { to: best ?? null, path: [] };
}

/**
 * Клавиши неба (на window, кроме полей ввода; вызывает src/ui/keys.ts). Возвращает true, если клавиша обработана.
 * nav — можно ли стрелкам и Home вести небо (фокус не в прокручиваемой панели или карточке).
 */
export function skyKeys(e: KeyboardEvent, nav: boolean, onCanvas: boolean): boolean {
  const sky = skyRef.current;
  if (!sky) return false;
  const id = selected.value;
  const go = (to: string | null | undefined) => {
    if (to && byId.has(to)) goTo(to);
  };
  switch (e.code) {
    case 'Equal':
    case 'NumpadAdd':
      // ×2 за 250 мс у выбранного лица, если оно на виду, иначе у середины видимой части (IX-02)
      stopZoom();
      zoomBy(KEY_STEP, undefined, KEY_MS);
      break;
    case 'Minus':
    case 'NumpadSubtract':
      stopZoom();
      zoomBy(1 / KEY_STEP, undefined, KEY_MS);
      break;
    case 'Digit0':
    case 'Numpad0':
      showAll();
      break;
    case 'Home':
      if (!nav) return false;
      showAll();
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!nav) return false;
      stopFlight();
      stopZoom();
      const k = e.shiftKey ? 3 : 1;
      if (e.code === 'ArrowLeft') sky.cam.pan(120 * k, 0);
      else if (e.code === 'ArrowRight') sky.cam.pan(-120 * k, 0);
      else if (e.code === 'ArrowUp') sky.cam.pan(0, 90 * k);
      else sky.cam.pan(0, -90 * k);
      break;
    }
    case 'BracketLeft': {
      if (!id) return false;
      const par = byId.get(id)?.father ?? byId.get(id)?.mother;
      if (!par) return false;
      climb = [...climb, id].slice(-200);
      go(par);
      break;
    }
    case 'BracketRight': {
      if (!id) return false;
      const r = childFor(id, climb);
      climb = r.path;
      go(r.to);
      break;
    }
    case 'Comma':
    case 'Period': {
      if (!id) return false;
      const par = byId.get(id)?.father ?? byId.get(id)?.mother;
      if (!par) return false;
      const sibs = (graph.childrenOf.get(par) ?? []).filter((x) => x.kind === 'father' || x.kind === 'mother').map((x) => x.child);
      const i = sibs.indexOf(id);
      climb = [];
      go(sibs[(i + (e.code === 'Comma' ? -1 : 1) + sibs.length) % sibs.length]);
      break;
    }
    case 'KeyE':
      epochMode.value = !epochMode.value;
      break;
    case 'KeyL':
      panel.value = panel.value === 'legend' ? null : 'legend';
      break;
    case 'Enter':
    case 'NumpadEnter':
      // Enter — только на самом холсте: у кнопок свои Enter и пробел (MOB-29)
      if (!onCanvas || !hovered.value) return false;
      if (!pickSecond(hovered.value)) selected.value = hovered.value;
      break;
    default:
      return false;
  }
  e.preventDefault();
  skyRef.redraw();
  return true;
}
