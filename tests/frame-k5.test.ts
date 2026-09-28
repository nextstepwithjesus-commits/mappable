/**
 * Рамка неба — этап 7, K5: модель хронологии в служебной строке, если она не по умолчанию (решение 35; IX-48);
 * «Свёрнуто: … — развернуть» (решение 30; MAP-63); буквы строк без «Я0 Ю0» и кромка на две литеры (UX-07);
 * меридианы событий — из эпох модели (CARD-60, K1).
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Text = { t: string; x: number; y: number };
function recording() {
  const texts: Text[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y });
      return () => ({ addColorStop: () => {} });
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

let sky: typeof import('../src/render/sky.ts');
let frame: typeof import('../src/render/frame.ts');
let atlas: typeof import('../src/data/atlas.ts');
let layout: typeof import('../src/engine/layout.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;
beforeAll(async () => {
  Object.assign(globalThis, { document: { documentElement: { dataset: {} } }, getComputedStyle: () => ({ getPropertyValue: () => '' }) });
  sky = await import('../src/render/sky.ts');
  frame = await import('../src/render/frame.ts');
  atlas = await import('../src/data/atlas.ts');
  layout = await import('../src/engine/layout.ts');
});
const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(o: { w?: number; state?: Record<string, unknown>; view?: import('../src/render/rows.ts').SkyView; move?: (s: Sky) => void } = {}) {
  const rec = recording();
  const s = new sky.Sky({ getContext: () => rec.ctx, style: {}, width: 0, height: 0, dataset: {} } as unknown as HTMLCanvasElement);
  s.resize(o.w ?? 1440, 776, 1);
  s.setModel(atlas.models[0], 1);
  if (o.view) s.setView(o.view);
  s.fitAll();
  o.move?.(s);
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [], ...(o.state ?? {}),
  } as Parameters<Sky['draw']>[0]);
  return { s, texts: rec.texts };
}

describe('служебная строка (решения 30, 35)', () => {
  it('модель не по умолчанию — «модель «…»» справа в служебной строке; тесно — до двоеточия', () => {
    const name = 'Краткое пребывание: 215 лет в Египте';
    const { texts, s } = drawSky({ state: { modelNote: name } });
    const t = texts.find((q) => q.t.startsWith('модель «'));
    expect(t?.t).toBe('модель «Краткое пребывание: 215 лет в Египте»');
    expect(t!.y).toBeLessThan(sky.FRAME_H);
    expect(s.labelStats().boxes.some((b) => b.kind === 'frame' && b.text === t!.t)).toBe(true);
    expect(frame.modelText(name, true)).toBe('модель «Краткое пребывание»');
    const phone = drawSky({ w: 390, state: { modelNote: name } });
    expect(phone.texts.some((q) => q.t.startsWith('модель «'))).toBe(true);
    // модель по умолчанию — ничего
    const none = drawSky();
    expect(none.texts.some((q) => q.t.startsWith('модель'))).toBe(false);
  });
  it('«Свёрнуто: колено Иудино (358), потомки Давида (62) — развернуть»: пункты и «развернуть» — команды', () => {
    const { texts, s } = drawSky({ view: { mode: 'all', set: new Set(), foldDesc: ['david'], foldGroups: ['judah'] } });
    const g = s.plan.marks.find((m) => m.kind === 'group')!;
    const d = s.plan.marks.find((m) => m.kind === 'desc')!;
    expect(texts.some((q) => q.t === 'Свёрнуто: ')).toBe(true);
    expect(texts.some((q) => q.t === `колено Иудино (${g.count})`)).toBe(true);
    expect(texts.some((q) => q.t === `потомки Давида (${d.count})`)).toBe(true);
    const cmd = s.foldHits.filter((h) => h.y < sky.FRAME_H);
    expect(cmd.map((h) => h.kind).sort()).toEqual(['all', 'desc', 'group']);
  });
  it('пункты строки: названия созвездий со строчной, если первое слово нарицательное; имя — склонённым или в начале', () => {
    expect(frame.groupInLine('Колено Иудино')).toBe('колено Иудино');
    expect(frame.groupInLine('Дом Саулов')).toBe('дом Саулов');
    expect(frame.groupInLine('Моав')).toBe('Моав');
    expect(frame.groupInLine('Ной и сыновья')).toBe('Ной и сыновья');
    expect(frame.foldItemText({ kind: 'desc', id: 'david', count: 62 })).toBe('потомки Давида (62)');
    expect(frame.foldItemText({ kind: 'group', id: 'saulides', count: 65 })).toBe('дом Саулов (65)');
  });
});

describe('буквы строк (UX-07)', () => {
  it('над «А» букв нет (ни «Я0», ни «Ю0»); кромка вмещает две литеры', () => {
    const { texts, s } = drawSky({
      move: (q) => {
        // окно выше верхней полосы данных: строки над «А»
        q.cam.laneTop = atlas.models[0].laneMax + 60;
      },
    });
    const letters = texts.filter((q) => q.x < s.letterW && q.y > s.openTop);
    for (const q of letters) expect(q.t, q.t).not.toMatch(/0$/);
    expect(letters.some((q) => q.t === 'А')).toBe(true);
    expect(frame.LETTER_W).toBeGreaterThanOrEqual(22);
    expect(layout.atlasRowLetter(-1)).toBe('Я0');
  });
});

describe('меридианы событий — из эпох модели (CARD-60)', () => {
  it('Потоп и призвание Аврама берут год из каталога эпох модели', () => {
    const { s } = drawSky();
    const ev = frame.eventMarks(s);
    const flood = ev.find((e) => e.name === 'Потоп')!;
    const call = ev.find((e) => e.name === 'Призвание Аврама')!;
    const m = atlas.models[0];
    expect(flood.t).toBe(m.chrono.get('noy')!.b + 600);
    expect(call.t).toBe(m.chrono.get('avraam')!.b + 75);
  });
});
