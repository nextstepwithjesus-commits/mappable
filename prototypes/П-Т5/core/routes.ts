/**
 * Одна таблица адресов (09 § 4.4.1): пути — транслит русских слов, параметры с уровнем модели возврата 08 § 6.5.
 * Ядро без DOM: адрес → состояние → адрес. Уровень перехода считается по тому, какие параметры изменились.
 */

export type ScreenId =
  | 'glavnaya'
  | 'kniga'
  | 'glava'
  | 'istoriya'
  | 'kartochka'
  | 'genealogiya'
  | 'vremya'
  | 'geografiya'
  | 'svyazi'
  | 'poisk'
  | 'nastroyki';

/** Уровни 08 § 6.5: 1 экран, 2 выбор и лист, 3 вид (4 поверх и 5 настройка в адрес не пишутся). */
export type Level = 1 | 2 | 3;

export interface Route {
  screen: ScreenId;
  /** Номер предмета пути: код книги, номер истории, номер карточки. */
  id?: string;
  /** Глава (ВП-45). */
  ch?: number;
  /** Якорь: «st9», «chast-2», «razdel-10». */
  hash?: string;
  /** Параметры в порядке таблицы. Списки — через запятую. */
  params: Record<string, string>;
}

type ParamSpec = { key: string; level: Level | 'first-1-rest-3' };

/** Параметры экранов по 09 § 4.4.1. Добавлены пробой (передать в 09): `list` — открытый лист (уровень 2); `sel` у Времени. */
export const PARAMS: Partial<Record<ScreenId, ParamSpec[]>> = {
  genealogiya: [
    { key: 'p', level: 1 },
    { key: 'show', level: 1 },
    { key: 'sel', level: 2 },
    { key: 'list', level: 2 },
    { key: 'open', level: 3 },
  ],
  vremya: [
    { key: 'p', level: 'first-1-rest-3' },
    { key: 'sel', level: 2 },
    { key: 'list', level: 2 },
    { key: 'view', level: 3 },
    { key: 'e', level: 3 },
    { key: 'c', level: 3 },
    { key: 'w', level: 3 },
    { key: 'model', level: 3 },
  ],
  geografiya: [
    { key: 'show', level: 1 },
    { key: 'p', level: 1 },
    { key: 'stop', level: 2 },
    { key: 'list', level: 2 },
    { key: 'e', level: 3 },
    { key: 'base', level: 3 },
    { key: 'book', level: 3 },
    { key: 'cand', level: 3 },
    { key: 'view', level: 3 },
  ],
  svyazi: [
    { key: 'p', level: 1 },
    { key: 'pair', level: 1 },
    { key: 'path', level: 1 },
    { key: 'via', level: 1 },
    { key: 'story', level: 1 },
    { key: 'sel', level: 2 },
    { key: 'list', level: 2 },
    { key: 'f', level: 3 },
  ],
  poisk: [{ key: 'q', level: 1 }],
};

/** Параметры, общие для инструментов: сосед «рядом» (уровень 1) и номер выпуска данных (только в ссылке на вид). */
export const RYADOM = 'ryadom';
export const VERSION = 'v';
const TOOLS: ScreenId[] = ['genealogiya', 'vremya', 'geografiya', 'svyazi'];
export const isTool = (s: ScreenId) => TOOLS.includes(s);

const PATH: Record<ScreenId, string> = {
  glavnaya: '',
  kniga: 'kniga',
  glava: 'kniga',
  istoriya: 'istoriya',
  kartochka: 'kartochka',
  genealogiya: 'genealogiya',
  vremya: 'vremya',
  geografiya: 'geografiya',
  svyazi: 'svyazi',
  poisk: 'poisk',
  nastroyki: 'nastroyki',
};

const ID_RE = /^[a-z0-9-]+$/;

/** Разбор пути, строки параметров и якоря. Неизвестное — null (экран «Страница не найдена» — не в этой пробе). */
export function parseUrl(url: string, base = '/'): Route | null {
  const u = new URL(url, 'https://x.invalid');
  let path = decodeURIComponent(u.pathname);
  if (base !== '/' && path.startsWith(base)) path = '/' + path.slice(base.length);
  const seg = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  u.searchParams.forEach((v, k) => (params[k] = v));
  const hash = u.hash ? u.hash.slice(1) : undefined;
  const r = (screen: ScreenId, extra: Partial<Route> = {}): Route => ({ screen, params: pick(screen, params), ...(hash ? { hash } : {}), ...extra });
  if (seg.length === 0) return r('glavnaya');
  const [a, b, c] = seg;
  if (a === 'kniga' && b && ID_RE.test(b)) {
    if (c && /^\d+$/.test(c)) return r('glava', { id: b, ch: +c });
    if (!c) return r('kniga', { id: b });
    return null;
  }
  if ((a === 'istoriya' || a === 'kartochka') && b && ID_RE.test(b) && !c) return r(a, { id: b });
  for (const s of ['genealogiya', 'vremya', 'geografiya', 'svyazi', 'poisk', 'nastroyki'] as ScreenId[]) if (a === s && !b) return r(s);
  return null;
}

/** Оставляет только параметры экрана из таблицы (и «рядом» с приставкой `r.`, и номер выпуска). */
function pick(screen: ScreenId, all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PARAMS[screen] ?? []) if (all[p.key] !== undefined && all[p.key] !== '') out[p.key] = all[p.key];
  if (isTool(screen) && all[RYADOM] && TOOLS.includes(all[RYADOM] as ScreenId) && all[RYADOM] !== screen) {
    out[RYADOM] = all[RYADOM];
    for (const p of PARAMS[all[RYADOM] as ScreenId] ?? []) if (all[`r.${p.key}`]) out[`r.${p.key}`] = all[`r.${p.key}`];
  }
  if (all[VERSION]) out[VERSION] = all[VERSION];
  return out;
}

/** Состояние → адрес. Порядок параметров — порядок таблицы: одна ссылка на один вид. */
export function formatUrl(r: Route, opts: { base?: string; version?: boolean } = {}): string {
  const base = opts.base ?? '/';
  let path = PATH[r.screen];
  if (r.id) path += `/${r.id}`;
  if (r.ch !== undefined) path += `/${r.ch}`;
  const q = new URLSearchParams();
  for (const p of PARAMS[r.screen] ?? []) if (r.params[p.key]) q.set(p.key, r.params[p.key]);
  if (r.params[RYADOM]) {
    q.set(RYADOM, r.params[RYADOM]);
    for (const p of PARAMS[r.params[RYADOM] as ScreenId] ?? []) if (r.params[`r.${p.key}`]) q.set(`r.${p.key}`, r.params[`r.${p.key}`]);
  }
  if (opts.version && r.params[VERSION]) q.set(VERSION, r.params[VERSION]);
  const qs = q.toString().replace(/%2C/g, ',');
  return `${base}${path}${qs ? `?${qs}` : ''}${r.hash ? `#${r.hash}` : ''}`;
}

/** Уровень одного параметра при смене значения (у Времени смена первого лица — 1, добавить или убрать — 3). */
function paramLevel(screen: ScreenId, key: string, a: string | undefined, b: string | undefined): Level {
  if (key === RYADOM || key.startsWith('r.')) return key === RYADOM ? 1 : 3;
  const spec = (PARAMS[screen] ?? []).find((p) => p.key === key);
  if (!spec) return 3;
  if (spec.level === 'first-1-rest-3') return (a ?? '').split(',')[0] !== (b ?? '').split(',')[0] ? 1 : 3;
  return spec.level;
}

/** Уровень перехода от a к b: другой экран или предмет — 1; иначе наименьший уровень изменённых параметров. */
export function transitionLevel(a: Route, b: Route): Level | 0 {
  if (a.screen !== b.screen || a.id !== b.id || a.ch !== b.ch) return 1;
  let lvl: Level | 0 = 0;
  const keys = new Set([...Object.keys(a.params), ...Object.keys(b.params)]);
  keys.delete(VERSION);
  for (const k of keys) {
    if ((a.params[k] ?? '') === (b.params[k] ?? '')) continue;
    const l = paramLevel(a.screen, k, a.params[k], b.params[k]);
    lvl = lvl === 0 ? l : (Math.min(lvl, l) as Level);
  }
  if (lvl === 0 && (a.hash ?? '') !== (b.hash ?? '')) lvl = 3; // якорь части и раздела — шаг вида, не запись
  return lvl;
}

/** Параметры уровня ≤ n (для popstate внутри экрана: применяются только уровни 1–2, 09 § 4.4.2). */
export function paramsUpTo(r: Route, n: Level): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.params)) {
    if (k === VERSION) continue;
    const spec = (PARAMS[r.screen] ?? []).find((p) => p.key === k);
    const l: Level = k === RYADOM ? 1 : k.startsWith('r.') ? 3 : !spec ? 3 : spec.level === 'first-1-rest-3' ? 1 : spec.level;
    if (l <= n) out[k] = spec?.level === 'first-1-rest-3' && n < 3 ? v.split(',')[0] : v;
  }
  return out;
}

export function sameScreen(a: Route, b: Route): boolean {
  return a.screen === b.screen && a.id === b.id && a.ch === b.ch;
}

/** Переадресация номеров (base/redirects.json): один номер — переход; несколько — выбор; пусто — «Запись снята». */
export type Redirects = Record<string, string[]>;
export function applyRedirects(r: Route, red: Redirects): { route: Route; notes: string[]; choose?: { from: string; to: string[] } } {
  const notes: string[] = [];
  const map = (id: string) => (red[id] && red[id].length === 1 ? red[id][0] : id);
  let choose: { from: string; to: string[] } | undefined;
  const params = { ...r.params };
  for (const k of ['p', 'sel', 'r.p', 'r.sel']) {
    if (!params[k]) continue;
    const ids = params[k].split(',');
    params[k] = ids
      .map((id) => {
        if (!red[id]) return id;
        if (red[id].length === 1) notes.push(`Запись «${id}» теперь — «${red[id][0]}»`);
        else if (red[id].length > 1) choose = { from: id, to: red[id] };
        else notes.push(`Запись «${id}» снята`);
        return map(id);
      })
      .join(',');
  }
  let id = r.id;
  if (id && (r.screen === 'kartochka' || r.screen === 'istoriya') && red[id]) {
    if (red[id].length === 1) notes.push(`Запись «${id}» теперь — «${red[id][0]}»`);
    else if (red[id].length > 1) choose = { from: id, to: red[id] };
    else notes.push(`Запись «${id}» снята`);
    id = map(id);
  }
  return { route: { ...r, id, params }, notes, choose };
}

/** Уровень ключа без учёта значения: «смешанный» — p у Времени (первое лицо — 1, остальные — 3). */
export function keyLevel(screen: ScreenId, key: string): Level | 'mixed' {
  if (key === RYADOM) return 1;
  if (key.startsWith('r.') || key === VERSION) return 3;
  const spec = (PARAMS[screen] ?? []).find((p) => p.key === key);
  if (!spec) return 3;
  return spec.level === 'first-1-rest-3' ? 'mixed' : spec.level;
}
