/**
 * Карточка у точки на небе «набор» (решение 76; владелец: «при нажатии на эту точку она раскрывается в карточку»).
 *
 * Щелчок (касание, Enter) по звезде лица или по точке союза раскрывает у самой точки маленькую карточку — лист атласа
 * поверх холста (DOM), тем же языком, что карточки древа (src/ui/tree/Cards.tsx, tree.css):
 *  — у лица: образ (условный силуэт, решение 74), имя со знаками лент, уточнение одной строкой, годы; команды
 *    «Информация» (подробная карточка справа; свёрнутая — разворачивается), «Продолжить ветвь» / «Свернуть ветвь»
 *    (точки его союзов), «Родители» / «Скрыть родителей» (союз его родителей), «×»;
 *  — у союза: два малых силуэта, «Адам и Ева», вид связи со стихом, дети числом; команды «Раскрыть детей (3)» /
 *    «Свернуть детей», «Подробнее» (карточка союза справа), «×».
 *
 * Место: карточка прикреплена к точке отводом 1 px и уходит в ту сторону, где есть место (placeDot: под точкой, справа,
 * над ней, слева — первое, где она целиком в небе и не закрывает подпись своего лица, органы неба, соседние имена и
 * точки). Карточка следует за небом при сдвиге и масштабе; точка ушла за край — карточка закрывается. На телефоне —
 * у нижнего края неба над листом карточки, во всю ширину неба; если так она закрыла бы точку — у верхнего края.
 *
 * Одна карточка за раз. Закрывают её «×», Escape (фокус возвращается на холст, кольцо — на точку), щелчок по пустому
 * небу, смена выбранного лица не командой карточки, уход с неба «набор». Роль — dialog (не модальный) с именем лица или
 * союза; открытая с клавиатуры, она получает фокус на первую команду.
 *
 * Только небо «набор» своего набора (dotsOn): во «всех лицах», в наборе из ссылки, в режиме «только линии» и при выборе
 * второго лица щелчок по звезде — как прежде.
 *
 * Двойной щелчок по точке союза союз сразу не раскрывает: двойной щелчок по небу везде — масштаб ×2 у указателя (IX-02),
 * и над звездой тоже; другое значение над точкой в 8 px было бы скрытым жестом, который легко сделать нечаянно (читатели
 * привычно щёлкают дважды) и которого нет у клавиатуры и касания. Раскрытие меняет набор — оно делается подписанной
 * командой «Раскрыть детей (3)», которая стоит тут же, у точки.
 */
import { computed, effect, signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { byId } from '../../data/atlas.ts';
import type { Rect } from '../../render/sky.ts';
import type { Union } from '../../engine/unions.ts';
import { focused, onlyLines, pickMode, selected } from '../../state.ts';
import { refLabel, skyRef, viewTick } from '../common.tsx';
import { Close } from '../controls.tsx';
import { Avatar, UnionAvatar } from '../tree/Avatar.tsx';
import { disLine, kidsCommand, unionKindLine, yearsLine } from '../tree/Cards.tsx';
import { onLines } from '../tree/model.ts';
import { unionTitle as unionNames } from '../card/Union.tsx';
import { closePerson, collapseUnion, expanded, opened, openPerson, originOf, plates, selectedUnion, selectUnion, unionById, unionsOf } from '../reveal.ts';
import { linkSet, skyMode, workSet } from '../work.ts';
import { grid, unfoldCard } from '../layout.ts';
import { openSheetAt, sheetStop } from '../sheet.ts';
import { focusCardTitle, focusQuietly } from '../focus.ts';
import { skyMenu } from '../panels/Work.tsx';
import { typo } from '../text/typo.ts';
import { starRadius } from '../../render/glyphs.ts';
import { reduced, reserve, screenOf } from './view.ts';
import { plateFocus, rememberFocus, toggleKids } from './starnav.ts';
import { kidsText, unionTitle } from './text.ts';

// ---------- состояние ----------

/** Где открыта карточка: у звезды лица или у точки союза (from — лицо, у которого стоит точка). */
export type DotAt = { kind: 'person'; id: string } | { kind: 'union'; uid: string; from: string };
/** Открытая карточка: где, выбранное лицо при открытии (его смена не командой карточки закрывает её), фокус — на команду. */
export type DotCardState = DotAt & { sel: string | null; focus: boolean };

export const dotCard = signal<DotCardState | null>(null);

/** Небо, где щелчок по точке открывает карточку у точки: «набор» своего набора, не «только линии», не выбор второго лица. */
export const dotsOn = computed(() => skyMode.value === 'work' && !linkSet.value && !pickMode.value && !onlyLines.value);

/** Открыть карточку у звезды или точки союза; focus — поставить фокус на первую команду (открыли с клавиатуры). */
export function openDot(at: DotAt, o: { focus?: boolean } = {}) {
  if (at.kind === 'person' ? !byId.has(at.id) : !unionById(at.uid)) return;
  dotCard.value = { ...at, sel: selected.peek(), focus: !!o.focus };
  // телефон: лист карточки на половине закрыл бы небо под карточкой у точки — он опускается до шапки, как при касании
  // звезды (решение 12); «Информация» поднимает его снова
  if (grid.peek().phone && sheetStop.peek() === 'half') sheetStop.value = 'peek';
}

/** Холст неба: сюда возвращается фокус после карточки. */
const canvasEl = () => (typeof document === 'undefined' ? null : document.querySelector<HTMLCanvasElement>('.sky canvas'));

/**
 * Закрыть карточку. refocus — фокус на холст, кольцо клавиатуры — на звезду или точку союза карточки (Escape, «×»,
 * если фокус был в карточке, или карточка ушла, пока фокус был в ней).
 */
export function closeDot(refocus = false) {
  const at = dotCard.peek();
  if (!at) return;
  dotCard.value = null;
  lastRect = null;
  if (!refocus) return;
  const c = canvasEl();
  if (!c) return;
  c.focus({ preventScroll: true });
  if (at.kind === 'person') rememberFocus(at.id);
  // кольцо клавиатуры — только если фокус пришёл с клавиатуры (Escape, Enter на «×»); после мыши кольца нет
  if (!c.matches(':focus-visible')) return;
  if (at.kind === 'person') {
    plateFocus.value = null;
    focused.value = at.id;
  } else {
    focused.value = null;
    plateFocus.value = at.uid;
  }
}

/** Карточка ставит выбор лица сама («Информация», «Подробнее»): такая смена выбора её не закрывает. */
function selectFromDot(id: string, stop: 'peek' | 'half') {
  const at = dotCard.peek();
  if (at) dotCard.value = { ...at, sel: id, focus: false };
  if (selected.peek() !== id) {
    openSheetAt(stop);
    selected.value = id;
  }
}

// ---------- команды ----------

/** Союзы, чьи точки сейчас на небе «набор» (src/ui/reveal.ts, plates). */
const shownUnions = () => new Set(plates.value.map((p) => p.union.id));

export interface PersonDotCmds {
  /** «Продолжить ветвь» — точки его союзов не все на небе; «Свернуть ветвь» — они показаны от него */
  branch: 'more' | 'fold' | null;
  /** «Родители» — союз его родителей не раскрыт; «Скрыть родителей» — раскрыт от него */
  parents: 'show' | 'hide' | null;
}

/**
 * Команды карточки лица (как у карточки лица в древе, src/ui/tree/model.ts, personCmds):
 *  — «Продолжить ветвь», если точки его союзов показаны не все; иначе «Свернуть ветвь», если они показаны по его щелчку
 *    или его союз раскрыт от него;
 *  — «Родители», если первый союз его происхождения (основные родители) не раскрыт; «Скрыть родителей», если его
 *    раскрыли от этого лица; раскрыт от родителя — команды нет: родители и так на небе.
 */
export function personDotCmds(id: string): PersonDotCmds {
  const own = unionsOf(id);
  const shown = shownUnions();
  const exp = expanded.value;
  const more = own.some((u) => !shown.has(u.id));
  const fold = !more && own.length > 0 && (opened.value.includes(id) || own.some((u) => exp[u.id] === id));
  const org = originOf(id)[0];
  const by = org ? exp[org.id] : undefined;
  return { branch: more ? 'more' : fold ? 'fold' : null, parents: !org ? null : by === undefined ? 'show' : by === id ? 'hide' : null };
}

/** «Продолжить ветвь»: точки союзов лица — на небо (вниз — его браки, вверх — союз родителей). */
export function continueDot(id: string) {
  openPerson(id);
}

/**
 * «Свернуть ветвь»: свернуть союзы лица, раскрытые от него (дети уходят со всем, что раскрыто от них), и убрать точки его
 * союзов. Союз, раскрытый от супруга, остаётся: свёртка не убирает с неба самого супруга.
 */
export function foldDot(id: string) {
  const exp = expanded.peek();
  for (const u of unionsOf(id)) if (exp[u.id] === id) collapseUnion(u.id);
  closePerson(id);
}

/** «Родители»: союз родителей раскрывается от лица — родители, братья и сёстры на небе; «Скрыть родителей» — свёртка. */
export function parentsDot(id: string) {
  const org = originOf(id)[0];
  if (org) toggleKids(org.id, id);
}

/**
 * Команда раскрытия у карточки союза. Точка у лица-ребёнка (союз его родителей): «Раскрыть родителей» — родители, братья
 * и сёстры на небе, «Скрыть родителей». Точка у супруга: «Раскрыть детей (3)», «Раскрыть ещё (6)» (часть детей уже на
 * небе), «Свернуть детей»; брак без детей или все дети на небе, а супруга нет — «Раскрыть союз», «Свернуть союз».
 * Всё уже на небе и союз не раскрыт — команды нет.
 */
export function unionDotCmd(u: Union, from: string): { text: string; label?: string; open: boolean } | null {
  const open = u.id in expanded.value;
  const set = workSet.value;
  if (u.kids.includes(from) && from !== u.a && from !== u.b) {
    if (open) return { text: 'Скрыть родителей', label: 'Скрыть родителей: свернуть союз родителей', open: true };
    return [u.a, u.b, ...u.kids].some((x) => x && !set.has(x)) ? { text: 'Раскрыть родителей', label: 'Раскрыть родителей: родители, братья и сёстры на небе', open: false } : null;
  }
  const hidden = u.kids.filter((k) => !set.has(k)).length;
  if (u.kids.length && (open || hidden > 0)) return kidsCommand(u, open, hidden);
  if (open) return { text: 'Свернуть союз', open: true };
  return [u.a, u.b].some((x) => x && !set.has(x)) ? { text: 'Раскрыть союз', label: 'Раскрыть союз: оба супруга на небе', open: false } : null;
}

/** Кого выбрать для карточки союза справа: супруга, который на небе (лицо у точки, если это супруг), иначе лицо у точки. */
export function unionSpouse(u: Union, from: string): string {
  if (from === u.a || from === u.b) return from;
  return [u.a, u.b].find((x): x is string => !!x && workSet.peek().has(x)) ?? from;
}

/**
 * «Информация» и «Подробнее»: подробная карточка справа — лицо выбрано (карточка союза сменяется карточкой лица), свёрнутая
 * в корешок — разворачивается, на телефоне лист поднимается до половины и карточка у точки закрывается (лист закрыл бы
 * небо под ней); фокус — на заголовок карточки.
 */
function showDetails(id: string, uid: string | null) {
  const phone = grid.peek().phone;
  selectFromDot(id, phone ? 'half' : 'peek');
  if (uid) selectUnion(uid);
  else if (selectedUnion.peek()) selectUnion(null);
  if (phone) {
    if (sheetStop.peek() === 'peek') sheetStop.value = 'half';
    closeDot(false);
  } else if (grid.peek().spine) unfoldCard();
  if (!uid) focusCardTitle(id);
  else focusUnionTitle();
}

/** Фокус на заголовок карточки союза справа, когда она появится (не дольше полусекунды). */
function focusUnionTitle(frames = 0) {
  const t = document.querySelector<HTMLElement>('.folio #union-title');
  if (t) focusQuietly(t);
  else if (frames < 30) requestAnimationFrame(() => focusUnionTitle(frames + 1));
}

// ---------- место ----------

export type DotSide = 's' | 'e' | 'n' | 'w';
/** Порядок сторон: под точкой (как на снимке владельца), справа, над ней, слева. */
export const DOT_SIDES: readonly DotSide[] = ['s', 'e', 'n', 'w'];
/** Длина отвода от края знака до карточки, px. */
export const DOT_LEAD = 10;
/** Телефон: небо поднимается под карточку, только когда его высота не менялась столько мс (лист карточки встал). */
export const VP_SETTLE_MS = 300;
/** Отступ карточки от краёв видимой части неба, px. */
export const DOT_MARGIN = 6;

/** Знак на экране: середина и радиус с кольцом выбора, px холста. */
export type DotAnchor = { x: number; y: number; r: number };
/**
 * Место карточки: левый верхний угол, сторона, ключ места (для постоянства) и отвод (прямоугольник толщиной 1 px) или null;
 * nudge — на сколько px сдвинуть небо по вертикали, чтобы карточка у края не закрыла знак (телефон, низкое небо).
 */
export type DotPlace = { x: number; y: number; side: DotSide | 'dock'; key: string; lead: Rect | null; nudge?: number };
/** Что карточке лучше не закрывать, и во что обходится закрыть: имя — 30, звезда и точка — 20, органы неба — 30. */
export type Obstacle = Rect & { cost: number };

const cross = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Насколько карточка может отойти от знака по длинному отводу, px: сперва — вплотную. */
const REACH = { ns: [0, 20, 40, 64], ew: [0, 24, 48] };

/**
 * Где карточке размера size стоять у знака a в пределах bounds. Места — по четырём сторонам (под знаком, справа, над ним,
 * слева) с отводом разной длины и со сдвигом вдоль стороны; у каждого — штраф: не помещается целиком — 1000, закрывает сам
 * знак — 500, подпись своего лица (avoid) — по 100, соседние имена, звёзды, точки союзов и органы неба (soft) — их цена;
 * длинный отвод и сдвиг — немного, дальше — порядок сторон. Так карточка уходит туда, где есть место, и не ложится на
 * детей, которых только что раскрыла её команда. Место прошлого кадра prev получает поблажку: карточка не прыгает, пока
 * небо сдвигают. Отвод — перпендикуляр от знака к краю карточки.
 */
export function placeDot(a: DotAnchor, size: { w: number; h: number }, bounds: Rect, avoid: readonly Rect[] = [], soft: readonly Obstacle[] = [], prev: string | null = null): DotPlace {
  const { w, h } = size;
  const clampX = (x: number) => Math.max(bounds.x, Math.min(bounds.x + bounds.w - w, x));
  const clampY = (y: number) => Math.max(bounds.y, Math.min(bounds.y + bounds.h - h, y));
  const mark = { x: a.x - a.r, y: a.y - a.r, w: 2 * a.r, h: 2 * a.r };
  let best: (DotPlace & { score: number; out: boolean }) | null = null;
  DOT_SIDES.forEach((side, k) => {
    const ns = side === 's' || side === 'n';
    for (const reach of ns ? REACH.ns : REACH.ew)
      for (const slide of [0, -1, 1]) {
        const len = DOT_LEAD + reach;
        let x: number;
        let y: number;
        let out: boolean;
        let lead: Rect | null;
        if (ns) {
          y = side === 's' ? a.y + a.r + len : a.y - a.r - len - h;
          out = side === 's' ? y + h > bounds.y + bounds.h : y < bounds.y;
          // посередине под знаком; сдвиг — отвод у левого или у правого края карточки
          x = clampX(slide === 0 ? a.x - w / 2 : slide < 0 ? a.x - 28 : a.x - w + 28);
          lead = a.x >= x + 2 && a.x <= x + w - 2 ? { x: Math.round(a.x), y: side === 's' ? a.y + a.r : y + h, w: 1, h: len } : null;
        } else {
          x = side === 'e' ? a.x + a.r + len : a.x - a.r - len - w;
          out = side === 'e' ? x + w > bounds.x + bounds.w : x < bounds.x;
          // строка имени — на высоте знака (карточка читается как подпись); сдвиг — знак у середины или у низа карточки
          y = clampY(slide === 0 ? a.y - Math.min(h / 2, 22) : slide < 0 ? a.y - h / 2 : a.y - h + 22);
          lead = a.y >= y + 2 && a.y <= y + h - 2 ? { x: side === 'e' ? a.x + a.r : x + w, y: Math.round(a.y), w: len, h: 1 } : null;
        }
        const key = `${side}${reach}${slide}`;
        const r = { x, y, w, h };
        let score = k * 3 + reach / 6 + (slide ? 2 : 0) + (out ? 1000 : 0) + (lead ? 0 : 4);
        if (cross(r, mark)) score += 500;
        for (const q of avoid) if (cross(r, q)) score += 100;
        for (const q of soft) if (cross(r, q)) score += q.cost;
        if (key === prev) score -= 10;
        if (!best || score < best.score) best = { x, y, side, key, lead, score, out };
      }
  });
  const b = best!;
  // нигде не помещается целиком — лучшее место, сдвинутое внутрь неба, без отвода
  if (b.out) return { x: clampX(b.x), y: clampY(b.y), side: b.side, key: b.key, lead: null };
  return { x: b.x, y: b.y, side: b.side, key: b.key, lead: b.lead };
}

/**
 * На телефоне — у нижнего края неба над листом карточки, во всю ширину видимой части; если там карточка закрыла бы знак
 * (с запасом 10 px) — у верхнего края под строками и органами (soft), знак тогда ниже неё. Отвод — к знаку, если он над
 * или под карточкой. Небо так низко, что знак закрыт и там и там, — карточка у нижнего края, а nudge говорит, на сколько
 * поднять небо, чтобы знак встал над ней.
 */
export function dockDot(a: DotAnchor, h: number, bounds: Rect, soft: readonly Rect[] = []): DotPlace {
  const w = bounds.w;
  const mark = { x: a.x - a.r - 10, y: a.y - a.r - 10, w: 2 * a.r + 20, h: 2 * a.r + 20 };
  const low = { x: bounds.x, y: bounds.y + bounds.h - h, w, h };
  let top = bounds.y;
  for (const q of soft) if (q.y < bounds.y + bounds.h / 2 && q.x < bounds.x + w && q.x + q.w > bounds.x) top = Math.max(top, q.y + q.h + DOT_MARGIN);
  const high = { x: bounds.x, y: top, w, h };
  const r = !cross(low, mark) || cross(high, mark) ? low : high;
  const inX = a.x >= r.x + 2 && a.x <= r.x + w - 2;
  const lead = !inX ? null : r === low ? (a.y + a.r < r.y ? { x: Math.round(a.x), y: a.y + a.r, w: 1, h: r.y - a.y - a.r } : null) : a.y - a.r > r.y + h ? { x: Math.round(a.x), y: r.y + h, w: 1, h: a.y - a.r - r.y - h } : null;
  const nudge = cross(r, mark) ? low.y - DOT_LEAD - 14 - (a.y + a.r) : 0;
  return { x: r.x, y: r.y, side: 'dock', key: r === low ? 'dock-low' : 'dock-high', lead, ...(nudge ? { nudge } : {}) };
}

/** Прямоугольник открытой карточки (px холста) — подсказка неба её не закрывает (src/ui/sky/Tip.tsx). */
let lastRect: Rect | null = null;
export const dotRect = () => (dotCard.peek() ? lastRect : null);

/** Знак карточки на экране: звезда лица (с кольцом выбора) или точка союза (по полю попадания Sky.plateHits). */
function anchorOf(at: DotAt): DotAnchor | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  if (at.kind === 'person') {
    const i = s.indexOf(at.id);
    if (i === undefined || !s.drawn(i)) return null;
    const q = screenOf(at.id);
    const p = byId.get(at.id);
    if (!q || !p) return null;
    return { ...q, r: starRadius(p.magnitude, Math.max(0.7, Math.min(1.25, s.cam.ky / 18))) + (p.sex === 'f' ? 7 : 5) };
  }
  const h = s.plateHits.find((q) => q.uid === at.uid);
  if (!h) return null;
  // центр ромба и его полуразмер (src/render/plates.ts, PlateHit) — с кольцом выбора
  return { x: h.cx, y: h.cy, r: h.r + 4 };
}

/**
 * Что карточке лучше не закрывать: органы неба, имена и пометы на небе, звёзды и точки союзов; и подпись своего лица —
 * нельзя.
 */
function obstacles(at: DotAt, a: DotAnchor): { avoid: Rect[]; soft: Obstacle[] } {
  const s = skyRef.current!;
  const avoid: Rect[] = [];
  const soft: Obstacle[] = reserve().map((r) => ({ ...r, cost: 30 }));
  const own = at.kind === 'person' ? at.id : null;
  for (const b of s.ledger.boxes) {
    // пометы семей, подписи лент («через Рисая (Лк 3)»), знаки свёрнутого — тоже надписи неба: карточка их не закрывает,
    // если есть место (рамка и её строки — вне открытого неба, точки союзов — ниже)
    if (b.kind === 'note' || b.kind === 'mark' || b.kind === 'fold' || b.kind === 'group' || b.kind === 'event' || b.kind === 'sticky') {
      soft.push({ x: b.x, y: b.y, w: b.w, h: b.h, cost: 20 });
      continue;
    }
    if (b.kind !== 'star') continue;
    if (own && b.id === own) avoid.push(b);
    else soft.push({ x: b.x, y: b.y, w: b.w, h: b.h, cost: 30 });
  }
  for (const h of s.plateHits) if (Math.abs(h.cx - a.x) > 1 || Math.abs(h.cy - a.y) > 1) soft.push({ x: h.cx - 6, y: h.cy - 6, w: 12, h: 12, cost: 20 });
  const cam = s.cam;
  for (let i = 0; i < s.nodes.length; i++) {
    if (!s.drawn(i)) continue;
    const x = cam.sx(s.X0[i]);
    const y = cam.sy(s.nodes[i].lane);
    if (x < cam.vp.l || x > cam.vp.r || y < s.openTop || y > cam.vp.b || (Math.abs(x - a.x) < 1 && Math.abs(y - a.y) < 1)) continue;
    soft.push({ x: x - 6, y: y - 6, w: 12, h: 12, cost: 20 });
  }
  return { avoid, soft };
}

// ---------- карточка ----------

/** Знаки лент у имени: золотая точка — линия по Матфею, лазурная — по Луке (как в древе). */
function LineMarks({ id }: { id: string }) {
  const l = onLines(id);
  if (!l.mt && !l.lk) return null;
  return (
    <span class="tc-lines" aria-hidden="true" title={l.mt && l.lk ? 'В родословии по Матфею (Мф 1) и по Луке (Лк 3)' : l.mt ? 'В родословии по Матфею (Мф 1)' : 'В родословии по Луке (Лк 3)'}>
      {l.mt && <i class="mt" />}
      {l.lk && <i class="lk" />}
    </span>
  );
}

function Cmd({ onRun, children, label, title }: { onRun: () => void; children: string; label?: string; title?: string }) {
  return (
    <button type="button" class="cmd" aria-label={label} title={title} onClick={onRun}>
      {children}
    </button>
  );
}

function PersonBody({ id }: { id: string }) {
  const p = byId.get(id)!;
  const dis = disLine(id);
  const c = personDotCmds(id);
  return (
    <>
      <div class="dc-top">
        <Avatar id={id} size={40} />
        <div class="tc-info">
          <div class="tc-nm">
            <span class="nm">{p.name}</span>
            <LineMarks id={id} />
          </div>
          {dis && <div class="tc-dis">{dis}</div>}
          <div class="tc-yrs">{yearsLine(id)}</div>
        </div>
      </div>
      <div class="dc-cmds">
        <Cmd onRun={() => showDetails(id, null)} title="Подробная карточка лица справа">
          Информация
        </Cmd>
        {c.branch && (
          <Cmd
            onRun={() => (c.branch === 'more' ? continueDot(id) : foldDot(id))}
            title={c.branch === 'more' ? 'Показать на небе точки союзов лица: его браки и союз родителей' : 'Убрать точки союзов лица и раскрытое от них'}
          >
            {c.branch === 'more' ? 'Продолжить ветвь' : 'Свернуть ветвь'}
          </Cmd>
        )}
        {c.parents && (
          <Cmd onRun={() => parentsDot(id)} title={c.parents === 'show' ? 'Раскрыть союз родителей: родители, братья и сёстры на небе' : 'Свернуть союз родителей, раскрытый от лица'}>
            {c.parents === 'show' ? 'Родители' : 'Скрыть родителей'}
          </Cmd>
        )}
      </div>
    </>
  );
}

const CERT: Record<string, string> = { inference: 'выв.', interpretation: 'толк.' };

function UnionBody({ u, from }: { u: Union; from: string }) {
  const names = unionNames(u);
  const kind = unionKindLine(u);
  const ref = u.refs[0] ? refLabel(u.refs[0]) : '';
  const kids = u.kids.length && CERT[u.kidsCert] ? `${kidsText(u)}, ${CERT[u.kidsCert]}` : kidsText(u);
  const cmd = unionDotCmd(u, from);
  const up = u.kids.includes(from) && from !== u.a && from !== u.b;
  return (
    <>
      <div class="tc-head">
        <span class="tc-kind">союз</span>
        {ref && <span class="tc-ref">{ref}</span>}
      </div>
      <div class="dc-top">
        <UnionAvatar a={u.a} b={u.b} size={40} />
        <div class="tc-info">
          <div class="tc-nm">
            <span class="nm">{typo(names)}</span>
          </div>
          {kind && <div class="tc-sub">{typo(kind)}</div>}
          <div class="tc-sub">{typo(kids)}</div>
        </div>
      </div>
      <div class="dc-cmds">
        {cmd && (
          <Cmd
            onRun={() => toggleKids(u.id, from)}
            label={cmd.label}
            title={
              up
                ? cmd.open
                  ? 'Убрать с неба родителей, братьев и сестёр и раскрытое от них'
                  : 'Показать на небе родителей, братьев и сестёр'
                : cmd.open
                  ? 'Убрать с неба детей союза и раскрытое от них'
                  : u.kids.length
                    ? 'Показать на небе обоих супругов и детей союза'
                    : 'Показать на небе обоих супругов'
            }
          >
            {cmd.text}
          </Cmd>
        )}
        <Cmd onRun={() => showDetails(unionSpouse(u, from), u.id)} label={typo(`Подробнее о союзе: ${names}`)} title="Карточка союза справа">
          Подробнее
        </Cmd>
      </div>
    </>
  );
}

/** Имя карточки для диктора: «Адам, 4174–3244 гг. до Р. Х.», «Союз Адама и Евы». */
export function dotLabel(at: DotAt): string {
  if (at.kind === 'union') {
    const u = unionById(at.uid);
    return u ? typo(unionTitle(u)) : '';
  }
  const p = byId.get(at.id);
  return p ? typo([p.name, disLine(at.id), yearsLine(at.id)].filter(Boolean).join(', ')) : '';
}

export function DotCard() {
  const ref = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const spot = useRef<string | null>(null);
  const nudged = useRef(false);
  /** высота видимой части неба в прошлом месте карточки и когда она менялась (телефон: лист опускается) */
  const vpSeen = useRef(0);
  const vpAt = useRef(0);
  const size = useRef({ w: 0, h: 0 });
  const outSince = useRef(0);
  const timer = useRef(0);
  /** фокус клавиатуры в карточке: команда, на которой он стоял, может уйти из разметки */
  const inside = useRef(false);
  /** Фокус — на первую команду карточки. */
  const focusFirst = () => ref.current?.querySelector<HTMLElement>('.dc-cmds button')?.focus({ preventScroll: true });
  const at = dotCard.value;
  const on = dotsOn.value;
  const phone = grid.value.phone;

  /** Поставить карточку у знака по нынешнему небу; знак ушёл за край — спрятать, а когда небо встанет, закрыть. */
  const place = () => {
    const el = ref.current;
    const lead = leadRef.current;
    const s = skyRef.current;
    const cur = dotCard.peek();
    if (!el || !lead || !s || !cur) return;
    const a = anchorOf(cur);
    const vp = s.cam.vp;
    const shown = !!a && a.x >= vp.l && a.x <= vp.r && a.y >= s.openTop && a.y <= vp.b;
    clearTimeout(timer.current);
    if (!shown) {
      el.removeAttribute('data-placed');
      lead.hidden = true;
      lastRect = null;
      const now = performance.now();
      if (!outSince.current) outSince.current = now;
      // небо ещё едет (перелёт, вписывание после открытия карточки справа) — знак может вернуться
      if (!s.cam.moving && now - outSince.current > 150) closeDot(el.contains(document.activeElement));
      else timer.current = window.setTimeout(place, 160);
      return;
    }
    outSince.current = 0;
    const bounds = { x: vp.l + DOT_MARGIN, y: s.openTop + DOT_MARGIN, w: vp.r - vp.l - 2 * DOT_MARGIN, h: vp.b - s.openTop - 2 * DOT_MARGIN };
    let q: DotPlace;
    if (grid.peek().phone) {
      const w = Math.round(Math.min(bounds.w, 480));
      if (el.style.width !== `${w}px`) {
        el.style.width = `${w}px`;
        size.current = { w, h: el.offsetHeight };
      }
      q = dockDot(a, size.current.h, { ...bounds, w }, reserve());
      // видимая часть неба ещё меняется (лист карточки опускается до шапки после касания — небо растёт вниз): сдвигать
      // небо рано — после сдвига под «низкий» лист знак и его семья ушли бы под верхнюю кромку; место — когда небо встанет
      const now = performance.now();
      if (vpSeen.current !== bounds.h) {
        vpSeen.current = bounds.h;
        vpAt.current = now;
      }
      const settling = now - vpAt.current < VP_SETTLE_MS;
      if (q.nudge && settling) timer.current = window.setTimeout(place, VP_SETTLE_MS);
      // небо так низко, что карточка закрыла бы знак, — небо поднимается один раз за карточку (дальше его ведёт читатель)
      else if (q.nudge && !nudged.current && !s.cam.moving) {
        nudged.current = true;
        const cam = s.cam;
        cam.animateTo(cam.constrain({ x0: cam.x0, kx: cam.kx, laneTop: cam.laneTop + q.nudge / cam.ky }), 250, skyRef.redraw, reduced());
      }
    } else {
      if (el.style.width) el.style.width = '';
      const { avoid, soft } = obstacles(cur, a);
      q = placeDot(a, size.current, bounds, avoid, soft, spot.current);
    }
    spot.current = q.key;
    el.style.left = `${Math.round(q.x)}px`;
    el.style.top = `${Math.round(q.y)}px`;
    el.dataset.side = q.side;
    el.setAttribute('data-placed', '');
    lastRect = { x: q.x, y: q.y, w: size.current.w, h: size.current.h };
    lead.hidden = !q.lead;
    if (q.lead) Object.assign(lead.style, { left: `${q.lead.x}px`, top: `${Math.round(q.lead.y)}px`, width: `${Math.round(q.lead.w)}px`, height: `${Math.round(q.lead.h)}px` });
    // открыта с клавиатуры — фокус на первую команду, когда карточка встала на место (до этого она невидима)
    if (cur.focus) {
      dotCard.value = { ...cur, focus: false };
      focusFirst();
    }
  };

  // смена выбора не командой карточки, уход с неба «набор», меню звезды — карточка закрывается
  useEffect(() => {
    const offSel = effect(() => {
      const id = selected.value;
      const cur = dotCard.peek();
      if (cur && cur.sel !== id) closeDot(false);
    });
    const offOn = effect(() => {
      if (!dotsOn.value) closeDot(false);
    });
    const offMenu = effect(() => {
      if (skyMenu.value) closeDot(false);
    });
    // Escape с холста, списка неба или без фокуса — снимает карточку первой (одно видимое состояние, D5)
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented || !dotCard.peek()) return;
      const t = document.activeElement;
      const own = !!t && !!ref.current?.contains(t);
      const sky = !t || t === document.body || !!t.closest?.('.sky canvas, #sky-stars');
      if (!own && !sky) return;
      e.preventDefault();
      e.stopPropagation();
      closeDot(true);
    };
    window.addEventListener('keydown', onKey, true);
    // карточка у точки не переживает небо: вид «Древо» снимает небо со страницы
    return () => {
      offSel();
      offOn();
      offMenu();
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(timer.current);
      closeDot(false);
    };
  }, []);

  // карточка следует за небом: каждый кадр неба (viewTick) — место заново
  useEffect(() => {
    if (!at) return;
    nudged.current = false;
    return effect(() => {
      void viewTick.value;
      place();
    });
  }, [at?.kind, at && (at.kind === 'person' ? at.id : at.uid)]);

  // после отрисовки: настоящий размер и место; команда, на которой стоял фокус, ушла из разметки (союз раскрыли от
  // родителя, и «Родители» больше не нужна) — фокус на первую команду карточки, а не в никуда
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !at) return;
    size.current = { w: el.offsetWidth, h: el.offsetHeight };
    place();
    const a = document.activeElement;
    if (a && a !== document.body && !el.contains(a)) inside.current = false;
    else if (inside.current && !el.contains(a)) focusFirst();
  });

  if (!at || !on) return null;
  const u = at.kind === 'union' ? unionById(at.uid) : undefined;
  if (at.kind === 'union' && !u) return null;
  const key = at.kind === 'person' ? at.id : at.uid;
  return (
    <>
      <div ref={leadRef} class="dc-lead" hidden aria-hidden="true" />
      <div
        ref={ref}
        key={key}
        class={['dotcard', at.kind === 'union' && 'dc-union'].filter(Boolean).join(' ')}
        role="dialog"
        aria-label={dotLabel(at)}
        data-kind={at.kind}
        data-id={key}
        data-dock={phone ? '' : undefined}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          closeDot(true);
        }}
        onFocusIn={() => (inside.current = true)}
        onFocusOut={(e) => {
          const to = e.relatedTarget as Node | null;
          // фокус ушёл из карточки сам (не потерялся вместе с командой)
          if (to && !ref.current?.contains(to)) inside.current = false;
        }}
      >
        {at.kind === 'person' ? <PersonBody id={at.id} /> : <UnionBody u={u!} from={at.from} />}
        <Close
          label={at.kind === 'person' ? 'Закрыть карточку у звезды' : 'Закрыть карточку у точки союза'}
          onClick={() => closeDot(!!ref.current?.contains(document.activeElement))}
        />
      </div>
    </>
  );
}
