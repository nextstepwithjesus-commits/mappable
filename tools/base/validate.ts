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
import { norm, nameMatcher, formMissing } from '../../src/engine/text.ts';
import { scriptureText } from './brackets.ts';
import type { Base } from './migrate.ts';
import type { Actor, Cert, Prov } from './types.ts';
import { admission, loadChecks, validateChecks } from './admit.ts';
import { checkSourceIssues, issuesAt, KIND_WORD } from './source-issues.ts';
import { namedVerses, ownRefs } from './own-verses.ts';
import { validateRegistry } from './sources.ts';
import { loadIds, PREFIX, type IdKind } from './ids.ts';
import { releaseOk } from './release.ts';
import { validateStories } from './stories.ts';
import { validateNameForms } from './name-forms.ts';
import { checkDescriptors, descriptorText } from './descriptor.ts';
import { calcAnchorIssues, checkTime, MODELS, SCHEMES } from './time-check.ts';

export interface Issue { level: 'error' | 'warn'; check: string; where: string; msg: string }

/** Слова обозначений союза по видам (02 § 3.2): слово текста должно подходить к виду и стоять в стихе (шаги C32–C35). */
export const UNION_WORDS: Record<string, string[]> = {
  marriage: ['жена', 'муж', 'женился', 'взял', 'в замужество', 'как деверь'],
  concubine: ['наложница'],
  'maid-as-wife': ['в жену', 'служанка'],
  redemption: [],
  'non-marital': ['вошел к ней', 'спала'],
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
/** Постоянные номера моделей и схем (04 § 16.1; 02 § 3.15.2–3.15.3): ссылка `calc` называет только их. */
export { MODELS, SCHEMES } from './time-check.ts';

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
    models: existsSync(join(dir, 'models.json')) ? items('models.json') : [],
    files, fileSources,
    sources: existsSync(join(dir, 'sources.json')) ? items('sources.json') : [],
    places: existsSync(join(dir, 'places.json')) ? items('places.json') : [],
    placeMentions: existsSync(join(dir, 'place-mentions.json')) ? items('place-mentions.json') : [],
    routes: existsSync(join(dir, 'routes.json')) ? items('routes.json') : [],
    relations: existsSync(join(dir, 'relations.json')) ? items('relations.json') : [],
    // истории (02 § 3.12; 11 § 11): файлы пишет перенос из data/stories/
    stories: existsSync(join(dir, 'stories.json')) ? items('stories.json') : [],
    verseClasses: existsSync(join(dir, 'verse-classes.json')) ? items('verse-classes.json') : [],
    textParallels: existsSync(join(dir, 'text-parallels.json')) ? items('text-parallels.json') : [],
    storyChapters: existsSync(join(dir, 'story-chapters.json')) ? items('story-chapters.json') : [],
    checks: loadChecks(dir),
    ids: loadIds(dir),
  };
}

/**
 * Год внутри записи (02 § 3.10 «Годы внутри записей»; К-8): числовое поле `year`, `from` или `to` на любой глубине значения.
 * До переработки (замена ссылкой `calc`, Д-7) такая запись не показывается и не выгружается (07 § 21.1).
 */
export function yearIn(x: unknown): boolean {
  if (Array.isArray(x)) return x.some(yearIn);
  if (!x || typeof x !== 'object') return false;
  return Object.entries(x).some(([k, v]) => (['year', 'from', 'to'].includes(k) && typeof v === 'number') || yearIn(v));
}

/** Эпоха прежнего вида: готовые годы или «предание» в основании (02 § 3.15; Д-11) — подпись запрещена (К-8). */
export function epochUnsignable(e: any): string | undefined {
  const why: string[] = [];
  for (const k of ['start', 'end', 'startEst', 'endEst']) if (typeof e?.[k] === 'number') why.push(`готовый год «${k}»`);
  if (/предани/i.test(JSON.stringify([e?.basis, e?.basisBy, e?.summary]))) why.push('«предание» в основании');
  return why.length ? why.join(', ') : undefined;
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
  /** Номера историй `e-…`: на них может ссылаться событие расчёта (02 § 3.10.2). */
  const storyIds = new Set((base.stories ?? []).map((x: { id: string }) => x.id));

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
      // форма имени «выв.» опирается и на стихи сравнения обеих сторон (02 § 3.3.5 [4.4 по Р-4]: стихи сравнения — стихи записи)
      const cmp: string[] = x.compare ? [...(x.compare.form?.refs ?? []), ...(x.compare.main?.refs ?? []), ...(x.compare.count?.ref ? [x.compare.count.ref] : [])] : [];
      if (x.cert === 'inference' && own.length && [...new Set([...own, ...cmp])].reduce((n, r) => n + verseCount(r), 0) < 2) {
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
      // «союз без брака»: союз — уровень обозначения, «без брака» — вывод по своим стихам (03 ред. 5, § 3.2; C48)
      if (t.kind === 'non-marital') {
        if (!t.notMarriage?.refs.length || t.notMarriage.cert !== 'inference') err('союз', u.id, '«союз без брака» — с полем «без брака» (notMarriage): вывод по своим стихам');
        if (t.cert === 'interpretation') err('союз', u.id, '«союз без брака» уровня «толкование»');
      } else if (t.notMarriage) err('союз', u.id, 'поле «без брака» — только у вида «союз без брака»');
      if (/сам союз текст не называет/.test(t.note ?? '') && t.kind !== 'not-stated') err('союз', u.id, 'примечание «сам союз текст не называет» у союза, который текст описывает');
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
    for (const x of r.readings) {
      // авторы толкования — ссылками на труды works (02 § 3.4, § 5.2; К-3); строки авторов — прежний вид
      if ('authors' in x) err('прочтения', r.id, `у прочтения «${x.id}» авторы строками (authors) — нужны ссылки на труды works (02 § 5.2; К-3)`);
      if (x.cert === 'interpretation' && !x.works?.some((c) => c.weight !== 'excluded')) err('прочтения', r.id, `у толкования «${x.id}» нет ссылок на труды works (02 § 3.4, R9 Г-4)`);
    }
    walk(r.id, r);
  }
  for (const o of base.origins) {
    const w = `${o.child} ← ${o.parent ?? o.unnamedParent?.words}`;
    has('целостность', w, o.child);
    if (!o.parent && !o.unnamedParent && !o.candidates?.length) err('целостность', w, 'нет ни родителя, ни заместителя «не назван», ни кандидатов');
    // кандидаты (02 § 3.3.4; К-13): родитель не выбран; кандидатов не меньше двух, каждый — лицо подходящего пола
    if (o.candidates) {
      if (o.parent) err('кандидаты', w, 'у ребра с кандидатами родитель не выбирается: поле parent лишнее');
      if (o.candidates.length < 2) err('кандидаты', w, 'кандидатов меньше двух — это не запись кандидатов');
      if (new Set(o.candidates).size !== o.candidates.length) err('кандидаты', w, 'кандидат повторяется');
      for (const c of o.candidates) {
        has('целостность', `${w}, кандидат`, c);
        const cs = actors.get(c)?.sex;
        if (cs && cs !== (o.role === 'father' ? 'm' : 'f')) err('пол', w, `кандидат ${c} другого пола`);
      }
      if (o.identity?.of === 'parent') err('кандидаты', w, 'у ребра с кандидатами нет тождества выбранного родителя');
    }
    // степень у вида «предок» (02 § 3.4; К-13)
    if (o.degree !== undefined) {
      if (o.kind !== 'ancestor') err('степень', w, `степень (degree) — только у вида «предок», а вид «${o.kind}»`);
      if (!['inferred', 'unstated'].includes(o.degree)) err('степень', w, `степень «${o.degree}» — нужна inferred или unstated`);
      if (o.degree === 'inferred' && o.cert !== 'inference') err('степень', w, 'степень выведена (inferred) — уровень ребра «вывод»');
    } else if (o.kind === 'ancestor') warn('степень', w, 'у вида «предок» нет степени (degree: inferred или unstated; Д-2)');
    // «слово текста» (02 § 3.4; К-7): уровень «Писание», у каждого слова — стих и говорящий
    if (o.kind === 'text-word') {
      if (o.cert !== 'scripture' || !o.words?.length) err('происхождение', w, 'вид «слово текста» (text-word) — уровень «Писание» и слова стиха');
      for (const x of o.words ?? []) if (!x.saidBy) err('по словам', w, `у слова «${x.text}» (${x.ref}) нет говорящего (words[].saidBy)`);
    }
    has('целостность', w, o.parent);
    if (!o.refs.length) err('стих', w, 'происхождение без стиха');
    walk(w, o);
    const ps = o.parent ? actors.get(o.parent)?.sex : undefined;
    if (ps && ps !== (o.role === 'father' ? 'm' : 'f')) err('пол', w, `${o.role === 'father' ? 'отец' : 'мать'} другого пола`);
    for (const id of o.skipped?.actors ?? []) has('целостность', `${w}, пропущенные`, id);
    if (o.skipped && (!o.gap || !o.skipped.refs.length)) err('пропуск', w, 'перечень пропущенных — только у ребра со знаком пропуска и со стихами, где они названы');
    // толкование не становится ребром (CLAUDE.md; R9 Г-5; очередь Д3-11): ребро «толкование» — только внутри набора прочтений
    if (o.cert === 'interpretation' && !o.reading) err('толкование', w, 'ребро уровня «толкование» вне набора прочтений: толкование не становится ребром');
    if (o.identity) {
      const id = o.identity;
      // [4.4] inferred — ребро держится на форме вида (б); номер формы проверяет validateNameForms (02 § 3.3.5; К-18)
      if (!['parent', 'child'].includes(id.of) || !['weighty', 'possible', 'inferred'].includes(id.degree)) err('тождество', w, `тождество: of «${id.of}», degree «${id.degree}»`);
      if (!id.note?.trim() || !id.refs?.length) err('тождество', w, 'тождество конца ребра — с примечанием и стихами');
      if (o.cert === 'interpretation') err('тождество', w, 'поле тождества — у ребра, сказанного словами («Писание» или «вывод»)');
    }
    if (o.kind === 'parents-word' && (o.cert !== 'scripture' || !o.words?.length)) err('происхождение', w, 'вид «слово текста» (parents-word) — уровень «Писание» и слова стиха');
    if (o.reading) {
      const set = readings.get(o.reading.set);
      if (!set) err('прочтения', w, `нет набора «${o.reading.set}»`);
      else for (const r of o.reading.in) if (!set.readings.some((x) => x.id === r)) err('прочтения', w, `нет прочтения «${r}» в наборе ${set.id}`);
    }
  }
  // ---------- места (02 § 3.13; 05 § 10; К-11, К-14) ----------
  validatePlaces(base, err, warn, (w, ref) => texts(w, ref), (w, ref) => mainTexts(w, ref).join(' ').replace(/\s+/g, ' '));
  validatePlaceMentions(base, err, (w, ref) => mainTexts(w, ref));
  validateRoutes(base, err, (w, ref) => mainTexts(w, ref));
  validateStories(base, err, warn);

  // ---------- новые правила (К-8) ----------
  // «толк.» у обозначения союза и родства словами: у них нет набора прочтений — толкование здесь не хранится (02 § 3.1).
  // Сейчас 18 записей родства и 5 обозначений (остаток Д3-11) — замечание до разбора Д-5
  // отношения лиц (02 § 3.11.1; § 3.3.4 [4.2]): обе карточки есть и различны; уровень по виду; стихи обеих сторон
  for (const r of base.relations ?? []) {
    const w = `${r.a} ~ ${r.b}`;
    has('целостность', w, r.a);
    has('целостность', w, r.b);
    if (r.a === r.b) err('отношение', w, 'отношение лица к самому себе');
    if (!['not-same', 'possibly-same'].includes(r.kind)) err('отношение', w, `вид «${r.kind}» — нужен not-same или possibly-same`);
    const ok = r.kind === 'not-same' ? ['scripture', 'inference'] : ['inference', 'interpretation'];
    if (!ok.includes(r.cert)) err('отношение', w, `уровень «${r.cert}» у вида «${r.kind}» — нужен ${ok.join(' или ')}`);
    // толкование — с трудами works или с пометкой needsSources (трудов ещё нет; решение координатора, Д-р8); пометка — только у толкования
    if (r.cert === 'interpretation' && !r.works?.some((c) => c.weight !== 'excluded') && !r.needsSources) err('отношение', w, '«возможно, то же лицо» уровня «толкование» — с трудами works или пометкой needsSources (R9 Г-4)');
    if (r.needsSources && r.cert !== 'interpretation') err('толкование', w, 'пометка «нужен совет источников» — только у толкования');
    if (!r.refs?.length) err('стих', w, 'отношение без стихов');
    if (!r.note?.trim()) err('отношение', w, 'отношение без примечания');
    walk(w, { refs: r.refs ?? [], cert: r.cert });
  }
  // тождество конца у родства и союза (Д-5) — как у ребра (C45): у слова, сказанного вне скобок, со стихами и примечанием
  const endIdentity = (w: string, id: { of: string; degree: string; note: string; refs: string[] } | undefined, ends: string[], cert: Cert | undefined) => {
    if (!id) return;
    if (!ends.includes(id.of) || !['weighty', 'possible', 'inferred'].includes(id.degree)) err('тождество', w, `тождество: of «${id.of}», degree «${id.degree}»`);
    if (!id.note?.trim() || !id.refs?.length) err('тождество', w, 'тождество конца — с примечанием и стихами');
    walk(w, { refs: id.refs ?? [] });
    if (cert === 'interpretation') err('тождество', w, 'поле тождества — у слова, сказанного текстом («Писание» или «вывод»)');
  };
  for (const k of base.kin) endIdentity(`${k.from} — ${k.to}`, k.identity, ['from', 'to'], k.cert);
  for (const u of base.unions) for (const t of u.terms) endIdentity(u.id, t.identity, ['husband', 'wife'], t.cert);
  for (const k of base.kin) if (k.cert === 'interpretation') warn('толкование', `${k.from} — ${k.to}`, 'родство словами уровня «толкование»: вне набора прочтений толкование не хранится (Д-5)');
  for (const u of base.unions) for (const t of u.terms) if (t.cert === 'interpretation') warn('толкование', u.id, `обозначение союза «${t.kind}» уровня «толкование»: вне набора прочтений толкование не хранится (Д-5)`);
  // эпоха с готовым годом или «преданием» не подписывается (02 § 3.15, § 7 [4.1])
  const ledgerKeys = new Set((base.checks ?? []).map((c) => c.key));
  for (const e of base.epochs) {
    const why = epochUnsignable(e);
    if (why && ledgerKeys.has(`epoch:${e.id}`)) err('эпоха', e.id, `подпись эпохи прежнего вида запрещена: ${why} (К-8; Д-11)`);
  }
  // переадресация лица — со стихами: слияние только при тождестве «сказано» (02 § 3.3.4)
  for (const r of base.redirects) if (r.from.startsWith('p-') && !r.refs?.length) err('переадресация', r.from, 'переадресация лица без стихов: слияние — только при тождестве «сказано» (02 § 3.3.4)');

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
  // данные времени окончательного вида (Д6; 02 § 3.15): входы, эпохи, модели и схемы, опоры с трудами
  checkTime(base, {
    err, warn, mainTexts, clean, actorIds: new Set(actors.keys()),
    namedIn: (id, text) => !!actors.get(id)?.names.some((n) => nameMatcher(n.form).test(norm(text))),
    verseKeys: (ref) => parseRef(ref, bible.chapterLength)?.verses.map(verseId) ?? [],
  });
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
  // ссылка на эпоху во времени прежнего вида — на действующий номер эпохи (К-1: era-…)
  const epochSet = new Set(base.epochs.map((e) => e.id));
  for (const c of base.chrono as { actor: string; chrono: any }[]) {
    const ep = c.chrono?.epoch;
    if (typeof ep === 'string' && !epochSet.has(ep)) err('целостность', `время ${c.actor}`, `нет эпохи «${ep}»`);
  }
  walk('якоря', base.anchors);
  for (const a of base.anchors.anchors ?? []) if (a.verse) texts(`якорь ${a.id}`, a.verse);
  // ---------- номера рёбер, утверждений, родства, эпох (02 § 3.3.1; К-1) ----------
  const allIds = new Map<string, string>();
  const numbered: [IdKind, string, string | undefined][] = [
    ...base.origins.map((o) => ['origin', `${o.child} ← ${o.parent ?? '?'}`, o.id] as [IdKind, string, string | undefined]),
    ...base.kin.map((k) => ['kin', `${k.from} — ${k.to}`, k.id] as [IdKind, string, string | undefined]),
    ...(base.relations ?? []).map((r) => ['relation', `${r.a} ~ ${r.b}`, r.id] as [IdKind, string, string | undefined]),
    ...[...actors.values()].flatMap((a) => a.facts.map((f) => ['fact', `${a.id} § ${f.sec} ${f.field}`, f.id] as [IdKind, string, string | undefined])),
    ...base.epochs.map((e) => ['epoch', `эпоха ${e.id}`, e.id] as [IdKind, string, string | undefined]),
    ...(base.anchors?.anchors ?? []).map((a: any) => ['anchor', `опора ${a.id}`, a.id] as [IdKind, string, string | undefined]),
  ];
  const issued = base.ids?.length ? new Map(base.ids.map((e) => [e.id, e])) : undefined;
  for (const [kind, where, id] of numbered) {
    if (!id) {
      err('номер', where, `запись без номера ${PREFIX[kind]}… (К-1)`);
      continue;
    }
    if (!id.startsWith(PREFIX[kind])) err('номер', where, `номер «${id}» без префикса ${PREFIX[kind]}`);
    if (allIds.has(id)) err('номер', where, `номер «${id}» повторяется (${allIds.get(id)})`);
    allIds.set(id, where);
    const e = issued?.get(id);
    if (issued && !e) err('номер', where, `номера «${id}» нет в base/ids.json (выдаёт только npm run -s base)`);
    else if (e && (e.kind !== kind || e.state !== 'active')) err('номер', where, `номер «${id}» в base/ids.json: вид ${e.kind}, состояние ${e.state}`);
  }
  if (issued) {
    const redirected = new Set(base.redirects.map((r) => r.from));
    for (const e of issued.values()) {
      if (e.state === 'active' && !allIds.has(e.id) && !redirected.has(e.id)) warn('номер', e.id, `выданный номер без записи и без переадресации (${e.key})`);
      if (e.state === 'retired' && !redirected.has(e.id)) warn('номер', e.id, `выбывший номер без строки переадресации (${e.key})`);
    }
  }
  // переадресация: старый номер не занят, цели есть (запись любого вида), петель нет
  const recordIds = new Set<string>([
    ...actors.keys(), ...base.unions.map((u) => u.id), ...base.readings.map((r) => r.id), ...base.areas.map((a) => a.id), ...allIds.keys(),
  ]);
  const redirectFrom = new Map(base.redirects.map((r) => [r.from, r]));
  for (const r of base.redirects) {
    if (recordIds.has(r.from)) err('переадресация', r.from, 'переадресуемый номер занят записью');
    // номер выпуска, с которого действует (02 § 3.3.1, § 8.2; К-12)
    if (r.release !== undefined && !releaseOk(r.release)) err('переадресация', r.from, `номер выпуска «${r.release}» — нужен вид 2026.10.2`);
    if (!r.reason?.trim()) err('переадресация', r.from, 'нет причины переадресации');
    for (const t of r.to) if (!recordIds.has(t) && !redirectFrom.has(t)) err('переадресация', r.from, `нет цели «${t}»`);
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
  const saidBys: [string, { saidBy?: { actor: string; ref: string; label: string; speechStart?: string }; refs: string[] }][] = [
    ...base.kin.map((k) => [`${k.from} — ${k.to}`, k] as [string, typeof k]),
    ...base.origins.map((o) => [`${o.child} ← ${o.parent ?? '?'}`, o] as [string, typeof o]),
    ...base.unions.flatMap((u) => u.terms.map((t) => [u.id, t] as [string, typeof t])),
    // слова ребра вида «слово текста»: у каждого слова свой говорящий (02 § 3.4; К-7)
    ...base.origins.flatMap((o) => (o.words ?? []).filter((x) => x.saidBy).map((x) => [`${o.child} ← ${o.parent ?? '?'} «${x.text}»`, { saidBy: x.saidBy, refs: [x.ref] }] as [string, { saidBy?: any; refs: string[] }])),
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
    // стих пометки — стих самих слов; говорящий назван в нём или не дальше двух стихов выше (Быт 20:11–12; Р4-11), а при
    // `speechStart` — в начале речи той же главы, не после стиха слов (Дан 5:10 → 5:11; К-7)
    const pr = parseRef(sb.ref, bible.chapterLength);
    const v0 = pr?.verses[0];
    if (sb.speechStart) {
      const ps = parseRef(sb.speechStart, bible.chapterLength)?.verses[0];
      if (!ps || !v0 || ps.book !== v0.book || ps.chapter !== v0.chapter || ps.verse > v0.verse) err('по словам', w, `начало речи ${sb.speechStart} — не стих той же главы до ${sb.ref}`);
      else if (!who.names.some((n) => nameMatcher(n.form).test(norm(scriptureText(ps.book, ps.chapter, ps.verse) ?? '')))) err('по словам', w, `говорящий ${sb.actor} не назван в начале речи ${sb.speechStart}`);
    } else {
      const around = v0 ? [0, 1, 2].map((d) => v0.verse - d).filter((n) => n > 0).map((n) => scriptureText(v0.book, v0.chapter, n) ?? '') : [];
      if (!who.names.some((n) => nameMatcher(n.form).test(norm(around.join(' '))))) err('по словам', w, `говорящий ${sb.actor} не назван в ${sb.ref} и двух стихах выше`);
    }
    const ch = (r: string) => r.replace(/:.*$/, '');
    if (!x.refs.some((r) => ch(r) === ch(sb.ref))) err('по словам', w, `стих говорящего ${sb.ref} не из главы стихов записи (${x.refs.join('; ')})`);
  }

  // ---------- лица: имена, утверждения, карантин ----------
  const anchorMap = new Map<string, { kind?: string }>((base.anchors?.anchors ?? []).map((a: any) => [a.id, a]));
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
      if (f.needsSources && f.cert !== 'interpretation') err('толкование', w, 'пометка «нужен совет источников» — только у толкования');
      if (f.field === 'met') has('целостность', w, (f.value as any).id);
      // год в записи (К-8): до замены ссылкой calc (Д-7) не показывается и не выгружается; подписать такую запись — ошибка
      // ссылка на расчёт (02 § 3.10.2; Д-7): модель — у года до царей, схема — у года царя; числа года в записи нет
      if (f.calc) {
        const c = f.calc;
        if (!c.event?.trim()) err('расчёт', w, 'ссылка на расчёт без события');
        // событие — ссылка (02 § 3.10.2; Д-р8): история `e-…` из базы или стих из стихов самой записи; строка вместо ссылки — ошибка
        else if (c.event.startsWith('e-')) {
          if (!storyIds.has(c.event)) err('расчёт', w, `событие расчёта «${c.event}» — нет такой истории`);
        } else {
          const pe = parseRef(c.event, bible.chapterLength);
          if (!pe || pe.chapterOnly || !pe.verses.length) err('расчёт', w, `событие расчёта «${c.event}» — не стих и не история e-…`);
          else {
            const own = new Set(rs.flatMap((r) => parseRef(r, bible.chapterLength)?.verses.map(verseId) ?? []));
            if (!pe.verses.every((v) => own.has(verseId(v)))) err('расчёт', w, `событие расчёта «${c.event}» — не из стихов записи (${rs.join('; ')})`);
          }
        }
        if (c.model && !MODELS.includes(c.model)) err('расчёт', w, `модель «${c.model}» не из 04 § 16.1`);
        if (c.scheme && !SCHEMES.includes(c.scheme)) err('расчёт', w, `схема «${c.scheme}» не из 04 § 16.1`);
        if (c.model && c.scheme) err('расчёт', w, 'у ссылки на расчёт — модель или схема, не обе');
        for (const m of calcAnchorIssues(c, anchorMap, (w2, refs) => clean(refs.flatMap((r) => mainTexts(w, r)).join(' ')).includes(clean(w2)))) err('расчёт', w, m);
        if (!c.model && !c.scheme && !c.anchor) warn('расчёт', w, 'ссылка на расчёт без модели, схемы и опоры: для этого времени модели ещё нет (Д-7, Д-17)');
        if (yearIn(f.value)) err('расчёт', w, 'у записи со ссылкой на расчёт год в записи остался');
      }
      if (yearIn(f.value) && f.cert !== 'calc') {
        if (f.id && ledgerKeys.has(`fact:${f.id}`)) err('год', w, 'год в записи подписан: до замены ссылкой calc запись не выходит (Д-7)');
        else warn('год', w, 'год в записи без модели: не выгружается до замены ссылкой calc (Д-7)');
      }
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
      // подпись безымянного (02 § 3.2; К-20) проверяет checkDescriptors; у группы — описательное слово в стихах лица
      const dt = descriptorText(a);
      if (a.kind === 'group' && dt && !nameMatcher(dt).test(joined)) err('имя', a.id, `описательное слово «${dt}» не найдено в стихах лица`);
      continue;
    }
    const forms = a.names.map((n) => n.form);
    if (!forms.some((f) => nameMatcher(f).test(joined))) err('имя', a.id, `ни одна форма имени (${forms.join(', ')}) не найдена в стихах лица`);
    // каждая ссылка формы — стих, где эта форма стоит вне скобок, с учётом падежей (Д-р11; 02 § 3.8 п. 4)
    for (const n of a.names) {
      for (const r of n.refs) {
        const miss = formMissing(n.form, norm(mainTexts(a.id, r).join(' ')));
        if (miss.length) err('имя в стихе', `${a.id} «${n.form}»`, `в ${r} формы нет (${miss.join(', ')}): ссылка формы — стих, где она стоит вне скобок`);
      }
    }
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
      // не кровное ребро со словом текста (Иосиф — «родители Его», C47) — как «по закону»: не от союза (02 § 3.5)
      if (o.kind === 'legal' || o.kind === 'parents-word') x.legal = true;
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

  // ---------- форма имени лица: уровень тождества, тождество по форме, основание переадресации (02 § 3.3.5; К-18) ----------
  validateNameForms(base, err, warn);
  checkDescriptors(base, err);

  // ---------- стоп-список предания: утверждения, а не имена (02, § 7) ----------
  stopList(base, actors, err);
  return issues;
}

type Err = (check: string, where: string, msg: string) => void;

export const PLACE_KINDS = new Set([
  'settlement', 'campsite', 'mountain', 'hill', 'spring', 'well', 'pool', 'cave', 'tree', 'stone', 'altar', 'structure', 'gate', 'ford', 'island',
  'river', 'stream', 'sea', 'lake', 'land', 'region', 'desert', 'valley', 'field', 'mountain-range', 'road',
]);
/** Вода и земля — подпись без знака, только в точке подписи (02 § 3.13.1). */
export const PLACE_AREAL = new Set(['river', 'stream', 'sea', 'lake', 'land', 'region', 'desert', 'valley', 'field', 'mountain-range', 'road']);
const NAME_TYPES = new Set(['main', 'former', 'now', 'that-is', 'other-book', 'in-speech']);
const TIME_BASES = new Set(['story', 'narrator-now', 'former-by-verse', 'inferred']);
const PRECISION = new Set(['visible', 'tel', 'settlement', 'distance', 'water', 'terrain', 'path', 'region']);
const LINK_KINDS = new Set(['inferred-same', 'part-of', 'near']);
const TEXT_RELATIONS = new Set(['east-of', 'west-of', 'north-of', 'south-of', 'near', 'between', 'opposite', 'on-bank', 'in-land', 'outside-gate', 'distance-words', 'flows-by']);

/**
 * Проверки мест (02 § 3.13; 05 § 10). Коллекция регистрируется до первой записи (02 § 3.17; К-11): правила работают и на
 * пустой коллекции — тест подкладывает испорченную запись на каждое правило.
 */
export function validatePlaces(base: Base, err: Err, warn: Err, texts: (where: string, ref: string) => unknown, textOf?: (where: string, ref: string) => string) {
  const places = base.places ?? [];
  const reg = new Map((base.sources ?? []).map((s) => [s.id, s]));
  const ids = new Set<string>();
  for (const p of places) {
    const w = p.id || '(место без номера)';
    if (!/^l-[a-z0-9-]+$/.test(p.id ?? '')) err('место', w, 'номер места — вида «l-…»');
    if (ids.has(p.id)) err('место', w, 'номер места повторяется');
    ids.add(p.id);
  }
  for (const p of places) {
    const w = p.id;
    if (!PLACE_KINDS.has(p.kind)) err('место', w, `вид «${p.kind}» не из словаря`);
    // хотя бы одно имя со стихом; имя — всегда слова стиха (Р-8)
    if (!p.names?.some((n) => n.refs?.length)) err('место', w, 'нет ни одного имени со стихом');
    const parts = new Set<string>();
    const part = (id: string, kind: string) => {
      if (!new RegExp(`^${p.id.replace(/[-]/g, '\\-')}#${kind}\\d+$`).test(id ?? '')) err('место', w, `номер части «${id}» — вида ${p.id}#${kind}<число>`);
      if (parts.has(id)) err('место', w, `номер части «${id}» повторяется`);
      parts.add(id);
    };
    for (const n of p.names ?? []) {
      part(n.id, 'n');
      if (!n.form?.trim()) err('место', w, `имя ${n.id} без формы`);
      if (!NAME_TYPES.has(n.type)) err('место', w, `вид имени «${n.type}» не из словаря`);
      if (n.cert !== undefined && n.cert !== 'scripture') err('место', w, `имя ${n.id} уровня «${n.cert}»: имя места — только слова стиха (Р-8; К-8)`);
      for (const r of n.refs ?? []) {
        texts(`${w} ${n.id}`, r.ref);
        if (!TIME_BASES.has(r.timeBasis)) err('место', w, `у стиха ${r.ref} имени ${n.id} основание времени «${r.timeBasis}» не из словаря`);
      }
    }
    for (const x of p.positions ?? []) {
      part(x.id, 'pos');
      if (!(Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180)) err('место', w, `положение ${x.id}: координаты вне WGS 84`);
      // источник координат — номер реестра (Р-10; К-14); нет в реестре или закрыт — часть снимается до выпуска (К-15)
      if (!x.coordSource?.source) err('место', w, `положение ${x.id} без источника координат (coordSource.source)`);
      else if (!reg.has(x.coordSource.source)) warn('место', w, `источник координат «${x.coordSource.source}» положения ${x.id} не в реестре: точка снимается до выпуска (Д-10)`);
      if (x.precision && !PRECISION.has(x.precision.kind)) err('место', w, `точность «${x.precision.kind}» не из словаря`);
    }
    for (const l of p.links ?? []) {
      part(l.id, 'link');
      if (!LINK_KINDS.has(l.kind)) err('место', w, `вид связи «${l.kind}» не из словаря (другое имя по сводке — match.otherNameOf, мнение учёных — понимание)`);
      if (!ids.has(l.to)) err('место', w, `связь ${l.id}: нет места «${l.to}»`);
      if (l.kind === 'inferred-same' && (l.cert !== 'inference' || l.refs.length < 2)) err('место', w, `связь ${l.id} «то же, что» — уровень «вывод» и стихи обеих сторон`);
      if (l.kind !== 'inferred-same' && l.cert !== 'reference') err('место', w, `связь ${l.id} «${l.kind}» — уровень «справочно»`);
      for (const r of l.refs ?? []) texts(`${w} ${l.id}`, r);
    }
    if (p.labelPoint && !PLACE_AREAL.has(p.kind)) err('место', w, 'точка подписи — только у земли и воды');
    for (const t of p.textPositions ?? []) {
      part(t.id, 'tp');
      if (!TEXT_RELATIONS.has(t.relation)) err('место', w, `положение ${t.id}: отношение «${t.relation}» не из словаря (02 § 3.13.6)`);
      for (const o of t.others ?? []) if (!ids.has(o)) err('место', w, `положение ${t.id}: нет места «${o}»`);
      if (!t.words?.trim()) err('место', w, `положение ${t.id} без слов стиха`);
      else if (textOf && !textOf(w, t.ref).includes(t.words)) err('место', w, `положение ${t.id}: слов «${t.words}» нет среди слов-оснований ${t.ref}`);
    }
    if (p.match) {
      if (p.match.method === 'manual' && !p.match.checkedBy) err('место', w, 'ручное сопоставление со сводкой — со вторым ключом (checkedBy)');
      if (p.match.otherNameOf && !ids.has(p.match.otherNameOf)) err('место', w, `«другое имя» по сводке: нет места «${p.match.otherNameOf}»`);
    }
    if (p.degree !== undefined && !['certain', 'probable', 'possible', 'unknown'].includes(p.degree)) err('место', w, `степень «${p.degree}» не из словаря`);
  }
}

/** Текст для поиска формы места: строчные, «ё» = «е», тире внутри имени (без пробела перед ним) = дефис («Беэр—лахай—рои», «Аве— Ситтима»), пробелы схлопнуты. */
const placeText = (t: string) => norm(t).replace(/(?<=\p{L})[—–]\s?(?=\p{L})/gu, '-').replace(/\s+/g, ' ').trim();
/** Сколько раз форма стоит в тексте отдельными словами. */
export function formCount(text: string, form: string): number {
  const f = placeText(form).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!f) return 0;
  return [...placeText(text).matchAll(new RegExp(`(?<![\\p{L}-])${f}(?![\\p{L}-])`, 'gu'))].length;
}

const MENTION_ROLES = new Set(['where', 'from', 'to', 'via', 'mentioned']);
const MENTION_CERTS = new Set(['scripture', 'inference', 'reference']);
const ACTOR_ROLES = new Set(['born', 'dwelt', 'died', 'buried', 'came']);

/**
 * Упоминания мест (02 § 3.13.5; 05 § 13 п. 3): форма стоит в своём стихе среди слов-оснований (вне скобок и в скобках
 * вида «б», «г»); место существует; уровень связи — «Писание», «вывод» (со стихами вывода) или «справочно».
 */
export function validatePlaceMentions(base: Base, err: Err, mainTexts: (where: string, ref: string) => string[]) {
  const places = new Map((base.places ?? []).map((p) => [p.id, p]));
  const ids = new Set<string>();
  for (const m of base.placeMentions ?? []) {
    const w = m.id || '(упоминание без номера)';
    if (!/^lm-\d+$/.test(m.id ?? '')) err('упоминание места', w, 'номер упоминания — вида «lm-<число>»');
    if (ids.has(m.id)) err('упоминание места', w, 'номер упоминания повторяется');
    ids.add(m.id);
    if (!m.place && !m.candidates?.length) err('упоминание места', w, 'нет ни места, ни кандидатов');
    for (const x of [m.place, ...(m.candidates ?? [])]) if (x && !places.has(x)) err('упоминание места', w, `нет места «${x}»`);
    if (!MENTION_CERTS.has(m.cert)) err('упоминание места', w, `уровень связи «${m.cert}» — только «Писание», «вывод» или «справочно» (05 § 3.2)`);
    if (m.cert === 'inference' && !m.refs?.length) err('упоминание места', w, 'связь «вывод» — со стихами вывода (refs)');
    if (!MENTION_ROLES.has(m.role)) err('упоминание места', w, `роль «${m.role}» не из словаря`);
    if (m.status !== 'linked' && m.status !== 'disputed') err('упоминание места', w, `состояние «${m.status}» не из словаря`);
    for (const a of m.actors ?? []) if (!ACTOR_ROLES.has(a.role)) err('упоминание места', w, `роль лица «${a.role}» не из словаря`);
    for (const r of m.refs ?? []) mainTexts(w, r);
    const t = mainTexts(w, m.ref).join(' ');
    if (!(m.n >= 1)) err('упоминание места', w, 'номер вхождения формы — с единицы');
    else if (formCount(t, m.form ?? '') < m.n) err('упоминание места', w, `формы «${m.form}» нет среди слов-оснований стиха ${m.ref}${m.n > 1 ? ` (вхождение ${m.n})` : ''}`);
  }
  // слово о людях («Содомляне», «Египтяне», «Киринеянин») — не форма места (рецензия географа, Г-1)
  for (const m of base.placeMentions ?? []) {
    const last = placeText(m.form ?? '').split(' ').pop() ?? '';
    if (/ян(е|ин|ина|ину|ам|ами|ах)?$/u.test(last)) err('упоминание места', m.id, `«${m.form}» — слово о людях, а не имя места`);
  }
  // имя места со стихом — в этом стихе есть упоминание этого места (у мест, чьи упоминания уже записаны)
  const at = new Set((base.placeMentions ?? []).map((m) => `${m.place}|${m.ref}`));
  const withMentions = new Set((base.placeMentions ?? []).map((m) => m.place));
  for (const p of base.places ?? []) {
    if (!withMentions.has(p.id)) continue;
    for (const n of p.names ?? []) for (const r of n.refs ?? []) if (!at.has(`${p.id}|${r.ref}`)) err('упоминание места', p.id, `у имени «${n.form}» стих ${r.ref} без упоминания места`);
  }
}

/** Слова перехода (05 § 3.5): глаголы и обороты; отрезок пути есть только при них. */
const TRANSITION = /(^|[^\p{L}])(отправил\p{L}*|отправившись|двинул\p{L}*|пош[её]л|пошли|пришл?и|пришел|вышел|вышли|поднял\p{L}*|сош[её]л|сошли|прош[её]л|прошли|проходили|удалились|отплыли|приплыли|прибыли|возвратил\p{L}*|обратились|повел|оттуда|отсюда)(?![\p{L}])|(^|[^\p{L}])из [\p{L}-]+ в /u;
/** Слова повеления в предложении стоянки: «скажи…, чтобы они… расположились» (Исх 14:2), «пойди» (Быт 22:2). */
const COMMAND = /(^|[^\p{L}])(скажи|скажите|пойди|пойдите|иди|идите|повели|чтобы)(?![\p{L}])/u;
/** Предложение стиха до слов стоянки включительно: от последней точки, точки с запятой или двоеточия перед ними. */
function clauseBefore(text: string, words: string): string {
  const t = placeText(text);
  const i = t.indexOf(placeText(words));
  if (i < 0) return placeText(words);
  const head = t.slice(0, i);
  const cut = Math.max(head.lastIndexOf('.'), head.lastIndexOf(';'), head.lastIndexOf(':'));
  return t.slice(cut + 1, i + placeText(words).length);
}
const STOP_KINDS = new Set(['start', 'stop', 'return', 'pass', 'direction', 'sortie', 'intent']);

/**
 * Пути (02 § 3.13.8; 05 § 3.5): у стоянки — стих и слова стиха среди слов-оснований; место или земля существует, земля —
 * вида «земля» или «вода»; у отрезка — концы среди стоянок варианта и слова перехода в стихе.
 */
export function validateRoutes(base: Base, err: Err, mainTexts: (where: string, ref: string) => string[]) {
  const places = new Map((base.places ?? []).map((p) => [p.id, p]));
  const ids = new Set<string>();
  const has = (w: string, ref: string, words: string) => placeText(mainTexts(w, ref).join(' ')).includes(placeText(words));
  for (const r of base.routes ?? []) {
    const w = r.id || '(путь без номера)';
    if (!/^rt-[a-z0-9-]+$/.test(r.id ?? '')) err('путь', w, 'номер пути — вида «rt-…»');
    if (ids.has(r.id)) err('путь', w, 'номер пути повторяется');
    ids.add(r.id);
    if (!r.title?.words || !r.title.refs?.length) err('путь', w, 'имя пути — словами и главами текста');
    for (const x of r.title?.refs ?? []) mainTexts(w, x);
    if (!r.variants?.length) err('путь', w, 'нет ни одного варианта');
    for (const v of r.variants ?? []) {
      for (const x of v.refs ?? []) mainTexts(w, x);
      const ns = new Set<number>();
      for (const s of v.stops ?? []) {
        if (!STOP_KINDS.has(s.kind)) err('путь', w, `вид стоянки «${s.kind}» не из словаря`);
        if (s.n !== undefined) {
          if (ns.has(s.n)) err('путь', w, `номер стоянки ${s.n} повторяется`);
          ns.add(s.n);
        }
        const pl = s.place ?? s.land;
        if (pl && !places.has(pl)) err('путь', w, `стоянка ${s.ref}: нет места «${pl}»`);
        for (const x of s.between ?? []) if (!places.has(x)) err('путь', w, `стоянка ${s.ref}: нет места «${x}»`);
        if (s.between && s.between.length < 2) err('путь', w, `стоянка ${s.ref}: «между» — два места`);
        // повеление — не стоянка (05 § 3.5, правило 4): у стоянки со словами повеления — стих исполнения
        if ((s.kind === 'stop' || s.kind === 'return' || s.kind === 'start') && COMMAND.test(clauseBefore(mainTexts(w, s.ref).join(' '), s.words ?? ''))) {
          if (!s.fulfilled) err('путь', w, `стоянка ${s.ref}: слова повеления, а не рассказа — нужен стих исполнения (fulfilled)`);
          else if (!has(w, s.fulfilled.ref, s.fulfilled.words)) err('путь', w, `слов исполнения «${s.fulfilled.words}» нет в ${s.fulfilled.ref}`);
        }
        if (s.land && places.has(s.land) && !PLACE_AREAL.has(places.get(s.land)!.kind)) err('путь', w, `стоянка ${s.ref}: «${s.land}» — не земля и не вода`);
        if (!pl && !s.between?.length && s.kind !== 'direction' && s.kind !== 'intent') err('путь', w, `стоянка ${s.ref} без места`);
        if (!has(w, s.ref, s.words ?? '')) err('путь', w, `слов «${s.words}» нет среди слов-оснований ${s.ref}`);
        if (s.anchor) {
          if (!places.has(s.anchor.place)) err('путь', w, `привязка: нет места «${s.anchor.place}»`);
          if (s.anchor.cert === 'inference' && new Set([s.anchor.ref, ...(s.anchor.refs ?? [])]).size < 2) err('путь', w, 'привязка «вывод» — со стихами обеих сторон');
          if (s.anchor.words && !has(w, s.anchor.ref, s.anchor.words)) err('путь', w, `слов привязки «${s.anchor.words}» нет в ${s.anchor.ref}`);
        }
      }
      for (const g of v.segments ?? []) {
        if (!ns.has(g.from) || !ns.has(g.to)) err('путь', w, `отрезок ${g.from} → ${g.to}: нет такой стоянки`);
        if (g.mode !== 'land' && g.mode !== 'sea') err('путь', w, `вид отрезка «${g.mode}» не из словаря`);
        if (!has(w, g.ref, g.words ?? '')) err('путь', w, `слов «${g.words}» нет среди слов-оснований ${g.ref}`);
        else if (!TRANSITION.test(placeText(g.words))) err('путь', w, `отрезок ${g.from} → ${g.to} (${g.ref}): нет слов перехода (05 § 3.5)`);
        for (const a of g.also ?? []) if (!has(w, a.ref, a.words)) err('путь', w, `слов «${a.words}» нет среди слов-оснований ${a.ref}`);
        for (const t of g.travellers ?? []) if (!t.startsWith('p-')) err('путь', w, `путник отрезка «${t}» — не номер лица`);
      }
      for (const d of v.days ?? []) if (!has(w, d.ref, d.words)) err('путь', w, `слов о днях пути «${d.words}» нет в ${d.ref}`);
    }
  }
}

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
  // другое имя без тождества «сказано» — своя карточка, не форма (02 § 3.3.4; Р-1, Д-4): Левий, Фаддей и Леввей
  if (named('p-matfey', 'Левий', 'Левий Алфеев')) err(S, 'p-matfey', 'Левий (Мк 2:14; Лк 5:27) — своя карточка: тождество с Матфеем не сказано');
  // Фаддей и Иуда Иаковлев — вид (б) (02 ред. 4.4; Д-15): формы «Иуда…» у Фаддея — только уровня «выв.», не «Писание»
  for (const n of actors.get('p-faddey')?.names ?? []) if (/^Иуда/.test(n.form) && n.cert !== 'inference') err(S, 'p-faddey', `форма «${n.form}» у Фаддея — уровня «выв.»: тождество с Иудой Иаковлевым не сказано, а выведено по перечню двенадцати (02 § 3.3.4)`);
  // Рагуил и Иофор — вид (в) (02 ред. 4.4; Д-15): своя карточка Рагуила, у Иофора формы «Рагуил» нет
  if (named('p-iofor', 'Рагуил')) err(S, 'p-iofor', 'Рагуил (Исх 2:18; Чис 10:29) — своя карточка: тождество с Иофором не сказано (02 § 3.3.4)');
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
