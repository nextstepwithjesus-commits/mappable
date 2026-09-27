/**
 * Контраст цветов по WCAG 2 (ТЗ § 3.8): одна формула и один перечень пар «цвет — фон» для проверки
 * `npm run -s contrast` (tools/contrast.ts) и для таблицы цветов образца #/specimen (src/ui/Specimen.tsx).
 * Цвета — #rrggbb, как их хранит src/styles/tokens.css.
 */

/** Канал sRGB 0…255 → линейная яркость 0…1. */
const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** #rrggbb → [r, g, b] в линейном RGB (0…1). */
export function linearRgb(hex: string): [number, number, number] {
  const h = hex.trim();
  return [1, 3, 5].map((i) => linear(parseInt(h.slice(i, i + 2), 16))) as [number, number, number];
}

/** Относительная яркость WCAG 2. */
export function luminance(hex: string): number {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контраст двух цветов: от 1 до 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Пара «токен на фоне» с порогом и подписью строки отчёта проверки. */
export interface ContrastUse {
  fg: string;
  bg: string;
  min: number;
  what: string;
}

const PLANES = ['--sky', '--sheet', '--sheet-2'];

/**
 * Где какой токен лежит и какого контраста ему хватает. Порядок и подписи — строки отчёта `npm run -s contrast`.
 * Текст — от 4,5 : 1, графика со смыслом — от 3 : 1 (WCAG 1.4.11), структурная линия — от 2,2 : 1,
 * плоскости (лист к небу, наведение к листу) — от 1,15 и 1,1 : 1 (VIS-18).
 */
export const CONTRAST_USES: readonly ContrastUse[] = [
  // текст: на небе, на листе и на поле наведения (--sheet-2 — фон команды под указателем и активной строки поиска)
  ...PLANES.flatMap((bg) => [
    { fg: '--ink', bg, min: 4.5, what: `текст --ink на ${bg}` },
    { fg: '--ink-2', bg, min: 4.5, what: `текст --ink-2 на ${bg}` },
    { fg: '--ink-3', bg, min: 4.5, what: `мелкие подписи --ink-3 на ${bg}` },
  ]),
  { fg: '--sky', bg: '--ink', min: 4.5, what: 'выбранный сегмент: --sky на --ink' },
  ...['--gold-1', '--gold-2', '--azure-1', '--azure-2'].map((g) => ({ fg: g, bg: '--sky', min: 3, what: `лента ${g} на --sky` })),
  // плоскости (VIS-18): лист и панели отделены от неба светлотой, а не тенью; наведение заметно на листе
  { fg: '--sheet', bg: '--sky', min: 1.15, what: 'плоскость: --sheet к --sky' },
  { fg: '--sheet-2', bg: '--sheet', min: 1.1, what: 'наведение: --sheet-2 к --sheet' },
  // графика, несущая смысл (WCAG 1.4.11, ≥ 3 : 1): черта нажатой команды и рамка флажка — --ink и --ink-2, кольцо фокуса — --focus
  ...PLANES.flatMap((bg) => [
    { fg: '--ink', bg, min: 3, what: `черта нажатой команды --ink на ${bg}` },
    { fg: '--ink-2', bg, min: 3, what: `рамка флажка --ink-2 на ${bg}` },
    { fg: '--focus', bg, min: 3, what: `кольцо фокуса --focus на ${bg}` },
  ]),
  // --rule-strong — структурная линия: край листа и панели, рамка группы сегментов, подчёркивание ссылки в покое.
  // Сама по себе она смысла не несёт (лист отличается от неба светлотой, сегмент и ссылку называет их текст),
  // поэтому порог 3 : 1 для графики к ней не относится; нужен порог заметности 2,2 : 1 к обеим плоскостям.
  { fg: '--rule-strong', bg: '--sky', min: 2.2, what: 'структурная линия --rule-strong на --sky' },
  { fg: '--rule-strong', bg: '--sheet', min: 2.2, what: 'структурная линия --rule-strong на --sheet' },
];
