/**
 * Добавление партии лиц в том (для больших томов, которые пишутся по частям).
 *   npm run -s append -- data/persons/07-judah.json /path/to/batch.json
 * batch.json — массив лиц [...] или объект { persons: [...] }. Лица с тем же id заменяются, новые — дописываются в конец.
 * Если тома ещё нет, передайте метаданные: --volume 07 --title "Колено Иудино" --scope "…".
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [target, batchFile] = pos;
if (!target || !batchFile) {
  console.error('usage: npm run -s append -- <volume.json> <batch.json> [--volume NN --title T --scope S]');
  process.exit(1);
}
const batchRaw = JSON.parse(readFileSync(batchFile, 'utf8'));
const batch: { id: string }[] = Array.isArray(batchRaw) ? batchRaw : batchRaw.persons;
let vol: { volume: string; title: string; scope: string; persons: { id: string }[] };
if (existsSync(target)) vol = JSON.parse(readFileSync(target, 'utf8'));
else {
  vol = { volume: flag('--volume') ?? '??', title: flag('--title') ?? '', scope: flag('--scope') ?? '', persons: [] };
  mkdirSync(dirname(target), { recursive: true });
}
const idx = new Map(vol.persons.map((p, i) => [p.id, i]));
let added = 0;
let replaced = 0;
for (const p of batch) {
  if (idx.has(p.id)) {
    vol.persons[idx.get(p.id)!] = p;
    replaced++;
  } else {
    idx.set(p.id, vol.persons.length);
    vol.persons.push(p);
    added++;
  }
}
writeFileSync(target, JSON.stringify(vol, null, 1) + '\n');
console.log(`${target}: +${added} новых, ${replaced} заменено, всего ${vol.persons.length}`);
