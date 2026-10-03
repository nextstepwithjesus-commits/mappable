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
  it('род Иуды по отцам ×1 и ×2: пороги, пересечения стволов со следами через коридор — не больше 10 (§ 12; этап 13, X3 Д11)', () => {
    for (const scale of [1, 2]) {
      const c = C.census(C.capture('judah', scale, 1440));
      expect(strict(c, [/^Я11 \(следы\)/])).toEqual([]);
      // этап 13: черта брака царя с царицей-матерью не пересекает коридор (src/engine/family.ts, CORRIDOR_HIT) — порог § 12
      // (10) вместо ослабленного 17
      expect(c.y11trails).toBeLessThanOrEqual(10);
    }
  }, 60_000);
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
      // Я1: этап 14 (решение 134, G8: ход ствола обходит звёзды по всей длине) — не больше 2 (было 4; на ×1 — Уззий, сын
      // Белы, и Кис, сын Иеиля: тесные гнёзда без свободного x)
      expect(c.y1).toBeLessThanOrEqual(2);
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
      // Я11: прежде 5 и 4 — зубцы двух жён одного отца с детьми, перемешанными по строкам общей раскладки (Ашхур,
      // Шахараим, Саул, Меред, Халев). Этап 13, решение 95: дети отца идут группами по матерям (src/engine/layout.ts), узел
      // союза — на следе жены-спутницы при любом её удалении (links.ts, qualifies): пересечений нет (П6)
      expect(c.y11).toBe(0);
      // связь × чужой след: порог X3 — 74 и 99 (было 90 и 119); на данных сверки этапа 13 — 72 и 95
      expect(c.y11trails).toBeLessThanOrEqual(scale === 1 ? 74 : 99);
      expect(c.y12lines).toBeLessThanOrEqual(0.01 * c.y12of);
      expect(c.y12overlaps).toBe(0);
      expect(c.y13).toBe(0);
      expect(c.y14ends / c.y14of).toBeGreaterThanOrEqual(0.95);
      // постороннее лицо под указателем на линии — только у случаев Я1 (линия ближе r + 5 к чужой звезде): меньше 0,5 % точек
      expect(c.y14foreign / c.y14of).toBeLessThan(0.005);
      expect(c.y15 / c.kids).toBeLessThanOrEqual(0.02);
      // этап 13 (решение 95, П6): двусмысленных связей — не больше одной
      expect(c.y15).toBeLessThanOrEqual(1);
      // этап 13 (решения 93, 94; П1–П5): правило концов и словарь начертаний на всём небе
      expect([c.ch1, c.ch2, c.ch3, c.ch4, c.ch6, c.ch7], JSON.stringify(c.issues.filter((q) => q.check.startsWith('Ч')).slice(0, 8))).toEqual([0, 0, 0, 0, 0, 0]);
    }, 60_000);
});

/**
 * Этап 13 (STAGE13 § 4, П1–П6; X3 § 3): показы с пропусками поколений и созвездия. Ч1 путь ленты с ключом шага — от
 * родителя шага; Ч2 концы выбранной связи — свои; Ч3 скрытый конец — призраком; Ч4 точки ленты — только толкование,
 * «+N» — число скрытых; Ч5 лицо линии на своей нити (показ линий); Ч6 союз связан с обоими супругами; Ч7 точки на связях —
 * только толкование.
 */
describe('этап 13: правило концов, словарь начертаний, союз с обоими супругами (Ч1–Ч7)', () => {
  const zero = (c: ReturnType<CensusMod['census']>) => [c.ch1, c.ch2, c.ch3, c.ch4, c.ch5, c.ch6, c.ch7];
  const why = (c: ReturnType<CensusMod['census']>) => JSON.stringify(c.issues.filter((q) => q.check.startsWith('Ч')).slice(0, 8));
  for (const id of ['key', 'keyMary', 'setGap', 'messiah', 'lines', 'judahT', 'davidic', 'davidBoth', 'halev', 'saul', 'ashhur'])
    it(`${id}: Ч1–Ч7 — ноль на ×1 и ×2`, () => {
      for (const scale of [1, 2]) {
        const c = C.census(C.capture(id, scale, 1440));
        expect(zero(c), `${id} ×${scale}: ${why(c)}`).toEqual([0, 0, 0, 0, 0, 0, 0]);
      }
    }, 60_000);
  it('«ключевые лица» и набор с пропусками: скрытые поколения — разрывами «+N», у концов вне показа — призраки (снимок 20)', () => {
    const key = C.census(C.capture('key', 1, 1440));
    // 16 пропусков лент (X3: столько было точечных шагов) — теперь 16 знаков «+N», у всех верное число
    expect(key.ch4gaps).toBeGreaterThanOrEqual(12);
    expect(key.ch3of).toBeGreaterThan(0);
    const set = C.census(C.capture('setGap', 1, 1440));
    expect(set.ch4gaps).toBeGreaterThanOrEqual(5);
    expect(set.ch3of).toBeGreaterThan(0);
  }, 60_000);
  it('все колена на масштабе чтения: Ч1–Ч7 — ноль', () => {
    const c = C.census(C.capture('tribes', 1, 1440));
    expect(zero(c), why(c)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }, 60_000);
  it('К3, К5: у выбранного лица скрытые показом родитель и родня словами Писания — призраки с подписью «… — вне показа»', async () => {
    const marks = await import('../src/render/marks.ts');
    // Мария в «ключевых лицах»: Илий вне показа — призрак «Илий, отец» (толкование, Лк 3:23)
    const m = C.captureAt('keyMary', 'mariya', 120, { select: 'mariya' });
    const gm = marks.personGhosts(m.s);
    expect(gm.map((g) => `${g.id}:${g.role}:${g.why}`)).toContain('iliy-otets-marii:отец:show');
    // Давид в «ключевых лицах»: сестра Саруия вне показа — призрак с термином «сестра» (1 Пар 2:16)
    const d = C.captureAt('key', 'david', 120, { select: 'david' });
    const gd = marks.personGhosts(d.s);
    expect(gd.map((g) => `${g.id}:${g.role}`)).toContain('saruiya:сестра');
    // поле попадания не меньше 24 × 24 (щелчок — показать гостем)
    for (const g of [...gm, ...gd]) expect(Math.min(g.w, g.h)).toBeGreaterThanOrEqual(24 - 0.5);
    // на «всём небе» скрытых нет — и призраков нет
    expect(marks.personGhosts(C.captureAt('all', 'david', 120, { select: 'david' }).s)).toEqual([]);
  }, 120_000);
  it('Д12: кольца и роли концов выбранной связи не ложатся на чужие имена — снимок 20 (r.m.mariya) на 390 и 1440, «Саруия — сестра Давида»', async () => {
    const marks = await import('../src/render/marks.ts');
    const { parseLinkKey } = await import('../src/engine/linkkey.ts');
    const cases: [string, string, string, number, number][] = [];
    for (const years of [40, 80, 160])
      for (const width of [390, 1440]) {
        cases.push(['key', 'mariya', 'r.m.mariya', width, years], ['keyMary', 'mariya', 'r.m.mariya', width, years]);
        cases.push(['all', 'david', 'n.david.saruiya', width, years]);
      }
    for (const [sc, at, ks, width, years] of cases) {
      const link = parseLinkKey(ks);
      expect(link, ks).toBeTruthy();
      const f = C.captureAt(sc, at, years, { width, extra: { link } });
      const rects = marks.selectedEndRects(f.s);
      expect(rects.some((r) => r.kind === 'ring'), `${ks} ${width}: колец нет`).toBe(true);
      const names = f.s.labelStats().boxes.filter((b) => b.kind === 'star');
      const bad: string[] = [];
      // кольцо не закрывает чужих имён; роль — никаких, и своего тоже («дочь» на «Мария», X3 Д12)
      for (const r of rects)
        for (const b of names) {
          if (b.id === r.id && r.kind === 'ring') continue;
          const w = Math.min(r.box.x + r.box.w, b.x + b.w) - Math.max(r.box.x, b.x);
          const h = Math.min(r.box.y + r.box.h, b.y + b.h) - Math.max(r.box.y, b.y);
          if (w > 0 && h > 0) bad.push(`${r.kind} ${r.id} × ${b.text} (${Math.round(w * h)} px²)`);
        }
      expect(bad, `${sc} ${ks} ${width} ${years} лет`).toEqual([]);
    }
  }, 300_000);
  it('Г-М (решение 95): в общей раскладке дети по матерям — сериями; перемешаны не больше чем у двух семей вне коридора (Халев, Саул)', async () => {
    const atlas = await import('../src/data/atlas.ts');
    const { unions } = await import('../src/ui/reveal.ts');
    const m = atlas.models[0];
    const lane = (id: string) => m.nodeByPerson.get(id)?.lane;
    const spine = new Set([...atlas.lines.joseph.persons, ...atlas.lines.mary.persons].map((q) => q.id));
    const mixed: string[] = [];
    for (const [father, us] of unions.of) {
      if (spine.has(father) || atlas.byId.get(father)?.sex !== 'm') continue;
      const fl = lane(father);
      const withKids = us.filter((u) => u.a === father && !u.claim && u.kids.some((k) => lane(k) !== undefined && !spine.has(k)));
      if (fl === undefined || withKids.length < 2) continue;
      // по каждую сторону от отца: сколько серий подряд у детей одной матери; серий больше, чем матерей, — перемешаны
      const bad = [-1, 1].some((side) => {
        const kids = withKids.flatMap((u) => u.kids.map((k) => ({ l: lane(k), u: u.id })).filter((q): q is { l: number; u: string } => q.l !== undefined && Math.sign(q.l - fl) === side));
        kids.sort((a, b) => a.l - b.l);
        const runs = kids.filter((q, i) => i === 0 || q.u !== kids[i - 1].u).length;
        return runs > new Set(kids.map((q) => q.u)).size;
      });
      if (bad) mixed.push(father);
    }
    expect(mixed.length, mixed.join(', ')).toBeLessThanOrEqual(2);
    for (const id of mixed) expect(['khalev-syn-esroma', 'saul']).toContain(id);
  }, 120_000);
  it('«Дом Давидов»: черты брака царей с царицами-матерями не через коридор — пересечений со следами не больше 8 (было 13–14; порог X3 — 0, не достигнут: 7–8)', () => {
    for (const scale of [1, 2]) expect(C.census(C.capture('davidic', scale, 1440)).y11trails).toBeLessThanOrEqual(8);
  }, 60_000);
});

/**
 * Этап 14, GRAPH STRESS (решение 158; STAGE14 § 4, Г1–Г7; сцены отчёта G § 6): «всё небо» в окне читателя — без выбора
 * и с выбором, ширина неба 1440 и 940 (с карточкой). Г1 свой след не разрезан; Г2 ромб не на чужом пути, вертикали
 * разных союзов не совпадают; Г3 Я1 с выбором не больше, чем без; Г4 имена матерей у ромбов выбранного — поставлены;
 * Г5 второй родитель союза выбранного не погашен; Г6 на дальнем масштабе связей на экран не больше 150 и подписей
 * обрывков без линий нет; Г7 координата у обрывка — только при втором конце за краем, одна на лицо. Известные остатки
 * Г2 — верхними границами (рост — поломка): ромб Ефы у черты Маахи (Халев; окна Ашхура и Халева на 940), Лия у черты
 * Зелфы на 940; на дальних масштабах (ромбы бледны с подробностью кадра) — числа этапа 14.
 */
describe('этап 14: GRAPH STRESS (Г1–Г7)', () => {
  type G = ReturnType<CensusMod['graphCensus']>;
  const run = (id: string, width: number, sel: string | null | undefined): G => {
    const g = C.GRAPH_SCENES.find((q) => q.id === id)!;
    return C.graphCensus(C.captureGraph(g, width, sel === undefined ? g.select : sel), id);
  };
  const why = (c: G) => JSON.stringify(c.issues.slice(0, 6).map((q) => `${q.check} ${q.text}`));
  /** известные остатки Г2: «сцена|ширина|выбор» → узлов на чужом пути не больше */
  // (Халев на 940 — 0: шина многожёнца разводится, дальний ребёнок тесного гнезда уходит в соседнее, links.ts splitCrowded)
  const G2_LEFT: Record<string, number> = { 'ashhur|1440|-': 1, 'ashhur|1440|+': 1, 'iakov|940|+': 1, 'iakov|940|-': 1, 'iakovDan|940|+': 1, 'iakovDan|940|-': 1, 'far900|1440|-': 1, 'far1300|1440|-': 8 };
  const SAME_LEFT: Record<string, number> = { 'far1300|1440|-': 2, 'far2000|1440|-': 2 };
  for (const g of ['esrom', 'halev', 'david', 'iakov', 'iakovDan', 'halevLink', 'iuda', 'ashhur', 'saul', 'kettura', 'benjamin', 'edom', 'nations', 'efraim', 'return', 'far900', 'far1300', 'far2000', 'iisus'])
    it(`${g}: Г1, Г2, Г5–Г7 — 1440 без выбора и с выбором, 940 с выбором; Г3 — Я1 с выбором не больше, чем без`, () => {
      const sc = C.GRAPH_SCENES.find((q) => q.id === g)!;
      const cases: [number, string | null][] = [[1440, null], ...(sc.select ? ([[1440, sc.select], [940, sc.select], [940, null]] as [number, string | null][]) : [])];
      const got = new Map<string, G>();
      for (const [w, sel] of cases) {
        const c = run(g, w, sel);
        const k = `${g}|${w}|${sel ? '+' : '-'}`;
        got.set(k, c);
        expect(c.ownCut, `Г1 ${k}: ${why(c)}`).toBe(0);
        expect(c.nodeOnPath, `Г2 узлы ${k}: ${why(c)}`).toBeLessThanOrEqual(G2_LEFT[k] ?? 0);
        expect(c.sameVert, `Г2 вертикали ${k}: ${why(c)}`).toBeLessThanOrEqual(SAME_LEFT[k] ?? 0);
        expect(c.dimmed, `Г5 ${k}: ${why(c)}`).toBe(0);
        expect(c.bareStubText, `Г6 ${k}: ${why(c)}`).toBe(0);
        expect([c.coordBoth, c.coordRepeat], `Г7 ${k}: ${why(c)}`).toEqual([0, 0]);
        expect(c.xNoCut, `связь × связь без разрыва ${k}`).toBe(0);
        if (sel && w === 1440 && c.mothersOf) expect(c.mothers, `Г4 ${k}`).toBe(c.mothersOf);
        if (sel && w === 940 && c.mothersOf) expect(c.mothers, `Г4 ${k}`).toBe(c.mothersOf);
      }
      if (sc.select) {
        // Г3 (G8): развернувшиеся при выборе длинные связи не задевают чужих звёзд — Я1 на дальних ходах с выбором не больше,
        // чем без него (на той же ширине неба). Я1 всего кадра с выбором и без сравнивать нельзя: выбор зажигает род
        // выбранного на любом масштабе (решение 135), и в кадре больше связей
        // (известный остаток: Давид на 940 — дальний ход к сыновьям, рождённым в Иерусалиме, от ромба у самой звезды Нафана)
        const G3_LEFT: Record<string, number> = { 'david|940': 1 };
        for (const w of [1440, 940]) expect(got.get(`${g}|${w}|+`)!.y1full, `Г3 ${g} ${w}`).toBeLessThanOrEqual(got.get(`${g}|${w}|-`)!.y1full + (G3_LEFT[`${g}|${w}`] ?? 0));
      }
      // Г6: на 900 годах на экране не больше 150 связей (было 703)
      if (g === 'far900') expect(got.get('far900|1440|-')!.onScreen).toBeLessThanOrEqual(150);
    }, 300_000);
  it('окно кадра связей (С1): в видимой части неба связи те же, что у кадра по всему небу', () => {
    for (const id of ['david', 'iakov', 'halev', 'iuda', 'far900', 'iisus'])
      for (const [w, sel] of [[1440, null], [940, 'sel']] as const) {
        const g = C.GRAPH_SCENES.find((q) => q.id === id)!;
        if (sel && !g.select) continue;
        const pick = sel ? g.select : null;
        C.linkWindowRule(true);
        let win: string[];
        try {
          win = C.pathsInView(C.captureGraph(g, w, pick));
        } finally {
          C.linkWindowRule(false);
        }
        const all = C.pathsInView(C.captureGraph(g, w, pick));
        expect(win, `${id} ${w}${sel ? ' с выбором' : ''}`).toEqual(all);
      }
  }, 300_000);
  it('ширины текста переписи — по таблице шрифтов неба (контракт 5, tools/font-widths.json), а не 0,56 кегля', () => {
    const w = C.textWidth('Давид', '620 16px Literata, serif');
    // строчные Literata — 0,65–0,68 кегля; заглавная Д — 0,75
    expect(w / 16).toBeGreaterThan(5 * 0.6);
    expect(C.textWidth('Давид', '620 16px Literata, serif')).not.toBeCloseTo(5 * 16 * 0.56, 0);
  });
});
