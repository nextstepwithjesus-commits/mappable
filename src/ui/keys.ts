/**
 * Клавиши всего атласа (на window): «/» — к поиску, Escape — снять одно видимое состояние (D5).
 * Клавиши неба — в src/ui/sky/input.ts (на холсте).
 */
import { panel, selected, second, pickMode, pins, clearPair } from '../state.ts';

/** Поле, в котором набирают текст (не флажок и не кнопка). */
export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(t.type);
}

function onKey(e: KeyboardEvent) {
  // в поле ввода клавиши принадлежат полю: Escape там не закрывает ни панель, ни карточку (IX-14)
  const typing = isTextField(e.target);
  if (e.code === 'Slash' && !typing && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('find')?.focus();
  }
  // поле без своего Escape: нажатие только уводит из поля, следующее уже снимает состояние
  if (e.code === 'Escape' && typing && !e.defaultPrevented) (e.target as HTMLElement).blur();
  if (e.code === 'Escape' && !typing && !e.defaultPrevented) {
    // каждое нажатие снимает одно видимое состояние, по порядку (D5)
    if (pickMode.value) pickMode.value = null;
    else if (panel.value) panel.value = null;
    else if (pins.value.length) pins.value = [];
    else if (second.value) clearPair();
    else if (selected.value) selected.value = null;
  }
}

/** Подключить клавиши атласа. Возвращает отписку. */
export function bindKeys(): () => void {
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
