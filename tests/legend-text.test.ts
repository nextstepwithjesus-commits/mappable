/**
 * Подсказка звезды у оценочного года (G5): промежуток словами — «Родился между 1955 и 1890 гг. до Р. Х.», те же годы,
 * что § 8 карточки («возможный промежуток — 1955–1890 гг. до Р. Х.»). У точного и расчётного года промежутка нет.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { describe, expect, it } from 'vitest';
import { byId, models } from '../src/data/atlas.ts';
import { toAstro } from '../src/engine/years.ts';
import { betweenYears, birthSpanText } from '../src/ui/sky/text.ts';
import { birthLine, birthRange } from '../src/ui/card/shared.tsx';
import { isPeople } from '../src/ui/card/Masthead.tsx';
import { typo } from '../src/ui/text/typo.ts';

const m = models[0];
const flat = (s: string) => s.replace(/[ ⁠]/g, ' ');
const nums = (s: string) => [...flat(s).matchAll(/\d+/g)].map((x) => Number(x[0]));

describe('промежуток оценочного года рождения в подсказке', () => {
  const estimated = [...m.chrono.entries()].filter(([id, c]) => c.cls === 'estimated' && byId.has(id) && !isPeople(id));

  it('у оценочного года — «Родился (Родилась) между A и B гг. …», глагол по полу', () => {
    expect(estimated.length).toBeGreaterThan(100);
    let shown = 0;
    for (const [id] of estimated) {
      const t = birthSpanText(id);
      if (!t) continue;
      shown++;
      const verb = byId.get(id)!.sex === 'f' ? 'Родилась' : 'Родился';
      expect(flat(t), id).toMatch(new RegExp(`^${verb} между \\d+( г\\. (до|по) Р\\. Х\\.)? и \\d+ гг?\\. (до|по) Р\\. Х\\.$`));
    }
    expect(shown).toBeGreaterThan(estimated.length * 0.9);
  });
  it('годы — те же, что «возможный промежуток» § 8 карточки', () => {
    for (const [id, c] of estimated.slice(0, 400)) {
      const t = birthSpanText(id);
      if (!t) continue;
      const line = birthLine(c, birthRange(id, c, m.chrono));
      // этап 13, решение 96: § 8 пишет промежуток словарём дат — «между 1805 и 1755 гг. до Р. Х.» (прежде «возможный
      // промежуток — …»)
      const range = flat(line).split(/возможный промежуток|между/)[1];
      expect(nums(t), id).toEqual(nums(range));
    }
  });
  it('раньше — больший год до Р. Х.: «между 1955 и 1890»', () => {
    const t = birthSpanText('ruvim')!;
    const [a, b] = nums(t);
    expect(a).toBeGreaterThan(b);
  });
  it('у точного и расчётного года, у народа и рода — промежутка нет', () => {
    for (const [id, c] of m.chrono) {
      if (c.cls === 'estimated' && !isPeople(id)) continue;
      expect(birthSpanText(id), id).toBeNull();
    }
    expect(birthSpanText('avraam')).toBeNull();
  });
  it('через начало эры — у каждого конца своя эра; строка уже в русской типографике', () => {
    expect(flat(betweenYears(toAstro(-5), toAstro(10)))).toBe('5 г. до Р. Х. и 10 г. по Р. Х.');
    expect(flat(betweenYears(toAstro(-1020), toAstro(-990)))).toBe('1020 и 990 гг. до Р. Х.');
    expect(flat(betweenYears(toAstro(30), toAstro(60)))).toBe('30 и 60 гг. по Р. Х.');
    const t = birthSpanText('ruvim')!;
    expect(typo(t)).toBe(t);
  });
});
