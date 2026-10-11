// Чтение токены.json (W3C Design Tokens 2025.10): ссылки, режимы, формула контраста WCAG 2.x.
// ПРОТОТИП листа-образца (08 § 10.1): в продукт не переносится.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ПАПКА = dirname(fileURLToPath(import.meta.url));
export const загрузить = () => JSON.parse(readFileSync(join(ПАПКА, 'токены.json'), 'utf8'));

/** Все токены плоско: путь «цвет.чернила» → объект токена. */
export function плоско(док, путь = [], out = {}) {
  for (const [k, v] of Object.entries(док)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object' && '$value' in v) out[[...путь, k].join('.')] = v;
    else if (v && typeof v === 'object') плоско(v, [...путь, k], out);
  }
  return out;
}

/**
 * Значение токена в режиме. Режим — список ключей по порядку силы, например ['тёмная'] или ['бирюза', 'тёмная'].
 * Режим «a·b» в токене выигрывает у «a» и «b» по отдельности.
 */
export function разрешить(все, путь, режим = []) {
  const т = все[путь];
  if (!т) throw new Error(`нет токена ${путь}`);
  const м = т.$extensions?.['app.режимы'] ?? {};
  let v = т.$value;
  const ключи = Object.keys(м);
  // сначала одиночные режимы, затем составные — составной сильнее
  for (const r of режим) if (м[r] !== undefined) v = м[r];
  for (const k of ключи) if (k.includes('·') && k.split('·').every((x) => режим.includes(x))) v = м[k];
  if (typeof v === 'string' && /^\{.+\}$/.test(v)) return разрешить(все, v.slice(1, -1), режим);
  return v;
}

export const hex = (v) => (typeof v === 'string' ? v : v.hex);

function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function яркость(h) {
  const n = h.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function контраст(a, b) {
  const [x, y] = [яркость(a), яркость(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Латинская запись имени переменной — одна на приложение (08 § 3.1). */
const ТАБЛИЦА = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const латиница = (s) => s.toLowerCase().split('').map((ch) => (ch in ТАБЛИЦА ? ТАБЛИЦА[ch] : ch)).join('');
export const имяПеременной = (путь) => '--' + латиница(путь.replace(/\./g, '-')).replace(/[^a-z0-9-]/g, '-');
