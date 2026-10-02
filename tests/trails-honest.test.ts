/**
 * Следы и семьи на небе (A14, E4; ТЗ § 3.1; MAP-12, 13, 14, 15, 16, 20, 22; UX-34).
 *  — след честен: оценочное рождение — начало проявляется от звезды, последнее упоминание — сплошной след и тающий
 *    хвост 10 px, ничего не известно — только тающий хвост 10 px, условной длины жизни нет; народ, род, младенец — без
 *    следа (этап 12, решение 90: неуверенность — растушёвкой, точек на следе нет);
 *  — знаки: рассеянное скопление у народа, † у умершего младенцем;
 *  — семья: скоба пары «отец — мать», пометы «от Лии», подписи призраков «Рахиль, жена Иакова»;
 *  — выделение рода: предки сплошные, потомки штрихом, братья и сёстры своей степенью, дальше третьего поколения — 70 %.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Call = [string, ...unknown[]];
/** Холст, который записывает вызовы; ширина текста — 7 px на знак. */
function recording() {
  const calls: Call[] = [];
  const texts: { t: string; x: number; y: number; font: string }[] = [];
  let font = '';
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText')
        return (t: string, x: number, y: number) => {
          texts.push({ t, x, y, font });
          calls.push(['fillText', t, x, y]);
        };
      return (...a: unknown[]) => {
        calls.push([String(k), ...a]);
        return { addColorStop: () => {} };
      };
    },
    set: (_o, k, v) => {
      if (k === 'font') font = v as string;
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}
const strokes = (calls: Call[]) => calls.filter((c) => ['setLineDash', 'moveTo', 'lineTo', 'stroke'].includes(c[0]));

let sky: typeof import('../src/render/sky.ts');
let trails: typeof import('../src/render/trails.ts');
let marks: typeof import('../src/render/marks.ts');
let glyphs: typeof import('../src/render/glyphs.ts');
let atlas: typeof import('../src/data/atlas.ts');

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  sky = await import('../src/render/sky.ts');
  trails = await import('../src/render/trails.ts');
  marks = await import('../src/render/marks.ts');
  glyphs = await import('../src/render/glyphs.ts');
  atlas = await import('../src/data/atlas.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
type SkyT = InstanceType<typeof import('../src/render/sky.ts').Sky>;
function makeSky(w = 1440, h = 776) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(w, h, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  return { s, rec };
}
function draw(s: SkyT, state: Record<string, unknown> = {}) {
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    ...state,
  } as Parameters<SkyT['draw']>[0]);
}
/** Лицо id — в середине окна, масштаб ×k от «всего неба». */
const at = (s: SkyT, id: string, k: number) => {
  s.cam.zoomAt(720, 400, k);
  s.cam.x0 = s.nodeX(id)! - 600 / s.cam.kx;
  s.cam.laneTop = s.node(id)!.lane + 380 / s.cam.ky;
};

describe('след жизни (A14): у точного и оценочного — разное начертание', () => {
  const base = { x0: 10, y: 50.5, color: '#fff', width: 1.2 };
  /** Растушёвки: градиенты вдоль следа «x0→x1» (createLinearGradient) по порядку. */
  const fades = (calls: Call[]) => calls.filter((c) => c[0] === 'createLinearGradient').map((c) => [c[1], c[3]]);
  it('оценочное рождение — начало проявляется от звезды до конца интервала рождения, дальше сплошной; точек нет', () => {
    const r = recording();
    trails.drawLifeTrail(r.ctx, { ...base, x1: 200, cls: 'estimated', known: true, solidTo: 200, sureFrom: 60 });
    expect(strokes(r.calls)).toEqual([['moveTo', 10, 50.5], ['lineTo', 60, 50.5], ['stroke'], ['moveTo', 60, 50.5], ['lineTo', 200, 50.5], ['stroke']]);
    expect(fades(r.calls)).toEqual([[10, 60]]);
    expect(trails.TRAIL_FADE.start).toBeGreaterThan(0.1);
    expect(trails.TRAIL_FADE.start).toBeLessThan(0.5);
  });
  it('последнее упоминание — сплошной до него и тающий хвост 10 px; ничего не известно — только тающий хвост 10 px', () => {
    let r = recording();
    trails.drawLifeTrail(r.ctx, { ...base, x1: 90 + trails.TAIL_PX, cls: 'calculated', known: false, solidTo: 90 });
    expect(strokes(r.calls)).toEqual([['moveTo', 10, 50.5], ['lineTo', 90, 50.5], ['stroke'], ['moveTo', 90, 50.5], ['lineTo', 100, 50.5], ['stroke']]);
    expect(fades(r.calls)).toEqual([[90, 100]]);
    r = recording();
    trails.drawLifeTrail(r.ctx, { ...base, x1: 10 + trails.TAIL_PX, cls: 'estimated', known: false, solidTo: 10, sureFrom: 80 });
    expect(strokes(r.calls)).toEqual([['moveTo', 10, 50.5], ['lineTo', 20, 50.5], ['stroke']]);
    expect(fades(r.calls)).toEqual([[10, 20]]);
    // ни в одном следе нет штриха и точек
    expect(r.calls.some((c) => c[0] === 'setLineDash' && (c[1] as number[]).length)).toBe(false);
  });
  it('на небе условной длины жизни нет: без смерти и упоминаний след — ровно 10 px растушёвки', () => {
    const { s } = makeSky();
    at(s, 'david', 40);
    const t = { x0: 0, x1: 0, y: 0, cls: 'exact' as const, known: true, solidTo: 0, color: '', width: 1 };
    let bare = 0;
    for (let i = 0; i < s.nodes.length; i++) {
      const n = s.nodes[i];
      const c = atlas.models[0].chrono.get(n.person);
      if (!c || n.ghost || n.trail !== 'life' || c.d !== null || c.last !== null) continue;
      const tr = trails.trailOf(s, i, t);
      expect(tr, n.person).toBeTruthy();
      expect(tr!.solidTo).toBeCloseTo(tr!.x0, 6);
      expect(tr!.x1 - tr!.x0).toBeCloseTo(trails.TAIL_PX, 6);
      bare++;
    }
    expect(bare).toBeGreaterThan(100);
  });
  it('народ из таблицы народов, умерший младенцем и призрак — без следа', () => {
    const { s } = makeSky();
    const t = { x0: 0, x1: 0, y: 0, cls: 'exact' as const, known: true, solidTo: 0, color: '', width: 1 };
    for (const id of ['ludim', 'mladenets-syn-virsavii', 'ghost:rakhil']) {
      const i = s.indexOf(id);
      expect(i, id).toBeDefined();
      expect(trails.trailOf(s, i!, t), id).toBe(null);
    }
    // у Давида смерть известна: сплошной след до неё
    const d = trails.trailOf(s, s.indexOf('david')!, t)!;
    expect(d.known).toBe(true);
    expect(d.solidTo).toBeGreaterThan(d.x0);
  });
});

describe('знаки (A14): народ — рассеянное скопление, младенец — †', () => {
  it('народ: пять точек на окружности 9 px, а не пунктирный кружок', () => {
    const r = recording();
    glyphs.drawGlyph(r.ctx, 50, 50, { sex: 'm', kind: 'people', magnitude: 4, color: '#fff', halo: '#000' });
    const arcs = r.calls.filter((c) => c[0] === 'arc');
    // подложка и пять точек
    expect(arcs.length).toBe(1 + glyphs.SCATTER.dots);
    for (const a of arcs.slice(1)) expect(Math.hypot((a[1] as number) - 50, (a[2] as number) - 50)).toBeCloseTo(glyphs.SCATTER.ring, 5);
    expect(r.calls.some((c) => c[0] === 'setLineDash')).toBe(false);
  });
  it('умерший младенцем: знак † слева от звезды; знак лица по данным — у сына Давида и Вирсавии', () => {
    const q = atlas.byId.get('mladenets-syn-virsavii')!;
    const c = atlas.models[0].chrono.get(q.id)!;
    expect(c.infant).toBe(true);
    const o = glyphs.personGlyph(q, false, c.cls, { scale: 1, color: '#fff', halo: '#000' }, c.infant);
    expect(o.infant).toBe(true);
    const r = recording();
    glyphs.drawGlyph(r.ctx, 100, 100, o);
    const g = glyphs.daggerAt(100, 100, glyphs.starRadius(q.magnitude));
    expect(g.x).toBeLessThan(100 - glyphs.starRadius(q.magnitude));
    expect(r.calls).toContainEqual(['moveTo', g.x, g.top]);
    expect(r.calls).toContainEqual(['lineTo', g.x, g.bottom]);
  });
});

describe('семьи (E4)', () => {
  it('скоба пары: один ствол от следа родителя до дальнего ребёнка и засечки к остальным', () => {
    const r = recording();
    trails.drawBracket(r.ctx, { x: 20.5, y0: 10, kids: [{ x: 20.5, y: 60 }, { x: 28, y: 40 }, { x: 34, y: 80 }], color: '#aaa' });
    expect(strokes(r.calls)).toEqual([
      ['moveTo', 20.5, 10], ['lineTo', 20.5, 80],
      ['moveTo', 20.5, 40], ['lineTo', 28, 40],
      ['moveTo', 20.5, 80], ['lineTo', 34, 80],
      ['stroke'],
    ]);
  });
  it('брак: к ближней жене — знак «‖» во всю высоту; к дальней — знак 8 px и тонкая выноска', () => {
    let r = recording();
    trails.drawMarriage(r.ctx, { x: 50, yH: 100, yW: 114, color: '#fff', near: 40 });
    expect(strokes(r.calls)).toEqual([['moveTo', 48.5, 100], ['lineTo', 48.5, 114], ['moveTo', 51.5, 100], ['lineTo', 51.5, 114], ['stroke']]);
    r = recording();
    trails.drawMarriage(r.ctx, { x: 50, yH: 100, yW: 300, color: '#fff', near: 40 });
    const st = strokes(r.calls);
    expect(st.slice(0, 5)).toEqual([['moveTo', 48.5, 100], ['lineTo', 48.5, 108], ['moveTo', 51.5, 100], ['lineTo', 51.5, 108], ['stroke']]);
    expect(st).toContainEqual(['lineTo', 50, 300]);
  });
  it('пометы по-русски: «от Лии», «от Рахили», «от дочери Шуи»; «Рахиль, жена Иакова»', () => {
    expect(trails.motherNote('liya')).toBe('от Лии');
    expect(trails.motherNote('rakhil')).toBe('от Рахили');
    expect(trails.motherNote('valla')).toBe('от Валлы');
    expect(trails.ghostNote('rakhil', 'iakov')).toBe('Рахиль, жена Иакова');
    expect(trails.ghostNote('asenefa', 'iosif')).toBe('Асенефа, жена Иосифа');
  });
  it('у Иакова дети четырёх матерей: гребёнки одним сплошным начертанием, пометы «от Лии», «от Рахили»… у корня гребёнки (MAP-74)', () => {
    const { s, rec } = makeSky();
    at(s, 'iakov', 60);
    expect(s.cam.ky).toBeGreaterThanOrEqual(14);
    const vis: number[] = [];
    for (let i = 0; i < s.nodes.length; i++) if (s.nodes[i].parentLane !== null) vis.push(i);
    const p = { s: { layers: LAYERS, highlight: null, intro: 1, tensionPersons: new Set() }, vis, emph: () => 1, zoomScale: 1 } as unknown as Parameters<typeof trails.drawDescents>[1];
    rec.calls.length = 0;
    const notes = trails.drawDescents(s, p);
    const texts = notes.flatMap((n) => ('text' in n ? [n.text] : []));
    for (const t of ['от Лии', 'от Рахили', 'от Валлы', 'от Зелфы']) expect(texts).toContain(t);
    // матери не различаются штрихом: штрих на небе значит «потомок выбранного» и «по толкованию»; пунктир [2, 2] —
    // только отвод к призраку жены
    const dashes = new Set(rec.calls.filter((c) => c[0] === 'setLineDash').map((c) => JSON.stringify(c[1])));
    for (const d of dashes) expect(['[]', '[2,2]']).toContain(d);
    // помета матери — у корня гребёнки: на строке её ребёнка, а не у следа Иакова
    const yJacob = s.cam.sy(s.node('iakov')!.lane);
    const moms = notes.filter((n): n is import('../src/render/trails.ts').FamilyText => 'text' in n && /^от /.test(n.text));
    for (const n of moms) {
      expect(n.at).toBe('root');
      expect(Math.abs(n.y - yJacob)).toBeGreaterThan(1);
    }
  });
});

describe('выделение рода (E4; MAP-20, UX-34)', () => {
  it('у Моисея Аарон и Мариам — братья и сёстры, своей степенью', () => {
    const h = marks.familyHighlight('moisey');
    expect(h.hl.get('aaron')).toBe('sib');
    expect(h.hl.get('mariam')).toBe('sib');
    expect(h.hl.get('amram')).toBe('anc');
    const e = marks.emphasis(h.hl, h.depth);
    expect(e('aaron')).toBe(marks.SIB);
    expect(e('amram')).toBe(1);
    expect(e('nikto-ne-vydelen')).toBe(sky.DIM);
    expect(marks.SIB).toBeGreaterThan(sky.DIM);
    expect(marks.SIB).toBeLessThan(1);
  });
  it('у Давида: дети — первое поколение; предки дальше третьего поколения — 70 %', () => {
    const h = marks.familyHighlight('david');
    expect(h.hl.get('solomon')).toBe('desc');
    expect(h.depth!.get('solomon')).toBe(1);
    expect(h.depth!.get('iessey')).toBe(1);
    const e = marks.emphasis(h.hl, h.depth);
    expect(e('iessey')).toBe(1);
    expect(h.depth!.get('avraam')!).toBeGreaterThan(3);
    expect(e('avraam')).toBe(marks.FAR);
  });
  it('связь при выделении: предки — сплошная 1,5 px, потомки — штрих [4, 3], братья — 1 px', () => {
    expect(trails.linkKind('anc', 'self')).toBe('anc');
    expect(trails.linkKind('anc', 'anc')).toBe('anc');
    expect(trails.linkKind('self', 'desc')).toBe('desc');
    expect(trails.linkKind('desc', 'desc')).toBe('desc');
    expect(trails.linkKind('anc', 'sib')).toBe('sib');
    expect(trails.linkKind(undefined, 'desc')).toBe('base');
    expect(trails.LINK_STYLE.anc).toEqual({ width: 1.5, dash: [] });
    expect(trails.LINK_STYLE.desc).toEqual({ width: 1.5, dash: [4, 3] });
  });
  it('группа панели (главы, синопсис) светит свои лица и выбранное; путь — лица пути', () => {
    const g = marks.highlightFor('david', null, ['ruf', 'vooz'])!;
    expect(g.hl.get('ruf')).toBe('group');
    expect(g.hl.get('david')).toBe('self');
    expect(g.hl.has('solomon')).toBe(false);
    const k = marks.highlightFor('ioav', ['ioav', 'saruiya', 'david'])!;
    expect(k.hl.get('saruiya')).toBe('path');
    expect(k.hl.get('david')).toBe('self');
    expect(marks.highlightFor(null, null)).toBe(null);
  });
});

describe('отрисовка на небе: пометы и подписи призраков проходят замер наложений', () => {
  it('семья Иакова на масштабе семьи: имя матери у ромба и подписи призраков — в замере, наложений нет', () => {
    const { s } = makeSky();
    // окно — вокруг рождения сыновей Иакова, след Иакова — в середине по высоте
    s.cam.zoomAt(720, 400, 30);
    s.cam.x0 = s.nodeX('iuda')! - 700 / s.cam.kx;
    s.cam.laneTop = s.node('iakov')!.lane + 380 / s.cam.ky;
    expect(s.cam.ky).toBeGreaterThanOrEqual(14);
    draw(s, { selected: 'iakov', highlight: marks.familyHighlight('iakov').hl, depth: marks.familyHighlight('iakov').depth });
    const st = s.labelStats();
    const notes = st.boxes.filter((b) => b.kind === 'note').map((b) => b.text);
    // этап 11 (STAGE11 § 2, Г8): мать видна по положению — ромб союза на её следе, а если она далеко от детей, ромб на
    // следе отца с её именем; пометы «от Лии», «от Рахили» у гребёнок ушли с неба
    expect(notes.filter((t) => /^от [А-ЯЁ]/.test(t))).toEqual([]);
    const names = st.boxes.filter((b) => b.kind === 'plate' && b.text).map((b) => b.text);
    expect(names).toContain('Лия');
    expect(st.overlaps).toBe(0);
    // подписи призраков жён (ТЗ § 3.1): этап 15, решение 173 — призрак жены из далёкого рода стоит в её родной семье
    // (Рахиль и Лия — у Лавана), её звезда — у мужа; у призрака — «Рахиль, жена Иакова»
    const g = s.nodes.findIndex((n) => n.id === 'ghost:rakhil');
    expect(g).toBeGreaterThanOrEqual(0);
    s.cam.x0 = s.X0[g] - 600 / s.cam.kx;
    s.cam.laneTop = s.nodes[g].lane + 380 / s.cam.ky;
    draw(s, { selected: 'iakov', highlight: marks.familyHighlight('iakov').hl, depth: marks.familyHighlight('iakov').depth });
    const st2 = s.labelStats();
    expect(st2.boxes.filter((b) => b.kind === 'note').map((b) => b.text)).toContain('Рахиль, жена Иакова');
    expect(st2.overlaps).toBe(0);
  });
});
