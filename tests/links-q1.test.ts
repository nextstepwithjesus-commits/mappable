/**
 * Грамматика связей на небе (этап 11, решения 78, 79; STAGE11.md § 2–3, § 8; src/render/links.ts) на настоящих данных:
 * Ной во «всех лицах» (снимок 13), Адам в наборе (снимок 12), Авраам, Иаков и Давид — семейная укладка.
 * Кадры — через перепись (tools/census.ts): то же небо, те же показы, что у атласа.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type CensusMod = typeof import('../tools/census.ts');
let C: CensusMod;
let links: typeof import('../src/render/links.ts');
let words: typeof import('../src/ui/linkwords.ts');
let key: typeof import('../src/engine/linkkey.ts');
let marks: typeof import('../src/render/marks.ts');
let plates: typeof import('../src/render/plates.ts');

beforeAll(async () => {
  C = await import('../tools/census.ts');
  links = await import('../src/render/links.ts');
  words = await import('../src/ui/linkwords.ts');
  key = await import('../src/engine/linkkey.ts');
  marks = await import('../src/render/marks.ts');
  plates = await import('../src/render/plates.ts');
}, 60_000);

type Frame = ReturnType<CensusMod['capture']>;
const star = (f: Frame, id: string) => f.stars.find((s) => s.id === id && !s.ghost)!;
const pathsTo = (f: Frame, kid: string) => [...f.paths, ...f.ribbons].filter((q) => q.ends[q.ends.length - 1] === kid && (q.kind === 'tooth' || q.kind === 'ribbon' || q.kind === 'stub'));
/** Строка без неразрывных пробелов и соединителей типографики (typo). */
const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ').replace(/\u2060/g, '');
/** Пути кадра в окне холста. */
const inView = (f: Frame) => (q: { pts: number[] }) => {
  for (let k = 0; k + 1 < q.pts.length; k += 2) if (q.pts[k] >= 0 && q.pts[k] <= f.s.cam.w && q.pts[k + 1] >= 0 && q.pts[k + 1] <= f.s.cam.h) return true;
  return false;
};

/** Точка на середине пути (px холста). */
const midOf = (q: { pts: number[] }) => {
  const segs = links.segmentsOf(q);
  const [x0, y0, x1, y1] = segs[Math.floor(segs.length / 2)];
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
};

describe('снимок 13: Ной во «всех лицах» (сценарий 1)', () => {
  it('ромб союза Ноя — на его следе; Сим не задет стволом; к Симу — лента, зубцов к Симу нет; к Хаму и Иафету — зубцы', () => {
    const f = C.captureAt('all', 'noy', 700, { select: null });
    const noy = star(f, 'noy');
    const node = f.nodes.find((n) => n.union === 'u:noy+' && n.kind === 'union')!;
    expect(node).toBeTruthy();
    expect(node.owner).toBe('noy');
    expect(Math.abs(node.y - noy.y)).toBeLessThan(0.5);
    expect(node.x).toBeGreaterThan(noy.x);
    expect(node.x).toBeLessThanOrEqual(noy.x1! + 1);
    // Сим — лента, одна связь — одна линия (Г1)
    const toSim = pathsTo(f, 'sim');
    expect(toSim.every((q) => q.kind === 'ribbon')).toBe(true);
    expect(toSim.length).toBeGreaterThan(0);
    // стволы и зубцы не ближе r + 5 к звезде Сима (Г5)
    const sim = star(f, 'sim');
    for (const q of f.paths)
      if (!q.ends.includes('sim')) for (const [x0, y0, x1, y1] of links.segmentsOf(q)) expect(links.distSeg(sim.x, sim.y, x0, y0, x1, y1), q.ks).toBeGreaterThanOrEqual(sim.r + links.STAR_CLEAR - 0.01);
    for (const kid of ['kham', 'iafet']) expect(pathsTo(f, kid).some((q) => q.kind === 'tooth' && q.key.kind === 'child' && q.key.union === 'u:noy+'), kid).toBe(true);
    // грамматика кадра: косых отрезков нет, зубцы 5–40 px, стволы разных союзов не рядом, звёзды не задеты
    const seen = inView(f);
    expect(links.checkLinks({ ...f.d.frame, paths: [...f.paths, ...f.ribbons].filter(seen) }, f.stars).filter((i) => i.check !== 'gap')).toEqual([]);
  });
  it('подсказка ствола — «Ной и его жена: Сим, Хам, Иафет (Быт 5:32)»; щелчок по зубцу Хама — связь «союз → Хам»', () => {
    const f = C.captureAt('all', 'noy', 700, { select: null });
    const trunk = f.paths.find((q) => q.kind === 'trunk' && q.union === 'u:noy+')!;
    expect(trunk).toBeTruthy();
    const m = midOf(trunk);
    const hit = f.s.linkAt(m.x + 1, m.y, 6, false)!;
    expect(hit.key.kind).toBe('union');
    expect(plain(words.linkTip(hit.key))).toBe('Ной и его жена: Сим, Хам, Иафет (Быт 5:32)');
    const tooth = f.paths.find((q) => q.kind === 'tooth' && q.ends.includes('kham'))!;
    const t = midOf(tooth);
    const h2 = f.s.linkAt(t.x, t.y + 1, 6, false)!;
    expect(key.linkKeyString(h2.key)).toBe('k.noy._._.kham');
  });
  it('пересечение ствола с чужим следом — разрыв следа 3 px с каждой стороны (Г7)', () => {
    const f = C.captureAt('all', 'noy', 700, { select: null });
    const cuts = f.paths.flatMap((q) => q.cuts);
    for (let k = 2; k < cuts.length; k += 3) expect(cuts[k]).toBeGreaterThanOrEqual(links.TRAIL_CUT);
  });
});

describe('снимок 12: Адам в наборе (сценарий 2)', () => {
  it('к Сифу и к Еносу — ровно по одному пути, и это лента; косых линий и помет на небе нет', () => {
    const f = C.capture('adam', 1, 1440);
    for (const kid of ['sif', 'enos']) {
      const ps = pathsTo(f, kid);
      expect(ps.length, kid).toBeGreaterThan(0);
      expect(new Set(ps.map((q) => q.kind)), kid).toEqual(new Set(['ribbon']));
      // одна связь: у шага одной линии — один путь; у общего шага обеих линий — по одному на линию, но одним маршрутом
      expect(new Set(ps.map((q) => q.pts.join(','))).size, kid).toBe(1);
    }
    expect(links.checkLinks({ ...f.d.frame, paths: f.paths }, f.stars).filter((i) => i.check === 'oblique')).toEqual([]);
    expect(f.boxes.filter((b) => /по порядку|годы —/.test(b.text))).toEqual([]);
  });
});

describe('семейная укладка: Авраам, Иаков, Давид (сценарии 3, 4)', () => {
  it('Авраам: три союза с детьми — три ромба, каждый на следе матери; грамматика кадра без нарушений', () => {
    const f = C.capture('avraam', 1, 1440);
    for (const w of ['sarra', 'agar', 'khettura']) {
      const n = f.nodes.find((q) => q.union === `u:avraam+${w}` && q.kind === 'union')!;
      expect(n, w).toBeTruthy();
      expect(n.owner, w).toBe(w);
      expect(Math.abs(n.y - star(f, w).y), w).toBeLessThan(0.5);
    }
    expect(links.checkLinks({ ...f.d.frame, paths: [...f.paths, ...f.ribbons] }, f.stars)).toEqual([]);
  });
  it('Иаков: четыре союза, дети группами у матерей; связь «Иаков и Рахиль → Иосиф» ловится по зубцу, подсказка — её словами', () => {
    const f = C.capture('iakov', 1, 1440);
    const kids: Record<string, string[]> = { liya: ['ruvim', 'simeon', 'leviy', 'issakhar', 'zavulon', 'dina'], rakhil: ['iosif', 'veniamin'], valla: ['dan', 'neffalim'], zelfa: ['gad', 'asir'] };
    for (const [w, ks] of Object.entries(kids)) {
      const n = f.nodes.find((q) => q.union === `u:iakov+${w}` && q.kind === 'union')!;
      expect(n.owner, w).toBe(w);
      for (const k of ks) expect(f.paths.some((q) => q.kind === 'tooth' && q.key.kind === 'child' && q.key.child === k && q.key.union === `u:iakov+${w}`), `${w}>${k}`).toBe(true);
    }
    const tooth = f.paths.find((q) => q.kind === 'tooth' && q.ends.includes('iosif'))!;
    const m = midOf(tooth);
    const hit = f.s.linkAt(m.x, m.y, 6, false)!;
    expect(key.linkKeyString(hit.key)).toBe('k.iakov.rakhil._.iosif');
    expect(plain(words.linkTip(hit.key))).toMatch(/^Иаков и Рахиль — родители; Иосиф — сын \(Быт 30:2[2-4]/);
    expect(links.checkLinks({ ...f.d.frame, paths: [...f.paths, ...f.ribbons] }, f.stars)).toEqual([]);
  });
  it('Давид: лестница союзов идёт только вправо; ленты к Соломону и Нафану выходят из узла «Давид и Вирсавия» (Я17, ±2 px)', () => {
    const f = C.capture('david', 1, 1440);
    const node = f.nodes.find((q) => q.union === 'u:david+virsaviya' && q.kind === 'union')!;
    expect(node.owner).toBe('virsaviya');
    for (const pk of ['david>solomon', 'david>nafan-syn-davida']) {
      const v = f.d.frame.via.get(pk)!;
      expect(v, pk).toBeTruthy();
      expect(Math.abs(v.x - node.x), pk).toBeLessThanOrEqual(2);
    }
    // ступеньки лестницы — вправо (x не убывает по пути)
    for (const q of f.paths.filter((p) => p.kind === 'jog')) for (let k = 2; k < q.pts.length; k += 2) expect(q.pts[k], q.ks).toBeGreaterThanOrEqual(q.pts[k - 2] - 0.5);
    expect(links.checkLinks({ ...f.d.frame, paths: [...f.paths, ...f.ribbons] }, f.stars)).toEqual([]);
  });
});

describe('выбор линии (§ 8): попадание, жёлтая связь, журнал кадра', () => {
  it('попадание по сетке — не дольше 1 мс на движение указателя («все лица» целиком)', () => {
    const f = C.capture('all', 1, 1440);
    const s = f.s;
    const pts = f.paths.slice(0, 400).map(midOf);
    const t0 = performance.now();
    for (const p of pts) s.linkAt(p.x + 2, p.y + 2, 6, false);
    const per = (performance.now() - t0) / pts.length;
    expect(per).toBeLessThan(1);
  }, 60_000);
  it('выбранная связь: жёлтый путь по связи, кольца с ролями на обоих концах; небо гаснет до 30 %, концы — в полную силу', () => {
    const f = C.capture('iakov', 1, 1440);
    const k = key.parseLinkKey('k.iakov.rakhil._.iosif')!;
    const g = C.frameOf(C.SCENES.iakov, f.s, 1, 1440, { link: k });
    const info = g.s.linkSel!;
    expect(info.ks).toBe('k.iakov.rakhil._.iosif');
    expect(info.segs).toBeGreaterThan(0);
    expect(info.ends.map((e) => `${e.id}:${e.role}`).sort()).toEqual(['iakov:отец', 'iosif:сын', 'rakhil:мать']);
    expect(info.ends.every((e) => e.on)).toBe(true);
    expect(info.x).not.toBeNull();
    // путь выбранной связи — те же отрезки, что у связи в кадре (±1 px): зубец к Иосифу в нём (этап 12, решение 88: путь
    // идёт целиком от узла по стволу и зубцу — зубец стал отрезком общей ломаной, а не отдельной)
    const tooth = g.paths.find((q) => q.ks === 'k.iakov.rakhil._.iosif' && q.kind === 'tooth')!;
    const route = marks.selectedRoute(g.s, g.d, k);
    const near = (x: number, y: number, px: number, py: number) => Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1;
    const hasTooth = (r: number[]) => {
      for (let j = 0; j + 3 < r.length; j += 2) {
        const [x0, y0, x1, y1] = r.slice(j, j + 4);
        if ((near(x0, y0, tooth.pts[0], tooth.pts[1]) && near(x1, y1, tooth.pts[2], tooth.pts[3])) || (near(x1, y1, tooth.pts[0], tooth.pts[1]) && near(x0, y0, tooth.pts[2], tooth.pts[3]))) return true;
      }
      return false;
    };
    expect(route.some(hasTooth)).toBe(true);
    // подписи концов обязательны (Я24)
    const named = new Set(g.boxes.filter((b) => b.kind === 'star').map((b) => b.id));
    for (const id of ['iakov', 'rakhil', 'iosif']) expect(named.has(id), id).toBe(true);
    expect(plates.LINK_YELLOW.night).toBe('#F2E600');
  });
  it('журнал кадра canvas[data-links] разбирается обратно: вид, начертание, ключ, точки', () => {
    const f = C.capture('noy', 1, 1440);
    const log = links.linkLog(f.paths, f.nodes, { l: 0, t: 0, r: f.s.cam.w, b: f.s.cam.h }, 0, 0);
    const back = links.parseLinkLog(log);
    const tooth = back.find((q) => q.kind === 'tooth')!;
    expect(tooth.style).toBe('solid');
    expect(key.parseLinkKey(tooth.ks)?.kind).toBe('child');
    expect(tooth.pts.length).toBe(4);
    expect(back.some((q) => q.kind === 'node')).toBe(true);
  });
});

describe('помета порядка (Г9; DG 2.3.6; стык 5)', () => {
  it('familyOrderNote — стихи, где названы дети этого союза: у жён Ламеха — свои диапазоны', () => {
    const note = (u: string) => plain(links.familyOrderNote(u) ?? '');
    expect(note('u:lamekh-kainit+ada-zhena-lamekha')).toBe('по порядку перечисления, Быт 4:19–21, выв.');
    expect(note('u:lamekh-kainit+tsilla')).toBe('по порядку перечисления, Быт 4:19–22, выв.');
    expect(note('u:iakov+valla')).toBe('по порядку перечисления, Быт 30:4–8, выв.');
    expect(note('u:noy+')).toBe('по порядку перечисления, Быт 5:32, выв.');
    expect(plain(links.personOrderNote('iaval') ?? '')).toBe('по порядку перечисления, Быт 4:19–21, выв.');
  });
});
