/** Ядро: запросы к пакетам и «нет данных для инструмента» (01 § 2.3; 09 § 4.3). Данные — пакеты пробы в памяти. */
import { describe, it, expect, beforeAll } from 'vitest';
import { coreData } from './helpers/core-data.ts';
import { verseOf, bracketAt, scriptureWords } from '../core/verses.ts';

let L: ReturnType<typeof coreData>;
beforeAll(() => {
  L = coreData();
});

describe('запросы ядра', () => {
  it('лицо по полному номеру; родители, дети, супруги — полными номерами', () => {
    const kain = L.data.person('p-kain');
    expect(kain?.n).toBe('Каин');
    expect(L.data.parents('p-kain').map((k) => k.id).sort()).toEqual(['p-adam', 'p-eva']);
    expect(L.data.children('p-adam').map((k) => k.id)).toContain('p-kain');
    expect(L.data.spouses('p-adam')).toContain('p-eva');
    expect(() => L.data.parents('kain')).toThrow(/не лицо/);
  });
  it('переадресация: переход на одну цель', () => {
    const r = L.data.resolve('p-iliy-otets-marii');
    expect(r.kind).toBe('переход');
  });
  it('«нет данных для инструмента»: Мелхиседек — «Писание говорит» со стихом Евр 7:3, кнопка не прячется', () => {
    const vol = L.cards.get(L.data.person('p-melkhisedek')?.volume ? [...L.cards.keys()].find((k) => k.startsWith(L.data.person('p-melkhisedek')!.volume!))! : '')!;
    const r = L.data.forTool('genealogiya', 'p-melkhisedek', vol);
    expect(r.s).toBe('пусто');
    if (r.s !== 'пусто' || r.why.kind !== 'нет сведений') throw new Error('нет ответа «нет сведений»');
    expect(r.why.scripture).toBe(true);
    expect(r.why.refs).toEqual(['Евр 7:3']);
    expect(r.why.words?.[0].text).toMatch(/без отца, без матери/);
  });
  it('данные есть — «готово»; неизвестный номер — «нет записи»; инструмент без разметки — «не размечено»', () => {
    expect(L.data.forTool('genealogiya', 'p-kain').s).toBe('готово');
    const x = L.data.forTool('genealogiya', 'p-nikto');
    expect(x.s === 'пусто' && x.why.kind).toBe('нет записи');
    const y = L.data.forTool('geografiya', 'p-kain');
    expect(y.s === 'пусто' && y.why.kind).toBe('не размечено');
  });
});

describe('стих из пакета текста', () => {
  it('Дан 3:24 нет в синодальном тексте — null; Пс 114:9 пуст — "" и пометка дефекта', () => {
    const dan = L.texts.get('Дан')!;
    expect(dan.ch[2][23]).toBeNull();
    expect(verseOf(dan, 3, 24)?.missing).toBe(true);
    const ps = verseOf(L.texts.get('Пс')!, 114, 9);
    expect(ps?.empty).toBe(true);
    expect(ps?.issues).toContain('empty');
  });
  it('отрезки скобок с видом: Быт 1:6 «[И стало так.]» — lxx, не текст; находка внутри — с видом', () => {
    const g = L.texts.get('Быт')!;
    const v = verseOf(g, 1, 6)!;
    const b = v.brackets[0];
    expect(b.kind).toBe('lxx');
    expect(b.isText).toBe(false);
    expect(v.text.slice(b.start, b.end)).toBe('[И стало так.]');
    expect(bracketAt(g, 1, 6, b.start + 2)?.kind).toBe('lxx');
    expect(bracketAt(g, 1, 6, 0)).toBeUndefined();
    expect(scriptureWords(v)).not.toMatch(/стало так/);
  });
});
