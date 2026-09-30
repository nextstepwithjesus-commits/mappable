/**
 * Хронология, этап 7 (K1; решения владельца 21, 23, 24):
 *  — CARD-60: эпохи в годах модели — границы, заданные числами Писания, пересчитываются в каждой модели;
 *  — CARD-61: супруги одного поколения, иначе — напряжение в карточках обоих;
 *  — MAP-51: жизнь «до последнего упоминания» длиннее предела жизни эпохи — напряжение «родословие, вероятно, называет
 *    не все поколения» (толкование) и разрыв следа; напряжения «Салмон → Давид» и «Левий → Иохаведа → Моисей»;
 *  — MAP-52: лицо «время не установлено» — скобка засвидетельствованной деятельности или эпохи, знак в её середине;
 *  — MAP-53: верхний край промежутка рождения — не позже смерти и первого засвидетельствованного события;
 *  — MAP-54: братья и сёстры не рождаются в один год; младенец Давида и Вирсавии умер прежде рождения Соломона;
 *  — CARD-59: у народов и родов нет года рождения (named), нет современников.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Person, Epoch, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, contemporaries, normFor, spouseBand, siblingPairs, MODELS, STRETCH_SLACK, type ChronoResult, type ChronoModelId } from '../src/engine/chronology.ts';
import { modelEpochs, epochDelta, applyEpochDelta } from '../src/engine/epochs.ts';
import { computeLayout, type LineStep } from '../src/engine/layout.ts';
import { toAstro, toHist, shownYears, shownBirthRange } from '../src/engine/years.ts';
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
}, 180_000);
const span = (e: Epoch): [number, number] => [toAstro(e.start), toAstro(e.end)];
const LONG_GEN = new Set(['antediluvian', 'postdiluvian', 'patriarchs', 'egypt']);
/** Тексты напряжений набраны с неразрывными пробелами (typo): для сверки — обычные. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ');

describe('CARD-60: эпохи в годах модели (решение 21)', () => {
  it('правила границ в data/epochs.json дают в модели по умолчанию ровно годы данных', () => {
    const res = solve('mt-long');
    expect(res.epochs).toBeDefined();
    expect(res.epochs!.map((e) => [e.id, e.start, e.end, e.events.map((x) => x.year)])).toEqual(epochs.map((e) => [e.id, e.start, e.end, e.events.map((x) => x.year)]));
    // этап 13 (решение 99): основания написаны годами модели — у эпох данных, подставленных тем же modelEpochs, отличий нет
    expect(epochDelta(modelEpochs(epochs, () => null, 'mt-long'), res.epochs!)).toEqual({});
  });
  it('краткое пребывание: вход в Египет — 1661 г. до Р. Х. (1876 − 215), Аврам — 1951', () => {
    const e = solve('mt-short').epochs!;
    const by = (id: string) => e.find((x) => x.id === id)!;
    expect(by('patriarchs').start).toBe(-2166 + 215);
    expect(by('patriarchs').end).toBe(-1876 + 215);
    expect(by('egypt').start).toBe(-1876 + 215);
    expect(by('egypt').end).toBe(-1446); // Исход — по 3 Цар 6:1 и якорю, во всех моделях
    expect(by('postdiluvian').end).toBe(by('patriarchs').start);
    // события: «Иаков с домом приходит в Египет», «Иосиф в 30 лет…»
    expect(by('egypt').events[0].year).toBe(-1876 + 215);
    expect(by('patriarchs').events.find((x) => /Иосиф в 30 лет/.test(x.text))!.year).toBe(-1885 + 215);
  });
  it('краткое пребывание: Иосиф, сын Иакова, рождён в «Патриархах», жизнь Авраама не пересекает «Израиль в Египте»', () => {
    const res = solve('mt-short');
    expect(res.persons.get('iosif')!.epoch).toBe('patriarchs');
    expect(res.persons.get('iakov')!.epoch).toBe('patriarchs');
    const egypt = span(res.epochs!.find((x) => x.id === 'egypt')!);
    const a = res.persons.get('avraam')!;
    expect(a.d).not.toBeNull();
    expect(a.d!).toBeLessThan(egypt[0]);
  });
  it('модель чисел в скобках: сотворение и Потоп сдвигаются вместе с Адамом и Ноем', () => {
    const res = solve('lxx');
    const ante = res.epochs!.find((x) => x.id === 'antediluvian')!;
    expect(toAstro(ante.start)).toBe(res.persons.get('adam')!.b);
    expect(toAstro(ante.end)).toBe(res.persons.get('noy')!.b + 600);
  });
  it('отличия эпох модели восстанавливаются из файла модели (build-data → atlas.ts)', () => {
    // этап 13: отличия — от эпох модели по умолчанию (в индексе — они), вместе с основаниями, написанными годами модели
    const m = solve('mt-short').epochs!;
    const base = solve('mt-long').epochs!;
    expect(applyEpochDelta(base, epochDelta(base, m))).toEqual(m);
    const none = modelEpochs(epochs, () => null);
    expect(none.map((e) => [e.id, e.start, e.end, e.events])).toEqual(epochs.map((e) => [e.id, e.start, e.end, e.events]));
    // метки {start}, {end}, {years} подставлены; в «Кратком пребывании» у Египта своё основание — 215 лет
    for (const e of [...none, ...m]) expect(e.basis, e.id).not.toMatch(/[{}]/);
    expect(plain(m.find((e) => e.id === 'egypt')!.basis)).toMatch(/на Египет приходится 215 лет/);
  });
});

describe('CARD-61: супруги одного поколения', () => {
  it('Руфь и Махлон — ровесники по расчёту (прежде Руфь стояла через 110 лет после него)', () => {
    const res = solve('mt-long');
    expect(Math.abs(res.persons.get('ruf')!.b - res.persons.get('makhlon')!.b)).toBeLessThan(15);
  });
  for (const m of MODELS.map((x) => x.id))
    it(`${m}: разница супругов больше 40 лет — только вместе с напряжением в карточках обоих`, () => {
      const res = solve(m);
      const bad: string[] = [];
      let checked = 0;
      for (const [id, edges] of g.spousesOf) {
        for (const s of edges) {
          if (s.a !== id) continue;
          const a = res.persons.get(s.a)!;
          const w = res.persons.get(s.b)!;
          if (a.cls === 'epochal' || w.cls === 'epochal' || a.named || w.named) continue;
          checked++;
          const diff = Math.abs(w.b - a.b);
          if (diff <= 40) continue;
          // запись о супругах или общая запись трудности, в которой оба (430 лет: Амрам — Иохаведа; этап 13, решение 101)
          const tense = res.tensions.some((t) => t.persons.includes(s.a) && t.persons.includes(s.b));
          if (tense) continue;
          // эпохи долгих поколений (Исаак женился в 40 лет, Иаков — после 84, Быт 25:20; 29:20–28): предел растёт с поколением
          const ep = g.persons.get(s.a)!.chrono?.epoch ?? a.epoch ?? '';
          const band = spouseBand(normFor(ep));
          if (LONG_GEN.has(ep) && diff <= band.hi + 10) continue;
          bad.push(`${s.a} — ${s.b}: ${Math.round(diff)}`);
        }
      }
      expect(checked).toBeGreaterThan(80);
      expect(bad).toEqual([]);
    });
  it('напряжение супругов: оба лица, стихи брака, без стрелок, имена в именительном падеже', () => {
    const res = solve('mt-long');
    const ts = res.tensions.filter((t) => t.kind === 'spouses');
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) {
      expect(t.persons.length).toBe(2);
      expect(t.refs.length).toBeGreaterThan(0);
      expect(t.text).toMatch(/^[А-ЯЁ][^:]*:/);
      expect(t.text).not.toMatch(/→/);
    }
    const vr = ts.find((t) => t.persons.includes('vooz') && t.persons.includes('ruf'));
    if (vr) expect(plain(vr.text)).toMatch(/см\. напряжение «Наассон — Салмон — Вооз — Овид — Иессей — Давид»/);
  });
  it('решатель на выдуманной паре: граница держит жену в пределах [муж − 15; муж + 30], нарушение — напряжение', () => {
    const P = (x: Partial<Person> & { id: string }): Person => ({ name: x.id, sex: 'm', group: 'g', prominence: 2, ...x }) as Person;
    const free = solveChronology(buildGraph([
      P({ id: 'h', chrono: { born: { year: -1100, refs: ['Суд 1:1'] } } }),
      P({ id: 'w', sex: 'f', spouses: [{ id: 'h', kind: 'husband', refs: ['Суд 1:2'] }], chrono: { epoch: 'judges' } }),
    ]), epochs);
    const d = free.persons.get('w')!.b - free.persons.get('h')!.b;
    expect(d).toBeGreaterThanOrEqual(-15.5);
    expect(d).toBeLessThanOrEqual(30.5);
    const forced = solveChronology(buildGraph([
      P({ id: 'h', name: 'Муж', chrono: { born: { year: -1100, refs: ['Суд 1:1'] } } }),
      P({ id: 'w', name: 'Жена', sex: 'f', spouses: [{ id: 'h', kind: 'husband', refs: ['Суд 1:2'] }], chrono: { born: { year: -1020, refs: ['Суд 1:3'] } } }),
    ]), epochs);
    const t = forced.tensions.find((x) => x.kind === 'spouses')!;
    expect(t.persons).toEqual(['h', 'w']);
    expect(plain(t.text)).toMatch(/^Муж — Жена: по принятым годам жена моложе мужа на 80 лет/);
    expect(t.refs).toContain('Суд 1:2');
  });
});

describe('MAP-51: растянутые родословия (решение 24)', () => {
  const res = solve('mt-long');
  // этап 13 (решение 101): одна трудность — одна запись; «Левий → Иохаведа → Моисей» — её строка по границам текста
  it('«Левий → Иохаведа → Моисей»: напряжение-толкование со стихами', () => {
    const t = res.tensions.find((x) => ['leviy', 'iokhaveda', 'moisey'].every((id) => x.persons.includes(id)))!;
    expect(t).toBeDefined();
    expect(t.kind).toBe('chain');
    expect(t.cert).toBe('interpretation');
    expect(plain(t.text)).toMatch(/Левий — Иохаведа — Моисей: .*Вероятно, родословия называют не все поколения/);
    expect(t.refs).toContain('Чис 26:59');
    expect(t.refs).toContain('Исх 12:40');
  });
  it('«Салмон → Давид»: цепочка от Наассона, засвидетельствованного при Исходе, до Давида', () => {
    const t = res.tensions.find((x) => x.persons.includes('salmon') && x.persons.includes('david'))!;
    expect(t).toBeDefined();
    expect(t.persons).toEqual(['naasson', 'salmon', 'vooz', 'ovid', 'iessey', 'david']);
    expect(t.cert).toBe('interpretation');
    expect(plain(t.text)).toMatch(/не меньше чем \d+ лет/);
    expect(t.refs.some((r) => /^Руф 4:2[0-2]$/.test(r))).toBe(true);
    // от модели не зависит: Исход и Давид — по 3 Цар 6:1 и якорю
    expect(solve('mt-short').tensions.some((x) => x.persons.includes('salmon') && x.persons.includes('david'))).toBe(true);
  });
  it('каждая жизнь длиннее предела эпохи без чисел текста — с разрывом следа и напряжением', () => {
    const bad: string[] = [];
    let n = 0;
    for (const id of g.order) {
      const c = res.persons.get(id)!;
      const p = g.persons.get(id)!;
      if (c.cls === 'epochal' || c.named || c.infant) continue;
      const died = p.chrono?.died;
      const rangeOnly = !!died?.range && died.age === undefined && died.year === undefined;
      const end = c.d !== null && !rangeOnly ? c.d : c.d !== null ? Math.max(c.dLo ?? c.b, c.lastAttested ?? -Infinity) : c.lastAttested;
      if (end === null) continue;
      const limit = normFor(p.chrono?.epoch ?? c.epoch).lifeMax;
      if (end - c.b <= limit + STRETCH_SLACK) continue;
      if (died?.age !== undefined) continue; // возраст при смерти назван текстом (Аарон — 123 года)
      n++;
      if (c.brk === undefined || Math.abs(c.brk - (c.b + limit)) > 0.01) bad.push(`${id}: нет разрыва`);
      if (!res.tensions.some((t) => t.persons.includes(id) && t.cert === 'interpretation')) bad.push(`${id}: нет напряжения`);
    }
    expect(n).toBeGreaterThanOrEqual(3); // Арам, Иохаведа, Овид
    expect(bad).toEqual([]);
  });
  // ТЗ § 11.2, п. 9 и этап 13 (решение 101; X1 А2): напряжения 430 лет у Моисея нет, остаётся честный остаток
  // «Левий — Иохаведа — Моисей» по границам текста (Чис 26:59) — одна запись, без 430 лет
  it('в модели краткого пребывания напряжения 430 лет у Моисея нет — только остаток «Левий — Иохаведа» (ТЗ § 11.2, п. 9)', () => {
    const ts = solve('mt-short').tensions.filter((t) => t.persons.includes('moisey'));
    expect(ts.map((t) => t.persons.slice(0, 3))).toEqual([['leviy', 'iokhaveda', 'moisey']]);
    expect(ts[0].refs).not.toContain('Исх 12:40');
  });
  it('раскладка передаёт разрыв следа узлу неба: brk внутри сплошного следа', () => {
    const lines = {
      joseph: (JSON.parse(readFileSync(join(ROOT, 'data/lines/joseph.json'), 'utf8')).persons as LineStep[]).filter((s) => g.persons.has(s.id)),
      mary: (JSON.parse(readFileSync(join(ROOT, 'data/lines/mary.json'), 'utf8')).persons as LineStep[]).filter((s) => g.persons.has(s.id)),
    };
    const L = computeLayout(g, res, lines, { epochs: res.epochs });
    const withBrk = L.nodes.filter((x) => x.brk !== undefined);
    expect(withBrk.length).toBeGreaterThanOrEqual(3);
    for (const x of withBrk) {
      expect(x.trail).toBe('life');
      expect(x.brk!).toBeGreaterThan(x.t0);
      expect(x.brk!).toBeLessThan(x.t1);
    }
    expect(L.byPerson.get('iokhaveda')!.brk).toBeDefined();
  }, 60_000);
});

describe('MAP-52: лица «время не установлено» (решение 24)', () => {
  const res = solve('mt-long');
  const epochal = [...res.persons].filter(([, c]) => c.cls === 'epochal');
  it('знак — в середине скобки, у скобки есть основание', () => {
    expect(epochal.length).toBeGreaterThan(50);
    for (const [id, c] of epochal) {
      expect(c.b, id).toBeCloseTo((c.bLo + c.bHi) / 2, 6);
      expect(c.bHi, id).toBeGreaterThan(c.bLo);
      expect(c.when, id).toBeDefined();
    }
  });
  it('знак не стоит на начале эпохи и на меридиане события', () => {
    const marks = res.epochs!.flatMap((e) => [toAstro(e.start), ...e.events.map((x) => toAstro(x.year))]);
    const bad = epochal.filter(([, c]) => marks.some((y) => Math.abs(c.b - y) < 1)).map(([id]) => id);
    expect(bad).toEqual([]);
  });
  // Этап 13 (сверка т. 17): у Луки, Филимона, Онисима, Манаила и Луция теперь свои годы служения по тексту (active);
  // правила скобки проверяются на лицах, у которых годов по-прежнему нет
  it('Гиезий — годы служения Елисея, с которым он назван (4 Цар 4:12; 5:20–27); друзья Иова — одна скобка по Иову', () => {
    const e = g.persons.get('elisey')!.chrono!.active!;
    const c = res.persons.get('gieziy')!;
    expect(c.when).toEqual({ by: 'met', id: 'elisey' });
    expect(c.bLo).toBe(toAstro(e.from));
    expect(c.bHi).toBe(toAstro(e.to));
    const friends = ['elifaz-femanityanin', 'vildad', 'sofar'].map((id) => res.persons.get(id)!);
    for (const f of friends) {
      expect(f.cls).toBe('epochal');
      expect(f.when).toEqual({ by: 'met', id: 'iov' });
      expect([f.bLo, f.bHi]).toEqual([friends[0].bLo, friends[0].bHi]);
    }
  });
  it('Лоида — апостольское время по 2 Тим 1:5; братья Господни — не на Рождестве', () => {
    expect(res.persons.get('loida')!.when).toEqual({ by: 'mention', ref: '2Тим 1:5' });
    expect(res.persons.get('loida')!.bLo).toBe(toAstro(30));
    for (const id of ['iosiy-brat-gospoden', 'simon-brat-gospoden', 'iuda-brat-gospoden']) expect(res.persons.get(id)!.b).toBeGreaterThan(toAstro(-5) + 5);
  });
  it('Мелхиседек — в годы Авраама (встреча, Быт 14:18), а не в начале эпохи', () => {
    const c = res.persons.get('melkhisedek')!;
    const a = res.persons.get('avraam')!;
    expect(c.when).toEqual({ by: 'met', id: 'avraam' });
    expect(c.bLo).toBeGreaterThanOrEqual(a.b);
    expect(c.bHi).toBeLessThanOrEqual(a.d!);
  });
  it('на небе — след «epochal» без длины, место в полосе — вся скобка', () => {
    const L = computeLayout(g, res, { joseph: [], mary: [] }, { epochs: res.epochs });
    const n = L.byPerson.get('melkhisedek')!;
    expect(n.trail).toBe('epochal');
    expect(n.t0).toBeCloseTo(res.persons.get('melkhisedek')!.b, 6);
    expect(n.t1).toBe(n.t0);
  }, 60_000);
});

describe('MAP-53: промежуток рождения не выходит за смерть и первое засвидетельствованное событие', () => {
  for (const m of ['mt-long', 'mt-short'] as ChronoModelId[])
    it(`${m}: верхний край рождения оценки — не позже смерти`, () => {
      const res = solve(m);
      const bad: string[] = [];
      for (const [id, c] of res.persons) {
        if (c.cls !== 'estimated' || c.d === null) continue;
        const p = g.persons.get(id)!;
        if (p.chrono?.died?.age !== undefined) continue; // возраст при смерти — промежуток смерти сдвинут вместе с рождением
        if (c.bHi > Math.max(c.b, c.dHi ?? c.d) + 1e-6) bad.push(`${id}: ${Math.round(c.bHi)} > ${Math.round(c.dHi ?? c.d)}`);
      }
      expect(bad).toEqual([]);
    });
  it('Валаам (убит в 1406 г. до Р. Х., Чис 31:8): рождение — не позже смерти и не моложе 12 лет к пророчеству (круг 3: 1475–1420, прежде …–1410, а не …–1405)', () => {
    // этап 7, круг 3 (MAP-53, остаток): промежуток кончался в год пророчества — пророк мог «родиться» за 4 года до
    // гибели; теперь у пророка — наименьший возраст начала служения, 12 лет (Лк 2:42–47; engine/chronology.ts, ROLE_MIN_AGE)
    const c = solve('mt-long').persons.get('valaam')!;
    expect(c.bHi).toBeLessThanOrEqual(Math.max(c.b, c.d!) + 1e-6);
    expect(c.bHi).toBeLessThanOrEqual(toAstro(-1407) - 12 + 1e-6);
    const [lo, hi] = shownBirthRange(c);
    expect([toHist(lo), toHist(hi)]).toEqual([-1475, -1420]);
  });
  it('промежуток для показа округлён внутрь: его край не позже смерти', () => {
    const res = solve('mt-long');
    const bad: string[] = [];
    for (const [id, c] of res.persons) {
      if (c.cls !== 'estimated' || c.d === null || c.named) continue;
      if (g.persons.get(id)!.chrono?.died?.age !== undefined) continue;
      const [, hi] = shownBirthRange(c);
      if (hi > Math.max(shownYears(c)!.b, c.dHi ?? c.d) + 1e-6) bad.push(id);
    }
    expect(bad).toEqual([]);
  });
  it('отец не моложе 13 лет: верхний край рождения — не позже первого ребёнка без 13 лет', () => {
    const res = solve('mt-long');
    const bad: string[] = [];
    for (const [id, c] of res.persons) {
      if (c.cls !== 'estimated') continue;
      for (const e of g.childrenOf.get(id) ?? []) {
        if (e.kind !== 'father' || e.gap) continue;
        const k = res.persons.get(e.child)!;
        if (k.cls === 'epochal') continue;
        if (c.bHi > Math.max(c.b, k.b - 13) + 1e-6) bad.push(`${id} → ${e.child}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('MAP-54: братья и сёстры по порядку, не в один год', () => {
  const res = solve('mt-long');
  const y = (id: string) => Math.round(res.persons.get(id)!.b);
  it('сыновья Давида (1 Пар 3:1–9) — каждый в свой год; сын Вирсавии, умерший младенцем, — прежде Соломона', () => {
    const kids = (g.childrenOf.get('david') ?? []).filter((e) => e.kind === 'father').map((e) => e.child).filter((k) => g.persons.get(k)!.order !== undefined);
    expect(kids.length).toBeGreaterThanOrEqual(18);
    expect(new Set(kids.map(y)).size).toBe(kids.length);
    const baby = res.persons.get('mladenets-syn-virsavii')!;
    expect(res.persons.get('solomon')!.b).toBeGreaterThan(baby.d! + 0.9);
    // от Вирсавии — по порядку 1 Пар 3:5, после младенца (2 Цар 12:18, 24)
    const seq = ['mladenets-syn-virsavii', 'samus-syn-davida', 'sovav-syn-davida', 'nafan-syn-davida', 'solomon'];
    for (let k = 1; k < seq.length; k++) expect(y(seq[k]), seq[k]).toBeGreaterThan(y(seq[k - 1]));
    expect(res.persons.get('samus-syn-davida')!.byOrder).toBe(true);
  });
  it('сыновья Саруии — в разные годы, по порядку перечисления', () => {
    const ids = ['ioav', 'avessa', 'asail'];
    expect(new Set(ids.map(y)).size).toBe(3);
  });
  it('близнецы — в один год: Фарес и Зара (Быт 38:27–30), Исав и Иаков', () => {
    expect(y('fares')).toBe(y('zara'));
    expect(y('isav')).toBe(y('iakov'));
    expect(siblingPairs(g, 'iuda').some(([a, b]) => a === 'fares' && b === 'zara')).toBe(true); // пара есть, но у близнецов общий год по тексту
  });
  it('в один год с родным братом или сестрой — только там, где числа текста не оставляют места (прежде 299 лиц)', () => {
    const same = new Set<string>();
    for (const id of g.order) {
      const kids = [...new Set((g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father').map((e) => e.child))];
      for (let i = 0; i < kids.length; i++)
        for (let j = i + 1; j < kids.length; j++) {
          const a = g.persons.get(kids[i])!;
          const b = g.persons.get(kids[j])!;
          if (a.kind || b.kind) continue;
          if (a.chrono?.born?.offset?.from === b.id || b.chrono?.born?.offset?.from === a.id) continue; // близнецы
          const ca = res.persons.get(a.id)!;
          const cb = res.persons.get(b.id)!;
          if (ca.cls !== 'estimated' && cb.cls !== 'estimated') continue;
          if (Math.round(ca.b) === Math.round(cb.b)) {
            same.add(a.id);
            same.add(b.id);
          }
        }
    }
    expect(same.size).toBeLessThan(90);
  });
});

describe('CARD-59: народы и роды без года рождения (решение 23)', () => {
  const res = solve('mt-long');
  it('признак named у всех народов и родов, и только у них', () => {
    for (const p of persons) expect(!!res.persons.get(p.id)!.named, p.id).toBe(p.kind === 'people' || p.kind === 'clan');
  });
  it('годов для показа нет; современников нет, и сами они ничьи не современники', () => {
    const c = res.persons.get('ludim')!;
    expect(shownYears(c)).toBeNull();
    expect(contemporaries(res, 'ludim')).toEqual([]);
    expect(contemporaries(res, 'nimrod').some((x) => res.persons.get(x.id)!.named)).toBe(false);
  });
});

describe('данные неба и карточки (tools/build-data.ts → src/data/atlas.ts; нужна свежая npm run -s data)', () => {
  it('скобка, её основание, разрыв следа, признаки и эпохи модели доходят до индекса', async () => {
    const { models, loadModel } = await import('../src/data/atlas.ts');
    const m = models[0];
    expect(m.chrono.get('gieziy')!.when).toEqual({ by: 'met', id: 'elisey' });
    expect(m.chrono.get('loida')!.when).toEqual({ by: 'mention', ref: '2Тим 1:5' });
    expect(m.chrono.get('ieiel-1par5-7')!.when).toEqual({ by: 'kin', id: 'beera-syn-vaala' });
    expect(m.chrono.get('ludim')!.named).toBe(true);
    expect(m.chrono.get('david')!.named).toBeUndefined();
    expect(m.chrono.get('samus-syn-davida')!.byOrder).toBe(true);
    expect(m.nodeByPerson.get('iokhaveda')!.brk).not.toBeNull();
    expect(m.nodeByPerson.get('david')!.brk).toBeNull();
    expect(m.nodeByPerson.get('gieziy')!.trail).toBe('epochal');
    const short = await loadModel('mt-short');
    expect(short!.epochs.find((e) => e.id === 'egypt')!.start).toBe(-1661);
    expect(short!.chrono.get('iosif')!.epoch).toBe('patriarchs');
    expect(m.epochs.find((e) => e.id === 'egypt')!.start).toBe(-1876);
  }, 60_000);
});
