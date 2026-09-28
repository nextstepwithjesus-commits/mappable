/**
 * Хронологический решатель (ТЗ § 8.1–8.2).
 *
 * 1. Жёсткие равенства — только числа текста: возраст отца/матери при рождении, смещение от другого лица,
 *    возраст при смерти, возраст при воцарении, явные годы. Они объединяются в «жёсткие компоненты»
 *    (объединение с весами), внутри которых относительные годы известны точно.
 * 2. Компонента, связанная с опорой модели или явным годом, закреплена. Остальные компоненты сдвигаются
 *    как целое мягкими ограничениями (поколение, жизнь родителя, эпоха, годы служения, порядок братьев, супруги),
 *    решаемыми взвешенными наименьшими квадратами: проходы Гаусса — Зейделя дают начальное приближение, полугладкий
 *    метод Ньютона (newtonPolish) доводит его до минимума.
 * 3. Неопределённость — по модели случайного блуждания длины поколения между опорами.
 * 4. Там, где числа текста противоречат друг другу, решатель не падает, а записывает «напряжение».
 *
 * Этап 7 (K1; решения владельца 21, 23, 24):
 *  — эпохи строятся в годах модели (engine/epochs.ts): границы, заданные числами Писания, сдвигаются вместе с моделью;
 *  — супруги — одного поколения: рождение жены в пределах [муж − 15; муж + 30] (в эпохах долгих поколений — шире);
 *    нарушение — напряжение в карточках обоих (CARD-61);
 *  — братья и сёстры не рождаются в один год: младшие не раньше старших с шагом не меньше года, по порядку
 *    перечисления, если своих дат нет (MAP-54);
 *  — жизнь «до последнего упоминания» длиннее предела жизни эпохи — напряжение «родословие, вероятно, называет не все
 *    поколения» (толкование) и разрыв следа на небе (MAP-51);
 *  — лицо «время не установлено» — скобка засвидетельствованной деятельности или эпохи, звезда — в её середине (MAP-52);
 *  — верхний край промежутка рождения — не позже смерти и первого засвидетельствованного события (MAP-53);
 *  — у народов и родов нет года рождения: named (CARD-59).
 *
 * Этап 7, круг 3 (L1; решение владельца 38):
 *  — у лица Нового Завета без чисел текста с промежутком рождения шире 40 лет знак стоит у первого засвидетельствованного
 *    года (mark; MAP-69); тесть и тёща старше зятя на поколение (KIN_GENS; Ин 18:13);
 *  — начало служения и царствования — не моложе наименьшего возраста роли (ROLE_MIN_AGE; MAP-53);
 *  — лицо живо в год каждого своего события с годом; свой год смерти не сдвигается округлением рождения (dAge; CARD-79).
 *
 * Все годы внутри — астрономические.
 */
import type { Person, Epoch, Role } from '../data/types.ts';
import { type Graph, fatherOf, motherOf, primaryChildren } from './graph.ts';
import { toAstro, yearsWord, formatYear } from './years.ts';
import { modelEpochs } from './epochs.ts';
import { BOOKS } from './books.ts';
import { firstRefOf } from './layout.ts';

/** Эпохи долгих жизней (Быт 5; 11): возраст матери за 60 там не противоречие. */
const LONG_LIVES = new Set(['antediluvian', 'postdiluvian']);

/** «1 поколение», «4 поколения», «5 поколений». */
const gens = (n: number) => {
  const a = n % 100;
  const b = n % 10;
  return `${n}\u00a0${a > 10 && a < 20 ? 'поколений' : b === 1 ? 'поколение' : b >= 2 && b <= 4 ? 'поколения' : 'поколений'}`;
};

/**
 * Тексты напряжений пишутся для читателя: имена — только в именительном падеже (цепочкой «Левий — Кааф — Амрам»),
 * родство — общими словами («сын», «после смерти отца»), со стихами и объяснением, без стрелок (docs/ui-review/card.md, CARD-18).
 */
const NB = '\u00a0'; // неразрывный пробел: перед тире, в ссылке «Исх 12:40», после числа
const chainOf = (g: Graph, ids: string[]) => ids.map((x) => g.persons.get(x)!.name).join(`${NB}— `);
const kidNoun = (g: Graph, id: string) => (g.persons.get(id)!.sex === 'f' ? 'дочь' : 'сын');
const kidGen = (g: Graph, id: string) => (g.persons.get(id)!.sex === 'f' ? 'дочери' : 'сына');
const parentGen = (kind: string) => (kind === 'mother' ? 'матери' : 'отца');
const WHAT: Record<string, string> = {
  fatherAge: 'возраст отца при рождении',
  motherAge: 'возраст матери при рождении',
  offset: 'промежуток между рождениями',
  deathAge: 'возраст при смерти',
};

export type ChronoModelId = 'mt-long' | 'mt-short' | 'lxx' | 'terah70';

export interface ChronoModel {
  id: ChronoModelId;
  name: string;
  description: string;
}

export const MODELS: ChronoModel[] = [
  {
    id: 'mt-long',
    name: 'Масоретские числа, 430 лет в Египте',
    description:
      'Быт 5 и 11 по основному тексту; Фарре 130 лет при рождении Аврама (Быт 11:32; 12:4; Деян 7:4); 430 лет в Египте (Исх 12:40); Исход — 1446 г. до Р. Х. (3 Цар 6:1 и якорь 967 г.).',
  },
  {
    id: 'mt-short',
    name: 'Краткое пребывание: 215 лет в Египте',
    description: 'То же, но 430 лет считаются от прихода Авраама в Ханаан (скобка Синодального текста Исх 12:40; Гал 3:17).',
  },
  {
    id: 'lxx',
    name: 'Числа в скобках Быт 5 и 11',
    description: 'Для праотцев до Авраама берутся числа греческого перевода, напечатанные в квадратных скобках Синодального текста.',
  },
  {
    id: 'terah70',
    name: 'Фарре 70 лет при рождении Аврама',
    description: 'Аврам — первенец Фарры (Быт 11:26), без согласования с Деян 7:4.',
  },
];

export type DateClass = 'exact' | 'calculated' | 'estimated' | 'epochal';

export interface Tension {
  persons: string[];
  text: string;
  refs: string[];
  /**
   * Вид напряжения (для слоя неба и карточки):
   *  numbers  — числа текста расходятся между собой;
   *  pair     — ребёнок не помещается в жизнь родителя;
   *  chain    — цепочка поколений между датированными лицами длиннее или короче поколений эпохи;
   *  stretched — жизнь «до последнего упоминания» длиннее предела жизни эпохи (MAP-51);
   *  spouses  — супруги не одного поколения (CARD-61).
   */
  kind?: 'numbers' | 'pair' | 'chain' | 'stretched' | 'spouses';
  /** Объяснение напряжения — толкование («родословие, вероятно, называет не все поколения»): помета «толк.» (MAP-51). */
  cert?: 'interpretation';
}

/**
 * Откуда взята скобка лица «время не установлено» (MAP-52):
 *  met     — годы деятельности (или жизни) лиц, с которыми оно встречалось по тексту (card.met), id — первое из них;
 *  kin     — годы жизни брата или сестры, названных словами Писания (kin: «братья Беэры», 1 Пар 5:7), id — он;
 *  mention — эпоха книги и главы, где лицо названо впервые, ref — эта ссылка;
 *  epoch   — эпоха из данных;
 *  bounds  — границы рождения и смерти из данных («не раньше…», «не позже…»);
 *  group   — годы датированных лиц его созвездия (иных опор нет).
 */
export interface WhenSpan {
  by: 'met' | 'kin' | 'mention' | 'epoch' | 'bounds' | 'group';
  id?: string;
  ref?: string;
}

export interface PersonChrono {
  /** Оценка года рождения. У лица «время не установлено» (epochal) — середина скобки bLo…bHi, а не год рождения (MAP-52);
   *  у народа или рода (named) — место в родословии, а не год рождения (CARD-59). */
  b: number;
  /** Интервал рождения: у точных и расчётных дат — ширина счёта, у оценочных — по удалённости от датированной родни,
   *  всегда внутри допустимого интервала данных (born.range), не позже смерти и первого засвидетельствованного события
   *  (упоминание — в любом возрасте, рождение ребёнка — не моложе 13 лет; MAP-53).
   *  У лиц «время не установлено» (epochal) — скобка засвидетельствованной деятельности или эпохи (when). */
  bLo: number;
  bHi: number;
  d: number | null; // год смерти, если следует из данных
  /** Интервал смерти: по возрасту при смерти — сдвинутый интервал рождения; только по допустимому интервалу (died.range) —
   *  сам этот интервал, не раньше рождения. null — о смерти данных нет. */
  dLo: number | null;
  dHi: number | null;
  lastAttested: number | null; // последнее засвидетельствованное событие жизни
  dEst: number; // правдоподобный конец жизни (для «вероятных» современников)
  cls: DateClass;
  epoch: string | null; // эпоха рождения
  /** Умер младенцем: возраст при смерти по тексту меньше двух лет (2 Цар 12:18). След жизни не рисуется (A14). */
  infant?: boolean;
  /** Народ или род (kind people, clan): b — место в родословии, года рождения нет; современников нет (CARD-59). */
  named?: boolean;
  /** Год оценён по порядку перечисления братьев и сестёр (младший — не раньше чем через год после старшего): «выв.» (MAP-54). */
  byOrder?: boolean;
  /** Откуда взята скобка «время не установлено» (только у epochal). */
  when?: WhenSpan;
  /**
   * Разрыв следа (MAP-51): сплошная жизнь «до последнего упоминания» длиннее предела жизни эпохи. Год (астр.), где
   * кончается правдоподобная часть следа (рождение + предел жизни эпохи); дальше — «//» и пунктир до последнего события.
   */
  brk?: number;
  /**
   * Год смерти выведен из рождения по возрасту при смерти, названному текстом (true), или свой — явный год, допустимый
   * интервал, решатель (false). Показ округляет оценку рождения и сдвигает вместе с ней только смерть по возрасту
   * (engine/years.ts, shownYears; CARD-79). Только при d ≠ null.
   */
  dAge?: boolean;
  /**
   * Год знака на небе (этап 7, круг 3; MAP-69; решение владельца 38): у оценки без чисел текста с промежутком рождения
   * шире WIDE_BIRTH лет — первый год, когда лицо заведомо живо: начало служения или царствования, событие с годом,
   * свой год смерти или начало допустимого интервала смерти. Знак и след стоят от него (engine/layout.ts: t0 = mark),
   * а промежуток рождения bLo…bHi остаётся в данных — растушёванной полосой влево от знака. b — по-прежнему оценка
   * рождения (карточка, современники, порядок братьев). Нет — знак в год рождения.
   */
  mark?: number;
}

export interface ChronoResult {
  model: ChronoModelId;
  persons: Map<string, PersonChrono>;
  tensions: Tension[];
  /** Эпохи в годах этой модели (engine/epochs.ts; CARD-60). Годы — исторические, как в data/epochs.json. */
  epochs?: Epoch[];
}

const EXODUS = toAstro(-1446);

/** Типичные длины поколения по эпохам (для мягких ограничений). */
export interface GenNorm {
  g: number; // среднее
  min: number;
  max: number;
  sigma: number;
  life: number; // типичная продолжительность жизни
  lifeMax: number;
}
const NORMS: Record<string, GenNorm> = {
  antediluvian: { g: 110, min: 60, max: 200, sigma: 40, life: 900, lifeMax: 970 },
  postdiluvian: { g: 34, min: 25, max: 140, sigma: 15, life: 300, lifeMax: 600 },
  patriarchs: { g: 60, min: 25, max: 110, sigma: 20, life: 150, lifeMax: 180 },
  egypt: { g: 45, min: 18, max: 100, sigma: 20, life: 120, lifeMax: 140 },
  default: { g: 28, min: 13, max: 65, sigma: 9, life: 65, lifeMax: 120 },
};

/**
 * Вес притяжения супругов к «одному поколению» — в долях веса «мать — ребёнок» (1/σ²): один ребёнок весит
 * почти в семь раз больше, чем муж. Меньше — и бездетная жена без иных данных уходит от мужа только за счёт
 * случайных начальных значений; больше — и жена снова стоит в год рождения мужа (A15).
 */
const SPOUSE_W = 0.15;
/**
 * Супруги одного поколения (CARD-61): рождение жены в пределах [муж − SPOUSE_LO; муж + SPOUSE_HI] в эпохах обычных
 * поколений. Там, где поколения длиннее (патриархи: Исаак женился в 40 лет, Иаков — после 84; Быт 25:20; 29:20–28),
 * пределы растут вместе с длиной поколения эпохи (spouseBand). Граница мягкая, но сильнее притяжения к эпохе: без неё
 * Руфь стояла через 110 лет после Махлона. Выход за границу больше чем на SPOUSE_SLACK лет — напряжение.
 */
const SPOUSE_LO = 15;
const SPOUSE_HI = 30;
const SPOUSE_BAND_W = 5; // в долях 1/σ²: в пять раз сильнее притяжения «мать — ребёнок», в десять раз слабее границы «родитель старше на 13 лет»
const SPOUSE_SLACK = 10;
/**
 * Младшие братья и сёстры — не раньше чем через год после старших (ТЗ § 8.2; MAP-54). Шаг — полтора года: граница
 * мягкая и под давлением других связей уступает на доли года, а в данных годы округляются до целых, и шаг около года
 * снова дал бы один год двоим.
 */
const SIB_STEP = 1.5;
const SIB_W = 2;
/** Дети разных матерей с порядком в данных («первенец… второй… шестой», 2 Цар 3:2–5) — шаг не меньше года, но мягче. */
const SIB_STEP_CROSS = 1.25;
/** Родитель при рождении ребёнка не моложе (MAP-53; та же граница, что у решателя для отцов). */
const PARENT_MIN_AGE = 13;
/**
 * Наименьший возраст начала засвидетельствованной деятельности (этап 7, круг 3; MAP-53): без него промежуток рождения
 * пророка кончался в год его служения, и пророк мог «родиться» за 4 года до гибели (Валаам). Возраст — наименьший,
 * какой называет Писание для такой деятельности:
 *  — царь, царица, иноземный правитель: наименьший возраст при воцарении в данных (reign.ageAtStart; считается из данных,
 *    minReignAge) — Иоас воцарился семи лет (4 Цар 11:21; 2 Пар 24:1);
 *  — священник, первосвященник, левит: 20 лет — левиты отправляли служение «от двадцати лет и выше» (1 Пар 23:24, 27;
 *    Езд 3:8);
 *  — вождь (начальник колена, военачальник): 20 лет — исчисление «от двадцати лет и выше, всех годных для войны» (Чис 1:3);
 *  — пророк, судья, апостол: 12 лет — самое раннее самостоятельное действие, которое текст называет с возрастом: Иисус
 *    двенадцати лет в храме «посреди учителей» (Лк 2:42–47). Та же граница прежде стояла у решателя для всякой
 *    засвидетельствованной деятельности (ACTIVE_MIN_AGE).
 * У лиц без этих ролей событие засвидетельствовано в любом возрасте (0), а решатель, как прежде, слабо держит рождение
 * не позже чем за ACTIVE_MIN_AGE лет до начала деятельности.
 */
const ACTIVE_MIN_AGE = 12;
const ROLE_MIN_AGE: [Role[], number][] = [
  [['priest', 'high-priest', 'levite', 'tribal-leader', 'commander'], 20],
  [['prophet', 'judge', 'apostle'], ACTIVE_MIN_AGE],
];
const KING_ROLES: Role[] = ['king', 'queen', 'foreign-ruler'];
/** Наименьший возраст начала деятельности лица по его ролям; null — ролей с таким возрастом нет. */
export function roleMinAge(p: Person, minReignAge: number): number | null {
  const roles = p.roles ?? [];
  let out: number | null = null;
  for (const [rs, age] of ROLE_MIN_AGE) if (rs.some((r) => roles.includes(r))) out = Math.max(out ?? 0, age);
  if (out === null && KING_ROLES.some((r) => roles.includes(r))) out = minReignAge;
  return out;
}
/** Наименьший возраст при воцарении в данных (Иоас — семи лет, 4 Цар 11:21); без чисел в данных — 7. */
export function minReignAgeOf(g: Graph): number {
  let m = Infinity;
  for (const p of g.persons.values()) for (const r of p.chrono?.reign ?? []) if (r.ageAtStart !== undefined) m = Math.min(m, r.ageAtStart);
  return Number.isFinite(m) ? m : 7;
}
/**
 * Знак у первого засвидетельствованного года (этап 7, круг 3; MAP-69; решение владельца 38): у оценки без чисел текста,
 * у которой промежуток рождения шире WIDE_BIRTH лет, знак на небе стоит не в середине промежутка, а у первого года,
 * когда лицо заведомо живо (PersonChrono.mark). Иначе два десятка лиц Нового Завета с промежутком в 70 лет (Пётр,
 * Пилат, Анна, Каиафа…) стояли острыми звёздами в одном столбце у Рождества.
 */
export const WIDE_BIRTH = 40;
/**
 * Правило знака у первого засвидетельствованного года — для лиц Нового Завета (решение 38 принято о них): первое
 * свидетельство не раньше начала этой эпохи, где ветхозаветное повествование уже кончилось («Межзаветное время»:
 * Захария и Елисавета, Лк 1:5–25; Ирод; затем Евангелия и Деяния). В Ветхом Завете то же правило поставило бы в столбец
 * десятки лиц одного списка (сыновья Емана при Давиде, 1 Пар 25) и сдвинуло бы всех царей Израиля к воцарению —
 * это отдельный вопрос владельцу.
 */
const MARK_FROM_EPOCH = 'intertestamental';
/**
 * Родство поколений словами Писания (kin; этап 7, круг 3; MAP-69): на сколько поколений лицо старше названного.
 * Мягкое правило решателя, как притяжение «родитель — ребёнок»: «Анна… тесть Каиафе» (Ин 18:13) — на поколение старше
 * зятя; «тёща Симона» (Мф 8:14) — старше Симона. Только родство в свойстве (через брак), где графа родителей нет:
 * дядя, тётка и бабка в данных уже связаны с племянником через родителей, и второе притяжение их бы только сдвинуло.
 */
const KIN_GENS: Record<string, number> = { тесть: 1, тёща: 1, свёкор: 1, свекровь: 1, зять: -1, невестка: -1, сноха: -1 };
/**
 * Гаусс — Зейдель: предел проходов и сдвиг, при котором проходы останавливаются. Это только начальное приближение:
 * решение доводит newtonPolish (при 100 и 400 проходах результат один и тот же — до десятых долей года).
 */
const SWEEPS = 100;
const SWEEP_EPS = 0.05;
/** Возраст при смерти меньше этого — «умер младенцем» (A14): след жизни не рисуется, знак †. */
const INFANT_AGE = 2;
/** Вес предела возраста матери: как у порядка братьев — сильнее притяжений поколения, слабее чисел текста. */
const MOTHER_MAX_W = 2;
/** Предел возраста матери при рождении ребёнка в эпохах обычных поколений. */
const MOTHER_MAX = 45;
/** Эпохи долгих поколений: там пределы супругов растут с длиной поколения. */
export function spouseBand(n: GenNorm): { lo: number; hi: number } {
  const k = Math.max(1, n.g / NORMS.default.g);
  return { lo: Math.round(SPOUSE_LO * k), hi: Math.round(SPOUSE_HI * k) };
}

export function normFor(epochId: string | null): GenNorm {
  return (epochId && NORMS[epochId]) || NORMS.default;
}

export function epochAt(epochs: Epoch[], astro: number): Epoch | null {
  for (const e of epochs) if (astro >= toAstro(e.start) && astro < toAstro(e.end)) return e;
  return astro < toAstro(epochs[0].start) ? epochs[0] : epochs[epochs.length - 1];
}

// ---------- объединение с весами: b[x] = b[root] + off[x] ----------
class Offsets {
  parent = new Map<string, string>();
  off = new Map<string, number>(); // смещение относительно родителя в дереве объединения
  find(x: string): { root: string; off: number } {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.off.set(x, 0);
    }
    let r = x;
    let acc = 0;
    while (this.parent.get(r) !== r) {
      acc += this.off.get(r)!;
      r = this.parent.get(r)!;
    }
    // сжатие пути
    let y = x;
    let rem = acc;
    while (this.parent.get(y) !== r && y !== r) {
      const next = this.parent.get(y)!;
      const o = this.off.get(y)!;
      this.parent.set(y, r);
      this.off.set(y, rem);
      rem -= o;
      y = next;
    }
    return { root: r, off: acc };
  }
  /** Требование: val(b) − val(a) = delta. Возвращает расхождение, если оно уже задано иначе. */
  union(a: string, b: string, delta: number): number | null {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra.root === rb.root) {
      const cur = rb.off - ra.off;
      return Math.abs(cur - delta) > 1.5 ? cur - delta : null;
    }
    // val(rb.root) = val(ra.root) + ra.off + delta − rb.off
    this.parent.set(rb.root, ra.root);
    this.off.set(rb.root, ra.off + delta - rb.off);
    return null;
  }
}

const B = (id: string) => `b:${id}`;
const D = (id: string) => `d:${id}`;

interface Ineq {
  // мягкое ограничение: w * (x_j − x_i − delta)² при нарушении (kind 'ge' — x_j − x_i ≥ delta; 'eq' — всегда)
  i: string;
  j: string;
  delta: number;
  w: number;
  kind: 'eq' | 'ge' | 'le';
  /** Одностороннее ограничение: двигает только лицо j (зависимое), а не опору i. */
  onlyJ?: boolean;
}

/**
 * Доводка решения (этап 7, K1): взвешенные наименьшие квадраты с мягкими ограничениями — выпуклая кусочно-квадратичная
 * задача, но у неё есть медленные направления: длинные цепочки лиц, связанных слабыми притяжениями поколения между
 * жёсткими границами (Салмон — Вооз — Овид — Иессей между Наассоном и Давидом; семья Елимелеха, привязанная к Руфи
 * только браком). Гаусс — Зейдель сдвигает их на доли года за проход и останавливается далеко от минимума: при 400
 * проходах сотни лиц стояли на 5–190 лет в стороне, отсюда Руфь через 110 лет после Махлона (CARD-61) и ложные
 * напряжения. Поэтому после проходов Гаусса — Зейделя решение доводится полугладким методом Ньютона: активный набор
 * ограничений → линейная система (сопряжённые градиенты с диагональным предобуславливанием) → шаг с дроблением,
 * пока значение не перестанет убывать. Граница «только для зависимого лица» (onlyJ: «не позже Саула + 20») двигает
 * только его: год опоры в ней на каждом шаге заморожен.
 */
function newtonPolish(o: {
  ineqs: Ineq[];
  mids: { x: string; p: string; c: string; w: number }[];
  priors: Map<string, { lo: number; hi: number; w: number }>;
  rootOffset: Map<string, { root: string; off: number }>;
  value: Map<string, number>;
  free: Set<string>;
}): void {
  const roots = [...o.free];
  const idx = new Map(roots.map((r, k) => [r, k]));
  const n = roots.length;
  if (!n) return;
  const x = new Float64Array(n);
  roots.forEach((r, k) => (x[k] = o.value.get(r)!));
  // линейный член: r = Σ c·x[v] + k0 (+ замороженная опора fz: c·(x[fz] + fOff)); штраф w·r² там, где ограничение нарушено
  interface LT { v: number[]; c: number[]; k0: number; w: number; kind: 'eq' | 'ge' | 'le'; fz?: number; fOff?: number; fc?: number }
  const terms: LT[] = [];
  type Side = { v: number; off: number } | { k: number } | null;
  const side = (key: string): Side => {
    if (key.startsWith('@')) return { k: Number(key.slice(1)) };
    const ro = o.rootOffset.get(key);
    if (!ro) return null;
    const v = idx.get(ro.root);
    if (v !== undefined) return { v, off: ro.off };
    const f = o.value.get(ro.root);
    return f === undefined ? null : { k: f + ro.off };
  };
  const push = (t: LT) => {
    // один и тот же корень с разных сторон — коэффициенты складываются
    const m = new Map<number, number>();
    t.v.forEach((v, i) => m.set(v, (m.get(v) ?? 0) + t.c[i]));
    t.v = [];
    t.c = [];
    for (const [v, c] of m) if (Math.abs(c) > 1e-12) { t.v.push(v); t.c.push(c); }
    if (t.v.length) terms.push(t);
  };
  for (const q of o.ineqs) {
    const sj = side(q.j);
    const si = side(q.i);
    if (!sj || !si) continue;
    const t: LT = { v: [], c: [], k0: -q.delta, w: q.w, kind: q.kind };
    if ('v' in sj) { t.v.push(sj.v); t.c.push(1); t.k0 += sj.off; } else t.k0 += sj.k;
    if ('v' in si) {
      if (q.onlyJ) { t.fz = si.v; t.fOff = si.off; t.fc = -1; } else { t.v.push(si.v); t.c.push(-1); t.k0 -= si.off; }
    } else t.k0 -= si.k;
    push(t);
  }
  for (const m of o.mids) {
    const sx = side(m.x);
    const sp = side(m.p);
    const sc = side(m.c);
    if (!sx || !sp || !sc) continue;
    const t: LT = { v: [], c: [], k0: 0, w: m.w, kind: 'eq' };
    for (const [s, c] of [[sx, 1], [sp, -0.5], [sc, -0.5]] as [Side, number][]) {
      if (!s) continue;
      if ('v' in s) { t.v.push(s.v); t.c.push(c); t.k0 += c * s.off; } else t.k0 += c * s.k;
    }
    push(t);
  }
  for (const [key, pr] of o.priors) {
    const s = side(key);
    if (!s || !('v' in s)) continue;
    push({ v: [s.v], c: [1], k0: s.off - pr.lo, w: pr.w, kind: 'ge' });
    push({ v: [s.v], c: [1], k0: s.off - pr.hi, w: pr.w, kind: 'le' });
  }
  // плоские массивы: члены подряд (CSR), чтобы умножение на матрицу шло по типизированным массивам
  const T = terms.length;
  const start = new Int32Array(T + 1);
  for (let t = 0; t < T; t++) start[t + 1] = start[t] + terms[t].v.length;
  const tv = new Int32Array(start[T]);
  const tc = new Float64Array(start[T]);
  const tw = new Float64Array(T);
  const tk0 = new Float64Array(T);
  const tkind = new Uint8Array(T); // 0 — eq, 1 — ge, 2 — le
  for (let t = 0; t < T; t++) {
    const q = terms[t];
    for (let i = 0; i < q.v.length; i++) {
      tv[start[t] + i] = q.v[i];
      tc[start[t] + i] = q.c[i];
    }
    tw[t] = q.w;
    tk0[t] = q.k0;
    tkind[t] = q.kind === 'eq' ? 0 : q.kind === 'ge' ? 1 : 2;
  }
  const r = new Float64Array(T);
  const frozen = new Float64Array(T);
  const on = (t: number, s: number) => tkind[t] === 0 || (tkind[t] === 1 && s < 0) || (tkind[t] === 2 && s > 0);
  const resid = (xx: Float64Array) => {
    let F = 0;
    for (let t = 0; t < T; t++) {
      let s = tk0[t] + frozen[t];
      for (let e = start[t]; e < start[t + 1]; e++) s += tc[e] * xx[tv[e]];
      r[t] = s;
      if (on(t, s)) F += tw[t] * s * s;
    }
    return F;
  };
  const g = new Float64Array(n);
  const diag = new Float64Array(n);
  const d = new Float64Array(n);
  const res = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const hp = new Float64Array(n);
  const xt = new Float64Array(n);
  const act = new Int32Array(T);
  const EPS = 1e-9;
  for (let outer = 0; outer < 60; outer++) {
    for (let t = 0; t < T; t++) {
      const q = terms[t];
      frozen[t] = q.fz !== undefined ? q.fc! * (x[q.fz] + q.fOff!) : 0;
    }
    const F0 = resid(x);
    g.fill(0);
    diag.fill(0);
    let na = 0;
    for (let t = 0; t < T; t++) {
      const s = r[t];
      if (!on(t, s)) continue;
      act[na++] = t;
      for (let e = start[t]; e < start[t + 1]; e++) {
        g[tv[e]] += 2 * tw[t] * s * tc[e];
        diag[tv[e]] += 2 * tw[t] * tc[e] * tc[e];
      }
    }
    let gmax = 0;
    for (let k = 0; k < n; k++) gmax = Math.max(gmax, Math.abs(g[k]));
    if (gmax < 1e-7) break;
    // H·Δ = −g сопряжёнными градиентами с диагональным предобуславливанием
    const hmul = (v: Float64Array, out: Float64Array) => {
      for (let k = 0; k < n; k++) out[k] = EPS * v[k];
      for (let a = 0; a < na; a++) {
        const t = act[a];
        let s = 0;
        for (let e = start[t]; e < start[t + 1]; e++) s += tc[e] * v[tv[e]];
        s *= 2 * tw[t];
        for (let e = start[t]; e < start[t + 1]; e++) out[tv[e]] += s * tc[e];
      }
    };
    d.fill(0);
    let rz = 0;
    let bnorm = 0;
    for (let k = 0; k < n; k++) {
      res[k] = -g[k];
      z[k] = res[k] / (diag[k] + EPS);
      p[k] = z[k];
      rz += res[k] * z[k];
      bnorm += res[k] * res[k];
    }
    const tol = 1e-10 * bnorm;
    for (let it = 0; it < 800; it++) {
      hmul(p, hp);
      let php = 0;
      for (let k = 0; k < n; k++) php += p[k] * hp[k];
      if (php <= 0) break;
      const a = rz / php;
      let rr = 0;
      for (let k = 0; k < n; k++) {
        d[k] += a * p[k];
        res[k] -= a * hp[k];
        rr += res[k] * res[k];
      }
      if (rr < tol) break;
      let rz1 = 0;
      for (let k = 0; k < n; k++) {
        z[k] = res[k] / (diag[k] + EPS);
        rz1 += res[k] * z[k];
      }
      const beta = rz1 / rz;
      rz = rz1;
      for (let k = 0; k < n; k++) p[k] = z[k] + beta * p[k];
    }
    // шаг с дроблением: значение должно убывать
    let step = 1;
    let moved = 0;
    for (let ls = 0; ls < 30; ls++) {
      for (let k = 0; k < n; k++) xt[k] = x[k] + step * d[k];
      const F1 = resid(xt);
      if (F1 < F0 - 1e-12) {
        for (let k = 0; k < n; k++) {
          moved = Math.max(moved, Math.abs(xt[k] - x[k]));
          x[k] = xt[k];
        }
        break;
      }
      step /= 2;
    }
    if (moved < 1e-3) break;
  }
  roots.forEach((rt, k) => o.value.set(rt, x[k]));
}

/** Послания (эпоха «Апостольское время», data/epochs.json: books «Послания»). */
const EPISTLES = new Set(BOOKS.filter((b) => b.t === 'nt' && !['Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Откр'].includes(b.code)).map((b) => b.code));

/**
 * Эпохи книги и главы по каталогу эпох (data/epochs.json, books): «Быт 12–50» → Патриархи, «Послания» → апостольское
 * время. Книга без времени действия («Иов (время действия не указано)») и родословия 1 Пар 1–9 эпохи не дают.
 */
function epochsOfChapter(epochs: Epoch[], book: string, chapter: number): Epoch[] {
  return epochs.filter((e) =>
    e.books.some((s) => {
      if (s.includes('(')) return false;
      if (s === 'Послания') return EPISTLES.has(book);
      const m = /^(\S+)(?:\s+(\d+)[–-](\d+))?$/.exec(s.trim());
      return !!m && m[1] === book && (m[2] === undefined || (chapter >= Number(m[2]) && chapter <= Number(m[3])));
    }),
  );
}

/**
 * Скобка лица «время не установлено» (MAP-52; решение владельца 24), в астрономических годах, по порядку опор:
 *  1. встречи по тексту (card.met) с лицами, чьи годы известны: их годы служения или царствования, иначе жизнь
 *     (от 13 лет до смерти или обычного конца жизни); несколько встреч — объединение, в пределах эпохи книги
 *     первого упоминания, если они пересекаются (Лука — годы служения Павла, Кол 4:14; Флм 1:24);
 *  1а. братья и сёстры словами Писания (kin), у которых годы есть, — их годы жизни: ровесники;
 *  2. допустимый интервал смерти (died.range: «убит в войне Факея с Ахазом», 2 Пар 28:7) — засвидетельствованный миг;
 *  3. эпоха книги и главы первого упоминания (Манаил и Луций — Деян 13:1, апостольское время);
 *  4. эпоха из данных;
 *  5. границы рождения из данных, продолженные на обычную жизнь эпохи; если заданы обе («после Исава, прежде царей
 *     Израиля», Быт 36:31) — раньше эпохи главы: список может быть моложе книги, в которой записан;
 *  6. годы датированных лиц того же созвездия (1 Пар 4–5: имена без родства и без эпохи).
 * Границы рождения подрезают скобку до возможной жизни, смерть — её конец, если скобка от этого не пустеет.
 */
function whenSpans(o: {
  g: Graph;
  epochs: Epoch[];
  cls: Map<string, DateClass>;
  b: (id: string) => number;
  d: (id: string) => number | null;
}): (id: string) => { lo: number; hi: number; when: WhenSpan } {
  const { g, epochs, cls } = o;
  const astroSpan = (e: Epoch): [number, number] => [toAstro(e.start), toAstro(e.end)];
  const union = (xs: [number, number][]): [number, number] | null => (xs.length ? [Math.min(...xs.map((x) => x[0])), Math.max(...xs.map((x) => x[1]))] : null);
  const partner = (q: string): [number, number] | null => {
    const qc = g.persons.get(q)?.chrono;
    if (qc?.active) return [toAstro(qc.active.from), toAstro(qc.active.to)];
    if (qc?.reign?.length) return [toAstro(Math.min(...qc.reign.map((r) => r.start))), toAstro(Math.max(...qc.reign.map((r) => r.end)))];
    const k = o.cls.get(q);
    if (!k || k === 'epochal') return null;
    const b = o.b(q);
    const n = normFor(qc?.epoch ?? epochAt(epochs, b)?.id ?? null);
    const end = o.d(q) ?? b + n.life;
    return end > b + PARENT_MIN_AGE ? [b + PARENT_MIN_AGE, end] : [b, Math.max(end, b)];
  };
  /** Годы жизни лица с годами: от рождения до смерти, последнего события или обычного конца жизни эпохи. */
  const lifeOf = (q: string): [number, number] | null => {
    const k = o.cls.get(q);
    if (!k || k === 'epochal') return null;
    const b = o.b(q);
    const n = normFor(g.persons.get(q)?.chrono?.epoch ?? epochAt(epochs, b)?.id ?? null);
    return [b, Math.max(o.d(q) ?? b + n.life, b)];
  };
  // годы датированных лиц созвездия
  const groupSpan = new Map<string, [number, number]>();
  for (const id of g.order) {
    const k = cls.get(id);
    if (k === 'epochal') continue;
    const p = g.persons.get(id)!;
    if (p.kind === 'people' || p.kind === 'clan') continue;
    const b = o.b(id);
    const cur = groupSpan.get(p.group);
    groupSpan.set(p.group, cur ? [Math.min(cur[0], b), Math.max(cur[1], b)] : [b, b]);
  }
  return (id) => {
    const p = g.persons.get(id)!;
    const c = p.chrono;
    const firstRef = firstRefOf(p);
    const fm = firstRef ? /^(\S+)\s+(\d+)/.exec(firstRef) : null;
    const byMention = fm ? union(epochsOfChapter(epochs, fm[1], Number(fm[2])).map(astroSpan)) : null;
    const met = (p.card?.met ?? []).filter((m) => g.persons.has(m.id));
    const metSpans = met.map((m) => partner(m.id)).filter((x): x is [number, number] => !!x);
    // братья и сёстры словами Писания (kin: «Иеиель и Захария — братья Беэры», 1 Пар 5:7) — ровесники: их годы жизни
    const sib = (g.kinOf.get(id) ?? []).filter((e) => /^(брат|сестра)/.test(e.rel)).map((e) => (e.from === id ? e.to : e.from));
    const sibSpans = sib.map((q) => lifeOf(q)).filter((x): x is [number, number] => !!x);
    const ownEpoch = c?.epoch ? epochs.find((e) => e.id === c.epoch) : undefined;
    const n = normFor(c?.epoch ?? null);
    // границы рождения из данных
    let bornLo = -Infinity;
    let bornHi = Infinity;
    const at = (x: { from: string; years: number } | undefined) => (x && g.persons.has(x.from) && cls.get(x.from) !== 'epochal' ? o.b(x.from) + x.years : null);
    const nb = at(c?.born?.notBefore);
    const na = at(c?.born?.notAfter);
    if (nb !== null) bornLo = nb;
    if (na !== null) bornHi = na;
    if (c?.born?.range) {
      bornLo = Math.max(bornLo, toAstro(c.born.range[0]));
      bornHi = Math.min(bornHi, toAstro(c.born.range[1]));
    }
    const dr = c?.died?.range ? ([toAstro(c.died.range[0]), toAstro(c.died.range[1])] as [number, number]) : null;
    // где лицо могло жить по границам рождения из данных: от рождения до обычного конца жизни эпохи
    const lo0 = Number.isFinite(bornLo);
    const hi0 = Number.isFinite(bornHi);
    const window: [number, number] | null = lo0 || hi0 ? [lo0 ? bornLo : bornHi - n.life, hi0 ? bornHi + n.life : bornLo + n.life] : null;
    let span: [number, number] | null = null;
    let when: WhenSpan | null = null;
    const metU = union(metSpans);
    if (metU) {
      span = metU;
      if (byMention && byMention[0] < metU[1] && metU[0] < byMention[1]) span = [Math.max(metU[0], byMention[0]), Math.min(metU[1], byMention[1])];
      when = { by: 'met', id: met.find((m) => partner(m.id))!.id };
    } else if (sibSpans.length) {
      span = union(sibSpans)!;
      when = { by: 'kin', id: sib.find((q) => lifeOf(q))! };
    } else if (dr) {
      span = dr;
      when = { by: 'bounds' };
    } else if (window && lo0 && hi0) {
      // обе границы рождения («после Исава, прежде царей Израиля», Быт 36:31): список может быть моложе книги,
      // в которой записан, поэтому эпоха главы здесь не опора
      span = window;
      when = { by: 'bounds' };
    } else if (byMention) {
      span = byMention;
      when = { by: 'mention', ref: firstRef! };
    } else if (ownEpoch) {
      span = astroSpan(ownEpoch);
      when = { by: 'epoch' };
    } else if (window) {
      span = window;
      when = { by: 'bounds' };
    } else if (groupSpan.has(p.group)) {
      span = groupSpan.get(p.group)!;
      when = { by: 'group' };
    }
    if (!span || !when) {
      const b = o.b(id);
      return { lo: b - 30, hi: b + 30, when: { by: 'epoch' } };
    }
    let [lo, hi] = span;
    // деятельность — в пределах возможной жизни («бабка Тимофея» — не позже чем за 30 лет до него, 2 Тим 1:5)
    // и не позже смерти («убит в войне…»), если скобка от этого не пустеет
    if (window && window[0] < hi && lo < window[1]) {
      lo = Math.max(lo, window[0]);
      hi = Math.min(hi, window[1]);
    }
    if (dr && dr[1] > lo) hi = Math.min(hi, dr[1]);
    if (hi < lo) [lo, hi] = span;
    return { lo, hi, when };
  };
}

/** Первый засвидетельствованный год лица без дат: начало служения (рождение — не позже чем за ACTIVE_MIN_AGE лет,
 *  как у решателя, или за наименьший возраст его роли) или царствования (возраст при воцарении не назван — рождение
 *  не позже чем за наименьший возраст при воцарении в данных; MAP-53). */
function attestedFrom(p: Person, minReignAge: number): { from: number; minAge: number; refs: string[] } | null {
  const c = p.chrono;
  if (c?.active) return { from: toAstro(c.active.from), minAge: Math.max(ACTIVE_MIN_AGE, roleMinAge(p, minReignAge) ?? 0), refs: c.active.refs ?? [] };
  if (c?.reign?.length) {
    const r = [...c.reign].sort((a, b) => a.start - b.start)[0];
    return { from: toAstro(r.start), minAge: r.ageAtStart ?? minReignAge, refs: r.refs };
  }
  return null;
}

/**
 * Пары соседних по старшинству детей лица id: [старший, младший, шаг в годах] (MAP-54; ТЗ § 8.2 «младшие братья
 * не раньше старших»).
 *  — Дети одной пары родителей (или одного названного родителя) — по порядку рождения или перечисления в данных
 *    (order), а без него — по порядку в томе данных, который следует тексту («сыновья Саруии: Авесса, Иоав и Асаил»,
 *    1 Пар 2:16). Шаг — не меньше года (SIB_STEP).
 *  — Умерший младенцем без порядка — первым из детей своей матери, если его допустимый интервал рождения начинается
 *    не позже, чем у них: сын Давида и Вирсавии умер прежде рождения Соломона (2 Цар 12:18, 24).
 *  — Дети разных матерей с порядком в данных — тоже по порядку («первенец… второй… шестой», 2 Цар 3:2–5). Где текст
 *    сжимает рождения сильнее (одиннадцать сыновей Иакова от четырёх матерей — за семь лет службы, Быт 29:31–30:24),
 *    граница уступает числам текста, и годы могут совпасть.
 * Без народов и родов: их год — не рождение.
 */
export function siblingPairs(g: Graph, id: string): [string, string, number][] {
  const edge = new Map((g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => [e.child, e]));
  const kids = primaryChildren(g, id).filter((k) => {
    const p = g.persons.get(k)!;
    return p.kind !== 'people' && p.kind !== 'clan';
  });
  // потомки через пропуск поколений («сыновья Шимея: Иахаф, Зиза…» при Давиде, 1 Пар 23:10) упорядочиваются только
  // между собой: это одно поколение, но время его относительно родителя неизвестно
  const gapOf = (k: string) => (edge.get(k)?.gap ? '#' : '');
  const other = (k: string): string => {
    const f = fatherOf(g, k);
    const m = motherOf(g, k);
    return ((f === id ? m : f) ?? '') + gapOf(k);
  };
  const out: [string, string, number][] = [];
  const seen = new Map<string, number>();
  const add = (a: string, b: string, step: number) => {
    if (a === b) return;
    const k = `${a}|${b}`;
    const i = seen.get(k);
    if (i !== undefined) {
      out[i][2] = Math.max(out[i][2], step);
      return;
    }
    seen.set(k, out.length);
    out.push([a, b, step]);
  };
  const ord = (k: string) => g.persons.get(k)!.order;
  const ordered = kids.filter((k) => ord(k) !== undefined);
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1];
    const b = ordered[i];
    if (gapOf(a) !== gapOf(b)) continue;
    if (ord(b)! > ord(a)!) add(a, b, other(a) === other(b) ? SIB_STEP : SIB_STEP_CROSS);
  }
  // дети одной пары родителей
  const groups = new Map<string, string[]>();
  for (const k of kids) {
    const o = other(k);
    const a = groups.get(o);
    if (a) a.push(k);
    else groups.set(o, [k]);
  }
  const rangeStart = (k: string) => {
    const r = g.persons.get(k)!.chrono?.born?.range;
    return r ? toAstro(r[0]) : null;
  };
  for (const ks of groups.values()) {
    if (ks.length < 2) continue;
    const seq = [...ks];
    for (const inf of ks) {
      const p = g.persons.get(inf)!;
      const age = p.chrono?.died?.age;
      const r0 = rangeStart(inf);
      if (p.order !== undefined || age === undefined || age >= INFANT_AGE || r0 === null) continue;
      const rest = seq.filter((k) => k !== inf);
      const at = rest.findIndex((k) => (rangeStart(k) ?? -Infinity) >= r0);
      if (at < 0) continue;
      seq.splice(0, seq.length, ...rest.slice(0, at), inf, ...rest.slice(at));
    }
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1];
      const b = seq[i];
      // оба с порядком, но младший по перечислению старше по порядку — не противоречить порядку данных
      if (ord(a) !== undefined && ord(b) !== undefined && ord(b)! < ord(a)!) continue;
      add(a, b, SIB_STEP);
    }
  }
  return out;
}

export function solveChronology(g: Graph, epochs: Epoch[], modelId: ChronoModelId = 'mt-long'): ChronoResult {
  const tensions: Tension[] = [];
  const uf = new Offsets();
  const fixed = new Map<string, { value: number; cls: DateClass }>(); // значения корней после закрепления
  const explicit: { key: string; value: number; cls: DateClass; refs: string[]; who: string }[] = [];
  const epochById = new Map(epochs.map((e) => [e.id, e]));
  const lxx = modelId === 'lxx';
  const minReignAge = minReignAgeOf(g);

  // --- 1. жёсткие равенства
  const equal = (a: string, b: string, delta: number, refs: string[], who: string[], what: string) => {
    const diff = uf.union(a, b, delta);
    if (diff !== null) {
      tensions.push({
        persons: who,
        text: `${chainOf(g, who)}: ${WHAT[what]} по тексту расходится с другими числами текста на ${yearsWord(Math.round(Math.abs(diff)))}.`,
        refs,
        kind: 'numbers',
      });
    }
  };

  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = p.chrono;
    uf.find(B(id));
    if (!c) continue;
    const born = c.born;
    if (born) {
      const fAge = lxx && born.fatherAgeBracket !== undefined ? born.fatherAgeBracket : born.fatherAge;
      let fatherAge = fAge;
      if (modelId === 'terah70' && id === 'avraam') fatherAge = 70;
      const f = fatherOf(g, id);
      const m = motherOf(g, id);
      if (fatherAge !== undefined && f) equal(B(f), B(id), fatherAge, born.refs ?? [], [f, id], 'fatherAge');
      if (born.motherAge !== undefined && m) equal(B(m), B(id), born.motherAge, born.refs ?? [], [m, id], 'motherAge');
      if (born.offset && g.persons.has(born.offset.from)) equal(B(born.offset.from), B(id), born.offset.years, born.refs ?? [], [born.offset.from, id], 'offset');
      if (born.year !== undefined) explicit.push({ key: B(id), value: toAstro(born.year), cls: 'calculated', refs: born.refs ?? [], who: id });
    }
    const died = c.died;
    if (died) {
      const age = lxx && died.ageBracket !== undefined ? died.ageBracket : died.age;
      if (age !== undefined) equal(B(id), D(id), age, died.refs ?? [], [id], 'deathAge');
      if (died.year !== undefined) explicit.push({ key: D(id), value: toAstro(died.year), cls: 'calculated', refs: died.refs ?? [], who: id });
    }
    for (const r of c.reign ?? []) {
      if (r.ageAtStart !== undefined) explicit.push({ key: B(id), value: toAstro(r.start) - r.ageAtStart, cls: 'calculated', refs: r.refs, who: id });
    }
  }

  // --- 2. опора модели: год рождения Иакова
  const sojourn = modelId === 'mt-short' ? 215 : 430;
  const jacobBirth = EXODUS - sojourn - 130;
  const modelAnchor = g.persons.has('iakov') ? { key: B('iakov'), value: jacobBirth } : null;

  const rootOf = (key: string) => uf.find(key);
  const setFixed = (key: string, value: number, cls: DateClass, refs: string[], who: string) => {
    const { root, off } = rootOf(key);
    const v = value - off;
    const cur = fixed.get(root);
    if (cur === undefined) fixed.set(root, { value: v, cls });
    else if (Math.abs(cur.value - v) > 2) {
      tensions.push({ persons: [who], text: `${chainOf(g, [who])}: год по тексту расходится с другими числами текста на ${yearsWord(Math.round(Math.abs(cur.value - v)))}.`, refs, kind: 'numbers' });
    }
  };
  if (modelAnchor) setFixed(modelAnchor.key, modelAnchor.value, 'exact', [], 'iakov');
  for (const e of explicit) setFixed(e.key, e.value, e.cls, e.refs, e.who);

  // --- 3. мягкие ограничения между компонентами
  const ineqs: Ineq[] = [];
  const epochOf = (id: string): string | null => g.persons.get(id)?.chrono?.epoch ?? null;
  const priors = new Map<string, { lo: number; hi: number; w: number }>(); // ключ — b:id
  const addPrior = (key: string, lo: number, hi: number, w: number) => {
    const cur = priors.get(key);
    if (!cur) priors.set(key, { lo, hi, w });
    else priors.set(key, { lo: Math.max(cur.lo, lo), hi: Math.min(cur.hi, hi) < Math.max(cur.lo, lo) ? cur.hi : Math.min(cur.hi, hi), w: Math.max(cur.w, w) });
  };

  // Эпохи в годах модели (CARD-60; engine/epochs.ts): границы, заданные числами Писания (сотворение Адама, Потоп —
  // 600-й год Ноя, рождение Аврама, приход Иакова в Египет — 130 лет), берутся из уже закреплённых лет этой модели.
  const fixedYear = (key: string): number | null => {
    const { root, off } = rootOf(key);
    const f = fixed.get(root);
    return f ? f.value + off : null;
  };
  const mEpochs: Epoch[] = modelEpochs(epochs, (id, of) => (g.persons.has(id) ? fixedYear(of === 'death' ? D(id) : B(id)) : null));
  const mEpochById = new Map(mEpochs.map((e) => [e.id, e]));
  const epochSpan = (e: Epoch): [number, number] => {
    const m = mEpochById.get(e.id) ?? e;
    return [toAstro(m.start), toAstro(m.end)];
  };
  /** Эпоха лица: из данных, иначе по закреплённому году или по засвидетельствованным годам (до решения). */
  const guessEpoch = (id: string): string | null => {
    const own = epochOf(id);
    if (own) return own;
    const c = g.persons.get(id)?.chrono;
    const y =
      fixedYear(B(id)) ??
      (c?.active ? toAstro(c.active.from) - 30 : c?.reign?.length ? toAstro(c.reign[0].start) - 25 : c?.born?.range ? (toAstro(c.born.range[0]) + toAstro(c.born.range[1])) / 2 : null);
    return y === null ? null : (epochAt(mEpochs, y)?.id ?? null);
  };
  const sexOf = (id: string) => g.persons.get(id)?.sex;
  /** Нормы поколения пары супругов: по эпохе мужа, иначе жены. */
  const coupleNorm = (a: string, b: string) => normFor(guessEpoch(a) ?? guessEpoch(b));
  const sibSeen = new Set<string>();
  const sibPairs: [string, string, number][] = [];
  const kinSeen = new Set<string>();

  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = p.chrono;
    // эпоха
    if (c?.epoch && epochById.has(c.epoch)) {
      const [lo, hi] = epochSpan(epochById.get(c.epoch)!);
      addPrior(B(id), lo - 30, hi, 0.5);
    }
    // относительные границы
    // граница соблюдается жёстко (одностороннее ограничение), а слабое притяжение держит оценку с запасом от границы
    // границы «не позже / не раньше чем через N лет после X» двигают только это лицо, не опору X:
    // иначе шесть царей Едома с границей «не позже Саула + 20» утягивают год рождения самого Саула
    if (c?.born?.notAfter && g.persons.has(c.born.notAfter.from)) {
      ineqs.push({ i: B(c.born.notAfter.from), j: B(id), delta: c.born.notAfter.years, w: 5, kind: 'le', onlyJ: true });
      ineqs.push({ i: B(c.born.notAfter.from), j: B(id), delta: c.born.notAfter.years - 20, w: 0.002, kind: 'eq', onlyJ: true });
    }
    if (c?.born?.notBefore && g.persons.has(c.born.notBefore.from)) {
      ineqs.push({ i: B(c.born.notBefore.from), j: B(id), delta: c.born.notBefore.years, w: 5, kind: 'ge', onlyJ: true });
      ineqs.push({ i: B(c.born.notBefore.from), j: B(id), delta: c.born.notBefore.years + 10, w: 0.002, kind: 'eq', onlyJ: true });
    }
    // допустимые интервалы
    if (c?.born?.range) addPrior(B(id), toAstro(c.born.range[0]), toAstro(c.born.range[1]), 5);
    if (c?.died?.range) addPrior(D(id), toAstro(c.died.range[0]), toAstro(c.died.range[1]), 5);
    // годы засвидетельствованной жизни
    if (c?.active) {
      const n = normFor(c.epoch ?? null);
      // b ≤ from − наименьший возраст: 12 лет, у священника, левита и вождя — 20 (ROLE_MIN_AGE; MAP-53)
      const minAge = Math.max(ACTIVE_MIN_AGE, roleMinAge(p, minReignAge) ?? 0);
      ineqs.push({ i: B(id), j: `@${toAstro(c.active.from)}`, delta: minAge, w: 2, kind: 'ge' });
      ineqs.push({ i: B(id), j: `@${toAstro(c.active.from)}`, delta: Math.min(35, n.g + 5), w: 0.003, kind: 'eq' }); // обычно — за поколение до служения
      ineqs.push({ i: `@${toAstro(c.active.to)}`, j: B(id), delta: -n.lifeMax, w: 2, kind: 'ge' }); // b ≥ to − lifeMax
      ineqs.push({ i: `@${toAstro(c.active.to)}`, j: D(id), delta: 0, w: 2, kind: 'ge' }); // d ≥ to: умер не раньше последнего засвидетельствованного года
    }
    // события с годом (CARD-79): лицо живо в год события — родилось не позже и умерло не раньше
    for (const e of p.card?.events ?? []) {
      if (e.year === undefined) continue;
      ineqs.push({ i: B(id), j: `@${toAstro(e.year)}`, delta: 0, w: 2, kind: 'ge' }); // b ≤ год события
      ineqs.push({ i: `@${toAstro(e.year)}`, j: D(id), delta: 0, w: 2, kind: 'ge' }); // d ≥ год события
    }
    for (const r of c?.reign ?? []) {
      // возраст при воцарении не назван — не моложе наименьшего возраста при воцарении в данных (Иоас — семи лет,
      // 4 Цар 11:21; MAP-53); назван — число текста уже задаёт год рождения
      ineqs.push({ i: B(id), j: `@${toAstro(r.start)}`, delta: r.ageAtStart ?? minReignAge, w: 2, kind: 'ge' });
      ineqs.push({ i: `@${toAstro(r.end)}`, j: D(id), delta: -1, w: 2, kind: 'ge' }); // d ≥ конец царствования − 1
      if (r.ageAtStart === undefined) {
        // возраст при воцарении не назван: рождение не раньше «конец царствования − предел жизни»
        // и слабо тянется к обычному возрасту воцарения (без этого рождение уезжает на столетия раньше)
        const n = normFor(c?.epoch ?? null);
        ineqs.push({ i: `@${toAstro(r.end)}`, j: B(id), delta: -n.lifeMax, w: 2, kind: 'ge' });
        ineqs.push({ i: B(id), j: `@${toAstro(r.start)}`, delta: 25, w: 0.004, kind: 'eq' });
      }
    }
    // поколение: отец и мать
    for (const e of g.parentsOf.get(id) ?? []) {
      const pe = epochOf(e.parent) ?? epochOf(id);
      const n = normFor(pe);
      const main = e.kind === 'father' || e.kind === 'mother';
      const w = (main ? 1 : 0.4) * (e.gap ? 0.25 : 1);
      const g0 = e.kind.endsWith('mother') ? n.g * 0.85 : n.g;
      // допустимый интервал рождения из данных («родился в Иерусалиме», «за двадцать лет службы Иакова») точнее
      // притяжения к «родитель + поколение»: иначе дюжина сыновей тянется к нему всей массой, сбивается к краю
      // интервала и встаёт в один год (MAP-54)
      const bounded = !!c?.born?.range || (!!c?.born?.notBefore && !!c?.born?.notAfter);
      // «из сыновей X» и пропуск поколений: число поколений неизвестно — только «родился после», без притяжения к одному поколению
      // Для такого ребёнка притяжение одностороннее: год родителя по-прежнему выводится из него в полную силу
      // (жена — по рождению своих детей, A15), а сам ребёнок к родителю тянется слабо.
      if (!e.gap && !bounded) ineqs.push({ i: B(e.parent), j: B(id), delta: g0, w: w / (n.sigma * n.sigma), kind: 'eq' });
      if (!e.gap && bounded) {
        ineqs.push({ i: B(id), j: B(e.parent), delta: -g0, w: w / (n.sigma * n.sigma), kind: 'eq', onlyJ: true });
        ineqs.push({ i: B(e.parent), j: B(id), delta: g0, w: (0.05 * w) / (n.sigma * n.sigma), kind: 'eq', onlyJ: true });
      }
      ineqs.push({ i: B(e.parent), j: B(id), delta: e.kind.endsWith('mother') ? 14 : n.min, w: 50 / (n.sigma * n.sigma), kind: 'ge' });
      // мать рожает не позже MOTHER_MAX лет (вне эпох долгих жизней): иначе сжатое родословие растягивало матерей —
      // Руфь рожала Овида в 56 лет, Раав Вооза — в 120; растяжение уходит на отцов цепочки, где его видно разрывом
      // следа и напряжением «родословие называет не все поколения» (MAP-51). Возраст матери из текста (Сарра — 90 лет,
      // Быт 17:17) — жёсткое равенство, граница его не трогает.
      // Только в эпохах обычных поколений: в Египте 430 лет пребывания растягивают поколения по числам текста
      // (Иохаведа, дочь Левия, — мать Моисея, Чис 26:59), и это растяжение показывает напряжение, а не граница.
      if (e.kind === 'mother' && !e.gap && n === NORMS.default && c?.born?.motherAge === undefined) {
        ineqs.push({ i: B(e.parent), j: B(id), delta: MOTHER_MAX, w: MOTHER_MAX_W, kind: 'le' });
      }
      if (main && !e.gap) {
        // рождение при жизни матери и не позже года после смерти отца — граница твёрдая, как notAfter:
        // иначе в эпохах долгих жизней притяжение к середине эпохи уводит недатированного ребёнка за смерть родителя
        ineqs.push({ i: B(id), j: D(e.parent), delta: e.kind === 'father' ? -1 : 0, w: 5, kind: 'ge' });
      }
    }
    // порядок братьев (MAP-54): младшие не раньше старших, шаг — не меньше года
    for (const [a, b, step] of siblingPairs(g, id)) {
      if (sibSeen.has(`${a}|${b}`)) continue; // та же пара от второго родителя
      sibSeen.add(`${a}|${b}`);
      if (rootOf(B(a)).root === rootOf(B(b)).root) continue; // близнецы (Фарес и Зара: смещение 0) и числа текста
      ineqs.push({ i: B(a), j: B(b), delta: step, w: SIB_W, kind: 'ge' });
      sibPairs.push([a, b, step]);
    }
    // супруги — одного поколения. Притяжение к «муж + 3» слабее, чем у матери к детям (A15; MAP-22): год рождения жены
    // выводится прежде всего из рождения её детей, а к году мужа тянется, только когда о ней больше ничего не известно.
    // Граница [муж − 15; муж + 30] (CARD-61) сильнее слабых притяжений поколения и эпохи, но слабее чисел текста
    // и границ «ребёнок — не раньше 13 лет родителя»: где её не удержать, решатель записывает напряжение (п. 7).
    for (const s of g.spousesOf.get(id) ?? []) {
      if (s.a !== id) continue;
      const n = coupleNorm(s.a, s.b);
      ineqs.push({ i: B(s.a), j: B(s.b), delta: 3, w: SPOUSE_W / (n.sigma * n.sigma), kind: 'eq' });
      const band = spouseBand(n);
      const hw = sexOf(s.a) === 'm' && sexOf(s.b) === 'f';
      const lo = hw ? band.lo : band.hi;
      ineqs.push({ i: B(s.a), j: B(s.b), delta: -lo, w: SPOUSE_BAND_W / (n.sigma * n.sigma), kind: 'ge' });
      ineqs.push({ i: B(s.a), j: B(s.b), delta: band.hi, w: SPOUSE_BAND_W / (n.sigma * n.sigma), kind: 'le' });
    }
    // родство в свойстве словами Писания (KIN_GENS; MAP-69): «Анна… тесть Каиафе» (Ин 18:13) — старше зятя на поколение.
    // Притяжение — как у пары «родитель — ребёнок», граница «старший не моложе младшего» — как у супругов; толкование
    // («зять (по толкованию Лк 3:23)») не в счёт
    for (const k of p.kin ?? []) {
      const gs = KIN_GENS[k.rel];
      if (!gs || k.cert === 'interpretation' || !g.persons.has(k.id)) continue;
      const [older, younger] = gs > 0 ? [id, k.id] : [k.id, id];
      if (kinSeen.has(`${older}|${younger}`)) continue;
      kinSeen.add(`${older}|${younger}`);
      const n = normFor(guessEpoch(older) ?? guessEpoch(younger));
      ineqs.push({ i: B(older), j: B(younger), delta: n.g * Math.abs(gs), w: 1 / (n.sigma * n.sigma), kind: 'eq' });
      ineqs.push({ i: B(older), j: B(younger), delta: 0, w: SPOUSE_BAND_W / (n.sigma * n.sigma), kind: 'ge' });
    }
  }

  // цепочки с пропуском поколений (Мф 1:13–15: одиннадцать имён на пять веков): у звена между двумя такими связями
  // одно поколение не известно, поэтому оно только выравнивается посередине между соседями — без этого
  // звенья цепочки сбиваются в кучу на минимальном шаге поколения у одного из её концов.
  // Только для соседей из той же или смежной эпохи: «Шеломиф, сын Ицгара» при Давиде — потомок через века,
  // и середина между Ицгаром и сыном Шеломифа увела бы его далеко от засвидетельствованных лет.
  // Эпоха лица без пометы эпохи — по закреплённому году или по засвидетельствованным годам.
  const epochIdx = new Map(epochs.map((e, i) => [e.id, i]));
  const epochIndexOf = (id: string): number | undefined => {
    const e = guessEpoch(id);
    return e === null ? undefined : epochIdx.get(e);
  };
  const near = (a: string, b: string) => {
    const ia = epochIndexOf(a);
    const ib = epochIndexOf(b);
    return ia !== undefined && ib !== undefined && Math.abs(ia - ib) <= 1;
  };
  const mids: { x: string; p: string; c: string; w: number }[] = [];
  for (const id of g.order) {
    const up = (g.parentsOf.get(id) ?? []).find((e) => e.kind === 'father' && e.gap);
    if (!up) continue;
    const down = (g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' && e.gap);
    if (down.length === 1 && near(up.parent, id) && near(id, down[0].child)) mids.push({ x: B(id), p: B(up.parent), c: B(down[0].child), w: 0.02 });
  }

  // --- 4. переменные — корни компонент
  const allKeys = new Set<string>();
  for (const id of g.order) {
    allKeys.add(B(id));
    allKeys.add(D(id));
  }
  const rootOffset = new Map<string, { root: string; off: number }>();
  for (const k of allKeys) rootOffset.set(k, rootOf(k));
  const value = new Map<string, number>(); // значения корней
  const free = new Set<string>();
  for (const k of allKeys) {
    const { root } = rootOffset.get(k)!;
    if (fixed.has(root)) value.set(root, fixed.get(root)!.value);
    else free.add(root);
  }
  // корни, у которых из смерти нет никаких данных, не должны тянуть решение: смерть без возраста — отдельная свободная переменная
  const hasDeathData = (id: string) => {
    const r = rootOffset.get(D(id))!;
    // допустимый интервал года смерти (died.range) — тоже сведение о смерти
    return r.root !== D(id) || fixed.has(D(id)) || !!g.persons.get(id)?.chrono?.died?.range;
  };

  const val = (key: string): number | undefined => {
    if (key.startsWith('@')) return Number(key.slice(1));
    const ro = rootOffset.get(key);
    if (!ro) return undefined;
    const v = value.get(ro.root);
    return v === undefined ? undefined : v + ro.off;
  };

  // начальные значения свободных корней: распространение от закреплённых по поколениям
  const init = new Map<string, number>();
  const queue: string[] = [];
  for (const id of g.order) {
    const v = val(B(id));
    if (v !== undefined) {
      init.set(id, v);
      queue.push(id);
    }
  }
  // мягкие опоры: засвидетельствованная жизнь, царствование, допустимый интервал рождения —
  // от них оценка тоже расходится по родству (иначе отцы без дат стартуют с условного −1000)
  for (const id of g.order) {
    if (init.has(id)) continue;
    const c = g.persons.get(id)!.chrono;
    let v: number | undefined;
    if (c?.active) v = toAstro(c.active.from) - 30;
    else if (c?.reign?.length) v = toAstro(c.reign[0].start) - 25;
    else if (c?.born?.range) v = (toAstro(c.born.range[0]) + toAstro(c.born.range[1])) / 2;
    if (v !== undefined) {
      init.set(id, v);
      queue.push(id);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const v = init.get(id)!;
    const n = normFor(epochOf(id));
    // по связям с пропуском поколений («из сыновей X», fatherGap) начальная оценка не распространяется:
    // иначе потомок родоначальника колена стартует от времени патриархов, и слабые притяжения не успевают его вернуть
    for (const e of g.childrenOf.get(id) ?? []) if (!e.gap && !init.has(e.child)) { init.set(e.child, v + n.g); queue.push(e.child); }
    for (const e of g.parentsOf.get(id) ?? []) if (!e.gap && !init.has(e.parent)) { init.set(e.parent, v - n.g); queue.push(e.parent); }
    for (const s of g.spousesOf.get(id) ?? []) {
      const o = s.a === id ? s.b : s.a;
      if (!init.has(o)) { init.set(o, v); queue.push(o); }
    }
  }
  for (const id of g.order) {
    const ro = rootOffset.get(B(id))!;
    if (value.has(ro.root)) continue;
    let guess = init.get(id);
    if (guess === undefined) {
      const pr = priors.get(B(id));
      guess = pr ? (pr.lo + pr.hi) / 2 : toAstro(-1000);
    }
    if (!value.has(ro.root)) value.set(ro.root, guess - ro.off);
  }
  for (const id of g.order) {
    const ro = rootOffset.get(D(id))!;
    if (!value.has(ro.root)) {
      const b = val(B(id))!;
      value.set(ro.root, b + normFor(epochOf(id)).life - ro.off);
    }
  }

  // --- 5. Гаусс — Зейдель по свободным корням
  type Term = { other: string; other2?: string; sign: 1 | -1; delta: number; w: number; kind: Ineq['kind'] | 'mid'; selfOff: number };
  const terms = new Map<string, Term[]>();
  const addTerm = (root: string, t: Term) => {
    const a = terms.get(root);
    if (a) a.push(t);
    else terms.set(root, [t]);
  };
  for (const q of ineqs) {
    const ri = q.i.startsWith('@') ? null : rootOffset.get(q.i);
    const rj = q.j.startsWith('@') ? null : rootOffset.get(q.j);
    if (ri && free.has(ri.root) && !q.onlyJ) addTerm(ri.root, { other: q.j, sign: -1, delta: q.delta, w: q.w, kind: q.kind, selfOff: ri.off });
    if (rj && free.has(rj.root)) addTerm(rj.root, { other: q.i, sign: 1, delta: q.delta, w: q.w, kind: q.kind, selfOff: rj.off });
  }
  for (const m of mids) {
    const ro = rootOffset.get(m.x)!;
    if (free.has(ro.root)) addTerm(ro.root, { other: m.p, other2: m.c, sign: 1, delta: 0, w: m.w, kind: 'mid', selfOff: ro.off });
  }
  for (const [key, pr] of priors) {
    const ro = rootOffset.get(key)!;
    if (!free.has(ro.root)) continue;
    addTerm(ro.root, { other: `@${pr.lo}`, sign: 1, delta: 0, w: pr.w, kind: 'ge', selfOff: ro.off });
    addTerm(ro.root, { other: `@${pr.hi}`, sign: 1, delta: 0, w: pr.w, kind: 'le', selfOff: ro.off });
  }

  const freeRoots = [...free].filter((r) => terms.has(r));
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    let maxMove = 0;
    for (const r of freeRoots) {
      const cur = value.get(r)!;
      let num = 0;
      let den = 0;
      for (const t of terms.get(r)!) {
        let ov = val(t.other);
        if (ov === undefined) continue;
        if (t.kind === 'mid') {
          const ov2 = val(t.other2!);
          if (ov2 === undefined) continue;
          ov = (ov + ov2) / 2;
        }
        // собственное значение в терминах ограничения: x_self = cur + selfOff
        // sign = +1: x_self − x_other (≥|=|≤) delta → цель x_self = x_other + delta
        // sign = −1: x_other − x_self (≥|=|≤) delta → цель x_self = x_other − delta
        const target = t.sign === 1 ? ov + t.delta : ov - t.delta;
        const self = cur + t.selfOff;
        let active = true;
        if (t.kind === 'ge') active = t.sign === 1 ? self < target : self > target;
        if (t.kind === 'le') active = t.sign === 1 ? self > target : self < target;
        if (!active) continue;
        num += t.w * (target - t.selfOff);
        den += t.w;
      }
      if (den === 0) continue;
      const next = cur + 0.9 * (num / den - cur);
      maxMove = Math.max(maxMove, Math.abs(next - cur));
      value.set(r, next);
    }
    if (maxMove < SWEEP_EPS) break;
  }
  newtonPolish({ ineqs, mids, priors, rootOffset, value, free });

  // --- 6. классы дат и неопределённость
  const cls = new Map<string, DateClass>();
  for (const id of g.order) {
    const ro = rootOffset.get(B(id))!;
    const f = fixed.get(ro.root);
    if (f) cls.set(id, f.cls);
    else {
      const informative = (g.parentsOf.get(id)?.length ?? 0) + (g.childrenOf.get(id)?.length ?? 0) + (g.spousesOf.get(id)?.length ?? 0) > 0;
      const c = g.persons.get(id)!.chrono;
      cls.set(id, informative || c?.active || c?.reign?.length ? 'estimated' : 'epochal');
    }
  }
  // расстояние в поколениях до датированных лиц (вверх и вниз)
  const distUp = new Map<string, number>();
  const distDown = new Map<string, number>();
  const bfs = (dist: Map<string, number>, next: (id: string) => string[]) => {
    const q: string[] = [];
    for (const id of g.order) if (cls.get(id) === 'exact' || cls.get(id) === 'calculated') { dist.set(id, 0); q.push(id); }
    while (q.length) {
      const id = q.shift()!;
      for (const n of next(id)) if (!dist.has(n)) { dist.set(n, dist.get(id)! + 1); q.push(n); }
    }
  };
  bfs(distUp, (id) => (g.childrenOf.get(id) ?? []).map((e) => e.child)); // от датированных предков вниз
  bfs(distDown, (id) => (g.parentsOf.get(id) ?? []).map((e) => e.parent)); // от датированных потомков вверх

  // знак у первого засвидетельствованного года (MAP-69) — у лиц, засвидетельствованных не раньше MARK_FROM_EPOCH
  const markEpoch = mEpochById.get(MARK_FROM_EPOCH);
  const markFrom = markEpoch ? toAstro(markEpoch.start) : Infinity;
  // скобка «время не установлено» (MAP-52): годы засвидетельствованной деятельности или эпохи, звезда — в середине
  const whenOf = whenSpans({ g, epochs: mEpochs, cls, b: (x) => val(B(x))!, d: (x) => (hasDeathData(x) ? val(D(x))! : null) });

  const persons = new Map<string, PersonChrono>();
  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const k = cls.get(id)!;
    const bracket = k === 'epochal' ? whenOf(id) : null;
    const b = bracket ? (bracket.lo + bracket.hi) / 2 : val(B(id))!;
    const ep = epochAt(mEpochs, b);
    const epochId = p.chrono?.epoch ?? ep?.id ?? null;
    const n = normFor(epochId);
    let half: number;
    if (k === 'exact') half = 0;
    else if (k === 'calculated') half = 2;
    else {
      const a = distUp.get(id);
      const c = distDown.get(id);
      let v: number;
      if (a !== undefined && c !== undefined) v = (a * c) / (a + c);
      else if (a !== undefined || c !== undefined) v = (a ?? c)!;
      else v = 6;
      half = Math.min(1.64 * n.sigma * Math.sqrt(Math.max(v, 0.5)), 400);
    }
    let bLo = b - half;
    let bHi = b + half;
    if (bracket) {
      bLo = bracket.lo;
      bHi = bracket.hi;
    }
    // интервал рождения не шире допустимого интервала данных (born.range: «во время войны с Аммонитянами»)
    const br = p.chrono?.born?.range;
    if (br && !bracket && k !== 'exact' && k !== 'calculated') {
      bLo = Math.max(bLo, toAstro(br[0]));
      bHi = Math.min(bHi, toAstro(br[1]));
    }
    bLo = Math.min(bLo, b);
    bHi = Math.max(bHi, b);
    // смерть: по возрасту — тот же интервал, что у рождения; по закреплённому году — точно;
    // только по допустимому интервалу (died.range) — сам интервал, а не «рождение + обычная длина жизни»
    let d: number | null = null;
    let dLo: number | null = null;
    let dHi: number | null = null;
    const rd = rootOffset.get(D(id))!;
    const rb = rootOffset.get(B(id))!;
    const sameRoot = rd.root === rb.root; // возраст при смерти назван текстом
    if (hasDeathData(id)) {
      d = val(D(id))!;
      const dr = p.chrono?.died?.range;
      if (fixed.has(rd.root) && !sameRoot) {
        const exact = fixed.get(rd.root)!.cls === 'exact';
        dLo = d - (exact ? 0 : 2);
        dHi = d + (exact ? 0 : 2);
      } else if (sameRoot) {
        dLo = bLo + (d - b);
        dHi = bHi + (d - b);
      } else if (dr) {
        // допустимый интервал — граница текста: мягкое притяжение не выводит год смерти за него
        dLo = Math.max(toAstro(dr[0]), b);
        dHi = Math.max(toAstro(dr[1]), dLo);
        d = Math.min(Math.max(d, dLo), dHi);
      } else {
        dLo = d - half;
        dHi = d + half;
      }
    }
    const dAge = lxx && p.chrono?.died?.ageBracket !== undefined ? p.chrono.died.ageBracket : p.chrono?.died?.age;
    const infant = dAge !== undefined && dAge < INFANT_AGE;
    let last: number | null = null;
    let first = Infinity; // самое раннее засвидетельствованное событие жизни с минимальным возрастом (MAP-53)
    const c = p.chrono;
    const bump = (y: number | undefined, minAge = 0) => {
      if (y === undefined) return;
      last = last === null ? y : Math.max(last, y);
      first = Math.min(first, y - minAge);
    };
    // начало служения и царствования — не моложе наименьшего возраста роли (ROLE_MIN_AGE; MAP-53): пророк не «рождается»
    // за 4 года до гибели; без такой роли — упоминание в любом возрасте
    if (c?.active) {
      bump(toAstro(c.active.to));
      first = Math.min(first, toAstro(c.active.from) - (roleMinAge(p, minReignAge) ?? 0));
    }
    for (const r of c?.reign ?? []) {
      bump(toAstro(r.end));
      first = Math.min(first, toAstro(r.start) - (r.ageAtStart ?? minReignAge));
    }
    for (const e of p.card?.events ?? []) if (e.year !== undefined) bump(toAstro(e.year));
    for (const e of p.card?.events ?? []) if (e.age !== undefined) bump(b + e.age, e.age);
    // рождение ребёнка — засвидетельствованная жизнь родителя, но не «потомка» через пропуск поколений
    for (const e of g.childrenOf.get(id) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && !e.gap) {
      const cb = val(B(e.child));
      if (cb !== undefined && cls.get(e.child) !== 'epochal') bump(e.kind === 'father' ? cb - 1 : cb, PARENT_MIN_AGE - (e.kind === 'father' ? 1 : 0));
    }
    // MAP-53: верхний край рождения — не позже смерти и не позже самого раннего засвидетельствованного события
    // (упоминание — в любом возрасте, рождение ребёнка — не моложе 13 лет); оценка остаётся внутри промежутка
    if (!bracket && k !== 'exact' && k !== 'calculated') {
      let cap = first;
      if (d !== null && !sameRoot) cap = Math.min(cap, dHi ?? d);
      if (cap < bHi) {
        bHi = Math.max(cap, b);
        if (sameRoot && d !== null) dHi = bHi + (d - b);
      }
    }
    const dEst = d ?? Math.max(last ?? -Infinity, b + n.life);
    const named = p.kind === 'people' || p.kind === 'clan';
    // знак у первого засвидетельствованного года (MAP-69; решение 38): год, когда лицо заведомо живо, — начало служения
    // или царствования, событие с годом, свой год смерти, начало допустимого интервала смерти («умер между 30 и 34»)
    let attest = Infinity;
    if (c?.active) attest = Math.min(attest, toAstro(c.active.from));
    for (const r of c?.reign ?? []) attest = Math.min(attest, toAstro(r.start));
    for (const e of p.card?.events ?? []) if (e.year !== undefined) attest = Math.min(attest, toAstro(e.year));
    if (d !== null && !sameRoot && fixed.has(rd.root)) attest = Math.min(attest, d);
    if (c?.died?.range) attest = Math.min(attest, toAstro(c.died.range[0]));
    const mark = k === 'estimated' && !named && !infant && bHi - bLo > WIDE_BIRTH && attest >= markFrom && Number.isFinite(attest) && attest > b ? attest : undefined;
    persons.set(id, {
      b, bLo, bHi, d, dLo, dHi, lastAttested: last, dEst, cls: k, epoch: ep?.id ?? null,
      ...(infant ? { infant } : {}),
      ...(named ? { named } : {}),
      ...(bracket ? { when: bracket.when } : {}),
      ...(d !== null ? { dAge: sameRoot } : {}),
      ...(mark !== undefined ? { mark } : {}),
    });
  }

  // порядок перечисления братьев (MAP-54): год оценён по порядку, если граница «младший — через год» удерживает его
  for (const [a, b2, step] of sibPairs) {
    const pa = persons.get(a)!;
    const pb = persons.get(b2)!;
    if (pb.b - pa.b > step + 0.75) continue;
    if (pa.cls === 'estimated') pa.byOrder = true;
    if (pb.cls === 'estimated') pb.byOrder = true;
  }

  // --- 7. напряжения между датированными лицами
  // «сын не помещается в жизнь отца» — по паре; если пара входит в цепочку поколений с напряжением,
  // подробность переходит в текст цепочки, чтобы в карточке была одна связная запись (CARD-18)
  const afterDeath = new Map<string, { t: Tension; child: string; years: number }>();
  const uniq = (xs: string[]) => [...new Set(xs)];
  for (const id of g.order) {
    const me = persons.get(id)!;
    for (const e of g.parentsOf.get(id) ?? []) {
      if (e.kind !== 'father' && e.kind !== 'mother') continue;
      const par = persons.get(e.parent)!;
      const dated = (x: PersonChrono) => x.cls === 'exact' || x.cls === 'calculated';
      const head = chainOf(g, [e.parent, id]);
      const kid = kidNoun(g, id);
      const parent = parentGen(e.kind);
      const refs = uniq([...(g.persons.get(e.parent)!.chrono?.died?.refs ?? []), ...(g.persons.get(id)!.chrono?.born?.refs ?? []), ...e.refs]);
      if (!dated(me) || !dated(par)) {
        // даже при оценочных датах: если возраст родителя при смерти задан текстом, а ребёнок никак не помещается
        if (par.d !== null && me.b > par.d + 3 && !e.gap) {
          const years = Math.round(me.b - par.d);
          const t: Tension = {
            persons: [e.parent, id],
            text: `${head}: по возрастам, названным в тексте, ${kid} не помещается в жизнь ${parent}: при принятых годах рождение приходится примерно на ${yearsWord(years)} позже ${e.kind === 'mother' ? 'её' : 'его'} смерти. Вероятно, родословие называет не все поколения.`,
            refs,
            kind: 'pair',
            cert: 'interpretation',
          };
          tensions.push(t);
          afterDeath.set(`${e.parent}|${id}`, { t, child: id, years });
        }
        continue;
      }
      const age = me.b - par.b;
      if (par.d !== null && me.b > par.d + (e.kind === 'father' ? 1 : 0) + 0.5) {
        const years = Math.round(me.b - par.d);
        const t: Tension = {
          persons: [e.parent, id],
          text: `${head}: по числам текста ${kid} рождается через ${yearsWord(years)} после смерти ${parent}. Вероятно, родословие сокращено или ${e.kind === 'mother' ? `мать здесь${NB}— более далёкая прародительница` : `отец здесь${NB}— более далёкий предок`}.`,
          refs,
          kind: 'pair',
          cert: 'interpretation',
        };
        tensions.push(t);
        afterDeath.set(`${e.parent}|${id}`, { t, child: id, years });
      } else if (e.kind === 'father' && age < 13) {
        tensions.push({
          persons: [e.parent, id],
          text: `${head}: по годам правления и возрасту при воцарении отцу при рождении ${kidGen(g, id)} выходит ${yearsWord(Math.round(age))}. Вероятно, какое-то из чисел считает совместное правление или передано иначе.`,
          refs: uniq([...(g.persons.get(id)!.chrono?.reign ?? []).flatMap((r) => r.refs), ...(g.persons.get(e.parent)!.chrono?.reign ?? []).flatMap((r) => r.refs), ...refs]),
          kind: 'numbers',
        });
      } else if (e.kind === 'mother' && age > 60 && !LONG_LIVES.has(me.epoch ?? '') && g.persons.get(id)!.chrono?.born?.motherAge === undefined) {
        tensions.push({ persons: [e.parent, id], text: `${head}: при принятых годах матери при рождении ${kidGen(g, id)} выходит ${yearsWord(Math.round(age))}.`, refs, kind: 'pair' });
      }
    }
  }
  // цепочки недатированных между датированными: средняя длина поколения вне пределов эпохи
  const merged = new Set<Tension>();
  const entry = jacobBirth + 130; // вход Иакова в Египет (Быт 47:9)
  for (const id of g.order) {
    const me = persons.get(id)!;
    if (me.cls !== 'exact' && me.cls !== 'calculated') continue;
    let cur = id;
    let steps = 0;
    const chain: string[] = [id];
    for (;;) {
      const f = fatherOf(g, cur) ?? motherOf(g, cur);
      if (!f) break;
      steps++;
      chain.push(f);
      const pc = persons.get(f)!;
      if (pc.cls === 'exact' || pc.cls === 'calculated') {
        if (steps >= 2) {
          const avg = (me.b - pc.b) / steps;
          const n = normFor(pc.epoch);
          const long = avg > n.max * 1.05;
          if (long || avg < n.min * 0.9) {
            const down = [...chain].reverse(); // от предка к потомку
            const parts = [`${chainOf(g, down)}: ${gens(steps)} на ${yearsWord(Math.round(me.b - pc.b))}, в среднем по ${yearsWord(Math.round(avg))} на поколение.`];
            const refs: string[] = [];
            // цепочка проходит через 430 (215) лет пребывания в Египте: число пребывания — главная причина
            const crossesEgypt = g.persons.has('iakov') && pc.b < entry && me.b > entry;
            if (crossesEgypt && long) {
              parts.push(modelId === 'mt-short' ? `Так выходит при 215${NB}годах пребывания в Египте (скобки Исх${NB}12:40; Гал${NB}3:17).` : `Так выходит при 430${NB}годах пребывания в Египте (Исх${NB}12:40).`);
              refs.push('Исх 12:40');
              if (modelId === 'mt-short') refs.push('Гал 3:17');
            }
            // стихи с числами — первыми: возраст при смерти промежуточных звеньев, год рождения потомка; затем стихи родства
            for (const x of down.slice(1, -1)) refs.push(...(g.persons.get(x)!.chrono?.died?.refs ?? []));
            refs.push(...(g.persons.get(id)!.chrono?.born?.refs ?? []));
            // подробности пар «рождается после смерти отца» внутри цепочки
            const inner: string[] = [];
            for (let k = 0; k + 1 < down.length; k++) {
              const pair = afterDeath.get(`${down[k]}|${down[k + 1]}`);
              if (!pair) continue;
              merged.add(pair.t);
              inner.push(`${g.persons.get(pair.child)!.name}${NB}— примерно через ${yearsWord(pair.years)} после смерти ${parentGen(g.persons.get(pair.child)!.mother === down[k] ? 'mother' : 'father')}`);
              refs.push(...pair.t.refs);
            }
            if (inner.length) parts.push(`По возрастам, названным в тексте, поколения не помещаются одно в жизнь другого: ${inner.join('; ')}.`);
            parts.push(long ? 'Вероятно, родословие называет не все поколения.' : 'Вероятно, в родословии названы не отцы и сыновья, а более далёкие предки и потомки.');
            refs.push(...down.flatMap((x) => g.persons.get(x)!.parentRefs ?? []));
            tensions.push({ persons: down, text: parts.join(' '), refs: uniq(refs).slice(0, 8), kind: 'chain', cert: 'interpretation' });
          }
        }
        break;
      }
      // предок без дат, но с засвидетельствованными годами (служение, царствование): «Салмон → Давид» (ТЗ § 3.6; MAP-51).
      // Рождение такого предка — не позже начала служения без 12 лет (как у решателя), поэтому цепочка до датированного
      // потомка не короче me.b − (from − 12). Если и это больше поколений эпох цепочки — напряжение; иначе идём выше.
      const act = attestedFrom(g.persons.get(f)!, minReignAge);
      if (act && steps >= 2) {
        const bMax = act.from - act.minAge;
        const total = me.b - bMax;
        const avg = total / steps;
        const down = [...chain].reverse();
        const nMax = down.slice(0, -1).reduce((s, x) => s + normFor(persons.get(x)!.epoch).max, 0) / steps;
        if (avg > nMax * 1.05) {
          const who = g.persons.get(f)!;
          const kid = g.persons.get(id)!;
          const text =
            `${chainOf(g, down)}: ${gens(steps)}${NB}— не меньше чем ${yearsWord(Math.round(total))}, в среднем не меньше чем по ${yearsWord(Math.round(avg))} на поколение ` +
            `(${who.name} ${who.sex === 'f' ? 'засвидетельствована' : 'засвидетельствован'} уже в ${formatYear(act.from)}, ${kid.name} ${kid.sex === 'f' ? 'родилась' : 'родился'} ` +
            `${me.cls === 'exact' ? 'в' : 'около'} ${formatYear(me.b)}). Вероятно, родословие называет не все поколения.`;
          const refs: string[] = [...act.refs.slice(0, 2), ...(kid.chrono?.born?.refs ?? []).slice(0, 2)];
          // стихи родства: сначала первый стих каждого звена (Руф 4:20–22), затем остальные
          for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(0, 1));
          for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(1));
          tensions.push({ persons: down, text, refs: uniq(refs).slice(0, 8), kind: 'chain', cert: 'interpretation' });
          break;
        }
      }
      cur = f;
      if (steps > 60) break;
    }
  }
  if (merged.size) tensions.splice(0, tensions.length, ...tensions.filter((t) => !merged.has(t)));

  // --- 7а. растянутые жизни (MAP-51; решение владельца 24): сплошная часть следа — от рождения до смерти или
  // последнего события (как в engine/layout.ts, drawn) — длиннее предела жизни эпохи, и длину не назвал текст.
  // Так бывает, когда родословие сжато (Руф 4:18–22; Исх 6:16–20): решатель растягивает поколения, чтобы звенья
  // дотянулись до датированных лиц. Лицу — разрыв следа (brk), цепочке — напряжение с пометой «толкование».
  const stretched = new Map<string, { child: string | null; end: number; atDeath: boolean; limit: number }>();
  for (const id of g.order) {
    const me = persons.get(id)!;
    const p = g.persons.get(id)!;
    if (me.cls === 'epochal' || me.named || me.infant) continue;
    const died = p.chrono?.died;
    const rangeOnly = !!died?.range && died.age === undefined && died.year === undefined;
    let end: number;
    if (me.d !== null && !rangeOnly) end = Math.max(me.b, me.d);
    else if (me.d !== null) end = Math.max(me.b, me.dLo ?? me.b, me.lastAttested ?? -Infinity);
    else if (me.lastAttested !== null) end = Math.max(me.b, me.lastAttested);
    else continue;
    const n = normFor(p.chrono?.epoch ?? me.epoch);
    if (end - me.b <= n.lifeMax + 0.5) continue;
    // длину жизни назвал текст — возраст при смерти (Аарон — 123 года, Иодай — 130) или оба года
    const rd = rootOffset.get(D(id))!.root;
    if (me.d !== null && end <= me.d + 0.5 && (rd === rootOffset.get(B(id))!.root || ((me.cls === 'exact' || me.cls === 'calculated') && fixed.has(rd)))) continue;
    let child: string | null = null;
    for (const e of g.childrenOf.get(id) ?? []) {
      if ((e.kind !== 'father' && e.kind !== 'mother') || e.gap) continue;
      const cc = persons.get(e.child)!;
      if (cc.cls === 'epochal') continue;
      if (Math.abs((e.kind === 'father' ? cc.b - 1 : cc.b) - end) < 0.5) {
        child = e.child;
        break;
      }
    }
    const atDeath = !child && me.d !== null && (Math.abs(end - me.d) < 0.5 || Math.abs(end - (me.dLo ?? me.d)) < 0.5);
    me.brk = me.b + n.lifeMax;
    stretched.set(id, { child, end, atDeath, limit: n.lifeMax });
  }
  const nextOf = new Map<string, string>();
  for (const [x, s] of stretched) if (s.child && stretched.has(s.child)) nextOf.set(x, s.child);
  const hasPrev = new Set(nextOf.values());
  const nameOf = (x: string) => g.persons.get(x)!.name;
  const poss = (x: string) => (g.persons.get(x)!.sex === 'f' ? 'её' : 'его');
  for (const start of stretched.keys()) {
    if (hasPrev.has(start)) continue;
    const links = [start];
    let cur = start;
    while (nextOf.has(cur) && links.length < 30) {
      cur = nextOf.get(cur)!;
      links.push(cur);
    }
    const tail = stretched.get(cur)!;
    const par = fatherOf(g, start) ?? motherOf(g, start);
    const parEdge = par ? (g.parentsOf.get(start) ?? []).find((e) => e.parent === par) : undefined;
    const up = par && !parEdge?.gap ? par : null;
    const down = [...(up ? [up] : []), ...links, ...(tail.child ? [tail.child] : [])];
    // цепочка уже объяснена напряжением поколений между датированными лицами (Наассон — … — Давид)
    if (tensions.some((t) => t.kind === 'chain' && links.every((x) => t.persons.includes(x)))) continue;
    const limit = Math.max(...links.map((x) => stretched.get(x)!.limit));
    const parts: string[] = [];
    if (links.length === 1) {
      const x = links[0];
      const from = up ? `от рождения ${kidGen(g, x)}` : `от ${poss(x)} рождения`;
      const to = tail.child ? `до рождения ${poss(x)} ${kidGen(g, tail.child)}` : tail.atDeath ? `до ${poss(x)} смерти` : 'до последнего упоминания';
      parts.push(`${chainOf(g, down)}: по принятым годам ${from} ${to} проходит примерно ${yearsWord(Math.round(tail.end - persons.get(x)!.b))}${NB}— больше предела жизни этого времени (${yearsWord(limit)}).`);
    } else {
      const t0 = persons.get(down[0])!.b;
      const t1 = tail.child ? persons.get(tail.child)!.b : tail.end;
      parts.push(
        `${chainOf(g, down)}: по принятым годам ${gens(down.length - 1)} занимают примерно ${yearsWord(Math.round(t1 - t0))}, и у звеньев цепочки от рождения до рождения ребёнка проходит больше предела жизни этого времени (${yearsWord(limit)}).`,
      );
    }
    const refs: string[] = [];
    const first = persons.get(down[0])!;
    const lastB = persons.get(down[down.length - 1])!;
    if (g.persons.has('iakov') && first.b < entry + 1 && lastB.b > entry) {
      parts.push(modelId === 'mt-short' ? `Так выходит при 215${NB}годах пребывания в Египте (скобки Исх${NB}12:40; Гал${NB}3:17).` : `Так выходит при 430${NB}годах пребывания в Египте (Исх${NB}12:40).`);
      refs.push('Исх 12:40');
      if (modelId === 'mt-short') refs.push('Гал 3:17');
    }
    parts.push('Вероятно, родословие называет не все поколения.');
    // стихи с числами — первыми: возраст при смерти, рождение последнего; затем стихи родства звеньев
    // возраст при смерти предка и звеньев, рождение звеньев и последнего в цепочке, затем рождение предка
    for (const x of [...(up ? [up] : []), ...links]) refs.push(...(g.persons.get(x)!.chrono?.died?.refs ?? []).slice(0, 1));
    for (const x of links) refs.push(...(g.persons.get(x)!.chrono?.born?.refs ?? []).slice(0, 2));
    if (tail.child) refs.push(...(g.persons.get(tail.child)!.chrono?.born?.refs ?? []).slice(0, 1));
    if (up) refs.push(...(g.persons.get(up)!.chrono?.born?.refs ?? []).slice(0, 2));
    for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(0, 1));
    for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(1));
    tensions.push({ persons: down, text: parts.join(' '), refs: uniq(refs).slice(0, 8), kind: 'stretched', cert: 'interpretation' });
  }

  // --- 7б. супруги не одного поколения (CARD-61): граница [муж − 15; муж + 30] (в эпохах долгих поколений — шире)
  // не удержалась больше чем на SPOUSE_SLACK лет. Запись — в § 13 обоих; если одного из супругов растянуло сжатое
  // родословие, текст называет то напряжение.
  for (const [id, edges] of g.spousesOf) {
    for (const s of edges) {
      if (s.a !== id) continue;
      const a = persons.get(s.a)!;
      const w = persons.get(s.b)!;
      if (a.cls === 'epochal' || w.cls === 'epochal' || a.named || w.named) continue;
      const band = spouseBand(coupleNorm(s.a, s.b));
      const hw = sexOf(s.a) === 'm' && sexOf(s.b) === 'f';
      const diff = w.b - a.b;
      const lo = hw ? band.lo : band.hi;
      if (diff <= band.hi + SPOUSE_SLACK && diff >= -(lo + SPOUSE_SLACK)) continue;
      const years = Math.round(Math.abs(diff));
      const rel = hw ? (diff > 0 ? 'жена моложе мужа' : 'жена старше мужа') : 'супруги различаются по возрасту';
      const usual = diff > 0 ? band.hi : lo;
      const about = (k: Tension['kind']) => tensions.find((t) => t.kind === k && (t.persons.includes(s.a) || t.persons.includes(s.b)));
      const related = about('stretched') ?? about('chain') ?? about('pair');
      const parts = [`${chainOf(g, [s.a, s.b])}: по принятым годам ${rel} на ${yearsWord(years)}, а у супругов одного поколения разница обычно не больше чем в ${yearsWord(usual)}.`];
      if (related) parts.push(`Так выходит из-за растянутых поколений: см. напряжение «${related.persons.map(nameOf).join(`${NB}— `)}». Вероятно, родословие называет не все поколения.`);
      else parts.push('Годы обоих выведены из чисел текста и родства, и ближе их не поставить без противоречия другим связям.');
      // стихи брака, затем числа и родство обоих
      const own = [s.a, s.b].flatMap((x) => [...(g.persons.get(x)!.chrono?.died?.refs ?? []).slice(0, 1), ...(g.persons.get(x)!.chrono?.born?.refs ?? []).slice(0, 1), ...(g.persons.get(x)!.parentRefs ?? []).slice(0, 1)]);
      tensions.push({
        persons: [s.a, s.b],
        text: parts.join(' '),
        refs: uniq([...s.refs, ...(related?.refs ?? own)]).slice(0, 8),
        kind: 'spouses',
        ...(related ? { cert: 'interpretation' as const } : {}),
      });
    }
  }

  return { model: modelId, persons, tensions: dedupeTensions(tensions), epochs: mEpochs };
}

/** Короткие названия моделей для текста напряжений. */
const MODEL_SHORT: Record<ChronoModelId, string> = {
  'mt-long': 'масоретские числа, 430\u00a0лет в Египте',
  'mt-short': 'краткое пребывание, 215\u00a0лет в Египте',
  lxx: 'числа в скобках Быт\u00a05 и 11',
  terah70: 'Фарре 70\u00a0лет',
};

/**
 * Дописывает к каждому напряжению, в каких моделях хронологии его нет («В модели „краткое пребывание…“ этого напряжения нет»).
 * Вызывается при сборке, когда решены все модели (tools/build-data.ts): утверждение проверено расчётом, а не предположено.
 */
export function noteModelDifferences(results: { model: ChronoModelId; tensions: Tension[] }[]): void {
  const key = (t: Tension) => t.persons.join('|');
  for (const r of results) {
    for (const t of r.tensions) {
      const absent = results.filter((o) => o.model !== r.model && !o.tensions.some((x) => key(x) === key(t))).map((o) => `«${MODEL_SHORT[o.model]}»`);
      if (!absent.length) continue;
      const list = absent.length === 1 ? absent[0] : `${absent.slice(0, -1).join(', ')} и ${absent[absent.length - 1]}`;
      t.text += ` В ${absent.length === 1 ? 'модели' : 'моделях'} ${list} этого напряжения нет.`;
    }
  }
}

function dedupeTensions(ts: Tension[]): Tension[] {
  const seen = new Set<string>();
  return ts.filter((t) => {
    const k = t.persons.join('|') + t.text; // тексты начинаются с имён, поэтому сравнивается весь текст
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Лица, чьи жизни пересекаются с жизнью данного: «наверняка» — по крайним оценкам, «вероятно» — по центральным. */
export function contemporaries(res: ChronoResult, id: string, limit = 40): { id: string; sure: boolean }[] {
  const me = res.persons.get(id);
  // у народа и рода современников нет (CARD-59; решение 23)
  if (!me || me.named) return [];
  const myEnd = me.d ?? me.dEst;
  const out: { id: string; sure: boolean; overlap: number }[] = [];
  for (const [oid, o] of res.persons) {
    if (oid === id || o.cls === 'epochal' || o.named) continue;
    const oEnd = o.d ?? o.dEst;
    const overlap = Math.min(myEnd, oEnd) - Math.max(me.b, o.b);
    if (overlap <= 0) continue;
    const sureEnd = Math.min(me.d ?? (me.lastAttested ?? me.b), o.d ?? (o.lastAttested ?? o.b));
    const sure = sureEnd - Math.max(me.bHi, o.bHi) > 0;
    out.push({ id: oid, sure, overlap });
  }
  return out.sort((a, b) => Number(b.sure) - Number(a.sure) || b.overlap - a.overlap).slice(0, limit).map(({ id: x, sure }) => ({ id: x, sure }));
}

/**
 * Основа порядкового числительного, как в Синодальном тексте (для сверки синхронизмов «в N-й год X воцарился Y»):
 * 18 → «восемнадцат», 39 → «тридцать девят» («в тридцать девятом году»), 50 → «пятидесят».
 */
export function ordinalStem(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  const units = ['', 'перв', 'втор', 'трет', 'четверт', 'пят', 'шест', 'седьм', 'восьм', 'девят'];
  const teens = ['десят', 'одиннадцат', 'двенадцат', 'тринадцат', 'четырнадцат', 'пятнадцат', 'шестнадцат', 'семнадцат', 'восемнадцат', 'девятнадцат'];
  const tensOrd = ['', '', 'двадцат', 'тридцат', 'сороков', 'пятидесят', 'шестидесят', 'семидесят', 'восьмидесят', 'девяност'];
  const tensCard = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  if (n < 10) return units[n];
  if (n < 20) return teens[n - 10];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? tensOrd[t] : `${tensCard[t]} ${units[u]}`;
}

export type { Person };
