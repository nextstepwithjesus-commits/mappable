/**
 * Модель базы приложения «Библия наглядно» (документ docs/app/02-ДАННЫЕ.md, § 3; утверждён 9 октября 2026, В-15).
 *
 * Каждый факт — ровно одна запись одного типа: родство — в происхождении, брак — в союзе, связь — в связи,
 * прочее содержание карточки — в утверждениях лица. У каждой записи — стихи (синодальная нумерация, написание
 * «1Пар 1:32») или источник из реестра, уровень достоверности и происхождение (кто составил, кто проверил, статус).
 *
 * Номера неизменны: лицо `p-…`, союз `u-…`, область `g-…`, набор прочтений `r-…`. Слияние и деление лиц —
 * только через таблицу переадресации (base/redirects.json).
 */

/** Стих или диапазон в синодальной нумерации: «Быт 5:3», «1Пар 3:17-19», «Мф 1:2,3». */
export type Ref = string;

/**
 * Уровень достоверности (регламент, § 3): Писание, вывод (не меньше двух стихов), толкование, расчёт по модели,
 * справочно (вне текста Писания, с источником).
 */
export type Cert = 'scripture' | 'inference' | 'interpretation' | 'calc' | 'reference';

/** Статус записи: черновик, проверено, карантин (справочное без источника — в приложение не попадает). */
export type Status = 'draft' | 'checked' | 'quarantine';

/** Проверка записи: кем (человек или агент), когда и какой версии содержимого она касается. */
export interface Check {
  by: string;
  kind: 'human' | 'agent';
  at: string;
  /** Отпечаток содержимого записи на момент проверки: смысловая правка возвращает запись в черновик. */
  hash: string;
}

/** Происхождение записи (02, § 3.1). У файла — значение по умолчанию, у записи — уточнение. */
export interface Prov {
  by: string;
  at: string;
  status: Status;
  /** Откуда перенесено: прежний том и коммит (у записи — только том; коммит — у файла). */
  from?: { vol: string; commit?: string };
  check?: Check;
  /** Причина карантина или иного статуса. */
  note?: string;
}

/** Файл базы: метаданные (версия схемы, происхождение по умолчанию) и записи. */
export interface BaseFile<T> {
  schema: number;
  title: string;
  prov: Prov;
  items: T[];
}

// ---------- действующие лица ----------

/** Вид действующего лица (концепция § 3; 02 § 3.2). */
export type ActorKind =
  | 'human'
  | 'unnamed'
  | 'group'
  | 'people'
  | 'clan'
  | 'angel'
  | 'angel-of-the-lord'
  | 'spirit'
  | 'deity'
  | 'animal'
  | 'divine'
  | 'parable'
  | 'vision';

export type NameType = 'main' | 'variant' | 'renamed' | 'title' | 'epithet' | 'foreign' | 'patronymic';

export interface Name {
  form: string;
  type: NameType;
  refs: Ref[];
  note?: string;
}

/** Утверждение карточки: всё, что не родство, не брак и не связь (02, § 3.2). */
export interface Assertion {
  /** Номер раздела прежней карточки (§ 2–24); новая нумерация — документ 07. */
  sec: number;
  /** Поле прежней карточки, откуда перенесено (для обратной проекции). */
  field: string;
  /** Содержимое в прежнем виде: текст, факт, место, событие, изречение, примечание… */
  value: unknown;
  /** Нет поля — «Писание» (так и в прежних данных). */
  cert?: Cert;
  prov?: Partial<Prov>;
}

export interface Actor {
  id: string;
  kind: ActorKind;
  /** Уточнение вида: «отец» города (1Пар 2:50–51). */
  subkind?: 'founder';
  sex?: 'm' | 'f';
  /** Основное имя — первое; иные формы со стихами. */
  names: Name[];
  disambig?: string;
  /** Описательное слово безымянного из стиха: «вдова», «сотник». */
  descriptor?: string;
  roles?: string[];
  /** Численность группы по тексту: точная или «около» (Мф 14:21); выделенный член числа не увеличивает (Лк 17:17). */
  count?: { n: number; approx?: boolean; refs: Ref[] };
  /** Значимость из прежнего проекта: сырьё для отбора главных лиц, не факт. */
  prominence?: number;
  facts: Assertion[];
  prov?: Partial<Prov>;
}

// ---------- союзы и происхождение ----------

/**
 * Вид союза (02, § 3.2): брак («жена», «муж»); наложница; служанка, данная «в жену» (Быт 16:3; 30:4); выкуп (Руф 4:10);
 * не назван — отец и мать названы у детей, а сам союз текст не называет (Иуда и Фамарь, Быт 38; Лот и дочери, Быт 19:36).
 */
export type UnionKind = 'marriage' | 'concubine' | 'maid-as-wife' | 'redemption' | 'not-stated';

/** Обозначение союза со стихами; их может быть несколько: Хеттура — «жена» (Быт 25:1) и «наложница» (1Пар 1:32). */
export interface UnionTerm {
  kind: UnionKind;
  /** Слово текста: «жена», «муж», «наложница». */
  word?: string;
  /** На чьей записи стояло обозначение в прежних данных (сторона записи, не вид союза). */
  side?: 'husband' | 'wife';
  refs: Ref[];
  /** Нет поля — «Писание». */
  cert?: Cert;
  note?: string;
  /** Порядок брака у этой стороны (прежнее поле order у записи супруга). */
  order?: number;
  /** Окончание союза: «отдал… Мелхолу… Фалтию» (1Цар 25:44). */
  ended?: { refs: Ref[]; note?: string };
  prov?: Partial<Prov>;
}

export interface Union {
  id: string;
  /** Мужчина и женщина (по прежним данным); порядок полей не означает старшинства. */
  husband: string;
  wife: string;
  terms: UnionTerm[];
  prov?: Partial<Prov>;
}

/**
 * Вид происхождения (02, § 3.2): кровное, законное, приёмное (Есф 2:7; Исх 2:10), предок через пропуск
 * поколений, по другому родословию (Лк 3), иное прочтение (1Пар 3:19).
 */
export type OriginKind = 'natural' | 'legal' | 'adoptive' | 'ancestor' | 'by-luke' | 'alternative' | 'levirate';

/**
 * Происхождение — ребро к каждому названному родителю (02, § 3.2, уточнено по рецензии Д1). Союз родителей — запись
 * Union той же пары; «не от союза» записывается явно (Иисус Христос: NoData `not-applicable`, 02 § 3.5).
 * Родитель не назван («сыновья Саруии», 1Пар 2:16) — `parent` нет, есть `unnamedParent` со словами текста.
 */
export interface Origin {
  child: string;
  parent?: string;
  /** Заместитель неназванного родителя — свой у каждого ребёнка (02, § 3.6). */
  unnamedParent?: { words: string; refs: Ref[] };
  role: 'father' | 'mother';
  kind: OriginKind;
  refs: Ref[];
  cert: Cert;
  /** Основная линия (прежние поля father/mother) или дополнительная (otherParents). */
  primary: boolean;
  /** Пропуск поколений между ребёнком и родителем (Мф 1; Руф 4:18–22). */
  gap?: boolean;
  /**
   * Возможный пропуск, на который указывает другое место: через кого и по каким стихам (Каинан: Лк 3:36 при Быт 11:12).
   * Расчёт родства, идущий через `via`, считает это ребро предком, а не отцом: Каинан не выходит братом Салы.
   */
  gapPossible?: { refs: Ref[]; via: string[] };
  /** Слова текста для ребра, если связь названа не словом «родил» (Иосиф: «муж Марии», «как думали»). */
  words?: { text: string; ref: Ref }[];
  /** Набор взаимоисключающих прочтений и прочтения, при которых ребро действует. */
  reading?: { set: string; in: string[] };
  /** Стихи общие с ребром другого родителя (прежнее parentRefs); снимается, когда стихи разделены. */
  refsShared?: true;
  note?: string;
  /** Порядок среди детей (прежнее поле order) — порядок перечисления, не порядок рождения, если текст не говорит. */
  order?: number;
  prov?: Partial<Prov>;
}

/** Родство словами Писания, без выведения родителей (П-8). Слово должно быть в стихе. */
export interface KinTerm {
  from: string;
  to: string;
  rel: string;
  refs: Ref[];
  cert?: Cert;
  prov?: Partial<Prov>;
}

/** Набор взаимоисключающих прочтений (02, § 3.4): схемы и расчёт никогда не складывают два прочтения одного набора. */
export interface ReadingSet {
  id: string;
  title: string;
  refs: Ref[];
  readings: { id: string; label: string; cert: Cert; refs: Ref[] }[];
  /** Прочтение по умолчанию — по букве текста. */
  default: string;
  note: string;
}

// ---------- области и членство ----------

export interface Area {
  id: string;
  name: string;
  kind: string;
  founder?: string;
  parent?: string;
  foreign?: boolean;
  section?: string;
  hue?: number;
  prov?: Partial<Prov>;
}

/**
 * Членство лица в области (02, § 3.2). Основание: потомок основателя, назван в колене по тексту или
 * перенесено из прежней раскладки (требует разбора на этапе Д3).
 */
export interface Membership {
  actor: string;
  /** Область (`g-…`) или группа — действующее лицо вида group (`p-…`). */
  area: string;
  /** Роль в группе словами текста: «один из них» (Лк 17:15). */
  role?: string;
  basis: 'descent' | 'named' | 'legacy-layout';
  refs: Ref[];
  prov?: Partial<Prov>;
}

// ---------- время ----------

/**
 * Хронологические входы лица в прежнем виде (поле chrono). Переработка в отдельные входы со стихами и удаление
 * готовых годов и оценок по порядку перечисления — этап Д6 (02, § 6.8).
 */
export interface ChronoRecord {
  actor: string;
  chrono: unknown;
  prov?: Partial<Prov>;
}

// ---------- «нет сведений» ----------

export type NoDataKind = 'silent' | 'stated-absent' | 'genealogy-not-found' | 'not-applicable' | 'not-researched';

export interface NoData {
  actor: string;
  /** Номер раздела прежней карточки. */
  sec: number;
  kind: NoDataKind;
  /** О чём именно: «отец по плоти» (Иисус Христос, Мф 1:20). */
  what?: string;
  refs: Ref[];
  prov?: Partial<Prov>;
}

// ---------- переадресация, исправления, источники ----------

export interface Redirect {
  from: string;
  to: string[];
  reason: string;
  refs: Ref[];
  at: string;
}

/** Сознательное отличие базы от прежних данных: обратная проекция объясняет разницу этим списком. */
export interface Correction {
  id: string;
  what: string;
  why: string;
  refs: Ref[];
  /** Затронутые лица прежней базы (прежние номера). */
  actors: string[];
  /** Затронутые записи вне лиц: «line:mary», «epochs». */
  other?: string[];
}

export interface Source {
  id: string;
  title: string;
  org: string;
  author?: string;
  version: string;
  date: string;
  /** Лицензия конкретного файла — дословно. */
  license: string;
  attribution?: string;
  use: 'basis' | 'reference' | 'check-only';
  read: string;
  dependsOn?: string[];
  limits: string;
  notProves: string;
}
