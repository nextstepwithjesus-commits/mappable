/**
 * Перенос прежних данных в базу «Библии наглядно» (docs/app/02-ДАННЫЕ.md, § 4): точный перенос обратимо совпадает
 * с прежними данными, а после исправлений отличаются только лица и записи из списка исправлений.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { toBase, diff } from '../tools/base/migrate.ts';
import { project } from '../tools/base/project.ts';
import { applyCorrections } from '../tools/base/corrections.ts';

const DATA = join(import.meta.dirname, '..', 'data');
const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const old = {
  vols: readdirSync(join(DATA, 'persons')).filter((f) => f.endsWith('.json')).sort().map((f) => ({ ...read(join('persons', f)), file: f })),
  groups: read('groups.json'), epochs: read('epochs.json'), anchors: read('anchors.json'),
  lines: { joseph: read('lines/joseph.json'), mary: read('lines/mary.json') } as Record<string, any>,
};

describe('перенос в базу', () => {
  const { base, hints } = toBase(old.vols, old.groups, old.epochs, old.anchors, old.lines);
  it('точный перенос: обратная проекция без отличий', () => {
    expect(diff(old, project(base, hints))).toEqual([]);
  });
  it('после исправлений все отличия объяснены', () => {
    applyCorrections(base, hints);
    const allowed = new Set(base.corrections.flatMap((c) => [...c.actors, ...(c.other ?? [])]));
    const d = diff(old, project(base, hints));
    expect(d.filter((x) => !allowed.has(x.id))).toEqual([]);
    // Илий не отец Марии и Иосифа одновременно: прочтения одного набора
    const heli = base.origins.filter((o) => o.parent === 'p-iliy-syn-matfata' && o.reading);
    expect(heli.map((o) => `${o.child}:${o.reading!.reading}`).sort()).toEqual(['p-iosif-muzh-marii:letter', 'p-mariya:mary']);
    expect(base.origins.some((o) => o.child === 'p-mariya' && o.primary && o.role === 'father')).toBe(false);
    // «мои они» — не ребро происхождения
    expect(base.origins.some((o) => o.parent === 'p-iakov' && ['p-efrem', 'p-manassiya'].includes(o.child))).toBe(false);
    // у Иисуса Христа нет кровного отца
    expect(base.origins.filter((o) => o.child === 'p-iisus' && o.role === 'father').map((o) => o.kind)).toEqual(['legal']);
    // линия Луки кончается Иосифом
    expect(base.lines.mary.persons.slice(-2).map((s: any) => s.id)).toEqual(['p-iosif-muzh-marii', 'p-iisus']);
  });
});
