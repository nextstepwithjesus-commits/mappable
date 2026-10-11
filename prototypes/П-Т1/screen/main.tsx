/**
 * П-Т1, экран пробы (одноразовый код). Окно схемы — родная прокрутка контейнера (09 § 3.2.2);
 * слой рисунка — SVG или Canvas по видимому с запасом в пол-экрана (09 § 3.2.1 п. 2);
 * подписи — HTML-кнопки внутри прокручиваемого содержимого; фокус — по графу данных (09 § 3.2.3).
 * Параметры адреса: data=real|synth, render=auto|svg|svgpath|canvas, layer=tile|sticky,
 * pan=scroll|transform, text=1|2, k=1, at=david, thr=<число отрезков для перехода на Canvas>, twin=0|1,
 * zoom=css|rebuild (css — по умолчанию: масштаб слоя «мир» через transform: scale, без пересборки подписей на каждом кадре;
 * rebuild — пересборка слоя и подписей на каждом кадре масштаба, для сравнения).
 */
import { render } from 'preact';
import './styles.css';
import type { Forest } from '../core/forest.ts';
import { LABEL_PERSON, LABEL_REF, LABEL_SHELF, BASE, type Geometry } from '../core/layout.ts';
import { query, type Grid } from '../core/grid.ts';
import { zoomAt, contentSize, pad, reveal, clampK, type Camera, type Viewport } from '../core/camera.ts';
import { step, treePos, type Dir } from '../core/nav.ts';
import { measureAll } from './measure.ts';
import { svgMarkup, drawCanvas, type Renderer, type Colors, type DrawJob } from './draw.ts';
import { Twin } from './twin.tsx';
import { counters, domCounts, watchBlocks } from './probe.ts';

const T0 = performance.now();
const qs = new URLSearchParams(location.search);
/** Порог по пробе (README, «Вывод»): больше стольких отрезков в слое — Canvas. */
const DEFAULT_THR = 2500;
const opt = {
  dataset: (qs.get('data') === 'synth' ? 'synth' : 'real') as 'real' | 'synth',
  render: (qs.get('render') ?? 'auto') as Renderer | 'auto',
  layer: (qs.get('layer') === 'sticky' ? 'sticky' : 'tile') as 'tile' | 'sticky',
  pan: (qs.get('pan') === 'transform' ? 'transform' : 'scroll') as 'scroll' | 'transform',
  text: Number(qs.get('text') ?? 1),
  k: Number(qs.get('k') ?? 1),
  at: qs.get('at') ?? 'david',
  thr: Number(qs.get('thr') ?? DEFAULT_THR),
  twin: qs.get('twin') !== '0',
  // по итогу пробы — css по умолчанию (README, «Вывод»); rebuild — для сравнения
  zoom: (qs.get('zoom') === 'rebuild' ? 'rebuild' : 'css') as 'css' | 'rebuild',
};
const CSS = opt.zoom === 'css' && opt.layer !== 'sticky';
document.documentElement.style.setProperty('--text', String(opt.text));
if (qs.get('theme')) document.documentElement.dataset.theme = qs.get('theme')!;

interface State {
  forest: Forest;
  geom: Geometry;
  grid: Grid;
  cam: Camera;
  v: Viewport;
  region: { x0: number; y0: number; x1: number; y1: number; k: number; far: boolean } | null;
  renderer: Renderer;
  selected: number;
  focused: number;
  seenL: Uint8Array;
  seenS: Uint8Array;
  last: { labels: number; segs: number; elements: number; buildMs: number; builds: number; far: boolean; canvasMB: number };
  timings: Record<string, number>;
}
let S: State;

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="app">
    <p class="banner" id="banner">Данные не проверены: проба</p>
    <div class="bar">
      <h1>П-Т1 · лес Генеалогии</h1>
      <button type="button" id="out" aria-label="Мельче">−</button>
      <button type="button" id="in" aria-label="Крупнее">+</button>
      <span class="info" id="info" aria-live="off"></span>
      <span class="sr" id="live" aria-live="polite"></span>
    </div>
    <div class="viewport ${opt.pan === 'transform' ? 'transform' : ''}" id="vp" role="region" aria-label="Схема: лес Генеалогии">
      <div class="content" id="content">
        <div class="world ${CSS ? '' : 'flat'}" id="world">
          <div class="layer ${opt.layer === 'sticky' ? 'sticky' : ''}" id="layer" aria-hidden="true"></div>
          <div class="labels" id="labels" role="tree" aria-label="Лица леса"></div>
        </div>
      </div>
    </div>
  </div>
  <div id="twin"></div>`;
const vp = document.getElementById('vp')!;
const content = document.getElementById('content')!;
const layer = document.getElementById('layer')!;
const world = document.getElementById('world')!;
const labelsEl = document.getElementById('labels')!;
const info = document.getElementById('info')!;
const live = document.getElementById('live')!;
let svg: SVGSVGElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let colors: Colors;
const readColors = () => {
  const cs = getComputedStyle(document.documentElement);
  colors = { line: cs.getPropertyValue('--линия').trim(), ink: cs.getPropertyValue('--чернила').trim(), sel: cs.getPropertyValue('--выбор').trim() };
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); rebuild(); });

// ---------- раскладка в рабочем потоке ----------
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
function requestLayout(textScale: number): Promise<{ forest: Forest; geom: Geometry; grid: Grid; timings: Record<string, number>; measuredIn: string; banner?: string }> {
  return new Promise((resolve) => {
    const indexUrl = new URL('./index.json', location.href).href;
    worker.onmessage = async (e) => {
      if (e.data.needWidths) {
        // запасной путь: в рабочем потоке нет шрифтов — меряем на главном тем же шрифтом
        await document.fonts.ready;
        const ctx = document.createElement('canvas').getContext('2d')!;
        worker.postMessage({ indexUrl, dataset: opt.dataset, textScale, widthsFromMain: measureAll(ctx, e.data.texts, textScale) });
        return;
      }
      resolve(e.data);
    };
    worker.postMessage({ indexUrl, dataset: opt.dataset, textScale });
  });
}

// ---------- камера ----------
const nameFs = () => 14 * opt.text * S.cam.k;
const kLimits = () => ({ min: Math.min(1, (S.v.w / S.geom.width) * 0.9), max: 3 });

function setContentSize() {
  const c = contentSize(S.geom.width, S.geom.height, S.cam.k, S.v);
  content.style.width = c.w + 'px';
  content.style.height = c.h + 'px';
}

function applyCamera(c: Camera, kChanged: boolean) {
  S.cam = c;
  if (kChanged) setContentSize();
  if (CSS) {
    const p = pad(S.v);
    world.style.transform = `translate(${p.x}px, ${p.y}px) scale(${c.k})`;
    world.style.setProperty('--inv', String(1 / c.k));
  }
  if (opt.pan === 'scroll') {
    // округляем сами: WebKit отбрасывает дробную часть (ошибка якоря до 1 px по оси), Chromium округляет
    vp.scrollLeft = Math.round(c.sx);
    vp.scrollTop = Math.round(c.sy);
  } else {
    content.style.transform = `translate3d(${-c.sx}px, ${-c.sy}px, 0)`;
  }
  ensureRegion(kChanged && !CSS);
}

function viewWorld() {
  const p = pad(S.v), k = S.cam.k;
  return { x0: (S.cam.sx - p.x) / k, y0: (S.cam.sy - p.y) / k, x1: (S.cam.sx - p.x + S.v.w) / k, y1: (S.cam.sy - p.y + S.v.h) / k };
}

function ensureRegion(force: boolean) {
  const w = viewWorld();
  const r = S.region;
  if (opt.layer === 'sticky') { build(w); return; }
  const far = nameFs() < 12;
  // css: место подписей в мировых единицах — область годится при любом k, пока окно внутри, «издали» не сменилось
  // и Canvas не размыт (буфер нарисован для масштаба в пределах ×0,8…×1,25)
  const kOk = CSS ? r !== null && r.far === far && (S.renderer !== 'canvas' || (S.cam.k / r.k > 0.8 && S.cam.k / r.k < 1.25)) : r !== null && r.k === S.cam.k;
  if (!force && r && kOk && w.x0 >= r.x0 && w.y0 >= r.y0 && w.x1 <= r.x1 && w.y1 <= r.y1) return;
  const mx = (w.x1 - w.x0) / 2, my = (w.y1 - w.y0) / 2; // запас в пол-экрана (09 § 3.2.1 п. 2)
  build({ x0: w.x0 - mx, y0: w.y0 - my, x1: w.x1 + mx, y1: w.y1 + my });
}

// ---------- построение видимого ----------
function build(r: { x0: number; y0: number; x1: number; y1: number }) {
  const t = performance.now();
  const { geom, grid, forest, cam } = S;
  const s = opt.text;
  const far = nameFs() < 12; // имена мельче 12 px не бывают (03 § 3.3 п. 4): издали — точки без имён
  S.region = { ...r, k: cam.k, far };
  // в режиме css координаты слоя и подписей — мировые (масштаб делает transform у «мира»), иначе — экранные
  const k = CSS ? 1 : cam.k, p = CSS ? { x: 0, y: 0 } : pad(S.v);
  const q = query(grid, r.x0, r.y0, r.x1, r.y1, S.seenL, S.seenS);
  const renderer: Renderer = opt.render !== 'auto' ? opt.render : far || q.segs.length > opt.thr ? 'canvas' : 'svgpath';
  // слой рисунка
  const sticky = opt.layer === 'sticky';
  const lw = sticky ? S.v.w : Math.ceil((r.x1 - r.x0) * k), lh = sticky ? S.v.h : Math.ceil((r.y1 - r.y0) * k);
  const lx = sticky ? 0 : r.x0 * k + p.x, ly = sticky ? 0 : r.y0 * k + p.y;
  const job: DrawJob = {
    geom, forest, segs: q.segs, labels: q.labels, k, w: lw, h: lh, selected: S.selected, minR: 1.5 / (CSS ? cam.k : 1),
    ox: sticky ? cam.sx - p.x : r.x0 * k, oy: sticky ? cam.sy - p.y : r.y0 * k,
  };
  if (!sticky) layer.style.transform = `translate(${lx}px, ${ly}px)`;
  layer.style.width = lw + 'px';
  layer.style.height = lh + 'px';
  if (sticky) layer.style.marginBottom = -lh + 'px';
  let elements = 0;
  if (renderer === 'canvas') {
    if (svg) { svg.remove(); svg = null; }
    if (!canvas) { canvas = document.createElement('canvas'); layer.appendChild(canvas); }
    // css: буфер — под текущий масштаб (иначе размытие), не больше 4096 px по стороне
    const dpr = Math.min(Math.min(devicePixelRatio || 1, 2) * (CSS ? cam.k : 1), 4096 / Math.max(lw, lh));
    const cw = Math.round(lw * dpr), ch = Math.round(lh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    // css: элемент — экранного размера с обратным масштабом (иначе Chromium не рисует слой шириной в 100 000+ px)
    const ks = CSS ? cam.k : 1;
    canvas.style.width = lw * ks + 'px'; canvas.style.height = lh * ks + 'px';
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = CSS ? `scale(${1 / ks})` : '';
    drawCanvas(canvas.getContext('2d')!, job, dpr, colors, CSS ? 1 / cam.k : 1);
    elements = 1;
  } else {
    if (canvas) { canvas.remove(); canvas = null; }
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); layer.appendChild(svg); }
    svg.setAttribute('width', String(lw));
    svg.setAttribute('height', String(lh));
    const m = svgMarkup(job, renderer);
    svg.innerHTML = m.html;
    elements = m.elements;
  }
  S.renderer = renderer;
  // подписи: при «издали» — только значимость 4–5 и заголовки полок, без наложений
  let items = q.labels;
  if (far) items = farLabels(items);
  const pinned = [S.selected, S.focused].filter((x) => x >= 0).map((x) => geom.labelOfPerson[x]).filter((x) => x >= 0);
  for (const pi of pinned) if (!items.includes(pi)) items = [...items, pi]; // закреплённые не удаляются (09 § 3.2.3 п. 3)
  labelsEl.style.setProperty('--fs', String(14 * s * k));
  labelsEl.style.setProperty('--lh', String(20 * s * k));
  labelsEl.style.setProperty('--fs2', String(12 * s * k));
  labelsEl.style.setProperty('--lh2', String(16 * s * k));
  render(<Labels items={items} far={far} />, labelsEl);
  const ms = performance.now() - t;
  S.last = { labels: items.length, segs: q.segs.length, elements, buildMs: ms, builds: S.last.builds + 1, far, canvasMB: canvas ? (canvas.width * canvas.height * 4) / 2 ** 20 : 0 };
  info.textContent = `${renderer} · k ${cam.k.toFixed(2)} · подписей ${items.length} · отрезков ${q.segs.length}`;
}

function farLabels(items: number[]) {
  const { geom, forest } = S;
  const k = S.cam.k;
  const cand = items.filter((i) => geom.labels.kind[i] === LABEL_SHELF || (geom.labels.kind[i] === LABEL_PERSON && forest.persons[geom.labels.ref[i]].prom >= 4));
  cand.sort((a, b) => prio(b) - prio(a));
  const taken: [number, number, number, number][] = [];
  const out: number[] = [];
  for (const i of cand) {
    const x = (geom.labels.x[i] + BASE.glyph) * k + 6, y = geom.labels.y[i] * k;
    const w = forest.persons[geom.labels.ref[i]]?.name.length * 7.5 + 8 || 120, h = 18;
    if (taken.some(([a, b, c, d]) => x < c && x + w > a && y < d && y + h > b)) continue;
    taken.push([x, y, x + w, y + h]);
    out.push(i);
    if (out.length > 300) break;
  }
  return out;
  function prio(i: number) { return geom.labels.kind[i] === LABEL_SHELF ? 10 : forest.persons[geom.labels.ref[i]].prom; }
}

function Labels({ items, far }: { items: number[]; far: boolean }) {
  const { geom, forest } = S;
  const k = CSS ? 1 : S.cam.k, p = CSS ? { x: 0, y: 0 } : pad(S.v), s = opt.text;
  // издали подпись стоит в 6 px экрана справа от знака (имя мельче 12 px не показывается)
  const lead = far ? BASE.glyph * k + 6 / (CSS ? S.cam.k : 1) : (BASE.glyph + BASE.nameGap * s) * k;
  const tabbable = S.focused >= 0 ? S.focused : S.selected;
  return (
    <>
      {items.map((i) => {
        const kind = geom.labels.kind[i];
        const left = geom.labels.x[i] * k + p.x, top = geom.labels.y[i] * k + p.y;
        if (kind === LABEL_SHELF) {
          return <span key={'s' + i} class="n shelf" style={{ transform: `translate(${left}px, ${top}px)` }}>{forest.shelves[geom.labels.ref[i]].name}</span>;
        }
        if (kind === LABEL_REF) {
          const n = forest.nodes[geom.labels.ref[i]];
          return (
            <button key={'r' + i} type="button" tabIndex={-1} class="n ref" data-p={n.persons[0]} style={{ transform: `translate(${left + lead}px, ${top}px)` }}>
              {forest.persons[n.persons[0]].name}, муж: {forest.persons[n.refHusband!].name}
            </button>
          );
        }
        const person = geom.labels.ref[i];
        const pp = forest.persons[person];
        const pos = treePos(forest, person);
        return (
          <button key={i} type="button" role="treeitem" aria-level={pos.level} aria-setsize={pos.setsize} aria-posinset={pos.posinset}
            aria-selected={person === S.selected} tabIndex={person === tabbable || (tabbable < 0 && i === items[0]) ? 0 : -1}
            class={'n' + (person === S.selected ? ' sel' : '') + (far ? ' far' : '')} data-p={person}
            style={{ transform: `translate(${left + lead}px, ${top}px)` }}>
            <span class="t">{pp.name}</span>
            {!far && pp.note && <span class="s">{pp.note}</span>}
          </button>
        );
      })}
    </>
  );
}
const rebuild = () => S && ensureRegion(true);

// ---------- выбор и фокус ----------
let twinButtons = new Map<number, HTMLElement>();
function select(p: number) {
  const prev = S.selected;
  S.selected = p;
  labelsEl.querySelector(`.n.sel`)?.classList.remove('sel');
  const btn = labelsEl.querySelector<HTMLElement>(`button[data-p="${p}"][role="treeitem"]`);
  if (btn) { btn.classList.add('sel'); btn.setAttribute('aria-selected', 'true'); }
  twinButtons.get(prev)?.removeAttribute('aria-current');
  twinButtons.get(p)?.setAttribute('aria-current', 'true');
  live.textContent = `Выбрано: ${S.forest.persons[p].name}`;
  if (!btn) ensureRegion(true);
  else redrawLayerOnly();
}
function redrawLayerOnly() {
  // смена знака выбранного: перерисовка слоя без пересборки подписей (Canvas) или пересборка (SVG — дёшево)
  ensureRegion(true);
}

function focusPerson(p: number) {
  const li = S.geom.labelOfPerson[p];
  if (li < 0) return;
  S.focused = p;
  const g = S.geom.labels;
  const c2 = reveal(S.cam, S.v, { x: g.x[li], y: g.y[li], w: g.w[li], h: 36 * opt.text }, 24);
  const moved = c2.sx !== S.cam.sx || c2.sy !== S.cam.sy;
  if (moved) { applyCamera(c2, false); userScrolled = true; } // камера: «не дальше, чем нужно»
  else ensureRegion(true); // пересборка с закреплённой кнопкой
  labelsEl.querySelector<HTMLElement>(`button[data-p="${p}"][role="treeitem"]`)?.focus({ preventScroll: true });
}

labelsEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  const p = Number(b.dataset.p);
  select(p);
  S.focused = p;
});
labelsEl.addEventListener('keydown', (e) => {
  const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, Dir>)[e.key];
  if (!dir) return;
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  e.preventDefault();
  focusPerson(step(S.forest, Number(b.dataset.p), dir));
});

// ---------- прокрутка, щипок, «Крупнее / Мельче» ----------
let raf = 0;
const pending: { factor: number; fx: number; fy: number; t: number; pinch?: { k: number; mx: number; my: number; wx: number; wy: number } } = { factor: 1, fx: 0, fy: 0, t: 0 };
const zoomLatency: number[] = [];
const anchor: { li: number; gx: number; gy: number; maxErr: number; steps: number; log: number[][]; fx: number; fy: number; wx: number; wy: number; maxFocal: number } = { li: -1, gx: 0, gy: 0, maxErr: 0, steps: 0, log: [], fx: 0, fy: 0, wx: 0, wy: 0, maxFocal: 0 };
const schedule = () => { if (!raf) raf = requestAnimationFrame(tick); };
let userScrolled = true;
/**
 * Начало жеста после прокрутки читателем: камера берёт фактическую прокрутку браузера (он её округлил),
 * иначе якорь съедет на долю пикселя × масштаб. После своих шагов камера — истина: дробная, без накопления.
 */
function syncCam(_t: number) {
  if (userScrolled && opt.pan === 'scroll') S.cam = { ...S.cam, sx: vp.scrollLeft, sy: vp.scrollTop };
  userScrolled = false;
}
function tick(ts: number) {
  raf = 0;
  const lim = kLimits();
  if (pending.pinch) {
    const { k, mx, my, wx, wy } = pending.pinch;
    const kk = clampK(k, lim.min, lim.max), p = pad(S.v);
    applyCamera({ k: kk, sx: wx * kk + p.x - mx, sy: wy * kk + p.y - my }, kk !== S.cam.k);
    pending.pinch = undefined;
    focalNow(mx, my, wx, wy);
    zoomLatency.push(ts - pending.t); pending.t = 0;
    trackAnchor();
  } else if (pending.factor !== 1) {
    const kk = clampK(S.cam.k * pending.factor, lim.min, lim.max);
    pending.factor = 1;
    if (kk !== S.cam.k) applyCamera(zoomAt(S.cam, S.v, kk, pending.fx, pending.fy), true);
    focalNow(pending.fx, pending.fy);
    zoomLatency.push(ts - pending.t); pending.t = 0;
    trackAnchor();
  } else if (opt.pan === 'transform') {
    applyCamera(S.cam, false);
  } else {
    ensureRegion(false);
  }
}
/**
 * Точка пальцев сейчас. Щипок: точка рисунка, что была под серединой пальцев в начале жеста (по фактической
 * прокрутке), должна стоять под их серединой сейчас — пальцы могут и сдвинуться. Колесо: точка под указателем.
 */
function focalNow(fx: number, fy: number, wx?: number, wy?: number) {
  if (anchor.li < 0) return;
  const rect = vp.getBoundingClientRect();
  if (wx !== undefined && wy !== undefined) { anchor.wx = wx; anchor.wy = wy; }
  anchor.fx = rect.left + fx; anchor.fy = rect.top + fy;
}
function trackAnchor() {
  if (anchor.li < 0) return;
  const b = labelsEl.querySelector<HTMLElement>(`button[data-p="${S.geom.labels.ref[anchor.li]}"][role="treeitem"]`);
  if (!b) return;
  const r = b.getBoundingClientRect(), k = S.cam.k, s = opt.text;
  const gx = r.left - BASE.nameGap * s * k, gy = r.top + 10 * s * k;
  anchor.maxErr = Math.max(anchor.maxErr, Math.hypot(gx - anchor.gx, gy - anchor.gy));
  // точка рисунка под пальцами: экранное место по прямоугольнику содержимого (учитывает округление прокрутки браузером)
  const cr = content.getBoundingClientRect(), pp = pad(S.v);
  const ex = cr.left + anchor.wx * k + pp.x - anchor.fx, ey = cr.top + anchor.wy * k + pp.y - anchor.fy;
  anchor.maxFocal = Math.max(anchor.maxFocal, Math.hypot(ex, ey));
  anchor.log.push([+ex.toFixed(2), +ey.toFixed(2), +k.toFixed(4), +(gx - anchor.gx).toFixed(2), +(gy - anchor.gy).toFixed(2), +(S.cam.sx - vp.scrollLeft).toFixed(2), +(S.cam.sy - vp.scrollTop).toFixed(2)]);
  anchor.steps++;
}
function startAnchor(person: number, fx?: number, fy?: number) {
  anchor.li = S.geom.labelOfPerson[person];
  anchor.maxErr = 0; anchor.steps = 0; anchor.log = []; anchor.maxFocal = 0;
  const b = labelsEl.querySelector<HTMLElement>(`button[data-p="${person}"][role="treeitem"]`)!;
  const r = b.getBoundingClientRect(), k = S.cam.k, s = opt.text;
  anchor.gx = r.left - BASE.nameGap * s * k; anchor.gy = r.top + 10 * s * k;
  // точка пальцев — целые пиксели (так их подаёт и жест CDP); мировая точка под ней — от фактической прокрутки
  anchor.fx = fx ?? Math.round(anchor.gx); anchor.fy = fy ?? Math.round(anchor.gy);
  const cr = content.getBoundingClientRect(), pp = pad(S.v);
  anchor.wx = (anchor.fx - cr.left - pp.x) / k; anchor.wy = (anchor.fy - cr.top - pp.y) / k;
  return { x: anchor.fx, y: anchor.fy, gx: anchor.gx, gy: anchor.gy };
}

vp.addEventListener('scroll', () => {
  if (opt.pan !== 'scroll') return;
  // прокрутка пользователя или программы чтения: камера читает положение у браузера
  if (Math.abs(vp.scrollLeft - S.cam.sx) >= 1) { S.cam.sx = vp.scrollLeft; userScrolled = true; }
  if (Math.abs(vp.scrollTop - S.cam.sy) >= 1) { S.cam.sy = vp.scrollTop; userScrolled = true; }
  schedule();
}, { passive: true });
vp.addEventListener('wheel', (e) => {
  const rect = vp.getBoundingClientRect();
  if (e.ctrlKey) {
    // щипок на трекпаде (Chrome, Firefox) и Ctrl + колесо
    e.preventDefault();
    syncCam(e.timeStamp);
    pending.factor *= Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
    pending.fx = e.clientX - rect.left; pending.fy = e.clientY - rect.top;
    pending.t ||= e.timeStamp;
    schedule();
  } else if (opt.pan === 'transform') {
    e.preventDefault();
    S.cam = { ...S.cam, sx: S.cam.sx + e.deltaX, sy: S.cam.sy + e.deltaY };
    schedule();
  }
}, { passive: false });
// касание: два пальца — масштаб с якорем под серединой пальцев и сдвиг вместе с ней
let touch: { d0: number; k0: number; wx: number; wy: number } | null = null;
let drag: { x: number; y: number; id: number } | null = null;
const mid = (t: TouchList, rect: DOMRect) => ({ x: (t[0].clientX + t[1].clientX) / 2 - rect.left, y: (t[0].clientY + t[1].clientY) / 2 - rect.top, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) });
vp.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 2) return;
  syncCam(-1e9);
  const m = mid(e.touches, vp.getBoundingClientRect()), p = pad(S.v);
  touch = { d0: m.d, k0: S.cam.k, wx: (S.cam.sx + m.x - p.x) / S.cam.k, wy: (S.cam.sy + m.y - p.y) / S.cam.k };
}, { passive: true });
vp.addEventListener('touchmove', (e) => {
  if (!touch || e.touches.length !== 2) return;
  e.preventDefault();
  const m = mid(e.touches, vp.getBoundingClientRect());
  pending.pinch = { k: touch.k0 * (m.d / touch.d0), mx: m.x, my: m.y, wx: touch.wx, wy: touch.wy };
  pending.t ||= e.timeStamp;
  schedule();
}, { passive: false });
vp.addEventListener('touchend', (e) => { if (e.touches.length < 2) touch = null; });
// Safari на macOS: щипок трекпада приходит событиями gesture*
let gesture: { k0: number; wx: number; wy: number } | null = null;
vp.addEventListener('gesturestart', (e) => {
  e.preventDefault();
  const ge = e as unknown as { clientX: number; clientY: number };
  syncCam(-1e9);
  const rect = vp.getBoundingClientRect(), p = pad(S.v);
  gesture = { k0: S.cam.k, wx: (S.cam.sx + ge.clientX - rect.left - p.x) / S.cam.k, wy: (S.cam.sy + ge.clientY - rect.top - p.y) / S.cam.k };
});
vp.addEventListener('gesturechange', (e) => {
  if (!gesture) return;
  e.preventDefault();
  const ge = e as unknown as { clientX: number; clientY: number; scale: number; timeStamp: number };
  const rect = vp.getBoundingClientRect();
  pending.pinch = { k: gesture.k0 * ge.scale, mx: ge.clientX - rect.left, my: ge.clientY - rect.top, wx: gesture.wx, wy: gesture.wy };
  pending.t ||= ge.timeStamp;
  schedule();
});
vp.addEventListener('gestureend', () => { gesture = null; });
// сдвиг перетаскиванием — только в режиме transform (для сравнения; при родной прокрутке его делает браузер)
vp.addEventListener('pointerdown', (e) => { if (opt.pan === 'transform' && e.isPrimary) drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
vp.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  S.cam = { ...S.cam, sx: S.cam.sx - (e.clientX - drag.x), sy: S.cam.sy - (e.clientY - drag.y) };
  drag.x = e.clientX; drag.y = e.clientY;
  schedule();
});
vp.addEventListener('pointerup', () => (drag = null));

/** «Крупнее / Мельче»: одно движение 250 мс, якорь — выбранное лицо (если видно) или середина окна. */
function zoomButton(factor: number) {
  syncCam(-1e9);
  const from = S.cam.k, lim = kLimits();
  const to = clampK(from * factor, lim.min, lim.max);
  let fx = S.v.w / 2, fy = S.v.h / 2;
  const li = S.selected >= 0 ? S.geom.labelOfPerson[S.selected] : -1;
  if (li >= 0) {
    const p = pad(S.v);
    const gx = (S.geom.labels.x[li] + BASE.glyph) * from + p.x - S.cam.sx, gy = (S.geom.labels.y[li] + 10 * opt.text) * from + p.y - S.cam.sy;
    if (gx >= 0 && gx <= S.v.w && gy >= 0 && gy <= S.v.h) { fx = gx; fy = gy; }
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now(), dur = reduce ? 0 : 250;
  const frame = (t: number) => {
    const a = dur ? Math.min(1, (t - t0) / dur) : 1;
    const e = 1 - (1 - a) ** 3;
    const k = from * (to / from) ** e;
    applyCamera(zoomAt(S.cam, S.v, k, fx, fy), true);
    trackAnchor();
    if (a < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
document.getElementById('in')!.addEventListener('click', () => zoomButton(1.25));
document.getElementById('out')!.addEventListener('click', () => zoomButton(0.8));
addEventListener('resize', () => {
  if (!S) return;
  S.v = { w: vp.clientWidth, h: vp.clientHeight };
  setContentSize();
  applyCamera(S.cam, true);
});

// ---------- запуск ----------
async function start() {
  const tReq = performance.now();
  const fonts = Promise.all([document.fonts.load('500 14px "PT1 Literata"', 'Давид'), document.fonts.load('450 12px "PT1 Golos"', 'сын')]);
  const res = await requestLayout(opt.text);
  const tGot = performance.now();
  await fonts; // первая раскладка ждёт шрифт подписей (09 § 3.3)
  const tFonts = performance.now();
  readColors();
  document.getElementById('banner')!.textContent = res.banner ?? 'Данные не проверены: проба';
  S = {
    forest: res.forest, geom: res.geom, grid: res.grid, cam: { k: opt.k, sx: 0, sy: 0 },
    v: { w: vp.clientWidth, h: vp.clientHeight }, region: null, renderer: 'svgpath', selected: -1, focused: -1,
    seenL: new Uint8Array(res.geom.labels.count), seenS: new Uint8Array(res.geom.segCount),
    last: { labels: 0, segs: 0, elements: 0, buildMs: 0, builds: 0, far: false, canvasMB: 0 },
    timings: { ...res.timings, workerTotal: tGot - tReq, fontsWait: tFonts - tGot },
  };
  const at = S.forest.persons.findIndex((p) => p.id === opt.at);
  const li = S.geom.labelOfPerson[at >= 0 ? at : 0];
  const p = pad(S.v);
  setContentSize();
  const tB = performance.now();
  applyCamera({ k: opt.k, sx: (S.geom.labels.x[li] + 40) * opt.k + p.x - S.v.w / 2, sy: S.geom.labels.y[li] * opt.k + p.y - S.v.h / 2 }, true);
  S.timings.firstBuild = performance.now() - tB;
  let twinMs = 0;
  if (opt.twin) {
    const tw = performance.now();
    render(<Twin forest={S.forest} onPick={(pp) => { select(pp); focusPerson(pp); }} />, document.getElementById('twin')!);
    twinButtons = new Map([...document.querySelectorAll<HTMLElement>('.blk button')].map((b) => [Number(b.dataset.p), b]));
    watchBlocks(document.querySelectorAll('.blk'));
    twinMs = performance.now() - tw;
  }
  S.timings.twin = twinMs;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  S.timings.firstFrameFromRequest = performance.now() - tReq;
  S.timings.firstFrameFromNav = performance.now();
  S.timings.moduleStart = T0;
  S.timings.measuredInWorker = res.measuredIn === 'worker' ? 1 : 0;
  readyResolve();
}
let readyResolve!: () => void;
const ready = new Promise<void>((r) => (readyResolve = r));

// ---------- API для скрипта замеров ----------
const api = {
  ready,
  opt,
  counters,
  state: () => ({ k: S.cam.k, sx: S.cam.sx, sy: S.cam.sy, renderer: S.renderer, last: S.last, v: S.v, geomW: S.geom.width, geomH: S.geom.height, persons: S.forest.stats.inForest, timings: S.timings, selected: S.selected }),
  dom: () => domCounts([...document.querySelectorAll('.blk')], document.getElementById('vp')!),
  /** Экранная точка знака лица (центр). */
  glyphOf(id: string) {
    const pi = S.forest.persons.findIndex((x) => x.id === id);
    const li = S.geom.labelOfPerson[pi];
    const p = pad(S.v), rect = vp.getBoundingClientRect();
    return { x: rect.left + (S.geom.labels.x[li] + BASE.glyph) * S.cam.k + p.x - S.cam.sx, y: rect.top + (S.geom.labels.y[li] + 10 * opt.text) * S.cam.k + p.y - S.cam.sy, person: pi };
  },
  centerOn(id: string, k = S.cam.k) {
    const pi = S.forest.persons.findIndex((x) => x.id === id);
    const li = S.geom.labelOfPerson[pi], p = pad(S.v);
    applyCamera({ k, sx: (S.geom.labels.x[li] + 40) * k + p.x - S.v.w / 2, sy: S.geom.labels.y[li] * k + p.y - S.v.h / 2 }, true);
    userScrolled = true;
  },
  fitAll() { const lim = kLimits(); const p = pad(S.v); applyCamera({ k: lim.min, sx: p.x, sy: p.y }, true); userScrolled = true; },
  startAnchor: (id: string, exact = false) => { const pi = S.forest.persons.findIndex((x) => x.id === id); const a = startAnchor(pi); return exact ? startAnchor(pi, a.gx, a.gy) : a; },
  anchor: () => ({ maxFocal: anchor.maxFocal, maxGlyph: anchor.maxErr, steps: anchor.steps, log: anchor.log.slice(0, 400) }),
  stopAnchor: () => { anchor.li = -1; },
  zoomLatency: () => { const v = [...zoomLatency].sort((a, b) => a - b); zoomLatency.length = 0; return { n: v.length, p75: v[Math.floor(v.length * 0.75)] ?? 0, max: v[v.length - 1] ?? 0 }; },
  select: (id: string) => select(S.forest.persons.findIndex((x) => x.id === id)),
  focus: (id: string) => focusPerson(S.forest.persons.findIndex((x) => x.id === id)),
  focusedId: () => { const b = document.activeElement as HTMLElement | null; const p = b?.dataset?.p; return p ? S.forest.persons[+p].id : null; },
  expectStep: (id: string, dir: Dir) => S.forest.persons[step(S.forest, S.forest.persons.findIndex((x) => x.id === id), dir)].id,
  isVisible(id: string) {
    const b = labelsEl.querySelector<HTMLElement>(`button[data-p="${S.forest.persons.findIndex((x) => x.id === id)}"][role="treeitem"]`);
    if (!b) return false;
    const r = b.getBoundingClientRect(), v = vp.getBoundingClientRect();
    return r.left >= v.left - 1 && r.right <= v.right + 1 && r.top >= v.top - 1 && r.bottom <= v.bottom + 1;
  },
  async relayout(text: number) {
    const t = performance.now();
    opt.text = text;
    document.documentElement.style.setProperty('--text', String(text));
    await document.fonts.load(`500 ${14 * text}px "PT1 Literata"`, 'Давид');
    const res = await requestLayout(text);
    const keep = S.selected >= 0 ? S.forest.persons[S.selected].id : (S.forest.persons.find((x) => x.id === opt.at) ?? S.forest.persons[0]).id;
    S.geom = res.geom; S.grid = res.grid; S.region = null;
    S.seenL = new Uint8Array(res.geom.labels.count); S.seenS = new Uint8Array(res.geom.segCount);
    S.v = { w: vp.clientWidth, h: vp.clientHeight };
    api.centerOn(keep, S.cam.k);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ms: performance.now() - t, worker: res.timings };
  },
  setRender(r: Renderer | 'auto') { opt.render = r; ensureRegion(true); },
  /**
   * Цена кадра пересборки слоя (как на каждом кадре щипка или «липкого» слоя): пересборка в начале кадра,
   * длительность кадра — до следующего requestAnimationFrame (включает стиль, раскладку и отрисовку SVG).
   */
  async costStep(r: Renderer, reps = 9) {
    opt.render = r;
    const frames: number[] = [], builds: number[] = [];
    for (let i = 0; i < reps; i++) {
      const dt = await new Promise<number>((res) => requestAnimationFrame((t0) => {
        S.cam = { ...S.cam, sx: S.cam.sx + (i % 2 ? 1 : -1) };
        ensureRegion(true);
        builds.push(S.last.buildMs);
        requestAnimationFrame((t1) => res(t1 - t0));
      }));
      frames.push(dt);
    }
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    return { render: r, segs: S.last.segs, labels: S.last.labels, elements: S.last.elements, buildMs: +med(builds).toFixed(2), frameMs: +med(frames).toFixed(1), frameMax: +Math.max(...frames).toFixed(1), canvasMB: +S.last.canvasMB.toFixed(1) };
  },
  setThreshold(n: number) { opt.thr = n; ensureRegion(true); },
};
(window as unknown as { __probe: typeof api }).__probe = api;
start();
