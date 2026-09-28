/**
 * Древо карточек (решение 73, задача N1): геометрия связей и камеры, «другие сыновья и дочери», команды карточек
 * лица, подсветка ветвей выбранного, ленты линий Мессии, соседи для клавиатуры; образы лиц (решение 74).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { graph, models, persons } from '../src/data/atlas.ts';
import { buildUnions } from '../src/engine/unions.ts';
import { layoutTree, personKey, TREE, type TreeLayout } from '../src/engine/tree.ts';
import { edgePoints, fitCam, K_MAX, K_MIN, nodeBox, revealCam, roundedPath, toScreen, zoomAt, CARD_W } from '../src/ui/tree/geom.ts';
import {
  continueBranch, foldBranch, hideParents, highlightOf, isOthers, neighbor, othersId, othersNote, othersUnionOf, personCmds, ribbonOf, showParents, tabOrder,
  treeLayout, withOthers,
} from '../src/ui/tree/model.ts';
import { branchesOf } from '../src/engine/unions.ts';
import { expanded, expandUnion, opened, startWith } from '../src/ui/reveal.ts';
import { workSet } from '../src/ui/work.ts';
import { FEMALE_VARIANTS, lookOf, MALE_VARIANTS, variantOf } from '../src/ui/tree/Avatar.tsx';
import { kidsCommand, unionKindLine, unnamedText } from '../src/ui/tree/Cards.tsx';

const U = buildUnions(graph);
const birth = (id: string) => models[0].chrono.get(id)?.b ?? null;
const lay = (persons: string[], opened: string[] = [], exp: string[] = [], note = new Set<string>()) =>
  layoutTree(withOthers({ unions: U, persons, opened, expanded: exp, birth }, note));

describe('геометрия связей', () => {
  it('ортогональная связь: вправо, поворот посередине промежутка перед целью, вправо до цели', () => {
    const a = { x: 40, y: 100, w: 260, h: 120 };
    const b = { x: 340, y: 300, w: 260, h: 100 };
    const pts = edgePoints(a, b);
    expect(pts[0]).toEqual([300, 160]);
    expect(pts[pts.length - 1]).toEqual([340, 350]);
    expect(pts[1][0]).toBe(320);
    expect(pts[2]).toEqual([320, 350]);
  });
  it('углы закруглены радиусом 6 px (квадратичные кривые), прямая — без кривых', () => {
    const d = roundedPath([[0, 0], [20, 0], [20, 40], [40, 40]]);
    expect(d.match(/Q/g)?.length).toBe(2);
    expect(d).toContain('L14 0 Q20 0 20 6');
    expect(roundedPath([[0, 0], [40, 0]])).not.toContain('Q');
  });
  it('двойная лента: нити параллельны — горизонтали сдвинуты вверх, вертикаль — в сторону хода', () => {
    const a = { x: 40, y: 100, w: 260, h: 120 };
    const b = { x: 340, y: 300, w: 260, h: 100 };
    const up = edgePoints(a, b, 2);
    expect(up[0][1]).toBe(158);
    expect(up[1][0]).toBe(322);
    const back = edgePoints(b, { ...a, y: 0 }, 0);
    expect(back.length).toBe(6);
  });
  it('карточки: лицо и союз — во всю ширину столбца без промежутка; союз — между столбцами лиц', () => {
    const t = lay(['adam'], ['adam']);
    const u = t.nodes.find((n) => n.kind === 'union')!;
    expect(nodeBox(u).x).toBe(TREE.pad + TREE.colW);
    expect(nodeBox(t.byKey.get(personKey('adam'))!).w).toBe(CARD_W.person);
  });
});

describe('камера', () => {
  it('масштаб у точки: точка полотна под указателем остаётся на месте; пределы 0,3…1,6', () => {
    const c = zoomAt({ x: 10, y: 20, k: 1 }, 1.25, 200, 100);
    expect((200 - c.x) / c.k).toBeCloseTo((200 - 10) / 1);
    expect(zoomAt(c, 100, 0, 0).k).toBe(K_MAX);
    expect(zoomAt(c, 0.01, 0, 0).k).toBe(K_MIN);
  });
  it('вписать: не крупнее 1, прижать влево, по высоте — посередине', () => {
    const c = fitCam({ x: 40, y: 40, w: 260, h: 120 }, 900, 700, { m: 48, kMax: 1, left: true });
    expect(c.k).toBe(1);
    expect(c.x + 40).toBe(48);
    expect(c.y + 40 + 60).toBe(350);
  });
  it('показать группу: сдвиг ровно до края с полем; если не помещается — мельче, но не меньше 0,3', () => {
    const c = { x: 0, y: 0, k: 1 };
    const r = revealCam(c, { x: 900, y: 100, w: 260, h: 120 }, 1000, 800, { m: 24 });
    expect(r.k).toBe(1);
    expect(toScreen(r, { x: 900, y: 100, w: 260, h: 120 }).x + 260).toBe(1000 - 24);
    const same = revealCam(c, { x: 100, y: 100, w: 260, h: 120 }, 1000, 800, { m: 24 });
    expect(same).toEqual(c);
    const big = revealCam(c, { x: 0, y: 0, w: 4000, h: 300 }, 1000, 800, { m: 24 });
    expect(big.k).toBeCloseTo(K_MIN);
  });
});

describe('«Другие сыновья и дочери» (Быт 5:4)', () => {
  it('запись § 10 «родил сынов и дочерей» у отца; у Евы (о матери не сказано) — нет', () => {
    expect(othersNote({ childrenNote: [{ text: 'По рождении Сифа родил сынов и дочерей; их имена не названы', refs: ['Быт 5:4'] }] })?.refs).toEqual(['Быт 5:4']);
    expect(othersNote({ childrenNote: [{ text: 'Мать Каина, Авеля и Сифа; о матери других сынов и дочерей Адама (Быт 5:4) не сказано', refs: ['Быт 5:4'] }] })).toBeNull();
  });
  it('союз «других детей»: единственный союз отца с детьми, иначе союз без названной матери', () => {
    expect(othersUnionOf(U, 'adam')?.id).toBe('u:adam+eva');
    expect(othersUnionOf(U, 'sif')?.id).toBe('u:sif+');
    expect(othersUnionOf(U, 'david')?.id).toBe('u:david+');
    expect(othersUnionOf(U, 'avraam')).toBeNull();
  });
  it('в раскладке — последней в столбце детей союза, без наложений; скрытые дети считаются как прежде', () => {
    const uid = 'u:adam+eva';
    const t = lay(['adam', 'eva', 'kain', 'avel', 'sif'], ['adam'], [uid], new Set([uid]));
    const o = t.byKey.get(personKey(othersId(uid)))!;
    const kids = ['kain', 'avel', 'sif'].map((k) => t.byKey.get(personKey(k))!);
    expect(o.layer).toBe(kids[0].layer);
    expect(o.y).toBeGreaterThan(Math.max(...kids.map((k) => k.y)));
    const u = t.byKey.get(uid)!;
    expect(u.kind === 'union' && u.hidden).toBe(0);
    expect(t.edges.some((e) => e.kind === 'child' && isOthers(e.kid ?? ''))).toBe(true);
    // общий объект союзов не тронут
    expect(U.byId.get(uid)!.kids).toEqual(['kain', 'avel', 'sif']);
  });
});

describe('строки карточек', () => {
  it('союз: вид связи словами данных; неназванная мать; законный отец', () => {
    expect(unionKindLine(U.byId.get('u:adam+eva')!)).toBe('Ева — жена Адама');
    expect(unionKindLine(U.byId.get('u:sif+')!)).toBe('имя жены в Писании не названо');
    expect(unionKindLine(U.byId.get('u:iosif-muzh-marii+mariya')!)).toBe('Иосиф — законный отец');
    expect(unionKindLine(U.byId.get('u:avraam+khettura')!)).toBe('Хеттура — наложница Авраама');
  });
  it('пустое место (решение 75): «Жена Сифа (мать Еноса)», имя не названо; детей несколько — «мать … и других детей»', () => {
    expect(unnamedText(U.byId.get('u:sif+')!, 'b')).toBe('Жена Сифа (мать Еноса), имя в Писании не названо');
    const many = [...U.byId.values()].find((x) => x.a && !x.b && !x.claim && x.kids.length > 2);
    if (many) expect(unnamedText(many, 'b')).toMatch(/^Жена .+ \(мать .+ и других детей\), имя в Писании не названо$/);
  });
  it('команда детей союза: «Раскрыть детей (3)», «Раскрыть ещё (2)» (остальных детей), «Свернуть детей»; без детей — нет', () => {
    const u = U.byId.get('u:adam+eva')!;
    expect(kidsCommand(u, false, 3)?.text).toBe('Раскрыть детей (3)');
    expect(kidsCommand(u, false, 2)).toMatchObject({ text: 'Раскрыть ещё (2)', label: 'Раскрыть ещё (2): остальных детей союза' });
    expect(kidsCommand(u, true, 0)?.text).toBe('Свернуть детей');
    expect(kidsCommand(U.byId.get('u:david+melkhola')!, false, 0)).toBeNull();
  });
});

describe('команды лица на древе', () => {
  beforeEach(() => startWith('adam'));
  it('«С Адама»: у Адама — «Свернуть ветвь» (союз показан), родителей нет', () => {
    const t = treeLayout.value;
    expect(t.byKey.has('u:adam+eva')).toBe(true);
    expect(personCmds(t, 'adam')).toEqual({ more: false, fold: true, parents: false, hideParents: false });
  });
  it('Сиф: «Продолжить ветвь» показывает его союз, «Свернуть ветвь» убирает и раскрытое от него, союз родителей остаётся', () => {
    expandUnion('u:adam+eva', 'adam');
    let t = treeLayout.value;
    expect(personCmds(t, 'sif').more).toBe(true);
    continueBranch('sif');
    t = treeLayout.value;
    expect(t.byKey.has('u:sif+')).toBe(true);
    expect(personCmds(t, 'sif').fold).toBe(true);
    expandUnion('u:sif+', 'sif');
    expect(treeLayout.value.byKey.has(personKey('enos'))).toBe(true);
    foldBranch('sif');
    t = treeLayout.value;
    expect(t.byKey.has('u:sif+')).toBe(false);
    expect(t.byKey.has(personKey('enos'))).toBe(false);
    expect(t.byKey.has('u:adam+eva')).toBe(true);
  });
  it('вверх от Иисуса Христа: «Родители» у Иосифа — союз Иакова без братьев; «Скрыть родителей» убирает', () => {
    startWith('jesus');
    let t = treeLayout.value;
    expect(t.byKey.has('u:iosif-muzh-marii+mariya')).toBe(true);
    expect(personCmds(t, 'iosif-muzh-marii').parents).toBe(true);
    const before = workSet.value.size;
    showParents('iosif-muzh-marii');
    t = treeLayout.value;
    expect(t.byKey.has('u:iakov-otets-iosifa+')).toBe(true);
    // Иосиф и Иаков — в наборе; братьев Иосифа нет
    expect(workSet.value.size).toBe(before + 2);
    expect(personCmds(t, 'iosif-muzh-marii').hideParents).toBe(true);
    hideParents('iosif-muzh-marii');
    t = treeLayout.value;
    expect(t.byKey.has('u:iakov-otets-iosifa+')).toBe(false);
    expect(t.byKey.has('u:iosif-muzh-marii+mariya')).toBe(true);
  });
  it('у Иисуса Христа (начало): союз родителей показан, «Скрыть родителей» убирает его', () => {
    startWith('jesus');
    expect(personCmds(treeLayout.value, 'iisus').hideParents).toBe(true);
    hideParents('iisus');
    expect(opened.value).not.toContain('iisus');
    expect(treeLayout.value.nodes.length).toBe(1);
    expect(Object.keys(expanded.value)).toEqual([]);
  });
});

describe('подсветка выбранного (решение 69)', () => {
  const ids = ['adam', 'eva', 'kain', 'avel', 'sif', 'enos'];
  const t: TreeLayout = lay(ids, ['adam', 'sif'], ['u:adam+eva', 'u:sif+']);
  const ek = (from: string, to: string) => t.edges.findIndex((e) => e.from === from && e.to === to);
  it('Адам: дети — три ветви разных цветов; Енос — в ветви Сифа, во втором поколении', () => {
    const h = highlightOf(t, 'adam', branchesOf(U, graph, 'adam'))!;
    const g = (id: string) => h.nodes.get(personKey(id));
    const b = ['kain', 'avel', 'sif'].map((id) => { const x = g(id); return x?.kind === 'desc' ? x.branch : -1; });
    expect(new Set(b).size).toBe(3);
    const en = g('enos');
    expect(en?.kind === 'desc' && en.branch).toBe(b[2]);
    expect(en?.kind === 'desc' && en.gen).toBe(2);
    // связь Адама с его единственным союзом — общая для ветвей
    expect(h.edges.get(ek(personKey('adam'), 'u:adam+eva'))?.kind).toBe('self');
  });
  it('Енос: путь к предкам светится, братья Сифа гаснут', () => {
    const h = highlightOf(t, 'enos', branchesOf(U, graph, 'enos'))!;
    expect(h.edges.get(ek('u:sif+', personKey('enos')))?.kind).toBe('anc');
    expect(h.edges.get(ek('u:adam+eva', personKey('sif')))?.kind).toBe('anc');
    expect(h.edges.get(ek(personKey('adam'), 'u:adam+eva'))?.kind).toBe('anc');
    expect(h.edges.has(ek('u:adam+eva', personKey('kain')))).toBe(false);
  });
  it('лица нет на древе — подсветки нет', () => {
    expect(highlightOf(t, 'david', branchesOf(U, graph, 'david'))).toBeNull();
  });
});

describe('ленты линий Мессии', () => {
  it('Адам → союз → Сиф — обе нити; Каин — ни одной', () => {
    const t = lay(['adam', 'eva', 'kain', 'avel', 'sif'], ['adam'], ['u:adam+eva']);
    const e = (from: string, to: string) => t.edges.find((x) => x.from === from && x.to === to)!;
    expect(ribbonOf(t, e('u:adam+eva', personKey('sif')))).toMatchObject({ joseph: true, mary: true });
    expect(ribbonOf(t, e(personKey('adam'), 'u:adam+eva'))).toMatchObject({ joseph: true, mary: true });
    expect(ribbonOf(t, e('u:adam+eva', personKey('kain')))).toBeNull();
  });
  it('Давид и Вирсавия: к Соломону — золотая (Мф), к Нафану — лазурная (Лк)', () => {
    const t = lay(['david', 'virsaviya', 'solomon', 'nafan-syn-davida'], ['david'], ['u:david+virsaviya']);
    const e = (to: string) => t.edges.find((x) => x.from === 'u:david+virsaviya' && x.to === personKey(to));
    const sol = e('solomon');
    const naf = e('nafan-syn-davida');
    expect(ribbonOf(t, sol!)).toMatchObject({ joseph: true, mary: false });
    expect(ribbonOf(t, naf!)).toMatchObject({ joseph: false, mary: true });
  });
});

describe('клавиатура', () => {
  const t = lay(['adam', 'eva', 'kain', 'avel', 'sif'], ['adam'], ['u:adam+eva']);
  it('порядок Tab — по столбцам слева направо, в столбце сверху вниз', () => {
    const o = tabOrder(t);
    for (let i = 1; i < o.length; i++) expect(o[i].layer > o[i - 1].layer || (o[i].layer === o[i - 1].layer && o[i].y >= o[i - 1].y)).toBe(true);
  });
  it('→ от Адама — союз; → от союза — ребёнок; ← от ребёнка — союз; ↓ — следующий в столбце', () => {
    expect(neighbor(t, personKey('adam'), 'right')).toBe('u:adam+eva');
    const kid = neighbor(t, 'u:adam+eva', 'right')!;
    expect(['kain', 'avel', 'sif'].map(personKey)).toContain(kid);
    expect(neighbor(t, kid, 'left')).toBe('u:adam+eva');
    expect(neighbor(t, personKey('adam'), 'down')).toBe(personKey('eva'));
    expect(neighbor(t, personKey('adam'), 'left')).toBeNull();
  });
});

describe('образы лиц (решение 74)', () => {
  it('вариант силуэта — по id и полу, один и тот же всегда; мужских пять, женских четыре', () => {
    expect(MALE_VARIANTS.length).toBe(5);
    expect(FEMALE_VARIANTS.length).toBe(4);
    expect(variantOf('adam', 'm')).toBe(variantOf('adam', 'm'));
    expect(FEMALE_VARIANTS).toContain(variantOf('eva', 'f'));
    const vs = new Set(['kain', 'avel', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh'].map((id) => variantOf(id, 'm')));
    expect(vs.size).toBeGreaterThanOrEqual(3);
  });
  it('Иисус Христос — звезда; народ — группа; остальные — силуэт (изображений пока нет)', () => {
    expect(lookOf('iisus').kind).toBe('star');
    expect(lookOf('adam').kind).toBe('figure');
    expect(lookOf(persons.find((p) => p.kind === 'people')!.id).kind).toBe('group');
    expect(lookOf('eva')).toMatchObject({ kind: 'figure', sex: 'f' });
  });
});
