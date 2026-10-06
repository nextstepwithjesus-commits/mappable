/**
 * Клавиши всего атласа (на window, по физическим клавишам — KeyboardEvent.code, поэтому и на русской раскладке):
 * «/» — к поиску, «?» — таблица клавиш, Escape — снять одно видимое состояние (D5), J и K — разделы карточки, G («п») —
 * небо ↔ карточка (решение 149),
 * клавиши неба (src/ui/sky/input.ts, skyKeys) — без фокуса на холсте (D10; IX-38, 40, 41, 42; UX-40).
 * Клавиши-буквы можно выключить (решение 48; WCAG 2.1.4): letterKeys.
 */
import { effect, signal } from '@preact/signals';
import { panel, selected, second, pickMode, pins, pinsQuery, skyGroup, clearPair } from '../state.ts';
import { skyKeys, viewKeys } from './sky/skykeys.ts';
import { historyKeys } from './history.ts';
import { introOpen, openLegend, reduced } from './sky/view.ts';
import { focusCardTitle, focusPanelAt, focusQuietly, foldIntro } from './focus.ts';
import { canReturn, returnFromFamily } from './show.ts';
import { groupFocus, storyStep } from './story/state.ts';
import { closeStory, nextStep, prevStep } from './story/story.ts';
import { clearGroupFocus } from './story/areas.ts';
import { closeFamilyInset, familyInset, toggleFamilyInset } from './sky/inset.ts';
import { selectUnion, selectedUnion } from './reveal.ts';

/**
 * «?» — таблица клавиш в «Условных знаках» (раздел «Клавиши»), фокус — на её заголовок; повторное нажатие закрывает
 * панель, Escape тоже, и фокус возвращается туда, откуда пришли (I2; src/ui/focus.ts).
 */
function toggleKeys() {
  if (panel.value === 'legend') panel.value = null;
  else {
    focusPanelAt('#legend-keys');
    openLegend('keys');
  }
}

/** Поле, в котором набирают текст (не флажок и не кнопка). */
export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(t.type);
}

/** Элементы, у которых стрелки, Home и End свои: меню, списки, переключатели, ползунок полосы времени, ручки границ областей (J2). */
const OWN_ARROWS = '[role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="tablist"], [role="grid"], [role="separator"], select';

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

/**
 * Видимые состояния, которые снимает Escape. family — небо показывает «Ближайшую родню», и есть куда вернуться
 * (решение 145; src/ui/show.ts, canReturn). Этап 16: inset — врезка «Семья созвездием» (решение 186; первой), area —
 * созвездие в фокусе (решение 185), story — рассказ (решение 187: «Выйти на небо»).
 */
export type EscapeState = {
  inset?: boolean;
  pick: boolean;
  panel: boolean;
  pins: boolean;
  group: boolean;
  second: boolean;
  area?: boolean;
  family?: boolean;
  story?: boolean;
  /** карточка союза в колонке на месте карточки лица (решения 71, 194): Escape возвращает карточку лица */
  union?: boolean;
  selected: boolean;
  intro: boolean;
};

/**
 * Что снимет следующий Escape (D5): врезка семьи (этап 16), выбор второго лица, панель, отметки поиска, группа, пара,
 * фокус созвездия (окно до фокуса), «Ближайшая родня» (возврат к прежнему показу и окну, решение 145; лицо остаётся
 * выбранным), рассказ («Выйти на небо»: окно и лицо остаются), выбранное лицо и последней — вступительная табличка (UX-76):
 * она сворачивается в «Как читать карту», когда ничего другого снимать уже нечего.
 */
export function escapeTarget(s: EscapeState): keyof EscapeState | null {
  const order: (keyof EscapeState)[] = ['inset', 'pick', 'panel', 'pins', 'group', 'second', 'area', 'family', 'story', 'union', 'selected', 'intro'];
  return order.find((k) => s[k]) ?? null;
}

/** Где был фокус в карточке, когда клавиша «п» увела его на небо (M9): «п» с неба возвращает его туда же. */
let cardSpot: HTMLElement | null = null;
/** Фокус сейчас на небе: на холсте или в списке лиц неба. */
const onSkyNow = (a: Element | null) => !!a && ((a.tagName === 'CANVAS' && !!a.closest('.sky')) || !!a.closest('#sky-stars'));

/**
 * Клавиша «п» (физическая G; решение 149, M9): небо ↔ карточка. С неба — в карточку выбранного лица, туда, где фокус был
 * прежде (то же имя «Родства»), иначе на её заголовок; откуда угодно ещё — на небо: кольцо фокуса у выбранного лица
 * (src/ui/sky/SkyA11y.tsx, enterSky). Возвращает, перешёл ли фокус.
 */
export function toggleSkyCard(): boolean {
  const a = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const canvas = document.querySelector<HTMLCanvasElement>('.sky > canvas');
  if (onSkyNow(a)) {
    const id = selected.peek();
    if (!id) return false;
    if (cardSpot && cardSpot.isConnected && cardSpot.closest('.folio:not([hidden]), .dotcard') && focusQuietly(cardSpot)) return true;
    focusCardTitle(id);
    return true;
  }
  if (!canvas) return false;
  if (a && a.closest('.folio, .dotcard')) cardSpot = a;
  canvas.focus({ preventScroll: true });
  return document.activeElement === canvas;
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
    // каждое нажатие снимает одно видимое состояние, по порядку (D5); вступительная табличка — последней (UX-76)
    const next = escapeTarget({
      inset: !!familyInset.value,
      pick: !!pickMode.value,
      panel: !!panel.value,
      pins: pins.value.length > 0,
      group: !!skyGroup.value,
      second: !!second.value,
      area: !!groupFocus.value,
      family: canReturn.value,
      story: storyStep.value !== null,
      union: !!selectedUnion.value && !!selected.value,
      selected: !!selected.value,
      intro: introOpen.value,
    });
    if (next === 'inset') closeFamilyInset();
    else if (next === 'pick') pickMode.value = null;
    else if (next === 'panel') panel.value = null;
    else if (next === 'pins') {
      pins.value = [];
      pinsQuery.value = '';
    } else if (next === 'group') skyGroup.value = null;
    else if (next === 'second') clearPair();
    else if (next === 'area') clearGroupFocus();
    else if (next === 'family') returnFromFamily();
    else if (next === 'story') closeStory();
    else if (next === 'union') selectUnion(null);
    else if (next === 'selected') selected.value = null;
    else if (next === 'intro') foldIntro();
    return;
  }
  // журнал шагов карты (этап 21, решение 199): Ctrl+Z — отменить, Ctrl+Shift+Z и Ctrl+Y — вернуть; в полях ввода — их отмена
  if (!typing && !e.defaultPrevented && historyKeys(e)) {
    e.preventDefault();
    return;
  }
  // масштаб по одной оси (J1: Shift и Alt с «+» и «−») и «Небо во весь экран» (J2: F) — src/ui/sky/skykeys.ts
  if (!typing && !e.ctrlKey && !e.metaKey && !e.defaultPrevented && viewKeys(e)) return;
  if (typing || mod || e.defaultPrevented) return;
  const t = e.target instanceof HTMLElement ? e.target : null;
  // в меню и списках буквы и стрелки — свои
  if (t?.closest('[role="menu"], [role="listbox"]')) return;
  // рассказ (этап 16, решение 187): PageDown и PageUp — следующий и предыдущий шаг; в панели и в карточке они листают текст
  if ((e.code === 'PageDown' || e.code === 'PageUp') && storyStep.value !== null && !e.shiftKey && !t?.closest('.sheet, .folio:not(.story), [role="slider"]')) {
    if (e.code === 'PageDown' ? nextStep() : prevStep()) e.preventDefault();
    return;
  }
  // врезка «Семья созвездием» (этап 16, решение 186): Shift + F (на русской раскладке — Shift + А); F без Shift — «Небо
  // во весь экран» (J2): одна клавиша — одно значение
  if (e.code === 'KeyF' && e.shiftKey) {
    if (toggleFamilyInset()) e.preventDefault();
    return;
  }
  if (e.code === 'KeyG' && !e.shiftKey) {
    if (toggleSkyCard()) e.preventDefault();
    return;
  }
  if ((e.code === 'KeyJ' || e.code === 'KeyK') && !e.shiftKey) {
    if (stepSection(e.code === 'KeyJ' ? 1 : -1)) e.preventDefault();
    return;
  }
  // фокус на холсте или в списке лиц неба: стрелки водят фокус по звёздам (I1)
  const onCanvas = !!t && t.tagName === 'CANVAS' && !!t.closest('.sky');
  skyKeys(e, skyNav(e.target), onCanvas, onCanvas || !!t?.closest('#sky-stars'));
}

// ---------- клавиши-буквы: вкл. | выкл. (решение 48; WCAG 2.1.4) ----------

/** Где помнится выбор «Клавиши-буквы»: «true» — включены (так по умолчанию), «false» — выключены. */
export const LETTER_KEYS = 'toledot:letterKeys';
function readLetterKeys(): boolean {
  try {
    return localStorage.getItem(LETTER_KEYS) !== 'false';
  } catch {
    return true;
  }
}
/** Клавиши-буквы включены: переключатель в таблице «Клавиши» (src/ui/top/Keys.tsx), помнится в localStorage. */
export const letterKeys = signal(typeof window === 'undefined' ? true : readLetterKeys());
if (typeof window !== 'undefined')
  effect(() => {
    const on = letterKeys.value;
    try {
      localStorage.setItem(LETTER_KEYS, on ? 'true' : 'false');
    } catch {
      /* память браузера недоступна: выбор держится до перезагрузки */
    }
  });

/** Клавиши, которые работают и при выключенных буквах: «/» и «?» (поиск, эта таблица), «+» и «−» (масштаб), пробел. */
const ALWAYS = new Set(['Slash', 'NumpadDivide', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Space']);

/**
 * Одиночная клавиша-знак (WCAG 2.1.4): буква, цифра, знак препинания или символ без Ctrl, Alt и Cmd (Shift — не
 * модификатор: заглавная буква — та же буква). Стрелки, Enter, Escape, Tab, Home, End, F-клавиши — не знаки; «/», «?»,
 * «+», «−» и пробел выключатель не трогает.
 */
export function isCharKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if ([...e.key].length !== 1 || e.key === ' ' || e.key === '?') return false;
  return !ALWAYS.has(e.code);
}

/**
 * Клавиши-буквы выключены — одиночная клавиша-знак не доходит ни до одного обработчика атласа (E, L, F, D, C, J, K,
 * [ ] , . 0 и все будущие): её останавливает этот обработчик, первый на window. Действие браузера (ввод в поле, поиск по
 * странице при наборе) не отменяется. Поля ввода, меню и списки получают букву как обычно: там она — ввод или переход
 * к пункту.
 */
function letterGuard(e: KeyboardEvent) {
  if (letterKeys.peek() || !isCharKey(e) || isTextField(e.target)) return;
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (t?.closest('[role="menu"], [role="menubar"], [role="listbox"]')) return;
  e.stopImmediatePropagation();
}

/**
 * Последний ввод — с клавиатуры (решение 169; R2-11): скобки фокуса на небе рисуются только после клавиатуры. Касание
 * и мышь их гасят, даже если фокус остался на холсте (лист карточки, закрываясь, возвращает фокус на небо).
 */
export const keyboardInput = signal(false);
const onAnyKey = (e: KeyboardEvent) => {
  // клавиши-модификаторы сами по себе (Ctrl + колесо, Shift при щелчке) — не ввод с клавиатуры
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
  if (!keyboardInput.peek()) keyboardInput.value = true;
};
const onAnyPointer = () => {
  if (keyboardInput.peek()) keyboardInput.value = false;
};

/** Подключить клавиши атласа. Возвращает отписку. */
export function bindKeys(): () => void {
  window.addEventListener('keydown', onAnyKey, true);
  window.addEventListener('pointerdown', onAnyPointer, true);
  window.addEventListener('keydown', letterGuard, true);
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onAnyKey, true);
    window.removeEventListener('pointerdown', onAnyPointer, true);
    window.removeEventListener('keydown', letterGuard, true);
    window.removeEventListener('keydown', onKey);
  };
}
