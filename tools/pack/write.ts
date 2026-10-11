/**
 * Запись пакетов и описи (09 § 5.1, § 5.4): канонический JSON, имя файла с отпечатком содержимого, sha256, размеры тем
 * сжатием, что хранилище, и gzip, бюджет, признак «обязательный». Опись без времени и без коммита: две сборки подряд из той
 * же базы дают одни байты (тест детерминизма).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, compressed, nonNfc, sha256 } from './json.ts';
import { BUDGETS, overBudget } from './budgets.ts';
import { MANIFEST_SCHEMA, PROBE_BANNER, SYNTH_BANNER, type Admit, type Compression, type Manifest, type PackageEntry, type PackKind } from '../../core/types.ts';

export interface PackOut {
  kind: PackKind;
  /** Имя без отпечатка: `text/01-byt`. */
  name: string;
  data: unknown;
  book?: string;
  part?: number;
  volume?: string;
}

export interface WriteOptions {
  dir: string;
  admit: Admit;
  synthetic?: boolean;
  compression: Compression;
  release: string | null;
  inputs: Manifest['inputs'];
  statuses: Manifest['statuses'];
  sources: Manifest['sources'];
  extra?: { name: string; text: string }[];
}

export interface WriteResult {
  manifest: Manifest;
  over: PackageEntry[];
  nfc: string[];
}

export function writePacks(packs: PackOut[], o: WriteOptions): WriteResult {
  rmSync(o.dir, { recursive: true, force: true });
  mkdirSync(o.dir, { recursive: true });
  const entries: PackageEntry[] = [];
  const nfc: string[] = [];
  for (const p of packs) {
    for (const bad of nonNfc(p.data, 5)) nfc.push(`${p.name}: ${bad}`);
    const body = canonical(p.data);
    const hash = sha256(body);
    const file = `${p.name}.${hash.slice(0, 10)}.json`;
    mkdirSync(join(o.dir, file, '..'), { recursive: true });
    writeFileSync(join(o.dir, file), body);
    const b = BUDGETS[p.kind];
    entries.push({
      kind: p.kind, file, sha256: hash, raw: Buffer.byteLength(body), size: compressed(body, 'br'), gzip: compressed(body, 'gzip'),
      budget: b.max, required: b.required,
      ...(p.book && { book: p.book }), ...(p.part && { part: p.part }), ...(p.volume && { volume: p.volume }),
    });
  }
  for (const x of o.extra ?? []) writeFileSync(join(o.dir, x.name), x.text);
  const changes = entries.find((e) => e.kind === 'changes')?.file ?? null;
  const manifest: Manifest = {
    schema: MANIFEST_SCHEMA,
    release: o.release,
    admit: o.admit,
    ...(o.admit === 'probe' && { banner: o.synthetic ? SYNTH_BANNER : PROBE_BANNER }),
    ...(o.synthetic && { synthetic: true as const }),
    compression: o.compression,
    inputs: o.inputs,
    statuses: o.statuses,
    packages: entries,
    models: { chronology: null, places: null },
    sources: o.sources,
    changes,
  };
  writeFileSync(join(o.dir, 'manifest.json'), JSON.stringify(JSON.parse(canonical(manifest)), null, 1) + '\n');
  const { over } = overBudget(entries);
  return { manifest, over: over as PackageEntry[], nfc };
}

/** Таблица размеров для отчёта: по видам — число пакетов, наибольший, всего; в КБ. */
export function sizeTable(m: Manifest): string {
  const kb = (n: number) => (n / 1024).toFixed(1);
  const rows: string[] = [`| пакет | число | бюджет, КБ | наибольший (brotli 5), КБ | наибольший gzip 9, КБ | всего (brotli 5), КБ | всего gzip 9, КБ | обязательный |`, '|---|---|---|---|---|---|---|---|'];
  const kinds = [...new Set(m.packages.map((p) => p.kind))];
  for (const k of kinds) {
    const ps = m.packages.filter((p) => p.kind === k);
    const max = ps.reduce((a, p) => (p.size > a.size ? p : a));
    const maxG = ps.reduce((a, p) => (p.gzip > a.gzip ? p : a));
    const label = (p: PackageEntry) => (ps.length > 1 ? ` (${p.book ?? p.volume ?? p.file}${p.part ? ` ч. ${p.part}` : ''})` : '');
    rows.push(
      `| ${BUDGETS[k].name} | ${ps.length} | ${kb(BUDGETS[k].max)} | ${kb(max.size)}${label(max)} | ${kb(maxG.gzip)}${label(maxG)} | ${kb(ps.reduce((n, p) => n + p.size, 0))} | ${kb(ps.reduce((n, p) => n + p.gzip, 0))} | ${BUDGETS[k].required ? 'да' : 'нет'} |`,
    );
  }
  return rows.join('\n');
}
