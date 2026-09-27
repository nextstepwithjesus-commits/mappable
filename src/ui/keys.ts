/**
 * Клавиши всего атласа (на window, по физическим клавишам — KeyboardEvent.code, поэтому и на русской раскладке):
 * «/» — к поиску, «?» — таблица клавиш, Escape — снять одно видимое состояние (D5), J и K — разделы карточки,
 * клавиши неба (src/ui/sky/input.ts, skyKeys) — без фокуса на холсте (D10; IX-38, 40, 41, 42; UX-40).
 */
import { panel, selected, second, pickMode, pins, pinsQuery, skyGroup, clearPair } from '../state.ts';
import { skyKeys } from './sky/input.ts';
import { openLegend, reduced } from './sky/view.ts';

/** «?» — таблица клавиш в «Условных знаках» (раздел «Клавиши»); повторное нажатие закрывает панель. */
function toggleKeys() {
  if (panel.value === 'legend') panel.value = null;
  else openLegend('keys');
}

/** Поле, в котором набирают текст (не флажок и не кнопка). */
export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(t.type);
}

/** Элементы, у которых стрелки, Home и End свои: меню, списки, переключатели, ползунок полосы времени. */
const OWN_ARROWS = '[role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="tablist"], [role="grid"], select';

/**
 * Стрелки и Home ведут небо, когда фокус на странице, на холсте, в небе или в верхней строке — но не в карточке
 * и не в панели: там они прокручивают текст.
 */
export function skyNav(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement) || t === document.body || t === document.documentElement) return true;
  if (t.closest(OWN_ARROWS)) return false;
  return !!t.closest('.sky, .top');
}

/** Разделы открытой карточки по порядку: разделы с заголовком и сведённые строки «в Писании не сообщается». */
function sections(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.folio:not([hidden]) .sec[id^="sec-"]')];
}

/**
 * J — к следующему разделу карточки, K — к предыдущему (IX-42). Раздел прокручивается к верху листа, фокус — на его
 * заголовок: дальше Tab идёт по ссылкам этого раздела. Возвращает, к какому разделу перешли.
 */
export function stepSection(dir: 1 | -1): HTMLElement | null {
  const secs = sections();
  if (!secs.length) return null;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('.sec[id^="sec-"]') : null;
  let cur = active ? secs.indexOf(active) : -1;
  if (cur < 0) {
    // по прокрутке: последний раздел, чей верх уже у верхнего края листа
    const box = document.querySelector<HTMLElement>('.folio:not([hidden])')!.getBoundingClientRect();
    secs.forEach((s, i) => {
      if (s.getBoundingClientRect().top <= box.top + 96) cur = i;
    });
  }
  const to = secs[Math.max(0, Math.min(secs.length - 1, cur + dir))];
  if (!to || (to === secs[cur] && active)) return null;
  const head = to.querySelector<HTMLElement>('h4, h3') ?? to;
  if (!head.hasAttribute('tabindex')) head.setAttribute('tabindex', '-1');
  to.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  head.focus({ preventScroll: true });
  return to;
}

function onKey(e: KeyboardEvent) {
  // в поле ввода клавиши принадлежат полю: Escape там не закрывает ни панель, ни карточку (IX-14)
  const typing = isTextField(e.target);
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  if (e.code === 'Slash' && !typing && !mod) {
    e.preventDefault();
    // Shift + «/» — «?» на английской раскладке; на русской «?» — Shift + 7, его ловит e.key ниже
    if (e.shiftKey) toggleKeys();
    else document.getElementById('find')?.focus();
    return;
  }
  if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    toggleKeys();
    return;
  }
  // поле без своего Escape: нажатие только уводит из поля, следующее уже снимает состояние
  if (e.code === 'Escape' && typing && !e.defaultPrevented) (e.target as HTMLElement).blur();
  if (e.code === 'Escape' && !typing && !e.defaultPrevented) {
    // каждое нажатие снимает одно видимое состояние, по порядку (D5)
    if (pickMode.value) pickMode.value = null;
    else if (panel.value) panel.value = null;
    else if (pins.value.length) {
      pins.value = [];
      pinsQuery.value = '';
    } else if (skyGroup.value) skyGroup.value = null;
    else if (second.value) clearPair();
    else if (selected.value) selected.value = null;
    return;
  }
  if (typing || mod || e.defaultPrevented) return;
  const t = e.target instanceof HTMLElement ? e.target : null;
  // в меню и списках буквы и стрелки — свои
  if (t?.closest('[role="menu"], [role="listbox"]')) return;
  if ((e.code === 'KeyJ' || e.code === 'KeyK') && !e.shiftKey) {
    if (stepSection(e.code === 'KeyJ' ? 1 : -1)) e.preventDefault();
    return;
  }
  skyKeys(e, skyNav(e.target), !!t && t.tagName === 'CANVAS' && !!t.closest('.sky'));
}

/** Подключить клавиши атласа. Возвращает отписку. */
export function bindKeys(): () => void {
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
