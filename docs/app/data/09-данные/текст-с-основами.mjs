// Повторная проверка 09 ред. 2, § 5.3: вес пакета «текст по книгам», если в нём лежат основы слов (как пишет 09).
// Запуск: node docs/app/data/09-данные/текст-с-основами.mjs tools/bible/synodal.tsv
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const src = readFileSync(new URL('./поиск-основы.mjs', import.meta.url), 'utf8');
const stem = new Function(src.slice(src.indexOf('const PERFECTIVEGROUND'), src.indexOf('const norm')) + 'return stem;')();
const books = new Map();
for (const l of readFileSync(process.argv[2], 'utf8').split('\n')) { const p = l.split('\t'); if (p.length < 4) continue; (books.get(p[0]) ?? books.set(p[0], {}).get(p[0]))[`${p[1]}:${p[2]}`] = p[3]; }
let t0 = 0, t1 = 0, t2 = 0; const rows = [];
for (const [b, vs] of books) {
  const plain = JSON.stringify({ book: b, verses: vs });
  const st = {}; for (const [k, v] of Object.entries(vs)) st[k] = v.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/).filter(Boolean).map(stem).join(' ');
  const withStems = JSON.stringify({ book: b, verses: vs, stems: st });
  // вариант: словарь основ книги + номера
  const dict = [...new Set(Object.values(st).flatMap((s) => s.split(' ')))]; const ix = new Map(dict.map((d, i) => [d, i]));
  const coded = JSON.stringify({ book: b, verses: vs, dict, s: Object.values(st).map((s) => s.split(' ').map((w) => ix.get(w))) });
  const a = gzipSync(plain, { level: 9 }).length, c = gzipSync(withStems, { level: 9 }).length, d = gzipSync(coded, { level: 9 }).length;
  t0 += a; t1 += c; t2 += d; rows.push([b, a, c, d]);
}
rows.sort((x, y) => y[2] - x[2]);
const k = (n) => (n / 1024).toFixed(1);
console.log(`всего gzip: текст ${k(t0)} КБ; текст + основы строкой ${k(t1)} КБ; текст + словарь основ и номера ${k(t2)} КБ`);
for (const [b, a, c, d] of rows.slice(0, 4)) console.log(`  ${b}: ${k(a)} → ${k(c)} / ${k(d)} КБ`);
console.log(`книг сверх 96 КБ: с основами строкой ${rows.filter((r) => r[2] > 96 * 1024).length}; со словарём ${rows.filter((r) => r[3] > 96 * 1024).length}`);
// вариант: одна таблица «словоформа → основа» на весь текст, текст без изменений
const forms = new Set(); for (const vs of books.values()) for (const v of Object.values(vs)) for (const w of v.toLowerCase().replace(/ё/g, 'е').split(/[^а-я]+/)) if (w) forms.add(w);
const table = [...forms].sort().map((w) => { const s = stem(w); return s === w ? w : `${w}\t${s.length}`; }).join('\n');
console.log(`таблица «форма → длина основы» на весь текст: форм ${forms.size}; ${k(gzipSync(table, { level: 9 }).length)} КБ gzip`);
