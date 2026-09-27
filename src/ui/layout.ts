/**
 * Сетка экрана [панель][небо][карточка] (C1, C2; VIS-12, VIS-19, UX-15, IX-12, IX-13, MOB-20; решения владельца 7 и 14).
 *
 * Панель — колонка сетки, а не слой поверх неба: холст сжимается, рамка рисуется от нового края; панель никогда не
 * ложится на карточку. Небу — не меньше max(480 px, 40 % ширины): сначала панель сужается (обычная — до 360 px,
 * широкая — до 560), затем карточка сворачивается в корешок 56 px (имя и «развернуть»). Небо уже 40 % не бывает.
 * Широкие панели (синопсис, указатель) — не шире 60 % ширины. На телефоне (≤ 720 px) — прежняя схема:
 * панель — полноэкранный лист, карточка — нижний лист.
 *
 * Ширина карточки (C2): 500 px при ≥ 1360, 460 — при 1200–1359, 400 — при 1024–1199, 380 — уже (планшет).
 * Те же числа — в tokens.css (--folio-w), их совпадение проверяет tests/layout.test.ts.
 */
import { computed, signal } from '@preact/signals';
import { panel, selected, type Panel } from '../state.ts';

export const PHONE_MAX = 720;
export const SPINE_W = 56;
/** Самое узкое небо: доля ширины окна (жёстко) и ширина в px (если помещается). */
export const SKY_SHARE = 0.4;
export const SKY_MIN = 480;

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
}

/** Ширина карточки по ширине окна (C2; решение 14). */
export function cardWidth(W: number): number {
  if (W >= 1360) return 500;
  if (W >= 1200) return 460;
  if (W >= 1024) return 400;
  return 380;
}

/** Желаемая ширина панели (VIS-19): 400 при < 1280, 440 при 1280–1599, 520 при ≥ 1600; широкая — до 820 и не шире 60 %. */
export function panelWidth(W: number, wide: boolean): number {
  if (wide) return Math.min(820, Math.floor(W * 0.6));
  return W >= 1600 ? 520 : W >= 1280 ? 440 : 400;
}

/** Какие панели — колонки сетки и какие из них широкие. «Разворот» — режим чтения поверх всего; «Вид» — лист у органов неба. */
export function panelKind(p: Panel): PanelKind {
  if (!p || p === 'spread' || p === 'view') return 'none';
  return p === 'synopsis' || p === 'index' ? 'wide' : 'regular';
}

export function gridFor(W: number, kind: PanelKind, card: boolean): Grid {
  if (W <= PHONE_MAX) return { phone: true, sheet: 0, folio: 0, spine: false, sky: W };
  const F = card ? cardWidth(W) : 0;
  if (kind === 'none') return { phone: false, sheet: 0, folio: F, spine: false, sky: W - F };
  const pref = panelWidth(W, kind === 'wide');
  const floor = Math.ceil(W * SKY_SHARE);
  const want = Math.max(SKY_MIN, floor);
  const pMin = Math.min(pref, kind === 'wide' ? 560 : 360);
  // карточка остаётся целиком, если панели хватает места хотя бы в наименьшей ширине
  if (card) {
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
  return { phone: false, sheet: P, folio: side, spine: card, sky: W - side - P };
}

/** Ширина окна (обновляет App при изменении размера). */
export const viewportWidth = signal(typeof window === 'undefined' ? 1440 : window.innerWidth);

/** Сетка сейчас: по ширине окна, открытой панели и выбранному лицу. */
export const grid = computed(() => gridFor(viewportWidth.value, panelKind(panel.value), !!selected.value));
