/** Цвета холста: токены приходят из CSS шестнадцатеричными (#rrggbb); смешение и прозрачность — здесь. */

export function hexToRgb(h: string): [number, number, number] {
  const s = h.trim().replace('#', '');
  const full = s.length === 3 ? s.replace(/./g, (c) => c + c) : s;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** Цвет между a и b: t = 0 — a, t = 1 — b. */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

/** Цвет с прозрачностью a (из #rrggbb или rgb(…)). */
export function alpha(c: string, a: number): string {
  if (c.trim().startsWith('#')) {
    const [r, g, b] = hexToRgb(c);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c.replace('rgb(', 'rgba(').replace(')', `,${a})`);
}
