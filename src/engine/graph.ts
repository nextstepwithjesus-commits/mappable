import type { Person, Cert } from '../data/types.ts';

export type EdgeKind = 'father' | 'mother' | 'other-father' | 'other-mother';

export interface ParentEdge {
  parent: string;
  child: string;
  kind: EdgeKind;
  /** вид утверждения: natural | legal | by-luke | alternative | adoptive | levirate | ancestor */
  claim: string;
  refs: string[];
  cert: Cert;
  gap: boolean;
}

export interface SpouseEdge {
  a: string; // муж (если известен пол)
  b: string;
  kind: 'wife' | 'concubine' | 'husband';
  refs: string[];
  cert: Cert;
  order?: number;
  note?: string;
}

export interface KinEdge {
  from: string;
  to: string;
  rel: string;
  refs: string[];
  cert: Cert;
}

export interface Graph {
  persons: Map<string, Person>;
  order: string[]; // порядок появления в данных
  parentsOf: Map<string, ParentEdge[]>; // все утверждения о родителях
  childrenOf: Map<string, ParentEdge[]>; // все утверждения о детях
  spousesOf: Map<string, SpouseEdge[]>;
  kinOf: Map<string, KinEdge[]>;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

export function buildGraph(persons: Person[]): Graph {
  const g: Graph = {
    persons: new Map(),
    order: [],
    parentsOf: new Map(),
    childrenOf: new Map(),
    spousesOf: new Map(),
    kinOf: new Map(),
  };
  for (const p of persons) {
    g.persons.set(p.id, p);
    g.order.push(p.id);
  }
  const has = (id: string | null | undefined): id is string => !!id && g.persons.has(id);

  for (const p of persons) {
    const cert: Cert = p.parentCert ?? 'scripture';
    if (has(p.father)) {
      const e: ParentEdge = {
        parent: p.father, child: p.id, kind: 'father', claim: p.fatherKind === 'legal' ? 'legal' : 'natural',
        refs: p.parentRefs ?? [], cert, gap: !!p.fatherGap,
      };
      push(g.parentsOf, p.id, e);
      push(g.childrenOf, p.father, e);
    }
    if (has(p.mother)) {
      const e: ParentEdge = { parent: p.mother, child: p.id, kind: 'mother', claim: 'natural', refs: p.parentRefs ?? [], cert: p.motherCert ?? cert, gap: false };
      push(g.parentsOf, p.id, e);
      push(g.childrenOf, p.mother, e);
    }
    for (const o of p.otherParents ?? []) {
      if (!has(o.id)) continue;
      const e: ParentEdge = {
        parent: o.id, child: p.id, kind: o.role === 'father' ? 'other-father' : 'other-mother', claim: o.kind,
        refs: o.refs, cert: o.cert, gap: o.kind === 'ancestor',
      };
      push(g.parentsOf, p.id, e);
      push(g.childrenOf, o.id, e);
    }
  }

  // супружества: симметризация без дублей
  const seen = new Set<string>();
  for (const p of persons) {
    for (const s of p.spouses ?? []) {
      if (!has(s.id)) continue;
      const key = [p.id, s.id].sort().join('|');
      if (seen.has(key)) {
        // дополняем ссылки существующей записи
        const ex = (g.spousesOf.get(p.id) ?? []).find((e) => e.a === s.id || e.b === s.id);
        if (ex) {
          for (const r of s.refs) if (!ex.refs.includes(r)) ex.refs.push(r);
          if (s.note && !ex.note) ex.note = s.note;
        }
        continue;
      }
      seen.add(key);
      const husband = s.kind === 'husband' ? s.id : p.id;
      const wife = s.kind === 'husband' ? p.id : s.id;
      const e: SpouseEdge = {
        a: husband, b: wife, kind: s.kind === 'husband' ? 'wife' : s.kind, refs: [...s.refs], cert: s.cert ?? 'scripture', order: s.order, note: s.note,
      };
      push(g.spousesOf, husband, e);
      push(g.spousesOf, wife, e);
    }
    for (const k of p.kin ?? []) {
      if (!has(k.id)) continue;
      const e: KinEdge = { from: p.id, to: k.id, rel: k.rel, refs: k.refs, cert: k.cert ?? 'scripture' };
      push(g.kinOf, p.id, e);
      push(g.kinOf, k.id, e);
    }
  }
  return g;
}

/** Основной отец (кровный или законный), иначе мать. */
export function primaryParent(g: Graph, id: string): string | null {
  const edges = g.parentsOf.get(id) ?? [];
  return edges.find((e) => e.kind === 'father')?.parent ?? edges.find((e) => e.kind === 'mother')?.parent ?? null;
}

export function fatherOf(g: Graph, id: string): string | null {
  return (g.parentsOf.get(id) ?? []).find((e) => e.kind === 'father')?.parent ?? null;
}

export function motherOf(g: Graph, id: string): string | null {
  return (g.parentsOf.get(id) ?? []).find((e) => e.kind === 'mother')?.parent ?? null;
}

/** Дети по основной линии (отец или мать), в порядке рождения или перечисления. */
export function primaryChildren(g: Graph, id: string): string[] {
  const out: string[] = [];
  for (const e of g.childrenOf.get(id) ?? []) if ((e.kind === 'father' || e.kind === 'mother') && !out.includes(e.child)) out.push(e.child);
  return out.sort((a, b) => (g.persons.get(a)!.order ?? 999) - (g.persons.get(b)!.order ?? 999) || g.order.indexOf(a) - g.order.indexOf(b));
}

/** Родные, единокровные и единоутробные братья и сёстры. */
export function siblings(g: Graph, id: string): { id: string; kind: 'full' | 'paternal' | 'maternal' }[] {
  const f = fatherOf(g, id);
  const m = motherOf(g, id);
  const out = new Map<string, 'full' | 'paternal' | 'maternal'>();
  for (const par of [f, m]) {
    if (!par) continue;
    for (const e of g.childrenOf.get(par) ?? []) {
      if (e.child === id || (e.kind !== 'father' && e.kind !== 'mother')) continue;
      const cf = fatherOf(g, e.child);
      const cm = motherOf(g, e.child);
      const sameF = !!f && cf === f;
      const sameM = !!m && cm === m;
      out.set(e.child, sameF && sameM ? 'full' : sameF ? 'paternal' : sameM ? 'maternal' : 'paternal');
    }
  }
  return [...out].map(([sid, kind]) => ({ id: sid, kind }));
}
