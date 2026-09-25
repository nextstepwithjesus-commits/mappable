import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { lines } from '../data/atlas.ts';
import { model, meridian, theme } from '../state.ts';
import { skyRef, viewTick } from './common.tsx';
import { toAstro, toHist } from '../engine/years.ts';
import { readPalette } from '../render/sky.ts';

const T0 = toAstro(-4174) - 10;
const T1 = 2040;
const TODAY = new Date().getFullYear();
const CANON_END = 95;
const PAD = 14;

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
    const xOf = (t: number) => PAD + ((t - T0) / (T1 - T0)) * (W - PAD * 2);
    const tOf = (x: number) => T0 + ((x - PAD) / (W - PAD * 2)) * (T1 - T0);
    let hist: number[] = [];
    const buildHist = () => {
      const bins = new Array(Math.ceil((T1 - T0) / 25)).fill(0);
      for (const c of model.value.chrono.values()) {
        if (c.cls === 'epochal') continue;
        const i = Math.floor((c.b - T0) / 25);
        if (i >= 0 && i < bins.length) bins[i]++;
      }
      hist = bins;
    };
    buildHist();

    const view = () => {
      const s = skyRef.current;
      if (!s || !s.model) return null;
      return { a: s.tOf(s.cam.wx(18)), b: s.tOf(s.cam.wx(s.cam.w)) };
    };

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
        ctx.font = "450 11px 'Jost Variable', Jost, sans-serif";
        const tw = ctx.measureText(e.short).width;
        if (b - a > tw + 6) {
          ctx.fillStyle = pal.ink3;
          ctx.fillText(e.short, a + (b - a - tw) / 2, 13);
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
      // завершение канона и «сегодня»
      const mark = (t: number, label: string, dashed: boolean) => {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.strokeStyle = pal.ink2;
        ctx.setLineDash(dashed ? [2, 2] : []);
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, H - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "italic 400 11.5px 'Literata Variable', serif";
        ctx.fillStyle = pal.ink2;
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, Math.min(W - tw - 4, x + 4), H - 10);
      };
      mark(CANON_END, 'завершение канона', true);
      mark(TODAY, 'сегодня', false);
      ctx.font = "450 11px 'Jost Variable', sans-serif";
      ctx.fillStyle = pal.ink3;
      ctx.fillText('2040', W - PAD - ctx.measureText('2040').width, 13);
      ctx.fillText('4174 до Р. Х.', PAD, H - 10);
      // окно неба
      const v = view();
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
        ctx.font = "500 11.5px 'Jost Variable', sans-serif";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = pal.sky;
        ctx.fillRect(Math.min(W - tw - 10, x + 4), 26, tw + 6, 15);
        ctx.fillStyle = pal.ink;
        ctx.fillText(label, Math.min(W - tw - 7, x + 7), 37);
      }
    };

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
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
      draw();
    });
    const off3 = effect(() => {
      void theme.value;
      requestAnimationFrame(() => {
        pal = readPalette();
        draw();
      });
    });

    // ---------- взаимодействие: тянуть окно, растягивать края, щелчок по эпохе ----------
    let drag: { mode: 'move' | 'left' | 'right' | 'new'; x: number; a: number; b: number; moved: boolean } | null = null;
    const setView = (ta: number, tb: number) => {
      const s = skyRef.current;
      if (!s) return;
      const xa = s.xOf(Math.max(T0, ta));
      const xb = s.xOf(Math.min(T1, tb));
      if (xb - xa < 5) return;
      const midLane = s.cam.wLane(s.cam.h / 2);
      s.cam.kx = (s.cam.w - 18) / (xb - xa);
      s.cam.x0 = xa - 18 / s.cam.kx;
      s.cam.laneTop = midLane + s.cam.h / 2 / s.cam.ky;
      skyRef.redraw();
    };
    const onDown = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId);
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const v = view();
      if (!v) return;
      const a = xOf(v.a);
      const b = xOf(v.b);
      const hitZone = 22; // 44 px зона захвата
      let mode: 'move' | 'left' | 'right' | 'new' = 'new';
      if (Math.abs(x - a) < hitZone && b - a > 30) mode = 'left';
      else if (Math.abs(x - b) < hitZone && b - a > 30) mode = 'right';
      else if (x > a && x < b) mode = 'move';
      drag = { mode, x, a: v.a, b: v.b, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      meridian.value = drag ? null : tOf(x);
      if (!drag) return;
      const dt = tOf(x) - tOf(drag.x);
      if (Math.abs(x - drag.x) > 2) drag.moved = true;
      if (!drag.moved) return;
      if (drag.mode === 'move' || drag.mode === 'new') setView(drag.a + dt, drag.b + dt);
      else if (drag.mode === 'left') setView(Math.min(drag.a + dt, drag.b - 3), drag.b);
      else setView(drag.a, Math.max(drag.b + dt, drag.a + 3));
    };
    const onUp = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        const r = cv.getBoundingClientRect();
        const t = tOf(e.clientX - r.left);
        const ep = model.value.epochs.find((x) => t >= toAstro(x.start) && t < toAstro(x.end));
        if (ep) {
          const span = toAstro(ep.end) - toAstro(ep.start);
          const pad = Math.max(10, span * 0.04);
          setView(toAstro(ep.start) - pad, Math.min(toAstro(ep.end), 110) + pad);
        }
      }
      drag = null;
    };
    const onLeave = () => {
      if (!drag) meridian.value = null;
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', onLeave);
    return () => {
      ro.disconnect();
      off1();
      off2();
      off3();
    };
  }, []);
  return (
    <div class="strip" ref={wrap}>
      <canvas ref={ref} role="img" aria-label="Полоса времени от сотворения до 2040 года с эпохами и рамкой текущего окна карты. Тяните рамку, чтобы сдвинуть карту; щелчок по эпохе — перелёт к ней." />
    </div>
  );
}
