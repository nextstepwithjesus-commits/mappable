/**
 * Стихи лица (02 § 3.2 «Писание молчит»; рецензия библеиста на 07, № 84; очередь Д3-9).
 *
 * Стих принадлежит лицу только через его запись уровня «Писание» или «вывод»: имена, численность, утверждения (кроме
 * примечаний и указателя «Места Писания»), рёбра, обозначения союзов, родство и членство. Примечания («не смешивать с …»,
 * отождествления), указатель § 23 и всё уровня «толкование», «расчёт», «справочно» стиха не дают: иначе к сыну Иодая
 * попадают Зах 1:1 и Лк 1:5 — стихи о пророке и об отце Иоанна. Из этих стихов берутся только те, где лицо названо
 * (имя или описательное слово вне скобок), по каждому стиху отдельно.
 */
import type { Base } from './migrate.ts';
import type { Actor, Cert } from './types.ts';
import { scriptureText } from './brackets.ts';
import { loadBible } from '../bible.ts';
import { compareRefs, parseRef, verseId } from '../../src/engine/books.ts';
import { nameMatcher, norm } from '../../src/engine/text.ts';

const WEAK = new Set<Cert | undefined>(['interpretation', 'calc', 'reference']);
/** Поля карточки, которые стиха лицу не дают: примечания и указатель «Места Писания» (он собран из других записей). */
const NO_VERSE_FIELDS = new Set(['notes', 'scripture']);

/** Ссылки записи, кроме частей уровня «толкование», «расчёт», «справочно» (на любой глубине). */
function strongRefs(x: unknown, out: string[]) {
  if (Array.isArray(x)) return x.forEach((y) => strongRefs(y, out));
  if (!x || typeof x !== 'object') return;
  if (WEAK.has((x as any).cert)) return;
  for (const [k, v] of Object.entries(x)) {
    if ((k === 'ref' || k === 'first') && typeof v === 'string') out.push(v);
    else if ((k === 'refs' || k === 'key' || k === 'all') && Array.isArray(v)) out.push(...v.filter((r): r is string => typeof r === 'string'));
    else strongRefs(v, out);
  }
}

/** Ссылки каждого лица из его записей уровня «Писание» и «вывод». */
export function ownRefs(base: Pick<Base, 'volumes' | 'origins' | 'unions' | 'kin' | 'memberships'>): Map<string, string[]> {
  const own = new Map<string, string[]>();
  const add = (id: string | undefined, rs: string[]) => {
    if (id && rs.length) own.set(id, [...(own.get(id) ?? []), ...rs]);
  };
  for (const v of base.volumes) for (const a of v.actors) {
    const rs: string[] = [];
    for (const n of a.names) rs.push(...n.refs);
    if (a.count) rs.push(...a.count.refs);
    for (const f of a.facts) {
      if (f.prov?.status === 'quarantine' || WEAK.has(f.cert) || NO_VERSE_FIELDS.has(f.field)) continue;
      strongRefs(f.value, rs);
    }
    add(a.id, rs);
  }
  for (const o of base.origins) if (!WEAK.has(o.cert)) {
    add(o.child, o.refs);
    add(o.parent, o.refs);
  }
  for (const u of base.unions) for (const t of u.terms) if (!WEAK.has(t.cert)) {
    add(u.husband, t.refs);
    add(u.wife, t.refs);
  }
  for (const k of base.kin) if (!WEAK.has(k.cert)) {
    add(k.from, k.refs);
    add(k.to, k.refs);
  }
  for (const m of base.memberships) add(m.actor, m.refs);
  return own;
}

/** Формы, по которым лицо ищется в стихе: у безымянного и группы — описательное слово. */
export const formsOf = (a: Actor) => ((a.kind === 'unnamed' || a.kind === 'group') && a.descriptor ? [a.descriptor] : a.names.map((n) => n.form));

/** Стихи из ссылок, где лицо названо вне скобок: по одному стиху, канонический порядок, без повторов. */
export function namedVerses(a: Actor, refs: Iterable<string>): string[] {
  const { chapterLength } = loadBible();
  const forms = formsOf(a);
  const named = new Set<string>();
  for (const r of new Set(refs)) {
    for (const v of parseRef(r, chapterLength)?.verses ?? []) {
      const t = norm(scriptureText(v.book, v.chapter, v.verse) ?? '');
      if (t && forms.some((f) => nameMatcher(f).test(t))) named.add(verseId(v));
    }
  }
  return [...named].sort(compareRefs);
}
