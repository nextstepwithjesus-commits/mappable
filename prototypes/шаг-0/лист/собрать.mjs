// Сборка листа-образца: токены.json → токены.css; данные шага 0 и стихи → лист-данные.js;
// проверка «сырых значений» в CSS компонентов; контраст (падает, если пара ниже нормы).
// Запуск из корня проекта: node prototypes/шаг-0/лист/собрать.mjs
// ПРОТОТИП шага 0: в продукт не переносится.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ПАПКА, загрузить, плоско, разрешить, hex, имяПеременной, латиница } from './токены.mjs';
import { отчёт } from './контраст.mjs';

const КОРЕНЬ = join(ПАПКА, '..', '..', '..');
const док = загрузить();
const все = плоско(док);
const пути = Object.keys(все).filter((p) => !p.startsWith('основа.'));

// ---------- 1. CSS-переменные ----------
function cssЗначение(т, v) {
  switch (т.$type) {
    case 'color': return hex(v);
    case 'dimension': return v.value === 0 ? '0' : `${v.value}${v.unit}`;
    case 'duration': return `${v.value}${v.unit}`;
    case 'cubicBezier': return `cubic-bezier(${v.join(', ')})`;
    case 'fontFamily': return v.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ');
    case 'shadow': {
      const c = v.color; const [r, g, b] = c.components.map((x) => Math.round(x * 255));
      return `${v.offsetX.value}px ${v.offsetY.value}px ${v.blur.value}px ${v.spread.value}px rgb(${r} ${g} ${b} / ${c.alpha})`;
    }
    default: return String(v);
  }
}
function переменные(режим, фильтр = () => true, ширина = null) {
  const out = [];
  for (const p of пути) {
    const т = все[p];
    if (!фильтр(p, т)) continue;
    const имя = имяПеременной(p);
    const v = разрешить(все, p, режим, ширина);
    if (т.$type === 'typography') {
      out.push(`${имя}-family: ${cssЗначение({ $type: 'fontFamily' }, v.fontFamily)};`);
      out.push(`${имя}-size: ${v.fontSize.value / 16}rem;`);
      out.push(`${имя}-lh: ${v.lineHeight};`);
      out.push(`${имя}-weight: ${v.fontWeight};`);
    } else out.push(`${имя}: ${cssЗначение(т, v)};`);
  }
  return out;
}
function разница(a, b) { const s = new Set(a); return b.filter((x) => !s.has(x)); }

const базовые = переменные('А-светлая');
const тёмная = разница(базовые, переменные('А-тёмная'));
const бСвет = разница(базовые, переменные('Б-светлая'));
const бТём = разница(переменные('Б-светлая'), переменные('Б-тёмная'));
const вСвет = разница(базовые, переменные('В-светлая'));
const вТём = разница(переменные('В-светлая'), переменные('В-тёмная'));
const типо = (p, т) => т.$type === 'typography';
const второй = переменные('А-светлая', типо, 'второй');
const телефон = переменные('А-светлая', типо, 'телефон');
const второйБ = переменные('Б-светлая', типо, 'второй');
const телефонБ = переменные('Б-светлая', типо, 'телефон');
const второйВ = переменные('В-светлая', типо, 'второй');
const телефонВ = переменные('В-светлая', типо, 'телефон');
const блок = (sel, arr, отступ = '') => `${отступ}${sel} {\n${arr.map((x) => `${отступ}  ${x}`).join('\n')}\n${отступ}}\n`;

let css = `/* СОБРАНО из токены.json скриптом собрать.mjs — не править руками. */\n`;
css += `/* Режимы: data-dir="a|b|v" (направление), data-theme="light|dark" (тема), data-layer="1|2" (слой). */\n\n`;
css += блок(':root', базовые);
css += блок(':root[data-theme="dark"]', тёмная);
css += `@media (prefers-color-scheme: dark) {\n${блок(':root:not([data-theme="light"])', тёмная, '  ')}}\n`;
css += блок(':root[data-dir="b"]', бСвет);
css += блок(':root[data-dir="b"][data-theme="dark"]', бТём);
css += `@media (prefers-color-scheme: dark) {\n${блок(':root[data-dir="b"]:not([data-theme="light"])', бТём, '  ')}}\n`;
css += блок(':root[data-dir="v"]', вСвет);
css += блок(':root[data-dir="v"][data-theme="dark"]', вТём);
css += `@media (prefers-color-scheme: dark) {\n${блок(':root[data-dir="v"]:not([data-theme="light"])', вТём, '  ')}}\n`;
css += `/* Телефон: узкое окно (меньше 37,5 em), 08 § 3.4 */\n`;
css += `@media (max-width: 37.4375em) {\n${блок(':root', телефон, '  ')}${блок(':root[data-dir="b"]', телефонБ, '  ')}${блок(':root[data-dir="v"]', телефонВ, '  ')}}\n`;
css += `/* Второй слой: на листе — у всего документа или у отдельного примера */\n`;
css += блок('[data-layer="2"]', второй);
css += блок('[data-dir="b"] [data-layer="2"], [data-dir="b"][data-layer="2"]', второйБ);
css += блок('[data-dir="v"] [data-layer="2"], [data-dir="v"][data-layer="2"]', второйВ);
writeFileSync(join(ПАПКА, 'токены.css'), css);

// ---------- 2. Проверка сырых значений в CSS компонентов ----------
const СЫРОЕ = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![\w-])\d*\.?\d+(px|rem|em|ms|s|vh|vw)\b/;
let ошибок = 0;
// CSS экранов шага 0 проверяется той же проверкой, если файл уже есть
for (const f of ['основа.css', 'компоненты.css', 'лист.css', '../экраны/каталог/каталог.css', '../экраны/история/история.css']) {
  if (!existsSync(join(ПАПКА, f))) continue;
  const строки = readFileSync(join(ПАПКА, f), 'utf8').split('\n');
  let вFontFace = false;
  строки.forEach((s, i) => {
    if (/@font-face/.test(s)) вFontFace = true;
    if (вFontFace && /\}/.test(s)) { вFontFace = false; return; }
    if (вFontFace) return;
    const чисто = s.replace(/\/\*.*?\*\//g, '');
    if (/@media|@container/.test(чисто)) return; // границы классов окна — в em (08 § 3.4)
    if (СЫРОЕ.test(чисто)) { ошибок++; console.error(`СЫРОЕ ЗНАЧЕНИЕ ${f}:${i + 1}: ${s.trim()}`); }
  });
}

// ---------- 3. Данные листа ----------
const данные = (f) => JSON.parse(readFileSync(join(КОРЕНЬ, 'prototypes/шаг-0/данные', f), 'utf8'));
function стихи(адрес) {
  const out = execFileSync('npm', ['run', '-s', 'verse', '--', адрес], { cwd: КОРЕНЬ, encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean).map((l) => { const [a, t] = l.split('\t'); return { адрес: a, текст: t }; });
}
// главы книг — из synodal.tsv (для «полки» знака приложения и полосы 66 книг)
const книги = [];
for (const l of readFileSync(join(КОРЕНЬ, 'tools/bible/synodal.tsv'), 'utf8').split('\n')) {
  if (!l) continue;
  const [b, c] = l.split('\t');
  const last = книги[книги.length - 1];
  if (!last || last.кн !== b) книги.push({ кн: b, глав: +c });
  else last.глав = Math.max(last.глав, +c);
}
книги.forEach((k, i) => { k.завет = i < 39 ? 'ВЗ' : 'НЗ'; });

const токеныДляЛиста = {};
for (const р of ['А-светлая', 'А-тёмная', 'Б-светлая', 'Б-тёмная', 'В-светлая', 'В-тёмная']) {
  токеныДляЛиста[р] = {};
  for (const p of пути.filter((x) => x.startsWith('роль.цвет.'))) токеныДляЛиста[р][p.slice(10)] = hex(разрешить(все, p, р));
}
const описания = Object.fromEntries(пути.filter((x) => x.startsWith('роль.цвет.')).map((p) => [p.slice(10), все[p].$description || '']));
const кон = отчёт();

const ЛИСТ = {
  собрано: new Date().toISOString().slice(0, 10),
  цвета: токеныДляЛиста,
  описания,
  переменные: Object.fromEntries(пути.filter((x) => x.startsWith('роль.цвет.')).map((p) => [p.slice(10), имяПеременной(p)])),
  контраст: кон.стр,
  кегли: Object.fromEntries(пути.filter((p) => все[p].$type === 'typography').map((p) => [p.slice(11), {
    ноутбук: разрешить(все, p, 'А-светлая'), второй: разрешить(все, p, 'А-светлая', 'второй'), телефон: разрешить(все, p, 'А-светлая', 'телефон'), перем: имяПеременной(p),
  }])),
  книги,
  стихи: {
    'Быт 6:9-22': стихи('Быт 6:9-22'),
    'Быт 1:1': стихи('Быт 1:1'),
    'Мк 2:1-12': стихи('Мк 2:1-12'),
  },
  марк: данные('марк-1-3.json'),
  бытие: данные('бытие.json'),
  ной: данные('ной-и-потоп.json'),
  расслабленный: данные('расслабленный.json'),
};
writeFileSync(join(ПАПКА, 'лист-данные.js'), `// СОБРАНО скриптом собрать.mjs — не править руками.\nwindow.ЛИСТ = ${JSON.stringify(ЛИСТ)};\n`);

console.log(`токены.css: ${базовые.length} переменных; лист-данные.js записан.`);
console.log(`Контраст: ниже нормы — ${кон.ниже}. Сырые значения в CSS: ${ошибок}.`);
if (кон.ниже > 0 || ошибок > 0) process.exit(1);
void латиница;
