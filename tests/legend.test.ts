/**
 * «Условные знаки» — как читать карту (G5; UX-35, VIS-31, VIS-32, CARD-43; принцип 3 docs/UI-PROMPT.md):
 *  — образцы рисуют функции неба (drawGlyph, drawLifeTrail, drawDescent, buildRibbons, drawStrands, drawLinkSample),
 *    а не свои копии: в Legend.tsx нет ни одного вызова рисования холста, кроме переноса вырезки;
 *  — у каждого знака и каждого вида следа и связи есть образец, и он передаёт функции неба именно этот вид;
 *  — вырезки рамки, облаков, созвездий, скоплений, колец, пути родства и меридиана — кадр Sky.draw, перенесённый
 *    на холст образца; лица, на которых они стоят, есть на небе;
 *  — разделы панели идут по порядку: как читать карту, небо, карточки на небе, знаки, линии, время, карточка, клавиши,
 *    слои.
 * Этап 11 (решения 77, 78): раздела «Древо» нет; с неба ушли отводы с квадратиком матери, скобы и гребёнки, пометы
 * порядка, выноска к дальней жене и штрих потомков — их образцы (descent, mother, tension, bracket, mothers, order,
 * marriage, marriageFar, family) и прежний образец союза (plates, drawUnionSample) заменены знаками грамматики связей
 * drawLinkSample (src/render/plates.ts): ромб, узел, ствол с зубцами и чертой брака, разрыв, обрывки, лента, выбранная связь.
 * Нужна свежая сборка данных: npm run -s data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkyState } from '../src/render/sky.ts';
import type { CropSpec } from '../src/ui/panels/Legend.tsx';

// функции неба — шпионы вокруг настоящих: образец рисует ими, а тест видит, с чем
vi.mock('../src/render/glyphs.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/glyphs.ts')>();
  return { ...m, drawGlyph: vi.fn(m.drawGlyph), drawBirthBand: vi.fn(m.drawBirthBand) };
});
vi.mock('../src/render/trails.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/trails.ts')>();
  return { ...m, drawLifeTrail: vi.fn(m.drawLifeTrail), drawDescent: vi.fn(m.drawDescent), drawBracket: vi.fn(m.drawBracket), drawMarriage: vi.fn(m.drawMarriage), drawEpochBracket: vi.fn(m.drawEpochBracket), drawFamilyText: vi.fn(m.drawFamilyText), drawFamilySample: vi.fn(m.drawFamilySample) };
});
vi.mock('../src/render/ribbons.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/ribbons.ts')>();
  return { ...m, drawStrands: vi.fn(m.drawStrands) };
});
vi.mock('../src/render/marks.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/marks.ts')>();
  return { ...m, drawWorkMark: vi.fn(m.drawWorkMark) };
});
vi.mock('../src/render/labels.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/labels.ts')>();
  return { ...m, drawFoldMark: vi.fn(m.drawFoldMark) };
});
vi.mock('../src/render/plates.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/plates.ts')>();
  return { ...m, drawUnionSample: vi.fn(m.drawUnionSample), drawLinkSample: vi.fn(m.drawLinkSample) };
});
vi.mock('../src/render/branches.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/branches.ts')>();
  return { ...m, drawBranchSample: vi.fn(m.drawBranchSample) };
});
// свет неба и врезка семьи (этап 16, решения 182–184, 186) — образцом неба drawLightSample
vi.mock('../src/render/light.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/light.ts')>();
  return { ...m, drawLightSample: vi.fn(m.drawLightSample) };
});
vi.mock('../src/engine/ribbons.ts', async (orig) => {
  const m = await orig<typeof import('../src/engine/ribbons.ts')>();
  return { ...m, buildRibbons: vi.fn(m.buildRibbons) };
});
// небо вырезок — запись кадров вместо холста (в тестах холста нет)
const frames: { state: SkyState; size: [number, number]; view?: unknown }[] = [];
vi.mock('../src/render/sky.ts', async (orig) => {
  const m = await orig<typeof import('../src/render/sky.ts')>();
  class RecordingSky {
    canvas = { recording: true };
    letterW = 18;
    pal = {};
    edgeHits = [{ x: 400, y: 100, w: 80, h: 18 }];
    X0 = new Float64Array(0);
    nodes: { lane: number; person: string }[] = [];
    private index = new Map<string, number>();
    private size: [number, number] = [0, 0];
    cam = { set: vi.fn(), kyFor: (kx: number) => Math.min(26, 40 * kx), sx: (x: number) => x, sy: (l: number) => -l };
    model: unknown = null;
    setModel(model: { nodes: { person: string; lane: number; t0: number; ghost?: boolean }[] }) {
      this.model = model;
      this.nodes = model.nodes;
      this.X0 = new Float64Array(model.nodes.map((n) => n.t0));
      this.index = new Map(model.nodes.filter((n) => !n.ghost).map((n, i) => [n.person, i]));
    }
    resize(w: number, h: number) {
      this.size = [w, h];
    }
    indexOf(id: string) {
      return this.index.get(id);
    }
    xOf(t: number) {
      return t;
    }
    tOf(x: number) {
      return x;
    }
    draw(state: SkyState) {
      frames.push({ state, size: this.size, view: this.view });
    }
    view: unknown = null;
    setView(v: unknown) {
      this.view = v;
    }
    rowOf(lane: number) {
      return lane;
    }
  }
  return { ...m, Sky: RecordingSky, readPalette: () => PAL };
});

const PAL = {
  sky: '#0d1b34', band: '#13264a', ink: '#e8eef7', ink2: '#8fa2bf', ink3: '#7d8fab', rule: '#2a3b5c', ruleStrong: '#4a5d80',
  gold1: '#e6b550', gold2: '#c9773a', azure1: '#9ccbf5', azure2: '#9edbd0', focus: '#ffd166', halo: '#0d1b34', sheet: '#13264a',
  sheet2: '#1a2f57', dimInk: 0.4, dimInk2: 0.5, lineAlpha: 0.7, contourAlpha: 0.5, glow: true, ribbonGlow: [0.06, 0.1] as [number, number], ribbonTone: 0,
};

const { PAINTERS, CROPS, FAMILY_LEGEND, magnitude, paintCrop, cropState } = await import('../src/ui/panels/Legend.tsx');
const glyphs = await import('../src/render/glyphs.ts');
const trails = await import('../src/render/trails.ts');
const ribbons = await import('../src/render/ribbons.ts');
const eribbons = await import('../src/engine/ribbons.ts');
const labels = await import('../src/render/labels.ts');
const marks = await import('../src/render/marks.ts');
const branches = await import('../src/render/branches.ts');
const plates = await import('../src/render/plates.ts');
const light = await import('../src/render/light.ts');
const { models, byId } = await import('../src/data/atlas.ts');

/** Холст, который принимает любые вызовы; ширина текста — 7 px на знак. */
function sink() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      return (...a: unknown[]) => {
        calls.push(String(k));
        void a;
        return { addColorStop: () => {} };
      };
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const spies = {
  drawGlyph: vi.mocked(glyphs.drawGlyph),
  drawLifeTrail: vi.mocked(trails.drawLifeTrail),
  drawDescent: vi.mocked(trails.drawDescent),
  drawBracket: vi.mocked(trails.drawBracket),
  drawMarriage: vi.mocked(trails.drawMarriage),
  drawStrands: vi.mocked(ribbons.drawStrands),
  buildRibbons: vi.mocked(eribbons.buildRibbons),
  drawFoldMark: vi.mocked(labels.drawFoldMark),
  drawEpochBracket: vi.mocked(trails.drawEpochBracket),
  drawWorkMark: vi.mocked(marks.drawWorkMark),
  drawBirthBand: vi.mocked(glyphs.drawBirthBand),
  drawFamilyText: vi.mocked(trails.drawFamilyText),
  drawFamilySample: vi.mocked(trails.drawFamilySample),
  drawBranchSample: vi.mocked(branches.drawBranchSample),
  drawUnionSample: vi.mocked(plates.drawUnionSample),
  drawLinkSample: vi.mocked(plates.drawLinkSample),
  drawLightSample: vi.mocked(light.drawLightSample),
};
type SpyName = keyof typeof spies;

/** Нарисовать образец и вернуть, какие функции неба он вызвал и с чем. */
function paint(k: keyof typeof PAINTERS, w = 96, h = 44) {
  for (const s of Object.values(spies)) s.mockClear();
  PAINTERS[k](sink().ctx, PAL as never, w, h);
  return spies;
}
const used = (s: typeof spies) => (Object.keys(s) as SpyName[]).filter((n) => s[n].mock.calls.length);

const source = readFileSync(join(__dirname, '../src/ui/panels/Legend.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('образцы — функции неба, а не свои копии', () => {
  it('в Legend.tsx нет своего рисования холста: только перенос вырезки неба (drawImage) и очистка', () => {
    const own = [...source.matchAll(/\.(arc|arcTo|ellipse|lineTo|moveTo|quadraticCurveTo|bezierCurveTo|rect|fillRect|strokeRect|fillText|strokeText|stroke|fill|setLineDash)\(/g)].map((m) => m[1]);
    expect(own).toEqual([]);
    expect(source).toMatch(/\.drawImage\(/);
  });
  it('каждый образец вызывает функцию неба', () => {
    for (const k of Object.keys(PAINTERS) as (keyof typeof PAINTERS)[]) expect(used(paint(k)), k).not.toEqual([]);
  });
  it('знаки свёрнутого (J5) — строка созвездия с названием drawFoldMark неба; «+N» после имени — кадр неба со свёрнутыми потомками (UX-80)', () => {
    expect(paint('foldGroup').drawFoldMark.mock.calls.map((c) => [c[5], c[6]])).toEqual([['ЕДОМ', '+38']]);
    // «+N» стоит после имени лица: образец — кадр настоящего неба, где у Давида свёрнуты потомки, а не своя картинка
    expect('foldDesc' in PAINTERS).toBe(false);
    expect(CROPS.fold.view().foldDesc).toEqual(['david']);
    expect(CROPS.fold.at()).toEqual({ ids: ['david'] });
  });
  it('подсветка ветвей выбранного лица — образцом неба drawBranchSample, во всю ширину строки (решение 69)', () => {
    const s = paint('branches', 400, 64);
    // звёзды образца — знаком неба drawGlyph, который вызывает сам образец
    expect(used(s)).toEqual(['drawGlyph', 'drawBranchSample']);
    expect(s.drawBranchSample.mock.calls[0].slice(2)).toEqual([400, 64]);
  });
  it('грамматика связей — образцами неба drawLinkSample: ромб, узел, ствол с зубцами и «‖», разрыв, обрывки, лента, выбранная связь (решение 78)', () => {
    const signs = {
      linkTrunk: 'trunk', linkNode: 'node', linkJoin: 'join', linkCut: 'cut', linkStub: 'stub', linkRibbon: 'ribbon', linkSelected: 'selected',
    } as const;
    for (const [k, sign] of Object.entries(signs) as [keyof typeof signs, (typeof signs)[keyof typeof signs]][]) {
      const s = paint(k, 420, 56);
      // образец — функция неба с этим знаком, во всю ширину строки; своих линий у образца нет
      expect(s.drawLinkSample.mock.calls.map((c) => c.slice(2)), k).toEqual([[420, 56, sign]]);
      expect(used(s), k).toContain('drawLinkSample');
    }
    // прежних образцов связей больше нет: их знаков на небе нет (STAGE11 § 2, «С неба уходят»)
    for (const k of ['descent', 'mother', 'tension', 'bracket', 'mothers', 'order', 'marriage', 'marriageFar', 'family', 'plates']) expect(k in PAINTERS, k).toBe(false);
  });
  // «Семья на небе» этапа 19 (вместо восьми знаков «Отчего дома» решения 180, снятых решением 190 вместе с ним: на небе
  // их нет, а легенда, учившая им, вводила в заблуждение — аудит 5 октября, К-12)
  it('«Семья на небе» (этап 19): союз, вид союза, веер выбранного, связка без следов — вырезками неба и образцами drawLinkSample', () => {
    for (const [k, sign] of [['linkKinds', 'kinds'], ['linkFan', 'fan']] as const) {
      const s = paint(k, 420, 64);
      expect(s.drawLinkSample.mock.calls.map((c) => c.slice(2)), k).toEqual([[420, 64, sign]]);
    }
    expect(FAMILY_LEGEND.map((r) => r.head)).toEqual(['Союз', 'Вид союза', 'Выбранное лицо', 'Указатель у кромки', 'Следы жизни выключены']);
    // вырезки настоящего неба: Иаков без выбора, выбранный (веер), выбранный при выключенных следах
    expect(FAMILY_LEGEND.map((r) => r.crop ?? null)).toEqual(['family', null, 'familySel', null, 'familyStubs']);
    // указатель шатра — рисовальщиком неба (drawTentPointer внутри drawFamilySample('tent'))
    expect(paint('linkTent', 420, 44).drawFamilySample.mock.calls.map((c) => c.slice(2))).toEqual([[420, 44, 'tent']]);
    expect(cropState(models[0], 1, CROPS.familySel.state()).selected).toBe('iakov');
    expect(cropState(models[0], 1, CROPS.familyStubs.state()).layers.lifelines).toBe(false);
    // знаки «Отчего дома» и света неба сняты из образцов
    for (const k of ['familyGlide', 'familyStation', 'lightNebula', 'lightMouth', 'lightDust', 'lightHalo', 'tribeLeah', 'tribeSilver']) expect(k in PAINTERS, k).toBe(false);
    for (const r of FAMILY_LEGEND) expect(r.text, r.head).not.toMatch(/свечен|туманност|устье|Отч(ий|его) дом|на следе жены|станци/i);
  });
  it('знаки «Семьи на небе» рисуют небесные рисовальщики: след с переходом, ромб по виду союза, черта брака по виду', () => {
    // настоящий рисовальщик (без шпиона-обёртки): что он зовёт
    const real = vi.mocked(trails.drawFamilySample).getMockImplementation()!;
    const s = sink();
    for (const k of Object.values(spies)) k.mockClear();
    real(s.ctx, PAL as never, 420, 56, 'glide');
    // след звезды — drawLifeTrail с переходом (S-кривая, решение 173), чужой след под переходом — с разрывом
    const t = trails.sampleBend(10, 60, 5, 45);
    expect(t.pts.length / 2).toBeGreaterThanOrEqual(7);
    expect(t.pts[1]).toBe(5);
    expect(t.pts[t.pts.length - 1]).toBe(45);
    // переход не вертикален: x растёт по всей ломаной
    for (let k = 2; k < t.pts.length; k += 2) expect(t.pts[k]).toBeGreaterThan(t.pts[k - 2]);
    expect(trails.barOffsets({ kind: 'bar', bar: 'wife' })).toHaveLength(2);
    expect(trails.barOffsets({ kind: 'bar', bar: 'concubine' })).toHaveLength(1);
    expect(trails.barOffsets({ kind: 'bar', bar: 'levirate' })).toHaveLength(2);
    expect(trails.barOffsets({ kind: 'bar', bar: 'none' })).toHaveLength(1);
    expect(trails.barWidth({ kind: 'bar', bar: 'none' })).toBeLessThan(1);
  });
  it('семь величин звезды — drawGlyph с величинами 0…6', () => {
    const seen: number[] = [];
    for (let m = 0; m <= 6; m++) {
      spies.drawGlyph.mockClear();
      magnitude(m)(sink().ctx, PAL as never, 30, 22);
      seen.push(spies.drawGlyph.mock.calls[0][3].magnitude);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('все знаки неба: мужчина, женщина, народ, Иисус Христос, царь, царица, полый, призрак, младенец', () => {
    const opts = (k: keyof typeof PAINTERS) => paint(k).drawGlyph.mock.calls.map((c) => c[3]);
    expect(opts('man').some((o) => o.sex === 'm' && o.kind === 'person' && !o.king && !o.hollow)).toBe(true);
    expect(opts('woman').some((o) => o.sex === 'f' && !o.ghost)).toBe(true);
    expect(opts('people').some((o) => o.kind === 'people')).toBe(true);
    expect(opts('messiah').some((o) => o.messiah)).toBe(true);
    expect(opts('king').some((o) => o.king && o.sex === 'm')).toBe(true);
    expect(opts('queen').some((o) => o.king && o.sex === 'f')).toBe(true);
    expect(opts('hollow').some((o) => o.hollow)).toBe(true);
    expect(opts('ghost').some((o) => o.ghost)).toBe(true);
    expect(opts('infant').some((o) => o.infant)).toBe(true);
    // народ и умерший младенцем — без следа, как на небе
    expect(paint('people').drawLifeTrail).not.toHaveBeenCalled();
    expect(paint('infant').drawLifeTrail).not.toHaveBeenCalled();
  });
  it('следы: точный, оценочный (пунктир начала), до последнего упоминания и без данных (пунктир 10 px), эпоха', () => {
    const t = (k: keyof typeof PAINTERS) => paint(k).drawLifeTrail.mock.calls[0][1];
    expect(t('trailExact')).toMatchObject({ cls: 'exact', known: true });
    const est = t('trailEstimated');
    expect(est.cls).toBe('estimated');
    expect(est.sureFrom! > est.x0).toBe(true);
    expect(est.solidTo < est.x1).toBe(true);
    const last = t('trailLast');
    expect(last.known).toBe(false);
    expect(last.x1 - last.solidTo).toBe(trails.TAIL_PX);
    const none = t('trailNone');
    expect(none.solidTo).toBe(none.x0);
    expect(none.x1 - none.x0).toBe(trails.TAIL_PX);
    expect(t('trailEpochal').cls).toBe('epochal');
    // растянутое родословие — разрыв «//» внутри следа (MAP-51)
    const br = t('trailBreak');
    expect(br.brk! > br.x0 && br.brk! < br.x1).toBe(true);
  });
  it('время не установлено — скобка неба drawEpochBracket; лицо в наборе — метка неба drawWorkMark (MAP-52, IX-51)', () => {
    expect(paint('epochBracket').drawEpochBracket.mock.calls.length).toBe(1);
    expect(paint('epochBracket').drawGlyph.mock.calls[0][3].hollow).toBe(true);
    expect(paint('workMark').drawWorkMark.mock.calls.length).toBe(1);
  });
  it('полый знак — только «время не установлено», без следа; промежуток рождения — полоса неба drawBirthBand (решения 42, 38)', () => {
    // полый знак образца — без следа жизни: он значит «время не установлено», а не «год по расчёту» (MAP-77)
    expect(paint('hollow').drawLifeTrail).not.toHaveBeenCalled();
    const b = paint('birthBand');
    expect(b.drawBirthBand.mock.calls.length).toBe(1);
    const band = b.drawBirthBand.mock.calls[0][1];
    // полоса — слева от знака, знак стоит у её правого края (у первого засвидетельствованного года)
    const star = b.drawGlyph.mock.calls[0];
    expect(band.x1).toBeLessThanOrEqual(star[1]);
    expect(band.x0).toBeLessThan(band.x1);
    expect(star[3].hollow).toBeFalsy();
  });
  it('призрак жены — drawDescent с пунктиром призрака', () => {
    expect(paint('ghost').drawDescent.mock.calls[0][1].ghost).toBe(true);
  });
  it('ленты: коса, расхождение и звено по толкованию — buildRibbons и drawStrands', () => {
    const s = paint('ribbons', 340, 64);
    expect(s.buildRibbons).toHaveBeenCalledTimes(1);
    const inp = s.buildRibbons.mock.calls[0][0];
    expect(inp.mary.some((x) => x.weak)).toBe(true);
    expect(inp.joseph.map((x) => x.id)).not.toEqual(inp.mary.map((x) => x.id));
    expect(s.drawStrands).toHaveBeenCalledTimes(1);
  });
});

describe('вырезки из неба', () => {
  const m = models[0];
  const canvases: { drawImage: unknown[][] }[] = [];
  const g = globalThis as unknown as { document?: unknown; window?: unknown };
  const was = { document: g.document, window: g.window };
  beforeEach(() => {
    frames.length = 0;
    const cv = () => {
      const rec = { drawImage: [] as unknown[][] };
      canvases.push(rec);
      return {
        width: 0,
        height: 0,
        style: {},
        getContext: () => ({ setTransform: () => {}, clearRect: () => {}, drawImage: (...a: unknown[]) => rec.drawImage.push(a) }),
      };
    };
    g.document = { createElement: cv };
    g.window = { devicePixelRatio: 1 };
    (g as { __cv?: () => unknown }).__cv = cv;
  });
  afterEach(() => {
    g.document = was.document;
    g.window = was.window;
  });

  it('лица, на которых стоят вырезки, есть на небе', () => {
    const onSky = new Set(m.nodes.map((n) => n.person));
    for (const [k, spec] of Object.entries(CROPS) as [string, CropSpec][]) {
      const at = spec.at(m);
      if ('ids' in at) {
        expect(at.ids.length, k).toBeGreaterThan(0);
        for (const id of at.ids) expect(onSky.has(id), `${k}: ${id}`).toBe(true);
      }
      const st = spec.state?.(m) ?? {};
      for (const id of [st.selected, st.second, st.hovered, st.focus, ...(st.pins ?? [])].filter(Boolean) as string[]) expect(byId.has(id), `${k}: ${id}`).toBe(true);
    }
  });
  it('путь родства вырезки — шаги пары «Иоав — Давид», как после «Родство с…»', () => {
    const st = CROPS.path.state!();
    expect(st.kinSteps?.length).toBeGreaterThan(0);
    expect(st.kinSteps![0].from).toBe('ioav');
    expect(st.kinSteps![st.kinSteps!.length - 1].to).toBe('david');
  });
  it('каждая вырезка — кадр Sky.draw со своим состоянием, перенесённый на холст образца', () => {
    const make = (g as { __cv?: () => { getContext: () => unknown } }).__cv!;
    for (const [k, spec] of Object.entries(CROPS) as [string, CropSpec][]) {
      frames.length = 0;
      canvases.length = 0;
      const target = make();
      paintCrop(target as unknown as HTMLCanvasElement, spec, 340, 80);
      expect(frames.length, k).toBe(1);
      const want = { ...cropState(m, 1), ...(spec.state?.(m) ?? {}) };
      expect(frames[0].state.onlyLines, k).toBe(want.onlyLines);
      expect(frames[0].state.selected, k).toBe(want.selected);
      expect(frames[0].state.meridian, k).toBe(want.meridian);
      // на холст образца переносится холст того самого неба
      const copies = canvases[0].drawImage;
      expect(copies.length, k).toBe(1);
      expect((copies[0][0] as { recording?: boolean }).recording, k).toBe(true);
    }
  });
});

describe('разделы панели', () => {
  it('как читать карту, небо, карточки на небе, знаки, линии, время, карточка, клавиши, слои — по порядку', () => {
    const ids = [...source.matchAll(/<h3 id="(legend-[a-z]+)"/g)].map((x) => x[1]);
    // этап 11 (решение 77): вида «Древо» нет; сразу после «Неба» — карточки у звезды, у ромба и у связи
    // этап 13, решение 94: «Линии карты» — отдельный раздел после «Линий» (меридианы, контуры, эпохи — не родство)
    // этап 15, решение 180: «Семья на небе» — в начале «Условных знаков», сразу после «Как читать карту»
    expect(ids).toEqual(['legend-guide', 'legend-family', 'legend-sky', 'legend-cards', 'legend-signs', 'legend-lines', 'legend-map', 'legend-time', 'legend-card', 'legend-keys', 'legend-layers']);
  });
  it('название панели — «Условные знаки», пояснение начинается с «Как читать карту:»', () => {
    expect(source).toMatch(/<Sheet title="Условные знаки" lead="Как читать карту: [^"]+">/);
  });
  it('клавиши — таблицей KeysTable, метки рейки и пометы — те же подписи, что в карточке', () => {
    expect(source).toMatch(/<KeysTable \/>/);
    expect(source).toMatch(/STATE_TEXT\[k\]/);
    expect(source).toMatch(/CERT_FULL\.inference/);
    expect(source).toMatch(/MARK_FULL\.calc/);
  });
});
