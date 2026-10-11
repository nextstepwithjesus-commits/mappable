/**
 * Сборка токенов (09 § 3.6; 08 § 3; этап 0 плана 10, п. 3): tokens/токены.json → resolver DTCG 2025.10 → Terrazzo → CSS-переменные
 * и модуль TypeScript со значениями по режимам. Перед сборкой — проверки: ссылки, шкала кеглей 30 · 22 · 18 · 16 · 14 · 12,
 * цвет действия — киноварь, нижняя граница 12 px, контраст всех пар `app.контраст` в обеих темах. Ошибка — выход 1.
 *
 *   npm run -s tokens            сборка и проверки → tokens/dist/tokens.css, tokens/dist/tokens.ts
 *   npm run -s tokens -- --check только проверки
 *
 * Режимы файла (`app.режимы`) ложатся на модификаторы resolver'а: тема (светлая, тёмная), экран (широкий, телефон), ввод
 * (мышь, мышь-плотная, касание, касание-плотная, сенсорный). Плотность и способ ввода — одна ось resolver'а, потому что у
 * целей есть составное значение «касание·плотная» (08 § 3.5), которое не получается наложением двух независимых осей.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, contrastRows, cssVar, flat, hex, load, rawIn, resolve, type Doc, type Token } from './tokens.ts';

export const SCALE = [30, 22, 18, 16, 14, 12];
export const ACTION = { light: '#A33A1F', dark: '#F0957B' };
const OUT = join(ROOT, 'tokens', 'dist');
const BUILD = join(ROOT, 'tokens', 'build');

/** Контексты resolver'а: режимы файла, которые в них действуют. */
export const CONTEXTS: Record<string, Record<string, string[]>> = {
  тема: { светлая: [], тёмная: ['тёмная'] },
  экран: { широкий: [], телефон: ['телефон'] },
  ввод: { мышь: [], 'мышь-плотная': ['плотная'], касание: ['касание'], 'касание-плотная': ['касание', 'плотная'], сенсорный: ['сенсорный'] },
};

const px = (v: unknown): number | undefined => (v && typeof v === 'object' && (v as { unit?: string }).unit === 'px' ? (v as { value: number }).value : undefined);

/** Проверки файла токенов: пустой список — всё верно. */
export function check(doc: Doc): string[] {
  const errs: string[] = [];
  const all = flat(doc);
  const allModes = Object.values(CONTEXTS).flatMap((c) => Object.values(c)).concat([['тёмная', 'телефон', 'касание', 'плотная']]);
  for (const p of Object.keys(all)) for (const m of allModes) {
    try {
      resolve(all, p, m);
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  if (errs.length) return [...new Set(errs)];
  // шкала кеглей: шесть ступеней 30 · 22 · 18 · 16 · 14 · 12; телефон — внутри шкалы; мельче 12 нет (08 § 3.3.2)
  const sizes = new Set<number>();
  for (const [p, t] of Object.entries(all)) {
    if (t.$type !== 'typography') continue;
    for (const m of [[], ['телефон']]) {
      const s = px((resolve(all, p, m) as { fontSize?: unknown }).fontSize);
      if (s === undefined) errs.push(`${p}: кегль не в px`);
      else {
        sizes.add(s);
        if (s < 12) errs.push(`${p}: кегль ${s} px мельче 12 px`);
      }
    }
  }
  const got = [...sizes].sort((a, b) => b - a);
  if (got.join() !== SCALE.join()) errs.push(`шкала кеглей ${got.join(' · ')} — нужна ${SCALE.join(' · ')}`);
  for (let i = 1; i < got.length; i++) if (got[i - 1] - got[i] < 2) errs.push(`соседние ступени ${got[i - 1]} и ${got[i]} ближе 2 px`);
  // цвет действия — киноварь (08 § 3.2.2 п. 0а, ред. 3.3)
  const a = all['цвет.действие'];
  if (!a) errs.push('нет токена цвет.действие');
  else {
    const l = hex(resolve(all, 'цвет.действие', [])).toUpperCase();
    const d = hex(resolve(all, 'цвет.действие', ['тёмная'])).toUpperCase();
    if (l !== ACTION.light || d !== ACTION.dark) errs.push(`цвет действия ${l} / ${d} — нужна киноварь ${ACTION.light} / ${ACTION.dark}`);
  }
  // контраст пар
  for (const r of contrastRows(doc)) if (!r.ok) errs.push(`контраст ${r.f} к ${r.b} (${r.theme}): ${r.k} ниже нормы (${r.kind})`);
  // имена переменных не совпадают
  const vars = new Map<string, string>();
  for (const p of Object.keys(all)) {
    const v = cssVar(p);
    if (vars.has(v)) errs.push(`одно имя переменной ${v} у ${vars.get(v)} и ${p}`);
    vars.set(v, p);
  }
  return errs;
}

/** Значение в виде DTCG: у типографики — только поля формата (`app.строка` — расширение, в CSS не идёт). */
const TYPO = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'];
function dtcg(t: Token, v: unknown): unknown {
  if (t.$type !== 'typography' || !v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => TYPO.includes(k)));
}

/** Документ resolver'а DTCG 2025.10 и списки токенов по контекстам (для CSS только изменённые). */
export function resolver(doc: Doc): { resolver: Record<string, unknown>; changed: Record<string, Record<string, string[]>> } {
  const all = flat(doc);
  const strip = (o: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === '$extensions') continue;
      if (k.startsWith('$')) out[k] = v;
      else if (v && typeof v === 'object') out[k] = strip(v as Record<string, unknown>);
    }
    return out;
  };
  const tree = (entries: [string, Token, unknown][]) => {
    const root: Record<string, unknown> = {};
    for (const [p, t, v] of entries) {
      const parts = p.split('.');
      let cur = root;
      for (const k of parts.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>;
      cur[parts.at(-1)!] = { $type: t.$type, $value: v };
    }
    return root;
  };
  const modifiers: Record<string, unknown> = {};
  const changed: Record<string, Record<string, string[]>> = {};
  for (const [mod, ctx] of Object.entries(CONTEXTS)) {
    const contexts: Record<string, unknown[]> = {};
    changed[mod] = {};
    for (const [name, modes] of Object.entries(ctx)) {
      const keys = new Set(modes.flatMap((m) => [m]).concat(modes.length > 1 ? [modes.join('·')] : []));
      const touched = Object.entries(all).filter(([, t]) => Object.keys(t.$extensions?.['app.режимы'] ?? {}).some((k) => keys.has(k) || (k.includes('·') && k.split('·').every((x) => modes.includes(x)))));
      changed[mod][name] = touched.map(([p]) => p);
      contexts[name] = touched.length ? [tree(touched.map(([p, t]) => [p, t, dtcg(t, rawIn(t, modes))]))] : [];
    }
    modifiers[mod] = { contexts, default: Object.keys(ctx)[0] };
  }
  const { $description, $extensions: _x, ...rest } = doc;
  return {
    resolver: {
      name: 'Библия наглядно — токены', version: '2025.10', description: String($description ?? ''),
      sets: { основа: { sources: [strip(rest)] } },
      modifiers,
      resolutionOrder: [{ $ref: '#/sets/основа' }, ...Object.keys(CONTEXTS).map((m) => ({ $ref: `#/modifiers/${m}` }))],
    },
    changed,
  };
}

/** Модуль TypeScript: значения по режимам (холст, SVG из кода, стиль карты не читают CSS-переменные — 09 § 3.6). */
export function tsModule(doc: Doc): string {
  const all = flat(doc);
  const rows: string[] = [];
  const modeSets: [string, string[]][] = [['светлая', []], ['тёмная', ['тёмная']], ['телефон', ['телефон']], ['плотная', ['плотная']], ['касание', ['касание']], ['касание·плотная', ['касание', 'плотная']], ['сенсорный', ['сенсорный']]];
  const norm = (v: unknown): unknown => (v && typeof v === 'object' && 'hex' in (v as object) ? (v as { hex: string }).hex : v);
  for (const [p, t] of Object.entries(all)) {
    const base = JSON.stringify(norm(resolve(all, p, [])));
    const modes: string[] = [];
    for (const [name, m] of modeSets.slice(1)) {
      const v = JSON.stringify(norm(resolve(all, p, m)));
      if (v !== base) modes.push(`${JSON.stringify(name)}: ${v}`);
    }
    rows.push(`  ${JSON.stringify(p)}: { type: ${JSON.stringify(t.$type)}, css: ${JSON.stringify(cssVar(p))}, value: ${base}${modes.length ? `, modes: { ${modes.join(', ')} }` : ''} },`);
  }
  return [
    '/* СОБРАНО из tokens/токены.json командой `npm run -s tokens` (tools/tokens/build.ts) — не править руками. */',
    "export type TokenMode = 'тёмная' | 'телефон' | 'плотная' | 'касание' | 'касание·плотная' | 'сенсорный';",
    'export interface TokenEntry { type: string; css: string; value: unknown; modes?: Partial<Record<TokenMode, unknown>> }',
    'export const TOKENS = {',
    ...rows,
    '} as const satisfies Record<string, TokenEntry>;',
    'export type TokenPath = keyof typeof TOKENS;',
    '/** Значение токена в режимах: составной режим «касание·плотная» сильнее одиночных; последний одиночный сильнее прежних. */',
    'export function token(path: TokenPath, modes: readonly TokenMode[] = []): unknown {',
    '  const t: TokenEntry = TOKENS[path];',
    '  let v = t.value;',
    "  for (const m of modes) if (!m.includes('·') && t.modes?.[m] !== undefined) v = t.modes[m];",
    "  if (modes.includes('касание') && modes.includes('плотная') && t.modes?.['касание·плотная'] !== undefined) v = t.modes['касание·плотная'];",
    '  return v;',
    '}',
    '',
  ].join('\n');
}

/** Размер текста (08 § 3.3.2, § 7.23) — не ось токенов, а размер корня: все кегли в rem. */
const TEXT_SIZE = `
/* Размер текста (08 § 3.3.2, § 7.23): размер корня; не ось токенов. Добавлено tools/tokens/build.ts. */
:root[data-text="крупнее"] { font-size: 112.5%; }
:root[data-text="самый"] { font-size: 125%; }
`;

export function buildTokens(): { css: string; ts: string } {
  const doc = load();
  const errs = check(doc);
  if (errs.length) throw new Error(`токены:\n  ${errs.join('\n  ')}`);
  const { resolver: r, changed } = resolver(doc);
  mkdirSync(BUILD, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(BUILD, 'токены.resolver.json'), JSON.stringify(r, null, 1) + '\n');
  writeFileSync(join(BUILD, 'режимы.json'), JSON.stringify(changed, null, 1) + '\n');
  execFileSync(join(ROOT, 'node_modules', '.bin', 'tz'), ['build', '-c', join(ROOT, 'tokens', 'terrazzo.config.mjs')], { cwd: join(ROOT, 'tokens'), stdio: 'pipe' });
  const cssFile = join(OUT, 'tokens.css');
  const css = readFileSync(cssFile, 'utf8') + TEXT_SIZE;
  writeFileSync(cssFile, css);
  const ts = tsModule(doc);
  writeFileSync(join(OUT, 'tokens.ts'), ts);
  return { css, ts };
}

function main() {
  try {
    if (process.argv.includes('--check')) {
      const errs = check(load());
      for (const e of errs) console.error(`!! ${e}`);
      if (errs.length) process.exit(1);
      console.log('токены: проверки пройдены');
      return;
    }
    const { css } = buildTokens();
    const rows = contrastRows(load());
    console.log(`токены: tokens/dist/tokens.css (${css.length} байт), tokens/dist/tokens.ts; пар контраста ${rows.length}, ниже нормы 0`);
  } catch (e) {
    console.error(`!! ${(e as Error).message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
