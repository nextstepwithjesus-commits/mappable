/**
 * Задачи кода 02 § 3.18, вторая партия: труды и ссылки `works` (К-3), опоры в допуске (К-10), номер выпуска и журнал
 * изменений (К-12), сокращение номеров по таблице префиксов и кандидаты отдельным списком (К-6), кандидаты и степень
 * (К-13), начало речи (К-7), бюджеты всех пакетов (К-9), состав разбора по группам Г-1 (К-17).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildBase, type Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import { admission, COLL_FILES, records, rekey, sign, SERVICE_FILES, type Coll } from '../tools/base/admit.ts';
import { budgetCheck, buildCards, buildIndex, BUDGETS } from '../tools/base/bundle.ts';
import { citeIssues, missingGroups, noticeEntries, TRADITION_GROUP, validateRegistry } from '../tools/base/sources.ts';
import { fullId, ID_PREFIXES, prefixOf, redirectBack, redirectRow, shortId, type IdPrefix } from '../tools/base/prefixes.ts';
import { buildChanges, changeLine, digests, recordId, stampRelease, whyNotAdmitted } from '../tools/base/release.ts';
import { ANCHOR_REDIRECT_REASON } from '../tools/base/ids.ts';
import { K3_WORKS } from '../tools/base/corrections-k.ts';
import type { CheckEntry, Cite, Place, Source } from '../tools/base/types.ts';

const BASE_DIR = join(import.meta.dirname, '..', 'base');
const who = { by: 'тест второго ключа', kind: 'agent' as const, at: '2026-10-11' };
let base: Base;
/**
 * Снимок журнала подписей на время партии: только подписи названных партий (по полю `by`, у контрольного набора — и по
 * дате). Если запись позже переподписала другая партия, берётся последняя подпись своей партии из `history`. Так проверка
 * не зависит от будущих подписей (истории пакета 1 и дальше).
 */
const CONTROL = (c: { by: string; at: string }) => c.by === 'сверщик-агент' && c.at <= '2026-10-10';
const D1 = (c: { by: string }) => /Д-партия-1-второй-ключ/.test(c.by);
const snapshot = (b: Base, ...parties: ((c: { by: string; at: string }) => boolean)[]): Base => ({
  ...b,
  checks: (b.checks ?? []).flatMap((c) => {
    const ok = (x: { by: string; at: string }) => parties.some((p) => p(x));
    if (ok(c)) return [c];
    const h = [...(c.history ?? [])].reverse().find(ok);
    return h ? [{ ...h, key: c.key } as CheckEntry] : [];
  }),
});
/** Переходы К-2 и К-3 сверяются на прежних 103 подписях контрольного набора (без Д-партии 1 и последующих). */
const withoutD1 = (b: Base): Base => snapshot(b, CONTROL);
const copy = () => structuredClone(base);
const errs = (b: Base, check?: string) => validate(b).filter((i) => i.level === 'error' && (!check || i.check === check));
const reg = () => new Map((base.sources ?? []).map((s) => [s.id, s]));

beforeAll(() => {
  base = loadBase();
});

describe('труды w- и ссылки works (К-3)', () => {
  it('в реестре 23 труда: use citation, традиция из словаря, издание — в записи труда, не в ссылке', () => {
    const works = base.sources!.filter((s) => s.id.startsWith('w-'));
    // 10 трудов К-3 и 10 трудов хронологии Д6 (схемы царей и издания надписей для опор); Д-20: +3 труда альтернатив опор
    // (Finegan 1998, Yamauchi 1980 — Ездра при Артаксерксе II, Young 2004 — падение Иерусалима)
    expect(works).toHaveLength(23);
    for (const w of works) {
      expect([w.id, w.use, w.redistribute]).toEqual([w.id, 'citation', false]);
      expect(w.tradition!.length).toBeGreaterThan(0);
      for (const t of w.tradition!) expect(t in TRADITION_GROUP).toBe(true);
    }
    expect(base.sources!.find((s) => s.id === 'w-brown-birth-messiah')!.tradition).toEqual(['catholic', 'historical-critical']);
    expect(validateRegistry(base).filter((i) => i.level === 'error')).toEqual([]);
    // ни одной строки авторов не осталось; у каждого толкования наборов — ссылки на труды
    for (const r of base.readings) for (const x of r.readings) {
      expect('authors' in x).toBe(false);
      if (x.cert === 'interpretation') expect([r.id, x.id, (x.works ?? []).length > 0]).toEqual([r.id, x.id, true]);
    }
    // шаг K3 перенёс каждую строку прежних авторов: 10 строк → 11 ссылок
    expect(K3_WORKS.flatMap((x) => x.authors)).toHaveLength(10);
    expect(base.readings.flatMap((r) => r.readings.flatMap((x) => x.works ?? []))).toHaveLength(11);
  });

  it('подложенные ошибки ловятся: строки авторов, неизвестный труд, лишнее поле ссылки, труд без традиции, чужая традиция', () => {
    const b = copy();
    const rd = (id: string) => b.readings.find((r) => r.id === 'r-lk3-23')!.readings.find((x) => x.id === id)! as any;
    rd('mary').authors = ['Matthew Henry'];
    rd('levirate').works = [{ work: 'w-nobody', page: '1', weight: 'checked', checkedBy: 'agent' }];
    rd('adoption').works = [{ ...rd('adoption').works[0], year: '1990' }];
    const w = (id: string) => b.sources!.find((s) => s.id === id)!;
    delete w('w-henry-exposition').tradition;
    w('w-eusebius-historia').tradition = ['baptist' as any];
    w('w-theophylact-luke').use = 'reference';
    const e = validate(b).filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.msg}`).join('\n');
    expect(e).toMatch(/r-lk3-23: у прочтения «mary» авторы строками/);
    expect(e).toMatch(/труда «w-nobody» нет в реестре/);
    expect(e).toMatch(/лишнее поле «year»/);
    expect(e).toMatch(/w-henry-exposition: у труда нет традиции/);
    expect(e).toMatch(/традиция «baptist» не из словаря/);
    expect(e).toMatch(/w-theophylact-luke: номер «w-…» — только у труда/);
    // ссылка без страницы, с чужим весом и без «кто сверил»
    const bad = citeIssues([{ work: 'w-henry-exposition', page: ' ', weight: 'maybe', checkedBy: 'robot' }], reg(), 'тест').map((i) => i.msg).join('\n');
    expect(bad).toMatch(/нет страницы/);
    expect(bad).toMatch(/вес «maybe»/);
    expect(bad).toMatch(/кто сверил/);
  }, 60_000);

  it('запись с works на закрытый труд допускается, с sources на него — нет (02 § 5.2)', () => {
    const b = copy();
    const key = 'reading:r-lk3-23';
    expect(admission(b, 'release').okKey(key)).toBe(true);
    // все труды набора закрыты (redistribute: false) — запись всё равно идёт: works не источник материала
    for (const c of b.readings.find((r) => r.id === 'r-lk3-23')!.readings.flatMap((x) => x.works ?? [])) {
      expect(b.sources!.find((s) => s.id === c.work)!.redistribute).toBe(false);
    }
    (b.readings.find((r) => r.id === 'r-lk3-23') as any).sources = ['w-henry-exposition'];
    const A = admission(b, 'release');
    expect(A.okKey(key)).toBe(false);
    expect(A.rights.get(key)).toEqual(['w-henry-exposition']);
  });

  it('r-lk3-23, рёбра его прочтений и линия Луки остаются в выпуске; те же 75 записей; права не закрывают ни одной', () => {
    const A = admission(withoutD1(base), 'release');
    expect(A.okKey('reading:r-lk3-23')).toBe(true);
    // было 101; Д-р11: подписи контрольного набора actor:p-avraam, actor:p-sarra, actor:p-irod-antipa сняты — у форм имён исправлены ссылки (−20 записей)
    // 02 ред. 4.6 (Д-16): подписи контрольного набора actor:p-zhena-kaina и actor:p-samaryanin-iz-desyati-prokazhennykh сняты —
    // подпись безымянного стала записью descriptor со стихами (−6 записей: лица и их утверждения)
    expect(A.counts.all.admitted).toBe(75);
    const lk = records(base).filter((r) => r.key === 'reading:r-lk3-23' || r.key === 'line:luke' || r.rec.reading?.set === 'r-lk3-23');
    expect(lk.length).toBeGreaterThan(2);
    expect(lk.filter((r) => A.rights.has(r.key))).toEqual([]);
    // все рёбра линии Луки — без закрытых источников
    const luke = new Set((base.lines.luke.persons as { id: string }[]).map((p) => p.id));
    const lukeEdges = records(base).filter((r) => r.coll === 'origin' && luke.has(r.rec.child) && luke.has(r.rec.parent));
    expect(lukeEdges.length).toBeGreaterThanOrEqual(31);
    expect(lukeEdges.filter((r) => A.rights.has(r.key))).toEqual([]);
  });

  it('ссылки на труды — своя запись со своей подписью: без неё выпуск их не выводит, с ней — выводит; правка труда снимает подпись', () => {
    const key = 'reading:r-lk3-23#works';
    expect(records(base).find((r) => r.key === key)?.coll).toBe('cite');
    const ix = buildIndex(base, 'release');
    const r = ix.readings.find((x: any) => x.id === 'r-lk3-23')!;
    expect(r.r.some((x: any) => x.w)).toBe(false);
    expect(ix.works).toEqual([]);
    const b = copy();
    b.checks = [...b.checks!, sign(b, key, who)];
    const ix2 = buildIndex(b, 'release');
    expect(ix2.readings.find((x: any) => x.id === 'r-lk3-23')!.r.find((x: any) => x.id === 'levirate')!.w!.map((c: any) => c.w)).toEqual(['w-africanus-aristides', 'w-eusebius-historia', 'w-theophylact-luke']);
    expect(ix2.works.find((w: any) => w.id === 'w-theophylact-luke')!.tr).toEqual(['orthodox']);
    // издание и традиция — в подписи ссылок: правка записи труда снимает её
    b.sources!.find((s) => s.id === 'w-theophylact-luke')!.year = '1100';
    expect(admission(b, 'release').okKey(key)).toBe(false);
    expect(admission(b, 'release').okKey('reading:r-lk3-23')).toBe(true);
  });

  it('--rekey: подпись набора переносится только при совпадении отпечатка прежнего вида; ссылки на труды подписи не получают', () => {
    const entry = base.checks!.find((c) => c.key === 'reading:r-lk3-23')!;
    expect(entry.history!.at(-1)!.note).toMatch(/авторы строками → works/);
    // журнал до переноса: подпись набора — прежняя (из истории)
    const { note: _n, ...was } = entry.history!.at(-1)!;
    const oldChecks: CheckEntry[] = withoutD1(base).checks!.map((c) => (c.key === entry.key ? { ...was, key: c.key, ...(entry.history!.length > 1 && { history: entry.history!.slice(0, -1) }) } : c));
    const before = Object.assign(buildBase({ skip: ['K3'] }), { sources: base.sources, fileSources: base.fileSources, files: base.files });
    expect(before.readings.find((r) => r.id === 'r-lk3-23')!.readings.some((x: any) => x.authors)).toBe(true);
    const b = { ...copy(), checks: oldChecks };
    expect(admission(b, 'release').okKey('reading:r-lk3-23')).toBe(false);
    const r = rekey(b, undefined, before);
    expect(r.failed).toEqual([]);
    expect(r.moved).toEqual([{ from: 'reading:r-lk3-23', to: 'reading:r-lk3-23' }]);
    const after = { ...b, checks: r.entries };
    expect(admission(after, 'release').okKey('reading:r-lk3-23')).toBe(true);
    expect(admission(after, 'release').okKey('reading:r-lk3-23#works')).toBe(false);
    expect(admission(after, 'release').counts.all.admitted).toBe(75);
    // без сборки «до шага» подпись не переносится
    expect(rekey(b).moved).toEqual([]);
    // набор изменился не только заменой авторов — подпись не переносится
    const b2 = { ...copy(), checks: oldChecks };
    b2.readings.find((x) => x.id === 'r-lk3-23')!.note += ' правка';
    const r2 = rekey(b2, undefined, before);
    expect(r2.moved).toEqual([]);
    expect(r2.failed[0].why).toMatch(/не только заменой/);
  }, 120_000);
});

describe('каждый файл base/ — в коллекции допуска или в списке служебных; опоры — в допуске (К-10)', () => {
  it('файлы base/ по коллекциям', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.json')) files.push(relative(BASE_DIR, p));
      }
    };
    walk(BASE_DIR);
    const pats = Object.values(COLL_FILES);
    expect(files.filter((f) => !pats.some((p) => p.test(f)) && !SERVICE_FILES.some((p) => p.test(f)))).toEqual([]);
    // каждая запись живёт в файле своей коллекции
    for (const r of records(base)) expect([r.key, COLL_FILES[r.coll as Coll].test(r.file)]).toEqual([r.key, true]);
    expect(files).toContain('anchors.json');
  });

  it('22 опоры — с номерами an-, в допуске; прежние номера ведут на новые', () => {
    const an = records(base).filter((r) => r.coll === 'anchor');
    expect(an).toHaveLength(22);
    expect(an.every((r) => /^anchor:an-/.test(r.key))).toBe(true);
    expect(an.map((r) => r.key)).toContain('anchor:an-solomon-4');
    const red = new Map(base.redirects.map((r) => [r.from, r]));
    for (const a of base.anchors.anchors) {
      const old = a.id.replace(/^an-/, '');
      expect([old, red.get(old)?.to, red.get(old)?.reason]).toEqual([old, [a.id], ANCHOR_REDIRECT_REASON]);
    }
    // опора без подписи в выпуск не идёт; проба берёт её
    expect(admission(base, 'release').counts.anchor.admitted).toBe(0);
    expect(admission(base, 'probe').counts.anchor.admitted).toBe(22);
  });
});

describe('номер выпуска, переадресация с release, журнал изменений (К-12)', () => {
  it('у переадресации — поле release: проставляется один раз, неверный вид — ошибка', () => {
    const { items, stamped } = stampRelease(base.redirects, '2026.10.2');
    expect(stamped).toBe(base.redirects.length);
    expect(stampRelease(items, '2026.11.1').stamped).toBe(0);
    expect(stampRelease(items, '2026.11.1').items[0].release).toBe('2026.10.2');
    expect(() => stampRelease(items, '26.10')).toThrow(/2026\.10\.2/);
    const b = copy();
    b.redirects[0].release = 'весна';
    expect(errs(b, 'переадресация').map((i) => i.msg)).toEqual([expect.stringMatching(/номер выпуска «весна»/)]);
  });

  it('по номеру записи и двум выпускам строится строка «Что изменилось»', () => {
    const A1 = admission(base, 'probe');
    const d1 = digests(base, A1, '2026.10.1');
    const first = buildChanges(null, d1, [], () => '');
    expect(changeLine(first, 'p-avraam')).toBe('Вышла в выпуске 2026.10.1.');
    // второй выпуск: у Авраама сменилось поле, ребро Исаака сменило конец (переадресация), Ной снят в карантин, новое лицо
    const b = copy();
    const avraam = b.volumes.flatMap((v) => v.actors).find((a) => a.id === 'p-avraam')!;
    avraam.disambig = 'сын Фарры';
    const noy = b.volumes.flatMap((v) => v.actors).find((a) => a.id === 'p-noy')!;
    noy.prov = { ...noy.prov, status: 'quarantine' };
    const edge = b.origins.find((o) => o.id === 'o-avraam--isaak')!;
    edge.id = 'o-test--isaak';
    const red = [{ from: 'o-avraam--isaak', to: ['o-test--isaak'], reason: 'тест', refs: [], at: '2026-10-11', release: '2026.10.2' }];
    const A2 = admission(b, 'probe');
    const ch = buildChanges(d1, digests(b, A2, '2026.10.2'), red, (id) => whyNotAdmitted(b, A2, id));
    expect(changeLine(ch, 'p-avraam')).toBe('Изменена в выпуске 2026.10.2 (с выпуска 2026.10.1): disambig.');
    expect(changeLine(ch, 'o-avraam--isaak')).toBe('С выпуска 2026.10.2 номер ведёт на o-test--isaak.');
    expect(changeLine(ch, 'o-test--isaak')).toBe('Добавлена в выпуске 2026.10.2.');
    expect(changeLine(ch, 'p-noy')).toBe('Снята в выпуске 2026.10.2: карантин.');
    expect(changeLine(ch, 'p-isaak')).toBe('Не изменилась с выпуска 2026.10.1.');
    expect(recordId({ key: 'reading:r-lk3-23#works', coll: 'cite', rec: {} })).toBe('r-lk3-23#works');
  }, 120_000);
});

describe('сокращение номеров по таблице префиксов (К-6)', () => {
  it('обратное восстановление даёт исходный номер для всех номеров базы', () => {
    const ids = [
      ...base.volumes.flatMap((v) => v.actors.map((a) => a.id)), ...base.unions.map((u) => u.id), ...base.origins.map((o) => o.id!),
      ...base.kin.map((k) => k.id!), ...base.readings.map((r) => r.id), ...base.areas.map((a) => a.id), ...base.epochs.map((e) => e.id),
      ...base.anchors.anchors.map((a: any) => a.id), ...base.sources!.map((s) => s.id),
      ...base.volumes.flatMap((v) => v.actors.flatMap((a) => a.facts.map((f) => f.id!))),
    ];
    for (const id of ids) {
      const p = prefixOf(id)!;
      expect([id, p in ID_PREFIXES]).toEqual([id, true]);
      expect(fullId(shortId(id, p), p)).toBe(id);
    }
    // прежнее slice(2) портило двух-трёхбуквенные префиксы — теперь чужой префикс — ошибка, а не порча
    expect(() => shortId('era-judges', 'p-' as IdPrefix)).toThrow();
    expect(shortId('era-judges', 'era-')).toBe('judges');
    expect(prefixOf('lm-904')).toBe('lm-');
  });

  it('переадресация в пакете: строка лиц — короткая, иначе полные номера; восстановление точное', () => {
    for (const r of [...base.redirects, { from: 'p-a', to: ['p-b', 'p-c'] }]) {
      expect(redirectBack(redirectRow(r.from, r.to))).toEqual({ from: r.from, to: r.to });
    }
    expect(redirectRow('judges', ['era-judges'])).toEqual(['judges', ['era-judges'], 0]);
    expect(redirectRow('p-iliy-otets-marii', ['p-iliy-syn-matfata'])).toEqual(['iliy-otets-marii', ['iliy-syn-matfata']]);
    const ix = buildIndex(base, 'probe');
    for (const row of ix.redirects as any[]) expect(base.redirects.some((r) => r.from === redirectBack(row).from)).toBe(true);
  }, 60_000);

  it('ребро с кандидатами — не ребро, а строка отдельного списка; кандидаты — в зависимостях допуска', () => {
    const b = copy();
    const o = b.origins.find((x) => x.id === 'o-avraam--isaak')!;
    delete o.parent;
    o.candidates = ['p-avraam', 'p-nakhor'];
    expect(errs(b, 'кандидаты')).toEqual([]);
    const ix = buildIndex(b, 'probe');
    expect(ix.origins.some((x: any) => x.c === 'isaak' && x.r === 'f' && !x.p)).toBe(false);
    expect(ix.cand.find((x: any) => x.c === 'isaak')!.k).toEqual(['avraam', 'nakhor']);
    expect(records(b).find((r) => r.key === `origin:${o.id}`)!.deps).toEqual(expect.arrayContaining(['actor:p-avraam', 'actor:p-nakhor']));
  });
});

describe('кандидаты, степень, слово текста, начало речи — проверки (К-13, К-7)', () => {
  it('подложенные ошибки ловятся', () => {
    const b = copy();
    const o = (c: string, p: string) => b.origins.find((x) => x.child === c && x.parent === p)!;
    const a = o('p-isaak', 'p-avraam');
    a.candidates = ['p-avraam']; // с родителем и одним кандидатом
    o('p-iakov', 'p-isaak').degree = 'inferred'; // степень не у «предка»
    const s = o('p-sarra', 'p-farra');
    s.saidBy = { ...s.saidBy!, speechStart: 'Быт 21:1' }; // начало речи — в другой главе
    const t = o('p-iosif', 'p-iakov');
    t.kind = 'text-word';
    t.words = [{ text: 'сын', ref: 'Быт 30:24' }]; // слово без говорящего
    const e = errs(b).map((i) => `${i.check}: ${i.msg}`).join('\n');
    expect(e).toMatch(/кандидаты: у ребра с кандидатами родитель не выбирается/);
    expect(e).toMatch(/кандидаты: кандидатов меньше двух/);
    expect(e).toMatch(/степень: степень \(degree\) — только у вида «предок»/);
    expect(e).toMatch(/по словам: начало речи Быт 21:1 — не стих той же главы/);
    expect(e).toMatch(/по словам: у слова «сын» \(Быт 30:24\) нет говорящего/);
    // начало речи в той же главе, но говорящий там не назван
    const b2 = copy();
    const s2 = b2.origins.find((x) => x.child === 'p-sarra' && x.parent === 'p-farra')!;
    s2.saidBy = { ...s2.saidBy!, speechStart: 'Быт 20:3' };
    expect(errs(b2, 'по словам').map((i) => i.msg).join()).toMatch(/не назван в начале речи Быт 20:3/);
    // верное начало речи — без ошибок
    s2.saidBy = { ...s2.saidBy!, speechStart: 'Быт 20:11' };
    expect(errs(b2, 'по словам')).toEqual([]);
  }, 60_000);
});

describe('бюджеты всех пакетов (К-9)', () => {
  it('каждый пакет пробы — с бюджетом и в нём; файл без бюджета — ошибка', () => {
    const b = buildBase();
    const sizes: Record<string, { raw: number; gz: number }> = {};
    const put = (rel: string, v: unknown) => {
      const s = JSON.stringify(v);
      sizes[rel] = { raw: s.length, gz: gzipSync(s, { level: 9 }).length };
    };
    put('index.json', buildIndex(b, 'probe'));
    for (const [f, c] of Object.entries(buildCards(b, 'probe').cards)) put(`cards/${f}`, c);
    const r = budgetCheck(sizes);
    expect(r.over).toEqual([]);
    expect(r.packages.find((p) => p.file === 'index.json')!.required).toBe(true);
    expect(budgetCheck({ 'tiles/x.bin': { raw: 1, gz: 1 } }).over[0]).toMatchObject({ file: 'tiles/x.bin', budget: null });
    expect(budgetCheck({ 'cards/08-levi.json': { raw: 1, gz: 65 * 1024 } }).over).toHaveLength(1);
    // выгрузка «Тождества лиц» (К-19) — свой бюджет 32 КБ
    expect(BUDGETS.map((x) => x.max / 1024)).toEqual([200, 64, 96, 96, 64, 32]);
  }, 120_000);
});

describe('состав разбора по четырём группам Г-1; закрытый словарь традиций (К-17)', () => {
  const R = () => {
    const m = new Map<string, Source>((base.sources ?? []).map((s) => [s.id, s]));
    return m;
  };
  const c = (work: string, weight: Cite['weight'] = 'checked'): Cite => ({ work, page: '1', weight, checkedBy: 'agent' });
  it('группа есть в works или в notFound; ✱ — не голос', () => {
    // Лк 3:23: православные (Феофилакт), католическая (Августин), протестантская (Henry), историко-критическая (Brown)
    expect(missingGroups([c('w-theophylact-luke'), c('w-augustine-de-consensu'), c('w-henry-exposition'), c('w-brown-birth-messiah')], undefined, R())).toEqual([]);
    expect(missingGroups([c('w-henry-exposition'), c('w-macarthur-royal-lineage')], undefined, R())).toEqual(['orthodox', 'catholic', 'historical-critical']);
    expect(missingGroups([c('w-henry-exposition')], ['orthodox', 'catholic', 'historical-critical'], R())).toEqual([]);
    expect(missingGroups([c('w-brown-birth-messiah', 'excluded'), c('w-henry-exposition')], undefined, R())).toEqual(['orthodox', 'catholic', 'historical-critical']);
    // словарь: jewish — вне четырёх групп
    expect(TRADITION_GROUP.jewish).toBeNull();
    expect(Object.keys(TRADITION_GROUP).sort()).toEqual(['anglican', 'catholic', 'evangelical', 'historical-critical', 'jewish', 'lutheran', 'orthodox', 'reformed']);
  });
});

describe('места: тип, допуск, проверки до первой записи; источник координат — номер реестра (К-11, К-14)', () => {
  const place = (): Place => ({
    id: 'l-vefil', kind: 'settlement',
    names: [
      { id: 'l-vefil#n1', form: 'Вефиль', type: 'main', refs: [{ ref: 'Быт 28:19', timeBasis: 'story' }] },
      { id: 'l-vefil#n2', form: 'Луз', type: 'former', refs: [{ ref: 'Быт 28:19', timeBasis: 'former-by-verse' }] },
    ],
    positions: [
      { id: 'l-vefil#pos1', label: 'Beitin', lat: 31.93, lon: 35.24, coordSource: { source: 'src-openbible-geo' }, source: 'src-openbible-geo' },
      { id: 'l-vefil#pos2', label: 'Beitin', lat: 31.93, lon: 35.24, coordSource: { source: 'src-wikidata', id: 'Q0' }, source: 'src-openbible-geo' },
    ],
  });

  it('пробный справочник пакета 2 (10 § 4.2.3): места, упоминания и пути — проверка без ошибок', () => {
    // коллекция зарегистрирована до первой записи (К-11); первые записи — tools/places/pilot.py, черновик без подписей
    expect(base.places!.length).toBeGreaterThan(300);
    expect(base.placeMentions!.length).toBeGreaterThan(600);
    expect(base.routes!.map((r) => r.id).sort()).toEqual(['rt-iskhod-do-chermnogo-morya', 'rt-put-avrama']);
    for (const c of ['место', 'упоминание места', 'путь']) expect(errs(base, c)).toEqual([]);
    // у каждого внесённого положения источник координат — в реестре (Р-10; Д-10): остальные точки ждут записи реестра
    const r = reg();
    for (const p of base.places!) for (const x of p.positions ?? []) expect([p.id, r.has(x.coordSource.source)]).toEqual([p.id, true]);
    // подписей нет: записи — черновик до второго ключа
    expect(base.places!.every((p) => p.prov?.status === 'draft')).toBe(true);
  });

  it('упоминания и пути: подложенные ошибки ловятся (02 § 3.13.5, § 3.13.8; 05 § 3.5)', () => {
    const b = copy();
    const m0 = b.placeMentions!.find((m) => m.place === 'l-kharran' && m.ref === 'Быт 11:31')!;
    b.placeMentions = [
      { ...m0, id: 'lm-x1' },
      { ...m0, form: 'Харрана', n: 2 },
      { ...m0, id: m0.id, form: 'Ханаан', n: 1 },
      { ...m0, id: 'lm-900001', place: 'l-nowhere' },
      { ...m0, id: 'lm-900002', cert: 'interpretation' as any },
      { ...m0, id: 'lm-900003', cert: 'inference' },
      { ...m0, id: 'lm-900004', role: 'born' as any },
      { ...m0, id: 'lm-900005', ref: 'Быт 12:6', form: 'Сихема', n: 1, place: undefined, candidates: [] },
    ];
    const e = errs(b, 'упоминание места').map((i) => `${i.where}: ${i.msg}`).join('\n');
    for (const x of [
      /lm-x1: номер упоминания — вида «lm-<число>»/, /номер упоминания повторяется/, /формы «Харрана» нет среди слов-оснований стиха Быт 11:31 \(вхождение 2\)/,
      /формы «Ханаан» нет среди слов-оснований/, /нет места «l-nowhere»/, /уровень связи «interpretation»/, /связь «вывод» — со стихами вывода/,
      /роль «born» не из словаря/, /нет ни места, ни кандидатов/, /у имени «Харран» стих Быт 12:4 без упоминания места/,
    ]) expect(e).toMatch(x);
    // слово в скобках вида «в» — не основание: «[жили]» (Быт 12:6)
    const c = copy();
    c.placeMentions = [{ ...m0, id: 'lm-900006', ref: 'Быт 12:6', form: 'жили', n: 1 }];
    expect(errs(c, 'упоминание места').map((i) => i.msg).join('\n')).toMatch(/формы «жили» нет среди слов-оснований стиха Быт 12:6/);

    const d = copy();
    const rt = structuredClone(d.routes!.find((r) => r.id === 'rt-put-avrama')!);
    const v = rt.variants[0];
    v.stops.push({ n: 13, place: 'l-nowhere', ref: 'Быт 23:2', words: 'Хеврон', kind: 'stop' });
    v.stops.push({ n: 14, land: 'l-kharran', ref: 'Быт 11:31', words: 'Харрана', kind: 'stop' });
    v.stops.push({ n: 15, place: 'l-sikhem', ref: 'Быт 12:6', words: 'жили Хананеи', kind: 'stop' });
    v.stops.push({ n: 3, place: 'l-sikhem', ref: 'Быт 12:6', words: 'Сихема', kind: 'camp' as any });
    v.segments.push({ from: 3, to: 99, mode: 'land', words: 'прошел', ref: 'Быт 12:6' });
    v.segments.push({ from: 4, to: 5, mode: 'land', words: 'был голод в той земле', ref: 'Быт 12:10' });
    d.routes = [rt, { ...rt, id: 'RT-bad' }];
    const f = errs(d, 'путь').map((i) => `${i.where}: ${i.msg}`).join('\n');
    for (const x of [
      /нет места «l-nowhere»/, /«l-kharran» — не земля и не вода/, /слов «жили Хананеи» нет среди слов-оснований Быт 12:6/,
      /номер стоянки 3 повторяется/, /вид стоянки «camp» не из словаря/, /отрезок 3 → 99: нет такой стоянки/,
      /отрезок 4 → 5 \(Быт 12:10\): нет слов перехода/, /RT-bad: номер пути — вида «rt-…»/,
    ]) expect(f).toMatch(x);
  });

  it('место с закрытой и открытой точкой допущено; закрытая точка снята; в NOTICE — только источник открытой (К-14, К-15)', () => {
    const b = copy();
    b.places = [place()];
    expect(errs(b, 'место')).toEqual([]);
    b.checks = [...b.checks!, sign(b, 'place:l-vefil', who)];
    const A = admission(b, 'release');
    expect(A.okKey('place:l-vefil')).toBe(true);
    const seen = A.view(b.places[0]);
    expect(seen.positions!.map((p) => p.id)).toEqual(['l-vefil#pos1']);
    const notice = noticeEntries(b, A).map((e) => e.id);
    expect(notice).toContain('src-openbible-geo');
    expect(notice).not.toContain('src-wikidata');
    // в пробе точка не снимается
    expect(admission(b, 'probe').view(b.places[0]).positions).toHaveLength(2);
  });

  it('подложенные ошибки мест ловятся', () => {
    const b = copy();
    const p = place();
    p.kind = 'part' as any;
    p.names[1].cert = 'interpretation' as any;
    p.names[1].id = 'l-vefil#n1';
    p.positions![0].lat = 120;
    p.links = [
      { id: 'l-vefil#link1', kind: 'other-name' as any, to: 'l-luz', cert: 'interpretation', refs: [] },
      { id: 'l-vefil#link2', kind: 'inferred-same', to: 'l-vefil', cert: 'scripture', refs: ['Быт 28:19'] },
    ];
    p.labelPoint = { lat: 1, lon: 1, by: 'x', source: 'src-osm' };
    p.match = { modernId: 'x', method: 'manual', by: 'x', at: '2026-10-11', otherNameOf: 'l-nowhere' };
    b.places = [p, { ...place(), id: 'L-bad', names: [] } as Place];
    const e = errs(b, 'место').map((i) => `${i.where}: ${i.msg}`).join('\n');
    for (const m of [
      /вид «part» не из словаря/, /имя l-vefil#n1 уровня «interpretation»/, /номер части «l-vefil#n1» повторяется/, /координаты вне WGS 84/,
      /вид связи «other-name» не из словаря/, /нет места «l-luz»/, /«то же, что» — уровень «вывод»/, /точка подписи — только у земли и воды/,
      /ручное сопоставление со сводкой — со вторым ключом/, /нет места «l-nowhere»/, /L-bad: номер места — вида «l-…»/, /L-bad: нет ни одного имени со стихом/,
    ]) expect(e).toMatch(m);
  });
});
