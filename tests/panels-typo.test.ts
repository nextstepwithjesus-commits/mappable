/**
 * Русская типографика в панелях (B5): вводка и собственные строки панели идут через typo(),
 * число лиц — с разрядным пробелом («2 660»).
 */
import { describe, it, expect } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { Sheet } from '../src/ui/panels/Sheet.tsx';
import { IndexPanel } from '../src/ui/panels/Index.tsx';
import { persons } from '../src/data/atlas.ts';

const NBSP = ' ';
const html = (v: VNode) => renderToString(v).replace(/&nbsp;|&#160;/g, NBSP);

describe('панели набраны по правилам русской типографики', () => {
  it('вводка и строки панели: «ок.», «г.» и книга с главой не отрываются', () => {
    const out = html(h(Sheet, { title: 'Проба', lead: 'Родился ок. 1040 г. до Р. Х., см. 1 Пар 3', children: h('p', null, 'Около 5 г. до Р. Х. — по Мф 1') }) as VNode);
    expect(out).toContain(`ок.${NBSP}1040${NBSP}г.`);
    expect(out).toContain(`см.${NBSP}1${NBSP}Пар${NBSP}3`);
    expect(out).toContain(`по${NBSP}Мф${NBSP}1`);
  });
  it('«Указатель» называет число лиц с разрядным пробелом', () => {
    const out = html(h(IndexPanel, {}) as VNode);
    const n = persons.length;
    expect(n).toBeGreaterThanOrEqual(1000);
    expect(out).toContain(`(${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)})`);
  });
});
