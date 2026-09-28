/**
 * Режим «Эпохи» (ТЗ § 3.5; D14; UX-26, IX-27, IX-28, MAP-46, MAP-47, MAP-48, VIS-26): ярусы на том же полотне и в том же
 * масштабе времени — эпохи; судьи; цари Иудеи; цари Израиля; служения пророков; события. Промежуток жизни выбранного лица
 * проецируется столбцом через все ярусы, на краях столбца — формула относительной хронологии.
 *
 * Как устроено:
 *  — ярусы стоят между рамкой и небом и сдвигают небо вниз: их нижний край — верхнее поле видимой части (SkyView);
 *  — слева — непрозрачная колонка названий ярусов шириной 88 px с чертой справа; отрезки обрезаются по ней (VIS-26);
 *  — в ярусе столько строк, сколько нужно отрезкам окна; пустой ярус свёрнут в строку 14 px с названием;
 *    раскладка (planTiers) считается, когда небо остановилось, а во время движения держится прежней: отрезки, которым
 *    в ней нет строки, рисуются тонкой чертой внизу яруса, пока небо не встанет;
 *  — отрезки залиты тоном листа, без рамки; оценочные (судьи, завоевание) — с пунктирной рамкой; совместные правления
 *    заштрихованы под 45°; подпись — внутри отрезка, иначе снаружи, если рядом свободно, иначе за концом отрезка на
 *    подложке неба (так подписана Гофолия между Иорамом и Иоасом, MAP-47);
 *  — синхронизмы текста («в N-й год X воцарился Y», reign.sync) — вертикали между отрезками царей Иудеи и Израиля (MAP-47);
 *  — пророки: годы служения из данных; у кого их нет — засвидетельствованная деятельность: годы служения в карточке,
 *    иначе годы датированных событий; у лица «время не установлено» — скобка (MAP-48; решение 24);
 *  — события — риски с подписями на подложке, в две строки лесенкой; риска стоит только в строке своей подписи и не
 *    заходит в чужую; событие без места для подписи не рисуется, так что на обзоре нет «штрихкода» (VIS-26);
 *  — отрезки ловят указатель: подсказка (царь, годы, стих) и щелчок (лицо — выбрать, эпоха и событие — показать годы).
 *    Звёзды под ярусами указатель не достаёт (Sky.openTop).
 */
import { FRAME_H, type Rect, type Sky, type SkyState } from './sky.ts';
import { alpha } from './color.ts';
import { hits } from './rect.ts';
import { contrast } from '../ui/contrast.ts';
import { byId, graph, loadCard, loadedCard, persons, type ChronoRow, type ModelData } from '../data/atlas.ts';
import { toAstro } from '../engine/years.ts';
import type { WhenSpan } from '../engine/chronology.ts';
import { nameCase } from '../ui/text/ru.ts';
import { mapFont, mapSize, T_MAP_S, T_UI, T_UI_S } from './type.ts';

export type TierKey = 'epochs' | 'judges' | 'judah' | 'israel' | 'prophets' | 'events';

export interface TierBar {
  /** ключ отрезка: уникален среди всех ярусов */
  key: string;
  kind: 'epoch' | 'person' | 'event';
  /** лицо, эпоха или событие */
  id: string;
  label: string;
  /** годы, астрономические */
  t0: number;
  t1: number;
  /** границы оценочные (судьи, завоевание): пунктирная рамка */
  soft: boolean;
  /** строка яруса при упаковке всех его отрезков: совместные правления — в соседних строках */
  row: number;
  /** правление: над кем и сколько лет по тексту; номер правления у лица (IdxPerson.reign) */
  over?: string;
  years?: number | null;
  reign?: number;
  /** событие: стихи; пророк без годов служения в данных — стихи засвидетельствованной деятельности */
  refs?: string[];
  /** годы совместного правления с другим царём того же яруса (штриховка) */
  shared: [number, number][];
  /** «время не установлено» (MAP-48; решение 24): скобка без заливки — годы эпохи или деятельности, а не служения */
  bracket?: boolean;
  /** строка подсказки вместо «Годы служения: …» — откуда взяты годы пророка без годов служения в данных */
  note?: string;
  /** событие — граница своей эпохи (Исход, Потоп, разделение царства): подписывается первым */
  lead?: boolean;
}

export interface Tier {
  key: TierKey;
  name: string;
  bars: TierBar[];
}

/** Синхронизм текста (MAP-47): «в N-й год X воцарился Y» — вертикаль в год t между отрезками Y и X. */
export interface TierSync {
  /** отрезок правления Y (тот, чьё воцарение датировано) и отрезок X (по чьим годам счёт) */
  from: string;
  to: string;
  /** год синхронизма (астр.): начало правления X плюс N − 1 лет («N-й год» — прошёл N − 1 год) */
  t: number;
  refs: string[];
}

// ---------- ярусы из данных ----------

/** Упаковка отрезков по строкам: отрезок — в первую строку, где предыдущий кончился до его начала. */
export function packRows<T extends { t0: number; t1: number; row: number }>(bars: T[]): T[] {
  const ends: number[] = [];
  for (const b of [...bars].sort((a, c) => a.t0 - c.t0 || c.t1 - a.t1)) {
    let r = ends.findIndex((e) => e <= b.t0);
    if (r < 0) r = ends.length;
    ends[r] = b.t1;
    b.row = r;
  }
  return bars;
}

/** Годы, в которые у отрезка есть соправитель в том же ярусе. */
function markShared(bars: TierBar[]) {
  for (const a of bars)
    for (const b of bars) {
      if (a === b) continue;
      const lo = Math.max(a.t0, b.t0);
      const hi = Math.min(a.t1, b.t1);
      if (hi - lo >= 0.5) a.shared.push([lo, hi]);
    }
}

/** Откуда скобка «время не установлено» — словами для подсказки (engine/chronology.ts, WhenSpan). */
const WHEN_NOTE: Record<WhenSpan['by'], string> = {
  met: 'годы встречи с современником',
  kin: 'годы брата или сестры',
  mention: 'эпоха главы первого упоминания',
  epoch: 'эпоха из данных',
  bounds: 'границы из данных',
  group: 'годы созвездия',
};

/** Годы пророка в ярусе и откуда они (MAP-48). null — опор нет: пророк в ярус не попадает. */
export interface Ministry {
  t0: number;
  t1: number;
  soft: boolean;
  bracket?: boolean;
  refs?: string[];
  note?: string;
}

/** Что даёт карточка лица для годов деятельности: служения с годами и датированные события (§ 16, § 17). */
export interface MinistryCard {
  offices?: { from?: number; to?: number; refs: string[] }[];
  events?: { year?: number; age?: number; refs: string[] }[];
}

/**
 * Годы пророка в ярусе «Пророки» (MAP-48): по порядку опор —
 *  1) годы служения из данных (active);
 *  2) служения с годами в карточке (§ 16): Моисей — вождь при Исходе и в пустыне, 1446–1406 гг. до Р. Х.;
 *  3) датированные события жизни (§ 17) у лица с годами по числам текста: Енох, Авраам;
 *  4) у лица «время не установлено» — скобка засвидетельствованной деятельности или эпохи (решение 24), кроме скобки
 *     по годам созвездия: она не свидетельство.
 * card — тело карточки, если том уже загружен (иначе опоры 2 и 3 ждут загрузки).
 */
export function ministryOf(active: [number, number] | null, c: ChronoRow | undefined, card: MinistryCard | null): Ministry | null {
  if (active) return { t0: toAstro(active[0]), t1: Math.max(toAstro(active[1]), toAstro(active[0]) + 0.6), soft: false };
  if (!c) return null;
  const dated = c.cls === 'exact' || c.cls === 'calculated';
  const offices = (card?.offices ?? []).filter((o) => o.from !== undefined && o.to !== undefined);
  if (offices.length) {
    const t0 = Math.min(...offices.map((o) => toAstro(o.from!)));
    const t1 = Math.max(...offices.map((o) => toAstro(o.to!)));
    return { t0, t1: Math.max(t1, t0 + 0.6), soft: false, refs: offices[0].refs };
  }
  if (dated) {
    const evs = (card?.events ?? [])
      .map((e) => ({ t: e.year !== undefined ? toAstro(e.year) : e.age !== undefined ? c.b + e.age : null, refs: e.refs }))
      .filter((e): e is { t: number; refs: string[] } => e.t !== null)
      .sort((a, b) => a.t - b.t);
    if (evs.length)
      return {
        t0: evs[0].t,
        t1: Math.max(evs[evs.length - 1].t, evs[0].t + 0.6),
        soft: false,
        refs: evs[0].refs,
        note: 'События жизни (служение Писание не датирует)',
      };
    return null;
  }
  if (c.cls === 'epochal' && c.when && c.when.by !== 'group')
    return {
      t0: c.bLo,
      t1: Math.max(c.bHi, c.bLo + 0.6),
      soft: true,
      bracket: true,
      refs: c.when.ref ? [c.when.ref] : undefined,
      note: `Время служения не установлено; ${WHEN_NOTE[c.when.by]}`,
    };
  return null;
}

/**
 * Пророки без годов служения в данных, чьи годы даёт том карточек (опоры 2 и 3 ministryOf): лица с годами по числам
 * текста, не цари. Ярусы строятся из того, что уже загружено; недостающие тома просит replanTiers (в браузере).
 */
let candidates: { model: string; ids: string[] } | null = null;
function cardCandidates(m: ModelData): string[] {
  if (candidates?.model !== m.id) {
    const ids = persons
      .filter((p) => p.roles.includes('prophet') && !p.reign.length && !p.active)
      .filter((p) => {
        const c = m.chrono.get(p.id);
        return !!c && (c.cls === 'exact' || c.cls === 'calculated');
      })
      .map((p) => p.id);
    candidates = { model: m.id, ids };
  }
  return candidates.ids;
}
/** Какие из этих томов уже загружены (том карточки мог открыть и сам читатель): иной ключ — ярусы строятся заново. */
const cardsKey = (m: ModelData) => cardCandidates(m).map((id) => (loadedCard(id) ? 1 : 0)).join('');
const cardsAsked = new Set<string>();
/** Разбудить небо после загрузки тома: SkyView просит кадр (Camera.onChange). */
let wake: (() => void) | null = null;
function askCards(m: ModelData) {
  for (const id of cardCandidates(m)) {
    if (cardsAsked.has(id) || loadedCard(id)) continue;
    cardsAsked.add(id);
    loadCard(id)
      .then(() => wake?.())
      .catch(() => {
        /* том не загрузился: пророк остаётся без отрезка */
      });
  }
}

let cache: { model: string; cards: string; tiers: Tier[]; syncs: TierSync[] } | null = null;

function build(m: ModelData) {
  const cards = cardsKey(m);
  if (cache && cache.model === m.id && cache.cards === cards) return cache;
  const bar = (b: Omit<TierBar, 'row' | 'shared'>): TierBar => ({ ...b, row: 0, shared: [] });
  const ep = m.epochs.map((e) =>
    bar({ key: `ep:${e.id}`, kind: 'epoch', id: e.id, label: e.name, t0: toAstro(e.start), t1: toAstro(e.end), soft: e.id === 'judges' || e.id === 'conquest' }),
  );
  const judges: TierBar[] = [];
  const judah: TierBar[] = [];
  const israel: TierBar[] = [];
  const prophets: TierBar[] = [];
  for (const p of persons) {
    p.reign.forEach((r, k) => {
      const b = bar({
        key: `r:${p.id}:${k}`, kind: 'person', id: p.id, label: p.name, t0: toAstro(r.start), t1: Math.max(toAstro(r.end), toAstro(r.start) + 0.6), soft: false,
        over: r.over, years: r.years, reign: k,
      });
      if (/Иуд/.test(r.over)) judah.push(b);
      else if (/Израил/.test(r.over) && !p.roles.includes('judge')) israel.push(b);
    });
    if (p.roles.includes('judge') && p.active)
      judges.push(bar({ key: `j:${p.id}`, kind: 'person', id: p.id, label: p.name, t0: toAstro(p.active[0]), t1: Math.max(toAstro(p.active[1]), toAstro(p.active[0]) + 0.6), soft: true }));
    // пророк-царь (Давид) уже стоит в ярусе своего царства
    if (p.roles.includes('prophet') && !p.reign.length) {
      const c = m.chrono.get(p.id);
      const w = ministryOf(p.active, c, loadedCard(p.id));
      if (w) prophets.push(bar({ key: `p:${p.id}`, kind: 'person', id: p.id, label: p.name, ...w }));
    }
  }
  const events = m.epochs.flatMap((e) =>
    e.events.map((ev, i) =>
      bar({ key: `ev:${e.id}:${i}`, kind: 'event', id: `${e.id}-${i}`, label: ev.text, t0: toAstro(ev.year), t1: toAstro(ev.year), soft: false, refs: ev.refs, lead: ev.year === e.start || ev.year === e.end }),
    ),
  );
  for (const b of [...judah, ...israel]) b.shared = [];
  markShared(judah);
  markShared(israel);
  const tiers: Tier[] = [
    { key: 'epochs', name: 'Эпохи', bars: ep },
    { key: 'judges', name: 'Судьи', bars: packRows(judges) },
    { key: 'judah', name: 'Цари Иудеи', bars: packRows(judah) },
    { key: 'israel', name: 'Цари Израиля', bars: packRows(israel) },
    { key: 'prophets', name: 'Пророки', bars: packRows(prophets) },
    { key: 'events', name: 'События', bars: events },
  ];
  // синхронизмы: отрезок Y — в ярусе своего царства, отрезок X — в другом (MAP-47)
  const syncs: TierSync[] = [];
  const kings = [...judah, ...israel];
  for (const p of persons)
    p.reign.forEach((r, k) => {
      const from = kings.find((b) => b.key === `r:${p.id}:${k}`);
      if (!from) return;
      const other = judah.includes(from) ? israel : judah;
      for (const s of r.sync ?? []) {
        const xs = other.filter((b) => b.id === s.with);
        if (!xs.length) continue;
        // правление X, в котором лежит его N-й год; если таких нет — ближайшее
        const at = (b: TierBar) => b.t0 + s.year - 1;
        const to = xs.find((b) => at(b) >= b.t0 && at(b) <= b.t1 + 0.5) ?? xs.sort((a, b) => Math.abs(at(a) - from.t0) - Math.abs(at(b) - from.t0))[0];
        syncs.push({ from: from.key, to: to.key, t: at(to), refs: s.refs });
      }
    });
  cache = { model: m.id, cards, tiers, syncs };
  return cache;
}

export function buildTiers(m: ModelData): Tier[] {
  return build(m).tiers;
}

/** Синхронизмы текста между отрезками царей Иудеи и Израиля (MAP-47). */
export function buildSyncs(m: ModelData): TierSync[] {
  return build(m).syncs;
}

// ---------- формула относительной хронологии на краях столбца (ТЗ § 3.5, § 3.6) ----------

/** Прямой родитель или ребёнок: кровная связь, записанная Писанием или выведенная (не толкование, не «по закону»). */
const plain = (e: { kind: string; cert: string; claim: string }) => (e.kind === 'father' || e.kind === 'mother') && e.cert !== 'interpretation' && e.claim !== 'legal';

/** Ближайшая родня лица: родители, дети, братья и сёстры, супруги. */
function relatives(id: string): Set<string> {
  const out = new Set<string>();
  for (const e of graph.parentsOf.get(id) ?? [])
    if (plain(e)) {
      out.add(e.parent);
      for (const s of graph.childrenOf.get(e.parent) ?? []) if (plain(s)) out.add(s.child);
    }
  for (const e of graph.childrenOf.get(id) ?? []) if (plain(e)) out.add(e.child);
  for (const s of graph.spousesOf.get(id) ?? []) out.add(s.a === id ? s.b : s.a);
  out.delete(id);
  return out;
}

/** Формула столбца: слева — рождение, справа — смерть. null — надёжно датированной родни нет. */
export interface ColumnFormula {
  birth: string | null;
  death: string | null;
}

/**
 * Формула относительной хронологии для краёв столбца выбранного лица (ТЗ § 3.5, § 3.6): «Моисей родился после рождения
 * Аарона»; «умер после смерти Аарона, при жизни …». Опоры — ближайшая родня с годами по числам текста (точные и
 * расчётные даты), без пар, о которых говорит хронологическое напряжение. Имя родни — только в родительном падеже,
 * который умеет строить склонение (nameCase); не склоняется — опора не берётся. У лица с оценочной датой сравнивается
 * весь промежуток: «после» — только если родня родилась раньше его начала.
 */
export function columnFormula(id: string, m: Pick<ModelData, 'chrono' | 'tensions'>): ColumnFormula {
  const p = byId.get(id);
  const me = m.chrono.get(id);
  if (!p || !me || p.kind !== 'person' || me.cls === 'epochal' || me.named) return { birth: null, death: null };
  const tense = new Set(m.tensions.filter((t) => t.persons.includes(id)).flatMap((t) => t.persons));
  const sure = (c: ChronoRow) => c.cls === 'exact' || c.cls === 'calculated';
  // у точных и расчётных дат — год, у оценочных — промежуток
  const bSpan = (c: ChronoRow): [number, number] => (sure(c) ? [c.b, c.b] : [c.bLo, c.bHi]);
  const dSpan = (c: ChronoRow): [number, number] | null => (c.d === null ? null : sure(c) ? [c.d, c.d] : [c.dLo ?? c.d, c.dHi ?? c.d]);
  const gen = (x: string) => {
    const q = byId.get(x);
    return q && !q.unnamed ? nameCase(q.name, q.sex, 'gen') : null;
  };
  const rel = [...relatives(id)]
    .filter((x) => !tense.has(x))
    .map((x) => ({ id: x, c: m.chrono.get(x), g: gen(x) }))
    .filter((r): r is { id: string; c: ChronoRow; g: string } => !!r.c && sure(r.c) && !r.c.named && byId.get(r.id)?.kind === 'person' && r.g !== null);
  const [b0, b1] = bSpan(me);
  const before = rel.filter((r) => r.c.b < b0).sort((a, b) => b.c.b - a.c.b)[0];
  const after = rel.filter((r) => r.c.b > b1).sort((a, b) => a.c.b - b.c.b)[0];
  const f = p.sex === 'f';
  const born = f ? 'родилась' : 'родился';
  const birth =
    before || after
      ? `${p.name} ${born} ${before ? `после рождения ${before.g}` : ''}${before && after ? ' и ' : ''}${after ? `до рождения ${after.g}` : ''}`
      : null;
  let death: string | null = null;
  const md = dSpan(me);
  if (md) {
    const died = rel.filter((r) => r.c.d !== null && r.c.d < md[0]).sort((a, b) => b.c.d! - a.c.d!)[0];
    const alive = rel.filter((r) => r.c.b < md[0] && r.c.d !== null && r.c.d > md[1]).sort((a, b) => a.c.d! - b.c.d!)[0];
    if (died || alive)
      death = `${f ? 'умерла' : 'умер'} ${died ? `после смерти ${died.g}` : ''}${died && alive ? ', ' : ''}${alive ? `при жизни ${alive.g}` : ''}`;
  }
  return { birth, death };
}

// ---------- раскладка по окну ----------

/** Ярусы начинаются под линейкой и служебной строкой рамки (C4), не закрывая их. */
export const TIER_TOP = FRAME_H + 4;
/** Строка яруса: отрезок 12 px и зазор 4 px (VIS-26). */
export const PITCH = 16;
export const BAR_H = 12;
/** Свёрнутый (пустой в этом окне) ярус — строка с названием (MAP-48). */
export const COLLAPSED_H = 14;
/** Ярус событий: риски и подписи в две строки лесенкой (MAP-46). */
export const EVENTS_H = 30;
/** Колонка названий ярусов у левой кромки (VIS-26): непрозрачная, отрезки обрезаются по ней. */
export const NAME_COL = 88;
/**
 * Мелкий масштаб (обзор, эпохи в тысячи лет): отрезки короче своих имён — строки по 5 px без подписей, имена — в подсказке.
 * Иначе на обзоре ярусы заняли бы 40 % неба (MAP-48).
 */
export const COMPACT_PITCH = 5;
/** Мелкий масштаб — когда 25 лет (обычное царствование) уже 30 px. */
export const compactAt = (pxPerYear: number) => pxPerYear * 25 < 30;
const TIER_GAP = 2;
const PAD = 4;

export interface TierBlock {
  tier: Tier;
  /** верх яруса, px холста */
  y: number;
  h: number;
  /** строки упаковки, у которых в окне есть отрезки, — сверху вниз */
  rows: number[];
  collapsed: boolean;
  /** шаг строк: PITCH или COMPACT_PITCH (мелкий масштаб, без подписей) */
  pitch: number;
}

export interface TierPlan {
  model: string;
  /** окно лет, по которому раскладка построена */
  t0: number;
  t1: number;
  blocks: TierBlock[];
  /** нижний край ярусов: ниже — открытое небо */
  bottom: number;
  /** доля неба, в которую раскладка уложена (tiersBudget) */
  maxH: number;
  /** какие тома карточек с годами пророков были загружены (cardsKey): иной ключ — раскладка устарела */
  cards?: string;
}

const visibleIn = (b: TierBar, t0: number, t1: number) => b.t1 >= t0 && b.t0 <= t1;

/** Как ужать ярусы, если они не помещаются в свою долю неба (H7; MOB-24). */
interface Squeeze {
  /** мелкие строки без подписей у всех ярусов, кроме эпох */
  compact: boolean;
  /** события — риски без подписей, строкой 14 px */
  eventsCompact: boolean;
  /** пустые ярусы не показывать вовсе (иначе — свёрнутая строка с названием) */
  dropEmpty: boolean;
  /** строк в ярусе не больше стольких; отрезки остальных — тонкой чертой под ними */
  cap: number;
  /** зазор между ярусами */
  gap: number;
  /** сколько непустых ярусов убрать — начиная с тех, у кого в окне меньше всего отрезков (эпохи остаются всегда) */
  drop: number;
}
/** Под отрезками строк, не вошедших в ярус, — полоса 4 px с тонкими чертами. */
const CAPPED_H = 4;

function layoutTiers(tiers: Tier[], t0: number, t1: number, model: string, top: number, q: Squeeze): TierPlan {
  const vis = new Map(tiers.map((t) => [t.key, t.bars.filter((b) => visibleIn(b, t0, t1))]));
  const dropped = new Set(
    tiers
      .filter((t) => t.key !== 'epochs' && vis.get(t.key)!.length)
      .sort((a, b) => vis.get(a.key)!.length - vis.get(b.key)!.length)
      .slice(0, q.drop)
      .map((t) => t.key),
  );
  let y = top;
  const blocks: TierBlock[] = [];
  for (const tier of tiers) {
    if (dropped.has(tier.key)) continue;
    const all = [...new Set(vis.get(tier.key)!.map((b) => b.row))].sort((a, b) => a - b);
    const collapsed = all.length === 0;
    if (collapsed && q.dropEmpty && tier.key !== 'epochs') continue;
    const rows = all.slice(0, Math.max(1, q.cap));
    const capped = rows.length < all.length;
    const pitch = q.compact && tier.key !== 'epochs' ? COMPACT_PITCH : PITCH;
    const h = collapsed
      ? COLLAPSED_H
      : tier.key === 'events'
        ? q.eventsCompact
          ? COLLAPSED_H
          : EVENTS_H
        : Math.max(pitch === PITCH ? 0 : COLLAPSED_H, rows.length * pitch + (capped ? CAPPED_H : 0));
    blocks.push({ tier, y, h, rows, collapsed, pitch });
    y += h + q.gap;
  }
  return { model, t0, t1, blocks, bottom: y - q.gap + PAD, maxH: Infinity };
}

/**
 * Раскладка ярусов для окна лет [t0, t1]: высота каждого — по строкам его видимых отрезков; пустой — свёрнут.
 * compact — мелкий масштаб: строки по 5 px без подписей, события — одной строкой подписей (эпохи — как обычно).
 * maxH — сколько неба ярусам можно занять от нижней кромки рамки (H7; MOB-24). Если они не помещаются, они ужимаются
 * по шагам, пока не поместятся: без пустых ярусов; не больше двух строк, затем одной; события одной строкой; мелкие
 * строки; без зазоров; в последнюю очередь уходят ярусы, у которых в окне меньше всего отрезков.
 */
export function planTiers(tiers: Tier[], t0: number, t1: number, model = '', top = TIER_TOP, compact = false, maxH = Infinity): TierPlan {
  const base = { compact, eventsCompact: compact, dropEmpty: false, cap: Infinity, gap: TIER_GAP, drop: 0 };
  const steps: Squeeze[] = [
    base,
    { ...base, dropEmpty: true },
    { ...base, dropEmpty: true, cap: 2 },
    { ...base, dropEmpty: true, cap: 1 },
    { ...base, dropEmpty: true, cap: 1, eventsCompact: true },
    { compact: true, eventsCompact: true, dropEmpty: true, cap: 3, gap: TIER_GAP, drop: 0 },
    { compact: true, eventsCompact: true, dropEmpty: true, cap: 1, gap: TIER_GAP, drop: 0 },
    { compact: true, eventsCompact: true, dropEmpty: true, cap: 1, gap: 0, drop: 0 },
  ];
  for (let k = 1; k < tiers.length; k++) steps.push({ compact: true, eventsCompact: true, dropEmpty: true, cap: 1, gap: 0, drop: k });
  let p = layoutTiers(tiers, t0, t1, model, top, steps[0]);
  for (let i = 1; i < steps.length && p.bottom - FRAME_H > maxH; i++) p = layoutTiers(tiers, t0, t1, model, top, steps[i]);
  p.maxH = maxH;
  return p;
}

/** Доля видимого неба, которую могут занять ярусы (H7; MOB-24: на телефоне ярусы вытесняли небо целиком). */
export const TIERS_SHARE = 0.35;
/** Ниже такой высоты видимого неба (лист карточки поднят) ярусы — в самом сжатом виде, чтобы небу осталось место. */
const ROOM_MIN = 160;
/** Сколько px ярусам можно занять при видимом небе от рамки до bottom (px холста). */
export function tiersBudget(bottom: number): number {
  const room = bottom - FRAME_H;
  return room >= ROOM_MIN ? Math.round(room * TIERS_SHARE) : 0;
}

let plan: TierPlan | null = null;

/** Окно лет видимой части неба с запасом 10 % по краям: малый сдвиг раскладку не меняет. */
function windowOf(sky: Sky): [number, number] {
  const cam = sky.cam;
  const a = sky.tOf(cam.wx(cam.vp.l));
  const b = sky.tOf(cam.wx(cam.vp.r));
  const m = (b - a) * 0.1;
  return [a - m, b + m];
}

/**
 * Разложить ярусы заново по окну неба. Зовёт SkyView: при включении ярусов, когда небо остановилось, при смене модели
 * и размера. Возвращает true, если сдвинулся нижний край ярусов (поле видимой части неба нужно обновить).
 */
export function replanTiers(sky: Sky, m: ModelData): boolean {
  const [a, b] = windowOf(sky);
  const vp = sky.cam.vp;
  const next = planTiers(buildTiers(m), a, b, m.id, TIER_TOP, compactAt(((vp.r - vp.l) * 1.2) / Math.max(1, b - a)), tiersBudget(vp.b));
  next.cards = cardsKey(m);
  askCards(m);
  const was = plan?.bottom;
  plan = next;
  return next.bottom !== was;
}

/** Нижний край ярусов на холсте (раскладка — последняя; если её нет или сменилась модель — по текущему окну). */
export function tiersBottom(sky: Sky, m: ModelData): number {
  if (!plan || plan.model !== m.id) replanTiers(sky, m);
  return plan!.bottom;
}

/** Текущая раскладка — для проверок. */
export const currentPlan = () => plan;

// ---------- попадание ----------

export interface TierHit extends Rect {
  bar: TierBar;
  tier: TierKey;
}
let hitRects: TierHit[] = [];
/** Отрезок под наведённым указателем: его обводит кадр. */
export const tierHot = { key: null as string | null };

/** Отрезок яруса в точке (px холста) или null. */
export function tierAt(x: number, y: number): TierHit | null {
  let best: TierHit | null = null;
  for (const h of hitRects) {
    if (x < h.x || x > h.x + h.w || y < h.y || y > h.y + h.h) continue;
    // узкий отрезок поверх широкого: ловится тот, что короче (событие поверх эпохи не бывает — разные ярусы)
    if (!best || h.w < best.w) best = h;
  }
  return best;
}

// ---------- места подписей ----------

/** Отрезок строки яруса на экране (px) и ширина его подписи. */
export interface RowBar {
  key: string;
  x0: number;
  x1: number;
  tw: number;
}
/** Где подпись: внутри отрезка, снаружи на свободном небе или за концом отрезка на подложке неба поверх соседа. */
export interface BarLabel {
  x: number;
  where: 'inside' | 'outside' | 'spill';
}

/**
 * Подписи отрезков одной строки яруса (VIS-26, MAP-47). Сначала — внутри отрезков, у левого края поля left, если
 * помещаются. Затем отрезкам без подписи — снаружи справа или слева на свободном небе; иначе сразу за концом отрезка
 * на подложке неба, поверх начала соседнего отрезка (короткое правление между двумя длинными: Гофолия между Иорамом и
 * Иоасом). Подпись соседа при этом сдвигается вправо, если остаётся внутри его отрезка; иначе подписи за концом нет.
 * Подписи не ложатся друг на друга. right — правый край поля.
 */
export function placeBarLabels(bars: readonly RowBar[], left: number, right: number): Map<string, BarLabel> {
  const out = new Map<string, BarLabel>();
  const byKey = new Map(bars.map((b) => [b.key, b]));
  const sorted = [...bars].filter((b) => b.x1 >= left && b.x0 <= right).sort((a, b) => a.x0 - b.x0);
  const inside = (b: RowBar, x: number) => x >= b.x0 + 3 && x >= left - 0.5 && x + b.tw <= Math.min(b.x1, right) - 3;
  for (const b of sorted) {
    const ix = Math.max(b.x0 + 4, left);
    if (inside(b, ix)) out.set(b.key, { x: ix, where: 'inside' });
  }
  const span = (k: string): [number, number] => {
    const l = out.get(k)!;
    return [l.x, l.x + byKey.get(k)!.tw];
  };
  const labelsOn = (u0: number, u1: number) => [...out.keys()].filter((k) => {
    const [a, c] = span(k);
    return u0 < c + 4 && a - 4 < u1;
  });
  const clearOfBars = (u0: number, u1: number) => !bars.some((b) => u0 < b.x1 + 2 && b.x0 - 2 < u1);
  for (const b of sorted) {
    if (out.has(b.key)) continue;
    const r0 = b.x1 + 4;
    const l0 = b.x0 - 4 - b.tw;
    if (r0 >= left && r0 + b.tw <= right && clearOfBars(r0, r0 + b.tw) && !labelsOn(r0, r0 + b.tw).length) {
      out.set(b.key, { x: r0, where: 'outside' });
      continue;
    }
    if (l0 >= left && clearOfBars(l0, b.x0 - 4) && !labelsOn(l0, b.x0 - 4).length) {
      out.set(b.key, { x: l0, where: 'outside' });
      continue;
    }
    const sx = Math.max(b.x1 + 3, left);
    if (sx + b.tw > right) continue;
    const hit = labelsOn(sx, sx + b.tw);
    if (!hit.length) {
      out.set(b.key, { x: sx, where: 'spill' });
      continue;
    }
    // подпись соседа внутри его отрезка — вправо, за подпись этого отрезка
    const nk = hit[0];
    const n = byKey.get(nk)!;
    const nx = sx + b.tw + 6;
    if (hit.length === 1 && out.get(nk)!.where === 'inside' && n.x0 >= b.x1 - 1 && inside(n, nx)) {
      out.delete(nk);
      if (!labelsOn(nx, nx + n.tw).length && !labelsOn(sx, sx + b.tw).length) {
        out.set(nk, { x: nx, where: 'inside' });
        out.set(b.key, { x: sx, where: 'spill' });
      } else out.set(nk, { x: Math.max(n.x0 + 4, left), where: 'inside' });
    }
  }
  return out;
}

/** Событие на обзоре: риска в x и ширина подписи. lead — граница эпохи (подписывается первым). */
export interface EventMark {
  key: string;
  x: number;
  tw: number;
  lead: boolean;
}

/**
 * Подписи событий (VIS-26): сначала события на границах эпох, затем прочие по времени; каждое — в первую из rows
 * строк, где риска и подпись [x, x + 4 + tw] не заходят в чужую подпись. Не поместилось — события нет: на обзоре
 * остаются только подписанные. left и right — поле (колонка названий и край неба).
 */
export function placeEvents(evs: readonly EventMark[], rows: number, left: number, right: number): Map<string, number> {
  const occ: [number, number][][] = Array.from({ length: rows }, () => []);
  const out = new Map<string, number>();
  const order = [...evs].sort((a, b) => Number(b.lead) - Number(a.lead) || a.x - b.x);
  for (const e of order) {
    if (e.x < left + 1 || e.x + 4 + e.tw > right) continue;
    const u0 = e.x - 2;
    const u1 = e.x + 4 + e.tw;
    const r = occ.findIndex((row) => !row.some(([a, b]) => u0 < b + 8 && a - 8 < u1));
    if (r < 0) continue;
    occ[r].push([u0, u1]);
    out.set(e.key, r);
  }
  return out;
}

// ---------- отрисовка ----------

/** Штриховка 45° в прямоугольнике: совместные правления (MAP-47, VIS-26). */
function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  if (w <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = x - h; k < x + w; k += 5) {
    ctx.moveTo(k, y + h);
    ctx.lineTo(k + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Ширина колонки названий: 88 px, а на сенсорном экране — не уже самого длинного названия с полями. */
function nameColumn(ctx: CanvasRenderingContext2D, tiers: readonly Tier[], font: string): number {
  ctx.font = font;
  return Math.max(NAME_COL, Math.ceil(Math.max(...tiers.map((t) => ctx.measureText(t.name).width)) + 9));
}

export function drawTiers(sky: Sky, s: SkyState) {
  const { ctx, cam, pal } = sky;
  const W = cam.w;
  const LW = sky.letterW;
  // том карточки с годами пророка загрузился — небо просит кадр, ярусы раскладываются заново
  wake = () => cam.onChange();
  if (plan && plan.model === s.model.id && plan.cards !== undefined && plan.cards !== cardsKey(s.model)) {
    replanTiers(sky, s.model);
    if (plan!.bottom !== cam.vp.t) sky.setInsets({ top: plan!.bottom });
  }
  // видимое небо стало выше или ниже (лист карточки на телефоне сменил положение): доля ярусов — заново,
  // и небо под ними сдвигается вместе с их нижним краем
  const budgetNow = tiersBudget(cam.vp.b);
  if (plan && plan.model === s.model.id && Math.abs(plan.maxH - budgetNow) > 4) {
    replanTiers(sky, s.model);
    if (plan!.bottom !== cam.vp.t) sky.setInsets({ top: plan!.bottom });
  }
  const p = plan && plan.model === s.model.id ? plan : (replanTiers(sky, s.model), plan!);
  const bottom = p.bottom;
  hitRects = [];
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, FRAME_H, W, bottom - FRAME_H);
  // звёзды под ярусами закрыты: указатель и скрытый список их не достают (IX-28)
  sky.openTop = Math.max(sky.openTop, bottom);
  ctx.strokeStyle = pal.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, bottom + 0.5);
  ctx.lineTo(W, bottom + 0.5);
  ctx.stroke();

  const sel = s.selected ? s.model.chrono.get(s.selected) : null;
  const selP = s.selected ? byId.get(s.selected) : null;
  const tL = sky.tOf(cam.wx(0));
  const tR = sky.tOf(cam.wx(W));
  const fs = mapSize(T_MAP_S, sky.coarse);
  const nameFont = mapFont(T_MAP_S, { sans: true, weight: 500, coarse: sky.coarse });
  const barFont = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: sky.coarse });
  // подписи событий — гротеском, как и всё в ярусах, на подложке --halo (VIS-26)
  const evFont = mapFont(T_MAP_S, { sans: true, weight: 450, coarse: sky.coarse });
  ctx.textBaseline = 'alphabetic';
  // тон отрезка — лист на ступень светлее неба (VIS-26); днём --sheet-2 почти сливается с небом — тогда тон линии
  const flat = contrast(pal.sheet2, pal.sky) < 1.3;
  const fill = flat ? pal.rule : pal.sheet2;
  const fillSel = flat ? pal.ruleStrong : pal.rule;
  // колонка названий: отрезки, риски и подписи — правее неё
  const colR = LW + nameColumn(ctx, p.blocks.map((b) => b.tier), nameFont);
  const x0Of = (b: TierBar) => cam.sx(sky.xOf(b.t0));
  const x1Of = (b: TierBar) => cam.sx(sky.xOf(b.t1));
  const inSelOf = (b: TierBar) => (sel ? b.t1 >= sel.bLo && b.t0 <= (sel.d ?? sel.dEst) : false);

  // ---------- геометрия отрезков: строка и прямоугольник каждого видимого отрезка ----------
  interface Geo {
    b: TierBar;
    tier: TierKey;
    blk: TierBlock;
    x0: number;
    x1: number;
    a: number;
    z: number;
    di: number | undefined;
    y: number;
    bh: number;
  }
  const geos: Geo[] = [];
  for (const blk of p.blocks) {
    if (blk.tier.key === 'events') continue;
    const rowOf = new Map(blk.rows.map((r, i) => [r, i]));
    const compact = blk.pitch < PITCH;
    for (const b of blk.tier.bars) {
      if (!visibleIn(b, tL, tR)) continue;
      const x0 = x0Of(b);
      const x1 = x1Of(b);
      if (x1 < colR || x0 > W) continue;
      const di = blk.collapsed ? undefined : rowOf.get(b.row);
      const bh = compact ? blk.pitch - 1 : BAR_H;
      const y = di === undefined ? blk.y + blk.h - 4 : blk.y + di * blk.pitch + (compact ? 0 : 2);
      geos.push({ b, tier: blk.tier.key, blk, x0, x1, a: Math.max(colR, x0), z: Math.min(W, x1), di, y, bh });
    }
  }
  const geoByKey = new Map(geos.map((g) => [g.b.key, g]));

  // ---------- синхронизмы: вертикали между царями Иудеи и Израиля (MAP-47), под отрезками ----------
  let syncCount = 0;
  ctx.strokeStyle = pal.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const sy of buildSyncs(s.model)) {
    const g1 = geoByKey.get(sy.from);
    const g2 = geoByKey.get(sy.to);
    if (!g1 || !g2 || g1.di === undefined || g2.di === undefined || g1.blk.pitch < PITCH || g2.blk.pitch < PITCH) continue;
    const x = Math.round(cam.sx(sky.xOf(sy.t))) + 0.5;
    if (x < colR + 1 || x > W) continue;
    const [up, dn] = g1.y < g2.y ? [g1, g2] : [g2, g1];
    ctx.moveTo(x, up.y + up.bh / 2);
    ctx.lineTo(x, dn.y + dn.bh / 2);
    syncCount++;
  }
  ctx.stroke();

  // ---------- отрезки и их подписи ----------
  const labeledIds = new Set<string>();
  for (const blk of p.blocks) {
    const { tier } = blk;
    if (tier.key === 'events') continue;
    const mine = geos.filter((g) => g.blk === blk);
    const compact = blk.pitch < PITCH;
    // места подписей — по строкам (внутри, снаружи, за концом)
    ctx.font = barFont;
    const labelAt = new Map<string, BarLabel>();
    if (!compact && !blk.collapsed)
      blk.rows.forEach((_, di) => {
        const row = mine.filter((g) => g.di === di).map((g) => ({ key: g.b.key, x0: g.x0, x1: g.x1, tw: ctx.measureText(g.b.label).width }));
        for (const [k, v] of placeBarLabels(row, colR + 4, W - 4)) labelAt.set(k, v);
      });
    for (const g of mine) {
      const { b, a, z, y, bh } = g;
      const inSel = inSelOf(b);
      const hot = tierHot.key === b.key;
      const wBar = Math.max(1.5, z - a);
      if (g.di === undefined) {
        // во время движения: отрезку нет строки в раскладке — тонкая черта внизу яруса
        ctx.fillStyle = hot ? pal.ink : pal.ruleStrong;
        ctx.fillRect(a, y, wBar, 2);
        hitRects.push({ x: a, y: y - 3, w: Math.max(6, wBar), h: 7, bar: b, tier: tier.key });
        continue;
      }
      if (b.bracket) {
        // «время не установлено»: скобка — черта по середине строки с засечками на концах, без заливки
        ctx.strokeStyle = hot || inSel ? pal.ink : pal.ink3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const my = Math.round(y + bh / 2) + 0.5;
        ctx.moveTo(a, my);
        ctx.lineTo(z, my);
        if (g.x0 >= colR) {
          ctx.moveTo(Math.round(g.x0) + 0.5, y + 1);
          ctx.lineTo(Math.round(g.x0) + 0.5, y + bh - 1);
        }
        if (g.x1 <= W) {
          ctx.moveTo(Math.round(g.x1) - 0.5, y + 1);
          ctx.lineTo(Math.round(g.x1) - 0.5, y + bh - 1);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = inSel || hot ? fillSel : fill;
        ctx.fillRect(a, y, wBar, bh);
      }
      if (compact) {
        // мелкий масштаб: без подписей и штриховки; наведённый отрезок — цветом текста
        if (hot) {
          ctx.fillStyle = pal.ink;
          ctx.fillRect(a, y, wBar, bh);
        }
        hitRects.push({ x: a, y: y - 1, w: Math.max(6, wBar), h: bh + 2, bar: b, tier: tier.key });
        continue;
      }
      if (!b.bracket)
        for (const [s0, s1] of b.shared) {
          const h0 = Math.max(a, cam.sx(sky.xOf(s0)));
          const h1 = Math.min(z, cam.sx(sky.xOf(s1)));
          hatch(ctx, h0, y, h1 - h0, bh, alpha(pal.ink3, 0.55));
        }
      if (b.soft && !b.bracket) {
        ctx.strokeStyle = pal.ruleStrong;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(Math.round(a) + 0.5, y + 0.5, Math.max(1, Math.round(wBar) - 1), bh - 1);
        ctx.setLineDash([]);
      }
      if (hot && !b.bracket) {
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(a) + 0.5, y + 0.5, Math.max(1, Math.round(wBar) - 1), bh - 1);
      }
      hitRects.push({ x: a, y, w: Math.max(6, wBar), h: bh, bar: b, tier: tier.key });
    }
    // подписи — после всех отрезков яруса: подпись за концом отрезка ложится на соседа на подложке неба
    ctx.font = barFont;
    for (const g of mine) {
      const at = labelAt.get(g.b.key);
      if (!at) continue;
      const { b, y } = g;
      const tw = ctx.measureText(b.label).width;
      const inSel = inSelOf(b);
      const hot = tierHot.key === b.key;
      if (at.where === 'outside') {
        // подпись на небе — на его подложке: вертикали синхронизмов под ней не проходят
        ctx.fillStyle = pal.sky;
        ctx.fillRect(at.x - 2, y, tw + 4, BAR_H);
      } else if (at.where === 'spill') {
        ctx.fillStyle = pal.sky;
        ctx.fillRect(at.x - 2, y, tw + 4, BAR_H);
        // подпись — к своему отрезку: хит-зона продолжается на неё
        hitRects.push({ x: at.x - 2, y, w: tw + 4, h: BAR_H, bar: b, tier: tier.key });
      } else if (at.where === 'inside' && !b.bracket && b.shared.length) {
        // под подписью внутри отрезка — его тон без штриховки: имя читается и на совместном правлении
        ctx.fillStyle = inSel || hot ? fillSel : fill;
        ctx.fillRect(at.x - 2, y + 1, tw + 4, BAR_H - 2);
      } else if (at.where === 'inside' && b.bracket) {
        ctx.fillStyle = pal.sky;
        ctx.fillRect(at.x - 2, y + 1, tw + 4, BAR_H - 2);
      }
      ctx.fillStyle = inSel || hot ? pal.ink : pal.ink2;
      ctx.fillText(b.label, at.x, y + BAR_H - 2.5);
      labeledIds.add(b.id);
    }
  }

  // ---------- события: риска — только в строке своей подписи; без места для подписи события нет ----------
  let eventsDrawn = 0;
  for (const blk of p.blocks) {
    if (blk.tier.key !== 'events' || blk.collapsed) continue;
    const rows = blk.h >= EVENTS_H ? 2 : 1;
    const rowH = rows === 2 ? 14 : blk.h;
    ctx.font = evFont;
    const marks = blk.tier.bars
      .filter((b) => visibleIn(b, tL, tR))
      .map((b) => ({ b, key: b.key, x: Math.round(x0Of(b)) + 0.5, tw: ctx.measureText(b.label).width, lead: !!b.lead }));
    const placed = placeEvents(marks, rows, colR, W - 4);
    for (const e of marks) {
      const r = placed.get(e.key);
      if (r === undefined) continue;
      const { b, x, tw } = e;
      const top = blk.y + r * rowH;
      const inSel = sel ? b.t0 >= sel.bLo && b.t0 <= (sel.d ?? sel.dEst) : false;
      const hot = tierHot.key === b.key;
      ctx.strokeStyle = hot || inSel ? pal.ink : pal.ink3;
      ctx.lineWidth = hot ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, top + 1);
      ctx.lineTo(x, top + rowH - 1);
      ctx.stroke();
      ctx.lineWidth = 1;
      const by = top + Math.min(rowH, 14) / 2 + fs * 0.36;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.halo;
      ctx.lineWidth = 3;
      ctx.strokeText(b.label, x + 4, by);
      ctx.restore();
      ctx.fillStyle = hot || inSel ? pal.ink : pal.ink2;
      ctx.fillText(b.label, x + 4, by);
      hitRects.push({ x: x - 4, y: top, w: tw + 12, h: rowH, bar: b, tier: 'events' });
      eventsDrawn++;
    }
  }

  // ---------- проекция выбранного лица столбцом: сплошное ядро — надёжная часть, растушёванные края — неопределённость ----------
  let formula: ColumnFormula | null = null;
  let core: [number, number] | null = null;
  if (sel && selP) {
    const end = sel.d ?? sel.last ?? sel.b;
    const a = cam.sx(sky.xOf(sel.bLo));
    const b = cam.sx(sky.xOf(sel.bHi));
    const c = cam.sx(sky.xOf(end));
    const d = cam.sx(sky.xOf(sel.d ?? sel.dEst));
    const tone = (k: number) => alpha(pal.ink3, k);
    const top = TIER_TOP - 4;
    const g = ctx.createLinearGradient(a, 0, b, 0);
    g.addColorStop(0, tone(0));
    g.addColorStop(1, tone(0.16));
    ctx.fillStyle = g;
    ctx.fillRect(a, top, Math.max(1, b - a), cam.h);
    ctx.fillStyle = tone(0.16);
    ctx.fillRect(b, top, Math.max(1, c - b), cam.h);
    const g2 = ctx.createLinearGradient(c, 0, d, 0);
    g2.addColorStop(0, tone(0.16));
    g2.addColorStop(1, tone(0));
    ctx.fillStyle = g2;
    ctx.fillRect(c, top, Math.max(1, d - c), cam.h);
    ctx.strokeStyle = pal.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(b) + 0.5, top);
    ctx.lineTo(Math.round(b) + 0.5, cam.h);
    ctx.stroke();
    formula = columnFormula(s.selected!, s.model);
    core = [b, c];
  }

  // ---------- колонка названий: непрозрачная, с чертой справа (VIS-26) ----------
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, FRAME_H, colR, bottom - FRAME_H);
  ctx.strokeStyle = pal.rule;
  ctx.beginPath();
  ctx.moveTo(Math.round(colR) - 0.5, FRAME_H);
  ctx.lineTo(Math.round(colR) - 0.5, bottom);
  ctx.stroke();
  ctx.font = nameFont;
  ctx.fillStyle = pal.ink3;
  for (const blk of p.blocks) ctx.fillText(blk.tier.name, LW + 6, blk.y + Math.min(blk.h, PITCH) / 2 + fs * 0.36);

  // ---------- формула на краях столбца (ТЗ § 3.5): рождение — у левого края ядра, смерть — у правого ----------
  const placedFormula = selP && core ? drawFormula(sky, s, selP.name, formula!, core, colR, bottom) : null;

  // для проверок приёмки (tools/accept/strip.ts): колонка, синхронизмы, события, пророки и подписанные отрезки в окне,
  // формула столбца, её место и то, что она обходит (указатели у края, органы неба)
  const state = JSON.stringify({
    col: Math.round(colR - LW),
    sync: syncCount,
    events: [eventsDrawn, p.blocks.find((b) => b.tier.key === 'events')?.tier.bars.filter((b) => visibleIn(b, tL, tR)).length ?? 0],
    prophets: [...new Set(geos.filter((g) => g.tier === 'prophets').map((g) => g.b.id))],
    labeled: [...labeledIds],
    formula: placedFormula,
  });
  if (sky.canvas.dataset.tiers !== state) sky.canvas.dataset.tiers = state;
}

/**
 * Формула у краёв столбца выбранного лица под ярусами: «Моисей родился после рождения Аарона» — от левого края ядра,
 * «умер после смерти Аарона» — к правому. Не помещаются в строку — вторая строка. Строки не ложатся на указатель
 * «↑ Моисей» у края неба и на органы неба (резерв): текст уходит ниже них. Без надёжной опоры — только имя.
 */
function drawFormula(sky: Sky, s: SkyState, name: string, f: ColumnFormula, core: [number, number], colR: number, bottom: number): { text: string[]; rect: Rect; avoid: Rect[] } | null {
  const { ctx, cam, pal } = sky;
  const W = cam.w;
  // столбец за краем неба — формулы нет
  if (core[1] < colR || core[0] > W) return null;
  ctx.font = mapFont(T_UI_S, { sans: true, weight: 450, coarse: sky.coarse });
  const lineH = mapSize(T_UI_S, sky.coarse) + 5;
  const mark = ', расч.';
  const left = f.birth ? `${f.birth}${f.death ? '' : mark}` : name;
  const right = f.death ? `${f.death}${mark}` : null;
  const wl = ctx.measureText(left).width;
  const wr = right ? ctx.measureText(right).width : 0;
  const lx = Math.max(colR + 6, Math.min(W - wl - 6, core[0] + 6));
  // правая строка — у правого края ядра; не помещается рядом с левой — на следующей строке
  let rx = right ? Math.max(colR + 6, Math.min(W - wr - 6, core[1] - 6 - wr)) : 0;
  let rRow = 0;
  if (right && rx < lx + wl + 16) {
    rRow = 1;
    if (rx < colR + 6) rx = lx;
  }
  const rows = rRow + 1;
  // указатель «↑ Имя» у верхнего края и органы неба: блок формулы уходит ниже них
  const block = (y: number): Rect => ({ x: Math.min(lx, right ? rx : lx) - 3, y: y - lineH + 3, w: Math.max(lx + wl, right ? rx + wr : 0) - Math.min(lx, right ? rx : lx) + 6, h: lineH * rows + 2 });
  const avoid = [...pointerBoxes(sky, s), ...(s.reserve ?? [])];
  let y = bottom + lineH + 1;
  for (let k = 0; k < 4; k++) {
    const hit = avoid.find((r) => hits(block(y), [r]));
    if (!hit) break;
    y = hit.y + hit.h + lineH;
  }
  if (y + lineH * rows > cam.vp.b) return null;
  const text = (t: string, x: number, yy: number, w: number) => {
    ctx.fillStyle = pal.sky;
    ctx.fillRect(x - 3, yy - lineH + 4, w + 6, lineH);
    ctx.fillStyle = pal.ink;
    ctx.fillText(t, x, yy);
  };
  text(left, lx, y, wl);
  if (right) text(right, rx, y + rRow * lineH, wr);
  return { text: right ? [left, right] : [left], rect: block(y), avoid };
}

/**
 * Где встанут указатели у края неба на выбранных за его краем (как placeWayfinding в frame.ts, без обхода органов):
 * формула столбца их не закрывает.
 */
function pointerBoxes(sky: Sky, s: SkyState): Rect[] {
  const { ctx, cam } = sky;
  const W = cam.w;
  const top = sky.openTop;
  const bottom = cam.vp.b;
  const out: Rect[] = [];
  ctx.save();
  ctx.font = mapFont(T_UI, { sans: true, weight: 500, coarse: sky.coarse });
  for (const id of [s.selected, s.second]) {
    if (!id) continue;
    const i = sky.indexOf(id);
    if (i === undefined || sky.hides(id)) continue;
    const x = cam.sx(sky.X0[i]);
    const y = cam.sy(sky.nodes[i].lane);
    if (x > sky.letterW && x < W && y > top && y < bottom) continue;
    const label = `↑ ${byId.get(id)?.name ?? ''}`;
    const tw = ctx.measureText(label).width;
    const lx = Math.max(sky.letterW + 6, Math.min(W - tw - 10, x - tw / 2));
    const ly = Math.max(top + 18, Math.min(bottom - 10, y));
    out.push({ x: lx - 5, y: ly - 13, w: tw + 10, h: 18 });
  }
  ctx.restore();
  return out;
}
