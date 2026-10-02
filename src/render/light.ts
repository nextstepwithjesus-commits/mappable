/**
 * Слой света неба (этап 16, решения 182, 183): туманности из неразрешённых следов, устья колен, звёздная пыль, огоньки.
 *
 * Здесь же — цвет ветвей опорного лица (решение 183): общий для неба, врезки семьи (F), колонки рассказа (S),
 * карточки у звезды и легенды.
 *  — tribeHue(id, theme) — оттенок света лица: колено по матери родоначальника; null — нейтральный (народы, серебро);
 *  — branchOrTribeColor(ref, keys, branch, theme) — цвет ветви branch опорного лица ref: у Иакова и четырёх матерей —
 *    оттенок колена этой ветви («без перескока»), у прочих — цвет ветви решения 69 (branchColor);
 *  — branchHue(selectedId, i, theme) — то же по выбранному лицу (без выбора — Иаков): ключи ветвей считаются здесь.
 */
import { graph } from '../data/atlas.ts';
import { ANCESTRESS, refPerson, tribeKey, tribeRef, type TribeKey } from '../engine/affiliation.ts';
import { branchesOf } from '../engine/unions.ts';
import { unions } from '../ui/reveal.ts';
import { branchColor, TRIBE_HUES, type MapTheme, type TribeHueKey } from './branches.ts';

const isHue = (k: TribeKey | null | undefined): k is TribeHueKey => k === 'leah' || k === 'rachel' || k === 'bilhah' || k === 'zilpah';

/** Оттенок света лица id (#rrggbb): колено по матери родоначальника; null — нейтральный свет (народы, серебро). */
export function tribeHue(id: string, theme: MapTheme): string | null {
  const k = tribeKey(id);
  return isHue(k) ? TRIBE_HUES[theme][k] : null;
}

/** Ключ колена ветви key (id союза «u:отец+мать» или id ребёнка) у опорного лица. */
function branchTribe(key: string | undefined): TribeKey | null {
  if (!key) return null;
  const u = unions.byId.get(key);
  if (u) {
    if (u.b && ANCESTRESS[u.b]) return ANCESTRESS[u.b];
    // союз без одной из четырёх матерей — по старшему ребёнку
    return u.kids.length ? tribeKey(u.kids[0]) : null;
  }
  return tribeKey(key);
}

/**
 * Цвет ветви branch опорного лица ref (#rrggbb; решения 69, 183). keys — ключи ветвей ref по порядку (BranchMap.keys,
 * src/render/marks.ts): id союза, если союзов с детьми два и больше, иначе id ребёнка. Опорное лицо — Иаков или одна
 * из четырёх матерей: оттенок колена ветви (сыны Лии, Рахили, Валлы, Зелфы), чтобы цвет не перескакивал между небом
 * без выбора и выбором Иакова. Иначе — цвет ветви по кругу (branchColor).
 */
export function branchOrTribeColor(ref: string | null | undefined, keys: readonly string[], branch: number, theme: MapTheme): string {
  if (ref && tribeRef(ref)) {
    const k = ANCESTRESS[ref] ?? branchTribe(keys[branch]);
    if (isHue(k)) return TRIBE_HUES[theme][k];
  }
  return branchColor(branch, theme);
}

const keyCache = new Map<string, string[]>();
/** Ключи ветвей лица (как BranchMap.keys): союзы с детьми, если их два и больше, иначе дети. */
export function branchKeysOf(id: string): string[] {
  let k = keyCache.get(id);
  if (!k) {
    k = branchesOf(unions, graph, id, 1).keys;
    if (keyCache.size > 64) keyCache.clear();
    keyCache.set(id, k);
  }
  return k;
}

/** Цвет ветви i выбранного лица (без выбора — Иакова), «без перескока» (решение 183): для колонки рассказа и врезки. */
export function branchHue(selectedId: string | null | undefined, i: number, theme: MapTheme): string {
  const ref = refPerson(selectedId);
  return branchOrTribeColor(ref, branchKeysOf(ref), i, theme);
}
