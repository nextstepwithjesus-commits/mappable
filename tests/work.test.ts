/**
 * Рабочий набор, небо по набору, свёртка и стопка карточек (J3–J6; решение владельца 17) без браузера:
 * объём «взять в работу» по графу, сжатие полос (src/render/rows.ts), план неба и стопка.
 * Поведение в браузере — сценарии 200–219 (tools/accept/work.ts).
 */
import { describe, it, expect } from 'vitest';
import { byId, graph, groupById, lines, models } from '../src/data/atlas.ts';
import { identityRows, planSky, rowsFromHeights, walk, ROW_GAP, type PlanData, type SkyView } from '../src/render/rows.ts';
import {
  addPath, addToWork, cardStack, clearWork, lineOf, pushCard, removeFromWork, removeWithLine, scopeIds, STACK_MAX, workOrder, workSet,
} from '../src/ui/work.ts';

const m = models[0];
const data: PlanData = {
  graph, nodes: m.nodes, laneMin: m.laneMin, laneMax: m.laneMax, t0: (i) => m.nodes[i].t0, groupOf: (id) => byId.get(id)?.group,
  parentGroup: (g) => groupById.get(g)?.parent, cluster: (b) => !!m.blocks[b]?.cluster,
};
const view = (o: Partial<SkyView> = {}): SkyView => ({ mode: 'all', set: new Set(), foldDesc: [], foldGroups: [], ...o });
const spine = new Set([...lines.joseph.persons, ...lines.mary.persons].map((x) => x.id));

describe('объём «Взять в работу» по графу (J3)', () => {
  it('предки Давида: 1 поколение — Иессей; 3 — ещё Овид, Вооз и Руфь; все — до Адама', () => {
    const at = (gen: number | null) => scopeIds('david', { kind: 'anc', gen }).map((x) => x.id);
    expect(at(1)).toEqual(['david', 'iessey']);
    expect(at(3)).toEqual(expect.arrayContaining(['iessey', 'ovid', 'vooz', 'ruf']));
    expect(at(2)).not.toContain('vooz');
    const all = at(null);
    expect(all).toContain('adam');
    expect(all).toContain('avraam');
    // поколения от лица — в ширину: самое короткое
    const g = new Map(scopeIds('david', { kind: 'anc', gen: null }).map((x) => [x.id, x.gen]));
    expect(g.get('iessey')).toBe(1);
    expect(g.get('ovid')).toBe(2);
  });
  it('потомки: 1 поколение — дети; «все» шире', () => {
    const one = scopeIds('david', { kind: 'desc', gen: 1 }).map((x) => x.id);
    expect(one).toContain('solomon');
    expect(one).toContain('avessalom');
    expect(one).not.toContain('rovoam');
    const all = scopeIds('david', { kind: 'desc', gen: null }).map((x) => x.id);
    expect(all).toContain('rovoam');
    expect(all.length).toBeGreaterThan(one.length);
  });
  it('семья: родители, супруги, дети, братья и сёстры', () => {
    const f = scopeIds('david', { kind: 'family' }).map((x) => x.id);
    for (const id of ['iessey', 'virsaviya', 'melkhola', 'solomon', 'eliav-syn-iesseya']) expect(f).toContain(id);
  });
  it('связи по толкованию — только по выбору: Илий как отец Марии (толкование, ТЗ § 3.2)', () => {
    const parent = (graph.parentsOf.get('mariya') ?? []).find((e) => e.kind === 'father');
    expect(parent?.cert).toBe('interpretation');
    expect(scopeIds('mariya', { kind: 'anc', gen: 1 }).map((x) => x.id)).not.toContain(parent!.parent);
    expect(scopeIds('mariya', { kind: 'anc', gen: 1, interp: true }).map((x) => x.id)).toContain(parent!.parent);
  });
});

describe('рабочий набор (J3)', () => {
  it('взять, убрать, убрать с родословной, очистить; порядок — по рождению', () => {
    clearWork();
    expect(addToWork('david', { kind: 'anc', gen: 2 })).toBe(3);
    expect([...workSet.value.keys()]).toEqual(['david', 'iessey', 'ovid']);
    expect(workSet.value.get('ovid')).toMatchObject({ via: 'anc', of: 'david', gen: 2 });
    // уже бывшее в наборе не дублируется; взятое само — помета «само»
    expect(addToWork('iessey')).toBe(0);
    expect(workSet.value.get('iessey')?.via).toBe('self');
    expect(lineOf('david')).toEqual(['ovid']);
    const birth = (id: string) => m.chrono.get(id)?.b ?? null;
    expect(workOrder(birth)).toEqual(['ovid', 'iessey', 'david']);
    removeFromWork('iessey');
    expect(workSet.value.has('iessey')).toBe(false);
    removeWithLine('david');
    expect(workSet.value.size).toBe(0);
    addPath(['ruf', 'ovid', 'iessey', 'david']);
    expect(workSet.value.get('ruf')?.via).toBe('self');
    expect(workSet.value.get('david')).toMatchObject({ via: 'path', of: 'ruf' });
    clearWork();
    expect(workSet.value.size).toBe(0);
  });
  it('без хранилища (localStorage недоступен) набор работает, только не помнится', () => {
    const was = (globalThis as { window?: unknown }).window;
    // в тестах нет window: чтение и запись в хранилище пропускаются, а не падают
    expect(was).toBeUndefined();
    expect(addToWork('ruf')).toBe(1);
    clearWork();
  });
});

describe('сжатие полос (J4, J5; src/render/rows.ts)', () => {
  it('тождественное отображение: строка = полоса', () => {
    const r = identityRows(-5, 5);
    expect(r.identity).toBe(true);
    for (const l of [-5.5, -1, 0, 0.25, 3, 5.5]) {
      expect(r.row(l)).toBe(l);
      expect(r.lane(l)).toBe(l);
    }
    expect([r.min, r.max]).toEqual([-5.5, 5.5]);
  });
  it('по высотам: монотонно и непрерывно, убранные полосы — высотой 0, обратное — на своём месте', () => {
    // полосы −2…2: остаются −2, 0, 2; −1 убрана, 1 — зазор
    const r = rowsFromHeights(-2, [1, 0, 1, ROW_GAP, 1], 'k', 0);
    expect(r.row(0)).toBe(0);
    expect(r.row(-1)).toBeCloseTo(r.row(-0.5));
    expect(r.row(-2) - r.row(0)).toBeCloseTo(-1);
    expect(r.row(2) - r.row(0)).toBeCloseTo(1 + ROW_GAP);
    let prev = -Infinity;
    for (let l = -3; l <= 3; l += 0.05) {
      const y = r.row(l);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      // непрерывно: соседние точки близко
      if (prev > -Infinity) expect(y - prev).toBeLessThanOrEqual(0.05 + 1e-9);
      prev = y;
      if (l > -2.5 && l < 2.5 && Math.abs(l + 1) > 0.5) expect(r.row(r.lane(y))).toBeCloseTo(y, 6);
    }
    expect(r.max - r.min).toBeCloseTo(3 + ROW_GAP);
  });
  it('«Всё небо» без свёрнутого — тождественно, скрытых нет (небо не меняется ни на пиксель)', () => {
    const p = planSky(data, view({ set: new Set(['david', 'ruf']) }));
    expect(p.rows.identity).toBe(true);
    expect(p.hidden).toBeNull();
    expect(p.marks).toEqual([]);
    expect([p.rows.min, p.rows.max]).toEqual([m.laneMin - 0.5, m.laneMax + 0.5]);
  });
  it('«В работе»: видны только лица набора, пустые полосы убраны, порядок полос сохранён, между родами — зазор', () => {
    const set = new Set(scopeIds('david', { kind: 'family' }).map((x) => x.id));
    const p = planSky(data, view({ mode: 'work', set }));
    expect(p.mode).toBe('work');
    const shown = m.nodes.map((n, i) => (p.hidden![i] ? null : n)).filter((n): n is NonNullable<typeof n> => !!n);
    expect(shown.every((n) => set.has(n.person) && !n.ghost)).toBe(true);
    expect(new Set(shown.map((n) => n.person)).size).toBe(set.size);
    const lanes = [...new Set(shown.map((n) => n.lane))].sort((a, b) => a - b);
    // строк — не больше, чем полос с лицами набора, и зазоры между родами
    const span = p.rows.max - p.rows.min;
    expect(span).toBeGreaterThanOrEqual(lanes.length);
    expect(span).toBeLessThanOrEqual(lanes.length + (lanes.length - 1) * ROW_GAP + 1e-6);
    // порядок: выше полоса — выше строка; соседние полосы набора — ровно одна строка (или строка с зазором)
    for (let k = 1; k < lanes.length; k++) {
      const d = p.rows.row(lanes[k]) - p.rows.row(lanes[k - 1]);
      expect(d).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(d).toBeLessThanOrEqual(1 + ROW_GAP + 1e-9);
    }
    // лица вне набора скрыты целиком
    expect(p.hiddenPersons.has('adam')).toBe(true);
    expect(p.hiddenPersons.has('david')).toBe(false);
  });
  it('пустой набор в режиме «В работе» — небо пусто, строк нет', () => {
    const p = planSky(data, view({ mode: 'work' }));
    expect(p.hidden!.every((h) => h === 1)).toBe(true);
    expect(p.rows.max - p.rows.min).toBeCloseTo(0);
  });
  it('свёрнутые потомки: скрыты потомки (кроме лиц линий Мессии), знак «+N»; полосы сжаты только там, где опустели', () => {
    const p = planSky(data, view({ foldDesc: ['isav'] }));
    const desc = walk(graph, 'isav', 'down', null, { other: true });
    const mark = p.marks.find((x) => x.kind === 'desc' && x.id === 'isav')!;
    expect(mark.count).toBeGreaterThanOrEqual(desc.size);
    expect(p.hiddenPersons.has('isav')).toBe(false);
    for (const id of desc.keys()) if (!spine.has(id) && m.nodeByPerson.has(id)) expect(p.hiddenPersons.has(id), id).toBe(true);
    // полосы Едома заняты и лицами других эпох: ни одна не опустела — сжатия нет, небо на месте
    expect(p.rows.identity).toBe(true);
    // потомки Саула занимают полосы целиком: они убираются, остальные строки — высотой 1, ось коридора — на месте
    const ps = planSky(data, view({ foldDesc: ['saul'] }));
    expect(ps.rows.identity).toBe(false);
    expect(ps.rows.max - ps.rows.min).toBeLessThan(m.laneMax - m.laneMin + 1);
    expect(ps.rows.row(0)).toBe(0);
    for (const id of ['david', 'saul', 'isav']) {
      const l = m.nodeByPerson.get(id)!.lane;
      expect(ps.rows.row(l + 0.5) - ps.rows.row(l - 0.5), id).toBeCloseTo(1);
    }
    const gone = m.nodes.filter((n) => walk(graph, 'saul', 'down', null, { other: true }).has(n.person) && !spine.has(n.person));
    const empty = gone.map((n) => n.lane).filter((l) => m.nodes.every((n) => n.lane !== l || gone.includes(n)));
    expect(empty.length).toBeGreaterThan(0);
    for (const l of empty) expect(ps.rows.row(l + 0.5) - ps.rows.row(l - 0.5)).toBeLessThan(1);
    // лица линий Мессии свёртка не прячет
    const pd = planSky(data, view({ foldDesc: ['avraam'] }));
    expect(pd.hiddenPersons.has('david')).toBe(false);
    expect(pd.hiddenPersons.has('isav')).toBe(true);
  });
  it('свёрнутое созвездие: его лица и лица вложенных домов скрыты, одна строка-подпись с числом лиц', () => {
    const p = planSky(data, view({ foldGroups: ['judah'] }));
    const mark = p.marks.find((x) => x.kind === 'group' && x.id === 'judah')!;
    expect(mark.count).toBeGreaterThan(50);
    // дом Давидов лежит в колене Иудином
    expect(p.hiddenPersons.has('avessalom')).toBe(true);
    expect(p.hiddenPersons.has('david')).toBe(false);
    // строка-подпись: вокруг её полосы — одна строка
    const l = mark.lane!;
    expect(p.rows.row(l + 0.5) - p.rows.row(l - 0.5)).toBeGreaterThan(0);
    expect(mark.t0).toBeLessThan(0);
  });
  it('свёртка работает и в режиме «В работе»: знак «+N» считает скрытых лиц набора', () => {
    const set = new Set(['david', ...scopeIds('david', { kind: 'desc', gen: 2 }).map((x) => x.id)]);
    const p = planSky(data, view({ mode: 'work', set, foldDesc: ['david'] }));
    const mark = p.marks.find((x) => x.id === 'david')!;
    const hiddenOfSet = [...set].filter((id) => id !== 'david' && !spine.has(id) && m.nodeByPerson.has(id));
    expect(mark.count).toBe(new Set(hiddenOfSet).size);
    for (const id of hiddenOfSet) expect(p.hiddenPersons.has(id)).toBe(true);
  });
});

describe('стопка карточек (J6)', () => {
  it('выбор кладёт карточку наверх; повтор не дублирует; не больше шести', () => {
    let st: string[] = [];
    for (const id of ['ruf', 'vooz', 'david', 'ruf']) st = pushCard(id, st);
    expect(st).toEqual(['ruf', 'david', 'vooz']);
    for (const id of ['adam', 'sif', 'enos', 'kainan', 'maleleil']) st = pushCard(id, st);
    expect(st.length).toBe(STACK_MAX);
    expect(st[0]).toBe('maleleil');
    expect(st).not.toContain('vooz');
    expect(cardStack.value).toEqual([]);
  });
});
