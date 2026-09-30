/**
 * Модели хронологии и слои неба словами (этап 13, решения 102 и 111; STAGE13 § 5, контракт 5).
 *
 *  — «Строка модели» для строки показа (src/ui/sky/ShowBar.tsx рисует её, T6): «Годы — по модели «Краткое
 *    пребывание» — вернуть основную». При модели по умолчанию строки нет (modelBar = null).
 *  — «Скрыто: связи — вернуть» — выключенные слои неба (layersBar = null, если все слои включены).
 *  — Сводка для списка моделей в листе «Вид» (src/ui/sky/Controls.tsx): название, входные числа, «Меняет»,
 *    «Напряжения»; под списком — строка про Исход (modelsFoot).
 *
 * Числа сводки считает сборка (контракт 1, T3: modelInfo в src/data/atlas.ts — сдвинуто лиц, годы опорных событий,
 * напряжения, лица после Исхода); одно место чтения — factsOf.
 */
import { computed } from '@preact/signals';
import { modelInfo } from '../data/atlas.ts';
import { layers, modelId, restoreLayers, LAYER_NAMES, layersOff } from '../state.ts';
import { dateText, toAstro } from '../engine/years.ts';
import type { ModelEventId } from '../engine/chronology.ts';

/** Модель по умолчанию (ТЗ § 8.1). */
export const DEFAULT_MODEL = 'mt-long';

/** Опорные события сводки — в порядке времени (engine/chronology.ts, ModelEventId). */
export type ModelEvent = ModelEventId;
const EVENT_WORD: Record<ModelEvent, string> = { adam: 'сотворение', flood: 'Потоп', abram: 'Аврам', egypt: 'вход в Египет', exodus: 'Исход' };
/** «до …» — граница, до которой модель меняет годы: первое событие, которое она не трогает. */
const UNTIL_WORD: Record<ModelEvent, string> = { adam: 'сотворения', flood: 'Потопа', abram: 'рождения Аврама', egypt: 'входа в Египет', exodus: 'Исхода' };
const EVENTS: ModelEvent[] = ['adam', 'flood', 'abram', 'egypt', 'exodus'];

/**
 * Сводка одной модели для показа — из modelInfo (контракт 1). Годы — исторические (−1446 = 1446 г. до Р. Х.).
 * shifted — сколько лиц получают в этой модели другой год, чем в модели по умолчанию; afterExodus — сколько из них
 * после Исхода и почему.
 */
export interface ModelFacts {
  id: string;
  name: string;
  short: string;
  description: string;
  shifted?: number;
  years?: Partial<Record<ModelEvent, number>>;
  tensions?: number;
  afterExodus?: { count: number; notes: string[] };
}

/**
 * «родословие без лиц с годами после Исхода: …от предка, жившего до Исхода — Шегараим» ×N → одна строка: общая часть и
 * предки. Группы со сдвигом 0 (годы те же) не считаются.
 */
function afterExodusOf(groups: readonly { ids: string[]; shift: [number, number]; why: string }[]): ModelFacts['afterExodus'] {
  const moved = groups.filter((g) => g.shift[0] !== 0 || g.shift[1] !== 0);
  if (!moved.length) return undefined;
  const part = (w: string, k: number) => w.split(/[\s\u00a0]—[\s\u00a0]/)[k];
  const heads = [...new Set(moved.map((g) => part(g.why, 0)).filter(Boolean))];
  const names = [...new Set(moved.map((g) => part(g.why, 1)).filter(Boolean))];
  const list = names.length > 4 ? `${names.slice(0, 4).join(', ')} и ещё ${names.length - 4}` : names.join(', ');
  return { count: moved.reduce((n, g) => n + g.ids.length, 0), notes: heads.map((h, i) => (i === heads.length - 1 && list ? `${h} — ${list}` : h)) };
}

/** Сводка модели — поля сборки (контракт 1: modelInfo в src/data/atlas.ts). */
export function factsOf(id: string): ModelFacts | null {
  const m = modelInfo.find((x) => x.id === id);
  if (!m) return null;
  const years: Partial<Record<ModelEvent, number>> = {};
  for (const e of m.events ?? []) years[e.id] = e.year;
  const ax = afterExodusOf(m.afterExodus ?? []);
  return {
    id,
    name: m.name,
    short: m.short || m.name.split(':')[0],
    description: m.description,
    shifted: m.shifted,
    ...(Object.keys(years).length ? { years } : {}),
    tensions: m.tensions,
    ...(ax ? { afterExodus: ax } : {}),
  };
}

/** Название модели: «Основной текст: 430 лет в Египте», «Краткое пребывание: 215 лет в Египте». */
export const modelName = (id: string): string => factsOf(id)?.name ?? id;
/** Короткое имя: «Основной текст», «Краткое пребывание», «Числа в скобках», «Фарре 70 лет». */
export const modelShort = (id: string): string => factsOf(id)?.short ?? id;

// ---------- годы — словарём дат (контракт 4, src/engine/years.ts) ----------

/** «3959 г. до Р. Х.» — исторический год. */
const yearText = (hist: number): string => dateText({ t: toAstro(hist) });
/**
 * Перечень «сотворение — 3959, Потоп — 2303 г. до Р. Х.»: эра один раз в конце, если все годы одной эры (словарь 96),
 * иначе у каждого года.
 */
function yearsList(items: [string, number][]): string {
  if (!items.length) return '';
  const oneEra = items.every(([, h]) => h < 0) || items.every(([, h]) => h > 0);
  if (!oneEra) return items.map(([w, h]) => `${w} — ${yearText(h)}`).join(', ');
  const last = items[items.length - 1];
  return [...items.slice(0, -1).map(([w, h]) => `${w} — ${Math.abs(h)}`), `${last[0]} — ${yearText(last[1])}`].join(', ');
}

/** Точка в конце предложения, если её нет: «… г. до Р. Х.» не получает второй. */
const end = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
const many = (n: number, one: string, few: string, lots: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return a > 10 && a < 20 ? lots : b === 1 ? one : b >= 2 && b <= 4 ? few : lots;
};
const persons = (n: number) => `${n} ${many(n, 'лицо', 'лица', 'лиц')}`;
const yearsN = (n: number) => `${n} ${many(n, 'год', 'года', 'лет')}`;

// ---------- что меняет модель ----------

/** Что модель делает с опорными годами против модели по умолчанию. null — модель по умолчанию или нет сводки. */
export interface ModelShift {
  /** до какого события модель меняет годы: «до Исхода», «до рождения Аврама» */
  until: string;
  /** «на 215 лет позже», «на 60 лет позже», «раньше» */
  how: string;
  /** изменённые годы: «сотворение — 3959, Потоп — 2303, Аврам — 1951, вход в Египет — 1661 г. до Р. Х.» */
  years: string;
}
export function modelShift(id: string): ModelShift | null {
  if (id === DEFAULT_MODEL) return null;
  const a = factsOf(DEFAULT_MODEL)?.years;
  const b = factsOf(id)?.years;
  if (!a || !b) return null;
  const changed = EVENTS.filter((e) => a[e] !== undefined && b[e] !== undefined && a[e] !== b[e]);
  if (!changed.length) return null;
  const first = EVENTS.find((e) => !changed.includes(e) && EVENTS.indexOf(e) > EVENTS.indexOf(changed[changed.length - 1]));
  // годы исторические, нулевого года нет: разность — в астрономических
  const deltas = changed.map((e) => toAstro(b[e]!) - toAstro(a[e]!));
  const same = deltas.every((d) => d === deltas[0]);
  const how = same ? `на ${yearsN(Math.abs(deltas[0]))} ${deltas[0] > 0 ? 'позже' : 'раньше'}` : deltas.every((d) => d > 0) ? 'позже' : 'раньше';
  // «всё до Исхода — на 215 лет позже», «годы до рождения Аврама — раньше»
  return { until: first ? `до ${UNTIL_WORD[first]}` : '', how, years: yearsList(changed.map((e) => [EVENT_WORD[e], b[e]!])) };
}

/** Пункт списка моделей (решение 102). */
export interface ModelItem {
  id: string;
  name: string;
  /** входные числа модели — описание из данных */
  inputs: string;
  /** «Меняет: 640 лиц; годы до Исхода — на 215 лет позже: сотворение — 3959, … г. до Р. Х.»; у модели по умолчанию — null */
  changes: string | null;
  /** «Напряжения: 6 (в основной модели — 23)» */
  tensions: string | null;
  /** у модели по умолчанию — её опорные годы: «Годы: сотворение — 4174, Потоп — 2518, … г. до Р. Х.» */
  years: string | null;
}

export function modelItem(id: string): ModelItem | null {
  const f = factsOf(id);
  if (!f) return null;
  const s = modelShift(id);
  const base = factsOf(DEFAULT_MODEL);
  let changes: string | null = null;
  if (id !== DEFAULT_MODEL) {
    const who = f.shifted !== undefined ? persons(f.shifted) : '';
    const what = s ? `годы ${s.until} — ${s.how}: ${s.years}` : '';
    changes = who || what ? `Меняет: ${[who, what].filter(Boolean).join('; ')}` : null;
    const ax = f.afterExodus;
    if (changes && ax && ax.count > 0) changes = `${end(changes)} После Исхода — ещё ${persons(ax.count)}${ax.notes.length ? `: ${ax.notes.join('; ')}` : ''}`;
    if (changes) changes = end(changes);
  }
  let tensions: string | null = null;
  if (f.tensions !== undefined) {
    const other = id !== DEFAULT_MODEL && base?.tensions !== undefined && base.tensions !== f.tensions ? ` (в основной модели — ${base.tensions})` : '';
    tensions = end(`Напряжения: ${f.tensions}${other}`);
  }
  const ys = f.years ?? {};
  const years =
    id === DEFAULT_MODEL && Object.keys(ys).length
      ? end(`Годы: ${yearsList(EVENTS.filter((e) => e !== 'exodus' && ys[e] !== undefined).map((e) => [EVENT_WORD[e], ys[e]!]))}`)
      : null;
  return { id, name: f.name, inputs: f.description, changes, tensions, years };
}

/** Все пункты списка моделей — в порядке данных. */
export const modelItems = (): ModelItem[] => modelInfo.map((m) => modelItem(m.id)).filter((x): x is ModelItem => !!x);

/**
 * Строка под списком моделей (решение 102): «Во всех моделях одинаковы Исход (1446 г. до Р. Х.) и годы после него:
 * 3 Цар 6:1 и опора 967 г.». Исключения — модели, которые сдвигают лица и после Исхода, — названы.
 */
export function modelsFoot(): string {
  const ex = factsOf(DEFAULT_MODEL)?.years?.exodus ?? -1446;
  let t = `Во всех моделях одинаковы Исход (${yearText(ex)}) и годы после него: 3 Цар 6:1 и опора 967 г. до Р. Х.`;
  const odd = modelInfo
    .map((m) => factsOf(m.id)!)
    .filter((f) => f.id !== DEFAULT_MODEL && (f.afterExodus?.count ?? 0) > 0);
  if (odd.length)
    t += ` Исключения — лица родословий без датированных звеньев: ${odd
      .map((f) => `в модели «${modelShort(f.id)}» — ${persons(f.afterExodus!.count)}`)
      .join(', ')}.`;
  return t;
}

// ---------- строка показа: модель и слои (контракт 5; рисует src/ui/sky/ShowBar.tsx) ----------

/**
 * Часть строки показа: текст, короткая форма (узкое небо), пояснение (подсказка и диктор), команда и её действие.
 * Строка показа ставит её после «На небе: …» отдельным предложением: «Годы — по модели «Краткое пребывание» —
 * вернуть основную».
 */
export interface BarLine {
  key: 'model' | 'layers';
  text: string;
  short: string;
  hint: string;
  cmd: string;
  run: () => void;
}

/** Вернуть модель по умолчанию. */
export function resetModel() {
  modelId.value = DEFAULT_MODEL;
}

/**
 * Строка модели (решение 102): название выбранной модели ушло из строки эпох на линейке сюда. null — модель по умолчанию.
 * «Годы — по модели «Краткое пребывание» — вернуть основную»; пояснение — что именно модель меняет и что остаётся.
 */
export const modelBar = computed<BarLine | null>(() => {
  const id = modelId.value;
  if (id === DEFAULT_MODEL || !factsOf(id)) return null;
  const s = modelShift(id);
  const ex = factsOf(DEFAULT_MODEL)?.years?.exodus ?? -1446;
  const hint = [
    `Годы — по модели «${modelName(id)}».`,
    s ? end(`Другие годы ${s.until}: ${s.years}`) : '',
    `Исход (${yearText(ex)}) и годы после него — как в основной модели: 3 Цар 6:1 и опора 967 г. до Р. Х.`,
  ]
    .filter(Boolean)
    .join(' ');
  return { key: 'model', text: `Годы — по модели «${modelShort(id)}»`, short: `модель «${modelShort(id)}»`, hint, cmd: 'вернуть основную', run: resetModel };
});

/**
 * Выключенные слои неба (решение 111): «Скрыто: связи, подписи — вернуть». null — все слои включены. Выбор слоёв —
 * в листе «Вид» → «Слои»; «вернуть» включает все.
 */
export const layersBar = computed<BarLine | null>(() => {
  void layers.value;
  const off = layersOff.value;
  if (!off.length) return null;
  const names = off.map((k) => LAYER_NAMES[k]);
  return {
    key: 'layers',
    text: `Скрыто: ${names.join(', ')}`,
    short: off.length === 1 ? `Скрыто: ${names[0]}` : `Скрыто: ${off.length} ${many(off.length, 'слой', 'слоя', 'слоёв')}`,
    hint: `Слои неба выключены в листе «Вид»: ${names.join(', ')}. «Вернуть» включает все слои.`,
    cmd: 'вернуть',
    run: restoreLayers,
  };
});

/** Обе части строки показа по порядку: модель, затем слои. */
export const barLines = computed<BarLine[]>(() => [modelBar.value, layersBar.value].filter((x): x is BarLine => !!x));
