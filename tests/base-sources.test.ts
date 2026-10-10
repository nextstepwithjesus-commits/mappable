/**
 * Реестр источников в базе (Д3-3) и права (Д3-5): 09 § 5.5; Д-база, Б-3, Б-5; рецензия данных на 09, № 9, 10.
 * Реестр загружается и проверяется; у записи — источники по реестру (у текста — src-synodal); добавление источника,
 * который уже был у записи, подпись не снимает, новый источник — снимает; в выпуск не попадает запись, чей источник
 * не разрешает распространение; NOTICE собирается из реестра.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadBase, validate } from '../tools/base/validate.ts';
import { admission, records, recordSources, sign, statusOf } from '../tools/base/admit.ts';
import { independentCount, noticeEntries, noticeText, sourceRoots, spdxOk, validateRegistry } from '../tools/base/sources.ts';
import { buildIndex } from '../tools/base/bundle.ts';
import type { Base } from '../tools/base/migrate.ts';
import type { Source } from '../tools/base/types.ts';

let base: Base;
const fresh = () => {
  const b = structuredClone(base);
  b.checks = [];
  return b;
};
const who = { by: 'тест второго ключа', kind: 'agent' as const, at: '2026-10-10' };
const KEY = 'union:u-avraam--sarra';
const union = (b: Base) => b.unions.find((u) => u.id === 'u-avraam--sarra')! as any;
const rec = (b: Base, key = KEY) => records(b).find((r) => r.key === key)!;
const src = (b: Base, id: string) => b.sources!.find((s) => s.id === id)!;
const msgs = (b: Base) => validateRegistry(b).map((x) => `${x.where}: ${x.msg}`).join('\n');

beforeAll(() => {
  base = loadBase();
});

describe('реестр источников загружен и чист (Д3-3)', () => {
  it('реестр без ошибок; у каждого файла base/ — источники по реестру', () => {
    expect(validateRegistry(base)).toEqual([]);
    const files = Object.keys(base.files ?? {}).filter((f) => f !== 'anchors.json' && f !== 'sources.json' && f !== 'checks.json');
    for (const f of files) expect(base.fileSources?.[f], f).toEqual(['src-synodal']);
  });

  it('в реестре — источники, на которые уже опираются документы (находки, Б-3, Б-5)', () => {
    const ids = new Set(base.sources!.map((s) => s.id));
    for (const id of ['src-osm', 'src-barrington', 'src-wlc', 'src-lxx', 'src-tr', 'src-sblgnt', 'src-csl', 'src-etopo', 'src-copernicus',
      'src-openbible-geo', 'src-natural-earth', 'src-pleiades', 'src-awmc', 'src-font-literata', 'src-font-golos', 'src-font-noto-serif-hebrew']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const s of base.sources!) {
      expect(spdxOk(s.spdx), `${s.id}: ${s.spdx}`).toBe(true);
      expect(typeof s.redistribute, s.id).toBe('boolean');
    }
  });

  it('зависимости записаны: OpenBible — из OpenStreetMap; AWMC и Pleiades — из Barrington', () => {
    const reg = new Map(base.sources!.map((s) => [s.id, s]));
    expect(sourceRoots('src-openbible-geo', reg)).toEqual(['src-osm']);
    expect(sourceRoots('src-awmc', reg)).toEqual(['src-barrington', 'src-osm']);
    expect(sourceRoots('src-pleiades', reg)).toEqual(['src-barrington']);
    // совпадение Pleiades и Barrington — одно подтверждение, не два
    expect(independentCount(['src-pleiades', 'src-barrington'], reg)).toBe(1);
    expect(independentCount(['src-synodal', 'src-pleiades'], reg)).toBe(2);
  });

  it('src-synodal закрыт: общественное достояние и MIT сборника, с надписью; JSword — только сверка', () => {
    const s = src(base, 'src-synodal');
    expect(s.spdx).toBe('LicenseRef-PublicDomain AND MIT');
    expect(s.redistribute).toBe(true);
    expect(s.attributionRequired).toBe(true);
    expect(s.attribution).toMatch(/Scrollmapper.*MIT/);
    expect(s.license).not.toMatch(/провер/);
    const j = src(base, 'src-jsword');
    expect([j.use, j.redistribute, j.spdx]).toEqual(['check-only', false, 'LGPL-2.1-or-later']);
    expect(src(base, 'src-stepbible').redistribute).toBe(false);
  });
});

describe('проверки реестра ловят ошибки (Д3-3)', () => {
  const withSrc = (patch: (xs: Source[]) => Source[]) => {
    const b = fresh();
    b.sources = patch(b.sources!);
    return b;
  };
  it('повтор номера, неизвестная зависимость, петля', () => {
    expect(msgs(withSrc((xs) => [...xs, { ...xs[0] }]))).toMatch(/повторяется/);
    expect(msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-awmc' ? { ...s, dependsOn: ['src-нет'] } : s))))).toMatch(/нет в реестре/);
    const loop = msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-barrington' ? { ...s, dependsOn: ['src-pleiades'] } : s))));
    expect(loop).toMatch(/петля зависимостей/);
  });
  it('«проверить» у основы; надпись обязательна, а её нет; NOASSERTION у выпускаемого; сверка с правом выпуска; не SPDX', () => {
    expect(msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-synodal' ? { ...s, license: 'проверить при выпуске' } : s))))).toMatch(/src-synodal.*не проверено/);
    expect(msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-osm' ? { ...s, attribution: undefined } : s))))).toMatch(/src-osm.*надписи/);
    expect(msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-etopo' ? { ...s, spdx: 'NOASSERTION' } : s))))).toMatch(/src-etopo.*не подтверждена/);
    expect(msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-tr' ? { ...s, redistribute: true } : s))))).toMatch(/src-tr.*только для сверки/);
    expect(msgs(withSrc((xs) => xs.map((s) => (s.id === 'src-tr' ? { ...s, spdx: 'общественное достояние' } : s))))).toMatch(/не выражение SPDX/);
  });
  it('неизвестный источник у записи и у файла — ошибка валидатора', () => {
    const b = fresh();
    union(b).sources = ['src-нет-такого'];
    expect(msgs(b)).toMatch(new RegExp(`${KEY}: источник «src-нет-такого»`));
    expect(validate(b).some((i) => i.level === 'error' && i.check === 'источник')).toBe(true);
    const b2 = fresh();
    b2.fileSources = { ...b2.fileSources, 'kin.json': ['src-нет-такого'] };
    expect(msgs(b2)).toMatch(/base\/kin\.json: источник «src-нет-такого»/);
  });
});

describe('источник у записи и подпись проверки (Д3-3; Д3-2)', () => {
  it('у записи текста — src-synodal; у записи с источником — и он', () => {
    const b = fresh();
    expect(recordSources(rec(b), b)).toEqual(['src-synodal']);
    union(b).sources = ['src-openbible-geo'];
    expect(recordSources(rec(b), b)).toEqual(['src-openbible-geo', 'src-synodal']);
  });

  it('запись того же источника явно (src-synodal) подпись НЕ снимает; новый источник — снимает с причиной', () => {
    const b = fresh();
    b.checks = [sign(b, KEY, who)];
    union(b).sources = ['src-synodal'];
    expect(statusOf(rec(b), b).status).toBe('checked');
    union(b).sources = ['src-synodal', 'src-openbible-geo'];
    expect(statusOf(rec(b), b).stale).toMatch(/источник src-openbible-geo/);
  });

  it('смена источника файла по умолчанию снимает подписи записей файла', () => {
    const b = fresh();
    b.checks = [sign(b, KEY, who)];
    b.fileSources = { ...b.fileSources, 'unions.json': ['src-synodal', 'src-pleiades'] };
    expect(statusOf(rec(b), b).stale).toMatch(/src-pleiades/);
  });

  it('проверенные записи настоящей базы: подписи целы', () => {
    const A = admission(base, 'release');
    expect(A.counts.all.stale).toBe(0);
    expect(A.counts.all.checked).toBe((base.checks ?? []).length);
  });
});

describe('права: в выпуск не попадает запись, источник которой не разрешает распространение (Д3-5)', () => {
  it('проверенная запись с источником «не распространять» в выпуск не попадает; проба её видит', () => {
    const b = fresh();
    union(b).sources = ['src-stepbible'];
    b.checks = [KEY, 'actor:p-avraam', 'actor:p-sarra'].map((k) => sign(b, k, who));
    expect(statusOf(rec(b), b).status).toBe('checked');
    const A = admission(b, 'release');
    expect(A.okKey(KEY)).toBe(false);
    expect(A.rights.get(KEY)).toEqual(['src-stepbible']);
    expect(A.counts.union.rights).toBe(1);
    expect(buildIndex(b, A).unions.some((u) => u.h === 'avraam' && u.w === 'sarra')).toBe(false);
    // то же без запрета — попадает
    const b2 = fresh();
    b2.checks = [KEY, 'actor:p-avraam', 'actor:p-sarra'].map((k) => sign(b2, k, who));
    expect(admission(b2, 'release').okKey(KEY)).toBe(true);
    expect(admission(b, 'probe').okKey(KEY)).toBe(true);
  });

  it('источник без права у лица закрывает и записи, которые от него зависят', () => {
    const b = fresh();
    const sara = b.volumes.flatMap((v) => v.actors).find((a) => a.id === 'p-sarra')! as any;
    sara.sources = ['src-jsword'];
    b.checks = [KEY, 'actor:p-avraam', 'actor:p-sarra'].map((k) => sign(b, k, who));
    const A = admission(b, 'release');
    expect(A.okKey('actor:p-sarra')).toBe(false);
    expect(A.okKey(KEY)).toBe(false);
  });

  it('источник, которого нет в реестре, тоже не выпускается', () => {
    const b = fresh();
    union(b).sources = ['src-нет-такого'];
    b.checks = [KEY, 'actor:p-avraam', 'actor:p-sarra'].map((k) => sign(b, k, who));
    expect(admission(b, 'release').okKey(KEY)).toBe(false);
  });

  it('настоящий выпуск: у каждой допущенной записи все источники разрешают распространение', () => {
    const A = admission(base, 'release');
    const reg = new Map(base.sources!.map((s) => [s.id, s]));
    const admitted = records(base).filter((r) => A.ok(r.rec));
    expect(admitted.length).toBeGreaterThan(0);
    for (const r of admitted) for (const id of recordSources(r, base)) expect(reg.get(id)?.redistribute, `${r.key} ← ${id}`).toBe(true);
  });
});

describe('NOTICE из реестра (Д3-5)', () => {
  it('выпуск: текст Писания с надписью MIT и шрифты; источников сверки нет', () => {
    const A = admission(base, 'release');
    const n = noticeEntries(base, A);
    const ids = n.map((e) => e.id);
    expect(ids).toContain('src-synodal');
    for (const f of ['src-font-literata', 'src-font-golos', 'src-font-noto-serif-hebrew']) expect(ids).toContain(f);
    for (const no of ['src-jsword', 'src-stepbible', 'src-lxx', 'src-wlc']) expect(ids).not.toContain(no);
    const reg = new Map(base.sources!.map((s) => [s.id, s]));
    for (const e of n) {
      const s = reg.get(e.id)!;
      expect(s.redistribute, e.id).toBe(true);
      expect(e.spdx, e.id).not.toMatch(/провер|NOASSERTION/);
      if (s.attributionRequired) expect(e.attribution, e.id).toBeTruthy();
    }
    const txt = noticeText(n, 'release');
    expect(txt).toMatch(/Copyright \(c\) 2024 Scrollmapper, MIT License/);
    expect(txt).toMatch(/SIL Open Font License/);
  });

  it('у выпуска источник без надписи, которую требует лицензия, — ошибка сборки', () => {
    const b = fresh();
    b.sources = b.sources!.map((s) => (s.id === 'src-synodal' ? { ...s, attribution: undefined } : s));
    b.checks = structuredClone(base.checks ?? []);
    expect(() => noticeEntries(b, admission(b, 'release'))).toThrow(/src-synodal: нет надписи/);
  });
});
