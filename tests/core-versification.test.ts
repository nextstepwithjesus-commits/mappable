/**
 * Своя таблица «западная → синодальная нумерация» (09 § 3.5 п. 4, § 5.5; рецензии: интерфейс № 4, данные № 7): каждое
 * расхождение таблицы JSword `base/versification/synodal-kjv.json` (с поправками FIXES) разбирается ядром в тот же синодальный стих.
 * Таблица JSword в пакеты не идёт (09 § 5.5).
 */
import { describe, it, expect } from 'vitest';
import { pairs } from '../tools/pack/versification.ts';
import { kjvToSyn, parseAddress } from '../core/search/address.ts';
import { BOOKS } from '../core/books.ts';

const OSIS = new Map(BOOKS.map((b) => [b.osis, b.code]));

describe('западная нумерация → синодальная', () => {
  const ps = pairs();
  it(`все ${ps.length} расхождений таблицы JSword переводятся ядром`, () => {
    expect(ps.length).toBeGreaterThan(2800);
    const bad: string[] = [];
    for (const p of ps) {
      const code = OSIS.get(p.kjv[0]);
      if (!code) { bad.push(`нет книги ${p.kjv[0]}`); continue; }
      const r = kjvToSyn(code, p.kjv[1], p.kjv[2]);
      if (code !== p.syn[0] || r.c !== p.syn[1] || r.v !== p.syn[2]) bad.push(`${p.kjv.join('.')} → ${code} ${r.c}:${r.v}, нужно ${p.syn.join(' ')}`);
    }
    expect(bad).toEqual([]);
  });
  it('вне Псалтири — 300+ пар, и все с другим номером', () => {
    expect(ps.filter((p) => p.kjv[0] !== 'Ps').length).toBeGreaterThan(300);
  });
  it('адреса рецензий: Psalm 3:1 → Пс 3:2, Num 13:33 → Чис 13:34, Job 41:1 → Иов 40:20, Romans 16:25 → Рим 14:24', () => {
    const lab = (q: string) => parseAddress(q)?.label.replace(/\u00A0/g, ' ');
    expect(lab('Psalm 3:1')).toBe('Пс 3:2');
    expect(lab('Num 13:33')).toBe('Чис 13:34');
    expect(lab('Job 41:1')).toBe('Иов 40:20');
    expect(lab('Romans 16:25')).toBe('Рим 14:24');
    expect(parseAddress('Romans 16:25')?.notes.join()).toMatch(/В Синодальном переводе: Рим/);
    expect(lab('Gen 1:1')).toBe('Быт 1:1');
  });
});
