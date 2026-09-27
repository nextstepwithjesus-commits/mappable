/**
 * Стопка карточек (J6; решение владельца 17): открытые карточки, последние до шести лиц, первым — самое недавнее;
 * активная — выбранное лицо; cardFolded — активная свёрнута. Помнится в сеансе (sessionStorage).
 * Вынесена из src/ui/work.ts, чтобы стопкой и рабочим набором могли заниматься разные исполнители.
 */
import { batch, effect, signal } from '@preact/signals';
import { byId } from '../data/atlas.ts';
import { selected } from '../state.ts';

const hasWindow = typeof window !== 'undefined';
function read<T>(key: string, d: T): T {
  if (!hasWindow) return d;
  try {
    const v = window.sessionStorage.getItem(`toledot:${key}`);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
function write(key: string, v: unknown) {
  if (!hasWindow) return;
  try {
    window.sessionStorage.setItem(`toledot:${key}`, JSON.stringify(v));
  } catch {
    /* хранилище недоступно — стопка просто не запомнится */
  }
}
const strings = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ok(x)) : []);

/** Сколько карточек держит стопка. */
export const STACK_MAX = 6;
const stack0 = read<{ ids?: unknown; folded?: unknown }>('stack', {});
/** Открытые карточки: последние до шести лиц, первым — самое недавнее (активное — выбранное лицо). */
export const cardStack = signal<string[]>(strings(stack0.ids, (x) => byId.has(x)).slice(0, STACK_MAX));
/** Активная карточка свёрнута до строки. */
export const cardFolded = signal<boolean>(stack0.folded === true);
if (hasWindow) effect(() => write('stack', { ids: cardStack.value, folded: cardFolded.value }));

/** Положить лицо наверх стопки (выбор лица делает его карточку активной). */
export function pushCard(id: string, stack = cardStack.peek()): string[] {
  return [id, ...stack.filter((x) => x !== id)].slice(0, STACK_MAX);
}
/** Убрать карточку из стопки; активная закрывается (выбор снимается). */
export function dropCard(id: string) {
  batch(() => {
    cardStack.value = cardStack.peek().filter((x) => x !== id);
    if (selected.peek() === id) {
      cardFolded.value = false;
      selected.value = null;
    }
  });
}
if (hasWindow) {
  let last = selected.peek();
  effect(() => {
    const id = selected.value;
    if (id === last) return;
    last = id;
    if (!id) return;
    batch(() => {
      cardStack.value = pushCard(id);
      cardFolded.value = false;
    });
  });
  // выбранное по адресу при загрузке — тоже наверху стопки
  const id0 = selected.peek();
  if (id0 && cardStack.peek()[0] !== id0) cardStack.value = pushCard(id0);
}
