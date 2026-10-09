/**
 * Скобки Синодального текста по решению совета (docs/app/reviews/R10-решение-совета.md, § 4, § 8, § 10; 02 § 3.8):
 * таблица tools/bible/brackets.tsv полна в обе стороны, scriptureText оставляет только проверенные пояснения и
 * повреждения и работает по каждому стиху отдельно.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bracketRows, bracketSegments, matchBrackets, scriptureText, scriptureTexts, isText, isNT, caption, NEUTRAL } from '../tools/base/brackets.ts';

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
    // § 8.4: «[Лаван]» в Быт 29:23 совет проверил
    expect(row('Быт', 29, 23, 'Лаван')?.checkedBy).toBe('совет: WLC, LXX, CSL');
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

describe('сверка с подлинником (рецензия второго ключа, № 6–7)', () => {
  it('«R10: вручную» нет: R10 сверял ВЗ по KJV, НЗ — по TR', () => {
    const by = new Set(bracketRows().map((r) => r.checkedBy));
    expect(by.has('R10: вручную')).toBe(false);
    expect(bracketRows().filter((r) => r.checkedBy === 'R10: по KJV' && isNT(r.book))).toEqual([]);
    expect(bracketRows().filter((r) => r.checkedBy === 'R10: TR' && !isNT(r.book))).toEqual([]);
  });
  it('в Ветхом Завете текстом считается только место, сверенное с WLC; в Новом — с TR', () => {
    const text = bracketRows().filter(isText);
    expect(text.filter((r) => !isNT(r.book) && !/\bWLC\b/.test(r.checkedBy))).toEqual([]);
    expect(text.filter((r) => isNT(r.book) && !/\bTR\b/.test(r.checkedBy))).toEqual([]);
  });
  it('семь мест «повреждение» в псалмах, сверенных R10 только по KJV, — не основание; Пс 13:1 и 104:15 совет сверил по WLC', () => {
    const seven: [number, number, string][] = [[9, 32, 'забыл Бог'], [12, 5, 'я одолел его'], [13, 7, 'Кто даст с Сиона'], [26, 8, 'ищите лица Моего'], [57, 12, 'подлинно есть плод'], [67, 23, 'от Васана возвращу'], [67, 24, 'чтобы ты погрузил'], [89, 4, 'возвратитесь, сыны человеческие']];
    for (const [c, v, t] of seven) expect([c, v, scriptureText('Пс', c, v)!.includes(t)]).toEqual([c, v, false]);
    expect(bracketRows().filter((r) => r.kind === 'damage' && !isText(r)).map((r) => `${r.chapter}:${r.from}`)).toEqual(['9:32', '12:5', '13:7', '26:8', '57:12', '67:23', '89:4']);
    expect(scriptureText('Пс', 104, 15)).toContain('не прикасайтесь к помазанным Моим');
  });
  it('подпись «дополнение по греческому переводу» — только у мест, сверенных с LXX', () => {
    for (const r of bracketRows()) if (caption(r) === 'дополнение по греческому переводу') expect([r.book, r.chapter, r.from, r.checkedBy, r.source]).toEqual([r.book, r.chapter, r.from, 'совет: WLC, LXX, CSL', 'LXX']);
    expect(caption(row('Быт', 4, 18, 'Малелеила')!)).toBe('дополнение по греческому переводу');
    // по славянскому: в LXX слов нет — подпись нейтральная
    expect(row('Быт', 19, 9, 'ему')?.source).toBe('CSL');
    expect(caption(row('Быт', 19, 9, 'ему')!)).toBe(NEUTRAL);
    expect(caption(row('Быт', 5, 3, 'сына')!)).toBe(NEUTRAL);
    // R10 по KJV и места по признакам — нейтральная
    const kjv = bracketRows().find((r) => r.kind === 'lxx' && r.checkedBy === 'R10: по KJV')!;
    expect(caption(kjv)).toBe(NEUTRAL);
    expect(caption(row('Быт', 1, 6, 'И стало так.')!)).toBe(NEUTRAL);
    expect(caption(null)).toBe(NEUTRAL);
  });
  it('подписи НЗ и слов переводчиков — по сверке места', () => {
    expect(caption(row('Деян', 12, 25, 'в Антиохию')!)).toBe('нет в греческом тексте, принятом переводчиками');
    expect(caption(row('Флм', 1, 2, 'сестре')!)).toBe(NEUTRAL);
    expect(caption(row('Евр', 12, 20, 'или поражен стрелою')!)).toBe(NEUTRAL);
    expect(caption(row('Мф', 8, 18, 'ученикам')!)).toBe('слово добавлено переводчиками');
    expect(caption(row('Лев', 24, 11, 'имя же матери его Саломиф, дочь Давриина, из племени Данова')!)).toBe('');
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
