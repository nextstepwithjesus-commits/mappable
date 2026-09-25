/**
 * Отчёт о покрытии родословных отрывков (ТЗ § 1 п. 1, § 10).
 * Для каждого отрывка: какие имена собственные текста сопоставлены лицу атласа, у которого есть ссылка
 * на эту главу, и какие остались без лица. Места и народы, не являющиеся лицами, перечислены
 * в data/coverage-ignore.json.
 *
 *   npm run -s coverage            — отчёт в docs/coverage.md и сводка в консоль
 *   npm run -s coverage -- 07      — только отрывки, относящиеся к тому 07
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadBible, ROOT } from './bible.ts';
import { parseRef, verseId } from '../src/engine/books.ts';
import { nameMatcher, norm, stripBrackets } from '../src/engine/text.ts';
import type { Person, Volume } from '../src/data/types.ts';

const PASSAGES: { ref: string; vol: string[] }[] = [
  { ref: 'Быт 4:17-26', vol: ['01'] },
  { ref: 'Быт 5:1-32', vol: ['01'] },
  { ref: 'Быт 10:1-32', vol: ['02'] },
  { ref: 'Быт 11:10-32', vol: ['03'] },
  { ref: 'Быт 22:20-24', vol: ['03'] },
  { ref: 'Быт 25:1-4', vol: ['04'] },
  { ref: 'Быт 25:12-18', vol: ['04'] },
  { ref: 'Быт 35:22-26', vol: ['06'] },
  { ref: 'Быт 36:1-43', vol: ['05'] },
  { ref: 'Быт 46:8-27', vol: ['06'] },
  { ref: 'Исх 6:14-25', vol: ['08'] },
  { ref: 'Чис 1:5-15', vol: ['18'] },
  { ref: 'Чис 13:4-15', vol: ['18'] },
  { ref: 'Чис 26:5-62', vol: ['06', '08', '09', '10'] },
  { ref: 'Чис 34:19-28', vol: ['18'] },
  { ref: 'Руф 4:18-22', vol: ['07'] },
  { ref: '1Пар 1:1-54', vol: ['01', '02', '03', '04', '05'] },
  { ref: '1Пар 2:1-55', vol: ['06', '07'] },
  { ref: '1Пар 3:1-24', vol: ['12', '13', '16'] },
  { ref: '1Пар 4:1-43', vol: ['07', '09'] },
  { ref: '1Пар 5:1-26', vol: ['09'] },
  { ref: '1Пар 6:1-81', vol: ['08'] },
  { ref: '1Пар 7:1-40', vol: ['09', '10'] },
  { ref: '1Пар 8:1-40', vol: ['10'] },
  { ref: '1Пар 9:1-44', vol: ['20', '10'] },
  { ref: '2Цар 23:8-39', vol: ['19'] },
  { ref: '1Пар 11:10-47', vol: ['19'] },
  { ref: '1Пар 12:1-40', vol: ['19'] },
  { ref: '1Пар 23:6-24', vol: ['08'] },
  { ref: '1Пар 24:1-31', vol: ['08'] },
  { ref: '1Пар 25:1-31', vol: ['08'] },
  { ref: '1Пар 26:1-32', vol: ['08'] },
  { ref: '1Пар 27:1-34', vol: ['19'] },
  { ref: 'Езд 2:1-63', vol: ['20'] },
  { ref: 'Езд 7:1-5', vol: ['08'] },
  { ref: 'Езд 8:1-20', vol: ['20'] },
  { ref: 'Езд 10:18-44', vol: ['20'] },
  { ref: 'Неем 3:1-32', vol: ['20'] },
  { ref: 'Неем 10:1-27', vol: ['20'] },
  { ref: 'Неем 11:1-36', vol: ['20'] },
  { ref: 'Неем 12:1-26', vol: ['08', '20'] },
  { ref: 'Мф 1:1-16', vol: ['16'] },
  { ref: 'Лк 3:23-38', vol: ['16'] },
];

const STOP = new Set(
  [
    'Господь', 'Господа', 'Господу', 'Господом', 'Господне', 'Господень', 'Господни', 'Бог', 'Бога', 'Богу', 'Богом', 'Божий', 'Божия', 'Дух', 'Сын', 'Сына',
    'Вот', 'Все', 'Всех', 'Сии', 'Сыновья', 'Сыны', 'Сынов', 'Дети', 'Итак', 'Когда', 'После', 'Имя', 'Из', 'От', 'На', 'По', 'Он', 'Она', 'Они', 'И', 'А', 'Но', 'Это', 'Эти',
    'Всего', 'Всех', 'Семейство', 'Семейства', 'Начальник', 'Князь', 'Князья', 'Царь', 'Цари', 'Жена', 'Жены', 'Дочь', 'Дочери', 'Первенец', 'Братья', 'Потом', 'Там', 'Таковы',
  ].map((w) => norm(w)),
);

const bible = loadBible();
const ignore: string[] = existsSync(join(ROOT, 'data/coverage-ignore.json')) ? JSON.parse(readFileSync(join(ROOT, 'data/coverage-ignore.json'), 'utf8')) : [];
const ignoreRes = ignore.map((w) => nameMatcher(w));
const only = process.argv[2];

const dir = join(ROOT, 'data/persons');
const persons: Person[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume).persons);

// все ссылки лица → множество глав
const chaptersOf = new Map<string, Set<string>>();
const addCh = (id: string, r?: string) => {
  if (!r) return;
  const p = parseRef(r, bible.chapterLength);
  if (!p) return;
  const set = chaptersOf.get(id) ?? new Set<string>();
  for (const v of p.verses) set.add(`${v.book} ${v.chapter}`);
  if (p.chapterOnly) set.add(`${p.book} ${p.chapterOnly}`);
  chaptersOf.set(id, set);
};
for (const p of persons) {
  const walk = (o: unknown) => {
    if (typeof o === 'string') {
      if (/^[1-4]?[А-Яа-я]+ \d+:\d/.test(o)) addCh(p.id, o);
    } else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  };
  walk(p);
}
const forms = persons.map((p) => ({ id: p.id, res: [p.name, ...(p.card?.altNames ?? []).map((a) => a.name)].map((n) => nameMatcher(n)) }));

const lines: string[] = ['# Покрытие родословных отрывков', '', 'Имя собственное считается сопоставленным, если оно совпадает с именем или иной формой лица, у которого есть ссылка на эту главу.', ''];
let totalAll = 0;
let totalOk = 0;
for (const ps of PASSAGES) {
  if (only && !ps.vol.includes(only)) continue;
  const pr = parseRef(ps.ref, bible.chapterLength)!;
  const words: { w: string; v: string }[] = [];
  for (const v of pr.verses) {
    const t = bible.verses.get(verseId(v));
    if (!t) continue;
    const clean = stripBrackets(t);
    const re = /(?:^|[^А-ЯЁа-яё])([А-ЯЁ][а-яё]+(?:-[А-ЯЁ]?[а-яё]+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      const w = m[1];
      if (STOP.has(norm(w))) continue;
      words.push({ w, v: `${v.chapter}:${v.verse}` });
    }
  }
  const missing = new Map<string, string[]>();
  let ok = 0;
  let counted = 0;
  for (const { w, v } of words) {
    if (ignoreRes.some((r) => r.test(' ' + norm(w) + ' '))) continue;
    counted++;
    const ch = `${pr.book} ${v.split(':')[0]}`;
    const hit = forms.some((f) => chaptersOf.get(f.id)?.has(ch) && f.res.some((r) => r.test(' ' + norm(w) + ' ')));
    if (hit) ok++;
    else {
      const a = missing.get(w) ?? [];
      a.push(v);
      missing.set(w, a);
    }
  }
  totalAll += counted;
  totalOk += ok;
  const pct = counted ? Math.round((ok / counted) * 100) : 100;
  lines.push(`## ${ps.ref} — ${pct}% (${ok} из ${counted}; тома ${ps.vol.join(', ')})`, '');
  if (missing.size) lines.push('Без лица: ' + [...missing].map(([w, vs]) => `${w} (${vs.slice(0, 3).join(', ')})`).join('; '), '');
  console.log(`${ps.ref.padEnd(16)} ${String(pct).padStart(3)}%  без лица: ${missing.size}`);
}
lines.splice(3, 0, `Итого: ${totalAll ? Math.round((totalOk / totalAll) * 100) : 0}% имён сопоставлено (${totalOk} из ${totalAll}).`, '');
writeFileSync(join(ROOT, only ? `docs/coverage-${only}.md` : 'docs/coverage.md'), lines.join('\n') + '\n');
console.log(`Итого: ${totalAll ? Math.round((totalOk / totalAll) * 100) : 0}%`);
