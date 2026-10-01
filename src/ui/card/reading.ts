/**
 * Чтение не теряется (этап 14, решение 150; U3; пересматривает D5 и IX-09).
 *
 * Снятие выбора — Escape, щелчок по пустому небу, «назад» к записи без лица — гасит подсветку неба, а подробная карточка
 * не исчезает: она сворачивается во вкладку с именем (корешок справа, на телефоне — строка над полосой времени,
 * src/ui/Folio.tsx). Щелчок по вкладке возвращает лицо и его карточку; закрывает вкладку только «×».
 *
 * Явное закрытие — «×» карточки, взмах листа вниз, свёртка закреплённой вкладки — идёт через closeCard: тогда вкладки нет.
 * Закреплённой карточке (решение 91) отдельная вкладка не нужна — у неё уже есть своя.
 */
import { effect, signal } from '@preact/signals';
import { byId } from '../../data/atlas.ts';
import { selected } from '../../state.ts';
import { cardTabs } from '../stack.ts';

/** Лицо свёрнутой при снятии выбора карточки; null — такой вкладки нет. */
export const readingTab = signal<string | null>(null);

let closing = false;

/** Выполнить fn как явное закрытие карточки («×»): снятие выбора в нём не сворачивает карточку во вкладку. */
export function closeCard(fn: () => void) {
  closing = true;
  try {
    fn();
  } finally {
    closing = false;
  }
}

/** Закрыть свёрнутую вкладку («×»). */
export function dropReading() {
  readingTab.value = null;
}

/**
 * Что станет с вкладкой чтения при смене выбора prev → cur: новое лицо — вкладки нет (его карточка открыта); снятие
 * выбора — вкладка прежнего лица, если закрытие не явное и карточка не закреплена. Чистая функция.
 */
export function readingAfter(prev: string | null, cur: string | null, o: { closing: boolean; pinned: (id: string) => boolean; tab: string | null }): string | null {
  if (cur) return null;
  if (!prev) return o.tab;
  if (o.closing || o.pinned(prev) || !byId.has(prev)) return null;
  return prev;
}

if (typeof window !== 'undefined') {
  let was = selected.peek();
  effect(() => {
    const cur = selected.value;
    const prev = was;
    was = cur;
    if (prev === cur) return;
    const next = readingAfter(prev, cur, { closing, pinned: (id) => cardTabs.peek().some((t) => t.id === id), tab: readingTab.peek() });
    if (next !== readingTab.peek()) readingTab.value = next;
  });
}
