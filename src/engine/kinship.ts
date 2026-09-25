/**
 * Калькулятор родства (ТЗ § 3.7).
 * Кровное родство — через общих предков: для каждого минимального общего предка C получаем пару (a, b):
 * a поколений от A вверх до C и b поколений от C вниз до B. Все пары перечисляются, поэтому видны
 * «двойные» родства (Моисей — правнук Левия через Амрама и внук через Иохаведу, Исх 6:20; Чис 26:59).
 * Свойство — через одно супружество. Термины самого Писания (kin) показываются рядом с вычисленными.
 */
import type { Graph } from './graph.ts';

export interface KinStep {
  from: string;
  to: string;
  kind: 'up' | 'down' | 'spouse' | 'kin';
  interpretive: boolean;
}

export interface Relation {
  term: string; // «прабабушка», «двоюродный брат», «тесть»
  sentence: string; // «Руфь — прабабушка Давида»
  steps: KinStep[];
  ancestor: string | null;
  up: number;
  down: number;
  interpretive: boolean;
  scriptureTerm?: string; // термин Писания (kin), если есть
}

interface Anc {
  dist: number;
  path: KinStep[]; // от лица вверх к предку
  interpretive: boolean;
}

/** Все предки с кратчайшими путями по каждой ветви (до maxDepth поколений). */
function ancestors(g: Graph, id: string, maxDepth = 90): Map<string, Anc[]> {
  const out = new Map<string, Anc[]>();
  out.set(id, [{ dist: 0, path: [], interpretive: false }]);
  let frontier: { id: string; anc: Anc }[] = [{ id, anc: out.get(id)![0] }];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: { id: string; anc: Anc }[] = [];
    for (const f of frontier) {
      for (const e of g.parentsOf.get(f.id) ?? []) {
        const interp = f.anc.interpretive || e.cert === 'interpretation' || e.kind.startsWith('other') || e.claim === 'legal';
        const anc: Anc = { dist: depth, path: [...f.anc.path, { from: f.id, to: e.parent, kind: 'up', interpretive: interp }], interpretive: interp };
        const list = out.get(e.parent);
        if (list) {
          // сохраняем разные ветви, но не больше трёх на предка
          if (list.length < 3 && !list.some((x) => x.dist === depth && x.interpretive === interp)) list.push(anc);
          else continue;
        } else out.set(e.parent, [anc]);
        next.push({ id: e.parent, anc });
      }
    }
    frontier = next;
  }
  return out;
}

const PRA = (n: number) => 'пра'.repeat(Math.max(0, n));
const ORD = ['', 'родной', 'двоюродный', 'троюродный', 'четвероюродный', 'пятиюродный', 'шестиюродный'];
const ORD_F = ['', 'родная', 'двоюродная', 'троюродная', 'четвероюродная', 'пятиюродная', 'шестиюродная'];

/** Название кровного родства A по отношению к B по (a, b). */
export function bloodTerm(a: number, b: number, female: boolean, halfSibling?: 'paternal' | 'maternal'): string {
  if (a === 0 && b === 0) return female ? 'она же' : 'он же';
  if (a === 0) {
    // A — предок B
    if (b === 1) return female ? 'мать' : 'отец';
    if (b <= 5) return PRA(b - 2) + (female ? 'бабушка' : 'дед');
    return `${female ? 'прародительница' : 'предок'} в ${b}-м колене`;
  }
  if (b === 0) {
    if (a === 1) return female ? 'дочь' : 'сын';
    if (a <= 5) return PRA(a - 2) + (female ? 'внучка' : 'внук');
    return `${female ? 'потомица' : 'потомок'} в ${a}-м колене`;
  }
  const m = Math.min(a, b);
  const diff = b - a; // > 0 — A старше по поколению
  if (m > 6 || Math.abs(diff) > 4) return '';
  if (diff === 0) {
    if (m === 1) {
      if (halfSibling === 'paternal') return female ? 'единокровная сестра' : 'единокровный брат';
      if (halfSibling === 'maternal') return female ? 'единоутробная сестра' : 'единоутробный брат';
      return female ? 'сестра' : 'брат';
    }
    return `${(female ? ORD_F : ORD)[m]} ${female ? 'сестра' : 'брат'}`;
  }
  if (diff > 0) {
    // A — «дядя» разных степеней
    if (diff === 1) return m === 1 ? (female ? 'тётя' : 'дядя') : `${(female ? ORD_F : ORD)[m]} ${female ? 'тётя' : 'дядя'}`;
    const base = PRA(diff - 2) + (female ? 'бабушка' : 'дед');
    return `${(female ? ORD_F : ORD)[Math.min(6, m + 1)]} ${base}`;
  }
  const d = -diff;
  const nephew = d === 1 ? (female ? 'племянница' : 'племянник') : `${d === 2 ? 'внучат' : 'пра'.repeat(d - 2) + 'внучат'}${female ? 'ая племянница' : 'ый племянник'}`;
  return m === 1 ? nephew : `${(female ? ORD_F : ORD)[m]} ${nephew}`;
}

function genitive(name: string): string {
  // простое склонение для подписи: «Давида», «Руфи», «Марии», «Иисуса»
  const n = name.split(' ')[0];
  if (/ия$/.test(n)) return n.slice(0, -1) + 'и';
  if (/ья$/.test(n)) return n.slice(0, -1) + 'и';
  if (/а$/.test(n)) return n.slice(0, -1) + (/[гкхжчшщ]а$/.test(n) ? 'и' : 'ы');
  if (/я$/.test(n)) return n.slice(0, -1) + 'и';
  if (/ь$/.test(n)) return n.slice(0, -1) + 'и';
  if (/й$/.test(n)) return n.slice(0, -1) + 'я';
  if (/[бвгдзклмнпрстфхцчшщж]$/.test(n)) return n + 'а';
  return n;
}

export function relate(g: Graph, aId: string, bId: string, maxResults = 6): Relation[] {
  const A = g.persons.get(aId);
  const Bp = g.persons.get(bId);
  if (!A || !Bp) return [];
  const female = A.sex === 'f';
  const out: Relation[] = [];
  const sentence = (term: string) => `${A.name} — ${term} ${genitive(Bp.name)}`;

  // термины Писания
  for (const k of g.kinOf.get(aId) ?? []) {
    if (k.from === aId && k.to === bId) {
      out.push({
        term: k.rel, sentence: sentence(k.rel), steps: [{ from: aId, to: bId, kind: 'kin', interpretive: k.cert === 'interpretation' }],
        ancestor: null, up: 0, down: 0, interpretive: k.cert === 'interpretation', scriptureTerm: k.rel,
      });
    }
  }
  // супруги
  for (const s of g.spousesOf.get(aId) ?? []) {
    const other = s.a === aId ? s.b : s.a;
    if (other === bId) {
      const term = female ? (s.kind === 'concubine' ? 'наложница' : 'жена') : 'муж';
      out.push({ term, sentence: sentence(term), steps: [{ from: aId, to: bId, kind: 'spouse', interpretive: false }], ancestor: null, up: 0, down: 0, interpretive: false });
    }
  }

  // кровное родство
  const ancA = ancestors(g, aId);
  const ancB = ancestors(g, bId);
  const common: { c: string; a: Anc; b: Anc }[] = [];
  for (const [c, la] of ancA) {
    const lb = ancB.get(c);
    if (!lb) continue;
    for (const a of la) for (const b of lb) common.push({ c, a, b });
  }
  // только минимальные общие предки: предок C не нужен, если его потомок на том же пути тоже общий
  const isMinimal = (x: { c: string; a: Anc; b: Anc }) => {
    const lastA = x.a.path[x.a.path.length - 1]?.from;
    const lastB = x.b.path[x.b.path.length - 1]?.from;
    if (lastA && lastB && lastA === lastB) return false; // оба пути проходят через одного ребёнка C
    return true;
  };
  const pairs = common.filter(isMinimal).sort((x, y) => x.a.dist + x.b.dist - (y.a.dist + y.b.dist));
  const seen = new Set<string>();
  for (const x of pairs) {
    const key = `${x.a.dist}/${x.b.dist}/${x.a.interpretive || x.b.interpretive}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let half: 'paternal' | 'maternal' | undefined;
    if (x.a.dist === 1 && x.b.dist === 1) {
      const fa = [...(g.parentsOf.get(aId) ?? [])].filter((e) => e.kind === 'father' || e.kind === 'mother');
      const fb = [...(g.parentsOf.get(bId) ?? [])].filter((e) => e.kind === 'father' || e.kind === 'mother');
      const sameF = fa.some((e) => e.kind === 'father' && fb.some((f) => f.kind === 'father' && f.parent === e.parent));
      const sameM = fa.some((e) => e.kind === 'mother' && fb.some((f) => f.kind === 'mother' && f.parent === e.parent));
      if (sameF && !sameM && fa.some((e) => e.kind === 'mother') && fb.some((e) => e.kind === 'mother')) half = 'paternal';
      if (sameM && !sameF && fa.some((e) => e.kind === 'father') && fb.some((e) => e.kind === 'father')) half = 'maternal';
    }
    let term = bloodTerm(x.a.dist, x.b.dist, female, half);
    const cName = g.persons.get(x.c)!.name;
    if (!term) term = `родственник${female ? 'ца' : ''}: общий предок — ${cName}; ${x.a.dist} поколений вверх, ${x.b.dist} вниз`;
    const down = [...x.b.path].reverse().map((s) => ({ from: s.to, to: s.from, kind: 'down' as const, interpretive: s.interpretive }));
    out.push({
      term, sentence: sentence(term), steps: [...x.a.path, ...down], ancestor: x.c, up: x.a.dist, down: x.b.dist,
      interpretive: x.a.interpretive || x.b.interpretive,
    });
    if (out.length >= maxResults) break;
  }

  // свойство через одно супружество
  const inLaw = (term: string, via: string, steps: KinStep[]) => {
    if (!out.some((r) => r.term === term)) out.push({ term: `${term} (через ${g.persons.get(via)!.name})`, sentence: sentence(term), steps, ancestor: null, up: 0, down: 0, interpretive: steps.some((s) => s.interpretive) });
  };
  const spousesOf = (id: string) => (g.spousesOf.get(id) ?? []).map((s) => (s.a === id ? s.b : s.a));
  const parentsOf = (id: string) => (g.parentsOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.parent);
  const childrenOf = (id: string) => (g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').map((e) => e.child);
  const siblingsOf = (id: string) => [...new Set(parentsOf(id).flatMap(childrenOf))].filter((x) => x !== id);
  const bMale = Bp.sex === 'm';
  for (const s of spousesOf(bId)) {
    if (parentsOf(s).includes(aId)) inLaw(bMale ? (female ? 'тёща' : 'тесть') : female ? 'свекровь' : 'свёкор', s, [{ from: aId, to: s, kind: 'down', interpretive: false }, { from: s, to: bId, kind: 'spouse', interpretive: false }]);
    if (siblingsOf(s).includes(aId)) inLaw(bMale ? (female ? 'свояченица' : 'шурин') : female ? 'золовка' : 'деверь', s, [{ from: aId, to: s, kind: 'kin', interpretive: false }, { from: s, to: bId, kind: 'spouse', interpretive: false }]);
  }
  for (const c of childrenOf(bId)) if (spousesOf(c).includes(aId)) inLaw(female ? 'невестка' : 'зять', c, [{ from: aId, to: c, kind: 'spouse', interpretive: false }, { from: c, to: bId, kind: 'up', interpretive: false }]);
  for (const s of siblingsOf(bId)) if (spousesOf(s).includes(aId)) inLaw(female ? 'невестка' : 'зять', s, [{ from: aId, to: s, kind: 'spouse', interpretive: false }, { from: s, to: bId, kind: 'kin', interpretive: false }]);

  return out.slice(0, maxResults);
}
