/**
 * Хронология по всем лицам всех моделей (этап 13; X1 § 3; STAGE13 § 4, П8–П15) — числами tools/chrono-audit.ts:
 *  П8  числа текста выполнены (0 невыполненных);
 *  П9  матерей старше 45, жён старше мужа больше чем на 15 лет, отцов моложе 16 при оценочных годах — 0 вне напряжений;
 *      у детей одного отца с порядком рождения (order) год не убывает — 0 вне напряжений (T4, решение 104);
 *  П10 показанный год за границей текста, ребёнок позже смерти отца больше чем на год, «X–X» — 0;
 *  П11 эпоха жизни: на годах служения или царствования; «Апостольская Церковь» у Страстной седмицы и «Межзаветное время»
 *      у лиц Евангелий — 0;
 *  П12 «ок.» у годов по числам, оценка шире 10 лет без «между» — 0;
 *  П14 синхронизм с расхождением больше года без note — 0;
 *  П15 четыре напряжения ТЗ § 3.6 во всех моделях; 430 лет — одна запись; нет «Вооз — Руфь»; «Фарре 70 — Деян 7:4»;
 *      остаток «Левий — Иохаведа» в «Кратком пребывании»; «по возрастам, названным в тексте» — только со своими числами;
 *      в «Фарре 70» Аран, Аврам и Нахор родились в разные годы, Аврам старший.
 * И поля контракта 1 на лицах из сценариев X1 § 3 (п. 11): Мария, Лазарь, Иоанн Креститель, Раав, Кааф, Иисус Христос.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { runAudit, type Audit } from '../tools/chrono-audit.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Epoch, Person, Volume } from '../src/data/types.ts';
import { buildGraph } from '../src/engine/graph.ts';
import { solveChronology, modelDependence, MODELS, type ChronoResult } from '../src/engine/chronology.ts';
import { lifeText, toAstro, toHist } from '../src/engine/years.ts';

const ROOT = join(__dirname, '..');
let A: Audit;
beforeAll(() => {
  A = runAudit();
}, 300_000);

describe('П8–П15: по всем лицам всех четырёх моделей', () => {
  it('П8: все числа текста выполнены', () => {
    for (const m of A.models) expect(m.numbers, m.model).toEqual([]);
  });
  it('П9: матери, жёны и отцы при оценочных годах — в пределах вне напряжений', () => {
    for (const m of A.models) {
      expect(m.mothers45, m.model).toEqual([]);
      expect(m.wivesOlder15, m.model).toEqual([]);
      expect(m.fathers16, m.model).toEqual([]);
    }
  });
  it('порядок рождения из данных (order) не нарушен вне напряжений (Лия: Рувим, Симеон, Левий, Иуда…)', () => {
    for (const m of A.models) expect(m.siblingOrder, m.model).toEqual([]);
  });
  it('П10: показанные годы не выходят за границы текста; ребёнок не позже года после смерти отца; нет «X–X»', () => {
    for (const m of A.models) {
      expect(m.shownOutOfBounds, m.model).toEqual([]);
      expect(m.afterFatherDeath, m.model).toEqual([]);
      expect(m.sameYearSpan, m.model).toEqual([]);
    }
  });
  it('П11: эпоха жизни — по засвидетельствованной жизни', () => {
    for (const m of A.models) {
      expect(m.activityEpoch, m.model).toEqual([]);
      expect(m.passionApostolic, m.model).toEqual([]);
      expect(m.gospelIntertestamental, m.model).toEqual([]);
    }
  });
  it('П12: «ок.» — только у оценки; оценка шире 10 лет — «между»', () => {
    for (const m of A.models) {
      expect(m.approxOnCalc, m.model).toEqual([]);
      expect(m.wideWithoutBetween, m.model).toEqual([]);
    }
  });
  it('П14: синхронизмы, расходящиеся с началом царствования больше чем на год, — с пояснением', () => {
    expect(A.syncNoNote).toEqual([]);
  });
  it('П15: напряжения ТЗ § 3.6 — во всех моделях; 430 лет — одна запись; «Вооз — Руфь» нет', () => {
    for (const m of A.models) {
      expect(m.tz36.levi, m.model).toBeGreaterThanOrEqual(1);
      expect(m.tz36.salmon, m.model).toBeGreaterThanOrEqual(1);
      expect(m.tz36.ahaz, m.model).toBeGreaterThanOrEqual(1);
      expect(m.tz36.mordecai, m.model).toBeGreaterThanOrEqual(1);
      expect(m.sojourn430, m.model).toBe(m.model === 'mt-short' ? 0 : 1);
      expect(m.voozRuth, m.model).toBe(0);
      expect(m.ageWordsWithoutNumbers, m.model).toEqual([]);
      expect(m.special['Езекия — Осия'], m.model).toBe(true);
      expect(m.special['Авиуд'], m.model).toBe(true);
      expect(m.special['Каинан'], m.model).toBe(m.model !== 'lxx');
      expect(m.special['Деян 7:4'], m.model).toBe(m.model === 'terah70');
      expect(m.special['Иохаведа'], m.model).toBe(true);
    }
  });
  it('«Фарре 70»: Аран, Аврам и Нахор — в разные годы, Аврам старший', () => {
    const t = A.terah70;
    expect(new Set([t.aran, t.avraam, t.nakhor]).size).toBe(3);
    expect(t.oldest).toBe(true);
  });
  it('П13: годы меняются между моделями не у всех; после Исхода — только у родословий без лиц с годами', () => {
    expect(A.modelDep.persons).toBeGreaterThan(400);
    expect(A.modelDep.persons).toBeLessThan(900);
    expect(A.modelDep.afterExodus['mt-long']).toBe(0);
    // «Краткое пребывание»: род Иерахмеила (1 Пар 2:25–41) и подобные — X2 Д12
    expect(A.modelDep.afterExodus['mt-short']).toBeGreaterThan(0);
    expect(A.modelDep.afterExodus['mt-short']).toBeLessThan(120);
  });
});

// ---------- поля контракта 1 на лицах сценариев ----------
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
const epochs = JSON.parse(readFileSync(join(ROOT, 'data/epochs.json'), 'utf8')) as Epoch[];
let R: Record<string, ChronoResult>;
beforeAll(() => {
  R = Object.fromEntries(MODELS.map((m) => [m.id, solveChronology(g, epochs, m.id)]));
}, 300_000);
const plain = (s: string) => s.replace(/ /g, ' ').replace(/⁠/g, '');

describe('контракт 1: эпоха жизни, основание, границы текста (X1 § 3, п. 11)', () => {
  it('Мария, Лазарь, Иоанн Креститель — «Евангельская история»; эпоха рождения Марии — другая', () => {
    const P = R['mt-long'].persons;
    for (const id of ['mariya', 'lazar', 'ioann-krestitel', 'zakhariya-svyashchennik', 'elisaveta']) expect(P.get(id)!.lifeEpoch, id).toBe('christ');
    expect(P.get('mariya')!.birthEpoch).toBe('intertestamental');
  });
  it('Раав при взятии Иерихона (1406 г. до Р. Х.) не моложе 16 лет; годы — «между»', () => {
    const c = R['mt-long'].persons.get('raav')!;
    expect(toAstro(-1406) - c.b).toBeGreaterThanOrEqual(16);
    expect(plain(lifeText(c))).toMatch(/^род\. между \d+ и \d+ гг\. до Р\. Х\./);
  });
  it('Кааф: «род. между … и 1876», а не «ок. 1875» — округление внутрь границы «вошёл в Египет с Иаковом»', () => {
    const c = R['mt-long'].persons.get('kaaf')!;
    expect(c.pin).toBe('hi');
    expect(plain(lifeText(c))).toMatch(/^род\. между \d+ и 1876/);
  });
  it('Иисус Христос: «ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.», год — по опоре (Мф 2:1; смерть Ирода)', () => {
    const c = R['mt-long'].persons.get('iisus')!;
    expect(c.bApprox).toBe(true);
    expect(c.dApprox).toBe(true);
    expect(plain(lifeText(c))).toBe('ок. 5 г. до Р. Х. — ок. 30 г. по Р. Х.');
    expect(c.basis?.kind).toBe('year');
  });
  it('Давид — «1040–970», по реконструкции, одинаково во всех моделях; Авраам — по числам текста, в «Кратком пребывании» — 1951', () => {
    const d = R['mt-long'].persons.get('david')!;
    expect(plain(lifeText(d))).toBe('1040–970 гг. до Р. Х.');
    expect(d.basis?.kind).toBe('reign');
    const dep = modelDependence(g, MODELS.map((m) => R[m.id]));
    expect(dep.persons.has('david')).toBe(false);
    expect(R['mt-long'].persons.get('avraam')!.basis?.kind).toBe('numbers');
    expect(toHist(Math.round(dep.persons.get('avraam')!['mt-short']!.b))).toBe(-1951);
    // сводка моделей: годы опорных событий, Исход — один во всех моделях
    const ev = (m: string, id: string) => dep.info.find((x) => x.id === m)!.events.find((e) => e.id === id)!.year;
    expect(ev('mt-long', 'adam')).toBe(-4174);
    expect(ev('mt-short', 'abram')).toBe(-1951);
    expect(ev('lxx', 'adam')).toBe(-5560);
    for (const m of MODELS) expect(ev(m.id, 'exodus'), m.id).toBe(-1446);
  });
  it('Авиуд: сжатое родословие Мф 1:13–16 — запись вместо «через 55 лет после отца»', () => {
    const t = R['mt-long'].tensions.find((x) => x.kind === 'compressed' && x.persons.includes('aviud-syn-zorovavelya'))!;
    expect(t).toBeDefined();
    expect(t.cert).toBe('interpretation');
    expect(plain(t.text)).toMatch(/^Зоровавель — Авиуд — .* — Иосиф: 10 поколений — не меньше чем \d+ лет/);
  });
  it('Вооз и Раав: пропуск поколений и у матери (Мф 1:5) — Вооз не на 49 лет старше Руфи', () => {
    const P = R['mt-long'].persons;
    expect(Math.abs(P.get('ruf')!.b - P.get('vooz')!.b)).toBeLessThan(30);
    expect((g.parentsOf.get('vooz') ?? []).find((e) => e.kind === 'mother')!.gap).toBe(true);
  });
});
