/**
 * COLLISION STRESS (этап 14, решение 158): постоянный набор регрессии столкновений на НАСТОЯЩЕЙ отрисовке неба. Вырос
 * из замера эксперта C (docs/ui-review/stage14/c.md); сцены — его раздел 5, пороги — К1–К8 приёмки STAGE14 § 4.
 *
 *   npm run -s collide                                   # все сцены на сборке dist/, отчёт в .ui-shots/collide/
 *   npx tsx tools/collide.ts --dist .ui-build/s2 --port 4812 [--out <каталог>] [--scenes a,b] [--shots] [--dump]
 *   npx tsx tools/collide.ts --list                      # сцены и адреса
 *
 * Код выхода 1, если в какой-либо сцене нарушен порог К1–К8 (нарушения печатаются по сценам и порогам). Отчёт:
 * <out>/collide.json (все числа и находки) и <out>/collide.md (таблица по сценам, пороги, до пяти примеров на класс).
 * Прогон всех сцен — около 10 минут (≈ 11 с на сцену). Адрес «#/лицо~wN» без «~y» подстраивается так, что звезда
 * выбранного стоит на 30 % ширины (поле at) и по середине высоты; в отчёт пишется получившийся адрес.
 *
 * Как меряет. В страницу до загрузки ставится запись холста (REC): обёртки методов CanvasRenderingContext2D на холсте
 * `.sky > canvas` пишут каждый кадр — пути (moveTo/lineTo/arc/кривые) со stroke/fill, текст (fillText/strokeText) с
 * настоящими метриками шрифта (measureText: actualBoundingBox*), fillRect (гашения под подписями), clip, save/restore,
 * преобразование. Кадр начинается заливкой всего холста (sky.ts, draw). Запись — независимая от модели границ атласа
 * (labels.ts, Placer/textBox): границы берутся из того, что реально нарисовано.
 *
 * Разбор кадра:
 *  — знаки лиц: блок save…restore, чей первый рисунок — подложка цвета неба (glyphs.ts, drawGlyph); видимые части —
 *    диск, кольцо женщины, точки народа, черта царя, †, восьмилучевая звезда; лицо — по #sky-stars (data-x/y);
 *  — ромбы союзов и узлы • — по журналу связей canvas[data-links] (node|join);
 *  — текст: прямоугольники глифов по actualBoundingBox; подписи лиц — по canvas[data-label-boxes] (части имени,
 *    уточнения, сокращения роли, «+N» собираются в одну подпись), прочее — строки по базовой линии;
 *  — линии: stroke вне знаков; вид по цвету — sel (жёлтая выбранная связь), ribbon (золото/лазурь), kin (золотистые
 *    дуги), ring (кольца), map (сетка, контуры, меридианы: --ink-3, --rule), trail (след), link (совпадает с путём из
 *    canvas[data-links]), line (прочее). Гашения fillRect цвета неба после линии и вырезы clip учтены.
 *
 * Классы (request.md): 1 знак↔знак; 2 знак↔чужое имя (и ромб под именем); 3 подпись↔подпись (по глифам); 5 линия через
 * текст (длина внутри глифов ≥ 2 px; отдельно — нарисованная ПОСЛЕ текста, т. е. поверх); 7 UI↔граф (HTML-оверлеи поверх
 * выбранного, его имени, концов связи, семьи; звёзды и имена под оверлеями); принадлежность — чужая звезда ближе к имени,
 * чем своя; точность границ — глифы против прямоугольников Placer; кольцо выбранного у его имени; длина выносок.
 *
 * Пороги (STAGE14 § 4):
 *  К1 яркие знаки друг на друге — 0;
 *  К2 имя лица на чужом знаке (и название созвездия на знаке); подпись на подписи по глифам; слитые подписи — 0; 0; 0;
 *  К3 линии, нарисованные поверх текста; имя выбранного перечёркнуто — 0; 0;
 *  К4′ (этап 16, решение 184): имя основателя у устья (canvas[data-mouths]) — вместо «далеко» и «принадлежности» своя
 *     проверка: рамка на своём следе за концом перехода (≤ 6 px), у звезды нет второй подписи, путь «звезда — след —
 *     переход — имя» не прерван чужой подписью, имя не дальше конца перехода + ширины имени; счёт — отдельной строкой.
 *  К4 принадлежность: чужой знак ближе, вплотную, выноска с чужим ближе, далеко без выноски, у подписи у ромба чужой
 *     знак ближе её точки (решение 160) — 0;
 *  К5 связь, лента, дуга или жёлтая связь через середину строки имени лица — не больше 2 % имён сцены; связь и выбранная
 *     связь — по всей строке, и замаскированные тоже (решение 163); разрыв чужой линии по всей рамке имени верхней ступени
 *     164 + 3 px — отдельной строкой, не нарушение;
 *  К6 имена семьи под оверлеем; срезанные краем оверлея подписи — 0; 0;
 *  К7 зазор от кольца выбранного до его имени — не меньше 2 px;
 *  К8 выносок длиннее 40 px — 0, кроме опорных лиц величины 0 на обзоре без выбранного (до 100 px, Иисус Христос —
 *     до 160 px; они считаются отдельно — «опорных до 100 px»).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { session, SHOTS } from './ui-kit.ts';
import { ROOT } from './bible.ts';

// ---------- запись холста в странице ----------

const REC = String.raw`window.__name = window.__name || ((f) => f);
(() => {
  const P = CanvasRenderingContext2D.prototype;
  const R = (window.__C = { cur: [], on: true });
  const sky = (c) => { const cv = c.canvas; if (cv.__sky !== undefined) return cv.__sky; if (!cv.isConnected) return false; return (cv.__sky = !!(cv.parentElement && cv.parentElement.classList.contains('sky'))); };
  const T = (c) => { const m = c.getTransform(); return [m.a, m.b, m.c, m.d, m.e, m.f]; };
  // градиент — «grad:» и цвет его середины (лента — золото и лазурь; растушёванный след — цвет следа): addColorStop пишет
  // точки в сам градиент
  const G = CanvasGradient.prototype; const AC = G.addColorStop;
  G.addColorStop = function (o, c) { (this.__s || (this.__s = [])).push(String(c)); return AC.apply(this, arguments); };
  const col = (s) => (typeof s === 'string' ? s : 'grad:' + ((s && s.__s && s.__s[s.__s.length >> 1]) || ''));
  const np = () => ({ sub: [], arcs: [] });
  const P0 = (c) => c.__p || (c.__p = np());
  const last = (p) => { if (!p.sub.length) p.sub.push([]); return p.sub[p.sub.length - 1]; };
  // свет под кадр (src/render/light.ts, paintUnder: destination-over) — под всем нарисованным, кадр он не закрывает;
  // подложки — вырезы (destination-out) цветом неба: в замере — подложка, как прежде заливка неба
  const W = (name, f) => { const o = P[name]; if (!o) return; P[name] = function () { if (R.on && sky(this) && this.globalCompositeOperation !== 'destination-over') { try { f(this, arguments); } catch (e) {} } return o.apply(this, arguments); }; };
  W('beginPath', (c) => { c.__p = np(); });
  W('moveTo', (c, a) => { P0(c).sub.push([a[0], a[1]]); });
  W('lineTo', (c, a) => { last(P0(c)).push(a[0], a[1]); });
  W('closePath', (c) => { const s = last(P0(c)); if (s.length >= 2) s.push(s[0], s[1]); });
  W('rect', (c, a) => { const x = a[0], y = a[1], w = a[2], h = a[3]; P0(c).sub.push([x, y, x + w, y, x + w, y + h, x, y + h, x, y]); });
  W('arc', (c, a) => {
    const x = a[0], y = a[1], r = a[2]; let s0 = a[3], s1 = a[4]; const p = P0(c); p.arcs.push([x, y, r]);
    if (a[5]) { const t = s0; s0 = s1; s1 = t; }
    let span = s1 - s0; while (span < 0) span += Math.PI * 2; if (Math.abs(a[4] - a[3]) >= Math.PI * 2 - 1e-6) span = Math.PI * 2;
    const n = Math.max(4, Math.ceil(span / (Math.PI / 8))); const s = last(p);
    for (let k = 0; k <= n; k++) { const t = s0 + (span * k) / n; s.push(x + Math.cos(t) * r, y + Math.sin(t) * r); }
  });
  W('ellipse', (c, a) => { const x = a[0], y = a[1], rx = a[2], ry = a[3]; const s = last(P0(c)); for (let k = 0; k <= 16; k++) { const t = (Math.PI * 2 * k) / 16; s.push(x + Math.cos(t) * rx, y + Math.sin(t) * ry); } });
  W('arcTo', (c, a) => { last(P0(c)).push(a[0], a[1]); });
  W('quadraticCurveTo', (c, a) => { const s = last(P0(c)); const x0 = s[s.length - 2], y0 = s[s.length - 1]; for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; s.push(u * u * x0 + 2 * u * t * a[0] + t * t * a[2], u * u * y0 + 2 * u * t * a[1] + t * t * a[3]); } });
  W('bezierCurveTo', (c, a) => { const s = last(P0(c)); const x0 = s[s.length - 2], y0 = s[s.length - 1]; for (let k = 1; k <= 10; k++) { const t = k / 10, u = 1 - t; s.push(u*u*u*x0 + 3*u*u*t*a[0] + 3*u*t*t*a[2] + t*t*t*a[4], u*u*u*y0 + 3*u*u*t*a[1] + 3*u*t*t*a[3] + t*t*t*a[5]); } });
  W('stroke', (c) => { const p = P0(c); R.cur.push({ k: 'S', sub: p.sub, arcs: p.arcs, lw: c.lineWidth, col: col(c.strokeStyle), a: c.globalAlpha, dash: c.getLineDash().length > 0, M: T(c) }); });
  W('fill', (c) => { const p = P0(c); R.cur.push({ k: 'F', sub: p.sub, arcs: p.arcs, col: col(c.fillStyle), a: c.globalAlpha, M: T(c) }); });
  W('clip', (c, a) => { R.cur.push({ k: 'C', sub: P0(c).sub, rule: typeof a[0] === 'string' ? a[0] : 'nonzero', M: T(c) }); });
  W('save', () => { R.cur.push({ k: '(' }); });
  W('restore', () => { R.cur.push({ k: ')' }); });
  W('fillRect', (c, a) => {
    const M = T(c);
    if (a[0] === 0 && a[1] === 0 && a[2] * M[0] >= c.canvas.width - 2 && a[3] * M[3] >= c.canvas.height - 2) R.cur = [];
    R.cur.push({ k: 'R', x: a[0], y: a[1], w: a[2], h: a[3], col: col(c.fillStyle), a: c.globalAlpha, M });
  });
  W('strokeRect', (c, a) => { const x = a[0], y = a[1], w = a[2], h = a[3]; R.cur.push({ k: 'S', sub: [[x, y, x + w, y, x + w, y + h, x, y + h, x, y]], arcs: [], lw: c.lineWidth, col: col(c.strokeStyle), a: c.globalAlpha, dash: c.getLineDash().length > 0, M: T(c) }); });
  const TX = (m) => (c, a) => {
    const t = String(a[0]); const mt = c.measureText(t);
    R.cur.push({ k: 'T', m, text: t, x: a[1], y: a[2], font: c.font, ls: c.letterSpacing || '', al: c.textAlign, bl: c.textBaseline,
      col: col(m === 'f' ? c.fillStyle : c.strokeStyle), lw: c.lineWidth, a: c.globalAlpha, M: T(c),
      bb: [mt.actualBoundingBoxLeft, mt.actualBoundingBoxRight, mt.actualBoundingBoxAscent, mt.actualBoundingBoxDescent, mt.width] });
  };
  W('fillText', TX('f'));
  W('strokeText', TX('s'));
  // начало кадра со светом — очистка холста (свет ляжет под кадр в его конце)
  W('clearRect', (c, a) => {
    const M = T(c);
    if (a[0] <= 0 && a[1] <= 0 && a[2] * M[0] >= c.canvas.width - 2 && a[3] * M[3] >= c.canvas.height - 2) R.cur = [];
  });
  W('drawImage', (c, a) => {
    const M = T(c);
    const img = a[0];
    const n = a.length;
    const dx = n >= 9 ? a[5] : a[1], dy = n >= 9 ? a[6] : a[2];
    const dw = n >= 9 ? a[7] : n >= 5 ? a[3] : img && img.width, dh = n >= 9 ? a[8] : n >= 5 ? a[4] : img && img.height;
    const x0 = M[0] * dx + M[4], y0 = M[3] * dy + M[5], x1 = M[0] * (dx + dw) + M[4], y1 = M[3] * (dy + dh) + M[5];
    if (x0 <= 1 && y0 <= 1 && x1 >= c.canvas.width - 1 && y1 >= c.canvas.height - 1) R.cur = [];
    R.cur.push({ k: 'I' });
  });
})();`;

/** Состояние страницы и кадр: всё в px холста (CSS). */
async function grab(p: Page) {
  return p.evaluate(() => {
    const sky = document.querySelector('.sky') as HTMLElement;
    const cv = sky.querySelector('canvas') as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const ds = cv.dataset;
    const sd = sky.dataset;
    const stars = [...document.querySelectorAll<HTMLElement>('#sky-stars button[data-x]')].map((b) => ({ id: b.id.replace(/^sky-star-/, ''), x: +b.dataset.x!, y: +b.dataset.y! }));
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    const pal = { sky: v('--sky'), halo: v('--halo'), band: v('--sky-band'), focus: v('--focus'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), rule: v('--rule'), ruleStrong: v('--rule-strong') };
    // HTML поверх холста: видимые элементы с фоном или своим текстом, чей прямоугольник заходит на холст
    const ui: { tag: string; cls: string; x: number; y: number; w: number; h: number; bg: boolean; text: string }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el === cv || el.contains(cv) || el.closest('#sky-stars, .visually-hidden')) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      if (b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom) continue;
      const vis = (el as unknown as { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
      if (!vis) continue;
      const st = getComputedStyle(el);
      const bg = st.backgroundColor;
      const hasBg = !!bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg);
      const text = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
      if (!hasBg && !text && el.tagName !== 'svg' && el.tagName !== 'IMG') continue;
      const cls = typeof el.className === 'string' ? el.className : ((el.className as unknown as { baseVal?: string })?.baseVal ?? '');
      ui.push({ tag: el.tagName.toLowerCase(), cls, x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height, bg: hasBg, text: text ? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50) : '' });
    }
    const dc = document.querySelector<HTMLElement>('.sky .dotcard');
    const dcr = dc?.getBoundingClientRect();
    const C = (window as unknown as { __C: { cur: unknown[] } }).__C;
    return {
      ops: C.cur as unknown[],
      dpr: devicePixelRatio,
      cw: r.width,
      ch: r.height,
      cx: r.left,
      cy: r.top,
      view: sd.view ?? '',
      labels: sd.labels ?? '',
      overlapPairs: sd.overlapPairs ?? '',
      sel: sd.sel ?? '',
      selId: document.documentElement.dataset.selected ?? location.hash.replace(/^#\//, '').split('~')[0],
      labelBoxes: ds.labelBoxes ?? '',
      piles: ds.piles ?? '',
      hidden: ds.hidden ?? '',
      starsAt: ds.starsAt ?? '',
      links: ds.links ?? '',
      glides: ds.glides ?? '',
      linkSel: ds.linkSel ?? '',
      plateTexts: ds.plateTexts ?? '',
      plateBoxes: ds.plateBoxes ?? '',
      dots: ds.dots ?? '',
      motherNames: ds.motherNames ?? '',
      cutNames: ds.cutNames ?? '',
      mouths: ds.mouths ?? '',
      linkTexts: ds.linkTexts ?? '',
      notes: ds.notes ?? '',
      named: ds.named ?? '',
      detail: ds.detail ?? '',
      stars,
      pal,
      ui,
      dotcard: dc && dcr ? { x: dcr.left - r.left, y: dcr.top - r.top, w: dcr.width, h: dcr.height, bounds: dc.dataset.bounds ?? '', must: dc.dataset.must ?? '', placed: dc.dataset.placed ?? '' } : null,
      hash: location.hash,
    };
  });
}
type Grab = Awaited<ReturnType<typeof grab>>;

// ---------- геометрия ----------

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const inter = (a: Box, b: Box, m = 0) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > m && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > m;
const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const inflate = (a: Box, d: number): Box => ({ x0: a.x0 - d, y0: a.y0 - d, x1: a.x1 + d, y1: a.y1 + d });
/** Расстояние от точки до прямоугольника (0 — внутри). */
const distBox = (x: number, y: number, b: Box) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
/** Длина части отрезка внутри прямоугольника (отсечение Лианга — Барски). */
function clipLen(ax: number, ay: number, bx: number, by: number, b: Box): number {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const P = [-dx, dx, -dy, dy];
  const Q = [ax - b.x0, b.x1 - ax, ay - b.y0, b.y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) {
      if (Q[i] < 0) return 0;
      continue;
    }
    const t = Q[i] / P[i];
    if (P[i] < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}
/** Середина части отрезка внутри прямоугольника. */
function clipMid(ax: number, ay: number, bx: number, by: number, b: Box): [number, number] {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const P = [-dx, dx, -dy, dy];
  const Q = [ax - b.x0, b.x1 - ax, ay - b.y0, b.y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) continue;
    const t = Q[i] / P[i];
    if (P[i] < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  const t = (t0 + t1) / 2;
  return [ax + dx * t, ay + dy * t];
}
/** Круг (cx, cy, r) задевает прямоугольник. */
const circleBox = (cx: number, cy: number, r: number, b: Box) => distBox(cx, cy, b) < r;

/** Цвет → [r, g, b, a] (0–255, 0–1). */
function rgba(c: string): [number, number, number, number] | null {
  c = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(c);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1];
  m = /^#([0-9a-f]{3})$/.exec(c);
  if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
  m = /^rgba?\(([^)]*)\)$/.exec(c);
  if (m) {
    const q = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1];
  }
  return null;
}
const same = (a: string, b: string) => {
  const x = rgba(a);
  const y = rgba(b);
  return !!x && !!y && Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 8;
};
function hue(c: string): { h: number; s: number; l: number } | null {
  const q = rgba(c);
  if (!q) return null;
  const [r, g, b] = q.map((x, i) => (i < 3 ? x / 255 : x));
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

// ---------- разбор кадра ----------

interface Op {
  k: string;
  sub?: number[][];
  arcs?: number[][];
  lw?: number;
  col?: string;
  a?: number;
  dash?: boolean;
  M?: number[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  m?: string;
  font?: string;
  ls?: string;
  al?: string;
  bl?: string;
  bb?: number[];
  rule?: string;
}

interface Glyph {
  i: number;
  x: number;
  y: number;
  /** видимые части: диски [x, y, r] и отрезки [x0, y0, x1, y1, полутолщина] */
  discs: number[][];
  segs: number[][];
  /** радиус охвата видимых частей от центра */
  ext: number;
  a: number;
  ghost: boolean;
  id?: string;
}
interface Text {
  i: number;
  text: string;
  box: Box;
  a: number;
  halo: boolean;
  size: number;
  /** чья подпись: star:<id> или run:<n> */
  owner: string;
  rot: boolean;
}
interface Line {
  i: number;
  kind: string;
  segs: number[][];
  lw: number;
  a: number;
  dash: boolean;
  /** вырезы clip (выбранная связь не рисуется под подписями) */
  holes: Box[];
  /** цвет (для разбора находок) */
  col: string;
  /** ключ связи из журнала (canvas[data-links]), если линия — связь */
  ks?: string;
}

/** Цвет операции; у градиента — цвет его середины (REC: «grad:цвет»), без точек — «grad». */
const colOf = (c: string) => (c.startsWith('grad:') ? c.slice(5) || 'grad' : c);
const alphaOf = (o: Op) => (rgba(colOf(o.col ?? ''))?.[3] ?? 1) * (o.a ?? 1);

function parse(g: Grab) {
  const ops = g.ops as Op[];
  const dpr = g.dpr;
  const tf = (M: number[], x: number, y: number): [number, number] => [(M[0] * x + M[2] * y + M[4]) / dpr, (M[1] * x + M[3] * y + M[5]) / dpr];
  const sc = (M: number[]) => Math.hypot(M[0], M[1]) / dpr;
  const [vl, vt, vr, vb] = g.view.split(' ').map(Number);
  const vp = { l: vl, t: vt, r: vr, b: vb };
  const starPts: [number, number][] = [
    ...g.starsAt.split(';').filter(Boolean).map((q) => q.split(',').map(Number) as [number, number]),
    ...g.stars.map((q) => [q.x, q.y] as [number, number]),
  ];
  // блоки save…restore
  const close = new Int32Array(ops.length).fill(-1);
  const stack: number[] = [];
  ops.forEach((o, i) => {
    if (o.k === '(') stack.push(i);
    else if (o.k === ')' && stack.length) close[stack.pop()!] = i;
  });
  const glyphs: Glyph[] = [];
  const inGlyph = new Uint8Array(ops.length);
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].k !== '(' || close[i] < 0) continue;
    let j = i + 1;
    let nested = false;
    while (j < close[i] && !['S', 'F', 'T', 'R'].includes(ops[j].k)) {
      if (ops[j].k === '(') nested = true;
      j++;
    }
    // блок, в котором знаки рисуются своими блоками (restars под названием созвездия), — не знак
    if (nested) continue;
    const f = ops[j];
    if (!f || f.k !== 'F' || !f.M) continue;
    const halo = f.arcs?.length === 1 && (same(f.col ?? '', g.pal.sky) || same(f.col ?? '', g.pal.halo));
    // восьмилучевая звезда: многоугольник из 16 вершин без подложки
    const star16 = !f.arcs?.length && f.sub?.length === 1 && f.sub[0].length >= 32 && f.sub[0].length <= 36;
    if (!halo && !star16) continue;
    const M = f.M;
    {
      const [qx, qy] = halo ? tf(M, f.arcs![0][0], f.arcs![0][1]) : tf(M, f.sub![0][0], f.sub![0][1]);
      // знак лица — только на месте звезды кадра (canvas[data-stars-at], #sky-stars); прочие блоки с подложкой —
      // ромбы, узлы, «+N»; звезда Мессии — по вершине (центр проверяется ниже)
      if (halo && !starPts.some(([x, y]) => Math.abs(x - qx) < 1.3 && Math.abs(y - qy) < 1.3)) continue;
    }
    let cx: number;
    let cy: number;
    if (halo) [cx, cy] = tf(M, f.arcs![0][0], f.arcs![0][1]);
    else {
      const pts = f.sub![0];
      let sx = 0;
      let sy = 0;
      for (let k = 0; k < 32; k += 2) {
        sx += pts[k];
        sy += pts[k + 1];
      }
      [cx, cy] = tf(M, sx / 16, sy / 16);
    }
    const gl: Glyph = { i, x: cx, y: cy, discs: [], segs: [], ext: 0, a: 0, ghost: false };
    for (let k = halo ? j + 1 : j; k < close[i]; k++) {
      const o = ops[k];
      inGlyph[k] = 1;
      if ((o.k !== 'S' && o.k !== 'F') || !o.M) continue;
      const s = sc(o.M);
      gl.a = Math.max(gl.a, alphaOf(o));
      if (o.dash) gl.ghost = true;
      const hw = o.k === 'S' ? ((o.lw ?? 1) * s) / 2 : 0;
      if (o.arcs?.length) {
        for (const [x, y, r] of o.arcs) {
          const [X, Y] = tf(o.M, x, y);
          gl.discs.push([X, Y, r * s + hw]);
          gl.ext = Math.max(gl.ext, Math.hypot(X - cx, Y - cy) + r * s + hw);
        }
      } else
        for (const sp of o.sub ?? []) {
          if (o.k === 'F' && sp.length >= 32) {
            // звезда Мессии — как диск по дальней вершине
            let R = 0;
            for (let q = 0; q + 1 < sp.length; q += 2) {
              const [X, Y] = tf(o.M, sp[q], sp[q + 1]);
              R = Math.max(R, Math.hypot(X - cx, Y - cy));
            }
            gl.discs.push([cx, cy, R]);
            gl.ext = Math.max(gl.ext, R);
            continue;
          }
          for (let q = 0; q + 3 < sp.length; q += 2) {
            const [X0, Y0] = tf(o.M, sp[q], sp[q + 1]);
            const [X1, Y1] = tf(o.M, sp[q + 2], sp[q + 3]);
            gl.segs.push([X0, Y0, X1, Y1, Math.max(hw, 0.5)]);
            gl.ext = Math.max(gl.ext, Math.hypot(X0 - cx, Y0 - cy) + hw, Math.hypot(X1 - cx, Y1 - cy) + hw);
          }
        }
    }
    inGlyph[i] = 1;
    inGlyph[j] = 1;
    if (gl.discs.length || gl.segs.length) glyphs.push(gl);
  }
  // звезда, нарисованная дважды (restars: под названием созвездия знаки рисуются заново) — один знак, верхний
  for (let a = glyphs.length - 1; a >= 0; a--)
    for (let b = a - 1; b >= 0; b--)
      if (Math.abs(glyphs[a].x - glyphs[b].x) < 0.3 && Math.abs(glyphs[a].y - glyphs[b].y) < 0.3 && !glyphs[a].ghost && !glyphs[b].ghost) {
        glyphs[b].discs = [];
        glyphs[b].segs = [];
      }
  for (let a = glyphs.length - 1; a >= 0; a--) if (!glyphs[a].discs.length && !glyphs[a].segs.length) glyphs.splice(a, 1);
  // лица знаков — по списку неба
  for (const s of g.stars) {
    let best: Glyph | null = null;
    let bd = 2;
    for (const gl of glyphs) {
      const d = Math.hypot(gl.x - s.x, gl.y - s.y);
      if (d < bd && !gl.ghost) {
        bd = d;
        best = gl;
      }
    }
    if (best && !best.id) best.id = s.id;
  }
  // текст
  const raw: { i: number; o: Op; box: Box; rot: boolean; size: number }[] = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.k !== 'T' || !o.M || !o.bb) continue;
    const [L, Rr, A, D] = o.bb;
    const corners = [
      [o.x! - L, o.y! - A],
      [o.x! + Rr, o.y! - A],
      [o.x! + Rr, o.y! + D],
      [o.x! - L, o.y! + D],
    ].map(([x, y]) => tf(o.M!, x, y));
    const box = { x0: Math.min(...corners.map((c) => c[0])), y0: Math.min(...corners.map((c) => c[1])), x1: Math.max(...corners.map((c) => c[0])), y1: Math.max(...corners.map((c) => c[1])) };
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(o.font ?? '')?.[1] ?? 12) * sc(o.M);
    raw.push({ i, o, box, rot: Math.abs(o.M[1]) > 1e-6, size });
  }
  const strokeKeys = new Set(raw.filter((r) => r.o.m === 's' && (same(r.o.col ?? '', g.pal.halo) || same(r.o.col ?? '', g.pal.sky))).map((r) => `${r.o.text}|${r.o.x}|${r.o.y}`));
  const labelBoxes = g.labelBoxes
    .split(';')
    .filter(Boolean)
    .map((s) => {
      const k = s.lastIndexOf(':');
      const [x, y, w, h] = s.slice(k + 1).split(',').map(Number);
      return { id: s.slice(0, k), box: { x0: x, y0: y, x1: x + w, y1: y + h } };
    });
  const texts: Text[] = [];
  let run = 0;
  let prev: Text | null = null;
  for (const r of raw) {
    if (r.o.m !== 'f') continue;
    const a = alphaOf(r.o);
    if (a < 0.12 || !r.o.text!.trim()) continue;
    const mx = (r.box.x0 + r.box.x1) / 2;
    const my = (r.box.y0 + r.box.y1) / 2;
    // только открытое небо (рамка, ярусы, линейка — вне счёта)
    if (my < vp.t || my > vp.b || mx < vp.l - 2 || mx > vp.r) continue;
    const lb = labelBoxes.find((q) => mx >= q.box.x0 - 1 && mx <= q.box.x1 + 1 && my >= q.box.y0 - 1 && my <= q.box.y1 + 1);
    let owner: string;
    if (lb) owner = `star:${lb.id}`;
    else if (prev && !prev.owner.startsWith('star:') && Math.abs(prev.box.y1 - r.box.y1) < 3 && r.box.x0 - prev.box.x1 < 4 && r.box.x0 - prev.box.x1 > -2) owner = prev.owner;
    else owner = `run:${run++}`;
    const t: Text = { i: r.i, text: r.o.text!, box: r.box, a, halo: strokeKeys.has(`${r.o.text}|${r.o.x}|${r.o.y}`), size: r.size, owner, rot: r.rot };
    texts.push(t);
    prev = t;
  }
  // линии
  const holesAt: Box[][] = [];
  const clipStack: Box[][] = [[]];
  const lines: Line[] = [];
  const circles: { i: number; x: number; y: number; R: number }[] = [];
  const knocks: { i: number; box: Box }[] = [];
  const isYellow = (c: string) => same(c, '#F2E600') || same(c, '#FCDA2D');
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.k === '(') clipStack.push([...clipStack[clipStack.length - 1]]);
    else if (o.k === ')') {
      if (clipStack.length > 1) clipStack.pop();
    } else if (o.k === 'C' && o.M) {
      // вырезы: прямоугольники пути, кроме первого (весь холст), при evenodd
      if (o.rule === 'evenodd' && (o.sub?.length ?? 0) > 1) {
        const hs = o.sub!.slice(1).map((s) => {
          const pts = [];
          for (let q = 0; q + 1 < s.length; q += 2) pts.push(tf(o.M!, s[q], s[q + 1]));
          return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
        });
        clipStack[clipStack.length - 1] = [...clipStack[clipStack.length - 1], ...hs];
      }
    } else if (o.k === 'R' && o.M && (same(o.col ?? '', g.pal.sky) || same(o.col ?? '', g.pal.band) || same(o.col ?? '', g.pal.halo)) && alphaOf(o) > 0.9) {
      const [x0, y0] = tf(o.M, o.x!, o.y!);
      const [x1, y1] = tf(o.M, o.x! + o.w!, o.y! + o.h!);
      if (Math.abs(x1 - x0) < g.cw - 2) knocks.push({ i, box: { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) } });
    }
    holesAt[i] = clipStack[clipStack.length - 1];
    if ((o.k !== 'S' && !(o.k === 'F' && !inGlyph[i])) || inGlyph[i] || !o.M) continue;
    const col = colOf(o.col ?? '');
    if (same(col, g.pal.sky) || same(col, g.pal.halo)) continue;
    const a = alphaOf(o);
    if (a < 0.08) continue;
    const s = sc(o.M);
    // кольца (выбор, фокус, наведение, отметки, концы связи — и их подложка днём): наружный край по толщине линии (К7)
    if (o.k === 'S' && o.arcs?.length)
      for (const [x, y, r] of o.arcs) {
        const [X, Y] = tf(o.M, x, y);
        circles.push({ i, x: X, y: Y, R: r * s + ((o.lw ?? 1) * s) / 2 });
      }
    const hh = col === 'grad' ? null : hue(col);
    let kind: string;
    if (isYellow(col)) kind = 'sel';
    // золотистые точечные дуги родства по слову Писания и призраки жён (marks.ts, goldArc; branches.ts, KIN_GOLD)
    else if (same(col, '#D2BE28') || same(col, '#4B3205') || same(col, '#F2B632')) kind = 'kin';
    else if (col === 'grad' || (hh && hh.s > 0.35 && ((hh.h >= 20 && hh.h <= 55) || (hh.h >= 165 && hh.h <= 215)))) kind = 'ribbon';
    else if (o.k === 'F') continue; // заливки вне знаков и лент (ромбы, «+N», полосы рождения) — не линии
    else if ((o.arcs?.length ?? 0) > 0) kind = 'ring';
    else if (same(col, g.pal.ink3) || same(col, g.pal.rule) || same(col, g.pal.ruleStrong)) kind = 'map';
    else kind = 'line';
    if (o.k === 'F' && kind === 'ribbon') kind = 'ribbon';
    const segs: number[][] = [];
    for (const sp of o.sub ?? [])
      for (let q = 0; q + 3 < sp.length; q += 2) {
        const [x0, y0] = tf(o.M, sp[q], sp[q + 1]);
        const [x1, y1] = tf(o.M, sp[q + 2], sp[q + 3]);
        if (Math.abs(x1 - x0) + Math.abs(y1 - y0) < 0.01) continue;
        segs.push([x0, y0, x1, y1]);
      }
    if (!segs.length) continue;
    // во всю высоту открытого неба — сетка, меридиан, черта события
    if (kind === 'line' || kind === 'map') {
      const tall = segs.some(([x0, y0, x1, y1]) => Math.abs(x1 - x0) < 0.5 && Math.abs(y1 - y0) > (vp.b - vp.t) * 0.7);
      if (tall) kind = 'map';
    }
    lines.push({ i, kind, segs, lw: (o.lw ?? 1) * s, a, dash: !!o.dash, holes: holesAt[i], col });
  }
  // след жизни: горизонталь на уровне звезды, правее неё
  for (const L of lines) {
    if (L.kind !== 'line') continue;
    if (!L.segs.every(([, y0, , y1]) => Math.abs(y1 - y0) < 0.3)) continue;
    const y = L.segs[0][1];
    const x0 = Math.min(...L.segs.map((q) => Math.min(q[0], q[2])));
    if (starPts.some(([sx, sy]) => Math.abs(sy - y) < 0.9 && x0 >= sx - 2)) L.kind = 'trail';
  }
  // пути связей из журнала — для пометки «link»
  const linkSegs: { kind: string; ks: string; seg: number[] }[] = [];
  const nodes: { kind: string; x: number; y: number; ks: string }[] = [];
  for (const q of g.links.split(';').filter(Boolean)) {
    const [kind, style, ks, pts] = q.split('|');
    const n = (pts ?? '').split(',').map(Number);
    if (kind === 'node' || kind === 'join') {
      nodes.push({ kind, x: n[0], y: n[1], ks });
      continue;
    }
    for (let k = 0; k + 3 < n.length; k += 2) linkSegs.push({ kind: `${kind}/${style}`, ks, seg: [n[k], n[k + 1], n[k + 2], n[k + 3]] });
  }
  // узел союза считается нарисованным, только если на его месте есть заливка вне знаков (ромб, точка): на обзоре
  // журнал связей пишет узлы и тогда, когда связи погашены подробностью кадра
  const fills: Box[] = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.k !== 'F' || inGlyph[i] || !o.M || alphaOf(o) < 0.3) continue;
    const pts: [number, number][] = [];
    for (const sp of o.sub ?? []) for (let q = 0; q + 1 < sp.length; q += 2) pts.push(tf(o.M, sp[q], sp[q + 1]));
    if (!pts.length) continue;
    const b = { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
    if (b.x1 - b.x0 < 24 && b.y1 - b.y0 < 24) fills.push(b);
  }
  for (let k = nodes.length - 1; k >= 0; k--) {
    const n = nodes[k];
    if (!fills.some((b) => n.x >= b.x0 - 1 && n.x <= b.x1 + 1 && n.y >= b.y0 - 1 && n.y <= b.y1 + 1)) nodes.splice(k, 1);
  }
  // переход следа (этап 15, решение 173; canvas[data-glides] «лицо:x0,y0,x1,y1»): след с наклонными отрезками внутри рамки
  // перехода — вид 'glide', владелец — лицо перехода (свой переход через своё имя не считается). Переход — препятствие для
  // чужого имени (решение 163): К5 — видимое пересечение середины строки (на небе переход бледен и гасится под именем).
  // Переход узнаётся раньше связей: почти отвесная S-кривая рядом со стволом (переход Вениамина вдоль ствола Гада на
  // телефоне) иначе совпадала с ним по отрезкам и считалась связью
  const glideBoxes = g.glides
    .split(';')
    .filter(Boolean)
    .map((q) => {
      const [id, xy] = q.split(':');
      const [x0, y0, x1, y1] = xy.split(',').map(Number);
      return { id, x0: Math.min(x0, x1) - 1.5, x1: Math.max(x0, x1) + 1.5, y0: Math.min(y0, y1) - 1.5, y1: Math.max(y0, y1) + 1.5 };
    });
  const glideOf = (L: (typeof lines)[number]) => {
    if (!glideBoxes.length) return undefined;
    const slant = L.segs.filter(([, y0, , y1]) => Math.abs(y1 - y0) >= 0.3);
    // S-кривая идёт вправо на каждом отрезке: отвесный отрезок (ствол, черта) — не переход
    if (!slant.length || slant.some(([x0, , x1]) => Math.abs(x1 - x0) < 0.05)) return undefined;
    const own = glideBoxes.find((b) => slant.every(([x0, y0, x1, y1]) => Math.min(x0, x1) >= b.x0 && Math.max(x0, x1) <= b.x1 && Math.min(y0, y1) >= b.y0 && Math.max(y0, y1) <= b.y1));
    return own ? { own, slant } : undefined;
  };
  const glided = new Map<(typeof lines)[number], NonNullable<ReturnType<typeof glideOf>>>();
  for (const L of lines) {
    if (L.kind !== 'line') continue;
    const q = glideOf(L);
    if (q) glided.set(L, q);
  }
  for (const L of lines) {
    if (L.kind !== 'line' || glided.has(L)) continue;
    // вид путей журнала, с которыми линия совпадает на наибольшей длине (этап 16): нить ленты на изгибах проходит и по
    // чертам брака (в isav-mid нить Арама — по черте s.isaak.revekka у x 264 и s.iuda.famar у x 537, а по маршрутам лент
    // r.j.iakov, r.j.esrom, r.j.aram — трижды), и первое совпадение называло всю нить чертой; по сумме длин нить — лента,
    // отвесная черта — связь, как прежде; при равенстве — первое совпадение, как прежде
    let hitKind = '';
    let hitKs = '';
    const got = new Map<string, number>();
    const byKind = new Map<string, number>();
    for (const [x0, y0, x1, y1] of L.segs)
      for (const { seg: s, kind, ks } of linkSegs) {
        const vert = Math.abs(x1 - x0) < 0.6 && Math.abs(s[2] - s[0]) < 0.6 && Math.abs(x0 - s[0]) < 1.2;
        const hor = Math.abs(y1 - y0) < 0.6 && Math.abs(s[3] - s[1]) < 0.6 && Math.abs(y0 - s[1]) < 1.2;
        const len = vert
          ? Math.min(Math.max(y0, y1), Math.max(s[1], s[3])) - Math.max(Math.min(y0, y1), Math.min(s[1], s[3]))
          : hor
            ? Math.min(Math.max(x0, x1), Math.max(s[0], s[2])) - Math.max(Math.min(x0, x1), Math.min(s[0], s[2]))
            : 0;
        if (len > 2) {
          got.set(`${kind}|${ks}`, (got.get(`${kind}|${ks}`) ?? 0) + len);
          const kk = kind.split('/')[0];
          byKind.set(kk, (byKind.get(kk) ?? 0) + len);
        }
      }
    let top = '';
    let topLen = 0;
    for (const [k, len] of byKind)
      if (len > topLen) {
        topLen = len;
        top = k;
      }
    let best = 0;
    for (const [k, len] of got)
      if (k.split('/')[0] === top && len > best) {
        best = len;
        [hitKind, hitKs] = k.split('|');
      }
    const hit = best > 0;
    // путь ленты по маршрутам связей (журнал «ribbon|…») — лента, а не связь: её нить приглушённого цвета иначе считалась бы
    // связью через имя лица линии
    if (hit) {
      L.kind = hitKind.startsWith('ribbon/') ? 'ribbon' : 'link';
      L.ks = hitKs;
    }
  }
  for (const [L, { own, slant }] of glided) {
    // горизонтали пребываний того же прохода — след, наклонные отрезки — переход
    const flat = L.segs.filter(([, y0, , y1]) => Math.abs(y1 - y0) < 0.3);
    if (flat.length) lines.push({ ...L, kind: 'trail', segs: flat });
    L.kind = 'glide';
    L.ks = `glide:${own.id}`;
    L.segs = slant;
  }
  return { vp, glyphs, texts, lines, circles, knocks, nodes, labelBoxes, raw };
}
type Parsed = ReturnType<typeof parse>;

// ---------- замеры ----------

/** Лица линий Мессии (data/lines): их лента под их именем — своя. */
const SPINE = new Set(
  ['joseph', 'mary'].flatMap((l) => (JSON.parse(readFileSync(join(ROOT, `data/lines/${l}.json`), 'utf8')) as { persons: { id: string }[] }).persons.map((x) => x.id)),
);
/**
 * Опорные лица величины 0 (src/generated/atlas.json, mg): исключение К8 — на обзоре без выбранного их выноска может быть
 * до 100 px (через пустое небо; labels.ts, LEADER_WIDE; STAGE14 § 4, К8).
 */
const MAG0 = (() => {
  try {
    const a = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: { id: string; mg: number }[] };
    return new Set(a.persons.filter((q) => q.mg === 0).map((q) => q.id));
  } catch {
    return new Set<string>();
  }
})();
/** Родители лиц (src/generated/atlas.json, f, m): своя ли связь лицу (решение 163; как labels.ts, ownLink). */
const PARENTS = (() => {
  try {
    const a = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: { id: string; f?: string; m?: string }[] };
    return new Map(a.persons.map((q) => [q.id, { f: q.f ?? null, m: q.m ?? null }]));
  } catch {
    return new Map<string, { f: string | null; m: string | null }>();
  }
})();
/** Связь своя для лица: он супруг союза, ребёнок по этой связи или ребёнок этих родителей (labels.ts, ownLink). */
function ownLink(ks: string | undefined, id: string): boolean {
  const k = (ks ?? '').split('.');
  if (k.length < 3 || !(k[0] === 'u' || k[0] === 'k' || k[0] === 's')) return false;
  const [a, b] = [k[1], k[2]];
  if (a === id || b === id || (k.length > 4 && k[4] === id && k[0] === 'k')) return true;
  // черта брака родителей — не линия ребёнка: имя на ней читалось бы супругом (Г4; MAP-76)
  if (k[0] === 's') return false;
  const q = PARENTS.get(id);
  if (!q) return false;
  return (q.f ? q.f === a : a === '_') && (q.m ? q.m === b : b === '_') && !!(q.f || q.m);
}
/** Имена лиц (src/generated/atlas.json, n): своя звезда подписи у ромба — та, чьё имя в подписи (решение 160). */
const NAMES = (() => {
  try {
    const a = JSON.parse(readFileSync(join(ROOT, 'src/generated/atlas.json'), 'utf8')) as { persons: { id: string; n: string }[] };
    return new Map(a.persons.map((q) => [q.id, q.n]));
  } catch {
    return new Map<string, string>();
  }
})();
/** Виды линий порога К5: связь, лента, золотистая дуга, жёлтая выбранная связь. */
const K5_KINDS = new Set(['link', 'ribbon', 'kin', 'sel', 'glide']);
/** Выноска подписи (labels.ts, labelStar): один отрезок толщиной 0,8 px (не след, не связь, не контур). */
const isLeader = (L: Line) => Math.abs(L.lw - 0.8) < 0.06 && L.segs.length === 1;
/**
 * Из них — по всей строке имени и с замаскированными пересечениями (решение 163: стволы, зубцы, черты брака, выбранная
 * связь; выноски — отдельно): связь и выбранная связь. Ленты и золотистые дуги — по середине строки, как прежде.
 */
const K5_FULL = new Set(['link', 'sel']);

interface Finding {
  cls: string;
  what: string;
  x: number;
  y: number;
}

function measure(g: Grab, P: Parsed) {
  const { glyphs, texts, lines, circles, knocks, nodes, labelBoxes, vp } = P;
  const F: Finding[] = [];
  const inView = (x: number, y: number) => x >= vp.l && x <= vp.r && y >= vp.t && y <= vp.b;
  const vis = glyphs.filter((q) => q.a >= 0.15 && inView(q.x, q.y));
  const selId = g.sel ? g.selId : '';
  // текст по подписям (owner)
  const owners = new Map<string, Text[]>();
  for (const t of texts) {
    const a = owners.get(t.owner);
    if (a) a.push(t);
    else owners.set(t.owner, [t]);
  }
  const label = (o: string) => (owners.get(o) ?? []).map((t) => t.text).join('');
  // 1. знак↔знак
  let nn = 0;
  let nnLit = 0;
  let nnTouch = 0;
  for (let a = 0; a < vis.length; a++)
    for (let b = a + 1; b < vis.length; b++) {
      const A = vis[a];
      const B = vis[b];
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      if (d > A.ext + B.ext + 2) continue;
      if (d < 0.5 && (A.ghost || B.ghost)) continue;
      // по видимым частям
      let hit = false;
      for (const p of A.discs) for (const q of B.discs) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < p[2] + q[2]) hit = true;
      if (!hit && d < A.ext + B.ext) nnTouch++;
      if (!hit) continue;
      nn++;
      if (A.a > 0.8 && B.a > 0.8) nnLit++;
      F.push({ cls: '1 знак↔знак', what: `${A.id ?? '?'} × ${B.id ?? '?'} (${d.toFixed(1)} px)`, x: A.x, y: A.y });
    }
  // 2. знак↔чужое имя; ромб под именем
  let nl = 0;
  let nlStar = 0;
  /** названия созвездий (прописные с разрядкой) на знаке: порог К2 действует и на них (STAGE14, этап 14) */
  let nlGroup = 0;
  let nlSel = 0;
  let nodeUnder = 0;
  const glyphHits = (gl: Glyph, b: Box) => gl.discs.some(([x, y, r]) => circleBox(x, y, r, b)) || gl.segs.some(([x0, y0, x1, y1, h]) => clipLen(x0, y0, x1, y1, inflate(b, h)) > 0.5);
  for (const [o, ts] of owners) {
    const own = o.startsWith('star:') ? o.slice(5) : null;
    for (const t of ts) {
      const core = inflate(t.box, -0.5);
      for (const gl of vis) {
        if (own && gl.id === own) continue;
        // подпись свёрнутого «+N» и пометы у своей звезды без id — пропускаем только своё лицо
        if (!glyphHits(gl, core)) continue;
        nl++;
        if (own) nlStar++;
        else if (/^[А-ЯЁ][А-ЯЁ ,()-]{2,}$/.test(ts.map((q) => q.text).join('').trim())) nlGroup++;
        if (gl.id && gl.id === selId) nlSel++;
        F.push({ cls: '2 знак↔имя', what: `«${label(o)}» на знаке ${gl.id ?? '?'}${gl.a < 0.8 ? ' (погашен)' : ''}`, x: gl.x, y: gl.y });
        break;
      }
      if (own)
        for (const n of nodes) {
          const R = n.kind === 'node' ? 4.5 : 2;
          if (circleBox(n.x, n.y, R, core)) {
            nodeUnder++;
            F.push({ cls: '2 узел под именем', what: `«${label(o)}» на ${n.kind === 'node' ? '◆' : '•'} ${n.ks}`, x: n.x, y: n.y });
            break;
          }
        }
    }
  }
  // 3. подпись↔подпись по глифам
  let ll = 0;
  let llStar = 0;
  const T = texts.filter((t) => !t.rot);
  const ord = [...T.keys()].sort((a, b) => T[a].box.x0 - T[b].box.x0);
  const seenPair = new Set<string>();
  for (let a = 0; a < ord.length; a++) {
    const A = T[ord[a]];
    for (let b = a + 1; b < ord.length; b++) {
      const B = T[ord[b]];
      if (B.box.x0 >= A.box.x1) break;
      if (A.owner === B.owner || !inter(A.box, B.box, 0.75)) continue;
      const key = [A.owner, B.owner].sort().join('~');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      ll++;
      if (A.owner.startsWith('star:') && B.owner.startsWith('star:')) llStar++;
      F.push({ cls: '3 имя↔имя', what: `«${label(A.owner)}» × «${label(B.owner)}» (${area(A.box, B.box).toFixed(0)} px²)`, x: A.box.x0, y: A.box.y0 });
    }
  }
  // 3а. две подписи на одной строке почти вплотную — читаются одним именем («Ардон Хеврон»): зазор меньше 0,45 кегля
  let adj = 0;
  {
    const runs = [...owners.entries()].map(([o, ts]) => ({
      o,
      box: { x0: Math.min(...ts.map((t) => t.box.x0)), y0: Math.min(...ts.map((t) => t.box.y0)), x1: Math.max(...ts.map((t) => t.box.x1)), y1: Math.max(...ts.map((t) => t.box.y1)) },
      size: ts[0].size,
      rot: ts[0].rot,
    }));
    for (const A of runs)
      for (const B of runs) {
        if (A === B || A.rot || B.rot) continue;
        const gap = B.box.x0 - A.box.x1;
        const yc = Math.abs((A.box.y0 + A.box.y1) / 2 - (B.box.y0 + B.box.y1) / 2);
        if (gap >= -0.75 && gap < 0.45 * Math.min(A.size, B.size) && yc < 3) {
          adj++;
          F.push({ cls: '3а подписи сливаются в строку', what: `«${label(A.o)}» + «${label(B.o)}» (${gap.toFixed(1)} px)`, x: A.box.x1, y: A.box.y0 });
        }
      }
  }
  // 5. линия через текст: длина внутри глифа ≥ 2 px, не погашена позже, не в вырезе
  const kinds: Record<string, number> = {};
  const strict: Record<string, number> = {};
  const strictSeen = new Set<string>();
  const k5 = new Set<string>();
  const k5cut = new Set<string>();
  const cutSet = new Set(g.cutNames.split(' ').filter(Boolean));
  const over: Record<string, number> = {};
  let ltStar = 0;
  let ltSel = 0;
  for (const [o, ts] of owners) {
    const own = o.startsWith('star:') ? o.slice(5) : null;
    const ownGl = own ? vis.find((q) => q.id === own) : undefined;
    const hitKinds = new Set<string>();
    for (const t of ts) {
      // ядро текста: без поля ореола (по x — 0,5 px, по y — средняя часть строки, где буквы)
      const core = { x0: t.box.x0 + 0.5, x1: t.box.x1 - 0.5, y0: t.box.y0 + 0.5, y1: t.box.y1 - 0.5 };
      for (const L of lines) {
        if (L.kind === 'map' && L.a < 0.3) continue;
        let len = 0;
        let mx = 0;
        let my = 0;
        for (const [x0, y0, x1, y1] of L.segs) {
          // свой след: горизонталь на уровне своей звезды справа от неё
          if (ownGl && Math.abs(y0 - ownGl.y) < 1.2 && Math.abs(y1 - ownGl.y) < 1.2) continue;
          const l = clipLen(x0, y0, x1, y1, core);
          if (l <= 0) continue;
          const [px, py] = clipMid(x0, y0, x1, y1, core);
          if (L.holes.some((h) => px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1)) continue;
          if (knocks.some((k) => k.i > L.i && px >= k.box.x0 && px <= k.box.x1 && py >= k.box.y0 - 0.5 && py <= k.box.y1 + 0.5)) continue;
          len += l;
          mx = px;
          my = py;
        }
        // К5 по решению 163: связь, дуга, выбранная связь — по всей строке имени, и выноска чужой подписи; пересечение,
        // спрятанное ореолом, разрывом под именем или вырезом, тоже считается (R1-04: разрыв у имени читается концом связи)
        if (own && (K5_FULL.has(L.kind) || isLeader(L)) && !k5.has(o) && !(L.kind === 'link' && ownLink(L.ks, own)) && !(L.kind === 'glide' && L.ks === `glide:${own}`)) {
          let full = 0;
          let fx = 0;
          let fy = 0;
          const mineLeader = isLeader(L) && L.segs.some(([x0, y0, x1, y1]) => distBox(x0, y0, t.box) < 3 || distBox(x1, y1, t.box) < 3);
          if (!mineLeader)
            for (const [x0, y0, x1, y1] of L.segs) {
              if (ownGl && Math.abs(y0 - ownGl.y) < 1.2 && Math.abs(y1 - ownGl.y) < 1.2) continue;
              const l = clipLen(x0, y0, x1, y1, core);
              if (l <= 0) continue;
              full += l;
              [fx, fy] = clipMid(x0, y0, x1, y1, core);
            }
          // верхняя ступень 164 (canvas[data-cut-names]): чужая линия разорвана по всей рамке имени + 3 px — отдельной
          // строкой «разрыв под именем верхней ступени», если разрыв (заливка фоном после линии) действительно её покрывает
          const covered = (px: number, py: number) => knocks.some((k) => k.i > L.i && px >= k.box.x0 - 0.5 && px <= k.box.x1 + 0.5 && py >= k.box.y0 - 0.5 && py <= k.box.y1 + 0.5);
          if (full >= 3 && cutSet.has(own) && !isLeader(L) && covered(fx, fy) && covered(core.x0 - 2, (core.y0 + core.y1) / 2) && covered(core.x1 + 2, (core.y0 + core.y1) / 2)) {
            if (!k5cut.has(o)) {
              k5cut.add(o);
              F.push({ cls: '5 разрыв под именем верхней ступени', what: `${L.kind} разорвана под «${label(o)}» (${full.toFixed(0)} px)`, x: fx, y: fy });
            }
          } else if (full >= 3) {
            k5.add(o);
            F.push({ cls: '5 К5 линия через середину имени', what: `${isLeader(L) ? 'выноска' : L.kind} через строку «${label(o)}» (${full.toFixed(0)} px, по всей строке)`, x: fx, y: fy });
          }
        }
        if (len < 2) continue;
        // строго: через полосу строчных букв (середина строки), не меньше 3 px — линия зачёркивает имя
        {
          const h = core.y1 - core.y0;
          const band = { x0: core.x0, x1: core.x1, y0: core.y0 + 0.3 * h, y1: core.y1 - 0.25 * h };
          let sl = 0;
          for (const [x0, y0, x1, y1] of L.segs) {
            if (ownGl && Math.abs(y0 - ownGl.y) < 1.2 && Math.abs(y1 - ownGl.y) < 1.2) continue;
            const l = clipLen(x0, y0, x1, y1, band);
            if (l <= 0) continue;
            const [px, py] = clipMid(x0, y0, x1, y1, band);
            if (L.holes.some((q) => px >= q.x0 && px <= q.x1 && py >= q.y0 && py <= q.y1)) continue;
            if (knocks.some((k) => k.i > L.i && px >= k.box.x0 && px <= k.box.x1 && py >= k.box.y0 - 0.5 && py <= k.box.y1 + 0.5)) continue;
            sl += l;
          }
          if (sl >= 3 && !strictSeen.has(`${o}|${L.kind}`)) {
            strictSeen.add(`${o}|${L.kind}`);
            strict[L.kind] = (strict[L.kind] ?? 0) + 1;
          }
          // К5: связь, лента, дуга или жёлтая связь через середину строки ЧУЖОГО имени (лента под именем лица линии
          // Мессии — его своя: она прерывается под именем в замере класса 5 «строго», но в порог не входит)
          if (sl >= 3 && own && K5_KINDS.has(L.kind) && !(L.kind === 'ribbon' && SPINE.has(own)) && !(L.kind === 'link' && ownLink(L.ks, own)) && !(L.kind === 'glide' && L.ks === `glide:${own}`) && !k5.has(o) && !k5cut.has(o)) {
            k5.add(o);
            F.push({ cls: '5 К5 линия через середину имени', what: `${L.kind} через «${label(o)}» (${sl.toFixed(0)} px)`, x: t.box.x0, y: t.box.y0 });
          }
        }
        const after = L.i > t.i;
        const k = `${L.kind}${after ? ' поверх' : ''}`;
        if (hitKinds.has(k)) continue;
        hitKinds.add(k);
        kinds[L.kind] = (kinds[L.kind] ?? 0) + 1;
        if (after) over[L.kind] = (over[L.kind] ?? 0) + 1;
        if (own) ltStar++;
        if (own && own === selId) ltSel++;
        F.push({ cls: `5 линия через текст${after ? ' (поверх)' : ''}`, what: `${L.kind}${L.dash ? ' пунктир' : ''} ${L.lw.toFixed(1)} px через «${label(o)}» (${len.toFixed(0)} px)`, x: mx, y: my });
      }
    }
  }
  // выноска подписи (labels.ts, labelStar): один отрезок толщиной 0,8 px (не след, не связь, не контур)

  // охват знака с его кольцами (выбор, фокус, наведение, конец связи): кольцо — часть знака лица, а не чужая метка
  const ringR = new Map<Glyph, number>();
  // угловые скобки фокуса (решение 149; marks.ts): уголки «⌜ ⌝ ⌞ ⌟» — по два отвесных отрезка 3–8 px вокруг знака;
  // знак с фокусом охвачен квадратом, его полусторона — граница знака по осям
  const corners: { x: number; y: number; lw: number }[] = [];
  for (const L of lines) {
    if (L.lw < 1.2 || L.lw > 2.2) continue;
    for (let k = 0; k + 1 < L.segs.length; k++) {
      const a = L.segs[k];
      const b = L.segs[k + 1];
      const la = Math.hypot(a[2] - a[0], a[3] - a[1]);
      const lb = Math.hypot(b[2] - b[0], b[3] - b[1]);
      const axis = (q: number[]) => Math.abs(q[2] - q[0]) < 0.3 || Math.abs(q[3] - q[1]) < 0.3;
      if (la < 3 || la > 8 || lb < 3 || lb > 8 || !axis(a) || !axis(b) || Math.abs(a[2] - b[0]) > 0.3 || Math.abs(a[3] - b[1]) > 0.3) continue;
      corners.push({ x: a[2], y: a[3], lw: L.lw });
    }
  }
  for (const gl of vis) {
    let R = 0;
    for (const c of circles) if (Math.hypot(c.x - gl.x, c.y - gl.y) < 1.2) R = Math.max(R, c.R);
    const own = corners.filter((c) => Math.abs(Math.abs(c.x - gl.x) - Math.abs(c.y - gl.y)) < 1.5 && Math.abs(c.x - gl.x) > gl.ext && Math.abs(c.x - gl.x) < 26);
    // скобки — уголки в трёх-четырёх четвертях на одной полустороне (изломы связей у звезды так не стоят)
    for (const c of own) {
      const h = Math.abs(c.x - gl.x);
      const same = own.filter((q) => Math.abs(Math.abs(q.x - gl.x) - h) < 1);
      const quads = new Set(same.map((q) => `${Math.sign(q.x - gl.x)}${Math.sign(q.y - gl.y)}`));
      if (quads.size >= 3) R = Math.max(R, h + c.lw / 2);
    }
    // кольцо — шире самого диска (черта царя над кольцом у выбранного, решение 170, дальше кольца — по ext не сравнивать)
    const disc = Math.max(0, ...gl.discs.map((d) => Math.hypot(d[0] - gl.x, d[1] - gl.y) + d[2]));
    if (R > disc) ringR.set(gl, R);
  }
  const extOf = (gl: Glyph) => ringR.get(gl) ?? gl.ext;
  /**
   * Зазор от знака до рамки текста по его настоящим частям: диски — по радиусу, отрезки (черта царя, лучи) — по отрезку;
   * у знака с кольцом состояния — по кольцу. Круг по самой дальней точке (ext) завышал знак царя снизу на длину черты.
   */
  const gapOf = (gl: Glyph, b: Box): number => {
    const R = ringR.get(gl);
    // у выбранного кольцо — его часть, а черта царя стоит над кольцом (решение 170): ближняя из частей
    let g = R !== undefined ? distBox(gl.x, gl.y, b) - R : Infinity;
    for (const [x, y, r] of gl.discs) g = Math.min(g, distBox(x, y, b) - r);
    for (const [x0, y0, x1, y1, h] of gl.segs)
      for (let t = 0; t <= 1; t += 0.125) g = Math.min(g, distBox(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, b) - h);
    return Number.isFinite(g) ? g : distBox(gl.x, gl.y, b) - gl.ext;
  };
  // принадлежность: чужая звезда ближе к имени, чем своя
  let amb = 0;
  let tie = 0;
  let leader = 0;
  let glued = 0;
  let detached = 0;
  let leaderAmb = 0;
  let kingDash = 0;
  let longLeaders = 0;
  let wideLeaders = 0;
  // К4′ (этап 16, решение 184): имя основателя у устья — своя, более строгая проверка вместо «далеко без выноски» и
  // «принадлежности» (src/render/sky.ts, canvas[data-mouths] «id:x,y,w,h:путь»; путь — от звезды по своему следу и
  // переходу до начала имени): (i) рамка касается своего следа за концом перехода (≤ 6 px до конца пути, на той же
  // строке); (ii) у звезды лица нет второй подписи; (iii) путь не прерван чужой подписью (след и переход — выноска);
  // (iv) имя не дальше конца перехода + одна ширина имени. Нарушение любого — К4 «нет»
  const mouths = new Map<string, { box: Box; path: number[] }>();
  for (const m of String(g.mouths ?? '').split(';').filter(Boolean)) {
    const [id, b, path] = m.split(':');
    const [x, y, w, h] = b.split(',').map(Number);
    mouths.set(id, { box: { x0: x, y0: y, x1: x + w, y1: y + h }, path: (path ?? '').split(',').filter(Boolean).map(Number) });
  }
  let mouthNames = 0;
  let mouthBad = 0;
  const segBox = (x0: number, y0: number, x1: number, y1: number, b: Box) => {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
    }
    return false;
  };
  for (const [id, m] of mouths) {
    mouthNames++;
    const P = m.path;
    const bad: string[] = [];
    if (P.length < 4) bad.push('нет пути');
    else {
      const ex = P[P.length - 2];
      const ey = P[P.length - 1];
      const b = m.box;
      // конец пути — начало имени: перед ним конец перехода (предпоследняя точка)
      const gx = P.length >= 6 ? P[P.length - 4] : P[0];
      if (!(Math.abs(b.x0 - ex) <= 6 && ey >= b.y0 - 6 && ey <= b.y1 + 6)) bad.push('рамка не на своём следе');
      if (labelBoxes.filter((q) => q.id === id).length > 1) bad.push('у звезды вторая подпись');
      for (let k = 0; k + 3 < P.length && !bad.includes('путь прерван чужой подписью'); k += 2)
        for (const q of labelBoxes) if (q.id !== id && segBox(P[k], P[k + 1], P[k + 2], P[k + 3], inflate(q.box, -1))) {
          bad.push('путь прерван чужой подписью');
          break;
        }
      if (b.x0 - gx > b.x1 - b.x0 + 6) bad.push('имя дальше конца перехода');
    }
    if (bad.length) {
      mouthBad++;
      F.push({ cls: '7 К4′ имя у устья', what: `«${label(`star:${id}`)}»: ${bad.join(', ')}`, x: m.box.x0, y: m.box.y0 });
    }
  }
  for (const lb of labelBoxes) {
    if (mouths.has(lb.id)) continue;
    const ts = owners.get(`star:${lb.id}`);
    if (!ts?.length) continue;
    const box = { x0: Math.min(...ts.map((t) => t.box.x0)), y0: Math.min(...ts.map((t) => t.box.y0)), x1: Math.max(...ts.map((t) => t.box.x1)), y1: Math.max(...ts.map((t) => t.box.y1)) };
    // своя звезда: по списку неба, иначе по геометрии места подписи (labels.ts, spot: r + 5 сбоку, над и под диском)
    // или по выноске (тонкий отрезок от края звезды к углу подписи)
    const size = ts[0].size;
    const pb = lb.box;
    const leaderSeg = lines.find((L) => isLeader(L) && distBox(L.segs[0][2], L.segs[0][3], pb) < 3);
    let own = vis.find((q) => q.id === lb.id);
    // выноска к рамке подписи: своя звезда — у её начала (выноска до 40 px, звезда может быть дальше 30 px от рамки)
    if (!own && leaderSeg) {
      const [x0, y0] = leaderSeg.segs[0];
      const at = vis.filter((q) => !q.ghost && Math.hypot(q.x - x0, q.y - y0) < extOf(q) + 4).sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0));
      own = at[0];
    }
    if (!own) {
      const cands = vis.filter((q) => !q.ghost && distBox(q.x, q.y, pb) < 30);
      for (const q of cands) {
        const r = Math.min(...q.discs.map((d) => d[2]), q.ext);
        const cy = (pb.y0 + 1.5 + 0.8 * size) - (0.8 - 0.24) * 0.5 * size;
        const sideR = Math.abs(pb.x0 + 1.5 - (q.x + r + 5)) < 2.5 && Math.abs(q.y - cy) < 1.5;
        const sideL = Math.abs(pb.x1 - 1.5 - (q.x - r - 5)) < 2.5 && Math.abs(q.y - cy) < 1.5;
        const midX = Math.abs((pb.x0 + pb.x1) / 2 - q.x) < 1.5;
        const top = midX && q.y > pb.y1 && q.y - pb.y1 < r + 9;
        const bot = midX && q.y < pb.y0 && pb.y0 - q.y < r + 6;
        // подходят несколько (подпись между двумя звёздами одного столбца) — ближняя по рамке
        if ((sideR || sideL || top || bot) && (!own || distBox(q.x, q.y, pb) < distBox(own.x, own.y, pb))) own = q;
      }
      if (!own && leaderSeg) {
        const [x0, y0] = leaderSeg.segs[0];
        own = cands.sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0))[0];
      }
    }
    if (!own) continue;
    const dOwn = gapOf(own, box);
    let best: Glyph | null = null;
    let bd = Infinity;
    for (const gl of vis) {
      if (gl === own || gl.ghost || gl.a < 0.5) continue;
      const d = gapOf(gl, box);
      if (d < bd) {
        bd = d;
        best = gl;
      }
    }
    // выноска: тонкий отрезок от края своей звезды к углу подписи (labels.ts, labelStar: side 'x')
    const leaderOf = (L: Line) =>
      isLeader(L) &&
      // (начало выноски — у дальней части знака: черта царя над кольцом выбранного, решение 170)
      L.segs.some(([x0, y0, x1, y1]) => (Math.hypot(x0 - own!.x, y0 - own!.y) < Math.max(extOf(own!), own!.ext) + 4 && distBox(x1, y1, box) < 4) || (Math.hypot(x1 - own!.x, y1 - own!.y) < Math.max(extOf(own!), own!.ext) + 4 && distBox(x0, y0, box) < 4));
    const leadLine = lines.find(leaderOf);
    const hasLeader = !!leadLine;
    if (hasLeader) {
      leader++;
      // К8: длина выноски — нарисованный отрезок от края звезды до угла подписи
      const len = leadLine!.segs.reduce((a, [x0, y0, x1, y1]) => a + Math.hypot(x1 - x0, y1 - y0), 0);
      // исключение К8: опорное лицо величины 0 на обзоре (подробность звёзд < 0,99) без выбранного — до 100 px
      // (Иисус Христос — до 160 px: знак единственный, MOB-53)
      const wide = !selId && Number(g.detail) < 0.99 && MAG0.has(lb.id) && len <= (lb.id === 'iisus' ? 160.5 : 100.5);
      if (len > 40.5 && wide) {
        wideLeaders++;
        F.push({ cls: '8 выноска опорного лица на обзоре (до 100 px, Иисус Христос — до 160 px; исключение К8)', what: `«${label(`star:${lb.id}`)}»: ${len.toFixed(1)} px`, x: box.x0, y: box.y0 });
      } else if (len > 40.5) {
        longLeaders++;
        F.push({ cls: '8 выноска длиннее 40 px', what: `«${label(`star:${lb.id}`)}»: ${len.toFixed(1)} px`, x: box.x0, y: box.y0 });
      }
    }
    else if (dOwn > 6) {
      detached++;
      F.push({ cls: '7 имя далеко от своей звезды без выноски', what: `«${label(`star:${lb.id}`)}»: ${dOwn.toFixed(1)} px`, x: box.x0, y: box.y0 });
    }
    // черта царя своей звезды на высоте строки у края имени — читается тире («Амврий —»)
    for (const [x0, y0, x1, y1] of own.segs) {
      if (Math.abs(y1 - y0) > 0.3 || y0 > own.y - 2) continue;
      const gapX = Math.max(box.x0 - Math.max(x0, x1), Math.min(x0, x1) - box.x1);
      if (gapX < 5 && gapX > -1 && y0 > box.y0 + 1 && y0 < box.y1 - 1) {
        kingDash++;
        F.push({ cls: '2 черта царя у имени читается тире', what: `«${label(`star:${lb.id}`)}» (${gapX.toFixed(1)} px)`, x: box.x0, y: box.y0 });
        break;
      }
    }
    // чужая звезда вплотную к началу или концу имени, на строке: читается точкой или буквой («Неффалим.», «Аггифа ◉ Далуиа»)
    for (const gl of vis) {
      if (gl === own || gl.ghost || gl.a < 0.5) continue;
      const onRow = gl.y > box.y0 - 1 && gl.y < box.y1 + 1;
      const gapR = gl.x - extOf(gl) - box.x1;
      const gapL = box.x0 - (gl.x + extOf(gl));
      if (onRow && ((gapR >= -1 && gapR < 5) || (gapL >= -1 && gapL < 5))) {
        glued++;
        F.push({ cls: '7 чужой знак вплотную к имени', what: `«${label(`star:${lb.id}`)}» + знак ${gl.id ?? '?'} (${Math.min(Math.abs(gapR), Math.abs(gapL)).toFixed(1)} px)`, x: gl.x, y: gl.y });
        break;
      }
    }
    if (!best) continue;
    if (hasLeader) {
      // имя на выноске, а чужая звезда к нему ближе своей: принадлежность держит только линия 0,8 px
      if (bd < dOwn - 0.5 && bd < 6) {
        leaderAmb++;
        F.push({ cls: '7 выноска: чужая звезда ближе', what: `«${label(`star:${lb.id}`)}»: чужая ${best.id ?? '?'} ${bd.toFixed(1)} px, своя ${dOwn.toFixed(1)} px по выноске`, x: box.x0, y: box.y0 });
      }
      continue;
    }
    if (bd < dOwn - 0.5) {
      amb++;
      F.push({ cls: '7 принадлежность', what: `«${label(`star:${lb.id}`)}»: чужая ${best.id ?? '?'} ${bd.toFixed(1)} px, своя ${dOwn.toFixed(1)} px`, x: box.x0, y: box.y0 });
    } else if (bd < dOwn + 2) tie++;
  }
  // точность границ: глифы против прямоугольника Placer (labels.ts, textBox: поле 1,5 px)
  let outW = 0;
  let outCnt = 0;
  const ratios: number[] = [];
  for (const lb of labelBoxes) {
    const ts = owners.get(`star:${lb.id}`);
    if (!ts?.length) continue;
    for (const t of ts) {
      const o = Math.max(0, lb.box.x0 - t.box.x0, t.box.x1 - lb.box.x1, lb.box.y0 - t.box.y0, t.box.y1 - lb.box.y1);
      if (o > 0.5) {
        outCnt++;
        outW = Math.max(outW, o);
      }
    }
    const name = ts[0];
    if (name.text.length >= 3) ratios.push((name.box.x1 - name.box.x0) / (name.text.length * name.size * 0.56));
  }
  ratios.sort((a, b) => a - b);
  // К4 у ромбов (решение 160): подпись у ромба (имя матери, подпись союза или обрывка) — чужой яркий знак не ближе её
  // строки, чем её точка (ромб или конец обрывка), и не ближе 6 px; своя звезда — лицо с именем подписи
  let plateAmb = 0;
  {
    const anchors = [...g.motherNames.split('|'), ...g.linkTexts.split('|')]
      .filter(Boolean)
      .map((q) => {
        const k = q.lastIndexOf('@');
        const [x, y] = q.slice(k + 1).split(',').map(Number);
        return { text: q.slice(0, k), x, y };
      });
    const texts = g.plateTexts.split('|').filter(Boolean);
    g.plateBoxes
      .split('|')
      .filter(Boolean)
      .forEach((q, k) => {
        const parts = q.split(':');
        const [x, y, w, h] = parts[parts.length - 1].split(',').map(Number);
        const text = (texts[k] ?? '').slice((texts[k] ?? '').indexOf(':', 2) + 1);
        const pb = { x0: x, y0: y, x1: x + w, y1: y + h };
        // строка подписи — нарисованный текст внутри её рамки
        const ink = P.texts.filter((t) => (t.box.x0 + t.box.x1) / 2 >= pb.x0 && (t.box.x0 + t.box.x1) / 2 <= pb.x1 && (t.box.y0 + t.box.y1) / 2 >= pb.y0 && (t.box.y0 + t.box.y1) / 2 <= pb.y1);
        if (!ink.length) return;
        const tb = { x0: Math.min(...ink.map((t) => t.box.x0)), y0: Math.min(...ink.map((t) => t.box.y0)), x1: Math.max(...ink.map((t) => t.box.x1)), y1: Math.max(...ink.map((t) => t.box.y1)) };
        const an = anchors.filter((a) => a.text === text).sort((a, b) => distBox(a.x, a.y, tb) - distBox(b.x, b.y, tb))[0];
        if (!an) return;
        const dA = distBox(an.x, an.y, tb);
        const name = text.split(/[,(]/)[0].trim();
        for (const gl of vis) {
          if (gl.ghost || gl.a < 0.5 || (gl.id && NAMES.get(gl.id) === name)) continue;
          // точка ромба сама не знак; знак ровно в точке обрывка — его цель (подпись — её имя)
          if (Math.hypot(gl.x - an.x, gl.y - an.y) < 2) continue;
          const d = gapOf(gl, tb);
          if (d < 6 && d < dA - 0.5) {
            plateAmb++;
            F.push({ cls: '7 у ромба: чужая звезда ближе', what: `«${text}»: чужая ${gl.id ?? '?'} ${d.toFixed(1)} px, своя точка ${dA.toFixed(1)} px`, x: tb.x0, y: tb.y0 });
            break;
          }
        }
      });
  }
  // 7. UI↔граф
  const ui = g.ui.map((u) => ({ ...u, box: { x0: u.x, y0: u.y, x1: u.x + u.w, y1: u.y + u.h } }));
  const uiHit = (b: Box) => ui.filter((u) => inter(u.box, b, 0.5));
  let uiSel = 0;
  const uiWhat: string[] = [];
  const selGl = selId ? vis.find((q) => q.id === selId) : undefined;
  if (selGl) {
    const sb = { x0: selGl.x - selGl.ext, y0: selGl.y - selGl.ext, x1: selGl.x + selGl.ext, y1: selGl.y + selGl.ext };
    for (const u of uiHit(sb)) {
      uiSel++;
      uiWhat.push(`звезда выбранного под ${u.tag}.${u.cls.split(' ')[0]}`);
    }
    for (const t of owners.get(`star:${selId}`) ?? [])
      for (const u of uiHit(t.box)) {
        uiSel++;
        uiWhat.push(`имя выбранного под ${u.tag}.${u.cls.split(' ')[0]}`);
      }
  }
  let uiStars = 0;
  let uiLabels = 0;
  for (const gl of vis) if (gl.a > 0.8 && uiHit({ x0: gl.x - 1, y0: gl.y - 1, x1: gl.x + 1, y1: gl.y + 1 }).length) uiStars++;
  let uiLit = 0;
  let uiCut = 0;
  for (const [o, ts] of owners) {
    // подпись, срезанная краем оверлея: видна часть («на Исава» вместо «Махалафа, жена Исава»)
    for (const t of ts) {
      const a = (t.box.x1 - t.box.x0) * (t.box.y1 - t.box.y0);
      const cov = Math.max(0, ...ui.filter((u) => u.bg).map((u) => area(t.box, u.box)));
      if (cov > 2 && cov < a * 0.9) {
        uiCut++;
        F.push({ cls: '7 подпись срезана краем UI', what: `«${label(o)}» закрыта на ${Math.round((cov / a) * 100)} %`, x: t.box.x0, y: t.box.y0 });
        break;
      }
    }
    if (o.startsWith('star:') && ts.some((t) => uiHit(t.box).length)) {
      uiLabels++;
      const gl = vis.find((q) => q.id === o.slice(5));
      if (gl && gl.a > 0.8 && selId) {
        uiLit++;
        F.push({ cls: '7 UI поверх имени семьи/яркого', what: `«${label(o)}» под ${uiHit(ts[0].box).map((u) => `${u.tag}.${u.cls.split(' ')[0]}`).join(', ')}`, x: ts[0].box.x0, y: ts[0].box.y0 });
      }
    }
  }
  // концы выбранной связи
  let uiEnds = 0;
  if (g.linkSel) {
    try {
      const ls = JSON.parse(g.linkSel) as { ends: { id: string; x: number; y: number; on: boolean }[] };
      for (const e of ls.ends) if (e.on && uiHit({ x0: e.x - 6, y0: e.y - 6, x1: e.x + 6, y1: e.y + 6 }).length) {
        uiEnds++;
        uiWhat.push(`конец связи ${e.id} под UI`);
      }
    } catch {
      /* нет */
    }
  }
  // выбранное: имя есть? что легло поверх имени после него
  let selNamed = '';
  let selCovered = 0;
  /** К7: зазор от наружного края кольца выбранного до глифов его имени, px (null — кольца или имени нет) */
  let selRingGap: number | null = null;
  if (selId && selGl) {
    const ts = owners.get(`star:${selId}`);
    selNamed = ts ? 'да' : 'нет';
    // поверх имени — часть линии внутри глифов, не вырезанная clip и не погашенная позже (как в классе 5)
    for (const t of ts ?? [])
      for (const L of lines) {
        if (L.i <= t.i) continue;
        let len = 0;
        for (const [x0, y0, x1, y1] of L.segs) {
          const l = clipLen(x0, y0, x1, y1, t.box);
          if (l <= 0) continue;
          const [px, py] = clipMid(x0, y0, x1, y1, t.box);
          if (L.holes.some((h) => px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1)) continue;
          if (knocks.some((k) => k.i > L.i && px >= k.box.x0 && px <= k.box.x1 && py >= k.box.y0 - 0.5 && py <= k.box.y1 + 0.5)) continue;
          len += l;
        }
        if (len > 1) {
          selCovered++;
          F.push({ cls: '8 поверх имени выбранного', what: `${L.kind} ${L.lw.toFixed(1)} px поверх «${label(`star:${selId}`)}»`, x: t.box.x0, y: t.box.y0 });
        }
      }
    const rings = circles.filter((c) => Math.hypot(c.x - selGl.x, c.y - selGl.y) < 1.2);
    if (rings.length && ts?.length) {
      const R = Math.max(...rings.map((c) => c.R));
      selRingGap = Math.min(...ts.map((t) => distBox(selGl.x, selGl.y, t.box) - R));
      if (selRingGap < 2) F.push({ cls: '8 кольцо выбранного у имени', what: `«${label(`star:${selId}`)}»: зазор ${selRingGap.toFixed(1)} px`, x: selGl.x, y: selGl.y });
    }
  }
  const starTexts = [...owners.keys()].filter((o) => o.startsWith('star:')).length;
  return {
    counts: {
      stars: vis.length,
      lit: vis.filter((q) => q.a > 0.8).length,
      named: g.named,
      starLabels: starTexts,
      otherTexts: [...owners.keys()].length - starTexts,
      placerOverlaps: g.labels,
      nn,
      nnLit,
      nnTouch,
      nl,
      nlStar,
      nlGroup,
      nlSel,
      nodeUnder,
      ll,
      llStar,
      adj,
      lt: Object.values(kinds).reduce((a, b) => a + b, 0),
      ltKinds: kinds,
      ltOver: over,
      ltStrict: strict,
      ltStar,
      ltSel,
      amb,
      mouthNames,
      mouthBad,
      tie,
      leader,
      leaderAmb,
      plateAmb,
      kingDash,
      glued,
      detached,
      boxOut: outCnt,
      boxOutMax: +outW.toFixed(1),
      widthRatio: ratios.length ? [ratios[Math.floor(ratios.length * 0.1)], ratios[Math.floor(ratios.length / 2)], ratios[Math.floor(ratios.length * 0.9)]].map((x) => +x.toFixed(2)) : [],
      uiSel,
      uiEnds,
      uiStars,
      uiLabels,
      uiLit,
      uiCut,
      selNamed,
      selCovered,
      selRingGap: selRingGap === null ? null : +selRingGap.toFixed(1),
      k5: k5.size,
      longLeaders,
      wideLeaders,
      k5cut: k5cut.size,
    },
    uiWhat,
    findings: F,
  };
}

// ---------- сцены ----------

interface Scene {
  id: string;
  title: string;
  hash: string;
  width?: number;
  height?: number;
  touch?: boolean;
  theme?: 'night' | 'day';
  start?: string;
  /** действия после открытия */
  act?: (p: Page, g: () => Promise<Grab>) => Promise<string | void>;
  shot?: boolean;
  ms?: number;
  /** где по ширине окна поставить звезду выбранного (доля), по умолчанию 0,3 */
  at?: number;
  /** год середины окна (исторический) вместо места звезды по ширине: полоса — по звезде выбранного */
  mid?: number;
}

const canvasPt = async (p: Page, x: number, y: number) => {
  const c = (await p.locator('.sky canvas').boundingBox())!;
  return { x: c.x + x, y: c.y + y };
};
/** Звезда лица на холсте (px холста). */
async function starXY(p: Page, id: string): Promise<{ x: number; y: number } | null> {
  return p.evaluate((id) => {
    const b = document.getElementById(`sky-star-${id}`);
    return b?.dataset.x ? { x: Number(b.dataset.x), y: Number(b.dataset.y) } : null;
  }, id);
}
const hoverStar = (id: string) => async (p: Page) => {
  const q = await starXY(p, id);
  if (!q) return `нет звезды ${id}`;
  const pt = await canvasPt(p, q.x, q.y);
  await p.mouse.move(pt.x, pt.y);
  await p.waitForTimeout(700);
};
const pan = (dx: number, dy: number) => async (p: Page) => {
  const c = (await p.locator('.sky canvas').boundingBox())!;
  const x = c.x + c.width * 0.55;
  const y = c.y + c.height * 0.6;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let k = 1; k <= 8; k++) await p.mouse.move(x + (dx * k) / 8, y + (dy * k) / 8);
  await p.mouse.up();
  await p.mouse.move(c.x + 4, c.y + c.height - 4);
  await p.waitForTimeout(900);
};
/** Щелчок ближе стольких px к звезде выбирает звезду, а не связь (src/ui/sky/input.ts, STAR_FIRST). */
const STAR_FIRST = 12;
/** Выбрать связь «к ребёнку» лица kid (первый путь tooth из журнала связей с его ключом) — щелчком по середине пути. */
const clickChildLink = (kid: string) => async (p: Page, g: () => Promise<Grab>) => {
  const s = await g();
  const all = s.links
    .split(';')
    .map((q) => q.split('|'))
    .filter((q) => q[0] !== 'node' && q[0] !== 'join');
  const own = all.filter((q) => q[2]?.endsWith(`.${kid}`));
  if (!own.length) return `нет пути к ${kid}`;
  // у ребёнка единственного союза своя часть связи — короткий зубец, ствол — у союза (u.<союз>): щелчок по стволу
  // выбирает ту же связь; берётся середина самого длинного отрезка из своей части и ствола
  // (ствол — только когда своя часть короче 12 px — меньше видимого зубца: ствол союза с несколькими детьми выбирает не
  // одну связь)
  const union = `u.${own[0][2].slice(2, own[0][2].length - kid.length - 1)}`;
  let best = [0, 0];
  let bl = -1;
  const longest = (paths: string[][]) => {
    for (const q of paths) {
      const pts = q[3].split(',').map(Number);
      for (let k = 0; k + 3 < pts.length; k += 2) {
        const l = Math.hypot(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]);
        if (l > bl) {
          bl = l;
          best = [(pts[k] + pts[k + 2]) / 2, (pts[k + 1] + pts[k + 3]) / 2];
        }
      }
    }
  };
  longest(own);
  // на своей части — точка дальше STAR_FIRST (12 px, src/ui/sky/input.ts) от звезды ребёнка: щелчок ближе выбирает звезду;
  // на коротком зубце (от 12 px) это не середина, а его начало у ствола (до 80 % длины от звезды)
  const kidAt = s.stars.find((q) => q.id === kid);
  if (kidAt && bl >= 12) {
    let far = -1;
    for (const q of own) {
      const pts = q[3].split(',').map(Number);
      for (let k = 0; k + 3 < pts.length; k += 2)
        for (let t = 0.2; t <= 0.81; t += 0.1) {
          const x = pts[k] + (pts[k + 2] - pts[k]) * t;
          const y = pts[k + 1] + (pts[k + 3] - pts[k + 1]) * t;
          const d = Math.hypot(x - kidAt.x, y - kidAt.y);
          if (d > far) {
            far = d;
            best = [x, y];
          }
        }
    }
    if (far <= STAR_FIRST + 1) bl = -1;
  }
  if (bl < 12) {
    bl = -1;
    longest(all.filter((q) => q[2] === union));
  }
  const pt = await canvasPt(p, best[0], best[1]);
  // как рукой: сначала навести (наведённая связь отодвигает имена своих концов, сценарий 747), затем щёлкнуть
  await p.mouse.move(pt.x, pt.y, { steps: 4 });
  await p.waitForTimeout(400);
  await p.mouse.click(pt.x, pt.y);
  await p.mouse.move(pt.x + 300, pt.y + 200);
  await p.waitForTimeout(1200);
  return `щелчок по ${own[0][2]}`;
};
const tapStar = (id: string) => async (p: Page) => {
  const q = await starXY(p, id);
  if (!q) return `нет звезды ${id}`;
  const pt = await canvasPt(p, q.x, q.y);
  await p.touchscreen.tap(pt.x, pt.y);
  await p.waitForTimeout(1500);
};

const W = (y: number, w: number, l: number) => `~y${y}~w${w}~l${l}~s1`;

const clickStar = (id: string) => async (p: Page) => {
  const q = await starXY(p, id);
  if (!q) return `нет звезды ${id}`;
  const pt = await canvasPt(p, q.x, q.y);
  await p.mouse.click(pt.x, pt.y);
  await p.mouse.move(2, 600);
  await p.waitForTimeout(1300);
};
const both = (...fs: ((p: Page, g: () => Promise<Grab>) => Promise<string | void>)[]) => async (p: Page, g: () => Promise<Grab>) => {
  const out: string[] = [];
  for (const f of fs) {
    const r = await f(p, g);
    if (r) out.push(r);
  }
  return out.join('; ');
};
const deselect = async (p: Page) => {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
};

/**
 * Снять выбор, не трогая окно: тот же адрес без лица (Escape возвращает прежнее окно — сцена ушла бы с семьи). w, mid —
 * ширина окна и год середины, если перелёт к лицу поставил своё окно (семейное окно у лица с домом шире заданного).
 */
const unselectAt = (w?: number, mid?: number) => async (p: Page) => {
  const h = await p.evaluate(() => location.hash);
  let bare = h.replace(/^#\/[^~]*/, '#/');
  if (w !== undefined) bare = bare.replace(/~w[\d.]+/, `~w${w}`);
  if (mid !== undefined) bare = bare.replace(/~y-?[\d.]+/, `~y${mid}`);
  const base = p.url().replace(/[?#].*$/, '');
  await p.goto(`${base}?c=${Date.now()}${bare}`);
  await p.waitForTimeout(2600);
  await p.mouse.move(2, 600);
  await p.waitForTimeout(300);
};

/** Адреса сцен эксперта C (раздел 5 отчёта; collide.json выпуска 0871b45): окно задано целиком — сцену можно повторить. */
const D_FAM = '#/david~y-1020~w100~l0.0~s1~mmt-long';
const D_ROD = '#/david~y-1013~w182~l1.2~s1~mmt-long~vr.david.d.1.f';
const I_FAM = '#/iakov~y-1962~w220~l-2.0~s1~mmt-long';
const W1280 = { width: 1280, height: 800 };
const W1024 = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844, touch: true };
/** Корпус этапа 15: имя сцены, глава семьи, ширина окна обзора семьи и масштаба семьи (лет), заглавие. */
const FAMILY15: [string, string, number, number, string, number, number][] = [
  // имя сцены, глава семьи, окно обзора семьи и масштаба семьи (лет), заглавие, год середины обзора и семьи (окна
  // снимков владельца и сцен D2, tools/_d2-scenes.ts)
  ['iakov', 'iakov', 113, 48, 'Иаков', -1951, -1925],
  ['david', 'david', 113, 45, 'Давид', -1005, -1003],
  ['avraam', 'avraam', 200, 110, 'Авраам', -2080, -2070],
  ['khalev', 'khalev-syn-esroma', 113, 60, 'Халев, сын Есрома', -1790, -1788],
  ['isav', 'isav', 113, 60, 'Исав', -1960, -1950],
  ['iuda', 'iuda', 113, 60, 'Иуда и Фамарь', -1897, -1880],
];

/**
 * Сцены COLLISION STRESS (раздел 5 отчёта C): самые тяжёлые участки на трёх масштабах (w2500 и шире — обзор, w300–400 —
 * эпоха, w100–220 — семья), выбор лица, связь, подсказка, карточка у звезды, сдвиг, ширины 1440 / 1280 / 1024, ночь
 * и день, телефон. shot — снимок всей страницы.
 */
export const SCENES: Scene[] = [
  // 1. Давид, масштаб семьи: 1440 / 1280 / 1024, ночь и день; карточка у звезды, наведение, связь, сдвиг
  { id: 'david-fam', title: 'Давид, семья', hash: D_FAM, shot: true },
  { id: 'david-fam-day', title: 'Давид, семья, день', hash: D_FAM, theme: 'day' },
  { id: 'david-fam-1280', title: 'Давид, семья, 1280', hash: D_FAM, ...W1280 },
  { id: 'david-fam-1280-day', title: 'Давид, семья, 1280, день', hash: D_FAM, ...W1280, theme: 'day' },
  { id: 'david-fam-1024', title: 'Давид, семья, 1024', hash: D_FAM, ...W1024, shot: true },
  { id: 'david-fam-1024-day', title: 'Давид, семья, 1024, день', hash: D_FAM, ...W1024, theme: 'day' },
  { id: 'david-card', title: 'Давид: карточка у звезды', hash: D_FAM, act: clickStar('david'), shot: true },
  { id: 'david-card-1280', title: 'Давид: карточка у звезды, 1280', hash: D_FAM, ...W1280, act: clickStar('david') },
  { id: 'david-card-1024', title: 'Давид: карточка у звезды, 1024', hash: D_FAM, ...W1024, act: clickStar('david'), shot: true },
  { id: 'david-tip', title: 'Давид: наведение на Соломона', hash: D_FAM, act: hoverStar('solomon'), shot: true },
  { id: 'david-link-amnon', title: 'Давид: связь Давид и Ахиноама — Амнон', hash: D_FAM, act: clickChildLink('amnon'), shot: true },
  { id: 'david-link-amnon-day', title: 'Давид: связь к Амнону, день', hash: D_FAM, theme: 'day', act: clickChildLink('amnon') },
  { id: 'david-pan', title: 'Давид, семья, сдвиг', hash: D_FAM, act: pan(-260, 90) },
  // 2. род Давида (1 поколение), семейная укладка
  { id: 'david-rod', title: 'Род Давида (1 пок.), укладка Г', hash: D_ROD, shot: true },
  { id: 'david-rod-day', title: 'Род Давида (1 пок.), день', hash: D_ROD, theme: 'day' },
  // 3. колена
  { id: 'judah-group', title: 'Колено Иудино (созвездие)', hash: '#/iuda~y-1861~w390~l-1.0~s1~mmt-long~vg.judah', shot: true },
  { id: 'benjamin-group', title: 'Колено Вениамина (созвездие)', hash: '#/veniamin~y-1850~w390~l-22.0~s1~mmt-long~vg.benjamin' },
  // 4. Иаков: семья, карточка у звезды, наведение на Иуду, связь Иаков и Рахиль — Вениамин
  { id: 'iakov-fam', title: 'Иаков, семья', hash: I_FAM, shot: true },
  { id: 'iakov-card', title: 'Иаков: карточка у звезды', hash: I_FAM, act: clickStar('iakov') },
  { id: 'iakov-tip', title: 'Иаков: наведение на Иуду', hash: I_FAM, act: hoverStar('iuda') },
  { id: 'iakov-link', title: 'Иаков: связь Иаков и Рахиль — Вениамин', hash: I_FAM, act: clickChildLink('veniamin'), shot: true },
  { id: 'iakov-link-day', title: 'Иаков: связь к Вениамину, день', hash: I_FAM, theme: 'day', act: clickChildLink('veniamin') },
  // 5. обзор: яркие знаки не ложатся друг на друга
  { id: 'iakov-far', title: 'Иаков, обзор', hash: '#/iakov~y-1599~w2500~l-2.0~s1~mmt-long', shot: true },
  { id: 'david-far', title: 'Давид, обзор', hash: '#/david~y-1173~w2500~l0.0~s1~mmt-long' },
  { id: 'all-far', title: 'Всё небо, обзор, без выбора', hash: '#/~y-1393~w6057~l15.1~s1~mmt-long', shot: true },
  // 6. тяжёлые участки
  { id: 'halev-near', title: 'Халев, сын Есрома (1 Пар 2), семья', hash: '#/khalev-syn-esroma~y-1794~w120~l3.0~s1~mmt-long', shot: true },
  { id: 'ashkhur-near', title: 'Ашхур (1 Пар 4), семья', hash: '#/ashkhur~y-1792~w120~l-3.0~s1~mmt-long' },
  { id: 'shegaraim-near', title: 'Шегараим (1 Пар 8), семья', hash: '#/shegaraim~y-1314~w120~l15.0~s1~mmt-long' },
  { id: 'kaaf-near', title: 'Каафиты (1 Пар 6), семья', hash: '#/kaaf~y-1852~w120~l68.0~s1~mmt-long' },
  { id: 'isav-mid', title: 'Исав и Едом (Быт 36), эпоха', hash: '#/isav~y-1926~w400~l-29.0~s1~mmt-long' },
  { id: 'ioktan-near', title: 'Иоктан (Быт 10), семья', hash: '#/ioktan~y-2410~w120~l4.0~s1~mmt-long' },
  { id: 'akhav-mid', title: 'Цари: Ахав, эпоха', hash: '#/akhav~y-824~w400~l-29.0~s1~mmt-long', shot: true },
  { id: 'rovoam-near', title: 'Цари: Ровоам, семья', hash: '#/rovoam~y-942~w150~l2.0~s1~mmt-long' },
  { id: 'zorovavel-mid', title: 'Ленты в плену: Зоровавель', hash: '#/zorovavel~y-508~w300~l1.0~s1~mmt-long' },
  { id: 'iisus-mid', title: 'Новый Завет: Иисус', hash: '#/iisus~y21~w150~l0.0~s1~mmt-long' },
  { id: 'lines', title: 'Линии Мессии (показ)', hash: '#/david~vl', shot: true },
  // 7. телефон 390 × 844 (и 360): лист 55 % и касание (лист 214 px)
  { id: 'phone-iakov', title: 'Телефон: Иаков (лист 55 %)', hash: '#/iakov~w220', ...PHONE, shot: true },
  { id: 'phone-iakov-tap', title: 'Телефон: касание Иакова (лист 214 px)', hash: '#/iakov~w220', ...PHONE, act: both(deselect, tapStar('iakov')), shot: true },
  { id: 'phone-david', title: 'Телефон: Давид (лист 55 %)', hash: '#/david~w100', ...PHONE },
  { id: 'phone-david-tap', title: 'Телефон: касание Давида (лист 214 px)', hash: '#/david~w100', ...PHONE, act: both(deselect, tapStar('david')), shot: true },
  { id: 'phone-iakov-360', title: 'Телефон 360: Иаков (лист 55 %)', hash: '#/iakov~w220', width: 360, height: 780, touch: true },
  // 8. как после поиска (решение 165; R1-06): адрес лица без окна — окно подбирает атлас по ширине и плотности семьи
  ...(['david', 'iakov', 'khalev-syn-esroma'] as const).flatMap((id) => [
    { id: `search-${id}`, title: `После поиска: ${id}, 1440`, hash: `#/${id}`, ms: 4200 },
    { id: `search-${id}-1024`, title: `После поиска: ${id}, 1024`, hash: `#/${id}`, ...W1024, ms: 4200 },
    { id: `search-${id}-390`, title: `После поиска: ${id}, телефон 390`, hash: `#/${id}`, ...PHONE, ms: 4200 },
  ]),
  // окна R1-16 и R2-12: Халев на w400 («Сегув» у звезды Арама), обзор телефона (выноска «Авраам» — в исключении К8)
  { id: 'khalev-w400', title: 'Халев, сын Есрома, окно 400 лет (R1-16)', hash: '#/khalev-syn-esroma~w400' },
  { id: 'phone-far', title: 'Телефон: обзор при входе (R2-12)', hash: '#/', ...PHONE },
  // корпус этапа 15 («Отчий дом», решения 173–181): тяжёлые семьи на обзоре семьи (≈ 113 лет на экран, как снимки
  // владельца) и на масштабе семьи (45–60 лет), без выбора — окно ставится по звезде главы семьи, затем выбор снимается;
  // переходы следов (решение 173) — такие же препятствия для имён, как следы (К1–К8 и по переходам)
  ...FAMILY15.flatMap(([id, fam, o, f, title, mo, mf]) => [
    { id: `s15-${id}-o`, title: `${title}, обзор семьи`, hash: `#/${fam}~w${o}~s1~mmt-long`, mid: mo, act: unselectAt(o, mo), shot: true },
    { id: `s15-${id}-f`, title: `${title}, семья`, hash: `#/${fam}~w${f}~s1~mmt-long`, mid: mf, act: unselectAt(f, mf) },
  ]),
  { id: 's15-iakov-sel', title: 'Иаков выбран, обзор семьи', hash: '#/iakov~w113~s1~mmt-long', mid: -1951, shot: true },
  { id: 's15-david-sel', title: 'Давид выбран, обзор семьи', hash: '#/david~w113~s1~mmt-long', mid: -1005 },
  { id: 's15-famar-sel', title: 'Фамарь выбрана, семья', hash: '#/famar~w60~s1~mmt-long', mid: -1880 },
  { id: 's15-iakov-hover', title: 'Иаков: наведение на Вениамина', hash: '#/iakov~w113~s1~mmt-long', mid: -1951, act: both(unselectAt(113, -1951), hoverStar('veniamin')), shot: true },
];

// ---------- пороги К1–К8 (STAGE14 § 4) ----------

type Counts = ReturnType<typeof measure>['counts'];
/** Нарушения порогов сцены: «К3: линий поверх текста 4» и т. п.; пусто — сцена проходит. */
export function verdict(c: Counts): string[] {
  const out: string[] = [];
  const over = Object.values(c.ltOver).reduce((a, b) => a + b, 0);
  if (c.nnLit) out.push(`К1: ярких знаков друг на друге ${c.nnLit}`);
  if (c.nlStar) out.push(`К2: имён на чужом знаке ${c.nlStar}`);
  if (c.nlGroup) out.push(`К2: названий созвездий на знаке ${c.nlGroup}`);
  if (c.ll) out.push(`К2: подпись на подписи ${c.ll}`);
  if (c.adj) out.push(`К2: слитых подписей ${c.adj}`);
  if (over) out.push(`К3: линий поверх текста ${over}`);
  if (c.selCovered) out.push(`К3: имя выбранного перечёркнуто ${c.selCovered}`);
  if (c.amb + c.glued + c.leaderAmb + c.detached + c.plateAmb + (c.mouthBad ?? 0))
    out.push(`К4: принадлежность — чужой ближе ${c.amb}, вплотную ${c.glued}, выноска ${c.leaderAmb}, далеко ${c.detached}, у ромба ${c.plateAmb}, у устья (К4′) ${c.mouthBad ?? 0} из ${c.mouthNames ?? 0}`);
  if (c.k5 > Math.floor(0.02 * c.starLabels)) out.push(`К5: линий через середину имени ${c.k5} из ${c.starLabels} (порог ${Math.floor(0.02 * c.starLabels)})`);
  if (c.uiLit) out.push(`К6: имён семьи под оверлеем ${c.uiLit}`);
  if (c.uiCut) out.push(`К6: срезанных подписей ${c.uiCut}`);
  if (c.selRingGap !== null && c.selRingGap < 2) out.push(`К7: зазор кольца выбранного до имени ${c.selRingGap} px`);
  if (c.longLeaders) out.push(`К8: выносок длиннее 40 px ${c.longLeaders}`);
  return out;
}

// ---------- сводка ----------

type Row = { id: string; title: string; size: string; hash: string; findings: Finding[] } & ReturnType<typeof measure>['counts'];
/** Таблица по сценам: числа по классам (основа набора COLLISION STRESS) и до пяти примеров на класс. */
export function summary(rows: Row[]): string {
  const kh = '| сцена | имён | К1 | К2 имя на знаке / подпись на подписи / слитые | К3 поверх / выбранное | К4 ближе / вплотную / выноска / далеко / у ромба | К5 (порог) | К6 семья / срезано | К7 px | К8 | итог |';
  const kt = [kh, '|' + '---|'.repeat(11)];
  for (const r of rows) {
    const over = Object.values(r.ltOver).reduce((a, b) => a + b, 0);
    const v = verdict(r);
    kt.push(`| ${r.id} | ${r.starLabels} | ${r.nnLit} | ${r.nlStar} / ${r.ll} / ${r.adj} | ${over} / ${r.selCovered} | ${r.amb} / ${r.glued} / ${r.leaderAmb} / ${r.detached} / ${r.plateAmb} | ${r.k5} (${Math.floor(0.02 * r.starLabels)}) | ${r.uiLit} / ${r.uiCut} | ${r.selRingGap ?? '—'} | ${r.longLeaders} | ${v.length ? 'НЕТ' : 'да'} |`);
  }
  const head = '| сцена | окно | звёзд (ярких) | имён | 1 знак↔знак (ярк.) | 2 знак↔имя / ◆ под именем / черта царя тире | 3 имя↔имя по глифам / вплотную в строку / Placer | 5 линия через текст: все / поверх / по видам / строго (середина строки, ≥ 3 px) | чужая ближе / вплотную / далеко / выносок (чужая ближе) | 7 UI: выбранное, концы, яркие имена, все имена, срезанные, звёзды | ширина/0,56 em p10/p50/p90 |';
  const out = ['## Пороги К1–К8', '', ...kt, '', '## Классы по сценам', '', head, '|' + '---|'.repeat(11)];
  for (const r of rows) {
    const over = Object.values(r.ltOver).reduce((a, b) => a + b, 0);
    const kinds = Object.entries(r.ltKinds).map(([k, v]) => `${k} ${v}`).join(', ');
    out.push(`| ${r.id} | ${r.size} | ${r.stars} (${r.lit}) | ${r.starLabels} | ${r.nn} (${r.nnLit}) | ${r.nl} / ${r.nodeUnder} / ${r.kingDash} | ${r.ll} / ${r.adj} / ${r.placerOverlaps} | ${r.lt} / ${over} / ${kinds} / ${Object.entries(r.ltStrict).map(([k, v]) => `${k} ${v}`).join(', ')} | ${r.amb} / ${r.glued} / ${r.detached} / ${r.leader} (${r.leaderAmb}) / ромб ${r.plateAmb} | ${r.uiSel}, ${r.uiEnds}, ${r.uiLit}, ${r.uiLabels}, ${r.uiCut}, ${r.uiStars} | ${r.widthRatio.join(' / ')} |`);
  }
  out.push('');
  for (const r of rows) {
    out.push(`### ${r.id} — ${r.title} (${r.size})`, `\`${r.hash}\``, '');
    const by = new Map<string, Finding[]>();
    for (const f of r.findings) by.set(f.cls, [...(by.get(f.cls) ?? []), f]);
    for (const [k, fs] of by) out.push(`- **${k}** (${fs.length}): ${fs.slice(0, 5).map((f) => `${f.what} @${Math.round(f.x)},${Math.round(f.y)}`).join('; ')}`);
    out.push('');
  }
  return out.join('\n');
}

/**
 * Открыть сцену на странице p (запись холста REC уже поставлена до загрузки) и снять замер: base — адрес сборки без «#»
 * («http://localhost:4812/»). Для сценариев приёмки (tools/accept/labels14.ts) и прогона COLLISION STRESS.
 */
export async function shoot(p: Page, sc: Scene, base: string) {
  await p.evaluate(
    ([start, theme]) => {
      localStorage.setItem('toledot:cartouche', 'folded');
      localStorage.setItem('toledot:start', JSON.stringify(start));
      localStorage.setItem('toledot:intro', 'true');
      if (theme) localStorage.setItem('toledot:theme', JSON.stringify(theme));
      sessionStorage.clear();
    },
    [sc.start ?? 'all', sc.theme ?? null] as const,
  );
  const url = (hash: string) => `${base.replace(/[?#].*$/, '')}?c=${Date.now()}${hash}`;
  await p.goto(url(sc.hash));
  await p.waitForTimeout(sc.ms ?? 3200);
  // «~w» без «~y»: звезда выбранного — на доле at ширины окна и по середине высоты, ширина окна — заданная (две итерации:
  // масштаб времени по насыщенности нелинеен, поэтому год середины уточняется по месту звезды)
  const wq = /~w(\d+)/.exec(sc.hash);
  if (wq && !/~y/.test(sc.hash)) {
    for (let it = 0; it < 2; it++) {
      const st = await p.evaluate(() => {
        const sky = document.querySelector('.sky') as HTMLElement;
        return { hash: location.hash, view: sky.dataset.view ?? '', sel: sky.dataset.sel ?? '' };
      });
      if (!st.sel) break;
      const [vl, , vr, , , , laneTop, ky] = st.view.split(' ').map(Number);
      const [sx, sy] = st.sel.split(' ').map(Number);
      const y = Number(/~y(-?[\d.]+)/.exec(st.hash)?.[1]);
      const w = Number(/~w([\d.]+)/.exec(st.hash)?.[1]);
      if (!Number.isFinite(y) || !Number.isFinite(w)) break;
      const ny = sc.mid ?? Math.round(y + ((sx - (vl + vr) / 2) * w) / (vr - vl) + Number(wq[1]) * (0.5 - (sc.at ?? 0.3)));
      const nl = (laneTop - sy / ky).toFixed(1);
      const fixed = st.hash.replace(/~y-?[\d.]+/, `~y${ny}`).replace(/~w[\d.]+/, `~w${wq[1]}`).replace(/~l-?[\d.]+/, `~l${nl}`);
      if (fixed === st.hash && it > 0) break;
      await p.goto(url(fixed));
      await p.waitForTimeout(2400);
    }
  }
  // указатель — в угол: без наведения
  if (!sc.touch) await p.mouse.move(2, (sc.height ?? 900) - 2);
  await p.waitForTimeout(400);
  let note: string | void = '';
  if (sc.act) note = await sc.act(p, () => grab(p));
  await p.waitForTimeout(500);
  const g = await grab(p);
  const P = parse(g);
  const m = measure(g, P);
  return { g, P, m, note };
}

// ---------- прогон ----------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const list: Scene[] = SCENES;
  const want = arg('scenes')?.split(',');
  const port = Number(arg('port') ?? 4790);
  const dist = arg('dist') ?? 'dist';
  const out = arg('out') ?? join(SHOTS, 'collide');
  if (process.argv.includes('--list')) {
    for (const sc of list) console.log(`${sc.id.padEnd(22)} ${String(sc.width ?? 1440).padStart(4)} ${sc.theme ?? 'night'} ${sc.hash}${sc.act ? ' + действие' : ''}`);
    return;
  }
  const shots = process.argv.includes('--shots');
  const dump = process.argv.includes('--dump');
  mkdirSync(out, { recursive: true });
  const s = await session(port, { dist });
  const results: Record<string, unknown>[] = [];
  const failed: string[] = [];
  try {
    for (const sc of (list as Scene[]).filter((q) => !want || want.includes(q.id))) {
      const t0 = Date.now();
      const p = await s.page({ width: sc.width ?? 1440, height: sc.height ?? 900, theme: sc.theme ?? 'night', intro: false, touch: sc.touch });
      await p.addInitScript(REC);
      await p.goto(s.url('#/'));
      const { g, P, m, note } = await shoot(p, sc, s.url(''));
      if (shots || sc.shot) await p.screenshot({ path: join(out, `${sc.id}.png`) });
      if (dump) writeFileSync(join(out, `${sc.id}.frame.json`), JSON.stringify({ g: { ...g, ops: undefined }, P: { ...P, raw: undefined } }));
      results.push({ id: sc.id, title: sc.title, hash: g.hash, size: `${sc.width ?? 1440}×${sc.height ?? 900}${sc.touch ? ' касание' : ''}`, note: note || '', ops: g.ops.length, ...m.counts, uiWhat: m.uiWhat, findings: m.findings });
      const c = m.counts;
      const bad = verdict(c);
      if (bad.length) failed.push(`${sc.id}: ${bad.join('; ')}`);
      console.log(
        `${sc.id.padEnd(22)} ${g.hash.slice(0, 48).padEnd(48)} зв ${String(c.stars).padStart(4)} имён ${String(c.starLabels).padStart(3)} | 1:${c.nn}/${c.nnLit} 2:${c.nl} (имя ${c.nlStar}, созвездие ${c.nlGroup}, ◆ ${c.nodeUnder}, черта ${c.kingDash}) 3:${c.ll} (${c.llStar}) вплотную ${c.adj} 5:${c.lt} ${JSON.stringify(c.ltKinds)} поверх ${JSON.stringify(c.ltOver)} строго ${JSON.stringify(c.ltStrict)} | чужая ближе ${c.amb} вплотную ${c.glued} выносок ${c.leader} (чужая ближе ${c.leaderAmb}) далеко ${c.detached} у ромба ${c.plateAmb} у устья ${c.mouthNames} (К4′ ${c.mouthBad}) | UI выбр ${c.uiSel} концы ${c.uiEnds} зв ${c.uiStars} имён ${c.uiLabels} (ярких ${c.uiLit}, срезано ${c.uiCut}) | выбр. имя ${c.selNamed} поверх ${c.selCovered} | Placer ${c.placerOverlaps} вылет ${c.boxOut}/${c.boxOutMax} ширина ${c.widthRatio.join('/')} | К7 ${c.selRingGap ?? '—'} К8 ${c.longLeaders} (опорных до 100 px ${c.wideLeaders}) К5 ${c.k5} (разрывов верхней ступени ${c.k5cut}) ${note || ''} ${((Date.now() - t0) / 1000).toFixed(0)} с | ${bad.length ? 'НЕТ' : 'да'}`,
      );
      await p.context().close();
    }
  } finally {
    await s.close();
  }
  writeFileSync(join(out, 'collide.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(out, 'collide.md'), summary(results as unknown as Row[]));
  if (s.errors.length) console.log('ошибки страницы:', s.errors.slice(0, 5));
  console.log(failed.length ? `\nПороги К1–К8 нарушены в ${failed.length} сценах:\n${failed.join('\n')}` : '\nПороги К1–К8: все сцены проходят');
  if (failed.length) process.exitCode = 1;
}

export { grab, parse, measure, REC, hoverStar, pan, clickChildLink, tapStar, W, starXY, canvasPt };
export type { Scene, Grab };

if (process.argv[1]?.endsWith('collide.ts')) await main();
