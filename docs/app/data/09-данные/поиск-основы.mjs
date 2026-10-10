// Рецензия данных на 09 § 3.5: сколько стоит поиск по тексту, если искать по основам слов, как пишет 09,
// а не по подстроке, как меряет docs/app/data/09-составитель/поиск-проход.mjs.
// Стеммер — классический «Портер для русского» (тот же алгоритм, что Snowball russian, в записи регулярками).
// Запуск: node docs/app/data/09-данные/поиск-основы.mjs tools/bible/synodal.tsv
import { readFileSync } from 'node:fs';

const PERFECTIVEGROUND = /((ив|ивши|ившись|ыв|ывши|ывшись)|((?<=[ая])(в|вши|вшись)))$/;
const REFLEXIVE = /(с[яь])$/;
const ADJECTIVE = /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PARTICIPLE = /((ивш|ывш|ующ)|((?<=[ая])(ем|нн|вш|ющ|щ)))$/;
const VERB = /((ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)|((?<=[ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)))$/;
const NOUN = /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const RVRE = /^(.*?[аеиоуыэюя])(.*)$/;
const DERIVATIONAL = /.*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$/;
function stem(word) {
  const m = RVRE.exec(word);
  if (!m) return word;
  const pre = m[1];
  let rv = m[2];
  let t = rv.replace(PERFECTIVEGROUND, '');
  if (t === rv) {
    rv = rv.replace(REFLEXIVE, '');
    t = rv.replace(ADJECTIVE, '');
    if (t !== rv) { rv = t.replace(PARTICIPLE, ''); }
    else { t = rv.replace(VERB, ''); rv = t === rv ? rv.replace(NOUN, '') : t; }
  } else rv = t;
  rv = rv.replace(/и$/, '');
  if (DERIVATIONAL.test(rv)) rv = rv.replace(/ость?$/, '');
  t = rv.replace(/ь$/, '');
  if (t === rv) { rv = rv.replace(/ейше?/, ''); rv = rv.replace(/нн$/, 'н'); } else rv = t;
  return pre + rv;
}

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
const rows = readFileSync(process.argv[2], 'utf8').split('\n').map((l) => l.split('\t')).filter((r) => r.length > 1);
const raw = rows.map((r) => norm(r[r.length - 1]));

// 1. Холодный старт: разбить 31 170 стихов на слова и посчитать основы (если основы не готовы при сборке)
let t0 = performance.now();
const cache = new Map();
const verses = raw.map((v) => v.split(/[^а-я]+/).filter(Boolean).map((w) => { let s = cache.get(w); if (s === undefined) { s = stem(w); cache.set(w, s); } return s; }));
const cold = performance.now() - t0;
const tokens = verses.reduce((n, v) => n + v.length, 0);
console.log(`стихов ${verses.length}; слов ${tokens}; разных форм ${cache.size}; разных основ ${new Set(cache.values()).size}`);
console.log(`холодный старт (разбор и основы всего текста): ${cold.toFixed(0)} мс на этой машине`);

// 2. Запрос по основам: каждое слово запроса — основа; стих подходит, если в нём есть все основы
for (const q of [['пять', 'хлеб'], ['господь', 'пастырь'], ['ковчег']]) {
  const qs = q.map(stem);
  t0 = performance.now();
  let n = 0;
  for (let k = 0; k < 20; k++) { n = 0; for (const v of verses) if (qs.every((s) => v.includes(s))) n++; }
  const ms = (performance.now() - t0) / 20;
  // для сравнения — подстрока, как в замере составителя
  let sub = 0; const subHits = [];
  for (let i = 0; i < raw.length; i++) if (q.every((w) => raw[i].includes(w.slice(0, 5)))) { sub++; if (!qs.every((s) => verses[i].includes(s)) && subHits.length < 3) subHits.push(rows[i].slice(0, 3).join(' ')); }
  console.log(`${q.join(' ')} → основы ${qs.join(' ')}: найдено ${n}, ${ms.toFixed(1)} мс на запрос; подстрокой (первые 5 букв) — ${sub}; лишние подстрокой, примеры: ${subHits.join('; ') || 'нет'}`);
}

// 3. «пять» как подстрока: в каких словах встречается
const forms = [...cache.keys()].filter((w) => w.includes('пять') && stem(w) !== stem('пять'));
console.log(`словоформы с подстрокой «пять», у которых другая основа: ${forms.length}; примеры: ${forms.slice(0, 8).join(', ')}`);

// 4. Основы имён: совпадения со служебными словами и разрыв форм одного имени
const count = (s) => verses.reduce((n, v) => n + (v.includes(s) ? 1 : 0), 0);
const exact = (w) => raw.reduce((n, v) => n + (v.split(/[^а-я]+/).includes(w) ? 1 : 0), 0);
for (const [name, forms] of [['ной', ['ной', 'ноя', 'ною', 'ноем']], ['лия', ['лия', 'лии', 'лию', 'лиею']], ['ева', ['ева', 'евы', 'еве', 'еву']], ['илия', ['илия', 'илии', 'илию', 'илиею']], ['моисей', ['моисей', 'моисея', 'моисею', 'моисеем']]]) {
  const s = stem(name);
  const real = forms.reduce((n, f) => n + exact(f), 0);
  console.log(`«${name}» → основа «${s}»: стихов с этой основой ${count(s)}; стихов с формами имени ${real}; основы форм: ${forms.map((f) => f + '→' + stem(f)).join(', ')}`);
}

// 5. Сколько весил бы обратный индекс (09 § 3.5 п. 5: «индекс весил бы больше самого текста»)
import { gzipSync } from 'node:zlib';
for (const [label, keyOf] of [['по словоформам', (w) => w], ['по основам', (w) => cache.get(w)]]) {
  const post = new Map();
  raw.forEach((v, i) => { for (const w of new Set(v.split(/[^а-я]+/).filter(Boolean).map(keyOf))) (post.get(w) ?? post.set(w, []).get(w)).push(i); });
  const bytes = [];
  const enc = (n) => { while (n >= 128) { bytes.push((n & 127) | 128); n >>>= 7; } bytes.push(n); };
  for (const list of post.values()) { enc(list.length); let prev = 0; for (const i of list) { enc(i - prev); prev = i; } }
  const keys = Buffer.from([...post.keys()].join('\n'));
  const all = Buffer.concat([keys, Buffer.from(bytes)]);
  console.log(`обратный индекс ${label}: ключей ${post.size}; ${(all.length / 1024).toFixed(0)} КБ без сжатия, ${(gzipSync(all, { level: 9 }).length / 1024).toFixed(0)} КБ gzip (текст — около 1 500 КБ gzip)`);
}
