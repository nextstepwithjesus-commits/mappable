/**
 * Загрузчик пакетов (09 § 4.1 слой 4, § 5.4, § 6.2–6.3). Ядро без DOM: чтение файла и sha256 даёт вызывающий (в браузере —
 * `fetch` и `crypto.subtle` службы основы, в Node — файлы), поэтому ядро одинаково работает в рабочем потоке, в главном
 * потоке и в тестах.
 *
 * Правила:
 *  - опись с неизвестной схемой не читается — ядро остаётся на прежнем выпуске (09 § 6.2 п. 3);
 *  - загрузчик уровня «выпуск» не принимает описи и пакеты уровня «проба» (09 § 5.2 п. 7) и синтетику (10 § 4.0.1 п. 6);
 *  - пакет сверяется по sha256 описи; несовпадение — ошибка, а не тихие чужие данные;
 *  - уровень пакета равен уровню описи;
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
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Проверка описи: схема, уровень, синтетика, состав строк. Ошибка — строкой. */
export function checkManifest(x: unknown, opts: LoaderOptions): string | null {
  if (!isObj(x)) return 'опись — не объект';
  if (x.schema !== MANIFEST_SCHEMA) return `неизвестная схема описи: ${String(x.schema)} (ядро читает ${MANIFEST_SCHEMA})`;
  if (x.admit !== 'release' && x.admit !== 'probe') return 'в описи нет уровня допуска';
  if (opts.level === 'release' && x.admit !== 'release') return 'опись уровня «проба» — приложение выпуска её не читает';
  if (x.synthetic && !opts.allowSynthetic) return 'опись синтетики — не для приложения';
  if (!Array.isArray(x.packages)) return 'в описи нет списка пакетов';
  for (const p of x.packages) {
    if (!isObj(p) || typeof p.file !== 'string' || typeof p.sha256 !== 'string' || typeof p.kind !== 'string' || typeof p.required !== 'boolean')
      return 'строка пакета в описи неполна';
  }
  return null;
}

export class Loader {
  private man: Manifest | null = null;
  private cache = new Map<string, unknown>();

  constructor(private src: Source, private opts: LoaderOptions) {}

  async manifest(file = 'manifest.json'): Promise<State<Manifest>> {
    let x: unknown;
    try {
      x = JSON.parse(await this.src.read(file));
    } catch (e) {
      return failed(`опись не прочитана: ${(e as Error).message}`);
    }
    const bad = checkManifest(x, this.opts);
    if (bad) return failed(bad);
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
    if (!this.man) return failed('опись не загружена');
    const e = this.entry(kind, sel);
    if (!e) return failed(`в описи нет пакета ${kind}${sel.book ? ` ${sel.book}` : ''}${sel.part ? ` ч. ${sel.part}` : ''}${sel.volume ? ` ${sel.volume}` : ''}`);
    const hit = this.cache.get(e.file);
    if (hit) return ready(hit as PackOf[K]);
    let text: string;
    try {
      text = await this.src.read(e.file);
    } catch (err) {
      return failed(`пакет ${e.file} не прочитан: ${(err as Error).message}`);
    }
    if ((await this.src.sha256(text)) !== e.sha256) return failed(`пакет ${e.file} не совпал с описью по sha256`);
    let x: unknown;
    try {
      x = JSON.parse(text);
    } catch {
      return failed(`пакет ${e.file} — не JSON`);
    }
    if (!isObj(x) || x.schema !== PACK_SCHEMA) return failed(`пакет ${e.file}: неизвестная схема`);
    if (x.admit !== this.man.admit) return failed(`пакет ${e.file}: уровень «${String(x.admit)}» не равен уровню описи «${this.man.admit}»`);
    if (x.admit === 'probe' && this.opts.level === 'release') return failed(`пакет ${e.file} уровня «проба» — приложение выпуска его не читает`);
    if (x.synthetic && !this.opts.allowSynthetic) return failed(`пакет ${e.file} — синтетика`);
    this.cache.set(e.file, x);
    return ready(x as unknown as PackOf[K]);
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
  const missing = man.packages.filter((p) => !ok(p)).map((p) => p.file);
  return { have: man.packages.length - missing.length, of: man.packages.length, requiredOk: man.packages.filter((p) => p.required).every(ok), missing };
}

/** Можно ли перейти на новый выпуск (09 § 6.2 п. 2–3): схема известна и все обязательные пакеты сверены. */
export function canSwitch(next: unknown, cached: Map<string, string>, opts: LoaderOptions): boolean {
  if (checkManifest(next, opts)) return false;
  return readiness(next as Manifest, cached).requiredOk;
}
