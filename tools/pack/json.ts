/**
 * Канонический JSON пакетов (09 § 5.1): ключи по порядку, без времени; две сборки подряд дают одни байты. Строки — в NFC
 * (рецензия данных на 09, № 16): строка не в NFC — ошибка сборки, а не тихая порча поиска.
 */
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Compression } from '../../core/types.ts';

/** JSON с ключами объектов по порядку (свое правило с сортировкой ключей — 09 § 5.1). Порядок массивов не трогается. */
export function canonical(x: unknown): string {
  return JSON.stringify(sortKeys(x));
}

function sortKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) if (o[k] !== undefined) out[k] = sortKeys(o[k]);
    return out;
  }
  return x;
}

/** Строки не в NFC: путь и строка (первые `limit`). */
export function nonNfc(x: unknown, limit = 20, path = '$', out: string[] = []): string[] {
  if (out.length >= limit) return out;
  if (typeof x === 'string') {
    if (x !== x.normalize('NFC')) out.push(`${path}: «${x.slice(0, 40)}»`);
  } else if (Array.isArray(x)) {
    x.forEach((v, i) => nonNfc(v, limit, `${path}[${i}]`, out));
  } else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (k !== k.normalize('NFC')) out.push(`${path}: ключ «${k}»`);
      nonNfc(v, limit, `${path}.${k}`, out);
    }
  }
  return out;
}

export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

/** Размер тем сжатием, которым считается бюджет: brotli 11 (как статическое хранилище), gzip 9 — верхняя граница. */
export function compressed(s: string, how: Compression): number {
  const b = Buffer.from(s);
  return how === 'br'
    ? brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: b.length } }).length
    : gzipSync(b, { level: 9 }).length;
}
