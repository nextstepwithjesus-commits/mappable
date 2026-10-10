/**
 * Положительный допуск в сборку (Д3-1) и отпечаток проверки (Д3-2): Д-база, Б-1; черновик 09 § 5.2.
 * Черновик не попадает в выпуск; файл в карантине не попадает целиком; ребро к недопущенному лицу не попадает;
 * запись, изменённая после проверки, теряет «проверено», и валидатор даёт ошибку.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBase, type Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import { admission, fileEnv, records, sign, statusOf, validateChecks, PROBE_BANNER, type TextEnv } from '../tools/base/admit.ts';
import { assertOut, buildCards, buildIndex, OUT_DIR } from '../tools/base/bundle.ts';

const ROOT = join(import.meta.dirname, '..');
let base: Base;
const fresh = () => {
  const b = structuredClone(base);
  b.checks = [];
  return b;
};
const who = { by: 'тест второго ключа', kind: 'agent' as const, at: '2026-10-10' };
const keyOf = (b: Base, pred: (r: ReturnType<typeof records>[number]) => boolean) => records(b).find(pred)!.key;
const ORIGIN = 'origin:p-isaak|p-avraam|father|p';

beforeAll(() => {
  base = loadBase();
});

describe('загрузчик: происхождение файлов и реестр источников (Д3-1)', () => {
  it('prov каждого файла сохраняется; реестр источников загружен', () => {
    expect(base.files?.['actors/04-abraham.json']?.status).toBe('draft');
    expect(base.files?.['origins.json']?.status).toBe('draft');
    expect(base.files?.['lines/luke.json']?.status).toBe('draft');
    expect(Object.keys(base.files ?? {}).filter((f) => f.startsWith('actors/'))).toHaveLength(base.volumes.length);
    expect(base.sources?.some((s) => s.id === 'src-synodal')).toBe(true);
    // журнал подписей живой: в нём бывают настоящие подписи второго ключа;
    // проверяем, что он загружен и ни одна подпись не устарела
    expect(Array.isArray(base.checks)).toBe(true);
    expect(validateChecks(base)).toEqual([]);
  });

  it('загрузчик работает из папки с пробелами и русскими буквами', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'база проба '));
    try {
      const dir = join(tmp, 'папка с пробелом', 'base');
      cpSync(join(ROOT, 'base'), dir, { recursive: true });
      const b = loadBase(dir);
      expect(b.volumes.reduce((n, v) => n + v.actors.length, 0)).toBe(base.volumes.reduce((n, v) => n + v.actors.length, 0));
      expect(b.files?.['actors/04-abraham.json']).toEqual(base.files?.['actors/04-abraham.json']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('база из переноса без файлов — все записи черновики, карантин — карантин', () => {
    const c = admission(buildBase(), 'probe').counts;
    expect(c.all.checked).toBe(0);
    expect(c.all.quarantine).toBeGreaterThan(0);
    expect(c.all.admitted).toBe(c.all.draft);
  }, 60_000);
});

describe('одна функция допуска для всех коллекций (Д3-1)', () => {
  it('черновик не попадает в сборку уровня «выпуск»: пусты все коллекции индекса и карточки', () => {
    const b = fresh();
    const idx = buildIndex(b, 'release');
    for (const k of ['actors', 'origins', 'unions', 'kin', 'readings', 'areas', 'members', 'redirects'] as const) expect(idx[k], k).toEqual([]);
    expect(idx.lines).toEqual({});
    expect(Object.values(buildCards(b, 'release').cards).every((c) => Object.keys(c.cards).length === 0)).toBe(true);
  });

  it('проба: черновики допущены, карантин — нет; каждый файл несёт плашку', () => {
    const b = fresh();
    const A = admission(b, 'probe');
    const facts = b.volumes.flatMap((v) => v.actors.flatMap((a) => a.facts));
    expect(facts.filter((f) => f.prov?.status === 'quarantine').some((f) => A.ok(f))).toBe(false);
    expect(facts.filter((f) => f.prov?.status !== 'quarantine').every((f) => A.ok(f))).toBe(true);
    const idx = buildIndex(b, A);
    expect([idx.admit, (idx as any).banner]).toEqual(['probe', PROBE_BANNER]);
    for (const c of Object.values(buildCards(b, A).cards)) expect([c.admit, c.banner]).toEqual(['probe', PROBE_BANNER]);
    const rel = buildIndex(b, 'release');
    expect(rel.admit).toBe('release');
    expect('banner' in rel).toBe(false);
  });

  it('проба не пишется в папку выпуска, выпуск — в папку пробы', () => {
    expect(() => assertOut('probe', OUT_DIR.release)).toThrow(/ошибка/);
    expect(() => assertOut('release', OUT_DIR.probe)).toThrow(/ошибка/);
    expect(() => assertOut('probe', OUT_DIR.probe)).not.toThrow();
  });

  it('файл в карантине не попадает целиком, и рёбра к его лицам тоже', () => {
    const b = fresh();
    b.files = { ...b.files, 'actors/04-abraham.json': { ...b.files!['actors/04-abraham.json'], status: 'quarantine' } };
    const A = admission(b, 'probe');
    const vol = b.volumes.find((v) => v.file === '04-abraham.json')!;
    expect(vol.actors.some((a) => A.ok(a))).toBe(false);
    expect(vol.actors.flatMap((a) => a.facts).some((f) => A.ok(f))).toBe(false);
    const ids = new Set(vol.actors.map((a) => a.id));
    expect(b.origins.filter((o) => ids.has(o.child) || ids.has(o.parent ?? '')).some((o) => A.ok(o))).toBe(false);
    expect(b.unions.filter((u) => ids.has(u.husband) || ids.has(u.wife)).some((u) => A.ok(u))).toBe(false);
    const idx = buildIndex(b, A);
    expect(idx.origins.some((o: any) => o.p === 'avraam' || o.c === 'avraam')).toBe(false);
    expect(idx.actors.some((a) => a.id === 'avraam')).toBe(false);
  });

  it('ребро к недопущенному лицу не попадает в выпуск, хотя само подписано', () => {
    const b = fresh();
    b.checks = [ORIGIN, 'actor:p-isaak', 'actor:p-avraam'].map((k) => sign(b, k, who));
    expect(admission(b, 'release').okKey(ORIGIN)).toBe(true);
    b.checks = b.checks.filter((c) => c.key !== 'actor:p-avraam');
    const A = admission(b, 'release');
    expect(A.okKey(ORIGIN)).toBe(false);
    expect(A.okKey('actor:p-isaak')).toBe(true);
    expect(buildIndex(b, A).origins).toEqual([]);
  });

  it('союз — только при обоих допущенных супругах; линия — только целиком', () => {
    const b = fresh();
    b.checks = ['union:u-avraam--sarra', 'actor:p-avraam'].map((k) => sign(b, k, who));
    expect(admission(b, 'release').okKey('union:u-avraam--sarra')).toBe(false);
    b.checks.push(sign(b, 'actor:p-sarra', who));
    expect(admission(b, 'release').okKey('union:u-avraam--sarra')).toBe(true);
    b.checks.push(sign(b, 'line:luke', who));
    expect(admission(b, 'release').okKey('line:luke')).toBe(false);
  });
});

describe('отпечаток проверки (Д3-2)', () => {
  const key = 'union:u-avraam--sarra';
  const rec = (b: Base) => records(b).find((r) => r.key === key)!;

  it('подпись даёт «проверено»; валидатор подписи принимает', () => {
    const b = fresh();
    b.checks = [sign(b, key, who)];
    expect(statusOf(rec(b), b).status).toBe('checked');
    expect(validateChecks(b)).toEqual([]);
    expect(b.checks[0].inputs?.verses.length).toBeGreaterThan(0);
    expect(b.checks[0].inputs?.sources).toEqual({ 'src-synodal': 'tools/bible/synodal.tsv' });
  });

  it('изменение записи после проверки снимает статус; валидатор — ошибка «изменилась после проверки»', () => {
    const b = fresh();
    b.checks = [sign(b, key, who)];
    b.unions.find((u) => u.id === 'u-avraam--sarra')!.terms[0].refs.push('Быт 12:5');
    const s = statusOf(rec(b), b);
    expect(s.status).toBe('draft');
    expect(s.stale).toBe('изменилось содержимое записи');
    expect(admission(b, 'release').okKey(key)).toBe(false);
    expect(validateChecks(b).map((x) => x.where)).toEqual([key]);
    const all = validate(b).filter((i) => i.level === 'error');
    expect(all.map((i) => [i.check, i.where])).toEqual([['проверка', key]]);
    expect(all[0].msg).toMatch(/изменилась после проверки/);
  });

  it('служебный prov в отпечаток не входит', () => {
    const b = fresh();
    b.checks = [sign(b, key, who)];
    b.unions.find((u) => u.id === 'u-avraam--sarra')!.prov = { by: 'кто-то', note: 'служебное' };
    expect(statusOf(rec(b), b).status).toBe('checked');
  });

  /** Текст с подменой: один стих, лишняя строка скобок или дефекта о стихе. */
  const env = (o: { verse?: [string, string]; bracket?: string; issue?: string }): TextEnv => {
    const f = fileEnv();
    const at = (id: string, book: string, ch: number, v: number) => id === `${book} ${ch}:${v}`;
    return {
      verse: (id) => (o.verse && id === o.verse[0] ? o.verse[1] : f.verse(id)),
      brackets: (b, c, v) => [...f.brackets(b, c, v), ...(o.bracket && at(o.bracket, b, c, v) ? ['правка совета'] : [])],
      issues: (b, c, v) => [...f.issues(b, c, v), ...(o.issue && at(o.issue, b, c, v) ? ['новый дефект'] : [])],
    };
  };

  it('отпечаток зависит только от стихов записи: правка своего стиха, своей строки скобок или дефекта — снимает', () => {
    const b = fresh();
    b.checks = [sign(b, key, who)];
    const own = b.checks[0].inputs!.verses[0];
    expect(own).toMatch(/^Быт /);
    expect(statusOf(rec(b), b, undefined, env({ verse: [own, 'другой текст'] })).stale).toMatch(/текст её стихов/);
    expect(statusOf(rec(b), b, undefined, env({ bracket: own })).stale).toMatch(/brackets\.tsv/);
    expect(statusOf(rec(b), b, undefined, env({ issue: own })).stale).toMatch(/source-issues\.tsv/);
  });

  it('правка чужого стиха, чужой строки скобок или дефекта подпись НЕ снимает', () => {
    const b = fresh();
    b.checks = [sign(b, key, who)];
    expect(b.checks[0].inputs!.verses).not.toContain('Пс 67:23');
    for (const o of [{ verse: ['Пс 67:23', 'другой текст'] as [string, string] }, { bracket: 'Пс 67:23' }, { issue: 'Пс 67:23' }, { bracket: 'Быт 1:6' }]) {
      expect(statusOf(rec(b), b, undefined, env(o)).status, JSON.stringify(o)).toBe('checked');
    }
  });

  it('смена версии своего источника снимает статус', () => {
    const b = fresh();
    b.checks = [sign(b, key, who)];
    b.sources = b.sources!.map((s) => (s.id === 'src-synodal' ? { ...s, version: 'новая' } : s));
    expect(statusOf(rec(b), b).stale).toMatch(/src-synodal/);
  });

  it('подпись без записи, подпись карантина, «проверено» без подписи — ошибки; составитель не подписывает', () => {
    const b = fresh();
    b.checks = [{ ...sign(b, key, who), key: 'union:нет-такого' }];
    expect(validateChecks(b).map((x) => x.msg).join('\n')).toMatch(/больше нет/);
    const q = keyOf(b, (r) => r.coll === 'fact' && r.rec.prov?.status === 'quarantine');
    expect(() => sign(b, q, who)).toThrow(/карантин/);
    const b2 = fresh();
    b2.files = { ...b2.files, 'kin.json': { ...b2.files!['kin.json'], status: 'checked' } };
    expect(validateChecks(b2).some((x) => /без подписи/.test(x.msg) && x.where.startsWith('kin:'))).toBe(true);
    expect(admission(b2, 'release').counts.kin.admitted).toBe(0);
    expect(() => sign(b, key, { ...who, by: b.files!['unions.json'].by })).toThrow(/составитель/);
  });

  it('повторная подпись хранит прежнюю в истории', () => {
    const b = fresh();
    b.checks = [sign(b, key, { ...who, at: '2026-10-01' })];
    const again = sign(b, key, { by: 'другой проверяющий', kind: 'human', at: '2026-10-10' });
    expect(again.history?.map((h) => [h.by, h.at])).toEqual([['тест второго ключа', '2026-10-01']]);
    expect(again.kind).toBe('human');
  });

  it('в базе на диске подписей, которые не действуют, нет', () => {
    expect(validateChecks(base)).toEqual([]);
  });
});
