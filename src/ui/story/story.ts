/**
 * Карта как рассказ (этап 16, решение 187): шестое начало «Рассказ: от Адама до Иисуса Христа» — восемь шагов по эпохам.
 *
 *  — Шаг выбирает своё опорное лицо (цвет ветвей — решения 69 и 183) и ведёт небо к своему кадру: «Дальше» — перелёт
 *    ван Вейка — Нёйса, «Назад» — переход как у истории (решение 46), адрес и «назад» браузера — окно записи. Каждый шаг —
 *    одна запись истории, поле адреса «~r<номер шага с единицы>» (src/ui/address.ts).
 *  — Движение — только в ответ на действие (ТЗ § 5.5): рассказ сам не листается.
 *  — Свободное небо: сдвиг и масштаб рассказ не закрывают; камера ушла от кадра — «Вернуть кадр шага». «Выйти на небо»
 *    (и Esc) закрывает рассказ: окно и выбранное лицо остаются, в колонке — его карточка.
 *  — Широкий экран: колонка справа на месте карточки (src/ui/Folio.tsx); телефон — нижний лист той же колонки.
 *
 * Состояние — src/ui/story/state.ts (без зависимостей от неба), отрисовка — src/ui/story/StoryColumn.tsx.
 */
import { batch, effect, signal } from '@preact/signals';
import { pickMode, selected, model, panel } from '../../state.ts';
import { skyRef, viewTick } from '../common.tsx';
import { moveTo, viewForFrame, type GroupView } from '../sky/view.ts';
import { setShow, show } from '../show.ts';
import { toAstro } from '../../engine/years.ts';
import { epochSpanText } from '../../engine/years.ts';
import { STORY_STEPS, groupFocus, stepAt, storyCard, storyMoved, storyStep, type StoryStep } from './state.ts';

export { STORY_STEPS, STORY_TITLE, storyStep, storyShown, storyCard, storyMoved, type StoryStep } from './state.ts';

/** Сказанное диктору о шаге (живая область колонки рассказа): «Шаг 3 из 8. Двенадцать колен. Патриархи, …». */
export const storySaid = signal('');

/** Эпоха шага в нынешней модели (годы границ зависят от модели, решение 21). */
export const stepEpoch = (st: StoryStep) => model.value.epochs.find((e) => e.id === st.epoch) ?? null;

/** Строка эпохи шага: «Патриархи, 2166–1876 гг. до Р. Х.» (годы — расчёт по модели). */
export function stepSub(st: StoryStep): string {
  const e = stepEpoch(st);
  if (!e) return '';
  const span = epochSpanText(e);
  return st.title === e.name ? span : `${e.name}, ${span}`;
}

/** Объявление шага диктору. */
export function stepAnnounce(i: number): string {
  const st = STORY_STEPS[i];
  if (!st) return '';
  return `Шаг ${i + 1} из ${STORY_STEPS.length}. ${st.title}. ${stepSub(st)}`;
}

// ---------- камера шага ----------

/** Камера, к которой привёл шаг (после перелёта): ушла от неё — «Вернуть кадр шага». */
let target: { x0: number; kx: number; laneTop: number } | null = null;
let watching = false;
/** Следить за камерой (подписка — при первом шаге: common.tsx и view.ts импортируют друг друга, как у watchEmpty). */
function watchMoves() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  effect(() => {
    void viewTick.value;
    const c = skyRef.current?.cam;
    if (!c || !target || storyStep.peek() === null || c.moving || storyMoved.peek()) return;
    const W = Math.max(1, c.vp.r - c.vp.l);
    // сдвиг больше 2 % ширины, масштаб больше чем на 2 %, полосы больше чем на 12 px — кадр уже не тот
    const dx = Math.abs((c.x0 - target.x0) * c.kx) / W;
    const dk = Math.abs(c.kx / target.kx - 1);
    const dl = Math.abs((c.laneTop - target.laneTop) * c.ky);
    if (dx > 0.02 || dk > 0.02 || dl > 12) storyMoved.value = true;
  });
}

/** Небо готово принять кадр: модель, сетка (колонка рассказа появилась) и показ устоялись. */
function whenSkyReady(then: () => void, n = 0) {
  if (typeof window === 'undefined') return;
  const s = skyRef.current;
  if ((!s || !s.model || s.transitioning) && n < 180) {
    requestAnimationFrame(() => whenSkyReady(then, n + 1));
    return;
  }
  // два кадра: колонка и лист меняют ширину и высоту неба
  requestAnimationFrame(() => requestAnimationFrame(then));
}

/** Кадр шага: окно лет и строки лиц кадра. */
export function stepView(st: StoryStep): GroupView | null {
  return viewForFrame(st.frame.persons, toAstro(st.frame.years[0]), toAstro(st.frame.years[1]));
}

/** Поставить небо к кадру шага: how — перелёт («Дальше»), переход истории («Назад»), сразу. */
function frame(i: number, how: 'flight' | 'back' | 'jump') {
  whenSkyReady(() => {
    if (storyStep.peek() !== i) return;
    const st = STORY_STEPS[i];
    const g = st ? stepView(st) : null;
    if (!g) return;
    moveTo(g, how);
    // кадр шага — то, куда пришла камера (в пределах камеры)
    const after = () => {
      const c = skyRef.current?.cam;
      if (!c) return;
      if (c.moving) {
        requestAnimationFrame(after);
        return;
      }
      target = { x0: c.x0, kx: c.kx, laneTop: c.laneTop };
      storyMoved.value = false;
    };
    requestAnimationFrame(after);
  });
}

// ---------- шаги ----------

/**
 * Перейти к шагу i: выбрать опорное лицо, снять фокус созвездия и выбор второго лица; камера — how ('none' — окно
 * ставит адрес записи истории).
 */
export function goStep(i: number, how: 'flight' | 'back' | 'jump' | 'none' = 'flight'): boolean {
  const st = stepAt(i);
  if (!st) return false;
  const idx = STORY_STEPS.indexOf(st);
  watchMoves();
  target = null;
  batch(() => {
    storyStep.value = idx;
    storyCard.value = false;
    storyMoved.value = false;
    if (groupFocus.peek()) groupFocus.value = null;
    if (pickMode.peek()) pickMode.value = null;
    // телефон: лист рассказа остаётся в своём положении (выбор изнутри листа, src/ui/sheet.ts), при первом шаге — 55 %
    if (selected.peek() !== st.focus) selected.value = st.focus;
  });
  storySaid.value = stepAnnounce(idx);
  if (how !== 'none') frame(idx, how);
  return true;
}

/** Открыть рассказ на шаге i (начало «Рассказ», адрес «~r»): всё небо — кадры шагов рассчитаны на него. */
export function openStory(i = 0): boolean {
  if (!STORY_STEPS.length) return false;
  batch(() => {
    if (show.peek().kind !== 'all') setShow({ kind: 'all' }, { anchor: STORY_STEPS[Math.max(0, Math.min(STORY_STEPS.length - 1, i))].focus });
    // лист «Вид» (начало выбрали в нём) уступает место
    if (panel.peek() === 'view') panel.value = null;
  });
  return goStep(i, 'flight');
}

/** «Дальше» (PageDown): следующий шаг перелётом. */
export function nextStep(): boolean {
  const i = storyStep.peek();
  if (i === null || i >= STORY_STEPS.length - 1) return false;
  return goStep(i + 1, 'flight');
}

/** «Назад» (PageUp): предыдущий шаг — переходом, как «назад» истории (решение 46). */
export function prevStep(): boolean {
  const i = storyStep.peek();
  if (i === null || i <= 0) return false;
  return goStep(i - 1, 'back');
}

/** «Вернуть кадр шага»: опорное лицо и окно шага — перелётом. */
export function returnToStep(): boolean {
  const i = storyStep.peek();
  if (i === null) return false;
  return goStep(i, 'flight');
}

/** «Выйти на небо» (Esc): рассказ закрыт, окно и выбранное лицо остаются — в колонке его карточка. */
export function closeStory(): boolean {
  if (storyStep.peek() === null) return false;
  batch(() => {
    storyStep.value = null;
    storyCard.value = false;
    storyMoved.value = false;
  });
  target = null;
  storySaid.value = '';
  return true;
}

/** «Карточка»: в колонке — карточка выбранного лица; рассказ остаётся открытым (строка показа ведёт обратно). */
export function openStoryCard(): boolean {
  if (storyStep.peek() === null || !selected.peek()) return false;
  storyCard.value = true;
  return true;
}

/** «К рассказу» (строка показа): в колонке снова рассказ. */
export function backToStory(): boolean {
  if (storyStep.peek() === null || !storyCard.peek()) return false;
  storyCard.value = false;
  return true;
}

/**
 * Рассказ из адреса (поле «~r», запись истории): шаг n (с нуля) — без перелёта, окно ставит адрес; frameIt — в адресе
 * окна нет (ссылка «#/iakov~r3»): небо сразу к кадру шага. null — рассказа в записи нет: закрыть.
 */
export function storyFromAddress(n: number | null, frameIt = false) {
  if (n === null) {
    if (storyStep.peek() !== null) closeStory();
    return;
  }
  const st = stepAt(n);
  if (!st) return;
  const idx = STORY_STEPS.indexOf(st);
  // адрес без окна (ссылка на шаг): небо — к кадру шага сразу
  if (frameIt) {
    goStep(idx, 'jump');
    return;
  }
  if (storyStep.peek() === idx) return;
  watchMoves();
  target = null;
  batch(() => {
    storyStep.value = idx;
    storyMoved.value = false;
  });
  storySaid.value = stepAnnounce(idx);
  // кадр записи: камера, к которой придёт окно адреса, — точка отсчёта «Вернуть кадр шага»
  whenSkyReady(() => {
    const settle = () => {
      const c = skyRef.current?.cam;
      if (!c) return;
      if (c.moving) {
        requestAnimationFrame(settle);
        return;
      }
      if (storyStep.peek() === idx) target = { x0: c.x0, kx: c.kx, laneTop: c.laneTop };
    };
    settle();
  });
}
