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
import { model, onlyLines, panel, selected } from '../../state.ts';
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
  // вертикаль камеры — строки (сжатие полос, src/render/rows.ts)
  return { x0: x0 - vp.l / kx, kx, laneTop: s.rowOf(n.lane) + cy / cam.kyFor(kx) };
}

/** Перелёт к лицу (все ссылки на лица, поиск, указатели у края): лицо — в видимой части неба. */
export function flyToPerson(id: string) {
  const s = skyRef.current;
  const v = viewForPerson(id);
  if (!s || !v) return;
  flyTo(v);
  flightTarget = s.cam.moving ? id : null;
}

/**
 * «Всё небо» (D2; UX-05, IX-04, MOB-06): перелёт к виду, в который вписано всё небо по обеим осям.
 * В режиме «только линии Мессии» «всё небо» — это весь коридор линий (E6).
 */
export function showAll() {
  const s = skyRef.current;
  if (!s || !s.model) return;
  flightTarget = null;
  if (onlyLines.peek()) return fitLines(true);
  s.cam.flyTo(s.fitState(), skyRef.redraw, reduced());
  skyRef.redraw();
}

// ---------- несколько лиц: путь родства, группа (E5) ----------

/** Поле для имени справа от звезды, px: окно вписывает и подписи крайних лиц (IX-08). */
const NAME_ROOM = 90;

/**
 * Вид, в который вписаны все лица ids по обеим осям (E5; MAP-18, UX-11): по времени — с полем 10 % и местом для имени
 * справа; по полосам — не выше 80 % видимой части. Высота полосы растёт с масштабом, поэтому, если полосы пути не
 * помещаются, масштаб уменьшается, пока не поместятся. Одно лицо — окно не уже minYears лет.
 */
export function viewForIds(ids: readonly string[], minYears = 60): ViewState | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const pts = ids.map((id) => ({ x: s.nodeX(id), n: s.node(id) })).filter((q): q is { x: number; n: NonNullable<typeof q.n> } => q.x !== null && !!q.n);
  if (!pts.length) return null;
  const cam = s.cam;
  const vp = cam.vp;
  const W = vp.r - vp.l;
  // по вертикали — без широких органов неба у нижнего и верхнего края (блок «Вид», вступление): путь не уходит под них
  let top = vp.t;
  let bottom = vp.b;
  for (const r of reserveRects) {
    if (r.w < W * 0.3) continue;
    if (r.y + r.h >= vp.b - 8 && r.y > (vp.t + vp.b) / 2) bottom = Math.min(bottom, r.y - 8);
    else if (r.y <= vp.t + 8 && r.y + r.h < (vp.t + vp.b) / 2) top = Math.max(top, r.y + r.h + 8);
  }
  const H = Math.max(80, bottom - top);
  const x0 = Math.min(...pts.map((q) => q.x));
  const x1 = Math.max(...pts.map((q) => q.x));
  // по строкам экрана: при сжатии полос (J4, J5) лица набора ближе, чем их полосы
  const l0 = Math.min(...pts.map((q) => s.rowOf(q.n.lane)));
  const l1 = Math.max(...pts.map((q) => s.rowOf(q.n.lane)));
  const tMid = s.tOf((x0 + x1) / 2);
  const span = Math.max(x1 - x0, s.xOf(tMid + minYears / 2) - s.xOf(tMid - minYears / 2));
  const room = Math.max(40, W * 0.8 - NAME_ROOM);
  let kx = room / span;
  // полосы пути — не выше 80 % видимой части: высота полосы следует за масштабом
  const tall = (k: number) => cam.kyFor(k) * (l1 - l0 + 1) > H * 0.8;
  if (tall(kx)) {
    let lo = Math.min(kx, cam.kxLo());
    let hi = kx;
    if (!tall(lo))
      for (let i = 0; i < 40; i++) {
        const mid = Math.sqrt(lo * hi);
        if (tall(mid)) hi = mid;
        else lo = mid;
      }
    kx = lo;
  }
  const [cx] = cam.vpCenter();
  const cy = (top + bottom) / 2;
  // середина окна — середина пути, сдвинутая влево на половину поля для имени
  const xc = (x0 + x1) / 2 + NAME_ROOM / 2 / kx;
  return { x0: xc - cx / kx, kx, laneTop: (l0 + l1) / 2 + cy / cam.kyFor(kx) };
}

/** Все лица ids — в видимой части неба (с полями inView). */
export function allInView(ids: readonly string[]): boolean {
  return ids.every((id) => inView(id));
}

/** Перелёт, вписывающий лица ids (путь родства, лица группы): оба конца пути на экране (E5). */
export function flyToIds(ids: readonly string[]) {
  const v = viewForIds(ids);
  if (!v) return;
  flightTarget = null;
  flyTo(v);
}

// ---------- «только линии Мессии» (E6; MAP-23) ----------

/** Сколько полос не меньше вписывается в 60 % высоты в режиме «только линии» (MAP-23: ±13 полос). */
const FOCUS_MIN = 27;

/** Коридор линий: мировые x рождения первого и последнего лица линий и полосы лиц линий. */
export function linesFrame(): { x0: number; x1: number; lane0: number; lane1: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let lane0 = Infinity;
  let lane1 = -Infinity;
  s.nodes.forEach((n, i) => {
    if (!n.spine || n.ghost) return;
    x0 = Math.min(x0, s.X0[i]);
    x1 = Math.max(x1, s.X0[i]);
    lane0 = Math.min(lane0, s.rowOf(n.lane));
    lane1 = Math.max(lane1, s.rowOf(n.lane));
  });
  return x1 > x0 ? { x0, x1, lane0, lane1 } : null;
}

/**
 * Режим «только линии» вписывает коридор (MAP-23): полосы линий — на 60 % высоты видимой части (выше и ниже —
 * место для выносок точек сравнения), по времени — от Адама до Иисуса Христа с местом для имени справа.
 * animate = false — сразу (первый показ по адресу).
 */
export function fitLines(animate = true) {
  const s = skyRef.current;
  const f = linesFrame();
  if (!s || !f) return;
  const cam = s.cam;
  // полосы коридора — на 60 % высоты, но не выше, чем ±13 полос на ней: косы и следы не раздуваются (MAP-23)
  setFocus(Math.max(FOCUS_MIN, f.lane1 - f.lane0 + 1));
  const vp = cam.vp;
  const kx = Math.max(1e-6, (vp.r - vp.l - 24 - NAME_ROOM * 1.4) / (f.x1 - f.x0));
  const [, cy] = cam.vpCenter();
  const to = cam.constrain({ x0: f.x0 - (vp.l + 24) / kx, kx, laneTop: (f.lane0 + f.lane1) / 2 + cy / cam.kyFor(kx) });
  flightTarget = null;
  if (animate) cam.flyTo(to, skyRef.redraw, reduced());
  else {
    cam.stop();
    cam.set(to);
  }
  skyRef.redraw();
}

/** Высота полосы коридора: полоса в середине видимой части остаётся на месте, меняется только высота. */
function setFocus(lanes: number) {
  const s = skyRef.current;
  if (!s) return;
  const cam = s.cam;
  if (cam.focusLanes === lanes) return;
  const [, cy] = cam.vpCenter();
  const mid = cam.wLane(cy);
  cam.focusLanes = lanes;
  cam.laneTop = mid + cy / cam.ky;
}

// режим «только линии»: включили — коридор вписывается; выключили — обычная высота полосы. Первый показ по адресу —
// сразу, без перелёта (окно адреса, если оно есть, ставится после и остаётся)
if (typeof window !== 'undefined') {
  let shown: boolean | null = null;
  let wait = 0;
  effect(() => {
    const on = onlyLines.value;
    cancelAnimationFrame(wait);
    const apply = (tries: number) => {
      // модуль читается раньше common.tsx (круговой импорт): небо спрашивается только в кадре
      const s = skyRef?.current;
      if (!s || !s.model || !(s.cam.w > 0) || !linesFrame()) {
        if (tries < 240) wait = requestAnimationFrame(() => apply(tries + 1));
        return;
      }
      const first = shown === null;
      if (shown === on) return;
      shown = on;
      if (on) fitLines(!first);
      else if (!first) {
        setFocus(0);
        s.cam.clampNow();
        const id = selected.peek();
        if (id) keepInView(id);
        skyRef.redraw();
      }
    };
    wait = requestAnimationFrame(() => apply(0));
  });
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
