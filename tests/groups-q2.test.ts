/**
 * Созвездия data/groups.json (этап 11, решение 82; tools/groups-check.ts — модуль валидатора): разделы листа «Показ»,
 * вложенность домов в колена, Ефремово и Манассиино — в «Доме Иосифа», родоначальники (founder) — лица из данных,
 * члены созвездия или родители его членов; у вложенного дома — потомок родоначальника колена.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Group, Person } from '../src/data/types.ts';
import { byId, groups as built } from '../src/data/atlas.ts';
import { checkGroups, SECTIONS } from '../tools/groups-check.ts';

const groups: Group[] = JSON.parse(readFileSync(join(__dirname, '..', 'data/groups.json'), 'utf8'));
const persons = new Map<string, Pick<Person, 'id' | 'group' | 'father' | 'mother' | 'otherParents'>>(
  [...byId.values()].map((p) => [p.id, { id: p.id, group: p.group, father: p.father, mother: p.mother, otherParents: p.otherParents as Person['otherParents'] }]),
);
const edit = (id: string, patch: Partial<Group>) => groups.map((g) => (g.id === id ? { ...g, ...patch } : g));

describe('созвездия: данные проходят проверку', () => {
  it('замечаний нет', () => {
    expect(checkGroups(groups, persons)).toEqual([]);
  });
  it('у каждого созвездия — раздел; «Дом Нахора» — основатель Нахор, брат Авраама; дома колен вложены', () => {
    for (const g of groups) expect(SECTIONS, g.id).toContain(g.section);
    const g = new Map(groups.map((x) => [x.id, x]));
    expect(g.get('nahorites')!.founder).toBe('nakhor-syn-farry');
    expect(g.get('keturites')!.founder).toBe('avraam');
    expect(g.get('ephraim')!.parent).toBe('joseph');
    expect(g.get('manasseh')!.parent).toBe('joseph');
    expect(g.get('davidic')!.parent).toBe('judah');
    expect(g.get('aaronides')!.parent).toBe('levi');
    expect(g.get('saulides')!.parent).toBe('benjamin');
  });
  it('поля проходят в собранный индекс без правки сборки', () => {
    const b = new Map(built.map((x) => [x.id, x]));
    for (const g of groups) {
      expect(b.get(g.id)?.section, g.id).toBe(g.section);
      expect(b.get(g.id)?.founder, g.id).toBe(g.founder);
    }
  });
});

describe('созвездия: ошибки ловятся', () => {
  const msgs = (gs: Group[]) => checkGroups(gs, persons).map((i) => `${i.where}: ${i.msg}`);
  it('нет раздела или раздел неизвестен', () => {
    expect(msgs(edit('moabites', { section: undefined })).join('\n')).toMatch(/group:moabites: section/);
    expect(msgs(edit('moabites', { section: 'nowhere' as never })).join('\n')).toMatch(/group:moabites: section/);
  });
  it('Ефремово колено вне «Дома Иосифа»; дом колена без колена; родитель в другом разделе', () => {
    expect(msgs(edit('ephraim', { parent: undefined })).join('\n')).toMatch(/group:ephraim: .*Дом Иосифа/);
    expect(msgs(edit('davidic', { parent: undefined })).join('\n')).toMatch(/group:davidic: дом в разделе колен/);
    expect(msgs(edit('nahorites', { parent: 'judah' })).join('\n')).toMatch(/group:nahorites: parent: «judah» лежит в другом разделе/);
  });
  it('родоначальник: нет такого лица; не член и не родитель члена; вложенный дом — не от родоначальника колена', () => {
    expect(msgs(edit('nahorites', { founder: 'nobody' })).join('\n')).toMatch(/founder: нет лица «nobody»/);
    expect(msgs(edit('nahorites', { founder: 'david' })).join('\n')).toMatch(/founder: «david» не член созвездия и не родитель его члена/);
    expect(msgs(edit('davidic', { founder: 'aaron' })).join('\n')).toMatch(/group:davidic: founder: «aaron»/);
  });
  it('неизвестное поле и цикл вложенности', () => {
    expect(msgs(edit('moabites', { colour: 'red' } as never)).join('\n')).toMatch(/неизвестное поле «colour»/);
    const cyc = groups.map((g) => (g.id === 'judah' ? { ...g, parent: 'davidic' } : g));
    expect(msgs(cyc).join('\n')).toMatch(/цикл/);
  });
});
