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

/**
 * Закрыть карточку id, как вкладку (решение 18; IX-52, UX-49): она уходит из стопки; если она активная, активной
 * становится самая недавняя из оставшихся (next), а если других нет — карточка закрывается (next = null).
 * Чистая функция: stack — стопка, active — выбранное лицо.
 */
export function afterClose(stack: readonly string[], active: string | null, id: string): { stack: string[]; next: string | null } {
  const rest = stack.filter((x) => x !== id);
  if (active !== id) return { stack: rest, next: active };
  return { stack: rest, next: rest.find((x) => byId.has(x)) ?? null };
}

/**
 * Закрыть карточку id. open — как сделать активной следующую (выбрать лицо и, если его нет на экране, перелететь
 * к нему: src/ui/common.tsx, goTo); без open — просто выбрать. Возвращает лицо, чья карточка теперь активна.
 */
export function closeCard(id: string, open: (next: string) => void = (x) => (selected.value = x)): string | null {
  const { stack, next } = afterClose(cardStack.peek(), selected.peek(), id);
  const wasActive = selected.peek() === id;
  batch(() => {
    cardStack.value = stack;
    if (!wasActive) return;
    cardFolded.value = false;
    if (next) open(next);
    else selected.value = null;
  });
  return wasActive ? next : selected.peek();
}

/** Закрыть все карточки (строка «Закрыть все» в списке стопки): стопка пуста, выбор снят. */
export function closeAllCards() {
  batch(() => {
    cardStack.value = [];
    cardFolded.value = false;
    selected.value = null;
  });
}

/** Прежнее имя: убрать карточку из стопки (строка списка, «×» активной). */
export const dropCard = (id: string) => void closeCard(id);

/**
 * Строка стопки «Ещё открыты (N): …» (решение 18; CARD-52): N — сколько карточек кроме активной; имена — от недавних
 * к старым. Глагол согласован с «карточка»: «Ещё открыта (1): Руфь», «Ещё открыты (3): …».
 */
export function stackSummaryHead(n: number): string {
  return `Ещё ${n === 1 ? 'открыта' : 'открыты'} (${n}):`;
}

/**
 * Уточнение для строки стопки (VIS-48, CARD-52): не обрезается посреди слова — целыми словами не длиннее max знаков
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
