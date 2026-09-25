/**
 * Хронологический решатель (ТЗ § 8.1–8.2).
 *
 * 1. Жёсткие равенства — только числа текста: возраст отца/матери при рождении, смещение от другого лица,
 *    возраст при смерти, возраст при воцарении, явные годы. Они объединяются в «жёсткие компоненты»
 *    (объединение с весами), внутри которых относительные годы известны точно.
 * 2. Компонента, связанная с опорой модели или явным годом, закреплена. Остальные компоненты сдвигаются
 *    как целое мягкими ограничениями (поколение, жизнь родителя, эпоха, годы служения, порядок братьев),
 *    решаемыми взвешенными наименьшими квадратами методом Гаусса — Зейделя.
 * 3. Неопределённость — по модели случайного блуждания длины поколения между опорами.
 * 4. Там, где числа текста противоречат друг другу, решатель не падает, а записывает «напряжение».
 *
 * Все годы внутри — астрономические.
 */
import type { Person, Epoch } from '../data/types.ts';
import { type Graph, fatherOf, motherOf, primaryChildren } from './graph.ts';
import { toAstro } from './years.ts';

export type ChronoModelId = 'mt-long' | 'mt-short' | 'lxx' | 'terah70';

export interface ChronoModel {
  id: ChronoModelId;
  name: string;
  description: string;
}

export const MODELS: ChronoModel[] = [
  {
    id: 'mt-long',
    name: 'Масоретские числа, 430 лет в Египте',
    description:
      'Быт 5 и 11 по основному тексту; Фарре 130 лет при рождении Аврама (Быт 11:32; 12:4; Деян 7:4); 430 лет в Египте (Исх 12:40); Исход — 1446 г. до Р. Х. (3 Цар 6:1 и якорь 967 г.).',
  },
  {
    id: 'mt-short',
    name: 'Краткое пребывание: 215 лет в Египте',
    description: 'То же, но 430 лет считаются от прихода Авраама в Ханаан (скобка Синодального текста Исх 12:40; Гал 3:17).',
  },
  {
    id: 'lxx',
    name: 'Числа в скобках Быт 5 и 11',
    description: 'Для праотцев до Авраама берутся числа греческого перевода, напечатанные в квадратных скобках Синодального текста.',
  },
  {
    id: 'terah70',
    name: 'Фарре 70 лет при рождении Аврама',
    description: 'Аврам — первенец Фарры (Быт 11:26), без согласования с Деян 7:4.',
  },
];

export type DateClass = 'exact' | 'calculated' | 'estimated' | 'epochal';

export interface Tension {
  persons: string[];
  text: string;
  refs: string[];
}

export interface PersonChrono {
  b: number; // оценка года рождения
  bLo: number;
  bHi: number;
  d: number | null; // год смерти, если следует из данных
  dLo: number | null;
  dHi: number | null;
  lastAttested: number | null; // последнее засвидетельствованное событие жизни
  dEst: number; // правдоподобный конец жизни (для «вероятных» современников)
  cls: DateClass;
  epoch: string | null; // эпоха рождения
}

export interface ChronoResult {
  model: ChronoModelId;
  persons: Map<string, PersonChrono>;
  tensions: Tension[];
}

const EXODUS = toAstro(-1446);

/** Типичные длины поколения по эпохам (для мягких ограничений). */
interface GenNorm {
  g: number; // среднее
  min: number;
  max: number;
  sigma: number;
  life: number; // типичная продолжительность жизни
  lifeMax: number;
}
const NORMS: Record<string, GenNorm> = {
  antediluvian: { g: 110, min: 60, max: 200, sigma: 40, life: 900, lifeMax: 970 },
  postdiluvian: { g: 34, min: 25, max: 140, sigma: 15, life: 300, lifeMax: 600 },
  patriarchs: { g: 60, min: 25, max: 110, sigma: 20, life: 150, lifeMax: 180 },
  egypt: { g: 45, min: 18, max: 100, sigma: 20, life: 120, lifeMax: 140 },
  default: { g: 28, min: 13, max: 65, sigma: 9, life: 65, lifeMax: 120 },
};

export function normFor(epochId: string | null): GenNorm {
  return (epochId && NORMS[epochId]) || NORMS.default;
}

export function epochAt(epochs: Epoch[], astro: number): Epoch | null {
  for (const e of epochs) if (astro >= toAstro(e.start) && astro < toAstro(e.end)) return e;
  return astro < toAstro(epochs[0].start) ? epochs[0] : epochs[epochs.length - 1];
}

// ---------- объединение с весами: b[x] = b[root] + off[x] ----------
class Offsets {
  parent = new Map<string, string>();
  off = new Map<string, number>(); // смещение относительно родителя в дереве объединения
  find(x: string): { root: string; off: number } {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.off.set(x, 0);
    }
    let r = x;
    let acc = 0;
    while (this.parent.get(r) !== r) {
      acc += this.off.get(r)!;
      r = this.parent.get(r)!;
    }
    // сжатие пути
    let y = x;
    let rem = acc;
    while (this.parent.get(y) !== r && y !== r) {
      const next = this.parent.get(y)!;
      const o = this.off.get(y)!;
      this.parent.set(y, r);
      this.off.set(y, rem);
      rem -= o;
      y = next;
    }
    return { root: r, off: acc };
  }
  /** Требование: val(b) − val(a) = delta. Возвращает расхождение, если оно уже задано иначе. */
  union(a: string, b: string, delta: number): number | null {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra.root === rb.root) {
      const cur = rb.off - ra.off;
      return Math.abs(cur - delta) > 1.5 ? cur - delta : null;
    }
    // val(rb.root) = val(ra.root) + ra.off + delta − rb.off
    this.parent.set(rb.root, ra.root);
    this.off.set(rb.root, ra.off + delta - rb.off);
    return null;
  }
}

const B = (id: string) => `b:${id}`;
const D = (id: string) => `d:${id}`;

interface Ineq {
  // мягкое ограничение: w * (x_j − x_i − delta)² при нарушении (kind 'ge' — x_j − x_i ≥ delta; 'eq' — всегда)
  i: string;
  j: string;
  delta: number;
  w: number;
  kind: 'eq' | 'ge' | 'le';
}

export function solveChronology(g: Graph, epochs: Epoch[], modelId: ChronoModelId = 'mt-long'): ChronoResult {
  const tensions: Tension[] = [];
  const uf = new Offsets();
  const fixed = new Map<string, { value: number; cls: DateClass }>(); // значения корней после закрепления
  const explicit: { key: string; value: number; cls: DateClass; refs: string[]; who: string }[] = [];
  const epochById = new Map(epochs.map((e) => [e.id, e]));
  const lxx = modelId === 'lxx';

  // --- 1. жёсткие равенства
  const equal = (a: string, b: string, delta: number, refs: string[], who: string[], what: string) => {
    const diff = uf.union(a, b, delta);
    if (diff !== null) {
      tensions.push({
        persons: who,
        text: `${what}: числа текста расходятся на ${Math.round(Math.abs(diff))} лет с другими данными`,
        refs,
      });
    }
  };

  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = p.chrono;
    uf.find(B(id));
    if (!c) continue;
    const born = c.born;
    if (born) {
      const fAge = lxx && born.fatherAgeBracket !== undefined ? born.fatherAgeBracket : born.fatherAge;
      let fatherAge = fAge;
      if (modelId === 'terah70' && id === 'avraam') fatherAge = 70;
      const f = fatherOf(g, id);
      const m = motherOf(g, id);
      if (fatherAge !== undefined && f) equal(B(f), B(id), fatherAge, born.refs ?? [], [f, id], 'Возраст отца при рождении');
      if (born.motherAge !== undefined && m) equal(B(m), B(id), born.motherAge, born.refs ?? [], [m, id], 'Возраст матери при рождении');
      if (born.offset && g.persons.has(born.offset.from)) equal(B(born.offset.from), B(id), born.offset.years, born.refs ?? [], [born.offset.from, id], 'Смещение');
      if (born.year !== undefined) explicit.push({ key: B(id), value: toAstro(born.year), cls: 'calculated', refs: born.refs ?? [], who: id });
    }
    const died = c.died;
    if (died) {
      const age = lxx && died.ageBracket !== undefined ? died.ageBracket : died.age;
      if (age !== undefined) equal(B(id), D(id), age, died.refs ?? [], [id], 'Возраст при смерти');
      if (died.year !== undefined) explicit.push({ key: D(id), value: toAstro(died.year), cls: 'calculated', refs: died.refs ?? [], who: id });
    }
    for (const r of c.reign ?? []) {
      if (r.ageAtStart !== undefined) explicit.push({ key: B(id), value: toAstro(r.start) - r.ageAtStart, cls: 'calculated', refs: r.refs, who: id });
    }
  }

  // --- 2. опора модели: год рождения Иакова
  const sojourn = modelId === 'mt-short' ? 215 : 430;
  const jacobBirth = EXODUS - sojourn - 130;
  const modelAnchor = g.persons.has('iakov') ? { key: B('iakov'), value: jacobBirth } : null;

  const rootOf = (key: string) => uf.find(key);
  const setFixed = (key: string, value: number, cls: DateClass, refs: string[], who: string) => {
    const { root, off } = rootOf(key);
    const v = value - off;
    const cur = fixed.get(root);
    if (cur === undefined) fixed.set(root, { value: v, cls });
    else if (Math.abs(cur.value - v) > 2) {
      tensions.push({ persons: [who], text: `Год расходится с другими числами текста на ${Math.round(Math.abs(cur.value - v))} лет`, refs });
    }
  };
  if (modelAnchor) setFixed(modelAnchor.key, modelAnchor.value, 'exact', [], 'iakov');
  for (const e of explicit) setFixed(e.key, e.value, e.cls, e.refs, e.who);

  // --- 3. мягкие ограничения между компонентами
  const ineqs: Ineq[] = [];
  const epochOf = (id: string): string | null => g.persons.get(id)?.chrono?.epoch ?? null;
  const priors = new Map<string, { lo: number; hi: number; w: number }>(); // ключ — b:id
  const addPrior = (key: string, lo: number, hi: number, w: number) => {
    const cur = priors.get(key);
    if (!cur) priors.set(key, { lo, hi, w });
    else priors.set(key, { lo: Math.max(cur.lo, lo), hi: Math.min(cur.hi, hi) < Math.max(cur.lo, lo) ? cur.hi : Math.min(cur.hi, hi), w: Math.max(cur.w, w) });
  };

  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = p.chrono;
    // эпоха
    if (c?.epoch && epochById.has(c.epoch)) {
      const e = epochById.get(c.epoch)!;
      addPrior(B(id), toAstro(e.start) - 30, toAstro(e.end), 0.5);
    }
    // относительные границы
    if (c?.born?.notAfter && g.persons.has(c.born.notAfter.from)) ineqs.push({ i: B(id), j: B(c.born.notAfter.from), delta: -c.born.notAfter.years, w: 5, kind: 'ge' });
    if (c?.born?.notBefore && g.persons.has(c.born.notBefore.from)) ineqs.push({ i: B(c.born.notBefore.from), j: B(id), delta: c.born.notBefore.years, w: 5, kind: 'ge' });
    // допустимые интервалы
    if (c?.born?.range) addPrior(B(id), toAstro(c.born.range[0]), toAstro(c.born.range[1]), 5);
    if (c?.died?.range) addPrior(D(id), toAstro(c.died.range[0]), toAstro(c.died.range[1]), 5);
    // годы засвидетельствованной жизни
    if (c?.active) {
      const n = normFor(c.epoch ?? null);
      ineqs.push({ i: B(id), j: `@${toAstro(c.active.from)}`, delta: 12, w: 2, kind: 'ge' }); // b ≤ from − 12
      ineqs.push({ i: `@${toAstro(c.active.to)}`, j: B(id), delta: -n.lifeMax, w: 2, kind: 'ge' }); // b ≥ to − lifeMax
    }
    for (const r of c?.reign ?? []) {
      ineqs.push({ i: B(id), j: `@${toAstro(r.start)}`, delta: 0, w: 2, kind: 'ge' });
    }
    // поколение: отец и мать
    for (const e of g.parentsOf.get(id) ?? []) {
      const pe = epochOf(e.parent) ?? epochOf(id);
      const n = normFor(pe);
      const main = e.kind === 'father' || e.kind === 'mother';
      const w = (main ? 1 : 0.4) * (e.gap ? 0.25 : 1);
      const g0 = e.kind.endsWith('mother') ? n.g * 0.85 : n.g;
      ineqs.push({ i: B(e.parent), j: B(id), delta: g0, w: w / (n.sigma * n.sigma), kind: 'eq' });
      ineqs.push({ i: B(e.parent), j: B(id), delta: e.kind.endsWith('mother') ? 14 : n.min, w: 50 / (n.sigma * n.sigma), kind: 'ge' });
      if (main && !e.gap) {
        // рождение при жизни матери и не позже года после смерти отца
        ineqs.push({ i: B(id), j: D(e.parent), delta: e.kind === 'father' ? -1 : 0, w: 5 / (n.sigma * n.sigma), kind: 'ge' });
      }
    }
    // порядок братьев
    const kids = primaryChildren(g, id);
    for (let k = 1; k < kids.length; k++) {
      const a = g.persons.get(kids[k - 1])!;
      const b = g.persons.get(kids[k])!;
      if (a.order !== undefined && b.order !== undefined && b.order > a.order) {
        ineqs.push({ i: B(kids[k - 1]), j: B(kids[k]), delta: 1, w: 0.5, kind: 'ge' });
      }
    }
    // супруги — примерно одного поколения
    for (const s of g.spousesOf.get(id) ?? []) {
      if (s.a !== id) continue;
      ineqs.push({ i: B(s.a), j: B(s.b), delta: 3, w: 0.05, kind: 'eq' });
    }
  }

  // --- 4. переменные — корни компонент
  const allKeys = new Set<string>();
  for (const id of g.order) {
    allKeys.add(B(id));
    allKeys.add(D(id));
  }
  const rootOffset = new Map<string, { root: string; off: number }>();
  for (const k of allKeys) rootOffset.set(k, rootOf(k));
  const value = new Map<string, number>(); // значения корней
  const free = new Set<string>();
  for (const k of allKeys) {
    const { root } = rootOffset.get(k)!;
    if (fixed.has(root)) value.set(root, fixed.get(root)!.value);
    else free.add(root);
  }
  // корни, у которых из смерти нет никаких данных, не должны тянуть решение: смерть без возраста — отдельная свободная переменная
  const hasDeathData = (id: string) => {
    const r = rootOffset.get(D(id))!;
    return r.root !== D(id) || fixed.has(D(id));
  };

  const val = (key: string): number | undefined => {
    if (key.startsWith('@')) return Number(key.slice(1));
    const ro = rootOffset.get(key);
    if (!ro) return undefined;
    const v = value.get(ro.root);
    return v === undefined ? undefined : v + ro.off;
  };

  // начальные значения свободных корней: распространение от закреплённых по поколениям
  const init = new Map<string, number>();
  const queue: string[] = [];
  for (const id of g.order) {
    const v = val(B(id));
    if (v !== undefined) {
      init.set(id, v);
      queue.push(id);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const v = init.get(id)!;
    const n = normFor(epochOf(id));
    for (const e of g.childrenOf.get(id) ?? []) if (!init.has(e.child)) { init.set(e.child, v + n.g); queue.push(e.child); }
    for (const e of g.parentsOf.get(id) ?? []) if (!init.has(e.parent)) { init.set(e.parent, v - n.g); queue.push(e.parent); }
    for (const s of g.spousesOf.get(id) ?? []) {
      const o = s.a === id ? s.b : s.a;
      if (!init.has(o)) { init.set(o, v); queue.push(o); }
    }
  }
  for (const id of g.order) {
    const ro = rootOffset.get(B(id))!;
    if (value.has(ro.root)) continue;
    let guess = init.get(id);
    if (guess === undefined) {
      const pr = priors.get(B(id));
      guess = pr ? (pr.lo + pr.hi) / 2 : toAstro(-1000);
    }
    if (!value.has(ro.root)) value.set(ro.root, guess - ro.off);
  }
  for (const id of g.order) {
    const ro = rootOffset.get(D(id))!;
    if (!value.has(ro.root)) {
      const b = val(B(id))!;
      value.set(ro.root, b + normFor(epochOf(id)).life - ro.off);
    }
  }

  // --- 5. Гаусс — Зейдель по свободным корням
  type Term = { other: string; sign: 1 | -1; delta: number; w: number; kind: Ineq['kind']; selfOff: number };
  const terms = new Map<string, Term[]>();
  const addTerm = (root: string, t: Term) => {
    const a = terms.get(root);
    if (a) a.push(t);
    else terms.set(root, [t]);
  };
  for (const q of ineqs) {
    const ri = q.i.startsWith('@') ? null : rootOffset.get(q.i);
    const rj = q.j.startsWith('@') ? null : rootOffset.get(q.j);
    if (ri && free.has(ri.root)) addTerm(ri.root, { other: q.j, sign: -1, delta: q.delta, w: q.w, kind: q.kind, selfOff: ri.off });
    if (rj && free.has(rj.root)) addTerm(rj.root, { other: q.i, sign: 1, delta: q.delta, w: q.w, kind: q.kind, selfOff: rj.off });
  }
  for (const [key, pr] of priors) {
    const ro = rootOffset.get(key)!;
    if (!free.has(ro.root)) continue;
    addTerm(ro.root, { other: `@${pr.lo}`, sign: 1, delta: 0, w: pr.w, kind: 'ge', selfOff: ro.off });
    addTerm(ro.root, { other: `@${pr.hi}`, sign: 1, delta: 0, w: pr.w, kind: 'le', selfOff: ro.off });
  }

  const freeRoots = [...free].filter((r) => terms.has(r));
  for (let sweep = 0; sweep < 400; sweep++) {
    let maxMove = 0;
    for (const r of freeRoots) {
      const cur = value.get(r)!;
      let num = 0;
      let den = 0;
      for (const t of terms.get(r)!) {
        const ov = val(t.other);
        if (ov === undefined) continue;
        // собственное значение в терминах ограничения: x_self = cur + selfOff
        // sign = +1: x_self − x_other (≥|=|≤) delta → цель x_self = x_other + delta
        // sign = −1: x_other − x_self (≥|=|≤) delta → цель x_self = x_other − delta
        const target = t.sign === 1 ? ov + t.delta : ov - t.delta;
        const self = cur + t.selfOff;
        let active = true;
        if (t.kind === 'ge') active = t.sign === 1 ? self < target : self > target;
        if (t.kind === 'le') active = t.sign === 1 ? self > target : self < target;
        if (!active) continue;
        num += t.w * (target - t.selfOff);
        den += t.w;
      }
      if (den === 0) continue;
      const next = cur + 0.9 * (num / den - cur);
      maxMove = Math.max(maxMove, Math.abs(next - cur));
      value.set(r, next);
    }
    if (maxMove < 0.05) break;
  }

  // --- 6. классы дат и неопределённость
  const cls = new Map<string, DateClass>();
  for (const id of g.order) {
    const ro = rootOffset.get(B(id))!;
    const f = fixed.get(ro.root);
    if (f) cls.set(id, f.cls);
    else {
      const informative = (g.parentsOf.get(id)?.length ?? 0) + (g.childrenOf.get(id)?.length ?? 0) + (g.spousesOf.get(id)?.length ?? 0) > 0;
      const c = g.persons.get(id)!.chrono;
      cls.set(id, informative || c?.active || c?.reign?.length ? 'estimated' : 'epochal');
    }
  }
  // расстояние в поколениях до датированных лиц (вверх и вниз)
  const distUp = new Map<string, number>();
  const distDown = new Map<string, number>();
  const bfs = (dist: Map<string, number>, next: (id: string) => string[]) => {
    const q: string[] = [];
    for (const id of g.order) if (cls.get(id) === 'exact' || cls.get(id) === 'calculated') { dist.set(id, 0); q.push(id); }
    while (q.length) {
      const id = q.shift()!;
      for (const n of next(id)) if (!dist.has(n)) { dist.set(n, dist.get(id)! + 1); q.push(n); }
    }
  };
  bfs(distUp, (id) => (g.childrenOf.get(id) ?? []).map((e) => e.child)); // от датированных предков вниз
  bfs(distDown, (id) => (g.parentsOf.get(id) ?? []).map((e) => e.parent)); // от датированных потомков вверх

  const persons = new Map<string, PersonChrono>();
  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const b = val(B(id))!;
    const ep = epochAt(epochs, b);
    const epochId = p.chrono?.epoch ?? ep?.id ?? null;
    const n = normFor(epochId);
    const k = cls.get(id)!;
    let half: number;
    if (k === 'exact') half = 0;
    else if (k === 'calculated') half = 2;
    else {
      const a = distUp.get(id);
      const c = distDown.get(id);
      let v: number;
      if (a !== undefined && c !== undefined) v = (a * c) / (a + c);
      else if (a !== undefined || c !== undefined) v = (a ?? c)!;
      else v = 6;
      half = Math.min(1.64 * n.sigma * Math.sqrt(Math.max(v, 0.5)), 400);
    }
    let bLo = b - half;
    let bHi = b + half;
    const pe = p.chrono?.epoch ? epochById.get(p.chrono.epoch) : null;
    if (k === 'epochal' && pe) {
      bLo = toAstro(pe.start);
      bHi = toAstro(pe.end);
    }
    // смерть
    let d: number | null = null;
    let dLo: number | null = null;
    let dHi: number | null = null;
    if (hasDeathData(id)) {
      d = val(D(id))!;
      dLo = d - half;
      dHi = d + half;
    }
    let last: number | null = null;
    const c = p.chrono;
    const bump = (y: number | undefined) => {
      if (y === undefined) return;
      last = last === null ? y : Math.max(last, y);
    };
    if (c?.active) bump(toAstro(c.active.to));
    for (const r of c?.reign ?? []) bump(toAstro(r.end));
    for (const e of p.card?.events ?? []) if (e.year !== undefined) bump(toAstro(e.year));
    for (const e of p.card?.events ?? []) if (e.age !== undefined) bump(b + e.age);
    for (const e of g.childrenOf.get(id) ?? []) if (e.kind === 'father' || e.kind === 'mother') {
      const cb = val(B(e.child));
      if (cb !== undefined && cls.get(e.child) !== 'epochal') bump(e.kind === 'father' ? cb - 1 : cb);
    }
    const dEst = d ?? Math.max(last ?? -Infinity, b + n.life);
    persons.set(id, { b, bLo, bHi, d, dLo, dHi, lastAttested: last, dEst, cls: k, epoch: ep?.id ?? null });
  }

  // --- 7. напряжения между датированными лицами
  for (const id of g.order) {
    const me = persons.get(id)!;
    for (const e of g.parentsOf.get(id) ?? []) {
      if (e.kind !== 'father' && e.kind !== 'mother') continue;
      const par = persons.get(e.parent)!;
      const dated = (x: PersonChrono) => x.cls === 'exact' || x.cls === 'calculated';
      const pName = g.persons.get(e.parent)!.name;
      const cName = g.persons.get(id)!.name;
      const refs = [...e.refs, ...(g.persons.get(e.parent)!.chrono?.died?.refs ?? []), ...(g.persons.get(id)!.chrono?.born?.refs ?? [])];
      if (!dated(me) || !dated(par)) {
        // даже при оценочных датах: если возраст родителя при смерти задан текстом, а ребёнок никак не помещается
        if (par.d !== null && me.b > par.d + 3 && (e.kind === 'father' || e.kind === 'mother') && !e.gap) {
          tensions.push({
            persons: [e.parent, id],
            text: `${cName} не помещается в жизнь ${e.kind === 'father' ? 'отца' : 'матери'} (${pName}): при числах текста рождение приходится на ${Math.round(me.b - par.d)} лет позже смерти; вероятно, родословие сокращено`,
            refs: [...new Set(refs)],
          });
        }
        continue;
      }
      const age = me.b - par.b;
      if (par.d !== null && me.b > par.d + (e.kind === 'father' ? 1 : 0) + 0.5) {
        tensions.push({
          persons: [e.parent, id],
          text: `${cName} рождается через ${Math.round(me.b - par.d)} лет после смерти ${e.kind === 'father' ? 'отца' : 'матери'} (${pName}) — по числам текста; вероятно, родословие сокращено или это более далёкий предок`,
          refs: [...new Set(refs)],
        });
      } else if (e.kind === 'father' && age < 13) {
        tensions.push({ persons: [e.parent, id], text: `${pName} был бы ${Math.round(age)} лет при рождении ${cName} — по годам правления и возрасту при воцарении`, refs: [...new Set(refs)] });
      } else if (e.kind === 'mother' && age > 60 && g.persons.get(id)!.chrono?.born?.motherAge === undefined) {
        tensions.push({ persons: [e.parent, id], text: `${pName} было бы ${Math.round(age)} лет при рождении ${cName}`, refs: [...new Set(refs)] });
      }
    }
  }
  // цепочки недатированных между датированными: средняя длина поколения вне пределов эпохи
  for (const id of g.order) {
    const me = persons.get(id)!;
    if (me.cls !== 'exact' && me.cls !== 'calculated') continue;
    let cur = id;
    let steps = 0;
    const chain: string[] = [id];
    for (;;) {
      const f = fatherOf(g, cur) ?? motherOf(g, cur);
      if (!f) break;
      steps++;
      chain.push(f);
      const pc = persons.get(f)!;
      if (pc.cls === 'exact' || pc.cls === 'calculated') {
        if (steps >= 2) {
          const avg = (me.b - pc.b) / steps;
          const n = normFor(pc.epoch);
          if (avg > n.max * 1.05 || avg < n.min * 0.9) {
            const names = chain.map((x) => g.persons.get(x)!.name).reverse();
            tensions.push({
              persons: [...chain].reverse(),
              text: `${names[0]} → ${names[names.length - 1]}: ${steps} поколений на ${Math.round(me.b - pc.b)} лет (в среднем ${Math.round(avg)}); вероятно, родословие сокращено`,
              refs: [...new Set(chain.flatMap((x) => g.persons.get(x)!.parentRefs ?? []))].slice(0, 6),
            });
          }
        }
        break;
      }
      cur = f;
      if (steps > 60) break;
    }
  }
  return { model: modelId, persons, tensions: dedupeTensions(tensions) };
}

function dedupeTensions(ts: Tension[]): Tension[] {
  const seen = new Set<string>();
  return ts.filter((t) => {
    const k = t.persons.join('|') + t.text.slice(0, 20);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Лица, чьи жизни пересекаются с жизнью данного: «наверняка» — по крайним оценкам, «вероятно» — по центральным. */
export function contemporaries(res: ChronoResult, id: string, limit = 40): { id: string; sure: boolean }[] {
  const me = res.persons.get(id);
  if (!me) return [];
  const myEnd = me.d ?? me.dEst;
  const out: { id: string; sure: boolean; overlap: number }[] = [];
  for (const [oid, o] of res.persons) {
    if (oid === id || o.cls === 'epochal') continue;
    const oEnd = o.d ?? o.dEst;
    const overlap = Math.min(myEnd, oEnd) - Math.max(me.b, o.b);
    if (overlap <= 0) continue;
    const sureEnd = Math.min(me.d ?? (me.lastAttested ?? me.b), o.d ?? (o.lastAttested ?? o.b));
    const sure = sureEnd - Math.max(me.bHi, o.bHi) > 0;
    out.push({ id: oid, sure, overlap });
  }
  return out.sort((a, b) => Number(b.sure) - Number(a.sure) || b.overlap - a.overlap).slice(0, limit).map(({ id: x, sure }) => ({ id: x, sure }));
}

export type { Person };
