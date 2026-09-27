/**
 * Фокус клавиатуры при открытии и закрытии панелей и карточки (I2; MOB-32, MOB-33, IX-29):
 * — открылась панель — фокус на её заголовок h2 (или на раздел, ради которого её открыли: «?» — на «Клавиши»);
 * — закрылась — на то, что было в фокусе перед открытием («Указатель» в верхней строке, холст неба, заголовок карточки);
 * — открылась карточка, а фокус потерялся (ссылка, по которой перешли, ушла из разметки) — на заголовок карточки;
 * — закрылась карточка — туда, откуда её открыли; если этого места больше нет — на холст неба.
 * Фокус переносится, только если он потерялся (document.body) или остался в закрытой панели: кнопку, с которой
 * читатель закрыл панель («Указатель» в строке команд), он не покидает.
 */
import { effect } from '@preact/signals';
import { panel, selected, type Panel } from '../state.ts';
import { grid } from './layout.ts';

/**
 * Панели, которые на телефоне ложатся полноэкранным листом (H1): пока такой лист открыт, небо, карточка и полоса
 * времени под ним недоступны клавиатуре и диктору (inert; I2, MOB-32). «Эпохи» — лист на 55 % под ярусами, «Вид» —
 * лист внутри неба: небо над ними видно и отвечает, они не модальны. Верхняя строка остаётся доступной: она над листом.
 */
export const modalOnPhone = (p: Panel) => p !== null && p !== 'epochs' && p !== 'view';
/** Что закрывает полноэкранный лист панели на телефоне. */
const UNDER_SHEET = '.app > main > .sky, .app > .folio, .app > .strip';
function setModal(on: boolean) {
  for (const el of document.querySelectorAll(UNDER_SHEET)) el.toggleAttribute('inert', on);
}

/** Элемент, на который стоит вернуть фокус: в разметке, видим и не за inert. */
function usable(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.isConnected && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0;
}

/** Что сейчас в фокусе (null — фокус потерян: на body или на удалённом элементе). */
function current(): HTMLElement | null {
  const a = document.activeElement;
  return a instanceof HTMLElement && a !== document.body && a.isConnected ? a : null;
}

/** Поставить фокус на элемент, не прокручивая: заголовок получает tabindex −1. */
export function focusQuietly(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

/** Холст неба — запасное место для фокуса. */
const skyCanvas = () => document.querySelector<HTMLElement>('.sky canvas');

/** Корень открытой панели: колонка сетки, разворот или лист «Вид» узкого неба. */
const panelRoot = () => document.querySelector<HTMLElement>('.app > .sheet, .app > .spread, .sky > .sheet');

/** Заголовок карточки лица id. */
export const cardTitle = (id: string) => document.querySelector<HTMLElement>(`.folio #title-${CSS.escape(id)}`);

/** После отрисовки: сигналы перерисовывают Preact в микрозадаче, разметка готова к следующей задаче. */
const later = (fn: () => void) => window.setTimeout(fn, 0);

/** Место возврата: пункт меню («Ещё», «Разделы») уходит из разметки вместе со списком — возвращаться на кнопку меню. */
function openerOf(a: HTMLElement | null): HTMLElement | null {
  if (!a?.closest('[role="menu"]')) return a;
  return a.closest('.menu')?.querySelector<HTMLElement>(':scope > button') ?? a;
}

let panelOpener: HTMLElement | null = null;
let panelTarget: string | null = null;
let cardOpener: HTMLElement | null = null;

/** Следующая открытая панель получит фокус не на h2, а на элементе sel (клавиша «?» — раздел «Клавиши»). */
export function focusPanelAt(sel: string) {
  panelTarget = sel;
}

/**
 * Карточка открыта с клавиатуры (Enter на небе, в списке лиц неба): фокус на её заголовок, как после поиска.
 * Заголовок появляется после отрисовки выбора.
 */
export function focusCardTitle(id: string) {
  later(() => {
    if (selected.peek() === id) focusQuietly(cardTitle(id));
  });
}

/** Подключить перенос фокуса (App). Возвращает отписку. */
export function bindFocus(): () => void {
  let shownPanel = panel.peek();
  let shownSel = selected.peek();
  const offPanel = effect(() => {
    const p = panel.value;
    if (p === shownPanel) return;
    shownPanel = p;
    const a = current();
    if (p) {
      // смена одной панели на другую не меняет места возврата: оно — вне панелей
      if (!a?.closest('.sheet, .spread')) panelOpener = openerOf(a);
      const target = panelTarget;
      panelTarget = null;
      later(() => {
        const root = panelRoot();
        // панель сама поставила фокус в своё поле (поле «Второе» в «Родстве») — не мешать
        if (!root || root.contains(document.activeElement)) return;
        focusQuietly((target ? root.querySelector<HTMLElement>(target) : null) ?? root.querySelector<HTMLElement>('h2'));
      });
      return;
    }
    later(() => {
      if (current()) return;
      const back = usable(panelOpener) ? panelOpener : skyCanvas();
      panelOpener = null;
      back?.focus({ preventScroll: true });
    });
  });
  const offSel = effect(() => {
    const id = selected.value;
    if (id === shownSel) return;
    const was = shownSel;
    shownSel = id;
    const a = current();
    if (id && !was) cardOpener = a && !a.closest('.folio') ? openerOf(a) : null;
    later(() => {
      if (current()) return;
      if (id) {
        // перешли по ссылке внутри карточки: ссылка ушла из разметки вместе с прежним лицом — фокус на новый заголовок
        focusQuietly(cardTitle(id));
        return;
      }
      const back = usable(cardOpener) ? cardOpener : skyCanvas();
      cardOpener = null;
      back?.focus({ preventScroll: true });
    });
  });
  // модальный лист телефона: inert снимается раньше, чем фокус возвращается на место под листом
  const offModal = effect(() => {
    const on = grid.value.phone && modalOnPhone(panel.value);
    void selected.value;
    setModal(on);
    // корень карточки мог перерисоваться вместе с выбором — ещё раз после отрисовки
    later(() => setModal(grid.peek().phone && modalOnPhone(panel.peek())));
  });
  return () => {
    offPanel();
    offSel();
    offModal();
    setModal(false);
  };
}
