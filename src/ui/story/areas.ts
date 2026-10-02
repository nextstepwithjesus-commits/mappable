/**
 * Области раскрываются постепенно (этап 16, решение 185): фокус созвездия.
 *
 *  — Щелчок по названию созвездия, по его свету (туманность, устье) или команда рассказа — перелёт «вписать» всех его
 *    лиц (с вложенными созвездиями: «Колено Левиино» вместе со «Священниками, сынами Аароновыми»). Созвездие раскрыто
 *    целиком, остальное небо остаётся светом — это рисует свет (src/render/light.ts), читая groupFocus.
 *  — Строка показа: «В фокусе: Колено Иудино — вернуть» (src/ui/sky/ShowBar.tsx); Esc и «вернуть» возвращают окно до
 *    фокуса. Фокус — своя запись истории, поле адреса «~z<id созвездия>» (src/ui/address.ts).
 *  — Свой порог раскрытия по плотности (просторные созвездия раскрываются раньше) — у неба (src/render/labels.ts, sky.ts).
 */
import { byId, groupById, groups, persons } from '../../data/atlas.ts';
import { skyRef } from '../common.tsx';
import { HISTORY_MS, moveTo, reduced, viewForIds } from '../sky/view.ts';
import { groupFocus } from './state.ts';

export { groupFocus } from './state.ts';

/** Откуда пришёл фокус: название, свет (туманность), устье колена, рассказ, адрес. */
export type FocusFrom = 'name' | 'light' | 'mouth' | 'story' | 'address';

/** Созвездие и все вложенные в него (поле parent в data/groups.json). */
export function groupTree(gid: string): Set<string> {
  const out = new Set<string>([gid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of groups) if (g.parent && out.has(g.parent) && !out.has(g.id)) {
      out.add(g.id);
      grew = true;
    }
  }
  return out;
}

/** Лица созвездия с вложенными — те, что стоят на небе (узел раскладки нынешней модели). */
export function groupMembers(gid: string): string[] {
  const tree = groupTree(gid);
  const s = skyRef.current;
  return persons.filter((p) => tree.has(p.group) && (!s || s.node(p.id))).map((p) => p.id);
}

/** Имя созвездия для строки показа и диктора: «Колено Иудино». */
export const groupName = (gid: string): string => groupById.get(gid)?.name ?? gid;

/** Окно до фокуса: «вернуть» и Esc возвращают его. */
let before: { x0: number; kx: number; laneTop: number; lanes: number } | null = null;

/**
 * Фокус созвездия gid: перелёт «вписать» его лиц (кроме from = 'address' — окно ставит запись истории). false —
 * созвездия нет или на небе нет его лиц.
 */
export function focusGroup(gid: string, from: FocusFrom = 'name'): boolean {
  if (!groupById.has(gid)) return false;
  const ids = groupMembers(gid);
  if (!ids.length || !ids.some((id) => byId.has(id))) return false;
  const s = skyRef.current;
  if (from !== 'address' && s && groupFocus.peek() === null) before = { x0: s.cam.x0, kx: s.cam.kx, laneTop: s.cam.laneTop, lanes: s.cam.lanes };
  groupFocus.value = gid;
  if (from === 'address' || !s) return true;
  const g = viewForIds(ids);
  if (g) moveTo(g, 'flight');
  return true;
}

/**
 * Снять фокус (Esc, «вернуть»): back — вернуть окно до фокуса переходом истории (решение 46). Был ли фокус.
 */
export function clearGroupFocus(back = true): boolean {
  if (groupFocus.peek() === null) return false;
  groupFocus.value = null;
  const s = skyRef.current;
  const b = before;
  before = null;
  if (back && b && s && s.model) {
    if (Math.abs(b.lanes / s.cam.lanes - 1) > 1e-9 && s.cam.userLanes === null) s.cam.userLanes = s.cam.lanes;
    s.cam.zoomTo(s.cam.constrain({ x0: b.x0, kx: b.kx, laneTop: b.laneTop }, b.lanes), HISTORY_MS, skyRef.redraw, reduced(), b.lanes);
    skyRef.redraw();
  }
  return true;
}

/** Фокус из адреса (поле «~z»): id или null — снять без перехода (окно ставит запись). */
export function groupFocusFromAddress(gid: string | null) {
  if (gid === groupFocus.peek()) return;
  if (gid === null) clearGroupFocus(false);
  else focusGroup(gid, 'address');
}
