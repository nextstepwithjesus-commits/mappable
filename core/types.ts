/**
 * Типы пакетов данных (09 § 5.3–5.4; 02 § 8.1): договор между сборкой `tools/pack/` и ядром. Ядро без DOM.
 *
 * Номера в пакетах сокращены по таблице префиксов (02 § 3.3.1): лицо — без `p-`, область — без `g-`; полный номер
 * собирает ядро (`queries.ts`). Каждый пакет несёт уровень допуска; у пробы — плашку, которую нельзя убрать (09 § 5.2 п. 7).
 */

/** Версия схемы описи. Ядро отказывается читать опись с другой схемой (09 § 5.4, § 6.2 п. 3). */
export const MANIFEST_SCHEMA = 3;
/** Версия схемы пакетов. */
export const PACK_SCHEMA = 1;

export type Admit = 'release' | 'probe';
export const PROBE_BANNER = 'Данные не проверены: проба';
/** Пометка синтетики: такие пакеты — только для замера бюджетов, в выпуск не идут (10 § 4.0.1 п. 6). */
export const SYNTH_BANNER = 'Синтетика: только для замера бюджетов, не данные Писания';

/** Отметка уровня в каждом пакете. */
export interface Stamp {
  schema: typeof PACK_SCHEMA;
  admit: Admit;
  banner?: string;
  /** Есть только у синтетики. */
  synthetic?: true;
}

/** Виды пакетов (09 § 5.3). */
export type PackKind = 'core-index' | 'tools-index' | 'cards' | 'text' | 'stems' | 'genealogy' | 'relations' | 'tsk' | 'changes';

/** Сжатие, которым считается бюджет: то, что отдаёт хранилище (09 § 5.3: вероятно brotli; gzip — верхняя граница). */
export type Compression = 'br' | 'gzip';

/** Строка описи о пакете (09 § 5.4). */
export interface PackageEntry {
  kind: PackKind;
  /** Имя файла с отпечатком содержимого: `core-index.3f9a1c2b.json`. */
  file: string;
  sha256: string;
  /** Байт без сжатия. */
  raw: number;
  /** Байт тем сжатием, которым считается бюджет (`Manifest.compression`). */
  size: number;
  /** Байт в gzip (верхняя граница). */
  gzip: number;
  /** Бюджет в байтах тем же сжатием. */
  budget: number;
  /** Обязательный — кладётся при установке, переход на выпуск ждёт его (09 § 6.2); иначе — по требованию. */
  required: boolean;
  /** Для пакетов по книгам: код книги («Быт»). */
  book?: string;
  /** Для пакетов из частей: номер части с 1 (Пс в TSK — две части). */
  part?: number;
  /** Для карточек: том. */
  volume?: string;
}

/** Опись выпуска (09 § 5.4). */
export interface Manifest {
  schema: typeof MANIFEST_SCHEMA;
  /** Номер выпуска `2026.10.2` — общий для кода, страниц и данных; у сборки без номера — null. */
  release: string | null;
  admit: Admit;
  banner?: string;
  synthetic?: true;
  compression: Compression;
  /** Отпечатки: содержимое base/ и целые файлы текста, таблиц, реестра, журнала подписей. */
  inputs: { base: string; files: Record<string, string | null> };
  /** Числа по статусам записей (честность пробы). */
  statuses: { checked: number; draft: number; quarantine: number; stale: number; rights: number; admitted: number };
  packages: PackageEntry[];
  /** Версии моделей хронологии и набора мест (02 § 8); пока моделей нет — null. */
  models: { chronology: string | null; places: string | null };
  /** Источники выпуска: SPDX, надпись, версия (09 § 5.5). */
  sources: { id: string; spdx: string; version: string; attribution?: string }[];
  /** Разница с прошлым выпуском (02 § 8.2): файл журнала изменений или null. */
  changes: string | null;
}

// ---------- ядро индекса (В-30): каталог историй, поиск ----------

/** Лицо в поиске: имя, другие имена, уточнение, значимость, вид. */
export interface PersonName {
  id: string;
  n: string;
  o?: string[];
  /** Номера в `o` форм «выв.» (вид (б), 02 § 3.3.5; К-19): совпадение с ними стоит в выдаче ниже совпадения с формой «Писание». */
  oi?: number[];
  /** «Возможно, тот же человек» (вид (в), 02 § 3.3.6): поиск по имени находит и эти карточки. */
  ps?: string[];
  d?: string;
  /** Значимость 1–5. */
  p: number;
  k: string;
  /** Число стихов записей лица — порядок тёзок равной значимости (рецензия интерфейса, № 3). */
  c?: number;
}

/** Имя места в поиске: точка и степень — в указателе инструментов (09 § 3.5 п. 3). */
export interface PlaceName {
  id: string;
  n: string;
  o?: string[];
}

/** Строка каталога историй (11): номер, название, главный отрывок, части, роли. */
export interface StoryRow {
  id: string;
  t: string;
  /** Главный отрывок: «Быт 6:9–9:17». */
  main: string;
  /** Смысловой номер в каталоге: «1.4.2». */
  no?: string;
  /** Части истории: название и отрывок. */
  parts?: { t: string; r: string }[];
  roles?: Record<string, string[]>;
  /** Привычные названия не из текста — только для поиска (11 § 3.6 (д)). */
  common?: string[];
}

export interface CoreIndex extends Stamp {
  persons: PersonName[];
  places: PlaceName[];
  /** Имена областей (колено, род, народ) — для поиска с первого экрана (09 § 3.5 п. 3). */
  areas: { id: string; n: string }[];
  stories: StoryRow[];
  /** Словарь форм имён: формы, которые есть в тексте, и номера лиц (09 § 3.5 п. 1). */
  names: { forms: string[]; ids: string[] }[];
  /** Группы исключений основ (09 § 3.5 п. 2). */
  exceptions: string[][];
  /** Словарь входа (09 § 5.3): пока пуст — состав задаёт 08 § 4.5 и 11. */
  glossary: { term: string; text: string }[];
}

// ---------- указатель инструментов (В-30) ----------

/** Лицо без имени (вид, пол, уточнение). */
export interface ActorRow {
  id: string;
  k: string;
  sk?: string;
  s?: string;
  d?: string;
  r?: string[];
  p?: number;
  c?: number;
  /** Том карточек, где лежит лицо (часть тома, если том делится): `08-levi`, `08-levi.2`. */
  v: string;
}

/** «По словам …» (02 § 3.6): кто сказал, стих, подпись. */
export interface SaidBy { a?: string; r: string; l: string }
/** Тождество конца ребра или родства «весомо» / «предположительно» (Р4-8): чей конец, степень, пояснение, стихи. */
export interface Identity { o: string; d: string; n?: string; r?: string[] }

/**
 * Ребро происхождения (поля — как `tools/base/bundle.ts`): ребёнок `c`, родитель `p` или слова о безымянном `u`, роль f/m, вид `k`;
 * `dg` степень, `pr` основное, `g` пропуск поколений, `gv` возможный пропуск через лиц, `rs`/`ri` набор и прочтение, `ce` уровень,
 * `or` порядок, `sk` пропущенные лица, `ol` вне списков, `sb` «по словам», `idt` тождество конца (рецензия данных, № 9).
 */
export interface OriginRow {
  c: string; p?: string; u?: string; r: 'f' | 'm'; k: string;
  dg?: string; pr?: 1; g?: 1; gv?: string[]; rs?: string; ri?: string; ce?: string; or?: number; sk?: string[]; ol?: 1; sb?: SaidBy; idt?: Identity;
}
export const ORIGIN_KEYS = ['c', 'p', 'u', 'r', 'k', 'dg', 'pr', 'g', 'gv', 'rs', 'ri', 'ce', 'or', 'sk', 'ol', 'sb', 'idt'] as const;

/** Кандидаты в родители (02 § 3.3.4): ребёнок, роль, уровень, стихи `rf`, кандидаты `k`, известный конец `p`, тождество. */
export interface CandRow { c: string; r: 'f' | 'm'; ce?: string; rf: string[]; k?: string[]; p?: string; idt?: Identity }
export const CAND_KEYS = ['c', 'r', 'ce', 'rf', 'k', 'p', 'idt'] as const;

export interface UnionRow {
  h?: string;
  w?: string;
  k: string[];
}

/** Родство словами: от, к, слово родства, уровень, «по словам», тождество. */
export interface KinRow { f: string; t: string; r: string; ce?: string; sb?: SaidBy; idt?: Identity }
export const KIN_KEYS = ['f', 't', 'r', 'ce', 'sb', 'idt'] as const;

/** Ссылка на труд: труд, том, страница, место, знак ✔ / ≈, кто сверил. */
export interface CiteRow { w: string; v?: string; p: string | number; l?: string; g: '✔' | '≈'; cb?: string }
export const CITE_KEYS = ['w', 'v', 'p', 'l', 'g', 'cb'] as const;
/** Набор прочтений: номер, название, прочтение по умолчанию, прочтения со ссылками на труды. */
export interface ReadingRow { id: string; t: string; d: string; r: { id: string; l: string; ce?: string; w?: CiteRow[] }[] }
export const READING_KEYS = ['id', 't', 'd', 'r'] as const;
export const READING_ITEM_KEYS = ['id', 'l', 'ce', 'w'] as const;
/** Труд реестра: номер, название, автор, год, издание, издательство, традиции. */
export interface WorkRow { id: string; t?: string; a?: string; y?: number | string; e?: string; pb?: string; tr: string[] }
export const WORK_KEYS = ['id', 't', 'a', 'y', 'e', 'pb', 'tr'] as const;

/** Строка переадресации: лица — короткими номерами; если есть не лицо — третий элемент 0 и номера полные. */
export type RedirectRow = [string, string[]] | [string, string[], 0];

/** Точка места: номер, долгота, широта, степень уверенности. */
export interface PlacePoint {
  id: string;
  lon: number;
  lat: number;
  /** Степень отождествления (05): «точно», «вероятно», «предположительно», «не установлено». */
  deg: string;
}

export interface ToolsIndex extends Stamp {
  actors: ActorRow[];
  origins: OriginRow[];
  cand: CandRow[];
  unions: UnionRow[];
  kin: KinRow[];
  readings: ReadingRow[];
  works: WorkRow[];
  areas: { id: string; n: string; k: string; f?: string; pa?: string }[];
  lines: Record<string, { n: string; st?: string; rd?: Record<string, string>; ids: string[] }>;
  redirects: RedirectRow[];
  places: PlacePoint[];
}

// ---------- карточки, текст, основы, Генеалогия, TSK ----------

export interface CardFact {
  /** Порядковый номер утверждения: полный номер `a-<n>` собирает ядро (02 § 8.1, Р-11). */
  n: number;
  s: number;
  f: string;
  v: unknown;
  c?: string;
  /** Тождество по форме «выв.» (02 § 3.3.5; К-18): номер формы и стихи. */
  ic?: { form: string; refs: string[] };
}

/** Форма имени «выв.» в пакете карточки (02 § 3.3.6; К-19): строка «здесь назван», второй слой, выгрузка «Тождества лиц». */
export interface CardNameForm {
  id?: string;
  n: string;
  c: 'inference';
  cmp?: { form: { refs: string[] }; main: { refs: string[] }; count?: { ref: string } };
  w?: { codes: string[]; note?: string };
  tn?: string;
}

/** «Нет сведений» (02 § 3.2): раздел, вид, о чём, стихи, слова стиха. */
export interface NoDataRow {
  s: number;
  k: 'silent' | 'scripture-says' | string;
  w?: string;
  r?: string[];
  q?: { text: string; ref: string }[];
}

export interface CardsVolume extends Stamp {
  volume: string;
  cards: Record<string, { f: CardFact[]; nd?: NoDataRow[]; nm?: CardNameForm[] }>;
}

/** Вид отрезка в скобках (02 § 3.8; `tools/bible/brackets.tsv`): пояснение, повреждение — текст; прочие — нет. */
export type BracketKind = 'gloss' | 'damage' | 'lxx' | 'slav' | 'added' | 'unknown';
export const BRACKET_KINDS: BracketKind[] = ['gloss', 'damage', 'lxx', 'slav', 'added', 'unknown'];

/** Текст книги (09 § 5.3): все стихи; пустой стих — "", стиха нет в синодальном тексте — null. */
export interface BookTextPack extends Stamp {
  book: string;
  /** ch[c - 1][v - 1] — текст стиха как в synodal.tsv (со знаками скобок). */
  ch: (string | null)[][];
  /**
   * Отрезки скобок: [глава, стих, начало, конец, номер вида в BRACKET_KINDS, текст ли (1/0)]. Позиции — в тексте стиха,
   * вместе со знаками скобок. Отрезок на несколько стихов — строкой на каждый стих.
   */
  br: [number, number, number, number, number, 0 | 1][];
  /** Пометки дефектов электронного текста (Б-4): [глава, стих, вид]. */
  iss: [number, number, string][];
}

export interface StemsPack extends Stamp {
  /** «форма<TAB>длина основы» построчно (09 § 3.5 п. 2). */
  table: string;
  exceptions: string[][];
}

export interface GenealogyPack extends Stamp {
  /** Членства: [лицо, область (без `g-`) или лицо-группа полным номером, роль?]. */
  members: (string | undefined)[][];
}

/** Связи (06 § 9: тома по книгам, «рёбра по видам, при входе»): в базе связей ещё нет — пакет есть только у синтетики. */
export interface RelationsPack extends Stamp {
  book: string;
  part: number;
  /** Связь: номер (без `c-`), лица (короткие номера), вид, роль, стихи, уровень. */
  rows: { id: string; a: string; b: string; k: string; ro?: string; r: string[]; ce?: string }[];
}

/**
 * Параллельные места (TSK) по книгам (02 § 8.1, Р-11): строка — [глава, стих, группа, ...цели]; цели — порядковые номера
 * стихов в синодальном тексте (с 0), диапазон — [от, до]. Английских слов нет.
 */
export interface TskPack extends Stamp {
  book: string;
  part: number;
  rows: (number | [number, number])[][];
}
