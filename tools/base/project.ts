/**
 * Обратная проекция (docs/app/02-ДАННЫЕ.md, § 4): из базы base/ строится прежний вид data/. Для точного переноса
 * разница с прежними данными должна быть нулевой; после исправлений — только у лиц из списка исправлений.
 *
 * Подсказки (base/legacy/hints.json) хранят то, что новой модели не нужно, но нужно для побайтной сверки: была ли
 * степень достоверности родителей записана явно, порядок записей о супругах у каждой стороны, пустые списки,
 * прежние номера переименованных лиц.
 */
import type { Base } from './migrate.ts';
import { CARD_FIELDS, mapChronoIds } from './migrate.ts';
import type { Origin } from './types.ts';

export interface Hints {
  volumes: Record<string, { file: string }>;
  persons: Record<string, { pc?: true; mc?: true; sp?: [string, number][]; empty?: string[] }>;
  /** Новый номер → прежний, если он не равен «p-» + прежний. */
  idmap: Record<string, string>;
  lineOrder: string[];
}

/** Канонический вид для сравнения: ключи по алфавиту, порядок списков сохраняется. */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x,
  );
}

export function project(base: Base, hints: Hints) {
  const old = (id: string) => hints.idmap[id] ?? (id.startsWith('p-') ? id.slice(2) : id);
  const oldG = (id: string) => id.slice(2);
  const group = <T, K>(xs: T[], key: (x: T) => K) => {
    const m = new Map<K, T[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return m;
  };
  const originsBy = group(base.origins, (o) => o.child);
  const kinBy = group(base.kin, (k) => k.from);
  const memberBy = group(base.memberships.filter((m) => m.basis === 'legacy-layout'), (m) => m.actor);
  const chronoBy = new Map(base.chrono.map((c) => [c.actor, c.chrono]));
  const silentBy = group(base.nodata.filter((n) => n.kind === 'silent'), (n) => n.actor);
  const unionById = new Map(base.unions.map((u) => [u.id, u]));

  const vols = base.volumes.map((v) => ({
    volume: v.vol, title: v.title, scope: v.scope, file: v.file,
    persons: v.actors.map((a) => {
      const h = hints.persons[a.id] ?? {};
      const p: any = { id: old(a.id), name: a.names[0].form };
      if (a.disambig !== undefined) p.disambig = a.disambig;
      p.sex = a.sex;
      if (a.subkind === 'founder') p.kind = 'founder';
      else if (a.kind === 'people' || a.kind === 'clan') p.kind = a.kind;
      else if (a.kind === 'unnamed') p.unnamed = true;
      else if (a.kind !== 'human') throw new Error(`вид ${a.kind} не имеет прежнего вида: ${a.id}`);

      const os = originsBy.get(a.id) ?? [];
      const f = os.find((o) => o.primary && o.role === 'father');
      const m = os.find((o) => o.primary && o.role === 'mother');
      if (f) p.father = old(f.parent);
      if (m) p.mother = old(m.parent);
      const refs = (f ?? m)?.refs;
      if (refs?.length) p.parentRefs = refs;
      const pc = (f ?? m)?.cert;
      if (pc && (h.pc || pc !== 'scripture')) p.parentCert = pc;
      if (f && m && (h.mc || m.cert !== (p.parentCert ?? 'scripture'))) p.motherCert = m.cert;
      if (f?.kind === 'legal') p.fatherKind = 'legal';
      if (f?.gap) p.fatherGap = true;
      if (m?.gap) p.motherGap = true;
      const order = f?.order ?? m?.order;
      if (order !== undefined) p.order = order;
      const other = os.filter((o: Origin) => !o.primary);
      if (other.length) {
        p.otherParents = other.map((o) => ({
          id: old(o.parent), role: o.role, kind: o.kind, refs: o.refs, cert: o.cert, ...(o.note !== undefined && { note: o.note }),
        }));
      }
      if (h.sp) {
        p.spouses = h.sp.flatMap(([uid, i]) => {
          const u = unionById.get(uid);
          const t = u?.terms[i];
          if (!u || !t) return [];
          return [{
            id: old(a.id === u.husband ? u.wife : u.husband), kind: t.term, refs: t.refs,
            ...(t.cert !== undefined && { cert: t.cert }), ...(t.order !== undefined && { order: t.order }),
            ...(t.note !== undefined && { note: t.note }),
          }];
        });
      }
      const kin = kinBy.get(a.id);
      if (kin?.length) p.kin = kin.map((k) => ({ id: old(k.to), rel: k.rel, refs: k.refs, ...(k.cert !== undefined && { cert: k.cert }) }));
      if (a.roles !== undefined) p.roles = a.roles;
      const g = memberBy.get(a.id);
      if (g?.length !== 1) throw new Error(`у лица ${a.id} не одна область раскладки`);
      p.group = oldG(g[0].area);
      p.prominence = a.prominence;
      const ch = chronoBy.get(a.id);
      if (ch !== undefined) p.chrono = mapChronoIds(ch, old);

      const card: any = {};
      for (const as of a.facts) {
        const def = CARD_FIELDS[as.field];
        const value: any = structuredClone(as.value);
        if (as.cert !== undefined) value.cert = as.cert;
        if (as.field === 'met') value.id = old(value.id);
        if (def.list) (card[as.field] ??= []).push(value);
        else card[as.field] = value;
      }
      for (const e of h.empty ?? []) card[e] ??= [];
      if (a.names.length > 1) {
        card.altNames = a.names.slice(1).map((n) => ({ name: n.form, kind: n.type, refs: n.refs, ...(n.note !== undefined && { note: n.note }) }));
      }
      const silent = silentBy.get(a.id);
      if (silent?.length) card.silent = silent.map((n) => n.sec);
      p.card = card;
      return p;
    }),
  }));

  const lines: Record<string, any> = {};
  for (const [k, l] of Object.entries<any>(base.lines)) {
    const c = structuredClone(l);
    for (const s of c.persons) s.id = old(s.id);
    lines[k] = c;
  }
  const epochs = base.epochs.map((e) => {
    const c = structuredClone(e);
    for (const r of [c.startRule, c.endRule]) if (r?.person) r.person = old(r.person);
    return c;
  });
  const groups = base.areas.map((a) => ({
    id: oldG(a.id), name: a.name, kind: a.kind,
    ...(a.founder !== undefined && { founder: old(a.founder) }), ...(a.parent !== undefined && { parent: oldG(a.parent) }),
    ...(a.foreign !== undefined && { foreign: a.foreign }), ...(a.section !== undefined && { section: a.section }),
    ...(a.hue !== undefined && { hue: a.hue }),
  }));
  return { vols, lines, epochs, groups, anchors: base.anchors };
}
