/** Сборка данных для приложения (docs/app/02-ДАННЫЕ.md, § 8): индекс поиска и указателя — в бюджете. */
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildIndex, BUDGET_INDEX_GZ } from '../tools/base/bundle.ts';
import { buildBase } from '../tools/base/migrate.ts';

describe('сборка для приложения', () => {
  it('индекс — не больше 200 КБ в gzip', () => {
    const s = JSON.stringify(buildIndex(buildBase(), 'probe'));
    expect(gzipSync(s, { level: 9 }).length).toBeLessThanOrEqual(BUDGET_INDEX_GZ);
  }, 60_000);
  it('пометка «по словам …» и авторы толкований идут в индекс (02 § 3.6, § 3.4)', () => {
    const ix = buildIndex(buildBase(), 'probe');
    const said = { a: 'avraam', r: 'Быт 20:11', l: 'по словам Авраама' };
    expect(ix.kin.find((k: any) => k.f === 'sarra' && k.t === 'avraam' && k.r === 'сестра')?.sb).toEqual(said);
    expect(ix.origins.find((o: any) => o.c === 'sarra' && o.p === 'farra')?.sb).toEqual(said);
    const r = ix.readings.find((x: any) => x.id === 'r-lk3-23')!.r;
    for (const x of r.filter((y: any) => y.ce === 'interpretation')) expect([x.id, (x.au ?? []).length > 0]).toEqual([x.id, true]);
    expect(r.filter((y: any) => y.ce === 'scripture').map((y: any) => y.au)).toEqual([undefined, undefined]);
  }, 60_000);
});
