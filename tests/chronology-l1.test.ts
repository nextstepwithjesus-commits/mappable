/**
 * Хронология и раскладка, этап 7, круг 3 (L1; решение владельца 38):
 *  — MAP-69: у лица Нового Завета без чисел текста с промежутком рождения шире 40 лет знак стоит у первого
 *    засвидетельствованного года (призвание, суд, событие Деяний); промежуток рождения — полоса влево от знака
 *    (LayoutNode.band), отвод от родителя — в оценку рождения (born); «колонны Рождества» нет;
 *  — MAP-69: тесть старше зятя на поколение (Ин 18:13), тёща — старше зятя (Мф 8:14);
 *  — MAP-53: наименьший возраст начала деятельности по роли: царь — 7 (4 Цар 11:21), священник, левит и вождь — 20
 *    (1 Пар 23:24; Чис 1:3), пророк, судья, апостол — 12 (Лк 2:42);
 *  — CARD-79: год смерти не раньше года любого события лица — и в решателе, и в показе (Иоав — 970, а не «ок. 972»);
 *  — CARD-83, CARD-90: данные — «глава третьей череды священников (1 Пар 24:8)», «люди его поклялись…» (2 Цар 21:17).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, roleMinAge, minReignAgeOf, WIDE_BIRTH, MODELS, type ChronoResult, type ChronoModelId } from '../src/engine/chronology.ts';
import { computeLayout, type LayoutResult, type LineStep, type ListDef } from '../src/engine/layout.ts';
import { toAstro, toHist, shownYears, lifeSpanText } from '../src/engine/years.ts';
import { models as builtModels } from '../src/data/atlas.ts';
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
const persons = allPersons();
const g = buildGraph(persons);
const lines = { joseph: read<{ persons: LineStep[] }>('data/lines/joseph.json').persons, mary: read<{ persons: LineStep[] }>('data/lines/mary.json').persons };
const lists = read<{ lists: ListDef[] }>('data/lists.json').lists;
const solved = new Map<ChronoModelId, ChronoResult>();
const solve = (m: ChronoModelId) => {
  if (!solved.has(m)) solved.set(m, solveChronology(g, epochs, m));
  return solved.get(m)!;
};
let L: LayoutResult;
beforeAll(() => {
  for (const m of MODELS) solve(m.id);
  const res = solve('mt-long');
  L = computeLayout(g, res, lines, { lists, epochs: res.epochs ?? epochs });
}, 240_000);
const hist = (x: number) => toHist(x);

describe('MAP-69: знак у первого засвидетельствованного года (решение 38)', () => {
  it('Пётр, Андрей, Фома, Пилат, Анна, Мария Магдалина — знак в год призвания или суда, не у Рождества', () => {
    const want: [string, number][] = [
      ['petr', 26], ['andrey', 26], ['foma', 26], ['nafanail', 26], ['filipp-apostol', 26], ['iuda-iakovlev', 26],
      ['pontiy-pilat', 26], ['anna-pervosvyashchennik', 26], ['mariya-magdalina', 26],
      ['lazar', 30], ['marfa', 30], ['simon-kirineyanin', 30], ['kleopa', 30], ['iakov-brat-gospoden', 30], ['varnava', 30],
      ['pavel', 34],
    ];
    const res = solve('mt-long');
    for (const [id, year] of want) {
      const c = res.persons.get(id)!;
      expect(c.cls, id).toBe('estimated');
      expect(c.bHi - c.bLo, id).toBeGreaterThan(WIDE_BIRTH);
      expect(c.mark, id).toBe(toAstro(year));
      const n = L.byPerson.get(id)!;
      expect(n.t0, id).toBe(toAstro(year));
      // промежуток рождения — полоса влево от знака; отвод от родителя — в оценку рождения внутри неё
      expect(n.band, id).toEqual([c.bLo, Math.min(c.bHi, n.t0)]);
      expect(n.born, id).toBe(c.b);
      expect(n.band![1]).toBeLessThanOrEqual(n.t0);
      // след — от знака до последнего события или смерти
      expect(n.t1, id).toBeGreaterThanOrEqual(n.t0);
    }
  });
  it('«колонны Рождества» нет: в 10–5 гг. до Р. Х. знак засвидетельствованного лица стоит, только если оно засвидетельствовано в эти годы', () => {
    const res = solve('mt-long');
    const lo = toAstro(-10);
    const hi = toAstro(-5);
    const column: string[] = [];
    const unattested: string[] = [];
    for (const n of L.nodes) {
      if (n.ghost || n.spine || n.trail !== 'life' || n.t0 < lo || n.t0 > hi) continue;
      const c = res.persons.get(n.person)!;
      if (c.cls !== 'estimated' || c.bHi - c.bLo <= WIDE_BIRTH) continue;
      if (c.mark === n.t0) continue; // засвидетельствован в этот год (Захария, Ирод, Анна-пророчица)
      const p = g.persons.get(n.person)!;
      const attested = !!p.chrono?.active || !!p.chrono?.reign?.length || !!p.chrono?.died || (p.card?.events ?? []).some((e) => e.year !== undefined);
      (attested ? column : unattested).push(n.person);
    }
    expect(column).toEqual([]);
    // без свидетельства может остаться только отец, названный лишь по сыну: «Сосипатр Пирров» (Деян 20:4), «семь сынов
    // Иудейского первосвященника Скевы» (Деян 19:14). Своего года у такого отца нет: его год — поколение до сыновей
    // (у сынов Скевы с этапа 13 — годы в Ефесе при Павле, 53–56). Отец «по сыну» — без своих событий и хронологии, кроме
    // эпохи, и с детьми в данных; всякий другой в этих годах — «колонна»
    const bySonOnly = (id: string) => {
      const p = g.persons.get(id)!;
      const own = !!p.card?.events?.length || Object.keys(p.chrono ?? {}).some((k) => k !== 'epoch');
      return !own && (g.childrenOf.get(id) ?? []).length > 0;
    };
    expect(unattested.filter((id) => !bySonOnly(id))).toEqual([]);
    expect(unattested.filter(bySonOnly).length).toBeLessThanOrEqual(2);
  });
  it('правило — только для оценок без чисел текста, вне коридора и в Новом Завете; у остальных знак в год рождения', () => {
    const res = solve('mt-long');
    for (const n of L.nodes) {
      if (n.ghost || n.trail === 'list') continue;
      const c = res.persons.get(n.person)!;
      if (n.spine || c.cls !== 'estimated') expect(n.band, n.person).toBeUndefined();
      if (n.band) {
        expect(c.mark, n.person).toBe(n.t0);
        expect(n.t0).toBeGreaterThanOrEqual(toAstro(-430)); // «Межзаветное время» и позже
      } else if (n.trail === 'life' && !n.spine) expect(n.t0, n.person).toBe(c.b);
    }
    // ветхозаветные лица с широким промежутком (сыновья Емана, 1 Пар 25) — по-прежнему в год рождения
    expect(res.persons.get('bukkiya-syn-emana')!.mark).toBeUndefined();
  });
  it('место в полосе занято и под полосу рождения: соседний след той же строки не заходит на неё', () => {
    const lanes = new Map<number, [number, number, string][]>();
    for (const n of L.nodes) {
      if (n.ghost || n.trail === 'list') continue;
      const a = lanes.get(n.lane) ?? [];
      a.push([n.band ? n.band[0] : n.t0, n.t1, n.person]);
      lanes.set(n.lane, a);
    }
    const bad: string[] = [];
    for (const n of L.nodes) {
      if (!n.band) continue;
      for (const [t0, t1, who] of lanes.get(n.lane)!) {
        if (who === n.person) continue;
        if (t0 < n.band[1] && n.band[0] < t1) bad.push(`${n.person}/${who}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('сборка данных: в ChronoRow — mark, в NodeRow — band и born (src/generated/atlas.json)', () => {
    const m = builtModels[0];
    const c = m.chrono.get('petr')!;
    expect(c.mark).toBe(toAstro(26));
    const n = m.nodeByPerson.get('petr')!;
    expect(n.t0).toBe(toAstro(26));
    expect(n.band).not.toBeNull();
    expect(n.band![0]).toBe(c.bLo);
    expect(n.born).toBe(c.b);
    const d = m.nodeByPerson.get('david')!;
    expect(d.band).toBeNull();
    expect(d.born).toBeNull();
  });
});

describe('MAP-69: родство в свойстве — поколение (Ин 18:13; Мф 8:14)', () => {
  it('Анна, тесть Каиафы, — старше зятя не меньше чем на 15 лет; тёща Симона — старше Симона', () => {
    const res = solve('mt-long');
    const b = (id: string) => res.persons.get(id)!.b;
    expect(b('kaiafa') - b('anna-pervosvyashchennik')).toBeGreaterThanOrEqual(15);
    expect(b('petr') - b('teshcha-simona')).toBeGreaterThanOrEqual(15);
  });
});

describe('MAP-53: наименьший возраст начала деятельности по роли', () => {
  it('возрасты выведены из данных и ролей: царь — 7 (Иоас), священник и вождь — 20, пророк — 12', () => {
    expect(minReignAgeOf(g)).toBe(7);
    expect(roleMinAge(g.persons.get('valaam')!, 7)).toBe(12);
    expect(roleMinAge(g.persons.get('naasson')!, 7)).toBe(20);
    expect(roleMinAge(g.persons.get('kaiafa')!, 7)).toBe(20);
    expect(roleMinAge(g.persons.get('akhav')!, 7)).toBe(7);
  });
  it('у оценок: верхний край рождения — не позже начала деятельности без наименьшего возраста роли', () => {
    const res = solve('mt-long');
    const minReign = minReignAgeOf(g);
    const bad: string[] = [];
    for (const [id, c] of res.persons) {
      if (c.cls !== 'estimated') continue;
      const p = g.persons.get(id)!;
      const a = p.chrono?.active;
      const age = roleMinAge(p, minReign);
      if (a && age !== null && c.bHi > Math.max(c.b, toAstro(a.from) - age) + 1e-6) bad.push(`${id}: ${hist(c.bHi)} > ${a.from} − ${age}`);
      for (const r of p.chrono?.reign ?? []) {
        if (r.ageAtStart !== undefined) continue;
        if (c.bHi > Math.max(c.b, toAstro(r.start) - minReign) + 1e-6) bad.push(`${id}: ${hist(c.bHi)} > воцарение ${r.start} − ${minReign}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('CARD-79: смерть не раньше событий жизни — в решателе и в показе', () => {
  for (const m of MODELS) {
    it(`${m.id}: год смерти (и показанный) не раньше года любого события лица и конца его деятельности`, () => {
      const res = solve(m.id);
      const bad: string[] = [];
      for (const [id, c] of res.persons) {
        if (c.d === null) continue;
        const p = g.persons.get(id)!;
        const y = shownYears(c);
        const years = (p.card?.events ?? []).filter((e) => e.year !== undefined).map((e) => toAstro(e.year!));
        if (p.chrono?.active) years.push(toAstro(p.chrono.active.to));
        for (const t of years) {
          if (c.d < t - 0.5) bad.push(`${id}: смерть ${hist(c.d)} раньше ${hist(t)}`);
          if (y && y.d !== null && y.d < t) bad.push(`${id}: показ ${hist(y.d)} раньше ${hist(t)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
  // этап 13 (словарь дат, решение 96): рождение — оценка шире 10 лет, пишется «между», а свой год смерти — без «ок.»
  it('Иоав убит в 970 г. до Р. Х. (3 Цар 2:28–34), не раньше смерти Давида (3 Цар 2:10): «род. между …, ум. 970 г. до Р. Х.»', () => {
    const res = solve('mt-long');
    const j = res.persons.get('ioav')!;
    const d = res.persons.get('david')!;
    expect(j.dAge).toBe(false);
    expect(shownYears(j)!.d).toBe(toAstro(-970));
    expect(shownYears(j)!.d!).toBeGreaterThanOrEqual(shownYears(d)!.d!);
    expect(lifeSpanText(j).replace(/[ ⁠]/g, (s) => (s === ' ' ? ' ' : ''))).toMatch(/^род\. между \d{4} и \d{4}, ум\. 970 г\. до Р\. Х\.$/);
    // смерть по возрасту по-прежнему сдвигается вместе с округлённым рождением: возраст сохраняется
    for (const [id, c] of res.persons) {
      if (c.cls !== 'estimated' || c.d === null || !c.dAge) continue;
      const y = shownYears(c)!;
      expect(y.d! - y.b, id).toBe(Math.round(c.d - c.b));
    }
  });
});

describe('CARD-83, CARD-90: данные', () => {
  const vol = (f: string) => read<Volume>(`data/persons/${f}`).persons;
  it('главы 24 черед священников: «глава третьей череды священников (1 Пар 24:8)»', () => {
    const heads = vol('08-levi.json').filter((p) => /череды священников/.test(p.disambig ?? ''));
    expect(heads).toHaveLength(24);
    for (const p of heads) expect(p.disambig, p.id).toMatch(/^глава (двадцать )?[а-яё]+(ой|ей) череды священников \(1 Пар 24:(7|8|9|1[0-8])\)$/);
    expect(heads.find((p) => p.id === 'kharim')!.disambig).toBe('глава третьей череды священников (1 Пар 24:8)');
    expect(heads.find((p) => p.id === 'maaziya')!.disambig).toBe('глава двадцать четвёртой череды священников (1 Пар 24:18)');
  });
  it('Давид, § 17: «люди его поклялись больше не выпускать его на войну» (2 Цар 21:17), без двойного «его»', () => {
    const d = vol('12-house-of-david.json').find((p) => p.id === 'david')!;
    const ev = d.card!.events!.find((e) => e.refs.includes('2Цар 21:15-17'))!;
    expect(ev.text).toMatch(/люди его поклялись больше не выпускать его на войну/);
    expect(ev.text).not.toMatch(/его не пускали его/);
  });
  it('Хуза засвидетельствован в Лк 8:3 — в годы, когда Иоанна следовала за Иисусом', () => {
    const k = vol('17-new-testament.json').find((p) => p.id === 'khuza')!;
    const j = vol('17-new-testament.json').find((p) => p.id === 'ioanna-zhena-khuzy')!;
    expect(k.chrono!.active!.refs).toContain('Лк 8:1-3');
    expect(k.chrono!.active!.from).toBe(j.chrono!.active!.from);
    expect(solve('mt-long').persons.get('khuza')!.mark).toBe(toAstro(26));
  });
});
