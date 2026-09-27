/** Движение неба, общее для органов и клавиш: учёт prefers-reduced-motion и «Всё небо». */
import { skyRef } from '../common.tsx';

export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** «Всё небо» (C6; UX-05): перелёт к окну, в которое вписано всё небо (fitAll). Пределы и вписывание обеих осей — D2. */
export function showAll() {
  const s = skyRef.current;
  if (!s || !s.model) return;
  const from = s.cam.state();
  s.fitAll();
  const to = s.cam.state();
  s.cam.set(from);
  const w = s.cam.w / to.kx;
  s.cam.flyTo(to.x0 + w / 2, to.laneTop - s.cam.h / 2 / s.cam.kyFor(to.kx), w, skyRef.redraw, reduced());
  skyRef.redraw();
}
