/**
 * Русская типографика в одном месте (docs/ui-review/README.md, B5; CARD-25, 26; VIS-03, 29).
 *
 * typo(s) — одна функция для всех строк: для строк, которые собирает интерфейс (карточка, годы из src/engine/years.ts),
 * и для текстов стихов и цитат при сборке данных (tools/build-data.ts). Правила одни и те же, поэтому стих во вклейке
 * и строка карточки переносятся одинаково.
 * typoTree(node) — то же для узла JSX: typo применяется к каждой строке дерева; абзац не начинается с «;».
 *
 * Правила:
 * — кавычки «ёлочки», внутри — „лапки“; «...» → «…»; дефис или короткое тире между пробелами → «—»;
 * — неразрывный пробел перед тире, после слов из одной-двух букв и перед частицами «ли», «же», «бы»;
 * — неразрывный пробел после «ок.», «см.», «ср.», «род.», «§», «№», после порядкового «1-я», «10-м»; внутри порядкового
 *   после дефиса — U+2060: «34-» / «м колене» не разрываются (U+2011 нет ни в Literata, ни в Jost); перед «=» — неразрывный;
 * — число неотрывно от следующего слова («30 лет», «1 Пар»), год — от «г.» и «гг.», «г. до Р. Х.» — одним куском;
 * — книга неотрывна от главы: «Мф 1», «1 Пар 3:5», и от числа стихов в скобках: «3 Цар (74)»;
 * — отношение неразрывно: «4,5 : 1»;
 * — в диапазоне чисел — «–» (не дефис), после него U+2060 (word joiner): перенос не отрывает конец диапазона;
 * — разряды чисел от пяти цифр — через неразрывный пробел (четырёхзначные неотличимы от годов: их делит num()).
 *
 * Разрядный пробел — обычный неразрывный U+00A0, а не узкий U+202F: ни Literata, ни Jost в поставке атласа не содержат
 * знака U+202F (проверено по таблицам cmap), и браузер взял бы его из системного шрифта с непредсказуемой шириной.
 * U+00A0 есть в обоих шрифтах; его же ставит Intl для русского языка (CLDR ru), так что числа, отформатированные
 * браузером, и числа атласа выглядят одинаково.
 *
 * Функция идемпотентна: typo(typo(s)) === typo(s). Слова и знаки препинания она не меняет — только пробелы,
 * кавычки, тире и многоточие (в отличие от прежнего typograf, который вставлял запятые в стихи: Быт 31:33, 31:50).
 */
import type { ComponentChildren, VNode } from 'preact';
import { BOOKS } from '../../engine/books.ts';

export const NBSP = '\u00a0';
/** Word joiner: запрещает перенос, не занимая места. */
export const WJ = '\u2060';

const L = 'А-Яа-яЁё';
/** Сокращения книг без номера: «Мф», «Пар», «Цар». Длинные — раньше, чтобы «Иоил» не совпал как «Ио». */
const BOOK_ABBR = [...new Set(BOOKS.map((b) => b.code.replace(/^\d/, '')))].sort((a, b) => b.length - a.length).join('|');

const RE = {
  ellipsis: /\.{3}/g,
  // дефис или короткое тире между пробелами (или в начале строки перед пробелом) — это тире
  dash: new RegExp(`(^|[\\s${NBSP}])[-–](?=[\\s${NBSP}])`, 'g'),
  beforeDash: new RegExp(`[ \\t${NBSP}]+—`, 'g'),
  hyphenRange: /(\d)-(?=\d)/g,
  range: new RegExp(`(\\d)–(?!${WJ})(?=\\d)`, 'g'),
  abbr: new RegExp(`(?<![${L}])([Оо]к|[Сс]м|[Сс]р|[Рр]од)\\.[ ${NBSP}]+`, 'g'),
  sign: new RegExp(`([§№])[ ${NBSP}]*(?=\\d)`, 'g'),
  te: new RegExp(`(?<![${L}])т\\.[ ${NBSP}]*([едпн])\\.`, 'g'),
  year: new RegExp(`(\\d)[ ${NBSP}]+(гг?\\.)`, 'g'),
  era: new RegExp(`(?<![${L}])(до|по)[ ${NBSP}]+Р\\.[ ${NBSP}]*Х\\.`, 'g'),
  yearEra: new RegExp(`(\\d|гг?\\.)[ ${NBSP}]+(?=(до|по)${NBSP}Р\\.)`, 'g'),
  // порядковое с наращением неразрывно (CARD-68, UX-12, VIS-54): «34-м» — дефис и U+2060, знака U+2011 нет в шрифтах
  ordinalJoin: new RegExp(`(\\d)-(?=[а-яё]{1,3}(?![а-яё]))`, 'g'),
  ordinal: new RegExp(`(\\d-${WJ}?[а-яё]{1,3})[ ]+`, 'g'),
  // «= 85 лет» не начинает строку: перед «=» неразрывный пробел
  equals: new RegExp(`[ ]+=(?=[ ${NBSP}])`, 'g'),
  numWord: new RegExp(`(?<![\\d:.,–${WJ}])(\\d+)[ ]+(?=[${L}§№])`, 'g'),
  book: new RegExp(`(?<![${L}])(${BOOK_ABBR})[ ]+(?=\\d)`, 'g'),
  // число стихов в скобках неотрывно от книги (VIS-74): «3 Цар (74)», «Быт (1)»
  bookCount: new RegExp(`(?<![${L}])(${BOOK_ABBR})[ ]+(?=\\(\\d)`, 'g'),
  // отношение «4,5 : 1» не разрывается ни до, ни после двоеточия (VIS-74)
  ratio: new RegExp(`(\\d)[ ${NBSP}]+:[ ]+(?=\\d)`, 'g'),
  shortWord: new RegExp(`(?<=^|[\\s(«„\\[—–${NBSP}-])([${L}]{1,2})[ ]+(?=\\S|$)`, 'g'),
  particle: new RegExp(`[ ]+(ли|же|бы|ль|ж|б)(?=[\\s${NBSP}.,;:!?…»)\\]]|$)`, 'g'),
  bigNum: new RegExp(`(?<![\\d:.,–${WJ}])\\d{5,}(?!\\d)`, 'g'),
};

/** Разряды через неразрывный пробел: «12 000». */
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** Число для показа: «2 660», «1 012»; до тысячи — как есть. Для счёта, не для годов. */
export const num = (n: number): string => (Math.abs(n) >= 1000 ? (n < 0 ? '−' : '') + group(String(Math.abs(n))) : String(n));

/** Прямые кавычки → «ёлочки», вложенные → „лапки“; открывающая — в начале строки или после пробела и открывающих знаков. */
function quotes(t: string): string {
  if (!t.includes('"')) return t;
  let depth = 0;
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '«' || c === '„') depth++;
    else if (c === '»' || c === '“') depth = Math.max(0, depth - 1);
    if (c !== '"') {
      out += c;
      continue;
    }
    const prev = i === 0 ? ' ' : t[i - 1];
    if (/[\s(\[«„—–:-]/.test(prev) || prev === NBSP) {
      out += depth === 0 ? '«' : '„';
      depth++;
    } else {
      depth = Math.max(0, depth - 1);
      out += depth === 0 ? '»' : '“';
    }
  }
  return out;
}

/** Русская типографика строки (правила — в описании модуля). */
export function typo(s: string): string {
  if (!s || !/[\s"."\d§№–-]/.test(s)) return s;
  let t = quotes(s);
  t = t.replace(RE.ellipsis, '…');
  t = t.replace(RE.dash, '$1—');
  t = t.replace(RE.beforeDash, `${NBSP}—`);
  t = t.replace(RE.hyphenRange, '$1–');
  t = t.replace(RE.range, `$1–${WJ}`);
  t = t.replace(RE.bigNum, group);
  t = t.replace(RE.abbr, `$1.${NBSP}`);
  t = t.replace(RE.sign, `$1${NBSP}`);
  t = t.replace(RE.te, `т.${NBSP}$1.`);
  t = t.replace(RE.year, `$1${NBSP}$2`);
  t = t.replace(RE.era, `$1${NBSP}Р.${NBSP}Х.`);
  t = t.replace(RE.yearEra, `$1${NBSP}`);
  t = t.replace(RE.ordinalJoin, `$1-${WJ}`);
  t = t.replace(RE.ordinal, `$1${NBSP}`);
  t = t.replace(RE.equals, `${NBSP}=`);
  t = t.replace(RE.numWord, `$1${NBSP}`);
  t = t.replace(RE.book, `$1${NBSP}`);
  t = t.replace(RE.bookCount, `$1${NBSP}`);
  t = t.replace(RE.ratio, `$1${NBSP}:${NBSP}`);
  t = t.replace(RE.shortWord, `$1${NBSP}`);
  t = t.replace(RE.particle, `${NBSP}$1`);
  return t;
}

/** Строка кончается точкой (сокращения «г.», «Р. Х.», многоточия): вторую точку не ставить — «ок. 6 г. до Р. Х.», не «…Х..». */
export const withPeriod = (s: string): string => (/[.…!?]$/.test(s.trimEnd()) ? s.trimEnd() : `${s.trimEnd()}.`);

// ---------- узлы JSX ----------

/** Элементы, текст которых не трогается: подлинник имени (§ 2), номера стихов. */
const RAW = new Set(['bdi', 'sup', 'code', 'canvas', 'script', 'style']);
/** Блоки, с которых начинается строка текста: такой блок не начинается с «;» или «,». */
const BLOCK = new Set(['p', 'li', 'div', 'dd', 'dt', 'h2', 'h3']);
const LEAD = new RegExp(`^[\\s${NBSP}]*[;,][\\s${NBSP}]*`);

type Props = { children?: ComponentChildren };

function walk(n: ComponentChildren): ComponentChildren {
  if (typeof n === 'string') return typo(n);
  if (Array.isArray(n)) return n.map(walk);
  if (n && typeof n === 'object' && 'props' in n) {
    const v = n as VNode<Props>;
    if (typeof v.type === 'string' && RAW.has(v.type)) return v;
    const ch = v.props?.children;
    if (ch !== undefined && ch !== null) {
      // узлы только что созданы этой отрисовкой; typo идемпотентна, поэтому повторный проход ничего не меняет
      v.props.children = walk(ch);
      if (typeof v.type === 'string' && BLOCK.has(v.type)) trimLead(v);
    }
  }
  return n;
}

/** Первая строка блока без ведущего «;»: разделитель остаётся только между частями. */
function trimLead(v: VNode<Props>) {
  const ch = v.props.children;
  if (typeof ch === 'string') v.props.children = ch.replace(LEAD, '');
  else if (Array.isArray(ch)) {
    const i = ch.findIndex((x) => !(x === null || x === undefined || x === false || x === true || x === ''));
    if (i >= 0 && typeof ch[i] === 'string') ch[i] = (ch[i] as string).replace(LEAD, '');
  }
}

/** Типографика узла JSX: typo для каждой строки дерева (внутрь компонентов — через их children). */
export function typoTree<T extends ComponentChildren>(node: T): T {
  return walk(node) as T;
}
