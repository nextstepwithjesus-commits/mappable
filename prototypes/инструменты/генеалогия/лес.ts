/**
 * Лес Генеалогии (03 § 3.3 п. 1; 09 § 3.3): порядок, ряды, острова и полки — при прочтениях по умолчанию, без пикселей.
 * Основа — проба П-Т1 (`prototypes/П-Т1/core/forest.ts`); добавлено то, что проба упрощала, и правила шага 2.0:
 * - отсылы рёбер другого места и приёмных: линия с ярлыком, только если отец стоит в том же острове ровно на ряд выше ребёнка,
 *   иначе — отсыл у обоих концов (03 § 3.3, § 5);
 * - лицо, чьи рёбра действуют только в другом прочтении, — у предка из того же прочтения, со словами прочтения и без кровной
 *   линии: Каинан, сын Арфаксада, — «по Лк 3:36» (03 § 3.3);
 * - «из сыновей такого-то» — группа у предка (03 § 3.2); её лица — под группой;
 * - союз, жена которого стоит в другом месте (Фамарь у Ира, дочери Лота у отца), — отсыл у мужа (03 § 3.3);
 * - ребро Иосифа у Иисуса Христа (`parents-word`) родителем раскладки не бывает: Иисус Христос стоит под Марией (03 § 3.1).
 * Гребёнка детей и свёртка «больше трёх союзов» не строятся (упрощение П-Т1: лес только шире).
 */
import { type Граф, ДРУГОЕ_МЕСТО, type Ребро } from './граф.ts';

export type ВидУзла = 'block' | 'wife-ref' | 'group';

/** Отсыл внутри блока: к другому концу ребра или союза. */
export interface Отсыл {
  вид: 'other' | 'union' | 'reading' | 'ancestor';
  /** Лицо на другом конце. */
  к: number;
  /** Ребро или союз (номер в графе). */
  ребро?: number;
  союз?: number;
  /** Подпись отсыла. */
  текст: string;
  /** Лицо блока, у которого стоит отсыл. */
  у: number;
}

export interface Узел {
  key: number;
  вид: ВидУзла;
  /** Лица блока слева направо: глава, затем жёны в порядке текста; у отсыла жены — одно лицо; у группы — предок. */
  лица: number[];
  /** Отсылы блока (после лиц). */
  отсылы: Отсыл[];
  дети: number[];
  родитель: number;
  ряд: number;
  полка: number;
  остров: number;
  /** Для отсыла жены — её муж. */
  муж?: number;
  /** Лицо стоит по другому прочтению (Каинан): ребро. */
  чтение?: number;
  /** Слот линии от родителя: −1 — знак главы; k ≥ 1 — точка союза жены k (лицо блока k); 100 + k — знак жены k. */
  слот: number;
}

export interface Полка { имя: string; корни: number[]; рядов: number; номера: boolean }

/** Ребро, нарисованное линией с ярлыком (другое место, приёмное, слово текста, `parents-word`). */
export interface Ярлык { ребро: number; род: number; реб: number; текст: string }

export interface Лес {
  граф: Граф;
  узлы: Узел[];
  полки: Полка[];
  /** Узел, где стоит лицо (у жены — блок мужа; у лица из группы — свой блок). −1 — лица нет в Генеалогии. */
  узелЛица: Int32Array;
  /** Родитель раскладки (лицо или −1) и его ребро. */
  родитель: Int32Array;
  ребро: Int32Array;
  в: Uint8Array;
  островов: number;
  размерОстрова: number[];
  ярлыки: Ярлык[];
  /** Порядок леса: номер узла → место в обходе (порядок DOM и стрелок). */
  порядок: Int32Array;
}

const КОНТУР = new Set(['tribe', 'house', 'nation']);
const ДРУГИЕ = 'Другие семьи';

export function текстДругого(г: Граф, e: Ребро, конец: 'реб' | 'род'): string {
  const кто = г.имя(конец === 'реб' ? e.род : e.реб);
  const адрес = e.стихи[0] ?? '';
  if (e.вид === 'by-luke') return конец === 'реб' ? `Лука: отец — ${кто} (${адрес})` : `Лука: сын — ${кто} (${адрес})`;
  if (e.вид === 'adoptive') return конец === 'реб' ? `приёмный родитель: ${кто} (${адрес})` : `приёмный ребёнок: ${кто} (${адрес})`;
  if (e.вид === 'parents-word') return `«родители Его» (Лк 2:41)`;
  if (e.вид === 'text-word') return конец === 'реб' ? `«отец»: ${кто} (${адрес})` : `«сын»: ${кто} (${адрес})`;
  return конец === 'реб' ? `другое место: отец — ${кто} (${адрес})` : `другое место: сын — ${кто} (${адрес})`;
}

export function построитьЛес(г: Граф): Лес {
  const N = г.лица.length;
  const def = {} as Record<string, string>;
  const кр = г.кровь(def);
  const рёбра = г.рёбра;

  // 1. Родитель раскладки: кровный отец, без отца — мать; без кровного — предок «из сыновей» или слово текста
  const lp = new Int32Array(N).fill(-1);
  const lpE = new Int32Array(N).fill(-1);
  for (let c = 0; c < N; c++) {
    const e = кр.отец[c] >= 0 ? кр.отец[c] : кр.мать[c];
    if (e >= 0 && рёбра[e].вид === 'natural') { lp[c] = рёбра[e].род; lpE[c] = e; }
  }
  const чтение = new Int32Array(N).fill(-1);
  for (const e of рёбра) {
    if (lp[e.реб] >= 0) continue;
    if (e.вид === 'ancestor' || e.вид === 'text-word') { if (г.действует(e, def)) { lp[e.реб] = e.род; lpE[e.реб] = e.i; } }
  }
  // лицо, чьё кровное ребро действует только в другом прочтении (Каинан): у предка из того прочтения, без кровной линии
  for (const e of рёбра) {
    if (lp[e.реб] >= 0 || e.вид !== 'natural' || !e.набор || г.действует(e, def)) continue;
    lp[e.реб] = e.род; lpE[e.реб] = e.i; чтение[e.реб] = e.i;
  }
  for (let i = 0; i < N; i++) {
    const seen = new Set<number>([i]);
    let x = lp[i];
    while (x >= 0) { if (seen.has(x)) { lp[i] = -1; lpE[i] = -1; break; } seen.add(x); x = lp[x]; }
  }

  // лица Генеалогии: в любом ребре или союзе
  const inG = new Uint8Array(N);
  for (const e of рёбра) inG[e.реб] = inG[e.род] = 1;
  for (const u of г.союзы) inG[u.муж] = inG[u.жена] = 1;

  // 2. Жена стоит у мужа (первого по тексту); союз с отцом — исключение
  const уМужа = new Int32Array(N).fill(-1);
  const жёны = new Map<number, number[]>();
  for (const u of г.союзы) {
    const h = u.муж, w = u.жена;
    if (h === w || уМужа[w] >= 0 || уМужа[h] >= 0 || lp[w] === h || жёны.has(w)) continue;
    let x = lp[h], cyc = false;
    while (x >= 0) { if (x === w) { cyc = true; break; } x = lp[x]; }
    if (cyc) continue;
    уМужа[w] = h;
    if (!жёны.has(h)) жёны.set(h, []);
    жёны.get(h)!.push(w);
  }

  // 3. Узлы
  const узлы: Узел[] = [];
  const узелЛица = new Int32Array(N).fill(-1);
  const mk = (вид: ВидУзла, лица: number[], extra: Partial<Узел> = {}) => {
    const key = узлы.length;
    узлы.push({ key, вид, лица, отсылы: [], дети: [], родитель: -1, ряд: 0, полка: 0, остров: -1, слот: -1, ...extra });
    return key;
  };
  for (let i = 0; i < N; i++) {
    if (!inG[i] || уМужа[i] >= 0) continue;
    const k = mk('block', [i, ...(жёны.get(i) ?? [])], чтение[i] >= 0 ? { чтение: чтение[i] } : {});
    for (const p of узлы[k].лица) узелЛица[p] = k;
  }
  // группы «из сыновей»: одна на предка
  const группа = new Map<number, number>();
  type Kid = { node: number; слот: number; order: number; e: number };
  const kids = new Map<number, Kid[]>();
  const addKid = (pn: number, kid: Kid) => { if (!kids.has(pn)) kids.set(pn, []); kids.get(pn)!.push(kid); };
  const слотРебёнка = (c: number): number => {
    const pn = узелЛица[lp[c]];
    const лица = узлы[pn].лица;
    const ip = лица.indexOf(lp[c]);
    if (ip > 0) return 100 + ip; // родитель раскладки — жена в блоке (Иисус Христос под Марией)
    const m = кр.мать[c] >= 0 ? рёбра[кр.мать[c]].род : -1;
    const im = m >= 0 ? лица.indexOf(m) : -1;
    return im > 0 && lp[c] !== m ? im : -1;
  };
  for (let c = 0; c < N; c++) {
    if (!inG[c] || lp[c] < 0) continue;
    let pn = узелЛица[lp[c]];
    if (pn < 0) continue;
    const e = рёбра[lpE[c]];
    const order = e.порядок ?? 1e6;
    if (e.вид === 'ancestor') {
      let g = группа.get(lp[c]);
      if (g === undefined) {
        g = mk('group', [lp[c]]);
        группа.set(lp[c], g);
        addKid(pn, { node: g, слот: pn >= 0 && узлы[pn].лица[0] === lp[c] ? -1 : 100 + узлы[pn].лица.indexOf(lp[c]), order: 2e6, e: -1 });
      }
      pn = g;
    }
    const слот = узлы[pn].вид === 'group' ? -1 : слотРебёнка(c);
    if (уМужа[c] >= 0) {
      const r = mk('wife-ref', [c], { муж: уМужа[c] });
      addKid(pn, { node: r, слот, order, e: e.i });
    } else addKid(pn, { node: узелЛица[c], слот, order, e: e.i });
  }
  for (const [pn, ks] of kids) {
    // дети по союзам: сначала у главы без матери, потом по жёнам; внутри — порядок текста
    const ранг = (s: number) => (s < 0 ? 0 : s >= 100 ? s - 100 : s);
    ks.sort((a, b) => ранг(a.слот) - ранг(b.слот) || a.order - b.order || a.e - b.e);
    узлы[pn].дети = ks.map((k) => k.node);
    for (const k of ks) { узлы[k.node].родитель = pn; узлы[k.node].слот = k.слот; }
  }

  // 4. Острова: связные части по рёбрам раскладки и союзам
  const uf = new Int32Array(N).map((_, i) => i);
  const find = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const join = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) uf[a] = b; };
  for (let c = 0; c < N; c++) if (lp[c] >= 0 && inG[c]) join(c, lp[c]);
  for (const u of г.союзы) join(u.муж, u.жена);
  const compId = new Map<number, number>();
  const размер: number[] = [];
  const compOf = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!inG[i]) continue;
    const r = find(i);
    if (!compId.has(r)) { compId.set(r, размер.length); размер.push(0); }
    compOf[i] = compId.get(r)!;
    размер[compOf[i]]++;
  }
  for (const n of узлы) n.остров = compOf[n.лица[0]];

  // 5. Ряды: глубина от корня; деревья острова выравниваются по отсылам жён и по союзам
  const depth = new Int32Array(узлы.length).fill(-1);
  const rootOf = new Int32Array(узлы.length).fill(-1);
  const roots = узлы.filter((n) => n.родитель < 0).map((n) => n.key);
  for (const r of roots) {
    const st = [r];
    depth[r] = 0; rootOf[r] = r;
    while (st.length) { const x = st.pop()!; for (const c of узлы[x].дети) { depth[c] = depth[x] + 1; rootOf[c] = r; st.push(c); } }
  }
  const offset = new Map<number, number>();
  const adam = г.ид('adam');
  const mainIsland = adam >= 0 && inG[adam] ? compOf[adam] : 0;
  const byIsland = new Map<number, number[]>();
  for (const r of roots) { const isl = узлы[r].остров; if (!byIsland.has(isl)) byIsland.set(isl, []); byIsland.get(isl)!.push(r); }
  const links = new Map<number, [number, number][]>();
  const link = (a: number, b: number) => {
    const ra = rootOf[a], rb = rootOf[b];
    if (ra < 0 || rb < 0 || ra === rb) return;
    if (!links.has(ra)) links.set(ra, []);
    if (!links.has(rb)) links.set(rb, []);
    links.get(ra)!.push([a, b]);
    links.get(rb)!.push([b, a]);
  };
  for (const n of узлы) if (n.вид === 'wife-ref') link(n.key, узелЛица[n.муж!]);
  for (const u of г.союзы) if (узелЛица[u.муж] >= 0 && узелЛица[u.жена] >= 0) link(узелЛица[u.муж], узелЛица[u.жена]);
  const size = (r: number) => { let s = 0; const st = [r]; while (st.length) { const x = st.pop()!; s++; st.push(...узлы[x].дети); } return s; };
  for (const [isl, rs] of byIsland) {
    const sized = rs.map((r) => ({ r, s: size(r) }));
    sized.sort((a, b) => b.s - a.s || a.r - b.r);
    if (isl === mainIsland && adam >= 0) {
      const ai = sized.findIndex((x) => x.r === узелЛица[adam]);
      if (ai > 0) sized.unshift(...sized.splice(ai, 1));
    }
    offset.set(sized[0].r, 0);
    let progress = true;
    while (progress) {
      progress = false;
      for (const { r } of sized) {
        if (offset.has(r)) continue;
        for (const [mine, other] of links.get(r) ?? []) {
          const or = rootOf[other];
          if (!offset.has(or)) continue;
          offset.set(r, offset.get(or)! + depth[other] - depth[mine]);
          progress = true;
          break;
        }
      }
    }
    for (const { r } of sized) if (!offset.has(r)) offset.set(r, 0);
    const min = Math.min(...sized.map(({ r }) => offset.get(r)!));
    for (const { r } of sized) offset.set(r, offset.get(r)! - Math.min(0, min));
    byIsland.set(isl, sized.map((x) => x.r));
  }
  for (const n of узлы) n.ряд = depth[n.key] + offset.get(rootOf[n.key])!;

  // 6. Отсылы и ярлыки рёбер, которые не стоят родителем раскладки
  const ярлыки: Ярлык[] = [];
  const обычнаяМать = (e: Ребро) => e.роль === 'm' && e.вид === 'natural' && lp[e.реб] >= 0 && lp[e.реб] !== e.род && кр.мать[e.реб] === e.i;
  for (const e of рёбра) {
    if (lpE[e.реб] === e.i || !inG[e.реб] || узелЛица[e.реб] < 0 || узелЛица[e.род] < 0) continue;
    if (обычнаяМать(e)) continue;
    // мать по другому месту — тот же отсыл, что у отца
    const nc = узлы[узелЛица[e.реб]], np = узлы[узелЛица[e.род]];
    if (e.вид === 'ancestor') {
      nc.отсылы.push({ вид: 'ancestor', к: e.род, ребро: e.i, текст: `из сыновей: ${г.имя(e.род)} (${e.стихи[0] ?? ''})`, у: e.реб });
      continue;
    }
    if (чтение[e.реб] === e.i) continue;
    const линия = np.остров === nc.остров && np.ряд === nc.ряд - 1 && (ДРУГОЕ_МЕСТО.has(e.вид) || e.вид === 'adoptive' || e.вид === 'parents-word' || e.вид === 'text-word');
    if (линия) ярлыки.push({ ребро: e.i, род: e.род, реб: e.реб, текст: текстДругого(г, e, 'реб') });
    else {
      nc.отсылы.push({ вид: 'other', к: e.род, ребро: e.i, текст: текстДругого(г, e, 'реб'), у: e.реб });
      np.отсылы.push({ вид: 'other', к: e.реб, ребро: e.i, текст: текстДругого(г, e, 'род'), у: e.род });
    }
  }
  for (const n of узлы) if (n.чтение !== undefined) {
    const e = рёбра[n.чтение];
    const н = e.набор ? г.наборы.get(e.набор) : undefined;
    const п = н?.прочтения.find((x) => e.в?.includes(x.id));
    n.отсылы.unshift({ вид: 'reading', к: e.род, ребро: e.i, текст: `по другому прочтению: ${п?.название ?? e.стихи.join('; ')}`, у: e.реб });
  }
  // союз, жена которого стоит не у этого мужа
  for (const u of г.союзы) {
    const nh = узелЛица[u.муж];
    if (nh < 0 || узлы[nh].лица.includes(u.жена)) continue;
    const где = уМужа[u.жена] >= 0 ? `стоит у: ${г.имя(уМужа[u.жена])}` : lp[u.жена] === u.муж ? 'стоит среди детей' : 'стоит в своей семье';
    узлы[nh].отсылы.push({ вид: 'union', к: u.жена, союз: u.i, текст: `союз: ${г.имя(u.жена)} — ${словоСоюза(u.виды)}; ${где}`, у: u.муж });
  }

  // 7. Полки
  const areas = new Map(г.области.map((a) => [a.id, a]));
  const hasContour = (id: string) => { const a = areas.get(id); return !!a && КОНТУР.has(a.k) && !!a.f; };
  const contourOf = (id: string): string | undefined => {
    let a = areas.get(id);
    const seen = new Set<string>();
    while (a && !seen.has(a.id)) { if (hasContour(a.id)) return a.id; seen.add(a.id); a = a.pa ? areas.get(a.pa) : undefined; }
    return undefined;
  };
  const areaOf = new Map<number, string>();
  for (const m of г.членства) { const i = г.ид(m[0] ?? ''); if (i >= 0 && !areaOf.has(i) && m[1]) areaOf.set(i, m[1]); }
  const shelfName = new Map<number, string>();
  const areaCount = new Map<number, Map<string, number>>();
  for (const [i, a] of areaOf) {
    const isl = compOf[i];
    if (isl < 0) continue;
    if (!areaCount.has(isl)) areaCount.set(isl, new Map());
    const m = areaCount.get(isl)!;
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  for (const isl of byIsland.keys()) {
    if (isl === mainIsland) continue;
    const cnt = areaCount.get(isl) ?? new Map<string, number>();
    const top = [...cnt].map(([a, n]) => [contourOf(a), n] as const).filter(([c]) => c).sort((a, b) => b[1] - a[1] || (a[0]! < b[0]! ? -1 : 1))[0];
    shelfName.set(isl, top ? areas.get(top[0]!)!.n : ДРУГИЕ);
  }
  const полки: Полка[] = [{ имя: 'Главный лес', корни: byIsland.get(mainIsland) ?? [], рядов: 0, номера: true }];
  const порядокПолок = [...г.области.filter((a) => hasContour(a.id)).map((a) => a.n), ДРУГИЕ];
  for (const имя of порядокПолок) {
    const isls = [...shelfName].filter(([, n]) => n === имя).map(([i]) => i);
    if (!isls.length) continue;
    isls.sort((a, b) => размер[b] - размер[a] || a - b);
    полки.push({ имя, корни: isls.flatMap((i) => byIsland.get(i)!), рядов: 0, номера: false });
  }
  const порядок = new Int32Array(узлы.length).fill(-1);
  let k = 0;
  полки.forEach((s, si) => {
    let рядов = 0;
    for (const r of s.корни) {
      const st = [r];
      while (st.length) {
        const x = st.pop()!;
        узлы[x].полка = si;
        порядок[x] = k++;
        рядов = Math.max(рядов, узлы[x].ряд + 1);
        for (let j = узлы[x].дети.length - 1; j >= 0; j--) st.push(узлы[x].дети[j]);
      }
    }
    s.рядов = рядов;
  });
  return { граф: г, узлы, полки, узелЛица, родитель: lp, ребро: lpE, в: inG, островов: размер.length, размерОстрова: размер, ярлыки, порядок };
}

export function словоСоюза(виды: string[]): string {
  if (виды.includes('non-marital')) return 'союз без брака · выв.';
  if (виды.includes('not-stated')) return 'браком не назван · выв.';
  if (виды.includes('marriage')) return виды.includes('concubine') ? 'жена; наложница' : 'жена';
  if (виды.includes('maid-as-wife')) return 'в жену';
  if (виды.includes('concubine')) return 'наложница';
  return виды.join(', ');
}

/** Ряд схемы от корня по родителю раскладки (как row() в 03-числа.py). */
export function рядПоРодителю(л: Лес, i: number): number {
  let d = 0;
  let x = i;
  while (л.родитель[x] >= 0) { x = л.родитель[x]; d++; }
  return d;
}
