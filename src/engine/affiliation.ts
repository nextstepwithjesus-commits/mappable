/**
 * Колено и народ лица по предкам (этап 16, решение 183; вынос из src/ui/card/shared.tsx) и «опорное лицо» цвета неба.
 *
 * Цвет на небе — ветви опорного лица (решение 183, поправка владельца к ТЗ § 5.2). Без выбора опорное лицо — Иаков, и
 * оттенок света лица — колено по матери его родоначальника (Быт 35:23–26):
 *  — сыны Лии: Рувим, Симеон, Левий, Иуда, Иссахар, Завулон;
 *  — сыны Рахили: Иосиф (Ефрем, Манассия), Вениамин;
 *  — сыны Валлы: Дан, Неффалим;
 *  — сыны Зелфы: Гад, Асир.
 * Народы — нейтральная пыль, лица до колен — серебро. Колено — по отцам (Чис 1:2, 18), без отца — по матери; если
 * родословие в данных не доведено до сына Иакова — по прозванию, служению левита, созвездию, у жён — по браку.
 *
 * Модуль данных: темы и цвета не знает (цвета — src/render/branches.ts, TRIBE_HUES; свет — src/render/light.ts).
 */
import { byId, graph, groupById } from '../data/atlas.ts';

/** Ключ света лица: мать родоначальника его колена, народ или серебро. */
export type TribeKey = 'leah' | 'rachel' | 'bilhah' | 'zilpah' | 'nations' | 'silver';
/** Ключи четырёх матерей — те, у которых есть оттенок. */
export const HUE_KEYS = ['leah', 'rachel', 'bilhah', 'zilpah'] as const;
export type HueKey = (typeof HUE_KEYS)[number];

/** Четыре матери колен (Быт 35:23–26) → их ключ. */
export const ANCESTRESS: Readonly<Record<string, HueKey>> = { liya: 'leah', rakhil: 'rachel', valla: 'bilhah', zelfa: 'zilpah' };
/** Опорное лицо неба без выбора (решение 183). */
export const REF_DEFAULT = 'iakov';

/** Сыновья Иакова и Иосифа — родоначальники колен (как в карточке, src/ui/card/shared.tsx, TRIBES) → мать. */
export const TRIBE_MOTHER: Readonly<Record<string, HueKey>> = {
  ruvim: 'leah',
  simeon: 'leah',
  leviy: 'leah',
  iuda: 'leah',
  issakhar: 'leah',
  zavulon: 'leah',
  iosif: 'rachel',
  efrem: 'rachel',
  manassiya: 'rachel',
  veniamin: 'rachel',
  dan: 'bilhah',
  neffalim: 'bilhah',
  gad: 'zilpah',
  asir: 'zilpah',
};
/** Родоначальники народов (Быт 19:37–38; 25:2; 36:9; 37:25, 36) — как в карточке (NATIONS). */
export const NATION_FOUNDERS: ReadonlySet<string> = new Set(['isav', 'moav', 'ben-ammi', 'izmail', 'madian']);
/** Дома внутри колена (2 Цар 3:1; Пс 113:18): родоначальник дома. */
export const HOUSE_FOUNDERS: ReadonlySet<string> = new Set(['david', 'aaron', 'saul']);

/** Созвездия колен и домов → мать родоначальника колена (по данным data/groups: колено, дом колена). */
const GROUP_MOTHER: Readonly<Record<string, HueKey>> = {
  reuben: 'leah',
  simeon: 'leah',
  levi: 'leah',
  aaronides: 'leah',
  judah: 'leah',
  davidic: 'leah',
  issachar: 'leah',
  zebulun: 'leah',
  joseph: 'rachel',
  ephraim: 'rachel',
  manasseh: 'rachel',
  benjamin: 'rachel',
  saulides: 'rachel',
  dan: 'bilhah',
  naphtali: 'bilhah',
  gad: 'zilpah',
  asher: 'zilpah',
};
/** Прозвания по колену в уточнении имени («Бани Гадитянин», 2 Цар 23:36) — как в карточке. */
const TRIBE_GENTILIC: [RegExp, string][] = [
  [/(^|[^а-яё])вениамитян(ин|ка)/i, 'veniamin'],
  [/(^|[^а-яё])гадитян(ин|ка)/i, 'gad'],
  [/(^|[^а-яё])завулонян(ин|ка)/i, 'zavulon'],
  [/(^|[^а-яё])рувимлян(ин|ка)/i, 'ruvim'],
  [/(^|[^а-яё])ефремлян(ин|ка)/i, 'efrem'],
];

export type AncestryQual = '' | 'legal' | 'interpretation' | 'inference';
const QUAL_RANK: Record<AncestryQual, number> = { '': 0, inference: 1, legal: 1, interpretation: 2 };
export const isTribeFounder = (id: string) => id in TRIBE_MOTHER;
export const isNationFounder = (id: string) => NATION_FOUNDERS.has(id);

/**
 * Ближайший родоначальник колена или народа по линии отцов и матерей (без связей «по иному указанию»): поиск в ширину
 * вверх по графу; при равной глубине — связь Писания раньше законной и толковательной. house — дом колена на пути.
 * noLegal — без законного отцовства (Мф 1:16): линия крови.
 */
export function byAncestry(id: string, noLegal = false): { founder: string; house: string | null; qual: AncestryQual; self: boolean } | null {
  if (isTribeFounder(id) || isNationFounder(id)) return { founder: id, house: null, qual: '', self: true };
  type Node = { id: string; depth: number; qual: AncestryQual; house: string | null };
  const best = new Map<string, Node>();
  const queue: Node[] = [{ id, depth: 0, qual: '', house: null }];
  let hit: Node | null = null;
  while (queue.length) {
    const n = queue.shift()!;
    if (n.depth > 90) continue;
    for (const e of graph.parentsOf.get(n.id) ?? []) {
      if (e.kind !== 'father' && e.kind !== 'mother') continue;
      if (noLegal && e.claim === 'legal') continue;
      const q: AncestryQual = e.cert === 'interpretation' || n.qual === 'interpretation' ? 'interpretation' : e.claim === 'legal' || n.qual === 'legal' ? 'legal' : '';
      const house = n.house ?? (HOUSE_FOUNDERS.has(e.parent) ? e.parent : null);
      const next: Node = { id: e.parent, depth: n.depth + 1, qual: q, house };
      if (isTribeFounder(e.parent) || isNationFounder(e.parent)) {
        if (!hit || QUAL_RANK[q] < QUAL_RANK[hit.qual] || (QUAL_RANK[q] === QUAL_RANK[hit.qual] && next.depth < hit.depth)) hit = next;
        continue;
      }
      const seen = best.get(e.parent);
      if (seen && QUAL_RANK[seen.qual] <= QUAL_RANK[q]) continue;
      best.set(e.parent, next);
      queue.push(next);
    }
  }
  if (!hit) return null;
  // законная линия и линия по толкованию ведут к одному колену и дому — колено названо без пометы
  const other = hit.qual === 'legal' && !noLegal ? byAncestry(id, true) : null;
  const agreed = !!other && other.founder === hit.id && other.house === hit.house;
  return { founder: hit.id, house: hit.house, qual: agreed ? '' : hit.qual, self: false };
}

/** Созвездие лица или его родители по иерархии созвездий — внутри народа (флаг foreign). */
function foreignGroup(gid: string): boolean {
  for (let g = groupById.get(gid), k = 0; g && k < 8; g = g.parent ? groupById.get(g.parent) : undefined, k++) if (g.foreign) return true;
  return false;
}
/** Мать родоначальника колена созвездия (или его родительского созвездия); null — созвездие не колено. */
export function groupMother(gid: string): HueKey | null {
  for (let g = groupById.get(gid), k = 0; g && k < 8; g = g.parent ? groupById.get(g.parent) : undefined, k++) {
    const m = GROUP_MOTHER[g.id];
    if (m) return m;
  }
  return null;
}

const memo = new Map<string, TribeKey>();
/** Ключ по родословию без брака: колено по предкам, сын или дочь Иакова, прозвание, служение левита. */
function ownKey(id: string): TribeKey | null {
  if (ANCESTRESS[id]) return ANCESTRESS[id];
  const p = byId.get(id);
  if (!p) return null;
  // дети Иакова — по матери (Дина, дочь Лии, Быт 30:21)
  if (p.father === REF_DEFAULT && p.mother && ANCESTRESS[p.mother]) return ANCESTRESS[p.mother];
  const a = byAncestry(id);
  if (a) return TRIBE_MOTHER[a.founder] ?? 'nations';
  const dis = p.disambig ?? '';
  for (const [re, tribe] of TRIBE_GENTILIC) if (re.test(dis)) return TRIBE_MOTHER[tribe];
  if (p.roles.includes('levite')) return 'leah';
  return null;
}

/**
 * Ключ света лица (решение 183): колено по отцам → мать родоначальника; родословие не доведено — по созвездию, у жён —
 * по колену мужа; народы — 'nations'; лица до колен и без колена — 'silver'.
 */
export function tribeKey(id: string): TribeKey {
  const hit = memo.get(id);
  if (hit) return hit;
  let k = ownKey(id);
  const p = byId.get(id);
  if (!k && p) {
    // жена — в колене мужа (по браку), если муж из колена; иначе — по созвездию
    if (p.sex === 'f')
      for (const s of graph.spousesOf.get(id) ?? []) {
        const h = s.a === id ? s.b : s.a;
        const hk = h ? ownKey(h) : null;
        if (hk && hk !== 'nations') {
          k = hk;
          break;
        }
      }
    if (!k) k = groupMother(p.group);
    if (!k && foreignGroup(p.group)) k = 'nations';
  }
  const out: TribeKey = k ?? 'silver';
  memo.set(id, out);
  return out;
}

/** Опорное лицо цвета неба: выбранное, без выбора — Иаков (решение 183). */
export function refPerson(selected: string | null | undefined): string {
  return selected || REF_DEFAULT;
}
/** Опорное лицо — Иаков или одна из четырёх матерей: цвет ветви равен оттенку колена (решение 183, «без перескока»). */
export function tribeRef(ref: string | null | undefined): boolean {
  return !ref || ref === REF_DEFAULT || !!ANCESTRESS[ref];
}
