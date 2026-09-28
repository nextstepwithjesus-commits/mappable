/**
 * Союзы (решение владельца 67): брак или связь двух лиц, от которой родились дети, — «карточка союза» между родителями
 * и детьми. Союз строится только из данных: связи «отец», «мать» и «супруг» (жена, наложница) с их стихами. Если у детей
 * назван только отец (или только мать), второе место союза пусто: «мать не названа». Союз без детей — брак, названный
 * в тексте (Давид и Мелхола). Утверждения о родителях иного рода (по закону, по Луке, по толкованию) дают союз
 * происхождения с пометой вида — у лица может быть несколько таких союзов (Иосиф, муж Марии: Иаков по Мф 1:16 и Илий
 * по Лк 3:23).
 *
 * Модуль чистый: получает граф (src/engine/graph.ts) и не знает об интерфейсе.
 */
import type { Cert } from '../data/types.ts';
import type { Graph, ParentEdge } from './graph.ts';

export type UnionKind = 'wife' | 'concubine' | 'parents';

export interface Union {
  /** «u:отец+мать»; пустое место — пустая строка: «u:set+» (мать не названа), «u:+mariya» (отец не назван) */
  id: string;
  /** муж или отец; null — не назван */
  a: string | null;
  /** жена или мать; null — не названа */
  b: string | null;
  /** вид связи по тексту: жена, наложница; 'parents' — названы только как родители детей */
  kind: UnionKind;
  /** стихи связи супругов (или, если её нет, — стихи родства первого ребёнка) */
  refs: string[];
  /** уровень достоверности связи супругов */
  cert: Cert;
  /** пояснение составителя к браку, если есть */
  note?: string;
  /** порядок брака у мужа по данным (order супружеской связи), если есть */
  order?: number;
  /** дети этого союза — в порядке данных (порядок рождения задаёт интерфейс по хронологии) */
  kids: string[];
  /**
   * Вид утверждения о происхождении детей, если это не кровные отец и мать: 'legal' (законный отец, Мф 1:16), 'by-luke'
   * (Лк 3), 'levirate', 'adoptive', 'alternative', 'ancestor'. У обычного союза — undefined.
   */
  claim?: string;
  /** уровень достоверности происхождения детей (худший из связей «отец/мать» детей союза) */
  kidsCert: Cert;
}

const CERT_RANK: Record<Cert, number> = { scripture: 0, inference: 1, interpretation: 2 } as Record<Cert, number>;
const worse = (a: Cert, b: Cert): Cert => ((CERT_RANK[a] ?? 0) >= (CERT_RANK[b] ?? 0) ? a : b);

export const unionId = (a: string | null, b: string | null, claim?: string) => `u:${a ?? ''}+${b ?? ''}${claim ? `~${claim}` : ''}`;

export interface Unions {
  byId: Map<string, Union>;
  /** союзы, где лицо — муж, жена, отец или мать; по порядку брака, затем по порядку данных */
  of: Map<string, Union[]>;
  /** союзы происхождения лица: первым — кровные отец и мать, затем иные утверждения (по закону, по Луке…) */
  origin: Map<string, Union[]>;
}

/**
 * Все союзы по графу. Кровные отец и мать ребёнка (связи 'father' и 'mother' с claim 'natural' или 'legal' у основного
 * отца) дают союз «отец + мать»; иные утверждения (other-father, other-mother) — отдельный союз с claim.
 */
export function buildUnions(g: Graph): Unions {
  const byIdU = new Map<string, Union>();
  const origin = new Map<string, Union[]>();
  const pushOrigin = (child: string, u: Union) => {
    const a = origin.get(child);
    if (!a) origin.set(child, [u]);
    else if (!a.includes(u)) a.push(u);
  };
  const spouseEdge = (a: string | null, b: string | null) => {
    if (!a || !b) return undefined;
    return (g.spousesOf.get(a) ?? []).find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  };
  /** Союз пары; key — утверждение иного рода (other-*), оно даёт отдельный союз; claim — вид отцовства у союза. */
  const get = (a: string | null, b: string | null, key?: string, claim = key): Union => {
    const id = unionId(a, b, key);
    let u = byIdU.get(id);
    if (!u) {
      const s = key ? undefined : spouseEdge(a, b);
      u = {
        id,
        a,
        b,
        kind: s ? (s.kind === 'concubine' ? 'concubine' : 'wife') : 'parents',
        refs: s ? [...s.refs] : [],
        cert: s ? s.cert : 'scripture',
        note: s?.note,
        order: s?.order,
        kids: [],
        claim,
        kidsCert: 'scripture',
      };
      byIdU.set(id, u);
    }
    return u;
  };

  // 1. дети по основным отцу и матери; иные утверждения — отдельные союзы с claim
  for (const child of g.order) {
    const edges = g.parentsOf.get(child) ?? [];
    const father = edges.find((e) => e.kind === 'father');
    const mother = edges.find((e) => e.kind === 'mother');
    if (father || mother) {
      // законный отец основной линии (Иосиф — Иисус) — тот же союз пары с пометой, чтобы карточка сказала «по закону»
      const u = get(father?.parent ?? null, mother?.parent ?? null);
      if (father && father.claim !== 'natural') u.claim = father.claim;
      if (!u.kids.includes(child)) u.kids.push(child);
      if (!u.refs.length) u.refs = [...(father?.refs ?? mother?.refs ?? [])];
      u.kidsCert = worse(u.kidsCert, worse(father?.cert ?? 'scripture', mother?.cert ?? 'scripture'));
      pushOrigin(child, u);
    }
    for (const e of edges) {
      if (e.kind !== 'other-father' && e.kind !== 'other-mother') continue;
      const u = e.kind === 'other-father' ? get(e.parent, null, e.claim) : get(null, e.parent, e.claim);
      if (!u.kids.includes(child)) u.kids.push(child);
      if (!u.refs.length) u.refs = [...e.refs];
      u.kidsCert = worse(u.kidsCert, e.cert);
      pushOrigin(child, u);
    }
  }
  // 2. браки без детей (и браки, у детей которых мать не названа, — отдельно не заводятся: союз «отец + » остаётся)
  for (const [id, es] of g.spousesOf)
    for (const e of es) {
      if (e.a !== id) continue;
      const pa = g.persons.get(e.a);
      const pb = g.persons.get(e.b);
      if (!pa || !pb) continue;
      // муж — первым; у пары «женщина — husband» стороны меняются
      const [a, b] = pa.sex === 'f' && pb.sex !== 'f' ? [e.b, e.a] : [e.a, e.b];
      get(a, b);
    }

  // 3. союзы лица: по порядку брака (order), затем по порядку данных первого ребёнка, союз без второго лица — последним
  const of = new Map<string, Union[]>();
  const at = new Map(g.order.map((id, i) => [id, i]));
  const first = (u: Union) => (u.kids.length ? Math.min(...u.kids.map((k) => at.get(k) ?? 1e9)) : 1e9);
  for (const u of byIdU.values())
    for (const p of [u.a, u.b]) {
      if (!p) continue;
      const a = of.get(p);
      if (a) a.push(u);
      else of.set(p, [u]);
    }
  // место супруга в списке супругов лица — порядок, в котором их называют данные (Сарра, Агарь, Хеттура)
  const spouseAt = (p: string, u: Union) => {
    const other = partnerIn(u, p);
    const list = g.persons.get(p)?.spouses ?? [];
    const i = other ? list.findIndex((s) => s.id === other) : -1;
    return i < 0 ? 1e6 : i;
  };
  for (const [p, list] of of)
    list.sort((x, y) => {
      if (!!x.claim !== !!y.claim) return x.claim ? 1 : -1;
      const ox = x.order ?? 1e6;
      const oy = y.order ?? 1e6;
      if (ox !== oy) return ox - oy;
      const sx = spouseAt(p, x);
      const sy = spouseAt(p, y);
      if (sx !== sy) return sx - sy;
      const fx = first(x);
      const fy = first(y);
      if (fx !== fy) return fx - fy;
      return (x.b === null ? 1 : 0) - (y.b === null ? 1 : 0);
    });
  for (const list of origin.values()) list.sort((x, y) => (x.claim ? 1 : 0) - (y.claim ? 1 : 0));
  return { byId: byIdU, of, origin };
}

/** Другое лицо союза для лица id (супруг или второй родитель); null — не назван. */
export const partnerIn = (u: Union, id: string): string | null => (u.a === id ? u.b : u.b === id ? u.a : null);

/** Все лица союза: оба супруга (если названы) и дети. */
export const membersOf = (u: Union): string[] => [...(u.a ? [u.a] : []), ...(u.b ? [u.b] : []), ...u.kids];

/** Связи ребёнка с родителями этого союза (для стихов карточки союза). */
export function kidEdges(g: Graph, u: Union, kid: string): ParentEdge[] {
  return (g.parentsOf.get(kid) ?? []).filter((e) => e.parent === u.a || e.parent === u.b);
}

/** Ветвь потомка выбранного лица (решение 69): номер ветви, поколение (1 — дети) и союз, через который она идёт. */
export interface Branch {
  branch: number;
  gen: number;
  union: string;
}

/**
 * Потомки лица id по ветвям (решение 69, «по ветвям»): если у лица два союза с детьми и больше — ветвь это союз
 * (Сарра, Агарь, Хеттура); если союз один — ветвь это ребёнок (Сим, Хам, Иафет). keys — ключи ветвей по порядку:
 * id союза или id ребёнка. Обход — по основным отцу и матери (кровным и законным), не дальше maxGen поколений; лицо,
 * достижимое двумя путями, остаётся в ветви ближайшего пути; при равенстве — пути по отцу, затем первой по порядку.
 */
export function branchesOf(U: Unions, g: Graph, id: string, maxGen = 30): { desc: Map<string, Branch>; keys: string[] } {
  const own = (U.of.get(id) ?? []).filter((u) => !u.claim && u.kids.length);
  const desc = new Map<string, Branch>();
  const keys: string[] = [];
  const queue: string[] = [];
  const seed = (kid: string, key: string, union: string) => {
    let b = keys.indexOf(key);
    if (b < 0) b = keys.push(key) - 1;
    if (desc.has(kid)) return;
    desc.set(kid, { branch: b, gen: 1, union });
    queue.push(kid);
  };
  if (own.length > 1) for (const u of own) for (const k of u.kids) seed(k, u.id, u.id);
  else if (own.length === 1) for (const k of own[0].kids) seed(k, k, own[0].id);
  // по поколениям: в каждом сначала пути по отцу, потом по матери — царь Авия идёт в ветвь Ровоама (сына Соломона),
  // а не матери Маахи, внучки Авессалома (3 Цар 15:1–2)
  for (let layer = queue; layer.length; ) {
    const next: string[] = [];
    for (const kind of ['father', 'mother'] as const)
      for (const p of layer) {
        const at = desc.get(p)!;
        if (at.gen >= maxGen) continue;
        for (const e of g.childrenOf.get(p) ?? []) {
          if (e.kind !== kind || desc.has(e.child) || e.child === id) continue;
          desc.set(e.child, { branch: at.branch, gen: at.gen + 1, union: at.union });
          next.push(e.child);
        }
      }
    layer = next;
  }
  return { desc, keys };
}
