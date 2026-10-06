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
 *  — stretchBy(axis, f, at?, ms?), resetProportions() — масштаб по одной оси и пропорции по умолчанию (J1);
 *  — openGuide(), openLegend('keys') — «Как читать карту» и таблица клавиш (клавиша «?»).
 */
import { effect, signal } from '@preact/signals';
import { skyRef, viewTick } from '../common.tsx';
import { model, onlyLines, panel, pins, second, selected, skyGroup } from '../../state.ts';
import { graph, lines } from '../../data/atlas.ts';
import { KX_MAX, KY_LO, LANES_MAX, LANES_MIN, easeOut, type Axis, type ViewState } from '../../render/camera.ts';
import type { Rect } from '../../render/sky.ts';
import { firstKin } from '../../render/frame.ts';
import { grid } from '../layout.ts';
import { show } from '../work.ts';
import { laneAt, starLaneOf } from '../../engine/stays.ts';

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

/**
 * Перелёт кончился (SkyView, кадр в покое): лица перелёта больше нет. Иначе оно оставалось бы после перелёта, и первая же
 * смена видимой части при движении камеры (панель открылась, лист встал) снова летела бы к нему — уже к прежнему лицу
 * (сценарий 358: «Указатель» и Escape у Соломона уводили небо к окну Давида).
 */
export function flightDone() {
  if (flightTarget && !skyRef.current?.cam.moving) flightTarget = null;
}

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

// ---------- окно на время листа «Показ» (этап 14, решение 147) ----------

/**
 * Лист «Показ» открыт (SkyView): небо, выведшее выбранное лицо из-под листа, — не шаг читателя, адрес такое окно не пишет
 * (src/ui/address.ts): «назад» после сеанса листа возвращает окно до листа (П3). Лист закрылся без смены показа — окно до
 * листа возвращается (SkyView).
 */
export const windowHold = signal(false);
/**
 * Окно неба до листа «Показ» (решение 147): лист, открывшись над выбранным, сдвигает небо вбок — это не шаг читателя.
 * Показ «Линии Мессии», включённый из листа, запоминает для возврата окно до листа (IX-73, сценарий 356), а не сдвинутое.
 */
let heldWin: Win | null = null;
/** Лист «Показ» открылся (SkyView): запомнить окно до него; закрылся — забыть. */
export function holdSheetWindow(on: boolean) {
  heldWin = on ? windowNow() : null;
}

// ---------- прыжок окна — своя запись истории (этап 14, решение 147; U4) ----------

/**
 * Прыжок окна (эпоха на полосе времени, лист «Эпохи», ярусы): src/ui/address.ts пишет окно, к которому он пришёл, новой
 * записью истории, когда небо встанет, — «назад» возвращает прежнее окно. at — когда прыгнули; lastPush — когда адрес
 * последний раз писал новую запись: прыжок, начатый вместе с ней (смена показа и окно разом), — то же намерение.
 */
export const windowJump = { at: -Infinity, lastPush: -Infinity };
/** Отметить прыжок окна (зовут showYears с перелётом и полоса времени). */
export function markJump() {
  if (typeof performance === 'undefined') return;
  const now = performance.now();
  if (now - windowJump.lastPush < 120) return;
  windowJump.at = now;
  jumpCheck = true;
  emptyWindow.value = false;
  watchEmpty();
}
/** Прыжок ещё не записан: адрес берёт его один раз. */
export function takeJump(): boolean {
  const on = performance.now() - windowJump.at < 6000;
  windowJump.at = -Infinity;
  return on;
}

/**
 * После прыжка по эпохе в частичном показе в кадре нет ни одного его лица (решение 147; U5: «Исход» в показе линий —
 * пустое небо): строка показа поясняет «В показе нет лиц этой эпохи — всё небо». Снимается, когда небо сдвинули или
 * сменили показ.
 */
export const emptyWindow = signal(false);
let jumpCheck = false;
let emptyKey = '';
/**
 * Подписка на кадры неба — при первом прыжке, а не при загрузке модуля: common.tsx и view.ts импортируют друг друга,
 * и viewTick при загрузке может ещё не существовать (как у watchAround).
 */
let emptyWatch: (() => void) | null = null;
function watchEmpty() {
  if (emptyWatch || typeof window === 'undefined') return;
  emptyWatch = effect(() => {
    void viewTick.value;
    const s = skyRef?.current;
    if (!s || !s.model) return;
    const c = s.cam;
    const key = `${Math.round(c.x0 * c.kx)} ${c.kx.toFixed(5)} ${Math.round(c.laneTop * c.ky)} ${s.rowsKey}`;
    if (jumpCheck) {
      if (c.moving || s.transitioning || performance.now() - windowJump.at < 150) return;
      jumpCheck = false;
      emptyKey = key;
      const partial = show.peek().kind !== 'all';
      emptyWindow.value = partial && !anyStarInView();
      return;
    }
    if (emptyWindow.peek() && key !== emptyKey) emptyWindow.value = false;
  });
}
/** Есть ли в видимой части хоть одна звезда показа (нарисованная, не призрак). */
function anyStarInView(): boolean {
  const s = skyRef.current;
  if (!s || !s.model) return false;
  const vp = s.cam.vp;
  for (let i = 0; i < s.nodes.length; i++) {
    const n = s.nodes[i];
    if (n.ghost || !s.drawn(i)) continue;
    const x = s.cam.sx(s.X0[i]);
    const x1 = s.cam.sx(s.X1[i]);
    // и след жизни, проходящий через окно: лицо эпохи — тот, кто в ней жил; след — по пребываниям (решение 173): полоса
    // в год середины видимого отрезка следа
    const y = s.cam.sy(laneAt(n, s.tOf(s.cam.wx((Math.max(x, vp.l) + Math.min(x1, vp.r)) / 2))));
    if (x1 >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b) return true;
  }
  return false;
}

/** Окно лет [a, b]: щелчок по эпохе (полоса, лист «Эпохи») — перелёт; протяжка рамки полосы — сразу (animate = false). */
export function showYears(a: number, b: number, animate = true) {
  const s = skyRef.current;
  const v = viewForYears(a, b);
  if (!s || !v) return;
  flightTarget = null;
  // перелёт к эпохе — прыжок: новая запись истории (решение 147)
  if (animate) markJump();
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
  // окно — по жизни лица, и в семейной укладке тоже: строка 24 px (32 px на телефоне) стоила бы приближения времени в
  // разы — род Иакова на телефоне сжался бы до 27 лет у рождения Иакова, без единого его ребёнка (Я12 — в отчёте Q4)
  const W = vp.r - vp.l;
  let kx = W / Math.max(1e-6, x1 - x0);
  let left = x0;
  // окно по ширине и плотности семьи (решение 165; R1-06, R2-4): у густой семьи (≥ 4 союзов или ≥ 12 детей) — масштаб,
  // на котором строка семьи не теснее ROW_READ px, но не теснее, чем нужно, чтобы вся родня первого колена с именами
  // уместилась по ширине; тогда окно — по родне, а не по жизни лица
  const fam = familyBox(id);
  if (fam?.dense) {
    const room = W - NAME_ROOM - 2 * FAM_PAD;
    const kFit = room > 40 ? room / Math.max(1e-6, fam.x1 - fam.x0) : kx;
    const kRead = kxForRow(ROW_READ, kx);
    const k = Math.max(kx, Math.min(kRead, kFit));
    if (k > kx * 1.01) kx = cam.clampKx(k, s.nodeX(id) ?? 0);
    // родня помещается при этом масштабе — окно ставится по ней (лицо в нём и так), иначе — лицо на трети слева
    const me = s.nodeX(id) ?? x0;
    left = kx <= kFit * 1.0001 ? Math.min(me - (W * 0.1) / kx, fam.x0 - FAM_PAD / kx) : me - (W * 0.35) / kx;
  }
  const [, cy] = cam.vpCenter();
  // вертикаль камеры — строки (сжатие полос, src/render/rows.ts)
  return { x0: left - vp.l / kx, kx, laneTop: s.rowOf(starLaneOf(n)) + cy / cam.kyFor(kx) };
}

/** Строка семьи, при которой имена читаются (решение 165), px; поле окна у родни по краям, px. */
export const ROW_READ = 14;
const FAM_PAD = 16;

/**
 * Родня первого колена лица на небе (решение 165): мировые x рождений самого лица и родни; dense — у лица не меньше
 * 4 союзов (супруги и другие родители его детей) или не меньше 12 детей. null — родни на небе нет.
 */
export function familyBox(id: string): { x0: number; x1: number; dense: boolean } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const me = s.nodeX(id);
  if (me === null) return null;
  let x0 = me;
  let x1 = me;
  let seen = 0;
  for (const k of firstKin(id)) {
    const i = s.indexOf(k.id);
    if (i === undefined || s.hides(k.id) || !s.drawn(i)) continue;
    const x = s.X0[i];
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    seen++;
  }
  if (!seen) return null;
  const mates = new Set<string>();
  let kids = 0;
  for (const e of graph.spousesOf.get(id) ?? []) mates.add(e.a === id ? e.b : e.a);
  for (const e of graph.childrenOf.get(id) ?? []) {
    if (e.kind !== 'father' && e.kind !== 'mother') continue;
    kids++;
    for (const q of graph.parentsOf.get(e.child) ?? []) if ((q.kind === 'father' || q.kind === 'mother') && q.parent !== id) mates.add(q.parent);
  }
  return { x0, x1, dense: mates.size >= 4 || kids >= 12 };
}

/** Масштаб, при котором строка (в пропорции читателя) не ниже row px; не меньше from. Поиск делением. */
function kxForRow(row: number, from: number): number {
  const s = skyRef.current;
  if (!s) return from;
  const cam = s.cam;
  const ky = (k: number) => cam.kyWith(k, cam.ownLanes);
  if (ky(from) >= row) return from;
  let lo = from;
  let hi = KX_MAX;
  if (ky(hi) < row) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (ky(mid) >= row) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Строка на телефоне в окне лица — не теснее стольких px (решение 146; M2): окно лет то же, что на столе, а полосы
 * выше — временной пропорцией (IX-70), своя пропорция читателя не меняется.
 */
export const PHONE_ROW_MIN = 10;

/**
 * Временная пропорция полос окна лица на телефоне (M2): строка при масштабе kx не ниже PHONE_ROW_MIN px; null — не нужна
 * (не телефон или строка и так не теснее).
 */
export function phoneLanes(kx: number): number | null {
  const s = skyRef.current;
  if (!s || !grid.peek().phone) return null;
  const cam = s.cam;
  if (cam.kyWith(kx, cam.ownLanes) >= PHONE_ROW_MIN - 0.01) return null;
  return Math.max(cam.ownLanes, cam.lanesFor(kx, PHONE_ROW_MIN));
}

/**
 * Окно лица (viewForPerson) и пропорция строк для него: на телефоне строки окна лица не теснее 10 px (M2) — пропорция
 * временная, laneTop — для неё; иначе lanes = null (пропорция прежняя).
 */
function personTarget(id: string): { v: ViewState; lanes: number | null } | null {
  const s = skyRef.current;
  const v = viewForPerson(id);
  if (!s || !v) return null;
  const m = phoneLanes(v.kx);
  if (m === null) return { v, lanes: null };
  const [, cy] = s.cam.vpCenter();
  const n = s.node(id);
  return { v: n ? { ...v, laneTop: s.rowOf(starLaneOf(n)) + cy / s.cam.kyWith(v.kx, m) } : v, lanes: m };
}

/** Перелёт к лицу (все ссылки на лица, поиск, указатели у края): лицо — в видимой части неба. */
export function flyToPerson(id: string) {
  const s = skyRef.current;
  const t = personTarget(id);
  if (!s || !t) return;
  if (t.lanes !== null) {
    flightTarget = null;
    s.cam.flyTo(s.cam.constrain(t.v, t.lanes), skyRef.redraw, reduced(), t.lanes);
    skyRef.redraw();
  } else flyTo(t.v);
  flightTarget = s.cam.moving ? id : null;
}

// ---------- переход к родственнику держит семью (решение 146) ----------

/** Ссылка на лицо сдвигает небо, если в кадре меньше этой доли его родни первого колена (U2). */
export const FAMILY_SHARE = 0.7;
/** Сдвиг к родне — не дольше, мс; без отдаления. */
export const FAMILY_MS = 400;
/** Родни больше стольких — сдвиг ищется по ближайшим по времени (дольше считать незачем: всех всё равно не вместить). */
const FAMILY_MAX = 80;

/** Родня лица на небе (нарисована, не скрыта показом и свёрткой): id и место на экране. */
function kinOnSky(id: string): { id: string; x: number; y: number }[] {
  const s = skyRef.current;
  if (!s || !s.model) return [];
  const out: { id: string; x: number; y: number }[] = [];
  for (const k of firstKin(id)) {
    const i = s.indexOf(k.id);
    if (i === undefined || s.hides(k.id) || !s.drawn(i)) continue;
    const q = screenOf(k.id);
    if (q) out.push({ id: k.id, ...q });
  }
  return out;
}

/** Рамка «в кадре» для родни: видимая часть без широких органов у верхнего и нижнего края, с полями inView. */
function frameBox(): { L: number; R: number; T: number; B: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const vp = s.cam.vp;
  const W = vp.r - vp.l;
  let top = vp.t;
  let bottom = vp.b;
  for (const r of reserveRects) {
    if (r.w < W * 0.3) continue;
    if (r.y + r.h >= vp.b - 8 && r.y > (vp.t + vp.b) / 2) bottom = Math.min(bottom, r.y - 8);
    else if (r.y <= vp.t + 60 && r.y + r.h < (vp.t + vp.b) / 2) top = Math.max(top, r.y + r.h + 8);
  }
  return { L: vp.l + MARGIN.l, R: vp.r - MARGIN.r, T: top + MARGIN.t, B: bottom - MARGIN.b };
}

/** Сколько родни лица в кадре (inView) и сколько её на небе. */
export function kinShare(id: string): { inside: number; total: number } {
  const kin = kinOnSky(id);
  return { inside: kin.filter((k) => inView(k.id)).length, total: kin.length };
}

/**
 * Сдвиг неба (px экрана), при котором в кадре больше всего родни лица id, а само лицо остаётся в кадре; из равных —
 * самый короткий. Масштаб не меняется. null — сдвигать незачем (родни в кадре не меньше FAMILY_SHARE) или нечем.
 */
export function familyShift(id: string, share = FAMILY_SHARE): { dx: number; dy: number } | null {
  const s = skyRef.current;
  const me = screenOf(id);
  const f = frameBox();
  if (!s || !me || !f || !inView(id)) return null;
  let kin = kinOnSky(id);
  if (!kin.length) return null;
  const inside0 = kin.filter((k) => inView(k.id)).length;
  if (inside0 >= share * kin.length) return null;
  if (kin.length > FAMILY_MAX) kin = [...kin].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)).slice(0, FAMILY_MAX);
  // лицо остаётся в кадре: пределы сдвига
  const dxLo = f.L - me.x;
  const dxHi = f.R - me.x;
  const dyLo = f.T - me.y;
  const dyHi = f.B - me.y;
  const clampX = (d: number) => Math.max(dxLo, Math.min(dxHi, d));
  const clampY = (d: number) => Math.max(dyLo, Math.min(dyHi, d));
  const xs = [...new Set([0, ...kin.flatMap((k) => [f.L - k.x, f.R - k.x]).map(clampX)])];
  const ys = [...new Set([0, ...kin.flatMap((k) => [f.T - k.y, f.B - k.y]).map(clampY)])];
  let best = { n: -1, cost: Infinity, dx: 0, dy: 0 };
  for (const dx of xs) {
    const inX = kin.filter((k) => k.x + dx >= f.L - 0.5 && k.x + dx <= f.R + 0.5);
    if (inX.length < best.n) continue;
    for (const dy of ys) {
      let n = 0;
      for (const k of inX) if (k.y + dy >= f.T - 0.5 && k.y + dy <= f.B + 0.5) n++;
      const cost = Math.abs(dx) + Math.abs(dy);
      if (n > best.n || (n === best.n && cost < best.cost)) best = { n, cost, dx, dy };
    }
  }
  if (best.cost < 2) return null;
  // и родня ровно у края — на 12 px внутрь, если лицо от этого не уходит за край
  const dx = clampX(best.dx + Math.sign(best.dx) * 12);
  const dy = clampY(best.dy + Math.sign(best.dy) * 12);
  return { dx, dy };
}

/**
 * Ссылка на лицо, звезда которого на экране (решение 146; src/ui/common.tsx, goTo): если в кадре меньше 70 % его родни
 * первого колена — небо сдвигается к ней за ≤ 400 мс, без отдаления. Было ли движение.
 */
export function holdFamily(id: string): boolean {
  const s = skyRef.current;
  // густая семья на масштабе мельче её окна (решение 165): приблизиться к окну семьи за те же ≤ 400 мс — без отдаления
  const fam = s && inView(id) ? familyBox(id) : null;
  if (s && fam?.dense) {
    const t = personTarget(id);
    if (t && t.v.kx > s.cam.kx * 1.15) {
      flightTarget = null;
      // пропорция телефона — временная (IX-70): своя пропорция читателя ждёт в userLanes
      if (t.lanes !== null && s.cam.userLanes === null && Math.abs(t.lanes / s.cam.lanes - 1) > 1e-9) s.cam.userLanes = s.cam.lanes;
      s.cam.zoomTo(s.cam.constrain(t.v, t.lanes ?? s.cam.lanes), FAMILY_MS, skyRef.redraw, reduced(), t.lanes ?? undefined);
      skyRef.redraw();
      return true;
    }
  }
  const d = familyShift(id);
  if (!s || !d) return false;
  const cam = s.cam;
  const to = cam.constrain({ x0: cam.x0 - d.dx / cam.kx, kx: cam.kx, laneTop: cam.laneTop + d.dy / cam.ky });
  if (cam.near(to)) return false;
  flightTarget = null;
  cam.animateTo(to, FAMILY_MS, skyRef.redraw, reduced(), easeOut);
  skyRef.redraw();
  return true;
}

/**
 * Звезда видна (решение 162): в видимой части неба и не под органом неба — без полей inView. Так же считает указатели
 * у края frame.ts: к видимой звезде указателя нет.
 */
function seenAt(q: { x: number; y: number }): boolean {
  const s = skyRef.current;
  if (!s) return false;
  const vp = s.cam.vp;
  const left = Math.max(s.letterW, vp.l);
  if (q.x < left || q.x > vp.r || q.y < s.openTop || q.y > vp.b) return false;
  return !reserveRects.some((r) => q.x > r.x - 4 && q.x < r.x + r.w + 4 && q.y > r.y - 4 && q.y < r.y + r.h + 4);
}

/**
 * Родня выбранного для проверок приёмки (tools/accept/nav14.ts): «лицо:x,y,1» — на небе (1 — видна, 0 — за краем или под органом),
 * «лицо:-» — не на небе (вне показа, свёрнуто).
 */
export function kinProbe(id: string): string {
  const s = skyRef.current;
  if (!s || !s.model) return '';
  return firstKin(id)
    .map((k) => {
      const i = s.indexOf(k.id);
      const q = i === undefined || s.hides(k.id) || !s.drawn(i) ? null : screenOf(k.id);
      return q ? `${k.id}:${Math.round(q.x)},${Math.round(q.y)},${seenAt(q) ? 1 : 0}` : `${k.id}:-`;
    })
    .join(';');
}

/**
 * Указатель у края на родню (решение 146; src/render/frame.ts): небо меняется наименьшим движением, чтобы эти лица были
 * видны, выбранное лицо остаётся на месте экрана; отдаляется, только если иначе не поместить (revealView).
 */
export function revealKin(ids: readonly string[]): boolean {
  const id = selected.peek();
  const keep = id ? screenOf(id) : null;
  return fitReveal(id ? [id, ...ids] : ids, keep);
}

/**
 * Уровень чтения (решение 44; IX-68): небо мельче половины масштаба вида «лицо и несколько поколений вокруг»
 * (viewForPerson: окно шире ≈ 2,6 жизни, не больше 900 лет) — на нём звезда лица есть, но читать вокруг неё нечего.
 * Ссылка на лицо, поиск и «назад» к лицу тогда ведут перелёт, даже если звезда на экране.
 */
export const READING = 0.5;
export function belowReading(id: string): boolean {
  const s = skyRef.current;
  const v = viewForPerson(id);
  return !!s && !!v && s.cam.kx < READING * v.kx;
}

/** «Всё небо» и кнопка «Толедот» — прямой переход за столько мс, без фазы «приблизить» (IX-79). */
export const HOME_MS = 500;
/** «Назад» и «вперёд» — переход к окну записи истории за столько мс (решение 46; IX-74). */
export const HISTORY_MS = 280;
/** Выключили «только линии», небо в режиме не двигали — прежнее окно возвращается за столько мс (решение 49; IX-73). */
export const LINES_BACK_MS = 400;

/**
 * «Всё небо» (D2; UX-05, IX-04, MOB-06): переход к виду, в который вписано всё небо по обеим осям — за 500 мс,
 * окно растёт вокруг неподвижной точки, без «отдалить — приблизить» (IX-79). В режиме «только линии Мессии»
 * «всё небо» — это весь коридор линий (E6).
 */
export function showAll() {
  const s = skyRef.current;
  if (!s || !s.model) return;
  flightTarget = null;
  if (onlyLines.peek()) {
    fitLines(true);
    return;
  }
  // временные строки окна лица на телефоне (M2, PHONE_ROW_MIN) — не для всего неба: вписывание — в своей пропорции
  // читателя, иначе строки «всего неба» выше видимой части (сценарий 39). Строки отметок и группы (IX-70) — их
  // возвращает снятие отметок
  if (s.cam.userLanes !== null && !groupShown()) s.cam.setLanes(s.cam.userLanes);
  // «Вписать» — весь показ, и в семейной укладке тоже (fitWholeState; Я30)
  s.cam.zoomTo(s.fitWholeState(), HOME_MS, skyRef.redraw, reduced());
  skyRef.redraw();
}

// ---------- несколько лиц: путь родства, группа (E5) ----------

/** Поле для имени справа от звезды, px: окно вписывает и подписи крайних лиц (IX-08). */
const NAME_ROOM = 90;

/**
 * Вид и пропорция полос, в которых вписана группа лиц (IX-53): строки сжимаются, а не отдаляется время.
 * lanes — пропорция полос (J1): множитель к обычной высоте полосы; laneTop посчитан для неё.
 */
export type GroupView = ViewState & { lanes: number; floor?: number };

/**
 * Вид, в который вписаны все лица ids по обеим осям (E5; MAP-18, UX-11, IX-53): по времени — годы группы с местом для
 * имени справа, окно не уже minYears лет, поля по 5 %, не дальше 100 г. по Р. Х. (MAP-79); по вертикали — строки группы
 * не выше 80 % видимой части. Если строки не помещаются, сжимается высота строки (пропорция полос, J1: до 4 px, а для
 * группы из многих строк — временно до 1,5 px, floor), а время остаётся; и только если и так не помещаются — отдаляется
 * время. Сжатие строк временное: своя пропорция читателя возвращается, когда отметки сняты (IX-70).
 */
export function viewForIds(ids: readonly string[], minYears = 60): GroupView | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const pts = ids.map((id) => ({ x: s.nodeX(id), n: s.node(id) })).filter((q): q is { x: number; n: NonNullable<typeof q.n> } => q.x !== null && !!q.n);
  if (!pts.length) return null;
  const cam = s.cam;
  const vp = cam.vp;
  const W = vp.r - vp.l;
  // по вертикали — без широких органов неба у нижнего и верхнего края (блок «Вид», вступление, строки у кромки)
  let top = vp.t;
  let bottom = vp.b;
  for (const r of reserveRects) {
    if (r.w < W * 0.3) continue;
    if (r.y + r.h >= vp.b - 8 && r.y > (vp.t + vp.b) / 2) bottom = Math.min(bottom, r.y - 8);
    else if (r.y <= vp.t + 60 && r.y + r.h < (vp.t + vp.b) / 2) top = Math.max(top, r.y + r.h + 8);
  }
  const H = Math.max(80, bottom - top);
  const x0 = Math.min(...pts.map((q) => q.x));
  const x1 = Math.max(...pts.map((q) => q.x));
  // по строкам экрана: при сжатии полос (J4, J5) лица набора ближе, чем их полосы
  const l0 = Math.min(...pts.map((q) => s.rowOf(starLaneOf(q.n))));
  const l1 = Math.max(...pts.map((q) => s.rowOf(starLaneOf(q.n))));
  const rows = l1 - l0 + 1;
  const tMid = s.tOf((x0 + x1) / 2);
  const xMid = (x0 + x1) / 2;
  // по времени (MAP-79): годы группы, не уже minYears лет, с полями по 5 % и местом для имени справа; правый край — не
  // дальше 100 г. по Р. Х., если группа до него кончается (после него шкала сжата, и поле в пикселях — это века)
  const half = Math.max(x1 - x0, s.xOf(tMid + minYears / 2) - s.xOf(tMid - minYears / 2)) / 2;
  const a = Math.min(x0, xMid - half);
  const b = Math.max(x1, xMid + half);
  const pad = (b - a) * GROUP_PAD;
  const xL = a - pad;
  let plan = Math.min(W / (b + pad - xL), Math.max(40, W - NAME_ROOM) / Math.max(1e-9, b - xL));
  const xMax = s.xOf(GROUP_RIGHT);
  if (b < xMax && xL + W / plan > xMax) plan = W / (xMax - xL);
  let kx = cam.clampKx(plan, xMid);
  const fits = (k: number, m: number, fl = floor) => cam.kyWith(k, m, fl) * rows <= H * 0.8;
  // строки — сжатием высоты строки: пропорция не больше своей пропорции читателя (не прежней временной, IX-70), но не
  // ниже 4 px строки
  let floor = KY_LO;
  let m = cam.ownLanes;
  if (!fits(kx, m)) {
    const auto = cam.kyAuto(kx);
    const want = (H * 0.8) / rows;
    m = cam.lanesAt(kx, want / auto);
    // и при 4 px не помещаются — строки группы временно ниже 4 px (до GROUP_KY_MIN), а время остаётся по её годам (MAP-79)
    if (!fits(kx, m) && want >= GROUP_KY_MIN && want < KY_LO) {
      floor = want;
      m = Math.max(LANES_MIN, want / auto);
    }
  }
  // и так не помещаются — масштаб времени уменьшается, пока не поместятся (прежний способ)
  if (!fits(kx, m)) {
    // высота строки растёт с масштабом: ищется самый крупный масштаб, при котором строки помещаются
    let lo = Math.min(kx, cam.kxLo());
    let hi = kx;
    if (fits(lo, m))
      for (let i = 0; i < 40; i++) {
        const mid = Math.sqrt(lo * hi);
        if (fits(mid, m)) lo = mid;
        else hi = mid;
      }
    kx = lo;
  }
  const [cx] = cam.vpCenter();
  const cy = (top + bottom) / 2;
  // окно по плану — от левого поля; масштаб упёрся в предел или строки не поместились — середина окна у середины группы
  let x0cam = Math.abs(kx / plan - 1) < 1e-9 ? xL - vp.l / kx : (a + b) / 2 - cx / kx;
  // и тогда правый край — не дальше 100 г. по Р. Х., если группа до него кончается
  if (b < xMax && x0cam + vp.r / kx > xMax) x0cam = Math.max(xMax - vp.r / kx, b + NAME_ROOM / kx - vp.r / kx);
  return { x0: x0cam, kx, laneTop: (l0 + l1) / 2 + cy / cam.kyWith(kx, m, floor), lanes: m, floor: floor < KY_LO ? floor : undefined };
}

/** Строки группы из многих строк — не ниже стольких px (MAP-79): ниже на них не различить звёзд. */
export const GROUP_KY_MIN = 1.5;

/** Поле окна группы по времени — доля её ширины с каждой стороны (MAP-79). */
export const GROUP_PAD = 0.05;
/** Правый край окна группы — не дальше 100 г. по Р. Х. (астрономический год 100; MAP-79). */
export const GROUP_RIGHT = 100;

/** Все лица ids — в видимой части неба (с полями inView). */
export function allInView(ids: readonly string[]): boolean {
  return ids.every((id) => inView(id));
}

/** Перелёт, вписывающий лица ids (путь родства, лица группы, одноимённые): все на экране (E5; IX-53). */
export function flyToIds(ids: readonly string[]) {
  const s = skyRef.current;
  const g = viewForIds(ids);
  if (!s || !g) return;
  flightTarget = null;
  s.cam.flyTo(s.cam.constrain(g, g.lanes, g.floor), skyRef.redraw, reduced(), g.lanes, g.floor);
  skyRef.redraw();
}

/**
 * Кадр шага рассказа (этап 16, решение 187): по времени — окно лет [a, b] (астр.) во всю ширину видимой части; по
 * вертикали — строки лиц ids в середине свободной полосы (без широких органов неба у кромок), не выше 80 % её. Строки не
 * помещаются — сжимается высота строки (как у viewForIds: до 4 px, для многих строк — временно до 1,5 px), время
 * остаётся окном шага. Лиц нет на небе — середина видимой части по вертикали остаётся.
 */
export function viewForFrame(ids: readonly string[], a: number, b: number): GroupView | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const xa = s.xOf(Math.min(a, b));
  const xb = s.xOf(Math.max(a, b));
  if (!(xb > xa)) return null;
  const cam = s.cam;
  const vp = cam.vp;
  const W = vp.r - vp.l;
  const plan = W / (xb - xa);
  const kx = cam.clampKx(plan, (xa + xb) / 2);
  let top = vp.t;
  let bottom = vp.b;
  for (const r of reserveRects) {
    if (r.w < W * 0.3) continue;
    if (r.y + r.h >= vp.b - 8 && r.y > (vp.t + vp.b) / 2) bottom = Math.min(bottom, r.y - 8);
    else if (r.y <= vp.t + 60 && r.y + r.h < (vp.t + vp.b) / 2) top = Math.max(top, r.y + r.h + 8);
  }
  const H = Math.max(80, bottom - top);
  const cy = (top + bottom) / 2;
  // окно по плану — от левого края; масштаб упёрся в предел — середина окна у середины кадра
  const x0 = Math.abs(kx / plan - 1) < 1e-9 ? xa - vp.l / kx : (xa + xb) / 2 - cam.vpCenter()[0] / kx;
  const rows = ids.map((id) => s.node(id)).filter((n): n is NonNullable<typeof n> => !!n).map((n) => s.rowOf(starLaneOf(n)));
  if (!rows.length) return { x0, kx, laneTop: cam.wLane(cy) + cy / cam.kyWith(kx, cam.ownLanes), lanes: cam.ownLanes };
  const l0 = Math.min(...rows);
  const l1 = Math.max(...rows);
  const n = l1 - l0 + 1;
  let floor = KY_LO;
  let m = cam.ownLanes;
  const fits = (mm: number, fl = floor) => cam.kyWith(kx, mm, fl) * n <= H * 0.8;
  if (!fits(m)) {
    const auto = cam.kyAuto(kx);
    const want = (H * 0.8) / n;
    m = cam.lanesAt(kx, want / auto);
    if (!fits(m) && want >= GROUP_KY_MIN && want < KY_LO) {
      floor = want;
      m = Math.max(LANES_MIN, want / auto);
    }
  }
  return { x0, kx, laneTop: (l0 + l1) / 2 + cy / cam.kyWith(kx, m, floor), lanes: m, floor: floor < KY_LO ? floor : undefined };
}

/**
 * Камера к виду группы g (рассказ, фокус созвездия): how — 'flight' — перелёт ван Вейка — Нёйса (ТЗ § 3.7; «Дальше»),
 * 'back' — переход за BACK-время без «отдалить — приблизить» (решение 46; «Назад» рассказа), 'jump' — сразу. При
 * ослабленном движении — всегда сразу.
 */
export function moveTo(g: GroupView, how: 'flight' | 'back' | 'jump' = 'flight') {
  const s = skyRef.current;
  if (!s || !s.model) return;
  flightTarget = null;
  const to = s.cam.constrain(g, g.lanes, g.floor);
  if (how === 'back' && !reduced()) {
    // пропорция кадра — временная, как у перелёта к группе (IX-70): своя пропорция читателя остаётся в userLanes
    if (Math.abs(g.lanes / s.cam.lanes - 1) > 1e-9 && s.cam.userLanes === null) s.cam.userLanes = s.cam.lanes;
    s.cam.zoomTo(to, HISTORY_MS, skyRef.redraw, false, g.lanes);
  } else s.cam.flyTo(to, skyRef.redraw, how === 'jump' || reduced(), g.lanes, g.floor);
  skyRef.redraw();
}

/** За столько мс возвращается пропорция читателя, когда отметки сняты (IX-70). */
export const RESTORE_MS = 250;
/** На небе отметки поиска, группа панели (глава, участок синопсиса) или путь пары — то, ради чего сжаты строки. */
export const groupShown = () => pins.peek().length > 0 || !!skyGroup.peek() || !!second.peek();

/**
 * Вернуть пропорцию читателя после временного сжатия строк (IX-70): выбранное лицо, если оно видно, остаётся на своей
 * высоте, иначе — середина видимой части; время не меняется. Было ли что возвращать.
 */
export function restoreOwnLanes(): boolean {
  const s = skyRef.current;
  if (!s || !s.model || s.cam.userLanes === null) return false;
  const p = anchorPoint();
  if (!p) return false;
  const done = s.cam.restoreLanes(p.y, RESTORE_MS, skyRef.redraw, reduced());
  skyRef.redraw();
  return done;
}

// вписывание группы сжимает строки только на время отметок (IX-70): сняли отметки, группу или пару (Escape, «снять»,
// новый поиск, щелчок по звезде или пустому небу) — своя пропорция возвращается; идёт перелёт — после него
if (typeof window !== 'undefined') {
  let wait = 0;
  effect(() => {
    const on = pins.value.length > 0 || !!skyGroup.value || !!second.value;
    cancelAnimationFrame(wait);
    if (on) return;
    const tick = (n: number) => {
      const s = skyRef?.current;
      // строки «только линий» — тоже временные (MAP-70): их возвращает выключение режима
      if (!s || s.cam.userLanes === null || groupShown() || onlyLines.peek()) return;
      if (s.cam.moving && n < 300) {
        wait = requestAnimationFrame(() => tick(n + 1));
        return;
      }
      restoreOwnLanes();
    };
    wait = requestAnimationFrame(() => tick(0));
  });
}

// строки окна лица на телефоне (M2, PHONE_ROW_MIN) — временные, пока лицо выбрано: снятый выбор их возвращает
if (typeof window !== 'undefined') {
  let had = false;
  effect(() => {
    const sel = !!selected.value;
    const gone = had && !sel;
    had = sel;
    if (!gone || !grid.peek().phone) return;
    requestAnimationFrame(() => {
      const s = skyRef?.current;
      if (!s || s.cam.userLanes === null || groupShown() || onlyLines.peek() || s.cam.moving || selected.peek()) return;
      restoreOwnLanes();
    });
  });
}

// ---------- «только линии Мессии» (E6; MAP-23) ----------

/** Сколько полос не меньше вписывается в 60 % высоты в режиме «только линии» (MAP-23: ±13 полос). */
const FOCUS_MIN = 27;

/**
 * Коридор линий: мировые x рождения первого и последнего лица линий и полосы лиц линий. Лица, скрытые набором (J4), — не в
 * счёт (этап 11, B1): в небе «набор» «только линии» вписывают лиц линий из набора, а не пустое небо, где стояли бы остальные.
 */
let lineIdsMemo: Set<string> | null = null;
const lineIds = () => (lineIdsMemo ??= new Set([...lines.joseph.persons, ...lines.mary.persons].map((q) => q.id)));

export function linesFrame(): { x0: number; x1: number; lane0: number; lane1: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let lane0 = Infinity;
  let lane1 = -Infinity;
  const hid = s.plan.hidden;
  // лица линий Мессии (data/lines/*.json): в показе «линии Мессии» у копий узлов семейной укладки полосы свои, и не у всех
  // лиц линий есть знак хребта раскладки (Адам) — коридор от Адама до Иисуса Христа по спискам линий
  const onLine = lineIds();
  s.nodes.forEach((n, i) => {
    if (!(n.spine || onLine.has(n.person)) || n.ghost || (hid && hid[i])) return;
    x0 = Math.min(x0, s.X0[i]);
    x1 = Math.max(x1, s.X0[i]);
    lane0 = Math.min(lane0, s.rowOf(starLaneOf(n)));
    lane1 = Math.max(lane1, s.rowOf(starLaneOf(n)));
  });
  return x1 > x0 ? { x0, x1, lane0, lane1 } : null;
}

/** Поле у Адама и у Иисуса Христа в режиме «только линии», px (MAP-59); справа — ещё место для имени. */
export const LINES_PAD = 24;

/** Масштаб, при котором коридор линий от Адама до Иисуса Христа вписан с полями LINES_PAD (MAP-59). */
export function linesKx(): number | null {
  const s = skyRef.current;
  const f = linesFrame();
  if (!s || !f) return null;
  const vp = s.cam.vp;
  const k = Math.max(1e-6, (vp.r - vp.l - 2 * LINES_PAD - NAME_ROOM * 1.4) / (f.x1 - f.x0));
  // окно у́же неба с полем под имя (карточка справа, узкое небо): предел отдаления — всё небо до 2040 г., и камера сдвинула бы
  // коридор вправо, срезав Адама; тогда без поля под имя справа — имя Иисуса Христа встанет слева от звезды
  const lo = s.cam.kxLo();
  return k >= lo ? k : Math.max(k, Math.min(lo * 1.02, (vp.r - vp.l - 2 * LINES_PAD) / (f.x1 - f.x0)));
}

/** Сколько поколений линий по обе стороны от выбранного лица показывает включение «только линии» (UX-68). */
export const LINES_AROUND = 10;

/**
 * Лицо линий, у которого держать окно «только линии»: само лицо, если оно на линии; мать или отец лица линии (Руфь, Фамарь,
 * Вирсавия — знак у бусины сына, решение 28) — этот ребёнок; иначе само лицо (окно — его время).
 */
export function lineAnchor(id: string): string {
  const on = (x: string) => lines.joseph.persons.some((st) => st.id === x) || lines.mary.persons.some((st) => st.id === x);
  if (on(id)) return id;
  for (const e of graph.childrenOf.get(id) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && on(e.child)) return e.child;
  return id;
}

/**
 * Мировые x окна «±10 поколений» вокруг лица (UX-68): по каждой линии — десять шагов раньше и позже лица линии, ближайшего
 * по времени к лицу (lineAnchor); окно — объединение по двум линиям.
 */
export function linesAround(id: string): { x0: number; x1: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const xa = s.nodeX(lineAnchor(id));
  if (xa === null) return null;
  let x0 = xa;
  let x1 = xa;
  for (const line of [lines.joseph, lines.mary]) {
    // поколения — лица линии на небе: скрытые набором не в счёт (этап 11, B1)
    const xs = line.persons
      .filter((st) => !s.hides(st.id))
      .map((st) => s.nodeX(st.id))
      .filter((x): x is number => x !== null)
      .sort((p, q) => p - q);
    if (!xs.length) continue;
    let i = 0;
    for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - xa) < Math.abs(xs[i] - xa)) i = k;
    x0 = Math.min(x0, xs[Math.max(0, i - LINES_AROUND)]);
    x1 = Math.max(x1, xs[Math.min(xs.length - 1, i + LINES_AROUND)]);
  }
  return x1 > x0 ? { x0, x1 } : null;
}

/**
 * Режим «только линии» вписывает коридор (MAP-23): полосы линий — на 60 % высоты видимой части (выше и ниже —
 * место для выносок точек сравнения), по времени — от Адама до Иисуса Христа с полями по 24 px и местом для имени
 * справа (MAP-59). around — выбранное лицо (IX-73, UX-68, решение 49): по времени окно — ±10 поколений линий вокруг
 * него, по вертикали — тот же коридор; лицо остаётся в кадре, весь коридор вписывает «Всё небо». Переход — за 500 мс,
 * как «Всё небо» (IX-79); animate = false — сразу (первый показ по адресу). Возвращает вид, к которому идёт небо.
 */
export function fitLines(animate = true, around: string | null = null): ViewState | null {
  const s = skyRef.current;
  const f = linesFrame();
  const k = linesKx();
  if (!s || !f || k === null) return null;
  const cam = s.cam;
  // место выбранного лица на экране — до смены высоты полосы коридора (решение 147): оно там и останется
  // (только лицо самих линий: мать у бусины сына — Руфь, Фамарь — в показе линий своей звезды не имеет, окно — у сына)
  const at0 = around && lineAnchor(around) === around && !s.hides(around) && inView(around) ? screenOf(around) : null;
  // полосы коридора — на 60 % высоты, но не выше, чем ±13 полос на ней: косы и следы не раздуваются (MAP-23)
  setFocus(Math.max(FOCUS_MIN, f.lane1 - f.lane0 + 1));
  // коридор может быть мельче «всего неба»: предел отдаления в этом режиме — он (zoomFloor)
  updateZoomFloor();
  const vp = cam.vp;
  const [, cy] = cam.vpCenter();
  const mid = (f.lane0 + f.lane1) / 2;
  const w = around ? linesAround(around) : null;
  let kx = w ? cam.clampKx(Math.max(40, vp.r - vp.l - 2 * LINES_PAD - NAME_ROOM) / (w.x1 - w.x0), (w.x0 + w.x1) / 2) : k;
  // выбранное лицо на виду и на линиях (решение 147; U5): оно остаётся на своём месте экрана, окно ±10 поколений и
  // коридор вписываются вокруг него — по целевому плану, под строкой показа
  const n = around ? s.node(around) : undefined;
  const at = w && n ? at0 : null;
  const xa = around ? s.nodeX(around) : null;
  const box = frameBox();
  if (at && xa !== null && w) {
    const L = vp.l + LINES_PAD;
    const R = vp.r - LINES_PAD - NAME_ROOM;
    if (xa > w.x0 && at.x > L) kx = Math.min(kx, (at.x - L) / (xa - w.x0));
    if (w.x1 > xa && R > at.x) kx = Math.min(kx, (R - at.x) / (w.x1 - xa));
    kx = cam.clampKx(kx, xa);
  }
  // строки коридора — по высоте (MAP-70): его полосы — на 60 % высоты, а не четверть, чтобы имена лиц линий помещались;
  // пропорция временная (IX-70): в память и адрес не идёт, при выключении режима возвращается своя
  let m = linesLanes(kx);
  let to: ViewState;
  if (at && xa !== null && n && box) {
    const rD = s.rowOf(starLaneOf(n));
    let ky = cam.kyWith(kx, m);
    if (f.lane1 > rD && at.y > box.T) ky = Math.min(ky, (at.y - box.T) / (f.lane1 - rD));
    if (rD > f.lane0 && box.B > at.y) ky = Math.min(ky, (box.B - at.y) / (rD - f.lane0));
    m = Math.max(LANES_MIN, Math.min(LANES_MAX, ky / cam.kyAuto(kx)));
    if (cam.userLanes === null && Math.abs(m / cam.lanes - 1) > 1e-9) cam.userLanes = cam.lanes;
    // без constrain: пределы сдвига сдвинули бы лицо, а окно у лица на линиях всегда в пределах данных
    to = { x0: xa - at.x / kx, kx, laneTop: rD + at.y / cam.kyWith(kx, m) };
  } else {
    if (cam.userLanes === null && Math.abs(m / cam.lanes - 1) > 1e-9) cam.userLanes = cam.lanes;
    to = cam.constrain({ x0: (w ? w.x0 : f.x0) - (vp.l + LINES_PAD) / kx, kx, laneTop: mid + cy / cam.kyWith(kx, m) }, m);
  }
  flightTarget = null;
  if (animate) cam.zoomTo(to, HOME_MS, skyRef.redraw, reduced(), m);
  else {
    cam.stop();
    cam.lanes = m;
    cam.set(to);
  }
  skyRef.redraw();
  return to;
}

/** Строки коридора линий занимают столько высоты видимой части (MAP-23, MAP-70). */
export const LINES_FILL = 0.6;
/** Пропорция строк «только линий» — не больше (MAP-70: ×2–3; ленты и следы не раздуваются). */
export const LINES_LANES_MAX = 3;

/**
 * Пропорция строк в режиме «только линии» при масштабе kx (MAP-70): полосы коридора — на 60 % высоты видимой части, не
 * выше ×3 обычной высоты; своя пропорция читателя, если она крупнее, остаётся.
 */
export function linesLanes(kx: number): number {
  const s = skyRef.current;
  const f = linesFrame();
  if (!s || !f) return 1;
  const cam = s.cam;
  const rows = Math.max(1, f.lane1 - f.lane0 + 1);
  const want = (LINES_FILL * (cam.vp.b - cam.vp.t)) / rows;
  const m = want / cam.kyAuto(kx);
  return Math.max(cam.ownLanes, Math.min(LINES_LANES_MAX, m));
}

/**
 * Строки «только линий» после адреса (MAP-70): адрес ставит свою пропорцию (h), а в режиме линий строки временно
 * по высоте коридора — середина видимой части по вертикали остаётся на месте.
 */
export function holdLinesRows() {
  const s = skyRef.current;
  if (!s || !s.model || !onlyLines.peek() || !linesFrame()) return;
  s.cam.setTempLanes(linesLanes(s.cam.kx));
}

/** Окно набора ×1,5, но не уже 200 лет — предел отдаления в режиме «в работе» (IX-64). */
export const WORK_ZOOM_OUT = 1.5;
/**
 * Отдалить небо «набор» можно не меньше чем до окна в столько лет (IX-64: было 200). Пошаговая карта из одного лица
 * («Только это лицо», этап 21) иначе не отдалялась дальше 256 лет: ни эпохи вокруг, ни соседних поколений (рецензия
 * этапа 21) — теперь до тысячелетия.
 */
export const WORK_MIN_YEARS = 1000;

/**
 * Предел отдаления по режиму неба (Camera.zoomFloor): в режиме «в работе» — окно набора со всеми следами ×1,5, но
 * не уже WORK_MIN_YEARS лет (IX-64); в режиме «только линии» — коридор линий с полями по 24 px (MAP-59); иначе — «всё небо».
 * Зовётся при смене режима и видимой части (SkyView).
 */
export function updateZoomFloor() {
  const s = skyRef.current;
  if (!s || !s.model || !(s.cam.w > 0)) return;
  const cam = s.cam;
  cam.zoomFloor = null;
  cam.edge = null;
  const all = cam.kxLo();
  let floor: number | null = null;
  if (s.plan.mode === 'work') {
    // по набору со всеми следами: «Всё небо» набора вписывает только звёзды и точки, а отдалить можно до целых следов
    const fit = s.fitWideState();
    const vp = cam.vp;
    const tc = s.tOf(fit.x0 + (vp.l + vp.r) / 2 / fit.kx);
    const w200 = s.xOf(tc + WORK_MIN_YEARS / 2) - s.xOf(tc - WORK_MIN_YEARS / 2);
    const k200 = w200 > 0 ? (vp.r - vp.l) / w200 : fit.kx;
    floor = Math.max(all, Math.min(fit.kx / WORK_ZOOM_OUT, k200));
  } else if (onlyLines.peek()) {
    const k = linesKx();
    if (k !== null) floor = Math.min(all, k);
  }
  // показ «линии Мессии» (он же план «набор»): поле у Адама — LINES_PAD, а не общее EDGE, иначе пределы сдвига прижимали
  // вписанный коридор к 16 px (MAP-59)
  if (onlyLines.peek()) cam.edge = LINES_PAD;
  cam.zoomFloor = floor;
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

/** Окно неба: мировая x середины видимой части, ширина в мировых единицах, полоса раскладки в середине. */
type Win = { cx: number; w: number; lane: number };
function windowNow(): Win | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const c = s.cam;
  const [cx, cy] = c.vpCenter();
  return { cx: c.wx(cx), w: (c.vp.r - c.vp.l) / c.kx, lane: s.laneOf(c.wLane(cy)) };
}
function viewForWin(w: Win, lanes?: number): ViewState | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const c = s.cam;
  const [cx, cy] = c.vpCenter();
  const kx = (c.vp.r - c.vp.l) / w.w;
  return { x0: w.cx - cx / kx, kx, laneTop: s.rowOf(w.lane) + cy / c.kyWith(kx, lanes ?? c.lanes) };
}

/**
 * Режим «только линии» туда и обратно (E6; решение 49; IX-73, UX-68). Включили — окно запоминается, коридор вписывается:
 * при выбранном лице — ±10 поколений вокруг него, лицо в кадре. Выключили — обычная высота полосы и, если в режиме небо
 * не двигали, прежнее окно за 400 мс; двигали — окно остаётся, выбранное лицо — в видимой части. Первый показ по адресу —
 * сразу, без перехода (окно адреса, если оно есть, ставится после и остаётся).
 */
/**
 * Небо создано заново — переход «Древо → Небо» (решение 73): режим «только линии» вписывает коридор, как при первом
 * показе (этап 11, B1). Прежде новое небо вставало на «всё небо» с обычными строками, и коридор сжимался в полосу по
 * 2 px на строку. Зовёт SkyView при каждом создании неба, кроме первого.
 */
export const linesAgain = signal(0);

/**
 * Переключение «только линии» ждёт кадра — вписывания коридора (этап 11, Я28): окно адреса ставится после него
 * (src/ui/address.ts, whenSkyReady), иначе коридор, вписанный кадром позже, затирал окно ссылки «#/~y-990~w400~s1~o1».
 */
let linesQueued = false;
export const linesSettling = () => linesQueued;

if (typeof window !== 'undefined') {
  let shown: boolean | null = null;
  let wait = 0;
  /** окно до включения режима и вид, к которому режим перешёл */
  let before: { win: Win; to: ViewState } | null = null;
  let again = 0;
  effect(() => {
    const on = onlyLines.value;
    // окно до листа «Показ» — сейчас: лист закрывается (holdSheetWindow(false)) раньше, чем режим дождётся конца перехода
    // строк, и тогда возврат шёл бы к окну, сдвинутому листом (сценарий 356)
    const held = heldWin;
    if (linesAgain.value !== again) {
      again = linesAgain.value;
      shown = null;
      before = null;
    }
    cancelAnimationFrame(wait);
    const apply = (tries: number) => {
      // модуль читается раньше common.tsx (круговой импорт): небо спрашивается только в кадре
      const s = skyRef?.current;
      // и строки ещё едут к укладке показа (§ 10): вписывать — по целевому плану, а не по кадру перехода (решение 147;
      // U5: коридор по прежним строкам уходил под строку показа, лицо — на сотни px)
      if (!s || !s.model || !(s.cam.w > 0) || !linesFrame() || (on && shown !== on && s.transitioning && tries < 120)) {
        if (tries < 240) wait = requestAnimationFrame(() => apply(tries + 1));
        else linesQueued = false;
        return;
      }
      linesQueued = false;
      const first = shown === null;
      if (shown === on) return;
      shown = on;
      const cam = s.cam;
      if (on) {
        // окно до листа «Показ», если показ включён из него (сдвиг из-под листа — не шаг читателя)
        const win = first ? null : (held ?? heldWin ?? windowNow());
        const to = fitLines(!first, first ? null : selected.peek());
        before = win && to ? { win, to } : null;
        return;
      }
      if (first) return;
      const b = before;
      before = null;
      // «не двигали»: небо стоит на виде режима — по времени (x0, kx). Строки при смене показа переставляет план неба
      // (линии Мессии — семейная укладка, всё небо — карта) переходом, и камера в это время движется, — это не движение
      // читателя; время переход не двигает (§ 10)
      const still = !!b && Math.abs(cam.kx / b.to.kx - 1) < 1e-3 && Math.abs(cam.x0 - b.to.x0) * cam.kx < 2;
      setFocus(0);
      updateZoomFloor();
      flightTarget = null;
      // временные строки режима (MAP-70) кончаются: своя пропорция читателя — вместе с окном
      const own = cam.endTemp() ?? cam.lanes;
      const back = b && still ? viewForWin(b.win, own) : null;
      if (back) cam.zoomTo(cam.constrain(back, own), LINES_BACK_MS, skyRef.redraw, reduced(), own);
      else {
        cam.stop();
        // двигали — окно остаётся, строки своей высоты сразу (у выбранного лица, если оно видно)
        const p = anchorPoint();
        if (p && Math.abs(own / cam.lanes - 1) > 1e-9) {
          const lane = cam.wLane(p.y);
          cam.lanes = own;
          cam.laneTop = lane + p.y / cam.ky;
        }
        cam.clampNow();
        const id = selected.peek();
        if (id) keepInView(id);
      }
      skyRef.redraw();
    };
    // ждать есть чего, только если показ сменился на линии Мессии: вписывание коридора (выключение окно адреса не затирает)
    linesQueued = on && shown !== on;
    wait = requestAnimationFrame(() => apply(0));
  });
}

/**
 * Шаг масштаба (кнопки, клавиши, колесо): f > 1 — приблизить. Точка привязки — at (px холста), иначе выбранное лицо,
 * если оно видно, иначе середина видимой части (IX-02). Кнопки и клавиши — ×2 за 250 мс, колесо — ×1,5 за 180 мс.
 */
export function zoomBy(f: number, at?: { x: number; y: number }, ms = 250) {
  const s = skyRef.current;
  const p = anchorPoint(at);
  if (!s || !p) return;
  flightTarget = null;
  s.cam.zoomStep(p.x, p.y, f, ms, skyRef.redraw, reduced());
}

/** Сдвиг клавишей — за столько мс, с замедлением (IX-05): небо не прыгает на 120 px за кадр. */
export const PAN_MS = 180;
let panGoal: { v: ViewState; until: number } | null = null;
/**
 * Сдвиг неба на (dx, dy) px клавишей (стрелки, Shift со стрелками): плавно за PAN_MS; нажатия подряд (удержание клавиши)
 * складываются — новый шаг продолжает идущий от его цели. При ослабленном движении — сразу.
 */
export function panStep(dx: number, dy: number) {
  const s = skyRef.current;
  if (!s || !s.model) return;
  const cam = s.cam;
  const now = performance.now();
  const base = panGoal && cam.moving && now < panGoal.until + 60 ? panGoal.v : cam.state();
  const to = cam.constrain({ x0: base.x0 - dx / cam.kx, kx: cam.kx, laneTop: base.laneTop + dy / cam.ky });
  flightTarget = null;
  panGoal = { v: to, until: now + PAN_MS };
  cam.animateTo(to, PAN_MS, skyRef.redraw, reduced(), easeOut);
  skyRef.redraw();
}

/** Точка привязки шага масштаба: at, иначе выбранное лицо, если оно видно, иначе середина видимой части. */
function anchorPoint(at?: { x: number; y: number }): { x: number; y: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  if (at) return at;
  const id = selected.peek();
  const q = id ? screenOf(id) : null;
  const vp = s.cam.vp;
  return q && q.x > vp.l && q.x < vp.r && q.y > vp.t && q.y < vp.b ? q : { x: (vp.l + vp.r) / 2, y: (vp.t + vp.b) / 2 };
}

// ---------- масштаб по двум осям (J1; решение владельца 16) ----------

/** Шаги растяжения одной оси: время — вдвое, как масштаб; полосы — в полтора раза (от 4 до 60 px — шесть-семь шагов). */
export const TIME_STEP = 2;
export const LANES_STEP = 1.5;

/**
 * Растянуть (f > 1) или сжать ось: «время» — только по горизонтали, высота полосы прежняя; «полосы» — только высота
 * полосы. Органы неба, клавиши (Shift и Alt с «+» и «−»), колесо с Shift и Alt. Привязка — как у zoomBy.
 */
export function stretchBy(axis: Axis, f: number, at?: { x: number; y: number }, ms = 250): boolean {
  const s = skyRef.current;
  const p = anchorPoint(at);
  if (!s || !p) return false;
  flightTarget = null;
  const done = s.cam.stretchStep(axis, p.x, p.y, f, ms, skyRef.redraw, reduced());
  skyRef.redraw();
  return done;
}

/** Пропорции по умолчанию (J1): высота полосы снова следует за масштабом времени; время и окно лет не меняются. */
export function resetProportions() {
  const s = skyRef.current;
  const p = anchorPoint();
  if (!s || !p) return;
  flightTarget = null;
  s.cam.resetLanes(p.x, p.y, 250, skyRef.redraw, reduced());
  skyRef.redraw();
}

/**
 * Пропорция полос, которую читатель задал (J1): множитель к обычной высоте полосы, 1 — по умолчанию. Живёт в камере;
 * здесь — её копия после каждого шага (SkyView), для органов неба и памяти браузера. Адрес пишет её сам (h, address.ts).
 */
const LANES_KEY = 'toledot:lanes';
/** Пропорция из памяти браузера; нет или испорчена — 1. */
export function storedLanes(): number {
  try {
    const v = Number(localStorage.getItem(LANES_KEY));
    return Number.isFinite(v) && v >= LANES_MIN && v <= LANES_MAX ? v : 1;
  } catch {
    return 1;
  }
}
// начальное значение — из памяти: иначе первая запись (1) стёрла бы память раньше, чем небо её прочтёт
export const lanes = signal<number>(typeof window === 'undefined' ? 1 : storedLanes());
/** Пропорция из адреса при загрузке (address.ts): адрес с полями вида без «h» — пропорции по умолчанию. */
let fromAddress: number | null = null;
export function setStartLanes(v: number) {
  fromAddress = v;
}
/** Пропорция первого показа: из адреса, иначе из памяти браузера. */
export function startLanes(): number {
  const v = fromAddress ?? storedLanes();
  return Math.max(LANES_MIN, Math.min(LANES_MAX, v));
}
if (typeof window !== 'undefined')
  effect(() => {
    const v = lanes.value;
    try {
      if (Math.abs(v - 1) < 1e-3) localStorage.removeItem(LANES_KEY);
      else localStorage.setItem(LANES_KEY, String(Math.round(v * 1000) / 1000));
    } catch {
      /* хранилище недоступно — пропорция живёт до перезагрузки */
    }
  });

// ---------- привязка при смене масштаба времени и модели (D15; ТЗ § 11.2 п. 6; IX-35, IX-48) ----------

/** Что держать на месте: выбранное лицо на экране (sx, sy) или год t середины видимой части (id = null). */
/** years — годы у левого и правого края видимой части: при смене масштаба времени окно лет сохраняется (решение 196). */
export type Anchor = { id: string | null; sx: number; sy: number; t: number; years?: [number, number] };

/** Якорь сейчас: выбранное лицо, если его звезда в видимой части, иначе год в середине видимой части. */
export function anchorNow(): Anchor | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const id = selected.peek();
  const vp = s.cam.vp;
  const years: [number, number] = [s.tOf(s.cam.wx(vp.l)), s.tOf(s.cam.wx(vp.r))];
  const q = id ? screenOf(id) : null;
  if (id && q && q.x >= vp.l && q.x <= vp.r && q.y >= vp.t && q.y <= vp.b) return { id, sx: q.x, sy: q.y, t: 0, years };
  const [cx, cy] = s.cam.vpCenter();
  return { id: null, sx: cx, sy: cy, t: s.tOf(s.cam.wx(cx)), years };
}

/**
 * Поставить камеру так, чтобы якорь был на прежнем месте экрана: по горизонтали — всегда; по вертикали (vertical) —
 * строка лица под прежней точкой: смена модели хронологии меняет полосы раскладки у всех, кроме лиц линий (IX-48);
 * keepYears — и окно прежних лет (смена масштаба времени).
 */
export function holdAnchor(a: Anchor, vertical = false, keepYears = false) {
  const s = skyRef.current;
  if (!s || !s.model) return;
  // смена масштаба времени (рецензия этапа 21): окно тех же лет — иначе на «Равномерном по годам» семья Адама, сжатая
  // «По эпохам», не помещалась бы в окно прежней крупности
  if (keepYears && a.years) {
    const vp = s.cam.vp;
    const w = s.xOf(a.years[1]) - s.xOf(a.years[0]);
    if (w > 0) s.cam.kx = s.cam.clampKx((vp.r - vp.l) / w, s.xOf((a.years[0] + a.years[1]) / 2));
  }
  const x = a.id ? s.nodeX(a.id) : s.xOf(a.t);
  if (x !== null) s.cam.x0 = x - a.sx / s.cam.kx;
  const n = vertical && a.id ? s.node(a.id) : undefined;
  if (n) s.cam.laneTop = s.rowOf(starLaneOf(n)) + a.sy / s.cam.ky;
}

/** Экранное место звезды лица (px холста). */
export function screenOf(id: string): { x: number; y: number } | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const i = s.indexOf(id);
  if (i === undefined) return null;
  // место нарисованной звезды (Sky.starY: полоса рождения узла кадра, решение 173) — то же, что пишет canvas[data-stars]
  return { x: s.cam.sx(s.X0[i]), y: s.starY(i) };
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
export function keepInView(id: string, ms = 250, side = false) {
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
  // под органами неба — выше блока; под строкой у верхней кромки (верхняя половина видимой части) — ниже строки, а не
  // под самую рамку: окно лет не меняется. side — лист «Показ» слева (этап 14, решение 147): кратчайшим путём из-под
  // него — вбок, ниже или выше, сколько позволяет видимая часть
  if (!dx && !dy) {
    const r = reserveRects.find((z) => q.x > z.x - 8 && q.x < z.x + z.w + 8 && q.y > z.y - 8 && q.y < z.y + z.h + 8);
    if (r && !side) dy = r.y + r.h / 2 < (vp.t + vp.b) / 2 ? r.y + r.h + 24 - q.y : Math.max(vp.t + MARGIN.t, r.y - 40) - q.y;
    else if (r) {
      const opts: [number, number][] = [];
      const right = r.x + r.w + 24 - q.x;
      const left = r.x - 24 - q.x;
      const below = r.y + r.h + 24 - q.y;
      const above = Math.max(vp.t + MARGIN.t, r.y - 40) - q.y;
      if (q.x + right <= vp.r - MARGIN.r) opts.push([right, 0]);
      if (q.x + left >= vp.l + MARGIN.l) opts.push([left, 0]);
      if (q.y + below <= vp.b - MARGIN.b) opts.push([0, below]);
      if (q.y + above >= vp.t + MARGIN.t && q.y + above < r.y) opts.push([0, above]);
      const best = opts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
      if (best) [dx, dy] = best;
      else dy = r.y + r.h / 2 < (vp.t + vp.b) / 2 ? r.y + r.h + 24 - q.y : Math.max(vp.t + MARGIN.t, r.y - 40) - q.y;
    }
  }
  const to = cam.constrain({ x0: cam.x0 - dx / cam.kx, kx: cam.kx, laneTop: cam.laneTop + dy / cam.ky });
  flightTarget = null;
  cam.animateTo(to, ms, skyRef.redraw, reduced());
}

/**
 * Первый экран карты «набор» (рецензия этапа 21, сценарий 707): лица карты, которые по времени в окне, но лежат под
 * органом неба (строка показа на телефоне — в две строки, со строкой шагов), выходят из-под него сдвигом по вертикали —
 * если так на виду больше лиц, а лицо keep (выбранное) остаётся на виду. Окно лет и масштаб не меняются.
 */
export function uncoverSet(ids: readonly string[], keep: string | null, ms = 250): boolean {
  const s = skyRef.current;
  if (!s || !s.model) return false;
  const cam = s.cam;
  const vp = cam.vp;
  const pts = ids.map(screenOf).filter((q): q is { x: number; y: number } => !!q && q.x >= vp.l + MARGIN.l && q.x <= vp.r - MARGIN.r);
  const under = (x: number, y: number) => reserveRects.find((r) => x > r.x - 8 && x < r.x + r.w + 8 && y > r.y - 8 && y < r.y + r.h + 8);
  const seen = (x: number, y: number) => y >= vp.t + MARGIN.t && y <= vp.b - MARGIN.b && !under(x, y);
  const count = (dy: number) => pts.filter((q) => seen(q.x, q.y + dy)).length;
  const now = count(0);
  if (now === pts.length) return false;
  const k = keep ? screenOf(keep) : null;
  // сдвиги-кандидаты: каждое закрытое лицо — сразу под свой орган или над ним, как в keepInView
  const cands = new Set<number>();
  for (const q of pts) {
    const r = under(q.x, q.y);
    if (!r) continue;
    cands.add(r.y + r.h + 24 - q.y);
    cands.add(Math.max(vp.t + MARGIN.t, r.y - 40) - q.y);
  }
  let best = 0;
  let most = now;
  for (const dy of [...cands].sort((a, b) => Math.abs(a) - Math.abs(b))) {
    if (k && !seen(k.x, k.y + dy)) continue;
    const n = count(dy);
    if (n > most) [best, most] = [dy, n];
  }
  if (!best) return false;
  const to = cam.constrain({ x0: cam.x0, kx: cam.kx, laneTop: cam.laneTop + best / cam.ky });
  flightTarget = null;
  cam.animateTo(to, ms, skyRef.redraw, reduced());
  return true;
}

// ---------- раскрытие на небе «набор» (решения 68, 70) ----------

/** Вписывание раскрытых лиц — за столько мс (не больше 600), прямым переходом, без «отдалить — приблизить». */
export const REVEAL_MS = 450;

/** Раскрытый или свёрнутый союз: id, лицо, от которого раскрыт, и раскрыт ли теперь. */
export type UnionFlip = { uid: string; from: string; open: boolean };

/**
 * Какой союз раскрыли или свернули (решение 70; src/ui/reveal.ts, expanded): добавленный в раскрытые; убранный — тот,
 * чьё лицо from осталось в наборе set (свёртка убирает и союзы, раскрытые от ушедших лиц). null — ничего или несколько сразу.
 */
export function unionFlip(prev: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>, set: ReadonlySet<string>): UnionFlip | null {
  const added = Object.keys(next).filter((k) => !(k in prev));
  if (added.length) return added.length === 1 ? { uid: added[0], from: next[added[0]], open: true } : null;
  const gone = Object.keys(prev).filter((k) => !(k in next) && set.has(prev[k]));
  return gone.length === 1 ? { uid: gone[0], from: prev[gone[0]], open: false } : null;
}

/** Родители и дети лица по основным связям (отец, мать). */
const upOf = (id: string) => (graph.parentsOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.parent);
const downOf = (id: string) => (graph.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);

/**
 * Окно «вокруг лица» для начал «С Адама» и «С Иисуса Христа» (решение 68): по времени — от рождения деда до рождения
 * внуков (поколение-два в обе стороны: у Адама — вперёд, у Иисуса Христа — назад) и короткая жизнь самого лица, не уже
 * 60 лет, с полями и местом для имени справа; по вертикали лицо — в середине видимой части. Не всё небо: первый шаг
 * раскрытия виден сразу.
 */
export function viewAround(id: string): ViewState | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const n = s.node(id);
  if (!n) return null;
  const bornOf = (x: string) => {
    const m = s.model.nodeByPerson.get(x);
    return m ? (m.born ?? m.t0) : null;
  };
  const years: number[] = [n.t0];
  const push = (t: number | null) => {
    if (t !== null && Number.isFinite(t)) years.push(t);
  };
  for (const p of upOf(id)) {
    push(bornOf(p));
    for (const g of upOf(p)) push(bornOf(g));
  }
  for (const k of downOf(id)) {
    push(bornOf(k));
    for (const g of downOf(k)) push(bornOf(g));
  }
  if (n.t1 - n.t0 <= 100) push(n.t1);
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const mid = (lo + hi) / 2;
  const half = Math.max((hi - lo) / 2, 30);
  const pad = half * 0.16;
  const xa = s.xOf(mid - half - pad);
  const xb = s.xOf(mid + half + pad);
  if (!(xb > xa)) return null;
  const cam = s.cam;
  const vp = cam.vp;
  const W = Math.max(80, vp.r - vp.l - NAME_ROOM - 16);
  const kx = cam.clampKx(W / (xb - xa), (xa + xb) / 2);
  const [, cy] = cam.vpCenter();
  // окно поставлено под нынешнюю ширину неба; если она сменится (колонка карточки), окно встанет заново (AROUND_MS)
  if (typeof performance !== 'undefined') {
    around = { id, w: vp.r - vp.l, until: performance.now() + AROUND_MS };
    watchAround();
  }
  return cam.constrain({ x0: xa - (vp.l + 16) / kx, kx, laneTop: s.rowOf(starLaneOf(n)) + cy / cam.kyFor(kx) });
}

/**
 * Раскрытые лица вне видимой части (решение 70): окно меняется наименьшим движением — отдаляется, только если они
 * не помещаются, и сдвигается ровно настолько, чтобы все были видны; точка keep (звезда лица, от которого раскрыли,
 * px холста) по возможности остаётся на месте экрана. null — все и так на виду.
 */
export function revealView(ids: readonly string[], keep: { x: number; y: number } | null): ViewState | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const pts = ids.map((id) => ({ x: s.nodeX(id), n: s.node(id) })).filter((q): q is { x: number; n: NonNullable<typeof q.n> } => q.x !== null && !!q.n);
  if (!pts.length || ids.every((id) => inView(id))) return null;
  const cam = s.cam;
  const vp = cam.vp;
  const L = vp.l + MARGIN.l;
  const R = vp.r - MARGIN.r;
  const T = vp.t + MARGIN.t + 8;
  const B = vp.b - MARGIN.b;
  // точка, которая остаётся на месте экрана: лицо, от которого раскрыли, иначе первое лицо
  const ax = keep ? keep.x : cam.sx(pts[0].x);
  const ay = keep ? keep.y : cam.sy(starLaneOf(pts[0].n));
  const awx = cam.wx(ax);
  const arow = cam.wLane(ay);
  const xs = [awx, ...pts.map((q) => q.x)];
  const rs = [arow, ...pts.map((q) => s.rowOf(starLaneOf(q.n)))];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const r0 = Math.min(...rs);
  const r1 = Math.max(...rs);
  const fits = (k: number) => (x1 - x0) * k <= R - L && (r1 - r0) * cam.kyFor(k) <= B - T;
  let kx = cam.kx;
  if (!fits(kx)) {
    let lo = cam.kxLo();
    let hi = kx;
    if (fits(lo))
      for (let i = 0; i < 40; i++) {
        const m = Math.sqrt(lo * hi);
        if (fits(m)) lo = m;
        else hi = m;
      }
    kx = lo;
  }
  const ky = cam.kyFor(kx);
  const sx0 = ax + (x0 - awx) * kx;
  const sx1 = ax + (x1 - awx) * kx;
  const sy0 = ay - (r1 - arow) * ky;
  const sy1 = ay - (r0 - arow) * ky;
  let dx = 0;
  let dy = 0;
  if (sx0 < L) dx = L - sx0;
  else if (sx1 > R) dx = R - sx1;
  if (sy0 < T) dy = T - sy0;
  else if (sy1 > B) dy = B - sy1;
  return cam.constrain({ x0: awx - (ax + dx) / kx, kx, laneTop: arow + (ay + dy) / ky });
}

/** Вписать раскрытые лица (решение 70): прямой переход за REVEAL_MS, при ослабленном движении — сразу. */
export function fitReveal(ids: readonly string[], keep: { x: number; y: number } | null): boolean {
  const s = skyRef.current;
  const v = revealView(ids, keep);
  if (!s || !v || s.cam.near(v)) return false;
  flightTarget = null;
  s.cam.zoomTo(v, REVEAL_MS, skyRef.redraw, reduced());
  skyRef.redraw();
  return true;
}

/**
 * Окно «вокруг лица» ждёт, пока видимая часть неба не устоится (этап 13, решение 111; X4 Д5): начало «С Иисуса Христа»
 * выбирает лицо, и справа открывается колонка карточки — видимая часть сужается уже после того, как окно поставлено, и
 * звезда оставалась за правым краем (x = 991 при кромке 940). Пока идёт ожидание (AROUND_MS), ширина видимой части
 * сменилась, а звезды не видно — окно ставится заново под новую ширину.
 */
export const AROUND_MS = 3000;
let around: { id: string; w: number; until: number } | null = null;
/** Окно вокруг лица id ещё устанавливается (карточка у звезды его ждёт, src/ui/sky/DotCard.tsx). */
export const aroundPending = (id: string) => !!around && around.id === id && performance.now() < around.until;

/** Перейти к окну «вокруг лица» (начало «С Адама», «С Иисуса Христа»): animate — прямым переходом. */
export function showAround(id: string, animate: boolean): boolean {
  const s = skyRef.current;
  const v = viewAround(id);
  if (!s || !v) return false;
  flightTarget = null;
  if (animate) s.cam.zoomTo(v, REVEAL_MS, skyRef.redraw, reduced());
  else {
    s.cam.stop();
    s.cam.set(v);
  }
  skyRef.redraw();
  return true;
}

/**
 * Видимая часть сменила ширину после окна «вокруг лица» (открылась колонка карточки, лист, панель): лицо за краем —
 * окно заново, прямым переходом; читатель выбрал другое лицо или время ожидания вышло — ожидание кончается. Следит
 * по кадрам неба (viewTick); подписка — при первом окне вокруг лица: common.tsx и view.ts импортируют друг друга, и при
 * загрузке модуля viewTick ещё нет.
 */
let aroundWatch: (() => void) | null = null;
function watchAround() {
  if (aroundWatch || typeof window === 'undefined') return;
  aroundWatch = effect(() => {
    void viewTick.value;
    const a = around;
    const s = skyRef.current;
    if (!a || !s) return;
    if (performance.now() > a.until || selected.peek() !== a.id) {
      around = null;
      return;
    }
    const w = s.cam.vp.r - s.cam.vp.l;
    if (s.cam.moving || Math.abs(w - a.w) < 1) return;
    a.w = w;
    if (inView(a.id)) return;
    const v = viewAround(a.id);
    // ожидание не продлевается новым окном: срок — от первого окна
    if (around) around.until = a.until;
    if (!v) return;
    flightTarget = null;
    s.cam.zoomTo(v, REVEAL_MS, skyRef.redraw, reduced());
    skyRef.redraw();
  });
}

/**
 * Небо следует за шагом карты (этап 21, решение 197): после «+» раскрытое должно быть видно и читаемо, а соседи по карте —
 * оставаться в кадре, сколько можно (сценарий приёмки 1305: Адам → Сиф → Енос без потери Адама).
 *  — Раскрытое стоит теснее MIN_STEP_PX по времени (обзор всего родословия: семья Адама — в одной точке), а приблизить
 *    ещё можно, — перелёт к нему, но не во всю ширину: годы раскрытого занимают половину окна, по краям — место для
 *    следующего шага вперёд и назад.
 *  — Кто-то из ids (лицо, у которого раскрыли, и раскрытые) за краем видимой части или под органами неба — небо
 *    сдвигается ровно настолько, чтобы раскрытое вошло (с местом для имени справа), не приближаясь; не помещается при
 *    нынешнем масштабе — вписывается с отдалением.
 * Иначе камера стоит: опора перехода (лицо, у которого раскрыли) остаётся на месте.
 */
export const MIN_STEP_PX = 140;
/** Место справа от звезды для имени с пометой и «⊕» шага вперёд («Малелеил праот. ⊕»), px. */
const STEP_ROOM = 170;
export function followStep(ids: readonly string[]) {
  const s = skyRef.current;
  if (!s || !s.model) return;
  const pts = ids.map((id) => screenOf(id)).filter((q): q is { x: number; y: number } => !!q);
  if (!pts.length) return;
  const hidden = ids.some((id) => !inView(id));
  const xs = pts.map((q) => q.x);
  const span = Math.max(...xs) - Math.min(...xs);
  const cam = s.cam;
  const canZoom = cam.clampKx(cam.kx * 1.5, cam.wx(cam.vpCenter()[0])) > cam.kx * 1.2;
  // тесно — приблизить: годы раскрытого — на половину окна (окно вдвое шире их), раскрытое посередине
  if (ids.length > 1 && span < MIN_STEP_PX && canZoom) {
    const ws = ids.map((id) => s.nodeX(id)).filter((x): x is number => x !== null);
    const years = ws.length ? s.tOf(Math.max(...ws)) - s.tOf(Math.min(...ws)) : 0;
    const g = viewForIds(ids, Math.max(60, 2 * years));
    if (!g) return;
    flightTarget = null;
    cam.flyTo(cam.constrain(g, g.lanes, g.floor), skyRef.redraw, reduced(), g.lanes, g.floor);
    skyRef.redraw();
    return;
  }
  const vp = cam.vp;
  // слева — место для «⊕» шага назад у звезды (рецензия этапа 21: Иаков у самого края, его «⊕» к родителям за краем);
  // справа — для имени с пометой и «⊕» шага вперёд (сценарий 816: звезда в кадре, а её «⊕» — у самого края)
  const L = vp.l + MARGIN.l + 28;
  const R = vp.r - STEP_ROOM;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  if (!hidden && lo >= L && hi <= R) return;
  // за краем — не приближать сверх нынешнего масштаба: небо сдвигается, чтобы раскрытое вошло, или отдаляется, если не
  // входит; крупность не скачет
  const g = viewForIds(ids);
  if (!g) return;
  // звезда в кадре, но имени и «⊕» тесно у края — только сдвиг, без отдаления
  if (g.kx > cam.kx || !hidden) {
    // раскрытое за правым краем встаёт к 0,62 ширины, за левым — к 0,38, а не вплотную к краю: за ним место для его «⊕»
    // и следующего поколения, иначе на линии Адам → Ной небо приходилось тянуть на каждом шаге (сценарий 816); прежнее
    // поколение остаётся в кадре — раскрытое не уходит за другой край
    const W = vp.r - vp.l;
    let dx = 0;
    if (hi - lo <= R - L) dx = lo < L ? Math.max(L - lo, Math.min(R - hi, vp.l + 0.38 * W - lo)) : hi > R ? Math.min(R - hi, Math.max(L - lo, vp.l + 0.62 * W - hi)) : 0;
    if (hi - lo <= R - L) g.x0 = cam.x0 - dx / cam.kx;
    else {
      const cx = g.x0 + cam.vpCenter()[0] / g.kx;
      g.x0 = cx - cam.vpCenter()[0] / cam.kx;
    }
    g.kx = cam.kx;
  }
  flightTarget = null;
  cam.flyTo(cam.constrain(g, g.lanes, g.floor), skyRef.redraw, reduced(), g.lanes, g.floor);
  skyRef.redraw();
}
