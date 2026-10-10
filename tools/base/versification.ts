/**
 * Таблица нумерации стихов: Синодальная → KJV (docs/app/02-ДАННЫЕ.md, § 5, § 6.1; этап Д1.5).
 *
 *   npx tsx tools/base/versification.ts <SynodalProt.properties> <SystemKJV.java>
 *
 * Основа — JSword (CrossWire Bible Society), файл SynodalProt.properties (LGPL 2.1 или новее); число стихов KJV —
 * SystemKJV.java того же проекта. Исходные файлы лежат вне репозитория; производная таблица base/versification/synodal-kjv.json
 * распространяется под той же лицензией.
 *
 * Исправления JSword под наш Синодальный текст (tools/bible/synodal.tsv):
 *   — Дан 3: в нашем тексте после 3:23 идут 3:91–100 (3:24–90 — неканоническая вставка, исключена). JSword считает
 *     главу сплошной (3:31–33 → 4:1–3). Верно: Дан 3:91–97 → Dan 3:24–30; 3:98–100 → Dan 4:1–3;
 *   — Пс 12:6: в JSword опечатка «Ps.13.5-Ps.12.6»; верно Ps 13:5–6.
 * Таблица хранит только отличия: стих, которого нет в таблице, имеет тот же номер в KJV.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadBible } from '../bible.ts';
import { BOOKS } from '../../src/engine/books.ts';

export const OSIS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh',
  'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah',
  'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim',
  '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
];
/** Синодальные сокращения → OSIS (порядок книг разный: в Синодальном соборные послания идут до Павловых). */
const SYN_TO_OSIS: Record<string, string> = Object.fromEntries(
  BOOKS.map((b, i) => {
    const nt = ['Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Иак', '1Пет', '2Пет', '1Ин', '2Ин', '3Ин', 'Иуд', 'Рим', '1Кор', '2Кор', 'Гал', 'Еф', 'Флп', 'Кол', '1Фес', '2Фес', '1Тим', '2Тим', 'Тит', 'Флм', 'Евр', 'Откр'];
    const ntOsis = ['Matt', 'Mark', 'Luke', 'John', 'Acts', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Rev'];
    return [b.code, i < 39 ? OSIS[i] : ntOsis[nt.indexOf(b.code)]];
  }),
);
const OSIS_TO_SYN = Object.fromEntries(Object.entries(SYN_TO_OSIS).map(([s, o]) => [o, s]));

/** Число стихов по главам KJV из SystemKJV.java: OSIS → [стихов в главе 1, 2, …]. */
export function kjvCounts(java: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const body = (name: string) => {
    const i = java.indexOf(`int[][] ${name}`);
    const start = java.indexOf('{', i);
    let depth = 0;
    for (let j = start; j < java.length; j++) {
      if (java[j] === '{') depth++;
      else if (java[j] === '}' && --depth === 0) return java.slice(start + 1, j);
    }
    throw new Error(name);
  };
  const books = [...body('LAST_VERSE_OT').matchAll(/\{([^{}]*)\}/g), ...body('LAST_VERSE_NT').matchAll(/\{([^{}]*)\}/g)];
  if (books.length !== 66) throw new Error(`KJV: книг ${books.length}`);
  books.forEach((m, i) => out.set(OSIS[i], m[1].split(',').map((x) => x.trim()).filter(Boolean).map(Number)));
  return out;
}

interface V { book: string; ch: number; v: number; part?: string }
const parseV = (s: string): V => {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:!([a-z]))?$/.exec(s.trim());
  if (!m) throw new Error(`ссылка JSword: ${s}`);
  return { book: m[1], ch: +m[2], v: +m[3], ...(m[4] && { part: m[4] }) };
};
/** Разворачивает диапазон «A.c.v-A.c2.v2» по числу стихов системы. */
function expand(range: string, len: (book: string, ch: number) => number): V[] {
  const [a, b] = range.split('-').map(parseV);
  if (!b) return [a];
  const out: V[] = [];
  for (let ch = a.ch; ch <= b.ch; ch++) {
    const from = ch === a.ch ? a.v : ch === b.ch && b.v === 0 ? 0 : 1;
    const to = ch === b.ch ? b.v : len(a.book, ch);
    for (let v = from; v <= to; v++) out.push({ book: a.book, ch, v });
  }
  if (a.part) out[0] = { ...out[0], part: a.part };
  if (b.part) out[out.length - 1] = { ...out[out.length - 1], part: b.part };
  return out;
}
const synKey = (x: V) => `${OSIS_TO_SYN[x.book]} ${x.ch}:${x.v}`;
const osisKey = (x: V) => `${x.book}.${x.ch}.${x.v}${x.part ? '!' + x.part : ''}`;

export const FIXES: { what: string; remove: string[]; add: string[] }[] = [
  {
    what: 'Дан 3: в Синодальном тексте после 3:23 идут 3:91–100 (3:24–90 — неканоническая вставка); JSword считает главу сплошной',
    remove: ['Dan.3.31-Dan.3.33=Dan.4.1-Dan.4.3'],
    add: ['Dan.3.91-Dan.3.97=Dan.3.24-Dan.3.30', 'Dan.3.98-Dan.3.100=Dan.4.1-Dan.4.3'],
  },
  { what: 'Пс 12:6: опечатка JSword «Ps.13.5-Ps.12.6»', remove: ['Ps.12.6=Ps.13.5-Ps.12.6'], add: ['Ps.12.6=Ps.13.5-Ps.13.6'] },
  {
    what: 'Пс 89: 89:1 — надписание (KJV 90:0), 89:6 «как наводнением… засыхает» — KJV 90:5–6 (проверено по тексту)',
    remove: ['Ps.89.1-Ps.89.17=Ps.90.0-Ps.90.17'],
    add: ['Ps.89.1-Ps.89.5=Ps.90.0-Ps.90.4', 'Ps.89.6=Ps.90.5-Ps.90.6', 'Ps.89.7-Ps.89.17=Ps.90.7-Ps.90.17'],
  },
  {
    what: 'Вставки греческого перевода в скобках, которых нет в KJV: Нав 24:34–36; Притч 4:28–29; 13:14; 18:8 — и сдвиг нумерации после них',
    remove: [],
    add: [
      'Josh.24.34-Josh.24.36=NONE', 'Prov.4.28-Prov.4.29=NONE',
      'Prov.13.14=NONE', 'Prov.13.15-Prov.13.26=Prov.13.14-Prov.13.25',
      'Prov.18.8=NONE', 'Prov.18.9-Prov.18.25=Prov.18.8-Prov.18.24',
    ],
  },
  { what: '3Ин 1:14–15 — в KJV один стих 1:14', remove: [], add: ['3John.1.14=3John.1.14!a', '3John.1.15=3John.1.14!b'] },
];

/** Отличия Синодальной нумерации от KJV: «Пс 3:1» → ["Ps.3.0"]. */
export function buildMap(props: string, kjv: Map<string, number[]>) {
  const bible = loadBible();
  const synLen = (book: string, ch: number) => bible.chapterLength(OSIS_TO_SYN[book], ch);
  const kjvLen = (book: string, ch: number) => kjv.get(book)?.[ch - 1] ?? 0;
  let lines = props.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  for (const f of FIXES) {
    for (const r of f.remove) {
      if (!lines.includes(r)) throw new Error(`исправление не применимо — нет строки ${r}`);
      lines = lines.filter((l) => l !== r);
    }
    lines.push(...f.add);
  }
  const map = new Map<string, string[]>();
  const problems: string[] = [];
  for (const l of lines) {
    const [left, right] = l.split('=');
    if (right.startsWith('?')) continue; // неканоническая вставка (Песнь трёх отроков)
    if (right === 'NONE') {
      for (const x of expand(left, synLen)) map.set(synKey(x), []);
      continue;
    }
    // надписание Песн 1:0 есть в JSword, но не в нашем тексте: стихи сопоставляются со сдвигом, пропущенный — без пары
    const L = expand(left, synLen);
    const R = expand(right, kjvLen);
    for (const x of L) if (!bible.verses.has(synKey(x)) && x.v !== 0) problems.push(`нет стиха ${synKey(x)} в нашем тексте (${l})`);
    for (const y of R) if (y.v > kjvLen(y.book, y.ch)) problems.push(`нет стиха ${osisKey(y)} в KJV (${l})`);
    if (L.length === R.length) L.forEach((x, i) => bible.verses.has(synKey(x)) && map.set(synKey(x), [osisKey(R[i])]));
    else if (L.length === 1) map.set(synKey(L[0]), R.map(osisKey));
    else if (R.length === 1) L.forEach((x) => map.set(synKey(x), [osisKey(R[0])]));
    else problems.push(`неравные диапазоны ${l}`);
  }
  // стих без строки в таблице должен существовать в KJV под тем же номером
  const unmatched: string[] = [];
  for (const key of bible.order) {
    if (map.has(key)) continue;
    const m = /^(\S+) (\d+):(\d+)$/.exec(key)!;
    const o = SYN_TO_OSIS[m[1]];
    if (+m[3] > kjvLen(o, +m[2])) unmatched.push(key);
  }
  for (const [k, v] of map) {
    const m = /^(\S+) (\d+):(\d+)$/.exec(k)!;
    if (v.length === 1 && v[0] === `${SYN_TO_OSIS[m[1]]}.${m[2]}.${m[3]}`) map.delete(k); // совпадает с KJV
  }
  return { map, problems, unmatched };
}

/** Перевод синодальной ссылки на стих в номера KJV. */
export function toKjv(table: Record<string, string[]>, synVerse: string): string[] {
  if (table[synVerse]) return table[synVerse];
  const m = /^(\S+) (\d+):(\d+)$/.exec(synVerse);
  if (!m) throw new Error(`стих: ${synVerse}`);
  return [`${SYN_TO_OSIS[m[1]]}.${m[2]}.${m[3]}`];
}

function main() {
  const [propsPath, javaPath] = process.argv.slice(2);
  if (!propsPath || !javaPath) throw new Error('нужно: <SynodalProt.properties> <SystemKJV.java>');
  const { map, problems, unmatched } = buildMap(readFileSync(propsPath, 'utf8'), kjvCounts(readFileSync(javaPath, 'utf8')));
  console.log(`отличий от KJV: ${map.size}; замечаний: ${problems.length}; стихов без пары в KJV: ${unmatched.length}`);
  for (const p of problems) console.log(`  ${p}`);
  if (unmatched.length) console.log(`  без пары: ${unmatched.slice(0, 40).join('; ')}`);
  const out = join(import.meta.dirname, '..', '..', 'base', 'versification');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'synodal-kjv.json'), JSON.stringify({
    schema: 1,
    title: 'Нумерация стихов: Синодальная → KJV (только отличия)',
    source: 'JSword, CrossWire Bible Society: SynodalProt.properties и SystemKJV.java (github.com/crosswire/jsword, коммит a2c51f3)',
    license: 'GNU LGPL 2.1 или новее — производная таблица от JSword',
    fixes: FIXES,
    unmatched,
    map: Object.fromEntries(map),
  }, null, 1) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
