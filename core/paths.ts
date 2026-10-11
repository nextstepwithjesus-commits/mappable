/**
 * Адреса экранов (09 § 4.4.1 — одна таблица адресов) и уровень перехода (09 § 4.4.2; 08 § 6.5). Уровень считает ядро,
 * а не экран: экран зовёт `go(новое состояние)`, ядро сравнивает адреса. Сам маршрутизатор (History API, снимки, фокус) —
 * служба интерфейса (слой 5), здесь его нет. Ядро без DOM.
 */
import { BOOKS, BOOK_BY_CODE } from './books.ts';

export type ScreenKey =
  | 'glavnaya' | 'kniga' | 'glava' | 'istoriya' | 'kartochka'
  | 'genealogiya' | 'vremya' | 'geografiya' | 'svyazi' | 'poisk' | 'nastroyki';

export interface Route {
  screen: ScreenKey;
  /** Номер предмета экрана: история, Карточка. */
  id?: string;
  /** Код книги («Быт») для книги и главы. */
  book?: string;
  chapter?: number;
  /** Якорь без «#»: `st9`, `chast-2`, `razdel-10`. */
  hash?: string;
  /** Параметры в порядке адреса. */
  params: [string, string][];
}

/** Уровни параметров (имя — уровень) по экранам; `list` — 2 у всех инструментов (П-Т5). */
const LEVELS: Partial<Record<ScreenKey, Record<string, 1 | 2 | 3>>> = {
  genealogiya: { p: 1, show: 1, open: 3, sel: 2, list: 2 },
  // у Времени `p` — список лиц: смена первого лица — 1, лицо сравнения — 3 (особый случай ниже)
  vremya: { p: 1, sel: 2, view: 3, e: 3, c: 3, w: 3, model: 3, list: 2 },
  geografiya: { show: 1, p: 1, stop: 2, e: 3, base: 3, book: 3, cand: 3, view: 3, list: 2 },
  svyazi: { p: 1, pair: 1, path: 1, via: 1, story: 1, sel: 2, f: 3, list: 2 },
  poisk: { q: 1 },
};
const TOOLS = new Set<ScreenKey>(['genealogiya', 'vremya', 'geografiya', 'svyazi']);
const SLUG_TO_BOOK = new Map(BOOKS.map((b) => [b.slug, b.code]));

/** Разбор пути вида `/kniga/byt/6?x=1#st9`. Неизвестный путь — null. */
export function parsePath(url: string): Route | null {
  const m = /^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(url);
  if (!m) return null;
  const parts = m[1].split('/').filter(Boolean).map(decodeURIComponent);
  const params: [string, string][] = (m[2] ?? '')
    .split('&')
    .filter(Boolean)
    .map((kv) => {
      const i = kv.indexOf('=');
      return (i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)]).map((x) => decodeURIComponent(x.replace(/\+/g, ' '))) as [string, string];
    });
  const hash = m[3] ? decodeURIComponent(m[3]) : undefined;
  const r = (x: Omit<Route, 'params' | 'hash'>): Route => ({ ...x, params, ...(hash !== undefined && { hash }) });
  if (parts.length === 0) return r({ screen: 'glavnaya' });
  const [a, b, c] = parts;
  if (a === 'kniga' && b && SLUG_TO_BOOK.has(b)) {
    const book = SLUG_TO_BOOK.get(b);
    if (!book) return null;
    if (c === undefined && parts.length === 2) return r({ screen: 'kniga', book });
    if (c !== undefined && /^\d+$/.test(c) && parts.length === 3) return r({ screen: 'glava', book, chapter: Number(c) });
    return null;
  }
  if ((a === 'istoriya' || a === 'kartochka') && b && parts.length === 2) return r({ screen: a, id: b });
  if (parts.length === 1 && (TOOLS.has(a as ScreenKey) || a === 'poisk' || a === 'nastroyki')) return r({ screen: a as ScreenKey });
  return null;
}

/** Путь по состоянию — обратная функция к `parsePath` (тест «состояние → адрес → то же состояние»). */
export function buildPath(r: Route): string {
  let p: string;
  switch (r.screen) {
    case 'glavnaya': p = '/'; break;
    case 'kniga': p = `/kniga/${slugOf(r.book)}`; break;
    case 'glava': p = `/kniga/${slugOf(r.book)}/${r.chapter ?? 1}`; break;
    case 'istoriya':
    case 'kartochka': p = `/${r.screen}/${encodeURIComponent(r.id ?? '')}`; break;
    default: p = `/${r.screen}`;
  }
  // запятая списка номеров остаётся запятой: адрес читается и короче (тест длины адреса раскрытий, 09 § 4.4.1)
  const enc = (x: string) => encodeURIComponent(x).replace(/%2C/g, ',');
  const q = r.params.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  return p + (q ? `?${q}` : '') + (r.hash !== undefined ? `#${encodeURIComponent(r.hash)}` : '');
}

function slugOf(code: string | undefined): string {
  const b = code ? BOOK_BY_CODE.get(code) : undefined;
  if (!b) throw new Error(`нет книги «${code ?? ''}»`);
  return b.slug;
}

const get = (r: Route, k: string) => r.params.find(([x]) => x === k)?.[1];

/**
 * Уровень перехода (08 § 6.5; 09 § 4.4.2): другой экран или предмет — 1; изменились `sel`, `list`, `stop` (и прочие уровня 2) —
 * 2; остальное — 3. «Рядом» (`ryadom`, параметры соседа `r.…`) — 1. Номер выпуска `v` на уровень не влияет. Без изменений — 0.
 */
export function transitionLevel(a: Route, b: Route): 0 | 1 | 2 | 3 {
  if (a.screen !== b.screen || a.id !== b.id || a.book !== b.book || a.chapter !== b.chapter) return 1;
  const keys = new Set([...a.params.map(([k]) => k), ...b.params.map(([k]) => k)]);
  const table = LEVELS[b.screen] ?? {};
  let level: 0 | 1 | 2 | 3 = 0;
  const raise = (l: 1 | 2 | 3) => {
    if (level === 0 || l < level) level = l;
  };
  for (const k of keys) {
    if (k === 'v') continue;
    const x = get(a, k);
    const y = get(b, k);
    if (x === y) continue;
    if (k === 'ryadom' || k.startsWith('r.')) {
      raise(1);
      continue;
    }
    if (b.screen === 'vremya' && k === 'p') {
      // смена первого лица — 1; добавить или убрать лицо сравнения — 3
      const first = (s: string | undefined) => (s ?? '').split(',')[0];
      raise(first(x) !== first(y) ? 1 : 3);
      continue;
    }
    raise(table[k] ?? 3);
  }
  if (a.hash !== b.hash) raise(3);
  return level;
}
