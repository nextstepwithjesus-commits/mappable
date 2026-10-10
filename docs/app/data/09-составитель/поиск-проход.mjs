// Редакция 1 (устарело): подстрока, а не основы — рецензия данных на 09, № 3. Действующий замер — поиск-формы.ts.
import { readFileSync } from 'node:fs';
const t = readFileSync(process.argv[2], 'utf8').split('\n').map(l => l.split('\t')).filter(r => r.length > 1);
const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const verses = t.map(r => norm(r[r.length - 1]));
const words = new Set(); for (const v of verses) for (const w of v.split(/[^а-я]+/)) if (w) words.add(w);
console.log('стихов', verses.length, 'разных словоформ', words.size);
for (const q of [['пять', 'хлеб'], ['господь', 'пастыр'], ['ковчег']]) {
  const t0 = performance.now(); let n = 0;
  for (let k = 0; k < 20; k++) { n = 0; for (const v of verses) if (q.every(w => v.includes(w))) n++; }
  console.log(q.join(' '), 'найдено', n, 'мс на запрос', ((performance.now() - t0) / 20).toFixed(1));
}
