/**
 * Проверка данных времени окончательного вида (Д6; 02 § 3.15; 04 § 9): хронологические входы, эпохи нового вида, модели
 * и схемы, опоры с трудами. Вызывается из validate.ts; функции текста и ссылок передаются оттуда.
 */
import type { Base } from './migrate.ts';
import type { Anchor, Calc, ChronoD6, ChronoModel, KingScheme, Source } from './types.ts';
import { TIME_KINDS } from './types.ts';
import { numberSpans } from './numwords.ts';
import { citeIssues } from './sources.ts';
import { loadBible } from '../bible.ts';

export const MODELS = ['m-dolgoe', 'm-kratkoe', 'm-farra70', 'm-skobki'];
export const SCHEMES = ['s-mcfall-young', 's-thiele', 's-galil'];

export interface TimeCtx {
  err: (check: string, where: string, msg: string) => void;
  warn: (check: string, where: string, msg: string) => void;
  /** Тексты стихов ссылки вне скобок (по стиху). */
  mainTexts: (where: string, ref: string) => string[];
  /** Стихи ссылки как ключи «Книга гл:ст». */
  verseKeys: (ref: string) => string[];
  clean: (t: string) => string;
  actorIds: Set<string>;
  /** Лицо названо в тексте стиха (любой формой имени, по основе). */
  namedIn: (actor: string, text: string) => boolean;
}

const OTHER_REQUIRED = new Set(['age-at-birth', 'synchronism', 'succeeded', 'under-king']);
const EVENT_REQUIRED = new Set(['age-at-event', 'years-after']);
const NUMBER_REQUIRED = new Set(['age-at-birth', 'age-at-death', 'end-of-life', 'reign', 'age-at-accession', 'synchronism', 'age-at-event', 'years-after']);
/** Слова о смерти вне скобок: «умер», «умерла», «скончался», «почил» (не «не видел смерти», Евр 11:5). */
const DEATH_WORDS = /(^|[^а-яё])(умер|умерл|скончал|почил)/;
/** Поля готовых лет прежнего вида. */
const YEAR_KEYS = ['year', 'from', 'to', 'start', 'end', 'range', 'sole'];

const isD6 = (c: unknown): c is ChronoD6 => !!c && typeof c === 'object' && Array.isArray((c as any).inputs);

/**
 * Опора и срок у ссылки на расчёт (02 § 3.10.2 [4.5; 4.6]; К-21): опора — только вида `external`; при опоре нет модели и схемы;
 * срок — только от опоры, с числом, словами стиха и видом счёта. `wordsIn` — слова стоят в стихах вне скобок.
 */
export function calcAnchorIssues(c: Calc, anchors: Map<string, { kind?: string }>, wordsIn: (words: string, refs: string[]) => boolean): string[] {
  const out: string[] = [];
  if (c.anchor !== undefined) {
    const a = anchors.get(c.anchor);
    if (!a) out.push(`нет опоры «${c.anchor}»`);
    else if (a.kind !== 'external') out.push(`опора «${c.anchor}» вида «${a.kind ?? '—'}»: год записям даёт только опора вида external (расчёт и предание года не дают)`);
    if (c.model || c.scheme) out.push('у ссылки на расчёт с опорой нет модели и схемы');
  }
  if (c.offset !== undefined) {
    const o = c.offset;
    if (c.anchor === undefined) out.push('срок (offset) — только от опоры: срок от события без опоры года не даёт');
    if (typeof o.number !== 'number') out.push('срок без числа');
    if (o.count !== 'ordinal' && o.count !== 'elapsed') out.push('у срока нет вида счёта (count: ordinal — порядковый год, elapsed — прошедший срок)');
    if (!o.refs?.length) out.push('срок без стиха');
    else if (!o.words || !wordsIn(o.words, o.refs)) out.push(`слов срока «${o.words ?? ''}» нет в ${o.refs.join('; ')} вне скобок`);
    else if (numberSpans(o.words)[0]?.value !== o.number) out.push(`слова срока «${o.words}» — не число ${o.number}`);
  }
  return out;
}

export function checkTime(base: Base, x: TimeCtx) {
  const { err, warn } = x;
  const epochIds = new Set(base.epochs.map((e) => e.id));
  const readings = new Map(base.readings.map((r) => [r.id, new Set(r.readings.map((y) => y.id))]));
  const reg = new Map<string, Source>((base.sources ?? []).map((s) => [s.id, s]));
  // база из переноса в памяти (buildBase) реестра не несёт: ссылки на труды проверяются у базы с диска (как validateRegistry)
  const cites = (works: unknown, where: string) => (base.sources === undefined ? [] : citeIssues(works, reg, where));
  const anchorIds = new Set<string>((base.anchors?.anchors ?? []).map((a: any) => a.id));
  const anchorMap = new Map<string, Anchor>((base.anchors?.anchors ?? []).map((a: any) => [a.id, a]));
  /** Слова стоят в стихах ссылки вне скобок. */
  const wordsIn = (where: string, words: string, refs: string[]) => x.clean(refs.flatMap((r) => x.mainTexts(where, r)).join(' ')).includes(x.clean(words));
  const yearsLeft = (v: unknown, path = ''): string[] => {
    if (Array.isArray(v)) return v.flatMap((y, i) => yearsLeft(y, `${path}[${i}]`));
    if (!v || typeof v !== 'object') return [];
    return Object.entries(v).flatMap(([k, y]) => (YEAR_KEYS.includes(k) && (typeof y === 'number' || Array.isArray(y)) ? [`${path}.${k}`] : yearsLeft(y, `${path}.${k}`)));
  };

  // ---------- хронологические входы окончательного вида ----------
  for (const c of base.chrono) {
    if (!isD6(c.chrono)) continue;
    const w = `время ${c.actor}`;
    const ch = c.chrono;
    for (const k of ['born', 'died', 'reign', 'active']) if (k in (ch as any)) err('время', w, `поле прежнего вида «${k}» рядом со входами окончательного вида`);
    for (const p of yearsLeft(ch)) err('время', w, `готовый год в записи (${p}): годы считает сеть по модели или схеме (02 § 3.15)`);
    if (ch.epoch !== undefined && !epochIds.has(ch.epoch)) err('целостность', w, `нет эпохи «${ch.epoch}»`);
    for (const e of ch.epochs ?? []) {
      if (!epochIds.has(e.era)) err('целостность', w, `нет эпохи «${e.era}»`);
      if (!e.refs.length) err('стих', w, `эпоха «${e.era}» без стиха: такая эпоха — прежней строкой epoch (04 § 3.2)`);
    }
    // «конец земной жизни» (end-of-life): смерти текст не называет — у лица нет входа «возраст при смерти» (Д6-3)
    const kinds = new Set(ch.inputs.map((t) => t.kind));
    if (kinds.has('end-of-life') && kinds.has('age-at-death')) err('время', w, 'у лица и «возраст при смерти», и «конец земной жизни»: вход один — по тому, называет ли текст смерть');
    ch.inputs.forEach((t, i) => {
      const wi = `${w} вход ${i + 1} (${t.kind})`;
      if (t.endOfLife !== undefined && t.kind !== 'end-of-life') err('время', wi, 'поле endOfLife — только у входа «конец земной жизни»');
      if (t.kind === 'end-of-life') {
        if (t.of) err('время', wi, '«конец земной жизни» без поля of: это вся длина жизни, а не ограничение события');
        const raw = t.refs.flatMap((r) => x.verseKeys(r)).map((k) => loadBible().verses.get(k) ?? '').join(' ');
        const bracketed = (raw.match(/\[[^\]]*\]/g) ?? []).join(' ');
        if (t.endOfLife === 'bracket' && !DEATH_WORDS.test(bracketed.toLowerCase())) err('время', wi, 'endOfLife: bracket, а в скобках стихов входа смерти нет');
        else if (t.endOfLife === 'not-died') {
          // слова — в стихах самого лица (где оно названо вне скобок): «не видел смерти» или «не стало его… Бог взял его» целиком (К-21)
          const own = t.refs.flatMap((r) => x.mainTexts(wi, r)).map((v) => x.clean(v)).filter((v) => x.namedIn(c.actor, v));
          if (!own.some((v) => /не видел смерти/.test(v) || (/не стало его/.test(v) && /бог взял его/.test(v)))) err('время', wi, 'endOfLife: not-died, а в стихах, где названо само лицо, нет слов «не видел смерти» или «не стало его… Бог взял его»');
        }
        else if (t.endOfLife === undefined) err('время', wi, '«конец земной жизни» без причины (endOfLife: not-died — смерти не было; bracket — смерть только в скобках)');
        if (t.refs?.length && DEATH_WORDS.test(x.clean(t.refs.flatMap((r) => x.mainTexts(wi, r)).join(' ')))) err('время', wi, 'в стихах входа вне скобок названа смерть: вид — «возраст при смерти» (age-at-death)');
      }
      if (!TIME_KINDS.includes(t.kind)) err('время', wi, `вид входа «${t.kind}» не из 02 § 3.15.5`);
      if (!t.refs?.length) err('стих', wi, 'вход без стиха');
      if (OTHER_REQUIRED.has(t.kind) && !t.other) err('время', wi, 'нет второго участника (other)');
      if (EVENT_REQUIRED.has(t.kind) && !t.event?.text) err('время', wi, 'нет события текста (event)');
      if (t.other && !x.actorIds.has(t.other)) err('целостность', wi, `нет лица «${t.other}»`);
      if (NUMBER_REQUIRED.has(t.kind) && t.number === undefined) err('время', wi, 'нет числа');
      if (t.reading) {
        const set = readings.get(t.reading.set);
        if (!set) err('целостность', wi, `нет набора прочтений «${t.reading.set}»`);
        else if (!set.has(t.reading.in)) err('целостность', wi, `в наборе «${t.reading.set}» нет прочтения «${t.reading.in}»`);
      }
      // число текста — словами стиха вне скобок; число вывода — из слагаемых, каждое в своём стихе (04 § 17.2)
      if (t.number !== undefined && t.cert === 'scripture') {
        if (!t.words) err('число', wi, `число ${t.number} без слов стиха`);
        else if (!wordsIn(wi, t.words, t.refs)) err('число', wi, `слов «${t.words}» нет в ${t.refs.join('; ')} вне скобок`);
        else if (numberSpans(t.words)[0]?.value !== t.number) err('число', wi, `слова «${t.words}» — не число ${t.number}`);
      }
      if (t.atYear && !wordsIn(wi, t.atYear.words, t.refs)) err('число', wi, `слов «${t.atYear.words}» нет в ${t.refs.join('; ')}`);
      if (t.words && t.number === undefined && !wordsIn(wi, t.words, t.refs)) err('цитата', wi, `слов «${t.words}» нет в ${t.refs.join('; ')} вне скобок`);
      if (t.cert === 'inference' && t.number !== undefined) {
        if (!t.parts?.length && !t.words) warn('число', wi, `вывод ${t.number} без слагаемых`);
        for (const p of t.parts ?? []) {
          if (!wordsIn(wi, p.words, [p.ref])) err('число', wi, `слагаемого «${p.words}» нет в ${p.ref} вне скобок`);
          else if (numberSpans(p.words)[0]?.value !== p.number) err('число', wi, `слова «${p.words}» — не число ${p.number}`);
        }
      }
      if (t.count !== undefined && t.kind !== 'years-after') err('время', wi, 'вид счёта (count) — только у входа «N-й год после события» (years-after)');
      if (t.kind === 'years-after' && t.count !== 'ordinal' && t.count !== 'elapsed') err('время', wi, '«N-й год после события» без вида счёта: count — ordinal («в сороковой год») или elapsed («спустя …»; 02 § 3.15.5)');
      if (t.calc) {
        for (const m of calcAnchorIssues(t.calc, anchorMap, (w2, rs) => wordsIn(wi, w2, rs))) err('расчёт', wi, m);
        if (!t.calc.event?.trim()) err('расчёт', wi, 'ссылка на расчёт без события');
        else {
          const own = new Set(t.refs.flatMap(x.verseKeys));
          if (!x.verseKeys(t.calc.event).every((v) => own.has(v))) err('расчёт', wi, `событие расчёта «${t.calc.event}» — не из стихов входа`);
        }
        if (t.calc.model && !MODELS.includes(t.calc.model)) err('расчёт', wi, `модель «${t.calc.model}» не из 04 § 16.1`);
        if (t.calc.scheme && !SCHEMES.includes(t.calc.scheme)) err('расчёт', wi, `схема «${t.calc.scheme}» не из 04 § 16.1`);
        if (t.calc.model && t.calc.scheme) err('расчёт', wi, 'у ссылки на расчёт — модель или схема, не обе');
        if (!t.calc.model && !t.calc.scheme && !t.calc.anchor) warn('расчёт', wi, 'ссылка на расчёт без модели, схемы и опоры: для этого времени модели в 04 нет (Д-р2, Д-17)');
      }
    });
  }

  // ---------- эпохи окончательного вида (02 § 3.15.1) ----------
  const endOf = new Map<string, string>();
  for (const c of base.chrono) if (isD6(c.chrono)) for (const t of c.chrono.inputs) if (t.kind === 'age-at-death' || t.kind === 'end-of-life') endOf.set(c.actor, t.kind);
  for (const e of base.epochs) {
    if (typeof e.start !== 'object' || e.start === null) continue;
    const w = `эпоха ${e.id}`;
    for (const k of ['start', 'end'] as const) {
      const b = e[k];
      // граница без стиха — только условная и со словами, почему (04 § 3.2: эпоха 16 «После канона», стих «—»; решение П1-3)
      const freeEdge = e.boundary === 'conventional' && !!b?.event && !b.refs?.length && !!b.note?.trim() && !b.rule;
      if (!b?.event || (!b.refs?.length && !freeEdge)) err('эпоха', w, `${k === 'start' ? 'начало' : 'конец'} — без события или стиха`);
      else if (b.words && !wordsIn(w, b.words.replace(/…/g, ' '), b.refs)) {
        // слова границы могут быть выпиской через «…»: каждая часть — в стихах
        if (!b.words.split('…').every((part: string) => wordsIn(w, part, b.refs))) err('цитата', w, `слов «${b.words}» нет в ${b.refs.join('; ')}`);
      }
      if (b?.rule?.person && !x.actorIds.has(b.rule.person)) err('целостность', w, `нет лица «${b.rule.person}»`);
      if (b?.rule?.anchor && !anchorIds.has(b.rule.anchor)) err('целостность', w, `нет опоры «${b.rule.anchor}»`);
    }
    if (!['exact', 'estimated', 'conventional'].includes(e.boundary)) err('эпоха', w, `вид границы «${e.boundary}» — exact, estimated или conventional`);
    // правило события по лицу: «смерть» — только у лица, чья смерть названа; «конец земной жизни» — только у лица с таким входом
    for (const r of [e.start?.rule, e.end?.rule, ...(e.events ?? []).map((v: any) => v.rule)]) {
      if (!r?.person || !r.of) continue;
      const end = endOf.get(r.person);
      if (r.of === 'death' && end === 'end-of-life') err('эпоха', w, `правило «смерть» у ${r.person}: Писание смерти не называет — правило of: end-of-life (Д6-3)`);
      if (r.of === 'end-of-life' && end !== 'end-of-life') err('эпоха', w, `правило «конец земной жизни» у ${r.person}, а такого входа у лица нет`);
      if (!['death', 'end-of-life', 'birth'].includes(r.of)) err('эпоха', w, `правило события of: «${r.of}» — birth, death или end-of-life`);
    }
    if (!e.definition) err('эпоха', w, 'нет определения (PeriodO)');
    for (const p of yearsLeft({ ...e, start: undefined, end: undefined })) err('эпоха', w, `готовый год в эпохе (${p})`);
    for (const p of yearsLeft([e.start, e.end])) err('эпоха', w, `готовый год в границе (${p})`);
  }

  // ---------- модели и схемы (02 § 3.15.2–3.15.3) ----------
  for (const m of (base.models ?? []) as (ChronoModel | KingScheme)[]) {
    const w = `модель ${m.id}`;
    if (m.type === 'model') {
      if (!MODELS.includes(m.id)) err('модель', w, 'номер модели не из 04 § 16.1');
      for (const r of m.readings) if (!readings.get(r.set)?.has(r.in)) err('целостность', w, `нет прочтения «${r.set}/${r.in}»`);
      for (const a of m.anchors) if (!anchorIds.has(a)) err('целостность', w, `нет опоры «${a}»`);
      if (m.scheme && !SCHEMES.includes(m.scheme)) err('целостность', w, `нет схемы «${m.scheme}»`);
      if (m.basis === 'interpretation' && !m.works?.length && !m.needsSources) err('модель', w, 'модель на толковании — с трудами или пометкой needsSources');
      if (m.basis === 'interpretation' && m.default) err('модель', w, 'модель на толковании не бывает моделью по умолчанию');
    } else {
      if (!SCHEMES.includes(m.id)) err('модель', w, 'номер схемы не из 04 § 16.1');
      for (const i of cites(m.works, w)) (i.level === 'error' ? err : warn)('труды', i.where, i.msg);
      for (const r of m.table) if (!x.actorIds.has(r.king)) err('целостность', w, `нет царя «${r.king}»`);
      const noPage = m.table.filter((r) => !r.page);
      if (noPage.some((r) => !r.source)) err('модель', w, 'строка таблицы без страницы и без слов, откуда годы');
      if (noPage.length) warn('модель', w, `${noPage.length} строк таблицы без страницы автора — не таблица автора, в выпуск не идут (04 § 16.1)`);
      for (const a of m.anchors) if (!anchorIds.has(a)) err('целостность', w, `нет опоры «${a}»`);
    }
  }

  // ---------- опоры с трудами (02 § 3.15.4 [4.6]; К-21) ----------
  for (const a of base.anchors?.anchors ?? []) {
    const w = `опора ${a.id}`;
    if (!['external', 'calc', 'tradition'].includes(a.kind)) err('опора', w, `вид опоры «${a.kind ?? '—'}» — external, calc или tradition (02 § 3.15.4)`);
    const y = a.year;
    if (!y || typeof y.earliest !== 'number' || typeof y.latest !== 'number' || !y.words?.trim()) err('опора', w, 'год опоры — промежуток {earliest, latest, words} (02 § 3.15)');
    else if (y.earliest > y.latest) err('опора', w, `год опоры: earliest ${y.earliest} позже latest ${y.latest}`);
    if ('value' in a) err('опора', w, 'одно число value вместо промежутка year (Д-20)');
    if ('derived' in a) err('опора', w, 'готовые производные годы (derived) в опоре: годы событий считает расчёт (Д-20)');
    if (!Array.isArray(a.log) || !a.log.length) err('опора', w, 'нет журнала изменений log (02 § 3.15.4)');
    for (const [i, alt] of (a.alternatives ?? []).entries()) {
      const wa = `${w}, альтернатива ${i + 1}`;
      if (!alt || typeof alt !== 'object') {
        err('опора', wa, `альтернатива строкой «${String(alt)}»: нужна запись {year, words, works} (Д-20)`);
        continue;
      }
      if (typeof alt.year?.earliest !== 'number' || typeof alt.year?.latest !== 'number' || alt.year.earliest > alt.year.latest) err('опора', wa, 'год альтернативы — промежуток {earliest, latest}');
      if (!alt.words?.trim()) err('опора', wa, 'альтернатива без слов');
      if (!alt.works?.length) err('опора', wa, 'альтернатива без труда (works; 02 § 3.15.4)');
    }
    if (a.works) for (const i of cites(a.works, `опора ${a.id}`)) (i.level === 'error' ? err : warn)('труды', i.where, i.msg);
    for (const alt of a.alternatives ?? []) if (alt && typeof alt === 'object' && alt.works) for (const i of cites(alt.works, `опора ${a.id}, альтернатива`)) (i.level === 'error' ? err : warn)('труды', i.where, i.msg);
    if (!a.works?.length) warn('опора', `опора ${a.id}`, 'нет издания и страницы: опора в выпуск не идёт (04 § 9 п. 19)');
  }
}
