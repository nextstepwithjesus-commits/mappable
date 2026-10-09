/**
 * Перенос прежних данных в базу «Библии наглядно» (docs/app/02-ДАННЫЕ.md, § 4; рецензия Д1): точный перенос обратимо
 * совпадает с прежними данными; каждый шаг исправления меняет только объявленные записи; подложенные искажения ловятся.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { toBase, diff, stepChanges, CARD_FIELDS, type Base } from '../tools/base/migrate.ts';
import { project, type Hints } from '../tools/base/project.ts';
import { STEPS, type Step } from '../tools/base/corrections.ts';
import { ADDITIONS } from '../tools/base/additions.ts';
import { validate } from '../tools/base/validate.ts';

const DATA = join(import.meta.dirname, '..', 'data');
const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const old = {
  vols: readdirSync(join(DATA, 'persons')).filter((f) => f.endsWith('.json')).sort().map((f) => ({ ...read(join('persons', f)), file: f })),
  groups: read('groups.json'), epochs: read('epochs.json'), anchors: read('anchors.json'),
  lines: { joseph: read('lines/joseph.json'), mary: read('lines/mary.json') } as Record<string, any>,
};
const exact = () => toBase(old.vols, old.groups, old.epochs, old.anchors, old.lines);

describe('перенос в базу', () => {
  it('точный перенос: обратная проекция без отличий', () => {
    const { base, hints } = exact();
    expect(diff(old, project(base, hints))).toEqual([]);
  });

  it('каждый шаг исправления меняет только записи своей области', () => {
    const { base, hints } = exact();
    for (const s of [...STEPS, ADDITIONS]) expect([s.id, stepChanges(base, hints, s).stray]).toEqual([s.id, []]);
    expect(validate(base).filter((i) => i.level === 'error')).toEqual([]);
  }, 60_000);

  it('инварианты точного переноса для полей, которых проекция не видит', () => {
    const { base } = exact();
    const facts = base.volumes.flatMap((v) => v.actors.flatMap((a) => a.facts));
    expect(facts.filter((f) => CARD_FIELDS[f.field].sec !== f.sec)).toEqual([]);
    expect(base.origins.filter((o) => o.primary && o.role === 'mother' && o.kind !== 'natural')).toEqual([]);
    expect(base.origins.filter((o) => o.primary && o.role === 'father' && !['natural', 'legal'].includes(o.kind))).toEqual([]);
    expect(base.origins.filter((o) => o.reading || o.gapPossible || o.words)).toEqual([]);
    const byChild = new Map<string, string[][]>();
    for (const o of base.origins) if (o.primary) byChild.set(o.child, [...(byChild.get(o.child) ?? []), o.refs]);
    for (const [c, rs] of byChild) if (rs.length === 2) expect([c, rs[0]]).toEqual([c, rs[1]]);
    expect(base.unions.filter((u) => u.terms.some((t) => t.kind === 'not-stated') && u.terms.some((t) => t.kind !== 'not-stated'))).toEqual([]);
    expect(base.volumes.flatMap((v) => v.actors).filter((a) => !a.names[0].refs.length).map((a) => a.id)).toEqual([]);
  });

  it('подложенные искажения ловятся', () => {
    const mutate = (f: (b: Base, h: Hints) => void) => {
      const { base, hints } = exact();
      f(base, hints);
      return diff(old, project(base, hints)).length;
    };
    // сторона обозначения союза перевёрнута — проекция читает сторону из союза, а не из подсказки
    expect(mutate((b) => {
      const t = b.unions.find((u) => u.id === 'u-avraam--sarra')!.terms[0];
      t.side = t.side === 'husband' ? 'wife' : 'husband';
    })).toBeGreaterThan(0);
    // вид брака заменён наложницей
    expect(mutate((b) => { b.unions.find((u) => u.id === 'u-avraam--sarra')!.terms[0].kind = 'concubine'; })).toBeGreaterThan(0);
    // прежний номер в эпохах ловит проверка базы
    const { base } = exact();
    base.epochs[0].keyPersons = ['adam'];
    expect(validate(base).some((i) => i.check === 'номер')).toBe(true);
    // шаг, вышедший за свою область, ловит сверка шагов
    const { base: b2, hints: h2 } = exact();
    const sneaky: Step = {
      id: 'X', scope: ['origin:p-sala|'],
      run: ({ base: b }) => {
        b.origins.find((o) => o.child === 'p-sala')!.gapPossible = { refs: ['Лк 3:36'], via: [] };
        b.unions[0].terms[0].note = 'подложено';
        return { what: '', why: '', refs: [], actors: [] };
      },
    };
    expect(stepChanges(b2, h2, sneaky).stray).toEqual([`union:${b2.unions[0].id}`]);
  }, 60_000);
});
