/**
 * Данные атласа во время работы: индекс неба (src/generated/atlas.json) разворачивается в удобные структуры;
 * тела карточек и тексты стихов подгружаются по требованию (по томам и по книгам).
 */
import raw from '../generated/atlas.json';
import type { Card, Chrono, Epoch, Group, Role, Sex, PersonKind, Cert } from './types.ts';
import type { Book } from '../engine/books.ts';
import type { ChronoModel, DateClass, Tension, WhenSpan } from '../engine/chronology.ts';
import { applyEpochDelta } from '../engine/epochs.ts';
import type { BlockInfo, LineStep, Outline, TrailKind } from '../engine/layout.ts';
import { TRAIL_KINDS } from '../engine/layout.ts';
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
  /** sync — синхронизмы текста «в N-й год X воцарился» (данные; MAP-47) */
  reign: { over: string; start: number; end: number; years: number | null; sync?: { with: string; year: number; refs: string[]; cert?: Cert; note?: string }[] }[];
  active: [number, number] | null;
  silent: number[];
}

export interface ChronoRow {
  b: number;
  /** интервал рождения (A14): у оценочных дат начало следа рисуется пунктиром на bLo…bHi */
  bLo: number;
  bHi: number;
  d: number | null;
  /** интервал смерти; null — о смерти данных нет (engine/chronology.ts, PersonChrono) */
  dLo: number | null;
  dHi: number | null;
  last: number | null;
  dEst: number;
  cls: DateClass;
  epoch: string | null;
  /** умер младенцем (A14): без следа, знак † */
  infant: boolean;
  /**
   * Народ или род (kind people, clan; CARD-59; решение 23): b — место в родословии, а не год рождения. Годов рождения
   * и жизни у него не показывают (engine/years.ts: shownYears → null), современников нет.
   */
  named?: boolean;
  /** Год оценён по порядку перечисления братьев и сестёр (MAP-54): помета «выв.» у года рождения. */
  byOrder?: boolean;
  /**
   * false — год смерти свой (явный год, допустимый интервал), не выведен из рождения по возрасту: округление оценки
   * рождения его не сдвигает (engine/years.ts, shownYears; CARD-79). undefined — смерть по возрасту или её нет.
   */
  dAge?: boolean;
  /**
   * Год знака у первого засвидетельствованного года (этап 7, круг 3; MAP-69; решение 38): у лица Нового Завета без
   * чисел текста с промежутком рождения шире 40 лет знак на небе стоит в этот год (призвание, суд, событие Деяний),
   * а промежуток рождения bLo…bHi — растушёванная полоса влево от знака (NodeRow.band). b — по-прежнему оценка рождения.
   */
  mark?: number;
  /**
   * У лица «время не установлено» (cls epochal; MAP-52): откуда скобка bLo…bHi — встреча с лицом id, годы брата
   * или сестры id, эпоха главы
   * первого упоминания ref, эпоха из данных, границы из данных или годы созвездия. b — середина скобки.
   */
  when?: WhenSpan;
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
  /** какой след рисуется (engine/layout.ts, TrailKind): life, people, infant, list, ghost, epochal; t1 = t0 — следа нет */
  trail: TrailKind;
  /**
   * Разрыв следа (MAP-51; решение 24): год (астр.), где кончается правдоподобная часть сплошного следа — рождение плюс
   * предел жизни эпохи. От brk до t1 — «//» и пунктир; отвод к ребёнку, рождённому после brk, — со знаком разрыва.
   * null — разрыва нет.
   */
  brk: number | null;
  /**
   * Знак у первого засвидетельствованного года (этап 7, круг 3; MAP-69; решение 38; ChronoRow.mark): t0 — этот год,
   * а не рождение. band — промежуток рождения [начало; конец ≤ t0] (астр.): растушёванная полоса влево от знака, без
   * острого знака в её середине; место в полосе под неё занято раскладкой. born — оценка рождения внутри полосы: отвод
   * от родителя приходит в этот год. null — знак в год рождения, как у всех.
   */
  band: [number, number] | null;
  born: number | null;
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
  /** контуры созвездий (E8): кольца в годах и полосах, места под название */
  outlines: Outline[];
  scale: { knots: number[]; xTrue: number[]; xDense: number[] };
  /**
   * Эпохи в годах этой модели (CARD-60; engine/epochs.ts): границы и события, заданные числами Писания (сотворение,
   * Потоп, рождение Аврама, приход Иакова в Египет), сдвигаются вместе с моделью.
   */
  epochs: Epoch[];
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
type RawChrono = [number, number, number, number | null, number | null, number, DateClass, string | null, (number | null)?, (number | null)?, number?, number?, (string | null)?, (number | null)?];
type RawNode = [number, number, number, number, number, number | null, number | null, number | null, number, number?, (number | null)?, number?, number?, number?];
type RawOutline = { g: string; p?: string; n: number; r: number[][]; s: [number, number, number, number][] };
interface RawAtlas {
  built: string;
  persons: Record<string, never>[];
  models: {
    id: string;
    chrono: (RawChrono | null)[];
    tensions: Tension[];
    epochs?: Record<string, [number, number, number[]]>;
    layout: { nodes: RawNode[]; blocks: BlockInfo[]; laneMin: number; laneMax: number; metrics: Record<string, number>; outlines?: RawOutline[] };
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

export const epochs = R.epochs as unknown as Epoch[];

type RawModel = RawAtlas['models'][number];
/** «m:avraam», «k:beera-syn-vaala», «r:Кол 4:14», «e», «b», «g» (tools/build-data.ts) → WhenSpan. */
function decodeWhen(s: string): WhenSpan {
  const by = ({ m: 'met', k: 'kin', r: 'mention', e: 'epoch', b: 'bounds', g: 'group' } as const)[s[0] as 'm' | 'k' | 'r' | 'e' | 'b' | 'g'] ?? 'epoch';
  const rest = s.length > 2 ? s.slice(2) : undefined;
  return by === 'met' || by === 'kin' ? { by, id: rest } : by === 'mention' ? { by, ref: rest } : { by };
}
function decodeModel(m: RawModel): ModelData {
  const chrono = new Map<string, ChronoRow>();
  const abs = (b: number, x: number | null) => (x === null ? null : b + x);
  m.chrono.forEach((r, i) => {
    if (!r) return;
    const b = r[0];
    const flags = r[11] ?? 0;
    chrono.set(persons[i].id, {
      b, bLo: b + r[1], bHi: b + r[2], d: abs(b, r[3]), dLo: abs(b, r[8] ?? null), dHi: abs(b, r[9] ?? null), last: abs(b, r[4]), dEst: b + r[5], cls: r[6], epoch: r[7], infant: r[10] === 1,
      ...(flags & 1 ? { named: true } : {}),
      ...(flags & 2 ? { byOrder: true } : {}),
      ...(flags & 4 ? { dAge: false } : {}),
      ...(r[12] ? { when: decodeWhen(r[12]) } : {}),
      ...(r[13] !== undefined && r[13] !== null ? { mark: b + r[13] } : {}),
    });
  });
  const idAt = (k: number | null) => (k === null ? null : persons[k].id);
  const nodes: NodeRow[] = m.layout.nodes.map((n) => {
    const ghost = n[0] < 0;
    const person = persons[ghost ? -n[0] - 1 : n[0]].id;
    const t0 = (chrono.get(person)?.b ?? 0) + n[2];
    return {
      id: ghost ? `ghost:${person}` : person, person, ghost, lane: n[1], t0, t1: t0 + n[3], block: n[4],
      parentLane: n[5], layoutParent: idAt(n[6]), satelliteOf: idAt(n[7]), spine: !!n[8], trail: TRAIL_KINDS[n[9] ?? 0],
      brk: n[10] === undefined || n[10] === null ? null : t0 + n[10],
      band: n[11] === undefined ? null : [t0 + n[11], t0 + n[12]!],
      born: n[13] === undefined ? null : t0 + n[13],
    };
  });
  // эпохи модели: в файле модели — только отличия от data/epochs.json (tools/build-data.ts, engine/epochs.ts)
  const modelEpochs = applyEpochDelta(epochs, m.epochs);
  // контуры: годы — десятыми, полосы — двадцатыми, вершины колец — разностями (tools/build-data.ts)
  const outlines: Outline[] = (m.layout.outlines ?? []).map((o) => ({
    group: o.g,
    ...(o.p ? { parent: o.p } : {}),
    size: o.n,
    rings: o.r.map((flat) => {
      const ring: [number, number][] = [];
      let t = 0;
      let l = 0;
      for (let k = 0; k + 1 < flat.length; k += 2) {
        t += flat[k];
        l += flat[k + 1];
        ring.push([t / 10, l / 20]);
      }
      return ring;
    }),
    slots: o.s.map(([l, h, t0, t1]) => ({ lane: l / 20, h, t0: t0 / 10, t1: t1 / 10 })),
  }));
  return {
    id: m.id, chrono, tensions: m.tensions, nodes, outlines, nodeByPerson: new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n])),
    blocks: m.layout.blocks, laneMin: m.layout.laneMin, laneMax: m.layout.laneMax, metrics: m.layout.metrics, scale: m.scale, epochs: modelEpochs,
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
/**
 * § 23 «Места Писания»: в скольких стихах лицо названо по имени (tools/build-data.ts).
 * scope 'bible' — счёт по всей Библии; 'chapters' — только в главах, на которые ссылается карточка
 * (имя носят и другие лица, народы или места).
 */
export interface Mentions {
  n: number;
  scope: 'bible' | 'chapters';
}
type CardEntry = { card: Card; chrono: Chrono | null; books: Record<string, number>; mentions?: Mentions };
const cardCache = new Map<string, Promise<Record<string, CardEntry>>>();
/** Загруженные тела карточек и хронологические входы: чтобы разделы, собранные после загрузки, читали их без ожидания. */
const cardsLoaded = new Map<string, Card>();
const chronoLoaded = new Map<string, Chrono | null>();
/** Сведения о счёте упоминаний — по объекту books лица (IdxPerson.books). */
export const mentionsOf = new WeakMap<Record<string, number>, Mentions>();

/** Тело карточки, если том уже загружен (loadCard); иначе null. */
export function loadedCard(id: string): Card | null {
  return cardsLoaded.get(id) ?? null;
}
/** Хронологические входы лица из данных (границы «не раньше», «не позже»), если том уже загружен; иначе null. */
export function loadedChrono(id: string): Chrono | null {
  return chronoLoaded.get(id) ?? null;
}
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
              cardsLoaded.set(pid, e.card);
              chronoLoaded.set(pid, e.chrono);
              if (!ip) continue;
              ip.books = e.books ?? {};
              if (e.mentions) mentionsOf.set(ip.books, e.mentions);
            }
            return all;
          })
          // том не загрузился (сеть): отказ не остаётся в кэше, «Повторить» загрузит его заново
          .catch((e) => {
            cardCache.delete(key);
            throw e;
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
