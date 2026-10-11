/**
 * Двойник — всегда в DOM (08 § 6.1 п. 12): все лица леса списком по полкам и порядку леса,
 * блоками с content-visibility: auto (09 § 3.2.1 п. 5). Нужен для замеров «DOM всего» и «INP при полном двойнике».
 * Это не облик двойника 03 § 7.5 — только его объём.
 */
import type { Forest } from '../core/forest.ts';

const BLOCK = 50;

export function twinOrder(f: Forest): number[] {
  const out: number[] = [];
  for (const s of f.shelves) for (const r of s.roots) {
    const st = [r];
    while (st.length) {
      const k = st.pop()!;
      const n = f.nodes[k];
      if (n.kind === 'block') out.push(...n.persons);
      for (let i = n.children.length - 1; i >= 0; i--) st.push(n.children[i]);
    }
  }
  return out;
}

export function Twin({ forest, onPick }: { forest: Forest; onPick: (p: number) => void }) {
  const order = twinOrder(forest);
  const blocks: number[][] = [];
  for (let i = 0; i < order.length; i += BLOCK) blocks.push(order.slice(i, i + BLOCK));
  return (
    <section class="twin" aria-labelledby="twin-h">
      <h2 id="twin-h">Списком: {order.length} лиц</h2>
      <div onClick={(e) => { const p = (e.target as HTMLElement).closest('button')?.dataset.p; if (p) onPick(+p); }}>
        {blocks.map((b) => (
          <ul class="blk" style={{ '--rows': b.length }}>
            {b.map((p) => (
              <li key={p}>
                <button type="button" data-p={p}>{forest.persons[p].name}</button>
                {forest.persons[p].note && <span>{forest.persons[p].note}</span>}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
