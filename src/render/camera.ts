/**
 * Камера неба. Горизонталь — мировые единицы времени (после масштаба времени), вертикаль — полосы.
 * Увеличение анизотропное: масштаб по времени kx меняется свободно, высота полосы ky следует за ним,
 * но остаётся в пределах [kyMin, KY_MAX] (ТЗ § 3.1, замечание картографа).
 *
 * Масштаб по двум осям (J1; решение владельца 16): у камеры есть пропорция полос lanes — множитель к обычной высоте
 * полосы при этом масштабе. Обычный масштаб (колесо, «+» и «−», щипок, перелёт) пропорцию не меняет: полоса растёт
 * с масштабом, как прежде, но в lanes раз выше. Растяжение одной оси (stretchStep, stretchAt):
 *  — «время» — меняется kx, а пропорция подстраивается так, чтобы высота полосы осталась прежней;
 *  — «полосы» — меняется только пропорция.
 * Высота полосы, которую задаёт пропорция, — от 4 до 60 px (KY_LO, KY_HI); если обычная полоса ниже 4 px (обзор), сжать
 * её нельзя. «Всё небо» пропорцию не сбрасывает: по времени вписано всё небо, по полосам — в заданной пропорции.
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
/**
 * Высота строки семейной укладки на узком небе и касании (Я12: не ниже 32 px): предел KY_MAX_TALL и сдвиг кривой
 * «масштаб → высота строки» до ROW_SHIFT_TALL удвоений — на масштабе чтения строка выше при том же масштабе времени, и
 * время ради высокой строки приближать меньше. Сдвиг нарастает на ROW_RAMP (удвоения масштаба над 0,014): на мелком
 * масштабе («Вписать» всего показа) кривая та же, что на карте, и показ помещается по высоте без отдаления времени
 * (Sky ставит rowCap и rowShift по показу и ширине неба).
 */
export const KY_MAX_TALL = 34;
export const ROW_SHIFT_TALL = 4;
export const ROW_RAMP: readonly [number, number] = [1.5, 3.5];
/** Пределы высоты полосы, которую задаёт пропорция полос (J1), px. */
export const KY_LO = 4;
export const KY_HI = 60;
/** Пределы самой пропорции (адрес, память браузера): за ними высота полосы всё равно упирается в KY_LO…KY_HI. */
export const LANES_MIN = 1 / 16;
export const LANES_MAX = 32;
/** Ось растяжения (J1): время — по горизонтали, полосы — по вертикали. */
export type Axis = 'time' | 'lanes';
/** За сколько удвоений масштаба от «всего неба» высота полосы догоняет обычную. */
const FIT_BLEND = 2;
/** Упругий упор за краем данных, px. */
const RUBBER = 80;
/** Сколько ждать после последнего сдвига, прежде чем вернуть небо от упора, мс. */
const SETTLE_AFTER = 140;
const SETTLE_MS = 200;
/** Поля «всего неба», px: слева — место для звезды Адама, справа — узкое: после 100 г. шкала сжата, и поле в 20 px — это века. */
const FIT_PAD = { l: 10, r: 6, y: 10 };
/** Сколько px за краем данных видно всегда: не меньше поля у Адама в показе линий Мессии (24 px; MAP-59, IX-63). */
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

/** Вид и пропорция полос вместе: растяжение одной оси меняет оба (J1). */
type Stretched = { v: ViewState; lanes: number };

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Длительность перелёта ван Вейка — Нёйса по длине пути S: 400–1 200 мс (ТЗ § 3.7; с обзора к лицу — 1,2 с, IX-68). */
export const FLY_MIN_MS = 400;
export const FLY_MAX_MS = 1200;
export const flightMs = (S: number) => Math.max(FLY_MIN_MS, Math.min(FLY_MAX_MS, Math.abs(S) * 900));
/** Замедление к концу: шаг масштаба, инерция протяжки, сдвиг клавишей. У начала скорость — втрое средней. */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Плавная смена пропорции полос: по логарифму, от m0 к m1 по доле пути e. */
const lerpLog = (a: number, b: number, e: number) => (a === b ? a : Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e));

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
  /** что сейчас движет камеру: перелёт и инерция — долгие движения, их нажатие только останавливает (IX-54) */
  private animKind: 'fly' | 'glide' | 'step' = 'step';
  /** сдвиг за край: позиция «без упора» и то, что было показано после последнего сдвига */
  private raw: { x0: number; laneTop: number; shownX0: number; shownLane: number } | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  kyMin(): number {
    return Math.max(1.2, Math.min(6, this.h / (this.laneSpan + 6)));
  }
  /**
   * Режим «только линии Мессии» (E6; MAP-23): сколько полос коридора вписать в 60 % высоты видимой части.
   * Полоса не ниже этой высоты на любом масштабе; 0 — обычная высота полосы. Ставит src/ui/sky/view.ts.
   */
  focusLanes = 0;
  /** Пропорция полос (J1): множитель к обычной высоте полосы; 1 — пропорции по умолчанию. */
  lanes = 1;
  /** Предел обычной высоты полосы, px: KY_MAX, в семейной укладке на узком небе — KY_MAX_TALL (Sky, rowScale). */
  rowCap = KY_MAX;
  /** Сдвиг кривой высоты полосы на масштабе чтения, удвоений масштаба (семейная укладка на узком небе — ROW_SHIFT_TALL). */
  rowShift = 0;
  /**
   * Пропорция читателя, пока небо показывает временную (IX-70): вписывание группы («Все N на небе», путь родства, лица
   * главы) сжимает строки только на время отметок — lanes временная, а своя пропорция читателя ждёт здесь; restoreLanes
   * возвращает её. null — lanes и есть пропорция читателя. Сохранённую пропорцию меняют только растяжение полос
   * («высота строк», Alt + колесо, протяжка по буквам), «по умолчанию» и адрес.
   */
  userLanes: number | null = null;
  /** Пропорция читателя: своя, даже если сейчас строки временно сжаты вписыванием группы (IX-70). */
  get ownLanes(): number {
    return this.userLanes ?? this.lanes;
  }
  /**
   * Нижний предел высоты строки при временном сжатии группы, px (MAP-79): группа из многих строк («Захария», 26 лиц
   * по всем коленам) сжимается ниже 4 px, а не отдаляет время за пределы своих лет. Действует, пока сжатие временное
   * и пока оно возвращается (restoreLanes); иначе предел — KY_LO.
   */
  private groupFloor = KY_LO;
  private floorOn = false;
  private get floorPx(): number {
    return this.floorOn ? this.groupFloor : KY_LO;
  }
  /** Пропорция снова своя (адрес, растяжение полос, «по умолчанию»): временного предела строки больше нет. */
  private ownAgain() {
    this.userLanes = null;
    this.floorOn = false;
  }
  /**
   * Сделать пропорцию m временной (IX-70, MAP-70: строки «только линий»): своя пропорция читателя уходит в userLanes, если
   * её там ещё нет. Высота строки меняется сразу; середина видимой части по вертикали остаётся на месте.
   */
  setTempLanes(m: number) {
    const v = Math.max(LANES_MIN, Math.min(LANES_MAX, m));
    if (this.userLanes === null) {
      if (Math.abs(v / this.lanes - 1) < 1e-9) return;
      this.userLanes = this.lanes;
    }
    const [, cy] = this.vpCenter();
    const mid = this.wLane(cy);
    this.raw = null;
    this.lanes = v;
    this.laneTop = mid + cy / this.ky;
  }
  /** Кончить временную пропорцию без перехода: вернуть свою (её возвращает переход, который зовёт этот метод). */
  endTemp(): number | null {
    const own = this.userLanes;
    this.ownAgain();
    return own;
  }
  /** Высота полосы при масштабе kx — с пропорцией полос. */
  kyFor(kx: number): number {
    return this.kyWith(kx, this.lanes);
  }
  /**
   * Высота полосы при масштабе kx и пропорции m: обычная × m, но не ниже min(4, обычная) и не выше 60 px. floor —
   * нижний предел вместо 4 px (временное сжатие группы, MAP-79).
   */
  kyWith(kx: number, m: number, floor = this.floorPx): number {
    const k = this.kyAuto(kx);
    if (m === 1) return k;
    return Math.min(Math.max(KY_HI, k), Math.max(Math.min(floor, k), k * m));
  }
  /** Обычная высота полосы при масштабе kx (без пропорции полос). */
  kyAuto(kx: number): number {
    const k = this.kyBase(kx);
    return this.focusLanes > 0 ? Math.max(k, Math.min(this.rowCap, (0.6 * (this.vp.b - this.vp.t)) / this.focusLanes)) : k;
  }
  /** Пределы пропорции при масштабе kx: высота полосы — от min(4, обычная) до 60 px. */
  lanesRange(kx = this.kx): [number, number] {
    const k = this.kyAuto(kx);
    return [Math.min(KY_LO, k) / k, Math.max(KY_HI, k) / k];
  }
  /** Пропорция при масштабе kx, в пределах: вне их высота полосы та же, что на краю, поэтому шаг от неё — от края. */
  lanesAt(kx = this.kx, m = this.lanes): number {
    const [a, b] = this.lanesRange(kx);
    return Math.max(a, Math.min(b, m));
  }
  /** Пропорция, при которой высота полосы при масштабе kx — ky (в пределах). */
  lanesFor(kx: number, ky: number): number {
    return this.lanesAt(kx, ky / this.kyAuto(kx));
  }
  /** Поставить пропорцию сразу (адрес, память браузера): середина видимой части по вертикали остаётся на месте. */
  setLanes(m: number) {
    const v = Math.max(LANES_MIN, Math.min(LANES_MAX, Number.isFinite(m) && m > 0 ? m : 1));
    this.ownAgain();
    if (v === this.lanes) return;
    const [, cy] = this.vpCenter();
    const mid = this.wLane(cy);
    this.raw = null;
    this.lanes = v;
    this.laneTop = mid + cy / this.ky;
  }
  private kyBase(kx: number): number {
    const cap = this.rowCap;
    const d = Math.log2(Math.max(kx, 1e-6) / 0.014);
    // сдвиг — только на масштабе чтения: от ROW_RAMP[0] до ROW_RAMP[1] удвоений он нарастает от 0 до rowShift
    const shift = this.rowShift * Math.max(0, Math.min(1, (d - ROW_RAMP[0]) / (ROW_RAMP[1] - ROW_RAMP[0])));
    const g = Math.max(this.kyMin(), Math.min(cap, 3.5 + 3.3 * (d + shift)));
    const f = this.fitK;
    if (!f) return g;
    // высота строки «всего неба» (строки по высоте видимой части) — не выше KY_MAX и на узком небе: выше неё строку
    // поднимает только сдвинутая кривая масштаба чтения (иначе малая семья на телефоне вставала бы строками по 34 px уже
    // на обзоре и уходила под строку показа)
    const fy = Math.min(KY_MAX, f.ky);
    const u = Math.log2(kx / f.kx) / FIT_BLEND;
    if (u <= 0) return Math.min(cap, fy);
    if (u >= 1) return Math.min(cap, Math.max(fy, g));
    const s = u * u * (3 - 2 * u);
    return Math.min(cap, Math.max(fy, Math.exp((1 - s) * Math.log(fy) + s * Math.log(g))));
  }
  /**
   * Высота полосы нынешнего масштаба — запомненная при тех же входах kyWith (масштаб, пропорция, предел строки, полосы
   * «только линий», предел и сдвиг высоты, высота холста и видимой части, масштаб «всего неба»). sy() зовёт её для каждой
   * точки кадра, а кривая высоты — это логарифмы и экспонента (NFR-1). Значение то же, что даёт kyFor(kx). Новый вход
   * кривой высоты — добавить и сюда.
   */
  private kyM: { auto: unknown; kx: number; lanes: number; floor: number; focus: number; cap: number; shift: number; h: number; span: number; t: number; b: number; fkx: number; fky: number; v: number } = {
    auto: null, kx: NaN, lanes: 0, floor: 0, focus: 0, cap: 0, shift: 0, h: 0, span: 0, t: 0, b: 0, fkx: 0, fky: 0, v: 0,
  };
  get ky(): number {
    const m = this.kyM;
    const f = this.fitK;
    const fkx = f ? f.kx : -1;
    const fky = f ? f.ky : -1;
    const floor = this.floorPx;
    // kyAuto подменяют у экземпляра инструменты (tools/census.ts) — подмена сбрасывает запомненное
    if (
      m.auto === this.kyAuto && m.kx === this.kx && m.lanes === this.lanes && m.floor === floor && m.focus === this.focusLanes && m.cap === this.rowCap && m.shift === this.rowShift &&
      m.h === this.h && m.span === this.laneSpan && m.t === this.vp.t && m.b === this.vp.b && m.fkx === fkx && m.fky === fky
    )
      return m.v;
    m.v = this.kyFor(this.kx);
    m.auto = this.kyAuto;
    m.kx = this.kx;
    m.lanes = this.lanes;
    m.floor = floor;
    m.focus = this.focusLanes;
    m.cap = this.rowCap;
    m.shift = this.rowShift;
    m.h = this.h;
    m.span = this.laneSpan;
    m.t = this.vp.t;
    m.b = this.vp.b;
    m.fkx = fkx;
    m.fky = fky;
    return m.v;
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
  /**
   * Предел отдаления, если он не «всё небо» (ставит src/ui/sky/view.ts, zoomFloor): в режиме «только линии Мессии» —
   * коридор линий с полями по 24 px от Адама и от Иисуса Христа (он чуть мельче «всего неба», MAP-59); в режиме
   * «в работе» — окно набора ×1,5, но не уже 200 лет (IX-64). null — «всё небо».
   */
  zoomFloor: number | null = null;
  /**
   * Поле за краем данных, px, если оно не EDGE (ставит src/ui/sky/view.ts вместе с zoomFloor): в режиме «только линии
   * Мессии» — 24 px (LINES_PAD), чтобы коридор, вписанный с полями по 24 px, не прижимался к EDGE (MAP-59).
   */
  edge: number | null = null;
  /** Самый мелкий масштаб: «всё небо» или предел режима (zoomFloor). */
  kxLo(): number {
    if (this.zoomFloor !== null && this.zoomFloor > 0) return this.zoomFloor;
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
    const dl = f.lane1 - f.lane0;
    // за краем данных всегда можно заглянуть на EDGE px (поля «всего неба»). По времени окно шире данных (коридор линий
    // мельче «всего неба», MAP-59) не центрируется насильно: данные — где угодно внутри окна, с полями не меньше EDGE
    const edge = this.edge ?? EDGE;
    const overX = Math.max(0.75 * vw * s, edge / kx);
    const overL = Math.max((vh - dl) / 2, 0.75 * vh * s, EDGE / ky);
    const xa = f.x0 - overX - this.vp.l / kx;
    const xb = f.x1 + overX - this.vp.r / kx;
    const la = f.lane0 - overL + this.vp.b / ky;
    const lb = f.lane1 + overL + this.vp.t / ky;
    return { x: xa <= xb ? [xa, xb] : [xb, xa], lane: la <= lb ? [la, lb] : [(la + lb) / 2, (la + lb) / 2] };
  }
  /**
   * Вид в пределах: масштаб и положение. lanes — пропорция полос, с которой вид будет показан (по умолчанию — нынешняя);
   * floor — временный нижний предел строки, px, с которым он будет показан (вписывание группы, MAP-79).
   */
  constrain(v: ViewState, lanes = this.lanes, floor?: number): ViewState {
    if (lanes !== this.lanes || floor !== undefined) {
      const was = { lanes: this.lanes, floorOn: this.floorOn, groupFloor: this.groupFloor };
      this.lanes = lanes;
      if (floor !== undefined) {
        this.floorOn = true;
        this.groupFloor = Math.min(KY_LO, floor);
      }
      try {
        return this.constrain(v);
      } finally {
        this.lanes = was.lanes;
        this.floorOn = was.floorOn;
        this.groupFloor = was.groupFloor;
      }
    }
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

  /**
   * Инерция протяжки (решение владельца 37; IX-05): небо скользит ещё на (dx, dy) px за ms и останавливается с замедлением,
   * в пределах сдвига (за краем данных — сразу к краю). При ослабленном движении инерции нет. Было ли куда скользить.
   */
  glide(dx: number, dy: number, ms: number, onFrame: () => void, reduced = false): boolean {
    if (reduced || !(ms > 0) || (!dx && !dy)) return false;
    const to = this.constrain({ x0: this.x0 - dx / this.kx, kx: this.kx, laneTop: this.laneTop + dy / this.ky });
    if (this.near(to)) return false;
    this.animateTo(to, ms, onFrame, false, easeOut);
    this.animKind = 'glide';
    return true;
  }

  stop() {
    if (this.anim) cancelAnimationFrame(this.anim.raf);
    this.anim = null;
    // возврат пропорции прерван: временного предела строки больше нет
    if (this.userLanes === null) this.floorOn = false;
  }
  get moving(): boolean {
    return this.anim !== null;
  }
  /** Идёт перелёт или инерция протяжки (не короткий шаг масштаба и не возврат от упора). */
  get flying(): boolean {
    return this.anim !== null && this.animKind !== 'step';
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

  /**
   * Прямой переход к виду без «отдалить — приблизить» (IX-74, IX-79): «назад» и «вперёд», «Всё небо». Масштаб меняется
   * по логарифму, а неподвижная точка перехода остаётся на месте экрана — окно растёт или сжимается вокруг неё, как
   * «вписать всё» в картах; при одинаковом масштабе — просто сдвиг. По вертикали середина идёт по прямой. Как перелёт,
   * это «долгое» движение: нажатие его только останавливает (IX-54). lanes — пропорция полос в конце (адрес записи).
   */
  zoomTo(to: ViewState, ms: number, onFrame: () => void, reduced = false, lanes?: number) {
    this.stop();
    this.raw = null;
    const from = this.state();
    const m0 = this.lanes;
    const m1 = lanes !== undefined && lanes > 0 ? Math.max(LANES_MIN, Math.min(LANES_MAX, lanes)) : m0;
    const [, cy] = this.vpCenter();
    const k0 = from.kx;
    const k1 = to.kx;
    const c0l = from.laneTop - cy / this.ky;
    const c1l = to.laneTop - cy / this.kyWith(k1, m1);
    // неподвижная точка: экранная x, у которой мировая x одна и та же в обоих видах (x0 + s / kx)
    const inv = 1 / k0 - 1 / k1;
    const sFix = Math.abs(inv) > 1e-12 ? (to.x0 - from.x0) / inv : NaN;
    const W = Math.max(1, this.vp.r - this.vp.l);
    const fixed = Number.isFinite(sFix) && Math.abs(sFix) < 40 * W;
    const xFix = fixed ? from.x0 + sFix / k0 : 0;
    const finish = () => {
      this.lanes = m1;
      this.x0 = to.x0;
      this.kx = to.kx;
      this.laneTop = to.laneTop;
    };
    this.run(ms, reduced, (t) => {
      const e = ease(t);
      const kx = Math.exp(Math.log(k0) + (Math.log(k1) - Math.log(k0)) * e);
      const [, vy] = this.vpCenter();
      this.lanes = lerpLog(m0, m1, e);
      this.kx = kx;
      this.x0 = fixed ? xFix - sFix / kx : from.x0 + (to.x0 - from.x0) * e;
      this.laneTop = c0l + (c1l - c0l) * e + vy / this.ky;
    }, finish, onFrame);
    this.animKind = 'fly';
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

  // ---------- масштаб по одной оси (J1) ----------

  /**
   * План растяжения оси у точки (sx, sy): вид и пропорция по доле пути e (0…1, по логарифму) и в конце — в пределах.
   * «Время»: kx × factor в пределах масштаба, пропорция подстраивается — высота полосы прежняя, точка sx на месте.
   * «Полосы»: пропорция × factor в пределах 4…60 px полосы, kx прежний, полоса под sy на месте. null — растягивать некуда.
   */
  private stretchPlan(axis: Axis, sx: number, sy: number, factor: number): { at: (e: number) => Stretched; end: Stretched } | null {
    if (!(factor > 0)) return null;
    const wx = this.wx(sx);
    const wl = this.wLane(sy);
    const lerp = (a: number, b: number, e: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e);
    if (axis === 'time') {
      const k0 = this.kx;
      const k1 = this.clampKx(k0 * factor, wx);
      if (Math.abs(k1 / k0 - 1) < 1e-9) return null;
      const ky0 = this.ky;
      const at = (kx: number): Stretched => {
        const lanes = this.lanesFor(kx, ky0);
        return { lanes, v: { x0: wx - sx / kx, kx, laneTop: wl + sy / this.kyWith(kx, lanes) } };
      };
      return { at: (e) => at(lerp(k0, k1, e)), end: this.bounded(at(k1)) };
    }
    const kx = this.kx;
    const m0 = this.lanesAt(kx);
    const m1 = this.lanesAt(kx, m0 * factor);
    if (Math.abs(m1 / m0 - 1) < 1e-9) return null;
    const x0 = this.x0;
    const at = (m: number): Stretched => ({ lanes: m, v: { x0, kx, laneTop: wl + sy / this.kyWith(kx, m) } });
    return { at: (e) => at(lerp(m0, m1, e)), end: this.bounded(at(m1)) };
  }
  /** Вид с пропорцией — в пределах сдвига (они зависят от высоты полосы). */
  private bounded(s: Stretched): Stretched {
    const was = this.lanes;
    this.lanes = s.lanes;
    const b = this.bounds(s.v.kx);
    this.lanes = was;
    if (!b) return s;
    return { lanes: s.lanes, v: { kx: s.v.kx, x0: Math.max(b.x[0], Math.min(b.x[1], s.v.x0)), laneTop: Math.max(b.lane[0], Math.min(b.lane[1], s.v.laneTop)) } };
  }
  private put(s: Stretched) {
    this.lanes = s.lanes;
    this.x0 = s.v.x0;
    this.kx = s.v.kx;
    this.laneTop = s.v.laneTop;
  }
  /** Можно ли ещё растянуть (dir = 1) или сжать (dir = −1) ось — для органов неба. */
  canStretch(axis: Axis, dir: 1 | -1): boolean {
    if (axis === 'time') {
      // запас меньше 0,1 % — предел: шаг масштаба держит на месте выбранную звезду, а предел здесь берётся по середине
      // окна; местная плотность шкалы в паре лет от неё отличается на миллионные доли, и кнопка не должна от этого
      // оставаться включённой у самого предела (IX-62)
      const [cx] = this.vpCenter();
      return Math.abs(this.clampKx(this.kx * (dir > 0 ? 1.01 : 1 / 1.01), this.wx(cx)) / this.kx - 1) > 1e-3;
    }
    const m = this.lanesAt();
    const [a, b] = this.lanesRange();
    return dir > 0 ? m < b * (1 - 1e-6) : m > a * (1 + 1e-6);
  }
  /** Растянуть ось сразу (протяжка по линейке или по буквам полос, щипок): точка (sx, sy) остаётся на месте. */
  stretchAt(axis: Axis, sx: number, sy: number, factor: number) {
    this.stop();
    this.raw = null;
    // протяжка по буквам — пропорция читателя: временное сжатие группы становится его (IX-70)
    if (axis === 'lanes') this.ownAgain();
    const p = this.stretchPlan(axis, sx, sy, factor);
    if (p) this.put(p.end);
  }
  /** Шаг растяжения оси с анимацией (органы неба, клавиши, колесо): точка (sx, sy) остаётся на месте. Было ли куда. */
  stretchStep(axis: Axis, sx: number, sy: number, factor: number, ms: number, onFrame: () => void, reduced = false): boolean {
    this.stop();
    this.raw = null;
    const p = this.stretchPlan(axis, sx, sy, factor);
    if (!p) return false;
    // «высота строк» и Alt + колесо задают пропорцию читателя (IX-70)
    if (axis === 'lanes') this.ownAgain();
    const end = p.end;
    const free = p.at(1);
    this.run(ms, reduced, (t) => {
      const e = easeOut(t);
      const s = p.at(e);
      // сдвиг к пределам — по той же кривой
      this.put({ lanes: s.lanes, v: { kx: s.v.kx, x0: s.v.x0 + (end.v.x0 - free.v.x0) * e, laneTop: s.v.laneTop + (end.v.laneTop - free.v.laneTop) * e } });
    }, () => this.put(end), onFrame);
    return true;
  }
  /**
   * Вернуть пропорцию читателя после временного сжатия строк (IX-70): отметки сняли — строки снова своей высоты за ms,
   * полоса под sy (px холста) остаётся на месте, время не меняется. Было ли что возвращать.
   */
  restoreLanes(sy: number, ms: number, onFrame: () => void, reduced = false): boolean {
    const own = this.userLanes;
    if (own === null) return false;
    this.stop();
    this.raw = null;
    // пропорция снова своя сразу (память, адрес); временный предел строки держится до конца возврата — без скачка
    this.userLanes = null;
    const m0 = this.lanes;
    if (Math.abs(own / m0 - 1) < 1e-9) {
      this.floorOn = false;
      return false;
    }
    const kx = this.kx;
    const x0 = this.x0;
    const wl = this.wLane(sy);
    const at = (m: number, floor?: number): Stretched => ({ lanes: m, v: { x0, kx, laneTop: wl + sy / this.kyWith(kx, m, floor) } });
    const free = at(own, KY_LO);
    const was = this.floorOn;
    this.floorOn = false;
    const end = this.bounded(free);
    this.floorOn = was;
    this.run(ms, reduced, (t) => {
      const e = easeOut(t);
      const s = at(lerpLog(m0, own, e));
      this.put({ lanes: s.lanes, v: { kx, x0: s.v.x0 + (end.v.x0 - free.v.x0) * e, laneTop: s.v.laneTop + (end.v.laneTop - free.v.laneTop) * e } });
    }, () => {
      this.floorOn = false;
      this.put(end);
    }, onFrame);
    return true;
  }

  /** Пропорции по умолчанию шагом с анимацией: полоса под sy остаётся на месте. Было ли что менять. */
  resetLanes(sx: number, sy: number, ms: number, onFrame: () => void, reduced = false): boolean {
    const m = this.lanesAt();
    const done = Math.abs(m - 1) > 1e-6 && this.stretchStep('lanes', sx, sy, 1 / m, ms, onFrame, reduced);
    // за пределами (пропорция из адреса) полоса уже на краю: пропорция просто забывается
    if (!done) this.setLanes(1);
    return done;
  }

  /**
   * Перелёт к виду to (ван Вейк — Нёйс): центр видимой части и её ширина в мировых единицах.
   * Прежняя форма flyTo(x, lane, wTarget, onFrame, reduced) — точка (x, lane) в середину видимой части, окно wTarget
   * мировых единиц на её ширину — тоже принимается; вид ставится в пределы камеры.
   */
  flyTo(to: ViewState, onFrame: () => void, reduced?: boolean, lanes?: number, floor?: number): void;
  flyTo(x: number, lane: number, wTarget: number, onFrame: () => void, reduced?: boolean): void;
  flyTo(a: ViewState | number, b: (() => void) | number, c?: boolean | number, d?: (() => void) | number, e?: boolean | number) {
    if (typeof a === 'number') {
      const [cx, cy] = this.vpCenter();
      const kx = (this.vp.r - this.vp.l) / Math.max(1e-9, c as number);
      this.flyView(this.constrain({ x0: a - cx / kx, kx, laneTop: (b as number) + cy / this.kyFor(kx) }), d as () => void, !!e);
      return;
    }
    this.flyView(a, b as () => void, !!c, typeof d === 'number' ? d : undefined, typeof e === 'number' ? e : undefined);
  }
  /**
   * Перелёт к виду to; lanes — пропорция полос в конце (вписывание групп сжатием строк, IX-53): она меняется вместе
   * с перелётом, по логарифму. to.laneTop посчитан для этой пропорции.
   */
  private flyView(to: ViewState, onFrame: () => void, reduced: boolean, lanes?: number, floor?: number) {
    this.stop();
    this.raw = null;
    const m0 = this.lanes;
    const m1 = lanes !== undefined && lanes > 0 ? Math.max(LANES_MIN, Math.min(LANES_MAX, lanes)) : m0;
    // пропорция группы — временная (IX-70): своя пропорция читателя остаётся в userLanes, пока её не вернут; строки
    // группы могут быть ниже 4 px (floor, MAP-79)
    if (m1 !== m0 && this.userLanes === null) this.userLanes = m0;
    if (this.userLanes !== null && floor !== undefined) {
      this.floorOn = true;
      this.groupFloor = Math.min(KY_LO, floor);
    }
    const [cx, cy] = this.vpCenter();
    const vw = this.vp.r - this.vp.l;
    const w0 = vw / this.kx;
    const w1 = vw / to.kx;
    const c0x = this.x0 + cx / this.kx;
    const c1x = to.x0 + cx / to.kx;
    const c0l = this.laneTop - cy / this.ky;
    const c1l = to.laneTop - cy / this.kyWith(to.kx, m1);
    const finish = () => {
      this.lanes = m1;
      if (this.userLanes !== null && Math.abs(this.userLanes / m1 - 1) < 1e-9) this.ownAgain();
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
    // 400–1 200 мс (ТЗ § 3.7: 400–1 400); с обзора к лицу — у верхнего края, 1,2 с (IX-68)
    const duration = flightMs(S);
    // середина пути не отдаляется дальше «всего неба»
    const wMax = vw / this.kxLo();
    this.run(duration, false, (t) => {
      const e = ease(t);
      const [ccx, cw] = interp(e);
      const [vx, vy] = this.vpCenter();
      this.lanes = lerpLog(m0, m1, e);
      this.kx = (this.vp.r - this.vp.l) / Math.min(cw, Math.max(wMax, w0, w1));
      this.x0 = ccx - vx / this.kx;
      const cl = c0l + (c1l - c0l) * e;
      this.laneTop = cl + vy / this.ky;
    }, finish, onFrame);
    this.animKind = 'fly';
  }

  /** Общий ход анимации: шаг по доле времени, конец, кадр. reduced — сразу конец. */
  private run(ms: number, reduced: boolean, step: (t: number) => void, end: () => void, onFrame: () => void) {
    this.animKind = 'step';
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
