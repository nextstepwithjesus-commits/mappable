/**
 * Нижний лист карточки на телефоне (H2; ТЗ § 3.8; MOB-11, MOB-12, MOB-15, MOB-21; решение владельца 12).
 *
 * Три положения: карточка у звезды 214 px (peek; этап 11), 55 % (half) и весь экран между верхней строкой и полосой
 * времени (full).
 *  — касание звезды открывает лист на шапке: небо остаётся видным, карточка — одно движение; поиск, ссылки и вход из
 *    вступления — на 55 %: небо над листом показывает лицо, под ним — начало карточки;
 *  — на низком экране (альбомная ориентация, масштаб 200 %: высота ≤ 520 px) лист всегда открывается на шапке (H6; MOB-43);
 *  — протяжка за шапку листа (и за его текст, когда он прокручен к началу) ставит лист в ближайшее положение с учётом
 *    скорости; взмах вниз ниже шапки закрывает лист;
 *  — выбор второго лица («Родство с…», «Разворот с…») сворачивает лист до шапки, чтобы небо было видно; отмена выбора или
 *    закрытие панели, которую выбор открыл, возвращает прежнее положение.
 * Положение на компьютере и планшете ничего не значит: там карточка — колонка сетки (src/ui/layout.ts).
 */
import { effect, signal } from '@preact/signals';
import { panel, pickMode, selected } from '../state.ts';
import { grid } from './layout.ts';

/**
 * Запись истории (контракт 3, src/ui/address.ts): поля применяемой записи и запись положения листа. Адрес подключается
 * после загрузки модулей (динамический импорт): лист импортируют рано (ввод неба, карточка у звезды), а адрес тянет за
 * собой всё небо — статический импорт менял бы порядок их инициализации.
 */
type HistoryApi = Pick<typeof import('./address.ts'), 'historyApplying' | 'historyFields' | 'patchHistory'>;
let hist: HistoryApi | null = null;

/**
 * Положения листа: head — шапка 104 px (ТЗ § 3.8; решение 169: взмах вниз оставляет выбор на шапке, снимает его только «×»),
 * peek — краткая карточка (решение 155), half — 55 %, full — 100 %.
 */
export type SheetStop = 'head' | 'peek' | 'half' | 'full';

/** Высота шапки листа (ТЗ § 3.8): имя, годы и «×»; небо над ней — почти целиком. */
export const HEAD_H = 104;

/**
 * Высота листа на первом положении: 214 px — карточка у звезды с «Родством» (этап 11, решение 77; STAGE11.md § 6). Было
 * 104 px — шапка с именем и годами (ТЗ § 3.8; решение 12): второй карточки над небом больше нет, лист и есть карточка.
 */
export const PEEK_H = 214;
/** Доля второго положения — от места между верхней строкой и полосой времени. */
export const HALF_SHARE = 0.55;

/** Положение листа сейчас. */
export const sheetStop = signal<SheetStop>('half');

/** Низкий экран: лист открывается на шапке (H6). */
export const lowScreen = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-height: 520px)').matches;

let requested: { stop: SheetStop; at: number } | null = null;

/**
 * Следующий выбор лица откроет лист в этом положении. Зовёт ввод неба перед выбором звезды касанием;
 * просьба живёт 1 с: если выбор не случился (коснулись уже выбранной звезды), она не достаётся следующему поиску.
 */
export function openSheetAt(stop: SheetStop) {
  requested = { stop, at: Date.now() };
}

/** Положение для нового выбора: просьба ввода, иначе 55 % (на низком экране — шапка). */
export function stopForNewSelection(
  req: { stop: SheetStop; at: number } | null,
  now: number,
  low: boolean,
  o: { history?: string | null; keep?: SheetStop | null } = {},
): SheetStop {
  // «назад» и «вперёд» (решение 150): положение листа своей записи истории
  if (o.history && isStop(o.history)) return o.history;
  // выбор изнутри листа (имя в «Родстве», ссылка в карточке): лист остаётся, где был (решение 150; M3)
  if (o.keep) return o.keep;
  if (low) return 'peek';
  if (req && now - req.at < 1000) return req.stop;
  return 'half';
}

/** Строка — положение листа. */
export const isStop = (x: unknown): x is SheetStop => x === 'head' || x === 'peek' || x === 'half' || x === 'full';

/** Действие пришло из самого листа карточки: щелчок, касание или клавиша внутри .app > .folio. */
function fromSheet(): boolean {
  const e = typeof window !== 'undefined' ? window.event : undefined;
  const t = e?.target;
  return typeof Element !== 'undefined' && t instanceof Element && !!t.closest('.app > .folio');
}

export interface Stops {
  head: number;
  peek: number;
  half: number;
  full: number;
}

/**
 * Низкий экран (альбомная ориентация, масштаб 200 %): над листом-карточкой остаётся не меньше стольких px неба —
 * органы неба (колонка 2 × 2) и звезда видны над листом (H6; MOB-26); лист на первом положении — краткая карточка.
 */
export const LOW_SKY = 150;
/** Самая низкая шапка листа: имя и годы (ТЗ § 3.8). */
export const PEEK_MIN = 104;
/** Под данными неба над листом — не меньше стольких px (решение 155; M8): ниже рамки (линейка и строка эпох). */
export const SKY_DATA_MIN = 140;

/**
 * Высота краткой карточки в листе (решение 155; M8), измеренная самим листом (Folio.tsx, DotSheetBar): шапка листа
 * равна ей, а не постоянным 214 px — на масштабе 200 % под командами не остаётся пустых 75 px. null — ещё не измерена.
 */
export const peekContent = signal<number | null>(null);

/**
 * Высота первого положения при месте avail.
 *  — Карточка измерена (content): ровно её высота, но не ниже PEEK_MIN и так, чтобы над листом под рамкой неба (frame —
 *    её высота, px) осталось SKY_DATA_MIN px данных (решение 155).
 *  — Не измерена: 214 px, на низком экране — не выше avail − LOW_SKY (но не ниже 104), как прежде (H6).
 */
export function peekFor(avail: number, low = lowScreen(), content: number | null = null, frame = 0): number {
  if (content === null || !(content > 0)) return low ? Math.min(PEEK_H, Math.max(PEEK_MIN, Math.round(avail) - LOW_SKY)) : PEEK_H;
  return Math.max(PEEK_MIN, Math.min(Math.round(content), Math.round(avail) - frame - SKY_DATA_MIN));
}

/** Высоты положений (px) по месту для листа: между верхней строкой и полосой времени; 55 % — не ниже первого положения. */
export function stopsFor(avail: number, low = lowScreen(), content: number | null = null, frame = 0): Stops {
  const full = Math.max(PEEK_H, Math.round(avail));
  const peek = Math.min(peekFor(avail, low, content, frame), full);
  return { head: Math.min(HEAD_H, peek), peek, half: Math.max(PEEK_H, peek, Math.round(full * HALF_SHARE)), full };
}

/** Сколько миллисекунд инерции прибавить к протяжке: взмах перебрасывает лист через ближайшее положение. */
const PROJECT_MS = 220;
/** Скорость взмаха вниз, px/мс, которая опускает лист из краткой карточки на шапку. */
const CLOSE_V = 0.5;

/**
 * Куда встать листу после протяжки (MOB-12): h — высота листа при отпускании, v — скорость роста высоты, px/мс
 * (больше нуля — лист тянут вверх), from — положение до протяжки.
 * Ближайшее к «брошенной» высоте h + v·220 мс положение; лист опустили ниже половины краткой карточки или взмахнули вниз,
 * начав от неё или протянув ниже, — шапка 104 px: выбор остаётся, снимает его только «×» (решение 169; прежде — закрытие).
 */
export function snapSheet(h: number, v: number, s: Stops, from: SheetStop): SheetStop {
  if (h < s.peek * 0.5) return 'head';
  if (v < -CLOSE_V && (from === 'peek' || from === 'head' || h < s.peek)) return 'head';
  const at = h + Math.max(-600, Math.min(600, v * PROJECT_MS));
  // на шапку — только от краткой карточки или ниже неё: взмах с 55 % лишь сворачивает до краткой карточки
  const order: SheetStop[] = from === 'peek' || from === 'head' || h < s.peek ? ['head', 'peek', 'half', 'full'] : ['peek', 'half', 'full'];
  let best: SheetStop = 'peek';
  for (const k of order) if (Math.abs(s[k] - at) < Math.abs(s[best] - at)) best = k;
  return best;
}

/**
 * Скорость по последним точкам протяжки (px/мс, больше нуля — вверх): по точкам за последние 100 мс до последней.
 * points — { t, y }: время события (Event.timeStamp) и экранный y, растущий вниз; release — время отпускания:
 * если палец постоял дольше 100 мс, взмаха не было.
 */
export function releaseVelocity(points: { t: number; y: number }[], release = Infinity): number {
  if (points.length < 2) return 0;
  const last = points[points.length - 1];
  if (release !== Infinity && release - last.t > 100) return 0;
  let first = points[points.length - 2];
  for (let i = points.length - 2; i >= 0; i--) {
    if (last.t - points[i].t > 100) break;
    first = points[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? -(last.y - first.y) / dt : 0;
}

if (typeof window !== 'undefined') {
  // новый выбор — положение по тому, как лицо выбрано (решение 12); пока лица нет, положение не меняется
  let shown = selected.peek();
  effect(() => {
    const id = selected.value;
    if (id && id !== shown) {
      const h = hist?.historyApplying.peek() ?? null;
      // выбор изнутри открытого листа (шаг по родству) — лист на прежнем положении (решение 150; M3)
      const keep = shown && fromSheet() ? sheetStop.peek() : null;
      sheetStop.value = stopForNewSelection(requested, Date.now(), lowScreen(), { history: h?.sheet ?? null, keep });
      requested = null;
    }
    shown = id;
  });
  void import('./address.ts').then((a) => {
    hist = a;
    // запись истории «назад» или «вперёд» того же лица — положение листа своей записи (решение 150)
    effect(() => {
      const h = a.historyApplying.value;
      if (!h?.sheet || !isStop(h.sheet) || !selected.peek() || sheetStop.peek() === h.sheet) return;
      sheetStop.value = h.sheet;
    });
    // положение листа — поле записи истории (контракт 3; решение 150): пишется в каждую запись и дописывается в текущую,
    // когда лист встаёт в новое положение. На компьютере листа нет — поля нет
    a.historyFields(() => (grid.peek().phone && selected.peek() ? { sheet: sheetStop.peek() } : {}));
    let stopSeen = sheetStop.peek();
    effect(() => {
      const st = sheetStop.value;
      if (st === stopSeen) return;
      stopSeen = st;
      if (grid.peek().phone) queueMicrotask(a.patchHistory);
    });
  });
  // выбор второго лица: лист — на шапке; отмена возвращает прежнее положение, панель выбора — после её закрытия
  let before: SheetStop | null = null;
  let pickFor: string | null = null;
  let afterPanel: SheetStop | null = null;
  effect(() => {
    const mode = pickMode.value;
    if (mode) {
      if (before === null) {
        before = sheetStop.peek();
        pickFor = selected.peek();
      }
      sheetStop.value = 'peek';
      return;
    }
    if (before === null) return;
    // выбор сменил само лицо — у нового листа своё положение
    if (selected.peek() === pickFor) {
      if (panel.peek()) afterPanel = before;
      else sheetStop.value = before;
    }
    before = null;
    pickFor = null;
  });
  effect(() => {
    if (panel.value || afterPanel === null) return;
    if (selected.peek()) sheetStop.value = afterPanel;
    afterPanel = null;
  });
}
