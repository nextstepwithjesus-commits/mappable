/**
 * Карточка на атласе (этап 11, решения 77, 83; STAGE11.md § 6, § 8): у звезды, у ромба союза или у связи — одна за раз.
 *
 * Карточка у звезды — в любом показе, по щелчку, касанию или Enter на звезде (ввод неба — src/ui/sky/input.ts):
 *  — образ (условный силуэт, решение 74), имя со знаками лент, уточнение, годы;
 *  — блок «Родство» (src/ui/card/kinrows.ts): «Родители», «Жёны» или «Муж», «Мать сына» (мать детей, которую текст
 *    не называет женой; решение 92), «Сыновья», «Дочери» или «Дети» — по союзам, «Братья и сёстры», «Год» — как получен
 *    год; не вошедшее — «ещё N» и «всё родство — ещё N строк», молча ничего не обрезается. Наведение и фокус на имени подсвечивают его линию на небе (previewLinks), наведение
 *    на строку — все линии строки; щелчок по имени выбирает лицо и летит к нему, если его нет на экране; Enter на имени —
 *    карточка связи (selectedLink), фокус на её заголовке; Escape — назад к той же строке. По строке — стрелками;
 *  — команды «Карточка» (подробная справа), «Только его род ▾» (показ «род лица», src/ui/show.ts), «Родство с…», «×»;
 *    в показе «набор» — ещё «Продолжить ветвь» и «Родители» (раскрытие, решение 70).
 * Карточка союза у ромба — супруги, вид связи и стих, дети числом, «другие сыновья и дочери» (Быт 5:4), «Раскрыть
 * детей (N)» или «Свернуть детей», «Карточка союза» (подробная карточка союза справа, как в карточке связи).
 * Карточка связи — при выбранной связи (src/ui/linkstate.ts, selectedLink): заголовок словами родства
 * (src/ui/linkwords.ts), стихи, строки концов («Отец», «Мать», «Сын» — имя-ссылка и годы), «Ленты», «Союз», пометы;
 * команды «Карточка союза» и «Показать концы». Встаёт у точки щелчка или середины пути (linkAnchor — ставит небо).
 *
 * Место (placeCard): у знака, по четырём сторонам, со стороны, противоположной массе семьи. Никогда не закрывает звезду
 * фокуса с подписью, ромбы союзов фокуса, звёзды и подписи семьи первого поколения, органы неба, строку показа и
 * указатели у края; линии семьи — по возможности. Если места нет — в ближний угол неба с отводом 1 px до 240 px.
 * Карточка следует за небом; знак ушёл за край — карточка прячется. На телефоне карточка у звезды — это нижний лист
 * на 214 px (src/ui/Folio.tsx, DotSheet): второй карточки над небом нет.
 *
 * Закрывают её «×», Escape (связь → карточка у звезды → звезда), щелчок по пустому небу, выбор другого лица не
 * командой карточки, выбор второго лица («Родство с…»). Роль — dialog (не модальный) с именем лица, союза или связи.
 */
import { computed, effect, signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, loadedCard } from '../../data/atlas.ts';
import type { Rect } from '../../render/sky.ts';
import type { Union } from '../../engine/unions.ts';
import { linkKeyString, sameLink, type LinkKey } from '../../engine/linkkey.ts';
import { focused, model, pickMode, selected } from '../../state.ts';
import { goTo, skyRef, viewTick } from '../common.tsx';
import { Close, Menu } from '../controls.tsx';
import { Avatar, UnionAvatar } from '../card/Avatar.tsx';
import { askCards, cardsTick, disLine, kidsCommand, onLines, othersNote, othersUnionOf, unionKindLine, yearsLine } from '../card/star.ts';
import { familyOf, kinRows, yearHow, type KinPart, type KinRow } from '../card/kinrows.ts';
import { passportYears, isPeople } from '../card/Masthead.tsx';
import { closePerson, collapseUnion, expanded, opened, openPerson, originOf, plates, selectedUnion, selectUnion, unionById, unionsOf, unions } from '../reveal.ts';
import { linkSet, workSet } from '../work.ts';
import { countShow, setShow, show } from '../show.ts';
import { openShowSheet } from '../panels/Show.tsx';
import { linkAnchor, previewLinks, selectedLink } from '../linkstate.ts';
import { kidsCount, linkInfo, linkSpeech, refsShort, refShort, stepParent, unionName, type LinkInfo } from '../linkwords.ts';
import { grid, unfoldCard } from '../layout.ts';
import { lowScreen, openSheetAt, sheetStop } from '../sheet.ts';
import { focusCardTitle, focusQuietly } from '../focus.ts';
import { skyMenu } from '../panels/Work.tsx';
import { typo } from '../text/typo.ts';
import { capFirst } from '../text/ru.ts';
import { starRadius } from '../../render/glyphs.ts';
import { familyOrderNote, personOrderNote } from '../../render/links.ts';
import { flyToIds, reduced, reserve, screenOf } from './view.ts';
import { plateFocus, rememberFocus, toggleKids } from './starnav.ts';
import { kidsText, unionTitle } from './text.ts';
import '../../styles/dotcard.css';

// ---------- состояние ----------

/** Где открыта карточка: у звезды лица или у ромба союза (from — лицо, у которого стоит ромб). */
export type DotAt = { kind: 'person'; id: string } | { kind: 'union'; uid: string; from: string };
/**
 * Открытая карточка: где, выбранное лицо при открытии (его смена не командой карточки закрывает её), фокус — на первое;
 * until — до этого времени (performance.now) знак за краем карточку не закрывает: небо ещё едет к нему (начало «С Адама»).
 */
export type DotCardState = DotAt & { sel: string | null; focus: boolean; until?: number };

export const dotCard = signal<DotCardState | null>(null);

/**
 * Где щелчок по звезде открывает карточку у звезды: во всех показах (решение 77); нет её только при выборе второго лица
 * («Родство с…», «Разворот с…»): там щелчок выбирает второе лицо.
 */
export const dotsOn = computed(() => !pickMode.value);

// телефон: карточка связи — в нижнем листе на 214 px (DotSheet), как карточка у звезды. Связь выбрана (касанием,
// по адресу «~c», из «Родства»), а лист стоит выше — карточки связи не видно: лист встаёт на это положение. После
// остальных действий выбора (лист нового выбора — src/ui/sheet.ts) — в конце того же хода
if (typeof window !== 'undefined')
  effect(() => {
    const k = selectedLink.value;
    const id = selected.value;
    if (!k || !id || !grid.value.phone) return;
    queueMicrotask(() => {
      if (selectedLink.peek() && selected.peek() && sheetStop.peek() !== 'peek') sheetStop.value = 'peek';
    });
  });

/**
 * Открыть карточку у звезды или ромба союза; focus — поставить фокус в карточку (открыли с клавиатуры); grace — сколько мс
 * карточка ждёт свой знак, если его ещё нет на экране (небо перелетает к нему).
 */
export function openDot(at: DotAt, o: { focus?: boolean; grace?: number } = {}) {
  if (at.kind === 'person' ? !byId.has(at.id) : !unionById(at.uid)) return;
  if (selectedLink.peek()) selectedLink.value = null;
  dotCard.value = { ...at, sel: selected.peek(), focus: !!o.focus, ...(o.grace && typeof performance !== 'undefined' ? { until: performance.now() + o.grace } : {}) };
  // телефон: карточка у звезды — это нижний лист на 214 px (решение 77): лист встаёт на это положение
  if (grid.peek().phone && sheetStop.peek() !== 'peek') sheetStop.value = 'peek';
}

/** Холст неба: сюда возвращается фокус после карточки. */
const canvasEl = () => (typeof document === 'undefined' ? null : document.querySelector<HTMLCanvasElement>('.sky canvas'));

/**
 * Закрыть карточку. refocus — фокус на холст, кольцо клавиатуры — на звезду или ромб союза карточки (Escape, «×»,
 * если фокус был в карточке, или карточка ушла, пока фокус был в ней).
 */
export function closeDot(refocus = false) {
  const at = dotCard.peek();
  if (selectedLink.peek()) selectedLink.value = null;
  if (previewLinks.peek()) previewLinks.value = null;
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

/** Имя «Родства», из которого открыли карточку связи: Escape возвращает фокус на него (§ 8). */
let linkFrom: { key: string; name: string; row: string } | null = null;

/** Открыть карточку связи k (Enter на имени «Родства»): выбор лица не меняется, фокус — на заголовок карточки связи. */
export function openLink(k: LinkKey, from?: { name: string; row: string }) {
  linkFrom = from ? { key: linkKeyString(k) ?? '', ...from } : null;
  previewLinks.value = null;
  selectedLink.value = k;
  focusLinkTitle();
}

/** Закрыть карточку связи: у звезды снова её карточка, фокус — на имя «Родства», с которого пришли. */
export function closeLink(refocus = true) {
  const was = selectedLink.peek();
  if (!was) return;
  selectedLink.value = null;
  const from = linkFrom;
  linkFrom = null;
  if (!refocus) return;
  requestAnimationFrame(() => {
    const card = document.querySelector<HTMLElement>('.dotcard, .sheet-dot');
    const back = from ? card?.querySelector<HTMLElement>(`.dc-row[data-row="${from.row}"] .person[data-id="${CSS.escape(from.name)}"]`) : null;
    if (back) {
      rovingTo(back);
      back.focus({ preventScroll: true });
    } else if (card) (card.querySelector<HTMLElement>('.dc-val .person, .dc-cmds button') ?? card).focus({ preventScroll: true });
    else canvasEl()?.focus({ preventScroll: true });
  });
}

/** Фокус на заголовок карточки связи, когда она появится (не дольше полусекунды). */
function focusLinkTitle(frames = 0) {
  const t = document.querySelector<HTMLElement>('#dc-link-title');
  if (t) focusQuietly(t);
  else if (frames < 30) requestAnimationFrame(() => focusLinkTitle(frames + 1));
}

/** Карточка ставит выбор лица сама («Карточка», «Карточка союза», имя «Родства»): такая смена выбора её не закрывает. */
function selectFromDot(id: string, stop: 'peek' | 'half') {
  const at = dotCard.peek();
  if (at) dotCard.value = { ...at, sel: id, focus: false };
  if (selected.peek() !== id) {
    openSheetAt(stop);
    selected.value = id;
  }
}

// ---------- команды ----------

/** Союзы, чьи ромбы сейчас на небе «набор» (src/ui/reveal.ts, plates). */
const shownUnions = () => new Set(plates.value.map((p) => p.union.id));

export interface PersonDotCmds {
  /** «Продолжить ветвь» — ромбы его союзов не все на небе; «Свернуть ветвь» — они показаны от него */
  branch: 'more' | 'fold' | null;
  /** «Родители» — союз его родителей не раскрыт; «Скрыть родителей» — раскрыт от него */
  parents: 'show' | 'hide' | null;
}

/**
 * Команды раскрытия карточки лица в показе «набор» (решение 70):
 *  — «Продолжить ветвь», если ромбы его союзов показаны не все; иначе «Свернуть ветвь», если они показаны по его щелчку
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

/** «Продолжить ветвь»: ромбы союзов лица — на небо (вниз — его браки, вверх — союз родителей). */
export function continueDot(id: string) {
  openPerson(id);
}

/**
 * «Свернуть ветвь»: свернуть союзы лица, раскрытые от него (дети уходят со всем, что раскрыто от них), и убрать ромбы его
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
 * Команда раскрытия у карточки союза. Ромб у лица-ребёнка (союз его родителей): «Раскрыть родителей» — родители, братья
 * и сёстры на небе, «Скрыть родителей». Ромб у супруга: «Раскрыть детей (3)», «Раскрыть ещё (6)» (часть детей уже на
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

/** Кого выбрать для карточки союза справа: супруга, который на небе (лицо у ромба, если это супруг), иначе лицо у ромба. */
export function unionSpouse(u: Union, from: string): string {
  if (from === u.a || from === u.b) return from;
  return [u.a, u.b].find((x): x is string => !!x && workSet.peek().has(x)) ?? from;
}

/** Показ «набор» своего набора: команды раскрытия у карточек (решение 70); в других показах их нет. */
const revealOn = () => show.value.kind === 'set' && !linkSet.value;

/**
 * «Карточка» и «Карточка союза»: подробная карточка справа — лицо выбрано (карточка союза сменяется карточкой лица), свёрнутая
 * в корешок — разворачивается, на телефоне лист поднимается до половины; фокус — на заголовок карточки.
 */
function showDetails(id: string, uid: string | null) {
  const phone = grid.peek().phone;
  selectFromDot(id, phone ? 'half' : 'peek');
  if (uid) selectUnion(uid);
  else if (selectedUnion.peek()) selectUnion(null);
  if (phone) sheetStop.value = 'half';
  else if (grid.peek().spine) unfoldCard();
  if (!uid) focusCardTitle(id);
  else focusUnionTitle();
}

/** Фокус на заголовок карточки союза справа, когда она появится (не дольше полусекунды). */
function focusUnionTitle(frames = 0) {
  const t = document.querySelector<HTMLElement>('.folio #union-title');
  if (t) focusQuietly(t);
  else if (frames < 30) requestAnimationFrame(() => focusUnionTitle(frames + 1));
}

/** «Родство с…»: выбор второго лица для «Родства»; карточка у звезды уступает место строке выбора. */
function kinshipWith(id: string) {
  if (selected.peek() !== id) selected.value = id;
  pickMode.value = 'kinship';
}

/** «Только его род ▾»: показ «род лица» — потомки, предки или оба, все поколения, по отцам (§ 7). */
export function lineageShow(id: string, dir: 'down' | 'up' | 'both') {
  setShow({ kind: 'lineage', id, dir, gen: null, by: 'father' }, { anchor: id });
}

// ---------- место ----------

export type DotSide = 's' | 'e' | 'n' | 'w';
/** Порядок сторон: под знаком, справа, над ним, слева. */
export const DOT_SIDES: readonly DotSide[] = ['s', 'e', 'n', 'w'];
/** Длина отвода от края знака до карточки, px. */
export const DOT_LEAD = 10;
/** Телефон: небо поднимается под карточку, только когда его высота не менялась столько мс (лист карточки встал). */
export const VP_SETTLE_MS = 300;
/** Ширина карточки у звезды, px (dotcard.css). */
const DOT_W = 300;
/** Отступ карточки от краёв видимой части неба, px. */
export const DOT_MARGIN = 6;
/** Самый длинный отвод к карточке в углу неба, px (§ 6). */
export const CORNER_LEAD_MAX = 240;
/** Цена закрытой запретной области (§ 6: «никогда»): больше любой суммы мягких цен. */
const HARD = 100000;

/** Знак на экране: середина и радиус с кольцом выбора, px холста. */
export type DotAnchor = { x: number; y: number; r: number };
/**
 * Место карточки: левый верхний угол, сторона, ключ места (для постоянства) и отвод (прямоугольник толщиной 1 px) или null;
 * line — отвод к карточке в углу неба (отрезок); nudge — на сколько px сдвинуть небо (телефон, низкое небо).
 */
export type DotPlace = {
  x: number;
  y: number;
  side: DotSide | 'dock' | 'corner';
  key: string;
  lead: Rect | null;
  line?: { x1: number; y1: number; x2: number; y2: number };
  nudge?: number;
  /** placeCard: место не закрывает ничего запретного (false — свободного места не нашлось, закрыто меньше всего) */
  free?: boolean;
};
/** Что карточке лучше не закрывать, и во что обходится закрыть: имя — 30, звезда и ромб — 20, органы неба — 30. */
export type Obstacle = Rect & { cost: number };
/** Отрезок линии семьи: закрыть его — мягкая цена (§ 6: «линий семьи по возможности не закрывает»). */
export type Segment = { x1: number; y1: number; x2: number; y2: number; cost: number };

const cross = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Площадь пересечения прямоугольников, px². */
export const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Пересекает ли отрезок (горизонтальный или вертикальный — линии семьи ортогональны) прямоугольник. */
function segCross(s: Segment, r: Rect): boolean {
  const x0 = Math.min(s.x1, s.x2);
  const x1 = Math.max(s.x1, s.x2);
  const y0 = Math.min(s.y1, s.y2);
  const y1 = Math.max(s.y1, s.y2);
  return x0 <= r.x + r.w && x1 >= r.x && y0 <= r.y + r.h && y1 >= r.y;
}

/** Пересекаются ли отрезки a и b (концы — не в счёт: отвод начинается у знака). */
function segsCross(a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const d2 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  const d3 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const d4 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** Проходит ли отрезок через прямоугольник (отсечение Лианга — Барски). */
function segThrough(sg: { x1: number; y1: number; x2: number; y2: number }, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = sg.x2 - sg.x1;
  const dy = sg.y2 - sg.y1;
  const edges: [number, number][] = [
    [-dx, sg.x1 - r.x],
    [dx, r.x + r.w - sg.x1],
    [-dy, sg.y1 - r.y],
    [dy, r.y + r.h - sg.y1],
  ];
  for (const [pp, q] of edges) {
    if (pp === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Насколько карточка может отойти от знака по длинному отводу, px: сперва — вплотную. */
const REACH = { ns: [0, 20, 40, 64], ew: [0, 24, 48] };

/**
 * Где карточке размера size стоять у знака a в пределах bounds. Места — по четырём сторонам (под знаком, справа, над ним,
 * слева) с отводом разной длины и со сдвигом вдоль стороны; у каждого — штраф: не помещается целиком — 1000, закрывает сам
 * знак — 500, avoid — по 100, запретные области (hard) — HARD, soft — их цена, отрезки линий семьи (lines) — их цена;
 * сторона к массе семьи (mass: −1…1 по x и y) — до 12; длинный отвод и сдвиг — немного, дальше — порядок сторон. Место
 * прошлого кадра prev получает поблажку: карточка не прыгает, пока небо сдвигают. Отвод — перпендикуляр к краю карточки.
 */
export function placeDot(
  a: DotAnchor,
  size: { w: number; h: number },
  bounds: Rect,
  avoid: readonly Rect[] = [],
  soft: readonly Obstacle[] = [],
  prev: string | null = null,
  hard: readonly Rect[] = [],
  lines: readonly Segment[] = [],
  mass: { x: number; y: number } | null = null,
): DotPlace & { score: number } {
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
        for (const q of hard) if (cross(r, q)) score += HARD;
        for (const q of soft) if (cross(r, q)) score += q.cost;
        for (const s of lines) if (segCross(s, r)) score += s.cost;
        // сторона, противоположная массе семьи: дети правее — карточка не справа; родители выше — не сверху
        if (mass) {
          const dx = side === 'e' ? 1 : side === 'w' ? -1 : 0;
          const dy = side === 's' ? 1 : side === 'n' ? -1 : 0;
          score += Math.max(0, dx * mass.x + dy * mass.y) * 12;
        }
        if (key === prev) score -= 10;
        if (!best || score < best.score) best = { x, y, side, key, lead, score, out };
      }
  });
  const b = best!;
  // нигде не помещается целиком — лучшее место, сдвинутое внутрь неба, без отвода
  if (b.out) return { x: clampX(b.x), y: clampY(b.y), side: b.side, key: b.key, lead: null, score: b.score };
  return { x: b.x, y: b.y, side: b.side, key: b.key, lead: b.lead, score: b.score };
}

/** Сколько знак может пропадать с неба, пока карточка ждёт его, мс: дольше перехода показа (450 мс, § 10). */
const OUT_MS = 650;

/** Шаг перебора мест карточки вдали от знака, px. */
const GRID = 16;

/**
 * Место карточки с запретными областями (§ 6; Я25): лучшее место у знака (placeDot); если оно закрывает запретное —
 * ближайшее к знаку место на небе, где карточка ничего запретного не закрывает (перебор по сетке 16 px; мягкие цены и
 * сторона массы семьи — как у placeDot), с отводом-отрезком от знака к ближней точке карточки. Отвод длиннее
 * CORNER_LEAD_MAX — только если ближе места нет. Свободного места нет нигде (семья на всё небо) — место, где карточка
 * закрывает запретного меньше всего по площади, но никогда — never (органы неба, строка показа, указатели у края) и сам
 * знак; нет и такого — лучшее место у знака.
 */
export function placeCard(
  a: DotAnchor,
  size: { w: number; h: number },
  bounds: Rect,
  o: {
    avoid?: readonly Rect[];
    soft?: readonly Obstacle[];
    prev?: string | null;
    hard?: readonly Rect[];
    keep?: readonly Rect[];
    never?: readonly Rect[];
    lines?: readonly Segment[];
    mass?: { x: number; y: number } | null;
    /** мелкая сетка, если по крупной места нет (пока небо едет — нет: кадр не должен ждать перебора) */
    fine?: boolean;
  } = {},
): DotPlace {
  const never = o.never ?? [];
  const keep = o.keep ?? [];
  const hard = [...never, ...keep, ...(o.hard ?? [])];
  const soft = o.soft ?? [];
  const lines = o.lines ?? [];
  const at = placeDot(a, size, bounds, o.avoid, soft, o.prev ?? null, hard, lines, o.mass ?? null);
  const mark = { x: a.x - a.r, y: a.y - a.r, w: 2 * a.r, h: 2 * a.r };
  const free = (r: Rect) => !cross(r, mark) && !hard.some((q) => cross(r, q));
  if (free({ x: at.x, y: at.y, ...size })) return { ...strip(at), free: true };
  const { w, h } = size;
  const x1 = bounds.x + bounds.w - w;
  const y1 = bounds.y + bounds.h - h;
  if (x1 < bounds.x || y1 < bounds.y) return { ...strip(at), free: false };
  // прошлое место вдали от знака ещё свободно — карточка не прыгает, пока небо сдвигают
  const pm = o.prev ? /^g(-?\d+),(-?\d+)$/.exec(o.prev) : null;
  const near = (x: number, y: number) => Math.hypot(Math.max(x, Math.min(x + w, a.x)) - a.x, Math.max(y, Math.min(y + h, a.y)) - a.y);
  /** Места по сетке step: от ближних к знаку; прошлое место — с поблажкой. */
  const grid = (step: number) => {
    const out: { x: number; y: number; d: number }[] = [];
    for (let x = bounds.x; x <= x1 + 0.5; x += step) for (let y = bounds.y; y <= y1 + 0.5; y += step) out.push({ x: Math.min(x, x1), y: Math.min(y, y1), d: near(Math.min(x, x1), Math.min(y, y1)) });
    if (pm) out.push({ x: Math.min(+pm[1], x1), y: Math.min(+pm[2], y1), d: near(Math.min(+pm[1], x1), Math.min(+pm[2], y1)) - 12 });
    return out.sort((p, q) => p.d - q.d);
  };
  /** Лучшее свободное место среди cands: ближнее к знаку, с мягкими ценами и стороной массы семьи. */
  const pick = (cands: { x: number; y: number; d: number }[]) => {
    let out: { x: number; y: number; score: number } | null = null;
    let first = Infinity;
    for (const c of cands) {
      // первое свободное место найдено: дальше него — не больше чем на 64 px
      if (c.d > first + 64) break;
      const r = { x: c.x, y: c.y, w, h };
      if (!free(r)) continue;
      if (first === Infinity) first = c.d;
      let score = c.d + (c.d > CORNER_LEAD_MAX ? 200 : 0);
      for (const q of soft) if (cross(r, q)) score += q.cost;
      for (const sg of lines) if (segCross(sg, r)) score += sg.cost;
      // отвод к карточке вдали от знака не пересекает линий семьи и не идёт через звёзды и подписи
      const lead = { x1: a.x, y1: a.y, x2: Math.max(c.x, Math.min(c.x + w, a.x)), y2: Math.max(c.y, Math.min(c.y + h, a.y)) };
      if (c.d > a.r + 2) {
        for (const sg of lines) if (segsCross(lead, sg)) score += 30;
        for (const q of [...keep, ...o.hard ?? []]) if (segThrough(lead, q)) score += 40;
        for (const q of soft) if (segThrough(lead, q)) score += 10;
      }
      if (o.mass) {
        const dx = Math.sign(c.x + w / 2 - a.x);
        const dy = Math.sign(c.y + h / 2 - a.y);
        score += Math.max(0, dx * o.mass.x + dy * o.mass.y) * 12;
      }
      if (!out || score < out.score) out = { x: c.x, y: c.y, score };
    }
    return out;
  };
  let cands = grid(GRID);
  let best = pick(cands);
  // по сетке 16 px свободного нет — мельче, 6 px: щель между подписями семьи бывает уже шага сетки
  if (!best && o.fine !== false) {
    cands = grid(6);
    best = pick(cands);
  }
  const found = !!best;
  if (!best) {
    // свободного места нет: сперва — не закрывая never и keep, меньше всего подписей семьи по площади; нет и такого —
    // не закрывая never, меньше всего keep (в 10 раз дороже) и подписей; never и сам знак — никогда
    const least = (tier: readonly Rect[], weight: (q: Rect) => number) => {
      let out: { x: number; y: number; score: number } | null = null;
      for (const c of cands) {
        const r = { x: c.x, y: c.y, w, h };
        if (cross(r, mark) || tier.some((q) => cross(r, q))) continue;
        let score = c.d * 0.5;
        for (const q of hard) score += overlap(r, q) * weight(q);
        if (!out || score < out.score) out = { x: c.x, y: c.y, score };
      }
      return out;
    };
    const kept = new Set(keep);
    best = least([...never, ...keep], () => 4) ?? least(never, (q) => (kept.has(q) ? 40 : 4));
    if (!best) return { ...strip(at), free: false };
  }
  const px = Math.max(best.x, Math.min(best.x + w, a.x));
  const py = Math.max(best.y, Math.min(best.y + h, a.y));
  const len = Math.hypot(px - a.x, py - a.y);
  const line = len > a.r + 2 ? { x1: a.x + ((px - a.x) / len) * a.r, y1: a.y + ((py - a.y) / len) * a.r, x2: px, y2: py } : undefined;
  return { x: best.x, y: best.y, side: 'corner', key: `g${Math.round(best.x)},${Math.round(best.y)}`, lead: null, ...(line ? { line } : {}), free: found };
}
const strip = (p: DotPlace & { score?: number }): DotPlace => {
  const { score: _s, ...rest } = p;
  void _s;
  return rest;
};

/**
 * На телефоне без листа карточки (лицо не выбрано) — у нижнего края неба во всю ширину видимой части; если там карточка
 * закрыла бы знак (с запасом 10 px) — у верхнего края под строками и органами (soft), знак тогда ниже неё. Небо так низко,
 * что знак закрыт и там и там, — карточка у нижнего края, а nudge говорит, на сколько поднять небо.
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
export const dotRect = () => (dotCard.peek() || selectedLink.peek() ? lastRect : null);

/** Радиус звезды лица на экране с кольцом выбора, px. */
function starR(id: string): number {
  const s = skyRef.current;
  const p = byId.get(id);
  if (!s || !p) return 8;
  return starRadius(p.magnitude, Math.max(0.7, Math.min(1.25, s.cam.ky / 18))) + (p.sex === 'f' ? 7 : 5);
}

/** Звезда лица на экране (нарисована и в кадре) или null. */
function starAt(id: string): DotAnchor | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  const i = s.indexOf(id);
  if (i === undefined || !s.drawn(i)) return null;
  const q = screenOf(id);
  return q ? { ...q, r: starR(id) } : null;
}

/** Знак карточки на экране: звезда лица, ромб союза (поле попадания Sky.plateHits) или точка связи (linkAnchor). */
function anchorOf(at: DotAt | null, link: LinkKey | null): DotAnchor | null {
  const s = skyRef.current;
  if (!s || !s.model) return null;
  if (link) {
    const p = linkAnchor.peek();
    if (p) return { x: p.x, y: p.y, r: 6 };
    // небо ещё не поставило точку связи — у звезды карточки, иначе у младшего конца связи
    if (at?.kind === 'person') return starAt(at.id);
    const i = linkInfo(link);
    const end = i?.ends.find((e) => e.side === 'to') ?? i?.ends[0];
    return end ? starAt(end.id) : null;
  }
  if (!at) return null;
  if (at.kind === 'person') return starAt(at.id);
  const h = s.plateHits.find((q) => q.uid === at.uid);
  if (!h) return null;
  // центр ромба и его полуразмер (src/render/plates.ts, PlateHit) — с кольцом выбора
  return { x: h.cx, y: h.cy, r: h.r + 4 };
}

/** Прямоугольник подписи звезды id в последнем кадре (журнал подписей неба) или null. */
const labelOf = (id: string): Rect | null => {
  const s = skyRef.current;
  const b = s?.ledger.boxes.find((x) => x.kind === 'star' && x.id === id);
  return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
};

/**
 * Запретные области места карточки (§ 6, уточнение координатора; Я25) по двум ярусам:
 *  — обязательные (never) — карточка не закрывает их никогда: органы неба, строку показа, лист «Показ», указатели у края,
 *    звезду фокуса с подписью, у карточки связи — концы связи с подписями;
 *  — желательные — звёзды семьи первого поколения и ромбы союзов фокуса (keep), подписи семьи (hard): их карточка не
 *    закрывает, пока на небе есть место; если места нет, карточка ужимается до краткого вида и встаёт там, где закрывает
 *    меньше всего желательного (placeCard). Небо ради карточки не сдвигается.
 * Мягкие цены (soft, lines) — линии семьи (след родителя до ствола, ствол, зубец), прочие подписи, звёзды и ромбы.
 * focus — лицо, чья семья бережётся (у карточки связи — выбранное лицо); ends — концы связи (у карточки союза — супруги
 * и дети союза: они тоже семья, желательные).
 */
function obstacles(
  focus: string | null,
  ends: readonly string[],
  a: DotAnchor,
  endsMust: boolean,
): { never: Rect[]; keep: Rect[]; hard: Rect[]; soft: Obstacle[]; lines: Segment[]; mass: { x: number; y: number } | null } {
  const s = skyRef.current!;
  const never: Rect[] = [...reserve(), ...s.edgeHits.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))];
  const keepR: Rect[] = [];
  const hard: Rect[] = [];
  const soft: Obstacle[] = [];
  const lines: Segment[] = [];
  /** обязательные лица: фокус и концы связи; желательные — семья фокуса (и концы, если они не обязательны) */
  const must = new Set<string>(endsMust ? ends : []);
  if (focus) must.add(focus);
  const family = focus ? familyOf(focus) : [];
  const want = new Set<string>([...family, ...(endsMust ? [] : ends)]);
  for (const id of must) want.delete(id);
  let mx = 0;
  let my = 0;
  let mn = 0;
  const fp = focus ? starAt(focus) : null;
  for (const id of [...must, ...want]) {
    const q = starAt(id);
    if (!q) continue;
    const star = { x: q.x - q.r, y: q.y - q.r, w: 2 * q.r, h: 2 * q.r };
    const lb = labelOf(id);
    if (must.has(id)) {
      never.push(star);
      if (lb) never.push(lb);
    } else {
      keepR.push(star);
      if (lb) hard.push(lb);
    }
    if (fp && id !== focus && family.includes(id)) {
      mx += Math.sign(q.x - fp.x);
      my += Math.sign(q.y - fp.y);
      mn++;
      // линия семьи по грамматике (§ 2): след старшего до ствола, ствол, зубец к младшему
      const [p, c] = q.x >= fp.x ? [fp, q] : [q, fp];
      const tx = c.x - 9;
      lines.push({ x1: p.x, y1: p.y, x2: tx, y2: p.y, cost: 40 }, { x1: tx, y1: p.y, x2: tx, y2: c.y, cost: 40 }, { x1: tx, y1: c.y, x2: c.x, y2: c.y, cost: 40 });
    }
  }
  // ромбы союзов фокуса — желательные; прочие ромбы — по возможности
  const focusUnions = new Set(focus ? [...unionsOf(focus), ...originOf(focus)].map((u) => u.id) : []);
  for (const h of s.plateHits) {
    const r = { x: h.cx - 6, y: h.cy - 6, w: 12, h: 12 };
    if (Math.abs(h.cx - a.x) <= 1 && Math.abs(h.cy - a.y) <= 1) continue;
    if (focusUnions.has(h.uid)) keepR.push(r);
    else soft.push({ ...r, cost: 20 });
  }
  const own = new Set([...must, ...want]);
  for (const b of s.ledger.boxes) {
    if (b.kind === 'star' && b.id && own.has(b.id)) continue;
    // подписи лиц, обрывков и ромбов, пометы семей, подписи лент, знаки свёрнутого — тоже надписи неба: карточка их не
    // закрывает, если есть место (рамка листа и указатели у края — органы неба, они обязательные)
    if (b.kind === 'frame' || b.kind === 'edge' || (b.kind === 'plate' && !b.text)) continue;
    soft.push({ x: b.x, y: b.y, w: b.w, h: b.h, cost: b.kind === 'star' ? 30 : 20 });
  }
  const cam = s.cam;
  for (let i = 0; i < s.nodes.length; i++) {
    if (!s.drawn(i)) continue;
    const x = cam.sx(s.X0[i]);
    const y = cam.sy(s.nodes[i].lane);
    if (x < cam.vp.l || x > cam.vp.r || y < s.openTop || y > cam.vp.b || (Math.abs(x - a.x) < 1 && Math.abs(y - a.y) < 1)) continue;
    soft.push({ x: x - 6, y: y - 6, w: 12, h: 12, cost: 20 });
  }
  return { never, keep: keepR, hard, soft, lines, mass: mn ? { x: mx / mn, y: my / mn } : null };
}

// ---------- части карточки ----------

/** Знаки лент у имени: золотая точка — линия по Матфею, лазурная — по Луке. */
function LineMarks({ id }: { id: string }) {
  const l = onLines(id);
  if (!l.mt && !l.lk) return null;
  return (
    <span class="dc-lines" aria-hidden="true" title={l.mt && l.lk ? 'В родословии по Матфею (Мф 1) и по Луке (Лк 3)' : l.mt ? 'В родословии по Матфею (Мф 1)' : 'В родословии по Луке (Лк 3)'}>
      {l.mt && <i class="mt" />}
      {l.lk && <i class="lk" />}
    </span>
  );
}

function Cmd({ onRun, children, label, title, cls, expanded }: { onRun: () => void; children: string; label?: string; title?: string; cls?: string; expanded?: boolean }) {
  return (
    <button type="button" class={cls ? `cmd ${cls}` : 'cmd'} aria-label={label} aria-expanded={expanded} title={title} onClick={onRun}>
      {children}
    </button>
  );
}

/** Сколько имён строки видно сразу (строка — в одну строку текста: карточка 300 × 180–260 px, § 6); остальные — «ещё N». Родители — все. */
const ROW_NAMES: Record<string, number> = { parents: 99, spouses: 2, coparents: 2, children: 2, siblings: 2, year: 99 };

/** Перенести остановку Tab строки на имя el (одна остановка на строку «Родства», по строке — стрелками). */
function rovingTo(el: HTMLElement) {
  const row = el.closest('.dc-row');
  if (!row) return;
  for (const b of row.querySelectorAll<HTMLElement>('.person, .dc-more')) b.tabIndex = b === el ? 0 : -1;
}

/** Ключ связи — строкой для сравнения. */
const ks = (k: LinkKey) => linkKeyString(k) ?? '';

/**
 * Строка «Родства»: подпись и имена. Наведение на строку — её линии на небе; на имя и фокус — линия этого имени. Щелчок по
 * имени — выбор лица (и перелёт, если его нет на экране); Enter — карточка связи. По именам строки — стрелки, Home, End.
 */
function KinRowView({ row, idx, compact }: { row: KinRow; idx: number; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const names = row.parts.filter((p): p is Extract<KinPart, { t: 'name' }> => p.t === 'name');
  const limit = compact ? 3 : (ROW_NAMES[row.kind] ?? 5);
  const cut = !all && names.length > limit + 1 ? names[limit - 1] : null;
  const shown: KinPart[] = [];
  let seen = 0;
  for (const p of row.parts) {
    if (cut && seen >= limit) break;
    shown.push(p);
    if (p.t === 'name') seen++;
  }
  // лишний хвост текста после последнего видимого имени (разделитель) — не нужен
  while (cut && shown.length && shown[shown.length - 1].t === 'text' && /^[;,]/.test((shown[shown.length - 1] as { text: string }).text)) shown.pop();
  const rest = cut ? names.length - limit : 0;
  const preview = (keys: readonly LinkKey[] | null) => {
    previewLinks.value = keys && keys.length ? keys : null;
  };
  const rowKey = `${row.kind}${idx}`;
  // разделитель сразу за именем: «Сын Давида и Вирсавии» + «, » не расходятся по строкам
  const glued = new Set<number>();
  shown.forEach((p, i) => {
    const prev = shown[i - 1];
    if (p.t === 'text' && /^[,;]/.test(p.text) && prev?.t === 'name') glued.add(i);
  });
  let first = true;
  return (
    <div class={`dc-row ${row.kind}`} data-row={rowKey} onMouseEnter={() => preview(row.keys)} onMouseLeave={() => preview(null)}>
      <dt class="dc-lbl">{row.label}</dt>
      <dd class="dc-val">
        {shown.map((p, i) => {
          if (p.t === 'text') {
            // запятая или точка с запятой за именем — внутри кнопки имени (.sep, ниже): строка не начинается с «,»
            const text = glued.has(i) ? p.text.slice(1) : p.text;
            return text ? (
              <span key={i} class={row.kind === 'year' ? undefined : 'txt'}>
                {typo(text)}
              </span>
            ) : null;
          }
          const q = byId.get(p.id);
          const tab = first ? 0 : -1;
          first = false;
          const tip = linkInfo(p.key);
          const btn = (
            <button
              key={i}
              type="button"
              class="person"
              data-id={p.id}
              data-link={ks(p.key)}
              tabIndex={tab}
              title={tip ? `${tip.title}${tip.refs[0] ? ` (${refShort(tip.refs[0])})` : ''}. Щелчок — выбрать; Enter — карточка связи` : undefined}
              aria-description="Enter — карточка связи; пробел — выбрать лицо"
              onMouseEnter={(e) => {
                e.stopPropagation();
                preview([p.key]);
              }}
              onMouseLeave={() => preview(row.keys)}
              onFocus={(e) => {
                rovingTo(e.currentTarget as HTMLElement);
                preview([p.key]);
              }}
              onBlur={() => preview(null)}
              onKeyDown={(e) => {
                const el = e.currentTarget as HTMLElement;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  openLink(p.key, { name: p.id, row: rowKey });
                  return;
                }
                const items = [...(el.closest('.dc-row')?.querySelectorAll<HTMLElement>('.person, .dc-more') ?? [])];
                const j = items.indexOf(el);
                const to =
                  e.key === 'ArrowRight' ? items[j + 1] : e.key === 'ArrowLeft' ? items[j - 1] : e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : undefined;
                if (!to) return;
                e.preventDefault();
                e.stopPropagation();
                rovingTo(to);
                to.focus();
              }}
              onClick={() => {
                previewLinks.value = null;
                if (q) goTo(p.id);
              }}
            >
              <span class="nm">{q?.name ?? p.id}</span>
              {/* разделитель за именем — в той же строке, что последнее слово имени, без черты ссылки; диктору не нужен */}
              {glued.has(i + 1) ? (
                <span class="sep" aria-hidden="true">
                  {(shown[i + 1] as { text: string }).text[0]}
                </span>
              ) : null}
            </button>
          );
          return btn;
        })}
        {rest > 0 && (
          <>
            {' и '}
            <button
              type="button"
              class="dc-more"
              tabIndex={-1}
              aria-label={`ещё ${rest}: показать всех`}
              onClick={(e) => {
                const row = (e.currentTarget as HTMLElement).closest('.dc-row');
                setAll(true);
                requestAnimationFrame(() => {
                  const next = row?.querySelectorAll<HTMLElement>('.person')[limit];
                  if (next) {
                    rovingTo(next);
                    next.focus();
                  }
                });
              }}
            >
              {`ещё ${rest}`}
            </button>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * Блок «Родство»: 3–5 строк (решение 77). compact — телефон на 214 px: две строки; brief — краткий вид (§ 6): одна
 * строка и команда «всё родство» (onAll) — карточка снова полная, на месте, где закрывает меньше всего.
 */
export function KinBlock({ id, compact = false, brief = false, onAll }: { id: string; compact?: boolean; brief?: boolean; onAll?: () => void }) {
  void cardsTick.value;
  void model.value;
  // запись § 9 о неназванной жене («познал Каин жену свою», Быт 4:17) — в томе карточки: подгрузить (решение 92)
  useEffect(() => askCards([id]), [id]);
  // «Год»: помета порядка с верным диапазоном стихов — personOrderNote (src/render/links.ts, стык 5)
  const rows = kinRows(id, yearHow(id, personOrderNote(id, model.value)));
  // телефон (лист на 214 px) — две строки; краткий вид (семья заняла всё небо, § 6) — одна: родители, иначе супруги
  const shown = brief
    ? rows.filter((r) => r.kind !== 'year' && r.kind !== 'siblings').slice(0, 1)
    : compact
      ? rows.filter((r) => r.kind !== 'year' && r.kind !== 'siblings').slice(0, 2)
      : rows;
  if (!shown.length) return null;
  // ничего не обрезается молча (решение 92): не вошедшие строки — «всё родство — ещё N строк»; на телефоне — лист
  // поднимается до половины, к разделам родства подробной карточки
  const all = onAll ?? (compact ? () => kinInSheet() : undefined);
  const more = (brief || compact) && all ? rows.length - shown.length : 0;
  return (
    <dl class="dc-kin" aria-label="Родство">
      {shown.map((r, i) => (
        <KinRowView key={`${r.kind}${i}`} row={r} idx={i} compact={compact} />
      ))}
      {more > 0 && (
        <div class="dc-row all">
          <dt class="dc-lbl" />
          <dd class="dc-val">
            <button type="button" class="dc-more" title={compact ? 'Поднять лист: родство — в разделах 6 и 9–12 карточки' : 'Показать всё «Родство» в карточке'} onClick={all}>
              {`всё родство — ещё ${more} ${more === 1 ? 'строка' : more < 5 ? 'строки' : 'строк'}`}
            </button>
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Телефон: «всё родство» листа на 214 px — лист поднимается до половины, к первому разделу родства подробной карточки
 * (§ 6, иначе § 9), фокус — на его заголовок.
 */
function kinInSheet() {
  sheetStop.value = 'half';
  window.setTimeout(() => {
    const sec = document.querySelector<HTMLElement>('.folio #sec-6, .folio #sec-9, .folio #sec-10');
    if (!sec) return;
    sec.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    focusQuietly(sec.querySelector<HTMLElement>('h4') ?? sec);
  }, 320);
}

/** «Только его род ▾»: потомки, предки, предки и потомки — по отцам, все поколения; «Настроить…» — лист «Показ». */
function LineageMenu({ id }: { id: string }) {
  const item = (dir: 'down' | 'up' | 'both', label: string) => {
    const n = countShow({ kind: 'lineage', id, dir, gen: null, by: 'father' });
    return { key: dir, label: typo(`${label} — ${n}`), onSelect: () => lineageShow(id, dir) };
  };
  return (
    <Menu
      class="dc-lineage"
      label="Только его род ▾"
      title="Показать на небе только род лица: потомков, предков или тех и других"
      items={[
        item('down', 'Потомки'),
        item('up', 'Предки'),
        item('both', 'Предки и потомки'),
        { key: 'more', label: 'Настроить…', sep: true, onSelect: () => openShowSheet({ focus: 'lineage', person: id }) },
      ]}
    />
  );
}

export function PersonBody({ id, compact = false, brief = false, onAll }: { id: string; compact?: boolean; brief?: boolean; onAll?: () => void }) {
  const p = byId.get(id)!;
  const dis = disLine(id);
  const phone = grid.value.phone;
  const c = revealOn() ? personDotCmds(id) : { branch: null, parents: null };
  return (
    <>
      <div class="dc-top">
        {!brief && <Avatar id={id} size={40} />}
        <div class="dc-info">
          <div class="dc-nm">
            <span class="nm">{p.name}</span>
            <LineMarks id={id} />
          </div>
          {dis && !brief && <div class="dc-dis">{dis}</div>}
          <div class="dc-yrs">{yearsLine(id)}</div>
        </div>
      </div>
      <KinBlock id={id} compact={compact} brief={brief} onAll={onAll} />
      <div class="dc-cmds">
        {/* на телефоне «Карточка ▴» разворачивает лист карточки (как «Развернуть» шапки листа) — кнопка с aria-expanded */}
        <Cmd
          onRun={() => showDetails(id, null)}
          title="Подробная карточка лица: 24 раздела"
          cls="dc-card"
          label={phone ? 'Карточка: развернуть лист' : undefined}
          expanded={phone ? false : undefined}
        >
          {phone ? 'Карточка ▴' : 'Карточка'}
        </Cmd>
        <LineageMenu id={id} />
        <Cmd onRun={() => kinshipWith(id)} title="Как связаны это лицо и второе: выберите его на небе или в поиске">
          Родство с…
        </Cmd>
      </div>
      {(c.branch || c.parents) && !brief && (
        <div class="dc-cmds">
          {c.branch && (
            <Cmd
              onRun={() => (c.branch === 'more' ? continueDot(id) : foldDot(id))}
              title={c.branch === 'more' ? 'Показать на небе ромбы союзов лица: его браки и союз родителей' : 'Убрать ромбы союзов лица и раскрытое от них'}
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
      )}
    </>
  );
}

const CERT: Record<string, string> = { inference: 'выв.', interpretation: 'толк.' };

/** «Другие сыновья и дочери» (Быт 5:4): у союза отца, который «родил сынов и дочерей», — строка со стихом. */
function othersLine(u: Union): string | null {
  void cardsTick.value;
  if (!u.a || othersUnionOf(unions, u.a)?.id !== u.id) return null;
  const card = loadedCard(u.a);
  if (!card) {
    askCards([u.a]);
    return null;
  }
  const f = othersNote(card);
  return f ? `Другие сыновья и дочери: имена не названы${f.refs[0] ? ` (${refShort(f.refs[0])})` : ''}` : null;
}

function UnionBody({ u, from, brief = false }: { u: Union; from: string; brief?: boolean }) {
  const names = unionName(u);
  const kind = unionKindLine(u);
  const ref = u.refs[0] ? refShort(u.refs[0]) : '';
  const kids = u.kids.length && CERT[u.kidsCert] ? `${kidsText(u)}, ${CERT[u.kidsCert]}` : kidsText(u);
  const cmd = revealOn() ? unionDotCmd(u, from) : null;
  const up = u.kids.includes(from) && from !== u.a && from !== u.b;
  const others = othersLine(u);
  // помета порядка с верным диапазоном стихов (стык 5; src/render/links.ts): на небе её больше нет (Г9)
  const order = familyOrderNote(u.id, model.value);
  return (
    <>
      <div class="dc-top">
        {!brief && <UnionAvatar a={u.a} b={u.b} size={40} />}
        <div class="dc-info">
          <div class="dc-nm">
            <span class="nm">{typo(names)}</span>
          </div>
          {kind && !brief && <div class="dc-sub">{typo(kind)}</div>}
          <div class="dc-sub">
            {typo(kids)}
            {ref ? ` (${ref})` : ''}
          </div>
          {order && !brief && <div class="dc-sub">{typo(`годы детей — ${order}`)}</div>}
          {others && !brief && <div class="dc-sub">{typo(others)}</div>}
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
        <Cmd onRun={() => showDetails(unionSpouse(u, from), u.id)} label={typo(`Карточка союза: ${names}`)} title="Подробная карточка союза справа: супруги, дети, стихи">
          Карточка союза
        </Cmd>
      </div>
    </>
  );
}

/** Строка ленты карточки связи: «эту связь рисуют обе ленты — Мф 1:2; Лк 3:33–34», «золотая лента — Мф 1:6». */
function linesText(i: LinkInfo): string | null {
  if (!i.lines.length) return null;
  const refs = i.lines.map((l) => (l.ref ? refShort(l.ref) : '')).filter(Boolean).join('; ');
  const who = i.lines.length > 1 ? 'эту связь рисуют обе ленты' : i.lines[0].line === 'joseph' ? 'эту связь рисует золотая лента (Мф 1)' : 'эту связь рисует лазурная лента (Лк 3)';
  return `${who}${refs ? ` — ${refs}` : ''}`;
}

/** Строки концов связи: «Отец», «Мать», «Сын» — имя-ссылка и годы. */
function EndRow({ id, role, k }: { id: string; role: string; k: number }) {
  const q = byId.get(id);
  const years = q ? passportYears(id, model.value.chrono.get(id), isPeople(id)) : '';
  return (
    <div class="dc-row end" data-row={`end${k}`}>
      <dt class="dc-lbl">{capFirst(role || 'лицо')}</dt>
      <dd class="dc-val">
        <button type="button" class="person" data-id={id} onClick={() => goTo(id)}>
          {q?.name ?? id}
        </button>
        {years && <span class="note">{typo(`, ${years}`)}</span>}
      </dd>
    </div>
  );
}

function LinkBody({ k, brief = false }: { k: LinkKey; brief?: boolean }) {
  const i = linkInfo(k);
  if (!i) return <p class="dc-note">Связь не найдена в данных.</p>;
  const u = i.union;
  const lines = linesText(i);
  const endIds = i.ends.map((e) => e.id);
  // шаг ленты — показать на небе родителя шага и ребёнка
  if (k.kind === 'step') {
    const p = stepParent(k.line, k.child);
    if (p && !endIds.includes(p)) endIds.unshift(p);
  }
  return (
    <>
      <div class="dc-head">
        <h3 id="dc-link-title" tabIndex={-1}>
          {i.title}
        </h3>
        {i.refs.length > 0 && <div class="dc-refs">{refsShort(i.refs.slice(0, 4))}{i.refs.length > 4 ? typo(` и ещё ${i.refs.length - 4}`) : ''}</div>}
        {i.marks.length > 0 && <div class="dc-marks">{typo(i.marks.join(', '))}</div>}
      </div>
      <dl class="dc-kin">
        {i.ends.map((e, n) => (
          <EndRow key={`${e.id}${n}`} id={e.id} role={e.role} k={n} />
        ))}
        {lines && !brief && (
          <div class="dc-row lines">
            <dt class="dc-lbl">Ленты</dt>
            <dd class="dc-val">
              <span class="txt">{typo(lines)}</span>
            </dd>
          </div>
        )}
        {u && k.kind !== 'union' && !brief && (
          <div class="dc-row union">
            <dt class="dc-lbl">Союз</dt>
            <dd class="dc-val">
              <button
                type="button"
                class="person"
                title="Карточка союза у его ромба на небе"
                onClick={() => {
                  const from = u.a ?? u.b ?? u.kids[0];
                  selectedLink.value = null;
                  openDot({ kind: 'union', uid: u.id, from });
                }}
              >
                {typo(unionName(u))}
              </button>
              <span class="note">{typo(` — ${kidsCount(u)}`)}</span>
            </dd>
          </div>
        )}
      </dl>
      {i.note && !brief && <p class="dc-note">{typo(i.note)}</p>}
      <div class="dc-cmds">
        {u && (
          <Cmd onRun={() => showDetails(unionSpouse(u, u.a ?? u.b ?? u.kids[0]), u.id)} title="Карточка союза справа: супруги, дети, стихи">
            Карточка союза
          </Cmd>
        )}
        <Cmd onRun={() => flyToIds(endIds)} title="Вписать в окно оба конца связи">
          Показать концы
        </Cmd>
      </div>
    </>
  );
}

/** Имя карточки для диктора: «Адам, 4174–3244 гг. до Р. Х.», «Союз Адама и Евы», «Связь: Иаков и Лия — родители; …». */
export function dotLabel(at: DotAt): string {
  if (at.kind === 'union') {
    const u = unionById(at.uid);
    return u ? typo(unionTitle(u)) : '';
  }
  const p = byId.get(at.id);
  return p ? typo([p.name, disLine(at.id), yearsLine(at.id)].filter(Boolean).join(', ')) : '';
}

/**
 * Карточка в нижнем листе телефона (решение 77): лист на 214 px — это и есть карточка у звезды (или связи, или союза);
 * рамки и отвода нет — рамка у самого листа (Folio.tsx).
 */
export function DotSheet({ id }: { id: string }) {
  const at = dotCard.value;
  const link = selectedLink.value;
  const u = at?.kind === 'union' ? unionById(at.uid) : undefined;
  const kind = link ? 'link' : u ? 'union' : 'person';
  return (
    <div
      class={`dotcard in-sheet dc-${kind}${lowScreen() ? ' dc-brief' : ''}`}
      role="group"
      aria-label={link ? linkSpeech(link) : u && at?.kind === 'union' ? dotLabel(at) : dotLabel({ kind: 'person', id })}
      data-kind={kind}
      data-placed=""
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !link) return;
        e.preventDefault();
        e.stopPropagation();
        closeLink(true);
      }}
    >
      {/* низкий экран: лист на первом положении ниже 214 px — карточка краткая (имя с годами, одна строка, команды) */}
      {link ? (
        <LinkBody k={link} brief={lowScreen()} />
      ) : u && at?.kind === 'union' ? (
        <UnionBody u={u} from={at.from} brief={lowScreen()} />
      ) : (
        <PersonBody id={id} compact brief={lowScreen()} />
      )}
    </div>
  );
}

// ---------- карточка на небе ----------

export function DotCard() {
  const ref = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGSVGElement>(null);
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
  const [said, setSaid] = useState('');
  /**
   * Краткий вид (§ 6): полной карточке нет места без желательного — имя, годы, одна строка «Родства», команды. fullSize —
   * размер полной карточки: как только ей есть место, карточка снова полная.
   */
  const [brief, setBrief] = useState(false);
  const briefRef = useRef(false);
  const fullSize = useRef<{ w: number; h: number } | null>(null);
  /** читатель уже работал с карточкой («ещё 13», меню): выросшая по его просьбе карточка краткой не становится */
  const touched = useRef(false);
  const at = dotCard.value;
  const link = selectedLink.value;
  const on = dotsOn.value;
  const phone = grid.value.phone;
  // телефон с листом карточки: карточка — в листе (DotSheet), над небом её нет
  const inSheet = phone && !!selected.value;

  /** Фокус — на первое место карточки: имя «Родства» или первую команду. */
  const focusFirst = () => ref.current?.querySelector<HTMLElement>('.dc-val .person[tabindex="0"], .dc-cmds button')?.focus({ preventScroll: true });

  /** Поставить карточку у знака по нынешнему небу; знак ушёл за край — спрятать, а когда небо встанет, закрыть. */
  const place = () => {
    const el = ref.current;
    const lead = leadRef.current;
    const line = lineRef.current;
    const s = skyRef.current;
    const cur = dotCard.peek();
    const lk = selectedLink.peek();
    if (!el || !lead || !line || !s || (!cur && !lk)) return;
    const a = anchorOf(cur, lk);
    const vp = s.cam.vp;
    const shown = !!a && a.x >= vp.l && a.x <= vp.r && a.y >= s.openTop && a.y <= vp.b;
    clearTimeout(timer.current);
    if (!shown) {
      el.removeAttribute('data-placed');
      lead.hidden = true;
      line.style.display = 'none';
      lastRect = null;
      // карточка связи без точки в кадре не закрывается: связь выбрана, её концы могут быть за краем (указатели у края)
      if (lk) return;
      const now = performance.now();
      if (!outSince.current) outSince.current = now;
      // небо ещё едет (перелёт, вписывание после открытия карточки справа) или идёт переход показа (раскрытие «+N»:
      // узлы проявляются на 250–450 мс, § 10) — знак может вернуться; закрыть, только если его нет дольше перехода
      if (!s.cam.moving && now - outSince.current > OUT_MS && !(cur?.until && now < cur.until)) closeDot(el.contains(document.activeElement));
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
      const now = performance.now();
      if (vpSeen.current !== bounds.h) {
        vpSeen.current = bounds.h;
        vpAt.current = now;
      }
      const settling = now - vpAt.current < VP_SETTLE_MS;
      if (q.nudge && settling) timer.current = window.setTimeout(place, VP_SETTLE_MS);
      else if (q.nudge && !nudged.current && !s.cam.moving) {
        nudged.current = true;
        const cam = s.cam;
        cam.animateTo(cam.constrain({ x0: cam.x0, kx: cam.kx, laneTop: cam.laneTop + q.nudge / cam.ky }), 250, skyRef.redraw, reduced());
      }
    } else {
      // узкое небо (планшет с карточкой справа): карточка не шире места для неё — иначе она встала бы на звезду фокуса
      const need = bounds.w < DOT_W ? `${Math.max(200, Math.floor(bounds.w))}px` : '';
      if (el.style.width !== need) {
        el.style.width = need;
        size.current = { w: el.offsetWidth, h: el.offsetHeight };
      }
      // фокус — лицо, чья семья бережётся: у карточки лица — оно само; у карточки связи — лицо карточки, из которой её
      // открыли, иначе выбранное лицо; у карточки союза — выбранное лицо
      const focus = cur?.kind === 'person' ? cur.id : lk || cur?.kind === 'union' ? selected.peek() : null;
      // у карточки союза «семья» — супруги и дети союза (желательные, § 6); у карточки связи концы — обязательные
      const uu = !lk && cur?.kind === 'union' ? unionById(cur.uid) : undefined;
      const ends = lk ? (linkInfo(lk)?.ends.map((e) => e.id) ?? []) : uu ? [uu.a, uu.b, ...uu.kids].filter((x): x is string => !!x) : [];
      const o = obstacles(lk ? (focus && byId.has(focus) ? focus : null) : cur?.kind === 'person' ? focus : null, ends, a, !!lk);
      const opts = { ...o, prev: spot.current, fine: !s.cam.moving };
      q = placeCard(a, size.current, bounds, opts);
      // полной карточке места нет (§ 6): краткий вид — имя, годы, одна строка «Родства», команды; новый размер —
      // ResizeObserver и новое место. Краткая карточка возвращается к полной, как только полной есть место
      if (q.free === false && !briefRef.current && !touched.current) {
        briefRef.current = true;
        fullSize.current = { ...size.current };
        setBrief(true);
      } else if (briefRef.current && fullSize.current && !s.cam.moving && placeCard(a, fullSize.current, bounds, { ...opts, prev: null }).free) {
        briefRef.current = false;
        setBrief(false);
      }
      // запретные области места (§ 6; Я25) — для проверок приёмки (tools/accept/unify11.ts): «x,y,w,h;…» в px холста;
      // data-must — обязательные, data-want — желательные, data-full — размер полной карточки (краткий вид), data-bounds —
      // где карточка может стоять
      const enc = (rs: readonly Rect[]) => rs.map((r) => [r.x, r.y, r.w, r.h].map(Math.round).join(',')).join(';');
      el.dataset.must = enc(o.never);
      el.dataset.want = enc([...o.keep, ...o.hard]);
      el.dataset.hard = enc([...o.never, ...o.keep, ...o.hard]);
      el.dataset.bounds = [bounds.x, bounds.y, bounds.w, bounds.h].map(Math.round).join(',');
      if (briefRef.current && fullSize.current) el.dataset.full = `${Math.round(fullSize.current.w)},${Math.round(fullSize.current.h)}`;
      else delete el.dataset.full;
      el.dataset.at = [a.x, a.y, a.r].map(Math.round).join(',');
    }
    spot.current = q.key;
    el.style.left = `${Math.round(q.x)}px`;
    el.style.top = `${Math.round(q.y)}px`;
    el.dataset.side = q.side;
    el.setAttribute('data-placed', '');
    lastRect = { x: q.x, y: q.y, w: size.current.w, h: size.current.h };
    lead.hidden = !q.lead;
    if (q.lead) Object.assign(lead.style, { left: `${q.lead.x}px`, top: `${Math.round(q.lead.y)}px`, width: `${Math.round(q.lead.w)}px`, height: `${Math.round(q.lead.h)}px` });
    if (q.line) {
      line.style.display = 'block';
      const l = line.querySelector('line')!;
      l.setAttribute('x1', String(q.line.x1));
      l.setAttribute('y1', String(q.line.y1));
      l.setAttribute('x2', String(q.line.x2));
      l.setAttribute('y2', String(q.line.y2));
    } else line.style.display = 'none';
    // открыта с клавиатуры — фокус в карточку, когда она встала на место (до этого она невидима)
    if (cur?.focus) {
      dotCard.value = { ...cur, focus: false };
      focusFirst();
    }
  };

  // смена выбора не командой карточки, выбор второго лица, меню звезды — карточка закрывается
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
    // объявление выбранной связи для диктора (§ 8): «Связь: Иаков и Лия — родители; Иуда — сын; Бытие 29:35»
    let was: LinkKey | null = null;
    const offLink = effect(() => {
      const k = selectedLink.value;
      if (k && !sameLink(k, was)) setSaid(linkSpeech(k));
      was = k;
    });
    // Escape с холста, списка неба или без фокуса — снимает связь, потом карточку (одно видимое состояние, D5)
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented || (!dotCard.peek() && !selectedLink.peek())) return;
      const t = document.activeElement;
      const own = !!t && !!ref.current?.contains(t);
      const sky = !t || t === document.body || !!t.closest?.('.sky canvas, #sky-stars');
      if (!own && !sky) return;
      e.preventDefault();
      e.stopPropagation();
      if (selectedLink.peek()) closeLink(own || sky);
      else closeDot(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      offSel();
      offOn();
      offMenu();
      offLink();
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(timer.current);
      closeDot(false);
    };
  }, []);

  // карточка следует за небом: каждый кадр неба (viewTick) и сдвиг точки связи — место заново
  const key = link ? `link:${ks(link)}` : at ? (at.kind === 'person' ? at.id : at.uid) : '';
  useEffect(() => {
    briefRef.current = false;
    fullSize.current = null;
    touched.current = false;
    setBrief(false);
    if (!key) return;
    nudged.current = false;
    return effect(() => {
      void viewTick.value;
      void linkAnchor.value;
      place();
    });
  }, [key]);

  // карточка выросла или сжалась не своим рендером («Родство» дочиталось, шрифт) — размер и место заново
  useEffect(() => {
    const el = ref.current;
    if (!el || !key || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w === size.current.w && h === size.current.h) return;
      size.current = { w, h };
      place();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [key]);

  // после отрисовки: настоящий размер и место; команда, на которой стоял фокус, ушла из разметки — фокус в карточку
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !key) return;
    size.current = { w: el.offsetWidth, h: el.offsetHeight };
    place();
    const a = document.activeElement;
    if (a && a !== document.body && !el.contains(a)) inside.current = false;
    else if (inside.current && !el.contains(a)) focusFirst();
  });

  const live = (
    <span class="visually-hidden" role="status">
      {said}
    </span>
  );
  if (!on || inSheet || (!at && !link)) return live;
  const u = !link && at?.kind === 'union' ? unionById(at.uid) : undefined;
  if (!link && at?.kind === 'union' && !u) return live;
  const kind = link ? 'link' : at!.kind;
  return (
    <>
      {live}
      <div ref={leadRef} class="dc-lead" hidden aria-hidden="true" />
      <svg ref={lineRef} class="dc-line" aria-hidden="true" width="1" height="1">
        <line x1="0" y1="0" x2="0" y2="0" />
      </svg>
      <div
        ref={ref}
        key={key}
        class={['dotcard', `dc-${kind}`, brief ? 'dc-brief' : ''].filter(Boolean).join(' ')}
        data-brief={brief ? '' : undefined}
        role="dialog"
        aria-label={link ? linkSpeech(link) : dotLabel(at!)}
        data-kind={kind}
        data-id={link ? ks(link) : at!.kind === 'person' ? at!.id : at!.uid}
        data-dock={phone ? '' : undefined}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          if (link) closeLink(true);
          else closeDot(true);
        }}
        onFocusIn={() => (inside.current = true)}
        onPointerDown={() => (touched.current = true)}
        onKeyDownCapture={(e) => {
          if (e.key !== 'Tab' && e.key !== 'Escape') touched.current = true;
        }}
        onFocusOut={(e) => {
          const to = e.relatedTarget as Node | null;
          // фокус ушёл из карточки сам (не потерялся вместе с командой)
          if (to && !ref.current?.contains(to)) inside.current = false;
        }}
        onMouseLeave={() => {
          if (previewLinks.peek()) previewLinks.value = null;
        }}
      >
        {link ? <LinkBody k={link} brief={brief} /> : at!.kind === 'person' ? (
          <PersonBody
            id={at!.id}
            brief={brief}
            onAll={() => {
              // читатель просит всё «Родство»: карточка полная, и краткой по месту больше не становится
              touched.current = true;
              briefRef.current = false;
              setBrief(false);
              requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('.dc-kin .person')?.focus({ preventScroll: true }));
            }}
          />
        ) : <UnionBody u={u!} from={at!.from} brief={brief} />}
        <Close
          label={link ? 'Закрыть карточку связи' : at!.kind === 'person' ? 'Закрыть карточку у звезды' : 'Закрыть карточку союза'}
          onClick={() => {
            const inCard = !!ref.current?.contains(document.activeElement);
            // «×» карточки связи снимает выбор связи: у звезды снова её карточка (если была), как после Escape
            if (link && at) closeLink(inCard);
            else closeDot(inCard);
          }}
        />
      </div>
    </>
  );
}
