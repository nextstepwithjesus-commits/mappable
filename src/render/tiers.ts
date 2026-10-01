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
import { alpha, hexToRgb } from './color.ts';
import { hits } from './rect.ts';
import { contrast } from '../ui/contrast.ts';
import { byId, graph, loadCard, loadedCard, persons, type ChronoRow, type ModelData } from '../data/atlas.ts';
import { dateText, toAstro } from '../engine/years.ts';
import type { WhenSpan } from '../engine/chronology.ts';
import { nameCase, realmGenitive } from '../ui/text/ru.ts';
import { mapFont, mapSize, T_MAP_S, T_UI, T_UI_S } from './type.ts';

export type TierKey = 'epochs' | 'judges' | 'united' | 'judah' | 'israel' | 'prophets' | 'events';

/**
 * Имена ярусов царей — те же, что у групп «Сквозного раздела» и созвездий (этап 13, решение 110; src/ui/panels/Section.tsx,
 * KING_SETS): «Цари единого царства» — Саул, Иевосфей, Давид, Соломон; «Цари Иудеи» — от Ровоама; «Цари Израиля
 * (северного)».
 */
export const TIER_NAMES: Record<TierKey, string> = {
  epochs: 'Эпохи',
  judges: 'Судьи',
  united: 'Цари единого царства',
  judah: 'Цари Иудеи',
  israel: 'Цари Израиля (северного)',
  prophets: 'Пророки',
  events: 'События',
};

export interface TierBar {
  /** ключ отрезка: уникален среди всех ярусов */
  key: string;
  /** sync — штрих синхронизма, чей год лежит вне отрезка своего царя (решение 103): подсказка, щелчок — годы */
  kind: 'epoch' | 'person' | 'event' | 'sync';
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
  /** с кем совместно — id лица для каждого промежутка shared (тот же порядок) */
  sharedWith?: string[];
  /** начало единоличного царствования (астр.; reign.sole, решение 103): от t0 до sole — вместе с отцом */
  sole?: number;
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
  /**
   * Год синхронизма лежит в отрезке своего царя Y (решение 103): вертикаль между отрезками. Иначе — штрих у начала
   * отрезка Y с подсказкой note: «4 Цар 18:1: в 3-й год Осии (730 г. до Р. Х.); принятое начало — 715 г. до Р. Х.».
   */
  inside: boolean;
  note?: string;
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

/** Годы, в которые у отрезка есть соправитель в том же ярусе, и кто он. */
function markShared(bars: TierBar[]) {
  for (const a of bars)
    for (const b of bars) {
      if (a === b) continue;
      const lo = Math.max(a.t0, b.t0);
      const hi = Math.min(a.t1, b.t1);
      if (hi - lo >= 0.5) {
        a.shared.push([lo, hi]);
        (a.sharedWith ??= []).push(b.id);
      }
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

/** Что даёт карточка лица для годов деятельности: § 5 (положение), служения с годами (§ 16) и датированные события (§ 17). */
export interface MinistryCard {
  status?: { text: string; refs: string[] }[];
  offices?: { title?: string; from?: number; to?: number; refs: string[] }[];
  events?: { year?: number; age?: number; refs: string[] }[];
}

/** Слова Писания, которыми лицо названо пророком: «пророк», «пророчица», «прозорливец», «пророчествовал». */
const PROPHET_WORD = /пророк|пророчиц|прозорлив|пророчеств/i;

/**
 * Основание места в ярусе «Пророки» (MAP-48): стихи, где Писание называет лицо пророком, — из § 5 (положение) или
 * из служения § 16 с этим словом: Моисей — Втор 34:10; Аарон — Исх 7:1 («будет твоим пророком»); Мариам — Исх 15:20.
 * null — в карточке такого стиха нет.
 */
export function prophetBasis(card: MinistryCard | null): string[] | null {
  for (const f of [...(card?.status ?? []).map((s) => ({ t: s.text, refs: s.refs })), ...(card?.offices ?? []).map((o) => ({ t: o.title ?? '', refs: o.refs }))])
    if (PROPHET_WORD.test(f.t) && f.refs.length) return f.refs;
  return null;
}

/**
 * Годы пророка в ярусе «Пророки» (MAP-48): по порядку опор —
 *  1) годы служения из данных (active);
 *  2) служения с годами в карточке (§ 16): если среди них есть служение, названное пророческим, — только оно (Аарон —
 *     «уста и пророк Моисея перед фараоном», 1446 г. до Р. Х., а не годы первосвященства); иначе все (Моисей — вождь
 *     при Исходе и в пустыне, 1446–1406 гг. до Р. Х.);
 *  3) датированные события жизни (§ 17) у лица с годами по числам текста: Енох, Авраам;
 *  4) у лица «время не установлено» — скобка засвидетельствованной деятельности или эпохи (решение 24), кроме скобки
 *     по годам созвездия: она не свидетельство.
 * Первая ссылка отрезка по опорам 2 и 3 — основание (prophetBasis): стих, где лицо названо пророком; его приводит подсказка.
 * card — тело карточки, если том уже загружен (иначе опоры 2 и 3 ждут загрузки).
 */
export function ministryOf(active: [number, number] | null, c: ChronoRow | undefined, card: MinistryCard | null): Ministry | null {
  if (active) return { t0: toAstro(active[0]), t1: Math.max(toAstro(active[1]), toAstro(active[0]) + 0.6), soft: false };
  if (!c) return null;
  const dated = c.cls === 'exact' || c.cls === 'calculated';
  const basis = prophetBasis(card);
  const withBasis = (refs: string[]) => (basis ? [...new Set([...basis, ...refs])] : refs);
  const all = (card?.offices ?? []).filter((o) => o.from !== undefined && o.to !== undefined);
  const prophetic = all.filter((o) => PROPHET_WORD.test(o.title ?? ''));
  const offices = prophetic.length ? prophetic : all;
  if (offices.length) {
    const t0 = Math.min(...offices.map((o) => toAstro(o.from!)));
    const t1 = Math.max(...offices.map((o) => toAstro(o.to!)));
    const one = offices.length === 1 && offices[0].title ? offices[0].title : null;
    return { t0, t1: Math.max(t1, t0 + 0.6), soft: false, refs: withBasis(offices.flatMap((o) => o.refs)), ...(one ? { note: one } : {}) };
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
        refs: withBasis(evs[0].refs),
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

/**
 * Подсказка синхронизма вне отрезка царя: «4 Цар 18:1: в 3-й год Осии — 730 г. до Р. Х.; принятое начало — 715 г. до Р. Х.,
 * см. § 24». Имя X — в родительном падеже, если склоняется, иначе — «в 3-й год царствования: Осия».
 */
function syncNote(s: { with: string; year: number; refs: string[]; note?: string }, xId: string, t: number, start: number): string {
  const x = byId.get(xId);
  const g = x ? nameCase(x.name, x.sex, 'gen') : null;
  // ссылка — как refLabel карточки: «4Цар 18:1» → «4 Цар 18:1»
  const ref = s.refs[0] ? `${s.refs[0].replace(/^([1-4])(\S)/, '$1 $2')}: ` : '';
  const year = g ? `в ${s.year}-й год ${g}` : `в ${s.year}-й год царствования ${x?.name ?? ''}`;
  return `${ref}${year} — ${dateText({ t })}; принятое начало — ${dateText({ t: start })}, см. § 24`;
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
  const united: TierBar[] = [];
  const judah: TierBar[] = [];
  const israel: TierBar[] = [];
  const prophets: TierBar[] = [];
  for (const p of persons) {
    p.reign.forEach((r, k) => {
      const b = bar({
        key: `r:${p.id}:${k}`, kind: 'person', id: p.id, label: p.name, t0: toAstro(r.start), t1: Math.max(toAstro(r.end), toAstro(r.start) + 0.6), soft: false,
        over: r.over, years: r.years, reign: k, ...(r.sole !== undefined && r.sole !== r.start ? { sole: toAstro(r.sole) } : {}),
      });
      // группы царей — как в «Сквозном разделе» (решение 110): единое царство — Саул, Иевосфей, Давид (и в Хевроне),
      // Соломон; Иудея — от Ровоама; Израиль — созвездие северных царей. Авимелех («Сихем и Израиль») — ни в одной
      if (r.over === 'Иудея') judah.push(b);
      else if ((/^(весь )?Израиль$/.test(r.over) || r.over === 'Иудея (в Хевроне)') && p.group !== 'israel-kings') united.push(b);
      else if (/Израил/.test(r.over) && p.group === 'israel-kings' && !p.roles.includes('judge')) israel.push(b);
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
  for (const b of [...united, ...judah, ...israel]) {
    b.shared = [];
    delete b.sharedWith;
  }
  markShared(united);
  markShared(judah);
  markShared(israel);
  // начало единоличного царствования (reign.sole, решение 103): от начала до него — вместе с отцом, даже если отрезка отца
  // в ярусе нет на эти годы
  for (const b of [...united, ...judah, ...israel]) {
    if (b.sole === undefined || b.sole - b.t0 < 0.5) continue;
    if (b.shared.some(([lo, hi]) => lo <= b.t0 + 0.5 && hi >= b.sole! - 0.5)) continue;
    const father = (graph.parentsOf.get(b.id) ?? []).find((e) => e.kind === 'father')?.parent;
    b.shared.push([b.t0, b.sole]);
    (b.sharedWith ??= []).push(father ?? '');
  }
  const tiers: Tier[] = [
    { key: 'epochs', name: TIER_NAMES.epochs, bars: ep },
    { key: 'judges', name: TIER_NAMES.judges, bars: packRows(judges) },
    { key: 'united', name: TIER_NAMES.united, bars: packRows(united) },
    { key: 'judah', name: TIER_NAMES.judah, bars: packRows(judah) },
    { key: 'israel', name: TIER_NAMES.israel, bars: packRows(israel) },
    { key: 'prophets', name: TIER_NAMES.prophets, bars: packRows(prophets) },
    { key: 'events', name: TIER_NAMES.events, bars: events },
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
        const t = at(to);
        // вертикаль — только внутри отрезка своего царя (решение 103; X1 Б2): год синхронизма вне его отрезка — штрих
        // у начала отрезка и подсказка с годом текста и принятым началом
        // расхождение на год — обычный счёт лет царствования (год воцарения или первый полный год): вертикаль
        const inside = t >= from.t0 - 1.01 && t <= from.t1 + 0.5;
        syncs.push({ from: from.key, to: to.key, t, refs: s.refs, inside, ...(inside ? {} : { note: syncNote(s, to.id, t, from.sole ?? from.t0) }) });
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

/** Формула столбца: слева — рождение, справа — смерть. null — опоры нет. */
export interface ColumnFormula {
  birth: string | null;
  death: string | null;
  /** опоры формулы — лица, названные в ней (для проверок: одни родители и дети опорой не бывают) */
  anchors?: string[];
}

/**
 * Царствования — опоры формулы (этап 13, решение 100): годы по числам текста и реконструкции Тиле — Янга. Порядок —
 * приоритет земли: Иудея, единое царство, северный Израиль, Вавилон.
 */
interface ReignRef {
  id: string;
  over: string;
  t0: number;
  t1: number;
  rank: number;
}
let reignsCache: ReignRef[] | null = null;
function reigns(): ReignRef[] {
  if (!reignsCache) {
    const rank = (over: string, group: string) =>
      over === 'Иудея' ? 0 : /^(весь )?Израиль$|^Иудея \(в Хевроне\)$/.test(over) && group !== 'israel-kings' ? 1 : /Израил/.test(over) && group === 'israel-kings' ? 2 : over === 'Вавилон' ? 3 : -1;
    reignsCache = persons
      .flatMap((p) => p.reign.map((r) => ({ id: p.id, over: r.over, t0: toAstro(r.start), t1: toAstro(r.end), rank: rank(r.over, p.group) })))
      .filter((r) => r.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.t0 - b.t0);
  }
  return reignsCache;
}
/**
 * Правитель, в чьё царствование целиком лёг промежуток [a, b] (астр.): «в царствование Иоаса, царя Иудеи». Сначала земля
 * своего царствования лица (если он сам царь), затем Иудея, единое царство, Израиль. Себя и соправителей своего
 * царствования опорой не берёт. null — такого царствования нет или имя не склоняется.
 */
function reignAnchor(id: string, a: number, b: number): string | null {
  const own = reigns().filter((r) => r.id === id);
  const ownRank = own.length ? Math.min(...own.map((r) => r.rank)) : -1;
  const cands = reigns()
    .filter((r) => r.id !== id && r.t0 <= a && b <= r.t1 + 0.5)
    // соправитель: его царствование перекрывает своё царствование лица — не опора
    .filter((r) => !own.some((o) => r.t0 < o.t1 && o.t0 < r.t1))
    .sort((x, y) => (x.rank === ownRank ? -1 : 0) - (y.rank === ownRank ? -1 : 0) || x.rank - y.rank || x.t0 - y.t0);
  for (const r of cands) {
    const q = byId.get(r.id);
    if (!q || q.unnamed) continue;
    const g = nameCase(q.name, q.sex, 'gen');
    const realm = realmGenitive(r.over);
    if (g && realm) return `в царствование ${g}, ${q.sex === 'f' ? 'царицы' : 'царя'} ${realm}`;
  }
  return null;
}

/**
 * Формула относительной хронологии для краёв столбца выбранного лица (ТЗ § 3.5, § 3.6; MAP-48; этап 13, решение 100):
 * «Моисей родился после рождения Аарона и до рождения Гирсама»; «Озия родился в царствование Иоаса, царя Иудеи».
 * Формула опирается на лицо, чей год вычислен по числам текста (точные и расчётные даты), — брата, сестру, супруга или
 * правителя. Одни родители и дети опорой не бывают: «Адам родился до рождения Сифа», «Мария родилась до рождения Иисуса
 * Христа» — это сказано самим родством, а не временем; такой формулы нет (X2 Д4 п. 3). Родитель или ребёнок только
 * дополняют формулу до двусторонней. Если родни-опоры нет — правитель, в чьё царствование целиком лёг промежуток
 * рождения (смерти). Без пар, о которых говорит хронологическое напряжение. Имя — только в родительном падеже, который
 * умеет строить склонение (nameCase); не склоняется — опора не берётся. У лица с оценочной датой сравнивается весь
 * промежуток: «после» — только если родня родилась раньше его начала.
 */
export function columnFormula(id: string, m: Pick<ModelData, 'chrono' | 'tensions'>): ColumnFormula {
  const p = byId.get(id);
  const me = m.chrono.get(id);
  if (!p || !me || p.kind !== 'person' || me.cls === 'epochal' || me.named) return { birth: null, death: null };
  const sure = (c: ChronoRow) => c.cls === 'exact' || c.cls === 'calculated';
  // у точных и расчётных дат — год, у оценочных — промежуток
  const bSpan = (c: ChronoRow): [number, number] => (sure(c) ? [c.b, c.b] : [c.bLo, c.bHi]);
  const dSpan = (c: ChronoRow): [number, number] | null => (c.d === null ? null : sure(c) ? [c.d, c.d] : [c.dLo ?? c.d, c.dHi ?? c.d]);
  const gen = (x: string) => {
    const q = byId.get(x);
    return q && !q.unnamed ? nameCase(q.name, q.sex, 'gen') : null;
  };
  // родители и дети: порядок их рождения задан самим родством — одни они формулу не образуют
  const parents = new Set((graph.parentsOf.get(id) ?? []).filter(plain).map((e) => e.parent));
  const kids = new Set((graph.childrenOf.get(id) ?? []).filter(plain).map((e) => e.child));
  const trivial = (x: string) => parents.has(x) || kids.has(x);
  // связи, о которых говорит хронологическое напряжение, опорой не бывают: пара из двух лиц («Вооз — Руфь») и звенья
  // поколений цепочки (одна запись на трудность — «430 лет в Египте»: Левий — Кааф — Амрам — Моисей). Брат из той же
  // цепочки — опора: порядок Аарона и Моисея сказан текстом (Исх 7:7)
  const tense = new Set(
    m.tensions
      .filter((t) => t.persons.includes(id))
      .flatMap((t) => (t.persons.length <= 2 ? t.persons : t.persons.filter((x) => trivial(x)))),
  );
  // тёзки среди родни (Седекия — брат Иоакима и Седекия — его сын, 1 Пар 3:15–16): имя без уточнения было бы двусмысленным
  // (решение 106) — такие опорой не берутся
  const family = [...relatives(id)];
  const same = (x: string) => {
    const n = byId.get(x)?.name;
    return family.filter((y) => byId.get(y)?.name === n).length > 1;
  };
  const rel = family
    .filter((x) => !tense.has(x) && !same(x))
    .map((x) => ({ id: x, c: m.chrono.get(x), g: gen(x) }))
    .filter((r): r is { id: string; c: ChronoRow; g: string } => !!r.c && sure(r.c) && !r.c.named && byId.get(r.id)?.kind === 'person' && r.g !== null);
  const [b0, b1] = bSpan(me);
  // родитель и ребёнок — опора порядком родства, если надёжно датированной родни с этой стороны нет
  const kin = (edges: readonly { parent: string; child: string; kind: string; cert: string; claim: string }[], who: 'parent' | 'child') =>
    edges
      .filter(plain)
      .map((e) => e[who])
      .filter((x) => !tense.has(x) && !same(x) && byId.get(x)?.kind === 'person')
      .map((x) => ({ id: x, c: m.chrono.get(x), g: gen(x) }))
      .filter((r): r is { id: string; c: ChronoRow; g: string } => !!r.c && r.c.cls !== 'epochal' && !r.c.named && r.g !== null);
  const sureBefore = rel.filter((r) => r.c.b < b0).sort((a, b) => b.c.b - a.c.b)[0];
  const sureAfter = rel.filter((r) => r.c.b > b1).sort((a, b) => a.c.b - b.c.b)[0];
  // родство дополняет формулу до двусторонней, но не строит её одно: «Давид родился до рождения Амнона» ничего не
  // говорит о времени Давида
  const before = sureBefore ?? (sureAfter ? kin(graph.parentsOf.get(id) ?? [], 'parent').filter((r) => r.c.b < me.b).sort((a, b) => b.c.b - a.c.b)[0] : undefined);
  const after = sureAfter ?? (sureBefore ? kin(graph.childrenOf.get(id) ?? [], 'child').filter((r) => r.c.b > me.b).sort((a, b) => a.c.b - b.c.b)[0] : undefined);
  const f = p.sex === 'f';
  const born = f ? 'родилась' : 'родился';
  const anchoredB = (before && !trivial(before.id)) || (after && !trivial(after.id));
  let birth: string | null = null;
  const anchors: string[] = [];
  if (anchoredB) {
    birth = `${p.name} ${born} ${before ? `после рождения ${before.g}` : ''}${before && after ? ' и ' : ''}${after ? `до рождения ${after.g}` : ''}`;
    anchors.push(...[before?.id, after?.id].filter((x): x is string => !!x));
  }
  else {
    const r = reignAnchor(id, b0, b1);
    if (r) birth = `${p.name} ${born} ${r}`;
  }
  let death: string | null = null;
  const md = dSpan(me);
  if (md) {
    const died = rel.filter((r) => r.c.d !== null && r.c.d < md[0]).sort((a, b) => b.c.d! - a.c.d!)[0];
    const alive = rel.filter((r) => r.c.b < md[0] && r.c.d !== null && r.c.d > md[1]).sort((a, b) => a.c.d! - b.c.d!)[0];
    const anchoredD = (died && !trivial(died.id)) || (alive && !trivial(alive.id));
    const dies = f ? 'умерла' : 'умер';
    if (anchoredD) {
      death = `${dies} ${died ? `после смерти ${died.g}` : ''}${died && alive ? ', ' : ''}${alive ? `при жизни ${alive.g}` : ''}`;
      anchors.push(...[died?.id, alive?.id].filter((x): x is string => !!x));
    }
    else if (!p.reign.some((r) => toAstro(r.end) >= md[0] - 1)) {
      // царь, умерший на престоле, опоры не получает: его отрезок в ярусе и есть время смерти
      const r = reignAnchor(id, md[0], md[1]);
      if (r) death = `${dies} ${r}`;
    }
  }
  return { birth, death, ...(anchors.length ? { anchors: [...new Set(anchors)] } : {}) };
}

// ---------- столбец жизни выбранного лица (ТЗ § 3.5; VIS-64, MAP-48; решение 53) ----------

/**
 * Годы столбца (астр.): ядро [core0, core1] — надёжная часть жизни (рождение не позже bHi, жизнь не короче dLo или
 * последнего засвидетельствованного года), края [lo, core0] и [core1, hi] — неопределённость рождения и смерти
 * (без данных о смерти — до оценки dEst).
 */
export function columnSpan(c: ChronoRow): { lo: number; core0: number; core1: number; hi: number } {
  const core0 = c.bHi;
  const core1 = Math.max(core0, c.d !== null ? (c.dLo ?? c.d) : (c.last ?? c.b));
  const hi = Math.max(core1, c.d !== null ? (c.dHi ?? c.d) : c.dEst);
  return { lo: Math.min(c.bLo, core0), core0, core1, hi };
}

/** Столбец в ярусах отличается от неба так (VIS-64): тон виден, но небо не перекрашено. */
export const COLUMN_CONTRAST = 1.12;

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
/** Цвет a, на долю k покрытый цветом b (как заливка b с прозрачностью k поверх a), — #rrggbb. */
export function over(a: string, b: string, k: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${[0, 1, 2].map((i) => hex2(A[i] + (B[i] - A[i]) * k)).join('')}`;
}
/** Доля k цвета ink поверх sky, при которой заливка отличается от неба на target : 1. */
export function tintFor(sky: string, ink: string, target = COLUMN_CONTRAST): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const k = (lo + hi) / 2;
    if (contrast(over(sky, ink, k), sky) < target) lo = k;
    else hi = k;
  }
  return lo;
}

// ---------- раскладка по окну ----------

/** Ярусы начинаются под линейкой и служебной строкой рамки (C4), не закрывая их. */
export const TIER_TOP = FRAME_H + 4;
/**
 * Верх первого яруса сейчас (этап 14, решение 155): под рамкой — на низком небе она одной строкой (frame.ts, setLowFrame),
 * и ярусы встают выше на высоту служебной строки. TIER_TOP — то же для обычной рамки.
 */
export const tierTop = () => FRAME_H + 4;
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
  /** Ярусы свёрнуты в заголовок (низкое окно, решение 123): сколько ярусов не показано. */
  header?: number;
  /**
   * Мелкие строки (обзор) на узком небе и сенсорном экране: длинные названия ярусов — тоже в две строки (ярус не ниже
   * TWO_LINE_H), иначе название легло бы на отрезки половины неба. На широком небе в мелких строках название — одной
   * строкой на подложке поверх начала отрезков; в обычных строках — всегда в две строки. Колонка названий — NAME_COL.
   */
  wrap?: boolean;
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

function layoutTiers(tiers: Tier[], t0: number, t1: number, model: string, top: number, q: Squeeze, wrap = false): TierPlan {
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
        : Math.max(TWO_LINE.has(tier.key) && (pitch === PITCH || wrap) ? (pitch === PITCH ? 2 * PITCH : TWO_LINE_H) : pitch === PITCH ? 0 : COLLAPSED_H, rows.length * pitch + (capped ? CAPPED_H : 0));
    blocks.push({ tier, y, h, rows, collapsed, pitch });
    y += h + q.gap;
  }
  return { model, t0, t1, blocks, bottom: y - q.gap + PAD, maxH: Infinity, wrap };
}

/**
 * Раскладка ярусов для окна лет [t0, t1]: высота каждого — по строкам его видимых отрезков; пустой — свёрнут.
 * compact — мелкий масштаб: строки по 5 px без подписей, события — одной строкой подписей (эпохи — как обычно).
 * maxH — сколько неба ярусам можно занять от нижней кромки рамки (H7; MOB-24). Если они не помещаются, они ужимаются
 * по шагам, пока не поместятся: без пустых ярусов; не больше двух строк, затем одной; события одной строкой; мелкие
 * строки; без зазоров; в последнюю очередь уходят ярусы, у которых в окне меньше всего отрезков.
 */
export function planTiers(tiers: Tier[], t0: number, t1: number, model = '', top = tierTop(), compact = false, maxH = Infinity, wrap = false): TierPlan {
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
  let p = layoutTiers(tiers, t0, t1, model, top, steps[0], wrap);
  for (let i = 1; i < steps.length && p.bottom - FRAME_H > maxH; i++) p = layoutTiers(tiers, t0, t1, model, top, steps[i], wrap);
  p.maxH = maxH;
  return p;
}

/** Доля видимого неба, которую могут занять ярусы (H7; MOB-24: на телефоне ярусы вытесняли небо целиком). */
export const TIERS_SHARE = 0.35;
/** Ниже такой высоты видимого неба (лист карточки поднят) ярусы — в самом сжатом виде, чтобы небу осталось место. */
const ROOM_MIN = 160;
/** Названия ярусов — в две строки: на узком небе и на сенсорном экране колонка названий остаётся узкой. */
const wrapNames = (sky: Sky) => sky.coarse || sky.cam.w < 720;
/**
 * Низкое окно (альбомный телефон, масштаб 200 %): ярусы эпох свёрнуты в заголовок — одну строку эпох с подписью
 * «ярусы свёрнуты: окно низкое» (этап 13, решение 123). Небу остаётся место.
 */
export const LOW_SKY = 420;
export const lowSky = (h: number) => h > 0 && h < LOW_SKY;

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
  const low = lowSky(sky.cam.h);
  const all = buildTiers(m);
  const next = planTiers(low ? all.filter((t) => t.key === 'epochs') : all, a, b, m.id, tierTop(), compactAt(((vp.r - vp.l) * 1.2) / Math.max(1, b - a)), low ? Infinity : tiersBudget(vp.b), wrapNames(sky));
  if (low) next.header = all.length - 1;
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
/**
 * Заливка оценочного отрезка с растушёванными краями (решение 90 в ярусах; X2 § 2.8): у видимого края тон тает к нулю
 * на 12 px (не больше четверти отрезка). l, r — край отрезка в окне (иначе он за краем, и там заливка ровная).
 */
function featherFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, l: boolean, r: boolean) {
  if (w <= 0) return;
  const f = Math.min(12, w / 4);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, alpha(color, l ? 0 : 1));
  g.addColorStop(Math.min(0.5, f / w), alpha(color, 1));
  g.addColorStop(Math.max(0.5, 1 - f / w), alpha(color, 1));
  g.addColorStop(1, alpha(color, r ? 0 : 1));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Слово штриховки: соправитель — отец или сын, иначе — «одновременно» (соперники Менаим и Факей). */
export function hatchWord(id: string, other: string | undefined): string {
  if (other && (graph.parentsOf.get(id) ?? []).some((e) => e.parent === other && e.kind === 'father')) return 'вместе с отцом';
  if (other && (graph.parentsOf.get(other) ?? []).some((e) => e.parent === id && e.kind === 'father')) return 'вместе с сыном';
  return 'одновременно';
}

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

/** Столбец выбранного лица на экране, px (columnSpan). */
interface ColumnPx {
  lo: number;
  core0: number;
  core1: number;
  hi: number;
}
function columnPx(sky: Sky, c: ChronoRow): ColumnPx {
  const y = columnSpan(c);
  const x = (t: number) => sky.cam.sx(sky.xOf(t));
  const lo = x(y.lo);
  const core0 = Math.max(lo, x(y.core0));
  const core1 = Math.max(core0, x(y.core1));
  return { lo, core0, core1, hi: Math.max(core1, x(y.hi), lo + 1) };
}
const tints = new Map<string, number>();
/** Доля тона столбца для пары цветов темы (tintFor), с памятью: палитра меняется только со сменой темы. */
function tintOf(sky: string, ink: string): number {
  const key = `${sky}|${ink}`;
  let k = tints.get(key);
  if (k === undefined) {
    k = tintFor(sky, ink);
    tints.set(key, k);
  }
  return k;
}
/**
 * Заливка столбца по x: в ярусах — ядро тоном k и растушёванные к нулю края; на небе (feathers) — только края: от k у черты
 * ядра к нулю наружу, ядро не закрашено (решение 53).
 */
function columnGradient(ctx: CanvasRenderingContext2D, ink: string, k: number, c: ColumnPx, feathers: boolean): CanvasGradient {
  const g = ctx.createLinearGradient(c.lo, 0, c.hi, 0);
  const span = c.hi - c.lo;
  const p0 = Math.min(1, Math.max(0, (c.core0 - c.lo) / span));
  const p1 = Math.min(1, Math.max(p0, (c.core1 - c.lo) / span));
  const t = (a: number) => alpha(ink, a);
  g.addColorStop(0, t(p0 > 0 ? 0 : feathers ? 0 : k));
  g.addColorStop(p0, t(k));
  if (feathers) {
    g.addColorStop(p0, t(0));
    g.addColorStop(p1, t(0));
  }
  g.addColorStop(p1, t(k));
  g.addColorStop(1, t(p1 < 1 ? 0 : feathers ? 0 : k));
  return g;
}

/**
 * Название яруса строками колонки: длинное («Цари Израиля (северного)», «Цари единого царства») — в две строки по словам
 * (этап 13, решение 110: имена групп царей те же, что в «Сквозном разделе»).
 */
export function nameLines(ctx: CanvasRenderingContext2D, name: string, width: number): string[] {
  if (ctx.measureText(name).width <= width) return [name];
  const words = name.split(' ');
  let best: string[] = [name];
  let bestW = Infinity;
  for (let k = 1; k < words.length; k++) {
    const l = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
    const w = Math.max(...l.map((t) => ctx.measureText(t).width));
    if (w < bestW) {
      bestW = w;
      best = l;
    }
  }
  return best;
}
/**
 * Ярусы, чьё название в колонке — в две строки: у них не меньше двух строк высоты (layoutTiers), в мелких строках —
 * TWO_LINE_H: название не ложится на отрезки.
 */
export const TWO_LINE: ReadonlySet<TierKey> = new Set(['united', 'israel']);
export const TWO_LINE_H = 26;
/** Ширина колонки названий: 88 px, а на сенсорном экране — не уже самой длинной строки названия с полями. */
function nameColumn(ctx: CanvasRenderingContext2D, tiers: readonly Tier[], font: string, wrap: boolean): number {
  ctx.font = font;
  const lines = tiers.flatMap((t) => (wrap ? nameLines(ctx, t.name, NAME_COL - 9) : [t.name]));
  return Math.max(NAME_COL, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + 9));
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
  const budgetNow = lowSky(cam.h) ? Infinity : tiersBudget(cam.vp.b);
  if (plan && plan.model === s.model.id && (lowSky(cam.h) !== !!plan.header || (!plan.header && Math.abs(plan.maxH - budgetNow) > 4))) {
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
  const colR = LW + nameColumn(ctx, p.blocks.map((b) => b.tier), nameFont, true);
  const x0Of = (b: TierBar) => cam.sx(sky.xOf(b.t0));
  const x1Of = (b: TierBar) => cam.sx(sky.xOf(b.t1));
  const inSelOf = (b: TierBar) => (sel ? b.t1 >= sel.bLo && b.t0 <= (sel.d ?? sel.dEst) : false);

  // ---------- столбец выбранного лица (решение 53; VIS-64): заливка — только в ярусах, 1,12 : 1, под отрезками ----------
  const col = sel && selP ? columnPx(sky, sel) : null;
  const kCol = tintOf(pal.sky, pal.ink3);
  /** Доля тона столбца в точке x: ядро — kCol, края — растушёвка к нулю. */
  const colAlpha = (x: number) => {
    if (!col || x < col.lo || x > col.hi) return 0;
    if (x < col.core0) return col.core0 > col.lo ? (kCol * (x - col.lo)) / (col.core0 - col.lo) : kCol;
    if (x <= col.core1) return kCol;
    return col.hi > col.core1 ? (kCol * (col.hi - x)) / (col.hi - col.core1) : kCol;
  };
  const colPaint = col ? columnGradient(ctx, pal.ink3, kCol, col, false) : null;
  /** Закрасить часть прямоугольника, что лежит в столбце: весь ярус — сразу, подложки подписей — после них. */
  const paintColumn = (x: number, y: number, w: number, h: number) => {
    if (!col || !colPaint) return;
    const a = Math.max(x, col.lo);
    const z = Math.min(x + w, col.hi);
    if (z <= a) return;
    ctx.fillStyle = colPaint;
    ctx.fillRect(a, y, z - a, h);
  };
  paintColumn(0, FRAME_H, W, bottom - FRAME_H);

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
  // вертикаль — только если год лежит в отрезке своего царя (решение 103); иначе — штрих у начала его отрезка
  // (рисуется поверх отрезков, ниже) с подсказкой: год текста и принятое начало
  let syncCount = 0;
  const syncTicks: { g: Geo; sy: TierSync }[] = [];
  ctx.strokeStyle = pal.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const sy of buildSyncs(s.model)) {
    const g1 = geoByKey.get(sy.from);
    const g2 = geoByKey.get(sy.to);
    if (!g1 || g1.di === undefined || g1.blk.pitch < PITCH) continue;
    if (!sy.inside) {
      syncTicks.push({ g: g1, sy });
      continue;
    }
    if (!g2 || g2.di === undefined || g2.blk.pitch < PITCH) continue;
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
  let hatchCaptions = 0;
  let syncOut = 0;
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
      } else if (b.soft) {
        // оценочные границы (судьи, завоевание): края растушёваны — решение 90 и в ярусах (X2 § 2.8), без пунктира
        featherFill(ctx, a, y, wBar, bh, inSel || hot ? fillSel : fill, g.x0 >= colR, g.x1 <= W);
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
      // подложка подписи на небе яруса — цвета неба, а в столбце выбранного лица — с его тоном (VIS-64)
      if (at.where === 'outside') {
        // подпись на небе — на его подложке: вертикали синхронизмов под ней не проходят
        ctx.fillStyle = pal.sky;
        ctx.fillRect(at.x - 2, y, tw + 4, BAR_H);
        paintColumn(at.x - 2, y, tw + 4, BAR_H);
      } else if (at.where === 'spill') {
        ctx.fillStyle = pal.sky;
        ctx.fillRect(at.x - 2, y, tw + 4, BAR_H);
        paintColumn(at.x - 2, y, tw + 4, BAR_H);
        // подпись — к своему отрезку: хит-зона продолжается на неё
        hitRects.push({ x: at.x - 2, y, w: tw + 4, h: BAR_H, bar: b, tier: tier.key });
      } else if (at.where === 'inside' && !b.bracket && b.shared.length) {
        // под подписью внутри отрезка — его тон без штриховки: имя читается и на совместном правлении
        ctx.fillStyle = inSel || hot ? fillSel : fill;
        ctx.fillRect(at.x - 2, y + 1, tw + 4, BAR_H - 2);
      } else if (at.where === 'inside' && b.bracket) {
        ctx.fillStyle = pal.sky;
        ctx.fillRect(at.x - 2, y + 1, tw + 4, BAR_H - 2);
        paintColumn(at.x - 2, y + 1, tw + 4, BAR_H - 2);
      }
      ctx.fillStyle = inSel || hot ? pal.ink : pal.ink2;
      ctx.fillText(b.label, at.x, y + BAR_H - 2.5);
      labeledIds.add(b.id);
    }
    // подпись штриховки — прямо в ярусе (решение 103; X2 Д9): «вместе с отцом», «вместе с сыном», «одновременно» —
    // на заштрихованном промежутке, если он шире подписи и не занят именем отрезка
    if (!compact && !blk.collapsed)
      for (const g of mine) {
        const { b, a, z, y } = g;
        if (b.bracket || !b.shared.length || g.di === undefined) continue;
        const at = labelAt.get(b.key);
        const nameBox = at ? [at.x - 4, at.x + ctx.measureText(b.label).width + 4] : null;
        b.shared.forEach(([s0, s1], k) => {
          const h0 = Math.max(a, cam.sx(sky.xOf(s0)));
          const h1 = Math.min(z, cam.sx(sky.xOf(s1)));
          const text = hatchWord(b.id, b.sharedWith?.[k]);
          const tw = ctx.measureText(text).width;
          // посередине штриховки; имя отрезка на ней — подпись правее имени, если помещается
          let x = h0 + (h1 - h0 - tw) / 2;
          if (nameBox && x < nameBox[1] && nameBox[0] < x + tw) x = Math.max(h0 + 5, nameBox[1] + 4);
          if (x < h0 + 4 || x + tw > h1 - 4) return;
          if (nameBox && x < nameBox[1] && nameBox[0] < x + tw) return;
          ctx.fillStyle = inSelOf(b) || tierHot.key === b.key ? fillSel : fill;
          ctx.fillRect(x - 3, y + 1, tw + 6, BAR_H - 2);
          ctx.fillStyle = pal.ink3;
          ctx.fillText(text, x, y + BAR_H - 2.5);
          hatchCaptions++;
        });
      }
  }

  // ---------- штрихи синхронизмов вне отрезка своего царя (решение 103): у начала отрезка, с подсказкой ----------
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  for (const { g, sy } of syncTicks) {
    const x = Math.round(g.x0) + 0.5;
    if (x < colR + 1 || x > W) continue;
    ctx.beginPath();
    ctx.moveTo(x, g.y - 3);
    ctx.lineTo(x, g.y + g.bh + 3);
    ctx.stroke();
    const t0 = Math.min(sy.t, g.b.t0);
    hitRects.push({ x: x - 4, y: g.y - 3, w: 8, h: g.bh + 6, tier: g.tier, bar: { key: `sy:${sy.from}:${sy.to}`, kind: 'sync', id: g.b.id, label: sy.note ?? '', t0, t1: Math.max(sy.t, g.b.t0), soft: false, row: g.b.row, shared: [], refs: sy.refs } });
    syncOut++;
  }
  ctx.lineWidth = 1;

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
      // ореол — цвета неба под подписью: в столбце выбранного лица — с его тоном (VIS-64)
      const k = colAlpha(x + 4 + tw / 2);
      ctx.strokeStyle = k > 0 ? over(pal.halo, pal.ink3, k) : pal.halo;
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
  // в ярусах столбец уже закрашен (paintColumn) — под отрезками и подписями, без черт: черта не пересекает название.
  // На небе (решение 53) — только две черты 1 px по краям ядра и растушёвка краёв неопределённости; черты обрываются
  // у подписей неба
  let formula: ColumnFormula | null = null;
  let core: [number, number] | null = null;
  let lines: number[] = [];
  let cuts = 0;
  if (col && sel && selP) {
    const y0 = bottom + 1;
    const y1 = cam.vp.b;
    if (y1 > y0) {
      ctx.fillStyle = columnGradient(ctx, pal.ink3, kCol, col, true);
      ctx.fillRect(Math.max(LW, col.lo), y0, Math.max(0, col.hi - Math.max(LW, col.lo)), y1 - y0);
      lines = [...new Set([Math.round(col.core0) + 0.5, Math.round(col.core1) + 0.5])].filter((x) => x >= LW && x <= W);
      const boxes = sky.ledger.boxes;
      ctx.strokeStyle = pal.ruleStrong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of lines) {
        // промежутки черты между подписями неба (с полем 2 px)
        const gaps = boxes
          .filter((r) => r.x - 1 < x && x < r.x + r.w + 1 && r.y + r.h > y0 && r.y < y1)
          .map((r) => [r.y - 2, r.y + r.h + 2] as [number, number])
          .sort((a, b) => a[0] - b[0]);
        cuts += gaps.length;
        let y = y0;
        for (const [a, b] of gaps) {
          if (a > y) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, a);
          }
          y = Math.max(y, b);
        }
        if (y < y1) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y1);
        }
      }
      ctx.stroke();
    }
    formula = columnFormula(s.selected!, s.model);
    core = [col.core0, col.core1];
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
  for (const blk of p.blocks) {
    const ls = nameLines(ctx, blk.tier.name, colR - LW - 9);
    // вторая строка — если ярус её вмещает; иначе название одной строкой уходит вправо над пустым ярусом, на подложке
    const two = ls.length > 1 && blk.h >= TWO_LINE_H;
    const step = blk.h >= 2 * PITCH ? PITCH - 2 : 12;
    if (two) ls.forEach((l, k) => ctx.fillText(l, LW + 6, blk.y + Math.min(PITCH, step + 2) / 2 + fs * 0.36 + k * step));
    else {
      const t = blk.tier.name;
      const yy = blk.y + Math.min(blk.h, PITCH) / 2 + fs * 0.36;
      const tw = ctx.measureText(t).width;
      if (LW + 6 + tw > colR - 3) {
        ctx.fillStyle = pal.sky;
        ctx.fillRect(colR, blk.y, LW + 6 + tw + 3 - colR, Math.min(blk.h, PITCH));
        ctx.fillStyle = pal.ink3;
      }
      ctx.fillText(t, LW + 6, yy);
    }
  }

  // ---------- ярусы свёрнуты в заголовок (низкое окно, решение 123): подпись у правого края строки эпох ----------
  if (p.header) {
    const blk = p.blocks[0];
    const text = 'ярусы свёрнуты: окно низкое';
    ctx.font = mapFont(T_MAP_S, { italic: true, coarse: sky.coarse });
    const tw = ctx.measureText(text).width;
    const x = W - tw - 8;
    if (blk && x > colR + 40) {
      ctx.fillStyle = pal.sky;
      ctx.fillRect(x - 4, blk.y, tw + 8, Math.min(blk.h, PITCH));
      ctx.fillStyle = pal.ink3;
      ctx.fillText(text, x, blk.y + Math.min(blk.h, PITCH) / 2 + fs * 0.36);
    }
    ctx.font = nameFont;
  }

  // ---------- формула на краях столбца (ТЗ § 3.5): рождение — у левого края ядра, смерть — у правого ----------
  const placedFormula = selP && core ? drawFormula(sky, s, selP.name, formula!, core, colR, bottom) : null;

  // для проверок приёмки (tools/accept/strip.ts): колонка, синхронизмы, события, пророки и подписанные отрезки в окне,
  // формула столбца, её место и то, что она обходит (указатели у края, органы неба)
  const state = JSON.stringify({
    col: Math.round(colR - LW),
    // свёрнуты в заголовок (низкое окно): сколько ярусов не показано
    header: p.header ?? 0,
    sync: syncCount,
    // штрихи синхронизмов вне отрезка своего царя и подписи штриховки (решение 103); места — для наведения в приёмке
    syncOut,
    hatch: hatchCaptions,
    ticks: hitRects.filter((h) => h.bar.kind === 'sync').map((h) => [Math.round(h.x + h.w / 2), Math.round(h.y + h.h / 2), h.bar.id]),
    selBar: (() => {
      const h = s.selected ? hitRects.find((r) => r.bar.kind === 'person' && r.bar.id === s.selected && r.bar.reign !== undefined) : null;
      return h ? [Math.round(h.x), Math.round(h.y), Math.round(h.w), Math.round(h.h)] : null;
    })(),
    events: [eventsDrawn, p.blocks.find((b) => b.tier.key === 'events')?.tier.bars.filter((b) => visibleIn(b, tL, tR)).length ?? 0],
    prophets: [...new Set(geos.filter((g) => g.tier === 'prophets').map((g) => g.b.id))],
    // первая ссылка отрезка пророка — основание, его стих приводит подсказка (MAP-48)
    basis: Object.fromEntries(geos.filter((g) => g.tier === 'prophets' && g.b.refs?.length).map((g) => [g.b.id, g.b.refs![0]])),
    labeled: [...labeledIds],
    formula: placedFormula,
    // столбец выбранного лица (VIS-64): контраст заливки к небу в ярусах, где она кончается (низ ярусов), черты на небе,
    // сколько раз они обрываются у подписей, ширина растушёвки краёв, px
    column: col
      ? {
          contrast: Math.round(contrast(over(pal.sky, pal.ink3, kCol), pal.sky) * 1000) / 1000,
          fill: [FRAME_H, bottom],
          lines: lines.map((x) => Math.round(x * 10) / 10),
          cuts,
          feather: [Math.round(col.core0 - col.lo), Math.round(col.hi - col.core1)],
        }
      : null,
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
  // строка шире неба справа от колонки названий — переносится по словам (этап 11, B1): на узком небе формула уходила за
  // правый край холста («Иаков родился после рождения Исаака и до рождения Иосифа» на 360 px)
  const room = Math.max(60, W - 6 - (colR + 6));
  const wrap = (t: string): string[] => {
    if (ctx.measureText(t).width <= room) return [t];
    const out: string[] = [];
    let cur = '';
    for (const word of t.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > room) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const ls = wrap(left);
  const rs = right ? wrap(right) : [];
  const wl = Math.max(...ls.map((t) => ctx.measureText(t).width));
  const wr = rs.length ? Math.max(...rs.map((t) => ctx.measureText(t).width)) : 0;
  const lx = Math.max(colR + 6, Math.min(W - wl - 6, core[0] + 6));
  // правая строка — у правого края ядра; не помещается рядом с левой (или перенесена) — на следующих строках
  let rx = right ? Math.max(colR + 6, Math.min(W - wr - 6, core[1] - 6 - wr)) : 0;
  let rRow = 0;
  if (right && (ls.length > 1 || rs.length > 1 || rx < lx + wl + 16)) {
    rRow = ls.length;
    if (rx < colR + 6) rx = lx;
  }
  const rows = right ? Math.max(ls.length, rRow + rs.length) : ls.length;
  // указатель «↑ Имя» у верхнего края и органы неба: блок формулы уходит ниже них
  const block = (y: number): Rect => ({ x: Math.min(lx, right ? rx : lx) - 3, y: y - lineH + 3, w: Math.max(lx + wl, right ? rx + wr : 0) - Math.min(lx, right ? rx : lx) + 6, h: lineH * rows + 2 });
  // и звезда самого выбранного лица: формула в несколько строк на узком небе не закрывает её (этап 11, B1)
  const avoid = [...pointerBoxes(sky, s), ...(s.reserve ?? []), ...selectedStar(sky, s)];
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
  ls.forEach((t, k) => text(t, lx, y + k * lineH, ctx.measureText(t).width));
  rs.forEach((t, k) => text(t, rx, y + (rRow + k) * lineH, ctx.measureText(t).width));
  return { text: right ? [left, right] : [left], rect: block(y), avoid };
}

/** Звезда выбранного лица в открытом небе — квадрат 24 × 24 px вокруг неё: формула столбца её не закрывает. */
function selectedStar(sky: Sky, s: SkyState): Rect[] {
  const i = s.selected ? sky.indexOf(s.selected) : undefined;
  if (i === undefined || !sky.drawn(i)) return [];
  const x = sky.cam.sx(sky.X0[i]);
  const y = sky.cam.sy(sky.nodes[i].lane);
  if (x < sky.letterW || x > sky.cam.w || y < sky.openTop || y > sky.cam.vp.b) return [];
  const r = 12;
  return [{ x: x - r, y: y - r, w: 2 * r, h: 2 * r }];
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
