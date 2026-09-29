/**
 * Составы показов (этап 11, § 7; решение 82): род лица и созвездия — кто на небе, кто гость, какие связи уходят
 * наружу обрывками.
 *
 *  — Род лица: предки, потомки или оба; поколений 1–3 или все; по отцам (по умолчанию) или по крови.
 *    По отцам: потомки — дети мужчин рода; дочь рода показана, а её дети — только если они в том же роду (в созвездиях
 *    рода по отцам: 1 Пар 2:34–41 — потомки дочери Шешана записаны в Иудином колене); иначе у дочери знак «+N» — сколько
 *    её потомков не показано. Предки по отцам — отец, отец отца… По крови — через отцов и матерей.
 *  — Созвездия: их лица и родоначальники (Group.founder), связи наружу — обрывками (по умолчанию), «с роднёй вне
 *    созвездия» (лица одного шага наружу — гости) или «без связей».
 *  — Гость — лицо вне показа, нужное для союза: жена лица показа, мать его ребёнка из показа, мать лица показа при отце
 *    из показа. Небо рисует гостей бледнее (45 %).
 *  — Обрывок наружу — связь лица показа с лицом вне показа, не гостем: ключ связи (src/engine/linkkey.ts) и подпись
 *    в две строки: «Ревекка, дочь Вафуила» / «жена Исаака; в «Патриархах»». Имена склоняет src/ui/text/ru.ts; где
 *    склонение ненадёжно, имя стоит в именительном падеже в начале строки.
 *
 * Связи по толкованию (cert 'interpretation') состав не расширяют и обрывками не рисуются.
 *
 * Чистая часть — функции с данными KinData; lineageOf(id, dir, gen, by) — то же по данным атласа, которые подключает
 * src/ui/show.ts при загрузке (useKinData): движок не читает src/data/atlas.ts сам.
 */
import type { Sex } from '../data/types.ts';
import type { Graph, ParentEdge } from './graph.ts';
import { unionId, type Unions } from './unions.ts';
import type { LinkKey } from './linkkey.ts';
import { nameCase } from '../ui/text/ru.ts';

export type LineageDir = 'up' | 'down' | 'both';
export type LineageBy = 'father' | 'blood';
/** Связи наружу у показа созвездий: обрывками, с роднёй вне созвездия (гости одного шага), без связей. */
export type LinksOut = 'stubs' | 'kin' | 'none';

/** Обрывок наружу: связь лица показа from с лицом вне показа to (src/render/rows.ts, PlanStub). */
export interface Stub {
  from: string;
  to: string;
  key: LinkKey;
  /** первая строка подписи: «Ревекка, дочь Вафуила» */
  words: string;
  /** вторая строка: «жена Исаака; в «Патриархах»» */
  where: string;
}

/** Состав показа. */
export interface Composition {
  /** лица показа */
  ids: Set<string>;
  /** гости — лица вне показа, нужные для союзов */
  guests: Set<string>;
  /** обрывки наружу */
  stubs: Stub[];
  /** дочь рода с потомками вне рода → сколько их («+N») */
  plus: Map<string, number>;
  /** родоначальники созвездий показа, которые лежат вне этих созвездий (Нахор для «Дома Нахора») */
  founders: Set<string>;
}

export interface Lineage extends Composition {
  root: string;
  /** поколение лица от корня: предки — отрицательные, потомки — положительные */
  gen: Map<string, number>;
}

export interface KinPerson {
  name: string;
  sex: Sex;
  group: string;
  unnamed?: boolean;
  /** другие формы имени (для склонения, ru.ts declinableForm) */
  alt?: readonly string[];
}
export interface KinGroup {
  id: string;
  name: string;
  parent?: string;
  founder?: string;
}
/** Данные составов: граф, союзы, лица, созвездия. */
export interface KinData {
  graph: Graph;
  unions: Unions;
  person(id: string): KinPerson | undefined;
  group(id: string): KinGroup | undefined;
}

const natural = (e: ParentEdge) => (e.kind === 'father' || e.kind === 'mother') && e.cert !== 'interpretation';

/** Имя лица в родительном падеже или null (ru.ts). */
function gen(d: KinData, id: string): string | null {
  const p = d.person(id);
  return p ? nameCase(p.name, p.sex, 'gen', p.unnamed, p.alt ?? []) : null;
}
const nameOf = (d: KinData, id: string) => d.person(id)?.name ?? id;
/**
 * Где лицо: название созвездия в предложном падеже — «в «Патриархах»», «в «Доме Фарры»». Формы записаны явно по id
 * созвездия (data/groups.json); название, которого нет в таблице или которое не склоняется («От Сима до Фарры»), стоит
 * в именительном падеже после слова «созвездие»: «в созвездии «От Сима до Фарры»».
 */
export const GROUP_IN: Readonly<Record<string, string>> = {
  sethites: 'Роде Сифа',
  cainites: 'Роде Каина',
  japhethites: 'Сынах Иафета',
  hamites: 'Сынах Хама',
  shemites: 'Сынах Сима',
  terahites: 'Доме Фарры',
  nahorites: 'Доме Нахора',
  moabites: 'Моаве',
  ammonites: 'Аммоне',
  ishmaelites: 'Измаильтянах',
  keturites: 'Сынах Хеттуры',
  edomites: 'Едоме',
  horites: 'Хорреях Сеира',
  patriarchs: 'Патриархах',
  reuben: 'Колене Рувимовом',
  simeon: 'Колене Симеоновом',
  levi: 'Колене Левиином',
  judah: 'Колене Иудином',
  davidic: 'Доме Давидовом',
  dan: 'Колене Дановом',
  naphtali: 'Колене Неффалимовом',
  gad: 'Колене Гадовом',
  asher: 'Колене Асировом',
  issachar: 'Колене Иссахаровом',
  zebulun: 'Колене Завулоновом',
  joseph: 'Доме Иосифа',
  ephraim: 'Колене Ефремовом',
  manasseh: 'Колене Манассиином',
  benjamin: 'Колене Вениаминовом',
  saulides: 'Доме Сауловом',
  'israel-kings': 'Царях Израиля',
  messiah: 'Родословии Иисуса Христа',
  herodians: 'Доме Ирода',
  church: 'Церкви апостольского времени',
  other: 'Прочих лицах',
};
/** «в «Патриархах»» — где созвездие gid. */
export function inGroup(d: Pick<KinData, 'group'>, gid: string): string {
  const g = d.group(gid);
  if (!g) return '';
  const f = GROUP_IN[gid];
  return f ? `в «${f}»` : `в созвездии «${g.name}»`;
}
const whereGroup = (d: KinData, id: string): string => inGroup(d, d.person(id)?.group ?? '');

/**
 * Подпись обрывка. rel — кем лицо вне показа приходится лицу показа («дочь», «отец», «жена»); строка —
 * «Ревекка, дочь Вафуила», а если имя лица показа не склоняется надёжно — «Ревекка — дочь: Вафуил».
 */
function stubWords(d: KinData, outside: string, rel: string, inside: string): string {
  const g = gen(d, inside);
  return g ? `${nameOf(d, outside)}, ${rel} ${g}` : `${nameOf(d, outside)} — ${rel}: ${nameOf(d, inside)}`;
}

/** Вторая строка подписи: супруг лица вне показа (если есть) и где лицо: «жена Исаака; в «Патриархах»». */
function stubWhere(d: KinData, outside: string, inside: string): string {
  const parts: string[] = [];
  const p = d.person(outside);
  if (p) {
    const sp = (d.graph.spousesOf.get(outside) ?? []).map((e) => (e.a === outside ? e.b : e.a)).filter((x) => x !== inside);
    if (sp.length) {
      const g = gen(d, sp[0]);
      const role = p.sex === 'f' ? 'жена' : 'муж';
      parts.push(g ? `${role} ${g}` : `${role}: ${nameOf(d, sp[0])}`);
    }
  }
  const w = whereGroup(d, outside);
  if (w) parts.push(w);
  return parts.join('; ');
}

const childRel = (sex: Sex | undefined) => (sex === 'f' ? 'дочь' : 'сын');
const parentRel = (sex: Sex | undefined) => (sex === 'f' ? 'мать' : 'отец');
const spouseRel = (sex: Sex | undefined, concubine: boolean) => (sex === 'f' ? (concubine ? 'наложница' : 'жена') : 'муж');

/** Союз происхождения ребёнка по ребру к родителю: кровные отец и мать — один союз, иное утверждение — свой. */
function originUnion(d: KinData, e: ParentEdge): string {
  if (e.kind === 'other-father') return unionId(e.parent, null, e.claim);
  if (e.kind === 'other-mother') return unionId(null, e.parent, e.claim);
  const u = d.unions.origin.get(e.child)?.find((x) => !x.claim || x.claim === 'legal');
  return u ? u.id : e.kind === 'father' ? unionId(e.parent, null) : unionId(null, e.parent);
}

/**
 * Гости и обрывки состава ids (links: 'stubs' — обрывками; 'kin' — лица одного шага наружу гостями; 'none' — ничего).
 * Гости — жёны лиц показа (матери их детей из показа или бездетный брак) и матери лиц показа при отце из показа (или без
 * названного отца). Обрывки — остальные связи наружу: родители, дети, супруги; одна связь — один обрывок.
 */
export function outward(d: KinData, ids: ReadonlySet<string>, links: LinksOut): { guests: Set<string>; stubs: Stub[] } {
  const guests = new Set<string>();
  const stubs: Stub[] = [];
  if (links === 'none') return { guests, stubs };
  const g = d.graph;
  if (links === 'kin') {
    for (const id of ids) {
      for (const e of g.parentsOf.get(id) ?? []) if (e.cert !== 'interpretation' && !ids.has(e.parent)) guests.add(e.parent);
      for (const e of g.childrenOf.get(id) ?? []) if (e.cert !== 'interpretation' && !ids.has(e.child)) guests.add(e.child);
      for (const e of g.spousesOf.get(id) ?? []) {
        const o = e.a === id ? e.b : e.a;
        if (e.cert !== 'interpretation' && !ids.has(o)) guests.add(o);
      }
    }
    return { guests, stubs };
  }
  // гости: жёны и матери, нужные для союзов показа
  for (const id of ids) {
    for (const u of d.unions.of.get(id) ?? []) {
      if (u.claim && u.claim !== 'legal') continue;
      const other = u.a === id ? u.b : u.b === id ? u.a : null;
      if (!other || ids.has(other)) continue;
      if (u.cert === 'interpretation') continue;
      const kidsIn = u.kids.some((k) => ids.has(k));
      if (kidsIn || !u.kids.length) guests.add(other);
    }
    const mother = (g.parentsOf.get(id) ?? []).find((e) => e.kind === 'mother' && e.cert !== 'interpretation');
    const father = (g.parentsOf.get(id) ?? []).find((e) => e.kind === 'father');
    if (mother && !ids.has(mother.parent) && (!father || ids.has(father.parent))) guests.add(mother.parent);
  }
  const shownOrGuest = (x: string) => ids.has(x) || guests.has(x);
  const seen = new Set<string>();
  const push = (s: Stub) => {
    const k = `${s.from}>${s.to}`;
    if (seen.has(k)) return;
    seen.add(k);
    stubs.push(s);
  };
  for (const id of ids) {
    // родители вне показа: одна связь «союз → ребёнок» — один обрывок к отцу (или к матери, если отца нет в данных)
    const byUnion = new Map<string, ParentEdge[]>();
    for (const e of g.parentsOf.get(id) ?? []) {
      if (e.cert === 'interpretation' || shownOrGuest(e.parent)) continue;
      const uid = originUnion(d, e);
      const a = byUnion.get(uid);
      if (a) a.push(e);
      else byUnion.set(uid, [e]);
    }
    for (const [uid, es] of byUnion) {
      // союз, у которого второй родитель в показе, — не наружу целиком: тогда обрывок к тому, кто вне показа
      const to = (es.find((e) => e.kind === 'father' || e.kind === 'other-father') ?? es[0]).parent;
      const both = es.length > 1 ? es.map((e) => nameOf(d, e.parent)).join(' и ') : null;
      const childGen = gen(d, id);
      const words = both
        ? childGen
          ? `${both}, родители ${childGen}`
          : `${both} — родители: ${nameOf(d, id)}`
        : stubWords(d, to, parentRel(d.person(to)?.sex), id);
      push({ from: id, to, key: { kind: 'child', union: uid, child: id }, words, where: whereGroup(d, to) });
    }
    // дети вне показа
    for (const e of g.childrenOf.get(id) ?? []) {
      if (e.cert === 'interpretation' || shownOrGuest(e.child)) continue;
      // у ребёнка второй родитель в показе — обрывок один, от отца
      const other = (g.parentsOf.get(e.child) ?? []).find((x) => x !== e && x.parent !== id && natural(x) && ids.has(x.parent));
      if (other && e.kind === 'mother') continue;
      push({ from: id, to: e.child, key: { kind: 'child', union: originUnion(d, e), child: e.child }, words: stubWords(d, e.child, childRel(d.person(e.child)?.sex), id), where: stubWhere(d, e.child, id) });
    }
    // супруги вне показа, не гости
    for (const e of g.spousesOf.get(id) ?? []) {
      const o = e.a === id ? e.b : e.a;
      if (e.cert === 'interpretation' || shownOrGuest(o)) continue;
      const u = unionId(e.a, e.b);
      push({ from: id, to: o, key: { kind: 'spouse', union: u, person: o }, words: stubWords(d, o, spouseRel(d.person(o)?.sex, e.kind === 'concubine'), id), where: whereGroup(d, o) });
    }
  }
  return { guests, stubs };
}

/** Созвездие g или вложенное в него. */
function within(d: KinData, g: string | undefined, top: string): boolean {
  for (let x = g, k = 0; x && k < 8; x = d.group(x)?.parent, k++) if (x === top) return true;
  return false;
}

/**
 * Состав показа созвездий: лица созвездий groups (вложенные дома — только если они сами в списке), родоначальники
 * вне них, гости и обрывки по links.
 */
export function groupsWith(d: KinData, persons: Iterable<string>, groups: readonly string[], links: LinksOut): Composition {
  const gs = new Set(groups);
  const ids = new Set<string>();
  for (const id of persons) {
    const p = d.person(id);
    if (p && gs.has(p.group)) ids.add(id);
  }
  const founders = new Set<string>();
  for (const gid of groups) {
    const f = d.group(gid)?.founder;
    if (f && d.person(f) && !ids.has(f)) founders.add(f);
  }
  for (const f of founders) ids.add(f);
  const { guests, stubs } = outward(d, ids, links);
  return { ids, guests, stubs, plus: new Map(), founders };
}

/** Лица созвездия top и вложенных в него домов. */
export function groupMembers(d: KinData, persons: Iterable<string>, top: string): string[] {
  const out: string[] = [];
  for (const id of persons) if (within(d, d.person(id)?.group, top)) out.push(id);
  return out;
}

/**
 * Род лица id: dir — предки, потомки или оба; gen — поколений (null — все); by — по отцам или по крови.
 */
export function lineageWith(d: KinData, id: string, dir: LineageDir, gen: number | null, by: LineageBy): Lineage {
  const g = d.graph;
  const ids = new Set<string>([id]);
  const genOf = new Map<string, number>([[id, 0]]);
  const plus = new Map<string, number>();
  const inGen = (k: number) => gen === null || k <= gen;
  if (!d.person(id)) return { root: id, ids, guests: new Set(), stubs: [], plus, founders: new Set(), gen: genOf };

  if (dir === 'down' || dir === 'both') {
    if (by === 'blood') {
      let layer = [id];
      for (let k = 1; layer.length && inGen(k); k++) {
        const next: string[] = [];
        for (const x of layer)
          for (const e of g.childrenOf.get(x) ?? []) {
            if (!natural(e) || ids.has(e.child)) continue;
            ids.add(e.child);
            genOf.set(e.child, k);
            next.push(e.child);
          }
        layer = next;
      }
    } else {
      // созвездия рода по отцам (без предела поколений): по ним решается, в том ли роду дети дочерей. Созвездия
      // самих дочерей не в счёт: выйдя замуж, дочь стоит в роду мужа (Ревекка, Лия, Рахиль — в «Патриархах»)
      // у корня — все его дети (у женщины — по матери); ниже — по отцам
      const rootFemale = d.person(id)?.sex === 'f';
      const edgeKind = (x: string) => (x === id && rootFemale ? 'mother' : 'father');
      const agn = new Set<string>([id]);
      for (let layer = [id]; layer.length; ) {
        const next: string[] = [];
        for (const x of layer)
          for (const e of g.childrenOf.get(x) ?? []) {
            if (e.kind !== edgeKind(x) || e.cert === 'interpretation' || agn.has(e.child)) continue;
            agn.add(e.child);
            next.push(e.child);
          }
        layer = next;
      }
      const own = new Set([...agn].filter((x) => x === id || d.person(x)?.sex !== 'f').map((x) => d.person(x)?.group).filter((x): x is string => !!x));
      const outKids = new Map<string, string[]>();
      let layer = [id];
      for (let k = 1; layer.length && inGen(k); k++) {
        const next: string[] = [];
        for (const x of layer) {
          const daughter = x !== id && d.person(x)?.sex === 'f';
          const kind = daughter ? 'mother' : edgeKind(x);
          for (const e of g.childrenOf.get(x) ?? []) {
            if (!natural(e) || ids.has(e.child)) continue;
            if (e.kind !== kind) continue;
            if (daughter && !own.has(d.person(e.child)?.group ?? '')) {
              const a = outKids.get(x);
              if (a) a.push(e.child);
              else outKids.set(x, [e.child]);
              continue;
            }
            ids.add(e.child);
            genOf.set(e.child, k);
            next.push(e.child);
          }
        }
        layer = next;
      }
      // «+N» у дочери: её потомки по крови, которых нет в показе
      for (const [daughter, kids] of outKids) {
        const seen = new Set<string>();
        const q = kids.filter((k) => !ids.has(k));
        for (const k of q) seen.add(k);
        while (q.length) {
          const x = q.pop()!;
          for (const e of g.childrenOf.get(x) ?? []) {
            if (!natural(e) || seen.has(e.child) || ids.has(e.child)) continue;
            seen.add(e.child);
            q.push(e.child);
          }
        }
        if (seen.size) plus.set(daughter, seen.size);
      }
    }
  }
  if (dir === 'up' || dir === 'both') {
    let layer = [id];
    for (let k = 1; layer.length && inGen(k); k++) {
      const next: string[] = [];
      for (const x of layer)
        for (const e of g.parentsOf.get(x) ?? []) {
          if (!natural(e) || (by === 'father' && e.kind !== 'father') || ids.has(e.parent)) continue;
          ids.add(e.parent);
          genOf.set(e.parent, -k);
          next.push(e.parent);
        }
      layer = next;
    }
  }
  const { guests, stubs } = outward(d, ids, 'stubs');
  // обрывки у рода: только к родителям корня (род вниз) — остальное наружу показывают гости и «+N»
  const keep = stubs.filter((s) => s.from === id && s.key.kind === 'child' && s.key.child === id);
  return { root: id, ids, guests, stubs: dir === 'up' ? [] : keep, plus, founders: new Set(), gen: genOf };
}

/**
 * Подпись обрывка к дочери, ставшей женой лица показа (§ 4.2 п. 1): «дочь Ревекка — жена Исаака». null — если имя
 * мужа не склоняется надёжно (тогда небо рисует зубец без подписи или «дочь Ревекка; муж — Исаак»).
 */
export function daughterWifeWords(d: KinData, daughter: string, husband: string): string {
  const h = gen(d, husband);
  const p = d.person(daughter);
  const rel = childRel(p?.sex);
  return h ? `${rel} ${nameOf(d, daughter)} — ${p?.sex === 'f' ? 'жена' : 'муж'} ${h}` : `${rel} ${nameOf(d, daughter)}; ${p?.sex === 'f' ? 'муж' : 'жена'} — ${nameOf(d, husband)}`;
}

// ---------- по данным атласа ----------

let atlasKin: KinData | null = null;
/** Подключить данные атласа для lineageOf (src/ui/show.ts при загрузке). */
export function useKinData(d: KinData) {
  atlasKin = d;
}
/**
 * Род лица id по данным атласа (этап 11, § 13, стык 3): dir — предки, потомки или оба; gen — поколений (null — все);
 * by — по отцам или по крови. Данные подключает src/ui/show.ts.
 */
export function lineageOf(id: string, dir: LineageDir, gen: number | null, by: LineageBy): Lineage {
  if (!atlasKin) throw new Error('lineageOf: данные атласа не подключены — импортируйте src/ui/show.ts');
  return lineageWith(atlasKin, id, dir, gen, by);
}
