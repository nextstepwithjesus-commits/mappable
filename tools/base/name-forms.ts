/**
 * Форма имени лица — уровень тождества (02 § 3.3.5 [4.3; 4.4]; задача К-18): проверки валидатора и выгрузка «Тождества лиц».
 *
 * Вид (б) — другое имя в параллельном перечне — одна карточка, а другая форма имени — уровня «выв.» (`cert: 'inference'`) со
 * стихами сравнения по сторонам (`compare`) и кодами проверок (`why`). Записи, которые держатся только на такой форме, несут
 * тождество по форме: рёбра и родство — `identity … inferred` с `form`; записи без концов — `idCert`. Вид (в) — своя карточка
 * и отношение `possibly-same` (base/relations.json). Переадресация лица — с основанием `said` или `parallel`.
 */
import { loadBible } from '../bible.ts';
import { parseRef, verseId } from '../../src/engine/books.ts';
import { norm, nameMatcher } from '../../src/engine/text.ts';
import { scriptureText } from './brackets.ts';
import type { Base } from './migrate.ts';
import { NAME_WHY_CODES, type Actor, type IdCert, type Name, type Ref, type TimeInput } from './types.ts';

type Err = (check: string, where: string, msg: string) => void;

const verseIds = (refs: Ref[]): string[] => {
  const bible = loadBible();
  return refs.flatMap((r) => {
    const p = parseRef(r, bible.chapterLength);
    return p && !p.chapterOnly ? p.verses.map(verseId) : [];
  });
};
const textOf = (id: string) => {
  const m = /^(.+) (\d+):(\d+)$/.exec(id);
  return m ? norm(scriptureText(m[1], +m[2], +m[3]) ?? '') : '';
};

/** Номер формы: `p-…#n<число>`. */
export const FORM_ID = /^(p-[a-z0-9]+(?:-[a-z0-9]+)*)#n(\d+)$/;

/** Формы «выв.» карточки. */
export const inferredForms = (a: Pick<Actor, 'names'>): Name[] => a.names.filter((n) => n.cert === 'inference');

/** Стихи формы: её ссылки и стихи сравнения стороны формы. */
export const formVerses = (n: Name): string[] => [...new Set(verseIds([...(n.refs ?? []), ...(n.compare?.form.refs ?? [])]))];

/**
 * Запись держится на форме «выв.» — узкое правило шагов D15-1…D15-11 (в коммите; поведение не меняется): все её стихи — стихи
 * этой формы, и ни одна форма «Писание» карточки в них не стоит. Возвращает форму или undefined.
 */
export function restsOnForm(a: Actor, refs: Ref[]): Name | undefined {
  const vs = [...new Set(verseIds(refs))];
  if (!vs.length) return undefined;
  const scripture = a.names.filter((n) => n.cert !== 'inference');
  for (const f of inferredForms(a)) {
    const fv = new Set(formVerses(f));
    if (!vs.every((v) => fv.has(v))) continue;
    if (vs.some((v) => scripture.some((n) => nameMatcher(n.form).test(textOf(v))))) continue;
    return f;
  }
  return undefined;
}

/**
 * Запись держится на форме «выв.» — по букве 02 § 3.3.5 (второй ключ Д-15 партии 2, № 7; решение координатора 3): в каждом её
 * стихе лицо названо только этой формой или не названо вовсе, и хотя бы в одном стихе форма стоит (её ссылка, стих сравнения
 * стороны формы или стих, где форма стоит вне скобок). Ни одна форма «Писание» карточки в стихах записи не стоит.
 */
export function restsOnFormLoose(a: Actor, refs: Ref[]): Name | undefined {
  const vs = [...new Set(verseIds(refs))];
  if (!vs.length) return undefined;
  const scripture = a.names.filter((n) => n.cert !== 'inference');
  if (vs.some((v) => scripture.some((n) => nameMatcher(n.form).test(textOf(v))))) return undefined;
  for (const f of inferredForms(a)) {
    const fv = new Set(formVerses(f));
    if (vs.some((v) => fv.has(v) || nameMatcher(f.form).test(textOf(v)))) return f;
  }
  return undefined;
}

/**
 * Записи, которым тождество по форме не нужно: заметки о тождестве (`kind: identification`) — слова о самом тождестве или о
 * тёзках («Не смешивать с…»), а не сведения о лице по стиху формы.
 */
export const formCertExempt = (f: { value?: unknown }) => (f.value as { kind?: string } | undefined)?.kind === 'identification';

export function validateNameForms(base: Base, err: Err, warn: Err) {
  const actors = new Map<string, Actor>();
  for (const v of base.volumes) for (const a of v.actors) actors.set(a.id, a);
  const formOf = new Map<string, { actor: Actor; name: Name }>();
  const possibly = new Set<string>();
  for (const r of base.relations ?? []) if (r.kind === 'possibly-same') possibly.add(r.a).add(r.b);

  for (const a of actors.values()) {
    const mains = a.names.filter((n) => n.type === 'main');
    if (mains.length !== 1) err('форма имени', a.id, `основных форм (type: main) ${mains.length}: нужна ровно одна (02 § 3.3.5)`);
    for (const m of mains) if (m.cert === 'inference') err('форма имени', a.id, `основная форма «${m.form}» — «выв.»: форма «выв.» основной не бывает (02 § 3.3.5)`);
    const ids = new Set<string>();
    for (const n of a.names) {
      const w = `${a.id} «${n.form}»`;
      if (n.id !== undefined) {
        const m = FORM_ID.exec(n.id);
        if (!m || m[1] !== a.id) err('форма имени', w, `номер формы «${n.id}» — вида ${a.id}#n<число> (02 § 3.3.5)`);
        if (ids.has(n.id) || formOf.has(n.id)) err('форма имени', w, `номер формы ${n.id} повторяется`);
        ids.add(n.id);
        formOf.set(n.id, { actor: a, name: n });
      }
      if (n.cert !== undefined && n.cert !== 'scripture' && n.cert !== 'inference') err('форма имени', w, `уровень формы «${n.cert}» — scripture или inference`);
      if (n.cert === 'inference') {
        if (!n.id) err('форма имени', w, 'у формы «выв.» нет номера (id): на неё ссылаются записи с тождеством по форме');
        if (!n.compare?.form?.refs?.length || !n.compare?.main?.refs?.length) err('форма имени', w, 'у формы «выв.» нет стихов сравнения обеих сторон (compare.form, compare.main; 02 § 3.3.5)');
        if (!n.why?.codes?.length) err('форма имени', w, 'у формы «выв.» нет кодов проверок (why.codes)');
        for (const c of n.why?.codes ?? []) if (!NAME_WHY_CODES.includes(c)) err('форма имени', w, `код проверки «${c}» не из закрытого списка (${NAME_WHY_CODES.join(', ')})`);
        // сторона формы — стихи, где стоит форма; сторона основной — где стоит основное имя
        const main = mains[0];
        for (const v of verseIds(n.compare?.form?.refs ?? [])) if (!nameMatcher(n.form).test(textOf(v))) err('форма имени', w, `в стихе сравнения ${v} формы «${n.form}» нет вне скобок`);
        if (main) for (const v of verseIds(n.compare?.main?.refs ?? [])) if (!nameMatcher(main.form).test(textOf(v))) err('форма имени', w, `в стихе сравнения ${v} основного имени «${main.form}» нет вне скобок`);
        if (n.compare?.count && !verseIds([n.compare.count.ref]).length) err('форма имени', w, `стих числа «${n.compare.count.ref}» — неверная ссылка`);
        if (n.why?.codes?.includes('named-number') && !n.compare?.count) err('форма имени', w, 'код named-number без стиха числа (compare.count)');
      } else {
        if (n.compare || n.why) err('форма имени', w, 'стихи сравнения и коды проверок — только у формы «выв.»');
      }
      if (n.tension !== undefined && !/^tn-[a-z0-9-]+$/.test(n.tension)) err('форма имени', w, `напряжение «${n.tension}» — номер tn-…`);
    }
    for (const n of a.names) if (n.with !== undefined && !a.names.some((x) => x.id === n.with)) err('форма имени', `${a.id} «${n.form}»`, `with: у карточки нет формы ${n.with}`);
    // уточнение карточки с формой «выв.»: без слов вида (а)
    if (inferredForms(a).length && /он же|иначе/i.test(a.disambig ?? '')) err('форма имени', a.id, `уточнение «${a.disambig}» — со словами «он же», «иначе»: это слова тождества «сказано», а форма — «выв.» (02 § 3.3.5)`);
    // форма без общего стиха с основным и без вида (cert или possibly-same) — после Д-15 ошибка (02 § 3.3.5 [4.4 по Р-5]; партия 2
    // разобрала все 208 таких форм — reviews/Д-15-партия-2-отчёт.md)
    if (a.kind !== 'unnamed' && a.kind !== 'group' && mains[0]) {
      for (const n of a.names) {
        if (n === mains[0] || n.cert !== undefined || n.type === 'patronymic' || n.type === 'title' || n.type === 'epithet') continue;
        if (possibly.has(a.id)) continue;
        const vs = verseIds(n.refs ?? []);
        if (!vs.length) continue;
        if (!vs.some((v) => nameMatcher(mains[0].form).test(textOf(v)))) err('форма без вида', `${a.id} «${n.form}»`, `нет общего стиха с основным именем «${mains[0].form}» и нет вида (cert или possibly-same): вид по 02 § 3.3.4 — (а) или то же имя другим написанием (cert: scripture), (б) (cert: inference), (в) — своя карточка и possibly-same`);
      }
    }
  }

  const idCertOk = (w: string, actor: string, x: IdCert | undefined) => {
    if (!x) return;
    const f = formOf.get(x.form);
    if (!f) return err('тождество по форме', w, `idCert: формы ${x.form} нет`);
    if (f.actor.id !== actor) err('тождество по форме', w, `idCert: форма ${x.form} — не этой карточки (${actor})`);
    if (f.name.cert !== 'inference') err('тождество по форме', w, `idCert: форма ${x.form} — не «выв.»`);
    if (!x.refs?.length) err('тождество по форме', w, 'idCert без стихов');
  };
  const identityOk = (w: string, id: { degree: string; form?: string } | undefined, end: string | undefined) => {
    if (!id) return;
    if (id.degree === 'inferred') {
      if (!id.form) return err('тождество по форме', w, 'тождество «весомо по имени» (inferred) без номера формы (form; 02 § 3.3.5)');
      const f = formOf.get(id.form);
      if (!f) return err('тождество по форме', w, `формы ${id.form} нет`);
      if (end && f.actor.id !== end) err('тождество по форме', w, `форма ${id.form} — не карточки конца ${end}`);
      if (f.name.cert !== 'inference') err('тождество по форме', w, `форма ${id.form} — не «выв.»`);
    } else if (id.form !== undefined) err('тождество по форме', w, `номер формы (form) — только при степени inferred, а степень «${id.degree}»`);
  };

  // записи, которые держатся на форме «выв.», несут тождество по форме (02 § 3.3.5)
  for (const a of actors.values()) {
    const hasInf = inferredForms(a).length > 0;
    for (const f of a.facts) {
      const w = `${a.id} § ${f.sec} ${f.field}${f.id ? ` (${f.id})` : ''}`;
      idCertOk(w, a.id, f.idCert);
      if (!hasInf || f.idCert || f.prov?.status === 'quarantine' || formCertExempt(f)) continue;
      const refs: Ref[] = [];
      const go = (x: unknown) => {
        if (Array.isArray(x)) return x.forEach(go);
        if (!x || typeof x !== 'object') return;
        const o = x as Record<string, unknown>;
        if (Array.isArray(o.refs)) refs.push(...(o.refs as Ref[]));
        if (typeof o.ref === 'string') refs.push(o.ref);
        for (const [k, y] of Object.entries(o)) if (k !== 'refs') go(y);
      };
      go(f.value);
      const form = restsOnFormLoose(a, refs);
      if (form) err('тождество по форме', w, `запись держится на форме «выв.» «${form.form}» (в стихах записи лицо названо только этой формой или не названо вовсе): нужен idCert (02 § 3.3.5)`);
    }
  }
  for (const m of base.memberships) {
    const w = `членство ${m.actor} → ${m.area}`;
    idCertOk(w, m.actor, m.idCert);
    const a = actors.get(m.actor);
    if (a && !m.idCert && m.refs.length && restsOnFormLoose(a, m.refs)) err('тождество по форме', w, 'членство держится на форме «выв.»: нужен idCert (02 § 3.3.5)');
  }
  for (const n of base.nodata) {
    const w = `нет сведений ${n.actor} § ${n.sec}`;
    idCertOk(w, n.actor, n.idCert);
    const a = actors.get(n.actor);
    if (a && !n.idCert && n.refs.length && restsOnFormLoose(a, n.refs)) err('тождество по форме', w, '«нет сведений» держится на форме «выв.»: нужен idCert (02 § 3.3.5)');
  }
  for (const s of base.stories ?? []) for (const x of s.actors ?? []) if (x.idCert && x.actor.startsWith('p-')) idCertOk(`${s.id} участник ${x.actor}`, x.actor, x.idCert);
  for (const o of base.origins) {
    const w = `${o.child} ← ${o.parent ?? '?'}`;
    identityOk(w, o.identity, o.identity?.of === 'parent' ? o.parent : o.child);
    // ребро, которое держится на форме «выв.» конца, — identity inferred (02 § 3.3.5)
    if (o.identity?.degree === 'inferred' || o.candidates?.length) continue;
    for (const [end, of] of [[o.parent, 'parent'], [o.child, 'child']] as const) {
      const a = end ? actors.get(end) : undefined;
      if (!a || !inferredForms(a).length) continue;
      const f = restsOnFormLoose(a, o.refs);
      if (f) err('тождество по форме', w, `ребро держится на форме «выв.» «${f.form}» (${of === 'parent' ? 'родителя' : 'ребёнка'}): нужно identity … inferred с form (02 § 3.3.5)`);
    }
  }
  for (const k of base.kin) identityOk(`${k.from} — ${k.to}`, k.identity, k.identity ? (k.identity.of === 'from' ? k.from : k.to) : undefined);
  for (const u of base.unions) for (const t of u.terms) identityOk(u.id, t.identity, t.identity ? (t.identity.of === 'husband' ? u.husband : u.wife) : undefined);

  // входы времени (Д6): вход, который держится на форме «выв.» лица или второго участника, — с idCert (02 § 3.3.5; Д-15)
  for (const c of base.chrono) {
    const inputs = (c.chrono as { inputs?: TimeInput[] } | undefined)?.inputs;
    if (!Array.isArray(inputs)) continue;
    inputs.forEach((t, i) => {
      const w = `время ${c.actor} вход ${i + 1} (${t.kind})`;
      if (t.idCert) {
        const f = formOf.get(t.idCert.form);
        if (!f) err('тождество по форме', w, `idCert: формы ${t.idCert.form} нет`);
        else {
          if (f.actor.id !== c.actor && f.actor.id !== t.other) err('тождество по форме', w, `idCert: форма ${t.idCert.form} — не лица и не второго участника`);
          if (f.name.cert !== 'inference') err('тождество по форме', w, `idCert: форма ${t.idCert.form} — не «выв.»`);
        }
        if (!t.idCert.refs?.length) err('тождество по форме', w, 'idCert без стихов');
        return;
      }
      for (const id of [c.actor, t.other]) {
        const a = id ? actors.get(id) : undefined;
        if (!a || !inferredForms(a).length || !t.refs?.length) continue;
        const f = restsOnFormLoose(a, t.refs);
        if (f) err('тождество по форме', w, `вход держится на форме «выв.» «${f.form}» (${a.id}): нужен idCert (02 § 3.3.5)`);
      }
    });
  }

  // переадресация лица — с основанием said или parallel (02 § 3.3.5)
  for (const r of base.redirects) {
    if (!r.from.startsWith('p-')) continue;
    // основание — у слияния; строка без основания — замечание: прежняя строка p-iliy-otets-marii — смена номера, а не слияние
    if (!r.basis) {
      warn('переадресация: основание', r.from, 'переадресация лица без основания (basis: said или parallel; 02 § 3.3.5): если это слияние, основание обязательно');
      continue;
    }
    const target = actors.get(r.to[0]);
    if (!target) continue;
    if (r.basis === 'parallel') {
      const rv = new Set(verseIds(r.refs));
      if (!inferredForms(target).some((n) => formVerses(n).some((v) => rv.has(v)))) err('переадресация', r.from, `основание parallel, а у карточки ${target.id} нет формы «выв.» со стихами переадресации (02 § 3.3.5)`);
    } else if (r.basis === 'said') {
      const ok = verseIds(r.refs).some((v) => target.names.filter((n) => nameMatcher(n.form).test(textOf(v))).length >= 2);
      if (!ok) err('переадресация', r.from, 'основание said: ни в одном стихе переадресации две формы карточки не стоят вместе (02 § 3.3.5)');
    } else err('переадресация', r.from, `основание «${r.basis}» — said или parallel`);
  }
}

// ---------- выгрузка «Тождества лиц» (02 § 3.3.6; К-19) ----------

/** Поле CSV по RFC 4180. */
const cell = (x: unknown) => {
  const s = x === undefined || x === null ? '' : String(x);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Столбцы выгрузки (08 § 16.5; 02 § 3.3.6). */
export const IDENTITY_COLUMNS = ['карточка', 'основное имя', 'форма', 'номер формы', 'уровень', 'стихи формы', 'стихи основной', 'стих числа', 'коды проверок', 'напряжение', 'вид', 'возможно, то же лицо', 'решения внешних баз'];

/**
 * Строки «Тождества лиц»: формы «выв.» (вид (б)) допущенных карточек и пары `possibly-same` (вид (в)). `ok` — допуск записи;
 * `part` — допуск части записи (формы). Решений внешних баз (записей `x-`) в базе ещё нет — столбец пуст.
 */
export function identityRows(base: Base, ok: (x: object) => boolean = () => true, part: (x: object) => boolean = () => true): string[][] {
  const rows: string[][] = [];
  const actors = new Map<string, Actor>();
  for (const v of base.volumes) for (const a of v.actors) if (ok(a)) actors.set(a.id, a);
  for (const a of actors.values()) {
    const main = a.names.find((n) => n.type === 'main');
    for (const n of inferredForms(a)) {
      if (!part(n)) continue;
      rows.push([a.id, main?.form ?? '', n.form, n.id ?? '', 'вывод', (n.compare?.form.refs ?? []).join('; '), (n.compare?.main.refs ?? []).join('; '), n.compare?.count?.ref ?? '', (n.why?.codes ?? []).join(', '), n.tension ?? '', 'б', '', '']);
    }
  }
  for (const r of base.relations ?? []) {
    if (r.kind !== 'possibly-same' || !ok(r)) continue;
    const a = actors.get(r.a);
    const b = actors.get(r.b);
    if (!a || !b) continue;
    rows.push([a.id, a.names[0].form, b.names[0].form, '', r.cert === 'interpretation' ? 'толкование' : 'вывод', '', '', '', '', '', 'в', b.id, '']);
  }
  return rows;
}

/** CSV «Тождества лиц»: разделитель «;», UTF-8 с BOM, кавычки по RFC 4180 (08 § 16.5). */
export function identityCsv(rows: string[][]): string {
  return `﻿${[IDENTITY_COLUMNS, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
