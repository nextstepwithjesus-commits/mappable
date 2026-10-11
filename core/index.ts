/** Ядро «Библии наглядно» (09 § 4.1, слой 4): программы для данных без интерфейса и без DOM. */
export * from './types.ts';
export * from './state.ts';
export * from './years.ts';
export * from './books.ts';
export * from './paths.ts';
export * from './loader.ts';
export * from './queries.ts';
export * from './verses.ts';
export { parseAddress, inSpan, spanLabel, looksLikeAddress, type Address, type Span, type Versification } from './search/address.ts';
export { psSynToKjv, psKjvToSyn } from './search/psalms.ts';
export { norm, words, enToRu, ruToEn, translit } from './search/norm.ts';
export { NameForms, buildForms, caseForms, type FormsDict, type NameSource } from './search/forms.ts';
export { EXCEPTIONS, MIN_STEM, buildStemTable, parseStemTable } from './search/stems.ts';
export { TextIndex, type BookText, type Mode, type TextResult, type TextHit } from './search/text.ts';
export { Searcher, firstKey, emptyMessage, type SearchIndexData, type SearchResult, type Group, type Person as SearchPerson, type Story } from './search/search.ts';
