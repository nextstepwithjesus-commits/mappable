/**
 * Фокус клавиатуры на небе (I1; MOB-29–31, IX-39, VIS-16). Небо — одна остановка Tab (холст); стрелки переводят фокус
 * к ближайшей звезде в своём направлении, Enter открывает её карточку (src/ui/sky/skykeys.ts). Звезда с фокусом —
 * сигнал focused (src/state.ts): небо рисует у неё кольцо и подпись (render/marks.ts, render/labels.ts), диктор читает её
 * пункт в списке лиц неба (src/ui/sky/SkyA11y.tsx, aria-activedescendant у холста).
 */
import { signal } from '@preact/signals';
import { byId } from '../../data/atlas.ts';
import { focused, selected } from '../../state.ts';
import { detailOf, OVERVIEW_MAG, type Sky } from '../../render/sky.ts';
import { skyRef } from '../common.tsx';
import { keepInView, screenOf } from './view.ts';
import { collapseUnion, expandUnion, isExpanded, selectUnion, unionById } from '../reveal.ts';
import { plateSayText } from './text.ts';
import { openSheetAt } from '../sheet.ts';

// ---------- союзы на небе «набор» (решения 70, 76) ----------

/**
 * Точка союза с кольцом клавиатуры (id союза): стрелки водят фокус и по точкам союзов, как по звёздам; пока он есть,
 * у звезды кольца нет (focused = null), холст называет пункт союза в списке неба (SkyA11y), Enter открывает у точки
 * карточку союза (src/ui/sky/DotCard.tsx).
 */
export const plateFocus = signal<string | null>(null);
/** Точка союза под указателем мыши: она ярче (src/ui/sky/input.ts). */
export const plateHover = signal<string | null>(null);
/** Объявление живой области неба после раскрытия и свёртки союза (SkyView): n — чтобы тот же текст прозвучал снова. */
export const plateNews = signal<{ text: string; n: number }>({ text: '', n: 0 });

/**
 * Раскрыть союз от лица from (оба супруга и все дети — на небо) или свернуть его, и сказать это вслух: «Раскрыт союз
 * Адама и Евы: 3 лица». Выбор лица и лист карточки не меняются — это команда «Раскрыть детей» карточки у точки
 * (решение 76). Возвращает, раскрыт ли союз теперь.
 */
export function toggleKids(uid: string, from: string): boolean {
  const u = unionById(uid);
  if (!u) return false;
  const was = isExpanded(uid);
  const n = was ? collapseUnion(uid) : expandUnion(uid, from);
  plateNews.value = { text: plateSayText(u, !was, n), n: plateNews.peek().n + 1 };
  return !was;
}

/**
 * Щелчок по точке союза там, где карточки у точки нет (выбор второго лица «Родства», решение 70): раскрыть или свернуть
 * союз и открыть карточку союза в листе (решение 71). Карточка союза видна при выбранном лице, а смена лица её закрывает
 * (src/ui/reveal.ts): сначала выбирается лицо from, потом, отдельно, — союз. На телефоне лист, как при касании звезды,
 * открывается на шапке (решение 12). Возвращает, раскрыт ли союз теперь.
 */
export function pressPlate(uid: string, from: string): boolean {
  if (!unionById(uid)) return false;
  const open = toggleKids(uid, from);
  if (selected.peek() !== from && byId.has(from)) {
    openSheetAt('peek');
    selected.value = from;
  }
  selectUnion(uid);
  return open;
}

/** Точки союзов на виду — для стрелок (id — id союза, «u:…»). */
function platePoints(sky: Sky): (StarPoint & { mag: number; onScreen: boolean })[] {
  const vp = sky.cam.vp;
  return sky.plateHits
    .map((h) => ({ id: h.uid, x: h.cx, y: h.cy, mag: 2, onScreen: true }))
    .filter((q) => q.x > vp.l && q.x < vp.r && q.y > vp.t && q.y < vp.b);
}
const isUnion = (id: string) => id.startsWith('u:');

export type Dir = 'left' | 'right' | 'up' | 'down';
/** Звезда на экране: лицо и точка в px холста. */
export type StarPoint = { id: string; x: number; y: number };

const DIRS: Record<Dir, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/** Стрелка по физической клавише (KeyboardEvent.code). */
export const arrowDir = (code: string): Dir | null =>
  code === 'ArrowLeft' ? 'left' : code === 'ArrowRight' ? 'right' : code === 'ArrowUp' ? 'up' : code === 'ArrowDown' ? 'down' : null;

/**
 * Ближайшая звезда в направлении dir от точки from. Кандидат должен лежать впереди хотя бы на 1 px; сначала ищется
 * в сорокапятиградусном конусе вокруг направления, и только если там никого нет — во всей полуплоскости. Мера —
 * продвижение вдоль направления плюс удвоенное отклонение поперёк: вправо — это соседняя звезда своей полосы или
 * близкой к ней, а не звезда, которая чуть ближе, но на другой высоте. Возвращает id или null.
 */
export function nearestInDirection(from: { x: number; y: number }, stars: readonly StarPoint[], dir: Dir, skip?: string | null): string | null {
  const [dx, dy] = DIRS[dir];
  let best: string | null = null;
  let bestScore = Infinity;
  let bestCone = false;
  for (const s of stars) {
    if (s.id === skip) continue;
    const vx = s.x - from.x;
    const vy = s.y - from.y;
    const along = vx * dx + vy * dy;
    if (along < 1) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const cone = across <= along;
    const score = along + 2 * across;
    if ((cone && !bestCone) || (cone === bestCone && score < bestScore)) {
      best = s.id;
      bestScore = score;
      bestCone = cone;
    }
  }
  return best;
}

/**
 * С какой звезды начать, когда фокус пришёл на небо: выбранное лицо, если оно на виду; иначе яркая звезда ближе
 * к середине видимой части (каждая ступень величины «стоит» 80 px расстояния).
 */
export function startStar(stars: readonly (StarPoint & { mag: number })[], center: { x: number; y: number }, prefer?: (string | null)[]): string | null {
  for (const id of prefer ?? []) if (id && stars.some((s) => s.id === id)) return id;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const s of stars) {
    const score = Math.hypot(s.x - center.x, s.y - center.y) + 80 * s.mag;
    if (score < bestScore) {
      bestScore = score;
      best = s.id;
    }
  }
  return best;
}

/** Номера блоков-скоплений модели (списки без родства, E2): их лица за краем экрана фокус не берёт. */
const clusterBlocks = new WeakMap<object, Set<number>>();
function clustersOf(sky: Sky): Set<number> {
  let s = clusterBlocks.get(sky.model);
  if (!s) {
    s = new Set(sky.model.blocks.filter((b) => b.cluster).map((b) => b.id));
    clusterBlocks.set(sky.model, s);
  }
  return s;
}

/**
 * Звёзды, к которым может перейти фокус: на виду — те, что нарисованы в полную силу и ловят указатель
 * (Sky.reachable); за краем видимой части — те, что будут так нарисованы, когда небо сдвинется к ним (на обзоре —
 * величины 0–2, на крупном масштабе — все, кроме лиц скоплений). Призраки жён не берутся: у жены одна звезда.
 */
export function starPoints(sky: Sky): (StarPoint & { mag: number; onScreen: boolean })[] {
  const out: (StarPoint & { mag: number; onScreen: boolean })[] = [];
  if (!sky.model) return out;
  const cam = sky.cam;
  // звёзды видны, когда подробна хотя бы одна ось (решение 25; render/sky.ts, detailOf)
  const detail = detailOf(cam).stars;
  const clusters = clustersOf(sky);
  for (let i = 0; i < sky.nodes.length; i++) {
    const n = sky.nodes[i];
    if (n.ghost) continue;
    const x = cam.sx(sky.X0[i]);
    const y = cam.sy(n.lane);
    const mag = byId.get(n.person)?.magnitude ?? 6;
    if (sky.reachable(i)) {
      out.push({ id: n.person, x, y, mag, onScreen: true });
      continue;
    }
    const inside = x > sky.letterW && x < cam.w && y > sky.openTop && y < cam.vp.b;
    if (inside || !sky.drawn(i) || (n.block >= 0 && clusters.has(n.block))) continue;
    if (mag <= OVERVIEW_MAG || detail >= 0.5) out.push({ id: n.person, x, y, mag, onScreen: false });
  }
  return out;
}

/** Последняя звезда с фокусом: к ней фокус возвращается, когда клавиатура снова приходит на небо. */
let lastFocus: string | null = null;
export const rememberFocus = (id: string | null) => {
  if (id) lastFocus = id;
};

/** Поставить фокус на звезду и показать её, если она у края или за краем видимой части. */
export function setStarFocus(id: string) {
  plateFocus.value = null;
  focused.value = id;
  lastFocus = id;
  keepInView(id);
}

/** Фокус пришёл на небо: выбранное лицо на виду, прежняя звезда с фокусом на виду или яркая звезда у середины. */
export function enterSky(): string | null {
  const sky = skyRef.current;
  if (!sky || !sky.model) return null;
  const vp = sky.cam.vp;
  const shown = starPoints(sky).filter((s) => s.onScreen);
  const id = startStar(shown, { x: (vp.l + vp.r) / 2, y: (vp.t + vp.b) / 2 }, [focused.peek(), selected.peek(), lastFocus]);
  if (id) {
    plateFocus.value = null;
    focused.value = id;
    lastFocus = id;
  }
  return id;
}

/**
 * Стрелка на холсте: фокус к ближайшей звезде или точке союза (небо «набор», решения 70, 76) в этом направлении.
 * Возвращает, куда перешёл фокус (id лица или союза; null — никуда).
 */
export function moveStarFocus(dir: Dir): string | null {
  const sky = skyRef.current;
  if (!sky || !sky.model) return null;
  const plates = platePoints(sky);
  const pf = plateFocus.peek();
  const cur = pf ?? focused.peek();
  const at = pf ? (plates.find((q) => q.id === pf) ?? null) : cur ? screenOf(cur) : null;
  if (!cur || !at) return enterSky();
  const to = nearestInDirection(at, [...starPoints(sky), ...plates], dir, cur);
  if (!to) return null;
  if (isUnion(to)) {
    focused.value = null;
    plateFocus.value = to;
    return to;
  }
  setStarFocus(to);
  return to;
}

/** Имя звезды для строки списка и диктора: «Давид, царь». */
export const starName = (id: string) => {
  const p = byId.get(id);
  return p ? `${p.name}${p.disambig ? `, ${p.disambig}` : ''}` : id;
};
