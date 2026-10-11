/**
 * Бюджеты пакетов для 02 ред. 4.1, § 8 (решение координатора Р-11). Ничего не пишет.
 * Запуск из корня: npx tsx docs/app/data/02-составитель/бюджеты.ts
 *
 * 1) индекс и карточки — функциями самой сборки (tools/base/bundle.ts) на уровне «проба» (все черновики: верхняя граница);
 * 2) карточки с номером утверждения: в пакете — только порядковое число (`i`), полный номер `a-…` собирает ядро;
 *    и для сравнения — полный номер строкой;
 * 3) TSK по книгам: как в tools/bible/tsk.tsv и в сжатой записи (стих числом, слово группы — номером словаря);
 * 4) текст по книгам из tools/bible/synodal.tsv;
 * 5) оценка каталога историй: синтетика 1 800 строк (номер, короткое имя до 40 знаков из текста стиха, первый стих, ступень).
 * Сжатие — gzip уровня 9 (верхняя граница; хранилище, вероятно, brotli — 09 § 5.3).
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { loadBase } from '../../../../tools/base/validate.ts';
import { buildIndex, buildCards } from '../../../../tools/base/bundle.ts';

const gz = (x: unknown) => gzipSync(typeof x === 'string' ? x : JSON.stringify(x), { level: 9 }).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;
const base = loadBase();

const idx = buildIndex(base, 'probe');
console.log(`индекс (проба, все черновики): ${kb(gz(idx))}; бюджет 200 КБ`);
const parts: Record<string, number> = {};
for (const [k, v] of Object.entries(idx)) if (typeof v === 'object') parts[k] = gz(v);
console.log('  части индекса: ' + Object.entries(parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${kb(v)}`).join(', '));

const { cards } = buildCards(base, 'probe');
let total = 0, totalI = 0, totalA = 0, over = 0, overI = 0, overA = 0, maxV = '', max = 0, maxI = 0, maxA = 0;
let counter = 0;
for (const [vol, c] of Object.entries(cards)) {
  const s = gz(c);
  const withI = structuredClone(c) as any, withA = structuredClone(c) as any;
  for (const id of Object.keys(withI.cards)) {
    for (const f of withI.cards[id].f) f.i = ++counter;
  }
  counter -= Object.values<any>(withI.cards).reduce((n, x) => n + x.f.length, 0);
  for (const id of Object.keys(withA.cards)) for (const f of withA.cards[id].f) f.i = `a-${++counter}`;
  const si = gz(withI), sa = gz(withA);
  total += s; totalI += si; totalA += sa;
  if (s > 64 * 1024) over++; if (si > 64 * 1024) overI++; if (sa > 64 * 1024) overA++;
  if (s > max) { max = s; maxV = vol; maxI = si; maxA = sa; }
}
console.log(`карточки: всего ${kb(total)}; наибольший том ${maxV} ${kb(max)}; томов > 64 КБ: ${over}`);
console.log(`  с номером утверждения числом: всего ${kb(totalI)}; ${maxV} ${kb(maxI)}; томов > 64 КБ: ${overI}`);
console.log(`  с номером «a-…» строкой: всего ${kb(totalA)}; ${maxV} ${kb(maxA)}; томов > 64 КБ: ${overA}`);

// TSK по книгам
const rows = readFileSync('tools/bible/tsk.tsv', 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'));
const byBook = new Map<string, string[][]>();
for (const r of rows) (byBook.get(r[0]) ?? byBook.set(r[0], []).get(r[0])!).push(r);
const words = new Map<string, number>();
let tRaw = 0, tCompact = 0, bigRaw = ['', 0], bigC = ['', 0] as [string, number];
let booksOver = 0;
for (const [book, rs] of byBook) {
  const raw = gz(rs.map((r) => r.join('\t')).join('\n'));
  const compact = gz(rs.map((r) => [r[1], r[2], r[4], words.get(r[5]) ?? (words.set(r[5], words.size), words.size - 1), r[6]]));
  tRaw += raw; tCompact += compact;
  if (raw > (bigRaw[1] as number)) bigRaw = [book, raw];
  if (compact > bigC[1]) bigC = [book, compact];
  if (compact > 96 * 1024) booksOver++;
}
const dict = gz([...words.keys()]);
console.log(`TSK: строк ${rows.length}; книг ${byBook.size}; как в tsk.tsv — ${kb(tRaw)} (наибольшая ${bigRaw[0]} ${kb(bigRaw[1] as number)})`);
console.log(`  сжатая запись — ${kb(tCompact)} + словарь слов ${kb(dict)} (${words.size}); наибольшая ${bigC[0]} ${kb(bigC[1])}; книг > 96 КБ: ${booksOver}`);

// текст по книгам
const text = readFileSync('tools/bible/synodal.tsv', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const tb = new Map<string, string[]>();
for (const r of text) (tb.get(r[0]) ?? tb.set(r[0], []).get(r[0])!).push(r.join('\t'));
let txt = 0, txtMax = ['', 0] as [string, number];
for (const [b, ls] of tb) { const s = gz(ls.join('\n')); txt += s; if (s > txtMax[1]) txtMax = [b, s]; }
console.log(`текст: всего ${kb(txt)}; наибольшая ${txtMax[0]} ${kb(txtMax[1])}; бюджет 96 КБ на книгу`);

// каталог историй — синтетика
const N = 1800, step = Math.floor(text.length / N);
const cat = Array.from({ length: N }, (_, i) => {
  const r = text[i * step];
  return [`e-${i + 1}`, r[3].replace(/\[[^\]]*\]/g, '').slice(0, 40), `${r[0]} ${r[1]}:${r[2]}`, 1 + (i % 3)];
});
console.log(`каталог историй (синтетика ${N}: номер, имя до 40 знаков, первый стих, ступень): ${kb(gz(cat))}`);
// 4.2: номера историй смысловой длины — транслит имени до 24 знаков
const TR: Record<string, string> = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const tr = (t: string) => t.toLowerCase().split('').map((c) => TR[c] ?? (/[a-z0-9]/.test(c) ? c : '-')).join('').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const cat2 = cat.map((r) => [`e-${tr(String(r[1]))}`, ...r.slice(1)]);
console.log(`каталог историй со смысловыми номерами (транслит до 24 знаков): ${kb(gz(cat2))}`);
// 4.2: TSK без английских слов, цели — порядковыми номерами стихов
const ord = new Map<string, number>(); text.forEach((r, i) => ord.set(`${r[0]}|${r[1]}|${r[2]}`, i));
const expand = (ref: string): number[] => {
  const m = ref.match(/^(\S+) (\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return [];
  const a = ord.get(`${m[1]}|${m[2]}|${m[3]}`);
  if (a === undefined) return [];
  const b = m[4] ? ord.get(`${m[1]}|${m[2]}|${m[4]}`) ?? a : a;
  return b > a ? [a, b - a] : [a];
};
let tsk2 = 0, tsk2Max = ['', 0] as [string, number], over2 = 0;
for (const [book, rs] of byBook) {
  const s2 = gz(rs.map((r) => [Number(r[2]) + 1000 * Number(r[1]), Number(r[4]), r[6].split('; ').map(expand)]));
  tsk2 += s2; if (s2 > tsk2Max[1]) tsk2Max = [book, s2]; if (s2 > 96 * 1024) over2++;
}
console.log(`TSK без английских слов, цели номерами стихов: всего ${kb(tsk2)}; наибольшая ${tsk2Max[0]} ${kb(tsk2Max[1])}; книг > 96 КБ: ${over2}`);
