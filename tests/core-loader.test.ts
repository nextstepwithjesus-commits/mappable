/**
 * Ядро: загрузчик пакетов (09 § 5.4, § 6.2–6.3; 09 § 5.2 п. 7). Источник — в памяти: так ядро работает и в браузере
 * (fetch, crypto.subtle), и в Node.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { Loader, canSwitch, checkManifest, readiness, type Source } from '../core/loader.ts';
import { MANIFEST_SCHEMA, PACK_SCHEMA, type Manifest, type PackageEntry } from '../core/types.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function setup(opts: { admit?: 'release' | 'probe'; packAdmit?: 'release' | 'probe'; schema?: number; synthetic?: boolean; corrupt?: boolean } = {}) {
  const admit = opts.admit ?? 'release';
  const core = JSON.stringify({ schema: PACK_SCHEMA, admit: opts.packAdmit ?? admit, persons: [], places: [], stories: [], names: [], exceptions: [], glossary: [], ...(opts.synthetic && { synthetic: true }) });
  const text = JSON.stringify({ schema: PACK_SCHEMA, admit, book: 'Быт', ch: [['В начале сотворил Бог небо и землю.']], br: [], iss: [] });
  const tools = JSON.stringify({ schema: PACK_SCHEMA, admit, actors: [], origins: [], cand: [], unions: [], kin: [], readings: [], works: [], areas: [], lines: {}, redirects: [], places: [] });
  const entry = (kind: PackageEntry['kind'], file: string, body: string, required: boolean, extra: Partial<PackageEntry> = {}): PackageEntry => ({
    kind, file, sha256: sha(body), raw: body.length, size: body.length, gzip: body.length, budget: 200 * 1024, required, ...extra,
  });
  const man: Manifest = {
    schema: (opts.schema ?? MANIFEST_SCHEMA) as typeof MANIFEST_SCHEMA, release: '2026.10.1', admit, ...(opts.synthetic && { synthetic: true as const }), compression: 'br',
    inputs: { base: 'x', files: {} }, statuses: { checked: 1, draft: 0, quarantine: 0, stale: 0, rights: 0, admitted: 1 },
    packages: [entry('core-index', 'core-index.a.json', core, true), entry('tools-index', 'tools-index.t.json', tools, true), entry('text', 'text/01-byt.b.json', text, false, { book: 'Быт' })],
    models: { chronology: null, places: null }, sources: [], changes: null,
  };
  const files = new Map<string, string>([['manifest.json', JSON.stringify(man)], ['core-index.a.json', opts.corrupt ? core.replace('[]', '[ ]') : core], ['tools-index.t.json', tools], ['text/01-byt.b.json', text]]);
  const reads = new Map<string, number>();
  const src: Source = {
    read: async (f) => {
      reads.set(f, (reads.get(f) ?? 0) + 1);
      const x = files.get(f);
      if (x === undefined) throw new Error(`нет файла ${f}`);
      return x;
    },
    sha256: async (s) => sha(s),
  };
  return { man, src, reads };
}

describe('загрузчик', () => {
  it('читает опись и пакет, сверяет sha256, кэширует', async () => {
    const { src } = setup();
    const L = new Loader(src, { level: 'release' });
    expect((await L.manifest()).s).toBe('готово');
    const c = await L.get('core-index');
    expect(c.s).toBe('готово');
    const t = await L.get('text', { book: 'Быт' });
    expect(t.s === 'готово' && t.data.ch[0][0]).toMatch(/^В начале/);
    expect(L.required().map((p) => p.kind)).toEqual(['core-index', 'tools-index']);
  });
  it('опись с неизвестной схемой не читается (09 § 6.2 п. 3)', async () => {
    const { src } = setup({ schema: 99 });
    const r = await new Loader(src, { level: 'release' }).manifest();
    expect(r.s === 'ошибка' && r.code).toBe('опись-неизвестная-схема');
  });
  it('приложение выпуска не читает пробу — ни опись, ни пакет (09 § 5.2 п. 7)', async () => {
    const a = setup({ admit: 'probe' });
    expect((await new Loader(a.src, { level: 'release' }).manifest()).s).toBe('ошибка');
    expect((await new Loader(a.src, { level: 'probe' }).manifest()).s).toBe('готово');
    const b = setup({ packAdmit: 'probe' });
    const L = new Loader(b.src, { level: 'release' });
    await L.manifest();
    const r = await L.get('core-index');
    expect(r.s === 'ошибка' && r.code).toBe('пакет-уровень');
  });
  it('синтетика — не для приложения', async () => {
    const { src } = setup({ admit: 'probe', synthetic: true });
    expect((await new Loader(src, { level: 'probe' }).manifest()).s).toBe('ошибка');
    expect((await new Loader(src, { level: 'probe', allowSynthetic: true }).manifest()).s).toBe('готово');
  });
  it('пакет, не совпавший с описью по sha256, — ошибка, а не чужие данные', async () => {
    const { src } = setup({ corrupt: true });
    const L = new Loader(src, { level: 'release' });
    await L.manifest();
    const r = await L.get('core-index');
    expect(r.s === 'ошибка' && r.code).toBe('пакет-sha256');
    expect(r.s === 'ошибка' && r.retry).toBe(true);
  });
  it('нет пакета в описи — ошибка с названием', async () => {
    const { src } = setup();
    const L = new Loader(src, { level: 'release' });
    await L.manifest();
    const r = await L.get('text', { book: 'Исх' });
    expect(r.s === 'ошибка' && r.code).toBe('нет-пакета');
    expect(r.s === 'ошибка' && r.detail).toBe('text Исх');
  });
  it('готовность без сети и переход на выпуск только при всех обязательных (09 § 6.2–6.3)', () => {
    const { man } = setup();
    const none = new Map<string, string>();
    expect(readiness(man, none)).toMatchObject({ have: 0, of: 3, requiredOk: false });
    const core = man.packages[0];
    const tl = man.packages[1];
    const some = new Map([[core.file, core.sha256], [tl.file, tl.sha256]]);
    expect(readiness(man, some)).toMatchObject({ have: 2, of: 3, requiredOk: true });
    expect(readiness(man, new Map([[core.file, core.sha256]])).requiredOk).toBe(false);
    expect(canSwitch(man, some, { level: 'release' })).toBe(true);
    expect(canSwitch(man, new Map([[core.file, 'испорчен'], [tl.file, tl.sha256]]), { level: 'release' })).toBe(false);
    expect(canSwitch({ ...man, schema: 99 }, some, { level: 'release' })).toBe(false);
  });
  it('опись без обязательных пакетов, с необязательным ядром, выпуск без номера, чужое сжатие — отказ; переход запрещён (данные № 4)', () => {
    const { man } = setup();
    const opts = { level: 'release' as const };
    const all = new Map(man.packages.map((p) => [p.file, p.sha256]));
    const variants: unknown[] = [
      { ...man, packages: man.packages.filter((p) => p.kind !== 'core-index') },
      { ...man, packages: man.packages.map((p) => (p.kind === 'tools-index' ? { ...p, required: false } : p)) },
      { ...man, packages: [] },
      { ...man, release: null },
      { ...man, compression: 'zstd' },
      { ...man, packages: [...man.packages, man.packages[0]] },
    ];
    for (const v of variants) {
      expect(checkManifest(v, opts)?.code).toBe('опись-неполна');
      expect(canSwitch(v, all, opts)).toBe(false);
    }
    expect(canSwitch(man, all, opts)).toBe(true);
  });
  it('вид из многих пакетов — только с выбором книги или тома (данные № 13)', async () => {
    const { src } = setup();
    const L = new Loader(src, { level: 'release' });
    await L.manifest();
    const r = await L.get('text');
    expect(r.s === 'ошибка' && r.code).toBe('нужен-выбор');
  });
  it('одновременные запросы одного пакета читают его один раз; тексты сверх предела вытесняются (данные № 11)', async () => {
    const { src, reads } = setup();
    const L = new Loader(src, { level: 'release', textLimit: 0 });
    await L.manifest();
    const [a, b] = await Promise.all([L.get('core-index'), L.get('core-index')]);
    expect(a.s).toBe('готово');
    expect(b.s).toBe('готово');
    expect(reads.get('core-index.a.json')).toBe(1);
    await L.get('text', { book: 'Быт' });
    expect(L.textsInMemory).toBe(0);
    await L.get('text', { book: 'Быт' });
    expect(reads.get('text/01-byt.b.json')).toBe(2);
  });
});

