/**
 * Стабильность карты (ТЗ NFR-3): координаты опорных лиц не меняются без явного одобрения.
 * Опорные лица — звёзды величины 0–2 (самые значимые, около сотни). Для каждого хранится полоса
 * и год начала следа в модели по умолчанию. Сверка идёт по собранному индексу (npm run data).
 *
 *   npm run -s coords              — сверить со снимком data/coords-snapshot.json
 *   npm run -s coords -- --accept  — принять текущие координаты как новый снимок
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';

type Row = { id: string; name: string; lane: number; t0: number };
const SNAP = join(ROOT, 'data/coords-snapshot.json');
const accept = process.argv.includes('--accept');

const atlas = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as {
  persons: { id: string; n: string; mg: number }[];
  models: { chrono: ([number, ...unknown[]] | null)[]; layout: { nodes: number[][] } }[];
};
const m = atlas.models[0];
const rows: Row[] = [];
for (const n of m.layout.nodes) {
  if (n[0] < 0) continue; // призраки
  const p = atlas.persons[n[0]];
  if (p.mg > 2) continue;
  const b = (m.chrono[n[0]]?.[0] as number | undefined) ?? 0;
  rows.push({ id: p.id, name: p.n, lane: n[1], t0: b + n[2] });
}
rows.sort((a, b) => a.t0 - b.t0);

if (accept || !existsSync(SNAP)) {
  writeFileSync(SNAP, JSON.stringify({ about: 'Снимок координат опорных лиц (NFR-3). Обновляется только командой npm run -s coords -- --accept после просмотра изменений.', persons: rows }, null, 1) + '\n');
  console.log(`Снимок записан: ${rows.length} опорных лиц.`);
  process.exit(0);
}

const snap = JSON.parse(readFileSync(SNAP, 'utf8')) as { persons: Row[] };
const now = new Map(rows.map((r) => [r.id, r]));
const moved: string[] = [];
const gone: string[] = [];
for (const r of snap.persons) {
  const c = now.get(r.id);
  if (!c) {
    gone.push(r.name);
    continue;
  }
  // полоса — точно; год — с допуском в 2 года (округление оценок)
  if (c.lane !== r.lane || Math.abs(c.t0 - r.t0) > 2) moved.push(`${r.name}: полоса ${r.lane} → ${c.lane}, год ${r.t0} → ${c.t0}`);
}
const added = rows.filter((r) => !snap.persons.some((s) => s.id === r.id)).map((r) => r.name);
if (added.length) console.log(`Новые опорные лица (не ошибка): ${added.join(', ')}`);
if (gone.length) console.log(`Пропали из опорных: ${gone.join(', ')}`);
if (moved.length) console.log(`Сдвинулись:\n  ${moved.join('\n  ')}`);
const bad = moved.length + gone.length;
console.log(bad ? `\nКоординаты ${bad} опорных лиц изменились. Если это ожидаемо — npm run -s coords -- --accept.` : `Координаты ${snap.persons.length} опорных лиц не изменились.`);
process.exit(bad ? 1 : 0);
