/**
 * Д6 для сцен пакета 1 (10 § 4.2.2; 04 § 3.8, § 9; 02 § 3.15). Настоящая база проходит без ошибок времени; расчёт по
 * моделям даёт таблицу 04 § 3.8; на каждое правило проверки — нарочно испорченная запись. Шаги — tools/base/corrections-d6.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Base } from '../tools/base/migrate.ts';
import { loadBase, validate } from '../tools/base/validate.ts';
import { modelYears, schemeYears } from '../tools/base/chrono-calc.ts';
import { D6_ACTORS } from '../tools/base/corrections-d6.ts';
import { numberSpans, wordsOf } from '../tools/base/numwords.ts';
import type { ChronoD6, KingScheme, TimeInput } from '../tools/base/types.ts';

let base: Base;
const errs = (b: Base, re: RegExp) => validate(b).filter((i) => i.level === 'error' && re.test(i.check)).map((i) => `${i.where}: ${i.msg}`).join('\n');
const rec = (b: Base, id: string) => b.chrono.find((c) => c.actor === id)!.chrono as ChronoD6;
const inp = (b: Base, id: string, kind: TimeInput['kind']) => rec(b, id).inputs.filter((t) => t.kind === kind);

beforeAll(() => {
  base = loadBase();
});

describe('числа словами', () => {
  it('количественные и порядковые, составные, в падежах; «семьи» и «стал» — не числа', () => {
    expect(numberSpans('Мафусал жил сто восемьдесят семь лет').map((s) => s.value)).toEqual([187]);
    expect(wordsOf(27, 'В двадцать седьмой год Иеровоама')).toBe('двадцать седьмой');
    expect(wordsOf(601, 'Шестьсот первого года к первому первого месяца')).toBe('Шестьсот первого');
    expect(wordsOf(480, 'В четыреста восьмидесятом году')).toBe('четыреста восьмидесятом');
    expect(numberSpans('семьи стал семя').length).toBe(0);
  });
});

describe('Д6: записи сцен пакета 1 — окончательного вида', () => {
  it('настоящая база — без ошибок времени, чисел, расчёта и моделей', () => {
    expect(errs(base, /^(время|число|расчёт|модель|эпоха|труды|цитата|целостность)$/)).toBe('');
  });

  it('все 75 записей сцен — входы без готовых лет; у датируемых входов — ссылка calc', () => {
    expect(D6_ACTORS).toHaveLength(75);
    for (const id of D6_ACTORS) {
      const r = rec(base, id);
      expect(Array.isArray(r.inputs)).toBe(true);
      expect(JSON.stringify(r)).not.toMatch(/"(year|from|to|start|end|range|sole)":-?\d/);
      for (const t of r.inputs) if (['age-at-birth', 'age-at-death', 'reign', 'synchronism', 'succeeded'].includes(t.kind)) expect([id, t.kind, !!t.calc]).toEqual([id, t.kind, true]);
    }
  });

  it('патриархи и Исход — по модели m-dolgoe, цари 4 Цар 15–18 — по схеме s-mcfall-young, Давид — по модели (Д-р1)', () => {
    expect(inp(base, 'p-sif', 'age-at-birth')[0].calc?.model).toBe('m-dolgoe');
    expect(inp(base, 'p-aaron', 'years-after')[0].calc?.model).toBe('m-dolgoe');
    expect(inp(base, 'p-david', 'reign')[0].calc?.model).toBe('m-dolgoe');
    for (const k of ['p-oziya', 'p-ioafam', 'p-akhaz', 'p-ezekiya', 'p-fakey', 'p-osiya-syn-ily']) expect(inp(base, k, 'reign')[0].calc?.scheme).toBe('s-mcfall-young');
  });

  it('семь сверок 4 Цар 15–18 — входами со стихами (04 § 3.8): 15:30; 17:1; 18:1, 9, 10, 13', () => {
    const refs = base.chrono.flatMap((c) => ((c.chrono as any).inputs ?? []) as TimeInput[]).flatMap((t) => (t.kind === 'synchronism' || (t.kind === 'under-king' && t.number) ? t.refs : []));
    for (const r of ['4Цар 15:30', '4Цар 17:1', '4Цар 18:1', '4Цар 18:9', '4Цар 18:10', '4Цар 18:13']) expect(refs).toContain(r);
    const h9 = inp(base, 'p-ezekiya', 'synchronism').find((t) => t.refs[0] === '4Цар 18:9')!;
    expect([h9.number, h9.atYear?.number]).toEqual([7, 4]);
  });

  it('Фарра и Аврам: «не меньше 130» — вывод, «семьдесят» Быт 11:26 — Писание, «ровно 130» — выбор модели', () => {
    const nb = inp(base, 'p-avraam', 'not-before');
    expect(nb.map((t) => [t.number, t.cert])).toEqual([[70, 'scripture'], [130, 'inference']]);
    const m = base.models.find((x) => x.id === 'm-dolgoe') as any;
    expect(m.choices.find((c: any) => /ровно 130/.test(c.what)).cert).toBe('calc');
  });

  it('соправление со стихом (4 Цар 15:5) — запись «Писание» словами стиха, без слова «соправление» в словах', () => {
    const t = inp(base, 'p-ioafam', 'under-king')[0];
    expect([t.cert, t.other, t.words]).toEqual(['scripture', 'p-oziya', 'Иофам, сын царя, начальствовал над дворцом и управлял народом земли']);
  });

  it('эпохи 1–5 — без готовых лет, граница 2–3 — выход Аврама из Харрана (Быт 12:4)', () => {
    const e = base.epochs.slice(0, 5);
    expect(JSON.stringify(e)).not.toMatch(/"(year|start|end)":-?\d/);
    expect(base.epochs[1].end.refs).toEqual(['Быт 12:4']);
    expect(base.epochs[2].start.rule).toEqual({ person: 'p-avraam', years: 75 });
  });
});

describe('расчёт по моделям — таблица 04 § 3.8', () => {
  it('годы до Р. Х. по четырём моделям', () => {
    const t = Object.fromEntries(['m-dolgoe', 'm-kratkoe', 'm-farra70', 'm-skobki'].map((m) => [m, modelYears(base, m).events]));
    expect(t['m-dolgoe']).toEqual({ creation: -4174, flood: -2518, exit: -2091, egypt: -1876, exodus: -1446 });
    expect(t['m-kratkoe']).toEqual({ creation: -3959, flood: -2303, exit: -1876, egypt: -1661, exodus: -1446 });
    expect(t['m-farra70']).toEqual({ creation: -4114, flood: -2458, exit: -2091, egypt: -1876, exodus: -1446 });
    expect(t['m-skobki']).toEqual({ creation: -5560, flood: -3298, exit: -2091, egypt: -1876, exodus: -1446 });
    expect(modelYears(base, 'm-dolgoe').person.get('p-avraam')).toEqual({ born: -2166, died: -1991 });
  });

  it('цари: у схемы по умолчанию таблицы автора нет — года нет; Тиле — справка без страницы', () => {
    expect(schemeYears(base, 's-mcfall-young', 'p-ezekiya')).toEqual([]);
    const th = schemeYears(base, 's-thiele', 'p-ezekiya');
    expect(th).toHaveLength(1);
    expect(th[0].page).toBeUndefined();
    expect(th[0].source).toMatch(/справка/);
    expect((base.models.find((x) => x.id === 's-thiele') as KingScheme).rejects.map((r) => r.ref)).toEqual(['4Цар 17:1', '4Цар 18:1', '4Цар 18:9-10']);
  });

  it('опора Самарии по схеме по умолчанию — 723, 722 — альтернатива по Тиле (04 § 9 п. 6)', () => {
    const a = base.anchors.anchors.find((x: any) => x.id === 'an-samaria');
    expect(a.value).toBe(-723);
    expect(a.alternatives.map((x: any) => x.value)).toEqual([-722]);
  });
});

describe('проверка ловит испорченные записи', () => {
  it('готовый год, число не из стиха, слагаемое не из стиха, событие расчёта не из стихов', () => {
    const b = structuredClone(base);
    const sif = rec(b, 'p-sif');
    (sif as any).inputs[0].year = -4044;
    sif.inputs[1].words = 'девятьсот тринадцать';
    rec(b, 'p-sim').inputs[0].parts![0].ref = 'Быт 7:7';
    rec(b, 'p-noy').inputs[0].calc!.event = 'Быт 6:1';
    const e = errs(b, /^(время|число|расчёт)$/);
    expect(e).toMatch(/p-sif.*готовый год/);
    expect(e).toMatch(/p-sif.*слов «девятьсот тринадцать» нет/);
    expect(e).toMatch(/p-sim.*слагаемого «шестисот» нет в Быт 7:7/);
    expect(e).toMatch(/p-noy.*событие расчёта «Быт 6:1» — не из стихов входа/);
  });

  it('модель на толковании по умолчанию; эпоха лица без стиха; поле прежнего вида рядом со входами', () => {
    const b = structuredClone(base);
    (b.models.find((x) => x.id === 'm-farra70') as any).default = true;
    rec(b, 'p-kaaf').epochs![0].refs = [];
    (rec(b, 'p-adam') as any).died = { age: 930 };
    const e = errs(b, /^(модель|стих|время)$/);
    expect(e).toMatch(/m-farra70.*не бывает моделью по умолчанию/);
    expect(e).toMatch(/p-kaaf.*без стиха/);
    expect(e).toMatch(/p-adam.*поле прежнего вида «died»/);
  });
});
