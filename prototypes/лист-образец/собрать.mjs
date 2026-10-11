// Сборка листа-образца ред. 3 (08 ред. 3.2, § 10.1):
//   токены.json → токены.css (роли и компоненты; основа в CSS не выходит);
//   данные пробы (dist-data-probe/), стихи (npm run -s verse), эскиз историй (prototypes/шаг-0/данные/) → данные.js;
//   проверка «сырых значений» в CSS листа; скрипт контраста (падает, если пара ниже нормы).
// Запуск из корня проекта: node prototypes/лист-образец/собрать.mjs
// ПРОТОТИП: в продукт не переносится.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ПАПКА, загрузить, плоско, разрешить, hex, имяПеременной } from './токены.mjs';
import { отчёт } from './контраст.mjs';

const КОРЕНЬ = join(ПАПКА, '..', '..');
const ошибки = [];

// ---------- 1. токены.css ----------
const док = загрузить();
const все = плоско(док);
const пути = Object.keys(все).filter((p) => !p.startsWith('основа.'));
const rem = (v) => `${Math.round((v.value / 16) * 10000) / 10000}rem`;
function значение(т, v, путь) {
  switch (т.$type) {
    case 'color': return hex(v);
    case 'dimension':
      if (v.unit !== 'px') return `${v.value}${v.unit}`;
      if (путь.startsWith('линия.')) return v.value === 0 ? '0' : `${v.value}px`; // толщины линий в px: не растут с текстом
      return v.value === 0 ? '0' : rem(v);
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
function переменные(режим, фильтр = () => true) {
  const out = [];
  for (const p of пути) {
    const т = все[p];
    if (!фильтр(p, т)) continue;
    const имя = имяПеременной(p);
    if (т.$type === 'typography') {
      const v = т.$value;
      const тел = режим.includes('телефон') ? т.$extensions?.['app.режимы']?.['телефон'] : null;
      const size = (тел ?? v).fontSize, lh = (тел ?? т.$extensions)['app.строка'];
      const fam = разрешить(все, v.fontFamily.slice(1, -1), []);
      out.push(`${имя}-family: ${значение({ $type: 'fontFamily' }, fam)};`);
      out.push(`${имя}-size: ${rem(size)};`);
      out.push(`${имя}-lh: ${rem(lh)};`);
      out.push(`${имя}-weight: ${v.fontWeight};`);
    } else out.push(`${имя}: ${значение(т, разрешить(все, p, режим), p)};`);
  }
  return out;
}
const разница = (a, b) => { const s = new Set(a); return b.filter((x) => !s.has(x)); };
const блок = (sel, arr, о = '') => (arr.length ? `${о}${sel} {\n${arr.map((x) => `${о}  ${x}`).join('\n')}\n${о}}\n` : '');
const B = переменные([]);
const D = разница(B, переменные(['тёмная']));
const действие = (вар, тема) => переменные(тема ? [вар, 'тёмная'] : [вар], (p) => p === 'цвет.действие');
const типо = (p, т) => т.$type === 'typography' || т.$extensions?.['app.режимы']?.['телефон'] !== undefined;
const Т = разница(переменные([], типо), переменные(['телефон'], типо).concat(разница(переменные([]), переменные(['телефон']))));
const П = разница(B, переменные(['плотная']));
const К = разница(B, переменные(['касание']));
const КП = разница(B, переменные(['касание', 'плотная']));
const ТЁМН = ':root[data-theme="dark"], [data-theme="dark"]';
let css = `/* СОБРАНО из токены.json скриптом собрать.mjs — не править руками. ПРОТОТИП листа-образца ред. 3. */\n`;
css += `/* Режимы: data-theme="light|dark", data-action="киноварь|бирюза|нет", data-density="плотная", data-input="мышь|касание", data-text="крупнее|самый". */\n\n`;
css += блок(':root, [data-theme="light"]', B);
css += блок(ТЁМН, D);
css += `@media (prefers-color-scheme: dark) {\n${блок(':root:not([data-theme="light"])', D, '  ')}}\n`;
for (const [вар, атр] of [['нет', 'нет']]) {
  css += блок(`[data-action="${атр}"]`, действие(вар, false));
  css += блок(`[data-theme="dark"][data-action="${атр}"], [data-theme="dark"] [data-action="${атр}"], [data-action="${атр}"] [data-theme="dark"]`, действие(вар, true));
  css += `@media (prefers-color-scheme: dark) {\n${блок(`:root:not([data-theme="light"]) [data-action="${атр}"], :root:not([data-theme="light"])[data-action="${атр}"]`, действие(вар, true), '  ')}}\n`;
}
css += блок('[data-action="киноварь"]', действие('киноварь', false));
css += блок('[data-theme="dark"][data-action="киноварь"], [data-theme="dark"] [data-action="киноварь"], [data-action="киноварь"] [data-theme="dark"]', действие('киноварь', true));
css += `/* Телефон: узкое окно, меньше 37,5 em (08 § 3.4) */\n@media (max-width: 37.4375em) {\n${блок(':root', переменные(['телефон'], типо), '  ')}}\n`;
css += `/* Плотность (08 § 3.4; 09 § 9.7): кегли не меняются */\n` + блок('[data-density="плотная"]', П);
css += `/* Способ ввода (08 § 3.5): касание — 44–48; на листе можно включить вручную */\n`;
css += `@media (pointer: coarse) {\n${блок(':root:not([data-input="мышь"])', К, '  ')}${блок(':root:not([data-input="мышь"])[data-density="плотная"]', КП, '  ')}}\n`;
css += блок('[data-input="касание"]', К) + блок('[data-input="касание"][data-density="плотная"], [data-input="касание"] [data-density="плотная"]', КП);
const СЕН = разница(B, переменные(['сенсорный']));
css += `/* Сенсорный ноутбук (08 § 3.5): строки 36, главные кнопки и строка инструмента — 44 */\n@media (pointer: fine) and (any-pointer: coarse) {\n${блок(':root:not([data-input])', СЕН, '  ')}}\n`;
css += `/* Размер текста (08 § 3.3.2, § 7.23): размер корня; все кегли в rem */\n`;
css += `:root[data-text="крупнее"] { font-size: 112.5%; }\n:root[data-text="самый"] { font-size: 125%; }\n`;
writeFileSync(join(ПАПКА, 'токены.css'), css);
void Т;

// ---------- 2. Проверка сырых значений в CSS листа ----------
for (const f of ['основа.css', 'компоненты.css', 'лист.css']) {
  const p = join(ПАПКА, f);
  if (!existsSync(p)) continue;
  const текст = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  текст.split('\n').forEach((line, i) => {
    if (/@media|@container|@font-face|src:|unicode-range|@page/.test(line)) return;
    // лист.css — подмости самого листа (ширины колонок листа, шкала ред. 3 для сравнения): в нём ловятся только сырые цвета
    const m = f === 'лист.css' ? line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/) : line.match(/#[0-9a-fA-F]{3,8}\b|(?<![\w-])\d*\.?\d+(px|rem|ms)\b|rgba?\(/);
    if (m) ошибки.push(`${f}:${i + 1}: сырое значение «${m[0]}» — возьмите токен`);
  });
}

// ---------- 3. Данные ----------
const читать = (p) => JSON.parse(readFileSync(join(КОРЕНЬ, p), 'utf8'));
const ПРОБА = 'dist-data-probe';
if (!existsSync(join(КОРЕНЬ, ПРОБА, 'index.json'))) {
  console.error('нет сборки пробы: npm run -s base:bundle -- --probe');
  process.exit(1);
}
const манифест = читать(`${ПРОБА}/manifest.json`);
const индекс = читать(`${ПРОБА}/index.json`);
const карточки01 = читать(`${ПРОБА}/cards/01-antediluvian.json`);
const nodata = читать('base/nodata.json');
const эпохи = читать('base/epochs.json').items.map((e) => ({ id: e.id, имя: e.name, кратко: e.short }));

// стихи: одна команда verse на все адреса
const АДРЕСА = [
  'Быт 1:1', 'Быт 6:9-22', 'Быт 8:7', 'Быт 7:22', 'Быт 2:24', 'Быт 6:1-8',
  'Быт 9:29', 'Быт 11:10-13', 'Быт 11:16-17', 'Быт 5:28-32', 'Мф 1:6', 'Лк 3:31', 'Быт 8:4', 'Евр 11:7', 'Быт 7:13',
  'Пс 114:8-9', 'Притч 29:6', 'Притч 29:27', 'Нав 24:34-36', 'Суд 20:27-28', 'Пс 67:23-24', 'Притч 4:28-29', 'Рим 2:13-15', 'Рим 9:11-12', 'Притч 30:31',
  'Мф 9:1-8', 'Мк 2:1-12', 'Лк 5:17-26', 'Быт 6:14', 'Быт 7:6', 'Быт 7:23',
  'Быт 7:1-24', 'Быт 8:1-22', 'Быт 9:1-17', 'Ис 54:9', 'Мф 24:38', 'Лк 17:27', '1Пет 3:20', '2Пет 2:5',
];
const стихи = {};
const пометкиСтихов = {};
{
  const out = execFileSync('npx', ['tsx', 'tools/verse.ts', ...АДРЕСА], { cwd: КОРЕНЬ, encoding: 'utf8' });
  let последний = null;
  for (const line of out.split('\n')) {
    const m = line.match(/^(\S+ \d+:\d+)\t(.*)$/);
    if (m) { стихи[m[1]] = m[2] === '(стих пуст в электронном тексте)' ? '' : m[2]; последний = m[1]; continue; }
    const w = line.match(/^\s+! (.*)$/);
    if (w && последний) пометкиСтихов[последний] = w[1];
  }
}
// стихи карточки Ноя — из сборки пробы (там только стихи со ссылками)
const стихиПробы = {};
for (const f of readdirSync(join(КОРЕНЬ, ПРОБА, 'verses'))) {
  const v = читать(`${ПРОБА}/verses/${f}`);
  for (const [k, t] of Object.entries(v.verses)) стихиПробы[`${v.book} ${k}`] = t;
}

// скобки: вид по brackets.tsv (02 § 3.8)
const скобки = readFileSync(join(КОРЕНЬ, 'tools/bible/brackets.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => {
  const [книга, глава, с, по, скобка, текст, вид, чем] = l.split('\t');
  return { книга, глава: +глава, с: +с, по: +по, скобка, текст, вид, чем };
});
const скобкиСтиха = (адрес) => {
  const m = адрес.match(/^(\S+) (\d+):(\d+)$/);
  return скобки.filter((s) => s.книга === m[1] && s.глава === +m[2] && s.с <= +m[3] && s.по >= +m[3]);
};
const дефекты = readFileSync(join(КОРЕНЬ, 'tools/bible/source-issues.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => {
  const [книга, глава, с, по, вид, что, делать, чем, состояние] = l.split('\t');
  return { книга, глава: +глава, с: +с, по: +по, вид, что, делать, состояние };
});

// книги: порядок Синодального издания (src/engine/books.ts — только чтение) и число глав из synodal.tsv
const книгиTS = readFileSync(join(КОРЕНЬ, 'src/engine/books.ts'), 'utf8');
const книги = [...книгиTS.matchAll(/\{ code: '([^']+)', name: '([^']+)', gen: '([^']+)', t: '(ot|nt)' \}/g)].map((m) => ({ код: m[1], имя: m[2], род: m[3], завет: m[4] }));
const глав = {};
for (const l of readFileSync(join(КОРЕНЬ, 'tools/bible/synodal.tsv'), 'utf8').split('\n')) {
  const [к, г] = l.split('\t'); if (к && +г > (глав[к] ?? 0)) глав[к] = +г;
}
книги.forEach((к) => { к.глав = глав[к.код]; });
if (книги.length !== 66) ошибки.push(`книг ${книги.length}, ожидалось 66`);

// эскиз историй (шаг 0): разметка одного составителя, не из базы
const бытие = читать('prototypes/шаг-0/данные/бытие.json');
const марк = читать('prototypes/шаг-0/данные/марк-1-3.json');
const ной = читать('prototypes/шаг-0/данные/ной-и-потоп.json');
const расслабленный = читать('prototypes/шаг-0/данные/расслабленный.json');
const каталог = (к) => ({
  книга: к.книга, название: к.название_книги, статус: к.статус, охват: к.охват ?? null,
  повествования: к.повествования.map((п) => ({ id: п.id, название: п.название, истории: п.истории })),
  истории: к.истории.map((и) => ({
    номер: и.номер, id: и.id, название: и.название, адрес: и.адрес, вид: и.вид, стихов: и.стихов,
    частей: (и.части_числа ?? и.части ?? []).length, отклики: (и.отклики ?? []).length,
    сЧегоНачать: !!и.первый_ряд, трудная: (и.трудная ?? []).map((т) => ({ тема: т.тема, стихи: т.стихи })),
    вложена: и.вложена_в ?? null, части: (и.части_числа ?? []).map((ч) => ({ стихи: ч.стихи, название: ч.название, стихов: ч.стихов })),
  })),
});

// лица: семья Ноя и линии Мессии — из индекса пробы
const лицо = (id) => индекс.actors.find((a) => a.id === id);
const лица = Object.fromEntries(['lamekh', 'noy', 'sim', 'kham', 'iafet', 'arfaksad', 'ever', 'iessey', 'david', 'solomon', 'nafan-syn-davida', 'adam', 'eva'].map((id) => [id, лицо(id)]));
for (const [id, a] of Object.entries(лица)) if (!a) ошибки.push(`нет лица ${id} в индексе пробы`);
const линии = Object.fromEntries(Object.entries(индекс.lines).map(([k, l]) => [k, { имя: l.n, вид: l.st, около: (() => { const i = l.ids.indexOf('david'); return l.ids.slice(i - 1, i + 2); })() }]));
const карточкаНоя = карточки01.cards.noy;
const молчание = nodata.items.filter((n) => n.actor === 'p-noy' && n.kind === 'silent').map((n) => ({ раздел: n.sec, прочитано: n.read }));
// стихи всех ссылок карточки Ноя
const ссылкиКарточки = new Set();
const разверни = (ref) => {
  const m = ref.match(/^(\S+) (\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return [];
  const out = []; for (let v = +m[3]; v <= +(m[4] ?? m[3]); v++) out.push(`${m[1]} ${m[2]}:${v}`);
  return out;
};
for (const f of карточкаНоя.f) for (const r of f.v?.refs ?? f.v?.facts?.flatMap((x) => x.refs) ?? []) for (const a of разверни(r)) ссылкиКарточки.add(a);
const стихиКарточки = Object.fromEntries([...ссылкиКарточки].map((a) => [a, стихиПробы[a] ?? null]));

const контр = отчёт();
const данные = {
  проба: { плашка: манифест.banner, уровень: манифест.admitLevel, коммит: манифест.commit, собрано: манифест.built, лиц: индекс.actors.length, союзов: индекс.unions.length, рёбер: индекс.origins.length },
  контраст: контр,
  стихи, пометкиСтихов, стихиКарточки,
  скобки: Object.fromEntries(Object.keys(стихи).map((a) => [a, скобкиСтиха(a).map((s) => ({ текст: s.текст, вид: s.вид, скобка: s.скобка, чем: s.чем }))]).filter(([, v]) => v.length)),
  дефекты,
  книги, эпохи,
  каталоги: { Быт: каталог(бытие), Мк: каталог(марк) },
  ной: { история: ной.история, шапка: ной.шапка, о_чём: ной.о_чём, кто: ной.кто_в_истории, узнать: ной.узнать_больше, где: ной.где_об_этом, дальше: ной.в_книге_дальше, изучающим: ной.для_изучающих },
  расслабленный: { рассказы: расслабленный.рассказы, сцены: расслабленный.история.сцены_второй_слой },
  лица, линии, карточкаНоя, молчание,
  эскиз: 'Эскиз: истории размечены одним составителем шага 0 (prototypes/шаг-0/данные/), второго ключа нет; каталога историй в базе ещё нет (10 § 2)',
};
writeFileSync(join(ПАПКА, 'данные.js'), `// СОБРАНО скриптом собрать.mjs — не править руками. ПРОТОТИП.\nwindow.ДАННЫЕ = ${JSON.stringify(данные)};\n`);

// ---------- 4. Итог ----------
const ниже = контр.filter((x) => !x.ок);
if (ниже.length) ошибки.push(...ниже.map((x) => `контраст ниже нормы: ${x.f} к ${x.b} (${x.тема}) ${x.k}`));
console.log(`токены.css: ${css.split('\n').length} строк; данные.js: ${Math.round(readFileSync(join(ПАПКА, 'данные.js')).length / 1024)} КБ`);
console.log(`стихов прочитано командой verse: ${Object.keys(стихи).length}; стихов карточки из сборки пробы: ${Object.keys(стихиКарточки).length} (нет текста: ${Object.values(стихиКарточки).filter((x) => x === null).length})`);
console.log(`контраст: пар ${контр.length}, ниже нормы ${ниже.length}`);
if (ошибки.length) { console.error(ошибки.join('\n')); process.exit(1); }
console.log('ошибок 0');
