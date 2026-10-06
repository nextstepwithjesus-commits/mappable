/**
 * Этап 21, решение 199: журнал шагов карты (src/ui/history.ts). Рецензия этапа 21: диктор называет, что вернулось и что
 * ушло, а пустой журнал не молчит — «Отменять нечего».
 */
import { describe, expect, it } from 'vitest';
import { batch } from '@preact/signals';
import { linkSet, setShowState, workSet } from '../src/ui/work.ts';
import { expanded, opened, stepForward } from '../src/ui/reveal.ts';
import { canRedo, canUndo, historyKeys, historyNews, redo, resetHistory, startHistory, undo } from '../src/ui/history.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));
const ids = () => [...workSet.peek().keys()].sort();
function start(...xs: string[]) {
  batch(() => {
    linkSet.value = null;
    workSet.value = new Map(xs.map((id) => [id, { via: 'self' as const, of: id }]));
    expanded.value = {};
    opened.value = [];
    setShowState({ kind: 'set' });
  });
}

describe('журнал шагов (решение 199)', () => {
  it('шаг — одна запись; отмена называет ушедших, возврат — вернувшихся; пустой журнал — «Отменять нечего»', async () => {
    start('adam', 'iisus');
    startHistory();
    await tick();
    resetHistory();
    stepForward('adam');
    await tick();
    expect(canUndo.value).toBe(true);
    expect(undo()).toBe(true);
    expect(ids()).toEqual(['adam', 'iisus']);
    expect(historyNews.value?.text).toMatch(/^Шаг отменён: с карты ушли .*Ева/);
    expect(canRedo.value).toBe(true);
    expect(redo()).toBe(true);
    expect(ids()).toContain('sif');
    expect(historyNews.value?.text).toMatch(/^Шаг возвращён: на карту вернулись .*Ева/);
    expect(undo()).toBe(true);
    expect(undo()).toBe(false);
    expect(historyNews.value?.text).toBe('Отменять нечего');
  });

  it('клавиши — по физическим кодам (и на русской раскладке): Ctrl+Z отменяет, Ctrl+Y возвращает, без Ctrl — не журнал', async () => {
    start('adam', 'iisus');
    await tick();
    resetHistory();
    stepForward('adam');
    await tick();
    const ev = (o: Partial<KeyboardEvent>) => ({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, code: 'KeyZ', target: null, ...o }) as unknown as KeyboardEvent;
    expect(historyKeys(ev({ code: 'KeyZ' }))).toBe(true);
    expect(ids()).toEqual(['adam', 'iisus']);
    expect(historyKeys(ev({ code: 'KeyY' }))).toBe(true);
    expect(ids()).toContain('eva');
    expect(historyKeys(ev({ code: 'KeyZ', ctrlKey: false }))).toBe(false);
  });
});
