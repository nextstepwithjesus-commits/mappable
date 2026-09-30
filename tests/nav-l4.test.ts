/**
 * Камера, адрес и история (этап 7, круг 3, группа L4) без браузера: правило перелёта к лицу и уровень чтения (IX-68,
 * решение 44), прямой переход «назад»/«всё небо» (IX-74, IX-79), временное сжатие строк (IX-70), окно отметок (MAP-79),
 * «только линии» вокруг выбранного лица (IX-73, UX-68), строка «+N» у места щелчка (UX-51), стопка и история (UX-74,
 * решение 50), набор из ссылки (IX-69, UX-79, решение 45), строка «набор» на телефоне (MOB-73, решение 58).
 * Поведение в браузере — сценарии 350–369 (tools/accept/nav3.ts).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Camera, FLY_MAX_MS, FLY_MIN_MS, flightMs, type Frame } from '../src/render/camera.ts';
import { planSky, type PlanData, type SkyView } from '../src/render/rows.ts';

let sky: typeof import('../src/render/sky.ts');
let atlas: typeof import('../src/data/atlas.ts');
let view: typeof import('../src/ui/sky/view.ts');
let common: typeof import('../src/ui/common.tsx');
let state: typeof import('../src/state.ts');
let overlays: typeof import('../src/ui/sky/Overlays.tsx');
let work: typeof import('../src/ui/work.ts');
let stack: typeof import('../src/ui/stack.ts');
let address: typeof import('../src/ui/address.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  atlas = await import('../src/data/atlas.ts');
  view = await import('../src/ui/sky/view.ts');
  common = await import('../src/ui/common.tsx');
  state = await import('../src/state.ts');
  overlays = await import('../src/ui/sky/Overlays.tsx');
  work = await import('../src/ui/work.ts');
  stack = await import('../src/ui/stack.ts');
  address = await import('../src/ui/address.ts');
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
const at = (s: SkyT, id: string) => ({ x: s.cam.sx(s.nodeX(id)!), y: s.cam.sy(s.node(id)!.lane) });

/** Кадры анимации камеры по заказу: requestAnimationFrame копит, step(dt) отдаёт кадр через dt мс. */
function frames() {
  const q: FrameRequestCallback[] = [];
  const g = globalThis as unknown as { requestAnimationFrame: unknown; cancelAnimationFrame: unknown };
  const was = { r: g.requestAnimationFrame, c: g.cancelAnimationFrame };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => q.push(cb);
  g.cancelAnimationFrame = () => {};
  const t0 = performance.now();
  let t = t0;
  return {
    step(dt = 16) {
      t += dt;
      const cbs = q.splice(0);
      for (const cb of cbs) cb(t);
      return cbs.length > 0;
    },
    restore() {
      g.requestAnimationFrame = was.r;
      g.cancelAnimationFrame = was.c;
    },
  };
}

const frame: Frame = { x0: 0, x1: 10_000, lane0: -100, lane1: 100 };
function cam() {
  const c = new Camera();
  c.w = 1440;
  c.h = 800;
  c.laneSpan = 200;
  c.setViewport({ l: 18, t: 44, r: 1440, b: 784 }, frame, frame);
  c.set(c.fitView(frame));
  return c;
}

describe('перелёт к лицу и уровень чтения (решение 44; IX-68)', () => {
  it('звезды нет на экране — летим всегда; с неба — только это; ссылка и поиск — ещё и мельче уровня чтения', () => {
    expect(common.needsFlight(false, 'sky', false)).toBe(true);
    expect(common.needsFlight(false, 'link', false)).toBe(true);
    expect(common.needsFlight(true, 'sky', true)).toBe(false);
    expect(common.needsFlight(true, 'link', true)).toBe(true);
    expect(common.needsFlight(true, 'link', false)).toBe(false);
  });
  it('обзор мельче уровня чтения у Давида, Руфи и Авраама; вид «лицо и поколения вокруг» — нет', () => {
    const s = makeSky();
    for (const id of ['david', 'ruf', 'avraam', 'noy', 'pavel']) {
      s.fitAll();
      expect(view.belowReading(id), `${id} на обзоре`).toBe(true);
      const v = view.viewForPerson(id)!;
      s.cam.set(s.cam.constrain(v));
      expect(view.belowReading(id), `${id} у лица`).toBe(false);
      // уровень чтения — половина масштаба этого вида: окно шире вдвое — ещё читается, вчетверо — уже нет
      s.cam.set({ ...s.cam.state(), kx: v.kx * 0.6 });
      expect(view.belowReading(id)).toBe(false);
      s.cam.set({ ...s.cam.state(), kx: v.kx * 0.4 });
      expect(view.belowReading(id)).toBe(true);
    }
  });
  it('перелёт — 400–1 200 мс; с обзора к лицу — у верхнего края, в пределах 800–1 200 мс', () => {
    expect(FLY_MIN_MS).toBe(400);
    expect(FLY_MAX_MS).toBe(1200);
    expect(flightMs(0.1)).toBe(400);
    expect(flightMs(5)).toBe(1200);
    // обзор (≈ 4 800 лет) → Давид (≈ 180 лет): путь S ≈ ln(26,4) / √2 ≈ 2,3
    const S = Math.log(4800 / 180) / Math.SQRT2;
    expect(flightMs(S)).toBeGreaterThanOrEqual(800);
    expect(flightMs(S)).toBeLessThanOrEqual(1200);
  });
});

describe('прямой переход без «отдалить — приблизить» (IX-74, IX-79)', () => {
  it('«Всё небо» из окна лица: масштаб только уменьшается, неподвижная точка стоит на месте, конец — точно вид «всё небо»', () => {
    const c = cam();
    const fit = c.state();
    c.set({ x0: 6000, kx: 0.9, laneTop: 20 });
    const from = c.state();
    const f = frames();
    try {
      c.zoomTo(fit, 500, () => {});
      expect(c.flying).toBe(true);
      const sFix = (fit.x0 - from.x0) / (1 / from.kx - 1 / fit.kx);
      const wFix = from.x0 + sFix / from.kx;
      let prev = c.kx;
      let n = 0;
      while (f.step(16)) {
        n++;
        expect(c.kx).toBeLessThanOrEqual(prev * (1 + 1e-9));
        expect(c.kx).toBeGreaterThanOrEqual(fit.kx * (1 - 1e-9));
        // точка sFix экрана показывает одну и ту же мировую x всё время перехода
        expect(Math.abs(c.wx(sFix) - wFix) * c.kx).toBeLessThan(0.5);
        prev = c.kx;
      }
      expect(n).toBeGreaterThanOrEqual(30);
      expect(n).toBeLessThanOrEqual(33);
      expect(c.near(fit)).toBe(true);
    } finally {
      f.restore();
    }
  });
  it('равный масштаб — просто сдвиг; при ослабленном движении — сразу', () => {
    const c = cam();
    c.set({ x0: 1000, kx: 0.5, laneTop: 10 });
    c.zoomTo({ x0: 3000, kx: 0.5, laneTop: 12 }, 280, () => {}, true);
    expect(c.moving).toBe(false);
    expect(c.state()).toEqual({ x0: 3000, kx: 0.5, laneTop: 12 });
  });
  it('«назад» и «вперёд» — 280 мс, «всё небо» — 500 мс, возврат окна после «только линии» — 400 мс', () => {
    expect(view.HISTORY_MS).toBeGreaterThanOrEqual(250);
    expect(view.HISTORY_MS).toBeLessThanOrEqual(300);
    expect(view.HOME_MS).toBeGreaterThanOrEqual(400);
    expect(view.HOME_MS).toBeLessThanOrEqual(600);
    expect(view.LINES_BACK_MS).toBe(400);
  });
});

describe('вписывание группы сжимает строки временно (IX-70)', () => {
  it('перелёт с пропорцией группы: своя пропорция ждёт в userLanes, в память и адрес идёт она (ownLanes)', () => {
    const c = cam();
    c.set({ x0: 3000, kx: 0.3, laneTop: 20 });
    c.setLanes(1.5);
    c.flyTo(c.state(), () => {}, true, 0.5);
    expect(c.lanes).toBe(0.5);
    expect(c.userLanes).toBe(1.5);
    expect(c.ownLanes).toBe(1.5);
    // вторая группа — пропорция не выше своей, временная остаётся временной
    c.flyTo(c.state(), () => {}, true, 0.8);
    expect(c.userLanes).toBe(1.5);
    // возврат: строки снова своей высоты, полоса под sy — на месте
    const sy = 400;
    const lane = c.wLane(sy);
    expect(c.restoreLanes(sy, 250, () => {}, true)).toBe(true);
    expect(c.lanes).toBe(1.5);
    expect(c.userLanes).toBeNull();
    expect(Math.abs(c.wLane(sy) - lane) * c.ky).toBeLessThan(0.5);
    expect(c.restoreLanes(sy, 250, () => {}, true)).toBe(false);
  });
  it('«высота строк», Alt + колесо, протяжка по буквам, «по умолчанию» и адрес делают пропорцию своей; растяжение времени — нет', () => {
    const c = cam();
    c.set({ ...c.state(), kx: 0.2 });
    const tmp = () => c.flyTo(c.state(), () => {}, true, 0.5);
    tmp();
    c.stretchStep('lanes', 500, 400, 1.5, 250, () => {}, true);
    expect(c.userLanes).toBeNull();
    tmp();
    c.stretchAt('lanes', 500, 400, 0.8);
    expect(c.userLanes).toBeNull();
    c.setLanes(1);
    tmp();
    c.stretchStep('time', 500, 400, 1.5, 250, () => {}, true);
    expect(c.userLanes).toBe(1);
    c.setLanes(2);
    expect(c.userLanes).toBeNull();
    tmp();
    c.resetLanes(500, 400, 250, () => {}, true);
    expect(c.userLanes).toBeNull();
    expect(c.lanes).toBeCloseTo(1, 6);
  });
  it('группа, которая помещается при своей пропорции, строк не сжимает и временную пропорцию снимает', () => {
    const s = makeSky();
    s.cam.setLanes(1);
    s.cam.flyTo(s.cam.state(), () => {}, true, 0.4);
    expect(s.cam.userLanes).toBe(1);
    const g = view.viewForIds(['david', 'iessey'])!;
    expect(g.lanes).toBe(1);
    s.cam.flyTo(s.cam.constrain(g, g.lanes), () => {}, true, g.lanes);
    expect(s.cam.userLanes).toBeNull();
    expect(s.cam.lanes).toBe(1);
  });
});

describe('окно отметок (MAP-79)', () => {
  it('«Захария» — все на небе: правый край не дальше 100 г. по Р. Х., поля по 5 %', () => {
    const s = makeSky();
    const ids = [...atlas.byId.values()].filter((p) => p.name === 'Захария').map((p) => p.id).filter((id) => s.node(id));
    expect(ids.length).toBeGreaterThan(10);
    const g = view.viewForIds(ids)!;
    s.cam.flyTo(s.cam.constrain(g, g.lanes), () => {}, true, g.lanes);
    const vp = s.cam.vp;
    const right = s.tOf(s.cam.wx(vp.r));
    expect(right).toBeLessThanOrEqual(view.GROUP_RIGHT + 1);
    const W = vp.r - vp.l;
    const xs = ids.map((id) => at(s, id).x);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(vp.l);
      expect(x).toBeLessThanOrEqual(vp.r);
    }
    // слева — поле около 5 % ширины группы, а не четверть неба
    const left = Math.min(...xs) - vp.l;
    const span = Math.max(...xs) - Math.min(...xs);
    expect(left).toBeGreaterThan(span * 0.03);
    expect(left).toBeLessThan(span * 0.07 + 1);
    expect(left / W).toBeLessThan(0.08);
    s.cam.setLanes(1);
  });
});

describe('«только линии Мессии» вокруг выбранного лица (решение 49; IX-73, UX-68)', () => {
  it('лицо линии держит окно у себя; мать у бусины сына — у сына', () => {
    expect(view.lineAnchor('david')).toBe('david');
    expect(view.lineAnchor('ruf')).toBe('ovid');
    // Вирсавия — мать и Соломона (Мф 1:6), и Нафана (Лк 3:31; 1 Пар 3:5)
    expect(['solomon', 'nafan-syn-davida']).toContain(view.lineAnchor('virsaviya'));
    expect(view.lineAnchor('moisey')).toBe('moisey');
  });
  it('±10 поколений вокруг Руфи: окно у Овида, не весь коридор; Давид и Овид в кадре', () => {
    const s = makeSky();
    const to = view.fitLines(false, 'ruf')!;
    expect(to).not.toBeNull();
    const all = view.linesKx()!;
    expect(s.cam.kx).toBeGreaterThan(all * 2);
    for (const id of ['ovid', 'vooz', 'david']) {
      const q = at(s, id);
      expect(q.x, id).toBeGreaterThan(s.cam.vp.l);
      expect(q.x, id).toBeLessThan(s.cam.vp.r);
      expect(q.y, id).toBeGreaterThan(s.cam.vp.t);
      expect(q.y, id).toBeLessThan(s.cam.vp.b);
    }
    // без выбранного лица — весь коридор, как «Всё небо» в этом режиме
    view.fitLines(false);
    expect(s.cam.kx).toBeCloseTo(Math.max(all, s.cam.kxLo()), 6);
    s.cam.focusLanes = 0;
    s.cam.zoomFloor = null;
    s.cam.setLanes(1);
  });
  it('строки коридора — по высоте (MAP-70): ×2–3, временно; своя пропорция — в памяти и адресе', () => {
    const s = makeSky();
    s.cam.setLanes(1);
    view.fitLines(false);
    const f = view.linesFrame()!;
    expect(s.cam.lanes).toBeGreaterThan(1.5);
    expect(s.cam.lanes).toBeLessThanOrEqual(view.LINES_LANES_MAX);
    expect(s.cam.userLanes).toBe(1);
    expect(s.cam.ownLanes).toBe(1);
    // полосы коридора — около 60 % высоты видимой части (упор ×3 — меньше)
    const h = (f.lane1 - f.lane0 + 1) * s.cam.ky;
    expect(h / (s.cam.vp.b - s.cam.vp.t)).toBeGreaterThan(0.45);
    expect(h / (s.cam.vp.b - s.cam.vp.t)).toBeLessThanOrEqual(0.61);
    // выключение режима кончает временную пропорцию
    expect(s.cam.endTemp()).toBe(1);
    expect(s.cam.userLanes).toBeNull();
    s.cam.focusLanes = 0;
    s.cam.zoomFloor = null;
    s.cam.setLanes(1);
  });
});

describe('свёрнутое созвездие — строка «+N» у места щелчка (UX-51)', () => {
  it('подпись встаёт на полосу щелчка, если она опустела; без щелчка — в самый длинный опустевший отрезок', () => {
    const m = atlas.models[0];
    const data: PlanData = {
      graph: atlas.graph, nodes: m.nodes, laneMin: m.laneMin, laneMax: m.laneMax, t0: (i) => m.nodes[i].t0, groupOf: (id) => atlas.byId.get(id)?.group,
      parentGroup: (g) => atlas.groupById.get(g)?.parent, cluster: (b) => !!m.blocks[b]?.cluster,
    };
    const v = (o: Partial<SkyView> = {}): SkyView => ({ mode: 'all', set: new Set(), foldDesc: [], foldGroups: ['judah'], ...o });
    const free = planSky(data, v());
    const mark = (p: ReturnType<typeof planSky>) => p.marks.find((k) => k.kind === 'group' && k.id === 'judah')!;
    // опустевшие полосы: все узлы полосы скрыты свёрткой
    const byLane = new Map<number, boolean>();
    m.nodes.forEach((n, i) => byLane.set(n.lane, (byLane.get(n.lane) ?? true) && !!free.hidden?.[i]));
    const empty = [...byLane].filter(([, all]) => all).map(([l]) => l).sort((a, b) => a - b);
    expect(empty.length).toBeGreaterThanOrEqual(3);
    for (const pref of [empty[0], empty[Math.floor(empty.length / 2)], empty[empty.length - 1]]) {
      const p = planSky(data, v({ foldAt: new Map([['judah', pref]]) }));
      expect(mark(p).lane, `щелчок у полосы ${pref}`).toBe(pref);
      expect(mark(p).count).toBe(mark(free).count);
      // строка-подпись — одна строка вокруг полосы щелчка
      expect(p.rows.row(pref + 0.5) - p.rows.row(pref - 0.5)).toBeGreaterThan(0);
    }
  });
});

// этап 12, решение 91: стопки нет — «назад» переключает только текущую карточку, закреплённые вкладки не меняются;
// тот же смысл, что у проверки стопки (решение 50): история не открывает «ещё одну карточку» и не теряет открытые
describe('«назад» и вкладки закреплённых карточек (решение 50, 91; UX-74)', () => {
  afterEach(() => {
    state.selected.value = null;
    stack.cardTabs.value = [];
  });
  it('selectFromHistory: выбор — лицо записи, вкладки прежние; null — карточка закрыта, вкладки остаются', () => {
    stack.cardTabs.value = stack.withTab(stack.withTab([], 'moisey'), 'ruf');
    const before = JSON.stringify(stack.cardTabs.value);
    state.selected.value = 'moisey';
    stack.cardFolded.value = true;
    stack.selectFromHistory('david');
    expect(state.selected.value).toBe('david');
    expect(stack.cardFolded.value).toBe(false);
    expect(JSON.stringify(stack.cardTabs.value)).toBe(before);
    stack.selectFromHistory('ruf');
    expect(state.selected.value).toBe('ruf');
    expect(JSON.stringify(stack.cardTabs.value)).toBe(before);
    stack.selectFromHistory(null);
    expect(state.selected.value).toBeNull();
    expect(JSON.stringify(stack.cardTabs.value)).toBe(before);
  });
  it('закрыть текущую («×», Escape): выбор снят, вкладки остаются', () => {
    stack.cardTabs.value = stack.withTab([], 'david');
    state.selected.value = 'david';
    stack.closeCurrent();
    expect(state.selected.value).toBeNull();
    expect(stack.cardTabs.value.map((t) => t.id)).toEqual(['david']);
  });
});

describe('набор из ссылки — временный просмотр (решение 45; IX-69, UX-79)', () => {
  const entry = (id: string) => [id, { via: 'self' as const, of: id }] as const;
  afterEach(() => {
    work.linkSet.value = null;
    work.workNotice.value = null;
    work.workSet.value = new Map();
    work.skyMode.value = 'all';
  });
  it('чужой набор не заменяет свой: свой и память не меняются, небо показывает набор ссылки', () => {
    work.workSet.value = new Map([entry('avraam'), entry('sarra')]);
    address.applyWork({ work: true, set: ['iessey', 'david'] }, false);
    expect(work.skyMode.value).toBe('work');
    expect([...work.workSet.value.keys()]).toEqual(['avraam', 'sarra']);
    expect([...work.shownIds.value]).toEqual(['iessey', 'david']);
    expect(overlays.skyBarKind()).toBe('link');
    // добавить в мой набор — свои лица остаются, просмотр кончился
    expect(work.adoptLinkSet()).toBe(2);
    expect([...work.workSet.value.keys()]).toEqual(['avraam', 'sarra', 'iessey', 'david']);
    expect(work.linkSet.value).toBeNull();
    expect(overlays.skyBarKind()).toBe('work');
  });
  it('«вернуться к моему» — свой набор; свой пуст — все лица; тот же набор — строки нет', () => {
    work.workSet.value = new Map([entry('avraam')]);
    address.applyWork({ work: true, set: ['iessey', 'david'] }, false);
    work.leaveLinkSet();
    expect(work.linkSet.value).toBeNull();
    expect(work.skyMode.value).toBe('work');
    expect([...work.shownIds.value]).toEqual(['avraam']);
    work.workSet.value = new Map();
    address.applyWork({ work: true, set: ['iessey', 'david'] }, false);
    expect(work.skyMode.value).toBe('work');
    expect(overlays.skyBarKind()).toBe('link');
    work.leaveLinkSet();
    expect(work.skyMode.value).toBe('all');
    work.workSet.value = new Map([entry('david'), entry('iessey')]);
    address.applyWork({ work: true, set: ['iessey', 'david'] }, false);
    expect(work.linkSet.value).toBeNull();
    expect(overlays.skyBarKind()).toBe('work');
  });
  it('своя запись истории: её «n» — прежний свой набор, чужим не показывается', () => {
    work.workSet.value = new Map([entry('avraam')]);
    address.applyWork({ work: true, set: ['avraam', 'sarra'] }, true);
    expect(work.linkSet.value).toBeNull();
    expect([...work.shownIds.value]).toEqual(['avraam']);
    expect(address.markOf({ toledot: 1, link: true })).toEqual({ toledot: 1, link: true });
    expect(address.markOf(null)).toBeNull();
    expect(address.markOf({ other: 1 })).toBeNull();
  });
  it('«k1» без списка при пустом своём наборе — все лица и строка-пояснение (UX-79)', () => {
    address.applyWork({ work: true }, false);
    expect(work.skyMode.value).toBe('all');
    expect(work.workNotice.value).toBe(work.EMPTY_LINK_NOTICE);
    expect(overlays.skyBarKind()).toBe('notice');
    // одно тире в строке — перед командой «скрыть»
    expect(work.EMPTY_LINK_NOTICE).toBe('Ссылка открыта в режиме «набор», но ваш набор пуст: показаны все лица');
    // свой набор есть — «k1» без списка показывает его
    work.workNotice.value = null;
    work.workSet.value = new Map([entry('david')]);
    address.applyWork({ work: true }, false);
    expect(work.skyMode.value).toBe('work');
    expect(work.workNotice.value).toBeNull();
  });
  it('строка: «Набор по ссылке: 2 лица — добавить в мой набор | вернуться к моему (3)», число со склонением', () => {
    expect(overlays.linkBarText(1)).toBe('Набор по ссылке: 1 лицо');
    expect(overlays.linkBarText(2)).toBe('Набор по ссылке: 2 лица');
    expect(overlays.linkBarText(12)).toBe('Набор по ссылке: 12 лиц');
    expect(overlays.linkBarText(11)).toBe('Набор по ссылке: 11 лиц');
    expect(overlays.mineLabel(3)).toBe('вернуться к моему (3)');
  });
});

describe('строка показа на телефоне — коротко, в одну строку (решение 58; MOB-73; этап 11, Q4)', () => {
  // строка «набор» (прежде workLineText, Overlays.tsx) стала строкой показа (src/ui/show.ts, ShowBar.tsx): на узком небе
  // она — одной строкой «набор — 38 лиц — изменить», подробности — в листе «Показ»
  const content = (n: number) =>
    ({ ids: new Set(Array.from({ length: n }, (_, i) => `x${i}`)), guests: new Set(), stubs: [], layout: 'family', founders: new Set(), plus: new Map() }) as unknown as import('../src/ui/show.ts').ShowContent;
  it('набор: полная строка «На небе: набор — 38 лиц», коротко «набор — 38 лиц» с одной командой «изменить»', async () => {
    const show = await import('../src/ui/show.ts');
    const sm = show.summaryOf({ kind: 'set' }, content(38));
    expect(sm.label).toBe('На небе: набор — 38 лиц');
    expect(sm.short.map((q) => q.text).join('')).toBe('набор — 38 лиц');
    expect(show.summaryOf({ kind: 'set' }, content(22)).short.map((q) => q.text).join('')).toBe('набор — 22 лица');
    expect(show.summaryOf({ kind: 'set' }, content(1)).short.map((q) => q.text).join('')).toBe('набор — 1 лицо');
    expect(sm.shortCmds.map((q) => q.text)).toEqual(['изменить']);
    expect(sm.shortCmds[0].cmd).toEqual({ kind: 'sheet' });
    // в строке нет оговорки о ссылке и «только рабочий набор»: оговорка — в подсказке строки (setLinkNote)
    expect(sm.label).not.toMatch(/ссылк|рабочий/);
    expect(show.setLinkNote(38)).toMatch(/только если в нём не больше 12 лиц/);
    expect(show.setLinkNote(12)).toMatch(/передаёт и сам набор/);
  });
  it('созвездие и род лица: коротко — «Дом Нахора» — N лиц», «потомки Иуды — N лиц»; «изменить» открывает лист на роде лица', async () => {
    const show = await import('../src/ui/show.ts');
    const g = show.summaryOf({ kind: 'groups', groups: ['nahorites'], links: 'stubs' });
    expect(g.short.map((q) => q.text).join('')).toMatch(/^«Дом Нахора» — \d+ лиц$/);
    // без подробностей: основателя и связей наружу нет, команды — те же
    expect(g.mid.map((q) => q.text).join('')).toMatch(/^На небе: созвездие «Дом Нахора» — \d+ лиц$/);
    expect(g.label).toMatch(/основатель Нахор/);
    const l = show.summaryOf({ kind: 'lineage', id: 'iuda', dir: 'down', gen: null, by: 'father' });
    expect(l.short.map((q) => q.text).join('')).toMatch(/^потомки Иуды — \d+ лиц[а]?$/);
    expect(l.shortCmds[0].cmd).toEqual({ kind: 'sheet', lineage: 'iuda' });
    // без уточнения имени: «потомки ▾ Иуды — все поколения ▾; по отцам ▾»
    expect(l.mid.map((q) => q.text).join('')).toMatch(/^На небе: потомки Иуды — все поколения; по отцам — \d+/);
  });
});
