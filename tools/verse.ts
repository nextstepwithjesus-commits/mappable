/**
 * Показ стихов Синодального перевода и поиск по тексту.
 *   npm run -s verse -- "Быт 5:3-5" "Лк 3:23"
 *   npm run -s verse -- --find "Мафусал"          (поиск основы слова по всей Библии)
 *   npm run -s verse -- --find "Мафусал" --book Быт
 */
import { loadBible } from './bible.ts';
import { parseRef, verseId } from '../src/engine/books.ts';
import { norm } from '../src/engine/text.ts';

process.stdout.on('error', () => process.exit(0));
const bible = loadBible();
const args = process.argv.slice(2);
if (args[0] === '--find') {
  const q = norm(args[1] ?? '');
  const bookIdx = args.indexOf('--book');
  const book = bookIdx >= 0 ? args[bookIdx + 1] : null;
  let n = 0;
  for (const key of bible.order) {
    if (book && !key.startsWith(book + ' ')) continue;
    const t = bible.verses.get(key)!;
    if (norm(t).includes(q)) {
      console.log(`${key}\t${t}`);
      if (++n >= 300) {
        console.log('… (показаны первые 300)');
        break;
      }
    }
  }
  if (!n) console.log('не найдено');
} else {
  for (const a of args) {
    const p = parseRef(a, bible.chapterLength);
    if (!p) {
      console.log(`!! неверная ссылка: ${a}`);
      continue;
    }
    const list = p.chapterOnly
      ? Array.from({ length: bible.chapterLength(p.book, p.chapterOnly) }, (_, i) => ({ book: p.book, chapter: p.chapterOnly!, verse: i + 1 }))
      : p.verses;
    for (const v of list) {
      const id = verseId(v);
      console.log(`${id}\t${bible.verses.get(id) ?? '!! НЕТ ТАКОГО СТИХА'}`);
    }
  }
}
