/**
 * Камера неба. Горизонталь — мировые единицы времени (после масштаба времени), вертикаль — полосы.
 * Увеличение анизотропное: масштаб по времени kx меняется свободно, высота полосы ky следует за ним,
 * но остаётся в пределах [kyMin, KY_MAX] (ТЗ § 3.1, замечание картографа).
 * Перелёт — оптимальная траектория ван Вейка — Нёйса (2003) для пары (центр, ширина окна).
 */
export const KX_MIN = 0.004;
export const KX_MAX = 12;
export const KY_MAX = 26;

export interface ViewState {
  x0: number; // мировая x левого края
  kx: number; // пикселей на единицу x
  laneTop: number; // полоса у верхнего края (дробная)
}

export class Camera {
  x0 = 0;
  kx = 0.012;
  laneTop = 10;
  w = 1000;
  h = 700;
  laneSpan = 100;
  private anim: { raf: number } | null = null;

  kyMin(): number {
    return Math.max(1.2, Math.min(6, this.h / (this.laneSpan + 6)));
  }
  kyFor(kx: number): number {
    const k = 3.5 + 3.3 * Math.log2(Math.max(kx, 1e-6) / 0.014);
    return Math.max(this.kyMin(), Math.min(KY_MAX, k));
  }
  get ky(): number {
    return this.kyFor(this.kx);
  }
  sx(x: number): number {
    return (x - this.x0) * this.kx;
  }
  sy(lane: number): number {
    return (this.laneTop - lane) * this.ky;
  }
  wx(sx: number): number {
    return this.x0 + sx / this.kx;
  }
  wLane(sy: number): number {
    return this.laneTop - sy / this.ky;
  }
  state(): ViewState {
    return { x0: this.x0, kx: this.kx, laneTop: this.laneTop };
  }
  set(s: ViewState) {
    this.x0 = s.x0;
    this.kx = Math.max(KX_MIN, Math.min(KX_MAX, s.kx));
    this.laneTop = s.laneTop;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.stop();
    const wx = this.wx(sx);
    const lane = this.wLane(sy);
    this.kx = Math.max(KX_MIN, Math.min(KX_MAX, this.kx * factor));
    this.x0 = wx - sx / this.kx;
    this.laneTop = lane + sy / this.ky;
  }
  pan(dx: number, dy: number) {
    this.stop();
    this.x0 -= dx / this.kx;
    this.laneTop += dy / this.ky;
  }
  fit(xMin: number, xMax: number, laneMin: number, laneMax: number, pad = 40) {
    this.kx = Math.max(KX_MIN, (this.w - pad * 2) / Math.max(1, xMax - xMin));
    this.x0 = xMin - pad / this.kx;
    const mid = (laneMin + laneMax) / 2;
    this.laneTop = mid + this.h / 2 / this.ky;
  }

  stop() {
    if (this.anim) cancelAnimationFrame(this.anim.raf);
    this.anim = null;
  }

  /** Перелёт к точке (x, lane) с шириной окна wTarget мировых единиц. */
  flyTo(x: number, lane: number, wTarget: number, onFrame: () => void, reduced = false) {
    this.stop();
    const w0 = this.w / this.kx;
    const c0x = this.x0 + w0 / 2;
    const c0l = this.laneTop - this.h / 2 / this.ky;
    const w1 = wTarget;
    const finish = () => {
      this.kx = Math.max(KX_MIN, Math.min(KX_MAX, this.w / w1));
      this.x0 = x - this.w / 2 / this.kx;
      this.laneTop = lane + this.h / 2 / this.ky;
      onFrame();
    };
    if (reduced) {
      finish();
      return;
    }
    // ван Вейк — Нёйс: ρ = √2
    const rho = Math.SQRT2;
    const rho2 = 2;
    const rho4 = 4;
    const dx = x - c0x;
    const d2 = dx * dx;
    const d1 = Math.sqrt(d2);
    let S: number;
    let interp: (s: number) => [number, number];
    if (d1 < 1e-9) {
      S = Math.log(w1 / w0) / rho;
      interp = (s) => [c0x, w0 * Math.exp(rho * s * S)];
    } else {
      const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
      const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
      const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
      const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / rho;
      const cosh = (v: number) => (Math.exp(v) + Math.exp(-v)) / 2;
      const sinh = (v: number) => (Math.exp(v) - Math.exp(-v)) / 2;
      const tanh = (v: number) => sinh(v) / cosh(v);
      interp = (s) => {
        const sS = s * S;
        const coshr0 = cosh(r0);
        const u = (w0 / (rho2 * d1)) * (coshr0 * tanh(rho * sS + r0) - sinh(r0));
        return [c0x + u * dx, (w0 * coshr0) / cosh(rho * sS + r0)];
      };
    }
    const duration = Math.max(400, Math.min(1400, Math.abs(S) * 900));
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const [cx, cw] = interp(e);
      this.kx = Math.max(KX_MIN, Math.min(KX_MAX, this.w / cw));
      this.x0 = cx - this.w / 2 / this.kx;
      const cl = c0l + (lane - c0l) * e;
      this.laneTop = cl + this.h / 2 / this.ky;
      onFrame();
      if (t < 1) this.anim = { raf: requestAnimationFrame(step) };
      else {
        this.anim = null;
        finish();
      }
    };
    this.anim = { raf: requestAnimationFrame(step) };
  }
}
