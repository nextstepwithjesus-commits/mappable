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
 * Этап 11 (DF2; сверка с Писанием, находки DG 2.3):
 *  — границы рождения из данных («вошли в Египет с Иаковом», Быт 46:11) жёсткие (BOUND_W): Кааф и Мерари не рождаются
 *    после прихода в Египет, противоречие 430 лет уходит в напряжения цепочки;
 *  — предел «родитель старше на 13 лет, мать — на 14» сильнее мягких связей, в том числе супругов (PARENT_MIN_W): Иосавеф;
 *  — растянутое звено: напряжение и у остальных детей, родившихся после разрыва его следа (Аарон и Мариам — как Моисей);
 *  — ТЗ § 3.6: числа текста о царях при простом сложении («Ахаз → Езекия») и «Мардохей, уведённый с Иехонией» (Есф 2:6);
 *  — сжатое родословие от лица с засвидетельствованными годами без чисел текста (DG 2.3.2): нижняя оценка длины цепочки
 *    без годов-оценок решателя — «Зара — Зимри — Хармий — Ахан» (Нав 7:1).
 *
 * Все годы внутри — астрономические.
 */
import type { Person, Epoch, Role } from '../data/types.ts';
import { type Graph, fatherOf, motherOf, primaryChildren } from './graph.ts';
import { toAstro, toHist, yearsWord, formatYear, lifeText, type LifeDates } from './years.ts';
import { modelEpochs } from './epochs.ts';
import { BOOKS } from './books.ts';
import { firstRefOf } from './layout.ts';
import { nameCase, yearsGen } from '../ui/text/ru.ts';

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
  /** Полное название в списке моделей: «Основной текст: 430 лет в Египте» (решение 102). */
  name: string;
  /** Краткое название для строки показа и колофона: «Основной текст», «Краткое пребывание». */
  short: string;
  /** Входные числа модели со стихами. */
  description: string;
}

/** Опорные события сводки модели (решение 102): сотворение Адама, Потоп, рождение Аврама, вход Иакова в Египет, Исход. */
export type ModelEventId = 'adam' | 'flood' | 'abram' | 'egypt' | 'exodus';

/**
 * Сводка модели (этап 13, решение 102; X1 Х7, X2 § 2.5) — считает сборка (tools/build-data.ts) сравнением с моделью
 * по умолчанию. Список моделей пишет по ней строки «Меняет» и «Напряжения», панель «О хронологии» — таблицу моделей.
 */
export interface ModelInfo extends ChronoModel {
  /** Сколько лиц показаны с другими годами, чем в модели по умолчанию (у неё самой — 0). */
  shifted: number;
  /** Годы опорных событий в этой модели — исторические (−4174 = 4174 г. до Р. Х.). */
  events: { id: ModelEventId; year: number }[];
  /** Число записей напряжений в модели. */
  tensions: number;
  /**
   * Лица после Исхода, чьи годы в этой модели другие (X2 Д12): группы по причине — «родословие 1 Пар 2:34–41 без
   * датированных звеньев после Есрома». Пусто — Исход (1446) и всё после него одинаковы во всех моделях.
   */
  afterExodus: { ids: string[]; shift: [number, number]; why: string }[];
}

/**
 * Основание года лица (этап 13, решения 96, 100): § 13 «Откуда годы», пояснение пометы «расч.», строка «Откуда год»
 * у звезды. Решатель знает его для каждого лица.
 *  numbers  — числа текста от опоры модели: Быт 5; 11, возраст отца или матери, смещение (класс exact);
 *  reign    — реконструкция царствований Тиле — Янга и числа текста о царях (calculated);
 *  year     — явный год данных: внешняя опора (anchors.json) или датированное событие (calculated);
 *  kin      — оценка по поколениям между ближайшими родственниками с годами (ids, gens);
 *  order    — оценка по порядку перечисления братьев и сестёр (ids — старший, после кого);
 *  active   — оценка по годам служения или засвидетельствованной деятельности;
 *  met      — «время не установлено» или оценка по встрече с лицом, чьи годы известны (ids);
 *  mention  — по эпохе книги и главы первого упоминания (ref);
 *  epoch    — по эпохе из данных (отнесение составителя);
 *  bounds   — по границам текста «не раньше», «не позже»;
 *  group    — по годам датированных лиц созвездия;
 *  interp   — по числу с пометой «толкование» (мягко; Аран, Фарре 70);
 *  people   — народ или род: место в родословии, не год рождения.
 */
export type BasisKind = 'numbers' | 'reign' | 'year' | 'kin' | 'order' | 'active' | 'met' | 'mention' | 'epoch' | 'bounds' | 'group' | 'interp' | 'people';
export interface YearBasis {
  kind: BasisKind;
  /** Опорные лица: kin — ближайший датированный предок и (или) потомок; met — с кем встреча; order — старший брат или сестра. */
  ids?: string[];
  /** kin: поколений до опор [вверх, вниз] (0 — опоры в эту сторону нет). */
  gens?: [number, number];
  /** mention: ссылка первого упоминания. */
  ref?: string;
  /** id опоры из data/anchors.json, от которой идёт счёт года (numbers, reign — «solomon-4»; year — опора явного года). */
  anchor?: string;
}

export const MODELS: ChronoModel[] = [
  {
    id: 'mt-long',
    name: 'Основной текст: 430 лет в Египте',
    short: 'Основной текст',
    description:
      'Быт 5 и 11 по основному тексту; Фарре 130 лет при рождении Аврама (Быт 11:32; 12:4; Деян 7:4); 430 лет в Египте (Исх 12:40); Исход — 1446 г. до Р. Х. (3 Цар 6:1 и якорь 967 г.).',
  },
  {
    id: 'mt-short',
    name: 'Краткое пребывание: 215 лет в Египте',
    short: 'Краткое пребывание',
    description: 'То же, но 430 лет считаются от прихода Авраама в Ханаан (скобка Синодального текста Исх 12:40; Гал 3:17).',
  },
  {
    id: 'lxx',
    name: 'Числа в скобках Быт 5 и 11',
    short: 'Числа в скобках',
    description: 'Для праотцев до Авраама берутся числа греческого перевода, напечатанные в квадратных скобках Синодального текста.',
  },
  {
    id: 'terah70',
    name: 'Фарре 70 лет при рождении Аврама',
    short: 'Фарре 70 лет',
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
   *  chain    — цепочка поколений между датированными лицами (или от лица с засвидетельствованными годами) длиннее
   *             или короче поколений эпохи;
   *  stretched — жизнь «до последнего упоминания» длиннее предела жизни эпохи (MAP-51);
   *  spouses  — супруги не одного поколения (CARD-61);
   *  text     — утверждение текста не помещается во время лица: «Мардохей, уведённый с Иехонией» (Есф 2:6; DF2);
   *  compressed — сжатое родословие: между лицами с годами звенья без своих чисел, и в среднем на поколение больше
   *             обычного (Мф 1:13–16; этап 13, решение 100): в § 13 вместо формулы «через N лет после отца».
   */
  kind?: 'numbers' | 'pair' | 'chain' | 'stretched' | 'spouses' | 'text' | 'compressed';
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
  /** Основание года (этап 13, решения 96, 100). */
  basis?: YearBasis;
  /**
   * Эпоха жизни (решение 98; X1 Х1): служение или царствование → события с годом → поле epoch данных → год рождения.
   * Паспорт, мини-шкала, диктор и § 13 называют её одну.
   */
  lifeEpoch?: string | null;
  /** Эпоха года рождения (решение 98): «эпохой рождения» она называется только в § 8 и § 13. */
  birthEpoch?: string | null;
  /** Год по числам, но приблизительный по данным: явный год с пометой «толкование» (Рождество — «ок. 5 г. до Р. Х.»). */
  bApprox?: boolean;
  /** То же у года смерти (Распятие — «ок. 30 г. по Р. Х.»). */
  dApprox?: boolean;
  /** Оценка стоит на границе текста (Х2): 'hi' — «не позже» (Кааф — не позже 1876, Быт 46:11), 'lo' — «не раньше». */
  pin?: 'lo' | 'hi';
  /** Свой год смерти закреплён явным годом или числами текста (не died.range): не оценка. Только при dAge = false. */
  dFixed?: boolean;
  /** Стих последнего засвидетельствованного события (lastAttested): «последнее упоминание — 30 г. по Р. Х. (Деян 1:14)». */
  lastRef?: string;
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
/**
 * Вес порядка рождения из данных (order; этап 13, T4): сильнее границы «рождение не позже года после смерти отца» (5)
 * и притяжений поколения, слабее чисел текста и границ из данных — иначе напряжение 430 лет утягивало Левия к самой
 * поздней границе, позже младших братьев (Быт 29:32–35).
 */
const SIB_ORDER_W = 10;
/** Дети разных матерей с порядком в данных («первенец… второй… шестой», 2 Цар 3:2–5) — шаг не меньше года, но мягче. */
const SIB_STEP_CROSS = 1.25;
/** Родитель при рождении ребёнка не моложе (MAP-53; та же граница, что у решателя для отцов). */
const PARENT_MIN_AGE = 13;
/** Отец при оценочных годах обычно не моложе этого (мягко; X1 В5, П9): 13 лет — только там, где его требуют числа текста. */
const FATHER_USUAL_AGE = 16;
/** Его вес — как у границы «рождение не позже года после смерти отца»: слабее порядка рождения из данных и чисел текста. */
const FATHER_USUAL_W = 5;
/**
 * Вес границ рождения из данных «не раньше / не позже чем через N лет после X» (этап 11, DF2): граница — утверждение
 * текста («вошли в Египет с Иаковом», Быт 46:11), поэтому она жёсткая. При весе 5 она делила нарушение поровну с
 * «родился при жизни отца»: Кааф и Мерари родились у решателя через 30 и 9 лет после прихода в Египет, а противоречие
 * цепочки Левий — Кааф — Амрам — Моисей при 430 годах пребывания пряталось в нарушенной границе. Теперь оно целиком
 * уходит в мягкие связи и видно напряжением.
 */
const BOUND_W = 1000;
/**
 * Вес нижнего предела возраста родителя (PARENT_MIN_AGE; у матери — 14 лет; DF2): сильнее всех мягких связей — супругов
 * одного поколения, порядка братьев, эпохи. Прежде (50/σ²) он уступал границе супругов: у Иосавеф, жены Иодая, умершего
 * 130 лет, отцу Иораму выходило 10,9 года (2 Пар 22:11; 24:15). Слабее только чисел текста и границ из данных.
 */
const PARENT_MIN_W = 100;
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
/**
 * Эпоха из данных — «эпоха жизни» (решение 98): граница рождения — [начало − предел жизни; конец − 1], а внутри неё
 * тяга к рождению не раньше чем за EPOCH_USUAL_BEFORE лет до начала эпохи — с весом прежней границы: лицо, о котором
 * известна только эпоха, остаётся в ней, а раньше уходит только тот, кого держат числа текста и родня с годами.
 */
const EPOCH_USUAL_BEFORE = 30;
const EPOCH_USUAL_W = 0.5;
/** Растянутая жизнь (MAP-51) — длиннее предела жизни эпохи больше чем на столько лет (точность оценки). */
export const STRETCH_SLACK = 1.5;
/** Возраст при смерти меньше этого — «умер младенцем» (A14): след жизни не рисуется, знак †. */
const INFANT_AGE = 2;
/** Вес предела возраста матери: как у порядка братьев — сильнее притяжений поколения, слабее чисел текста. */
const MOTHER_MAX_W = 2;
/** Предел возраста матери при рождении ребёнка во всех эпохах, кроме долгих жизней (мягкий; X1 Х3). */
const MOTHER_MAX = 45;
/** Эпохи долгих поколений: там верхний предел супругов (жена моложе мужа) растёт с длиной поколения. */
export function spouseBand(n: GenNorm): { lo: number; hi: number } {
  const k = Math.max(1, n.g / NORMS.default.g);
  // с поколением растёт только верхняя граница (мужчины у патриархов женились поздно, Быт 25:20; 26:34; 29:20–28),
  // а жена старше мужа не больше чем на SPOUSE_LO лет в любой эпохе (X1 Х3; решение 101)
  return { lo: SPOUSE_LO, hi: Math.round(SPOUSE_HI * k) };
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

/**
 * Эпоха жизни (этап 13, решение 98; X1 Х1) — по первому найденному:
 *  1. годы служения или царствования;
 *  2. события с годом (§ 17);
 *  3. у лица «время не установлено» — скобка засвидетельствованной жизни (встреча, брат, глава упоминания, границы),
 *     если она не из эпохи данных;
 *  4. поле epoch данных — «эпоха жизни» (AUTHORING § 7);
 *  5. эпоха года рождения.
 * Для отрезка — эпоха с наибольшим перекрытием [начало; конец), при равенстве — более ранняя. Точка в год конца эпохи
 * (Распятие, 30 г.; смерть Моисея, 1406) — эпоха, в каталоге которой стоит событие этого года, иначе эпоха книги
 * и главы ссылки, иначе та, что в этот год кончается: её последние события — её собственные (X1 Г2).
 */
function lifeEpochOf(p: Person, epochs: Epoch[], bracketMid: number | null, when: WhenSpan | undefined, birthEpoch: string | null): string | null {
  if (!epochs.length) return birthEpoch;
  const c = p.chrono;
  const pick = (a: number, b: number, refs: string[]): string | null => {
    if (b - a >= 1) {
      let best: Epoch | null = null;
      let most = 0;
      for (const e of epochs) {
        const ov = Math.min(b, toAstro(e.end)) - Math.max(a, toAstro(e.start));
        if (ov > most + 1e-9) {
          most = ov;
          best = e;
        }
      }
      if (best) return best.id;
    }
    const y = a;
    const ending = epochs.find((e) => toAstro(e.end) === y);
    const inside = epochs.find((e) => y >= toAstro(e.start) && y < toAstro(e.end)) ?? null;
    if (!ending) return (inside ?? epochAt(epochs, y))?.id ?? null;
    const h = toHist(y);
    if (ending.events.some((ev) => ev.year === h)) return ending.id;
    if (inside?.events.some((ev) => ev.year === h)) return inside.id;
    const fm = refs.length ? /^(\S+)\s+(\d+)/.exec(refs[0]) : null;
    const byBook = fm ? epochsOfChapter(epochs, fm[1], Number(fm[2])) : [];
    if (inside && byBook.some((e) => e.id === inside.id) && !byBook.some((e) => e.id === ending.id)) return inside.id;
    return ending.id;
  };
  if (c?.reign?.length) return pick(toAstro(Math.min(...c.reign.map((r) => r.start))), toAstro(Math.max(...c.reign.map((r) => r.end))), c.reign[0].refs);
  if (c?.active) return pick(toAstro(c.active.from), toAstro(c.active.to), c.active.refs ?? []);
  const evs = (p.card?.events ?? []).filter((e) => e.year !== undefined);
  if (evs.length) {
    const ys = evs.map((e) => toAstro(e.year!));
    return pick(Math.min(...ys), Math.max(...ys), evs[0].refs);
  }
  if (bracketMid !== null && when && when.by !== 'epoch') return epochAt(epochs, bracketMid)?.id ?? null;
  if (c?.epoch && epochs.some((e) => e.id === c.epoch)) return c.epoch;
  return birthEpoch;
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
  const fixed = new Map<string, { value: number; cls: DateClass; src: 'numbers' | 'year' | 'reign' }>(); // значения корней после закрепления
  const explicit: { key: string; value: number; cls: DateClass; refs: string[]; who: string; src: 'year' | 'reign' }[] = [];
  /** Числа текста с пометой «толкование» (X1 Х5; решение 101): мягкое притяжение, а не жёсткое равенство. */
  const softNums: { i: string; j: string; delta: number; who: string }[] = [];
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
      // число с пометой «толкование» — мягкое притяжение (ТЗ § 8.2: жёсткие только числа текста; X1 Х5); в модели
      // «Фарре 70» её собственное число Аврама — жёсткое: это и есть допущение модели
      const soft = born.cert === 'interpretation' && !(modelId === 'terah70' && id === 'avraam');
      const num = (a: string, delta: number, what: string, who: string[]) => {
        if (soft) softNums.push({ i: B(a), j: B(id), delta, who: id });
        else equal(B(a), B(id), delta, born.refs ?? [], who, what);
      };
      if (fatherAge !== undefined && f) num(f, fatherAge, 'fatherAge', [f, id]);
      if (born.motherAge !== undefined && m) num(m, born.motherAge, 'motherAge', [m, id]);
      if (born.offset && g.persons.has(born.offset.from)) num(born.offset.from, born.offset.years, 'offset', [born.offset.from, id]);
      if (born.year !== undefined) explicit.push({ key: B(id), value: toAstro(born.year), cls: 'calculated', refs: born.refs ?? [], who: id, src: 'year' });
    }
    const died = c.died;
    if (died) {
      const age = lxx && died.ageBracket !== undefined ? died.ageBracket : died.age;
      if (age !== undefined) equal(B(id), D(id), age, died.refs ?? [], [id], 'deathAge');
      if (died.year !== undefined) explicit.push({ key: D(id), value: toAstro(died.year), cls: 'calculated', refs: died.refs ?? [], who: id, src: 'year' });
    }
    for (const r of c.reign ?? []) {
      if (r.ageAtStart !== undefined) explicit.push({ key: B(id), value: toAstro(r.start) - r.ageAtStart, cls: 'calculated', refs: r.refs, who: id, src: 'reign' });
    }
  }

  // --- 2. опора модели: год рождения Иакова
  const sojourn = modelId === 'mt-short' ? 215 : 430;
  const jacobBirth = EXODUS - sojourn - 130;
  const modelAnchor = g.persons.has('iakov') ? { key: B('iakov'), value: jacobBirth } : null;

  const rootOf = (key: string) => uf.find(key);
  const setFixed = (key: string, value: number, cls: DateClass, refs: string[], who: string, src: 'numbers' | 'year' | 'reign') => {
    const { root, off } = rootOf(key);
    const v = value - off;
    const cur = fixed.get(root);
    if (cur === undefined) fixed.set(root, { value: v, cls, src });
    else if (Math.abs(cur.value - v) > 2) {
      tensions.push({ persons: [who], text: `${chainOf(g, [who])}: год по тексту расходится с другими числами текста на ${yearsWord(Math.round(Math.abs(cur.value - v)))}.`, refs, kind: 'numbers' });
    }
  };
  if (modelAnchor) setFixed(modelAnchor.key, modelAnchor.value, 'exact', [], 'iakov', 'numbers');
  for (const e of explicit) setFixed(e.key, e.value, e.cls, e.refs, e.who, e.src);

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
  const mEpochs: Epoch[] = modelEpochs(epochs, (id, of) => (g.persons.has(id) ? fixedYear(of === 'death' ? D(id) : B(id)) : null), modelId);
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
  /** Рождение лица держат числа текста его отца: у отца назван возраст при смерти, связь без пропуска (Иохаведа — Левий). */
  const boundByText = (id: string): boolean => {
    const f = (g.parentsOf.get(id) ?? []).find((x) => x.kind === 'father' && !x.gap);
    return !!f && g.persons.get(f.parent)?.chrono?.died?.age !== undefined;
  };
  const sibSeen = new Set<string>();
  const sibPairs: [string, string, number][] = [];
  const kinSeen = new Set<string>();

  // числа с пометой «толкование» — притяжение с весом около трети поколения (X1 Х5)
  for (const q of softNums) {
    const n = normFor(epochOf(q.who));
    ineqs.push({ i: q.i, j: q.j, delta: q.delta, w: 0.3 / (n.sigma * n.sigma), kind: 'eq' });
  }
  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = p.chrono;
    // эпоха из данных — «эпоха жизни» (AUTHORING § 7; решение 98): рождение не раньше начала эпохи без предела жизни
    // и до её конца — [начало − предел жизни; конец − 1] (X1 Х2). Прежде [начало − 30; конец] включал конец, а эпоха
    // по году его не включает: 30 лиц стояли ровно на границе в чужой эпохе
    if (c?.epoch && epochById.has(c.epoch)) {
      const [lo, hi] = epochSpan(epochById.get(c.epoch)!);
      addPrior(B(id), lo - normFor(c.epoch).lifeMax, hi - 1, 0.5);
      // внутри границы — тяга к обычному: засвидетельствованная жизнь в эпохе, рождение не раньше чем за поколение до её
      // начала. Без неё лицо, о котором известна только эпоха (Мардохей, Есфирь — «Возвращение»), уходило за родней на
      // целую жизнь раньше: Есфирь становилась царицей в 85 лет
      ineqs.push({ i: `@${lo - EPOCH_USUAL_BEFORE}`, j: B(id), delta: 0, w: EPOCH_USUAL_W, kind: 'ge' });
    }
    // относительные границы
    // граница соблюдается жёстко (одностороннее ограничение с весом BOUND_W), а слабое притяжение держит оценку с запасом
    // от границы; границы «не позже / не раньше чем через N лет после X» двигают только это лицо, не опору X:
    // иначе шесть царей Едома с границей «не позже Саула + 20» утягивают год рождения самого Саула
    if (c?.born?.notAfter && g.persons.has(c.born.notAfter.from)) {
      ineqs.push({ i: B(c.born.notAfter.from), j: B(id), delta: c.born.notAfter.years, w: BOUND_W, kind: 'le', onlyJ: true });
      ineqs.push({ i: B(c.born.notAfter.from), j: B(id), delta: c.born.notAfter.years - 20, w: 0.002, kind: 'eq', onlyJ: true });
    }
    if (c?.born?.notBefore && g.persons.has(c.born.notBefore.from)) {
      ineqs.push({ i: B(c.born.notBefore.from), j: B(id), delta: c.born.notBefore.years, w: BOUND_W, kind: 'ge', onlyJ: true });
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
      // возраст матери — около 24 лет во всех эпохах, кроме долгих жизней (X1 Х3): норма поколения патриархов (60 лет)
      // относится к отцам (Быт 21:5; 25:26), а матерям давала 51 год — Лия рожала в 52–58
      const g0 = e.kind.endsWith('mother') ? (LONG_LIVES.has(pe ?? '') ? n.g : Math.min(n.g, NORMS.default.g)) * 0.85 : n.g;
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
      // родитель старше ребёнка не меньше чем на PARENT_MIN_AGE лет (мать — на 14) — сильнее мягких связей (PARENT_MIN_W);
      // в эпохах долгих поколений отец, кроме того, мягко (как прежде) не моложе наименьшего поколения эпохи (n.min: 18–60 лет)
      const bio = e.kind.endsWith('mother') ? 14 : PARENT_MIN_AGE;
      ineqs.push({ i: B(e.parent), j: B(id), delta: bio, w: PARENT_MIN_W, kind: 'ge' });
      // отец при оценочных годах — обычно не моложе FATHER_USUAL_AGE (X1 В5; решение 101; цель — на два года внутри): мягко, слабее чисел текста
      // и границ «вошли в Египет с Иаковом»; где их не удержать, остаётся запись напряжения (п. 7)
      if (e.kind === 'father' && !e.gap) ineqs.push({ i: B(e.parent), j: B(id), delta: FATHER_USUAL_AGE + 2, w: FATHER_USUAL_W, kind: 'ge' });
      if (!e.kind.endsWith('mother') && n.min > bio) ineqs.push({ i: B(e.parent), j: B(id), delta: n.min, w: 50 / (n.sigma * n.sigma), kind: 'ge' });
      // мать рожает не позже MOTHER_MAX лет (вне эпох долгих жизней): иначе сжатое родословие растягивало матерей —
      // Руфь рожала Овида в 56 лет, Раав Вооза — в 120; растяжение уходит на отцов цепочки, где его видно разрывом
      // следа и напряжением «родословие называет не все поколения» (MAP-51). Возраст матери из текста (Сарра — 90 лет,
      // Быт 17:17) — жёсткое равенство, граница его не трогает. Граница мягкая, во всех эпохах, кроме долгих жизней (X1 Х3),
      // но не у матери, чьё рождение держат числа текста её отца (Иохаведа, дочь Левия, прожившего 137 лет, — мать Моисея,
      // Чис 26:59): там 430 лет пребывания растягивают поколения, растяжение показывает напряжение, а граница лишь тянула
      // бы Левия к краю и ломала порядок его братьев (Быт 29:32–35).
      if (e.kind === 'mother' && !e.gap && (n === NORMS.default || n === NORMS.patriarchs || (n === NORMS.egypt && !boundByText(e.parent))) && c?.born?.motherAge === undefined) {
        // цель — на год внутри предела: мягкая граница под давлением уступает на доли года
        ineqs.push({ i: B(e.parent), j: B(id), delta: MOTHER_MAX - 1, w: MOTHER_MAX_W, kind: 'le' });
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
      // порядок рождения в данных (order: «родила… и нарекла ему имя», Быт 29:32–35) — утверждение текста (SIB_ORDER_W)
      // брат, он же по другому прочтению отец (1 Цар 14:51 и 1 Пар 8:33: Кис и Нир — сыновья Авиила, но «Нир родил Киса»):
      // порядок перечня здесь не граница — её место занимает «родитель старше на 13 лет»
      const alt = (x: string, y: string) => (g.parentsOf.get(y) ?? []).some((e) => e.parent === x);
      if (alt(a, b) || alt(b, a)) continue;
      const ordered = g.persons.get(a)!.order !== undefined && g.persons.get(b)!.order !== undefined;
      ineqs.push({ i: B(a), j: B(b), delta: step, w: ordered ? SIB_ORDER_W : SIB_W, kind: 'ge' });
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
      // нижняя граница (жена старше мужа не больше чем на 15 лет) — цель на два года внутри: граница мягкая
      ineqs.push({ i: B(s.a), j: B(s.b), delta: -(lo - (hw ? 2 : 0)), w: SPOUSE_BAND_W / (n.sigma * n.sigma), kind: 'ge' });
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
  // и кто эти ближайшие датированные предок и потомок (основание года «по поколениям», решение 100)
  const srcUp = new Map<string, string>();
  const srcDown = new Map<string, string>();
  const bfs = (dist: Map<string, number>, src: Map<string, string>, next: (id: string) => string[]) => {
    const q: string[] = [];
    for (const id of g.order) if (cls.get(id) === 'exact' || cls.get(id) === 'calculated') { dist.set(id, 0); src.set(id, id); q.push(id); }
    while (q.length) {
      const id = q.shift()!;
      for (const n of next(id)) if (!dist.has(n)) { dist.set(n, dist.get(id)! + 1); src.set(n, src.get(id)!); q.push(n); }
    }
  };
  bfs(distUp, srcUp, (id) => (g.childrenOf.get(id) ?? []).map((e) => e.child)); // от датированных предков вниз
  bfs(distDown, srcDown, (id) => (g.parentsOf.get(id) ?? []).map((e) => e.parent)); // от датированных потомков вверх

  // знак у первого засвидетельствованного года (MAP-69) — у лиц, засвидетельствованных не раньше MARK_FROM_EPOCH
  const markEpoch = mEpochById.get(MARK_FROM_EPOCH);
  const markFrom = markEpoch ? toAstro(markEpoch.start) : Infinity;
  // скобка «время не установлено» (MAP-52): годы засвидетельствованной деятельности или эпохи, звезда — в середине
  const whenOf = whenSpans({ g, epochs: mEpochs, cls, b: (x) => val(B(x))!, d: (x) => (hasDeathData(x) ? val(D(x))! : null) });

  /** Основание года (решение 100): числа текста, реконструкция, явный год; у оценки — служение, поколения, эпоха. */
  const softIds = new Set(softNums.map((q) => q.who));
  const basisOf = (id: string, k: DateClass, named: boolean, when: WhenSpan | undefined, src: 'numbers' | 'year' | 'reign' | undefined): YearBasis => {
    if (named) return { kind: 'people' };
    if (k === 'exact') return { kind: 'numbers', anchor: 'solomon-4' };
    // год царя и его родни по реконструкции царствований (Давид: 30 лет при воцарении в 1010 г., 2 Цар 5:4) — «reign»,
    // даже если в данных он записан явным годом; иначе явный год — от своей опоры (Новый Завет) или датированного события
    if (k === 'calculated') return src === 'reign' || g.persons.get(id)!.chrono?.reign?.length ? { kind: 'reign', anchor: 'solomon-4' } : { kind: 'year' };
    if (k === 'epochal') {
      if (when?.by === 'met') return { kind: 'met', ...(when.id ? { ids: [when.id] } : {}) };
      if (when?.by === 'kin') return { kind: 'kin', ...(when.id ? { ids: [when.id] } : {}) };
      if (when?.by === 'mention') return { kind: 'mention', ...(when.ref ? { ref: when.ref } : {}) };
      return { kind: when?.by === 'bounds' ? 'bounds' : when?.by === 'group' ? 'group' : 'epoch' };
    }
    const c = g.persons.get(id)!.chrono;
    if (softIds.has(id)) return { kind: 'interp' };
    if (c?.active || c?.reign?.length) return { kind: 'active' };
    const up = distUp.get(id);
    const down = distDown.get(id);
    if (up !== undefined || down !== undefined) {
      const ids = [...(up !== undefined ? [srcUp.get(id)!] : []), ...(down !== undefined ? [srcDown.get(id)!] : [])];
      return { kind: 'kin', ids, gens: [up ?? 0, down ?? 0] };
    }
    if (c?.born?.notAfter || c?.born?.notBefore || c?.born?.range) return { kind: 'bounds' };
    if (c?.epoch) return { kind: 'epoch' };
    return { kind: 'kin' };
  };

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
    // и не шире границ текста «не раньше / не позже чем через N лет после X» (решение 101; X1 Х2): показанный год
    // округляется внутрь промежутка и не выходит за них — сыновья Быт 46 не «род. ок. 1875», через год после входа в Египет
    let pin: 'lo' | 'hi' | undefined;
    if (!bracket && k === 'estimated') {
      const at = (x: { from: string; years: number } | undefined) => (x && g.persons.has(x.from) && cls.get(x.from) !== 'epochal' ? val(B(x.from))! + x.years : null);
      const na = at(p.chrono?.born?.notAfter);
      const nb = at(p.chrono?.born?.notBefore);
      if (na !== null && na >= bLo) bHi = Math.min(bHi, na);
      if (nb !== null && nb <= bHi) bLo = Math.max(bLo, nb);
      if (na !== null && Math.abs(b - na) < 0.5) pin = 'hi';
      else if (nb !== null && Math.abs(b - nb) < 0.5) pin = 'lo';
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
    let lastRef: string | undefined; // стих последнего засвидетельствованного события (ChronoRow.lastRef)
    let first = Infinity; // самое раннее засвидетельствованное событие жизни с минимальным возрастом (MAP-53)
    const c = p.chrono;
    const bump = (y: number | undefined, minAge = 0, ref?: string) => {
      if (y === undefined) return;
      if (last === null || y > last) {
        last = y;
        lastRef = ref;
      } else if (y === last && !lastRef) lastRef = ref;
      first = Math.min(first, y - minAge);
    };
    // начало служения и царствования — не моложе наименьшего возраста роли (ROLE_MIN_AGE; MAP-53): пророк не «рождается»
    // за 4 года до гибели; без такой роли — упоминание в любом возрасте
    if (c?.active) {
      bump(toAstro(c.active.to), 0, c.active.refs?.[c.active.refs.length - 1]);
      first = Math.min(first, toAstro(c.active.from) - (roleMinAge(p, minReignAge) ?? 0));
    }
    for (const r of c?.reign ?? []) {
      bump(toAstro(r.end), 0, r.refs[0]);
      first = Math.min(first, toAstro(r.start) - (r.ageAtStart ?? minReignAge));
    }
    for (const e of p.card?.events ?? []) if (e.year !== undefined) bump(toAstro(e.year), 0, e.refs[0]);
    for (const e of p.card?.events ?? []) if (e.age !== undefined) bump(b + e.age, e.age, e.refs[0]);
    // рождение ребёнка — засвидетельствованная жизнь родителя, но не «потомка» через пропуск поколений
    for (const e of g.childrenOf.get(id) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && !e.gap) {
      const cb = val(B(e.child));
      if (cb !== undefined && cls.get(e.child) !== 'epochal') bump(e.kind === 'father' ? cb - 1 : cb, PARENT_MIN_AGE - (e.kind === 'father' ? 1 : 0), e.refs[0]);
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
    // этап 13 (контракт 1): год, приблизительный по данным; свой год смерти закреплён; основание; эпохи жизни и рождения
    const bApprox = c?.born?.year !== undefined && c.born.cert === 'interpretation' && k !== 'estimated' && k !== 'epochal';
    const dApprox = c?.died?.year !== undefined && c.died.cert === 'interpretation' && d !== null && !sameRoot;
    const dFixed = d !== null && !sameRoot ? fixed.has(rd.root) : undefined;
    const birthEpoch = named || k !== 'epochal' ? ep?.id ?? null : (p.chrono?.epoch ?? ep?.id ?? null);
    persons.set(id, {
      b, bLo, bHi, d, dLo, dHi, lastAttested: last, dEst, cls: k, epoch: ep?.id ?? null,
      ...(infant ? { infant } : {}),
      ...(named ? { named } : {}),
      ...(bracket ? { when: bracket.when } : {}),
      ...(d !== null ? { dAge: sameRoot } : {}),
      ...(mark !== undefined ? { mark } : {}),
      ...(bApprox ? { bApprox } : {}),
      ...(dApprox ? { dApprox } : {}),
      ...(dFixed !== undefined ? { dFixed } : {}),
      ...(pin ? { pin } : {}),
      ...(lastRef && last !== null ? { lastRef } : {}),
      basis: basisOf(id, k, named, bracket?.when, fixed.get(rb.root)?.src),
      birthEpoch,
      lifeEpoch: named ? birthEpoch : lifeEpochOf(p, mEpochs, bracket ? (bracket.lo + bracket.hi) / 2 : null, bracket?.when, birthEpoch),
    });
  }

  // порядок перечисления братьев (MAP-54): год оценён по порядку, если граница «младший — через год» удерживает его
  for (const [a, b2, step] of sibPairs) {
    const pa = persons.get(a)!;
    const pb = persons.get(b2)!;
    if (pb.b - pa.b > step + 0.75) continue;
    if (pa.cls === 'estimated') pa.byOrder = true;
    if (pb.cls === 'estimated') pb.byOrder = true;
    // основание младшего — порядок перечисления после старшего (решение 100); у старшего своё основание остаётся
    if (pb.cls === 'estimated' && pb.basis?.kind !== 'active' && pb.basis?.kind !== 'interp') pb.basis = { kind: 'order', ids: [a] };
  }

  // --- 7. напряжения между датированными лицами
  // «сын не помещается в жизнь отца» — по паре; если пара входит в цепочку поколений с напряжением,
  // подробность переходит в текст цепочки, чтобы в карточке была одна связная запись (CARD-18)
  const afterDeath = new Map<string, { t: Tension; child: string; years: number }>();
  /** Первая фраза напряжения цепочки — по границам и числам текста (для склейки одной трудности, п. 8). */
  const heads = new Map<Tension, string>();
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
            // «по возрастам, названным в тексте» — только о своих числах: здесь назван возраст родителя, а год ребёнка —
            // оценка (X1 Д2; решение 101)
            text: `${head}: ${g.persons.get(e.parent)!.sex === 'f' ? 'прожила' : 'прожил'} ${yearsWord(Math.round(par.d - par.b))} по тексту, а ${kid} по оценке годов рождается примерно через ${yearsWord(years)} после ${e.kind === 'mother' ? 'её' : 'его'} смерти. Вероятно, родословие называет не все поколения.`,
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
            const t: Tension = { persons: down, text: parts.join(' '), refs: uniq(refs).slice(0, 8), kind: 'chain', cert: 'interpretation' };
            tensions.push(t);
            heads.set(t, parts[0]);
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
            `${me.bApprox ? 'около' : 'в'} ${formatYear(me.b)}). Вероятно, родословие называет не все поколения.`;
          const refs: string[] = [...act.refs.slice(0, 2), ...(kid.chrono?.born?.refs ?? []).slice(0, 2)];
          // стихи родства: сначала первый стих каждого звена (Руф 4:20–22), затем остальные
          for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(0, 1));
          for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(1));
          const t: Tension = { persons: down, text, refs: uniq(refs).slice(0, 8), kind: 'chain', cert: 'interpretation' };
          tensions.push(t);
          heads.set(t, text.slice(0, text.lastIndexOf(' Вероятно,')));
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
    // запас в полтора года — точность оценки, а не растяжение: цепочка на пределе (Урий — Веселеил, 140 и 141 год
    // при пределе 140) от долей года в решателе то давала запись, то нет
    if (end - me.b <= n.lifeMax + STRETCH_SLACK) continue;
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
    // цепочка уже объяснена напряжением поколений между датированными лицами (Наассон — … — Давид)
    if (tensions.some((t) => t.kind === 'chain' && links.every((x) => t.persons.includes(x)))) continue;
    const limit = Math.max(...links.map((x) => stretched.get(x)!.limit));
    /** Напряжение цепочки до ребёнка child (или до смерти, последнего упоминания), end — конец сплошного следа звена. */
    const emit = (child: string | null, end: number, sibling: boolean) => {
      const down = [...(up ? [up] : []), ...links, ...(child ? [child] : [])];
      const parts: string[] = [];
      if (links.length === 1) {
        const x = links[0];
        const from = up ? `от рождения ${kidGen(g, x)}` : `от ${poss(x)} рождения`;
        const to = child ? `до рождения ${poss(x)} ${kidGen(g, child)}` : tail.atDeath ? `до ${poss(x)} смерти` : 'до последнего упоминания';
        parts.push(`${chainOf(g, down)}: по принятым годам ${from} ${to} проходит примерно ${yearsWord(Math.round(end - persons.get(x)!.b))}${NB}— больше предела жизни этого времени (${yearsWord(limit)}).`);
      } else {
        const t0 = persons.get(down[0])!.b;
        const t1 = child ? persons.get(child)!.b : end;
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
      // стихи с числами — первыми: возраст при смерти предка и звеньев, рождение звеньев и последнего в цепочке, затем
      // рождение предка; потом стихи родства звеньев
      for (const x of [...(up ? [up] : []), ...links]) refs.push(...(g.persons.get(x)!.chrono?.died?.refs ?? []).slice(0, 1));
      for (const x of links) refs.push(...(g.persons.get(x)!.chrono?.born?.refs ?? []).slice(0, 2));
      if (child) refs.push(...(g.persons.get(child)!.chrono?.born?.refs ?? []).slice(0, 1));
      if (up) refs.push(...(g.persons.get(up)!.chrono?.born?.refs ?? []).slice(0, 2));
      for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(0, 1));
      for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(1));
      // у брата или сестры того, на ком кончается след, запись — в карточках звеньев и его самого, а не у предка цепочки:
      // у предка уже есть запись о той же цепочке
      const who = sibling && up ? down.slice(1) : down;
      tensions.push({ persons: who, text: parts.join(' '), refs: uniq(refs).slice(0, 8), kind: 'stretched', cert: 'interpretation' });
    };
    emit(tail.child, tail.end, false);
    // другие дети последнего звена, родившиеся тоже после разрыва его следа (DF2): у Аарона и Мариам возраст матери
    // Иохаведы так же больше предела жизни, как у Моисея, и объяснение нужно в их карточках
    const lastLink = persons.get(cur)!;
    for (const e of g.childrenOf.get(cur) ?? []) {
      if ((e.kind !== 'father' && e.kind !== 'mother') || e.gap || e.child === tail.child) continue;
      const cc = persons.get(e.child)!;
      if (cc.cls === 'epochal' || cc.named) continue;
      const end = e.kind === 'father' ? cc.b - 1 : cc.b;
      if (lastLink.brk === undefined || end <= lastLink.brk + 0.5) continue;
      emit(e.child, end, true);
    }
  }

  // --- 7а′. цепочки от лица с засвидетельствованными годами, но без чисел текста (DF2; DG 2.3.2): «Ахан, сын Хармия, сына Завдия,
  // сына Зары» (Нав 7:1) — при взятии Иерихона, а Зара вошёл в Египет с Иаковом (Быт 46:12). Проверка цепочек (п. 7)
  // начинается только от датированных лиц. Здесь рождение потомка — не раньше последнего засвидетельствованного года без предела жизни
  // его эпохи, а предок — первый вверх по связям без пропуска поколений, у которого рождение ограничено сверху: год по
  // числам текста, граница «не позже» от такого года или начало служения, царствования. Если и эта нижняя оценка длины
  // цепочки больше поколений эпох — напряжение. Годы-оценки решателя здесь не опора: сжатое родословие, которое не
  // противоречит числам текста (Урий — Веселеил, левитские ряды 1 Пар 6), напряжения не даёт.
  const bornNotAfter = (x: string): { hi: number; say: string; refs: string[] } | null => {
    const q = g.persons.get(x)!;
    const qc = persons.get(x)!;
    const born = q.sex === 'f' ? 'родилась' : 'родился';
    if (qc.cls === 'exact' || qc.cls === 'calculated') return { hi: qc.b, say: `${q.name} ${born} ${qc.bApprox ? 'около' : 'в'} ${formatYear(qc.b)}`, refs: q.chrono?.born?.refs ?? [] };
    const na = q.chrono?.born?.notAfter;
    const from = na ? persons.get(na.from) : undefined;
    if (na && from && (from.cls === 'exact' || from.cls === 'calculated')) return { hi: from.b + na.years, say: `${q.name} ${born} не позже ${formatYear(from.b + na.years)}`, refs: q.chrono?.born?.refs ?? [] };
    const act = attestedFrom(q, minReignAge);
    if (act) return { hi: act.from - act.minAge, say: `${q.name} ${q.sex === 'f' ? 'засвидетельствована' : 'засвидетельствован'} уже в ${formatYear(act.from)}`, refs: act.refs };
    return null;
  };
  for (const id of g.order) {
    const me = persons.get(id)!;
    const p = g.persons.get(id)!;
    if (me.cls !== 'estimated' || me.named) continue;
    let to = -Infinity;
    let toRefs: string[] = [];
    if (p.chrono?.active) [to, toRefs] = [toAstro(p.chrono.active.to), p.chrono.active.refs ?? []];
    for (const r of p.chrono?.reign ?? []) if (toAstro(r.end) > to) [to, toRefs] = [toAstro(r.end), r.refs];
    for (const e of p.card?.events ?? []) if (e.year !== undefined && toAstro(e.year) > to) [to, toRefs] = [toAstro(e.year), e.refs];
    if (!Number.isFinite(to)) continue;
    const lifeMax = normFor(p.chrono?.epoch ?? me.epoch).lifeMax;
    const bLo = to - lifeMax;
    const chain = [id];
    let cur = id;
    for (let steps = 1; steps <= 60; steps++) {
      const e = (g.parentsOf.get(cur) ?? []).find((x) => (x.kind === 'father' || x.kind === 'mother') && !x.gap);
      if (!e) break;
      chain.push(e.parent);
      const anc = bornNotAfter(e.parent);
      if (!anc) {
        cur = e.parent;
        continue;
      }
      if (steps < 2) break;
      const total = bLo - anc.hi;
      const avg = total / steps;
      const down = [...chain].reverse();
      const nMax = down.slice(0, -1).reduce((s, x) => s + normFor(persons.get(x)!.epoch).max, 0) / steps;
      // та же цепочка уже объяснена другим напряжением (Кааф — Узиил — Мисаил: растянутое звено)
      if (avg <= nMax * 1.05 || tensions.some((t) => down.slice(1).every((x) => t.persons.includes(x)))) break;
      const parts = [
        `${chainOf(g, down)}: ${gens(steps)}${NB}— не меньше чем ${yearsWord(Math.round(total))}, в среднем не меньше чем по ${yearsWord(Math.round(avg))} на поколение ` +
          `(${anc.say}, ${p.name} ${p.sex === 'f' ? 'засвидетельствована' : 'засвидетельствован'} ещё в ${formatYear(to)}, а жизнь этого времени${NB}— не дольше ${yearsWord(lifeMax)}).`,
      ];
      const refs: string[] = [];
      if (g.persons.has('iakov') && anc.hi < entry + 1 && bLo > entry) {
        parts.push(modelId === 'mt-short' ? `Так выходит при 215${NB}годах пребывания в Египте (скобки Исх${NB}12:40; Гал${NB}3:17).` : `Так выходит при 430${NB}годах пребывания в Египте (Исх${NB}12:40).`);
        refs.push('Исх 12:40');
        if (modelId === 'mt-short') refs.push('Гал 3:17');
      }
      parts.push('Вероятно, родословие называет не все поколения.');
      refs.push(...toRefs.slice(0, 2), ...anc.refs.slice(0, 2));
      for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(0, 1));
      for (const x of down.slice(1)) refs.push(...(g.persons.get(x)!.parentRefs ?? []).slice(1));
      const t: Tension = { persons: down, text: parts.join(' '), refs: uniq(refs).slice(0, 8), kind: 'chain', cert: 'interpretation' };
      tensions.push(t);
      heads.set(t, parts[0]);
      break;
    }
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
      // жена старше мужа больше чем на 15 лет — запись без запаса (X1 Х3, П9: вне напряжений таких пар нет); моложе — с запасом
      if (diff <= band.hi + SPOUSE_SLACK && diff >= -(lo + (hw ? 0.5 : SPOUSE_SLACK))) continue;
      const years = Math.round(Math.abs(diff));
      const rel = hw ? (diff > 0 ? 'жена моложе мужа' : 'жена старше мужа') : 'супруги различаются по возрасту';
      const usual = diff > 0 ? band.hi : lo;
      const about = (k: Tension['kind']) => tensions.find((t) => t.kind === k && (t.persons.includes(s.a) || t.persons.includes(s.b)));
      const related = about('stretched') ?? about('chain') ?? about('pair');
      const parts = [`${chainOf(g, [s.a, s.b])}: по принятым годам ${rel} на ${yearsWord(years)}, а у супругов одного поколения разница обычно не больше чем в ${yearsWord(usual)}.`];
      // название того напряжения — его цепочка имён (начало текста до двоеточия): у напряжения брата или сестры
      // (Аарон, Мариам) предок цепочки назван в тексте, но не входит в persons
      const relatedName = related ? (related.text.includes(':') ? related.text.slice(0, related.text.indexOf(':')) : related.persons.map(nameOf).join(`${NB}— `)) : '';
      if (related) parts.push(`Так выходит из-за растянутых поколений: см. напряжение «${relatedName}». Вероятно, родословие называет не все поколения.`);
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

  // --- 7в. числа текста о царях при простом сложении (ТЗ § 3.6: «Ахаз → Езекия»; DF2). Годы царей в данных — расчёт
  // по реконструкции с соправлениями, и по ним отец старше сына как положено. Но сами числа текста — возраст при
  // воцарении и годы царствования (П-6) — при простом сложении дают отцу при рождении сына меньше PARENT_MIN_AGE лет:
  // «Двадцати лет был Ахаз, когда воцарился, и шестнадцать лет царствовал» (4 Цар 16:2); о Езекии: «Двадцати пяти лет
  // был он, когда воцарился» (4 Цар 18:2). Проверяются сын и отец, цари одного царства, если сын воцарился, когда
  // кончилось царствование отца (не после междуцарствия): возраст отца при воцарении + годы его царствования − возраст
  // сына при воцарении.
  for (const id of g.order) {
    const f = fatherOf(g, id);
    if (!f) continue;
    const son = g.persons.get(id)!.chrono?.reign ?? [];
    const dad = g.persons.get(f)!.chrono?.reign ?? [];
    for (const r of son) {
      const q = dad.find((x) => x.over === r.over && Math.abs(r.start - x.end) <= 1);
      if (!q || q.ageAtStart === undefined || q.years === undefined || r.ageAtStart === undefined) continue;
      const age = q.ageAtStart + q.years - r.ageAtStart;
      if (age >= PARENT_MIN_AGE) continue;
      if (tensions.some((t) => t.persons.length === 2 && t.persons[0] === f && t.persons[1] === id)) continue;
      const kid = kidNoun(g, id);
      const recon = Math.round(persons.get(id)!.b - persons.get(f)!.b);
      tensions.push({
        persons: [f, id],
        text:
          `${chainOf(g, [f, id])}: по числам текста отцу при рождении ${kidGen(g, id)} выходит около ${yearsWord(Math.max(0, age))}: ` +
          `отец воцарился в${NB}${yearsWord(q.ageAtStart)} и царствовал ${yearsWord(q.years)}, ${kid} ${g.persons.get(id)!.sex === 'f' ? 'воцарилась' : 'воцарился'} после него в${NB}${yearsWord(r.ageAtStart)}. ` +
          `По принятой реконструкции годов царствования разница в возрасте${NB}— ${yearsWord(recon)}. ` +
          'Вероятно, какое-то из чисел считает совместное правление или передано иначе.',
        refs: uniq([...q.refs, ...r.refs, ...(g.persons.get(id)!.parentRefs ?? []).slice(0, 1)]).slice(0, 8),
        kind: 'numbers',
        cert: 'interpretation',
      });
    }
  }

  // --- 7г. свидетельства текста о времени лица, для которых в данных нет полей (ТЗ § 3.6 называет их поимённо; DF2)
  tensions.push(...textWitnessTensions(g, mEpochs));

  // --- 8. Напряжения по границам текста (этап 13, решение 101; X1 Х6): только числа и границы текста, без годов-оценок
  // решателя. Одна трудность — одна запись: 430 лет в Египте (Исх 12:40) — одна запись со всеми звеньями.
  tensions.push(...boundTensions({ g, persons, tensions, heads, modelId, lxx, sojourn, entry }));

  return { model: modelId, persons, tensions: dedupeTensions(tensions), epochs: mEpochs };
}

/** Предельный год по тексту и как он получен: фразы по лицам цепочки и стихи. */
interface TextBound {
  y: number;
  ids: string[];
  say: string[];
  refs: string[];
}

/**
 * Напряжения по границам текста (этап 13, решение 101; X1 Х6, Д2–Д5):
 *  — «ребёнок после смерти отца»: самый поздний год рождения отца по тексту (свой год, граница «не позже», смерть его
 *    отца по возрасту, названному текстом) плюс возраст при смерти по тексту — раньше рождения ребёнка больше чем на год
 *    (Кааф — Амрам — Моисей: Амрам умер не позже 1605 г., Моисей родился в 1526 г.);
 *  — «мать старше 55»: самый поздний год рождения матери по тексту (через смерть её отца) — раньше рождения ребёнка
 *    больше чем на 55 лет (Иохаведа, дочь Левия, Чис 26:59);
 *  — остаток той же трудности, когда мать моложе 55 возможна (модель 215 лет): от самого позднего рождения её отца до
 *    рождения её ребёнка столько лет, что при матери не старше 55 отцу при её рождении больше предела поколения эпохи;
 *  — при 430 годах пребывания все записи, чьи звенья родились в Египте или чья цепочка проходит через пребывание
 *    (Исх 12:40), склеиваются в одну: звенья — в persons, у каждого она в § 13; текст — цепочки по границам и числам
 *    текста и обе известные разгадки;
 *  — «Фарре 70 — Деян 7:4», «Езекия — Осия» (4 Цар 18:1, 9–10 против 18:13), Каинан в масоретских моделях
 *    (Лк 3:36 против Быт 11:12), сжатое родословие Мф 1:13–16.
 */
function boundTensions(o: {
  g: Graph;
  persons: Map<string, PersonChrono>;
  tensions: Tension[];
  heads: Map<Tension, string>;
  modelId: ChronoModelId;
  lxx: boolean;
  sojourn: number;
  entry: number;
}): Tension[] {
  const { g, persons, tensions, heads, modelId, lxx, sojourn, entry } = o;
  const out: Tension[] = [];
  const P = (x: string) => g.persons.get(x)!;
  const fem = (x: string) => P(x).sex === 'f';
  const dated = (x: string) => {
    const c = persons.get(x);
    return !!c && (c.cls === 'exact' || c.cls === 'calculated');
  };
  const uniq = (xs: string[]) => [...new Set(xs)];
  const ageAtDeath = (x: string): { age: number; refs: string[] } | null => {
    const dd = P(x).chrono?.died;
    const a = lxx && dd?.ageBracket !== undefined ? dd.ageBracket : dd?.age;
    return a === undefined ? null : { age: a, refs: dd!.refs ?? [] };
  };
  const bornMemo = new Map<string, TextBound | null>();
  /** Самый поздний год рождения по тексту. */
  const bornMax = (x: string, depth = 0): TextBound | null => {
    if (bornMemo.has(x)) return bornMemo.get(x)!;
    const q = P(x);
    const c = persons.get(x)!;
    const born = fem(x) ? 'родилась' : 'родился';
    let out: TextBound | null = null;
    if (dated(x)) out = { y: c.b, ids: [x], say: [`${q.name} ${born} ${c.bApprox ? 'около' : 'в'} ${formatYear(c.b)}`], refs: (q.chrono?.born?.refs ?? []).slice(0, 2) };
    else {
      const na = q.chrono?.born?.notAfter;
      if (na && dated(na.from)) {
        const y = persons.get(na.from)!.b + na.years;
        out = { y, ids: [x], say: [`${q.name} ${born} не позже ${formatYear(y)}`], refs: (q.chrono?.born?.refs ?? []).slice(0, 2) };
      }
      if (depth < 8)
        for (const e of g.parentsOf.get(x) ?? []) {
          if ((e.kind !== 'father' && e.kind !== 'mother') || e.gap) continue;
          const dm = deathMax(e.parent, depth + 1);
          if (!dm) continue;
          const y = dm.y + (e.kind === 'father' ? 1 : 0);
          if (!out || y < out.y - 0.5) out = { y, ids: [...dm.ids, x], say: [...dm.say, `${q.name} ${born} не позже ${formatYear(y)}`], refs: uniq([...dm.refs, ...e.refs.slice(0, 1)]) };
        }
    }
    bornMemo.set(x, out);
    return out;
  };
  /** Самый поздний год смерти по тексту: самое позднее рождение и возраст при смерти, названный текстом. */
  const deathMax = (x: string, depth = 0): TextBound | null => {
    const a = ageAtDeath(x);
    if (!a) return null;
    const bm = bornMax(x, depth);
    if (!bm) return null;
    const y = bm.y + a.age;
    const say = [...bm.say];
    say[say.length - 1] += `, ${fem(x) ? 'прожила' : 'прожил'} ${yearsWord(a.age)} и ${fem(x) ? 'умерла' : 'умер'} не позже ${formatYear(y)}`;
    return { y, ids: bm.ids, say, refs: uniq([...bm.refs, ...a.refs.slice(0, 1)]) };
  };

  // строки по границам текста
  type Line = { ids: string[]; text: string; refs: string[]; egypt: boolean };
  const lines: Line[] = [];
  const egyptBorn = (x: string) => {
    const c = persons.get(x);
    return !!c && c.b >= entry - 0.5 && c.b < EXODUS;
  };
  for (const id of g.order) {
    if (!dated(id)) continue;
    const me = persons.get(id)!;
    const kid = P(id);
    const born = fem(id) ? 'родилась' : 'родился';
    for (const e of g.parentsOf.get(id) ?? []) {
      if ((e.kind !== 'father' && e.kind !== 'mother') || e.gap) continue;
      if (e.kind === 'father') {
        if (dated(e.parent)) continue; // пары датированных — п. 7
        const dm = deathMax(e.parent);
        if (!dm || me.b <= dm.y + 1.5) continue;
        const ids = [...dm.ids, id];
        lines.push({
          ids,
          text: `${chainOf(g, ids)}: ${dm.say.join('; ')}; ${kid.name} ${born} в ${formatYear(me.b)}${NB}— не меньше чем через ${yearsWord(Math.round(me.b - dm.y))} после смерти отца.`,
          refs: uniq([...dm.refs, ...(kid.chrono?.born?.refs ?? []).slice(0, 2)]),
          egypt: ids.some(egyptBorn),
        });
      } else if (P(id).chrono?.born?.motherAge === undefined && !dated(e.parent)) {
        const m = e.parent;
        const bm = bornMax(m);
        if (!bm) continue;
        const minAge = me.b - bm.y;
        const ids = [...bm.ids, id];
        if (minAge > 55) {
          lines.push({
            ids,
            text: `${chainOf(g, ids)}: ${bm.say.join('; ')}; ${kid.name} ${born} в ${formatYear(me.b)}, и матери тогда было не меньше ${yearsGen(Math.round(minAge))}.`,
            refs: uniq([...bm.refs, ...(kid.chrono?.born?.refs ?? []).slice(0, 2)]),
            egypt: ids.some(egyptBorn),
          });
          continue;
        }
        // остаток: мать моложе 55 возможна, но тогда её отцу при её рождении больше предела поколения
        const f = fatherOf(g, m);
        const fe = (g.parentsOf.get(m) ?? []).find((x) => x.kind === 'father');
        if (!f || !fe || fe.gap) continue;
        const fb = bornMax(f);
        if (!fb) continue;
        const sum = me.b - fb.y;
        const limit = normFor(persons.get(f)!.epoch).max;
        if (sum - 55 <= limit) continue;
        const nb = P(m).chrono?.born?.notBefore;
        const mLo = nb && dated(nb.from) ? persons.get(nb.from)!.b + nb.years : null;
        const three = [f, m, id];
        // та же трудность у всех детей этой матери (Аарон, Мариам — как Моисей)
        const siblings = (g.childrenOf.get(m) ?? []).filter((x) => x.kind === 'mother' && !x.gap && x.child !== id).map((x) => x.child);
        lines.push({
          ids: [...three, ...siblings],
          text:
            `${chainOf(g, three)}: ${fb.say.join('; ')}; ${kid.name} ${born} в ${formatYear(me.b)}${NB}— на два поколения не меньше ${yearsGen(Math.round(sum))}` +
            `${mLo !== null ? ` (${P(m).name} ${fem(m) ? 'родилась' : 'родился'} не раньше ${formatYear(mLo)})` : ''}. ` +
            `Если матери при рождении ${kidGen(g, id)} было не больше 55 лет, то отцу при рождении дочери${NB}— не меньше ${yearsGen(Math.round(sum - 55))}.`,
          refs: uniq([...fb.refs, ...(P(m).parentRefs ?? []).slice(0, 1), ...(P(m).chrono?.born?.refs ?? []).slice(0, 1), ...(kid.chrono?.born?.refs ?? []).slice(0, 2)]),
          egypt: false,
        });
      }
    }
  }

  // пребывание в Египте: одна запись на трудность
  const merged = new Set<Tension>();
  if (sojourn === 430 && g.persons.has('iakov')) {
    const inEgypt = (t: Tension) =>
      t.refs.includes('Исх 12:40') ||
      ((t.kind === 'pair' || t.kind === 'stretched') && t.persons.some(egyptBorn)) ||
      ((t.kind === 'chain' || t.kind === 'spouses') && t.persons.every(egyptBorn));
    for (const t of tensions) if (inEgypt(t)) merged.add(t);
    // супруги, чьё напряжение объяснено склеенной записью
    for (const t of tensions) if (t.kind === 'spouses' && t.cert === 'interpretation' && t.persons.some((x) => [...merged].some((m) => m.persons.includes(x)))) merged.add(t);
    const egyptLines = lines.filter((l) => l.egypt);
    if (merged.size || egyptLines.length) {
      // цепочки по числам и границам текста; из двух цепочек к братьям (Аарон, Моисей) — одна
      // строки к братьям (Аарон, Моисей) — одна, к младшему по годам; цепочка, чей конец объяснён строкой по границам, — нет
      const byLast = <T extends { ids: string[] }>(xs: T[]): T[] => {
        const keep = new Map<string, T>();
        for (const x of xs) {
          const k = x.ids.slice(0, -1).join('|');
          const cur = keep.get(k);
          if (!cur || persons.get(x.ids[x.ids.length - 1])!.b > persons.get(cur.ids[cur.ids.length - 1])!.b) keep.set(k, x);
        }
        return [...keep.values()];
      };
      const shownLines = byLast(egyptLines);
      const lineEnds = new Set(egyptLines.map((l) => l.ids[l.ids.length - 1]));
      const chains = byLast(
        [...merged].filter((t) => heads.has(t) && !lineEnds.has(t.persons[t.persons.length - 1])).map((t) => {
          const h = heads.get(t)!;
          return { ids: t.persons, head: h.endsWith('.') || h.endsWith(')') ? (h.endsWith('.') ? h : `${h}.`) : `${h}.` };
        }),
      );
      const ids = uniq([...[...merged].flatMap((t) => t.persons), ...egyptLines.flatMap((l) => l.ids)]).sort((a, b) => persons.get(a)!.b - persons.get(b)!.b);
      const parts = [`Пребывание в Египте${NB}— 430${NB}лет (Исх${NB}12:40), а родословия называют за это время лишь несколько поколений.`];
      for (const c of chains) parts.push(c.head);
      for (const l of shownLines) parts.push(l.text);
      parts.push(`Вероятно, родословия называют не все поколения${NB}— или 430${NB}лет считаются с прихода Авраама в Ханаан (скобка Исх${NB}12:40; Гал${NB}3:17), как в модели «Краткое пребывание».`);
      // первую разгадку для дочери, названной прямо (Чис 26:59), ограничивает сам стих
      let limitRef: string | null = null;
      for (const l of egyptLines) {
        const m = l.ids.find((x) => fem(x) && l.ids.includes(fatherOf(g, x) ?? ''));
        const f = m ? fatherOf(g, m) : null;
        const fg = f ? nameCase(P(f).name, P(f).sex, 'gen') : null;
        const ref = m ? P(m).parentRefs?.[0] : undefined;
        if (m && fg && ref) {
          parts.push(`Первую разгадку ограничивает ${ref.replace(/^([1-4])(\S)/, '$1 $2').replace(' ', NB)}: ${P(m).name} названа дочерью ${fg}.`);
          limitRef = ref;
          break;
        }
      }
      // стихи: число пребывания и обе разгадки, затем по два первых стиха каждой цепочки и строки, затем остальные
      const firstRefs = [...chains.map((c) => [...merged].find((t) => t.persons === c.ids)?.refs ?? []), ...shownLines.map((l) => l.refs)].flatMap((r) => r.slice(0, 2));
      const refs = uniq(['Исх 12:40', 'Гал 3:17', ...(limitRef ? [limitRef] : []), ...firstRefs, ...egyptLines.flatMap((l) => l.refs), ...[...merged].flatMap((t) => t.refs)]).slice(0, 14);
      out.push({ persons: ids, text: parts.join(' '), refs, kind: 'chain', cert: 'interpretation' });
    }
  }
  if (merged.size) tensions.splice(0, tensions.length, ...tensions.filter((t) => !merged.has(t)));
  for (const l of lines) {
    if (l.egypt && sojourn === 430) continue;
    out.push({ persons: l.ids, text: `${l.text} Вероятно, родословие называет не все поколения.`, refs: l.refs.slice(0, 8), kind: 'pair', cert: 'interpretation' });
  }

  // сжатое родословие (решение 100; X2 Д4.2): от лица с засвидетельствованными годами вверх через звенья без своих чисел
  // (пропуск поколений допускается: родословие само его допускает) до предка, чей год рождения ограничен сверху.
  // Если и нижняя оценка длины цепочки даёт в среднем больше полутора обычных поколений — запись «сжатое родословие»
  // (Мф 1:13–16: Зоровавель — … — Иосиф); длиннее предела поколения эпохи — это уже п. 7а′
  const minReign = minReignAgeOf(g);
  const upperBound = (x: string): { hi: number; say: string; refs: string[] } | null => {
    const q = P(x);
    const c = persons.get(x)!;
    if (dated(x)) return { hi: c.b, say: `${q.name} ${fem(x) ? 'родилась' : 'родился'} ${c.bApprox ? 'около' : 'в'} ${formatYear(c.b)}`, refs: (q.chrono?.born?.refs ?? []).slice(0, 2) };
    const act = attestedFrom(q, minReign);
    if (act) return { hi: act.from - act.minAge, say: `${q.name} ${fem(x) ? 'засвидетельствована' : 'засвидетельствован'} уже в ${formatYear(act.from)}`, refs: act.refs.slice(0, 2) };
    return null;
  };
  const own = (x: string) => {
    const ch = P(x).chrono;
    return !!(ch?.active || ch?.reign?.length || ch?.born?.year !== undefined || ch?.born?.fatherAge !== undefined || ch?.born?.notAfter || ch?.born?.range || (P(x).card?.events ?? []).some((e) => e.year !== undefined));
  };
  const covered = (ids: string[]) => [...tensions, ...out].some((t) => ids.slice(1, -1).every((x) => t.persons.includes(x)));
  for (const id of g.order) {
    const me = persons.get(id)!;
    const q = P(id);
    if (me.named || me.cls === 'epochal') continue;
    // низ цепочки: свой год или последний засвидетельствованный год без предела жизни
    let lo: number;
    let saidLo: string;
    let refsLo: string[];
    if (dated(id)) [lo, saidLo, refsLo] = [me.b, `${q.name} ${fem(id) ? 'родилась' : 'родился'} ${me.bApprox ? 'около' : 'в'} ${formatYear(me.b)}`, (q.chrono?.born?.refs ?? []).slice(0, 2)];
    else if (q.chrono?.active) {
      const n = normFor(q.chrono.epoch ?? me.epoch);
      lo = toAstro(q.chrono.active.to) - n.lifeMax;
      saidLo = `${q.name} ${fem(id) ? 'засвидетельствована' : 'засвидетельствован'} ещё в ${formatYear(toAstro(q.chrono.active.to))}, а жизнь этого времени${NB}— не дольше ${yearsGen(n.lifeMax)}`;
      refsLo = (q.chrono.active.refs ?? []).slice(0, 2);
    } else continue;
    const chain = [id];
    let cur = id;
    for (let steps = 1; steps <= 40; steps++) {
      const e = (g.parentsOf.get(cur) ?? []).find((x) => x.kind === 'father' || x.kind === 'mother');
      if (!e) break;
      chain.push(e.parent);
      const ub = upperBound(e.parent);
      if (!ub) {
        if (own(e.parent)) break;
        cur = e.parent;
        continue;
      }
      if (steps < 4) break;
      const total = lo - ub.hi;
      const avg = total / steps;
      const down = [...chain].reverse();
      const links = down.slice(0, -1);
      const gAvg = links.reduce((sum, x) => sum + normFor(persons.get(x)!.epoch).g, 0) / steps;
      const nMax = links.reduce((sum, x) => sum + normFor(persons.get(x)!.epoch).max, 0) / steps;
      if (avg <= gAvg * 1.5 || avg > nMax * 1.05 || covered(down)) break;
      out.push({
        persons: down,
        text:
          `${chainOf(g, down)}: ${gens(steps)}${NB}— не меньше чем ${yearsWord(Math.round(total))}, в среднем не меньше чем по ${yearsWord(Math.round(avg))} на поколение, ` +
          `а обычное поколение этого времени${NB}— около ${yearsGen(Math.round(gAvg))} (${ub.say}; ${saidLo}). Годы звеньев между ними${NB}— только оценка. Вероятно, родословие называет не все поколения.`,
        refs: uniq([...ub.refs, ...refsLo, ...down.slice(1).flatMap((x) => (P(x).parentRefs ?? []).slice(0, 1))]).slice(0, 8),
        kind: 'compressed',
        cert: 'interpretation',
      });
      break;
    }
  }

  // порядок рождения из данных против годов (X1 В4; этап 13, T4): младший по порядку данных родился раньше старшего —
  // запись в § 13 обоих. У лиц с годами по числам текста это расхождение чисел («Иоахаз — первенец», 1 Пар 3:15, а по
  // 4 Цар 23:31, 36 он моложе Иоакима), у оценок — вероятно, перечень называет братьев не по старшинству (1 Цар 14:51)
  for (const id of g.order) {
    const kids = (g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' && !e.gap && P(e.child).order !== undefined).map((e) => e.child);
    const cls = (x: string) => persons.get(x)!;
    const ok = (x: string) => !cls(x).named && cls(x).cls !== 'epochal';
    kids.sort((a, b) => P(a).order! - P(b).order!);
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const [a, b] = [kids[i], kids[j]];
        if (P(a).order === P(b).order || !ok(a) || !ok(b)) continue;
        const ya = Math.round(cls(a).b);
        const yb = Math.round(cls(b).b);
        if (yb >= ya || [...tensions, ...out].some((t) => t.persons.includes(a) && t.persons.includes(b))) continue;
        const bothDated = dated(a) && dated(b);
        const years = yearsWord(ya - yb);
        // стих перечня — общий у обоих (1 Пар 3:15; 1 Цар 14:51), иначе первый стих родства младшего
        const common = (P(b).parentRefs ?? []).find((r) => (P(a).parentRefs ?? []).includes(r));
        const listed = common ?? (P(b).parentRefs ?? [])[0] ?? (P(a).parentRefs ?? [])[0];
        const where = listed ? ` (${listed.replace(/^([1-4])(\S)/, '$1 $2').replace(' ', NB)})` : '';
        out.push({
          persons: [a, b],
          text: bothDated
            ? `${chainOf(g, [a, b])}: в перечне детей${where} ${P(a).name} ${fem(a) ? 'названа' : 'назван'} прежде, а по числам текста ${P(b).name} ${fem(b) ? 'родилась' : 'родился'} на ${years} раньше. Вероятно, перечень называет детей не по старшинству или какое-то из чисел передано иначе.`
            : `${chainOf(g, [a, b])}: в перечне детей${where} ${P(a).name} ${fem(a) ? 'названа' : 'назван'} прежде, а по принятым годам ${P(b).name} старше примерно на ${years}. Годы обоих выведены из родства и засвидетельствованных лет; вероятно, перечень называет братьев не по старшинству.`,
          refs: uniq([...(listed ? [listed] : []), ...(P(a).chrono?.reign ?? []).flatMap((r) => r.refs.slice(0, 1)), ...(P(b).chrono?.reign ?? []).flatMap((r) => r.refs.slice(0, 1)), ...(P(a).parentRefs ?? []).slice(0, 1)]).slice(0, 6),
          kind: bothDated ? 'numbers' : 'pair',
          cert: 'interpretation',
        });
      }
  }

  // «Фарре 70»: Аврам уходит из Харрана за 60 лет до смерти отца, а Деян 7:4 — «по смерти отца» (X1 А1)
  if (modelId === 'terah70' && g.persons.has('farra') && g.persons.has('avraam')) {
    const f = persons.get('farra')!;
    const a = persons.get('avraam')!;
    const fAge = ageAtDeath('farra');
    if (fAge && dated('farra') && dated('avraam')) {
      const left = a.b + 75; // Быт 12:4
      const died = f.b + fAge.age;
      if (died - left > 1)
        out.push({
          persons: ['farra', 'avraam'],
          text:
            `Фарра${NB}— Аврам: в этой модели Фарре 70${NB}лет при рождении Аврама (Быт${NB}11:26), и Аврам уходит из Харрана 75${NB}лет (Быт${NB}12:4)${NB}— в ${formatYear(left)}, ` +
            `а Фарра, проживший 205${NB}лет (Быт${NB}11:32), умирает в ${formatYear(died)}${NB}— через ${yearsWord(Math.round(died - left))}. Деян${NB}7:4 говорит, что Аврам переселился «по смерти отца». ` +
            'Поэтому основная модель считает, что Аврам родился, когда Фарре было 130 лет, а первым в Быт 11:26 назван как главный из сыновей.',
          refs: ['Быт 11:26', 'Быт 12:4', 'Быт 11:32', 'Деян 7:4'],
          kind: 'numbers',
          cert: 'interpretation',
        });
    }
  }

  // Каинан (Лк 3:36) в моделях основного текста: Быт 11:12 его не знает (X1 Д5)
  if (!lxx && g.persons.has('kainan-syn-arfaksada')) {
    const k = P('kainan-syn-arfaksada');
    const f = fatherOf(g, k.id);
    const sala = f ? (g.childrenOf.get(f) ?? []).map((e) => e.child).find((c) => c !== k.id && P(c).chrono?.born?.fatherAge !== undefined) : undefined;
    if (f && sala)
      out.push({
        persons: [f, k.id, sala],
        text:
          `${chainOf(g, [f, k.id, sala])}: Каинан назван только у Луки (Лк${NB}3:36) и в скобках Синодального текста Быт${NB}11:12–13. ` +
          `По основному тексту Быт${NB}11:12 ${P(sala).name}${NB}— сын ${nameCase(P(f).name, P(f).sex, 'gen') ?? P(f).name}, ${fem(sala) ? 'родившаяся' : 'родившийся'} через ${yearsWord(P(sala).chrono!.born!.fatherAge!)} после отца, и места для ещё одного поколения нет: год Каинана здесь только оценка.`,
        refs: ['Лк 3:36', 'Быт 11:12', 'Быт 11:13'],
        kind: 'numbers',
      });
  }
  return out;
}

/**
 * Напряжения из утверждений текста, которые ставят лицо при событии другого времени, а полей для них в данных нет
 * (ТЗ § 3.6; DF2). Годы — из данных и эпох модели; в коде — только само утверждение текста и его стихи.
 *  — «Мардохей, уведённый с Иехонией» (Есф 2:6): по прямому смыслу стиха «переселен из Иерусалима вместе с пленниками,
 *    выведенными с Иехониею» сам Мардохей — в год, когда кончилось царствование Иехонии (4 Цар 24:12–15), а события книги —
 *    при персидском царе, в третий — двенадцатый годы его царствования (Есф 1:3; 3:7), то есть не раньше начала эпохи книги
 *    («Возвращение и персидское время», data/epochs.json). Слова стиха можно отнести и к прадеду Кису, названному в Есф 2:5
 *    последним (примечание § 24 его карточки).
 */
function textWitnessTensions(g: Graph, epochs: Epoch[]): Tension[] {
  const out: Tension[] = [];
  // Езекия — Осия (X1 Д5; решение 101): 4 Цар 18:1 ставит воцарение Езекии «в третий год Осии», 18:9–10 — взятие
  // Самарии «в шестой год Езекии, то есть в девятый год Осии»; а «в четырнадцатый год царя Езекии» (18:13) — нашествие
  // Сеннахирима, год которого известен по его анналам (опора в data/anchors.json). Годы атласа — по 18:13.
  const hez = g.persons.get('ezekiya');
  const hos = g.persons.get('osiya-syn-ily');
  const hr = hez?.chrono?.reign?.[0];
  const or = hos?.chrono?.reign?.[0];
  const sync = hr?.sync?.find((x) => x.with === 'osiya-syn-ily');
  if (hez && hos && hr && or && sync) {
    const third = toAstro(or.start) + sync.year - 1;
    const start = toAstro(hr.start);
    const fall = toAstro(or.end);
    if (start - third > 1)
      out.push({
        persons: [hos.id, hez.id],
        text:
          `${chainOf(g, [hos.id, hez.id])}: 4${NB}Цар${NB}18:1 ставит воцарение Езекии «в ${sync.year === 3 ? 'третий' : `${sync.year}-й`} год Осии»${NB}— по годам Осии это ${formatYear(third)}, ` +
          `а 18:9–10 относит взятие Самарии (${formatYear(fall)}) к шестому году Езекии. Но «в четырнадцатый год царя Езекии» на Иудею пошёл Сеннахирим (18:13), ` +
          `а год этого нашествия известен по его анналам: отсюда начало Езекии${NB}— ${formatYear(start)}, на ${yearsWord(Math.round(start - third))} позже и уже после падения Самарии. ` +
          'Годы Езекии в атласе — по 18:13 (реконструкция Тиле — Янга). Вероятно, синхронизмы 18:1, 9–10 считают от совместного правления с Ахазом или передают иной счёт.',
        refs: ['4Цар 18:1', '4Цар 18:9', '4Цар 18:10', '4Цар 18:13', ...(or.refs ?? []).slice(0, 1)],
        kind: 'numbers',
        cert: 'interpretation',
      });
  }
  const who = g.persons.get('mardokhey');
  const reign = g.persons.get('iekhoniya')?.chrono?.reign ?? [];
  const persian = epochsOfChapter(epochs, 'Есф', 3)[0];
  if (who && reign.length && persian) {
    const exile = Math.max(...reign.map((r) => toAstro(r.end)));
    const twelfth = toAstro(persian.start) + 11; // двенадцатый год царя, воцарившегося не раньше начала эпохи
    // родословие Есф 2:5: Мардохей, сын Иаира, сын Семея, сын Киса — от Киса
    const chain = [who.id];
    for (let x = fatherOf(g, who.id); x && chain.length < 4; x = fatherOf(g, x)) chain.unshift(x);
    const kis = chain.length === 4 ? g.persons.get(chain[0])! : null;
    out.push({
      persons: chain,
      text:
        `${chainOf(g, chain)}: по прямому смыслу Есф${NB}2:6 ${who.name} переселён из Иерусалима в${NB}${formatYear(exile)} и к двенадцатому году царя (Есф${NB}3:7) ` +
        `ему было бы не меньше ${yearsWord(Math.round(twelfth - exile))}. Так выходит, если к нему самому относятся слова «переселен из Иерусалима вместе ` +
        `с пленниками, выведенными с Иехониею»: события книги${NB}— при персидском царе, не раньше ${formatYear(toAstro(persian.start))} (Есф${NB}1:3). ` +
        (kis
          ? `Вероятно, переселён был не сам ${who.name}, а его прадед ${kis.name}: в Есф${NB}2:5 он назван последним перед этими словами.`
          : `Вероятно, слова стиха относятся к одному из его предков, названных в Есф${NB}2:5.`),
      refs: ['Есф 2:6', 'Есф 2:5', 'Есф 3:7', 'Есф 1:3', '4Цар 24:12', '4Цар 24:15'],
      kind: 'text',
      cert: 'interpretation',
    });
  }
  return out;
}

/** Короткие названия моделей для текста напряжений. */
const MODEL_SHORT: Record<ChronoModelId, string> = {
  'mt-long': 'Основной текст',
  'mt-short': 'Краткое пребывание',
  lxx: 'Числа в скобках',
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

/** Годы лица для словаря дат (engine/years.ts) из результата решателя. */
export function lifeDatesOf(c: PersonChrono): LifeDates {
  return {
    b: c.b, bLo: c.bLo, bHi: c.bHi, d: c.d, cls: c.cls, dLo: c.dLo, dHi: c.dHi,
    ...(c.named ? { named: true } : {}),
    ...(c.dAge !== undefined ? { dAge: c.dAge } : {}),
    ...(c.bApprox ? { bApprox: true } : {}),
    ...(c.dApprox ? { dApprox: true } : {}),
    ...(c.pin ? { pin: c.pin } : {}),
    ...(c.dFixed !== undefined ? { dFixed: c.dFixed } : {}),
  };
}

/**
 * Какие годы меняются между моделями (этап 13, решения 96, 102; X1 Х7, X2 § 2.5). Сравниваются показанные годы
 * (словарь дат, lifeText): у лица, чьи годы в модели m показаны иначе, чем в модели по умолчанию (results[0]),
 * persons[id][m] — годы в модели m. Сводка модели: сколько лиц сдвинуто, годы опорных событий, напряжения, лица после
 * Исхода с другими годами — группами по ближайшему предку, родившемуся до Исхода (их годы оценены от него).
 */
export function modelDependence(g: Graph, results: ChronoResult[]): { persons: Map<string, Partial<Record<ChronoModelId, LifeDates>>>; info: ModelInfo[] } {
  const base = results[0];
  const persons = new Map<string, Partial<Record<ChronoModelId, LifeDates>>>();
  const info: ModelInfo[] = [];
  for (const r of results) {
    const meta = MODELS.find((m) => m.id === r.model)!;
    const after = new Map<string, { ids: string[]; lo: number; hi: number; root: string }>();
    let shifted = 0;
    if (r !== base) {
      for (const id of g.order) {
        const c0 = base.persons.get(id);
        const c1 = r.persons.get(id);
        if (!c0 || !c1 || c0.named) continue;
        const l0 = lifeDatesOf(c0);
        const l1 = lifeDatesOf(c1);
        if (lifeText(l0) === lifeText(l1)) continue;
        shifted++;
        persons.set(id, { ...(persons.get(id) ?? {}), [r.model]: l1 });
        // после Исхода — родившиеся после него в модели по умолчанию (X2 Д12: род Иерахмеила, Иавис)
        if (c0.b < EXODUS) continue;
        // после Исхода: ближайший предок (по отцу, затем по матери), родившийся до Исхода в модели по умолчанию
        let root = id;
        for (let k = 0; k < 80; k++) {
          const up = fatherOf(g, root) ?? motherOf(g, root);
          if (!up) break;
          root = up;
          if ((base.persons.get(root)?.b ?? Infinity) < EXODUS) break;
        }
        const cur = after.get(root) ?? { ids: [], lo: Infinity, hi: -Infinity, root };
        const shift = Math.round(c1.b - c0.b);
        cur.ids.push(id);
        cur.lo = Math.min(cur.lo, shift);
        cur.hi = Math.max(cur.hi, shift);
        after.set(root, cur);
      }
    }
    const year = (x: number | null | undefined) => (x === null || x === undefined ? null : toHist(x));
    const ep = r.epochs ?? [];
    const epStart = (eid: string) => ep.find((e) => e.id === eid)?.start ?? null;
    const events: ModelInfo['events'] = [];
    const push = (id: ModelEventId, y: number | null) => {
      if (y !== null) events.push({ id, year: y });
    };
    push('adam', year(r.persons.get('adam')?.b));
    push('flood', epStart('postdiluvian'));
    push('abram', year(r.persons.get('avraam')?.b));
    push('egypt', epStart('egypt'));
    push('exodus', epStart('exodus'));
    const nameOf = (x: string) => g.persons.get(x)?.name ?? x;
    info.push({
      ...meta,
      shifted,
      events,
      tensions: r.tensions.length,
      afterExodus: [...after.values()]
        .sort((a, b) => b.ids.length - a.ids.length)
        .map((a) => ({
          ids: a.ids,
          shift: [a.lo, a.hi] as [number, number],
          why:
            (base.persons.get(a.root)?.b ?? Infinity) < EXODUS
              ? `родословие без лиц с годами после Исхода: годы оценены по поколениям от предка, жившего до Исхода${NB}— ${nameOf(a.root)}`
              : `годы оценены по годам лиц того же рода или родни, живших до Исхода: своих чисел у звеньев нет`,
        })),
    });
  }
  return { persons, info };
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
