/**
 * П-Т3: сборка данных поиска (то, что в продукте делает tools/pack/). Запуск из корня:
 *   npx tsx prototypes/П-Т3/build/build.mts
 * Вход: tools/bible/synodal.tsv (текст), dist-data-probe/index.json (имена лиц, сборка пробы), истории-эскиз.json.
 * Выход: prototypes/П-Т3/public-data/ — текст по книгам, таблица основ, словарь форм и индекс имён; размеры gzip.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BOOKS } from '../core/books.ts';
import { buildForms } from '../core/forms.ts';
import { buildStemTable, EXCEPTIONS } from '../core/stems.ts';
import { norm } from '../core/norm.ts';

const here = fileURLToPath(new URL('..', import.meta.url));
const repo = join(here, '../..');
const out = join(here, 'public-data');
mkdirSync(join(out, 'text'), { recursive: true });
const require = createRequire(import.meta.url);
const snowball = require(join(here, 'node_modules/snowball-stemmers')) as { newStemmer(l: string): { stem(w: string): string } };
const ru = snowball.newStemmer('russian');

const probeIndex = join(repo, 'dist-data-probe/index.json');
if (!existsSync(probeIndex)) throw new Error('нет dist-data-probe/: сначала `npm run -s base:bundle -- --probe`');

// 1. текст по книгам
const byBook = new Map<string, (string | null)[][]>();
for (const line of readFileSync(join(repo, 'tools/bible/synodal.tsv'), 'utf8').split('\n')) {
  const p = line.split('\t');
  if (p.length < 4) continue;
  const ch = byBook.get(p[0]) ?? byBook.set(p[0], []).get(p[0])!;
  const c = +p[1];
  const v = +p[2];
  (ch[c - 1] ??= [])[v - 1] = p[3];
}
const sizes: { name: string; raw: number; gz: number; br: number }[] = [];
const write = (name: string, body: string) => {
  writeFileSync(join(out, name), body);
  sizes.push({ name, raw: Buffer.byteLength(body), gz: gzipSync(body, { level: 9 }).length, br: brotliCompressSync(body).length });
};
for (const b of BOOKS) {
  const ch = byBook.get(b.code);
  if (!ch) throw new Error(`нет книги ${b.code}`);
  // стиха нет в синодальном тексте (Дан 3:24–90 — вставка, которой в файле нет) — null, а не пустая строка
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] ??= null;
  write(`text/${b.slug}.json`, JSON.stringify({ book: b.code, ch }));
}

// 2. слова текста; формы с прописной не в начале предложения
const textWords = new Set<string>();
const capitalized = new Set<string>();
for (const ch of byBook.values())
  for (const c of ch)
    for (const v of c)
      if (v !== null)
      for (const m of v.matchAll(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g)) {
        const w = m[0];
        const f = norm(w);
        textWords.add(f);
        if (/^[А-ЯЁ]/.test(w)) {
          const before = v.slice(0, m.index).trimEnd();
          if (before !== '' && !/[.!?:]$/.test(before) && !/[«"(\[]$/.test(before)) capitalized.add(f);
        }
      }

// 3. таблица основ (Snowball, при сборке)
const stemTable = buildStemTable(textWords, (w) => ru.stem(w));
write('stems.tsv', stemTable);

// 4. словарь форм имён и индекс имён
const idx = JSON.parse(readFileSync(probeIndex, 'utf8')) as {
  actors: { id: string; k: string; n: string; o?: string[]; d?: string; p?: number; s?: string }[];
};
const sources = idx.actors.map((a) => ({ id: a.id, names: [a.n, ...(a.o ?? [])] }));
const forms = buildForms(sources, textWords, capitalized);
const stories = JSON.parse(readFileSync(join(here, 'build/истории-эскиз.json'), 'utf8')).stories;
const persons = idx.actors.map((a) => ({ id: a.id, n: a.n, o: a.o, d: a.d, p: a.p ?? 1, k: a.k }));
write(
  'search-index.json',
  JSON.stringify({ names: forms.names, exceptions: EXCEPTIONS.map((e) => e.forms), persons, stories }),
);

// отчёт
const dropped = [...new Set(sources.flatMap((s) => s.names.map((n) => norm(n.split(/\s+/)[0]))))].length;
const k = (n: number) => (n / 1024).toFixed(1);
const text = sizes.filter((s) => s.name.startsWith('text/'));
const sum = (a: typeof sizes, f: 'raw' | 'gz' | 'br') => a.reduce((x, s) => x + s[f], 0);
const maxBook = text.reduce((a, s) => (s.gz > a.gz ? s : a));
const report = {
  built: new Date().toISOString(),
  verses: [...byBook.values()].reduce((n, ch) => n + ch.reduce((m, c) => m + c.filter((v) => v !== null).length, 0), 0),
  nameFormsWithoutCapitalFilter: new Set(buildForms(sources, textWords, textWords).names.flatMap((n) => n.forms)).size,
  wordForms: textWords.size,
  stemRows: stemTable.split('\n').length,
  nameFirstWords: dropped,
  names: forms.names.length,
  nameForms: new Set(forms.names.flatMap((n) => n.forms)).size,
  textKB: { raw: k(sum(text, 'raw')), gz: k(sum(text, 'gz')), br: k(sum(text, 'br')), maxBook: `${maxBook.name} ${k(maxBook.gz)}` },
  other: sizes.filter((s) => !s.name.startsWith('text/')).map((s) => ({ name: s.name, raw: k(s.raw), gz: k(s.gz), br: k(s.br) })),
};
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
