/**
 * Проверка цветовых токенов (ТЗ § 3.8, § 5.2): контраст текста ≥ 4,5 : 1, графики ≥ 3 : 1 в обеих темах;
 * две ленты различимы при дейтеранопии, протанопии и тританопии (моделирование Machado, Oliveira & Fernandes, 2009).
 *   npm run -s contrast
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';

const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const themes = { night: block(":root[data-theme='night']"), day: block(":root[data-theme='day']") };

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// матрицы Machado 2009 (тяжесть 1.0), в линейном RGB
const CVD: Record<string, number[][]> = {
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const toLab = (lr: number[]) => {
  const [r, g, b] = lr;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const simulate = (h: string, m?: number[][]) => {
  const l = rgb(h).map(lin);
  const s = m ? m.map((row) => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))) : l;
  return toLab(s);
};
const dE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

let fail = 0;
const check = (name: string, v: number, min: number) => {
  const ok = v >= min;
  if (!ok) fail++;
  console.log(`${ok ? 'да ' : 'НЕТ'} ${name}: ${v.toFixed(2)} (нужно ≥ ${min})`);
};
for (const [t, c] of Object.entries(themes)) {
  console.log(`\n— тема ${t}`);
  for (const bg of ['--sky', '--sheet']) {
    check(`текст --ink на ${bg}`, ratio(c['--ink'], c[bg]), 4.5);
    check(`текст --ink-2 на ${bg}`, ratio(c['--ink-2'], c[bg]), 4.5);
    check(`мелкие подписи --ink-3 на ${bg}`, ratio(c['--ink-3'], c[bg]), 4.5);
  }
  for (const g of ['--gold-1', '--gold-2', '--azure-1', '--azure-2']) check(`лента ${g} на --sky`, ratio(c[g], c['--sky']), 3);
  check('граница --rule-strong на --sky', ratio(c['--rule-strong'], c['--sky']), 1.7);
  for (const [k, m] of [['обычное зрение', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][]) {
    const d = Math.min(dE(simulate(c['--gold-1'], m), simulate(c['--azure-1'], m)), dE(simulate(c['--gold-2'], m), simulate(c['--azure-2'], m)));
    check(`ленты различимы (${k}), ΔE`, d, 20);
  }
}
console.log(fail ? `\nНе прошло проверок: ${fail}` : '\nВсе проверки пройдены.');
process.exit(fail ? 1 : 0);
