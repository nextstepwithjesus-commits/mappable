/**
 * Синтетика полного размера (10 § 4.0.1 п. 6): объёмы, пометка «синтетика», бюджеты на ней (10 § 4.0.3: бюджеты — на
 * синтетике полного размера), в выпуск не идёт.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSynth, SYNTH } from '../tools/pack/synth.ts';
import { BUDGETS } from '../tools/pack/budgets.ts';
import { Loader } from '../core/loader.ts';
import type { CoreIndex, RelationsPack, ToolsIndex } from '../core/types.ts';
import type { WriteResult } from '../tools/pack/write.ts';

let dir: string;
let r: WriteResult;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pack-synth-'));
  r = buildSynth({ dir });
}, 240_000);

const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
const one = (k: string) => r.manifest.packages.find((p) => p.kind === k)!;

describe('синтетика полного размера', () => {
  it('объёмы: 10 000 лиц, ≈ 1 500 историй и ≈ 2 200 частей, 5 000 связей, 1 342 места сводки', () => {
    const core = read<CoreIndex>(one('core-index').file);
    const tools = read<ToolsIndex>(one('tools-index').file);
    expect(core.persons.length).toBe(SYNTH.persons);
    expect(core.stories.length).toBe(SYNTH.stories);
    const parts = core.stories.reduce((n, s) => n + (s.parts?.length || 1), 0);
    expect(parts).toBeGreaterThanOrEqual(2000);
    expect(parts).toBeLessThanOrEqual(2400);
    expect(core.places.length).toBe(SYNTH.places);
    expect(tools.places.length).toBeGreaterThan(1300);
    const rel = r.manifest.packages.filter((p) => p.kind === 'relations').reduce((n, p) => n + read<RelationsPack>(p.file).rows.length, 0);
    expect(rel).toBe(SYNTH.relations);
  });
  it('каждый пакет и опись помечены «синтетика»', () => {
    expect(r.manifest.synthetic).toBe(true);
    expect(r.manifest.banner).toMatch(/Синтетика/);
    for (const p of r.manifest.packages) {
      const x = read<{ synthetic?: boolean; admit: string }>(p.file);
      expect(x.synthetic, p.file).toBe(true);
      expect(x.admit, p.file).toBe('probe');
    }
  });
  it('бюджеты на синтетике: каждый пакет в бюджете своего вида (сжатие хранилища)', () => {
    expect(r.over).toEqual([]);
    for (const p of r.manifest.packages) expect(p.size, p.file).toBeLessThanOrEqual(BUDGETS[p.kind].max);
  });
  it('в выпуск не идёт: загрузчик синтетику не читает', async () => {
    const src = { read: async (f: string) => readFileSync(join(dir, f), 'utf8'), sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };
    expect((await new Loader(src, { level: 'release' }).manifest()).s).toBe('ошибка');
    expect((await new Loader(src, { level: 'probe' }).manifest()).s).toBe('ошибка');
    expect((await new Loader(src, { level: 'probe', allowSynthetic: true }).manifest()).s).toBe('готово');
  });
});
