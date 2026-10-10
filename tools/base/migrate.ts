/**
 * Перенос прежних данных (data/) в базу приложения «Библия наглядно» (base/) — этап Д1 (docs/app/02-ДАННЫЕ.md, § 4, § 9).
 *
 *   npx tsx tools/base/migrate.ts            перенести, проверить обратной проекцией, записать base/
 *   npx tsx tools/base/migrate.ts --check    только проверить, ничего не записывать
 *
 * Порядок:
 *   1. Точный перенос: каждое прежнее поле — на своё место в новой модели (таблица полей — docs/app/data/таблица-полей.md).
 *   2. Обратная проекция точного переноса должна совпасть с прежними данными без единого отличия.
 *   3. Записанные исправления (corrections.ts): Лк 3:23, «мои они», Иосиф и Иисус Христос, справочные сведения, Каинан,
 *      наборы прочтений, линия Луки; затем дополнения (additions.ts) и правки Д3 по сверке контрольного набора
 *      (corrections-d3.ts) — они идут после дополнений.
 *   4. Обратная проекция после исправлений: каждое отличие должно относиться к лицу из списка исправлений.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type {
  Actor, ActorKind, Assertion, Area, BaseFile, CheckEntry, ChronoRecord, Correction, KinTerm, Membership, Name, NoData, Origin,
  Prov, ReadingSet, Redirect, Source, Union, UnionTerm,
} from './types.ts';
import { applyCorrections, makeCtx, STEPS, type Step } from './corrections.ts';
import { ADDITIONS } from './additions.ts';
import { STEPS_D3 } from './corrections-d3.ts';
import { project, canon, type Hints } from './project.ts';
import { loadBible } from '../bible.ts';
import { parseRef } from '../../src/engine/books.ts';
import { namesIn } from '../../src/engine/text.ts';
import { scriptureText } from './brackets.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'base');

/** Поля прежней карточки: номер раздела и вид (список записей или одна запись). */
export const CARD_FIELDS: Record<string, { sec: number; list: boolean }> = {
  original: { sec: 2, list: false },
  meaning: { sec: 3, list: false },
  status: { sec: 5, list: true },
  parentsNote: { sec: 6, list: true },
  lineage: { sec: 7, list: true },
  birth: { sec: 8, list: false },
  spousesNote: { sec: 9, list: true },
  childrenNote: { sec: 10, list: true },
  siblingsNote: { sec: 11, list: true },
  kinNote: { sec: 12, list: true },
  chronoNote: { sec: 13, list: true },
  met: { sec: 14, list: true },
  places: { sec: 15, list: true },
  offices: { sec: 16, list: true },
  events: { sec: 17, list: true },
  sayings: { sec: 18, list: true },
  withGod: { sec: 19, list: true },
  death: { sec: 20, list: false },
  messiahNote: { sec: 21, list: true },
  laterMentions: { sec: 22, list: true },
  scripture: { sec: 23, list: false },
  notes: { sec: 24, list: true },
};

/** Вся база в памяти. */
export interface Base {
  volumes: { vol: string; file: string; title: string; scope: string; actors: Actor[] }[];
  unions: Union[];
  origins: Origin[];
  kin: KinTerm[];
  readings: ReadingSet[];
  areas: Area[];
  memberships: Membership[];
  chrono: ChronoRecord[];
  nodata: NoData[];
  redirects: Redirect[];
  corrections: Correction[];
  lines: Record<string, any>;
  epochs: any[];
  anchors: any;
  /**
   * Происхождение файлов base/ по умолчанию (02 § 3.1: у файла — значение по умолчанию, у записи — уточнение): путь от
   * base/ («actors/04-abraham.json», «origins.json», «lines/luke.json») → prov файла. Нет — как у переноса: черновик.
   */
  files?: Record<string, Prov>;
  /** Реестр источников base/sources.json. */
  sources?: Source[];
  /** Журнал подписей проверки base/checks.json (Д3-2). */
  checks?: CheckEntry[];
}

export const pid = (old: string) => `p-${old}`;
const gid = (old: string) => `g-${old}`;
const WORD: Record<string, string> = { wife: 'жена', husband: 'муж', concubine: 'наложница' };

/** Лица внутри хронологических входов: смещения от другого лица и синхронизмы царствований. */
export function mapChronoIds(chrono: any, f: (id: string) => string): any {
  const c = structuredClone(chrono);
  for (const k of ['offset', 'notAfter', 'notBefore'] as const) if (c.born?.[k]?.from) c.born[k].from = f(c.born[k].from);
  for (const r of c.reign ?? []) for (const s of r.sync ?? []) s.with = f(s.with);
  return c;
}

function kindOf(p: any): { kind: ActorKind; subkind?: 'founder' } {
  const k = p.kind ?? 'person';
  if (k === 'founder') {
    if (p.unnamed) throw new Error(`безымянный «отец» города: ${p.id}`);
    return { kind: 'human', subkind: 'founder' };
  }
  if (k === 'people' || k === 'clan') {
    if (p.unnamed) throw new Error(`безымянный народ или род: ${p.id}`);
    return { kind: k };
  }
  if (k !== 'person') throw new Error(`неизвестный вид лица ${k}: ${p.id}`);
  return { kind: p.unnamed ? 'unnamed' : 'human' };
}

/** Лица в эпохах: правила границ, ключевые лица, правила событий. */
export function mapEpochIds(epoch: any, f: (id: string) => string): any {
  const c = structuredClone(epoch);
  for (const r of [c.startRule, c.endRule]) if (r?.person) r.person = f(r.person);
  if (c.keyPersons) c.keyPersons = c.keyPersons.map(f);
  for (const ev of c.events ?? []) if (ev.rule?.person) ev.rule.person = f(ev.rule.person);
  return c;
}

/** Точный перенос: ничего не исправляет, только раскладывает. */
export function toBase(vols: any[], groups: any[], epochs: any[], anchors: any, lines: Record<string, any>): { base: Base; hints: Hints } {
  const hints: Hints = { volumes: {}, persons: {}, idmap: {}, lineOrder: Object.keys(lines) };
  const base: Base = {
    volumes: [], unions: [], origins: [], kin: [], readings: [], areas: [], memberships: [], chrono: [], nodata: [],
    redirects: [], corrections: [], lines: {}, epochs: [], anchors: structuredClone(anchors),
  };
  const sexOf = new Map<string, string>();
  for (const v of vols) for (const p of v.persons) sexOf.set(p.id, p.sex);
  const unionById = new Map<string, Union>();

  for (const v of vols) {
    const actors: Actor[] = [];
    hints.volumes[v.volume] = { file: v.file };
    for (const p of v.persons) {
      const h: Hints['persons'][string] = {};
      const { kind, subkind } = kindOf(p);
      const card = p.card ?? {};
      // стих основного имени — первое упоминание (§ 23 прежней карточки)
      const names: Name[] = [{ form: p.name, type: 'main', refs: card.scripture?.first ? [card.scripture.first] : [] }];
      for (const a of card.altNames ?? []) names.push({ form: a.name, type: a.kind, refs: a.refs, ...(a.note !== undefined && { note: a.note }) });
      const facts: Assertion[] = [];
      for (const [field, val] of Object.entries<any>(card)) {
        if (field === 'altNames' || field === 'silent') continue;
        const def = CARD_FIELDS[field];
        if (!def) throw new Error(`неизвестное поле карточки ${field}: ${p.id}`);
        const items = def.list ? val : [val];
        if (!Array.isArray(items)) throw new Error(`поле ${field} не список: ${p.id}`);
        if (def.list && items.length === 0) h.empty = [...(h.empty ?? []), field];
        for (const it of items) {
          const value = structuredClone(it);
          let cert: any;
          if (value && typeof value === 'object' && 'cert' in value) {
            cert = value.cert;
            delete value.cert;
          }
          if (field === 'met') value.id = pid(value.id);
          const as: Assertion = { sec: def.sec, field, value, ...(cert !== undefined && { cert }) };
          facts.push(as);
        }
      }
      if (card.silent && card.silent.length === 0) h.empty = [...(h.empty ?? []), 'silent'];
      if (card.altNames && card.altNames.length === 0) h.empty = [...(h.empty ?? []), 'altNames'];
      for (const s of card.silent ?? []) base.nodata.push({ actor: pid(p.id), sec: s, kind: 'silent', refs: [], prov: { from: { vol: v.file } } });
      const from = { from: { vol: v.file } };
      const actor: Actor = {
        id: pid(p.id), kind, ...(subkind && { subkind }), sex: p.sex, names,
        ...(p.disambig !== undefined && { disambig: p.disambig }),
        ...(p.roles !== undefined && { roles: p.roles }),
        prominence: p.prominence, facts,
      };
      actors.push(actor);

      // происхождение: основные отец и мать, затем прочие в прежнем порядке
      if ('parentCert' in p) h.pc = true;
      if ('motherCert' in p) h.mc = true;
      if (p.father) {
        base.origins.push({
          child: pid(p.id), parent: pid(p.father), role: 'father', kind: p.fatherKind === 'legal' ? 'legal' : 'natural',
          refs: p.parentRefs ?? [], cert: p.parentCert ?? 'scripture', primary: true,
          ...(p.fatherGap && { gap: true }), ...(p.order !== undefined && { order: p.order }),
          ...(p.mother && { refsShared: true }), prov: from,
        });
      }
      if (p.mother) {
        base.origins.push({
          child: pid(p.id), parent: pid(p.mother), role: 'mother', kind: 'natural',
          refs: p.parentRefs ?? [], cert: p.motherCert ?? p.parentCert ?? 'scripture', primary: true,
          ...(p.motherGap && { gap: true }), ...(!p.father && p.order !== undefined && { order: p.order }),
          ...(p.father && { refsShared: true }), prov: from,
        });
      }
      if (!p.father && !p.mother && (p.parentRefs || p.order !== undefined || p.fatherGap || p.motherGap || p.fatherKind)) {
        throw new Error(`поля родителей без родителей: ${p.id}`);
      }
      for (const o of p.otherParents ?? []) {
        base.origins.push({
          child: pid(p.id), parent: pid(o.id), role: o.role, kind: o.kind, refs: o.refs, cert: o.cert, primary: false,
          ...(o.note !== undefined && { note: o.note }), prov: from,
        });
      }
      // союзы: брак, записанный с двух сторон, — один союз; у каждого обозначения — своя сторона
      if (p.spouses) {
        h.sp = [];
        for (const s of p.spouses) {
          const other = sexOf.get(s.id);
          if (!other) throw new Error(`супруг не найден: ${p.id} → ${s.id}`);
          if (other === p.sex) throw new Error(`супруги одного пола: ${p.id} → ${s.id}`);
          const [hu, wi] = p.sex === 'm' ? [p.id, s.id] : [s.id, p.id];
          const id = `u-${hu}--${wi}`;
          let u = unionById.get(id);
          if (!u) {
            u = { id, husband: pid(hu), wife: pid(wi), terms: [] };
            unionById.set(id, u);
            base.unions.push(u);
          }
          // вид союза отдельно от стороны записи: «жена» на записи мужа и «муж» на записи жены — один вид «брак»
          const t: UnionTerm = {
            kind: s.kind === 'concubine' ? 'concubine' : 'marriage', word: WORD[s.kind], side: p.sex === 'm' ? 'husband' : 'wife', refs: s.refs,
            ...(s.cert !== undefined && { cert: s.cert }), ...(s.note !== undefined && { note: s.note }),
            ...(s.order !== undefined && { order: s.order }), prov: from,
          };
          h.sp.push(id);
          u.terms.push(t);
        }
      }
      for (const k of p.kin ?? []) {
        base.kin.push({ from: pid(p.id), to: pid(k.id), rel: k.rel, refs: k.refs, ...(k.cert !== undefined && { cert: k.cert }), prov: from });
      }
      base.memberships.push({ actor: pid(p.id), area: gid(p.group), basis: 'legacy-layout', refs: [], prov: from });
      if (p.chrono) base.chrono.push({ actor: pid(p.id), chrono: mapChronoIds(p.chrono, pid), prov: from });
      if (Object.keys(h).length) hints.persons[pid(p.id)] = h;
    }
    base.volumes.push({ vol: v.volume, file: v.file, title: v.title, scope: v.scope, actors });
  }

  // союзы, известные только по общим детям: отец и мать названы, союз не записан. Вид «не назван», «выв.»;
  // стихи — только те, где названа мать (1Пар 3:10 у Соломона и Наамы её не называет). Исключение — ребро «по закону»
  // (Иисус Христос, 02 § 3.5): союз из него не выводится.
  const bible = loadBible();
  const actorById = new Map(base.volumes.flatMap((v) => v.actors.map((a) => [a.id, a] as const)));
  const names = (id: string) => actorById.get(id)!.names.map((n) => n.form);
  const mainText = (r: string) => {
    const p = parseRef(r, bible.chapterLength);
    return p ? p.verses.map((v) => scriptureText(v.book, v.chapter, v.verse) ?? '').join(' ') : '';
  };
  const byChild = new Map<string, Origin[]>();
  for (const o of base.origins) if (o.primary) byChild.set(o.child, [...(byChild.get(o.child) ?? []), o]);
  for (const [, os] of byChild) {
    const f = os.find((o) => o.role === 'father');
    const m = os.find((o) => o.role === 'mother');
    if (!f || !m || f.kind !== 'natural') continue;
    const id = `u-${f.parent!.slice(2)}--${m.parent!.slice(2)}`;
    let u = unionById.get(id);
    if (!u) {
      u = { id, husband: f.parent!, wife: m.parent!, terms: [] };
      unionById.set(id, u);
      base.unions.push(u);
    }
    if (u.terms.some((t) => t.kind !== 'not-stated')) continue;
    // безымянную мать (дочери Лота, мать Иеффая) имя не выдаёт: берутся стихи её ребра
    const named = m.refs.filter((r) => namesIn(mainText(r), names(m.parent!)));
    // и стихи, где назван отец: у Езекии и Хефцибы мать названа в 4Цар 21:1, отец — в других стихах (повторная проверка П11)
    const fatherNamed = f.refs.filter((r) => namesIn(mainText(r), names(f.parent!)));
    const refs = [...new Set([...(named.length ? named : m.refs), ...fatherNamed])];
    const t = u.terms.find((t) => t.kind === 'not-stated');
    if (t) t.refs = [...new Set([...t.refs, ...refs])];
    else u.terms.push({ kind: 'not-stated', refs, cert: 'inference', note: 'отец и мать названы у детей; сам союз текст не называет' });
  }
  for (const g of groups) {
    for (const k of Object.keys(g)) if (!['id', 'name', 'kind', 'section', 'founder', 'foreign', 'parent', 'hue'].includes(k)) throw new Error(`поле области ${k}`);
    base.areas.push({
      id: gid(g.id), name: g.name, kind: g.kind,
      ...(g.founder !== undefined && { founder: pid(g.founder) }), ...(g.parent !== undefined && { parent: gid(g.parent) }),
      ...(g.foreign !== undefined && { foreign: g.foreign }), ...(g.section !== undefined && { section: g.section }),
      ...(g.hue !== undefined && { hue: g.hue }),
    });
  }
  base.epochs = epochs.map((e) => mapEpochIds(e, pid));
  for (const [k, l] of Object.entries<any>(lines)) {
    const c = structuredClone(l);
    for (const s of c.persons) s.id = pid(s.id);
    base.lines[k] = c;
  }
  return { base, hints };
}

// ---------- чтение и запись ----------

export function loadOld() {
  const files = readdirSync(join(DATA, 'persons')).filter((f) => f.endsWith('.json')).sort();
  const vols = files.map((f) => ({ ...JSON.parse(readFileSync(join(DATA, 'persons', f), 'utf8')), file: f }));
  const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  const lines: Record<string, any> = {};
  for (const f of readdirSync(join(DATA, 'lines')).filter((f) => f.endsWith('.json')).sort()) lines[f.replace(/\.json$/, '')] = read(join('lines', f));
  return { vols, groups: read('groups.json'), epochs: read('epochs.json'), anchors: read('anchors.json'), lines };
}

/** Отличия прежних данных и проекции: по лицам, линиям, эпохам. */
export function diff(old: ReturnType<typeof loadOld>, proj: ReturnType<typeof project>) {
  const out: { what: string; id: string; fields?: string[] }[] = [];
  const oldP = new Map<string, any>();
  for (const v of old.vols) for (const p of v.persons) oldP.set(p.id, p);
  const newP = new Map<string, any>();
  for (const v of proj.vols) for (const p of v.persons) newP.set(p.id, p);
  for (const [id, p] of oldP) {
    const q = newP.get(id);
    if (canon(p) === canon(q)) continue;
    const fields: string[] = [];
    for (const k of new Set([...Object.keys(p), ...Object.keys(q ?? {})])) {
      if (k === 'card') {
        for (const c of new Set([...Object.keys(p.card ?? {}), ...Object.keys(q?.card ?? {})])) if (canon(p.card?.[c]) !== canon(q?.card?.[c])) fields.push(`card.${c}`);
      } else if (canon(p[k]) !== canon(q?.[k])) fields.push(k);
    }
    out.push({ what: 'лицо', id, fields });
  }
  for (const id of newP.keys()) if (!oldP.has(id)) out.push({ what: 'лицо (лишнее)', id });
  const oldOrder = old.vols.map((v: any) => [v.volume, v.title, v.scope, v.file, v.persons.map((p: any) => p.id).join(',')].join('|'));
  const newOrder = proj.vols.map((v: any) => [v.volume, v.title, v.scope, v.file, v.persons.map((p: any) => p.id).join(',')].join('|'));
  oldOrder.forEach((s: string, i: number) => s !== newOrder[i] && out.push({ what: 'том', id: old.vols[i].volume }));
  for (const k of Object.keys(old.lines)) if (canon(old.lines[k]) !== canon(proj.lines[k])) out.push({ what: 'линия', id: `line:${k}` });
  if (canon(old.epochs) !== canon(proj.epochs)) out.push({ what: 'эпохи', id: 'epochs' });
  if (canon(old.anchors) !== canon(proj.anchors)) out.push({ what: 'якоря', id: 'anchors' });
  if (canon(old.groups) !== canon(proj.groups)) out.push({ what: 'области', id: 'groups' });
  return out;
}

/** Вся база в памяти: точный перенос, исправления, дополнения (без проверок и записи). */
export function buildBase() {
  const old = loadOld();
  const { base, hints } = toBase(old.vols, old.groups, old.epochs, old.anchors, old.lines);
  applyCorrections(base, hints);
  applyAll(base, hints, [ADDITIONS, ...STEPS_D3]);
  return base;
}

function applyAll(base: Base, hints: Hints, steps: Step[]) {
  const ctx = makeCtx(base, hints);
  for (const s of steps) base.corrections.push({ id: s.id, ...s.run(ctx) });
}

/**
 * Ключи записей базы для сверки шагов исправления: каждое поле лица, каждое поле карточки, каждое ребро, союз, связь,
 * членство, «нет сведений», прочтение, переадресация, линия, эпоха, состав тома.
 */
export function recordKeys(base: Base): Map<string, string> {
  const m = new Map<string, string>();
  const put = (k: string, v: unknown) => {
    let key = k;
    for (let i = 2; m.has(key); i++) key = `${k}#${i}`;
    m.set(key, canon(v));
  };
  for (const v of base.volumes) {
    put(`volume:${v.file}`, [v.vol, v.title, v.scope, v.actors.map((a) => a.id)]);
    for (const a of v.actors) {
      for (const [k, x] of Object.entries(a)) if (k !== 'facts') put(`actor:${a.id}.${k}`, x);
      const byField = new Map<string, unknown[]>();
      for (const f of a.facts) byField.set(f.field, [...(byField.get(f.field) ?? []), f]);
      for (const [f, xs] of byField) put(`actor:${a.id}.facts.${f}`, xs);
    }
  }
  for (const o of base.origins) put(`origin:${o.child}|${o.parent ?? '?'}|${o.role}|${o.primary ? 'p' : 'o'}`, o);
  for (const u of base.unions) put(`union:${u.id}`, u);
  for (const k of base.kin) put(`kin:${k.from}|${k.to}|${k.rel}`, k);
  for (const x of base.memberships) put(`membership:${x.actor}|${x.area}`, x);
  for (const x of base.chrono) put(`chrono:${x.actor}`, x);
  for (const x of base.nodata) put(`nodata:${x.actor}|${x.sec}|${x.kind}`, x);
  for (const x of base.readings) put(`reading:${x.id}`, x);
  for (const x of base.redirects) put(`redirect:${x.from}`, x);
  for (const x of base.areas) put(`area:${x.id}`, x);
  for (const x of base.epochs) put(`epoch:${x.id}`, x);
  for (const [k, l] of Object.entries(base.lines)) put(`line:${k}`, l);
  put('anchors', base.anchors);
  return m;
}

/** Применяет шаг и возвращает изменённые ключи, которые не входят в его область. */
export function stepChanges(base: Base, hints: Hints, step: Step) {
  const before = recordKeys(base);
  base.corrections.push({ id: step.id, ...step.run(makeCtx(base, hints)) });
  const after = recordKeys(base);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
  const c = base.corrections.at(-1)!;
  const ids = step.byActors ? c.actors.map((x) => `p-${x}`) : [];
  const stray = changed.filter((k) => !step.scope.some((p) => k.includes(p)) || (step.byActors && !ids.some((id) => k.startsWith(`actor:${id}.`))));
  return { changed, stray };
}

function main() {
  const check = process.argv.includes('--check');
  const old = loadOld();
  const { base, hints } = toBase(old.vols, old.groups, old.epochs, old.anchors, old.lines);

  // 1. точный перенос: проекция совпадает с прежними данными
  const d0 = diff(old, project(base, hints));
  if (d0.length) {
    console.error(`!! точный перенос расходится с прежними данными (${d0.length}):`);
    for (const x of d0.slice(0, 20)) console.error(`   ${x.what} ${x.id} ${x.fields?.join(', ') ?? ''}`);
    process.exit(1);
  }
  console.log(`точный перенос: обратная проекция совпала с прежними данными (лиц ${base.volumes.reduce((n, v) => n + v.actors.length, 0)})`);

  // 2. исправления по одному: всё, что изменилось, — в объявленной области шага (и поля, которых не было в прежних данных)
  const steps: Record<string, string[]> = {};
  let bad = 0;
  for (const step of [...STEPS, ADDITIONS, ...STEPS_D3]) {
    const { changed, stray } = stepChanges(base, hints, step);
    steps[step.id] = changed;
    console.log(`   ${step.id}: изменено записей ${changed.length}${stray.length ? `, ВНЕ ОБЛАСТИ ${stray.length}: ${stray.slice(0, 8).join('; ')}` : ''}`);
    bad += stray.length;
  }
  // проекция: отличия от прежних данных по лицам и полям — для отчёта
  const d1 = diff(old, project(base, hints));
  console.log(`после исправлений: изменений вне областей шагов ${bad}; отличий в прежнем виде ${d1.length}`);
  if (process.argv.includes('--verbose')) for (const x of d1) console.log(`   ${x.what} ${x.id}${x.fields ? ` [${x.fields.join(', ')}]` : ''}`);
  if (bad) process.exit(1);
  if (check) return;

  // 3. запись
  const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  const at = new Date().toISOString().slice(0, 10);
  const prov = (vol: string): Prov => ({ by: 'перенос Д1 (координатор)', at, status: 'draft', from: { vol, commit } });
  const file = <T>(title: string, items: T[], vol = 'data'): BaseFile<T> => ({ schema: 1, title, prov: prov(vol), items });
  const write = (rel: string, v: unknown) => {
    const path = join(OUT, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(v, null, 1) + '\n');
  };
  for (const d of ['actors', 'lines', 'legacy']) rmSync(join(OUT, d), { recursive: true, force: true });
  for (const v of base.volumes) {
    write(`actors/${v.file}`, { ...file(v.title, v.actors, `data/persons/${v.file}`), vol: v.vol, scope: v.scope });
  }
  write('unions.json', file('Союзы', base.unions));
  write('origins.json', file('Происхождение', base.origins));
  write('kin.json', file('Родство словами Писания', base.kin));
  write('readings.json', file('Наборы взаимоисключающих прочтений', base.readings));
  write('areas.json', file('Области', base.areas, 'data/groups.json'));
  write('memberships.json', file('Членство', base.memberships));
  write('chrono.json', file('Хронологические входы (прежний вид; переработка — этап Д6)', base.chrono));
  write('nodata.json', file('Нет сведений', base.nodata));
  write('redirects.json', file('Переадресация номеров', base.redirects));
  write('corrections.json', file('Исправления при переносе', base.corrections));
  write('epochs.json', file('Эпохи', base.epochs, 'data/epochs.json'));
  write('anchors.json', { schema: 1, title: 'Внебиблейские опоры', prov: prov('data/anchors.json'), ...base.anchors });
  for (const [k, l] of Object.entries(base.lines)) write(`lines/${k}.json`, { schema: 1, prov: prov(`data/lines/${k}.json`), ...l });
  write('legacy/report.json', {
    schema: 1, title: 'Отчёт переноса: отличия обратной проекции от прежних данных и исправления, которые их объясняют', commit,
    exact: 'точный перенос совпал с прежними данными без отличий',
    note: 'steps — ключи записей, изменённые каждым шагом исправления (все в объявленной области шага); projection — отличия прежнего вида по лицам и полям',
    steps,
    projection: d1,
  });
  write('legacy/hints.json', { schema: 1, title: 'Подсказки обратной проекции (только для проверки переноса)', ...hints });
  console.log(`записано в base/ (коммит прежних данных ${commit})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
