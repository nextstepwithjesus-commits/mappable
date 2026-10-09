/** Сборка данных для приложения (docs/app/02-ДАННЫЕ.md, § 8): индекс поиска и указателя — в бюджете. */
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildIndex, BUDGET_INDEX_GZ } from '../tools/base/bundle.ts';
import { buildBase } from '../tools/base/migrate.ts';

describe('сборка для приложения', () => {
  it('индекс — не больше 200 КБ в gzip', () => {
    const s = JSON.stringify(buildIndex(buildBase()));
    expect(gzipSync(s, { level: 9 }).length).toBeLessThanOrEqual(BUDGET_INDEX_GZ);
  }, 60_000);
});
