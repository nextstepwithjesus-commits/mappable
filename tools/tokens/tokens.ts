/**
 * Чтение файла токенов (W3C Design Tokens 2025.10; 08 § 3.1): плоский список, ссылки `{…}`, режимы `app.режимы`,
 * латинская запись имени переменной (одна на приложение), контраст WCAG 2.x. Общее для сборки и тестов токенов.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const TOKENS_FILE = join(ROOT, 'tokens', 'токены.json');

export interface Token {
  $type: string;
  $value: unknown;
  $description?: string;
  $extensions?: { 'app.режимы'?: Record<string, unknown>; 'app.строка'?: unknown; [k: string]: unknown };
}
export type Doc = Record<string, unknown> & { $extensions?: { 'app.контраст'?: Record<string, unknown> } };

export const load = (file = TOKENS_FILE): Doc => JSON.parse(readFileSync(file, 'utf8')) as Doc;

const isTok = (v: unknown): v is Token => !!v && typeof v === 'object' && '$value' in v;

/** Все токены плоско: «цвет.чернила» → токен. */
export function flat(doc: Record<string, unknown>, path: string[] = [], out: Record<string, Token> = {}): Record<string, Token> {
  for (const [k, v] of Object.entries(doc)) {
    if (k.startsWith('$')) continue;
    if (isTok(v)) out[[...path, k].join('.')] = v;
    else if (v && typeof v === 'object') flat(v as Record<string, unknown>, [...path, k], out);
  }
  return out;
}

/** Режимы файла и как они ложатся на модификаторы resolver'а (09 § 3.6: тема × ввод × плотность; экран — телефон). */
export const MODES = ['тёмная', 'телефон', 'плотная', 'касание', 'касание·плотная', 'сенсорный'] as const;
export type Mode = (typeof MODES)[number];

const isRef = (v: unknown): v is string => typeof v === 'string' && /^\{.+\}$/.test(v);

/** Значение токена в режимах (одиночные по порядку, затем составные «a·b» — они сильнее); частичное значение типографики сливается с основным. */
export function rawIn(t: Token, modes: readonly string[]): unknown {
  const m = t.$extensions?.['app.режимы'] ?? {};
  let v: unknown = t.$value;
  const put = (x: unknown) => {
    v = x && typeof x === 'object' && !Array.isArray(x) && v && typeof v === 'object' && !Array.isArray(v) && t.$type === 'typography' ? { ...(v as object), ...(x as object) } : x;
  };
  for (const r of modes) if (m[r] !== undefined && !r.includes('·')) put(m[r]);
  for (const k of Object.keys(m)) if (k.includes('·') && k.split('·').every((x) => modes.includes(x))) put(m[k]);
  return v;
}

/** Значение со ссылками, раскрытыми до конца (ссылки и внутри типографики). */
export function resolve(all: Record<string, Token>, path: string, modes: readonly string[] = [], seen: string[] = []): unknown {
  const t = all[path];
  if (!t) throw new Error(`нет токена ${path}${seen.length ? ` (ссылка из ${seen.at(-1)})` : ''}`);
  if (seen.includes(path)) throw new Error(`петля ссылок: ${[...seen, path].join(' → ')}`);
  const deref = (v: unknown): unknown => {
    if (isRef(v)) return resolve(all, v.slice(1, -1), modes, [...seen, path]);
    if (v && typeof v === 'object' && !Array.isArray(v) && t.$type === 'typography') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deref(x)]));
    return v;
  };
  return deref(rawIn(t, modes));
}

export const hex = (v: unknown): string => (typeof v === 'string' ? v : (v as { hex: string }).hex);

function lin(c: number) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
export function luminance(h: string): number {
  const n = h.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Латинская запись имени переменной — одна на приложение (08 § 3.1). */
const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
export const latin = (s: string): string => s.toLowerCase().split('').map((ch) => (ch in TR ? TR[ch] : ch)).join('');
export const cssVar = (path: string): string => '--' + latin(path.replace(/\./g, '-')).replace(/[^a-z0-9-]/g, '-');

/** Нормы контраста (08 § 3.2): текст 4,5; графика 3 (WCAG 1.4.11); украшение 1. */
export const NORM: Record<string, number> = { текст: 4.5, графика: 3, украшение: 1 };

export interface ContrastRow { kind: string; f: string; b: string; theme: string; k: number; ok: boolean }

/** Все пары `app.контраст` в обеих темах (правила листа-образца: в тёмной кат-цвета — заливка к фону). */
export function contrastRows(doc: Doc): ContrastRow[] {
  const all = flat(doc);
  const pairs = doc.$extensions?.['app.контраст'] ?? {};
  const out: ContrastRow[] = [];
  for (const [kind, list] of Object.entries(pairs)) {
    if (kind.startsWith('$')) continue;
    for (const [f, b, note = ''] of list as string[][]) {
      for (const [theme, modes] of [['светлая', []], ['тёмная', ['тёмная']]] as [string, string[]][]) {
        if (note === 'только тёмная' && theme !== 'тёмная') continue;
        const bg = theme === 'тёмная' && f.startsWith('кат-') ? 'фон' : b;
        const k = contrast(hex(resolve(all, `цвет.${f}`, modes)), hex(resolve(all, `цвет.${bg}`, modes)));
        out.push({ kind, f, b: bg, theme, k: Math.round(k * 100) / 100, ok: k + 1e-9 >= NORM[kind] });
      }
    }
  }
  return out;
}
