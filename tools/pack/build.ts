/**
 * Сборка пакетов по инструментам (09 § 5.1–5.4; 02 § 8; этап 0 плана 10, п. 2).
 *
 *   npx tsx tools/pack/build.ts --release 2026.10.2 уровень «выпуск» → dist-pack/
 *   npx tsx tools/pack/build.ts --probe            уровень «проба» (и черновики, с плашкой) → dist-pack-probe/
 *   npx tsx tools/pack/build.ts --probe --tsk      и параллельные места TSK по книгам (только проба: блок закрыт до Д-12)
 *   --release 2026.10.2                            номер выпуска в описи (у «выпуска» обязателен)
 * Бюджет: каждый пакет входит и по brotli 5, и по gzip 9, пока хранилище не выбрано (рецензия данных на ядро, № 2).
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
import { noticeEntries, noticeText, type NoticeEntry } from '../base/sources.ts';
import { releaseOk } from '../base/release.ts';
import { BOOKS, bookNo } from '../../core/books.ts';
import { canonical, fitsBudget, nonNfc, sha256 } from './json.ts';
import { BUDGETS } from './budgets.ts';
import { buildCardVolumes, buildIndexes, buildStems, buildTexts, buildTsk, stamp, textWords } from './packages.ts';
import { sizeTable, writePacks, type PackOut, type WriteResult } from './write.ts';

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
  /** Номер выпуска `2026.10.2`: у уровня «выпуск» обязателен (09 § 5.4; рецензия данных, № 14). */
  release?: string | null;
}

const LICENSES = join(ROOT, 'tools', 'pack', 'licenses');

/**
 * NOTICE (09 § 5.5; рецензия данных, № 8): источники допущенных записей и источники пакетов, которые идут всегда — текст и
 * таблица основ (`src-synodal`), шрифты; TSK — если собран. В конце — полные тексты MIT (электронный текст scrollmapper) и
 * OFL 1.1 (шрифты): MIT требует прикладывать текст разрешения, OFL — текст лицензии.
 */
export function noticeFor(base: ReturnType<typeof loadBase>, A: ReturnType<typeof admission>, opts: { tsk?: boolean } = {}): { entries: NoticeEntry[]; text: string } {
  const entries = noticeEntries(base, A);
  const reg = new Map((base.sources ?? []).map((x) => [x.id, x]));
  const always = ['src-synodal', ...(opts.tsk ? ['src-tsk'] : [])];
  for (const id of always) {
    if (entries.some((e) => e.id === id)) continue;
    const t = reg.get(id);
    if (!t) throw new Error(`в реестре нет ${id}`);
    entries.push({
      id: t.id, title: t.title, who: [t.author, t.org].filter(Boolean).join('; '), version: t.version, spdx: t.spdx,
      ...(t.attribution && { attribution: t.attribution }), licenseSource: t.licenseSource,
      why: id === 'src-tsk' ? 'параллельные места (справочно, 02 § 3.16)' : 'текст по книгам и таблица основ — в каждой сборке',
    });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const full = [
    '',
    '=== Полный текст лицензии MIT (src-synodal: электронный текст scrollmapper/bible_databases) ===',
    '',
    readFileSync(join(LICENSES, 'MIT-scrollmapper.txt'), 'utf8'),
    '',
    '=== Полный текст SIL Open Font License 1.1 (шрифты: src-font-*) ===',
    '',
    readFileSync(join(LICENSES, 'OFL-1.1.txt'), 'utf8'),
  ].join('\n');
  return { entries, text: noticeText(entries, A.level) + full };
}

export function build(o: BuildOptions): WriteResult {
  const dir = o.dir ?? PACK_DIR[o.level];
  assertDir(o.level, dir);
  if (o.level === 'release' && !o.release) throw new Error('у сборки «выпуск» нужен номер выпуска: --release 2026.10.2 (09 § 5.4)');
  if (o.release && !releaseOk(o.release)) throw new Error(`номер выпуска «${o.release}» — нужен вид 2026.10.2`);
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
  // карточки: том больше бюджета делится; у лица в указателе — номер своей части
  const { volumes, volumeOf } = buildCardVolumes(base, A, (v) => fitsBudget(canonical(v), BUDGETS.cards.max));
  for (const a of tools.actors) a.v = volumeOf.get(a.id) ?? a.v;
  packs.push({ kind: 'core-index', name: 'core-index', data: core });
  packs.push({ kind: 'tools-index', name: 'tools-index', data: tools });
  packs.push({ kind: 'genealogy', name: 'genealogy', data: genealogy });
  for (const [volume, v] of volumes) packs.push({ kind: 'cards', name: `cards/${volume}`, data: v, volume });
  const slug = new Map(BOOKS.map((b) => [b.code, b.slug]));
  for (const [book, t] of buildTexts(A)) packs.push({ kind: 'text', name: `text/${String(bookNo(book)).padStart(2, '0')}-${slug.get(book)}`, data: t, book });
  packs.push({ kind: 'stems', name: 'stems', data: buildStems(A, words.words) });
  if (o.tsk) {
    const fits = (rows: unknown) => fitsBudget(canonical({ ...stamp(A), book: 'Пс', part: 1, rows }), BUDGETS.tsk.max);
    for (const t of buildTsk(A, readFileSync(join(ROOT, 'tools/bible/tsk.tsv'), 'utf8'), fits))
      packs.push({ kind: 'tsk', name: `tsk/${String(bookNo(t.book)).padStart(2, '0')}-${slug.get(t.book)}-${t.part}`, data: t, book: t.book, part: t.part });
  }
  const notice = noticeFor(base, A, { tsk: o.tsk });
  const c = A.counts.all;
  return writePacks(packs, {
    dir,
    admit: o.level,
    compression: 'br',
    release: o.release ?? null,
    inputs: { base: baseFingerprint(), files: inputDigests() },
    statuses: { checked: c.checked, draft: c.draft, quarantine: c.quarantine, stale: c.stale, rights: c.rights, admitted: c.admitted },
    sources: notice.entries.map((e) => ({ id: e.id, spdx: e.spdx, version: e.version, ...(e.attribution && { attribution: e.attribution }) })),
    extra: [{ name: 'NOTICE.txt', text: notice.text }],
  });
}

/** Отчёт сборки и код выхода: бюджет по сжатию хранилища и NFC — ошибки; gzip сверх бюджета — замечание. */
export function report(r: WriteResult, label: string): number {
  const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;
  console.log(`${label}: пакетов ${r.manifest.packages.length}, бюджет — brotli 5 и gzip 9${r.manifest.banner ? `  [${r.manifest.banner}]` : ''}`);
  console.log(sizeTable(r.manifest));
  for (const p of r.over) console.error(`!! бюджет: ${p.file} — brotli 5 ${kb(p.size)}, gzip 9 ${kb(p.gzip)} при бюджете ${kb(p.budget)}`);
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
  const out = val('--out');
  try {
    const r = build({ level, ...(out && { dir: resolve(out) }), tsk: argv.includes('--tsk'), release });
    process.exit(report(r, `сборка «${level === 'probe' ? 'проба' : 'выпуск'}» → ${relative(ROOT, out ? resolve(out) : PACK_DIR[level])}/`));
  } catch (e) {
    console.error(`!! ${(e as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
