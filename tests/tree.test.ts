import { describe, expect, it } from 'vitest';
import { byId, graph } from '../src/data/atlas.ts';
import { models } from '../src/data/atlas.ts';
import { buildUnions } from '../src/engine/unions.ts';
import { layoutTree, personKey, shownUnions, TREE, type TreeNode } from '../src/engine/tree.ts';

const U = buildUnions(graph);
const birth = (id: string) => models[0].chrono.get(id)?.b ?? null;
const lay = (persons: string[], opened: string[] = [], expanded: string[] = []) => layoutTree({ unions: U, persons, opened, expanded, birth });
const nameOf = (n: TreeNode) => (n.kind === 'person' ? byId.get(n.id)!.name : n.kind === 'union' ? `союз ${n.union.id}` : `пусто ${n.union.id}`);
const overlaps = (ns: TreeNode[]) => {
  const out: string[] = [];
  for (const a of ns) for (const b of ns) if (a !== b && a.layer === b.layer && a.y < b.y && b.y - a.y < (a.h + b.h) / 2) out.push(`${nameOf(a)} / ${nameOf(b)}`);
  return out;
};

describe('древо (решение 73)', () => {
  it('Адам один: одна карточка', () => {
    const t = lay(['adam']);
    expect(t.nodes.map(nameOf)).toEqual(['Адам']);
  });
  it('Адам с показанными союзами: Адам и Ева в первом столбце, союз во втором, детей нет, пока союз не раскрыт', () => {
    const t = lay(['adam'], ['adam']);
    const u = t.nodes.find((n) => n.kind === 'union')!;
    expect(u.kind === 'union' && u.hidden).toBe(3);
    const eva = t.byKey.get(personKey('eva'))!;
    expect(eva.layer).toBe(0);
    expect(u.layer).toBe(1);
  });
  it('раскрытый союз Адама и Евы: Каин, Авель, Сиф в третьем столбце, без наложений; союз — между детьми по высоте', () => {
    const uid = U.of.get('adam')![0].id;
    const t = lay(['adam', 'eva', 'kain', 'avel', 'sif'], ['adam'], [uid]);
    const kids = ['kain', 'avel', 'sif'].map((id) => t.byKey.get(personKey(id))!);
    expect(kids.every((k) => k.layer === 2)).toBe(true);
    expect(overlaps(t.nodes)).toEqual([]);
    const u = t.byKey.get(uid)!;
    const ys = kids.map((k) => k.y);
    expect(u.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1);
    expect(u.y).toBeLessThanOrEqual(Math.max(...ys) + 1);
  });
  it('Сиф: мать Еноса не названа — пустое место у союза', () => {
    const t = lay(['sif', 'enos'], ['sif'], [U.of.get('sif')![0].id]);
    expect(t.nodes.some((n) => n.kind === 'unnamed')).toBe(true);
  });
  it('вверх от Иисуса Христа: союз Иосифа и Марии слева, родители ещё левее', () => {
    const t = lay(['iisus'], ['iisus']);
    const j = t.byKey.get(personKey('iisus'))!;
    const jo = t.byKey.get(personKey('iosif-muzh-marii'))!;
    const u = t.nodes.find((n) => n.kind === 'union')!;
    expect(u.layer).toBe(j.layer - 1);
    expect(jo.layer).toBe(j.layer - 2);
  });
  it('линия без братьев: Авраам, Исаак, Иаков раскрыты — союзы между ними показаны, скрытые дети сосчитаны', () => {
    const sh = shownUnions({ unions: U, persons: ['avraam', 'isaak', 'iakov'], opened: [], expanded: [], birth });
    expect(sh.length).toBe(2);
    const t = lay(['avraam', 'isaak', 'iakov']);
    expect(t.byKey.get(personKey('iakov'))!.layer).toBe(4);
    const ui = t.nodes.find((n) => n.kind === 'union' && n.union.kids.includes('iakov'));
    expect(ui && ui.kind === 'union' && ui.hidden).toBe(1);
  });
  it('Авраам со всеми союзами раскрытыми: три союза, девять детей, без наложений', () => {
    const us = U.of.get('avraam')!;
    const kids = us.flatMap((u) => u.kids);
    const t = lay(['avraam', 'sarra', 'agar', 'khettura', ...kids], ['avraam'], us.map((u) => u.id));
    // три его союза и союз его родителей (показан, потому что у Авраама показаны союзы в обе стороны)
    expect(t.nodes.filter((n) => n.kind === 'union' && n.union.a === 'avraam').length).toBe(3);
    expect(t.nodes.filter((n) => n.kind === 'union').length).toBe(4);
    expect(overlaps(t.nodes)).toEqual([]);
    // Фарра — слева: пять столбцов (родители, союз родителей, Авраам и жёны, союзы, дети)
    expect(t.width).toBe(5 * TREE.colW + TREE.pad * 2);
  });
});
