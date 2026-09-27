/**
 * Лист «Эпохи» (G8; CARD-46): сверху таблица «эпоха | годы | основание», эпоха выбранного лица выделена
 * («здесь: Давид»), у годов — помета «расч.», после «Основание:» — строчная буква.
 */
import { describe, it, expect } from 'vitest';
import { h, type VNode } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { EpochsPanel } from '../src/ui/panels/Epochs.tsx';
import { selected, model } from '../src/state.ts';

const html = () => renderToString(h(EpochsPanel, {}) as VNode).replace(/&nbsp;|&#160;/g, ' ');

describe('лист «Эпохи»', () => {
  it('сводная таблица: по строке на эпоху, годы с пометой «расч.»', () => {
    selected.value = null;
    const out = html();
    const table = out.slice(out.indexOf('<table class="epochs"'), out.indexOf('</table>'));
    expect((table.match(/<tr class="basis"/g) ?? []).length).toBe(model.value.epochs.length); // основание — строкой под каждой эпохой
    expect((table.match(/>расч\.<\/abbr>/g) ?? []).length).toBe(model.value.epochs.length);
    expect(out).not.toMatch(/здесь:/);
  });
  it('эпоха выбранного лица выделена: «здесь: Давид» у «Единого царства»', () => {
    selected.value = 'david';
    const out = html();
    const row = /<tr class="here"[^>]*>([\s\S]*?)<\/tr>/.exec(out)?.[1] ?? '';
    expect(row).toMatch(/Единое царство/);
    expect(row).toMatch(/здесь: Давид/);
    selected.value = null;
  });
  it('после «Основание:» — строчная, но имена — с прописной', () => {
    const out = html();
    expect(out).toMatch(/Основание: сумма/);
    expect(out).toMatch(/Основание: Авраам/);
    expect(out).not.toMatch(/Основание: авраам/);
  });
});
