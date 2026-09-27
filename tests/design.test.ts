/**
 * Система дизайна (этап 2: B1, B2, B3; VIS-18, 27, 30; MOB-42): токены плоскостей и лент, шкала из восьми кеглей,
 * ни одного разового кегля или цвета в CSS и в style разметки. Без браузера: читаются исходники.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');
const STYLES = join(ROOT, 'src/styles');
const read = (p: string) => readFileSync(p, 'utf8');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensCss = noComments(read(join(STYLES, 'tokens.css')));

/** Тело правила, которое начинается с первого вхождения head (до парной закрывающей скобки). */
function body(css: string, head: string): string {
  const i = css.indexOf(head);
  if (i < 0) throw new Error(`нет правила ${head}`);
  const open = css.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j);
  }
  throw new Error(`не закрыто правило ${head}`);
}
/** Объявления тела правила: свойство → значение. */
function decls(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/([\w-]+)\s*:\s*([^;{}]+?)\s*(?=[;}]|$)/g)) out[m[1]] = m[2];
  return out;
}
/** Все объявления файла (свойство, значение), без комментариев; селекторы и условия @media не попадают. */
function allDecls(css: string): [string, string][] {
  return [...noComments(css).matchAll(/([\w-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)].map((m) => [m[1], m[2]]);
}
const cssFiles = readdirSync(STYLES)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: f, css: read(join(STYLES, f)) }));

describe('токены цвета (B1; VIS-18, VIS-30)', () => {
  const night = decls(body(tokensCss, ":root[data-map='night']"));
  const day = decls(body(tokensCss, ":root[data-map='day']"));
  const lightMedia = decls(body(body(tokensCss, '@media (prefers-color-scheme: light)'), ':root:not([data-map])'));
  const print = decls(body(body(tokensCss, '@media print'), ':root[data-map]'));

  it('блок светлой темы системы совпадает с дневной темой — значение в значение', () => {
    expect(lightMedia).toEqual(day);
  });
  it('печать берёт дневную тему целиком', () => {
    expect(print).toEqual(day);
  });
  it('у ночной и дневной темы один набор токенов', () => {
    expect(Object.keys(night).sort()).toEqual(Object.keys(day).sort());
  });
  it('плоскости по VIS-18', () => {
    expect(night).toMatchObject({ '--sheet': '#14284a', '--sheet-2': '#1b3358', '--rule': '#2a4470', '--rule-strong': '#4a6590', '--ink-3': '#8fa0bc' });
    expect(day).toMatchObject({ '--sky': '#e9eef4', '--sheet': '#ffffff', '--sheet-2': '#eef2f7', '--rule': '#c6d0dd', '--rule-strong': '#8e9fb6', '--ink-3': '#56637a' });
  });
  it('ленты — значения ТЗ § 5.2', () => {
    expect(night).toMatchObject({ '--gold-1': '#e6b550', '--gold-2': '#c9773a', '--azure-1': '#9ccbf5', '--azure-2': '#9edbd0' });
    expect(day).toMatchObject({ '--gold-1': '#9a6a12', '--gold-2': '#8e4a1e', '--azure-1': '#2b64a8', '--azure-2': '#1f7a70' });
  });
  it('цвета тем — #rrggbb: холст разбирает их сам (src/render/color.ts)', () => {
    for (const t of [night, day]) for (const [k, v] of Object.entries(t)) if (!['--glow', 'color-scheme'].includes(k)) expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('шкала кеглей (B2; VIS-27, MOB-42)', () => {
  const root = decls(body(tokensCss, ':root {\n  --serif'));
  const px = (v: string) => {
    const m = /^([\d.]+)rem$/.exec(v);
    if (!m) throw new Error(`кегль не в rem: ${v}`);
    return Number(m[1]) * 16;
  };
  const SCALE: Record<string, [number, number | null]> = {
    '--t-display': [34, 40],
    '--t-title': [24, 30],
    '--t-lead': [18, 26],
    '--t-body': [16, 24],
    '--t-note': [14, 20],
    '--t-ui': [13, 18],
    '--t-ui-s': [12, 16],
    '--t-map-s': [11.5, null],
  };
  it('ровно восемь ступеней, у каждой — свой интерлиньяж; всё в rem', () => {
    const sizes = Object.keys(root).filter((k) => k.startsWith('--t-') && !k.endsWith('-lh'));
    expect(sizes.sort()).toEqual(Object.keys(SCALE).sort());
    for (const [k, [size, lh]] of Object.entries(SCALE)) {
      expect(px(root[k]), k).toBe(size);
      if (lh !== null) expect(px(root[`${k}-lh`]), `${k}-lh`).toBe(lh);
    }
  });

  // Кегль в CSS — только токеном шкалы; 11,5 (--t-map-s) — только на холсте.
  const SIZE_OK = /^var\(--t-(display|title|lead|body|note|ui|ui-s)\)$/;
  const LH_OK = /^(var\(--t-(display|title|lead|body|note|ui|ui-s)-lh\)|var\(--top-h\)|inherit|0|1)$/;
  for (const { file, css } of cssFiles) {
    it(`${file}: кегли и интерлиньяжи — из шкалы`, () => {
      const bad: string[] = [];
      for (const [p, v] of allDecls(css)) {
        if (p === 'font-size' && !(SIZE_OK.test(v) || v === 'inherit')) bad.push(`${p}: ${v}`);
        if (p === 'line-height' && !LH_OK.test(v)) bad.push(`${p}: ${v}`);
        if (p === 'font' && v !== 'inherit') bad.push(`${p}: ${v}`);
      }
      expect(bad).toEqual([]);
    });
  }
});

// Именованные цвета CSS (CSS Color 4), кроме разрешённых transparent и currentColor.
const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse ' +
    'chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
    'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green ' +
    'greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey ' +
    'lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive ' +
    'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow ' +
    'springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen ' +
    // системные цвета тоже обходят токены
    'canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext graytext mark marktext'
  ).split(' '),
);
/** Цвет, записанный в значении не токеном. */
function literalColors(value: string): string[] {
  const v = value.replace(/var\(--[\w-]+\)/g, ' ');
  const out = [...v.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g)].map((m) => m[0]);
  for (const w of v.toLowerCase().match(/[a-z]+/g) ?? []) if (NAMED.has(w)) out.push(w);
  return out;
}

describe('цвета — только токены (B2)', () => {
  it('проверка ловит запись цвета мимо токенов', () => {
    expect(literalColors('1px solid #243a5f')).toEqual(['#243a5f']);
    expect(literalColors('color-mix(in srgb, var(--sky) 85%, rgba(0,0,0,.5))')).toEqual(['rgba(']);
    expect(literalColors('linear-gradient(90deg, black 90%, transparent)')).toEqual(['black']);
    expect(literalColors('inset 0 -2px 0 var(--ink)')).toEqual([]);
    expect(literalColors('underline 1px currentColor')).toEqual([]);
  });
  for (const { file, css } of cssFiles.filter((f) => f.file !== 'tokens.css')) {
    it(`${file}: ни одного цвета вне tokens.css`, () => {
      const bad = allDecls(css).flatMap(([p, v]) => literalColors(v).map((c) => `${p}: ${v} (${c})`));
      expect(bad).toEqual([]);
    });
  }
});

// ---------- разметка: разовые style ----------
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
const TSX = walk(join(ROOT, 'src')).map((p) => ({ file: relative(ROOT, p).replace(/\\/g, '/'), src: read(p) }));

/** Объекты style={{…}} файла: строка и имена свойств верхнего уровня. */
function styleObjects(src: string): { line: number; keys: string[]; text: string }[] {
  const out: { line: number; keys: string[]; text: string }[] = [];
  for (const m of src.matchAll(/style=\{/g)) {
    const start = m.index! + m[0].length;
    let depth = 1;
    let j = start;
    for (; j < src.length && depth; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
    }
    const text = src.slice(start, j - 1).trim();
    // объекты-литералы выражения (style={{…}} или style={x ? {…} : undefined}); ключи — верхнего уровня, без вложенных ${…} и (…)
    const keys: string[] = [];
    let flat = '';
    let d = 0;
    for (const ch of text) {
      if (ch === '{' && d === 0) flat = '';
      if ('({['.includes(ch)) d++;
      else if (')}]'.includes(ch)) d--;
      if (d === 1 && ch !== '{') flat += ch;
      if (ch === '}' && d === 0) keys.push(...[...flat.matchAll(/(?:^|,)\s*(['"]?)([\w-]+)\1\s*:/g)].map((k) => k[2]));
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, keys: keys.length ? keys : ['<выражение>'], text });
  }
  return out;
}
/** Разрешено в style: геометрия, вычисленная во время работы (размер холста, место подсказки), и свои свойства CSS. */
const GEOMETRY = new Set(['width', 'height', 'left', 'top', 'right', 'bottom', 'transform']);
const allowedKey = (k: string) => GEOMETRY.has(k) || k.startsWith('--');

/**
 * Исключения — с причиной. TODO(stage2-wave2): чужие файлы, которые переделываются на второй волне этапа 2.
 * Ключ — «файл» (весь файл) или «файл:свойство».
 */
const EXCEPTIONS: Record<string, string> = {
  // TODO(stage2-wave2): образец собирается заново из живых компонентов (B7), разовые style уходят вместе со старым образцом.
  'src/ui/Specimen.tsx': 'B7 — образец из живых компонентов',
  // TODO(stage2-wave2): скрытый абзац картуша — убрать или заменить атрибутом hidden (C6, органы неба и картуш).
  'src/ui/SkyView.tsx:display': 'C6 — картуш',
};

describe('разметка: в style нет кеглей, цветов и разовых отступов (B2)', () => {
  it('разбор style находит ключи верхнего уровня', () => {
    const s = styleObjects(`<div style={{ left: \`\${Math.min(a ? 1 : 2, 3)}px\`, fontSize: '14px' }} /><i style={{ '--a': x }} /><b style={cond ? { color: 'red' } : undefined} />`);
    expect(s.map((x) => x.keys)).toEqual([['left', 'fontSize'], ['--a'], ['color']]);
    expect(styleObjects('<i style={css} />')[0].keys).toEqual(['<выражение>']);
  });
  for (const { file, src } of TSX) {
    if (EXCEPTIONS[file]) continue;
    it(`${file}`, () => {
      const bad: string[] = [];
      for (const o of styleObjects(src)) {
        for (const k of o.keys) if (!allowedKey(k) && !EXCEPTIONS[`${file}:${k}`]) bad.push(`${o.line}: ${k} — ${o.text.slice(0, 80)}`);
      }
      // строковый style и прямые присваивания кеглей и цветов
      for (const m of src.matchAll(/style="[^"]*"|\.style\.(font\w*|color|background\w*|border\w*|lineHeight)\s*=|\.style\.setProperty\(\s*['"](?!--)[^'"]+/g)) bad.push(m[0]);
      expect(bad).toEqual([]);
    });
  }
});

describe('кегли холста в разметке — ступени шкалы (B2; MOB-42)', () => {
  // Холст пишет кеглями src/render/type.ts; явный кегль в строке ctx.font допустим только из шкалы: 16, 14, 13, 12, 11,5.
  const CANVAS_OK = new Set([16, 14, 13, 12, 11.5]);
  const CANVAS_EXCEPTIONS = new Set<string>([]);
  it('ctx.font с явным кеглем — только ступени шкалы', () => {
    const bad: string[] = [];
    for (const { file, src } of TSX) {
      if (CANVAS_EXCEPTIONS.has(file)) continue;
      for (const m of src.matchAll(/\.font\s*=\s*[`'"][^`'"]*?([\d.]+)px/g)) if (!CANVAS_OK.has(Number(m[1]))) bad.push(`${file}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});
