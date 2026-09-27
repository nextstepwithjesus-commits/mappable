/** Состояние приложения (сигналы). Адрес страницы отражает выбранное лицо, окно и режимы. */
import { signal, computed, effect, batch } from '@preact/signals';
import { models, byId, graph, loadModel } from './data/atlas.ts';
import { relate } from './engine/kinship.ts';

export type Theme = 'night' | 'day';
export type Panel = null | 'epochs' | 'index' | 'kinship' | 'synopsis' | 'legend' | 'about' | 'section' | 'chapter' | 'spread' | 'view';

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(`toledot:${k}`);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(`toledot:${k}`, JSON.stringify(v));
  } catch {
    /* хранилище недоступно — настройка просто не запомнится */
  }
};

/** Тема по умолчанию — как у читателя: явный выбор страницы-хозяина (data-theme), иначе настройка системы. */
const hasDom = typeof document !== 'undefined';
const viewerTheme = (): Theme => {
  if (!hasDom) return 'night'; // тесты движка и карточек идут без браузера
  const host = document.documentElement.dataset.theme;
  if (host === 'light') return 'day';
  if (host === 'dark') return 'night';
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
  } catch {
    return 'night';
  }
};
export const theme = signal<Theme>(load('theme', viewerTheme()));
export const modelId = signal<string>(load('model', 'mt-long'));
export const lambda = signal<number>(load('lambda', 1)); // 1 — масштаб по насыщенности, 0 — истинный
export const selected = signal<string | null>(null);
export const second = signal<string | null>(null); // второе лицо (родство, разворот)
/**
 * Первое лицо пары «Родства» или «Разворота». Запоминается, когда выбрано второе, и дальше не следует за выбором:
 * ссылки внутри этих панелей открывают карточку и ведут небо, но пару не меняют. Без второго лица не хранится.
 */
export const first = signal<string | null>(null);
export const hovered = signal<string | null>(null);
/** Звезда с фокусом клавиатуры (пункт скрытого списка лиц неба): небо рисует у неё кольцо и подпись. */
export const focused = signal<string | null>(null);
export const panel = signal<Panel>(null);
export const pickMode = signal<null | 'kinship' | 'spread'>(null);
export const onlyLines = signal(false);
export const epochMode = signal(false);
export const meridian = signal<number | null>(null); // год меридиана (астр.)
export const lineFlip = signal(false); // Лк 3 как второе родословие Иосифа
export const showSchema = signal(false); // показывать все 24 раздела
export const layers = signal<Record<string, boolean>>(
  load('layers', { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true }),
);
export const introDone = signal<boolean>(load('intro', false));
export const sectionFocus = signal<number | null>(null); // сквозной раздел
export const pins = signal<string[]>([]); // отмеченные на небе одноимённые

/** Путь родства пары для неба: лица от первого ко второму. Пишут выбор второго лица и панель «Родство». */
export const kinPath = { current: null as string[] | null };

/** Лица пути от первого лица до второго, по порядку шагов. */
export const pathOf = (steps: { from: string; to: string }[]): string[] => [...new Set(steps.flatMap((s) => [s.from, s.to]))];

/** Пара «первое — второе» для «Родства» и «Разворота»; для родства (withPath) сразу строится путь на небе. */
export function setPair(a: string, b: string, withPath: boolean) {
  batch(() => {
    first.value = a;
    second.value = b;
    if (withPath) {
      const rel = relate(graph, a, b, 1)[0];
      kinPath.current = rel ? pathOf(rel.steps) : null;
    }
  });
}

export function clearPair() {
  kinPath.current = null;
  batch(() => {
    second.value = null;
    first.value = null;
  });
}

/**
 * Лицо выбрано (на небе, в поиске, в скрытом списке) в режиме выбора второго лица: оно становится вторым,
 * первое остаётся, режим снимается и открывается панель режима. Возвращает false, если режима нет —
 * тогда лицо выбирается обычным порядком.
 */
export function pickSecond(id: string): boolean {
  const mode = pickMode.peek();
  const a = selected.peek();
  if (!mode || !a || id === a || !byId.has(id)) return false;
  batch(() => {
    setPair(a, id, mode === 'kinship');
    pickMode.value = null;
    panel.value = mode;
  });
  return true;
}

// Смена выбранного лица снимает режим выбора второго лица, а пару — если её панель закрыта: иначе после «Родства»
// небо показывало бы прежнюю цепочку у нового лица (MAP-19). Пока открыты «Родство» или «Разворот», пара остаётся:
// ссылки в них ведут по карточкам, не меняя пары.
let lastSelected = selected.peek();
effect(() => {
  const id = selected.value;
  if (id === lastSelected) return;
  lastSelected = id;
  const p = panel.peek();
  batch(() => {
    if (pickMode.peek()) pickMode.value = null;
    if (second.peek() && p !== 'kinship' && p !== 'spread') clearPair();
  });
});
// второе лицо сброшено (кнопкой «сбросить второе» или новым режимом выбора) — пары нет, пути тоже
effect(() => {
  if (second.value !== null) return;
  kinPath.current = null;
  if (first.peek() !== null) first.value = null;
});

const modelsLoaded = signal(0);
/** Текущая модель; пока выбранная подгружается, показывается модель по умолчанию. */
export const model = computed(() => {
  void modelsLoaded.value;
  return models.find((m) => m.id === modelId.value) ?? models[0];
});
effect(() => {
  const id = modelId.value;
  if (!models.some((m) => m.id === id)) loadModel(id).then(() => modelsLoaded.value++);
});

// запоминается только выбор читателя, не тема по умолчанию: иначе атлас перестал бы следовать за системой
let themeChosen = false;
effect(() => {
  if (hasDom) document.documentElement.dataset.map = theme.value;
  if (themeChosen) save('theme', theme.value);
  themeChosen = true;
});
effect(() => save('model', modelId.value));
effect(() => save('lambda', lambda.value));
effect(() => save('layers', layers.value));
effect(() => save('intro', introDone.value));

// ---------- адрес ----------
export function readHash(): { id: string | null; view: string | null; route: string } {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, query] = h.split('?');
  const params = new URLSearchParams(query ?? '');
  if (path === 'specimen') return { id: null, view: null, route: 'specimen' };
  return { id: path && byId.has(path) ? path : null, view: params.get('v'), route: 'atlas' };
}

let writing = false;
export function writeHash(id: string | null, view?: string) {
  const next = `#/${id ?? ''}${view ? `?v=${view}` : ''}`;
  if (location.hash === next) return;
  writing = true;
  history.pushState(null, '', next);
  writing = false;
}
export const isWritingHash = () => writing;
