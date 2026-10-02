/**
 * Рассказ и области (этап 16, решения 185, 187): состояние без зависимостей от неба и отрисовки — его читают сетка
 * (src/ui/layout.ts), колонка карточки (src/ui/Folio.tsx), адрес, клавиши и небо (свет L — созвездие в фокусе).
 * Действия — src/ui/story/story.ts (рассказ) и src/ui/story/areas.ts (фокус созвездия).
 *
 * Шаги рассказа — data/story.json: эпоха, опорное лицо, кадр (лица и годы окна), один-два стиха, строки из графа. Текст
 * шага собирается только из данных (решение 187): описание эпохи, стихи Синодального перевода, строки графа; проверка —
 * tools/validate.ts (приёмка О6).
 */
import { computed, signal } from '@preact/signals';
import raw from '../../../data/story.json';
import { byId } from '../../data/atlas.ts';

/** Строки шага из графа: ветви опорного лица по союзам (решение 69), ленты Мессии у опорного лица. */
export type StoryFact = 'branches' | 'lines';

export interface StoryStep {
  id: string;
  /** имя шага в ряду шагов: «Патриархи», «Колена» */
  short: string;
  /** заглавие шага: имя эпохи или слова Писания («Двенадцать колен», Быт 49:28) */
  title: string;
  /** эпоха (data/epochs.json): её описание и годы в модели */
  epoch: string;
  /** опорное лицо: выбирается на небе — цвет ветвей по решениям 69 и 183 */
  focus: string;
  /** кадр: лица, которые вписываются по высоте, и годы окна (исторические, −1010 = 1010 г. до Р. Х.) */
  frame: { persons: string[]; years: [number, number] };
  /** один-два стиха шага */
  refs: string[];
  facts: StoryFact[];
}

interface StoryFile {
  title: string;
  steps: StoryStep[];
}

const file = raw as unknown as StoryFile;

/** Заглавие рассказа — шестое начало (решение 187): «Рассказ: от Адама до Иисуса Христа». */
export const STORY_TITLE: string = file.title;

/** Шаги рассказа по порядку; шаг без опорного лица в данных атласа не показывается. */
export const STORY_STEPS: readonly StoryStep[] = file.steps.filter((s) => byId.has(s.focus));

/** Номер шага рассказа (с нуля); null — рассказ закрыт. */
export const storyStep = signal<number | null>(null);

/**
 * Рассказ открыт, а в колонке — карточка (команда «Карточка» рассказа): рассказ продолжается, строка показа ведёт
 * обратно («Рассказ, шаг 3 из 8 — к рассказу»).
 */
export const storyCard = signal(false);

/** В колонке карточки — рассказ (на телефоне — нижний лист рассказа). */
export const storyShown = computed(() => storyStep.value !== null && !storyCard.value);

/** Камеру увели от кадра шага (сдвиг, масштаб): у рассказа появляется «Вернуть кадр шага». */
export const storyMoved = signal(false);

/**
 * Созвездие в фокусе (решение 185): щелчок по названию, туманности или устью — перелёт «вписать», созвездие раскрыто
 * целиком, остальное небо остаётся светом. Строка показа: «В фокусе: Колено Иудино — вернуть»; Esc возвращает.
 */
export const groupFocus = signal<string | null>(null);

/** Шаг рассказа по номеру (с нуля), в пределах; null — нет шагов. */
export const stepAt = (i: number): StoryStep | null => (STORY_STEPS.length ? STORY_STEPS[Math.max(0, Math.min(STORY_STEPS.length - 1, Math.round(i)))] : null);
