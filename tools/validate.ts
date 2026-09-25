/**
 * Валидатор данных «Толедот».
 *
 *   npm run -s validate                         — все тома data/persons/*.json
 *   npm run -s validate -- data/persons/07-judah.json   — режим тома: проверяется один файл;
 *        ссылки на id из реестра, которых ещё нет в данных, допускаются (их создаст том-владелец).
 *   --quiet   — только сводка и ошибки
 *
 * Код выхода 1 при наличии ошибок.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadBible, ROOT } from './bible.ts';
import { parseRef, verseId } from '../src/engine/books.ts';
import { nameMatcher, norm, stripBrackets } from '../src/engine/text.ts';
import type { Person, Volume, Group, Epoch } from '../src/data/types.ts';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const files = args.filter((a) => !a.startsWith('--'));

const bible = loadBible();
const groups: Group[] = JSON.parse(readFileSync(join(ROOT, 'data/groups.json'), 'utf8'));
const epochs: Epoch[] = JSON.parse(readFileSync(join(ROOT, 'data/epochs.json'), 'utf8'));
const registry: { persons: { id: string; name: string; owner: string }[] } = JSON.parse(
  readFileSync(join(ROOT, 'data/registry.json'), 'utf8'),
);
const groupIds = new Set(groups.map((g) => g.id));
const epochIds = new Set(epochs.map((e) => e.id));
const regById = new Map(registry.persons.map((p) => [p.id, p]));

const personsDir = join(ROOT, 'data/persons');
const allFiles = existsSync(personsDir)
  ? readdirSync(personsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(personsDir, f))
  : [];
const volumeMode = files.length > 0;
const targetFiles = volumeMode ? files.map((f) => (f.startsWith('/') ? f : join(ROOT, f))) : allFiles;

interface Issue {
  level: 'error' | 'warn';
  where: string;
  msg: string;
}
const issues: Issue[] = [];
const err = (where: string, msg: string) => issues.push({ level: 'error', where, msg });
const warn = (where: string, msg: string) => issues.push({ level: 'warn', where, msg });

// ---------- загрузка ----------
const byId = new Map<string, Person & { __file: string; __vol: string }>();
const targetIds = new Set<string>();
for (const file of allFiles.concat(targetFiles.filter((f) => !allFiles.includes(f)))) {
  let vol: Volume;
  try {
    vol = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    // чужой том может как раз дописываться другим составителем — ошибка только для проверяемых файлов
    if (targetFiles.includes(file)) err(basename(file), `не разбирается JSON: ${(e as Error).message}`);
    continue;
  }
  const isTarget = targetFiles.includes(file);
  if (!vol || !Array.isArray(vol.persons) || typeof vol.volume !== 'string') {
    err(basename(file), 'ожидается объект { volume, title, scope, persons: [] }');
    continue;
  }
  for (const p of vol.persons) {
    if (!p || typeof p.id !== 'string') {
      if (isTarget) err(basename(file), `лицо без id: ${JSON.stringify(p).slice(0, 80)}`);
      continue;
    }
    if (byId.has(p.id)) {
      err(p.id, `дублирующийся id (файлы ${basename(byId.get(p.id)!.__file)} и ${basename(file)})`);
      continue;
    }
    byId.set(p.id, Object.assign(p, { __file: file, __vol: vol.volume }));
    if (isTarget) targetIds.add(p.id);
  }
}

// ---------- проверки ----------
const PERSON_KEYS = new Set([
  'id', 'name', 'disambig', 'sex', 'father', 'mother', 'parentRefs', 'parentCert', 'fatherKind', 'order',
  'otherParents', 'spouses', 'kin', 'roles', 'group', 'prominence', 'chrono', 'card', 'unnamed',
  '__file', '__vol',
]);
const CARD_KEYS = new Set([
  'original', 'meaning', 'altNames', 'status', 'parentsNote', 'lineage', 'birth', 'spousesNote', 'childrenNote',
  'siblingsNote', 'kinNote', 'chronoNote', 'met', 'places', 'offices', 'events', 'sayings', 'withGod', 'death',
  'messiahNote', 'laterMentions', 'scripture', 'notes',
]);
const ROLES = new Set([
  'patriarch', 'forefather', 'matriarch', 'king', 'queen', 'queen-mother', 'prince', 'high-priest', 'priest', 'levite',
  'prophet', 'judge', 'apostle', 'disciple', 'commander', 'official', 'scribe', 'musician', 'craftsman', 'shepherd',
  'tribal-leader', 'foreign-ruler', 'messiah',
]);
const CERTS = new Set(['scripture', 'inference', 'interpretation']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const verseTextCache = new Map<string, string[] | null>();
/** Возвращает тексты стихов ссылки или null, если ссылка неверна (ошибка записывается). */
function refTexts(where: string, ref: unknown): string[] | null {
  if (typeof ref !== 'string') {
    err(where, `ссылка не строка: ${JSON.stringify(ref)}`);
    return null;
  }
  if (verseTextCache.has(ref)) return verseTextCache.get(ref)!;
  const p = parseRef(ref, bible.chapterLength);
  let out: string[] | null = null;
  if (!p) {
    err(where, `неверный формат ссылки «${ref}» (нужно «Быт 5:3», «1Пар 3:17-19», «Мф 1:2,3»; книги — только 66 канонических)`);
  } else if (p.chapterOnly) {
    if (!bible.chapterLength(p.book, p.chapterOnly)) err(where, `нет главы: «${ref}»`);
    else warn(where, `ссылка на целую главу «${ref}» — лучше указать стихи`);
    out = [];
  } else {
    out = [];
    for (const v of p.verses) {
      const t = bible.verses.get(verseId(v));
      if (t === undefined) {
        err(where, `нет такого стиха в каноническом Синодальном тексте: ${verseId(v)} (из «${ref}»)`);
        out = null;
        break;
      }
      out.push(t);
    }
  }
  verseTextCache.set(ref, out);
  return out;
}

function checkRefs(where: string, refs: unknown, required = true): string[] {
  if (refs === undefined || refs === null) {
    if (required) err(where, 'нет ссылок (refs)');
    return [];
  }
  if (!Array.isArray(refs)) {
    err(where, 'refs должен быть массивом строк');
    return [];
  }
  if (required && refs.length === 0) err(where, 'пустой список ссылок');
  const texts: string[] = [];
  for (const r of refs) {
    const t = refTexts(where, r);
    if (t) texts.push(...t);
  }
  return texts;
}

function checkCert(where: string, c: unknown) {
  if (c !== undefined && !CERTS.has(c as string)) err(where, `неверный cert «${c}»`);
}

function checkFacts(where: string, facts: unknown) {
  if (facts === undefined) return;
  if (!Array.isArray(facts)) return err(where, 'ожидается массив фактов { text, refs }');
  facts.forEach((f, i) => {
    const w = `${where}[${i}]`;
    if (!f || typeof f.text !== 'string' || !f.text.trim()) err(w, 'нет text');
    checkRefs(w, f?.refs);
    checkCert(w, f?.cert);
  });
}

function namesOf(p: Person): string[] {
  const out = [p.name];
  for (const a of p.card?.altNames ?? []) if (a?.name) out.push(a.name);
  return out;
}

function mentions(texts: string[], names: string[]): boolean {
  const joined = norm(stripBrackets(texts.join(' ')));
  return names.some((n) => nameMatcher(n).test(joined));
}

function checkYear(where: string, y: unknown) {
  if (y === undefined) return;
  if (typeof y !== 'number' || !Number.isInteger(y)) return err(where, `год должен быть целым числом: ${y}`);
  if (y === 0) err(where, 'нулевого года нет: 1 г. до Р. Х. = -1, 1 г. по Р. Х. = 1');
  if (y < -4174 || y > 2040) err(where, `год вне шкалы: ${y}`);
}

const refExists = (id: string) => byId.has(id) || (volumeMode && regById.has(id));

for (const [id, p] of byId) {
  if (!targetIds.has(id)) continue;
  const W = id;
  for (const k of Object.keys(p)) if (!PERSON_KEYS.has(k)) err(W, `неизвестное поле «${k}»`);
  if (!ID_RE.test(id)) err(W, 'id: только латиница в нижнем регистре, цифры и дефис');
  if (typeof p.name !== 'string' || !/^[А-ЯЁа-яё]/.test(p.name)) err(W, 'name: имя по-русски обязательно');
  if (p.sex !== 'm' && p.sex !== 'f') err(W, 'sex: «m» или «f»');
  if (!groupIds.has(p.group)) err(W, `group: неизвестная область «${p.group}» (см. data/groups.json)`);
  if (![1, 2, 3, 4, 5].includes(p.prominence as number)) err(W, 'prominence: целое 1–5');

  const reg = regById.get(id);
  if (reg && reg.owner !== p.__vol) err(W, `id из реестра принадлежит тому ${reg.owner}, а создан в томе ${p.__vol}`);
  if (reg && reg.name !== p.name) warn(W, `имя «${p.name}» отличается от реестра «${reg.name}» — проверьте форму`);

  const names = namesOf(p);
  const allTexts: string[] = [];

  // родители
  for (const role of ['father', 'mother'] as const) {
    const pid = p[role];
    if (pid === undefined || pid === null) continue;
    if (typeof pid !== 'string' || !refExists(pid)) {
      err(W, `${role}: нет лица «${pid}»`);
      continue;
    }
    const par = byId.get(pid);
    if (par && role === 'father' && par.sex !== 'm') err(W, `father «${pid}» — не мужчина`);
    if (par && role === 'mother' && par.sex !== 'f') err(W, `mother «${pid}» — не женщина`);
    if (pid === id) err(W, `${role}: ссылка на себя`);
  }
  if (p.father || p.mother) {
    const texts = checkRefs(`${W}.parentRefs`, p.parentRefs);
    allTexts.push(...texts);
    if (texts.length && !mentions(texts, names)) warn(W, `имя не найдено в стихах parentRefs (${(p.parentRefs ?? []).join('; ')})`);
    checkCert(`${W}.parentCert`, p.parentCert);
  } else if (p.parentRefs && p.parentRefs.length) {
    warn(W, 'parentRefs без father/mother');
  }
  if (p.fatherKind !== undefined && p.fatherKind !== 'natural' && p.fatherKind !== 'legal') err(W, 'fatherKind: natural | legal');
  if (p.order !== undefined && (!Number.isInteger(p.order) || p.order < 1)) err(W, 'order: целое ≥ 1');

  (p.otherParents ?? []).forEach((o, i) => {
    const w = `${W}.otherParents[${i}]`;
    if (!o || !refExists(o.id)) err(w, `нет лица «${o?.id}»`);
    if (o.role !== 'father' && o.role !== 'mother') err(w, 'role: father | mother');
    if (!['legal', 'adoptive', 'by-luke', 'ancestor', 'levirate', 'alternative'].includes(o.kind)) err(w, `kind «${o.kind}»`);
    if (!o.cert) err(w, 'cert обязателен');
    checkCert(w, o.cert);
    allTexts.push(...checkRefs(w, o.refs));
  });

  (p.spouses ?? []).forEach((s, i) => {
    const w = `${W}.spouses[${i}]`;
    if (!s || !refExists(s.id)) return err(w, `нет лица «${s?.id}»`);
    if (!['wife', 'concubine', 'husband'].includes(s.kind)) err(w, `kind «${s.kind}»`);
    const sp = byId.get(s.id);
    if (sp && s.kind === 'husband' && sp.sex !== 'm') err(w, 'husband — не мужчина');
    if (sp && s.kind !== 'husband' && sp.sex !== 'f') err(w, 'wife/concubine — не женщина');
    checkCert(w, s.cert);
    const texts = checkRefs(w, s.refs);
    allTexts.push(...texts);
    if (texts.length && sp && !mentions(texts, names.concat(namesOf(sp)))) warn(w, 'в стихах нет имени ни одного из супругов');
  });

  (p.kin ?? []).forEach((k, i) => {
    const w = `${W}.kin[${i}]`;
    if (!k || !refExists(k.id)) err(w, `нет лица «${k?.id}»`);
    if (!k.rel || typeof k.rel !== 'string') err(w, 'rel обязателен (по-русски)');
    checkCert(w, k.cert);
    allTexts.push(...checkRefs(w, k.refs));
  });

  for (const r of p.roles ?? []) if (!ROLES.has(r)) err(W, `неизвестная роль «${r}»`);

  // хронология
  const c = p.chrono;
  if (c) {
    for (const k of Object.keys(c)) if (!['born', 'died', 'reign', 'active', 'epoch'].includes(k)) err(W, `chrono: неизвестное поле «${k}»`);
    if (c.epoch !== undefined && !epochIds.has(c.epoch)) err(W, `chrono.epoch: нет эпохи «${c.epoch}»`);
    if (c.born) {
      const b = c.born;
      checkYear(`${W}.chrono.born.year`, b.year);
      if (b.fatherAge !== undefined && (typeof b.fatherAge !== 'number' || b.fatherAge < 5 || b.fatherAge > 600)) err(W, 'born.fatherAge вне 5–600');
      if (b.motherAge !== undefined && (typeof b.motherAge !== 'number' || b.motherAge < 5 || b.motherAge > 130)) err(W, 'born.motherAge вне 5–130');
      if (b.offset && (!refExists(b.offset.from) || typeof b.offset.years !== 'number')) err(W, 'born.offset: { from: id, years: число }');
      if (b.range) { checkYear(W, b.range[0]); checkYear(W, b.range[1]); if (b.range[0] > b.range[1]) err(W, 'born.range: начало > конца'); }
      const hasData = b.year !== undefined || b.fatherAge !== undefined || b.motherAge !== undefined || b.offset;
      if (hasData) checkRefs(`${W}.chrono.born`, b.refs);
      else if (b.refs) checkRefs(`${W}.chrono.born`, b.refs, false);
      checkCert(`${W}.chrono.born`, b.cert);
    }
    if (c.died) {
      const d = c.died;
      checkYear(`${W}.chrono.died.year`, d.year);
      if (d.age !== undefined && (typeof d.age !== 'number' || d.age < 0 || d.age > 1000)) err(W, 'died.age вне 0–1000');
      if (d.range) { checkYear(W, d.range[0]); checkYear(W, d.range[1]); if (d.range[0] > d.range[1]) err(W, 'died.range: начало > конца'); }
      if (d.year !== undefined || d.age !== undefined) checkRefs(`${W}.chrono.died`, d.refs);
      checkCert(`${W}.chrono.died`, d.cert);
    }
    (c.reign ?? []).forEach((r, i) => {
      const w = `${W}.chrono.reign[${i}]`;
      checkYear(w, r.start);
      checkYear(w, r.end);
      if (r.start > r.end) err(w, 'start > end');
      if (!r.over) err(w, 'over обязателен');
      checkRefs(w, r.refs);
    });
    if (c.active) {
      checkYear(`${W}.chrono.active`, c.active.from);
      checkYear(`${W}.chrono.active`, c.active.to);
      if (c.active.from > c.active.to) err(W, 'active: from > to');
      checkRefs(`${W}.chrono.active`, c.active.refs);
    }
  }

  // карточка
  const card = p.card;
  if (card) {
    for (const k of Object.keys(card)) if (!CARD_KEYS.has(k)) err(W, `card: неизвестный раздел «${k}»`);
    if (card.original && (!card.original.script || !card.original.translit)) err(W, 'card.original: нужны script и translit');
    if (card.meaning) {
      if (!card.meaning.text) err(W, 'card.meaning.text');
      if (card.meaning.refs) checkRefs(`${W}.card.meaning`, card.meaning.refs, false);
    }
    (card.altNames ?? []).forEach((a, i) => {
      const w = `${W}.card.altNames[${i}]`;
      if (!a.name) err(w, 'name');
      const texts = checkRefs(w, a.refs);
      if (texts.length && !mentions(texts, [a.name])) warn(w, `форма «${a.name}» не найдена в указанных стихах`);
    });
    for (const k of ['status', 'parentsNote', 'lineage', 'spousesNote', 'childrenNote', 'siblingsNote', 'kinNote', 'chronoNote', 'withGod', 'messiahNote', 'laterMentions'] as const) {
      checkFacts(`${W}.card.${k}`, card[k]);
    }
    if (card.birth) checkFacts(`${W}.card.birth.facts`, card.birth.facts);
    if (card.death) {
      checkFacts(`${W}.card.death.facts`, card.death.facts);
      checkFacts(`${W}.card.death.burial`, card.death.burial);
    }
    (card.met ?? []).forEach((m, i) => {
      const w = `${W}.card.met[${i}]`;
      if (!refExists(m.id)) err(w, `нет лица «${m.id}»`);
      checkRefs(w, m.refs);
    });
    (card.places ?? []).forEach((pl, i) => {
      const w = `${W}.card.places[${i}]`;
      if (!pl.name) err(w, 'name');
      if (!['birth', 'residence', 'travel', 'death', 'burial', 'other'].includes(pl.role)) err(w, `role «${pl.role}»`);
      checkRefs(w, pl.refs);
    });
    (card.offices ?? []).forEach((o, i) => {
      const w = `${W}.card.offices[${i}]`;
      if (!o.title) err(w, 'title');
      checkYear(w, o.from);
      checkYear(w, o.to);
      checkRefs(w, o.refs);
    });
    (card.events ?? []).forEach((e, i) => {
      const w = `${W}.card.events[${i}]`;
      if (!e.text) err(w, 'text');
      checkYear(w, e.year);
      checkCert(w, e.cert);
      allTexts.push(...checkRefs(w, e.refs));
    });
    (card.sayings ?? []).forEach((s, i) => {
      const w = `${W}.card.sayings[${i}]`;
      const texts = refTexts(w, s.ref);
      if (!s.quote) return err(w, 'quote');
      if (texts) {
        const clean = (t: string) => norm(t).replace(/[«»"„“”'’`.,;:!?()\-–—…]/g, ' ').replace(/\s+/g, ' ').trim();
        const hay = clean(texts.join(' '));
        const needle = clean(s.quote);
        if (!hay.includes(needle)) err(w, `цитата не совпадает с текстом ${s.ref}: «${s.quote.slice(0, 60)}…»`);
      }
    });
    if (card.scripture) {
      const s = card.scripture;
      if (s.first) allTexts.push(...(refTexts(`${W}.card.scripture.first`, s.first) ?? []));
      if (s.key) allTexts.push(...checkRefs(`${W}.card.scripture.key`, s.key, false));
      if (s.all) checkRefs(`${W}.card.scripture.all`, s.all, false);
    }
    (card.notes ?? []).forEach((n, i) => {
      const w = `${W}.card.notes[${i}]`;
      if (!['textual', 'interpretation', 'identification', 'chronology'].includes(n.kind)) err(w, `kind «${n.kind}»`);
      if (!n.text) err(w, 'text');
      if (n.refs) checkRefs(w, n.refs, false);
    });
    const filled = Object.keys(card).length;
    if (p.prominence >= 4 && filled < 10) warn(W, `значимость ${p.prominence}, а заполнено только ${filled} разделов карточки`);
  } else if (p.prominence >= 3) {
    warn(W, `значимость ${p.prominence} без карточки`);
  }
  if (!(p as { unnamed?: boolean }).unnamed && allTexts.length && !mentions(allTexts, names)) {
    warn(W, 'имя лица не найдено ни в одном из стихов, приведённых для его связей и событий');
  }
  if (!p.father && !p.mother && !(p.spouses?.length) && !(p.kin?.length) && !(p.otherParents?.length)) {
    // допускается для лиц без родословия, но должно быть осознанным
    const hasChild = [...byId.values()].some((q) => q.father === id || q.mother === id);
    if (!hasChild) warn(W, 'лицо без единой родственной связи');
  }
}

// ---------- граф: циклы, дубли ----------
{
  const state = new Map<string, number>();
  const visit = (id: string, path: string[]): void => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      err(id, `цикл в родословии: ${path.concat(id).join(' → ')}`);
      return;
    }
    state.set(id, 1);
    const p = byId.get(id);
    if (p) for (const par of [p.father, p.mother]) if (par && byId.has(par)) visit(par, path.concat(id));
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);

  const seen = new Map<string, string>();
  for (const [id, p] of byId) {
    if (!p.father) continue;
    const key = `${norm(p.name)}|${p.father}`;
    if (seen.has(key) && (targetIds.has(id) || targetIds.has(seen.get(key)!))) warn(id, `возможный дубликат: «${seen.get(key)}» (то же имя и отец)`);
    else seen.set(key, id);
  }
}

// ---------- эпохи ----------
if (!volumeMode) {
  for (const e of epochs) {
    for (const k of e.keyPersons) if (!byId.has(k)) warn(`epoch:${e.id}`, `ключевое лицо «${k}» отсутствует в данных`);
    checkRefs(`epoch:${e.id}`, e.refs);
    e.events.forEach((ev, i) => checkRefs(`epoch:${e.id}.events[${i}]`, ev.refs));
  }
  for (const r of registry.persons) if (!byId.has(r.id)) warn(`registry:${r.id}`, `лицо из реестра (том ${r.owner}) ещё не создано`);
}

// ---------- вывод ----------
const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');
if (!quiet) for (const i of warns) console.log(`предупр.  ${i.where}: ${i.msg}`);
for (const i of errors) console.log(`ОШИБКА    ${i.where}: ${i.msg}`);
console.log(
  `\n${volumeMode ? 'Том(а): ' + targetFiles.map((f) => basename(f)).join(', ') + ' · ' : ''}лиц проверено: ${targetIds.size}` +
    ` (всего в данных: ${byId.size}) · ошибок: ${errors.length} · предупреждений: ${warns.length}`,
);
process.exit(errors.length ? 1 : 0);
