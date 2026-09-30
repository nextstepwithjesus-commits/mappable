/**
 * Проверка цветовых токенов (ТЗ § 3.8, § 5.2): контраст текста ≥ 4,5 : 1, графики ≥ 3 : 1 в обеих темах;
 * две ленты различимы при дейтеранопии, протанопии и тританопии (моделирование Machado, Oliveira & Fernandes, 2009).
 *   npm run -s contrast
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';
import { contrast as ratio, linearRgb, CONTRAST_USES } from '../src/ui/contrast.ts';
import { over, likelyAlpha, CONSTELLATION_DIM, DIM, DIM_LABEL_CONTRAST, CLOUD_DIMMED, dimLabelAlpha, labelGrounds, separateRibbons, RIBBON_LIGHTNESS } from '../src/render/dim.ts';
import { BRANCH_COLORS, LINK_YELLOW, BRANCH_CONTRAST, BRANCH_DE, BRANCH_FAR_CONTRAST, BRANCH_NAMES, KIN_GOLD, KIN_GOLD_DE, KIN_GOLD_UNDER, UNION_COLORS, UNION_DE, branchColor, branchFade, branchFloor, type MapTheme } from '../src/render/branches.ts';

const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  const j = css.indexOf('}', i);
  const out: Record<string, string> = {};
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
};
const themes = { night: block(":root[data-map='night']"), day: block(":root[data-map='day']") };

// формула контраста и перечень пар «токен — фон» — общие с образцом #/specimen (src/ui/contrast.ts)

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
  const l = linearRgb(h);
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
  for (const u of CONTRAST_USES) check(u.what, ratio(c[u.fg], c[u.bg]), u.min);
  // затемнение при выделении (E12; MOB-41; решение 31): погашенные подписи, «вероятно» на меридиане и названия созвездий —
  // не ниже 4,5 : 1 к каждому фону под ними: небу, полосе эпохи и облаку плотности на них (src/render/dim.ts)
  const cloud = t === 'night' ? CLOUD_DIMMED.night : CLOUD_DIMMED.day;
  for (const ink of ['--ink', '--ink-2', '--ink-3']) {
    const a = ink === '--ink-3' ? Math.max(CONSTELLATION_DIM, dimLabelAlpha(c[ink], c['--sky'], c['--sky-band'], cloud)) : Math.max(DIM, dimLabelAlpha(c[ink], c['--sky'], c['--sky-band'], cloud));
    for (const g of labelGrounds(c[ink], c['--sky'], c['--sky-band'], cloud)) {
      const dim = ratio(over(c[ink], g, a), g);
      check(`погашенная подпись ${ink} на ${g} (альфа ${a.toFixed(2)})`, dim, DIM_LABEL_CONTRAST);
      if (ink === '--ink-3') continue;
      const likely = ratio(over(c[ink], g, likelyAlpha(a)), g);
      check(`подпись «вероятно» ${ink} на ${g} (альфа ${likelyAlpha(a).toFixed(2)})`, likely, DIM_LABEL_CONTRAST);
      check(`«вероятно» ${ink} ярче погашенной на ${g}, отношение контрастов`, likely / dim, 1.2);
    }
  }
  // светлота лент на холсте (решение 32; MOB-61): отношение светлот по всей длине — не меньше 1,5
  const lanes = separateRibbons([c['--gold-1'], c['--gold-2']], [c['--azure-1'], c['--azure-2']], c['--sky'], t === 'night');
  const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const mixH = (a: string, b: string, u: number) => `#${hex(a).map((x, k) => Math.round(x + (hex(b)[k] - x) * u).toString(16).padStart(2, '0')).join('')}`;
  let worst = Infinity;
  for (let k = 0; k <= 10; k++) worst = Math.min(worst, ratio(mixH(lanes[0], lanes[1], k / 10), mixH(lanes[2], lanes[3], k / 10)));
  check(`ленты различимы по светлоте (на холсте: ${lanes.join(', ')})`, worst, RIBBON_LIGHTNESS);
  for (const k of lanes) check(`лента ${k} на холсте к --sky`, ratio(k, c['--sky']), 3);
  // подписи отрезков ярусов эпох (src/render/tiers.ts): днём тон отрезка — --rule, выбранного — --rule-strong
  check('подпись яруса --ink-2 на --rule', ratio(c['--ink-2'], c['--rule']), 4.5);
  check('подпись яруса --ink на --rule', ratio(c['--ink'], c['--rule']), 4.5);
  check('подпись яруса --ink на --rule-strong', ratio(c['--ink'], c['--rule-strong']), 4.5);
  for (const [k, m] of [['обычное зрение', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][]) {
    const d = Math.min(dE(simulate(c['--gold-1'], m), simulate(c['--azure-1'], m)), dE(simulate(c['--gold-2'], m), simulate(c['--azure-2'], m)));
    check(`ленты различимы (${k}), ΔE`, d, 20);
  }
  // цвета ветвей выбранного лица (решение 69; src/render/branches.ts): графика ≥ 3 : 1 к небу и полосе эпохи, дальние
  // поколения — не бледнее BRANCH_FAR_CONTRAST; не похожи на ленты (токены и цвета холста), на --ink и друг на друга —
  // при обычном зрении, дейтеранопии и протанопии
  const theme = t as MapTheme;
  const branches = BRANCH_COLORS[theme];
  const grounds = [c['--sky'], c['--sky-band']];
  for (const [i, b] of branches.entries()) {
    for (const g of grounds) check(`ветвь ${BRANCH_NAMES[i]} ${b} на ${g}`, ratio(b, g), BRANCH_CONTRAST);
    const far = branchFade(99, branchFloor(b, grounds));
    for (const g of grounds) check(`ветвь ${BRANCH_NAMES[i]} в дальнем поколении (альфа ${far.toFixed(2)}) на ${g}`, ratio(over(b, g, far), g), BRANCH_FAR_CONTRAST);
  }
  for (let i = 6; i < 12; i++) for (const g of grounds) check(`ветвь ${i + 1} (оттенок второго круга) ${branchColor(i, theme)} на ${g}`, ratio(branchColor(i, theme), g), BRANCH_CONTRAST);
  const others = [...new Set([c['--gold-1'], c['--gold-2'], c['--azure-1'], c['--azure-2'], ...lanes, c['--ink']])];
  for (const [k, m] of [['обычное зрение', undefined], ['deutan', CVD.deutan], ['protan', CVD.protan]] as [string, number[][] | undefined][]) {
    const min = m ? BRANCH_DE.cvd : BRANCH_DE.normal;
    let pair = Infinity;
    for (let i = 0; i < branches.length; i++) for (let j = i + 1; j < branches.length; j++) pair = Math.min(pair, dE(simulate(branches[i], m), simulate(branches[j], m)));
    check(`ветви различимы между собой (${k}), ΔE`, pair, min);
    let rib = Infinity;
    for (const b of branches) for (const o of others) rib = Math.min(rib, dE(simulate(b, m), simulate(o, m)));
    check(`ветви не похожи на ленты и --ink (${k}), ΔE`, rib, min);
  }
  // жёлтый выбранной связи (этап 11, § 9; src/render/plates.ts, LINK_YELLOW; marks.ts, drawSelectedLink): ночью — жёлтая линия
  // к небу и полосе эпохи ≥ 4,5 : 1; днём — жёлтая подложка под линией тона текста, линия к подложке ≥ 4,5 : 1. Жёлтый не похож
  // на ленты и цвета ветвей: ΔE ≥ 18 при обычном зрении и ≥ 10 при каждом виде дальтонизма
  const yellow = LINK_YELLOW[theme];
  if (theme === 'night') for (const g of grounds) check(`жёлтый выбранной связи ${yellow} на ${g}`, ratio(yellow, g), 4.5);
  else for (const g of grounds) check(`линия выбранной связи --ink на жёлтой подложке (альфа 0,9 на ${g})`, ratio(c['--ink'], over(yellow, g, 0.9)), 4.5);
  const hues = [...new Set([c['--gold-1'], c['--gold-2'], c['--azure-1'], c['--azure-2'], ...lanes, ...branches, ...Array.from({ length: 6 }, (_, i) => branchColor(i + 6, theme))])];
  for (const [k, m] of [['обычное зрение', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][]) {
    let d = Infinity;
    let with_ = '';
    for (const h of hues) {
      const v = dE(simulate(yellow, m), simulate(h, m));
      if (v < d) {
        d = v;
        with_ = h;
      }
    }
    check(`жёлтый не похож на ленты и ветви (${k}; ближе всех ${with_}), ΔE`, d, m ? 10 : 18);
  }
  // знак союза (этап 12, решение 87; src/render/plates.ts, paintUnion): половины — синяя (муж) и розовая (жена) — графика
  // ≥ 3 : 1 к небу и полосе эпохи; половины различимы между собой при обычном зрении и каждом виде дальтонизма; двухцветный
  // знак не читается одним цветом ленты, ветви, жёлтого или текста: хотя бы одна половина далека от каждого из них
  const U = UNION_COLORS[theme];
  for (const [k, h] of [['синяя (муж)', U.husband], ['розовая (жена)', U.wife]] as const)
    for (const g of grounds) check(`знак союза: половина ${k} ${h} на ${g}`, ratio(h, g), 3);
  const singles = [...new Set([...hues, yellow, c['--ink'], c['--ink-2']])];
  for (const [k, m] of [['обычное зрение', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][]) {
    check(`знак союза: половины различимы (${k}), ΔE`, dE(simulate(U.husband, m), simulate(U.wife, m)), UNION_DE);
    let d = Infinity;
    let with_ = '';
    for (const h of singles) {
      const v = Math.max(dE(simulate(U.husband, m), simulate(h, m)), dE(simulate(U.wife, m), simulate(h, m)));
      if (v < d) {
        d = v;
        with_ = h;
      }
    }
    check(`знак союза не похож на одноцветную линию (${k}; ближе всех ${with_}), ΔE дальней половины`, d, m ? 10 : 18);
  }
  // золотистый семьи лица (решение 89; src/render/marks.ts, goldArc, drawKinArcs): дуги и подписи на них — ≥ 4,5 : 1 к небу
  // и полосе эпохи (подпись — тем же цветом на ореоле неба); не тот же, что жёлтый выбранной связи: ΔE ≥ 18 при обычном
  // зрении и ≥ 10 при каждом виде дальтонизма
  const gold = KIN_GOLD[theme];
  for (const g of grounds) check(`золотистая дуга семьи и её подпись ${gold} на ${g}`, ratio(gold, g), 4.5);
  // днём точки дуги лежат на бледно-золотой подложке: и на ней графика ≥ 3 : 1
  if (theme === 'day') for (const g of grounds) check(`точки золотистой дуги на подложке (альфа ${KIN_GOLD_UNDER.a} на ${g})`, ratio(gold, over(KIN_GOLD_UNDER.color, g, KIN_GOLD_UNDER.a)), 3);
  for (const [k, m] of [['обычное зрение', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][])
    check(`золотистый не похож на жёлтый выбранной связи (${k}), ΔE`, dE(simulate(gold, m), simulate(yellow, m)), m ? 10 : 18);
  // этап 13, решение 94 (П7): золотистый не похож на золото ленты Иосифа — оба конца градиента, токены и цвета холста
  const josephGold = [...new Set([c['--gold-1'], c['--gold-2'], lanes[0], lanes[1]])];
  for (const [k, m] of [['обычное зрение', undefined], ...Object.entries(CVD)] as [string, number[][] | undefined][]) {
    let d = Infinity;
    let with_ = '';
    for (const h of josephGold) {
      const v = dE(simulate(gold, m), simulate(h, m));
      if (v < d) {
        d = v;
        with_ = h;
      }
    }
    check(`золотистый ${gold} не похож на золото ленты Иосифа (${k}; ближе всех ${with_}), ΔE`, d, m ? KIN_GOLD_DE.cvd : KIN_GOLD_DE.normal);
  }
}
console.log(fail ? `\nНе прошло проверок: ${fail}` : '\nВсе проверки пройдены.');
process.exit(fail ? 1 : 0);
