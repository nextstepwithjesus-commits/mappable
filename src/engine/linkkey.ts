/**
 * Ключ связи (этап 11, решения 78 и 83): какую линию неба выбрал читатель — щелчком, касанием, строкой «Родство» карточки
 * у звезды или адресом «~c». Ключ — это родство из данных, а не геометрия: одну и ту же связь рисуют по-разному
 * «всё небо», семейная укладка и лента Мессии, а ключ у неё один.
 *
 * Виды:
 *  child  — союз → ребёнок (зубец к ребёнку; у ребёнка линии Мессии эту связь рисует лента);
 *  spouse — супруг → точка союза (черта брака, ступенька ствола к узлу союза);
 *  union  — союз целиком (ствол и узел союза: «Иаков и Лия — 7 детей»);
 *  step   — шаг линии Мессии (data/lines/*.json: joseph — Мф 1, mary — Лк 3) к лицу child;
 *  kin    — родство словами Писания без родителей (П-8: «сестра», «брат», «родственница»).
 *
 * Запись для адреса — только [a-z0-9._-] (id лиц — [a-z0-9-], проверено по данным): поля через точку, пустое место — «_».
 * Союз записан тремя полями: муж или отец, жена или мать, вид утверждения (claim иного рода; «_» — кровный союз).
 *   k.iakov.rakhil._.iosif    — связь «Иаков и Рахиль → Иосиф»
 *   s.iakov.rakhil._.rakhil   — черта брака Рахили к союзу
 *   u.set._._                 — союз Сифа и неназванной жены
 *   r.j.solomon               — шаг линии Иосифа к Соломону (Мф 1:6)
 *   n.david.saruiya           — «Саруия — сестра Давида» (1 Пар 2:16)
 * Модуль чистый.
 */
import { unionId } from './unions.ts';

export type LinkKey =
  | { kind: 'child'; union: string; child: string }
  | { kind: 'spouse'; union: string; person: string }
  | { kind: 'union'; union: string }
  | { kind: 'step'; line: 'joseph' | 'mary'; child: string }
  | { kind: 'kin'; a: string; b: string };

const ID = /^[a-z0-9-]+$/;
const CLAIM = /^[a-z-]+$/;

/** Части id союза «u:отец+мать~claim»: null — место не названо; claim — вид утверждения иного рода или null. */
export function unionParts(id: string): { a: string | null; b: string | null; claim: string | null } | null {
  const m = /^u:([a-z0-9-]*)\+([a-z0-9-]*)(?:~([a-z-]+))?$/.exec(id);
  if (!m) return null;
  return { a: m[1] || null, b: m[2] || null, claim: m[3] ?? null };
}

const unionField = (id: string): string | null => {
  const p = unionParts(id);
  return p ? `${p.a ?? '_'}.${p.b ?? '_'}.${p.claim ?? '_'}` : null;
};

const unionFrom = (a: string, b: string, c: string): string | null => {
  if ((a !== '_' && !ID.test(a)) || (b !== '_' && !ID.test(b)) || (c !== '_' && !CLAIM.test(c))) return null;
  if (a === '_' && b === '_') return null;
  return unionId(a === '_' ? null : a, b === '_' ? null : b, c === '_' ? undefined : c);
};

/** Запись ключа для адреса и data-атрибутов; null — ключ не записывается (битый id). */
export function linkKeyString(k: LinkKey): string | null {
  switch (k.kind) {
    case 'child': {
      const u = unionField(k.union);
      return u && ID.test(k.child) ? `k.${u}.${k.child}` : null;
    }
    case 'spouse': {
      const u = unionField(k.union);
      return u && ID.test(k.person) ? `s.${u}.${k.person}` : null;
    }
    case 'union': {
      const u = unionField(k.union);
      return u ? `u.${u}` : null;
    }
    case 'step':
      return ID.test(k.child) ? `r.${k.line === 'joseph' ? 'j' : 'm'}.${k.child}` : null;
    case 'kin':
      return ID.test(k.a) && ID.test(k.b) ? `n.${k.a}.${k.b}` : null;
  }
}

/** Разбор записи; null — запись не ключ связи (проверка существования лиц и союзов — у вызывающего). */
export function parseLinkKey(s: string): LinkKey | null {
  const f = s.split('.');
  switch (f[0]) {
    case 'k':
    case 's': {
      if (f.length !== 5 || !ID.test(f[4])) return null;
      const union = unionFrom(f[1], f[2], f[3]);
      if (!union) return null;
      return f[0] === 'k' ? { kind: 'child', union, child: f[4] } : { kind: 'spouse', union, person: f[4] };
    }
    case 'u': {
      if (f.length !== 4) return null;
      const union = unionFrom(f[1], f[2], f[3]);
      return union ? { kind: 'union', union } : null;
    }
    case 'r':
      return f.length === 3 && (f[1] === 'j' || f[1] === 'm') && ID.test(f[2]) ? { kind: 'step', line: f[1] === 'j' ? 'joseph' : 'mary', child: f[2] } : null;
    case 'n':
      return f.length === 3 && ID.test(f[1]) && ID.test(f[2]) ? { kind: 'kin', a: f[1], b: f[2] } : null;
    default:
      return null;
  }
}

/** Одна и та же связь (по записи). */
export const sameLink = (x: LinkKey | null | undefined, y: LinkKey | null | undefined): boolean =>
  !!x && !!y && linkKeyString(x) === linkKeyString(y);

/**
 * Лица на концах связи: from — старшая сторона (родители, супруг, родитель шага), to — младшая (ребёнок, союз как пара).
 * parentOfStep — отец шага линии (по data/lines); у шага без отца (Адам) — пусто.
 */
export function linkEnds(k: LinkKey, parentOfStep?: (line: 'joseph' | 'mary', child: string) => string | null): { from: string[]; to: string[] } {
  switch (k.kind) {
    case 'child': {
      const p = unionParts(k.union);
      return { from: p ? [p.a, p.b].filter((x): x is string => !!x) : [], to: [k.child] };
    }
    case 'spouse': {
      const p = unionParts(k.union);
      const other = p ? [p.a, p.b].filter((x): x is string => !!x && x !== k.person) : [];
      return { from: [k.person], to: other };
    }
    case 'union': {
      const p = unionParts(k.union);
      return { from: p ? [p.a, p.b].filter((x): x is string => !!x) : [], to: [] };
    }
    case 'step': {
      const f = parentOfStep?.(k.line, k.child) ?? null;
      return { from: f ? [f] : [], to: [k.child] };
    }
    case 'kin':
      return { from: [k.a], to: [k.b] };
  }
}
