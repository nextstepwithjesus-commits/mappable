// Чтение файла токенов (W3C Design Tokens 2025.10) и разрешение ссылок по режимам.
// Общий модуль для собрать.mjs и контраст.mjs. ПРОТОТИП шага 0: в продукт не переносится.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ПАПКА = dirname(fileURLToPath(import.meta.url));
export const РЕЖИМЫ = ['А-светлая', 'А-тёмная', 'Б-светлая', 'Б-тёмная', 'В-светлая', 'В-тёмная'];

// Порядок поиска значения режима (см. $extensions["app.режимы"] в токены.json).
const ПОРЯДОК = {
  'А-светлая': [],
  'А-тёмная': ['тёмная'],
  'Б-светлая': ['Б'],
  'Б-тёмная': ['Б-тёмная', 'тёмная', 'Б'],
  'В-светлая': ['В'],
  'В-тёмная': ['В-тёмная', 'тёмная', 'В'],
};

export function загрузить() {
  return JSON.parse(readFileSync(join(ПАПКА, 'токены.json'), 'utf8'));
}

// Все токены: путь → объект токена.
export function плоско(дерево, путь = [], итог = {}) {
  for (const [ключ, знач] of Object.entries(дерево)) {
    if (ключ.startsWith('$')) continue;
    if (знач && typeof знач === 'object' && '$value' in знач) итог[[...путь, ключ].join('.')] = знач;
    else if (знач && typeof знач === 'object') плоско(знач, [...путь, ключ], итог);
  }
  return итог;
}

function сырое(токен, режим) {
  const м = токен.$extensions?.['app.режимы'] || {};
  for (const к of ПОРЯДОК[режим]) if (к in м) return м[к];
  return токен.$value;
}

// Разрешить значение (ссылки «{путь}» — рекурсивно, в том же режиме).
export function разрешить(все, путь, режим, ширина = null, глубина = 0) {
  if (глубина > 20) throw new Error('цикл ссылок: ' + путь);
  const т = все[путь];
  if (!т) throw new Error('нет токена: ' + путь);
  let v = сырое(т, режим);
  if (ширина && т.$extensions?.['app.ширины']?.[ширина]) v = т.$extensions['app.ширины'][ширина];
  return развернуть(все, v, режим, глубина);
}

function развернуть(все, v, режим, глубина) {
  if (typeof v === 'string') {
    const m = v.match(/^\{(.+)\}$/);
    return m ? разрешить(все, m[1], режим, null, глубина + 1) : v;
  }
  if (Array.isArray(v)) return v.map((x) => развернуть(все, x, режим, глубина));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [к, x] of Object.entries(v)) o[к] = развернуть(все, x, режим, глубина);
    return o;
  }
  return v;
}

export function hex(v) {
  return typeof v === 'object' && v.hex ? v.hex.toUpperCase() : String(v).toUpperCase();
}

// WCAG 2.x
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function яркость(h) {
  const n = h.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function контраст(a, b) {
  const [x, y] = [яркость(a), яркость(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Пары из файла токенов по всем режимам.
export function проверитьКонтраст(док = загрузить()) {
  const все = плоско(док);
  const пары = док.$extensions['app.контраст'];
  const итог = [];
  for (const п of пары) {
    const стр = { ...п, значения: {} };
    for (const р of РЕЖИМЫ) {
      const f = hex(разрешить(все, 'роль.цвет.' + п.передний, р));
      const b = hex(разрешить(все, 'роль.цвет.' + п.задний, р));
      const k = контраст(f, b);
      стр.значения[р] = { f, b, k: Math.round(k * 100) / 100, ок: п.норма == null || k >= п.норма };
    }
    итог.push(стр);
  }
  return итог;
}

const ТР = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
export function латиница(s) {
  return s.toLowerCase().split('').map((c) => (c in ТР ? ТР[c] : c)).join('')
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
// роль.цвет.чернила-2 → --cvet-chernila-2 ; компонент.обложка.поле → --oblozhka-pole
export function имяПеременной(путь) {
  return '--' + путь.split('.').slice(1).map(латиница).join('-');
}
