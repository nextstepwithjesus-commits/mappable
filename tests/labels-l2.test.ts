/**
 * Небо, отрисовка — этап 7, круг 3, группа L2 (docs/ui-review/README.md, «L. Вторая повторная экспертиза»):
 * уточнения одноимённых (решение 43; MAP-72), след под подписью лиц линий (MAP-56, MOB-76, VIS-76), подпись Иисуса
 * Христа на обзоре (MAP-81), названия у каждой крупной области (MAP-58), полый знак (решение 42; MAP-77), метка набора
 * (IX-77), промежуток рождения (решение 38; MAP-69).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const tokens = block(":root[data-map='night']");

type Text = { t: string; x: number; y: number; font: string };
type Fill = { x: number; y: number; w: number; h: number; fill: string };
function recording() {
  const texts: Text[] = [];
  const fills: Fill[] = [];
  const st = { font: '', fill: '' };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_o, k) => {
      if (k === 'measureText') return (t: string) => ({ width: t.length * 7 });
      if (k === 'fillText') return (t: string, x: number, y: number) => texts.push({ t, x, y, font: st.font });
      if (k === 'fillRect') return (x: number, y: number, w: number, h: number) => fills.push({ x, y, w, h, fill: st.fill });
      if (k === 'fillStyle') return st.fill;
      return () => ({ addColorStop: () => {} });
    },
    set: (_o, k, v) => {
      if (k === 'font') st.font = v as string;
      if (k === 'fillStyle') st.fill = String(v);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, fills };
}

let sky: typeof import('../src/render/sky.ts');
let labels: typeof import('../src/render/labels.ts');
let glyphs: typeof import('../src/render/glyphs.ts');
let atlas: typeof import('../src/data/atlas.ts');
let years: typeof import('../src/engine/years.ts');
type Sky = InstanceType<typeof import('../src/render/sky.ts').Sky>;

beforeAll(async () => {
  Object.assign(globalThis, {
    document: { documentElement: { dataset: {} } },
    getComputedStyle: () => ({ getPropertyValue: (n: string) => tokens[n] ?? '' }),
  });
  sky = await import('../src/render/sky.ts');
  labels = await import('../src/render/labels.ts');
  glyphs = await import('../src/render/glyphs.ts');
  atlas = await import('../src/data/atlas.ts');
  years = await import('../src/engine/years.ts');
});

const LAYERS = { lifelines: true, connectors: true, constellations: true, epochs: true, ribbons: true, tensions: true, ghosts: true, labels: true };
function drawSky(o: { move?: (s: Sky) => void; state?: Record<string, unknown>; w?: number; h?: number } = {}) {
  const rec = recording();
  const canvas = { getContext: () => rec.ctx, style: {} as Record<string, string>, width: 0, height: 0, dataset: {} as Record<string, string> } as unknown as HTMLCanvasElement;
  const s = new sky.Sky(canvas);
  s.resize(o.w ?? 1440, o.h ?? 776, 1);
  s.setModel(atlas.models[0], 1);
  s.fitAll();
  o.move?.(s);
  s.draw({
    model: atlas.models[0], lambda: 1, selected: null, second: null, hovered: null, focus: null, highlight: null, layers: LAYERS,
    onlyLines: false, meridian: null, tensionPersons: new Set(), flow: 0, reduced: true, intro: 1, lineFlip: false, pins: new Set(), reserve: [],
    ...(o.state ?? {}),
  } as Parameters<Sky['draw']>[0]);
  return { sky: s, ...rec, data: (canvas as unknown as { dataset: Record<string, string> }).dataset };
}
/** Окно в `span` лет вокруг года (исторического) и полосы; mult — пропорция строк. */
const window = (year: number, span: number, lane = 0, mult = 1) => (s: Sky) => {
  s.cam.lanes = mult;
  const t = years.toAstro(year);
  const vp = s.cam.vp;
  const vw = vp.r - vp.l;
  const kx = vw / (s.xOf(t + span / 2) - s.xOf(t - span / 2));
  s.cam.set({ x0: s.xOf(t) - (vp.l + vw / 2) / kx, kx, laneTop: lane + (vp.t + vp.b) / 2 / s.cam.kyFor(kx) });
};
const note = (id: string) => labels.shortNote(atlas.byId.get(id)!.disambig, id);

describe('уточнения одноимённых на небе (решение 43; MAP-72)', () => {
  it('Ироды: «(Мф 2)», «четвертовластник Галилейский», «гонитель церкви» — различимы, без обрывков', () => {
    expect(note('irod-velikiy')).toBe(' (Мф 2)');
    expect(note('irod-antipa')).toBe(', четвертовластник Галилейский');
    // «царь» — одно название роли: оно видно сокращением «ц.» и лиц не различает — берётся следующая часть
    expect(note('irod-agrippa')).toBe(', гонитель церкви');
    const all = ['irod-velikiy', 'irod-antipa', 'irod-agrippa'].map(note);
    expect(new Set(all).size).toBe(3);
  });
  it('Иеровоамы — по отцу; Озия — «(Азария)»: «он же X» пишется в скобках, а не «Озия, он же»', () => {
    expect(note('ieroboam')).toBe(', сын Навата');
    expect(note('ieroboam-vtoroy')).toBe(', сын Иоаса');
    expect(note('oziya')).toBe(' (Азария)');
    expect(note('oziya-syn-bukkiya')).toBe(', сын Буккия');
  });
  it('Азарии: часть длиннее трёх слов не обрезается («Азария, второй сын»), а заменяется главой первого упоминания', () => {
    expect(note('azariya-vtoroy-syn-iosafata')).toBe(' (2 Пар 21)');
    expect(note('azariya-syn-iosafata')).toBe(', сын Иосафата');
    expect(note('azariya-pri-ozii')).toBe(' (2 Пар 26)');
    expect(note('azariya-neem10-2')).toBe(', приложивший печать');
    for (const p of atlas.persons.filter((q) => q.name === 'Азария')) {
      const n = note(p.id);
      if (n) expect(n.replace(/^,? /, '').split(/\s+/).length, p.id).toBeLessThanOrEqual(3);
    }
  });
  it('Иавис — «знаменитее своих братьев» целиком, в кавычках; Шимеи — не «отец девяти»', () => {
    expect(note('iavis-1par4-9')).toBe(', «знаменитее своих братьев»');
    expect(note('iavis-otets-selluma')).toBe(', отец Селлума');
    expect(note('shimey-1par8-21')).toBe(' из колена Вениаминова');
    expect(note('shimey-ezd10-23')).toBe(' (Езд 10)');
    expect(note('shimey-1par23-9')).toBe(' Гирсонит');
  });
  it('сокращение роли не повторяет уточнение: «Иоас, царь Иудейский» — без «ц.»', () => {
    expect(labels.rolesUnnamed(['king'], ', царь Иудейский')).toEqual([]);
    expect(labels.rolesUnnamed(['king'], ', сын Навата')).toEqual(['king']);
    expect(labels.rolesUnnamed(['high-priest', 'priest'], ' (2 Пар 26)')).toEqual(['high-priest', 'priest']);
    expect(labels.rolesUnnamed(['levite'], ', левит')).toEqual([]);
  });
  it('на небе одноимённые в окне различаются, а уточнение не снимается (не поместилось — подписи нет)', () => {
    for (const m of [window(-1000, 700, 0, 3), window(-1000, 700, 0, 0.25), window(-10, 120), window(-450, 150, 0)]) {
      const { sky: s, texts } = drawSky({ move: m });
      const names = s.labelStats().boxes.filter((b) => b.kind === 'star');
      const count = new Map<string, number>();
      for (const b of names) count.set(b.text, (count.get(b.text) ?? 0) + 1);
      for (const b of names) {
        if ((count.get(b.text) ?? 0) < 2) continue;
        const want = labels.shortNote(atlas.byId.get(b.id!)!.disambig, b.id!);
        if (!want) continue;
        // у каждой подписи одноимённого — уточнение курсивом сразу за именем
        const has = texts.some((q) => q.font.includes('italic') && /^(, | )/.test(q.t) && q.x > b.x && q.x < b.x + b.w && q.y >= b.y && q.y <= b.y + b.h);
        expect(has, `${b.text} (${b.id})`).toBe(true);
      }
    }
  }, 60000);
});

describe('след под подписью лица линии Мессии не читается дефисом (MAP-56, MOB-76, VIS-76)', () => {
  it('подпись справа гасит свой след от края звезды до конца подписи и ещё на 3 px — и у лиц линий', () => {
    const { sky: s, fills } = drawSky({ move: window(-10, 120) });
    const b = s.labelStats().boxes.find((q) => q.kind === 'star' && q.id === 'iisus')!;
    expect(b).toBeTruthy();
    const i = s.indexOf('iisus')!;
    const x = s.cam.sx(s.X0[i]);
    const y = Math.round(s.cam.sy(s.nodes[i].lane)) + 0.5;
    expect(b.x > x).toBe(true);
    const k = fills.find((f) => f.x > x && f.x < b.x + 1 && f.y <= y - 1 && f.y + f.h >= y + 1 && f.x + f.w >= b.x + b.w + labels.KNOCK_GAP - 2);
    expect(k, 'полоса цвета фона под подписью Иисуса Христа').toBeTruthy();
  });
  it('лицо линии, чья подпись справа легла на ленту, — без полосы: нить не прорезается', () => {
    const { sky: s } = drawSky({ move: window(-1000, 700) });
    const p = { s: { layers: LAYERS, onlyLines: false, highlight: null, pins: new Set() }, spine: new Set(['solomon']), detail: 1, starDetail: 1, work: false, offRibbon: () => false } as unknown as Parameters<typeof labels.knockTrail>[1];
    const i = s.indexOf('solomon')!;
    const x = s.cam.sx(s.X0[i]);
    const y = s.cam.sy(s.nodes[i].lane);
    expect(labels.knockTrail(s, p, i, { box: { x: x + 10, y: y - 8, w: 60, h: 16 }, side: 'r' }, 4)).toBe(null);
    const q = { ...p, offRibbon: () => true } as typeof p;
    const k = labels.knockTrail(s, q, i, { box: { x: x + 10, y: y - 8, w: 60, h: 16 }, side: 'r' }, 4)!;
    expect(k.x).toBeCloseTo(x + 4 + 1.5);
    expect(k.x + k.w).toBeCloseTo(x + 10 + 60 + labels.KNOCK_GAP - 1.5);
  });
});

describe('Иисус Христос на обзоре (MAP-81)', () => {
  it('подпись — слева от звезды, на уровне лент (над ними или под ними), без выноски', () => {
    const { sky: s } = drawSky();
    const b = s.labelStats().boxes.find((q) => q.kind === 'star' && q.id === 'iisus')!;
    expect(b).toBeTruthy();
    const i = s.indexOf('iisus')!;
    const x = s.cam.sx(s.X0[i]);
    const y = s.cam.sy(s.nodes[i].lane);
    expect(b.x + b.w).toBeLessThan(x);
    expect(x - (b.x + b.w)).toBeLessThan(24);
    // строка — рядом с осью лент: не дальше 40 px по вертикали
    expect(Math.abs(b.y + b.h / 2 - y)).toBeLessThan(40);
  });
});

describe('названия созвездий (MAP-58) и их границы (решение 52; VIS-77)', () => {
  it('на масштабе эпохи у большинства областей крупнее 150 × 60 px есть своё название', () => {
    for (const m of [window(-1000, 700), window(-1210, 700), window(-500, 700)]) {
      const { data } = drawSky({ move: m });
      const areas = (data.groupAreas ?? '').split('|').filter(Boolean);
      expect(areas.length).toBeGreaterThan(5);
      // 1 — название в самой области, 2 — у другой части того же созвездия (повтор не ближе 1 200 px), 0 — нет
      const named = areas.filter((a) => !a.endsWith(':0')).length;
      expect(named / areas.length).toBeGreaterThanOrEqual(0.8);
    }
  });
  it('граница — только отрезки по круглым годам и между полосами; клетки, касающиеся углом, — разные части', () => {
    // две клетки по диагонали: две части, у каждой четыре вершины
    const ring = { t: [0, 10, 10, 20, 20, 10, 10, 0], lane: [-0.4, -0.4, 0.6, 0.6, 1.4, 1.4, 0.4, 0.4] };
    const out = sky.orthoRings([ring], 10);
    expect(out.length).toBe(2);
    for (const r of out)
      for (let k = 0; k < r.t.length; k++) {
        const a = k;
        const b = (k + 1) % r.t.length;
        expect(r.t[a] === r.t[b] || r.lane[a] === r.lane[b]).toBe(true);
        expect(r.t[a] % 10).toBe(0);
        expect(Number.isInteger(r.lane[a] + 0.5)).toBe(true);
      }
    for (const o of atlas.models[0].outlines ?? []) {
      const rs = sky.orthoRings(o.rings.map((r) => ({ t: r.map((q) => q[0]), lane: r.map((q) => q[1]) })), 25);
      for (const r of rs) for (let k = 0; k < r.t.length; k++) expect(r.t[k] === r.t[(k + 1) % r.t.length] || r.lane[k] === r.lane[(k + 1) % r.t.length], o.group).toBe(true);
    }
  });
});

describe('знаки (решения 42, 38; MAP-77, MAP-69, IX-77)', () => {
  it('полый знак — только у лица «время не установлено»; расчётный год — сплошной знак', () => {
    const q = { id: 'x', sex: 'm' as const, kind: 'person', magnitude: 3, roles: [] as string[] };
    const look = { scale: 1, color: '#fff', halo: '#000' };
    expect(glyphs.personGlyph(q, false, 'calculated', look).hollow).toBe(false);
    expect(glyphs.personGlyph(q, false, 'estimated', look).hollow).toBe(false);
    expect(glyphs.personGlyph(q, false, 'epochal', look).hollow).toBe(true);
    // цари Иудеи на масштабе эпохи — сплошные (прежде Иорам, Иоафам и Амон были полыми)
    const m = atlas.models[0];
    for (const id of ['ioram-syn-iosafata', 'ioafam', 'amon-tsar', 'ezekiya', 'manassiya-tsar']) {
      const c = m.chrono.get(id);
      const p = atlas.byId.get(id)!;
      expect(glyphs.personGlyph(p, false, c?.cls, look).hollow, id).toBe(false);
    }
  });
  it('промежуток рождения лиц Нового Завета — растушёванная полоса слева от знака, до его года', () => {
    const { sky: s } = drawSky({ move: window(30, 120) });
    const m = atlas.models[0];
    const banded = m.nodes.filter((n) => n.band);
    expect(banded.length).toBeGreaterThan(10);
    for (const n of banded) {
      expect(n.band![0]).toBeLessThan(n.band![1]);
      expect(n.band![1]).toBeLessThanOrEqual(n.t0 + 1e-9);
    }
    void s;
  });
});

describe('номера у бусин — текст цветом своей ленты (решение 39): контраст текста не ниже 4,5 : 1 в обеих темах', () => {
  it('золотой и лазурный номер — ≥ 4,5 : 1 к небу и к полосе эпохи', async () => {
    const { separateRibbons, textTone } = await import('../src/render/dim.ts');
    const { contrast } = await import('../src/ui/contrast.ts');
    for (const theme of ['night', 'day'] as const) {
      const t = block(`:root[data-map='${theme}']`);
      const [gold1, , azure1] = separateRibbons([t['--gold-1'], t['--gold-2']], [t['--azure-1'], t['--azure-2']], t['--sky'], theme === 'night');
      const grounds = [t['--sky'], t['--sky-band']];
      for (const raw of [gold1, azure1]) {
        const c = textTone(raw, grounds, t['--ink']);
        for (const g of grounds) expect(contrast(c, g), `${theme}: ${c} на ${g}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('«только линии»: отводы — между показанными лицами, от следа родителя на нити (MAP-71)', () => {
  it('при широких строках у ребёнка родителя-бусины отвод идёт от полосы родителя на нити, а не от прежней', () => {
    const { sky: s } = drawSky({ move: window(-800, 700, 0, 3), state: { onlyLines: true } });
    let moved = 0;
    s.nodes.forEach((n, i) => {
      if (!n.layoutParent || n.parentLane === null || !s.drawn(i)) return;
      const pi = s.indexOf(n.layoutParent);
      if (pi === undefined || !s.drawn(pi)) return;
      if (s.nodes[pi] !== atlas.models[0].nodes[pi]) moved++;
      expect(n.parentLane, n.person).toBeCloseTo(s.nodes[pi].lane, 6);
    });
    expect(moved).toBeGreaterThan(5);
  });
});
