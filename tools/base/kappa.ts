/**
 * Согласие двух разметчиков в пробе связей (docs/app/data/пробы/П2-связи-протокол.md; 02 § 6.2): каппа Коэна по виду связи.
 *
 *   npx tsx tools/base/kappa.ts <A.jsonl> <B.jsonl> [<aliases.json>]
 *
 * Единица — пара лиц в главе (без учёта направления). Метка единицы у разметчика — набор видов связи для этой пары в главе
 * («нет», если пары у него нет). Каппа считается по меткам; отдельно — по наличию связи и по каждому виду.
 * aliases.json: { "new:слово": "общий-номер" } — сведение сторон `new:`, которые разметчики назвали по-разному.
 */
import { readFileSync, existsSync } from 'node:fs';

export interface Link { book?: string; ch: number; a: string; b: string; type: number; ref: string; quote?: string; cert?: string }

export function readLinks(path: string): Link[] {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((x) => !x.summary);
}

export function kappa(pairs: [string, string][]): number {
  const n = pairs.length;
  if (!n) return NaN;
  const po = pairs.filter(([x, y]) => x === y).length / n;
  const fa = new Map<string, number>();
  const fb = new Map<string, number>();
  for (const [x, y] of pairs) {
    fa.set(x, (fa.get(x) ?? 0) + 1);
    fb.set(y, (fb.get(y) ?? 0) + 1);
  }
  let pe = 0;
  for (const [k, v] of fa) pe += (v / n) * ((fb.get(k) ?? 0) / n);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

export function compare(A: Link[], B: Link[], alias: Record<string, string> = {}) {
  const id = (x: string) => alias[x] ?? x;
  const key = (l: Link) => {
    const [p, q] = [id(l.a), id(l.b)].sort();
    return `${l.book ? `${l.book} ` : ''}${l.ch}|${p}|${q}`;
  };
  const labels = (xs: Link[]) => {
    const m = new Map<string, Set<number>>();
    for (const l of xs) (m.get(key(l)) ?? m.set(key(l), new Set()).get(key(l))!).add(l.type);
    return m;
  };
  const la = labels(A);
  const lb = labels(B);
  const units = [...new Set([...la.keys(), ...lb.keys()])].sort();
  const lab = (s?: Set<number>) => (s ? [...s].sort((x, y) => x - y).join('+') : 'нет');
  const byLabel = units.map((u) => [lab(la.get(u)), lab(lb.get(u))] as [string, string]);
  const presence = units.map((u) => [la.has(u) ? 'да' : 'нет', lb.has(u) ? 'да' : 'нет'] as [string, string]);
  // по видам — только единицы, где связь есть у обоих
  const both = units.filter((u) => la.has(u) && lb.has(u));
  const typeAgree = both.map((u) => [lab(la.get(u)), lab(lb.get(u))] as [string, string]);
  const perType = new Map<number, { a: number; b: number; both: number }>();
  for (const u of units) {
    for (const t of new Set([...(la.get(u) ?? []), ...(lb.get(u) ?? [])])) {
      const x = perType.get(t) ?? { a: 0, b: 0, both: 0 };
      const inA = la.get(u)?.has(t) ?? false;
      const inB = lb.get(u)?.has(t) ?? false;
      if (inA) x.a++;
      if (inB) x.b++;
      if (inA && inB) x.both++;
      perType.set(t, x);
    }
  }
  const perChapter = new Map<string, [string, string][]>();
  units.forEach((u, i) => {
    const ch = u.split('|')[0];
    (perChapter.get(ch) ?? perChapter.set(ch, []).get(ch)!).push(byLabel[i]);
  });
  return {
    units: units.length, onlyA: units.filter((u) => !lb.has(u)), onlyB: units.filter((u) => !la.has(u)),
    f1: (2 * both.length) / (la.size + lb.size),
    kappaLabel: kappa(byLabel), kappaPresence: kappa(presence), kappaTypeWhereBoth: kappa(typeAgree), bothCount: both.length,
    perType: [...perType].sort(([x], [y]) => x - y),
    perChapter: [...perChapter].sort(([x], [y]) => x.localeCompare(y, 'ru', { numeric: true })).map(([ch, ps]) => ({ ch, n: ps.length, agree: ps.filter(([x, y]) => x === y).length, kappa: kappa(ps) })),
    disagree: units.filter((u, i) => byLabel[i][0] !== byLabel[i][1] && la.has(u) && lb.has(u)).map((u) => ({ u, a: lab(la.get(u)), b: lab(lb.get(u)) })),
  };
}

function main() {
  const [pa, pb, palias] = process.argv.slice(2);
  const alias = palias && existsSync(palias) ? JSON.parse(readFileSync(palias, 'utf8')) : {};
  const r = compare(readLinks(pa), readLinks(pb), alias);
  const f = (x: number) => (Number.isNaN(x) ? '—' : x.toFixed(2));
  console.log(`единиц (пара в главе): ${r.units}; у обоих ${r.bothCount}; только у A ${r.onlyA.length}; только у B ${r.onlyB.length}`);
  console.log(`совпадение состава пар (F1): ${f(r.f1)}`);
  console.log(`каппа: по метке (вид или «нет») ${f(r.kappaLabel)}; по наличию связи ${f(r.kappaPresence)}; по виду, где связь у обоих ${f(r.kappaTypeWhereBoth)}`);
  console.log('по видам (A / B / оба):', r.perType.map(([t, x]) => `${t}: ${x.a}/${x.b}/${x.both}`).join('; '));
  console.log('по главам (единиц, совпало, каппа):', r.perChapter.map((c) => `${c.ch}: ${c.n}, ${c.agree}, ${f(c.kappa)}`).join('; '));
  if (process.argv.includes('--list')) {
    console.log('\nрасходятся по виду:'); for (const d of r.disagree) console.log(`  ${d.u}: A ${d.a} / B ${d.b}`);
    console.log('\nтолько у A:'); for (const u of r.onlyA) console.log(`  ${u}`);
    console.log('\nтолько у B:'); for (const u of r.onlyB) console.log(`  ${u}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
