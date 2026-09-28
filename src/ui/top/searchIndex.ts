/**
 * Индекс поиска атласа (D9): имена и ссылки индекса неба сразу; ссылки карточек и имена в тексте стихов — по первому
 * запросу-ссылке («Быт 14:18», «Руф 4»), когда подгружаются тома карточек и текст книги (UX-06, IX-17).
 */
import { groups, loadCard, loadedCard, loadedChrono, loadVerses, persons, volumes, type IdxPerson } from '../../data/atlas.ts';
import { SearchIndex, refsOfCard, textNamesOfCard } from '../../engine/search.ts';
import { ROLE_NAMES } from '../common.tsx';

/** Ссылки лица из индекса неба: родители, иные родители, супруги, родство. */
const indexRefs = (p: IdxPerson) => [...p.parentRefs, ...p.otherParents.flatMap((o) => o.refs), ...p.spouses.flatMap((s) => s.refs), ...p.kin.flatMap((k) => k.refs)];
/** Роли словами, как в паспорте карточки: «царь», «пророчица», «апостол» — для запросов «царь Давид» (IX-71). */
const roleWords = (p: IdxPerson) => p.roles.map((r) => ROLE_NAMES[r]?.[p.sex === 'f' ? 1 : 0] ?? '').filter(Boolean);

export const searchIndex = new SearchIndex(
  persons.map((p) => ({
    id: p.id, name: p.name, alt: p.alt, disambig: p.disambig, prominence: p.prominence, magnitude: p.magnitude, refs: indexRefs(p), kind: p.kind, unnamed: p.unnamed, roles: roleWords(p),
  })),
  { groupWords: groups.filter((g) => g.kind === 'tribe' || g.kind === 'nation').flatMap((g) => g.name.split(/\s+/).filter((w) => w.length > 2)) },
);

let cards: Promise<void> | null = null;
/** Все тома карточек (однажды): ссылки карточек и иные имена для сверки с текстом. */
export function loadCardRefs(): Promise<void> {
  cards ??= Promise.all(
    volumes.map((v) => {
      const first = persons.find((p) => p.volume === v.volume);
      return first ? loadCard(first.id) : null;
    }),
  ).then(() => {
    for (const p of persons) {
      const c = loadedCard(p.id);
      searchIndex.addRefs(p.id, refsOfCard(c, loadedChrono(p.id)));
      const alt = textNamesOfCard(c);
      if (alt.length) searchIndex.setTextForms(p.id, [p.name, ...alt]);
    }
  })
    // отказ (том не загрузился) не остаётся навсегда: следующий поиск по стиху попробует снова
    .catch((e) => {
      cards = null;
      throw e;
    });
  return cards;
}

const books = new Map<string, Promise<void>>();
/** Всё, что нужно для поиска по стиху или главе книги: ссылки карточек, затем текст книги (имена в стихах). */
export function prepareBook(book: string): Promise<void> {
  let pr = books.get(book);
  if (!pr) {
    pr = loadCardRefs()
      .then(() => loadVerses(book))
      .then((vs) => searchIndex.addVerseTexts(Object.fromEntries(Object.entries(vs).map(([k, t]) => [`${book} ${k}`, t]))));
    books.set(book, pr);
    pr.catch(() => books.delete(book));
  }
  return pr;
}
