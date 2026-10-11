/**
 * Опись сцен показа владельцу (10 ред. 2, § 3.3) и нагрузка второго ключа — через сам допуск (tools/base/admit.ts).
 *
 * Запуск из корня: npx tsx docs/app/data/10-составитель/опись.ts [--keys <номер сцены>]
 * Обычно его вызывает python3 -I docs/app/data/10-числа.py. Ничего не пишет.
 *
 * Сцена здесь — предварительная опись по главам: какие записи базы сцена покажет. Окончательную опись (адрес → ключи)
 * строит прототип при прогоне сценария показа (10 § 3.3); этот скрипт — оценка до прототипа.
 * «к подписи» = замыкание по зависимостям допуска (09 § 5.2 п. 6) без карантина и без уже подписанного.
 */
import { loadBase } from '../../../../tools/base/validate.ts';
import { records, admission, recordVerses, type Rec } from '../../../../tools/base/admit.ts';

const base: any = loadBase();
const recs = records(base);
const byKey = new Map(recs.map((r) => [r.key, r]));
const adm = admission(base, 'release');
const st = (k: string) => adm.status.get(k)?.status;

const ids = (r: Rec): string[] => {
  const x: any = r.rec;
  switch (r.coll) {
    case 'actor': return [x.id];
    case 'fact': return [(r as any).parent.id];
    case 'origin': return [x.child, x.parent].filter(Boolean);
    case 'union': return [x.husband, x.wife].filter(Boolean);
    case 'kin': return [x.from, x.to];
    case 'nodata': case 'chrono': case 'membership': return [x.actor];
    case 'epoch': return [x.startRule?.person, x.endRule?.person].filter(Boolean);
    default: return [];
  }
};

// стихи записи — один раз
const verses = new Map<string, { book: string; chapter: number; verse: number }[]>();
const vOf = (r: Rec) => {
  if (!verses.has(r.key)) verses.set(r.key, recordVerses(r.coll === 'actor' ? { names: (r.rec as any).names } : r.rec));
  return verses.get(r.key)!;
};

type Range = [book: string, ch1: number, v1: number, ch2: number, v2: number];
const R = (s: string): Range[] =>
  s.split(';').map((p) => {
    const m = /^\s*(\S+) (\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?\s*$/.exec(p);
    if (!m) throw new Error('адрес: ' + p);
    const [, b, c1, v1, c2or, v2] = m;
    if (v1 === undefined) return [b, +c1, 1, c2or ? +c2or : +c1, 999];
    if (v2 !== undefined) return [b, +c1, +v1, +c2or, +v2];
    return [b, +c1, +v1, +c1, c2or ? +c2or : +v1];
  });
const inR = (v: { book: string; chapter: number; verse: number }, rs: Range[]) =>
  rs.some(([b, c1, v1, c2, v2]) => v.book === b && (v.chapter > c1 || (v.chapter === c1 && v.verse >= v1)) && (v.chapter < c2 || (v.chapter === c2 && v.verse <= v2)));

// участник отрезка: у лица есть стих в отрезке — в имени, утверждении или ребре, где лицо — ребёнок
const ownRecs = new Map<string, Rec[]>();
for (const r of recs) {
  const x: any = r.rec;
  const who = r.coll === 'actor' ? x.id : r.coll === 'fact' ? (r as any).parent.id : r.coll === 'origin' ? x.child : null;
  if (who) (ownRecs.get(who) ?? ownRecs.set(who, []).get(who)!).push(r);
}
const participants = (rs: Range[]) => {
  const out = new Set<string>();
  for (const [a, list] of ownRecs) if (list.some((r) => vOf(r).some((v) => inR(v, rs)))) out.add(a);
  return out;
};

const children = (p: string) => new Set<string>(base.origins.filter((o: any) => o.parent === p).map((o: any) => o.child));
const lineKeys = Object.keys(base.lines).map((k) => `line:${k}`);

function closure(sel: string[]) {
  const clo = new Set<string>();
  const stack = [...sel];
  while (stack.length) {
    const k = stack.pop()!;
    if (clo.has(k)) continue;
    clo.add(k);
    const r = byKey.get(k);
    if (r) stack.push(...r.deps);
  }
  return clo;
}

interface Scene { id: string; pack: string; name: string; where: string; keys: string[]; note?: string }
const scenes: Scene[] = [];
const G = new Set(['actor', 'origin', 'union', 'kin']);

function pick(people: Set<string>, colls: Set<string> | null, touch: boolean) {
  const sel: string[] = [];
  for (const r of recs) {
    if (colls && !colls.has(r.coll)) continue;
    const a = ids(r);
    if (!a.length || r.coll === 'line') continue;
    const ok = ['origin', 'union', 'kin'].includes(r.coll) && !touch ? a.every((i) => people.has(i)) : a.some((i) => people.has(i));
    if (ok) sel.push(r.key);
  }
  return sel;
}
const story = (id: string, pack: string, name: string, where: string, note?: string) =>
  scenes.push({ id, pack, name, where, keys: [...participants(R(where))].map((a) => `actor:${a}`), note });
const card = (id: string, pack: string, name: string, pid: string) => scenes.push({ id, pack, name, where: pid, keys: pick(new Set([pid]), null, true) });
const gen = (id: string, pack: string, name: string, people: Set<string>, extra: string[] = []) =>
  scenes.push({ id, pack, name, where: `${people.size} лиц`, keys: [...pick(people, G, false), ...extra] });

// ---------- пакет 1: Истории и Время (08 § 10.2; 11 § 7.4; 04 § 3.9) ----------
story('1.1', '1', 'Каталог Бытия (главы 1–11) — фильтр «Лицо»', 'Быт 1-11');
story('1.2', '1', 'Каталог Мк 1–3', 'Мк 1-3');
story('1.3', '1', 'Ной и потоп', 'Быт 6:9-9:29');
story('1.4', '1', 'Расслабленного спускают через кровлю (три рассказа)', 'Мк 2:1-12; Мф 9:1-8; Лк 5:17-26');
story('1.5', '1', 'Савл на пути в Дамаск (рассказ и два пересказа)', 'Деян 9:1-19; Деян 22:3-16; Деян 26:9-18');
story('1.6', '1', 'Пять хлебов и две рыбы (четыре рассказа)', 'Мф 14:13-21; Мк 6:30-44; Лк 9:10-17; Ин 6:1-14');
card('1.7', '1', 'Карточка Ноя (переход со страницы повествования, 11 § 7.4 п. 7)', 'p-noy');
story('1.8', '1', 'Глава Быт 7', 'Быт 7');
story('1.9', '1', 'Давид и Голиаф и строка о 2 Цар 21:19', '1Цар 17; 2Цар 21:19');
story('1.10', '1', 'Умер Самуил', '1Цар 25:1');
story('1.11', '1', 'Послание Иакова — «Упоминается здесь»', 'Иак 1-5');
story('1.12', '1', 'Параллельные тексты Ис 2 и Мих 4', 'Ис 2:1-5; Мих 4:1-5');
story('1.13', '1', 'Спорное сравнение Ин 2 и Мк 11', 'Ин 2:13-22; Мк 11:15-18');
{
  const jl: string[] = base.lines.joseph.persons.map((p: any) => p.id);
  const chain = new Set<string>([...jl.slice(0, jl.indexOf('p-avraam') + 1), ...children('p-noy')]);
  const sel = pick(chain, new Set(['actor', 'chrono']), false);
  const ep = base.epochs.slice(0, 5).map((e: any) => `epoch:${e.id}`);
  scenes.push({ id: '1.14', pack: '1', name: 'Время: Ной и потоп, эпохи 1–5, Адам — Аврам', where: 'Быт 5; 11; эпохи 1–5', keys: [...sel, ...ep] });
}
{
  const p = participants(R('Исх 12-15'));
  scenes.push({ id: '1.15', pack: '1', name: 'Время: Исход', where: 'Исх 12-15', keys: pick(p, new Set(['actor', 'chrono']), false) });
  const k = participants(R('4Цар 15-18'));
  scenes.push({ id: '1.16', pack: '1', name: 'Время: цари 4 Цар 15–18 («Правители»)', where: '4Цар 15-18', keys: pick(k, new Set(['actor', 'chrono']), false) });
}

// ---------- пакет 2: География и Генеалогия ----------
gen('2.1', '2', 'Авраам и три союза', new Set(['p-avraam', 'p-sarra', 'p-agar', 'p-khettura', ...children('p-avraam')]));
{
  const ik = new Set<string>(['p-iakov', ...children('p-iakov')]);
  for (const o of base.origins) if (children('p-iakov').has(o.child) && o.role === 'mother') ik.add(o.parent);
  gen('2.2', '2', 'Иаков и двенадцать сыновей (с матерями)', ik);
}
{
  const lp = new Set<string>();
  for (const k of Object.keys(base.lines)) for (const p of base.lines[k].persons) lp.add(p.id);
  gen('2.3', '2', 'Линии Мессии (обе линии целиком, с наборами прочтений)', lp, lineKeys);
}
story('2.4', '2', 'Путь Авраама — лица (места — в 10-числа.py по OpenBible)', 'Быт 11:27-25:10');
story('2.5', '2', 'Переход Чермного моря — лица', 'Исх 13:17-15:21');

// ---------- пакет 3: Связи и Карточка ----------
for (const [i, n, p] of [
  ['3.1', 'Карточка Давида', 'p-david'], ['3.2', 'Карточка Ирада', 'p-irad'], ['3.3', 'Карточка Уца', 'p-uts-syn-nakhora'],
  ['3.4', 'Карточка Сарры', 'p-sarra'], ['3.5', 'Карточка Илы', 'p-ila-syn-vaasy'], ['3.6', 'Карточка Илия, сына Матфата', 'p-iliy-syn-matfata'],
] as const) card(i, '3', n, p);
{
  const zak = new Set<string>(base.volumes.flatMap((v: any) => v.actors).map((a: any) => a.id).filter((i: string) => i.startsWith('p-zakhariya')));
  scenes.push({ id: '3.7', pack: '3', name: 'Захария — тёзки (строка каждого: лицо, уточнение, родители)', where: `${zak.size} лиц`, keys: pick(zak, new Set(['actor', 'origin']), true) });
}
story('3.8', '3', 'Связи, серия А: Давид и Саул — лица (связей в базе нет)', '1Цар 16-31');
story('3.9', '3', 'Связи, серия Б: Илия и Ахав — лица', '3Цар 16:29-22:40');
story('3.10', '3', 'Матрица Есфири — лица', 'Есф 1-10');

// ---------- бумажная проба Т1 (08 § 10.4; 03 П10) ----------
gen('Т1', 'Т1', 'Семья Ноя', new Set(['p-noy', ...children('p-noy')]));
{
  const m = pick(new Set(['p-manassiya']), new Set(['union']), true);
  scenes.push({ id: 'Т1б', pack: 'Т1', name: 'Союзы Манассии (03 П10)', where: 'p-manassiya', keys: m.length ? [...m] : [] , note: m.length ? undefined : 'союза у p-manassiya нет — уточнить сцену 03 П10' });
}

// ---------- вывод ----------
const want = process.argv.indexOf('--keys');
if (want > 0) {
  const s = scenes.find((x) => x.id === process.argv[want + 1]);
  if (!s) throw new Error('нет сцены');
  for (const k of [...closure(s.keys)].sort()) console.log(k, st(k));
  process.exit(0);
}

const row = (s: Scene) => {
  const clo = closure(s.keys);
  const own = s.keys.length;
  const ownUn = s.keys.filter((k) => st(k) === 'draft').length;
  const dep = [...clo].filter((k) => !s.keys.includes(k));
  const toSign = [...clo].filter((k) => st(k) === 'draft');
  const quar = [...clo].filter((k) => st(k) === 'quarantine');
  const rights = [...clo].filter((k) => adm.rights.has(k));
  const okNow = s.keys.filter((k) => adm.okKey(k)).length;
  return { own, ownUn, dep: dep.length, toSign, quar: quar.length, rights: rights.length, okNow, clo };
};

console.log('== A. Опись сцен показа (предварительная, по главам): в сцене / из них не подписано; зависимости; к подписи с зависимостями; карантин; права; допущено сейчас');
const packTotals = new Map<string, Set<string>>();
for (const s of scenes) {
  const r = row(s);
  const set = packTotals.get(s.pack) ?? packTotals.set(s.pack, new Set()).get(s.pack)!;
  r.toSign.forEach((k) => set.add(k));
  console.log(`  ${s.id} ${s.name} [${s.where}]: в сцене ${r.own} / не подп. ${r.ownUn}; зависимостей ${r.dep}; к подписи ${r.toSign.length}; карантин ${r.quar}; права ${r.rights}; допущено ${r.okNow}${s.note ? ' — ' + s.note : ''}`);
}
console.log('  к подписи по пакетам (без повторов внутри пакета):');
for (const [p, set] of packTotals) {
  const by: Record<string, number> = {};
  for (const k of set) by[k.split(':')[0]] = (by[k.split(':')[0]] || 0) + 1;
  const vv = [...set].reduce((acc, k) => acc + (byKey.get(k) ? vOf(byKey.get(k)!).length : 0), 0);
  console.log(`    пакет ${p}: ${set.size}; стихов в них ${vv} (${Object.entries(by).map(([c, n]) => `${c} ${n}`).join(', ')})`);
}
{
  const allg = new Set<string>(base.volumes.flatMap((v: any) => v.actors).filter((a: any) => a.kind === 'human').map((a: any) => a.id));
  const s = { id: '—', pack: '—', name: 'Весь лес (обзор; не сцена показа — плашка «проба»)', where: '', keys: pick(allg, G, false) };
  const r = row(s);
  console.log(`  обзор «Весь лес»: в сцене ${r.own} / не подп. ${r.ownUn}; к подписи с зависимостями ${r.toSign.length}`);
}

console.log('\n== B. Нагрузка второго ключа на всю нынешнюю базу: записи «черновик» по видам, их стихи');
const by = new Map<string, { n: number; v: number; zero: number }>();
for (const r of recs) {
  if (st(r.key) !== 'draft') continue;
  const e = by.get(r.coll) ?? by.set(r.coll, { n: 0, v: 0, zero: 0 }).get(r.coll)!;
  const n = vOf(r).length;
  e.n++; e.v += n; if (!n) e.zero++;
}
let tn = 0, tv = 0;
for (const [c, e] of by) {
  tn += e.n; tv += e.v;
  console.log(`  ${c}: записей ${e.n}; стихов ${e.v} (в среднем ${(e.v / e.n).toFixed(1)}); без стихов ${e.zero}`);
}
console.log(`  всего черновиков ${tn}; стихов ${tv}; карантин ${recs.filter((r) => st(r.key) === 'quarantine').length}; подписано ${recs.filter((r) => st(r.key) === 'checked').length}; ключей допуска ${recs.length}`);
{
  const signed = recs.filter((r) => st(r.key) === 'checked');
  const sv = signed.reduce((a, r) => a + vOf(r).length, 0);
  console.log(`  контрольный набор для сравнения (не темп): подписано ${signed.length} записей, стихов в них ${sv}`);
}
const shared = base.origins.filter((o: any) => o.refsShared).length;
console.log(`  рёбер с общими стихами отца и матери (refsShared): ${shared}; рёбер всего ${base.origins.length}; рёбер с номером: ${base.origins.filter((o: any) => o.id).length}`);
const fids = recs.filter((r) => r.coll === 'fact').length;
console.log(`  утверждений ${fids}; с номером: ${recs.filter((r) => r.coll === 'fact' && (r.rec as any).id).length}`);
const sig = (base.checks ?? []) as any[];
const bySig: Record<string, number> = {};
for (const c of sig) bySig[c.key.split(':')[0]] = (bySig[c.key.split(':')[0]] || 0) + 1;
console.log(`  подписи, которые снимет номер у ребра и утверждения: origin ${bySig.origin || 0} + fact ${bySig.fact || 0} = ${(bySig.origin || 0) + (bySig.fact || 0)}`);
const disamb = base.volumes.flatMap((v: any) => v.actors);
const names = new Map<string, number>();
for (const a of disamb) { const m = a.names?.find((n: any) => n.type === 'main')?.form; if (m) names.set(m, (names.get(m) || 0) + 1); }
const tz = disamb.filter((a: any) => (names.get(a.names?.find((n: any) => n.type === 'main')?.form) || 0) > 1);
console.log(`  лиц с тёзками (одно основное имя у двух и больше): ${tz.length}`);
