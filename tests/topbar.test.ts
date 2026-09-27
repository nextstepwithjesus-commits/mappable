/**
 * Верхняя строка и органы неба (C3, C6; VIS-20, VIS-21, VIS-22, IX-46, MOB-04, MOB-25) без браузера:
 * какие команды уходят в «Ещё» при нехватке места, и что строка и органы неба — непрозрачные, без скрытой прокрутки.
 * Поведение в браузере (1024 × 768, 390 × 844, клавиатура) — сценарии 20–22 в tools/accept.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { overflowCommands } from '../src/ui/top/TopBar.tsx';

// ширины команд — как у образцов Jost 13 с полями 8 px (порядок строки: панели, затем справка)
// «В работе» (J3) — замер в сборке на 1440: 65,22 px
const W: Record<string, number> = { index: 86, work: 65, chapter: 58, synopsis: 78, kinship: 72, section: 121, legend: 116, about: 68 };
const ORDER = ['index', 'work', 'chapter', 'synopsis', 'kinship', 'section', 'legend', 'about'];
const GAP = 2;
const SEP = 21;
const MORE = 52;
const width = (id: string) => W[id];
/** Ширина ряда при данном наборе скрытых команд — так, как его раскладывает App.tsx. */
function rowWidth(hidden: Set<string>): number {
  const shown = ORDER.filter((id) => !hidden.has(id));
  const n = shown.length + 1 + (hidden.size ? 1 : 0);
  return shown.reduce((a, id) => a + W[id], 0) + SEP + (hidden.size ? MORE : 0) + GAP * (n - 1);
}
const full = rowWidth(new Set());

describe('«Ещё» верхней строки (C3; VIS-20, IX-46, MOB-04)', () => {
  it('если места хватает, «Ещё» нет и видны все команды', () => {
    expect([...overflowCommands(full, width, GAP, SEP, MORE)]).toEqual([]);
    expect([...overflowCommands(full + 200, width, GAP, SEP, MORE)]).toEqual([]);
  });
  it('ряд никогда не шире отведённого места: вместо прокрутки — «Ещё»', () => {
    for (let avail = full; avail >= SEP + MORE; avail -= 7) {
      const hidden = overflowCommands(avail, width, GAP, SEP, MORE);
      // пока хоть что-то можно показать, ряд помещается
      if (hidden.size < ORDER.length) expect(rowWidth(hidden), `ширина ${avail}`).toBeLessThanOrEqual(avail);
    }
  });
  it('первыми уходят панели с конца ряда, «В работе» — после «Глав», затем справка, последним — «Указатель»', () => {
    const seen: string[][] = [];
    for (let avail = full - 1; avail > 0; avail -= 3) {
      const h = [...overflowCommands(avail, width, GAP, SEP, MORE)];
      if (!seen.length || seen[seen.length - 1].length !== h.length) seen.push(h);
    }
    const order = seen.map((h) => h[h.length - 1]);
    expect(order).toEqual(['section', 'kinship', 'synopsis', 'chapter', 'work', 'about', 'legend', 'index']);
  });
  it('уход одной команды оставляет место для «Ещё»: не хватает 1 px — уходит команда, а «Ещё» помещается', () => {
    const hidden = overflowCommands(full - 1, width, GAP, SEP, MORE);
    expect(hidden.has('section')).toBe(true);
    expect(rowWidth(hidden)).toBeLessThanOrEqual(full - 1);
  });
});

const css = (f: string) => readFileSync(join(__dirname, '../src/styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Тело первого правила с точно таким селектором (вне @media). */
function rule(src: string, selector: string): string {
  const m = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src);
  if (!m) throw new Error(`нет правила ${selector}`);
  return m[2];
}

describe('строка и органы неба — без скрытой прокрутки и полупрозрачности (C3, C6; VIS-21, MOB-04, MOB-25)', () => {
  it('ряд команд не прокручивается и не растворяется маской ни на какой ширине', () => {
    for (const f of ['top.css', 'phone.css', 'controls.css']) {
      const src = css(f);
      for (const m of src.matchAll(/\.commands[^{]*\{([^}]*)\}/g)) {
        expect(m[1], f).not.toMatch(/overflow(-x)?\s*:\s*(auto|scroll)/);
        expect(m[1], f).not.toMatch(/mask-image/);
      }
    }
  });
  it('органы неба — непрозрачный лист --sheet с рамкой 1 px --rule-strong; строки не переносятся', () => {
    const b = rule(css('sky.css'), '.skyctl');
    expect(b).toMatch(/background:\s*var\(--sheet\)/);
    expect(b).toMatch(/border:\s*1px solid var\(--rule-strong\)/);
    expect(b).toMatch(/white-space:\s*nowrap/);
    expect(b).not.toMatch(/opacity|color-mix|backdrop/);
  });
  it('кнопки колонки на узком небе — 44 × 44, непрозрачные', () => {
    const b = rule(css('sky.css'), '.skyctl.column button');
    expect(b).toMatch(/width:\s*44px/);
    expect(b).toMatch(/height:\s*44px/);
    expect(b).toMatch(/background:\s*var\(--sheet\)/);
  });
  it('раскрывающийся список — непрозрачный лист с рамкой', () => {
    const b = rule(css('controls.css'), ".menu [role='menu']");
    expect(b).toMatch(/background:\s*var\(--sheet\)/);
    expect(b).toMatch(/border:\s*1px solid var\(--rule-strong\)/);
  });
});
