/**
 * Номера записей и перенос подписей — первая партия задач кода 02 § 3.18 (К-1, К-2, К-4, К-15, К-16; 02 § 3.3, § 3.17).
 *   - base/ids.json: номер выдаётся один раз и хранится; пересборка только дописывает; ключ — содержательный, по записи
 *     из data/ до шагов правки; совпадение ключей — ошибка сборки;
 *   - `base:mark --rekey`: подписи переносятся по отпечатку без номера; до и после допущены одни и те же записи;
 *   - redirects.json только дописывается; две пересборки подряд — те же файлы;
 *   - допуск по частям: закрытая часть снимается, запись остаётся; ссылка на запись того же вида — не зависимость;
 *     поле `works` выпуск не закрывает.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBase, type Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import {
  admission, blockedSources, closedPart, legacyKey, openView, records, recordSources, rekey, sign,
} from '../tools/base/admit.ts';
import { buildIndex } from '../tools/base/bundle.ts';
import { ANCHOR_REDIRECT_REASON, EPOCH_REDIRECT_REASON, ORIGIN_REDIRECT_REASON, Issuer, IDS_FILE, loadIds, mergeRedirects, PREFIX, saveIds, serializeIds, type IdEntry } from '../tools/base/ids.ts';
import type { Step } from '../tools/base/corrections.ts';
import { canon } from '../tools/base/project.ts';
import type { CheckEntry, Redirect } from '../tools/base/types.ts';

const BASE_DIR = join(import.meta.dirname, '..', 'base');
const who = { by: 'тест второго ключа', kind: 'agent' as const, at: '2026-10-11' };
let base: Base;
/** Журнал подписей без подписей Д-партии 1 (второй ключ, Д-партия-1-второй-ключ.md): переходы К-2 и К-3 сверяются на прежних 103. */
const withoutD1 = (b: Base): Base => ({ ...b, checks: (b.checks ?? []).filter((c) => !/Д-партия-1/.test(c.by)) });
const fresh = () => {
  const b = structuredClone(base);
  b.checks = [];
  return b;
};
const diskRedirects = (): Redirect[] => JSON.parse(readFileSync(join(BASE_DIR, 'redirects.json'), 'utf8')).items;
const facts = (b: Base) => b.volumes.flatMap((v) => v.actors.flatMap((a) => a.facts.map((f) => ({ a, f }))));
const actorOf = (b: Base, id: string) => b.volumes.flatMap((v) => v.actors).find((a) => a.id === id)!;

beforeAll(() => {
  base = loadBase();
});

describe('таблица выданных номеров base/ids.json (К-1)', () => {
  it('у каждого ребра, утверждения, родства словами и эпохи — номер своего вида из таблицы', () => {
    const issued = new Map(base.ids!.map((e) => [e.id, e]));
    const all: [string, string | undefined][] = [
      ...base.origins.map((o) => ['origin', o.id] as [string, string | undefined]),
      ...facts(base).map(({ f }) => ['fact', f.id] as [string, string | undefined]),
      ...base.kin.map((k) => ['kin', k.id] as [string, string | undefined]),
      ...base.epochs.map((e) => ['epoch', e.id] as [string, string | undefined]),
      ...base.anchors.anchors.map((a: any) => ['anchor', a.id] as [string, string | undefined]),
      ...base.relations.map((r) => ['relation', r.id] as [string, string | undefined]),
    ];
    expect(all.filter(([, id]) => !id)).toEqual([]);
    expect(all.filter(([kind, id]) => !id!.startsWith(PREFIX[kind as keyof typeof PREFIX]))).toEqual([]);
    expect(all.filter(([kind, id]) => issued.get(id!)?.kind !== kind)).toEqual([]);
    expect(new Set(all.map(([, id]) => id)).size).toBe(all.length);
    // числа 02 § 3.3.1: рёбер 2 147, утверждений 16 274, родства 85, эпох 16, опор 22 (К-10); Д-партия 1: +6 утверждений
    // (4 примечания Д-5, 2 записи царицы Дан 5:10), родства −3 (сняты по Д-5 с переадресацией); вторая очередь Д-5:
    // +6 утверждений карточек тёзок, 6 отношений «возможно, то же лицо» (ar-); третья очередь: +2 (§ 23 у карточек царей)
    const n = (k: string) => all.filter(([kind]) => kind === k).length;
    expect([n('origin'), n('fact'), n('kin'), n('epoch'), n('anchor'), n('relation')]).toEqual([2147, 16288, 82, 16, 22, 6]);
    // каждый действующий номер — у записи; выбывший — со строкой переадресации
    expect(base.ids!.filter((e) => e.state === 'active').length).toBe(all.length);
    const red = new Set(base.redirects.map((r) => r.from));
    expect(base.ids!.filter((e) => e.state === 'retired').map((e) => [e.id, red.has(e.id)])).toEqual([['k-57', true], ['k-66', true], ['k-67', true]]);
  });

  it('номера рёбер смысловые (03 § 21.1), утверждений и родства — порядковые, эпох — era-', () => {
    expect(base.origins.find((o) => o.child === 'p-isaak' && o.parent === 'p-avraam')!.id).toBe('o-avraam--isaak');
    expect(facts(base).every(({ f }) => /^a-\d+$/.test(f.id!))).toBe(true);
    expect(base.kin.every((k) => /^k-\d+$/.test(k.id!))).toBe(true);
    expect(base.epochs.map((e) => e.id)).toContain('era-judges');
    // ключ утверждения содержательный: лицо | поле | отпечаток значения и стихов, без порядкового «#2»
    const e = base.ids!.find((x) => x.kind === 'fact')!;
    expect(e.key).toMatch(/^fact:p-[^|]+\|[a-zA-Z]+\|[0-9a-f]{16}(\|.+)?$/);
  });

  it('совпадение ключей — ошибка; выбывший номер второй раз не выдаётся; новый — следующий по порядку', () => {
    const table: IdEntry[] = [
      { id: 'a-5', kind: 'fact', key: 'fact:x|y|1', at: '2026-10-01', state: 'retired' },
      { id: 'a-7', kind: 'fact', key: 'fact:x|y|2', at: '2026-10-01', state: 'active' },
      { id: 'o-a--b', kind: 'origin', key: 'origin:p-b|p-a|father|p', at: '2026-10-01', state: 'active' },
    ];
    const iss = new Issuer(table, '2026-10-11');
    expect(iss.issue('fact', 'fact:x|y|2', 'тест')).toBe('a-7');
    expect(iss.issue('fact', 'fact:x|y|3', 'тест')).toBe('a-8');
    expect(iss.errors).toEqual([]);
    iss.issue('fact', 'fact:x|y|3', 'тест-2');
    expect(iss.errors.join()).toMatch(/совпадение ключей/);
    // ребро с другими концами не может взять номер, выданный другому ребру
    const iss2 = new Issuer(table, '2026-10-11');
    iss2.issue('origin', 'origin:p-b|p-a|father|o', 'тест', 'o-a--b');
    expect(iss2.errors.join()).toMatch(/второй раз не выдаётся/);
  });

  it('пересборка не меняет ни одного выданного номера; шаг вставляет, переносит, меняет текст — номера те же; смена конца ребра — новый номер', () => {
    const before = loadBase();
    const avraam = actorOf(before, 'p-avraam');
    const moved = avraam.facts.find((f) => f.field === 'events')!;
    const edited = actorOf(before, 'p-noy').facts[0];
    const edge = before.origins.find((o) => o.child === 'p-isaak' && o.parent === 'p-avraam' && o.primary)!;
    const steps: Step[] = [
      {
        id: 'T-вставка', scope: [],
        run: ({ actor }) => {
          actor('p-adam').facts.unshift({ sec: 24, field: 'notes', value: 'проба вставки (Быт 5:1)', cert: 'scripture' } as any);
          return { what: '', why: '', refs: [], actors: [] };
        },
      },
      {
        id: 'T-перенос', scope: [],
        run: ({ actor }) => {
          const a = actor('p-avraam');
          // во время шагов у записи ещё заготовка номера — шаг находит запись по содержимому
          const f = a.facts.find((x) => x.field === moved.field && canon(x.value) === canon(moved.value))!;
          a.facts.splice(a.facts.indexOf(f), 1);
          actor('p-isaak').facts.push(f);
          return { what: '', why: '', refs: [], actors: [] };
        },
      },
      {
        id: 'T-текст', scope: [],
        run: ({ actor }) => {
          const f = actor('p-noy').facts.find((x) => x.field === edited.field && canon(x.value) === canon(edited.value))!;
          f.value = { ...(f.value as object), text: 'текст изменён шагом' };
          return { what: '', why: '', refs: [], actors: [] };
        },
      },
      {
        id: 'T-конец', scope: [],
        run: ({ origin }) => {
          origin('p-isaak', 'p-avraam', true).parent = 'p-farra';
          return { what: '', why: '', refs: [], actors: [] };
        },
      },
    ];
    const after = buildBase({ ids: before.ids, redirects: before.redirects, at: '2099-01-01', extraSteps: steps });
    const idsOf = (b: Base) => new Map(facts(b).map(({ a, f }) => [f.id!, a.id]));
    const was = idsOf(before);
    const now = idsOf(after);
    // все прежние номера утверждений на месте; перенесённое — у другого лица с тем же номером
    for (const [id, actor] of was) expect([id, now.get(id)]).toEqual([id, id === moved.id ? 'p-isaak' : actor]);
    // изменённый текст — тот же номер
    expect(actorOf(after, 'p-noy').facts.find((f) => f.id === edited.id)!.value).toMatchObject({ text: 'текст изменён шагом' });
    // вставленное — новый номер, следующий по порядку, с ключом шага
    const added = after.ids!.slice(before.ids!.length);
    expect(added.map((e) => [e.kind, e.at])).toEqual([['fact', '2099-01-01'], ['origin', '2099-01-01']]);
    expect(added[0].key).toMatch(/\|T-вставка$/);
    expect(actorOf(after, 'p-adam').facts[0].id).toBe(added[0].id);
    // ребро с новым концом — новая запись и новый номер; прежний номер выбывает со строкой переадресации (К-12),
    // остальные строки таблицы не тронуты
    expect(added[1].id).toBe('o-farra--isaak');
    expect(after.origins.some((o) => o.id === edge.id)).toBe(false);
    expect(after.ids!.slice(0, before.ids!.length)).toEqual(before.ids!.map((e) => (e.id === edge.id ? { ...e, state: 'retired' } : e)));
    expect(after.redirects.filter((r) => r.from === edge.id).map((r) => [r.to, r.reason])).toEqual([[['o-farra--isaak'], ORIGIN_REDIRECT_REASON]]);
    expect(after.redirects.slice(0, before.redirects.length)).toEqual(before.redirects);
    // вторая сборка с той же таблицей — те же номера и та же переадресация
    const again = buildBase({ ids: after.ids, redirects: after.redirects, at: '2099-01-02', extraSteps: steps });
    expect(again.ids).toEqual(after.ids);
    expect(again.redirects).toEqual(after.redirects);
    // родство и эпохи — те же номера
    expect(after.kin.map((k) => k.id)).toEqual(before.kin.map((k) => k.id));
    expect(after.epochs.map((e) => e.id)).toEqual(before.epochs.map((e) => e.id));
  }, 60_000);

  it('шаг, который размножил запись, — ошибка сборки (совпадение ключей)', () => {
    const dup: Step = {
      id: 'T-копия', scope: [],
      run: ({ actor }) => {
        const a = actor('p-adam');
        a.facts.push(structuredClone(a.facts[0]));
        return { what: '', why: '', refs: [], actors: [] };
      },
    };
    expect(() => buildBase({ ids: base.ids, redirects: base.redirects, extraSteps: [dup] })).toThrow(/совпадение ключей/);
  }, 60_000);
});

describe('пересборка только дописывает ids.json и redirects.json (К-16)', () => {
  it('две пересборки подряд с пустой таблицей: ids.json и redirects.json побайтно те же', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'номера '));
    try {
      const round = () => {
        const ids = loadIds(tmp);
        const red = (() => {
          try {
            return JSON.parse(readFileSync(join(tmp, 'redirects.json'), 'utf8')).items as Redirect[];
          } catch {
            return [] as Redirect[];
          }
        })();
        const b = buildBase({ ids, redirects: red, at: ids.length ? '2099-12-31' : '2026-10-11' });
        const wrote = saveIds(b.ids!, tmp);
        writeFileSync(join(tmp, 'redirects.json'), JSON.stringify({ items: b.redirects }, null, 1) + '\n');
        return { wrote, ids: readFileSync(join(tmp, IDS_FILE), 'utf8'), red: readFileSync(join(tmp, 'redirects.json'), 'utf8') };
      };
      const r1 = round();
      const r2 = round();
      expect(r1.wrote).toBe(true);
      expect(r2.wrote).toBe(false);
      expect(r2.ids).toBe(r1.ids);
      expect(r2.red).toBe(r1.red);
      // и совпадают с файлами base/ (дата выдачи в таблице — первая; у второй сборки новых номеров нет)
      expect(r2.ids.replaceAll('"2026-10-11"', '')).toBe(readFileSync(join(BASE_DIR, IDS_FILE), 'utf8').replace(/"\d{4}-\d{2}-\d{2}"/g, ''));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('сборка из base/ не выдаёт новых номеров и не меняет таблицу и переадресацию на диске', () => {
    const b = buildBase();
    expect(serializeIds(b.ids!)).toBe(readFileSync(join(BASE_DIR, IDS_FILE), 'utf8'));
    expect(b.redirects).toEqual(diskRedirects());
  }, 60_000);

  it('переадресация только дописывается: строки с диска остаются, новые — в конец, без повторов', () => {
    const disk: Redirect[] = [{ from: 'p-x', to: ['p-y'], reason: 'было', refs: [], at: '2026-10-01' }];
    const built: Redirect[] = [
      { from: 'p-x', to: ['p-z'], reason: 'шаг изменился', refs: [], at: '2026-10-11' },
      { from: 'p-q', to: ['p-y'], reason: 'новая', refs: [], at: '2026-10-11' },
      { from: 'p-q', to: ['p-y'], reason: 'новая', refs: [], at: '2026-10-11' },
    ];
    expect(mergeRedirects(disk, built).map((r) => [r.from, r.to[0]])).toEqual([['p-x', 'p-y'], ['p-q', 'p-y']]);
  });

  it('каждый прежний номер эпохи ведёт на новый; петель и пустых целей нет', () => {
    const red = new Map(base.redirects.map((r) => [r.from, r]));
    for (const e of base.epochs) {
      const old = e.id.replace(/^era-/, '');
      expect([old, red.get(old)?.to]).toEqual([old, [e.id]]);
      expect(red.get(old)!.reason).toBe(EPOCH_REDIRECT_REASON);
    }
    expect(validate(base).filter((i) => i.check === 'переадресация')).toEqual([]);
    // время прежнего вида ссылается на действующие номера эпох
    expect(base.chrono.filter((c: any) => typeof c.chrono?.epoch === 'string' && !c.chrono.epoch.startsWith('era-'))).toEqual([]);
  });
});

describe('перенос подписей base:mark --rekey (К-2)', () => {
  /** Журнал до переноса: перенесённые подписи — под прежним ключом и с прежним отпечатком (из истории). */
  const oldChecks = (b: Base): CheckEntry[] =>
    (b.checks ?? []).map((c) => {
      const h = c.history?.at(-1);
      if (!h?.note?.startsWith('перенос номера: ')) return c;
      const { note: _n, ...prev } = h;
      return { ...prev, key: h.note.slice('перенос номера: '.length), ...(c.history!.length > 1 && { history: c.history!.slice(0, -1) }) };
    });
  /** База до номеров: без полей id, эпохи без era-, без переадресации эпох. */
  const beforeIds = (b: Base): Base => {
    const x = structuredClone(b);
    const strip = <T extends { id?: string }>(r: T): T => {
      const { id: _id, ...rest } = r;
      return rest as T;
    };
    x.origins = x.origins.map(strip);
    x.kin = x.kin.map(strip);
    for (const v of x.volumes) for (const a of v.actors) a.facts = a.facts.map(strip);
    x.epochs = x.epochs.map((e) => ({ ...e, id: e.id.replace(/^era-/, '') }));
    x.anchors = { ...x.anchors, anchors: x.anchors.anchors.map((a: any) => ({ ...a, id: a.id.replace(/^an-/, '') })) };
    x.redirects = x.redirects.filter((r) => r.reason !== EPOCH_REDIRECT_REASON && r.reason !== ANCHOR_REDIRECT_REASON);
    for (const c of x.chrono as any[]) if (c.chrono?.epoch) c.chrono.epoch = c.chrono.epoch.replace(/^era-/, '');
    x.checks = oldChecks(b);
    delete x.ids;
    return x;
  };

  it('прежняя функция ключей legacyKey даёт прежние ключи', () => {
    const o = base.origins.find((x) => x.id === 'o-avraam--isaak')!;
    expect(legacyKey('origin', o)).toBe('origin:p-isaak|p-avraam|father|p');
    expect(legacyKey('kin', base.kin[0])).toBe(`kin:${base.kin[0].from}|${base.kin[0].to}|${base.kin[0].rel}`);
    expect(legacyKey('epoch', { id: 'era-judges' })).toBe('epoch:judges');
    const iakov = actorOf(base, 'p-iakov');
    const r = records(base).filter((x) => x.coll === 'fact' && x.parent === iakov && x.rec.field === 'childrenNote');
    expect(r[4].legacy).toBe('fact:p-iakov|10|childrenNote#5');
    expect(r[4].key).toBe(`fact:${r[4].rec.id}`);
  });

  it('переносятся все 48 подписей (36 рёбер, 6 утверждений, 6 родства); отпечатки совпадают с журналом на диске', () => {
    const b = structuredClone(base);
    b.checks = oldChecks(base);
    const r = rekey(b);
    expect(r.failed).toEqual([]);
    expect(r.moved).toHaveLength(48);
    const kinds = (p: string) => r.moved.filter((m) => m.to.startsWith(p)).length;
    expect([kinds('origin:o-'), kinds('fact:a-'), kinds('kin:k-')]).toEqual([36, 6, 6]);
    const sorted = (xs: CheckEntry[]) => [...xs].sort((x, y) => (x.key < y.key ? -1 : 1));
    expect(sorted(r.entries)).toEqual(sorted(base.checks!));
    // повторный перенос ничего не делает
    expect(rekey(base).moved).toEqual([]);
  });

  it('запись, изменённая после подписи, подпись не получает; причина печатается', () => {
    const b = structuredClone(base);
    b.checks = oldChecks(base);
    b.origins.find((o) => o.id === 'o-avraam--isaak')!.refs.push('Быт 25:19');
    const r = rekey(b);
    expect(r.moved).toHaveLength(47);
    expect(r.failed.map((f) => f.key)).toEqual(['origin:p-isaak|p-avraam|father|p']);
    expect(r.failed[0].why).toMatch(/изменилось содержимое/);
    expect(admission({ ...b, checks: r.entries }, 'release').okKey('origin:o-avraam--isaak')).toBe(false);
  });

  it('до и после переноса в выпуск допущены одни и те же записи — без исключений (101)', () => {
    const before = beforeIds(base);
    const admittedLegacy = (b: Base) => {
      const A = admission(b, 'release');
      return records(b).filter((r) => A.okKey(r.key)).map((r) => r.legacy).sort();
    };
    const was = admittedLegacy(withoutD1(before));
    const now = admittedLegacy(withoutD1(base));
    expect(now).toEqual(was);
    expect(now).toHaveLength(101);
    expect(admission(withoutD1(base), 'release').counts.all.admitted).toBe(101);
    // база до номеров читается прежними ключами (records без id)
    expect(records(before).every((r) => r.key === r.legacy)).toBe(true);
  });
});

describe('граф зависимостей: ссылка на запись того же вида — не зависимость (К-4)', () => {
  it('в графе зависимостей нет петель и нет зависимостей того же вида', () => {
    const recs = records(base);
    expect(recs.filter((r) => r.deps.some((d) => d.startsWith(`${r.coll}:`))).map((r) => r.key)).toEqual([]);
    const deps = new Map(recs.map((r) => [r.key, r.deps]));
    const state = new Map<string, 1 | 2>();
    const loops: string[] = [];
    const visit = (k: string, path: string[]) => {
      if (state.get(k) === 2) return;
      if (state.get(k) === 1) return void loops.push([...path, k].join(' → '));
      state.set(k, 1);
      for (const d of deps.get(k) ?? []) visit(d, [...path, k]);
      state.set(k, 2);
    };
    for (const r of recs) visit(r.key, []);
    expect(loops).toEqual([]);
  });

  it('две подписанные области со взаимной ссылкой обе допущены; неподписанная цель ссылки не закрывает запись', () => {
    const b = fresh();
    const x = b.areas.find((a) => a.id === 'g-davidic')!;
    const y = b.areas.find((a) => a.id === 'g-judah')!;
    y.parent = x.id; // нарочно: взаимная ссылка
    b.checks = ['area:g-davidic', `actor:${x.founder}`].map((k) => sign(b, k, who));
    const A = admission(b, 'release');
    expect(A.okKey('area:g-davidic')).toBe(true); // родитель g-judah не подписан — ссылка не выводится, запись идёт
    b.checks.push(sign(b, 'area:g-judah', who));
    if (y.founder) b.checks.push(sign(b, `actor:${y.founder}`, who));
    const B = admission(b, 'release');
    expect([B.okKey('area:g-davidic'), B.okKey('area:g-judah')]).toEqual([true, true]);
  });
});

describe('допуск по частям (К-15) и поле works', () => {
  const closed = (b: Base) => {
    const s = b.sources!.find((x) => x.id === 'src-synodal')!;
    b.sources!.push({ ...s, id: 'src-test-closed', redistribute: false, spdx: 'NOASSERTION' });
    b.sources!.push({ ...s, id: 'src-test-open', redistribute: true });
  };

  it('имя с закрытым источником снимается, лицо допущено; в индекс выпуска имя не попадает', () => {
    const b = fresh();
    closed(b);
    const a = actorOf(b, 'p-avraam');
    a.names.push({ form: 'Имя из закрытого источника', type: 'variant', refs: ['Быт 17:5'], source: 'src-test-closed' } as any);
    b.checks = [sign(b, 'actor:p-avraam', who)];
    const r = records(b).find((x) => x.key === 'actor:p-avraam')!;
    expect(recordSources(r, b)).toContain('src-test-closed'); // в отпечаток источник входит
    expect(blockedSources(r, b)).toEqual([]); // а допуск записи не закрывает
    const A = admission(b, 'release');
    expect(A.okKey('actor:p-avraam')).toBe(true);
    const idx = buildIndex(b, A).actors.find((x) => x.id === 'avraam')!;
    expect(JSON.stringify(idx)).not.toContain('Имя из закрытого источника');
    expect(A.view(a).names.map((n) => n.form)).not.toContain('Имя из закрытого источника');
    // проба: запрет считается, но не применяется
    expect(admission(b, 'probe').view(a).names.map((n) => n.form)).toContain('Имя из закрытого источника');
  });

  it('место: закрытая точка снимается, открытая остаётся; источник вне реестра — тоже закрыт', () => {
    const b = fresh();
    closed(b);
    const place = {
      id: 'l-test', names: [{ form: 'Вефиль', refs: ['Быт 28:19'] }],
      positions: [
        { id: 'l-test#pos1', coordSource: { source: 'src-test-closed', id: 'Q1' }, lat: 31.9, lon: 35.2 },
        { id: 'l-test#pos2', coordSource: { source: 'src-test-open', id: 'Q2' }, lat: 31.93, lon: 35.22 },
        { id: 'l-test#pos3', coordSource: { source: 'src-нет-в-реестре', id: 'Q3' }, lat: 31.9, lon: 35.2 },
      ],
      labelPoint: { source: 'src-test-closed', lat: 0, lon: 0 },
    };
    expect(closedPart(place.positions[0], b)).toBe(true);
    expect(closedPart(place.positions[2], b)).toBe(true);
    const v = openView(place, b);
    expect(v.positions.map((p) => p.id)).toEqual(['l-test#pos2']);
    expect('labelPoint' in v).toBe(false);
    expect(place.positions).toHaveLength(3); // сама запись не меняется
    expect(blockedSources({ rec: place }, b)).toEqual([]);
  });

  it('works на закрытый труд или труд вне реестра выпуск не закрывает; sources на закрытый — закрывает', () => {
    const b = fresh();
    closed(b);
    const a = actorOf(b, 'p-avraam');
    const f = a.facts.find((x) => x.field === 'events')!;
    (f as any).works = [{ work: 'w-test-closed', page: '12', weight: 'checked', checkedBy: 'agent' }, { work: 'src-test-closed', page: '1', weight: 'approx', checkedBy: 'agent' }];
    const key = `fact:${f.id}`;
    b.checks = [sign(b, 'actor:p-avraam', who), sign(b, key, who)];
    expect(admission(b, 'release').okKey(key)).toBe(true);
    (f as any).sources = ['src-test-closed'];
    b.checks = [sign(b, 'actor:p-avraam', who), sign(b, key, who)];
    const A = admission(b, 'release');
    expect(A.okKey(key)).toBe(false);
    expect(A.rights.get(key)).toEqual(['src-test-closed']);
  });
});
