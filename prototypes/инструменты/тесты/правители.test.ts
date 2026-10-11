/**
 * «Правители» по стихам (П-1): каждый синхронизм 4 Цар 15–18 выполнен или помечен «напряжение» (или «до года»); номер года
 * царя не больше числа лет по стиху; Захария, Селлум, Менаим, Факия, Факей — на годах Азарии из своих стихов; имя — как в
 * стихе. Данные — `public/data/proto.json` (сборка `npm run -s proto:data`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { правители, годЦаря, ЦАРИ } from '../время/правители.ts';
import type { ProtoPack } from '../общее/типы.ts';

const F = join(import.meta.dirname, '..', 'public', 'data', 'proto.json');

describe('Правители по стихам (4 Цар 15–18)', () => {
  if (!existsSync(F)) throw new Error('нет public/data/proto.json: npm run -s proto:data');
  const p = JSON.parse(readFileSync(F, 'utf8')) as ProtoPack;
  const chrono = new Map(p.chrono.map((x) => [x.actor, x]));
  const П = правители(chrono, (id) => id);
  const k = (id: string) => П.цари.find((x) => x.id === id)!;
  const az = k('p-oziya');

  it('все цари глав на оси', () => expect(П.цари.map((x) => x.id).sort()).toEqual([...ЦАРИ].sort()));
  it('имя — как в стихе воцарения: Азария (4 Цар 15:1)', () => expect(az.имя).toBe('Азария'));
  for (const [id, n] of [
    ['p-zakhariya-syn-ieroboama', 38],
    ['p-sellum-syn-iavisa', 39],
    ['p-menaim', 39],
    ['p-fakiya', 50],
    ['p-fakey', 52],
  ] as const)
    it(`${id}: воцарился в ${n}-й год Азарии`, () => expect(годЦаря(az, k(id).от)).toBe(n));

  it('каждый синхронизм глав 15–18 проверен: выполнен, до года или напряжение', () => {
    const вГлавах = П.синхронизмы.filter((s) => /^4Цар 1[5-8]:/.test(s.стих));
    expect(вГлавах.length).toBeGreaterThanOrEqual(13);
    for (const s of вГлавах) expect(П.проверки.some((x) => x.стихи.includes(s.стих)), s.стих).toBe(true);
    expect(П.проверки.some((x) => x.стихи.includes('4Цар 18:9'))).toBe(true);
    expect(П.проверки.some((x) => x.стихи.includes('4Цар 18:10'))).toBe(true);
    for (const x of П.проверки) expect(['выполнен', 'до года', 'напряжение']).toContain(x.статус);
    for (const x of П.проверки) if (Math.abs(x.разница) > 1) expect(x.статус).toBe('напряжение');
  });

  it('номер года не больше числа лет по стиху', () => {
    for (const c of П.цари) for (let y = c.от - 3; y < c.от + c.лет + 5; y++) {
      const n = годЦаря(c, y);
      if (n !== null) expect(n).toBeLessThanOrEqual(Math.max(1, c.лет));
    }
  });
});
