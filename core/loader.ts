/**
 * Загрузчик пакетов (09 § 4.1 слой 4, § 5.4, § 6.2–6.3). Ядро без DOM: чтение файла и sha256 даёт вызывающий (в браузере —
 * `fetch` и `crypto.subtle` службы основы, в Node — файлы), поэтому ядро одинаково работает в рабочем потоке, в главном
 * потоке и в тестах.
 *
 * Правила:
 *  - опись с неизвестной схемой не читается — ядро остаётся на прежнем выпуске (09 § 6.2 п. 3);
 *  - в описи ровно одно ядро индекса и один указатель инструментов, оба обязательные; у выпуска есть номер; сжатие — из
 *    словаря (рецензия данных на ядро, № 4);
 *  - загрузчик уровня «выпуск» не принимает описи и пакеты уровня «проба» (09 § 5.2 п. 7) и синтетику (10 § 4.0.1 п. 6);
 *  - пакет сверяется по sha256 описи; несовпадение — ошибка, а не тихие чужие данные; уровень пакета равен уровню описи;
 *  - вид из многих пакетов (текст, карточки, TSK, Связи) читается только с выбором книги или тома (данные № 13);
 *  - одновременные запросы одного файла читают и сверяют его один раз; тексты книг держатся в памяти не больше
 *    `textLimit` штук, давно не открытые вытесняются (данные № 11);
 *  - переход на новый выпуск — только когда все обязательные пакеты на месте и сверены (09 § 6.2 п. 2).
 */
import {
  MANIFEST_SCHEMA, PACK_SCHEMA,
  type Admit, type BookTextPack, type CardsVolume, type CoreIndex, type GenealogyPack, type Manifest, type PackageEntry, type PackKind,
  type RelationsPack, type StemsPack, type ToolsIndex, type TskPack,
} from './types.ts';
import { failed, ready, type State } from './state.ts';

/** Чтение файла пакета и его отпечаток. */
export interface Source {
  read(file: string): Promise<string>;
  /** sha256 текста в UTF-8, шестнадцатеричной строкой. */
  sha256(text: string): Promise<string>;
}

/** Пакет по виду. */
export interface PackOf {
  'core-index': CoreIndex;
  'tools-index': ToolsIndex;
  cards: CardsVolume;
  text: BookTextPack;
  stems: StemsPack;
  genealogy: GenealogyPack;
  relations: RelationsPack;
  tsk: TskPack;
  changes: Record<string, unknown>;
}

export interface Select {
  book?: string;
  part?: number;
  volume?: string;
}

export interface LoaderOptions {
  /** Уровень приложения: «выпуск» не читает пробу. */
  level: Admit;
  /** Только для замера бюджетов. */
  allowSynthetic?: boolean;
  /** Сколько текстов книг держать в памяти (по умолчанию 12). */
  textLimit?: number;
}

/** Виды из многих пакетов: без выбора книги или тома их не прочитать. */
export const MULTI: ReadonlySet<PackKind> = new Set<PackKind>(['text', 'cards', 'tsk', 'relations']);
const COMPRESSIONS = new Set(['br', 'gzip']);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Проверка описи: схема, уровень, синтетика, обязательные пакеты, номер выпуска, состав строк. Ошибка — код и подробность. */
export function checkManifest(x: unknown, opts: LoaderOptions): { code: Parameters<typeof failed>[0]; detail: string } | null {
  const bad = (code: Parameters<typeof failed>[0], detail: string) => ({ code, detail });
  if (!isObj(x)) return bad('опись-неполна', 'опись — не объект');
  if (x.schema !== MANIFEST_SCHEMA) return bad('опись-неизвестная-схема', `схема ${String(x.schema)}, ядро читает ${MANIFEST_SCHEMA}`);
  if (x.admit !== 'release' && x.admit !== 'probe') return bad('опись-неполна', 'нет уровня допуска');
  if (opts.level === 'release' && x.admit !== 'release') return bad('опись-проба', 'опись уровня «проба»');
  if (x.synthetic && !opts.allowSynthetic) return bad('опись-синтетика', 'опись синтетики');
  if (x.admit === 'release' && (typeof x.release !== 'string' || !x.release)) return bad('опись-неполна', 'у выпуска нет номера');
  if (typeof x.compression !== 'string' || !COMPRESSIONS.has(x.compression)) return bad('опись-неполна', `неизвестное сжатие ${String(x.compression)}`);
  if (!Array.isArray(x.packages)) return bad('опись-неполна', 'нет списка пакетов');
  for (const p of x.packages) {
    if (!isObj(p) || typeof p.file !== 'string' || typeof p.sha256 !== 'string' || typeof p.kind !== 'string' || typeof p.required !== 'boolean')
      return bad('опись-неполна', 'строка пакета неполна');
  }
  const ps = x.packages as PackageEntry[];
  for (const k of ['core-index', 'tools-index'] as const) {
    const xs = ps.filter((p) => p.kind === k);
    if (xs.length !== 1) return bad('опись-неполна', `пакетов ${k}: ${xs.length}, нужен один`);
    if (!xs[0].required) return bad('опись-неполна', `${k} не обязательный (02 § 8.1 [4.2])`);
  }
  return null;
}

export class Loader {
  private man: Manifest | null = null;
  private cache = new Map<string, unknown>();
  private pending = new Map<string, Promise<State<unknown>>>();
  private texts: string[] = [];

  constructor(private src: Source, private opts: LoaderOptions) {}

  async manifest(file = 'manifest.json'): Promise<State<Manifest>> {
    let x: unknown;
    try {
      x = JSON.parse(await this.src.read(file));
    } catch (e) {
      return failed('опись-не-прочитана', (e as Error).message);
    }
    const bad = checkManifest(x, this.opts);
    if (bad) return failed(bad.code, bad.detail);
    this.man = x as Manifest;
    return ready(this.man);
  }

  /** Строка описи пакета по виду и выбору (книга, часть, том). */
  entry(kind: PackKind, sel: Select = {}): PackageEntry | undefined {
    return this.man?.packages.find(
      (p) => p.kind === kind && (sel.book === undefined || p.book === sel.book) && (sel.part === undefined || p.part === sel.part) && (sel.volume === undefined || p.volume === sel.volume),
    );
  }

  /** Пакет: из памяти или с источника, сверенный по описи. */
  async get<K extends PackKind>(kind: K, sel: Select = {}): Promise<State<PackOf[K]>> {
    if (!this.man) return failed('опись-не-прочитана', 'опись не загружена');
    if (MULTI.has(kind) && sel.book === undefined && sel.volume === undefined) return failed('нужен-выбор', `для ${kind} нужна книга или том`);
    const e = this.entry(kind, sel);
    if (!e) return failed('нет-пакета', `${kind}${sel.book ? ` ${sel.book}` : ''}${sel.part ? ` ч. ${sel.part}` : ''}${sel.volume ? ` ${sel.volume}` : ''}`);
    const hit = this.cache.get(e.file);
    if (hit) {
      if (kind === 'text') this.touch(e.file);
      return ready(hit as PackOf[K]);
    }
    let p = this.pending.get(e.file);
    if (!p) {
      p = this.readPack(e, kind);
      this.pending.set(e.file, p);
      void p.finally(() => this.pending.delete(e.file));
    }
    return (await p) as State<PackOf[K]>;
  }

  private async readPack(e: PackageEntry, kind: PackKind): Promise<State<unknown>> {
    const man = this.man as Manifest;
    let text: string;
    try {
      text = await this.src.read(e.file);
    } catch (err) {
      return failed('пакет-не-прочитан', `${e.file}: ${(err as Error).message}`);
    }
    if ((await this.src.sha256(text)) !== e.sha256) return failed('пакет-sha256', e.file);
    let x: unknown;
    try {
      x = JSON.parse(text);
    } catch {
      return failed('пакет-не-json', e.file);
    }
    if (!isObj(x) || x.schema !== PACK_SCHEMA) return failed('пакет-схема', e.file);
    if (x.admit !== man.admit) return failed('пакет-уровень', `${e.file}: уровень «${String(x.admit)}» не равен уровню описи «${man.admit}»`);
    if (x.admit === 'probe' && this.opts.level === 'release') return failed('пакет-уровень', `${e.file}: проба`);
    if (x.synthetic && !this.opts.allowSynthetic) return failed('пакет-синтетика', e.file);
    this.cache.set(e.file, x);
    if (kind === 'text') this.touch(e.file);
    return ready(x);
  }

  /** Учёт текстов книг: давно не открытые сверх предела вытесняются из памяти. */
  private touch(file: string): void {
    this.texts = [...this.texts.filter((f) => f !== file), file];
    const limit = this.opts.textLimit ?? 12;
    while (this.texts.length > limit) {
      const old = this.texts.shift();
      if (old) this.cache.delete(old);
    }
  }

  /** Сколько текстов книг сейчас в памяти. */
  get textsInMemory(): number {
    return this.texts.length;
  }

  /** Обязательные пакеты описи (кладутся при установке). */
  required(): PackageEntry[] {
    return this.man?.packages.filter((p) => p.required) ?? [];
  }
}

/**
 * Готовность без сети (09 § 6.3): сколько пакетов описи лежит в кэше и сверено. `cached` — sha256 файлов в кэше по имени.
 */
export function readiness(man: Manifest, cached: Map<string, string>): { have: number; of: number; requiredOk: boolean; missing: string[] } {
  const ok = (p: PackageEntry) => cached.get(p.file) === p.sha256;
  const req = man.packages.filter((p) => p.required);
  const missing = man.packages.filter((p) => !ok(p)).map((p) => p.file);
  return { have: man.packages.length - missing.length, of: man.packages.length, requiredOk: req.length > 0 && req.every(ok), missing };
}

/**
 * Можно ли перейти на новый выпуск (09 § 6.2 п. 2–3): опись проходит проверку (схема, оба обязательных пакета) и все
 * обязательные пакеты сверены. Опись без обязательных пакетов — переход запрещён.
 */
export function canSwitch(next: unknown, cached: Map<string, string>, opts: LoaderOptions): boolean {
  if (checkManifest(next, opts)) return false;
  return readiness(next as Manifest, cached).requiredOk;
}
