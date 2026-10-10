// Замер 09 § 3.5 (редакция 2, решение координатора № 3): поиск по тексту Писания так, как он описан.
//   - слово запроса, которое совпадает с формой имени из базы, ищется по формам этого имени (nameMatcher из src/engine/text.ts),
//     стеммер его не режет;
//   - обычное слово ищется по основе (Портер для русского, та же запись, что у рецензента данных); основа короче 3 букв
//     не принимается — тогда слово ищется целиком;
//   - холодный старт (разбор текста и основы) меряется отдельно.
// Запуск: npx tsx docs/app/data/09-составитель/поиск-формы.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { norm } from '../../../../src/engine/text.ts';

const ROOT = process.cwd();
const PG = /((ив|ивши|ившись|ыв|ывши|ывшись)|((?<=[ая])(в|вши|вшись)))$/;
const RF = /(с[яь])$/;
const AD = /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PA = /((ивш|ывш|ующ)|((?<=[ая])(ем|нн|вш|ющ|щ)))$/;
const VB = /((ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)|((?<=[ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)))$/;
const NN = /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
function stem(w: string): string {
  const m = /^(.*?[аеиоуыэюя])(.*)$/.exec(w);
  if (!m) return w;
  let rv = m[2];
  let t = rv.replace(PG, '');
  if (t === rv) {
    rv = rv.replace(RF, '');
    t = rv.replace(AD, '');
    if (t !== rv) rv = t.replace(PA, '');
    else { t = rv.replace(VB, ''); rv = t === rv ? rv.replace(NN, '') : t; }
  } else rv = t;
  rv = rv.replace(/и$/, '');
  t = rv.replace(/ь$/, '');
  rv = t === rv ? rv.replace(/ейше?/, '').replace(/нн$/, 'н') : t;
  return m[1] + rv;
}

// имена и формы из базы
const names = new Set<string>();
for (const f of readdirSync(join(ROOT, 'base', 'actors')).filter((f) => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(ROOT, 'base', 'actors', f), 'utf8'));
  for (const a of d.items ?? []) for (const n of a.names ?? []) names.add(n.form.split(/\s+/)[0]);
}
const nameList = [...names].filter((n) => /^[А-ЯЁ]/.test(n));
/** Падежные формы имени по окончанию (без притяжательных «Ноев»): словарь форм собирается при сборке и оставляет только
 *  формы, которые есть в тексте. nameMatcher из src/engine/text.ts для поиска не годится: «Илия» у него — основа «или». */
function forms(name: string): string[] {
  const n = norm(name);
  const b = n.slice(0, -1);
  if (/й$/.test(n)) return [n, b + 'я', b + 'ю', b + 'е', b + 'ем'];
  if (/ия$/.test(n)) return [n, b + 'и', b + 'ю', b + 'ей', b + 'ею'];
  if (/я$/.test(n)) return [n, b + 'и', b + 'ю', b + 'е', b + 'ей', b + 'ею'];
  if (/а$/.test(n)) return [n, b + 'ы', b + 'и', b + 'е', b + 'у', b + 'ой', b + 'ою'];
  if (/ь$/.test(n)) return [n, b + 'и', b + 'ью'];
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(n)) return [n, n + 'а', n + 'у', n + 'ом', n + 'е'];
  return [n];
}
const words = new Set<string>();
const formsOf = new Map<string, Set<string>>(); // форма → все формы своего имени (тёзки сливаются: поиск по слову, не по лицу)
const rowsAll = readFileSync(join(ROOT, 'tools', 'bible', 'synodal.tsv'), 'utf8').split('\n').map((l) => l.split('\t')).filter((r) => r.length > 1);
for (const r of rowsAll) for (const w of norm(r[r.length - 1]).split(/[^а-я-]+/)) if (w) words.add(w);
for (const n of nameList) {
  const fs = new Set(forms(n).filter((f) => words.has(f)));
  for (const f of fs) { const prev = formsOf.get(f); if (prev) { for (const x of fs) prev.add(x); } else formsOf.set(f, new Set(fs)); }
}
/** Формы имени, к которому относится слово запроса, иначе null. */
function nameOf(word: string): Set<string> | null {
  return formsOf.get(norm(word)) ?? null;
}

const rows = readFileSync(join(ROOT, 'tools', 'bible', 'synodal.tsv'), 'utf8').split('\n').map((l) => l.split('\t')).filter((r) => r.length > 1);
let t0 = performance.now();
const raw = rows.map((r) => norm(r[r.length - 1]));
const cache = new Map<string, string>();
const words_ = raw.map((v) => new Set(v.split(/[^а-я-]+/).filter(Boolean)));
const stems = raw.map((v) => new Set(v.split(/[^а-я-]+/).filter(Boolean).map((w) => cache.get(w) ?? (cache.set(w, stem(w)), cache.get(w)!))));
const cold = performance.now() - t0;
console.log(`имён в базе (первые слова форм): ${nameList.length}; стихов ${raw.length}; холодный старт (разбор и основы): ${cold.toFixed(0)} мс на этой машине`);

function search(q: string[]): number {
  const preds = q.map((w) => {
    const fs = nameOf(w);
    if (fs) return (i: number) => [...words_[i]].some((x) => fs.has(x));
    const s = stem(norm(w));
    if (s.length < 3) { const x = norm(w); return (i: number) => raw[i].split(/[^а-я-]+/).includes(x); }
    return (i: number) => stems[i].has(s);
  });
  let n = 0;
  for (let i = 0; i < raw.length; i++) if (preds.every((p) => p(i))) n++;
  return n;
}

console.log('\nэталон (решение координатора № 3): запрос → стихов');
for (const q of [['Ной'], ['Лия'], ['Илия'], ['Моисей'], ['Моисея'], ['пять', 'хлебов'], ['ковчег'], ['пята']]) {
  const t = performance.now();
  let n = 0;
  for (let k = 0; k < 10; k++) n = search(q);
  console.log(`  ${q.join(' ')} → ${n}; ${((performance.now() - t) / 10).toFixed(1)} мс на запрос`);
}

// Сверка с эталоном координатора: его числа (43, 32, 113, 816) — сумма по формам; стихов (без повторов) меньше,
// потому что в одном стихе бывает две формы имени.
console.log('\nсверка: формы рецензента → стихов без повторов / сумма по формам');
for (const [n, fs] of [['Ной', ['ной', 'ноя', 'ною', 'ноем']], ['Лия', ['лия', 'лии', 'лию', 'лиею']], ['Илия', ['илия', 'илии', 'илию', 'илиею']], ['Моисей', ['моисей', 'моисея', 'моисею', 'моисеем']]] as const) {
  const dist = words_.filter((v) => fs.some((f) => v.has(f))).length;
  const sum = fs.reduce((k, f) => k + words_.filter((v) => v.has(f)).length, 0);
  const our = [...(formsOf.get(fs[0]) ?? [])].sort().join(', ');
  console.log(`  ${n}: ${dist} / ${sum}; словарь форм сборки: ${our}`);
}
