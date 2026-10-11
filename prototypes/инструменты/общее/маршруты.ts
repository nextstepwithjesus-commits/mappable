/**
 * Таблица адресов прототипа (09 § 4.4.1; 11 § 3.5, § 4.11, § 10; 04 § 7.7): разбор, сборка и уровень перехода 08 § 6.5.
 * Основа — проба П-Т5 (`prototypes/П-Т5/core/routes.ts`); добавлены экраны пакета 1: «Все истории» (`/istorii`), набор
 * параллелей (`/paralleli/<набор>`), сравнение по выбору (`/sravnenie`), параметры каталога и страницы истории.
 * Служба интерфейса прототипа (09 § 10.1): в продукт не переносится. Без DOM.
 */
import { BOOKS } from '../../../core/books.ts';

export type ScreenId =
  | 'glavnaya' | 'kniga' | 'glava' | 'istoriya' | 'kartochka' | 'vremya'
  | 'istorii' | 'paralleli' | 'sravnenie' | 'poisk' | 'nastroyki' | 'genealogiya';

/** Уровни 08 § 6.5: 1 экран, 2 выбор и лист, 3 вид (4 поверх и 5 настройка в адрес не пишутся). */
export type Level = 1 | 2 | 3;

export interface Route {
  screen: ScreenId;
  /** Номер предмета: история `e-…`, Карточка `p-…`, набор параллелей. */
  id?: string;
  /** Код книги («Быт») у книги и главы. */
  book?: string;
  ch?: number;
  /** Якорь: `st9`, `chast-2`. */
  hash?: string;
  params: Record<string, string>;
}

type Spec = { key: string; level: Level | 'first-1-rest-3' };

/** Параметры по экранам. Добавлено прототипом (передать в 09 § 4.4.1): `rasskaz`, `view`, `ot` у истории — 11 § 10. */
export const PARAMS: Partial<Record<ScreenId, Spec[]>> = {
  kniga: [{ key: 'sort', level: 3 }, { key: 'f', level: 3 }, { key: 'open', level: 3 }],
  istoriya: [{ key: 'rasskaz', level: 3 }, { key: 'view', level: 3 }, { key: 'ot', level: 3 }],
  // 04 § 7.7: `p` — смена первого лица 1, добавить или убрать — 3; `z`, `at`, `grp`, `show`, `f`, `sort` — передано 04 в 09 (§ 20)
  vremya: [
    { key: 'p', level: 'first-1-rest-3' },
    { key: 'grp', level: 3 },
    { key: 'view', level: 3 },
    { key: 'show', level: 3 },
    { key: 'e', level: 3 },
    { key: 'z', level: 3 },
    { key: 'at', level: 3 },
    { key: 'sel', level: 2 },
    { key: 'list', level: 2 },
    { key: 'c', level: 3 },
    { key: 'w', level: 3 },
    { key: 'model', level: 3 },
    // книга порядка «Событий» (рецензия архитектуры № 5–6): из каталога книги и со страницы истории на рассказе этой книги
    { key: 'kniga', level: 3 },
  ],
  istorii: [{ key: 'f', level: 3 }],
  // 03 § 22.2 и шаг 2.0: `p` — лицо, `vhod` — вход § 2.3 (экран); `show` — вид, `read` — прочтения, `open` / `zakr` —
  // раскрытое сверх входа и свёрнутое из входа, `up` / `down` — поколения (вид); `sel` — выбор, `edge` — лист ребра (уровень 2)
  genealogiya: [
    { key: 'p', level: 1 },
    { key: 'vhod', level: 1 },
    { key: 'show', level: 3 },
    { key: 'read', level: 3 },
    { key: 'open', level: 3 },
    { key: 'zakr', level: 3 },
    { key: 'up', level: 3 },
    { key: 'down', level: 3 },
    { key: 'sel', level: 2 },
    { key: 'edge', level: 2 },
  ],
  sravnenie: [{ key: 'a', level: 1 }, { key: 'b', level: 1 }],
  poisk: [{ key: 'q', level: 1 }],
};
export const VERSION = 'v';

const SLUG = new Map(BOOKS.map((b) => [b.slug, b.code]));
const CODE = new Map(BOOKS.map((b) => [b.code, b.slug]));
export const bookSlug = (code: string) => CODE.get(code) ?? code;
const ID_RE = /^[a-z0-9-]+$/;

/** Разбор адреса относительно основы приложения. Неизвестное — null (экран «Такой страницы у нас нет»). */
export function parseUrl(url: string, base = '/'): Route | null {
  let u: URL;
  try {
    u = new URL(url, 'https://x.invalid');
  } catch {
    return null;
  }
  let path: string;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  const b = decodeURIComponent(base);
  if (b !== '/' && path.startsWith(b)) path = '/' + path.slice(b.length);
  const seg = path.split('/').filter(Boolean);
  const all: Record<string, string> = {};
  u.searchParams.forEach((v, k) => (all[k] = v));
  const hash = u.hash ? decodeURIComponent(u.hash.slice(1)) : undefined;
  const r = (screen: ScreenId, extra: Partial<Route> = {}): Route => ({ screen, params: pick(screen, all), ...(hash ? { hash } : {}), ...extra });
  if (seg.length === 0 || (seg.length === 1 && seg[0] === 'index.html')) return r('glavnaya');
  const [a, x, c] = seg;
  if (a === 'kniga' && x && SLUG.has(x)) {
    const book = SLUG.get(x);
    if (c && /^\d+$/.test(c) && seg.length === 3) return r('glava', { book, ch: +c });
    if (!c) return r('kniga', { book });
    return null;
  }
  if ((a === 'istoriya' || a === 'kartochka' || a === 'paralleli') && x && ID_RE.test(x) && seg.length === 2) return r(a, { id: x });
  for (const s of ['vremya', 'istorii', 'sravnenie', 'poisk', 'nastroyki', 'genealogiya'] as ScreenId[]) if (a === s && seg.length === 1) return r(s);
  return null;
}

function pick(screen: ScreenId, all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PARAMS[screen] ?? []) if (all[p.key] !== undefined && all[p.key] !== '') out[p.key] = all[p.key];
  if (all[VERSION]) out[VERSION] = all[VERSION];
  return out;
}

/** Состояние → адрес. Порядок параметров — порядок таблицы: одна ссылка на один вид. */
export function formatUrl(r: Route, opts: { base?: string; version?: boolean } = {}): string {
  const base = opts.base ?? '/';
  let path = '';
  if (r.screen === 'kniga' || r.screen === 'glava') path = `kniga/${bookSlug(r.book ?? '')}${r.ch ? `/${r.ch}` : ''}`;
  else if (r.screen === 'istoriya' || r.screen === 'kartochka' || r.screen === 'paralleli') path = `${r.screen}/${r.id ?? ''}`;
  else if (r.screen !== 'glavnaya') path = r.screen;
  const q = new URLSearchParams();
  for (const p of PARAMS[r.screen] ?? []) if (r.params[p.key]) q.set(p.key, r.params[p.key]);
  if (opts.version && r.params[VERSION]) q.set(VERSION, r.params[VERSION]);
  const qs = q.toString().replace(/%2C/g, ',');
  return `${base}${path}${qs ? `?${qs}` : ''}${r.hash ? `#${r.hash}` : ''}`;
}

function paramLevel(screen: ScreenId, key: string, a: string | undefined, b: string | undefined): Level {
  const spec = (PARAMS[screen] ?? []).find((p) => p.key === key);
  if (!spec) return 3;
  if (spec.level === 'first-1-rest-3') return (a ?? '').split(',')[0] !== (b ?? '').split(',')[0] ? 1 : 3;
  return spec.level;
}

/** Уровень перехода: другой экран или предмет — 1; иначе наименьший уровень изменённых параметров; якорь — 3. */
export function transitionLevel(a: Route, b: Route): Level | 0 {
  if (!sameScreen(a, b)) return 1;
  let lvl: Level | 0 = 0;
  const keys = new Set([...Object.keys(a.params), ...Object.keys(b.params)]);
  keys.delete(VERSION);
  for (const k of keys) {
    if ((a.params[k] ?? '') === (b.params[k] ?? '')) continue;
    const l = paramLevel(a.screen, k, a.params[k], b.params[k]);
    lvl = lvl === 0 ? l : (Math.min(lvl, l) as Level);
  }
  if (lvl === 0 && (a.hash ?? '') !== (b.hash ?? '')) lvl = 3;
  return lvl;
}

export function keyLevel(screen: ScreenId, key: string): Level | 'mixed' {
  if (key === VERSION) return 3;
  const spec = (PARAMS[screen] ?? []).find((p) => p.key === key);
  if (!spec) return 3;
  return spec.level === 'first-1-rest-3' ? 'mixed' : spec.level;
}

export function sameScreen(a: Route, b: Route): boolean {
  return a.screen === b.screen && a.id === b.id && a.book === b.book && a.ch === b.ch;
}
