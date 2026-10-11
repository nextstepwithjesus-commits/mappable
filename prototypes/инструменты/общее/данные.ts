/**
 * Данные прототипа: пакеты пробы через загрузчик ядра (`core/loader.ts`: опись, sha256, уровень «проба») и добавочный пакет
 * `data/proto.json` (истории, эпохи, хронология). Источник — `fetch` и `crypto.subtle` (09 § 4.1: файл и отпечаток даёт
 * вызывающий). Тексты книг грузятся по требованию; экран перерисовывается сигналом `загружено`.
 */
import { signal } from '@preact/signals';
import { Loader, type Source } from '../../../core/loader.ts';
import { parseRef, BOOK_BY_CODE } from '../../../core/books.ts';
import { verseOf, showText, type VerseView } from '../../../core/verses.ts';
import type { BookTextPack, CardsVolume, CoreIndex, Manifest, ToolsIndex } from '../../../core/types.ts';
import type { ProtoPack, Story, Epoch, Chrono } from './типы.ts';

const BASE = import.meta.env.BASE_URL;
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const source: Source = {
  read: async (file) => {
    const r = await fetch(`${BASE}data/pack/${file}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.text();
  },
  sha256: async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
};
const loader = new Loader(source, { level: 'probe' });

export interface Data {
  man: Manifest;
  core: CoreIndex;
  tools: ToolsIndex;
  proto: ProtoPack;
  stories: Map<string, Story>;
  epochs: Epoch[];
  chrono: Map<string, Chrono>;
  names: Map<string, string>;
}
export let Д: Data;
/** Счётчик загрузок: экран читает его, чтобы перерисоваться, когда пришёл текст книги или том карточек. */
export const загружено = signal(0);
export const ошибка = signal<string | null>(null);

export async function начать(): Promise<void> {
  const m = await loader.manifest();
  if (m.s !== 'готово') throw new Error(`опись: ${m.s === 'ошибка' ? m.code : m.s}`);
  const [c, t, p] = await Promise.all([loader.get('core-index'), loader.get('tools-index'), fetch(`${BASE}data/proto.json`).then((r) => r.json() as Promise<ProtoPack>)]);
  if (c.s !== 'готово' || t.s !== 'готово') throw new Error('ядро индекса или указатель не прочитаны');
  if (p.admit !== 'probe' || p.schema !== 1) throw new Error('пакет прототипа: неизвестный уровень или схема');
  Д = {
    man: m.data,
    core: c.data,
    tools: t.data,
    proto: p,
    stories: new Map(p.stories.map((s) => [s.id, s])),
    epochs: p.epochs,
    chrono: new Map(p.chrono.map((x) => [x.actor, x])),
    names: new Map(c.data.persons.map((x) => [`p-${x.id}`, x.n])),
  };
}

/** Статус ключа допуска: «checked» — подписано вторым ключом; иначе черновик. */
export const статус = (key: string) => Д.proto.keys[key] ?? 'нет';
export const имя = (id: string) => Д.names.get(id) ?? id;
export const естьЛицо = (id: string) => Д.names.has(id);

// ---------- тексты книг ----------
const книги = new Map<string, BookTextPack>();
const ждём = new Map<string, Promise<void>>();
export function загрузитьКнигу(code: string): Promise<void> {
  if (книги.has(code)) return Promise.resolve();
  let p = ждём.get(code);
  if (!p) {
    p = loader.get('text', { book: code }).then((s) => {
      if (s.s === 'готово') книги.set(code, s.data);
      else ошибка.value = `Не получилось открыть текст книги ${BOOK_BY_CODE.get(code)?.name ?? code}`;
      загружено.value++;
    });
    ждём.set(code, p);
  }
  return p;
}
export const книгаЕсть = (code: string) => книги.has(code);
export function глав(code: string): number {
  void загружено.value;
  return книги.get(code)?.ch.length ?? 0;
}
export function стихов(code: string, c: number): number {
  return книги.get(code)?.ch[c - 1]?.length ?? 0;
}

export interface Стих { book: string; c: number; v: number; id: string; view: VerseView }
export function стих(book: string, c: number, v: number): Стих | undefined {
  void загружено.value; // подписка вызывающего компонента: signals пропускают перерисовку без своих сигналов
  const pack = книги.get(book);
  if (!pack) {
    void загрузитьКнигу(book);
    return undefined;
  }
  const view = verseOf(pack, c, v);
  return view && !view.missing ? { book, c, v, id: `${book} ${c}:${v}`, view } : undefined;
}

/** Стихи ссылки данных («Быт 6:9-9:17», «Мк 2:1-12»); книга грузится по требованию — пока её нет, пусто. */
export function стихи(ref: string): Стих[] {
  void загружено.value;
  const book = /^\s*([1-4]?[А-Яа-яЁё]+)/.exec(ref)?.[1] ?? '';
  if (!книги.has(book)) {
    void загрузитьКнигу(book);
    return [];
  }
  const p = parseRef(ref, (b, c) => стихов(b, c));
  if (!p) return [];
  const vs = p.chapterOnly ? Array.from({ length: стихов(book, p.chapterOnly) }, (_, i) => ({ book, chapter: p.chapterOnly!, verse: i + 1 })) : p.verses;
  return vs.map((x) => стих(x.book, x.chapter, x.verse)).filter((x): x is Стих => !!x);
}
export const книгиСсылок = (refs: string[]) => [...new Set(refs.map((r) => /^\s*([1-4]?[А-Яа-яЁё]+)/.exec(r)?.[1] ?? ''))].filter(Boolean);
/** Все книги ссылок загружены? Если нет — запускает загрузку. */
export function готовы(refs: string[]): boolean {
  void загружено.value;
  let ok = true;
  for (const b of книгиСсылок(refs)) if (!книги.has(b)) {
    ok = false;
    void загрузитьКнигу(b);
  }
  return ok;
}

/** Текст стиха для показа и копии: дефис с пробелами → тире (08 § 16.2). */
export const показ = showText;

// ---------- карточки ----------
const тома = new Map<string, CardsVolume>();
export function том(volume: string): CardsVolume | undefined {
  void загружено.value;
  const v = тома.get(volume);
  if (v) return v;
  void loader.get('cards', { volume }).then((s) => {
    if (s.s === 'готово') тома.set(volume, s.data);
    else ошибка.value = 'Не получилось открыть карточку';
    загружено.value++;
  });
  return undefined;
}

// ---------- Генеалогия (шаг 2.0): пакет Генеалогии через загрузчик и добавочный пакет номеров и стихов рёбер ----------
export async function загрузитьГенеалогию(): Promise<{ gen: import('../../../core/types.ts').GenealogyPack; доп: unknown }> {
  const [g, d] = await Promise.all([loader.get('genealogy'), fetch(`${BASE}data/genealogy-proto.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))]);
  if (g.s !== 'готово') throw new Error('пакет Генеалогии не прочитан');
  if ((d as { admit?: string }).admit !== 'probe') throw new Error('добавочный пакет Генеалогии: не «проба»');
  return { gen: g.data, доп: d };
}
