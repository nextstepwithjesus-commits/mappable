/**
 * Образец #/specimen (B7; VIS-38): правила состояний и тем выводятся из действующих стилей, таблицы образца полны,
 * а состояния карточки показаны на лицах, у которых они действительно есть.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitSelectorList, specimenSelectorList } from '../src/ui/specimen-css.ts';
import { CONTRAST_USES, contrast } from '../src/ui/contrast.ts';
import { CARD_STATES, TOKEN_ROLES, TYPE_ROWS, contrastRows, toHex } from '../src/ui/Specimen.tsx';
import { SECTIONS } from '../src/ui/Folio.tsx';
import { cardSections, allIds, byId } from './helpers/cards.ts';

const tokensCss = readFileSync(join(__dirname, '../src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (head: string) => {
  const i = tokensCss.indexOf(head);
  return tokensCss.slice(tokensCss.indexOf('{', i) + 1, tokensCss.indexOf('}', i));
};
const names = (b: string) => [...b.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);

describe('двойники правил для образца', () => {
  it('список селекторов делится только по запятым верхнего уровня', () => {
    expect(splitSelectorList('.a:hover, :is(.b, .c) d, [title="x,y"]')).toEqual(['.a:hover', ':is(.b, .c) d', '[title="x,y"]']);
  });
  it('наведение, нажатие и фокус — атрибутом data-pseudo, с тем же местом в селекторе', () => {
    expect(specimenSelectorList('.cmd:hover')).toBe('.cmd[data-pseudo~="hover"]');
    expect(specimenSelectorList('.check input:active::before')).toBe('.check input[data-pseudo~="active"]::before');
    expect(specimenSelectorList(':focus-visible')).toBe('[data-pseudo~="focus"]');
    expect(specimenSelectorList('.field input:focus')).toBe('.field input[data-pseudo~="focus"]');
    expect(specimenSelectorList('.seg button:hover, .x, .skyctl .zoom button:hover')).toBe('.seg button[data-pseudo~="hover"], .skyctl .zoom button[data-pseudo~="hover"]');
  });
  it('правило без состояний и :focus-within не трогаются', () => {
    expect(specimenSelectorList('.cmd[aria-pressed="true"]')).toBeNull();
    expect(specimenSelectorList('.menu:focus-within')).toBeNull();
    expect(specimenSelectorList(':hovering')).toBeNull();
  });
  it('токены темы с корня переходят на обёртку колонки образца', () => {
    // браузер записывает селектор с двойными кавычками, исходник — с одинарными: годятся оба
    expect(specimenSelectorList(':root, :root[data-map="night"]')).toBe('.spec-map[data-map="night"]');
    expect(specimenSelectorList(":root[data-map='day']")).toBe('.spec-map[data-map="day"]');
    expect(specimenSelectorList(':root:not([data-map])')).toBeNull();
    expect(specimenSelectorList(':root[data-map]')).toBeNull();
  });
  it('обе темы tokens.css заданы правилами, которые образец умеет перенести на обёртку', () => {
    expect(tokensCss).toContain(":root[data-map='night']");
    expect(tokensCss).toContain(":root[data-map='day']");
  });
});

describe('таблицы образца полны', () => {
  it('восемь строк шкалы кеглей — ровно ступени tokens.css', () => {
    const scale = names(block(':root {\n  --serif')).filter((n) => n.startsWith('--t-') && !n.endsWith('-lh'));
    expect(TYPE_ROWS.map((r) => r.token).sort()).toEqual(scale.sort());
    expect(TYPE_ROWS).toHaveLength(8);
    // 11,5 — только на холсте
    expect(TYPE_ROWS.filter((r) => r.canvas).map((r) => r.token)).toEqual(['--t-map-s']);
  });
  it('у каждого токена темы есть строка в таблице цветов, и лишних строк нет', () => {
    const night = names(block(":root[data-map='night']")).filter((n) => n.startsWith('--'));
    expect(Object.keys(TOKEN_ROLES).sort()).toEqual(night.sort());
  });
  it('пары контраста называют существующие токены; формула WCAG', () => {
    for (const u of CONTRAST_USES) {
      expect(TOKEN_ROLES[u.fg], u.fg).toBeTruthy();
      expect(TOKEN_ROLES[u.bg], u.bg).toBeTruthy();
    }
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#0d1b34', '#e8eef7')).toBeCloseTo(contrast('#e8eef7', '#0d1b34'), 10);
  });
  it('строки контраста токена: фон по употреблению и наибольший порог', () => {
    expect(contrastRows('--ink')).toEqual([
      { bg: '--sky', min: 4.5 },
      { bg: '--sheet', min: 4.5 },
      { bg: '--sheet-2', min: 4.5 },
    ]);
    expect(contrastRows('--rule')).toEqual([{ bg: '--sheet', min: null }]);
    expect(contrastRows('--glow')).toEqual([]);
  });
  it('сжатый цвет сборки разворачивается в #rrggbb', () => {
    expect(toHex('#FFF')).toBe('#ffffff');
    expect(toHex(' #0d1b34 ')).toBe('#0d1b34');
    expect(toHex('white')).toBeNull(); // без пробного элемента именованный цвет не разобрать
  });
});

describe('состояния карточки на образце — правда о данных', () => {
  it('подписи состояний верны для всех лиц атласа', async () => {
    const content = new Map<string, number>();
    const silentOnly = new Map<string, number>();
    for (const id of allIds) {
      const secs = await cardSections(id);
      const silent = new Set(byId.get(id)!.silent);
      content.set(id, secs.size);
      silentOnly.set(id, SECTIONS.filter((s) => !secs.has(s.n) && silent.has(s.n)).length);
    }
    const st = Object.fromEntries(CARD_STATES.map((s) => [s.key, s]));
    // «24 раздела»: составлены все
    expect(content.get(st.full.id)).toBe(24);
    // «самая короткая»: короче нет, и карточки из одного раздела в атласе нет
    const min = Math.min(...content.values());
    expect(content.get(st.short.id)).toBe(min);
    expect(min).toBeGreaterThan(1);
    // «Писание молчит»: больше всего разделов, о которых Писание молчит
    expect(silentOnly.get(st.silent.id)).toBe(Math.max(...silentOnly.values()));
    // «не составлено»: есть разделы и без сведений, и без пометы «Писание молчит»
    const absent = SECTIONS.length - content.get(st.absent.id)! - silentOnly.get(st.absent.id)!;
    expect(absent).toBeGreaterThan(0);
    expect(st.silent.schema && st.absent.schema).toBe(true);
  }, 120_000);
});
