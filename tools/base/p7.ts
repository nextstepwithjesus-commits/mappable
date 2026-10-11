/**
 * Проба П7 (11 § 12.2): согласие двух разметок историй — границы, виды, участники, связи, покрытие.
 *
 *   npx tsx tools/base/p7.ts                 замер на том, что есть: data/stories против разметки шага 0
 *                                            (prototypes/шаг-0/данные) на Мк 1–3 и Быт 1–11
 *   npx tsx tools/base/p7.ts --json          то же, числа в JSON
 *
 * Меры (пороги записаны до пробы, 11 § 12.2):
 *   - границы — каппа Коэна по стихам с метками «начинает историю (или класс „вне историй“) / начинает часть / продолжение»;
 *   - сегментация — WindowDiff по границам историй (для справки, порог ≤ 0,2);
 *   - доля границ историй, совпавших точно и с допуском ±1 стих (вместо boundary similarity — см. отчёт);
 *   - вид — каппа на историях, которые обе разметки начинают в одном стихе;
 *   - завязка и развязка — доля историй, где оба указали один стих (±1); нужно поле у обеих разметок;
 *   - участники — F1 по парам «история — лицо — роль»; связи — F1 по парам «история — стих — вид ссылки»;
 *   - покрытие — доля стихов отрывка с классом.
 * Каппа считается функцией tools/base/kappa.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kappa } from './kappa.ts';
import { loadBible } from '../bible.ts';
import { parseRef, verseId } from '../../src/engine/books.ts';
import { loadStorySources } from './stories.ts';
import type { Story, VerseClass } from './types.ts';

const ROOT = join(import.meta.dirname, '..', '..');

/** Единица разметки в общем виде: отрезки стихов в отрывке, первые стихи частей, вид, завязка и развязка. */
export interface Unit {
  key: string;
  title?: string;
  segs: string[][];
  parts: string[];
  kind?: string;
  setup?: string;
  resolution?: string;
  isClass?: boolean;
}
export interface Markup { name: string; units: Unit[] }

const bible = loadBible();
const verses = (ref: string) => {
  const p = parseRef(ref, bible.chapterLength);
  return p && !p.chapterOnly ? p.verses.map(verseId) : [];
};

/** Все стихи отрывка «Мк 1-3» (главы подряд). */
export function rangeVerses(book: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let c = from; c <= to; c++) for (let v = 1; v <= bible.chapterLength(book, c); v++) out.push(`${book} ${c}:${v}`);
  return out;
}

/** Метки стихов: S — начало истории или класса, P — начало части, C — продолжение. */
export function labels(m: Markup, range: string[]): string[] {
  const inR = new Set(range);
  const S = new Set<string>();
  const P = new Set<string>();
  for (const u of m.units) {
    for (const seg of u.segs) if (seg.length && inR.has(seg[0])) S.add(seg[0]);
    for (const p of u.parts) if (inR.has(p)) P.add(p);
  }
  return range.map((v) => (S.has(v) ? 'S' : P.has(v) ? 'P' : 'C'));
}

/** WindowDiff (Pevzner, Hearst 2002) по границам историй: ref — эталонная разметка, hyp — сравниваемая. */
export function windowDiff(ref: string[], hyp: string[]): number {
  const b = (ls: string[]): number[] => ls.map((l) => (l === 'S' ? 1 : 0));
  const r = b(ref);
  const h = b(hyp);
  const segs = r.reduce((n, x) => n + x, 0) || 1;
  const k = Math.max(1, Math.round(r.length / (2 * segs)));
  let miss = 0;
  for (let i = 0; i + k < r.length; i++) {
    const cr = r.slice(i + 1, i + k + 1).reduce((n, x) => n + x, 0);
    const ch = h.slice(i + 1, i + k + 1).reduce((n, x) => n + x, 0);
    if (cr !== ch) miss++;
  }
  return miss / Math.max(1, r.length - k);
}

/** Доля границ историй A, которые есть у B точно и с допуском ±1 стих. */
export function boundaryHits(a: string[], b: string[]) {
  const ia = a.flatMap((l, i) => (l === 'S' ? [i] : []));
  const ib = new Set(b.flatMap((l, i) => (l === 'S' ? [i] : [])));
  const exact = ia.filter((i) => ib.has(i)).length;
  const near = ia.filter((i) => ib.has(i) || ib.has(i - 1) || ib.has(i + 1)).length;
  return { total: ia.length, exact, near };
}

export function f1<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size && !b.size) return NaN;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return (2 * both) / (a.size + b.size);
}

export function compareMarkups(A: Markup, B: Markup, range: string[]) {
  const la = labels(A, range);
  const lb = labels(B, range);
  const startsA = new Map(A.units.filter((u) => !u.isClass).map((u) => [u.segs[0]?.[0], u]));
  const startsB = new Map(B.units.filter((u) => !u.isClass).map((u) => [u.segs[0]?.[0], u]));
  const both = [...startsA.keys()].filter((k) => k && startsB.has(k) && range.includes(k));
  const kinds = both.filter((k) => startsA.get(k)!.kind && startsB.get(k)!.kind).map((k) => [startsA.get(k)!.kind!, startsB.get(k)!.kind!] as [string, string]);
  const sr = both.filter((k) => startsA.get(k)!.setup && startsB.get(k)!.setup);
  const near = (x?: string, y?: string) => {
    if (!x || !y) return false;
    const ix = range.indexOf(x);
    const iy = range.indexOf(y);
    return ix >= 0 && iy >= 0 && Math.abs(ix - iy) <= 1;
  };
  const srAgree = sr.filter((k) => near(startsA.get(k)!.setup, startsB.get(k)!.setup) && near(startsA.get(k)!.resolution, startsB.get(k)!.resolution)).length;
  const covered = (m: Markup) => {
    const s = new Set(m.units.flatMap((u) => u.segs.flat()));
    return range.filter((v) => s.has(v)).length / range.length;
  };
  return {
    verses: range.length,
    storiesA: A.units.filter((u) => !u.isClass && u.segs.some((s) => range.includes(s[0]))).length,
    storiesB: B.units.filter((u) => !u.isClass && u.segs.some((s) => range.includes(s[0]))).length,
    kappaBoundary: kappa(la.map((x, i) => [x, lb[i]] as [string, string])),
    kappaStoryOnly: kappa(la.map((x, i) => [x === 'S' ? 'S' : '-', lb[i] === 'S' ? 'S' : '-'] as [string, string])),
    windowDiffAB: windowDiff(la, lb),
    windowDiffBA: windowDiff(lb, la),
    hitsAinB: boundaryHits(la, lb),
    hitsBinA: boundaryHits(lb, la),
    kindPairs: kinds.length,
    kappaKind: kinds.length ? kappa(kinds) : NaN,
    kindDisagree: kinds.filter(([x, y]) => x !== y).length,
    setupPairs: sr.length,
    setupAgree: sr.length ? srAgree / sr.length : NaN,
    coverageA: covered(A),
    coverageB: covered(B),
    disagreements: range.flatMap((v, i) => (la[i] !== lb[i] ? [`${v}: ${la[i]}/${lb[i]}`] : [])),
  };
}

// ---------- разметки ----------

/** Разметка data/stories (наша) на отрывке. */
export function fromStories(stories: Story[], classes: VerseClass[], name = 'data/stories'): Markup {
  const units: Unit[] = [];
  for (const s of stories) {
    if (s.level !== 'story') continue;
    for (const a of s.accounts) {
      units.push({
        key: `${s.id}@${a.refs[0]}`, title: s.title.short,
        segs: a.refs.map(verses),
        parts: (s.parts ?? []).filter((p) => p.n > 1).map((p) => p.refs.map(verses).flat()[0]).filter(Boolean),
        kind: s.kind, setup: s.boundary?.[0]?.start, resolution: s.boundary?.[0]?.end,
      });
    }
  }
  for (const c of classes) units.push({ key: `class:${c.book} ${c.ch}:${c.from}`, segs: [verses(`${c.book} ${c.ch}:${c.from}-${c.to}`)], parts: [], isClass: true });
  return { name, units };
}

const STEP0_KIND: Record<string, string> = {
  'событие': 'event', 'родословие': 'genealogy', 'известие': 'notice', 'сводка': 'summary', 'речь': 'speech', 'беседа': 'speech',
  'видение': 'vision', 'сон': 'dream', 'притча': 'parable', 'рассказ Иисуса': 'jesus-story', 'песнь': 'song', 'молитва': 'prayer',
};

/** Разметка шага 0 (prototypes/шаг-0/данные/*.json): истории, части, виды; завязки и развязки полем у неё нет. */
export function fromStep0(file: string): Markup {
  const d = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  const units: Unit[] = (d['истории'] as any[]).map((h) => ({
    key: `${file}#${h['номер']}`, title: h['название'],
    segs: (h['стихи'] as string[]).map(verses),
    parts: ((h['части'] ?? []) as [string, string][]).slice(1).map(([r]) => verses(r)[0]).filter(Boolean),
    kind: STEP0_KIND[h['вид']] ?? h['вид'],
  }));
  for (const c of d['вне_историй'] ?? []) units.push({ key: `class:${c['стихи']}`, segs: [verses(c['стихи'])], parts: [], isClass: true });
  return { name: file, units };
}

/** Участники и связи одной истории у шага 0 (страница «Ной и потоп») — для F1 по парам. */
export function step0NoahPairs() {
  const d = JSON.parse(readFileSync(join(ROOT, 'prototypes/шаг-0/данные/ной-и-потоп.json'), 'utf8'));
  const role: Record<string, string> = { 'действует': 'acts', 'говорит': 'speaks', 'к нему обращаются': 'addressed', 'претерпевает': 'suffers', 'упомянут': 'mentioned' };
  const actors = new Set<string>(['god|participant']);
  for (const c of d['кто_в_истории']['карточки']) actors.add(`${NOAH_ALIAS[c.id ?? c['имя']] ?? c.id ?? c['имя']}|${ROLE(role[c['роль']] ?? c['роль'])}`);
  const kind: Record<string, string> = { 'пересказ': 'retelling', 'упоминания': 'mention', 'намёк': 'allusion', 'спорное_только_второй_слой': 'possibly-same', 'в_той_же_книге_второй_слой': 'mention' };
  const links = new Set<string>();
  for (const [k, v] of Object.entries<any>(d['где_об_этом'])) {
    const xs = Array.isArray(v) ? v : v?.['места'] ?? [];
    for (const x of xs) if (x['стихи'] && kind[k]) links.add(`${x['стихи']}|${kind[k]}`);
  }
  return { actors, links };
}

/** Роли «действует» и «говорит» сведены в «участник» (решение координатора по второму ключу, п. 8). */
const ROLE = (r: string) => (r === 'acts' || r === 'speaks' ? 'participant' : r);

/** Сведение лиц: у шага 0 сыновья и звери — по одной строке, у нас — Сим, Хам, Иафет и группа. */
const NOAH_ALIAS: Record<string, string> = {
  'p-sim': 'сыновья', 'p-kham': 'сыновья', 'p-iafet': 'сыновья', 'сыновья Ноя: Сим, Хам, Иафет': 'сыновья',
  'new:zhena-noya': 'жена', 'жена Ноя': 'жена', 'new:zheny-synovey-noya': 'жёны', 'жёны сыновей Ноя': 'жёны',
  'new:zveri-v-kovchege': 'звери', 'звери, скот, гады и птицы': 'звери', 'new:voron-noya': 'ворон', 'ворон': 'ворон', 'new:golub-noya': 'голубь', 'голубь': 'голубь',
};

export function oursNoahPairs(stories: Story[]) {
  const s = stories.find((x) => x.id === 'e-noy-i-potop')!;
  const actors = new Set(s.actors.map((a) => `${NOAH_ALIAS[a.actor] ?? a.actor}|${ROLE(a.role)}`));
  const links = new Set(s.links.map((l) => `${l.refs[0]}|${l.kind}`));
  return { actors, links };
}

export function report() {
  const src = loadStorySources();
  const ours = fromStories(src.stories, src.classes);
  const out: Record<string, unknown> = {};
  const passages: [string, string, number, number, string][] = [
    ['Мк 1–3 (отрывок П7)', 'Мк', 1, 3, 'prototypes/шаг-0/данные/марк-1-3.json'],
    ['Быт 1–11 (книга прототипа)', 'Быт', 1, 11, 'prototypes/шаг-0/данные/бытие.json'],
  ];
  for (const [name, book, a, b, file] of passages) out[name] = compareMarkups(ours, fromStep0(file), rangeVerses(book, a, b));
  const o = oursNoahPairs(src.stories);
  const s = step0NoahPairs();
  out['Ной и потоп: участники и связи'] = {
    actorsOurs: [...o.actors], actorsStep0: [...s.actors], f1Actors: f1(o.actors, s.actors),
    linksOurs: o.links.size, linksStep0: s.links.size, f1Links: f1(o.links, s.links),
    linksOnlyOurs: [...o.links].filter((x) => !s.links.has(x)), linksOnlyStep0: [...s.links].filter((x) => !o.links.has(x)),
  };
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = report();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    const f = (x: unknown) => (typeof x === 'number' ? (Number.isNaN(x) ? '—' : x.toFixed(2)) : JSON.stringify(x));
    for (const [k, v] of Object.entries<any>(r)) {
      console.log(`== ${k}`);
      for (const [m, x] of Object.entries<any>(v)) console.log(`  ${m}: ${Array.isArray(x) ? `${x.length}: ${x.slice(0, 40).join('; ')}` : f(x)}`);
    }
  }
}
