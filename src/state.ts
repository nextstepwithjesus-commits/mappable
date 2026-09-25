/** Состояние приложения (сигналы). Адрес страницы отражает выбранное лицо, окно и режимы. */
import { signal, computed, effect } from '@preact/signals';
import { models, byId, loadModel } from './data/atlas.ts';

export type Theme = 'night' | 'day';
export type Panel = null | 'epochs' | 'index' | 'kinship' | 'synopsis' | 'legend' | 'about' | 'section' | 'chapter' | 'spread';

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
const viewerTheme = (): Theme => {
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
export const hovered = signal<string | null>(null);
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
  document.documentElement.dataset.map = theme.value;
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
