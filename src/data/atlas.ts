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
  spouses: { id: string; kind: string; refs: string[]; cert: Cert; note?: string }[];
  kin: { id: string; rel: string; refs: string[]; cert: Cert }[];
  order: number | null;
  alt: string[];
  books: Record<string, number>;
  epoch: string | null;
  reign: { over: string; start: number; end: number; years: number | null }[];
  active: [number, number] | null;
  silent: number[];
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

// годы — разностями от рождения; лица — номерами в индексе (tools/build-data.ts)
type RawChrono = [number, number, number, number | null, number | null, number, DateClass, string | null];
type RawNode = [number, number, number, number, number, number | null, number | null, number | null, number];
interface RawAtlas {
  built: string;
  persons: Record<string, never>[];
  models: {
    id: string;
    chrono: (RawChrono | null)[];
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

// в индексе опущены значения по умолчанию (tools/build-data.ts, DEFAULTS)
export const persons: IdxPerson[] = R.persons.map((p) => ({
  id: p.id,
  name: p.n,
  disambig: p.d ?? '',
  sex: p.s,
  kind: p.k ?? 'person',
  unnamed: !!p.u,
  group: p.g,
  prominence: p.pr,
  magnitude: p.mg,
  roles: p.r ?? [],
  volume: p.v,
  father: p.f ?? null,
  mother: p.m ?? null,
  fatherKind: p.fk ?? 'natural',
  fatherGap: !!p.fg,
  parentCert: p.pc ?? 'scripture',
  motherCert: p.mc ?? p.pc ?? 'scripture',
  parentRefs: p.pRefs ?? [],
  otherParents: p.op ?? [],
  spouses: p.sp ?? [],
  kin: p.kin ?? [],
  order: p.ord ?? null,
  alt: p.alt ?? [],
  books: {}, // заполняется при загрузке тома карточек (§ 23)
  epoch: p.ep ?? null,
  reign: p.reign ?? [],
  active: p.active ?? null,
  silent: p.silent ?? [],
}));
export const byId = new Map(persons.map((p) => [p.id, p]));

type RawModel = RawAtlas['models'][number];
function decodeModel(m: RawModel): ModelData {
  const chrono = new Map<string, ChronoRow>();
  const abs = (b: number, x: number | null) => (x === null ? null : b + x);
  m.chrono.forEach((r, i) => {
    if (!r) return;
    const b = r[0];
    chrono.set(persons[i].id, { b, bLo: b + r[1], bHi: b + r[2], d: abs(b, r[3]), last: abs(b, r[4]), dEst: b + r[5], cls: r[6], epoch: r[7] });
  });
  const idAt = (k: number | null) => (k === null ? null : persons[k].id);
  const nodes: NodeRow[] = m.layout.nodes.map((n) => {
    const ghost = n[0] < 0;
    const person = persons[ghost ? -n[0] - 1 : n[0]].id;
    const t0 = (chrono.get(person)?.b ?? 0) + n[2];
    return {
      id: ghost ? `ghost:${person}` : person, person, ghost, lane: n[1], t0, t1: t0 + n[3], block: n[4],
      parentLane: n[5], layoutParent: idAt(n[6]), satelliteOf: idAt(n[7]), spine: !!n[8],
    };
  });
  return {
    id: m.id, chrono, tensions: m.tensions, nodes, nodeByPerson: new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n])),
    blocks: m.layout.blocks, laneMin: m.layout.laneMin, laneMax: m.layout.laneMax, metrics: m.layout.metrics, scale: m.scale,
  };
}

/** Рассчитанные модели хронологии. В индексе — только модель по умолчанию; остальные — loadModel(). */
export const models: ModelData[] = R.models.map(decodeModel);
const modelModules = import.meta.glob('../generated/models/*.json');
const modelLoads = new Map<string, Promise<ModelData | null>>();
export function loadModel(id: string): Promise<ModelData | null> {
  const have = models.find((m) => m.id === id);
  if (have) return Promise.resolve(have);
  let pr = modelLoads.get(id);
  if (!pr) {
    const mod = modelModules[`../generated/models/${id}.json`];
    pr = mod
      ? mod().then((x) => {
          const md = decodeModel(((x as { default?: RawModel }).default ?? x) as RawModel);
          if (!models.some((m) => m.id === md.id)) models.push(md);
          return md;
        })
      : Promise.resolve(null);
    modelLoads.set(id, pr);
  }
  return pr;
}

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
      spouses: p.spouses.map((s) => ({ id: s.id, kind: s.kind as never, refs: s.refs, cert: s.cert, note: s.note })),
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
type CardEntry = { card: Card; chrono: Chrono | null; books: Record<string, number> };
const cardCache = new Map<string, Promise<Record<string, CardEntry>>>();
const verseCache = new Map<string, Promise<Record<string, string>>>();

export function loadCard(id: string): Promise<{ card: Card; chrono: Chrono | null } | null> {
  const p = byId.get(id);
  if (!p) return Promise.resolve(null);
  const key = `../generated/cards/${p.volume}.json`;
  if (!cardCache.has(key)) {
    const loader = cardModules[key];
    cardCache.set(
      key,
      loader
        ? loader().then((m) => {
            const all = (m as { default: Record<string, CardEntry> }).default;
            for (const [pid, e] of Object.entries(all)) {
              const ip = byId.get(pid);
              if (ip) ip.books = e.books ?? {};
            }
            return all;
          })
        : Promise.resolve({}),
    );
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
