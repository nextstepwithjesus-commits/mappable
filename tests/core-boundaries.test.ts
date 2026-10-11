/**
 * Границы импорта и правила ядра (09 § 4.1, § 8.1; 10 § 4.0.3, критерии): нижний слой не знает о верхнем; core/ не
 * импортирует prototypes/, src/, tools/, app/ и модули Node; в ядре нет `any` и глобалов DOM; tools/pack/ не импортирует
 * prototypes/ и прежний атлас src/ (кроме src/engine через tools/base, которым пользуются инструменты базы).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.ts$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p);
  }
  return out;
}

/** Код без комментариев, строк и шаблонов (их содержимое заменено пробелами) — чтобы искать слова кода. */
export function codeOnly(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? src.length : e + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += c + ' '.repeat(Math.max(0, j - i - 1)) + c;
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Все спецификаторы импорта файла (статические, `export … from`, динамические `import()`). */
export function imports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

const CORE = join(ROOT, 'core');
const coreFiles = files(CORE);
/** Внешние пакеты, которые ядру разрешены (09 § 3.5 п. 3: MiniSearch, MIT). */
const CORE_PACKAGES = new Set(['minisearch']);

describe('границы ядра core/', () => {
  it('в ядре есть файлы', () => {
    expect(coreFiles.length).toBeGreaterThan(10);
  });
  it('импорты ядра — только внутри core/ и разрешённые пакеты; ни node:, ни prototypes/, ни src/, ни tools/', () => {
    const bad: string[] = [];
    for (const f of coreFiles) {
      for (const s of imports(readFileSync(f, 'utf8'))) {
        if (s.startsWith('.')) {
          const to = resolve(dirname(f), s);
          if (!to.startsWith(CORE + '/')) bad.push(`${relative(ROOT, f)} → ${s}`);
        } else if (!CORE_PACKAGES.has(s)) bad.push(`${relative(ROOT, f)} → ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('в ядре нет `any`', () => {
    const bad: string[] = [];
    for (const f of coreFiles) {
      codeOnly(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        if (/(:\s*any\b|\bas\s+any\b|<any>|\bany\[\]|<\s*any\s*[,>])/.test(line)) bad.push(`${relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it('в ядре нет глобалов DOM и браузера (ядро работает в рабочем потоке и в Node)', () => {
    const bad: string[] = [];
    for (const f of coreFiles) {
      codeOnly(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        const m = /\b(document|window|localStorage|sessionStorage|navigator|indexedDB|location|history|fetch|caches)\b(?!\s*:)/.exec(line);
        if (m && !/\.\s*$/.test(line.slice(0, m.index))) bad.push(`${relative(ROOT, f)}:${i + 1}: ${m[1]}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('границы сборки tools/pack/', () => {
  it('не импортирует prototypes/ и прежний атлас src/', () => {
    const bad: string[] = [];
    for (const f of files(join(ROOT, 'tools/pack'))) {
      for (const s of imports(readFileSync(f, 'utf8'))) {
        if (!s.startsWith('.')) continue;
        const to = relative(ROOT, resolve(dirname(f), s));
        if (to.startsWith('prototypes/') || to.startsWith('src/')) bad.push(`${relative(ROOT, f)} → ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('проверка самой проверки', () => {
  it('ловит импорт prototypes/, node: и `any`, не путая слова в комментариях и строках', () => {
    const src = "import x from '../prototypes/П-Т3/core/search.ts';\nimport { readFileSync } from 'node:fs';\nconst a: any = 1; // any\nconst s = 'as any';";
    expect(imports(src)).toEqual(['../prototypes/П-Т3/core/search.ts', 'node:fs']);
    const code = codeOnly(src);
    expect(/:\s*any\b/.test(code)).toBe(true);
    expect(code.includes('as any')).toBe(false);
  });
});
