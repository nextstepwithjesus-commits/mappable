/**
 * Модель показа и составы (этап 11, § 5 и § 7; решения 81, 82; src/ui/show.ts, src/engine/lineage.ts):
 *  — Я26: фильтры дают состав из данных — «Дом Нахора»: основатель, гость Милка, обрывки к Ревекке, Лие, Рахили и Фарре;
 *    «потомки Иуды по отцам» совпадают с lineage.ts; «Колено Иудино со связями» — лица колена и гости одного шага;
 *  — правило дочерей (дочь рода с детьми в том же роду; иначе «+N»), гости, обрывки со словами по ru.ts;
 *  — строка «На небе: …», разделы листа «Показ», числа до применения, ключ показа туда и обратно;
 *  — план неба по показу: семейная укладка — виртуальные полосы узлов (стык 2, § 13).
 */
import { describe, expect, it } from 'vitest';
import { byId, graph, models, persons } from '../src/data/atlas.ts';
import { linkKeyString, parseLinkKey } from '../src/engine/linkkey.ts';
import { lineageOf } from '../src/engine/lineage.ts';
import { planSky } from '../src/render/rows.ts';
import { KEY_IDS, LINE_IDS } from '../src/ui/reveal.ts';
import {
  contentOf, countShow, groupSections, parseShow, setShow, show, showContent, showKey, showLinksField, skyShow, summaryOf, TRIBES, type Show,
} from '../src/ui/show.ts';
import { linkExists } from '../src/ui/address.ts';

const NAHOR: Show = { kind: 'groups', groups: ['nahorites'], links: 'stubs' };
const name = (id: string) => byId.get(id)?.name ?? id;

describe('Я26: «Дом Нахора» — основатель, гость Милка, обрывки к Ревекке, Лие, Рахили и Фарре', () => {
  const c = contentOf(NAHOR);
  it('лица созвездия и основатель Нахор (он лежит в «Доме Фарры»)', () => {
    const members = persons.filter((p) => p.group === 'nahorites').map((p) => p.id);
    expect(members.length).toBe(15);
    for (const id of members) expect(c.ids.has(id), name(id)).toBe(true);
    expect(c.founder).toBe('nakhor-syn-farry');
    expect(byId.get('nakhor-syn-farry')!.group).toBe('terahites');
    expect(c.ids.has('nakhor-syn-farry')).toBe(true);
    expect(c.founders.has('nakhor-syn-farry')).toBe(true);
    expect(c.ids.size).toBe(16);
    expect(c.layout).toBe('family');
  });
  it('гость — Милка, жена Нахора и мать восьми его сыновей', () => {
    expect([...c.guests]).toEqual(['milka']);
  });
  it('обрывки: Ревекка, Лия, Рахиль — дочери дома, жёны в «Патриархах»; Фарра — отец Нахора', () => {
    const by = new Map(c.stubs.map((s) => [s.to, s]));
    expect(new Set(by.keys())).toEqual(new Set(['revekka', 'liya', 'rakhil', 'farra']));
    expect(by.get('revekka')).toMatchObject({ from: 'vafuil', words: 'Ревекка, дочь Вафуила', where: 'жена Исаака; в «Патриархах»' });
    expect(by.get('liya')).toMatchObject({ from: 'lavan', words: 'Лия, дочь Лавана', where: 'жена Иакова; в «Патриархах»' });
    expect(by.get('rakhil')).toMatchObject({ from: 'lavan', words: 'Рахиль, дочь Лавана', where: 'жена Иакова; в «Патриархах»' });
    expect(by.get('farra')).toMatchObject({ from: 'nakhor-syn-farry', words: 'Фарра, отец Нахора' });
    for (const s of c.stubs) {
      expect(s.key.kind).toBe('child');
      expect(linkExists(s.key), JSON.stringify(s.key)).toBe(true);
    }
  });
  it('строка показа: «На небе: созвездие «Дом Нахора» — 17 лиц; основатель Нахор; 4 связи наружу» (в числе — все на небе)', () => {
    const sm = summaryOf(NAHOR);
    expect(sm.label).toBe('На небе: созвездие «Дом Нахора» — 17 лиц; основатель Нахор; 4 связи наружу');
    expect(sm.cmds.map((p) => p.text)).toEqual(['изменить', 'добавить созвездие «Патриархи»', 'всё небо']);
    expect(sm.cmds[0].cmd).toEqual({ kind: 'sheet' });
    expect(sm.cmds[1].cmd).toEqual({ kind: 'show', show: { kind: 'groups', groups: ['nahorites', 'patriarchs'], links: 'stubs' } });
    expect(sm.cmds[2].cmd).toEqual({ kind: 'show', show: { kind: 'all' } });
  });
});

describe('Я26: род Иуды по отцам совпадает с lineage.ts; правило дочерей', () => {
  const s: Show = { kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' };
  const c = contentOf(s);
  const l = lineageOf('iuda', 'down', null, 'father');
  it('лица и гости — из lineageOf', () => {
    expect([...c.ids].sort()).toEqual([...l.ids].sort());
    expect([...c.guests].sort()).toEqual([...l.guests].sort());
    expect(c.layout).toBe('family');
  });
  it('по отцам: 246 лиц; жёны — гости (Фамарь, Руфь, Вирсавия), род не вбирает их родню', () => {
    expect(c.ids.size).toBe(246);
    for (const g of ['famar', 'ruf', 'virsaviya']) expect(c.guests.has(g), name(g)).toBe(true);
    for (const g of c.guests) expect(c.ids.has(g)).toBe(false);
  });
  it('дочь рода с детьми в том же роду: сын дочери Шешана и Иархи (1 Пар 2:34–35) — в роде', () => {
    expect(c.ids.has('doch-sheshana')).toBe(true);
    expect(c.ids.has('attay-syn-iarkhi')).toBe(true);
  });
  it('дочь рода, чьи дети вне рода, — со знаком «+N»: Елисавета, жена Аарона (её дети — в «Священниках»)', () => {
    expect(c.plus.get('elisaveta-zhena-aarona')).toBeGreaterThan(30);
    expect(c.ids.has('elisaveta-zhena-aarona')).toBe(true);
    expect(c.ids.has('eleazar')).toBe(false);
  });
  it('обрывок — к родителям Иуды: «Иаков и Лия, родители Иуды», «в «Патриархах»»', () => {
    expect(c.stubs.map((x) => [x.words, x.where])).toEqual([['Иаков и Лия, родители Иуды', 'в «Патриархах»']]);
    expect(c.stubs[0].key).toEqual({ kind: 'child', union: 'u:iakov+liya', child: 'iuda' });
  });
  it('по крови — больше, чем по отцам; «+N» нет', () => {
    const b = contentOf({ ...s, by: 'blood' });
    expect(b.ids.size).toBeGreaterThan(c.ids.size);
    for (const id of c.ids) expect(b.ids.has(id)).toBe(true);
    expect(b.plus.size).toBe(0);
  });
  it('строка показа: изменяемые части — меню направления, поколений и «по отцам | по крови»', () => {
    const sm = summaryOf(s);
    expect(sm.label).toBe('На небе: потомки Иуды (сын Иакова) — все поколения; по отцам — 288 лиц');
    const menus = sm.text.filter((p) => p.cmd?.kind === 'menu');
    expect(menus.map((p) => (p.cmd as { field: string }).field)).toEqual(['dir', 'gen', 'by']);
    const by = menus[2].cmd as { options: readonly { label: string; show: Show; current: boolean }[] };
    expect(by.options.map((o) => [o.label, o.current])).toEqual([
      ['по отцам', true],
      ['по крови', false],
    ]);
    expect(by.options[1].show).toEqual({ ...s, by: 'blood' });
    expect(sm.cmds.map((p) => p.text)).toEqual(['всё небо']);
  });
});

describe('род лица: Нахор, поколения, предки', () => {
  it('Нахор по отцам — сам и 17 потомков; у Ревекки, Лии и Рахили — «+N» (их дети в «Патриархах» и коленах)', () => {
    const c = contentOf({ kind: 'lineage', id: 'nakhor-syn-farry', dir: 'down', gen: null, by: 'father' });
    expect(c.ids.size).toBe(18);
    for (const d of ['revekka', 'liya', 'rakhil']) expect(c.plus.get(d), name(d)).toBeGreaterThan(50);
    expect(c.ids.has('iakov')).toBe(false);
    expect(c.guests).toEqual(new Set(['milka', 'reuma']));
  });
  it('Иаков, одно поколение потомков: 13 детей и 4 матери-гостьи', () => {
    const c = contentOf({ kind: 'lineage', id: 'iakov', dir: 'down', gen: 1, by: 'father' });
    expect(c.ids.size).toBe(14);
    expect(c.guests).toEqual(new Set(['liya', 'rakhil', 'valla', 'zelfa']));
  });
  it('Давид, предки по отцам: прямая линия до Адама; матери — гостьи (Руфь), а не лица рода', () => {
    const c = contentOf({ kind: 'lineage', id: 'david', dir: 'up', gen: null, by: 'father' });
    for (const id of ['iessey', 'ovid', 'vooz', 'iuda', 'iakov', 'avraam', 'noy', 'adam']) expect(c.ids.has(id), name(id)).toBe(true);
    expect(c.ids.has('ruf')).toBe(false);
    expect(c.guests.has('ruf')).toBe(true);
    expect(c.stubs).toEqual([]);
  });
  it('род женщины по отцам: её дети — все, дальше — по отцам (Ревекка: Исав и Иаков, их сыновья)', () => {
    const c = contentOf({ kind: 'lineage', id: 'revekka', dir: 'down', gen: 2, by: 'father' });
    for (const id of ['isav', 'iakov', 'ruvim', 'iosif']) expect(c.ids.has(id), name(id)).toBe(true);
    expect(c.guests.has('isaak')).toBe(true);
  });
  it('«оба направления» — предки и потомки вместе', () => {
    const c = contentOf({ kind: 'lineage', id: 'iakov', dir: 'both', gen: 2, by: 'father' });
    for (const id of ['isaak', 'avraam', 'iuda', 'fares']) expect(c.ids.has(id), name(id)).toBe(true);
    expect(c.ids.has('farra')).toBe(false);
  });
});

describe('Я26: «Колено Иудино со связями» — лица колена и гости одного шага', () => {
  it('лица колена и Дома Давидова; гости — ровно родители, дети и супруги вне колена', () => {
    const c = contentOf({ kind: 'groups', groups: ['judah', 'davidic'], links: 'kin' });
    const members = persons.filter((p) => p.group === 'judah' || p.group === 'davidic').map((p) => p.id);
    expect(new Set([...c.ids])).toEqual(new Set(members));
    const step = new Set<string>();
    for (const id of members) {
      for (const e of graph.parentsOf.get(id) ?? []) if (e.cert !== 'interpretation' && !c.ids.has(e.parent)) step.add(e.parent);
      for (const e of graph.childrenOf.get(id) ?? []) if (e.cert !== 'interpretation' && !c.ids.has(e.child)) step.add(e.child);
      for (const e of graph.spousesOf.get(id) ?? []) {
        const o = e.a === id ? e.b : e.a;
        if (e.cert !== 'interpretation' && !c.ids.has(o)) step.add(o);
      }
    }
    expect(c.guests).toEqual(step);
    expect(c.guests.has('iakov')).toBe(true);
    expect(c.stubs).toEqual([]);
  });
  it('обрывками: гости — только жёны и матери, остальное — обрывки из лиц колена наружу', () => {
    const c = contentOf({ kind: 'groups', groups: ['judah', 'davidic'], links: 'stubs' });
    expect(c.stubs.length).toBeGreaterThan(10);
    for (const s of c.stubs) {
      expect(c.ids.has(s.from), s.words).toBe(true);
      expect(c.ids.has(s.to) || c.guests.has(s.to), s.words).toBe(false);
      expect(linkKeyString(s.key)).not.toBeNull();
      expect(parseLinkKey(linkKeyString(s.key)!)).toEqual(s.key);
      expect(s.words.length).toBeGreaterThan(3);
    }
    // одна связь — один обрывок
    const keys = c.stubs.map((s) => `${s.from}>${s.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('без связей — ни гостей, ни обрывков', () => {
    const c = contentOf({ kind: 'groups', groups: ['judah'], links: 'none' });
    expect(c.guests.size).toBe(0);
    expect(c.stubs.length).toBe(0);
  });
});

describe('укладка показа', () => {
  it('«все колена» — карта со свёрткой прочего; одно колено, дом, созвездие, род, линии, набор — укладка «Г»', () => {
    expect(contentOf({ kind: 'groups', groups: TRIBES, links: 'stubs' }).layout).toBe('map');
    expect(contentOf({ kind: 'groups', groups: ['levi', 'aaronides'], links: 'stubs' }).layout).toBe('family');
    expect(contentOf({ kind: 'groups', groups: ['benjamin'], links: 'stubs' }).layout).toBe('family');
    expect(contentOf({ kind: 'lines' }).layout).toBe('family');
    expect(contentOf({ kind: 'set' }).layout).toBe('family');
    expect(contentOf({ kind: 'all' }).layout).toBe('map');
    expect(contentOf({ kind: 'key' }).layout).toBe('map');
  });
});

describe('укладка созвездий со списками (скопления общей раскладки)', () => {
  const m = models[0];
  const cells = new Map<string, { block: number; row: number }>();
  for (const b of m.blocks) if (b.cluster) for (const c of b.cluster.cells) cells.set(c.id, { block: b.id, row: c.row });
  it('«Плен и возвращение» — почти одни списки: картой; «Двор и войско царей» — укладкой «Г», и она не выше карты', () => {
    expect(contentOf({ kind: 'groups', groups: ['exiles'], links: 'stubs' }).layout).toBe('map');
    const c = contentOf({ kind: 'groups', groups: ['court'], links: 'stubs' });
    expect(c.layout).toBe('family');
    setShow({ kind: 'groups', groups: ['court'], links: 'stubs' });
    const lanes = skyShow.value.lanes!;
    const rows = new Set(lanes.values()).size;
    const mapRows = new Set([...lanes.keys()].map((id) => m.nodeByPerson.get(id)?.lane)).size;
    expect(rows).toBeLessThanOrEqual(mapRows);
  });
  it('лица скопления без родни вне его стоят блоком: порядок строк сетки сохранён', () => {
    setShow({ kind: 'groups', groups: ['court'], links: 'stubs' });
    const lanes = skyShow.value.lanes!;
    const by = new Map<number, string[]>();
    for (const id of lanes.keys()) {
      const c = cells.get(id);
      if (c) by.set(c.block, [...(by.get(c.block) ?? []), id]);
    }
    let checked = 0;
    for (const ids of by.values())
      for (const a of ids)
        for (const b of ids) {
          const ra = cells.get(a)!.row;
          const rb = cells.get(b)!.row;
          if (ra < rb && graph.parentsOf.get(a)?.length === undefined && graph.parentsOf.get(b)?.length === undefined) {
            checked++;
            // строка сетки выше (номер меньше) — выше и на небе
            expect(lanes.get(a)!, `${name(a)} над ${name(b)}`).toBeGreaterThan(lanes.get(b)!);
          }
        }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('лист «Показ»: разделы и числа', () => {
  const secs = groupSections();
  it('шесть разделов по порядку; все 42 созвездия; лиц — все лица атласа', () => {
    expect(secs.map((s) => s.name)).toEqual(['От Адама до Авраама', 'Патриархи и соседние народы', 'Колена Израилевы', 'Царства, плен и возвращение', 'Новый Завет', 'Прочие лица']);
    expect(secs.reduce((a, s) => a + s.groups.length, 0)).toBe(42);
    expect(secs.reduce((a, s) => a + s.count, 0)).toBe(persons.length);
  });
  it('колена: вложенные дома — сразу за своим коленом; Ефремово и Манассиино — в «Доме Иосифа»', () => {
    const t = secs.find((s) => s.id === 'tribes')!;
    const ids = t.groups.map((g) => g.id);
    expect(ids.indexOf('aaronides')).toBe(ids.indexOf('levi') + 1);
    expect(ids.indexOf('davidic')).toBe(ids.indexOf('judah') + 1);
    expect(ids.slice(ids.indexOf('joseph'), ids.indexOf('joseph') + 3)).toEqual(['joseph', 'ephraim', 'manasseh']);
    expect(ids.indexOf('saulides')).toBe(ids.indexOf('benjamin') + 1);
    for (const g of t.groups) expect(g.depth, g.id).toBe(['aaronides', 'davidic', 'ephraim', 'manasseh', 'saulides'].includes(g.id) ? 1 : 0);
    const judah = t.groups.find((g) => g.id === 'judah')!;
    expect(judah.total).toBe(judah.count + t.groups.find((g) => g.id === 'davidic')!.count);
    expect(t.count).toBe(countShow({ kind: 'groups', groups: TRIBES, links: 'none' }));
    // число до применения — все, кто будет на небе: лица и гости
    const c = contentOf({ kind: 'groups', groups: ['judah', 'davidic'], links: 'kin' });
    expect(countShow({ kind: 'groups', groups: ['judah', 'davidic'], links: 'kin' })).toBe(c.ids.size + c.guests.size);
  });
  it('числа до применения', () => {
    expect(countShow({ kind: 'all' })).toBe(persons.length);
    expect(countShow({ kind: 'lines' })).toBe(LINE_IDS.length);
    expect(LINE_IDS.length).toBe(104);
    expect(countShow({ kind: 'key' })).toBe(KEY_IDS.length);
    expect(countShow(NAHOR)).toBe(17);
  });
  it('«все колена»: строка «На небе: все колена — …»', () => {
    expect(summaryOf({ kind: 'groups', groups: TRIBES, links: 'stubs' }).label).toMatch(/^На небе: все колена — 1 \d{3} лиц/);
  });
});

describe('ключ показа туда и обратно; смена показа', () => {
  const shows: Show[] = [
    { kind: 'all' },
    { kind: 'lines' },
    { kind: 'key' },
    { kind: 'set' },
    NAHOR,
    { kind: 'groups', groups: ['judah', 'davidic'], links: 'kin' },
    { kind: 'groups', groups: ['benjamin'], links: 'none' },
    { kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' },
    { kind: 'lineage', id: 'iakov', dir: 'both', gen: 2, by: 'blood' },
    { kind: 'lineage', id: 'david', dir: 'up', gen: 3, by: 'father' },
  ];
  it('showKey и showLinksField → parseShow: тот же показ; только буквы, цифры, точка и дефис', () => {
    for (const s of shows) {
      const k = showKey(s);
      expect(k).toMatch(/^[a-z0-9.-]+$/);
      expect(parseShow(k, showLinksField(s))).toEqual(s);
    }
    expect(parseShow('g.nobody')).toBeNull();
    expect(parseShow('r.nobody.d.0.f')).toBeNull();
    expect(parseShow('r.iuda.x.0.f')).toBeNull();
    expect(parseShow('r.iuda.d.7.f')).toBeNull();
    expect(parseShow('q')).toBeNull();
  });
  it('setShow отбрасывает неизвестные созвездия; род неизвестного лица — всё небо', () => {
    setShow({ kind: 'groups', groups: ['nahorites', 'nobody', 'nahorites'], links: 'stubs' });
    expect(show.value).toEqual(NAHOR);
    setShow({ kind: 'lineage', id: 'nobody', dir: 'down', gen: null, by: 'father' });
    expect(show.value).toEqual({ kind: 'all' });
    setShow({ kind: 'groups', groups: ['nobody'], links: 'stubs' });
    expect(show.value).toEqual({ kind: 'all' });
  });
});

describe('план неба по показу (стык 2)', () => {
  const m = models[0];
  const data = {
    graph, nodes: m.nodes, laneMin: m.laneMin, laneMax: m.laneMax, t0: (i: number) => m.nodes[i].t0, groupOf: (id: string) => byId.get(id)?.group,
    parentGroup: () => undefined, cluster: (b: number) => !!m.blocks[b]?.cluster,
  };
  it('«Дом Нахора»: укладка «Г», виртуальные полосы у лиц показа и гостя, остальные узлы скрыты', () => {
    setShow(NAHOR);
    const inp = skyShow.value;
    expect(inp.layout).toBe('family');
    const plan = planSky(data, { show: inp, mode: 'all', set: new Set(), foldDesc: [], foldGroups: [] });
    expect(plan.layout).toBe('family');
    expect(plan.nodeLane).not.toBeNull();
    const on = new Set([...showContent.value.ids, ...showContent.value.guests]);
    let shown = 0;
    m.nodes.forEach((n, i) => {
      const inShow = !n.ghost && on.has(n.person);
      expect(Number.isFinite(plan.nodeLane![i]), n.id).toBe(inShow);
      expect(!!plan.hidden![i], n.id).toBe(!inShow);
      if (inShow) shown++;
    });
    expect(shown).toBe(17);
    expect(plan.guests).toEqual(new Set(['milka']));
    expect(plan.stubs.length).toBe(4);
    expect(plan.rows.identity).toBe(true);
    expect(plan.rows.key).toMatch(/^f\|/);
    // строки плотные: виртуальные полосы лиц — подряд, без пустых
    const lanes = [...new Set(m.nodes.map((_, i) => plan.nodeLane![i]).filter(Number.isFinite))].sort((a, b) => a - b);
    expect(lanes[lanes.length - 1] - lanes[0] + 1).toBe(lanes.length);
  });
  it('всё небо — карта без скрытых узлов; ключевые лица — карта с лицами показа', () => {
    setShow({ kind: 'all' });
    const all = planSky(data, { show: skyShow.value, mode: 'all', set: new Set(), foldDesc: [], foldGroups: [] });
    expect(all.layout).toBe('map');
    expect(all.nodeLane).toBeNull();
    expect(all.hidden).toBeNull();
    setShow({ kind: 'key' });
    const key = planSky(data, { show: skyShow.value, mode: 'all', set: new Set(), foldDesc: [], foldGroups: [] });
    expect(key.layout).toBe('map');
    expect(key.mode).toBe('work');
    expect(key.hiddenPersons.has('david')).toBe(false);
    expect(key.hiddenPersons.has('uts-syn-nakhora')).toBe(true);
  });
  it('свёрнутые потомки (J5) в укладку не входят, а «+N» у лица — в плане; лица линий Мессии не сворачиваются', async () => {
    const { foldDesc } = await import('../src/ui/work.ts');
    setShow({ kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' });
    const full = skyShow.value.lanes!.size;
    foldDesc.value = ['shela-syn-iudy'];
    const inp = skyShow.value;
    const plan = planSky(data, { show: inp, mode: 'all', set: new Set(), foldDesc: foldDesc.value, foldGroups: [] });
    const mark = plan.marks.find((k) => k.kind === 'desc' && k.id === 'shela-syn-iudy');
    expect(mark?.count).toBeGreaterThan(5);
    expect(inp.lanes!.size).toBe(full - mark!.count);
    expect(inp.lanes!.has('shela-syn-iudy')).toBe(true);
    foldDesc.value = ['iuda'];
    const lines = skyShow.value.lanes!;
    for (const id of ['fares', 'david', 'iisus']) expect(lines.has(id), id).toBe(true);
    foldDesc.value = [];
  });
  it('Я19 на плане: раскрытие союза в наборе — опора на своей полосе, прежние лица только наружу, порядок пар прежний', async () => {
    const { expandUnion, unionsOf, expanded } = await import('../src/ui/reveal.ts');
    const { workSet } = await import('../src/ui/work.ts');
    workSet.value = new Map([['iakov', { via: 'self', of: 'iakov' }]]);
    expanded.value = {};
    setShow({ kind: 'set' }, { anchor: 'iakov' });
    const steps: string[] = [];
    let prev = new Map(skyShow.value.lanes!);
    for (const u of unionsOf('iakov')) {
      if (u.claim) continue;
      expandUnion(u.id, 'iakov');
      const cur = skyShow.value.lanes!;
      expect(skyShow.value.anchor).toBe('iakov');
      // опора — лицо, от которого раскрыли, — на своей виртуальной полосе
      expect(cur.get('iakov'), u.id).toBe(prev.get('iakov'));
      const a = prev.get('iakov')!;
      for (const [id, l0] of prev) {
        const d = cur.get(id)! - l0;
        const side = Math.sign(l0 - a);
        if (side) expect(d * side, `${name(id)} после ${u.id}`).toBeGreaterThanOrEqual(0);
      }
      const ids = [...prev.keys()];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const b0 = prev.get(ids[i])! - prev.get(ids[j])!;
          const b1 = cur.get(ids[i])! - cur.get(ids[j])!;
          expect(b0 * b1 < 0, `${name(ids[i])} и ${name(ids[j])} поменялись местами`).toBe(false);
        }
      steps.push(u.id);
      prev = new Map(cur);
    }
    expect(steps.length).toBe(4);
  });
  it('без показа — прежний план: поля этапа 11 заполнены значениями карты', () => {
    const plan = planSky(data, { mode: 'all', set: new Set(), foldDesc: [], foldGroups: [] });
    expect(plan).toMatchObject({ layout: 'map', nodeLane: null, stubs: [], anchor: null });
  });
  it('фокус вне показа: состав показа выбор не меняет (Я21), строка показа называет лицо', async () => {
    const { selected } = await import('../src/state.ts');
    const { showSummary } = await import('../src/ui/show.ts');
    setShow(NAHOR);
    const before = skyShow.value.key;
    selected.value = 'david';
    expect(show.value).toEqual(NAHOR);
    expect(showContent.value.ids.has('david')).toBe(false);
    expect(skyShow.value.guests.has('david')).toBe(false);
    expect(skyShow.value.key).toBe(before);
    expect(showSummary.value.label).toMatch(/; Давид \(царь Израиля, сын Иессея\) — вне показа$/);
    selected.value = 'lavan';
    expect(skyShow.value.guests.has('david')).toBe(false);
    expect(showSummary.value.label).not.toMatch(/вне показа/);
    selected.value = null;
  });
  it('опора: лицо, от которого сменили показ, остаётся на своей полосе, если было в прежней укладке', () => {
    setShow({ kind: 'lineage', id: 'nakhor-syn-farry', dir: 'down', gen: null, by: 'father' }, { anchor: 'vafuil' });
    const a = skyShow.value.lanes!.get('vafuil')!;
    setShow(NAHOR, { anchor: 'vafuil' });
    expect(skyShow.value.lanes!.get('vafuil')).toBe(a);
    expect(skyShow.value.anchor).toBe('vafuil');
  });
});

describe('Я27: «+» у имени лица с одним союзом с детьми раскрывает и детей (решение координатора по K2)', () => {
  it('Адам → Ной по линии Сифа: у каждого лица один союз — по одному действию на поколение', async () => {
    const { openPerson, expanded, opened, soleUnion } = await import('../src/ui/reveal.ts');
    const { workSet } = await import('../src/ui/work.ts');
    const LINE = ['adam', 'sif', 'enos', 'kainan', 'maleleil', 'iared', 'enokh', 'mafusal', 'lamekh', 'noy'];
    workSet.value = new Map([['adam', { via: 'self', of: 'adam' }]]);
    expanded.value = {};
    opened.value = [];
    setShow({ kind: 'set' });
    let acts = 0;
    for (let i = 0; i < LINE.length - 1; i++) {
      expect(soleUnion(LINE[i]), LINE[i]).not.toBeNull();
      openPerson(LINE[i]);
      acts++;
      expect(workSet.value.has(LINE[i + 1]), `${LINE[i]} → ${LINE[i + 1]}`).toBe(true);
    }
    expect(acts).toBe(9);
    // опора перехода — ромб союза: мать не была на небе — лицо, от которого раскрыли
    expect(skyShow.value.anchor).toBe('lamekh');
    expect(show.value.kind).toBe('set');
  });
  it('союзов с детьми два и больше — как прежде: только ромбы, «+N» — вторым действием (Иаков)', async () => {
    const { openPerson, expanded, opened, soleUnion, unionsOf } = await import('../src/ui/reveal.ts');
    const { workSet } = await import('../src/ui/work.ts');
    expect(unionsOf('iakov').filter((u) => u.kids.length).length).toBeGreaterThan(1);
    expect(soleUnion('iakov')).toBeNull();
    workSet.value = new Map([['iakov', { via: 'self', of: 'iakov' }]]);
    expanded.value = {};
    opened.value = [];
    setShow({ kind: 'set' });
    openPerson('iakov');
    expect(opened.value).toEqual(['iakov']);
    expect(Object.keys(expanded.value)).toEqual([]);
    expect(workSet.value.size).toBe(1);
  });
  it('вне показа «набор» лицо только открывается: раскрытие не меняет показ', async () => {
    const { openPerson, expanded, opened } = await import('../src/ui/reveal.ts');
    const { workSet } = await import('../src/ui/work.ts');
    workSet.value = new Map([['sif', { via: 'self', of: 'sif' }]]);
    expanded.value = {};
    opened.value = [];
    setShow({ kind: 'all' });
    openPerson('sif');
    expect(show.value.kind).toBe('all');
    expect(Object.keys(expanded.value)).toEqual([]);
    expect(workSet.value.size).toBe(1);
  });
});
