/**
 * Реестр источников в базе (этап Д3-3, Д3-5; 02 § 5; 09 § 5.5; Д-база, Б-3, Б-5).
 *
 *   - проверка реестра: номера уникальны; права машинно (`spdx`, `attributionRequired`, `shareAlike`, `redistribute`);
 *     `dependsOn` ссылается на номера реестра, петель нет; у основы и у выпускаемого источника нет «проверить»;
 *   - ссылки записей: каждый источник файла и записи есть в реестре;
 *   - независимые подтверждения — разные корни графа `dependsOn`, а не разные записи (`sourceRoots`);
 *   - NOTICE: собирается из реестра при сборке — источники допущенных записей и части приложения (шрифты).
 */
import type { Base } from './migrate.ts';
import type { Source } from './types.ts';
import { records, recordSources, type Admission } from './admit.ts';

export interface RegistryIssue { level: 'error' | 'warn'; where: string; msg: string }

const USES = new Set<Source['use']>(['basis', 'reference', 'check-only', 'component']);
/** Слова «ещё не проверено» в полях источника. */
const UNSURE = /провер(ить|ке|ка)|уточнить|\?/i;
/** Идентификатор SPDX или свой «LicenseRef-…»; выражение — через AND, OR, WITH, скобки. */
const SPDX_ID = /^(LicenseRef-[A-Za-z0-9.-]+|NOASSERTION|NONE|[A-Za-z0-9][A-Za-z0-9.+-]*)$/;

export function spdxOk(expr: string): boolean {
  const toks = expr.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  return toks.every((t, i) => (i % 2 === 0 ? SPDX_ID.test(t) : t === 'AND' || t === 'OR' || t === 'WITH'));
}

/** Корни графа зависимостей источника: первоисточники, из которых он выведен (сам — если ни из чего). */
export function sourceRoots(id: string, reg: Map<string, Source>, path = new Set<string>()): string[] {
  const s = reg.get(id);
  const deps = s?.dependsOn ?? [];
  if (!deps.length || path.has(id)) return [id];
  path.add(id);
  const out = new Set(deps.flatMap((d) => sourceRoots(d, reg, path)));
  path.delete(id);
  return [...out].sort();
}

/** Сколько независимых подтверждений дают источники: число разных корней (Б-3). */
export function independentCount(ids: string[], reg: Map<string, Source>): number {
  return new Set(ids.flatMap((i) => sourceRoots(i, reg))).size;
}

export function validateRegistry(base: Base): RegistryIssue[] {
  const out: RegistryIssue[] = [];
  const err = (where: string, msg: string) => out.push({ level: 'error', where, msg });
  // база из переноса в памяти (buildBase) реестра не несёт: реестр живёт на диске и проверяется у базы с диска
  if (base.sources === undefined) return out;
  const items = base.sources;
  if (!items.length) {
    err('base/sources.json', 'реестр источников не загружен или пуст');
    return out;
  }
  const reg = new Map<string, Source>();
  for (const s of items) {
    const w = s.id || '(без номера)';
    if (!/^src-[a-z0-9-]+$/.test(s.id ?? '')) err(w, 'номер источника — вида «src-…» (строчные латинские буквы, цифры, дефис)');
    if (reg.has(s.id)) err(w, 'номер источника повторяется');
    reg.set(s.id, s);
    for (const k of ['title', 'license', 'spdx', 'licenseSource'] as const) if (!s[k]?.trim()) err(w, `нет поля «${k}»`);
    if (!USES.has(s.use)) err(w, `неизвестное назначение «${s.use}» (basis, reference, check-only, component)`);
    for (const k of ['attributionRequired', 'shareAlike', 'redistribute'] as const) {
      if (typeof s[k] !== 'boolean') err(w, `поле «${k}» — да или нет (true/false)`);
    }
    if (s.spdx && !spdxOk(s.spdx)) err(w, `«${s.spdx}» — не выражение SPDX (свои имена — «LicenseRef-…»)`);
    if (s.attributionRequired && !s.attribution?.trim()) err(w, 'лицензия требует надписи, а надписи («attribution») нет');
    // основа и всё, что может попасть в сборку, — без «проверить» (Б-3, Б-5; 09 § 5.5)
    if (s.use === 'basis' || s.redistribute) {
      for (const k of ['license', 'spdx', 'version'] as const) if (UNSURE.test(s[k] ?? '')) err(w, `«${k}» не проверено («${s[k]}»), а источник ${s.use === 'basis' ? '— основа данных' : 'разрешён в сборку'}`);
    }
    if (s.redistribute && /^(NOASSERTION|NONE)$/.test(s.spdx)) err(w, 'лицензия не подтверждена (NOASSERTION), а источник разрешён в сборку');
    if (s.use === 'check-only' && s.redistribute) err(w, 'источник «только для сверки» не входит в приложение: redistribute должно быть false');
    if (s.use === 'component' && !s.redistribute) err(w, 'часть приложения (component) без права распространения');
  }
  // зависимости: известные номера, без петель
  for (const s of items) {
    for (const d of s.dependsOn ?? []) {
      if (d === s.id) err(s.id, 'источник зависит сам от себя');
      else if (!reg.has(d)) err(s.id, `зависимость «${d}» — нет в реестре`);
    }
  }
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, stack: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      err(id, `петля зависимостей: ${[...stack.slice(stack.indexOf(id)), id].join(' → ')}`);
      return;
    }
    state.set(id, 1);
    for (const d of reg.get(id)?.dependsOn ?? []) if (reg.has(d)) visit(d, [...stack, id]);
    state.set(id, 2);
  };
  for (const s of items) visit(s.id, []);
  // источники файлов и записей — из реестра
  for (const [file, ids] of Object.entries(base.fileSources ?? {})) {
    if (!Array.isArray(ids) || !ids.length) err(`base/${file}`, 'поле sources файла — непустой список номеров реестра');
    else for (const id of ids) if (!reg.has(id)) err(`base/${file}`, `источник «${id}» — нет в реестре`);
  }
  for (const r of records(base)) {
    for (const id of recordSources(r, base)) if (!reg.has(id)) err(r.key, `источник «${id}» — нет в реестре base/sources.json`);
  }
  return out;
}

export interface NoticeEntry { id: string; title: string; who: string; version: string; spdx: string; attribution?: string; licenseSource: string; why: string }

/**
 * NOTICE сборки (09 § 5.5; Д3-5): источники допущенных записей и части приложения (`use: component`). Каждый — с SPDX
 * без «проверить» и с надписью, если её требует лицензия; источник без права распространения в NOTICE — ошибка сборки.
 */
export function noticeEntries(base: Base, A: Admission): NoticeEntry[] {
  const reg = new Map((base.sources ?? []).map((s) => [s.id, s]));
  const used = new Map<string, number>();
  for (const r of records(base)) if (A.ok(r.rec)) for (const id of recordSources(r, base)) used.set(id, (used.get(id) ?? 0) + 1);
  for (const s of base.sources ?? []) if (s.use === 'component') used.set(s.id, used.get(s.id) ?? 0);
  const out: NoticeEntry[] = [];
  const bad: string[] = [];
  for (const [id, n] of [...used].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const s = reg.get(id);
    if (!s) { bad.push(`${id}: нет в реестре`); continue; }
    if (!s.redistribute) bad.push(`${id}: источник не разрешает распространение`);
    if (UNSURE.test(s.spdx) || /^(NOASSERTION|NONE)$/.test(s.spdx)) bad.push(`${id}: лицензия не подтверждена («${s.spdx}»)`);
    if (s.attributionRequired && !s.attribution) bad.push(`${id}: нет надписи, которую требует лицензия`);
    out.push({
      id, title: s.title, who: [s.author, s.org].filter(Boolean).join('; '), version: s.version, spdx: s.spdx,
      ...(s.attribution && { attribution: s.attribution }), licenseSource: s.licenseSource,
      why: s.use === 'component' ? 'часть приложения' : `источник записей в сборке: ${n}`,
    });
  }
  if (bad.length && A.level === 'release') throw new Error(`NOTICE: права не позволяют выпуск —\n  ${bad.join('\n  ')}`);
  return out;
}

/** Текст NOTICE по записям `noticeEntries`. */
export function noticeText(entries: NoticeEntry[], level: Admission['level']): string {
  const head = [
    'Источники и права',
    '=================',
    '',
    'Файл собран из реестра источников base/sources.json при сборке данных (09 § 5.5).',
    ...(level === 'probe' ? ['Сборка уровня «проба»: только для прототипов, не для показа вне компьютеров команды.'] : []),
    '',
  ];
  const body = entries.flatMap((e) => [
    `${e.title} [${e.id}]`,
    ...(e.who ? [`  Кто: ${e.who}`] : []),
    `  Версия: ${e.version}`,
    `  Лицензия (SPDX): ${e.spdx}`,
    ...(e.attribution ? [`  Надпись: ${e.attribution}`] : []),
    `  Где прочитана лицензия: ${e.licenseSource}`,
    `  Зачем: ${e.why}`,
    '',
  ]);
  return [...head, ...body].join('\n');
}
