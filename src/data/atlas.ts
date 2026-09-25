/**
 * Данные атласа во время работы: индекс неба (src/generated/atlas.json) разворачивается в удобные структуры;
 * тела карточек и тексты стихов подгружаются по требованию (по томам и по книгам).
 */
import raw from '../generated/atlas.json';
import type { Card, Chrono, Epoch, Group, Role, Sex, PersonKind, Cert } from './types.ts';
import type { Book } from '../engine/books.ts';
import type { ChronoModel, DateClass, Tension } from '../engine/chronology.ts';
import type { BlockInfo, LineStep } from '../engine/layout.ts';
import type { Graph } from '../engine/graph.ts';
import { buildGraph } from '../engine/graph.ts';
import type { Person } from './types.ts';

export interface IdxPerson {
  id: string;
  name: string;
  disambig: string;
  sex: Sex;
  kind: PersonKind;
  unnamed: boolean;
  group: string;
  prominence: number;
  magnitude: number;
  roles: Role[];
  volume: string;
  father: string | null;
  mother: string | null;
  fatherKind: string;
  fatherGap: boolean;
  parentCert: Cert;
  motherCert: Cert;
  parentRefs: string[];
  otherParents: { id: string; role: 'father' | 'mother'; kind: string; cert: Cert; refs: string[] }[];
  spouses: { id: string; kind: string; refs: string[]; cert: Cert }[];
  kin: { id: string; rel: string; refs: string[]; cert: Cert }[];
  order: number | null;
  alt: string[];
  books: Record<string, number>;
  epoch: string | null;
  reign: { over: string; start: number; end: number; years: number | null }[];
  active: [number, number] | null;
  silent: number[];
  filled: string[];
}

export interface ChronoRow {
  b: number;
  bLo: number;
  bHi: number;
  d: number | null;
  last: number | null;
  dEst: number;
  cls: DateClass;
  epoch: string | null;
}

export interface NodeRow {
  id: string;
  person: string;
  ghost: boolean;
  lane: number;
  t0: number;
  t1: number;
  block: number;
  parentLane: number | null;
  layoutParent: string | null;
  satelliteOf: string | null;
  spine: boolean;
}

export interface ModelData {
  id: string;
  chrono: Map<string, ChronoRow>;
  tensions: Tension[];
  nodes: NodeRow[];
  nodeByPerson: Map<string, NodeRow>;
  blocks: BlockInfo[];
  laneMin: number;
  laneMax: number;
  metrics: Record<string, number>;
  scale: { knots: number[]; xTrue: number[]; xDense: number[] };
}

export interface LineFile {
  id: string;
  name: string;
  subtitle: string;
  basis: string;
  refs: string[];
  persons: LineStep[];
}

type RawChrono = [number, number, number, number | null, number | null, number, DateClass, string | null];
type RawNode = [string, number, number, number, number, number | null, string | null, string | null, number];
interface RawAtlas {
  built: string;
  persons: Record<string, never>[];
  models: {
    id: string;
    chrono: Record<string, RawChrono>;
    tensions: Tension[];
    layout: { nodes: RawNode[]; blocks: BlockInfo[]; laneMin: number; laneMax: number; metrics: Record<string, number> };
    scale: { knots: number[]; xTrue: number[]; xDense: number[] };
  }[];
  modelInfo: unknown;
  lines: unknown;
  epochs: unknown;
  groups: unknown;
  books: unknown;
  anchors: unknown;
  volumes: unknown;
}
const R = raw as unknown as RawAtlas;

export const persons: IdxPerson[] = R.persons.map((p) => ({
  id: p.id,
  name: p.n,
  disambig: p.d,
  sex: p.s,
  kind: p.k,
  unnamed: !!p.u,
  group: p.g,
  prominence: p.pr,
  magnitude: p.mg,
  roles: p.r,
  volume: p.v,
  father: p.f,
  mother: p.m,
  fatherKind: p.fk,
  fatherGap: !!p.fg,
  parentCert: p.pc,
  motherCert: p.mc,
  parentRefs: p.pRefs,
  otherParents: p.op,
  spouses: p.sp,
  kin: p.kin,
  order: p.ord,
  alt: p.alt,
  books: p.books,
  epoch: p.ep,
  reign: p.reign,
  active: p.active,
  silent: p.silent,
  filled: p.filled,
}));
export const byId = new Map(persons.map((p) => [p.id, p]));

export const models: ModelData[] = R.models.map((m) => {
  const chrono = new Map<string, ChronoRow>();
  for (const [id, r] of Object.entries(m.chrono)) chrono.set(id, { b: r[0], bLo: r[1], bHi: r[2], d: r[3], last: r[4], dEst: r[5], cls: r[6], epoch: r[7] });
  const nodes: NodeRow[] = m.layout.nodes.map((n) => ({
    id: n[0], person: n[0].startsWith('ghost:') ? n[0].slice(6) : n[0], ghost: n[0].startsWith('ghost:'), lane: n[1], t0: n[2], t1: n[3], block: n[4],
    parentLane: n[5], layoutParent: n[6], satelliteOf: n[7], spine: !!n[8],
  }));
  return {
    id: m.id, chrono, tensions: m.tensions, nodes, nodeByPerson: new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n])),
    blocks: m.layout.blocks, laneMin: m.layout.laneMin, laneMax: m.layout.laneMax, metrics: m.layout.metrics, scale: m.scale,
  };
});

export const modelInfo = R.modelInfo as ChronoModel[];
export const lines = R.lines as unknown as { joseph: LineFile; mary: LineFile };
export const epochs = R.epochs as unknown as Epoch[];
export const groups = R.groups as unknown as Group[];
export const groupById = new Map(groups.map((g) => [g.id, g]));
export const books = R.books as unknown as Book[];
export const anchors = (R.anchors as unknown as { anchors: { id: string; event: string; value: number; verse: string; source: string; alternatives: string[] }[] }).anchors;
export const volumes = R.volumes as unknown as { volume: string; title: string; scope: string; count: number }[];
export const builtAt = R.built;

/** Граф для калькулятора родства и вычисляемых разделов карточки. */
export const graph: Graph = buildGraph(
  persons.map(
    (p): Person => ({
      id: p.id, name: p.name, sex: p.sex, group: p.group, prominence: p.prominence as Person['prominence'],
      father: p.father, mother: p.mother, parentRefs: p.parentRefs, parentCert: p.parentCert, motherCert: p.motherCert, order: p.order ?? undefined,
      fatherKind: p.fatherKind === 'legal' ? 'legal' : undefined, fatherGap: p.fatherGap,
      otherParents: p.otherParents.map((o) => ({ id: o.id, role: o.role, kind: o.kind as never, refs: o.refs, cert: o.cert })),
      spouses: p.spouses.map((s) => ({ id: s.id, kind: s.kind as never, refs: s.refs, cert: s.cert })),
      kin: p.kin,
    }),
  ),
);

export const lineMembership = (() => {
  const j = new Map(lines.joseph.persons.map((s) => [s.id, s]));
  const m = new Map(lines.mary.persons.map((s) => [s.id, s]));
  return { joseph: j, mary: m };
})();

// ---------- тела карточек и стихи — по требованию ----------
const cardModules = import.meta.glob('../generated/cards/*.json');
const verseModules = import.meta.glob('../generated/verses/*.json');
const cardCache = new Map<string, Promise<Record<string, { card: Card; chrono: Chrono | null }>>>();
const verseCache = new Map<string, Promise<Record<string, string>>>();

export function loadCard(id: string): Promise<{ card: Card; chrono: Chrono | null } | null> {
  const p = byId.get(id);
  if (!p) return Promise.resolve(null);
  const key = `../generated/cards/${p.volume}.json`;
  if (!cardCache.has(key)) {
    const loader = cardModules[key];
    cardCache.set(key, loader ? loader().then((m) => (m as { default: never }).default) : Promise.resolve({}));
  }
  return cardCache.get(key)!.then((all) => all[id] ?? null);
}

export function loadVerses(bookCode: string): Promise<Record<string, string>> {
  const i = books.findIndex((b) => b.code === bookCode);
  const key = `../generated/verses/${String(i).padStart(2, '0')}.json`;
  if (!verseCache.has(key)) {
    const loader = verseModules[key];
    verseCache.set(key, loader ? loader().then((m) => (m as { default: { verses: Record<string, string> } }).default.verses) : Promise.resolve({}));
  }
  return verseCache.get(key)!;
}
