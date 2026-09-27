/**
 * Правила CSS только для образца #/specimen (B7; VIS-38). Они выводятся из действующих таблиц стилей при открытии образца,
 * поэтому у образца нет своих копий объявлений:
 * — состояния органов управления без указателя и фокуса: у правила с :hover, :active, :focus-visible или :focus
 *   появляется двойник с атрибутом [data-pseudo~="hover" | "active" | "focus"]; образец ставит атрибут на нужный элемент;
 * — обе темы рядом: правило токенов :root[data-map="night" | "day"] (src/styles/tokens.css) получает двойник
 *   .spec-map[data-map="…"], и обёртка образца с этим атрибутом несёт токены своей темы.
 * Двойник вставляется сразу за исходным правилом в том же блоке (@media и т. п.): порядок каскада прежний,
 * вес селектора тот же — атрибут весит столько же, сколько псевдокласс. Атлас этих атрибутов не ставит, и в нём двойники
 * ни к чему не относятся.
 */

export type Pseudo = 'hover' | 'active' | 'focus';

const STATE = /:(hover|active|focus-visible|focus)(?![\w-])/g;
const ROOT_MAP = /:root\[data-map=(["']?)(night|day)\1\]/g;

/** Список селекторов → отдельные селекторы: запятые внутри (), [] и кавычек не делят. */
export function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const stateOf = (sel: string) => sel.replace(STATE, (_, p: string) => `[data-pseudo~="${p.startsWith('focus') ? 'focus' : p}"]`);
const themeOf = (sel: string) => sel.replace(ROOT_MAP, (_, _q: string, m: string) => `.spec-map[data-map="${m}"]`);

/** Двойники одного селектора для образца: состояние атрибутом, тема обёрткой и то и другое сразу. */
export function specimenSelectors(sel: string): string[] {
  const out = new Set([stateOf(sel), themeOf(sel), themeOf(stateOf(sel))]);
  out.delete(sel);
  return [...out];
}

/** Список селекторов правила → список двойников или null, если правило не про состояние и не про тему. */
export function specimenSelectorList(list: string): string | null {
  const parts = splitSelectorList(list).flatMap(specimenSelectors);
  return parts.length ? parts.join(', ') : null;
}

type RuleParent = CSSStyleSheet | CSSGroupingRule;

function derive(parent: RuleParent, seen: WeakSet<CSSStyleSheet>): number {
  let n = 0;
  // с конца: двойник встаёт за исходным правилом и не попадает в обход
  for (let i = parent.cssRules.length - 1; i >= 0; i--) {
    const r = parent.cssRules[i];
    if (r instanceof CSSStyleRule) {
      const sel = specimenSelectorList(r.selectorText);
      if (!sel) continue;
      parent.insertRule(`${sel} { ${r.style.cssText} }`, i + 1);
      n++;
    } else if (r instanceof CSSImportRule) {
      if (r.styleSheet) n += install(r.styleSheet, seen);
    } else if (r instanceof CSSGroupingRule) n += derive(r, seen);
  }
  return n;
}

function install(sheet: CSSStyleSheet, seen: WeakSet<CSSStyleSheet>): number {
  if (seen.has(sheet)) return 0;
  seen.add(sheet);
  try {
    return derive(sheet, seen);
  } catch {
    return 0; // таблица чужого источника: правил не прочитать
  }
}

const done = new WeakSet<CSSStyleSheet>();

/** Добавляет двойники во все таблицы стилей документа; повторный вызов таблицы не трогает. Возвращает число двойников. */
export function installSpecimenRules(doc: Document = document): number {
  let n = 0;
  for (const sheet of Array.from(doc.styleSheets)) n += install(sheet, done);
  return n;
}
