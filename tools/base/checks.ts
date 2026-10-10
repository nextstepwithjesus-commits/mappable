/**
 * Подпись проверки — второй ключ (02 § 3.1; этап Д3-2). Подписи хранятся в base/checks.json: база base/ пересобирается
 * из data/ командой `npm run -s base`, а журнал подписей она не трогает.
 *
 *   npm run -s base:mark -- --list p-avraam                     ключи записей (подстрока) и их статус
 *   npm run -s base:mark -- --by "имя" --kind human <ключ> …     подписать записи (kind: human — человек, agent — агент)
 *   npm run -s base:mark -- --by "имя" --kind agent --actor p-avraam
 *                                                               подписать лицо, его утверждения, «нет сведений» и время
 *   npm run -s base:mark -- --stale                             подписи, которые больше не действуют, и почему
 *   npm run -s base:mark -- --unmark <ключ> …                   снять подпись
 *
 * Подписать можно только запись не в карантине, при базе без ошибок проверки (кроме устаревших подписей) и не
 * составителю записи. Повторная подпись переносит прежнюю в историю.
 */
import { pathToFileURL } from 'node:url';
import { loadBase, validate } from './validate.ts';
import { ledger, records, saveChecks, sign, statusOf, staleReason, inputsOf } from './admit.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const base = loadBase();
  const recs = records(base);
  const led = ledger(base);
  const show = (key: string) => {
    const r = recs.find((x) => x.key === key)!;
    const s = statusOf(r, base, led);
    return `${s.status}${s.stale ? ` (подпись устарела: ${s.stale})` : ''}`;
  };

  const list = arg('--list');
  if (list !== undefined) {
    const hit = recs.filter((r) => r.key.includes(list));
    for (const r of hit.slice(0, 500)) console.log(`${r.key}\t${show(r.key)}`);
    console.log(`записей: ${hit.length}${hit.length > 500 ? ' (показаны первые 500)' : ''}`);
    return;
  }
  if (process.argv.includes('--stale')) {
    let n = 0;
    for (const c of base.checks ?? []) {
      const r = recs.find((x) => x.key === c.key);
      if (!r) {
        console.log(`${c.key}\tзаписи больше нет`);
        n++;
        continue;
      }
      const s = statusOf(r, base, led);
      if (s.stale) {
        console.log(`${c.key}\t${staleReason(c, inputsOf(r, base))}`);
        n++;
      }
    }
    console.log(`подписей: ${(base.checks ?? []).length}; не действуют: ${n}`);
    return;
  }
  const unmark = process.argv.indexOf('--unmark');
  if (unmark >= 0) {
    const keys = new Set(process.argv.slice(unmark + 1).filter((x) => !x.startsWith('--')));
    const left = (base.checks ?? []).filter((c) => !keys.has(c.key));
    saveChecks(left);
    console.log(`снято подписей: ${(base.checks ?? []).length - left.length}`);
    return;
  }

  const by = arg('--by');
  const kind = arg('--kind');
  if (!by || (kind !== 'human' && kind !== 'agent')) {
    console.error('!! нужно --by "кто проверил" и --kind human|agent (02 § 3.1: проверка агентом не выдаётся за экспертизу)');
    process.exit(1);
  }
  const flags = new Set(['--by', '--kind', '--actor', '--at']);
  const keys: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (flags.has(argv[i])) i++;
    else if (!argv[i].startsWith('--')) keys.push(argv[i]);
  }
  const actor = arg('--actor');
  if (actor) {
    for (const r of recs) {
      const own = r.key === `actor:${actor}` || ((r.coll === 'fact' || r.coll === 'nodata' || r.coll === 'chrono') && r.deps[0] === `actor:${actor}`);
      if (own && statusOf(r, base, led).status !== 'quarantine') keys.push(r.key);
    }
  }
  if (!keys.length) {
    console.error('!! нет ключей: укажите ключи записей или --actor <номер лица>; ключи — --list');
    process.exit(1);
  }
  const errors = validate(base).filter((i) => i.level === 'error' && i.check !== 'проверка');
  if (errors.length) {
    console.error(`!! проверка базы: ошибок ${errors.length} — подписывать нельзя`);
    process.exit(1);
  }
  const entries = new Map((base.checks ?? []).map((c) => [c.key, c]));
  for (const key of keys) {
    try {
      entries.set(key, sign(base, key, { by, kind, at: arg('--at') }));
    } catch (e) {
      console.error(`!! ${(e as Error).message} — ничего не записано`);
      process.exit(1);
    }
    console.log(`подписано: ${key}`);
  }
  saveChecks([...entries.values()]);
  console.log(`подписей в журнале: ${entries.size}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
