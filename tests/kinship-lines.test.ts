/**
 * «Родство» и линии Мессии (решение 20; CARD-62, UX-47): первыми — пути, совпадающие с data/lines, «по Матфею» и
 * «по Луке»; смешанные — под «ещё», с пометой «смешанный путь: до Салафиила — по Луке, дальше — по Матфею».
 * Пометы — одной фразой: «по закону (Мф 1:16) и по толкованию (Лк 3:27)».
 */
import { describe, it, expect } from 'vitest';
import { graph, lines } from '../src/data/atlas.ts';
import { relate } from '../src/engine/kinship.ts';

const LINES = { joseph: lines.joseph.persons.map((s) => s.id), mary: lines.mary.persons.map((s) => s.id) };

describe('пути родства по линиям Мессии', () => {
  it('Авраам — Иисус Христос: первый путь по Матфею, второй — по Луке, смешанные — под «ещё» с пометой', () => {
    const rs = relate(graph, 'avraam', 'iisus', undefined, { lines: LINES });
    expect(rs[0].line?.kind).toBe('mt');
    expect(rs[1].line?.kind).toBe('lk');
    expect(rs[0].more).toBe(false);
    expect(rs[1].more).toBe(false);
    const mixed = rs.filter((r) => r.line?.kind === 'mixed');
    expect(mixed.length).toBeGreaterThan(0);
    for (const r of mixed) {
      expect(r.more).toBe(true);
      expect(r.line!.text).toMatch(/^смешанный путь: до \S+ — по (Луке|Матфею), дальше — по (Матфею|Луке)$/);
    }
    expect(mixed.some((r) => /до Салафиила — по Луке, дальше — по Матфею/.test(r.line!.text))).toBe(true);
  });
  it('Руфь — Иисус Христос: так же; фраза пометы — «… и по толкованию …»', () => {
    const rs = relate(graph, 'ruf', 'iisus', undefined, { lines: LINES });
    expect(rs.slice(0, 2).map((r) => r.line?.kind)).toEqual(['mt', 'lk']);
    for (const r of rs) expect(r.sentence).not.toMatch(/\), по толкованию/);
  });
  it('без линий — прежний порядок, помет линий нет', () => {
    const rs = relate(graph, 'avraam', 'iisus');
    expect(rs.every((r) => r.line === undefined)).toBe(true);
  });
  it('пары вне линий Мессии не меняются: Иоав — Давид', () => {
    const a = relate(graph, 'ioav', 'david', undefined, { lines: LINES });
    const b = relate(graph, 'ioav', 'david');
    expect(a.map((r) => r.sentence)).toEqual(b.map((r) => r.sentence));
  });
});
