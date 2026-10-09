/**
 * Скобки Синодального текста по решению совета (docs/app/reviews/R10-решение-совета.md, § 4, § 8, § 10; 02 § 3.8):
 * таблица tools/bible/brackets.tsv полна в обе стороны, scriptureText оставляет только проверенные пояснения и
 * повреждения и работает по каждому стиху отдельно.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bracketRows, bracketSegments, matchBrackets, scriptureText, scriptureTexts, isText } from '../tools/base/brackets.ts';

const synodal = readFileSync(join(import.meta.dirname, '..', 'tools', 'bible', 'synodal.tsv'), 'utf8');
const row = (book: string, chapter: number, verse: number, text: string) =>
  bracketRows().find((r) => r.book === book && r.chapter === chapter && r.from === verse && r.text === text);

describe('таблица скобок', () => {
  it('каждая скобка «[» и «(» в synodal.tsv — строка таблицы с тем же текстом, и наоборот', () => {
    const { matched, unmatchedRows } = matchBrackets();
    expect(matched.filter((m) => !m.row).map((m) => `${m.seg.book} ${m.seg.chapter}:${m.seg.from}`)).toEqual([]);
    expect(unmatchedRows.map((r) => `${r.book} ${r.chapter}:${r.from} «${r.text.slice(0, 30)}»`)).toEqual([]);
    // счёт независимо от разбора: открывающих скобок в тексте столько же, сколько строк (вложенных скобок нет)
    const opens = (synodal.match(/[[(]/g) ?? []).length;
    expect(bracketSegments()).toHaveLength(opens);
    expect(bracketRows()).toHaveLength(opens);
    expect(opens).toBe(2461);
  });

  it('виды и проверка — по решению совета', () => {
    const count = (k: string) => bracketRows().filter((r) => r.kind === k).length;
    expect(count('gloss')).toBe(46);
    expect(count('damage')).toBe(11);
    expect(bracketRows().filter((r) => (r.kind === 'gloss' || r.kind === 'damage') && r.checkedBy === 'по признакам')).toEqual([]);
    // § 9 п. 3: Мф 16:20 «[Иисус]» и Евр 13:20 «[Христа]» — г-нз, а не «в»
    expect(row('Мф', 16, 20, 'Иисус')?.kind).toBe('slav');
    expect(row('Евр', 13, 20, 'Христа')?.kind).toBe('slav');
    // § 9 п. 4: имена и родство «в» — на деле вставки по греческому
    for (const [b, c, v, t] of [['Быт', 16, 13, 'Агарь'], ['Быт', 34, 5, 'сын Емморов'], ['2Цар', 19, 24, 'Ионафана, сына'], ['3Цар', 12, 20, 'и Вениаминова']] as const) {
      expect([t, row(b, c, v, t)?.kind]).toEqual([t, 'lxx']);
    }
    // § 9 п. 5: Быт 32:18 «[идет]» — «в»
    expect(row('Быт', 32, 18, 'идет')?.kind).toBe('added');
    // 30 вставок в круглых скобках — не основание
    const round = bracketRows().filter((r) => r.bracket === '()');
    expect(round).toHaveLength(49);
    expect(round.filter((r) => !isText(r))).toHaveLength(30);
    expect(row('Деян', 12, 25, 'в Антиохию')?.checkedBy).toBe('совет: TR, SBLGNT, CSL');
  });
});

describe('scriptureText', () => {
  it('Лев 24:11 — пояснение самого текста остаётся: «Саломиф, дочь Давриина»', () => {
    const t = scriptureText('Лев', 24, 11)!;
    expect(t).toContain('имя же матери его Саломиф, дочь Давриина, из племени Данова');
    expect(t).not.toMatch(/[[\]]/);
    // вставка по греческому в том же стихе вырезана
    expect(t).not.toContain('Господне');
  });
  it('Быт 4:18 — «[Гаидад]» и «[Малелеила]» вырезаны: имя только из скобок не основание', () => {
    const t = scriptureText('Быт', 4, 18)!;
    expect(t).not.toContain('Гаидад');
    expect(t).not.toContain('Малелеил');
    expect(t).toContain('Ирад родил Мехиаеля');
  });
  it('Деян 12:25 — «(в Антиохию)» в круглых скобках вырезано', () => {
    const t = scriptureText('Деян', 12, 25)!;
    expect(t).not.toContain('Антиохи');
    expect(t).toContain('возвратились из Иерусалима, взяв с собою и Иоанна');
  });
  it('Мк 6:14 — пояснение в квадратных скобках остаётся', () => {
    expect(scriptureText('Мк', 6, 14)).toContain('ибо имя Его стало гласно');
  });
  it('по каждому стиху отдельно: Суд 20:27–28 — у каждого стиха своя часть, как ни записана ссылка', () => {
    expect(scriptureText('Суд', 20, 27)).toContain('ковчег завета Божия находился там');
    expect(scriptureText('Суд', 20, 28)).toMatch(/^и Финеес, сын Елеазара, сына Ааронова, предстоял пред ним: выходить/);
    expect(scriptureTexts('Суд 20:27-28')).toEqual([scriptureText('Суд', 20, 27), scriptureText('Суд', 20, 28)]);
    expect(scriptureTexts('Суд 20:28')).toEqual([scriptureText('Суд', 20, 28)]);
  });
  it('повреждение электронного текста — исправленное чтение по таблице', () => {
    expect(scriptureText('Мф', 2, 9)).toContain('пошли. И се, звезда');
    expect(scriptureText('Пс', 13, 1)).toContain('нет Бога');
    // Притч 29:6: незакрытая скобка; «него» — «в», остальное до конца главы — текст
    expect(scriptureText('Притч', 29, 6)).not.toContain('него');
    expect(scriptureText('Притч', 29, 6)).toContain('а праведник веселится и радуется');
    expect(scriptureText('Притч', 29, 27)).toContain('Мерзость для праведников');
  });
  it('стих без скобок не меняется; нет стиха — undefined', () => {
    expect(scriptureText('Быт', 11, 30)).toBe('И Сара была неплодна и бездетна.');
    expect(scriptureText('Быт', 99, 1)).toBeUndefined();
  });
});
