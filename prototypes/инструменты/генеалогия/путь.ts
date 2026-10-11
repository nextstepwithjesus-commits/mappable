/**
 * Путь родства (03 § 6.4) — только то, что нужно шагу 2.0: кратчайший путь в одном прочтении для замера блока «По родству»
 * (бюджет 200 мс, П9) и нити косы по линиям `base/lines` (03 § 3.9; тест § 9: номера косы совпадают с линиями). Без DOM.
 * Рёбра пути — кровные в выборе и союзы; `parents-word`, «предположительно» и толкования в путь не входят.
 */
import type { Граф, Выбор } from './граф.ts';

export interface Звено { от: number; к: number; слово: 'отец' | 'мать' | 'сын' | 'дочь' | 'ребёнок' | 'муж' | 'жена' | 'супруг'; ребро?: number; союз?: number }

function соседи(г: Граф, выбор: Выбор) {
  const к = г.кровь(выбор);
  const N = г.лица.length;
  const adj: Звено[][] = Array.from({ length: N }, () => []);
  for (let c = 0; c < N; c++) for (const t of [к.отец[c], к.мать[c]]) {
    if (t < 0) continue;
    const e = г.рёбра[t];
    adj[c].push({ от: c, к: e.род, слово: e.роль === 'f' ? 'отец' : 'мать', ребро: e.i });
    adj[e.род].push({ от: e.род, к: c, слово: г.лица[c].пол === 'm' ? 'сын' : г.лица[c].пол === 'f' ? 'дочь' : 'ребёнок', ребро: e.i });
  }
  for (const u of г.союзы) {
    adj[u.муж].push({ от: u.муж, к: u.жена, слово: 'жена', союз: u.i });
    adj[u.жена].push({ от: u.жена, к: u.муж, слово: 'муж', союз: u.i });
  }
  return adj;
}

/** Кратчайший путь двусторонним поиском в ширину; null — родства в данных нет. */
export function путьРодства(г: Граф, a: number, b: number, выбор: Выбор = {}): Звено[] | null {
  if (a === b) return [];
  const adj = соседи(г, выбор);
  const fromA = new Map<number, Звено | null>([[a, null]]), fromB = new Map<number, Звено | null>([[b, null]]);
  let qa = [a], qb = [b];
  let meet = -1;
  while (qa.length && qb.length && meet < 0) {
    const [q, mine, other] = qa.length <= qb.length ? [qa, fromA, fromB] : [qb, fromB, fromA];
    const next: number[] = [];
    for (const x of q) {
      for (const z of adj[x]) {
        if (mine.has(z.к)) continue;
        mine.set(z.к, z);
        if (other.has(z.к)) { meet = z.к; break; }
        next.push(z.к);
      }
      if (meet >= 0) break;
    }
    if (q === qa) qa = next; else qb = next;
  }
  if (meet < 0) return null;
  const left: Звено[] = [];
  for (let x = meet; fromA.get(x); x = fromA.get(x)!.от) left.unshift(fromA.get(x)!);
  const right: Звено[] = [];
  for (let x = meet; fromB.get(x); x = fromB.get(x)!.от) {
    const z = fromB.get(x)!;
    const back = adj[z.к].find((y) => y.к === z.от && (y.ребро === z.ребро && y.союз === z.союз))!;
    right.push(back);
  }
  return [...left, ...right];
}

/** Нить косы: лица линии по порядку и рёбра между соседями в прочтениях линии (03 § 3.9). */
export function нить(г: Граф, линия: string) {
  const л = г.линии[линия];
  const выбор = л.rd ?? {};
  const к = г.кровь(выбор);
  const ids = л.ids.map((id) => г.ид(id));
  const шаги = ids.slice(1).map((x, i) => {
    const y = ids[i];
    // соседи по линии — родитель и ребёнок в любом направлении (Матфей идёт вниз, Лука — вверх)
    const вниз = к.отец[x] >= 0 && г.рёбра[к.отец[x]].род === y ? к.отец[x] : к.мать[x] >= 0 && г.рёбра[к.мать[x]].род === y ? к.мать[x] : -1;
    const вверх = к.отец[y] >= 0 && г.рёбра[к.отец[y]].род === x ? к.отец[y] : к.мать[y] >= 0 && г.рёбра[к.мать[y]].род === x ? к.мать[y] : -1;
    return { от: y, к: x, ребро: вниз >= 0 ? вниз : вверх };
  });
  return { имя: л.n, выбор, лица: ids, шаги };
}
