/**
 * Сетка экрана [панель][небо][карточка] (C1, C2; VIS-12, VIS-19, UX-15, IX-12, IX-13, MOB-20; решения владельца 7 и 14).
 *
 * Панель — колонка сетки, а не слой поверх неба: холст сжимается, рамка рисуется от нового края; панель никогда не
 * ложится на карточку. Небу — не меньше max(480 px, 40 % ширины): сначала панель сужается (обычная — до 360 px,
 * широкая — до 560), затем карточка сворачивается в корешок 56 px (имя и «развернуть»). Небо уже 40 % не бывает.
 * Широкие панели (синопсис, указатель) — не шире 60 % ширины. На телефоне (≤ 720 px) — прежняя схема:
 * панель — полноэкранный лист, карточка — нижний лист.
 *
 * Ширина карточки (C2): 500 px при ≥ 1360, 460 — при 1200–1359, 400 — при 1024–1199, 380 — уже (планшет);
 * на низком экране (альбомная ориентация, высота ≤ 520 px) — 340 (H6). Те же числа — в tokens.css и phone.css
 * (--folio-w), их совпадение проверяет tests/layout.test.ts; во время работы ширину ставит App (--folio-w на .app).
 *
 * Размер областей (J2; решение владельца 16): границы «панель | небо» и «небо | карточка» перетаскиваются. Ширина,
 * которую задал читатель, — предпочтение (userWidths, память браузера): карточка — от 360 до 640 px, панель — от 320 px
 * до 60 % окна. Пределы C1 сильнее: небу не меньше max(480 px, 40 %). Не помещается — сначала уже панель (до 360 или
 * 560 px, как в C1), затем карточка — до своей ширины по умолчанию, затем карточка — корешок.
 * «Небо во весь экран» (клавиша F): панель и карточка — корешки 56 px, повторное нажатие возвращает всё как было.
 *
 * «Свернуть карточку» (решение 18; VIS-44, UX-50): свёрнутая карточка — тот же корешок 56 px, небо занимает
 * освободившееся место; панель остаётся колонкой. Одна модель для всех свёрнутых областей.
 */
import { computed, effect, signal } from '@preact/signals';
import { panel, pickMode, selected, type Panel } from '../state.ts';
import { cardFolded, cardTabs } from './stack.ts';

export const PHONE_MAX = 720;
export const SPINE_W = 56;
/** Самое узкое небо: доля ширины окна (жёстко) и ширина в px (если помещается). */
export const SKY_SHARE = 0.4;
export const SKY_MIN = 480;
/** Низкий экран (альбомная ориентация телефона и планшета, H6): карточка — колонка 340 px. */
export const SHORT_H = 520;
export const FOLIO_SHORT = 340;
/** Пределы ширины, которую задаёт читатель (J2): карточка, панель (доля окна — наибольшая). */
export const FOLIO_MIN = 360;
export const FOLIO_MAX = 640;
export const SHEET_MIN = 320;
export const SHEET_SHARE = 0.6;

export type PanelKind = 'none' | 'regular' | 'wide';

export interface Grid {
  phone: boolean;
  /** ширина колонки панели, px (0 — панели в сетке нет) */
  sheet: number;
  /** ширина карточки или корешка, px (0 — карточки нет) */
  folio: number;
  /** карточка свёрнута в корешок */
  spine: boolean;
  /** ширина неба, px */
  sky: number;
  /** панель свёрнута в корешок («Небо во весь экран», J2) */
  sheetSpine?: boolean;
  /** «Небо во весь экран» (J2) */
  full?: boolean;
  /** карточку свернул читатель («Свернуть карточку») — корешок по его выбору, а не по нехватке места */
  folded?: boolean;
}

/** Ширины, заданные читателем (J2): обычной панели, широкой панели и карточки; нет поля — ширина по умолчанию. */
export interface Widths {
  regular?: number;
  wide?: number;
  folio?: number;
}

/** Что ещё, кроме ширины окна, решает сетку: высота окна, ширины читателя, «Небо во весь экран». */
export interface GridOpts {
  h?: number;
  widths?: Widths;
  full?: boolean;
  /** карточка свёрнута в корешок командой «Свернуть карточку» */
  folded?: boolean;
}

/** Ширина карточки по ширине окна (C2; решение 14). */
export function cardWidth(W: number): number {
  if (W >= 1360) return 500;
  if (W >= 1200) return 460;
  if (W >= 1024) return 400;
  return 380;
}

/** Ширина карточки по умолчанию с учётом высоты окна: на низком экране — 340 (H6; phone.css). */
export function folioDefault(W: number, H?: number): number {
  return H !== undefined && H <= SHORT_H && W > PHONE_MAX ? FOLIO_SHORT : cardWidth(W);
}

/** Самое узкое небо при ширине окна W: max(480, 40 %) и 40 % (жёстко). */
function skyFloor(W: number): { want: number; floor: number } {
  const floor = Math.ceil(W * SKY_SHARE);
  return { want: Math.max(SKY_MIN, floor), floor };
}

/** Пределы ширины карточки, которую задаёт читатель: 360…640 px, но небу — не меньше max(480, 40 %). */
export function folioRange(W: number, H?: number): [number, number] {
  const def = folioDefault(W, H);
  return [Math.min(FOLIO_MIN, def), Math.max(def, Math.min(FOLIO_MAX, W - skyFloor(W).want))];
}

/** Пределы ширины панели, которую задаёт читатель: 320 px … 60 % окна (широкая по умолчанию — и так не шире 60 %). */
export function sheetRange(W: number, wide: boolean): [number, number] {
  const def = panelWidth(W, wide);
  return [Math.min(SHEET_MIN, def), Math.max(def, Math.floor(W * SHEET_SHARE))];
}

const clampTo = (v: number, [a, b]: [number, number]) => Math.max(a, Math.min(b, v));

/** Желаемая ширина панели (VIS-19): 400 при < 1280, 440 при 1280–1599, 520 при ≥ 1600; широкая — до 820 и не шире 60 %. */
export function panelWidth(W: number, wide: boolean): number {
  if (wide) return Math.min(820, Math.floor(W * 0.6));
  return W >= 1600 ? 520 : W >= 1280 ? 440 : 400;
}

/** Какие панели — колонки сетки и какие из них широкие. «Разворот» — режим чтения поверх всего; «Вид» — лист у органов неба. */
export function panelKind(p: Panel): PanelKind {
  if (!p || p === 'spread' || p === 'view') return 'none';
  // широкие: синопсис (колонки линий), указатель (три столбца), сквозной раздел (таблица по разделу)
  return p === 'synopsis' || p === 'index' || p === 'section' ? 'wide' : 'regular';
}

export function gridFor(W: number, kind: PanelKind, card: boolean, o: GridOpts = {}): Grid {
  if (W <= PHONE_MAX) return { phone: true, sheet: 0, folio: 0, spine: false, sky: W };
  const wide = kind === 'wide';
  // «Небо во весь экран» (J2): панель и карточка — корешки
  if (o.full && (kind !== 'none' || card)) {
    const P = kind !== 'none' ? SPINE_W : 0;
    const F = card ? SPINE_W : 0;
    return { phone: false, sheet: P, folio: F, spine: card, sky: W - P - F, sheetSpine: kind !== 'none', full: true };
  }
  const { want, floor } = skyFloor(W);
  // карточку свернул читатель: корешок, небо и панель делят остальное (ниже — как при корешке по нехватке места)
  const folded = card && !!o.folded;
  const Fd = card ? folioDefault(W, o.h) : 0;
  // ширина карточки, которую задал читатель, — в своих пределах; по умолчанию — по экрану (C2, H6)
  const Fu = card && o.widths?.folio !== undefined ? clampTo(o.widths.folio, folioRange(W, o.h)) : Fd;
  if (kind === 'none' && folded) return { phone: false, sheet: 0, folio: SPINE_W, spine: true, sky: W - SPINE_W, folded: true };
  if (kind === 'none') {
    // небу — не меньше max(480, 40 %): шире своей ширины по умолчанию карточка за этот предел не идёт
    const F = Math.max(Math.min(Fu, Fd), Math.min(Fu, W - want));
    return { phone: false, sheet: 0, folio: F, spine: false, sky: W - F };
  }
  const user = o.widths?.[wide ? 'wide' : 'regular'];
  const pref = user !== undefined ? clampTo(user, sheetRange(W, wide)) : panelWidth(W, wide);
  const pMin = Math.min(pref, wide ? 560 : 360);
  // карточка остаётся целиком, если панели хватает места хотя бы в наименьшей ширине: сначала уже панель,
  // затем карточка — до своей ширины по умолчанию
  if (card && !folded) {
    let F = Fu;
    if (W - F - want < pMin) F = Math.max(Math.min(Fu, Fd), W - want - pMin);
    const room = W - F - want;
    if (room >= pMin) {
      const P = Math.min(pref, room);
      return { phone: false, sheet: P, folio: F, spine: false, sky: W - F - P };
    }
  }
  // иначе карточка — корешок; панель сужается до наименьшей, а небо — до 40 %, только если иначе не помещается
  const side = card ? SPINE_W : 0;
  let P = Math.min(pref, W - side - want);
  if (P < pMin) P = Math.min(pMin, W - side - floor);
  P = Math.max(0, Math.floor(P));
  return { phone: false, sheet: P, folio: side, spine: card, sky: W - side - P, ...(folded ? { folded: true } : {}) };
}

/**
 * Пределы ручки-разделителя при сетке g (J2): какую ширину панели (side = 'sheet') или карточки ('folio') можно задать.
 * Ручка не сдвигает соседа: наибольшая ширина — та, при которой небу при нынешней ширине соседа остаётся max(480, 40 %).
 * Нынешнее положение ручки всегда в пределах (C1 мог сузить колонку сильнее, чем позволяет предел читателя).
 */
export function splitRange(W: number, kind: PanelKind, side: 'sheet' | 'folio', g: Grid, H?: number): [number, number] {
  const { want } = skyFloor(W);
  const [a, b] = side === 'folio' ? folioRange(W, H) : sheetRange(W, kind === 'wide');
  const now = side === 'folio' ? g.folio : g.sheet;
  const other = side === 'folio' ? g.sheet : g.folio;
  const lo = Math.min(a, now);
  return [lo, Math.max(lo, now, Math.min(b, W - want - other))];
}

/** Ширина окна (обновляет App при изменении размера). */
export const viewportWidth = signal(typeof window === 'undefined' ? 1440 : window.innerWidth);
/** Высота окна: на низком экране карточка уже (H6). */
export const viewportHeight = signal(typeof window === 'undefined' ? 900 : window.innerHeight);

// ---------- ширины читателя и «Небо во весь экран» (J2) ----------

const WIDTHS_KEY = 'toledot:widths';
/** Ширины из памяти браузера: только числа в разумных пределах. */
export function readWidths(raw: string | null): Widths {
  const out: Widths = {};
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (v && typeof v === 'object')
      for (const k of ['regular', 'wide', 'folio'] as const) {
        const n = v[k];
        if (typeof n === 'number' && Number.isFinite(n) && n >= 200 && n <= 4000) out[k] = Math.round(n);
      }
  } catch {
    /* испорченная запись — ширины по умолчанию */
  }
  return out;
}
function loadWidths(): Widths {
  try {
    return readWidths(localStorage.getItem(WIDTHS_KEY));
  } catch {
    return {};
  }
}
/** Ширины, которые задал читатель, перетаскивая границы областей. */
export const userWidths = signal<Widths>(typeof window === 'undefined' ? {} : loadWidths());
if (typeof window !== 'undefined')
  effect(() => {
    const w = userWidths.value;
    try {
      if (Object.keys(w).length) localStorage.setItem(WIDTHS_KEY, JSON.stringify(w));
      else localStorage.removeItem(WIDTHS_KEY);
    } catch {
      /* хранилище недоступно — ширины живут до перезагрузки */
    }
  });
/** Задать ширину панели нынешнего вида или карточки; null — вернуть ширину по умолчанию (двойной щелчок по ручке). */
export function setWidth(key: keyof Widths, v: number | null) {
  const next = { ...userWidths.peek() };
  if (v === null) delete next[key];
  else next[key] = Math.round(v);
  userWidths.value = next;
}

/** «Небо во весь экран» (J2): панель и карточка свёрнуты в корешки; живёт в сеансе. */
export const skyFull = signal(false);
/** Есть ли что свернуть в корешок: колонка панели или карточка (на телефоне — нет: там листы). */
export const canFill = computed(() => viewportWidth.value > PHONE_MAX && (panelKind(panel.value) !== 'none' || !!selected.value));
/** Переключить «Небо во весь экран» (клавиша F, органы неба). Сворачивать нечего — ничего не происходит. */
export function toggleFull(): boolean {
  if (!skyFull.peek() && !canFill.peek()) return false;
  skyFull.value = !skyFull.peek();
  return true;
}
/**
 * «Развернуть» на корешке: вернуть панель и карточку. Корешок бывает по трём причинам: «Небо во весь экран» — выключить
 * его; «Свернуть карточку» — развернуть; нехватка места рядом с широкой панелью (C1) — закрыть панель (её прокрутка
 * и фильтры помнятся, D11). Если после первых двух карточке всё равно не хватает места, закрывается и панель.
 */
export function unfoldCard() {
  const was = { full: skyFull.peek(), folded: cardFolded.peek() };
  if (was.full) skyFull.value = false;
  if (was.folded) cardFolded.value = false;
  if (!was.full && !was.folded) {
    panel.value = null;
    return;
  }
  if (!was.full && grid.peek().spine) panel.value = null;
}
if (typeof window !== 'undefined') {
  // открыли другую панель — читатель хочет её видеть: небо больше не во весь экран; сворачивать стало нечего — тоже
  let shownPanel = panel.peek();
  effect(() => {
    const p = panel.value;
    const was = shownPanel;
    shownPanel = p;
    if (!skyFull.peek()) return;
    if ((p && p !== was && panelKind(p) !== 'none') || !canFill.value) skyFull.value = false;
  });
}

/**
 * «Карточка на весь экран» (этап 13, решение 123; UI-16): на широком экране лист карточки ложится поверх неба, панелей
 * и полосы времени — сосредоточенное чтение; сетка не меняется, небо не пересчитывается. Возврат — та же команда
 * («Вернуть небо»), Escape, открытие панели, выбор второго лица на небе, «Небо во весь экран» или свёрнутая карточка.
 * Лицо меняется — режим остаётся: читатель идёт по ссылкам из карточки в карточку. На телефоне режима нет: там лист.
 */
export const cardFull = signal(false);
export const canCardFull = computed(() => viewportWidth.value > PHONE_MAX && !!selected.value && !cardFolded.value && !skyFull.value);
/** Включить, выключить или переключить «Карточку на весь экран»; включить можно, только когда есть что показать. */
export function toggleCardFull(on: boolean = !cardFull.peek()) {
  cardFull.value = on && canCardFull.peek();
}
if (typeof window !== 'undefined') {
  let shown = panel.peek();
  effect(() => {
    const p = panel.value;
    const was = shown;
    shown = p;
    const pick = pickMode.value;
    const can = canCardFull.value;
    if (!cardFull.peek()) return;
    if ((p && p !== was) || pick || !can) cardFull.value = false;
  });
}

/**
 * Сетка сейчас: по ширине и высоте окна, открытой панели, выбранному лицу, ширинам читателя и «Небу во весь экран».
 * Лицо не выбрано, но есть закреплённые карточки (решение 91) — колонка карточки остаётся корешком 56 px с вкладками:
 * они видны всегда, небо отдаёт им только корешок.
 */
export const grid = computed(() => {
  const sel = !!selected.value;
  const tabsOnly = !sel && cardTabs.value.length > 0;
  return gridFor(viewportWidth.value, panelKind(panel.value), sel || tabsOnly, {
    h: viewportHeight.value,
    widths: userWidths.value,
    full: skyFull.value,
    folded: cardFolded.value || tabsOnly,
  });
});
