/**
 * Этап 17 (docs/ui-review/STAGE17.md; просьба владельца 3 октября: «где его жёны, где дети, все ветки перемешаны… при
 * наведении на одну линию показывается только часть, а не полная связь»; «возьми лучшее из нового и старого атласа»):
 *  — решение 190: грамматика связей этапа 14 — ромб союза на следе отца, отвесный ствол к детям; путь происхождения
 *    ребёнка идёт от звезды отца по его следу к ромбу и вниз к ребёнку;
 *  — наведённая связь рисуется целиком (drawLinkRoute; проба canvas[data-link-route]);
 *  — у выбранного лица горят пути его супругов к ромбам союзов и пути родителей к ромбу их союза (drawFamilyRoutes;
 *    проба canvas[data-family-routes]);
 *  — подписи семьи выбранного — со словом родства (kinWordTo): «Сарра, жена», «Исаак, сын».
 * Вместо tests/links-house.test.ts (решения 174–179 «Отчего дома» сняты решением 190); указатель шатра (frame.ts) остался
 * и проверяется здесь же.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;
let marks: typeof import('../src/render/marks.ts');
let frame: typeof import('../src/render/frame.ts');
let labels: typeof import('../src/render/labels.ts');
let lk: typeof import('../src/engine/linkkey.ts');

beforeAll(async () => {
  C = await import('../tools/census.ts');
  marks = await import('../src/render/marks.ts');
  frame = await import('../src/render/frame.ts');
  labels = await import('../src/render/labels.ts');
  lk = await import('../src/engine/linkkey.ts');
}, 60_000);

type Frame = ReturnType<CensusMod['captureView']>;
const memo = new Map<string, Frame>();
const shot = (id: string, select: string, extra: Record<string, unknown> = {}): Frame => {
  const k = `${id}|${select}|${JSON.stringify(extra)}`;
  return memo.get(k) ?? memo.set(k, C.captureView('all', { person: id }, { select, extra })).get(k)!;
};
const starOf = (f: Frame, id: string) => f.stars.find((q) => q.id === id && !q.ghost)!;
const nodeOf = (f: Frame, uid: string) => f.d.frame.nodes.find((n) => n.union === uid && n.kind === 'union')!;
const ds = (f: Frame) => (f.s.canvas as unknown as { dataset: Record<string, string | undefined> }).dataset;
/** точки ломаных путей в координатах экрана */
const points = (routes: number[][]) => routes.flatMap((r) => r.reduce<[number, number][]>((a, _, k) => (k % 2 ? a : [...a, [r[k], r[k + 1]]]), []));

describe('решение 190: ромб союза — на следе отца (грамматика этапа 14)', () => {
  // этап 14 (links.ts, motherNode): ромб — на следе отца; на следе матери — только если её след лежит между следом отца и
  // детьми (Рахиль — между Иаковом и Вениамином), тогда от отца к ромбу идёт черта брака
  it('Иаков: ромбы четырёх союзов — на следе Иакова или жены, черта брака — от Иакова', () => {
    const f = shot('iakov', 'iakov');
    for (const uid of ['u:iakov+liya', 'u:iakov+rakhil', 'u:iakov+valla', 'u:iakov+zelfa']) {
      const n = nodeOf(f, uid);
      expect(n, uid).toBeTruthy();
      expect(['iakov', uid.split('+')[1]], uid).toContain(n.owner);
      expect(n.from, uid).toBe('iakov');
      expect(Math.abs(n.y + f.d.dy - starOf(f, n.owner).y), uid).toBeLessThanOrEqual(1.5);
      if (n.owner !== 'iakov') expect(f.d.frame.paths.some((q) => q.kind === 'bar' && q.union === uid), uid).toBe(true);
    }
    expect(nodeOf(f, 'u:iakov+liya').owner).toBe('iakov');
  });
  it('Вениамин: путь происхождения — от звезды Иакова по его следу к ромбу Рахили и вниз к Вениамину', () => {
    const f = shot('iakov', 'iakov');
    const pts = points(marks.originRoute(f.s, f.d, 'veniamin'));
    expect(pts.length).toBeGreaterThan(0);
    const near = (x: number, y: number, tol = 2) => pts.some(([px, py]) => Math.hypot(px - x, py - y) <= tol);
    const jacob = starOf(f, 'iakov');
    const rachel = nodeOf(f, 'u:iakov+rakhil');
    const ben = starOf(f, 'veniamin');
    expect(near(jacob.x, jacob.y)).toBe(true);
    expect(near(rachel.x + f.d.dx, rachel.y + f.d.dy)).toBe(true);
    // путь доходит до строки Вениамина у его звезды
    expect(pts.some(([px, py]) => Math.abs(py - ben.y) <= 2 && Math.abs(px - ben.x) <= ben.r + 12)).toBe(true);
  });
});

describe('наведённая связь — целиком (просьба владельца: «показывается только часть»)', () => {
  it('наведение на связь «Иаков и Рахиль → Иосиф» рисует путь целиком: от звезды Иакова через ромб до Иосифа', () => {
    const key = lk.parseLinkKey('k.iakov.rakhil._.iosif')!;
    const f = shot('iakov', 'iakov', { linkHover: key });
    expect(ds(f).linkRoute?.startsWith('k.iakov.rakhil._.iosif:')).toBe(true);
    const routes = marks.selectedRoutes(f.s, f.d, key).all;
    const pts = points(routes);
    const jacob = starOf(f, 'iakov');
    const iosif = starOf(f, 'iosif');
    const rachel = nodeOf(f, 'u:iakov+rakhil');
    const near = (x: number, y: number, tol = 2) => pts.some(([px, py]) => Math.hypot(px - x, py - y) <= tol);
    expect(near(jacob.x, jacob.y)).toBe(true);
    expect(near(rachel.x + f.d.dx, rachel.y + f.d.dy)).toBe(true);
    expect(pts.some(([px, py]) => Math.abs(py - iosif.y) <= 2 && Math.abs(px - iosif.x) <= iosif.r + 12)).toBe(true);
  });
  it('без наведения пробы нет; выбранная связь не рисуется второй раз', () => {
    expect(ds(shot('iakov', 'iakov')).linkRoute).toBeUndefined();
    const key = lk.parseLinkKey('k.iakov.rakhil._.iosif')!;
    expect(ds(shot('iakov', 'iakov', { linkHover: key, link: key })).linkRoute).toBeUndefined();
  });
});

describe('семья выбранного: пути супругов и родителей, слова родства', () => {
  it('Авраам выбран: горят пути Сарры, Агари и Хеттуры к ромбам союзов и пути родителей Авраама', () => {
    const f = shot('avraam', 'avraam');
    const tags = (ds(f).familyRoutes ?? '').split(' ');
    for (const t of ['spouse:sarra', 'spouse:agar', 'spouse:khettura']) expect(tags, t).toContain(t);
    expect(tags).toContain('parent:farra');
  });
  // слова — по данным союзов и родства: Быт 16:3 («дала её Авраму… в жену»), 1 Пар 1:32 («Хеттуры, наложницы Авраамовой»),
  // Быт 35:22 («Валлою, наложницею отца своего»), Быт 25:9 (Исаак и Измаил — сыновья Авраама от разных матерей)
  const cases: [string, string, string][] = [
    ['avraam', 'sarra', 'жена'],
    ['avraam', 'agar', 'жена'],
    ['avraam', 'khettura', 'наложница'],
    ['avraam', 'isaak', 'сын'],
    ['avraam', 'farra', 'отец'],
    ['isaak', 'izmail', 'брат по отцу'],
    ['iakov', 'valla', 'наложница'],
    ['iosif', 'veniamin', 'брат'],
    ['david', 'iessey', 'отец'],
  ];
  for (const [a, b, w] of cases) it(`${a} → ${b}: «${w}»`, () => expect(labels.kinWordTo(a, b)).toBe(w));
  it('не родня — слова нет; народ и род — без слова', () => {
    expect(labels.kinWordTo('avraam', 'david')).toBeNull();
  });
  it('у подписей семьи выбранного на небе — слово родства: подпись Исаака шире одного имени', () => {
    const f = shot('avraam', 'avraam');
    const isaak = f.boxes.find((b) => b.kind === 'star' && b.id === 'isaak');
    expect(isaak, f.boxes.map((b) => `${b.kind}:${b.text}`).join(' ')).toBeTruthy();
    // подпись хранит имя; слово родства — пояснение той же подписи («Исаак, сын»): без выбора та же подпись уже на «, сын»
    const bare = C.captureView('all', { person: 'avraam' }, { select: null }).boxes.find((b) => b.kind === 'star' && b.id === 'isaak');
    expect(bare).toBeTruthy();
    expect(isaak!.w - bare!.w).toBeGreaterThan(C.textWidth(', сын', '400 13px Literata') * 0.8);
  });
});

describe('указатель шатра (frame.ts)', () => {
  it('«Лия: Рувим, Симеон, Левий и ещё 1»; без детей — союз', () => {
    expect(frame.tentText('u:iakov+liya', ['ruvim', 'simeon', 'leviy', 'issakhar']).replace(/ /g, ' ')).toBe('Лия: Рувим, Симеон, Левий и ещё 1');
    expect(frame.tentText('u:iakov+valla', ['dan'])).toBe('Валла: Дан');
    expect(frame.tentText('u:iakov+rakhil', ['iakov'])).toBe('Иаков');
    expect(frame.tentText('u:david+', ['ieremof-syn-davida'])).toBe('Давид: Иеромоф');
  });
});
