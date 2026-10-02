/**
 * «Семья созвездием» — врезка семьи на небе (этап 16, решение 186). Чистый модуль: по графу и союзам строит семью лица
 * (родители, братья и сёстры, союзы с детьми, внуки числом) и раскладывает её во врезке без шкалы времени.
 *
 * Правила (docs/ui-review/STAGE16.md, решение 186; грамматика союзов — этап 15, решения 173–181):
 *  — направление времени сохранено: родители слева вверху, дети справа; кольцо 1 — супруги, кольцо 2 — дети, за ними —
 *    «пыль» внуков (по точке на каждого ребёнка сына — данные, не украшение);
 *  — супруги сверху вниз — по порядку союзов лица (src/engine/unions.ts: порядок брака, затем порядок данных), бездетные —
 *    в конце; дети в веере матери — по порядку рождения (год модели, при равенстве — порядок данных);
 *  — черта брака от лица к звезде супруги, вид союза — начертанием (решение 174): жена — двойная, наложница — одинарная,
 *    левират — двойная штрихом, брак не назван — тонкая; ромб — у звезды супруги, со стороны детей; дети — веером от ромба
 *    (решение 175); мать не названа — ромб с полой половиной жены;
 *  — цвет — ветвь выбранного лица (решение 69; ветви — src/engine/unions.ts, branchesOf, как на небе); сила огонька —
 *    величина звезды; родство словами Писания — золотистым (решение 89), без выведения родителей (П-8);
 *  — каждое лицо во врезке один раз: брак сына с супругой лица (Ир, Онан — Фамарь) — дугой и словом у имени сына.
 *
 * Модуль не знает об интерфейсе: годы, величины, линии Мессии и склонение приходят в FamDeps, ширину строки меряет
 * вызывающий (measure). Шрифты подписей — ключи FontKey, цвета — ключи Ink: тему и кегль решает отрисовка
 * (src/render/family-inset.ts).
 */
import type { Graph } from './graph.ts';
import { branchesOf, partnerIn, type Union, type Unions } from './unions.ts';
import { marriageKind, type MarriageKind } from './stays.ts';
import { parseRef, verseId } from './books.ts';

// ---------- семья ----------

export interface FamDeps {
  graph: Graph;
  unions: Unions;
  /** год рождения (астрономический) и умер ли младенцем; null — лица нет в модели */
  year: (id: string) => { b: number; infant: boolean } | null;
  /** величина звезды 0–6 (0 — ярчайшая) */
  magnitude: (id: string) => number;
  /** лицо на линии Иосифа (Мф 1) и Марии (Лк 3) */
  line: (id: string) => { mt: boolean; lk: boolean };
  /** имя в родительном падеже или null, если склонение ненадёжно (src/ui/text/ru.ts, nameCase) */
  gen: (id: string) => string | null;
  /** обратный термин родства: «брат» для сестры-мужчины и т. п. (src/ui/text/ru.ts, kinTermReverse) */
  kinReverse: (rel: string, sex: 'm' | 'f') => string | null;
}

export type FamRing = 'focal' | 'father' | 'mother' | 'sib' | 'half' | 'partner' | 'kid';

export interface FamNode {
  id: string;
  name: string;
  sex: 'm' | 'f';
  people: boolean;
  king: boolean;
  infant: boolean;
  mg: number;
  ring: FamRing;
  /** номер ветви выбранного лица (решение 69); нет — нейтральный цвет */
  branch?: number;
  /** сколько детей у лица (кровные отец или мать) — «пыль» внуков */
  grand: number;
  mt: boolean;
  lk: boolean;
}

export interface FamUnion {
  id: string;
  /** второе лицо союза (супруга или супруг); null — не названо */
  partner: string | null;
  kind: MarriageKind;
  refs: string[];
  /** дети по порядку рождения */
  kids: string[];
  branch: number | null;
  /** слова Писания о родстве с супругой (Сарра — «сестра», Быт 20:12; Фамарь — «невестка») */
  kin?: { word: string; ref: string };
}

export interface FamScene {
  focal: FamNode;
  nodes: Map<string, FamNode>;
  /** союз родителей (кровные отец и мать); claim — иное утверждение о происхождении у второго союза */
  parents: { father: FamNode | null; mother: FamNode | null; kind: MarriageKind; uid: string; up: string | null } | null;
  /** иные утверждения о родителях (по закону, по Луке…) — отцы без врезки их семьи */
  otherParents: { id: string; claim: string; cert: string; ref: string }[];
  sibs: FamNode[];
  /** братья и сёстры словами Писания без названных общих родителей (П-8): «сестра», 1 Пар 2:16 */
  kinSibs: { node: FamNode; word: string; ref: string }[];
  /** единокровные (по отцу) — группами по матерям */
  halves: { mother: string | null; motherName: string | null; kids: FamNode[] }[];
  unions: FamUnion[];
  /** браки детей с супругой лица: ребёнок → супруга, вид и стих */
  inner: { kid: string; wife: string; kind: MarriageKind; ref: string }[];
  /** все дети лица по порядку рождения, с ветвью — мини-шкала рождений */
  births: { id: string; b: number | null; branch: number | null }[];
  sons: number;
  daughters: string[];
}

const SIB_TERMS = /^(брат|сестра)$/;

/** Семья лица id по данным; null — у лица нет ни родителей, ни союзов (врезке нечего показать). */
export function familyScene(id: string, D: FamDeps): FamScene | null {
  const g = D.graph;
  const U = D.unions;
  const p = g.persons.get(id);
  if (!p) return null;
  const own = (U.of.get(id) ?? []).filter((u) => !u.claim || u.claim === 'legal');
  const origin = (U.origin.get(id) ?? []).find((u) => !u.claim || u.claim === 'legal');
  if (!own.length && !origin) return null;
  const nodes = new Map<string, FamNode>();
  const node = (x: string, ring: FamRing, extra: Partial<FamNode> = {}): FamNode => {
    const have = nodes.get(x);
    if (have) return have;
    const q = g.persons.get(x)!;
    const y = D.year(x);
    const ln = D.line(x);
    const n: FamNode = {
      id: x, name: q.name, sex: q.sex === 'f' ? 'f' : 'm', people: q.kind === 'people' || q.kind === 'clan',
      king: !!q.roles?.some((r) => r === 'king' || r === 'queen'), infant: !!y?.infant, mg: D.magnitude(x), ring,
      grand: (g.childrenOf.get(x) ?? []).filter((e) => e.kind === 'father' || e.kind === 'mother').length, mt: ln.mt, lk: ln.lk, ...extra,
    };
    nodes.set(x, n);
    return n;
  };
  const order = (a: string, b: string) =>
    (D.year(a)?.b ?? 0) - (D.year(b)?.b ?? 0) || (g.persons.get(a)?.order ?? 999) - (g.persons.get(b)?.order ?? 999) || g.order.indexOf(a) - g.order.indexOf(b);
  const focal = node(id, 'focal');
  // ветви — как на небе (решение 69): союзы, если союзов с детьми два и больше, иначе дети
  const br = branchesOf(U, g, id, 1);
  const unionBranch = new Map<string, number>();
  for (const b of br.desc.values()) if (b.gen === 1) unionBranch.set(b.union, unionBranch.get(b.union) ?? b.branch);
  const byUnion = own.filter((u) => !u.claim && u.kids.length).length > 1;
  const unions: FamUnion[] = [];
  // бездетные браки — в конце; порядок остальных — порядок союзов лица
  const ordered = [...own].sort((a, b) => (a.kids.length ? 0 : 1) - (b.kids.length ? 0 : 1));
  for (const u of ordered) {
    const partner = partnerIn(u, id);
    const kids = [...u.kids].sort(order);
    const branch = byUnion && kids.length ? (unionBranch.get(u.id) ?? null) : null;
    if (partner) node(partner, 'partner', branch === null ? {} : { branch });
    for (const k of kids) {
      const b = br.desc.get(k);
      node(k, 'kid', b ? { branch: b.branch } : {});
    }
    unions.push({ id: u.id, partner, kind: marriageKind(u), refs: u.refs, kids, branch });
  }
  // родители
  let parents: FamScene['parents'] = null;
  if (origin) {
    const father = origin.a ? node(origin.a, 'father') : null;
    const mother = origin.b ? node(origin.b, 'mother') : null;
    const up = origin.a ? ((U.origin.get(origin.a) ?? []).find((u) => !u.claim)?.a ?? null) : null;
    parents = { father, mother, kind: marriageKind(origin), uid: origin.id, up };
  }
  const otherParents: FamScene['otherParents'] = [];
  for (const e of g.parentsOf.get(id) ?? [])
    if ((e.kind === 'other-father' || e.kind === 'other-mother') && e.parent !== origin?.a && e.parent !== origin?.b)
      otherParents.push({ id: e.parent, claim: e.claim, cert: e.cert, ref: e.refs[0] ?? '' });
  // братья и сёстры из союза родителей; единокровные — другие союзы отца
  const sibs: FamNode[] = [];
  const halves: FamScene['halves'] = [];
  if (origin) {
    for (const k of [...origin.kids].sort(order)) if (k !== id && !nodes.has(k)) sibs.push(node(k, 'sib'));
    if (origin.a)
      for (const u of U.of.get(origin.a) ?? []) {
        if (u.id === origin.id || u.claim || !u.kids.length) continue;
        const kids = [...u.kids].sort(order).filter((k) => k !== id && !nodes.has(k)).map((k) => node(k, 'half'));
        if (kids.length) halves.push({ mother: u.b, motherName: u.b ? (g.persons.get(u.b)?.name ?? null) : null, kids });
      }
  }
  // родство словами Писания: братья и сёстры без общих родителей в данных; слова о супруге
  const kinSibs: FamScene['kinSibs'] = [];
  const kinWord = (other: string, e: { from: string; rel: string }) =>
    e.from === other ? e.rel : D.kinReverse(e.rel, g.persons.get(other)?.sex === 'f' ? 'f' : 'm');
  for (const e of g.kinOf.get(id) ?? []) {
    const other = e.from === id ? e.to : e.from;
    const word = kinWord(other, e);
    if (!word) continue;
    const u = unions.find((x) => x.partner === other);
    if (u) {
      if (!u.kin) u.kin = { word, ref: e.refs[0] ?? '' };
      continue;
    }
    if (nodes.has(other) || !SIB_TERMS.test(word)) continue;
    if (kinSibs.some((k) => k.node.id === other)) continue;
    kinSibs.push({ node: node(other, 'sib'), word, ref: e.refs[0] ?? '' });
  }
  // браки детей с супругой лица (Ир и Онан — Фамарь): во врезке лицо один раз, брак — дугой
  const inner: FamScene['inner'] = [];
  for (const u of unions)
    for (const k of u.kids)
      for (const s of g.spousesOf.get(k) ?? []) {
        const wife = s.a === k ? s.b : s.a;
        if (!unions.some((x) => x.partner === wife)) continue;
        const kind: MarriageKind = /левират|деверь|восстанови/i.test(s.note ?? '') || s.refs.some((r) => /Быт 38:8/.test(r)) ? 'levirate' : s.kind === 'concubine' ? 'concubine' : 'wife';
        inner.push({ kid: k, wife, kind, ref: s.refs[0] ?? '' });
      }
  const kidsAll = unions.flatMap((u) => u.kids);
  const daughters = kidsAll.filter((k) => g.persons.get(k)?.sex === 'f');
  const births = kidsAll.map((k) => ({ id: k, b: D.year(k)?.b ?? null, branch: nodes.get(k)?.branch ?? null }));
  return {
    focal, nodes, parents, otherParents, sibs, kinSibs, halves, unions, inner, births, sons: kidsAll.length - daughters.length, daughters,
  };
}

/** Все союзы лица и его родителей без иных утверждений — есть ли что показать во врезке. */
export function hasFamilyIn(id: string, U: Unions): boolean {
  return (U.of.get(id) ?? []).some((u) => !u.claim || u.claim === 'legal') || (U.origin.get(id) ?? []).some((u) => !u.claim || u.claim === 'legal');
}

// ---------- стих источника ----------

/**
 * Стих, где мать и её дети названы вместе (решение 186, карточка источника): из ссылок союза и ссылок родства детей —
 * стих с наибольшим счётом: имя ребёнка (любая его форма) — 2, имя матери — 5; при равенстве — стих главы для чтения
 * (readable: родословные главы панели «Главы»), затем раньше по канону. text — текст стиха («глава:стих» книги) или
 * undefined, если стиха нет в сборке. names — формы имён лица (основная и иные).
 */
export function sourceVerse(
  u: Pick<Union, 'refs' | 'kids'> & { mother: string | null },
  refsOf: (id: string) => readonly string[],
  names: (id: string) => readonly string[],
  text: (book: string, ch: number, v: number) => string | undefined,
  readable: (book: string, ch: number) => boolean = () => false,
): { ref: string; book: string; ch: number; text: string } | null {
  const stem = (w: string) => {
    const s = w.split(' ')[0];
    return s.length > 4 ? s.slice(0, Math.max(3, s.length - 2)) : s.slice(0, Math.max(2, s.length - 1));
  };
  const kidStems = u.kids.map((k) => names(k).filter((n) => /^[А-ЯЁ]/.test(n)).map(stem));
  const motherStems = u.mother ? names(u.mother).filter((n) => /^[А-ЯЁ]/.test(n)).map(stem) : [];
  const seen = new Set<string>();
  let best: { ref: string; book: string; ch: number; text: string; score: number; rd: boolean } | null = null;
  for (const r of [...u.refs, ...u.kids.flatMap((k) => refsOf(k))]) {
    const pr = parseRef(r);
    if (!pr) continue;
    for (const v of pr.verses.slice(0, 16)) {
      const key = verseId(v);
      if (seen.has(key)) continue;
      seen.add(key);
      const t = text(v.book, v.chapter, v.verse);
      if (!t) continue;
      let score = 0;
      for (const ss of kidStems) if (ss.some((s) => t.includes(s))) score += 2;
      if (motherStems.some((s) => t.includes(s))) score += 5;
      const rd = readable(v.book, v.chapter);
      if (!best || score > best.score || (score === best.score && rd && !best.rd)) best = { ref: `${v.book} ${v.chapter}:${v.verse}`, book: v.book, ch: v.chapter, text: t, score, rd };
    }
  }
  return best && best.score > 0 ? { ref: best.ref, book: best.book, ch: best.ch, text: best.text } : null;
}

/** Книги, стихи которых нужны для выбора стиха источника союза. */
export function sourceBooks(u: Pick<Union, 'refs' | 'kids'>, refsOf: (id: string) => readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of [...u.refs, ...u.kids.flatMap((k) => refsOf(k))]) {
    const pr = parseRef(r);
    if (pr) out.add(pr.book);
  }
  return [...out];
}

// ---------- раскладка ----------

/** Тона подписей и черт врезки: цвет несут только ветви (b0…) и ленты (ТЗ § 5.2) — золотого «родства» нет. */
export type Ink = 'ink' | 'ink2' | 'ink3' | `b${number}`;
export type FontKey = 'name' | 'kid' | 'kidStrong' | 'focal' | 'word' | 'small' | 'sib' | 'note';
export type LineStyle = 'double' | 'single' | 'dashdouble' | 'thin' | 'ray' | 'kin' | 'dotted' | 'mt' | 'lk';
export interface Run {
  s: string;
  font: FontKey;
  ink: Ink;
}
export interface Cand {
  x: number;
  y: number;
  align: 'left' | 'right' | 'center';
}
export type Prim =
  | { t: 'star'; id: string; x: number; y: number; r: number; sex: 'm' | 'f'; people: boolean; king: boolean; infant: boolean; ink: Ink | null; glow: number; sel?: boolean; a: number }
  | { t: 'line'; x0: number; y0: number; x1: number; y1: number; c1?: [number, number]; c2?: [number, number]; style: LineStyle; ink: Ink; w: number; a: number; off?: number; glow?: boolean; uid?: string; lead?: string; via?: [number, number][] }
  | { t: 'diamond'; uid: string; x: number; y: number; s: number; hollowWife: boolean; hollowAll: boolean; ring: boolean; a: number }
  | { t: 'label'; x: number; y: number; align: 'left' | 'right' | 'center'; runs: Run[]; sub?: Run[]; sub2?: Run[]; a: number; id?: string; cands?: Cand[]; at?: [number, number, number]; lead?: string; alt?: { runs: Run[]; sub?: Run[] } }
  | { t: 'dot'; x: number; y: number; r: number; ink: Ink; a: number };

export type Hit =
  | { kind: 'person'; id: string; x: number; y: number; r: number }
  | { kind: 'union'; uid: string; x: number; y: number; r: number }
  | { kind: 'dust'; id: string; x: number; y: number; w: number; h: number }
  | { kind: 'up'; id: string; x: number; y: number; w: number; h: number }
  | { kind: 'name'; id: string; x: number; y: number; w: number; h: number };

export interface Plot {
  prims: Prim[];
  hits: Hit[];
  /** порядок чтения для клавиатуры и диктора */
  order: { id: string; ring: FamRing; uid?: string }[];
  /** место лица, родителей, супруг и детей — для перехода и рамки фокуса */
  at: Map<string, { x: number; y: number; r: number }>;
  /** где врезке не хватило строк (прокрутка на телефоне) — нижний край раскладки */
  bottom: number;
}

export interface Geom {
  /** прямоугольник раскладки внутри врезки (без шапки и карточки источника) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** гребень телефона: лицо вверху слева, супруги и дети строками вниз */
  comb: boolean;
  /** кегль знаков: увеличение врезки (1,35 — широкий экран, 1,15 — телефон) */
  scale: number;
  /** ширина строки шрифта f, px */
  measure: (s: string, f: FontKey) => number;
  /** союз в фокусе: остальные бледнее */
  focus?: string | null;
  /** слова интерфейса — из src/ui/text/ru.ts (склонение) */
  words: {
    kind: (k: MarriageKind) => string;
    motherUnnamed: (n: number) => string;
    innerWord: (kid: string, wife: string, kind: MarriageKind) => string;
    halves: (sexes: ('m' | 'f')[]) => string;
    sibs: (sexes: ('m' | 'f')[]) => string;
    up: (id: string) => string;
    other: (claim: string) => string;
  };
}

const MAG_R = [5.6, 4.6, 3.8, 3.1, 2.5, 2.0, 1.6];
const rOf = (mg: number, k: number) => MAG_R[Math.max(0, Math.min(6, mg))] * k;
/** Сила огонька — по величине (решение 186): 0 — ярчайшая. */
export const glowOf = (mg: number) => [1, 0.85, 0.7, 0.55, 0.42, 0.32, 0.25][Math.max(0, Math.min(6, mg))];
/** Кегли подписей врезки — ступени шкалы холста (src/render/type.ts): имя супруги — 16, ребёнка — 14, слова — 13, служебное — 12. */
const FONT_PX: Record<FontKey, number> = { name: 16, kid: 14, kidStrong: 14, focal: 20, word: 13, small: 12, sib: 14, note: 13 };
export const fontPx = (f: FontKey) => FONT_PX[f];
const STYLE: Record<MarriageKind, LineStyle> = { wife: 'double', concubine: 'single', levirate: 'dashdouble', none: 'thin' };
const inkOf = (b: number | null | undefined): Ink | null => (b === null || b === undefined ? null : (`b${b}` as Ink));

function star(n: FamNode, x: number, y: number, k: number, ink: Ink | null, a = 1, extra: Partial<Extract<Prim, { t: 'star' }>> = {}): Extract<Prim, { t: 'star' }> {
  return {
    t: 'star', id: n.id, x, y, r: rOf(n.mg, k) * (n.ring === 'focal' ? 1.15 : 1), sex: n.sex, people: n.people, king: n.king, infant: n.infant, ink,
    glow: glowOf(n.mg) * (ink ? 1 : 0.75), a, ...extra,
  };
}

/** Раскладка врезки: веер (широкий экран) или гребень (телефон). */
export function plotFamily(S: FamScene, G: Geom): Plot {
  return G.comb ? plotComb(S, G) : plotFan(S, G);
}

/** Ступени ужатия веера: выноска (черта брака до подписи супруги), наименьший луч к ребёнку, точек пыли в строке. */
const KNOBS = [
  { lead: 40, akMin: 64, dots: 12 },
  { lead: 32, akMin: 56, dots: 12 },
  { lead: 28, akMin: 48, dots: 10 },
  { lead: 24, akMin: 40, dots: 8 },
];
type Knob = (typeof KNOBS)[number];

/** Ширины веера по измеренным подписям: левое поле, место ребёнка справа от ромба, подпись союза. */
function fanParts(S: FamScene, G: Pick<Geom, 'measure' | 'words' | 'scale'>) {
  const k = G.scale;
  const innerOfMap = new Map(S.inner.map((q) => [q.kid, q]));
  const hasLeft = S.sibs.length + S.kinSibs.length + S.halves.length > 0;
  // левое поле: братья и сёстры (подписи слева от звёзд) не выходят за край раскладки больше чем на 6 px.
  // Звёзды братьев — на 34 px левее ромба родителей; ромб — у матери (лицо − 46) или, если мать не названа, на 44 px
  // правее отца (отец — лицо − 150, но не ближе 34 px к краю)
  const sibR = (n: FamNode) => rOf(n.mg, G.scale);
  const wSib = Math.max(0, ...S.sibs.map((x) => sibR(x) + 9 + G.measure(x.name, 'sib')));
  const wKin = Math.max(0, ...S.kinSibs.map((x) => sibR(x.node) + 9 - 26 + Math.max(G.measure(x.node.name, 'sib'), G.measure(`${x.word}, ${x.ref.replace(/^([1-4])([А-Я])/, '$1 $2')}`, 'word'))));
  const sibsW = Math.max(wSib, wKin) - 6;
  const content = !S.parents || !(S.sibs.length + S.kinSibs.length) ? 0 : S.parents.mother ? 80 + sibsW : sibsW > 34 ? 140 + sibsW : 0;
  const leftW = Math.ceil(Math.max(hasLeft ? (S.sibs.length + S.kinSibs.length > 2 ? 232 : 200) : S.parents ? 150 : 60, content));
  const kidLab = (kid: string) => {
    const nd = S.nodes.get(kid)!;
    const q = innerOfMap.get(kid);
    return G.measure(nd.name, nd.mg <= 1 ? 'kidStrong' : 'kid') + (q ? G.measure(`, ${G.words.innerWord(kid, q.wife, q.kind)}`, 'word') : 0);
  };
  // справа от луча: звезда и подпись ребёнка, у кого есть внуки — ещё столбец «их дети» (точки и «+N»)
  const kidNeed = (K: Knob) =>
    Math.max(40, ...S.unions.flatMap((u) => u.kids.map((x) => {
      const nd = S.nodes.get(x)!;
      return rOf(nd.mg, k) + 7 + kidLab(x) + (nd.grand ? 14 + K.dots * 4.6 + 22 : 0);
    })));
  const wOf = (rs: Run[]) => rs.reduce((q, r) => q + G.measure(r.s, r.font), 0);
  const tagOf = (u: FamUnion, stack: boolean) => {
    const partner = u.partner ? S.nodes.get(u.partner)! : null;
    const kind: Run = { s: stack ? G.words.kind(u.kind) : `, ${G.words.kind(u.kind)}`, font: 'word', ink: 'ink3' };
    const runs: Run[] = partner ? [{ s: partner.name, font: 'name', ink: 'ink' }, ...(stack ? [] : [kind])] : [{ s: G.words.motherUnnamed(u.kids.length), font: 'word', ink: 'ink3' }];
    const kin: Run[] | undefined = partner && u.kin ? [{ s: `${u.kin.word}, ${u.kin.ref.replace(/^([1-4])([А-Я])/, '$1 $2')}`, font: 'word', ink: 'ink2' }] : undefined;
    // в строку: «Сарра, жена» и родство под ней; столбиком: имя, вид союза, родство
    const sub = stack ? [kind] : kin;
    const sub2 = stack ? kin : undefined;
    const lw = Math.max(wOf(runs), wOf(sub ?? []), wOf(sub2 ?? []));
    // от звезды супруги (или от ромба союза без названной матери) до конца выноски
    const back = partner ? rOf(partner.mg, k) + 6 + lw + 5 : 10 - 12 + lw + 5;
    return { partner, runs, sub, sub2, lw, back, lines: 1 + (sub ? 1 : 0) + (sub2 ? 1 : 0) };
  };
  return { innerOfMap, leftW, kidNeed, tagOf };
}

/**
 * Ширина раскладки веера, при которой семья ложится без ужатия (выноски 40 px, лучи не короче 64, пыль по 12 точек,
 * подписи супруг в строку): врезка берёт её, если хватает места на экране.
 */
export function fanWidth(S: FamScene, G: Pick<Geom, 'measure' | 'words' | 'scale'>): number {
  const P = fanParts(S, G);
  const K = KNOBS[0];
  const needM = Math.max(130, ...S.unions.map((u) => P.tagOf(u, false).back + K.lead));
  return Math.ceil(P.leftW + needM + 12 + K.akMin + P.kidNeed(K));
}

function plotFan(S: FamScene, G: Geom): Plot {
  const out: Prim[] = [];
  const top: Prim[] = [];
  const hits: Hit[] = [];
  const at = new Map<string, { x: number; y: number; r: number }>();
  const order: Plot['order'] = [];
  const k = G.scale;
  const F = S.focal;
  // строки детей по союзам; шаг строки — сколько позволяет высота (не меньше 17 px)
  const groups = S.unions;
  const n = groups.length;
  // союз без детей или с одним ребёнком — строка не уже 20–26 px: подписи супруги нужна высота
  let h = 26;
  const one = () => Math.max(20, Math.min(26, h + 6));
  const gap = () => Math.max(6, h * 0.45);
  const need = () => groups.reduce((s, u) => s + Math.max(u.kids.length * h, one()), 0) + Math.max(0, n - 1) * gap();
  while (h > 16 && need() > G.h) h -= 0.5;
  const T = need();
  let y = G.y + Math.max(0, (G.h - T) / 2);
  const gy: { u: FamUnion; yc: number; ys: number[] }[] = [];
  for (const u of groups) {
    const gh = Math.max(u.kids.length * h, one());
    const ys = u.kids.map((_, j) => y + (gh - u.kids.length * h) / 2 + j * h + h / 2);
    gy.push({ u, yc: ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : y + gh / 2, ys });
    y += gh + gap();
  }
  const kidTop = gy.length ? (gy[0].ys[0] ?? gy[0].yc) : G.y + G.h / 2;
  const last = gy[gy.length - 1];
  const kidBot = last ? (last.ys[last.ys.length - 1] ?? last.yc) : kidTop;
  const { innerOfMap, leftW, kidNeed, tagOf } = fanParts(S, G);
  const fx = G.x + leftW;
  // родители — на 128 px выше лица, указатель к деду — ещё на 50: шапка врезки не задета
  const fy = Math.max(Math.min((kidTop + kidBot) / 2, G.y + G.h - 40), G.y + (S.parents ? (S.parents.up ? 186 : 140) : 40));
  const spanY = Math.max(40, ...gy.map((g) => Math.abs(g.yc - fy)));
  const variants = new Map(groups.map((u) => [u.id, { one: tagOf(u, false), two: tagOf(u, true), rows: Math.max(u.kids.length * h, one()) }]));
  const right = G.x + G.w;
  const plan = (K: Knob) => {
    // ширина, что остаётся выноскам и подписям супруг: справа — ромб (12), луч, подпись ребёнка, пыль
    const budget = right - fx - 12 - K.akMin - kidNeed(K);
    const tags = new Map(
      groups.map((u) => {
        const v = variants.get(u.id)!;
        // длинная подпись («Фамарь, брак не назван») — вид союза второй строкой, если союзу хватает высоты
        const stack = v.one.partner && v.one.back + K.lead > budget && v.rows >= v.two.lines * 15 + 4 && v.two.back < v.one.back;
        return [u.id, stack ? v.two : v.one];
      }),
    );
    const needM = Math.max(0, ...[...tags.values()].map((q) => q.back + K.lead));
    return { K, budget, tags, needM, fits: needM <= budget };
  };
  const PL = KNOBS.map(plan).find((q) => q.fits) ?? plan(KNOBS[KNOBS.length - 1]);
  const { K, tags, needM } = PL;
  const LEAD = K.lead;
  const spare = Math.max(0, PL.budget - Math.max(needM, Math.min(130, PL.budget)));
  // запас ширины — поровну дуге супруг и вееру детей (дуга не шире 230, веер не шире 160)
  const aM = Math.min(Math.max(needM, 230), Math.max(needM, Math.min(130, PL.budget)) + spare * 0.5);
  const aKw = Math.min(160, K.akMin + Math.max(0, PL.budget - aM));
  const bM = spanY + 70;
  const ell = (dy: number, a: number, b: number) => a * Math.sqrt(Math.max(0, 1 - (dy / b) ** 2));
  const focusU = G.focus ? groups.find((u) => u.id === G.focus) : undefined;
  const dimOf = (u: FamUnion) => (focusU && focusU !== u ? 0.62 : 1);
  const place = new Map<string, { mx: number; my: number; dx: number; le: number; via?: [number, number][] }>();
  const dust: { y: number; n: number; ink: Ink | null; a: number; lx: number; id: string }[] = [];
  const innerOf = innerOfMap;
  order.push({ id: F.id, ring: 'focal' });
  // черты брака сходятся от лица к общему отвесу (самое левое начало подписи) и дальше идут по строке своего союза:
  // косая часть черты не заходит в строки чужих подписей
  const mxOf = (g: (typeof gy)[number]) => fx + Math.max(Math.min(110, aM), ell(g.yc - fy, aM, bM), tags.get(g.u.id)!.back + LEAD);
  const leCommon = Math.min(...gy.map((g) => mxOf(g) - tags.get(g.u.id)!.back));
  for (const g of gy) {
    const u = g.u;
    const ink = inkOf(u.branch);
    const T = tags.get(u.id)!;
    const mx = mxOf(g);
    const my = g.yc;
    const a = dimOf(u);
    const partner = T.partner;
    const dx = mx + 12;
    // подпись — в строке союза, справа к звезде супруги (к ромбу, если мать не названа); черта брака от лица кончается
    // у начала подписи: черта — выноска подписи, подпись не ложится ни на чужие черты, ни на лучи детей
    const le = mx - T.back;
    const lr = le + 5 + T.lw;
    const via: [number, number][] | undefined = le - leCommon > 1 ? [[leCommon, my]] : undefined;
    if (partner) {
      out.push({ t: 'line', x0: fx, y0: fy, x1: le, y1: my, via, style: STYLE[u.kind], ink: 'ink', w: 1, a: 0.55 * a, uid: u.id, lead: u.id });
      out.push(star(partner, mx, my, k, ink, a));
      at.set(partner.id, { x: mx, y: my, r: rOf(partner.mg, k) });
      hits.push({ kind: 'person', id: partner.id, x: mx, y: my, r: Math.max(10, rOf(partner.mg, k) + 6) });
      order.push({ id: partner.id, ring: 'partner', uid: u.id });
      // столбик подписи — по середине строки союза; подпись в строку (с родством под ней) — на строке союза
      const y0 = T.lines === 3 ? my - 10 : T.lines === 2 && !u.kin ? my - 2 : my + 5;
      top.push({ t: 'label', x: lr, y: y0, align: 'right', runs: T.runs, sub: T.sub, sub2: T.sub2, a, id: partner.id, at: [mx, my, rOf(partner.mg, k)], lead: u.id });
    } else {
      out.push({ t: 'line', x0: fx, y0: fy, x1: le, y1: my, via, style: 'thin', ink: 'ink', w: 1, a: 0.45 * a, uid: u.id, lead: u.id });
      top.push({ t: 'label', x: lr, y: my + 5, align: 'right', runs: T.runs, a, at: [dx, my, 5.2], lead: u.id });
    }
    // дети веером от ромба
    const half = g.ys.length ? Math.max(...g.ys.map((yy) => Math.abs(yy - my))) : 0;
    const aK = aKw;
    const bK = half + Math.max(40, h * 2);
    u.kids.forEach((kid, j) => {
      const nd = S.nodes.get(kid)!;
      const ky = g.ys[j];
      const kx = dx + Math.max(K.akMin, ell(ky - my, aK, bK));
      const kInk = inkOf(nd.branch) ?? ink;
      out.push({ t: 'line', x0: dx, y0: my, x1: kx, y1: ky, style: 'ray', ink: kInk ?? 'ink3', w: 1.1, a: 0.85 * a, glow: true, uid: u.id });
      out.push(star(nd, kx, ky, k, kInk, a));
      const r = rOf(nd.mg, k);
      at.set(kid, { x: kx, y: ky, r });
      hits.push({ kind: 'person', id: kid, x: kx, y: ky, r: Math.max(10, r + 6) });
      order.push({ id: kid, ring: 'kid', uid: u.id });
      const lx = kx + r + 7;
      const inn = innerOf.get(kid);
      const runs: Run[] = [{ s: nd.name, font: nd.mg <= 1 ? 'kidStrong' : 'kid', ink: 'ink' }];
      if (inn) runs.push({ s: `, ${G.words.innerWord(kid, inn.wife, inn.kind)}`, font: 'word', ink: 'ink3' });
      top.push({ t: 'label', x: lx, y: ky + 5, align: 'left', runs, a, id: kid, at: [kx, ky, r] });
      const lw = runs.reduce((s, q) => s + G.measure(q.s, q.font), 0);
      hits.push({ kind: 'name', id: kid, x: lx, y: ky - 10, w: lw, h: 18 });
      dust.push({ y: ky, n: nd.grand, ink: kInk, a, lx: lx + lw, id: kid });
    });
    if (u.kids.length || partner) top.push({ t: 'diamond', uid: u.id, x: dx, y: my, s: 5.2, hollowWife: !partner, hollowAll: u.kind === 'none' && !!partner, ring: focusU === u, a });
    hits.push({ kind: 'union', uid: u.id, x: dx, y: my, r: 10 });
    place.set(u.id, { mx: partner ? mx : dx, my, dx, le, via });
  }
  // пыль внуков: столбцом «их дети», по точке на каждого ребёнка (данные), бледнее на поколение (решение 69)
  if (dust.some((d) => d.n)) {
    const colX = Math.max(...dust.filter((d) => d.n).map((d) => d.lx)) + 14;
    top.push({ t: 'label', x: colX, y: Math.min(...dust.map((d) => d.y)) - 16, align: 'left', runs: [{ s: 'их дети', font: 'small', ink: 'ink3' }], a: 1 });
    for (const d of dust) {
      if (!d.n) continue;
      for (let q = 0; q < Math.min(d.n, K.dots); q++) top.push({ t: 'dot', x: colX + 2 + q * 4.6, y: d.y + 0.5, r: 1.4, ink: d.ink ?? 'ink3', a: 0.8 * d.a });
      if (d.n > K.dots) top.push({ t: 'label', x: colX + 2 + K.dots * 4.6 + 2, y: d.y + 4.5, align: 'left', runs: [{ s: `+${d.n - K.dots}`, font: 'small', ink: 'ink3' }], a: d.a });
      hits.push({ kind: 'dust', id: d.id, x: colX - 4, y: d.y - 8, w: Math.min(d.n, K.dots) * 4.6 + (d.n > K.dots ? 26 : 8), h: 16 });
    }
  }
  // родители, указатель к деду, братья и сёстры
  const P0 = S.parents;
  const py = fy - 128;
  let pd: { x: number; y: number } | null = null;
  let fxp = fx;
  if (P0) {
    const mxp = fx - 58;
    fxp = Math.max(G.x + 34, P0.mother ? fx - 178 : fx - 150);
    if (P0.father) {
      out.push(star(P0.father, fxp, py, k, null));
      at.set(P0.father.id, { x: fxp, y: py, r: rOf(P0.father.mg, k) });
      hits.push({ kind: 'person', id: P0.father.id, x: fxp, y: py, r: Math.max(10, rOf(P0.father.mg, k) + 6) });
      order.unshift({ id: P0.father.id, ring: 'father' });
      top.push({ t: 'label', x: fxp, y: py - 13, align: 'center', runs: [{ s: P0.father.name, font: 'name', ink: 'ink' }], a: 1, id: P0.father.id, at: [fxp, py, rOf(P0.father.mg, k)] });
      if (P0.up) {
        const s = G.words.up(P0.up);
        out.push({ t: 'line', x0: fxp, y0: py - 30, x1: fxp, y1: py - 44, style: 'dotted', ink: 'ink3', w: 1, a: 0.8 });
        top.push({ t: 'label', x: fxp, y: py - 50, align: 'center', runs: [{ s, font: 'small', ink: 'ink3' }], a: 1, at: [fxp, py - 44, 2] });
        const w = G.measure(s, 'small');
        hits.push({ kind: 'up', id: P0.up, x: fxp - w / 2 - 4, y: py - 64, w: w + 8, h: 20 });
      }
    }
    if (P0.mother) {
      if (P0.father) out.push({ t: 'line', x0: fxp, y0: py, x1: mxp, y1: py, style: STYLE[P0.kind], ink: 'ink', w: 1, a: 0.55 });
      out.push(star(P0.mother, mxp, py, k, null));
      at.set(P0.mother.id, { x: mxp, y: py, r: rOf(P0.mother.mg, k) });
      hits.push({ kind: 'person', id: P0.mother.id, x: mxp, y: py, r: Math.max(10, rOf(P0.mother.mg, k) + 6) });
      order.splice(P0.father ? 1 : 0, 0, { id: P0.mother.id, ring: 'mother' });
      top.push({ t: 'label', x: mxp, y: py - 13, align: 'center', runs: [{ s: P0.mother.name, font: 'name', ink: 'ink' }], a: 1, id: P0.mother.id, at: [mxp, py, rOf(P0.mother.mg, k)] });
      pd = { x: mxp + 12, y: py };
    } else {
      // мать не названа: полый ромб на месте матери, тонкая черта от отца; подпись — справа от ромба (над лучом к лицу),
      // под ним или над ним — где свободно
      pd = { x: fxp + 44, y: py };
      if (P0.father) out.push({ t: 'line', x0: fxp, y0: py, x1: pd.x, y1: py, style: 'thin', ink: 'ink', w: 1, a: 0.45 });
      const c = (x: number, y: number): Cand => ({ x, y, align: 'left' });
      const mu = G.words.motherUnnamed(1);
      const cut = mu.indexOf(' ');
      top.push({
        t: 'label', x: pd.x + 9, y: py + 1, align: 'left', runs: [{ s: mu, font: 'word', ink: 'ink3' }], a: 1, at: [pd.x, py, 5.2],
        cands: steps([c(pd.x + 9, py + 1), c(pd.x + 9, py + 19), c(pd.x + 6, py - 9), c(pd.x - 6, py + 20)], py),
        // тесно (черты брака к верхним супругам круто идут рядом) — в две строки: «мать / не названа»
        alt: cut > 0 ? { runs: [{ s: mu.slice(0, cut), font: 'word', ink: 'ink3' }], sub: [{ s: mu.slice(cut + 1), font: 'word', ink: 'ink3' }] } : undefined,
      });
    }
    top.push({ t: 'diamond', uid: P0.uid, x: pd.x, y: pd.y, s: 5.2, hollowWife: !P0.mother, hollowAll: P0.kind === 'none' && !!P0.mother, ring: false, a: 1 });
    out.push({ t: 'line', x0: pd.x, y0: pd.y, x1: fx, y1: fy, style: 'ray', ink: 'ink', w: 1.1, a: 0.6 });
    const sx = pd.x - 34;
    const sh = Math.min(21, Math.max(17, h));
    let sy = Math.max(fy - 46, py + 44);
    for (const s of S.sibs) {
      out.push({ t: 'line', x0: pd.x, y0: pd.y, x1: sx, y1: sy, style: 'ray', ink: 'ink', w: 1, a: 0.42 });
      out.push(star(s, sx, sy, k, null, 1, { glow: glowOf(s.mg) * 0.6 }));
      const r = rOf(s.mg, k);
      at.set(s.id, { x: sx, y: sy, r });
      hits.push({ kind: 'person', id: s.id, x: sx, y: sy, r: Math.max(9, r + 6) });
      order.push({ id: s.id, ring: 'sib' });
      top.push({ t: 'label', x: sx - r - 7, y: sy + 5, align: 'right', runs: [{ s: s.name, font: 'sib', ink: 'ink' }], a: 1, id: s.id, at: [sx, sy, r] });
      sy += sh;
    }
    for (const ks of S.kinSibs) {
      const kx = sx + 26;
      out.push({ t: 'line', x0: fx, y0: fy, x1: kx, y1: sy, style: 'kin', ink: 'ink3', w: 1.3, a: 0.9 });
      out.push(star(ks.node, kx, sy, k, null, 1, { glow: glowOf(ks.node.mg) * 0.6 }));
      const r = rOf(ks.node.mg, k);
      at.set(ks.node.id, { x: kx, y: sy, r });
      hits.push({ kind: 'person', id: ks.node.id, x: kx, y: sy, r: Math.max(9, r + 6) });
      order.push({ id: ks.node.id, ring: 'sib' });
      top.push({
        t: 'label', x: kx - r - 7, y: sy + 5, align: 'right', runs: [{ s: ks.node.name, font: 'sib', ink: 'ink' }], at: [kx, sy, r],
        sub: [{ s: `${ks.word}, ${ks.ref.replace(/^([1-4])([А-Я])/, '$1 $2')}`, font: 'word', ink: 'ink2' }], a: 1, id: ks.node.id,
      });
      sy += sh + 15;
    }
    if (S.halves.length) {
      sy += 8;
      top.push({ t: 'label', x: G.x + 4, y: sy, align: 'left', runs: [{ s: `${G.words.halves(S.halves.flatMap((q) => q.kids.map((x) => x.sex)))}:`, font: 'word', ink: 'ink3' }], a: 1 });
      sy += 17;
      for (const q of S.halves) {
        const runs: Run[] = [{ s: `${q.motherName ?? G.words.motherUnnamed(q.kids.length)}: `, font: 'note', ink: 'ink3' }];
        q.kids.forEach((x, i) => runs.push({ s: x.name + (i < q.kids.length - 1 ? ', ' : ''), font: 'note', ink: 'ink2' }));
        // перенос по ширине левого поля
        for (const line of wrapRuns(runs, leftW - 16, G.measure)) {
          top.push({ t: 'label', x: G.x + 4, y: sy, align: 'left', runs: line, a: 1 });
          sy += 16;
        }
        for (const x of q.kids) order.push({ id: x.id, ring: 'half' });
      }
    }
  }
  // иные утверждения о родителях (по закону, по Луке): строка у верхнего края левого поля
  if (S.otherParents.length) {
    let oy = (P0 ? py : fy) + (P0 ? 34 : -30);
    for (const o of S.otherParents) {
      top.push({ t: 'label', x: G.x + 4, y: oy, align: 'left', runs: [{ s: G.words.other(o.claim), font: 'word', ink: 'ink3' }, { s: ` ${S.nodes.get(o.id)?.name ?? ''}`, font: 'note', ink: 'ink2' }], a: 1 });
      oy += 16;
    }
  }
  // ленты Мессии по шагу (решение 177): отец → черта → мать → ромб → лицо; лицо → черта → супруга → ромб → ребёнок линии
  const ribbon = (x0: number, y0: number, x1: number, y1: number, m: boolean, l: boolean, lead?: string, via?: [number, number][]) => {
    if (m) out.push({ t: 'line', x0, y0, x1, y1, via, style: 'mt', ink: 'ink', w: 1.7, a: 1, off: l ? -4.4 : 0, glow: true, lead });
    if (l) out.push({ t: 'line', x0, y0, x1, y1, via, style: 'lk', ink: 'ink', w: 1.7, a: 1, off: m ? 4.4 : 0, glow: true, lead });
  };
  if (P0?.father && pd && (P0.father.mt || P0.father.lk)) {
    const m = P0.father.mt && F.mt;
    const l = P0.father.lk && F.lk;
    ribbon(fxp, py, pd.x, pd.y, m, l);
    ribbon(pd.x, pd.y, fx, fy, m, l);
  }
  for (const u of S.unions) {
    const pl = place.get(u.id)!;
    for (const kid of u.kids) {
      const nd = S.nodes.get(kid)!;
      const m = nd.mt && F.mt;
      const l = nd.lk && F.lk;
      if (!m && !l) continue;
      const q = at.get(kid)!;
      // лента идёт по черте брака до подписи супруги и продолжается от её звезды (подпись прерывает ленту, как дорогу на карте)
      ribbon(fx, fy, pl.le, pl.my, m, l, u.id, pl.via);
      if (pl.mx < pl.dx) ribbon(pl.mx, pl.my, pl.dx, pl.my, m, l);
      ribbon(pl.dx, pl.my, q.x, q.y, m, l);
    }
  }
  // браки детей с супругой лица — дугой от ребёнка к звезде супруги сверху
  for (const q of S.inner) {
    const a = at.get(q.kid);
    const b = at.get(q.wife);
    if (!a || !b) continue;
    out.push({ t: 'line', x0: a.x - 4, y0: a.y, x1: b.x, y1: b.y - 8, c1: [a.x - 70, a.y], c2: [b.x + 8, b.y - 50], style: STYLE[q.kind], ink: 'ink', w: 1, a: 0.62 });
  }
  // лицо в центре; подпись — где свободно (снизу, слева, сверху)
  out.push(star(F, fx, fy, k, null, 1, { sel: true, glow: 1.15 }));
  at.set(F.id, { x: fx, y: fy, r: rOf(F.mg, k) * 1.15 });
  hits.push({ kind: 'person', id: F.id, x: fx, y: fy, r: 14 });
  top.unshift({
    t: 'label', x: fx, y: fy + 32, align: 'center', runs: [{ s: F.name, font: 'focal', ink: 'ink' }], a: 1, id: F.id, at: [fx, fy, rOf(F.mg, k) * 1.15],
    cands: steps([{ x: fx, y: fy + 32, align: 'center' }, { x: fx - 17, y: fy + 7, align: 'right' }, { x: fx - 17, y: fy - 14, align: 'right' }, { x: fx, y: fy - 20, align: 'center' }, { x: fx - 17, y: fy + 30, align: 'right' }], fy),
  });
  const prims = resolveLabels([...out, ...top], G);
  return { prims, hits, order, at, bottom: y };
}

function plotComb(S: FamScene, G: Geom): Plot {
  const out: Prim[] = [];
  const top: Prim[] = [];
  const hits: Hit[] = [];
  const at = new Map<string, { x: number; y: number; r: number }>();
  const order: Plot['order'] = [];
  const k = G.scale;
  const F = S.focal;
  const P0 = S.parents;
  const py = G.y + 14;
  const fx = G.x + 14;
  const rib = (x0: number, y0: number, x1: number, y1: number, m: boolean, l: boolean, c1?: [number, number], c2?: [number, number], via?: [number, number][]) => {
    if (m) out.push({ t: 'line', x0, y0, x1, y1, c1, c2, via, style: 'mt', ink: 'ink', w: 1.4, a: 1, off: l ? -3.4 : 0, glow: true });
    if (l) out.push({ t: 'line', x0, y0, x1, y1, c1, c2, via, style: 'lk', ink: 'ink', w: 1.4, a: 1, off: m ? 3.4 : 0, glow: true });
  };
  // братья и сёстры — текстом под родителями: на телефоне читаются имена (родство словами Писания — тоном ink2);
  // черта от ромба родителей к лицу идёт уступом над строками — по тексту не проходит
  const sibRuns: Run[] = [];
  if (S.sibs.length) {
    sibRuns.push({ s: `${G.words.sibs(S.sibs.map((x) => x.sex))}: `, font: 'word', ink: 'ink3' });
    S.sibs.forEach((x, i) => sibRuns.push({ s: x.name + (i < S.sibs.length - 1 ? ', ' : ''), font: 'note', ink: 'ink' }));
  }
  S.kinSibs.forEach((x, i) =>
    sibRuns.push({ s: `${i === 0 && S.sibs.length ? '; ' : i ? ', ' : ''}${x.node.name} (${x.word}, ${x.ref.replace(/^([1-4])([А-Я])/, '$1 $2')})`, font: 'note', ink: 'ink2' }),
  );
  const sibLines = sibRuns.length ? wrapRuns(sibRuns, G.w - 40, G.measure) : [];
  const fy = (P0 ? py + 52 : G.y + 12) + sibLines.length * 17 + (sibLines.length ? 8 : 0);
  const bar = py + 14;
  let pd: { x: number; y: number } | null = null;
  if (P0) {
    const fxp = fx;
    const mxp = G.x + 152;
    if (P0.father) {
      out.push(star(P0.father, fxp, py, k, null, 1, { glow: glowOf(P0.father.mg) * 0.5 }));
      at.set(P0.father.id, { x: fxp, y: py, r: rOf(P0.father.mg, k) });
      hits.push({ kind: 'person', id: P0.father.id, x: fxp, y: py, r: 16 });
      order.push({ id: P0.father.id, ring: 'father' });
      top.push({ t: 'label', x: fxp - 6, y: py - 11, align: 'left', runs: [{ s: P0.father.name, font: 'name', ink: 'ink' }], a: 1, id: P0.father.id, at: [fxp, py, rOf(P0.father.mg, k)] });
    }
    if (P0.mother) {
      if (P0.father) out.push({ t: 'line', x0: fxp, y0: py, x1: mxp, y1: py, style: STYLE[P0.kind], ink: 'ink', w: 1, a: 0.55 });
      out.push(star(P0.mother, mxp, py, k, null, 1, { glow: glowOf(P0.mother.mg) * 0.5 }));
      at.set(P0.mother.id, { x: mxp, y: py, r: rOf(P0.mother.mg, k) });
      hits.push({ kind: 'person', id: P0.mother.id, x: mxp, y: py, r: 16 });
      order.push({ id: P0.mother.id, ring: 'mother' });
      top.push({ t: 'label', x: mxp + 6, y: py - 11, align: 'right', runs: [{ s: P0.mother.name, font: 'name', ink: 'ink' }], a: 1, id: P0.mother.id, at: [mxp, py, rOf(P0.mother.mg, k)] });
      pd = { x: mxp + 11, y: py };
    } else {
      pd = { x: fxp + 14, y: py };
      top.push({ t: 'label', x: fxp + 24, y: py + 5, align: 'left', runs: [{ s: G.words.motherUnnamed(1), font: 'word', ink: 'ink3' }], a: 1, at: [fxp + 14, py, 4.6] });
    }
    top.push({ t: 'diamond', uid: P0.uid, x: pd.x, y: pd.y, s: 4.6, hollowWife: !P0.mother, hollowAll: P0.kind === 'none' && !!P0.mother, ring: false, a: 1 });
    const via: [number, number][] = [[pd.x, bar], [fx, bar]];
    out.push({ t: 'line', x0: pd.x, y0: pd.y, x1: fx, y1: fy, via, style: 'ray', ink: 'ink', w: 1, a: 0.6 });
    if (P0.father && (P0.father.mt || P0.father.lk)) rib(pd.x, pd.y, fx, fy, P0.father.mt && F.mt, P0.father.lk && F.lk, undefined, undefined, via);
    sibLines.forEach((ln, i) => top.push({ t: 'label', x: G.x + 40, y: py + 36 + i * 17, align: 'left', runs: ln, a: 1 }));
    for (const s of [...S.sibs, ...S.kinSibs.map((x) => x.node)]) order.push({ id: s.id, ring: 'sib' });
  }
  order.push({ id: F.id, ring: 'focal' });
  const rows = S.unions.reduce((s, u) => s + 1 + u.kids.length, 0);
  const y0 = fy + 40;
  const h = Math.max(19, Math.min(23, (G.y + G.h - y0 - S.unions.length * 4) / Math.max(1, rows)));
  let y = y0;
  const xm = G.x + 46;
  const xk = G.x + 106;
  const dustX = G.x + G.w - 9 * 4.4 - 2;
  const focusU = G.focus ? S.unions.find((u) => u.id === G.focus) : undefined;
  if (S.unions.some((u) => u.kids.some((x) => S.nodes.get(x)!.grand)))
    top.push({ t: 'label', x: dustX, y: y0 - 6, align: 'left', runs: [{ s: 'их дети', font: 'small', ink: 'ink3' }], a: 1 });
  for (const u of S.unions) {
    const ink = inkOf(u.branch);
    const partner = u.partner ? S.nodes.get(u.partner)! : null;
    const a = focusU && focusU !== u ? 0.62 : 1;
    const my = y;
    const dx = xm + 11;
    const lineKids = u.kids.filter((x) => (S.nodes.get(x)!.mt && F.mt) || (S.nodes.get(x)!.lk && F.lk));
    if (partner) {
      out.push({ t: 'line', x0: fx, y0: fy, x1: xm, y1: my, c1: [fx, my], style: STYLE[u.kind], ink: 'ink', w: 1, a: 0.5 * a, uid: u.id });
      out.push(star(partner, xm, my, k, ink, a, { glow: glowOf(partner.mg) * 0.7 }));
      at.set(partner.id, { x: xm, y: my, r: rOf(partner.mg, k) });
      hits.push({ kind: 'person', id: partner.id, x: xm, y: my, r: 16 });
      order.push({ id: partner.id, ring: 'partner', uid: u.id });
      top.push({
        t: 'label', x: dx + 10, y: my + 5, align: 'left', a, id: partner.id, at: [xm, my, rOf(partner.mg, k)],
        runs: [{ s: partner.name, font: 'name', ink: 'ink' }, { s: `, ${G.words.kind(u.kind)}`, font: 'word', ink: 'ink3' }, ...(u.kin ? [{ s: `; ${u.kin.word}`, font: 'word' as const, ink: 'ink2' as const }] : [])],
      });
    } else {
      out.push({ t: 'line', x0: fx, y0: fy, x1: dx, y1: my, c1: [fx, my], style: 'thin', ink: 'ink', w: 1, a: 0.45 * a, uid: u.id });
      top.push({ t: 'label', x: dx + 10, y: my + 5, align: 'left', runs: [{ s: G.words.motherUnnamed(u.kids.length), font: 'word', ink: 'ink3' }], a, at: [dx, my, 4.6] });
    }
    if (lineKids.length) rib(fx, fy, xm, my, lineKids.some((x) => S.nodes.get(x)!.mt) && F.mt, lineKids.some((x) => S.nodes.get(x)!.lk) && F.lk, [fx, my]);
    hits.push({ kind: 'union', uid: u.id, x: dx, y: my, r: 14 });
    y += h;
    for (const kid of u.kids) {
      const nd = S.nodes.get(kid)!;
      const kInk = inkOf(nd.branch) ?? ink;
      // зубец гребня: от ромба вниз и вправо к ребёнку — под подписью союза не проходит
      out.push({ t: 'line', x0: dx, y0: my, x1: xk, y1: y, c1: [dx, y], c2: [dx, y], style: 'ray', ink: kInk ?? 'ink3', w: 1, a: 0.85 * a, glow: true, uid: u.id });
      out.push(star(nd, xk, y, k, kInk, a, { glow: glowOf(nd.mg) * 0.7 }));
      const r = rOf(nd.mg, k);
      at.set(kid, { x: xk, y, r });
      // касание: звезда (22 px) и вся строка имени (решение 154: цели касания ≥ 44 px по высоте строки — сколько позволяет шаг)
      hits.push({ kind: 'person', id: kid, x: xk, y, r: 22 });
      hits.push({ kind: 'name', id: kid, x: xk, y: y - h / 2, w: Math.max(80, G.measure(nd.name, 'kid') + 30), h });
      order.push({ id: kid, ring: 'kid', uid: u.id });
      top.push({ t: 'label', x: xk + r + 7, y: y + 5, align: 'left', runs: [{ s: nd.name, font: nd.mg <= 1 ? 'kidStrong' : 'kid', ink: 'ink' }], a, id: kid, at: [xk, y, r] });
      if (nd.mt || nd.lk) rib(dx, my, xk, y, nd.mt && F.mt, nd.lk && F.lk, [dx, y], [dx, y]);
      if (nd.grand) {
        for (let q = 0; q < Math.min(nd.grand, 9); q++) top.push({ t: 'dot', x: dustX + 2 + q * 4.4, y: y + 1, r: 1.25, ink: kInk ?? 'ink3', a: 0.8 * a });
        if (nd.grand > 9) top.push({ t: 'label', x: G.x + G.w + 2, y: y - 5, align: 'right', runs: [{ s: `+${nd.grand - 9}`, font: 'small', ink: 'ink3' }], a });
        hits.push({ kind: 'dust', id: kid, x: dustX - 4, y: y - 11, w: G.x + G.w - dustX + 6, h: 22 });
      }
      y += h;
    }
    top.push({ t: 'diamond', uid: u.id, x: dx, y: my, s: 4.6, hollowWife: !partner, hollowAll: u.kind === 'none' && !!partner, ring: focusU === u, a });
    y += 4;
  }
  out.push(star(F, fx, fy, k, null, 1, { sel: true, glow: 0.8 }));
  at.set(F.id, { x: fx, y: fy, r: rOf(F.mg, k) * 1.15 });
  hits.push({ kind: 'person', id: F.id, x: fx, y: fy, r: 18 });
  top.push({ t: 'label', x: fx + 17, y: fy + 7, align: 'left', runs: [{ s: F.name, font: 'focal', ink: 'ink' }], a: 1, id: F.id, at: [fx, fy, rOf(F.mg, k) * 1.15] });
  return { prims: [...out, ...top], hits, order, at, bottom: y };
}

/** Строки из кусков по ширине maxW (перенос по словам). */
export function wrapRuns(runs: Run[], maxW: number, measure: Geom['measure']): Run[][] {
  const lines: Run[][] = [[]];
  let w = 0;
  for (const r of runs)
    for (const word of r.s.split(/(?<= )/)) {
      const ww = measure(word, r.font);
      if (w + ww > maxW && w > 0) {
        lines.push([]);
        w = 0;
      }
      lines[lines.length - 1].push({ ...r, s: word });
      w += ww;
    }
  return lines.filter((l) => l.length);
}

/** Рамка подписи: по кускам и подстроке. */
export function labelBox(p: Extract<Prim, { t: 'label' }>, c: Cand, measure: Geom['measure']) {
  const w0 = p.runs.reduce((s, r) => s + measure(r.s, r.font), 0);
  const w1 = (p.sub ?? []).reduce((s, r) => s + measure(r.s, r.font), 0);
  const w2 = (p.sub2 ?? []).reduce((s, r) => s + measure(r.s, r.font), 0);
  const w = Math.max(w0, w1, w2);
  const h = Math.max(...p.runs.map((r) => FONT_PX[r.font])) + (p.sub ? 15 : 0) + (p.sub2 ? 15 : 0);
  const x0 = c.align === 'right' ? c.x - w : c.align === 'center' ? c.x - w / 2 : c.x;
  return { x: x0 - 2, y: c.y - Math.max(...p.runs.map((r) => FONT_PX[r.font])) * 0.78 - 1, w: w + 4, h: h + 2 };
}

type LinePrim = Extract<Prim, { t: 'line' }>;
/**
 * Точки линии, смещённые поперёк на off по местной нормали (нить ленты, вторая черта брака): прямая — концы, ломаная
 * (via) — вершины со скосом, кривая — шаг ≈ 3 px. По ним рисует врезка и по ним же ищутся столкновения подписей.
 */
export function lineSamples(p: LinePrim, off: number): [number, number][] {
  let pts: [number, number][];
  if (p.via) pts = [[p.x0, p.y0], ...p.via, [p.x1, p.y1]];
  else if (p.c1) {
    const c1 = p.c1;
    const c2 = p.c2;
    const poly = c2 ? Math.hypot(c1[0] - p.x0, c1[1] - p.y0) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(p.x1 - c2[0], p.y1 - c2[1]) : Math.hypot(c1[0] - p.x0, c1[1] - p.y0) + Math.hypot(p.x1 - c1[0], p.y1 - c1[1]);
    const n = Math.max(4, Math.ceil(poly / 3));
    pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      if (c2) pts.push([u * u * u * p.x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p.x1, u * u * u * p.y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p.y1]);
      else pts.push([u * u * p.x0 + 2 * u * t * c1[0] + t * t * p.x1, u * u * p.y0 + 2 * u * t * c1[1] + t * t * p.y1]);
    }
  } else pts = [[p.x0, p.y0], [p.x1, p.y1]];
  if (!off) return pts;
  const nrm = (a: [number, number], b: [number, number]): [number, number] => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return l ? [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] : [0, 0];
  };
  return pts.map((q, i) => {
    const n0 = i > 0 ? nrm(pts[i - 1], q) : null;
    const n1 = i < pts.length - 1 ? nrm(q, pts[i + 1]) : null;
    const a = n0 ?? n1!;
    const b = n1 ?? n0!;
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const k = 1 / Math.max(0.5, mx * a[0] + my * a[1]);
    return [q[0] + mx * off * k, q[1] + my * off * k];
  });
}

/**
 * Положения подписи шагами отступа: сначала все положения у знака (как четыре положения на небе), затем те же,
 * отодвинутые от знака на 6, 12 и 18 px (над знаком — вверх, под знаком — вниз, сбоку — в сторону).
 */
function steps(cands: Cand[], anchorY: number): Cand[] {
  const out: Cand[] = [];
  for (const d of [0, 6, 12, 18])
    for (const c of cands) {
      const side = Math.abs(c.y - (anchorY + 5)) < 6 && c.align !== 'center';
      if (side) out.push({ ...c, x: c.x + (c.align === 'right' ? -d : d) });
      else out.push({ ...c, y: c.y + (c.y < anchorY ? -d : d) });
    }
  return out;
}

export type Box = { x: number; y: number; w: number; h: number };
type LabelPrim = Extract<Prim, { t: 'label' }>;
interface Obstacles {
  /** точки линий с полутолщиной (у лент — со смещением нити и ореолом) */
  pts: { x: number; y: number; m: number; lead?: string }[];
  /** знаки: звёзды, ромбы, пыль внуков */
  marks: { x: number; y: number; r: number; what: string }[];
}

function obstaclesOf(prims: Prim[]): Obstacles {
  const pts: Obstacles['pts'] = [];
  const marks: Obstacles['marks'] = [];
  for (const p of prims) {
    if (p.t === 'line') {
      // полутолщина: черта, вторая черта брака (±1,8), нить ленты с ореолом
      const dbl = p.style === 'double' || p.style === 'dashdouble';
      const m = (dbl ? 1.8 + p.w * 0.45 : p.w / 2) + (p.style === 'mt' || p.style === 'lk' ? 2 : 1);
      const base = lineSamples(p, p.off ?? 0);
      for (let i = 0; i < base.length - 1; i++) {
        const [ax, ay] = base[i];
        const [bx, by] = base[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
        for (let j = 0; j <= n; j++) pts.push({ x: ax + ((bx - ax) * j) / n, y: ay + ((by - ay) * j) / n, m, lead: p.lead });
      }
    } else if (p.t === 'star') marks.push({ x: p.x, y: p.y, r: p.r + 1.5, what: `star ${p.id}` });
    else if (p.t === 'diamond') marks.push({ x: p.x, y: p.y, r: p.s + 1, what: `diamond ${p.uid}` });
    else if (p.t === 'dot') marks.push({ x: p.x, y: p.y, r: p.r + 1, what: 'dust' });
  }
  return { pts, marks };
}

/** Рамки подписей (с полями по 2 px) пересекаются больше чем на полпикселя: строки шагом ровно в кегль лишь касаются. */
const meets = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
const circleMeets = (b: Box, c: { x: number; y: number; r: number }) => {
  const dx = c.x - Math.max(b.x, Math.min(c.x, b.x + b.w));
  const dy = c.y - Math.max(b.y, Math.min(c.y, b.y + b.h));
  return dx * dx + dy * dy < c.r * c.r;
};
/** Свой знак подписи и своя выноска (линии, входящие в свой знак) препятствиями не считаются. */
const own = (p: LabelPrim, x: number, y: number, pad: number) => !!p.at && Math.hypot(x - p.at[0], y - p.at[1]) < p.at[2] + pad;

function clashesOf(p: LabelPrim, b: Box, O: Obstacles, boxes: { b: Box; what: string }[]) {
  const marks = O.marks.filter((c) => !own(p, c.x, c.y, 0.5) && circleMeets(b, c)).map((c) => c.what);
  const labels = boxes.filter((o) => meets(b, o.b)).map((o) => o.what);
  let line = 0;
  for (const q of O.pts) if (!own(p, q.x, q.y, 10) && !(p.lead && q.lead === p.lead) && q.x > b.x - q.m && q.x < b.x + b.w + q.m && q.y > b.y - q.m && q.y < b.y + b.h + q.m) line++;
  return { marks, labels, line };
}
const textOf = (p: LabelPrim) => p.runs.map((r) => r.s).join('').trim();

/**
 * Подписи с местами-кандидатами (лицо, супруги, «мать не названа») встают в первое положение, где не задевают знаков,
 * других подписей и линий врезки (кроме своей выноски) — как на небе: подпись не стоит на чужом знаке и чужой черте
 * (решение 163). Если чистого места нет — наименьшее столкновение (знак и подпись весят больше линии). Остальные
 * подписи — препятствия.
 */
function resolveLabels(prims: Prim[], G: Geom): Prim[] {
  const O = obstaclesOf(prims);
  const boxes: { b: Box; what: string }[] = [];
  for (const p of prims) if (p.t === 'label' && !p.cands) boxes.push({ b: labelBox(p, p, G.measure), what: textOf(p) });
  const outside = (b: Box) => (b.x < G.x - 12 || b.x + b.w > G.x + G.w + 12 ? 1 : 0) + (b.y < G.y - 30 || b.y + b.h > G.y + G.h + 14 ? 1 : 0);
  const pick = (p: LabelPrim, cands: Cand[]) => {
    let best = cands[0];
    let bc = Infinity;
    for (const c of cands) {
      const b = labelBox(p, c, G.measure);
      const q = clashesOf(p, b, O, boxes);
      // подпись вплотную к чужой на той же строке читается с ней как одна фраза («братья: … Халев») — тоже помеха
      const near = boxes.filter((o) => meets({ x: b.x - 10, y: b.y, w: b.w + 20, h: b.h }, o.b)).length;
      const v = (q.marks.length + q.labels.length) * 1000 + near * 500 + q.line * 20 + outside(b) * 5000;
      if (v < bc) {
        bc = v;
        best = c;
      }
      if (v === 0) break;
    }
    return { best, bc };
  };
  for (const p of prims) {
    if (p.t !== 'label' || !p.cands) continue;
    let { best, bc } = pick(p, p.cands);
    // чистого места нет — второй вид подписи (в две строки), если он есть и встаёт лучше
    if (bc > 0 && p.alt) {
      const one = { runs: p.runs, sub: p.sub };
      Object.assign(p, p.alt);
      const q = pick(p, p.cands);
      if (q.bc < bc) ({ best, bc } = q);
      else Object.assign(p, one);
    }
    p.x = best.x;
    p.y = best.y;
    p.align = best.align;
    boxes.push({ b: labelBox(p, best, G.measure), what: textOf(p) });
  }
  return prims;
}

/**
 * Столкновения подписей врезки (для приёмки и тестов): подпись × знак, подпись × подпись, подпись × линия (кроме своей
 * выноски); с area — ещё подпись за краем врезки (обрезана). Пустой список — врезка читается.
 */
export function insetClashes(prims: Prim[], measure: Geom['measure'], area?: Box): string[] {
  const O = obstaclesOf(prims);
  const labels = prims.filter((p): p is LabelPrim => p.t === 'label');
  const out: string[] = [];
  const done: { b: Box; what: string }[] = [];
  for (const p of labels) {
    const b = labelBox(p, p, measure);
    const q = clashesOf(p, b, O, done);
    const who = textOf(p);
    for (const m of q.marks) out.push(`«${who}» × ${m}`);
    for (const l of q.labels) out.push(`«${who}» × «${l}»`);
    if (q.line) out.push(`«${who}» × линия (${q.line})`);
    if (area && (b.x < area.x || b.x + b.w > area.x + area.w)) out.push(`«${who}» × край врезки`);
    done.push({ b, what: who });
  }
  return out;
}

/** Высота раскладки веера, которой хватит семье: шаг строки 26 px (меньше — до 17 px). */
export function fanHeight(S: FamScene): number {
  const rows = S.unions.reduce((s, u) => s + Math.max(u.kids.length, 1), 0);
  return Math.max(rows * 26 + Math.max(0, S.unions.length - 1) * 12, S.parents ? 330 : 160, (S.sibs.length + S.kinSibs.length) * 21 + 230);
}
