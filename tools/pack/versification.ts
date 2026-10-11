/**
 * Своя таблица соответствий «западная (KJV) → синодальная нумерация» для разбора английских адресов (09 § 3.5 п. 4, § 5.5;
 * рецензии ядра: интерфейс № 4, данные № 7). Таблица JSword (`base/versification/synodal-kjv.json`, LGPL, с поправками FIXES)
 * в приложение не входит: по ней этот скрипт пишет отрезки соответствия в `core/search/versification-table.ts`, а тест
 * `tests/core-versification.test.ts` сверяет каждое расхождение таблицы с разбором ядра (так же сверена таблица Псалмов).
 *
 *   npx tsx tools/pack/versification.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

export interface Pair { kjv: [string, number, number]; syn: [string, number, number] }

/** Все пары таблицы, обращённые: западный стих → первый синодальный стих (части стиха «!b» и надписания «.0» — как есть). */
export function pairs(): Pair[] {
  const map = (JSON.parse(readFileSync(join(ROOT, 'base/versification/synodal-kjv.json'), 'utf8')) as { map: Record<string, string[]> }).map;
  const inv = new Map<string, Pair>();
  for (const [syn, kjvs] of Object.entries(map)) {
    const m = /^(\S+) (\d+):(\d+)$/.exec(syn);
    if (!m) throw new Error(`синодальный адрес ${syn}`);
    for (const k of kjvs) {
      const x = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)/.exec(k);
      if (!x) throw new Error(`западный адрес ${k}`);
      const key = `${x[1]}.${x[2]}.${x[3]}`;
      if (!inv.has(key)) inv.set(key, { kjv: [x[1], +x[2], +x[3]], syn: [m[1], +m[2], +m[3]] });
    }
  }
  return [...inv.values()].sort((a, b) => (a.kjv[0] < b.kjv[0] ? -1 : a.kjv[0] > b.kjv[0] ? 1 : a.kjv[1] - b.kjv[1] || a.kjv[2] - b.kjv[2]));
}

/** Отрезки: [OSIS, глава, стих, длина, синодальная книга, глава, стих] — подряд и в западной, и в синодальной нумерации. */
export function runs(ps = pairs()): [string, number, number, number, string, number, number][] {
  const out: [string, number, number, number, string, number, number][] = [];
  for (const p of ps) {
    const r = out.at(-1);
    if (r && r[0] === p.kjv[0] && r[1] === p.kjv[1] && r[2] + r[3] === p.kjv[2] && r[4] === p.syn[0] && r[5] === p.syn[1] && r[6] + r[3] === p.syn[2]) r[3]++;
    else out.push([p.kjv[0], p.kjv[1], p.kjv[2], 1, p.syn[0], p.syn[1], p.syn[2]]);
  }
  return out;
}

if (process.argv[1]?.endsWith('versification.ts')) {
  const rs = runs();
  const body = rs.map((r) => JSON.stringify(r)).join(',\n  ');
  writeFileSync(
    join(ROOT, 'core/search/versification-table.ts'),
    `/**\n * СОБРАНО скриптом tools/pack/versification.ts — не править руками. Своя таблица приложения: отрезки соответствия\n * «западный стих → синодальный» там, где нумерация расходится (09 § 3.5 п. 4, § 5.5). Сверка с таблицей JSword — тест\n * tests/core-versification.test.ts. Отрезок: [OSIS, глава, стих, длина, синодальная книга, глава, стих].\n */\nexport const KJV_RUNS: readonly (readonly [string, number, number, number, string, number, number])[] = [\n  ${body},\n];\n`,
  );
  console.log(`отрезков ${rs.length}, пар ${pairs().length}`);
}
