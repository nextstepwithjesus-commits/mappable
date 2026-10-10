// Собирает данные.js для экранов 2 и 3 шага 0: данные страниц (prototypes/шаг-0/данные/),
// стихи — дословно из tools/bible/synodal.tsv (тот же файл читает npm run -s verse),
// виды скобок — из tools/bible/brackets.tsv, порядок 66 книг — из synodal.tsv.
// Запуск из корня проекта: node prototypes/шаг-0/экраны/история/собрать.mjs
// ПРОТОТИП: в продукт не переносится.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ПАПКА = dirname(fileURLToPath(import.meta.url));
const КОРЕНЬ = join(ПАПКА, '..', '..', '..', '..');
const данные = (f) => JSON.parse(readFileSync(join(КОРЕНЬ, 'prototypes/шаг-0/данные', f), 'utf8'));
const ной = данные('ной-и-потоп.json');
const расслабленный = данные('расслабленный.json');
const эпохи = JSON.parse(readFileSync(join(КОРЕНЬ, 'base/epochs.json'), 'utf8')).items
  .map((e) => ({ id: e.id, имя: e.name, коротко: e.short }));

// главы, из которых берутся стихи (части истории, вклейки ±2 стиха, места вне книги)
const ГЛАВЫ = ['Быт 6', 'Быт 7', 'Быт 8', 'Быт 9', 'Мф 9', 'Мк 2', 'Лк 5', 'Ис 54', 'Мф 24', 'Лк 17',
  '1Пет 3', '2Пет 2', '2Пет 3', 'Евр 11', 'Пс 28', '1Пар 1', 'Иез 14', 'Лк 3'];
const нужно = new Set(ГЛАВЫ);
const стихи = {}; const книги = [];
for (const l of readFileSync(join(КОРЕНЬ, 'tools/bible/synodal.tsv'), 'utf8').split('\n')) {
  if (!l) continue;
  const [b, c, v, t] = l.split('\t');
  if (!книги.length || книги[книги.length - 1] !== b) книги.push(b);
  if (нужно.has(`${b} ${c}`)) стихи[`${b} ${c}:${v}`] = t;
}
const скобки = {};
for (const l of readFileSync(join(КОРЕНЬ, 'tools/bible/brackets.tsv'), 'utf8').split('\n').slice(1)) {
  if (!l) continue;
  const p = l.split('\t');
  const к = `${p[0]} ${p[1]}:${p[2]}`;
  if (!(к in стихи)) continue;
  (скобки[к] ||= []).push({ знак: p[4], текст: p[5], вид: p[6] });
}
if (книги.length !== 66) throw new Error('книг не 66: ' + книги.length);
const выход = `// СОБРАНО скриптом собрать.mjs — не править руками.\nwindow.ИСТОРИЯ = ${JSON.stringify({ собрано: new Date().toISOString().slice(0, 10), ной, расслабленный, эпохи, стихи, скобки, книги })};\n`;
writeFileSync(join(ПАПКА, 'данные.js'), выход);

// проверка сырых значений в своём CSS (то же правило, что в собрать.mjs листа)
const СЫРОЕ = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])\d*\.?\d+(px|rem|em|ms|s|vh|vw)\b/;
let ошибок = 0;
readFileSync(join(ПАПКА, 'история.css'), 'utf8').split('\n').forEach((s, i) => {
  const чисто = s.replace(/\/\*.*?\*\//g, '');
  if (/@media|@container/.test(чисто)) return;
  if (СЫРОЕ.test(чисто)) { ошибок++; console.error(`СЫРОЕ ЗНАЧЕНИЕ история.css:${i + 1}: ${s.trim()}`); }
});
console.log(`данные.js: стихов ${Object.keys(стихи).length}, мест со скобками ${Object.keys(скобки).length}; сырых значений в история.css: ${ошибок}`);
process.exit(ошибок ? 1 : 0);
