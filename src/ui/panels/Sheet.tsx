import type { ComponentChildren } from 'preact';
import { panel } from '../../state.ts';
import { skyRef } from '../common.tsx';

export function Sheet({ title, lead, wide, children }: { title: string; lead?: string; wide?: boolean; children: ComponentChildren }) {
  return (
    <section class={wide ? 'sheet wide' : 'sheet'} aria-label={title}>
      <button class="close" onClick={() => (panel.value = null)}>
        закрыть
      </button>
      <h2>{title}</h2>
      {lead && <p class="lead">{lead}</p>}
      {children}
    </section>
  );
}

export const flyToYears = (a: number, b: number) => {
  const s = skyRef.current;
  if (!s) return;
  const xa = s.xOf(a);
  const xb = s.xOf(b);
  s.cam.flyTo((xa + xb) / 2, s.cam.wLane(s.cam.h / 2), Math.max(200, (xb - xa) * 1.08), skyRef.redraw);
};
