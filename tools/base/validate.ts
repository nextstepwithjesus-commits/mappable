/**
 * Проверка базы «Библии наглядно» (docs/app/02-ДАННЫЕ.md, § 7).
 *
 *   npx tsx tools/base/validate.ts           проверить base/ на диске
 *   npx tsx tools/base/validate.ts --fresh   собрать базу в памяти из прежних данных и проверить её
 *
 * Ошибки останавливают сборку. Замечания — список работы для составителей и сверщиков (этапы Д2–Д3).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadBible } from '../bible.ts';
import { parseRef, verseId } from '../../src/engine/books.ts';
import { norm, nameMatcher } from '../../src/engine/text.ts';
import { scriptureText } from './brackets.ts';
import type { Base } from './migrate.ts';
import type { Actor, Cert, Prov } from './types.ts';
import { admission, loadChecks, validateChecks } from './admit.ts';
import { checkSourceIssues, issuesAt, KIND_WORD } from './source-issues.ts';
import { namedVerses, ownRefs } from './own-verses.ts';
import { validateRegistry } from './sources.ts';

export interface Issue { level: 'error' | 'warn'; check: string; where: string; msg: string }

/** Слова обозначений союза по видам (02 § 3.2): слово текста должно подходить к виду и стоять в стихе (шаги C32–C35). */
export const UNION_WORDS: Record<string, string[]> = {
  marriage: ['жена', 'муж', 'женился', 'взял', 'в замужество', 'как деверь'],
  concubine: ['наложница'],
  'maid-as-wife': ['в жену', 'служанка'],
  redemption: [],
  'non-marital': ['вошел к ней'],
  'not-stated': [],
};

/**
 * Слово обозначения стоит в тексте стиха: несколько слов — подряд, одно слово — по основе с начала слова
 * («жена» — «женою», «жен»; «наложница» — «наложницею»). Текст — основной (без скобок, `scriptureText`).
 */
export function unionWordIn(word: string, text: string): boolean {
  const c = (t: string) => ` ${norm(t).replace(/[«»"„“”'’`.,;:!?()\-–—…]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const w = c(word).trim();
  const t = c(text);
  if (w.includes(' ')) return t.includes(` ${w} `);
  const stem = w.length > 4 ? w.slice(0, w.length - 2) : w.length === 4 ? w.slice(0, 3) : w;
  return t.includes(` ${stem}`);
}

const ROOT = join(import.meta.dirname, '..', '..');
const CERTS = new Set<Cert>(['scripture', 'inference', 'interpretation', 'calc', 'reference']);

export function loadBase(dir = join(ROOT, 'base')): Base {
  // происхождение каждого файла хранится: статус записи без своего prov берётся у файла (02 § 3.1; Д-база, Б-1, п. 3)
  const files: Record<string, Prov> = {};
  // источники записей файла по умолчанию (09 § 5.5; Д3-3): как prov — у файла значение, у записи уточнение
  const fileSources: Record<string, string[]> = {};
  const read = (rel: string) => {
    const j = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
    if (j.prov) files[rel] = j.prov;
    if (j.sources !== undefined) fileSources[rel] = j.sources;
    return j;
  };
  const items = (f: string) => read(f).items;
  const volumes = readdirSync(join(dir, 'actors')).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const v = read(`actors/${f}`);
    return { vol: v.vol, file: f, title: v.title, scope: v.scope, actors: v.items };
  });
  const lines: Record<string, any> = {};
  for (const f of readdirSync(join(dir, 'lines')).filter((f) => f.endsWith('.json')).sort()) {
    const { schema: _s, prov: _p, sources: _src, ...l } = read(`lines/${f}`);
    lines[f.replace(/\.json$/, '')] = l;
  }
  const { schema: _s, title: _t, prov: _p, ...anchors } = read('anchors.json');
  return {
    volumes, lines, anchors,
    unions: items('unions.json'), origins: items('origins.json'), kin: items('kin.json'), readings: items('readings.json'),
    areas: items('areas.json'), memberships: items('memberships.json'), chrono: items('chrono.json'), nodata: items('nodata.json'),
    redirects: items('redirects.json'), corrections: items('corrections.json'), epochs: items('epochs.json'),
    files, fileSources,
    sources: existsSync(join(dir, 'sources.json')) ? items('sources.json') : [],
    checks: loadChecks(dir),
  };
}

export function validate(base: Base): Issue[] {
  const issues: Issue[] = [];
  const err = (check: string, where: string, msg: string) => issues.push({ level: 'error', check, where, msg });
  const warn = (check: string, where: string, msg: string) => issues.push({ level: 'warn', check, where, msg });
  const bible = loadBible();

  // ---------- стихи ----------
  const verseCache = new Map<string, string[] | null>();
  /** Тексты стихов ссылки; null — ссылка неверна (ошибка записана). */
  const texts = (where: string, ref: string): string[] | null => {
    if (verseCache.has(ref)) return verseCache.get(ref)!;
    const p = parseRef(ref, bible.chapterLength);
    let out: string[] | null = null;
    if (!p) err('стих', where, `неверная ссылка «${ref}» (книги — только 66 канонических, написание «1Пар 3:17-19»)`);
    else if (p.chapterOnly) {
      if (!bible.chapterLength(p.book, p.chapterOnly)) err('стих', where, `нет главы «${ref}»`);
      out = [];
    } else {
      out = [];
      for (const v of p.verses) {
        const t = bible.verses.get(verseId(v));
        if (t === undefined) {
          err('стих', where, `нет стиха ${verseId(v)} (из «${ref}»)`);
          out = null;
          break;
        }
        // пустой стих электронного текста (Пс 114:9): ссылка на него — ошибка с причиной из таблицы дефектов (Д3-4)
        if (!t.trim()) {
          const why = issuesAt(v.book, v.chapter, v.verse).filter((r) => r.kind === 'empty' || r.kind === 'merge');
          err('дефект текста', where, `стих ${verseId(v)} (из «${ref}») пуст в электронном тексте` +
            (why.length ? `: ${why.map((r) => `${KIND_WORD[r.kind]} — ${r.what}`).join('; ')}` : ' и не записан в tools/bible/source-issues.tsv'));
        }
        out.push(t);
      }
    }
    verseCache.set(ref, out);
    return out;
  };
  // текст стиха, на который можно опираться (02 § 3.8; решение совета R10): слова вне скобок — квадратных и круглых —
  // и слова проверенных вручную пояснений самого текста и повреждений (tools/bible/brackets.tsv); по каждому стиху
  // отдельно, до склейки — отрезки через несколько стихов (Суд 20:27–28; Притч 29:6–27) делятся по стихам таблицей
  const mainTexts = (where: string, ref: string): string[] => {
    if (!texts(where, ref)) return [];
    const p = parseRef(ref, bible.chapterLength)!;
    return p.verses.map((v) => scriptureText(v.book, v.chapter, v.verse) ?? '');
  };
  /** Текст для сравнения цитат: без знаков препинания и кавычек, пробелы схлопнуты. */
  const clean = (t: string) => norm(t).replace(/[«»"„“”'’`.,;:!?()\-–—…]/g, ' ').replace(/\s+/g, ' ').trim();
  const verseCount = (ref: string) => parseRef(ref, bible.chapterLength)?.verses.length ?? 0;

  /** Обход записи: каждая ссылка и каждая степень достоверности; «вывод» — не меньше двух стихов. */
  const walk = (where: string, v: unknown): string[] => {
    const refs: string[] = [];
    const go = (x: any) => {
      if (Array.isArray(x)) return x.forEach(go);
      if (!x || typeof x !== 'object') return;
      const own: string[] = [];
      if (Array.isArray(x.refs)) for (const r of x.refs) if (typeof r === 'string') own.push(r); else err('стих', where, `ссылка не строка: ${JSON.stringify(r)}`);
      if (typeof x.ref === 'string') own.push(x.ref);
      // § 23 «Места Писания»: первое упоминание, ключевые места, все места
      if (typeof x.first === 'string') own.push(x.first);
      for (const k of ['key', 'all']) if (Array.isArray(x[k]) && x[k].every((r: unknown) => typeof r === 'string')) own.push(...x[k]);
      for (const r of own) {
        texts(where, r);
        if (/[–—]/.test(r)) err('написание', where, `ссылка «${r}» с тире: диапазон пишется дефисом («Быт 5:3-5»)`);
      }
      refs.push(...own);
      if ('cert' in x && !CERTS.has(x.cert)) err('достоверность', where, `неизвестная степень «${x.cert}»`);
      if (x.cert === 'inference' && own.length && own.reduce((n, r) => n + verseCount(r), 0) < 2) {
        warn('вывод', where, `«вывод» опирается на один стих: ${own.join('; ')} (02, § 7: не меньше двух)`);
      }
      for (const [k, y] of Object.entries(x)) if (k !== 'refs') go(y);
    };
    go(v);
    return refs;
  };

  // ---------- номера и ссылочная целостность ----------
  const actors = new Map<string, Actor>();
  for (const vol of base.volumes) {
    for (const a of vol.actors) {
      if (!/^p-[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id)) err('номер', a.id, 'номер лица — «p-» и латиница через дефис');
      if (actors.has(a.id)) err('номер', a.id, `номер повторяется (том ${vol.file})`);
      actors.set(a.id, a);
    }
  }
  const has = (check: string, where: string, id: string | undefined) => {
    if (id && !actors.has(id)) err(check, where, `нет лица «${id}»`);
  };
  const areas = new Set(base.areas.map((a) => a.id));
  for (const a of base.areas) {
    if (!/^g-/.test(a.id)) err('номер', a.id, 'номер области — «g-»');
    has('целостность', a.id, a.founder);
    if (a.parent && !areas.has(a.parent)) err('целостность', a.id, `нет области «${a.parent}»`);
  }
  const unionIds = new Set<string>();
  for (const u of base.unions) {
    if (!/^u-/.test(u.id)) err('номер', u.id, 'номер союза — «u-»');
    if (unionIds.has(u.id)) err('номер', u.id, 'номер союза повторяется');
    unionIds.add(u.id);
    has('целостность', u.id, u.husband);
    has('целостность', u.id, u.wife);
    if (!u.terms.length) err('союз', u.id, 'союз без обозначения');
    for (const t of u.terms) {
      if (!t.refs.length) err('стих', u.id, `обозначение «${t.word ?? t.kind}» без стиха`);
      if (!(t.kind in UNION_WORDS)) err('союз', u.id, `неизвестный вид союза «${t.kind}»`);
      else if (t.word && !UNION_WORDS[t.kind].includes(t.word)) err('союз', u.id, `слово «${t.word}» не подходит к виду «${t.kind}»`);
      walk(u.id, t);
      // слово текста — из стиха (02 § 3.2; сверка Д3, № 4): хотя бы в одном стихе обозначения; стих без слова — замечание
      if (t.word) {
        const miss = t.refs.filter((r) => !unionWordIn(t.word!, mainTexts(u.id, r).join(' ')));
        if (miss.length === t.refs.length) err('слово союза', u.id, `слова «${t.word}» нет ни в одном стихе обозначения (${t.refs.join('; ')})`);
        else if (miss.length) warn('слово союза', u.id, `слова «${t.word}» нет в стихах ${miss.join('; ')}: у каждого стиха — своё обозначение (02 § 3.2)`);
      } else if (t.kind !== 'not-stated') warn('слово союза', u.id, `вид «${t.kind}» без слова текста: в стихах обозначения слова о союзе нет`);
    }
    if (actors.get(u.husband)?.sex === 'f' || actors.get(u.wife)?.sex === 'm') err('пол', u.id, 'муж и жена перепутаны');
  }
  const readings = new Map(base.readings.map((r) => [r.id, r]));
  for (const r of base.readings) {
    if (!/^r-/.test(r.id)) err('номер', r.id, 'номер набора прочтений — «r-»');
    if (!r.readings.some((x) => x.id === r.default)) err('прочтения', r.id, `прочтение по умолчанию «${r.default}» не из набора`);
    // у каждого толкования — авторы по совету источников (02 § 3.4 [R9]; R9 Г-4)
    for (const x of r.readings) if (x.cert === 'interpretation' && !x.authors?.filter((a) => a.trim()).length) err('прочтения', r.id, `у толкования «${x.id}» нет авторов (02 § 3.4, R9)`);
    walk(r.id, r);
  }
  for (const o of base.origins) {
    const w = `${o.child} ← ${o.parent ?? o.unnamedParent?.words}`;
    has('целостность', w, o.child);
    if (!o.parent && !o.unnamedParent) err('целостность', w, 'нет ни родителя, ни заместителя «не назван»');
    has('целостность', w, o.parent);
    if (!o.refs.length) err('стих', w, 'происхождение без стиха');
    walk(w, o);
    const ps = o.parent ? actors.get(o.parent)?.sex : undefined;
    if (ps && ps !== (o.role === 'father' ? 'm' : 'f')) err('пол', w, `${o.role === 'father' ? 'отец' : 'мать'} другого пола`);
    for (const id of o.skipped?.actors ?? []) has('целостность', `${w}, пропущенные`, id);
    if (o.skipped && (!o.gap || !o.skipped.refs.length)) err('пропуск', w, 'перечень пропущенных — только у ребра со знаком пропуска и со стихами, где они названы');
    if (o.reading) {
      const set = readings.get(o.reading.set);
      if (!set) err('прочтения', w, `нет набора «${o.reading.set}»`);
      else for (const r of o.reading.in) if (!set.readings.some((x) => x.id === r)) err('прочтения', w, `нет прочтения «${r}» в наборе ${set.id}`);
    }
  }
  for (const k of base.kin) {
    const w = `${k.from} — ${k.to}`;
    has('целостность', w, k.from);
    has('целостность', w, k.to);
    if (!k.refs.length) err('стих', w, 'родство без стиха');
    walk(w, k);
  }
  const groupActors = new Set([...actors.values()].filter((a) => a.kind === 'group' || a.kind === 'people' || a.kind === 'clan').map((a) => a.id));
  for (const m of base.memberships) {
    has('целостность', `членство ${m.actor}`, m.actor);
    if (!areas.has(m.area) && !groupActors.has(m.area)) err('целостность', `членство ${m.actor}`, `нет области или группы «${m.area}»`);
    if (m.basis !== 'legacy-layout' && !m.refs.length) err('стих', `членство ${m.actor}`, 'членство без стиха');
    walk(`членство ${m.actor}`, m);
  }
  for (const c of base.chrono) {
    has('целостность', `время ${c.actor}`, c.actor);
    walk(`время ${c.actor}`, c.chrono);
    const ch = c.chrono as any;
    for (const k of ['offset', 'notAfter', 'notBefore']) has('целостность', `время ${c.actor}`, ch.born?.[k]?.from);
    for (const r of ch.reign ?? []) for (const s of r.sync ?? []) has('целостность', `время ${c.actor}`, s.with);
  }
  const own = ownRefs(base);
  const ownVerses = new Map<string, Set<string>>();
  for (const n of base.nodata) {
    const w = `нет сведений ${n.actor} § ${n.sec}`;
    has('целостность', w, n.actor);
    walk(w, n);
    // прежние виды заменены нейтральным scripture-says (07 § 8.2; шаг C31)
    if (n.kind === 'stated-absent' || n.kind === 'not-applicable') err('нет сведений', w, `вид «${n.kind}» заменён на «scripture-says» со словами стиха`);
    // «Писание молчит» — со стихами, на которых держится вывод, или с пометкой «нужно чтение» (02 § 3.2; шаг C38)
    if (n.kind === 'silent') {
      if (!!n.read?.length === !!n.needsReading) err('нет сведений', w, '«Писание молчит» — либо со списком стихов (read), либо с пометкой «нужно чтение» (needsReading)');
      // стих списка — из записей самого лица уровня «Писание» или «вывод», и лицо в нём названо (рецензия 07, № 84; C41)
      const a = actors.get(n.actor);
      if (a) {
        if (!ownVerses.has(a.id)) ownVerses.set(a.id, new Set(namedVerses(a, own.get(a.id) ?? [])));
        const ok = ownVerses.get(a.id)!;
        for (const r of n.read ?? []) {
          if (!texts(w, r)) continue;
          if (!ok.has(r)) err('нет сведений', w, `стих ${r} из списка «прочитано» — не стих этого лица: лицо в нём не названо или стих пришёл не из его записей уровня «Писание» и «вывод»`);
        }
      }
    } else if (n.read || n.needsReading) err('нет сведений', w, 'список «прочитано» и пометка «нужно чтение» — только у «Писание молчит»');
    if (n.kind === 'scripture-says') {
      if (!n.refs.length || !n.words?.length) err('нет сведений', w, '«Писание говорит» — только со стихами и словами стиха');
      for (const x of n.words ?? []) {
        if (!clean(mainTexts(w, x.ref).join(' ')).includes(clean(x.text))) err('цитата', w, `слов «${x.text.slice(0, 50)}» нет в основном тексте ${x.ref}`);
      }
    }
  }
  for (const e of base.epochs) {
    for (const r of [e.startRule, e.endRule]) has('целостность', `эпоха ${e.id}`, r?.person);
    walk(`эпоха ${e.id}`, e);
  }
  walk('якоря', base.anchors);
  for (const a of base.anchors.anchors ?? []) if (a.verse) texts(`якорь ${a.id}`, a.verse);
  // переадресация: старый номер не занят, цели есть, петель нет
  const redirectFrom = new Map(base.redirects.map((r) => [r.from, r]));
  for (const r of base.redirects) {
    if (actors.has(r.from)) err('переадресация', r.from, 'переадресуемый номер занят лицом');
    for (const t of r.to) if (!actors.has(t) && !redirectFrom.has(t)) err('переадресация', r.from, `нет цели «${t}»`);
    const seen = new Set<string>([r.from]);
    let cur = r.to.length === 1 ? r.to[0] : undefined;
    while (cur && redirectFrom.has(cur)) {
      if (seen.has(cur)) {
        err('переадресация', r.from, 'петля переадресации');
        break;
      }
      seen.add(cur);
      const nx = redirectFrom.get(cur)!.to;
      cur = nx.length === 1 ? nx[0] : undefined;
    }
  }

  // ---------- «по словам …»: говорящий есть и назван в своём стихе той же главы (02 § 3.6; шаг C33) ----------
  const saidBys: [string, { saidBy?: { actor: string; ref: string; label: string }; refs: string[] }][] = [
    ...base.kin.map((k) => [`${k.from} — ${k.to}`, k] as [string, typeof k]),
    ...base.origins.map((o) => [`${o.child} ← ${o.parent ?? '?'}`, o] as [string, typeof o]),
    ...base.unions.flatMap((u) => u.terms.map((t) => [u.id, t] as [string, typeof t])),
  ];
  for (const [w, x] of saidBys) {
    const sb = x.saidBy;
    if (!sb) continue;
    const who = actors.get(sb.actor);
    if (!who) {
      err('по словам', w, `нет лица «${sb.actor}»`);
      continue;
    }
    if (!/^по словам /.test(sb.label ?? '')) err('по словам', w, `пометка «${sb.label}» — не «по словам …»`);
    const joined = norm(mainTexts(w, sb.ref).join(' '));
    if (!who.names.some((n) => nameMatcher(n.form).test(joined))) err('по словам', w, `говорящий ${sb.actor} не назван в ${sb.ref}`);
    const ch = (r: string) => r.replace(/:.*$/, '');
    if (!x.refs.some((r) => ch(r) === ch(sb.ref))) err('по словам', w, `стих говорящего ${sb.ref} не из главы стихов записи (${x.refs.join('; ')})`);
  }

  // ---------- лица: имена, утверждения, карантин ----------
  const actorRefs = new Map<string, string[]>();
  const addRefs = (id: string, rs: string[]) => actorRefs.set(id, [...(actorRefs.get(id) ?? []), ...rs]);
  for (const a of actors.values()) {
    for (const n of a.names) addRefs(a.id, walk(`${a.id} имя`, n));
    for (const f of a.facts) {
      const w = `${a.id} § ${f.sec} ${f.field}`;
      if (f.cert !== undefined && !CERTS.has(f.cert)) err('достоверность', w, `неизвестная степень «${f.cert}»`);
      const rs = walk(w, f.value);
      if (f.cert === 'inference' && rs.length && rs.reduce((n, r) => n + verseCount(r), 0) < 2) warn('вывод', w, `«вывод» опирается на один стих: ${rs.join('; ')}`);
      const q = f.prov?.status === 'quarantine';
      if (!rs.length && !q) err('стих', w, 'утверждение без стиха и не в карантине');
      if (f.cert === 'reference' && !q && !(f.value as any)?.source) err('справочно', w, 'справочное без источника и не в карантине');
      if (f.field === 'met') has('целостность', w, (f.value as any).id);
      if (!q) addRefs(a.id, rs);
    }
  }
  for (const o of base.origins) addRefs(o.child, o.refs);
  for (const u of base.unions) for (const t of u.terms) {
    addRefs(u.husband, t.refs);
    addRefs(u.wife, t.refs);
  }
  for (const k of base.kin) addRefs(k.from, k.refs);
  // форма имени названа хотя бы в одном стихе лица (без вставок в скобках); безымянные — описательное слово
  for (const a of actors.values()) {
    const rs = [...new Set(actorRefs.get(a.id) ?? [])];
    const joined = norm(rs.flatMap((r) => mainTexts(a.id, r)).join(' '));
    if (a.kind === 'unnamed' || a.kind === 'group') {
      if (a.descriptor && !nameMatcher(a.descriptor).test(joined)) err('имя', a.id, `описательное слово «${a.descriptor}» не найдено в стихах лица`);
      continue;
    }
    const forms = a.names.map((n) => n.form);
    if (!forms.some((f) => nameMatcher(f).test(joined))) err('имя', a.id, `ни одна форма имени (${forms.join(', ')}) не найдена в стихах лица`);
  }

  // ---------- дословность цитат: изречения (§ 18) — точно по основному тексту, без вставок в скобках ----------
  for (const a of actors.values()) {
    for (const f of a.facts) {
      if (f.field !== 'sayings' || f.prov?.status === 'quarantine') continue;
      const v = f.value as { quote?: string; ref?: string };
      if (!v.quote || !v.ref) {
        err('цитата', `${a.id} § 18`, 'изречение без цитаты или стиха');
        continue;
      }
      if (!clean(mainTexts(a.id, v.ref).join(' ')).includes(clean(v.quote))) err('цитата', `${a.id} § 18`, `цитата не совпадает с основным текстом ${v.ref}: «${v.quote.slice(0, 60)}»`);
    }
  }
  // цитаты в кавычках внутри утверждений: каждый отрезок между многоточиями — в основном тексте стихов записи.
  // Новая запись (с prov.by) — ошибка; перенесённая — замечание до проверки томов (02 § 7 [Д1-рец], этап Д3)
  for (const a of actors.values()) {
    for (const f of a.facts) {
      if (f.field === 'notes' || f.field === 'sayings' || f.prov?.status === 'quarantine') continue;
      const v = f.value as { text?: string; refs?: string[] };
      if (!v.text || !v.refs?.length) continue;
      const hay = clean(v.refs.flatMap((r) => mainTexts(a.id, r)).join(' '));
      for (const m of v.text.matchAll(/«([^«»]+)»/g)) {
        for (const part of m[1].split('…').map(clean).filter((x) => x.split(' ').length >= 2)) {
          if (!hay.includes(part)) (f.prov?.by ? err : warn)('цитата', `${a.id} § ${f.sec} ${f.field}`, `«${part.slice(0, 50)}» нет в основном тексте ${v.refs.join('; ')}`);
        }
      }
    }
  }

  // ---------- скобки — не основание: ребёнок назван в основном тексте стихов своего ребра ----------
  for (const o of base.origins) {
    const c = actors.get(o.child);
    if (!c || c.kind === 'unnamed' || c.kind === 'group') continue;
    const joined = norm(o.refs.flatMap((r) => mainTexts(o.child, r)).join(' '));
    if (!c.names.some((n) => nameMatcher(n.form).test(joined))) {
      (o.prov?.from ? warn : err)('скобки', `${o.child} ← ${o.parent}`, `ребёнок не назван в основном тексте стихов ребра (${o.refs.join('; ')})`);
    }
  }

  // ---------- родство словами Писания: слово есть в стихе ----------
  for (const k of base.kin) {
    const word = norm(k.rel.replace(/\(.*?\)/g, '')).trim().split(/\s+/)[0] ?? '';
    const stem = word.length > 4 ? word.slice(0, word.length - 2) : word.slice(0, 3);
    const joined = norm(k.refs.flatMap((r) => mainTexts(`${k.from} — ${k.to}`, r)).join(' '));
    if (stem && !joined.includes(stem)) err('слово родства', `${k.from} — ${k.to}`, `слово «${k.rel}» не найдено в стихах ${k.refs.join('; ')}`);
  }

  // ---------- циклы ----------
  const parents = new Map<string, string[]>();
  for (const o of base.origins) if (o.parent) parents.set(o.child, [...(parents.get(o.child) ?? []), o.parent]);
  const state = new Map<string, 1 | 2>();
  const dfs = (id: string, path: string[]): void => {
    state.set(id, 1);
    for (const p of parents.get(id) ?? []) {
      if (state.get(p) === 1) err('цикл', id, `цикл происхождения: ${[...path, id, p].join(' → ')}`);
      else if (!state.has(p)) dfs(p, [...path, id]);
    }
    state.set(id, 2);
  };
  for (const id of parents.keys()) if (!state.has(id)) dfs(id, []);

  // ---------- наборы прочтений: ни одного ложного родства ----------
  // прочтения: все по умолчанию, затем каждое прочтение каждого набора поодиночке (наборы не связаны между собой)
  const defaults = base.readings.map((r) => [r.id, r.default] as const);
  const worlds = [defaults, ...base.readings.flatMap((r) => r.readings.filter((x) => x.id !== r.default).map((x) => defaults.map(([s, d]) => [s, s === r.id ? x.id : d] as const)))];
  const married = new Set(base.unions.filter((u) => u.terms.some((t) => t.kind !== 'not-stated')).map((u) => `${u.husband}|${u.wife}`));
  const activeIn = (o: { reading?: { set: string; in: string[] } }, on: Map<string, string>) => !o.reading || o.reading.in.includes(on.get(o.reading.set)!);
  const kinPairs = new Set(base.kin.flatMap((k) => [`${k.from}|${k.to}`, `${k.to}|${k.from}`]));
  for (const w of worlds) {
    const on = new Map(w);
    const active = base.origins.filter((o) => o.parent && activeIn(o, on));
    const name = w.filter(([s, r]) => readings.get(s)!.default !== r).map(([s, r]) => `${s}=${r}`).join(', ') || 'по умолчанию';
    const fathers = new Map<string, string[]>();
    for (const o of active) if (o.kind === 'natural' && o.role === 'father') fathers.set(o.child, [...(fathers.get(o.child) ?? []), o.parent!]);
    for (const [c, fs] of fathers) if (fs.length > 1) err('прочтения', c, `два кровных отца при прочтениях [${name}]: ${fs.join(', ')}`);
    // по умолчанию у лица один отец: два отца по разным местам текста — только через набор прочтений (рецензия Д1, № 4, 5)
    if (w === defaults) {
      const any = new Map<string, string[]>();
      for (const o of active) if (o.role === 'father' && ['natural', 'by-luke', 'alternative'].includes(o.kind)) any.set(o.child, [...(any.get(o.child) ?? []), o.parent!]);
      // ребро с возможным пропуском через другого отца (Арфаксад → Сала через Каинана) — предок, не второй отец
      const gapVia = new Map(active.filter((o) => o.gapPossible).map((o) => [`${o.parent}>${o.child}`, o.gapPossible!.via]));
      for (const [c, fs] of any) {
        const real = fs.filter((f) => !(gapVia.get(`${f}>${c}`) ?? []).some((v) => fs.includes(v)));
        if (real.length > 1) err('прочтения', c, `два отца при прочтениях по умолчанию: ${real.join(', ')}`);
      }
    }
    // супруги не выходят братом и сестрой, если текст сам не называет их родство (Быт 20:12)
    // братья и сёстры по общему родителю; ребро с возможным пропуском «через» другого ребёнка (Каинан) — предок, не отец
    const kids = new Map<string, Map<string, string[]>>();
    for (const o of active) {
      if (o.kind === 'ancestor') continue;
      const m = kids.get(o.parent!) ?? kids.set(o.parent!, new Map()).get(o.parent!)!;
      m.set(o.child, o.gapPossible?.via ?? []);
    }
    const sib = new Set<string>();
    for (const cs of kids.values()) {
      for (const [x, vx] of cs) for (const [y, vy] of cs) if (x !== y && !vx.includes(y) && !vy.includes(x)) sib.add(`${x}|${y}`);
    }
    // Каинан не выходит братом Салы ни при одном прочтении (C5)
    if (sib.has('p-sala|p-kainan-syn-arfaksada')) err('прочтения', 'p-sala', `Сала и Каинан выходят братьями при прочтениях [${name}]`);
    for (const pair of married) if (sib.has(pair) && !kinPairs.has(pair)) err('прочтения', pair, `супруги выходят братом и сестрой при прочтениях [${name}]`);
  }

  // ---------- линии Мессии ----------
  // шаг линии подтверждается ребром, действующим при прочтениях этой линии
  for (const [k, l] of Object.entries<any>(base.lines)) {
    const on = new Map(base.readings.map((r) => [r.id, l.readings?.[r.id] ?? r.default]));
    for (const [s, r] of Object.entries<string>(l.readings ?? {})) if (!readings.get(s)?.readings.some((x) => x.id === r)) err('линия', `line:${k}`, `нет прочтения ${s}=${r}`);
    const edge = new Set(base.origins.filter((o) => o.parent && activeIn(o, on)).map((o) => `${o.parent}>${o.child}`));
    l.persons.forEach((s: any, i: number) => {
      has('линия', `line:${k}[${i}]`, s.id);
      walk(`line:${k}[${i}]`, s);
      if (i && !edge.has(`${l.persons[i - 1].id}>${s.id}`)) err('линия', `line:${k}`, `шаг ${l.persons[i - 1].id} → ${s.id} не подтверждён ребром при прочтениях линии`);
    });
    walk(`line:${k}`, { refs: l.refs });
  }
  const J = base.lines.joseph?.persons ?? [];
  const mt = J.filter((s: any) => s.mt !== undefined).map((s: any) => s.mt);
  if (mt.join(',') !== Array.from({ length: 42 }, (_, i) => i + 1).join(',')) err('линия', 'line:joseph', `номера Мф 1 — не 1…42 по порядку`);
  for (const g of [1, 2, 3]) {
    const n = J.filter((s: any) => s.mtGroup === g).length;
    if (n !== 14) err('линия', 'line:joseph', `Мф 1:17: в ${g}-й четырнадцати ${n} родов`);
  }
  const M = base.lines.luke?.persons ?? [];
  const lk = M.filter((s: any) => s.lk !== undefined).map((s: any) => s.lk);
  if (lk.join(',') !== Array.from({ length: 75 }, (_, i) => 75 - i).join(',')) err('линия', 'line:luke', 'номера Лк 3 — не 75…1 от Адама до Иосифа');
  if (M.at(-2)?.id !== 'p-iosif-muzh-marii' || M.at(-1)?.id !== 'p-iisus') err('линия', 'line:luke', 'линия по Луке должна кончаться Иосифом (Лк 3:23) и Иисусом Христом');
  for (const s of J) if (s.lk !== undefined && !M.some((q: any) => q.id === s.id && q.lk === s.lk)) err('линия', `line:joseph ${s.id}`, `номер Лк ${s.lk} не совпадает с линией по Луке`);

  // ---------- союз родителей: у ребёнка с отцом и матерью есть союз; исключение — «не от союза» (02, § 3.5) ----------
  const unionPairs = new Set(base.unions.map((u) => `${u.husband}|${u.wife}`));
  const notFromUnion = new Set(base.nodata.filter((n) => n.kind === 'scripture-says' && n.what === 'отец по плоти').map((n) => n.actor));
  const prim = new Map<string, { f?: string; m?: string; legal?: boolean }>();
  for (const o of base.origins) {
    if (!o.primary || !o.parent) continue;
    const x = prim.get(o.child) ?? prim.set(o.child, {}).get(o.child)!;
    if (o.role === 'father') {
      x.f = o.parent;
      if (o.kind === 'legal') x.legal = true;
    } else x.m = o.parent;
  }
  for (const [c, x] of prim) {
    if (!x.f || !x.m) continue;
    if (!!x.legal !== notFromUnion.has(c)) err('союз', c, 'ребро «по закону» и запись «не от союза» должны быть вместе (02, § 3.5)');
    if (!x.legal && !unionPairs.has(`${x.f}|${x.m}`)) err('союз', c, `нет союза родителей ${x.f} и ${x.m}`);
  }

  // ---------- прежние номера: в базе нет ссылок на лицо без «p-» ----------
  const oldIds = new Set([...actors.keys()].map((id) => id.slice(2)));
  const scan = (where: string, v: unknown) => {
    const go = (x: any) => {
      if (typeof x === 'string') {
        if (oldIds.has(x)) err('номер', where, `прежний номер лица «${x}» без «p-»`);
      } else if (Array.isArray(x)) x.forEach(go);
      else if (x && typeof x === 'object') Object.values(x).forEach(go);
    };
    go(v);
  };
  scan('происхождение', base.origins);
  scan('союзы', base.unions);
  scan('родство', base.kin);
  scan('членство', base.memberships);
  scan('время', base.chrono);
  scan('эпохи', base.epochs);
  scan('линии', Object.values(base.lines).map((l: any) => l.persons));
  scan('области', base.areas);
  for (const a of actors.values()) scan(a.id, a.facts.filter((f) => f.field === 'met'));

  // ---------- дефекты электронного текста: каждый пустой стих записан в таблице (страж против замены файла; Д3-4) ----------
  for (const m of checkSourceIssues()) err('дефект текста', 'tools/bible/source-issues.tsv', m);

  // ---------- подписи проверки: отпечаток записи и входов совпадает (02 § 3.1; Д3-2) ----------
  for (const x of validateChecks(base)) err('проверка', x.where, x.msg);
  // реестр источников и ссылки записей на него (Д3-3, Д3-5; 09 § 5.5)
  for (const x of validateRegistry(base)) (x.level === 'error' ? err : warn)('источник', x.where, x.msg);

  // ---------- стоп-список предания: утверждения, а не имена (02, § 7) ----------
  stopList(base, actors, err);
  return issues;
}

type Err = (check: string, where: string, msg: string) => void;

function stopList(base: Base, actors: Map<string, Actor>, err: Err) {
  const S = 'стоп-список';
  const byName = (form: string) => [...actors.values()].filter((a) => a.names.some((n) => norm(n.form) === norm(form)));
  const named = (id: string, ...forms: string[]) => forms.some((f) => actors.get(id)?.names.some((n) => norm(n.form) === norm(f)));
  const factTexts = (a: Actor, notes = false) =>
    a.facts.filter((f) => notes || f.field !== 'notes').map((f) => JSON.stringify(f.value));
  // родители Марии — не Иоаким и Анна
  for (const o of base.origins) if (o.child === 'p-mariya' && o.parent && named(o.parent, 'Иоаким', 'Анна')) err(S, o.parent, 'родители Марии «Иоаким и Анна» — предание');
  // жена Ноя — не Ноема (Ноема — дочь Ламеха, Быт 4:22)
  for (const u of base.unions) if (u.husband === 'p-noy' && named(u.wife, 'Ноема')) err(S, u.id, 'жена Ноя «Ноема» — предание');
  // имена и число волхвов, «три царя»
  for (const f of ['Каспар', 'Гаспар', 'Мельхиор', 'Бальтазар']) for (const a of byName(f)) err(S, a.id, `имя волхва «${f}» — предание`);
  // архангелы, кроме Михаила
  for (const a of actors.values()) {
    if (a.kind === 'angel' && a.names.some((n) => /^(Рафаил|Уриил|Селафиил|Иегудиил|Варахиил|Иеремиил)$/.test(n.form))) err(S, a.id, 'архангел по преданию');
    if (named(a.id, 'Гавриил') && JSON.stringify([a.names, a.roles, a.disambig, factTexts(a)]).match(/[Аа]рхангел/)) err(S, a.id, 'Гавриил архангелом не назван (Лк 1:19)');
    for (const f of ['Фотиния', 'Дисмас', 'Гестас', 'Вероника', 'Лонгин']) if (named(a.id, f)) err(S, a.id, `«${f}» — имя из предания`);
    for (const t of factTexts(a)) {
      if (/тр(и|ое) (волхв|цар)/i.test(t)) err(S, a.id, 'число волхвов не дано (Мф 2:1)');
    }
  }
  // дети Иосифа и Марии — только Иисус Христос; «братья Его» — родство словами Писания, не ребро
  for (const o of base.origins) {
    if ((o.parent === 'p-iosif-muzh-marii' || o.parent === 'p-mariya') && o.child !== 'p-iisus') err(S, o.child, '«братья Его» не выводятся от Иосифа или Марии ребром происхождения');
  }
  // Мария Магдалина — не грешница из Лк 7
  const mm = actors.get('p-mariya-magdalina');
  if (mm) {
    for (const f of mm.facts) {
      if (f.field === 'notes') continue;
      if (JSON.stringify(f.value).match(/Лк 7:(3[6-9]|4\d|50)/)) err(S, mm.id, 'Мария Магдалина — не женщина из Лк 7:36–50');
    }
  }
  // отождествления по преданию: Бифия = дочь фараона Исх 2; Мелхиседек = Сим; денница = сатана
  const linked = (a: string, b: string) =>
    base.kin.some((k) => (k.from === a && k.to === b) || (k.from === b && k.to === a)) ||
    base.redirects.some((r) => (r.from === a && r.to.includes(b)) || (r.from === b && r.to.includes(a)));
  for (const b of byName('Бифия')) if (linked(b.id, 'p-doch-faraona-mat-moiseya')) err(S, b.id, 'Бифия (1Пар 4:18) = дочь фараона Исх 2 — предание');
  for (const m of byName('Мелхиседек')) {
    if (linked(m.id, 'p-sim')) err(S, m.id, 'Мелхиседек = Сим — предание');
    if (base.origins.some((o) => o.child === m.id)) err(S, m.id, 'родители Мелхиседека не названы (Евр 7:3)');
  }
  for (const d of byName('Денница')) if (base.redirects.some((r) => r.from === d.id) || base.kin.some((k) => k.from === d.id || k.to === d.id)) err(S, d.id, 'денница (Ис 14:12) = сатана — предание');
  // кончина пророков, которых текст не называет: Евр 11:37 Исаию не называет
  for (const a of byName('Исаия')) {
    for (const f of a.facts) if (f.sec === 20 && JSON.stringify(f.value).includes('Евр 11:37')) err(S, a.id, 'Евр 11:37 Исаию не называет');
  }
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  let base: Base;
  if (fresh || !existsSync(join(ROOT, 'base', 'origins.json'))) {
    const { buildBase } = await import('./migrate.ts');
    base = buildBase();
    // реестр и подписи живут на диске отдельно от переноса
    if (existsSync(join(ROOT, 'base', 'sources.json'))) base.sources = JSON.parse(readFileSync(join(ROOT, 'base', 'sources.json'), 'utf8')).items;
    base.checks = loadChecks();
  } else base = loadBase();
  const issues = validate(base);
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const by = (xs: Issue[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.check, (m.get(x.check) ?? 0) + 1);
    return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || '—';
  };
  const show = process.argv.includes('--all') ? Infinity : 40;
  for (const x of errors.slice(0, show)) console.log(`ОШИБКА [${x.check}] ${x.where}: ${x.msg}`);
  if (process.argv.includes('--warn')) for (const x of warns.slice(0, show)) console.log(`замечание [${x.check}] ${x.where}: ${x.msg}`);
  const n = base.volumes.reduce((s, v) => s + v.actors.length, 0);
  console.log(`лиц ${n}; ошибок ${errors.length} (${by(errors)}); замечаний ${warns.length} (${by(warns)})`);
  const c = admission(base, 'release').counts.all;
  console.log(`записей: проверено ${c.checked}, черновик ${c.draft}, карантин ${c.quarantine}; подпись устарела ${c.stale}; не выпускаются по правам источника ${c.rights}; допущено в выпуск ${c.admitted}`);
  if (errors.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
