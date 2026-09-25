/**
 * Модель данных «Толедот».
 *
 * Годы — исторические: отрицательные — до Р. Х. (-1010 = 1010 г. до Р. Х.),
 * положительные — по Р. Х. Нулевого года нет.
 * Ссылки на Писание — в нумерации Синодального перевода: «Быт 5:3», «1Пар 3:17-19», «Мф 1:2,3».
 */

export type Ref = string;

/** Уровень достоверности факта (ТЗ, П-3). */
export type Cert = 'scripture' | 'inference' | 'interpretation';

export type Sex = 'm' | 'f';

export type Role =
  | 'patriarch' // праотец / патриарх (Адам … Иаков)
  | 'forefather' // родоначальник рода, колена или народа
  | 'matriarch'
  | 'king'
  | 'queen'
  | 'queen-mother'
  | 'prince'
  | 'high-priest'
  | 'priest'
  | 'levite'
  | 'prophet'
  | 'judge'
  | 'apostle'
  | 'disciple'
  | 'commander'
  | 'official'
  | 'scribe'
  | 'musician'
  | 'craftsman'
  | 'shepherd'
  | 'tribal-leader'
  | 'foreign-ruler'
  | 'messiah';

/** Утверждение со ссылками. */
export interface Fact {
  text: string;
  refs: Ref[];
  cert?: Cert; // по умолчанию 'scripture'
}

export interface SpouseLink {
  id: string;
  kind: 'wife' | 'concubine' | 'husband';
  refs: Ref[];
  cert?: Cert;
  order?: number; // порядок брака / перечисления
  note?: string;
}

/** Дополнительная (непервичная) линия происхождения: законный, приёмный отец, «отец» по Лк 3 и т. п. */
export interface OtherParent {
  id: string;
  role: 'father' | 'mother';
  kind: 'legal' | 'adoptive' | 'by-luke' | 'ancestor' | 'levirate' | 'alternative';
  refs: Ref[];
  cert: Cert;
  note?: string;
}

export interface KinLink {
  id: string;
  /** Отношение ОТ ЭТОГО лица К указанному, по-русски: «дядя», «тесть», «родственница», «брат», «племянник» … */
  rel: string;
  refs: Ref[];
  cert?: Cert;
}

export interface TimeOffset {
  /** Родился через `years` лет после рождения лица `from` (обобщение возраста отца — напр., Сала через 35 лет после Арфаксада). */
  from: string;
  years: number;
}

export interface BornInput {
  year?: number; // явный исторический год
  fatherAge?: number; // возраст отца при рождении (Быт 5, 11) — по основному тексту
  fatherAgeBracket?: number; // число в [скобках] Синодального текста (греческое чтение), для альтернативной модели
  motherAge?: number; // возраст матери при рождении
  offset?: TimeOffset;
  /** Родился не позже, чем через `years` лет после рождения `from` (Кааф пришёл в Египет с Иаковом: не позже Иаков + 130). */
  notAfter?: TimeOffset;
  /** Родился не раньше, чем через `years` лет после рождения `from`. */
  notBefore?: TimeOffset;
  range?: [number, number]; // допустимый интервал в годах (только после Исхода: до него годы зависят от модели)
  refs?: Ref[];
  cert?: Cert;
  note?: string;
}

export interface DiedInput {
  year?: number;
  age?: number; // прожил лет
  ageBracket?: number; // число в [скобках] Синодального текста
  range?: [number, number];
  refs?: Ref[];
  cert?: Cert;
  note?: string;
}

export interface Reign {
  over: string; // «Иудея», «Израиль», «Едом», «Персия» …
  start: number;
  end: number;
  years?: number; // по тексту Писания
  ageAtStart?: number;
  refs: Ref[];
  note?: string;
}

export interface Active {
  from: number;
  to: number;
  refs: Ref[];
  note?: string;
}

export interface Chrono {
  born?: BornInput;
  died?: DiedInput;
  reign?: Reign[];
  active?: Active; // годы, когда лицо заведомо было живо (служение, событие)
  epoch?: string; // id эпохи рождения / жизни, если иных опор нет
}

export interface AltName {
  name: string;
  kind: 'variant' | 'renamed' | 'title' | 'epithet' | 'foreign' | 'patronymic';
  refs: Ref[];
  note?: string;
}

export interface Place {
  name: string;
  role: 'birth' | 'residence' | 'travel' | 'death' | 'burial' | 'other';
  refs: Ref[];
  note?: string;
}

export interface Office {
  title: string;
  from?: number;
  to?: number;
  refs: Ref[];
  note?: string;
}

export interface LifeEvent {
  text: string;
  refs: Ref[];
  age?: number;
  year?: number;
  cert?: Cert;
}

export interface Saying {
  /** Точная цитата из Синодального текста (проверяется валидатором). */
  quote: string;
  ref: Ref;
  context?: string;
}

export interface Note {
  kind: 'textual' | 'interpretation' | 'identification' | 'chronology' | 'bracket';
  text: string;
  refs?: Ref[];
}

export interface Met {
  id: string;
  refs: Ref[];
  text?: string;
}

/**
 * Карточка — разделы § 2–24. § 1 (имя), § 6 (родители), § 9–12 (семья), § 13–14 (время), § 21 (линии Мессии)
 * строятся из графа и хронологического движка; поля *Note дополняют их.
 */
export interface Card {
  original?: { lang: 'he' | 'arc' | 'gr' | 'other'; script: string; translit: string; note?: string }; // § 2
  meaning?: { text: string; refs?: Ref[]; cert?: Cert }; // § 3
  altNames?: AltName[]; // § 4
  status?: Fact[]; // § 5
  parentsNote?: Fact[]; // § 6
  lineage?: Fact[]; // § 7
  birth?: { place?: string; facts?: Fact[] }; // § 8
  spousesNote?: Fact[]; // § 9
  childrenNote?: Fact[]; // § 10
  siblingsNote?: Fact[]; // § 11
  kinNote?: Fact[]; // § 12
  chronoNote?: Fact[]; // § 13
  met?: Met[]; // § 14 — подтверждённые Писанием встречи
  places?: Place[]; // § 15
  offices?: Office[]; // § 16
  events?: LifeEvent[]; // § 17
  sayings?: Saying[]; // § 18
  withGod?: Fact[]; // § 19
  death?: { place?: string; facts?: Fact[]; burial?: Fact[] }; // § 20
  messiahNote?: Fact[]; // § 21
  laterMentions?: Fact[]; // § 22
  scripture?: { first?: Ref; key?: Ref[]; all?: Ref[] }; // § 23
  notes?: Note[]; // § 24
  /** Разделы (номера 1–24), о которых Писание, по проверке составителя, молчит. */
  silent?: number[];
}

export type PersonKind =
  | 'person'
  | 'people' // народ или род, названный «сыном» в таблице народов (Быт 10)
  | 'founder' // «отец» города (1 Пар 2:50–51)
  | 'clan'; // род, названный по предку (Езд 2)

export interface Person {
  id: string;
  name: string;
  disambig?: string;
  sex: Sex;
  kind?: PersonKind; // по умолчанию 'person'
  unnamed?: boolean; // безымянное звено: «Жена Лота»
  father?: string | null;
  mother?: string | null;
  parentRefs?: Ref[];
  parentCert?: Cert;
  /** Уровень достоверности для матери, если он отличается от parentCert (отец назван, мать выведена). */
  motherCert?: Cert;
  /** Вид отцовства основного отца: по умолчанию кровный. */
  fatherKind?: 'natural' | 'legal';
  /** Родословие может пропускать поколения между этим лицом и отцом (Исх 6:16–20, Руф 4:18–22, Мф 1). */
  fatherGap?: boolean;
  /** Порядок рождения среди детей отца (1 — первенец), если известен или по порядку перечисления. */
  order?: number;
  otherParents?: OtherParent[];
  spouses?: SpouseLink[];
  kin?: KinLink[];
  roles?: Role[];
  group: string;
  prominence: 1 | 2 | 3 | 4 | 5;
  chrono?: Chrono;
  card?: Card;
}

export interface Volume {
  volume: string;
  title: string;
  scope: string;
  persons: Person[];
}

export interface Group {
  id: string;
  name: string; // подпись области на полотне
  kind: 'line' | 'tribe' | 'nation' | 'house' | 'people' | 'other';
  foreign?: boolean; // народы вне Израиля — штриховка
  parent?: string;
  hue?: number;
}

export interface Epoch {
  id: string;
  name: string;
  short: string;
  start: number;
  end: number;
  basis: string;
  refs: Ref[];
  summary: string;
  books: string[];
  keyPersons: string[];
  events: { year: number; text: string; refs: Ref[] }[];
}
