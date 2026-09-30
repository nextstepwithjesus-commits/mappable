/**
 * Решение 130 (TOL 011): свои сохранения читаются с проверкой схемы — испорченный JSON, JSON `null` и чужая схема дают
 * безопасное значение по умолчанию; атлас открывается, ничего не падает (src/ui/work.ts, parseStored; reveal.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

let work: typeof import('../src/ui/work.ts');
let reveal: typeof import('../src/ui/reveal.ts');

beforeAll(async () => {
  // чужие и испорченные сохранения до загрузки модулей
  store.set('toledot:work', 'null');
  store.set('toledot:reveal', '[1, 2, 3]');
  store.set('toledot:folds', 'null');
  store.set('toledot:show', '"s"');
  store.set('toledot:start', '{"x": 1}');
  store.set('toledot:skymode', '42');
  Object.assign(globalThis, {
    window: { localStorage: storage, sessionStorage: storage, addEventListener: () => {}, removeEventListener: () => {} },
    document: { documentElement: { dataset: {} } },
  });
  work = await import('../src/ui/work.ts');
  reveal = await import('../src/ui/reveal.ts');
});

describe('parseStored: JSON null, испорченный JSON и чужая схема — значение по умолчанию', () => {
  it('null, мусор, массив вместо объекта, объект вместо массива, число вместо строки', () => {
    expect(work.parseStored('null', {})).toEqual({});
    expect(work.parseStored('{oops', [])).toEqual([]);
    expect(work.parseStored('[1,2]', { a: 1 })).toEqual({ a: 1 });
    expect(work.parseStored('{"a":1}', [])).toEqual([]);
    expect(work.parseStored('42', 'mary')).toBe('mary');
    expect(work.parseStored(null, 'x')).toBe('x');
    expect(work.parseStored('{"a":1}', {})).toEqual({ a: 1 });
    expect(work.parseStored('["adam"]', [] as string[])).toEqual(['adam']);
  });
  it('модули набора, показа и раскрытия загрузились с безопасным состоянием', () => {
    expect(work.workSet.value.size).toBe(0);
    expect(work.foldDesc.value).toEqual([]);
    expect(work.foldGroups.value).toEqual([]);
    expect(work.show.value.kind).toBe('all');
    expect(reveal.opened.value).toEqual([]);
    expect(reveal.expanded.value).toEqual({});
    expect(reveal.start.value).toBeNull();
  });
});
