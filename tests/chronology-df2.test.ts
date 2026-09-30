/**
 * Хронология, этап 11 (DF2): находки сквозной сверки с Писанием (DG 2.3).
 *  1. Кааф и Мерари «вошли в Египет» с Иаковом (Быт 46:11): граница «не позже Иакова + 130» жёсткая — решатель больше
 *     не ставит их после прихода; все границы рождения из данных соблюдаются.
 *  2. Родитель старше ребёнка не меньше чем на 13 лет (мать — на 14), и этот предел сильнее «супругов одного поколения»:
 *     Иосавеф — не на 10,9 года моложе отца, Иорама; напряжение «Иодай — Иосавеф» называет верную разницу.
 *  3. «Левий — Иохаведа — Моисей»: такое же напряжение у Аарона и Мариам — возраст матери и у них больше предела жизни.
 *  4. ТЗ § 3.6: «Ахаз → Езекия» и «Мардохей, уведённый с Иехонией (Есф 2:6)» — в слое напряжений, со стихами.
 * ТЗ § 10 и сценарии 8–9 § 11.2 — на всех данных: Потоп 2518, Аврам 2166, Иосиф в 30 лет — 1885, Исход 1446; у Моисея
 * напряжение 430 лет есть и исчезает при кратком пребывании.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, MODELS, type ChronoResult, type ChronoModelId, type Tension } from '../src/engine/chronology.ts';
import { toAstro, toHist } from '../src/engine/years.ts';
import epochsJson from '../data/epochs.json' with { type: 'json' };

const epochs = epochsJson as Epoch[];
const ROOT = join(__dirname, '..');

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
const solved = new Map<ChronoModelId, ChronoResult>();
const solve = (m: ChronoModelId) => {
  if (!solved.has(m)) solved.set(m, solveChronology(g, epochs, m));
  return solved.get(m)!;
};
// решатель на всех данных — около двух секунд на модель; под нагрузкой полного прогона — дольше
beforeAll(() => {
  for (const m of MODELS) solve(m.id);
}, 240_000);
/** Тексты напряжений набраны с неразрывными пробелами: для сверки — обычные. */
const plain = (s: string) => s.replace(/ /g, ' ');
const b = (m: ChronoModelId, id: string) => solve(m).persons.get(id)!.b;
const dated = (c: { cls: string }) => c.cls === 'exact' || c.cls === 'calculated';
const tensionOf = (m: ChronoModelId, ids: string[]): Tension | undefined => solve(m).tensions.find((t) => t.persons.join('|') === ids.join('|'));
/** Единая запись трудности 430 лет пребывания в Египте (этап 13, решение 101: одна запись на трудность). */
const sojourn = (m: ChronoModelId): Tension => {
  const ts = solve(m).tensions.filter((t) => t.text.startsWith('Пребывание в Египте'));
  expect(ts, m).toHaveLength(1);
  return ts[0];
};

describe('ТЗ § 10 и § 11.2 (сценарии 8–9) — на всех данных', () => {
  it('Потоп — 2518, Аврам — 2166, Иосиф в 30 лет — 1885, Исход — 1446 г. до Р. Х.', () => {
    expect(toHist(Math.round(b('mt-long', 'noy') + 600))).toBe(-2518);
    expect(toHist(Math.round(b('mt-long', 'avraam')))).toBe(-2166);
    expect(toHist(Math.round(b('mt-long', 'iosif') + 30))).toBe(-1885);
    // Моисею при Исходе — 80 лет (Исх 7:7)
    expect(toHist(Math.round(b('mt-long', 'moisey') + 80))).toBe(-1446);
  });
  // этап 13 (решение 101; X1 А2, П15): при кратком пребывании напряжения 430 лет у Моисея нет, но остаётся «остаток»
  // Левий — Иохаведа — Моисей по границам текста (Чис 26:59) — сценарий 9 ТЗ выполняется честно, а не молча
  it('у Моисея — напряжение 430 лет пребывания (Исх 12:40); при кратком пребывании его нет, остаётся только остаток «Левий — Иохаведа»', () => {
    expect(solve('mt-long').tensions.some((t) => t.persons.includes('moisey') && t.refs.includes('Исх 12:40'))).toBe(true);
    const short = solve('mt-short').tensions.filter((t) => t.persons.includes('moisey'));
    expect(short.some((t) => t.refs.includes('Исх 12:40') || /430/.test(t.text))).toBe(false);
    expect(short).toHaveLength(1);
    expect(short[0].persons.slice(0, 3)).toEqual(['leviy', 'iokhaveda', 'moisey']);
    expect(plain(short[0].text)).toMatch(/на два поколения не меньше \d+ лет/);
  });
});

describe('1. Кааф и Мерари вошли в Египет с Иаковом (Быт 46:11)', () => {
  it('рождение — не позже прихода в Египет (Иаков + 130 лет) во всех моделях', () => {
    for (const { id: m } of MODELS) {
      const entry = b(m, 'iakov') + 130;
      for (const id of ['kaaf', 'merari', 'girson']) expect(b(m, id), `${m} ${id}`).toBeLessThanOrEqual(entry + 0.5);
    }
  });
  it('ни одна граница рождения из данных («не раньше / не позже чем через N лет после X») не нарушена', () => {
    const bad: string[] = [];
    for (const { id: m } of MODELS) {
      const res = solve(m);
      for (const p of persons) {
        const c = res.persons.get(p.id);
        const born = p.chrono?.born;
        if (!c || c.cls === 'epochal' || !born) continue;
        const at = (x?: { from: string; years: number }) => (x && res.persons.has(x.from) && res.persons.get(x.from)!.cls !== 'epochal' ? res.persons.get(x.from)!.b + x.years : null);
        const hi = at(born.notAfter);
        const lo = at(born.notBefore);
        if (hi !== null && c.b > hi + 0.5) bad.push(`${m} ${p.id}: позже ${born.notAfter!.from} + ${born.notAfter!.years} на ${(c.b - hi).toFixed(1)}`);
        if (lo !== null && c.b < lo - 0.5) bad.push(`${m} ${p.id}: раньше ${born.notBefore!.from} + ${born.notBefore!.years} на ${(lo - c.b).toFixed(1)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  // этап 13 (решение 101; X1 Д2): одна трудность — одна запись, текст — по границам текста, без годов-оценок решателя
  it('противоречие цепочки Левия видно напряжением по границам текста: Моисей рождается после смерти Амрама', () => {
    const t = sojourn('mt-long');
    for (const id of ['kaaf', 'amram', 'moisey']) expect(t.persons).toContain(id);
    expect(plain(t.text)).toContain('Кааф родился не позже 1876 г. до Р. Х., прожил 133 года и умер не позже 1743 г. до Р. Х.');
    expect(plain(t.text)).toMatch(/Амрам родился не позже 1742 г\. до Р\. Х\., прожил 137 лет и умер не позже 1605 г\. до Р\. Х\.; Моисей родился в 1526 г\. до Р\. Х\. — не меньше чем через 79 лет после смерти отца/);
    expect(t.refs).toContain('Исх 12:40');
  });
});

describe('2. Родитель старше ребёнка сильнее «супругов одного поколения»', () => {
  it('Иосавеф рождается не раньше, чем Иораму исполнилось 13 лет (прежде — 10,9 года)', () => {
    for (const { id: m } of MODELS) expect(b(m, 'iosavef') - b(m, 'ioram-syn-iosafata'), m).toBeGreaterThanOrEqual(13 - 0.05);
  });
  it('у лиц с оценочными годами отец не моложе 13 лет, мать — 14 (числа текста у обоих — вне проверки: их напряжение — своё)', () => {
    const bad: string[] = [];
    const res = solve('mt-long');
    for (const [child, edges] of g.parentsOf) {
      for (const e of edges) {
        const pc = res.persons.get(e.parent)!;
        const cc = res.persons.get(child)!;
        if (pc.cls === 'epochal' || cc.cls === 'epochal' || (dated(pc) && dated(cc))) continue;
        const min = e.kind.endsWith('mother') ? 14 : 13;
        if (cc.b - pc.b < min - 0.3) bad.push(`${e.parent} → ${child}: ${(cc.b - pc.b).toFixed(1)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('напряжение «Иодай — Иосавеф» называет ту разницу, что у решателя, и её основание — 130 лет Иодая', () => {
    for (const { id: m } of MODELS) {
      const t = tensionOf(m, ['iodai', 'iosavef'])!;
      expect(t, m).toBeDefined();
      expect(t.kind).toBe('spouses');
      const diff = Math.round(b(m, 'iosavef') - b(m, 'iodai'));
      expect(diff).toBeGreaterThan(40);
      expect(plain(t.text)).toContain(`Иодай — Иосавеф: по принятым годам жена моложе мужа на ${diff} `);
      expect(plain(t.text)).toMatch(/Годы обоих выведены из чисел текста и родства/);
      expect(t.refs).toEqual(expect.arrayContaining(['2Пар 22:11', '2Пар 24:15']));
    }
  });
});

describe('3. Иохаведа: напряжение и у Аарона, и у Мариам', () => {
  // этап 13: «Левий — Иохаведа — Моисей» — строка общей записи 430 лет, по границам текста: Левий прожил 137 лет
  // (Исх 6:16), Иохаведа — его дочь (Чис 26:59), значит, при рождении Моисея ей было не меньше 245 лет
  it('«Левий — Иохаведа — Моисей» — по границам текста, в записи 430 лет', () => {
    const t = sojourn('mt-long');
    expect(plain(t.text)).toMatch(/Левий — Иохаведа — Моисей: Левий родился не позже \d+ г\. до Р\. Х\., прожил 137 лет и умер не позже \d+ г\. до Р\. Х\.; Иохаведа родилась не позже \d+ г\. до Р\. Х\.; Моисей родился в 1526 г\. до Р\. Х\., и матери тогда было не меньше \d+ лет\./);
    expect(plain(t.text)).toContain('Первую разгадку ограничивает Чис 26:59: Иохаведа названа дочерью Левия.');
  });
  for (const id of ['aaron', 'mariam'] as const)
    it(`${id}: в карточке — напряжение с возрастом матери, стихами и толкованием`, () => {
      const t = sojourn('mt-long');
      expect(t.persons).toEqual(expect.arrayContaining(['iokhaveda', id]));
      expect(t.cert).toBe('interpretation');
      expect(plain(t.text)).toMatch(/матери тогда было не меньше \d+ лет/);
      expect(plain(t.text)).toMatch(/430 лет считаются с прихода Авраама в Ханаан \(скобка Исх 12:40; Гал 3:17\)/);
      expect(t.refs).toEqual(expect.arrayContaining(['Исх 12:40', 'Чис 26:59']));
      // при кратком пребывании напряжения 430 лет нет, остаток «Левий — Иохаведа» называет и его (П15)
      const short = solve('mt-short').tensions.filter((x) => x.persons.includes('iokhaveda') && x.persons.includes(id));
      expect(short.some((x) => x.refs.includes('Исх 12:40'))).toBe(false);
      expect(short.map((x) => x.persons.slice(0, 3))).toEqual([['leviy', 'iokhaveda', 'moisey']]);
    });
  it('каждый ребёнок, родившийся после разрыва следа родителя, назван в напряжении вместе с этим родителем', () => {
    const bad: string[] = [];
    for (const { id: m } of MODELS) {
      const res = solve(m);
      for (const [parent, edges] of g.childrenOf) {
        const pc = res.persons.get(parent)!;
        if (pc.brk === undefined) continue;
        for (const e of edges) {
          if ((e.kind !== 'father' && e.kind !== 'mother') || e.gap) continue;
          const cc = res.persons.get(e.child)!;
          if (cc.cls === 'epochal' || cc.named || (e.kind === 'father' ? cc.b - 1 : cc.b) <= pc.brk + 0.5) continue;
          if (!res.tensions.some((t) => t.persons.includes(parent) && t.persons.includes(e.child))) bad.push(`${m}: ${parent} → ${e.child}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('5. Сжатое родословие от лица без чисел текста (DG 2.3.2): «Ахан, сын Хармия, сына Завдия, сына Зары» (Нав 7:1)', () => {
  // этап 13: та же трудность 430 лет — строка общей записи
  it('Зара вошёл в Египет с Иаковом, Ахан — при взятии Иерихона: 3 поколения — не меньше 330 лет при 430 годах пребывания', () => {
    const t = sojourn('mt-long');
    expect(t.kind).toBe('chain');
    expect(t.cert).toBe('interpretation');
    expect(t.persons).toEqual(expect.arrayContaining(['zara', 'zimri-syn-zary', 'kharmiy-syn-zimri', 'akhan']));
    expect(plain(t.text)).toMatch(/Зара — Зимри — Хармий — Ахан: 3 поколения — не меньше чем \d+ лет, в среднем не меньше чем по \d+ лет на поколение \(Зара родился не позже 1876 г\. до Р\. Х\., Ахан засвидетельствован ещё в 1406 г\. до Р\. Х\./);
    expect(t.refs).toContain('Исх 12:40');
    expect(solve('mt-short').tensions.some((x) => x.persons.includes('akhan'))).toBe(false);
  });
  it('нижняя оценка — без годов-оценок решателя: цепочка, которая не противоречит числам текста (Урий — Веселеил), напряжения не даёт', () => {
    expect(solve('mt-long').tensions.some((t) => t.persons.includes('veseleil-syn-uriya'))).toBe(false);
  });
});

describe('4. ТЗ § 3.6: «Ахаз → Езекия» и «Мардохей, уведённый с Иехонией» — в слое напряжений', () => {
  it('Ахаз — Езекия: по числам текста отцу около 11 лет — со стихами 4 Цар 16:2 и 18:2, во всех моделях', () => {
    for (const { id: m } of MODELS) {
      const t = tensionOf(m, ['akhaz', 'ezekiya'])!;
      expect(t, m).toBeDefined();
      expect(t.kind).toBe('numbers');
      expect(plain(t.text)).toMatch(/^Ахаз — Езекия: по числам текста отцу при рождении сына выходит около 11 лет: отец воцарился в 20 лет и царствовал 16 лет, сын воцарился после него в 25 лет\./);
      expect(plain(t.text)).toMatch(/По принятой реконструкции годов царствования разница в возрасте — 15 лет\./);
      expect(t.refs).toEqual(expect.arrayContaining(['4Цар 16:2', '4Цар 18:2', '2Пар 28:1', '2Пар 29:1']));
    }
  });
  it('простое сложение чисел текста проверено у всех царей: напряжение — только там, где отцу меньше 13 лет', () => {
    for (const t of solve('mt-long').tensions.filter((x) => x.kind === 'numbers' && /по числам текста отцу/.test(x.text))) {
      const [f, s] = t.persons.map((x) => g.persons.get(x)!.chrono!.reign![0]);
      expect(f.ageAtStart! + f.years! - s.ageAtStart!).toBeLessThan(13);
    }
  });
  it('Мардохей: переселён с Иехонией (Есф 2:6) — к двенадцатому году царя ему было бы не меньше 70 лет', () => {
    for (const { id: m } of MODELS) {
      const t = solve(m).tensions.find((x) => x.kind === 'text' && x.persons.includes('mardokhey'))!;
      expect(t, m).toBeDefined();
      expect(t.persons).toEqual(['kis-predok-mardokheya', 'semey-predok-mardokheya', 'iair-otets-mardokheya', 'mardokhey']);
      expect(t.cert).toBe('interpretation');
      const exile = toHist(Math.max(...g.persons.get('iekhoniya')!.chrono!.reign!.map((r) => toAstro(r.end))));
      expect(plain(t.text)).toMatch(new RegExp(`^Кис — Семей — Иаир — Мардохей: по прямому смыслу Есф 2:6 Мардохей переселён из Иерусалима в ${-exile} г\\. до Р\\. Х\\. и к двенадцатому году царя \\(Есф 3:7\\) ему было бы не меньше 70 лет\\.`));
      expect(plain(t.text)).toContain('«переселен из Иерусалима вместе с пленниками, выведенными с Иехониею»');
      expect(plain(t.text)).toMatch(/Вероятно, переселён был не сам Мардохей, а его прадед Кис/);
      expect(t.refs).toEqual(expect.arrayContaining(['Есф 2:6', 'Есф 2:5', 'Есф 3:7']));
    }
  });
  it('имена в текстах напряжений — цепочкой в именительном падеже, у каждого — стихи', () => {
    for (const t of solve('mt-long').tensions) {
      expect(t.text).toMatch(/^[А-ЯЁ][^:]*:/);
      expect(t.refs.length).toBeGreaterThan(0);
    }
  });
});
