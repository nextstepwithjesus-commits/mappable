import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { lines } from '../data/atlas.ts';
import { model, meridian, theme } from '../state.ts';
import { skyRef, viewTick } from './common.tsx';
import { formatSpan, toAstro, toHist } from '../engine/years.ts';
import { readPalette } from '../render/sky.ts';
import { T_MAP_S, coarsePointer, mapFont } from '../render/type.ts';
import { reduced, showAll, showYears, stopFlight } from './sky/view.ts';
import { hoverYear } from './sky/meridian.ts';
import { typo } from './text/typo.ts';

/** Начало полосы — сотворение в текущей модели (в модели чисел в скобках — на ~1 400 лет раньше). */
const startOf = () => toAstro(model.value.epochs[0]?.start ?? -4174) - 10;
let T0 = startOf();
const T1 = 2040;
const TODAY = new Date().getFullYear();
const CANON_END = 95;
const PAD = 14;
/** Зона захвата края рамки — по 22 px в каждую сторону (44 px, ТЗ § 3.4). */
const GRIP = 22;
/** Рамка уже этого — её тело целиком отдаётся сдвигу, а ручки краёв выносятся наружу (MAP-42). */
const NARROW = 88;
/** Самое узкое окно неба, лет. */
const MIN_YEARS = 20;
/** Ручка края рамки: видимая черта за краем, px от края до черты и её высота. */
const HANDLE_GAP = 4;
const HANDLE_H = 18;
/** Нажатие вне рамки переносит её середину под указатель за 150 мс (IX-32). */
const RECENTER_MS = 150;
/** Щелчок по эпохе ждёт, не двойной ли это щелчок («всё небо»), мс. */
const DBL_MS = 240;

/** Курсор над полосой: над ручками — ew-resize, над рамкой — grab (при протяжке — grabbing), вне рамки — pointer (IX-33). */
export function stripCursor(g: FrameGrip, dragging: boolean): string {
  if (g === 'left' || g === 'right') return 'ew-resize';
  if (g === 'move') return dragging ? 'grabbing' : 'grab';
  return dragging ? 'grabbing' : 'pointer';
}

/**
 * Окно после стрелки на ползунке полосы (role="slider"): стрелки — на 10 % ширины окна, с Shift и PageUp/PageDown — на 40 %,
 * Home и End — к началу и концу шкалы. Ширина окна не меняется; окно не выходит за шкалу [lo, hi].
 */
export function sliderStep(key: string, shift: boolean, a: number, b: number, lo: number, hi: number): [number, number] | null {
  const w = b - a;
  let na: number;
  if (key === 'ArrowLeft' || key === 'ArrowDown') na = a - w * (shift ? 0.4 : 0.1);
  else if (key === 'ArrowRight' || key === 'ArrowUp') na = a + w * (shift ? 0.4 : 0.1);
  else if (key === 'PageUp') na = a - w * 0.4;
  else if (key === 'PageDown') na = a + w * 0.4;
  else if (key === 'Home') na = lo;
  else if (key === 'End') na = hi - w;
  else return null;
  na = Math.max(Math.min(lo, a), Math.min(Math.max(hi, b) - w, na));
  return [na, na + w];
}

export type FrameGrip = 'move' | 'left' | 'right' | 'new';

/**
 * Что берёт нажатие в точке x полосы при рамке [a, b] (px). У широкой рамки края ловятся на ±22 px, между ними — сдвиг.
 * У узкой (уже 88 px) тело рамки, не меньше 44 px, — сдвиг, а ручки лежат снаружи, по 22 px с каждой стороны.
 */
export function frameGrip(x: number, a: number, b: number): FrameGrip {
  if (b - a >= NARROW) {
    if (Math.abs(x - a) < GRIP) return 'left';
    if (Math.abs(x - b) < GRIP) return 'right';
    return x > a && x < b ? 'move' : 'new';
  }
  const c = (a + b) / 2;
  const half = Math.max((b - a) / 2, GRIP);
  if (x >= c - half && x <= c + half) return 'move';
  if (x >= c - half - GRIP && x < c - half) return 'left';
  if (x > c + half && x <= c + half + GRIP) return 'right';
  return 'new';
}

export function TimeStrip() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let pal = readPalette();
    // кегль полосы — ступень шкалы холста 11,5 px; на сенсорном экране не мельче 12,5 px (B2; MOB-42)
    let coarse = coarsePointer();
    const small = (o: { sans?: boolean; weight?: number; italic?: boolean } = {}) => mapFont(T_MAP_S, { ...o, coarse });
    const xOf = (t: number) => PAD + ((t - T0) / (T1 - T0)) * (W - PAD * 2);
    const tOf = (x: number) => T0 + ((x - PAD) / (W - PAD * 2)) * (T1 - T0);
    let hist: number[] = [];
    const buildHist = () => {
      T0 = startOf();
      const bins = new Array(Math.ceil((T1 - T0) / 25)).fill(0);
      for (const c of model.value.chrono.values()) {
        if (c.cls === 'epochal') continue;
        const i = Math.floor((c.b - T0) / 25);
        if (i >= 0 && i < bins.length) bins[i]++;
      }
      hist = bins;
    };
    buildHist();

    /** Окно неба в годах (астр.): видимая часть неба — без левой кромки, панели и листа карточки. */
    const view = () => {
      const s = skyRef.current;
      if (!s || !s.model) return null;
      const { l, r } = s.cam.vp;
      return { a: s.tOf(s.cam.wx(l)), b: s.tOf(s.cam.wx(r)) };
    };
    // что под указателем: для курсора и ручки, которую подсвечивать
    let grip: FrameGrip | null = null;
    let dragging = false;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = pal.sky;
      ctx.fillRect(0, 0, W, H);
      // эпохи
      model.value.epochs.forEach((e, i) => {
        const a = xOf(toAstro(e.start));
        const b = xOf(toAstro(e.end));
        ctx.fillStyle = i % 2 ? pal.band : pal.sky;
        ctx.fillRect(a, 0, b - a, H);
        ctx.strokeStyle = pal.rule;
        ctx.beginPath();
        ctx.moveTo(Math.round(a) + 0.5, 0);
        ctx.lineTo(Math.round(a) + 0.5, H);
        ctx.stroke();
        ctx.font = small({ sans: true, weight: 450 });
        const tw = ctx.measureText(e.short).width;
        const lx = a + (b - a - tw) / 2;
        // не заходить на крайние подписи годов (слева — начало, справа — 2040)
        if (b - a > tw + 6 && lx > PAD + 84 && lx + tw < W - PAD - 36) {
          ctx.fillStyle = pal.ink3;
          ctx.fillText(e.short, lx, 13);
        }
      });
      // плотность лиц
      const max = Math.max(1, ...hist);
      ctx.fillStyle = pal.ink3;
      hist.forEach((n, i) => {
        if (!n) return;
        const x = xOf(T0 + i * 25);
        const w = Math.max(1, xOf(T0 + (i + 1) * 25) - x - 0.3);
        const h = Math.max(1, Math.sqrt(n / max) * (H - 38));
        ctx.fillRect(x, H - 6 - h, w, h);
      });
      // нити двух линий
      const lineSpan = (ids: string[]) => {
        const bs = ids.map((id) => model.value.chrono.get(id)?.b).filter((x): x is number => x !== undefined);
        return bs.length ? [Math.min(...bs), Math.max(...bs)] : null;
      };
      const js = lineSpan(lines.joseph.persons.map((p) => p.id));
      const ms = lineSpan(lines.mary.persons.map((p) => p.id));
      ctx.lineWidth = 1.5;
      if (js) {
        ctx.strokeStyle = pal.gold1;
        ctx.beginPath();
        ctx.moveTo(xOf(js[0]), 20.5);
        ctx.lineTo(xOf(js[1]), 20.5);
        ctx.stroke();
      }
      if (ms) {
        ctx.strokeStyle = pal.azure1;
        ctx.beginPath();
        ctx.moveTo(xOf(ms[0]), 23.5);
        ctx.lineTo(xOf(ms[1]), 23.5);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      // ручки рамки окна (где они будут нарисованы ниже): подписи «завершения канона» и «сегодня» их обходят
      const v = view();
      const grips: { x: number; w: number }[] = [];
      if (v) {
        const a = xOf(v.a);
        const b = xOf(v.b);
        const c = (a + b) / 2;
        const half = b - a >= NARROW ? (b - a) / 2 : Math.max((b - a) / 2, GRIP / 2);
        for (const side of ['left', 'right'] as const) {
          const edge = side === 'left' ? Math.min(a, c - half) : Math.max(b, c + half);
          const x0 = Math.round(side === 'left' ? edge - HANDLE_GAP - 7 : edge + HANDLE_GAP);
          grips.push({ x: x0 - 2, w: 11 });
        }
      }
      const onGrip = (lx: number, tw: number) => grips.some((h) => lx < h.x + h.w + 2 && h.x - 2 < lx + tw);
      // завершение канона и «сегодня»
      const mark = (t: number, label: string, dashed: boolean, maxEnd = Infinity) => {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.strokeStyle = pal.ink2;
        ctx.setLineDash(dashed ? [2, 2] : []);
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, H - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = small({ italic: true });
        ctx.fillStyle = pal.ink2;
        const tw = ctx.measureText(label).width;
        // подпись — справа от черты; у правого края — слева от неё, чтобы черта не перечёркивала слово (VIS-25);
        // если на месте подписи ручка рамки — подпись уходит вправо за ручку, а не под неё; не помещается — не рисуется
        let lx = x + 4 + tw <= W - 4 ? x + 4 : x - tw - 4;
        for (const g of grips) if (onGrip(lx, tw)) lx = Math.max(lx, g.x + g.w + 4);
        if (lx + tw < Math.min(maxEnd, W - 2) && lx >= 2 && !onGrip(lx, tw)) ctx.fillText(label, lx, H - 10);
        return lx;
      };
      ctx.font = small({ italic: true });
      const todayX = mark(TODAY, 'сегодня', false);
      mark(CANON_END, W < 700 ? 'канон' : 'завершение канона', true, todayX - 8);
      ctx.font = small({ sans: true, weight: 450 });
      ctx.fillStyle = pal.ink3;
      ctx.fillText('2040', W - PAD - ctx.measureText('2040').width, 13);
      ctx.fillText(`${-toHist(T0 + 10)} до Р. Х.`, PAD, 13);
      // окно неба
      const handles: { x: number; w: number }[] = [];
      if (v) {
        const a = xOf(v.a);
        const b = xOf(v.b);
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.round(a) + 0.5, 2.5, Math.max(3, b - a), H - 5);
        ctx.lineWidth = 1;
        ctx.fillStyle = pal.ink;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(a, 2, Math.max(3, b - a), H - 4);
        ctx.globalAlpha = 1;
        // ручки — снаружи рамки: короткие черты за левым и правым краем; ручка под указателем — толще (IX-33, UX-28)
        const c = (a + b) / 2;
        const half = b - a >= NARROW ? (b - a) / 2 : Math.max((b - a) / 2, GRIP / 2);
        // ручки — ниже подписи года меридиана (26–41 px), над основанием столбцов
        const hy = Math.round(Math.min(H - HANDLE_H - 4, Math.max(44, H - HANDLE_H - 10)));
        for (const side of ['left', 'right'] as const) {
          const edge = side === 'left' ? Math.min(a, c - half) : Math.max(b, c + half);
          // ручка — две черты на подложке цвета неба, чтобы не сливаться со столбцами плотности
          const x0 = Math.round(side === 'left' ? edge - HANDLE_GAP - 7 : edge + HANDLE_GAP);
          const hot = grip === side;
          ctx.fillStyle = pal.sky;
          ctx.fillRect(x0 - 2, hy - 3, 11, HANDLE_H + 6);
          handles.push({ x: x0 - 2, w: 11 });
          ctx.fillStyle = pal.ink;
          ctx.fillRect(x0, hy, hot ? 3 : 2, HANDLE_H);
          ctx.fillRect(x0 + 5, hy, hot ? 3 : 2, HANDLE_H);
        }
        // окно в годах — для проверок приёмки (tools/accept.ts)
        wrap.current!.dataset.window = `${v.a.toFixed(1)} ${v.b.toFixed(1)}`;
        // ползунок для клавиатуры и диктора (MOB-35): середина окна и окно словами
        const mid = toHist((v.a + v.b) / 2);
        cv.setAttribute('aria-valuenow', String(mid));
        cv.setAttribute('aria-valuetext', `Окно карты: ${typo(formatSpan(Math.max(T0, v.a), Math.min(T1, v.b)))}`);
      }
      // меридиан
      if (meridian.value !== null) {
        const x = Math.round(xOf(meridian.value)) + 0.5;
        ctx.strokeStyle = pal.ink;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
        const h = toHist(meridian.value);
        const label = h < 0 ? `${-h} г. до Р. Х.` : `${h} г. по Р. Х.`;
        ctx.font = small({ sans: true, weight: 500 });
        const tw = ctx.measureText(label).width;
        // подпись года — справа от черты; если там ручка рамки — слева: ручку подпись не закрывает
        const over = (lx: number) => handles.some((h) => lx < h.x + h.w && h.x < lx + tw + 6);
        let lx = Math.min(W - tw - 10, x + 4);
        if (over(lx)) lx = Math.max(2, x - tw - 10);
        ctx.fillStyle = pal.sky;
        ctx.fillRect(lx, 26, tw + 6, 15);
        ctx.fillStyle = pal.ink;
        ctx.fillText(label, lx + 3, 37);
      }
    };

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      coarse = coarsePointer();
      W = r.width;
      H = r.height;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    const off1 = effect(() => {
      void viewTick.value;
      void meridian.value;
      draw();
    });
    const off2 = effect(() => {
      void model.value;
      buildHist();
      cv.setAttribute('aria-valuemin', String(toHist(T0)));
      draw();
    });
    const off3 = effect(() => {
      void theme.value;
      requestAnimationFrame(() => {
        pal = readPalette();
        draw();
      });
    });

    // ---------- взаимодействие: тянуть окно, растягивать края, щелчок по эпохе, клавиши ----------
    let drag: { mode: FrameGrip; x: number; a: number; b: number; moved: boolean } | null = null;
    /** Окно неба [ta, tb] лет сразу (протяжка, клавиши); clamp — не шире шкалы. */
    const setView = (ta: number, tb: number, clamp = true) => {
      const a = clamp ? Math.max(T0, ta) : ta;
      const b = clamp ? Math.min(T1, tb) : tb;
      if (!(b > a)) return;
      showYears(a, b, false);
    };
    /** Сдвиг окна без изменения его ширины: у краёв шкалы окно упирается, а не сжимается. */
    const shiftView = (a: number, b: number, dt: number) => {
      const lo = Math.min(T0, a);
      const hi = Math.max(T1, b);
      const na = Math.max(lo, Math.min(hi - (b - a), a + dt));
      setView(na, na + (b - a), false);
    };
    let recenter = 0;
    let epochTimer = 0;
    const setCursor = () => {
      cv.style.cursor = grip ? stripCursor(grip, dragging) : '';
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      // нажатие на полосе прерывает перелёт (D4) и отложенный щелчок по эпохе
      stopFlight();
      cancelAnimationFrame(recenter);
      clearTimeout(epochTimer);
      // во время протяжки меридиана нет (D13)
      hoverYear(null);
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const v = view();
      if (!v) return;
      const mode = frameGrip(x, xOf(v.a), xOf(v.b));
      drag = { mode, x, a: v.a, b: v.b, moved: false };
      dragging = true;
      grip = mode;
      setCursor();
      if (mode === 'new') {
        // нажатие вне рамки: её середина переезжает под указатель за 150 мс, дальше протягивание двигает (IX-32)
        const w = v.b - v.a;
        const t = tOf(x);
        const to = Math.max(Math.min(T0, v.a), Math.min(Math.max(T1, v.b) - w, t - w / 2));
        drag = { mode: 'move', x, a: to, b: to + w, moved: false };
        const from = v.a;
        const start = performance.now();
        const step = (now: number) => {
          const k = reduced() ? 1 : Math.min(1, (now - start) / RECENTER_MS);
          const e2 = 1 - Math.pow(1 - k, 3);
          const na = from + (to - from) * e2;
          setView(na, na + w, false);
          if (k < 1) recenter = requestAnimationFrame(step);
        };
        recenter = requestAnimationFrame(step);
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (!drag) {
        const v = view();
        const g = v ? frameGrip(x, xOf(v.a), xOf(v.b)) : null;
        // над ручкой — ширина окна, а не год: меридиан с подписью закрыл бы ручку
        // меридиан — через 250 мс и не над ручками (D13; src/ui/sky/meridian.ts)
        hoverYear(g === 'left' || g === 'right' ? null : tOf(x));
        if (g !== grip) {
          grip = g;
          draw();
        }
        setCursor();
        return;
      }
      hoverYear(null);
      const dt = tOf(x) - tOf(drag.x);
      if (Math.abs(x - drag.x) > 2) drag.moved = true;
      if (!drag.moved) return;
      cancelAnimationFrame(recenter);
      if (drag.mode === 'move' || drag.mode === 'new') shiftView(drag.a, drag.b, dt);
      else if (drag.mode === 'left') setView(Math.min(drag.a + dt, drag.b - MIN_YEARS), drag.b);
      else setView(drag.a, Math.max(drag.b + dt, drag.a + MIN_YEARS));
    };
    const onUp = (e: PointerEvent) => {
      if (drag && !drag.moved && e.type === 'pointerup') {
        const r = cv.getBoundingClientRect();
        const t = tOf(e.clientX - r.left);
        const ep = model.value.epochs.find((x) => t >= toAstro(x.start) && t < toAstro(x.end));
        // щелчок по эпохе — перелёт к ней (D4); чуть позже, чтобы двойной щелчок успел стать «всем небом»
        if (ep) {
          clearTimeout(epochTimer);
          epochTimer = window.setTimeout(() => {
            cancelAnimationFrame(recenter);
            const span = toAstro(ep.end) - toAstro(ep.start);
            const pad = Math.max(10, span * 0.04);
            showYears(toAstro(ep.start) - pad, toAstro(ep.end) + pad, true);
          }, DBL_MS);
        }
      }
      drag = null;
      dragging = false;
      setCursor();
    };
    const onDbl = () => {
      // двойной щелчок — всё небо (UX-28)
      clearTimeout(epochTimer);
      cancelAnimationFrame(recenter);
      showAll();
    };
    const onLeave = () => {
      if (!drag) {
        hoverYear(null);
        if (grip) {
          grip = null;
          draw();
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const v = view();
      if (!v || e.ctrlKey || e.metaKey || e.altKey) return;
      const next = sliderStep(e.key, e.shiftKey, v.a, v.b, T0, T1);
      if (!next) return;
      e.preventDefault();
      stopFlight();
      setView(next[0], next[1], false);
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      off1();
      off2();
      off3();
      cancelAnimationFrame(recenter);
      clearTimeout(epochTimer);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('dblclick', onDbl);
      cv.removeEventListener('keydown', onKey);
    };
  }, []);
  const epochs = model.value.epochs;
  return (
    <div class="strip" ref={wrap}>
      {/* ползунок окна карты: стрелки — сдвиг на 10 % (Shift — на 40 %), Home и End — к краям шкалы, «+» и «−» — ширина */}
      <canvas
        ref={ref}
        tabIndex={0}
        role="slider"
        aria-label="Полоса времени от сотворения до 2040 года: окно карты"
        aria-valuemax={2040}
        aria-orientation="horizontal"
        aria-describedby="strip-help"
        title="Тяните рамку или её края; щелчок по эпохе — перелёт к ней, двойной щелчок — всё небо"
      />
      <p id="strip-help" class="visually-hidden">
        Стрелки влево и вправо сдвигают окно карты, с Shift — дальше; Home и End — к началу и концу шкалы; плюс и минус меняют ширину окна.
      </p>
      <ul class="visually-hidden" aria-label="Эпохи на полосе времени">
        {epochs.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => showYears(toAstro(e.start), toAstro(e.end), true)}>
              {typo(`${e.name}, ${formatSpan(toAstro(e.start), toAstro(e.end))}`)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
