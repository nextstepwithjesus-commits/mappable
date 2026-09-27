/**
 * Движение неба — одно место для всех переходов (D4; IX-11, IX-31, MOB-40): перелёт к лицу, к окну лет, «Всё небо»,
 * шаг масштаба, возврат выбранного лица в видимую часть. Всё учитывает prefers-reduced-motion и видимую часть неба
 * (без панели, ярусов эпох, листа карточки и вступления — её держит камера, src/render/camera.ts).
 *
 * Для агента ввода (src/ui/sky/input.ts, src/ui/TimeStrip.tsx, src/ui/keys.ts):
 *  — stopFlight() — прервать перелёт или любую анимацию камеры: нажатие на полосе времени, клавиша;
 *    нажатие на холсте прерывает перелёт само (SkyView);
 *  — showAll() — «Всё небо» (кнопка, клавиши 0 и Home, щелчок по «Толедот», двойной щелчок по полосе);
 *  — showYears(a, b, animate) — окно лет: щелчок по эпохе на полосе — перелёт (animate = true), протяжка рамки — сразу;
 *  — zoomBy(f, at?, ms?) — шаг масштаба с анимацией (кнопки и клавиши ×2 за 250 мс, колесо ×1,5 за 180 мс);
 *  — openGuide(), openLegend('keys') — «Как читать карту» и таблица клавиш (клавиша «?»).
 */
import { effect, signal } from '@preact/signals';
import { skyRef } from '../common.tsx';
import { model, panel, selected } from '../../state.ts';
import type { ViewState } from '../../render/camera.ts';
import type { Rect } from '../../render/sky.ts';

export const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------- вступление ----------
/**
 * Вступительная табличка открыта (C5; UX-03, VIS-24, MOB-07). Закрывается только явным действием: «×», вход
 * (Адам … Иисус Христос) или выбор лица; свёрнутая оставляет в углу неба команду «Как читать карту».
 * Своё хранилище, чтобы сдвиг или колесо, которые прежде «заканчивали вступление», его не закрывали.
 * Прежняя отметка «toledot:intro» (вернувшийся читатель) — начальное значение.
 */
const INTRO_KEY = 'toledot:cartouche';
function readIntro(): boolean {
  try {
    const v = localStorage.getItem(INTRO_KEY);
    if (v !== null) return v === 'open';
    return localStorage.getItem('toledot:intro') !== 'true';
  } catch {
    return true;
  }
}
export const introOpen = signal<boolean>(typeof window === 'undefined' ? false : readIntro());
if (typeof window !== 'undefined')
  effect(() => {
    try {
      localStorage.setItem(INTRO_KEY, introOpen.value ? 'open' : 'folded');
    } catch {
      /* хранилище недоступно — табличка просто откроется снова */
    }
  });
/** Открыть «Как читать карту» на небе (вступление). */
export function openGuide() {
  introOpen.value = true;
}
/** Открыть «Условные знаки» на разделе: guide — «Как читать карту» (начало), keys — клавиши. */
export function openLegend(section: 'guide' | 'keys' = 'guide') {
  panel.value = 'legend';
  requestAnimationFrame(() => document.getElementById(`legend-${section}`)?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }));
}

// ---------- резерв органов неба ----------
let reserveRects: Rect[] = [];
/** Прямоугольники неба под органами управления и вступлением (px холста); их обновляет SkyView. */
export function setReserve(r: Rect[]) {
  reserveRects = r;
}
export const reserve = () => reserveRects;

// ---------- перелёты ----------
/** Лицо, к которому идёт перелёт: если во время него поменяется видимая часть (открылась карточка), перелёт пересчитается. */
export let flightTarget: string | null = null;

/** Прервать перелёт и любую анимацию камеры (D4: любое действие читателя). */
export function stopFlight() {
  flightTarget = null;
  skyRef.current?.cam.stop();
}

/** Единая функция перелёта к виду (D4): в пределах камеры, с учётом prefers-reduced-motion. */
export function flyTo(to: ViewState) {
  const s = skyRef.current;
  if (!s || !s.model) return;
  s.cam.flyTo(s.cam.constrain(to), skyRef.redraw, reduced());
  skyRef.redraw();
}

/** Вид с окном лет [a, b] (астр.) по ширине видимой части; середина видимой части по вертикали остаётся. */
export function viewForYears(a: number, b: number): ViewState | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const xa = s.xOf(Math.min(a, b));
  const xb = s.xOf(Math.max(a, b));
  if (!(xb > xa)) return null;
  const cam = s.cam;
  const vp = cam.vp;
  const [, cy] = cam.vpCenter();
  const lane = cam.wLane(cy);
  const kx = (vp.r - vp.l) / (xb - xa);
  return { x0: xa - vp.l / kx, kx, laneTop: lane + cy / cam.kyFor(kx) };
}

/** Окно лет [a, b]: щелчок по эпохе (полоса, лист «Эпохи») — перелёт; протяжка рамки полосы — сразу (animate = false). */
export function showYears(a: number, b: number, animate = true) {
  const s = skyRef.current;
  const v = viewForYears(a, b);
  if (!s || !v) return;
  flightTarget = null;
  if (animate) flyTo(v);
  else {
    s.cam.stop();
    s.cam.set(s.cam.constrain(v));
    skyRef.redraw();
  }
}

/** Вид «лицо и несколько поколений вокруг»: лицо — на трети видимой части слева, по вертикали — в середине. */
export function viewForPerson(id: string): ViewState | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const n = s.node(id);
  if (!n) return null;
  const c = model.value.chrono.get(id);
  const life = c ? Math.max(40, (c.d ?? c.dEst) - c.b) : 80;
  const span = Math.max(120, Math.min(900, life * 2.6));
  const x0 = s.xOf(n.t0 - span * 0.35);
  const x1 = s.xOf(n.t0 + span * 0.65);
  const cam = s.cam;
  const vp = cam.vp;
  const kx = (vp.r - vp.l) / Math.max(1e-6, x1 - x0);
  const [, cy] = cam.vpCenter();
  return { x0: x0 - vp.l / kx, kx, laneTop: n.lane + cy / cam.kyFor(kx) };
}

/** Перелёт к лицу (все ссылки на лица, поиск, указатели у края): лицо — в видимой части неба. */
export function flyToPerson(id: string) {
  const s = skyRef.current;
  const v = viewForPerson(id);
  if (!s || !v) return;
  flyTo(v);
  flightTarget = s.cam.moving ? id : null;
}

/** «Всё небо» (D2; UX-05, IX-04, MOB-06): перелёт к виду, в который вписано всё небо по обеим осям. */
export function showAll() {
  const s = skyRef.current;
  if (!s || !s.model) return;
  flightTarget = null;
  s.cam.flyTo(s.fitState(), skyRef.redraw, reduced());
  skyRef.redraw();
}

/**
 * Шаг масштаба (кнопки, клавиши, колесо): f > 1 — приблизить. Точка привязки — at (px холста), иначе выбранное лицо,
 * если оно видно, иначе середина видимой части (IX-02). Кнопки и клавиши — ×2 за 250 мс, колесо — ×1,5 за 180 мс.
 */
export function zoomBy(f: number, at?: { x: number; y: number }, ms = 250) {
  const s = skyRef.current;
  if (!s || !s.model) return;
  flightTarget = null;
  let p = at;
  if (!p) {
    const id = selected.value;
    const q = id ? screenOf(id) : null;
    const vp = s.cam.vp;
    p = q && q.x > vp.l && q.x < vp.r && q.y > vp.t && q.y < vp.b ? q : { x: (vp.l + vp.r) / 2, y: (vp.t + vp.b) / 2 };
  }
  s.cam.zoomStep(p.x, p.y, f, ms, skyRef.redraw, reduced());
}

/** Экранное место звезды лица (px холста). */
export function screenOf(id: string): { x: number; y: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const x = s.nodeX(id);
  const n = s.node(id);
  if (x === null || !n) return null;
  return { x: s.cam.sx(x), y: s.cam.sy(n.lane) };
}

/** Поля, в которых звезда считается «видной»: справа — место для имени (IX-08). */
const MARGIN = { l: 12, r: 80, t: 20, b: 16 };
/** Звезда лица в видимой части и не под органами неба. */
export function inView(id: string): boolean {
  const s = skyRef.current;
  const q = screenOf(id);
  if (!s || !q) return false;
  const vp = s.cam.vp;
  if (q.x < vp.l + MARGIN.l || q.x > vp.r - MARGIN.r || q.y < vp.t + MARGIN.t || q.y > vp.b - MARGIN.b) return false;
  return !reserveRects.some((r) => q.x > r.x - 8 && q.x < r.x + r.w + 8 && q.y > r.y - 8 && q.y < r.y + r.h + 8);
}

/**
 * Выбранное лицо ушло за край видимой части (открылась карточка, панель, ярусы, лист на телефоне) — небо сдвигается
 * за 250 мс так, чтобы оно было видно (D3; IX-08): по горизонтали — на 60 % ширины, если ушло вправо, на 35 % — если влево;
 * по вертикали — в середину, если ушло вверх или вниз. Масштаб не меняется.
 */
export function keepInView(id: string, ms = 250) {
  const s = skyRef.current;
  const q = screenOf(id);
  if (!s || !q || inView(id)) return;
  const cam = s.cam;
  const vp = cam.vp;
  let dx = 0;
  let dy = 0;
  if (q.x < vp.l + MARGIN.l) dx = vp.l + (vp.r - vp.l) * 0.35 - q.x;
  else if (q.x > vp.r - MARGIN.r) dx = vp.l + (vp.r - vp.l) * 0.6 - q.x;
  if (q.y < vp.t + MARGIN.t || q.y > vp.b - MARGIN.b) dy = (vp.t + vp.b) / 2 - q.y;
  // под органами неба — выше блока
  if (!dx && !dy) {
    const r = reserveRects.find((z) => q.x > z.x - 8 && q.x < z.x + z.w + 8 && q.y > z.y - 8 && q.y < z.y + z.h + 8);
    if (r) dy = Math.max(vp.t + MARGIN.t, r.y - 40) - q.y;
  }
  const to = cam.constrain({ x0: cam.x0 - dx / cam.kx, kx: cam.kx, laneTop: cam.laneTop + dy / cam.ky });
  flightTarget = null;
  cam.animateTo(to, ms, skyRef.redraw, reduced());
}
