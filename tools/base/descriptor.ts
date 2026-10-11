/**
 * Подпись безымянного (02 § 3.2 [4.5; 4.6]; задача К-20): поле `descriptor: {text, refs, nameFrom?, cert, alt?}`.
 *
 * Проверка: каждое значимое слово подписи стоит в стихах `descriptor.refs` или в стихе `nameFrom` — по основе, вне скобок;
 * с `nameFrom` — уровень «выв.», без него — «Писание»; основное имя карточки повторяет подпись; лицо `nameFrom` названо в своём
 * стихе. У безымянного подпись обязательна; строка прежнего вида («вдова») — ошибка (после Д-16).
 */
import { loadBible } from '../bible.ts';
import { parseRef, verseId } from '../../src/engine/books.ts';
import { norm, nameMatcher } from '../../src/engine/text.ts';
import { scriptureText } from './brackets.ts';
import type { Base } from './migrate.ts';
import type { Actor, Descriptor, Ref } from './types.ts';

type Err = (check: string, where: string, msg: string) => void;

/** Служебные слова подписи: предлоги, союзы, частицы — по ним подпись не проверяется. */
const STOP = new Set(['и', 'в', 'во', 'на', 'с', 'со', 'из', 'от', 'к', 'ко', 'у', 'о', 'об', 'по', 'за', 'для', 'при', 'же', 'не', 'а', 'но', 'или', 'что', 'который', 'которая', 'которое', 'которые']);

/** Слова текста: строчные, «ё» → «е», дефис делит слово. */
export const words = (s: string) => (norm(s).match(/[а-я]+/g) ?? []);

/** Основа слова для сверки со стихом: без окончания (одна-две буквы), не короче двух букв. */
export function stem(w: string): string {
  if (w.length >= 6) return w.slice(0, -2);
  if (w.length >= 4) return w.slice(0, -1);
  if (w.length === 3 && /[аеиоуыэюяйь]$/.test(w)) return w.slice(0, -1);
  return w;
}

const verseIds = (refs: Ref[]): string[] => {
  const { chapterLength } = loadBible();
  return [...new Set(refs.flatMap((r) => {
    const p = parseRef(r, chapterLength);
    return p && !p.chapterOnly ? p.verses.map(verseId) : [];
  }))];
};
const textOf = (id: string) => {
  const m = /^(.+) (\d+):(\d+)$/.exec(id);
  return m ? norm(scriptureText(m[1], +m[2], +m[3]) ?? '') : '';
};

/** Значимые слова подписи, которых нет в стихах (по основе, вне скобок). */
export function missingWords(text: string, refs: Ref[]): string[] {
  const toks = new Set(verseIds(refs).flatMap((v) => words(textOf(v))));
  const has = (w: string) => {
    const s = stem(w);
    for (const t of toks) if (t.startsWith(s)) return true;
    return false;
  };
  return words(text).filter((w) => !STOP.has(w) && !has(w));
}

const isObj = (d: Actor['descriptor']): d is Descriptor => !!d && typeof d === 'object';

export function checkDescriptors(base: Base, err: Err) {
  const actors = new Map<string, Actor>();
  for (const v of base.volumes) for (const a of v.actors) actors.set(a.id, a);
  for (const a of actors.values()) {
    const d = a.descriptor;
    if (d === undefined) {
      if (a.kind === 'unnamed') err('подпись безымянного', a.id, 'у безымянного нет подписи (descriptor: {text, refs, cert}; 02 § 3.2)');
      continue;
    }
    if (!isObj(d)) {
      err('подпись безымянного', a.id, `подпись прежнего вида — строка «${d}»: нужна запись {text, refs, nameFrom?, cert} (02 § 3.2; Д-16)`);
      continue;
    }
    const w = `${a.id} «${d.text}»`;
    if (!d.text?.trim()) err('подпись безымянного', w, 'пустая подпись');
    if (!d.refs?.length) err('подпись безымянного', w, 'подпись без стихов (descriptor.refs)');
    const main = a.names.find((n) => n.type === 'main') ?? a.names[0];
    if (main && norm(main.form) !== norm(d.text)) err('подпись безымянного', w, `основное имя «${main.form}» не повторяет подпись (02 § 3.2: основное имя карточки — это подпись)`);
    const from = d.nameFrom ?? [];
    if (from.length && d.cert !== 'inference') err('подпись безымянного', w, 'имя другого лица из соседнего стиха (nameFrom) — уровень подписи «выв.» (cert: inference)');
    if (!from.length && d.cert !== 'scripture') err('подпись безымянного', w, 'подпись из слов стиха без nameFrom — уровень «Писание» (cert: scripture)');
    for (const x of from) {
      const o = actors.get(x.actor);
      if (!o) {
        err('подпись безымянного', w, `nameFrom: нет лица ${x.actor}`);
        continue;
      }
      if (!verseIds([x.ref]).some((v) => o.names.some((n) => nameMatcher(n.form).test(textOf(v))))) err('подпись безымянного', w, `nameFrom: ${x.actor} не назван в ${x.ref} вне скобок`);
    }
    const miss = missingWords(d.text ?? '', [...(d.refs ?? []), ...from.map((x) => x.ref)]);
    if (miss.length) err('подпись безымянного', w, `слов подписи нет в стихах подписи вне скобок: ${miss.join(', ')} (02 § 3.2: подпись — из слов стиха; другое слово того же смысла — только alt)`);
    for (const s of d.alt ?? []) if (typeof s !== 'string' || !s.trim()) err('подпись безымянного', w, 'alt — непустые строки (слова для поиска)');
  }
}

/** Слово, по которому лицо ищется в стихе (у безымянного и группы — подпись). */
export const descriptorText = (a: Pick<Actor, 'descriptor'>): string | undefined => (isObj(a.descriptor) ? a.descriptor.text : a.descriptor);
