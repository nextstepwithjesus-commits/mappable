/**
 * Карточка в боковой панели — одна текущая; закреплённые — вкладки (этап 12, решение 91; пункт 5 отзыва владельца).
 *
 * Прежняя стопка «Ещё открыты (N)» (J6; решения 17, 18) убрана: щелчок по лицу открывает его карточку на месте прежней.
 * Карточку, к которой нужен быстрый доступ, читатель закрепляет командой «Закрепить карточку персонажа» (рядом со
 * «Свернуть карточку»). Закреплённая карточка при выборе другого лица сворачивается в строку-вкладку вверху панели:
 * цветная метка, имя с уточнением, «×». Щелчок по вкладке раскрывает её карточку (лицо выбирается), «×» закрывает
 * вкладку; у раскрытой закреплённой карточки вместо «Закрепить…» — «Открепить карточку персонажа».
 *
 * Вкладок сколько угодно; у каждой свой цвет из спокойной палитры (--tab-1 … --tab-8, tokens.css; не похожей на ленты,
 * ветви и жёлтую выбранную связь — проверка npm run -s contrast): новой вкладке — наименее занятый цвет, при равенстве —
 * первый по порядку. Вкладки помнятся в браузере (localStorage, «toledot:tabs»); cardFolded — карточка свёрнута
 * в корешок («Свернуть карточку»), помнится в сеансе.
 * Модуль называется по-прежнему stack.ts: на cardFolded опирается сетка (src/ui/layout.ts).
 */
import { batch, effect, signal } from '@preact/signals';
import { byId } from '../data/atlas.ts';
import { selected } from '../state.ts';

const hasWindow = typeof window !== 'undefined';

/** Вкладка закреплённой карточки: лицо и номер цвета (0 … TAB_HUES − 1). */
export interface CardTab {
  id: string;
  hue: number;
}

/** Сколько цветов в палитре вкладок (--tab-1 … --tab-8, tokens.css); дальше цвета повторяются. */
export const TAB_HUES = 8;
/** Где помнятся вкладки. */
export const TABS_KEY = 'toledot:tabs';

/**
 * Вкладки из памяти браузера: только известные лица, без повторов; цвет — целое 0…7, иначе — наименее занятый.
 * Испорченная запись — вкладок нет.
 */
export function readTabs(raw: string | null, known: (id: string) => boolean = (x) => byId.has(x)): CardTab[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: CardTab[] = [];
  for (const x of v) {
    const id = typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as CardTab).id === 'string' ? (x as CardTab).id : null;
    if (!id || !known(id) || out.some((t) => t.id === id)) continue;
    const h = x && typeof x === 'object' ? (x as CardTab).hue : undefined;
    out.push({ id, hue: Number.isInteger(h) && (h as number) >= 0 && (h as number) < TAB_HUES ? (h as number) : nextHue(out) });
  }
  return out;
}

function loadTabs(): CardTab[] {
  try {
    return readTabs(window.localStorage.getItem(TABS_KEY));
  } catch {
    return [];
  }
}

/** Закреплённые карточки — по порядку закрепления. */
export const cardTabs = signal<CardTab[]>(hasWindow ? loadTabs() : []);
if (hasWindow)
  effect(() => {
    const t = cardTabs.value;
    try {
      if (t.length) window.localStorage.setItem(TABS_KEY, JSON.stringify(t));
      else window.localStorage.removeItem(TABS_KEY);
    } catch {
      /* хранилище недоступно — вкладки живут до перезагрузки */
    }
  });

/** Цвет новой вкладки: наименее занятый, при равенстве — первый по порядку палитры. */
export function nextHue(tabs: readonly CardTab[]): number {
  const used = new Array<number>(TAB_HUES).fill(0);
  for (const t of tabs) used[t.hue]++;
  let best = 0;
  for (let h = 1; h < TAB_HUES; h++) if (used[h] < used[best]) best = h;
  return best;
}

/** Вкладки после закрепления id (уже закреплена — без изменений). Чистая функция. */
export function withTab(tabs: readonly CardTab[], id: string): CardTab[] {
  if (tabs.some((t) => t.id === id)) return [...tabs];
  return [...tabs, { id, hue: nextHue(tabs) }];
}

/** Вкладки без id. Чистая функция. */
export const withoutTab = (tabs: readonly CardTab[], id: string): CardTab[] => tabs.filter((t) => t.id !== id);

/** Вкладка лица id или null. */
export const tabOf = (id: string, tabs: readonly CardTab[] = cardTabs.value): CardTab | null => tabs.find((t) => t.id === id) ?? null;
/** Карточка лица закреплена. */
export const isPinned = (id: string, tabs: readonly CardTab[] = cardTabs.value) => tabs.some((t) => t.id === id);

/** «Закрепить карточку персонажа». */
export function pinCard(id: string) {
  if (!byId.has(id)) return;
  cardTabs.value = withTab(cardTabs.peek(), id);
}

/** «Открепить карточку персонажа» и «×» вкладки: вкладка уходит; текущая карточка (если это она) остаётся открытой. */
export function unpinCard(id: string) {
  if (!isPinned(id, cardTabs.peek())) return;
  cardTabs.value = withoutTab(cardTabs.peek(), id);
}

/** Карточка свёрнута в корешок («Свернуть карточку»; решение 18): помнится в сеансе. */
function readFolded(): boolean {
  if (!hasWindow) return false;
  try {
    return window.sessionStorage.getItem('toledot:folded') === 'true';
  } catch {
    return false;
  }
}
export const cardFolded = signal<boolean>(readFolded());
if (hasWindow)
  effect(() => {
    const v = cardFolded.value;
    try {
      window.sessionStorage.setItem('toledot:folded', v ? 'true' : 'false');
    } catch {
      /* хранилище недоступно — свёрнутость не запомнится */
    }
  });

/**
 * Закрыть текущую карточку («×», Escape): выбор снимается; закреплённая остаётся вкладкой. Прежде «×» открывал
 * следующую из стопки — стопки больше нет (решение 91).
 */
export function closeCurrent() {
  batch(() => {
    cardFolded.value = false;
    selected.value = null;
  });
}

/**
 * Выбрать лицо по записи истории (src/ui/address.ts; решение 50): «назад» и «вперёд» переключают только текущую
 * карточку, вкладки не меняются; null — карточка закрыта.
 */
export function selectFromHistory(id: string | null) {
  batch(() => {
    if (id) cardFolded.value = false;
    selected.value = id;
  });
}

/**
 * Уточнение во вкладке (VIS-48, CARD-52): не обрезается посреди слова — целыми словами не длиннее max знаков
 * с многоточием; первое слово длиннее max — уточнения нет (null).
 */
export function clipWords(s: string, max: number): string | null {
  if (s.length <= max) return s;
  const words = s.split(' ');
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length + 1 > max) break;
    out = next;
  }
  if (!out) return null;
  return `${out.replace(/[,;:.\s—–-]+$/, '')}…`;
}

/** Уточнение во вкладке — целыми словами, не длиннее 80 знаков (VIS-48); сколько войдёт в строку, решает лист (FitWords). */
export const TAB_DIS = 80;

/**
 * Надпись вкладки: имя целиком и уточнение целыми словами (VIS-71: имя не режется); full — для диктора и подсказки,
 * без сокращения. Безымянное лицо с описательным именем («Жена Лота») уточнения обычно не имеет.
 */
export function tabLabel(id: string): { name: string; dis: string | null; full: string } {
  const p = byId.get(id);
  if (!p) return { name: id, dis: null, full: id };
  const dis = p.disambig ? clipWords(p.disambig, TAB_DIS) : null;
  return { name: p.name, dis, full: p.disambig ? `${p.name}, ${p.disambig}` : p.name };
}
