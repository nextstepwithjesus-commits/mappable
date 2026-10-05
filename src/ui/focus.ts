/**
 * Фокус клавиатуры при открытии и закрытии панелей и карточки (I2; MOB-32, MOB-33, IX-29):
 * — открылась панель — фокус на её заголовок h2 (или на раздел, ради которого её открыли: «?» — на «Клавиши»);
 * — закрылась — на то, что было в фокусе перед открытием («Указатель» в верхней строке, холст неба, заголовок карточки);
 * — открылась карточка, а фокус потерялся (ссылка, по которой перешли, ушла из разметки) — на заголовок карточки;
 * — закрылась карточка — туда, откуда её открыли; если этого места больше нет — на холст неба.
 * Фокус переносится, только если он потерялся (document.body) или остался в закрытой панели: кнопку, с которой
 * читатель закрыл панель («Указатель» в строке команд), он не покидает.
 */
import { computed, effect } from '@preact/signals';
import { introDone, panel, pickMode, selected, type Panel } from '../state.ts';
import { grid } from './layout.ts';
import { introOpen } from './sky/view.ts';

/**
 * Свернуть вступительную табличку (Escape — последним в цепочке, UX-76): остаётся команда «Как читать карту» в углу неба.
 * Фокус, который был в табличке, переходит на эту команду (bindFocus, offIntro).
 */
export function foldIntro() {
  introDone.value = true;
  introOpen.value = false;
}

/**
 * Куда фокус после смены таблички (UX-76). Открыли — на её заголовок («Как читать карту» ставит фокус туда, а не оставляет
 * его на странице). Свернули, а фокус был в ней (Escape, «×», «Свернуть»), — на команду «Как читать карту». Свернули
 * вместе с выбором лица (вход «Давид», звезда) — фокусом занимается карточка (offSel): null.
 */
export function introFocusTarget(o: { open: boolean; wasInside: boolean; selChanged: boolean }): 'title' | 'command' | null {
  if (o.open) return 'title';
  return o.wasInside && !o.selChanged ? 'command' : null;
}

/**
 * Панели, которые на телефоне ложатся полноэкранным листом (H1): пока такой лист открыт, он — настоящее модальное окно
 * (этап 13, решение 117; UI-05): небо, карточка, полоса времени и верхняя строка под ним недоступны клавиатуре и диктору
 * (inert; I2, MOB-32), Tab ходит по кругу внутри листа (Sheet.tsx), «×» и Escape закрывают его, и фокус возвращается
 * к инициатору («Меню»). «Эпохи» — лист на 55 % под ярусами, «Вид» — лист внутри неба: небо над ними видно и отвечает,
 * они не модальны.
 */
export const modalOnPhone = (p: Panel) => p !== null && p !== 'epochs' && p !== 'view';

/**
 * Лист панели убран на время выбора второго лица на небе (MOB-47): на телефоне «выбрать второе на небе» в «Родстве»
 * закрывал бы небо собственным листом. Пока идёт выбор, лист панели скрыт (Sheet, hidden), небо, карточка на шапке
 * и полоса доступны, у кромки неба — строка выбора с «отменить». Выбрали лицо (pickSecond снова открывает панель
 * режима) или отменили — лист возвращается, уже с ответом. Только панель того же режима: другая панель, открытая во
 * время выбора, видна как обычно.
 */
export function parkedFor(phone: boolean, p: Panel, mode: 'kinship' | 'spread' | null): boolean {
  return phone && mode !== null && p === mode && modalOnPhone(p);
}
export const parked = computed(() => parkedFor(grid.value.phone, panel.value, pickMode.value));
/** Что закрывает полноэкранный лист панели на телефоне: всё, кроме самого листа (решение 117). */
const UNDER_SHEET = '.app > .top, .app > main > .sky, .app > .folio, .app > .strip';
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

/**
 * Переход по оглавлению справки: раздел — в начало листа, фокус — на его заголовок (этап 19, аудит Д-03): клавиатура и
 * диктор продолжают с раздела, а не из оглавления.
 */
export function goToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  focusQuietly(el);
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
  // карточка лица, которое только что выбрано, может появиться на кадр-другой позже (подгрузка тела карточки): ждать её
  // не дольше полусекунды и только пока выбрано это лицо
  let frames = 0;
  const attempt = () => {
    if (selected.peek() !== id) return;
    const t = cardTitle(id);
    if (t) focusQuietly(t);
    else if (++frames < TITLE_WAIT_FRAMES) requestAnimationFrame(attempt);
  };
  later(attempt);
}
/** Сколько кадров ждать заголовка карточки (≈ 0,5 с). */
const TITLE_WAIT_FRAMES = 30;

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
  // модальный лист телефона: inert снимается раньше, чем фокус возвращается на место под листом; убранный на время
  // выбора лист (parked) небо не закрывает
  const modalNow = () => grid.peek().phone && modalOnPhone(panel.peek()) && !parked.peek();
  const offModal = effect(() => {
    const on = grid.value.phone && modalOnPhone(panel.value) && !parked.value;
    void selected.value;
    setModal(on);
    // корень карточки мог перерисоваться вместе с выбором — ещё раз после отрисовки
    later(() => setModal(modalNow()));
  });
  // лист убран на время выбора (MOB-47): фокус — на небо, где выбирают (стрелки и Enter; строка выбора объявляется
  // сама, role="status"); лист вернулся — фокус на ответ панели, иначе на её заголовок
  let wasParked = parked.peek();
  const offParked = effect(() => {
    const on = parked.value;
    if (on === wasParked) return;
    wasParked = on;
    later(() => {
      if (on) {
        if (!current() || current()!.closest('[hidden]')) skyCanvas()?.focus({ preventScroll: true });
        return;
      }
      const root = panelRoot();
      if (!root || root.hidden) return;
      focusQuietly(root.querySelector<HTMLElement>('.relation .sent') ?? root.querySelector<HTMLElement>('h2'));
    });
  });
  // вступительная табличка (UX-76): «Условные знаки» начинаются с того же «Как читать карту» — открылись, табличка
  // сворачивается, текст не стоит дважды; открыли табличку — фокус на её заголовок; свернули с фокусом в ней — на
  // команду «Как читать карту» в углу неба
  const offLegend = effect(() => {
    if (panel.value === 'legend' && introOpen.peek()) foldIntro();
  });
  let introShown = introOpen.peek();
  const offIntro = effect(() => {
    const open = introOpen.value;
    if (open === introShown) return;
    introShown = open;
    const wasInside = !!document.activeElement?.closest('.cartouche');
    const sel = selected.peek();
    later(() => {
      const to = introFocusTarget({ open, wasInside, selChanged: selected.peek() !== sel || panel.peek() === 'legend' });
      if (to === 'title') focusQuietly(document.querySelector<HTMLElement>('.cartouche h1, .cartouche .ttl'));
      else if (to === 'command' && !current()) document.querySelector<HTMLElement>('.guide-cmd')?.focus({ preventScroll: true });
    });
  });
  return () => {
    offPanel();
    offSel();
    offModal();
    offParked();
    offLegend();
    offIntro();
    setModal(false);
  };
}
