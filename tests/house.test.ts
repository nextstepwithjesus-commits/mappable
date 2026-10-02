/**
 * «Отчий дом» (этап 15, решение 173; src/engine/house.ts) на всех данных модели по умолчанию:
 *  — дом без пересечений по построению: черта брака и отвод к ребёнку в год своего события проходят только строки
 *    своего дома, которые в этот год пусты (жена, живущая в доме с рождения, — Д7, — в доме с года прихода wed; дочери
 *    Лота — мать и дочь одного дома — не в счёт); остаток — поимённо;
 *  — семьи корпуса: Иаков, Давид, Авраам, Халев, Исав — порядок в стопке, мать читается по линии, переходы в колена;
 *  — переходы — часть следа: не вертикальны, 5–16 лет, не позже 20 лет (сын) и в год брака (жена);
 *  — призраки — только по двум правилам 173;
 *  — правила раскладки те же: в одной полосе следы не пересекаются; полоса жизни опорных лиц — как в снимке, кроме
 *    списка 173.
 * Прежние проверки раскладки (tests/layout-df2.test.ts) относятся к первому проходу (computeLayout) и не менялись;
 * здесь — их смысл на раскладке с домами.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, type ChronoResult } from '../src/engine/chronology.ts';
import type { LayoutNode, LineStep, ListDef } from '../src/engine/layout.ts';
import { computeHouseLayout, FAR_CROSS, FAR_NATAL, GLIDE_MAX, GLIDE_MIN, ADULT, type HouseLayout } from '../src/engine/house.ts';
import { glidesOf, laneAt, starLaneOf } from '../src/engine/stays.ts';
import epochsJson from '../data/epochs.json' with { type: 'json' };

const epochs = epochsJson as Epoch[];
const ROOT = join(__dirname, '..');
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
function allPersons(): Person[] {
  const out: Person[] = [];
  const seen = new Set<string>();
  const dir = join(ROOT, 'data/persons');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume;
    for (const p of v.persons) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  }
  return out;
}
const g = buildGraph(allPersons());
const lines = {
  joseph: read<{ persons: LineStep[] }>('data/lines/joseph.json').persons.filter((s) => g.persons.has(s.id)),
  mary: read<{ persons: LineStep[] }>('data/lines/mary.json').persons.filter((s) => g.persons.has(s.id)),
};
const lists = read<{ lists: ListDef[] }>('data/lists.json').lists;
const snap = read<{ persons: { id: string; name: string; lane: number }[] }>('data/coords-snapshot.json').persons.filter((s) => g.persons.has(s.id));
const name = (id: string) => g.persons.get(id)?.name ?? id;

/** Сдвиги полосы жизни опорных лиц по решению 173 (жёны — в доме мужа; колена — за домом Иакова; Кир — за домом Зоровавеля). */
const MOVED_173 = ['kham', 'sarra', 'revekka', 'liya', 'leviy', 'simeon', 'dan', 'gad', 'neffalim', 'zavulon', 'famar', 'kaaf', 'amram', 'aaron', 'moisey', 'virsaviya', 'sedekiya', 'kir'];
/** Нарушения правила дома, которые план оставляет (поимённо): кроме них — ни одного. */
const RESIDUAL = [
  // Жена, живущая у мужа с рождения, занимает строку с рождения (её доля до прихода — бледная, но строка её): если ближе
  // к мужу место для неё до брака занято, она встаёт дальше того, кто пришёл или родился раньше её черты. План дома
  // ставит позднее событие первым, но это цена, а не запрет: остаётся 6 случаев на 107 черт и 1 499 отводов.
  // Гофолия (из далёкого рода) стоит дальше Иосавеф, родившейся раньше черты брака
  'черта u:ioram-syn-iosafata+gofoliya → iosavef',
  // Рицпа (из далёкого рода) стоит дальше Ионафана
  'черта u:saul+ritspa → ionafan',
  // Ефа, наложница Халева, — дальше Маахи, пришедшей раньше
  'черта u:khalev-syn-esroma+efa-nalozhnitsa-khaleva → maakha-nalozhnitsa-khaleva',
  // мать не названа: отвод от следа отца проходит строку жены, уже пришедшей в дом
  'отвод u:akhav+ → gofoliya → iezavel',
  'отвод u:elifaz-syn-isava+ → kenaz-syn-elifaza → famna-nalozhnitsa-elifaza',
  'отвод u:ierakhmeil+ → akhiya-syn-ierakhmeila → afara',
];

let chrono: ChronoResult;
let H: HouseLayout;
let N: Map<string, LayoutNode>;
const b = (id: string) => chrono.persons.get(id)!.b;
beforeAll(() => {
  chrono = solveChronology(g, epochs, 'mt-long');
  const opts = { lists, epochs: chrono.epochs ?? epochs, prior: snap };
  H = computeHouseLayout(g, chrono, lines, opts);
  N = H.byPerson as Map<string, LayoutNode>;
}, 120_000);

/**
 * Полоса, где лицо живёт в год t (на переходе — нигде: переход — не строка), если оно уже родилось и след не кончился.
 * Жена, живущая у мужа с рождения (Д7, далёкий род), в доме — с года прихода (wed): доля следа до него бледная.
 */
function liveRow(id: string, t: number): number | null {
  const n = N.get(id);
  if (!n || n.trail === 'list') return null;
  if (t < n.t0 + 0.5 || t > Math.max(n.t1, n.t0 + 0.5)) return null;
  if (n.wed !== undefined && t < n.wed) return null;
  for (const gl of glidesOf(n)) if (t > gl.t0 && t < gl.t1) return null;
  return laneAt(n, t);
}

describe('дом без пересечений по построению (решение 173)', () => {
  it('черта брака и отвод в год своего события проходят только пустые строки своего дома', () => {
    const bad: string[] = [];
    let bars = 0;
    let stems = 0;
    for (const hu of H.plan.unions.values()) {
      const A = hu.anchor;
      if (!N.has(A)) continue;
      // дом: хозяин, жёны, живущие в доме, и дети всех союзов хозяина
      const members = new Set<string>([A]);
      for (const v of H.plan.unions.values()) if (v.anchor === A) {
        if (v.wife && v.resident) members.add(v.wife);
        for (const k of v.kids) members.add(k);
      }
      const across = (from: number, to: number, t: number, skip: string[]) =>
        [...members].filter((m) => {
          if (skip.includes(m)) return false;
          const l = liveRow(m, t);
          return l !== null && l > Math.min(from, to) && l < Math.max(from, to);
        });
      const W = hu.wife && hu.resident && N.has(hu.wife) ? hu.wife : null;
      // дочери Лота — матери в доме своего отца: союз внутри одного дома, обе дочери в нём с рождения
      const merged = !!W && g.persons.get(W)?.father === A;
      if (W && hu.barT !== null && !merged) {
        bars++;
        for (const x of across(laneAt(N.get(A)!, hu.barT), laneAt(N.get(W)!, hu.barT + 0.01), hu.barT, [A, W])) bad.push(`черта ${hu.union.id} → ${x}`);
      }
      if (merged) continue;
      for (const k of hu.kids) {
        const kn = N.get(k);
        if (!kn) continue;
        stems++;
        // к жене из далёкого рода — к её призраку в родной семье
        const ghost = H.nodes.find((n) => n.ghost && !n.satelliteOf && n.person === k);
        const src = W ? N.get(W)! : N.get(A)!;
        for (const x of across(laneAt(src, b(k)), ghost ? ghost.lane : starLaneOf(kn), b(k), [A, W ?? '', k])) bad.push(`отвод ${hu.union.id} → ${k} → ${x}`);
      }
    }
    expect(bars).toBeGreaterThan(80);
    expect(stems).toBeGreaterThan(1000);
    expect(bad.sort()).toEqual([...RESIDUAL].sort());
  });

  it('жена, живущая у мужа с рождения (Д7, далёкий род), приходит в дом в год своей черты брака (wed)', () => {
    const wives = H.nodes.filter((n) => n.wed !== undefined);
    expect(wives.length).toBeGreaterThan(20);
    for (const n of wives) {
      expect(n.stays, n.person).toBeUndefined();
      // дом, где она живёт с рождения, — дом её первой черты брака; год прихода — год этой черты (unionYear)
      const home = H.plan.stays.get(n.person)![0].house;
      const us = [...H.plan.unions.values()].filter((u) => u.wife === n.person && u.anchor === home && u.resident && H.unionYears.has(u.union.id));
      expect(us.length, n.person).toBeGreaterThan(0);
      expect(n.wed, n.person).toBe(Math.min(...us.map((u) => H.unionYears.get(u.union.id)!)));
      expect(n.wed!, n.person).toBeGreaterThan(b(n.person));
    }
    for (const id of ['valla', 'zelfa', 'revekka', 'rakhil', 'liya']) expect(N.get(id)!.wed, id).toBeDefined();
  });

  it('правила раскладки те же: в одной полосе следы (пребывания) не пересекаются', () => {
    const byLane = new Map<number, [number, number, string][]>();
    const bad: string[] = [];
    for (const nd of H.nodes) {
      if (nd.trail !== 'life' || nd.ghost) continue;
      const segs = nd.stays ? nd.stays.map((s) => [s.lane, Math.max(s.t0, nd.t0), Math.min(s.t1, nd.t1)] as const) : [[nd.lane, nd.t0, nd.t1] as const];
      for (const [l, a0, b0] of segs) {
        if (b0 <= a0) continue;
        const a = byLane.get(l) ?? [];
        for (const [s, e, id] of a) if (a0 < e && s < b0) bad.push(`${id} и ${nd.id} на полосе ${l}`);
        a.push([a0, b0, nd.id]);
        byLane.set(l, a);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('семьи корпуса', () => {
  /** Строки дома: хозяин, его жёны в год черты и дети — звёзды. */
  const houseOf = (A: string) => [...H.plan.unions.values()].filter((u) => u.anchor === A);
  const kidLinks = (A: string) => {
    const out: { kid: string; from: number; to: number }[] = [];
    for (const hu of houseOf(A)) {
      const src = hu.wife && hu.resident && N.has(hu.wife) ? N.get(hu.wife)! : N.get(A)!;
      for (const k of hu.kids) if (N.has(k)) out.push({ kid: k, from: Math.round(laneAt(src, b(k))), to: starLaneOf(N.get(k)!) });
    }
    return out;
  };

  it('Иаков: 12 сыновей и Дина рождаются у своих матерей; разброс дома ≤ 19 строк, длиннейшая связь ≤ 6 (было 127 и 71)', () => {
    const L = kidLinks('iakov');
    expect(L.length).toBeGreaterThanOrEqual(12);
    expect(Math.max(...L.map((x) => Math.abs(x.to - x.from)))).toBeLessThanOrEqual(6);
    const rows = [N.get('iakov')!.lane, ...L.map((x) => x.to)];
    expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(19);
    // у каждой жены дети — по её сторону, младший у матери, старший дальше всех
    for (const hu of houseOf('iakov')) {
      const w = laneAt(N.get(hu.wife!)!, hu.barT! + 0.01);
      const kids = [...hu.kids].sort((x, y) => b(y) - b(x)).map((k) => starLaneOf(N.get(k)!));
      const d = kids.map((l) => (l - w) * hu.side);
      expect(d.every((x) => x > 0), `${hu.union.id}: дети по сторону матери`).toBe(true);
      expect(d.every((x, i) => i === 0 || x > d[i - 1]), `${hu.union.id}: младший у матери`).toBe(true);
    }
    // родоначальники колен уходят переходом в свои колена: Рувим, Симеон, Левий, Дан, Неффалим, Гад, Асир, Иссахар, Завулон, Иосиф, Вениамин
    const j = N.get('iakov')!.lane;
    for (const k of ['ruvim', 'simeon', 'leviy', 'dan', 'neffalim', 'gad', 'asir', 'issakhar', 'zavulon', 'iosif', 'veniamin']) {
      const n = N.get(k)!;
      const gl = glidesOf(n);
      expect(gl.length, name(k)).toBe(1);
      // звезда — в доме Иакова (не дальше 19 строк), жизнь — в полосе колена; переход — из одной в другую
      expect(Math.abs(starLaneOf(n) - j), name(k)).toBeLessThanOrEqual(19);
      expect([gl[0].from, gl[0].to], name(k)).toEqual([starLaneOf(n), n.lane]);
    }
  });

  it('Давид: каждая мать — на своём ромбе, её сын за ней; Вирсавия — ближе всех жён на своей стороне', () => {
    const d = N.get('david')!.lane;
    const wives = houseOf('david').filter((u) => u.wife && u.resident && u.union.kids.length);
    expect(wives.length).toBe(7);
    const wl = (u: (typeof wives)[number]) => laneAt(N.get(u.wife!)!, u.barT! + 0.01);
    for (const hu of wives) {
      const w = wl(hu);
      for (const k of hu.kids) expect(Math.sign(starLaneOf(N.get(k)!) - w), `${hu.union.id}: ${name(k)} за матерью`).toBe(Math.sign(w - d));
    }
    const bath = wives.find((u) => u.wife === 'virsaviya')!;
    const sameSide = wives.filter((u) => Math.sign(wl(u) - d) === Math.sign(wl(bath) - d)).map((u) => Math.abs(wl(u) - d));
    expect(Math.abs(laneAt(N.get('virsaviya')!, bath.barT! + 0.01) - d)).toBe(Math.min(...sameSide));
    // Мелхола — бездетный брак, она живёт в доме Саула: у Давида и у Фалтия — её призраки
    expect(H.nodes.filter((n) => n.ghost && n.person === 'melkhola').map((n) => n.satelliteOf).sort()).toEqual(['david', 'faltiy-syn-laisha']);
  });

  it('Авраам: Сарра одна (родилась в доме Фарры, переходом пришла к Аврааму, призрака нет); Хеттура с шестью сыновьями — блоком', () => {
    const sarra = N.get('sarra')!;
    expect(glidesOf(sarra).length).toBe(1);
    expect(H.nodes.some((n) => n.ghost && n.person === 'sarra')).toBe(false);
    expect(Math.abs(sarra.lane - N.get('avraam')!.lane)).toBeLessThanOrEqual(8);
    const het = houseOf('avraam').find((u) => u.wife === 'khettura')!;
    const w = laneAt(N.get('khettura')!, het.barT! + 0.01);
    const rows = het.kids.map((k) => starLaneOf(N.get(k)!)).sort((x, y) => x - y);
    expect(rows.length).toBe(6);
    expect(rows[rows.length - 1] - rows[0]).toBe(5);
    expect(Math.min(...rows.map((r) => Math.abs(r - w)))).toBe(1);
    // Агарь и Измаил — рядом
    expect(Math.abs(starLaneOf(N.get('izmail')!) - laneAt(N.get('agar')!, b('izmail')))).toBe(1);
  });

  it('Халев, сын Есрома: длиннейшая связь ≤ 6 строк (было 18)', () => {
    const L = kidLinks('khalev-syn-esroma');
    expect(L.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...L.map((x) => Math.abs(x.to - x.from)))).toBeLessThanOrEqual(6);
  });

  it('Исав: дети у своих матерей (Ада, Махалафа, Оливема), длиннейшая связь ≤ 3; Иегудифа — бездетный брак, призрак у Исава', () => {
    const L = kidLinks('isav');
    expect(L.length).toBe(5);
    expect(Math.max(...L.map((x) => Math.abs(x.to - x.from)))).toBeLessThanOrEqual(3);
    expect(H.nodes.filter((n) => n.ghost && n.person === 'iegudifa').map((n) => n.satelliteOf)).toEqual(['isav']);
  });
});

describe('переходы — часть следа (решение 173)', () => {
  it('не вертикальны: 5–16 лет; сын уходит не позже 20 лет и до своего первого союза; жена приходит в год черты брака', () => {
    let n = 0;
    for (const nd of H.nodes) {
      if (nd.ghost) continue;
      for (const gl of glidesOf(nd)) {
        n++;
        expect(gl.t1 - gl.t0, `${nd.person}: ${gl.t0}…${gl.t1}`).toBeGreaterThanOrEqual(GLIDE_MIN);
        expect(gl.t1 - gl.t0, nd.person).toBeLessThanOrEqual(GLIDE_MAX);
        expect(gl.to).not.toBe(gl.from);
      }
      const st = H.plan.stays.get(nd.person);
      if (!st || !nd.stays) continue;
      const life = st.find((s) => s.kind === 'life');
      if (life) {
        // приход в свою полосу — не позже 20 лет (и не раньше места под звезду и имя)
        expect(nd.stays[nd.stays.length - 1].t0 - b(nd.person), nd.person).toBeLessThanOrEqual(ADULT + 0.5);
      }
      for (const s of st.filter((q) => q.kind === 'wife' && q.house)) {
        const uid = [...H.plan.unions.values()].find((u) => u.anchor === s.house && u.wife === nd.person && u.union.kids.length)?.union.id;
        if (!uid) continue;
        const arrive = nd.stays.find((q) => q.lane === s.lane)!;
        expect(arrive.t0, `${nd.person} → ${s.house}`).toBe(H.unionYears.get(uid));
      }
    }
    expect(n).toBe(H.plan.glides.length);
    expect(n).toBeGreaterThan(50);
  });
});

describe('призраки — только по двум правилам 173', () => {
  it('жена из далёкого рода — призрак в родной семье, звезда у мужа; бездетный брак, жена живёт не у мужа — призрак у мужа', () => {
    const ghosts = H.nodes.filter((n) => n.ghost);
    expect(ghosts.length).toBe(H.plan.natalGhosts.length + H.plan.ghosts.length);
    expect(new Set(ghosts.map((n) => n.id)).size).toBe(ghosts.length);
    for (const gh of ghosts) {
      const w = N.get(gh.person)!;
      if (!gh.satelliteOf) {
        // 1) далёкий род: у неё есть дети от мужа, родной дом в данных; живёт у мужа с рождения (перехода нет)
        const hu = [...H.plan.unions.values()].find((u) => u.wife === gh.person && u.union.kids.length && u.resident);
        expect(hu, `${gh.id}: жена с детьми`).toBeTruthy();
        expect(w.stays, `${gh.id}: перехода из родного дома нет`).toBeUndefined();
        const natal = g.persons.get(gh.person)!.father ?? g.persons.get(gh.person)!.mother;
        expect(gh.layoutParent, `${gh.id}: в родной семье`).toBe(natal);
        // далеко: дальше FAR_NATAL строк от мужа или переход в год прихода пересёк бы больше FAR_CROSS живых чужих следов
        const ta = Math.min(...hu!.union.kids.map(b)) - 1;
        const hl = N.get(hu!.anchor)!.lane;
        let live = 0;
        for (const x of N.values()) {
          if (x.person === gh.person || x.person === hu!.anchor) continue;
          const l = liveRow(x.person, ta);
          if (l !== null && l > Math.min(gh.lane, hl) && l < Math.max(gh.lane, hl)) live++;
        }
        expect(Math.abs(gh.lane - hl) > FAR_NATAL || live > FAR_CROSS, `${gh.id}: ${Math.abs(gh.lane - hl)} строк, ${live} следов`).toBe(true);
      } else {
        // 2) бездетный брак у мужа, у которого она не живёт
        const hu = [...H.plan.unions.values()].find((u) => u.anchor === gh.satelliteOf && u.wife === gh.person);
        expect(hu, `${gh.id}: союз`).toBeTruthy();
        expect(hu!.union.kids.length, `${gh.id}: бездетный`).toBe(0);
        expect(Math.round(laneAt(w, gh.t0)), `${gh.id}: не у мужа`).not.toBe(gh.lane);
        // в доме мужа (у тесного дома Соломона — через 12 строк)
        expect(Math.abs(gh.lane - Math.round(laneAt(N.get(gh.satelliteOf)!, gh.t0))), `${gh.id}: в доме мужа`).toBeLessThanOrEqual(15);
      }
    }
    // жёны, пришедшие переходом, призраков не имеют: прежних призраков 24, теперь — только по правилам
    for (const nd of H.nodes) if (!nd.ghost && nd.stays && g.persons.get(nd.person)!.sex === 'f') expect(ghosts.some((q) => q.person === nd.person && !q.satelliteOf), nd.person).toBe(false);
  });
});

describe('опорные лица (NFR-3; Ф6)', () => {
  it('полоса жизни — как в снимке, кроме сдвигов решения 173', () => {
    const moved = snap.filter((s) => N.get(s.id) && N.get(s.id)!.lane !== s.lane).map((s) => s.id);
    expect(moved.sort()).toEqual([...MOVED_173].sort());
  });
  it('стороны созвездий с опорными лицами — как в снимке, кроме жён и лиц, живущих в доме лица коридора', () => {
    const spine = new Set([...lines.joseph, ...lines.mary].map((s) => s.id));
    const flips = snap.filter((s) => !spine.has(s.id) && N.get(s.id) && Math.sign(N.get(s.id)!.lane) !== Math.sign(s.lane)).map((s) => s.id);
    expect(flips.sort()).toEqual(['famar', 'liya', 'sarra', 'sedekiya', 'virsaviya']);
  });
});

describe('сводка раскладки с домами', () => {
  it('связей «союз → ребёнок» длиннее 8 строк — меньше, чем без домов; длиннейшая ≤ 26 строк (было 98)', () => {
    expect(H.metrics.links8).toBeLessThanOrEqual(82);
    expect(H.metrics.linkMax).toBeLessThanOrEqual(26);
    expect(H.metrics.glides).toBe(H.plan.glides.length);
    expect(H.metrics.ghosts).toBe(H.nodes.filter((n) => n.ghost).length);
  });
  it('индекс неба: пребывания пишутся только у лиц с переходом', () => {
    for (const n of H.nodes) if (n.stays) expect(n.stays.length).toBeGreaterThanOrEqual(2);
    expect(H.nodes.filter((n) => n.stays).length).toBe(new Set(H.plan.glides.map((q) => q.id)).size);
  });
});
