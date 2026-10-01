/**
 * Навигация и контекст (этап 14, решения 145–149) без браузера: путь исследования и поля записи истории (контракт 3),
 * «Ближайшая родня» и возврат, Escape, родня первого колена и указатели у края, сдвиг к родне по ссылке (решение 146),
 * строки окна лица на телефоне. Поведение в браузере — сценарии 1140–1159 (tools/accept/nav14.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest';

let sky: typeof import('../src/render/sky.ts');
let atlas: typeof import('../src/data/atlas.ts');
let view: typeof import('../src/ui/sky/view.ts');
let common: typeof import('../src/ui/common.tsx');
let address: typeof import('../src/ui/address.ts');
let show: typeof import('../src/ui/show.ts');
let frame: typeof import('../src/render/frame.ts');
let keys: typeof import('../src/ui/keys.ts');
let state: typeof import('../src/state.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  atlas = await import('../src/data/atlas.ts');
  view = await import('../src/ui/sky/view.ts');
  common = await import('../src/ui/common.tsx');
  address = await import('../src/ui/address.ts');
  show = await import('../src/ui/show.ts');
  frame = await import('../src/render/frame.ts');
  keys = await import('../src/ui/keys.ts');
  state = await import('../src/state.ts');
});

type SkyT = InstanceType<typeof import('../src/render/sky.ts').Sky>;
function makeSky(w = 1440, h = 776): SkyT {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => (k === 'measureText' ? (t: string) => ({ width: t.length * 7 }) : () => ({ addColorStop: () => {} })),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  const canvas = { getContext: () => ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s: SkyT = new sky.Sky(canvas);
  s.resize(w, h, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  common.skyRef.current = s;
  return s;
}

describe('путь исследования (решение 148; контракт 3)', () => {
  it('новый выбор — в конец, не больше 5; выбор лица из пути обрезает путь до него; снятие выбора путь не стирает', () => {
    const { pathAfter, PATH_MAX } = address;
    expect(PATH_MAX).toBe(5);
    let p: readonly string[] = [];
    for (const id of ['ruf', 'vooz', 'david', 'solomon']) p = pathAfter(p, id);
    expect(p).toEqual(['ruf', 'vooz', 'david', 'solomon']);
    expect(pathAfter(p, 'solomon')).toBe(p);
    expect(pathAfter(p, 'vooz')).toEqual(['ruf', 'vooz']);
    expect(pathAfter(p, null)).toBe(p);
    p = pathAfter(pathAfter(p, 'rovoam'), 'avia');
    expect(p).toEqual(['vooz', 'david', 'solomon', 'rovoam', 'avia']);
  });
  it('запись истории хранит номер, путь и положение листа; чужие id пути отбрасываются', () => {
    const m = address.markOf({ toledot: 1, link: false, seq: 7, path: ['ruf', 'net-takogo', 'david'], sheet: 'half' });
    expect(m).toEqual({ toledot: 1, link: false, seq: 7, path: ['ruf', 'david'], sheet: 'half' });
    expect(address.markOf({ toledot: 1 })).toEqual({ toledot: 1, link: false });
    expect(address.markOf(null)).toBeNull();
    expect(address.historyApplying.peek()).toBeNull();
  });
});

describe('«Ближайшая родня» (решение 145; контракт 3)', () => {
  it('показ «предки и потомки, 1 поколение, по крови»; строка показа называет его одним именем', () => {
    const s = show.nearestShow('david');
    expect(s).toEqual({ kind: 'lineage', id: 'david', dir: 'both', gen: 1, by: 'blood' });
    expect(show.isNearest(s)).toBe(true);
    expect(show.isNearest({ kind: 'lineage', id: 'david', dir: 'both', gen: null, by: 'blood' })).toBe(false);
    const n = show.nearestCount('david');
    expect(n).toBeGreaterThan(25);
    const sum = show.summaryOf(s);
    expect(sum.label).toMatch(/^На небе: ближайшая родня Давида( \(.+\))? — \d+ лиц/);
    expect(sum.short[0].text).toMatch(/^ближайшая родня Давида — /);
  });
  it('у Иакова — родители, все четыре матери его детей и дети', () => {
    const c = show.contentOf(show.nearestShow('iakov'));
    const all = new Set([...c.ids, ...c.guests]);
    for (const id of ['isaak', 'revekka', 'liya', 'rakhil', 'valla', 'zelfa', 'iosif', 'veniamin', 'iuda']) expect(all.has(id), id).toBe(true);
    expect(c.layout).toBe('family');
  });
  it('вход запоминает прежний показ и лицо; возврат без входа — нечего возвращать', () => {
    expect(show.returnFromFamily()).toBe(false);
    show.setShow({ kind: 'key' });
    state.selected.value = 'david';
    expect(show.nearestFamily('david')).toBe(true);
    expect(show.show.peek()).toEqual(show.nearestShow('david'));
    expect(show.familyBack.peek()?.show).toEqual({ kind: 'key' });
    expect(show.canReturn.peek()).toBe(true);
    // родня другого лица изнутри — возврат по-прежнему к «ключевым лицам»
    expect(show.nearestFamily('solomon')).toBe(true);
    expect(state.selected.peek()).toBe('solomon');
    expect(show.familyBack.peek()?.show).toEqual({ kind: 'key' });
    expect(show.returnFromFamily()).toBe(true);
    expect(show.show.peek()).toEqual({ kind: 'key' });
    expect(show.canReturn.peek()).toBe(false);
    expect(state.selected.peek()).toBe('solomon');
    show.setShow({ kind: 'all' });
    state.selected.value = null;
  });
  it('Escape: после пары и до снятия выбора — возврат из «Ближайшей родни»', () => {
    const none = { pick: false, panel: false, pins: false, group: false, second: false, selected: false, intro: false };
    expect(keys.escapeTarget({ ...none, family: true, selected: true })).toBe('family');
    expect(keys.escapeTarget({ ...none, family: true, second: true })).toBe('second');
    expect(keys.escapeTarget({ ...none, family: false, selected: true })).toBe('selected');
  });
});

describe('родня первого колена и указатели у края (решение 146)', () => {
  it('Давид: отец, жёны и дети — по одному разу, со словами ролей', () => {
    const k = frame.firstKin('david');
    const by = (role: string) => k.filter((x) => x.role === role);
    expect(by('parent').map((x) => [x.id, x.word])).toContainEqual(['iessey', 'отец']);
    expect(by('spouse').length).toBeGreaterThanOrEqual(7);
    expect(by('spouse').every((x) => x.word === 'жена')).toBe(true);
    expect(by('child').length).toBeGreaterThanOrEqual(19);
    expect(by('child').some((x) => x.id === 'solomon' && x.word === 'сын')).toBe(true);
    expect(new Set(k.map((x) => x.id)).size).toBe(k.length);
  });
  it('подпись указателя: одно лицо — имя и роль; группа — число со склонением', () => {
    const { kinPointerText } = frame;
    expect(kinPointerText('↑', 'parent', [{ id: 'iessey', role: 'parent', word: 'отец' }])).toBe('↑ Иессей, отец');
    const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, role: 'child' as const, word: 'сын' }));
    expect(kinPointerText('→', 'child', kids(22))).toBe('→ 22 ребёнка');
    expect(kinPointerText('→', 'child', kids(5))).toBe('→ 5 детей');
    expect(kinPointerText('→', 'child', kids(21))).toBe('→ 21 ребёнок');
    const wives = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, role: 'spouse' as const, word: 'жена' }));
    expect(kinPointerText('↓', 'spouse', wives(3))).toBe('↓ 3 жены');
    expect(kinPointerText('↓', 'spouse', wives(8))).toBe('↓ 8 жён');
    expect(kinPointerText('↑', 'parent', [{ id: 'a', role: 'parent', word: 'отец' }, { id: 'b', role: 'parent', word: 'мать' }])).toBe('↑ родители');
    // одна сторона — один указатель: роли через запятую, одно лицо в группе — словом роли
    expect(frame.kinSideText('↓', [...wives(6), ...kids(10)])).toBe('↓ 6 жён, 10 детей');
    expect(frame.kinSideText('↑', [{ id: 'w', role: 'spouse', word: 'жена' }, ...kids(9)])).toBe('↑ жена, 9 детей');
    expect(frame.kinSideText('↑', [{ id: 'iessey', role: 'parent', word: 'отец' }])).toBe('↑ Иессей, отец');
  });
  it('кадр с выбранным на виду и детьми за краем: указатели с числом ведут к родне, а не выбирают одного', () => {
    const s = makeSky();
    const id = 'david';
    s.cam.zoomAt(700, 380, 12);
    // Давид у правого края: его дети — за ним
    const x = s.nodeX(id)!;
    const row = s.rowOf(s.node(id)!.lane);
    s.cam.x0 = x - (s.cam.vp.r - 150) / s.cam.kx;
    s.cam.laneTop = row + 380 / s.cam.ky;
    s.draw({ ...baseState(s), selected: id });
    const kin = s.edgeHits.filter((e) => e.ids);
    expect(kin.length).toBeGreaterThan(0);
    for (const e of kin) {
      expect(e.label).toMatch(/^[↑↓←→] /);
      for (const k of e.ids!) expect(frame.firstKin(id).some((q) => q.id === k)).toBe(true);
    }
    // при выбранной связи указателей родни нет: концы связи называет marks.ts
    s.draw({ ...baseState(s), selected: id, link: { kind: 'union', union: 'u:david+virsaviya' } as never });
    expect(s.edgeHits.filter((e) => e.ids).length).toBe(0);
  });
});

describe('ссылка на лицо держит семью (решение 146)', () => {
  it('в кадре меньше 70 % родни — сдвиг без отдаления: родни в кадре больше, лицо остаётся на виду', () => {
    const s = makeSky();
    const id = 'david';
    s.cam.zoomAt(700, 380, 12);
    const x = s.nodeX(id)!;
    const row = s.rowOf(s.node(id)!.lane);
    s.cam.x0 = x - (s.cam.vp.r - 100) / s.cam.kx;
    s.cam.laneTop = row + 380 / s.cam.ky;
    const before = view.kinShare(id);
    expect(before.inside).toBeLessThan(0.7 * before.total);
    const d = view.familyShift(id)!;
    expect(d).not.toBeNull();
    const kx = s.cam.kx;
    s.cam.x0 -= d.dx / s.cam.kx;
    s.cam.laneTop += d.dy / s.cam.ky;
    expect(s.cam.kx).toBe(kx);
    expect(view.inView(id)).toBe(true);
    const after = view.kinShare(id);
    expect(after.inside).toBeGreaterThan(before.inside);
    expect(after.inside).toBeGreaterThanOrEqual(Math.ceil(0.7 * after.total) - 1);
    // и уже на месте — сдвига нет
    expect(view.familyShift(id)).toBeNull();
    expect(view.FAMILY_MS).toBeLessThanOrEqual(400);
  });
});

describe('выбранное под органом неба (решение 147)', () => {
  it('из-под органа — по вертикали, окно лет то же; из-под листа «Показ» (side) — кратчайшим путём вбок', () => {
    const g = globalThis as unknown as { requestAnimationFrame: unknown; cancelAnimationFrame: unknown };
    const was = { r: g.requestAnimationFrame, c: g.cancelAnimationFrame };
    g.requestAnimationFrame = () => 1;
    g.cancelAnimationFrame = () => {};
    try {
      const s = makeSky();
      s.cam.zoomAt(700, 380, 12);
      const id = 'david';
      const row = s.rowOf(s.node(id)!.lane);
      s.cam.x0 = s.nodeX(id)! - 344 / s.cam.kx;
      s.cam.laneTop = row + 402 / s.cam.ky;
      // лист слева: 26…446 по x, 142…685 по y — Давид под ним
      view.setReserve([{ x: 4, y: 98, w: 420, h: 543 }]);
      expect(view.inView(id)).toBe(false);
      const x0 = s.cam.x0;
      view.keepInView(id, 0);
      expect(s.cam.x0).toBeCloseTo(x0, 6);
      s.cam.x0 = x0;
      s.cam.laneTop = row + 402 / s.cam.ky;
      view.keepInView(id, 0, true);
      expect(view.inView(id)).toBe(true);
      expect(Math.abs(s.cam.sy(s.node(id)!.lane) - 402)).toBeLessThan(1);
    } finally {
      view.setReserve([]);
      g.requestAnimationFrame = was.r;
      g.cancelAnimationFrame = was.c;
    }
  });
});

/** Кадр неба без выделений — для draw в тестах. */
function baseState(_s?: SkyT) {
  return {
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null,
    layers: { lifelines: true, links: true, labels: true, ribbons: true, epochs: true, constellations: true, meridians: true, tensions: true, grid: true },
    onlyLines: false, meridian: null, tensionPersons: new Set<string>(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set<string>(),
    reserve: [], meridianLabel: null, kinSteps: null, depth: null,
  } as unknown as Parameters<SkyT['draw']>[0] & { link?: unknown };
}
