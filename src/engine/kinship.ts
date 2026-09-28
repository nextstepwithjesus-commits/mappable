/**
 * Калькулятор родства (ТЗ § 3.7; задача A7 в docs/ui-review/README.md).
 *
 * Кровное родство — пути по связям «родитель — ребёнок». Прямая линия (предок — потомок) исключает боковые пути:
 * они лишь повторяют тот же род через свойство предков. Боковое родство — пары путей вверх к общему предку,
 * не пересекающиеся нигде, кроме него; пара супругов как общие предки даёт один путь, а не два.
 * Перечисляются все пути до кратчайшего + WINDOW поколений; длиннее кратчайшего больше чем на 2 — помечены `more`
 * («ещё N путей» в панели).
 *
 * Фраза собирается целиком, начиная с имени первого лица: «Руфь — прабабушка Давида». Пометы:
 *  — «по толкованию (стих)» — только если на пути есть звено уровня `interpretation` или звено «по Луке»
 *    (Каинан, Нирий → Салафиил): ТЗ § 3.2 называет их звеньями по толкованию;
 *  — «по закону (стих)» — законная связь (Иосиф — Иисус Христос, Мф 1:16);
 *  — «по усыновлению (стих)» — приёмное родство.
 * Одинаковые заголовки различаются лицами, через которые идёт путь: «через Соломона», «через Нафана».
 * Термины Писания (kin) показываются рядом с вычисленными. Свойство — через одно супружество.
 */
import type { Graph, ParentEdge } from './graph.ts';
import type { Cert } from '../data/types.ts';
import { parseRef, BOOK_INDEX } from './books.ts';
// склонение имён — общее с карточкой (src/ui/text/ru.ts: беглые гласные, несклоняемые, описательные имена)
import { nameCase } from '../ui/text/ru.ts';

/** Звено пути: `to` приходится `from` тем, что названо в `term` («сын», «мать», «сестра», «муж»). */
export interface KinStep {
  from: string;
  to: string;
  kind: 'up' | 'down' | 'spouse' | 'kin';
  term: string;
  cert: Cert;
  /** вид утверждения о родстве: natural | legal | adoptive | by-luke | alternative | levirate | ancestor; у kin и spouse — '' */
  claim: string;
  refs: string[];
  /** родословие здесь может пропускать поколения («из сыновей X», пропуск в перечне) */
  gap: boolean;
  interpretive: boolean;
}

/** Лицо цепочки; у всех, кроме первого, — кем оно приходится предыдущему. */
export interface KinLink {
  id: string;
  term?: string;
  step?: KinStep;
}

export interface Qualifier {
  kind: 'adoptive' | 'legal' | 'interpretation';
  refs: string[];
}

export interface Relation {
  kind: 'blood' | 'kin' | 'spouse' | 'in-law';
  term: string; // «прабабушка», «двоюродный брат», «тесть»
  sentence: string; // «Руфь — прабабушка Давида»
  steps: KinStep[];
  chain: KinLink[];
  /** общий предок — только при боковом родстве */
  ancestor: string | null;
  /** общие предки: пара супругов или один предок */
  ancestors: string[];
  lineal: boolean;
  up: number;
  down: number;
  /** число поколений не установлено: на пути есть пропуск */
  open: boolean;
  interpretive: boolean;
  legal: boolean;
  /** лица, отличающие этот путь от других путей той же пары */
  via: string[];
  /** равные по длине обходы, свёрнутые в этот путь: «также через Авессалома и Мааху (3 Цар 15:2)» */
  variants: { ids: string[]; refs: string[] }[];
  /** стихи, на которых стоит путь, по главам: «Мф 1:5-16», «1Пар 3:11-12» */
  sources: string[];
  /** стихи звеньев с пропуском поколений */
  gapRefs: string[];
  qualifiers: Qualifier[];
  /** термин самого Писания (уровень scripture): text — как он записан у другого лица («Саруия — сестра Давида»), null — если это и есть заголовок */
  scripture?: { text: string | null; refs: string[] };
  /** путь длиннее кратчайшего больше чем на 2 поколения: показывается под «ещё N путей» */
  more: boolean;
  /**
   * Путь и линии Мессии (решение 20; CARD-62): mt — целиком по Мф 1 (с участком до Авраама по Быт), lk — по Лк 3,
   * both — по общему участку, mixed — склейка двух родословий; text — помета для читателя. Без линий — не задано.
   */
  line?: { kind: 'mt' | 'lk' | 'both' | 'mixed'; text: string };
}

/** Линии Мессии для «Родства»: последовательности id по data/lines (atlas.lines). */
export interface RelateOptions {
  lines?: { joseph: string[]; mary: string[] };
}

/** Сколько поколений сверх кратчайшего пути ещё перечислять (под «ещё N путей»). */
const WINDOW = 16;
/** Больше путей одной пары не перечисляется. */
const MAX_PATHS = 24;
/** Больше путей сразу не показывается, даже если они не длиннее кратчайшего + 2. */
const SHOW_MAX = 6;


// ---------- падежи ----------

const EXCEPT_GEN: Record<string, string> = { Христос: 'Христа', Павел: 'Павла', Пётр: 'Петра', Петр: 'Петра' };
/** Описательные имена: склоняется только начало («Жена Лота» — «Жены Лота»). [им., род., вин.] */
const HEADS: [string, string, string][] = [
  ['Старшая дочь', 'Старшей дочери', 'Старшую дочь'],
  ['Младшая дочь', 'Младшей дочери', 'Младшую дочь'],
  ['Четыре дочери', 'Четырёх дочерей', 'Четырёх дочерей'],
  ['Семь сынов', 'Семи сынов', 'Семь сынов'],
  ['Жена-Ефиоплянка', 'Жены-Ефиоплянки', 'Жену-Ефиоплянку'],
  ['Жена', 'Жены', 'Жену'],
  ['Дочь', 'Дочери', 'Дочь'],
  ['Мать', 'Матери', 'Мать'],
  ['Сын', 'Сына', 'Сына'],
  ['Сестра', 'Сестры', 'Сестру'],
  ['Наложница', 'Наложницы', 'Наложницу'],
  ['Отец', 'Отца', 'Отца'],
  ['Тёща', 'Тёщи', 'Тёщу'],
];

function genWord(n: string, sex: 'm' | 'f'): string {
  if (EXCEPT_GEN[n]) return EXCEPT_GEN[n];
  if (/[иь]я$/.test(n)) return n.slice(0, -1) + 'и';
  if (/[аеёиоуыэюя]а$/.test(n)) return n; // Иешуа: не склоняется (как в src/ui/text/ru.ts)
  if (/а$/.test(n)) return n.slice(0, -1) + (/[гкхжчшщ]а$/.test(n) ? 'и' : 'ы');
  if (/я$/.test(n)) return n.slice(0, -1) + 'и';
  if (/ь$/.test(n)) return n.slice(0, -1) + (sex === 'f' ? 'и' : 'я');
  if (/й$/.test(n)) return n.slice(0, -1) + 'я';
  if (sex === 'f') return n; // женские на согласный не склоняются (Мириам); на -ь — выше (Рахиль — Рахили)
  if (/[бвгдзклмнпрстфхцчшщж]$/.test(n)) return n + 'а';
  return n;
}

function accWord(n: string, sex: 'm' | 'f'): string {
  if (EXCEPT_GEN[n]) return EXCEPT_GEN[n];
  if (/[аеёиоуыэюя]а$/.test(n)) return n;
  if (/я$/.test(n)) return n.slice(0, -1) + 'ю';
  if (/а$/.test(n)) return n.slice(0, -1) + 'у';
  if (sex === 'f') return n; // Руфь, Мириам
  return genWord(n, sex); // одушевлённые мужского рода: вин. = род.
}

function declineName(name: string, sex: 'm' | 'f', word: (n: string, s: 'm' | 'f') => string, col: 1 | 2): string {
  for (const h of HEADS) {
    if (name === h[0] || name.startsWith(h[0] + ' ')) {
      const rest = name.slice(h[0].length);
      // «Дочь фараонова» — «Дочери фараоновой», «Дочь фараонову»
      const adj = /^ ([а-яё]+)(ова|ева|ина)(?= |$)/.exec(rest);
      const tail = adj ? ` ${adj[1]}${adj[2].slice(0, -1)}${col === 1 ? 'ой' : 'у'}${rest.slice(adj[0].length)}` : rest;
      return (h[col] + tail).replace(/^./, (c) => c.toLowerCase()); // описательное имя — нарицательное: «жены Лота»
    }
  }
  return name
    .split(' ')
    .map((w) => {
      if (w.includes('-')) {
        const parts = w.split('-');
        parts[parts.length - 1] = word(parts[parts.length - 1], sex);
        return parts.join('-');
      }
      return /^[А-ЯЁ]/.test(w) ? word(w, sex) : w;
    })
    .join(' ');
}

const described = (name: string) => HEADS.some((h) => name === h[0] || name.startsWith(h[0] + ' '));

/**
 * Родительный падеж имени: «Давида», «Руфи», «Иисуса Христа», «Павла»; описательные имена — со строчной:
 * «жены Лота», «дочери фараоновой». Сначала — общее склонение (nameCase), если оно не справляется
 * (имя через дефис, согласуемое прилагательное) — правила ниже.
 */
export function genitive(name: string, sex: 'm' | 'f' = 'm'): string {
  return nameCase(name, sex, 'gen', described(name)) ?? declineName(name, sex, genWord, 1);
}

/** Винительный падеж — после «через»: «через Соломона», «через Ревекку», «через Руфь». */
export function accusative(name: string, sex: 'm' | 'f' = 'm'): string {
  return declineName(name, sex, accWord, 2);
}

// ---------- термины ----------

const PRA = (n: number) => 'пра'.repeat(Math.max(0, n));
const ORD = ['', 'родной', 'двоюродный', 'троюродный', 'четвероюродный', 'пятиюродный', 'шестиюродный'];
const ORD_F = ['', 'родная', 'двоюродная', 'троюродная', 'четвероюродная', 'пятиюродная', 'шестиюродная'];
const kolene = (n: number) => `${n === 2 ? 'во' : 'в'}\u00a0${n}-м колене`;

/** Название кровного родства A по отношению к B по (a, b): a поколений от A вверх до общего предка, b — от него вниз до B. */
export function bloodTerm(a: number, b: number, female: boolean, halfSibling?: 'paternal' | 'maternal'): string {
  if (a === 0 && b === 0) return female ? 'она же' : 'он же';
  if (a === 0) {
    // A — предок B
    if (b === 1) return female ? 'мать' : 'отец';
    if (b <= 5) return PRA(b - 2) + (female ? 'бабушка' : 'дед');
    return `${female ? 'прародительница' : 'предок'} ${kolene(b)}`;
  }
  if (b === 0) {
    if (a === 1) return female ? 'дочь' : 'сын';
    if (a <= 5) return PRA(a - 2) + (female ? 'внучка' : 'внук');
    return `потомок ${kolene(a)}`; // «потомок» — общего рода; «потомица» — редкое слово
  }
  const m = Math.min(a, b);
  const diff = b - a; // > 0 — A старше по поколению
  if (m > 6 || Math.abs(diff) > 4) return '';
  if (diff === 0) {
    if (m === 1) {
      if (halfSibling === 'paternal') return female ? 'единокровная сестра' : 'единокровный брат';
      if (halfSibling === 'maternal') return female ? 'единоутробная сестра' : 'единоутробный брат';
      return female ? 'сестра' : 'брат';
    }
    return `${(female ? ORD_F : ORD)[m]} ${female ? 'сестра' : 'брат'}`;
  }
  if (diff > 0) {
    // A — «дядя» разных степеней
    if (diff === 1) return m === 1 ? (female ? 'тётя' : 'дядя') : `${(female ? ORD_F : ORD)[m]} ${female ? 'тётя' : 'дядя'}`;
    const base = PRA(diff - 2) + (female ? 'бабушка' : 'дед');
    return `${(female ? ORD_F : ORD)[Math.min(6, m + 1)]} ${base}`;
  }
  const d = -diff;
  const nephew = d === 1 ? (female ? 'племянница' : 'племянник') : `${d === 2 ? 'внучат' : 'пра'.repeat(d - 2) + 'внучат'}${female ? 'ая племянница' : 'ый племянник'}`;
  return m === 1 ? nephew : `${(female ? ORD_F : ORD)[m]} ${nephew}`;
}

/** Кем лицо `who` приходится по одному звену «родитель — ребёнок» с видом утверждения `claim`. */
function linkTerm(sex: 'm' | 'f', role: 'parent' | 'child', claim: string): string {
  const f = sex === 'f';
  if (claim === 'ancestor') return role === 'parent' ? (f ? 'прародительница' : 'предок') : 'потомок';
  if (role === 'parent') {
    if (claim === 'legal') return f ? 'законная мать' : 'законный отец';
    if (claim === 'adoptive') return f ? 'приёмная мать' : 'приёмный отец';
    return f ? 'мать' : 'отец';
  }
  if (claim === 'legal') return f ? 'дочь по закону' : 'сын по закону';
  if (claim === 'adoptive') return f ? 'приёмная дочь' : 'приёмный сын';
  return f ? 'дочь' : 'сын';
}

/** Термины Писания «брат», «сестра», «брат по отцу» и т. п. */
const SIBLING_TERM = /^(брат|сестра)(?![а-яё])/i; // \b в JS не знает кириллицы
/**
 * Обратные термины Писания: если «А — дочь дяди Б» (Есф 2:7), то Б приходится А двоюродным братом.
 * [мужской, женский] — по полу того, о ком говорится. Термин, которого здесь нет, не обращается.
 */
const INVERSE: Record<string, [string, string]> = {
  брат: ['брат', 'сестра'],
  сестра: ['брат', 'сестра'],
  'младший брат': ['старший брат', 'старшая сестра'],
  родственник: ['родственник', 'родственница'],
  родственница: ['родственник', 'родственница'],
  сродник: ['сродник', 'сродница'],
  сродница: ['сродник', 'сродница'],
  'близкий родственник': ['близкий родственник', 'близкая родственница'],
  'двоюродный брат': ['двоюродный брат', 'двоюродная сестра'],
  'сын дяди': ['двоюродный брат', 'двоюродная сестра'],
  'дочь дяди': ['двоюродный брат', 'двоюродная сестра'],
  дядя: ['племянник', 'племянница'],
  тётка: ['племянник', 'племянница'],
  тётя: ['племянник', 'племянница'],
  племянник: ['дядя', 'тётя'],
  племянница: ['дядя', 'тётя'],
  мать: ['сын', 'дочь'],
  бабка: ['внук', 'внучка'],
};
/** «зять (по толкованию Лк 3:23)» → «зять»: пояснение в скобках — не часть термина. */
const bareRel = (rel: string) => rel.replace(/\s*\(.*\)\s*$/, '');

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const gens = (n: number) => `${n} ${plural(n, 'поколение', 'поколения', 'поколений')}`;
/** «не меньше 3 поколений», «не меньше 21 поколения» */
const gensAtLeast = (n: number) => `не меньше ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'поколения' : 'поколений'}`;

/** Ссылка для текста фразы: «1Пар 2:16» → «1 Пар 2:16» с неразрывными пробелами, дефис диапазона — тире. */
export function refText(ref: string): string {
  return ref.replace(/^([1-4])(\S)/, '$1\u00a0$2').replace(/ /g, '\u00a0').replace(/-/g, '–');
}
/** Несколько ссылок: по порядку книг и стихов, книга не повторяется подряд — «Лк 3:23; 3:27». */
const refsText = (refs: string[]) => {
  const key = (r: string) => {
    const p = parseRef(r);
    const v = p?.verses[0];
    return [p ? BOOK_INDEX.get(p.book) ?? 99 : 99, v ? v.chapter : p?.chapterOnly ?? 0, v ? v.verse : 0];
  };
  const sorted = [...refs].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  let prev = '';
  return sorted
    .map((r) => {
      const book = /^(\S+)\s/.exec(r)?.[1] ?? '';
      const t = book && book === prev ? refText(r).slice(refText(book).length + 1) : refText(r);
      prev = book;
      return t;
    })
    .join('; ');
};

// ---------- основания пути ----------

/**
 * Стихи, на которых стоит путь: наименьший набор глав, покрывающий все звенья (жадно, начиная с главы,
 * где названо больше всего звеньев). В каждой главе — от первого до последнего стиха своих звеньев.
 * Путь по Мф 1 с царями, опущенными в Мф 1:8, даёт «Мф 1:5-16; 1Пар 3:11-12».
 */
function pathSources(steps: KinStep[]): string[] {
  const per = steps.map((s) => {
    const m = new Map<string, { book: string; ch: number; v: number; pos: number }>();
    s.refs.forEach((r, pos) => {
      const p = parseRef(r);
      const v = p?.verses[0];
      if (!p || !v) return;
      const key = `${v.book} ${v.chapter}`;
      const ex = m.get(key);
      if (!ex) m.set(key, { book: v.book, ch: v.chapter, v: v.verse, pos });
      else if (v.verse < ex.v) ex.v = v.verse;
    });
    return m;
  });
  const left = new Set(per.map((_, i) => i).filter((i) => per[i].size));
  const chosen: { key: string; book: string; ch: number; lo: number; hi: number; first: number }[] = [];
  while (left.size) {
    const score = new Map<string, { n: number; pos: number }>();
    for (const i of left) for (const [k, x] of per[i]) {
      const s = score.get(k) ?? { n: 0, pos: 0 };
      s.n++;
      s.pos += x.pos;
      score.set(k, s);
    }
    let best: string | null = null;
    for (const [k, s] of score) {
      const b = best ? score.get(best)! : null;
      if (!b || s.n > b.n || (s.n === b.n && s.pos / s.n < b.pos / b.n)) best = k;
    }
    if (!best) break;
    const c = { key: best, book: '', ch: 0, lo: Infinity, hi: -Infinity, first: Infinity };
    for (const i of [...left]) {
      const x = per[i].get(best);
      if (!x) continue;
      c.book = x.book;
      c.ch = x.ch;
      c.lo = Math.min(c.lo, x.v);
      c.hi = Math.max(c.hi, x.v);
      c.first = Math.min(c.first, i);
      left.delete(i);
    }
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.first - b.first).map((c) => `${c.book} ${c.ch}:${c.lo}${c.hi > c.lo ? `-${c.hi}` : ''}`);
}

/** Стихи звеньев с пропуском поколений, по главам: «Руф 4:21», «Мф 1:13-15». */
function gapSources(steps: KinStep[]): string[] {
  return pathSources(steps.filter((s) => s.gap));
}

function qualifiersOf(steps: KinStep[]): Qualifier[] {
  const out: Qualifier[] = [];
  const add = (kind: Qualifier['kind'], pick: (s: KinStep) => boolean) => {
    const refs = [...new Set(steps.filter(pick).map((s) => s.refs[0]).filter(Boolean))].slice(0, 2);
    if (steps.some(pick)) out.push({ kind, refs });
  };
  add('adoptive', (s) => s.claim === 'adoptive');
  add('legal', (s) => s.claim === 'legal');
  add('interpretation', (s) => s.interpretive);
  return out;
}
const QUAL_WORD: Record<Qualifier['kind'], string> = { adoptive: 'по усыновлению', legal: 'по закону', interpretation: 'по толкованию' };
/** Пометы пути одной фразой: «, по закону (Мф 1:16) и по толкованию (Лк 3:27)» (CARD-62). */
const qualText = (qs: Qualifier[]) => (qs.length ? `, ${qs.map((q) => `${QUAL_WORD[q.kind]}${q.refs.length ? ` (${refsText(q.refs)})` : ''}`).join(' и ')}` : '');

// ---------- пути по графу ----------

const parentEdges = (g: Graph, id: string) => g.parentsOf.get(id) ?? [];

function bfs(g: Graph, start: string, dir: 'up' | 'down'): Map<string, number> {
  const d = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  for (let k = 1; frontier.length; k++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const e of (dir === 'up' ? g.parentsOf : g.childrenOf).get(x) ?? []) {
        const y = dir === 'up' ? e.parent : e.child;
        if (!d.has(y)) {
          d.set(y, k);
          next.push(y);
        }
      }
    }
    frontier = next;
  }
  return d;
}

/**
 * Пути вверх от `from` до `to` длиной ровно `len` звеньев. `rest` — наименьшее число поколений от лица вверх до `to`
 * (обход вниз от `to`), по нему отсекаются заведомо длинные ветви. Лица из `avoid` путь не проходит.
 */
function upPaths(g: Graph, from: string, to: string, len: number, rest: Map<string, number>, avoid: Set<string>, cap: number, out: ParentEdge[][]) {
  const stack: ParentEdge[] = [];
  const on = new Set([from]);
  const rec = (x: string, d: number) => {
    if (out.length >= cap) return;
    if (x === to) {
      if (d === len) out.push([...stack]);
      return;
    }
    for (const e of parentEdges(g, x)) {
      const r = rest.get(e.parent);
      if (r === undefined || d + 1 + r > len || on.has(e.parent) || avoid.has(e.parent)) continue;
      stack.push(e);
      on.add(e.parent);
      rec(e.parent, d + 1);
      on.delete(e.parent);
      stack.pop();
    }
  };
  rec(from, 0);
}

/** Все пути от потомка вверх до предка, от кратчайшего до кратчайшего + WINDOW. */
function linealPaths(g: Graph, anc: string, desc: string): ParentEdge[][] {
  const rest = bfs(g, anc, 'down');
  const s = rest.get(desc);
  if (s === undefined) return [];
  const out: ParentEdge[][] = [];
  for (let len = s; len <= s + WINDOW && out.length < MAX_PATHS; len++) upPaths(g, desc, anc, len, rest, new Set(), MAX_PATHS, out);
  return out;
}

interface Lateral {
  c: string;
  pa: ParentEdge[]; // от A вверх до c
  pb: ParentEdge[]; // от B вверх до c
}

/** Пары путей к общим предкам, не пересекающиеся нигде, кроме предка; от кратчайшей суммы до кратчайшей + WINDOW. */
function lateralPaths(g: Graph, a: string, b: string): Lateral[] {
  const upA = bfs(g, a, 'up');
  const upB = bfs(g, b, 'up');
  const common = [...upA.keys()].filter((c) => c !== a && c !== b && upB.has(c));
  if (!common.length) return [];
  const total = (c: string) => upA.get(c)! + upB.get(c)!;
  common.sort((x, y) => total(x) - total(y));
  const best = total(common[0]);
  const rests = new Map<string, Map<string, number>>();
  const out: Lateral[] = [];
  for (let len = best; len <= best + WINDOW && out.length < MAX_PATHS; len++) {
    for (const c of common) {
      if (total(c) > len || out.length >= MAX_PATHS) continue;
      let rest = rests.get(c);
      if (!rest) rests.set(c, (rest = bfs(g, c, 'down')));
      for (let la = upA.get(c)!; la <= len - upB.get(c)! && out.length < MAX_PATHS; la++) {
        const pas: ParentEdge[][] = [];
        upPaths(g, a, c, la, rest, new Set([b]), MAX_PATHS, pas);
        if (!pas.length) continue;
        const pbs: ParentEdge[][] = [];
        upPaths(g, b, c, len - la, rest, new Set([a]), MAX_PATHS, pbs);
        for (const pa of pas) {
          const na = new Set(pa.map((e) => e.child));
          for (const pb of pbs) {
            if (pb.some((e) => na.has(e.child))) continue;
            out.push({ c, pa, pb });
            if (out.length >= MAX_PATHS) break;
          }
        }
      }
    }
  }
  return out;
}

/**
 * Равные по длине пути, которые расходятся лишь короткими обходами (не длиннее 3 поколений), — один путь:
 * Авия — сын Ровоама и внук Авессалома через мать Мааху (3 Цар 15:2), Зоровавель — сын Салафиила и, по 1 Пар 3:19, Федаии.
 * Первый путь группы (основной) остаётся, остальные становятся его вариантами.
 */
function foldVariants(sorted: Relation[]): Relation[] {
  const reps: Relation[] = [];
  for (const r of sorted) {
    const ids = r.chain.map((c) => c.id);
    let host: Relation | null = null;
    let wins: [number, number][] = [];
    for (const rep of reps) {
      if (rep.steps.length !== r.steps.length || rep.up !== r.up || rep.down !== r.down || rep.lineal !== r.lineal) continue;
      const base = rep.chain.map((c) => c.id);
      const w: [number, number][] = [];
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] === base[i]) continue;
        if (w.length && w[w.length - 1][1] === i - 1) w[w.length - 1][1] = i;
        else w.push([i, i]);
      }
      if (w.every(([a, b]) => b - a < 3)) {
        host = rep;
        wins = w;
        break;
      }
    }
    if (!host) {
      reps.push(r);
      continue;
    }
    for (const [a, b] of wins) {
      const vIds = ids.slice(a, b + 1);
      if (host.variants.some((v) => v.ids.join() === vIds.join())) continue;
      // стих — общий у двух звеньев обхода (Авессалом — Мааха — Авия: 3 Цар 15:2), иначе у звеньев входа и выхода
      const around = r.steps.slice(a - 1, b + 1);
      let refs: string[] = [];
      for (let k = 0; k + 1 < around.length && !refs.length; k++) {
        const shared = around[k].refs.find((x) => around[k + 1].refs.includes(x));
        if (shared) refs = [shared];
      }
      if (!refs.length) refs = [...new Set([around[0]?.refs[0], around[around.length - 1]?.refs[0]].filter((x): x is string => !!x))];
      host.variants.push({ ids: vIds, refs });
    }
  }
  return reps;
}

// ---------- сборка ----------

/**
 * Как путь идёт по линиям Мессии: для каждого звена «родитель — ребёнок» — в какой линии эти два лица соседние.
 * Звенья вне линий допускаются только на концах пути (Руфь — мать Овида); в середине — путь не по линии.
 */
function lineKind(r: Relation, J: Set<string>, M: Set<string>, genOf: (id: string) => string): Relation['line'] {
  const cls = r.steps.map((st) => {
    if (st.kind !== 'up' && st.kind !== 'down') return 'none';
    const k = `${st.from}>${st.to}`;
    const j = J.has(k);
    const m = M.has(k);
    return j && m ? 'both' : j ? 'mt' : m ? 'lk' : 'none';
  });
  let a = 0;
  let b = cls.length - 1;
  while (a <= b && cls[a] === 'none') a++;
  while (b >= a && cls[b] === 'none') b--;
  if (a > b) return undefined;
  const mid = cls.slice(a, b + 1);
  if (mid.includes('none')) return undefined;
  const hasJ = mid.includes('mt');
  const hasM = mid.includes('lk');
  if (!hasJ && !hasM) return { kind: 'both', text: '' };
  if (hasJ && !hasM) return { kind: 'mt', text: 'путь по Матфею (Мф 1)' };
  if (hasM && !hasJ) return { kind: 'lk', text: 'путь по Луке (Лк 3); традиционно — родословие Марии, это толкование' };
  // смешанный путь: участки в порядке поколений (от предка), место перехода — лицо после последнего звена первого участка
  const order = r.down >= r.up ? r.steps.map((st, i) => ({ st, c: cls[i] })) : [...r.steps].reverse().map((st, i, all) => ({ st, c: cls[all.length - 1 - i] }));
  const runs: { c: string; last: string }[] = [];
  for (const { st, c } of order) {
    if (c !== 'mt' && c !== 'lk') continue;
    const tail = r.down >= r.up ? st.to : st.from;
    if (runs.length && runs[runs.length - 1].c === c) runs[runs.length - 1].last = tail;
    else runs.push({ c, last: tail });
  }
  const word = (c: string) => (c === 'mt' ? 'по Матфею' : 'по Луке');
  if (runs.length === 2) return { kind: 'mixed', text: `смешанный путь: до ${genOf(runs[0].last)} — ${word(runs[0].c)}, дальше — ${word(runs[1].c)}` };
  return { kind: 'mixed', text: 'смешанный путь: участки то по Матфею, то по Луке' };
}

export function relate(g: Graph, aId: string, bId: string, maxResults = MAX_PATHS, opts: RelateOptions = {}): Relation[] {
  const A = g.persons.get(aId);
  const Bp = g.persons.get(bId);
  if (!A || !Bp || aId === bId) return [];
  const female = A.sex === 'f';
  const person = (id: string) => g.persons.get(id)!;
  const gen = (id: string) => genitive(person(id).name, person(id).sex);
  const acc = (id: string) => accusative(person(id).name, person(id).sex);
  const gB = gen(bId);
  const start = `${A.name} — `;

  const step = (from: string, e: ParentEdge, dir: 'up' | 'down'): KinStep => {
    const to = dir === 'up' ? e.parent : e.child;
    return {
      from, to, kind: dir, term: linkTerm(person(to).sex, dir === 'up' ? 'parent' : 'child', e.claim),
      cert: e.cert, claim: e.claim, refs: e.refs, gap: e.gap || e.claim === 'ancestor', interpretive: e.cert === 'interpretation' || e.claim === 'by-luke',
    };
  };
  const chainOf = (steps: KinStep[]): KinLink[] => [{ id: aId }, ...steps.map((s) => ({ id: s.to, term: s.term, step: s }))];
  const base = (kind: Relation['kind'], term: string, sentence: string, steps: KinStep[]): Relation => ({
    kind, term, sentence, steps, chain: chainOf(steps), ancestor: null, ancestors: [], lineal: false, up: 0, down: 0,
    open: steps.some((s) => s.gap), interpretive: steps.some((s) => s.interpretive), legal: steps.some((s) => s.claim === 'legal'),
    via: [], variants: [], sources: pathSources(steps), gapRefs: gapSources(steps), qualifiers: qualifiersOf(steps), more: false,
  });

  const direct: Relation[] = [];
  const derived: Relation[] = [];
  // термины Писания: «Иаков — брат Иисуса Христа» (Мф 13:55)
  for (const k of g.kinOf.get(aId) ?? []) {
    if (k.from !== aId || k.to !== bId) continue;
    const term = bareRel(k.rel);
    const s: KinStep = { from: aId, to: bId, kind: 'kin', term: INVERSE[term]?.[person(bId).sex === 'f' ? 1 : 0] ?? '', cert: k.cert, claim: '', refs: k.refs, gap: false, interpretive: k.cert === 'interpretation' };
    const r = base('kin', term, `${start}${term} ${gB}${qualText(qualifiersOf([s]).filter((q) => q.kind === 'interpretation'))}`, [s]);
    if (k.cert === 'scripture') r.scripture = { text: null, refs: k.refs }; // вывод и толкование — не слова Писания
    direct.push(r);
  }
  // тот же термин, записанный у второго лица: «Саруия — сестра Давида» даёт «Давид — брат Саруии»
  for (const k of g.kinOf.get(bId) ?? []) {
    const inv = INVERSE[bareRel(k.rel)];
    if (k.from !== bId || k.to !== aId || !inv) continue;
    const term = inv[female ? 1 : 0];
    const s: KinStep = { from: aId, to: bId, kind: 'kin', term: bareRel(k.rel), cert: k.cert, claim: '', refs: k.refs, gap: false, interpretive: k.cert === 'interpretation' };
    if (direct.some((r) => r.term === term)) continue;
    const r = base('kin', term, `${start}${term} ${gB}${qualText(qualifiersOf([s]).filter((q) => q.kind === 'interpretation'))}`, [s]);
    if (k.cert === 'scripture') r.scripture = { text: `${Bp.name} — ${bareRel(k.rel)} ${gen(aId)}`, refs: k.refs };
    direct.push(r);
  }
  // через брата или сестру, названных так в Писании без общих родителей в данных (Саруия — сестра Давида, 1 Пар 2:16)
  const kinSibs = (id: string) =>
    (g.kinOf.get(id) ?? []).filter((k) => SIBLING_TERM.test(k.rel)).map((k) => ({ other: k.from === id ? k.to : k.from, k }));
  const natural = (id: string) => parentEdges(g, id).filter((e) => e.kind === 'father' || e.kind === 'mother');
  for (const pe of natural(aId)) {
    for (const { other, k } of kinSibs(pe.parent)) {
      if (other !== bId) continue;
      const par = person(pe.parent);
      const term = female ? 'племянница' : 'племянник';
      const tail = `${female ? 'дочь' : 'сын'} ${Bp.sex === 'f' ? 'её' : 'его'} ${par.sex === 'f' ? 'сестры' : 'брата'} ${gen(pe.parent)}`;
      const steps: KinStep[] = [step(aId, pe, 'up'), { from: pe.parent, to: bId, kind: 'kin', term: Bp.sex === 'f' ? 'сестра' : 'брат', cert: k.cert, claim: '', refs: k.refs, gap: false, interpretive: k.cert === 'interpretation' }];
      const r = base('kin', term, '', steps);
      r.sentence = `${start}${term} ${gB} (${tail}, ${refsText(k.refs.slice(0, 1))})${qualText(r.qualifiers)}`;
      r.up = 1;
      derived.push(r);
    }
  }
  for (const pe of natural(bId)) {
    for (const { other, k } of kinSibs(pe.parent)) {
      if (other !== aId) continue;
      const par = person(pe.parent);
      const term = female ? 'тётя' : 'дядя';
      const tail = `${female ? 'сестра' : 'брат'} ${Bp.sex === 'f' ? 'её' : 'его'} ${par.sex === 'f' ? 'матери' : 'отца'} ${gen(pe.parent)}`;
      const steps: KinStep[] = [
        { from: aId, to: pe.parent, kind: 'kin', term: par.sex === 'f' ? 'сестра' : 'брат', cert: k.cert, claim: '', refs: k.refs, gap: false, interpretive: k.cert === 'interpretation' },
        { ...step(pe.parent, pe, 'down') },
      ];
      const r = base('kin', term, '', steps);
      r.sentence = `${start}${term} ${gB} (${tail}, ${refsText(k.refs.slice(0, 1))})${qualText(r.qualifiers)}`;
      r.down = 1;
      derived.push(r);
    }
  }
  // супруги
  const spouses: Relation[] = [];
  for (const s of g.spousesOf.get(aId) ?? []) {
    const other = s.a === aId ? s.b : s.a;
    if (other !== bId) continue;
    const term = female ? (s.kind === 'concubine' ? 'наложница' : 'жена') : 'муж';
    const st: KinStep = { from: aId, to: bId, kind: 'spouse', term: Bp.sex === 'f' ? (s.kind === 'concubine' ? 'наложница' : 'жена') : 'муж', cert: s.cert, claim: '', refs: s.refs, gap: false, interpretive: s.cert === 'interpretation' };
    const r = base('spouse', term, '', [st]);
    r.sentence = `${start}${term} ${gB}${qualText(r.qualifiers)}`;
    spouses.push(r);
  }

  // кровное родство; у бокового родства без названия степени — пояснение после двоеточия
  const blood: Relation[] = [];
  const clause = new Map<Relation, string>();
  const linealUp = linealPaths(g, bId, aId); // A — потомок B
  const linealDown = linealPaths(g, aId, bId); // A — предок B
  for (const [paths, dir] of [[linealUp, 'up'], [linealDown, 'down']] as const) {
    for (const p of paths) {
      // p — от потомка вверх до предка
      const steps = dir === 'up' ? p.map((e) => step(e.child, e, 'up')) : [...p].reverse().map((e) => step(e.parent, e, 'down'));
      const n = steps.length;
      const r = base('blood', '', '', steps);
      r.lineal = true;
      r.up = dir === 'up' ? n : 0;
      r.down = dir === 'down' ? n : 0;
      const special = n === 1 && (steps[0].claim === 'legal' || steps[0].claim === 'adoptive') ? steps[0] : null;
      if (special) {
        // «Иосиф — законный отец Иисуса Христа (Мф 1:16)», «Иисус Христос — сын Иосифа по закону (Мф 1:16)»
        const t = linkTerm(A.sex, dir === 'up' ? 'child' : 'parent', special.claim);
        const [noun, post] = / по закону$/.test(t) ? [t.replace(/ по закону$/, ''), ' по закону'] : [t, ''];
        r.term = t;
        r.sentence = `${start}${noun} ${gB}${post} (${refText(special.refs[0])})${qualText(r.qualifiers.filter((q) => q.kind === 'interpretation'))}`;
      } else {
        let tail = '';
        if (r.open) {
          r.term = dir === 'down' ? (female ? 'прародительница' : 'предок') : 'потомок';
          tail = n === 1 ? '; число поколений не установлено' : ` по меньшей мере ${kolene(n)}`;
        } else {
          const t = dir === 'down' ? bloodTerm(0, n, female) : bloodTerm(n, 0, female);
          r.term = t;
          const m = / ((?:во?)\u00a0\d+-м колене)$/.exec(t);
          if (m) {
            r.term = t.slice(0, m.index);
            tail = ` ${m[1]}`;
          }
        }
        r.sentence = `${start}${r.term} ${gB}${tail}`;
        r.term += tail.startsWith(';') ? '' : tail;
      }
      blood.push(r);
    }
  }
  // боковые пути не показываются при прямой линии (кроме приёмного родства: оно не делает лиц кровными родственниками)
  const hasLineal = blood.some((r) => !r.steps.some((s) => s.claim === 'adoptive'));
  if (!hasLineal) {
    const lat = lateralPaths(g, aId, bId);
    // пара супругов как общие предки — один путь («общие предки — Иаков и Лия»)
    const groups = new Map<string, Lateral[]>();
    for (const x of lat) {
      const key = [...x.pa.map((e) => e.child), '|', ...x.pb.map((e) => e.child)].join(' ');
      const gr = groups.get(key);
      if (gr) gr.push(x);
      else groups.set(key, [x]);
    }
    for (const gr of groups.values()) {
      gr.sort((x, y) => (person(x.c).sex === 'm' ? 0 : 1) - (person(y.c).sex === 'm' ? 0 : 1));
      const x = gr[0];
      const la = x.pa.length;
      const lb = x.pb.length;
      const steps = [...x.pa.map((e) => step(e.child, e, 'up')), ...[...x.pb].reverse().map((e) => step(e.parent, e, 'down'))];
      const r = base('blood', '', '', steps);
      r.ancestor = x.c;
      r.ancestors = [...new Set(gr.map((y) => y.c))];
      r.up = la;
      r.down = lb;
      let half: 'paternal' | 'maternal' | undefined;
      if (la === 1 && lb === 1 && r.ancestors.length === 1) {
        const fa = natural(aId);
        const fb = natural(bId);
        const sameF = fa.some((e) => e.kind === 'father' && fb.some((f) => f.kind === 'father' && f.parent === e.parent));
        const sameM = fa.some((e) => e.kind === 'mother' && fb.some((f) => f.kind === 'mother' && f.parent === e.parent));
        if (sameF && !sameM && fa.some((e) => e.kind === 'mother') && fb.some((e) => e.kind === 'mother')) half = 'paternal';
        if (sameM && !sameF && fa.some((e) => e.kind === 'father') && fb.some((e) => e.kind === 'father')) half = 'maternal';
      }
      const t = r.open ? '' : bloodTerm(la, lb, female, half);
      r.term = t || (female ? 'родственница' : 'родственник');
      r.sentence = `${start}${r.term} ${gB}`;
      if (!t) {
        const who = r.ancestors.length > 1 ? `общие предки — ${r.ancestors.map((c) => person(c).name).join(' и ')}` : `общий предок — ${person(x.c).name}`;
        const openA = r.steps.slice(0, la).some((s) => s.gap);
        const openB = r.steps.slice(la).some((s) => s.gap);
        const count = openA && openB ? 'число поколений не установлено' : `${openA ? gensAtLeast(la) : gens(la)} вверх, ${openB ? 'не меньше ' : ''}${lb} вниз`;
        clause.set(r, `: ${who}; ${count}`);
      }
      blood.push(r);
    }
  }
  // основной путь из равных — по отцам и по основному утверждению о родителях; обходы через матерей и иные указания — вариантами
  const detour = (st: KinStep) => (st.kind === 'up' || st.kind === 'down') && (person(st.kind === 'up' ? st.to : st.from).sex === 'f' || !['natural', 'legal'].includes(st.claim));
  const score = (r: Relation) => r.steps.filter(detour).length;
  // кровные пути — прежде путей через усыновление (Ефрем — внук Иакова прежде «приёмного сына», Быт 48:5)
  const adopted = (r: Relation) => Number(r.steps.some((st) => st.claim === 'adoptive'));
  blood.sort((x, y) => adopted(x) - adopted(y) || x.steps.length - y.steps.length || Number(x.interpretive) - Number(y.interpretive) || score(x) - score(y));
  const reps = foldVariants(blood);
  blood.length = 0;
  blood.push(...reps);

  // одинаковые заголовки различаются лицами пути: первое лицо, которого нет в другом пути
  if (blood.length > 1) {
    const sets = blood.map((r) => new Set([...r.chain.map((c) => c.id), ...r.ancestors, ...r.variants.flatMap((v) => v.ids)]));
    blood.forEach((r, i) => {
      const inner = r.chain.slice(1, -1).map((c) => c.id);
      const via = new Set<string>();
      blood.forEach((_, j) => {
        if (j === i) return;
        const d = inner.find((id) => !sets[j].has(id));
        if (d) via.add(d);
      });
      r.via = inner.filter((id) => via.has(id)).slice(0, 2);
    });
  }
  for (const r of blood) {
    // «Иосиф — законный отец Иисуса Христа (Мф 1:16)»: помета уже в термине
    if (r.steps.length === 1 && r.sentence.endsWith(')')) continue;
    const via = r.via.length ? `, через ${r.via.map(acc).join(' и ')}` : '';
    r.sentence += via + qualText(r.qualifiers) + (clause.get(r) ?? '');
  }
  // пути по линиям Мессии (решение 20; CARD-62, UX-47): первыми — целиком по Мф 1 и по Лк 3, смешанные — под «ещё»
  let byLine = false;
  if (opts.lines && blood.length > 1) {
    const adj = (seq: string[]) => {
      const out = new Set<string>();
      for (let i = 1; i < seq.length; i++) out.add(`${seq[i - 1]}>${seq[i]}`).add(`${seq[i]}>${seq[i - 1]}`);
      return out;
    };
    const J = adj(opts.lines.joseph);
    const M = adj(opts.lines.mary);
    for (const r of blood) r.line = lineKind(r, J, M, gen);
    byLine = blood.some((r) => r.line?.kind === 'mt' || r.line?.kind === 'lk');
    if (byLine) {
      const rank = (r: Relation) => ({ mt: 0, lk: 1, both: 2, mixed: 4 })[r.line?.kind ?? 'both'] ?? 3;
      blood.sort((x, y) => rank(x) - rank(y));
    }
  }
  // пути длиннее кратчайшего больше чем на 2 поколения — под «ещё N путей»; при линиях Мессии — и смешанные
  const shortest = (blood.find((r) => !adopted(r)) ?? blood[0])?.steps.length ?? 0;
  let shownCount = 0;
  for (const r of blood) {
    const pure = byLine && (r.line?.kind === 'mt' || r.line?.kind === 'lk');
    r.more = byLine ? !pure : r.steps.length > shortest + 2 || shownCount >= SHOW_MAX;
    if (!r.more) shownCount++;
  }
  // «брат» в Писании и родные братья в данных — одно родство: термин Писания становится пометой при нём
  const siblingBlood = blood.find((r) => r.up === 1 && r.down === 1 && !r.lineal);
  const kinOut = direct.filter((r) => {
    if (siblingBlood && SIBLING_TERM.test(r.term) && r.scripture) {
      siblingBlood.scripture = r.scripture;
      return false;
    }
    return true;
  });

  // свойство через одно супружество
  const inLaw: Relation[] = [];
  const all = () => [...kinOut, ...spouses, ...blood, ...derived, ...inLaw];
  const addInLaw = (term: string, tail: string, steps: KinStep[]) => {
    if (all().some((r) => r.term === term)) return;
    const r = base('in-law', term, '', steps);
    r.sentence = `${start}${term} ${gB} (${tail})${qualText(r.qualifiers)}`;
    inLaw.push(r);
  };
  const spouseEdges = (id: string) => (g.spousesOf.get(id) ?? []).map((s) => ({ id: s.a === id ? s.b : s.a, s }));
  const childrenOf = (id: string) => (g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother');
  const sibOf = (id: string) => [...new Set(natural(id).flatMap((e) => childrenOf(e.parent).map((c) => c.child)))].filter((x) => x !== id);
  const bMale = Bp.sex === 'm';
  const pron = bMale ? 'его' : 'её';
  const spStep = (from: string, to: string, s: { cert: Cert; refs: string[]; kind: string }): KinStep => ({
    from, to, kind: 'spouse', term: person(to).sex === 'f' ? (s.kind === 'concubine' ? 'наложница' : 'жена') : 'муж', cert: s.cert, claim: '', refs: s.refs, gap: false, interpretive: s.cert === 'interpretation',
  });
  const sibStep = (from: string, to: string): KinStep => ({ from, to, kind: 'kin', term: person(to).sex === 'f' ? 'сестра' : 'брат', cert: 'scripture', claim: '', refs: [], gap: false, interpretive: false });
  for (const { id: s, s: se } of spouseEdges(bId)) {
    const sp = bMale ? 'жены' : 'мужа';
    for (const pe of natural(s)) {
      if (pe.parent !== aId) continue;
      const term = bMale ? (female ? 'тёща' : 'тесть') : female ? 'свекровь' : 'свёкор';
      addInLaw(term, `${female ? 'мать' : 'отец'} ${pron} ${sp} ${gen(s)}`, [step(aId, pe, 'down'), spStep(s, bId, se)]);
    }
    if (sibOf(s).includes(aId)) {
      const term = bMale ? (female ? 'свояченица' : 'шурин') : female ? 'золовка' : 'деверь';
      addInLaw(term, `${female ? 'сестра' : 'брат'} ${pron} ${sp} ${gen(s)}`, [sibStep(aId, s), spStep(s, bId, se)]);
    }
  }
  for (const ce of childrenOf(bId)) {
    const c = ce.child;
    const se = spouseEdges(c).find((x) => x.id === aId);
    if (!se) continue;
    const term = female ? 'невестка' : 'зять';
    const up: KinStep = { ...step(c, ce, 'up'), from: c, to: bId };
    addInLaw(term, `${female ? 'жена' : 'муж'} ${pron} ${person(c).sex === 'f' ? 'дочери' : 'сына'} ${gen(c)}`, [spStep(aId, c, se.s), up]);
  }
  for (const s of sibOf(bId)) {
    const se = spouseEdges(s).find((x) => x.id === aId);
    if (!se) continue;
    const term = female ? 'невестка' : 'зять';
    addInLaw(term, `${female ? 'жена' : 'муж'} ${pron} ${person(s).sex === 'f' ? 'сестры' : 'брата'} ${gen(s)}`, [spStep(aId, s, se.s), sibStep(s, bId)]);
  }

  return all().slice(0, maxResults);
}

/** Длинная цепочка сворачивается: первые `keep` звеньев, «… ещё N …», последние `keep`. */
export function foldChain<T>(items: T[], max = 8, keep = 3): (T | { hidden: number })[] {
  if (items.length <= max) return items;
  return [...items.slice(0, keep), { hidden: items.length - 2 * keep }, ...items.slice(-keep)];
}
