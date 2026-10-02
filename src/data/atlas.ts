/**
 * Данные атласа во время работы: индекс неба (src/generated/atlas.json) разворачивается в удобные структуры;
 * тела карточек и тексты стихов подгружаются по требованию (по томам и по книгам).
 */
import raw from '../generated/atlas.json';
import type { Card, Chrono, Epoch, Group, Role, Sex, PersonKind, Cert } from './types.ts';
import type { Book } from '../engine/books.ts';
import type { ChronoModelId, DateClass, ModelInfo, Tension, WhenSpan, YearBasis, BasisKind } from '../engine/chronology.ts';
import type { LifeDates } from '../engine/years.ts';
import { applyEpochDelta } from '../engine/epochs.ts';
import type { BlockInfo, ClusterInfo, LineStep, Outline, TrailKind } from '../engine/layout.ts';
import { TRAIL_KINDS } from '../engine/layout.ts';
import type { Stay } from '../engine/stays.ts';
import { unionId } from '../engine/unions.ts';
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
  /** Пропуск поколений и у матери (Мф 1:5; этап 13, решение 101). */
  motherGap: boolean;
  /**
   * sync — синхронизмы текста «в N-й год X воцарился» (данные; MAP-47); sole — начало единоличного царствования,
   * если start — начало соправления (этап 13, решение 103).
   */
  reign: { over: string; start: number; end: number; years: number | null; sole?: number; sync?: { with: string; year: number; refs: string[]; cert?: Cert; note?: string }[] }[];
  active: [number, number] | null;
  silent: number[];
  /**
   * Годы лица в других моделях хронологии — только там, где показанные годы не такие, как в модели по умолчанию
   * (этап 13, решения 96, 102): «в „Кратком пребывании“ — 1951». Пустой объект — годы одинаковы во всех моделях:
   * строки о модели в колофоне и § 13 нет, пояснение «расч.» говорит «одинаково во всех моделях». Годы модели
   * по умолчанию — models[0].chrono (всегда в индексе). Годы — астрономические, как в ChronoRow.
   */
  modelDep: Partial<Record<ChronoModelId, LifeDates>>;
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
  // ---------- этап 13, контракт 1 (T3); basis, lifeEpoch и birthEpoch в сборке есть всегда (необязательны только для
  // строк, собранных руками в тестах) ----------
  /** Основание года (решения 96, 100): § 13 «Откуда годы», пояснение «расч.» (engine/years.ts, markTitle). */
  basis?: YearBasis;
  /**
   * Эпоха жизни (решение 98): служение или царствование → события с годом → поле epoch данных → год рождения.
   * Одна для паспорта, мини-шкалы, диктора и § 13 («Эпоха»). id эпохи; null — эпох нет.
   */
  lifeEpoch?: string | null;
  /** Эпоха года рождения в этой модели (решение 98): называется «эпохой рождения» только в § 8 и § 13. */
  birthEpoch?: string | null;
  /**
   * Год по числам, но приблизительный по данным (явный год с пометой «толкование»): рождения — Рождество, «ок. 5 г.
   * до Р. Х.»; смерти — Распятие, «ок. 30 г. по Р. Х.», судьи «по хронологии, принятой в атласе».
   */
  bApprox?: boolean;
  dApprox?: boolean;
  /** Оценка рождения стоит на границе текста: 'hi' — «не позже 1876» (Кааф, Быт 46:11), 'lo' — «не раньше». */
  pin?: 'lo' | 'hi';
  /** Свой год смерти закреплён явным годом или числами текста — не оценка (Иоав убит в 970 г.; engine/years.ts). */
  dFixed?: boolean;
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
  /**
   * «Отчий дом» (этап 15, решение 173; src/engine/stays.ts): lane — полоса жизни, starLane — полоса рождения, stays —
   * пребывания по порядку (между соседними — переход). Нет полей — лицо всю жизнь в полосе lane. Полосу в год t —
   * только через laneAt (engine/stays.ts).
   */
  starLane?: number;
  stays?: Stay[];
  /**
   * Жена в доме мужа с рождения (решение 173, Д7): год прихода в дом мужа. Доля следа до него — бледно; черты и отводы
   * через неё — не пересечение с живым членом дома.
   */
  wed?: number;
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
  /** Годы черт брака (решение 173; engine/house.ts): id союза → год (астр.). Читать через unionYear (engine/stays.ts). */
  unionYears: Map<string, number>;
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
type RawChrono = [number, number, number, number | null, number | null, number, DateClass, string | number | null, (number | null)?, (number | null)?, number?, number?, (string | null)?, (number | null)?];
type RawNode = [number, number, number, number, number, number | null, number | null, number | null, number, number?, (number | null)?, number?, number?, number?];
type RawOutline = { g: string; p?: string; n: number; r: number[][]; s: [number, number, number, number][] };
interface RawAtlas {
  built: string;
  persons: Record<string, never>[];
  models: {
    id: string;
    chrono: (RawChrono | null)[];
    tensions: Tension[];
    epochs?: Record<string, [number, number, number[], string?]>;
    /**
     * Этап 13 (контракт 1): по номеру лица — эпоха рождения (номер в data/epochs.json), эпоха жизни (−1 — та же, что
     * эпоха рождения), основание года (строка, decodeBasis).
     */
    ext?: { be: (number | null)[]; le: (number | null)[]; bs: (string | null)[] };
    /**
     * st — пребывания (решение 173): [лицо, полоса рождения, затем на каждый переход начало − b, конец − b, полоса
     * прихода]; uy — годы черт брака [муж, жена, год]; wd — приход жены, живущей у мужа с рождения, [лицо, год − b]
     * (tools/build-data.ts; engine/stays.ts).
     */
    layout: { nodes: RawNode[]; blocks: RawBlock[]; laneMin: number; laneMax: number; metrics: Record<string, number>; outlines?: RawOutline[]; st?: number[][]; uy?: [number, number, number][]; wd?: [number, number][] };
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

/**
 * Годы в других моделях (IdxPerson.modelDep): в индексе — id модели → сдвиг k относительно модели по умолчанию (все годы
 * те же, сдвинутые на k лет) или [b, bLo − b, bHi − b, d − b | null, класс, признаки, dLo − b, dHi − b]
 * (tools/build-data.ts, encodeModelDep). Раскрывается после разбора модели по умолчанию (ниже, fillModelDep).
 * До сборки этапа 13 поля нет — пустой объект.
 */
type RawDep = number | [number, number, number, number | null, DateClass, number?, (number | null)?, (number | null)?];
function decodeDepRow(r: Exclude<RawDep, number>): LifeDates {
  const b = r[0];
  const f = r[5] ?? 0;
  const rel = (x: number | null | undefined) => (x === null || x === undefined ? null : b + x);
  return {
    b, bLo: b + r[1], bHi: b + r[2], d: rel(r[3]), cls: r[4],
    ...(f & 1 ? { dAge: false } : r[3] !== null ? { dAge: true } : {}),
    ...(f & 2 ? { bApprox: true } : {}),
    ...(f & 4 ? { dApprox: true } : {}),
    ...(f & 8 ? { pin: 'lo' as const } : f & 16 ? { pin: 'hi' as const } : {}),
    ...(f & 32 ? { dFixed: true } : f & 1 ? { dFixed: false, dLo: rel(r[6]), dHi: rel(r[7]) } : {}),
  };
}

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
  motherGap: !!p.mgap,
  reign: p.reign ?? [],
  active: p.active ?? null,
  silent: p.silent ?? [],
  modelDep: {},
}));
const rawDep = new Map<string, Record<string, RawDep>>();
/** Модели после модели по умолчанию — порядок элементов md в индексе (tools/build-data.ts, encodeModelDep). */
const depModels = ((R as { modelInfo?: { id: string }[] }).modelInfo ?? []).slice(1).map((m) => m.id);
R.persons.forEach((p, i) => {
  const md = (p as Record<string, unknown>).md as Record<string, RawDep> | (RawDep | null)[] | undefined;
  if (!md) return;
  if (!Array.isArray(md)) rawDep.set(persons[i].id, md);
  else {
    const o: Record<string, RawDep> = {};
    md.forEach((r, k) => {
      if (r !== null && depModels[k]) o[depModels[k]] = r;
    });
    rawDep.set(persons[i].id, o);
  }
});
export const byId = new Map(persons.map((p) => [p.id, p]));

export const epochs = R.epochs as unknown as Epoch[];

type RawModel = RawAtlas['models'][number];
/**
 * Основание года (ChronoRow.basis). В сборке этапа 13 — строка «вид|id,id|вверх,вниз|ссылка|опора» (tools/build-data.ts,
 * encodeBasis); в прежней сборке поля нет — основание выводится из класса даты (заглушка контракта 1).
 */
const BASIS_KINDS: BasisKind[] = ['numbers', 'reign', 'year', 'kin', 'order', 'active', 'met', 'mention', 'epoch', 'bounds', 'group', 'interp', 'people'];
function decodeBasis(s: string | null | undefined, row: { cls: DateClass; byOrder?: boolean; named?: boolean; when?: WhenSpan }): YearBasis {
  if (s) {
    const [k, ids, gens, ref, anchor] = s.split('|');
    return {
      kind: BASIS_KINDS[Number(k)] ?? 'kin',
      ...(ids ? { ids: ids.split(',').map((i) => persons[Number(i)]?.id ?? i) } : {}),
      ...(gens ? { gens: gens.split(',').map(Number) as [number, number] } : {}),
      ...(ref ? { ref } : {}),
      ...(anchor ? { anchor } : {}),
    };
  }
  // заглушка: по классу даты
  if (row.named) return { kind: 'people' };
  if (row.cls === 'exact') return { kind: 'numbers' };
  if (row.cls === 'calculated') return { kind: 'reign' };
  if (row.cls === 'epochal') {
    const w = row.when;
    if (w?.by === 'met') return { kind: 'met', ...(w.id ? { ids: [w.id] } : {}) };
    if (w?.by === 'kin') return { kind: 'kin', ...(w.id ? { ids: [w.id] } : {}) };
    if (w?.by === 'mention') return { kind: 'mention', ...(w.ref ? { ref: w.ref } : {}) };
    return { kind: w?.by === 'bounds' ? 'bounds' : w?.by === 'group' ? 'group' : 'epoch' };
  }
  return { kind: row.byOrder ? 'order' : 'kin' };
}

/** «m:avraam», «k:beera-syn-vaala», «r:Кол 4:14», «e», «b», «g» (tools/build-data.ts) → WhenSpan. */
function decodeWhen(s: string): WhenSpan {
  const by = ({ m: 'met', k: 'kin', r: 'mention', e: 'epoch', b: 'bounds', g: 'group' } as const)[s[0] as 'm' | 'k' | 'r' | 'e' | 'b' | 'g'] ?? 'epoch';
  const rest = s.length > 2 ? s.slice(2) : undefined;
  return by === 'met' || by === 'kin' ? { by, id: rest } : by === 'mention' ? { by, ref: rest } : { by };
}
/** Блок раскладки: массив сборки этапа 13 (tools/build-data.ts; лица — номерами в индексе) или объект прежней сборки. */
type RawBlock = BlockInfo | [number, number | string, string, number | string | null, number | string | null, 1 | -1 | 0, number, number, number, number, number, RawCluster?];
type RawCluster = Omit<ClusterInfo, 'members' | 'cells'> & { members: (number | string)[]; cells: [number | string, number, number, 1?][] };
function decodeBlock(b: RawBlock): BlockInfo {
  if (!Array.isArray(b)) return b;
  const who = (x: number | string | null) => (x === null ? null : typeof x === 'number' ? persons[x]?.id ?? String(x) : x);
  const [id, root, group, attach, near, side, laneMin, laneMax, t0, t1, size, cl] = b;
  return {
    id, root: who(root)!, group, attach: who(attach), ...(near !== null ? { near: who(near)! } : {}), side, laneMin, laneMax, t0, t1, size,
    ...(cl
      ? {
          cluster: {
            ...cl,
            members: cl.members.map((x) => who(x)!),
            cells: cl.cells.map(([x, row, col, pat]) => ({ id: who(x)!, row, col, ...(pat ? { patronym: true } : {}) })),
          },
        }
      : {}),
  };
}
function decodeModel(m: RawModel): ModelData {
  const chrono = new Map<string, ChronoRow>();
  const abs = (b: number, x: number | null) => (x === null ? null : b + x);
  // этап 13 (контракт 1): эпохи жизни и рождения — номерами в data/epochs.json, основание, стих последнего упоминания —
  // параллельными массивами модели (tools/build-data.ts); в прежней сборке их нет — заглушки
  const ext = m.ext;
  const epochId = (k: number | null | undefined) => (k === null || k === undefined ? null : epochs[k]?.id ?? null);
  m.chrono.forEach((r, i) => {
    if (!r) return;
    const b = r[0];
    const flags = r[11] ?? 0;
    const row = {
      b, bLo: b + r[1], bHi: b + r[2], d: abs(b, r[3]), dLo: abs(b, r[8] ?? null), dHi: abs(b, r[9] ?? null), last: abs(b, r[4]), dEst: b + r[5], cls: r[6], epoch: typeof r[7] === 'number' ? epochId(r[7]) : r[7], infant: r[10] === 1,
      ...(flags & 1 ? { named: true } : {}),
      ...(flags & 2 ? { byOrder: true } : {}),
      ...(flags & 4 ? { dAge: false } : {}),
      ...(flags & 8 ? { bApprox: true } : {}),
      ...(flags & 64 ? { dApprox: true } : {}),
      ...(flags & 128 ? { dFixed: true } : {}),
      ...(flags & 16 ? { pin: 'lo' as const } : flags & 32 ? { pin: 'hi' as const } : {}),
      ...(r[12] ? { when: decodeWhen(r[12]) } : {}),
      ...(r[13] !== undefined && r[13] !== null ? { mark: b + r[13] } : {}),
    };
    // −1 — та же, что эпоха строки (tools/build-data.ts)
    const birthEpoch = ext ? (ext.be[i] === -1 ? row.epoch : epochId(ext.be[i])) : row.epoch;
    const lifeEpoch = ext ? (ext.le[i] === -1 ? birthEpoch : epochId(ext.le[i])) : null;
    chrono.set(persons[i].id, {
      ...row,
      basis: decodeBasis(ext?.bs[i], row),
      birthEpoch,
      lifeEpoch,
    });
  });
  const idAt = (k: number | null) => (k === null ? null : persons[k].id);
  const nodes: NodeRow[] = m.layout.nodes.map((n) => {
    const ghost = n[0] < 0;
    const person = persons[ghost ? -n[0] - 1 : n[0]].id;
    const t0 = (chrono.get(person)?.b ?? 0) + n[2];
    // призрак бездетного брака у мужа (решение 173; engine/house.ts, ghostId) — «ghost:<лицо>@<муж>»
    const sat = idAt(n[7]);
    return {
      id: ghost ? (sat ? `ghost:${person}@${sat}` : `ghost:${person}`) : person, person, ghost, lane: n[1], t0, t1: t0 + n[3], block: n[4],
      parentLane: n[5], layoutParent: idAt(n[6]), satelliteOf: idAt(n[7]), spine: !!n[8], trail: TRAIL_KINDS[n[9] ?? 0],
      brk: n[10] === undefined || n[10] === null ? null : t0 + n[10],
      band: n[11] === undefined ? null : [t0 + n[11], t0 + n[12]!],
      born: n[13] === undefined ? null : t0 + n[13],
    };
  });
  // «Отчий дом» (решение 173): пребывания лиц с переходом; первое — с рождения, последнее — до конца следа
  const nodeOf = new Map(nodes.filter((n) => !n.ghost).map((n) => [n.person, n]));
  for (const r of m.layout.st ?? []) {
    const person = persons[r[0]].id;
    const n = nodeOf.get(person);
    if (!n) continue;
    const b = chrono.get(person)?.b ?? n.t0;
    const stays: Stay[] = [{ lane: r[1], t0: b, t1: b }];
    for (let k = 2; k + 2 < r.length; k += 3) {
      stays[stays.length - 1].t1 = b + r[k];
      stays.push({ lane: r[k + 2], t0: b + r[k + 1], t1: b + r[k + 1] });
    }
    const last = stays[stays.length - 1];
    last.t1 = Math.max(n.t1, last.t0);
    n.starLane = r[1];
    n.stays = stays;
  }
  for (const [k, d] of m.layout.wd ?? []) {
    const n = nodeOf.get(persons[k].id);
    if (n) n.wed = (chrono.get(n.person)?.b ?? n.t0) + d;
  }
  const unionYears = new Map<string, number>((m.layout.uy ?? []).map(([a, w, t]) => [unionId(persons[a].id, persons[w].id), t]));
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
    blocks: m.layout.blocks.map(decodeBlock), laneMin: m.layout.laneMin, laneMax: m.layout.laneMax, metrics: m.layout.metrics, scale: m.scale, epochs: modelEpochs,
    unionYears,
  };
}

/** Рассчитанные модели хронологии. В индексе — только модель по умолчанию; остальные — loadModel(). */
export const models: ModelData[] = R.models.map(decodeModel);
/** IdxPerson.modelDep из индекса: сдвиг раскрывается от годов модели по умолчанию. */
(function fillModelDep() {
  const base = models[0]?.chrono;
  for (const [id, md] of rawDep) {
    const p = byId.get(id);
    const c0 = base?.get(id);
    if (!p) continue;
    for (const [k, r] of Object.entries(md)) {
      if (typeof r !== 'number') p.modelDep[k as ChronoModelId] = decodeDepRow(r);
      else if (c0) {
        const sh = (x: number | null | undefined) => (x === null || x === undefined ? x : x + r);
        p.modelDep[k as ChronoModelId] = {
          b: c0.b + r, bLo: c0.bLo + r, bHi: c0.bHi + r, d: c0.d === null ? null : c0.d + r, cls: c0.cls,
          ...(c0.named ? { named: true } : {}),
          ...(c0.dAge !== undefined ? { dAge: c0.dAge } : c0.d !== null ? { dAge: true } : {}),
          ...(c0.bApprox ? { bApprox: true } : {}),
          ...(c0.dApprox ? { dApprox: true } : {}),
          ...(c0.pin ? { pin: c0.pin } : {}),
          ...(c0.dFixed !== undefined ? { dFixed: c0.dFixed } : {}),
          ...(c0.dLo !== null ? { dLo: sh(c0.dLo) as number } : {}),
          ...(c0.dHi !== null ? { dHi: sh(c0.dHi) as number } : {}),
        };
      }
    }
  }
})();
const modelModules = import.meta.glob('../generated/models/*.json');
/**
 * Загрузка чанка данных с повтором после отказа сети (решение 127). Браузер помнит неудачный import() того же адреса
 * (карта модулей, whatwg/html#6768), поэтому повтор идёт по адресу с меткой попытки («?retry=1»). Адрес чанка — из текста
 * загрузчика import.meta.glob («import("./00-….js")»). В однофайловой сборке (build:single) чанки встроены: там отказа
 * сети нет, а если адреса в тексте загрузчика нет — повтор вызывает тот же загрузчик.
 */
const attempts = new Map<string, number>();
function loadChunk(key: string, loader: () => Promise<unknown>): Promise<unknown> {
  const n = attempts.get(key) ?? 0;
  let run = loader;
  if (n > 0) {
    const m = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(String(loader));
    if (m) {
      const url = new URL(m[1], import.meta.url);
      url.searchParams.set('retry', String(n));
      run = () => import(/* @vite-ignore */ url.href);
    }
  }
  return run().catch((e) => {
    attempts.set(key, n + 1);
    throw e;
  });
}
const modelLoads = new Map<string, Promise<ModelData | null>>();
export function loadModel(id: string): Promise<ModelData | null> {
  const have = models.find((m) => m.id === id);
  if (have) return Promise.resolve(have);
  let pr = modelLoads.get(id);
  if (!pr) {
    const mod = modelModules[`../generated/models/${id}.json`];
    pr = mod
      ? loadChunk(`model:${id}`, mod).then((x) => {
          const md = decodeModel(((x as { default?: RawModel }).default ?? x) as RawModel);
          if (!models.some((m) => m.id === md.id)) models.push(md);
          return md;
        })
          // модель не загрузилась (сеть): отказ не остаётся в кэше, повтор загрузит её заново (решение 127)
          .catch((e) => {
            modelLoads.delete(id);
            throw e;
          })
      : Promise.resolve(null);
    modelLoads.set(id, pr);
  }
  return pr;
}

/**
 * Модели хронологии со сводкой (решение 102): название, краткое название, входные числа, сколько лиц сдвинуто,
 * годы опорных событий, число напряжений, сдвиги после Исхода. Первая — модель по умолчанию. В прежней сборке сводки
 * нет — заглушка из годов модели по умолчанию.
 */
export const modelInfo: ModelInfo[] = (R.modelInfo as Partial<ModelInfo>[]).map((m, i) => ({
  id: m.id!,
  name: m.name!,
  short: m.short ?? m.name!,
  description: m.description ?? '',
  shifted: m.shifted ?? 0,
  events: m.events ?? [],
  tensions: m.tensions ?? (i === 0 ? models[0]?.tensions.length ?? 0 : 0),
  // лица — номерами в индексе (tools/build-data.ts); в прежней сборке — id
  afterExodus: (m.afterExodus ?? []).map((a) => ({ ...a, ids: (a.ids as (string | number)[]).map((x) => (typeof x === 'number' ? persons[x]?.id ?? String(x) : x)) })),
}));
/** Сводка модели по id; неизвестный id — модель по умолчанию. */
export const modelInfoOf = (id: string): ModelInfo => modelInfo.find((m) => m.id === id) ?? modelInfo[0];
/** Годы лица меняются между моделями хронологии (решение 96: строка о модели — только у таких лиц). */
export const modelDependent = (id: string): boolean => {
  const p = byId.get(id);
  return !!p && Object.keys(p.modelDep).length > 0;
};
export const lines = R.lines as unknown as { joseph: LineFile; mary: LineFile };
export const groups = R.groups as unknown as Group[];
export const groupById = new Map(groups.map((g) => [g.id, g]));
export const books = R.books as unknown as Book[];
/**
 * Внебиблейские опоры (П-6). derived — годы, выведенные из опоры по числам текста (этап 13): «два года под стражей до
 * Феста — с ок. 57 г.» (Деян 24:27). layer 'reference' — справочный слой (Откровение ок. 95 г. — по преданию).
 */
export const anchors = (R.anchors as unknown as { anchors: { id: string; event: string; value: number; verse: string; source: string; alternatives: string[]; derived?: { year: number; text: string }[]; layer?: string }[] }).anchors;
export const volumes = R.volumes as unknown as { volume: string; title: string; scope: string; count: number }[];
export const builtAt = R.built;
/**
 * Текст, по которому сверены ссылки (решение 132; «О карте»): name — перевод и состав, source — откуда взят файл,
 * changes — что в нём изменено против источника, sha256 — контрольная сумма tools/bible/synodal.tsv, verses — стихов
 * в файле, cited — стихов в сборке. В прежней сборке поля нет — null.
 */
export interface BibleTextInfo {
  name: string;
  source: string;
  changes: string;
  sha256: string;
  verses: number;
  cited: number;
}
export const bibleText: BibleTextInfo | null = ((R as { bibleText?: BibleTextInfo }).bibleText ?? null);

/** Граф для калькулятора родства и вычисляемых разделов карточки. */
export const graph: Graph = buildGraph(
  persons.map(
    (p): Person => ({
      id: p.id, name: p.name, sex: p.sex, group: p.group, prominence: p.prominence as Person['prominence'],
      father: p.father, mother: p.mother, parentRefs: p.parentRefs, parentCert: p.parentCert, motherCert: p.motherCert, order: p.order ?? undefined,
      fatherKind: p.fatherKind === 'legal' ? 'legal' : undefined, fatherGap: p.fatherGap, motherGap: p.motherGap,
      otherParents: p.otherParents.map((o) => ({ id: o.id, role: o.role, kind: o.kind as never, refs: o.refs, cert: o.cert })),
      spouses: p.spouses.map((s) => ({ id: s.id, kind: s.kind as never, refs: s.refs, cert: s.cert, note: s.note })),
      kin: p.kin,
      // роли — для союзов (engine/unions.ts: мать царя без связи супругов, решение 174)
      ...(p.roles.length ? { roles: p.roles } : {}),
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
  /** Народ или род: подпись § 23 — «имя народа или земли названо в N стихах» (этап 13, решение 108). */
  people?: boolean;
}
type CardEntry = { card: Card; chrono: Chrono | null; books: Record<string, number>; mentions?: Mentions; lastRef?: string };
const cardCache = new Map<string, Promise<Record<string, CardEntry>>>();
/** Загруженные тела карточек и хронологические входы: чтобы разделы, собранные после загрузки, читали их без ожидания. */
const cardsLoaded = new Map<string, Card>();
const chronoLoaded = new Map<string, Chrono | null>();
const lastRefLoaded = new Map<string, string>();
/** Сведения о счёте упоминаний — по объекту books лица (IdxPerson.books). */
export const mentionsOf = new WeakMap<Record<string, number>, Mentions>();

/** Тело карточки, если том уже загружен (loadCard); иначе null. */
export function loadedCard(id: string): Card | null {
  return cardsLoaded.get(id) ?? null;
}
/**
 * Стих последнего засвидетельствованного события лица, о смерти которого Писание молчит (ChronoRow.last; этап 13,
 * решение 96): «последнее упоминание — 30 г. по Р. Х. (Деян 1:14)». Есть, когда том карточек загружен (loadCard); иначе null.
 */
export function loadedLastRef(id: string): string | null {
  return lastRefLoaded.get(id) ?? null;
}
/** Хронологические входы лица из данных (границы «не раньше», «не позже»), если том уже загружен; иначе null. */
export function loadedChrono(id: string): Chrono | null {
  return chronoLoaded.get(id) ?? null;
}

export function loadCard(id: string): Promise<{ card: Card; chrono: Chrono | null } | null> {
  const p = byId.get(id);
  if (!p) return Promise.resolve(null);
  const key = `../generated/cards/${p.volume}.json`;
  if (!cardCache.has(key)) {
    const loader = cardModules[key];
    cardCache.set(
      key,
      loader
        ? loadChunk(key, loader).then((m) => {
            const all = (m as { default: Record<string, CardEntry> }).default;
            for (const [pid, e] of Object.entries(all)) {
              const ip = byId.get(pid);
              cardsLoaded.set(pid, e.card);
              chronoLoaded.set(pid, e.chrono);
              if (e.lastRef) lastRefLoaded.set(pid, e.lastRef);
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

/** Стихи книги из сборки и длины её глав (число стихов в каждой главе по синодальной нумерации). */
interface BookVerses {
  verses: Record<string, string>;
  chapters: number[];
}
const verseCache = new Map<string, Promise<BookVerses>>();
function loadBook(bookCode: string): Promise<BookVerses> {
  const i = books.findIndex((b) => b.code === bookCode);
  const key = `../generated/verses/${String(i).padStart(2, '0')}.json`;
  let pr = verseCache.get(key);
  if (!pr) {
    const loader = verseModules[key];
    pr = loader
      ? loadChunk(key, loader)
          .then((m) => {
            const d = (m as { default: { verses: Record<string, string>; chapters?: number[] } }).default;
            return { verses: d.verses, chapters: d.chapters ?? [] };
          })
          // книга не загрузилась (сеть): отказ не остаётся в кэше, повтор загрузит её заново (решение 127)
          .catch((e) => {
            verseCache.delete(key);
            throw e;
          })
      : Promise.resolve({ verses: {}, chapters: [] });
    verseCache.set(key, pr);
  }
  return pr;
}

/** Процитированные стихи книги: «глава:стих» → текст. Отказ загрузки — отклонённое обещание (не пустой ответ). */
export function loadVerses(bookCode: string): Promise<Record<string, string>> {
  return loadBook(bookCode).then((b) => b.verses);
}

/** Длины глав книги: chapters[ch − 1] — число стихов главы ch (решение 129). */
export function loadChapterLengths(bookCode: string): Promise<number[]> {
  return loadBook(bookCode).then((b) => b.chapters);
}

/** Стихи ссылки для вклейки (решение 129). */
export interface RefVerses {
  /** Стихи по порядку: n — «глава:стих» (у межглавной ссылки глава нужна), t — текст. */
  verses: { n: string; t: string }[];
  /** Сколько стихов в ссылке всего. */
  total: number;
  /** Сколько из них нет в сборке: на экране — «не включены N стихов», а не бесконечное многоточие. */
  missing: number;
}

/**
 * Развёрнутая ссылка по длинам глав: «Быт 5:3», «Быт 5:3-5,7», межглавный диапазон «Быт 27:41-28:5» и «Мф 5:1-7:29»
 * (без предела числа глав). null — ссылка не разбирается.
 */
export function expandRef(ref: string, chapterLength: (ch: number) => number): { book: string; keys: [number, number][] } | null {
  const m = /^\s*([1-4]?[А-Яа-яЁё]+)\s+(\d+)(?::(.+))?\s*$/.exec(ref.replace(/[–—]/g, '-'));
  if (!m || !books.some((b) => b.code === m[1])) return null;
  const book = m[1];
  const ch = Number(m[2]);
  const keys: [number, number][] = [];
  if (!m[3]) {
    for (let v = 1; v <= chapterLength(ch); v++) keys.push([ch, v]);
    return keys.length ? { book, keys } : null;
  }
  for (const part of m[3].split(',').map((x) => x.trim())) {
    let mm: RegExpExecArray | null;
    if ((mm = /^(\d+)$/.exec(part))) keys.push([ch, Number(mm[1])]);
    else if ((mm = /^(\d+)-(\d+)$/.exec(part))) {
      const a = Number(mm[1]);
      const b = Number(mm[2]);
      if (b < a) return null;
      for (let v = a; v <= b; v++) keys.push([ch, v]);
    } else if ((mm = /^(\d+)-(\d+):(\d+)$/.exec(part))) {
      const a = Number(mm[1]);
      const c2 = Number(mm[2]);
      const b = Number(mm[3]);
      if (c2 <= ch || !chapterLength(ch)) return null;
      for (let c = ch; c <= c2; c++) for (let v = c === ch ? a : 1; v <= (c === c2 ? b : chapterLength(c)); v++) keys.push([c, v]);
    } else return null;
  }
  return { book, keys };
}

/**
 * Стихи ссылки из сборки, с длинами глав её книги (решение 129). null — ссылка не разбирается; отказ загрузки —
 * отклонённое обещание, чтобы интерфейс отличал «не удалось загрузить — повторить» от «нет в сборке» (решение 127).
 */
export async function loadRefVerses(ref: string): Promise<RefVerses | null> {
  const book = /^\s*([1-4]?[А-Яа-яЁё]+)\s/.exec(ref)?.[1];
  if (!book || !books.some((b) => b.code === book)) return null;
  const b = await loadBook(book);
  const x = expandRef(ref, (ch) => b.chapters[ch - 1] ?? 0);
  if (!x) return null;
  const verses: { n: string; t: string }[] = [];
  for (const [c, v] of x.keys) {
    const t = b.verses[`${c}:${v}`];
    if (t !== undefined) verses.push({ n: `${c}:${v}`, t });
  }
  return { verses, total: x.keys.length, missing: x.keys.length - verses.length };
}
