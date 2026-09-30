/**
 * Проверка хронологии по всем лицам всех моделей (этап 13; X1 § 3, пороги STAGE13 П8–П15):
 *
 *   npx tsx tools/chrono-audit.ts            — числа и примеры
 *   npx tsx tools/chrono-audit.ts --json     — то же одним объектом (для теста tests/chrono-audit.test.ts)
 *
 * Что считается (в каждой модели):
 *  П8   числа текста, которые решатель не выполнил (возраст отца и матери, смещение, возраст при смерти и воцарении,
 *       явные годы, границы «не раньше / не позже», допустимые интервалы) — больше полугода;
 *  П9   матери старше 45 лет при оценочных годах вне эпох долгих жизней и вне напряжений; жёны старше мужа больше чем
 *       на 15 лет вне напряжений; отцы моложе 16 лет при оценочных годах вне напряжений;
 *  П10  показанный год рождения (словарь дат) за границей текста; ребёнок позже смерти отца больше чем на год вне
 *       напряжения; промежуток «X–X»;
 *  П11  эпоха жизни: у лиц со служением или царствованием — эпоха этих лет; из лиц, засвидетельствованных только
 *       в 30 г. (Страстная седмица), «Апостольская Церковь» — ни у кого; лица Евангелий вне родословий Мф 1 и Лк 3
 *       с «Межзаветным временем» — ни одного;
 *  П12  «ок.» у годов по числам и реконструкции; оценки шире 10 лет без «между»;
 *  П13  годы, которые меняются между моделями (IdxPerson.modelDep): число лиц и сдвиги после Исхода;
 *  П14  синхронизмы, расходящиеся с началом царствования (или единоличного царствования) больше чем на год, без note;
 *  П15  напряжения: четыре из ТЗ § 3.6 в каждой модели; трудность 430 лет — одна запись; нет «Вооз — Руфь»; в «Фарре 70» —
 *       Деян 7:4, в «Кратком пребывании» — остаток Левия и Иохаведы; «по возрастам, названным в тексте» — только у лиц
 *       со своими числами; в «Фарре 70» Аран, Аврам и Нахор родились в разные годы, Аврам старший.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bible.ts';
import { buildGraph, fatherOf, motherOf, type Graph } from '../src/engine/graph.ts';
import { solveChronology, noteModelDifferences, modelDependence, MODELS, type ChronoResult, type ChronoModelId, type PersonChrono } from '../src/engine/chronology.ts';
import { toAstro, lifeText, lifeDates, isWide, shownPoint, wideEnds, dateText, type DateVal } from '../src/engine/years.ts';
import type { Epoch, Person, Volume } from '../src/data/types.ts';

const LONG_LIVES = new Set(['antediluvian', 'postdiluvian']);

export interface ModelAudit {
  model: ChronoModelId;
  numbers: string[];
  mothers45: string[];
  wivesOlder15: string[];
  fathers16: string[];
  /** Братья и сёстры с порядком рождения в данных (order): младший по порядку родился раньше старшего (по показанным годам). */
  siblingOrder: string[];
  shownOutOfBounds: string[];
  afterFatherDeath: string[];
  sameYearSpan: string[];
  activityEpoch: string[];
  passionApostolic: string[];
  gospelIntertestamental: string[];
  approxOnCalc: string[];
  wideWithoutBetween: string[];
  /**
   * Предупреждение (X1 приложение Б, п. 13): у лица «время не установлено» эпоха из данных не пересекается со скобкой,
   * найденной по встрече, родне или главе упоминания (Лоида: «Межзаветное время», а скобка — по 2 Тим 1:5).
   */
  epochVsBracket: string[];
  tz36: Record<'levi' | 'salmon' | 'ahaz' | 'mordecai', number>;
  sojourn430: number;
  voozRuth: number;
  ageWordsWithoutNumbers: string[];
  special: Record<string, boolean>;
  tensions: number;
}
export interface Audit {
  models: ModelAudit[];
  modelDep: { persons: number; afterExodus: Record<string, number> };
  syncNoNote: string[];
  terah70: { aran: number; avraam: number; nakhor: number; oldest: boolean };
}

function loadData(): { persons: Person[]; epochs: Epoch[] } {
  const dir = join(ROOT, 'data/persons');
  const persons: Person[] = [];
  const seen = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const v = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Volume;
    for (const p of v.persons) if (!seen.has(p.id)) { seen.add(p.id); persons.push(p); }
  }
  const epochs = JSON.parse(readFileSync(join(ROOT, 'data/epochs.json'), 'utf8')) as Epoch[];
  return { persons, epochs };
}

const nm = (g: Graph, id: string) => `${g.persons.get(id)?.name ?? id} [${id}]`;
const dated = (c: PersonChrono) => c.cls !== 'epochal' && !c.named;
const inTension = (res: ChronoResult, ...ids: string[]) => res.tensions.some((t) => ids.every((x) => t.persons.includes(x)));
const anyTension = (res: ChronoResult, id: string) => res.tensions.some((t) => t.persons.includes(id));

function auditModel(g: Graph, res: ChronoResult, modelId: ChronoModelId): ModelAudit {
  const P = res.persons;
  const lxx = modelId === 'lxx';
  const out: ModelAudit = {
    model: modelId, numbers: [], mothers45: [], wivesOlder15: [], fathers16: [], siblingOrder: [], shownOutOfBounds: [], afterFatherDeath: [], sameYearSpan: [],
    activityEpoch: [], passionApostolic: [], gospelIntertestamental: [], approxOnCalc: [], wideWithoutBetween: [], epochVsBracket: [],
    tz36: { levi: 0, salmon: 0, ahaz: 0, mordecai: 0 }, sojourn430: 0, voozRuth: 0, ageWordsWithoutNumbers: [], special: {}, tensions: res.tensions.length,
  };
  const off = (what: string, id: string, got: number, want: number) => {
    if (Math.abs(got - want) > 0.5) out.numbers.push(`${nm(g, id)}: ${what} ${Math.round(got * 10) / 10} ≠ ${want}`);
  };
  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = P.get(id)!;
    const ch = p.chrono;
    if (!ch || c.named) continue;
    const f = fatherOf(g, id);
    const m = motherOf(g, id);
    const born = ch.born;
    const epochal = c.cls === 'epochal';
    if (born && !epochal) {
      let fa = lxx && born.fatherAgeBracket !== undefined ? born.fatherAgeBracket : born.fatherAge;
      if (modelId === 'terah70' && id === 'avraam') fa = 70;
      const soft = born.cert === 'interpretation' && !(modelId === 'terah70' && id === 'avraam');
      if (fa !== undefined && f && !soft && dated(P.get(f)!)) off('возраст отца', id, c.b - P.get(f)!.b, fa);
      if (born.motherAge !== undefined && m && dated(P.get(m)!)) off('возраст матери', id, c.b - P.get(m)!.b, born.motherAge);
      if (born.offset && P.has(born.offset.from) && dated(P.get(born.offset.from)!)) off('смещение', id, c.b - P.get(born.offset.from)!.b, born.offset.years);
      if (born.year !== undefined) off('год рождения', id, c.b, toAstro(born.year));
      const lim = (x: { from: string; years: number } | undefined) => (x && P.has(x.from) && dated(P.get(x.from)!) ? P.get(x.from)!.b + x.years : null);
      const na = lim(born.notAfter);
      const nb = lim(born.notBefore);
      if (na !== null && c.b > na + 0.5) out.numbers.push(`${nm(g, id)}: рождение ${Math.round(c.b - na)} лет после границы «не позже»`);
      if (nb !== null && c.b < nb - 0.5) out.numbers.push(`${nm(g, id)}: рождение ${Math.round(nb - c.b)} лет до границы «не раньше»`);
      if (born.range && (c.b < toAstro(born.range[0]) - 0.5 || c.b > toAstro(born.range[1]) + 0.5)) out.numbers.push(`${nm(g, id)}: рождение вне допустимого интервала`);
    }
    if (ch.died && !epochal && c.d !== null) {
      const age = lxx && ch.died.ageBracket !== undefined ? ch.died.ageBracket : ch.died.age;
      if (age !== undefined) off('возраст при смерти', id, c.d - c.b, age);
      if (ch.died.year !== undefined) off('год смерти', id, c.d, toAstro(ch.died.year));
      if (ch.died.range && (c.d < toAstro(ch.died.range[0]) - 0.5 || c.d > toAstro(ch.died.range[1]) + 0.5)) out.numbers.push(`${nm(g, id)}: смерть вне допустимого интервала`);
    }
    for (const r of ch.reign ?? []) if (r.ageAtStart !== undefined && !epochal) off('возраст при воцарении', id, toAstro(r.start) - c.b, r.ageAtStart);
  }

  // П9: матери, жёны, отцы — при оценочных годах, вне напряжений
  for (const id of g.order) {
    const c = P.get(id)!;
    if (!dated(c)) continue;
    for (const e of g.parentsOf.get(id) ?? []) {
      if ((e.kind !== 'father' && e.kind !== 'mother') || e.gap) continue;
      const pc = P.get(e.parent)!;
      if (!dated(pc)) continue;
      const age = c.b - pc.b;
      const est = c.cls === 'estimated' || pc.cls === 'estimated';
      if (!est || inTension(res, e.parent, id) || anyTension(res, id) && res.tensions.some((t) => t.persons.includes(id) && t.persons.includes(e.parent))) continue;
      const ep = c.birthEpoch ?? c.epoch;
      if (e.kind === 'mother' && age > 45 && !LONG_LIVES.has(ep ?? '') && g.persons.get(id)!.chrono?.born?.motherAge === undefined) out.mothers45.push(`${nm(g, e.parent)} → ${nm(g, id)}: ${Math.round(age)}`);
      if (e.kind === 'father' && age < 16) out.fathers16.push(`${nm(g, e.parent)} → ${nm(g, id)}: ${Math.round(age * 10) / 10}`);
    }
  }
  const seenSp = new Set<string>();
  for (const [id, edges] of g.spousesOf) for (const s of edges) {
    const k = `${s.a}|${s.b}`;
    if (seenSp.has(k) || s.a !== id) continue;
    seenSp.add(k);
    const [h, w] = g.persons.get(s.a)!.sex === 'm' ? [s.a, s.b] : [s.b, s.a];
    if (g.persons.get(h)!.sex !== 'm' || g.persons.get(w)!.sex !== 'f') continue;
    const ch = P.get(h)!;
    const cw = P.get(w)!;
    if (!dated(ch) || !dated(cw)) continue;
    if (ch.b - cw.b > 15 && !inTension(res, h, w) && !anyTension(res, w)) out.wivesOlder15.push(`${nm(g, h)} — ${nm(g, w)}: ${Math.round(ch.b - cw.b)}`);
  }

  // порядок рождения из данных (решение 104; T4): у детей одного отца с order год рождения не убывает
  for (const id of g.order) {
    const kids = (g.childrenOf.get(id) ?? []).filter((e) => e.kind === 'father' && !e.gap).map((e) => e.child).filter((k) => g.persons.get(k)!.order !== undefined && dated(P.get(k)!));
    kids.sort((a, b) => g.persons.get(a)!.order! - g.persons.get(b)!.order!);
    for (let i = 1; i < kids.length; i++)
      for (let j = 0; j < i; j++) {
        const [older, younger] = [kids[j], kids[i]];
        if (g.persons.get(older)!.order === g.persons.get(younger)!.order) continue;
        const yo = Math.round(P.get(older)!.b);
        const yy = Math.round(P.get(younger)!.b);
        if (yy < yo && !inTension(res, older, younger)) out.siblingOrder.push(`${nm(g, older)} (${g.persons.get(older)!.order}) ${yo} > ${nm(g, younger)} (${g.persons.get(younger)!.order}) ${yy}`);
      }
  }

  // П10: показанные годы
  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = P.get(id)!;
    if (c.cls !== 'estimated' || c.named) continue;
    const ld = lifeDates(c);
    if (!ld) continue;
    const b = ld.birth;
    const [lo, hi] = shownEnds(b);
    const born = p.chrono?.born;
    const lim = (x: { from: string; years: number } | undefined) => (x && P.has(x.from) && dated(P.get(x.from)!) ? P.get(x.from)!.b + x.years : null);
    const na = lim(born?.notAfter);
    const nb = lim(born?.notBefore);
    let hiB = na ?? Infinity;
    let loB = nb ?? -Infinity;
    if (born?.range) {
      loB = Math.max(loB, toAstro(born.range[0]));
      hiB = Math.min(hiB, toAstro(born.range[1]));
    }
    if (hi > Math.round(hiB) + 0.01 || lo < Math.round(loB) - 0.01) out.shownOutOfBounds.push(`${nm(g, id)}: ${lifeText(c)}`);
    const s = lifeText(c);
    if (/(^|[^\d])(\d+)–⁠?\2([^\d]|$)|между (\d+) и \4([^\d]|$)/.test(s)) out.sameYearSpan.push(`${nm(g, id)}: ${s}`);
    // ребёнок позже смерти отца больше чем на год — по показанным годам, вне напряжений
    const f = fatherOf(g, id);
    const fe = (g.parentsOf.get(id) ?? []).find((e) => e.kind === 'father');
    if (f && fe && !fe.gap && !isWide(b)) {
      const fc = P.get(f)!;
      const fl = lifeDates(fc);
      if (fl?.death && !isWide(fl.death) && shownPoint(b) > shownPoint(fl.death) + 1 && !inTension(res, f, id)) out.afterFatherDeath.push(`${nm(g, f)} → ${nm(g, id)}: ${shownPoint(b) - shownPoint(fl.death)}`);
    }
  }

  // П11: эпоха жизни
  const ep = res.epochs ?? [];
  const epSpan = (eid: string | null | undefined) => {
    const e = ep.find((x) => x.id === eid);
    return e ? [toAstro(e.start), toAstro(e.end)] : null;
  };
  for (const id of g.order) {
    const p = g.persons.get(id)!;
    const c = P.get(id)!;
    if (c.named) continue;
    const ch = p.chrono;
    let span: [number, number] | null = null;
    if (ch?.reign?.length) span = [toAstro(Math.min(...ch.reign.map((r) => r.start))), toAstro(Math.max(...ch.reign.map((r) => r.end)))];
    else if (ch?.active) span = [toAstro(ch.active.from), toAstro(ch.active.to)];
    if (span) {
      const es = epSpan(c.lifeEpoch);
      if (!es || es[0] > span[1] || es[1] < span[0]) out.activityEpoch.push(`${nm(g, id)}: ${c.lifeEpoch ?? '—'}`);
    }
    // засвидетельствованы только в 30 г.
    const years = [...(ch?.active ? [ch.active.from, ch.active.to] : []), ...(p.card?.events ?? []).filter((e) => e.year !== undefined).map((e) => e.year!)];
    if (years.length && years.every((y) => y === 30) && c.lifeEpoch === 'apostolic') out.passionApostolic.push(nm(g, id));
    // лица Евангелий вне родословий
    const first = firstRef(p);
    // названные только отцом (Иона, Алфей, Фануил) и лица со своими годами служения или царствования (Ирод — эпоха по ним)
    // не в счёт: их эпоха жизни законно «Межзаветное время»
    const actsInGospel = !ch?.reign?.length && !ch?.active && !((g.childrenOf.get(id)?.length ?? 0) > 0 && !years.length);
    if (first && actsInGospel && /^(Мф|Мк|Лк|Ин) /.test(first) && !/^Мф 1:|^Лк 3:(2[3-9]|3\d)/.test(first) && c.lifeEpoch === 'intertestamental') out.gospelIntertestamental.push(`${nm(g, id)} (${first})`);
  }

  // предупреждение: эпоха данных против скобки «время не установлено»
  for (const id of g.order) {
    const c = P.get(id)!;
    const de = g.persons.get(id)!.chrono?.epoch;
    if (c.cls !== 'epochal' || !de || !c.when || c.when.by === 'epoch') continue;
    const es = epSpan(de);
    if (es && (es[1] <= c.bLo || es[0] >= c.bHi)) out.epochVsBracket.push(`${nm(g, id)}: ${de}, скобка по «${c.when.by}»`);
  }

  // П12: «ок.» и «между»
  for (const id of g.order) {
    const c = P.get(id)!;
    const s = lifeText(c);
    if (!s) continue;
    if (c.cls === 'exact' || c.cls === 'calculated') {
      // «ок.» у года по числам — только если он приблизителен по данным; у смерти-оценки (died.range) «ок.» верно
      const ld = lifeDates(c)!;
      const bad = (/ок\.|между/.test(dateText(ld.birth)) && !c.bApprox) || (ld.death && !ld.death.est && /ок\./.test(dateText(ld.death)) && !c.dApprox && !c.bApprox);
      if (bad) out.approxOnCalc.push(`${nm(g, id)}: ${s}`);
    }
    if (c.cls === 'estimated') {
      const ld = lifeDates(c)!;
      if (isWide(ld.birth) && !/между/.test(s)) out.wideWithoutBetween.push(`${nm(g, id)}: ${s}`);
    }
  }

  // П15: напряжения
  const has = (t: { persons: string[] }, ...ids: string[]) => ids.every((x) => t.persons.includes(x));
  for (const t of res.tensions) {
    if (has(t, 'leviy') && (t.persons.includes('moisey') || t.persons.includes('iokhaveda') || t.persons.includes('amram'))) out.tz36.levi++;
    if ((t.persons.includes('salmon') || t.persons.includes('naasson')) && t.persons.includes('david')) out.tz36.salmon++;
    if (has(t, 'akhaz', 'ezekiya')) out.tz36.ahaz++;
    if (t.persons.includes('mardokhey')) out.tz36.mordecai++;
    if (/430/.test(t.text) && t.persons.some((x) => ['kaaf', 'amram', 'iokhaveda', 'moisey', 'aaron', 'mariam', 'leviy'].includes(x))) out.sojourn430++;
    if (has(t, 'vooz', 'ruf')) out.voozRuth++;
    if (/по возрастам, названным в тексте/.test(t.text)) {
      const own = t.persons.filter((x) => {
        const ch = g.persons.get(x)?.chrono;
        return ch?.born?.fatherAge !== undefined || ch?.born?.motherAge !== undefined || ch?.died?.age !== undefined || ch?.born?.year !== undefined || ch?.died?.year !== undefined;
      });
      if (own.length < t.persons.length) out.ageWordsWithoutNumbers.push(t.text.slice(0, 80));
    }
  }
  out.special['Деян 7:4'] = res.tensions.some((t) => t.refs.includes('Деян 7:4') && t.persons.includes('farra'));
  out.special['Иохаведа'] = res.tensions.some((t) => t.persons.includes('iokhaveda') && t.persons.includes('leviy'));
  out.special['Езекия — Осия'] = res.tensions.some((t) => t.persons.includes('ezekiya') && t.persons.includes('osiya-syn-ily'));
  out.special['Каинан'] = res.tensions.some((t) => t.persons.includes('kainan-syn-arfaksada'));
  out.special['Авиуд'] = res.tensions.some((t) => t.persons.includes('aviud-syn-zorovavelya'));
  return out;
}

/** Концы показанного года рождения: у широкой оценки — концы «между», у узкой — показанная точка. */
function shownEnds(v: DateVal): [number, number] {
  if (!isWide(v)) {
    const t = shownPoint(v);
    return [t, t];
  }
  return wideEnds(v);
}

function firstRef(p: Person): string | null {
  return p.card?.scripture?.first ?? p.parentRefs?.[0] ?? null;
}

export function runAudit(): Audit {
  const { persons, epochs } = loadData();
  const g = buildGraph(persons);
  const results = MODELS.map((m) => solveChronology(g, epochs, m.id));
  noteModelDifferences(results.map((r) => ({ model: r.model, tensions: r.tensions })));
  const models = results.map((r) => auditModel(g, r, r.model));
  const dep = modelDependence(g, results);
  const afterExodus: Record<string, number> = {};
  for (const info of dep.info) afterExodus[info.id] = info.afterExodus.reduce((s, x) => s + x.ids.length, 0);
  // синхронизмы без note
  const syncNoNote: string[] = [];
  const r0 = results[0];
  for (const id of g.order) {
    for (const r of g.persons.get(id)!.chrono?.reign ?? []) {
      for (const s of r.sync ?? []) {
        const w = g.persons.get(s.with)?.chrono?.reign;
        if (!w?.length) continue;
        const base = [...w].sort((a, b) => a.start - b.start)[0];
        const year = toAstro(base.start) + s.year - 1;
        const off = Math.min(...[r.start, ...(r.sole !== undefined ? [r.sole] : [])].map((x) => Math.abs(year - toAstro(x))));
        if (off > 1 && !s.note) syncNoNote.push(`${nm(g, id)}: ${s.year}-й год ${g.persons.get(s.with)!.name} (${s.refs.join('; ')}) — расхождение ${Math.round(year - toAstro(r.start))}`);
      }
    }
  }
  void r0;
  const t70 = results.find((r) => r.model === 'terah70')!;
  const y = (id: string) => Math.round(t70.persons.get(id)?.b ?? NaN);
  const terah70 = { aran: y('aran'), avraam: y('avraam'), nakhor: y('nakhor-syn-farry'), oldest: y('avraam') < y('aran') && y('avraam') < y('nakhor-syn-farry') };
  return { models, modelDep: { persons: dep.persons.size, afterExodus }, syncNoNote, terah70 };
}

if (process.argv[1]?.endsWith('chrono-audit.ts')) {
  const a = runAudit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(a, null, 1));
  } else {
    const show = (title: string, xs: string[]) => console.log(`  ${title}: ${xs.length}${xs.length ? ` — ${xs.slice(0, 4).join('; ')}` : ''}`);
    for (const m of a.models) {
      console.log(`модель ${m.model}: напряжений ${m.tensions}`);
      show('П8 числа текста не выполнены', m.numbers);
      show('П9 матери старше 45', m.mothers45);
      show('П9 жёны старше мужа > 15', m.wivesOlder15);
      show('П9 отцы моложе 16', m.fathers16);
      show('порядок рождения (order) нарушен', m.siblingOrder);
      show('П10 показанный год за границей текста', m.shownOutOfBounds);
      show('П10 ребёнок позже смерти отца > 1 года', m.afterFatherDeath);
      show('П10 «X–X»', m.sameYearSpan);
      show('П11 эпоха жизни не на годах служения', m.activityEpoch);
      show('П11 Страстная седмица — «Апостольская Церковь»', m.passionApostolic);
      show('П11 лица Евангелий — «Межзаветное время»', m.gospelIntertestamental);
      show('П12 «ок.» у годов по числам', m.approxOnCalc);
      show('П12 оценка шире 10 лет без «между»', m.wideWithoutBetween);
      show('предупр. эпоха данных вне скобки «время не установлено»', m.epochVsBracket);
      console.log(`  П15 ТЗ § 3.6: ${JSON.stringify(m.tz36)}; 430 лет — записей ${m.sojourn430}; «Вооз — Руфь» ${m.voozRuth}; ${JSON.stringify(m.special)}`);
      show('П15 «по возрастам, названным в тексте» без своих чисел', m.ageWordsWithoutNumbers);
    }
    console.log(`П13 годы меняются между моделями у ${a.modelDep.persons} лиц; после Исхода: ${JSON.stringify(a.modelDep.afterExodus)}`);
    console.log(`П14 синхронизмов без note: ${a.syncNoNote.length}${a.syncNoNote.length ? ` — ${a.syncNoNote.slice(0, 4).join('; ')}` : ''}`);
    console.log(`«Фарре 70»: Аран ${a.terah70.aran}, Аврам ${a.terah70.avraam}, Нахор ${a.terah70.nakhor}; Аврам старший — ${a.terah70.oldest}`);
  }
}
