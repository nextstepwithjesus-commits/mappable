import { describe, expect, it, beforeEach } from 'vitest';
import { byId, graph } from '../src/data/atlas.ts';
import { branchesOf, buildUnions, membersOf } from '../src/engine/unions.ts';
import { collapseUnion, expandUnion, expanded, KEY_IDS, LINE_IDS, opened, openPerson, originOf, plates, startWith, unionsOf } from '../src/ui/reveal.ts';
import { skyMode, workSet } from '../src/ui/work.ts';

const names = (ids: readonly string[]) => ids.map((id) => byId.get(id)?.name ?? id);

describe('союзы (решение 67)', () => {
  const U = buildUnions(graph);
  it('Авраам: три союза в порядке текста — Сарра, Агарь, Хеттура (наложница); дети по союзам', () => {
    const us = U.of.get('avraam')!;
    expect(us.map((u) => byId.get(u.b!)?.name)).toEqual(['Сарра', 'Агарь', 'Хеттура']);
    expect(names(us[0].kids)).toEqual(['Исаак']);
    expect(names(us[1].kids)).toEqual(['Измаил']);
    expect(us[2].kind).toBe('concubine');
    expect(us[2].kids.length).toBe(6);
  });
  it('Иисус Христос: союз происхождения — Иосиф и Мария, «по закону»; брак и происхождение — один союз', () => {
    const o = U.origin.get('iisus')!;
    expect(o[0].a).toBe('iosif-muzh-marii');
    expect(o[0].b).toBe('mariya');
    expect(o[0].claim).toBe('legal');
    expect(U.of.get('iosif-muzh-marii')!.filter((u) => u.b === 'mariya').length).toBe(1);
  });
  it('Сиф: мать Еноса не названа — союз «Сиф и …» без второго лица, ничего не выдумано', () => {
    const u = U.of.get('sif')![0];
    expect(u.a).toBe('sif');
    expect(u.b).toBeNull();
    expect(u.kind).toBe('parents');
  });
  it('Давид: брак без детей (Мелхола) — тоже союз', () => {
    const m = U.of.get('david')!.find((u) => u.b === 'melkhola');
    expect(m).toBeTruthy();
    expect(m!.kids).toEqual([]);
  });
  it('ветви по союзам у Авраама и по детям у Ноя (решение 69)', () => {
    const a = branchesOf(U, graph, 'avraam');
    expect(a.keys.length).toBe(3);
    expect(a.desc.get('iakov')?.branch).toBe(a.desc.get('isaak')?.branch);
    expect(a.desc.get('iakov')?.gen).toBe(2);
    expect(a.desc.get('izmail')?.branch).not.toBe(a.desc.get('isaak')?.branch);
    const n = branchesOf(U, graph, 'noy');
    expect(names(n.keys)).toEqual(['Сим', 'Хам', 'Иафет']);
    expect(n.desc.get('avraam')?.branch).toBe(0);
  });
});

describe('раскрытие (решения 68, 70)', () => {
  beforeEach(() => startWith('adam'));
  it('начало «С Адама»: на небе только Адам, небо «набор», его союзы показаны', () => {
    expect([...workSet.value.keys()]).toEqual(['adam']);
    expect(skyMode.value).toBe('work');
    expect(opened.value).toEqual(['adam']);
    expect(plates.value.map((p) => p.union.id)).toContain(unionsOf('adam')[0].id);
  });
  it('союз Адама и Евы раскрывает Еву, Каина, Авеля и Сифа; свёртка убирает их и всё раскрытое от них', () => {
    const u = unionsOf('adam')[0];
    expect(expandUnion(u.id, 'adam')).toBe(4);
    expect(names([...workSet.value.keys()])).toEqual(['Адам', 'Ева', 'Каин', 'Авель', 'Сиф']);
    openPerson('kain');
    const k = unionsOf('kain')[0];
    expandUnion(k.id, 'kain');
    expect(workSet.value.has('enokh-syn-kaina') || [...workSet.value.keys()].some((id) => k.kids.includes(id))).toBe(true);
    expect(collapseUnion(u.id)).toBeGreaterThanOrEqual(5);
    expect([...workSet.value.keys()]).toEqual(['adam']);
    expect(Object.keys(expanded.value)).toEqual([]);
    expect(opened.value).toEqual(['adam']);
  });
  it('вверх: у Иисуса Христа союз происхождения раскрывает Иосифа и Марию', () => {
    startWith('jesus');
    const o = originOf('iisus')[0];
    expect(plates.value.some((p) => p.union.id === o.id && p.dir === 'up')).toBe(true);
    expandUnion(o.id, 'iisus');
    expect(workSet.value.has('iosif-muzh-marii') && workSet.value.has('mariya')).toBe(true);
    expect(membersOf(o).every((m) => workSet.value.has(m))).toBe(true);
  });
  it('начала «родословие» и «ключевые лица» — наборы лиц; «всё небо» — небо «все лица»', () => {
    startWith('lines');
    expect(workSet.value.size).toBe(LINE_IDS.length);
    expect(workSet.value.has('adam') && workSet.value.has('iisus') && workSet.value.has('david')).toBe(true);
    startWith('key');
    expect(workSet.value.size).toBe(KEY_IDS.length);
    expect(KEY_IDS.length).toBeGreaterThan(40);
    startWith('all');
    expect(skyMode.value).toBe('all');
  });
});

describe('ветви: при равенстве — путь по отцу', () => {
  it('Давид: Авия — в ветви Вирсавии (через Соломона и Ровоама), а не Маахи (через Авессалома)', () => {
    const U = buildUnions(graph);
    const b = branchesOf(U, graph, 'david');
    const ids = [...b.desc.keys()];
    const aviya = ids.find((x) => byId.get(x)?.name === 'Авия' && b.desc.get(x)!.gen === 3);
    expect(aviya).toBeTruthy();
    expect(b.desc.get(aviya!)!.branch).toBe(b.desc.get('solomon')!.branch);
  });
});

describe('вид атласа (решение 73)', () => {
  it('начала с раскрытием открывают древо, «всё небо» — небо', async () => {
    const { atlasView } = await import('../src/ui/reveal.ts');
    startWith('adam');
    expect(atlasView.value).toBe('tree');
    startWith('all');
    expect(atlasView.value).toBe('sky');
    startWith('lines');
    expect(atlasView.value).toBe('tree');
  });
});
