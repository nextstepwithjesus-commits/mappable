/**
 * Журнал шагов карты (этап 21, решение 199): «Отменить шаг» и «Вернуть» — Ctrl+Z и Ctrl+Shift+Z (Ctrl+Y; на Mac — ⌘), по
 * физическим клавишам, и командами строки показа. Шаг — любое изменение карты: набор, раскрытые союзы, ромбы, показ неба,
 * свёрнутые потомки и созвездия всего неба. Выбор лица, камера и панели в журнал не входят — это не карта.
 *
 * Изменения одного действия (шаг вперёд пишет набор, союзы, ромбы и показ) склеиваются в один шаг: запись — в конце
 * текущей задачи (microtask). Журнал живёт в сеансе страницы и не длиннее LIMIT шагов; новый шаг после отмены стирает
 * то, что можно было вернуть. Применение снимка само в журнал не пишется.
 */
import { batch, effect, signal } from '@preact/signals';
import { expanded, opened } from './reveal.ts';
import { foldDesc, foldGroups, parseShow, setShowState, show, showKey, showLinksField, workSet, type WorkEntry } from './work.ts';

/** Снимок карты. */
interface Snap {
  set: [string, WorkEntry][];
  expanded: Record<string, string>;
  opened: string[];
  show: string;
  showX: string | null;
  desc: string[];
  groups: string[];
  /** ключ сравнения: два снимка с одним ключом — одна и та же карта */
  key: string;
}

export const HISTORY_LIMIT = 100;
const past: Snap[] = [];
const future: Snap[] = [];
let current: Snap | null = null;
let applying = false;
let queued = false;

/** Есть ли что отменить и что вернуть — для команд строки показа. */
export const canUndo = signal(false);
export const canRedo = signal(false);
/** Последняя отмена или возврат — для диктора: «Шаг отменён», «Шаг возвращён». */
export const historyNews = signal<{ text: string; n: number } | null>(null);

function snap(): Snap {
  const s = show.peek();
  const out = {
    set: [...workSet.peek()],
    expanded: { ...expanded.peek() },
    opened: [...opened.peek()],
    show: showKey(s),
    showX: showLinksField(s),
    desc: [...foldDesc.peek()],
    groups: [...foldGroups.peek()],
  };
  return { ...out, key: JSON.stringify(out) };
}
const flags = () => {
  canUndo.value = past.length > 0;
  canRedo.value = future.length > 0;
};

/** Записать изменение карты (в конце задачи: изменения одного действия — один шаг). */
function commit() {
  queued = false;
  if (applying) return;
  const s = snap();
  if (!current) {
    current = s;
    return;
  }
  if (s.key === current.key) return;
  past.push(current);
  if (past.length > HISTORY_LIMIT) past.shift();
  future.length = 0;
  current = s;
  flags();
}

/** Подписка на карту: каждое изменение — в журнал. Вызывает приложение один раз (src/ui/App.tsx). */
export function startHistory() {
  if (current) return;
  current = snap();
  effect(() => {
    void workSet.value;
    void expanded.value;
    void opened.value;
    void show.value;
    void foldDesc.value;
    void foldGroups.value;
    if (applying || queued) return;
    queued = true;
    queueMicrotask(commit);
  });
}

function apply(s: Snap) {
  applying = true;
  try {
    batch(() => {
      workSet.value = new Map(s.set);
      expanded.value = { ...s.expanded };
      opened.value = [...s.opened];
      foldDesc.value = [...s.desc];
      foldGroups.value = [...s.groups];
      const sh = parseShow(s.show, s.showX);
      if (sh) setShowState(sh, { history: 'replace' });
    });
  } finally {
    applying = false;
  }
  current = s;
  flags();
}

/** Отменить последний шаг карты. Возвращает, было ли что отменять. */
export function undo(): boolean {
  // незаписанное изменение (в этой же задаче) — сначала в журнал
  if (queued) commit();
  const prev = past.pop();
  if (!prev || !current) return false;
  future.push(current);
  apply(prev);
  historyNews.value = { text: 'Шаг отменён', n: (historyNews.peek()?.n ?? 0) + 1 };
  return true;
}

/** Вернуть отменённый шаг. */
export function redo(): boolean {
  if (queued) commit();
  const next = future.pop();
  if (!next || !current) return false;
  past.push(current);
  apply(next);
  historyNews.value = { text: 'Шаг возвращён', n: (historyNews.peek()?.n ?? 0) + 1 };
  return true;
}

/**
 * Клавиши журнала: Ctrl+Z (⌘Z) — отменить, Ctrl+Shift+Z и Ctrl+Y (⌘⇧Z) — вернуть; по физическим клавишам (KeyZ, KeyY),
 * и на русской раскладке. В полях ввода — их собственная отмена. Возвращает true, если клавиша обработана.
 */
export function historyKeys(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return false;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select'))) return false;
  if (e.code === 'KeyZ') return e.shiftKey ? redo() : undo();
  if (e.code === 'KeyY' && !e.shiftKey) return redo();
  return false;
}

/** Для тестов: журнал с чистого листа от нынешней карты. */
export function resetHistory() {
  past.length = 0;
  future.length = 0;
  current = snap();
  queued = false;
  flags();
}
