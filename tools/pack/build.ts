/**
 * Сборка пакетов по инструментам (09 § 5.1–5.4; 02 § 8; этап 0 плана 10, п. 2).
 *
 *   npx tsx tools/pack/build.ts                    уровень «выпуск» → dist-pack/
 *   npx tsx tools/pack/build.ts --probe            уровень «проба» (и черновики, с плашкой) → dist-pack-probe/
 *   npx tsx tools/pack/build.ts --probe --tsk      и параллельные места TSK по книгам (только проба: блок закрыт до Д-12)
 *   --compression gzip                             бюджет по gzip (строже); по умолчанию brotli, как статическое хранилище
 *   --release 2026.10.2                            номер выпуска в описи
 *   --out <папка>                                  другая папка (тест детерминизма); проба в папку выпуска — ошибка
 *
 * Источник — допущенные записи base/ (одна функция допуска `tools/base/admit.ts`) и текст `tools/bible/`. Перед сборкой база
 * проверяется (validate.ts): с ошибками сборка не идёт. Выход с ошибкой: бюджет, строка не в NFC, права (NOTICE).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBase, validate } from '../base/validate.ts';
import { admission, type Level } from '../base/admit.ts';
import { baseFingerprint } from '../base/bundle.ts';
import { noticeEntries, noticeText } from '../base/sources.ts';
import { releaseOk } from '../base/release.ts';
import { BOOKS, bookNo } from '../../core/books.ts';
import type { Compression } from '../../core/types.ts';
import { compressed, nonNfc, sha256 } from './json.ts';
import { BUDGETS } from './budgets.ts';
import { buildCardVolumes, buildIndexes, buildStems, buildTexts, buildTsk, textWords } from './packages.ts';
import { sizeTable, writePacks, type PackOut, type WriteResult } from './write.ts';
import { canonical } from './json.ts';

export const ROOT = join(import.meta.dirname, '..', '..');
export const PACK_DIR = { release: join(ROOT, 'dist-pack'), probe: join(ROOT, 'dist-pack-probe'), synth: join(ROOT, 'dist-pack-synth') } as const;

/** Целые файлы, отпечатки которых идут в опись (09 § 5.4). */
export const INPUT_FILES = ['tools/bible/synodal.tsv', 'tools/bible/brackets.tsv', 'tools/bible/source-issues.tsv', 'base/sources.json', 'base/checks.json', 'tools/bible/tsk.tsv'];

export function inputDigests(): Record<string, string | null> {
  return Object.fromEntries(INPUT_FILES.map((f) => [f, existsSync(join(ROOT, f)) ? sha256(readFileSync(join(ROOT, f))) : null]));
}

/** Папка сборки: проба не пишется в папку выпуска и синтетики, выпуск — в папку пробы и синтетики. */
export function assertDir(kind: 'release' | 'probe' | 'synth', dir: string): void {
  for (const [k, d] of Object.entries(PACK_DIR)) if (k !== kind && resolve(dir) === resolve(d)) throw new Error(`сборка «${kind}» в папку «${k}» (${relative(ROOT, dir)}) — ошибка`);
}

export interface BuildOptions {
  level: Level;
  dir?: string;
  tsk?: boolean;
  compression?: Compression;
  release?: string | null;
}

export function build(o: BuildOptions): WriteResult {
  const dir = o.dir ?? PACK_DIR[o.level];
  assertDir(o.level, dir);
  const compression = o.compression ?? 'br';
  const base = loadBase();
  const errors = validate(base).filter((i) => i.level === 'error');
  if (errors.length) throw new Error(`проверка базы: ошибок ${errors.length} — сборка остановлена`);
  // NFC: все строки базы (рецензия данных на 09, № 16)
  const baseNfc = nonNfc(base, 10);
  if (baseNfc.length) throw new Error(`строки базы не в NFC:\n  ${baseNfc.join('\n  ')}`);
  const A = admission(base, o.level);
  const words = textWords();
  const packs: PackOut[] = [];
  const { core, tools, genealogy } = buildIndexes(base, A, words);
  packs.push({ kind: 'core-index', name: 'core-index', data: core });
  packs.push({ kind: 'tools-index', name: 'tools-index', data: tools });
  packs.push({ kind: 'genealogy', name: 'genealogy', data: genealogy });
  for (const [volume, v] of buildCardVolumes(base, A)) packs.push({ kind: 'cards', name: `cards/${volume}`, data: v, volume });
  const slug = new Map(BOOKS.map((b) => [b.code, b.slug]));
  for (const [book, t] of buildTexts(A)) packs.push({ kind: 'text', name: `text/${String(bookNo(book)).padStart(2, '0')}-${slug.get(book)}`, data: t, book });
  packs.push({ kind: 'stems', name: 'stems', data: buildStems(A, words.words) });
  if (o.tsk) {
    const max = BUDGETS.tsk.max;
    // часть должна войти и тем сжатием, что хранилище, и по gzip (верхняя граница): Пс — две части (02 § 8.1)
    const fits = (rows: unknown) => {
      const s = canonical({ rows });
      return compressed(s, compression) <= max && compressed(s, 'gzip') <= max;
    };
    for (const t of buildTsk(A, readFileSync(join(ROOT, 'tools/bible/tsk.tsv'), 'utf8'), fits))
      packs.push({ kind: 'tsk', name: `tsk/${String(bookNo(t.book)).padStart(2, '0')}-${slug.get(t.book)}-${t.part}`, data: t, book: t.book, part: t.part });
  }
  const notice = noticeEntries(base, A);
  if (o.tsk) {
    // TSK — не запись базы, а таблица tools/bible/tsk.tsv: источник идёт в NOTICE по реестру
    const t = (base.sources ?? []).find((x) => x.id === 'src-tsk');
    if (!t) throw new Error('в реестре нет src-tsk');
    notice.push({ id: t.id, title: t.title, who: [t.author, t.org].filter(Boolean).join('; '), version: t.version, spdx: t.spdx, licenseSource: t.licenseSource, why: 'параллельные места (справочно, 02 § 3.16)' });
  }
  const c = A.counts.all;
  return writePacks(packs, {
    dir,
    admit: o.level,
    compression,
    release: o.release ?? null,
    inputs: { base: baseFingerprint(), files: inputDigests() },
    statuses: { checked: c.checked, draft: c.draft, quarantine: c.quarantine, stale: c.stale, rights: c.rights, admitted: c.admitted },
    sources: notice.map((e) => ({ id: e.id, spdx: e.spdx, version: e.version, ...(e.attribution && { attribution: e.attribution }) })),
    extra: [{ name: 'NOTICE.txt', text: noticeText(notice, o.level) }],
  });
}

/** Отчёт сборки и код выхода: бюджет по сжатию хранилища и NFC — ошибки; gzip сверх бюджета — замечание. */
export function report(r: WriteResult, label: string): number {
  const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;
  console.log(`${label}: пакетов ${r.manifest.packages.length}, сжатие бюджета — ${r.manifest.compression}${r.manifest.banner ? `  [${r.manifest.banner}]` : ''}`);
  console.log(sizeTable(r.manifest));
  for (const p of r.gzipOver) if (!r.over.includes(p)) console.warn(`замечание: ${p.file} — gzip ${kb(p.gzip)} больше бюджета ${kb(p.budget)} (верхняя граница; хранилище ${kb(p.size)})`);
  for (const p of r.over) console.error(`!! бюджет: ${p.file} — ${kb(p.size)} (${r.manifest.compression}) при бюджете ${kb(p.budget)}`);
  for (const x of r.nfc) console.error(`!! не NFC: ${x}`);
  return r.over.length || r.nfc.length ? 1 : 0;
}

function main() {
  const argv = process.argv.slice(2);
  const val = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const level: Level = argv.includes('--probe') ? 'probe' : 'release';
  const release = val('--release') ?? null;
  if (release !== null && !releaseOk(release)) {
    console.error(`!! номер выпуска «${release}» — нужен вид 2026.10.2`);
    process.exit(1);
  }
  const compression = (val('--compression') ?? 'br') as Compression;
  if (compression !== 'br' && compression !== 'gzip') {
    console.error('!! --compression: br или gzip');
    process.exit(1);
  }
  const out = val('--out');
  try {
    const r = build({ level, ...(out && { dir: resolve(out) }), tsk: argv.includes('--tsk'), compression, release });
    process.exit(report(r, `сборка «${level === 'probe' ? 'проба' : 'выпуск'}» → ${relative(ROOT, out ? resolve(out) : PACK_DIR[level])}/`));
  } catch (e) {
    console.error(`!! ${(e as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
