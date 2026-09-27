/**
 * Камера неба. Горизонталь — мировые единицы времени (после масштаба времени), вертикаль — полосы.
 * Увеличение анизотропное: масштаб по времени kx меняется свободно, высота полосы ky следует за ним,
 * но остаётся в пределах [kyMin, KY_MAX] (ТЗ § 3.1, замечание картографа).
 *
 * Видимая часть холста (vp) — то, что не закрыто рамкой, ярусами эпох, листом карточки и вступлением.
 * Всё, что ставит лицо «в середину», и «всё небо» (fit) считаются от неё, а не от холста (C1, D2).
 *
 * Пределы (D2; IX-03, MAP-01, MAP-38, MOB-01):
 *  — отдаление не дальше «всего неба»: при kx = fit.kx в видимую часть входит всё небо по обеим осям;
 *    на этом масштабе и рядом с ним полоса ниже (fit.ky), чем обычно, и плавно догоняет обычную высоту
 *    за два удвоения масштаба;
 *  — приближение не больше ~20 лет на ширину видимой части (kxMaxAt);
 *  — в окне остаётся не меньше четверти данных; за краем данных — упругий упор до 80 px и возврат за 200 мс.
 *
 * Перелёт — оптимальная траектория ван Вейка — Нёйса (2003) для пары (центр, ширина окна).
 * Все движения камеры (перелёт, шаг масштаба, сдвиг, возврат от упора) — одна анимация; stop() прерывает любую.
 */
export const KX_MIN = 0.004;
export const KX_MAX = 12;
export const KY_MAX = 26;
/** За сколько удвоений масштаба от «всего неба» высота полосы догоняет обычную. */
const FIT_BLEND = 2;
/** Упругий упор за краем данных, px. */
const RUBBER = 80;
/** Сколько ждать после последнего сдвига, прежде чем вернуть небо от упора, мс. */
const SETTLE_AFTER = 140;
const SETTLE_MS = 200;
/** Поля «всего неба», px: слева — место для звезды Адама, справа — узкое: после 100 г. шкала сжата, и поле в 20 px — это века. */
const FIT_PAD = { l: 10, r: 6, y: 10 };
/** Сколько px за краем данных видно всегда. */
const EDGE = 16;

export interface ViewState {
  x0: number; // мировая x левого края
  kx: number; // пикселей на единицу x
  laneTop: number; // полоса у верхнего края (дробная)
}

/** Прямоугольник в px холста: left, top, right, bottom. */
export interface Viewport {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Рамка данных: мировые x и полосы. */
export interface Frame {
  x0: number;
  x1: number;
  lane0: number;
  lane1: number;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export class Camera {
  x0 = 0;
  kx = 0.012;
  laneTop = 10;
  w = 1000;
  h = 700;
  laneSpan = 100;
  /** видимая часть холста */
  vp: Viewport = { l: 0, t: 0, r: 1000, b: 700 };
  /** рамка данных для пределов сдвига; null — пределов нет */
  frame: Frame | null = null;
  /** масштаб «всего неба»: при нём рамка «всего неба» вписана в видимую часть по обеим осям */
  fitK: { kx: number; ky: number } | null = null;
  /** наибольший kx у мировой x (≈ 20 лет на ширину видимой части) */
  kxMaxAt: (x: number) => number = () => KX_MAX;
  /** кадр после шага анимации камеры (возврат от упора, шаг масштаба) */
  onChange: () => void = () => {};
  /** указатель нажат: небо у упора не возвращается, пока его держат */
  private held = false;
  private anim: { raf: number } | null = null;
  /** сдвиг за край: позиция «без упора» и то, что было показано после последнего сдвига */
  private raw: { x0: number; laneTop: number; shownX0: number; shownLane: number } | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  kyMin(): number {
    return Math.max(1.2, Math.min(6, this.h / (this.laneSpan + 6)));
  }
  kyFor(kx: number): number {
    const g = Math.max(this.kyMin(), Math.min(KY_MAX, 3.5 + 3.3 * Math.log2(Math.max(kx, 1e-6) / 0.014)));
    const f = this.fitK;
    if (!f) return g;
    const u = Math.log2(kx / f.kx) / FIT_BLEND;
    if (u <= 0) return Math.min(KY_MAX, f.ky);
    if (u >= 1) return Math.min(KY_MAX, Math.max(f.ky, g));
    const s = u * u * (3 - 2 * u);
    return Math.min(KY_MAX, Math.max(f.ky, Math.exp((1 - s) * Math.log(f.ky) + s * Math.log(g))));
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
    this.raw = null;
    this.x0 = s.x0;
    this.kx = Math.max(KX_MIN * 0.25, Math.min(KX_MAX, s.kx));
    this.laneTop = s.laneTop;
  }

  // ---------- пределы ----------
  /** Самый мелкий масштаб: «всё небо». */
  kxLo(): number {
    return this.fitK ? this.fitK.kx : KX_MIN;
  }
  /** kx в пределах: не мельче «всего неба», не крупнее ~20 лет на ширину у мировой x. */
  clampKx(kx: number, atX: number): number {
    const hi = Math.min(KX_MAX, this.kxMaxAt(atX));
    return Math.max(this.kxLo(), Math.min(hi, kx));
  }
  /** Центр видимой части в px холста. */
  vpCenter(): [number, number] {
    return [(this.vp.l + this.vp.r) / 2, (this.vp.t + this.vp.b) / 2];
  }
  /**
   * Допустимые x0 и laneTop при масштабе kx: в окне остаётся не меньше четверти данных. На «всём небе» сдвига почти нет:
   * запас за краем растёт с приближением и за одно удвоение доходит до ¾ окна.
   */
  bounds(kx: number): { x: [number, number]; lane: [number, number] } | null {
    const f = this.frame;
    if (!f) return null;
    const ky = this.kyFor(kx);
    const vw = (this.vp.r - this.vp.l) / kx;
    const vh = (this.vp.b - this.vp.t) / ky;
    const s = Math.max(0, Math.min(1, Math.log2(kx / this.kxLo())));
    const dx = f.x1 - f.x0;
    const dl = f.lane1 - f.lane0;
    // за краем данных всегда можно заглянуть на EDGE px (поля «всего неба»)
    const overX = Math.max((vw - dx) / 2, 0.75 * vw * s, EDGE / kx);
    const overL = Math.max((vh - dl) / 2, 0.75 * vh * s, EDGE / ky);
    const xa = f.x0 - overX - this.vp.l / kx;
    const xb = f.x1 + overX - this.vp.r / kx;
    const la = f.lane0 - overL + this.vp.b / ky;
    const lb = f.lane1 + overL + this.vp.t / ky;
    return { x: xa <= xb ? [xa, xb] : [(xa + xb) / 2, (xa + xb) / 2], lane: la <= lb ? [la, lb] : [(la + lb) / 2, (la + lb) / 2] };
  }
  /** Вид в пределах: масштаб и положение. */
  constrain(v: ViewState): ViewState {
    const kx = this.clampKx(v.kx, v.x0 + (this.vpCenter()[0]) / v.kx);
    // масштаб поменялся — середина видимой части остаётся на месте
    let { x0, laneTop } = v;
    if (kx !== v.kx) {
      const [cx, cy] = this.vpCenter();
      const wx = v.x0 + cx / v.kx;
      const wl = v.laneTop - cy / this.kyFor(v.kx);
      x0 = wx - cx / kx;
      laneTop = wl + cy / this.kyFor(kx);
    }
    const b = this.bounds(kx);
    if (b) {
      x0 = Math.max(b.x[0], Math.min(b.x[1], x0));
      laneTop = Math.max(b.lane[0], Math.min(b.lane[1], laneTop));
    }
    return { x0, kx, laneTop };
  }
  /** Поставить камеру в пределы сразу (после смены видимой части, масштаба времени или модели). */
  clampNow() {
    this.raw = null;
    const v = this.constrain(this.state());
    this.x0 = v.x0;
    this.kx = v.kx;
    this.laneTop = v.laneTop;
  }

  /**
   * Новая видимая часть и рамки: fitFrame — что вписывает «всё небо», frame — пределы сдвига.
   * Высота полосы на мелких масштабах зависит от «всего неба»: середина видимой части по вертикали остаётся на месте.
   */
  setViewport(vp: Viewport, frame: Frame | null, fitFrame: Frame | null, pad = FIT_PAD) {
    const [, cyOld] = this.vpCenter();
    const laneMid = this.wLane(cyOld);
    this.vp = vp;
    this.frame = frame;
    if (fitFrame) {
      const w = Math.max(40, vp.r - vp.l - pad.l - pad.r);
      const h = Math.max(40, vp.b - vp.t - 2 * pad.y);
      this.fitK = { kx: w / Math.max(1e-6, fitFrame.x1 - fitFrame.x0), ky: h / Math.max(1, fitFrame.lane1 - fitFrame.lane0) };
    } else this.fitK = null;
    const [, cy] = this.vpCenter();
    this.laneTop = laneMid + cy / this.ky;
  }
  /** Вид «всё небо» для рамки fitFrame (setViewport уже вызван). */
  fitView(fitFrame: Frame, pad = FIT_PAD): ViewState {
    const k = this.fitK ?? { kx: (this.vp.r - this.vp.l - pad.l - pad.r) / (fitFrame.x1 - fitFrame.x0), ky: this.kyFor(this.kx) };
    const kx = k.kx;
    const ky = this.kyFor(kx);
    // по горизонтали — от левого поля (на мелком масштабе поле в 20 px — это века до сотворения), по вертикали — в середину
    const [, cy] = this.vpCenter();
    return { x0: fitFrame.x0 - (this.vp.l + pad.l) / kx, kx, laneTop: (fitFrame.lane0 + fitFrame.lane1) / 2 + cy / ky };
  }
  /** Совпадает ли вид с данным (с точностью до долей пикселя). */
  near(v: ViewState): boolean {
    return Math.abs(v.kx / this.kx - 1) < 1e-3 && Math.abs((v.x0 - this.x0) * this.kx) < 1.5 && Math.abs((v.laneTop - this.laneTop) * this.ky) < 1.5;
  }

  // ---------- ввод ----------
  zoomAt(sx: number, sy: number, factor: number) {
    this.stop();
    this.raw = null;
    const wx = this.wx(sx);
    const lane = this.wLane(sy);
    this.kx = this.clampKx(this.kx * factor, wx);
    this.x0 = wx - sx / this.kx;
    this.laneTop = lane + sy / this.ky;
    const b = this.bounds(this.kx);
    if (b) {
      this.x0 = Math.max(b.x[0], Math.min(b.x[1], this.x0));
      this.laneTop = Math.max(b.lane[0], Math.min(b.lane[1], this.laneTop));
    }
  }
  /** Сдвиг на (dx, dy) px. За краем данных — упругий упор; возврат — после отпускания (или паузы, если указатель не нажат). */
  pan(dx: number, dy: number) {
    this.stop();
    // камеру двигал кто-то ещё (перелёт, полоса времени) — прежний «сдвиг за край» не в счёт
    if (this.raw && (this.raw.shownX0 !== this.x0 || this.raw.shownLane !== this.laneTop)) this.raw = null;
    const r = this.raw ?? { x0: this.x0, laneTop: this.laneTop, shownX0: this.x0, shownLane: this.laneTop };
    r.x0 -= dx / this.kx;
    r.laneTop += dy / this.ky;
    const b = this.bounds(this.kx);
    if (b) {
      const give = (v: number, lo: number, hi: number, k: number) => {
        if (v >= lo && v <= hi) return v;
        const edge = v < lo ? lo : hi;
        const over = Math.abs(v - edge) * k;
        const shown = RUBBER * (1 - 1 / (over / RUBBER + 1));
        return edge + (Math.sign(v - edge) * shown) / k;
      };
      this.x0 = give(r.x0, b.x[0], b.x[1], this.kx);
      this.laneTop = give(r.laneTop, b.lane[0], b.lane[1], this.ky);
    } else {
      this.x0 = r.x0;
      this.laneTop = r.laneTop;
    }
    r.shownX0 = this.x0;
    r.shownLane = this.laneTop;
    this.raw = r;
    this.scheduleSettle();
  }
  /** Указатель нажат или отпущен над небом: пока держат, небо у упора не возвращается. */
  hold(on: boolean) {
    this.held = on;
    if (!on && this.raw) this.scheduleSettle(0);
  }
  private scheduleSettle(ms = SETTLE_AFTER) {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (!this.held) this.settle();
    }, ms);
  }
  /** Вернуть небо от упора в пределы за 200 мс. */
  settle(reduced = false) {
    if (!this.raw) return;
    this.raw = null;
    const to = this.constrain(this.state());
    if (this.near(to)) return;
    this.animateTo(to, SETTLE_MS, this.onChange, reduced, easeOut);
  }

  stop() {
    if (this.anim) cancelAnimationFrame(this.anim.raf);
    this.anim = null;
  }
  get moving(): boolean {
    return this.anim !== null;
  }

  /** Короткий переход к виду: центр видимой части и ширина окна — по логарифму масштаба. */
  animateTo(to: ViewState, ms: number, onFrame: () => void, reduced = false, curve = ease) {
    this.stop();
    this.raw = null;
    const from = this.state();
    const [cx, cy] = this.vpCenter();
    const c0x = from.x0 + cx / from.kx;
    const c1x = to.x0 + cx / to.kx;
    const c0l = from.laneTop - cy / this.kyFor(from.kx);
    const c1l = to.laneTop - cy / this.kyFor(to.kx);
    const apply = (e: number) => {
      const kx = Math.exp(Math.log(from.kx) + (Math.log(to.kx) - Math.log(from.kx)) * e);
      const [vx, vy] = this.vpCenter();
      this.kx = kx;
      this.x0 = c0x + (c1x - c0x) * e - vx / kx;
      this.laneTop = c0l + (c1l - c0l) * e + vy / this.kyFor(kx);
    };
    this.run(ms, reduced, (t) => apply(curve(t)), () => {
      this.x0 = to.x0;
      this.kx = to.kx;
      this.laneTop = to.laneTop;
    }, onFrame);
  }

  /** Шаг масштаба с точкой (sx, sy), которая остаётся на месте (кнопки, клавиши, колесо). */
  zoomStep(sx: number, sy: number, factor: number, ms: number, onFrame: () => void, reduced = false) {
    this.stop();
    this.raw = null;
    const wx = this.wx(sx);
    const wl = this.wLane(sy);
    const k0 = this.kx;
    const k1 = this.clampKx(k0 * factor, wx);
    if (k1 === k0) return;
    const at = (kx: number): ViewState => ({ x0: wx - sx / kx, kx, laneTop: wl + sy / this.kyFor(kx) });
    const end = this.constrain(at(k1));
    this.run(ms, reduced, (t) => {
      const e = easeOut(t);
      const v = at(Math.exp(Math.log(k0) + (Math.log(k1) - Math.log(k0)) * e));
      // сдвиг к пределам — по той же кривой
      const p = at(k1);
      this.kx = v.kx;
      this.x0 = v.x0 + (end.x0 - p.x0) * e;
      this.laneTop = v.laneTop + (end.laneTop - p.laneTop) * e;
    }, () => {
      this.x0 = end.x0;
      this.kx = end.kx;
      this.laneTop = end.laneTop;
    }, onFrame);
  }

  /**
   * Перелёт к виду to (ван Вейк — Нёйс): центр видимой части и её ширина в мировых единицах.
   * Прежняя форма flyTo(x, lane, wTarget, onFrame, reduced) — точка (x, lane) в середину видимой части, окно wTarget
   * мировых единиц на её ширину — тоже принимается; вид ставится в пределы камеры.
   */
  flyTo(to: ViewState, onFrame: () => void, reduced?: boolean): void;
  flyTo(x: number, lane: number, wTarget: number, onFrame: () => void, reduced?: boolean): void;
  flyTo(a: ViewState | number, b: (() => void) | number, c?: boolean | number, d?: () => void, e?: boolean) {
    if (typeof a === 'number') {
      const [cx, cy] = this.vpCenter();
      const kx = (this.vp.r - this.vp.l) / Math.max(1e-9, c as number);
      this.flyView(this.constrain({ x0: a - cx / kx, kx, laneTop: (b as number) + cy / this.kyFor(kx) }), d!, !!e);
      return;
    }
    this.flyView(a, b as () => void, !!c);
  }
  private flyView(to: ViewState, onFrame: () => void, reduced: boolean) {
    this.stop();
    this.raw = null;
    const [cx, cy] = this.vpCenter();
    const vw = this.vp.r - this.vp.l;
    const w0 = vw / this.kx;
    const w1 = vw / to.kx;
    const c0x = this.x0 + cx / this.kx;
    const c1x = to.x0 + cx / to.kx;
    const c0l = this.laneTop - cy / this.ky;
    const c1l = to.laneTop - cy / this.kyFor(to.kx);
    const finish = () => {
      this.x0 = to.x0;
      this.kx = to.kx;
      this.laneTop = to.laneTop;
    };
    if (reduced) {
      finish();
      onFrame();
      return;
    }
    // ван Вейк — Нёйс: ρ = √2
    const rho = Math.SQRT2;
    const rho2 = 2;
    const rho4 = 4;
    const dx = c1x - c0x;
    const d2 = dx * dx;
    const d1 = Math.sqrt(d2);
    let S: number;
    let interp: (s: number) => [number, number];
    if (d1 < 1e-9 || Math.abs(Math.log(w1 / w0)) > 1e-9 && d1 / Math.max(w0, w1) < 1e-6) {
      S = Math.log(w1 / w0) / rho;
      interp = (s) => [c0x + dx * s, w0 * Math.exp(rho * s * S)];
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
    // середина пути не отдаляется дальше «всего неба»
    const wMax = vw / this.kxLo();
    this.run(duration, false, (t) => {
      const e = ease(t);
      const [ccx, cw] = interp(e);
      const [vx, vy] = this.vpCenter();
      this.kx = (this.vp.r - this.vp.l) / Math.min(cw, Math.max(wMax, w0, w1));
      this.x0 = ccx - vx / this.kx;
      const cl = c0l + (c1l - c0l) * e;
      this.laneTop = cl + vy / this.ky;
    }, finish, onFrame);
  }

  /** Общий ход анимации: шаг по доле времени, конец, кадр. reduced — сразу конец. */
  private run(ms: number, reduced: boolean, step: (t: number) => void, end: () => void, onFrame: () => void) {
    if (reduced || ms <= 0) {
      end();
      onFrame();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      if (t < 1) {
        step(t);
        this.anim = { raf: requestAnimationFrame(tick) };
      } else {
        this.anim = null;
        end();
      }
      onFrame();
    };
    this.anim = { raf: requestAnimationFrame(tick) };
  }

  /** Совместимость: прежний fit по холсту (без видимой части). */
  fit(xMin: number, xMax: number, laneMin: number, laneMax: number, pad = 40) {
    this.raw = null;
    this.kx = Math.max(KX_MIN * 0.25, (this.w - pad * 2) / Math.max(1, xMax - xMin));
    this.x0 = xMin - pad / this.kx;
    const mid = (laneMin + laneMax) / 2;
    this.laneTop = mid + this.h / 2 / this.ky;
  }
}
