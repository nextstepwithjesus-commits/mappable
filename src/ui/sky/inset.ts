/**
 * Состояние врезки «Семья созвездием» (этап 16, решение 186; договор F → S). Без отрисовки и разметки: его читают
 * адрес (поле «~f<id>»), клавиши (Shift + F, Escape), щелчок по скоплению семьи на небе и строка «Ближайшей родни».
 *
 *  — familyInset — открыта ли врезка и чья: центр врезки может отличаться от выбранного лица (выбор во врезке — тот же
 *    выбор лица, карточка справа общая; шаг к сыну по пыли внуков делает центром его);
 *  — openFamilyInset(id) — выбрать лицо, если оно не выбрано, и открыть врезку; false — у лица нет ни родителей,
 *    ни союзов;
 *  — closeFamilyInset() — Escape, «Закрыть», «по времени»; true — врезка была открыта;
 *  — toggleFamilyInset() — Shift + F: открыть для выбранного лица или закрыть.
 */
import { batch, signal } from '@preact/signals';
import { selected } from '../../state.ts';
import { hasFamilyIn } from '../../engine/famplot.ts';
import { unions } from '../reveal.ts';

export type InsetFrom = 'cluster' | 'card' | 'key' | 'near' | 'address' | 'step';

export const familyInset = signal<{ id: string; from: InsetFrom } | null>(null);

/** У лица есть родители или союзы — врезке есть что показать. */
export const hasFamily = (id: string): boolean => hasFamilyIn(id, unions);

export function openFamilyInset(id: string, from: InsetFrom = 'card'): boolean {
  if (!hasFamily(id)) return false;
  const cur = familyInset.peek();
  if (cur && cur.id === id && selected.peek() === id) return true;
  batch(() => {
    if (selected.peek() !== id) selected.value = id;
    familyInset.value = { id, from };
  });
  return true;
}

export function closeFamilyInset(): boolean {
  if (!familyInset.peek()) return false;
  familyInset.value = null;
  return true;
}

export function toggleFamilyInset(): boolean {
  if (familyInset.peek()) return closeFamilyInset();
  const id = selected.peek();
  return id ? openFamilyInset(id, 'key') : false;
}
