/**
 * Ввод неба: указатель (протяжка, щипок, колесо, двойной щелчок, наведение и подсказка) и клавиши холста.
 * Клавиши — по физическим клавишам (KeyboardEvent.code), поэтому работают и на русской раскладке.
 */
import type { Sky } from '../../render/sky.ts';
import { byId, graph } from '../../data/atlas.ts';
import { selected, hovered, meridian, panel, introDone, epochMode, pins, pickSecond } from '../../state.ts';
import { skyRef } from '../common.tsx';

export interface Tip {
  id: string;
  x: number;
  y: number;
}

export interface PointerInput {
  /** Небо сдвинулось? Подсказка прежнего лица прячется, попадание проверяется заново, когда небо остановится. extra — масштаб времени и модель. */
  watchCamera(extra: string): void;
  dispose(): void;
}

export function attachPointer(sky: Sky, canvas: HTMLCanvasElement, request: () => void, setTip: (t: Tip | null) => void): PointerInput {
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; moved: boolean } | null = null;
  let pinch: { d: number; cx: number; cy: number } | null = null;
  // где мышь или перо над небом (касание не наводит) — чтобы после движения неба проверить, что под указателем теперь
  let pointer: { x: number; y: number; r: number } | null = null;
  let tipShown = false;
  const showTip = (t: { id: string; x: number; y: number } | null) => {
    if (!t && !tipShown) return;
    tipShown = !!t;
    setTip(t);
  };
  /** Подсказка и наведение — по тому, что под указателем сейчас. */
  const rehit = () => {
    if (!pointer || drag || pinch || pointer.y < 26) return;
    const hit = sky.hit(pointer.x, pointer.y, pointer.r);
    if (hit !== hovered.value) hovered.value = hit;
    showTip(hit ? { id: hit, x: pointer.x, y: pointer.y } : null);
  };
  // Небо сдвинулось (протяжка, колесо, клавиши, перелёт, полоса времени, смена масштаба): подсказка прежнего лица
  // прячется сразу, а попадание проверяется заново, когда небо остановится (IX-07, MAP-39).
  let camKey = '';
  let calm = 0;
  const watchCamera = (extra: string) => {
    const c = sky.cam;
    const key = `${c.x0} ${c.kx} ${c.laneTop} ${c.w} ${c.h} ${extra}`;
    if (key === camKey) return;
    const initial = !camKey;
    camKey = key;
    if (initial) return;
    showTip(null);
    if (hovered.value) hovered.value = null;
    clearTimeout(calm);
    calm = window.setTimeout(rehit, 120);
  };
  const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) drag = { x: p.x, y: p.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null;
    }
    introDone.value = true;
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
      const dx = p.x - drag.x;
      const dy = p.y - drag.y;
      if (drag.moved || Math.abs(dx) + Math.abs(dy) > 3) {
        drag.moved = true;
        canvas.classList.add('dragging');
        sky.cam.pan(dx, dy);
        drag.x = p.x;
        drag.y = p.y;
        showTip(null);
        request();
      }
      return;
    }
    if (p.y < 26) {
      meridian.value = sky.tOf(sky.cam.wx(p.x));
      showTip(null);
      return;
    } else if (meridian.value !== null && !pointers.size) meridian.value = null;
    const hit = sky.hit(p.x, p.y, e.pointerType === 'touch' ? 22 : 12);
    if (hit !== hovered.value) hovered.value = hit;
    showTip(hit ? { id: hit, x: p.x, y: p.y } : null);
  };
  const onUp = (e: PointerEvent) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size < 2) pinch = null;
    const edge = sky.edgeHits.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (drag && !drag.moved && edge) {
      skyRef.flyTo(edge.id);
      drag = null;
      return;
    }
    if (drag && !drag.moved) {
      if (pins.value.length) pins.value = [];
      const hit = sky.hit(p.x, p.y, e.pointerType === 'touch' ? 22 : 12);
      // в режиме «Родство с…» или «Разворот с…» щелчок выбирает второе лицо, первое остаётся
      if (hit && !pickSecond(hit)) selected.value = hit;
    }
    drag = null;
    if (pointer) {
      clearTimeout(calm);
      calm = window.setTimeout(rehit, 120);
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    if (e.shiftKey) sky.cam.pan(-e.deltaY, 0);
    else if (e.ctrlKey) sky.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.01));
    else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) sky.cam.pan(-e.deltaX, 0);
    else sky.cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016));
    introDone.value = true;
    request();
  };
  const onDbl = (e: MouseEvent) => {
    const p = local(e);
    sky.cam.zoomAt(p.x, p.y, 2);
    request();
  };
  const onLeave = () => {
    pointer = null;
    hovered.value = null;
    meridian.value = null;
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

// клавиатура — по физическим клавишам, поэтому работает и на русской раскладке.
// Только с холста: у кнопок внутри неба (скрытый список лиц, органы неба, строка выбора) свои Enter и пробел (MOB-29).
export function skyKey(e: KeyboardEvent, canvas: HTMLCanvasElement | null): void {
  const sky = skyRef.current;
  if (!sky || e.target !== canvas) return;
  const id = selected.value;
  const go = (to: string | null | undefined) => {
    if (to && byId.has(to)) {
      selected.value = to;
      skyRef.flyTo(to);
    }
  };
  switch (e.code) {
    case 'Equal':
    case 'NumpadAdd':
      sky.cam.zoomAt(sky.cam.w / 2, sky.cam.h / 2, 1.5);
      break;
    case 'Minus':
    case 'NumpadSubtract':
      sky.cam.zoomAt(sky.cam.w / 2, sky.cam.h / 2, 1 / 1.5);
      break;
    case 'ArrowLeft':
      sky.cam.pan(120, 0);
      break;
    case 'ArrowRight':
      sky.cam.pan(-120, 0);
      break;
    case 'ArrowUp':
      sky.cam.pan(0, 90);
      break;
    case 'ArrowDown':
      sky.cam.pan(0, -90);
      break;
    case 'BracketLeft':
      if (id) go(byId.get(id)?.father ?? byId.get(id)?.mother);
      break;
    case 'BracketRight':
      if (id) go((graph.childrenOf.get(id) ?? []).find((e2) => e2.kind === 'father' || e2.kind === 'mother')?.child);
      break;
    case 'Comma':
    case 'Period': {
      if (!id) break;
      const par = byId.get(id)?.father ?? byId.get(id)?.mother;
      if (!par) break;
      const sibs = (graph.childrenOf.get(par) ?? []).filter((x) => x.kind === 'father' || x.kind === 'mother').map((x) => x.child);
      const i = sibs.indexOf(id);
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
      if (hovered.value && !pickSecond(hovered.value)) selected.value = hovered.value;
      break;
    default:
      return;
  }
  e.preventDefault();
  skyRef.redraw();
}
