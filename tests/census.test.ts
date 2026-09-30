/**
 * Перепись двусмысленностей неба как проверка (этап 11, § 12; tools/census.ts): пороги Я1–Я15 на сценах § 12 — «все
 * лица» целиком, Адам с Каином, Ной, Авраам, Иаков, Давид, «Дом Нахора», род Иуды по отцам, колено Вениамина, «линии
 * Мессии»; масштабы ×1 и ×2, ширина 1440 (семейные сцены — и 390). Тест падает, если порог нарушен.
 *
 * Известные остатки (отчёт Q1, числа — в сообщении координатору): на «всех лицах» — узлы союзов, чья строка после конца
 * следа владельца занята чужим следом (общая раскладка не меняется, NFR-3), пересечения зубцов двух жён одного отца
 * с перемешанными по году детьми, названия созвездий на звёздах (прежние, K4: 4); в роде Иуды — стволы через коридор.
 * Для них ниже — верхние границы нынешних чисел: рост — поломка. Высота строки на 390 px — не ниже 32 px (Я12): в
 * семейной укладке на узком небе строки выше при том же масштабе времени (Q4; src/render/camera.ts, KY_MAX_TALL).
 */
import { beforeAll, describe, expect, it } from 'vitest';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;

beforeAll(async () => {
  C = await import('../tools/census.ts');
}, 60_000);

/** Нарушенные пороги без известных остатков сцены (они проверяются отдельно верхними границами). */
function strict(c: ReturnType<CensusMod['census']>, allow: RegExp[] = []): string[] {
  return C.violations(c).filter((v) => !allow.some((re) => re.test(v)));
}

describe('семейные сцены: пороги Я1–Я15 (§ 12)', () => {
  for (const id of ['noy', 'adam', 'avraam', 'iakov', 'david', 'nahor', 'benjamin', 'lines'])
    for (const scale of [1, 2])
      it(`${id} ×${scale}, 1440`, () => {
        const c = C.census(C.capture(id, scale, 1440));
        // «линии Мессии» на обзоре: обязательные имена лиц линий (ribbons.ts, drawKeyLineNames) ложатся на тусклые бусины —
        // прежнее правило подписей линий (K4: 41 случай), теперь 4; рост — поломка
        const lines1 = id === 'lines' && scale === 1;
        expect(strict(c, lines1 ? [/^Я12 \(звёзды\)/] : []), JSON.stringify(c.issues.slice(0, 8))).toEqual([]);
        if (lines1) expect(c.y12stars).toBeLessThanOrEqual(4);
        // связи в кадре есть (кроме «линий Мессии» на обзоре, где ленты — сплайн)
        if (id !== 'lines' || scale === 2) expect(c.kids).toBeGreaterThan(0);
      });
  it('род Иуды по отцам ×1 и ×2: пороги, кроме пересечений стволов со следами через коридор (≤ 17, известный остаток)', () => {
    for (const scale of [1, 2]) {
      const c = C.census(C.capture('judah', scale, 1440));
      expect(strict(c, [/^Я11 \(следы\)/])).toEqual([]);
      expect(c.y11trails).toBeLessThanOrEqual(17);
    }
  });
  it('телефон 390: все пороги, строка не ниже 32 px', () => {
    for (const id of ['noy', 'adam', 'iakov', 'david', 'nahor']) {
      const c = C.census(C.capture(id, 1, 390));
      expect(strict(c), id).toEqual([]);
      expect(c.rowPx, id).toBeGreaterThanOrEqual(32 - 0.5);
    }
  }, 60_000);
  it('телефон 390: Авраам, род Иуды, колено Вениамина, «линии Мессии» — строка не ниже 32 px; известные остатки не растут', () => {
    const at = (id: string) => C.census(C.capture(id, 1, 390));
    // Авраам: подпись «Агарь» у звезды Исаака (одна; прежде — и на его линии)
    const av = at('avraam');
    expect(av.rowPx).toBeGreaterThanOrEqual(32 - 0.5);
    expect(strict(av, [/^Я12 \(звёзды\)/])).toEqual([]);
    expect(av.y12stars).toBeLessThanOrEqual(1);
    // род Иуды: стволы через коридор (Я11 следы ≤ 17), два случая Я1 и одно пересечение союзов — как на 1440 и прежде
    const ju = at('judah');
    expect(ju.rowPx).toBeGreaterThanOrEqual(32 - 0.5);
    expect(ju.y1).toBeLessThanOrEqual(2);
    expect(ju.y11).toBeLessThanOrEqual(1);
    expect(ju.y11trails).toBeLessThanOrEqual(17);
    expect(ju.y8).toBeLessThanOrEqual(1);
    const be = at('benjamin');
    expect(be.rowPx).toBeGreaterThanOrEqual(32 - 0.5);
    expect(strict(be)).toEqual([]);
    // «линии Мессии» на обзоре: имена лиц линий на тусклых бусинах (было 12 при строке 26 px)
    const li = at('lines');
    expect(li.rowPx).toBeGreaterThanOrEqual(32 - 0.5);
    expect(strict(li, [/^Я12 \(звёзды\)/])).toEqual([]);
    expect(li.y12stars).toBeLessThanOrEqual(6);
  }, 60_000);
});

describe('«все лица» целиком (§ 4.1): пороги § 12 и верхние границы известных остатков', () => {
  for (const scale of [1, 2])
    it(`×${scale}`, () => {
      const c = C.census(C.capture('all', scale, 1440));
      // Я1: не больше 4 случаев, каждый — поимённо в отчёте
      expect(c.y1).toBeLessThanOrEqual(4);
      expect(c.y2).toBe(0);
      expect(c.y3).toBeLessThanOrEqual(20);
      expect(c.y4).toBe(0);
      expect(c.y5).toBe(0);
      expect(c.y6).toBe(0);
      expect(c.y7).toBe(0);
      // Я8: каждое пересечение с живым чужим следом — разрыв (у ×2 — два случая, известный остаток); узлы на чужих
      // следах — строки, занятые после конца следа владельца (раскладка), не больше нынешних
      expect(c.y8).toBeLessThanOrEqual(scale === 1 ? 0 : 2);
      expect(c.y8nodes).toBeLessThanOrEqual(8);
      expect(c.y9).toBe(0);
      // Я11: зубцы двух жён одного отца с детьми, перемешанными по строкам общей раскладки (Ашхур, Шахараим, Саул, Меред):
      // у двух отдельных стволов пересечение неизбежно; прежде у Саула два союза стояли одним ромбом на общей шине — теперь
      // узлы одного следа разнесены на 2r + 2 px (Г7), и одно пересечение стало видно
      expect(c.y11).toBeLessThanOrEqual(4);
      expect(c.y12lines).toBeLessThanOrEqual(0.01 * c.y12of);
      expect(c.y12overlaps).toBe(0);
      expect(c.y13).toBe(0);
      expect(c.y14ends / c.y14of).toBeGreaterThanOrEqual(0.95);
      // постороннее лицо под указателем на линии — только у случаев Я1 (линия ближе r + 5 к чужой звезде): меньше 0,5 % точек
      expect(c.y14foreign / c.y14of).toBeLessThan(0.005);
      expect(c.y15 / c.kids).toBeLessThanOrEqual(0.02);
    }, 60_000);
});
