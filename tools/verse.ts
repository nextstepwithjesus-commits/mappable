/**
 * Показ стихов Синодального перевода и поиск по тексту.
 *   npm run -s verse -- "Быт 5:3-5" "Лк 3:23"
 *   npm run -s verse -- --find "Мафусал"          (поиск основы слова по всей Библии)
 *   npm run -s verse -- --find "Мафусал" --book Быт
 *
 * Стих из таблицы дефектов электронного текста (tools/bible/source-issues.tsv: пустой стих, склейка, скобка через
 * несколько стихов…) печатается с пометкой «   ! …» строкой ниже; пустой стих — словами «(стих пуст в электронном тексте)».
 */
import { loadBible } from './bible.ts';
import { parseRef, verseId } from '../src/engine/books.ts';
import { norm } from '../src/engine/text.ts';
import { issuesAt, issueNote } from './base/source-issues.ts';

process.stdout.on('error', () => process.exit(0));
const bible = loadBible();
const args = process.argv.slice(2);
/** Дефекты электронного текста у стиха «Пс 114:9». */
const at = (key: string) => {
  const m = /^(\S+) (\d+):(\d+)$/.exec(key);
  return m ? issuesAt(m[1], Number(m[2]), Number(m[3])) : [];
};
/** Строка стиха и пометки дефектов под ней. */
const show = (key: string, t: string | undefined) => {
  if (t === undefined) return console.log(`${key}\t!! НЕТ ТАКОГО СТИХА`);
  const rows = at(key);
  console.log(`${key}\t${t.trim() ? t : '(стих пуст в электронном тексте)'}`);
  if (!t.trim() && !rows.some((r) => r.kind === 'empty')) console.log('   !! пустой стих не записан в tools/bible/source-issues.tsv');
  for (const r of rows) console.log(`   ! ${issueNote(r)}`);
};
if (args[0] === '--find') {
  const q = norm(args[1] ?? '');
  const bookIdx = args.indexOf('--book');
  const book = bookIdx >= 0 ? args[bookIdx + 1] : null;
  let n = 0;
  for (const key of bible.order) {
    if (book && !key.startsWith(book + ' ')) continue;
    const t = bible.verses.get(key)!;
    if (norm(t).includes(q)) {
      show(key, t);
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
      show(id, bible.verses.get(id));
    }
  }
}
