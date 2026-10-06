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
import { byId } from '../data/atlas.ts';
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

const tellNews = (text: string) => (historyNews.value = { text, n: (historyNews.peek()?.n ?? 0) + 1 });
/** Имена списком: до пяти, дальше — «и ещё N». */
const names = (ids: string[]) => {
  const ns = ids.map((x) => byId.get(x)?.name ?? x);
  return ns.length <= 5 ? ns.join(', ') : `${ns.slice(0, 5).join(', ')} и ещё ${ns.length - 5}`;
};
/** Что изменилось на карте между снимками — словами для диктора (рецензия этапа 21: «Шаг отменён» не называл, что вернулось). */
function diffText(a: Snap, b: Snap): string {
  const was = new Set(a.set.map(([id]) => id));
  const now = new Set(b.set.map(([id]) => id));
  const back = [...now].filter((x) => !was.has(x));
  const gone = [...was].filter((x) => !now.has(x));
  const out: string[] = [];
  if (back.length) out.push(`на карту вернулись ${names(back)}`);
  if (gone.length) out.push(`с карты ушли ${names(gone)}`);
  if (!out.length && a.show !== b.show) out.push(b.show === 'a' ? 'на небе снова все лица' : 'небо сменило показ');
  return out.join('; ');
}

/** Отменить последний шаг карты. Возвращает, было ли что отменять (пустой журнал — диктор говорит «отменять нечего»). */
export function undo(): boolean {
  // незаписанное изменение (в этой же задаче) — сначала в журнал
  if (queued) commit();
  const prev = past.pop();
  if (!prev || !current) {
    tellNews('Отменять нечего');
    return false;
  }
  const d = diffText(current, prev);
  future.push(current);
  apply(prev);
  tellNews(`Шаг отменён${d ? `: ${d}` : ''}`);
  return true;
}

/** Вернуть отменённый шаг. */
export function redo(): boolean {
  if (queued) commit();
  const next = future.pop();
  if (!next || !current) {
    tellNews('Возвращать нечего');
    return false;
  }
  const d = diffText(current, next);
  past.push(current);
  apply(next);
  tellNews(`Шаг возвращён${d ? `: ${d}` : ''}`);
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
  if (typeof HTMLElement !== 'undefined' && t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select'))) return false;
  // клавиша обработана и при пустом журнале: диктор говорит «отменять нечего»
  if (e.code === 'KeyZ') {
    if (e.shiftKey) redo();
    else undo();
    return true;
  }
  if (e.code === 'KeyY' && !e.shiftKey) {
    redo();
    return true;
  }
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
