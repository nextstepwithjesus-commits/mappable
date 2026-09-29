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

export type SheetStop = 'peek' | 'half' | 'full';

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
export function stopForNewSelection(req: { stop: SheetStop; at: number } | null, now: number, low: boolean): SheetStop {
  if (low) return 'peek';
  if (req && now - req.at < 1000) return req.stop;
  return 'half';
}

export interface Stops {
  peek: number;
  half: number;
  full: number;
}

/** Высоты положений (px) по месту для листа: между верхней строкой и полосой времени. */
export function stopsFor(avail: number): Stops {
  const full = Math.max(PEEK_H, Math.round(avail));
  return { peek: Math.min(PEEK_H, full), half: Math.max(PEEK_H, Math.round(full * HALF_SHARE)), full };
}

/** Сколько миллисекунд инерции прибавить к протяжке: взмах перебрасывает лист через ближайшее положение. */
const PROJECT_MS = 220;
/** Скорость взмаха вниз, px/мс, которая закрывает лист из шапки. */
const CLOSE_V = 0.5;

/**
 * Куда встать листу после протяжки (MOB-12): h — высота листа при отпускании, v — скорость роста высоты, px/мс
 * (больше нуля — лист тянут вверх), from — положение до протяжки.
 * Ближайшее к «брошенной» высоте h + v·220 мс положение; лист опустили ниже половины шапки или взмахнули вниз,
 * начав от шапки или протянув ниже неё, — 'close'.
 */
export function snapSheet(h: number, v: number, s: Stops, from: SheetStop): SheetStop | 'close' {
  if (h < s.peek * 0.5) return 'close';
  if (v < -CLOSE_V && (from === 'peek' || h < s.peek)) return 'close';
  const at = h + Math.max(-600, Math.min(600, v * PROJECT_MS));
  const order: SheetStop[] = ['peek', 'half', 'full'];
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
      sheetStop.value = stopForNewSelection(requested, Date.now(), lowScreen());
      requested = null;
    }
    shown = id;
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
