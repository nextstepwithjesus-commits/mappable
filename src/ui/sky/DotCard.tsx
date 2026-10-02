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
 *  — команды «Вся карточка» (подробная справа), «Предки и потомки ▾» (показ «род лица», src/ui/show.ts), «Родство с…», «×»;
 *    в показе «набор» — ещё «Продолжить ветвь» и «Показать родителей» (раскрытие, решение 70).
 * Карточка союза у ромба — супруги, вид связи и стих, дети числом, «другие сыновья и дочери» (Быт 5:4), «Показать
 * детей союза (N)» или «Скрыть детей союза», «Подробнее о союзе» (подробная карточка союза справа, как в карточке связи).
 * Карточка связи — при выбранной связи (src/ui/linkstate.ts, selectedLink): заголовок словами родства, у связи по
 * толкованию и по выводу первым словом — уровень (решение 105; src/ui/linkwords.ts), строка основания, стихи, строки
 * концов («Отец», «Мать», «Сын» — имя-ссылка и годы; конец не на небе — «нет в показе «…» — показать»), «Линия»,
 * «Союз» («Илий и его жена: одна дочь»); команды «Подробнее о союзе» и «Вписать связь». Встаёт у точки щелчка или
 * середины пути (linkAnchor — ставит небо).
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
import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { byId, graph, lines, loadedCard } from '../../data/atlas.ts';
import type { Rect } from '../../render/sky.ts';
import type { Union } from '../../engine/unions.ts';
import { linkKeyString, type LinkKey } from '../../engine/linkkey.ts';
import { focused, hovered, model, pickMode, selected, theme } from '../../state.ts';
import { goTo, Refs, skyRef, VerseInsert, viewTick } from '../common.tsx';
import { Close, Menu } from '../controls.tsx';
import { Avatar, UnionAvatar } from '../card/Avatar.tsx';
import { askCards, cardsTick, disLine, onLines, othersNote, othersUnionOf, unionKindLine, yearsLine } from '../card/star.ts';
import { familyOf, kinNamesakes, kinRows, relationsOf, yearHow, type KinPart, type KinRow } from '../card/kinrows.ts';
import { kidsInBirthOrder } from '../card/Union.tsx';
import { branchesOf, partnerIn } from '../../engine/unions.ts';
import { branchColor } from '../../render/branches.ts';
import { passportYears, isPeople } from '../card/Masthead.tsx';
import { closePerson, collapseUnion, expanded, opened, openPerson, originOf, plates, selectedUnion, selectUnion, unionById, unionsOf, unions } from '../reveal.ts';
import { addPath, foldDesc, foldGroups, foldsHiding, linkSet, workSet } from '../work.ts';
import { canReturn, countShow, isNearest, nearestCount, nearestFamily, returnFromFamily, setShow, show, showContent, showGuest, showTitle } from '../show.ts';
import { openShowSheet } from '../panels/Show.tsx';
import { linkAnchor, linkGhosts, previewLinks, selectedLink, type GhostWhy } from '../linkstate.ts';
import { kidsCount, kinLabel, kinPhrase, linkBasis, linkInfo, linkSpeech, refShort, spanHidden, stepParent, unionName, type KinPhrase, type LinkInfo } from '../linkwords.ts';
import { grid, unfoldCard } from '../layout.ts';
import { lowScreen, openSheetAt, sheetStop } from '../sheet.ts';
import { focusCardTitle, focusQuietly } from '../focus.ts';
import { skyMenu } from '../panels/Work.tsx';
import { typo } from '../text/typo.ts';
import { bySex, capFirst } from '../text/ru.ts';
import { starRadius } from '../../render/glyphs.ts';
import { familyOrderNote, personOrderNote } from '../../render/links.ts';
import { firstKin } from '../../render/frame.ts';
import { aroundPending, flyToIds, reduced, reserve, screenOf } from './view.ts';
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
/** keyboard — открыта с клавиатуры (Enter на звезде, шаг по «Родству»): «Родство» полностью, без легенды (решение 83). */
export type DotCardState = DotAt & { sel: string | null; focus: boolean; keyboard?: boolean; until?: number };

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
  dotCard.value = { ...at, sel: selected.peek(), focus: !!o.focus, keyboard: !!o.focus, ...(o.grace && typeof performance !== 'undefined' ? { until: performance.now() + o.grace } : {}) };
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
  openRows.clear();
  // карточки больше нет — и её резерва подписей (SkyView слушает «reserve-move» на небе)
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => document.querySelector('.sky')?.dispatchEvent(new CustomEvent('reserve-move', { bubbles: true })));
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

/** Строки «Родства», раскрытые читателем («ещё N»): лицо и строка; забываются, когда карточка у звезды закрыта. */
const openRows = new Set<string>();

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

/** Карточка ставит выбор лица сама («Вся карточка», «Подробнее о союзе», имя «Родства»): такая смена выбора её не закрывает. */
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
  /** «Продолжить ветвь» — ромбы его союзов не все на небе; «Скрыть ветвь» — они показаны от него */
  branch: 'more' | 'fold' | null;
  /** «Показать родителей» — союз его родителей не раскрыт; «Скрыть родителей» — раскрыт от него */
  parents: 'show' | 'hide' | null;
}

/**
 * Команды раскрытия карточки лица в показе «набор» (решение 70):
 *  — «Продолжить ветвь», если ромбы его союзов показаны не все; иначе «Скрыть ветвь», если они показаны по его щелчку
 *    или его союз раскрыт от него;
 *  — «Показать родителей», если первый союз его происхождения (основные родители) не раскрыт; «Скрыть родителей», если его
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
 * «Скрыть ветвь»: свернуть союзы лица, раскрытые от него (дети уходят со всем, что раскрыто от них), и убрать ромбы его
 * союзов. Союз, раскрытый от супруга, остаётся: свёртка не убирает с неба самого супруга.
 */
export function foldDot(id: string) {
  const exp = expanded.peek();
  for (const u of unionsOf(id)) if (exp[u.id] === id) collapseUnion(u.id);
  closePerson(id);
}

/** «Показать родителей»: союз родителей раскрывается от лица — родители, братья и сёстры на небе; «Скрыть родителей» — свёртка. */
export function parentsDot(id: string) {
  const org = originOf(id)[0];
  if (org) toggleKids(org.id, id);
}

/**
 * Команда раскрытия у карточки союза — словами неба (этап 13, решение 109: на небе «показать» и «скрыть»; «свернуть» —
 * только карточке и листу). Ромб у лица-ребёнка (союз его родителей): «Показать родителей» — родители, братья и сёстры
 * на небе, «Скрыть родителей». Ромб у супруга: «Показать детей союза (3)», «Показать ещё (6)» (часть детей уже на небе),
 * «Скрыть детей союза»; брак без детей или все дети на небе, а супруга нет — «Показать союз», «Скрыть союз». Всё уже на
 * небе и союз не раскрыт — команды нет.
 */
export function unionDotCmd(u: Union, from: string): { text: string; label?: string; open: boolean } | null {
  const open = u.id in expanded.value;
  const set = workSet.value;
  if (u.kids.includes(from) && from !== u.a && from !== u.b) {
    if (open) return { text: 'Скрыть родителей', label: 'Скрыть родителей: убрать с неба союз родителей', open: true };
    return [u.a, u.b, ...u.kids].some((x) => x && !set.has(x)) ? { text: 'Показать родителей', label: 'Показать родителей: родители, братья и сёстры на небе', open: false } : null;
  }
  const hidden = u.kids.filter((k) => !set.has(k)).length;
  if (u.kids.length && (open || hidden > 0)) {
    if (open) return { text: 'Скрыть детей союза', open: true };
    if (hidden === u.kids.length) return { text: `Показать детей союза (${hidden})`, open: false };
    return { text: `Показать ещё (${hidden})`, label: `Показать ещё (${hidden}): остальных детей союза`, open: false };
  }
  if (open) return { text: 'Скрыть союз', open: true };
  return [u.a, u.b].some((x) => x && !set.has(x)) ? { text: 'Показать союз', label: 'Показать союз: оба супруга на небе', open: false } : null;
}

/** Кого выбрать для карточки союза справа: супруга, который на небе (лицо у ромба, если это супруг), иначе лицо у ромба. */
export function unionSpouse(u: Union, from: string): string {
  if (from === u.a || from === u.b) return from;
  return [u.a, u.b].find((x): x is string => !!x && workSet.peek().has(x)) ?? from;
}

/** Показ «набор» своего набора: команды раскрытия у карточек (решение 70); в других показах их нет. */
const revealOn = () => show.value.kind === 'set' && !linkSet.value;

/**
 * «Вся карточка» и «Подробнее о союзе»: подробная карточка справа — лицо выбрано (карточка союза сменяется карточкой лица), свёрнутая
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

/** «Предки и потомки ▾»: показ «род лица» — потомки, предки или оба, все поколения, по отцам (§ 7). */
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

/** Пауза после последнего сдвига карточки, мс: тогда небо и замеряет резерв подписей заново. */
const RESERVE_CALM_MS = 120;
let reserveTimer = 0;
/**
 * Карточка встала на новое место — резерв подписей заново (data-reserve="dot", решение 153; SkyView слушает «reserve-move»).
 * Не каждым кадром: в перелёте и протяжке карточка едет за звездой, и замер резерва в каждом кадре (размеры органов неба,
 * новый резерв, перерисовка) отнимал у кадра сотни миллисекунд — нажатие во время перелёта не успевало его остановить
 * (IX-54, сценарий 252). Замер — когда карточка постояла RESERVE_CALM_MS и небо не едет.
 */
function reserveMoved(el: HTMLElement, cam: { readonly moving: boolean }) {
  window.clearTimeout(reserveTimer);
  const fire = () => {
    if (cam.moving) {
      reserveTimer = window.setTimeout(fire, RESERVE_CALM_MS);
      return;
    }
    if (el.isConnected) el.dispatchEvent(new CustomEvent('reserve-move', { bubbles: true }));
  };
  reserveTimer = window.setTimeout(fire, RESERVE_CALM_MS);
}
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
/**
 * Продолжение пути выбранного шага ленты (решение 171; R1-12): младший конец шага и следующее лицо той же линии
 * (Давид → Соломон: Соломон, Ровоам). У прочих связей — пусто.
 */
function stepNext(k: LinkKey): string[] {
  if (k.kind !== 'step' && k.kind !== 'span') return [];
  const ps = lines[k.line].persons;
  const child = k.kind === 'step' ? k.child : k.to;
  const i = ps.findIndex((st) => st.id === child);
  return i >= 0 && i + 1 < ps.length ? [child, ps[i + 1].id] : [];
}

function obstacles(
  focus: string | null,
  ends: readonly string[],
  a: DotAnchor,
  endsMust: boolean,
  self: { w: number; h: number } | null = null,
  next: readonly string[] = [],
): { never: Rect[]; keep: Rect[]; hard: Rect[]; soft: Obstacle[]; lines: Segment[]; mass: { x: number; y: number } | null } {
  const s = skyRef.current!;
  // сама карточка — тоже резерв подписей (data-reserve="dot", решение 153): своего прямоугольника она не избегает
  const mine = (r: Rect) => !!self && Math.abs(r.w - self.w) < 1.5 && Math.abs(r.h - self.h) < 1.5;
  const never: Rect[] = [...reserve().filter((r) => !mine(r)), ...s.edgeHits.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))];
  const keepR: Rect[] = [];
  const hard: Rect[] = [];
  const soft: Obstacle[] = [];
  const lines: Segment[] = [];
  /** обязательные лица: фокус и концы связи; желательные — семья фокуса (и концы, если они не обязательны) */
  const must = new Set<string>(endsMust ? ends : []);
  if (focus) must.add(focus);
  const family = focus ? familyOf(focus) : [];
  // и продолжение пути выбранного шага ленты (решение 171; R1-12): следующее лицо линии и шаг к нему — желательные
  const want = new Set<string>([...family, ...(endsMust ? [] : ends), ...next]);
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
  // шаг ленты к следующему лицу (next — путь: младший конец шага, затем следующее лицо) — как линия семьи: карточка его
  // не перечёркивает
  for (let k = 0; k + 1 < next.length; k++) {
    const p = starAt(next[k]);
    const q = starAt(next[k + 1]);
    if (p && q) lines.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, cost: 40 });
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
    const y = s.starY(i);
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

/**
 * Что из строки «Родства» видно сразу (решения 92, 104): первые limit имён, а сверх них — лица линий Мессии (line):
 * «ещё N» их не прячет (у Давида Соломон — пятым в группе Вирсавии, а виден). Имя супруга-заголовка группы («Вирсавия: …»)
 * видно, если видно хоть одно имя его группы. Разделители — только между видимыми именами; пропуск внутри строки — «, »
 * (или «; » между группами). Одно лишнее имя не прячется: «ещё 1» не короче самого имени. rest — сколько имён спрятано,
 * firstHidden — номер первого спрятанного среди имён (на него встаёт фокус после «ещё N»).
 */
export function cutRow(parts: readonly KinPart[], limit: number): { shown: KinPart[]; rest: number; firstHidden: number } {
  const nameAt = parts.flatMap((p, i) => (p.t === 'name' ? [i] : []));
  if (nameAt.length <= limit + 1) return { shown: [...parts], rest: 0, firstHidden: nameAt.length };
  const keep = new Set<number>();
  nameAt.forEach((i, k) => {
    if (k < limit || (parts[i] as Extract<KinPart, { t: 'name' }>).line) keep.add(i);
  });
  // группа строки: от заголовка («Вирсавия» + «: » или «мать не названа — ») до «; »
  const label = (p: KinPart | undefined) => p?.t === 'text' && /(:|—)\s*$/.test(p.text);
  const groupKept = (from: number) => {
    for (let j = from + 1; j < parts.length; j++) {
      const q = parts[j];
      if (q.t === 'text' && /;/.test(q.text)) return false;
      if (q.t === 'name' && keep.has(j)) return true;
    }
    return false;
  };
  parts.forEach((p, i) => {
    if (p.t === 'name' && !keep.has(i) && label(parts[i + 1]) && groupKept(i + 1)) keep.add(i);
  });
  const shown: KinPart[] = [];
  let prevKept = true;
  let gap = false;
  let semi = false;
  parts.forEach((p, i) => {
    if (p.t === 'name') {
      if (!keep.has(i)) {
        prevKept = false;
        gap = true;
        return;
      }
      if (gap && shown.length && shown[shown.length - 1].t === 'name') shown.push({ t: 'text', text: semi ? '; ' : ', ' });
      shown.push(p);
      prevKept = true;
      gap = false;
      semi = false;
      return;
    }
    // пояснение к имени — «(приёмный)» — идёт за своим именем
    if (/^\s*\(/.test(p.text)) {
      if (prevKept) shown.push(p);
      return;
    }
    // заголовок группы — если видно хоть одно имя группы
    if (label(p)) {
      if (prevKept && groupKept(i)) {
        shown.push(p);
        gap = false;
      } else {
        gap = true;
        if (/;/.test(p.text)) semi = true;
      }
      return;
    }
    // разделитель — только между видимыми соседями
    const next = parts.findIndex((q, j) => j > i && q.t === 'name');
    if (prevKept && next >= 0 && keep.has(next)) shown.push(p);
    else {
      gap = true;
      if (/;/.test(p.text)) semi = true;
    }
  });
  // хвост-разделитель после последнего видимого имени — не нужен
  while (shown.length && shown[shown.length - 1].t === 'text' && /^[;,]/.test((shown[shown.length - 1] as { text: string }).text)) shown.pop();
  const hidden = nameAt.filter((i) => !keep.has(i));
  return { shown, rest: hidden.length, firstHidden: hidden.length ? nameAt.indexOf(hidden[0]) : nameAt.length };
}

/** Ключ связи — строкой для сравнения. */
const ks = (k: LinkKey) => linkKeyString(k) ?? '';

/** Ссылка на стих в тексте строки: «Быт 5:3», «1 Пар 2:16», «Быт 4:19–22». */
const REF_IN_TEXT = /(?:[1-4]\s?)?[А-ЯЁ][а-яё]{1,5}\s\d+:\d+(?:[–-]\d+(?::\d+)?)?/g;
/** Ссылка из текста — в запись данных: «1 Пар 2:16» → «1Пар 2:16», «–» → «-». */
export const refOfText = (r: string) => r.replace(/^([1-4])\s+/, '$1').replace(/[–—]/g, '-');

/**
 * Текст со ссылками на стихи (строка «Год», решение 152): ссылки — кнопки, как в подробной карточке (Refs), стих —
 * вклейкой под строкой (VerseInsert), до трёх стихов.
 */
export function RefText({ text, owner, insert = true }: { text: string; owner: string; insert?: boolean }) {
  const out: ComponentChildren[] = [];
  const refs: string[] = [];
  let at = 0;
  for (const m of text.matchAll(REF_IN_TEXT)) {
    const r = refOfText(m[0]);
    if (m.index! > at) out.push(<span key={`t${at}`}>{typo(text.slice(at, m.index))}</span>);
    out.push(<Refs key={`r${m.index}`} refs={[r]} owner={owner} />);
    refs.push(r);
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(<span key={`t${at}`}>{typo(text.slice(at))}</span>);
  return (
    <>
      {out}
      {insert && refs.length ? <VerseInsert owner={owner} refs={refs} /> : null}
    </>
  );
}

/** Ссылки текста строки — для вклейки во всю ширину карточки (строка «Год»). */
export const refsInText = (text: string) => [...text.matchAll(REF_IN_TEXT)].map((m) => refOfText(m[0]));

/** Сенсорный экран (грубый указатель). */
const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Касание пустого места строки «Родства» (подпись строки, промежуток между именами, вторая строка переноса) — ближайшему
 * имени строки (решение 154; M6): вся строка — цель, поделённая по ближайшему имени. Только на сенсорном экране:
 * мышью щелчок мимо имени ничего не выбирает.
 */
function nearestName(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (!coarse() || !t || t.closest('button')) return;
  const row = t.closest('.dc-row');
  const items = [...(row?.querySelectorAll<HTMLElement>('.dc-val .person, .dc-val .dc-more') ?? [])];
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const b of items)
    for (const r of b.getClientRects()) {
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const d = Math.hypot(dx, dy * 2);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
  if (best) best.click();
}

/**
 * Строка «Родства»: подпись и имена. Наведение на строку — её линии на небе; на имя и фокус — линия этого имени. Щелчок по
 * имени — выбор лица (и перелёт, если его нет на экране); Enter — карточка связи. По именам строки — стрелки, Home, End.
 */
function KinRowView({ row, idx, compact, onMore, owner }: { row: KinRow; idx: number; compact?: boolean; onMore?: () => void; owner: string }) {
  // раскрытая «ещё N» строка остаётся раскрытой после карточки связи, открытой с её имени (M9: Escape — к тому же имени)
  const [all, setAllState] = useState(() => openRows.has(`${owner}|${row.kind}${idx}`));
  const setAll = (v: boolean) => {
    if (v) openRows.add(`${owner}|${row.kind}${idx}`);
    setAllState(v);
  };
  // в листе телефона строка — одна строка текста (цель касания 44 px, решение 154): два имени и «ещё N»; родители — все
  const limit = compact ? Math.min(ROW_NAMES[row.kind] ?? 2, row.kind === 'parents' ? 99 : 2) : (ROW_NAMES[row.kind] ?? 5);
  const { shown, rest, firstHidden } = cutRow(row.parts, all ? Infinity : limit);
  const preview = (keys: readonly LinkKey[] | null) => {
    previewLinks.value = keys && keys.length ? keys : null;
  };
  const rowKey = `${row.kind}${idx}`;
  // одна фраза родства (решение 151): тёзки семьи — с уточнением (решение 106), уровень и шаг линии — пометой, лицо вне
  // показа — бледнее и словами в имени кнопки
  void model.value;
  const same = kinNamesakes(owner);
  const phrase = new Map<number, KinPhrase>();
  shown.forEach((p, i) => {
    if (p.t === 'name') phrase.set(i, kinPhrase(p.id, p.role ?? '', p.key, { namesake: same.has(p.id), outside: skyState(p.id) === 'out' }));
  });
  // где стоит помета имени: сразу за ним; за его пояснением «(по Луке)»; за хвостом союза «и его жена», если дальше конец
  // строки или разделитель
  const markAfter = new Map<number, string>();
  phrase.forEach((ph, i) => {
    if (!ph.marks.length) return;
    let j = i;
    const nx = shown[i + 1];
    const nn = shown[i + 2];
    if (nx?.t === 'text' && /^\s*\(/.test(nx.text)) j = i + 1;
    else if (nx?.t === 'text' && !/^[,;(]/.test(nx.text) && !/(:|—)\s*$/.test(nx.text) && (!nn || (nn.t === 'text' && /^[,;]/.test(nn.text)))) j = i + 1;
    markAfter.set(j, ` ${ph.marks.join(', ')}`);
  });
  // разделитель сразу за именем: «Сын Давида и Вирсавии» + «, » не расходятся по строкам; у имени с уточнением или пометой
  // разделитель встаёт за ними (между ними и запятой переноса нет)
  const glued = new Set<number>();
  shown.forEach((p, i) => {
    const prev = shown[i - 1];
    if (p.t === 'text' && /^[,;]/.test(p.text) && prev?.t === 'name' && !phrase.get(i - 1)?.dis && !markAfter.has(i - 1)) glued.add(i);
  });
  const mark = (i: number) =>
    markAfter.has(i) ? (
      <span key={`m${i}`} class="dc-cert" aria-hidden="true">
        {typo(markAfter.get(i)!)}
      </span>
    ) : null;
  let first = true;
  return (
    <div class={`dc-row ${row.kind}`} data-row={rowKey} onMouseEnter={() => preview(row.keys)} onMouseLeave={() => preview(null)} onClick={nearestName}>
      <dt class="dc-lbl">{row.label}</dt>
      <dd class="dc-val">
        {shown.map((p, i) => {
          if (p.t === 'text') {
            // строка «Год»: ссылки в ней — кнопки с вклейкой стиха (решение 152; U7)
            if (row.kind === 'year') return <RefText key={i} text={p.text} owner={`dc-year|${owner}`} insert={false} />;
            // запятая или точка с запятой за именем — внутри кнопки имени (.sep, ниже): строка не начинается с «,»
            const text = glued.has(i) ? p.text.slice(1) : p.text;
            return text ? (
              <Fragment key={i}>
                <span class="txt">{typo(text)}</span>
                {mark(i)}
              </Fragment>
            ) : (
              mark(i)
            );
          }
          const q = byId.get(p.id);
          const tab = first ? 0 : -1;
          first = false;
          const tip = linkInfo(p.key);
          const ph = phrase.get(i)!;
          const btn = (
            <button
              type="button"
              class={ph.outside ? 'person out' : 'person'}
              data-id={p.id}
              data-link={ks(p.key)}
              tabIndex={tab}
              aria-label={kinLabel(ph)}
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
              onClick={(e) => {
                previewLinks.value = null;
                // имя выбирает лицо и сразу открывает его карточку у звезды (решение 153; U11): цепочка «Родства» идёт
                // без поиска звезды; с клавиатуры (пробел) фокус — в новую карточку
                if (q) kinStep(p.id, e.detail === 0);
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
          return (
            <Fragment key={i}>
              {btn}
              {ph.dis ? (
                <span class="dc-ds" aria-hidden="true">
                  {` (${ph.dis})`}
                </span>
              ) : null}
              {mark(i)}
            </Fragment>
          );
        })}
        {rest > 0 && (
          <>
            {' и '}
            <button
              type="button"
              class="dc-more"
              tabIndex={-1}
              aria-label={onMore ? `ещё ${rest}: всё родство в карточке` : `ещё ${rest}: показать всех`}
              onClick={(e) => {
                // лист телефона на шапке: строка не растёт в лист, а лист поднимается к родству подробной карточки
                if (onMore) {
                  onMore();
                  return;
                }
                const row = (e.currentTarget as HTMLElement).closest('.dc-row');
                setAll(true);
                requestAnimationFrame(() => {
                  const next = row?.querySelectorAll<HTMLElement>('.person')[firstHidden];
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
      {/* стих строки «Год» — вклейкой во всю ширину карточки, под строкой (решение 152; M12) */}
      {row.kind === 'year' ? (
        <div class="dc-verse">
          <VerseInsert owner={`dc-year|${owner}`} refs={row.parts.flatMap((p) => (p.t === 'text' ? refsInText(p.text) : []))} />
        </div>
      ) : null}
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
  // лица вне показа (решение 151; U14) — бледнее, а что это значит, сказано словами под строками
  void show.value;
  void showContent.value;
  // в листе телефона (compact) и в краткой карточке (§ 6: одна строка «Родства») строки пояснения нет: лист — краткая
  // карточка, её высота — высота шапки (решение 155); «вне показа» там — в имени кнопки и точечной чертой
  const outside = !compact && !brief && shown.some((r) => r.parts.some((p) => p.t === 'name' && skyState(p.id) === 'out'));
  return (
    <dl class="dc-kin" aria-label="Родство">
      {shown.map((r, i) => (
        <KinRowView key={`${r.kind}${i}`} row={r} idx={i} compact={compact} onMore={compact ? all : undefined} owner={id} />
      ))}
      {outside && (
        <div class="dc-row out-note">
          <dt class="dc-lbl" />
          <dd class="dc-val">
            <span class="txt">{typo(`бледнее — нет в показе «${showTitle(show.value)}»`)}</span>
          </dd>
        </div>
      )}
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
 * Шаг по «Родству» (решение 153; U11): имя выбирает лицо (небо летит к нему, если его нет на экране) и сразу открывает
 * его карточку у звезды — она ждёт звезду, пока небо едет; с клавиатуры фокус — в новую карточку. На телефоне карточка
 * у звезды — это сам лист: он показывает новое лицо и остаётся на прежнем положении (решение 150).
 */
function kinStep(id: string, keyboard: boolean) {
  goTo(id);
  if (selected.peek() !== id || !dotsOn.peek() || grid.peek().phone) return;
  openDot({ kind: 'person', id }, { focus: keyboard, grace: 1500 });
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

/** «Предки и потомки ▾» (решение 109): потомки, предки, те и другие — по отцам, все поколения; «Настроить…» — лист «Показ». */
function LineageMenu({ id }: { id: string }) {
  const item = (dir: 'down' | 'up' | 'both', label: string) => {
    const n = countShow({ kind: 'lineage', id, dir, gen: null, by: 'father' });
    return { key: dir, label: typo(`${label} — ${n}`), onSelect: () => lineageShow(id, dir) };
  };
  return (
    <Menu
      class="dc-lineage"
      label="Предки и потомки ▾"
      title="Оставить на небе только предков или потомков лица, или тех и других"
      items={[
        // ясный вид семьи — первым (решение 145; контракт S3): родители, супруги, дети по матерям, 1 поколение
        { key: 'near', label: typo(`Ближайшая родня — ${nearestCount(id)}`), onSelect: () => nearestFamily(id) },
        item('down', 'Потомки'),
        item('up', 'Предки'),
        item('both', 'Предки и потомки'),
        { key: 'more', label: 'Настроить…', sep: true, onSelect: () => openShowSheet({ focus: 'lineage', person: id }) },
      ]}
    />
  );
}

/**
 * «Ближайшая родня» (решение 145; контракт S3, src/ui/show.ts) — команда карточки у звезды; в самой «Ближайшей родне»
 * этого лица — «Вернуть прежний показ» одним действием.
 */
function NearestCmd({ id }: { id: string }) {
  const s = show.value;
  const mine = isNearest(s) && s.kind === 'lineage' && s.id === id;
  if (mine && canReturn.value)
    return (
      <Cmd onRun={() => returnFromFamily()} cls="dc-near" title="Прежний показ неба и прежнее окно">
        Вернуть прежний показ
      </Cmd>
    );
  if (mine) return null;
  return (
    <Cmd onRun={() => nearestFamily(id)} cls="dc-near" title={typo(`Родители, супруги и дети по матерям — ${nearestCount(id)}; возврат — Escape или «назад»`)}>
      Ближайшая родня
    </Cmd>
  );
}

/** Есть ли у лица ветви — союзы с детьми (src/engine/unions.ts, branchesOf): тогда у карточки у звезды легенда семьи. */
const legendFor = (id: string) => (unions.of.get(id) ?? []).some((u) => !u.claim && u.kids.length > 0);

/**
 * Легенда семьи (решение 153; U8): карточка у звезды при открытой подробной карточке на широком экране не повторяет её
 * «Родство», а говорит то, чего нет на небе словами: какой цвет ветви — какой союз (образец цвета, «от Лии — 6 сыновей
 * и одна дочь»), и кто из родни вне показа. Имя в строке — шаг по родству (kinStep), наведение на строку — линии союза.
 */
function FamilyLegend({ id, onAll }: { id: string; onAll?: () => void }) {
  const th = theme.value;
  void show.value;
  void showContent.value;
  const br = branchesOf(unions, graph, id);
  const own = (unions.of.get(id) ?? []).filter((u) => !u.claim && u.kids.length);
  const rows: ComponentChildren[] = [];
  const sw = (key: string) => {
    const b = br.keys.indexOf(key);
    return b < 0 ? null : <i class="dc-sw" aria-hidden="true" style={{ '--sw': branchColor(b, th) }} />;
  };
  const preview = (keys: readonly LinkKey[] | null) => {
    previewLinks.value = keys && keys.length ? keys : null;
  };
  // полное «Родство» вместо легенды — ссылкой «всё родство», как у краткой карточки (а не четвёртой командой: строка
  // команд не растёт, и карточка у звезды остаётся полной там, где ей есть место — решение 153, U8)
  // обёртка .dc-row.all (display: contents) — та же команда, что «всё родство — ещё N строк» краткой карточки
  const all = onAll ? (
    <span class="dc-row all">
      <button type="button" class="dc-more" title="Показать всё «Родство» в карточке у звезды" onClick={onAll}>
        всё родство
      </button>
    </span>
  ) : null;
  if (own.length > 1) {
    // союзов много (у Давида девять): подпись строки и короткие пары «образец цвета, имя, число детей» в две колонки —
    // карточка у звезды не растёт на высоту семьи (U8)
    const female = byId.get(id)?.sex === 'f';
    rows.push(
      <li key="cap" class="dc-leg-cap">
        <span class="txt">{female ? 'Дети по отцам' : 'Дети по матерям'}</span>
        {all}
      </li>,
    );
    rows.push(
      <li key="grid" class="dc-leg-grid">
        {own.map((u) => {
          const other = partnerIn(u, id);
          const keys = u.kids.map((k) => ({ kind: 'child', union: u.id, child: k }) as LinkKey);
          const n = u.kids.filter((k) => k !== id).length;
          return (
            <span key={u.id} class="dc-leg" onMouseEnter={() => preview(keys)} onMouseLeave={() => preview(null)}>
              {sw(u.id)}
              {other ? (
                <button
                  type="button"
                  class="person"
                  data-id={other}
                  aria-label={typo(`${byId.get(other)?.name ?? other} — ${female ? 'отец' : 'мать'}: ${kidsCount(u)}`)}
                  onClick={(e) => kinStep(other, e.detail === 0)}
                >
                  {byId.get(other)?.name ?? other}
                </button>
              ) : (
                <span class="txt">{female ? 'не назван' : 'не названа'}</span>
              )}
              <span class="txt" aria-hidden={other ? 'true' : undefined}>{` — ${n}`}</span>
            </span>
          );
        })}
      </li>,
    );
  }
  else if (own.length === 1) {
    const u = own[0];
    const kids = kidsInBirthOrder(u).filter((k) => k !== id);
    const shown = kids.length > 5 ? kids.slice(0, 4) : kids;
    rows.push(
      <li key={u.id}>
        <span class="txt">{typo(`${capFirst(kidsCount(u))}: `)}</span>
        {shown.map((k, i) => (
          <Fragment key={k}>
            {i ? <span class="txt">, </span> : null}
            {sw(k)}
            <button type="button" class="person" data-id={k} aria-label={typo(`${byId.get(k)?.name ?? k} — ${bySex(byId.get(k)?.sex ?? 'm', 'сын', 'дочь')}`)} onClick={(e) => kinStep(k, e.detail === 0)} onMouseEnter={() => preview([{ kind: 'child', union: u.id, child: k }])} onMouseLeave={() => preview(null)}>
              {byId.get(k)?.name ?? k}
            </button>
          </Fragment>
        ))}
        {kids.length > shown.length ? <span class="txt">{typo(` и ещё ${kids.length - shown.length}`)}</span> : null}
      </li>,
    );
  }
  // кто из родни вне показа (U14): число и первые имена; показать — «Ближайшая родня» или карточка
  const out = [...relationsOf(id).keys()].filter((x) => skyState(x) === 'out');
  if (out.length)
    rows.push(
      <li key="out" class="dc-out-row">
        <span class="txt">{typo(`нет в показе «${showTitle(show.value)}»: ${out.slice(0, 2).map((x) => byId.get(x)?.name ?? x).join(', ')}${out.length > 2 ? ` и ещё ${out.length - 2}` : ''}`)}</span>
      </li>,
    );
  if (!rows.length) return null;
  if (all && own.length <= 1) rows.push(<li key="all" class="dc-leg-all">{all}</li>);
  return (
    <ul class="dc-legend" aria-label={own.length > 1 ? 'Союзы и цвета ветвей' : 'Семья'}>
      {rows}
    </ul>
  );
}

/** Сколько имён строки «Без подписи на небе» показывать до «и ещё N»: строка — одна, карточка от неё не растёт (К6). */
const HIDDEN_NAMES = 2;

/**
 * «Без подписи на небе: Соломон, Нафан и ещё 4» (П1; решения 146, 153): родня первого колена выбранного лица (родители,
 * супруги, дети; src/render/frame.ts, firstKin), чья звезда на виду, а подписи места не нашлось (sky.hiddenLabels(),
 * контракт 2 этапа 14; по значимости). Имя — кнопка: наведение и фокус ставят кольцо на звезду и подсвечивают связь, как
 * имя в «Родстве»; нажатие выбирает лицо и открывает его карточку у звезды. Строки нет, если все подписаны. Список
 * обновляется, когда небо стоит: в перелёте и протяжке подписи меняются каждым кадром.
 */
function HiddenKin({ id }: { id: string }) {
  const [ids, setIds] = useState<readonly string[]>([]);
  useEffect(() => {
    let timer = 0;
    const off = effect(() => {
      void viewTick.value;
      const s = skyRef.current;
      if (!s || s.cam.moving) return;
      const kin = firstKin(id).map((k) => k.id);
      const set = new Set(kin);
      const next = s.hiddenLabels().filter((x) => set.has(x));
      // звезда родни под самой карточкой — тоже без подписи на виду (подписи неба карточку обходят, sky.hiddenLabels() её
      // не считает: звезды под резервом не видно)
      const card = lastRect;
      if (card) {
        const named = new Set(s.ledger.boxes.filter((b) => b.kind === 'star' && b.id).map((b) => b.id!));
        for (const x of kin) {
          if (next.includes(x) || named.has(x) || s.hides(x)) continue;
          const q = screenOf(x);
          if (q && q.x >= card.x && q.x <= card.x + card.w && q.y >= card.y && q.y <= card.y + card.h) next.push(x);
        }
      }
      // строка меняет высоту карточки, карточка — резерв подписей: смена списка — после короткой паузы, без дрожи
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIds((prev) => (prev.join() === next.join() ? prev : next)), 150);
    });
    return () => {
      off();
      window.clearTimeout(timer);
      if (hovered.peek() && firstKin(id).some((k) => k.id === hovered.peek())) hovered.value = null;
    };
  }, [id]);
  if (!ids.length) return null;
  const rel = relationsOf(id);
  const shown = ids.slice(0, HIDDEN_NAMES);
  const more = ids.length - shown.length;
  const point = (x: string | null, key?: LinkKey) => {
    hovered.value = x;
    previewLinks.value = x && key ? [key] : null;
  };
  return (
    <p class="dc-hidden" data-ids={ids.join(' ')}>
      <span class="txt">Без подписи на небе: </span>
      {shown.map((x, i) => {
        const r = rel.get(x);
        const name = byId.get(x)?.name ?? x;
        return (
          <Fragment key={x}>
            {i ? <span class="txt">, </span> : null}
            <button
              type="button"
              class="person"
              data-id={x}
              aria-label={typo(`${name}${r?.role ? ` — ${r.role}` : ''}, без подписи на небе`)}
              onMouseEnter={() => point(x, r?.key)}
              onMouseLeave={() => point(null)}
              onFocus={() => point(x, r?.key)}
              onBlur={() => point(null)}
              onClick={(e) => {
                point(null);
                kinStep(x, e.detail === 0);
              }}
            >
              {name}
            </button>
          </Fragment>
        );
      })}
      {more > 0 ? <span class="txt">{typo(` и ещё ${more}`)}</span> : null}
    </p>
  );
}

export function PersonBody({ id, compact = false, brief = false, legend = false, onAll }: { id: string; compact?: boolean; brief?: boolean; legend?: boolean; onAll?: () => void }) {
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
      {/* легенда — только у лица с ветвями (союзы с детьми): без них карточке нечего сказать о цветах, и «Родство» остаётся */}
      {legend && legendFor(id) ? <FamilyLegend id={id} onAll={onAll} /> : <KinBlock id={id} compact={compact} brief={brief} onAll={onAll} />}
      {!phone && id === selected.value && <HiddenKin id={id} />}
      <div class="dc-cmds">
        {/* «Ближайшая родня» — одним действием (решение 145); на телефоне — первым пунктом «Предки и потомки ▾»: лист короче */}
        {!phone && <NearestCmd id={id} />}
        {/* на телефоне «Вся карточка ▴» разворачивает лист карточки (как «Развернуть» шапки листа) — кнопка с aria-expanded;
            при открытой подробной карточке (легенда семьи) команда остаётся: она ведёт фокус на заголовок карточки рядом
            (MOB-29, MOB-31; сценарии 170, 173) */}
        <Cmd
          onRun={() => showDetails(id, null)}
          title="Подробная карточка лица: 24 раздела"
          cls="dc-card"
          label={phone ? 'Вся карточка: развернуть лист' : undefined}
          expanded={phone ? false : undefined}
        >
          {phone ? 'Вся карточка ▴' : 'Вся карточка'}
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
              {c.branch === 'more' ? 'Продолжить ветвь' : 'Скрыть ветвь'}
            </Cmd>
          )}
          {c.parents && (
            <Cmd onRun={() => parentsDot(id)} title={c.parents === 'show' ? 'Родители, братья и сёстры — на небо' : 'Убрать с неба союз родителей, показанный от лица'}>
              {c.parents === 'show' ? 'Показать родителей' : 'Скрыть родителей'}
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
        <Cmd onRun={() => showDetails(unionSpouse(u, from), u.id)} label={typo(`Подробнее о союзе: ${names}`)} title="Подробная карточка союза справа: супруги, дети, стихи">
          Подробнее о союзе
        </Cmd>
      </div>
    </>
  );
}

/**
 * Строка «Линия» карточки связи (решение 105): какая лента и по какому стиху — «по Луке (лазурная лента), Лк 3:23»,
 * у общего шага — обе. Строка говорит правду о показе: если лента здесь этот шаг не рисует (конец вне показа), так
 * и сказано — «в этом показе — жёлтым путём, лента скрыта».
 */
function lineText(i: LinkInfo, drawn: boolean, squeezed = 0): string | null {
  if (!i.lines.length) return null;
  const part = (l: LinkInfo['lines'][number]) => `${l.line === 'joseph' ? 'по Матфею (золотая лента)' : 'по Луке (лазурная лента)'}${l.ref ? `, ${refShort(l.ref)}` : ''}`;
  // общий шаг обеих лент — коротко: «обе ленты: Мф 1:2 (золотая), Лк 3:33–34 (лазурная)»
  const both = (l: LinkInfo['lines'][number]) => `${l.ref ? `${refShort(l.ref)} ` : ''}(${l.line === 'joseph' ? 'золотая' : 'лазурная'})`;
  const t = i.lines.length > 1 ? `обе ленты: ${i.lines.map(both).join(', ')}` : part(i.lines[0]);
  // цепочка (К4, К7): «в этом показе лента сжата: скрыто 40»
  if (squeezed) return `${t}; в этом показе лента сжата: скрыто ${squeezed}`;
  return drawn ? t : `${t}; в этом показе — жёлтым путём, лента скрыта`;
}

/**
 * Где лицо сейчас относительно неба (решения 93, 105): null — на небе; 'out' — вне показа; 'fold' — спрятано свёрткой.
 * Читает показ, его временных гостей и свёртку — карточка перерисуется, когда они сменятся.
 */
function skyState(id: string): 'out' | 'fold' | null {
  const s = show.value;
  const c = showContent.value;
  void foldDesc.value;
  void foldGroups.value;
  if (s.kind !== 'all' && !c.ids.has(id) && !c.guests.has(id)) return 'out';
  const f = foldsHiding(id);
  return f.desc.length || f.groups.length ? 'fold' : null;
}

/**
 * Где конец связи сейчас (решение 93, К2–К3, К7): по концам-призракам неба (контракт 2: src/ui/linkstate.ts, linkGhosts —
 * их ставит небо в каждом кадре), а пока небо их не поставило — по показу и свёртке (skyState). Карточка говорит то же,
 * что небо: 'show' — вне показа, 'folded' — скрыт свёрткой, 'edge' — на небе, но за краем окна; null — звезда на экране.
 */
function endWhere(id: string, k: LinkKey): GhostWhy | null {
  const ks = linkKeyString(k);
  const g = linkGhosts.value.find((x) => x.id === id && x.ks === ks);
  if (g) return g.why;
  const w = skyState(id);
  return w === 'out' ? 'show' : w === 'fold' ? 'folded' : null;
}

/**
 * Строки концов связи: «Отец», «Мать», «Сын» — имя-ссылка и годы. Конец не на небе (решение 93, К3; К7) — под именем
 * строка «нет в показе «ключевые лица» — показать Илия» (или «скрыт на небе — показать»): лицо встаёт временным гостем
 * до снятия выбора (src/ui/show.ts, showGuest); за краем окна — «за краем окна — показать»: вписать связь.
 */
function EndRow({ id, role, k, n, ends, brief = false }: { id: string; role: string; k: LinkKey; n: number; ends: readonly string[]; brief?: boolean }) {
  const q = byId.get(id);
  // краткая карточка связи (§ 6: полной нет места) — без годов концов: они во «всё о связи», а строка концов — в одну строку
  const years = q && !brief ? passportYears(id, model.value.chrono.get(id), isPeople(id)) : '';
  const where = endWhere(id, k);
  const f = q?.sex === 'f';
  const lead =
    where === 'show' ? `нет в показе «${showTitle(show.value)}» — ` : where === 'folded' ? `${f ? 'скрыта' : 'скрыт'} на небе — ` : where === 'edge' ? 'за краем окна — ' : '';
  return (
    <div class="dc-row end" data-row={`end${n}`}>
      <dt class="dc-lbl">{capFirst(role || 'лицо')}</dt>
      <dd class="dc-val">
        {/* имя кнопки — фраза родства (решение 151): «Илий — отец», «Рахиль — мать, вне показа» */}
        <button type="button" class="person" data-id={id} aria-label={kinLabel({ id, dis: null, role, marks: [], outside: where === 'show' })} onClick={() => goTo(id)}>
          {q?.name ?? id}
        </button>
        {years && <span class="note">{typo(`, ${years}`)}</span>}
        {where && (
          <span class="dc-out" data-out={where}>
            {typo(lead)}
            {where === 'edge' ? (
              <button type="button" class="dc-show" aria-label={`Вписать связь: ${q?.name ?? id} за краем окна`} onClick={() => flyToIds(ends)}>
                показать
              </button>
            ) : (
              <button type="button" class="dc-show" aria-label={`Поставить на небо: ${q?.name ?? id}`} title="Лицо встанет на небо гостем до снятия выбора связи" onClick={() => showGuest(id)}>
                поставить на небо
              </button>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * Показать скрытых цепочки (решение 93, К4 — тот же глагол, что у «+N» на ленте): в показе «набор» лица цепочки
 * добавляются в набор; в других показах — показ «Родословие Иисуса Христа (Мф 1, Лк 3)» с опорой на младший конец.
 */
function showSpan(k: Extract<LinkKey, { kind: 'span' }>) {
  const inner = spanHidden(k) ?? [];
  if (show.peek().kind === 'set') addPath([k.from, ...inner, k.to]);
  else setShow({ kind: 'lines' }, { anchor: k.to });
}

/** Строка неназванного конца: «Мать — в Писании не названа» (макет X4 М1). */
function MissingRow({ role, text }: { role: string; text: string }) {
  return (
    <div class="dc-row end missing">
      <dt class="dc-lbl">{role}</dt>
      <dd class="dc-val">
        <span class="txt">{typo(text)}</span>
      </dd>
    </div>
  );
}

/**
 * Строка основания под заголовком (решение 105): одно предложение из § 24 конца связи или слова уровня; карточки концов
 * подгружаются — до этого строки нет.
 */
function BasisLine({ k }: { k: LinkKey }) {
  void cardsTick.value;
  const b = linkBasis(k);
  const need = b?.need.join(' ') ?? '';
  useEffect(() => {
    if (need) askCards(need.split(' '));
  }, [need]);
  if (!b || b.need.length) return null;
  const who = b.from ? byId.get(b.from) : null;
  return (
    <p class="dc-basis">
      {typo(b.text)}
      {who && (
        <span class="dc-src">
          {' ('}
          <button type="button" class="person" data-id={who.id} title="Карточка лица: § 24 «Примечания»" onClick={() => goTo(who.id)}>
            {typo(`${who.name}, § 24`)}
          </button>
          {')'}
        </span>
      )}
    </p>
  );
}

/**
 * Тело карточки связи. brief — краткий вид (§ 6: полной карточке нет места у линии): заголовок со словом уровня, стихи,
 * концы с ролями и строки «вне показа», команды; остальное («Линия», «Союз», основание, неназванный конец) — по
 * «всё о связи — ещё N строк» (onAll): карточка снова полная.
 */
function LinkBody({ k, brief = false, onAll }: { k: LinkKey; brief?: boolean; onAll?: () => void }) {
  const i = linkInfo(k);
  if (!i) return <p class="dc-note">Связь не найдена в данных.</p>;
  const u = i.union;
  const endIds = i.ends.map((e) => e.id);
  // шаг ленты — показать на небе родителя шага и ребёнка
  if (k.kind === 'step') {
    const p = stepParent(k.line, k.child);
    if (p && !endIds.includes(p)) endIds.unshift(p);
  }
  // лента рисует шаг, только если родитель шага и ребёнок оба на небе; цепочку (span) лента рисует сжатой
  const kid = k.kind === 'child' || k.kind === 'step' ? k.child : null;
  const drawn = k.kind === 'span' || (!!kid && i.lines.every((l) => {
    const p = stepParent(l.line, kid);
    return !skyState(kid) && (!p || !skyState(p));
  }));
  const hidden = k.kind === 'span' ? (spanHidden(k) ?? []) : [];
  const lines = lineText(i, drawn, hidden.length);
  // пометы без пометы уровня: уровень уже первым словом заголовка
  const marks = i.lead ? i.marks.filter((m) => m !== 'толк.' && m !== 'выв.') : i.marks;
  return (
    <>
      <div class="dc-head">
        <h3 id="dc-link-title" tabIndex={-1} data-lead={i.lead ?? undefined}>
          {i.title}
        </h3>
        {/* стихи связи — кнопки с вклейкой (решение 152; U7): текст стиха — одним действием, прямо в карточке связи */}
        {i.refs.length > 0 && (
          <div class="dc-refs">
            {/* краткая карточка (§ 6: места мало) — две ссылки и «ещё N»: строка стихов не переносится */}
            <Refs refs={i.refs} owner={`dc-link|${ks(k)}`} max={brief ? 2 : 4} />
            <VerseInsert owner={`dc-link|${ks(k)}`} refs={i.refs} />
          </div>
        )}
        {!brief && <BasisLine k={k} />}
        {marks.length > 0 && <div class="dc-marks">{typo(marks.join(', '))}</div>}
      </div>
      <dl class="dc-kin">
        {i.ends.map((e, n) => (
          <Fragment key={`${e.id}${n}`}>
            <EndRow id={e.id} role={e.role} k={k} n={n} ends={endIds} brief={brief} />
            {/* шаг ленты: второй родитель по союзу — после родителя шага, и в краткой карточке (решение 171; R1-12: «Мать —
                Вирсавия», Мф 1:6) */}
            {e.side === 'from' && i.other && <EndRow id={i.other.id} role={i.other.role} k={k} n={i.ends.length} ends={endIds} brief={brief} />}
          </Fragment>
        ))}
        {i.missing && !brief && <MissingRow role={i.missing.role} text={i.missing.text} />}
        {lines && !brief && (
          <div class="dc-row lines">
            <dt class="dc-lbl">Линия</dt>
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
              <span class="note">{typo(`: ${kidsCount(u)}`)}</span>
            </dd>
          </div>
        )}
        {brief && onAll && (() => {
          // что краткий вид не показал: строки основания, неназванного конца, «Линии», «Союза» и пояснение
          const more = [i.lead ? 1 : 0, i.missing ? 1 : 0, lines ? 1 : 0, u && k.kind !== 'union' ? 1 : 0, i.note ? 1 : 0].reduce((a, b) => a + b, 0);
          return more > 0 ? (
            <div class="dc-row all">
              <dt class="dc-lbl" />
              <dd class="dc-val">
                <button type="button" class="dc-more" title="Показать всю карточку связи" onClick={onAll}>
                  {`всё о связи — ещё ${more} ${more === 1 ? 'строка' : more < 5 ? 'строки' : 'строк'}`}
                </button>
              </dd>
            </div>
          ) : null;
        })()}
      </dl>
      {i.note && !brief && <p class="dc-note">{typo(i.note)}</p>}
      <div class="dc-cmds">
        {k.kind === 'span' && hidden.length > 0 && (
          <Cmd onRun={() => showSpan(k)} title={show.value.kind === 'set' ? 'Добавить скрытых в набор' : 'Показ «Родословие Иисуса Христа (Мф 1, Лк 3)»: вся лента'}>
            {`Показать скрытых (${hidden.length})`}
          </Cmd>
        )}
        {u && (
          <Cmd onRun={() => showDetails(unionSpouse(u, u.a ?? u.b ?? u.kids[0]), u.id)} title="Подробная карточка союза справа: супруги, дети, стихи">
            Подробнее о союзе
          </Cmd>
        )}
        <Cmd onRun={() => flyToIds(endIds)} title="Вписать в окно оба конца связи">
          Вписать связь
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
  /**
   * Краткий вид (§ 6): полной карточке нет места без желательного — имя, годы, одна строка «Родства», команды. fullSize —
   * размер полной карточки: как только ей есть место, карточка снова полная.
   */
  const [brief, setBrief] = useState(false);
  const briefRef = useRef(false);
  const fullSize = useRef<{ w: number; h: number } | null>(null);
  /** читатель уже работал с карточкой («ещё 13», меню): выросшая по его просьбе карточка краткой не становится */
  const touched = useRef(false);
  /**
   * лицо, у которого читатель попросил «всё родство» вместо легенды семьи (решение 153): полное «Родство», пока открыта
   * карточка этого лица, — и после карточки связи, открытой из «Родства» (Escape возвращает к тому же имени, M9)
   */
  const [kinAllFor, setKinAllFor] = useState<string | null>(null);
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
      // начало «С Иисуса Христа»: окно вокруг лица ещё ставится под новую ширину неба (view.ts, aroundPending) — ждать его
      const waiting = (cur?.until && now < cur.until) || (cur?.kind === 'person' && aroundPending(cur.id));
      if (!s.cam.moving && now - outSince.current > OUT_MS && !waiting) closeDot(el.contains(document.activeElement));
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
      const o = obstacles(lk ? (focus && byId.has(focus) ? focus : null) : cur?.kind === 'person' ? focus : null, ends, a, !!lk, size.current, lk ? stepNext(lk) : []);
      const opts = { ...o, prev: spot.current, fine: !s.cam.moving };
      q = placeCard(a, size.current, bounds, opts);
      // полной карточке места нет (§ 6): краткий вид — имя, годы, одна строка «Родства», команды; новый размер —
      // ResizeObserver и новое место. Краткая карточка возвращается к полной, как только полной есть место
      // пока небо едет, место ищется по крупной сетке (fine: false) — «места нет» тогда не окончательно: краткий вид — только
      // по мелкой сетке, когда небо встало (иначе карточка мигала бы краткой и полной, U8)
      if (q.free === false && !briefRef.current && !touched.current && s.cam.moving) timer.current = window.setTimeout(place, 160);
      else if (q.free === false && !briefRef.current && !touched.current) {
        briefRef.current = true;
        fullSize.current = { ...size.current };
        setBrief(true);
      } else if (briefRef.current && fullSize.current && !s.cam.moving && placeCard(a, fullSize.current, bounds, { ...opts, prev: null }).free) {
        briefRef.current = false;
        setBrief(false);
      } else if (briefRef.current && fullSize.current && s.cam.moving) {
        // небо ещё едет (вписывание, выведение лица из-под органов неба): последний кадр движения бывает раньше, чем
        // камера встала, и кадра «в покое» может не быть — проверить место полной карточки, когда небо остановится
        timer.current = window.setTimeout(place, 160);
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
    // карточка — резерв подписей (data-reserve="dot", решение 153): встала на новое место — небо заново замеряет резерв
    // (SkyView слушает «reserve-move»; размер не менялся, и ResizeObserver молчал бы)
    const moved = el.style.left !== `${Math.round(q.x)}px` || el.style.top !== `${Math.round(q.y)}px`;
    el.style.left = `${Math.round(q.x)}px`;
    el.style.top = `${Math.round(q.y)}px`;
    if (moved) reserveMoved(el, s.cam);
    el.dataset.side = q.side;
    el.setAttribute('data-placed', '');
    lastRect = { x: q.x, y: q.y, w: size.current.w, h: size.current.h };
    lead.hidden = !q.lead;
    if (q.lead) Object.assign(lead.style, { left: `${q.lead.x}px`, top: `${Math.round(q.lead.y)}px`, width: `${Math.round(q.lead.w)}px`, height: `${Math.round(q.lead.h)}px` });
    if (q.line) {
      line.style.display = 'block';
      for (const l of line.querySelectorAll('line')) {
        l.setAttribute('x1', String(q.line.x1));
        l.setAttribute('y1', String(q.line.y1));
        l.setAttribute('x2', String(q.line.x2));
        l.setAttribute('y2', String(q.line.y2));
      }
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
    // объявление выбранной связи для диктора (§ 8) — одно: его делает небо (SkyView, живая область неба); карточка связи
    // не повторяет его (решение 151; M7: прежде связь звучала дважды)
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
    setKinAllFor((v) => {
      const d = dotCard.peek();
      return d?.kind === 'person' && d.id === v ? v : null;
    });
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

  const live = null;
  if (!on || inSheet || (!at && !link)) return live;
  const u = !link && at?.kind === 'union' ? unionById(at.uid) : undefined;
  if (!link && at?.kind === 'union' && !u) return live;
  const kind = link ? 'link' : at!.kind;
  // широкий экран, подробная карточка открыта рядом (решение 153; U8): карточка у звезды — легенда семьи, а не второе
  // «Родство»; полное — по ссылке «всё родство» в легенде, при свёрнутой подробной карточке и на телефоне. Открытая
  // с клавиатуры (Enter на звезде, шаг по «Родству») — сразу с «Родством»: фокус встаёт на его первое имя, и путь к связи
  // остаётся в несколько нажатий (решение 83; сценарий владельца 3, 822)
  const g = grid.value;
  const legend = !link && at?.kind === 'person' && at.id === selected.value && !at.keyboard && !g.phone && g.folio > 0 && !g.spine && kinAllFor !== at.id;
  return (
    <>
      {live}
      <div ref={leadRef} class="dc-lead" hidden aria-hidden="true" />
      {/* привязка карточки вдали от знака (решение 171; V-7): точечная линия с ореолом цвета неба — не похожа на связь */}
      <svg ref={lineRef} class="dc-line" aria-hidden="true" width="1" height="1">
        <line class="halo" x1="0" y1="0" x2="0" y2="0" />
        <line class="dots" x1="0" y1="0" x2="0" y2="0" />
      </svg>
      <div
        ref={ref}
        key={key}
        class={['dotcard', `dc-${kind}`, brief ? 'dc-brief' : ''].filter(Boolean).join(' ')}
        data-brief={brief ? '' : undefined}
        role="dialog"
        aria-label={link ? linkSpeech(link) : dotLabel(at!)}
        data-kind={kind}
        data-legend={legend ? '' : undefined}
        data-reserve="dot"
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
        {link ? (
          <LinkBody
            k={link}
            brief={brief}
            onAll={() => {
              // читатель просит всю карточку связи: полная, и краткой по месту больше не становится
              touched.current = true;
              briefRef.current = false;
              setBrief(false);
              requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('.dc-row.lines .txt, .dc-row.union .person, .dc-kin .person')?.focus({ preventScroll: true }));
            }}
          />
        ) : at!.kind === 'person' ? (
          <PersonBody
            id={at!.id}
            brief={brief}
            legend={legend && !brief}
            onAll={() => {
              // читатель просит всё «Родство»: карточка полная, и краткой по месту больше не становится
              touched.current = true;
              briefRef.current = false;
              setBrief(false);
              setKinAllFor(at!.kind === 'person' ? at!.id : null);
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
