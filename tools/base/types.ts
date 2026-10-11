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
  /** Версии входов на момент проверки (входят в отпечаток): sha256 текста и таблицы скобок, источники записи. */
  inputs?: CheckInputs;
  /** Пометка в истории подписи: «перенос номера: <прежний ключ>» (02 § 3.3.3, п. 4). */
  note?: string;
}

/** Входы проверки (02 § 3.1): «проверено» относится к содержимому записи и к версиям ЕЁ стихов и входов — не целых файлов. */
export interface CheckInputs {
  /** Стихи записи (синодальная нумерация, по порядку): из её ссылок. */
  verses: string[];
  /** sha256 текста этих стихов в tools/bible/synodal.tsv. */
  text: string;
  /** sha256 строк tools/bible/brackets.tsv об этих стихах — от них зависит scriptureText. */
  brackets: string;
  /** sha256 строк tools/bible/source-issues.tsv об этих стихах (дефекты электронного текста). */
  issues: string;
  /** Источники записи из реестра base/sources.json: номер → версия (src-synodal — у каждой записи). */
  sources: Record<string, string>;
}

/**
 * Подпись проверки в журнале base/checks.json (этап Д3-2). База base/ пересобирается из data/ и шагов правки, поэтому
 * подпись живёт отдельно и находит запись по ключу (`union:u-…`, `fact:p-…|18|sayings|1`). Повторная проверка
 * переносит прежнюю подпись в `history` — она остаётся в истории (02 § 3.1).
 */
export interface CheckEntry extends Check {
  key: string;
  history?: Check[];
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
  /**
   * Источники записей файла по умолчанию — номера реестра base/sources.json (09 § 5.5; Д3-3). Как с prov: у файла —
   * значение по умолчанию, у записи — уточнение (поле `sources` записи добавляет свои). У текста Писания — `src-synodal`.
   */
  sources: string[];
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
  /** Номер утверждения `a-<число>` из base/ids.json (02 § 3.3.1; К-1). */
  id?: string;
  /** Номер раздела прежней карточки (§ 2–24); новая нумерация — документ 07. */
  sec: number;
  /** Поле прежней карточки, откуда перенесено (для обратной проекции). */
  field: string;
  /** Содержимое в прежнем виде: текст, факт, место, событие, изречение, примечание… */
  value: unknown;
  /** Нет поля — «Писание» (так и в прежних данных). */
  cert?: Cert;
  /**
   * Толкование без авторов (R9 Г-2, Г-4; рецензия 03, Р5-1): хранится для совета источников, читателю не показывается —
   * сборка выпуска его не выносит. Снимается, когда у толкования появятся авторы.
   */
  needsSources?: true;
  /**
   * Ссылка на расчёт года, а не год (02 § 3.10.2 [4.1 по Р-5]; Д-7): какое событие и по какой модели (`m-…`, год до царей)
   * или схеме (`s-…`, год царя) считать. Числа года в записи нет — значение года только в пакете сборки (04 § 16.1).
   * `event` — строка, пока нет историй `e-…`. Ни модели, ни схемы нет — для этого времени модель ещё не составлена.
   */
  calc?: { event: string; model?: string; scheme?: string };
  prov?: Partial<Prov>;
}

/**
 * Тождество конца записи родства или союза (по образцу `Origin.identity`, шаг C45; Д-5): слово сказано вне скобок, а то ли
 * это лицо, что в данных, — текст прямо не говорит («Иоиль, брат Нафана», 1Пар 11:38 — тот ли Нафан, что в 2Цар 23:36).
 */
export interface EndIdentity { of: 'from' | 'to' | 'husband' | 'wife'; degree: 'weighty' | 'possible'; note: string; refs: Ref[] }

/**
 * Отношение лиц (02 § 3.11.1; § 3.3.4 [4.2]): «не то же лицо» или «возможно, то же лицо». Карточки не сливаются, связь,
 * ребро и стих по «возможно» на другую карточку не переходят. Один возможный тёзка — своя карточка и это отношение,
 * не ребро к известному лицу (Иоиль, «брат Нафана», 1Пар 11:38 — тот ли Нафан, что в 2Цар 23:36).
 */
export interface ActorRelation {
  /** Номер `ar-<число>` из base/ids.json. */
  id?: string;
  a: string;
  b: string;
  kind: 'not-same' | 'possibly-same';
  /** Стихи обеих сторон. */
  refs: Ref[];
  /** `not-same`: «Писание» или «вывод»; `possibly-same`: «вывод» или «толкование» с трудами. */
  cert: Cert;
  works?: Cite[];
  note: string;
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
 * союз без брака — союз описан текстом, а браком не назван (Иуда и Фамарь: «вошел к ней», Быт 38:18; шаг C34);
 * не назван — отец и мать названы у детей, а сам союз текст не называет (Лот и дочери, Быт 19:36).
 */
export type UnionKind = 'marriage' | 'concubine' | 'maid-as-wife' | 'redemption' | 'non-marital' | 'not-stated';

/** Обозначение союза со стихами; их может быть несколько: Хеттура — «жена» (Быт 25:1) и «наложница» (1Пар 1:32). */
export interface UnionTerm {
  kind: UnionKind;
  /**
   * Слово текста: «жена», «муж», «наложница», «в жену». Оно стоит хотя бы в одном стихе обозначения вне скобок
   * (проверка базы; шаг C35). Нет поля — в стихах слова о союзе нет.
   */
  word?: string;
  /** На чьей записи стояло обозначение в прежних данных (сторона записи, не вид союза). */
  side?: 'husband' | 'wife';
  refs: Ref[];
  /** Нет поля — «Писание». */
  cert?: Cert;
  note?: string;
  /** Порядок брака у этой стороны (прежнее поле order у записи супруга). */
  order?: number;
  /** Слово сказано лицом в тексте: «муж мой» — слова Лии (Быт 29:32; 30:20; шаг C40). */
  saidBy?: SaidBy;
  /** Тождество мужа или жены: «И жена его Иудия» (1Пар 4:18) — чья жена, текст прямо не говорит (Д-5). */
  identity?: EndIdentity;
  /** Окончание союза: «отдал… Мелхолу… Фалтию» (1Цар 25:44). */
  ended?: { refs: Ref[]; note?: string };
  /**
   * «Без брака» у вида `non-marital` — свой уровень и свои стихи (03 ред. 5, § 3.2; Д3-12): союз сказан
   * («и вошел к ней», Быт 38:18) — уровень обозначения; что это не брак, — вывод по другим стихам (Быт 38:15–16, 26).
   */
  notMarriage?: { cert: Cert; refs: Ref[]; note?: string };
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
 * поколений, по другому родословию (Лк 3), иное прочтение (1Пар 3:19); `parents-word` — особое слово текста без
 * кровного смысла: Иосиф и Иисус Христос — «родители Его» (Лк 2:41), отца по плоти нет (Мф 1:20; шаг C47).
 */
export type OriginKind = 'natural' | 'legal' | 'adoptive' | 'ancestor' | 'by-luke' | 'alternative' | 'levirate' | 'parents-word' | 'text-word';

/**
 * Происхождение — ребро к каждому названному родителю (02, § 3.2, уточнено по рецензии Д1). Союз родителей — запись
 * Union той же пары; «не от союза» записывается явно (Иисус Христос: NoData `scripture-says` «отец по плоти», 02 § 3.5).
 * Родитель не назван («сыновья Саруии», 1Пар 2:16) — `parent` нет, есть `unnamedParent` со словами текста.
 */
export interface Origin {
  /** Номер ребра: `o-<родитель>--<ребёнок>` (03 § 21.1), без названного родителя — `o-<число>`; хранится в base/ids.json (К-1). */
  id?: string;
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
  /**
   * Степень у вида `ancestor` (02 § 3.4; К-13): `inferred` — степень следует из двух стихов и больше (Лаван — внук Нахора,
   * Быт 29:5 при 28:5 и 24:24), уровень «выв.»; `unstated` — текст говорит о происхождении, но степени не называет
   * («из дома Ашбеи», 1Пар 4:21). У других видов поля нет.
   */
  degree?: 'inferred' | 'unstated';
  /**
   * Кандидаты в родители (02 § 3.3.4; К-13): «Сыновья его: Улам и Рекем» (1Пар 7:16) — «его» может относиться к Махиру,
   * Керешу или Шерешу. Родитель не выбран: поля `parent` нет. Такое ребро не рисуется, не входит в путь родства и
   * счётчики; сборка выносит его отдельным списком (К-6).
   */
  candidates?: string[];
  /** Пропуск поколений между ребёнком и родителем (Мф 1; Руф 4:18–22). */
  gap?: boolean;
  /**
   * Возможный пропуск, на который указывает другое место: через кого и по каким стихам (Каинан: Лк 3:36 при Быт 11:12).
   * Расчёт родства, идущий через `via`, считает это ребро предком, а не отцом: Каинан не выходит братом Салы.
   */
  gapPossible?: { refs: Ref[]; via: string[] };
  /** Пропуск поколений предполагается, но ни одно место его не называет: толкование (рецензия 03, № 1). Схема его не рисует. */
  gapSuspected?: string;
  /**
   * Пропущенные поколения, которых называет другое место (02 § 3.4, «Пропуск поколений»): «Иорам родил Озию» (Мф 1:8) —
   * Охозия, Иоас, Амасия по 4Цар 8:24 – 14:1 и 1Пар 3:11–12. Лица — по порядку от родителя к ребёнку; стихи — где они названы.
   */
  skipped?: { actors: string[]; refs: Ref[] };
  /**
   * «Сын», названный вне перечней сыновей (03 § 3.3): Боган — «камня Богана, сына Рувимова» (Нав 15:6), а в перечнях сыновей
   * Рувима его нет. Стихи — перечни, где его нет; схема ставит такое лицо отсылом, а не ребёнком в общей строке.
   */
  outsideLists?: { refs: Ref[] };
  /**
   * Слова текста для ребра, если связь названа не словом «родил» (Иосиф: «муж Марии», «как думали»). У вида `text-word` —
   * у каждого слова свой стих и свой говорящий (02 § 3.4: Валтасар — Дан 5:2, 11, 13, 18, 22).
   */
  words?: { text: string; ref: Ref; saidBy?: SaidBy }[];
  /** Родство названо словами лица (02 § 3.6): Сарра — дочь Фарры по словам Авраама (Быт 20:11–12). */
  saidBy?: SaidBy;
  /**
   * Тождество конца ребра (рецензия библеиста на 03 ред. 4, Р4-8; шаг C45): родство сказано словами вне скобок, а какое
   * это лицо — родитель («Сии сыновья Дишона» — какой Дишон) или ребёнок (Ефан, сын Кишия, — он ли Идифун), — текст
   * прямо не говорит. Уровень ребра — по словам о родстве; тождество — отдельно: «весомо» или «предположительно».
   */
  identity?: { of: 'parent' | 'child'; degree: 'weighty' | 'possible'; note: string; refs: Ref[] };
  /** Набор взаимоисключающих прочтений и прочтения, при которых ребро действует. */
  reading?: { set: string; in: string[] };
  /** Стихи общие с ребром другого родителя (прежнее parentRefs); снимается, когда стихи разделены. */
  refsShared?: true;
  note?: string;
  /** Порядок среди детей (прежнее поле order) — порядок перечисления, не порядок рождения, если текст не говорит. */
  order?: number;
  prov?: Partial<Prov>;
}

/**
 * Пометка «по словам …» (02 § 3.6): родство сказано не повествователем, а лицом в тексте. `actor` — кто говорит;
 * `ref` — стих, где он назван говорящим (Быт 20:11 «Авраам сказал»); `label` — пометка, как её показывать.
 */
export interface SaidBy {
  actor: string;
  ref: Ref;
  label: string;
  /**
   * Начало речи (02 § 3.4; К-7): стих, где говорящий назван перед речью, к которой относится `ref` (Дан 5:10 — царица,
   * её слова — Дан 5:11). Нет поля — говорящий назван в самом стихе или не дальше двух стихов выше.
   */
  speechStart?: Ref;
}

/** Родство словами Писания, без выведения родителей (П-8). Слово должно быть в стихе. */
export interface KinTerm {
  /** Номер `k-<число>` из base/ids.json (02 § 3.3.1; К-1). */
  id?: string;
  from: string;
  to: string;
  rel: string;
  refs: Ref[];
  cert?: Cert;
  /** Слово сказано лицом в тексте: «сестра» — слова Авраама (Быт 20:12). */
  saidBy?: SaidBy;
  /** Тождество конца: слово родства сказано, а то ли это лицо — текст прямо не говорит (Д-5). */
  identity?: EndIdentity;
  prov?: Partial<Prov>;
}

/**
 * Ссылка на труд (02 § 5.2; Р-2; К-3): `work` — номер труда `w-…` в реестре base/sources.json; издание, год и традиция
 * хранятся только в записи труда. `page` — страница или место (стих, том, глава); `locus` — о каком месте Писания речь;
 * `weight` — `checked` (✔ прочитано), `approx` (≈ по выдержке) или `excluded` (✱ — в выпуск не идёт; R9 Г-2);
 * `checkedBy` — кто сверил ссылку: агент или человек. Поле называется `work`, а не `source`: допуск его не читает как
 * источник материала, и закрытый труд запись не закрывает.
 */
export interface Cite {
  work: string;
  volume?: string;
  page: string;
  locus?: string;
  weight: 'checked' | 'approx' | 'excluded';
  checkedBy: 'agent' | 'human';
}

/** Набор взаимоисключающих прочтений (02, § 3.4): схемы и расчёт никогда не складывают два прочтения одного набора. */
export interface ReadingSet {
  id: string;
  title: string;
  refs: Ref[];
  /**
   * У толкования (`interpretation`) — ссылки на труды `works` (02 § 3.4, § 5.2; R9 Г-4; К-3). Поле `works` в отпечаток
   * набора не входит: оно подписывается отдельно (ключ `reading:<номер>#works`, 02 § 3.3.3 п. 6), и пока подписи нет,
   * сборка ссылок на труды не выводит. Прежнее поле `authors` (строки) — ошибка проверки.
   */
  readings: {
    id: string; label: string; cert: Cert; refs: Ref[]; works?: Cite[];
    /** @deprecated Прежний вид: строки авторов пишут только шаги до K3; в готовой базе это ошибка проверки (К-3). */
    authors?: string[];
  }[];
  /** Прочтение по умолчанию — по букве текста. */
  default: string;
  note: string;
  prov?: Partial<Prov>;
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

/**
 * Вид «нет сведений» (02 § 3.2; 07 § 8.2). `scripture-says` — текст сам говорит об отсутствии или неприменимости; запись
 * хранит слова стиха и не выбирает между буквальным и иным пониманием (Евр 7:3; Мф 1:20). Она заменяет прежние
 * `stated-absent` и `not-applicable` (шаг C31); в готовой базе их быть не должно — проверка базы считает их ошибкой.
 */
export type NoDataKind = 'silent' | 'scripture-says' | 'genealogy-not-found' | 'not-researched' | 'stated-absent' | 'not-applicable';

export interface NoData {
  actor: string;
  /** Номер раздела прежней карточки. */
  sec: number;
  kind: NoDataKind;
  /** О чём именно: «отец по плоти» (Иисус Христос, Мф 1:20). */
  what?: string;
  refs: Ref[];
  /** Слова стиха дословно — у `scripture-says` обязательно (07 § 8.1: «Писание говорит: „…“»). */
  words?: { text: string; ref: Ref }[];
  /**
   * У `silent` — стихи, на которых держится вывод «Писание молчит» (02 § 3.2: «проверено, какие стихи прочитаны»): стихи,
   * где лицо названо (имя или описательное слово вне скобок). По ним сверщик проверяет, что о разделе текст молчит.
   * Собраны шагом C38 из стихов записей лица — это основание для проверки, а не свидетельство, что их кто-то прочёл.
   */
  read?: Ref[];
  /** У `silent`, если список стихов не восстановлен: «нужно чтение» — вывод ещё не на чем проверить. */
  needsReading?: true;
  prov?: Partial<Prov>;
}

// ---------- переадресация, исправления, источники ----------

export interface Redirect {
  from: string;
  to: string[];
  reason: string;
  refs: Ref[];
  at: string;
  /** Номер выпуска, с которого действует (02 § 3.3.1; К-12 — пока не выдаётся). */
  release?: string;
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

/**
 * Традиция автора труда — закрытый словарь с отнесением к группам Г-1 (02 § 5.1 [4.2]; R9 Г-1; К-17): `orthodox` →
 * православная; `catholic` → католическая; `lutheran`, `reformed`, `anglican`, `evangelical` → протестантская;
 * `historical-critical` → историко-критическая; `jewish` — вне четырёх групп (только для передатчиков предания).
 */
export type Tradition = 'orthodox' | 'catholic' | 'lutheran' | 'reformed' | 'anglican' | 'evangelical' | 'historical-critical' | 'jewish';

/**
 * Источник в реестре base/sources.json (02 § 5; 09 § 5.5; этап Д3-3, Д3-5). Права — машинно: `spdx`, `attributionRequired`,
 * `shareAlike`, `redistribute`; по ним собирается NOTICE и решается, может ли запись источника попасть в сборку.
 */
export interface Source {
  id: string;
  title: string;
  org: string;
  author?: string;
  /** Версия файла, по которому работали (коммит, выпуск). Входит в отпечаток проверки записей этого источника. */
  version: string;
  date: string;
  /** Лицензия конкретного файла — словами, как прочитана. */
  license: string;
  /**
   * Лицензия идентификатором SPDX (выражение: «CC-BY-4.0», «ODbL-1.0», «LicenseRef-PublicDomain AND MIT»). Свои имена —
   * через «LicenseRef-…»; лицензия не подтверждена — «NOASSERTION» (тогда `redistribute: false`).
   */
  spdx: string;
  /** Где лицензия прочитана (ссылка) и когда. */
  licenseSource: string;
  /** Лицензия требует надписи: `attribution` обязательна и идёт в NOTICE. */
  attributionRequired: boolean;
  attribution?: string;
  /** Копилефт: производное — под той же лицензией (ODbL, CC BY-SA, LGPL). */
  shareAlike: boolean;
  /**
   * Может ли материал источника попасть в сборку приложения: лицензия разрешает И источник предназначен для приложения.
   * `false` — запись с этим источником в сборку не попадает (только сверка, просьба не распространять, права не подтверждены).
   */
  redistribute: boolean;
  /**
   * basis — основа данных; reference — справочный слой; check-only — только сверка, в приложение не входит; component —
   * часть приложения (шрифт); citation — труд `w-…`, который только называется: на него ссылаются `works` (02 § 5.1).
   */
  use: 'basis' | 'reference' | 'check-only' | 'component' | 'citation';
  /** Издание труда (02 § 5.1 [4.1]): без них опора и схема в выпуск не идут; по ним — выгрузка CSL-JSON и BibTeX. */
  edition?: string;
  year?: string;
  volume?: string;
  publisher?: string;
  isbn?: string;
  doi?: string;
  url?: string;
  /** Традиция автора — закрытый словарь (02 § 5.1 [4.2]); у трудов `w-…` обязательна. */
  tradition?: Tradition[];
  read: string;
  /** Источники, из которых этот выведен: независимые подтверждения — разные корни графа (Д-база, Б-3). */
  dependsOn?: string[];
  limits: string;
  notProves: string;
}

// ---------- места (02 § 3.13; 05; К-11, К-14) ----------

/** Вид места (02 § 3.13.1): по способу показа — точка, вода, земля. */
export type PlaceKind =
  | 'settlement' | 'campsite' | 'mountain' | 'hill' | 'spring' | 'well' | 'pool' | 'cave' | 'tree' | 'stone' | 'altar' | 'structure' | 'gate' | 'ford' | 'island'
  | 'river' | 'stream' | 'sea' | 'lake'
  | 'land' | 'region' | 'desert' | 'valley' | 'field' | 'mountain-range' | 'road';

/** Имя места в Библии (02 § 3.13.2): синодальная форма со стихами; у каждого стиха — своё основание времени. */
export interface PlaceName {
  /** `l-…#n<число>`. */
  id: string;
  form: string;
  refs: { ref: Ref; timeBasis: 'story' | 'narrator-now' | 'former-by-verse' | 'inferred' }[];
  type: 'main' | 'former' | 'now' | 'that-is' | 'other-book' | 'in-speech';
  /** Имя места — всегда слова стиха (Р-8): другого уровня нет. */
  cert?: 'scripture';
  saidBy?: SaidBy;
}

/**
 * Положение кандидата (02 § 3.13.3). Источник координат — номер записи реестра `coordSource.source` (Р-10; К-14): по
 * нему допуск решает, идёт ли точка в выпуск, и по нему надпись попадает в NOTICE. Положение с закрытым источником
 * снимается как часть (К-15), место остаётся.
 */
export interface Position {
  /** `l-…#pos<число>`. */
  id: string;
  label: string;
  modernId?: string;
  lat: number;
  lon: number;
  score?: number;
  votes?: number;
  rejected?: true;
  coordSource: { source: string; id?: string };
  precision?: { kind: 'visible' | 'tel' | 'settlement' | 'distance' | 'water' | 'terrain' | 'path' | 'region'; radiusM?: number };
  period?: { words: string; source: string };
  /** Сводка, из которой взят кандидат. */
  source: string;
}

/** Связь мест (02 § 3.13.4). «Другое имя» по мнению сводки — не связь, а `match.otherNameOf`. */
export interface PlaceLink {
  /** `l-…#link<число>`. */
  id: string;
  kind: 'inferred-same' | 'part-of' | 'near';
  to: string;
  cert: Cert;
  refs: Ref[];
  km?: number;
  when?: string;
  note?: string;
}

export interface Place {
  /** `l-…`. */
  id: string;
  kind: PlaceKind;
  names: PlaceName[];
  otherNames?: { form: string; lang: string; period?: string; source: string }[];
  modernCyr?: { text: string; lang: string; rule: string; source: string };
  positions?: Position[];
  /** Степень отождествления — только вычисление по порогам выпуска (05 § 3.3). */
  degree?: 'certain' | 'probable' | 'possible' | 'unknown';
  links?: PlaceLink[];
  labelPoint?: { lat: number; lon: number; by: string; source: string };
  match?: { modernId: string; method: 'auto' | 'manual'; by: string; checkedBy?: string; at: string; otherNameOf?: string; source?: string };
  vision?: true;
  sources?: string[];
  prov?: Partial<Prov>;
}

// ---------- истории (02 § 3.12; 11 § 11.2; В-21, В-30) ----------

/** Уровень (11 § 2.1): повествование — ряд историй без своих стихов; часть — поле истории, не уровень (В-21). */
export type StoryLevel = 'cycle' | 'story';
/** Вид истории (11 § 2.3). */
export type StoryKind =
  | 'event' | 'speech' | 'parable' | 'jesus-story' | 'told-story'
  | 'vision' | 'dream' | 'sign-act' | 'song' | 'prayer' | 'genealogy' | 'summary' | 'notice';

/** Рассказ повествователя в одной книге (11 § 4.5, вид 1). */
export interface Account {
  /** Отрезки стихов одной книги: ['1Цар 28:1-2', '1Цар 29:1-11']. */
  refs: Ref[];
  /** Уровень «это та же история»: у основного рассказа — «Писание». */
  cert: Cert;
  /** Основание склейки рассказов (11 § 2.6): единственное событие; разные книги без расхождения во времени; сказано. */
  basis?: {
    kind: 'single-event' | 'other-books' | 'said';
    refs: Ref[];
    /** Для other-books — слова времени у рассказов, проверенные на расхождение (пусто, если их нет). */
    time?: Ref[];
    note?: string;
  };
}

/** Часть истории (11 § 2.2, правило 9): только у истории длиннее 20 стихов; адрес — по первому стиху. */
export interface StoryPart {
  n: number;
  title: { short: string; by: 'atlas' };
  /** По каждому рассказу, если их несколько. */
  refs: Ref[];
  /** Какой признак сцены сменился: место, состав лиц, время. У первой части — пусто. */
  change: ('place' | 'actors' | 'time')[];
}

/** Сцена синопсиса (11 § 4.11.2): `e-…#s<n>`. */
export interface Scene {
  id: string;
  title: { short: string; by: 'atlas' };
  /** Клетки: `account` — номер рассказа (с нуля), `link` — номер ссылки-пересказа в `links`. */
  refs: { account?: number; link?: number; refs: Ref[] }[];
  /** Стих, поделённый между этой сценой и соседней: стоит в обеих, копируется один раз. */
  split?: Ref[];
  /** Стихи разных рассказов на одной высоте. */
  pairs?: Ref[][];
  /** В этом рассказе сцена стоит в другом месте — «в Лк — раньше, после 9:13». */
  moved?: { account: number; after: Ref }[];
}

/**
 * Участник истории (11 § 4.3). `actor` — номер лица базы (`p-…`); `god` — Бог словами текста (строка над лицами, 11 § 4.3);
 * `new:<слово>` — лица ещё нет в базе (жена Ноя, расслабленный): строка ведёт на «Эту карточку мы ещё не составили»
 * (07 § 8.5), а лицо заводит Д4. У `god` и `new:` — `label`: слова стиха, по которым лицо названо.
 */
export interface StoryActor {
  actor: string;
  label?: string;
  /** Вид лица для `new:` (для строки: «группа», «птица»). */
  kind?: ActorKind;
  role: 'acts' | 'speaks' | 'addressed' | 'suffers' | 'mentioned';
  main?: boolean;
  /** В каком рассказе (номер с нуля), если не во всех. */
  account?: number;
  mode?: 'vision' | 'after-death' | 'in-speech' | 'parable';
  roleText?: { text: string; refs: Ref[] };
  refs: Ref[];
  /**
   * В стихах истории лицо названо только словом «Он», «её»: стих, где перед этим названо имя (тот же рассказ или прошлая
   * история той же книги). Проверка имени — по этому стиху.
   */
  antecedent?: Ref;
  cert: Cert;
}

/** Место истории (11 § 4.3; 05 § 5.1). Мест в базе ещё нет (05, Д5): `new:<слово>` с `label` — словами стиха. */
export interface StoryPlace {
  place: string;
  label?: string;
  role: 'where' | 'from' | 'to' | 'via' | 'mentioned';
  account?: number;
  refs: Ref[];
  cert: Cert;
}

/** Вид ссылки на историю (11 § 4.5): рассказ — это Account. */
export type LinkKind = 'retelling' | 'mention' | 'allusion' | 'possibly-same' | 'type';

/** Место Писания вне рассказов истории (11 § 4.5). */
export interface StoryLink {
  refs: Ref[];
  kind: LinkKind;
  /** Для пересказа лица: кто рассказывает; стихи принадлежат истории речи (`inStory`). */
  teller?: string;
  inStory?: string;
  /** Для possibly-same: номер другой истории. */
  story?: string;
  /** mention с несколькими целями (надписание Пс 53:2) — выбор цели «толк.». */
  targets?: string[];
  /** Для allusion — стих истории со словами пары. */
  basis?: Ref[];
  /** Слова стиха ссылки, по которым он связан с историей (имя, место, предмет, слово действия; 11 § 11.3 п. 6). */
  words?: string[];
  /** Упоминание называет действие (для значимости). */
  action?: boolean;
  /** Слова лица расходятся с повествователем — не в значимость. */
  contradicts?: boolean;
  /** Связь внутри книги: в значимость не идёт. */
  sameBook?: boolean;
  cert: Cert;
  /** Для «толк.»: труды совета источников (R9; В-30). */
  works?: Cite[];
  note?: string;
}

/** «Другая история — так сказано» (Мк 8:19–20). */
export interface StoryRelation {
  story: string;
  kind: 'different';
  refs: Ref[];
  cert: Cert;
}

/** Тема трудного (11 § 8.3 п. 2). */
export type HardTopic =
  | 'смерть на глазах' | 'убийство' | 'казнь' | 'гибель детей' | 'угроза жизни ребёнка' | 'насилие над женщиной'
  | 'блуд' | 'нагота' | 'самоубийство' | 'вызывание умершего' | 'страшные образы видения';

export interface Story {
  /** `e-…` — смысловой номер, хранится в записи (02 § 3.3.1). */
  id: string;
  level: StoryLevel;
  kind: StoryKind;
  /** Повествование. */
  partOf?: string;
  /**
   * Название атласа (11 § 2.7). `manual` — значимые слова простого названия, которых нет в стихах истории в той же основе
   * (другой корень, «ручная проверка», 11 § 11.3 п. 9).
   */
  title: { short: string; full?: string; alt?: string[]; common?: string[]; by: 'atlas'; manual?: string[] };
  summary?: { text: string; refs: Ref[] }[];
  /** ≥ 1; у повествования — пусто; у события, известного только из слов лица, — пусто, есть пересказ с `teller`. */
  accounts: Account[];
  parts?: StoryPart[];
  scenes?: Scene[];
  actors: StoryActor[];
  places: StoryPlace[];
  time?: { epoch?: string; after?: { story: string; refs: Ref[]; cert: Cert }[]; said?: { text: string; refs: Ref[] } };
  links: StoryLink[];
  relations?: StoryRelation[];
  /** Различия — только цитатами стихов не меньше двух рассказов; label — короткая подпись атласа. */
  discrepancies?: { label: string; quotes: { ref: Ref; text: string }[] }[];
  /** Вставка, рассказ внутри речи, разрыв. */
  nested?: { story: string; at: Ref; kind: 'insert' | 'told' | 'gap' }[];
  /** Завязка, развязка и правило 11 § 2.2; human — почему решал человек (протокол И0). */
  boundary?: { start: Ref; end?: Ref; rule: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; human?: string }[];
  hard?: { topic: HardTopic; refs: Ref[] }[];
  /**
   * Строка «назван ещё» в блоке «Где об этом в Библии» (11 § 4.5 п. 8): стих, где назван участник, но это не ссылка на
   * историю (В-21) — «Голиаф Гефянин назван ещё в 2 Цар 21:19 — см. различия рассказов». Поля в 11 § 11.2 нет: поправка.
   */
  seeAlso?: { text: string; refs: Ref[]; story?: string }[];
  themes?: string[];
  source: { method: 'reading'; candidates?: ('prev-§17' | 'oshb' | 'openbible' | 'tsk' | 'names' | 'action-words' | 'theographic')[] };
  prov?: Partial<Prov>;
}

/** Класс стихов «вне историй» (11 § 2.4). Ключ — `книга глава:с-по`. Стихи историй класса не получают: они в рассказах. */
export interface VerseClass {
  book: string;
  ch: number;
  from: number;
  to: number;
  class: 'law' | 'list' | 'teaching' | 'prophecy' | 'psalm' | 'wisdom' | 'intro';
  why?: string;
  /** Свод законов в разрыве этой истории (правило 8). */
  inGap?: string;
  prov?: Partial<Prov>;
}

/** Параллельные тексты вне историй (11 § 4.11.4): Ис 2 и Мих 4. Не связь и не тождество событий. */
export interface TextParallel {
  /** `tp-…`. */
  id: string;
  refs: Ref[][];
  /** Слова, которые стоят во всех отрезках вне скобок. */
  basis: { ref: Ref; text: string }[];
  cert: 'scripture';
  prov?: Partial<Prov>;
}
